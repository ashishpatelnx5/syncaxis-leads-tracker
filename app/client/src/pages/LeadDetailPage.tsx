import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchLead, addFollowup, deleteFollowup, deleteLead, fetchMeta } from '../api';
import type { Lead, Followup, Attachment, MetaResponse } from '../types';
import { StatusBadge, PriorityBadge, ProductBadge } from '../components/StatusBadge';
import { FollowupTimeline } from '../components/FollowupTimeline';
import { AttachmentsSection } from '../components/AttachmentsSection';
import { Field } from '../components/Field';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatInr, formatLocation } from '../utils/format';
import { useAuth } from '../auth/AuthContext';
import { LEADS_PERM } from '../permissions';

export function LeadDetailPage() {
  const { id } = useParams();
  const leadId = Number(id);
  const navigate = useNavigate();
  const { can } = useAuth();
  const canUpdate = can(LEADS_PERM.LEADS_UPDATE);

  const [lead, setLead] = useState<Lead | null>(null);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [fuDate, setFuDate] = useState(new Date().toISOString().slice(0, 10));
  const [fuNote, setFuNote] = useState('');
  const [fuNewStatus, setFuNewStatus] = useState('');
  const [fuNextDate, setFuNextDate] = useState('');
  const [submittingFollowup, setSubmittingFollowup] = useState(false);

  const load = useCallback(() => {
    fetchLead(leadId)
      .then(({ lead, followups, attachments }) => {
        setLead(lead);
        setFollowups(followups);
        setAttachments(attachments);
        setFuNextDate(lead.nextFollowUpDate || '');
      })
      .catch((err) => setError(err.message));
  }, [leadId]);

  useEffect(() => {
    load();
    fetchMeta().then(setMeta).catch(() => {});
  }, [load]);

  async function handleAddFollowup(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingFollowup(true);
    setError(null);
    try {
      await addFollowup(leadId, {
        followUpDate: fuDate,
        note: fuNote || undefined,
        newStatus: fuNewStatus || undefined,
        nextFollowUpDate: fuNextDate || undefined,
      });
      setFuNote('');
      setFuNewStatus('');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingFollowup(false);
    }
  }

  async function handleDeleteFollowup(followupId: number) {
    try {
      await deleteFollowup(followupId);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteLead(leadId);
      navigate('/leads');
    } catch (err: any) {
      setError(err.message);
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (error && !lead) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!lead) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link to="/" className="btn-link">&larr; Back to leads</Link>
          <h1>{lead.customer.companyName}</h1>
          <Link to={`/customers/${lead.customer.id}`} className="btn-link">View customer &amp; all their leads</Link>
          <div className="badge-row">
            <StatusBadge status={lead.followUpStatus} />
            <PriorityBadge priority={lead.priority} />
          </div>
        </div>
        <div className="page-header-actions">
          {canUpdate && <Link to={`/leads/${lead.id}/edit`} className="btn btn-primary">Edit</Link>}
          {can(LEADS_PERM.LEADS_DELETE) && <button className="btn btn-danger" onClick={() => setConfirmingDelete(true)}>Delete</button>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="detail-grid">
        <section className="detail-section">
          <h2>Company &amp; Contact</h2>
          <Field label="GSTIN" value={lead.customer.gstin} />
          <Field label="Department" value={lead.customer.department} />
          <Field label="Contact Person" value={lead.customer.contactPersonName} />
          <Field label="Email" value={lead.customer.email && <a href={`mailto:${lead.customer.email}`}>{lead.customer.email}</a>} />
          <Field label="Phone" value={lead.customer.phone && <a href={`tel:${lead.customer.phone}`}>{lead.customer.phone}</a>} />
          <Field label="Card Collected" value={lead.cardCollected} />
          <Field label="Address" value={lead.customer.address} />
          <Field label="Location" value={formatLocation(lead.customer)} />
        </section>

        <section className="detail-section">
          <h2>Inquiry</h2>
          <Field label="Inquiry Number" value={lead.inquiryNumber} />
          <Field label="Customer Code" value={lead.customer.customerCode} />
          <Field label="Application Category" value={lead.applicationCategory} />
          <Field label="Product Interest" value={lead.productInterest ? <ProductBadge product={lead.productInterest} /> : null} />
          <Field label="Inquiry Source" value={lead.inquirySource} />
          <Field label="Lead Type" value={lead.leadType} />
          <Field label="Lead Value" value={lead.leadValue !== null ? formatInr(lead.leadValue) : null} />
          <Field label="Moved to SourcePro" value={lead.movedToSourcePro ? 'Yes' : 'No'} />
        </section>

        <section className="detail-section">
          <h2>Ownership &amp; Timeline</h2>
          <Field label="Lead Generated By" value={lead.leadGeneratedBy} />
          <Field label="Inquiry Assigned To" value={lead.inquiryAssignedTo} />
          <Field label="Last Updated By" value={lead.updatedBy} />
          <Field label="Next Follow-up Date" value={lead.nextFollowUpDate} />
          <Field label="Received Date" value={lead.receivedDate} />
          <Field label="Follow-ups Logged" value={followups.length} />
        </section>

        <section className="detail-section">
          <h2>Order &amp; ERP</h2>
          <Field label="ERP Lead Number" value={lead.erpLeadNumber} />
          <Field label="Order No" value={lead.orderNo} />
          <Field label="Order Date" value={lead.orderDate} />
        </section>

        {lead.applicationDetail && (
          <section className="detail-section detail-section-wide">
            <h2>Application Detail</h2>
            <p className="notes-text">{lead.applicationDetail}</p>
          </section>
        )}

        {lead.notes && (
          <section className="detail-section detail-section-wide">
            <h2>Notes</h2>
            <p className="notes-text">{lead.notes}</p>
          </section>
        )}
      </div>

      <AttachmentsSection leadId={lead.id} attachments={attachments} onChanged={load} canManage={canUpdate} />

      <section className="followup-section">
        <h2>Follow-up History</h2>
        <FollowupTimeline followups={followups} onDelete={handleDeleteFollowup} canDelete={canUpdate} />

        {canUpdate && (
          <form className="followup-form" onSubmit={handleAddFollowup}>
            <h3>Log a Follow-up</h3>
            <div className="form-grid">
              <label>
                Date *
                <input type="date" required value={fuDate} onChange={(e) => setFuDate(e.target.value)} />
              </label>
              <label>
                Update status to
                <select value={fuNewStatus} onChange={(e) => setFuNewStatus(e.target.value)}>
                  <option value="">(keep current: {lead.followUpStatus})</option>
                  {meta?.followUpStatus.filter((s) => s !== lead.followUpStatus).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Next follow-up date
                <input type="date" value={fuNextDate} onChange={(e) => setFuNextDate(e.target.value)} />
              </label>
            </div>
            <label>
              Notes
              <textarea rows={3} value={fuNote} onChange={(e) => setFuNote(e.target.value)} placeholder="What happened on this follow-up?" />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={submittingFollowup}>
                {submittingFollowup ? 'Saving...' : 'Add Follow-up'}
              </button>
            </div>
          </form>
        )}
      </section>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete lead"
          message={`Delete the lead for "${lead.customer.companyName}" (Inquiry ${lead.inquiryNumber || '-'})? This cannot be undone from the UI.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete'}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
