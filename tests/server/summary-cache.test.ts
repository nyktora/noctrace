/**
 * Tests for src/server/summary-cache.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSummaryCache } from '../../src/server/summary-cache';
import type { PatternSessionSummary } from '../../src/shared/session-summary';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSummary(sessionId: string): PatternSessionSummary {
  return {
    sessionId,
    projectSlug: 'test-project',
    startMs: 1000,
    endMs: 2000,
    primaryModel: null,
    healthGrade: 'A',
    healthScore: 90,
    toolCounts: { Bash: 1 },
    toolFailures: {},
    toolLatencies: { Bash: [500] },
    compactionCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let tmpDir: string;
let testFile: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'noctrace-cache-test-'));
  testFile = path.join(tmpDir, 'session.jsonl');
  await fs.writeFile(testFile, 'placeholder', 'utf8');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('createSummaryCache', () => {
  it('calls build on cache miss and returns the summary', async () => {
    const cache = createSummaryCache();
    const expected = makeSummary('sess-1');
    const build = vi.fn(async () => expected);

    const { summary, error } = await cache.getOrBuild(testFile, build);

    expect(build).toHaveBeenCalledOnce();
    expect(error).toBeUndefined();
    expect(summary).toEqual(expected);
  });

  it('does NOT call build on cache hit with same mtime', async () => {
    const cache = createSummaryCache();
    const expected = makeSummary('sess-1');
    const build = vi.fn(async () => expected);

    // First call — cache miss
    await cache.getOrBuild(testFile, build);
    // Second call — should be a cache hit
    const { summary } = await cache.getOrBuild(testFile, build);

    expect(build).toHaveBeenCalledOnce();
    expect(summary).toEqual(expected);
  });

  it('calls build again when mtime changes', async () => {
    const cache = createSummaryCache();
    const first = makeSummary('sess-1');
    const second = makeSummary('sess-2');
    const build = vi.fn(async () => first).mockResolvedValueOnce(first);
    const build2 = vi.fn(async () => second);

    // First call — cache miss
    await cache.getOrBuild(testFile, build);

    // Modify the file to change mtime (add a small sleep to ensure mtime differs)
    await new Promise((r) => setTimeout(r, 10));
    await fs.writeFile(testFile, 'updated content', 'utf8');

    // Second call with stale mtime — should rebuild
    const { summary } = await cache.getOrBuild(testFile, build2);

    expect(build2).toHaveBeenCalledOnce();
    expect(summary).toEqual(second);
  });

  it('returns stat-failed error gracefully when file does not exist', async () => {
    const cache = createSummaryCache();
    const build = vi.fn(async () => makeSummary('x'));
    const nonExistent = path.join(tmpDir, 'does-not-exist.jsonl');

    const { summary, error } = await cache.getOrBuild(nonExistent, build);

    expect(summary).toBeNull();
    expect(error).toBe('stat-failed');
    expect(build).not.toHaveBeenCalled();
  });

  it('returns error and does NOT cache when build throws', async () => {
    const cache = createSummaryCache();
    const build = vi.fn(async () => {
      throw new Error('parse failed');
    });

    const { summary, error } = await cache.getOrBuild(testFile, build);

    expect(summary).toBeNull();
    expect(error).toBe('parse failed');
    // size should be 0 — failure was not cached
    expect(cache.size()).toBe(0);
  });

  it('size() returns the number of cached entries', async () => {
    const cache = createSummaryCache();
    expect(cache.size()).toBe(0);

    const file2 = path.join(tmpDir, 'session2.jsonl');
    await fs.writeFile(file2, 'data', 'utf8');

    await cache.getOrBuild(testFile, async () => makeSummary('a'));
    expect(cache.size()).toBe(1);

    await cache.getOrBuild(file2, async () => makeSummary('b'));
    expect(cache.size()).toBe(2);
  });

  it('invalidate removes the entry so the next call rebuilds', async () => {
    const cache = createSummaryCache();
    const build = vi.fn(async () => makeSummary('sess-inv'));

    await cache.getOrBuild(testFile, build);
    expect(cache.size()).toBe(1);

    cache.invalidate(testFile);
    expect(cache.size()).toBe(0);

    await cache.getOrBuild(testFile, build);
    expect(build).toHaveBeenCalledTimes(2);
  });
});
