/** Waterfall row types */
export type RowType = 'agent' | 'tool';

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
}

/**
 * Context health score computed from session signals.
 */
export interface ContextHealth {
  grade: HealthGrade;
  score: number;
  fillPercent: number;
  compactionCount: number;
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
}

/** Metadata about a sub-agent session file, linking it to the parent tool_use that spawned it */
export interface SubAgentData {
  agentId: string;
  toolUseId: string;  // parent's tool_use.id that spawned this agent
  rows: WaterfallRow[];
}
