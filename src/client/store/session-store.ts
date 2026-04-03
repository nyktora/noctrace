import { create } from 'zustand';

import type { ContextHealth, ProjectSummary, SessionSummary, WaterfallRow } from '../../shared/types.ts';

/** Shape of the session Zustand store */
export interface SessionStore {
  // Data
  projects: ProjectSummary[];
  sessions: SessionSummary[];
  rows: WaterfallRow[];
  health: ContextHealth | null;
  compactionBoundaries: number[];

  // UI state
  selectedProjectSlug: string | null;
  selectedSessionId: string | null;
  selectedRowId: string | null;
  expandedAgents: Set<string>;
  filterText: string;
  autoScroll: boolean;

  // Zoom/pan
  zoomLevel: number;
  panOffset: number;

  // Resume
  resumeStatus: 'idle' | 'running' | 'done' | 'error';
  resumeOutput: string;

  // Actions
  fetchProjects: () => Promise<void>;
  fetchSessions: (slug: string) => Promise<void>;
  fetchSession: (slug: string, id: string) => Promise<void>;
  selectRow: (id: string | null) => void;
  toggleAgent: (id: string) => void;
  setFilter: (text: string) => void;
  setAutoScroll: (on: boolean) => void;
  setZoom: (level: number) => void;
  setPan: (offset: number) => void;
  addRows: (rows: WaterfallRow[], health: ContextHealth, boundaries: number[]) => void;
  setResumeStatus: (status: 'idle' | 'running' | 'done' | 'error') => void;
  appendResumeOutput: (text: string) => void;
  clearResume: () => void;
}

/** Global session store powered by Zustand */
export const useSessionStore = create<SessionStore>((set, get) => ({
  projects: [],
  sessions: [],
  rows: [],
  health: null,
  compactionBoundaries: [],

  selectedProjectSlug: null,
  selectedSessionId: null,
  selectedRowId: null,
  expandedAgents: new Set<string>(),
  filterText: '',
  autoScroll: true,

  zoomLevel: 1,
  panOffset: 0,

  resumeStatus: 'idle',
  resumeOutput: '',

  fetchProjects: async () => {
    const res = await fetch('/api/projects');
    if (!res.ok) return;
    const data = (await res.json()) as ProjectSummary[];
    set({ projects: data });
  },

  fetchSessions: async (slug: string) => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(slug)}`);
    if (!res.ok) return;
    const data = (await res.json()) as SessionSummary[];
    set({ sessions: data, selectedProjectSlug: slug });
  },

  fetchSession: async (slug: string, id: string) => {
    const res = await fetch(`/api/session/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      rows: WaterfallRow[];
      health: ContextHealth;
      compactionBoundaries: number[];
    };
    set({
      rows: data.rows,
      health: data.health,
      compactionBoundaries: data.compactionBoundaries ?? [],
      selectedSessionId: id,
      selectedRowId: null,
      expandedAgents: new Set<string>(),
      zoomLevel: 1,
      panOffset: 0,
      autoScroll: true,
    });
  },

  selectRow: (id) => set({ selectedRowId: id }),

  toggleAgent: (id) => {
    const next = new Set(get().expandedAgents);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ expandedAgents: next });
  },

  setFilter: (text) => set({ filterText: text }),
  setAutoScroll: (on) => set({ autoScroll: on }),
  setZoom: (level) => set({ zoomLevel: level }),
  setPan: (offset) => set({ panOffset: offset }),

  setResumeStatus: (status) => set({ resumeStatus: status }),
  appendResumeOutput: (text) => set((s) => ({ resumeOutput: s.resumeOutput + text })),
  clearResume: () => set({ resumeStatus: 'idle', resumeOutput: '' }),

  addRows: (rows, health, boundaries) => {
    const existing = get().rows;
    // Merge by id — update existing, append new
    const map = new Map(existing.map((r) => [r.id, r]));
    for (const row of rows) {
      map.set(row.id, row);
    }
    const agentIds = new Set<string>(get().expandedAgents);
    for (const row of rows) {
      if (row.type === 'agent') agentIds.add(row.id);
    }
    set({
      rows: Array.from(map.values()),
      health,
      compactionBoundaries: boundaries,
      expandedAgents: agentIds,
    });
  },
}));
