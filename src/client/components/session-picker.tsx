import React, { useEffect, useState } from 'react';

import type { AgentTeam, ProjectSummary, SessionSummary, TeamMember } from '../../shared/types.ts';
import { useSessionStore } from '../store/session-store.ts';
import { usePatternsStore } from '../store/patterns-store.ts';
import { formatRelativeTime } from '../utils/tool-colors.ts';
import { CompareIcon } from '../icons/compare-icon.tsx';
import { TeamIcon } from '../icons/team-icon.tsx';
import { ProviderIcon } from '../icons/provider-icon.tsx';

/**
 * Extended session summary that may carry provider information once Phase B lands.
 * The `provider` field is optional so this is backward-compatible with pre-Phase B servers.
 */
type SessionSummaryWithProvider = SessionSummary & { provider?: string };

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
  // Provider-prefixed slugs: "codex:~/dev/project" or "copilot:/Users/lam/dev/project"
  const colonIdx = slug.indexOf(':');
  if (colonIdx > 0) {
    const contextPath = slug.slice(colonIdx + 1);
    const segments = contextPath.replace(/\\/g, '/').split('/');
    return segments[segments.length - 1] || contextPath;
  }
  // slug looks like "-Users-lam-dev-noctrace" → split on hyphens, take last segment
  const parts = slug.replace(/^-/, '').split('-');
  // Find the last non-empty segment
  return parts[parts.length - 1] || slug;
}

/** Format the parent path (everything before the project name) */
function projectParentPath(slug: string): string {
  if (isWorktreeSlug(slug)) return worktreeParentPath(slug);
  // Provider-prefixed slugs: return the parent dir of the context path
  const colonIdx = slug.indexOf(':');
  if (colonIdx > 0) {
    const contextPath = slug.slice(colonIdx + 1);
    const segments = contextPath.replace(/\\/g, '/').split('/');
    if (segments.length <= 1) return contextPath;
    return segments.slice(0, -1).join('/');
  }
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
  session: SessionSummaryWithProvider;
  isSelected: boolean;
  onSelect: (id: string) => void;
  /** When set, renders the Compare button for this row */
  onCompare?: (id: string) => void;
}

