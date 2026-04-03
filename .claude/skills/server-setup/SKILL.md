---
name: server-setup
description: Noctrace server architecture and API specification. Use when building the Express server, WebSocket handler, file watcher, or REST API endpoints.
---

# Server Setup Specification

## Express Server

Single Express app serving three concerns:

1. **Static files**: serve the Vite-built SPA from `dist/client/`
2. **REST API**: prefixed with `/api/`
3. **WebSocket**: upgrade at `/ws`

```typescript
// src/server/index.ts
import express from "express";
import { createServer } from "http";
import { setupWebSocket } from "./ws";
import { setupRoutes } from "./routes";
import { getClaudeHome } from "./config";

const app = express();
const server = createServer(app);

setupRoutes(app, getClaudeHome());
setupWebSocket(server, getClaudeHome());

// Serve SPA in production
app.use(express.static("dist/client"));
app.get("*", (req, res) => res.sendFile("index.html", { root: "dist/client" }));

const PORT = process.env.PORT || 4117;
server.listen(PORT, () => console.log(`Noctrace running at http://localhost:${PORT}`));
```

## REST API Endpoints

### GET /api/projects

Returns list of Claude Code projects.

```typescript
// Response
interface ProjectListResponse {
  projects: {
    slug: string;         // encoded path (e.g., "-Users-jane-myapp")
    path: string;         // decoded path (e.g., "/Users/jane/myapp")
    sessionCount: number;
    lastModified: string; // ISO-8601
  }[];
}
```

Implementation: read directory listing of `~/.claude/projects/`, decode slugs by replacing `-` with `/`, count JSONL files per project, get latest mtime.

### GET /api/projects/:slug/sessions

Returns sessions for a project, sorted by most recent.

```typescript
interface SessionListResponse {
  sessions: {
    id: string;           // session UUID (filename without .jsonl)
    summary: string;      // first user message or auto-summary
    messageCount: number;
    startTime: string;
    endTime: string;
    hasErrors: boolean;
  }[];
}
```

Implementation: read `sessions-index.json` if it exists, otherwise parse first/last lines of each JSONL file for timestamps and first user message.

### GET /api/sessions/:id

Returns parsed waterfall data for a session.

```typescript
interface SessionDataResponse {
  sessionId: string;
  projectSlug: string;
  startTime: number;      // Unix ms
  endTime: number;        // Unix ms
  rows: WaterfallRow[];   // full parsed waterfall hierarchy
}
```

Implementation: find the JSONL file across all project directories, parse with the JSONL parser, return the WaterfallRow tree.

## WebSocket Protocol

### Connection

Client connects to `ws://localhost:4117/ws?session={sessionId}`.

### Server → Client Messages

```typescript
// New waterfall row (tool_use detected)
{ type: "row:start", row: WaterfallRow }

// Row completed (tool_result received)
{ type: "row:end", id: string, endTime: number, status: "success" | "error", output: string }

// Session ended
{ type: "session:end" }

// Error
{ type: "error", message: string }
```

### Client → Server Messages

```typescript
// Subscribe to a session
{ type: "subscribe", sessionId: string }

// Unsubscribe
{ type: "unsubscribe" }
```

## File Watcher (chokidar)

Watch the active session's JSONL file for changes:

```typescript
import chokidar from "chokidar";

// Watch specific file, not entire directory
const watcher = chokidar.watch(sessionFilePath, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
});

watcher.on("change", () => {
  // Read new lines since last known position (byte offset)
  // Parse new lines
  // Push new events via WebSocket
});
```

Key implementation detail: track the byte offset of the last read position. On file change, read only the new bytes appended since that offset. Parse each new line and emit WebSocket events.

## CLI Entry Point

```typescript
// bin/noctrace.js
#!/usr/bin/env node
import { startServer } from "../dist/server/index.js";
import open from "open";

const port = await startServer();
console.log(`\n  Noctrace running at http://localhost:${port}\n`);
await open(`http://localhost:${port}`);
```

## Error Handling

- If `~/.claude/` doesn't exist: serve the SPA with an empty state and a helpful message
- If a JSONL file is corrupt: skip bad lines, render what's parseable
- If WebSocket disconnects: client auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s)
- If the watched file is deleted: close the watcher, notify client via `session:end`
