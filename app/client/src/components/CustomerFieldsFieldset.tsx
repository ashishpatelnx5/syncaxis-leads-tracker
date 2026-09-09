import type { CustomerInput, MetaResponse } from '../types';

interface CustomerFieldsFieldsetProps {
  value: CustomerInput;
  onChange<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]): void;
  meta: MetaResponse | null;
}

// The full set of fields for the standalone Customer Master form, grouped into
// "Company Details" (identity, GSTIN, and a Location sub-group with address/
// city/state/country/PIN) and "Contact Details" (who to reach, how, and which
// department) - each a 2-column grid. City/State/Country are backed by a
// datalist of values already in use (still free-text, so a genuinely new
// location isn't blocked - it just won't autocomplete until someone's used it).
export function CustomerFieldsFieldset({ value, onChange, meta }: CustomerFieldsFieldsetProps) {
  return (
    <>
      <fieldset>
        <legend>Company Details</legend>
        <div className="form-grid form-grid-2col">
          <label className="field-narrow">
            Customer Code
            <input
              disabled
              value={value.customerCode || ''}
              placeholder="Auto-generated on save"
              title="System-assigned - can't be changed"
            />
          </label>
          <label className="field-span-2">
            Company Name *
            <input required value={value.companyName || ''} onChange={(e) => onChange('companyName', e.target.value)} />
          </label>
          <label>
            GSTIN
            <input
              value={value.gstin || ''}
              onChange={(e) => onChange('gstin', e.target.value.toUpperCase())}
              maxLength={15}
              placeholder="e.g. 27ABCDE1234F1Z5"
            />
          </label>

          <div className="field-group-label">Location</div>
          <label className="field-span-2">
            Company Address
            <textarea rows={2} value={value.address || ''} onChange={(e) => onChange('address', e.target.value)} />
          </label>
          <label>
            City
            <input list="meta-cities" value={value.city || ''} onChange={(e) => onChange('city', e.target.value)} />
            <datalist id="meta-cities">
              {meta?.cities.map((v) => <option key={v} value={v} />)}
            </datalist>
          </label>
          <label>
            State
            <input list="meta-states" value={value.state || ''} onChange={(e) => onChange('state', e.target.value)} />
            <datalist id="meta-states">
              {meta?.states.map((v) => <option key={v} value={v} />)}
            </datalist>
          </label>
          <label>
            Country
            <input list="meta-countries" value={value.country || ''} onChange={(e) => onChange('country', e.target.value)} />
            <datalist id="meta-countries">
              {meta?.countries.map((v) => <option key={v} value={v} />)}
            </datalist>
          </label>
          <label>
            PIN
            <input value={value.pincode || ''} onChange={(e) => onChange('pincode', e.target.value)} maxLength={10} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Contact Details</legend>
        <div className="form-grid form-grid-2col">
          <label>
            Contact Person
            <input value={value.contactPersonName || ''} onChange={(e) => onChange('contactPersonName', e.target.value)} />
          </label>
          <label>
            Department
            <input value={value.department || ''} onChange={(e) => onChange('department', e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={value.email || ''} onChange={(e) => onChange('email', e.target.value)} />
          </label>
          <label>
            Phone
            <input value={value.phone || ''} onChange={(e) => onChange('phone', e.target.value)} />
          </label>
        </div>
      </fieldset>
    </>
  );
}
