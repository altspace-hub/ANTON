/**
 * pdf-layout.ts — render an AssembledPack as a regulator-readable PDF binder.
 *
 * Layout (per spec §5.4):
 *   1. Cover page         — title, scope, signer, hash, "what this proves" disclaimer
 *   2. Table of contents  — every item with its type + summary + page
 *   3. Per-item sections  — header (type, hash, regulatory tags) + canonical body
 *   4. Appendix           — manifest hash, signature placeholder
 *
 * Uses pdfkit directly (not the existing generatePdf which is built around
 * markdown rendering). The evidence pack needs precise control over per-item
 * headers and metadata blocks, which a markdown pipeline can't give cleanly.
 */

import PDFDocument from 'pdfkit';
import type { AssembledPack } from './assembler.js';
import { mapCompliance, type ComplianceMapping, type FrameworkResult } from './compliance-mapper.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger('evidence-pack-pdf');

const PAGE = { size: 'A4' as const, margin: 50 };
const COLOR = {
  ink:   '#0F1B2D',
  gray:  '#5A6A7E',
  rule:  '#D5DAE2',
  accent: '#0D7D6C',     // brand teal locked in CLAUDE.md
  warn:  '#B45309',
};
const FONT = { regular: 'Helvetica', bold: 'Helvetica-Bold', mono: 'Courier' };

export function generateEvidencePackPdf(assembled: AssembledPack): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: PAGE.size,
      margins: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
      bufferPages: true,
      info: {
        Title: `Evidence Pack — ${assembled.pack.title}`,
        Author: assembled.pack.created_by,
        Creator: 'ANTON Evidence Pack module',
        Subject: assembled.pack.purpose ?? '',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Cover ───────────────────────────────────────────────────────────
    const compliance = mapCompliance(
      assembled,
      assembled.pack.compliance_frameworks,
      assembled.pack.compliance_gaps,
    );
    drawCover(doc, assembled, compliance);

    // ── Compliance coverage (always before ToC so regulators see gaps
    //    before they see the item list) ─────────────────────────────────
    doc.addPage();
    drawCompliance(doc, compliance);

    // ── Table of contents (always starts on a new page) ────────────────
    doc.addPage();
    drawToc(doc, assembled);

    // ── Per-item sections ───────────────────────────────────────────────
    for (const item of assembled.collectedItems) {
      doc.addPage();
      drawItem(doc, item, assembled);
    }

    // ── Appendix ────────────────────────────────────────────────────────
    doc.addPage();
    drawAppendix(doc, assembled);

    // ── Page numbers + footer (post-pass; needs bufferPages) ──────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      drawFooter(doc, i + 1, range.count, assembled);
    }

    doc.end();
    log.info({ packId: assembled.pack.id, pages: range.count }, 'pack_pdf_rendered');
  });
}

// ── Sections ───────────────────────────────────────────────────────────────

