import React from 'react';

import type { IconProps } from './chevron-icon.tsx';

/** Pencil — for Write tool */
export function PencilIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H2.5v-2.5z" />
      <line x1="9.5" y1="4.5" x2="11.5" y2="6.5" />
    </svg>
  );
}
