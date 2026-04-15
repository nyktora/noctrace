/**
 * Derives the ProviderCapabilities for the currently loaded session.
 * Falls back to the Claude Code full-capability defaults when the session's
 * provider information has not yet been surfaced by the server (Phase B).
 *
 * This is the single source of truth for capability checks in the UI.
 * All capability gates should call this hook rather than hard-coding assumptions.
 */
import type { ProviderCapabilities } from '../../shared/providers/provider.ts';
import { useSessionStore } from '../store/session-store.ts';

/**
 * Capabilities for the Claude Code provider.
 * All signals are available — this is the baseline production configuration today.
 */
export const CLAUDE_CODE_CAPABILITIES: ProviderCapabilities = {
  toolCallGranularity: 'full',
  contextTracking: true,
  subAgents: true,
  realtime: true,
  tokenAccounting: 'per-turn',
};

/**
 * Minimal capabilities for providers that do not expose internal signals.
 * Used as the safe fallback when capabilities cannot be determined.
 */
export const MINIMAL_CAPABILITIES: ProviderCapabilities = {
  toolCallGranularity: 'opaque',
  contextTracking: false,
  subAgents: false,
  realtime: false,
  tokenAccounting: 'none',
};

/**
 * Returns the ProviderCapabilities for the currently-loaded session.
 * When no session is loaded, returns the CLAUDE_CODE_CAPABILITIES defaults
 * so the UI renders normally for the active provider.
 */
export function useCapabilities(): ProviderCapabilities {
  const sessionCapabilities = useSessionStore((s) => s.sessionCapabilities);
  return sessionCapabilities ?? CLAUDE_CODE_CAPABILITIES;
}
