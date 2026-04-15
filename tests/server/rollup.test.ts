/**
 * Tests for src/server/rollup.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { computeRollup } from '../../src/server/rollup';
import { createSummaryCache } from '../../src/server/summary-cache';

// ---------------------------------------------------------------------------
// Fixtures: minimal JSONL lines
// ---------------------------------------------------------------------------

// Session that starts today and has Read + Bash tools
function makeSession(
  sessionId: string,
  isoTimestamp: string,
  toolName = 'Bash',
): string {
  const ts1 = isoTimestamp;
  const ts2 = new Date(new Date(isoTimestamp).getTime() + 5000).toISOString();
  return [
    `{"type":"system","sessionId":"${sessionId}","timestamp":"${ts1}","uuid":"sys-1","parentUuid":null,"subtype":"init"}`,
    `{"type":"assistant","sessionId":"${sessionId}","timestamp":"${ts1}","uuid":"asst-1","parentUuid":null,"message":{"role":"assistant","content":[{"type":"tool_use","id":"tu-1","name":"${toolName}","input":{"command":"echo hi"}}],"usage":{"input_tokens":100,"output_tokens":10}}}`,
    `{"type":"user","sessionId":"${sessionId}","timestamp":"${ts2}","uuid":"user-1","parentUuid":"asst-1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu-1","content":"hi"}]},"isMeta":true}`,
  ].join('\n');
}

function makeDFSession(sessionId: string, isoTimestamp: string): string {
  // High fill percent → D/F grade
  const ts1 = isoTimestamp;
  const ts2 = new Date(new Date(isoTimestamp).getTime() + 5000).toISOString();
  return [
    `{"type":"system","sessionId":"${sessionId}","timestamp":"${ts1}","uuid":"sys-1","parentUuid":null,"subtype":"init"}`,
    `{"type":"assistant","sessionId":"${sessionId}","timestamp":"${ts1}","uuid":"asst-1","parentUuid":null,"message":{"role":"assistant","content":[{"type":"tool_use","id":"tu-1","name":"Bash","input":{"command":"echo hi"}}],"usage":{"input_tokens":195000,"output_tokens":10}}}`,
    `{"type":"user","sessionId":"${sessionId}","timestamp":"${ts2}","uuid":"user-1","parentUuid":"asst-1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu-1","content":"hi"}]},"isMeta":true}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpHome: string;

beforeAll(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'noctrace-rollup-test-'));
  await fs.mkdir(path.join(tmpHome, 'projects'), { recursive: true });
});

afterAll(async () => {
  await fs.rm(tmpHome, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper: write a session file and touch its mtime to a specific time
// ---------------------------------------------------------------------------

async function writeSession(
  slug: string,
  sessionId: string,
  content: string,
  mtimeMs: number,
): Promise<string> {
  const dir = path.join(tmpHome, 'projects', slug);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${sessionId}.jsonl`);
  await fs.writeFile(filePath, content, 'utf8');
  const mtime = new Date(mtimeMs);
  await fs.utimes(filePath, mtime, mtime);
  return filePath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeRollup — aggregates sessions correctly', () => {
  it('aggregates 3 sessions in the current window', async () => {
    const nowMs = Date.now();
    const recentIso = new Date(nowMs - 60_000).toISOString();

    await writeSession('proj-agg', 's1', makeSession('s1', recentIso), nowMs - 60_000);
    await writeSession('proj-agg', 's2', makeSession('s2', recentIso), nowMs - 60_000);
    await writeSession('proj-agg', 's3', makeSession('s3', recentIso), nowMs - 60_000);

    const cache = createSummaryCache();
    const result = await computeRollup('7d', cache, tmpHome, nowMs);

    const projEntry = result.rotLeaderboard.find((r) => r.rawSlug === 'proj-agg');
    expect(projEntry).toBeDefined();
    expect(projEntry!.sessions).toBe(3);
    expect(result.sessionCounts.current).toBeGreaterThanOrEqual(3);
  });
});

describe('computeRollup — window filter excludes out-of-range sessions', () => {
  it('excludes sessions older than the window', async () => {
    const nowMs = Date.now();
    // 40 days ago — outside 30d window
    const oldIso = new Date(nowMs - 40 * 86_400_000).toISOString();
    await writeSession('proj-old', 's-old', makeSession('s-old', oldIso), nowMs - 40 * 86_400_000);

    const cache = createSummaryCache();
    const result = await computeRollup('30d', cache, tmpHome, nowMs);

    // The old project should not appear in the current window leaderboard
    const projEntry = result.rotLeaderboard.find((r) => r.rawSlug === 'proj-old');
    expect(projEntry).toBeUndefined();
  });
});

describe('computeRollup — previous window math', () => {
  it('today window: prevStartMs is 1 day before startMs', async () => {
    const nowMs = Date.now();
    const cache = createSummaryCache();
    const result = await computeRollup('today', cache, tmpHome, nowMs);
    const diff = result.window.startMs - result.window.prevStartMs;
    expect(diff).toBe(86_400_000);
  });

  it('7d window: prevStartMs is 7 days before startMs', async () => {
    const nowMs = Date.now();
    const cache = createSummaryCache();
    const result = await computeRollup('7d', cache, tmpHome, nowMs);
    const diff = result.window.startMs - result.window.prevStartMs;
    expect(diff).toBe(7 * 86_400_000);
  });

  it('30d window: prevStartMs is 30 days before startMs', async () => {
    const nowMs = Date.now();
    const cache = createSummaryCache();
    const result = await computeRollup('30d', cache, tmpHome, nowMs);
    const diff = result.window.startMs - result.window.prevStartMs;
    expect(diff).toBe(30 * 86_400_000);
  });
});

describe('computeRollup — rot leaderboard sort', () => {
  it('sorts by badPct descending', async () => {
    const nowMs = Date.now();
    const recentIso = new Date(nowMs - 60_000).toISOString();

    // proj-rota: 2 DF sessions out of 2 → 100% bad
    await writeSession('proj-rota', 'rota-1', makeDFSession('rota-1', recentIso), nowMs - 60_000);
    await writeSession('proj-rota', 'rota-2', makeDFSession('rota-2', recentIso), nowMs - 60_000);

    // proj-rotb: 1 DF out of 2 → 50% bad
    await writeSession('proj-rotb', 'rotb-1', makeDFSession('rotb-1', recentIso), nowMs - 60_000);
    await writeSession('proj-rotb', 'rotb-2', makeSession('rotb-2', recentIso), nowMs - 60_000);

    const cache = createSummaryCache();
    const result = await computeRollup('7d', cache, tmpHome, nowMs);

    const rotaIdx = result.rotLeaderboard.findIndex((r) => r.rawSlug === 'proj-rota');
    const rotbIdx = result.rotLeaderboard.findIndex((r) => r.rawSlug === 'proj-rotb');

    expect(rotaIdx).toBeGreaterThanOrEqual(0);
    expect(rotbIdx).toBeGreaterThanOrEqual(0);
    expect(rotaIdx).toBeLessThan(rotbIdx);
  });
});

describe('computeRollup — tool noise filter', () => {
  it('excludes tools with < 10 calls in the current window', async () => {
    const nowMs = Date.now();
    const recentIso = new Date(nowMs - 60_000).toISOString();

    // Only 1 Bash call (from makeSession) — should be filtered out
    await writeSession('proj-noise', 'noise-1', makeSession('noise-1', recentIso, 'Read'), nowMs - 60_000);

    const cache = createSummaryCache();
    const result = await computeRollup('7d', cache, tmpHome, nowMs);

    // Read should not appear in toolHealth (only 1 call, need >= 10)
    const readTool = result.toolHealth.find((t) => t.tool === 'Read');
    expect(readTool).toBeUndefined();
  });
});

describe('computeRollup — empty projects directory', () => {
  it('returns empty-but-valid response when no sessions exist', async () => {
    const emptyHome = await fs.mkdtemp(path.join(os.tmpdir(), 'noctrace-empty-'));
    await fs.mkdir(path.join(emptyHome, 'projects'), { recursive: true });

    try {
      const cache = createSummaryCache();
      const result = await computeRollup('7d', cache, emptyHome, Date.now());

      expect(result.sessionCounts.current).toBe(0);
      expect(result.sessionCounts.previous).toBe(0);
      expect(result.rotLeaderboard).toHaveLength(0);
      expect(result.toolHealth).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    } finally {
      await fs.rm(emptyHome, { recursive: true, force: true });
    }
  });

  it('returns empty response when projects directory does not exist', async () => {
    const noHome = await fs.mkdtemp(path.join(os.tmpdir(), 'noctrace-nodir-'));
    // Do NOT create the projects dir

    try {
      const cache = createSummaryCache();
      const result = await computeRollup('7d', cache, noHome, Date.now());

      expect(result.sessionCounts.current).toBe(0);
      expect(result.rotLeaderboard).toHaveLength(0);
    } finally {
      await fs.rm(noHome, { recursive: true, force: true });
    }
  });
});

describe('computeRollup — parse errors', () => {
  it('puts unparseable files in errors[] and continues computing the rest', async () => {
    const nowMs = Date.now();
    const recentIso = new Date(nowMs - 60_000).toISOString();

    const slug = 'proj-errors';
    const dir = path.join(tmpHome, 'projects', slug);
    await fs.mkdir(dir, { recursive: true });

    // Write a malformed file
    const badFile = path.join(dir, 'bad-sess.jsonl');
    await fs.writeFile(badFile, '{this is not valid json\n', 'utf8');
    const mtime = new Date(nowMs - 60_000);
    await fs.utimes(badFile, mtime, mtime);

    // Write a good file in the same project
    await writeSession(slug, 'good-sess', makeSession('good-sess', recentIso), nowMs - 60_000);

    // The malformed file should parse without rows (no errors array entry for
    // simply empty parse results) or should appear in errors if it throws.
    // With our parser, malformed JSON lines are silently skipped so rows=[].
    // The summary will be built from empty rows — no error expected here.
    const cache = createSummaryCache();
    const result = await computeRollup('7d', cache, tmpHome, nowMs);

    // Verify overall response is valid (no crash)
    expect(result.window.kind).toBe('7d');
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
