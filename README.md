<p align="center">
  <img src="docs/screenshots/noctrace-logo.svg" alt="noctrace" width="320" />
</p>

<p align="center">
  Chrome DevTools Network-tab-style waterfall visualizer for <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a> agent workflows.
  <br />
  Zero config. Zero cloud. Just run <code>npx noctrace</code> and see what your agents are doing.
</p>

![Noctrace waterfall timeline](docs/screenshots/noctrace-waterfall.png)

## Why

Claude Code's terminal output is opaque. Tool calls show summaries like "Read 3 files" and "Edited 2 files" — no paths, no timing, no concurrency visibility. When sub-agents spawn sub-agents, you're flying blind.

Noctrace reads Claude Code's session logs from `~/.claude/projects/` and renders them as an interactive waterfall timeline — the same visual paradigm that makes Chrome DevTools' Network tab instantly readable.

## Features

- **Waterfall timeline** — horizontal bars on a shared time axis showing tool call concurrency and duration
- **Collapsible agent groups** — sub-agents as expandable row groups with their tool calls nested inside
- **Sub-agent visibility** — parses sub-agent JSONL files to show what happened inside each agent
- **Real-time updates** — file watcher pushes new events via WebSocket as your session runs
- **Context Health grade** — A-F letter grade computed from 5 signals (context fill, compaction count, re-read ratio, error acceleration, tool efficiency) with actionable recommendations
- **Virtual scrolling** — handles sessions with hundreds of tool calls
- **Zoom & pan** — mouse wheel zoom (1-50x), click-drag pan
- **Filtering** — search by tool name, label, or special keywords (`error`, `agent`, `running`)
- **Detail panel** — click any row for full tool input/output, resizable
- **Re-read detection** — flags duplicate file reads that waste context
- **Dark theme** — Catppuccin Mocha palette

### Context Health

![Context health visualization](docs/screenshots/noctrace-context-rot.png)

Noctrace computes a real-time health score from your session data and warns you before context rot degrades output quality. The breakdown panel shows per-signal grades and tells you exactly when to run `/compact`.

## Install

```bash
# Run directly (no install)
npx noctrace

# Or install globally
npm install -g noctrace
noctrace
```

Requires Node.js 20+.

## How it works

1. Starts a local server on `http://localhost:4117` (auto-finds next available port)
2. Opens your browser
3. Reads JSONL session logs from `~/.claude/projects/`
4. Parses tool_use/tool_result pairs into a waterfall timeline
5. Watches active session files for real-time updates via WebSocket

No hooks to install. No config files. No cloud. Everything stays local.

## Development

```bash
git clone https://github.com/nyktora/noctrace.git
cd noctrace
npm install
npm run dev       # starts server + Vite dev server
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Production build (client + server) |
| `npm test` | Run test suite (Vitest) |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |

### Architecture

```
noctrace/
├── src/
│   ├── server/          # Express + WebSocket + file watcher
│   ├── client/          # React 19 SPA
│   │   ├── components/  # Waterfall, detail panel, session picker, health UI
│   │   ├── store/       # Zustand state management
│   │   ├── icons/       # Inline SVG components
│   │   └── hooks/       # WebSocket hook
│   └── shared/          # JSONL parser, types, health scoring
├── tests/               # Vitest tests + JSONL fixtures
├── demo/                # Sample data for testing
└── bin/                 # CLI entry point
```

Single Node.js process serves the SPA, REST API, and WebSocket. No database — JSONL files on disk are the source of truth.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `4117` | Server port (auto-increments if busy) |
| `CLAUDE_HOME` | `~/.claude` | Override Claude home directory |

## Tech Stack

- **Server**: Express 5, ws, chokidar
- **Client**: React 19, Vite 8, Tailwind CSS 4, Zustand 5
- **Tests**: Vitest 4
- **Language**: TypeScript 5.9 (strict mode)

## License

[MIT](LICENSE)
