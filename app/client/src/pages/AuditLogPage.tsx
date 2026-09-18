import { useCallback, useEffect, useState } from 'react';
import { fetchAuditLog } from '../api';
import type { AuditLogEntry } from '../types';
import { PageSizeSelect } from '../components/PageSizeSelect';
import { formatDateTime } from '../utils/format';

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Condenses an entry's details into one line: a `{changes: {field: {old,
// new}}}` diff (from an update) reads as "field: old -> new" pairs;
// anything else (a create/delete snapshot, an auth event, a denied-
// permission attempt) falls back to a flat "key: value" list, one level
// deep. Long lines are ellipsized in the table (see .audit-details-cell)
// with the full text still available via the native title tooltip.
function formatDetailsLine(details: unknown): string {
  if (details === null || details === undefined) return '-';
  if (typeof details !== 'object') return String(details);

  const obj = details as Record<string, unknown>;
  if (obj.changes && typeof obj.changes === 'object') {
    const changes = obj.changes as Record<string, { old: unknown; new: unknown }>;
    const parts = Object.entries(changes).map(([field, { old, new: next }]) => `${field}: ${formatValue(old)} → ${formatValue(next)}`);
    return parts.length ? parts.join('; ') : 'No fields changed';
  }

  const parts = Object.entries(obj).map(([key, value]) => `${key}: ${formatValue(value)}`);
  return parts.length ? parts.join(', ') : '-';
}

export function AuditLogPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAuditLog({ q: q || undefined, page, pageSize })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  function clearFilters() {
    setQ('');
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="page">
      <div className="page-header">
        <h1>Admin &middot; Audit Log</h1>
      </div>

      <p className="hint-text admin-intro">
        Every tracked action across the app - logins, permission denials, and every create/update/delete
        on leads, customers, follow-ups, and attachments.
      </p>

      <form className="filter-bar" onSubmit={handleFilterSubmit}>
        <input
          type="text"
          placeholder="Search user, action, entity, IP, or details..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="search-input"
        />
        <button type="submit" className="btn">Search</button>
        <button type="button" className="btn" onClick={clearFilters}>Clear</button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="audit-log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Result</th>
              <th>IP</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty-state">Loading...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={7} className="empty-state">No audit log entries found.</td></tr>}
            {!loading && items.map((entry) => (
              <tr key={entry.id}>
                <td className="audit-time-cell">{formatDateTime(entry.createdAt)}</td>
                <td>
                  <div className="cell-primary">{entry.displayName || entry.username || '-'}</div>
                  {entry.username && entry.displayName && <div className="cell-secondary">{entry.username}</div>}
                </td>
                <td>{entry.action}</td>
                <td>{entry.entityType ? `${entry.entityType} #${entry.entityId}` : '-'}</td>
                <td>
                  <span className={`badge ${entry.success ? 'status-won' : 'status-lost'}`}>
                    {entry.success ? 'Success' : 'Failed'}
                  </span>
                </td>
                <td>{entry.ipAddress || '-'}</td>
                <td className="audit-details-cell" title={formatDetailsLine(entry.details)}>{formatDetailsLine(entry.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <PageSizeSelect value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} />
        <div className="pagination-controls">
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page} of {totalPages} ({total} entries)</span>
          <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
