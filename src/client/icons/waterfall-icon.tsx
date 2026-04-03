import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Waterfall bars logo mark — noctrace brand icon */
export function WaterfallIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <line x1="2" y1="4" x2="9" y2="4" />
      <line x1="4" y1="7" x2="13" y2="7" />
      <line x1="3" y1="10" x2="11" y2="10" />
      <line x1="6" y1="13" x2="14" y2="13" />
    </svg>
  );
}
