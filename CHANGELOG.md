# Changelog

All notable changes to noctrace will be documented in this file.

## [1.5.1] - 2026-04-17

### Added
- **8 new hook event types** with distinct rendering: PostCompact (green, compaction complete), StopFailure (red with structured `error_type`), TaskCreated/TaskCompleted (task lifecycle for Agent Teams), TeammateIdle (amber idle gap detection), PermissionDenied (red auto-mode denial with tool name), WorktreeCreate/WorktreeRemove (purple worktree lifecycle)
- StopFailure and PermissionDenied rows render with error styling and failure icons instead of the generic teal hook appearance
- Hook payloads now extract `hook_event_name`, `error_type`, `task_subject`, `teammate_name`, `tool_name`, `worktree_name` for rich labels
- `NotebookEdit` recognized as a write tool in efficiency and security tips
- `xhigh` effort level styled in Context Startup flyout (peach, between high and max)
- 12 new tests (513 total)

### Changed
- `--install-hooks` now registers StopFailure, TaskCreated, TaskCompleted, TeammateIdle events
- `hooks/hooks.json` includes all 7 new hook event definitions

## [1.5.0] - 2026-04-15

Third provider and full multi-provider API wiring. Noctrace now reads GitHub Copilot Chat sessions out of the box — no config, no tokens needed. The provider registry that shipped in 1.3 and proved itself with Codex in 1.4 now routes the entire API surface, so all three providers share a single session picker and a single waterfall.

