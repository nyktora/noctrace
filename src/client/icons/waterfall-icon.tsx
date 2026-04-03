import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Waterfall bars logo mark — noctrace brand icon (multicolor) */
export function WaterfallIcon({ size = 16, className }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="2" y1="4" x2="9" y2="4" stroke="#3fb950" />
      <line x1="2" y1="8" x2="12" y2="8" stroke="#d29922" />
      <line x1="2" y1="12" x2="7" y2="12" stroke="#f85149" />
    </svg>
  );
}
