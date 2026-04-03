/**
 * Configuration helpers for resolving Claude's home directory.
 * Supports CLAUDE_HOME env var override; falls back to ~/.claude.
 */
import os from 'node:os';
import path from 'node:path';

/**
 * Resolve the root Claude home directory.
 * Uses CLAUDE_HOME env var if set, otherwise ~/.claude.
 */
export function getClaudeHome(): string {
  const override = process.env['CLAUDE_HOME'];
  if (override && override.trim() !== '') return override.trim();
  return path.join(os.homedir(), '.claude');
}

/**
 * Resolve the projects directory inside Claude home.
 */
export function getProjectsDir(): string {
  return path.join(getClaudeHome(), 'projects');
}
