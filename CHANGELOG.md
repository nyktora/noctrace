# Changelog

All notable changes to noctrace will be documented in this file.

## [Unreleased]

### Added
- You can now filter rows using structured syntax: `type:bash`, `>5s`, `<100ms`, `tokens:>1k`, `success` — combine with plain text search and existing `error`/`running` keywords. Multiple `type:` filters are OR-ed; all other filters AND together.
- Session Stats flyout panel shows P50/P95/Max latency per tool type across the session. Calls that exceed a configurable slow-call threshold (default 5s) are highlighted with a clock icon in the waterfall.
- Noctrace now detects loop behavior: 3 or more consecutive identical tool calls (same tool name and same input) attach a warning tip to the row, helping you spot runaway repetition early.
- You can now compare two sessions side-by-side using the Compare button that appears on hover in the session picker. The split-screen view shows health grades, summary metrics (duration, tokens, calls, error rate), tool mix bars, and context fill trajectory sparklines for both sessions.

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
