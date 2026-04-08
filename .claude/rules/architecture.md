# Architecture Constraints

## Zero-Cloud Policy

- No external HTTP requests from server or client. Everything is local.
- No analytics, telemetry, error reporting services, or CDN dependencies at runtime.
- No `.env` files with API keys. The only configuration is the Claude home directory path.
- External fonts: load from Google Fonts CDN in HTML only. No other external resources.

## Dependency Rules

- Every npm dependency must be MIT or Apache-2.0 licensed. No GPL, AGPL, or copyleft.
- Minimize dependencies. Before adding a package, check if the feature can be done in <50 lines of custom code.
- Pin exact versions in package.json (no `^` or `~`). Use `package-lock.json`.
- Server dependencies: Express, ws, chokidar, open. That's it. Justify any additions.
- Client dependencies: React, Zustand, Tailwind. No charting libraries, no Gantt libraries.

## File System Access

- The server reads from `~/.claude/projects/` only. Never write to this directory.
- Use `os.homedir()` to resolve `~`. Support `CLAUDE_HOME` env var as override.
- File watching via chokidar must use `{ persistent: true, ignoreInitial: true }`.
- Handle file system errors gracefully — the Claude directory might not exist on first run.

## Server Architecture

- Single Express server serves: static SPA files, REST API, and WebSocket upgrade.
- REST endpoints are prefixed with `/api/`.
- WebSocket is mounted at `/ws`. One connection per browser tab.
- No sessions, no cookies, no auth. This is a local-only tool.

## Client Architecture

- SPA with client-side routing (React Router or hash-based).
- The waterfall component is custom-built with positioned `div` elements. No canvas, no SVG charts, no third-party visualization libraries.
- Virtual scrolling required for sessions with 200+ rows. Only render visible rows.
- All colors use CSS custom properties defined in a single theme file. Catppuccin Mocha is the default and only theme for MVP.

## Monorepo Structure

```
noctrace/
├── src/
│   ├── server/          # Express + WebSocket + file watcher
│   │   ├── index.ts     # Entry point
│   │   ├── config.ts    # Server configuration
│   │   ├── routes/      # REST API routes
│   │   ├── watcher.ts   # chokidar file watcher
│   │   └── ws.ts        # WebSocket handler
│   ├── client/          # React SPA
│   │   ├── main.tsx     # Entry point
│   │   ├── components/  # React components
│   │   ├── store/       # Zustand stores
│   │   ├── icons/       # SVG icon components
│   │   └── styles/      # Tailwind config + theme
│   └── shared/          # Shared types and parser
│       ├── types.ts     # TypeScript interfaces
│       └── parser.ts    # JSONL parsing logic
├── bin/
│   ├── noctrace.js      # npm bin entry point
│   └── noctrace-mcp.js  # MCP wrapper entry point
├── .claude-plugin/
│   └── plugin.json      # Claude Code plugin manifest
├── hooks/
│   └── hooks.json       # Hook definitions
├── tests/               # Vitest test files
├── .mcp.json
├── CLAUDE.md
├── PRD.md
└── package.json
```

## CLI Entry Point

- `bin/noctrace.js` is the npm bin entry point.
- It starts the Express server and opens the browser with the `open` package.
- Default port: 4117. Fall back to next available port if busy.
- Print a clean startup message: `Noctrace running at http://localhost:4117`
- `--install-hooks` flag writes Claude Code hook definitions to enable real-time hook events.
- `--uninstall-hooks` flag removes those hook definitions.
- `bin/noctrace-mcp.js` is the MCP wrapper entry point, exposing Noctrace as an MCP server.
