/**
 * REST API routes for project and session data.
 * All data is read from JSONL files on disk — no in-memory caching.
 */
import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseJsonlContent,
  parseCompactionBoundaries,
  extractSessionId,
  extractAgentIds,
  parseSubAgentContent,
} from '../../shared/parser';
import { computeContextHealth } from '../../shared/health';
import type { ProjectSummary, SessionSummary } from '../../shared/types';

/** Build the Express router, scoped to a given Claude home directory. */
export function buildApiRouter(claudeHome: string): Router {
  const router = Router();
  const projectsDir = path.join(claudeHome, 'projects');

  // ---------------------------------------------------------------------------
  // GET /api/projects
  // ---------------------------------------------------------------------------

  /**
   * List all Claude Code projects.
   * Each subdirectory in ~/.claude/projects/ is a project.
   */
  router.get('/projects', async (_req, res) => {
    try {
      let entries: string[];
      try {
        entries = await fs.readdir(projectsDir);
      } catch {
        // Directory doesn't exist — return empty list gracefully
        res.json([]);
        return;
      }

      const projects: ProjectSummary[] = [];

      for (const entry of entries) {
        const entryPath = path.join(projectsDir, entry);
        let stat;
        try {
          stat = await fs.stat(entryPath);
        } catch {
          continue;
        }
        if (!stat.isDirectory()) continue;

        let files: string[] = [];
        try {
          files = await fs.readdir(entryPath);
        } catch {
          // Skip unreadable directories
        }
        const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
        const sessionCount = jsonlFiles.length;

        // Find the most recently modified session file
        let latestMtime = stat.mtime;
        for (const jf of jsonlFiles) {
          try {
            const jstat = await fs.stat(path.join(entryPath, jf));
            if (jstat.mtime > latestMtime) latestMtime = jstat.mtime;
          } catch {
            // skip
          }
        }

        const decodedPath = entry.replace(/-/g, '/');

        projects.push({
          slug: entry,
          path: decodedPath,
          sessionCount,
          lastModified: latestMtime.toISOString(),
        });
      }

      // Sort by most recently modified first
      projects.sort((a, b) => b.lastModified.localeCompare(a.lastModified));

      res.json(projects);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/sessions/:slug
  // ---------------------------------------------------------------------------

  /**
   * List sessions for a specific project, sorted by lastModified descending.
   */
  router.get('/sessions/:slug', async (req, res) => {
    const { slug } = req.params;
    const projectDir = path.join(projectsDir, slug);

    try {
      let files: string[];
      try {
        files = await fs.readdir(projectDir);
      } catch {
        res.status(404).json({ error: `Project not found: ${slug}` });
        return;
      }

      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
      const sessions: SessionSummary[] = [];

      for (const file of jsonlFiles) {
        const filePath = path.join(projectDir, file);
        const id = file.replace(/\.jsonl$/, '');

        let stat;
        try {
          stat = await fs.stat(filePath);
        } catch {
          continue;
        }

        let startTime: string | null = null;
        let rowCount = 0;
        try {
          const content = await fs.readFile(filePath, 'utf8');
          // Extract startTime from the first non-empty line's timestamp field
          const firstLine = content.split('\n').find((l) => l.trim() !== '');
          if (firstLine) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(firstLine);
            } catch {
              // skip
            }
            if (
              typeof parsed === 'object' &&
              parsed !== null &&
              !Array.isArray(parsed) &&
              'timestamp' in parsed &&
              typeof (parsed as Record<string, unknown>)['timestamp'] === 'string'
            ) {
              startTime = (parsed as Record<string, unknown>)['timestamp'] as string;
            }
          }
          rowCount = parseJsonlContent(content).length;
        } catch {
          // Unreadable file — still include with null startTime
        }

        sessions.push({
          id,
          projectSlug: slug,
          filePath,
          startTime,
          lastModified: stat.mtime.toISOString(),
          rowCount,
        });
      }

      // Sort by lastModified descending (most recent first)
      sessions.sort((a, b) => b.lastModified.localeCompare(a.lastModified));

      res.json(sessions);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/session/:slug/:id
  // ---------------------------------------------------------------------------

  /**
   * Read and parse a specific session file.
   * Returns rows, compaction boundaries, health score, and session ID.
   */
  router.get('/session/:slug/:id', async (req, res) => {
    const { slug, id } = req.params;
    const filePath = path.join(projectsDir, slug, `${id}.jsonl`);

    try {
      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf8');
      } catch {
        res.status(404).json({ error: `Session not found: ${slug}/${id}` });
        return;
      }

      const rows = parseJsonlContent(content);
      const boundaries = parseCompactionBoundaries(content);
      const health = computeContextHealth(rows, boundaries.length);
      const sessionId = extractSessionId(content) ?? id;

      // Load sub-agent JSONL files and attach as children to matching agent rows
      const subagentsDir = path.join(projectsDir, slug, id, 'subagents');
      let subagentsDirExists = false;
      try {
        const subagentStat = await fs.stat(subagentsDir);
        subagentsDirExists = subagentStat.isDirectory();
      } catch {
        // Subagents directory doesn't exist — this is normal for old sessions
      }

      if (subagentsDirExists) {
        // Build a map of tool_use_id → agentId from the parent session content
        const agentIdMap = extractAgentIds(content);

        for (const [toolUseId, agentId] of agentIdMap) {
          const subAgentFile = path.join(subagentsDir, `agent-${agentId}.jsonl`);
          let subAgentContent: string;
          try {
            subAgentContent = await fs.readFile(subAgentFile, 'utf8');
          } catch {
            // Sub-agent file missing — skip gracefully
            continue;
          }

          const subAgentRows = parseSubAgentContent(subAgentContent);

          // Find the matching agent row in the parent rows by tool_use_id (row.id)
          const parentRow = rows.find((r) => r.id === toolUseId);
          if (parentRow) {
            // Attach parsed sub-agent rows as children, tagging each with the parent row id
            parentRow.children = subAgentRows.map((r) => ({
              ...r,
              parentAgentId: parentRow.id,
            }));
          }
        }
      }

      res.json({ rows, compactionBoundaries: boundaries, health, sessionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
