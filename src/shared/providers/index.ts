/**
 * Provider registry for Noctrace multi-provider support.
 * Phase A: registers the 'claude-code' provider by default.
 * Additional providers (Codex, Copilot, etc.) will be registered in Phase B/C.
 */

import type { Provider, ProviderCapabilities, TimeWindow, SessionEvent } from './provider.js';
import type { SessionMeta, AgentSession } from '../session.js';
import { createClaudeCodeProvider } from './claude-code.js';
import { createCodexProvider } from './codex.js';

export type { Provider, ProviderCapabilities, TimeWindow, SessionEvent };
export type { SessionMeta, AgentSession };

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const _registry = new Map<string, Provider>();

/**
 * Register a provider in the global registry.
 * Overwrites any existing provider with the same id.
 * Use this in tests to inject mock or fixture-backed providers.
 */
export function registerProvider(provider: Provider): void {
  _registry.set(provider.id, provider);
}

/**
 * Retrieve a provider by its stable id.
 * Returns undefined when no provider with that id is registered.
 */
export function getProvider(id: string): Provider | undefined {
  return _registry.get(id);
}

/**
 * Return all currently registered providers as an array.
 */
export function listProviders(): Provider[] {
  return Array.from(_registry.values());
}

// ---------------------------------------------------------------------------
// Default registration
// ---------------------------------------------------------------------------

// Register the Claude Code provider with default settings.
// The claudeHome path is resolved from CLAUDE_HOME env var or ~/.claude.
registerProvider(createClaudeCodeProvider());

// Register the Codex CLI provider.
// The codexHome path is resolved from CODEX_HOME env var or ~/.codex.
registerProvider(createCodexProvider());
