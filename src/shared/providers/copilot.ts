/**
 * GitHub Copilot Chat provider implementation.
 * Parses VS Code Copilot Chat session JSON files into WaterfallRow[].
 *
 * Session id format (rawSlug): relative path from the workspaceStorage base.
 * e.g. '{hash}/chatSessions/{uuid}.json'
 *
 * Default home: ~/Library/Application Support/Code/User/workspaceStorage
 * Override: COPILOT_HOME env var or copilotHome constructor param.
 *
 * File format: Single JSON file (NOT JSONL). Full rewrite on every update.
 * Each session contains an array of `requests`, each with a `response` array
 * of typed items. Tool invocations are `toolInvocationSerialized` items.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import chokidar from 'chokidar';

import type { WaterfallRow } from '../types.js';
import type { Provider, ProviderCapabilities, TimeWindow, SessionEvent } from './provider.js';
import type { SessionMeta, AgentSession } from '../session.js';

// ---------------------------------------------------------------------------
// Internal type definitions (Copilot JSON format)
// ---------------------------------------------------------------------------

/** Top-level Copilot Chat session file schema. */
interface CopilotSession {
  version: number;
  sessionId: string;
  creationDate: number;
  lastMessageDate: number;
  customTitle?: string;
  responderUsername?: string;
  initialLocation?: string;
  requests: CopilotRequest[];
}

/** A single request/response exchange in a Copilot session. */
interface CopilotRequest {
  requestId: string;
  timestamp: number;
  modelId?: string;
  message?: { text?: string; parts?: unknown[] };
  response?: CopilotResponseItem[];
  result?: {
    timings?: {
      firstProgress?: number;
      totalElapsed?: number;
    };
  };
  agent?: { name?: string };
  modelState?: { value?: number; completedAt?: number };
}

/** A single item in the response array — discriminated by `kind`. */
interface CopilotResponseItem {
  kind: string;
  [key: string]: unknown;
}

/** A tool invocation response item (`kind: 'toolInvocationSerialized'`). */
interface CopilotToolInvocation {
  kind: 'toolInvocationSerialized';
  toolId: string;
  toolCallId: string;
  invocationMessage: string | { value: string; uris?: unknown };
  pastTenseMessage?: string | { value: string; uris?: unknown };
  isComplete?: boolean;
  isConfirmed?: { type: number };
  source?: { type: string; label?: string };
  resultDetails?: unknown[];
  toolSpecificData?: unknown;
  presentation?: string;
  [key: string]: unknown;
}

