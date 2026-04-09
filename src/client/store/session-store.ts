import { create } from 'zustand';

import type { ContextHealth, DriftAnalysis, ProjectSummary, SessionSummary, WaterfallRow } from '../../shared/types.ts';

/** A single message in a resume conversation */
export interface ResumeMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** Shape of the session Zustand store */
export interface SessionStore {
  // Data
  projects: ProjectSummary[];
  sessions: SessionSummary[];
  rows: WaterfallRow[];
  health: ContextHealth | null;
  compactionBoundaries: number[];
  drift: DriftAnalysis | null;

  // MCP mode — populated when MCP processes register sessions
  registeredSessions: string[];
  mcpMode: boolean;

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

  // Session stats
  slowThresholdMs: number;
  showSessionStats: boolean;

  // Resume
  resumeStatus: 'idle' | 'running' | 'done' | 'error';
  resumeMessages: ResumeMessage[];

  // Compare mode
  compareMode: boolean;
  compareSessionId: string | null;
  compareRows: WaterfallRow[];
  compareHealth: ContextHealth | null;
  compareDrift: DriftAnalysis | null;
  compareCompactionBoundaries: number[];

  // Actions
  fetchProjects: () => Promise<void>;
  fetchSessions: (slug: string) => Promise<void>;
  fetchSession: (slug: string, id: string) => Promise<void>;
  /** Fetch the list of MCP-registered session paths and update mcpMode. */
  fetchRegisteredSessions: () => Promise<void>;
  selectRow: (id: string | null) => void;
  toggleAgent: (id: string) => void;
  setFilter: (text: string) => void;
  setAutoScroll: (on: boolean) => void;
  setZoom: (level: number) => void;
  setPan: (offset: number) => void;
  addRows: (rows: WaterfallRow[], health: ContextHealth, boundaries: number[], drift: DriftAnalysis) => void;
  setSlowThreshold: (ms: number) => void;
  toggleSessionStats: () => void;
  setResumeStatus: (status: 'idle' | 'running' | 'done' | 'error') => void;
  addResumeUserMessage: (text: string) => void;
  appendResumeOutput: (text: string) => void;
  clearResume: () => void;
  /** Enter compare mode by fetching a second session without overwriting primary data. */
  enterCompareMode: (slug: string, sessionId: string) => Promise<void>;
  /** Exit compare mode and clear all compare state. */
  exitCompareMode: () => void;
}

