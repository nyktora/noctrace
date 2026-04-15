/**
 * Tests for PatternsView — loading, error, empty, and parse-error states.
 * @vitest-environment happy-dom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { PatternsView } from '../../../src/client/views/patterns-view.tsx';
import { usePatternsStore } from '../../../src/client/store/patterns-store.ts';
import { FIXTURE_PATTERNS, FIXTURE_WITH_ERRORS, FIXTURE_EMPTY } from './fixture.ts';

// Helper: reset store to a known state before each test
function resetStore(): void {
  usePatternsStore.setState({
    patternsData: null,
    patternsLoading: false,
    patternsError: null,
    patternsWindow: '7d',
  });
}

beforeEach(() => {
  resetStore();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PatternsView — loading state', () => {
  it('shows loading skeleton while patternsLoading is true', async () => {
    usePatternsStore.setState({ patternsLoading: true, patternsData: null });
    render(<PatternsView />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    // Panels should not be visible during loading
    expect(screen.queryByText(/Health distribution/i)).toBeNull();
  });
});

describe('PatternsView — error state', () => {
  it('shows error panel when patternsError is set', async () => {
    // Prevent the useEffect auto-fetch from resetting the error state
    const noopFetch = vi.fn().mockResolvedValue(undefined);
    usePatternsStore.setState({
      patternsLoading: false,
      patternsError: 'Network timeout',
      patternsData: null,
      fetchPatterns: noopFetch,
    });
    render(<PatternsView />);
    const errorEl = screen.getByTestId('patterns-error');
    expect(errorEl.textContent).toContain('Network timeout');
    expect(screen.queryByTestId('loading-skeleton')).toBeNull();
  });
});

describe('PatternsView — empty state', () => {
  it('shows empty state message when sessionCounts.current === 0', () => {
    usePatternsStore.setState({
      patternsLoading: false,
      patternsError: null,
      patternsData: FIXTURE_EMPTY,
    });
    render(<PatternsView />);
    expect(screen.getByTestId('empty-state')).toBeTruthy();
    // Panels should not render
    expect(screen.queryByText('Health distribution')).toBeNull();
  });
});

describe('PatternsView — parse errors toast', () => {
  it('shows toast bar when data.errors has items', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    usePatternsStore.setState({
      patternsLoading: false,
      patternsError: null,
      patternsData: FIXTURE_WITH_ERRORS,
    });
    render(<PatternsView />);
    const toast = screen.getByTestId('parse-errors-toast');
    expect(toast.textContent).toContain('2 sessions failed to parse');
    // Also check that console.warn was called for each error
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('does not show toast when errors array is empty', () => {
    usePatternsStore.setState({
      patternsLoading: false,
      patternsError: null,
      patternsData: FIXTURE_PATTERNS,
    });
    render(<PatternsView />);
    expect(screen.queryByTestId('parse-errors-toast')).toBeNull();
  });
});

describe('PatternsView — populated state', () => {
  beforeEach(() => {
    usePatternsStore.setState({
      patternsLoading: false,
      patternsError: null,
      patternsData: FIXTURE_PATTERNS,
    });
  });

  it('shows session count and window label', () => {
    render(<PatternsView />);
    expect(screen.getByLabelText('Sessions in window').textContent).toContain('42');
    expect(screen.getByText('Apr 7 – Apr 14, 2026')).toBeTruthy();
  });

  it('renders the three panel titles', () => {
    render(<PatternsView />);
    // Panel titles are uppercase in CSS but text is not
    expect(screen.getByText('Health distribution')).toBeTruthy();
    expect(screen.getByText('Project ROT leaderboard')).toBeTruthy();
    expect(screen.getByText('Tool health')).toBeTruthy();
  });

  it('shows previous session count', () => {
    render(<PatternsView />);
    expect(screen.getByText(/prev: 35/)).toBeTruthy();
  });
});

describe('PatternsView — auto-fetch on mount', () => {
  it('calls fetchPatterns when patternsData is null on mount', async () => {
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    usePatternsStore.setState({ patternsData: null, patternsLoading: false });
    // Patch the store action
    const orig = usePatternsStore.getState().fetchPatterns;
    usePatternsStore.setState({ fetchPatterns: fetchMock });

    await act(async () => {
      render(<PatternsView />);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    // Restore
    usePatternsStore.setState({ fetchPatterns: orig });
  });

  it('does not call fetchPatterns again when data already loaded', async () => {
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    usePatternsStore.setState({ patternsData: FIXTURE_PATTERNS, patternsLoading: false });
    const orig = usePatternsStore.getState().fetchPatterns;
    usePatternsStore.setState({ fetchPatterns: fetchMock });

    await act(async () => {
      render(<PatternsView />);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    usePatternsStore.setState({ fetchPatterns: orig });
  });
});
