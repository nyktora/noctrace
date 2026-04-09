import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Split-screen icon — two rectangles divided by a vertical line — for compare mode */
export function CompareIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      {/* Left panel */}
      <rect x="1.5" y="3" width="5.5" height="10" rx="1" />
      {/* Right panel */}
      <rect x="9" y="3" width="5.5" height="10" rx="1" />
      {/* Center divider */}
      <line x1="8" y1="2" x2="8" y2="14" />
    </svg>
  );
}
