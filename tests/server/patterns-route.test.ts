/**
 * Tests for GET /api/patterns route.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPatternsRouter } from '../../src/server/routes/patterns';

// ---------------------------------------------------------------------------
// Minimal HTTP helper (mirrors api.test.ts pattern)
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

let tmpHome: string;
let baseUrl: string;
let httpServer: ReturnType<typeof createServer>;

beforeAll(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'noctrace-patterns-test-'));
  await fs.mkdir(path.join(tmpHome, 'projects'), { recursive: true });

  const app = express();
  app.use(express.json());
  // Mount with claudeHome override so it reads from tmpHome
  app.use('/api/patterns', buildPatternsRouter(tmpHome));

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
  await fs.rm(tmpHome, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/patterns', () => {
  it('returns 200 with correct response shape for window=7d', async () => {
    const { status, body } = await get(baseUrl, '/api/patterns?window=7d');
    expect(status).toBe(200);

    const resp = body as Record<string, unknown>;
    expect(resp['window']).toBeDefined();
    expect(resp['sessionCounts']).toBeDefined();
    expect(resp['healthDist']).toBeDefined();
    expect(resp['rotLeaderboard']).toBeDefined();
    expect(resp['toolHealth']).toBeDefined();
    expect(resp['errors']).toBeDefined();
  });

  it('window field has correct kind and numeric timestamps', async () => {
    const { body } = await get(baseUrl, '/api/patterns?window=7d');
    const resp = body as Record<string, unknown>;
    const win = resp['window'] as Record<string, unknown>;

    expect(win['kind']).toBe('7d');
    expect(typeof win['startMs']).toBe('number');
    expect(typeof win['endMs']).toBe('number');
    expect(typeof win['prevStartMs']).toBe('number');
    expect(typeof win['prevEndMs']).toBe('number');
    expect(typeof win['label']).toBe('string');
    expect((win['startMs'] as number)).toBeLessThan(win['endMs'] as number);
  });

  it('returns 200 for window=today', async () => {
    const { status } = await get(baseUrl, '/api/patterns?window=today');
    expect(status).toBe(200);
  });

  it('returns 200 for window=30d', async () => {
    const { status } = await get(baseUrl, '/api/patterns?window=30d');
    expect(status).toBe(200);
  });

  it('returns 400 for invalid window value', async () => {
    const { status, body } = await get(baseUrl, '/api/patterns?window=invalid');
    expect(status).toBe(400);
    expect((body as Record<string, unknown>)['error']).toBeDefined();
  });

  it('returns 400 for unknown window value', async () => {
    const { status } = await get(baseUrl, '/api/patterns?window=1d');
    expect(status).toBe(400);
  });

  it('returns empty-but-valid 200 when no sessions exist', async () => {
    const { status, body } = await get(baseUrl, '/api/patterns?window=7d');
    expect(status).toBe(200);

    const resp = body as Record<string, unknown>;
    const counts = resp['sessionCounts'] as Record<string, number>;
    expect(counts['current']).toBe(0);
    expect(Array.isArray(resp['rotLeaderboard'])).toBe(true);
    expect(Array.isArray(resp['toolHealth'])).toBe(true);
    expect(Array.isArray(resp['errors'])).toBe(true);
  });

  it('defaults to 7d when window param is absent', async () => {
    const { status, body } = await get(baseUrl, '/api/patterns');
    expect(status).toBe(200);
    const resp = body as Record<string, unknown>;
    const win = resp['window'] as Record<string, unknown>;
    expect(win['kind']).toBe('7d');
  });
});
