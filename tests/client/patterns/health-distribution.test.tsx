/**
 * Tests for HealthDistribution component.
 * @vitest-environment happy-dom
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { HealthDistribution } from '../../../src/client/components/patterns/health-distribution.tsx';
import { FIXTURE_PATTERNS } from './fixture.ts';

const { current, previous } = FIXTURE_PATTERNS.healthDist;

describe('HealthDistribution', () => {
  it('renders all five grade labels', () => {
    render(<HealthDistribution current={current} previous={previous} />);
    for (const grade of ['A', 'B', 'C', 'D', 'F']) {
      const labels = screen.getAllByText(grade);
      expect(labels.length).toBeGreaterThan(0);
    }
  });

  it('shows current counts', () => {
    render(<HealthDistribution current={current} previous={previous} />);
    // A = 12, B = 15, C = 8, D = 5, F = 2
    // Use data-current attributes to find the count per grade unambiguously
    const gradeA = screen.getByRole('group').querySelector('[data-grade="A"]')!;
    const gradeF = screen.getByRole('group').querySelector('[data-grade="F"]')!;
    expect(gradeA.getAttribute('data-current')).toBe('12');
    expect(gradeF.getAttribute('data-current')).toBe('2');
    // B, C, D via text (no ambiguity for 15, 8, 5)
    expect(screen.getByText('15')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('shows upward delta arrow for grade A (curr 12 > prev 10)', () => {
    render(<HealthDistribution current={current} previous={previous} />);
    const gradeA = screen.getByRole('group').querySelector('[data-grade="A"]');
    expect(gradeA).toBeTruthy();
    // Delta = +2: should show an ArrowUp (svg with positive indicator)
    // We check the delta text "+2" rendered as "2" beside the arrow
    const deltaText = gradeA!.querySelector('[title="vs. previous: +2"]');
    expect(deltaText).toBeTruthy();
  });

  it('shows no-change indicator when delta is zero (grade F: curr=2, prev=2)', () => {
    render(<HealthDistribution current={current} previous={previous} />);
    const gradeF = screen.getByRole('group').querySelector('[data-grade="F"]');
    expect(gradeF).toBeTruthy();
    // delta is 0 — should show "—"
    expect(gradeF!.textContent).toContain('—');
  });

  it('renders ghost bar for previous window when prev > 0', () => {
    render(<HealthDistribution current={current} previous={previous} />);
    // Ghost bars have title="Previous: N"
    const ghostBars = document.querySelectorAll('[title^="Previous:"]');
    // grades A(10), B(12), C(7), D(4) have prev > 0; F has prev=2 too → all 5
    expect(ghostBars.length).toBe(5);
  });

  it('handles all-zero data gracefully', () => {
    const zero = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    render(<HealthDistribution current={zero} previous={zero} />);
    // Still renders 5 grade labels
    expect(screen.getAllByText('0').length).toBe(5);
  });

  it('correctly shows downward delta arrow when current < previous', () => {
    const curr = { A: 5, B: 15, C: 8, D: 5, F: 2 };
    const prev = { A: 10, B: 12, C: 7, D: 4, F: 2 };
    render(<HealthDistribution current={curr} previous={prev} />);
    const gradeA = screen.getByRole('group').querySelector('[data-grade="A"]');
    // delta = -5 — title should say "-5"
    const deltaEl = gradeA!.querySelector('[title="vs. previous: -5"]');
    expect(deltaEl).toBeTruthy();
  });
});
