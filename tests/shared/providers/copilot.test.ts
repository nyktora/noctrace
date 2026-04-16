/**
 * Unit tests for the GitHub Copilot Chat provider.
 * Covers: parseCopilotContent, tool name mapping, label extraction,
 * session metadata, timing calculation, listSessions, readSession, watch.
 */

import { readFileSync } from 'node:fs';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { parseCopilotContent, createCopilotProvider } from '../../../src/shared/providers/copilot.js';
import type { WaterfallRow } from '../../../src/shared/types.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../../fixtures/copilot');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// Temp dir setup for listSessions / readSession
// ---------------------------------------------------------------------------

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'noctrace-copilot-test-'));
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
});

/**
 * Write a fixture file into a fake workspaceStorage directory tree.
 * Returns the rawSlug (relative path from the workspaceStorage base).
 */
function writeFixture(
  content: string,
  hashName = 'abc123hash',
  fileName = 'session.json',
  workspaceFolder?: string,
): { copilotHome: string; rawSlug: string } {
  const chatDir = join(tmpHome, hashName, 'chatSessions');
  mkdirSync(chatDir, { recursive: true });
  writeFileSync(join(chatDir, fileName), content, 'utf-8');

  if (workspaceFolder) {
    const wsJson = JSON.stringify({ folder: `file://${workspaceFolder}` });
    writeFileSync(join(tmpHome, hashName, 'workspace.json'), wsJson, 'utf-8');
  }

  return { copilotHome: tmpHome, rawSlug: `${hashName}/chatSessions/${fileName}` };
}

// ---------------------------------------------------------------------------
// parseCopilotContent — tool invocations
// ---------------------------------------------------------------------------

