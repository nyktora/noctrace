import React, { useCallback, useRef, useState } from 'react';

import { useSessionStore } from '../store/session-store.ts';
import { useResume } from '../hooks/resume-context.ts';
import { SendIcon } from '../icons/send-icon.tsx';
import { CloseIcon } from '../icons/close-icon.tsx';

/**
 * Bottom bar for resuming a session with a follow-up message.
 * Shows a text input + send button. Streams the response output below.
 */
export function ResumeBar(): React.ReactElement | null {
  const selectedSessionId = useSessionStore((s) => s.selectedSessionId);
  const resumeStatus = useSessionStore((s) => s.resumeStatus);
  const resumeOutput = useSessionStore((s) => s.resumeOutput);
  const clearResume = useSessionStore((s) => s.clearResume);
  const { sendResume, cancelResume } = useResume();

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    if (!selectedSessionId || !input.trim()) return;
    sendResume(selectedSessionId, input.trim());
    setInput('');
  }, [selectedSessionId, input, sendResume]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!selectedSessionId) return null;

  const isRunning = resumeStatus === 'running';
  const hasOutput = resumeOutput.length > 0;

  return (
    <div
      style={{
        borderTop: '1px solid var(--ctp-surface0)',
        backgroundColor: 'var(--ctp-crust)',
        flexShrink: 0,
      }}
    >
      {/* Output area */}
      {hasOutput && (
        <div
          style={{
            maxHeight: 120,
            overflow: 'auto',
            padding: '8px 12px',
            borderBottom: '1px solid var(--ctp-surface0)',
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-xs font-mono"
              style={{
                color: isRunning ? 'var(--ctp-green)' : resumeStatus === 'error' ? 'var(--ctp-red)' : 'var(--ctp-overlay0)',
                fontSize: 10,
              }}
            >
              {isRunning ? 'Claude is responding…' : resumeStatus === 'error' ? 'Error' : 'Response'}
            </span>
            {!isRunning && (
              <button
                type="button"
                onClick={clearResume}
                style={{ color: 'var(--ctp-overlay0)', cursor: 'pointer' }}
                title="Dismiss"
              >
                <CloseIcon size={12} />
              </button>
            )}
          </div>
          <pre
            className="font-mono text-xs whitespace-pre-wrap"
            style={{ color: 'var(--ctp-text)', fontSize: 11, lineHeight: 1.5 }}
          >
            {resumeOutput}
          </pre>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a follow-up to this session…"
          disabled={isRunning}
          className="flex-1 font-mono text-xs px-2 py-1.5 rounded"
          style={{
            backgroundColor: 'var(--ctp-surface0)',
            color: 'var(--ctp-text)',
            border: '1px solid var(--ctp-surface1)',
            outline: 'none',
            fontSize: 11,
            opacity: isRunning ? 0.5 : 1,
          }}
        />
        {isRunning ? (
          <button
            type="button"
            onClick={cancelResume}
            title="Cancel"
            style={{
              color: 'var(--ctp-red)',
              cursor: 'pointer',
              padding: 4,
              flexShrink: 0,
            }}
          >
            <CloseIcon size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim()}
            title="Send (Enter)"
            style={{
              color: input.trim() ? 'var(--ctp-blue)' : 'var(--ctp-overlay0)',
              cursor: input.trim() ? 'pointer' : 'default',
              padding: 4,
              flexShrink: 0,
            }}
          >
            <SendIcon size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
