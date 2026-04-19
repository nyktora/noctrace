/**
 * Codex CLI provider implementation.
 * Parses OpenAI Codex CLI session JSONL rollout files into WaterfallRow[].
 *
 * Session id format (rawSlug): the path from the `sessions/` directory onward.
 * e.g. '2026/04/15/rollout-2026-04-15T09-00-00-abc123.jsonl'
 *
 * Default home: ~/.codex  Override: CODEX_HOME env var or codexHome constructor param.
 *
 * Record types handled:
 *   SessionMeta, TurnContext, EventMsg (TurnStarted, TurnComplete, TokenCount,
 *   ExecCommandEnd), ResponseItem (FunctionCall, FunctionCallOutput, assistant message)
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import chokidar from 'chokidar';

import type { WaterfallRow } from '../types.js';
import type { Provider, ProviderCapabilities, TimeWindow, SessionEvent } from './provider.js';
import type { SessionMeta, AgentSession } from '../session.js';

// ---------------------------------------------------------------------------
// Internal record types (Codex JSONL format)
// ---------------------------------------------------------------------------

interface CodexSessionMeta {
  type: 'SessionMeta';
  timestamp: string;
  id: string;
  forked_from_id: string | null;
  cwd: string | null;
  source: 'cli' | { SubAgent: { ThreadSpawn: { parent_thread_id: string; depth: number; agent_path: string | null; agent_nickname: string | null; agent_role: string | null } } } | unknown;
  cli_version?: string;
  model_provider?: string;
  agent_nickname?: string | null;
  agent_role?: string | null;
  agent_path?: string | null;
}

interface CodexFunctionCall {
  name: string;
  arguments: string;
  call_id: string;
  id: string;
}

interface CodexFunctionCallOutput {
  call_id: string;
  output: string;
}

interface CodexAssistantMessage {
  role: 'assistant';
  content: Array<{ type: string; text?: string }>;
}

interface CodexTokenInfo {
  total_token_usage: {
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
    reasoning_output_tokens: number;
    total_tokens: number;
  };
  model_context_window: number;
}

interface CodexExecCommandEnd {
  call_id?: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration: number;
  timed_out: boolean;
}

interface TurnTokenData {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  contextWindow: number;
}


// ---------------------------------------------------------------------------
// Capability descriptor
// ---------------------------------------------------------------------------

const CODEX_CAPABILITIES: ProviderCapabilities = {
  toolCallGranularity: 'full',
  contextTracking: true,
  subAgents: true,
  realtime: true,
  tokenAccounting: 'per-turn',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve Codex home directory, respecting CODEX_HOME env var. */
function resolveCodexHome(override?: string): string {
  if (override) return override;
  return process.env['CODEX_HOME'] ?? path.join(os.homedir(), '.codex');
}

/** Read the mtime of a file; returns null on error. */
async function safeStatMtime(filePath: string): Promise<Date | null> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtime;
  } catch {
    return null;
  }
}

/** Convert cwd path to a display form, replacing home directory prefix with ~. */
function toProjectContext(cwd: string | null | undefined): string {
  if (!cwd) return 'unknown';
  const home = os.homedir();
  if (cwd.startsWith(home)) return '~' + cwd.slice(home.length);
  return cwd;
}

/** Parse a single line defensively; returns null on malformed input. */
function parseLine(line: string): Record<string, unknown> | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    console.warn('[noctrace] codex provider: skipping malformed JSONL line:', t.slice(0, 80));
    return null;
  }
}

