#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { enableMcp, disableMcp } from './claude-config.js';

const NOCTRACE_PORT = 4117;
const NOCTRACE_BASE_URL = `http://localhost:${NOCTRACE_PORT}`;
const HOOKS_ENDPOINT = `${NOCTRACE_BASE_URL}/api/hooks`;

/**
 * The curl command used as the hook body.
 * Reads the hook event JSON from stdin and POSTs it to noctrace.
 * `--data-raw "$(cat)"` captures all of stdin and sends it as the request body.
 */
const HOOK_COMMAND = `curl -s -X POST ${HOOKS_ENDPOINT} -H 'Content-Type: application/json' --data-raw "$(cat)"`;

/**
 * The set of Claude Code hook event names noctrace subscribes to.
 */
const HOOK_EVENT_NAMES = [
  'PostToolUse',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'PreCompact',
  'PostCompact',
];

/**
 * Read and parse ~/.claude/settings.json.
 * Returns an empty object if the file doesn't exist yet.
 */
async function readSettings(settingsPath) {
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

/**
 * Write settings back to disk, creating parent directories as needed.
 */
async function writeSettings(settingsPath, settings) {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

/**
 * Install noctrace hooks into ~/.claude/settings.json.
 * For each hook event name, adds a "command" hook that POSTs the event
 * payload to the noctrace HTTP endpoint.
 * Skips events that already have a noctrace hook registered.
 */
async function installHooks() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = await readSettings(settingsPath);

  if (!settings.hooks) settings.hooks = {};

  const added = [];
  const skipped = [];

  for (const eventName of HOOK_EVENT_NAMES) {
    if (!settings.hooks[eventName]) settings.hooks[eventName] = [];

    const existing = settings.hooks[eventName];

    // Check whether a noctrace hook is already registered for this event
    const alreadyInstalled = existing.some(
      (entry) =>
        Array.isArray(entry.hooks) &&
        entry.hooks.some(
          (h) => h.type === 'command' && typeof h.command === 'string' && h.command.includes(HOOKS_ENDPOINT),
        ),
    );

    if (alreadyInstalled) {
      skipped.push(eventName);
      continue;
    }

    existing.push({
      hooks: [{
        type: 'command',
        command: HOOK_COMMAND,
        async: true,
      }],
    });

    added.push(eventName);
  }

  await writeSettings(settingsPath, settings);

  if (added.length > 0) {
    console.log(`[noctrace] Installed hooks for: ${added.join(', ')}`);
  }
  if (skipped.length > 0) {
    console.log(`[noctrace] Already installed (skipped): ${skipped.join(', ')}`);
  }
  console.log(`[noctrace] Settings written to: ${settingsPath}`);
  console.log(`[noctrace] Hook events will be forwarded to ${HOOKS_ENDPOINT}`);
}

/**
 * Remove noctrace hooks from ~/.claude/settings.json.
 * Only removes hooks whose command string contains the noctrace endpoint —
 * other hooks for the same events are left untouched.
 */
async function uninstallHooks() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = await readSettings(settingsPath);

  if (!settings.hooks) {
    console.log('[noctrace] No hooks section found in settings.json — nothing to remove.');
    return;
  }

  const removed = [];

  for (const eventName of HOOK_EVENT_NAMES) {
    const existing = settings.hooks[eventName];
    if (!Array.isArray(existing)) continue;

    const before = existing.length;
    settings.hooks[eventName] = existing.filter(
      (entry) =>
        !(
          Array.isArray(entry.hooks) &&
          entry.hooks.some(
            (h) => h.type === 'command' && typeof h.command === 'string' && h.command.includes(HOOKS_ENDPOINT),
          )
        ),
    );

    if (settings.hooks[eventName].length < before) {
      removed.push(eventName);
    }

    // Clean up empty arrays
    if (settings.hooks[eventName].length === 0) {
      delete settings.hooks[eventName];
    }
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  await writeSettings(settingsPath, settings);

  if (removed.length > 0) {
    console.log(`[noctrace] Removed hooks for: ${removed.join(', ')}`);
    console.log(`[noctrace] Settings written to: ${settingsPath}`);
  } else {
    console.log('[noctrace] No noctrace hooks found — nothing to remove.');
  }
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes('--install-hooks')) {
  await installHooks();
  process.exit(0);
}

if (args.includes('--uninstall-hooks')) {
  await uninstallHooks();
  process.exit(0);
}

if (args.includes('--enable')) {
  const { alreadyConfigured } = await enableMcp();
  if (alreadyConfigured) {
    console.log('[noctrace] MCP server entry updated.');
  } else {
    console.log('[noctrace] ✓ Noctrace will auto-start with your next Claude Code session.');
    console.log('[noctrace]   Run "noctrace --disable" to remove.');
  }
  process.exit(0);
}

if (args.includes('--disable')) {
  const { wasConfigured } = await disableMcp();
  if (wasConfigured) {
    console.log('[noctrace] ✓ Noctrace removed from Claude Code.');
  } else {
    console.log('[noctrace] Noctrace is not configured in Claude Code.');
  }
  process.exit(0);
}

if (args.includes('--mcp')) {
  // MCP mode: boot the Express server and speak JSON-RPC over stdio.
  // stdout is the JSON-RPC channel — all logging must go to stderr.
  process.stderr.write('[noctrace-mcp] Starting MCP server...\n');
  await import('./noctrace-mcp.js');
  // noctrace-mcp.js takes over from here (runs main() internally)
  process.exit(0); // unreachable — mcp keeps process alive via readline
}

// Default: start the server and open the browser
process.env.NOCTRACE_NO_AUTOSTART = '1';
process.env.NODE_ENV = 'production';
const { startServer } = await import('../dist/server/server/index.js');
const open = (await import('open')).default;
const port = await startServer();
const url = `http://localhost:${port}`;
await open(url);
