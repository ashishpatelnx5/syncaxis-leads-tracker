import { useEffect, useRef, useState } from 'react';

interface HeaderFilterDropdownProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  extraOption?: { value: string; label: string };
}

// A small funnel icon in a table header that opens a dropdown to filter that
// column, Excel-style - click outside or pick a value to close it.
export function HeaderFilterDropdown({ options, value, onChange, allLabel, extraOption }: HeaderFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const active = !!value;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function select(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <span className="header-filter" ref={ref}>
      <button
        type="button"
        className={`header-filter-btn${active ? ' active' : ''}`}
        title="Filter this column"
        onClick={() => setOpen((o) => !o)}
      >
        ⏷
      </button>
      {open && (
        <div className="header-filter-dropdown">
          <button className={!value ? 'selected' : ''} onClick={() => select('')}>{allLabel}</button>
          {extraOption && (
            <button className={value === extraOption.value ? 'selected' : ''} onClick={() => select(extraOption.value)}>
              {extraOption.label}
            </button>
          )}
          {options.map((o) => (
            <button key={o} className={value === o ? 'selected' : ''} onClick={() => select(o)}>{o}</button>
          ))}
        </div>
      )}
    </span>
  );
}
