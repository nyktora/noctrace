/**
 * WebSocket handler for real-time session event streaming.
 * Mounts at /ws. One watcher per connection, cleaned up on disconnect.
 */
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import { watchSession } from './watcher';
import type { WaterfallRow, ContextHealth } from '../shared/types';

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface WatchMessage {
  type: 'watch';
  slug: string;
  id: string;
}

interface UnwatchMessage {
  type: 'unwatch';
}

type ClientMessage = WatchMessage | UnwatchMessage;

interface RowsServerMessage {
  type: 'rows';
  rows: WaterfallRow[];
  health: ContextHealth;
  boundaries: number[];
}

interface ErrorServerMessage {
  type: 'error';
  message: string;
}

type ServerMessage = RowsServerMessage | ErrorServerMessage;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isClientMessage(val: unknown): val is ClientMessage {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return obj['type'] === 'watch' || obj['type'] === 'unwatch';
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attach a WebSocketServer to the given HTTP server, mounted at path /ws.
 * Handles watch/unwatch messages from clients and streams new session rows
 * back in real time using chokidar file watching.
 */
export function setupWebSocket(server: Server, claudeHome: string): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    let stopWatcher: (() => void) | null = null;

    const stopCurrent = () => {
      if (stopWatcher) {
        stopWatcher();
        stopWatcher = null;
      }
    };

    ws.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        send(ws, { type: 'error', message: 'Invalid JSON message' });
        return;
      }

      if (!isClientMessage(parsed)) {
        send(ws, { type: 'error', message: 'Unknown message type' });
        return;
      }

      if (parsed.type === 'unwatch') {
        stopCurrent();
        return;
      }

      // Watch message
      const { slug, id } = parsed;
      if (!slug || !id) {
        send(ws, { type: 'error', message: 'watch message requires slug and id' });
        return;
      }

      // Stop any existing watcher before starting a new one
      stopCurrent();

      const filePath = path.join(claudeHome, 'projects', slug, `${id}.jsonl`);

      const handle = watchSession(filePath, {
        onNewRows: (rows, health, boundaries) => {
          send(ws, { type: 'rows', rows, health, boundaries });
        },
      });

      stopWatcher = handle.stop;
    });

    ws.on('close', () => {
      stopCurrent();
    });

    ws.on('error', (err) => {
      console.warn('[noctrace] ws error:', err.message);
      stopCurrent();
    });
  });
}
