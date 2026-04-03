import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Animated pulsing circle — indicates a running status */
export function RunningIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <circle cx="8" cy="8" r="6.5" />
      <circle cx="8" cy="8" r="2.5" fill={color} stroke="none">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
