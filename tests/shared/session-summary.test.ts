/**
 * Tests for src/shared/session-summary.ts
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonlContent } from '../../src/shared/parser';
import {
  buildSessionSummary,
  buildSessionSummaryFromContent,
} from '../../src/shared/session-summary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8');
}

// ---------------------------------------------------------------------------
// Happy path — simple session
// ---------------------------------------------------------------------------

describe('buildSessionSummary — simple session', () => {
  const content = loadFixture('simple-session.jsonl');
  const rows = parseJsonlContent(content);
  const summary = buildSessionSummaryFromContent(rows, 'sess-001', '-Users-lam-dev-noctrace', content);

  it('returns the correct sessionId and projectSlug', () => {
    expect(summary.sessionId).toBe('sess-001');
    expect(summary.projectSlug).toBe('-Users-lam-dev-noctrace');
  });

  it('has non-zero startMs and endMs with startMs <= endMs', () => {
    expect(summary.startMs).toBeGreaterThan(0);
    expect(summary.endMs).toBeGreaterThanOrEqual(summary.startMs);
  });

  it('populates toolCounts for tools that appear in the session', () => {
    // simple-session.jsonl has Read, Edit, Bash
    expect(summary.toolCounts['Read']).toBeGreaterThanOrEqual(1);
    expect(summary.toolCounts['Edit']).toBeGreaterThanOrEqual(1);
    expect(summary.toolCounts['Bash']).toBeGreaterThanOrEqual(1);
  });

  it('has a non-null healthGrade', () => {
    expect(summary.healthGrade).not.toBeNull();
    expect(['A', 'B', 'C', 'D', 'F']).toContain(summary.healthGrade);
  });

  it('has a non-null healthScore in 0..100', () => {
    expect(summary.healthScore).not.toBeNull();
    expect(summary.healthScore!).toBeGreaterThanOrEqual(0);
    expect(summary.healthScore!).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Empty session
// ---------------------------------------------------------------------------

describe('buildSessionSummary — empty session', () => {
  it('does not throw for empty rows', () => {
    expect(() => buildSessionSummary([], 'empty', 'proj')).not.toThrow();
  });

  it('returns null grade, null model, zero counts for empty rows', () => {
    const summary = buildSessionSummary([], 'empty', 'proj');
    expect(summary.healthGrade).toBeNull();
    expect(summary.healthScore).toBeNull();
    expect(summary.primaryModel).toBeNull();
    expect(Object.keys(summary.toolCounts)).toHaveLength(0);
    expect(summary.compactionCount).toBe(0);
  });

  it('returns zero startMs and endMs for empty rows', () => {
    const summary = buildSessionSummary([], 'empty', 'proj');
    expect(summary.startMs).toBe(0);
    expect(summary.endMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// All-failure session
// ---------------------------------------------------------------------------

describe('buildSessionSummary — session with failures', () => {
  const content = loadFixture('session-with-failure.jsonl');
  const rows = parseJsonlContent(content);
  const summary = buildSessionSummaryFromContent(rows, 'sess-fail', 'my-project', content);

  it('counts failures correctly', () => {
    // Bash row in the fixture has "killed by OOM" → isFailure
    const totalFailures = Object.values(summary.toolFailures).reduce((a, b) => a + b, 0);
    expect(totalFailures).toBeGreaterThanOrEqual(1);
  });

  it('failure counts do not exceed tool counts for the same tool', () => {
    for (const tool of Object.keys(summary.toolFailures)) {
      expect(summary.toolFailures[tool]).toBeLessThanOrEqual(summary.toolCounts[tool] ?? 0);
    }
  });
});

// ---------------------------------------------------------------------------
// Session with compaction
// ---------------------------------------------------------------------------

describe('buildSessionSummaryFromContent — session with compaction', () => {
  const content = loadFixture('session-with-compaction.jsonl');
  const rows = parseJsonlContent(content);
  const summary = buildSessionSummaryFromContent(rows, 'sess-004', 'proj', content);

  it('compactionCount is >= 2 (fixture has 2 compact_boundary records)', () => {
    expect(summary.compactionCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Multiple models
// ---------------------------------------------------------------------------

describe('buildSessionSummary — primaryModel detection', () => {
  it('picks the model with the most turns', () => {
    const base = {
      id: 'r',
      type: 'tool' as const,
      toolName: 'Bash',
      label: 'Bash',
      startTime: 1000,
      endTime: 2000,
      duration: 1000,
      status: 'success' as const,
      parentAgentId: null,
      input: {},
      output: 'ok',
      inputTokens: 100,
      outputTokens: 10,
      tokenDelta: 0,
      contextFillPercent: 1,
      isReread: false,
      isFailure: false,
      children: [],
      tips: [],
      agentType: null,
      agentColor: null,
      sequence: null,
      isFastMode: false,
      parentToolUseId: null,
      estimatedCost: null,
    };

    const rows = [
      { ...base, id: 'r1', modelName: 'claude-opus-4-5' },
      { ...base, id: 'r2', modelName: 'claude-opus-4-5' },
      { ...base, id: 'r3', modelName: 'claude-sonnet-4-5' },
    ];

    const summary = buildSessionSummary(rows, 'sess-x', 'proj');
    expect(summary.primaryModel).toBe('claude-opus-4-5');
  });

  it('returns null primaryModel when no rows have modelName', () => {
    const base = {
      id: 'r',
      type: 'tool' as const,
      toolName: 'Bash',
      label: 'Bash',
      startTime: 1000,
      endTime: 2000,
      duration: 1000,
      status: 'success' as const,
      parentAgentId: null,
      input: {},
      output: 'ok',
      inputTokens: 100,
      outputTokens: 10,
      tokenDelta: 0,
      contextFillPercent: 1,
      isReread: false,
      isFailure: false,
      children: [],
      tips: [],
      agentType: null,
      agentColor: null,
      sequence: null,
      isFastMode: false,
      parentToolUseId: null,
      estimatedCost: null,
      modelName: null,
    };

    const summary = buildSessionSummary([base], 'sess-y', 'proj');
    expect(summary.primaryModel).toBeNull();
  });
});
