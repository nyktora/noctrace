# Noctrace

Chrome DevTools Network-tab-style real-time waterfall visualizer for Claude Code agent workflows. Open source, local-only, zero config.

## Project Overview

Noctrace passively reads Claude Code session JSONL logs from `~/.claude/projects/` and renders them as an interactive waterfall timeline in a browser tab. Agents appear as collapsible row groups, tool calls as nested rows with colored timing bars on a shared time axis.

### JSONL Log Paths

- **Main session**: `~/.claude/projects/<project-slug>/<session-id>.jsonl`
- **Sub-agent sessions**: `~/.claude/projects/<project-slug>/<session-id>/subagents/agent-<agent-id>.jsonl`

Main and sub-agent logs are parsed by separate functions (`parseSessionContent` and `parseSubAgentContent`). Sub-agent rows are attached as children of their parent agent row in the API route, after both are independently parsed. Any per-row computation (like token deltas) must be done in **both** parsers.

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Server**: Express 5.x + ws 8.x (WebSocket)
- **File watching**: chokidar 4.x
- **Client**: React 19 + Vite 8 + Tailwind CSS 4
- **State**: Zustand 5.x
- **No database** — JSONL files on disk are the source of truth

## Commands

- `npm run dev` — starts server + Vite dev server concurrently
- `npm run build` — builds client, bundles server
- `npm test` — runs Vitest test suite
- `npm run lint` — runs ESLint
- `npm run typecheck` — runs TypeScript compiler in check mode
- `npm run test:smoke` — builds and runs production smoke tests (verifies `npx noctrace` works)

## Code Style

- TypeScript strict mode everywhere (server and client)
- ES modules only (import/export), never CommonJS
- Functional React components with hooks, no class components
- Name files with kebab-case: `waterfall-row.tsx`, `jsonl-parser.ts`
- All SVG icons are inline React components in `src/client/icons/` — never use emojis

## Architecture Constraints

- **Zero cloud**: no external API calls, no analytics, no telemetry
- **Zero cost at rest**: no background processes, no database, no daemon
- **Zero config by default**: reads `~/.claude/` directly; optional `--install-hooks` enables real-time hook events
- **Single process**: one Node.js process serves SPA + REST API + WebSocket
- **Stateless server**: all persistent state comes from JSONL files on disk; the session registry (`GET/POST /api/sessions/register|unregister`) is in-memory only and resets on server restart
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

## Releasing

Releases are published to npm **exclusively via GitHub Actions** (`.github/workflows/publish.yml`). Never run `npm publish` locally.

### Release process:
1. Bump version in `package.json`
2. Commit: `git commit -m "Bump version to X.Y.Z"`
3. Tag: `git tag vX.Y.Z`
4. Push: `git push && git push --tags`
5. **Monitor the CI/CD run** — check GitHub Actions to confirm the publish workflow succeeds. Use `gh run list --workflow=publish.yml --limit=1` or check the Actions tab in the browser.
6. If the workflow fails, diagnose and fix before retrying. To re-trigger, delete and recreate the tag: `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z && git tag vX.Y.Z && git push origin vX.Y.Z`

### Important:
- The workflow uses `--allow-same-version` so the version in `package.json` can already match the tag
- The workflow uses npm provenance (`--provenance`) which requires `id-token: write` permission
- The `NPM_TOKEN` secret must be configured in the GitHub repo settings

## Rules

Follow all rules in `.claude/rules/` strictly. They cover:
- `coding-style.md` — TypeScript conventions, naming, file organization
- `architecture.md` — system constraints, no-cloud policy, dependency rules
- `testing.md` — test requirements, coverage expectations

**Never add Co-Authored-By lines to commit messages.** All commits are authored by the user only.

**Always run `/document-release` before any version bump or release.** Update all docs, CHANGELOG, and site content first, then release.

## Pre-release Checklist

