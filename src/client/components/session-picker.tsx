import React, { useEffect, useState } from 'react';

import type { ProjectSummary, SessionSummary } from '../../shared/types.ts';
import { useSessionStore } from '../store/session-store.ts';
import { formatRelativeTime } from '../utils/tool-colors.ts';

/**
 * Detect if a slug is a git worktree path.
 * Worktree slugs contain the pattern "--claude-worktrees-" which corresponds
 * to the literal path segment "/.claude/worktrees/" in the original filesystem path.
 */
function isWorktreeSlug(slug: string): boolean {
  return slug.includes('--claude-worktrees-');
}

/**
 * Extract a human-readable label for a worktree project.
 * For "-Users-lam-dev-project--claude-worktrees-adjective" returns "project (adjective)".
 */
function worktreeDisplayName(slug: string): string {
  const match = /^(.*?)--claude-worktrees-([^-]+(?:-[^-]+)*)$/.exec(slug);
  if (!match) return slug;
  const beforeWorktrees = match[1]; // e.g. "-Users-lam-dev-svgmint-com"
  const adjective = match[2];       // e.g. "xenodochial"
  const projectParts = beforeWorktrees.replace(/^-/, '').split('-');
  const projectName = projectParts[projectParts.length - 1] || beforeWorktrees;
  return `${projectName} (${adjective})`;
}

/**
 * Extract the parent path for a worktree project.
 * For "-Users-lam-dev-svgmint-com--claude-worktrees-xenodochial" returns "~/Users/lam/dev/svgmint/com".
 */
function worktreeParentPath(slug: string): string {
  const match = /^(.*?)--claude-worktrees-/.exec(slug);
  if (!match) return '';
  const beforeWorktrees = match[1]; // e.g. "-Users-lam-dev-svgmint-com"
  return '~/' + beforeWorktrees.replace(/^-/, '').split('-').join('/');
}

/** Extract the last meaningful path segment as the project display name */
function projectDisplayName(slug: string): string {
  if (isWorktreeSlug(slug)) return worktreeDisplayName(slug);
  // slug looks like "-Users-lam-dev-noctrace" → split on hyphens, take last segment
  const parts = slug.replace(/^-/, '').split('-');
  // Find the last non-empty segment
  return parts[parts.length - 1] || slug;
}

/** Format the parent path (everything before the project name) */
function projectParentPath(slug: string): string {
  if (isWorktreeSlug(slug)) return worktreeParentPath(slug);
  const parts = slug.replace(/^-/, '').split('-');
  if (parts.length <= 1) return '';
  return '~/' + parts.slice(0, -1).join('/');
}

/** Format session start time for display */
function formatSessionTime(startTime: string | null): string {
  if (!startTime) return '';
  const d = new Date(startTime);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` ${time}`;
}

interface SessionBadge {
  label: string;
  tooltip: string;
  bgColor: string;
  textColor: string;
}

function buildSessionBadges(session: SessionSummary): SessionBadge[] {
  const badges: SessionBadge[] = [];
  if (session.isActive) {
    badges.push({ label: 'LIVE', tooltip: 'Process is running', bgColor: '#a6e3a133', textColor: '#a6e3a1' });
  }
  if (session.permissionMode === 'bypassPermissions') {
    badges.push({ label: 'YOLO', tooltip: 'Dangerously skips permissions', bgColor: '#f38ba833', textColor: '#f38ba8' });
  }
  if (session.isRemoteControlled) {
    badges.push({ label: 'RC', tooltip: 'Remote controlled', bgColor: '#89b4fa33', textColor: '#89b4fa' });
  }
  return badges;
}

