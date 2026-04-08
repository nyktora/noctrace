import React, { useEffect } from 'react';

import type { ContextHealth, DriftAnalysis, HealthGrade, HealthSignal } from '../../shared/types.ts';
import { useSessionStore } from '../store/session-store.ts';
import { CloseIcon } from '../icons/close-icon.tsx';
import { DriftRateIcon } from '../icons/drift-rate-icon.tsx';

/** Props for HealthBreakdown */
export interface HealthBreakdownProps {
  onClose: () => void;
}

const GRADE_COLORS: Record<HealthGrade, string> = {
  A: '#a6e3a1',
  B: '#94e2d5',
  C: '#f9e2af',
  D: '#fab387',
  F: '#f38ba8',
};

/** Single signal row in the breakdown panel */
function SignalRow({ signal }: { signal: HealthSignal }): React.ReactElement {
  const color = GRADE_COLORS[signal.grade];
  const pct = Math.round(signal.value * 100);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
      <div
        className="shrink-0"
        style={{ width: 90, color: 'var(--ctp-subtext0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
      >
        {signal.name}
      </div>
      <div
        className="flex-1 rounded-sm overflow-hidden"
        style={{ height: 4, backgroundColor: 'var(--ctp-surface1)' }}
      >
        <div
          style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 2 }}
        />
      </div>
      <div style={{ width: 26, textAlign: 'right', color, fontWeight: 700 }}>{signal.grade}</div>
      <div style={{ width: 28, textAlign: 'right', color: 'var(--ctp-overlay0)' }}>
        {Math.round(signal.weight * 100)}%
      </div>
    </div>
  );
}

interface Recommendation {
  severity: 'critical' | 'warning' | 'info';
  text: string;
}

/** Generate actionable recommendations from health signals and drift rate */
function getRecommendations(health: ContextHealth, drift: DriftAnalysis | null): Recommendation[] {
  const recs: Recommendation[] = [];

  // Context fill — progressive recommendations (compact early, not late!)
  if (health.fillPercent >= 95) {
    recs.push({
      severity: 'critical',
      text: 'Context is saturated. /compact at this point recovers very little — the summary itself fills most of the window. Use /clear and re-state your goal, or delegate remaining work to subagents.',
    });
  } else if (health.fillPercent >= 80) {
    recs.push({
      severity: 'critical',
      text: 'Run /compact now — you still have room for a useful summary. Use /compact Focus on [current task] to preserve what matters. Every tool call from here fills context fast.',
    });
  } else if (health.fillPercent >= 60) {
    recs.push({
      severity: 'warning',
      text: 'Ideal time to /compact. Manual compaction at 60-75% produces much better summaries than waiting until 90%+. Run /compact at your next natural milestone.',
    });
  } else if (health.fillPercent >= 45) {
    recs.push({
      severity: 'info',
      text: 'Context is healthy but growing. Keep an eye on it — the sweet spot for /compact is 60-75% fill.',
    });
  }

  // Compactions
  if (health.compactionCount >= 3) {
    recs.push({
      severity: 'critical',
      text: `${health.compactionCount} compactions — thrash loop detected. Context refills immediately after each compaction. Use /clear and start a new session, or break your work into smaller independent tasks. Add persistent context to CLAUDE.md so it survives future compactions.`,
    });
  } else if (health.compactionCount >= 2) {
    recs.push({
      severity: 'warning',
      text: `${health.compactionCount} compactions — context has been summarized twice. Re-state key requirements if output quality drops. Consider delegating complex subtasks to subagents.`,
    });
  } else if (health.compactionCount >= 1) {
    recs.push({
      severity: 'info',
      text: 'First compaction occurred. This is normal for long sessions — verify Claude still tracks the task correctly.',
    });
  }

  // Re-reads — sign of context loss
  if (health.rereadRatio >= 0.2) {
    recs.push({
      severity: 'warning',
      text: `${(health.rereadRatio * 100).toFixed(0)}% re-reads detected — Claude is re-reading files it already saw. Offload investigation to subagents to keep main context clean.`,
    });
  }

  // Error acceleration
  if (health.errorAcceleration > 3) {
    recs.push({
      severity: 'warning',
      text: 'Errors accelerating. Press Esc to stop, then /rewind to a working checkpoint. Avoid letting bad approaches accumulate in context.',
    });
  }

  // Tool efficiency
  if (health.toolEfficiency < 0.3 && health.toolEfficiency > 0) {
    recs.push({
      severity: 'warning',
      text: 'Productive output (writes/edits) dropping — Claude may be spinning. Break the remaining work into a smaller, focused sub-task.',
    });
  }

  // Drift rate
  if (drift && drift.turnCount >= 6) {
    if (drift.driftRateLabel === 'critical') {
      recs.push({
        severity: 'critical',
        text: `Token consumption accelerating fast (+${drift.driftRate} tokens/min). Each turn is costing significantly more than the last — rotate the session or /compact before the context window fills.`,
      });
    } else if (drift.driftRateLabel === 'accelerating') {
      recs.push({
        severity: 'warning',
        text: `Token growth rate is high (+${drift.driftRate} tokens/min). Context is inflating rapidly — consider /compact soon to arrest the trend.`,
      });
    } else if (drift.driftRateLabel === 'rising') {
      recs.push({
        severity: 'info',
        text: `Token consumption is slowly rising (+${drift.driftRate} tokens/min). Normal for long sessions — watch for acceleration.`,
      });
    }
  }

  // Overall healthy
  if (recs.length === 0 && health.grade === 'A') {
    recs.push({
      severity: 'info',
      text: 'Session is healthy. No action needed.',
    });
  }

  return recs;
}