Before any version bump or release, run `npm run test:smoke` to verify the production entry point serves the SPA correctly. This catches environment configuration bugs (such as missing `NODE_ENV=production`, broken static file paths, or catch-all route regressions) that unit tests and dev-mode testing cannot detect.

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
14. ✅ Compact stats pill toolbar (agent count with robot icon, health badge, warning icon, token count, session duration)
15. ✅ Agent duration bars (totalDurationMs from JSONL for real execution time)
16. ✅ Filter text highlighting (yellow background on matched text in Name column)
17. ✅ GitHub Pages site (`site/`) with Actions deploy workflow
18. ✅ Hooks receiver (POST /api/hooks, --install-hooks / --uninstall-hooks CLI)
19. ✅ Context Drift Rate metric (tokens/min growth with 3-window linear regression)
20. ✅ Session export (standalone offline HTML via Share button)
21. ✅ Security hardening (WebSocket origin validation, vite CVE fixes, pinned Actions, CODEOWNERS)
22. ✅ Claude Code plugin packaging (.claude-plugin/, hooks/, .mcp.json, MCP wrapper)
23. ✅ Efficiency tips (8 waste patterns with amber lightbulb indicators)
24. ✅ Security tips (13 security patterns with red shield indicators)
25. ✅ Markdown detail panel rendering (zero deps, XSS-safe)
26. ✅ Session title parsing from JSONL
27. ✅ Token format m suffix (114.1m not 114085.8k)
28. ✅ Enhanced loop detection (Rule 10: 3+ consecutive identical tool calls → warning tip)
29. ✅ Per-tool latency stats (Session Stats flyout: P50/P95/Max per tool type, slow-call threshold with clock icon)
30. ✅ Advanced filtering (structured syntax: type:bash, >5s, <100ms, tokens:>1k, success; multiple type: filters OR-ed, others AND-ed)
31. ✅ Session comparison (split-screen: health grades, summary metrics, tool mix bars, context fill trajectory sparklines)
32. ✅ MCP session registry (POST /api/sessions/register, POST /api/sessions/unregister, GET /api/sessions/registered; "MCP mode — N active sessions" indicator in session picker; standalone mode unchanged)
33. ✅ Per-tool token cost (estimated USD per row + session total in toolbar; `src/shared/token-cost.ts`; Claude public pricing, per-model detection)
34. ✅ Agent type labels (subagent rows show named type as blue badge chip, e.g., "Explore", "core:deep-researcher")
35. ✅ Tool failure rows (crashes/timeouts/kills get red-tinted rows + lightning bolt icon; `isFailure` flag on WaterfallRow, distinct from error results)
36. ✅ API error markers (rate limits, billing errors, auth failures render as full-width red alert banners; new `api-error` row type)
37. ✅ Agent Teams panel (detects `~/.claude/teams/`, shows members + task counts in flyout; new `GET /api/teams` endpoint)
38. ✅ Context Startup flyout (which instruction files loaded at session start with estimated token counts; parsed from JSONL system records)
39. ✅ OTel export (GET /api/session/:slug/:id/otlp, zero-dep OTLP JSON trace format for Grafana/Jaeger/Datadog)
40. ✅ Compaction metadata (trigger type + pre-tokens on compact_boundary records; enriched tooltip on health bar)
41. ✅ Typed assistant.error detection (structured error field replaces pattern matching for API errors)
42. ✅ Session result metrics (duration_api_ms, modelUsage per-model breakdown, stop_reason, permission_denials)
43. ✅ Session init context (agents/skills/plugins/effort parsed from system init; shown in Context Startup flyout)
44. ✅ Hook lifecycle rows (hook_started/hook_response → teal waterfall rows with hook icon)
45. ✅ Fast mode badge (assistant.message.speed === 'fast' → amber lightning bolt pill)
46. ✅ Resizable Name column (drag header edge, 80-600px, stored in Zustand)
47. ✅ SubagentStart real-time rows (hook event creates placeholder running agent row before JSONL exists)
48. ✅ Agent Teams task details (reads task file contents, shows subject + status dots in panel)
49. ✅ Plugin marketplace metadata (category, minClaudeCodeVersion, capabilities in plugin.json)
50. ✅ Security hardening v2 (env whitelist in spawn, .env gitignore, markdown link scheme validation)
### Remaining polish:
- Loading state spinners
- README with demo GIF

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools directly.

Available gstack skills:
- `/office-hours` `/plan-ceo-review` `/plan-eng-review` `/plan-design-review`
- `/design-consultation` `/design-shotgun` `/design-html` `/design-review`
- `/review` `/ship` `/land-and-deploy` `/canary`
- `/benchmark` `/browse` `/connect-chrome` `/qa` `/qa-only`
- `/setup-browser-cookies` `/setup-deploy` `/retro` `/investigate`
- `/document-release` `/codex` `/cso` `/autoplan`
- `/plan-devex-review` `/devex-review` `/careful` `/freeze` `/guard` `/unfreeze`
- `/gstack-upgrade` `/learn`

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

## PRD

The full product spec is at `PRD.md`. Read it before starting any work.
