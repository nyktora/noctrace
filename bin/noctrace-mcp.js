#!/usr/bin/env node
/**
 * MCP server wrapper for the noctrace plugin.
 *
 * Behaviour:
 *  1. Discovers the current Claude Code session's JSONL path from env vars.
 *  2. Checks whether noctrace is already running on port 4117.
 *  3. If not running, starts the Express server and opens the browser.
 *  4. Registers this session via POST /api/sessions/register.
 *  5. Speaks JSON-RPC 2.0 over stdio to satisfy Claude Code's MCP protocol.
 *  6. On exit (SIGTERM / SIGINT / stdin close), unregisters the session.
 *
 * Session path discovery order:
 *  a. CLAUDE_SESSION_PATH env var (direct path to the .jsonl file)
 *  b. CLAUDE_PROJECT_DIR or PWD → compute project slug → find newest .jsonl
 *  c. Fall back to null (register with null; file watcher will pick it up)
 */
import { createInterface } from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const VERSION = '0.9.0';
const NOCTRACE_PORT = parseInt(process.env.NOCTRACE_PORT ?? '4117', 10);
const NOCTRACE_HOST = process.env.NOCTRACE_HOST ?? 'localhost';
const BASE_URL = `http://${NOCTRACE_HOST}:${NOCTRACE_PORT}`;

// ---------------------------------------------------------------------------
// Session path discovery
// ---------------------------------------------------------------------------

/**
 * Convert an absolute filesystem path to the Claude project slug format.
 * Slugs replace every "/" with "-" and strip any leading "-".
 * Example: /Users/lam/dev/noctrace → -Users-lam-dev-noctrace
 */
