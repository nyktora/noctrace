import type { WaterfallRow } from '../../shared/types.ts';

/** Maps tool names to their CSS color variables */
export function getToolColor(toolName: string, status?: string): string {
  if (status === 'error') return 'var(--color-error)';
  if (status === 'running') return 'var(--color-running)';

  const name = toolName.toLowerCase();

  if (name === 'read' || name === 'readfile') return 'var(--color-read)';
  if (name === 'write' || name === 'writefile') return 'var(--color-write)';
  if (name === 'edit' || name === 'multiedit') return 'var(--color-edit)';
  if (name === 'bash' || name === 'execute') return 'var(--color-bash)';
  if (name === 'task' || name === 'agent' || name === 'dispatch_agent') return 'var(--color-agent)';
  if (name === 'grep' || name === 'glob' || name === 'search') return 'var(--color-grep)';
  if (name.startsWith('mcp__')) return 'var(--ctp-teal)';

  return 'var(--ctp-overlay0)';
}

/** Returns hex value for a tool color (for inline SVG use) */
const COLOR_HEX: Record<string, string> = {
  'var(--color-read)': '#89b4fa',
  'var(--color-write)': '#a6e3a1',
  'var(--color-edit)': '#f9e2af',
  'var(--color-bash)': '#fab387',
  'var(--color-agent)': '#cba6f7',
  'var(--color-grep)': '#94e2d5',
  'var(--color-error)': '#f38ba8',
  'var(--color-running)': '#f5c2e7',
  'var(--ctp-overlay0)': '#6c7086',
  'var(--ctp-teal)': '#94e2d5',
};

/** Resolves a CSS variable color string to its hex value */
export function resolveColor(cssVar: string): string {
  return COLOR_HEX[cssVar] ?? '#6c7086';
}

/** Formats a duration in milliseconds to a human-readable string */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m${s}s`;
}

/** Formats a token count with k suffix for large values */
export function formatTokens(n: number): string {
  if (n === 0) return '—';
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

/** Formats a relative time from an ISO date string */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  return `${diffDay}d ago`;
}

/** Returns the heat color for a context fill percentage */
export function getContextHeatColor(pct: number): string {
  if (pct < 50) return '#a6e3a1'; // green
  if (pct < 65) return '#94e2d5'; // teal
  if (pct < 80) return '#f9e2af'; // yellow
  if (pct < 90) return '#fab387'; // peach
  return '#f38ba8'; // red
}

/** Checks if a row matches the filter text */
export function rowMatchesFilter(row: WaterfallRow, filter: string): boolean {
  if (!filter) return true;
  const lower = filter.toLowerCase();
  if (lower === 'error') return row.status === 'error';
  if (lower === 'agent') return row.type === 'agent';
  if (lower === 'running') return row.status === 'running';
  return (
    row.toolName.toLowerCase().includes(lower) ||
    row.label.toLowerCase().includes(lower)
  );
}
