import React, { useMemo } from 'react';

import type { WaterfallRow as WaterfallRowData } from '../../shared/types.ts';
import type { ParsedFilter } from '../../shared/filter.ts';
import { rowMatchesFilter } from '../../shared/filter.ts';
import { ChevronIcon } from '../icons/chevron-icon.tsx';
import { RepeatIcon } from '../icons/repeat-icon.tsx';
import { TipIcon } from '../icons/tip-icon.tsx';
import { ShieldIcon } from '../icons/shield-icon.tsx';
import { ClockIcon } from '../icons/clock-icon.tsx';
import { FailureIcon } from '../icons/failure-icon.tsx';
import { ApiErrorIcon } from '../icons/api-error-icon.tsx';
import type { EfficiencyTip, TipSeverity } from '../../shared/types.ts';
import { useSessionStore } from '../store/session-store.ts';
import {
  formatDuration,
  formatTokens,
  getContextHeatColor,
  getToolColor,
  resolveColor,
} from '../utils/tool-colors.ts';

/**
 * Highlights free-text token matches in text with a colored span.
 * Accepts the joined textTokens string from ParsedFilter — never the raw filter string —
 * so structured prefixes like type:bash are never highlighted.
 */
function highlightMatch(text: string, highlightText: string): React.ReactNode {
  if (!highlightText || highlightText.length < 2) return text;
  const lower = highlightText.toLowerCase();
  const idx = text.toLowerCase().indexOf(lower);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ backgroundColor: 'var(--ctp-yellow)', color: 'var(--ctp-base)', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + highlightText.length)}
      </span>
      {text.slice(idx + highlightText.length)}
    </>
  );
}

/** Column widths in pixels */
export const COL_NUM = 30;
export const COL_NAME = 200;
export const COL_TYPE = 48;
export const COL_TIME = 52;
export const COL_TOKENS = 56;
export const COL_CTX = 34;

/** Row height in pixels */
export const ROW_HEIGHT = 28;
export const AGENT_ROW_HEIGHT = 28;

/** Props for WaterfallRowComponent */
export interface WaterfallRowProps {
  row: WaterfallRowData;
  rowIndex: number | null;
  sessionStart: number;
  totalDuration: number;
  isSelected: boolean;
  isExpanded: boolean;
  /** Pre-parsed filter — call parseFilterString once at the parent (Waterfall) level. */
  parsedFilter: ParsedFilter;
  waterfallWidth: number;
  zoomLevel: number;
  panOffset: number;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onFocusNeighbor?: (direction: 'up' | 'down') => void;
}

/** Minimum bar width as a fraction */
const MIN_BAR_FRACTION = 0.004;

/** Returns the icon color for a given tip severity level */
function tipSeverityColor(severity: TipSeverity): string {
  if (severity === 'critical') return '#f38ba8';
  if (severity === 'warning') return '#f9e2af';
  return '#94e2d5';
}

/** Returns the highest severity from a list, falling back to 'info' */
function highestSeverity(severities: TipSeverity[]): TipSeverity {
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('warning')) return 'warning';
  return 'info';
}

/** Returns true when any tip in the list is a security tip */
function hasSecurityTip(tips: EfficiencyTip[]): boolean {
  return tips.some((t) => t.category === 'security');
}

/**
 * Single row in the waterfall timeline.
 * Renders the name, type badge, time, token count, context fill, and the colored bar.
 */
