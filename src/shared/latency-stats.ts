import type { WaterfallRow } from './types.js';

/**
 * Latency statistics for a single tool type across a session.
 */
export interface ToolLatencyStats {
  toolName: string;
  count: number;
  /** 50th percentile duration in milliseconds. */
  p50: number;
  /** 95th percentile duration in milliseconds. */
  p95: number;
  /** Maximum observed duration in milliseconds. */
  max: number;
  /** Sum of all durations for this tool type in milliseconds. */
  total: number;
}

/**
 * Aggregated latency statistics for an entire session.
 */
export interface SessionLatencyStats {
  /** Per-tool stats, sorted by total duration descending. */
  toolStats: ToolLatencyStats[];
  /** Total number of tool calls with a known duration. */
  totalCalls: number;
  /** Sum of all tool durations across all types in milliseconds. */
  totalDuration: number;
  /** Row IDs whose duration exceeds the slow threshold. */
  slowCallIds: string[];
}

/** Collect all rows (including nested children) into a flat list. */
function flattenRows(rows: WaterfallRow[]): WaterfallRow[] {
  const result: WaterfallRow[] = [];
  const walk = (list: WaterfallRow[]) => {
    for (const row of list) {
      result.push(row);
      if (row.children.length > 0) walk(row.children);
    }
  };
  walk(rows);
  return result;
}

/**
 * Compute a percentile value from a sorted array of numbers.
 *
 * Uses the nearest-rank method: index = Math.floor((n - 1) * p).
 * The array must be sorted in ascending order.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

/**
 * Compute per-tool latency statistics for a session.
 *
 * Flattens all rows (including nested children), skips rows without a
 * completed duration, groups by normalized tool name (lowercased), and
 * computes P50, P95, max, and total for each group. Also collects row IDs
 * that exceed the provided slow threshold.
 *
 * @param rows - Top-level WaterfallRow array from the session parser.
 * @param slowThresholdMs - Duration threshold in milliseconds above which a
 *   row is considered slow and included in `slowCallIds`.
 * @returns {@link SessionLatencyStats} with tool breakdowns and slow call IDs.
 */
export function computeLatencyStats(
  rows: WaterfallRow[],
  slowThresholdMs: number,
): SessionLatencyStats {
  const flat = flattenRows(rows);

  // Group durations and collect slow call IDs in one pass.
  const groups = new Map<string, { durations: number[]; originalName: string }>();
  const slowCallIds: string[] = [];

  for (const row of flat) {
    if (row.duration === null) continue;

    const key = row.toolName.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { durations: [], originalName: row.toolName });
    }
    // Non-null assertion is safe: we just set it above if missing.
    groups.get(key)!.durations.push(row.duration);

    if (row.duration > slowThresholdMs) {
      slowCallIds.push(row.id);
    }
  }

  // Build per-tool stats.
  const toolStats: ToolLatencyStats[] = [];
  for (const [, { durations, originalName }] of groups) {
    durations.sort((a, b) => a - b);

    const total = durations.reduce((sum, d) => sum + d, 0);

    toolStats.push({
      toolName: originalName,
      count: durations.length,
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: durations[durations.length - 1],
      total,
    });
  }

  // Sort by total duration descending.
  toolStats.sort((a, b) => b.total - a.total);

  const totalCalls = toolStats.reduce((sum, s) => sum + s.count, 0);
  const totalDuration = toolStats.reduce((sum, s) => sum + s.total, 0);

  return { toolStats, totalCalls, totalDuration, slowCallIds };
}
