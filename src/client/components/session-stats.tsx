import React, { useEffect, useMemo } from 'react';

import { computeLatencyStats } from '../../shared/latency-stats.ts';
import type { ToolLatencyStats } from '../../shared/latency-stats.ts';
import { useSessionStore } from '../store/session-store.ts';
import { CloseIcon } from '../icons/close-icon.tsx';
import { formatDuration } from '../utils/tool-colors.ts';
import { getToolColor, resolveColor } from '../utils/tool-colors.ts';

/** Props for SessionStats */
export interface SessionStatsProps {
  onClose: () => void;
}

/** Single row in the tool latency table */
function ToolStatRow({ stat }: { stat: ToolLatencyStats }): React.ReactElement {
  const color = resolveColor(getToolColor(stat.toolName));

  return (
    <tr>
      <td
        style={{
          padding: '3px 8px 3px 12px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          color,
          maxWidth: 110,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={stat.toolName}
      >
        {stat.toolName}
      </td>
      <td
        style={{
          padding: '3px 8px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          color: 'var(--ctp-subtext0)',
          textAlign: 'right',
        }}
      >
        {stat.count}
      </td>
      <td
        style={{
          padding: '3px 8px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          color: 'var(--ctp-subtext0)',
          textAlign: 'right',
        }}
      >
        {formatDuration(stat.p50)}
      </td>
      <td
        style={{
          padding: '3px 8px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          color: 'var(--ctp-subtext0)',
          textAlign: 'right',
        }}
      >
        {formatDuration(stat.p95)}
      </td>
      <td
        style={{
          padding: '3px 8px 3px 8px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          color: 'var(--ctp-subtext0)',
          textAlign: 'right',
        }}
      >
        {formatDuration(stat.max)}
      </td>
    </tr>
  );
}

/**
 * Flyout panel showing per-tool latency statistics for the current session.
 * Computes stats inline via useMemo — not stored in Zustand.
 */
export function SessionStats({ onClose }: SessionStatsProps): React.ReactElement {
  const rows = useSessionStore((s) => s.rows);
  const slowThresholdMs = useSessionStore((s) => s.slowThresholdMs);
  const setSlowThreshold = useSessionStore((s) => s.setSlowThreshold);

  const stats = useMemo(
    () => computeLatencyStats(rows, slowThresholdMs),
    [rows, slowThresholdMs],
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="absolute right-0 top-8 z-50 rounded overflow-hidden shadow-xl"
      style={{
        backgroundColor: 'var(--ctp-mantle)',
        border: '1px solid var(--ctp-surface0)',
        width: 360,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--ctp-surface0)' }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{
            color: 'var(--ctp-overlay0)',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          Session Stats
        </span>
        <button type="button" onClick={onClose} style={{ color: 'var(--ctp-overlay0)' }}>
          <CloseIcon size={14} />
        </button>
      </div>

      {/* Tool latency table */}
      {stats.toolStats.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ctp-surface0)' }}>
                {(['Tool', 'Count', 'P50', 'P95', 'Max'] as const).map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: '4px 8px',
                      paddingLeft: col === 'Tool' ? 12 : 8,
                      textAlign: col === 'Tool' ? 'left' : 'right',
                      fontSize: 9,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--ctp-overlay0)',
                      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.toolStats.map((stat) => (
                <ToolStatRow key={stat.toolName} stat={stat} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="px-3 py-4 text-xs text-center"
          style={{ color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          No completed tool calls yet
        </div>
      )}

      {/* Summary row */}
      {stats.toolStats.length > 0 && (
        <div
          className="px-3 py-2 text-xs flex gap-4"
          style={{
            borderTop: '1px solid var(--ctp-surface0)',
            color: 'var(--ctp-subtext0)',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          <span>
            Calls:{' '}
            <strong style={{ color: 'var(--ctp-text)' }}>{stats.totalCalls}</strong>
          </span>
          <span>
            Total:{' '}
            <strong style={{ color: 'var(--ctp-text)' }}>{formatDuration(stats.totalDuration)}</strong>
          </span>
        </div>
      )}

      {/* Slow call threshold section */}
      <div
        className="px-3 py-2"
        style={{
          borderTop: '1px solid var(--ctp-surface0)',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div
          className="text-xs font-semibold uppercase tracking-wider mb-2"
          style={{ color: 'var(--ctp-overlay0)' }}
        >
          Slow Call Threshold
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={100}
              max={300000}
              step={500}
              value={slowThresholdMs}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 100) setSlowThreshold(val);
              }}
              className="text-xs font-mono"
              style={{
                width: 72,
                backgroundColor: 'var(--ctp-surface0)',
                border: '1px solid var(--ctp-surface1)',
                borderRadius: 3,
                color: 'var(--ctp-text)',
                padding: '2px 6px',
                outline: 'none',
                height: 22,
              }}
            />
            <span
              className="text-xs"
              style={{ color: 'var(--ctp-overlay0)' }}
            >
              ms
            </span>
          </div>
          <span
            className="text-xs"
            style={{
              color: stats.slowCallIds.length > 0 ? 'var(--ctp-peach)' : 'var(--ctp-overlay0)',
              fontWeight: stats.slowCallIds.length > 0 ? 600 : 400,
            }}
          >
            {stats.slowCallIds.length === 0
              ? 'No slow calls'
              : `${stats.slowCallIds.length} slow call${stats.slowCallIds.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>
    </div>
  );
}
