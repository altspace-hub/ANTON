// ── Atlas Export — board pack, threat path cards, heatmap, .anton bundle ──
//
// Reuses existing export pipeline (export-docx / export-pdf) so brand
// styling stays consistent across the platform. The .anton round-trip
// uses the standard anton-bundler infrastructure with the new
// risk-atlas-export bundle type from Phase 1a.

import type { DatabaseAdapter } from '../../db/database.js';
import { createAtlasService } from './atlas-service.js';
import { generateDocx } from '../export-docx.js';
import { generatePdf } from '../export-pdf.js';
import { appetitePositionFor } from './atlas-residual-calculator.js';
import { ANTON_GENERATOR } from '../anton-bundle-registry.js';
import type {
  RiskAtlasRow, ThreatPathFull, AtlasDashboard, AppetitePosition, Score1to5,
} from './types.js';

export interface AtlasExportSnapshot {
  atlas: RiskAtlasRow;
  dashboard: AtlasDashboard;
  paths: ThreatPathFull[];
  exported_at: string;
  exported_by: string | null;
}

const APPETITE_LABEL: Record<AppetitePosition, string> = {
  within: 'Within appetite',
  boundary: 'At boundary',
  outside: 'Outside appetite',
  unacceptable: 'Unacceptable',
};

export function createAtlasExport(db: DatabaseAdapter) {
  const service = createAtlasService(db);

  // ── Snapshot — single source for every export type ─────────────────

  async function buildSnapshot(atlasId: string, exportedBy: string | null): Promise<AtlasExportSnapshot | null> {
    const dashboard = await service.getDashboard(atlasId);
    if (!dashboard) return null;
    const allPaths = await service.listThreatPaths(atlasId);
    const fulls = await Promise.all(allPaths.map(p => service.getThreatPathFull(p.id)));
    const paths = fulls.filter((p): p is ThreatPathFull => p !== null);
    return {
      atlas: dashboard.atlas,
      dashboard,
      paths,
      exported_at: new Date().toISOString(),
      exported_by: exportedBy,
    };
  }

  // ── Board pack DOCX ─────────────────────────────────────────────────

  async function generateBoardPackDocx(atlasId: string, exportedBy: string | null): Promise<Buffer | null> {
    const snap = await buildSnapshot(atlasId, exportedBy);
    if (!snap) return null;
    const md = renderBoardPackMarkdown(snap);
    return generateDocx(md, {
      title: `${snap.atlas.name} — Risk Atlas Board Pack`,
      moduleId: 'risk-atlas-board-pack',
      sessionId: snap.atlas.id,
      author: 'ANTON Risk Atlas',
    });
  }

  // ── Threat path cards PDF (one document, all paths) ────────────────

  async function generateThreatPathCardsPdf(atlasId: string, exportedBy: string | null): Promise<Buffer | null> {
    const snap = await buildSnapshot(atlasId, exportedBy);
    if (!snap) return null;
    const md = renderThreatPathCardsMarkdown(snap);
    return generatePdf(md, {
      title: `${snap.atlas.name} — Threat Path Cards`,
      moduleId: 'risk-atlas-threat-cards',
      sessionId: snap.atlas.id,
    });
  }

  // ── Heatmap SVG (server-side, deterministic) ───────────────────────

  async function generateHeatMapSvg(atlasId: string): Promise<string | null> {
    const snap = await buildSnapshot(atlasId, null);
    if (!snap) return null;
    return renderHeatMapSvg(snap.paths);
  }

  // ── .anton bundle round-trip — full Atlas snapshot ─────────────────

  async function generateAtlasBundle(atlasId: string, exportedBy: string | null): Promise<{ filename: string; payload: string } | null> {
    const snap = await buildSnapshot(atlasId, exportedBy);
    if (!snap) return null;
    // Build a flat JSON bundle that any future importer can replay through
    // the atlas-service mutators. The bundle_type 'risk-atlas-export' was
    // registered in Phase 1a (anton-bundler.ts).
    const bundle = {
      bundle_type: 'risk-atlas-export',
      version: '1.0.0',
      // Standard spec-envelope fields (Wave 2.6) alongside the domain-native
      // payload. Export-only type (no importer yet) — purely additive.
      format_version: '1.0.0',
      created_at: snap.exported_at,
      generator: ANTON_GENERATOR,
      exported_at: snap.exported_at,
      exported_by: snap.exported_by,
      atlas: {
        name: snap.atlas.name,
        description: snap.atlas.description,
        business_description: snap.atlas.business_description,
        industry_pack_id: snap.atlas.industry_pack_id,
        mode: snap.atlas.mode,
      },
      paths: snap.paths.map(p => ({
        path_code: p.path.path_code,
        name: p.path.name,
        description: p.path.description,
        fcp_domain: p.path.fcp_domain,
        exposures: p.exposures.map(e => ({ name: e.name, description: e.description, category: e.category })),
        vulnerabilities: p.vulnerabilities.map(v => ({ vuln_code: v.vuln_code, name: v.name, severity: v.severity })),
        inherent: p.inherent ? {
          exposure_score: p.inherent.exposure_score, threat_score: p.inherent.threat_score,
          vulnerability_score: p.inherent.vulnerability_score, inherent_score: p.inherent.inherent_score,
          rationale: p.inherent.rationale,
        } : null,
        controls: p.controls.map(c => ({
          control_code: c.control_code, name: c.name, type: c.type,
          strength: c.strength, evidence: c.evidence, owner_role: c.owner_role,
        })),
        residual: p.residual ? { residual_score: p.residual.residual_score, control_quality_rollup: p.residual.control_quality_rollup } : null,
        appetite: p.appetite ? {
          appetite_position: p.appetite.appetite_position, required_action: p.appetite.required_action,
          target_date: p.appetite.target_date, budget_eur: p.appetite.budget_eur,
        } : null,
      })),
    };
    const safeName = snap.atlas.name.replace(/[^A-Za-z0-9]/g, '-').toLowerCase().slice(0, 60);
    return { filename: `${safeName}-atlas-${Date.now()}.anton.json`, payload: JSON.stringify(bundle, null, 2) };
  }

  return { buildSnapshot, generateBoardPackDocx, generateThreatPathCardsPdf, generateHeatMapSvg, generateAtlasBundle };
}

