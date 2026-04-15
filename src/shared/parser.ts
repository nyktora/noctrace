/**
 * JSONL parser for Claude Code session logs.
 * Pure module: no file I/O, no side effects.
 */
import type { WaterfallRow } from './types.js';
import { getPricing, computeCost } from './token-cost.js';

// Re-export from session-metadata (moved to reduce file size)
export { parseCompactionBoundaries } from './session-metadata.js';

// ---------------------------------------------------------------------------
// Raw record types (internal)
// ---------------------------------------------------------------------------

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'thinking'; thinking: string };

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

interface AssistantRecord {
  type: 'assistant';
  sessionId: string;
  timestamp: string;
  uuid: string;
  parentUuid: string | null;
  parent_tool_use_id?: string | null;
  sequence?: number;
  message: {
    role: 'assistant';
    model?: string;
    content: ContentBlock[];
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    speed?: 'fast' | 'normal';
    error?: string;
  };
}

interface UserRecord {
  type: 'user';
  sessionId: string;
  timestamp: string;
  uuid: string;
  parentUuid: string | null;
  message: { role: 'user'; content: string | ToolResultBlock[] };
  isMeta?: boolean;
  /** Present on tool_result records for Agent/Task calls; contains sub-agent linkage data */
  toolUseResult?: {
    agentId?: string;
    agentType?: string;
    color?: string;
    totalToolUseCount?: number;
    totalDurationMs?: number;
  };
}

interface SystemRecord {
  type: 'system';
  sessionId: string;
  timestamp: string;
  uuid: string;
  parentUuid: string | null;
  subtype?: string;
  sequence?: number;
}

interface ProgressRecord {
  type: 'progress';
  sessionId: string;
  timestamp: string;
  uuid: string;
  parentUuid: string | null;
  toolUseID?: string;
  parentToolUseID?: string;
  data?: {
    type?: string;
    message?: {
      type?: string;
      timestamp?: string;
      message?: {
        role?: string;
        content?: ContentBlock[] | ToolResultBlock[] | string;
        usage?: {
          input_tokens: number;
          output_tokens: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
      };
    };
  };
}

type KnownRecord = AssistantRecord | UserRecord | SystemRecord | ProgressRecord;

interface PendingRow {
  id: string;
  toolName: string;
  label: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  status: WaterfallRow['status'];
  input: Record<string, unknown>;
  output: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  modelName: string | null;
  contextFillPercent: number;
  isReread: boolean;
  assistantUuid: string;
  assistantParentUuid: string | null;
  sequence: number | null;
  isFastMode: boolean;
  parentToolUseId: string | null;
}

// ---------------------------------------------------------------------------
// Type guards and helpers
// ---------------------------------------------------------------------------

function isObj(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isToolUse(b: ContentBlock): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } {
  return b.type === 'tool_use';
}

const DEFAULT_MAX_TOKENS = 200_000;

/** Shorten an MCP tool name: "mcp__server__tool_name" → "server: tool_name" */
function shortenMcpName(name: string): string {
  const match = name.match(/^mcp__([^_]+(?:-[^_]+)*)__(.+)$/);
  if (match) {
    const server = match[1].replace(/-/g, ' ');
    const tool = match[2].replace(/_/g, ' ');
    return `${server}: ${tool}`;
  }
  return name;
}

/** Build a human-readable label from tool name and input. */
function buildLabel(name: string, input: Record<string, unknown>): string {
  const fp = String(input['file_path'] ?? '');
  const cmd = String(input['command'] ?? '');
  if (name === 'Read') return `Read: ${fp}`;
  if (name === 'Write') return `Write: ${fp}`;
  if (name === 'Edit' || name === 'MultiEdit') return `Edit: ${fp}`;
  if (name === 'Bash') return `Bash: ${cmd}`;
  if (name === 'Agent' || name === 'Task') {
    const desc = typeof input['description'] === 'string' ? input['description'] as string : '';
    const agentName = typeof input['name'] === 'string' ? input['name'] as string : '';
    const label = agentName || desc;
    return label ? `Agent (${label})` : 'Agent';
  }
  if (name.startsWith('mcp__')) return shortenMcpName(name);
  return name;
}

function extractContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === 'string') return content;
  return content.map((p) => (p.type === 'text' ? (p.text ?? '') : '')).join('');
}

/** Parse one JSONL line. Returns null for blank lines, malformed JSON, or unknown types. */
function parseLine(line: string, idx: number): KnownRecord | null {
  const t = line.trim();
  if (!t) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(t); } catch {
    console.warn(`[noctrace] Skipping malformed JSON at line ${idx + 1}`);
    return null;
  }
  if (!isObj(parsed)) {
    console.warn(`[noctrace] Skipping non-object record at line ${idx + 1}`);
    return null;
  }
  const type = parsed['type'];
  if (type !== 'assistant' && type !== 'user' && type !== 'system' && type !== 'progress' && type !== 'result') return null;
  return parsed as unknown as KnownRecord;
}

