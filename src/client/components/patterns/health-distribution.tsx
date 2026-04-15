import React from 'react';

import type { HealthGradeDist } from '../../store/patterns-store.ts';
import { ArrowUpIcon } from '../../icons/arrow-up-icon.tsx';
import { ArrowDownIcon } from '../../icons/arrow-down-icon.tsx';

/** Props for HealthDistribution */
export interface HealthDistributionProps {
  current: HealthGradeDist;
  previous: HealthGradeDist;
}

const GRADES = ['A', 'B', 'C', 'D', 'F'] as const;
type Grade = (typeof GRADES)[number];

const GRADE_COLORS: Record<Grade, string> = {
  A: '#a6e3a1',
  B: '#94e2d5',
  C: '#f9e2af',
  D: '#fab387',
  F: '#f38ba8',
};

/**
 * Five vertical bars labeled A–F.
 * Current window is filled; previous window shows as a ghost outline bar.
 * Below each bar: count + delta arrow relative to previous window.
 */
export function HealthDistribution({ current, previous }: HealthDistributionProps): React.ReactElement {
  // Compute the max count across both windows for scaling
  const maxCount = Math.max(
    ...GRADES.map((g) => Math.max(current[g], previous[g])),
    1,
  );

  const BAR_HEIGHT = 100; // px

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-end',
        justifyContent: 'space-around',
      }}
      role="group"
      aria-label="Health grade distribution"
    >
      {GRADES.map((grade) => {
        const curr = current[grade];
        const prev = previous[grade];
        const delta = curr - prev;
        const currHeight = (curr / maxCount) * BAR_HEIGHT;
        const prevHeight = (prev / maxCount) * BAR_HEIGHT;
        const color = GRADE_COLORS[grade];

        return (
          <div
            key={grade}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              flex: 1,
              minWidth: 0,
            }}
            data-grade={grade}
            data-current={curr}
            data-previous={prev}
          >
            {/* Bar area */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: 48,
                height: BAR_HEIGHT,
                display: 'flex',
                alignItems: 'flex-end',
              }}
            >
              {/* Ghost bar (previous window) */}
              {prev > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '80%',
                    height: prevHeight,
                    border: `1px solid ${color}`,
                    borderRadius: 3,
                    opacity: 0.35,
                    boxSizing: 'border-box',
                  }}
                  aria-hidden="true"
                  title={`Previous: ${prev}`}
                />
              )}
              {/* Filled bar (current window) */}
              {curr > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '80%',
                    height: currHeight,
                    backgroundColor: color,
                    borderRadius: 3,
                    opacity: 0.8,
                  }}
                  title={`Current: ${curr}`}
                />
              )}
              {/* Zero state placeholder */}
              {curr === 0 && prev === 0 && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '80%',
                    height: 2,
                    backgroundColor: 'var(--ctp-surface1)',
                    borderRadius: 1,
                  }}
                  aria-hidden="true"
                />
              )}
            </div>

            {/* Grade label */}
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color,
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {grade}
            </span>

            {/* Count */}
            <span
              style={{
                fontSize: 11,
                fontFamily: 'ui-monospace, monospace',
                color: 'var(--ctp-text)',
                fontWeight: 600,
              }}
            >
              {curr}
            </span>

            {/* Delta arrow */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                height: 14,
              }}
              title={`vs. previous: ${delta >= 0 ? '+' : ''}${delta}`}
            >
              {delta > 0 && (
                <>
                  <ArrowUpIcon size={10} color="var(--ctp-green)" />
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'ui-monospace, monospace',
                      color: 'var(--ctp-green)',
                    }}
                  >
                    {delta}
                  </span>
                </>
              )}
              {delta < 0 && (
                <>
                  <ArrowDownIcon size={10} color="var(--ctp-red)" />
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'ui-monospace, monospace',
                      color: 'var(--ctp-red)',
                    }}
                  >
                    {Math.abs(delta)}
                  </span>
                </>
              )}
              {delta === 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'ui-monospace, monospace',
                    color: 'var(--ctp-overlay0)',
                  }}
                >
                  —
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