/** Extract a nested value from an event object by key path. */
function getEventVariant(event: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const v = event[key];
  if (typeof v !== 'object' || v === null) return null;
  return v as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

/**
 * Parse a Codex rollout JSONL string into WaterfallRow[].
 * Skips malformed lines with console.warn — never throws.
 */
export function parseCodexContent(content: string): WaterfallRow[] {
  const lines = content.split('\n');
  const rows: WaterfallRow[] = [];

  // State for pairing and timing
  /** Pending FunctionCall rows awaiting their FunctionCallOutput. */
  const callMap = new Map<string, { row: WaterfallRow; timestamp: number }>();
  /** All rows by call_id (including completed ones), for retroactive ExecCommandEnd patching. */
  const rowByCallId = new Map<string, WaterfallRow>();
  const turnTokens = new Map<string, TurnTokenData>();
  let latestTurnId: string | null = null;
  let latestTurnStartMs = 0;
  let latestTokenData: TurnTokenData | null = null;
  let sequence = 0;

  for (const line of lines) {
    const rec = parseLine(line);
    if (!rec) continue;

    const recType = rec['type'] as string | undefined;
    const timestamp = typeof rec['timestamp'] === 'string'
      ? new Date(rec['timestamp']).getTime()
      : Date.now();

    if (recType === 'EventMsg') {
      const event = rec['event'];
      if (typeof event !== 'object' || event === null) continue;
      const ev = event as Record<string, unknown>;

      const turnStarted = getEventVariant(ev, 'TurnStarted');
      if (turnStarted) {
        latestTurnId = typeof turnStarted['turn_id'] === 'string' ? turnStarted['turn_id'] : null;
        latestTurnStartMs = timestamp;
        continue;
      }

      const turnComplete = getEventVariant(ev, 'TurnComplete');
      if (turnComplete) {
        latestTurnId = typeof turnComplete['turn_id'] === 'string' ? turnComplete['turn_id'] : latestTurnId;
        continue;
      }

      const tokenCount = getEventVariant(ev, 'TokenCount');
      if (tokenCount) {
        const info = tokenCount['info'] as CodexTokenInfo | undefined;
        if (info?.total_token_usage) {
          const td: TurnTokenData = {
            inputTokens: info.total_token_usage.input_tokens,
            outputTokens: info.total_token_usage.output_tokens,
            cachedInputTokens: info.total_token_usage.cached_input_tokens,
            contextWindow: info.model_context_window,
          };
          latestTokenData = td;
          if (latestTurnId) turnTokens.set(latestTurnId, td);
        }
        continue;
      }

      const execEnd = getEventVariant(ev, 'ExecCommandEnd');
      if (execEnd) {
        const execData = execEnd as unknown as CodexExecCommandEnd;
        const isFailure = execData.timed_out === true || execData.exit_code !== 0;
        if (isFailure && execData.call_id) {
          // Patch the row retroactively (ExecCommandEnd may arrive after FunctionCallOutput)
          const target = rowByCallId.get(execData.call_id) ?? callMap.get(execData.call_id)?.row;
          if (target) {
            target.isFailure = true;
            target.status = 'error';
          }
        }
        continue;
      }
      continue;
    }

    if (recType === 'ResponseItem') {
      const item = rec['item'];
      if (typeof item !== 'object' || item === null) continue;
      const it = item as Record<string, unknown>;

      // FunctionCallOutput: pairs with a pending FunctionCall
      if (typeof it['call_id'] === 'string' && typeof it['output'] === 'string' && !it['name'] && !it['role']) {
        const output = it as unknown as CodexFunctionCallOutput;
        const pending = callMap.get(output.call_id);
        if (pending) {
          const { row } = pending;
          row.endTime = timestamp;
          row.duration = timestamp - row.startTime;
          row.output = output.output;
          row.status = 'success';
          callMap.delete(output.call_id);
          // Keep in rowByCallId so ExecCommandEnd can patch retroactively
          rowByCallId.set(output.call_id, row);
        }
        continue;
      }

      // FunctionCall: name + arguments + call_id
      if (typeof it['name'] === 'string' && typeof it['call_id'] === 'string' && typeof it['arguments'] === 'string') {
        const call = it as unknown as CodexFunctionCall;
        let parsedArgs: Record<string, unknown> = {};
        try {
          const a = JSON.parse(call.arguments) as unknown;
          if (typeof a === 'object' && a !== null && !Array.isArray(a)) {
            parsedArgs = a as Record<string, unknown>;
          }
        } catch { /* leave empty */ }

        const tokens = latestTurnId ? (turnTokens.get(latestTurnId) ?? latestTokenData) : latestTokenData;
        const contextWindow = tokens?.contextWindow ?? 128000;
        const fillPct = tokens ? (tokens.inputTokens / contextWindow) * 100 : 0;

        const toolLabel = buildLabel(call.name, parsedArgs);
        const row: WaterfallRow = {
          id: call.call_id,
          type: 'tool',
          toolName: call.name === 'shell' ? 'Bash' : call.name,
          label: toolLabel,
          startTime: timestamp,
          endTime: null,
          duration: null,
          status: 'running',
          parentAgentId: null,
          input: parsedArgs,
          output: null,
          inputTokens: tokens?.inputTokens ?? 0,
          outputTokens: tokens?.outputTokens ?? 0,
          cacheReadTokens: tokens?.cachedInputTokens ?? 0,
          tokenDelta: 0,
          contextFillPercent: fillPct,
          isReread: false,
          isFailure: false,
          children: [],
          tips: [],
          modelName: null,
          estimatedCost: null,
          agentType: null,
          agentColor: null,
          sequence: sequence++,
          isFastMode: false,
          parentToolUseId: null,
          tokenAttribution: null,
        };

        rows.push(row);
        callMap.set(call.call_id, { row, timestamp });
        continue;
      }
    }
  }

  // Any tool calls still in callMap have no matching output (session truncated / running)
  // Leave them as status: 'running'

  return rows;
}

/** Build a human-readable label for a tool call. */
function buildLabel(toolName: string, args: Record<string, unknown>): string {
  const displayName = toolName === 'shell' ? 'Bash' : toolName;
  if (toolName === 'shell') {
    const cmd = typeof args['command'] === 'string' ? args['command'] : '';
    const short = cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd;
    return `Bash: ${short}`;
  }
  const first = Object.values(args)[0];
  if (typeof first === 'string') {
    const short = first.length > 60 ? first.slice(0, 57) + '...' : first;
    return `${displayName}: ${short}`;
  }
  return displayName;
}

/** Extract the session-level metadata record from parsed lines. */
function extractCodexSessionMeta(lines: string[]): CodexSessionMeta | null {
  for (const line of lines) {
    const rec = parseLine(line);
    if (rec?.['type'] === 'SessionMeta') return rec as unknown as CodexSessionMeta;
  }
  return null;
}

// ---------------------------------------------------------------------------
// listSessions helpers
// ---------------------------------------------------------------------------

/** Recursively collect all .jsonl rollout files under a directory. */
async function collectRolloutFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return results;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      const sub = await collectRolloutFiles(full);
      results.push(...sub);
    } else if (stat.isFile() && name.endsWith('.jsonl') && name.startsWith('rollout-')) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

