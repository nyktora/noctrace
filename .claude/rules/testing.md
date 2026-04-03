---
paths:
  - "tests/**/*.test.ts"
  - "src/**/*.ts"
---

# Testing

## Framework

- Use Vitest for all tests. No Jest, no Mocha.
- Test files live in `tests/` mirroring the `src/` structure: `tests/shared/parser.test.ts` tests `src/shared/parser.ts`.
- Name test files `*.test.ts` or `*.test.tsx`.

## What to Test

- **JSONL parser**: this is the most critical module. Test every record type (user, assistant, system, result), every content block type (text, tool_use, tool_result, thinking), malformed lines, empty files, and edge cases like compaction boundaries.
- **Waterfall row builder**: test that parsed records produce correct `WaterfallRow` hierarchies — agent grouping, parent-child nesting, duration calculation, status detection.
- **REST API routes**: test with supertest. Verify correct JSON shape, error responses for missing sessions, and handling of non-existent directories.
- **React components**: test with React Testing Library. Focus on user interactions — clicking rows, expanding agents, filtering. Do not test internal state.

## What Not to Test

- Don't test third-party library behavior (chokidar, Express internals, WebSocket protocol).
- Don't write tests for CSS styling or visual layout.
- Don't mock the file system for parser tests — use fixture files with real JSONL content.

## Test Fixtures

- Keep sample JSONL files in `tests/fixtures/`.
- Include at minimum: a simple session (3-5 tool calls), a session with sub-agents, a session with errors, a session with compaction, and an empty/malformed file.
- Fixture files should be small (under 50 lines each) but representative.

## Coverage

- Target 80% line coverage on `src/shared/` (parser and types).
- Target 60% on `src/server/` (routes and watcher).
- No coverage target on `src/client/` for MVP — focus on parser correctness first.

## Running Tests

- `npm test` runs the full suite.
- `npm test -- --watch` for development.
- Tests must pass before any commit. Do not skip failing tests.
