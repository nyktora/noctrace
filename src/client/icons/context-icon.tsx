import React from 'react';

/** Props for icon components */
export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Document-with-layers icon used to indicate Context Startup / loaded instruction files.
 * Stroke-based, defaults to Catppuccin Mocha teal (#94e2d5).
 */
export function ContextIcon({ size = 16, color = '#94e2d5', className }: IconProps): React.ReactElement {
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
      {/* Back layer (shadow document) */}
      <rect x="4" y="2" width="9" height="11" rx="1.5" strokeOpacity="0.4" />
      {/* Front document */}
      <rect x="3" y="3.5" width="9" height="11" rx="1.5" />
      {/* Text lines on front document */}
      <line x1="5.5" y1="7" x2="9.5" y2="7" />
      <line x1="5.5" y1="9.5" x2="10.5" y2="9.5" />
      <line x1="5.5" y1="12" x2="8.5" y2="12" />
    </svg>
  );
}