/**
 * Create a Codex CLI provider instance.
 *
 * @param codexHome - Override path to the Codex home directory.
 *   Defaults to CODEX_HOME env var or ~/.codex.
 */
export function createCodexProvider(codexHome?: string): Provider {
  const home = resolveCodexHome(codexHome);
  const sessionsDir = path.join(home, 'sessions');

  return {
    id: 'codex',
    displayName: 'Codex CLI',
    capabilities: CODEX_CAPABILITIES,

    async listSessions(window: TimeWindow): Promise<SessionMeta[]> {
      const results: SessionMeta[] = [];
      const files = await collectRolloutFiles(sessionsDir);

      for (const filePath of files) {
        const mtime = await safeStatMtime(filePath);
        if (!mtime) continue;

        const mtimeMs = mtime.getTime();
        if (mtimeMs < window.startMs || mtimeMs >= window.endMs) continue;

        // rawSlug: path relative to sessionsDir
        const rawSlug = path.relative(sessionsDir, filePath).split(path.sep).join('/');

        // Read first 2048 bytes to get SessionMeta without loading full file
        let metaRecord: CodexSessionMeta | null = null;
        try {
          const fh = await fs.open(filePath, 'r');
          try {
            const buf = Buffer.alloc(2048);
            const { bytesRead } = await fh.read(buf, 0, 2048, 0);
            const chunk = buf.slice(0, bytesRead).toString('utf8');
            metaRecord = extractCodexSessionMeta(chunk.split('\n'));
          } finally {
            await fh.close();
          }
        } catch { /* leave metaRecord as null */ }

        const startMs = metaRecord?.timestamp
          ? new Date(metaRecord.timestamp).getTime()
          : mtimeMs;
        const cwd = metaRecord?.cwd ?? null;
        const sessionId = metaRecord?.id ?? rawSlug;
        const forkedFrom = metaRecord?.forked_from_id ?? null;

        const meta: SessionMeta = {
          provider: 'codex',
          sessionId,
          projectContext: toProjectContext(cwd),
          rawSlug,
          startMs,
          endMs: mtimeMs,
          ...(metaRecord?.model_provider ? { modelHint: metaRecord.model_provider } : {}),
          ...(forkedFrom ? { parentSessionId: forkedFrom } : {}),
        } as SessionMeta;

        results.push(meta);
      }

      return results;
    },

    async readSession(id: string): Promise<AgentSession> {
      // id is the rawSlug: relative path from sessions/, e.g. '2026/04/15/rollout-....jsonl'
      const filePath = path.join(sessionsDir, ...id.split('/'));

      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf8');
      } catch {
        throw new Error(`Codex session not found: ${id}`);
      }

      const lines = content.split('\n');
      const metaRecord = extractCodexSessionMeta(lines);
      const mtime = await safeStatMtime(filePath);

      const startMs = metaRecord?.timestamp
        ? new Date(metaRecord.timestamp).getTime()
        : (mtime?.getTime() ?? Date.now());
      const cwd = metaRecord?.cwd ?? null;
      const sessionId = metaRecord?.id ?? id;
      const forkedFrom = metaRecord?.forked_from_id ?? null;

      const meta: SessionMeta = {
        provider: 'codex',
        sessionId,
        projectContext: toProjectContext(cwd),
        rawSlug: id,
        startMs,
        endMs: mtime?.getTime() ?? null,
        ...(metaRecord?.model_provider ? { modelHint: metaRecord.model_provider } : {}),
        ...(forkedFrom ? { parentSessionId: forkedFrom } : {}),
      } as SessionMeta;

      const rows = parseCodexContent(content);

      return { meta, native: rows };
    },

    watch(onEvent: (e: SessionEvent) => void): () => void {
      let watcher: ReturnType<typeof chokidar.watch> | null = null;

      try {
        watcher = chokidar.watch(sessionsDir, {
          persistent: true,
          ignoreInitial: true,
          depth: 4,
        });

        watcher.on('add', (filePath: string) => {
          if (!filePath.endsWith('.jsonl')) return;
          const rawSlug = path.relative(sessionsDir, filePath).split(path.sep).join('/');
          onEvent({ kind: 'session-added', provider: 'codex', sessionId: rawSlug });
        });

        watcher.on('change', (filePath: string) => {
          if (!filePath.endsWith('.jsonl')) return;
          const rawSlug = path.relative(sessionsDir, filePath).split(path.sep).join('/');
          onEvent({ kind: 'session-updated', provider: 'codex', sessionId: rawSlug });
        });

        watcher.on('unlink', (filePath: string) => {
          if (!filePath.endsWith('.jsonl')) return;
          const rawSlug = path.relative(sessionsDir, filePath).split(path.sep).join('/');
          onEvent({ kind: 'session-removed', provider: 'codex', sessionId: rawSlug });
        });

        watcher.on('error', (err: unknown) => {
          console.warn('[noctrace] codex provider watcher error:', err instanceof Error ? err.message : String(err));
        });
      } catch (err) {
        console.warn('[noctrace] codex provider: could not start watcher:', err instanceof Error ? err.message : String(err));
      }

      return () => {
        watcher?.close().catch(() => {});
      };
    },
  };
}
