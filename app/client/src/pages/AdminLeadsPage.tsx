import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchLeads, deleteLead } from '../api';
import type { Lead } from '../types';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AdminTabs } from '../components/AdminTabs';

const PAGE_SIZE = 25;

export function AdminLeadsPage() {
  const [items, setItems] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Lead | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchLeads({ q, page, pageSize: PAGE_SIZE })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  async function confirmDelete() {
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
        <h1>Admin</h1>
      </div>

      <AdminTabs />

      <p className="hint-text admin-intro">
        Deleting here is permanent from this UI and can't be undone from the app.
      </p>

      <form className="filter-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          className="search-input"
          placeholder="Search company, contact, email, phone, enquiry #..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn">Search</button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Enquiry</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Assigned To</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty-state">Loading...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={6} className="empty-state">No leads found.</td></tr>}
            {!loading && items.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <div className="cell-primary">{lead.customer.companyName}</div>
                  {lead.customer.city && <div className="cell-secondary">{lead.customer.city}{lead.customer.state ? `, ${lead.customer.state}` : ''}</div>}
                </td>
                <td>{lead.enquiryNumber || '-'}</td>
                <td><StatusBadge status={lead.followUpStatus} /></td>
                <td><PriorityBadge priority={lead.priority} /></td>
                <td>{lead.enquiryAssignedTo || '-'}</td>
                <td className="row-actions">
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
          message={`Delete the lead for "${pendingDelete.customer.companyName}" (Enquiry ${pendingDelete.enquiryNumber || '-'})? This cannot be undone from the UI.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
