import { describe, it, expect } from 'vitest';
import { computeSessionMetrics, compareSessionMetrics } from '../../src/shared/session-compare.ts';
import type { WaterfallRow } from '../../src/shared/types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;

/** Create a minimal WaterfallRow for testing. Override any field as needed. */
function makeRow(overrides: Partial<WaterfallRow> = {}): WaterfallRow {
  _idCounter += 1;
  return {
    id: `row-${_idCounter}`,
    type: 'tool',
    toolName: 'Bash',
    label: 'Bash: echo hi',
    startTime: 1000,
    endTime: 1100,
    duration: 100,
    status: 'success',
    parentAgentId: null,
    input: {},
    output: null,
    inputTokens: 500,
    outputTokens: 100,
    tokenDelta: 100,
    contextFillPercent: 10,
    isReread: false,
    children: [],
    tips: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeSessionMetrics
// ---------------------------------------------------------------------------

describe('computeSessionMetrics', () => {
  it('returns zero metrics for empty rows', () => {
    const metrics = computeSessionMetrics([], null);
    expect(metrics.totalDuration).toBe(0);
    expect(metrics.totalTokens).toBe(0);
    expect(metrics.totalCalls).toBe(0);
    expect(metrics.errorCount).toBe(0);
    expect(metrics.errorRate).toBe(0);
    expect(metrics.toolMix).toEqual({});
    expect(metrics.contextFillTimeline).toEqual([]);
  });

  it('uses health grade and score from ContextHealth when provided', () => {
    const health = {
      grade: 'B' as const,
      score: 78,
      fillPercent: 55,
      compactionCount: 1,
      compactionThrash: false,
      rereadRatio: 0.05,
      errorAcceleration: 1.2,
      toolEfficiency: 0.8,
      signals: [],
    };
    const metrics = computeSessionMetrics([], health);
    expect(metrics.healthGrade).toBe('B');
    expect(metrics.healthScore).toBe(78);
  });

  it('defaults to grade A score 100 when health is null and rows are empty', () => {
    const metrics = computeSessionMetrics([], null);
    expect(metrics.healthGrade).toBe('A');
    expect(metrics.healthScore).toBe(100);
  });

  it('counts tool calls correctly including nested children', () => {
    const child1 = makeRow({ toolName: 'Read', startTime: 1000, endTime: 1050 });
    const child2 = makeRow({ toolName: 'Write', startTime: 1060, endTime: 1100 });
    const parent = makeRow({ toolName: 'Bash', startTime: 900, endTime: 1200, children: [child1, child2] });

    const metrics = computeSessionMetrics([parent], null);
    // parent + child1 + child2 = 3 calls
    expect(metrics.totalCalls).toBe(3);
    expect(metrics.toolMix['Bash']).toBe(1);
    expect(metrics.toolMix['Read']).toBe(1);
    expect(metrics.toolMix['Write']).toBe(1);
  });

  it('computes error count and error rate correctly', () => {
    const rows = [
      makeRow({ status: 'success' }),
      makeRow({ status: 'error' }),
      makeRow({ status: 'error' }),
      makeRow({ status: 'success' }),
    ];
    const metrics = computeSessionMetrics(rows, null);
    expect(metrics.errorCount).toBe(2);
    expect(metrics.errorRate).toBeCloseTo(0.5);
  });

  it('sums inputTokens + outputTokens across all rows', () => {
    const rows = [
      makeRow({ inputTokens: 1000, outputTokens: 200 }),
      makeRow({ inputTokens: 500, outputTokens: 100 }),
    ];
    const metrics = computeSessionMetrics(rows, null);
    expect(metrics.totalTokens).toBe(1800);
  });

  it('extracts contextFillTimeline skipping zero values', () => {
    const rows = [
      makeRow({ contextFillPercent: 0 }),   // skipped
      makeRow({ contextFillPercent: 20 }),
      makeRow({ contextFillPercent: 45 }),
      makeRow({ contextFillPercent: 0 }),   // skipped
      makeRow({ contextFillPercent: 70 }),
    ];
    const metrics = computeSessionMetrics(rows, null);
    expect(metrics.contextFillTimeline).toEqual([20, 45, 70]);
  });

  it('computes totalDuration as span from first startTime to last endTime', () => {
    const rows = [
      makeRow({ startTime: 1000, endTime: 2000 }),
      makeRow({ startTime: 1500, endTime: 3000 }),
    ];
    const metrics = computeSessionMetrics(rows, null);
    expect(metrics.totalDuration).toBe(2000); // 3000 - 1000
  });

  it('builds toolMix counting multiple occurrences of the same tool', () => {
    const rows = [
      makeRow({ toolName: 'Read' }),
      makeRow({ toolName: 'Read' }),
      makeRow({ toolName: 'Bash' }),
    ];
    const metrics = computeSessionMetrics(rows, null);
    expect(metrics.toolMix['Read']).toBe(2);
    expect(metrics.toolMix['Bash']).toBe(1);
  });

  it('handles rows with null endTime by using startTime as fallback', () => {
    const rows = [
      makeRow({ startTime: 500, endTime: null, duration: null }),
      makeRow({ startTime: 1000, endTime: 2000 }),
    ];
    // Should not throw; maxEnd = 2000, minStart = 500
    const metrics = computeSessionMetrics(rows, null);
    expect(metrics.totalDuration).toBe(1500);
  });
});

// ---------------------------------------------------------------------------
// compareSessionMetrics
// ---------------------------------------------------------------------------

describe('compareSessionMetrics', () => {
  function makeMetrics(overrides: Partial<import('../../src/shared/session-compare.ts').SessionMetrics> = {}) {
    return {
      totalDuration: 60_000,
      totalTokens: 10_000,
      totalCalls: 20,
      errorCount: 1,
      errorRate: 0.05,
      toolMix: {},
      healthGrade: 'A',
      healthScore: 90,
      contextFillTimeline: [],
      ...overrides,
    };
  }

  it('returns zero deltas when both sessions are identical', () => {
    const m = makeMetrics();
    const deltas = compareSessionMetrics(m, m);
    expect(deltas.durationDelta).toBe(0);
    expect(deltas.tokenDelta).toBe(0);
    expect(deltas.callDelta).toBe(0);
    expect(deltas.errorRateDelta).toBe(0);
  });

  it('durationDelta is positive when right is slower', () => {
    const left = makeMetrics({ totalDuration: 60_000 });
    const right = makeMetrics({ totalDuration: 90_000 });
    const deltas = compareSessionMetrics(left, right);
    expect(deltas.durationDelta).toBe(30_000);
  });

  it('durationDelta is negative when right is faster', () => {
    const left = makeMetrics({ totalDuration: 90_000 });
    const right = makeMetrics({ totalDuration: 60_000 });
    const deltas = compareSessionMetrics(left, right);
    expect(deltas.durationDelta).toBe(-30_000);
  });

  it('tokenDelta reflects right minus left', () => {
    const left = makeMetrics({ totalTokens: 5_000 });
    const right = makeMetrics({ totalTokens: 12_000 });
    const deltas = compareSessionMetrics(left, right);
    expect(deltas.tokenDelta).toBe(7_000);
  });

  it('callDelta reflects right minus left', () => {
    const left = makeMetrics({ totalCalls: 10 });
    const right = makeMetrics({ totalCalls: 25 });
    const deltas = compareSessionMetrics(left, right);
    expect(deltas.callDelta).toBe(15);
  });

  it('errorRateDelta is negative when right has fewer errors', () => {
    const left = makeMetrics({ errorRate: 0.2 });
    const right = makeMetrics({ errorRate: 0.05 });
    const deltas = compareSessionMetrics(left, right);
    expect(deltas.errorRateDelta).toBeCloseTo(-0.15);
  });

  it('errorRateDelta is positive when right has more errors', () => {
    const left = makeMetrics({ errorRate: 0.0 });
    const right = makeMetrics({ errorRate: 0.3 });
    const deltas = compareSessionMetrics(left, right);
    expect(deltas.errorRateDelta).toBeCloseTo(0.3);
  });
});
