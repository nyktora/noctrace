import React, { useMemo, useCallback, useState } from 'react';

import { useSessionStore } from '../store/session-store.ts';
import { HealthBadge } from './health-badge.tsx';
import { FilterIcon } from '../icons/filter-icon.tsx';
import { WaterfallIcon } from '../icons/waterfall-icon.tsx';
import { WarningIcon } from '../icons/warning-icon.tsx';
import { DriftIcon } from '../icons/drift-icon.tsx';
import { DriftRateIcon } from '../icons/drift-rate-icon.tsx';
import { DollarIcon } from '../icons/dollar-icon.tsx';
import { ShareIcon } from '../icons/share-icon.tsx';
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
  const drift = useSessionStore((s) => s.drift);
  const cost = useSessionStore((s) => s.cost);
  const selectedProjectSlug = useSessionStore((s) => s.selectedProjectSlug);
  const selectedSessionId = useSessionStore((s) => s.selectedSessionId);

  const [isExporting, setIsExporting] = useState(false);

  /** Download the current session as a self-contained HTML export file. */
  const handleExport = useCallback(async () => {
    if (!selectedProjectSlug || !selectedSessionId || isExporting) return;
    setIsExporting(true);
    try {
      const url = `/api/session/${encodeURIComponent(selectedProjectSlug)}/${encodeURIComponent(selectedSessionId)}/export`;
      const res = await fetch(url);
      if (!res.ok) return;
      const html = await res.text();
      const exportDate = new Date().toISOString().slice(0, 10);
      const filename = `noctrace-${selectedSessionId.slice(0, 8)}-${exportDate}.html`;
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } finally {
      setIsExporting(false);
    }
  }, [selectedProjectSlug, selectedSessionId, isExporting]);

  const driftColor = !drift ? 'var(--ctp-overlay0)'
    : drift.driftFactor >= 5 ? 'var(--ctp-red)'
    : drift.driftFactor >= 3 ? 'var(--ctp-peach)'
    : drift.driftFactor >= 2 ? 'var(--ctp-yellow)'
    : 'var(--ctp-green)';

  const { agentCount, totalTokens, sessionDuration } = useMemo(() => {
    if (rows.length === 0) return { agentCount: 0, totalTokens: 0, sessionDuration: null as number | null };
    let agents = 0, tokens = 0, minStart = Infinity, maxEnd = -Infinity;
    for (const r of rows) {
      if (r.type === 'agent') agents++;
      tokens += r.inputTokens + r.outputTokens;
      const end = r.endTime ?? r.startTime;
      if (end > maxEnd) maxEnd = end;
      if (r.startTime < minStart) minStart = r.startTime;
    }
    return { agentCount: agents, totalTokens: tokens, sessionDuration: maxEnd - minStart };
  }, [rows]);

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

      {/* Share / export session button */}
      {selectedSessionId && (
        <button
          type="button"
          onClick={() => { void handleExport(); }}
          disabled={isExporting}
          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded shrink-0 transition-colors"
          style={{
            backgroundColor: 'transparent',
            border: '1px solid var(--ctp-surface1)',
            color: isExporting ? 'var(--ctp-overlay0)' : 'var(--ctp-subtext0)',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            cursor: isExporting ? 'default' : 'pointer',
          }}
          title="Export session as standalone HTML file"
        >
          <ShareIcon size={11} />
          {isExporting ? 'Exporting…' : 'Export'}
        </button>
      )}

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

          {/* Drift indicator */}
          {drift && drift.driftFactor >= 1.5 && (
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

          {/* Drift rate indicator — only shown when >= 6 turns */}
          {drift && drift.turnCount >= 6 && drift.driftRateLabel !== 'stable' && (
            <div className="flex items-center" style={{ gap: 3 }}>
              <DriftRateIcon label={drift.driftRateLabel} size={12} />
              <span
                className="font-mono"
                style={{
                  color: drift.driftRateLabel === 'critical'
                    ? 'var(--ctp-red)'
                    : drift.driftRateLabel === 'accelerating'
                    ? 'var(--ctp-peach)'
                    : 'var(--ctp-yellow)',
                  fontWeight: 600,
                  fontSize: 11,
                }}
                title={`Drift rate: ${drift.driftRate > 0 ? '+' : ''}${drift.driftRate} tokens/min growth`}
              >
                {drift.driftRateLabel}
              </span>
            </div>
          )}

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

          {/* Cost estimate */}
          {cost != null && (
            <div className="flex items-center" style={{ gap: 3 }}>
              <DollarIcon size={12} color="var(--ctp-green)" />
              <span
                className="font-mono"
                style={{ color: 'var(--ctp-green)', fontWeight: 600, fontSize: 11 }}
                title={`Estimated cost (${cost.model} pricing): input $${cost.inputCost.toFixed(4)} + output $${cost.outputCost.toFixed(4)} + cache write $${cost.cacheWriteCost.toFixed(4)} + cache read $${cost.cacheReadCost.toFixed(4)}`}
              >
                ${cost.totalCost < 0.01 ? cost.totalCost.toFixed(4) : cost.totalCost.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
