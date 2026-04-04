import { useEffect, useRef, useCallback } from 'react';

import type { ContextHealth, DriftAnalysis, WaterfallRow } from '../../shared/types.ts';
import { useSessionStore } from '../store/session-store.ts';

interface WsRowsMessage {
  type: 'rows';
  rows: WaterfallRow[];
  health: ContextHealth;
  boundaries: number[];
  drift: DriftAnalysis;
}

interface WsResumeChunk {
  type: 'resume-chunk';
  text: string;
}

interface WsResumeDone {
  type: 'resume-done';
  exitCode: number | null;
}

interface WsResumeError {
  type: 'resume-error';
  message: string;
}

type WsIncoming = WsRowsMessage | WsResumeChunk | WsResumeDone | WsResumeError;

/**
 * Custom hook that maintains a WebSocket connection to the local Noctrace server.
 * Sends a watch command when the selected session changes and calls addRows when
 * new row data arrives from the server. Also handles resume session streaming.
 *
 * Returns a sendResume function to trigger session resume and a cancelResume function.
 */
export function useSessionWs(): {
  sendResume: (sessionId: string, message: string, fork?: boolean) => void;
  cancelResume: () => void;
} {
  const addRows = useSessionStore((s) => s.addRows);
  const setResumeStatus = useSessionStore((s) => s.setResumeStatus);
  const appendResumeOutput = useSessionStore((s) => s.appendResumeOutput);
  const addResumeUserMessage = useSessionStore((s) => s.addResumeUserMessage);
  const fetchSession = useSessionStore((s) => s.fetchSession);
  const selectedSessionId = useSessionStore((s) => s.selectedSessionId);
  const selectedProjectSlug = useSessionStore((s) => s.selectedProjectSlug);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    const wsUrl = `ws://${window.location.hostname}:${port}/ws`;

    function connect(): void {
      if (!isMountedRef.current) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        const slug = useSessionStore.getState().selectedProjectSlug;
        const id = useSessionStore.getState().selectedSessionId;
        if (slug && id) {
          ws.send(JSON.stringify({ type: 'watch', slug, id }));
        }
      });

      ws.addEventListener('message', (event: MessageEvent) => {
        let msg: WsIncoming;
        try {
          msg = JSON.parse(event.data as string) as WsIncoming;
        } catch {
          return;
        }
        if (msg.type === 'rows') {
          addRows(msg.rows, msg.health, msg.boundaries, msg.drift);
        } else if (msg.type === 'resume-chunk') {
          appendResumeOutput(msg.text);
        } else if (msg.type === 'resume-done') {
          const status = msg.exitCode === 0 ? 'done' : 'error';
          setResumeStatus(status);
          // Re-fetch the session so the waterfall reflects any new tool calls
          if (status === 'done') {
            const { selectedProjectSlug: slug, selectedSessionId: id } = useSessionStore.getState();
            if (slug && id) {
              void fetchSession(slug, id);
            }
          }
        } else if (msg.type === 'resume-error') {
          appendResumeOutput(msg.message);
          setResumeStatus('error');
        }
      });

      ws.addEventListener('close', () => {
        wsRef.current = null;
        if (isMountedRef.current) {
          reconnectTimerRef.current = setTimeout(() => connect(), 2000);
        }
      });

      ws.addEventListener('error', () => {
        ws.close();
      });
    }

    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send watch message whenever selected session changes
  useEffect(() => {
    if (selectedProjectSlug && selectedSessionId && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'watch', slug: selectedProjectSlug, id: selectedSessionId }));
    }
  }, [selectedProjectSlug, selectedSessionId]);

  const sendResume = useCallback((sessionId: string, message: string, fork?: boolean) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    addResumeUserMessage(message);
    setResumeStatus('running');
    wsRef.current.send(JSON.stringify({ type: 'resume', sessionId, message, fork }));
  }, [addResumeUserMessage, setResumeStatus]);

  const cancelResume = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'resume-cancel' }));
    setResumeStatus('idle');
  }, [setResumeStatus]);

  return { sendResume, cancelResume };
}
