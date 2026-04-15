/**
 * Tests for RotLeaderboard component.
 * @vitest-environment happy-dom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { RotLeaderboard } from '../../../src/client/components/patterns/rot-leaderboard.tsx';
import { usePatternsStore } from '../../../src/client/store/patterns-store.ts';
import { FIXTURE_PATTERNS } from './fixture.ts';

const { rotLeaderboard } = FIXTURE_PATTERNS;

// Mock fetch to prevent network errors during tests
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  }));
  usePatternsStore.setState({
    view: 'sessions',
    scrollToProjectSlug: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RotLeaderboard', () => {
  it('renders all project rows', () => {
    render(<RotLeaderboard rows={rotLeaderboard} />);
    expect(screen.getByText('~/dev/noctrace')).toBeTruthy();
    expect(screen.getByText('~/dev/myapp')).toBeTruthy();
    expect(screen.getByText('~/dev/cleanproject')).toBeTruthy();
  });

  it('preserves sort order (highest badPct first)', () => {
    render(<RotLeaderboard rows={rotLeaderboard} />);
    const rows = screen.getAllByRole('row');
    // rows[0] is the header; rows[1] is the first data row
    // First data row should be ~/dev/noctrace (badPct 0.35)
    expect(rows[1].textContent).toContain('~/dev/noctrace');
    expect(rows[2].textContent).toContain('~/dev/myapp');
    expect(rows[3].textContent).toContain('~/dev/cleanproject');
  });

  it('shows formatted bad percentages', () => {
    render(<RotLeaderboard rows={rotLeaderboard} />);
    expect(screen.getByText('35.0%')).toBeTruthy();
    expect(screen.getByText('10.0%')).toBeTruthy();
    expect(screen.getByText('0.0%')).toBeTruthy();
  });

  it('clicking a row sets scrollToProjectSlug and switches to sessions view', () => {
    render(<RotLeaderboard rows={rotLeaderboard} />);
    const noctraceRow = screen.getByText('~/dev/noctrace').closest('[role="row"]')!;
    fireEvent.click(noctraceRow);

    const state = usePatternsStore.getState();
    expect(state.scrollToProjectSlug).toBe('-Users-lam-dev-noctrace');
    expect(state.view).toBe('sessions');
  });

  it('clicking a different row sets the correct slug', () => {
    render(<RotLeaderboard rows={rotLeaderboard} />);
    const myappRow = screen.getByText('~/dev/myapp').closest('[role="row"]')!;
    fireEvent.click(myappRow);

    const state = usePatternsStore.getState();
    expect(state.scrollToProjectSlug).toBe('-Users-lam-dev-myapp');
    expect(state.view).toBe('sessions');
  });

  it('shows empty state when no rows', () => {
    render(<RotLeaderboard rows={[]} />);
    expect(screen.getByText(/No project data/i)).toBeTruthy();
  });

  it('shows avg compactions column', () => {
    render(<RotLeaderboard rows={rotLeaderboard} />);
    // noctrace has avgCompactions = 2.1
    expect(screen.getByText('2.1')).toBeTruthy();
  });
});
