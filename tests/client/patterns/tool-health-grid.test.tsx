/**
 * Tests for ToolHealthGrid component.
 * @vitest-environment happy-dom
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ToolHealthGrid } from '../../../src/client/components/patterns/tool-health-grid.tsx';
import { FIXTURE_PATTERNS } from './fixture.ts';

const { toolHealth } = FIXTURE_PATTERNS;

describe('ToolHealthGrid', () => {
  it('renders all tool rows in order (highest failPct first)', () => {
    render(<ToolHealthGrid tools={toolHealth} />);
    const rows = screen.getAllByRole('row');
    // rows[0] = header; rows[1..] = data rows
    expect(rows[1].textContent).toContain('Bash');   // failPct 0.067 — highest
    expect(rows[2].textContent).toContain('Read');   // failPct 0.01
    expect(rows[3].textContent).toContain('Edit');   // failPct 0
  });

  it('shows tool names', () => {
    render(<ToolHealthGrid tools={toolHealth} />);
    expect(screen.getByText('Bash')).toBeTruthy();
    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
  });

  it('colors Fail % red for Bash (6.7% > 5%)', () => {
    render(<ToolHealthGrid tools={toolHealth} />);
    const bashFailPct = document.querySelector('[data-testid="fail-pct-Bash"]') as HTMLElement;
    expect(bashFailPct).toBeTruthy();
    expect(bashFailPct.style.color).toBe('var(--ctp-red)');
  });

  it('colors Fail % yellow for Read (1.0% is in 1-5% range)', () => {
    render(<ToolHealthGrid tools={toolHealth} />);
    const readFailPct = document.querySelector('[data-testid="fail-pct-Read"]') as HTMLElement;
    expect(readFailPct).toBeTruthy();
    expect(readFailPct.style.color).toBe('var(--ctp-yellow)');
  });

  it('colors Fail % green for Edit (0% < 1%)', () => {
    render(<ToolHealthGrid tools={toolHealth} />);
    const editFailPct = document.querySelector('[data-testid="fail-pct-Edit"]') as HTMLElement;
    expect(editFailPct).toBeTruthy();
    expect(editFailPct.style.color).toBe('var(--ctp-green)');
  });

  it('colors p95 red for Bash (8500ms > 5s)', () => {
    render(<ToolHealthGrid tools={toolHealth} />);
    const bashP95 = document.querySelector('[data-testid="p95-Bash"]') as HTMLElement;
    expect(bashP95).toBeTruthy();
    expect(bashP95.style.color).toBe('var(--ctp-red)');
  });

  it('colors p95 green for Read (900ms < 1s)', () => {
    render(<ToolHealthGrid tools={toolHealth} />);
    const readP95 = document.querySelector('[data-testid="p95-Read"]') as HTMLElement;
    expect(readP95).toBeTruthy();
    expect(readP95.style.color).toBe('var(--ctp-green)');
  });

  it('formats latency values correctly', () => {
    render(<ToolHealthGrid tools={toolHealth} />);
    // Bash p50 = 1200ms → "1.2s"
    expect(screen.getByText('1.2s')).toBeTruthy();
    // Bash p95 = 8500ms → "8.5s"
    expect(screen.getByText('8.5s')).toBeTruthy();
    // Read p95 = 900ms → "900ms"
    expect(screen.getByText('900ms')).toBeTruthy();
  });

  it('shows empty state when no tools', () => {
    render(<ToolHealthGrid tools={[]} />);
    expect(screen.getByText(/No tool data/i)).toBeTruthy();
  });

  it('shows call counts', () => {
    render(<ToolHealthGrid tools={toolHealth} />);
    expect(screen.getByText('450')).toBeTruthy();
    expect(screen.getByText('300')).toBeTruthy();
    expect(screen.getByText('200')).toBeTruthy();
  });

  it('shows delta indicator for Bash (calls 450 vs prev 400 = +50)', () => {
    render(<ToolHealthGrid tools={toolHealth} />);
    const bashRow = screen.getByText('Bash').closest('[role="row"]')!;
    // +50 delta shown as "50" next to arrow
    expect(bashRow.textContent).toContain('50');
  });

  it('shows downward delta for Read (calls 300 vs prev 320 = -20)', () => {
    render(<ToolHealthGrid tools={toolHealth} />);
    const readRow = screen.getByText('Read').closest('[role="row"]')!;
    expect(readRow.textContent).toContain('20');
  });
});
