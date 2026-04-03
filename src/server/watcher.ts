/**
 * File system watcher using chokidar.
 * Tracks byte offsets to emit only new JSONL lines on file change.
 */
import chokidar from 'chokidar';
import fs from 'node:fs';
import { parseJsonlContent, parseCompactionBoundaries } from '../shared/parser';
import { computeContextHealth } from '../shared/health';
import type { WaterfallRow, ContextHealth } from '../shared/types';

/** Callbacks provided to watchSession. */
export interface WatcherCallbacks {
  onNewRows: (rows: WaterfallRow[], health: ContextHealth, boundaries: number[]) => void;
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
      bytesRead = fileSize;

      const newContent = buffer.toString('utf8');
      const newRows = parseJsonlContent(newContent);

      if (newRows.length === 0) return;

      // Re-read full file for accurate health score (it's cumulative)
      let fullContent = '';
      try {
        fullContent = fs.readFileSync(filePath, 'utf8');
      } catch {
        fullContent = newContent;
      }

      const boundaries = parseCompactionBoundaries(fullContent);
      const allRows = parseJsonlContent(fullContent);
      const health = computeContextHealth(allRows, boundaries.length);

      callbacks.onNewRows(newRows, health, boundaries);
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
