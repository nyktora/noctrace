/**
 * JSONL parser for Claude Code session logs.
 * Pure module: no file I/O, no side effects.
 */
import type { WaterfallRow } from './types.js';

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
  message: {
    role: 'assistant';
    content: ContentBlock[];
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
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
  contextFillPercent: number;
  isReread: boolean;
  assistantUuid: string;
  assistantParentUuid: string | null;
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
  if (type !== 'assistant' && type !== 'user' && type !== 'system' && type !== 'progress') return null;
  return parsed as unknown as KnownRecord;
}

function isAgent(name: string): boolean {
  return name === 'Agent' || name === 'Task';
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
  const resultMap = new Map<string, { endTime: number; output: string; isError: boolean; totalDurationMs?: number }>();
  for (const rec of records) {
    if (rec.type !== 'user') continue;
    const ur = rec as UserRecord;
    const c = ur.message.content;
    if (!Array.isArray(c)) continue;
    const endTime = new Date(rec.timestamp).getTime();
    for (const block of c) {
      if (isObj(block) && block['type'] === 'tool_result' && typeof block['tool_use_id'] === 'string') {
        const tb = block as unknown as ToolResultBlock;
        resultMap.set(tb.tool_use_id, {
          endTime,
          output: extractContent(tb.content),
          isError: tb.is_error === true,
          totalDurationMs: ur.toolUseResult?.totalDurationMs,
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
    const inputTokens = (usage?.input_tokens ?? 0)
      + (usage?.cache_creation_input_tokens ?? 0)
      + (usage?.cache_read_input_tokens ?? 0);
    const outputTokens = usage?.output_tokens ?? 0;
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
        contextFillPercent,
        isReread,
        assistantUuid: ar.uuid,
        assistantParentUuid: ar.parentUuid,
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
      children: [],
      tips: [],
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
      children: [],
      tips: [],
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
      row.children.sort((a, b) => a.startTime - b.startTime);
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

  return top;
}

/**
 * Extract Unix ms timestamps of compact_boundary system records.
 */
export function parseCompactionBoundaries(content: string): number[] {
  const lines = content.split('\n');
  const out: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const r = parseLine(lines[i], i);
    if (r && r.type === 'system' && (r as SystemRecord).subtype === 'compact_boundary') {
      out.push(new Date(r.timestamp).getTime());
    }
  }
  return out;
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
  const resultMap = new Map<string, { endTime: number; output: string; isError: boolean }>();
  for (const rec of records) {
    if (rec.type !== 'user') continue;
    const c = (rec as UserRecord).message.content;
    if (!Array.isArray(c)) continue;
    const endTime = new Date(rec.timestamp).getTime();
    for (const block of c) {
      if (isObj(block) && block['type'] === 'tool_result' && typeof block['tool_use_id'] === 'string') {
        const tb = block as unknown as ToolResultBlock;
        resultMap.set(tb.tool_use_id, {
          endTime,
          output: extractContent(tb.content),
          isError: tb.is_error === true,
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
    const inputTokens = (usage?.input_tokens ?? 0)
      + (usage?.cache_creation_input_tokens ?? 0)
      + (usage?.cache_read_input_tokens ?? 0);
    const outputTokens = usage?.output_tokens ?? 0;
    const contextFillPercent = (inputTokens / effectiveWindow) * 100;

    for (const block of ar.message.content) {
      if (!isToolUse(block)) continue;
      const fp = block.name === 'Read' && typeof block.input['file_path'] === 'string'
        ? (block.input['file_path'] as string) : null;
      const isReread = fp !== null && seenPaths.has(fp);
      if (fp !== null) seenPaths.add(fp);

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
        children: [],
        tips: [],
      });
    }
  }

  // Compute per-row token delta for sub-agent rows
  const sorted = [...rows].sort((a, b) => a.startTime - b.startTime);
  let prevInput = 0;
  for (const row of sorted) {
    row.tokenDelta = row.inputTokens > 0 ? Math.max(0, row.inputTokens - prevInput) : 0;
    if (row.inputTokens > 0) prevInput = row.inputTokens;
  }

  return rows;
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
