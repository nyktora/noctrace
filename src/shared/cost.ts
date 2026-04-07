/**
 * Session cost estimation from token usage.
 * Pure module: no file I/O, no side effects.
 * Pricing is based on Anthropic's public API rates as of April 2026.
 */
import type { AssistantTurn, SessionCost } from './types.js';

/** Per-token pricing in USD (per million tokens) */
interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWritePerMillion: number;
  cacheReadPerMillion: number;
}

const PRICING: Record<string, ModelPricing> = {
  opus: {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheWritePerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  sonnet: {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  haiku: {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheWritePerMillion: 1,
    cacheReadPerMillion: 0.08,
  },
};

/** Default model to use when the session log does not include model information. */
const DEFAULT_MODEL = 'sonnet';

/**
 * Resolve a model key from an arbitrary model string.
 * Matches on substring so `claude-3-7-sonnet-20250219` maps to `sonnet`.
 * Falls back to {@link DEFAULT_MODEL} when no match is found.
 */
function resolveModelKey(model?: string): string {
  if (model == null) return DEFAULT_MODEL;
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('haiku')) return 'haiku';
  if (lower.includes('sonnet')) return 'sonnet';
  return DEFAULT_MODEL;
}

/**
 * Compute the estimated USD cost for a session from its assistant turns.
 *
 * Sums token counts across all turns and applies per-million-token rates for
 * the resolved model tier. When `model` is omitted the default (sonnet) pricing
 * is used, reflecting the most common Claude Code model.
 *
 * @param turns - Array of {@link AssistantTurn} objects from {@link parseAssistantTurns}.
 * @param model - Optional model name or identifier string (e.g. `"claude-sonnet-4-5"`).
 * @returns A {@link SessionCost} breakdown with individual and total USD amounts.
 */
export function computeSessionCost(turns: AssistantTurn[], model?: string): SessionCost {
  const modelKey = resolveModelKey(model);
  const pricing = PRICING[modelKey] ?? PRICING[DEFAULT_MODEL]!;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalCacheReadTokens = 0;

  for (const turn of turns) {
    totalInputTokens += turn.inputTokens;
    totalOutputTokens += turn.outputTokens;
    totalCacheWriteTokens += turn.cacheCreationTokens;
    totalCacheReadTokens += turn.cacheReadTokens;
  }

  const inputCost = (totalInputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (totalOutputTokens / 1_000_000) * pricing.outputPerMillion;
  const cacheWriteCost = (totalCacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillion;
  const cacheReadCost = (totalCacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion;
  const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost;

  return {
    totalCost,
    inputCost,
    outputCost,
    cacheWriteCost,
    cacheReadCost,
    model: modelKey,
  };
}
