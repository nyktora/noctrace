import React from 'react';

import { useSessionStore } from '../store/session-store.ts';
import { HealthBadge } from './health-badge.tsx';
import { FilterIcon } from '../icons/filter-icon.tsx';
import { WaterfallIcon } from '../icons/waterfall-icon.tsx';
import { formatTokens } from '../utils/tool-colors.ts';

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

  const totalTokens = rows.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);

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

      {/* Token count */}
      {totalTokens > 0 && (
        <div
          className="text-xs font-mono shrink-0"
          style={{ color: 'var(--ctp-subtext0)' }}
          title={`Total tokens: ${totalTokens}`}
        >
          {formatTokens(totalTokens)} tok
        </div>
      )}

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

      {/* Health badge */}
      {health && (
        <div className="shrink-0 relative">
          <HealthBadge grade={health.grade} score={health.score} />
        </div>
      )}
    </div>
  );
}
