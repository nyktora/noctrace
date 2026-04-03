import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Circle with checkmark — indicates a success status */
export function SuccessIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <polyline points="5.5 8.5 7.5 10.5 11 6" />
    </svg>
  );
}
