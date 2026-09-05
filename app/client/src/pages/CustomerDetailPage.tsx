import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchCustomer } from '../api';
import type { Customer, Lead } from '../types';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { Field } from '../components/Field';
import { formatLocation } from '../utils/format';

export function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = Number(id);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomer(customerId)
      .then((res) => {
        setCustomer(res.customer);
        setLeads(res.leads);
      })
      .catch((err) => setError(err.message));
  }, [customerId]);

  if (error && !customer) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!customer) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link to="/customers" className="btn-link">&larr; Back to customers</Link>
          <h1>{customer.companyName}</h1>
        </div>
        <div className="page-header-actions">
          <Link to={`/leads/new?customerId=${customer.id}`} className="btn btn-primary">+ Add Lead</Link>
          <Link to={`/customers/${customer.id}/edit`} className="btn">Edit</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="detail-grid">
        <section className="detail-section">
          <h2>Contact</h2>
          <Field label="Customer Code" value={customer.customerCode} />
          <Field label="Department" value={customer.department} />
          <Field label="Contact Person" value={customer.contactPersonName} />
          <Field label="Email" value={customer.email && <a href={`mailto:${customer.email}`}>{customer.email}</a>} />
          <Field label="Phone" value={customer.phone && <a href={`tel:${customer.phone}`}>{customer.phone}</a>} />
          <Field label="Location" value={formatLocation(customer)} />
        </section>
      </div>

      <section className="followup-section">
        <h2>Leads ({leads.length})</h2>
        {leads.length === 0 && <p className="empty-state">No leads for this customer yet.</p>}
        {leads.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Enquiry</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Next Follow-up</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td><Link to={`/leads/${lead.id}`}>{lead.enquiryNumber || `Lead #${lead.id}`}</Link></td>
                    <td><StatusBadge status={lead.followUpStatus} /></td>
                    <td><PriorityBadge priority={lead.priority} /></td>
                    <td>{lead.nextFollowUpDate || '-'}</td>
                    <td>{lead.updatedAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
