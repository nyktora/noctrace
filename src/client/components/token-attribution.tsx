import React from 'react';

import type { TokenAttribution } from '../../shared/types.ts';
import { formatTokens } from '../utils/tool-colors.ts';

/** Props for the TokenAttributionBar component */
export interface TokenAttributionBarProps {
  attribution: TokenAttribution;
}

interface Segment {
  label: string;
  value: number;
  color: string;
}

/**
 * Builds the ordered list of attribution segments, filtering out zero-value entries.
 * Order: cacheRead, systemPrompt, userText, toolOutput, toolInput, thinking.
 */
function buildSegments(a: TokenAttribution): Segment[] {
  const raw: Segment[] = [
    { label: 'Cache', value: a.cacheRead, color: '#f9e2af' },      // yellow
    { label: 'System', value: a.systemPrompt, color: '#585b70' },  // gray (surface2)
    { label: 'User', value: a.userText, color: '#94e2d5' },        // teal
    { label: 'Tool out', value: a.toolOutput, color: '#a6e3a1' },  // green
    { label: 'Tool in', value: a.toolInput, color: '#89b4fa' },    // blue
    { label: 'Thinking', value: a.thinking, color: '#cba6f7' },    // purple (mauve)
  ];
  return raw.filter((s) => s.value > 0);
}

/**
 * Horizontal stacked bar + legend showing per-turn token attribution.
 * Pure CSS, no charting libraries. Estimates only — char/4 heuristic.
 */
export function TokenAttributionBar({ attribution }: TokenAttributionBarProps): React.ReactElement | null {
  const segments = buildSegments(attribution);
  if (segments.length === 0) return null;

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  return (
    <div style={{ padding: '6px 12px 8px', borderBottom: '1px solid var(--ctp-surface0)', flexShrink: 0 }}>
      {/* Section label */}
      <div
        className="font-mono"
        style={{ color: 'var(--ctp-overlay0)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}
      >
        Token Attribution (est.)
      </div>

      {/* Stacked bar */}
      <div
        style={{
          display: 'flex',
          height: 6,
          borderRadius: 3,
          overflow: 'hidden',
          backgroundColor: 'var(--ctp-surface0)',
          marginBottom: 5,
        }}
        title={`Total: ~${formatTokens(total)} tokens estimated`}
      >
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          return (
            <div
              key={seg.label}
              style={{ width: `${pct}%`, backgroundColor: seg.color, opacity: 0.85 }}
              title={`${seg.label}: ~${formatTokens(seg.value)} (${pct.toFixed(0)}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          return (
            <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 1,
                  backgroundColor: seg.color,
                  flexShrink: 0,
                  opacity: 0.85,
                }}
              />
              <span
                className="font-mono"
                style={{ color: 'var(--ctp-subtext0)', fontSize: 9 }}
              >
                {seg.label} {pct.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
