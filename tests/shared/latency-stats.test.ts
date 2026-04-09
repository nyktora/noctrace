import { describe, it, expect } from 'vitest';
import { computeLatencyStats } from '../../src/shared/latency-stats.ts';
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
    children: [],
    tips: [],
    ...overrides,
  };
}

/** Make a row with a specific tool name and duration. */
function makeTimed(toolName: string, duration: number, id?: string): WaterfallRow {
  return makeRow({ toolName, duration, id: id ?? `timed-${_idCounter}` });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeLatencyStats', () => {
  it('returns empty stats for an empty rows array', () => {
    const result = computeLatencyStats([], 1000);

    expect(result.toolStats).toEqual([]);
    expect(result.totalCalls).toBe(0);
    expect(result.totalDuration).toBe(0);
    expect(result.slowCallIds).toEqual([]);
  });

  it('computes correct P50, P95, and max for a single tool type with 5 rows', () => {
    // Durations: 10, 20, 30, 40, 50  (sorted)
    // n=5, P50 idx = floor(4 * 0.5) = 2 → 30
    // P95 idx = floor(4 * 0.95) = 3 → 40
    // max = 50
    const rows = [
      makeTimed('Read', 30),
      makeTimed('Read', 10),
      makeTimed('Read', 50),
      makeTimed('Read', 20),
      makeTimed('Read', 40),
    ];

    const result = computeLatencyStats(rows, 9999);

    expect(result.toolStats).toHaveLength(1);
    const stat = result.toolStats[0];
    expect(stat.toolName).toBe('Read');
    expect(stat.count).toBe(5);
    expect(stat.p50).toBe(30);
    expect(stat.p95).toBe(40);
    expect(stat.max).toBe(50);
    expect(stat.total).toBe(150);
    expect(result.totalCalls).toBe(5);
    expect(result.totalDuration).toBe(150);
  });

  it('computes each tool type separately and sorts by total descending', () => {
    // Read: 3 calls × 100ms = 300ms total
    // Bash: 2 calls × 200ms = 400ms total
    // Write: 1 call × 50ms = 50ms total
    // Expected order: Bash (400) → Read (300) → Write (50)
    const rows = [
      makeTimed('Read', 100),
      makeTimed('Bash', 200),
      makeTimed('Read', 100),
      makeTimed('Write', 50),
      makeTimed('Bash', 200),
      makeTimed('Read', 100),
    ];

    const result = computeLatencyStats(rows, 9999);

    expect(result.toolStats).toHaveLength(3);
    expect(result.toolStats[0].toolName).toBe('Bash');
    expect(result.toolStats[0].total).toBe(400);
    expect(result.toolStats[1].toolName).toBe('Read');
    expect(result.toolStats[1].total).toBe(300);
    expect(result.toolStats[2].toolName).toBe('Write');
    expect(result.toolStats[2].total).toBe(50);

    expect(result.totalCalls).toBe(6);
    expect(result.totalDuration).toBe(750);
  });

  it('skips rows with null duration', () => {
    const rows = [
      makeTimed('Bash', 100),
      makeRow({ toolName: 'Bash', duration: null, endTime: null }),
      makeTimed('Bash', 200),
    ];

    const result = computeLatencyStats(rows, 9999);

    expect(result.toolStats).toHaveLength(1);
    expect(result.toolStats[0].count).toBe(2);
    expect(result.toolStats[0].total).toBe(300);
    expect(result.totalCalls).toBe(2);
  });

  it('collects slowCallIds for rows exceeding the threshold', () => {
    const slow1 = makeTimed('Bash', 5000, 'slow-1');
    const slow2 = makeTimed('Read', 3001, 'slow-2');
    const fast1 = makeTimed('Bash', 100, 'fast-1');
    const atThreshold = makeTimed('Write', 3000, 'at-threshold'); // exactly at threshold — not slow

    const result = computeLatencyStats([slow1, slow2, fast1, atThreshold], 3000);

    expect(result.slowCallIds).toContain('slow-1');
    expect(result.slowCallIds).toContain('slow-2');
    expect(result.slowCallIds).not.toContain('fast-1');
    expect(result.slowCallIds).not.toContain('at-threshold');
  });

  it('includes nested children rows in computation', () => {
    const child1 = makeTimed('Grep', 50, 'child-1');
    const child2 = makeTimed('Grep', 150, 'child-2');
    const parent = makeRow({
      type: 'agent',
      toolName: 'Agent',
      duration: 500,
      id: 'parent-1',
      children: [child1, child2],
    });

    const result = computeLatencyStats([parent], 9999);

    // Should have Agent + Grep stats
    expect(result.toolStats).toHaveLength(2);
    expect(result.totalCalls).toBe(3); // parent + 2 children

    const grepStat = result.toolStats.find(s => s.toolName === 'Grep');
    expect(grepStat).toBeDefined();
    expect(grepStat!.count).toBe(2);
    expect(grepStat!.total).toBe(200);
    expect(grepStat!.p50).toBe(50);  // floor(1 * 0.5) = 0 → 50
    expect(grepStat!.max).toBe(150);
  });

  it('includes deeply nested children (grandchildren) in computation', () => {
    const grandchild = makeTimed('Write', 300, 'grandchild-1');
    const child = makeRow({
      toolName: 'Agent',
      duration: 400,
      id: 'child-agent',
      type: 'agent',
      children: [grandchild],
    });
    const root = makeRow({
      toolName: 'Agent',
      duration: 500,
      id: 'root-agent',
      type: 'agent',
      children: [child],
    });

    const result = computeLatencyStats([root], 9999);

    const writeStat = result.toolStats.find(s => s.toolName === 'Write');
    expect(writeStat).toBeDefined();
    expect(writeStat!.count).toBe(1);
    expect(writeStat!.total).toBe(300);
    expect(result.totalCalls).toBe(3); // root + child + grandchild
  });

  it('normalizes tool names by lowercasing for grouping', () => {
    // 'Read' and 'read' should be grouped together under one entry.
    // The originalName stored is taken from the first occurrence encountered.
    const rows = [
      makeTimed('Read', 100),
      makeTimed('read', 200),  // same tool, different casing
    ];

    const result = computeLatencyStats(rows, 9999);

    // Grouped under one key — count should be 2.
    expect(result.toolStats).toHaveLength(1);
    expect(result.toolStats[0].count).toBe(2);
    expect(result.toolStats[0].total).toBe(300);
  });

  it('computes correct percentiles for 100 rows with durations 1-100ms', () => {
    // Durations: 1, 2, ..., 100 (n=100, sorted ascending)
    // P50 idx = floor(99 * 0.5) = 49 → duration[49] = 50
    // P95 idx = floor(99 * 0.95) = 94 → duration[94] = 95
    // max = 100
    const rows: WaterfallRow[] = [];
    for (let i = 1; i <= 100; i++) {
      rows.push(makeTimed('Bash', i));
    }

    const result = computeLatencyStats(rows, 9999);

    expect(result.toolStats).toHaveLength(1);
    const stat = result.toolStats[0];
    expect(stat.count).toBe(100);
    expect(stat.p50).toBe(50);
    expect(stat.p95).toBe(95);
    expect(stat.max).toBe(100);
    expect(stat.total).toBe(5050); // sum 1..100
  });
});
