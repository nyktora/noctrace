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
  // Check whether Claude Code is installed
  try {
    await fs.access(claudeDir());
  } catch {
    // ~/.claude doesn't exist — Claude Code is not installed, skip silently
    return;
  }

  // Check if already configured
  const settingsFile = (await import('./claude-config.js')).settingsPath();
  let alreadyConfigured = false;
  try {
    const raw = await fs.readFile(settingsFile, 'utf8');
    const settings = JSON.parse(raw);
    alreadyConfigured = !!settings?.mcpServers?.noctrace;
  } catch {
    // No settings file or invalid JSON — not configured
  }

  if (alreadyConfigured) {
    return; // Already set up, nothing to say
  }

  // Don't auto-modify config — just tell the user how to opt in
  console.log('');
  console.log('  \x1b[36mnoctrace\x1b[0m installed successfully.');
  console.log('');
  console.log('  Auto-start with Claude Code (recommended):');
  console.log('    \x1b[1mnoctrace --enable\x1b[0m');
  console.log('');
  console.log('  Or run standalone:');
  console.log('    \x1b[1mnoctrace\x1b[0m');
  console.log('');
}

run().catch(() => {
  // Silently swallow all errors — never break the install
}).finally(() => {
  process.exit(0);
});
