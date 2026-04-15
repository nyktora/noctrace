import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CompactionBoundary, WaterfallRow } from '../../shared/types.ts';
import { parseFilterString } from '../../shared/filter.ts';
import { useSessionStore } from '../store/session-store.ts';
import { useCapabilities } from '../hooks/use-capabilities.ts';
import { HealthBar } from './health-bar.tsx';
import { WaterfallRowComponent, COL_CTX, COL_NAME, COL_NUM, COL_TIME, COL_TOKENS, COL_TYPE, ROW_HEIGHT } from './waterfall-row.tsx';
import { WarningIcon } from '../icons/warning-icon.tsx';
import { formatDuration } from '../utils/tool-colors.ts';

const HEADER_HEIGHT = 28;
const TIME_TICK_COUNT = 5;

/** Flattened row with visibility context */
interface FlatRow {
  row: WaterfallRow;
  visible: boolean;
  /** If true, this is an inline summary for an agent with no child telemetry */
  isSummary?: boolean;
  /** If true, this row is a sub-agent child — should not get its own row number */
  isChild?: boolean;
  /** Stable row number for top-level rows (excludes children from numbering) */
  rowNumber: number;
}

/** Flatten the row tree respecting expand/collapse state */
function flattenRows(rows: WaterfallRow[], expandedAgents: Set<string>): FlatRow[] {
  const result: FlatRow[] = [];
  let rowNum = 0;

  for (const row of rows) {
    if (row.parentAgentId !== null) continue; // top-level only; children handled below
    rowNum++;
    result.push({ row, visible: true, rowNumber: rowNum });
    if (row.type === 'agent' && expandedAgents.has(row.id)) {
      if (row.children.length > 0) {
        for (const child of row.children) {
          result.push({ row: child, visible: true, isChild: true, rowNumber: 0 });
        }
      } else {
        // Agent with no child telemetry — show inline summary
        result.push({ row, visible: true, isSummary: true, rowNumber: 0 });
      }
    }
  }

  return result;
}

/**
 * Main waterfall timeline component.
 * Renders the column headers, time axis, virtual-scrolled rows, and handles zoom/pan.
 */
