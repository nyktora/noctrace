import type { WaterfallRow } from './types.ts';

/**
 * Structured representation of a parsed filter string.
 * Each field narrows the result set; all active fields are AND-ed.
 * Multiple typeFilters are OR-ed among themselves.
 */
export interface ParsedFilter {
  /** Free-text fragments matched against toolName + label (case-insensitive). */
  textTokens: string[];
  /** Tool-type filters from `type:xxx` tokens (lowercased). OR-ed together. */
  typeFilters: string[];
  /** Minimum duration threshold in milliseconds, from `>NNNs` / `>NNNms`. */
  minDuration: number | null;
  /** Maximum duration threshold in milliseconds, from `<NNNs` / `<NNNms`. */
  maxDuration: number | null;
  /** Row status filters: 'error' | 'running' | 'success'. */
  statusFilters: string[];
  /** Minimum token delta, from `tokens:>NNN`. */
  minTokens: number | null;
  /** Maximum token delta, from `tokens:<NNN`. */
  maxTokens: number | null;
}

/** Special keywords that map directly to status or type filters */
const STATUS_KEYWORDS = new Set(['error', 'running', 'success']);

/**
 * Parses a raw filter string into structured filter components.
 * Tokens are space-separated. Unrecognised tokens become textTokens.
 */
export function parseFilterString(filter: string): ParsedFilter {
  const result: ParsedFilter = {
    textTokens: [],
    typeFilters: [],
    minDuration: null,
    maxDuration: null,
    statusFilters: [],
    minTokens: null,
    maxTokens: null,
  };

  if (!filter.trim()) return result;

  const tokens = filter.trim().split(/\s+/);

  for (const token of tokens) {
    const lower = token.toLowerCase();

    // type:xxx
    if (lower.startsWith('type:')) {
      const typeName = lower.slice(5);
      if (typeName) result.typeFilters.push(typeName);
      continue;
    }

    // tokens:>NNN or tokens:<NNN
    if (lower.startsWith('tokens:')) {
      const rest = lower.slice(7);
      if (rest.startsWith('>')) {
        const n = parseTokenCount(rest.slice(1));
        if (n !== null) result.minTokens = n;
      } else if (rest.startsWith('<')) {
        const n = parseTokenCount(rest.slice(1));
        if (n !== null) result.maxTokens = n;
      }
      continue;
    }

    // >NNNms or >NNNs or >NNN (seconds default)
    if (lower.startsWith('>')) {
      const ms = parseDuration(lower.slice(1));
      if (ms !== null) { result.minDuration = ms; continue; }
    }

    // <NNNms or <NNNs or <NNN (seconds default)
    if (lower.startsWith('<')) {
      const ms = parseDuration(lower.slice(1));
      if (ms !== null) { result.maxDuration = ms; continue; }
    }

    // Special status keywords (backward compat)
    if (STATUS_KEYWORDS.has(lower)) {
      result.statusFilters.push(lower);
      continue;
    }

    // 'agent' keyword: treated as type filter for backward compat
    if (lower === 'agent') {
      result.typeFilters.push('agent');
      continue;
    }

    // Everything else is free text
    result.textTokens.push(lower);
  }

  return result;
}

/**
 * Parses a duration string like "5s", "100ms", or "5" (default seconds).
 * Returns milliseconds, or null if the string is not a valid duration.
 */
function parseDuration(s: string): number | null {
  if (s.endsWith('ms')) {
    const n = Number(s.slice(0, -2));
    return isNaN(n) ? null : n;
  }
  if (s.endsWith('s')) {
    const n = Number(s.slice(0, -1));
    return isNaN(n) ? null : n * 1000;
  }
  // No unit — treat as seconds
  const n = Number(s);
  return isNaN(n) ? null : n * 1000;
}

/**
 * Parses a token count string. Supports plain integers and k/m suffixes (e.g., "1k", "1.5m").
 * Returns null if the string is not parseable.
 */
function parseTokenCount(s: string): number | null {
  const lower = s.toLowerCase();
  if (lower.endsWith('k')) {
    const n = Number(lower.slice(0, -1));
    return isNaN(n) ? null : Math.round(n * 1000);
  }
  if (lower.endsWith('m')) {
    const n = Number(lower.slice(0, -1));
    return isNaN(n) ? null : Math.round(n * 1_000_000);
  }
  const n = Number(lower);
  return isNaN(n) ? null : n;
}

/**
 * Tests whether a row matches a pre-parsed filter.
 * All active filter fields are AND-ed; multiple typeFilters are OR-ed.
 * Agent rows also match when any of their children match.
 */
export function rowMatchesFilter(row: WaterfallRow, parsed: ParsedFilter): boolean {
  // Empty filter — everything matches
  const hasAnyFilter =
    parsed.textTokens.length > 0 ||
    parsed.typeFilters.length > 0 ||
    parsed.minDuration !== null ||
    parsed.maxDuration !== null ||
    parsed.statusFilters.length > 0 ||
    parsed.minTokens !== null ||
    parsed.maxTokens !== null;

  if (!hasAnyFilter) return true;

  // For agent rows, also return true if any child matches
  if (row.type === 'agent' && row.children.length > 0) {
    if (row.children.some((child) => rowMatchesFilter(child, parsed))) return true;
  }

  return rowMatchesDirect(row, parsed);
}

/** Tests a single row (no child traversal) against the parsed filter. */
function rowMatchesDirect(row: WaterfallRow, parsed: ParsedFilter): boolean {
  // Status filter
  if (parsed.statusFilters.length > 0) {
    if (!parsed.statusFilters.includes(row.status)) return false;
  }

  // Type filter (OR among typeFilters)
  if (parsed.typeFilters.length > 0) {
    const rowTypeLower = row.toolName.toLowerCase();
    const rowKind = row.type; // 'agent' | 'tool'
    const matched = parsed.typeFilters.some(
      (tf) => rowTypeLower === tf || rowTypeLower.includes(tf) || rowKind === tf,
    );
    if (!matched) return false;
  }

  // Duration filter
  if (parsed.minDuration !== null) {
    if (row.duration === null || row.duration < parsed.minDuration) return false;
  }
  if (parsed.maxDuration !== null) {
    if (row.duration === null || row.duration > parsed.maxDuration) return false;
  }

  // Token delta filter
  if (parsed.minTokens !== null) {
    if (row.tokenDelta < parsed.minTokens) return false;
  }
  if (parsed.maxTokens !== null) {
    if (row.tokenDelta > parsed.maxTokens) return false;
  }

  // Free-text filter
  if (parsed.textTokens.length > 0) {
    const haystack = (row.toolName + ' ' + row.label).toLowerCase();
    if (!parsed.textTokens.every((t) => haystack.includes(t))) return false;
  }

  return true;
}
