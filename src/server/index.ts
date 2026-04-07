/**
 * Noctrace server entry point.
 * Single Express process: static SPA + REST API + WebSocket.
 */
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApiRouter } from './routes/api';
import { setupWebSocket } from './ws';
import { getClaudeHome } from './config';

const BASE_PORT = parseInt(process.env['PORT'] ?? '4117', 10);
const MAX_PORT_ATTEMPTS = 10;

const claudeHome = getClaudeHome();

const app = express();
const server = createServer(app);

app.use(express.json());

// ---------------------------------------------------------------------------
// WebSocket (set up before API router so wss can be passed to the router)
// ---------------------------------------------------------------------------

const wss = setupWebSocket(server, claudeHome);

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------

app.use('/api', buildApiRouter(claudeHome, wss));

/** Health check endpoint */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// Static SPA (production only)
// ---------------------------------------------------------------------------

if (process.env['NODE_ENV'] === 'production') {
  // In production, compiled server lives at dist/server/server/index.js
  // Vite build output lives at dist/client/
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const clientDir = path.resolve(__dirname, '../../client');

  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile('index.html', { root: clientDir });
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/**
 * Starts the HTTP server, retrying with incremented ports on EADDRINUSE.
 * Returns the port the server is actually listening on.
 */
export function startServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryListen = (port: number) => {
      server.listen(port, () => {
        console.log(`Noctrace running at http://localhost:${port}`);
        resolve(port);
      });

      server.once('error', (err: NodeJS.ErrnoException) => {
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
          // Remove the failed listener before retrying so the next 'error'
          // event on a new attempt is handled cleanly.
          server.removeAllListeners('error');
          tryListen(port + 1);
        } else {
          reject(err);
        }
      });
    };

    tryListen(BASE_PORT);
  });
}

// When this module is run directly (not imported by tests), start the server.
if (process.env['NODE_ENV'] !== 'test') {
  startServer().catch((err: unknown) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export { server };
