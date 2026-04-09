import React, { useMemo } from 'react';

import type { HealthGrade } from '../../shared/types.ts';
import { computeSessionMetrics, compareSessionMetrics } from '../../shared/session-compare.ts';
import { useSessionStore } from '../store/session-store.ts';
import { CloseIcon } from '../icons/close-icon.tsx';
import { formatTokens, formatDuration, getToolColor, resolveColor } from '../utils/tool-colors.ts';

/** Grade-to-color mapping consistent with health-breakdown and health-badge */
const GRADE_COLORS: Record<HealthGrade, string> = {
  A: '#a6e3a1',
  B: '#94e2d5',
  C: '#f9e2af',
  D: '#fab387',
  F: '#f38ba8',
};

/** Format error rate as percentage string */
function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** Format a duration delta for display (with sign prefix) */
function formatDurationDelta(ms: number): string {
  if (ms === 0) return '0ms';
  const sign = ms > 0 ? '+' : '';
  return sign + formatDuration(Math.abs(ms));
}

/** Format a token delta for display (with sign prefix) */
function formatTokenDelta(n: number): string {
  if (n === 0) return '—';
  const sign = n > 0 ? '+' : '-';
  return sign + formatTokens(Math.abs(n));
}

/** Format an error rate delta for display (with sign prefix) */
function formatRateDelta(rate: number): string {
  if (rate === 0) return '0%';
  const sign = rate > 0 ? '+' : '';
  return `${sign}${(rate * 100).toFixed(1)}%`;
}

