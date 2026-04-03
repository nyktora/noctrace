# Contributing to Noctrace

Thanks for your interest in contributing! Noctrace is a small, focused project and we welcome contributions of all sizes.

## Getting Started

```bash
git clone https://github.com/nyktora/noctrace.git
cd noctrace
npm install
npm run dev       # starts Express server + Vite dev server
```

The app runs at `http://localhost:5173` (Vite) with API proxied to `http://localhost:4117` (Express).

## Before You Submit

Run all checks locally:

```bash
npm test          # 119 tests must pass
npm run typecheck # no type errors
npm run lint      # no lint errors
npm run build     # production build must succeed
```

## Project Structure

```
src/
├── shared/     # JSONL parser, types, health scoring (most critical — highest test coverage)
├── server/     # Express, WebSocket, file watcher, REST API
└── client/     # React SPA, components, store, icons
tests/          # Mirrors src/ structure, uses JSONL fixtures in tests/fixtures/
```

## Code Style

- **TypeScript strict mode** everywhere. No `any`. Use `unknown` and narrow.
- **ES modules** only. No CommonJS.
- **Functional React** with hooks. No class components.
- **Kebab-case filenames**: `waterfall-row.tsx`, `tool-colors.ts`
- **SVG icons** are inline React components in `src/client/icons/`. No emojis in UI.
- Keep files under 300 lines. Components under 150 lines.
- Don't add dependencies without discussion. We minimize deps intentionally.

## Architecture Constraints

These are non-negotiable:

- **Zero cloud** — no external API calls, no analytics, no telemetry
- **Zero config** — reads `~/.claude/` directly, no hooks to install
- **Single process** — one Node.js process serves SPA + REST API + WebSocket
- **No database** — JSONL files on disk are the source of truth
- **MIT/Apache-2.0 only** — all dependencies must use permissive licenses

## What to Work On

- Check [open issues](https://github.com/nyktora/noctrace/issues) for bugs and feature requests
- Issues labeled `good first issue` are scoped for newcomers
- Open a [discussion](https://github.com/nyktora/noctrace/discussions) if you want to propose something larger

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes with tests where applicable
3. Run all checks (test, typecheck, lint, build)
4. Open a PR with a clear description of what and why
5. Keep PRs focused — one concern per PR

## Testing

- Use **Vitest** for all tests
- Test files go in `tests/` mirroring `src/` structure
- JSONL parser tests are the most important — use fixture files in `tests/fixtures/`
- Don't mock the file system — use real fixture files

## Reporting Bugs

Open an issue with:
- What you expected vs what happened
- Node.js version (`node --version`)
- OS and browser
- Relevant console output or screenshots

## Contributor License Agreement

By opening a pull request, you agree to the [Contributor License Agreement](CLA.md). This grants Nyktora Group LLC a license to use your contribution while you retain your copyright. Please read it before submitting.

## License

This project is licensed under the [MIT License](LICENSE).
