import React from 'react';

/** Props for icon components */
export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Bar-chart icon used to open the session stats panel.
 * Three vertical bars of ascending heights, stroke-based.
 */
export function StatsIcon({ size = 16, color = 'currentColor', className }: IconProps): React.ReactElement {
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
      {/* Left bar — shortest */}
      <line x1="3" y1="12" x2="3" y2="8" />
      {/* Middle bar — tallest */}
      <line x1="8" y1="12" x2="8" y2="4" />
      {/* Right bar — medium */}
      <line x1="13" y1="12" x2="13" y2="6" />
      {/* Baseline */}
      <line x1="1" y1="12" x2="15" y2="12" />
    </svg>
  );
}
