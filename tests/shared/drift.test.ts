import { describe, it, expect } from 'vitest';
import { parseAssistantTurns, computeDrift } from '../../src/shared/drift.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a single JSONL line for an assistant record. */
function makeLine(opts: {
  timestamp?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreation?: number;
  cacheRead?: number;
}): string {
  const usage: Record<string, number> = {};
  if (opts.inputTokens != null) usage['input_tokens'] = opts.inputTokens;
  if (opts.outputTokens != null) usage['output_tokens'] = opts.outputTokens;
  if (opts.cacheCreation != null) usage['cache_creation_input_tokens'] = opts.cacheCreation;
  if (opts.cacheRead != null) usage['cache_read_input_tokens'] = opts.cacheRead;
  return JSON.stringify({
    type: 'assistant',
    timestamp: opts.timestamp ?? '2024-01-01T00:00:00.000Z',
    message: { usage },
  });
}

/** Build multi-line JSONL content from multiple lines. */
function makeContent(lines: string[]): string {
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// parseAssistantTurns — basic extraction
// ---------------------------------------------------------------------------

describe('parseAssistantTurns – basic extraction', () => {
  it('returns empty array for empty string', () => {
    expect(parseAssistantTurns('')).toEqual([]);
  });

  it('returns empty array for whitespace-only content', () => {
    expect(parseAssistantTurns('   \n  \n  ')).toEqual([]);
  });

  it('parses a single assistant record', () => {
    const content = makeLine({ inputTokens: 1000, outputTokens: 200, timestamp: '2024-01-01T00:00:00.000Z' });
    const turns = parseAssistantTurns(content);
    expect(turns).toHaveLength(1);
    expect(turns[0].inputTokens).toBe(1000);
    expect(turns[0].outputTokens).toBe(200);
    expect(turns[0].totalTokens).toBe(1200);
    expect(turns[0].timestamp).toBe(new Date('2024-01-01T00:00:00.000Z').getTime());
  });

  it('sums all four token fields into totalTokens', () => {
    const content = makeLine({ inputTokens: 100, outputTokens: 200, cacheCreation: 300, cacheRead: 400 });
    const turns = parseAssistantTurns(content);
    expect(turns[0].totalTokens).toBe(1000);
    expect(turns[0].cacheCreationTokens).toBe(300);
    expect(turns[0].cacheReadTokens).toBe(400);
  });

  it('skips non-assistant record types', () => {
    const user = JSON.stringify({ type: 'user', timestamp: '2024-01-01T00:00:00.000Z', message: { usage: { input_tokens: 100 } } });
    const system = JSON.stringify({ type: 'system', timestamp: '2024-01-01T00:00:00.000Z' });
    const result = JSON.stringify({ type: 'result', timestamp: '2024-01-01T00:00:00.000Z' });
    const content = makeContent([user, system, result]);
    expect(parseAssistantTurns(content)).toEqual([]);
  });

  it('skips records without usage', () => {
    const noUsage = JSON.stringify({ type: 'assistant', timestamp: '2024-01-01T00:00:00.000Z', message: {} });
    const noMessage = JSON.stringify({ type: 'assistant', timestamp: '2024-01-01T00:00:00.000Z' });
    expect(parseAssistantTurns(noUsage)).toEqual([]);
    expect(parseAssistantTurns(noMessage)).toEqual([]);
  });

  it('skips records where totalTokens is 0', () => {
    const zero = makeLine({ inputTokens: 0, outputTokens: 0 });
    expect(parseAssistantTurns(zero)).toEqual([]);
  });

  it('skips malformed (non-JSON) lines', () => {
    const content = makeContent([
      '{not valid json',
      makeLine({ inputTokens: 500 }),
      'also bad',
    ]);
    const turns = parseAssistantTurns(content);
    expect(turns).toHaveLength(1);
    expect(turns[0].totalTokens).toBe(500);
  });

  it('handles missing token fields by treating them as 0', () => {
    const content = makeLine({ inputTokens: 750 }); // outputTokens etc. omitted
    const turns = parseAssistantTurns(content);
    expect(turns[0].totalTokens).toBe(750);
    expect(turns[0].outputTokens).toBe(0);
    expect(turns[0].cacheCreationTokens).toBe(0);
    expect(turns[0].cacheReadTokens).toBe(0);
  });

  it('sorts turns by timestamp ascending', () => {
    const content = makeContent([
      makeLine({ inputTokens: 100, timestamp: '2024-01-01T00:00:03.000Z' }),
      makeLine({ inputTokens: 200, timestamp: '2024-01-01T00:00:01.000Z' }),
      makeLine({ inputTokens: 300, timestamp: '2024-01-01T00:00:02.000Z' }),
    ]);
    const turns = parseAssistantTurns(content);
    expect(turns[0].inputTokens).toBe(200);
    expect(turns[1].inputTokens).toBe(300);
    expect(turns[2].inputTokens).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// computeDrift — edge cases with insufficient data
// ---------------------------------------------------------------------------

describe('computeDrift – insufficient data', () => {
  it('returns driftFactor 1.0 for empty turns array', () => {
    const result = computeDrift([]);
    expect(result.driftFactor).toBe(1.0);
    expect(result.turnCount).toBe(0);
    expect(result.totalTokens).toBe(0);
    expect(result.estimatedSavings).toBe(0);
  });

  it('returns driftFactor 1.0 for fewer than 5 turns', () => {
    const turns = [1, 2, 3, 4].map(i => ({
      timestamp: i * 1000,
      totalTokens: 10_000 * i,
      inputTokens: 10_000 * i,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }));
    const result = computeDrift(turns);
    expect(result.driftFactor).toBe(1.0);
    expect(result.turnCount).toBe(4);
  });

  it('returns driftFactor 1.0 when baseline is zero', () => {
    // 5 turns with zero totalTokens — computeDrift should guard against division by zero
    const turns = Array.from({ length: 5 }, (_, i) => ({
      timestamp: i * 1000,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }));
    const result = computeDrift(turns);
    expect(result.driftFactor).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// computeDrift — stable session
// ---------------------------------------------------------------------------

describe('computeDrift – stable session', () => {
  it('returns driftFactor ~1.0 when all turns cost the same', () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({
      timestamp: i * 1000,
      totalTokens: 20_000,
      inputTokens: 20_000,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }));
    const result = computeDrift(turns);
    expect(result.driftFactor).toBe(1.0);
    expect(result.baselineTokens).toBe(20_000);
    expect(result.currentTokens).toBe(20_000);
    expect(result.estimatedSavings).toBe(0);
  });

  it('returns no savings when driftFactor is exactly 2.0', () => {
    // First 5 turns: 10k each → baseline 10k
    // Last 5 turns: 20k each → current 20k, drift = 2.0 (not > 2)
    const turns = [
      ...Array.from({ length: 5 }, (_, i) => ({ timestamp: i * 1000, totalTokens: 10_000, inputTokens: 10_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })),
      ...Array.from({ length: 5 }, (_, i) => ({ timestamp: (i + 5) * 1000, totalTokens: 20_000, inputTokens: 20_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })),
    ];
    const result = computeDrift(turns);
    expect(result.driftFactor).toBe(2.0);
    expect(result.estimatedSavings).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeDrift — degraded session
// ---------------------------------------------------------------------------

describe('computeDrift – degraded session', () => {
  it('returns driftFactor ~10.0 for severe degradation (20k → 200k)', () => {
    // First 5 turns at 20k tokens (baseline = 20k)
    // Last 5 turns at 200k tokens (current = 200k)
    const turns = [
      ...Array.from({ length: 5 }, (_, i) => ({ timestamp: i * 1000, totalTokens: 20_000, inputTokens: 20_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })),
      ...Array.from({ length: 5 }, (_, i) => ({ timestamp: (i + 5) * 1000, totalTokens: 200_000, inputTokens: 200_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })),
    ];
    const result = computeDrift(turns);
    expect(result.driftFactor).toBe(10.0);
    expect(result.baselineTokens).toBe(20_000);
    expect(result.currentTokens).toBe(200_000);
  });

  it('computes estimatedSavings when driftFactor > 2', () => {
    // 10 turns: first 5 at 10k, last 5 at 100k
    // total = 50k + 500k = 550k
    // baseline = 10k, threshold = 10k * 2 = 20k per turn
    // estimatedSavings = 550k - (10 * 20k) = 550k - 200k = 350k
    const turns = [
      ...Array.from({ length: 5 }, (_, i) => ({ timestamp: i * 1000, totalTokens: 10_000, inputTokens: 10_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })),
      ...Array.from({ length: 5 }, (_, i) => ({ timestamp: (i + 5) * 1000, totalTokens: 100_000, inputTokens: 100_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })),
    ];
    const result = computeDrift(turns);
    expect(result.driftFactor).toBe(10.0);
    expect(result.estimatedSavings).toBe(350_000);
  });

  it('clamps estimatedSavings to >= 0', () => {
    // Drift is > 2 but total is close to baseline * turnCount * 2 — savings should not go negative
    // 6 turns: first 5 at 10k, last 5 at 25k → drift = 2.5
    // total = 5*10k + 5*25k = 50k + 125k = 175k
    // threshold = 6 * 10k * 2 = 120k
    // savings = 175k - 120k = 55k > 0 naturally, but let's use a tighter case
    // 5 turns: first 3 at 1k (samples overlap), last 3 at 3k → drift = 3
    // For a 5-turn session (exactly SAMPLE_SIZE), first 5 = all, last 5 = all
    // so baseline = current = avg of all → drift = 1 (no drift detectable)
    // Use 7 turns to separate first and last sample windows:
    // first 5: 10k each → baseline 10k
    // last 5 (turns 3–7): very large spread — force near-zero savings
    const turns = [
      ...Array.from({ length: 2 }, (_, i) => ({ timestamp: i * 1000, totalTokens: 10_000, inputTokens: 10_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })),
      // middle turn that's large (overlaps both first and last sample)
      { timestamp: 2000, totalTokens: 10_000, inputTokens: 10_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      { timestamp: 3000, totalTokens: 10_000, inputTokens: 10_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      { timestamp: 4000, totalTokens: 10_000, inputTokens: 10_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      { timestamp: 5000, totalTokens: 30_000, inputTokens: 30_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      { timestamp: 6000, totalTokens: 30_000, inputTokens: 30_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
    ];
    const result = computeDrift(turns);
    expect(result.estimatedSavings).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// computeDrift — return shape
// ---------------------------------------------------------------------------

describe('computeDrift – return shape', () => {
  it('always includes all DriftAnalysis fields', () => {
    const result = computeDrift([]);
    expect(result).toHaveProperty('driftFactor');
    expect(result).toHaveProperty('baselineTokens');
    expect(result).toHaveProperty('currentTokens');
    expect(result).toHaveProperty('turnCount');
    expect(result).toHaveProperty('totalTokens');
    expect(result).toHaveProperty('estimatedSavings');
  });

  it('turnCount matches the number of turns passed in', () => {
    const turns = Array.from({ length: 7 }, (_, i) => ({
      timestamp: i * 1000,
      totalTokens: 5_000,
      inputTokens: 5_000,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }));
    const result = computeDrift(turns);
    expect(result.turnCount).toBe(7);
  });

  it('totalTokens is sum of all turn totalTokens', () => {
    const turns = Array.from({ length: 6 }, (_, i) => ({
      timestamp: i * 1000,
      totalTokens: 1_000 * (i + 1),
      inputTokens: 1_000 * (i + 1),
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }));
    const expectedTotal = 1_000 + 2_000 + 3_000 + 4_000 + 5_000 + 6_000;
    const result = computeDrift(turns);
    expect(result.totalTokens).toBe(expectedTotal);
  });
});

// ---------------------------------------------------------------------------
// Integration: parseAssistantTurns → computeDrift pipeline
// ---------------------------------------------------------------------------

describe('parseAssistantTurns + computeDrift – pipeline', () => {
  it('produces driftFactor 1.0 for stable JSONL session', () => {
    const lines = Array.from({ length: 10 }, (_, i) =>
      makeLine({ inputTokens: 15_000, outputTokens: 1_000, timestamp: `2024-01-01T00:00:0${i}.000Z` }),
    );
    const turns = parseAssistantTurns(makeContent(lines));
    const result = computeDrift(turns);
    expect(result.driftFactor).toBe(1.0);
    expect(result.estimatedSavings).toBe(0);
  });

  it('produces high driftFactor for degraded JSONL session', () => {
    const earlyLines = Array.from({ length: 5 }, (_, i) =>
      makeLine({ inputTokens: 20_000, timestamp: `2024-01-01T00:00:0${i}.000Z` }),
    );
    const lateLines = Array.from({ length: 5 }, (_, i) =>
      makeLine({ inputTokens: 200_000, timestamp: `2024-01-01T00:01:0${i}.000Z` }),
    );
    const turns = parseAssistantTurns(makeContent([...earlyLines, ...lateLines]));
    const result = computeDrift(turns);
    expect(result.driftFactor).toBeGreaterThan(2);
    expect(result.estimatedSavings).toBeGreaterThan(0);
  });

  it('ignores non-assistant lines mixed into session JSONL', () => {
    const userLine = JSON.stringify({ type: 'user', timestamp: '2024-01-01T00:00:00.000Z', message: {} });
    const systemLine = JSON.stringify({ type: 'system', timestamp: '2024-01-01T00:00:01.000Z' });
    const malformed = 'not json at all {{';
    const assistantLines = Array.from({ length: 5 }, (_, i) =>
      makeLine({ inputTokens: 10_000, timestamp: `2024-01-01T00:00:0${i + 2}.000Z` }),
    );
    const content = makeContent([userLine, systemLine, malformed, ...assistantLines]);
    const turns = parseAssistantTurns(content);
    expect(turns).toHaveLength(5);
    const result = computeDrift(turns);
    expect(result.turnCount).toBe(5);
    expect(result.driftFactor).toBe(1.0); // exactly SAMPLE_SIZE → first = last → no drift
  });
});
