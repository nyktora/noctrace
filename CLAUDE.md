# Noctrace

Chrome DevTools Network-tab-style real-time waterfall visualizer for Claude Code agent workflows. Open source, local-only, zero config.

## Project Overview

Noctrace passively reads Claude Code session JSONL logs from `~/.claude/projects/` and renders them as an interactive waterfall timeline in a browser tab. Agents appear as collapsible row groups, tool calls as nested rows with colored timing bars on a shared time axis.

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Server**: Express 4.x + ws 8.x (WebSocket)
- **File watching**: chokidar 4.x
- **Client**: React 19 + Vite 6 + Tailwind CSS 4
- **State**: Zustand 5.x
- **No database** — JSONL files on disk are the source of truth

## Commands

- `npm run dev` — starts server + Vite dev server concurrently
- `npm run build` — builds client, bundles server
- `npm test` — runs Vitest test suite
- `npm run lint` — runs ESLint
- `npm run typecheck` — runs TypeScript compiler in check mode

## Code Style

- TypeScript strict mode everywhere (server and client)
- ES modules only (import/export), never CommonJS
- Functional React components with hooks, no class components
- Name files with kebab-case: `waterfall-row.tsx`, `jsonl-parser.ts`
- All SVG icons are inline React components in `src/client/icons/` — never use emojis

## Architecture Constraints

- **Zero cloud**: no external API calls, no analytics, no telemetry
- **Zero cost at rest**: no background processes, no database, no daemon
- **Zero config**: reads `~/.claude/` directly, no hooks to install
- **Single process**: one Node.js process serves SPA + REST API + WebSocket
- **Stateless server**: all state comes from JSONL files on disk
- **MIT license**: all dependencies must be MIT or Apache-2.0

## Context Preservation (STRICT)

**ALWAYS delegate heavy tasks to subagents.** No exceptions. This is the single most important rule for maintaining session quality. Subagents run in their own context windows — their tool calls do not consume the main session's context.

### What is a heavy task?

A task is heavy if it will likely consume **10+ tool calls**. Delegate it. Specific patterns that MUST use subagents:

| Task | Why it's heavy | Agent type |
|---|---|---|
| Codebase exploration / search | Multiple greps, globs, file reads | `Explore` |
| Code review | Read many files, cross-reference | `core:code-reviewer` |
| Research (web, docs, patterns) | Multiple searches, fetches, reads | `core:deep-researcher` |
| Multi-file refactor planning | Read N files to plan changes | `Plan` or `core:code-architect` |
| Test/build/fix cycles | Run → read error → fix → repeat | `senior-software-engineer` |
| Architecture analysis | Trace execution paths, map deps | `core:code-explorer` |

### What stays in main context?

Only surgical, low-token-cost work:
- Read 1-2 specific files + make targeted edits
- Run a single command and check output
- Write a new file from a clear, already-understood spec
- Quick git operations (status, commit, push)

### How to delegate

Use the `Agent` tool. Launch multiple agents in parallel when tasks are independent. Example:
```
Agent(subagent_type="Explore", prompt="Find all files that import X...")
Agent(subagent_type="core:code-reviewer", prompt="Review changes in Y for...")
```

When in doubt, delegate. The cost of a subagent is near-zero. The cost of filling main context is permanent until compaction.

## Rules

Follow all rules in `.claude/rules/` strictly. They cover:
- `coding-style.md` — TypeScript conventions, naming, file organization
- `architecture.md` — system constraints, no-cloud policy, dependency rules
- `testing.md` — test requirements, coverage expectations

## Build Sequence

All steps complete. Order followed during implementation:
1. ✅ Project scaffold (Node + Express + Vite + React)
2. ✅ JSONL parser module with tests
3. ✅ REST API endpoints
4. ✅ Session picker UI
5. ✅ Waterfall component (virtual scrolling, multi-column layout)
6. ✅ Detail panel (resizable, two-column input/output)
7. ✅ Context Health scorer module with tests (5-signal weighted average)
8. ✅ Context Health UI (grade badge, health bar, compaction lines, breakdown panel with recommendations)
9. ✅ File watcher + WebSocket (byte-offset incremental parsing, auto-reconnect)
10. ✅ Zoom/pan on timeline (1–50x, cursor-centered, click-drag pan)
11. ✅ Filtering (text search + special keywords: error, agent, running)
12. ✅ Sub-agent JSONL parsing (subagents/ directory, toolUseResult.agentId linking)
13. ✅ CLI packaging (auto-open browser, port fallback, npm bin entry)

### Remaining polish:
- Loading state spinners
- Duration threshold filtering
- README with demo GIF

## PRD

The full product spec is at `PRD.md`. Read it before starting any work.
