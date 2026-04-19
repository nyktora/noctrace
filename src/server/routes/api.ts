/**
 * REST API routes for project and session data.
 * All data is read from JSONL files on disk via the Provider registry.
 * Phase B: session reads are routed through getProvider() instead of calling
 * parseJsonlContent directly. Raw file content is still read separately for
 * enrichments not yet in the Provider interface (compaction, drift, tips, etc.).
 */
import express, { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  parseCompactionBoundaries,
  extractSessionId,
  extractSessionTitle,
  extractAgentIds,
  parseSubAgentContent,
  parseInstructionsLoaded,
} from '../../shared/parser.js';
import { parseSessionResultMetrics, parseInitContext } from '../../shared/session-metadata.js';
import { computeContextHealth } from '../../shared/health.js';
import { parseAssistantTurns, computeDrift } from '../../shared/drift.js';
import { attachEfficiencyTips } from '../../shared/tips.js';
import { attachSecurityTips } from '../../shared/security-tips.js';
import { sessionToOtlp } from '../../shared/otlp-export.js';
import { createClaudeCodeProvider } from '../../shared/providers/claude-code.js';
import { listProviders, getProvider } from '../../shared/providers/index.js';
import type { Provider } from '../../shared/providers/index.js';
import type { SessionMeta } from '../../shared/session.js';
import type { WaterfallRow } from '../../shared/types.js';
import type { ProjectSummary, SessionSummary, HookEvent, HookEventMessage, SessionRegisteredMessage, SessionUnregisteredMessage, AgentTeam, TeamMember, TeamTask, SubagentStartMessage, SearchResult } from '../../shared/types.js';

/**
 * Read ~/.claude/sessions/*.json and return a Set of sessionIds
 * whose PID is still a running claude process.
 * The registry sessionId matches the JSONL filename.
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
          process.kill(pid, 0);
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

/** Validate that a resolved path is within the allowed base directory. */
function assertWithinBase(resolved: string, base: string): void {
  const normalizedResolved = path.resolve(resolved);
  const normalizedBase = path.resolve(base);
  if (!normalizedResolved.startsWith(normalizedBase + path.sep) && normalizedResolved !== normalizedBase) {
    throw new Error('Path traversal detected');
  }
}

/**
 * Build the Express router, scoped to a given Claude home directory.
 * `wss` is the WebSocketServer instance used to broadcast hook events to
 * all connected browser clients. Optional in tests that only exercise
 * non-WebSocket endpoints.
 */
