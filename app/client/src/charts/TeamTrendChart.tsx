import { useState } from 'react';
import type { TeamTrend } from '../api';

const MARGIN = { top: 20, right: 20, bottom: 32, left: 36 };
const HEIGHT = 260;
const PALETTE = ['#2a78d6', '#eb6834', '#2fa84f', '#a855f7', '#e0b429', '#e0457b', '#14b8a6', '#94a3b8'];

interface TeamTrendChartProps {
  data: TeamTrend;
}

export function TeamTrendChart({ data }: TeamTrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { people, periods } = data;

  const slotMinWidth = Math.max(70, people.length * 14);
  const width = Math.max(480, periods.length * slotMinWidth);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxValue = Math.max(1, ...periods.flatMap((p) => people.map((person) => p.counts[person] || 0)));
  const slotWidth = periods.length > 0 ? plotWidth / periods.length : plotWidth;
  const barGap = 2;
  const barWidth = Math.max(3, (slotWidth - barGap * (people.length + 1)) / Math.max(1, people.length));

  const yFor = (v: number) => plotHeight - (v / maxValue) * plotHeight;
  const ticks = [0, 0.5, 1].map((t) => Math.round(maxValue * t));
  const active = activeIndex !== null ? periods[activeIndex] : null;

  return (
    <div>
      <div className="chart-scroll">
        <svg width={width} height={HEIGHT} role="img" aria-label="Team trend bar chart">
          <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={0} x2={plotWidth} y1={yFor(tick)} y2={yFor(tick)} className="chart-gridline" />
                <text x={-8} y={yFor(tick) + 4} textAnchor="end" className="chart-axis-label">
                  {tick}
                </text>
              </g>
            ))}

            {periods.map((p, i) => {
              const slotX = i * slotWidth;
              const isActive = activeIndex === i;
              return (
                <g key={p.periodKey}>
                  {people.map((person, pi) => {
                    const value = p.counts[person] || 0;
                    const barX = slotX + barGap + pi * (barWidth + barGap);
                    return (
                      <rect
                        key={person}
                        x={barX}
                        y={yFor(value)}
                        width={barWidth}
                        height={plotHeight - yFor(value)}
                        fill={PALETTE[pi % PALETTE.length]}
                        opacity={isActive ? 1 : 0.85}
                        rx={1.5}
                      />
                    );
                  })}
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
                  <text x={slotX + slotWidth / 2} y={plotHeight + 20} textAnchor="middle" className="chart-axis-label">
                    {p.periodLabel}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="chart-legend">
        {people.map((person, pi) => (
          <span key={person} className="chart-legend-item">
            <span className="chart-legend-swatch" style={{ background: PALETTE[pi % PALETTE.length] }} /> {person}
          </span>
        ))}
      </div>

      {active && (
        <div className="chart-legend" style={{ marginTop: 4 }}>
          <span className="chart-legend-item chart-legend-tooltip">
            {active.periodLabel}:{' '}
            {people.map((person, pi) => (
              <span key={person} style={{ marginLeft: pi === 0 ? 0 : 12 }}>
                {person} <strong>{active.counts[person] || 0}</strong>
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
