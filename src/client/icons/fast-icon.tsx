import React from 'react';

/** Props for FastIcon */
export interface FastIconProps {
  size?: number;
  color?: string;
}

/** SVG lightning bolt icon for fast mode indicator. */
export function FastIcon({ size = 16, color = 'currentColor' }: FastIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 1.5L4 9h4l-1 5.5L12 7H8l1-5.5z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
