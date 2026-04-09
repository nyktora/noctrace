import React from 'react';

/** Props for icon components */
export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * People/group icon used to indicate Agent Teams.
 * Stroke-based, defaults to Catppuccin Mocha blue (#89b4fa).
 */
export function TeamIcon({ size = 16, color = '#89b4fa', className }: IconProps): React.ReactElement {
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
      {/* Left person head */}
      <circle cx="5" cy="5" r="1.5" />
      {/* Left person body */}
      <path d="M2 13c0-1.5 1-2.5 3-2.5" />
      {/* Right person head */}
      <circle cx="11" cy="5" r="1.5" />
      {/* Right person body */}
      <path d="M14 13c0-1.5-1-2.5-3-2.5" />
      {/* Center person head */}
      <circle cx="8" cy="4.5" r="1.8" />
      {/* Center person body */}
      <path d="M4.5 13c0-2 1.5-3 3.5-3s3.5 1 3.5 3" />
    </svg>
  );
}
