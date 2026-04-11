import React, { useEffect } from 'react';

import type { AgentTeam, TeamMember, TeamTask } from '../../shared/types.ts';
import { useSessionStore } from '../store/session-store.ts';
import { CloseIcon } from '../icons/close-icon.tsx';

/** Props for TeamsPanel */
export interface TeamsPanelProps {
  onClose: () => void;
}

/** Single member row in the team listing */
function MemberRow({ member }: { member: TeamMember }): React.ReactElement {
  const setFilter = useSessionStore((s) => s.setFilter);

  function handleFilterClick(): void {
    if (member.agentId) {
      setFilter(member.agentId);
    }
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 text-xs"
      style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
    >
      {/* Agent type badge */}
      <span
        className="shrink-0 px-1.5 py-0.5 rounded"
        style={{
          backgroundColor: 'var(--ctp-surface1)',
          color: 'var(--ctp-blue)',
          fontSize: 10,
          fontFamily: 'ui-monospace, monospace',
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={member.agentType || 'unknown'}
      >
        {member.agentType || 'agent'}
      </span>
      {/* Member name */}
      <span style={{ flex: 1, color: 'var(--ctp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {member.name}
      </span>
      {/* Filter link if agent has an ID */}
      {member.agentId && (
        <button
          type="button"
          onClick={handleFilterClick}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ctp-overlay0)',
            fontSize: 10,
            padding: 0,
          }}
          title={`Filter waterfall to agent ${member.agentId}`}
        >
          filter
        </button>
      )}
    </div>
  );
}

/** Color for a task status dot */
function taskStatusColor(status: string): string {
  if (status === 'completed') return 'var(--ctp-green)';
  if (status === 'in_progress') return 'var(--ctp-yellow)';
  if (status === 'failed') return 'var(--ctp-red)';
  return 'var(--ctp-overlay0)';
}

/** Single task row in the task list */
function TaskRow({ task }: { task: TeamTask }): React.ReactElement {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1 text-xs"
      style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', paddingLeft: 20 }}
    >
      {/* Status dot */}
      <span
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          flexShrink: 0,
          backgroundColor: taskStatusColor(task.status),
        }}
        title={task.status}
      />
      {/* Subject */}
      <span
        style={{
          flex: 1,
          color: 'var(--ctp-subtext1)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 10,
        }}
        title={task.assignedTo ? `Assigned to: ${task.assignedTo}` : undefined}
      >
        {task.subject}
      </span>
    </div>
  );
}

/** Single team section */
function TeamSection({ team }: { team: AgentTeam }): React.ReactElement {
  return (
    <div style={{ borderBottom: '1px solid var(--ctp-surface0)' }}>
      {/* Team header */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ backgroundColor: 'var(--ctp-surface0)' }}
      >
        <span
          className="text-xs font-semibold"
          style={{ color: 'var(--ctp-text)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          {team.name}
        </span>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ctp-subtext0)' }}>
          <span>{team.members.length} member{team.members.length === 1 ? '' : 's'}</span>
          {team.taskCount > 0 && (
            <span style={{ color: 'var(--ctp-overlay0)' }}>
              {team.taskCount} task{team.taskCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
      {/* Member list */}
      {team.members.length === 0 ? (
        <div
          className="px-3 py-2 text-xs"
          style={{ color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          No members configured
        </div>
      ) : (
        team.members.map((member) => (
          <MemberRow key={member.agentId || member.name} member={member} />
        ))
      )}
      {/* Task list */}
      {team.tasks.length > 0 && (
        <div style={{ borderTop: '1px solid var(--ctp-surface0)' }}>
          <div
            className="px-3 py-1"
            style={{ color: 'var(--ctp-overlay0)', fontSize: 9, fontFamily: 'ui-sans-serif, system-ui, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Tasks
          </div>
          {team.tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Flyout panel showing Agent Teams detected in ~/.claude/teams/.
 * Lists each team, its members, and task count.
 */
export function TeamsPanel({ onClose }: TeamsPanelProps): React.ReactElement {
  const teams = useSessionStore((s) => s.teams);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="absolute right-0 top-8 z-50 rounded overflow-hidden shadow-xl"
      style={{
        backgroundColor: 'var(--ctp-mantle)',
        border: '1px solid var(--ctp-surface0)',
        width: 300,
        maxHeight: 400,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--ctp-surface0)' }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          Agent Teams
        </span>
        <button type="button" onClick={onClose} style={{ color: 'var(--ctp-overlay0)' }}>
          <CloseIcon size={14} />
        </button>
      </div>

      {/* Teams list */}
      {teams.length === 0 ? (
        <div
          className="px-3 py-4 text-xs text-center"
          style={{ color: 'var(--ctp-overlay0)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          No teams found in ~/.claude/teams/
        </div>
      ) : (
        teams.map((team) => (
          <TeamSection key={team.name} team={team} />
        ))
      )}

      {/* Footer hint */}
      {teams.length > 0 && (
        <div
          className="px-3 py-2 text-xs"
          style={{
            borderTop: '1px solid var(--ctp-surface0)',
            color: 'var(--ctp-overlay0)',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          Click &quot;filter&quot; on a member to search the waterfall
        </div>
      )}
    </div>
  );
}
