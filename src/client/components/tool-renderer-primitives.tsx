/**
 * Primitive UI building blocks used by tool-renderers.tsx.
 * Kept separate to stay within the 300-line per-file limit.
 */
import React from 'react';

import { FileIcon } from '../icons/file-icon.tsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extracts a string value from an unknown input field, returning '' if absent. */
export function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Returns true when a terminal output line looks like an error. */
export function isErrorLine(line: string): boolean {
  return /\b(error|FAILED|fatal|exception|traceback|abort)\b/i.test(line);
}

// ---------------------------------------------------------------------------
// Syntax highlighting — regex-based, ~40 lines, no library
// ---------------------------------------------------------------------------

export type LangFamily = 'ts' | 'py' | 'json' | 'shell' | 'generic';

/** Maps a file path extension to a language family. */
export function detectLang(filePath: string): LangFamily {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'ts';
  if (ext === 'py') return 'py';
  if (ext === 'json') return 'json';
  if (['sh', 'bash', 'zsh'].includes(ext)) return 'shell';
  return 'generic';
}

type Token = { re: RegExp; color: string };

const TOKENS: Record<LangFamily, Token[]> = {
  ts: [
    { re: /(\/\/[^\n]*)/, color: 'var(--ctp-overlay1)' },
    { re: /(\/\*[\s\S]*?\*\/)/, color: 'var(--ctp-overlay1)' },
    { re: /(`[^`]*`)/, color: 'var(--ctp-green)' },
    { re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/, color: 'var(--ctp-green)' },
    { re: /\b(\d+(?:\.\d+)?)\b/, color: 'var(--ctp-peach)' },
    { re: /\b(const|let|var|function|class|interface|type|enum|import|export|from|default|return|if|else|for|while|do|switch|case|break|continue|new|this|super|async|await|try|catch|finally|throw|extends|implements|null|undefined|true|false|typeof|instanceof|in|of|void|static|readonly|public|private|protected|abstract|declare|namespace|module|as|keyof|infer|is)\b/, color: 'var(--ctp-mauve)' },
  ],
  py: [
    { re: /(#[^\n]*)/, color: 'var(--ctp-overlay1)' },
    { re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/, color: 'var(--ctp-green)' },
    { re: /\b(\d+(?:\.\d+)?)\b/, color: 'var(--ctp-peach)' },
    { re: /\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|pass|break|continue|raise|yield|lambda|not|and|or|in|is|None|True|False|self|async|await)\b/, color: 'var(--ctp-mauve)' },
  ],
  json: [
    { re: /("(?:[^"\\]|\\.)*"\s*):/, color: 'var(--ctp-blue)' },
    { re: /("(?:[^"\\]|\\.)*")/, color: 'var(--ctp-green)' },
    { re: /\b(\d+(?:\.\d+)?)\b/, color: 'var(--ctp-peach)' },
    { re: /\b(true|false|null)\b/, color: 'var(--ctp-mauve)' },
  ],
  shell: [
    { re: /(#[^\n]*)/, color: 'var(--ctp-overlay1)' },
    { re: /("(?:[^"\\]|\\.)*"|'[^']*')/, color: 'var(--ctp-green)' },
    { re: /\b(if|then|else|fi|for|do|done|while|case|esac|function|return|export|local|source|echo|cd|ls|mkdir|rm|cp|mv|grep|awk|sed|cat)\b/, color: 'var(--ctp-mauve)' },
  ],
  generic: [],
};

/**
 * Applies regex-based token colouring to a single line of source code.
 * Single-pass: finds the earliest-starting match across all token patterns.
 */
export function highlightLine(line: string, lang: LangFamily): React.ReactNode {
  const tokens = TOKENS[lang];
  if (!tokens.length) return line;

  const parts: React.ReactNode[] = [];
  let rest = line;
  let key = 0;

  while (rest.length > 0) {
    let earliest: { index: number; match: string; color: string } | null = null;
    for (const { re, color } of tokens) {
      const m = re.exec(rest);
      if (m && (earliest === null || m.index < earliest.index)) {
        earliest = { index: m.index, match: m[0], color };
      }
    }
    if (!earliest) { parts.push(rest); break; }
    if (earliest.index > 0) parts.push(rest.slice(0, earliest.index));
    parts.push(<span key={key++} style={{ color: earliest.color }}>{earliest.match}</span>);
    rest = rest.slice(earliest.index + earliest.match.length);
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
}

// ---------------------------------------------------------------------------
// Reusable UI components
// ---------------------------------------------------------------------------

interface FilePathBadgeProps { filePath: string; extra?: string; }

/** File path header strip with icon. */
export function FilePathBadge({ filePath, extra }: FilePathBadgeProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5"
      style={{ borderBottom: '1px solid var(--ctp-surface0)', backgroundColor: 'var(--ctp-crust)' }}>
      <FileIcon size={11} color="var(--ctp-overlay1)" />
      <span className="font-mono text-xs truncate" style={{ color: 'var(--ctp-subtext0)' }} title={filePath}>
        {filePath}
      </span>
      {extra && <span className="font-mono text-xs shrink-0" style={{ color: 'var(--ctp-overlay0)' }}>{extra}</span>}
    </div>
  );
}

interface CodeViewProps { lines: string[]; lang?: LangFamily; startLine?: number; }

/** Numbered code view with optional syntax highlighting. */
export function CodeView({ lines, lang = 'generic', startLine = 1 }: CodeViewProps): React.ReactElement {
  return (
    <div className="overflow-auto" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: 36 }} /><col /></colgroup>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              <td className="select-none text-right pr-2 pl-1"
                style={{ color: 'var(--ctp-surface2)', fontSize: 10, userSelect: 'none', lineHeight: 1.5, verticalAlign: 'top' }}>
                {startLine + i}
              </td>
              <td className="pr-2" style={{ color: 'var(--ctp-text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {highlightLine(line, lang)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface DiffViewProps { oldString: string; newString: string; }

/** Inline diff view: deletions red, insertions green. */
export function DiffView({ oldString, newString }: DiffViewProps): React.ReactElement {
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');
  const maxLines = Math.max(oldLines.length, newLines.length);
  const lineNumStyle: React.CSSProperties = {
    color: 'var(--ctp-surface2)', fontSize: 10, userSelect: 'none', lineHeight: 1.5, verticalAlign: 'top',
  };

  const rows: React.ReactNode[] = [];
  for (let i = 0; i < maxLines; i++) {
    if (i < oldLines.length) {
      rows.push(
        <tr key={`del-${i}`}>
          <td className="select-none text-right pr-1.5 pl-1" style={lineNumStyle}>{i + 1}</td>
          <td className="pr-2" style={{ backgroundColor: 'rgba(243,139,168,0.15)', color: 'var(--ctp-red)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            <span style={{ opacity: 0.7 }}>− </span>{oldLines[i]}
          </td>
        </tr>,
      );
    }
    if (i < newLines.length) {
      rows.push(
        <tr key={`ins-${i}`}>
          <td className="select-none text-right pr-1.5 pl-1" style={lineNumStyle}>{i + 1}</td>
          <td className="pr-2" style={{ backgroundColor: 'rgba(166,227,161,0.12)', color: 'var(--ctp-green)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            <span style={{ opacity: 0.7 }}>+ </span>{newLines[i]}
          </td>
        </tr>,
      );
    }
  }

  return (
    <div className="overflow-auto" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: 36 }} /><col /></colgroup>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

interface TerminalBlockProps { lines: string[]; }

/** Crust-dark terminal block with error-line colouring. */
export function TerminalBlock({ lines }: TerminalBlockProps): React.ReactElement {
  return (
    <div className="overflow-auto px-3 py-2"
      style={{ backgroundColor: 'var(--ctp-crust)', fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.6 }}>
      {lines.map((line, i) => (
        <div key={i} style={{ color: isErrorLine(line) ? 'var(--ctp-red)' : 'var(--ctp-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {line}
        </div>
      ))}
    </div>
  );
}
