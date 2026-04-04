import React, { useMemo, useState, useCallback } from 'react';

import type { WaterfallRow } from '../shared/types.ts';
import { useSessionStore } from './store/session-store.ts';
import { useSessionWs } from './hooks/use-session-ws.ts';
import { ResumeContext } from './hooks/resume-context.ts';
import { Toolbar } from './components/toolbar.tsx';
import { SessionPicker } from './components/session-picker.tsx';
import { Waterfall } from './components/waterfall.tsx';
import { DetailPanel } from './components/detail-panel.tsx';
import { ResumeBar } from './components/resume-bar.tsx';
import { MenuIcon } from './icons/menu-icon.tsx';
import { CloseIcon } from './icons/close-icon.tsx';

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
 * On mobile (<768px) the sidebar collapses to hidden and can be opened as an overlay.
 */
export function App(): React.ReactElement {
  const { sendResume, cancelResume } = useSessionWs();

  const selectedRowId = useSessionStore((s) => s.selectedRowId);
  const rows = useSessionStore((s) => s.rows);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setMobileSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setMobileSidebarOpen((v) => !v), []);

  const detailRow = useMemo(
    () => (selectedRowId ? findRowById(rows, selectedRowId) : null),
    [rows, selectedRowId],
  );

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
        <div className="flex flex-1 overflow-hidden relative">

          {/* Backdrop — only shown when mobile sidebar is open */}
          {mobileSidebarOpen && (
            <div
              className="md:hidden"
              onClick={closeSidebar}
              aria-hidden="true"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 20,
                backgroundColor: 'rgba(0,0,0,0.5)',
              }}
            />
          )}

          {/*
           * Sidebar container.
           *
           * Desktop (md+): static in-flow element, 240px wide, always visible.
           * Mobile: fixed overlay that slides in from the left.
           *   - collapsed: translateX(-100%), invisible and out of flow via fixed positioning
           *   - open:       translateX(0), covers the waterfall
           *
           * A single SessionPicker instance is mounted here for both breakpoints.
           * The sidebar-mobile / sidebar-desktop CSS classes in theme.css handle
           * the position switch via @media so no JS breakpoint detection is needed.
           */}
          <div
            className="sidebar-panel"
            data-open={mobileSidebarOpen}
            style={{ zIndex: 30 }}
          >
            {/* Close button — only visible on mobile, inside the panel */}
            <div
              className="md:hidden flex items-center justify-end px-2 py-1 shrink-0"
              style={{ borderBottom: '1px solid var(--ctp-surface0)' }}
            >
              <button
                type="button"
                onClick={closeSidebar}
                className="p-1 rounded"
                style={{ color: 'var(--ctp-overlay0)' }}
                aria-label="Close sidebar"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              <SessionPicker />
            </div>
          </div>

          {/* Mobile sidebar toggle button — hidden on md+ */}
          <button
            type="button"
            onClick={toggleSidebar}
            className="md:hidden absolute left-0 top-2 z-10 flex items-center justify-center rounded-r"
            style={{
              width: 28,
              height: 28,
              backgroundColor: 'var(--ctp-mantle)',
              border: '1px solid var(--ctp-surface0)',
              borderLeft: 'none',
              color: 'var(--ctp-overlay1)',
            }}
            aria-label="Toggle sidebar"
          >
            <MenuIcon size={14} />
          </button>

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
