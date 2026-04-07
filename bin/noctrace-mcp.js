#!/usr/bin/env node
/**
 * Minimal MCP server wrapper for the noctrace plugin.
 *
 * Starts the noctrace Express server as a side effect and speaks just enough
 * MCP (JSON-RPC 2.0 over stdio) to stay alive as a Claude Code managed process.
 * Exposes a single `open_dashboard` tool so Claude can tell the user the URL.
 */
import { createInterface } from 'node:readline';

const VERSION = '0.4.0';
let serverPort = null;
let browserOpened = false;

// Start the Express server (lazy import to avoid loading before needed)
async function boot() {
  process.env.NOCTRACE_NO_AUTOSTART = '1';
  const { startServer } = await import('../dist/server/server/index.js');
  serverPort = await startServer();

  // Open browser once on first start
  if (!browserOpened) {
    const open = (await import('open')).default;
    await open(`http://localhost:${serverPort}`);
    browserOpened = true;
  }
}

// JSON-RPC response helper
function respond(id, result) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(`${msg}\n`);
}

// Handle incoming JSON-RPC messages from Claude Code
function handleMessage(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // ignore malformed input
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
    // No response needed for notifications
    return;
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
      const url = `http://localhost:${serverPort ?? 4117}`;
      // Open browser
      import('open').then((m) => m.default(url)).catch(() => {});
      respond(id, {
        content: [{ type: 'text', text: `Noctrace dashboard: ${url}` }],
      });
      return;
    }
    // Unknown tool
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

// Main
async function main() {
  await boot();

  const rl = createInterface({ input: process.stdin });
  rl.on('line', handleMessage);

  // Keep alive until stdin closes (Claude Code manages our lifecycle)
  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[noctrace-mcp] Fatal:', err.message);
  process.exit(1);
});
