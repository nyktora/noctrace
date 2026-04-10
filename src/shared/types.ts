/** Waterfall row types */
export type RowType = 'agent' | 'tool' | 'api-error';

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
}
