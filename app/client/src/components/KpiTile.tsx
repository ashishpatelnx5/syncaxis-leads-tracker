import { Link } from 'react-router-dom';

interface KpiTileProps {
  label: string;
  value: string;
  sublabel?: string;
  to: string;
  accent?: 'blue' | 'green' | 'red' | 'amber' | 'teal' | 'violet';
}

export function KpiTile({ label, value, sublabel, to, accent = 'blue' }: KpiTileProps) {
  return (
    <Link to={to} className={`kpi-tile kpi-tile-${accent}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sublabel && <div className="kpi-sublabel">{sublabel}</div>}
    </Link>
  );
}
