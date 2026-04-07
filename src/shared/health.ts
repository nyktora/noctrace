import type { WaterfallRow, ContextHealth, HealthSignal, HealthGrade } from './types.js';

/**
 * Fallback context window size when no peak has been observed yet.
 * Real sessions auto-compact at varying thresholds depending on the model
 * (e.g. ~300k for Opus 4.6 1M). We detect the actual ceiling from session data.
 */
const DEFAULT_CONTEXT_WINDOW = 200_000;

/** Map a numeric sub-score to a letter grade. */
function toGrade(score: number): HealthGrade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Compute the context fill sub-score (0–100) from the most recent row's
 * contextFillPercent. Higher fill = lower score.
 * Uses the LAST row's tokens, not the max — so compaction recovery is visible.
 * The effective context window is detected from the session's peak token usage
 * (the point just before auto-compaction fires), which varies by model.
 */
function computeFillScore(rows: WaterfallRow[]): { score: number; fillPercent: number } {
  if (rows.length === 0) return { score: 100, fillPercent: 0 };

  const flat = flattenRows(rows);

  // Detect the effective context window from the session's peak input tokens.
  // This is the auto-compaction ceiling — the highest token count seen before
  // the system compacted. Different models have different limits.
  let peakTokens = 0;
  for (const row of flat) {
    if (row.inputTokens > peakTokens) peakTokens = row.inputTokens;
  }
  const effectiveWindow = peakTokens > DEFAULT_CONTEXT_WINDOW
    ? peakTokens
    : DEFAULT_CONTEXT_WINDOW;

  // Use the last row's input tokens to reflect current context state.
  const lastRow = flat[flat.length - 1];
  const latestTokens = lastRow.inputTokens;

  const fillPercent = Math.min((latestTokens / effectiveWindow) * 100, 100);

  let score: number;
  if (fillPercent < 50) score = 100;
  else if (fillPercent < 65) score = 80;
  else if (fillPercent < 80) score = 60;
  else if (fillPercent < 90) score = 40;
  else score = 20;

  return { score, fillPercent };
}

/**
 * Compute the compaction count sub-score (0–100).
 * Fewer compactions = better score.
 */
