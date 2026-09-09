const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface PageSizeSelectProps {
  value: number;
  onChange: (size: number) => void;
}

export function PageSizeSelect({ value, onChange }: PageSizeSelectProps) {
  return (
    <label className="page-size-select">
      Rows per page
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}
