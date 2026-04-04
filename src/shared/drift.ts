/**
 * Token drift analysis for Claude Code sessions.
 * Measures how per-turn token cost drifts from baseline over session lifetime.
 * Pure module: no file I/O, no side effects.
 */
import type { AssistantTurn, DriftAnalysis } from './types.js';

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
 * Compute token drift factor from assistant turns.
 *
 * Compares the average total tokens of the first {@link SAMPLE_SIZE} turns
 * (baseline) against the last {@link SAMPLE_SIZE} turns (current).
 * Returns a {@link DriftAnalysis} with `driftFactor = 1.0` when there is
 * insufficient data or when baseline is zero (guards against division by zero).
 */
export function computeDrift(turns: AssistantTurn[]): DriftAnalysis {
  const turnCount = turns.length;
  const totalTokens = turns.reduce((sum, t) => sum + t.totalTokens, 0);

  if (turnCount < SAMPLE_SIZE) {
    return {
      driftFactor: 1.0,
      baselineTokens: 0,
      currentTokens: 0,
      turnCount,
      totalTokens,
      estimatedSavings: 0,
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
  };
}
