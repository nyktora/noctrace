/**
 * WebSocket handler for real-time session event streaming.
 * Mounts at /ws. One watcher per connection, cleaned up on disconnect.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
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

interface ResumeMessage {
  type: 'resume';
  sessionId: string;
  message: string;
  fork?: boolean;
}

interface ResumeCancelMessage {
  type: 'resume-cancel';
}

type ClientMessage = WatchMessage | UnwatchMessage | ResumeMessage | ResumeCancelMessage;

interface RowsServerMessage {
  type: 'rows';
  rows: WaterfallRow[];
  health: ContextHealth;
  boundaries: number[];
}

interface ResumeChunkMessage {
  type: 'resume-chunk';
  text: string;
}

interface ResumeDoneMessage {
  type: 'resume-done';
  exitCode: number | null;
}

interface ResumeErrorMessage {
  type: 'resume-error';
  message: string;
}

interface ErrorServerMessage {
  type: 'error';
  message: string;
}

type ServerMessage =
  | RowsServerMessage
  | ResumeChunkMessage
  | ResumeDoneMessage
  | ResumeErrorMessage
  | ErrorServerMessage;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isClientMessage(val: unknown): val is ClientMessage {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return obj['type'] === 'watch' || obj['type'] === 'unwatch'
    || obj['type'] === 'resume' || obj['type'] === 'resume-cancel';
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
    let resumeProc: ChildProcess | null = null;

    const stopCurrent = () => {
      if (stopWatcher) {
        stopWatcher();
        stopWatcher = null;
      }
    };

    const killResume = () => {
      if (resumeProc) {
        resumeProc.kill('SIGTERM');
        resumeProc = null;
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

      if (parsed.type === 'resume-cancel') {
        killResume();
        return;
      }

      if (parsed.type === 'resume') {
        killResume();
        const { sessionId, message: userMsg, fork } = parsed;
        if (!sessionId || !userMsg) {
          send(ws, { type: 'resume-error', message: 'resume requires sessionId and message' });
          return;
        }

        const args = ['--resume', sessionId, '--print', '--verbose', '--output-format', 'stream-json'];
        if (fork) args.push('--fork-session');
        args.push(userMsg);

        try {
          const proc = spawn('claude', args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
          });
          resumeProc = proc;

          proc.stdout?.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            // Parse stream-json lines for assistant text
            for (const line of text.split('\n')) {
              if (!line.trim()) continue;
              try {
                const obj = JSON.parse(line) as Record<string, unknown>;
                if (obj['type'] === 'assistant' && typeof obj['message'] === 'string') {
                  send(ws, { type: 'resume-chunk', text: obj['message'] as string });
                } else if (obj['type'] === 'result' && typeof obj['result'] === 'string') {
                  send(ws, { type: 'resume-chunk', text: obj['result'] as string });
                }
              } catch {
                // Not JSON or partial line — send raw
                send(ws, { type: 'resume-chunk', text: line });
              }
            }
          });

          proc.stderr?.on('data', (chunk: Buffer) => {
            send(ws, { type: 'resume-chunk', text: chunk.toString() });
          });

          proc.on('close', (code) => {
            send(ws, { type: 'resume-done', exitCode: code });
            if (resumeProc === proc) resumeProc = null;
          });

          proc.on('error', (err) => {
            send(ws, { type: 'resume-error', message: err.message });
            if (resumeProc === proc) resumeProc = null;
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          send(ws, { type: 'resume-error', message: msg });
        }
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
      killResume();
    });

    ws.on('error', (err) => {
      console.warn('[noctrace] ws error:', err.message);
      stopCurrent();
      killResume();
    });
  });
}
