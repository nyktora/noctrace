/**
 * Cross-session Patterns rollup orchestrator.
 * Lists session JSONL files, applies mtime pre-filter, parses + caches each,
 * and folds results into a PatternsResponse.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseJsonlContent } from '../shared/parser.js';
import {
  buildSessionSummaryFromContent,
  type PatternSessionSummary,
} from '../shared/session-summary.js';
import type { SummaryCache } from './summary-cache.js';
import type { PatternsResponse, HealthGrade } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Window math
// ---------------------------------------------------------------------------

/** Start of the local calendar day containing `nowMs`, in local time. */
function startOfDay(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface WindowBounds {
  startMs: number;
  endMs: number;
  prevStartMs: number;
  prevEndMs: number;
  label: string;
}

/** Compute window bounds using calendar semantics in server-local time. */
function computeWindow(kind: 'today' | '7d' | '30d', now: number): WindowBounds {
  const todayStart = startOfDay(now);
  const MS_PER_DAY = 86_400_000;

  let startMs: number;
  let spanDays: number;

  if (kind === 'today') {
    startMs = todayStart;
    spanDays = 1;
  } else if (kind === '7d') {
    startMs = todayStart - 6 * MS_PER_DAY;
    spanDays = 7;
  } else {
    startMs = todayStart - 29 * MS_PER_DAY;
    spanDays = 30;
  }

  const endMs = now;
  const prevEndMs = startMs;
  const prevStartMs = startMs - spanDays * MS_PER_DAY;

  const label = formatDateRange(startMs, endMs);

  return { startMs, endMs, prevStartMs, prevEndMs, label };
}

/** Format a date range as "Apr 7 – Apr 14, 2026". */
function formatDateRange(startMs: number, endMs: number): string {
  const fmt = (ms: number, withYear: boolean) => {
    const d = new Date(ms);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const base = `${months[d.getMonth()]} ${d.getDate()}`;
    return withYear ? `${base}, ${d.getFullYear()}` : base;
  };
  const start = new Date(startMs);
  const end = new Date(endMs);
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${fmt(startMs, false)} \u2013 ${fmt(endMs, sameYear)}`;
}

// ---------------------------------------------------------------------------
// Percentile helper
// ---------------------------------------------------------------------------

/** Compute the p-th percentile (0..100) of a numeric array via linear interpolation. */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

// ---------------------------------------------------------------------------
// Bounded-concurrency parallel execution
// ---------------------------------------------------------------------------

/** Run `tasks` in parallel chunks of `concurrency`. */
async function runChunked<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const chunk = tasks.slice(i, i + concurrency).map((t) => t());
    const batch = await Promise.all(chunk);
    results.push(...batch);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Project de-slugification
// ---------------------------------------------------------------------------

/**
 * Convert a Claude project slug to a human-readable path.
 * Algorithm: split on `-`, drop empty leading segment.
 * If first segment is `Users` and second matches the current user's username,
 * replace with `~`; otherwise join with `/`.
 */
function deslugify(slug: string, username: string): string {
  // Slugs use `-` as separator but project paths can contain hyphens too.
  // The slug is produced by replacing `/` with `-` in the absolute path,
  // e.g. /Users/lam/dev/noctrace → -Users-lam-dev-noctrace
  const parts = slug.split('-');
  // Drop the leading empty string before the first `-`
  if (parts[0] === '') parts.shift();
  if (parts.length === 0) return slug;

  if (parts[0] === 'Users' && parts[1] === username) {
    // Replace /Users/<user> with ~
    return '~/' + parts.slice(2).join('/');
  }

  return '/' + parts.join('/');
}

// ---------------------------------------------------------------------------
// File enumeration
// ---------------------------------------------------------------------------

interface SessionFile {
  filePath: string;
  slug: string;
  sessionId: string;
  mtimeMs: number;
}

/** List all *.jsonl session files under projectsDir with their mtime. */
async function listSessionFiles(projectsDir: string): Promise<SessionFile[]> {
  const result: SessionFile[] = [];

  let slugs: string[];
  try {
    slugs = await fs.readdir(projectsDir);
  } catch {
    // Directory doesn't exist — graceful degradation
    return result;
  }

  for (const slug of slugs) {
    const slugPath = path.join(projectsDir, slug);
    let slugStat;
    try {
      slugStat = await fs.stat(slugPath);
    } catch {
      continue;
    }
    if (!slugStat.isDirectory()) continue;

    let files: string[];
    try {
      files = await fs.readdir(slugPath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(slugPath, file);
      let fstat;
      try {
        fstat = await fs.stat(filePath);
      } catch {
        continue;
      }
      result.push({
        filePath,
        slug,
        sessionId: file.replace(/\.jsonl$/, ''),
        mtimeMs: fstat.mtimeMs,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compute the cross-session Patterns rollup for the given time window.
 *
 * @param window  - 'today' | '7d' | '30d'
 * @param cache   - mtime-invalidated summary cache
 * @param claudeHome - defaults to CLAUDE_HOME env or ~/.claude
 * @param now     - injectable for tests; defaults to Date.now()
 */
export async function computeRollup(
  window: 'today' | '7d' | '30d',
  cache: SummaryCache,
  claudeHome?: string,
  now?: number,
): Promise<PatternsResponse> {
  const nowMs = now ?? Date.now();
  const home = claudeHome ?? (process.env['CLAUDE_HOME'] ?? path.join(os.homedir(), '.claude'));
  const projectsDir = path.join(home, 'projects');
  const username = os.userInfo().username;

  const bounds = computeWindow(window, nowMs);
  const { startMs, endMs, prevStartMs, prevEndMs } = bounds;
  const MS_PER_DAY = 86_400_000;

  // List all session files
  const allFiles = await listSessionFiles(projectsDir);

  // Pre-filter by mtime: include files whose mtime is within window + 1-day slack
  // This is a fast pre-filter; we still check session startMs after parsing.
  const preFilterStart = prevStartMs - MS_PER_DAY;
  const currentCandidates = allFiles.filter(
    (f) => f.mtimeMs >= preFilterStart && f.mtimeMs <= endMs + MS_PER_DAY,
  );

  // Parse + cache each file
  const errors: Array<{ path: string; reason: string }> = [];

  const parsed = await runChunked(
    currentCandidates.map((sf) => async () => {
      const { summary, error } = await cache.getOrBuild(sf.filePath, async () => {
        let content: string;
        try {
          content = await fs.readFile(sf.filePath, 'utf8');
        } catch (err) {
          throw new Error(err instanceof Error ? err.message : String(err));
        }
        const rows = parseJsonlContent(content);
        return buildSessionSummaryFromContent(rows, sf.sessionId, sf.slug, content);
      });
      return { sf, summary, error };
    }),
    20,
  );

  // Collect errors and filter out failed parses
  const summaries: Array<{ sf: SessionFile; summary: PatternSessionSummary }> = [];
  for (const item of parsed) {
    if (item.error && item.summary === null) {
      errors.push({ path: item.sf.filePath, reason: item.error });
    } else if (item.summary !== null) {
      summaries.push({ sf: item.sf, summary: item.summary });
    }
  }

  // Separate current vs previous window by session start time
  const currentSummaries = summaries.filter(
    ({ summary }) => summary.startMs >= startMs && summary.startMs < endMs,
  );
  const prevSummaries = summaries.filter(
    ({ summary }) => summary.startMs >= prevStartMs && summary.startMs < prevEndMs,
  );

  // --- Health distribution ---
  const emptyDist = (): { A: number; B: number; C: number; D: number; F: number } =>
    ({ A: 0, B: 0, C: 0, D: 0, F: 0 });

  const currentDist = emptyDist();
  for (const { summary } of currentSummaries) {
    if (summary.healthGrade) currentDist[summary.healthGrade]++;
  }

  const prevDist = emptyDist();
  for (const { summary } of prevSummaries) {
    if (summary.healthGrade) prevDist[summary.healthGrade]++;
  }

  // --- Rot leaderboard ---
  type ProjectBucket = {
    sessions: PatternSessionSummary[];
  };
  const projectBuckets = new Map<string, ProjectBucket>();
  for (const { summary } of currentSummaries) {
    const bucket = projectBuckets.get(summary.projectSlug);
    if (bucket) {
      bucket.sessions.push(summary);
    } else {
      projectBuckets.set(summary.projectSlug, { sessions: [summary] });
    }
  }

  const BAD_GRADES = new Set<HealthGrade>(['D', 'F']);
  const rotLeaderboard: PatternsResponse['rotLeaderboard'] = [];

  for (const [slug, bucket] of projectBuckets) {
    const sessions = bucket.sessions;
    const badSessions = sessions.filter((s) => s.healthGrade && BAD_GRADES.has(s.healthGrade));
    const bad = badSessions.length;
    const badPct = sessions.length > 0 ? bad / sessions.length : 0;

    const totalCompactions = sessions.reduce((sum, s) => sum + s.compactionCount, 0);
    const avgCompactions = sessions.length > 0 ? totalCompactions / sessions.length : 0;

    // Worst session = lowest healthScore among sessions with a score
    let worstSessionId: string | null = null;
    let lowestScore = Infinity;
    for (const s of sessions) {
      if (s.healthScore !== null && s.healthScore < lowestScore) {
        lowestScore = s.healthScore;
        worstSessionId = s.sessionId;
      }
    }

    rotLeaderboard.push({
      project: deslugify(slug, username),
      rawSlug: slug,
      sessions: sessions.length,
      bad,
      badPct,
      avgCompactions,
      worstSessionId,
    });
  }

  // Sort by badPct descending, then calls descending as tiebreaker
  rotLeaderboard.sort((a, b) => {
    if (b.badPct !== a.badPct) return b.badPct - a.badPct;
    return b.sessions - a.sessions;
  });

  // --- Tool health ---
  // Aggregate tool stats from current window
  const toolAgg = new Map<
    string,
    { calls: number; failures: number; latencies: number[] }
  >();
  for (const { summary } of currentSummaries) {
    for (const [tool, count] of Object.entries(summary.toolCounts)) {
      const agg = toolAgg.get(tool) ?? { calls: 0, failures: 0, latencies: [] };
      agg.calls += count;
      agg.failures += summary.toolFailures[tool] ?? 0;
      agg.latencies.push(...(summary.toolLatencies[tool] ?? []));
      toolAgg.set(tool, agg);
    }
  }

  // Aggregate call counts from previous window for delta
  const prevToolCalls = new Map<string, number>();
  for (const { summary } of prevSummaries) {
    for (const [tool, count] of Object.entries(summary.toolCounts)) {
      prevToolCalls.set(tool, (prevToolCalls.get(tool) ?? 0) + count);
    }
  }

  // Only include tools with >= 10 calls in current window
  const toolHealth: PatternsResponse['toolHealth'] = [];
  for (const [tool, agg] of toolAgg) {
    if (agg.calls < 10) continue;
    toolHealth.push({
      tool,
      calls: agg.calls,
      failures: agg.failures,
      failPct: agg.calls > 0 ? agg.failures / agg.calls : 0,
      p50ms: Math.round(percentile(agg.latencies, 50)),
      p95ms: Math.round(percentile(agg.latencies, 95)),
      callsPrev: prevToolCalls.get(tool) ?? 0,
    });
  }

  // Sort by failPct descending, then calls descending
  toolHealth.sort((a, b) => {
    if (b.failPct !== a.failPct) return b.failPct - a.failPct;
    return b.calls - a.calls;
  });

  return {
    window: {
      kind: window,
      startMs,
      endMs,
      prevStartMs,
      prevEndMs,
      label: bounds.label,
    },
    sessionCounts: {
      current: currentSummaries.length,
      previous: prevSummaries.length,
    },
    healthDist: {
      current: currentDist,
      previous: prevDist,
    },
    rotLeaderboard,
    toolHealth,
    errors,
  };
}
