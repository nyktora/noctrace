import React, { useEffect } from 'react';

import type { ProjectSummary, SessionSummary } from '../../shared/types.ts';
import { useSessionStore } from '../store/session-store.ts';
import { formatRelativeTime } from '../utils/tool-colors.ts';

/** Extract the last meaningful path segment as the project display name */
function projectDisplayName(slug: string): string {
  // slug looks like "-Users-lam-dev-noctrace" → split on hyphens, take last segment
  const parts = slug.replace(/^-/, '').split('-');
  // Find the last non-empty segment
  return parts[parts.length - 1] || slug;
}

/** Format the parent path (everything before the project name) */
function projectParentPath(slug: string): string {
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

  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      className="w-full text-left px-3 py-1.5 text-xs transition-colors"
      style={{
        backgroundColor: isSelected ? 'var(--ctp-surface1)' : 'transparent',
        color: isSelected ? 'var(--ctp-text)' : 'var(--ctp-subtext0)',
        borderLeft: isSelected ? '2px solid var(--ctp-mauve)' : '2px solid transparent',
      }}
    >
      <div
        className="font-mono truncate"
        style={{ fontSize: 11 }}
        title={`${session.id}\n${session.startTime ?? ''}`}
      >
        {sessionTime || session.id.slice(0, 8) + '…'}
      </div>
      <div className="flex justify-between mt-0.5" style={{ color: 'var(--ctp-overlay0)', fontSize: 10 }}>
        <span>{session.rowCount} calls</span>
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
        opacity: project.sessionCount === 0 ? 0.5 : 1,
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
export function SessionPicker(): React.ReactElement {
  const projects = useSessionStore((s) => s.projects);
  const sessions = useSessionStore((s) => s.sessions);
  const selectedProjectSlug = useSessionStore((s) => s.selectedProjectSlug);
  const selectedSessionId = useSessionStore((s) => s.selectedSessionId);
  const fetchProjects = useSessionStore((s) => s.fetchProjects);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const fetchSession = useSessionStore((s) => s.fetchSession);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  function handleProjectSelect(slug: string): void {
    void fetchSessions(slug);
  }

  function handleSessionSelect(id: string): void {
    if (!selectedProjectSlug) return;
    void fetchSession(selectedProjectSlug, id);
  }

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime(),
  );

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

        {projects.map((project: ProjectSummary) => (
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
    </div>
  );
}
