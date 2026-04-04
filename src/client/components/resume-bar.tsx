import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useSessionStore } from '../store/session-store.ts';
import type { ResumeMessage } from '../store/session-store.ts';
import { useResume } from '../hooks/resume-context.ts';
import { SendIcon } from '../icons/send-icon.tsx';
import { CloseIcon } from '../icons/close-icon.tsx';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Props for a single chat bubble row */
interface ChatBubbleProps {
  msg: ResumeMessage;
  isStreaming: boolean;
}

/** Renders one user or assistant message in the conversation history */
function ChatBubble({ msg, isStreaming }: ChatBubbleProps): React.ReactElement {
  const isUser = msg.role === 'user';
  const label = isUser ? 'You' : 'Claude';
  const labelColor = isUser ? 'var(--ctp-blue)' : 'var(--ctp-green)';
  const showCursor = !isUser && isStreaming && msg.text === '';

  return (
    <div style={{ marginBottom: 8 }}>
      <span
        className="font-mono font-semibold"
        style={{ fontSize: 10, color: labelColor, userSelect: 'none' }}
      >
        {label}:
      </span>
      <pre
        className="font-mono whitespace-pre-wrap"
        style={{ color: 'var(--ctp-text)', fontSize: 11, lineHeight: 1.5, margin: 0 }}
      >
        {msg.text}
        {showCursor && (
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: '0.9em',
              backgroundColor: 'var(--ctp-green)',
              verticalAlign: 'text-bottom',
              animation: 'noc-blink 1s step-end infinite',
            }}
          />
        )}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Bottom bar for resuming a session with a follow-up message.
 * Shows a text input + send button. Streams the response as a chat thread.
 * Supports chained follow-ups without clearing conversation history.
 */
export function ResumeBar(): React.ReactElement | null {
  const selectedSessionId = useSessionStore((s) => s.selectedSessionId);
  const resumeStatus = useSessionStore((s) => s.resumeStatus);
  const resumeMessages = useSessionStore((s) => s.resumeMessages);
  const clearResume = useSessionStore((s) => s.clearResume);
  const { sendResume, cancelResume } = useResume();

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const isRunning = resumeStatus === 'running';
  const hasMessages = resumeMessages.length > 0;

  // Auto-scroll history to bottom as new chunks arrive
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [resumeMessages]);

  const handleSubmit = useCallback(() => {
    if (!selectedSessionId || !input.trim() || isRunning) return;
    sendResume(selectedSessionId, input.trim());
    setInput('');
  }, [selectedSessionId, input, isRunning, sendResume]);

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

  return (
    <div
      style={{
        borderTop: '1px solid var(--ctp-surface0)',
        backgroundColor: 'var(--ctp-crust)',
        flexShrink: 0,
      }}
    >
      {/* Conversation history */}
      {hasMessages && (
        <div
          ref={historyRef}
          style={{
            maxHeight: 200,
            overflow: 'auto',
            padding: '8px 12px',
            borderBottom: '1px solid var(--ctp-surface0)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="font-mono flex items-center gap-1.5"
              style={{ fontSize: 10, color: isRunning ? 'var(--ctp-green)' : 'var(--ctp-overlay0)' }}
            >
              {isRunning && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: 'var(--ctp-green)',
                    animation: 'noc-pulse 1.4s ease-in-out infinite',
                    flexShrink: 0,
                  }}
                />
              )}
              {isRunning ? 'Claude is responding…' : resumeStatus === 'error' ? 'Error' : 'Conversation'}
            </span>
            {!isRunning && (
              <button
                type="button"
                onClick={clearResume}
                style={{ color: 'var(--ctp-overlay0)', cursor: 'pointer' }}
                title="Clear conversation"
              >
                <CloseIcon size={12} />
              </button>
            )}
          </div>
          {resumeMessages.map((msg, i) => (
            <ChatBubble
              key={i}
              msg={msg}
              isStreaming={isRunning && i === resumeMessages.length - 1}
            />
          ))}
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
            style={{ color: 'var(--ctp-red)', cursor: 'pointer', padding: 4, flexShrink: 0 }}
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
