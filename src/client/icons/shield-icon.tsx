import React from 'react';

/** Props for icon components */
export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Shield icon used to indicate security tips on waterfall rows.
 * Stroke-based, defaults to Catppuccin Mocha red (#f38ba8).
 */
export function ShieldIcon({ size = 12, color = '#f38ba8', className }: IconProps): React.ReactElement {
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
      {/* Shield outline: rounded top, pointed bottom */}
      <path d="M8 2L3 4.5V8.5C3 11.5 5.5 13.8 8 14.5C10.5 13.8 13 11.5 13 8.5V4.5L8 2Z" />
      {/* Exclamation mark body */}
      <line x1="8" y1="6.5" x2="8" y2="9.5" />
      {/* Exclamation mark dot */}
      <circle cx="8" cy="11" r="0.5" fill={color} stroke="none" />
    </svg>
  );
}
