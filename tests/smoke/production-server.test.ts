/**
 * Production smoke test — verifies the built server entry point serves the SPA correctly.
 *
 * IMPORTANT: Run `npm run build` before executing this test suite.
 * This test imports from `dist/` (the compiled output), not the TypeScript source.
 * It validates that NODE_ENV=production wires up static file serving, which unit
 * tests and dev-mode testing cannot catch (that's exactly how the "Cannot GET /" bug
 * slipped through before this test existed).
 *
 * Run with: npm run test:smoke
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import net from 'node:net';

// ---------------------------------------------------------------------------
// Helper: find a free TCP port
// ---------------------------------------------------------------------------

/** Resolves with a port that is free at the moment of the call. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Helper: minimal HTTP GET (no supertest dependency)
// ---------------------------------------------------------------------------

interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function httpGet(url: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: raw,
        });
      });
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let baseUrl: string;
let serverPort: number;

beforeAll(async () => {
  // Set env vars before importing the built module so that BASE_PORT and the
  // NODE_ENV branch are evaluated correctly at module load time.
  const port = await getFreePort();
  process.env['PORT'] = String(port);
  process.env['NODE_ENV'] = 'production';
  process.env['NOCTRACE_NO_AUTOSTART'] = '1';

  // Dynamic import ensures env vars are set before the module is evaluated.
  // The path is relative to this file's location in tests/smoke/.
  const { startServer } = await import('../../dist/server/server/index.js');

  serverPort = await startServer();
  baseUrl = `http://127.0.0.1:${serverPort}`;
}, 30_000);

afterAll(async () => {
  // The server's http.Server is not directly exposed by startServer(), so we
  // send a one-shot request that will fail gracefully, and rely on Vitest's
  // process teardown to clean up open handles. For a cleaner approach the
  // server module would need to export a stop() function, but that's a future
  // enhancement — the test process exits after the suite anyway.
  delete process.env['PORT'];
  delete process.env['NOCTRACE_NO_AUTOSTART'];
});

// ---------------------------------------------------------------------------
// Smoke assertions
// ---------------------------------------------------------------------------

describe('production server smoke tests', () => {
  it('GET / returns 200 with SPA HTML containing <div id="root">', async () => {
    const res = await httpGet(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('<div id="root">');
  });

  it('GET /api/projects returns 200 with a JSON array', async () => {
    const res = await httpGet(`${baseUrl}/api/projects`);
    expect(res.status).toBe(200);
    const parsed: unknown = JSON.parse(res.body);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('GET /api/health returns 200 with { status: "ok" }', async () => {
    const res = await httpGet(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body) as { status: string };
    expect(parsed.status).toBe('ok');
  });

  it('GET /nonexistent-page returns 200 with SPA HTML (catch-all, not 404)', async () => {
    const res = await httpGet(`${baseUrl}/nonexistent-page`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('<div id="root">');
  });
});
