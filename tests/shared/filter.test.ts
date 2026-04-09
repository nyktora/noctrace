import { describe, it, expect } from 'vitest';

import { parseFilterString, rowMatchesFilter } from '../../src/shared/filter.ts';
import type { WaterfallRow } from '../../src/shared/types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<WaterfallRow> = {}): WaterfallRow {
  return {
    id: 'test-id',
    type: 'tool',
    toolName: 'Bash',
    label: 'npm test',
    startTime: 0,
    endTime: 1000,
    duration: 1000,
    status: 'success',
    parentAgentId: null,
    input: {},
    output: null,
    inputTokens: 0,
    outputTokens: 0,
    tokenDelta: 0,
    contextFillPercent: 0,
    isReread: false,
    children: [],
    tips: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseFilterString
// ---------------------------------------------------------------------------

describe('parseFilterString', () => {
  it('returns empty result for empty string', () => {
    const result = parseFilterString('');
    expect(result.textTokens).toEqual([]);
    expect(result.typeFilters).toEqual([]);
    expect(result.minDuration).toBeNull();
    expect(result.maxDuration).toBeNull();
    expect(result.statusFilters).toEqual([]);
    expect(result.minTokens).toBeNull();
    expect(result.maxTokens).toBeNull();
  });

  it('parses a single type filter', () => {
    const result = parseFilterString('type:bash');
    expect(result.typeFilters).toEqual(['bash']);
    expect(result.textTokens).toEqual([]);
  });

  it('parses multiple type filters into an OR list', () => {
    const result = parseFilterString('type:read type:write');
    expect(result.typeFilters).toEqual(['read', 'write']);
  });

  it('parses >5s as minDuration in ms', () => {
    const result = parseFilterString('>5s');
    expect(result.minDuration).toBe(5000);
  });

  it('parses <100ms as maxDuration in ms', () => {
    const result = parseFilterString('<100ms');
    expect(result.maxDuration).toBe(100);
  });

  it('parses >NNN (no unit) as seconds', () => {
    const result = parseFilterString('>10');
    expect(result.minDuration).toBe(10000);
  });

  it('parses <NNNs as maxDuration', () => {
    const result = parseFilterString('<2s');
    expect(result.maxDuration).toBe(2000);
  });

  it('parses tokens:>1000', () => {
    const result = parseFilterString('tokens:>1000');
    expect(result.minTokens).toBe(1000);
  });

  it('parses tokens:<5000', () => {
    const result = parseFilterString('tokens:<5000');
    expect(result.maxTokens).toBe(5000);
  });

  it('parses tokens:>1k using k suffix', () => {
    const result = parseFilterString('tokens:>1k');
    expect(result.minTokens).toBe(1000);
  });

  it('parses tokens:<1.5m using m suffix', () => {
    const result = parseFilterString('tokens:<1.5m');
    expect(result.maxTokens).toBe(1_500_000);
  });

  it('places plain text in textTokens', () => {
    const result = parseFilterString('parser');
    expect(result.textTokens).toEqual(['parser']);
    expect(result.typeFilters).toEqual([]);
  });

  it('lowercases textTokens', () => {
    const result = parseFilterString('MyTool');
    expect(result.textTokens).toEqual(['mytool']);
  });

  it('parses "error" into statusFilters', () => {
    const result = parseFilterString('error');
    expect(result.statusFilters).toEqual(['error']);
    expect(result.textTokens).toEqual([]);
  });

  it('parses "running" into statusFilters', () => {
    const result = parseFilterString('running');
    expect(result.statusFilters).toEqual(['running']);
  });

  it('parses "success" into statusFilters', () => {
    const result = parseFilterString('success');
    expect(result.statusFilters).toEqual(['success']);
  });

  it('parses "agent" as type filter (backward compat)', () => {
    const result = parseFilterString('agent');
    expect(result.typeFilters).toEqual(['agent']);
    expect(result.statusFilters).toEqual([]);
    expect(result.textTokens).toEqual([]);
  });

  it('parses combined type:bash >5s', () => {
    const result = parseFilterString('type:bash >5s');
    expect(result.typeFilters).toEqual(['bash']);
    expect(result.minDuration).toBe(5000);
    expect(result.textTokens).toEqual([]);
  });

  it('parses type:bash error some text together', () => {
    const result = parseFilterString('type:bash error some text');
    expect(result.typeFilters).toEqual(['bash']);
    expect(result.statusFilters).toEqual(['error']);
    expect(result.textTokens).toEqual(['some', 'text']);
  });

  it('handles extra whitespace', () => {
    const result = parseFilterString('  type:read  >2s  ');
    expect(result.typeFilters).toEqual(['read']);
    expect(result.minDuration).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// rowMatchesFilter
// ---------------------------------------------------------------------------

describe('rowMatchesFilter', () => {
  it('matches everything when filter is empty', () => {
    const row = makeRow({ toolName: 'Bash', status: 'error' });
    const parsed = parseFilterString('');
    expect(rowMatchesFilter(row, parsed)).toBe(true);
  });

  it('type:bash matches a Bash row', () => {
    const row = makeRow({ toolName: 'Bash' });
    const parsed = parseFilterString('type:bash');
    expect(rowMatchesFilter(row, parsed)).toBe(true);
  });

  it('type:bash does not match a Read row', () => {
    const row = makeRow({ toolName: 'Read' });
    const parsed = parseFilterString('type:bash');
    expect(rowMatchesFilter(row, parsed)).toBe(false);
  });

  it('type:read type:write OR-matches either tool', () => {
    const parsed = parseFilterString('type:read type:write');
    expect(rowMatchesFilter(makeRow({ toolName: 'Read' }), parsed)).toBe(true);
    expect(rowMatchesFilter(makeRow({ toolName: 'Write' }), parsed)).toBe(true);
    expect(rowMatchesFilter(makeRow({ toolName: 'Bash' }), parsed)).toBe(false);
  });

  it('>5s matches a row with duration 6000ms', () => {
    const row = makeRow({ duration: 6000 });
    const parsed = parseFilterString('>5s');
    expect(rowMatchesFilter(row, parsed)).toBe(true);
  });

  it('>5s does not match a row with duration 4000ms', () => {
    const row = makeRow({ duration: 4000 });
    const parsed = parseFilterString('>5s');
    expect(rowMatchesFilter(row, parsed)).toBe(false);
  });

  it('<100ms matches a row with duration 50ms', () => {
    const row = makeRow({ duration: 50 });
    const parsed = parseFilterString('<100ms');
    expect(rowMatchesFilter(row, parsed)).toBe(true);
  });

  it('<100ms does not match a row with duration 150ms', () => {
    const row = makeRow({ duration: 150 });
    const parsed = parseFilterString('<100ms');
    expect(rowMatchesFilter(row, parsed)).toBe(false);
  });

  it('duration filter does not match when duration is null', () => {
    const row = makeRow({ duration: null });
    expect(rowMatchesFilter(row, parseFilterString('>1s'))).toBe(false);
    expect(rowMatchesFilter(row, parseFilterString('<10s'))).toBe(false);
  });

  it('tokens:>1000 matches tokenDelta 1500', () => {
    const row = makeRow({ tokenDelta: 1500 });
    const parsed = parseFilterString('tokens:>1000');
    expect(rowMatchesFilter(row, parsed)).toBe(true);
  });

  it('tokens:>1000 does not match tokenDelta 500', () => {
    const row = makeRow({ tokenDelta: 500 });
    const parsed = parseFilterString('tokens:>1000');
    expect(rowMatchesFilter(row, parsed)).toBe(false);
  });

  it('tokens:<5000 matches tokenDelta 3000', () => {
    const row = makeRow({ tokenDelta: 3000 });
    const parsed = parseFilterString('tokens:<5000');
    expect(rowMatchesFilter(row, parsed)).toBe(true);
  });

  it('tokens:<5000 does not match tokenDelta 6000', () => {
    const row = makeRow({ tokenDelta: 6000 });
    const parsed = parseFilterString('tokens:<5000');
    expect(rowMatchesFilter(row, parsed)).toBe(false);
  });

  it('error status filter matches error row', () => {
    const row = makeRow({ status: 'error' });
    const parsed = parseFilterString('error');
    expect(rowMatchesFilter(row, parsed)).toBe(true);
  });

  it('error status filter does not match success row', () => {
    const row = makeRow({ status: 'success' });
    const parsed = parseFilterString('error');
    expect(rowMatchesFilter(row, parsed)).toBe(false);
  });

  it('running status filter matches running row', () => {
    const row = makeRow({ status: 'running' });
    const parsed = parseFilterString('running');
    expect(rowMatchesFilter(row, parsed)).toBe(true);
  });

  it('plain text matches against label (case-insensitive)', () => {
    const row = makeRow({ label: 'Parse session logs' });
    const parsed = parseFilterString('parser');
    // 'parse' vs 'parser' — 'parser' is not in 'parse session logs'
    expect(rowMatchesFilter(row, parsed)).toBe(false);
    const parsed2 = parseFilterString('parse');
    expect(rowMatchesFilter(row, parsed2)).toBe(true);
  });

  it('plain text matches against toolName (case-insensitive)', () => {
    const row = makeRow({ toolName: 'Bash', label: 'some unrelated label' });
    const parsed = parseFilterString('bash');
    expect(rowMatchesFilter(row, parsed)).toBe(true);
  });

  it('multiple text tokens are AND-ed', () => {
    const row = makeRow({ toolName: 'Bash', label: 'run tests' });
    expect(rowMatchesFilter(row, parseFilterString('bash tests'))).toBe(true);
    expect(rowMatchesFilter(row, parseFilterString('bash build'))).toBe(false);
  });

  it('mixed type and duration filters are AND-ed', () => {
    const bashSlow = makeRow({ toolName: 'Bash', duration: 8000 });
    const bashFast = makeRow({ toolName: 'Bash', duration: 2000 });
    const readSlow = makeRow({ toolName: 'Read', duration: 8000 });

    const parsed = parseFilterString('type:bash >5s');
    expect(rowMatchesFilter(bashSlow, parsed)).toBe(true);
    expect(rowMatchesFilter(bashFast, parsed)).toBe(false);
    expect(rowMatchesFilter(readSlow, parsed)).toBe(false);
  });

  it('agent type filter matches agent-type rows (backward compat)', () => {
    const agentRow = makeRow({ type: 'agent', toolName: 'task', label: 'Sub-agent' });
    const toolRow = makeRow({ type: 'tool', toolName: 'Bash', label: 'Bash call' });
    const parsed = parseFilterString('agent');
    expect(rowMatchesFilter(agentRow, parsed)).toBe(true);
    expect(rowMatchesFilter(toolRow, parsed)).toBe(false);
  });

  it('agent rows match if any child matches', () => {
    const child = makeRow({ toolName: 'Bash', label: 'npm test', status: 'error' });
    const agentRow = makeRow({
      type: 'agent',
      toolName: 'task',
      label: 'My agent',
      status: 'success',
      children: [child],
    });
    const parsed = parseFilterString('error');
    // Agent itself is success, but child is error — should match
    expect(rowMatchesFilter(agentRow, parsed)).toBe(true);
  });

  it('agent rows do not match when children do not match and agent itself does not match', () => {
    const child = makeRow({ toolName: 'Read', label: 'read file', status: 'success' });
    const agentRow = makeRow({
      type: 'agent',
      toolName: 'task',
      label: 'My agent',
      status: 'success',
      children: [child],
    });
    const parsed = parseFilterString('error');
    expect(rowMatchesFilter(agentRow, parsed)).toBe(false);
  });
});
