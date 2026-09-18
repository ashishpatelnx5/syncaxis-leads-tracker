import { Fragment, useCallback, useEffect, useState } from 'react';
import { fetchAuditLog, fetchAuditLogActions } from '../api';
import type { AuditLogEntry } from '../types';
import { PageSizeSelect } from '../components/PageSizeSelect';
import { formatDateTime } from '../utils/format';

const ENTITY_TYPES = ['Lead', 'Customer', 'Followup', 'Attachment'];

// A `{changes: {field: {old, new}}}` diff (from an update) renders as a
// compact "field: old -> new" list; anything else (a create/delete snapshot,
// an auth event, a denied-permission attempt) falls back to a flat key:
// value list, one level deep - good enough for every shape this app writes,
// without needing a full recursive JSON tree view.
function DetailsView({ details }: { details: unknown }) {
  if (details === null || details === undefined) return <span className="hint-text">No details recorded.</span>;
  if (typeof details !== 'object') return <span>{String(details)}</span>;

  const obj = details as Record<string, unknown>;
  if (obj.changes && typeof obj.changes === 'object') {
    const changes = obj.changes as Record<string, { old: unknown; new: unknown }>;
    const fields = Object.keys(changes);
    if (!fields.length) return <span className="hint-text">No fields changed.</span>;
    return (
      <table className="audit-details-table">
        <thead>
          <tr><th>Field</th><th>Old value</th><th>New value</th></tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field}>
              <td>{field}</td>
              <td>{formatDetailValue(changes[field].old)}</td>
              <td>{formatDetailValue(changes[field].new)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const entries = Object.entries(obj);
  if (!entries.length) return <span className="hint-text">No details recorded.</span>;
  return (
    <table className="audit-details-table">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <td className="audit-details-key">{key}</td>
            <td>{formatDetailValue(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function AuditLogPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [q, setQ] = useState('');
  const [username, setUsername] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [success, setSuccess] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [actions, setActions] = useState<string[]>([]);

  useEffect(() => {
    fetchAuditLogActions().then(setActions).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAuditLog({
      q: q || undefined,
      username: username || undefined,
      action: action || undefined,
      entityType: entityType || undefined,
      success: success === '' ? undefined : success === 'true',
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize,
    })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, username, action, entityType, success, dateFrom, dateTo, page, pageSize]);

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
    setUsername('');
    setAction('');
    setEntityType('');
    setSuccess('');
    setDateFrom('');
    setDateTo('');
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

      <form className="filter-bar audit-filter-bar" onSubmit={handleFilterSubmit}>
        <input type="text" placeholder="Search (user, action, details)..." value={q} onChange={(e) => setQ(e.target.value)} className="search-input" />
        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All entity types</option>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={success} onChange={(e) => setSuccess(e.target.value)}>
          <option value="">Success or failed</option>
          <option value="true">Success only</option>
          <option value="false">Failed only</option>
        </select>
        <label className="audit-date-field">
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="audit-date-field">
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <button type="submit" className="btn">Search</button>
        <button type="button" className="btn" onClick={clearFilters}>Clear</button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Result</th>
              <th>IP</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty-state">Loading...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={7} className="empty-state">No audit log entries found.</td></tr>}
            {!loading && items.map((entry) => (
              <Fragment key={entry.id}>
                <tr className="clickable-row" onClick={() => setExpandedId((id) => (id === entry.id ? null : entry.id))}>
                  <td>{formatDateTime(entry.createdAt)}</td>
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
                  <td className="btn-link">{expandedId === entry.id ? 'Hide' : 'Details'}</td>
                </tr>
                {expandedId === entry.id && (
                  <tr>
                    <td colSpan={7} className="audit-details-row">
                      <DetailsView details={entry.details} />
                    </td>
                  </tr>
                )}
              </Fragment>
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
