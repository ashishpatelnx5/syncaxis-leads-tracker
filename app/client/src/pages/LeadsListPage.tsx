import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchLeads, fetchMeta, exportLeads } from '../api';
import type { Lead, MetaResponse } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { PageSizeSelect } from '../components/PageSizeSelect';
import { formatInr } from '../utils/format';

// Extra filters that arrive only via a dashboard drill-through link (no dropdown
// control for them) - shown as a "Filtered by" banner with a way to clear them.
function describeSpecialFilter(params: URLSearchParams): string | null {
  if (params.get('overdue') === 'true') return 'Overdue follow-ups';
  if (params.get('followUpDueDays')) return `Follow-ups due in the next ${params.get('followUpDueDays')} days`;
  if (params.get('cardCollected')) return `Card collected: ${params.get('cardCollected')}`;
  if (params.get('inquirySource')) return `Inquiry source: ${params.get('inquirySource')}`;
  if (params.get('status') === 'OpenPipeline') return 'Open pipeline (active leads)';
  return null;
}

export function LeadsListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState(searchParams.get('q') || '');
  const [productInterest, setProductInterest] = useState(searchParams.get('productInterest') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [priority, setPriority] = useState(searchParams.get('priority') || '');
  const [leadType, setLeadType] = useState(searchParams.get('leadType') || '');
  const [assignedTo, setAssignedTo] = useState(searchParams.get('assignedTo') || '');
  const [leadGeneratedBy, setLeadGeneratedBy] = useState(searchParams.get('leadGeneratedBy') || '');

  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'UpdatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>((searchParams.get('sortDir') as 'asc' | 'desc') || 'desc');

  const specialFilterLabel = describeSpecialFilter(searchParams);
  const cardCollected = searchParams.get('cardCollected') || undefined;
  const inquirySource = searchParams.get('inquirySource') || undefined;
  const overdue = searchParams.get('overdue') === 'true' || undefined;
  const followUpDueDays = searchParams.get('followUpDueDays') ? Number(searchParams.get('followUpDueDays')) : undefined;

  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchMeta().then(setMeta).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchLeads({
      q, status, priority, leadType, assignedTo, leadGeneratedBy,
      cardCollected, inquirySource, productInterest, overdue, followUpDueDays,
      sortBy, sortDir,
      page, pageSize,
    })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, priority, leadType, assignedTo, leadGeneratedBy, cardCollected, inquirySource, productInterest, overdue, followUpDueDays, sortBy, sortDir, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await exportLeads({
        q, status, priority, leadType, assignedTo, leadGeneratedBy,
        cardCollected, inquirySource, productInterest, overdue, followUpDueDays,
        sortBy, sortDir,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
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
        <h1>Leads</h1>
        <div className="page-header-actions">
          <button className="btn" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : '⬇ Export to Excel'}
          </button>
          <Link to="/leads/new" className="btn btn-primary">+ Add Lead</Link>
        </div>
      </div>

      {specialFilterLabel && (
        <div className="filter-banner">
          Filtered by: <strong>{specialFilterLabel}</strong>
          <button className="btn-link" onClick={() => navigate('/leads')}>Clear</button>
        </div>
      )}

      <form className="filter-bar filter-bar-stacked" onSubmit={handleSearchSubmit}>
        <div className="filter-row">
          <input
            type="text"
            placeholder="Search company, contact, email, phone, enquiry #..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="search-input"
          />
          <button type="submit" className="btn">Search</button>
        </div>
        <div className="filter-row">
          <select value={productInterest} onChange={(e) => { setProductInterest(e.target.value); setPage(1); }}>
            <option value="">All product interests</option>
            {meta?.productInterests.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
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
          <select value={leadGeneratedBy} onChange={(e) => { setLeadGeneratedBy(e.target.value); setPage(1); }}>
            <option value="">All generated by</option>
            {meta?.generators.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={assignedTo} onChange={(e) => { setAssignedTo(e.target.value); setPage(1); }}>
            <option value="">All assignees</option>
            {meta?.assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {sortableHeader('Enquiry No', 'EnquiryNumber')}
              {sortableHeader('Company Name', 'CompanyName')}
              {sortableHeader('Status', 'FollowUpStatus')}
              {sortableHeader('Lead Details', 'ProductInterest')}
              {sortableHeader('Application Detail', 'ApplicationDetail')}
              {sortableHeader('Lead Value', 'LeadValue')}
              {sortableHeader('Generated By', 'LeadGeneratedBy')}
              {sortableHeader('Assigned To', 'EnquiryAssignedTo')}
              {sortableHeader('Next Follow-up', 'NextFollowUpDate')}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} className="empty-state">Loading...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={10} className="empty-state">No leads found.</td></tr>
            )}
            {!loading && items.map((lead) => (
              <tr key={lead.id} className="clickable-row" onClick={() => navigate(`/leads/${lead.id}`)}>
                <td>{lead.enquiryNumber || '-'}</td>
                <td>
                  <div className="cell-primary">{lead.customer.companyName}</div>
                  {lead.customer.city && <div className="cell-secondary">{lead.customer.city}{lead.customer.state ? `, ${lead.customer.state}` : ''}</div>}
                </td>
                <td><StatusBadge status={lead.followUpStatus} /></td>
                <td>{lead.productInterest || '-'}</td>
                <td>{lead.applicationDetail || '-'}</td>
                <td>{lead.leadValue !== null ? formatInr(lead.leadValue) : '-'}</td>
                <td>{lead.leadGeneratedBy || '-'}</td>
                <td>{lead.enquiryAssignedTo || '-'}</td>
                <td>{lead.nextFollowUpDate || '-'}</td>
                <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <Link to={`/leads/${lead.id}/edit`} className="btn-link">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <PageSizeSelect value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} />
        <div className="pagination-controls">
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page} of {totalPages} ({total} leads)</span>
          <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
