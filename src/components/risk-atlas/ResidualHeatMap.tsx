// ResidualHeatMap — 5×5 residual heatmap of the Atlas's threat paths.
// Inline SVG; deterministic; mirrors the OTS svg-risk-heatmap renderer
// pattern. Plots each path as a dot at (residual_score axis, inherent_score
// axis) — the spec's standard view of "where are we vs where would we be
// without controls".

interface PathPlot {
  path_code: string;
  name: string;
  inherent_score: number | null;
  residual_score: number | null;
  appetite_position?: 'within' | 'boundary' | 'outside' | 'unacceptable' | null;
}

interface Props {
  paths: PathPlot[];
}

const APPETITE_FILL: Record<string, string> = {
  within:       '#1B9E4B',
  boundary:     '#F5B300',
  outside:      '#E85D04',
  unacceptable: '#C81D11',
};

export default function ResidualHeatMap({ paths }: Props) {
  const cols = 5;       // residual (x-axis) — left = lower
  const rows = 5;       // inherent (y-axis) — top = higher
  const cellW = 76;
  const cellH = 56;
  const gridLeft = 100;
  const gridTop = 50;
  const gridW = cellW * cols;
  const gridH = cellH * rows;
  const width = gridLeft + gridW + 24;
  const height = gridTop + gridH + 100;

  const plots = paths.filter(p => p.inherent_score && p.residual_score);

  // Group dots by cell so we can jitter them
  const byCell = new Map<string, PathPlot[]>();
  for (const p of plots) {
    const key = `${p.residual_score!},${p.inherent_score!}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key)!.push(p);
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      className="rounded border border-border bg-white"
      style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}
    >
      {/* Title */}
      <text x={width / 2} y={24} textAnchor="middle" fontSize={14} fontWeight={600} fill="#111">
        Residual heatmap
      </text>
      <text x={width / 2} y={40} textAnchor="middle" fontSize={10} fill="#666">
        Each dot is a threat path. X = residual; Y = inherent (max E/T/V).
      </text>

      {/* Cells with traffic-light colour by residual band */}
      {Array.from({ length: rows }).map((_, ri) => (
        Array.from({ length: cols }).map((_, ci) => {
          const inherent = rows - ri;       // top row = inherent 5
          const residual = ci + 1;          // left col = residual 1
          const x = gridLeft + ci * cellW;
          const y = gridTop + ri * cellH;
          const ratio = residual / cols;
          const fill = ratio <= 0.30 ? '#D6F3DC'
                     : ratio <= 0.50 ? '#FFF3BF'
                     : ratio <= 0.75 ? '#FFD8A8'
                     : '#FFBDB6';
          return (
            <g key={`${ri}-${ci}`}>
              <rect x={x} y={y} width={cellW} height={cellH} fill={fill} stroke="#fff" strokeWidth={1} />
              <text x={x + cellW / 2} y={y + cellH - 6} textAnchor="middle" fontSize={9} fill="rgba(0,0,0,0.5)">
                I{inherent}/R{residual}
              </text>
            </g>
          );
        })
      ))}

      {/* Y-axis labels (inherent) */}
      {Array.from({ length: rows }).map((_, ri) => {
        const inherent = rows - ri;
        return (
          <text
            key={`y${ri}`}
            x={gridLeft - 8} y={gridTop + ri * cellH + cellH / 2 + 3}
            textAnchor="end" fontSize={11} fill="#333"
          >
            Inherent {inherent}
          </text>
        );
      })}

      {/* X-axis labels (residual) */}
      {Array.from({ length: cols }).map((_, ci) => {
        const residual = ci + 1;
        return (
          <text
            key={`x${ci}`}
            x={gridLeft + ci * cellW + cellW / 2} y={gridTop + gridH + 16}
            textAnchor="middle" fontSize={11} fill="#333"
          >
            R{residual}
          </text>
        );
      })}
      <text x={gridLeft + gridW / 2} y={gridTop + gridH + 36} textAnchor="middle" fontSize={11} fontWeight={600} fill="#555">
        Residual →
      </text>

      {/* Plot dots */}
      {Array.from(byCell.entries()).map(([key, pathsInCell]) => {
        const [residual, inherent] = key.split(',').map(Number);
        const cx = gridLeft + (residual - 1) * cellW + cellW / 2;
        const cy = gridTop + (rows - inherent) * cellH + cellH / 2;
        const perRow = Math.ceil(Math.sqrt(pathsInCell.length));
        const step = Math.min(14, (cellW - 16) / Math.max(1, perRow));
        return pathsInCell.map((p, idx) => {
          const row = Math.floor(idx / perRow);
          const col = idx % perRow;
          const rowCount = Math.ceil(pathsInCell.length / perRow);
          const dx = (col - (perRow - 1) / 2) * step;
          const dy = (row - (rowCount - 1) / 2) * step;
          const fill = APPETITE_FILL[p.appetite_position ?? 'within'] ?? '#0B1426';
          return (
            <g key={`${key}-${idx}`}>
              <circle
                cx={(cx + dx).toFixed(1)}
                cy={(cy + dy).toFixed(1)}
                r={(step * 0.32).toFixed(1)}
                fill={fill}
                fillOpacity={0.9}
                stroke="#fff"
                strokeWidth={1.2}
              >
                <title>{`${p.path_code}: ${p.name}`}</title>
              </circle>
            </g>
          );
        });
      })}

      {/* Legend */}
      {Object.entries(APPETITE_FILL).map(([k, v], idx) => (
        <g key={k}>
          <circle cx={gridLeft + idx * 110} cy={height - 18} r={5} fill={v} />
          <text x={gridLeft + idx * 110 + 10} y={height - 14} fontSize={11} fill="#333">{k}</text>
        </g>
      ))}
    </svg>
  );
}