/** Global session store powered by Zustand */
export const useSessionStore = create<SessionStore>((set, get) => ({
  projects: [],
  sessions: [],
  rows: [],
  health: null,
  compactionBoundaries: [],
  drift: null,

  registeredSessions: [],
  mcpMode: false,

  selectedProjectSlug: null,
  selectedSessionId: null,
  selectedRowId: null,
  expandedAgents: new Set<string>(),
  filterText: '',
  autoScroll: true,

  zoomLevel: 1,
  panOffset: 0,

  slowThresholdMs: 5000,
  showSessionStats: false,

  resumeStatus: 'idle',
  resumeMessages: [],

  compareMode: false,
  compareSessionId: null,
  compareRows: [],
  compareHealth: null,
  compareDrift: null,
  compareCompactionBoundaries: [],

  fetchRegisteredSessions: async () => {
    const res = await fetch('/api/sessions/registered');
    if (!res.ok) return;
    const data = (await res.json()) as { sessions: string[] };
    const sessions = data.sessions ?? [];
    set({ registeredSessions: sessions, mcpMode: sessions.length > 0 });
  },

  fetchProjects: async () => {
    // Always fetch registered sessions alongside projects so MCP mode state is current
    const [projectsRes] = await Promise.all([
      fetch('/api/projects'),
      get().fetchRegisteredSessions(),
    ]);
    if (!projectsRes.ok) return;
    const allProjects = (await projectsRes.json()) as ProjectSummary[];

    const { registeredSessions } = get();
    const mcpMode = registeredSessions.length > 0;

    if (!mcpMode) {
      set({ projects: allProjects });
      return;
    }

    // In MCP mode, only show projects that have at least one registered session
    const registeredSlugs = new Set(
      registeredSessions.map((p) => {
        // Extract the project slug from the absolute path.
        // Registered paths look like: /home/user/.claude/projects/<slug>/<session>.jsonl
        const parts = p.split('/');
        // Find the index of "projects" in the path, slug is the next segment
        const projectsIdx = parts.lastIndexOf('projects');
        return projectsIdx >= 0 ? parts[projectsIdx + 1] : null;
      }).filter((s): s is string => s !== null),
    );

    set({ projects: allProjects.filter((p) => registeredSlugs.has(p.slug)) });
  },

  fetchSessions: async (slug: string) => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(slug)}`);
    if (!res.ok) return;
    const allSessions = (await res.json()) as SessionSummary[];

    const { registeredSessions, mcpMode } = get();

    if (!mcpMode) {
      set({ sessions: allSessions, selectedProjectSlug: slug });
      return;
    }

    // In MCP mode, only show sessions whose file path is registered
    const registeredSet = new Set(registeredSessions);
    const filtered = allSessions.filter((s) => registeredSet.has(s.filePath));
    set({ sessions: filtered, selectedProjectSlug: slug });
  },

  fetchSession: async (slug: string, id: string) => {
    const res = await fetch(`/api/session/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      rows: WaterfallRow[];
      health: ContextHealth;
      compactionBoundaries: number[];
      drift: DriftAnalysis;
    };
    set({
      rows: data.rows,
      health: data.health,
      compactionBoundaries: data.compactionBoundaries ?? [],
      drift: data.drift ?? null,
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

  setSlowThreshold: (ms) => set({ slowThresholdMs: ms }),
  toggleSessionStats: () => set((s) => ({ showSessionStats: !s.showSessionStats })),

  setFilter: (text) => set({ filterText: text }),
  setAutoScroll: (on) => set({ autoScroll: on }),
  setZoom: (level) => set({ zoomLevel: level }),
  setPan: (offset) => set({ panOffset: offset }),

  setResumeStatus: (status) => set({ resumeStatus: status }),

  addResumeUserMessage: (text) =>
    set((s) => ({
      resumeMessages: [...s.resumeMessages, { role: 'user', text }, { role: 'assistant', text: '' }],
    })),

  appendResumeOutput: (text) =>
    set((s) => {
      const msgs = s.resumeMessages;
      if (msgs.length === 0) return {};
      const last = msgs[msgs.length - 1];
      if (last.role !== 'assistant') return {};
      const updated: ResumeMessage = { role: 'assistant', text: last.text + text };
      return { resumeMessages: [...msgs.slice(0, -1), updated] };
    }),

  clearResume: () => set({ resumeStatus: 'idle', resumeMessages: [] }),

  enterCompareMode: async (slug: string, sessionId: string) => {
    const res = await fetch(`/api/session/${encodeURIComponent(slug)}/${encodeURIComponent(sessionId)}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      rows: WaterfallRow[];
      health: ContextHealth;
      compactionBoundaries: number[];
      drift: DriftAnalysis;
    };
    // Store comparison data without touching primary session fields
    set({
      compareMode: true,
      compareSessionId: sessionId,
      compareRows: data.rows,
      compareHealth: data.health ?? null,
      compareDrift: data.drift ?? null,
      compareCompactionBoundaries: data.compactionBoundaries ?? [],
    });
  },

  exitCompareMode: () => {
    set({
      compareMode: false,
      compareSessionId: null,
      compareRows: [],
      compareHealth: null,
      compareDrift: null,
      compareCompactionBoundaries: [],
    });
  },

  addRows: (rows, health, boundaries, drift) => {
    const existing = get().rows;
    // Merge by id — update existing, append new
    const map = new Map(existing.map((r) => [r.id, r]));
    for (const row of rows) {
      // Preserve children from existing row when incoming row has none
      // (incremental watcher parse doesn't load sub-agent files)
      const prev = map.get(row.id);
      if (prev && prev.children.length > 0 && row.children.length === 0) {
        row.children = prev.children;
      }
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
      drift,
      expandedAgents: agentIds,
    });
  },
}));
