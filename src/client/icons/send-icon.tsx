import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Paper plane — for sending messages */
export function SendIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <path d="M14 2L7.5 8.5" />
      <path d="M14 2L9.5 14L7.5 8.5L2 6.5L14 2Z" />
    </svg>
  );
}
