import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Upward arrow — used for positive delta indicators */
export function ArrowUpIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <path d="M8 12V4" />
      <path d="M4 8l4-4 4 4" />
    </svg>
  );
}
