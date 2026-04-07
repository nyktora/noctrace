/**
 * REST API routes for project and session data.
 * All data is read from JSONL files on disk — no in-memory caching.
 */
import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  parseJsonlContent,
  parseCompactionBoundaries,
  extractSessionId,
  extractAgentIds,
  parseSubAgentContent,
} from '../../shared/parser';
import { computeContextHealth } from '../../shared/health';
import { parseAssistantTurns, computeDrift } from '../../shared/drift';
import { computeSessionCost } from '../../shared/cost';
import type { ProjectSummary, SessionSummary, HookEvent, HookEventMessage, WaterfallRow, ContextHealth, DriftAnalysis } from '../../shared/types';

/** Payload shape for the self-contained HTML export */
interface ExportPayload {
  rows: WaterfallRow[];
  health: ContextHealth;
  drift: DriftAnalysis;
  compactionBoundaries: number[];
  sessionId: string;
}

/**
 * Build a self-contained HTML export file from a session's parsed data.
 * The result is a standalone HTML page with all data inlined as JSON and
 * a minimal vanilla-JS viewer — no server or external dependencies required.
 */
function buildExportHtml(payload: ExportPayload): string {
  const { rows, health, drift, sessionId } = payload;

  // Flatten children into the row list for display, tagging depth
  const flatRows: Array<WaterfallRow & { depth: number }> = [];
  for (const row of rows) {
    flatRows.push({ ...row, depth: 0 });
    for (const child of row.children) {
      flatRows.push({ ...child, depth: 1 });
    }
  }

  // Compute summary stats
  let totalTokens = 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const r of flatRows) {
    totalTokens += r.inputTokens + r.outputTokens;
    if (r.startTime < minStart) minStart = r.startTime;
    const end = r.endTime ?? r.startTime;
    if (end > maxEnd) maxEnd = end;
  }
  const sessionDurationMs = flatRows.length > 0 ? maxEnd - minStart : 0;

  function fmtDuration(ms: number | null): string {
    if (ms === null || ms < 0) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}m${s}s`;
  }

  function fmtTokens(n: number): string {
    if (n === 0) return '—';
    if (n < 1000) return String(n);
    return `${(n / 1000).toFixed(1)}k`;
  }

  function badgeColor(toolName: string, status: string): string {
    if (status === 'error') return '#f38ba8';
    if (status === 'running') return '#f5c2e7';
    const n = toolName.toLowerCase();
    if (n === 'read' || n === 'readfile') return '#89b4fa';
    if (n === 'write' || n === 'writefile') return '#a6e3a1';
    if (n === 'edit' || n === 'multiedit') return '#f9e2af';
    if (n === 'bash' || n === 'execute') return '#fab387';
    if (n === 'task' || n === 'agent' || n === 'dispatch_agent') return '#cba6f7';
    if (n === 'grep' || n === 'glob' || n === 'search') return '#94e2d5';
    if (n.startsWith('mcp__')) return '#94e2d5';
    return '#6c7086';
  }

  function ctxColor(pct: number): string {
    if (pct < 50) return '#a6e3a1';
    if (pct < 65) return '#94e2d5';
    if (pct < 80) return '#f9e2af';
    if (pct < 90) return '#fab387';
    return '#f38ba8';
  }

  function gradeColor(grade: string): string {
    if (grade === 'A') return '#a6e3a1';
    if (grade === 'B') return '#94e2d5';
    if (grade === 'C') return '#f9e2af';
    if (grade === 'D') return '#fab387';
    return '#f38ba8';
  }

  const tableRows = flatRows.map((r, i) => {
    const indent = r.depth > 0 ? 'padding-left:20px;' : '';
    const bg = r.depth > 0 ? 'background:#12151d;' : '';
    const color = badgeColor(r.toolName, r.status);
    const ctx = r.contextFillPercent > 0
      ? `<span style="color:${ctxColor(r.contextFillPercent)}">${r.contextFillPercent.toFixed(1)}%</span>`
      : '—';
    const tokens = r.inputTokens + r.outputTokens > 0
      ? fmtTokens(r.inputTokens + r.outputTokens)
      : '—';
    const escapedLabel = r.label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedTool = r.toolName.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<tr style="${bg}">
      <td style="color:#585b70;padding:4px 8px;text-align:right;font-size:11px">${i + 1}</td>
      <td style="padding:4px 8px;${indent}max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapedLabel}">${escapedLabel}</td>
      <td style="padding:4px 8px;white-space:nowrap"><span style="background:${color}22;color:${color};border-radius:4px;padding:1px 6px;font-size:11px">${escapedTool}</span></td>
      <td style="padding:4px 8px;font-variant-numeric:tabular-nums;color:#cdd6f4">${fmtDuration(r.duration)}</td>
      <td style="padding:4px 8px;font-variant-numeric:tabular-nums;color:#cdd6f4">${tokens}</td>
      <td style="padding:4px 8px;font-variant-numeric:tabular-nums">${ctx}</td>
    </tr>`;
  }).join('\n');

  const exportedAt = new Date().toUTCString();
  const grade = health.grade;
  const gColor = gradeColor(grade);
  const driftInfo = drift && drift.driftFactor >= 1.5
    ? `<span style="color:#fab387;margin-left:12px">drift ${drift.driftFactor}x</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>noctrace export — ${sessionId.slice(0, 16)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0e14;color:#cdd6f4;font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;line-height:1.5;padding:24px}
h1{font-size:15px;font-weight:600;color:#cba6f7;letter-spacing:-0.02em}
.meta{color:#6c7086;font-size:11px;margin-top:4px}
.header{display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid #1e2030}
.badge{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;font-weight:700;font-size:14px;border:2px solid}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#12151d;color:#585b70;font-weight:500;text-align:left;padding:6px 8px;border-bottom:1px solid #1e2030;white-space:nowrap}
tr:hover td{background:#12151d}
.footer{margin-top:16px;padding-top:12px;border-top:1px solid #1e2030;color:#585b70;font-size:11px;display:flex;gap:20px}
.footer span{color:#cdd6f4}
a{color:#89b4fa;text-decoration:none}
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>noctrace session export</h1>
    <div class="meta">${sessionId}${driftInfo}</div>
    <div class="meta" style="margin-top:2px">exported ${exportedAt}</div>
  </div>
  <div class="badge" style="color:${gColor};border-color:${gColor}" title="Context health: ${grade} (${health.score}/100)">${grade}</div>
</div>
<table>
<thead>
<tr>
  <th style="width:36px;text-align:right">#</th>
  <th>Name</th>
  <th>Type</th>
  <th>Duration</th>
  <th>Tokens</th>
  <th>Context %</th>
</tr>
</thead>
<tbody>
${tableRows}
</tbody>
</table>
<div class="footer">
  <div>Rows <span>${flatRows.length}</span></div>
  <div>Total tokens <span>${fmtTokens(totalTokens)}</span></div>
  <div>Duration <span>${fmtDuration(sessionDurationMs)}</span></div>
  <div>Health score <span style="color:${gColor}">${grade} (${health.score}/100)</span></div>
  <div style="margin-left:auto"><a href="https://github.com/noctrace/noctrace" rel="noopener">noctrace</a></div>
</div>
</body>
</html>`;
}

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
 * all connected browser clients.
 */
