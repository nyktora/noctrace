import React from 'react';

/** Props for HookIcon */
export interface HookIconProps {
  size?: number;
  color?: string;
}

/** SVG hook icon — a small hook/connector shape for hook lifecycle events. */
export function HookIcon({ size = 16, color = 'currentColor' }: HookIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 2v4a3 3 0 0 1-3 3H4a2 2 0 0 0 0 4h1a4 4 0 0 0 4-4V2"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="2" r="1" fill={color} />
    </svg>
  );
}
