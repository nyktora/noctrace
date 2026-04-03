import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Wrench — for Edit tool */
export function WrenchIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <path d="M13.5 3a3 3 0 0 1-4.24 4.24L4 12.5a1.06 1.06 0 0 1-1.5-1.5l5.26-5.26A3 3 0 0 1 11.5 2a3 3 0 0 1 2 1z" />
      <line x1="11" y1="5" x2="12" y2="4" />
    </svg>
  );
}
