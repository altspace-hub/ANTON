// ── Renderer: SVG Risk Heatmap (for risk_register content) ──────────────
//
// Deterministic server-side SVG. No headless browser, no LLM, no deps.
// Lays out an NxN matrix (likelihood × impact) with each cell coloured
// via traffic-light gradient and risk dots placed by (L, I).
// Residual likelihood/impact are used when present; inherent L×I otherwise.

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

interface RiskItem {
  id: string;
  risk: string;
  likelihood?: number;
  impact?: number;
  residual_likelihood?: number;
  residual_impact?: number;
  owner?: string;
  treatment?: string;
  category?: string;
}

interface RiskRegisterBody {
  title?: string;
  items: RiskItem[];
  scoring_scheme?: {
    likelihood_scale?: Array<{ value: number; label: string }>;
    impact_scale?: Array<{ value: number; label: string }>;
  };
}

const DEFAULT_SCALE = [1, 2, 3, 4, 5] as const;
const DEFAULT_L_LABELS = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
const DEFAULT_I_LABELS = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

export const render: RenderFn<RiskRegisterBody> = async (payload, context): Promise<RenderResult> => {
  if (payload.content_type !== 'risk_register') {
    throw new Error(`svg-risk-heatmap expects risk_register, got ${payload.content_type}`);
  }
  const body = payload.body;
  if (!body?.items?.length) throw new Error('Risk register has no items');

  const svg = buildSvg(body, context.session.title);
  const filename = buildFilename('{module_id}-heatmap-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'svg-risk-heatmap',
    file_type: 'svg',
  });
  const saved = await saveArtifact({ sessionId: context.session.id, filename, content: svg });

  return {
    file_path: saved.rel_path,
    file_type: 'svg',
    mime_type: 'image/svg+xml',
    file_size_bytes: saved.size_bytes,
    metadata: {
      risks_plotted: body.items.filter(r => usableRisk(r) != null).length,
      total_risks: body.items.length,
      title: body.title ?? context.session.title,
    },
    validation: { valid: true },
  };
};

