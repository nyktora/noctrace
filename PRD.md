# Noctrace — PRD v1.1

> Chrome DevTools Network-tab-style real-time waterfall visualizer for Claude Code agent workflows.
> Name: "noctrace" — from Latin *nox/noctis* (night) + trace. Aligned with Nyktora brand.

---

## Problem Statement

When Claude Code spawns sub-agents and executes tool calls, the terminal output is opaque. Recent Claude Code updates replaced detailed tool output with summaries like "Read 3 files" and "Edited 2 files" — no paths, no content, no timing. Developers have no way to understand concurrency, duration, parent-child relationships, or where time is being spent across a multi-agent session.

Existing tools (disler's hooks-based dashboard, claude-devtools) solve observability but use event-list or tree-based views. None offer a **waterfall timeline** — the visual paradigm that makes Chrome DevTools' Network tab instantly readable for understanding request timing, concurrency, and bottlenecks.

---

## Target User Persona

**Lam** — and developers like him. Solo dev or small team using Claude Code daily for multi-agent workflows. Comfortable with the terminal. Wants to understand what Claude Code is doing under the hood without leaving the terminal or installing heavy tooling. Specifically:

- Uses Claude Code with sub-agents (Task/Agent tool) regularly
- Wants to see which agents are running concurrently
- Wants to understand where time is spent (which tool calls are slow)
- Wants to see the parent→child agent hierarchy at a glance
- Doesn't want to configure hooks per project — wants it to "just work"

---

## Competitive Landscape

| Tool | Approach | Visual Model | Real-time | Zero-config | License |
|------|----------|-------------|-----------|-------------|---------|
| **disler/claude-code-hooks-multi-agent-observability** | Hooks → HTTP → Bun → SQLite → WebSocket → Vue | Event list + swim lanes + pulse chart | Yes | No (hooks per project) | MIT |
| **claude-devtools (matt1398)** | Reads `~/.claude/` JSONL logs | Tree view + turn-based timeline | Near-real-time (file watcher) | Yes | MIT |
| **Langfuse self-hosted** | Hooks → Langfuse traces/spans | Trace waterfall (generic LLM observability) | Yes | No (Docker 6-service stack) | MIT |
| **Noctrace (this project)** | Reads `~/.claude/` JSONL logs | Chrome DevTools Network-tab waterfall | Near-real-time (file watcher) | Yes | MIT |

**Competitive gap:** No tool offers a Chrome DevTools Network-tab-style waterfall specifically designed for Claude Code agent workflows. The waterfall paradigm communicates concurrency, duration, and nesting at a glance — something event lists and tree views cannot do.

**Refs:**
- disler: https://github.com/disler/claude-code-hooks-multi-agent-observability
- claude-devtools: https://github.com/matt1398/claude-devtools
- Langfuse: https://langfuse.com

---

## Platform Decision

**Local web app** — Node.js server + browser tab.

Rationale:
- The pain point happens at a desktop workstation while using a terminal
- No mobile use case exists
- A browser tab alongside the terminal is the natural workflow (same as Chrome DevTools)
- Zero deployment complexity — `npx noctrace` and open localhost
- No app store reviews, no Electron overhead, no desktop framework dependency
- Web tech enables the richest interactive visualization with zero friction

---

## Core User Flows

### Flow 1: First Launch
1. User runs `npx noctrace` (or `noctrace` if globally installed)
2. Local server starts on `http://localhost:4117` (or next available port)
3. Browser opens automatically
4. Server scans `~/.claude/projects/` for available projects
5. UI shows project picker with recent sessions
6. User selects a project → sees recent sessions listed by date/summary

### Flow 2: Watching a Live Session
1. User selects the most recent (active) session for a project
2. Server watches the session's `.jsonl` file via `chokidar`
3. As new JSONL lines are appended, server parses them and pushes events via WebSocket
4. Browser renders each event as a row in the waterfall:
   - **Agent rows** appear as collapsible group headers with a full-width bar showing their total lifespan
   - **Tool call rows** appear nested under their parent agent with colored bars showing start→end timing
   - Bars grow in real-time as tool calls are in progress (open-ended until tool_result arrives)
5. The waterfall auto-scrolls to follow new activity (toggleable)

### Flow 3: Inspecting a Completed Session (Post-Mortem)
1. User picks any past session from the session list
2. Full JSONL is parsed and rendered as a complete waterfall
3. User can zoom/pan the timeline, collapse/expand agent groups, click any row for detail
4. Detail panel shows: tool name, full input/output, duration, token usage

### Flow 4: Filtering
1. User types in a filter bar (like Chrome DevTools)
2. Filters by: tool name (Bash, Read, Write, Edit, Agent/Task), agent name, status (success/error), duration threshold
3. Non-matching rows dim but remain visible for timeline context

---

## What's IN the MVP (all implemented)

1. **Waterfall timeline view** — horizontal bars on a shared time axis, positioned by start time, width = duration. Virtual scrolling for sessions with 200+ rows (36px constant-height rows, 3-row overscan buffer).
2. **Collapsible agent groups** — agents as row groups, tool calls nested inside. Agents collapsed by default. Agent rows use `totalDurationMs` from JSONL for real execution time bars (not instant dispatch duration).
3. **Sub-agent JSONL parsing** — reads sub-agent session files from `{sessionId}/subagents/agent-{agentId}.jsonl`, links them to parent agent rows via `toolUseResult.agentId`, and renders their tool calls as nested children. Agents without sub-agent telemetry show a summary placeholder.
4. **Real-time updates** — chokidar file watcher pushes new events via WebSocket. Byte-offset incremental parsing (reads only new bytes appended to JSONL). Auto-reconnect with 2-second backoff.
5. **Color coding** — distinct colors per tool type (Read = blue, Write = green, Bash = peach, Edit = yellow, Agent/Task = mauve, Grep/Glob = teal, MCP = teal, errors = red). 3px heat strip on left edge of each row (green→red based on context fill %).
6. **Row detail panel** — click any row to see full tool input/output in a resizable bottom panel (drag to resize 100–600px). Two-column layout: input (left), output (right). Pushes waterfall content up rather than overlaying. Close with Esc or close button.
7. **Session picker** — left sidebar (240px) showing projects → sessions from `~/.claude/projects/`. Projects sorted by most recently modified. Sessions show short ID, call count, relative time.
8. **Filtering** — filter bar with text search against tool name, label. Special filters: "error" (error rows), "agent" (agent rows), "running" (in-progress rows). Non-matching rows dim to 25% opacity but remain visible for timeline context. Matched text in the Name column is highlighted with a yellow background.
9. **Zoom/pan** — mouse wheel zoom (1–50x, centers on cursor position). Click-drag panning when zoomed >1x. Pan bounds prevent over-scrolling.
10. **Auto-scroll** — smart toggle: activates only when user is scrolled near the bottom (within 2 rows). Deactivates when user scrolls up. Toolbar button shows current state.
11. **Dark theme** — Catppuccin Mocha palette with 25 CSS custom properties. Tool-specific semantic colors. Responsive: hides context % column on screens <768px.
12. **Context Health grade** — real-time A–F letter grade computed from 5 weighted signals: context fill (40%), compaction count (25%), re-read ratio (15%), error acceleration (10%), tool efficiency (10%). Displayed as compact stats pill in toolbar containing: agent count (robot icon), health badge (20px, scalable via `size` prop), warning icon, total token count, and session duration. Click health badge to expand breakdown panel with per-signal bars, grades, and actionable recommendations. Health bar: 4px gradient bar above timeline showing current fill level.
13. **Compaction boundaries** — vertical red dashed lines across the waterfall at each `compact_boundary` system record timestamp. Grid lines at 25/50/75% of session duration.
14. **Re-read detection** — tracks Read calls to same file path within a session. Marks duplicates with a repeat icon (↻) on the waterfall bar.
15. **CLI packaging** — `npx noctrace` or `noctrace` (global install). Auto-opens browser. Port 4117 default with auto-fallback (retries up to 10 ports on EADDRINUSE). `bin/noctrace.js` entry point.
16. **GitHub Pages site** — static landing page and docs page in `site/` directory. Deployed via GitHub Actions workflow (`.github/workflows/pages.yml`).
16. **Multi-column waterfall layout** — Row # | Name | Type | Duration | Tokens | Context % | Waterfall bar. Time axis with 5 tick labels. Column headers with sort-like alignment.
17. **Token tracking** — per-row input/output tokens from assistant record usage. Total token counter in toolbar. Yellow highlight on rows exceeding 5k tokens.
18. **Dynamic context fill calculation** — uses session's peak observed token count to detect effective context window (handles Opus 4.6's ~300k auto-compaction ceiling). Falls back to 200k default for smaller sessions.
19. **Demo data system** — sample projects in `demo/.claude/projects/` with realistic session data. Activated via `CLAUDE_HOME` env var override for clean screenshots without personal data.

