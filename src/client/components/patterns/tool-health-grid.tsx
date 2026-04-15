import React from 'react';

import type { PatternsResponse } from '../../store/patterns-store.ts';
import { ArrowUpIcon } from '../../icons/arrow-up-icon.tsx';
import { ArrowDownIcon } from '../../icons/arrow-down-icon.tsx';

/** Props for ToolHealthGrid */
export interface ToolHealthGridProps {
  tools: PatternsResponse['toolHealth'];
  /**
   * Sessions excluded from this grid because their provider does not expose full
   * tool-call granularity (toolCallGranularity !== 'full').
   * Key: provider displayName, value: excluded count.
   */
  excludedByProvider?: Record<string, number>;
}

/** Format a 0..1 fail percentage as "3.4%" */
function fmtFailPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/** Format a latency in ms: "234ms" or "1.2s" */
function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/** Color coding for Fail % cells */
function failPctColor(v: number): string {
  if (v > 0.05) return 'var(--ctp-red)';
  if (v >= 0.01) return 'var(--ctp-yellow)';
  return 'var(--ctp-green)';
}

/** Color coding for latency cells (p95) */
function latencyColor(ms: number): string {
  if (ms > 5000) return 'var(--ctp-red)';
  if (ms >= 1000) return 'var(--ctp-yellow)';
  return 'var(--ctp-green)';
}

/** Color coding for p50 latency (less aggressive thresholds) */
function p50Color(ms: number): string {
  if (ms > 5000) return 'var(--ctp-red)';
  if (ms >= 1000) return 'var(--ctp-yellow)';
  return 'var(--ctp-subtext0)';
}

/**
 * Table of tool health stats sorted by fail percentage descending.
 * Fail % cell is color-coded: green <1%, yellow 1-5%, red >5%.
 * p95 latency cell is color-coded: green <1s, yellow 1-5s, red >5s.
 */
export function ToolHealthGrid({ tools, excludedByProvider }: ToolHealthGridProps): React.ReactElement {
  const excludedEntries = excludedByProvider ? Object.entries(excludedByProvider).filter(([, n]) => n > 0) : [];
  if (tools.length === 0) {
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
        No tool data for this window.
      </p>
    );
  }

  const COL_TOOL = '1fr';
  const COL_CALLS = '55px';
  const COL_FAIL = '55px';
  const COL_FAIL_PCT = '60px';
  const COL_P50 = '62px';
  const COL_P95 = '62px';
  const COL_DELTA = '36px';

  const headerStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--ctp-overlay0)',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    padding: '0 4px 6px',
    textAlign: 'right',
  };

  const cellStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: 'ui-monospace, monospace',
    padding: '5px 4px',
    textAlign: 'right',
  };

  return (
    <div role="table" aria-label="Tool health grid">
      {/* Header */}
      <div
        role="row"
        style={{
          display: 'grid',
          gridTemplateColumns: `${COL_TOOL} ${COL_CALLS} ${COL_FAIL} ${COL_FAIL_PCT} ${COL_P50} ${COL_P95} ${COL_DELTA}`,
          borderBottom: '1px solid var(--ctp-surface0)',
          marginBottom: 2,
        }}
      >
        <span role="columnheader" style={{ ...headerStyle, textAlign: 'left' }}>Tool</span>
        <span role="columnheader" style={headerStyle}>Calls</span>
        <span role="columnheader" style={headerStyle}>Failures</span>
        <span role="columnheader" style={headerStyle}>Fail %</span>
        <span role="columnheader" style={headerStyle}>p50</span>
        <span role="columnheader" style={headerStyle}>p95</span>
        <span role="columnheader" style={{ ...headerStyle, textAlign: 'center' }}>Delta</span>
      </div>

      {/* Data rows */}
      {tools.map((t) => {
        const callDelta = t.calls - t.callsPrev;
        const isFailed = t.failPct > 0;
        const rowBg = isFailed && t.failPct > 0.05
          ? 'rgba(243, 139, 168, 0.04)'
          : 'transparent';

        return (
          <div
            key={t.tool}
            role="row"
            data-tool={t.tool}
            data-fail-pct={t.failPct}
            style={{
              display: 'grid',
              gridTemplateColumns: `${COL_TOOL} ${COL_CALLS} ${COL_FAIL} ${COL_FAIL_PCT} ${COL_P50} ${COL_P95} ${COL_DELTA}`,
              backgroundColor: rowBg,
              borderRadius: 3,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--ctp-surface0)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = rowBg;
            }}
          >
            <span
              role="cell"
              style={{ ...cellStyle, textAlign: 'left', color: 'var(--ctp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={t.tool}
            >
              {t.tool}
            </span>
            <span role="cell" style={{ ...cellStyle, color: 'var(--ctp-subtext0)' }}>
              {t.calls.toLocaleString()}
            </span>
            <span role="cell" style={{ ...cellStyle, color: t.failures > 0 ? 'var(--ctp-red)' : 'var(--ctp-subtext0)' }}>
              {t.failures}
            </span>
            <span
              role="cell"
              style={{
                ...cellStyle,
                color: failPctColor(t.failPct),
                fontWeight: t.failPct >= 0.01 ? 700 : 400,
              }}
              data-testid={`fail-pct-${t.tool}`}
            >
              {fmtFailPct(t.failPct)}
            </span>
            <span role="cell" style={{ ...cellStyle, color: p50Color(t.p50ms) }}>
              {fmtMs(t.p50ms)}
            </span>
            <span
              role="cell"
              style={{ ...cellStyle, color: latencyColor(t.p95ms) }}
              data-testid={`p95-${t.tool}`}
            >
              {fmtMs(t.p95ms)}
            </span>
            <span
              role="cell"
              style={{
                ...cellStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
              title={`vs. previous: ${callDelta >= 0 ? '+' : ''}${callDelta} calls`}
            >
              {callDelta > 0 && (
                <>
                  <ArrowUpIcon size={10} color="var(--ctp-green)" />
                  <span style={{ fontSize: 10, color: 'var(--ctp-green)', fontFamily: 'ui-monospace, monospace' }}>
                    {callDelta}
                  </span>
                </>
              )}
              {callDelta < 0 && (
                <>
                  <ArrowDownIcon size={10} color="var(--ctp-red)" />
                  <span style={{ fontSize: 10, color: 'var(--ctp-red)', fontFamily: 'ui-monospace, monospace' }}>
                    {Math.abs(callDelta)}
                  </span>
                </>
              )}
              {callDelta === 0 && (
                <span style={{ fontSize: 10, color: 'var(--ctp-overlay0)', fontFamily: 'ui-monospace, monospace' }}>—</span>
              )}
            </span>
          </div>
        );
      })}

      {/* Exclusion note — shown when sessions with non-full tool granularity were excluded */}
      {excludedEntries.length > 0 && (
        <div
          data-testid="tool-exclusion-note"
          style={{
            marginTop: 8,
            padding: '4px 8px',
            borderRadius: 4,
            backgroundColor: 'rgba(88,91,112,0.2)',
            border: '1px solid var(--ctp-surface1)',
            fontSize: 10,
            color: 'var(--ctp-overlay0)',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          {excludedEntries.map(([providerName, count]) => (
            <span key={providerName}>
              {count} session{count === 1 ? '' : 's'} excluded (provider: {providerName} does not expose full tool-call data)
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
