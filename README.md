<p align="center">
  <img src="docs/screenshots/noctrace-logo.svg" alt="noctrace" width="320" />
</p>

<p align="center">
  Open-source observability for AI coding agent workflows — supports <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a>, <a href="https://github.com/openai/codex">Codex CLI</a>, and <a href="https://github.com/features/copilot">GitHub Copilot Chat</a>.
  Chrome DevTools Network-tab-style waterfall visualizer that monitors tool calls, tracks token usage, and detects context rot — all locally, with zero config.
  <br /><br />
  Noctrace auto-detects sessions from all three providers and renders them as an interactive waterfall timeline.
  See every tool call, sub-agent spawn, token cost, and context window fill level at a glance.
  Built for developers who want to understand what their AI agents are actually doing.
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

## Why Noctrace?

AI agent terminal outputs are opaque. Tool calls show summaries like "Read 3 files" and "Edited 2 files" — no paths, no timing, no concurrency visibility. When sub-agents spawn sub-agents, you're flying blind.

Noctrace auto-detects sessions from Claude Code, Codex CLI, and Copilot Chat and renders them as an interactive waterfall timeline — the same visual paradigm that makes Chrome DevTools' Network tab instantly readable.

- **Waterfall timeline** — See tool calls laid out on a time axis, just like Chrome DevTools Network tab
- **Sub-agent visibility** — Expandable agent rows show nested tool calls from Explore, Plan, and custom agents
- **Context health scoring** — A-F grade based on context fill, compaction frequency, re-reads, and error acceleration
- **Token cost tracking** — Per-row USD estimates using per-model pricing (Opus, Sonnet, Haiku for Claude; GPT-4o for Codex)
- **Efficiency and security tips** — Automatic detection of wasteful patterns and security anti-patterns
- **Zero config** — Just run `npx noctrace` and it auto-detects sessions from all supported providers

## Install

```bash
npx noctrace
```

That's it. No config required. Noctrace starts a local server, opens your browser, and auto-detects sessions from Claude Code, Codex CLI, and Copilot Chat immediately.

```bash
# Or install globally
npm install -g noctrace
noctrace
```

### As a Claude Code Plugin

```bash
claude plugin install nyktora/noctrace
```

Requires Node.js 20+. Optional `--install-hooks` flag enables real-time hook events from Claude Code.

## Supported providers

Noctrace reads sessions from multiple AI coding tools automatically — no configuration required for any of them:

| Provider | Source | Badge |
|---|---|---|
| **Claude Code** | `~/.claude/projects/` JSONL session logs | (default) |
| **OpenAI Codex CLI** | `~/.codex/sessions/` rollout JSONL files | orange `codex` |
| **GitHub Copilot Chat** | VS Code workspaceStorage JSON session files | blue `copilot` |

All three show up in the same session picker. Context health scoring and token cost are available for Claude Code and Codex sessions. Copilot sessions show the waterfall timeline and tool call detail panel; token tracking is not available because Copilot Chat does not expose token counts.

## Features

