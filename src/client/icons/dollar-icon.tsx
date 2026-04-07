import React from 'react';

/** Dollar sign icon for cost display in the toolbar */
export function DollarIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <line x1="8" y1="2" x2="8" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M5.5 5C5.5 3.895 6.619 3 8 3s2.5.895 2.5 2c0 2.5-5 2-5 4.5 0 1.105 1.119 2 2.5 2s2.5-.895 2.5-2"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
