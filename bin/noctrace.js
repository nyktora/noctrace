#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { enableMcp, disableMcp } from './claude-config.js';

const NOCTRACE_PORT = 4117;
const NOCTRACE_BASE_URL = `http://localhost:${NOCTRACE_PORT}`;
const HOOKS_ENDPOINT = `${NOCTRACE_BASE_URL}/api/hooks`;

/**
 * The set of Claude Code hook event names noctrace subscribes to.
 */
const HOOK_EVENT_NAMES = [
  'PostToolUse',
  'PostToolUseFailure',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'PreCompact',
  'PostCompact',
  'SessionStart',
  'SessionEnd',
  'PermissionRequest',
  'PermissionDenied',
  'WorktreeCreate',
  'WorktreeRemove',
];

/**
 * Check if a hook entry array contains a noctrace hook (either old command-type or new http-type).
 */
function hasNoctraceHook(entry) {
  return Array.isArray(entry.hooks) &&
    entry.hooks.some(
      (h) =>
        (h.type === 'command' && typeof h.command === 'string' && h.command.includes(HOOKS_ENDPOINT)) ||
        (h.type === 'http' && h.url === HOOKS_ENDPOINT),
    );
}

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
 * For each hook event name, adds an HTTP hook pointing at the noctrace endpoint.
 * Detects both old command-type and new http-type hooks to avoid duplicates.
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

    // Check whether a noctrace hook is already registered (either old command or new http format)
    const alreadyInstalled = existing.some(hasNoctraceHook);

    if (alreadyInstalled) {
      skipped.push(eventName);
      continue;
    }

    existing.push({
      hooks: [{
        type: 'http',
        url: HOOKS_ENDPOINT,
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
 * Removes both old command-type and new http-type hooks.
 * Iterates all hook event keys (not just HOOK_EVENT_NAMES) to clean up orphaned entries.
 */
async function uninstallHooks() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = await readSettings(settingsPath);

  if (!settings.hooks) {
    console.log('[noctrace] No hooks section found in settings.json — nothing to remove.');
    return;
  }

  const removed = [];

  // Iterate ALL hook event keys (not just current HOOK_EVENT_NAMES) to clean up orphaned old entries
  for (const eventName of Object.keys(settings.hooks)) {
    const existing = settings.hooks[eventName];
    if (!Array.isArray(existing)) continue;

    const before = existing.length;
    settings.hooks[eventName] = existing.filter((entry) => !hasNoctraceHook(entry));

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
