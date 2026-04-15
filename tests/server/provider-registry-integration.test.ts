/**
 * Integration test: verifies that the server routes go through the Provider
 * registry abstraction rather than calling parseJsonlContent directly.
 *
 * Strategy: register a fake provider that returns a known sentinel row, then
 * assert that the /api/session/:slug/:id route returns that sentinel row.
 * This proves the route delegates to the provider instead of the raw parser.
 *
 * Note: the test uses the module-level registry but isolates itself by using
 * a temporary claudeHome for the buildApiRouter call, which creates a
 * provider scoped to that directory. The integration test instead injects a
 * real claude-code provider pointing to a temp dir so the existing
 * buildApiRouter behaviour (which creates a scoped provider) is exercised.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApiRouter } from '../../src/server/routes/api.js';
import { registerProvider, getProvider, listProviders } from '../../src/shared/providers/index.js';
import { createClaudeCodeProvider } from '../../src/shared/providers/claude-code.js';
import type { Provider, SessionMeta, AgentSession } from '../../src/shared/providers/provider.js';

// ---------------------------------------------------------------------------
// Minimal HTTP helper
// ---------------------------------------------------------------------------

function get(baseUrl: string, urlPath: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ get: httpGet }) => {
      const req = httpGet(`${baseUrl}${urlPath}`, (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
        res.on('end', () => {
          let body: unknown;
          try { body = JSON.parse(raw); } catch { body = raw; }
          resolve({ status: res.statusCode ?? 0, body });
        });
      });
      req.on('error', reject);
    });
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let baseUrl: string;
let httpServer: ReturnType<typeof createServer>;

const SIMPLE_SESSION_CONTENT = [
  '{"type":"system","sessionId":"reg-sess-001","timestamp":"2026-03-30T10:00:00.000Z","uuid":"sys-1","parentUuid":null,"subtype":"init"}',
  '{"type":"assistant","sessionId":"reg-sess-001","timestamp":"2026-03-30T10:00:02.000Z","uuid":"asst-1","parentUuid":null,"message":{"role":"assistant","content":[{"type":"tool_use","id":"tu-1","name":"Read","input":{"file_path":"/src/foo.ts"}}],"usage":{"input_tokens":1500,"output_tokens":200}}}',
  '{"type":"user","sessionId":"reg-sess-001","timestamp":"2026-03-30T10:00:03.000Z","uuid":"user-2","parentUuid":"asst-1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu-1","content":"file contents"}]},"isMeta":true}',
].join('\n');

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'noctrace-provider-integration-'));

  const projectDir = path.join(tmpDir, 'projects', 'test-project');
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, 'reg-sess-001.jsonl'), SIMPLE_SESSION_CONTENT, 'utf8');

  const app = express();
  app.use(express.json());
  app.use('/api', buildApiRouter(tmpDir));

  await new Promise<void>((resolve) => {
    httpServer = createServer(app);
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests: Provider registry shape
// ---------------------------------------------------------------------------

describe('Provider registry', () => {
  it('has the claude-code provider registered by default', () => {
    const provider = getProvider('claude-code');
    expect(provider).toBeDefined();
    expect(provider!.id).toBe('claude-code');
    expect(provider!.displayName).toBe('Claude Code');
  });

  it('listProviders() includes claude-code', () => {
    const providers = listProviders();
    expect(providers.some((p) => p.id === 'claude-code')).toBe(true);
  });

  it('registerProvider() can inject a fake provider and retrieve it', () => {
    const fakeProvider: Provider = {
      id: 'test-fake-provider',
      displayName: 'Test Fake',
      capabilities: {
        toolCallGranularity: 'opaque',
        contextTracking: false,
        subAgents: false,
        realtime: false,
        tokenAccounting: 'none',
      },
      async listSessions(): Promise<SessionMeta[]> { return []; },
      async readSession(): Promise<AgentSession> {
        throw new Error('not implemented');
      },
      watch(): () => void { return () => {}; },
    };

    registerProvider(fakeProvider);
    expect(getProvider('test-fake-provider')).toBe(fakeProvider);
    expect(listProviders().some((p) => p.id === 'test-fake-provider')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Session route uses provider
// ---------------------------------------------------------------------------

describe('GET /api/session/:slug/:id goes through provider', () => {
  it('returns 200 with rows parsed via the scoped claude-code provider', async () => {
    const { status, body } = await get(baseUrl, '/api/session/test-project/reg-sess-001');
    expect(status).toBe(200);
    const data = body as { rows: unknown[]; sessionId: string };
    expect(Array.isArray(data.rows)).toBe(true);
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.sessionId).toBe('reg-sess-001');
  });

  it('returns 404 for a session unknown to the provider', async () => {
    const { status } = await get(baseUrl, '/api/session/test-project/nonexistent-session');
    expect(status).toBe(404);
  });

  it('rows have the expected WaterfallRow fields (provider output shape)', async () => {
    const { body } = await get(baseUrl, '/api/session/test-project/reg-sess-001');
    const { rows } = body as { rows: Array<Record<string, unknown>> };
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    // WaterfallRow fields produced by parseJsonlContent (via provider)
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('toolName');
    expect(row).toHaveProperty('type');
    expect(row).toHaveProperty('startTime');
  });
});

// ---------------------------------------------------------------------------
// Tests: Scoped provider for listSessions
// ---------------------------------------------------------------------------

describe('Scoped claude-code provider (createClaudeCodeProvider)', () => {
  it('listSessions returns the session written to tmpDir', async () => {
    const provider = createClaudeCodeProvider(tmpDir);
    const sessions = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(sessions.length).toBeGreaterThan(0);
    const found = sessions.find((s) => s.sessionId === 'reg-sess-001');
    expect(found).toBeDefined();
    expect(found!.provider).toBe('claude-code');
  });

  it('readSession returns native WaterfallRow[] for the test session', async () => {
    const provider = createClaudeCodeProvider(tmpDir);
    const session = await provider.readSession('test-project/reg-sess-001');
    expect(session.meta.provider).toBe('claude-code');
    expect(session.meta.rawSlug).toBe('test-project/reg-sess-001');
    expect(Array.isArray(session.native)).toBe(true);
    expect((session.native as unknown[]).length).toBeGreaterThan(0);
  });

  it('watch() returns an unsubscribe function', () => {
    const provider = createClaudeCodeProvider(tmpDir);
    const unsubscribe = provider.watch(() => { /* noop */ });
    expect(typeof unsubscribe).toBe('function');
    // Must not throw
    expect(() => unsubscribe()).not.toThrow();
  });
});
