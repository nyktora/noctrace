/**
 * Core Provider interface and supporting types for the multi-provider abstraction.
 * Phase A: defines the contract that all agent-log providers must implement.
 */

import type { SessionMeta, AgentSession } from '../session.js';

export type { SessionMeta, AgentSession };

/**
 * Describes which observability features a provider supports.
 * Consumers use this to degrade gracefully when a feature is absent.
 */
export interface ProviderCapabilities {
  /** How granular tool-call data is: 'full' means per-call input/output. */
  toolCallGranularity: 'full' | 'summary' | 'opaque';
  /** Whether context-fill percentage can be computed for this provider. */
  contextTracking: boolean;
  /** Whether sub-agent hierarchies are surfaced. */
  subAgents: boolean;
  /** Whether real-time event streaming is supported. */
  realtime: boolean;
  /** How token accounting is performed. */
  tokenAccounting: 'per-turn' | 'per-session' | 'none';
}

/**
 * A half-open time window [startMs, endMs) used to filter sessions.
 */
export interface TimeWindow {
  startMs: number;
  endMs: number;
}

/**
 * Real-time events emitted by a provider's watch() subscription.
 */
export type SessionEvent =
  | { kind: 'session-updated'; provider: string; sessionId: string }
  | { kind: 'session-added'; provider: string; sessionId: string }
  | { kind: 'session-removed'; provider: string; sessionId: string };

/**
 * The Provider interface that every agent-log source must implement.
 * Phase B will wire this to the Express server and file watcher.
 * Phase C will add richer normalised fields to AgentSession.
 */
export interface Provider {
  /** Stable registry key, e.g. 'claude-code', 'codex', 'copilot'. */
  id: string;
  /** Human-readable name shown in the UI, e.g. 'Claude Code'. */
  displayName: string;

  /** Static capability descriptor for this provider instance. */
  capabilities: ProviderCapabilities;

  /**
   * List sessions whose last-modified time falls within the given window.
   * Implementations should be best-effort: skip unreadable entries rather than throw.
   */
  listSessions(window: TimeWindow): Promise<SessionMeta[]>;

  /**
   * Read and parse a single session by its provider-scoped id.
   * The id format is defined by the provider's listSessions implementation.
   * Throws if the session cannot be found or read.
   */
  readSession(id: string): Promise<AgentSession>;

  /**
   * Subscribe to real-time events for any active session.
   * Returns an unsubscribe function that cleans up the subscription.
   *
   * Phase A note: the Claude Code implementation returns a no-op unsubscribe.
   * Real chokidar integration is deferred to Phase B.
   */
  watch(onEvent: (e: SessionEvent) => void): () => void;
}
