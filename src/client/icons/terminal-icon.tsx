import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Terminal window — for Bash tool */
export function TerminalIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <polyline points="5 7 7.5 9 5 11" />
      <line x1="9" y1="11" x2="12" y2="11" />
    </svg>
  );
}
