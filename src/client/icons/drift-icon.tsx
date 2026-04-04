import React from 'react';

/** Ascending trend line icon for token drift indicator */
export function DriftIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <polyline
        points="2,12 6,8 10,10 14,3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="11,3 14,3 14,6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
