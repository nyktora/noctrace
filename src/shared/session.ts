/**
 * Normalised session schema shared across all providers.
 * Phase A: minimal contract — providers pass rich data through `native`.
 * Phase B/C may introduce richer normalised fields on AgentSession.
 */

/**
 * Lightweight metadata about a session returned by Provider.listSessions().
 * Composite key is (provider, sessionId).
 */
export interface SessionMeta {
  /** Provider id that owns this session, e.g. 'claude-code'. */
  provider: string;
  /** Unique session identifier within the provider's namespace. */
  sessionId: string;
  /** Human-readable project context, e.g. "~/dev/noctrace". */
  projectContext: string;
  /**
   * Provider-native routing identifier used in URL construction.
   * For Claude Code this is '<projectSlug>/<sessionId>',
   * e.g. '-Users-lam-dev-noctrace/abc123'.
   */
  rawSlug: string;
  /** Unix-ms start time derived from the first record's timestamp. */
  startMs: number;
  /** Unix-ms end time derived from the last-modified mtime. Null for in-progress sessions. */
  endMs: number | null;
  /** Best-effort primary model name, e.g. 'claude-sonnet-4-5'. Null when undetectable. */
  modelHint?: string;
}

/**
 * A fully-loaded session returned by Provider.readSession().
 *
 * `native` carries provider-specific data unchanged so that no fidelity is
 * lost while the abstraction matures. For Claude Code, native is WaterfallRow[].
 * Downstream code may cast it: `session.native as WaterfallRow[]`.
 */
export interface AgentSession {
  meta: SessionMeta;
  /**
   * Provider-native parsed data.
   * Claude Code: WaterfallRow[] produced by parseJsonlContent().
   * Other providers: whatever their parse step yields.
   */
  native: unknown;
}
