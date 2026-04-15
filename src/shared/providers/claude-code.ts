/**
 * Claude Code provider implementation.
 * Wraps the existing parseJsonlContent / parseSubAgentContent logic and the
 * ~/.claude/projects directory structure into the Provider interface.
 *
 * Session id format: '<projectSlug>/<sessionId>'
 * e.g. '-Users-lam-dev-noctrace/abc123def456'
 *
 * Phase A note: watch() returns a no-op unsubscribe. Real-time chokidar
 * integration is deferred to Phase B when the server wires it up.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import chokidar from 'chokidar';

import { parseJsonlContent, extractSessionId } from '../parser.js';
import type { Provider, ProviderCapabilities, TimeWindow, SessionEvent } from './provider.js';
import type { SessionMeta, AgentSession } from '../session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the Claude home directory.
 * Prefers the CLAUDE_HOME environment variable, falls back to ~/.claude.
 */
function resolveClaudeHome(override?: string): string {
  if (override) return override;
  return process.env['CLAUDE_HOME'] ?? path.join(os.homedir(), '.claude');
}

/**
 * Convert a project directory slug back to a human-readable path.
 * '-Users-lam-dev-noctrace' → '/Users/lam/dev/noctrace'
 * The result is then replaced with '~' when it starts with the home directory.
 */
function deSlugifyProject(slug: string): string {
  const rawPath = slug.replace(/-/g, '/');
  const home = os.homedir();
  if (rawPath.startsWith(home)) {
    return '~' + rawPath.slice(home.length);
  }
  return rawPath;
}

/**
 * Read the mtime of a file; returns null on error.
 */
async function safeStatMtime(filePath: string): Promise<Date | null> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtime;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

const CLAUDE_CODE_CAPABILITIES: ProviderCapabilities = {
  toolCallGranularity: 'full',
  contextTracking: true,
  subAgents: true,
  realtime: true,
  tokenAccounting: 'per-turn',
};

/**
 * Create a Claude Code provider instance.
 *
 * @param claudeHome - Override path to the Claude home directory.
 *   Defaults to CLAUDE_HOME env var or ~/.claude.
 */
