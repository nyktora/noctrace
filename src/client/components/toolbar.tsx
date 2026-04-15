import React, { useMemo, useCallback, useState } from 'react';

import { useSessionStore } from '../store/session-store.ts';
import { useCapabilities } from '../hooks/use-capabilities.ts';
import { NavToggle } from './nav-toggle.tsx';
import { HealthBadge } from './health-badge.tsx';
import { SessionStats } from './session-stats.tsx';
import { ContextStartup } from './context-startup.tsx';
import { ReliabilityPanel } from './reliability-panel.tsx';
import { FilterIcon } from '../icons/filter-icon.tsx';
import { WaterfallIcon } from '../icons/waterfall-icon.tsx';
import { WarningIcon } from '../icons/warning-icon.tsx';
import { DriftIcon } from '../icons/drift-icon.tsx';
import { TipIcon } from '../icons/tip-icon.tsx';
import { ShieldIcon } from '../icons/shield-icon.tsx';
import { StatsIcon } from '../icons/stats-icon.tsx';
import { ContextIcon } from '../icons/context-icon.tsx';
import { ReliabilityIcon } from '../icons/reliability-icon.tsx';
import { formatTokens, formatDuration } from '../utils/tool-colors.ts';
import { formatCost } from '../../shared/token-cost.ts';
import { computeReliability } from '../../shared/reliability.ts';

/**
 * Top toolbar with logo, filter bar, auto-scroll toggle, and health badge.
 */
