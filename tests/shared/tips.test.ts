import { describe, it, expect } from 'vitest';
import { attachEfficiencyTips } from '../../src/shared/tips.ts';
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
    tokenDelta: 0,
    contextFillPercent: 0,
    isReread: false,
    children: [],
    tips: [],
    ...overrides,
  };
}

/** Make a Read row with a fixed input for testing identical-loop detection. */
function makeReadRow(filePath: string): WaterfallRow {
  return makeRow({
    toolName: 'Read',
    label: `Read: ${filePath}`,
    input: { file_path: filePath },
  });
}

// ---------------------------------------------------------------------------
// Rule 10: Identical tool loop
// ---------------------------------------------------------------------------

describe('Rule 10: identical-loop', () => {
  it('attaches tip to the 3rd row when 3 identical Read calls are consecutive', () => {
    const rows = [
      makeReadRow('/foo/bar.ts'),
      makeReadRow('/foo/bar.ts'),
      makeReadRow('/foo/bar.ts'),
    ];

    attachEfficiencyTips(rows, []);

    expect(rows[0].tips.some((t) => t.id === 'identical-loop')).toBe(false);
    expect(rows[1].tips.some((t) => t.id === 'identical-loop')).toBe(false);
    expect(rows[2].tips.some((t) => t.id === 'identical-loop')).toBe(true);
  });

  it('attaches tip to 3rd and 4th rows when 4 identical calls are consecutive', () => {
    const rows = [
      makeReadRow('/foo/bar.ts'),
      makeReadRow('/foo/bar.ts'),
      makeReadRow('/foo/bar.ts'),
      makeReadRow('/foo/bar.ts'),
    ];

    attachEfficiencyTips(rows, []);

    expect(rows[0].tips.some((t) => t.id === 'identical-loop')).toBe(false);
    expect(rows[1].tips.some((t) => t.id === 'identical-loop')).toBe(false);
    expect(rows[2].tips.some((t) => t.id === 'identical-loop')).toBe(true);
    expect(rows[3].tips.some((t) => t.id === 'identical-loop')).toBe(true);
  });

  it('does NOT attach tip for only 2 identical consecutive calls', () => {
    const rows = [makeReadRow('/foo/bar.ts'), makeReadRow('/foo/bar.ts')];

    attachEfficiencyTips(rows, []);

    expect(rows[0].tips.some((t) => t.id === 'identical-loop')).toBe(false);
    expect(rows[1].tips.some((t) => t.id === 'identical-loop')).toBe(false);
  });

  it('does NOT attach tip when same tool is called with different inputs', () => {
    const rows = [
      makeReadRow('/foo/a.ts'),
      makeReadRow('/foo/b.ts'),
      makeReadRow('/foo/c.ts'),
    ];

    attachEfficiencyTips(rows, []);

    expect(rows.every((r) => r.tips.every((t) => t.id !== 'identical-loop'))).toBe(true);
  });

  it('does NOT attach tip when 3 identical calls are broken by a different tool in between', () => {
    const rows = [
      makeReadRow('/foo/bar.ts'),
      makeRow({ toolName: 'Bash', input: { command: 'echo hi' } }),
      makeReadRow('/foo/bar.ts'),
      makeReadRow('/foo/bar.ts'),
    ];

    attachEfficiencyTips(rows, []);

    expect(rows.every((r) => r.tips.every((t) => t.id !== 'identical-loop'))).toBe(true);
  });

  it('tip has correct id, severity, and category', () => {
    const rows = [
      makeReadRow('/foo/bar.ts'),
      makeReadRow('/foo/bar.ts'),
      makeReadRow('/foo/bar.ts'),
    ];

    attachEfficiencyTips(rows, []);

    const tip = rows[2].tips.find((t) => t.id === 'identical-loop');
    expect(tip).toBeDefined();
    expect(tip?.severity).toBe('warning');
    // category defaults to 'efficiency' when absent
    expect(tip?.category ?? 'efficiency').toBe('efficiency');
    expect(tip?.title).toBe('Identical tool loop');
  });
});