export function WaterfallRowComponent({
  row,
  rowIndex,
  sessionStart,
  totalDuration,
  isSelected,
  isExpanded,
  parsedFilter,
  waterfallWidth,
  zoomLevel,
  panOffset,
  onSelect,
  onToggle,
  onFocusNeighbor,
}: WaterfallRowProps): React.ReactElement {
  const slowThresholdMs = useSessionStore((s) => s.slowThresholdMs);
  const isSlow = row.duration !== null && row.duration > slowThresholdMs;

  const isAgent = row.type === 'agent';
  const isApiError = row.type === 'api-error';
  const indent = row.parentAgentId ? 24 : 0;
  const toolColor = getToolColor(row.toolName, row.status);
  const toolHex = resolveColor(toolColor);
  const heatColor = getContextHeatColor(row.contextFillPercent);
  const isDegraded = row.contextFillPercent >= 80;
  const matched = rowMatchesFilter(row, parsedFilter);

  // Join text tokens for highlighting (never use the raw filter string)
  const highlightText = parsedFilter.textTokens.join(' ');

  // Bar positioning
  const effectiveDuration = totalDuration > 0 ? totalDuration : 1;
  const startFraction = Math.max(0, (row.startTime - sessionStart) / effectiveDuration);
  const now = Date.now();
  const duration = row.duration ?? (row.status === 'running' ? now - row.startTime : null);
  const durationFraction = duration !== null
    ? Math.max(MIN_BAR_FRACTION, duration / effectiveDuration)
    : MIN_BAR_FRACTION;

  const scaledWidth = waterfallWidth * zoomLevel;
  const barLeft = startFraction * scaledWidth + panOffset;
  const barWidth = Math.max(durationFraction * scaledWidth, 2);
  const tokenDelta = row.tokenDelta;

  // Row background — selected rows get a bright highlight; failure rows get red tint
  let rowBg = 'transparent';
  if (isSelected) rowBg = 'var(--ctp-surface2)';
  else if (isApiError) rowBg = 'rgba(243,139,168,0.12)';
  else if (row.isFailure) rowBg = 'rgba(243,139,168,0.10)';
  else if (isDegraded) rowBg = 'rgba(243,139,168,0.08)';

  const typeShort = getTypeShort(row.toolName);

  // Build a human-readable label for screen readers
  const durationLabel = row.duration != null ? `, ${formatDuration(row.duration)}` : '';
  const statusLabel = row.status === 'running' ? ', running' : row.status === 'error' ? ', error' : '';
  const ariaLabel = `${typeShort}: ${row.label}${durationLabel}${statusLabel}`;

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(row.id);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onFocusNeighbor?.('down');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onFocusNeighbor?.('up');
    }
  }

  // API error rows render as a full-width alert banner — they are point-in-time events,
  // not tool calls, so they don't have a meaningful start/end position on the timeline.
  if (isApiError) {
    return (
      <div
        role="row"
        tabIndex={0}
        aria-selected={isSelected}
        aria-label={`API Error: ${row.toolName} — ${row.label}`}
        onClick={() => onSelect(row.id)}
        onKeyDown={handleKeyDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: ROW_HEIGHT,
          backgroundColor: isSelected ? 'rgba(243,139,168,0.22)' : 'rgba(243,139,168,0.12)',
          opacity: matched ? 1 : 0.25,
          cursor: 'pointer',
          transition: 'background-color 80ms',
          borderBottom: '1px solid rgba(243,139,168,0.3)',
          borderTop: '1px solid rgba(243,139,168,0.2)',
          gap: 8,
          paddingLeft: 8,
          paddingRight: 12,
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(243,139,168,0.18)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(243,139,168,0.12)';
          }
        }}
      >
        <ApiErrorIcon size={12} color="var(--ctp-red)" />
        <span
          className="font-mono"
          style={{ color: 'var(--ctp-red)', fontSize: 10, fontWeight: 700, flexShrink: 0 }}
        >
          {row.toolName}
        </span>
        <span
          className="font-mono truncate"
          style={{ color: 'var(--ctp-subtext0)', fontSize: 10, flex: 1 }}
          title={row.label}
        >
          {highlightMatch(row.label, highlightText)}
        </span>
        {/* Full-width red accent stripe at the right edge */}
        <div style={{ width: 3, height: '100%', backgroundColor: 'var(--ctp-red)', opacity: 0.5, flexShrink: 0 }} />
      </div>
    );
  }

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={isSelected}
      aria-label={ariaLabel}
      onClick={() => onSelect(row.id)}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: ROW_HEIGHT,
        backgroundColor: rowBg,
        opacity: matched ? 1 : 0.25,
        cursor: 'pointer',
        transition: 'background-color 80ms',
        borderBottom: '1px solid rgba(69,71,90,0.4)',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLDivElement).style.backgroundColor =
            row.isFailure ? 'rgba(243,139,168,0.16)'
            : isDegraded ? 'rgba(243,139,168,0.12)'
            : 'var(--ctp-surface0)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLDivElement).style.backgroundColor =
            row.isFailure ? 'rgba(243,139,168,0.10)'
            : isDegraded ? 'rgba(243,139,168,0.08)'
            : 'transparent';
        }
      }}
    >
      {/* Heat strip — 3px left edge */}
      <div
        style={{
          width: 3,
          backgroundColor: heatColor,
          flexShrink: 0,
          opacity: 0.7,
        }}
      />

      {/* Row number column */}
      <div
        style={{
          width: COL_NUM - 3,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 4,
          borderRight: '1px solid rgba(69,71,90,0.5)',
        }}
      >
        <span
          className="font-mono"
          style={{ color: 'var(--ctp-overlay0)', fontSize: 9 }}
        >
          {rowIndex ?? ''}
        </span>
      </div>

      {/* Name column */}
      <div
        style={{
          width: COL_NAME - 3,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 4 + indent,
          paddingRight: 4,
          overflow: 'hidden',
          borderRight: '1px solid rgba(69,71,90,0.5)',
        }}
      >
        {isAgent && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(row.id); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              marginRight: 4,
              color: 'var(--ctp-overlay0)',
              flexShrink: 0,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              transform: isExpanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 150ms',
            }}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            <ChevronIcon size={12} color="var(--ctp-overlay0)" />
          </button>
        )}
        {row.isFailure && (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', marginRight: 4, flexShrink: 0 }}
            title="Tool execution failure (crash, timeout, or permission denied)"
          >
            <FailureIcon size={11} color="var(--ctp-red)" />
          </span>
        )}
        <span
          className="font-mono truncate text-xs"
          style={{
            color: row.isFailure ? 'var(--ctp-red)' : isAgent ? 'var(--ctp-text)' : 'var(--ctp-subtext0)',
            fontWeight: isAgent ? 600 : 400,
            fontSize: 11,
          }}
          title={row.label}
        >
          {highlightMatch(row.label, highlightText)}
        </span>
        {isAgent && row.agentType && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              marginLeft: 4,
              flexShrink: 0,
              fontSize: 9,
              fontFamily: 'ui-monospace, monospace',
              fontWeight: 500,
              padding: '1px 4px',
              borderRadius: 3,
              backgroundColor: 'rgba(137,180,250,0.12)',
              color: 'var(--ctp-blue)',
              border: '1px solid rgba(137,180,250,0.25)',
              whiteSpace: 'nowrap',
            }}
            title={`Agent type: ${row.agentType}`}
          >
            {row.agentType}
          </span>
        )}
        {row.tips.length > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              marginLeft: 4,
              flexShrink: 0,
            }}
            title={row.tips[0].title}
          >
            {hasSecurityTip(row.tips) ? (
              <ShieldIcon size={12} color="#f38ba8" />
            ) : (
              <TipIcon
                size={12}
                color={tipSeverityColor(highestSeverity(row.tips.map((t) => t.severity)))}
              />
            )}
          </span>
        )}
      </div>

      {/* Type column */}
      <div
        style={{
          width: COL_TYPE,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: '1px solid rgba(69,71,90,0.5)',
        }}
      >
        <span
          className="font-mono"
          style={{
            color: toolColor,
            fontSize: 9,
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: 2,
            backgroundColor: toolHex + '18',
          }}
        >
          {typeShort}
        </span>
      </div>

      {/* Time column */}
      <div
        style={{
          width: COL_TIME,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 6,
          gap: 3,
          borderRight: '1px solid rgba(69,71,90,0.5)',
        }}
      >
        <span
          className="font-mono text-xs"
          style={{ color: isSlow ? 'var(--ctp-peach)' : 'var(--ctp-subtext0)', fontSize: 10 }}
        >
          {formatDuration(row.duration)}
        </span>
        {isSlow && (
          <span
            title={`Slow call: exceeded ${slowThresholdMs}ms threshold`}
            style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
          >
            <ClockIcon size={9} color="var(--ctp-peach)" />
          </span>
        )}
      </div>

      {/* Tokens column */}
      <div
        style={{
          width: COL_TOKENS,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 6,
          borderRight: '1px solid rgba(69,71,90,0.5)',
        }}
      >
        <span
          className="font-mono text-xs"
          style={{
            color: isDegraded ? 'var(--ctp-yellow)' : 'var(--ctp-subtext0)',
            fontSize: 10,
            fontWeight: isDegraded ? 600 : 400,
          }}
          title={`${row.tokenDelta} tokens added to context`}
        >
          {tokenDelta > 0 ? formatTokens(tokenDelta) : '—'}
        </span>
      </div>

      {/* Context % column */}
      <div
        className="hidden-mobile"
        style={{
          width: COL_CTX,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 4,
          borderRight: '1px solid rgba(69,71,90,0.5)',
        }}
      >
        <span
          className="font-mono text-xs"
          style={{
            color: heatColor,
            fontSize: 10,
            fontWeight: isDegraded ? 700 : 400,
          }}
        >
          {row.contextFillPercent > 0 ? `${Math.min(row.contextFillPercent, 100).toFixed(0)}%` : ''}
        </span>
      </div>

      {/* Waterfall bar column */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: barLeft,
            top: '50%',
            transform: 'translateY(-50%)',
            width: barWidth,
            height: isAgent ? 12 : 8,
            background: isDegraded
              ? `linear-gradient(90deg, ${toolHex}66, #f38ba888)`
              : toolHex + '77',
            borderRadius: 2,
          }}
        >
          {row.status === 'running' && (
            <div
              className="running-pulse"
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 6,
                borderRadius: '0 2px 2px 0',
                backgroundColor: 'white',
                opacity: 0.6,
              }}
            />
          )}
        </div>

        {row.isReread && (
          <div
            style={{
              position: 'absolute',
              left: barLeft + barWidth + 2,
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          >
            <RepeatIcon size={10} color={toolColor} />
          </div>
        )}
      </div>
    </div>
  );
}

function getTypeShort(toolName: string): string {
  const name = toolName.toLowerCase();
  if (name === 'read' || name === 'readfile') return 'Read';
  if (name === 'write' || name === 'writefile') return 'Write';
  if (name === 'edit' || name === 'multiedit') return 'Edit';
  if (name === 'bash' || name === 'execute') return 'Bash';
  if (name === 'task' || name === 'agent' || name === 'dispatch_agent') return 'Task';
  if (name === 'grep' || name === 'glob' || name === 'search') return 'Grep';
  // API error classes (from classifyStopFailure)
  if (name === 'rate limit') return 'RateL';
  if (name === 'billing error') return 'Bill';
  if (name === 'auth error') return 'Auth';
  if (name === 'overloaded') return 'Load';
  if (name === 'server error') return 'Srv';
  if (name.startsWith('mcp__')) {
    // "mcp__claude-in-chrome__computer" → "MCP"
    return 'MCP';
  }
  return toolName.slice(0, 5);
}
