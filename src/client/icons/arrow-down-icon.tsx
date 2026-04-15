import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Downward arrow — used for negative delta indicators */
export function ArrowDownIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <path d="M8 4v8" />
      <path d="M4 8l4 4 4-4" />
    </svg>
  );
}
