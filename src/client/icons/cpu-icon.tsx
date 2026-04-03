import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** CPU/chip grid — for Task/Agent tool */
export function CpuIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <rect x="4.5" y="4.5" width="7" height="7" rx="1" />
      <line x1="6.5" y1="4.5" x2="6.5" y2="2.5" />
      <line x1="9.5" y1="4.5" x2="9.5" y2="2.5" />
      <line x1="6.5" y1="11.5" x2="6.5" y2="13.5" />
      <line x1="9.5" y1="11.5" x2="9.5" y2="13.5" />
      <line x1="4.5" y1="6.5" x2="2.5" y2="6.5" />
      <line x1="4.5" y1="9.5" x2="2.5" y2="9.5" />
      <line x1="11.5" y1="6.5" x2="13.5" y2="6.5" />
      <line x1="11.5" y1="9.5" x2="13.5" y2="9.5" />
    </svg>
  );
}
