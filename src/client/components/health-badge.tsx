import React, { useState } from 'react';

import type { HealthGrade } from '../../shared/types.ts';
import { HealthBreakdown } from './health-breakdown.tsx';

/** Props for HealthBadge */
export interface HealthBadgeProps {
  grade: HealthGrade;
  score: number;
}

const GRADE_COLORS: Record<HealthGrade, string> = {
  A: '#a6e3a1',
  B: '#94e2d5',
  C: '#f9e2af',
  D: '#fab387',
  F: '#f38ba8',
};

/**
 * Circular badge showing the context health letter grade.
 * Click toggles the health breakdown panel.
 */
export function HealthBadge({ grade, score }: HealthBadgeProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const color = GRADE_COLORS[grade];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Context Health: ${grade} (${score}/100) — click for breakdown`}
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: `2px solid ${color}`,
          backgroundColor: `${color}18`,
          color,
          fontWeight: 700,
          fontSize: 13,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background-color 150ms',
        }}
      >
        {grade}
      </button>
      {open && <HealthBreakdown onClose={() => setOpen(false)} />}
    </div>
  );
}
