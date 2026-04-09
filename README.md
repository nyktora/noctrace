<p align="center">
  <img src="docs/screenshots/noctrace-logo.svg" alt="noctrace" width="320" />
</p>

<p align="center">
  Chrome DevTools Network-tab-style waterfall visualizer for <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a> agent workflows.
  <br />
  Zero config. Zero cloud. Just run <code>npx noctrace</code> and see what your agents are doing.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/noctrace"><img src="https://img.shields.io/npm/v/noctrace?color=cb6f10&label=npm" alt="npm version" /></a>
  <a href="https://github.com/nyktora/noctrace/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nyktora/noctrace?color=green" alt="MIT License" /></a>
  <a href="https://www.npmjs.com/package/noctrace"><img src="https://img.shields.io/npm/dm/noctrace?color=blue" alt="npm downloads" /></a>
</p>

---

<p align="center">
  <img src="docs/screenshots/noctrace-demo.gif" alt="Noctrace demo — waterfall timeline, agent groups, detail panel" width="100%" />
</p>

## Why

Claude Code's terminal output is opaque. Tool calls show summaries like "Read 3 files" and "Edited 2 files" — no paths, no timing, no concurrency visibility. When sub-agents spawn sub-agents, you're flying blind.

Noctrace reads Claude Code's session logs from `~/.claude/projects/` and renders them as an interactive waterfall timeline — the same visual paradigm that makes Chrome DevTools' Network tab instantly readable.

## Install

```bash
# Run directly (no install needed)
npx noctrace

# Or install globally
npm install -g noctrace
noctrace
```

### As a Claude Code Plugin

```bash
claude plugin install nyktora/noctrace
```

Requires Node.js 20+. That's it. No config required. Optional hooks for real-time events.

## Features

- **Waterfall timeline** — horizontal bars on a shared time axis showing tool call concurrency and duration
- **Collapsible agent groups** — sub-agents as expandable row groups with real execution time bars showing parallel work
- **Sub-agent visibility** — parses sub-agent JSONL files to show what happened inside each agent
- **Real-time updates** — file watcher pushes new events via WebSocket as your session runs
- **Token drift detection** — tracks how per-turn token cost drifts from baseline, warns when sessions burn excessive quota
- **Context Health grade** — A-F letter grade from 5 signals with actionable recommendations
- **Compact stats pill** — toolbar shows agent count, health grade, drift factor, total tokens, and session duration at a glance
- **Advanced filtering** — structured filter syntax: `type:bash`, `>5s`, `<100ms`, `tokens:>1k`, `error`, `running`, `success` — combinable with plain text search
- **Per-tool latency stats** — Session Stats flyout shows P50/P95/Max latency per tool type; calls exceeding a configurable threshold (default 5s) are flagged with a clock icon
- **Loop detection** — flags 3+ consecutive identical tool calls (same tool + same input) as a warning tip on the row
- **Session comparison** — split-screen view comparing two sessions side-by-side: health grades, summary metrics, tool mix bars, and context fill trajectory sparklines
- **Virtual scrolling** — handles sessions with thousands of tool calls
- **Zoom & pan** — mouse wheel zoom (1-50x), click-drag pan
- **Detail panel** — click any row for full tool input/output, resizable
- **Re-read detection** — flags duplicate file reads that waste context
- **Efficiency tips** — 8 waste patterns detected (re-reads, fan-out, correction loops, repeated commands, token spikes, high fill, no delegation, post-compaction re-reads) with amber lightbulb indicators
- **Security tips** — 13 patterns detect secrets, dangerous commands, exfiltration attempts, prompt injection, and more, with a red shield indicator
- **Markdown rendering** — detail panel renders markdown in tool output with zero dependencies, XSS-safe
- **Dark theme** — Catppuccin Mocha palette
- **Session export** — share sessions as standalone offline HTML files
- **Hooks integration** — optional real-time event streaming from Claude Code
- **Context Drift Rate** — detect accelerating token growth before context rot hits
- **MCP session registry** — when integrated with Claude Code, sessions self-register on start and unregister on exit; dashboard shows only active sessions with a live count indicator
- **Per-tool token cost** — estimated USD cost on every waterfall row and session total in the toolbar; uses Claude's public pricing with per-model detection (Sonnet, Opus, Haiku)
- **Agent type labels** — subagent rows show the named agent type (e.g., "Explore", "core:deep-researcher") as a blue badge chip
- **Tool failure rows** — tool crashes, timeouts, and kills render as distinct red-tinted rows with a lightning bolt icon, separate from normal error results
- **API error markers** — rate limit, billing, and auth failures appear as full-width red alert banners on the timeline
- **Agent Teams panel** — detects running Agent Teams at `~/.claude/teams/`, shows members and task counts in a flyout (`GET /api/teams`)
- **Context Startup flyout** — shows which instruction files (CLAUDE.md and others) loaded at session start with estimated token counts, parsed from JSONL system records