describe('parseCopilotContent — tool invocations', () => {
  it('session with tools: produces one WaterfallRow per tool invocation', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    // Two tool invocations across two requests
    expect(rows).toHaveLength(2);
  });

  it('copilot_readFile maps to toolName "Read"', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    const readRow = rows.find(r => r.id === 'tool-call-001');
    expect(readRow).toBeDefined();
    expect(readRow?.toolName).toBe('Read');
  });

  it('run_in_terminal maps to toolName "Bash"', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    const bashRow = rows.find(r => r.id === 'tool-call-002');
    expect(bashRow).toBeDefined();
    expect(bashRow?.toolName).toBe('Bash');
  });

  it('string invocationMessage is used as label', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    const readRow = rows.find(r => r.id === 'tool-call-001');
    expect(readRow?.label).toBe('Reading login.ts...');
  });

  it('object invocationMessage extracts .value as label', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    const bashRow = rows.find(r => r.id === 'tool-call-002');
    expect(bashRow?.label).toBe('Running npm test');
  });

  it('completed tool row has status "success"', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    for (const row of rows) {
      expect(row.status).toBe('success');
    }
  });

  it('completed tool row has non-null endTime and positive duration', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    for (const row of rows) {
      expect(row.endTime).not.toBeNull();
      expect(row.duration).toBeGreaterThan(0);
    }
  });

  it('timing: endTime = startTime + totalElapsed', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    const readRow = rows.find(r => r.id === 'tool-call-001');
    // startTime = 1770777277237, totalElapsed = 2300
    expect(readRow?.startTime).toBe(1770777277237);
    expect(readRow?.endTime).toBe(1770777277237 + 2300);
    expect(readRow?.duration).toBe(2300);
  });

  it('modelId is stripped of "copilot/" prefix', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    for (const row of rows) {
      expect(row.modelName).toBe('claude-opus-4.5');
    }
  });

  it('all rows have type "tool"', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    for (const row of rows) {
      expect(row.type).toBe('tool');
    }
  });

  it('token fields are all zero (no token tracking)', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    for (const row of rows) {
      expect(row.inputTokens).toBe(0);
      expect(row.outputTokens).toBe(0);
      expect(row.tokenDelta).toBe(0);
      expect(row.contextFillPercent).toBe(0);
    }
  });

  it('input and output are empty/null (no tool arg exposure)', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    for (const row of rows) {
      expect(row.input).toEqual({});
      expect(row.output).toBeNull();
    }
  });

  it('sequence numbers are monotonically increasing', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    for (let i = 1; i < rows.length; i++) {
      expect((rows[i].sequence ?? 0) > (rows[i - 1].sequence ?? 0)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// parseCopilotContent — thinking rows
// ---------------------------------------------------------------------------

describe('parseCopilotContent — thinking rows', () => {
  it('thinking response item produces a "Thinking" toolName row', () => {
    const content = loadFixture('session-with-thinking.json');
    const rows = parseCopilotContent(content);
    const thinkingRow = rows.find(r => r.toolName === 'Thinking');
    expect(thinkingRow).toBeDefined();
  });

  it('thinking row uses thinking text as label', () => {
    const content = loadFixture('session-with-thinking.json');
    const rows = parseCopilotContent(content);
    const thinkingRow = rows.find(r => r.toolName === 'Thinking');
    expect(thinkingRow?.label).toContain('JWT');
  });

  it('thinking + tool in same request produces two rows', () => {
    const content = loadFixture('session-with-thinking.json');
    const rows = parseCopilotContent(content);
    // One thinking + one tool invocation
    expect(rows).toHaveLength(2);
  });

  it('thinking row has type "tool"', () => {
    const content = loadFixture('session-with-thinking.json');
    const rows = parseCopilotContent(content);
    const thinkingRow = rows.find(r => r.toolName === 'Thinking');
    expect(thinkingRow?.type).toBe('tool');
  });
});

// ---------------------------------------------------------------------------
// parseCopilotContent — plain chat (no tools)
// ---------------------------------------------------------------------------

describe('parseCopilotContent — plain chat', () => {
  it('request with no tools/thinking produces a "turn" type row', () => {
    const content = loadFixture('session-plain-chat.json');
    const rows = parseCopilotContent(content);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('turn');
  });

  it('turn row label is the user message text', () => {
    const content = loadFixture('session-plain-chat.json');
    const rows = parseCopilotContent(content);
    expect(rows[0].label).toContain('async/await');
  });

  it('turn row uses gpt-4.1 model (stripped prefix)', () => {
    const content = loadFixture('session-plain-chat.json');
    const rows = parseCopilotContent(content);
    expect(rows[0].modelName).toBe('gpt-4.1');
  });

  it('turn row has status "success" when totalElapsed present', () => {
    const content = loadFixture('session-plain-chat.json');
    const rows = parseCopilotContent(content);
    expect(rows[0].status).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// parseCopilotContent — incomplete / running tool
// ---------------------------------------------------------------------------

describe('parseCopilotContent — incomplete tool', () => {
  it('incomplete tool (isComplete: false) has status "running"', () => {
    const content = loadFixture('session-incomplete.json');
    const rows = parseCopilotContent(content);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('running');
  });

  it('incomplete tool has null endTime and duration', () => {
    const content = loadFixture('session-incomplete.json');
    const rows = parseCopilotContent(content);
    expect(rows[0].endTime).toBeNull();
    expect(rows[0].duration).toBeNull();
  });

  it('copilot_findTextInFiles maps to "Grep"', () => {
    const content = loadFixture('session-incomplete.json');
    const rows = parseCopilotContent(content);
    expect(rows[0].toolName).toBe('Grep');
  });
});

// ---------------------------------------------------------------------------
// parseCopilotContent — edge cases
// ---------------------------------------------------------------------------

describe('parseCopilotContent — edge cases', () => {
  it('empty string returns empty array', () => {
    // parseCopilotContent handles malformed JSON gracefully
    const rows = parseCopilotContent('');
    expect(rows).toEqual([]);
  });

  it('malformed JSON returns empty array with warning', () => {
    const rows = parseCopilotContent('{not valid json');
    expect(rows).toEqual([]);
  });

  it('empty requests array returns empty array', () => {
    const json = JSON.stringify({
      version: 3,
      sessionId: 'empty-sess',
      creationDate: 1770777277237,
      lastMessageDate: 1770777277237,
      requests: [],
    });
    const rows = parseCopilotContent(json);
    expect(rows).toEqual([]);
  });

  it('request with empty response array produces a turn row', () => {
    const json = JSON.stringify({
      version: 3,
      sessionId: 'empty-resp',
      creationDate: 1770777277237,
      lastMessageDate: 1770777277237,
      requests: [
        {
          requestId: 'req-empty',
          timestamp: 1770777277237,
          modelId: 'copilot/gpt-4.1',
          message: { text: 'Hello', parts: [] },
          response: [],
          result: { timings: { totalElapsed: 1000 } },
          agent: { name: 'GitHub Copilot' },
          modelState: { value: 1 },
        },
      ],
    });
    const rows = parseCopilotContent(json);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('turn');
  });

  it('unknown kind response items are ignored (no crash)', () => {
    const json = JSON.stringify({
      version: 3,
      sessionId: 'unk-sess',
      creationDate: 1770777277237,
      lastMessageDate: 1770777277237,
      requests: [
        {
          requestId: 'req-unk',
          timestamp: 1770777277237,
          modelId: 'copilot/gpt-4.1',
          message: { text: 'Hi', parts: [] },
          response: [
            { kind: 'progressTaskSerialized', content: { value: 'Loading...' } },
            { kind: 'mcpServersStarting' },
            { kind: 'warning', value: 'slow' },
          ],
          result: { timings: { totalElapsed: 500 } },
          agent: { name: 'GitHub Copilot' },
          modelState: { value: 1 },
        },
      ],
    });
    const rows = parseCopilotContent(json);
    // No tool/thinking → produces one turn row
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('turn');
  });

  it('missing invocationMessage falls back to tool display name', () => {
    const json = JSON.stringify({
      version: 3,
      sessionId: 'no-msg',
      creationDate: 1770777277237,
      lastMessageDate: 1770777277237,
      requests: [
        {
          requestId: 'req-no-msg',
          timestamp: 1770777277237,
          modelId: 'copilot/claude-opus-4.5',
          message: { text: 'Search', parts: [] },
          response: [
            {
              kind: 'toolInvocationSerialized',
              toolId: 'copilot_searchCodebase',
              toolCallId: 'tc-no-msg',
              isComplete: true,
            },
          ],
          result: { timings: { totalElapsed: 1000 } },
          agent: { name: 'GitHub Copilot' },
          modelState: { value: 1 },
        },
      ],
    });
    const rows = parseCopilotContent(json);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Grep'); // fallback to display name
  });

  it('label longer than 80 chars is truncated with ellipsis', () => {
    const longMsg = 'A'.repeat(100);
    const json = JSON.stringify({
      version: 3,
      sessionId: 'long-label',
      creationDate: 1770777277237,
      lastMessageDate: 1770777277237,
      requests: [
        {
          requestId: 'req-long',
          timestamp: 1770777277237,
          modelId: 'copilot/gpt-4.1',
          message: { text: longMsg, parts: [] },
          response: [],
          result: { timings: { totalElapsed: 1000 } },
          agent: { name: 'GitHub Copilot' },
          modelState: { value: 1 },
        },
      ],
    });
    const rows = parseCopilotContent(json);
    expect(rows[0].label.length).toBeLessThanOrEqual(83); // 77 + '...'
    expect(rows[0].label.endsWith('...')).toBe(true);
  });

  it('all required WaterfallRow fields are present', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    const row = rows[0];
    const requiredFields: Array<keyof WaterfallRow> = [
      'id', 'type', 'toolName', 'label', 'startTime', 'endTime', 'duration',
      'status', 'parentAgentId', 'input', 'output', 'inputTokens', 'outputTokens',
      'contextFillPercent', 'isReread', 'isFailure', 'children', 'tips',
      'modelName', 'estimatedCost', 'agentType', 'agentColor', 'sequence',
      'isFastMode', 'parentToolUseId',
    ];
    for (const field of requiredFields) {
      expect(row).toHaveProperty(field);
    }
  });

  it('default fields have correct values', () => {
    const content = loadFixture('session-with-tools.json');
    const rows = parseCopilotContent(content);
    const row = rows[0];
    expect(row.parentAgentId).toBeNull();
    expect(row.isReread).toBe(false);
    expect(row.isFailure).toBe(false);
    expect(Array.isArray(row.children)).toBe(true);
    expect(Array.isArray(row.tips)).toBe(true);
    expect(row.estimatedCost).toBeNull();
    expect(row.agentType).toBeNull();
    expect(row.agentColor).toBeNull();
    expect(row.isFastMode).toBe(false);
    expect(row.parentToolUseId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tool name mapping — exhaustive
// ---------------------------------------------------------------------------

describe('tool name mapping', () => {
  const mappingCases: Array<[string, string]> = [
    ['copilot_readFile', 'Read'],
    ['copilot_createFile', 'Write'],
    ['copilot_replaceString', 'Edit'],
    ['copilot_multiReplaceString', 'Edit'],
    ['copilot_insertEdit', 'Edit'],
    ['copilot_findFiles', 'Glob'],
    ['copilot_findTextInFiles', 'Grep'],
    ['copilot_listDirectory', 'LS'],
    ['copilot_runInTerminal', 'Bash'],
    ['run_in_terminal', 'Bash'],
    ['copilot_fetchWebPage', 'WebFetch'],
    ['vscode_fetchWebPage_internal', 'WebFetch'],
    ['copilot_getChangedFiles', 'Git'],
    ['copilot_getErrors', 'Diagnostics'],
    ['copilot_getTerminalOutput', 'Bash'],
    ['copilot_searchCodebase', 'Grep'],
    ['vscode_editFile_internal', 'Edit'],
    ['runSubagent', 'Agent'],
  ];

  for (const [toolId, expected] of mappingCases) {
    it(`${toolId} → "${expected}"`, () => {
      const json = JSON.stringify({
        version: 3,
        sessionId: 'map-test',
        creationDate: 1770777277237,
        lastMessageDate: 1770777277237,
        requests: [
          {
            requestId: 'req-map',
            timestamp: 1770777277237,
            modelId: 'copilot/gpt-4.1',
            message: { text: 'test', parts: [] },
            response: [
              {
                kind: 'toolInvocationSerialized',
                toolId,
                toolCallId: `tc-${toolId}`,
                invocationMessage: 'doing it',
                isComplete: true,
              },
            ],
            result: { timings: { totalElapsed: 500 } },
            agent: { name: 'GitHub Copilot' },
            modelState: { value: 1 },
          },
        ],
      });
      const rows = parseCopilotContent(json);
      expect(rows[0].toolName).toBe(expected);
    });
  }

  it('unknown toolId falls back to the raw toolId as toolName', () => {
    const json = JSON.stringify({
      version: 3,
      sessionId: 'unknown-tool',
      creationDate: 1770777277237,
      lastMessageDate: 1770777277237,
      requests: [
        {
          requestId: 'req-unk-tool',
          timestamp: 1770777277237,
          modelId: 'copilot/gpt-4.1',
          message: { text: 'test', parts: [] },
          response: [
            {
              kind: 'toolInvocationSerialized',
              toolId: 'some_future_tool',
              toolCallId: 'tc-future',
              invocationMessage: 'running',
              isComplete: true,
            },
          ],
          result: { timings: { totalElapsed: 500 } },
          agent: { name: 'GitHub Copilot' },
          modelState: { value: 1 },
        },
      ],
    });
    const rows = parseCopilotContent(json);
    expect(rows[0].toolName).toBe('some_future_tool');
  });
});

// ---------------------------------------------------------------------------
// listSessions
// ---------------------------------------------------------------------------

describe('listSessions', () => {
  it('returns empty array when base dir does not exist', async () => {
    const provider = createCopilotProvider(join(tmpHome, 'nonexistent'));
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(results).toEqual([]);
  });

  it('returns session within time window', async () => {
    const content = loadFixture('session-with-tools.json');
    const { copilotHome } = writeFixture(content, 'hash1', 'session.json', '/Users/lam/dev/myapp');
    const provider = createCopilotProvider(copilotHome);
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe('copilot');
    expect(results[0].sessionId).toBe('copilot-session-abc123');
  });

  it('filters out sessions outside time window', async () => {
    const content = loadFixture('session-with-tools.json');
    const { copilotHome } = writeFixture(content);
    const provider = createCopilotProvider(copilotHome);
    const results = await provider.listSessions({ startMs: Date.now() + 1e9, endMs: Date.now() + 2e9 });
    expect(results).toHaveLength(0);
  });

  it('rawSlug is relative path from base dir', async () => {
    const content = loadFixture('session-with-tools.json');
    const { copilotHome, rawSlug } = writeFixture(content, 'hash2', 'session.json');
    const provider = createCopilotProvider(copilotHome);
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(results[0].rawSlug).toBe(rawSlug);
  });

  it('projectContext extracted from workspace.json folder field', async () => {
    const content = loadFixture('session-with-tools.json');
    const { copilotHome } = writeFixture(content, 'hash3', 'session.json', '/Users/lam/dev/flutter');
    const provider = createCopilotProvider(copilotHome);
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    // /Users/lam/dev/flutter → ~/dev/flutter (home prefix stripped)
    expect(results[0].projectContext).toContain('flutter');
  });

  it('projectContext is "unknown" when workspace.json is missing', async () => {
    const content = loadFixture('session-with-tools.json');
    // writeFixture with no workspaceFolder → no workspace.json
    const { copilotHome } = writeFixture(content, 'hash4', 'session.json');
    const provider = createCopilotProvider(copilotHome);
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(results[0].projectContext).toBe('unknown');
  });

  it('ignores non-json files in chatSessions directory', async () => {
    const chatDir = join(tmpHome, 'hash5', 'chatSessions');
    mkdirSync(chatDir, { recursive: true });
    writeFileSync(join(chatDir, 'README.txt'), 'not a session', 'utf-8');
    writeFileSync(join(chatDir, 'session.json'), loadFixture('session-with-tools.json'), 'utf-8');
    const provider = createCopilotProvider(tmpHome);
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(results).toHaveLength(1);
  });

  it('modelHint extracted from first request modelId', async () => {
    const content = loadFixture('session-with-tools.json');
    const { copilotHome } = writeFixture(content, 'hash6', 'session.json');
    const provider = createCopilotProvider(copilotHome);
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect((results[0] as Record<string, unknown>)['modelHint']).toBe('claude-opus-4.5');
  });

  it('startMs comes from creationDate field in session JSON', async () => {
    const content = loadFixture('session-with-tools.json');
    const { copilotHome } = writeFixture(content, 'hash7', 'session.json');
    const provider = createCopilotProvider(copilotHome);
    const results = await provider.listSessions({ startMs: 0, endMs: Date.now() + 1e9 });
    expect(results[0].startMs).toBe(1770777277237);
  });
});

// ---------------------------------------------------------------------------
// readSession
// ---------------------------------------------------------------------------

describe('readSession', () => {
  it('returns AgentSession with correct meta and native rows', async () => {
    const content = loadFixture('session-with-tools.json');
    const { copilotHome, rawSlug } = writeFixture(content, 'hash-r1', 'session.json');
    const provider = createCopilotProvider(copilotHome);
    const session = await provider.readSession(rawSlug);

    expect(session.meta.provider).toBe('copilot');
    expect(session.meta.sessionId).toBe('copilot-session-abc123');
    expect(session.meta.rawSlug).toBe(rawSlug);
    expect(Array.isArray(session.native)).toBe(true);
    expect((session.native as WaterfallRow[]).length).toBe(2);
  });

  it('throws for unknown session id', async () => {
    const provider = createCopilotProvider(tmpHome);
    await expect(provider.readSession('nonexistent/chatSessions/missing.json')).rejects.toThrow();
  });

  it('native rows have correct tool names', async () => {
    const content = loadFixture('session-with-tools.json');
    const { copilotHome, rawSlug } = writeFixture(content, 'hash-r2', 'session.json');
    const provider = createCopilotProvider(copilotHome);
    const session = await provider.readSession(rawSlug);
    const rows = session.native as WaterfallRow[];
    expect(rows[0].toolName).toBe('Read');
    expect(rows[1].toolName).toBe('Bash');
  });

  it('meta.endMs matches file mtime', async () => {
    const content = loadFixture('session-with-tools.json');
    const { copilotHome, rawSlug } = writeFixture(content, 'hash-r3', 'session.json');
    const provider = createCopilotProvider(copilotHome);
    const before = Date.now();
    const session = await provider.readSession(rawSlug);
    const after = Date.now();
    expect(session.meta.endMs).not.toBeNull();
    expect(session.meta.endMs!).toBeGreaterThanOrEqual(before - 5000);
    expect(session.meta.endMs!).toBeLessThanOrEqual(after + 5000);
  });

  it('meta.projectContext uses workspace.json when present', async () => {
    const content = loadFixture('session-with-tools.json');
    const { copilotHome, rawSlug } = writeFixture(content, 'hash-r4', 'session.json', '/tmp/myproject');
    const provider = createCopilotProvider(copilotHome);
    const session = await provider.readSession(rawSlug);
    expect(session.meta.projectContext).toBe('/tmp/myproject');
  });

  it('plain chat session: native contains turn-type rows', async () => {
    const content = loadFixture('session-plain-chat.json');
    const { copilotHome, rawSlug } = writeFixture(content, 'hash-r5', 'chat.json');
    const provider = createCopilotProvider(copilotHome);
    const session = await provider.readSession(rawSlug);
    const rows = session.native as WaterfallRow[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].type).toBe('turn');
  });
});

// ---------------------------------------------------------------------------
// watch
// ---------------------------------------------------------------------------

describe('watch', () => {
  it('returns an unsubscribe function', () => {
    const provider = createCopilotProvider(tmpHome);
    const unsub = provider.watch(() => { /* noop */ });
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Registry integration
// ---------------------------------------------------------------------------

describe('registry', () => {
  it('getProvider("copilot") returns the registered provider', async () => {
    const { getProvider } = await import('../../../src/shared/providers/index.js');
    const p = getProvider('copilot');
    expect(p).toBeDefined();
    expect(p?.id).toBe('copilot');
    expect(p?.displayName).toBe('GitHub Copilot');
  });

  it('copilot provider capabilities match expected shape', async () => {
    const { getProvider } = await import('../../../src/shared/providers/index.js');
    const p = getProvider('copilot');
    expect(p?.capabilities).toEqual({
      toolCallGranularity: 'summary',
      contextTracking: false,
      subAgents: false,
      realtime: true,
      tokenAccounting: 'none',
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-provider parity
// ---------------------------------------------------------------------------

describe('cross-provider parity', () => {
  it('Copilot and Claude Code sessions produce compatible WaterfallRow shapes', () => {
    const content = loadFixture('session-with-tools.json');
    const copilotRows = parseCopilotContent(content);

    const requiredFields: Array<keyof WaterfallRow> = [
      'id', 'type', 'toolName', 'label', 'startTime', 'endTime', 'duration',
      'status', 'parentAgentId', 'input', 'output', 'inputTokens', 'outputTokens',
      'contextFillPercent', 'isReread', 'isFailure', 'children', 'tips',
    ];

    expect(copilotRows.length).toBeGreaterThan(0);
    for (const row of copilotRows) {
      for (const field of requiredFields) {
        expect(row).toHaveProperty(field);
      }
    }

    // Tool rows have consistent types
    for (const row of copilotRows) {
      expect(['tool', 'turn', 'agent', 'api-error', 'hook']).toContain(row.type);
      expect(['running', 'success', 'error']).toContain(row.status);
    }
  });
});