export function Toolbar(): React.ReactElement {
  const filterText = useSessionStore((s) => s.filterText);
  const setFilter = useSessionStore((s) => s.setFilter);
  const autoScroll = useSessionStore((s) => s.autoScroll);
  const setAutoScroll = useSessionStore((s) => s.setAutoScroll);
  const health = useSessionStore((s) => s.health);
  const rows = useSessionStore((s) => s.rows);
  const drift = useSessionStore((s) => s.drift);
  const showSessionStats = useSessionStore((s) => s.showSessionStats);
  const toggleSessionStats = useSessionStore((s) => s.toggleSessionStats);
  const showReliability = useSessionStore((s) => s.showReliability);
  const toggleReliability = useSessionStore((s) => s.toggleReliability);
  const instructionsLoaded = useSessionStore((s) => s.instructionsLoaded);

  const [showContextStartup, setShowContextStartup] = useState(false);

  const handleCloseStats = useCallback(() => {
    if (showSessionStats) toggleSessionStats();
  }, [showSessionStats, toggleSessionStats]);

  const handleCloseReliability = useCallback(() => {
    if (showReliability) toggleReliability();
  }, [showReliability, toggleReliability]);

  const driftColor = !drift ? 'var(--ctp-overlay0)'
    : drift.driftFactor >= 5 ? 'var(--ctp-red)'
    : drift.driftFactor >= 3 ? 'var(--ctp-peach)'
    : drift.driftFactor >= 2 ? 'var(--ctp-yellow)'
    : 'var(--ctp-green)';

  const { agentCount, totalTokens, sessionDuration, tipCount, securityTipCount, totalCost } = useMemo(() => {
    if (rows.length === 0) return { agentCount: 0, totalTokens: 0, sessionDuration: null as number | null, tipCount: 0, securityTipCount: 0, totalCost: null as number | null };
    let agents = 0, tokens = 0, tips = 0, securityTips = 0, cost = 0, hasCost = false, minStart = Infinity, maxEnd = -Infinity;
    for (const r of rows) {
      if (r.type === 'agent') agents++;
      tokens += r.tokenDelta + r.outputTokens;
      if (r.estimatedCost !== null) { cost += r.estimatedCost; hasCost = true; }
      for (const t of r.tips) {
        tips++;
        if (t.category === 'security') securityTips++;
      }
      const end = r.endTime ?? r.startTime;
      if (end > maxEnd) maxEnd = end;
      if (r.startTime < minStart) minStart = r.startTime;
    }
    return { agentCount: agents, totalTokens: tokens, sessionDuration: maxEnd - minStart, tipCount: tips, securityTipCount: securityTips, totalCost: hasCost ? cost : null };
  }, [rows]);

  const capabilities = useCapabilities();

  const reliability = useMemo(() => computeReliability(rows), [rows]);
  const reliabilityColor = reliability.totalCalls === 0
    ? 'var(--ctp-overlay0)'
    : reliability.overallReliability >= 90
    ? 'var(--ctp-green)'
    : reliability.overallReliability >= 70
    ? 'var(--ctp-yellow)'
    : 'var(--ctp-red)';

  return (
    <div
      className="flex items-center gap-3 px-3 shrink-0"
      style={{
        height: 36,
        backgroundColor: 'var(--ctp-mantle)',
        borderBottom: '1px solid var(--ctp-surface0)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-1.5 shrink-0">
        <WaterfallIcon size={14} color="var(--ctp-mauve)" />
        <span
          className="font-bold text-sm"
          style={{
            color: 'var(--ctp-mauve)',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            letterSpacing: '-0.02em',
          }}
        >
          noctrace
        </span>
      </div>

      {/* View toggle: Sessions | Patterns */}
      <NavToggle />

      {/* Filter input */}
      <div className="flex-1 flex items-center relative min-w-0">
        <div
          className="absolute left-2 pointer-events-none"
          style={{ color: 'var(--ctp-overlay0)' }}
        >
          <FilterIcon size={12} />
        </div>
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter (type:bash >5s tokens:>1k error)"
          className="w-full text-xs font-mono pl-7 pr-3 py-1 rounded"
          style={{
            backgroundColor: 'var(--ctp-surface0)',
            border: '1px solid var(--ctp-surface1)',
            color: 'var(--ctp-text)',
            outline: 'none',
            height: 22,
          }}
          spellCheck={false}
        />
        {filterText && (
          <button
            type="button"
            onClick={() => setFilter('')}
            className="absolute right-2 text-xs"
            style={{ color: 'var(--ctp-overlay0)' }}
          >
            ×
          </button>
        )}
      </div>

      {/* Auto-scroll toggle */}
      <button
        type="button"
        onClick={() => setAutoScroll(!autoScroll)}
        className="text-xs px-2 py-0.5 rounded shrink-0 transition-colors"
        style={{
          backgroundColor: autoScroll ? 'var(--ctp-surface1)' : 'transparent',
          border: '1px solid var(--ctp-surface1)',
          color: autoScroll ? 'var(--ctp-text)' : 'var(--ctp-overlay0)',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          cursor: 'pointer',
        }}
        title="Toggle auto-scroll to follow new rows"
      >
        Auto
      </button>

      {/* Compact stats pill — wrapped in relative container for flyout positioning */}
      {rows.length > 0 && (
        <div className="relative shrink-0">
        <div
          className="flex items-center"
          style={{
            backgroundColor: 'var(--ctp-crust)',
            border: '1px solid var(--ctp-surface0)',
            borderRadius: 9999,
            padding: '2px 10px',
            gap: 8,
            fontSize: 10,
          }}
        >
          {/* Agent count — grid icon + number */}
          {agentCount > 0 && (
            <div className="flex items-center" style={{ gap: 4 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="10" height="8" rx="2" stroke="var(--ctp-mauve)" strokeWidth="1.5" />
                <circle cx="6" cy="7" r="1" fill="var(--ctp-mauve)" />
                <circle cx="10" cy="7" r="1" fill="var(--ctp-mauve)" />
                <path d="M5 13h6" stroke="var(--ctp-mauve)" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M8 11v2" stroke="var(--ctp-mauve)" strokeWidth="1.5" />
                <path d="M5 3V1.5M11 3V1.5" stroke="var(--ctp-mauve)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span
                className="font-mono"
                style={{ color: 'var(--ctp-subtext0)', fontWeight: 600, fontSize: 11 }}
              >
                {agentCount}
              </span>
            </div>
          )}

          {/* Health grade badge — only when provider tracks context fill */}
          {capabilities.contextTracking && health && (
            <span data-testid="toolbar-health-pill">
              <HealthBadge grade={health.grade} score={health.score} size={20} />
            </span>
          )}

          {/* Drift indicator — only when provider tracks context */}
          {capabilities.contextTracking && drift && drift.driftFactor >= 1.5 && (
            <div className="flex items-center" style={{ gap: 3 }}>
              <DriftIcon size={12} color={driftColor} />
              <span
                className="font-mono"
                style={{ color: driftColor, fontWeight: 600, fontSize: 11 }}
                title={`Token drift: ${drift.driftFactor}x baseline (${Math.round(drift.baselineTokens / 1000)}k → ${Math.round(drift.currentTokens / 1000)}k per turn)`}
              >
                {drift.driftFactor}x
              </span>
            </div>
          )}

          {/* Security tip count badge */}
          {securityTipCount > 0 && (
            <div
              className="flex items-center"
              style={{ gap: 3 }}
              title={`${securityTipCount} security tip${securityTipCount === 1 ? '' : 's'} — click a row to see details`}
            >
              <ShieldIcon size={12} color="#f38ba8" />
              <span
                className="font-mono"
                style={{ color: '#f38ba8', fontWeight: 600, fontSize: 11 }}
              >
                {securityTipCount}
              </span>
            </div>
          )}

          {/* Efficiency tip count badge */}
          {tipCount - securityTipCount > 0 && (
            <div
              className="flex items-center"
              style={{ gap: 3 }}
              title={`${tipCount - securityTipCount} efficiency tip${tipCount - securityTipCount === 1 ? '' : 's'} — click a row to see details`}
            >
              <TipIcon size={12} color="#f9e2af" />
              <span
                className="font-mono"
                style={{ color: '#f9e2af', fontWeight: 600, fontSize: 11 }}
              >
                {tipCount - securityTipCount}
              </span>
            </div>
          )}

          {/* Warning icon */}
          <WarningIcon size={12} color="var(--ctp-overlay0)" />

          {/* Token count — only when provider has token accounting */}
          {capabilities.tokenAccounting !== 'none' && (
            <span
              className="font-mono"
              style={{ color: 'var(--ctp-subtext0)' }}
              title={`Total tokens consumed: ${totalTokens} (context growth + output)`}
              data-testid="toolbar-token-count"
            >
              {formatTokens(totalTokens)}
            </span>
          )}

          {/* Session duration */}
          {sessionDuration !== null && (
            <span
              className="font-mono"
              style={{ color: 'var(--ctp-subtext0)' }}
              title={`Session duration: ${formatDuration(sessionDuration)}`}
            >
              {formatDuration(sessionDuration)}
            </span>
          )}

          {/* Session total cost — only when provider has token accounting */}
          {capabilities.tokenAccounting !== 'none' && totalCost !== null && (
            <span
              className="font-mono"
              style={{ color: 'var(--ctp-green)', fontWeight: 600 }}
              title="Estimated session cost (based on public Claude API pricing)"
              data-testid="toolbar-cost-pill"
            >
              {formatCost(totalCost)}
            </span>
          )}

          {/* Stats button */}
          <button
            type="button"
            onClick={toggleSessionStats}
            title="Session latency stats"
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              color: showSessionStats ? 'var(--ctp-blue)' : 'var(--ctp-overlay0)',
            }}
          >
            <StatsIcon size={12} color={showSessionStats ? 'var(--ctp-blue)' : 'var(--ctp-overlay0)'} />
          </button>

          {/* Reliability button */}
          <button
            type="button"
            onClick={toggleReliability}
            title="Session reliability metrics"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              color: showReliability ? reliabilityColor : 'var(--ctp-overlay0)',
            }}
          >
            <ReliabilityIcon size={12} color={showReliability ? reliabilityColor : 'var(--ctp-overlay0)'} />
            {reliability.totalCalls > 0 && (
              <span
                className="font-mono"
                style={{ fontSize: 11, fontWeight: 600, color: showReliability ? reliabilityColor : 'var(--ctp-overlay0)' }}
              >
                {reliability.overallReliability.toFixed(0)}%
              </span>
            )}
          </button>

          {/* Context Startup button — only shown when instruction files were detected */}
          {instructionsLoaded.length > 0 && (
            <button
              type="button"
              onClick={() => { setShowContextStartup((v) => !v); }}
              title={`${instructionsLoaded.length} instruction file${instructionsLoaded.length === 1 ? '' : 's'} loaded at session start`}
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: showContextStartup ? 'var(--ctp-teal)' : 'var(--ctp-overlay0)',
              }}
            >
              <ContextIcon size={12} color={showContextStartup ? 'var(--ctp-teal)' : 'var(--ctp-overlay0)'} />
            </button>
          )}
        </div>

        {/* Session stats flyout panel */}
        {showSessionStats && <SessionStats onClose={handleCloseStats} />}

        {/* Reliability flyout panel */}
        {showReliability && <ReliabilityPanel onClose={handleCloseReliability} />}

        {/* Context Startup flyout panel */}
        {showContextStartup && <ContextStartup onClose={() => setShowContextStartup(false)} />}
        </div>
      )}
    </div>
  );
}
