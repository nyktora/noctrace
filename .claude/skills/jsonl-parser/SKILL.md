---
name: jsonl-parser
description: Claude Code JSONL session log parsing specification. Use when implementing or modifying the JSONL parser, building test fixtures, or debugging parsing issues.
---

# Claude Code JSONL Parser Specification

## File Location

Session logs are at `~/.claude/projects/{encoded-path}/*.jsonl` where path encoding replaces `/` with `-` (e.g., `/Users/jane/project` becomes `-Users-jane-project`).

Additionally, `~/.claude/projects/{encoded-path}/sessions-index.json` contains session metadata (summaries, message counts, timestamps).

## Record Format

Each line is a JSON object with these common fields:

```typescript
interface BaseRecord {
  type: "user" | "assistant" | "system" | "result";
  sessionId: string;
  timestamp: string;       // ISO-8601
  uuid: string;
  parentUuid: string | null;
  version?: string;
  cwd?: string;
  gitBranch?: string;
}
```

## Assistant Records

Contain Claude's responses with text and tool_use blocks:

```typescript
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

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, any> }
  | { type: "thinking"; thinking: string };
```

## User Records

Contain user messages or tool results (when `isMeta: true`):

```typescript
interface UserRecord extends BaseRecord {
  type: "user";
  message: {
    role: "user";
    content: string | ToolResultBlock[];
  };
  isMeta?: boolean; // true = internal tool result, false = real user message
  isCompactSummary?: boolean;
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string; // links back to tool_use block's id
  content: string | ContentPart[];
  is_error?: boolean;
}
```

## System Records

Session lifecycle events:

```typescript
interface SystemRecord extends BaseRecord {
  type: "system";
  subtype?: "init" | "compact_boundary";
  compactMetadata?: {
    trigger: "auto" | "manual";
    preTokens: number;
  };
}
```

## Waterfall Event Extraction Algorithm

1. Scan for assistant records containing `tool_use` content blocks.
2. For each `tool_use` block, create a waterfall row:
   - `id` = block's `id` field
   - `startTime` = assistant record's `timestamp`
   - `toolName` = block's `name` (e.g., "Bash", "Read", "Write", "Edit", "Task", "Agent")
   - `toolInput` = block's `input`
3. Match tool results: find subsequent user records where `isMeta: true` and content includes a `tool_result` block with matching `tool_use_id`.
   - `endTime` = user record's `timestamp`
   - `isError` = `is_error` on the tool_result
   - `output` = `content` on the tool_result
4. Identify agents: tool_use blocks where `name === "Task"` or `name === "Agent"` represent sub-agent spawns.
5. Build hierarchy: tool calls that appear between an agent's tool_use and its matching tool_result are children of that agent.

## Output Model

```typescript
interface WaterfallRow {
  id: string;
  type: "agent" | "tool";
  toolName: string;
  label: string;            // Human-readable (e.g., "Bash: npm test")
  startTime: number;        // Unix ms
  endTime: number | null;   // null = still running
  duration: number | null;
  status: "running" | "success" | "error";
  parentAgentId: string | null;
  input: Record<string, any>;
  output: string | null;
  inputTokens: number;        // from assistant record usage
  outputTokens: number;       // from assistant record usage
  contextFillPercent: number;  // input_tokens / 200000 * 100 at time of execution
  tokens?: { input: number; output: number };
  children: WaterfallRow[];
}
```

## Edge Cases to Handle

- **Malformed JSON lines**: skip with console.warn, never crash
- **Missing tool_result**: mark row as "running" (endTime = null)
- **Compaction boundaries**: reset context, don't break the timeline
- **Continuation sessions**: sessionId changes mid-file for resumed sessions — use slug to group
- **Multiple tool_use in one assistant message**: create one row per block, all share the same startTime
- **Concurrent tool calls**: multiple tools can be "in flight" simultaneously
