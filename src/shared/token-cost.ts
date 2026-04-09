/**
 * Token cost estimation utilities for Claude models.
 * Pricing is based on Claude's public API pricing (USD per million tokens).
 */

/** Per-million-token pricing for a model tier */
export interface TokenPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheCreatePerMTok: number;
}

/** Sonnet pricing (default) */
const SONNET_PRICING: TokenPricing = {
  inputPerMTok: 3.00,
  outputPerMTok: 15.00,
  cacheReadPerMTok: 0.30,
  cacheCreatePerMTok: 3.75,
};

/** Opus pricing */
const OPUS_PRICING: TokenPricing = {
  inputPerMTok: 15.00,
  outputPerMTok: 75.00,
  cacheReadPerMTok: 1.50,
  cacheCreatePerMTok: 18.75,
};

/** Haiku pricing */
const HAIKU_PRICING: TokenPricing = {
  inputPerMTok: 0.80,
  outputPerMTok: 4.00,
  cacheReadPerMTok: 0.08,
  cacheCreatePerMTok: 1.00,
};

/**
 * Returns pricing for a given model name.
 * Defaults to Sonnet pricing when the model is null or unrecognized.
 */
export function getPricing(modelName: string | null): TokenPricing {
  if (!modelName) return SONNET_PRICING;
  const lower = modelName.toLowerCase();
  if (lower.includes('opus')) return OPUS_PRICING;
  if (lower.includes('haiku')) return HAIKU_PRICING;
  // Sonnet and any unknown model default to Sonnet pricing
  return SONNET_PRICING;
}

/**
 * Computes the estimated cost in USD for a single assistant turn.
 *
 * @param pricing - The per-MTok pricing for the model
 * @param input - Raw input tokens (non-cached)
 * @param output - Output tokens
 * @param cacheRead - Cache read tokens (default 0)
 * @param cacheCreate - Cache creation tokens (default 0)
 * @returns Estimated cost in USD
 */
export function computeCost(
  pricing: TokenPricing,
  input: number,
  output: number,
  cacheRead = 0,
  cacheCreate = 0,
): number {
  const M = 1_000_000;
  return (
    (input * pricing.inputPerMTok) / M +
    (output * pricing.outputPerMTok) / M +
    (cacheRead * pricing.cacheReadPerMTok) / M +
    (cacheCreate * pricing.cacheCreatePerMTok) / M
  );
}

/**
 * Formats a cost value in USD to a human-readable string.
 * Uses fixed 4 decimal places for very small values, 2 for larger ones.
 */
export function formatCost(cost: number): string {
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(4)}`;
}
