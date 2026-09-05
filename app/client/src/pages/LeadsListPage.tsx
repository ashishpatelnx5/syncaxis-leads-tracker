import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchLeads, fetchMeta, deleteLead } from '../api';
import type { Lead, MetaResponse } from '../types';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';

const PAGE_SIZE = 25;

// Extra filters that arrive only via a dashboard drill-through link (no dropdown
// control for them) - shown as a "Filtered by" banner with a way to clear them.
function describeSpecialFilter(params: URLSearchParams): string | null {
  if (params.get('overdue') === 'true') return 'Overdue follow-ups';
  if (params.get('followUpDueDays')) return `Follow-ups due in the next ${params.get('followUpDueDays')} days`;
  if (params.get('cardCollected')) return `Card collected: ${params.get('cardCollected')}`;
  if (params.get('inquirySource')) return `Inquiry source: ${params.get('inquirySource')}`;
  if (params.get('productInterest')) return `Product interest: ${params.get('productInterest')}`;
  if (params.get('status') === 'OpenPipeline') return 'Open pipeline (active leads)';
  return null;
}

export function LeadsListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState(searchParams.get('q') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [priority, setPriority] = useState(searchParams.get('priority') || '');
  const [leadType, setLeadType] = useState(searchParams.get('leadType') || '');
  const [assignedTo, setAssignedTo] = useState(searchParams.get('assignedTo') || '');

  // Not user-editable via this page's UI (only arrive via a dashboard link),
  // so these are read straight from the URL each render rather than stored
  // as state - a plain useState with no setter would otherwise go stale if
  // the same page instance is navigated to again with different sort params.
  const sortBy = searchParams.get('sortBy') || 'UpdatedAt';
  const sortDir = (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc';

  const specialFilterLabel = describeSpecialFilter(searchParams);
  const cardCollected = searchParams.get('cardCollected') || undefined;
  const inquirySource = searchParams.get('inquirySource') || undefined;
  const productInterest = searchParams.get('productInterest') || undefined;
  const overdue = searchParams.get('overdue') === 'true' || undefined;
  const followUpDueDays = searchParams.get('followUpDueDays') ? Number(searchParams.get('followUpDueDays')) : undefined;

  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Lead | null>(null);

  useEffect(() => {
    fetchMeta().then(setMeta).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchLeads({
      q, status, priority, leadType, assignedTo,
      cardCollected, inquirySource, productInterest, overdue, followUpDueDays,
      sortBy, sortDir,
      page, pageSize: PAGE_SIZE,
    })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, priority, leadType, assignedTo, cardCollected, inquirySource, productInterest, overdue, followUpDueDays, sortBy, sortDir, page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteLead(pendingDelete.id);
      setPendingDelete(null);
      load();
    } catch (err: any) {
      setError(err.message);
      setPendingDelete(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="page-header">
        <h1>Leads</h1>
        <Link to="/leads/new" className="btn btn-primary">+ Add Lead</Link>
      </div>

      {specialFilterLabel && (
        <div className="filter-banner">
          Filtered by: <strong>{specialFilterLabel}</strong>
          <button className="btn-link" onClick={() => navigate('/leads')}>Clear</button>
        </div>
      )}

      <form className="filter-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          placeholder="Search company, contact, email, phone, enquiry #..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="search-input"
        />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="OpenPipeline">Open Pipeline (Active)</option>
          {meta?.followUpStatus.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
          <option value="">All priorities</option>
          {meta?.priority.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={leadType} onChange={(e) => { setLeadType(e.target.value); setPage(1); }}>
          <option value="">All lead types</option>
          {meta?.leadType.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={assignedTo} onChange={(e) => { setAssignedTo(e.target.value); setPage(1); }}>
          <option value="">All assignees</option>
          {meta?.assignees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button type="submit" className="btn">Search</button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Contact</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Next Follow-up</th>
              <th>Assigned To</th>
              <th>Follow-ups</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="empty-state">Loading...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} className="empty-state">No leads found.</td></tr>
            )}
            {!loading && items.map((lead) => (
              <tr key={lead.id} className="clickable-row" onClick={() => navigate(`/leads/${lead.id}`)}>
                <td>
                  <div className="cell-primary">{lead.customer.companyName}</div>
                  {lead.customer.city && <div className="cell-secondary">{lead.customer.city}{lead.customer.state ? `, ${lead.customer.state}` : ''}</div>}
                </td>
                <td>
                  <div>{lead.customer.contactPersonName || '-'}</div>
                  <div className="cell-secondary">{lead.customer.phone || lead.customer.email || ''}</div>
                </td>
                <td><StatusBadge status={lead.followUpStatus} /></td>
                <td><PriorityBadge priority={lead.priority} /></td>
                <td>{lead.nextFollowUpDate || '-'}</td>
                <td>{lead.enquiryAssignedTo || '-'}</td>
                <td>{lead.followUpCount ?? 0}</td>
                <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <Link to={`/leads/${lead.id}/edit`} className="btn-link">Edit</Link>
                  <button className="btn-link btn-danger-link" onClick={() => setPendingDelete(lead)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span>Page {page} of {totalPages} ({total} leads)</span>
        <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete lead"
          message={`Are you sure you want to delete this lead for "${pendingDelete.customer.companyName}"? This cannot be undone from the UI.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
