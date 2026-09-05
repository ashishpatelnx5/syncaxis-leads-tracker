import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchCustomers } from '../api';
import type { Customer } from '../types';
import { formatLocation } from '../utils/format';

const PAGE_SIZE = 25;

export function CustomersListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [page, q]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="page-header">
        <h1>Customers</h1>
        <Link to="/customers/new" className="btn btn-primary">+ Add Customer</Link>
      </div>

      <form className="filter-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          placeholder="Search company, contact, email, phone, customer code..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="search-input"
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
              <th>Location</th>
              <th>Leads</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="empty-state">Loading...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={4} className="empty-state">No customers found.</td></tr>}
            {!loading && items.map((c) => (
              <tr key={c.id} className="clickable-row" onClick={() => navigate(`/customers/${c.id}`)}>
                <td>
                  <div className="cell-primary">{c.companyName}</div>
                  {c.customerCode && <div className="cell-secondary">{c.customerCode}</div>}
                </td>
                <td>
                  <div>{c.contactPersonName || '-'}</div>
                  <div className="cell-secondary">{c.phone || c.email || ''}</div>
                </td>
                <td>{formatLocation(c) || '-'}</td>
                <td>{c.leadCount ?? 0}</td>
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
    </div>
  );
}
