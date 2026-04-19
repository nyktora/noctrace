/** Waterfall row types */
export type RowType = 'agent' | 'tool' | 'api-error' | 'hook' | 'turn';

/** Severity levels for efficiency tips */
export type TipSeverity = 'info' | 'warning' | 'critical';

/** An efficiency tip attached to a wasteful row */
export interface EfficiencyTip {
  /** Stable identifier, e.g. 'reread', 'fan-out', 'correction-loop' */
  id: string;
  /** Short label shown in the UI, e.g. "File re-read detected" */
  title: string;
  /** Full guidance text explaining the issue and how to fix it */
  message: string;
  severity: TipSeverity;
  /** Category of the tip. Defaults to 'efficiency' when absent. */
  category?: 'efficiency' | 'security';
}

/** Possible statuses for a waterfall row */
export type RowStatus = 'running' | 'success' | 'error';

/** Context health grade levels */
export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Per-turn token attribution breakdown (rough estimates, char/4 heuristic).
 * Used to show WHERE tokens went within an assistant turn.
 */
export interface TokenAttribution {
  /** Extended thinking tokens (from thinking blocks). */
  thinking: number;
  /** Tool call input content tokens (from tool_use blocks). */
  toolInput: number;
  /** Tool result output tokens (from tool_result blocks in the context). */
  toolOutput: number;
  /** Estimated system/instruction tokens (attributed to the remainder of inputTokens). */
  systemPrompt: number;
  /** User message tokens. */
  userText: number;
  /** Tokens served from the prompt cache. */
  cacheRead: number;
}

/**
 * A single row in the waterfall timeline.
 * Represents either a tool call, an agent spawn, or an API-level error event.
 */
export interface WaterfallRow {
  id: string;
  type: RowType;
  toolName: string;
  label: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  status: RowStatus;
  parentAgentId: string | null;
  input: Record<string, unknown>;
  output: string | null;
  inputTokens: number;
  outputTokens: number;
  /** Tokens served from the prompt cache for this turn (cache_read_input_tokens). */
  cacheReadTokens: number;
  tokenDelta: number;
  contextFillPercent: number;
  isReread: boolean;
  /** True when the tool failed to execute (crash, timeout, permission denied).
   *  Distinct from `status: 'error'` which means the tool ran but returned an error result. */
  isFailure: boolean;
  children: WaterfallRow[];
  /** Efficiency tips attached to this row. Empty array when no issues detected. */
  tips: EfficiencyTip[];
  /** Claude model name from the assistant record (e.g. "claude-sonnet-4-5"). Null when not present. */
  modelName: string | null;
  /** Estimated USD cost for this row's token usage. Null when token data is unavailable. */
  estimatedCost: number | null;
  /** Agent type label from toolUseResult (e.g. "Explore", "core:deep-researcher"). Null when not a subagent row. */
  agentType: string | null;
  /** Agent color from toolUseResult (e.g. "blue", "green"). Null when not present. */
  agentColor: string | null;
  /** Monotonic sequence number for ordering when timestamps tie. Null when absent from JSONL. */
  sequence: number | null;
  /** True when this row's API request used fast mode. */
  isFastMode: boolean;
  /** Canonical parent tool_use ID from parent_tool_use_id field. Null when absent. */
  parentToolUseId: string | null;
  /** Per-turn token attribution breakdown. Null when token data is unavailable. */
  tokenAttribution: TokenAttribution | null;
}

/**
 * Context health score computed from session signals.
 */
export interface ContextHealth {
  grade: HealthGrade;
  score: number;
  fillPercent: number;
  compactionCount: number;
  /** True when the session has been compacted 3+ times (thrash loop pattern). */
  compactionThrash: boolean;
  rereadRatio: number;
  errorAcceleration: number;
  toolEfficiency: number;
  signals: HealthSignal[];
}

/** Individual health signal with its sub-grade */
export interface HealthSignal {
  name: string;
  value: number;
  grade: HealthGrade;
  weight: number;
}

/** Summary of a project containing sessions */
export interface ProjectSummary {
  slug: string;
  path: string;
  sessionCount: number;
  activeSessionCount: number;
  lastModified: string;
  /** Provider id that owns this project, e.g. 'claude-code', 'codex', 'copilot'. Optional for backwards compat. */
  provider?: string;
}

/** Permission mode for a session */
export type PermissionMode = 'bypassPermissions' | 'acceptEdits' | 'default' | 'plan' | null;

