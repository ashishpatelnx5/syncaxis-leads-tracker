import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createLead, updateLead, fetchLead, fetchMeta, fetchCustomer } from '../api';
import type { Lead, MetaResponse, Customer } from '../types';
import { CustomerPicker } from '../components/CustomerPicker';
import { Field } from '../components/Field';
import { formatLocation } from '../utils/format';

type LeadFormState = Partial<Lead>;

const EMPTY_LEAD: LeadFormState = {
  cardCollected: 'Not Recorded',
  followUpStatus: 'Not Contacted',
  priority: 'Warm',
  leadType: 'Other',
  movedToSourcePro: false,
};

export function LeadFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCustomerId = searchParams.get('customerId');

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [leadForm, setLeadForm] = useState<LeadFormState>(EMPTY_LEAD);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMeta().then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) {
      fetchLead(Number(id))
        .then(({ lead }) => {
          setLeadForm(lead);
          setSelectedCustomer(lead.customer);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    } else if (preselectedCustomerId) {
      fetchCustomer(Number(preselectedCustomerId))
        .then(({ customer }) => setSelectedCustomer(customer))
        .catch((err) => setError(err.message));
    }
  }, [id, isEdit, preselectedCustomerId]);

  function setLead<K extends keyof LeadFormState>(key: K, value: LeadFormState[K]) {
    setLeadForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer) {
      setError('Select a customer first (or create one if they\'re not in the system yet)');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { customerId: selectedCustomer.id, ...leadForm };
      if (isEdit) {
        await updateLead(Number(id), payload);
        navigate(`/leads/${id}`);
      } else {
        const created = await createLead(payload);
        navigate(`/leads/${created.id}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isEdit ? 'Edit Lead' : 'Add Lead'}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form className="lead-form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Customer</legend>
          <CustomerPicker selectedCustomer={selectedCustomer} onSelect={setSelectedCustomer} onClear={() => setSelectedCustomer(null)} />

          {selectedCustomer && (
            <div className="customer-readonly">
              <Field label="Customer Code" value={selectedCustomer.customerCode} />
              <Field label="Department" value={selectedCustomer.department} />
              <Field label="Contact Person" value={selectedCustomer.contactPersonName} />
              <Field label="Email" value={selectedCustomer.email} />
              <Field label="Phone" value={selectedCustomer.phone} />
              <Field label="GSTIN" value={selectedCustomer.gstin} />
              <Field label="Location" value={formatLocation(selectedCustomer)} />
              <Link to={`/customers/${selectedCustomer.id}/edit`} className="btn-link" target="_blank" rel="noopener noreferrer">
                Edit customer details ↗
              </Link>
            </div>
          )}

          {!selectedCustomer && (
            <p className="hint-text">
              Customer not found?{' '}
              <Link to="/customers/new" target="_blank" rel="noopener noreferrer">
                <strong>+ Create a new customer</strong>
              </Link>{' '}
              (opens in a new tab), then come back and search for them above.
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend>Enquiry Details</legend>
          <div className="form-grid form-grid-2col">
            <label className="field-narrow">
              Enquiry Number
              <input
                disabled
                value={leadForm.enquiryNumber || ''}
                placeholder="Auto-generated on save"
                title="System-assigned - can't be changed"
              />
            </label>
            <label>
              Card Collected
              <select value={leadForm.cardCollected} onChange={(e) => setLead('cardCollected', e.target.value as any)}>
                {(meta?.cardCollected || ['Not Recorded']).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>
              Application Category
              <input list="applicationCategories" value={leadForm.applicationCategory || ''} onChange={(e) => setLead('applicationCategory', e.target.value)} />
              <datalist id="applicationCategories">
                {meta?.applicationCategories.map((v) => <option key={v} value={v} />)}
              </datalist>
            </label>
            <label>
              Application (detail)
              <input value={leadForm.applicationDetail || ''} onChange={(e) => setLead('applicationDetail', e.target.value)} />
            </label>
            <label>
              Product Interest
              <input list="productInterests" value={leadForm.productInterest || ''} onChange={(e) => setLead('productInterest', e.target.value)} />
              <datalist id="productInterests">
                {meta?.productInterests.map((v) => <option key={v} value={v} />)}
              </datalist>
            </label>
            <label>
              Inquiry Source
              <input list="inquirySources" value={leadForm.inquirySource || ''} onChange={(e) => setLead('inquirySource', e.target.value)} />
              <datalist id="inquirySources">
                {meta?.inquirySources.map((v) => <option key={v} value={v} />)}
              </datalist>
            </label>
            <label>
              Lead Type
              <select value={leadForm.leadType} onChange={(e) => setLead('leadType', e.target.value as any)}>
                {(meta?.leadType || ['Other']).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>
              Lead Value
              <input type="number" step="0.01" value={leadForm.leadValue ?? ''} onChange={(e) => setLead('leadValue', e.target.value ? Number(e.target.value) : null)} />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={!!leadForm.movedToSourcePro} onChange={(e) => setLead('movedToSourcePro', e.target.checked)} />
              Moved to SourcePro
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Ownership &amp; Status</legend>
          <div className="form-grid form-grid-2col">
            <label>
              Lead Generated By
              <input list="generators" value={leadForm.leadGeneratedBy || ''} onChange={(e) => setLead('leadGeneratedBy', e.target.value)} />
              <datalist id="generators">
                {meta?.generators.map((v) => <option key={v} value={v} />)}
              </datalist>
            </label>
            <label>
              Enquiry Assigned To
              <input list="assignees" value={leadForm.enquiryAssignedTo || ''} onChange={(e) => setLead('enquiryAssignedTo', e.target.value)} />
              <datalist id="assignees">
                {meta?.assignees.map((v) => <option key={v} value={v} />)}
              </datalist>
            </label>
            <label>
              Follow-Up Status
              <select value={leadForm.followUpStatus} onChange={(e) => setLead('followUpStatus', e.target.value as any)}>
                {(meta?.followUpStatus || ['Not Contacted']).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>
              Priority
              <select value={leadForm.priority} onChange={(e) => setLead('priority', e.target.value as any)}>
                {(meta?.priority || ['Warm']).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>
              Next Follow-up Date
              <input type="date" value={leadForm.nextFollowUpDate || ''} onChange={(e) => setLead('nextFollowUpDate', e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Order &amp; ERP</legend>
          <div className="form-grid form-grid-2col">
            <label>
              ERP Lead Number
              <input value={leadForm.erpLeadNumber || ''} onChange={(e) => setLead('erpLeadNumber', e.target.value)} />
            </label>
            <label>
              Order No
              <input value={leadForm.orderNo || ''} onChange={(e) => setLead('orderNo', e.target.value)} />
            </label>
            <label>
              Order Date
              <input type="date" value={leadForm.orderDate || ''} onChange={(e) => setLead('orderDate', e.target.value)} />
            </label>
            <label>
              Received Date
              <input type="date" value={leadForm.receivedDate || ''} onChange={(e) => setLead('receivedDate', e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Notes</legend>
          <textarea rows={4} value={leadForm.notes || ''} onChange={(e) => setLead('notes', e.target.value)} />
        </fieldset>

        <div className="form-actions">
          <button type="button" className="btn" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Lead'}
          </button>
        </div>
      </form>
    </div>
  );
}
