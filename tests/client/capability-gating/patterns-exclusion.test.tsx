/**
 * Capability gate: Patterns panels must render exclusion notes when
 * `excludedByProvider` is non-empty, and must NOT show notes when it is absent or empty.
 * @vitest-environment happy-dom
 *
 * The tests confirm the exclusion UI is driven by the `excludedByProvider` prop — not
 * unconditionally shown. The component only renders exclusion notes when there are
 * sessions from providers that lack the required capability.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { HealthDistribution } from '../../../src/client/components/patterns/health-distribution.tsx';
import { RotLeaderboard } from '../../../src/client/components/patterns/rot-leaderboard.tsx';
import { ToolHealthGrid } from '../../../src/client/components/patterns/tool-health-grid.tsx';
import type { HealthGradeDist, PatternsResponse } from '../../../src/client/store/patterns-store.ts';

const ZERO_DIST: HealthGradeDist = { A: 5, B: 3, C: 2, D: 1, F: 0 };
const PREV_DIST: HealthGradeDist = { A: 4, B: 2, C: 1, D: 1, F: 0 };

const ROT_ROWS: PatternsResponse['rotLeaderboard'] = [
  {
    project: '~/dev/test',
    rawSlug: '-Users-test',
    sessions: 5,
    bad: 2,
    badPct: 0.4,
    avgCompactions: 1.2,
    worstSessionId: null,
  },
];

const TOOL_ROWS: PatternsResponse['toolHealth'] = [
  {
    tool: 'Bash',
    calls: 100,
    failures: 5,
    failPct: 0.05,
    p50ms: 800,
    p95ms: 3000,
    callsPrev: 90,
  },
];

describe('Capability gate: HealthDistribution exclusion note', () => {
  it('does not show exclusion note when excludedByProvider is absent', () => {
    render(<HealthDistribution current={ZERO_DIST} previous={PREV_DIST} />);
    expect(screen.queryByTestId('health-exclusion-note')).toBeNull();
  });

  it('does not show exclusion note when excludedByProvider is empty', () => {
    render(<HealthDistribution current={ZERO_DIST} previous={PREV_DIST} excludedByProvider={{}} />);
    expect(screen.queryByTestId('health-exclusion-note')).toBeNull();
  });

  it('does not show exclusion note when all providers have 0 excluded', () => {
    render(
      <HealthDistribution
        current={ZERO_DIST}
        previous={PREV_DIST}
        excludedByProvider={{ 'test-minimal': 0 }}
      />
    );
    expect(screen.queryByTestId('health-exclusion-note')).toBeNull();
  });

  it('shows exclusion note when a provider has excluded sessions', () => {
    render(
      <HealthDistribution
        current={ZERO_DIST}
        previous={PREV_DIST}
        excludedByProvider={{ 'GitHub Copilot': 3 }}
      />
    );
    const note = screen.getByTestId('health-exclusion-note');
    expect(note).toBeTruthy();
    expect(note.textContent).toContain('3 sessions excluded');
    expect(note.textContent).toContain('GitHub Copilot');
  });

  it('shows correct count for a single excluded session', () => {
    render(
      <HealthDistribution
        current={ZERO_DIST}
        previous={PREV_DIST}
        excludedByProvider={{ 'Codex': 1 }}
      />
    );
    const note = screen.getByTestId('health-exclusion-note');
    expect(note.textContent).toContain('1 session excluded');
    // Singular "session" not "sessions"
    expect(note.textContent).not.toContain('1 sessions excluded');
  });
});

describe('Capability gate: RotLeaderboard exclusion note', () => {
  it('does not show exclusion note when excludedByProvider is absent', () => {
    render(<RotLeaderboard rows={ROT_ROWS} />);
    expect(screen.queryByTestId('rot-exclusion-note')).toBeNull();
  });

  it('shows exclusion note when provider has excluded sessions', () => {
    render(
      <RotLeaderboard
        rows={ROT_ROWS}
        excludedByProvider={{ 'GitHub Copilot': 4 }}
      />
    );
    const note = screen.getByTestId('rot-exclusion-note');
    expect(note).toBeTruthy();
    expect(note.textContent).toContain('4 sessions excluded');
  });
});

describe('Capability gate: ToolHealthGrid exclusion note', () => {
  it('does not show exclusion note when excludedByProvider is absent', () => {
    render(<ToolHealthGrid tools={TOOL_ROWS} />);
    expect(screen.queryByTestId('tool-exclusion-note')).toBeNull();
  });

  it('shows exclusion note when provider has excluded sessions', () => {
    render(
      <ToolHealthGrid
        tools={TOOL_ROWS}
        excludedByProvider={{ 'GitHub Copilot': 7 }}
      />
    );
    const note = screen.getByTestId('tool-exclusion-note');
    expect(note).toBeTruthy();
    expect(note.textContent).toContain('7 sessions excluded');
    expect(note.textContent).toContain('GitHub Copilot');
  });

  it('gates on actual capability: exclusion note absent for empty exclusions', () => {
    // Empty record: no sessions were excluded, so no note
    render(
      <ToolHealthGrid
        tools={TOOL_ROWS}
        excludedByProvider={{}}
      />
    );
    expect(screen.queryByTestId('tool-exclusion-note')).toBeNull();
  });
});
