import React from 'react';

/** Props for TurnIcon */
export interface TurnIconProps {
  size?: number;
  color?: string;
}

/** SVG chat bubble icon for conversation turn rows. */
export function TurnIcon({ size = 16, color = 'currentColor' }: TurnIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 3h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6l-3 2.5V12H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
