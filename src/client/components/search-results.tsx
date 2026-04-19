import React, { useCallback } from 'react';

import { useSessionStore } from '../store/session-store.ts';
import { CloseIcon } from '../icons/close-icon.tsx';
import { SearchIcon } from '../icons/search-icon.tsx';
import type { SearchResult } from '../../shared/types.ts';

/** Props for the SearchResults panel */
export interface SearchResultsProps {
  onClose: () => void;
}

/**
 * Highlight the first occurrence of query inside text.
 * Returns an array of React nodes with the match wrapped in a <mark>.
 */
function highlightMatch(text: string, query: string): React.ReactNode[] {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return [text];
  return [
    text.slice(0, idx),
    <mark
      key="match"
      style={{
        backgroundColor: 'var(--ctp-yellow)',
        color: 'var(--ctp-base)',
        borderRadius: 2,
        padding: '0 1px',
      }}
    >
      {text.slice(idx, idx + query.length)}
    </mark>,
    text.slice(idx + query.length),
  ];
}

/** A single result row in the search results list */
function ResultItem({
  result,
  query,
  onNavigate,
}: {
  result: SearchResult;
  query: string;
  onNavigate: (result: SearchResult) => void;
}): React.ReactElement {
  const sessionDate = new Date(result.sessionStart).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <button
      type="button"
      onClick={() => onNavigate(result)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid var(--ctp-surface0)',
        padding: '8px 12px',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--ctp-surface0)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '';
      }}
    >
      {/* Header: provider badge + project + date + tool name */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontFamily: 'ui-monospace, monospace',
            fontWeight: 700,
            color: 'var(--ctp-base)',
            backgroundColor: 'var(--ctp-blue)',
            borderRadius: 3,
            padding: '1px 5px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {result.provider}
        </span>
        <span
          style={{
            fontSize: 10,
            fontFamily: 'ui-monospace, monospace',
            color: 'var(--ctp-subtext1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
          title={result.projectContext}
        >
          {result.projectContext}
        </span>
        <span
          style={{
            fontSize: 10,
            fontFamily: 'ui-monospace, monospace',
            color: 'var(--ctp-overlay0)',
            whiteSpace: 'nowrap',
          }}
        >
          {sessionDate}
        </span>
        {result.toolName && (
          <span
            style={{
              fontSize: 9,
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--ctp-base)',
              backgroundColor: 'var(--ctp-mauve)',
              borderRadius: 3,
              padding: '1px 5px',
            }}
          >
            {result.toolName}
          </span>
        )}
      </div>

      {/* Match line with highlighted query */}
      <div
        style={{
          fontSize: 10,
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--ctp-text)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.5,
          maxHeight: 42,
          overflow: 'hidden',
        }}
      >
        {highlightMatch(result.matchLine || result.matchContext.slice(0, 200), query)}
      </div>
    </button>
  );
}

/**
 * Flyout panel showing cross-session search results.
 * Positioned below and to the right of the filter bar area.
 */
export function SearchResults({ onClose }: SearchResultsProps): React.ReactElement {
  const searchResults = useSessionStore((s) => s.searchResults);
  const searchQuery = useSessionStore((s) => s.searchQuery);
  const searchLoading = useSessionStore((s) => s.searchLoading);
  const fetchSession = useSessionStore((s) => s.fetchSession);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const selectRow = useSessionStore((s) => s.selectRow);

  const handleNavigate = useCallback(
    async (result: SearchResult) => {
      // For Claude Code sessions the sessionId is '<slug>/<id>'
      const parts = result.sessionId.split('/');
      if (parts.length >= 2) {
        const slug = parts[0];
        const id = parts.slice(1).join('/');
        await fetchSessions(slug);
        await fetchSession(slug, id);
        if (result.rowId) selectRow(result.rowId);
      }
      onClose();
    },
    [fetchSession, fetchSessions, selectRow, onClose],
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 100,
        backgroundColor: 'var(--ctp-mantle)',
        border: '1px solid var(--ctp-surface1)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        maxHeight: 480,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        marginTop: 4,
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: '1px solid var(--ctp-surface0)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SearchIcon size={12} color="var(--ctp-overlay0)" />
          <span
            style={{
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--ctp-subtext0)',
            }}
          >
            {searchLoading
              ? 'Searching all sessions...'
              : searchResults.length === 0
              ? `No results for "${searchQuery}"`
              : `${searchResults.length} result${searchResults.length === 1 ? '' : 's'} for "${searchQuery}"`}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            color: 'var(--ctp-overlay0)',
          }}
          title="Close search results"
        >
          <CloseIcon size={12} />
        </button>
      </div>

      {/* Results list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {searchLoading && (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--ctp-overlay0)',
            }}
          >
            Scanning sessions...
          </div>
        )}
        {!searchLoading && searchResults.length === 0 && (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--ctp-overlay0)',
            }}
          >
            No matches found.
          </div>
        )}
        {!searchLoading &&
          searchResults.map((result, i) => (
            <ResultItem
              key={`${result.sessionId}-${result.rowId}-${i}`}
              result={result}
              query={searchQuery}
              onNavigate={handleNavigate}
            />
          ))}
      </div>
    </div>
  );
}
