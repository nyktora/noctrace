import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Triangle with exclamation — warning/context fill indicator */
export function WarningIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <path d="M8 2.5L14 13H2z" />
      <line x1="8" y1="7" x2="8" y2="10" />
      <circle cx="8" cy="11.5" r="0.5" fill={color} stroke="none" />
    </svg>
  );
}
