/**
 * Tests for the JSONL parser module.
 * Uses real fixture files from tests/fixtures/.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';

import {
  parseJsonlContent,
  parseCompactionBoundaries,
  extractSessionId,
  parseSubAgentContent,
  extractAgentIds,
} from '../../src/shared/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// Simple session (3 tool calls: Read, Edit, Bash)
// ---------------------------------------------------------------------------

describe('simple session', () => {
  const content = loadFixture('simple-session.jsonl');
  const allRows = parseJsonlContent(content);
  // Filter to tool/agent rows only — turn rows (user prompts, assistant text) are tested separately
  const rows = allRows.filter((r) => r.type === 'tool' || r.type === 'agent');

  it('extracts exactly 3 tool rows', () => {
    expect(rows).toHaveLength(3);
  });

  it('row 0 is a Read call with correct label', () => {
    const row = rows[0];
    expect(row.toolName).toBe('Read');
    expect(row.label).toBe('Read: /src/login.ts');
    expect(row.type).toBe('tool');
  });

  it('row 1 is an Edit call with correct label', () => {
    const row = rows[1];
    expect(row.toolName).toBe('Edit');
    expect(row.label).toBe('Edit: /src/login.ts');
  });

  it('row 2 is a Bash call with correct label', () => {
    const row = rows[2];
    expect(row.toolName).toBe('Bash');
    expect(row.label).toBe('Bash: npm test');
  });

  it('all tool rows have success status', () => {
    for (const row of rows) {
      expect(row.status).toBe('success');
    }
  });

  it('durations are positive numbers', () => {
    for (const row of rows) {
      expect(typeof row.duration).toBe('number');
      expect(row.duration).toBeGreaterThan(0);
    }
  });

  it('Read row duration is 1000ms (10:00:02 → 10:00:03)', () => {
    expect(rows[0].duration).toBe(1000);
  });

  it('Edit row duration is 2000ms (10:00:04 → 10:00:06)', () => {
    expect(rows[1].duration).toBe(2000);
  });

  it('Bash row duration is 5000ms (10:00:07 → 10:00:12)', () => {
    expect(rows[2].duration).toBe(5000);
  });

  it('contextFillPercent is computed from input_tokens / 200000 * 100', () => {
    // Read: 1500 / 200000 * 100 = 0.75
    expect(rows[0].contextFillPercent).toBeCloseTo(0.75);
    // Edit: 2000 / 200000 * 100 = 1.0
    expect(rows[1].contextFillPercent).toBeCloseTo(1.0);
  });

  it('inputTokens and outputTokens are populated', () => {
    expect(rows[0].inputTokens).toBe(1500);
    expect(rows[0].outputTokens).toBe(200);
    expect(rows[2].inputTokens).toBe(2500);
  });

  it('all rows have no children', () => {
    for (const row of rows) {
      expect(row.children).toHaveLength(0);
    }
  });

  it('all rows have parentAgentId null', () => {
    for (const row of rows) {
      expect(row.parentAgentId).toBeNull();
    }
  });

  it('output is populated from tool result content', () => {
    expect(rows[0].output).toBe('export function login() { ... }');
    expect(rows[2].output).toBe('All tests passed');
  });

  it('isReread is false for all rows (no duplicate reads)', () => {
    for (const row of rows) {
      expect(row.isReread).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Session with agents (Agent + Task spawns with nested tool calls)
// ---------------------------------------------------------------------------

describe('session with agents', () => {
  const content = loadFixture('session-with-agents.jsonl');
  const rows = parseJsonlContent(content);

  it('produces 2 top-level agent rows', () => {
    const agentRows = rows.filter((r) => r.type === 'agent');
    expect(agentRows).toHaveLength(2);
    // Top-level only
    expect(rows.filter((r) => r.type === 'agent')).toHaveLength(2);
  });

  it('first agent is named Agent with description in label', () => {
    const agent = rows.find((r) => r.id === 'tu-agent-1');
    expect(agent).toBeDefined();
    expect(agent!.toolName).toBe('Agent');
    expect(agent!.label).toBe('Agent (Refactor auth module)');
  });

  it('second agent is named Task with description in label', () => {
    const agent = rows.find((r) => r.id === 'tu-agent-2');
    expect(agent).toBeDefined();
    expect(agent!.toolName).toBe('Task');
    expect(agent!.label).toBe('Agent (Write auth tests)');
  });

  it('Agent row has children (sub tool calls)', () => {
    const agent = rows.find((r) => r.id === 'tu-agent-1');
    expect(agent!.children.length).toBeGreaterThan(0);
  });

  it('Task row is present as a top-level agent', () => {
    const agent = rows.find((r) => r.id === 'tu-agent-2');
    expect(agent).toBeDefined();
    expect(agent!.type).toBe('agent');
  });

  it('child Read row of agent-1 has correct label', () => {
    const agent = rows.find((r) => r.id === 'tu-agent-1')!;
    const readChild = agent.children.find((c) => c.toolName === 'Read');
    expect(readChild).toBeDefined();
    expect(readChild!.label).toBe('Read: /src/auth.ts');
  });

  it('child tool rows have parentAgentId set to their agent id', () => {
    const agent1 = rows.find((r) => r.id === 'tu-agent-1')!;
    for (const child of agent1.children) {
      expect(child.parentAgentId).toBe('tu-agent-1');
    }

    const agent2 = rows.find((r) => r.id === 'tu-agent-2')!;
    for (const child of agent2.children) {
      expect(child.parentAgentId).toBe('tu-agent-2');
    }
  });

  it('agent rows themselves have parentAgentId null', () => {
    const agentRows = rows.filter((r) => r.type === 'agent');
    for (const row of agentRows) {
      expect(row.parentAgentId).toBeNull();
    }
  });

  it('agents have success status after results arrive', () => {
    const agent1 = rows.find((r) => r.id === 'tu-agent-1');
    expect(agent1!.status).toBe('success');
  });

  it('top-level rows include the 2 agent rows', () => {
    const agentRows = rows.filter((r) => r.type === 'agent');
    expect(agentRows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Session with errors
// ---------------------------------------------------------------------------

describe('session with errors', () => {
  const content = loadFixture('session-with-errors.jsonl');
  const allRows = parseJsonlContent(content);
  const rows = allRows.filter((r) => r.type === 'tool' || r.type === 'agent' || r.type === 'api-error');

  it('extracts 4 tool/error rows', () => {
    expect(rows).toHaveLength(4);
  });

  it('first Bash call has error status', () => {
    const bash1 = rows.find((r) => r.id === 'tu-e1');
    expect(bash1).toBeDefined();
    expect(bash1!.status).toBe('error');
  });

  it('error output is populated', () => {
    const bash1 = rows.find((r) => r.id === 'tu-e1');
    expect(bash1!.output).toBe('Build failed: TypeScript error in index.ts');
  });

  it('second Bash call has success status', () => {
    const bash2 = rows.find((r) => r.id === 'tu-e4');
    expect(bash2).toBeDefined();
    expect(bash2!.status).toBe('success');
  });

  it('Read and Edit calls have success status', () => {
    const read = rows.find((r) => r.id === 'tu-e2');
    const edit = rows.find((r) => r.id === 'tu-e3');
    expect(read!.status).toBe('success');
    expect(edit!.status).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// Session with compaction
// ---------------------------------------------------------------------------

describe('session with compaction', () => {
  const content = loadFixture('session-with-compaction.jsonl');

  describe('parseJsonlContent', () => {
    const allRows = parseJsonlContent(content);
    const rows = allRows.filter((r) => r.type === 'tool' || r.type === 'agent');

    it('extracts 4 tool call rows', () => {
      expect(rows).toHaveLength(4);
    });

    it('second Read of /src/app.ts is marked as isReread', () => {
      const reads = rows.filter((r) => r.toolName === 'Read');
      expect(reads).toHaveLength(2);
      expect(reads[0].isReread).toBe(false);
      expect(reads[1].isReread).toBe(true);
    });

    it('last Bash row has error status', () => {
      const bash = rows.find((r) => r.toolName === 'Bash');
      expect(bash!.status).toBe('error');
    });

    it('first Read has high contextFillPercent (~75%)', () => {
      const reads = rows.filter((r) => r.toolName === 'Read');
      expect(reads[0].contextFillPercent).toBeCloseTo(75);
    });
  });

  describe('parseCompactionBoundaries', () => {
    it('returns 2 timestamps', () => {
      const boundaries = parseCompactionBoundaries(content);
      expect(boundaries).toHaveLength(2);
    });

    it('first boundary timestamp matches the JSONL record', () => {
      const boundaries = parseCompactionBoundaries(content);
      const expected = new Date('2026-03-30T13:00:04.000Z').getTime();
      expect(boundaries[0].timestamp).toBe(expected);
    });

    it('second boundary timestamp is after the first', () => {
      const boundaries = parseCompactionBoundaries(content);
      expect(boundaries[1].timestamp).toBeGreaterThan(boundaries[0].timestamp);
    });
  });
});

// ---------------------------------------------------------------------------
// Empty session
// ---------------------------------------------------------------------------

describe('empty session', () => {
  const content = loadFixture('empty-session.jsonl');

  it('parseJsonlContent returns empty array', () => {
    expect(parseJsonlContent(content)).toEqual([]);
  });

  it('parseCompactionBoundaries returns empty array', () => {
    expect(parseCompactionBoundaries(content)).toEqual([]);
  });

  it('extractSessionId returns null', () => {
    expect(extractSessionId(content)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Malformed session (invalid JSON lines mixed with valid ones)
// ---------------------------------------------------------------------------

describe('malformed session', () => {
  const content = loadFixture('malformed-session.jsonl');

  it('does not throw', () => {
    expect(() => parseJsonlContent(content)).not.toThrow();
  });

  it('skips invalid lines and returns rows from valid lines', () => {
    const rows = parseJsonlContent(content);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('emits console.warn for each malformed line', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseJsonlContent(content);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('extracts the Read tool call from the valid assistant record', () => {
    const rows = parseJsonlContent(content);
    const readRow = rows.find((r) => r.toolName === 'Read');
    expect(readRow).toBeDefined();
    expect(readRow!.label).toBe('Read: /src/main.ts');
  });

  it('Read row has success status because a valid result record follows', () => {
    const rows = parseJsonlContent(content);
    const readRow = rows.find((r) => r.toolName === 'Read');
    expect(readRow!.status).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// extractSessionId
// ---------------------------------------------------------------------------

describe('extractSessionId', () => {
  it('returns sessionId from a normal session', () => {
    const content = loadFixture('simple-session.jsonl');
    expect(extractSessionId(content)).toBe('sess-001');
  });

  it('returns null for empty content', () => {
    expect(extractSessionId('')).toBeNull();
  });

  it('returns null when all lines are malformed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(extractSessionId('not json\nalso not json')).toBeNull();
    warnSpy.mockRestore();
  });

  it('skips malformed lines and returns id from first valid one', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = loadFixture('malformed-session.jsonl');
    expect(extractSessionId(content)).toBe('sess-005');
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// parseSubAgentContent
// ---------------------------------------------------------------------------

describe('parseSubAgentContent', () => {
  const content = loadFixture('sub-agent.jsonl');
  const rows = parseSubAgentContent(content);

  it('returns 3 flat tool rows', () => {
    expect(rows).toHaveLength(3);
  });

  it('first row is a Read call', () => {
    expect(rows[0].toolName).toBe('Read');
    expect(rows[0].label).toBe('Read: /src/auth.ts');
    expect(rows[0].type).toBe('tool');
  });

  it('second row is a Write call', () => {
    expect(rows[1].toolName).toBe('Write');
    expect(rows[1].label).toBe('Write: /src/AuthPanel.tsx');
  });

  it('third row is a Bash call', () => {
    expect(rows[2].toolName).toBe('Bash');
    expect(rows[2].label).toBe('Bash: npx tsc --noEmit');
  });

  it('all rows have success status', () => {
    for (const row of rows) {
      expect(row.status).toBe('success');
    }
  });

  it('no rows have children (flat structure)', () => {
    for (const row of rows) {
      expect(row.children).toHaveLength(0);
    }
  });

  it('all rows have parentAgentId null', () => {
    for (const row of rows) {
      expect(row.parentAgentId).toBeNull();
    }
  });

  it('Read row has correct duration (1000ms)', () => {
    expect(rows[0].duration).toBe(1000);
  });

  it('Write row has correct duration (2000ms)', () => {
    expect(rows[1].duration).toBe(2000);
  });

  it('Bash row has correct duration (2000ms)', () => {
    expect(rows[2].duration).toBe(2000);
  });

  it('inputTokens and outputTokens are populated', () => {
    expect(rows[0].inputTokens).toBe(5000);
    expect(rows[0].outputTokens).toBe(300);
    expect(rows[1].inputTokens).toBe(6000);
  });

  it('contextFillPercent is computed relative to peak tokens', () => {
    // Peak is 7000, effective window = 200000 (since 7000 < 200000)
    // rows[0]: 5000 / 200000 * 100 = 2.5
    expect(rows[0].contextFillPercent).toBeCloseTo(2.5);
    // rows[2]: 7000 / 200000 * 100 = 3.5
    expect(rows[2].contextFillPercent).toBeCloseTo(3.5);
  });

  it('Read row is not marked as isReread', () => {
    expect(rows[0].isReread).toBe(false);
  });

  it('does not throw on empty content', () => {
    expect(() => parseSubAgentContent('')).not.toThrow();
    expect(parseSubAgentContent('')).toEqual([]);
  });

  it('does not throw on malformed lines', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => parseSubAgentContent('not json\n{"type":"garbage"}')).not.toThrow();
    warnSpy.mockRestore();
  });

  it('output is populated from tool result content', () => {
    expect(rows[0].output).toBe('export class Auth { login() {} logout() {} }');
    expect(rows[1].output).toBe('File written successfully');
    expect(rows[2].output).toBe('No errors found');
  });
});

// ---------------------------------------------------------------------------
// extractAgentIds
// ---------------------------------------------------------------------------

describe('extractAgentIds', () => {
  const content = loadFixture('session-with-agent-ids.jsonl');
  const agentMap = extractAgentIds(content);

  it('returns a Map with 2 entries', () => {
    expect(agentMap.size).toBe(2);
  });

  it('maps first Agent tool_use_id to correct agentId', () => {
    expect(agentMap.get('toolu_016BNzJbJBpWL2CKh78CCMAX')).toBe('a1ba854e30ffeb7d2');
  });

  it('maps second Task tool_use_id to correct agentId', () => {
    expect(agentMap.get('toolu_029XmKpQRs4TN8FvD61ABYZE')).toBe('b9cf763f41aaec8e1');
  });

  it('returns empty Map for content with no agent tool_use_ids', () => {
    const content = loadFixture('simple-session.jsonl');
    expect(extractAgentIds(content).size).toBe(0);
  });

  it('returns empty Map for empty content', () => {
    expect(extractAgentIds('').size).toBe(0);
  });

  it('does not throw on malformed lines', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => extractAgentIds('not json\n{"type":"garbage"}')).not.toThrow();
    warnSpy.mockRestore();
  });

  it('ignores user records without toolUseResult', () => {
    const line = JSON.stringify({
      type: 'user',
      sessionId: 'sess-x',
      timestamp: '2026-03-30T10:00:00.000Z',
      uuid: 'u-1',
      parentUuid: null,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu-x-1', content: 'done' }],
      },
      isMeta: true,
    });
    expect(extractAgentIds(line).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Running (no result) tool calls
// ---------------------------------------------------------------------------

describe('running tool calls (no result yet)', () => {
  it('row has status running and null endTime/duration', () => {
    const line = JSON.stringify({
      type: 'assistant',
      sessionId: 'sess-run',
      timestamp: '2026-03-30T10:00:00.000Z',
      uuid: 'asst-run-1',
      parentUuid: null,
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu-run-1', name: 'Bash', input: { command: 'sleep 60' } },
        ],
        usage: { input_tokens: 100, output_tokens: 10 },
      },
    });
    const rows = parseJsonlContent(line);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('running');
    expect(rows[0].endTime).toBeNull();
    expect(rows[0].duration).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Feature: isFailure — tool execution failure detection
// ---------------------------------------------------------------------------

describe('tool failure detection (isFailure)', () => {
  const content = loadFixture('session-with-failure.jsonl');
  const allRows = parseJsonlContent(content);
  const rows = allRows.filter((r) => r.type === 'tool' || r.type === 'agent');

  it('extracts 2 tool rows from the fixture', () => {
    expect(rows).toHaveLength(2);
  });

  it('Bash row with OOM kill output has isFailure=true', () => {
    const bash = rows.find((r) => r.toolName === 'Bash');
    expect(bash).toBeDefined();
    expect(bash?.isFailure).toBe(true);
    expect(bash?.status).toBe('error');
  });

  it('Read row with plain error (no crash keywords) has isFailure=false', () => {
    const read = rows.find((r) => r.toolName === 'Read');
    expect(read).toBeDefined();
    expect(read?.isFailure).toBe(false);
    expect(read?.status).toBe('error');
  });

  it('normal success rows have isFailure=false', () => {
    const content2 = loadFixture('simple-session.jsonl');
    const rows2 = parseJsonlContent(content2);
    for (const row of rows2) {
      expect(row.isFailure).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Feature: api-error rows — stop_failure system record detection
// ---------------------------------------------------------------------------

describe('API error row detection (stop_failure)', () => {
  const content = loadFixture('session-with-api-error.jsonl');
  const rows = parseJsonlContent(content);

  it('produces both a tool row and an api-error row', () => {
    const toolRows = rows.filter((r) => r.type === 'tool');
    const apiErrorRows = rows.filter((r) => r.type === 'api-error');
    expect(toolRows.length).toBeGreaterThan(0);
    expect(apiErrorRows).toHaveLength(1);
  });

  it('api-error row has correct toolName classified from error message', () => {
    const apiErr = rows.find((r) => r.type === 'api-error');
    expect(apiErr).toBeDefined();
    expect(apiErr?.toolName).toBe('Rate Limit');
  });

  it('api-error row has status=error and isFailure=false', () => {
    const apiErr = rows.find((r) => r.type === 'api-error');
    expect(apiErr?.status).toBe('error');
    expect(apiErr?.isFailure).toBe(false);
  });

  it('api-error row label contains the original error message', () => {
    const apiErr = rows.find((r) => r.type === 'api-error');
    expect(apiErr?.label).toContain('Rate limit exceeded');
  });

  it('regular sessions produce no api-error rows', () => {
    const simpleContent = loadFixture('simple-session.jsonl');
    const simpleRows = parseJsonlContent(simpleContent);
    expect(simpleRows.filter((r) => r.type === 'api-error')).toHaveLength(0);
  });
});
