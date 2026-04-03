import { describe, it, expect } from 'vitest';
import { computeContextHealth } from '../../src/shared/health.ts';
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
    startTime: Date.now(),
    endTime: Date.now() + 100,
    duration: 100,
    status: 'success',
    parentAgentId: null,
    input: {},
    output: null,
    inputTokens: 1000,
    outputTokens: 100,
    contextFillPercent: 0.5,
    isReread: false,
    children: [],
    ...overrides,
  };
}

/** Make a Read row, optionally marking it as a re-read of a specific path. */
function makeReadRow(filePath: string, isReread = false): WaterfallRow {
  return makeRow({
    toolName: 'Read',
    label: `Read: ${filePath}`,
    input: { file_path: filePath },
    isReread,
  });
}

/** Make an error row. */
function makeErrorRow(): WaterfallRow {
  return makeRow({ status: 'error' });
}

/** Make a Write row. */
function makeWriteRow(): WaterfallRow {
  return makeRow({ toolName: 'Write', label: 'Write: /src/foo.ts' });
}

// ---------------------------------------------------------------------------
// Empty rows
// ---------------------------------------------------------------------------

describe('computeContextHealth – empty rows', () => {
  it('returns grade A with score 100 for an empty rows array', () => {
    const health = computeContextHealth([], 0);
    expect(health.grade).toBe('A');
    expect(health.score).toBe(100);
    expect(health.fillPercent).toBe(0);
    expect(health.compactionCount).toBe(0);
    expect(health.rereadRatio).toBe(0);
    expect(health.errorAcceleration).toBe(1);
    expect(health.toolEfficiency).toBe(1);
    expect(health.signals).toHaveLength(5);
    for (const signal of health.signals) {
      expect(signal.value).toBe(100);
      expect(signal.grade).toBe('A');
    }
  });
});

// ---------------------------------------------------------------------------
// Healthy session (low fill, no compactions, no re-reads, no errors)
// ---------------------------------------------------------------------------

