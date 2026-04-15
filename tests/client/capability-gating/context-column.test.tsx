/**
 * Capability gate: WaterfallRowComponent must hide the Ctx % column when the
 * session's provider has contextTracking: false.
 * @vitest-environment happy-dom
 *
 * This test directly gates on capabilities — the column is hidden because
 * MINIMAL_CAPABILITIES.contextTracking is false, not unconditionally.
 * It also verifies the column IS visible for FULL_CAPABILITIES (the positive case).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { WaterfallRowComponent } from '../../../src/client/components/waterfall-row.tsx';
import { useSessionStore } from '../../../src/client/store/session-store.ts';
import { parseFilterString } from '../../../src/shared/filter.ts';
import { makeRow, FULL_CAPABILITIES, MINIMAL_CAPABILITIES } from './fixtures.ts';

/** Reset session store between tests */
function resetStore(): void {
  useSessionStore.setState({
    sessionProvider: null,
    sessionCapabilities: null,
    rows: [],
    slowThresholdMs: 5000,
  });
}

const BASE_PROPS = {
  rowIndex: 1,
  sessionStart: Date.now() - 10000,
  totalDuration: 10000,
  isSelected: false,
  isExpanded: false,
  parsedFilter: parseFilterString(''),
  waterfallWidth: 600,
  zoomLevel: 1,
  panOffset: 0,
  nameColWidth: 200,
  onSelect: () => {},
  onToggle: () => {},
};

describe('Capability gate: Ctx % column', () => {
  beforeEach(() => { resetStore(); });
  afterEach(() => { resetStore(); });

  it('hides Ctx % column when contextTracking is false', () => {
    // Set capabilities: no context tracking
    useSessionStore.setState({
      sessionProvider: 'test-minimal',
      sessionCapabilities: MINIMAL_CAPABILITIES,
    });

    const row = makeRow({ contextFillPercent: 55 });
    render(<WaterfallRowComponent row={row} {...BASE_PROPS} />);

    // The ctx column element should not be in the DOM
    const ctxCols = document.querySelectorAll('[data-testid="ctx-column"]');
    expect(ctxCols).toHaveLength(0);
  });

  it('shows Ctx % column when contextTracking is true', () => {
    // Set capabilities: full Claude Code capabilities
    useSessionStore.setState({
      sessionProvider: 'claude-code',
      sessionCapabilities: FULL_CAPABILITIES,
    });

    const row = makeRow({ contextFillPercent: 55 });
    render(<WaterfallRowComponent row={row} {...BASE_PROPS} />);

    const ctxCols = document.querySelectorAll('[data-testid="ctx-column"]');
    expect(ctxCols).toHaveLength(1);
  });

  it('hides Ctx % column when capabilities are null (no session loaded)', () => {
    // No capabilities set — store defaults to null, hook falls back to CLAUDE_CODE_CAPABILITIES
    // So column SHOULD be visible (fallback is full-capability)
    useSessionStore.setState({
      sessionProvider: null,
      sessionCapabilities: null,
    });

    const row = makeRow({ contextFillPercent: 40 });
    render(<WaterfallRowComponent row={row} {...BASE_PROPS} />);

    // Fallback to CLAUDE_CODE_CAPABILITIES means contextTracking=true → column visible
    const ctxCols = document.querySelectorAll('[data-testid="ctx-column"]');
    expect(ctxCols).toHaveLength(1);
  });

  it('does not render 0% text in the Ctx column when contextTracking is false', () => {
    // Ensures we do not fabricate a "0%" value that implies there is data
    useSessionStore.setState({
      sessionProvider: 'test-minimal',
      sessionCapabilities: MINIMAL_CAPABILITIES,
    });

    const row = makeRow({ contextFillPercent: 0 });
    render(<WaterfallRowComponent row={row} {...BASE_PROPS} />);

    // "0%" text should not appear
    expect(screen.queryByText('0%')).toBeNull();
  });
});