export type AtlasExport = ReturnType<typeof createAtlasExport>;

// ── Markdown renderers ────────────────────────────────────────────────

export function renderBoardPackMarkdown(snap: AtlasExportSnapshot): string {
  const a = snap.atlas;
  const d = snap.dashboard;
  const lines: string[] = [];

  lines.push(`# ${a.name} — Risk Atlas Board Pack`);
  lines.push('');
  lines.push(`*Exported ${snap.exported_at.slice(0, 10)}${snap.exported_by ? ` by ${snap.exported_by}` : ''}*`);
  lines.push('');

  lines.push('## Headline');
  lines.push('');
  lines.push(`- **Total threat paths:** ${d.paths_total}`);
  lines.push(`- **Outside appetite:** ${(d.paths_by_appetite.outside ?? 0) + (d.paths_by_appetite.unacceptable ?? 0)}`);
  lines.push(`- **At boundary:** ${d.paths_by_appetite.boundary ?? 0}`);
  lines.push(`- **Within appetite:** ${d.paths_by_appetite.within ?? 0}`);
  lines.push(`- **Industry pack:** ${a.industry_pack_id ?? '—'}`);
  lines.push(`- **Mode:** ${a.mode}`);
  lines.push('');

  // Outside / unacceptable paths up front
  const outside = snap.paths.filter(p => {
    const r = p.residual?.residual_score; if (!r) return false;
    const ap = appetitePositionFor(r as Score1to5);
    return ap === 'outside' || ap === 'unacceptable';
  });

  if (outside.length > 0) {
    lines.push('## Paths outside appetite — action required');
    lines.push('');
    lines.push('| Path | Residual | Required action | Owner | Target | Budget |');
    lines.push('|---|---|---|---|---|---|');
    for (const p of outside) {
      const r = p.residual!.residual_score;
      const action = p.appetite?.required_action ?? '—';
      const target = p.appetite?.target_date ?? '—';
      const budget = p.appetite?.budget_eur != null ? `€${Number(p.appetite.budget_eur).toLocaleString()}` : '—';
      lines.push(`| **${p.path.path_code} — ${p.path.name}** | ${r}/5 | ${action} | — | ${target} | ${budget} |`);
    }
    lines.push('');
  }

  lines.push('## All threat paths');
  lines.push('');
  lines.push('| Path | Domain | Inherent | Controls | Residual | Appetite |');
  lines.push('|---|---|---|---|---|---|');
  for (const p of snap.paths) {
    const inh = p.inherent?.inherent_score ?? '—';
    const res = p.residual?.residual_score ?? '—';
    const ap = p.residual ? appetitePositionFor(p.residual.residual_score as Score1to5) : null;
    const apLabel = ap ? APPETITE_LABEL[ap] : '—';
    const rollup = p.residual?.control_quality_rollup ?? '—';
    const cnt = p.controls.length;
    const fcp = p.path.fcp_domain ?? '—';
    lines.push(`| ${p.path.path_code} ${p.path.name} | ${fcp} | ${inh}/5 | ${cnt} (${rollup}) | ${res}/5 | ${apLabel} |`);
  }
  lines.push('');

  lines.push('## Appendix — methodology');
  lines.push('');
  lines.push('Inherent risk scored as the maximum of (Exposure, Threat credibility, Vulnerability). Residual = Inherent − reduction(rollup), clamped to [1, 5], where Strong = −2, Adequate = −1, Weak = 0. The control quality rollup is the worst-of strengths across all controls touching any vulnerability of the path. The calculation is fully deterministic — the same Atlas state always produces the same residual scores.');
  lines.push('');

  lines.push('## Appendix — sign-off');
  lines.push('');
  lines.push('Approved by: __________________________________________');
  lines.push('');
  lines.push('Date:        __________________________________________');
  lines.push('');

  return lines.join('\n');
}