const SEVERITY_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  critical: { bg: 'rgba(243,139,168,0.12)', border: '#f38ba8', text: '#f38ba8', icon: '!!' },
  warning: { bg: 'rgba(249,226,175,0.10)', border: '#f9e2af', text: '#f9e2af', icon: '!' },
  info: { bg: 'rgba(166,227,161,0.08)', border: '#a6e3a1', text: '#a6e3a1', icon: '\u2713' },
};

/**
 * Dropdown panel showing per-signal context health breakdown with recommendations.
 */
export function HealthBreakdown({ onClose }: HealthBreakdownProps): React.ReactElement {
  const health = useSessionStore((s) => s.health);
  const drift = useSessionStore((s) => s.drift);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!health) return <></>;

  const recs = getRecommendations(health, drift);
  const showDriftRate = drift !== null && drift.turnCount >= 6;

  return (
    <div
      className="absolute right-0 top-8 z-50 rounded overflow-hidden shadow-xl"
      style={{
        backgroundColor: 'var(--ctp-mantle)',
        border: '1px solid var(--ctp-surface0)',
        width: 320,
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--ctp-surface0)' }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          Context Health
        </span>
        <button type="button" onClick={onClose} style={{ color: 'var(--ctp-overlay0)' }}>
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="py-1">
        {health.signals.map((signal: HealthSignal) => (
          <SignalRow key={signal.name} signal={signal} />
        ))}
      </div>

      <div
        className="px-3 py-2 text-xs flex gap-3"
        style={{ borderTop: '1px solid var(--ctp-surface0)', color: 'var(--ctp-subtext0)' }}
      >
        <span>Context: <strong style={{ color: 'var(--ctp-text)' }}>{Math.min(health.fillPercent, 100).toFixed(0)}%</strong></span>
        <span>Compactions: <strong style={{ color: 'var(--ctp-text)' }}>{health.compactionCount}</strong></span>
        <span>Rereads: <strong style={{ color: 'var(--ctp-text)' }}>{(health.rereadRatio * 100).toFixed(0)}%</strong></span>
      </div>

      {/* Drift rate row */}
      {showDriftRate && drift !== null && (
        <div
          className="px-3 py-2 text-xs flex items-center gap-2"
          style={{ borderTop: '1px solid var(--ctp-surface0)', color: 'var(--ctp-subtext0)' }}
        >
          <DriftRateIcon label={drift.driftRateLabel} size={12} />
          <span>
            Drift rate:{' '}
            <strong
              style={{
                color: drift.driftRateLabel === 'critical'
                  ? 'var(--ctp-red)'
                  : drift.driftRateLabel === 'accelerating'
                  ? 'var(--ctp-peach)'
                  : drift.driftRateLabel === 'rising'
                  ? 'var(--ctp-yellow)'
                  : 'var(--ctp-green)',
              }}
            >
              {drift.driftRateLabel}
            </strong>
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: 'ui-monospace, monospace' }}>
            {drift.driftRate > 0 ? '+' : ''}{drift.driftRate} tok/min
          </span>
        </div>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div style={{ borderTop: '1px solid var(--ctp-surface0)' }}>
          <div
            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            Recommendation
          </div>
          {recs.map((rec, i) => {
            const style = SEVERITY_COLORS[rec.severity];
            return (
              <div
                key={i}
                className="mx-3 mb-2 px-2.5 py-2 rounded text-xs"
                style={{
                  backgroundColor: style.bg,
                  borderLeft: `3px solid ${style.border}`,
                  color: 'var(--ctp-text)',
                  lineHeight: 1.5,
                  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                }}
              >
                <span style={{ color: style.text, fontWeight: 700, marginRight: 6 }}>{style.icon}</span>
                {rec.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