## What's Explicitly OUT of MVP

- Hooks-based real-time (using passive log watching instead)
- Token cost aggregation / budget tracking
- Diff visualization for Edit/Write tool calls
- Multi-session comparison
- Export / screenshot functionality
- Remote SSH session viewing
- Team/multi-user features
- Notification system
- Any form of user accounts, auth, or cloud
- Mobile responsive design (desktop-only tool)
- Duration threshold filtering (filter by "slow" calls)
- Loading state spinners (empty states exist but no loading indicators)

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Browser Tab                     │
│  ┌─────────────────────────────────────────────┐  │
│  │   React SPA (Waterfall UI)                  │  │
│  │   - Session picker sidebar                  │  │
│  │   - Waterfall timeline (custom component)   │  │
│  │   - Detail panel                            │  │
│  └──────────────────┬──────────────────────────┘  │
│                     │ WebSocket                    │
└─────────────────────┼────────────────────────────-┘
                      │
┌─────────────────────┼────────────────────────────-┐
│              Node.js Server                        │
│  ┌──────────────────┴──────────────────────────┐  │
│  │   Express (serves SPA + REST API)           │  │
│  │   - GET /api/projects                       │  │
│  │   - GET /api/sessions/:projectSlug          │  │
│  │   - GET /api/session/:sessionId             │  │
│  │   WebSocket server (ws)                     │  │
│  │   - Pushes parsed JSONL events in real-time │  │
│  │   JSONL Parser                              │  │
│  │   - Parses session files into typed events  │  │
│  │   File Watcher (chokidar)                   │  │
│  │   - Watches active session .jsonl files     │  │
│  └──────────────────┬──────────────────────────┘  │
│                     │ fs.read / fs.watch           │
└─────────────────────┼────────────────────────────-┘
                      │
          ┌───────────┴──────────────────────────┐
          │  ~/.claude/projects/                 │
          │  (or $CLAUDE_HOME/projects/)         │
          │  ├── -Users-jane-project-a/           │
          │  │   ├── abc123.jsonl                │
          │  │   ├── abc123/                     │
          │  │   │   └── subagents/              │
          │  │   │       └── agent-xyz.jsonl     │
          │  │   └── def456.jsonl                │
          │  └── -Users-jane-project-b/           │
          │      └── ghi789.jsonl                │
          └────────────────────────────────────-─┘