function isAgent(name: string): boolean {
  return name === 'Agent' || name === 'Task';
}

/**
 * Returns true when a tool result with is_error=true represents a tool execution
 * failure (crash, timeout, permission denied) rather than a tool that ran and
 * returned an error value. We distinguish by looking for crash/failure keywords
 * in the output text.
 */
function isToolFailure(output: string): boolean {
  const lower = output.toLowerCase();
  return (
    lower.includes('process exited with') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('permission denied') ||
    lower.includes('killed') ||
    lower.includes('segmentation fault') ||
    lower.includes('posttoolusedfailure') ||
    lower.includes('tool execution failed') ||
    lower.includes('failed to execute')
  );
}

/**
 * Classify an API stop failure message into a short error class label.
 * Returns e.g. "Rate Limit", "Billing Error", "Server Error", "Auth Error".
 */
function classifyStopFailure(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('rate_limit') || lower.includes('429')) return 'Rate Limit';
  if (lower.includes('billing') || lower.includes('payment') || lower.includes('credit')) return 'Billing Error';
  if (lower.includes('auth') || lower.includes('unauthorized') || lower.includes('403') || lower.includes('401')) return 'Auth Error';
  if (lower.includes('overloaded') || lower.includes('529')) return 'Overloaded';
  return 'Server Error';
}

/**
 * Map structured assistant.error field to a display label.
 * Falls back to classifyStopFailure for unknown values.
 */
