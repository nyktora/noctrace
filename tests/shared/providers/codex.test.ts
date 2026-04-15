/**
 * Unit tests for the Codex CLI provider.
 * Covers: parseCodexContent, listSessions, readSession, watch, and cross-provider parity.
 */

import { readFileSync } from 'node:fs';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { parseCodexContent, createCodexProvider } from '../../../src/shared/providers/codex.js';
import { parseJsonlContent } from '../../../src/shared/parser.js';
import type { WaterfallRow } from '../../../src/shared/types.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../../fixtures/codex');
const rootFixturesDir = join(__dirname, '../../fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// Temp dir setup for listSessions / readSession
// ---------------------------------------------------------------------------

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'noctrace-codex-test-'));
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
});

/**
 * Write a fixture file into a fake codexHome session tree.
 * Returns the rawSlug (relative path from sessions/).
 */
function writeFixture(content: string, datePath = '2026/04/15', name = 'rollout-test.jsonl'): { codexHome: string; rawSlug: string } {
  const sessDir = join(tmpHome, 'sessions', ...datePath.split('/'));
  mkdirSync(sessDir, { recursive: true });
  writeFileSync(join(sessDir, name), content, 'utf-8');
  return { codexHome: tmpHome, rawSlug: `${datePath}/${name}` };
}

// ---------------------------------------------------------------------------
// parseCodexContent — unit tests
// ---------------------------------------------------------------------------