/** Props for SessionPickerRow */
export interface SessionPickerRowProps {
  session: SessionSummary;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

/** Single session row in the picker list */
function SessionPickerRow({ session, isSelected, onSelect }: SessionPickerRowProps): React.ReactElement {
  const sessionTime = formatSessionTime(session.startTime);
  const relTime = formatRelativeTime(session.lastModified);

  const badges = buildSessionBadges(session);

  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      className="w-full text-left py-1.5 text-xs transition-colors"
      style={{
        paddingLeft: 16,
        paddingRight: 12,
        backgroundColor: isSelected ? 'var(--ctp-surface1)' : 'transparent',
        color: isSelected ? 'var(--ctp-text)' : 'var(--ctp-subtext0)',
        borderLeft: isSelected ? '2px solid var(--ctp-mauve)' : '2px solid transparent',
        opacity: session.isActive ? 1 : 0.5,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="font-mono truncate"
          style={{ fontSize: 11 }}
          title={`${session.id}\n${session.startTime ?? ''}`}
        >
          {sessionTime || session.id.slice(0, 8) + '…'}
        </span>
        {badges.map((b) => (
          <span
            key={b.label}
            title={b.tooltip}
            className="shrink-0 font-mono"
            style={{
              fontSize: 8,
              fontWeight: 700,
              padding: '0px 3px',
              borderRadius: 3,
              backgroundColor: b.bgColor,
              color: b.textColor,
              lineHeight: '14px',
            }}
          >
            {b.label}
          </span>
        ))}
      </div>
      <div className="flex justify-between mt-0.5" style={{ color: 'var(--ctp-overlay0)', fontSize: 10 }}>
        <span className="flex items-center gap-1">
          <span>{session.rowCount} calls</span>
          {session.driftFactor !== null && session.driftFactor !== undefined && session.driftFactor >= 2 && (
            <span style={{ color: session.driftFactor >= 5 ? 'var(--ctp-red)' : session.driftFactor >= 3 ? 'var(--ctp-peach)' : 'var(--ctp-yellow)' }}>
              {session.driftFactor}x
            </span>
          )}
        </span>
        <span>{relTime}</span>
      </div>
    </button>
  );
}

/** Props for ProjectRow */
export interface ProjectRowProps {
  project: ProjectSummary;
  isSelected: boolean;
  onSelect: (slug: string) => void;
}

/** Single project row in the picker list */
function ProjectRow({ project, isSelected, onSelect }: ProjectRowProps): React.ReactElement {
  const name = projectDisplayName(project.slug);
  const parent = projectParentPath(project.slug);

  return (
    <button
      type="button"
      onClick={() => onSelect(project.slug)}
      className="w-full text-left px-3 py-2 text-xs transition-colors truncate"
      style={{
        backgroundColor: isSelected ? 'var(--ctp-surface0)' : 'transparent',
        color: isSelected ? 'var(--ctp-lavender)' : 'var(--ctp-subtext1)',
        opacity: project.activeSessionCount > 0 ? 1 : 0.5,
      }}
      title={project.path}
    >
      <div className="truncate font-semibold" style={{ fontSize: 12 }}>{name}</div>
      <div className="flex justify-between mt-0.5" style={{ color: 'var(--ctp-overlay0)', fontWeight: 'normal', fontSize: 10 }}>
        <span className="truncate" style={{ maxWidth: '60%' }}>{parent}</span>
        <span className="shrink-0">{project.sessionCount}</span>
      </div>
    </button>
  );
}

/**
 * Left sidebar component for browsing projects and sessions.
 * Fetches project list on mount and sessions when a project is selected.
 */
/** Props for SessionPicker */
export interface SessionPickerProps {
  /** Called after a session is selected (useful for closing mobile sidebar) */
  onSessionSelect?: () => void;
}

export function SessionPicker({ onSessionSelect }: SessionPickerProps): React.ReactElement {
  const projects = useSessionStore((s) => s.projects);
  const sessions = useSessionStore((s) => s.sessions);
  const selectedProjectSlug = useSessionStore((s) => s.selectedProjectSlug);
  const selectedSessionId = useSessionStore((s) => s.selectedSessionId);
  const fetchProjects = useSessionStore((s) => s.fetchProjects);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const fetchSession = useSessionStore((s) => s.fetchSession);
  const [showEmpty, setShowEmpty] = useState(false);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  function handleProjectSelect(slug: string): void {
    void fetchSessions(slug);
  }

  function handleSessionSelect(id: string): void {
    if (!selectedProjectSlug) return;
    void fetchSession(selectedProjectSlug, id);
    onSessionSelect?.();
  }

  const sortedSessions = [...sessions].sort((a, b) => {
    // Active sessions first, then by start time descending
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
    return bTime - aTime;
  });

  const emptyProjectCount = projects.filter((p) => p.sessionCount === 0).length;
  const visibleProjects = showEmpty ? projects : projects.filter((p) => p.sessionCount > 0);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ borderRight: '1px solid var(--ctp-surface0)' }}
    >
      <div
        className="px-3 py-2 text-xs font-semibold uppercase tracking-wider shrink-0"
        style={{
          color: 'var(--ctp-overlay0)',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          borderBottom: '1px solid var(--ctp-surface0)',
        }}
      >
        Projects
      </div>

      <div className="overflow-y-auto flex-1">
        {projects.length === 0 && (
          <div className="px-3 py-4 text-xs" style={{ color: 'var(--ctp-overlay0)' }}>
            No projects found in ~/.claude/projects/
          </div>
        )}

        {visibleProjects.map((project: ProjectSummary) => (
          <div key={project.slug}>
            <ProjectRow
              project={project}
              isSelected={project.slug === selectedProjectSlug}
              onSelect={handleProjectSelect}
            />
            {project.slug === selectedProjectSlug && sortedSessions.length > 0 && (
              <div style={{ backgroundColor: 'var(--ctp-mantle)' }}>
                {sortedSessions.map((session: SessionSummary) => (
                  <SessionPickerRow
                    key={session.id}
                    session={session}
                    isSelected={session.id === selectedSessionId}
                    onSelect={handleSessionSelect}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {emptyProjectCount > 0 && (
        <button
          type="button"
          onClick={() => setShowEmpty((v) => !v)}
          className="shrink-0 px-3 py-1.5 text-left text-xs transition-colors"
          style={{
            borderTop: '1px solid var(--ctp-surface0)',
            color: 'var(--ctp-overlay0)',
            backgroundColor: 'transparent',
          }}
        >
          {showEmpty ? `Hide empty projects` : `Show ${emptyProjectCount} empty project${emptyProjectCount === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}
