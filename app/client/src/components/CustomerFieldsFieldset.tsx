import type { CustomerInput } from '../types';

interface CustomerFieldsFieldsetProps {
  value: CustomerInput;
  onChange<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]): void;
}

// The company/contact/location fields shared by the standalone Customer form
// and the customer section of the Lead form.
export function CustomerFieldsFieldset({ value, onChange }: CustomerFieldsFieldsetProps) {
  return (
    <div className="form-grid">
      <label>
        Company Name *
        <input required value={value.companyName || ''} onChange={(e) => onChange('companyName', e.target.value)} />
      </label>
      <label>
        Customer Code
        <input value={value.customerCode || ''} onChange={(e) => onChange('customerCode', e.target.value)} />
      </label>
      <label>
        Department
        <input value={value.department || ''} onChange={(e) => onChange('department', e.target.value)} />
      </label>
      <label>
        Contact Person
        <input value={value.contactPersonName || ''} onChange={(e) => onChange('contactPersonName', e.target.value)} />
      </label>
      <label>
        Email
        <input type="email" value={value.email || ''} onChange={(e) => onChange('email', e.target.value)} />
      </label>
      <label>
        Phone
        <input value={value.phone || ''} onChange={(e) => onChange('phone', e.target.value)} />
      </label>
      <label>
        Country
        <input value={value.country || ''} onChange={(e) => onChange('country', e.target.value)} />
      </label>
      <label>
        State
        <input value={value.state || ''} onChange={(e) => onChange('state', e.target.value)} />
      </label>
      <label>
        City
        <input value={value.city || ''} onChange={(e) => onChange('city', e.target.value)} />
      </label>
    </div>
  );
}
