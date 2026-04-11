import React from 'react';

/** Props for icon components */
export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Shield with a checkmark inside — used to open the reliability panel.
 * Stroke-based, consistent with the dev-tool aesthetic.
 */
export function ReliabilityIcon({
  size = 16,
  color = 'currentColor',
  className,
}: IconProps): React.ReactElement {
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
      {/* Shield outline */}
      <path d="M8 2L3 4.5V8.5C3 11.5 5.5 13.8 8 14.5C10.5 13.8 13 11.5 13 8.5V4.5L8 2Z" />
      {/* Checkmark */}
      <polyline points="5.5,8.5 7,10 10.5,6.5" />
    </svg>
  );
}
