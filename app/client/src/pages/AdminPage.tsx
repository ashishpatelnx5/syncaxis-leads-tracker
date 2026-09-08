import { useState } from 'react';
import { fetchLeads, deleteLead, searchCustomers, deleteCustomer } from '../api';
import type { Lead, Customer } from '../types';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function AdminPage() {
  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState<Lead[]>([]);
  const [leadSearching, setLeadSearching] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [pendingDeleteLead, setPendingDeleteLead] = useState<Lead | null>(null);

  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [pendingDeleteCustomer, setPendingDeleteCustomer] = useState<Customer | null>(null);

  async function handleLeadSearch(e: React.FormEvent) {
    e.preventDefault();
    setLeadSearching(true);
    setLeadError(null);
    try {
      const res = await fetchLeads({ q: leadQuery, pageSize: 25 });
      setLeadResults(res.items);
    } catch (err: any) {
      setLeadError(err.message);
    } finally {
      setLeadSearching(false);
    }
  }

  async function confirmDeleteLead() {
    if (!pendingDeleteLead) return;
    try {
      await deleteLead(pendingDeleteLead.id);
      setLeadResults((items) => items.filter((l) => l.id !== pendingDeleteLead.id));
      setPendingDeleteLead(null);
    } catch (err: any) {
      setLeadError(err.message);
      setPendingDeleteLead(null);
    }
  }

  async function handleCustomerSearch(e: React.FormEvent) {
    e.preventDefault();
    setCustomerSearching(true);
    setCustomerError(null);
    try {
      const res = await searchCustomers(customerQuery, 25);
      setCustomerResults(res.items);
    } catch (err: any) {
      setCustomerError(err.message);
    } finally {
      setCustomerSearching(false);
    }
  }

  async function confirmDeleteCustomer() {
    if (!pendingDeleteCustomer) return;
    try {
      await deleteCustomer(pendingDeleteCustomer.id);
      setCustomerResults((items) => items.filter((c) => c.id !== pendingDeleteCustomer.id));
      setPendingDeleteCustomer(null);
    } catch (err: any) {
      setCustomerError(err.message);
      setPendingDeleteCustomer(null);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Admin</h1>
      </div>
      <p className="hint-text admin-intro">
        Deleting here is permanent from this UI and can't be undone from the app. Search first,
        confirm you have the right record, then delete.
      </p>

      <section className="detail-section admin-section">
        <h2>Delete a Lead</h2>
        <form className="filter-bar" onSubmit={handleLeadSearch}>
          <input
            type="text"
            className="search-input"
            placeholder="Search company, contact, email, phone, enquiry #..."
            value={leadQuery}
            onChange={(e) => setLeadQuery(e.target.value)}
          />
          <button type="submit" className="btn" disabled={leadSearching}>
            {leadSearching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {leadError && <div className="alert alert-error">{leadError}</div>}

        {leadResults.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Enquiry</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leadResults.map((lead) => (
                  <tr key={lead.id}>
                    <td>{lead.customer.companyName}</td>
                    <td>{lead.enquiryNumber || '-'}</td>
                    <td><StatusBadge status={lead.followUpStatus} /></td>
                    <td><PriorityBadge priority={lead.priority} /></td>
                    <td className="row-actions">
                      <button className="btn-link btn-danger-link" onClick={() => setPendingDeleteLead(lead)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="detail-section admin-section">
        <h2>Delete a Customer</h2>
        <form className="filter-bar" onSubmit={handleCustomerSearch}>
          <input
            type="text"
            className="search-input"
            placeholder="Search company, contact, email, phone, customer code..."
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
          />
          <button type="submit" className="btn" disabled={customerSearching}>
            {customerSearching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {customerError && <div className="alert alert-error">{customerError}</div>}

        {customerResults.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Leads</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customerResults.map((c) => (
                  <tr key={c.id}>
                    <td>{c.companyName}</td>
                    <td>{c.contactPersonName || '-'}</td>
                    <td>{c.leadCount ?? 0}</td>
                    <td className="row-actions">
                      <button className="btn-link btn-danger-link" onClick={() => setPendingDeleteCustomer(c)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pendingDeleteLead && (
        <ConfirmDialog
          title="Delete lead"
          message={`Delete the lead for "${pendingDeleteLead.customer.companyName}" (Enquiry ${pendingDeleteLead.enquiryNumber || '-'})? This cannot be undone from the UI.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteLead}
          onCancel={() => setPendingDeleteLead(null)}
        />
      )}

      {pendingDeleteCustomer && (
        <ConfirmDialog
          title="Delete customer"
          message={`Delete "${pendingDeleteCustomer.companyName}"? This only works if they have no active leads - reassign or delete those first.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteCustomer}
          onCancel={() => setPendingDeleteCustomer(null)}
        />
      )}
    </div>
  );
}