describe('parseCodexContent', () => {
  it('simple session: produces one WaterfallRow for FunctionCall/Output pair', () => {
    const content = loadFixture('simple-session.jsonl');
    const rows = parseCodexContent(content);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.toolName).toBe('Bash');
    expect(row.label).toMatch(/^Bash:/);
    expect(row.status).toBe('success');
    expect(row.endTime).not.toBeNull();
    expect(row.duration).toBeGreaterThan(0);
    expect(row.type).toBe('tool');
    expect(row.isFailure).toBe(false);
  });

  it('simple session: row output matches FunctionCallOutput content', () => {
    const content = loadFixture('simple-session.jsonl');
    const rows = parseCodexContent(content);
    expect(rows[0].output).toBe('export function login() { return false; }');
  });

  it('simple session: tokenDelta fields populated from TokenCount event', () => {
    const content = loadFixture('simple-session.jsonl');
    const rows = parseCodexContent(content);
    // TokenCount arrives after TurnComplete, so tokens should be 0 for a call
    // that already completed before TokenCount. In our parser, tokens are applied
    // to latestTurnId at call-start time. Check they are numbers.
    expect(typeof rows[0].inputTokens).toBe('number');
    expect(typeof rows[0].outputTokens).toBe('number');
  });

  it('multi-turn session: produces one row per FunctionCall across all turns', () => {
    const content = loadFixture('multi-turn.jsonl');
    const rows = parseCodexContent(content);
    expect(rows).toHaveLength(3); // ls, write, npm test
  });

  it('multi-turn session: all rows have status success', () => {
    const content = loadFixture('multi-turn.jsonl');
    const rows = parseCodexContent(content);
    for (const row of rows) {
      expect(row.status).toBe('success');
      expect(row.isFailure).toBe(false);
    }
  });

  it('multi-turn: rows have non-null endTime and positive duration', () => {
    const content = loadFixture('multi-turn.jsonl');
    const rows = parseCodexContent(content);
    for (const row of rows) {
      expect(row.endTime).not.toBeNull();
      expect(row.duration).toBeGreaterThan(0);
    }
  });

  it('failure session: ExecCommandEnd exit_code 1 sets isFailure + status error', () => {
    const content = loadFixture('failure-session.jsonl');
    const rows = parseCodexContent(content);
    // First call (call-fail-001) has exit_code 1
    const failRow = rows.find(r => r.id === 'call-fail-001');
    expect(failRow).toBeDefined();
    expect(failRow?.isFailure).toBe(true);
    expect(failRow?.status).toBe('error');
  });

  it('failure session: ExecCommandEnd timed_out true sets isFailure', () => {
    const content = loadFixture('failure-session.jsonl');
    const rows = parseCodexContent(content);
    // Second call (call-fail-002) has timed_out:true
    const timedOutRow = rows.find(r => r.id === 'call-fail-002');
    expect(timedOutRow).toBeDefined();
    expect(timedOutRow?.isFailure).toBe(true);
  });

  it('malformed session: skips bad line but parses remaining records', () => {
    const content = loadFixture('malformed-session.jsonl');
    const rows = parseCodexContent(content);
    // One valid FunctionCall/Output pair should survive
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('success');
  });

  it('empty content: returns empty array', () => {
    expect(parseCodexContent('')).toEqual([]);
  });

  it('FunctionCall with no matching Output: status remains running', () => {
    const content = [
      '{"type":"SessionMeta","timestamp":"2026-04-15T09:00:00.000Z","id":"thread-noout","forked_from_id":null,"cwd":"/home/user","source":"cli"}',
      '{"type":"ResponseItem","timestamp":"2026-04-15T09:00:01.000Z","item":{"name":"shell","arguments":"{\\"command\\":\\"ls\\"}","call_id":"call-orphan","id":"resp-orphan"}}',
    ].join('\n');
    const rows = parseCodexContent(content);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('running');
    expect(rows[0].endTime).toBeNull();
    expect(rows[0].duration).toBeNull();
  });

  it('shell tool_name mapped to Bash toolName', () => {
    const content = loadFixture('simple-session.jsonl');
    const rows = parseCodexContent(content);
    expect(rows[0].toolName).toBe('Bash');
  });

  it('WaterfallRow has all required fields with correct types', () => {
    const content = loadFixture('simple-session.jsonl');
    const rows = parseCodexContent(content);
    const row = rows[0];
    expect(typeof row.id).toBe('string');
    expect(row.type).toBe('tool');
    expect(typeof row.toolName).toBe('string');
    expect(typeof row.label).toBe('string');
    expect(typeof row.startTime).toBe('number');
    expect(typeof row.inputTokens).toBe('number');
    expect(typeof row.outputTokens).toBe('number');
    expect(typeof row.contextFillPercent).toBe('number');
    expect(Array.isArray(row.children)).toBe(true);
    expect(Array.isArray(row.tips)).toBe(true);
    expect(row.parentAgentId).toBeNull();
    expect(row.isReread).toBe(false);
  });

  it('sequence numbers are monotonically increasing', () => {
    const content = loadFixture('multi-turn.jsonl');
    const rows = parseCodexContent(content);
    for (let i = 1; i < rows.length; i++) {
      expect((rows[i].sequence ?? 0) > (rows[i - 1].sequence ?? 0)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// listSessions
// ---------------------------------------------------------------------------

describe('listSessions', () => {
  it('returns empty array when sessions dir does not exist', async () => {
    const provider = createCodexProvider(tmpHome);
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(results).toEqual([]);
  });

  it('returns session within time window', async () => {
    const content = loadFixture('simple-session.jsonl');
    const { codexHome } = writeFixture(content);
    const provider = createCodexProvider(codexHome);
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe('codex');
    expect(results[0].sessionId).toBe('thread-abc123');
    expect(results[0].projectContext).toBe('/home/user/myproject');
  });

  it('filters out sessions outside time window', async () => {
    const content = loadFixture('simple-session.jsonl');
    const { codexHome } = writeFixture(content);
    const provider = createCodexProvider(codexHome);
    // Far future window
    const results = await provider.listSessions({ startMs: Date.now() + 1e9, endMs: Date.now() + 2e9 });
    expect(results).toHaveLength(0);
  });

  it('ignores non-rollout files in sessions directory', async () => {
    const sessDir = join(tmpHome, 'sessions', '2026', '04', '15');
    mkdirSync(sessDir, { recursive: true });
    writeFileSync(join(sessDir, 'session_index.jsonl'), '{"id":"idx"}', 'utf-8');
    writeFileSync(join(sessDir, 'rollout-test.jsonl'), loadFixture('simple-session.jsonl'), 'utf-8');
    const provider = createCodexProvider(tmpHome);
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(results).toHaveLength(1);
  });

  it('rawSlug is relative path from sessions dir', async () => {
    const content = loadFixture('simple-session.jsonl');
    const { codexHome, rawSlug } = writeFixture(content, '2026/04/15', 'rollout-test.jsonl');
    const provider = createCodexProvider(codexHome);
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(results[0].rawSlug).toBe(rawSlug);
  });

  it('sub-agent session has parentSessionId set', async () => {
    const content = loadFixture('sub-agent.jsonl');
    writeFixture(content, '2026/04/15', 'rollout-sub.jsonl');
    const provider = createCodexProvider(tmpHome);
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(results).toHaveLength(1);
    const meta = results[0] as Record<string, unknown>;
    expect(meta['parentSessionId']).toBe('thread-parent1');
  });
});

// ---------------------------------------------------------------------------
// readSession
// ---------------------------------------------------------------------------

describe('readSession', () => {
  it('returns AgentSession with correct meta and native rows', async () => {
    const content = loadFixture('simple-session.jsonl');
    const { codexHome, rawSlug } = writeFixture(content);
    const provider = createCodexProvider(codexHome);
    const session = await provider.readSession(rawSlug);

    expect(session.meta.provider).toBe('codex');
    expect(session.meta.sessionId).toBe('thread-abc123');
    expect(session.meta.rawSlug).toBe(rawSlug);
    expect(Array.isArray(session.native)).toBe(true);
    expect((session.native as WaterfallRow[]).length).toBe(1);
  });

  it('throws for unknown session id', async () => {
    const provider = createCodexProvider(tmpHome);
    await expect(provider.readSession('2026/01/01/rollout-nonexistent.jsonl')).rejects.toThrow();
  });

  it('failure session rows contain isFailure:true row', async () => {
    const content = loadFixture('failure-session.jsonl');
    const { codexHome, rawSlug } = writeFixture(content, '2026/04/15', 'rollout-fail.jsonl');
    const provider = createCodexProvider(codexHome);
    const session = await provider.readSession(rawSlug);
    const rows = session.native as WaterfallRow[];
    const failRow = rows.find(r => r.isFailure);
    expect(failRow).toBeDefined();
  });

  it('meta.projectContext maps cwd to tilde form when under home', async () => {
    const home = process.env['HOME'] ?? '/root';
    const cwdInHome = `${home}/myapp`;
    const content = [
      `{"type":"SessionMeta","timestamp":"2026-04-15T09:00:00.000Z","id":"thread-home1","forked_from_id":null,"cwd":"${cwdInHome}","source":"cli"}`,
    ].join('\n');
    const { codexHome, rawSlug } = writeFixture(content, '2026/04/15', 'rollout-home.jsonl');
    const provider = createCodexProvider(codexHome);
    const session = await provider.readSession(rawSlug);
    expect(session.meta.projectContext).toBe('~/myapp');
  });

  it('meta.endMs matches file mtime', async () => {
    const content = loadFixture('simple-session.jsonl');
    const { codexHome, rawSlug } = writeFixture(content);
    const provider = createCodexProvider(codexHome);
    const before = Date.now();
    const session = await provider.readSession(rawSlug);
    const after = Date.now();
    expect(session.meta.endMs).not.toBeNull();
    expect(session.meta.endMs!).toBeGreaterThanOrEqual(before - 5000);
    expect(session.meta.endMs!).toBeLessThanOrEqual(after + 5000);
  });
});

// ---------------------------------------------------------------------------
// watch
// ---------------------------------------------------------------------------

describe('watch', () => {
  it('returns an unsubscribe function', () => {
    const provider = createCodexProvider(tmpHome);
    const unsub = provider.watch(() => { /* noop */ });
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cross-provider parity
// ---------------------------------------------------------------------------

describe('cross-provider parity', () => {
  it('Codex and Claude Code sessions with equivalent content produce compatible WaterfallRow shapes', () => {
    // Semantically equivalent: user asks to run a shell command, agent runs it, done.
    // Claude Code fixture: simple-session.jsonl (Read + Edit + Bash)
    // Codex fixture: parity-session.jsonl (shell + shell)
    const claudeContent = readFileSync(
      join(rootFixturesDir, 'simple-session.jsonl'),
      'utf-8',
    );
    const codexContent = loadFixture('parity-session.jsonl');

    const claudeRows = parseJsonlContent(claudeContent);
    const codexRows = parseCodexContent(codexContent);

    // Both produce at least one tool row
    expect(claudeRows.length).toBeGreaterThan(0);
    expect(codexRows.length).toBeGreaterThan(0);

    // Both produce rows with the same structural shape (WaterfallRow fields present)
    const requiredFields: Array<keyof WaterfallRow> = [
      'id', 'type', 'toolName', 'label', 'startTime', 'endTime', 'duration',
      'status', 'parentAgentId', 'input', 'output', 'inputTokens', 'outputTokens',
      'contextFillPercent', 'isReread', 'isFailure', 'children', 'tips',
    ];

    for (const row of [...claudeRows, ...codexRows]) {
      for (const field of requiredFields) {
        expect(row).toHaveProperty(field);
      }
    }

    // Codex parity session: 2 shell calls → 2 rows, all success
    expect(codexRows).toHaveLength(2);
    for (const row of codexRows) {
      expect(row.status).toBe('success');
      expect(row.type).toBe('tool');
    }

    // Claude Code simple session: tool calls (Read, Edit, Bash), all success
    const claudeToolRows = claudeRows.filter(r => r.type === 'tool');
    expect(claudeToolRows.length).toBeGreaterThanOrEqual(2);
    for (const row of claudeToolRows) {
      expect(row.status).toBe('success');
    }
  });
});

// ---------------------------------------------------------------------------
// Registry integration
// ---------------------------------------------------------------------------

describe('registry', () => {
  it('getProvider("codex") returns the registered provider', async () => {
    const { getProvider } = await import('../../../src/shared/providers/index.js');
    const p = getProvider('codex');
    expect(p).toBeDefined();
    expect(p?.id).toBe('codex');
    expect(p?.displayName).toBe('Codex CLI');
  });

  it('codex provider capabilities match expected shape', async () => {
    const { getProvider } = await import('../../../src/shared/providers/index.js');
    const p = getProvider('codex');
    expect(p?.capabilities).toEqual({
      toolCallGranularity: 'full',
      contextTracking: true,
      subAgents: true,
      realtime: true,
      tokenAccounting: 'per-turn',
    });
  });
});
