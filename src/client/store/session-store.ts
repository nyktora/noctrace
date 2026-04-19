import { create } from 'zustand';

import type { AgentTeam, CompactionBoundary, ContextHealth, DriftAnalysis, InstructionFile, ProjectSummary, SearchResult, SessionInitContext, SessionResultMetrics, SessionSummary, WaterfallRow } from '../../shared/types.ts';
import type { ProviderCapabilities } from '../../shared/providers/provider.ts';
import { CLAUDE_CODE_CAPABILITIES } from '../hooks/use-capabilities.ts';

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
  compactionBoundaries: CompactionBoundary[];
  drift: DriftAnalysis | null;
  instructionsLoaded: InstructionFile[];
  resultMetrics: SessionResultMetrics | null;
  initContext: SessionInitContext | null;
  teams: AgentTeam[];

  /**
   * Provider identifier for the currently-loaded session (e.g. 'claude-code').
   * Null when no session is loaded or the server has not yet surfaced it (pre-Phase B).
   */
  sessionProvider: string | null;
  /**
   * Capabilities for the currently-loaded session's provider.
   * Null until a session is loaded; callers should fall back to CLAUDE_CODE_CAPABILITIES.
   */
  sessionCapabilities: ProviderCapabilities | null;

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
  showConversation: boolean;

  // Zoom/pan
  zoomLevel: number;
  panOffset: number;

  // Column sizing
  nameColWidth: number;

  // Session stats
  slowThresholdMs: number;
  showSessionStats: boolean;

  // Reliability panel
  showReliability: boolean;

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
  compareCompactionBoundaries: CompactionBoundary[];

  // Cross-session search
  searchResults: SearchResult[];
  searchQuery: string;
  searchLoading: boolean;
  showSearchResults: boolean;

  // Actions
  fetchProjects: () => Promise<void>;
  fetchSessions: (slug: string) => Promise<void>;
  fetchSession: (slug: string, id: string) => Promise<void>;
  /**
   * Directly set provider identity and capabilities.
   * Used by tests and Phase B integration to inject capabilities without a full fetchSession.
   */
  setSessionCapabilities: (provider: string, capabilities: ProviderCapabilities) => void;
  /** Fetch the list of MCP-registered session paths and update mcpMode. */
  fetchRegisteredSessions: () => Promise<void>;
  /** Fetch Agent Teams from the server. */
  fetchTeams: () => Promise<void>;
  selectRow: (id: string | null) => void;
  toggleAgent: (id: string) => void;
  setFilter: (text: string) => void;
  setAutoScroll: (on: boolean) => void;
  setShowConversation: (on: boolean) => void;
  setZoom: (level: number) => void;
  setPan: (offset: number) => void;
  setNameColWidth: (width: number) => void;
  addRows: (rows: WaterfallRow[], health: ContextHealth, boundaries: CompactionBoundary[], drift: DriftAnalysis) => void;
  /**
   * Replace the children of the agent row identified by toolUseId (the parent row's id).
   * Buffers the update if the parent row does not exist yet (race condition: sub-agent file
   * written before parent row appears in the main session). The buffer is flushed when
   * addRows processes the parent row.
   */
  updateSubAgentChildren: (toolUseId: string, agentId: string, children: WaterfallRow[]) => void;
  setSlowThreshold: (ms: number) => void;
  toggleSessionStats: () => void;
  toggleReliability: () => void;
  setResumeStatus: (status: 'idle' | 'running' | 'done' | 'error') => void;
  addResumeUserMessage: (text: string) => void;
  appendResumeOutput: (text: string) => void;
  clearResume: () => void;
  /** Enter compare mode by fetching a second session without overwriting primary data. */
  enterCompareMode: (slug: string, sessionId: string) => Promise<void>;
  /** Exit compare mode and clear all compare state. */
  exitCompareMode: () => void;
  /** Search across all sessions for a query string. */
  searchAllSessions: (query: string) => Promise<void>;
  /** Clear search results and hide the search panel. */
  clearSearch: () => void;
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
  resultMetrics: null,
  initContext: null,
  teams: [],

  sessionProvider: null,
  sessionCapabilities: null,

  registeredSessions: [],
  mcpMode: false,

  selectedProjectSlug: null,
  selectedSessionId: null,
  selectedRowId: null,
  expandedAgents: new Set<string>(),
  filterText: '',
  autoScroll: true,
  showConversation: ((): boolean => {
    try { return localStorage.getItem('noctrace.showConversation') === '1'; }
    catch { return false; }
  })(),

  zoomLevel: 1,
  panOffset: 0,

  nameColWidth: 200,

  slowThresholdMs: 5000,
  showSessionStats: false,
  showReliability: false,

  resumeStatus: 'idle',
  resumeMessages: [],

  pendingSubAgentChildren: new Map<string, WaterfallRow[]>(),

  compareMode: false,
  compareSessionId: null,
  compareRows: [],
  compareHealth: null,
  compareDrift: null,
  compareCompactionBoundaries: [],

  searchResults: [],
  searchQuery: '',
  searchLoading: false,
  showSearchResults: false,

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
    // Pass provider query param for non-Claude Code sessions so the server
    // routes the read through the correct provider.
    const sessions = get().sessions;
    const sessionInfo = sessions.find((s) => s.id === id);
    const knownProvider = sessionInfo?.provider;
    const providerParam = knownProvider && knownProvider !== 'claude-code'
      ? `?provider=${encodeURIComponent(knownProvider)}`
      : '';
    const res = await fetch(`/api/session/${encodeURIComponent(slug)}/${encodeURIComponent(id)}${providerParam}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      rows: WaterfallRow[];
      health: ContextHealth;
      compactionBoundaries: CompactionBoundary[];
      drift: DriftAnalysis;
      instructionsLoaded?: InstructionFile[];
      resultMetrics?: SessionResultMetrics;
      initContext?: SessionInitContext;
      /** Phase B: provider identifier, e.g. 'claude-code'. Absent on older server versions. */
      provider?: string;
      /** Phase B: provider capabilities. Absent on older server versions. */
      capabilities?: ProviderCapabilities;
    };

    // Derive capabilities: use server-supplied caps if present; fall back to
    // CLAUDE_CODE_CAPABILITIES when the server hasn't surfaced them yet (pre-Phase B).
    const provider = data.provider ?? 'claude-code';
    const capabilities = data.capabilities ?? CLAUDE_CODE_CAPABILITIES;

    set({
      rows: data.rows,
      health: data.health,
      compactionBoundaries: data.compactionBoundaries ?? [],
      drift: data.drift ?? null,
      instructionsLoaded: data.instructionsLoaded ?? [],
      resultMetrics: data.resultMetrics ?? null,
      initContext: data.initContext ?? null,
      selectedSessionId: id,
      selectedRowId: null,
      expandedAgents: new Set<string>(),
      zoomLevel: 1,
      panOffset: 0,
      autoScroll: true,
      sessionProvider: provider,
      sessionCapabilities: capabilities,
    });
  },

  setSessionCapabilities: (provider, capabilities) =>
    set({ sessionProvider: provider, sessionCapabilities: capabilities }),

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
  toggleReliability: () => set((s) => ({ showReliability: !s.showReliability })),

  setFilter: (text) => set({ filterText: text }),
  setAutoScroll: (on) => set({ autoScroll: on }),
  setShowConversation: (on) => {
    try { localStorage.setItem('noctrace.showConversation', on ? '1' : '0'); } catch { /* ignore */ }
    set({ showConversation: on });
  },
  setZoom: (level) => set({ zoomLevel: level }),
  setPan: (offset) => set({ panOffset: offset }),
  setNameColWidth: (width) => set({ nameColWidth: Math.max(80, Math.min(600, width)) }),

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
    // Pass provider query param for non-Claude Code sessions.
    const sessions = get().sessions;
    const sessionInfo = sessions.find((s) => s.id === sessionId);
    const provider = sessionInfo?.provider;
    const providerParam = provider && provider !== 'claude-code'
      ? `?provider=${encodeURIComponent(provider)}`
      : '';
    const res = await fetch(`/api/session/${encodeURIComponent(slug)}/${encodeURIComponent(sessionId)}${providerParam}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      rows: WaterfallRow[];
      health: ContextHealth;
      compactionBoundaries: CompactionBoundary[];
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

  searchAllSessions: async (query: string) => {
    if (query.trim().length < 3) return;
    set({ searchLoading: true, searchQuery: query, showSearchResults: true, searchResults: [] });
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        set({ searchLoading: false });
        return;
      }
      const data = (await res.json()) as { results: SearchResult[] };
      set({ searchResults: data.results ?? [], searchLoading: false });
    } catch {
      set({ searchLoading: false });
    }
  },

  clearSearch: () => set({ searchResults: [], searchQuery: '', showSearchResults: false, searchLoading: false }),

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
