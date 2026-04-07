/**
 * WebSocket handler for real-time session event streaming.
 * Mounts at /ws. One watcher per connection, cleaned up on disconnect.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import chokidar from 'chokidar';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import { watchSession } from './watcher.js';
import type { WaterfallRow, ContextHealth, DriftAnalysis, HookEventMessage } from '../shared/types.js';

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
  drift: DriftAnalysis;
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

interface SessionCreatedMessage {
  type: 'session-created';
  slug: string;
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
  | SessionCreatedMessage
  | HookEventMessage
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
 *
 * Returns the `WebSocketServer` instance so other modules (e.g. the API
 * router) can broadcast messages to all connected clients.
 */
export function setupWebSocket(server: Server, claudeHome: string): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 64 * 1024,
    verifyClient: ({ origin }: { origin?: string }) => {
      if (!origin) return true; // non-browser clients (curl, wscat)
      try {
        const url = new URL(origin);
        return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      } catch {
        return false;
      }
    },
  });

  // Suppress unhandled WSS errors during port retry (EADDRINUSE propagates here)
  wss.on('error', () => {});

  // Watch the projects directory for new .jsonl session files.
  // When a new file appears, broadcast to all connected clients so they
  // can refresh their session list without a manual page reload.
  const projectsBase = path.join(claudeHome, 'projects');
  const dirWatcher = chokidar.watch(projectsBase, {
    persistent: true,
    ignoreInitial: true,
    depth: 1,
  });

  dirWatcher.on('add', (filePath: string) => {
    if (!filePath.endsWith('.jsonl')) return;
    // Derive the project slug from the parent directory name
    const relative = path.relative(projectsBase, filePath);
    const slug = path.dirname(relative);
    if (!slug || slug === '.') return;

    const msg: SessionCreatedMessage = { type: 'session-created', slug };
    const payload = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  });

  dirWatcher.on('error', (err) => {
    console.warn('[noctrace] dir watcher error:', err instanceof Error ? err.message : String(err));
  });

  wss.on('close', () => {
    dirWatcher.close().catch(() => {});
  });

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
        // Cap message length to prevent abuse via cross-origin or oversized prompts
        if (userMsg.length > 10_000) {
          send(ws, { type: 'resume-error', message: 'Message too long (max 10000 chars)' });
          return;
        }
        // Validate sessionId format — must be a UUID-like string, no dashes-starting args
        if (!/^[a-zA-Z0-9_-]+$/.test(sessionId) || sessionId.startsWith('-')) {
          send(ws, { type: 'resume-error', message: 'Invalid sessionId format' });
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

          // Buffer for incomplete lines from chunked TCP data
          let lineBuffer = '';

          /**
           * Process a complete, newline-terminated stream-json line.
           * Extracts assistant text chunks and ignores result-type messages
           * (the final result is already accumulated via chunk messages).
           */
          const processLine = (line: string): void => {
            if (!line.trim()) return;
            try {
              const obj = JSON.parse(line) as Record<string, unknown>;
              if (obj['type'] === 'assistant') {
                // Extract text from message content blocks
                const msgContent = obj['message'];
                if (typeof msgContent === 'object' && msgContent !== null) {
                  const content = (msgContent as Record<string, unknown>)['content'];
                  if (Array.isArray(content)) {
                    for (const block of content as unknown[]) {
                      if (
                        typeof block === 'object' && block !== null &&
                        (block as Record<string, unknown>)['type'] === 'text' &&
                        typeof (block as Record<string, unknown>)['text'] === 'string'
                      ) {
                        send(ws, { type: 'resume-chunk', text: (block as Record<string, unknown>)['text'] as string });
                      }
                    }
                  }
                } else if (typeof msgContent === 'string') {
                  send(ws, { type: 'resume-chunk', text: msgContent });
                }
              }
              // 'result' type: final accumulated text — no additional chunk needed
              // since assistant chunks have already been streamed incrementally
            } catch {
              // Non-JSON line (e.g. debug output) — ignore silently
            }
          };

          proc.stdout?.on('data', (chunk: Buffer) => {
            lineBuffer += chunk.toString();
            const lines = lineBuffer.split('\n');
            // All but the last element are complete lines; last may be partial
            lineBuffer = lines.pop() ?? '';
            for (const line of lines) {
              processLine(line);
            }
          });

          proc.stdout?.on('end', () => {
            // Flush any remaining buffered content
            if (lineBuffer.trim()) {
              processLine(lineBuffer);
              lineBuffer = '';
            }
          });

          proc.stderr?.on('data', (_chunk: Buffer) => {
            // Intentionally suppress stderr — claude CLI writes progress to stderr
            // which would pollute the chat output with non-content noise
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

      const projectsBase = path.join(claudeHome, 'projects');
      const filePath = path.join(projectsBase, slug, `${id}.jsonl`);
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(projectsBase) + path.sep)) {
        send(ws, { type: 'error', message: 'Invalid path' });
        return;
      }

      const handle = watchSession(filePath, {
        onNewRows: (rows, health, boundaries, drift) => {
          send(ws, { type: 'rows', rows, health, boundaries, drift });
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

  return wss;
}
