import React from 'react';

import type { DriftRateLabel } from '../../shared/types.ts';

/** Props for DriftRateIcon */
export interface DriftRateIconProps {
  label: DriftRateLabel;
  size?: number;
}

/** Arrow direction icon for Context Drift Rate — up/flat/down based on rate label */
export function DriftRateIcon({ label, size = 16 }: DriftRateIconProps): React.ReactElement {
  const color = label === 'stable'
    ? 'var(--ctp-green)'
    : label === 'rising'
    ? 'var(--ctp-yellow)'
    : label === 'accelerating'
    ? 'var(--ctp-peach)'
    : 'var(--ctp-red)';

  if (label === 'stable') {
    // Flat arrow pointing right
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path
          d="M2 8h12M10 5l4 3-4 3"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // Upward arrow for rising / accelerating / critical
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 14V2M3 7l5-5 5 5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
