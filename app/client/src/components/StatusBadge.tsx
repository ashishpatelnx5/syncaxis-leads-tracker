import type { FollowUpStatus, Priority } from '../types';

export function StatusBadge({ status }: { status: FollowUpStatus }) {
  return <span className={`badge status-${status.replace(/\s+/g, '-').toLowerCase()}`}>{status}</span>;
}

const PRIORITY_ICON: Record<Priority, string> = {
  Hot: '\u{1F525}',
  Warm: '\u{1F324}',
  Cold: '❄️',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`badge priority-${priority.toLowerCase()}`}>
      {PRIORITY_ICON[priority]} {priority}
    </span>
  );
}
