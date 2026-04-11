import type { WaterfallRow } from './types.js';

/**
 * Reliability statistics for a single tool type across a session.
 */
export interface ToolReliability {
  toolName: string;
  total: number;
  success: number;
  errors: number;
  /** Rows where isFailure === true (crash/timeout/permission denied). */
  failures: number;
  /** success / total as a percentage (0–100). 100 when total is 0. */
  reliability: number;
}

/**
 * Aggregated reliability statistics for an entire session.
 */
export interface SessionReliability {
  // Overall counts
  totalCalls: number;
  successCount: number;
  errorCount: number;
  failureCount: number;
  /** Overall percentage of successful tool calls (0–100). */
  overallReliability: number;

  /**
   * Errors per 10 tool calls.
   * e.g. 3.2 means roughly 3 errors for every 10 calls.
   */
  errorDensity: number;

  /**
   * Number of error→retry sequences detected.
   * A retry is defined as: row[i] has status 'error', and the next row
   * with the same toolName has status 'success'.
   */
  recoveryAttempts: number;
  /** Number of recovery attempts that resulted in a success. */
  recoverySuccesses: number;
  /** recoverySuccesses / recoveryAttempts as a percentage. 0 when no attempts. */
  recoveryRate: number;

  /**
   * For files that appear in both an error row and a success row,
   * the average number of errors before the first success on that file.
   * 0 when no qualifying files exist.
   */
  avgErrorsBeforeFix: number;

