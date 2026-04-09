import React from 'react';

/** Props for icon components */
export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Clock icon used to indicate slow tool calls in the waterfall.
 * Circle with hour and minute hands, stroke-based.
 */
export function ClockIcon({ size = 12, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      {/* Clock face */}
      <circle cx="8" cy="8" r="6" />
      {/* Hour hand pointing up-left (~10 o'clock) */}
      <line x1="8" y1="8" x2="5.5" y2="5" />
      {/* Minute hand pointing right (~12 o'clock, short) */}
      <line x1="8" y1="8" x2="8" y2="4.5" />
    </svg>
  );
}
