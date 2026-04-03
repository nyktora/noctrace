import React from 'react';

import { useSessionStore } from '../store/session-store.ts';
import { HealthBadge } from './health-badge.tsx';
import { FilterIcon } from '../icons/filter-icon.tsx';
import { WaterfallIcon } from '../icons/waterfall-icon.tsx';
import { WarningIcon } from '../icons/warning-icon.tsx';
import { formatTokens, formatDuration } from '../utils/tool-colors.ts';

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

  const agentCount = rows.filter((r) => r.type === 'agent').length;

  const totalTokens = rows.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);

  const sessionDuration = rows.length > 0
    ? Math.max(...rows.map((r) => r.endTime ?? r.startTime)) - Math.min(...rows.map((r) => r.startTime))
    : null;

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
          placeholder="Filter (tool name, label, error, agent…)"
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

      {/* Compact stats pill */}
      {rows.length > 0 && (
        <div
          className="flex items-center shrink-0"
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

          {/* Health grade badge — 20x20 compact circle */}
          {health && <HealthBadge grade={health.grade} score={health.score} size={20} />}

          {/* Warning icon */}
          <WarningIcon size={12} color="var(--ctp-overlay0)" />

          {/* Token count */}
          <span
            className="font-mono"
            style={{ color: 'var(--ctp-subtext0)' }}
            title={`Total tokens: ${totalTokens}`}
          >
            {formatTokens(totalTokens)}
          </span>

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
        </div>
      )}
    </div>
  );
}
