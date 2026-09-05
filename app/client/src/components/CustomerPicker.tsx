import { useEffect, useRef, useState } from 'react';
import { searchCustomers } from '../api';
import type { Customer } from '../types';

interface CustomerPickerProps {
  selectedCustomer: Customer | null;
  onSelect: (customer: Customer) => void;
  onClear: () => void;
}

export function CustomerPicker({ selectedCustomer, onSelect, onClear }: CustomerPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim() || selectedCustomer) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      searchCustomers(query.trim())
        .then((res) => {
          setResults(res.items);
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, selectedCustomer]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (selectedCustomer) {
    return (
      <div className="customer-picker">
        <div className="customer-picker-selected">
          <div>
            <strong>{selectedCustomer.companyName}</strong>
            {selectedCustomer.contactPersonName && <span> — {selectedCustomer.contactPersonName}</span>}
            <div className="cell-secondary">
              {[selectedCustomer.phone, selectedCustomer.email].filter(Boolean).join(' · ') || 'No contact details on file'}
            </div>
          </div>
          <button type="button" className="btn" onClick={onClear}>Change customer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-picker" ref={containerRef}>
      <input
        type="text"
        placeholder="Search existing customers by company, contact, email or phone..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && (
        <div className="customer-picker-dropdown">
          {loading && <div className="customer-picker-item empty">Searching...</div>}
          {!loading && results.length === 0 && query.trim() && (
            <div className="customer-picker-item empty">No matching customer — fill in the details below to create a new one.</div>
          )}
          {!loading && results.map((c) => (
            <button
              type="button"
              key={c.id}
              className="customer-picker-item"
              onClick={() => {
                onSelect(c);
                setQuery('');
                setOpen(false);
              }}
            >
              <strong>{c.companyName}</strong>
              {c.contactPersonName && <span> — {c.contactPersonName}</span>}
              <div className="cell-secondary">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
