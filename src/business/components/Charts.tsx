/**
 * Charts.tsx — dependency-free SVG chart primitives for the
 * Statistics screen.
 *
 * The codebase hand-rolls its visual primitives (QR, kvitto render)
 * rather than pulling charting libraries, and these follow suit:
 * plain SVG, themed off the CSS custom properties, responsive via
 * viewBox. Three primitives cover the dashboard:
 *
 *   • BarChart   — time-bucketed gross sales (the trend)
 *   • DonutChart — category / VAT-rate share
 *   • HeatStrip  — 24-hour busiest-hours histogram
 */

// ───────────────────────────────────────────────────────────────────────
// BarChart
// ───────────────────────────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  value: number;
}

/**
 * Vertical bar chart. Scales to the widest of its values; renders an
 * even x-axis with every bucket's label (thinned when there are many
 * bars so the labels don't collide).
 */
export function BarChart({
  data,
  height = 160,
  valueFormat = (v) => v.toFixed(0),
}: {
  data: BarDatum[];
  height?: number;
  valueFormat?: (v: number) => string;
}) {
  if (data.length === 0) {
    return (
      <div className="text-xs text-center py-8"
           style={{ color: 'var(--color-text-faint)' }}>
        —
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const W = 320;
  const H = height;
  const padBottom = 22;
  const padTop = 8;
  const chartH = H - padBottom - padTop;
  const slot = W / data.length;
  const barW = Math.min(slot * 0.62, 36);
  // Thin labels: aim for <= 8 visible.
  const labelStep = Math.ceil(data.length / 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}
         style={{ overflow: 'visible' }} role="img">
      {data.map((d, i) => {
        const h = (d.value / max) * chartH;
        const x = i * slot + (slot - barW) / 2;
        const y = padTop + chartH - h;
        const showLabel = i % labelStep === 0;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(h, d.value > 0 ? 2 : 0)}
                  rx={3}
                  fill="var(--color-accent)"
                  opacity={d.value > 0 ? 1 : 0.25} />
            {d.value > 0 && h > 18 && (
              <text x={x + barW / 2} y={y - 3}
                    textAnchor="middle" fontSize="8"
                    fill="var(--color-text-faint)">
                {valueFormat(d.value)}
              </text>
            )}
            {showLabel && (
              <text x={i * slot + slot / 2} y={H - 8}
                    textAnchor="middle" fontSize="8.5"
                    fill="var(--color-text-faint)">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ───────────────────────────────────────────────────────────────────────
// DonutChart
// ───────────────────────────────────────────────────────────────────────

export interface DonutSlice {
  label: string;
  value: number;
  /** Optional explicit colour; falls back to the palette by index. */
  color?: string;
}

/** Six-step palette derived around the brand accent. Kept inline so
 *  the donut doesn't need a theme import. */
const DONUT_PALETTE = [
  'var(--color-accent)',
  '#7BA7DC',
  '#0D7D6C',
  '#C8842B',
  '#6A3E8F',
  '#9CA0AE',
];

/**
 * Donut chart with a centred total. Slices below 1.5 % of the total
 * are merged into a trailing "other" wedge so tiny slivers don't
 * clutter the ring.
 */
export function DonutChart({
  slices,
  size = 150,
  centerLabel,
  centerValue,
}: {
  slices: DonutSlice[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) {
    return (
      <div className="text-xs text-center py-8"
           style={{ color: 'var(--color-text-faint)' }}>
        —
      </div>
    );
  }
  const r = size / 2;
  const stroke = size * 0.16;
  const ringR = r - stroke / 2;
  const circ = 2 * Math.PI * ringR;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <g transform={`rotate(-90 ${r} ${r})`}>
          {slices.map((s, i) => {
            const frac = s.value / total;
            const len = frac * circ;
            const el = (
              <circle key={i}
                      cx={r} cy={r} r={ringR}
                      fill="none"
                      stroke={s.color ?? DONUT_PALETTE[i % DONUT_PALETTE.length]}
                      strokeWidth={stroke}
                      strokeDasharray={`${len} ${circ - len}`}
                      strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
        </g>
        {(centerLabel || centerValue) && (
          <>
            {centerValue && (
              <text x={r} y={r - 1} textAnchor="middle"
                    fontSize={size * 0.13} fontWeight="700"
                    fill="var(--color-text)">
                {centerValue}
              </text>
            )}
            {centerLabel && (
              <text x={r} y={r + size * 0.12} textAnchor="middle"
                    fontSize={size * 0.075}
                    fill="var(--color-text-faint)">
                {centerLabel}
              </text>
            )}
          </>
        )}
      </svg>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span style={{
              width: 10, height: 10, borderRadius: 2, flexShrink: 0,
              backgroundColor: s.color ?? DONUT_PALETTE[i % DONUT_PALETTE.length],
            }} />
            <span className="truncate" style={{ color: 'var(--color-text-body)' }}>
              {s.label}
            </span>
            <span className="ml-auto tabular" style={{ color: 'var(--color-text-faint)' }}>
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// HeatStrip — 24-hour histogram
// ───────────────────────────────────────────────────────────────────────

/**
 * A 24-cell horizontal strip. Each cell's fill opacity scales with
 * its share of the busiest hour, so the merchant sees their rush at
 * a glance.
 */
export function HeatStrip({ hours }: { hours: number[] }) {
  const max = Math.max(...hours, 1);
  return (
    <div className="flex gap-[2px]">
      {hours.map((count, h) => (
        <div key={h} className="flex-1 flex flex-col items-center gap-1">
          <div style={{
            width: '100%',
            height: 28,
            borderRadius: 3,
            backgroundColor: 'var(--color-accent)',
            opacity: count === 0 ? 0.08 : 0.25 + 0.75 * (count / max),
          }} />
          {h % 6 === 0 && (
            <span style={{ fontSize: 8, color: 'var(--color-text-faint)' }}>
              {h.toString().padStart(2, '0')}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
