---
name: context-health
description: Context Health scoring algorithm for detecting session quality degradation. Use when implementing or modifying the health grade computation, health bar visualization, compaction boundary rendering, or the breakdown panel.
---

# Context Health Scoring Specification

## Purpose

Compute a real-time A-F grade representing the health of a Claude Code session's context window. This warns developers when quality is degrading before they notice it in the output.

## Input Data

All data comes from parsed JSONL records. The health scorer receives an array of parsed records (not raw lines) and computes the grade incrementally — it can be called after each new record to update the score.

```typescript
interface HealthInput {
  assistantRecords: {
    timestamp: number;
    inputTokens: number;
    outputTokens: number;
  }[];
  compactionEvents: {
    timestamp: number;
    preTokens: number;
    trigger: "auto" | "manual";
  }[];
  toolCalls: {
    timestamp: number;
    toolName: string;
    filePath?: string; // for Read calls
    isError: boolean;
  }[];
  sessionStartTime: number;
  sessionEndTime: number | null; // null = still running
}
```

## Signal Computations

### 1. Context Fill (weight: 40%)

```typescript
function computeFillScore(input: HealthInput): number {
  const maxWindow = 200_000;
  // Use the most recent assistant record's input_tokens
  const latest = input.assistantRecords.at(-1);
  if (!latest) return 100; // no data = healthy
  const fillPct = latest.inputTokens / maxWindow;

  if (fillPct < 0.50) return 100;  // A
  if (fillPct < 0.65) return 80;   // B
  if (fillPct < 0.80) return 60;   // C
  if (fillPct < 0.90) return 40;   // D
  return 20;                        // F
}
```

### 2. Compaction Count (weight: 25%)

```typescript
function computeCompactionScore(input: HealthInput): number {
  const count = input.compactionEvents.length;
  if (count === 0) return 100;  // A
  if (count === 1) return 75;   // B
  if (count === 2) return 55;   // C
  if (count === 3) return 35;   // D
  return 15;                     // F
}
```

### 3. Re-read Ratio (weight: 15%)

Track file paths from Read tool calls. A "re-read" is any Read call targeting a file path that was already read earlier in the session.

```typescript
function computeRereadScore(input: HealthInput): number {
  const reads = input.toolCalls.filter(t => t.toolName === "Read" && t.filePath);
  if (reads.length === 0) return 100;

  const seen = new Set<string>();
  let rereads = 0;
  for (const read of reads) {
    if (seen.has(read.filePath!)) rereads++;
    else seen.add(read.filePath!);
  }
  const ratio = rereads / reads.length;

  if (ratio <= 0.05) return 100;  // A
  if (ratio <= 0.10) return 80;   // B
  if (ratio <= 0.20) return 60;   // C
  if (ratio <= 0.35) return 40;   // D
  return 20;                       // F
}
```

### 4. Error Acceleration (weight: 10%)

Compare error rate in the first half of the session to the second half. If errors are concentrated in the second half, the session is degrading.

```typescript
function computeErrorAccelerationScore(input: HealthInput): number {
  const calls = input.toolCalls;
  if (calls.length < 4) return 100; // too few calls to judge

  const mid = Math.floor(calls.length / 2);
  const firstHalf = calls.slice(0, mid);
  const secondHalf = calls.slice(mid);

  const firstErrors = firstHalf.filter(c => c.isError).length / firstHalf.length;
  const secondErrors = secondHalf.filter(c => c.isError).length / secondHalf.length;

  if (firstErrors === 0 && secondErrors === 0) return 100;
  if (firstErrors === 0 && secondErrors > 0) return 40; // went from clean to errors
  const ratio = secondErrors / firstErrors;

  if (ratio <= 1.0) return 100;  // A — no increase
  if (ratio <= 2.0) return 75;   // B
  if (ratio <= 3.0) return 55;   // C
  if (ratio <= 5.0) return 35;   // D
  return 15;                      // F
}
```

### 5. Tool Efficiency (weight: 10%)

Ratio of "productive" tool calls (Write, Edit, MultiEdit) to total tool calls, comparing first half to second half. A declining ratio means Claude is spinning (reading without producing).

```typescript
function computeToolEfficiencyScore(input: HealthInput): number {
  const calls = input.toolCalls;
  if (calls.length < 4) return 100;

  const isProductive = (name: string) => ["Write", "Edit", "MultiEdit"].includes(name);
  const mid = Math.floor(calls.length / 2);
  const firstHalf = calls.slice(0, mid);
  const secondHalf = calls.slice(mid);

  const firstRatio = firstHalf.filter(c => isProductive(c.toolName)).length / firstHalf.length;
  const secondRatio = secondHalf.filter(c => isProductive(c.toolName)).length / secondHalf.length;

  if (firstRatio === 0) return 80; // no writes at all — could be research phase
  const change = secondRatio / firstRatio;

  if (change >= 0.9) return 100;   // A — stable or growing
  if (change >= 0.7) return 75;    // B
  if (change >= 0.4) return 55;    // C
  if (change >= 0.15) return 35;   // D
  return 15;                        // F
}
```

## Composite Grade

```typescript
function computeHealthGrade(input: HealthInput): ContextHealth {
  const signals = [
    { name: "Context Fill", value: computeFillScore(input), weight: 0.40 },
    { name: "Compactions", value: computeCompactionScore(input), weight: 0.25 },
    { name: "Re-reads", value: computeRereadScore(input), weight: 0.15 },
    { name: "Error Rate", value: computeErrorAccelerationScore(input), weight: 0.10 },
    { name: "Tool Efficiency", value: computeToolEfficiencyScore(input), weight: 0.10 },
  ];

  const composite = signals.reduce((sum, s) => sum + s.value * s.weight, 0);

  const toGrade = (score: number) =>
    score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";

  return {
    grade: toGrade(composite),
    score: Math.round(composite),
    fillPercent: /* latest input_tokens / 200000 * 100 */,
    compactionCount: input.compactionEvents.length,
    rereadRatio: /* computed above */,
    errorAcceleration: /* computed above */,
    toolEfficiency: /* computed above */,
    signals: signals.map(s => ({ ...s, grade: toGrade(s.value) })),
  };
}
```

## Update Frequency

- Recompute after every new assistant record (contains token usage)
- Recompute after every tool_result (updates error rate and re-read ratio)
- Recompute after every compact_boundary (updates compaction count)
- Push updated grade via WebSocket alongside row events

## WebSocket Message

```typescript
{ type: "health:update", health: ContextHealth }
```

## Visual Components

### Grade Badge (toolbar)
- 24x24 circle with letter inside, colored by grade
- Tooltip on hover: "Context Health: B (score: 74/100)"
- Click toggles the breakdown panel

### Health Bar (above waterfall time axis)
- 4px tall, full width of waterfall column
- Gradient: compute health score at each 5% time interval, interpolate colors
- Segments: green (#a6e3a1) → teal (#94e2d5) → yellow (#f9e2af) → peach (#fab387) → red (#f38ba8)

### Compaction Boundary Lines
- Vertical dashed line (2px, #f38ba8 at 40% opacity) at each compaction timestamp
- Small label above: "compaction" in 9px monospace
- Spans the full height of the waterfall, behind all bars

### Re-read Indicator
- Small SVG (10x10) overlaid on Read bars that are re-reads
- Icon: circular arrow (↻) in warning yellow
- Tooltip: "Re-read: file was already read at [time]"

### Breakdown Panel
- Slides down below the toolbar when grade badge is clicked
- One row per signal: name | horizontal bar (filled to sub-score) | letter grade | weight
- Bar colors match the grade color
- Close with Escape or clicking the badge again