/** A thinking response item (`kind: 'thinking'`). */
interface CopilotThinking {
  kind: 'thinking';
  value: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Capability descriptor
// ---------------------------------------------------------------------------

const COPILOT_CAPABILITIES: ProviderCapabilities = {
  toolCallGranularity: 'summary',
  contextTracking: false,
  subAgents: false,
  realtime: true,
  tokenAccounting: 'none',
};

// ---------------------------------------------------------------------------
// Tool name mapping
// ---------------------------------------------------------------------------

const TOOL_NAME_MAP: Record<string, string> = {
  copilot_readFile: 'Read',
  copilot_createFile: 'Write',
  copilot_replaceString: 'Edit',
  copilot_multiReplaceString: 'Edit',
  copilot_insertEdit: 'Edit',
  copilot_findFiles: 'Glob',
  copilot_findTextInFiles: 'Grep',
  copilot_listDirectory: 'LS',
  copilot_runInTerminal: 'Bash',
  run_in_terminal: 'Bash',
  copilot_fetchWebPage: 'WebFetch',
  vscode_fetchWebPage_internal: 'WebFetch',
  copilot_getChangedFiles: 'Git',
  copilot_getErrors: 'Diagnostics',
  copilot_getTerminalOutput: 'Bash',
  copilot_searchCodebase: 'Grep',
  vscode_editFile_internal: 'Edit',
  runSubagent: 'Agent',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve Copilot base directory, respecting COPILOT_HOME env var. */
function resolveCopilotHome(override?: string): string {
  if (override) return override;
  return (
    process.env['COPILOT_HOME'] ??
    path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage')
  );
}

/** Map a Copilot toolId to a display name. Falls back to the raw toolId. */
function mapToolName(toolId: string): string {
  return TOOL_NAME_MAP[toolId] ?? toolId;
}

/**
 * Extract a plain string label from an invocationMessage.
 * The field may be a string or an object with a `value` property.
 */
function extractLabel(
  invocationMessage: string | { value: string; uris?: unknown } | undefined,
  toolDisplayName: string,
): string {
  if (!invocationMessage) return toolDisplayName;
  const raw = typeof invocationMessage === 'string'
    ? invocationMessage
    : (typeof invocationMessage === 'object' && 'value' in invocationMessage
      ? String(invocationMessage.value)
      : toolDisplayName);
  return raw.length > 80 ? raw.slice(0, 77) + '...' : raw;
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

/** Convert an absolute path to a display form with ~ for home. */
function toProjectContext(absPath: string | null | undefined): string {
  if (!absPath) return 'unknown';
  const home = os.homedir();
  if (absPath.startsWith(home)) return '~' + absPath.slice(home.length);
  return absPath;
}

/**
 * Read workspace.json from a workspaceStorage hash directory to extract the folder path.
 * Returns null when missing or malformed.
 */
async function readWorkspaceFolder(hashDir: string): Promise<string | null> {
  const wsPath = path.join(hashDir, 'workspace.json');
  try {
    const raw = await fs.readFile(wsPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const folder = (parsed as Record<string, unknown>)['folder'];
    if (typeof folder !== 'string') return null;
    // Strip file:// prefix
    return folder.startsWith('file://') ? folder.slice(7) : folder;
  } catch {
    return null;
  }
}

/** Type guard: checks if a response item is a tool invocation. */
function isToolInvocation(item: CopilotResponseItem): item is CopilotToolInvocation {
  return item.kind === 'toolInvocationSerialized'
    && typeof (item as Record<string, unknown>)['toolId'] === 'string'
    && typeof (item as Record<string, unknown>)['toolCallId'] === 'string';
}

/** Type guard: checks if a response item is a thinking block. */
function isThinking(item: CopilotResponseItem): item is CopilotThinking {
  return item.kind === 'thinking' && typeof (item as Record<string, unknown>)['value'] === 'string';
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

/**
 * Parse a Copilot Chat session JSON string into WaterfallRow[].
 * Skips malformed content with console.warn — never throws.
 */
export function parseCopilotContent(jsonString: string): WaterfallRow[] {
  let session: CopilotSession;
  try {
    const parsed = JSON.parse(jsonString) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('[noctrace] copilot provider: session root is not an object');
      return [];
    }
    session = parsed as CopilotSession;
  } catch (err) {
    console.warn('[noctrace] copilot provider: failed to parse session JSON:', err instanceof Error ? err.message : String(err));
    return [];
  }

  if (!Array.isArray(session.requests)) {
    console.warn('[noctrace] copilot provider: session.requests is not an array');
    return [];
  }

  const rows: WaterfallRow[] = [];
  let sequence = 0;

  for (const request of session.requests) {
    if (!request || typeof request !== 'object') continue;

    const requestTs = typeof request.timestamp === 'number' ? request.timestamp : Date.now();
    const modelId = typeof request.modelId === 'string'
      ? request.modelId.replace(/^copilot\//, '')
      : null;

    // Derive endTime: prefer request.result.timings.totalElapsed, then modelState.completedAt
    const totalElapsed = request.result?.timings?.totalElapsed;
    const completedAt = request.modelState?.completedAt;
    const requestEndMs = typeof totalElapsed === 'number'
      ? requestTs + totalElapsed
      : (typeof completedAt === 'number' ? completedAt : null);

    const responseItems = Array.isArray(request.response) ? request.response : [];
    let hasToolOrThinking = false;

    for (const item of responseItems) {
      if (!item || typeof item.kind !== 'string') continue;

      if (isToolInvocation(item)) {
        hasToolOrThinking = true;
        const displayName = mapToolName(item.toolId);
        const label = extractLabel(
          item.invocationMessage as string | { value: string } | undefined,
          displayName,
        );
        const isComplete = item.isComplete === true;

        const row: WaterfallRow = {
          id: item.toolCallId,
          type: 'tool',
          toolName: displayName,
          label,
          startTime: requestTs,
          endTime: isComplete ? requestEndMs : null,
          duration: isComplete && requestEndMs !== null ? requestEndMs - requestTs : null,
          status: isComplete ? 'success' : 'running',
          parentAgentId: null,
          input: {},
          output: null,
          inputTokens: 0,
          outputTokens: 0,
          tokenDelta: 0,
          contextFillPercent: 0,
          isReread: false,
          isFailure: false,
          children: [],
          tips: [],
          modelName: modelId,
          estimatedCost: null,
          agentType: null,
          agentColor: null,
          sequence: sequence++,
          isFastMode: false,
          parentToolUseId: null,
        };

        rows.push(row);
        continue;
      }

      if (isThinking(item)) {
        hasToolOrThinking = true;
        const thinkingLabel = item.value.length > 80
          ? item.value.slice(0, 77) + '...'
          : item.value;

        const row: WaterfallRow = {
          id: `${request.requestId}-thinking-${sequence}`,
          type: 'tool',
          toolName: 'Thinking',
          label: thinkingLabel || 'Thinking',
          startTime: requestTs,
          endTime: requestEndMs,
          duration: requestEndMs !== null ? requestEndMs - requestTs : null,
          status: 'success',
          parentAgentId: null,
          input: {},
          output: null,
          inputTokens: 0,
          outputTokens: 0,
          tokenDelta: 0,
          contextFillPercent: 0,
          isReread: false,
          isFailure: false,
          children: [],
          tips: [],
          modelName: modelId,
          estimatedCost: null,
          agentType: null,
          agentColor: null,
          sequence: sequence++,
          isFastMode: false,
          parentToolUseId: null,
        };

        rows.push(row);
      }
    }

    // Requests with no tool invocations/thinking → emit a 'turn' row
    if (!hasToolOrThinking) {
      const userText = typeof request.message?.text === 'string' ? request.message.text : '';
      const label = userText.length > 80 ? userText.slice(0, 77) + '...' : userText || 'Chat';

      const row: WaterfallRow = {
        id: request.requestId,
        type: 'turn',
        toolName: '',
        label,
        startTime: requestTs,
        endTime: requestEndMs,
        duration: requestEndMs !== null ? requestEndMs - requestTs : null,
        status: requestEndMs !== null ? 'success' : 'running',
        parentAgentId: null,
        input: {},
        output: null,
        inputTokens: 0,
        outputTokens: 0,
        tokenDelta: 0,
        contextFillPercent: 0,
        isReread: false,
        isFailure: false,
        children: [],
        tips: [],
        modelName: modelId,
        estimatedCost: null,
        agentType: null,
        agentColor: null,
        sequence: sequence++,
        isFastMode: false,
        parentToolUseId: null,
      };

      rows.push(row);
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// listSessions helpers
// ---------------------------------------------------------------------------

/** Collect all chatSessions JSON files under workspaceStorage. */
async function collectChatSessionFiles(baseDir: string): Promise<string[]> {
  const results: string[] = [];
  let hashDirs: string[];
  try {
    hashDirs = await fs.readdir(baseDir);
  } catch {
    return results;
  }

  for (const hashName of hashDirs) {
    const chatDir = path.join(baseDir, hashName, 'chatSessions');
    let fileNames: string[];
    try {
      fileNames = await fs.readdir(chatDir);
    } catch {
      continue;
    }
    for (const fileName of fileNames) {
      if (!fileName.endsWith('.json')) continue;
      results.push(path.join(chatDir, fileName));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

/**
 * Create a GitHub Copilot Chat provider instance.
 *
 * @param copilotHome - Override path to the workspaceStorage base directory.
 *   Defaults to COPILOT_HOME env var or ~/Library/Application Support/Code/User/workspaceStorage.
 */
export function createCopilotProvider(copilotHome?: string): Provider {
  const baseDir = resolveCopilotHome(copilotHome);

  return {
    id: 'copilot',
    displayName: 'GitHub Copilot',
    capabilities: COPILOT_CAPABILITIES,

    async listSessions(window: TimeWindow): Promise<SessionMeta[]> {
      const results: SessionMeta[] = [];
      const files = await collectChatSessionFiles(baseDir);

      for (const filePath of files) {
        const mtime = await safeStatMtime(filePath);
        if (!mtime) continue;

        const mtimeMs = mtime.getTime();
        if (mtimeMs < window.startMs || mtimeMs >= window.endMs) continue;

        // rawSlug: path relative to baseDir
        const rawSlug = path.relative(baseDir, filePath).split(path.sep).join('/');

        // Read workspace.json from the parent hash directory for project context
        const hashDir = path.dirname(path.dirname(filePath)); // chatSessions/../ = hash dir
        const folderPath = await readWorkspaceFolder(hashDir);

        // Read first few KB to get creationDate without loading the full file
        let creationDate: number | null = null;
        let sessionId: string | null = null;
        let modelHint: string | null = null;
        try {
          const fh = await fs.open(filePath, 'r');
          try {
            const buf = Buffer.alloc(4096);
            const { bytesRead } = await fh.read(buf, 0, 4096, 0);
            const chunk = buf.slice(0, bytesRead).toString('utf-8');
            // Parse partial JSON safely — only look for top-level scalar fields
            const cdMatch = chunk.match(/"creationDate"\s*:\s*(\d+)/);
            if (cdMatch) creationDate = parseInt(cdMatch[1], 10);
            const sidMatch = chunk.match(/"sessionId"\s*:\s*"([^"]+)"/);
            if (sidMatch) sessionId = sidMatch[1];
            // Attempt to find first modelId in requests
            const midMatch = chunk.match(/"modelId"\s*:\s*"([^"]+)"/);
            if (midMatch) modelHint = midMatch[1].replace(/^copilot\//, '');
          } finally {
            await fh.close();
          }
        } catch { /* leave as null */ }

        const startMs = creationDate ?? mtimeMs;
        const effectiveSessionId = sessionId ?? rawSlug;

        const meta: SessionMeta = {
          provider: 'copilot',
          sessionId: effectiveSessionId,
          projectContext: toProjectContext(folderPath),
          rawSlug,
          startMs,
          endMs: mtimeMs,
          ...(modelHint ? { modelHint } : {}),
        } as SessionMeta;

        results.push(meta);
      }

      return results;
    },

    async readSession(id: string): Promise<AgentSession> {
      // id is rawSlug: relative path from baseDir, e.g. '{hash}/chatSessions/{uuid}.json'
      const filePath = path.join(baseDir, ...id.split('/'));

      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch {
        throw new Error(`Copilot session not found: ${id}`);
      }

      const mtime = await safeStatMtime(filePath);

      // Extract metadata from the parsed session
      let sessionId: string = id;
      let startMs: number = mtime?.getTime() ?? Date.now();
      let modelHint: string | undefined;

      try {
        const parsed = JSON.parse(content) as unknown;
        if (typeof parsed === 'object' && parsed !== null) {
          const s = parsed as Record<string, unknown>;
          if (typeof s['sessionId'] === 'string') sessionId = s['sessionId'];
          if (typeof s['creationDate'] === 'number') startMs = s['creationDate'];
          // Get modelHint from first request's modelId
          const reqs = s['requests'];
          if (Array.isArray(reqs) && reqs.length > 0) {
            const firstReq = reqs[0] as Record<string, unknown>;
            if (typeof firstReq['modelId'] === 'string') {
              modelHint = firstReq['modelId'].replace(/^copilot\//, '');
            }
          }
        }
      } catch { /* leave defaults */ }

      const hashDir = path.dirname(path.dirname(filePath));
      const folderPath = await readWorkspaceFolder(hashDir);

      const meta: SessionMeta = {
        provider: 'copilot',
        sessionId,
        projectContext: toProjectContext(folderPath),
        rawSlug: id,
        startMs,
        endMs: mtime?.getTime() ?? null,
        ...(modelHint ? { modelHint } : {}),
      } as SessionMeta;

      const rows = parseCopilotContent(content);

      return { meta, native: rows };
    },

    watch(onEvent: (e: SessionEvent) => void): () => void {
      let watcher: ReturnType<typeof chokidar.watch> | null = null;

      try {
        watcher = chokidar.watch(baseDir, {
          persistent: true,
          ignoreInitial: true,
          depth: 3,
          // Only watch JSON files inside chatSessions directories
        });

        watcher.on('add', (filePath: string) => {
          if (!filePath.endsWith('.json')) return;
          if (!filePath.includes('chatSessions')) return;
          const rawSlug = path.relative(baseDir, filePath).split(path.sep).join('/');
          onEvent({ kind: 'session-added', provider: 'copilot', sessionId: rawSlug });
        });

        watcher.on('change', (filePath: string) => {
          if (!filePath.endsWith('.json')) return;
          if (!filePath.includes('chatSessions')) return;
          const rawSlug = path.relative(baseDir, filePath).split(path.sep).join('/');
          onEvent({ kind: 'session-updated', provider: 'copilot', sessionId: rawSlug });
        });

        watcher.on('unlink', (filePath: string) => {
          if (!filePath.endsWith('.json')) return;
          if (!filePath.includes('chatSessions')) return;
          const rawSlug = path.relative(baseDir, filePath).split(path.sep).join('/');
          onEvent({ kind: 'session-removed', provider: 'copilot', sessionId: rawSlug });
        });

        watcher.on('error', (err: unknown) => {
          console.warn('[noctrace] copilot provider watcher error:', err instanceof Error ? err.message : String(err));
        });
      } catch (err) {
        console.warn('[noctrace] copilot provider: could not start watcher:', err instanceof Error ? err.message : String(err));
      }

      return () => {
        watcher?.close().catch(() => {});
      };
    },
  };
}
