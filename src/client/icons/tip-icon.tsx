import React from 'react';

/** Props for icon components */
export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Lightbulb icon used to indicate efficiency tips on waterfall rows.
 * Stroke-based, defaults to Catppuccin Mocha yellow (#f9e2af).
 */
export function TipIcon({ size = 12, color = '#f9e2af', className }: IconProps): React.ReactElement {
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
      {/* Bulb dome */}
      <path d="M8 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5V11H6V9.5C4.8 8.8 4 7.5 4 6a4 4 0 0 1 4-4z" />
      {/* Base cap lines */}
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="6.5" y1="14" x2="9.5" y2="14" />
    </svg>
  );
}