/** Single session row in the picker list */
function SessionPickerRow({ session, isSelected, onSelect, onCompare }: SessionPickerRowProps): React.ReactElement {
  const sessionTime = formatSessionTime(session.startTime);
  const relTime = formatRelativeTime(session.lastModified);

  const badges = buildSessionBadges(session);

  return (
    <div
      className="relative group"
      style={{
        backgroundColor: isSelected ? 'var(--ctp-surface1)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--ctp-mauve)' : '2px solid transparent',
        opacity: session.isActive ? 1 : 0.5,
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(session.id)}
        className="w-full text-left py-1.5 text-xs transition-colors"
        style={{
          paddingLeft: 16,
          paddingRight: onCompare ? 28 : 12,
          color: isSelected ? 'var(--ctp-text)' : 'var(--ctp-subtext0)',
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
          {/* Provider badge — shown when Phase B surfaces a non-claude-code provider */}
          {session.provider && session.provider !== 'claude-code' && (
            <span
              data-testid="provider-badge"
              className="shrink-0 flex items-center gap-1 font-mono"
              title={`Provider: ${session.provider}`}
              style={{
                fontSize: 8,
                fontWeight: 600,
                padding: '0px 3px',
                borderRadius: 3,
                backgroundColor: 'rgba(137,180,250,0.15)',
                color: 'var(--ctp-blue)',
                lineHeight: '14px',
                border: '1px solid rgba(137,180,250,0.3)',
              }}
            >
              <ProviderIcon size={9} color="var(--ctp-blue)" />
              {session.provider}
            </span>
          )}
        </div>
        {session.title && (
          <div
            className="truncate mt-0.5"
            style={{ fontSize: 10, color: 'var(--ctp-subtext0)' }}
            title={session.title}
          >
            {session.title}
          </div>
        )}
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
      {/* Compare button — only visible on hover when a primary session is already selected */}
      {onCompare && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCompare(session.id); }}
          title="Compare with current session"
          className="absolute right-1.5 top-1/2"
          style={{
            transform: 'translateY(-50%)',
            padding: 3,
            borderRadius: 3,
            border: 'none',
            background: 'none',
            color: 'var(--ctp-overlay0)',
            cursor: 'pointer',
            opacity: 0,
            transition: 'opacity 150ms, color 150ms',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--ctp-mauve)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '0';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--ctp-overlay0)';
          }}
          onFocus={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          onBlur={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; }}
        >
          <CompareIcon size={12} />
        </button>
      )}
    </div>
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
      <div className="flex items-center gap-1.5 truncate">
        <span className="font-semibold truncate" style={{ fontSize: 12 }}>{name}</span>
        {project.provider && project.provider !== 'claude-code' && (
          <span
            className="shrink-0 font-mono"
            title={`Provider: ${project.provider}`}
            style={{
              fontSize: 8,
              fontWeight: 600,
              padding: '0px 3px',
              borderRadius: 3,
              backgroundColor: 'rgba(137,180,250,0.15)',
              color: 'var(--ctp-blue)',
              lineHeight: '14px',
              border: '1px solid rgba(137,180,250,0.3)',
            }}
          >
            {project.provider}
          </span>
        )}
      </div>
      <div className="flex justify-between mt-0.5" style={{ color: 'var(--ctp-overlay0)', fontWeight: 'normal', fontSize: 10 }}>
        <span className="truncate" style={{ maxWidth: '60%' }}>{parent}</span>
        <span className="shrink-0">{project.sessionCount}</span>
      </div>
    </button>
  );
}

