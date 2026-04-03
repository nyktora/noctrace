---
name: waterfall-ui
description: Waterfall timeline UI specification for noctrace. Use when building or modifying the waterfall component, detail panel, session picker, or any visual element.
---

# Waterfall UI Specification

## Layout (Desktop-First, Chrome DevTools Network Tab)

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo] [Session Tabs] [Filter]              [Stats]          │
├───────────┬──────┬───────┬───────────────────────────────────┤
│ Name      │ Type │ Time  │ Waterfall (time axis)             │
├───────────┼──────┼───────┼───────────────────────────────────┤
│ ▼ planner │ Task │ 12.0s │ ████████████████████████████████  │
│   Read    │ Read │ 0.3s  │  ██                               │
│   Write   │Write │ 4.5s  │      ████████████                 │
│ ▼ tdd     │ Task │ 23.5s │    ████████████████████████████   │
│   Bash    │ Bash │ 4.2s  │      ████████                     │
│   Edit    │ Edit │ 1.8s  │                  █████            │
├───────────┴──────┴───────┴───────────────────────────────────┤
│ [Detail Panel — tool input/output on row click]              │
└──────────────────────────────────────────────────────────────┘
```

## Column Widths

- Name: 200px fixed
- Type: 56px fixed
- Time: 52px fixed
- Tokens: 68px fixed (like Chrome DevTools "Size" column)
- Waterfall: flex (remaining space)

## Token Display Rules

- Format: under 1000 show raw number (e.g., "340"), 1000+ show with "k" suffix (e.g., "4.1k", "18.4k")
- Show sum of input + output tokens per row
- Agent rows show their own overhead tokens (the Task tool_use itself), not the sum of children
- Highlight in yellow (#f9e2af) when a single tool call exceeds 5000 total tokens (expensive call)
- Detail panel shows the split: "2.8k in / 95 out"
- Toolbar stats area shows total session token count

## Waterfall Bar Rendering

Bars are `div` elements with `position: absolute` inside a relative container.

```
left = ((row.startTime - sessionStart) / totalDuration) * 100 + "%"
width = ((row.duration || (now - row.startTime)) / totalDuration) * 100 + "%"
```

Minimum width: 0.4% (so very short calls are still visible).

## Color Palette (Catppuccin Mocha)

```css
--bg-base: #1e1e2e;
--bg-mantle: #181825;
--bg-crust: #11111b;
--surface-0: #313244;
--surface-1: #45475a;
--surface-2: #585b70;
--text: #cdd6f4;
--subtext: #a6adc8;
--overlay: #6c7086;

--color-read: #89b4fa;     /* blue */
--color-write: #a6e3a1;    /* green */
--color-edit: #f9e2af;     /* yellow */
--color-bash: #fab387;     /* peach */
--color-agent: #cba6f7;    /* mauve */
--color-grep: #94e2d5;     /* teal */
--color-error: #f38ba8;    /* red */
--color-running: #f5c2e7;  /* pink, pulsing */
```

## Visual Rules

- **Agent rows**: slightly taller (32px vs 26px), bold label, gradient bar, collapsible chevron
- **Nested tool rows**: indented 24px under parent agent, monospace label
- **Error rows**: bar transitions from tool color to red, red dot at end
- **Running rows**: right edge pulses (CSS animation)
- **Hover**: row background changes to surface-0 at 50% opacity
- **Selected**: row background tinted with tool color at 10% opacity
- **Grid lines**: vertical dashed lines at 25%, 50%, 75% of timeline
- **Time axis**: above waterfall column, labels at 0%, 25%, 50%, 75%, 100%

## SVG Icons

Every icon is an inline SVG React component. Required icons:
- `FileIcon` — for Read tool (document outline)
- `PencilIcon` — for Write tool (pencil/edit)
- `WrenchIcon` — for Edit tool (wrench)
- `TerminalIcon` — for Bash tool (terminal window)
- `CpuIcon` — for Task/Agent tool (robot/cpu)
- `SearchIcon` — for Grep/Glob tool (magnifying glass)
- `ChevronDownIcon` / `ChevronRightIcon` — for expand/collapse
- `CloseIcon` — for closing detail panel
- `FilterIcon` — for filter input
- `WaterfallIcon` — for the noctrace logo mark

All icons: 16x16 viewBox, `stroke` style (not fill), accept `color` and `size` props.

## Detail Panel

Bottom panel, shown on row click. Two-column layout (input | output).

- Left column: tool input (monospace, pre-wrapped)
- Right column: tool output (monospace, red text if error)
- Header: tool icon + badge + label + close button
- Metadata row: duration, status, parent agent name

## Session Picker

Left sidebar or top bar with project list and session list.

- Projects: read from `~/.claude/projects/` directory listing
- Sessions: read from `sessions-index.json` or sort JSONL files by mtime
- Show: session summary (first user message or auto-summary), date, message count
- Active session: highlighted, auto-selected on load

## Filtering

- Input field in toolbar with filter icon
- Filters by: tool name, label text (case-insensitive substring match)
- Non-matching rows are hidden but agents stay visible if any child matches
- Clear button to reset filter

## Per-Row Context Degradation Indicators

Every row carries a `ctx` value: the context window fill percentage at the moment that tool call executed. This enables row-level degradation marking.

### Heat Strip
- 3px-wide vertical bar on the far left of every row
- Color transitions with the context fill: green (<50%) → teal (50-65%) → yellow (65-80%) → peach (80-90%) → red (>90%)
- Provides an at-a-glance scannable "heat map" down the left edge of the waterfall
- No interaction — purely visual, always visible

### Context % Column
- 36px column between Tokens and Waterfall columns
- Shows the context fill percentage at execution time (e.g., "42%", "87%")
- Text color matches the heat strip color for that percentage
- Values ≥80% are bold weight to draw attention
- Column header is a warning triangle SVG icon with tooltip "Context fill % at execution"

### Row Tinting
- Rows where ctx ≥ 80% get a subtle red background tint (RED at 8% opacity)
- Hover state on degraded rows uses RED at 12% opacity instead of the default surface color
- Selected state still uses the tool color tint (overrides degradation tint)

### Detail Panel Context Badge
- When a row is selected, the detail panel metadata row includes a context badge
- Badge shows: percentage, colored background matching the heat color, and "degraded" label if ≥80%
- Format: `[87% context degraded]` in a pill/badge with colored border

### Visual Rules for Responsive
On viewports < 768px, hide the Context % column but keep the heat strip (it's only 3px wide)

## Responsive Behavior

Desktop-first. On viewports < 768px:
- Hide Type and Time columns
- Show only Name + Waterfall bar
- Detail panel takes full width at bottom
- Session picker becomes a dropdown
