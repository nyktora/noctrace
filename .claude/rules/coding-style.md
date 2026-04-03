---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Coding Style

## TypeScript

- Strict mode enabled. No `any` types. Use `unknown` when the type is genuinely unknown, then narrow with type guards.
- Prefer `interface` over `type` for object shapes. Use `type` for unions, intersections, and mapped types.
- Every exported function and interface must have a JSDoc comment describing its purpose.
- Use `const` by default. Use `let` only when reassignment is necessary. Never use `var`.
- Destructure function parameters when there are 3+ properties.
- Prefer explicit return types on exported functions. Inferred types are fine for local/private functions.

## Naming

- Files: `kebab-case.ts` / `kebab-case.tsx`
- Interfaces: `PascalCase` prefixed with nothing (not `I`)
- Types: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` only for true compile-time constants
- React components: `PascalCase` matching the filename (`waterfall-row.tsx` exports `WaterfallRow`)

## File Organization

- One concept per file. A parser module, a React component, a utility — not mixed.
- Max 300 lines per file. If longer, split into smaller modules.
- Group imports: Node built-ins → third-party → local. Blank line between groups.
- Place types/interfaces at the top of the file, before implementation.

## React Specific

- Functional components only. No class components.
- Extract hooks into `use*.ts` files when reused across components.
- Keep components under 150 lines. Extract sub-components when they exceed this.
- Props interfaces must be defined and exported alongside the component.
- Use Zustand for global state. Use `useState` for component-local state. No prop drilling beyond 2 levels.

## SVG Icons

- All icons are inline SVG React components in `src/client/icons/`.
- Never use emojis in the UI. Every icon must be an SVG.
- Icons accept a `color` prop (string) and a `size` prop (number, default 16).
- Use `stroke` for line icons, not `fill`, for consistency with the dev-tool aesthetic.

## Error Handling

- Server: wrap async route handlers in try/catch. Return structured JSON errors `{ error: string }`.
- Client: use error boundaries at the page level. Show a fallback UI, never a blank screen.
- JSONL parsing: malformed lines are skipped with a console.warn, never crash the session.
