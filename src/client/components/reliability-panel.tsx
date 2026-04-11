import React, { useEffect, useMemo } from 'react';

import { computeReliability } from '../../shared/reliability.ts';
import type { ToolReliability } from '../../shared/reliability.ts';
import { useSessionStore } from '../store/session-store.ts';
import { CloseIcon } from '../icons/close-icon.tsx';
import { getToolColor, resolveColor } from '../utils/tool-colors.ts';

/** Props for ReliabilityPanel */
export interface ReliabilityPanelProps {
  onClose: () => void;
}

/** Return a Catppuccin color based on a reliability percentage. */
function reliabilityColor(pct: number): string {
  if (pct >= 90) return 'var(--ctp-green)';
  if (pct >= 70) return 'var(--ctp-yellow)';
  return 'var(--ctp-red)';
}

/** Overview metric card displayed in the 4-card grid. */
function MetricCard({
  label,
  value,
  color,
  title,
}: {
  label: string;
  value: string;
  color: string;
  title?: string;
}): React.ReactElement {
  return (
    <div
      style={{
        backgroundColor: 'var(--ctp-surface0)',
        borderRadius: 6,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
      }}
      title={title}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--ctp-overlay0)',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          fontFamily: 'ui-monospace, monospace',
          color,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Single row in the tool reliability table. */
function ToolReliabilityRow({ stat }: { stat: ToolReliability }): React.ReactElement {
  const nameColor = resolveColor(getToolColor(stat.toolName));
  const relColor = reliabilityColor(stat.reliability);

  return (
    <tr>
      <td
        style={{
          padding: '3px 8px 3px 12px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          color: nameColor,
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
        {stat.total}
      </td>
      <td
        style={{
          padding: '3px 8px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          color: 'var(--ctp-green)',
          textAlign: 'right',
        }}
      >
        {stat.success}
      </td>
      <td
        style={{
          padding: '3px 8px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          color: stat.errors > 0 ? 'var(--ctp-red)' : 'var(--ctp-subtext0)',
          textAlign: 'right',
        }}
      >
        {stat.errors}
      </td>
      <td
        style={{
          padding: '3px 8px 3px 8px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          color: relColor,
          fontWeight: 600,
          textAlign: 'right',
        }}
      >
        {stat.reliability.toFixed(0)}%
      </td>
    </tr>
  );
}

/**
 * Flyout panel showing reliability metrics for the current session.
 * Computes stats inline via useMemo — not stored in Zustand.
 */
export function ReliabilityPanel({ onClose }: ReliabilityPanelProps): React.ReactElement {
  const rows = useSessionStore((s) => s.rows);

  const stats = useMemo(() => computeReliability(rows), [rows]);

  const hasData = stats.totalCalls > 0;

  // Agent rows with children for per-agent section
  const agentRows = useMemo(
    () => rows.filter((r) => r.type === 'agent' && r.children.length > 0),
    [rows],
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const overallColor = reliabilityColor(stats.overallReliability);
  const recoveryColor = reliabilityColor(stats.recoveryRate);

  return (
    <div
      className="absolute right-0 top-8 z-50 rounded overflow-hidden shadow-xl"
      style={{
        backgroundColor: 'var(--ctp-mantle)',
        border: '1px solid var(--ctp-surface0)',
        width: 380,
        maxHeight: 520,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          borderBottom: '1px solid var(--ctp-surface0)',
          position: 'sticky',
          top: 0,
          backgroundColor: 'var(--ctp-mantle)',
          zIndex: 1,
        }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{
            color: 'var(--ctp-overlay0)',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          Session Reliability
        </span>
        <button type="button" onClick={onClose} style={{ color: 'var(--ctp-overlay0)' }}>
          <CloseIcon size={14} />
        </button>
      </div>

      {!hasData ? (
        <div
          className="px-3 py-4 text-xs text-center"
          style={{
            color: 'var(--ctp-overlay0)',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          No data
        </div>
      ) : (
        <>
          {/* Overview cards — 4 in a row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 6,
              padding: '10px 12px',
              borderBottom: '1px solid var(--ctp-surface0)',
            }}
          >
            <MetricCard
              label="Reliability"
              value={`${stats.overallReliability.toFixed(0)}%`}
              color={overallColor}
              title={`${stats.successCount} successful / ${stats.totalCalls} total calls`}
            />
            <MetricCard
              label="Err / 10"
              value={stats.errorDensity.toFixed(1)}
              color={
                stats.errorDensity === 0
                  ? 'var(--ctp-green)'
                  : stats.errorDensity < 2
                  ? 'var(--ctp-yellow)'
                  : 'var(--ctp-red)'
              }
              title={`${stats.errorCount} errors across ${stats.totalCalls} calls`}
            />
            <MetricCard
              label="Recovery"
              value={
                stats.recoveryAttempts === 0
                  ? '—'
                  : `${stats.recoveryRate.toFixed(0)}%`
              }
              color={stats.recoveryAttempts === 0 ? 'var(--ctp-overlay0)' : recoveryColor}
              title={
                stats.recoveryAttempts === 0
                  ? 'No retries detected'
                  : `${stats.recoverySuccesses} of ${stats.recoveryAttempts} retries succeeded`
              }
            />
            <MetricCard
              label="Err→Fix"
              value={stats.avgErrorsBeforeFix === 0 ? '—' : stats.avgErrorsBeforeFix.toFixed(1)}
              color={
                stats.avgErrorsBeforeFix === 0
                  ? 'var(--ctp-overlay0)'
                  : stats.avgErrorsBeforeFix < 2
                  ? 'var(--ctp-yellow)'
                  : 'var(--ctp-red)'
              }
              title="Average errors per file before getting it right"
            />
          </div>

          {/* Tool reliability table */}
          {stats.toolReliability.length > 0 && (
            <div>
              <div
                style={{
                  padding: '6px 12px 4px',
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--ctp-overlay0)',
                  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                  borderBottom: '1px solid var(--ctp-surface0)',
                }}
              >
                Tool Breakdown
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--ctp-surface0)' }}>
                      {(['Tool', 'Total', 'OK', 'Err', 'Reliability'] as const).map((col) => (
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
                    {stats.toolReliability.map((stat) => (
                      <ToolReliabilityRow key={stat.toolName} stat={stat} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Per-agent reliability */}
          {agentRows.length > 0 && (
            <div style={{ borderTop: '1px solid var(--ctp-surface0)' }}>
              <div
                style={{
                  padding: '6px 12px 4px',
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--ctp-overlay0)',
                  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                  borderBottom: '1px solid var(--ctp-surface0)',
                }}
              >
                Agent Breakdown
              </div>
              {agentRows.map((agent) => {
                const completedChildren = agent.children.filter((c) => c.status !== 'running');
                const successChildren = completedChildren.filter((c) => c.status === 'success').length;
                const childTotal = completedChildren.length;
                const childRate = childTotal > 0 ? (successChildren / childTotal) * 100 : 100;
                const agentLabel = agent.agentType ?? agent.toolName;
                return (
                  <div
                    key={agent.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 12px',
                      borderBottom: '1px solid var(--ctp-surface0)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: 'ui-monospace, monospace',
                        color: 'var(--ctp-mauve)',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={agentLabel}
                    >
                      {agentLabel}
                    </span>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: 10,
                      }}
                    >
                      <span style={{ color: 'var(--ctp-subtext0)' }}>{childTotal} calls</span>
                      <span
                        style={{
                          color: reliabilityColor(childRate),
                          fontWeight: 600,
                        }}
                      >
                        {childRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary footer */}
          <div
            className="px-3 py-2 text-xs flex gap-4"
            style={{
              borderTop: '1px solid var(--ctp-surface0)',
              color: 'var(--ctp-subtext0)',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            }}
          >
            <span>
              Total:{' '}
              <strong style={{ color: 'var(--ctp-text)' }}>{stats.totalCalls}</strong>
            </span>
            <span>
              OK:{' '}
              <strong style={{ color: 'var(--ctp-green)' }}>{stats.successCount}</strong>
            </span>
            {stats.errorCount > 0 && (
              <span>
                Err:{' '}
                <strong style={{ color: 'var(--ctp-red)' }}>{stats.errorCount}</strong>
              </span>
            )}
            {stats.failureCount > 0 && (
              <span>
                Crash:{' '}
                <strong style={{ color: 'var(--ctp-peach)' }}>{stats.failureCount}</strong>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
