import React from 'react';

/** Props for icon components */
export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Chevron icon that rotates 90deg when expanded.
 * Points right by default; add CSS rotate(90deg) when expanded.
 */
export function ChevronIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}
