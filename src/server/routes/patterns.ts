/**
 * GET /api/patterns?window=today|7d|30d
 * Returns a PatternsResponse aggregated across all sessions in the current
 * Claude home directory within the requested time window.
 */
import { Router } from 'express';
import { computeRollup } from '../rollup.js';
import { createSummaryCache } from '../summary-cache.js';
import { getClaudeHome } from '../config.js';
import type { PatternsResponse } from '../../shared/types.js';

const VALID_WINDOWS = new Set(['today', '7d', '30d']);

// Module-level cache shared across requests (lives for the duration of the process)
const summaryCache = createSummaryCache();

/**
 * Build the Express router for the patterns endpoint.
 * Accepts an optional claudeHome override (used in tests).
 */
export function buildPatternsRouter(claudeHomeOverride?: string): Router {
  const router = Router();

  /**
   * GET /patterns
   * Query params:
   *   window — 'today' | '7d' | '30d' (default '7d')
   */
  router.get('/', async (req, res) => {
    const raw = req.query['window'];
    const windowKind = typeof raw === 'string' ? raw : '7d';

    if (!VALID_WINDOWS.has(windowKind)) {
      res.status(400).json({ error: `Invalid window "${windowKind}". Must be one of: today, 7d, 30d` });
      return;
    }

    try {
      const claudeHome = claudeHomeOverride ?? getClaudeHome();
      const result: PatternsResponse = await computeRollup(
        windowKind as 'today' | '7d' | '30d',
        summaryCache,
        claudeHome,
      );
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
