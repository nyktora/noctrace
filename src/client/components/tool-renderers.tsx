/**
 * Tool-specific detail panel renderers.
 * Returns a React node for (row, side) pairs where a custom view adds value.
 * Returns null to signal the detail panel should fall back to plain text.
 */
import React from 'react';

import type { WaterfallRow } from '../../shared/types.ts';
import { SearchIcon } from '../icons/search-icon.tsx';
import { FileIcon } from '../icons/file-icon.tsx';
import {
  str,
  detectLang,
  FilePathBadge,
  CodeView,
  DiffView,
  TerminalBlock,
} from './tool-renderer-primitives.tsx';

// ---------------------------------------------------------------------------
// Edit / MultiEdit
// ---------------------------------------------------------------------------

function EditInput({ input }: { input: Record<string, unknown> }): React.ReactElement {
  const filePath = str(input['file_path']);
  const oldString = str(input['old_string']);
  const newString = str(input['new_string']);
  return (
    <>
      <FilePathBadge filePath={filePath || '(no path)'} />
      {oldString || newString
        ? <DiffView oldString={oldString} newString={newString} />
        : <div className="px-2 py-2 font-mono text-xs" style={{ color: 'var(--ctp-subtext0)' }}>(no diff)</div>}
    </>
  );
}

function MultiEditInput({ input }: { input: Record<string, unknown> }): React.ReactElement {
  const filePath = str(input['file_path']);
  const edits = Array.isArray(input['edits']) ? input['edits'] : [];
  return (
    <>
      <FilePathBadge filePath={filePath || '(no path)'} extra={`${edits.length} edit${edits.length !== 1 ? 's' : ''}`} />
      {edits.length === 0
        ? <div className="px-2 py-2 font-mono text-xs" style={{ color: 'var(--ctp-subtext0)' }}>(no edits)</div>
        : edits.map((edit, idx) => {
            const e = edit as Record<string, unknown>;
            return (
              <div key={idx}>
                {idx > 0 && <div style={{ height: 1, backgroundColor: 'var(--ctp-surface0)', margin: '4px 0' }} />}
                <DiffView oldString={str(e['old_string'])} newString={str(e['new_string'])} />
              </div>
            );
          })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function WriteInput({ input }: { input: Record<string, unknown> }): React.ReactElement {
  const filePath = str(input['file_path']);
  const content = str(input['content']);
  const lang = detectLang(filePath);
  const lines = content.split('\n');
  return (
    <>
      <FilePathBadge filePath={filePath || '(no path)'} extra={`${lines.length} lines`} />
      <CodeView lines={lines} lang={lang} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function ReadInput({ input }: { input: Record<string, unknown> }): React.ReactElement {
  const filePath = str(input['file_path']);
  const offset = input['offset'];
  const limit = input['limit'];
  const extra = [
    offset != null ? `offset:${String(offset)}` : null,
    limit != null ? `limit:${String(limit)}` : null,
  ].filter(Boolean).join(' ');
  return <FilePathBadge filePath={filePath || '(no path)'} extra={extra || undefined} />;
}

function ReadOutput({ output, filePath }: { output: string; filePath: string }): React.ReactElement {
  const lang = detectLang(filePath);
  // Output is `cat -n` format: "     1\tline content"
  const raw = output.split('\n');
  const parsed: { num: number; text: string }[] = [];
  for (const line of raw) {
    const m = /^\s*(\d+)\t(.*)$/.exec(line);
    if (m) parsed.push({ num: parseInt(m[1], 10), text: m[2] });
    else parsed.push({ num: parsed.length + 1, text: line });
  }
  return <CodeView lines={parsed.map((p) => p.text)} lang={lang} startLine={parsed[0]?.num ?? 1} />;
}

// ---------------------------------------------------------------------------
// Bash
// ---------------------------------------------------------------------------

function BashInput({ input }: { input: Record<string, unknown> }): React.ReactElement {
  const command = str(input['command']);
  return (
    <div className="overflow-auto px-3 py-2"
      style={{ backgroundColor: 'var(--ctp-crust)', fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.6 }}>
      <span style={{ color: 'var(--ctp-green)', marginRight: 6, userSelect: 'none' }}>$</span>
      <span style={{ color: 'var(--ctp-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{command}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glob / Grep
// ---------------------------------------------------------------------------

function GlobGrepInput({ toolName, input }: { toolName: string; input: Record<string, unknown> }): React.ReactElement {
  const pattern = str(input['pattern'] ?? input['query'] ?? '');
  const path = str(input['path'] ?? '');
  const glob = str(input['glob'] ?? '');
  return (
    <div className="px-2 py-2" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
      <div className="flex items-center gap-1.5 mb-1">
        <SearchIcon size={11} color="var(--ctp-overlay1)" />
        <span style={{ color: 'var(--ctp-subtext0)', fontSize: 10 }}>{toolName}</span>
      </div>
      {pattern && <div><span style={{ color: 'var(--ctp-overlay0)', fontSize: 10 }}>pattern: </span><span style={{ color: 'var(--ctp-yellow)' }}>{pattern}</span></div>}
      {path && <div><span style={{ color: 'var(--ctp-overlay0)', fontSize: 10 }}>path: </span><span style={{ color: 'var(--ctp-subtext0)' }}>{path}</span></div>}
      {glob && <div><span style={{ color: 'var(--ctp-overlay0)', fontSize: 10 }}>glob: </span><span style={{ color: 'var(--ctp-subtext0)' }}>{glob}</span></div>}
    </div>
  );
}

function GlobGrepOutput({ output }: { output: string }): React.ReactElement {
  const lines = output.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return <div className="px-2 py-2 font-mono text-xs" style={{ color: 'var(--ctp-overlay0)' }}>(no results)</div>;
  }
  return (
    <div className="overflow-auto" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
      {lines.map((line, i) => {
        const isPath = /^[^\s].*[/\\]/.test(line) || /^[^\s].*\.\w{1,6}$/.test(line);
        return (
          <div key={i} className="flex items-start gap-1.5 px-2 py-0.5"
            style={{ color: isPath ? 'var(--ctp-blue)' : 'var(--ctp-text)' }}>
            {isPath && <FileIcon size={10} color="var(--ctp-overlay1)" />}
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>{line}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a specialised React node for a given tool row and panel side, or
 * `null` when no custom renderer exists (detail panel falls back to plain text).
 */
export function renderToolContent(
  row: WaterfallRow,
  side: 'input' | 'output',
): React.ReactNode | null {
  const { toolName, input, output } = row;

  if (toolName === 'Edit') {
    return side === 'input' ? <EditInput input={input} /> : null;
  }
  if (toolName === 'MultiEdit') {
    return side === 'input' ? <MultiEditInput input={input} /> : null;
  }
  if (toolName === 'Write') {
    return side === 'input' ? <WriteInput input={input} /> : null;
  }
  if (toolName === 'Read') {
    if (side === 'input') return <ReadInput input={input} />;
    if (side === 'output' && output) return <ReadOutput output={output} filePath={str(input['file_path'])} />;
    return null;
  }
  if (toolName === 'Bash') {
    if (side === 'input') return <BashInput input={input} />;
    if (side === 'output' && output) return <TerminalBlock lines={output.split('\n')} />;
    return null;
  }
  if (toolName === 'Glob' || toolName === 'Grep') {
    if (side === 'input') return <GlobGrepInput toolName={toolName} input={input} />;
    if (side === 'output' && output) return <GlobGrepOutput output={output} />;
    return null;
  }

  return null;
}
