import React, { useMemo } from 'react';

import type { WaterfallRow as WaterfallRowData } from '../../shared/types.ts';
import { ChevronIcon } from '../icons/chevron-icon.tsx';
import { RepeatIcon } from '../icons/repeat-icon.tsx';

/** Highlights filter matches in text with a colored span */
function highlightMatch(text: string, filter: string): React.ReactNode {
  if (!filter || filter.length < 2) return text;
  const lower = filter.toLowerCase();
  // Skip special keyword filters
  if (lower === 'error' || lower === 'agent' || lower === 'running') return text;
  const idx = text.toLowerCase().indexOf(lower);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ backgroundColor: 'var(--ctp-yellow)', color: 'var(--ctp-base)', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + filter.length)}
      </span>
      {text.slice(idx + filter.length)}
    </>
  );
}
import {
  formatDuration,
  formatTokens,
  getContextHeatColor,
  getToolColor,
  rowMatchesFilter,
} from '../utils/tool-colors.ts';

/** Column widths in pixels */
export const COL_NUM = 36;
export const COL_NAME = 200;
export const COL_TYPE = 56;
export const COL_TIME = 52;
export const COL_TOKENS = 68;
export const COL_CTX = 36;

/** Row height in pixels */
export const ROW_HEIGHT = 36;
export const AGENT_ROW_HEIGHT = 36;

/** Props for WaterfallRowComponent */
export interface WaterfallRowProps {
  row: WaterfallRowData;
  rowIndex: number | null;
  sessionStart: number;
  totalDuration: number;
  isSelected: boolean;
  isExpanded: boolean;
  filterText: string;
  waterfallWidth: number;
  zoomLevel: number;
  panOffset: number;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}

/** Minimum bar width as a fraction */
const MIN_BAR_FRACTION = 0.004;

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
  filterText,
  waterfallWidth,
  zoomLevel,
  panOffset,
  onSelect,
  onToggle,
}: WaterfallRowProps): React.ReactElement {
  const isAgent = row.type === 'agent';
  const indent = row.parentAgentId ? 24 : 0;
  const toolColor = getToolColor(row.toolName, row.status);
  const heatColor = getContextHeatColor(row.contextFillPercent);
  const isDegraded = row.contextFillPercent >= 80;
  const matched = rowMatchesFilter(row, filterText);

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
  const totalTokens = row.inputTokens + row.outputTokens;

  // Row background — selected rows get a bright highlight
  let rowBg = 'transparent';
  if (isSelected) rowBg = 'var(--ctp-surface2)';
  else if (isDegraded) rowBg = 'rgba(243,139,168,0.08)';

  const typeShort = getTypeShort(row.toolName);

  return (
    <div
      role="row"
      aria-selected={isSelected}
      onClick={() => onSelect(row.id)}
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
          (e.currentTarget as HTMLDivElement).style.backgroundColor = isDegraded
            ? 'rgba(243,139,168,0.12)'
            : 'var(--ctp-surface0)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = isDegraded
            ? 'rgba(243,139,168,0.08)'
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
          paddingRight: 6,
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
        <span
          className="font-mono truncate text-xs"
          style={{
            color: isAgent ? 'var(--ctp-text)' : 'var(--ctp-subtext0)',
            fontWeight: isAgent ? 600 : 400,
            fontSize: 11,
          }}
          title={row.label}
        >
          {highlightMatch(row.label, filterText)}
        </span>
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
          className="font-mono text-xs"
          style={{ color: toolColor, fontSize: 10 }}
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
          borderRight: '1px solid rgba(69,71,90,0.5)',
        }}
      >
        <span
          className="font-mono text-xs"
          style={{ color: 'var(--ctp-subtext0)', fontSize: 10 }}
        >
          {formatDuration(row.duration)}
        </span>
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
            color: totalTokens > 5000 ? 'var(--ctp-yellow)' : 'var(--ctp-subtext0)',
            fontSize: 10,
          }}
          title={`${row.inputTokens} in / ${row.outputTokens} out`}
        >
          {formatTokens(totalTokens)}
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
            backgroundColor: toolColor,
            borderRadius: 2,
            opacity: row.status === 'running' ? undefined : 0.85,
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
  if (name.startsWith('mcp__')) {
    // "mcp__claude-in-chrome__computer" → "MCP"
    return 'MCP';
  }
  return toolName.slice(0, 5);
}
