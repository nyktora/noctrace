import React from 'react';

import { getContextHeatColor } from '../utils/tool-colors.ts';

/** Props for HealthBar */
export interface HealthBarProps {
  fillPercent: number;
  grade: string;
}

/**
 * 4px gradient bar spanning the waterfall width showing context health.
 * Transitions from green on the left to the current health color on the right,
 * with width proportional to the context fill percentage.
 */
export function HealthBar({ fillPercent, grade }: HealthBarProps): React.ReactElement {
  const rightColor = getContextHeatColor(fillPercent);
  const clampedPct = Math.min(100, Math.max(0, fillPercent));

  return (
    <div
      style={{
        height: 4,
        backgroundColor: 'var(--ctp-surface0)',
        position: 'relative',
        overflow: 'hidden',
      }}
      title={`Context fill: ${clampedPct.toFixed(0)}% (Grade ${grade})`}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${clampedPct}%`,
          background: `linear-gradient(to right, #a6e3a1, ${rightColor})`,
          transition: 'width 300ms ease',
        }}
      />
    </div>
  );
}
