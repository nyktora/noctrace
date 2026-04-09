import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/**
 * Lightning bolt icon indicating a tool execution failure (crash, timeout, permission denied).
 * Distinct from ErrorIcon which shows a tool that ran and returned an error result.
 */
export function FailureIcon({ size = 16, color = '#f38ba8', className }: IconProps): React.ReactElement {
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
      {/* Lightning bolt: top-right to center, then center to bottom-left */}
      <polyline points="9.5,2 5.5,8.5 8.5,8.5 6.5,14 10.5,7.5 7.5,7.5" />
    </svg>
  );
}
