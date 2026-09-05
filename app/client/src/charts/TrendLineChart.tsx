import { useState } from 'react';

export interface TrendDatum {
  month: string;
  received: number;
  ordered: number;
}

interface TrendLineChartProps {
  data: TrendDatum[];
}

const MARGIN = { top: 20, right: 20, bottom: 32, left: 36 };
const HEIGHT = 260;

function monthLabel(ym: string): string {
  const [year, month] = ym.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export function TrendLineChart({ data }: TrendLineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = Math.max(480, data.length * 56);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.received, d.ordered)));

  const xFor = (i: number) => MARGIN.left + (data.length === 1 ? plotWidth / 2 : (i / (data.length - 1)) * plotWidth);
  const yFor = (v: number) => MARGIN.top + plotHeight - (v / maxValue) * plotHeight;

  function pathFor(key: 'received' | 'ordered') {
    return data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(d[key])}`).join(' ');
  }

  const ticks = [0, 0.5, 1].map((t) => Math.round(maxValue * t));
  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className="chart-scroll">
      <svg width={width} height={HEIGHT} role="img" aria-label="Monthly trend line chart">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yFor(tick)} y2={yFor(tick)} className="chart-gridline" />
            <text x={MARGIN.left - 8} y={yFor(tick) + 4} textAnchor="end" className="chart-axis-label">
              {tick}
            </text>
          </g>
        ))}

        {hovered && (
          <line x1={xFor(hoverIndex!)} x2={xFor(hoverIndex!)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} className="chart-crosshair" />
        )}

        <path d={pathFor('received')} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={pathFor('ordered')} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) => (
          <g key={d.month}>
            <circle cx={xFor(i)} cy={yFor(d.received)} r={4} fill="var(--series-1)" stroke="var(--chart-surface)" strokeWidth={2} />
            <circle cx={xFor(i)} cy={yFor(d.ordered)} r={4} fill="var(--series-2)" stroke="var(--chart-surface)" strokeWidth={2} />
            <rect
              x={xFor(i) - plotWidth / data.length / 2}
              y={MARGIN.top}
              width={plotWidth / data.length}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            />
            <text x={xFor(i)} y={HEIGHT - 8} textAnchor="middle" className="chart-axis-label">
              {monthLabel(d.month)}
            </text>
          </g>
        ))}
      </svg>

      <div className="chart-legend">
        <span className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: 'var(--series-1)' }} /> Enquiries Received</span>
        <span className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: 'var(--series-2)' }} /> Orders Placed</span>
        {hovered && (
          <span className="chart-legend-item chart-legend-tooltip">
            {monthLabel(hovered.month)}: <strong>{hovered.received}</strong> received · <strong>{hovered.ordered}</strong> ordered
          </span>
        )}
      </div>
    </div>
  );
}
