/**
 * In-memory mtime-invalidated cache for per-session summaries.
 * Stat-on-read strategy: no background watcher needed.
 */
import fs from 'node:fs/promises';
import type { PatternSessionSummary } from '../shared/session-summary.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry {
  mtimeMs: number;
  summary: PatternSessionSummary | null;
}

/**
 * Stat-on-read summary cache keyed by absolute file path.
 * On each {@link SummaryCache.getOrBuild} call the file mtime is checked;
 * if it matches the cached value the stored summary is returned immediately
 * without re-parsing the file.
 */
export interface SummaryCache {
  /**
   * Return the cached summary for `path` if the file mtime has not changed,
   * otherwise invoke `build()` to (re-)parse it and cache the result.
   *
   * Returns `{ summary: null, error: 'stat-failed' }` when the file cannot be
   * stat'd (e.g. ENOENT).  Returns `{ summary: null, error: '<message>' }` when
   * `build()` throws — the failure is NOT cached so the next call retries.
   */
  getOrBuild(
    path: string,
    build: () => Promise<PatternSessionSummary | null>,
  ): Promise<{ summary: PatternSessionSummary | null; error?: string }>;

  /** Remove the cached entry for `path`, forcing a rebuild on next access. */
  invalidate(path: string): void;

  /** Return the number of entries currently in the cache. */
  size(): number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a new, empty {@link SummaryCache} instance.
 */
export function createSummaryCache(): SummaryCache {
  const store = new Map<string, CacheEntry>();

  return {
    async getOrBuild(
      filePath: string,
      build: () => Promise<PatternSessionSummary | null>,
    ): Promise<{ summary: PatternSessionSummary | null; error?: string }> {
      // Stat the file to get current mtime
      let statResult: { mtimeMs: number };
      try {
        statResult = await fs.stat(filePath);
      } catch {
        // File not accessible — treat as invalidated
        store.delete(filePath);
        return { summary: null, error: 'stat-failed' };
      }

      const { mtimeMs } = statResult;
      const cached = store.get(filePath);
      if (cached !== undefined && cached.mtimeMs === mtimeMs) {
        return { summary: cached.summary };
      }

      // Cache miss or stale — rebuild
      let summary: PatternSessionSummary | null;
      try {
        summary = await build();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        // Do NOT cache failed builds — let the next call retry
        return { summary: null, error: reason };
      }

      store.set(filePath, { mtimeMs, summary });
      return { summary };
    },

    invalidate(filePath: string): void {
      store.delete(filePath);
    },

    size(): number {
      return store.size;
    },
  };
}