![Noctrace waterfall timeline](docs/screenshots/noctrace-waterfall.gif)

### Token Drift

The stats pill shows a **drift factor** (e.g. `2.8x`) measuring how much each turn costs compared to the session's baseline. A 10x drift means every turn burns 10x more quota than it did at the start. Session picker shows drift per-session so you can spot wasteful sessions at a glance.

### Context Health

![Context health visualization](docs/screenshots/noctrace-context-rot.png)

Noctrace computes a real-time health score from your session data and warns you before context rot degrades output quality. The breakdown panel shows per-signal grades and tells you exactly when to run `/compact`.

| Signal | Weight | What it measures |
|--------|--------|-----------------|
| Context Fill | 40% | How full is the context window (auto-detected per model) |
| Compactions | 25% | Number of lossy compaction events |
| Re-reads | 15% | Duplicate file reads (retrieval failures) |
| Error Rate | 10% | Accelerating errors in second half of session |
| Tool Efficiency | 10% | Declining productive output |

### Detail Panel

![Detail panel with tips](docs/screenshots/noctrace-detail-panel.gif)

Click any row to inspect the full tool input and output. Two-column layout shows the request on the left and response on the right. Resizable, closes with Esc.

## How it works

Noctrace has two modes depending on how you start it:

**Standalone mode** (`npx noctrace`) — scans all of `~/.claude/projects/` and shows every session. Good for reviewing past work or running alongside a session you've already started.

**MCP mode** (via Claude Code integration) — sessions register and unregister themselves automatically. The session picker shows only currently active sessions and a "MCP mode — N active sessions" indicator. Multiple Claude Code sessions share one noctrace dashboard without interference.

In both modes:

1. Starts a local server on `http://localhost:4117` (auto-finds next available port)
2. Opens your browser
3. Reads JSONL session logs from `~/.claude/projects/`
4. Parses tool_use/tool_result pairs into a waterfall timeline
5. Watches active session files for real-time updates via WebSocket

No config files. No cloud. Everything stays local. Optional hooks for richer real-time data.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `4117` | Server port (auto-increments if busy) |
| `CLAUDE_HOME` | `~/.claude` | Override Claude home directory |

| CLI Flag | Description |
|----------|-------------|
| `--install-hooks` | Configure Claude Code to push real-time events to noctrace |
| `--uninstall-hooks` | Remove noctrace hooks from Claude Code |

## Development

```bash
git clone https://github.com/nyktora/noctrace.git
cd noctrace
npm install
npm run dev       # starts server + Vite dev server
```

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Production build (client + server) |
| `npm test` | Run test suite (Vitest) |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |

## Tech Stack

- **Server**: Express 5, ws, chokidar
- **Client**: React 19, Vite 8, Tailwind CSS 4, Zustand 5
- **Tests**: Vitest 4
- **Language**: TypeScript 5.9 (strict mode)

## License

[MIT](LICENSE)

---

<p align="center">
  Created and maintained by <a href="https://nyktora.com">Nyktora Group</a> · Contributions welcome
</p>
