#!/usr/bin/env node
/**
 * Auto-register noctrace as an MCP server in Claude Code settings.
 * Runs after `npm install -g noctrace`.
 *
 * Only acts if ~/.claude/ already exists (i.e. Claude Code is installed).
 * Never fails — always exits with code 0 so the install is never interrupted.
 */
import fs from 'node:fs/promises';
import { claudeDir, enableMcp } from './claude-config.js';

async function run() {
  // Check whether Claude Code is installed before touching anything
  try {
    await fs.access(claudeDir());
  } catch {
    // ~/.claude doesn't exist — Claude Code is not installed, skip silently
    return;
  }

  const { alreadyConfigured } = await enableMcp({ silent: true });

  if (alreadyConfigured) {
    console.log('[noctrace] MCP server registration already present — skipped.');
  } else {
    console.log('[noctrace] Registered as a Claude Code MCP server.');
    console.log('[noctrace] Noctrace will auto-start with your next Claude Code session.');
    console.log('[noctrace] Run "noctrace --disable" to opt out.');
  }
}

run().catch(() => {
  // Silently swallow all errors — never break the install
}).finally(() => {
  process.exit(0);
});
