import React from 'react';

/** Props for PatternsPanel */
export interface PatternsPanelProps {
  title: string;
  children: React.ReactNode;
  /** Optional right-side header content (e.g. sort controls) */
  headerRight?: React.ReactNode;
}

/**
 * Generic card shell used by all three Patterns sub-panels.
 * Provides consistent border, padding, and title styling that matches
 * the existing dark-theme flyout panels (reliability, session stats).
 */
export function PatternsPanel({ title, children, headerRight }: PatternsPanelProps): React.ReactElement {
  return (
    <div
      style={{
        backgroundColor: 'var(--ctp-mantle)',
        border: '1px solid var(--ctp-surface0)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--ctp-surface0)',
          backgroundColor: 'var(--ctp-crust)',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--ctp-overlay1)',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          {title}
        </span>
        {headerRight !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {headerRight}
          </div>
        )}
      </div>
      {/* Panel body */}
      <div style={{ padding: '12px' }}>
        {children}
      </div>
    </div>
  );
}
