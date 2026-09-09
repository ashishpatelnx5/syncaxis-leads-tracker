import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchCustomers } from '../api';
import type { Customer } from '../types';
import { formatLocation } from '../utils/format';
import { PageSizeSelect } from '../components/PageSizeSelect';

export function CustomersListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('CompanyName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchCustomers(page, pageSize, q, sortBy, sortDir)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, pageSize, q, sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  function handleSort(column: string) {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
    setPage(1);
  }

  // Called as a plain function (not JSX) so it isn't treated as its own
  // component - defining it as <SortableHeader/> would give React a new
  // component identity every render and remount the <th> each time.
  function sortableHeader(label: string, column: string) {
    const active = sortBy === column;
    return (
      <th key={column} className="sortable-header" onClick={() => handleSort(column)}>
        {label}
        <span className={`sort-indicator${active ? ' active' : ''}`}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
      </th>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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
              {sortableHeader('Company', 'CompanyName')}
              {sortableHeader('Contact', 'ContactPersonName')}
              {sortableHeader('Location', 'City')}
              {sortableHeader('Leads', 'LeadCount')}
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
        <PageSizeSelect value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} />
        <div className="pagination-controls">
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page} of {totalPages} ({total} customers)</span>
          <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