export function createClaudeCodeProvider(claudeHome?: string): Provider {
  const home = resolveClaudeHome(claudeHome);
  const projectsDir = path.join(home, 'projects');

  return {
    id: 'claude-code',
    displayName: 'Claude Code',
    capabilities: CLAUDE_CODE_CAPABILITIES,

    async listSessions(window: TimeWindow): Promise<SessionMeta[]> {
      const results: SessionMeta[] = [];

      let slugs: string[];
      try {
        slugs = await fs.readdir(projectsDir);
      } catch {
        // Projects directory doesn't exist — return empty list gracefully
        return results;
      }

      for (const slug of slugs) {
        const projectDir = path.join(projectsDir, slug);
        let dirStat;
        try {
          dirStat = await fs.stat(projectDir);
        } catch {
          continue;
        }
        if (!dirStat.isDirectory()) continue;

        let files: string[];
        try {
          files = await fs.readdir(projectDir);
        } catch {
          continue;
        }

        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue;
          const sessionId = file.replace(/\.jsonl$/, '');
          const filePath = path.join(projectDir, file);

          const mtime = await safeStatMtime(filePath);
          if (!mtime) continue;

          const mtimeMs = mtime.getTime();

          // Filter by window: use mtime as endMs heuristic
          if (mtimeMs < window.startMs || mtimeMs >= window.endMs) continue;

          // Extract start time from first record (best-effort, fall back to mtime)
          let startMs = mtimeMs;
          try {
            const firstChunk = await readFirstChunk(filePath, 4096);
            const firstTs = extractFirstTimestamp(firstChunk);
            if (firstTs !== null) startMs = firstTs;
          } catch {
            // Leave startMs as mtime
          }

          results.push({
            provider: 'claude-code',
            sessionId,
            projectContext: deSlugifyProject(slug),
            rawSlug: `${slug}/${sessionId}`,
            startMs,
            endMs: mtimeMs,
          });
        }
      }

      return results;
    },

    async readSession(id: string): Promise<AgentSession> {
      // id format: '<projectSlug>/<sessionId>'
      const slashIdx = id.indexOf('/');
      if (slashIdx === -1) {
        throw new Error(`Invalid Claude Code session id: "${id}". Expected "<projectSlug>/<sessionId>".`);
      }
      const projectSlug = id.slice(0, slashIdx);
      const sessionId = id.slice(slashIdx + 1);

      const filePath = path.join(projectsDir, projectSlug, `${sessionId}.jsonl`);

      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf8');
      } catch {
        throw new Error(`Claude Code session not found: ${id}`);
      }

      const rows = parseJsonlContent(content);
      const canonicalSessionId = extractSessionId(content) ?? sessionId;

      // Extract mtime for endMs
      const mtime = await safeStatMtime(filePath);

      // Extract start time
      const firstTs = extractFirstTimestamp(content.slice(0, 4096));
      const startMs = firstTs ?? (mtime?.getTime() ?? Date.now());

      const meta: SessionMeta = {
        provider: 'claude-code',
        sessionId: canonicalSessionId,
        projectContext: deSlugifyProject(projectSlug),
        rawSlug: `${projectSlug}/${sessionId}`,
        startMs,
        endMs: mtime?.getTime() ?? null,
      };

      return { meta, native: rows };
    },

    watch(onEvent: (e: SessionEvent) => void): () => void {
      // Phase B: real chokidar integration.
      // Watches the projects directory for added and changed .jsonl files.
      // Emits session-added for new files and session-updated for changed files.
      // Uses persistent:true, ignoreInitial:true per architecture constraints.
      let watcher: ReturnType<typeof chokidar.watch> | null = null;

      try {
        watcher = chokidar.watch(projectsDir, {
          persistent: true,
          ignoreInitial: true,
          depth: 2,
        });

        watcher.on('add', (filePath: string) => {
          if (!filePath.endsWith('.jsonl')) return;
          const relative = path.relative(projectsDir, filePath);
          const parts = relative.split(path.sep);
          if (parts.length < 2) return;
          const slug = parts[0];
          const sessionId = parts[1].replace(/\.jsonl$/, '');
          const id = `${slug}/${sessionId}`;
          onEvent({ kind: 'session-added', provider: 'claude-code', sessionId: id });
        });

        watcher.on('change', (filePath: string) => {
          if (!filePath.endsWith('.jsonl')) return;
          const relative = path.relative(projectsDir, filePath);
          const parts = relative.split(path.sep);
          if (parts.length < 2) return;
          const slug = parts[0];
          const sessionId = parts[1].replace(/\.jsonl$/, '');
          const id = `${slug}/${sessionId}`;
          onEvent({ kind: 'session-updated', provider: 'claude-code', sessionId: id });
        });

        watcher.on('error', (err: unknown) => {
          console.warn('[noctrace] claude-code provider watcher error:', err instanceof Error ? err.message : String(err));
        });
      } catch (err) {
        // If the projects directory doesn't exist, chokidar may throw — degrade gracefully
        console.warn('[noctrace] claude-code provider: could not start watcher:', err instanceof Error ? err.message : String(err));
      }

      return () => {
        watcher?.close().catch(() => {});
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read the first `maxBytes` of a file as a UTF-8 string.
 * Used for fast timestamp extraction without loading the full file.
 */
async function readFirstChunk(filePath: string, maxBytes: number): Promise<string> {
  const fh = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(maxBytes);
    const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
    return buf.slice(0, bytesRead).toString('utf8');
  } finally {
    await fh.close();
  }
}

/**
 * Extract the Unix-ms timestamp from the first valid JSON record in a string.
 * Returns null when no timestamp can be found.
 */
function extractFirstTimestamp(chunk: string): number | null {
  const lines = chunk.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(t); } catch { continue; }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue;
    const ts = (parsed as Record<string, unknown>)['timestamp'];
    if (typeof ts === 'string') {
      const ms = new Date(ts).getTime();
      if (!isNaN(ms)) return ms;
    }
  }
  return null;
}
