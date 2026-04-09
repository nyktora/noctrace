#!/usr/bin/env node
/**
 * Remove noctrace MCP server registration from Claude Code settings.
 * Runs before `npm uninstall -g noctrace`.
 *
 * Never fails — always exits with code 0 so the uninstall is never interrupted.
 */
import fs from 'node:fs/promises';
import { claudeDir, disableMcp } from './claude-config.js';

async function run() {
  // Check whether Claude Code is installed before touching anything
  try {
    await fs.access(claudeDir());
  } catch {
    // ~/.claude doesn't exist — nothing to clean up
    return;
  }

  const { wasConfigured } = await disableMcp({ silent: true });

  if (wasConfigured) {
    console.log('[noctrace] Removed noctrace MCP server from Claude Code settings.');
  }
  // If not configured, exit quietly
}

run().catch(() => {
  // Silently swallow all errors — never block the uninstall
}).finally(() => {
  process.exit(0);
});