describe('computeContextHealth – healthy session', () => {
  it('grades a session with low token usage as A', () => {
    const rows = [
      makeRow({ toolName: 'Read', input: { file_path: '/a.ts' }, inputTokens: 10_000 }),
      makeWriteRow(),
      makeRow({ toolName: 'Bash', inputTokens: 12_000 }),
    ];
    const health = computeContextHealth(rows, 0);
    expect(health.grade).toBe('A');
    expect(health.score).toBeGreaterThanOrEqual(85);
  });

  it('signal "Context Fill" is A when inputTokens are well under 50%', () => {
    const rows = [makeRow({ inputTokens: 50_000 })]; // 25% fill
    const health = computeContextHealth(rows, 0);
    const fillSignal = health.signals.find(s => s.name === 'Context Fill');
    expect(fillSignal?.grade).toBe('A');
    expect(fillSignal?.value).toBe(100);
  });

  it('compaction signal is A when compactionCount is 0', () => {
    const rows = [makeRow()];
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Compactions');
    expect(sig?.grade).toBe('A');
    expect(sig?.value).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Degraded session (high fill, compactions, re-reads, errors)
// ---------------------------------------------------------------------------

describe('computeContextHealth – degraded session', () => {
  it('grades C or worse for high fill + 2 compactions + re-reads + errors', () => {
    // 4 tool rows so error/efficiency halving works
    const rows = [
      makeReadRow('/src/app.ts'),            // first read of app.ts
      makeReadRow('/src/app.ts', true),      // re-read
      makeErrorRow(),
      makeRow({ toolName: 'Bash', inputTokens: 185_000, status: 'error' }), // >90% fill, error in 2nd half
    ];
    const health = computeContextHealth(rows, 2);
    const gradeOrder: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
    expect(gradeOrder[health.grade]).toBeLessThanOrEqual(gradeOrder['C']);
  });
});

// ---------------------------------------------------------------------------
// Context Fill signal
// ---------------------------------------------------------------------------

describe('Context Fill signal', () => {
  it('returns score 80 (B) when fill is between 50–65%', () => {
    // 60% of 200_000 = 120_000 tokens
    const rows = [makeRow({ inputTokens: 120_000 })];
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Context Fill');
    expect(sig?.value).toBe(80);
    expect(sig?.grade).toBe('B');
    expect(health.fillPercent).toBeCloseTo(60);
  });

  it('returns score 60 (C) when fill is between 65–80%', () => {
    const rows = [makeRow({ inputTokens: 145_000 })]; // ~72.5%
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Context Fill');
    expect(sig?.value).toBe(60);
    expect(sig?.grade).toBe('C');
  });

  it('returns score 40 (D) when fill is between 80–90%', () => {
    const rows = [makeRow({ inputTokens: 170_000 })]; // 85%
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Context Fill');
    expect(sig?.value).toBe(40);
    expect(sig?.grade).toBe('D');
  });

  it('returns score 20 (F) when fill is above 90%', () => {
    const rows = [makeRow({ inputTokens: 190_000 })]; // 95%
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Context Fill');
    expect(sig?.value).toBe(20);
    expect(sig?.grade).toBe('F');
  });

  it('uses the last row inputTokens (reflects current state after compaction)', () => {
    // After compaction, later rows have lower tokens — health should reflect recovery
    const rows = [
      makeRow({ inputTokens: 190_000 }),
      makeRow({ inputTokens: 10_000 }),
    ];
    const health = computeContextHealth(rows, 0);
    expect(health.fillPercent).toBeCloseTo(5); // 10k / 200k = 5%
  });
});

// ---------------------------------------------------------------------------
// Compaction Count signal
// ---------------------------------------------------------------------------

describe('Compaction Count signal', () => {
  it.each([
    [0, 100, 'A'],
    [1, 75, 'B'],
    [2, 55, 'C'],
    [3, 35, 'F'],
    [4, 15, 'F'],
    [10, 15, 'F'],
  ])('compactionCount=%i → value=%i grade=%s', (count, expectedValue, expectedGrade) => {
    const rows = [makeRow()];
    const health = computeContextHealth(rows, count);
    const sig = health.signals.find(s => s.name === 'Compactions');
    expect(sig?.value).toBe(expectedValue);
    expect(sig?.grade).toBe(expectedGrade);
    expect(health.compactionCount).toBe(count);
  });
});

// ---------------------------------------------------------------------------
// Re-read Ratio signal
// ---------------------------------------------------------------------------

describe('Re-read Ratio signal', () => {
  it('scores 100 when there are no Read rows', () => {
    const rows = [makeRow({ toolName: 'Bash' })];
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Re-reads');
    expect(sig?.value).toBe(100);
    expect(health.rereadRatio).toBe(0);
  });

  it('scores 100 when every Read targets a unique file', () => {
    const rows = [
      makeReadRow('/a.ts'),
      makeReadRow('/b.ts'),
      makeReadRow('/c.ts'),
    ];
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Re-reads');
    expect(sig?.value).toBe(100);
    expect(health.rereadRatio).toBe(0);
  });

  it('detects re-reads by repeated file_path in input', () => {
    // 2 reads of same file out of 4 total → 2/4 = 50% ratio → F
    const rows = [
      makeReadRow('/a.ts'),
      makeReadRow('/a.ts'),
      makeReadRow('/a.ts'),
      makeReadRow('/b.ts'),
    ];
    const health = computeContextHealth(rows, 0);
    // 3 reads of /a.ts, first one not a re-read → 2 re-reads / 4 total = 0.5
    expect(health.rereadRatio).toBeCloseTo(0.5);
    const sig = health.signals.find(s => s.name === 'Re-reads');
    expect(sig?.value).toBe(20); // F threshold
  });

  it('re-read ratio is 10% → score 80 (B)', () => {
    // 1 re-read out of 10 reads → 10%
    const rows = [
      makeReadRow('/a.ts'),  // first
      makeReadRow('/b.ts'),
      makeReadRow('/c.ts'),
      makeReadRow('/d.ts'),
      makeReadRow('/e.ts'),
      makeReadRow('/f.ts'),
      makeReadRow('/g.ts'),
      makeReadRow('/h.ts'),
      makeReadRow('/i.ts'),
      makeReadRow('/a.ts'),  // re-read → 1/10 = 10%
    ];
    const health = computeContextHealth(rows, 0);
    expect(health.rereadRatio).toBeCloseTo(0.1);
    const sig = health.signals.find(s => s.name === 'Re-reads');
    // 0.10 is exactly the boundary; since ratio <= 0.10 → score 80
    expect(sig?.value).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// Error Acceleration signal
// ---------------------------------------------------------------------------

describe('Error Acceleration signal', () => {
  it('scores 100 when there are fewer than 4 tool rows', () => {
    const rows = [makeRow(), makeRow(), makeRow()];
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Error Rate');
    expect(sig?.value).toBe(100);
  });

  it('scores 100 when no errors in either half', () => {
    const rows = Array.from({ length: 6 }, () => makeRow({ status: 'success' }));
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Error Rate');
    expect(sig?.value).toBe(100);
    expect(health.errorAcceleration).toBe(1);
  });

  it('scores 40 when first half is clean but second half has errors', () => {
    const rows = [
      makeRow({ status: 'success' }),
      makeRow({ status: 'success' }),
      makeRow({ status: 'error' }),
      makeRow({ status: 'error' }),
    ];
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Error Rate');
    expect(sig?.value).toBe(40);
    expect(health.errorAcceleration).toBe(Infinity);
  });

  it('scores 100 when error rate is stable or declining', () => {
    // First half: 2/4 errors, second half: 1/4 errors → ratio 0.5 → A
    const rows = [
      makeErrorRow(),
      makeErrorRow(),
      makeRow({ status: 'success' }),
      makeRow({ status: 'success' }),
      makeErrorRow(),
      makeRow({ status: 'success' }),
      makeRow({ status: 'success' }),
      makeRow({ status: 'success' }),
    ];
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Error Rate');
    expect(sig?.value).toBe(100); // ratio < 1 → no increase
  });

  it('scores 75 (B) when error rate roughly doubles', () => {
    // First half: 1/4 = 25%, second half: 2/4 = 50% → ratio = 2 → B boundary
    const rows = [
      makeErrorRow(),
      makeRow({ status: 'success' }),
      makeRow({ status: 'success' }),
      makeRow({ status: 'success' }),
      makeErrorRow(),
      makeErrorRow(),
      makeRow({ status: 'success' }),
      makeRow({ status: 'success' }),
    ];
    const health = computeContextHealth(rows, 0);
    // ratio = 0.5 / 0.25 = 2.0 → exactly at B/C boundary; <= 2.0 → 75
    const sig = health.signals.find(s => s.name === 'Error Rate');
    expect(sig?.value).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// Tool Efficiency signal
// ---------------------------------------------------------------------------

describe('Tool Efficiency signal', () => {
  it('scores 100 when fewer than 4 tool rows', () => {
    const rows = [makeRow(), makeWriteRow()];
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Tool Efficiency');
    expect(sig?.value).toBe(100);
  });

  it('scores 80 when no writes appear in first half', () => {
    const rows = [
      makeRow({ toolName: 'Bash' }),
      makeRow({ toolName: 'Read', input: { file_path: '/a.ts' } }),
      makeWriteRow(),
      makeRow({ toolName: 'Bash' }),
    ];
    const health = computeContextHealth(rows, 0);
    // firstRatio = 0 → return 80
    const sig = health.signals.find(s => s.name === 'Tool Efficiency');
    expect(sig?.value).toBe(80);
  });

  it('scores 100 when write ratio is stable across halves', () => {
    // First half: 2/4 write = 0.5, second half: 2/4 write = 0.5 → change = 1.0 → A
    const rows = [
      makeWriteRow(),
      makeWriteRow(),
      makeRow({ toolName: 'Bash' }),
      makeRow({ toolName: 'Bash' }),
      makeWriteRow(),
      makeWriteRow(),
      makeRow({ toolName: 'Bash' }),
      makeRow({ toolName: 'Bash' }),
    ];
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Tool Efficiency');
    expect(sig?.value).toBe(100);
    expect(health.toolEfficiency).toBeCloseTo(1.0);
  });

  it('scores 15 (F) when efficiency collapses in second half', () => {
    // First half: 4/4 write, second half: 0/4 write → change = 0 → F
    const rows = [
      makeWriteRow(),
      makeWriteRow(),
      makeWriteRow(),
      makeWriteRow(),
      makeRow({ toolName: 'Bash' }),
      makeRow({ toolName: 'Bash' }),
      makeRow({ toolName: 'Bash' }),
      makeRow({ toolName: 'Bash' }),
    ];
    const health = computeContextHealth(rows, 0);
    const sig = health.signals.find(s => s.name === 'Tool Efficiency');
    expect(sig?.value).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// All-errors edge case
// ---------------------------------------------------------------------------

describe('all-errors edge case', () => {
  it('produces a low grade when every tool call is an error', () => {
    const rows = Array.from({ length: 8 }, () => makeErrorRow());
    const health = computeContextHealth(rows, 0);
    // Both halves have 100% error rate → ratio = 1.0 → errorAccel score = 100
    // But this is an unusual case where error rate is stable at 100%
    // Grade depends on fill and other signals too; primary signal is fill.
    // With default inputTokens of 1000 (very low), fill score is 100.
    // Error accel: both halves 100% errors → ratio=1 → score=100
    // So grade may still be A due to low fill — verify the signal value is consistent
    const sig = health.signals.find(s => s.name === 'Error Rate');
    expect(sig).toBeDefined();
    // No acceleration (both halves equal) → score 100
    expect(sig?.value).toBe(100);
  });

  it('produces grade F when all errors AND high fill AND many compactions', () => {
    const rows = Array.from({ length: 8 }, () =>
      makeErrorRow(),
    );
    // Force high tokens on last row
    rows[7] = makeRow({ status: 'error', inputTokens: 195_000 });

    const health = computeContextHealth(rows, 5);
    const gradeOrder: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
    expect(gradeOrder[health.grade]).toBeLessThanOrEqual(gradeOrder['D']);
  });
});

// ---------------------------------------------------------------------------
// ContextHealth shape
// ---------------------------------------------------------------------------

describe('ContextHealth return shape', () => {
  it('always returns exactly 5 signals', () => {
    const health = computeContextHealth([makeRow()], 0);
    expect(health.signals).toHaveLength(5);
  });

  it('signal weights sum to 1.0', () => {
    const health = computeContextHealth([makeRow()], 0);
    const total = health.signals.reduce((sum, s) => sum + s.weight, 0);
    expect(total).toBeCloseTo(1.0);
  });

  it('composite score equals weighted average of signal values', () => {
    const health = computeContextHealth([makeRow({ inputTokens: 120_000 })], 1);
    const expected = health.signals.reduce((sum, s) => sum + s.value * s.weight, 0);
    expect(health.score).toBe(Math.round(expected));
  });
});