/** Format a call count delta for display (with sign prefix) */
function formatCallDelta(n: number): string {
  if (n === 0) return '0';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n}`;
}

/** Color a delta: negative (improvement) → green, positive (worse) → red */
function deltaColor(delta: number): string {
  if (delta === 0) return 'var(--ctp-overlay0)';
  return delta < 0 ? 'var(--ctp-green)' : 'var(--ctp-red)';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface GradeSectionProps {
  leftGrade: string;
  leftScore: number;
  rightGrade: string;
  rightScore: number;
}

/** Side-by-side health grade badges with numeric scores */
function GradeSection({ leftGrade, leftScore, rightGrade, rightScore }: GradeSectionProps): React.ReactElement {
  const leftColor = GRADE_COLORS[leftGrade as HealthGrade] ?? '#6c7086';
  const rightColor = GRADE_COLORS[rightGrade as HealthGrade] ?? '#6c7086';

  return (
    <div className="flex gap-4 px-4 py-3" style={{ borderBottom: '1px solid var(--ctp-surface0)' }}>
      <SectionLabel label="Health Grade" />
      <div className="flex flex-1 gap-2">
        {/* Left grade */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: `2px solid ${leftColor}`,
              backgroundColor: `${leftColor}18`,
              color: leftColor,
              fontWeight: 700,
              fontSize: 18,
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {leftGrade}
          </div>
          <span style={{ fontSize: 10, color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            {leftScore}/100
          </span>
        </div>
        {/* Right grade */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: `2px solid ${rightColor}`,
              backgroundColor: `${rightColor}18`,
              color: rightColor,
              fontWeight: 700,
              fontSize: 18,
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {rightGrade}
          </div>
          <span style={{ fontSize: 10, color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            {rightScore}/100
          </span>
        </div>
      </div>
    </div>
  );
}

interface MetricRowProps {
  label: string;
  left: string;
  right: string;
  delta: string;
  deltaValue: number;
}

/** Single row in the summary metrics table */
function MetricRow({ label, left, right, delta, deltaValue }: MetricRowProps): React.ReactElement {
  return (
    <div
      className="flex items-center text-xs px-4 py-1.5"
      style={{ borderBottom: '1px solid var(--ctp-surface0)', fontFamily: 'ui-monospace, monospace' }}
    >
      <div style={{ width: 90, color: 'var(--ctp-subtext0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif', flexShrink: 0 }}>
        {label}
      </div>
      <div className="flex-1 text-center" style={{ color: 'var(--ctp-text)' }}>{left}</div>
      <div className="flex-1 text-center" style={{ color: 'var(--ctp-text)' }}>{right}</div>
      <div className="flex-1 text-center" style={{ color: deltaColor(deltaValue), fontWeight: 600 }}>{delta}</div>
    </div>
  );
}

interface SummaryTableProps {
  leftId: string;
  rightId: string;
  leftMetrics: import('../../shared/session-compare.ts').SessionMetrics;
  rightMetrics: import('../../shared/session-compare.ts').SessionMetrics;
}

/** Summary metrics table comparing the two sessions */
function SummaryTable({ leftId, rightId, leftMetrics, rightMetrics }: SummaryTableProps): React.ReactElement {
  const deltas = useMemo(() => compareSessionMetrics(leftMetrics, rightMetrics), [leftMetrics, rightMetrics]);

  return (
    <div style={{ borderBottom: '1px solid var(--ctp-surface0)' }}>
      {/* Table header */}
      <div
        className="flex items-center text-xs px-4 py-1.5"
        style={{
          borderBottom: '1px solid var(--ctp-surface0)',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          backgroundColor: 'var(--ctp-mantle)',
        }}
      >
        <div style={{ width: 90, flexShrink: 0 }} />
        <div className="flex-1 text-center truncate" style={{ color: 'var(--ctp-blue)', fontSize: 10 }} title={leftId}>
          {leftId.slice(0, 8)}…
        </div>
        <div className="flex-1 text-center truncate" style={{ color: 'var(--ctp-mauve)', fontSize: 10 }} title={rightId}>
          {rightId.slice(0, 8)}…
        </div>
        <div className="flex-1 text-center" style={{ color: 'var(--ctp-overlay0)', fontSize: 10 }}>Delta</div>
      </div>

      <MetricRow
        label="Duration"
        left={formatDuration(leftMetrics.totalDuration)}
        right={formatDuration(rightMetrics.totalDuration)}
        delta={formatDurationDelta(deltas.durationDelta)}
        deltaValue={deltas.durationDelta}
      />
      <MetricRow
        label="Tokens"
        left={formatTokens(leftMetrics.totalTokens)}
        right={formatTokens(rightMetrics.totalTokens)}
        delta={formatTokenDelta(deltas.tokenDelta)}
        deltaValue={deltas.tokenDelta}
      />
      <MetricRow
        label="Tool Calls"
        left={String(leftMetrics.totalCalls)}
        right={String(rightMetrics.totalCalls)}
        delta={formatCallDelta(deltas.callDelta)}
        deltaValue={deltas.callDelta}
      />
      <MetricRow
        label="Error Rate"
        left={formatRate(leftMetrics.errorRate)}
        right={formatRate(rightMetrics.errorRate)}
        delta={formatRateDelta(deltas.errorRateDelta)}
        deltaValue={deltas.errorRateDelta}
      />
    </div>
  );
}

interface ToolMixSectionProps {
  leftMix: Record<string, number>;
  leftTotal: number;
  rightMix: Record<string, number>;
  rightTotal: number;
}

/** Horizontal bar chart comparing tool mix between sessions */
function ToolMixSection({ leftMix, leftTotal, rightMix, rightTotal }: ToolMixSectionProps): React.ReactElement {
  // Collect all unique tool names from both sessions
  const allTools = Array.from(new Set([...Object.keys(leftMix), ...Object.keys(rightMix)]));

  // Sort by combined usage descending
  allTools.sort((a, b) => {
    const aTotal = (leftMix[a] ?? 0) + (rightMix[a] ?? 0);
    const bTotal = (leftMix[b] ?? 0) + (rightMix[b] ?? 0);
    return bTotal - aTotal;
  });

  // Only show top 10 tools to keep the panel readable
  const topTools = allTools.slice(0, 10);

  return (
    <div style={{ borderBottom: '1px solid var(--ctp-surface0)' }}>
      <SectionLabel label="Tool Mix" padded />
      <div className="px-4 pb-3">
        {topTools.map((tool) => {
          const leftCount = leftMix[tool] ?? 0;
          const rightCount = rightMix[tool] ?? 0;
          const leftPct = leftTotal > 0 ? (leftCount / leftTotal) * 100 : 0;
          const rightPct = rightTotal > 0 ? (rightCount / rightTotal) * 100 : 0;
          const color = resolveColor(getToolColor(tool));

          return (
            <div key={tool} className="mb-2">
              <div
                className="flex justify-between mb-0.5 text-xs"
                style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
              >
                <span style={{ color: 'var(--ctp-subtext0)' }}>{tool}</span>
                <span style={{ color: 'var(--ctp-overlay0)' }}>
                  {leftCount} / {rightCount}
                </span>
              </div>
              {/* Left bar */}
              <div
                className="mb-0.5 rounded-sm overflow-hidden"
                style={{ height: 5, backgroundColor: 'var(--ctp-surface0)' }}
              >
                <div
                  style={{
                    width: `${leftPct}%`,
                    height: '100%',
                    backgroundColor: color,
                    borderRadius: 2,
                    transition: 'width 300ms ease',
                  }}
                />
              </div>
              {/* Right bar — faded variant */}
              <div
                className="rounded-sm overflow-hidden"
                style={{ height: 5, backgroundColor: 'var(--ctp-surface0)' }}
              >
                <div
                  style={{
                    width: `${rightPct}%`,
                    height: '100%',
                    backgroundColor: color,
                    opacity: 0.45,
                    borderRadius: 2,
                    transition: 'width 300ms ease',
                  }}
                />
              </div>
            </div>
          );
        })}
        {topTools.length === 0 && (
          <div style={{ color: 'var(--ctp-overlay0)', fontSize: 11, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            No tool data
          </div>
        )}
      </div>
    </div>
  );
}

interface SparklineProps {
  points: number[];
  color: string;
  width: number;
  height: number;
}

/** Inline SVG polyline sparkline for context fill trajectory */
function Sparkline({ points, color, width, height }: SparklineProps): React.ReactElement {
  if (points.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={10} fill="var(--ctp-overlay0)">
          Not enough data
        </text>
      </svg>
    );
  }

  const maxY = 100; // contextFillPercent range is 0-100
  const pts = points.map((v, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - (v / maxY) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} overflow="visible">
      {/* Y-axis reference lines at 50% and 80% fill */}
      <line x1={0} y1={height * 0.5} x2={width} y2={height * 0.5} stroke="var(--ctp-surface1)" strokeWidth="0.5" strokeDasharray="3 3" />
      <line x1={0} y1={height * 0.2} x2={width} y2={height * 0.2} stroke="var(--ctp-surface1)" strokeWidth="0.5" strokeDasharray="3 3" />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface TrajectoryProps {
  leftTimeline: number[];
  rightTimeline: number[];
}

/** Overlaid sparklines showing context fill trajectories */
function TrajectorySection({ leftTimeline, rightTimeline }: TrajectoryProps): React.ReactElement {
  const W = 320;
  const H = 72;

  return (
    <div style={{ borderBottom: '1px solid var(--ctp-surface0)' }}>
      <SectionLabel label="Context Fill Trajectory" padded />
      <div className="px-4 pb-4">
        <div
          style={{
            position: 'relative',
            backgroundColor: 'var(--ctp-mantle)',
            borderRadius: 4,
            padding: '8px 0',
            overflowX: 'auto',
          }}
        >
          {/* Stacked sparklines: left on bottom, right on top via absolute */}
          <div style={{ position: 'relative', width: W, height: H, margin: '0 auto' }}>
            <div style={{ position: 'absolute', top: 0, left: 0 }}>
              <Sparkline points={leftTimeline} color="var(--ctp-blue)" width={W} height={H} />
            </div>
            <div style={{ position: 'absolute', top: 0, left: 0 }}>
              <Sparkline points={rightTimeline} color="var(--ctp-mauve)" width={W} height={H} />
            </div>
          </div>
          {/* Legend */}
          <div
            className="flex gap-4 justify-center mt-2 text-xs"
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: 'var(--ctp-overlay0)' }}
          >
            <span style={{ color: 'var(--ctp-blue)' }}>— Current session</span>
            <span style={{ color: 'var(--ctp-mauve)' }}>— Comparison session</span>
          </div>
        </div>
        <div className="flex justify-between mt-1 text-xs" style={{ color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
          <span>Start</span>
          <span>100% fill</span>
          <span>End</span>
        </div>
      </div>
    </div>
  );
}

interface SectionLabelProps {
  label: string;
  padded?: boolean;
}

/** Section header label consistent with health-breakdown style */
function SectionLabel({ label, padded = false }: SectionLabelProps): React.ReactElement {
  return (
    <div
      className={`text-xs font-semibold uppercase tracking-wider ${padded ? 'px-4 py-2' : ''}`}
      style={{
        color: 'var(--ctp-overlay0)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        borderBottom: '1px solid var(--ctp-surface0)',
      }}
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Full-area split-screen comparison view for two sessions.
 * Replaces the waterfall when compareMode is active.
 */
export function SessionCompare(): React.ReactElement {
  const rows = useSessionStore((s) => s.rows);
  const health = useSessionStore((s) => s.health);
  const selectedSessionId = useSessionStore((s) => s.selectedSessionId);
  const compareRows = useSessionStore((s) => s.compareRows);
  const compareHealth = useSessionStore((s) => s.compareHealth);
  const compareSessionId = useSessionStore((s) => s.compareSessionId);
  const exitCompareMode = useSessionStore((s) => s.exitCompareMode);

  const leftMetrics = useMemo(() => computeSessionMetrics(rows, health), [rows, health]);
  const rightMetrics = useMemo(() => computeSessionMetrics(compareRows, compareHealth), [compareRows, compareHealth]);

  const leftId = selectedSessionId ?? 'Current';
  const rightId = compareSessionId ?? 'Comparison';

  return (
    <div
      className="flex flex-col overflow-auto"
      style={{
        height: '100%',
        backgroundColor: 'var(--ctp-base)',
        color: 'var(--ctp-text)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{
          backgroundColor: 'var(--ctp-mantle)',
          borderBottom: '1px solid var(--ctp-surface0)',
        }}
      >
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--ctp-text)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          Session Comparison
        </span>
        <div className="flex items-center gap-3">
          {/* Session ID labels */}
          <span style={{ fontSize: 11, color: 'var(--ctp-blue)', fontFamily: 'ui-monospace, monospace' }}>
            {leftId.slice(0, 8)}…
          </span>
          <span style={{ fontSize: 11, color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>vs</span>
          <span style={{ fontSize: 11, color: 'var(--ctp-mauve)', fontFamily: 'ui-monospace, monospace' }}>
            {rightId.slice(0, 8)}…
          </span>
          {/* Exit button */}
          <button
            type="button"
            onClick={exitCompareMode}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs"
            style={{
              backgroundColor: 'var(--ctp-surface0)',
              border: '1px solid var(--ctp-surface1)',
              color: 'var(--ctp-subtext0)',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              cursor: 'pointer',
            }}
            title="Exit comparison mode"
          >
            <CloseIcon size={12} color="var(--ctp-subtext0)" />
            Exit
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="overflow-auto flex-1">
        <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 32 }}>

          {/* Health grade */}
          <GradeSection
            leftGrade={leftMetrics.healthGrade}
            leftScore={leftMetrics.healthScore}
            rightGrade={rightMetrics.healthGrade}
            rightScore={rightMetrics.healthScore}
          />

          {/* Summary metrics table */}
          <SectionLabel label="Summary Metrics" />
          <SummaryTable
            leftId={leftId}
            rightId={rightId}
            leftMetrics={leftMetrics}
            rightMetrics={rightMetrics}
          />

          {/* Tool mix */}
          <SectionLabel label="Tool Mix" />
          <ToolMixSection
            leftMix={leftMetrics.toolMix}
            leftTotal={leftMetrics.totalCalls}
            rightMix={rightMetrics.toolMix}
            rightTotal={rightMetrics.totalCalls}
          />

          {/* Context fill trajectory */}
          <TrajectorySection
            leftTimeline={leftMetrics.contextFillTimeline}
            rightTimeline={rightMetrics.contextFillTimeline}
          />
        </div>
      </div>
    </div>
  );
}
