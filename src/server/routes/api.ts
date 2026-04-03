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

/**
 * Read ~/.claude/sessions/*.json and return a Set of sessionIds
 * that have a live process (verified via kill(pid, 0)).
 * The registry's sessionId matches the JSONL filename (not the sessionId field inside the JSONL).
 */
async function getRunningSessionIds(claudeHome: string): Promise<Set<string>> {
  const sessionsDir = path.join(claudeHome, 'sessions');
  const running = new Set<string>();
  let files: string[];
  try {
    files = await fs.readdir(sessionsDir);
  } catch {
    return running;
  }
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(sessionsDir, file), 'utf8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      const pid = typeof data['pid'] === 'number' ? data['pid'] : null;
      const sid = typeof data['sessionId'] === 'string' ? (data['sessionId'] as string) : null;
      if (pid !== null && sid) {
        try {
          process.kill(pid, 0); // check if process is alive
          running.add(sid);
        } catch {
          // process not running
        }
      }
    } catch {
      // skip malformed files
    }
  }
  return running;
}

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

      const runningSessions = await getRunningSessionIds(claudeHome);
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

        // Count how many sessions in this project have a live process or recent activity
        let activeSessionCount = 0;
        for (const jf of jsonlFiles) {
          const sid = jf.replace(/\.jsonl$/, '');
          if (runningSessions.has(sid)) { activeSessionCount++; continue; }
          try {
            const jstat = await fs.stat(path.join(entryPath, jf));
            if (Date.now() - jstat.mtime.getTime() < 120_000) activeSessionCount++;
          } catch { /* skip */ }
        }

        projects.push({
          slug: entry,
          path: decodedPath,
          sessionCount,
          activeSessionCount,
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

      const runningSessions = await getRunningSessionIds(claudeHome);

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
        let permissionMode: import('../../shared/types.ts').PermissionMode = null;
        let isRemoteControlled = false;
        let isActive = false;
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const lines = content.split('\n');
          // Extract metadata from lines (scan first 50 for speed)
          const scanLimit = Math.min(lines.length, 50);
          for (let i = 0; i < scanLimit; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(line) as Record<string, unknown>;
            } catch {
              continue;
            }
            // Extract startTime from first record with timestamp
            if (startTime === null && typeof parsed['timestamp'] === 'string') {
              startTime = parsed['timestamp'];
            }
            // Extract permissionMode from user records
            if (parsed['type'] === 'user' && 'permissionMode' in parsed && permissionMode === null) {
              permissionMode = (parsed['permissionMode'] as import('../../shared/types.ts').PermissionMode) ?? null;
            }
            // Detect remote control from bridge_status system records
            if (parsed['type'] === 'system' && parsed['subtype'] === 'bridge_status') {
              isRemoteControlled = true;
            }
          }
          rowCount = parseJsonlContent(content).length;
          // Active if: live process in registry OR file modified within last 2 minutes
          // (some sessions e.g. desktop app don't register in ~/.claude/sessions/)
          isActive = runningSessions.has(id) || (Date.now() - stat.mtime.getTime() < 120_000);
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
          isActive,
          permissionMode,
          isRemoteControlled,
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

      // Stretch agent rows to span from dispatch to last sub-agent child completion
      for (const row of rows) {
        if (row.type !== 'agent' || row.children.length === 0) continue;
        const childMax = Math.max(...row.children.map((c) => c.endTime ?? c.startTime));
        if (childMax > (row.endTime ?? 0)) {
          row.endTime = childMax;
          row.duration = childMax - row.startTime;
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