export function buildApiRouter(claudeHome: string, wss?: WebSocketServer): Router {
  const router = Router();
  const projectsDir = path.join(claudeHome, 'projects');
  const teamsDir = path.join(claudeHome, 'teams');
  const tasksDir = path.join(claudeHome, 'tasks');

  /**
   * Provider scoped to this router's claudeHome.
   * Used by session-read endpoints to route through the Provider abstraction.
   */
  const sessionProvider: Provider = createClaudeCodeProvider(claudeHome);

  /**
   * In-memory registry of MCP-registered session paths.
   * Populated by POST /api/sessions/register; cleared on unregister or server restart.
   * When non-empty the client operates in "MCP mode" and shows only these sessions.
   */
  const registeredSessionPaths = new Set<string>();

  /** Last heartbeat timestamp from Docker container watchers, keyed by container name. */
  const dockerHeartbeats = new Map<string, number>();

  /** Broadcast a message to all connected WebSocket clients. */
  function broadcast(msg: SessionRegisteredMessage | SessionUnregisteredMessage): void {
    if (!wss) return;
    const payload = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

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

        // Count sessions with a live process or recent file activity
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
          provider: 'claude-code',
        });
      }

      // Collect projects from non-Claude Code providers (Codex, Copilot, etc.)
      const now = Date.now();
      const windowBounds = { startMs: now - 90 * 86_400_000, endMs: now + 86_400_000 };

      for (const p of listProviders()) {
        if (p.id === 'claude-code') continue; // Already handled above
        try {
          const sessions = await p.listSessions(windowBounds);
          // Group sessions by projectContext
          const byProject = new Map<string, typeof sessions>();
          for (const s of sessions) {
            const key = s.projectContext;
            if (!byProject.has(key)) byProject.set(key, []);
            byProject.get(key)!.push(s);
          }
          for (const [context, sessList] of byProject) {
            // Use provider:context as the slug to disambiguate from Claude Code projects
            const slug = `${p.id}:${context}`;
            const latestMtime = Math.max(...sessList.map((s) => s.endMs ?? s.startMs));
            projects.push({
              slug,
              path: context,
              sessionCount: sessList.length,
              activeSessionCount: 0, // Non-Claude providers can't detect active sessions
              lastModified: new Date(latestMtime).toISOString(),
              provider: p.id,
            });
          }
        } catch (err) {
          console.warn(`[noctrace] ${p.id} provider listSessions failed:`, err instanceof Error ? err.message : String(err));
        }
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
  // GET /api/teams
  // ---------------------------------------------------------------------------

  /**
   * Scan ~/.claude/teams/ and return an array of AgentTeam objects.
   * Returns an empty array if the teams directory doesn't exist.
   * Each team includes its members (from config.json) and taskCount.
   */
  router.get('/teams', async (_req, res) => {
    try {
      let teamDirs: string[];
      try {
        teamDirs = await fs.readdir(teamsDir);
      } catch {
        // Teams directory doesn't exist — this is normal when the feature is unused
        res.json([]);
        return;
      }

      const teams: AgentTeam[] = [];

      for (const teamName of teamDirs) {
        const teamPath = path.join(teamsDir, teamName);
        let stat;
        try {
          stat = await fs.stat(teamPath);
        } catch {
          continue;
        }
        if (!stat.isDirectory()) continue;

        // Read team config.json
        const configPath = path.join(teamPath, 'config.json');
        let members: TeamMember[] = [];
        try {
          const configRaw = await fs.readFile(configPath, 'utf8');
          const config = JSON.parse(configRaw) as Record<string, unknown>;
          const rawMembers = Array.isArray(config['members']) ? config['members'] : [];
          for (const m of rawMembers) {
            if (typeof m !== 'object' || m === null) continue;
            const member = m as Record<string, unknown>;
            members.push({
              name: typeof member['name'] === 'string' ? member['name'] : 'Unknown',
              agentId: typeof member['agent_id'] === 'string' ? member['agent_id']
                : typeof member['agentId'] === 'string' ? member['agentId'] : '',
              agentType: typeof member['agent_type'] === 'string' ? member['agent_type']
                : typeof member['agentType'] === 'string' ? member['agentType'] : '',
            });
          }
        } catch {
          // config.json missing or malformed — include team with empty members
        }

        // Count task files and parse their contents from ~/.claude/tasks/{team-name}/
        let taskCount = 0;
        const tasks: TeamTask[] = [];
        const teamTasksDir = path.join(tasksDir, teamName);
        try {
          const taskFiles = await fs.readdir(teamTasksDir);
          taskCount = taskFiles.length;
          for (const tf of taskFiles) {
            if (!tf.endsWith('.json')) continue;
            try {
              const taskRaw = await fs.readFile(path.join(teamTasksDir, tf), 'utf8');
              const taskData = JSON.parse(taskRaw) as Record<string, unknown>;
              tasks.push({
                id: tf.replace(/\.json$/, ''),
                subject: typeof taskData['subject'] === 'string' ? taskData['subject'] : tf,
                status: typeof taskData['status'] === 'string' ? taskData['status'] : 'pending',
                assignedTo: typeof taskData['assigned_to'] === 'string' ? taskData['assigned_to']
                  : typeof taskData['assignedTo'] === 'string' ? taskData['assignedTo'] : null,
              });
            } catch { /* skip malformed task files */ }
          }
        } catch {
          // Task directory doesn't exist — taskCount stays 0
        }

        teams.push({ name: teamName, members, taskCount, tasks });
      }

      res.json(teams);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/sessions/registered (MUST be before /sessions/:slug to avoid param capture)
  // ---------------------------------------------------------------------------

  /**
   * Return the list of currently registered MCP session paths.
   * An empty array means standalone mode (show all sessions from disk).
   * A non-empty array means MCP mode (show only registered sessions).
   */
  router.get('/sessions/registered', async (_req, res) => {
    const STALE_THRESHOLD_MS = 5 * 60 * 1000;
    for (const registeredPath of registeredSessionPaths) {
      try {
        const stat = await fs.stat(registeredPath);
        if (Date.now() - stat.mtime.getTime() > STALE_THRESHOLD_MS) {
          registeredSessionPaths.delete(registeredPath);
        }
      } catch {
        registeredSessionPaths.delete(registeredPath);
      }
    }
    res.json({ sessions: Array.from(registeredSessionPaths) });
  });

  // ---------------------------------------------------------------------------
  // GET /api/sessions/:slug
  // ---------------------------------------------------------------------------

  /**
   * List sessions for a specific project, sorted by lastModified descending.
   * For non-Claude Code providers, the slug has a provider prefix: `{providerId}:{projectContext}`.
   */
  router.get('/sessions/:slug', async (req, res) => {
    const { slug } = req.params;

    // Check if this is a non-Claude Code provider slug (e.g. "codex:~/dev/project")
    const colonIdx = slug.indexOf(':');
    if (colonIdx > 0) {
      const providerId = slug.slice(0, colonIdx);
      const projectContext = slug.slice(colonIdx + 1);
      const p = getProvider(providerId);
      if (!p) {
        res.status(404).json({ error: `Unknown provider: ${providerId}` });
        return;
      }
      try {
        const now = Date.now();
        const windowBounds = { startMs: now - 90 * 86_400_000, endMs: now + 86_400_000 };
        const allSessions = await p.listSessions(windowBounds);
        const filtered = allSessions.filter((s) => s.projectContext === projectContext);

        const sessions: SessionSummary[] = filtered.map((meta) => ({
          id: meta.rawSlug,
          projectSlug: slug,
          filePath: '',
          startTime: new Date(meta.startMs).toISOString(),
          lastModified: meta.endMs ? new Date(meta.endMs).toISOString() : new Date().toISOString(),
          rowCount: 0,
          isActive: false,
          permissionMode: null,
          isRemoteControlled: false,
          driftFactor: null,
          title: null,
          provider: providerId,
        }));

        sessions.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
        res.json(sessions);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
      }
      return;
    }

    // Existing Claude Code logic — slug is a raw directory name
    const projectDir = path.join(projectsDir, slug);

    try {
      assertWithinBase(projectDir, projectsDir);
    } catch {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

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
        let sessionTitle: string | null = null;
        let fileContent: string | null = null;
        try {
          fileContent = await fs.readFile(filePath, 'utf8');
          const lines = fileContent.split('\n');
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
          rowCount = lines.filter((l) => l.trim()).length;
          // Active if: live process in registry OR file modified within last 2 minutes
          // Registry covers CLI sessions; mtime covers Desktop app sessions
          isActive = runningSessions.has(id) || (Date.now() - stat.mtime.getTime() < 120_000);
          // Extract optional session title — scans all lines, best-effort
          sessionTitle = extractSessionTitle(fileContent);
        } catch {
          // Unreadable file — still include with null startTime
        }

        let driftFactor: number | null = null;
        try {
          const content = fileContent ?? await fs.readFile(filePath, 'utf8');
          const sessionTurns = parseAssistantTurns(content);
          const sessionDrift = computeDrift(sessionTurns);
          driftFactor = sessionTurns.length >= 5 ? sessionDrift.driftFactor : null;
        } catch {
          // Drift computation is best-effort — don't fail the session listing
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
          driftFactor,
          title: sessionTitle,
          provider: 'claude-code',
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
  // GET /api/session/:slug/:id/otlp (MUST be before :slug/:id to avoid param capture)
  // ---------------------------------------------------------------------------

  /**
   * Export a session as OTLP/HTTP JSON trace format.
   * The response can be POSTed directly to any OTLP collector at /v1/traces.
   * Accepts optional `?provider=` query param for non-Claude Code providers.
   */
  router.get('/session/:slug/:id/otlp', async (req, res) => {
    const { slug, id } = req.params;
    const providerParam = req.query['provider'] as string | undefined;

    // Route through the appropriate provider
    const effectiveProvider = providerParam ? getProvider(providerParam) : sessionProvider;
    if (!effectiveProvider) {
      res.status(400).json({ error: `Unknown provider: ${providerParam ?? 'unknown'}` });
      return;
    }

    // For non-Claude Code providers, use provider.readSession directly
    if (effectiveProvider.id !== 'claude-code') {
      try {
        const session = await effectiveProvider.readSession(id);
        const rows = session.native as WaterfallRow[];
        const otlp = sessionToOtlp(rows, id);
        res.setHeader('Content-Type', 'application/json');
        res.json(otlp);
      } catch {
        res.status(404).json({ error: `Session not found: ${id}` });
      }
      return;
    }

    const filePath = path.join(projectsDir, slug, `${id}.jsonl`);

    try {
      assertWithinBase(filePath, projectsDir);
    } catch {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    try {
      // Use the provider to read session rows; fall back to 404 when not found.
      let rows: WaterfallRow[];
      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf8');
        const session = await sessionProvider.readSession(`${slug}/${id}`);
        rows = session.native as WaterfallRow[];
      } catch {
        res.status(404).json({ error: `Session not found: ${slug}/${id}` });
        return;
      }

      const sessionId = extractSessionId(content) ?? id;
      const otlp = sessionToOtlp(rows, sessionId);

      res.setHeader('Content-Type', 'application/json');
      res.json(otlp);
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
   * Accepts optional `?provider=` query param for non-Claude Code providers.
   */
  router.get('/session/:slug/:id', async (req, res) => {
    const { slug, id } = req.params;
    const providerParam = req.query['provider'] as string | undefined;

    // Route through the appropriate provider
    const effectiveProvider = providerParam ? getProvider(providerParam) : sessionProvider;
    if (!effectiveProvider) {
      res.status(400).json({ error: `Unknown provider: ${providerParam ?? 'unknown'}` });
      return;
    }

    // Non-Claude Code provider path: minimal enrichments (no compaction, drift, tips, etc.)
    if (effectiveProvider.id !== 'claude-code') {
      try {
        let rows: WaterfallRow[];
        try {
          const session = await effectiveProvider.readSession(id);
          rows = session.native as WaterfallRow[];
        } catch {
          res.status(404).json({ error: `Session not found: ${id}` });
          return;
        }

        const health = computeContextHealth(rows, 0);

        res.json({
          rows,
          compactionBoundaries: [],
          health,
          sessionId: id,
          drift: null,
          tipCount: 0,
          instructionsLoaded: [],
          resultMetrics: null,
          initContext: null,
          provider: effectiveProvider.id,
          capabilities: effectiveProvider.capabilities,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
      }
      return;
    }

    // Claude Code path: full enrichments
    const filePath = path.join(projectsDir, slug, `${id}.jsonl`);

    try {
      assertWithinBase(filePath, projectsDir);
    } catch {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    try {
      // Use the provider to read session rows; fall back to 404 when not found.
      let rows: WaterfallRow[];
      let content: string;
      try {
        // Read raw content for compaction/drift/tips analysis (not in Provider interface yet)
        content = await fs.readFile(filePath, 'utf8');
        const session = await sessionProvider.readSession(`${slug}/${id}`);
        rows = session.native as WaterfallRow[];
      } catch {
        res.status(404).json({ error: `Session not found: ${slug}/${id}` });
        return;
      }

      const boundaries = parseCompactionBoundaries(content);
      const health = computeContextHealth(rows, boundaries.length);
      const sessionId = extractSessionId(content) ?? id;
      const turns = parseAssistantTurns(content);
      const drift = computeDrift(turns);
      const instructionsLoaded = parseInstructionsLoaded(content);
      const resultMetrics = parseSessionResultMetrics(content);
      const initContext = parseInitContext(content);

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
          // Validate agentId to prevent path traversal via crafted JSONL content
          if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) continue;
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
        let childMax = -Infinity;
        for (const c of row.children) {
          const end = c.endTime ?? c.startTime;
          if (end > childMax) childMax = end;
        }
        if (childMax > (row.endTime ?? 0)) {
          row.endTime = childMax;
          row.duration = childMax - row.startTime;
        }
      }

      // Attach efficiency tips to wasteful rows (mutates rows in place)
      // tips.ts expects number[] (timestamps), so extract from CompactionBoundary[]
      attachEfficiencyTips(rows, boundaries.map((b) => b.timestamp));

      // Attach security tips (mutates rows in place)
      attachSecurityTips(rows);

      // Count total tips across all rows (including children) for the client toolbar
      function countTips(r: typeof rows): number {
        return r.reduce((sum, row) => sum + row.tips.length + countTips(row.children), 0);
      }
      const tipCount = countTips(rows);

      res.json({
        rows,
        compactionBoundaries: boundaries,
        health,
        sessionId,
        drift,
        tipCount,
        instructionsLoaded,
        resultMetrics,
        initContext,
        provider: 'claude-code',
        capabilities: sessionProvider.capabilities,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/docker/stream
  // ---------------------------------------------------------------------------

  /**
   * Receive streamed JSONL content from a Docker container watcher.
   * Appends raw text to a local sync file under the projects directory.
   * Chokidar picks up the file change and handles parsing + WebSocket broadcasting.
   */
  router.post('/docker/stream', express.text({ type: 'text/plain', limit: '1mb' }), async (req, res) => {
    try {
      const containerName = req.headers['x-container-name'];
      const containerPath = req.headers['x-container-path'];

      if (typeof containerName !== 'string' || !containerName) {
        res.status(400).json({ error: 'X-Container-Name header required' });
        return;
      }
      if (typeof containerPath !== 'string' || !containerPath) {
        res.status(400).json({ error: 'X-Container-Path header required' });
        return;
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(containerName)) {
        res.status(400).json({ error: 'Invalid container name format' });
        return;
      }

      const body = req.body as string;
      if (!body || !body.trim()) {
        res.status(400).json({ error: 'Empty body' });
        return;
      }

      // Extract relative path after /projects/
      const projectsIdx = containerPath.indexOf('/projects/');
      if (projectsIdx === -1) {
        res.status(400).json({ error: 'Container path must contain /projects/' });
        return;
      }

      const relativePath = containerPath.slice(projectsIdx + '/projects/'.length);

      // Reject path traversal patterns in the relative path
      if (relativePath.includes('..')) {
        res.status(400).json({ error: 'Invalid path' });
        return;
      }

      const slashIdx = relativePath.indexOf('/');
      if (slashIdx === -1) {
        res.status(400).json({ error: 'Invalid container path structure' });
        return;
      }

      const containerSlug = relativePath.slice(0, slashIdx);
      const sessionFile = relativePath.slice(slashIdx + 1);
      const localSlug = `docker--${containerName}--${containerSlug}`;
      const localPath = path.join(projectsDir, localSlug, sessionFile);

      try {
        assertWithinBase(localPath, projectsDir);
      } catch {
        res.status(400).json({ error: 'Invalid path' });
        return;
      }

      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.appendFile(localPath, body.endsWith('\n') ? body : body + '\n');

      // Auto-register the session
      if (localPath.endsWith('.jsonl') && !registeredSessionPaths.has(localPath)) {
        const resolvedPath = path.resolve(localPath);
        registeredSessionPaths.add(resolvedPath);
        broadcast({ type: 'session-registered', sessionPath: resolvedPath });
      }

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/docker/heartbeat
  // ---------------------------------------------------------------------------

  /** Keepalive endpoint for Docker container watchers. */
  router.post('/docker/heartbeat', (req, res) => {
    const containerName = req.headers['x-container-name'];
    if (typeof containerName !== 'string' || !containerName) {
      res.status(400).json({ error: 'X-Container-Name header required' });
      return;
    }
    dockerHeartbeats.set(containerName, Date.now());
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // GET /api/docker/status
  // ---------------------------------------------------------------------------

  /** Returns the status of connected Docker containers. */
  router.get('/docker/status', (_req, res) => {
    const containers: Array<{ name: string; lastHeartbeat: number; stale: boolean }> = [];
    const now = Date.now();
    for (const [name, ts] of dockerHeartbeats) {
      containers.push({ name, lastHeartbeat: ts, stale: now - ts > 30_000 });
    }
    res.json({ containers });
  });

  // ---------------------------------------------------------------------------
  // POST /api/hooks
  // ---------------------------------------------------------------------------

  /**
   * Receives Claude Code hook events and broadcasts them to all connected
   * WebSocket clients as `{ type: 'hook-event', event }` messages.
   * Claude Code sends the event JSON on stdin; the hook command pipes it here
   * via curl. Returns `{ ok: true }` on success.
   */
  router.post('/hooks', (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;

      const event: HookEvent = {
        session_id: typeof body['session_id'] === 'string' ? body['session_id'] : '',
        hook_event_name: typeof body['hook_event_name'] === 'string' ? body['hook_event_name'] : '',
        ...(typeof body['tool_name'] === 'string' ? { tool_name: body['tool_name'] } : {}),
        ...(body['tool_input'] !== undefined ? { tool_input: body['tool_input'] } : {}),
        ...(body['tool_response'] !== undefined ? { tool_response: body['tool_response'] } : {}),
        ...(typeof body['tool_use_id'] === 'string' ? { tool_use_id: body['tool_use_id'] } : {}),
        ...(typeof body['cwd'] === 'string' ? { cwd: body['cwd'] } : {}),
        ...(typeof body['transcript_path'] === 'string' ? { transcript_path: body['transcript_path'] } : {}),
        ...(typeof body['agent_id'] === 'string' ? { agent_id: body['agent_id'] } : {}),
        ...(typeof body['agent_type'] === 'string' ? { agent_type: body['agent_type'] } : {}),
        ...(typeof body['permission_mode'] === 'string' ? { permission_mode: body['permission_mode'] } : {}),
        received_at: new Date().toISOString(),
      };

      // For SubagentStart events, broadcast a separate message type
      // so the client can show an in-progress agent row immediately
      if (event.hook_event_name === 'SubagentStart' && event.agent_id && wss) {
        const subagentMsg: SubagentStartMessage = {
          type: 'subagent-start',
          agentId: event.agent_id,
          agentType: event.agent_type ?? null,
          sessionId: event.session_id,
        };
        const subPayload = JSON.stringify(subagentMsg);
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(subPayload);
          }
        }
      }

      const message: HookEventMessage = { type: 'hook-event', event };
      const payload = JSON.stringify(message);

      if (wss) {
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      }

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/sessions/register
  // ---------------------------------------------------------------------------

  /**
   * Register an MCP-managed session path so noctrace can display it.
   * Body: { sessionPath: string } — absolute path to a .jsonl file.
   * Broadcasts `session-registered` to all WebSocket clients.
   */
  router.post('/sessions/register', async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const sessionPath = typeof body['sessionPath'] === 'string' ? body['sessionPath'] : null;

      if (!sessionPath) {
        res.status(400).json({ error: 'sessionPath is required' });
        return;
      }

      if (!sessionPath.endsWith('.jsonl')) {
        res.status(400).json({ error: 'sessionPath must be a .jsonl file' });
        return;
      }

      // Normalize and validate that the path is within the Claude projects directory
      const resolvedPath = path.resolve(sessionPath);
      try {
        assertWithinBase(resolvedPath, projectsDir);
      } catch {
        res.status(400).json({ error: 'sessionPath must be within the Claude projects directory' });
        return;
      }

      // Verify the file exists (best-effort — it may appear shortly after the MCP starts)
      try {
        await fs.access(resolvedPath);
      } catch {
        // File not yet created — register anyway; the watcher will pick it up
      }

      registeredSessionPaths.add(resolvedPath);
      broadcast({ type: 'session-registered', sessionPath: resolvedPath });

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/sessions/unregister
  // ---------------------------------------------------------------------------

  /**
   * Remove a previously registered MCP session path from the registry.
   * Body: { sessionPath: string }.
   * Broadcasts `session-unregistered` to all WebSocket clients.
   */
  router.post('/sessions/unregister', (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const sessionPath = typeof body['sessionPath'] === 'string' ? body['sessionPath'] : null;

      if (!sessionPath) {
        res.status(400).json({ error: 'sessionPath is required' });
        return;
      }

      const resolvedPath = path.resolve(sessionPath);
      registeredSessionPaths.delete(resolvedPath);
      broadcast({ type: 'session-unregistered', sessionPath: resolvedPath });

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/search
  // ---------------------------------------------------------------------------

  /**
   * Cross-session full-text search.
   * Scans session files from all registered providers for a query string.
   * Uses a fast raw string check before full JSONL parsing to keep latency low.
   *
   * Query params:
   *   q        — search query (min 3 chars, required)
   *   limit    — max results to return (default 50)
   *   provider — optional: restrict to a single provider id
   */
  router.get('/search', async (req, res) => {
    const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
    const limitParam = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : 50;
    const providerFilter = typeof req.query['provider'] === 'string' ? req.query['provider'] : null;

    if (q.length < 3) {
      res.status(400).json({ error: 'Query must be at least 3 characters' });
      return;
    }

    const limit = isNaN(limitParam) || limitParam < 1 ? 50 : Math.min(limitParam, 200);
    const results: SearchResult[] = [];

    // Search within the last 30 days
    const now = Date.now();
    const windowBounds = { startMs: now - 30 * 86_400_000, endMs: now + 86_400_000 };

    const qLower = q.toLowerCase();

    try {
      for (const p of listProviders()) {
        if (results.length >= limit) break;
        if (providerFilter !== null && p.id !== providerFilter) continue;

        let sessions;
        try {
          sessions = await p.listSessions(windowBounds);
        } catch {
          continue;
        }

        for (const meta of sessions) {
          if (results.length >= limit) break;

          // Determine the file path for this session
          let filePath: string | null = null;
          if (p.id === 'claude-code') {
            // rawSlug is '<projectSlug>/<sessionId>'
            const parts = meta.rawSlug.split('/');
            if (parts.length >= 2) {
              filePath = path.join(projectsDir, parts[0], `${parts[1]}.jsonl`);
            }
          }

          // For non-Claude Code providers that don't expose a file path,
          // we skip raw-string pre-check and use the parsed rows directly
          if (filePath !== null) {
            // Fast path: raw string check before full parse
            let raw: string;
            try {
              raw = await fs.readFile(filePath, 'utf8');
            } catch {
              continue;
            }
            if (!raw.toLowerCase().includes(qLower)) continue;

            // Session matches — do line-level search
            const lines = raw.split('\n');
            const sessionResults = extractSearchMatches(lines, q, meta, p.id, limit - results.length);
            results.push(...sessionResults);
          } else {
            // Non-file providers: parse and search through rows
            let session;
            try {
              session = await p.readSession(meta.rawSlug);
            } catch {
              continue;
            }
            const rows = session.native as WaterfallRow[];
            for (const row of rows) {
              if (results.length >= limit) break;
              const haystack = buildRowSearchText(row);
              if (!haystack.toLowerCase().includes(qLower)) continue;
              const matchLine = findMatchLine(haystack, q);
              results.push({
                provider: p.id,
                projectContext: meta.projectContext,
                sessionId: meta.rawSlug,
                sessionStart: new Date(meta.startMs).toISOString(),
                rowId: row.id,
                toolName: row.toolName,
                matchLine: matchLine.slice(0, 200),
                matchContext: haystack.slice(0, 500),
              });
            }
          }
        }
      }

      res.json({ results });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ---------------------------------------------------------------------------
  return router;
}

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

/**
 * Build a single searchable text blob from a WaterfallRow's label, toolName, and output.
 */
function buildRowSearchText(row: WaterfallRow): string {
  const parts: string[] = [row.toolName, row.label];
  if (row.output) parts.push(row.output);
  // Include key input fields
  for (const [, v] of Object.entries(row.input)) {
    if (typeof v === 'string') parts.push(v);
  }
  return parts.join('\n');
}

/**
 * Find the line within text that contains the query (case-insensitive).
 * Returns the full line, or the first 200 chars of text if no line break found.
 */
function findMatchLine(text: string, query: string): string {
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return text.slice(0, 200);
  const start = text.lastIndexOf('\n', idx);
  const end = text.indexOf('\n', idx);
  return text.slice(start < 0 ? 0 : start + 1, end < 0 ? text.length : end);
}

/**
 * Scan JSONL lines for query matches and return up to maxResults SearchResult entries.
 * Operates on raw text lines to avoid re-parsing JSON for lines that don't match.
 */
function extractSearchMatches(
  lines: string[],
  query: string,
  meta: SessionMeta,
  providerId: string,
  maxResults: number,
): SearchResult[] {
  const results: SearchResult[] = [];
  const qLower = query.toLowerCase();

  for (const line of lines) {
    if (results.length >= maxResults) break;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.toLowerCase().includes(qLower)) continue;

    // Parse the JSONL line to extract structured fields
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // Malformed line — skip
      continue;
    }

    // Only surface tool result lines (assistant with tool_use blocks) and user messages
    const recordType = typeof parsed['type'] === 'string' ? parsed['type'] : '';
    if (recordType !== 'assistant' && recordType !== 'user') continue;

    // Extract a row id and tool name from the record
    let rowId = '';
    let toolName = '';
    let matchContext = '';

    if (recordType === 'assistant') {
      const message = parsed['message'] as Record<string, unknown> | undefined;
      const content = message ? (message['content'] as unknown[]) : (parsed['content'] as unknown[]);
      if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block !== 'object' || block === null) continue;
          const b = block as Record<string, unknown>;
          if (b['type'] === 'tool_use') {
            rowId = typeof b['id'] === 'string' ? b['id'] : '';
            toolName = typeof b['name'] === 'string' ? b['name'] : '';
            const inputStr = JSON.stringify(b['input'] ?? {});
            if (inputStr.toLowerCase().includes(qLower)) {
              matchContext = inputStr.slice(0, 500);
              break;
            }
          } else if (b['type'] === 'text') {
            const text = typeof b['text'] === 'string' ? b['text'] : '';
            if (text.toLowerCase().includes(qLower)) {
              toolName = 'assistant';
              matchContext = text.slice(0, 500);
              break;
            }
          }
        }
      }
    } else if (recordType === 'user') {
      const message = parsed['message'] as Record<string, unknown> | undefined;
      const content = message ? (message['content'] as unknown[]) : (parsed['content'] as unknown[]);
      if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block !== 'object' || block === null) continue;
          const b = block as Record<string, unknown>;
          if (b['type'] === 'tool_result') {
            const blockContent = b['content'];
            let text = '';
            if (typeof blockContent === 'string') {
              text = blockContent;
            } else if (Array.isArray(blockContent)) {
              text = blockContent
                .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
                .map((c) => (typeof c['text'] === 'string' ? c['text'] : ''))
                .join('\n');
            }
            if (text.toLowerCase().includes(qLower)) {
              rowId = typeof b['tool_use_id'] === 'string' ? b['tool_use_id'] : '';
              toolName = 'tool_result';
              matchContext = text.slice(0, 500);
              break;
            }
          } else if (b['type'] === 'text') {
            const text = typeof b['text'] === 'string' ? b['text'] : '';
            if (text.toLowerCase().includes(qLower)) {
              toolName = 'user';
              matchContext = text.slice(0, 500);
              break;
            }
          }
        }
      }
    }

    if (!matchContext && trimmed.toLowerCase().includes(qLower)) {
      matchContext = trimmed.slice(0, 500);
    }
    if (!matchContext) continue;

    results.push({
      provider: providerId,
      projectContext: meta.projectContext,
      sessionId: meta.rawSlug,
      sessionStart: new Date(meta.startMs).toISOString(),
      rowId,
      toolName: toolName || recordType,
      matchLine: findMatchLine(matchContext, query).slice(0, 200),
      matchContext,
    });
  }

  return results;
}