function classifyAssistantError(errorField: string): string {
  const map: Record<string, string> = {
    rate_limit: 'Rate Limit',
    billing_error: 'Billing Error',
    authentication_failed: 'Auth Error',
    server_error: 'Server Error',
    invalid_request: 'Invalid Request',
    max_output_tokens: 'Max Tokens',
    unknown: 'Server Error',
  };
  return map[errorField] ?? classifyStopFailure(errorField);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse the full JSONL string content of a Claude Code session log.
 * Returns WaterfallRow[] with agent hierarchy. Never throws.
 */
export function parseJsonlContent(content: string): WaterfallRow[] {
  const lines = content.split('\n');
  const records: KnownRecord[] = [];
  for (let i = 0; i < lines.length; i++) {
    const r = parseLine(lines[i], i);
    if (r) records.push(r);
  }

  // Build result map: tool_use_id → result data
  // For Agent/Task tool calls, also capture totalDurationMs so the agent bar
  // can span its real lifetime instead of showing just the instant dispatch time.
  const resultMap = new Map<string, { endTime: number; output: string; isError: boolean; isFailure: boolean; totalDurationMs?: number; agentType?: string; agentColor?: string }>();
  for (const rec of records) {
    if (rec.type !== 'user') continue;
    const ur = rec as UserRecord;
    const c = ur.message.content;
    if (!Array.isArray(c)) continue;
    const endTime = new Date(rec.timestamp).getTime();
    for (const block of c) {
      if (isObj(block) && block['type'] === 'tool_result' && typeof block['tool_use_id'] === 'string') {
        const tb = block as unknown as ToolResultBlock;
        const output = extractContent(tb.content);
        const isError = tb.is_error === true;
        resultMap.set(tb.tool_use_id, {
          endTime,
          output,
          isError,
          isFailure: isError && isToolFailure(output),
          totalDurationMs: ur.toolUseResult?.totalDurationMs,
          agentType: ur.toolUseResult?.agentType,
          agentColor: ur.toolUseResult?.color,
        });
      }
    }
  }

  // Extract sub-agent tool_use/tool_result from progress records.
  // Progress records have: parentToolUseID → links to parent agent's tool_use id.
  // data.message.message.content[] → contains the sub-agent's tool_use / tool_result blocks.
  const subAgentResultMap = new Map<string, { endTime: number; output: string; isError: boolean }>();
  /** parentToolUseID for each sub-agent tool_use id */
  const subAgentParentMap = new Map<string, string>();

  for (const rec of records) {
    if (rec.type !== 'progress') continue;
    const pr = rec as ProgressRecord;
    const ptuid = pr.parentToolUseID;
    if (!ptuid) continue;
    const inner = pr.data?.message?.message;
    if (!inner || !isObj(inner)) continue;
    const content = (inner as Record<string, unknown>)['content'];
    if (!Array.isArray(content)) continue;
    const ts = pr.data?.message?.timestamp ?? rec.timestamp;
    const endTime = new Date(ts).getTime();

    for (const block of content) {
      if (!isObj(block)) continue;
      if (block['type'] === 'tool_result' && typeof block['tool_use_id'] === 'string') {
        const tb = block as unknown as ToolResultBlock;
        subAgentResultMap.set(tb.tool_use_id, {
          endTime,
          output: extractContent(tb.content),
          isError: tb.is_error === true,
        });
      }
    }
  }

  // Second pass for progress: extract tool_use blocks
  interface SubAgentPending {
    id: string;
    toolName: string;
    label: string;
    startTime: number;
    input: Record<string, unknown>;
    inputTokens: number;
    outputTokens: number;
    parentAgentToolUseId: string;
  }
  const subAgentPending: SubAgentPending[] = [];

  for (const rec of records) {
    if (rec.type !== 'progress') continue;
    const pr = rec as ProgressRecord;
    const ptuid = pr.parentToolUseID;
    if (!ptuid) continue;
    const inner = pr.data?.message?.message;
    if (!inner || !isObj(inner)) continue;
    const content = (inner as Record<string, unknown>)['content'];
    if (!Array.isArray(content)) continue;
    const ts = pr.data?.message?.timestamp ?? rec.timestamp;
    const startTime = new Date(ts).getTime();
    const usage = (inner as Record<string, unknown>)['usage'];
    let inputTokens = 0;
    let outputTokens = 0;
    if (isObj(usage)) {
      inputTokens = (typeof usage['input_tokens'] === 'number' ? usage['input_tokens'] : 0)
        + (typeof usage['cache_creation_input_tokens'] === 'number' ? usage['cache_creation_input_tokens'] : 0)
        + (typeof usage['cache_read_input_tokens'] === 'number' ? usage['cache_read_input_tokens'] : 0);
      outputTokens = typeof usage['output_tokens'] === 'number' ? usage['output_tokens'] : 0;
    }

    for (const block of content) {
      if (!isObj(block) || block['type'] !== 'tool_use') continue;
      const id = block['id'];
      const name = block['name'];
      const input = block['input'];
      if (typeof id !== 'string' || typeof name !== 'string') continue;
      const inp = isObj(input) ? input : {};
      subAgentParentMap.set(id, ptuid);
      subAgentPending.push({
        id,
        toolName: name,
        label: buildLabel(name, inp),
        startTime,
        input: inp,
        inputTokens,
        outputTokens,
        parentAgentToolUseId: ptuid,
      });
    }
  }

  // Collect pending rows from top-level assistant records
  const seenPaths = new Set<string>();
  const pending: PendingRow[] = [];

  for (const rec of records) {
    if (rec.type !== 'assistant') continue;
    const ar = rec as AssistantRecord;
    const startTime = new Date(ar.timestamp).getTime();
    const usage = ar.message.usage;
    const cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
    const cacheCreateTokens = usage?.cache_creation_input_tokens ?? 0;
    const rawInputTokens = usage?.input_tokens ?? 0;
    const inputTokens = rawInputTokens + cacheCreateTokens + cacheReadTokens;
    const outputTokens = usage?.output_tokens ?? 0;
    const modelName = typeof ar.message.model === 'string' ? ar.message.model : null;
    const isFastMode = ar.message.speed === 'fast';
    const parentToolUseId = typeof ar.parent_tool_use_id === 'string' ? ar.parent_tool_use_id : null;
    const sequence = typeof ar.sequence === 'number' ? ar.sequence : null;
    const contextFillPercent = 0; // recalculated after peak detection

    for (const block of ar.message.content) {
      if (!isToolUse(block)) continue;
      const fp = block.name === 'Read' && typeof block.input['file_path'] === 'string'
        ? (block.input['file_path'] as string) : null;
      const isReread = fp !== null && seenPaths.has(fp);
      if (fp !== null) seenPaths.add(fp);

      const res = resultMap.get(block.id);
      // For agent tool calls with totalDurationMs, use the real duration
      // instead of the instant dispatch-to-result time.
      const agentRealDuration = res?.totalDurationMs && isAgent(block.name) ? res.totalDurationMs : null;
      const effectiveEndTime = agentRealDuration !== null
        ? startTime + agentRealDuration
        : (res ? res.endTime : null);
      const effectiveDuration = agentRealDuration !== null
        ? agentRealDuration
        : (res ? Math.max(0, res.endTime - startTime) : null);
      pending.push({
        id: block.id,
        toolName: block.name,
        label: buildLabel(block.name, block.input),
        startTime,
        endTime: effectiveEndTime,
        duration: effectiveDuration,
        status: res ? (res.isError ? 'error' : 'success') : 'running',
        input: block.input,
        output: res ? res.output : null,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreateTokens,
        modelName,
        contextFillPercent,
        isReread,
        assistantUuid: ar.uuid,
        assistantParentUuid: ar.parentUuid,
        sequence,
        isFastMode,
        parentToolUseId,
      });
    }
  }

  // Build assistant uuid map for ancestry resolution (top-level records)
  const asstMap = new Map<string, AssistantRecord>();
  for (const rec of records) {
    if (rec.type === 'assistant') asstMap.set(rec.uuid, rec as AssistantRecord);
  }

  const agentRows = pending.filter((r) => isAgent(r.toolName));

  function ancestorUuids(start: string | null): Set<string> {
    const visited = new Set<string>();
    let cur = start;
    while (cur) {
      if (visited.has(cur)) break;
      visited.add(cur);
      const a = asstMap.get(cur);
      if (!a) break;
      cur = a.parentUuid;
    }
    return visited;
  }

  function parentAgentId(row: PendingRow): string | null {
    if (isAgent(row.toolName)) return null;
    const ancestors = ancestorUuids(row.assistantParentUuid);
    for (const ag of agentRows) {
      if (ancestors.has(ag.assistantUuid)) return ag.id;
    }
    return null;
  }

  // First pass: create rows from top-level assistant records
  const rowById = new Map<string, WaterfallRow>();
  for (const p of pending) {
    const pricing = getPricing(p.modelName);
    const rawInput = Math.max(0, p.inputTokens - p.cacheReadTokens - p.cacheCreateTokens);
    const estimatedCost = p.inputTokens > 0 || p.outputTokens > 0
      ? computeCost(pricing, rawInput, p.outputTokens, p.cacheReadTokens, p.cacheCreateTokens)
      : null;
    const res = resultMap.get(p.id);
    rowById.set(p.id, {
      id: p.id,
      type: isAgent(p.toolName) ? 'agent' : 'tool',
      toolName: p.toolName,
      label: p.label,
      startTime: p.startTime,
      endTime: p.endTime,
      duration: p.duration,
      status: p.status,
      parentAgentId: null,
      input: p.input,
      output: p.output,
      inputTokens: p.inputTokens,
      outputTokens: p.outputTokens,
      tokenDelta: 0,
      contextFillPercent: p.contextFillPercent,
      isReread: p.isReread,
      isFailure: res?.isFailure ?? false,
      children: [],
      tips: [],
      modelName: p.modelName,
      estimatedCost,
      agentType: res?.agentType ?? null,
      agentColor: res?.agentColor ?? null,
      sequence: p.sequence,
      isFastMode: p.isFastMode,
      parentToolUseId: p.parentToolUseId,
    });
  }

  // Create rows from sub-agent progress records
  for (const sp of subAgentPending) {
    if (rowById.has(sp.id)) continue; // skip if already exists as top-level
    const res = subAgentResultMap.get(sp.id);
    const fp = sp.toolName === 'Read' && typeof sp.input['file_path'] === 'string'
      ? (sp.input['file_path'] as string) : null;
    const isReread = fp !== null && seenPaths.has(fp);
    if (fp !== null) seenPaths.add(fp);

    // Find the parent agent row to inherit contextFillPercent
    const parentRow = rowById.get(sp.parentAgentToolUseId);
    const ctxFill = parentRow ? parentRow.contextFillPercent : 0;

    rowById.set(sp.id, {
      id: sp.id,
      type: 'tool',
      toolName: sp.toolName,
      label: sp.label,
      startTime: sp.startTime,
      endTime: res ? res.endTime : null,
      duration: res ? res.endTime - sp.startTime : null,
      status: res ? (res.isError ? 'error' : 'success') : 'running',
      parentAgentId: sp.parentAgentToolUseId,
      input: sp.input,
      output: res ? res.output : null,
      inputTokens: sp.inputTokens,
      outputTokens: sp.outputTokens,
      tokenDelta: 0,
      contextFillPercent: ctxFill,
      isReread,
      isFailure: res ? (res.isError && isToolFailure(res.output)) : false,
      children: [],
      tips: [],
      modelName: null,
      estimatedCost: null,
      agentType: null,
      agentColor: null,
      sequence: null,
      isFastMode: false,
      parentToolUseId: null,
    });
  }

  // Nest children: top-level rows use parentUuid ancestry, sub-agent rows use parentToolUseID
  const top: WaterfallRow[] = [];
  for (const p of pending) {
    const row = rowById.get(p.id)!;
    const pid = parentAgentId(p);
    row.parentAgentId = pid;
    if (pid !== null) {
      const parent = rowById.get(pid);
      if (parent) { parent.children.push(row); continue; }
    }
    top.push(row);
  }

  // Nest sub-agent children under their parent agent
  for (const sp of subAgentPending) {
    const row = rowById.get(sp.id);
    if (!row) continue;
    const parent = rowById.get(sp.parentAgentToolUseId);
    if (parent && parent.type === 'agent') {
      // Avoid duplicates
      if (!parent.children.some((c) => c.id === row.id)) {
        parent.children.push(row);
      }
    }
  }

  // Sort children by startTime within each agent
  for (const row of rowById.values()) {
    if (row.children.length > 1) {
      row.children.sort((a, b) => a.startTime !== b.startTime ? a.startTime - b.startTime : (a.sequence ?? 0) - (b.sequence ?? 0));
    }
  }

  // Stretch agent rows to span from dispatch to last child completion
  for (const row of rowById.values()) {
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

  // Recalculate contextFillPercent using the observed peak as the effective window.
  // Different models auto-compact at different thresholds (e.g. ~300k for Opus 4.6 1M).
  // Using the peak avoids showing >100% and gives accurate relative fill.
  let peakTokens = 0;
  for (const row of rowById.values()) {
    if (row.inputTokens > peakTokens) peakTokens = row.inputTokens;
  }
  const effectiveWindow = peakTokens > DEFAULT_MAX_TOKENS ? peakTokens : DEFAULT_MAX_TOKENS;
  for (const row of rowById.values()) {
    row.contextFillPercent = (row.inputTokens / effectiveWindow) * 100;
  }

  // Compute per-row token delta from consecutive inputTokens (sorted by startTime)
  function computeDeltas(rows: WaterfallRow[]): void {
    const sorted = [...rows].sort((a, b) => a.startTime - b.startTime);
    let prev = 0;
    for (const row of sorted) {
      row.tokenDelta = row.inputTokens > 0 ? Math.max(0, row.inputTokens - prev) : 0;
      if (row.inputTokens > 0) prev = row.inputTokens;
      if (row.children.length > 0) computeDeltas(row.children);
    }
  }
  computeDeltas(top);

  // Detect API stop failures from system records (rate limit, billing, auth, server errors).
  // These appear as system records with subtype 'stop_failure' or similar.
  // We insert them as top-level 'api-error' rows at their point in time.
  for (const rec of records) {
    if (rec.type !== 'system') continue;
    const sr = rec as SystemRecord;
    const subtype = sr.subtype ?? '';
    const isStopFailure =
      subtype === 'stop_failure' ||
      subtype === 'api_error' ||
      subtype === 'request_failed';
    if (!isStopFailure) continue;
    const ts = new Date(sr.timestamp).getTime();
    // Try to extract an error message from the record's top-level fields.
    const raw = rec as unknown as Record<string, unknown>;
    const errorMsg =
      (typeof raw['error'] === 'string' ? raw['error'] : null) ||
      (typeof raw['message'] === 'string' ? raw['message'] : null) ||
      subtype;
    const errorClass = classifyStopFailure(errorMsg);
    const rowId = `api-error-${sr.uuid}`;
    top.push({
      id: rowId,
      type: 'api-error',
      toolName: errorClass,
      label: errorMsg,
      startTime: ts,
      endTime: ts,
      duration: 0,
      status: 'error',
      parentAgentId: null,
      input: {},
      output: errorMsg,
      inputTokens: 0,
      outputTokens: 0,
      tokenDelta: 0,
      contextFillPercent: 0,
      isReread: false,
      isFailure: false,
      children: [],
      tips: [],
      modelName: null,
      estimatedCost: null,
      agentType: null,
      agentColor: null,
      sequence: null,
      isFastMode: false,
      parentToolUseId: null,
    });
  }

  // Detect API errors from typed assistant.error field (newer Claude Code versions)
  for (const rec of records) {
    if (rec.type !== 'assistant') continue;
    const ar = rec as AssistantRecord;
    if (!ar.message.error) continue;
    const ts = new Date(ar.timestamp).getTime();
    const errorClass = classifyAssistantError(ar.message.error);
    const rowId = `api-error-asst-${ar.uuid}`;
    // Skip if a system-record api-error already exists at this timestamp (avoid duplicates)
    if (top.some((r) => r.type === 'api-error' && Math.abs(r.startTime - ts) < 1000)) continue;
    top.push({
      id: rowId,
      type: 'api-error',
      toolName: errorClass,
      label: ar.message.error,
      startTime: ts,
      endTime: ts,
      duration: 0,
      status: 'error',
      parentAgentId: null,
      input: {},
      output: ar.message.error,
      inputTokens: 0,
      outputTokens: 0,
      tokenDelta: 0,
      contextFillPercent: 0,
      isReread: false,
      isFailure: false,
      children: [],
      tips: [],
      modelName: null,
      estimatedCost: null,
      agentType: null,
      agentColor: null,
      sequence: typeof ar.sequence === 'number' ? ar.sequence : null,
      isFastMode: false,
      parentToolUseId: null,
    });
  }

  // Detect hook lifecycle events from system records
  const hookStartMap = new Map<string, number>(); // hookKey → startTime
  for (const rec of records) {
    if (rec.type !== 'system') continue;
    const sr = rec as SystemRecord;
    const subtype = sr.subtype ?? '';
    if (subtype !== 'hook_started' && subtype !== 'hook_response') continue;
    const raw = rec as unknown as Record<string, unknown>;
    const hookName = typeof raw['hook_name'] === 'string' ? raw['hook_name'] : subtype;
    const hookId = typeof raw['hook_id'] === 'string' ? raw['hook_id'] : sr.uuid;
    const ts = new Date(sr.timestamp).getTime();

    if (subtype === 'hook_started') {
      hookStartMap.set(hookId, ts);
    } else if (subtype === 'hook_response') {
      const startTs = hookStartMap.get(hookId) ?? ts;
      const duration = ts - startTs;
      top.push({
        id: `hook-${hookId}`,
        type: 'hook',
        toolName: hookName,
        label: `Hook: ${hookName}`,
        startTime: startTs,
        endTime: ts,
        duration,
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
        modelName: null,
        estimatedCost: null,
        agentType: null,
        agentColor: null,
        sequence: typeof (sr as SystemRecord).sequence === 'number' ? ((sr as SystemRecord).sequence as number) : null,
        isFastMode: false,
        parentToolUseId: null,
      });
    }
  }

  // Create turn rows for user prompts (string content = human text, not tool results)
  for (const rec of records) {
    if (rec.type !== 'user') continue;
    const ur = rec as UserRecord;
    // Array content means tool_result records — skip
    if (Array.isArray(ur.message.content)) continue;
    if (ur.isMeta === true) continue;
    const raw = rec as unknown as Record<string, unknown>;
    if (raw['isSynthetic'] === true) continue;
    const text = typeof ur.message.content === 'string' ? ur.message.content : '';
    if (!text.trim()) continue;

    const ts = new Date(ur.timestamp).getTime();
    const truncated = text.length > 120 ? text.slice(0, 117) + '...' : text;

    top.push({
      id: `turn-user-${ur.uuid}`,
      type: 'turn',
      toolName: 'UserPrompt',
      label: truncated,
      startTime: ts,
      endTime: ts,
      duration: 0,
      status: 'success',
      parentAgentId: null,
      input: {},
      output: text,
      inputTokens: 0,
      outputTokens: 0,
      tokenDelta: 0,
      contextFillPercent: 0,
      isReread: false,
      isFailure: false,
      children: [],
      tips: [],
      modelName: null,
      estimatedCost: null,
      agentType: null,
      agentColor: null,
      sequence: null,
      isFastMode: false,
      parentToolUseId: null,
    });
  }

  // Create turn rows for assistant text-only responses (no tool_use blocks)
  for (const rec of records) {
    if (rec.type !== 'assistant') continue;
    const ar = rec as AssistantRecord;
    const hasToolUse = ar.message.content.some(b => isToolUse(b));
    if (hasToolUse) continue; // already handled by the tool row creation loop
    if (ar.message.error) continue; // already handled by api-error loop

    const texts = ar.message.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text);
    const fullText = texts.join('\n');
    if (!fullText.trim()) continue;

    const ts = new Date(ar.timestamp).getTime();
    const truncated = fullText.length > 120 ? fullText.slice(0, 117) + '...' : fullText;
    const usage = ar.message.usage;
    const inputTokens = (usage?.input_tokens ?? 0)
      + (usage?.cache_creation_input_tokens ?? 0)
      + (usage?.cache_read_input_tokens ?? 0);
    const outputTokens = usage?.output_tokens ?? 0;
    const modelName = typeof ar.message.model === 'string' ? ar.message.model : null;

    top.push({
      id: `turn-asst-${ar.uuid}`,
      type: 'turn',
      toolName: 'AssistantResponse',
      label: truncated,
      startTime: ts,
      endTime: ts,
      duration: 0,
      status: 'success',
      parentAgentId: null,
      input: {},
      output: fullText,
      inputTokens,
      outputTokens,
      tokenDelta: 0,
      contextFillPercent: (inputTokens / effectiveWindow) * 100,
      isReread: false,
      isFailure: false,
      children: [],
      tips: [],
      modelName,
      estimatedCost: null,
      agentType: null,
      agentColor: null,
      sequence: typeof ar.sequence === 'number' ? ar.sequence : null,
      isFastMode: ar.message.speed === 'fast',
      parentToolUseId: null,
    });
  }

  // Chronological sort: tool rows, turn rows, api-errors, and hook rows are pushed
  // in separate passes above. Without this sort, turn rows cluster at the end of
  // the waterfall instead of interleaving with the tool calls they happened between.
  top.sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    return (a.sequence ?? 0) - (b.sequence ?? 0);
  });

  return top;
}