- **Waterfall Timeline Visualization** — horizontal bars on a shared time axis showing tool call concurrency and duration, just like Chrome DevTools Network tab
- **Sub-Agent Waterfall Visualization** — collapsible agent row groups with real execution time bars; parses sub-agent JSONL files to show what happened inside each agent
- **Real-Time Session Monitoring** — file watcher pushes new events via WebSocket as your Claude Code session runs
- **Token Drift Detection** — tracks how per-turn token cost drifts from baseline, warns when sessions burn excessive quota
- **Context Health Scoring** — A-F letter grade from 5 signals with actionable recommendations for when to run `/compact`
- **Compact Stats Toolbar** — shows agent count, health grade, drift factor, total tokens, and session duration at a glance
- **Advanced Filtering** — structured filter syntax: `type:bash`, `>5s`, `<100ms`, `tokens:>1k`, `error`, `running`, `success` — combinable with plain text search
- **Per-Tool Latency Stats** — Session Stats flyout shows P50/P95/Max latency per tool type; calls exceeding a configurable threshold (default 5s) are flagged with a clock icon
- **Loop Detection** — flags 3+ consecutive identical tool calls (same tool + same input) as a warning tip on the row
- **Session Comparison** — split-screen view comparing two Claude Code sessions side-by-side: health grades, summary metrics, tool mix bars, and context fill trajectory sparklines
- **Virtual Scrolling** — handles sessions with thousands of tool calls without performance degradation
- **Zoom and Pan** — mouse wheel zoom (1-50x), click-drag pan on the timeline
- **Detail Panel** — click any row for full tool input/output, resizable two-column layout
- **Re-Read Detection** — flags duplicate file reads that waste context window space
- **Efficiency Tips** — 8 waste patterns detected (re-reads, fan-out, correction loops, repeated commands, token spikes, high fill, no delegation, post-compaction re-reads) with amber lightbulb indicators
- **Security Tips** — 13 patterns detect secrets, dangerous commands, exfiltration attempts, prompt injection, and more, with a red shield indicator
- **Markdown Rendering** — detail panel renders markdown in tool output with zero dependencies, XSS-safe
- **Session Export** — share sessions as standalone offline HTML files, no server required
- **Claude Code Hook Integration** — optional real-time event streaming from Claude Code via `--install-hooks`
- **Context Drift Rate** — detects accelerating token growth before context rot degrades output quality
- **MCP Session Registry** — sessions self-register and unregister automatically; dashboard shows only active sessions with a live count indicator
- **Per-Tool Token Cost Estimation** — estimated USD cost on every waterfall row and session total in the toolbar; uses Claude's public pricing with per-model detection (Sonnet, Opus, Haiku)
- **Agent Type Labels** — sub-agent rows show the named agent type (e.g., "Explore", "core:deep-researcher") as a blue badge chip
- **Tool Failure Rows** — tool crashes, timeouts, and kills render as distinct red-tinted rows with a lightning bolt icon, separate from normal error results
- **API Error Markers** — rate limit, billing, and auth failures appear as full-width red alert banners on the timeline
- **Agent Teams Panel** — detects running Agent Teams at `~/.claude/teams/`, shows members and task counts in a flyout
- **Context Startup Flyout** — shows which instruction files (CLAUDE.md and others) loaded at session start with estimated token counts, parsed from JSONL system records
- **Docker Support** — `npx noctrace --docker <container>` attaches to a running Docker container, injects a lightweight watcher, and streams JSONL events back to your host in real time. Zero container setup required
- **Patterns View (new in v1.2)** — a second top-level tab that aggregates across every session in the chosen time window (today, 7 days, 30 days). Three panels: health distribution (A/B/C/D/F grade counts with week-over-week delta arrows), project rot leaderboard (which codebases are degrading, ranked), and tool health grid (per-tool failure rate and p50/p95 latency). Zero spend or token tracking — this is about quality and waste
- **Multi-provider support (new in v1.4+)** — sessions from Claude Code, OpenAI Codex CLI, and GitHub Copilot Chat all appear in the same session picker with provider badges. Zero config — each provider auto-detects its session directory. Copilot Chat maps 20 internal tool IDs to familiar names (Read, Write, Edit, Bash, etc.)

![Noctrace waterfall timeline](docs/screenshots/noctrace-waterfall.gif)

### Token Drift Detection

The stats pill shows a **drift factor** (e.g. `2.8x`) measuring how much each turn costs compared to the session's baseline. A 10x drift means every turn burns 10x more quota than it did at the start. Session picker shows drift per-session so you can spot wasteful sessions at a glance.

### Context Health Scoring

![Context health visualization](docs/screenshots/noctrace-context-rot.png)

Noctrace computes a real-time health score from your session data and warns you before context rot degrades output quality. The breakdown panel shows per-signal grades and tells you exactly when to run `/compact`.

| Signal | Weight | What it measures |
|--------|--------|-----------------|
| Context Fill | 40% | How full is the context window (auto-detected per model) |
| Compactions | 25% | Number of lossy compaction events |
| Re-reads | 15% | Duplicate file reads (retrieval failures) |
| Error Rate | 10% | Accelerating errors in second half of session |
| Tool Efficiency | 10% | Declining productive output |

### Tool Call Detail Panel

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
| `--docker <container>` | Attach to a running Docker container and stream its Claude Code sessions back to your host. Zero container setup |
| `--devcontainer <path>` | Resolve the running devcontainer for a local folder path and attach to it. Pass `.` for the current directory. Falls back to `--docker` if you pass a container name directly |
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

## Compatibility

Noctrace works with all Claude Code versions that write JSONL session logs to `~/.claude/projects/`. This includes:

- **Claude Code CLI** (`claude` command)
- **Claude Code in VS Code** (via the extension)
- **Claude Code in JetBrains** (via the extension)
- **Claude Code Desktop App** (Mac/Windows)

No API keys or cloud accounts required. Noctrace is 100% local — your session data never leaves your machine.

## License

[MIT](LICENSE)

## Links

- [Website](https://nyktora.github.io/noctrace/) — Landing page and documentation
- [npm](https://www.npmjs.com/package/noctrace) — Package registry
- [GitHub](https://github.com/nyktora/noctrace) — Source code and issues
- [Changelog](CHANGELOG.md) — Version history

---

<p align="center">
  Created and maintained by <a href="https://nyktora.com">Nyktora Group</a> · Contributions welcome
</p>