function buildSvg(body: RiskRegisterBody, titleFallback: string): string {
  const lScaleLen = body.scoring_scheme?.likelihood_scale?.length ?? DEFAULT_SCALE.length;
  const iScaleLen = body.scoring_scheme?.impact_scale?.length ?? DEFAULT_SCALE.length;
  const cols = Math.max(3, Math.min(7, iScaleLen));
  const rows = Math.max(3, Math.min(7, lScaleLen));

  const lLabels = body.scoring_scheme?.likelihood_scale?.map(s => s.label) ?? DEFAULT_L_LABELS.slice(0, rows);
  const iLabels = body.scoring_scheme?.impact_scale?.map(s => s.label) ?? DEFAULT_I_LABELS.slice(0, cols);

  // Layout constants
  const cellW = 96;
  const cellH = 64;
  const gridLeft = 160;
  const gridTop = 80;
  const gridW = cellW * cols;
  const gridH = cellH * rows;
  const width  = gridLeft + gridW + 32;
  const height = gridTop + gridH + 140;

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">`);
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);

  // Title
  const title = (body.title ?? titleFallback ?? 'Risk heatmap').trim();
  parts.push(`<text x="${width / 2}" y="36" text-anchor="middle" font-size="18" font-weight="600" fill="#111">${escapeXml(title)}</text>`);
  parts.push(`<text x="${width / 2}" y="56" text-anchor="middle" font-size="11" fill="#666">Likelihood × Impact — residual where available</text>`);

  // Cells
  for (let ri = 0; ri < rows; ri++) {      // ri 0 = top row = highest likelihood
    const likelihood = rows - ri;
    for (let ci = 0; ci < cols; ci++) {
      const impact = ci + 1;
      const score = likelihood * impact;
      const fill = heatColour(score, rows * cols);
      const x = gridLeft + ci * cellW;
      const y = gridTop + ri * cellH;
      parts.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${fill}" stroke="#fff" stroke-width="1"/>`);
      parts.push(`<text x="${x + cellW / 2}" y="${y + cellH - 8}" text-anchor="middle" font-size="10" fill="rgba(0,0,0,0.55)">${score}</text>`);
    }
  }

  // Y-axis labels (likelihood)
  for (let ri = 0; ri < rows; ri++) {
    const label = lLabels[rows - 1 - ri] ?? '';
    const y = gridTop + ri * cellH + cellH / 2 + 4;
    parts.push(`<text x="${gridLeft - 10}" y="${y}" text-anchor="end" font-size="12" fill="#333">${escapeXml(label)}</text>`);
  }
  // Y-axis title
  parts.push(`<text x="24" y="${gridTop + gridH / 2}" text-anchor="middle" font-size="12" font-weight="600" fill="#555" transform="rotate(-90, 24, ${gridTop + gridH / 2})">Likelihood →</text>`);

  // X-axis labels (impact)
  for (let ci = 0; ci < cols; ci++) {
    const label = iLabels[ci] ?? '';
    const x = gridLeft + ci * cellW + cellW / 2;
    parts.push(`<text x="${x}" y="${gridTop + gridH + 16}" text-anchor="middle" font-size="12" fill="#333">${escapeXml(label)}</text>`);
  }
  parts.push(`<text x="${gridLeft + gridW / 2}" y="${gridTop + gridH + 36}" text-anchor="middle" font-size="12" font-weight="600" fill="#555">Impact →</text>`);

  // Plot risks — multiple risks in the same cell are jittered in a small grid inside the cell
  const byCell = new Map<string, RiskItem[]>();
  for (const r of body.items) {
    const cell = usableRisk(r);
    if (!cell) continue;
    const key = `${cell.l},${cell.i}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key)!.push(r);
  }
  for (const [key, risks] of byCell.entries()) {
    const [l, i] = key.split(',').map(Number);
    if (l < 1 || l > rows || i < 1 || i > cols) continue;
    const cx = gridLeft + (i - 1) * cellW + cellW / 2;
    const cy = gridTop + (rows - l) * cellH + cellH / 2;
    const perRow = Math.ceil(Math.sqrt(risks.length));
    const step = Math.min(14, (cellW - 20) / Math.max(1, perRow));
    risks.forEach((r, idx) => {
      const row = Math.floor(idx / perRow);
      const col = idx % perRow;
      const rowCount = Math.ceil(risks.length / perRow);
      const dx = (col - (perRow - 1) / 2) * step;
      const dy = (row - (rowCount - 1) / 2) * step;
      const title = `${r.id}: ${r.risk}${r.owner ? ` (${r.owner})` : ''}`;
      parts.push(`<g><circle cx="${(cx + dx).toFixed(1)}" cy="${(cy + dy).toFixed(1)}" r="${(step * 0.35).toFixed(1)}" fill="#0B1426" fill-opacity="0.85" stroke="#fff" stroke-width="1.2"><title>${escapeXml(title)}</title></circle></g>`);
    });
  }

  // Legend row
  const legendY = gridTop + gridH + 72;
  const steps = [
    { c: '#1B9E4B', label: 'Low' },
    { c: '#F5B300', label: 'Medium' },
    { c: '#E85D04', label: 'High' },
    { c: '#C81D11', label: 'Critical' },
  ];
  const bw = 72;
  const legendLeft = gridLeft + gridW / 2 - (steps.length * bw) / 2;
  steps.forEach((s, idx) => {
    const x = legendLeft + idx * bw;
    parts.push(`<rect x="${x}" y="${legendY}" width="${bw - 6}" height="14" fill="${s.c}"/>`);
    parts.push(`<text x="${x + (bw - 6) / 2}" y="${legendY + 28}" text-anchor="middle" font-size="11" fill="#333">${s.label}</text>`);
  });

  parts.push(`</svg>`);
  return parts.join('\n');
}

function usableRisk(r: RiskItem): { l: number; i: number } | null {
  const l = r.residual_likelihood ?? r.likelihood;
  const i = r.residual_impact ?? r.impact;
  if (typeof l !== 'number' || typeof i !== 'number') return null;
  if (l < 1 || i < 1) return null;
  return { l, i };
}

function heatColour(score: number, maxScore: number): string {
  const ratio = score / maxScore;                           // 0..1
  if (ratio <= 0.30) return '#D6F3DC';                       // green-50
  if (ratio <= 0.50) return '#FFF3BF';                       // amber-50
  if (ratio <= 0.75) return '#FFD8A8';                       // orange-100
  return '#FFBDB6';                                          // red-100
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
