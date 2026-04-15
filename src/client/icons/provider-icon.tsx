import React from 'react';

/**
 * Generic provider/source icon — a small square with a rounded top and data lines.
 * Used in the session picker to indicate which provider owns the session.
 */
export interface ProviderIconProps {
  size?: number;
  color?: string;
}

export function ProviderIcon({ size = 16, color = 'currentColor' }: ProviderIconProps): React.ReactElement {
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
      aria-hidden="true"
    >
      {/* Server/source shape */}
      <rect x="2" y="4" width="12" height="8" rx="1.5" />
      <line x1="5" y1="8" x2="11" y2="8" />
      <line x1="5" y1="10.5" x2="8.5" y2="10.5" />
      <circle cx="11" cy="5.5" r="0.8" fill={color} stroke="none" />
    </svg>
  );
}