function computeCompactionScore(compactionCount: number): number {
  if (compactionCount === 0) return 100;
  if (compactionCount === 1) return 75;
  if (compactionCount === 2) return 55;
  if (compactionCount === 3) return 35;
  return 15;
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
 * Compute the re-read ratio sub-score (0–100).
 * A re-read is any Read call to a file path already read earlier in the session.
 */
function computeRereadScore(rows: WaterfallRow[]): { score: number; rereadRatio: number } {
  const flat = flattenRows(rows);
  const readRows = flat.filter(r => r.toolName === 'Read');

  if (readRows.length === 0) return { score: 100, rereadRatio: 0 };

  const seen = new Set<string>();
  let rereads = 0;
  for (const row of readRows) {
    const filePath = row.input['file_path'];
    if (typeof filePath === 'string') {
      if (seen.has(filePath)) rereads++;
      else seen.add(filePath);
    } else if (row.isReread) {
      rereads++;
    }
  }

  const ratio = rereads / readRows.length;

  let score: number;
  if (ratio <= 0.05) score = 100;
  else if (ratio <= 0.10) score = 80;
  else if (ratio <= 0.20) score = 60;
  else if (ratio <= 0.35) score = 40;
  else score = 20;

  return { score, rereadRatio: ratio };
}

/**
 * Compute the error acceleration sub-score (0–100).
 * Compares the error rate in the second half of tool calls to the first half.
 * A rising error rate indicates context degradation.
 */
function computeErrorAccelerationScore(rows: WaterfallRow[]): { score: number; errorAcceleration: number } {
  const flat = flattenRows(rows).filter(r => r.type === 'tool');

  if (flat.length < 4) return { score: 100, errorAcceleration: 1 };

  const mid = Math.floor(flat.length / 2);
  const firstHalf = flat.slice(0, mid);
  const secondHalf = flat.slice(mid);

  const firstErrors = firstHalf.filter(r => r.status === 'error').length / firstHalf.length;
  const secondErrors = secondHalf.filter(r => r.status === 'error').length / secondHalf.length;

  if (firstErrors === 0 && secondErrors === 0) return { score: 100, errorAcceleration: 1 };
  if (firstErrors === 0 && secondErrors > 0) return { score: 40, errorAcceleration: Infinity };

  const ratio = secondErrors / firstErrors;

  let score: number;
  if (ratio <= 1.0) score = 100;
  else if (ratio <= 2.0) score = 75;
  else if (ratio <= 3.0) score = 55;
  else if (ratio <= 5.0) score = 35;
  else score = 15;

  return { score, errorAcceleration: ratio };
}

/**
 * Compute the tool efficiency sub-score (0–100).
 * Measures the ratio of productive (Write/Edit/MultiEdit) calls in each half
 * of the session. A declining ratio means Claude is spinning.
 */
function computeToolEfficiencyScore(rows: WaterfallRow[]): { score: number; toolEfficiency: number } {
  const flat = flattenRows(rows).filter(r => r.type === 'tool');

  if (flat.length < 4) return { score: 100, toolEfficiency: 1 };

  const isProductive = (name: string) => ['Write', 'Edit', 'MultiEdit'].includes(name);
  const mid = Math.floor(flat.length / 2);
  const firstHalf = flat.slice(0, mid);
  const secondHalf = flat.slice(mid);

  const firstRatio = firstHalf.filter(r => isProductive(r.toolName)).length / firstHalf.length;
  const secondRatio = secondHalf.filter(r => isProductive(r.toolName)).length / secondHalf.length;

  if (firstRatio === 0) return { score: 80, toolEfficiency: 1 };

  const change = secondRatio / firstRatio;

  let score: number;
  if (change >= 0.9) score = 100;
  else if (change >= 0.7) score = 75;
  else if (change >= 0.4) score = 55;
  else if (change >= 0.15) score = 35;
  else score = 15;

  return { score, toolEfficiency: change };
}

/**
 * Compute the Context Health grade for a session.
 *
 * Accepts the array of WaterfallRow objects produced by the JSONL parser and
 * the number of compaction events detected during parsing.
 *
 * Returns a {@link ContextHealth} object with the composite grade, numeric
 * score (0–100), per-signal breakdowns, and derived metrics used by the UI.
 */
export function computeContextHealth(
  rows: WaterfallRow[],
  compactionCount: number,
): ContextHealth {
  if (rows.length === 0) {
    const perfectSignals: HealthSignal[] = [
      { name: 'Context Fill', value: 100, grade: 'A', weight: 0.40 },
      { name: 'Compactions', value: 100, grade: 'A', weight: 0.25 },
      { name: 'Re-reads', value: 100, grade: 'A', weight: 0.15 },
      { name: 'Error Rate', value: 100, grade: 'A', weight: 0.10 },
      { name: 'Tool Efficiency', value: 100, grade: 'A', weight: 0.10 },
    ];
    return {
      grade: 'A',
      score: 100,
      fillPercent: 0,
      compactionCount: 0,
      rereadRatio: 0,
      errorAcceleration: 1,
      toolEfficiency: 1,
      signals: perfectSignals,
    };
  }

  const { score: fillScore, fillPercent } = computeFillScore(rows);
  const compactionScore = computeCompactionScore(compactionCount);
  const { score: rereadScore, rereadRatio } = computeRereadScore(rows);
  const { score: errorScore, errorAcceleration } = computeErrorAccelerationScore(rows);
  const { score: efficiencyScore, toolEfficiency } = computeToolEfficiencyScore(rows);

  const signals: HealthSignal[] = [
    { name: 'Context Fill', value: fillScore, grade: toGrade(fillScore), weight: 0.40 },
    { name: 'Compactions', value: compactionScore, grade: toGrade(compactionScore), weight: 0.25 },
    { name: 'Re-reads', value: rereadScore, grade: toGrade(rereadScore), weight: 0.15 },
    { name: 'Error Rate', value: errorScore, grade: toGrade(errorScore), weight: 0.10 },
    { name: 'Tool Efficiency', value: efficiencyScore, grade: toGrade(efficiencyScore), weight: 0.10 },
  ];

  const composite = signals.reduce((sum, s) => sum + s.value * s.weight, 0);

  return {
    grade: toGrade(composite),
    score: Math.round(composite),
    fillPercent,
    compactionCount,
    rereadRatio,
    errorAcceleration,
    toolEfficiency,
    signals,
  };
}
