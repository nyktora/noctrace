/**
 * Token drift analysis for Claude Code sessions.
 * Measures how per-turn token cost drifts from baseline over session lifetime.
 * Pure module: no file I/O, no side effects.
 */
import type { AssistantTurn, DriftAnalysis, DriftRateLabel } from './types.js';

const SAMPLE_SIZE = 5;

/** Shape of the usage block inside a JSONL assistant record. */
interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Shape of a JSONL assistant record relevant to token parsing. */
interface RawAssistantRecord {
  type: string;
  timestamp?: string;
  message?: {
    usage?: RawUsage;
  };
}

/**
 * Extract per-turn token usage from raw JSONL content.
 *
 * Scans for assistant records and sums all token usage fields per turn.
 * Malformed lines and records missing usage data are silently skipped.
 * Returns an array of {@link AssistantTurn} objects sorted by timestamp.
 */
export function parseAssistantTurns(content: string): AssistantTurn[] {
  const turns: AssistantTurn[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    let record: unknown;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (
      typeof record !== 'object' ||
      record === null ||
      (record as RawAssistantRecord).type !== 'assistant'
    ) {
      continue;
    }

    const raw = record as RawAssistantRecord;
    const usage = raw.message?.usage;

    if (usage == null) continue;

    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
    const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

    if (totalTokens === 0 || isNaN(totalTokens)) continue;

    const timestamp = raw.timestamp != null
      ? new Date(raw.timestamp).getTime()
      : 0;

    turns.push({ timestamp, totalTokens, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens });
  }

  return turns.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Minimum number of turns required to compute a meaningful drift rate.
 * Needs at least 3 windows × 2 turns each.
 */
const DRIFT_RATE_MIN_TURNS = 6;

/**
 * Classify a tokens-per-minute growth rate into a human-readable label.
 */
function classifyDriftRate(rate: number): DriftRateLabel {
  const absRate = Math.abs(rate);
  if (absRate < 50) return 'stable';
  if (absRate < 200) return 'rising';
  if (absRate < 500) return 'accelerating';
  return 'critical';
}

/**
 * Compute the Context Drift Rate from assistant turns.
 *
 * Splits the session into 3 equal time windows, computes the average tokens
 * per turn in each window, and estimates the rate of change in tokens/minute
 * using the slope of a simple linear regression across the three window means.
 *
 * Returns `{ driftRate: 0, driftRateLabel: 'stable' }` when there are fewer
 * than {@link DRIFT_RATE_MIN_TURNS} turns or when the time span is zero.
 */
function computeDriftRate(turns: AssistantTurn[]): { driftRate: number; driftRateLabel: DriftRateLabel } {
  if (turns.length < DRIFT_RATE_MIN_TURNS) {
    return { driftRate: 0, driftRateLabel: 'stable' };
  }

  const sessionStart = turns[0].timestamp;
  const sessionEnd = turns[turns.length - 1].timestamp;
  const spanMs = sessionEnd - sessionStart;

  // Need meaningful elapsed time to derive a rate
  if (spanMs <= 0) {
    return { driftRate: 0, driftRateLabel: 'stable' };
  }

  const windowSizeMs = spanMs / 3;

  // Compute avg tokens per turn for each of the 3 time windows
  const windowAvgs: number[] = [];
  const windowMidpoints: number[] = [];

  for (let w = 0; w < 3; w++) {
    const wStart = sessionStart + w * windowSizeMs;
    const wEnd = wStart + windowSizeMs;
    const windowTurns = turns.filter((t) => t.timestamp >= wStart && t.timestamp < wEnd);
    if (windowTurns.length === 0) {
      // Fall back to nearest turns if window is empty (sparse sessions)
      windowAvgs.push(w === 0 ? turns[0].totalTokens : turns[turns.length - 1].totalTokens);
    } else {
      const avg = windowTurns.reduce((s, t) => s + t.totalTokens, 0) / windowTurns.length;
      windowAvgs.push(avg);
    }
    windowMidpoints.push(wStart + windowSizeMs / 2);
  }

  // Linear regression: rate = Σ((x_i - x̄)(y_i - ȳ)) / Σ((x_i - x̄)²)
  // x = time in minutes, y = avg tokens per turn
  const xValues = windowMidpoints.map((t) => (t - sessionStart) / 60_000);
  const yValues = windowAvgs;

  const xMean = xValues.reduce((s, x) => s + x, 0) / 3;
  const yMean = yValues.reduce((s, y) => s + y, 0) / 3;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < 3; i++) {
    const dx = xValues[i] - xMean;
    numerator += dx * (yValues[i] - yMean);
    denominator += dx * dx;
  }

  // If denominator is zero all windows have the same midpoint — can't compute slope
  if (denominator === 0) {
    return { driftRate: 0, driftRateLabel: 'stable' };
  }

  const driftRate = Math.round(numerator / denominator);
  return { driftRate, driftRateLabel: classifyDriftRate(driftRate) };
}

/**
 * Compute token drift factor from assistant turns.
 *
 * Compares the average total tokens of the first {@link SAMPLE_SIZE} turns
 * (baseline) against the last {@link SAMPLE_SIZE} turns (current).
 * Returns a {@link DriftAnalysis} with `driftFactor = 1.0` when there is
 * insufficient data or when baseline is zero (guards against division by zero).
 * Also computes {@link DriftAnalysis.driftRate} and {@link DriftAnalysis.driftRateLabel}
 * when the session has at least 6 turns with valid timestamps.
 */
export function computeDrift(turns: AssistantTurn[]): DriftAnalysis {
  const turnCount = turns.length;
  const totalTokens = turns.reduce((sum, t) => sum + t.totalTokens, 0);
  const { driftRate, driftRateLabel } = computeDriftRate(turns);

  if (turnCount < SAMPLE_SIZE) {
    return {
      driftFactor: 1.0,
      baselineTokens: 0,
      currentTokens: 0,
      turnCount,
      totalTokens,
      estimatedSavings: 0,
      driftRate,
      driftRateLabel,
    };
  }

  const firstSlice = turns.slice(0, SAMPLE_SIZE);
  const lastSlice = turns.slice(-SAMPLE_SIZE);

  const baselineTokens = Math.round(
    firstSlice.reduce((sum, t) => sum + t.totalTokens, 0) / SAMPLE_SIZE,
  );
  const currentTokens = Math.round(
    lastSlice.reduce((sum, t) => sum + t.totalTokens, 0) / SAMPLE_SIZE,
  );

  if (baselineTokens === 0) {
    return {
      driftFactor: 1.0,
      baselineTokens,
      currentTokens,
      turnCount,
      totalTokens,
      estimatedSavings: 0,
      driftRate,
      driftRateLabel,
    };
  }

  const driftFactor = Math.round((currentTokens / baselineTokens) * 10) / 10;

  let estimatedSavings = 0;
  if (driftFactor > 2) {
    // Tokens spent beyond a 2x drift threshold could be reclaimed by rotating the session
    estimatedSavings = Math.max(0, totalTokens - turnCount * baselineTokens * 2);
  }

  return {
    driftFactor,
    baselineTokens,
    currentTokens,
    turnCount,
    totalTokens,
    estimatedSavings,
    driftRate,
    driftRateLabel,
  };
}
