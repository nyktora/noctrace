import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Time window options for the Patterns view */
export type PatternsWindow = 'today' | '7d' | '30d';

/** Health grade distribution for a single window */
export interface HealthGradeDist {
  A: number;
  B: number;
  C: number;
  D: number;
  F: number;
}

/** API response shape for GET /api/patterns */
export interface PatternsResponse {
  window: {
    kind: PatternsWindow;
    startMs: number;
    endMs: number;
    prevStartMs: number;
    prevEndMs: number;
    /** Human-readable label, e.g. "Apr 7 – Apr 14, 2026" */
    label: string;
  };
  sessionCounts: { current: number; previous: number };
  healthDist: {
    current: HealthGradeDist;
    previous: HealthGradeDist;
  };
  rotLeaderboard: Array<{
    /** Human-readable project path, e.g. "~/dev/noctrace" */
    project: string;
    /** Raw slug for navigating to sessions view */
    rawSlug: string;
    sessions: number;
    bad: number;
    /** 0..1 */
    badPct: number;
    avgCompactions: number;
    worstSessionId: string | null;
  }>;
  toolHealth: Array<{
    tool: string;
    calls: number;
    failures: number;
    /** 0..1 */
    failPct: number;
    p50ms: number;
    p95ms: number;
    /** For delta arrow comparison */
    callsPrev: number;
  }>;
  errors: Array<{ path: string; reason: string }>;
}

/** Patterns Zustand slice */
export interface PatternsStore {
  /** Active top-level view */
  view: 'sessions' | 'patterns';
  /** Selected time window for Patterns view */
  patternsWindow: PatternsWindow;
  /** Fetched data, null until first successful fetch */
  patternsData: PatternsResponse | null;
  /** True while a fetch is in flight */
  patternsLoading: boolean;
  /** Error message if last fetch failed */
  patternsError: string | null;
  /**
   * Project slug hint set when clicking a ROT leaderboard row.
   * The session picker reads this and scrolls/filters to that project.
   */
  scrollToProjectSlug: string | null;

  /** Switch between Sessions and Patterns views */
  setView: (v: 'sessions' | 'patterns') => void;
  /** Change the patterns time window and refetch */
  setPatternsWindow: (w: PatternsWindow) => void;
  /** Fetch patterns data from /api/patterns */
  fetchPatterns: () => Promise<void>;
  /** Clear the scrollToProjectSlug hint after it has been consumed */
  clearScrollToProject: () => void;
}

/**
 * Zustand store for the Patterns view.
 * Persists `view` and `patternsWindow` to localStorage so the user's choice
 * survives page refresh.
 */
export const usePatternsStore = create<PatternsStore>()(
  persist(
    (set, get) => ({
      view: 'sessions',
      patternsWindow: '7d',
      patternsData: null,
      patternsLoading: false,
      patternsError: null,
      scrollToProjectSlug: null,

      setView: (v) => set({ view: v }),

      setPatternsWindow: (w) => {
        set({ patternsWindow: w });
        void get().fetchPatterns();
      },

      fetchPatterns: async () => {
        const { patternsWindow } = get();
        set({ patternsLoading: true, patternsError: null });
        try {
          const res = await fetch(`/api/patterns?window=${patternsWindow}`);
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            set({
              patternsError: body.error ?? `HTTP ${res.status}`,
              patternsLoading: false,
            });
            return;
          }
          const data = (await res.json()) as PatternsResponse;
          set({ patternsData: data, patternsLoading: false });
        } catch (err) {
          set({
            patternsError: err instanceof Error ? err.message : 'Unknown error',
            patternsLoading: false,
          });
        }
      },

      clearScrollToProject: () => set({ scrollToProjectSlug: null }),
    }),
    {
      name: 'noctrace-patterns',
      // Only persist UI preference fields — never persist data or loading state
      partialize: (s) => ({
        view: s.view,
        patternsWindow: s.patternsWindow,
      }),
    },
  ),
);