/**
 * Extract the sessionId from the first valid record. Returns null if none found.
 */
export function extractSessionId(content: string): string | null {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const r = parseLine(lines[i], i);
    if (r && typeof r.sessionId === 'string') return r.sessionId;
  }
  return null;
}

/**
 * Extract a human-readable session title from JSONL content.
 * Checks top-level fields `sessionTitle`, `title`, and `displayName` on any record,
 * and also inspects system records for a `title` field.
 * Returns null if no title is found.
 */
export function extractSessionTitle(content: string): string | null {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (!isObj(parsed)) continue;

    // Check top-level title fields in priority order
    for (const field of ['sessionTitle', 'title', 'displayName'] as const) {
      const val = parsed[field];
      if (typeof val === 'string' && val.trim()) return val.trim();
    }
  }
  return null;
}

/**
 * Parse a sub-agent JSONL file into flat WaterfallRow objects.
 * Does not attempt agent nesting — all tool calls are returned as a flat array.
 * Never throws; malformed lines are skipped with a warning.
 */
export function parseSubAgentContent(content: string): WaterfallRow[] {
  const lines = content.split('\n');
  const records: KnownRecord[] = [];
  for (let i = 0; i < lines.length; i++) {
    const r = parseLine(lines[i], i);
    if (r) records.push(r);
  }

  // Build result map: tool_use_id → result data
  const resultMap = new Map<string, { endTime: number; output: string; isError: boolean; isFailure: boolean }>();
  for (const rec of records) {
    if (rec.type !== 'user') continue;
    const c = (rec as UserRecord).message.content;
    if (!Array.isArray(c)) continue;
    const endTime = new Date(rec.timestamp).getTime();
    for (const block of c) {
      if (isObj(block) && block['type'] === 'tool_result' && typeof block['tool_use_id'] === 'string') {
        const tb = block as unknown as ToolResultBlock;
        const output = extractContent(tb.content);
        const isError = tb.is_error === true;
        resultMap.set(tb.tool_use_id, {
          endTime,
          output,
          isError,
          isFailure: isError && isToolFailure(output),
        });
      }
    }
  }

  const seenPaths = new Set<string>();
  const rows: WaterfallRow[] = [];

  // Collect peak tokens across all assistant records for contextFillPercent calculation
  let peakTokens = 0;
  for (const rec of records) {
    if (rec.type !== 'assistant') continue;
    const ar = rec as AssistantRecord;
    const usage = ar.message.usage;
    const inputTokens = (usage?.input_tokens ?? 0)
      + (usage?.cache_creation_input_tokens ?? 0)
      + (usage?.cache_read_input_tokens ?? 0);
    if (inputTokens > peakTokens) peakTokens = inputTokens;
  }
  const effectiveWindow = peakTokens > DEFAULT_MAX_TOKENS ? peakTokens : DEFAULT_MAX_TOKENS;

  for (const rec of records) {
    if (rec.type !== 'assistant') continue;
    const ar = rec as AssistantRecord;
    const startTime = new Date(ar.timestamp).getTime();
    const usage = ar.message.usage;
    const cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
    const cacheCreateTokens = usage?.cache_creation_input_tokens ?? 0;
    const rawInputTokens = usage?.input_tokens ?? 0;
    const inputTokens = rawInputTokens + cacheCreateTokens + cacheReadTokens;
    const outputTokens = usage?.output_tokens ?? 0;
    const modelName = typeof ar.message.model === 'string' ? ar.message.model : null;
    const contextFillPercent = (inputTokens / effectiveWindow) * 100;
    const pricing = getPricing(modelName);
    const rawInput = Math.max(0, rawInputTokens);

    for (const block of ar.message.content) {
      if (!isToolUse(block)) continue;
      const fp = block.name === 'Read' && typeof block.input['file_path'] === 'string'
        ? (block.input['file_path'] as string) : null;
      const isReread = fp !== null && seenPaths.has(fp);
      if (fp !== null) seenPaths.add(fp);

      const estimatedCost = inputTokens > 0 || outputTokens > 0
        ? computeCost(pricing, rawInput, outputTokens, cacheReadTokens, cacheCreateTokens)
        : null;

      const res = resultMap.get(block.id);
      rows.push({
        id: block.id,
        type: isAgent(block.name) ? 'agent' : 'tool',
        toolName: block.name,
        label: buildLabel(block.name, block.input),
        startTime,
        endTime: res ? res.endTime : null,
        duration: res ? Math.max(0, res.endTime - startTime) : null,
        status: res ? (res.isError ? 'error' : 'success') : 'running',
        parentAgentId: null,
        input: block.input,
        output: res ? res.output : null,
        inputTokens,
        outputTokens,
        tokenDelta: 0,
        contextFillPercent,
        isReread,
        isFailure: res?.isFailure ?? false,
        children: [],
        tips: [],
        modelName,
        estimatedCost,
        agentType: null,
        agentColor: null,
        sequence: null,
        isFastMode: false,
        parentToolUseId: null,
      });
    }
  }

  // Detect API stop failures within sub-agent content
  for (const rec of records) {
    if (rec.type !== 'system') continue;
    const sr = rec as SystemRecord;
    const subtype = sr.subtype ?? '';
    const isStopFailure =
      subtype === 'stop_failure' ||
      subtype === 'api_error' ||
      subtype === 'request_failed';
    if (!isStopFailure) continue;
    const ts = new Date(sr.timestamp).getTime();
    const raw = rec as unknown as Record<string, unknown>;
    const errorMsg =
      (typeof raw['error'] === 'string' ? raw['error'] : null) ||
      (typeof raw['message'] === 'string' ? raw['message'] : null) ||
      subtype;
    const errorClass = classifyStopFailure(errorMsg);
    rows.push({
      id: `api-error-${sr.uuid}`,
      type: 'api-error',
      toolName: errorClass,
      label: errorMsg,
      startTime: ts,
      endTime: ts,
      duration: 0,
      status: 'error',
      parentAgentId: null,
      input: {},
      output: errorMsg,
      inputTokens: 0,
      outputTokens: 0,
      tokenDelta: 0,
      contextFillPercent: 0,
      isReread: false,
      isFailure: false,
      children: [],
      tips: [],
      modelName: null,
      estimatedCost: null,
      agentType: null,
      agentColor: null,
      sequence: null,
      isFastMode: false,
      parentToolUseId: null,
    });
  }

  // Chronological sort — same rule as parseJsonlContent.
  rows.sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    return (a.sequence ?? 0) - (b.sequence ?? 0);
  });

  // Compute per-row token delta over the now-sorted rows.
  let prevInput = 0;
  for (const row of rows) {
    row.tokenDelta = row.inputTokens > 0 ? Math.max(0, row.inputTokens - prevInput) : 0;
    if (row.inputTokens > 0) prevInput = row.inputTokens;
  }

  return rows;
}

