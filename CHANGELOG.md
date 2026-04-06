# Changelog

All notable changes to noctrace will be documented in this file.

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