function drawCover(doc: PDFKit.PDFDocument, a: AssembledPack, compliance: ComplianceMapping): void {
  const { width } = doc.page;

  doc.fillColor(COLOR.accent).font(FONT.bold).fontSize(10)
    .text('EVIDENCE PACK', PAGE.margin, 80, { characterSpacing: 2 });
  doc.moveDown(0.5);
  doc.fillColor(COLOR.ink).font(FONT.bold).fontSize(22).text(a.pack.title);
  if (a.pack.purpose) {
    doc.moveDown(0.3);
    doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(11).text(a.pack.purpose);
  }

  // Metadata block
  doc.moveDown(2);
  const metaTop = doc.y;
  drawKv(doc, 'Pack ID', a.pack.id);
  drawKv(doc, 'Scope', a.manifest.scope.label);
  drawKv(doc, 'Created by', a.pack.created_by);
  drawKv(doc, 'Created at', isoToLocale(a.pack.created_at));
  drawKv(doc, 'Status', a.pack.status);
  drawKv(doc, 'Item count', String(a.collectedItems.length));
  drawKv(doc, 'Compliance frameworks', a.manifest.complianceFrameworks.join(', '));
  drawKv(doc, 'Manifest hash', a.manifest.manifestHash, true);
  if (a.pack.retention_until) {
    drawKv(doc, 'Retention until', isoToLocale(a.pack.retention_until));
  }
  if (a.pack.legal_hold) {
    drawKv(doc, 'Legal hold', 'YES — cannot be deleted', false, COLOR.warn);
  }

  // Items-by-type summary
  doc.moveDown(1.5);
  doc.fillColor(COLOR.ink).font(FONT.bold).fontSize(11).text('What this pack contains');
  doc.moveDown(0.3);
  doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(10);
  for (const [t, n] of Object.entries(a.manifest.itemsByType).sort((x, y) => y[1] - x[1])) {
    doc.text(`  • ${n} × ${t}`);
  }

  // Compliance summary on the cover (spec §11.3 acceptance: "gaps either
  // filled, justified, or explicitly accepted with rationale visible on the
  // cover page").
  doc.moveDown(1.2);
  doc.fillColor(COLOR.ink).font(FONT.bold).fontSize(11).text('Compliance coverage');
  doc.moveDown(0.3);
  doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(10);
  for (const fr of compliance.frameworks) {
    const open = fr.gapCount - fr.acceptedGapCount;
    const tone = open > 0 ? COLOR.warn : COLOR.accent;
    doc.fillColor(tone).text(`  • ${fr.label}`);
    doc.fillColor(COLOR.gray).fontSize(9)
      .text(`    ${fr.evidencedCount} evidenced · ${open} open gaps · ${fr.acceptedGapCount} accepted gaps · ${fr.notApplicableCount} not applicable`);
    doc.fontSize(10);
  }

  // Accepted-gap list — surfaced on the cover so regulators see exactly
  // which gaps the owner explicitly accepted.
  const accepted = compliance.frameworks.flatMap((fr) =>
    fr.points.filter((p) => p.acceptance).map((p) => ({ fr, p })),
  );
  if (accepted.length > 0) {
    doc.moveDown(0.8);
    doc.fillColor(COLOR.warn).font(FONT.bold).fontSize(10).text('Accepted gaps (owner has documented why these are not evidenced):');
    doc.moveDown(0.2);
    doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(9);
    for (const { p } of accepted.slice(0, 6)) {
      doc.text(`  • ${p.label}`);
      doc.fillColor(COLOR.gray).fontSize(8)
        .text(`    "${truncate(p.acceptance!.rationale, 110)}"`);
      doc.fillColor(COLOR.ink).fontSize(9);
    }
    if (accepted.length > 6) {
      doc.fillColor(COLOR.gray).fontSize(8).text(`  … and ${accepted.length - 6} more — see compliance section`);
      doc.fillColor(COLOR.ink).fontSize(9);
    }
  }

  // Disclaimer (verbatim per spec §9.4)
  doc.moveDown(2);
  const disclaimerY = doc.y;
  doc.rect(PAGE.margin, disclaimerY, width - 2 * PAGE.margin, 90)
    .fillColor('#FFF7E6').fill();
  doc.fillColor(COLOR.warn).font(FONT.bold).fontSize(10)
    .text('What signing does and does not prove', PAGE.margin + 12, disclaimerY + 10);
  doc.moveDown(0.3);
  doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(9)
    .text(
      'Does prove: this pack\'s contents existed in this exact form at the moment of finalisation, '
      + 'and were finalised by this authenticated user. '
      + 'Does NOT prove: the contents reflect reality outside ANTON. '
      + 'The pack proves the platform\'s internal record; the underlying professional work being '
      + 'documented must be independently assessed.',
      PAGE.margin + 12, disclaimerY + 26,
      { width: width - 2 * PAGE.margin - 24, align: 'left' },
    );
  void metaTop;
}

