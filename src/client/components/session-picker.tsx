import React, { useEffect } from 'react';

import type { ProjectSummary, SessionSummary } from '../../shared/types.ts';
import { useSessionStore } from '../store/session-store.ts';
import { formatRelativeTime } from '../utils/tool-colors.ts';

/** Props for SessionPickerRow */
export interface SessionPickerRowProps {
  session: SessionSummary;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

/** Single session row in the picker list */
function SessionPickerRow({ session, isSelected, onSelect }: SessionPickerRowProps): React.ReactElement {
  const shortId = session.id.slice(0, 8);
  const relTime = formatRelativeTime(session.lastModified);

  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      className="w-full text-left px-3 py-2 text-xs transition-colors"
      style={{
        backgroundColor: isSelected ? 'var(--ctp-surface1)' : 'transparent',
        color: isSelected ? 'var(--ctp-text)' : 'var(--ctp-subtext0)',
        borderLeft: isSelected ? '2px solid var(--ctp-mauve)' : '2px solid transparent',
      }}
    >
      <div className="font-mono truncate" title={session.id}>{shortId}…</div>
      <div className="flex justify-between mt-0.5" style={{ color: 'var(--ctp-overlay0)', fontSize: '10px' }}>
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
  const shortName = project.slug.replace(/^-/, '').replace(/-/g, ' ').slice(0, 28);

  return (
    <button
      type="button"
      onClick={() => onSelect(project.slug)}
      className="w-full text-left px-3 py-2 text-xs font-semibold transition-colors truncate"
      style={{
        backgroundColor: isSelected ? 'var(--ctp-surface0)' : 'transparent',
        color: isSelected ? 'var(--ctp-lavender)' : 'var(--ctp-subtext1)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
      title={project.path}
    >
      <div className="truncate">{shortName || project.slug}</div>
      <div style={{ color: 'var(--ctp-overlay0)', fontWeight: 'normal', fontSize: '10px' }}>
        {project.sessionCount} session{project.sessionCount !== 1 ? 's' : ''}
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
        Recent Projects
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
              <div style={{ borderTop: '1px solid var(--ctp-surface0)' }}>
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
