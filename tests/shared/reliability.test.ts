import { describe, it, expect } from 'vitest';
import { computeReliability } from '../../src/shared/reliability.ts';
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
    inputTokens: 1000,
    outputTokens: 100,
    tokenDelta: 100,
    contextFillPercent: 0.5,
    isReread: false,
    isFailure: false,
    children: [],
    tips: [],
    modelName: null,
    estimatedCost: null,
    agentType: null,
    agentColor: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeReliability', () => {
  // -------------------------------------------------------------------------
  // 1. Empty rows
  // -------------------------------------------------------------------------
  it('returns all-zeros and 100% reliability for empty rows', () => {
    const result = computeReliability([]);

    expect(result.totalCalls).toBe(0);
    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.failureCount).toBe(0);
    expect(result.overallReliability).toBe(100);
    expect(result.errorDensity).toBe(0);
    expect(result.recoveryAttempts).toBe(0);
    expect(result.recoverySuccesses).toBe(0);
    expect(result.recoveryRate).toBe(0);
    expect(result.avgErrorsBeforeFix).toBe(0);
    expect(result.toolReliability).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 2. All success
  // -------------------------------------------------------------------------
  it('returns 100% reliability and 0 error density when all rows succeed', () => {
    const rows = [
      makeRow({ toolName: 'Read', status: 'success' }),
      makeRow({ toolName: 'Bash', status: 'success' }),
      makeRow({ toolName: 'Write', status: 'success' }),
    ];

    const result = computeReliability(rows);

    expect(result.totalCalls).toBe(3);
    expect(result.successCount).toBe(3);
    expect(result.errorCount).toBe(0);
    expect(result.overallReliability).toBe(100);
    expect(result.errorDensity).toBe(0);
    expect(result.toolReliability.every((t) => t.reliability === 100)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Mix of success and error
  // -------------------------------------------------------------------------
  it('computes correct percentages for a mix of success and error rows', () => {
    // 6 rows: 4 success, 2 error
    const rows = [
      makeRow({ toolName: 'Bash', status: 'success' }),
      makeRow({ toolName: 'Bash', status: 'error' }),
      makeRow({ toolName: 'Read', status: 'success' }),
      makeRow({ toolName: 'Bash', status: 'success' }),
      makeRow({ toolName: 'Read', status: 'success' }),
      makeRow({ toolName: 'Bash', status: 'error' }),
    ];

    const result = computeReliability(rows);

    expect(result.totalCalls).toBe(6);
    expect(result.successCount).toBe(4);
    expect(result.errorCount).toBe(2);
    expect(result.overallReliability).toBeCloseTo((4 / 6) * 100, 5);
    // error density = (2 errors / 6 calls) * 10 = 3.333...
    expect(result.errorDensity).toBeCloseTo((2 / 6) * 10, 5);

    // Bash: 2 success + 2 error → 50% reliability
    const bashStat = result.toolReliability.find((t) => t.toolName === 'Bash');
    expect(bashStat).toBeDefined();
    expect(bashStat!.total).toBe(4);
    expect(bashStat!.success).toBe(2);
    expect(bashStat!.errors).toBe(2);
    expect(bashStat!.reliability).toBeCloseTo(50, 5);

    // Read: 2 success → 100% reliability
    const readStat = result.toolReliability.find((t) => t.toolName === 'Read');
    expect(readStat).toBeDefined();
    expect(readStat!.reliability).toBe(100);
  });

  // -------------------------------------------------------------------------
  // 4. Recovery rate: error followed by same-tool success = recovery
  // -------------------------------------------------------------------------
  it('counts error→same-tool-success sequence as a recovery', () => {
    const rows = [
      makeRow({ toolName: 'Bash', status: 'error' }),
      makeRow({ toolName: 'Bash', status: 'success' }),
    ];

    const result = computeReliability(rows);

    expect(result.recoveryAttempts).toBe(1);
    expect(result.recoverySuccesses).toBe(1);
    expect(result.recoveryRate).toBe(100);
  });

  // -------------------------------------------------------------------------
  // 5. Recovery rate: error followed by different tool = not a recovery attempt
  // -------------------------------------------------------------------------
  it('does not count an error followed by a different-tool success as recovery', () => {
    // Bash sequence: only 1 row (error), no same-tool follow-up → 0 attempts
    // Read sequence: only 1 row (success), no errors → 0 attempts
    const rows = [
      makeRow({ toolName: 'Bash', status: 'error' }),
      makeRow({ toolName: 'Read', status: 'success' }),
    ];

    const result = computeReliability(rows);

    // No same-tool follow-up exists for the Bash error, so no attempt is counted
    expect(result.recoveryAttempts).toBe(0);
    expect(result.recoverySuccesses).toBe(0);
    expect(result.recoveryRate).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 6. Error-to-fix ratio with known file paths
  // -------------------------------------------------------------------------
  it('computes avgErrorsBeforeFix for files with errors before success', () => {
    // File src/foo.ts: 2 errors then 1 success → 2 errors before fix
    // File src/bar.ts: 1 error then 1 success → 1 error before fix
    // Average = (2 + 1) / 2 = 1.5
    const rows = [
      makeRow({ toolName: 'Edit', status: 'error', label: 'Edit src/foo.ts' }),
      makeRow({ toolName: 'Edit', status: 'error', label: 'Edit src/foo.ts' }),
      makeRow({ toolName: 'Edit', status: 'success', label: 'Edit src/foo.ts' }),
      makeRow({ toolName: 'Edit', status: 'error', label: 'Edit src/bar.ts' }),
      makeRow({ toolName: 'Edit', status: 'success', label: 'Edit src/bar.ts' }),
    ];

    const result = computeReliability(rows);

    expect(result.avgErrorsBeforeFix).toBeCloseTo(1.5, 5);
  });

  // -------------------------------------------------------------------------
  // 7. Tool reliability sorted worst-first
  // -------------------------------------------------------------------------
  it('sorts toolReliability ascending by reliability (worst first)', () => {
    // Bash: 1/2 success = 50%
    // Read: 3/3 success = 100%
    // Write: 1/4 success = 25%
    const rows = [
      makeRow({ toolName: 'Bash', status: 'success' }),
      makeRow({ toolName: 'Bash', status: 'error' }),
      makeRow({ toolName: 'Read', status: 'success' }),
      makeRow({ toolName: 'Read', status: 'success' }),
      makeRow({ toolName: 'Read', status: 'success' }),
      makeRow({ toolName: 'Write', status: 'success' }),
      makeRow({ toolName: 'Write', status: 'error' }),
      makeRow({ toolName: 'Write', status: 'error' }),
      makeRow({ toolName: 'Write', status: 'error' }),
    ];

    const result = computeReliability(rows);

    expect(result.toolReliability).toHaveLength(3);
    // Worst first: Write (25%) → Bash (50%) → Read (100%)
    expect(result.toolReliability[0].toolName).toBe('Write');
    expect(result.toolReliability[0].reliability).toBeCloseTo(25, 5);
    expect(result.toolReliability[1].toolName).toBe('Bash');
    expect(result.toolReliability[1].reliability).toBeCloseTo(50, 5);
    expect(result.toolReliability[2].toolName).toBe('Read');
    expect(result.toolReliability[2].reliability).toBe(100);
  });

  // -------------------------------------------------------------------------
  // 8. isFailure counted separately from errors
  // -------------------------------------------------------------------------
  it('counts isFailure rows separately from status:error rows', () => {
    const rows = [
      makeRow({ toolName: 'Bash', status: 'success', isFailure: false }),
      makeRow({ toolName: 'Bash', status: 'error', isFailure: false }),
      makeRow({ toolName: 'Bash', status: 'error', isFailure: true }),
    ];

    const result = computeReliability(rows);

    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(1);    // status:error but not isFailure
    expect(result.failureCount).toBe(1);  // isFailure:true

    const bashStat = result.toolReliability.find((t) => t.toolName === 'Bash');
    expect(bashStat).toBeDefined();
    expect(bashStat!.errors).toBe(1);
    expect(bashStat!.failures).toBe(1);
    expect(bashStat!.success).toBe(1);
    // reliability = success / total = 1/3 ≈ 33.33%
    expect(bashStat!.reliability).toBeCloseTo((1 / 3) * 100, 5);
  });

  // -------------------------------------------------------------------------
  // 9. Running rows excluded from reliability calculation
  // -------------------------------------------------------------------------
  it('excludes running rows from all reliability calculations', () => {
    const rows = [
      makeRow({ toolName: 'Bash', status: 'success' }),
      makeRow({ toolName: 'Bash', status: 'running' }),
      makeRow({ toolName: 'Bash', status: 'running' }),
    ];

    const result = computeReliability(rows);

    // Only the 1 completed (success) row should be counted
    expect(result.totalCalls).toBe(1);
    expect(result.successCount).toBe(1);
    expect(result.overallReliability).toBe(100);

    const bashStat = result.toolReliability.find((t) => t.toolName === 'Bash');
    expect(bashStat).toBeDefined();
    expect(bashStat!.total).toBe(1);
    expect(bashStat!.reliability).toBe(100);
  });

  // -------------------------------------------------------------------------
  // 10. Nested children are flattened and included
  // -------------------------------------------------------------------------
  it('includes nested children rows from agents in the computation', () => {
    const child1 = makeRow({ toolName: 'Read', status: 'success' });
    const child2 = makeRow({ toolName: 'Read', status: 'error' });
    const agent = makeRow({
      type: 'agent',
      toolName: 'Task',
      status: 'success',
      children: [child1, child2],
    });

    const result = computeReliability([agent]);

    // 3 rows total: agent + 2 children
    expect(result.totalCalls).toBe(3);
    expect(result.successCount).toBe(2); // agent + child1
    expect(result.errorCount).toBe(1);   // child2

    const readStat = result.toolReliability.find((t) => t.toolName === 'Read');
    expect(readStat).toBeDefined();
    expect(readStat!.total).toBe(2);
    expect(readStat!.reliability).toBeCloseTo(50, 5);
  });

  // -------------------------------------------------------------------------
  // 11. Recovery rate: multiple retries, some successful and some not
  // -------------------------------------------------------------------------
  it('computes partial recovery rate correctly', () => {
    // Bash sequence: error→error (attempt 1, fail), error→success (attempt 2, success)
    // 2 attempts, 1 success → 50%
    const rows = [
      makeRow({ toolName: 'Bash', status: 'error' }),
      makeRow({ toolName: 'Bash', status: 'error' }),
      makeRow({ toolName: 'Bash', status: 'success' }),
    ];

    const result = computeReliability(rows);

    expect(result.recoveryAttempts).toBe(2);
    expect(result.recoverySuccesses).toBe(1);
    expect(result.recoveryRate).toBeCloseTo(50, 5);
  });
});
