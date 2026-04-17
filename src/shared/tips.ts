/**
 * Efficiency tips detection engine.
 * Analyzes WaterfallRow[] and attaches per-row tips for wasteful patterns.
 * Pure module: no file I/O, no side effects beyond mutating the rows array.
 */
import type { WaterfallRow, EfficiencyTip } from './types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Tool names that count as search/read operations for the fan-out detector. */
const SEARCH_TOOLS = new Set(['Grep', 'Glob', 'Read', 'LS']);

/** Tool names that count as write/edit operations (break a fan-out streak). */
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/**
 * Append a tip to a row, skipping duplicates by tip id.
 */
function addTip(row: WaterfallRow, tip: EfficiencyTip): void {
  if (!row.tips.some((t) => t.id === tip.id)) {
    row.tips.push(tip);
  }
}

/**
 * Flatten rows and all their children into a single ordered array.
 * Children are interleaved in-order with their parent's siblings, not appended at the end.
 * For tip detection we need the flat tool-call order as Claude executed them.
 */
function flattenRows(rows: WaterfallRow[]): WaterfallRow[] {
  const result: WaterfallRow[] = [];
  for (const row of rows) {
    result.push(row);
    if (row.children.length > 0) {
      result.push(...flattenRows(row.children));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze rows and attach efficiency tips to wasteful ones. Mutates rows in place.
 *
 * Detection rules:
 * 1. Re-read              — row.isReread is true
 * 2. Search fan-out       — 5+ consecutive search/read tools with no write between them
 * 3. Correction loop      — 3+ edits to the same file_path
 * 4. Repeated Bash        — same command string run 2+ times
 * 5. Large token spike    — row.tokenDelta > 10 000
 * 6. High context fill    — first row where contextFillPercent >= 80
 * 7. No delegation        — 50+ total tool rows with zero agent rows
 * 8. Post-compaction re-read — isReread after a compaction boundary
 * 9. Compaction thrash    — 3+ compaction boundaries (thrash loop)
 * 10. Identical tool loop — 3+ consecutive calls with the same toolName + input key
 *
 * A row may accumulate multiple tips. Duplicate tip ids on the same row are silently skipped.
 *
 * @param rows               Top-level WaterfallRow[] (may include agent rows with children).
 * @param compactionBoundaries Unix-ms timestamps of compact_boundary events in the session.
 */
export function attachEfficiencyTips(rows: WaterfallRow[], compactionBoundaries: number[]): void {
  // Work on a flat ordered list for sequential pattern detection.
  // We still mutate the original row objects so callers see the tips.
  const flat = flattenRows(rows);

  // Pre-sort compaction boundaries ascending for efficient lookups.
  const sortedBoundaries = [...compactionBoundaries].sort((a, b) => a - b);

  /** Returns true if startTime falls after any compaction boundary. */
  function isAfterCompaction(startTime: number): boolean {
    return sortedBoundaries.some((b) => startTime > b);
  }

  // -------------------------------------------------------------------------
  // State for stateful detectors
  // -------------------------------------------------------------------------

  /** Rolling count of consecutive search-tool rows without an intervening write. */
  let fanOutStreak = 0;

  /** Track how many times each file_path has been edited/written. */
  const editCounts = new Map<string, number>();

  /** Track how many times each Bash command has been run. */
  const bashCounts = new Map<string, number>();

  /** Whether we have already attached the high-fill tip. */
  let highFillAttached = false;

  /**
   * State for Rule 10: Identical tool loop.
   * Tracks the key of the last tool call and the consecutive run length.
   */
  let lastToolKey: string | null = null;
  let identicalToolStreak = 0;

  /** Total tool rows (type === 'tool') across the session. */
  let toolRowCount = 0;

  /** Whether any agent row exists in the session. */
  let hasAgentRow = false;

  // Keep a reference to every tool row so we can attach the no-delegation tip later.
  const toolRows: WaterfallRow[] = [];

  // -------------------------------------------------------------------------
  // Main scan
  // -------------------------------------------------------------------------

  for (const row of flat) {
    // Track agent presence for no-delegation detector.
    if (row.type === 'agent') {
      hasAgentRow = true;
    }

    if (row.type !== 'tool') continue;

    toolRowCount++;
    toolRows.push(row);

    // ------------------------------------------------------------------
    // Rule 8: Post-compaction re-read (takes priority over Rule 1)
    // ------------------------------------------------------------------
    if (row.isReread && isAfterCompaction(row.startTime)) {
      addTip(row, {
        id: 'post-compact-reread',
        title: 'Re-read after compaction',
        message:
          'Claude re-read this file after context was compacted, meaning it forgot it had already seen it. ' +
          'Put persistent rules and file references in CLAUDE.md so they survive compaction.',
        severity: 'warning',
      });
    } else if (row.isReread) {
      // ------------------------------------------------------------------
      // Rule 1: Re-read (basic, no compaction involved)
      // ------------------------------------------------------------------
      addTip(row, {
        id: 'reread',
        title: 'File re-read',
        message:
          'This file was already read earlier in the session. Add specific file paths to your prompt ' +
          'so Claude targets them directly instead of re-searching.',
        severity: 'info',
      });
    }

    // ------------------------------------------------------------------
    // Rule 2: Search fan-out
    // ------------------------------------------------------------------
    if (SEARCH_TOOLS.has(row.toolName)) {
      fanOutStreak++;
      if (fanOutStreak === 5) {
        addTip(row, {
          id: 'fan-out',
          title: 'Broad search pattern',
          message:
            "Claude is searching broadly across many files. Scope your request: 'Look in src/auth/' instead of " +
            "'find the auth code'. Or delegate to a subagent.",
          severity: 'warning',
        });
      }
    } else if (WRITE_TOOLS.has(row.toolName)) {
      fanOutStreak = 0;
    }
    // Other tool types (Bash, Agent, etc.) neither extend nor break the streak.

    // ------------------------------------------------------------------
    // Rule 3: Correction loop
    // ------------------------------------------------------------------
    if (WRITE_TOOLS.has(row.toolName)) {
      const fp = typeof row.input['file_path'] === 'string' ? (row.input['file_path'] as string) : null;
      if (fp !== null) {
        const count = (editCounts.get(fp) ?? 0) + 1;
        editCounts.set(fp, count);
        if (count === 3) {
          addTip(row, {
            id: 'correction-loop',
            title: 'Correction loop',
            message:
              "Multiple fixes to the same file. If the approach isn't working, try /clear and rewrite " +
              'your prompt with what you\'ve learned instead of iterating.',
            severity: 'warning',
          });
        }
      }
    }

    // ------------------------------------------------------------------
    // Rule 4: Repeated Bash
    // ------------------------------------------------------------------
    if (row.toolName === 'Bash') {
      const cmd = typeof row.input['command'] === 'string' ? (row.input['command'] as string) : null;
      if (cmd !== null) {
        const count = (bashCounts.get(cmd) ?? 0) + 1;
        bashCounts.set(cmd, count);
        if (count === 2) {
          addTip(row, {
            id: 'repeat-bash',
            title: 'Repeated command',
            message:
              'This command was already run. If it failed before, try a different approach rather than retrying the same command.',
            severity: 'info',
          });
        }
      }
    }

    // ------------------------------------------------------------------
    // Rule 5: Large token spike
    // ------------------------------------------------------------------
    if (row.tokenDelta > 10_000) {
      addTip(row, {
        id: 'token-spike',
        title: 'Large context jump',
        message:
          'This response added 10k+ tokens to context. For verbose outputs, ask Claude to summarize ' +
          'or delegate to a subagent to keep your main context clean.',
        severity: 'warning',
      });
    }

    // ------------------------------------------------------------------
    // Rule 6: High context fill (first crossing of 80%)
    // ------------------------------------------------------------------
    if (!highFillAttached && row.contextFillPercent >= 80) {
      highFillAttached = true;
      addTip(row, {
        id: 'high-fill',
        title: 'Context 80% full',
        message:
          'Run /compact now with a focus directive, or delegate remaining work to subagents. ' +
          'Waiting until 95% means auto-compaction with less control over what\'s preserved.',
        severity: 'critical',
      });
    }

    // ------------------------------------------------------------------
    // Rule 10: Identical tool loop
    // Track 3+ consecutive tool calls with the same toolName + input key.
    // Use first 200 chars of stringified input to avoid perf issues on
    // large inputs while still catching the common stuck-loop pattern.
    // ------------------------------------------------------------------
    const inputKey = row.toolName + ':' + JSON.stringify(row.input).slice(0, 200);
    if (inputKey === lastToolKey) {
      identicalToolStreak++;
      if (identicalToolStreak >= 3) {
        addTip(row, {
          id: 'identical-loop',
          title: 'Identical tool loop',
          message:
            'Same tool called with identical input 3 times consecutively — the agent may be stuck in a loop.',
          severity: 'warning',
        });
      }
    } else {
      lastToolKey = inputKey;
      identicalToolStreak = 1;
    }
  }

  // -------------------------------------------------------------------------
  // Rule 7: No delegation (post-scan)
  // -------------------------------------------------------------------------
  if (toolRowCount > 50 && !hasAgentRow && toolRows.length >= 50) {
    addTip(toolRows[49], {
      id: 'no-delegation',
      title: 'Heavy session without subagents',
      message:
        "This session has 50+ tool calls with no subagent delegation. Add to your CLAUDE.md: " +
        "'Use subagents for any task requiring 10+ file reads.' Subagents run in separate context windows.",
      severity: 'info',
    });
  }

  // -------------------------------------------------------------------------
  // Rule 9: Compaction thrash (post-scan)
  // Triggered when the session has been compacted 3+ times.
  // Attach the tip to the row nearest (at or after) the 3rd compaction boundary.
  // -------------------------------------------------------------------------
  if (sortedBoundaries.length >= 3) {
    const thirdBoundary = sortedBoundaries[2];
    // Find the first tool row whose startTime is at or after the 3rd boundary.
    let targetRow = flat.find((r) => r.type === 'tool' && r.startTime >= thirdBoundary);
    // If no row comes after (session ended right at compaction), use the last tool row.
    if (targetRow === undefined && toolRows.length > 0) {
      targetRow = toolRows[toolRows.length - 1];
    }
    if (targetRow !== undefined) {
      addTip(targetRow, {
        id: 'compaction-thrash',
        title: 'Compaction thrash loop',
        message:
          'This session has been compacted 3+ times, meaning context fills up immediately after each ' +
          'compaction. Start a new session with /clear, or break your work into smaller tasks. ' +
          'Add persistent context to CLAUDE.md so it survives compaction.',
        severity: 'critical',
      });
    }
  }
}
