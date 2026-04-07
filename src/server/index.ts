/**
 * Noctrace server entry point.
 * Single Express process: static SPA + REST API + WebSocket.
 */
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApiRouter } from './routes/api.js';
import { setupWebSocket } from './ws.js';
import { getClaudeHome } from './config.js';

const BASE_PORT = parseInt(process.env['PORT'] ?? '4117', 10);
const MAX_PORT_ATTEMPTS = 10;

/**
 * Starts the HTTP server, retrying with incremented ports on EADDRINUSE.
 * Returns the port the server is actually listening on.
 */
export function startServer(): Promise<number> {
  const claudeHome = getClaudeHome();

  const app = express();
  const server = createServer(app);

  app.use(express.json());

  const wss = setupWebSocket(server, claudeHome);
  app.use('/api', buildApiRouter(claudeHome, wss));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  if (process.env['NODE_ENV'] === 'production') {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const clientDir = path.resolve(__dirname, '../../client');

    app.use(express.static(clientDir));
    app.get('{*path}', (_req, res) => {
      res.sendFile('index.html', { root: clientDir });
    });
  }

  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryListen = (port: number) => {
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          attempt += 1;
          if (attempt >= MAX_PORT_ATTEMPTS) {
            reject(
              new Error(
                `Could not find an available port after ${MAX_PORT_ATTEMPTS} attempts ` +
                  `(tried ${BASE_PORT}–${port}).`,
              ),
            );
            return;
          }
          server.close(() => tryListen(port + 1));
        } else {
          reject(err);
        }
      };

      server.once('error', onError);
      server.listen(port, () => {
        server.removeListener('error', onError);
        console.log(`Noctrace running at http://localhost:${port}`);
        resolve(port);
      });
    };

    tryListen(BASE_PORT);
  });
}

// When this module is run directly (not imported by MCP wrapper or tests), start the server.
// The MCP wrapper and bin/noctrace.js call startServer() themselves.
const isDirectRun = !process.env['NOCTRACE_NO_AUTOSTART'] && process.env['NODE_ENV'] !== 'test';
if (isDirectRun) {
  startServer().catch((err: unknown) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
