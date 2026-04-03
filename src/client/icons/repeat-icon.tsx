import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Circular arrows — indicates a re-read operation */
export function RepeatIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <path d="M12.5 6.5A5 5 0 1 0 13 9" />
      <polyline points="11 4.5 13 6.5 11 8.5" />
    </svg>
  );
}