function drawCompliance(doc: PDFKit.PDFDocument, mapping: ComplianceMapping): void {
  doc.fillColor(COLOR.ink).font(FONT.bold).fontSize(16).text('Compliance Coverage');
  doc.moveDown(0.3);
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(9)
    .text(`Per-framework mapping. ${mapping.totalGaps} open gap(s) across all frameworks · ${mapping.totalAccepted} accepted gap(s).`);
  doc.moveDown(0.5);
  doc.moveTo(PAGE.margin, doc.y).lineTo(doc.page.width - PAGE.margin, doc.y)
    .strokeColor(COLOR.rule).lineWidth(0.5).stroke();
  doc.moveDown(0.5);

  for (const fr of mapping.frameworks) {
    drawFramework(doc, fr);
    doc.moveDown(0.8);
  }
}

function drawFramework(doc: PDFKit.PDFDocument, fr: FrameworkResult): void {
  doc.fillColor(COLOR.ink).font(FONT.bold).fontSize(12).text(fr.label);
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(8).text(fr.citation);
  doc.moveDown(0.2);
  doc.fillColor(COLOR.gray).fontSize(9)
    .text(`${fr.evidencedCount} evidenced · ${fr.gapCount - fr.acceptedGapCount} open gaps · ${fr.acceptedGapCount} accepted gaps · ${fr.notApplicableCount} N/A`);
  doc.moveDown(0.4);

  for (const p of fr.points) {
    if (doc.y > doc.page.height - 80) doc.addPage();
    const icon = p.status === 'evidenced' ? '✓'
      : p.status === 'not_applicable' ? '·'
      : p.acceptance ? '!' : '✗';
    const tone = p.status === 'evidenced' ? COLOR.accent
      : p.status === 'not_applicable' ? COLOR.gray
      : p.acceptance ? COLOR.warn : '#B91C1C';
    doc.fillColor(tone).font(FONT.bold).fontSize(10)
      .text(`${icon}  ${p.label}`, { continued: false });
    if (p.notes) {
      doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(8).text(`    ${truncate(p.notes, 200)}`);
    }
    if (p.acceptance) {
      doc.fillColor(COLOR.warn).font(FONT.regular).fontSize(8)
        .text(`    Accepted by ${p.acceptance.acceptedBy} (${isoToLocale(p.acceptance.acceptedAt)}):`);
      doc.fillColor(COLOR.ink).fontSize(8)
        .text(`    "${truncate(p.acceptance.rationale, 240)}"`);
    } else if (p.evidence.length > 0) {
      doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(8)
        .text(`    Evidence: ${p.evidence.length} item(s) — ${p.evidence.slice(0, 3).map((e) => e.type).join(', ')}${p.evidence.length > 3 ? '…' : ''}`);
    }
    doc.moveDown(0.25);
  }
}

function drawToc(doc: PDFKit.PDFDocument, a: AssembledPack): void {
  doc.fillColor(COLOR.ink).font(FONT.bold).fontSize(16).text('Contents');
  doc.moveDown(0.5);
  doc.moveTo(PAGE.margin, doc.y).lineTo(doc.page.width - PAGE.margin, doc.y)
    .strokeColor(COLOR.rule).lineWidth(0.5).stroke();
  doc.moveDown(0.5);

  doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(10);
  for (const item of a.collectedItems) {
    const line = `${pad(item.itemType, 16)} ${truncate(item.itemSummary, 70)}`;
    doc.text(line, { lineGap: 2 });
  }
}

