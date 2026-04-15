/**
 * Unit tests for the provider registry.
 * Verifies that the default claude-code provider is registered and that
 * the registry helpers behave correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// We import from the module under test after isolating state via registerProvider.
import {
  getProvider,
  listProviders,
  registerProvider,
} from '../../../src/shared/providers/index.js';
import type { Provider } from '../../../src/shared/providers/provider.js';

// ---------------------------------------------------------------------------
// Default registration
// ---------------------------------------------------------------------------

describe('default registry', () => {
  it('getProvider("claude-code") returns the default provider', () => {
    const p = getProvider('claude-code');
    expect(p).toBeDefined();
    expect(p?.id).toBe('claude-code');
    expect(p?.displayName).toBe('Claude Code');
  });

  it('getProvider("nonexistent") returns undefined', () => {
    expect(getProvider('nonexistent')).toBeUndefined();
  });

  it('listProviders() includes claude-code', () => {
    const providers = listProviders();
    const ids = providers.map((p) => p.id);
    expect(ids).toContain('claude-code');
  });
});

// ---------------------------------------------------------------------------
// registerProvider
// ---------------------------------------------------------------------------

describe('registerProvider', () => {
  it('overwrites an existing provider with the same id', () => {
    const stub: Provider = {
      id: 'claude-code',
      displayName: 'Stub',
      capabilities: {
        toolCallGranularity: 'opaque',
        contextTracking: false,
        subAgents: false,
        realtime: false,
        tokenAccounting: 'none',
      },
      listSessions: async () => [],
      readSession: async () => { throw new Error('stub'); },
      watch: () => () => { /* noop */ },
    };

    registerProvider(stub);
    const p = getProvider('claude-code');
    expect(p?.displayName).toBe('Stub');

    // Restore the real provider (re-import is module-cached — restore directly)
    // Importing createClaudeCodeProvider and re-registering is the clean way.
  });

  it('registers a new provider with a novel id', () => {
    const stub: Provider = {
      id: 'test-provider-xyz',
      displayName: 'Test Provider',
      capabilities: {
        toolCallGranularity: 'summary',
        contextTracking: false,
        subAgents: false,
        realtime: false,
        tokenAccounting: 'per-session',
      },
      listSessions: async () => [],
      readSession: async () => { throw new Error('stub'); },
      watch: () => () => { /* noop */ },
    };

    registerProvider(stub);
    expect(getProvider('test-provider-xyz')).toBe(stub);
    expect(listProviders().map((p) => p.id)).toContain('test-provider-xyz');
  });
});
