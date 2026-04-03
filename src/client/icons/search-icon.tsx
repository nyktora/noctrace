import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Magnifying glass — for Grep/Glob tool */
export function SearchIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <circle cx="7" cy="7" r="4.5" />
      <line x1="10.5" y1="10.5" x2="13.5" y2="13.5" />
    </svg>
  );
}
