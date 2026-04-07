import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Arrow pointing out of a box — for export/share actions */
export function ShareIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      {/* Box base */}
      <path d="M3 10v3h10v-3" />
      {/* Arrow up */}
      <line x1="8" y1="2" x2="8" y2="9" />
      <polyline points="5 5 8 2 11 5" />
    </svg>
  );
}
