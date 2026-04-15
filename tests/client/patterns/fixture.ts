import type { PatternsResponse } from '../../../src/client/store/patterns-store.ts';

/** Fixture data matching the PatternsResponse contract */
export const FIXTURE_PATTERNS: PatternsResponse = {
  window: {
    kind: '7d',
    startMs: 1744070400000,
    endMs: 1744675200000,
    prevStartMs: 1743465600000,
    prevEndMs: 1744070400000,
    label: 'Apr 7 – Apr 14, 2026',
  },
  sessionCounts: { current: 42, previous: 35 },
  healthDist: {
    current: { A: 12, B: 15, C: 8, D: 5, F: 2 },
    previous: { A: 10, B: 12, C: 7, D: 4, F: 2 },
  },
  rotLeaderboard: [
    {
      project: '~/dev/noctrace',
      rawSlug: '-Users-lam-dev-noctrace',
      sessions: 20,
      bad: 7,
      badPct: 0.35,
      avgCompactions: 2.1,
      worstSessionId: 'abc123',
    },
    {
      project: '~/dev/myapp',
      rawSlug: '-Users-lam-dev-myapp',
      sessions: 10,
      bad: 1,
      badPct: 0.1,
      avgCompactions: 0.5,
      worstSessionId: null,
    },
    {
      project: '~/dev/cleanproject',
      rawSlug: '-Users-lam-dev-cleanproject',
      sessions: 12,
      bad: 0,
      badPct: 0,
      avgCompactions: 0,
      worstSessionId: null,
    },
  ],
  toolHealth: [
    {
      tool: 'Bash',
      calls: 450,
      failures: 30,
      failPct: 0.067,
      p50ms: 1200,
      p95ms: 8500,
      callsPrev: 400,
    },
    {
      tool: 'Read',
      calls: 300,
      failures: 3,
      failPct: 0.01,
      p50ms: 80,
      p95ms: 900,
      callsPrev: 320,
    },
    {
      tool: 'Edit',
      calls: 200,
      failures: 0,
      failPct: 0,
      p50ms: 50,
      p95ms: 400,
      callsPrev: 200,
    },
  ],
  errors: [],
};

/** Fixture with parse errors */
export const FIXTURE_WITH_ERRORS: PatternsResponse = {
  ...FIXTURE_PATTERNS,
  errors: [
    { path: '/some/session.jsonl', reason: 'Unexpected token at line 42' },
    { path: '/other/session.jsonl', reason: 'Invalid JSON' },
  ],
};

/** Fixture with zero sessions (empty window) */
export const FIXTURE_EMPTY: PatternsResponse = {
  window: {
    kind: 'today',
    startMs: Date.now() - 86400000,
    endMs: Date.now(),
    prevStartMs: Date.now() - 172800000,
    prevEndMs: Date.now() - 86400000,
    label: 'Apr 13, 2026',
  },
  sessionCounts: { current: 0, previous: 0 },
  healthDist: {
    current: { A: 0, B: 0, C: 0, D: 0, F: 0 },
    previous: { A: 0, B: 0, C: 0, D: 0, F: 0 },
  },
  rotLeaderboard: [],
  toolHealth: [],
  errors: [],
};