```

---

## JSONL Parsing Spec

Claude Code session logs are stored at `~/.claude/projects/{encoded-path}/*.jsonl` where the path encoding replaces `/` with `-` (e.g., `/Users/jane/project` → `-Users-jane-project`).

Each line is a JSON object with a `type` field. Relevant types for the waterfall:

### Record Types

```typescript
// Common fields on every record
interface BaseRecord {
  type: "user" | "assistant" | "system" | "result";
  sessionId: string;
  timestamp: string; // ISO-8601
  uuid: string;
  parentUuid: string | null;
}

// Assistant message — contains tool_use and text blocks
interface AssistantRecord extends BaseRecord {
  type: "assistant";
  message: {
    role: "assistant";
    content: ContentBlock[];
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

// Content block types within assistant messages
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, any> }
  | { type: "thinking"; thinking: string };

// User message — contains tool_result blocks (tool outputs)
interface UserRecord extends BaseRecord {
  type: "user";
  message: {
    role: "user";
    content: ToolResultBlock[] | string;
  };
  isMeta?: boolean; // true = internal (tool results), false = real user message
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string; // links back to the tool_use block's id
  content: string | any[];
  is_error?: boolean;
}

// User records for agent tool_results also contain:
interface UserRecordWithAgent extends UserRecord {
  toolUseResult?: {
    agentId: string; // links to subagents/agent-{agentId}.jsonl
  };
}

// System messages
interface SystemRecord extends BaseRecord {
  type: "system";
  subtype?: "init" | "compact_boundary";
}
```

### Waterfall Event Extraction Logic

1. **Scan assistant records** for `content` blocks where `type === "tool_use"`
2. Each `tool_use` block becomes a waterfall row:
   - `startTime` = the assistant record's `timestamp`
   - `toolName` = block's `name` field (e.g., "Bash", "Read", "Write", "Edit", "Task", "Agent")
   - `toolInput` = block's `input` field
   - `toolUseId` = block's `id` field
3. **Match tool results**: scan subsequent user records (where `isMeta: true`) for `tool_result` blocks whose `tool_use_id` matches
   - `endTime` = the user record's `timestamp`
   - `isError` = `is_error` field on the tool_result
   - `output` = `content` field on the tool_result
4. **Identify agents**: tool_use blocks where `name === "Task"` or `name === "Agent"` or `name === "dispatch_agent"` represent sub-agent spawns
   - The `input.description` or `input.prompt` field provides the agent label (e.g., "Agent (Refactor auth module)")
   - The tool_result for the Task/Agent call marks the agent's completion
5. **Build hierarchy**: use `parentUuid` chains and `isMeta` flags to reconstruct the agent→tool-call tree
6. **Sub-agent JSONL linking**: User records with `toolUseResult.agentId` link a parent tool_use to a sub-agent session file at `{sessionId}/subagents/agent-{agentId}.jsonl`. The server reads these files and attaches their parsed rows as children of the matching agent row.
7. **Context fill calculation**: After all rows are parsed, detect the session's peak token count. If peak exceeds 200k (the default fallback), use it as the effective context window (Opus 4.6 auto-compacts at ~300k). Recalculate all rows' `contextFillPercent` relative to this effective ceiling.

### Waterfall Row Model

```typescript
interface WaterfallRow {
  id: string;              // tool_use block id
  type: "agent" | "tool";  // agent = Task/Agent tool, tool = everything else
  toolName: string;         // "Bash", "Read", "Write", "Edit", "Task", etc.
  label: string;            // Human-readable label (e.g., "Bash: npm test")
  startTime: number;        // Unix ms
  endTime: number | null;   // null = still running
  duration: number | null;  // ms, computed
  status: "running" | "success" | "error";
  parentAgentId: string | null; // id of parent agent row, null if top-level
  input: Record<string, any>;
  output: string | null;
  inputTokens: number;      // from assistant record's usage.input_tokens
  outputTokens: number;     // from assistant record's usage.output_tokens
  contextFillPercent: number; // context window fill % at time of this tool call (0-100)
  isReread: boolean;        // true if this Read targets a file already read in this session
  children: WaterfallRow[]; // nested tool calls (for agent rows)
}
```

---

## Waterfall UI Spec

### Layout (Chrome DevTools Network Tab Paradigm)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Logo] [Tabs] [Filter]    [agents][tools][tokens][time]  [B Health] │
├─────────────────────────────────────────────────────────────────────┤
│ ░░░░░░░░░ Context Health Bar (green→yellow→red gradient) ░░░░░░░░░ │
├──────────┬──────┬──────┬────────┬───────────────────────────────────┤
│ Name     │ Type │ Time │ Tokens │ Waterfall                         │
├──────────┼──────┼──────┼────────┼───────────────────────────────────┤
│ ▼ Agent: │ Task │12.4s │ 21.2k  │ ████████████████████████████████  │
│   Review │      │      │        │                                   │
│   Read   │ Read │ 0.3s │  460   │  ██                               │
│   Read   │ Read │ 0.2s │  4.1k  │  █                   ¹ compaction │
│   Edit   │ Edit │ 1.1s │  775   │      ████            │            │
│   Bash   │ Bash │ 3.2s │  2.0k  │            ██████████│██          │
│ ▼ Agent: │ Task │ 8.7s │ 12.8k  │    ██████████████████│█           │
│   Test   │      │      │        │                      │            │
│   Bash   │ Bash │ 5.1s │  1.4k  │      ████████████████│            │
│   Read ↻ │ Read │ 0.1s │  4.1k  │                      │  █         │
│ Write    │Write │ 0.4s │  2.5k  │                      │       ██   │
├──────────┴──────┴──────┴────────┴───────────────────────────────────┤
│ [Detail: Bash | 3.2s | ✓ | 180 in / 2.0k out]                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Visual Rules

- **Time axis**: horizontal, left = session start, right = now (or session end). 5 evenly-spaced tick labels.
- **Bars**: colored rectangles positioned by `(startTime - sessionStart)` and width = `duration`. Minimum bar width ensures visibility for fast calls.
- **Running bars**: white edge pulse animation (1.2s oscillation) until `endTime` is set
- **Agent rows**: 12px tall bar (vs 8px for tools), bold label, collapsible chevron icon (rotates on expand)
- **Nested rows**: indented 24px under parent agent
- **Error rows**: red bar color
- **Heat strip**: 3px left edge on every row, colored by context fill % (green→teal→yellow→peach→red)
- **Hover**: light background highlight on hover (degraded rows use reddish tint)
- **Click**: selects row, expands resizable detail panel at bottom. Selected row scrolls into view above panel.
- **Zoom**: mouse wheel on timeline zooms 1–50x, centered on cursor position
- **Pan**: click-drag on timeline pans horizontally when zoomed >1x. Pan bounds enforced.
- **Grid lines**: vertical dashed lines at 25%, 50%, 75% of session duration. Compaction boundaries as red dashed lines.
- **Re-read indicator**: repeat icon (↻) rendered next to bar for duplicate file reads
- **Multi-column layout**: Row # | Name (200px) | Type badge (56px) | Duration (52px) | Tokens (68px) | Context % (36px) | Waterfall bar (flex)

### Color Palette (Catppuccin Mocha)

```
Background:    #1e1e2e (base)
Surface:       #313244 (surface0)
Row hover:     #45475a (surface1)
Row selected:  #585b70 (surface2)
Text:          #cdd6f4 (text)
Subtext:       #a6adc8 (subtext0)

Tool colors:
  Read:        #89b4fa (blue)
  Write:       #a6e3a1 (green)
  Edit:        #f9e2af (yellow)
  Bash:        #fab387 (peach)
  Agent/Task:  #cba6f7 (mauve)
  Grep/Glob:   #94e2d5 (teal)
  Error:       #f38ba8 (red)
  Running:     #f5c2e7 (pink, pulsing)
```

---

## Context Health Score

### Overview

Context rot — the progressive degradation of Claude's output quality as the context window fills — is the #1 pain point in long Claude Code sessions. Noctrace computes a real-time **Context Health** grade (A through F) from signals in the JSONL data, giving developers an early warning before quality collapses.

No other tool does this. claude-devtools shows token counts. Disler's tool shows event logs. Nobody computes a composite health score that says "your session is degrading, act now."

### Signals & Weights

| Signal | Weight | Computation | Thresholds |
|--------|--------|-------------|------------|
| **Context fill %** | 40% | `latest input_tokens / effective_window` — effective window is the session's peak observed token count or 200k fallback (Opus 4.6 auto-compacts at ~300k) | A: <50%, B: 50-65%, C: 65-80%, D: 80-90%, F: >90% |
| **Compaction count** | 25% | Count of `system` records with `subtype: "compact_boundary"` | A: 0, B: 1, C: 2, D: 3, F: 4+ |
| **Re-read ratio** | 15% | Duplicate Read file paths / total Read calls | A: 0-5%, B: 5-10%, C: 10-20%, D: 20-35%, F: >35% |
| **Error acceleration** | 10% | Error rate in second half vs first half of session | A: no increase, B: <2x, C: 2-3x, D: 3-5x, F: >5x |
| **Tool efficiency** | 10% | (Write + Edit calls) / total tool calls, comparing halves | A: stable/growing, B: slight decline, C: moderate decline, D: steep decline, F: near-zero output |

### Grade Computation

```typescript
interface ContextHealth {
  grade: "A" | "B" | "C" | "D" | "F";
  score: number;           // 0-100 weighted composite
  fillPercent: number;     // 0-100 context window usage
  compactionCount: number;
  rereadRatio: number;     // 0-1
  errorAcceleration: number; // ratio of second-half to first-half error rate
  toolEfficiency: number;  // 0-1 ratio of productive (Write/Edit) calls
  signals: {
    name: string;
    value: number;
    grade: "A" | "B" | "C" | "D" | "F";
    weight: number;
  }[];
}
```

Each signal maps to a 0-100 sub-score. The composite is the weighted average. Grade thresholds: A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, F < 40.

### Visual Treatment

**Toolbar badge**: Letter grade in a colored circle, always visible. Colors: A = green (#a6e3a1), B = teal (#94e2d5), C = yellow (#f9e2af), D = peach (#fab387), F = red (#f38ba8). Click to expand the breakdown panel.

**Context health bar**: A 4px-tall gradient bar spanning the full width of the waterfall column, positioned above the time axis. Transitions from green → yellow → red left-to-right as the session progresses and health degrades. Acts as a session-level "temperature" visualization.

**Compaction boundary lines**: Vertical dashed lines (2px, red at 40% opacity) cutting across the entire waterfall at the timestamp of each `compact_boundary` record. Similar to Chrome DevTools' DOMContentLoaded (blue) and Load (red) event lines.

**Re-read indicators**: When a Read row targets a file that was already read earlier in the session, a small circular "repeat" SVG icon appears on the bar, rendered in the warning color.

**Breakdown panel**: Expands below the toolbar when the grade badge is clicked. Shows a horizontal bar for each signal with its sub-grade, value, and weight. Includes an **actionable recommendations** section with color-coded alerts:
- **Critical (red)**: Context saturated (>95% — too late for /compact), multiple compactions (3+), high error acceleration (>3x)
- **Warning (yellow)**: Fill at 60-80% (ideal time to /compact), approaching re-read threshold, efficiency declining
- **Info (green)**: Healthy signals, first compaction detected
Each recommendation includes specific guidance (e.g., "Run /compact now — this is the sweet spot", "Delegate research to subagents"). Closes on second click or Escape.

### Data Sources in JSONL

- **Token usage**: `message.usage.input_tokens` on assistant records
- **Compaction events**: `type: "system"` + `subtype: "compact_boundary"` + `compactMetadata`
- **Read targets**: `tool_use` blocks where `name === "Read"`, extract `input.file_path`
- **Error detection**: `tool_result` blocks where `is_error === true`
- **Tool type counting**: `tool_use` blocks categorized by `name` field

---

## Tech Stack

### Server

| Package | Purpose | Version | License | Free Tier | Docs |
|---------|---------|---------|---------|-----------|------|
| Node.js | Runtime | 20 LTS+ | MIT | N/A | https://nodejs.org/docs/latest-v20.x/api/ |
| Express | HTTP server + REST API | 4.x | MIT | N/A | https://expressjs.com/en/4x/api.html |
| ws | WebSocket server | 8.x | MIT | N/A | https://github.com/websockets/ws |
| chokidar | File system watcher | 4.x | MIT | N/A | https://github.com/paulmillr/chokidar |
| open | Open browser on start | 10.x | MIT | N/A | https://github.com/sindresorhus/open |

### Client

| Package | Purpose | Version | License | Docs |
|---------|---------|---------|---------|------|
| React | UI framework | 19.x | MIT | https://react.dev |
| Vite | Build tool + dev server | 6.x | MIT | https://vite.dev |
| Tailwind CSS | Styling | 4.x | MIT | https://tailwindcss.com/docs |
| Zustand | State management | 5.x | MIT | https://github.com/pmndrs/zustand |

### Waterfall Rendering

**No external charting library.** The waterfall is a custom React component using:
- Positioned `div` elements for bars (CSS `position: absolute`, `left` and `width` computed from time offsets)
- CSS transitions for smooth bar growth on live updates
- `requestAnimationFrame` for zoom/pan performance
- Virtual scrolling (only render visible rows) for sessions with hundreds of tool calls

Rationale: Gantt chart libraries are designed for project management (drag-to-edit, dependencies, resource allocation). We need a read-only waterfall optimized for real-time streaming — simpler to build custom than to fight a Gantt library's paradigm.

---

## Tech Constraints

- **Zero cost at rest**: no cloud, no database, no background processes. Server starts when you run the command, stops when you close it.
- **Zero config**: reads `~/.claude/` directly. No hooks to install, no settings to configure.
- **Serverless-adjacent**: while this is a local tool (not deployed to cloud), the architecture should remain stateless — all state comes from the JSONL files on disk.
- **No database**: JSONL files are the source of truth. All parsing happens in-memory on demand.
- **Single process**: one Node.js process serves the SPA, REST API, and WebSocket.

---

## Legal Requirements

- **License**: MIT (matches the ecosystem — claude-devtools, disler's tool, and all dependencies are MIT)
- **Privacy**: no data collection, no analytics, no network calls. Everything stays local.
- **No ToS needed**: open-source tool, no accounts, no payments
- **API terms**: no APIs consumed. Reads local files only.
- **Claude Code compatibility**: session logs are stored locally on the user's machine. No Anthropic API is called. No terms are violated.

### Dependency License Audit

All dependencies are MIT licensed:
- Express (MIT), ws (MIT), chokidar (MIT), open (MIT)
- React (MIT), Vite (MIT), Tailwind CSS (MIT), Zustand (MIT)

No GPL/copyleft risks.

---

## Distribution & Discovery

### Installation
```bash
# Option 1: npx (zero install)
npx noctrace

# Option 2: global install
npm install -g noctrace
noctrace

# Option 3: clone and run
git clone https://github.com/nyktora/noctrace.git
cd noctrace && npm install && npm start
```

### Discovery Channels
1. **GitHub** — primary distribution. README with GIF/video demo of the waterfall in action
2. **Reddit** — r/ClaudeAI, r/ChatGPTCoding, r/LocalLLaMA (claude-devtools got 100k views, 500+ upvotes on Reddit)
3. **awesome-claude-code** — submit PR to https://github.com/hesreallyhim/awesome-claude-code (curated list with 800+ stars)
4. **Dev.to / Hashnode** — write-up on "I built a Chrome DevTools-style waterfall for Claude Code"
5. **X/Twitter** — demo video targeting Claude Code power users
6. **Product Hunt** — optional, claude-devtools launched there successfully

---

## Analytics (What to Measure from Day One)

Since this is open source with no tracking, metrics are GitHub-based:
- **Stars** over time (growth signal)
- **Issues filed** (adoption signal — people using it enough to hit edges)
- **Forks** (community investment)
- **npm weekly downloads** (actual usage)

No in-app analytics. No telemetry. This is a principled choice matching the target audience (privacy-conscious developers).

---

## Success Metrics

| Metric | Target (90 days) | How Measured |
|--------|------------------|--------------|
| GitHub stars | 200+ | GitHub |
| npm weekly downloads | 100+ | npmjs.com |
| Issues filed by non-authors | 10+ | GitHub Issues |
| Listed in awesome-claude-code | Yes | PR merged |
| README has demo GIF/video | Yes | Ship requirement |

---

## Prerequisites Checklist

| Item | Est. Time | Est. Cost | Dependency | Status |
|------|-----------|-----------|------------|--------|
| npm account (for publishing) | 5 min | Free | None | ✅ Created |
| GitHub repo created | 5 min | Free | None | ✅ Done |
| `noctrace` npm name available | 5 min | Free | npm account | ✅ Verified available |
| Node.js 20+ installed | Already done | Free | None | ✅ Done |
| Claude Code installed (for testing) | Already done | Free | None | ✅ Done |
| Demo data for screenshots | Done | Free | None | ✅ Created in `demo/` |
| Promotional screenshots | Done | Free | Demo data | ✅ Saved in `docs/screenshots/` |

**Remaining:** `npm publish --access public` to claim the name and go live.

---

## Open Risks & Assumptions

### Risk 1: JSONL Format Changes (HIGH)
Claude Code could change its session log format at any time. This is an undocumented internal format.
- **Mitigation**: Abstract the JSONL parser behind an interface. Pin to known format version. Add format detection that warns users if an unrecognized structure is found. Monitor Claude Code changelogs.

### Risk 2: Sub-Agent Hierarchy Reconstruction (RESOLVED)
Mapping tool calls to their parent agents from flat JSONL is non-trivial. The `parentUuid` chain and `isMeta` flag patterns may have edge cases.
- **Resolution**: Implemented two-layer approach: (1) `parentUuid` chains + `isMeta` flags for basic hierarchy, (2) `toolUseResult.agentId` linking to sub-agent JSONL files in `{sessionId}/subagents/` for full sub-agent tool call visibility. Agents without sub-agent telemetry gracefully degrade to a summary placeholder.

### Risk 3: Large Session Files (RESOLVED)
Some power users have sessions with 500+ messages. Parsing and rendering these must remain performant.
- **Resolution**: Virtual scrolling implemented with constant-height rows (36px), 3-row overscan buffer, and ResizeObserver for dynamic viewport sizing. WebSocket file watcher uses byte-offset incremental parsing (reads only new bytes). Tested with sessions of 300+ tool calls.

### Risk 4: File Watcher Latency (LOW)
`chokidar` on macOS may have slight delays detecting file changes.
- **Mitigation**: Acceptable for "near real-time." If latency > 1s, fall back to polling at 500ms intervals.

### Risk 5: Competition Adds Waterfall View (LOW)
claude-devtools or disler's tool could add a waterfall view.
- **Mitigation**: Ship fast. The waterfall is the differentiator — if someone else builds it too, that validates the concept. Being open-source means community adoption compounds.

---

## Go-to-Market: Launch Checklist

### Pre-Launch (while building)
- [x] Promotional screenshots captured (`docs/screenshots/noctrace-waterfall.png`, `noctrace-context-rot.png`)
- [x] Demo data created for clean screenshots without personal info
- [ ] Record terminal demo: `npx noctrace` → browser opens → live waterfall populating
- [ ] Create demo GIF (15-30 seconds, embedded in README)
- [ ] Write README: problem statement, screenshot, `npx noctrace`, architecture diagram

### Launch Day
- [ ] Publish to npm: `npm publish --access public`
- [ ] Post to r/ClaudeAI with demo GIF + problem statement + "I built this"
- [ ] Post to r/ChatGPTCoding
- [ ] Submit PR to awesome-claude-code
- [ ] Tweet/post on X with video demo tagging @AnthropicAI
- [ ] Post on Dev.to

### Post-Launch (Week 1)
- [ ] Respond to all GitHub issues within 24h
- [ ] Collect feature requests, triage into "next" vs "later"
- [ ] If reception is strong, post on Product Hunt

---

## Self-Critique

### Weakest assumption
That the JSONL format is stable enough to build on. It's undocumented and could change with any Claude Code update. **Fix**: multiple projects (claude-devtools, clog, claude-code-log) all depend on this format. Anthropic is unlikely to break it silently given the ecosystem, but we should version our parser and fail gracefully.

### Most likely scope creep
Adding diff visualization, token tracking, cost aggregation, and multi-session comparison. Each is a "nice to have" that doubles complexity. **Fix**: hard MVP boundary. Ship the waterfall. Everything else is v2.

### Tech choice that could bite later
Custom waterfall rendering. If the UI needs to get significantly more complex (zooming into sub-millisecond ranges, overlapping tooltip interactions), a custom implementation could become painful. **Fix**: keep the rendering layer isolated behind a clean interface. If canvas becomes necessary later, the data model won't change.

### Legal surface area
Minimal. No APIs, no user data, no cloud, MIT everywhere. The only risk is if Anthropic decides to lock down or encrypt session logs, which would break all log-reading tools, not just ours.

### Could a competitor clone this in a week?
Yes — and that's fine. It's open source. The moat is community adoption and the quality of the waterfall UX. Being first with a polished implementation matters more than defensibility.

### Platform choice check
Web is correct. This is a desktop developer tool. An Electron app would add build complexity for no benefit — a browser tab does the same job. A CLI-only version would defeat the purpose (the value IS the visual).

### Time-gated blockers
None. Zero. This is the fastest possible path from PRD to shipped product.

---

## Build Sequence (for Claude Code)

Recommended order of implementation. Steps 1–13 are complete as of v1.0:

1. **Scaffold** — Node.js + Express + Vite + React project structure. Single `npm run dev` boots both server and client. ✅
2. **JSONL Parser** — Module that reads a `.jsonl` file and extracts `WaterfallRow[]`. Unit tested with fixture files. ✅
3. **REST API** — `GET /api/projects`, `GET /api/sessions/:slug`, `GET /api/session/:slug/:id` returning parsed data with sub-agent children. ✅
4. **Session Picker UI** — Sidebar component showing projects → sessions. Auto-fetches on selection. ✅
5. **Waterfall Component** — Virtual-scrolled timeline with multi-column layout. Static rendering first, then real-time. ✅
6. **Detail Panel** — Resizable bottom panel (100–600px) with two-column input/output. Pushes waterfall up. ✅
7. **Context Health** — 5-signal scoring engine with tests. Grade badge, health bar, breakdown panel with recommendations. ✅
8. **Context Health UI** — Circular badge, 4px gradient bar, compaction boundary lines, breakdown popup. ✅
9. **File Watcher + WebSocket** — chokidar byte-offset incremental parsing, ws push with health updates, auto-reconnect. ✅
10. **Zoom/Pan** — Mouse wheel zoom (1–50x centered on cursor), click-drag pan with bounds. ✅
11. **Filtering** — Text filter with special keywords (error, agent, running). Non-matching rows dim. ✅
12. **Sub-agent parsing** — Reads `{sessionId}/subagents/agent-{agentId}.jsonl`, links via `toolUseResult.agentId`, renders as nested children. ✅
13. **CLI & Packaging** — `bin/noctrace.js` with auto-open browser, port fallback (up to 10 retries), `npm` bin entry. ✅

### Remaining for polish:
- Loading state spinners (while fetching projects/sessions/data)
- Duration threshold filtering (filter by "slow" calls)
- Demo GIF/video for README

---

*PRD v1.1 — Noctrace*
*Author: Claude (product strategist) + Lam (Nyktora Group LLC)*
*Created: March 30, 2026 | Updated: April 2, 2026*
*Status: MVP complete. All core features implemented and tested (119 tests passing).*