function renderThreatPathCardsMarkdown(snap: AtlasExportSnapshot): string {
  const lines: string[] = [];
  lines.push(`# ${snap.atlas.name} — Threat Path Cards`);
  lines.push('');
  lines.push(`*Exported ${snap.exported_at.slice(0, 10)} · ${snap.paths.length} paths*`);
  lines.push('');

  for (const p of snap.paths) {
    lines.push(`## ${p.path.path_code} — ${p.path.name}`);
    if (p.path.fcp_domain) lines.push(`*FCP domain: ${p.path.fcp_domain}*`);
    if (p.path.description) lines.push('', p.path.description);
    lines.push('');

    if (p.exposures.length > 0) {
      lines.push('**Exposures**');
      for (const e of p.exposures) lines.push(`- ${e.name}${e.description ? ` — ${e.description}` : ''}`);
      lines.push('');
    }
    if (p.vulnerabilities.length > 0) {
      lines.push('**Vulnerabilities**');
      for (const v of p.vulnerabilities) lines.push(`- ${v.vuln_code} — ${v.name} (severity ${v.severity}/5)`);
      lines.push('');
    }
    if (p.inherent) {
      lines.push(`**Inherent:** ${p.inherent.inherent_score}/5 (E=${p.inherent.exposure_score} T=${p.inherent.threat_score} V=${p.inherent.vulnerability_score})`);
      if (p.inherent.rationale) lines.push(`*Rationale:* ${p.inherent.rationale}`);
      lines.push('');
    }
    if (p.controls.length > 0) {
      lines.push('**Controls**');
      for (const c of p.controls) {
        lines.push(`- ${c.control_code} — ${c.name} [${c.type} / ${c.strength}]${c.evidence ? ` · evidence: ${c.evidence}` : ''}`);
      }
      lines.push('');
    }
    if (p.residual) {
      const ap = appetitePositionFor(p.residual.residual_score as Score1to5);
      lines.push(`**Residual:** ${p.residual.residual_score}/5 (rollup: ${p.residual.control_quality_rollup}) → ${APPETITE_LABEL[ap]}`);
      lines.push('');
    }
    if (p.appetite) {
      lines.push(`**Appetite — ${APPETITE_LABEL[p.appetite.appetite_position]}**`);
      if (p.appetite.required_action) lines.push(`Required action: ${p.appetite.required_action}`);
      if (p.appetite.target_date) lines.push(`Target: ${p.appetite.target_date}`);
      if (p.appetite.budget_eur != null) lines.push(`Budget: €${Number(p.appetite.budget_eur).toLocaleString()}`);
      if (p.appetite.approved_by) lines.push(`*Approved by ${p.appetite.approved_by}*`);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// Server-side hand-rolled SVG mirroring src/components/risk-atlas/ResidualHeatMap.tsx
function renderHeatMapSvg(paths: ThreatPathFull[]): string {
  const cols = 5; const rows = 5;
  const cellW = 76; const cellH = 56;
  const gridLeft = 100; const gridTop = 50;
  const gridW = cellW * cols; const gridH = cellH * rows;
  const width = gridLeft + gridW + 24; const height = gridTop + gridH + 100;
  const APPETITE_FILL: Record<string, string> = {
    within: '#1B9E4B', boundary: '#F5B300', outside: '#E85D04', unacceptable: '#C81D11',
  };

  const plots = paths
    .filter(p => p.inherent && p.residual)
    .map(p => ({
      path_code: p.path.path_code, name: p.path.name,
      inherent_score: p.inherent!.inherent_score,
      residual_score: p.residual!.residual_score,
      appetite_position: appetitePositionFor(p.residual!.residual_score as Score1to5),
    }));
  const byCell = new Map<string, typeof plots>();
  for (const p of plots) {
    const k = `${p.residual_score},${p.inherent_score}`;
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k)!.push(p);
  }

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">`);
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  parts.push(`<text x="${width / 2}" y="24" text-anchor="middle" font-size="14" font-weight="600" fill="#111">Residual heatmap</text>`);
  parts.push(`<text x="${width / 2}" y="40" text-anchor="middle" font-size="10" fill="#666">Each dot = one threat path. X = residual; Y = inherent.</text>`);

  for (let ri = 0; ri < rows; ri++) {
    for (let ci = 0; ci < cols; ci++) {
      const residual = ci + 1;
      const x = gridLeft + ci * cellW; const y = gridTop + ri * cellH;
      const ratio = residual / cols;
      const fill = ratio <= 0.30 ? '#D6F3DC' : ratio <= 0.50 ? '#FFF3BF' : ratio <= 0.75 ? '#FFD8A8' : '#FFBDB6';
      parts.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${fill}" stroke="#fff"/>`);
    }
  }
  for (let ri = 0; ri < rows; ri++) {
    parts.push(`<text x="${gridLeft - 8}" y="${gridTop + ri * cellH + cellH / 2 + 3}" text-anchor="end" font-size="11" fill="#333">Inherent ${rows - ri}</text>`);
  }
  for (let ci = 0; ci < cols; ci++) {
    parts.push(`<text x="${gridLeft + ci * cellW + cellW / 2}" y="${gridTop + gridH + 16}" text-anchor="middle" font-size="11" fill="#333">R${ci + 1}</text>`);
  }
  for (const [key, items] of byCell.entries()) {
    const [residual, inherent] = key.split(',').map(Number);
    const cx = gridLeft + (residual - 1) * cellW + cellW / 2;
    const cy = gridTop + (rows - inherent) * cellH + cellH / 2;
    const perRow = Math.ceil(Math.sqrt(items.length));
    const step = Math.min(14, (cellW - 16) / Math.max(1, perRow));
    items.forEach((p, idx) => {
      const r = Math.floor(idx / perRow); const c = idx % perRow;
      const dx = (c - (perRow - 1) / 2) * step;
      const dy = (r - (Math.ceil(items.length / perRow) - 1) / 2) * step;
      parts.push(`<g><circle cx="${(cx + dx).toFixed(1)}" cy="${(cy + dy).toFixed(1)}" r="${(step * 0.32).toFixed(1)}" fill="${APPETITE_FILL[p.appetite_position]}" fill-opacity="0.9" stroke="#fff" stroke-width="1.2"><title>${escapeXml(`${p.path_code}: ${p.name}`)}</title></circle></g>`);
    });
  }
  Object.entries(APPETITE_FILL).forEach(([k, v], idx) => {
    parts.push(`<circle cx="${gridLeft + idx * 110}" cy="${height - 18}" r="5" fill="${v}"/>`);
    parts.push(`<text x="${gridLeft + idx * 110 + 10}" y="${height - 14}" font-size="11" fill="#333">${k}</text>`);
  });
  parts.push(`</svg>`);
  return parts.join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