/** Summary of a single session */
export interface SessionSummary {
  id: string;
  projectSlug: string;
  filePath: string;
  startTime: string | null;
  lastModified: string;
  rowCount: number;
  isActive: boolean;
  permissionMode: PermissionMode;
  isRemoteControlled: boolean;
  driftFactor: number | null;  // null if < 5 turns
  /** Human-readable session title set via Claude Code UI or hooks. Null if not set. */
  title: string | null;
  /** Provider id that owns this session, e.g. 'claude-code', 'codex', 'copilot'. Optional for backwards compat. */
  provider?: string;
}

/** Metadata about a sub-agent session file, linking it to the parent tool_use that spawned it */
export interface SubAgentData {
  agentId: string;
  toolUseId: string;  // parent's tool_use.id that spawned this agent
  rows: WaterfallRow[];
}

/** Token usage for a single assistant turn */
export interface AssistantTurn {
  timestamp: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/** Drift rate classification */
export type DriftRateLabel = 'stable' | 'rising' | 'accelerating' | 'critical';

/** Token drift analysis for a session */
export interface DriftAnalysis {
  driftFactor: number;       // current / baseline ratio (1.0 = no drift)
  baselineTokens: number;    // avg tokens for first 5 turns
  currentTokens: number;     // avg tokens for last 5 turns
  turnCount: number;
  totalTokens: number;       // sum of all turns
  estimatedSavings: number;  // tokens that could be saved with session rotation (0 if drift < 2)
  driftRate: number;         // tokens per minute growth rate
  driftRateLabel: DriftRateLabel;
}

/**
 * A Claude Code hook event received from the hooks endpoint.
 * Fields mirror the payload shape emitted by Claude Code's hook system.
 * `received_at` is added by noctrace on receipt.
 */
export interface HookEvent {
  session_id: string;
  hook_event_name: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  tool_use_id?: string;
  cwd?: string;
  transcript_path?: string;
  agent_id?: string;
  agent_type?: string;
  permission_mode?: string;
  /** ISO timestamp added by noctrace when the event is received. */
  received_at: string;
}

/**
 * WebSocket message broadcasting a hook event to connected clients.
 */
export interface HookEventMessage {
  type: 'hook-event';
  event: HookEvent;
}

/**
 * WebSocket message broadcast when an MCP session registers itself.
 */
export interface SessionRegisteredMessage {
  type: 'session-registered';
  sessionPath: string;
}

/**
 * WebSocket message broadcast when an MCP session unregisters on exit.
 */
export interface SessionUnregisteredMessage {
  type: 'session-unregistered';
  sessionPath: string;
}

/** Metadata for a Docker-sourced session streamed via /api/docker/stream. */
export interface DockerSessionMeta {
  /** Docker container name. */
  containerName: string;
  /** Original file path inside the container. */
  containerPath: string;
  /** Unix-ms timestamp of the last heartbeat from the container watcher. */
  lastHeartbeat: number;
}

/** WebSocket message broadcast when a SubagentStart hook event arrives. */
export interface SubagentStartMessage {
  type: 'subagent-start';
  agentId: string;
  agentType: string | null;
  sessionId: string;
}

/**
 * A CLAUDE.md (or other instruction file) loaded at session start.
 * Parsed from system records in the JSONL log.
 */
export interface InstructionFile {
  /** Absolute or relative file path of the loaded instruction file. */
  filePath: string;
  /** Why the file was loaded (e.g. session_start, nested_traversal, include, compact). */
  loadReason: string;
  /** Estimated token count for this file's contents. Null when not available. */
  estimatedTokens: number | null;
  /** Parent file that triggered this load (for nested includes). Null for top-level files. */
  parentFilePath: string | null;
}

/** A compaction boundary with optional metadata from compact_metadata field. */
export interface CompactionBoundary {
  /** Unix-ms timestamp of the compaction event. */
  timestamp: number;
  /** Whether compaction was triggered manually (/compact) or automatically. Null when metadata absent. */
  trigger: 'manual' | 'auto' | null;
  /** Token count before compaction. Null when metadata absent. */
  preTokens: number | null;
}

/** Per-model token usage breakdown from result records. */
export interface ModelUsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
}

