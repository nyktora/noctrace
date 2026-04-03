import React from 'react';

import type { WaterfallRow } from '../shared/types.ts';
import { useSessionStore } from './store/session-store.ts';
import { useSessionWs } from './hooks/use-session-ws.ts';
import { ResumeContext } from './hooks/resume-context.ts';
import { Toolbar } from './components/toolbar.tsx';
import { SessionPicker } from './components/session-picker.tsx';
import { Waterfall } from './components/waterfall.tsx';
import { DetailPanel } from './components/detail-panel.tsx';
import { ResumeBar } from './components/resume-bar.tsx';

/** Recursively find a row by id in the row tree */
function findRowById(rows: WaterfallRow[], id: string): WaterfallRow | null {
  for (const row of rows) {
    if (row.id === id) return row;
    if (row.children.length > 0) {
      const found = findRowById(row.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Root application component.
 * Composes the four-quadrant layout: toolbar, sidebar, waterfall, detail panel.
 */
export function App(): React.ReactElement {
  const { sendResume, cancelResume } = useSessionWs();

  const selectedRowId = useSessionStore((s) => s.selectedRowId);
  const rows = useSessionStore((s) => s.rows);

  const detailRow = selectedRowId ? findRowById(rows, selectedRowId) : null;

  return (
    <ResumeContext value={{ sendResume, cancelResume }}>
      <div
        className="flex flex-col"
        style={{
          height: '100vh',
          backgroundColor: 'var(--ctp-base)',
          color: 'var(--ctp-text)',
          overflow: 'hidden',
        }}
      >
        {/* Toolbar */}
        <Toolbar />

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div
            style={{
              width: 240,
              flexShrink: 0,
              backgroundColor: 'var(--ctp-mantle)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <SessionPicker />
          </div>

          {/* Waterfall + detail panel */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
              <Waterfall />
            </div>
            {detailRow && (
              <DetailPanel row={detailRow} />
            )}
            <ResumeBar />
          </div>
        </div>
      </div>
    </ResumeContext>
  );
}
