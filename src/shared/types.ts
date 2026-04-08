/** Waterfall row types */
export type RowType = 'agent' | 'tool';

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
 * Represents either a tool call or an agent spawn.
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
  children: WaterfallRow[];
  /** Efficiency tips attached to this row. Empty array when no issues detected. */
  tips: EfficiencyTip[];
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
