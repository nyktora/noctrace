import React, { useEffect, useMemo } from 'react';

import type { InstructionFile } from '../../shared/types.ts';
import { useSessionStore } from '../store/session-store.ts';
import { CloseIcon } from '../icons/close-icon.tsx';
import { formatTokens } from '../utils/tool-colors.ts';

/** Props for ContextStartup */
export interface ContextStartupProps {
  onClose: () => void;
}

/**
 * Derive a human-friendly load reason label.
 */
function formatLoadReason(reason: string): string {
  const map: Record<string, string> = {
    session_start: 'session start',
    nested_traversal: 'nested traversal',
    path_glob_match: 'glob match',
    include: 'include',
    compact: 'compact',
    instructions_loaded: 'loaded',
    claude_md_loaded: 'loaded',
  };
  return map[reason] ?? reason.replace(/_/g, ' ');
}

/**
 * Estimate token count for a file by its path when none is available from the JSONL.
 * Uses known sizes for common files, otherwise returns null.
 */
function estimateTokensByPath(filePath: string): number | null {
  const base = filePath.split('/').pop() ?? '';
  if (base === 'MEMORY.md') return 680;
  if (base.includes('system') || filePath.includes('system_prompt')) return 4200;
  // No size-based estimate without reading the file — return null
  return null;
}

/** A single instruction file row */
function FileRow({ file, isChild }: { file: InstructionFile; isChild: boolean }): React.ReactElement {
  const tokens = file.estimatedTokens ?? estimateTokensByPath(file.filePath);
  const shortPath = file.filePath.replace(/^\/Users\/[^/]+/, '~');

  return (
    <div
      className="flex items-start gap-2 px-3 py-1.5 text-xs"
      style={{
        paddingLeft: isChild ? 32 : 12,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      {isChild && (
        <span style={{ color: 'var(--ctp-surface2)', marginRight: 2 }}>└</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* File path */}
        <div
          style={{
            color: 'var(--ctp-text)',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 10,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={file.filePath}
        >
          {shortPath}
        </div>
        {/* Load reason */}
        <div style={{ color: 'var(--ctp-overlay0)', fontSize: 10, marginTop: 1 }}>
          {formatLoadReason(file.loadReason)}
        </div>
      </div>
      {/* Token count */}
      {tokens !== null && (
        <span
          style={{
            color: 'var(--ctp-subtext0)',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 10,
            flexShrink: 0,
          }}
          title={`~${tokens} tokens`}
        >
          ~{formatTokens(tokens)}
        </span>
      )}
    </div>
  );
}

/** Renders a labeled list of items in the config section */
function ConfigList({ label, items }: { label: string; items: string[] }): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <div className="px-3 py-1.5">
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-1"
        style={{ color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 9 }}
      >
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            style={{
              display: 'inline-block',
              fontSize: 10,
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--ctp-text)',
              backgroundColor: 'var(--ctp-surface0)',
              borderRadius: 3,
              padding: '1px 5px',
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Flyout panel showing instruction files (CLAUDE.md etc.) loaded at session start.
 * Groups child files under their parents in a tree structure.
 */
export function ContextStartup({ onClose }: ContextStartupProps): React.ReactElement {
  const instructionsLoaded = useSessionStore((s) => s.instructionsLoaded);
  const initContext = useSessionStore((s) => s.initContext);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const { topLevel, childMap, totalEstimatedTokens } = useMemo(() => {
    const childMap = new Map<string, InstructionFile[]>();
    const topLevel: InstructionFile[] = [];
    let total = 0;

    for (const file of instructionsLoaded) {
      const tokens = file.estimatedTokens ?? estimateTokensByPath(file.filePath);
      if (tokens !== null) total += tokens;

      if (file.parentFilePath) {
        const siblings = childMap.get(file.parentFilePath) ?? [];
        siblings.push(file);
        childMap.set(file.parentFilePath, siblings);
      } else {
        topLevel.push(file);
      }
    }

    return { topLevel, childMap, totalEstimatedTokens: total };
  }, [instructionsLoaded]);

  return (
    <div
      className="absolute right-0 top-8 z-50 rounded overflow-hidden shadow-xl"
      style={{
        backgroundColor: 'var(--ctp-mantle)',
        border: '1px solid var(--ctp-surface0)',
        width: 320,
        maxHeight: 420,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--ctp-surface0)' }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          Context Startup
        </span>
        <button type="button" onClick={onClose} style={{ color: 'var(--ctp-overlay0)' }}>
          <CloseIcon size={14} />
        </button>
      </div>

      {/* Files list */}
      {instructionsLoaded.length === 0 ? (
        <div
          className="px-3 py-4 text-xs text-center"
          style={{ color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          No instruction files detected in this session
        </div>
      ) : (
        <div className="py-1">
          {topLevel.map((file) => (
            <React.Fragment key={file.filePath}>
              <FileRow file={file} isChild={false} />
              {(childMap.get(file.filePath) ?? []).map((child) => (
                <FileRow key={child.filePath} file={child} isChild={true} />
              ))}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Session Configuration */}
      {initContext && (initContext.agents.length > 0 || initContext.skills.length > 0 || initContext.plugins.length > 0 || initContext.effort !== null) && (
        <div style={{ borderTop: '1px solid var(--ctp-surface0)' }}>
          <div
            className="px-3 py-2"
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--ctp-overlay0)' }}
            >
              Session Config
            </span>
          </div>
          {initContext.effort !== null && (
            <div className="px-3 py-1.5">
              <div
                className="text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 9 }}
              >
                Effort
              </div>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 10,
                  fontFamily: 'ui-monospace, monospace',
                  borderRadius: 3,
                  padding: '1px 5px',
                  color: initContext.effort === 'low' ? 'var(--ctp-base)' :
                    initContext.effort === 'high' ? 'var(--ctp-base)' :
                    initContext.effort === 'xhigh' ? 'var(--ctp-base)' :
                    initContext.effort === 'max' ? 'var(--ctp-base)' : 'var(--ctp-text)',
                  backgroundColor: initContext.effort === 'low' ? 'var(--ctp-green)' :
                    initContext.effort === 'high' ? 'var(--ctp-yellow)' :
                    initContext.effort === 'xhigh' ? 'var(--ctp-peach)' :
                    initContext.effort === 'max' ? 'var(--ctp-red)' : 'var(--ctp-surface0)',
                }}
              >
                {initContext.effort}
              </span>
            </div>
          )}
          <ConfigList label="Agents" items={initContext.agents} />
          <ConfigList label="Skills" items={initContext.skills} />
          {initContext.plugins.length > 0 && (
            <ConfigList label="Plugins" items={initContext.plugins.map((p) => p.name)} />
          )}
        </div>
      )}

      {/* Footer: total startup tokens */}
      {instructionsLoaded.length > 0 && (
        <div
          className="px-3 py-2 text-xs flex justify-between"
          style={{
            borderTop: '1px solid var(--ctp-surface0)',
            color: 'var(--ctp-subtext0)',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          <span>Startup context</span>
          {totalEstimatedTokens > 0 ? (
            <span
              style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--ctp-text)' }}
            >
              ~{formatTokens(totalEstimatedTokens)} tokens
            </span>
          ) : (
            <span style={{ color: 'var(--ctp-overlay0)' }}>unknown</span>
          )}
        </div>
      )}
    </div>
  );
}
