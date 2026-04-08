/**
 * File system watcher using chokidar.
 * Tracks byte offsets to emit only new JSONL lines on file change.
 */
import chokidar from 'chokidar';
import fs from 'node:fs';
import { parseJsonlContent, parseCompactionBoundaries } from '../shared/parser.js';
import { computeContextHealth } from '../shared/health.js';
import { parseAssistantTurns, computeDrift } from '../shared/drift.js';
import { attachEfficiencyTips } from '../shared/tips.js';
import { attachSecurityTips } from '../shared/security-tips.js';
import type { WaterfallRow, ContextHealth, DriftAnalysis } from '../shared/types.js';

/** Callbacks provided to watchSession. */
export interface WatcherCallbacks {
  onNewRows: (rows: WaterfallRow[], health: ContextHealth, boundaries: number[], drift: DriftAnalysis) => void;
}

/** Handle returned by watchSession to stop the watcher. */
export interface WatcherHandle {
  stop: () => void;
}

/**
 * Watch a single JSONL session file for appended content.
 * On each file change, reads only the newly appended bytes, parses them into
 * WaterfallRow objects, and calls onNewRows with the new rows, the updated
 * health score (computed from the full file), and compaction boundaries.
 *
 * Uses { persistent: true, ignoreInitial: true } per architecture constraints.
 */
export function watchSession(filePath: string, callbacks: WatcherCallbacks): WatcherHandle {
  let bytesRead = 0;

  const watcher = chokidar.watch(filePath, {
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('change', () => {
    try {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;

      if (fileSize <= bytesRead) {
        // File was truncated or unchanged — reset offset
        bytesRead = 0;
        return;
      }

      // Read only the new bytes
      const newByteCount = fileSize - bytesRead;
      const buffer = Buffer.alloc(newByteCount);
      const fd = fs.openSync(filePath, 'r');
      try {
        fs.readSync(fd, buffer, 0, newByteCount, bytesRead);
      } finally {
        fs.closeSync(fd);
      }

      // Only advance bytesRead for complete lines to avoid partial JSONL reads
      const raw = buffer.toString('utf8');
      const lastNewline = raw.lastIndexOf('\n');
      if (lastNewline === -1) {
        // No complete line yet — wait for next change event
        return;
      }
      bytesRead += Buffer.byteLength(raw.slice(0, lastNewline + 1), 'utf8');

      // Read full file once — needed for accurate health (cumulative metrics)
      // and to produce complete rows with correct parent-child relationships
      let fullContent = '';
      try {
        fullContent = fs.readFileSync(filePath, 'utf8');
      } catch {
        fullContent = buffer.toString('utf8');
      }

      const allRows = parseJsonlContent(fullContent);
      if (allRows.length === 0) return;

      const boundaries = parseCompactionBoundaries(fullContent);
      const health = computeContextHealth(allRows, boundaries.length);
      const turns = parseAssistantTurns(fullContent);
      const drift = computeDrift(turns);

      // Attach efficiency tips to wasteful rows (mutates allRows in place)
      attachEfficiencyTips(allRows, boundaries);

      // Attach security tips (mutates allRows in place)
      attachSecurityTips(allRows);

      callbacks.onNewRows(allRows, health, boundaries, drift);
    } catch (err) {
      console.warn('[noctrace] watcher error:', err instanceof Error ? err.message : String(err));
    }
  });

  watcher.on('error', (err) => {
    console.warn('[noctrace] chokidar error:', err instanceof Error ? err.message : String(err));
  });

  return {
    stop: () => {
      watcher.close().catch((err) => {
        console.warn('[noctrace] watcher close error:', err instanceof Error ? err.message : String(err));
      });
    },
  };
}
