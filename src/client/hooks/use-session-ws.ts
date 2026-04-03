import { useEffect, useRef } from 'react';

import type { ContextHealth, WaterfallRow } from '../../shared/types.ts';
import { useSessionStore } from '../store/session-store.ts';

interface WsRowsMessage {
  type: 'rows';
  rows: WaterfallRow[];
  health: ContextHealth;
  boundaries: number[];
}

interface WsWatchMessage {
  type: 'watch';
  slug: string;
  id: string;
}

type WsOutgoing = WsWatchMessage;
type WsIncoming = WsRowsMessage;

/**
 * Custom hook that maintains a WebSocket connection to the local Noctrace server.
 * Sends a watch command when the selected session changes and calls addRows when
 * new row data arrives from the server.
 */
export function useSessionWs(): void {
  const addRows = useSessionStore((s) => s.addRows);
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

    function send(msg: WsOutgoing): void {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(msg));
      }
    }

    function connect(): void {
      if (!isMountedRef.current) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        if (selectedProjectSlug && selectedSessionId) {
          send({ type: 'watch', slug: selectedProjectSlug, id: selectedSessionId });
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
          addRows(msg.rows, msg.health, msg.boundaries);
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
      const msg: WsWatchMessage = { type: 'watch', slug: selectedProjectSlug, id: selectedSessionId };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, [selectedProjectSlug, selectedSessionId]);
}
