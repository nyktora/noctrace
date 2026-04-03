import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Funnel shape — for filter input fields */
export function FilterIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <polygon points="2 3 14 3 9.5 9 9.5 13.5 6.5 12 6.5 9 2 3" />
    </svg>
  );
}
