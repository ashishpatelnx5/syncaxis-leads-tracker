import { useEffect, useState } from 'react';
import { fetchTrend } from '../api';
import type { TrendPeriod, TrendPoint } from '../api';

const PERIOD_OPTIONS: { key: TrendPeriod; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
];

const MARGIN = { top: 20, right: 20, bottom: 32, left: 36 };
const HEIGHT = 260;

export function TrendChart() {
  const [period, setPeriod] = useState<TrendPeriod>('monthly');
  const [data, setData] = useState<TrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    setActiveIndex(null);
    fetchTrend(period)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [period]);

  const width = Math.max(480, data.length * 64);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.received, d.ordered)));
  const slotWidth = data.length > 0 ? plotWidth / data.length : plotWidth;
  const barWidth = Math.max(4, Math.min(22, slotWidth / 2 - 6));

  const yFor = (v: number) => plotHeight - (v / maxValue) * plotHeight;
  const ticks = [0, 0.5, 1].map((t) => Math.round(maxValue * t));
  const active = activeIndex !== null ? data[activeIndex] : null;

  return (
    <div>
      <div className="trend-period-toggle">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`trend-period-btn${period === opt.key ? ' active' : ''}`}
            onClick={() => setPeriod(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="chart-scroll">
        <svg width={width} height={HEIGHT} role="img" aria-label={`${period} trend bar chart`}>
          <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={0} x2={plotWidth} y1={yFor(tick)} y2={yFor(tick)} className="chart-gridline" />
                <text x={-8} y={yFor(tick) + 4} textAnchor="end" className="chart-axis-label">
                  {tick}
                </text>
              </g>
            ))}

            {data.map((d, i) => {
              const slotX = i * slotWidth;
              const centerX = slotX + slotWidth / 2;
              const isActive = activeIndex === i;
              return (
                <g key={d.periodKey}>
                  <rect
                    x={centerX - barWidth - 2}
                    y={yFor(d.received)}
                    width={barWidth}
                    height={plotHeight - yFor(d.received)}
                    fill="var(--series-1)"
                    opacity={isActive ? 1 : 0.85}
                    rx={2}
                  />
                  <rect
                    x={centerX + 2}
                    y={yFor(d.ordered)}
                    width={barWidth}
                    height={plotHeight - yFor(d.ordered)}
                    fill="var(--series-2)"
                    opacity={isActive ? 1 : 0.85}
                    rx={2}
                  />
                  <rect
                    x={slotX}
                    y={0}
                    width={slotWidth}
                    height={plotHeight}
                    fill="transparent"
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseLeave={() => setActiveIndex(null)}
                    onClick={() => setActiveIndex(isActive ? null : i)}
                  />
                  <text x={centerX} y={plotHeight + 20} textAnchor="middle" className="chart-axis-label">
                    {d.periodLabel}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="chart-legend">
        <span className="chart-legend-item">
          <span className="chart-legend-swatch" style={{ background: 'var(--series-1)' }} /> Enquiries Received
        </span>
        <span className="chart-legend-item">
          <span className="chart-legend-swatch" style={{ background: 'var(--series-2)' }} /> Orders Placed
        </span>
        {active && (
          <span className="chart-legend-item chart-legend-tooltip">
            {active.periodLabel}: <strong>{active.received}</strong> received · <strong>{active.ordered}</strong> ordered
          </span>
        )}
      </div>
    </div>
  );
}
