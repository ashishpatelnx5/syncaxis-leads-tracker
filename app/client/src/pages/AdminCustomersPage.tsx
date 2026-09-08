import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchCustomers, deleteCustomer } from '../api';
import type { Customer } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AdminTabs } from '../components/AdminTabs';

const PAGE_SIZE = 25;

export function AdminCustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchCustomers(page, PAGE_SIZE, q)
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
      await deleteCustomer(pendingDelete.id);
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
        Deleting here is permanent from this UI and can't be undone from the app. A customer
        with active leads can't be deleted - reassign or delete those leads first.
      </p>

      <form className="filter-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          className="search-input"
          placeholder="Search company, contact, email, phone, customer code..."
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
              <th>Contact</th>
              <th>Customer Code</th>
              <th>Leads</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="empty-state">Loading...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={5} className="empty-state">No customers found.</td></tr>}
            {!loading && items.map((c) => (
              <tr key={c.id}>
                <td className="cell-primary">{c.companyName}</td>
                <td>
                  <div>{c.contactPersonName || '-'}</div>
                  <div className="cell-secondary">{c.phone || c.email || ''}</div>
                </td>
                <td>{c.customerCode || '-'}</td>
                <td>{c.leadCount ?? 0}</td>
                <td className="row-actions">
                  <Link to={`/customers/${c.id}/edit`} className="btn-link">Edit</Link>
                  <button className="btn-link btn-danger-link" onClick={() => setPendingDelete(c)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span>Page {page} of {totalPages} ({total} customers)</span>
        <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete customer"
          message={`Delete "${pendingDelete.companyName}"? This only works if they have no active leads - reassign or delete those first.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
