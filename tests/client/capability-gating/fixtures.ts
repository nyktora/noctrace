/**
 * Synthetic fixtures for capability-gating tests.
 * These do not require a real session file — they build minimal in-memory objects
 * that satisfy the TypeScript interfaces needed by the components under test.
 */
import type { ProviderCapabilities } from '../../../src/shared/providers/provider.ts';
import type { WaterfallRow, ContextHealth } from '../../../src/shared/types.ts';

/** All capabilities enabled — mirrors the Claude Code provider in production. */
export const FULL_CAPABILITIES: ProviderCapabilities = {
  toolCallGranularity: 'full',
  contextTracking: true,
  subAgents: true,
  realtime: true,
  tokenAccounting: 'per-turn',
};

/**
 * Minimal capabilities for a hypothetical provider (e.g. Copilot in Phase C spec).
 * No context tracking, no token accounting.
 */
export const MINIMAL_CAPABILITIES: ProviderCapabilities = {
  toolCallGranularity: 'summary',
  contextTracking: false,
  subAgents: false,
  realtime: false,
  tokenAccounting: 'none',
};

/** Build a minimal WaterfallRow for testing */
export function makeRow(overrides: Partial<WaterfallRow> = {}): WaterfallRow {
  return {
    id: 'row-1',
    type: 'tool',
    toolName: 'Bash',
    label: 'echo hello',
    startTime: Date.now() - 1000,
    endTime: Date.now(),
    duration: 1000,
    status: 'success',
    parentAgentId: null,
    input: { command: 'echo hello' },
    output: 'hello',
    inputTokens: 100,
    outputTokens: 10,
    tokenDelta: 100,
    contextFillPercent: 45,
    isReread: false,
    isFailure: false,
    children: [],
    tips: [],
    modelName: 'claude-sonnet-4-5',
    estimatedCost: 0.0012,
    agentType: null,
    agentColor: null,
    sequence: null,
    isFastMode: false,
    parentToolUseId: null,
    ...overrides,
  };
}

/** Build a minimal ContextHealth for testing */
export function makeHealth(overrides: Partial<ContextHealth> = {}): ContextHealth {
  return {
    grade: 'B',
    score: 72,
    fillPercent: 45,
    compactionCount: 0,
    compactionThrash: false,
    rereadRatio: 0,
    errorAcceleration: 0,
    toolEfficiency: 1,
    signals: [],
    ...overrides,
  };
}