/** Single team member row rendered inline in the sidebar */
function SidebarMemberRow({ member }: { member: TeamMember }): React.ReactElement {
  const setFilter = useSessionStore((s) => s.setFilter);

  return (
    <div
      className="flex items-center gap-2 py-1"
      style={{ paddingLeft: 24, paddingRight: 12, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
    >
      <span
        className="shrink-0 px-1.5 rounded"
        style={{
          backgroundColor: 'var(--ctp-surface1)',
          color: 'var(--ctp-blue)',
          fontSize: 9,
          fontFamily: 'ui-monospace, monospace',
          lineHeight: '16px',
          maxWidth: 90,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={member.agentType || 'unknown'}
      >
        {member.agentType || 'agent'}
      </span>
      <span
        className="flex-1 truncate text-xs"
        style={{ color: 'var(--ctp-subtext0)' }}
        title={member.name}
      >
        {member.name}
      </span>
      {member.agentId && (
        <button
          type="button"
          onClick={() => setFilter(member.agentId ?? '')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ctp-overlay0)',
            fontSize: 9,
            padding: 0,
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
          title={`Filter waterfall to agent ${member.agentId}`}
        >
          filter
        </button>
      )}
    </div>
  );
}

/** Single collapsible team row in the sidebar */
function SidebarTeamRow({ team }: { team: AgentTeam }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left flex items-center gap-2 py-1 transition-colors"
        style={{
          paddingLeft: 12,
          paddingRight: 12,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ctp-subtext1)',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        {/* Expand chevron */}
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flexShrink: 0,
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 150ms',
            color: 'var(--ctp-overlay0)',
          }}
        >
          <path d="M2 1l4 3-4 3" />
        </svg>
        <span className="flex-1 truncate text-xs font-semibold" style={{ fontSize: 11 }}>
          {team.name}
        </span>
        <span className="shrink-0 text-xs" style={{ color: 'var(--ctp-overlay0)', fontSize: 10 }}>
          {team.members.length}m
          {team.taskCount > 0 ? ` · ${team.taskCount}t` : ''}
        </span>
      </button>
      {expanded && (
        <div style={{ borderBottom: '1px solid var(--ctp-surface0)' }}>
          {team.members.length === 0 ? (
            <div
              className="py-1 text-xs"
              style={{ paddingLeft: 24, color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
            >
              No members configured
            </div>
          ) : (
            team.members.map((member) => (
              <SidebarMemberRow key={member.agentId || member.name} member={member} />
            ))
          )}
        </div>
      )}
    </div>
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
  const enterCompareMode = useSessionStore((s) => s.enterCompareMode);
  const mcpMode = useSessionStore((s) => s.mcpMode);
  const registeredSessions = useSessionStore((s) => s.registeredSessions);
  const teams = useSessionStore((s) => s.teams);
  const [showEmpty, setShowEmpty] = useState(false);
  const [showTeams, setShowTeams] = useState(true);

  // Consume the scrollToProjectSlug hint set by the ROT leaderboard when the user
  // clicks a project row from the Patterns view. Auto-selects that project and
  // clears the hint so it isn't re-applied on subsequent renders.
  const scrollToProjectSlug = usePatternsStore((s) => s.scrollToProjectSlug);
  const clearScrollToProject = usePatternsStore((s) => s.clearScrollToProject);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (scrollToProjectSlug !== null) {
      void fetchSessions(scrollToProjectSlug);
      clearScrollToProject();
    }
  }, [scrollToProjectSlug, fetchSessions, clearScrollToProject]);

  function handleProjectSelect(slug: string): void {
    void fetchSessions(slug);
  }

  function handleSessionSelect(id: string): void {
    if (!selectedProjectSlug) return;
    void fetchSession(selectedProjectSlug, id);
    onSessionSelect?.();
  }

  function handleCompare(id: string): void {
    if (!selectedProjectSlug) return;
    void enterCompareMode(selectedProjectSlug, id);
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

      {mcpMode && (
        <div
          className="px-3 py-1.5 text-xs shrink-0 flex items-center gap-1.5"
          style={{
            backgroundColor: 'var(--ctp-surface0)',
            borderBottom: '1px solid var(--ctp-surface1)',
            color: 'var(--ctp-teal)',
          }}
          title="MCP mode: showing only sessions registered by active Claude Code processes"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v3l2 2" />
          </svg>
          <span style={{ fontWeight: 600 }}>MCP mode</span>
          <span style={{ color: 'var(--ctp-overlay1)', fontWeight: 400 }}>
            {registeredSessions.length} active {registeredSessions.length === 1 ? 'session' : 'sessions'}
          </span>
        </div>
      )}

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
                {sortedSessions.map((session: SessionSummaryWithProvider) => (
                  <SessionPickerRow
                    key={session.id}
                    session={session}
                    isSelected={session.id === selectedSessionId}
                    onSelect={handleSessionSelect}
                    onCompare={
                      selectedSessionId !== null && session.id !== selectedSessionId
                        ? handleCompare
                        : undefined
                    }
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

      {/* Agent Teams section — global, not per-session */}
      {teams.length > 0 && (
        <div
          className="shrink-0"
          style={{ borderTop: '1px solid var(--ctp-surface0)' }}
        >
          {/* Teams header / toggle */}
          <button
            type="button"
            onClick={() => setShowTeams((v) => !v)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ctp-overlay0)',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            }}
          >
            <TeamIcon size={11} color="var(--ctp-overlay0)" />
            <span className="flex-1 text-left">Agent Teams</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 400,
                color: 'var(--ctp-surface2)',
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {teams.length}
            </span>
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                flexShrink: 0,
                transform: showTeams ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 150ms',
              }}
            >
              <path d="M2 1l4 3-4 3" />
            </svg>
          </button>

          {showTeams && (
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {teams.map((team) => (
                <SidebarTeamRow key={team.name} team={team} />
              ))}
              <div
                className="px-3 py-1.5 text-xs"
                style={{ color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
              >
                Click &quot;filter&quot; on a member to search the waterfall
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
