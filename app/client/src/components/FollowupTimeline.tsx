import type { Followup } from '../types';

export function FollowupTimeline({
  followups,
  onDelete,
  canDelete,
}: {
  followups: Followup[];
  onDelete: (id: number) => void;
  canDelete: boolean;
}) {
  if (!followups.length) {
    return <p className="empty-state">No follow-ups logged yet.</p>;
  }

  return (
    <ul className="timeline">
      {followups.map((f) => (
        <li key={f.id} className="timeline-item">
          <div className="timeline-header">
            <span className="timeline-date">{f.followUpDate}</span>
            {f.followUpBy && <span className="timeline-by">{f.followUpBy}</span>}
            {canDelete && (
              <button className="btn-link btn-danger-link" onClick={() => onDelete(f.id)}>
                Delete
              </button>
            )}
          </div>
          {f.note && <p className="timeline-note">{f.note}</p>}
        </li>
      ))}
    </ul>
  );
}
