import type { WaterfallRow, ContextHealth } from './types.js';

/**
 * Aggregated metrics for a single session, used for side-by-side comparison.
 */
export interface SessionMetrics {
  /** Total wall-clock duration from first row start to last row end (ms). */
  totalDuration: number;
  /** Sum of inputTokens + outputTokens across all rows (including children). */
  totalTokens: number;
  /** Total number of tool rows (including nested children). */
  totalCalls: number;
  /** Number of rows with status === 'error'. */
  errorCount: number;
  /** errorCount / totalCalls, or 0 when totalCalls is 0. */
  errorRate: number;
  /** Map of toolName to occurrence count (all rows including children). */
  toolMix: Record<string, number>;
  /** Health grade letter from the ContextHealth object, or 'A' when absent. */
  healthGrade: string;
  /** Health score 0-100 from the ContextHealth object, or 100 when absent. */
  healthScore: number;
  /**
   * Ordered array of contextFillPercent values from each row (nulls/zeros skipped).
   * Used to draw the context fill trajectory sparkline.
   */
  contextFillTimeline: number[];
}

/**
 * Numeric deltas between two SessionMetrics (right minus left).
 * Positive means the right session is larger/worse for most metrics.
 */
export interface SessionDeltas {
  /** right.totalDuration - left.totalDuration (ms). Negative = right is faster. */
  durationDelta: number;
  /** right.totalTokens - left.totalTokens. Negative = right uses fewer tokens. */
  tokenDelta: number;
  /** right.totalCalls - left.totalCalls. */
  callDelta: number;
  /** right.errorRate - left.errorRate. Negative = right has fewer errors. */
  errorRateDelta: number;
}

/** Collect all rows (including nested children) into a flat list. */
function flattenRows(rows: WaterfallRow[]): WaterfallRow[] {
  const result: WaterfallRow[] = [];
  const walk = (list: WaterfallRow[]): void => {
    for (const row of list) {
      result.push(row);
      if (row.children.length > 0) walk(row.children);
    }
  };
  walk(rows);
  return result;
}

/**
 * Compute aggregated metrics for a session's waterfall rows.
 *
 * Accepts the top-level WaterfallRow array and the session's ContextHealth
 * (may be null for sessions that haven't been scored yet). Returns a
 * {@link SessionMetrics} object suitable for display and delta computation.
 */
export function computeSessionMetrics(
  rows: WaterfallRow[],
  health: ContextHealth | null,
): SessionMetrics {
  if (rows.length === 0) {
    return {
      totalDuration: 0,
      totalTokens: 0,
      totalCalls: 0,
      errorCount: 0,
      errorRate: 0,
      toolMix: {},
      healthGrade: health?.grade ?? 'A',
      healthScore: health?.score ?? 100,
      contextFillTimeline: [],
    };
  }

  const flat = flattenRows(rows);

  let totalTokens = 0;
  let errorCount = 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  const toolMix: Record<string, number> = {};
  const contextFillTimeline: number[] = [];

  for (const row of flat) {
    totalTokens += row.inputTokens + row.outputTokens;

    if (row.status === 'error') errorCount++;

    if (row.startTime < minStart) minStart = row.startTime;
    const end = row.endTime ?? row.startTime;
    if (end > maxEnd) maxEnd = end;

    // Count tool mix (use original toolName casing)
    const name = row.toolName;
    toolMix[name] = (toolMix[name] ?? 0) + 1;

    // Collect context fill trajectory — skip zero/unset values
    if (row.contextFillPercent > 0) {
      contextFillTimeline.push(row.contextFillPercent);
    }
  }

  const totalCalls = flat.length;
  const errorRate = totalCalls > 0 ? errorCount / totalCalls : 0;
  const totalDuration = maxEnd > minStart ? maxEnd - minStart : 0;

  return {
    totalDuration,
    totalTokens,
    totalCalls,
    errorCount,
    errorRate,
    toolMix,
    healthGrade: health?.grade ?? 'A',
    healthScore: health?.score ?? 100,
    contextFillTimeline,
  };
}

/**
 * Compute the numeric deltas between two sessions (right minus left).
 *
 * A negative durationDelta means the right session completed faster.
 * A negative errorRateDelta means the right session had fewer errors.
 * These semantics let the UI consistently color negative as green (better)
 * and positive as red (worse) for duration, tokens, calls, and error rate.
 */
export function compareSessionMetrics(
  left: SessionMetrics,
  right: SessionMetrics,
): SessionDeltas {
  return {
    durationDelta: right.totalDuration - left.totalDuration,
    tokenDelta: right.totalTokens - left.totalTokens,
    callDelta: right.totalCalls - left.totalCalls,
    errorRateDelta: right.errorRate - left.errorRate,
  };
}
