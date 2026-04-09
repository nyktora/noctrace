#!/usr/bin/env node
/**
 * Shared helpers for reading/writing Claude Code MCP server registration
 * in ~/.claude/settings.json.
 *
 * Used by:
 *   - noctrace --enable / --disable
 *   - bin/postinstall.js
 *   - bin/preuninstall.js
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Resolve the path to ~/.claude/settings.json.
 * Respects the CLAUDE_HOME env var override.
 */
export function settingsPath() {
  const claudeHome = process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.claude');
  return path.join(claudeHome, 'settings.json');
}

/**
 * Resolve the ~/.claude directory path.
 * Respects the CLAUDE_HOME env var override.
 */
export function claudeDir() {
  return process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.claude');
}

/**
 * Read and parse settings.json.
 * Returns {} if the file doesn't exist or contains invalid JSON.
 */
export async function readSettings(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    try {
      return JSON.parse(raw);
    } catch {
      // Corrupted JSON — start fresh rather than aborting
      return {};
    }
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

/**
 * Write settings back to disk, creating parent directories as needed.
 */
export async function writeSettings(filePath, settings) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

/**
 * Register noctrace as an MCP server in ~/.claude/settings.json.
 *
 * Adds:
 *   mcpServers.noctrace = { command: "npx", args: ["-y", "noctrace", "--mcp"] }
 *
 * Preserves all other settings and MCP server entries.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.silent]  Suppress console output (for postinstall quiet mode)
 * @returns {{ alreadyConfigured: boolean }}
 */
export async function enableMcp({ silent = false } = {}) {
  const sp = settingsPath();
  const settings = await readSettings(sp);

  if (!settings.mcpServers) settings.mcpServers = {};

  const already =
    settings.mcpServers.noctrace != null &&
    settings.mcpServers.noctrace.command === 'npx' &&
    Array.isArray(settings.mcpServers.noctrace.args) &&
    settings.mcpServers.noctrace.args.includes('--mcp');

  settings.mcpServers.noctrace = {
    command: 'npx',
    args: ['-y', 'noctrace', '--mcp'],
  };

  await writeSettings(sp, settings);

  if (!silent) {
    if (already) {
      console.log('[noctrace] MCP server already configured — updated entry.');
    } else {
      console.log('[noctrace] Registered noctrace MCP server in Claude Code settings.');
    }
    console.log('[noctrace] Settings written to:', sp);
  }

  return { alreadyConfigured: already };
}

/**
 * Remove the noctrace MCP server entry from ~/.claude/settings.json.
 *
 * Cleans up the mcpServers key entirely if it becomes empty.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.silent]  Suppress console output
 * @returns {{ wasConfigured: boolean }}
 */
export async function disableMcp({ silent = false } = {}) {
  const sp = settingsPath();
  const settings = await readSettings(sp);

  const wasConfigured = settings.mcpServers?.noctrace != null;

  if (!wasConfigured) {
    if (!silent) {
      console.log('[noctrace] Noctrace is not configured in Claude Code.');
    }
    return { wasConfigured: false };
  }

  delete settings.mcpServers.noctrace;

  // Remove the mcpServers key entirely if it's now empty
  if (Object.keys(settings.mcpServers).length === 0) {
    delete settings.mcpServers;
  }

  await writeSettings(sp, settings);

  if (!silent) {
    console.log('[noctrace] Removed noctrace MCP server from Claude Code settings.');
    console.log('[noctrace] Settings written to:', sp);
  }

  return { wasConfigured: true };
}
