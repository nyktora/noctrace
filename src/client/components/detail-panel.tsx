import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { WaterfallRow } from '../../shared/types.ts';
import { useSessionStore } from '../store/session-store.ts';
import { CloseIcon } from '../icons/close-icon.tsx';
import { ErrorIcon } from '../icons/error-icon.tsx';
import { SuccessIcon } from '../icons/success-icon.tsx';
import { RunningIcon } from '../icons/running-icon.tsx';
import { formatDuration, formatTokens, getContextHeatColor, getToolColor } from '../utils/tool-colors.ts';

/** Props for DetailPanel */
export interface DetailPanelProps {
  row: WaterfallRow;
}

function StatusIcon({ status }: { status: WaterfallRow['status'] }): React.ReactElement {
  if (status === 'error') return <ErrorIcon size={14} color="var(--color-error)" />;
  if (status === 'running') return <RunningIcon size={14} color="var(--color-running)" />;
  return <SuccessIcon size={14} color="var(--color-write)" />;
}

function renderInput(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 220;

/**
 * Bottom panel shown when a waterfall row is selected.
 * Displays full tool input/output in two columns. Resizable via drag handle.
 */
export function DetailPanel({ row }: DetailPanelProps): React.ReactElement {
  const selectRow = useSessionStore((s) => s.selectRow);
  const toolColor = getToolColor(row.toolName, row.status);
  const heatColor = getContextHeatColor(row.contextFillPercent);

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') selectRow(null);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [selectRow]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      dragStartY.current = e.clientY;
      dragStartHeight.current = height;
      e.preventDefault();
    },
    [height],
  );

  useEffect(() => {
    function handleMouseMove(e: MouseEvent): void {
      if (!isDragging.current) return;
      const dy = dragStartY.current - e.clientY;
      setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, dragStartHeight.current + dy)));
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
  }, []);

  return (
    <div
      style={{
        height,
        backgroundColor: 'var(--ctp-mantle)',
        borderTop: '1px solid var(--ctp-surface0)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          height: 5,
          cursor: 'ns-resize',
          backgroundColor: 'var(--ctp-surface0)',
          flexShrink: 0,
        }}
        title="Drag to resize"
      />

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 shrink-0"
        style={{
          height: 32,
          borderBottom: '1px solid var(--ctp-surface0)',
          backgroundColor: 'var(--ctp-crust)',
        }}
      >
        <StatusIcon status={row.status} />
        <span
          className="font-mono text-xs font-semibold"
          style={{ color: toolColor }}
        >
          {row.toolName}
        </span>
        {row.label !== row.toolName && (
          <span
            className="font-mono text-xs truncate flex-1"
            style={{ color: 'var(--ctp-subtext0)' }}
            title={row.label}
          >
            {row.label}
          </span>
        )}
        {row.label === row.toolName && <span className="flex-1" />}

        {/* Metadata chips */}
        <div className="flex items-center gap-2 shrink-0 text-xs font-mono">
          <span style={{ color: 'var(--ctp-overlay0)' }} title={new Date(row.startTime).toISOString()}>
            {new Date(row.startTime).toLocaleTimeString()}
          </span>
          <span style={{ color: 'var(--ctp-subtext0)' }}>
            {formatDuration(row.duration)}
          </span>
          {row.tokenDelta > 0 && (
            <span
              style={{ color: row.tokenDelta > 5000 ? 'var(--ctp-yellow)' : 'var(--ctp-subtext0)' }}
              title={`${row.tokenDelta} tokens added to context`}
            >
              Δ {formatTokens(row.tokenDelta)}
            </span>
          )}
          {/* Context badge */}
          <span
            className="px-1.5 py-0.5 rounded text-xs font-mono"
            style={{
              border: `1px solid ${heatColor}`,
              color: heatColor,
              backgroundColor: `${heatColor}18`,
              fontWeight: row.contextFillPercent >= 80 ? 700 : 400,
            }}
          >
            {Math.min(row.contextFillPercent, 100).toFixed(0)}%{row.contextFillPercent >= 80 ? ' degraded' : ' ctx'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => selectRow(null)}
          style={{ color: 'var(--ctp-overlay0)', flexShrink: 0, cursor: 'pointer' }}
          title="Close (Esc)"
        >
          <CloseIcon size={14} />
        </button>
      </div>

      {/* Two-column content */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex-1 overflow-auto"
          style={{ borderRight: '1px solid var(--ctp-surface0)' }}
        >
          <div
            className="px-2 py-1 text-xs uppercase tracking-wider shrink-0 flex items-center justify-between"
            style={{
              color: 'var(--ctp-overlay0)',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              borderBottom: '1px solid var(--ctp-surface0)',
            }}
          >
            <span>Input</span>
            {row.tokenDelta > 0 && (
              <span className="font-mono" style={{ fontSize: 10, color: 'var(--ctp-subtext0)' }}>
                {formatTokens(row.tokenDelta)}
              </span>
            )}
          </div>
          <pre
            className="text-xs p-2 overflow-auto font-mono whitespace-pre-wrap break-all"
            style={{ color: 'var(--ctp-text)', fontSize: 11, lineHeight: 1.5 }}
          >
            {renderInput(row.input)}
          </pre>
        </div>
        <div className="flex-1 overflow-auto">
          <div
            className="px-2 py-1 text-xs uppercase tracking-wider shrink-0 flex items-center justify-between"
            style={{
              color: 'var(--ctp-overlay0)',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              borderBottom: '1px solid var(--ctp-surface0)',
            }}
          >
            <span>Output</span>
            {row.outputTokens > 0 && (
              <span className="font-mono" style={{ fontSize: 10, color: 'var(--ctp-subtext0)' }}>
                {formatTokens(row.outputTokens)}
              </span>
            )}
          </div>
          <pre
            className="text-xs p-2 font-mono whitespace-pre-wrap break-all"
            style={{
              color: row.status === 'error' ? 'var(--color-error)' : 'var(--ctp-text)',
              fontSize: 11,
              lineHeight: 1.5,
            }}
          >
            {row.output ?? '(no output)'}
          </pre>
        </div>
      </div>
    </div>
  );
}