function pathToSlug(absPath) {
  return absPath.replace(/\//g, '-');
}

/**
 * Return the path to the most recently modified .jsonl file in `dir`,
 * or null if the directory is empty / inaccessible.
 *
 * @param {string} dir — absolute path to a project directory
 * @returns {Promise<string|null>}
 */
async function newestJsonl(dir) {
  let files;
  try {
    files = await fs.readdir(dir);
  } catch {
    return null;
  }
  const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
  if (jsonlFiles.length === 0) return null;

  let newest = null;
  let newestMtime = -Infinity;

  for (const file of jsonlFiles) {
    try {
      const stat = await fs.stat(path.join(dir, file));
      if (stat.mtimeMs > newestMtime) {
        newestMtime = stat.mtimeMs;
        newest = path.join(dir, file);
      }
    } catch {
      // skip
    }
  }
  return newest;
}

/**
 * Translate a container-internal path to the host-side path.
 * Uses NOCTRACE_PATH_MAP env var: "container_prefix:host_prefix"
 * Example: NOCTRACE_PATH_MAP="/root/.claude:/Users/lam/.claude"
 *
 * @param {string} containerPath
 * @returns {string}
 */
function translatePath(containerPath) {
  const pathMap = process.env.NOCTRACE_PATH_MAP;
  if (!pathMap) return containerPath;
  const sep = pathMap.indexOf(':');
  if (sep === -1) return containerPath;
  const containerPrefix = pathMap.slice(0, sep);
  const hostPrefix = pathMap.slice(sep + 1);
  if (containerPath.startsWith(containerPrefix)) {
    return hostPrefix + containerPath.slice(containerPrefix.length);
  }
  return containerPath;
}

/**
 * Discover the JSONL session path for the current Claude Code session.
 * Returns the host-translated path when NOCTRACE_PATH_MAP is set.
 *
 * @returns {Promise<string|null>}
 */
async function discoverSessionPath() {
  // Option a: direct env var
  if (process.env.CLAUDE_SESSION_PATH) {
    return translatePath(process.env.CLAUDE_SESSION_PATH);
  }

  // Option b: derive from project directory
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.env.PWD ?? null;
  if (!projectDir) return null;

  const claudeHome = process.env.CLAUDE_CONFIG_DIR ?? process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.claude');
  const slug = pathToSlug(projectDir);
  const projectSessionDir = path.join(claudeHome, 'projects', slug);

  const sessionPath = await newestJsonl(projectSessionDir);
  return sessionPath ? translatePath(sessionPath) : null;
}

// ---------------------------------------------------------------------------
// Port / server helpers
// ---------------------------------------------------------------------------

/**
 * Check whether noctrace is already running on the configured port.
 * Uses the /api/health endpoint; resolves true if reachable, false otherwise.
 *
 * @returns {Promise<boolean>}
 */
async function isServerRunning() {
  try {
    const { default: http } = await import('node:http');
    return await new Promise((resolve) => {
      const req = http.get(`${BASE_URL}/api/health`, { timeout: 1500 }, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  } catch {
    return false;
  }
}

/**
 * Start the noctrace Express server by importing the compiled entry point.
 * Sets NOCTRACE_NO_AUTOSTART so the module does not start a second server
 * instance when imported as a side-effect.
 *
 * @returns {Promise<void>}
 */
async function startNoctraceServer() {
  process.env.NOCTRACE_NO_AUTOSTART = '1';
  process.env.NODE_ENV = 'production';
  const { startServer } = await import('../dist/server/server/index.js');
  await startServer();
}

// ---------------------------------------------------------------------------
// Session registration
// ---------------------------------------------------------------------------

/**
 * POST a session path to the noctrace register/unregister endpoint.
 *
 * @param {'register'|'unregister'} action
 * @param {string} sessionPath
 * @returns {Promise<void>}
 */
async function postSessionAction(action, sessionPath) {
  const { default: http } = await import('node:http');
  const body = JSON.stringify({ sessionPath });
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: NOCTRACE_HOST,
        port: NOCTRACE_PORT,
        path: `/api/sessions/${action}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 3000,
      },
      () => resolve(),
    );
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

/**
 * Write a JSON-RPC 2.0 response to stdout.
 * All other output must go to stderr (stdout is the MCP channel).
 *
 * @param {unknown} id
 * @param {unknown} result
 */
function respond(id, result) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(`${msg}\n`);
}

/**
 * Handle a single JSON-RPC message from Claude Code.
 *
 * @param {string} line
 */
function handleMessage(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  const { id, method, params } = msg;

  if (method === 'initialize') {
    respond(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'noctrace', version: VERSION },
    });
    return;
  }

  if (method === 'notifications/initialized') {
    return; // no response for notifications
  }

  if (method === 'tools/list') {
    respond(id, {
      tools: [
        {
          name: 'open_dashboard',
          description: 'Open the noctrace waterfall dashboard in the browser',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
      ],
    });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    if (toolName === 'open_dashboard') {
      import('open').then((m) => m.default(BASE_URL)).catch(() => {});
      respond(id, {
        content: [{ type: 'text', text: `Noctrace dashboard: ${BASE_URL}` }],
      });
      return;
    }
    respond(id, {
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
      isError: true,
    });
    return;
  }

  // Unknown method — respond with empty result to avoid hanging
  if (id !== undefined) {
    respond(id, {});
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let sessionPath = await discoverSessionPath();

  // When running inside Docker (NOCTRACE_HOST != localhost), skip server start —
  // the noctrace server runs on the host, not inside the container.
  const isRemote = NOCTRACE_HOST !== 'localhost' && NOCTRACE_HOST !== '127.0.0.1';

  // Check if noctrace is already running; if not, start it (first MCP process wins).
  // Use a retry loop to handle the race where two MCP processes start simultaneously.
  const running = await isServerRunning();
  if (!running && !isRemote) {
    process.stderr.write('[noctrace-mcp] Starting noctrace server...\n');
    try {
      await startNoctraceServer();
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        // Another process won the race — verify it's reachable before continuing.
        const nowRunning = await isServerRunning();
        if (!nowRunning) {
          process.stderr.write('[noctrace-mcp] Fatal: port in use but server is not responding\n');
          process.exit(1);
        }
        process.stderr.write('[noctrace-mcp] Server started by peer process — continuing\n');
      } else {
        // A real startup error (e.g. missing dist/, permission denied) — surface it.
        process.stderr.write(`[noctrace-mcp] Fatal: could not start server: ${err.message}\n`);
        process.exit(1);
      }
    }

    // Open the browser — only the first MCP process to start the server does this
    try {
      const open = (await import('open')).default;
      await open(BASE_URL);
    } catch {
      // Non-fatal — user can navigate manually
    }
  }

  // Retry session discovery once — Claude Code may still be creating the session file
  // when the MCP server starts. Wait 1 second and prefer the newer result.
  await new Promise((r) => setTimeout(r, 1000));
  const retryPath = await discoverSessionPath();
  if (retryPath && retryPath !== sessionPath) {
    sessionPath = retryPath;
  }

  if (sessionPath) {
    process.stderr.write(`[noctrace-mcp] Session: ${sessionPath}\n`);
  } else {
    process.stderr.write('[noctrace-mcp] Could not discover session path — proceeding without registration\n');
  }

  // Register this session with the running noctrace server
  if (sessionPath) {
    await postSessionAction('register', sessionPath);
    process.stderr.write('[noctrace-mcp] Session registered\n');
  }

  // Cleanup: unregister on process exit
  let cleaned = false;
  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    if (sessionPath) {
      await postSessionAction('unregister', sessionPath).catch(() => {});
    }
  }

  process.on('SIGTERM', () => { void cleanup().then(() => process.exit(0)); });
  process.on('SIGINT', () => { void cleanup().then(() => process.exit(0)); });

  // Speak JSON-RPC over stdio for Claude Code's MCP protocol
  const rl = createInterface({ input: process.stdin });
  rl.on('line', handleMessage);
  rl.on('close', () => {
    void cleanup().then(() => process.exit(0));
  });
}

main().catch((err) => {
  process.stderr.write(`[noctrace-mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});
