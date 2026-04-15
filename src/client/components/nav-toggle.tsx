import React from 'react';

import { usePatternsStore } from '../store/patterns-store.ts';
import { WaterfallIcon } from '../icons/waterfall-icon.tsx';
import { GridIcon } from '../icons/grid-icon.tsx';

/**
 * Top-level view toggle: Sessions | Patterns.
 * Sits inside the toolbar. Clicking "Patterns" also triggers a data fetch
 * if no data is loaded yet.
 */
export function NavToggle(): React.ReactElement {
  const view = usePatternsStore((s) => s.view);
  const setView = usePatternsStore((s) => s.setView);
  const fetchPatterns = usePatternsStore((s) => s.fetchPatterns);
  const patternsData = usePatternsStore((s) => s.patternsData);

  function handleClick(v: 'sessions' | 'patterns'): void {
    setView(v);
    if (v === 'patterns' && patternsData === null) {
      void fetchPatterns();
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    fontSize: 11,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--ctp-text)' : 'var(--ctp-overlay0)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 4,
    backgroundColor: active ? 'var(--ctp-surface0)' : 'transparent',
    transition: 'background-color 150ms, color 150ms',
  });

  return (
    <div
      className="flex items-center shrink-0"
      style={{
        gap: 2,
        backgroundColor: 'var(--ctp-crust)',
        border: '1px solid var(--ctp-surface0)',
        borderRadius: 6,
        padding: 2,
      }}
      role="tablist"
      aria-label="View"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === 'sessions'}
        onClick={() => handleClick('sessions')}
        style={tabStyle(view === 'sessions')}
      >
        <WaterfallIcon size={12} color={view === 'sessions' ? 'var(--ctp-mauve)' : 'var(--ctp-overlay0)'} />
        Sessions
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'patterns'}
        onClick={() => handleClick('patterns')}
        style={tabStyle(view === 'patterns')}
      >
        <GridIcon size={12} color={view === 'patterns' ? 'var(--ctp-blue)' : 'var(--ctp-overlay0)'} />
        Patterns
      </button>
    </div>
  );
}