/** Session-level result enrichments parsed from the terminal result record. */
export interface SessionResultMetrics {
  /** Time spent in API calls only (ms). Null when absent. */
  durationApiMs: number | null;
  /** Per-model token usage breakdown. Empty array when absent. */
  modelUsage: ModelUsageEntry[];
  /** Reason the session stopped. Null when absent. */
  stopReason: 'end_turn' | 'max_tokens' | 'refusal' | null;
  /** Number of permission denials during the session. */
  permissionDenialCount: number;
}

/** Session init context: agents/skills/plugins loaded at startup. */
export interface SessionInitContext {
  /** Agent names available in this session. */
  agents: string[];
  /** Skill names loaded in this session. */
  skills: string[];
  /** Plugins loaded in this session. */
  plugins: Array<{ name: string; path: string }>;
  /** Reasoning effort level (low/medium/high/max). Null when not set. */
  effort: string | null;
}

/**
 * A member of an Agent Team.
 */
export interface TeamMember {
  /** Display name of the agent. */
  name: string;
  /** Unique agent identifier. */
  agentId: string;
  /** Agent type/role (e.g. "Explore", "core:deep-researcher"). */
  agentType: string;
}

/** A task in an Agent Team. */
export interface TeamTask {
  /** Task file name (without extension). */
  id: string;
  /** Short subject line. */
  subject: string;
  /** Task status. */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | string;
  /** Agent assigned to this task. */
  assignedTo: string | null;
}

/**
 * Response shape for the cross-session Patterns rollup view.
 * Aggregates data across all sessions in ~/.claude/projects/ within a chosen window.
 */
export interface PatternsResponse {
  window: {
    kind: 'today' | '7d' | '30d';
    /** Inclusive start, Unix ms */
    startMs: number;
    /** Exclusive end, Unix ms */
    endMs: number;
    /** Start of the immediately preceding window of the same size, Unix ms */
    prevStartMs: number;
    /** End of the preceding window (= startMs of current), Unix ms */
    prevEndMs: number;
    /** Human-readable label, e.g. "Apr 7 – Apr 14, 2026" */
    label: string;
  };
  sessionCounts: { current: number; previous: number };
  healthDist: {
    current: { A: number; B: number; C: number; D: number; F: number };
    previous: { A: number; B: number; C: number; D: number; F: number };
  };
  rotLeaderboard: Array<{
    /** De-slugified project path, e.g. ~/dev/noctrace */
    project: string;
    /** Raw slug for client-side routing, e.g. -Users-lam-dev-noctrace */
    rawSlug: string;
    /** Total sessions in the current window */
    sessions: number;
    /** Sessions with D or F grade */
    bad: number;
    /** bad / sessions, range 0..1 */
    badPct: number;
    avgCompactions: number;
    /** Session ID of the lowest-scoring session in this project, or null */
    worstSessionId: string | null;
  }>;
  toolHealth: Array<{
    tool: string;
    calls: number;
    failures: number;
    /** failures / calls, range 0..1 */
    failPct: number;
    p50ms: number;
    p95ms: number;
    /** Calls in the previous window, for delta chart */
    callsPrev: number;
  }>;
  errors: Array<{ path: string; reason: string }>;
}

/**
 * A single result from the cross-session full-text search endpoint.
 * Returned by GET /api/search?q=<query>.
 */
export interface SearchResult {
  /** Provider id, e.g. 'claude-code', 'codex'. */
  provider: string;
  /** Human-readable project path, e.g. '~/dev/noctrace'. */
  projectContext: string;
  /** Raw slug for navigation, e.g. '-Users-lam-dev-noctrace'. */
  sessionId: string;
  /** ISO 8601 start time of the session. */
  sessionStart: string;
  /** Waterfall row id that matched. */
  rowId: string;
  /** Tool name of the matching row, e.g. 'Bash', 'Read'. */
  toolName: string;
  /** The line containing the match (truncated to 200 chars). */
  matchLine: string;
  /** Surrounding context around the match (truncated to 500 chars). */
  matchContext: string;
}

/**
 * An Agent Team as defined in ~/.claude/teams/{team-name}/config.json.
 */
export interface AgentTeam {
  /** Team name (directory name under ~/.claude/teams/). */
  name: string;
  /** Members of this team. */
  members: TeamMember[];
  /** Number of task files in ~/.claude/tasks/{team-name}/. */
  taskCount: number;
  /** Parsed task details from ~/.claude/tasks/{team-name}/*.json. */
  tasks: TeamTask[];
}