  /**
   * Per-tool reliability breakdown.
   * Sorted ascending by reliability (worst tools first).
   */
  toolReliability: ToolReliability[];
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
 * Extract the first plausible file path from a label string.
 * Matches Unix-style absolute paths or relative paths containing a `/`.
 * Returns null when no path-like token is found.
 */
function extractFilePath(label: string): string | null {
  // Match tokens that look like file paths:
  // - absolute: /foo/bar.ts
  // - relative with directory: src/foo.ts
  // We split on spaces/colons/parens and look for tokens containing '/'
  const tokens = label.split(/[\s:()[\],"']+/);
  for (const token of tokens) {
    if (token.length === 0) continue;
    // Must contain a slash and at least one dot (heuristic for real paths)
    if (token.includes('/') && token.includes('.')) {
      return token;
    }
    // Also accept absolute paths without a dot (e.g. /usr/local/bin/node)
    if (token.startsWith('/') && token.includes('/')) {
      return token;
    }
  }
  return null;
}

/**
 * Compute per-tool and session-level reliability statistics.
 *
 * Rows with status 'running' are excluded from all counts — they have not
 * yet completed and would skew success/error ratios.
 *
 * @param rows - Top-level WaterfallRow array from the session parser.
 * @returns {@link SessionReliability} with per-tool and aggregate metrics.
 */
export function computeReliability(rows: WaterfallRow[]): SessionReliability {
  const flat = flattenRows(rows);

  // Only consider completed rows (skip running)
  const completed = flat.filter((r) => r.status !== 'running');

  if (completed.length === 0) {
    return {
      totalCalls: 0,
      successCount: 0,
      errorCount: 0,
      failureCount: 0,
      overallReliability: 100,
      errorDensity: 0,
      recoveryAttempts: 0,
      recoverySuccesses: 0,
      recoveryRate: 0,
      avgErrorsBeforeFix: 0,
      toolReliability: [],
    };
  }

  // -------------------------------------------------------------------------
  // Overall counts
  // -------------------------------------------------------------------------
  let successCount = 0;
  let errorCount = 0;
  let failureCount = 0;

  for (const row of completed) {
    if (row.isFailure) {
      failureCount++;
    } else if (row.status === 'error') {
      errorCount++;
    } else {
      successCount++;
    }
  }

  const totalCalls = completed.length;
  const overallReliability = (successCount / totalCalls) * 100;

  // -------------------------------------------------------------------------
  // Error density: errors per 10 calls
  // -------------------------------------------------------------------------
  const errorDensity = totalCalls > 0 ? (errorCount / totalCalls) * 10 : 0;

  // -------------------------------------------------------------------------
  // Recovery rate: error→same-tool-success sequences
  // -------------------------------------------------------------------------
  // Build a map from toolName (lowercased) to the ordered list of completed rows
  const toolSequences = new Map<string, WaterfallRow[]>();
  for (const row of completed) {
    const key = row.toolName.toLowerCase();
    if (!toolSequences.has(key)) toolSequences.set(key, []);
    toolSequences.get(key)!.push(row);
  }

  let recoveryAttempts = 0;
  let recoverySuccesses = 0;

  for (const [, sequence] of toolSequences) {
    for (let i = 0; i < sequence.length - 1; i++) {
      if (sequence[i].status === 'error') {
        // Look for the immediately next row in the same-tool sequence
        recoveryAttempts++;
        if (sequence[i + 1].status === 'success') {
          recoverySuccesses++;
        }
      }
    }
  }

  const recoveryRate =
    recoveryAttempts > 0 ? (recoverySuccesses / recoveryAttempts) * 100 : 0;

  // -------------------------------------------------------------------------
  // Error-to-fix ratio: avg errors before first success, per file
  // -------------------------------------------------------------------------
  // Group rows by extracted file path
  const fileRows = new Map<string, WaterfallRow[]>();
  for (const row of completed) {
    const filePath = extractFilePath(row.label);
    if (filePath === null) continue;
    if (!fileRows.has(filePath)) fileRows.set(filePath, []);
    fileRows.get(filePath)!.push(row);
  }

  const errorsBeforeFixCounts: number[] = [];
  for (const [, fileSeq] of fileRows) {
    // Find the index of the first success
    const firstSuccessIdx = fileSeq.findIndex((r) => r.status === 'success');
    if (firstSuccessIdx <= 0) continue; // no success, or success was first — skip
    // Count errors before the first success
    const errorsBeforeSuccess = fileSeq
      .slice(0, firstSuccessIdx)
      .filter((r) => r.status === 'error').length;
    if (errorsBeforeSuccess === 0) continue; // no errors before success — skip
    errorsBeforeFixCounts.push(errorsBeforeSuccess);
  }

  const avgErrorsBeforeFix =
    errorsBeforeFixCounts.length > 0
      ? errorsBeforeFixCounts.reduce((a, b) => a + b, 0) / errorsBeforeFixCounts.length
      : 0;

  // -------------------------------------------------------------------------
  // Per-tool reliability
  // -------------------------------------------------------------------------
  const toolGroups = new Map<
    string,
    { originalName: string; success: number; errors: number; failures: number }
  >();

  for (const row of completed) {
    const key = row.toolName.toLowerCase();
    if (!toolGroups.has(key)) {
      toolGroups.set(key, { originalName: row.toolName, success: 0, errors: 0, failures: 0 });
    }
    const entry = toolGroups.get(key)!;
    if (row.isFailure) {
      entry.failures++;
    } else if (row.status === 'error') {
      entry.errors++;
    } else {
      entry.success++;
    }
  }

  const toolReliability: ToolReliability[] = [];
  for (const [, { originalName, success, errors, failures }] of toolGroups) {
    const total = success + errors + failures;
    const reliability = total > 0 ? (success / total) * 100 : 100;
    toolReliability.push({ toolName: originalName, total, success, errors, failures, reliability });
  }

  // Sort ascending by reliability — worst tools first
  toolReliability.sort((a, b) => a.reliability - b.reliability);

  return {
    totalCalls,
    successCount,
    errorCount,
    failureCount,
    overallReliability,
    errorDensity,
    recoveryAttempts,
    recoverySuccesses,
    recoveryRate,
    avgErrorsBeforeFix,
    toolReliability,
  };
}
