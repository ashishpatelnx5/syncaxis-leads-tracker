import { Link } from 'react-router-dom';

export interface BreakdownItem {
  label: string;
  value: number;
  to: string;
}

interface BreakdownBarsProps {
  items: BreakdownItem[];
}

export function BreakdownBars({ items }: BreakdownBarsProps) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="breakdown-list">
      {items.map((item) => (
        <Link key={item.label} to={item.to} className="breakdown-row">
          <span className="breakdown-label">{item.label}</span>
          <span className="breakdown-bar-track">
            <span className="breakdown-bar-fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
          <span className="breakdown-value">{item.value}</span>
        </Link>
      ))}
    </div>
  );
}