function drawItem(doc: PDFKit.PDFDocument, item: AssembledPack['collectedItems'][number], a: AssembledPack): void {
  const { width } = doc.page;
  const idx = a.collectedItems.indexOf(item) + 1;

  // Header strip
  doc.rect(PAGE.margin, PAGE.margin, width - 2 * PAGE.margin, 32)
    .fillColor('#F5F7FA').fill();
  doc.fillColor(COLOR.accent).font(FONT.bold).fontSize(10)
    .text(`#${idx}  ·  ${item.itemType.toUpperCase()}`, PAGE.margin + 10, PAGE.margin + 9, { characterSpacing: 1 });
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(9)
    .text(item.itemSummary, PAGE.margin + 10, PAGE.margin + 22, { width: width - 2 * PAGE.margin - 20 });

  doc.y = PAGE.margin + 50;

  // Hash + relevance
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(8)
    .text(`Hash: ${item.itemHash}`, { lineGap: 1 });
  if (item.regulatoryRelevance.length > 0) {
    doc.text(`Regulatory relevance: ${item.regulatoryRelevance.join(', ')}`, { lineGap: 1 });
  }
  doc.text(`Source: ${item.itemTable} / ${item.itemId}`, { lineGap: 1 });

  doc.moveDown(0.6);

  // Canonical body — render as monospace JSON block. Pdfkit will paginate.
  doc.fillColor(COLOR.ink).font(FONT.mono).fontSize(8)
    .text(prettyJson(item.canonicalJson), { lineGap: 1, paragraphGap: 0 });
}

function drawAppendix(doc: PDFKit.PDFDocument, a: AssembledPack): void {
  doc.fillColor(COLOR.ink).font(FONT.bold).fontSize(16).text('Appendix — Cryptographic Proofs');
  doc.moveDown(0.5);
  doc.moveTo(PAGE.margin, doc.y).lineTo(doc.page.width - PAGE.margin, doc.y)
    .strokeColor(COLOR.rule).lineWidth(0.5).stroke();
  doc.moveDown(0.7);

  doc.fillColor(COLOR.ink).font(FONT.bold).fontSize(11).text('Manifest hash');
  doc.fillColor(COLOR.ink).font(FONT.mono).fontSize(9).text(a.manifest.manifestHash);

  doc.moveDown(0.7);
  doc.fillColor(COLOR.ink).font(FONT.bold).fontSize(11).text('Signature');
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(9)
    .text(a.manifest.signature ?? '(Phase 2: Ed25519 signature over manifestHash will appear here.)');

  doc.moveDown(0.7);
  doc.fillColor(COLOR.ink).font(FONT.bold).fontSize(11).text('Verification');
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(9)
    .text('To verify this pack:', { lineGap: 2 });
  doc.text('1. Recompute the SHA-256 of every item from items/ and check against the hash in this manifest.');
  doc.text('2. Recompute the manifest hash by canonicalising the manifest JSON with the manifestHash, signature, and signerPublicKey fields cleared, plus created.at pinned to "__pinned__".');
  doc.text('3. (Phase 2) Verify the Ed25519 signature against signerPublicKey.');
}

function drawFooter(doc: PDFKit.PDFDocument, page: number, total: number, a: AssembledPack): void {
  const y = doc.page.height - 30;
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(8)
    .text(`${a.pack.id}  ·  ${truncate(a.pack.title, 60)}`, PAGE.margin, y, { width: doc.page.width / 2 });
  doc.text(`Page ${page} of ${total}`, doc.page.width / 2, y, {
    width: doc.page.width / 2 - PAGE.margin, align: 'right',
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function drawKv(doc: PDFKit.PDFDocument, label: string, value: string, mono = false, color: string = COLOR.ink): void {
  const labelWidth = 130;
  const startX = PAGE.margin;
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(9)
    .text(label, startX, doc.y, { continued: true, width: labelWidth });
  doc.fillColor(color).font(mono ? FONT.mono : FONT.regular).fontSize(9)
    .text(value, { lineGap: 2 });
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function isoToLocale(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function prettyJson(canonical: string): string {
  try { return JSON.stringify(JSON.parse(canonical), null, 2); }
  catch { return canonical; }
}
