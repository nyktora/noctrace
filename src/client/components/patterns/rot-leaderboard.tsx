import React from 'react';

import type { PatternsResponse } from '../../store/patterns-store.ts';
import { usePatternsStore } from '../../store/patterns-store.ts';
import { useSessionStore } from '../../store/session-store.ts';
import { LinkIcon } from '../../icons/link-icon.tsx';

/** Props for RotLeaderboard */
export interface RotLeaderboardProps {
  rows: PatternsResponse['rotLeaderboard'];
}

/** Format a 0..1 percentage as "12.3%" */
function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * Table of projects sorted by bad session percentage (descending).
 *
 * Clicking a row navigates to the Sessions view and sets scrollToProjectSlug
 * in the patterns store. The SessionPicker component reads that hint and
 * auto-selects the matching project (see session-picker.tsx integration note).
 *
 * Integration note: session-picker.tsx should call
 * `usePatternsStore.getState().scrollToProjectSlug` on mount and when the
 * sessions view becomes active, auto-select that project, then call
 * `clearScrollToProject()` to consume the hint.
 */
export function RotLeaderboard({ rows }: RotLeaderboardProps): React.ReactElement {
  const setView = usePatternsStore((s) => s.setView);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);

  const handleRowClick = (rawSlug: string): void => {
    // Set the hint so SessionPicker can auto-select this project
    usePatternsStore.setState({ scrollToProjectSlug: rawSlug });
    // Switch to sessions view
    setView('sessions');
    // Pre-fetch the sessions list for the project
    void fetchSessions(rawSlug);
    // Also pre-select the project slug in the session store
    useSessionStore.setState({ selectedProjectSlug: rawSlug });
  };

  if (rows.length === 0) {
    return (
      <p
        style={{
          color: 'var(--ctp-overlay0)',
          fontSize: 12,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          margin: 0,
          textAlign: 'center',
          padding: '16px 0',
        }}
      >
        No project data for this window.
      </p>
    );
  }

  const COL_PROJECT = '1fr';
  const COL_SESSIONS = '60px';
  const COL_BAD = '50px';
  const COL_PCT = '68px';
  const COL_COMPACT = '80px';
  const COL_LINK = '28px';

  const headerStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--ctp-overlay0)',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    padding: '0 4px 6px',
  };

  const cellStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: 'ui-monospace, monospace',
    color: 'var(--ctp-text)',
    padding: '5px 4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  return (
    <div role="table" aria-label="Project ROT leaderboard">
      {/* Header row */}
      <div
        role="row"
        style={{
          display: 'grid',
          gridTemplateColumns: `${COL_PROJECT} ${COL_SESSIONS} ${COL_BAD} ${COL_PCT} ${COL_COMPACT} ${COL_LINK}`,
          borderBottom: '1px solid var(--ctp-surface0)',
          marginBottom: 2,
        }}
      >
        <span role="columnheader" style={{ ...headerStyle, padding: '0 4px 6px' }}>Project</span>
        <span role="columnheader" style={{ ...headerStyle, textAlign: 'right' }}>Sessions</span>
        <span role="columnheader" style={{ ...headerStyle, textAlign: 'right' }}>Bad</span>
        <span role="columnheader" style={{ ...headerStyle, textAlign: 'right' }}>Bad %</span>
        <span role="columnheader" style={{ ...headerStyle, textAlign: 'right' }}>Avg Compactions</span>
        <span role="columnheader" style={headerStyle} />
      </div>

      {/* Data rows */}
      {rows.map((row) => {
        const badPctColor = row.badPct >= 0.5
          ? 'var(--ctp-red)'
          : row.badPct >= 0.25
          ? 'var(--ctp-peach)'
          : 'var(--ctp-subtext0)';

        return (
          <div
            key={row.rawSlug}
            role="row"
            onClick={() => handleRowClick(row.rawSlug)}
            title={`Navigate to ${row.project} in Sessions view`}
            style={{
              display: 'grid',
              gridTemplateColumns: `${COL_PROJECT} ${COL_SESSIONS} ${COL_BAD} ${COL_PCT} ${COL_COMPACT} ${COL_LINK}`,
              cursor: 'pointer',
              borderRadius: 4,
              transition: 'background-color 120ms',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--ctp-surface0)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            <span
              role="cell"
              style={{ ...cellStyle, color: 'var(--ctp-text)', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={row.project}
            >
              {row.project}
            </span>
            <span role="cell" style={{ ...cellStyle, textAlign: 'right', color: 'var(--ctp-subtext0)' }}>
              {row.sessions}
            </span>
            <span role="cell" style={{ ...cellStyle, textAlign: 'right', color: 'var(--ctp-subtext0)' }}>
              {row.bad}
            </span>
            <span role="cell" style={{ ...cellStyle, textAlign: 'right', color: badPctColor, fontWeight: row.badPct >= 0.25 ? 700 : 400 }}>
              {fmtPct(row.badPct)}
            </span>
            <span role="cell" style={{ ...cellStyle, textAlign: 'right', color: 'var(--ctp-subtext0)' }}>
              {row.avgCompactions.toFixed(1)}
            </span>
            <span
              role="cell"
              style={{ ...cellStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ctp-overlay0)' }}
            >
              <LinkIcon size={11} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