### Added
- **GitHub Copilot Chat provider.** Reads VS Code workspaceStorage session files at `~/Library/Application Support/Code/User/workspaceStorage/{hash}/chatSessions/{uuid}.json`. Zero config — if VS Code and Copilot Chat are installed, sessions appear automatically. Copilot projects are identified with a blue "copilot" badge in the session picker
- **19 Copilot tool name mappings.** Copilot's internal tool IDs are translated to the same familiar names used by the rest of the waterfall: `copilot_readFile` → Read, `run_in_terminal` → Bash, `create_file` → Write, `replace_string_in_file` → Edit, and 15 more. Unknown IDs pass through unchanged
- **Full-rewrite file watching.** Copilot Chat session files are rewritten in full on each update (unlike Claude Code's append-only JSONL). The provider detects full-rewrite events and re-parses the entire file, keeping the waterfall in sync with VS Code's save cadence
- **Phase B provider wiring.** `GET /api/projects` now merges project lists from all registered providers into a single response. `GET /api/sessions/:slug` routes non-Claude sessions through the provider that owns the slug. `GET /api/session/:slug/:id?provider=copilot` loads sessions through the correct provider with conditional enrichments (context health and token cost are skipped for Copilot since it exposes neither)
- **Provider-tagged summaries.** `ProjectSummary` and `SessionSummary` carry a `provider` field so the session picker can render the correct badge (orange `codex`, blue `copilot`, or the existing default for Claude Code). Copilot projects use the `copilot:~/path` slug format to avoid collisions with Claude Code slugs
- **71 new unit tests.** 501 tests total. Test coverage spans the Copilot provider parser, tool name mapping, full-rewrite watcher behavior, and multi-provider API route merging

### Notes for future providers
- Copilot's `ProviderCapabilities` has `contextTracking: false` and `tokenAccounting: 'none'`. The health grade ring, context fill column, and token cost column all hide cleanly for Copilot sessions — no fabricated zeros shown
- The `copilot:` slug prefix convention is the pattern to follow for any future provider that reads from a path namespace that could collide with `~/.claude/`

## [1.4.1] - 2026-04-15

Two bug fixes that have been latent since 0.9.0 when conversation turn rows were introduced. Surfaced after heavy-conversation sessions made them obvious.

### Fixed
- **Waterfall chronological ordering.** `parseJsonlContent` built the waterfall in five separate passes — tool-use rows, API-error rows, hook rows, user-turn rows, and assistant-text-turn rows — each appended to the result array. The function returned without a final sort, so turn rows always clustered at the end of the waterfall regardless of when they actually happened in the session. A final `sort((a, b) => a.startTime - b.startTime || (a.sequence ?? 0) - (b.sequence ?? 0))` is now applied to both `parseJsonlContent` and `parseSubAgentContent`. Rows now render in true time order
- **Parity snapshots regenerated** against the corrected sort. The 1.3 byte-identical gate still holds, just against the correct output now

### Added
- **`Chat` toggle in the toolbar, default off.** User prompts and assistant text-only responses (the `type: 'turn'` rows) are hidden by default so the waterfall is dominated by actual tool activity. Click `Chat` to show the full session narrative; the choice persists to localStorage. Conversation-heavy sessions no longer drown out the tool-call story

## [1.4.0] - 2026-04-15

First non-Claude-Code provider. Noctrace now traces OpenAI Codex CLI sessions automatically — point it at a machine that uses `codex exec`, `codex review`, or any other Codex subcommand and the sessions show up in the picker alongside Claude Code, same waterfall, same health grade, same real-time streaming.

### Added
- **Codex CLI provider.** Reads `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl` files. Honors `CODEX_HOME` env override. chokidar-watched for real-time updates. Zero config — if `~/.codex/` exists, sessions appear. If not, nothing happens. Coexists with Claude Code; both show in the same session picker with provider badges
- Full tool-call granularity: Codex's `FunctionCall`/`FunctionCallOutput` events are paired by `call_id` and rendered as waterfall rows identical in shape to Claude Code's
- Per-turn timing via Codex's `TurnStarted`/`TurnComplete` event pair
- Per-turn token accounting from the separate `TokenCount` events, folded into the matching turn
- Sub-agent linking: Codex rollout files with `forked_from_id` set render as collapsible child rows under their parent session
- Failure detection: `ExecCommandEnd` with nonzero `exit_code` or `timed_out: true` tints the row red and sets `isFailure`, matching Claude Code's failure treatment. Retroactive patching handles Codex's out-of-order record emission (output before exec metadata)
- **29 new unit tests** (fixture-based, no real Codex data required). 430 tests total
- Five handwritten fixture rollout files cover: simple session, multi-turn with interleaved tokens, sub-agent, failure cases (both exit-code and timeout), malformed mid-file JSON

### Changed
- `src/shared/providers/index.ts` — one new line: `registerProvider(createCodexProvider())`. That is the entire registration. The provider abstraction shipped in 1.3 paid for itself

### Notes for future providers
- Codex's cached-input-token field (`cached_input_tokens`) is silently dropped today because `WaterfallRow` has no `cachedInputTokens` slot. If you want that data surfaced, extend the type first, then wire it through both providers
- `~/.claude/` de-slugification uses `replace(/-/g, '/')` which collapses legitimate hyphens in project paths (e.g., `my-project` → `my/project`). Pre-existing issue, flagged during Codex work, not yet fixed

## [1.3.0] - 2026-04-15

Internal refactor that lays the foundation for multi-provider support. No user-visible behavior change for Claude Code users — the existing waterfall, Patterns view, session picker, health grades, and streaming all work identically. This release is the plumbing that 1.4 (Codex CLI) and 1.5 (GitHub Copilot) build on.

### Added
- **Provider abstraction** in `src/shared/providers/`. A single `Provider` interface that any agent source can implement: `listSessions`, `readSession`, `watch`. Claude Code is now `createClaudeCodeProvider()` — a drop-in that wraps the existing JSONL parser and directory-walk logic
- **Normalized `AgentSession` schema** in `src/shared/session.ts`. Rich provider-specific data rides along in a `native` passthrough field so no fidelity is lost (the Claude Code waterfall renders from the same `WaterfallRow[]` it always did)
- **`ProviderCapabilities` flags** gate every UI surface that used to assume "all signals exist." Context-fill %, health grade, cost pills, and tool latency columns now render conditionally based on what the provider can supply. Today all capabilities are `true` for Claude Code, so nothing visible changes. But 1.5 Copilot will have `contextTracking: false` + `tokenAccounting: 'none'`, and the UI will hide those signals cleanly instead of showing fabricated zeros
- **Parity test** (`tests/shared/provider-parity.test.ts`) locks byte-identical output between the legacy parser and the new Claude Code provider adapter across six fixture sessions covering simple, sub-agent, error, compaction, failure, and API-error cases. Any future change that alters Claude Code behavior has to explicitly regenerate the parity snapshots — silent regressions are impossible
- Provider registry (`registerProvider`, `getProvider`, `listProviders`) so future providers are a single-file drop-in with no core edits

### Changed
- `src/server/rollup.ts`, `src/server/routes/api.ts`, and `src/server/ws.ts` now consume the Provider interface instead of calling `parseSessionContent` and walking `~/.claude/projects/` directly
- The chokidar file watcher moved from `src/server/watcher.ts` into the Claude Code provider itself (`src/shared/providers/claude-code.ts`) since the watched paths are Claude-Code-specific
- Existing URL shape `/api/session/:slug/:id` preserved for backward compatibility — provider defaults to `claude-code` when no explicit provider is requested

### Tests
- 51 new tests across the three phases: provider interface + adapter + registry + parity (22), server integration through the new interface (9), and capability-gating across every UI surface (20). **401 tests total** (was 350)
- New `tests/fixtures/parity/` directory holds six canonical Claude Code session snapshots; regenerate via `scripts/generate-parity-snapshots.mjs` only when the parser behavior intentionally changes

### Fixed
- Grid lines in the waterfall were misaligned by 34px when the Ctx % column was conditionally hidden (a scenario that didn't exist before 1.3 but is needed for 1.5 Copilot sessions). Caught during Phase C.

## [1.2.0] - 2026-04-14

### Added
- **Patterns view** — a new top-level tab that aggregates across every session in the chosen time window (today, 7 days, 30 days). The existing per-session waterfall stays the default; click "Patterns" in the toolbar to see the cross-session picture. Answers the question "which of my projects and tools are degrading?" without tracking spend or tokens
- **Health distribution panel** — five bars A through F showing how many sessions landed in each grade for the current window, with ghost outlines showing the previous same-sized window. Delta arrows surface week-over-week regressions at a glance
- **Project rot leaderboard** — your projects ranked by what percentage of their sessions scored a D or F. Shows session count, bad count, bad %, average compactions per session, and a link arrow. Click a row to jump to that project in the sessions view
- **Tool health grid** — every tool with ≥10 calls in the window, ranked by failure rate. Columns: calls, failures, fail %, p50 ms, p95 ms, and a calls delta vs the previous window. Fail % and p95 latency cells are color-coded so outliers pop
- **Calendar-semantic time windows** — "today" is midnight-local to now, "7d" is the last 7 calendar days including today, "30d" is the last 30. Previous window is always the same-sized window immediately preceding, so regression comparisons are apples-to-apples
- **Stat-on-read session cache** — in-memory map keyed by file `mtime` so warm navigations return in milliseconds even with thousands of sessions. Cold first load uses mtime pre-filter + bounded-parallel parse (chunks of 20) to avoid redundant work on archived sessions
- 75 new unit and integration tests covering the session-summary extractor, cache invalidation, rollup aggregation, the new route, and all three panel components. **350 tests total**

### Changed
- Toolbar now includes a Sessions | Patterns nav toggle. Last-chosen view and window persist to localStorage

## [1.1.0] - 2026-04-13

### Added
- `npx noctrace --devcontainer <path>` resolves the running devcontainer for any local folder and attaches to it using the same inject-and-stream flow as `--docker`. Pass `.` for the current directory. Works with containers launched by the VS Code Dev Containers extension or the `@devcontainers/cli` package — resolution uses the canonical `devcontainer.local_folder` label with a fallback to the older `vsch.local.folder` label
- `findContainerByLabel` and `resolveDevcontainerContainer` are new exported functions in `src/server/docker.ts`, testable via the existing `DockerRunner` injection interface. Plain container names/IDs passed to `--devcontainer` are forwarded directly to the existing Docker flow
- 9 new unit tests covering both functions across the happy path, empty-match, label-format, fallback, relative-path-resolution, and error-message cases. 276 tests total

## [1.0.0] - 2026-04-13

Noctrace hits 1.0. The JSONL parser, context health scoring, waterfall UI, hook integration, MCP session registry, and session export have shipped across 30+ releases and are stable in daily use. This release consolidates that surface into a 1.0 line and adds Docker support.

### Added
- You can now trace Claude Code sessions running inside Docker containers with a single flag: `npx noctrace --docker <container>`. Noctrace inspects the container, injects a lightweight watcher, and streams JSONL events back to your host in real time. Zero container setup — works with any image that has `curl` or `wget`
- Docker support auto-detects the container's Claude config dir (`$CLAUDE_CONFIG_DIR` or `$HOME/.claude`), resolves the host URL (`host.docker.internal` on macOS/Windows, gateway IP on Linux), and cleans up the injected watcher on Ctrl-C

### Changed
- Docker orchestration logic extracted from `bin/noctrace.js` into a testable module (`src/server/docker.ts`) with a `DockerRunner` interface for dependency injection. External CLI behavior is unchanged; every Docker code path is now under unit test coverage

### Security
- **Docker watcher shell injection locked down**: the injected watcher no longer interpolates `claudeDir` or `containerTargetUrl` into a shell `-c` string. Values are passed as positional arguments through `sh -c '/tmp/noctrace-watcher.sh "$1" "$2" "$3"' -- ...`. A regression test asserts the static `-c` body and argv shape so this can't silently regress
- **Container name validation**: names that don't match `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$` are rejected before any docker command runs, blocking command injection via crafted container names
- **Path traversal rejection (ISSUE-001)**: container paths containing `..` segments are rejected before any docker command runs
- **Command injection hardening across Docker glue**: all `docker exec`, `docker cp`, and `docker inspect` calls use `execFileSync` with discrete argv elements — never shell-string concatenation
- 24 new unit tests in `tests/server/docker.test.ts` protect these security-sensitive branches. 267 tests total across the project

## [0.9.0] - 2026-04-12

### Added
- Conversation turn rows: user prompts now appear as blue "you" rows and assistant text-only responses as lavender "claude" rows in the waterfall timeline. Previously only tool calls were shown; now you can read the full session narrative
- Turn icon (chat bubble SVG) distinguishes conversation rows from tool calls
- Filter support for turn rows: `type:turn` matches conversation rows, text search matches prompt/response content
- Turn rows show output token count for assistant responses

### Fixed
- Toolbar token total was double-counting context window (summing full `inputTokens` per row instead of `tokenDelta`). Now correctly shows net tokens consumed
- npm search ranking: description now leads with "Claude Code observability" for exact phrase match
- Site SEO: semantic H1/H2 headings, og:image, shortened meta description, updated version badges

## [0.8.0] - 2026-04-11

### Added
- OTel export: any session can be exported as OTLP/HTTP JSON trace format via `GET /api/session/:slug/:id/otlp`, ready to POST to Grafana, Jaeger, or Datadog collectors. Zero new dependencies
- Compaction metadata: compaction boundary lines now show whether they were triggered manually or automatically, with the pre-compaction token count in the tooltip
- Typed API error detection: assistant records with the new structured `error` field (rate_limit, billing_error, etc.) are detected directly instead of pattern matching
- Session result metrics: the terminal `result` record's `duration_api_ms`, per-model `modelUsage` breakdown, `stop_reason`, and `permission_denials` are now parsed and available via the API
- Session init context: the Context Startup flyout now shows which agents, skills, and plugins were loaded at session start, plus the reasoning effort level (low/medium/high/max) as a colored badge
- Hook lifecycle rows: `hook_started` and `hook_response` system records render as teal-tinted waterfall rows with a hook icon, showing hook execution timing
- Fast mode badge: API requests made with Claude Code's fast mode show an amber lightning bolt "fast" pill on the waterfall row
- Resizable Name column: drag the right edge of the Name header to resize between 80px and 600px
- SubagentStart real-time rows: when a SubagentStart hook event arrives, a placeholder "running" agent row appears immediately in the waterfall before the sub-agent JSONL file is written
- Agent Teams task details: the teams panel now reads task file contents and shows each task's subject and status with colored dots
- Plugin marketplace metadata: `.claude-plugin/plugin.json` now includes `category`, `minClaudeCodeVersion`, and `capabilities` fields for marketplace compatibility
- Three new hook events registered: `SessionStart`, `SessionEnd`, `PostToolUseFailure`

### Changed
- `parseCompactionBoundaries()` now returns `CompactionBoundary[]` (with trigger/preTokens metadata) instead of `number[]`
- `event.sequence` field used as tiebreaker when sorting rows with identical timestamps
- `parent_tool_use_id` stored on WaterfallRow for canonical parent-child linking
- `isSynthetic` recognized alongside `isMeta` for forward compatibility with newer Claude Code versions
- `parseLine()` now accepts `result` record type

### Fixed
- OTel export route was shadowed by the session detail route (Express param capture). Moved `/otlp` route before `/:id` route
- Markdown links with `javascript:` or `data:` URL schemes are now stripped to plain text, preventing XSS via crafted session logs
- `spawn()` in resume handler now passes only `PATH`, `HOME`, `CLAUDE_HOME` instead of full `process.env`
- `.env` and `.env.*` patterns added to `.gitignore`

### Security
- CSO audit completed: 3 findings (all fixed). Path traversal protection verified, command injection prevention confirmed, HTML escaping in markdown renderer validated

## [0.6.0] - 2026-04-08

### Added
- You can now see the estimated USD cost of every tool call directly on its waterfall row, and the session total in the toolbar. Pricing uses Claude's public rates and is detected per-model (Sonnet, Opus, Haiku). New module: `src/shared/token-cost.ts`
- Subagent rows now show the agent's named type (e.g., "Explore", "core:deep-researcher") as a blue badge chip, replacing the opaque agent ID that appeared before
- Tool crashes, timeouts, and killed processes now render as distinct red-tinted rows with a lightning bolt icon, separated from normal error results. The `isFailure` flag on `WaterfallRow` drives this treatment
- Rate limit errors, billing errors, and auth failures now appear as full-width red alert banners on the timeline instead of ordinary rows. These use the new `api-error` row type
- Agent Teams panel: Noctrace detects running Agent Teams at `~/.claude/teams/` and shows a flyout with each team's members and task counts. New endpoint: `GET /api/teams`
- Context Startup flyout shows which CLAUDE.md and instruction files loaded at session start, each with an estimated token count. Parsed from JSONL system records
- You can now filter rows using structured syntax: `type:bash`, `>5s`, `<100ms`, `tokens:>1k`, `success` — combine with plain text search and existing `error`/`running` keywords. Multiple `type:` filters are OR-ed; all other filters AND together.
- Session Stats flyout panel shows P50/P95/Max latency per tool type across the session. Calls that exceed a configurable slow-call threshold (default 5s) are highlighted with a clock icon in the waterfall.
- Noctrace now detects loop behavior: 3 or more consecutive identical tool calls (same tool name and same input) attach a warning tip to the row, helping you spot runaway repetition early.
- You can now compare two sessions side-by-side using the Compare button that appears on hover in the session picker. The split-screen view shows health grades, summary metrics (duration, tokens, calls, error rate), tool mix bars, and context fill trajectory sparklines for both sessions.
- MCP session registry: when running via Claude Code integration, sessions register themselves with noctrace on start and unregister on exit. The session picker shows a "MCP mode — N active sessions" indicator and displays only currently registered sessions. Multiple Claude Code sessions share one noctrace dashboard. Standalone mode (`npx noctrace`) is unchanged — it scans all of `~/.claude/projects/` as before. API: `POST /api/sessions/register`, `POST /api/sessions/unregister`, `GET /api/sessions/registered`.

## [0.5.0] - 2026-04-08

### Added
- Security tips engine: 13 patterns detect secrets in output, dangerous commands (rm -rf, DROP TABLE), curl-pipe-bash, data exfiltration, shell profile modifications, hidden unicode, prompt injection, force push, sensitive file access, permission weakening, sudo usage, and binary downloads
- Red shield icon distinguishes security tips from efficiency tips in waterfall rows, detail panel, and toolbar badge
- Autocompact thrash detection: flags sessions with 3+ compactions as critical health signal with actionable tip
- Markdown rendering in detail panel: tool input/output rendered as rich markdown when content has markdown patterns (zero deps, XSS-safe)
- Session title parsing: shows display names in session picker when available in JSONL
- Claude Code plugin packaging: install via `claude plugin install nyktora/noctrace` with auto-registered hooks and MCP server wrapper

### Changed
- Token counts now show `m` suffix for millions (e.g., 114.1m instead of 114085.8k)
- Removed misleading token counts from detail panel INPUT/OUTPUT headers

### Fixed
- ESM .js import extensions for Node.js compatibility
- Express 5 catch-all route (`{*path}` instead of `*`)
- Server port retry (moved app/server/wss inside startServer(), added WSS error handler)

## [0.4.2] - 2026-04-08

### Added
- Efficiency tips: 8 waste patterns detected from JSONL data with contextual guidance (re-reads, search fan-out, correction loops, repeated commands, token spikes, high context fill, no delegation, post-compaction re-reads)
- Lightbulb icon on wasteful rows with full tip text in detail panel
- Tip count badge in toolbar

## [0.4.1] - 2026-04-07

### Added
- Claude Code plugin packaging (.claude-plugin/, hooks/, .mcp.json, MCP wrapper)
- All documentation updated for v0.4.0 features

### Fixed
- ESM .js import extensions for compiled server output
- Express 5 catch-all route compatibility
- Server port retry logic

## [0.4.0] - 2026-04-07

### Added
- Hooks receiver: `POST /api/hooks` endpoint receives Claude Code hook events and broadcasts to WebSocket clients in real time
- CLI `--install-hooks` / `--uninstall-hooks` to auto-configure Claude Code hooks for PostToolUse, SubagentStart/Stop, Stop, PreCompact, PostCompact
- Context Drift Rate metric: measures token consumption growth rate (tokens/min) with 3-window linear regression, classified as stable/rising/accelerating/critical
- Session export: Share button exports current session as a self-contained offline HTML file with embedded waterfall data

## [0.3.6] - 2026-04-06

### Security
- Add WebSocket origin validation, restricting connections to localhost only
- Bump vite to fix 3 high-severity CVEs (path traversal, fs.deny bypass, arbitrary file read)
- Add resume message length validation (10k char cap)
- Pin all GitHub Actions to SHA digests to prevent supply chain attacks
- Add CODEOWNERS file protecting CI/CD workflow files

## [0.3.5] - 2026-04-04

### Added
- SEO improvements for GitHub Pages site: Twitter Cards, canonical URLs, JSON-LD structured data, noscript fallback content, robots.txt, sitemap.xml

### Changed
- Switch GitHub Pages ESM imports from dev to production builds
- Update site footer to "Maintained by nyktora.com. Contributions welcome."

## [0.3.4] - 2026-04-04

### Added
- Favicon for GitHub Pages site matching the noctrace logo

## [0.3.3] - 2026-04-03

### Fixed
- Mobile responsive sidebar collapse
- Keyboard navigation and ARIA roles on waterfall rows
- Hide empty projects in sidebar by default
- Clean up worktree path display names in sidebar

## [0.3.1] - 2026-04-02

### Fixed
- New sessions not appearing in sidebar until page refresh
- Hardcoded 200k context window references updated to dynamic values

## [0.3.0] - 2026-04-01

### Added
- Token drift analysis with per-session trend detection
- Resume session feature: send follow-up messages to any Claude session
- Streaming chat UI for resume with chained follow-ups
- Session state badges (live, idle) and dimmed inactive projects
- Per-row token delta display instead of cumulative totals
- Compact stats pill toolbar with agent count, health badge, warnings, token count, duration

### Changed
- Renamed Time column to Dur. for clarity
- Improved sidebar readability with short project names and relative session times

### Fixed
- Active session detection with registry + mtime fallback
- Resume requires --verbose flag for stream-json output
- Unicode escape sequences showing as literal text in resume bar

### Security
- Path traversal hardening on all REST and WebSocket routes
- Input validation on session IDs and agent IDs

## [0.1.1] - 2026-03-30

### Changed
- Auto-set package version from git tag in publish workflow
- Improved waterfall UI to match site mockup design
- Added timestamp display to detail panel

## [0.1.0] - 2026-03-29

### Added
- Initial release
- JSONL parser for Claude Code session logs
- Express server with REST API and WebSocket streaming
- React waterfall timeline with virtual scrolling
- Context health scoring (5-signal weighted average: token fill, compaction count, re-read ratio, error acceleration, tool efficiency)
- Health grade badge, animated ring, compaction boundary lines
- Session picker with project grouping
- Detail panel with resizable two-column input/output view
- Zoom/pan on timeline (1-50x, cursor-centered)
- Text search and keyword filtering (error, agent, running)
- Sub-agent JSONL parsing with collapsible row groups
- CLI with auto-open browser and port fallback
- GitHub Pages site with landing page and docs
- Filter text highlighting in Name column