export function buildApiRouter(claudeHome: string, wss: WebSocketServer): Router {
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
          rowCount = lines.filter((l) => l.trim()).length;
          // Active if: live process in registry OR file modified within last 2 minutes
          // Registry covers CLI sessions; mtime covers Desktop app sessions
          isActive = runningSessions.has(id) || (Date.now() - stat.mtime.getTime() < 120_000);
        } catch {
          // Unreadable file — still include with null startTime
        }

        let driftFactor: number | null = null;
        try {
          const content = await fs.readFile(filePath, 'utf8');
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
      assertWithinBase(filePath, projectsDir);
    } catch {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

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
      const turns = parseAssistantTurns(content);
      const drift = computeDrift(turns);
      const cost = computeSessionCost(turns);

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

      res.json({ rows, compactionBoundaries: boundaries, health, sessionId, drift, cost });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/session/:slug/:id/export
  // ---------------------------------------------------------------------------

  /**
   * Export a session as a self-contained HTML file.
   * The response is a downloadable HTML document with all session data embedded
   * as inline JSON and a minimal viewer rendered with vanilla JS — no server needed.
   */
  router.get('/session/:slug/:id/export', async (req, res) => {
    const { slug, id } = req.params;
    const filePath = path.join(projectsDir, slug, `${id}.jsonl`);

    try {
      assertWithinBase(filePath, projectsDir);
    } catch {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

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
      const turns = parseAssistantTurns(content);
      const drift = computeDrift(turns);

      const exportData = { rows, health, drift, compactionBoundaries: boundaries, sessionId };
      const html = buildExportHtml(exportData);

      const exportDate = new Date().toISOString().slice(0, 10);
      const filename = `noctrace-${sessionId.slice(0, 8)}-${exportDate}.html`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(html);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
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

      const message: HookEventMessage = { type: 'hook-event', event };
      const payload = JSON.stringify(message);

      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
