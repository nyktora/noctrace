/**
 * Unit tests for the claude-code Provider implementation.
 * Tests listSessions window filtering, readSession behaviour, and capabilities shape.
 */

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createClaudeCodeProvider } from '../../../src/shared/providers/claude-code.js';
import type { Provider } from '../../../src/shared/providers/provider.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid JSONL session string with a given ISO timestamp.
 */
function makeSession(timestamp: string): string {
  return JSON.stringify({
    type: 'system',
    sessionId: 'test-session',
    timestamp,
    uuid: 'uuid-1',
    parentUuid: null,
    subtype: 'init',
  }) + '\n' +
  JSON.stringify({
    type: 'assistant',
    sessionId: 'test-session',
    timestamp,
    uuid: 'uuid-2',
    parentUuid: 'uuid-1',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'echo hi' } }],
      usage: { input_tokens: 100, output_tokens: 10 },
    },
  }) + '\n' +
  JSON.stringify({
    type: 'user',
    sessionId: 'test-session',
    timestamp,
    uuid: 'uuid-3',
    parentUuid: 'uuid-2',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'hi' }] },
    isMeta: true,
  }) + '\n';
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpHome: string;
let provider: Provider;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'noctrace-test-'));
  provider = createClaudeCodeProvider(tmpHome);
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// capabilities
// ---------------------------------------------------------------------------

describe('capabilities', () => {
  it('returns expected shape', () => {
    expect(provider.capabilities).toEqual({
      toolCallGranularity: 'full',
      contextTracking: true,
      subAgents: true,
      realtime: true,
      tokenAccounting: 'per-turn',
    });
  });
});

// ---------------------------------------------------------------------------
// listSessions
// ---------------------------------------------------------------------------

describe('listSessions', () => {
  it('returns empty array when projects dir does not exist', async () => {
    const sessions = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(sessions).toEqual([]);
  });

  it('returns sessions within the time window', async () => {
    // Create a project with two session files and explicitly set their mtimes.
    const slug = '-Users-test-project';
    const projectDir = join(tmpHome, 'projects', slug);
    mkdirSync(projectDir, { recursive: true });

    const now = Date.now();
    const oldMs = now - 10_000;  // 10 sec ago
    const recentMs = now - 1_000; // 1 sec ago

    const oldPath = join(projectDir, 'old-session.jsonl');
    const recentPath = join(projectDir, 'recent-session.jsonl');

    writeFileSync(oldPath, makeSession(new Date(oldMs).toISOString()));
    writeFileSync(recentPath, makeSession(new Date(recentMs).toISOString()));

    // Explicitly set mtimes so the filtering is deterministic
    const { utimesSync } = await import('node:fs');
    utimesSync(oldPath, new Date(oldMs), new Date(oldMs));
    utimesSync(recentPath, new Date(recentMs), new Date(recentMs));

    // Window covers only the last 5 seconds
    const window = { startMs: now - 5_000, endMs: now + 60_000 };
    const sessions = await provider.listSessions(window);

    // Only the recent session's mtime falls in [now-5s, now+60s)
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe('recent-session');
  });

  it('returns correct provider and rawSlug', async () => {
    const slug = '-Users-test-project';
    const projectDir = join(tmpHome, 'projects', slug);
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'abc123.jsonl'), makeSession(new Date().toISOString()));

    const sessions = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].provider).toBe('claude-code');
    expect(sessions[0].rawSlug).toBe(`${slug}/abc123`);
    expect(sessions[0].projectContext).toBe('/Users/test/project');
  });

  it('skips non-jsonl files', async () => {
    const slug = 'my-project';
    const projectDir = join(tmpHome, 'projects', slug);
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'session.jsonl'), makeSession(new Date().toISOString()));
    writeFileSync(join(projectDir, 'sessions-index.json'), '{}');
    writeFileSync(join(projectDir, 'notes.txt'), 'hello');

    const sessions = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe('session');
  });

  it('filters out sessions outside the time window', async () => {
    const slug = 'my-project';
    const projectDir = join(tmpHome, 'projects', slug);
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'session.jsonl'), makeSession(new Date().toISOString()));

    // Window in the far future — nothing should match
    const sessions = await provider.listSessions({ startMs: Date.now() + 1e9, endMs: Date.now() + 2e9 });
    expect(sessions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// readSession
// ---------------------------------------------------------------------------

describe('readSession', () => {
  it('returns AgentSession with native WaterfallRow[] for a valid session', async () => {
    const slug = 'my-project';
    const projectDir = join(tmpHome, 'projects', slug);
    mkdirSync(projectDir, { recursive: true });
    const content = makeSession(new Date().toISOString());
    writeFileSync(join(projectDir, 'sess-abc.jsonl'), content);

    const session = await provider.readSession(`${slug}/sess-abc`);

    expect(session.meta.provider).toBe('claude-code');
    expect(session.meta.sessionId).toBe('test-session');
    expect(session.meta.rawSlug).toBe(`${slug}/sess-abc`);
    expect(Array.isArray(session.native)).toBe(true);
    expect((session.native as unknown[]).length).toBeGreaterThan(0);
  });

  it('throws for unknown session id', async () => {
    await expect(provider.readSession('nonexistent-slug/nonexistent-id')).rejects.toThrow();
  });

  it('throws for malformed id (no slash)', async () => {
    await expect(provider.readSession('no-slash-here')).rejects.toThrow(
      /Invalid Claude Code session id/,
    );
  });

  it('meta.projectContext de-slugifies the project path', async () => {
    const slug = '-Users-alice-projects-myapp';
    const projectDir = join(tmpHome, 'projects', slug);
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'sid.jsonl'), makeSession(new Date().toISOString()));

    const session = await provider.readSession(`${slug}/sid`);
    expect(session.meta.projectContext).toBe('/Users/alice/projects/myapp');
  });
});

// ---------------------------------------------------------------------------
// watch
// ---------------------------------------------------------------------------

describe('watch', () => {
  it('returns an unsubscribe function (Phase A no-op)', () => {
    const unsubscribe = provider.watch(() => { /* noop */ });
    expect(typeof unsubscribe).toBe('function');
    // Must not throw when called
    expect(() => unsubscribe()).not.toThrow();
  });
});