export function Waterfall(): React.ReactElement {
  const rows = useSessionStore((s) => s.rows);
  const health = useSessionStore((s) => s.health);
  const compactionBoundaries = useSessionStore((s) => s.compactionBoundaries);
  const expandedAgents = useSessionStore((s) => s.expandedAgents);
  const filterText = useSessionStore((s) => s.filterText);
  // Parse once per filter change so per-row matching is O(1) after parsing
  const parsedFilter = useMemo(() => parseFilterString(filterText), [filterText]);
  const selectedRowId = useSessionStore((s) => s.selectedRowId);
  const selectRow = useSessionStore((s) => s.selectRow);
  const toggleAgent = useSessionStore((s) => s.toggleAgent);
  const zoomLevel = useSessionStore((s) => s.zoomLevel);
  const panOffset = useSessionStore((s) => s.panOffset);
  const setZoom = useSessionStore((s) => s.setZoom);
  const setPan = useSessionStore((s) => s.setPan);
  const autoScroll = useSessionStore((s) => s.autoScroll);
  const setAutoScroll = useSessionStore((s) => s.setAutoScroll);
  const nameColWidth = useSessionStore((s) => s.nameColWidth);
  const setNameColWidth = useSessionStore((s) => s.setNameColWidth);

  const capabilities = useCapabilities();

  const scrollRef = useRef<HTMLDivElement>(null);
  const waterfallColRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [scrollTop, setScrollTop] = useState(0);
  const [waterfallWidth, setWaterfallWidth] = useState(600);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartPan = useRef(0);

  // Name column resize state
  const isResizingName = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(200);

  // Measure viewport and waterfall column widths
  useEffect(() => {
    function measure(): void {
      if (scrollRef.current) setViewportHeight(scrollRef.current.clientHeight);
      if (waterfallColRef.current) setWaterfallWidth(waterfallColRef.current.clientWidth);
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (scrollRef.current) ro.observe(scrollRef.current);
    if (waterfallColRef.current) ro.observe(waterfallColRef.current);
    return () => ro.disconnect();
  }, []);

  // Compute session time bounds
  const { sessionStart, totalDuration } = useMemo(() => {
    if (rows.length === 0) return { sessionStart: 0, totalDuration: 1 };
    const now = Date.now();
    let start = Infinity, end = -Infinity;
    for (const r of rows) {
      if (r.startTime < start) start = r.startTime;
      const e = r.endTime ?? (r.status === 'running' ? now : r.startTime);
      if (e > end) end = e;
    }
    return { sessionStart: start, totalDuration: Math.max(end - start, 1) };
  }, [rows]);

  const flatRows = useMemo(
    () => flattenRows(rows, expandedAgents),
    [rows, expandedAgents],
  );

  const totalRows = flatRows.length;
  const contentHeight = totalRows * ROW_HEIGHT;

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rows.length, autoScroll]);

  // When a row is selected, scroll it into view (just above the detail panel)
  useEffect(() => {
    if (!selectedRowId || !scrollRef.current) return;
    const idx = flatRows.findIndex((fr) => fr.row.id === selectedRowId);
    if (idx < 0) return;
    const rowTop = idx * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const el = scrollRef.current;
    const visibleTop = el.scrollTop;
    const visibleBottom = el.scrollTop + el.clientHeight;
    // If row is below the visible area, scroll so it's at the bottom of the viewport
    if (rowBottom > visibleBottom) {
      el.scrollTop = rowBottom - el.clientHeight;
    // If row is above the visible area, scroll so it's at the top
    } else if (rowTop < visibleTop) {
      el.scrollTop = rowTop;
    }
  }, [selectedRowId, flatRows, viewportHeight]);

  // Virtual scroll window — use the larger of state vs live measurement to avoid gaps
  const overscan = 3;
  const liveHeight = scrollRef.current?.clientHeight ?? viewportHeight;
  const effectiveViewport = Math.max(viewportHeight, liveHeight);
  const baseStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
  const baseEnd = Math.min(totalRows, Math.ceil((scrollTop + effectiveViewport) / ROW_HEIGHT) + overscan);
  // Always extend to the end when near the bottom to avoid a gap
  const nearBottom = baseEnd >= totalRows - overscan;
  const endIndex = nearBottom ? totalRows : baseEnd;
  const startIndex = nearBottom ? Math.max(0, totalRows - (baseEnd - baseStart) - overscan) : baseStart;
  const visibleRows = flatRows.slice(startIndex, endIndex);
  const topSpacer = startIndex * ROW_HEIGHT;
  const bottomSpacer = (totalRows - endIndex) * ROW_HEIGHT;

  // Time ticks
  const scaledWidth = waterfallWidth * zoomLevel;
  const timeTicks = useMemo(() => {
    const ticks: Array<{ label: string; xFraction: number }> = [];
    for (let i = 0; i <= TIME_TICK_COUNT; i++) {
      const fraction = i / TIME_TICK_COUNT;
      const ms = fraction * totalDuration;
      ticks.push({ label: formatDuration(ms), xFraction: fraction });
    }
    return ticks;
  }, [totalDuration]);

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const rect = waterfallColRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left - panOffset;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nextZoom = Math.max(1, Math.min(50, zoomLevel * factor));
      // Keep mouse position stationary
      const nextPan = panOffset - mouseX * (nextZoom - zoomLevel);
      const maxPan = 0;
      const minPan = -(waterfallWidth * nextZoom - waterfallWidth);
      setZoom(nextZoom);
      setPan(Math.max(minPan, Math.min(maxPan, nextPan)));
    },
    [zoomLevel, panOffset, waterfallWidth, setZoom, setPan],
  );

  // Mouse drag pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      isDragging.current = true;
      dragStartX.current = e.clientX;
      dragStartPan.current = panOffset;
      e.preventDefault();
    },
    [panOffset],
  );

  useEffect(() => {
    function handleMouseMove(e: MouseEvent): void {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStartX.current;
      const maxPan = 0;
      const minPan = -(waterfallWidth * zoomLevel - waterfallWidth);
      setPan(Math.max(minPan, Math.min(maxPan, dragStartPan.current + dx)));
    }
    function handleMouseUp(): void {
      isDragging.current = false;
    }
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [zoomLevel, waterfallWidth, setPan]);

  /** Start resizing the Name column */
  const handleNameResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingName.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = nameColWidth;

    function handleMove(ev: MouseEvent): void {
      if (!isResizingName.current) return;
      const delta = ev.clientX - resizeStartX.current;
      setNameColWidth(resizeStartWidth.current + delta);
    }
    function handleUp(): void {
      isResizingName.current = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    }
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [nameColWidth, setNameColWidth]);

  if (rows.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-xs"
        style={{ color: 'var(--ctp-overlay0)' }}
      >
        <span style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
          Select a session to view the waterfall
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--ctp-base)' }}>
      {/* Health bar — only when provider tracks context fill */}
      {capabilities.contextTracking && health && (
        <HealthBar fillPercent={health.fillPercent} grade={health.grade} />
      )}

      {/* Column headers */}
      <div
        className="flex shrink-0 items-stretch text-xs select-none"
        style={{
          height: HEADER_HEIGHT,
          backgroundColor: 'var(--ctp-crust)',
          borderBottom: '1px solid var(--ctp-surface0)',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          color: 'var(--ctp-overlay0)',
        }}
      >
        <div style={{ width: COL_NUM, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, borderRight: '1px solid var(--ctp-surface0)' }}>
          #
        </div>
        <div style={{ width: nameColWidth, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: 8, borderRight: '1px solid var(--ctp-surface0)', position: 'relative' }}>
          Name
          {/* Resize handle */}
          <div
            onMouseDown={handleNameResizeDown}
            style={{
              position: 'absolute',
              right: -2,
              top: 0,
              bottom: 0,
              width: 5,
              cursor: 'col-resize',
              zIndex: 1,
            }}
          />
        </div>
        <div style={{ width: COL_TYPE, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--ctp-surface0)' }}>
          Type
        </div>
        <div style={{ width: COL_TIME, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, borderRight: '1px solid var(--ctp-surface0)' }}>
          Dur.
        </div>
        <div style={{ width: COL_TOKENS, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, borderRight: '1px solid var(--ctp-surface0)' }}>
          Δ Tok
        </div>
        {/* Ctx % column header — only when provider tracks context */}
        {capabilities.contextTracking && (
          <div
            className="hidden-mobile"
            style={{ width: COL_CTX, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--ctp-surface0)' }}
            title="Context fill % at execution"
          >
            <WarningIcon size={12} color="var(--ctp-overlay0)" />
          </div>
        )}
        {/* Waterfall time axis header */}
        <div
          ref={waterfallColRef}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: zoomLevel > 1 ? 'grab' : 'default' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
        >
          {timeTicks.map(({ label, xFraction }) => {
            const x = xFraction * scaledWidth + panOffset;
            if (x < -40 || x > waterfallWidth + 40) return null;
            return (
              <div
                key={label}
                style={{
                  position: 'absolute',
                  left: x,
                  top: 0,
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translateX(-50%)',
                  pointerEvents: 'none',
                }}
              >
                <span style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable rows */}
      <div
        ref={scrollRef}
        role="grid"
        aria-label="Waterfall timeline"
        aria-rowcount={flatRows.length}
        className="flex-1 overflow-auto"
        onScroll={(e) => {
          const el = e.target as HTMLDivElement;
          setScrollTop(el.scrollTop);
          // Auto-enable/disable auto-scroll based on whether user is near the bottom
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < ROW_HEIGHT * 2;
          if (nearBottom !== autoScroll) setAutoScroll(nearBottom);
        }}
        style={{ position: 'relative', backgroundColor: 'var(--ctp-crust)' }}
      >
        {/* Grid lines overlay */}
        <GridLines
          waterfallWidth={waterfallWidth}
          scaledWidth={scaledWidth}
          panOffset={panOffset}
          totalHeight={contentHeight}
          totalDuration={totalDuration}
          compactionBoundaries={compactionBoundaries}
          sessionStart={sessionStart}
          nameColWidth={nameColWidth}
          showCtxColumn={capabilities.contextTracking}
        />

        <div style={{ height: topSpacer }} />

        {visibleRows.map(({ row, isSummary, isChild, rowNumber }, visibleIdx) => {
          // Absolute index within flatRows for focus navigation
          const flatIdx = startIndex + visibleIdx;

          function focusNeighbor(direction: 'up' | 'down'): void {
            const targetFlatIdx = direction === 'up' ? flatIdx - 1 : flatIdx + 1;
            if (targetFlatIdx < 0 || targetFlatIdx >= flatRows.length) return;
            const targetRow = flatRows[targetFlatIdx];
            if (!targetRow) return;
            // Select in store so the row is scrolled into view, then focus the element
            selectRow(targetRow.row.id);
            // Use requestAnimationFrame to wait for the scroll/render to settle
            requestAnimationFrame(() => {
              const grid = scrollRef.current;
              if (!grid) return;
              const rowEls = grid.querySelectorAll<HTMLElement>('[role="row"]');
              // Find the rendered element that corresponds to the target flat index.
              // After virtual scroll re-render the target may be at a different rendered position.
              const newVisibleStart = grid.querySelectorAll<HTMLElement>('[role="row"]').length > 0
                ? startIndex
                : 0;
              const renderedIdx = targetFlatIdx - newVisibleStart;
              const el = rowEls[renderedIdx];
              el?.focus();
            });
          }

          return isSummary ? (
            <AgentSummaryRow
              key={`${row.id}-summary`}
              row={row}
              onSelect={selectRow}
              onFocusNeighbor={focusNeighbor}
            />
          ) : (
            <WaterfallRowComponent
              key={isChild ? `child-${row.id}` : row.id}
              row={row}
              rowIndex={isChild ? null : rowNumber}
              sessionStart={sessionStart}
              totalDuration={totalDuration}
              isSelected={row.id === selectedRowId}
              isExpanded={expandedAgents.has(row.id)}
              parsedFilter={parsedFilter}
              waterfallWidth={waterfallWidth}
              zoomLevel={zoomLevel}
              panOffset={panOffset}
              nameColWidth={nameColWidth}
              onSelect={selectRow}
              onToggle={toggleAgent}
              onFocusNeighbor={focusNeighbor}
            />
          );
        })}

        <div style={{ height: Math.max(0, (totalRows - endIndex) * ROW_HEIGHT) }} />
      </div>
    </div>
  );
}

interface AgentSummaryRowProps {
  row: WaterfallRow;
  onSelect: (id: string) => void;
  onFocusNeighbor?: (direction: 'up' | 'down') => void;
}

/** Inline summary shown when an agent has no child telemetry */
function AgentSummaryRow({ row, onSelect, onFocusNeighbor }: AgentSummaryRowProps): React.ReactElement {
  const agentType = typeof row.input['subagent_type'] === 'string'
    ? row.input['subagent_type'] as string : null;

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

  return (
    <div
      role="row"
      tabIndex={0}
      aria-label={`Agent summary: ${row.label}, ran in separate context`}
      onClick={() => onSelect(row.id)}
      onKeyDown={handleKeyDown}
      style={{
        height: ROW_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 44,
        paddingRight: 12,
        backgroundColor: 'var(--ctp-mantle)',
        borderBottom: '1px solid rgba(69,71,90,0.4)',
        cursor: 'pointer',
        gap: 8,
        overflow: 'hidden',
      }}
    >
      <span className="text-xs" style={{ color: 'var(--ctp-overlay0)', fontStyle: 'italic', fontSize: 10 }}>
        Ran in separate context
      </span>
      {agentType && (
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ color: 'var(--ctp-overlay1)', backgroundColor: 'var(--ctp-surface0)', fontSize: 9 }}
        >
          {agentType}
        </span>
      )}
      <span className="text-xs" style={{ color: 'var(--ctp-overlay0)', fontSize: 10 }}>
        — click row above to view output
      </span>
    </div>
  );
}

interface GridLinesProps {
  waterfallWidth: number;
  scaledWidth: number;
  panOffset: number;
  totalHeight: number;
  totalDuration: number;
  compactionBoundaries: CompactionBoundary[];
  sessionStart: number;
  nameColWidth: number;
  /** When false, the Ctx % column is hidden and its width is excluded from leftOffset. */
  showCtxColumn: boolean;
}

/** Vertical grid lines and compaction boundaries, rendered as absolute positioned divs */
function GridLines({
  waterfallWidth,
  scaledWidth,
  panOffset,
  totalHeight,
  totalDuration,
  compactionBoundaries,
  sessionStart,
  nameColWidth,
  showCtxColumn,
}: GridLinesProps): React.ReactElement {
  const leftOffset = COL_NUM + nameColWidth + COL_TYPE + COL_TIME + COL_TOKENS + (showCtxColumn ? COL_CTX : 0);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: leftOffset,
        right: 0,
        height: totalHeight,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Regular grid lines at 25%, 50%, 75% */}
      {[0.25, 0.5, 0.75].map((frac) => {
        const x = frac * scaledWidth + panOffset;
        if (x < 0 || x > waterfallWidth) return null;
        return (
          <div
            key={frac}
            style={{
              position: 'absolute',
              left: x,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundImage: 'repeating-linear-gradient(to bottom, var(--ctp-surface1) 0 4px, transparent 4px 8px)',
            }}
          />
        );
      })}

      {/* Compaction boundary lines */}
      {compactionBoundaries.map((boundary, i) => {
        const frac = totalDuration > 0 ? (boundary.timestamp - sessionStart) / totalDuration : 0;
        const x = frac * scaledWidth + panOffset;
        if (x < 0 || x > waterfallWidth) return null;
        const triggerLabel = boundary.trigger === 'manual' ? 'Manual compact (/compact)'
          : boundary.trigger === 'auto' ? 'Auto-compact' : 'Compaction';
        const tokenLabel = boundary.preTokens != null ? ` at ${Math.round(boundary.preTokens / 1000)}k tokens` : '';
        return (
          <div
            key={i}
            title={`${triggerLabel}${tokenLabel} — ${formatDuration(boundary.timestamp - sessionStart)}`}
            style={{
              position: 'absolute',
              left: x,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundImage: 'repeating-linear-gradient(to bottom, var(--color-error) 0 4px, transparent 4px 8px)',
              opacity: 0.6,
            }}
          />
        );
      })}
    </div>
  );
}
