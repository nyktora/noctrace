/**
 * Tests for the REST API routes.
 * Uses a temporary directory that mirrors the ~/.claude/projects structure.
 * Tests invoke the router handler functions directly via express-internal dispatch.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApiRouter } from '../../src/server/routes/api';

// ---------------------------------------------------------------------------
// Minimal HTTP helper (no supertest dependency)
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
// Test setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let baseUrl: string;
let httpServer: ReturnType<typeof createServer>;

const SIMPLE_SESSION_CONTENT = [
  '{"type":"system","sessionId":"sess-001","timestamp":"2026-03-30T10:00:00.000Z","uuid":"sys-1","parentUuid":null,"subtype":"init"}',
  '{"type":"assistant","sessionId":"sess-001","timestamp":"2026-03-30T10:00:02.000Z","uuid":"asst-1","parentUuid":null,"message":{"role":"assistant","content":[{"type":"tool_use","id":"tu-1","name":"Read","input":{"file_path":"/src/login.ts"}}],"usage":{"input_tokens":1500,"output_tokens":200}}}',
  '{"type":"user","sessionId":"sess-001","timestamp":"2026-03-30T10:00:03.000Z","uuid":"user-2","parentUuid":"asst-1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu-1","content":"file contents"}]},"isMeta":true}',
].join('\n');

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'noctrace-test-'));

  // Create structure: tmpDir/projects/my-project/sess-001.jsonl
  const projectDir = path.join(tmpDir, 'projects', 'my-project');
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, 'sess-001.jsonl'), SIMPLE_SESSION_CONTENT, 'utf8');

  // Empty project
  await fs.mkdir(path.join(tmpDir, 'projects', 'empty-project'), { recursive: true });

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
// GET /api/projects
// ---------------------------------------------------------------------------

describe('GET /api/projects', () => {
  it('returns a JSON array', async () => {
    const { status, body } = await get(baseUrl, '/api/projects');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('includes the test project with correct sessionCount', async () => {
    const { body } = await get(baseUrl, '/api/projects');
    const myProject = (body as Array<{ slug: string; sessionCount: number }>)
      .find((p) => p.slug === 'my-project');
    expect(myProject).toBeDefined();
    expect(myProject?.sessionCount).toBe(1);
  });

  it('includes an empty project with sessionCount 0', async () => {
    const { body } = await get(baseUrl, '/api/projects');
    const empty = (body as Array<{ slug: string; sessionCount: number }>)
      .find((p) => p.slug === 'empty-project');
    expect(empty).toBeDefined();
    expect(empty?.sessionCount).toBe(0);
  });

  it('returns empty array when projects directory does not exist', async () => {
    const ghostApp = express();
    ghostApp.use(express.json());
    ghostApp.use('/api', buildApiRouter('/nonexistent-claude-home-99999'));

    const ghostServer = createServer(ghostApp);
    const ghostUrl = await new Promise<string>((resolve) => {
      ghostServer.listen(0, '127.0.0.1', () => {
        const addr = ghostServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve(`http://127.0.0.1:${port}`);
      });
    });

    const { status, body } = await get(ghostUrl, '/api/projects');
    await new Promise<void>((resolve) => ghostServer.close(() => resolve()));

    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/sessions/:slug
// ---------------------------------------------------------------------------

describe('GET /api/sessions/:slug', () => {
  it('returns session summaries for a known project', async () => {
    const { status, body } = await get(baseUrl, '/api/sessions/my-project');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as unknown[]).length).toBe(1);
  });

  it('session summary has expected fields', async () => {
    const { body } = await get(baseUrl, '/api/sessions/my-project');
    const session = (body as Array<{
      id: string;
      projectSlug: string;
      startTime: string;
      lastModified: string;
      rowCount: number;
    }>)[0];
    expect(session.id).toBe('sess-001');
    expect(session.projectSlug).toBe('my-project');
    expect(session.startTime).toBe('2026-03-30T10:00:00.000Z');
    expect(typeof session.lastModified).toBe('string');
    expect(typeof session.rowCount).toBe('number');
  });

  it('returns empty array for project with no jsonl files', async () => {
    const { status, body } = await get(baseUrl, '/api/sessions/empty-project');
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('returns 404 for unknown project slug', async () => {
    const { status, body } = await get(baseUrl, '/api/sessions/does-not-exist');
    expect(status).toBe(404);
    expect(typeof (body as Record<string, unknown>)['error']).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// GET /api/session/:slug/:id
// ---------------------------------------------------------------------------

describe('GET /api/session/:slug/:id', () => {
  it('returns parsed session data', async () => {
    const { status, body } = await get(baseUrl, '/api/session/my-project/sess-001');
    expect(status).toBe(200);
    const data = body as {
      rows: unknown[];
      compactionBoundaries: number[];
      health: { grade: string; score: number };
      sessionId: string;
    };
    expect(Array.isArray(data.rows)).toBe(true);
    expect(Array.isArray(data.compactionBoundaries)).toBe(true);
    expect(data.health).toBeDefined();
    expect(data.health.grade).toMatch(/^[ABCDF]$/);
    expect(typeof data.health.score).toBe('number');
    expect(data.sessionId).toBe('sess-001');
  });

  it('rows contain expected waterfall structure', async () => {
    const { body } = await get(baseUrl, '/api/session/my-project/sess-001');
    const { rows } = body as { rows: Array<{ id: string; toolName: string; type: string }> };
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('toolName');
    expect(row).toHaveProperty('type');
  });

  it('returns 404 for unknown session id', async () => {
    const { status, body } = await get(baseUrl, '/api/session/my-project/no-such-session');
    expect(status).toBe(404);
    expect(typeof (body as Record<string, unknown>)['error']).toBe('string');
  });

  it('returns 404 for unknown project', async () => {
    const { status, body } = await get(baseUrl, '/api/session/ghost-project/sess-001');
    expect(status).toBe(404);
    expect(typeof (body as Record<string, unknown>)['error']).toBe('string');
  });
});
