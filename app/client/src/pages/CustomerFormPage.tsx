import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createCustomer, updateCustomer, fetchCustomer, fetchMeta } from '../api';
import type { CustomerInput, MetaResponse } from '../types';
import { EMPTY_CUSTOMER } from '../defaults';
import { CustomerFieldsFieldset } from '../components/CustomerFieldsFieldset';

export function CustomerFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState<CustomerInput>(EMPTY_CUSTOMER);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMeta().then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) {
      fetchCustomer(Number(id))
        .then(({ customer }) => setForm(customer))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [id, isEdit]);

  function set<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName?.trim()) {
      setError('Company name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await updateCustomer(Number(id), form);
        navigate(`/customers/${id}`);
      } else {
        const created = await createCustomer(form);
        navigate(`/customers/${created.id}`);
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
        <h1>{isEdit ? 'Edit Customer' : 'Add Customer'}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form className="lead-form" onSubmit={handleSubmit}>
        <CustomerFieldsFieldset value={form} onChange={set} meta={meta} />

        <div className="form-actions">
          <button type="button" className="btn" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Customer'}
          </button>
        </div>
      </form>
    </div>
  );
}
