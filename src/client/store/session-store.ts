import { create } from 'zustand';

import type { AgentTeam, ContextHealth, DriftAnalysis, InstructionFile, ProjectSummary, SessionSummary, WaterfallRow } from '../../shared/types.ts';

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
  instructionsLoaded: InstructionFile[];
  teams: AgentTeam[];

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

  /**
   * Buffer for sub-agent children updates that arrived before the parent agent row
   * was present in the store. Keyed by toolUseId (parent row.id); flushed by addRows
   * when the parent row appears.
   */
  pendingSubAgentChildren: Map<string, WaterfallRow[]>;

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
  /** Fetch Agent Teams from the server. */
  fetchTeams: () => Promise<void>;
  selectRow: (id: string | null) => void;
  toggleAgent: (id: string) => void;
  setFilter: (text: string) => void;
  setAutoScroll: (on: boolean) => void;
  setZoom: (level: number) => void;
  setPan: (offset: number) => void;
  addRows: (rows: WaterfallRow[], health: ContextHealth, boundaries: number[], drift: DriftAnalysis) => void;
  /**
   * Replace the children of the agent row identified by toolUseId (the parent row's id).
   * Buffers the update if the parent row does not exist yet (race condition: sub-agent file
   * written before parent row appears in the main session). The buffer is flushed when
   * addRows processes the parent row.
   */
  updateSubAgentChildren: (toolUseId: string, agentId: string, children: WaterfallRow[]) => void;
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
  instructionsLoaded: [],
  teams: [],

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

  pendingSubAgentChildren: new Map<string, WaterfallRow[]>(),

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

  fetchTeams: async () => {
    try {
      const res = await fetch('/api/teams');
      if (!res.ok) return;
      const teams = (await res.json()) as AgentTeam[];
      set({ teams });
    } catch {
      // Teams fetch is best-effort — don't crash on network errors
    }
  },

  fetchProjects: async () => {
    // Always fetch registered sessions and teams alongside projects
    const [projectsRes] = await Promise.all([
      fetch('/api/projects'),
      get().fetchRegisteredSessions(),
      get().fetchTeams(),
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
      instructionsLoaded?: InstructionFile[];
    };
    set({
      rows: data.rows,
      health: data.health,
      compactionBoundaries: data.compactionBoundaries ?? [],
      drift: data.drift ?? null,
      instructionsLoaded: data.instructionsLoaded ?? [],
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
    const pending = get().pendingSubAgentChildren;
    // Merge by id — update existing, append new
    const map = new Map(existing.map((r) => [r.id, r]));
    for (const row of rows) {
      // Preserve children from existing row when incoming row has none
      // (incremental watcher parse doesn't load sub-agent files)
      const prev = map.get(row.id);
      if (prev && prev.children.length > 0 && row.children.length === 0) {
        row.children = prev.children;
      }
      // Flush any buffered sub-agent children for this row.
      // The buffer is keyed by toolUseId === row.id, populated by updateSubAgentChildren
      // when a subagent-update arrived before this row existed in the store.
      if (pending.has(row.id) && row.children.length === 0) {
        row.children = pending.get(row.id)!;
      }
      map.set(row.id, row);
    }
    // Remove flushed entries from the pending buffer
    const nextPending = new Map(pending);
    for (const row of rows) {
      if (nextPending.has(row.id)) nextPending.delete(row.id);
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
      pendingSubAgentChildren: nextPending,
    });
  },

  updateSubAgentChildren: (toolUseId, agentId, children) => {
    const rows = get().rows;
    // The toolUseId is the parent agent row's id (row.id === block.id from the assistant record).
    // Tag each child with parentAgentId = toolUseId (matching the API route convention).
    const taggedChildren = children.map((c) => ({ ...c, parentAgentId: toolUseId }));

    // Find the parent row by its id (toolUseId)
    const parentRow = rows.find((r) => r.id === toolUseId);

    if (parentRow !== undefined) {
      // Parent row exists — update its children immediately
      const nextRows = rows.map((row) => {
        if (row.id !== toolUseId) return row;
        return { ...row, children: taggedChildren };
      });
      set({ rows: nextRows });
    } else {
      // Parent row not yet in the store (race condition: sub-agent JSONL written before
      // the parent tool_use record appears in the main JSONL). Buffer keyed by toolUseId
      // so addRows can flush it when the parent row arrives.
      const nextPending = new Map(get().pendingSubAgentChildren);
      nextPending.set(toolUseId, taggedChildren);
      set({ pendingSubAgentChildren: nextPending });
    }
  },
}));
