import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/**
 * Cloud with X icon indicating an API-level error (rate limit, billing error, server error).
 * Used for stop_failure events that end a Claude turn due to an API problem.
 */
export function ApiErrorIcon({ size = 16, color = '#f38ba8', className }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Cloud shape */}
      <path d="M4.5,10.5 C3,10.5 2,9.5 2,8 C2,6.5 3,5.5 4.5,5.5 C4.5,4 5.5,3 7,3 C8,3 8.8,3.5 9.3,4.2 C9.6,4.1 9.8,4 10,4 C11.3,4 12,4.9 12,6 C13,6.2 13.5,7 13.5,8 C13.5,9.4 12.5,10.5 11,10.5 Z" />
      {/* X mark in lower half */}
      <line x1="5.5" y1="12" x2="10.5" y2="14" />
      <line x1="10.5" y1="12" x2="5.5" y2="14" />
    </svg>
  );
}