/**
 * Parse instruction-loading records from JSONL content.
 * Looks for system records with subtype containing "instructions" or similar patterns,
 * as well as user records with isMeta=true that describe loaded CLAUDE.md files.
 * Returns a deduplicated list of InstructionFile entries. Never throws.
 */
export function parseInstructionsLoaded(content: string): import('./types.js').InstructionFile[] {
  const lines = content.split('\n');
  const seen = new Set<string>();
  const result: import('./types.js').InstructionFile[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (!isObj(parsed)) continue;

    const recordType = parsed['type'];
    const subtype = typeof parsed['subtype'] === 'string' ? parsed['subtype'] : null;

    // Match system records that describe loaded instruction files
    if (recordType === 'system') {
      // Claude Code may emit system records with subtype: "instructions_loaded",
      // "claude_md_loaded", "context_loaded", or similar
      const isInstructionRecord =
        subtype !== null && (
          subtype.includes('instruction') ||
          subtype.includes('claude_md') ||
          subtype.includes('context_load') ||
          subtype.includes('system_prompt')
        );

      if (isInstructionRecord) {
        const filePath = typeof parsed['filePath'] === 'string' ? parsed['filePath']
          : typeof parsed['file_path'] === 'string' ? parsed['file_path']
          : typeof parsed['path'] === 'string' ? parsed['path']
          : null;
        if (!filePath || seen.has(filePath)) continue;
        seen.add(filePath);

        const loadReason = typeof parsed['reason'] === 'string' ? parsed['reason']
          : typeof parsed['load_reason'] === 'string' ? parsed['load_reason']
          : subtype ?? 'session_start';
        const estimatedTokens = typeof parsed['tokens'] === 'number' ? parsed['tokens']
          : typeof parsed['token_count'] === 'number' ? parsed['token_count']
          : null;
        const parentFilePath = typeof parsed['parentFilePath'] === 'string' ? parsed['parentFilePath']
          : typeof parsed['parent_file_path'] === 'string' ? parsed['parent_file_path']
          : null;

        result.push({ filePath, loadReason, estimatedTokens, parentFilePath });
        continue;
      }
    }

    // Match user records with isMeta=true that list loaded context files
    if (recordType === 'user' && (parsed['isMeta'] === true || parsed['isSynthetic'] === true)) {
      const metaContent = parsed['content'];
      const contentStr = typeof metaContent === 'string' ? metaContent : '';
      if (!contentStr) continue;

      // Look for patterns like "Loaded CLAUDE.md from /path/to/CLAUDE.md"
      // or "Instructions loaded: /path/to/CLAUDE.md"
      const filePathMatches = contentStr.matchAll(/(?:loaded|reading|including)[:\s]+([^\s,\n]+\.md)/gi);
      for (const match of filePathMatches) {
        const filePath = match[1];
        if (!filePath || seen.has(filePath)) continue;
        seen.add(filePath);
        result.push({
          filePath,
          loadReason: 'session_start',
          estimatedTokens: null,
          parentFilePath: null,
        });
      }
    }
  }

  return result;
}

/**
 * Extract a mapping of Agent/Task tool_use IDs to sub-agent IDs from session content.
 * Returns a Map where keys are the parent tool_use.id values and values are agentId strings
 * (matching the filename stem, e.g. "a1ba854e30ffeb7d2").
 * Never throws; malformed lines are skipped with a warning.
 */
export function extractAgentIds(content: string): Map<string, string> {
  const lines = content.split('\n');
  const result = new Map<string, string>();

  for (let i = 0; i < lines.length; i++) {
    const r = parseLine(lines[i], i);
    if (!r || r.type !== 'user') continue;
    const ur = r as UserRecord;
    if (!ur.toolUseResult?.agentId) continue;
    const agentId = ur.toolUseResult.agentId;
    const c = ur.message.content;
    if (!Array.isArray(c)) continue;
    for (const block of c) {
      if (isObj(block) && block['type'] === 'tool_result' && typeof block['tool_use_id'] === 'string') {
        result.set(block['tool_use_id'] as string, agentId);
      }
    }
  }

  return result;
}
