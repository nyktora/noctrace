/**
 * Capability gate: Toolbar must hide the health pill (and token count, cost pill) when
 * the session's provider has contextTracking: false / tokenAccounting: 'none'.
 * @vitest-environment happy-dom
 *
 * The tests confirm that hiding is conditional on capabilities — not unconditional.
 * The positive cases confirm the elements remain visible for FULL_CAPABILITIES.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { Toolbar } from '../../../src/client/components/toolbar.tsx';
import { useSessionStore } from '../../../src/client/store/session-store.ts';
import { FULL_CAPABILITIES, MINIMAL_CAPABILITIES, makeRow, makeHealth } from './fixtures.ts';

/** Minimal store state needed for the toolbar to render its stats pill */
function loadMinimalSession(caps = FULL_CAPABILITIES): void {
  const row = makeRow({ tokenDelta: 500, estimatedCost: 0.001 });
  const health = makeHealth({ grade: 'A', score: 90 });
  useSessionStore.setState({
    rows: [row],
    health,
    drift: null,
    instructionsLoaded: [],
    sessionProvider: caps === FULL_CAPABILITIES ? 'claude-code' : 'test-minimal',
    sessionCapabilities: caps,
    showSessionStats: false,
    showReliability: false,
  });
}

function resetStore(): void {
  useSessionStore.setState({
    rows: [],
    health: null,
    drift: null,
    sessionProvider: null,
    sessionCapabilities: null,
  });
}

describe('Capability gate: Toolbar health pill and token signals', () => {
  beforeEach(() => { resetStore(); });
  afterEach(() => { resetStore(); });

  it('hides health pill when tokenAccounting is none and contextTracking is false', () => {
    loadMinimalSession(MINIMAL_CAPABILITIES);
    render(<Toolbar />);

    // The wrapper span with data-testid="toolbar-health-pill" must not be present
    expect(screen.queryByTestId('toolbar-health-pill')).toBeNull();
  });

  it('shows health pill when contextTracking is true', () => {
    loadMinimalSession(FULL_CAPABILITIES);
    render(<Toolbar />);

    expect(screen.getByTestId('toolbar-health-pill')).toBeTruthy();
  });

  it('hides token count when tokenAccounting is none', () => {
    loadMinimalSession(MINIMAL_CAPABILITIES);
    render(<Toolbar />);

    expect(screen.queryByTestId('toolbar-token-count')).toBeNull();
  });

  it('shows token count when tokenAccounting is per-turn', () => {
    loadMinimalSession(FULL_CAPABILITIES);
    render(<Toolbar />);

    expect(screen.getByTestId('toolbar-token-count')).toBeTruthy();
  });

  it('hides cost pill when tokenAccounting is none', () => {
    loadMinimalSession(MINIMAL_CAPABILITIES);
    render(<Toolbar />);

    expect(screen.queryByTestId('toolbar-cost-pill')).toBeNull();
  });

  it('shows cost pill when tokenAccounting is per-turn (and cost is non-null)', () => {
    loadMinimalSession(FULL_CAPABILITIES);
    render(<Toolbar />);

    // Cost pill is only shown when totalCost !== null (row.estimatedCost = 0.001 so it should appear)
    expect(screen.getByTestId('toolbar-cost-pill')).toBeTruthy();
  });
});
