import React, { useEffect } from 'react';

import { usePatternsStore } from '../store/patterns-store.ts';
import type { PatternsWindow } from '../store/patterns-store.ts';
import { PatternsPanel } from '../components/patterns-panel.tsx';
import { HealthDistribution } from '../components/patterns/health-distribution.tsx';
import { RotLeaderboard } from '../components/patterns/rot-leaderboard.tsx';
import { ToolHealthGrid } from '../components/patterns/tool-health-grid.tsx';
import { ArrowUpIcon } from '../icons/arrow-up-icon.tsx';
import { ArrowDownIcon } from '../icons/arrow-down-icon.tsx';

const WINDOWS: Array<{ value: PatternsWindow; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

/** A shimmer skeleton placeholder rectangle */
function Skeleton({ height = 120 }: { height?: number }): React.ReactElement {
  return (
    <div
      style={{
        height,
        borderRadius: 4,
        backgroundColor: 'var(--ctp-surface0)',
        opacity: 0.6,
        animation: 'skeleton-shimmer 1.4s ease-in-out infinite',
      }}
      aria-hidden="true"
    />
  );
}

/** Inline delta chip: "+3" (green) or "-2" (red) */
function DeltaChip({ current, previous }: { current: number; previous: number }): React.ReactElement {
  const delta = current - previous;
  if (delta === 0) {
    return (
      <span
        style={{
          fontSize: 10,
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--ctp-overlay0)',
          padding: '1px 5px',
          borderRadius: 99,
          border: '1px solid var(--ctp-surface1)',
        }}
      >
        same
      </span>
    );
  }
  const positive = delta > 0;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        fontSize: 10,
        fontFamily: 'ui-monospace, monospace',
        color: positive ? 'var(--ctp-green)' : 'var(--ctp-red)',
        padding: '1px 5px',
        borderRadius: 99,
        border: `1px solid ${positive ? 'var(--ctp-green)' : 'var(--ctp-red)'}`,
        backgroundColor: positive ? 'rgba(166, 227, 161, 0.1)' : 'rgba(243, 139, 168, 0.1)',
      }}
    >
      {positive
        ? <ArrowUpIcon size={9} color="var(--ctp-green)" />
        : <ArrowDownIcon size={9} color="var(--ctp-red)" />}
      {Math.abs(delta)}
    </span>
  );
}

/**
 * Top-level Patterns view.
 * Shown when store.view === 'patterns'.
 * Contains window picker, session totals, and three sub-panels.
 */
export function PatternsView(): React.ReactElement {
  const patternsWindow = usePatternsStore((s) => s.patternsWindow);
  const setPatternsWindow = usePatternsStore((s) => s.setPatternsWindow);
  const patternsData = usePatternsStore((s) => s.patternsData);
  const patternsLoading = usePatternsStore((s) => s.patternsLoading);
  const patternsError = usePatternsStore((s) => s.patternsError);
  const fetchPatterns = usePatternsStore((s) => s.fetchPatterns);

  // Fetch on mount if we have no data yet
  useEffect(() => {
    if (patternsData === null && !patternsLoading) {
      void fetchPatterns();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Log parse errors to console and show a toast
  useEffect(() => {
    if (patternsData && patternsData.errors.length > 0) {
      for (const e of patternsData.errors) {
        console.warn('[noctrace] patterns parse error', e.path, e.reason);
      }
    }
  }, [patternsData]);

  const windowPillStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px',
    fontSize: 11,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--ctp-text)' : 'var(--ctp-overlay0)',
    backgroundColor: active ? 'var(--ctp-surface1)' : 'transparent',
    border: '1px solid',
    borderColor: active ? 'var(--ctp-surface2)' : 'var(--ctp-surface0)',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background-color 120ms, color 120ms',
  });

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        backgroundColor: 'var(--ctp-base)',
      }}
    >
      {/* ---- Header row ---- */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {/* Window switcher */}
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              type="button"
              onClick={() => setPatternsWindow(w.value)}
              style={windowPillStyle(patternsWindow === w.value)}
              data-testid={`window-${w.value}`}
            >
              {w.label}
            </button>
          ))}
        </div>

        {/* Window label */}
        {patternsData && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--ctp-overlay0)',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            }}
          >
            {patternsData.window.label}
          </span>
        )}

        {/* Session totals */}
        {patternsData && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginLeft: 'auto',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontFamily: 'ui-monospace, monospace',
                fontWeight: 600,
                color: 'var(--ctp-text)',
              }}
              aria-label="Sessions in window"
            >
              {patternsData.sessionCounts.current} sessions
            </span>
            <span style={{ fontSize: 11, color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
              prev: {patternsData.sessionCounts.previous}
            </span>
            <DeltaChip
              current={patternsData.sessionCounts.current}
              previous={patternsData.sessionCounts.previous}
            />
          </div>
        )}
      </div>

      {/* ---- Error state ---- */}
      {patternsError && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            backgroundColor: 'rgba(243, 139, 168, 0.12)',
            border: '1px solid var(--ctp-red)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--ctp-red)',
            fontFamily: 'ui-monospace, monospace',
          }}
          data-testid="patterns-error"
        >
          Failed to load patterns data: {patternsError}
        </div>
      )}

      {/* ---- Parse errors toast ---- */}
      {patternsData && patternsData.errors.length > 0 && (
        <div
          style={{
            padding: '6px 12px',
            backgroundColor: 'rgba(249, 226, 175, 0.1)',
            border: '1px solid var(--ctp-yellow)',
            borderRadius: 4,
            fontSize: 11,
            color: 'var(--ctp-yellow)',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
          data-testid="parse-errors-toast"
        >
          {patternsData.errors.length} session{patternsData.errors.length === 1 ? '' : 's'} failed to parse. See console.
        </div>
      )}

      {/* ---- Empty state ---- */}
      {!patternsLoading && !patternsError && patternsData && patternsData.sessionCounts.current === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: 'var(--ctp-overlay0)',
            fontSize: 13,
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
          data-testid="empty-state"
        >
          No sessions in this window yet.
        </div>
      )}

      {/* ---- Skeleton loading state ---- */}
      {patternsLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="loading-skeleton" aria-label="Loading">
          <Skeleton height={160} />
          <Skeleton height={200} />
          <Skeleton height={220} />
        </div>
      )}

      {/* ---- Panel content ---- */}
      {!patternsLoading && patternsData && patternsData.sessionCounts.current > 0 && (
        <>
          {/* Health Distribution */}
          <PatternsPanel title="Health distribution">
            <HealthDistribution
              current={patternsData.healthDist.current}
              previous={patternsData.healthDist.previous}
              excludedByProvider={patternsData.healthExcludedByProvider}
            />
          </PatternsPanel>

          {/* ROT Leaderboard */}
          <PatternsPanel title="Project ROT leaderboard">
            <RotLeaderboard
              rows={patternsData.rotLeaderboard}
              excludedByProvider={patternsData.healthExcludedByProvider}
            />
          </PatternsPanel>

          {/* Tool Health Grid */}
          <PatternsPanel title="Tool health">
            <ToolHealthGrid
              tools={patternsData.toolHealth}
              excludedByProvider={patternsData.toolHealthExcludedByProvider}
            />
          </PatternsPanel>
        </>
      )}
    </div>
  );
}
