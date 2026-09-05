/**
 * export-xlsx.ts
 * Converts Markdown content to a formatted Excel (.xlsx) file.
 * Intelligently detects tables and renders them as proper Excel sheets
 * with conditional formatting (🟢🟡🔴), freeze panes, auto-filters,
 * and column sizing.
 *
 * Non-table content is put on a "Summary" sheet as readable text.
 */

// ── Locale-aware export section labels ───────────────────────
const EXPORT_LABELS: Record<string, Record<string, string>> = {
  en: {
    executiveSummary: 'Executive Summary',
    analysis: 'Analysis',
    recommendations: 'Recommendations',
    introduction: 'Introduction',
    conclusion: 'Conclusion',
    references: 'References',
    methodology: 'Methodology',
    background: 'Background',
    keyFindings: 'Key Findings',
  },
  ar: {
    executiveSummary: 'الملخص التنفيذي',
    analysis: 'التحليل',
    recommendations: 'التوصيات',
    introduction: 'مقدمة',
    conclusion: 'خاتمة',
    references: 'المراجع',
    methodology: 'المنهجية',
    background: 'الخلفية',
    keyFindings: 'النتائج الرئيسية',
  },
  de: {
    executiveSummary: 'Zusammenfassung',
    analysis: 'Analyse',
    recommendations: 'Empfehlungen',
    introduction: 'Einleitung',
    conclusion: 'Fazit',
    references: 'Referenzen',
    methodology: 'Methodik',
    background: 'Hintergrund',
    keyFindings: 'Wichtigste Erkenntnisse',
  },
  es: {
    executiveSummary: 'Resumen Ejecutivo',
    analysis: 'Análisis',
    recommendations: 'Recomendaciones',
    introduction: 'Introducción',
    conclusion: 'Conclusión',
    references: 'Referencias',
    methodology: 'Metodología',
    background: 'Antecedentes',
    keyFindings: 'Hallazgos Clave',
  },
  fr: {
    executiveSummary: 'Résumé Exécutif',
    analysis: 'Analyse',
    recommendations: 'Recommandations',
    introduction: 'Introduction',
    conclusion: 'Conclusion',
    references: 'Références',
    methodology: 'Méthodologie',
    background: 'Contexte',
    keyFindings: 'Conclusions Clés',
  },
  hi: {
    executiveSummary: 'कार्यकारी सारांश',
    analysis: 'विश्लेषण',
    recommendations: 'सिफारिशें',
    introduction: 'परिचय',
    conclusion: 'निष्कर्ष',
    references: 'संदर्भ',
    methodology: 'पद्धति',
    background: 'पृष्ठभूमि',
    keyFindings: 'मुख्य निष्कर्ष',
  },
  ja: {
    executiveSummary: 'エグゼクティブサマリー',
    analysis: '分析',
    recommendations: '推奨事項',
    introduction: 'はじめに',
    conclusion: '結論',
    references: '参考文献',
    methodology: '方法論',
    background: '背景',
    keyFindings: '主な発見事項',
  },
  ko: {
    executiveSummary: '경영진 요약',
    analysis: '분석',
    recommendations: '권고사항',
    introduction: '서론',
    conclusion: '결론',
    references: '참고문헌',
    methodology: '방법론',
    background: '배경',
    keyFindings: '주요 결과',
  },
  pt: {
    executiveSummary: 'Resumo Executivo',
    analysis: 'Análise',
    recommendations: 'Recomendações',
    introduction: 'Introdução',
    conclusion: 'Conclusão',
    references: 'Referências',
    methodology: 'Metodologia',
    background: 'Contexto',
    keyFindings: 'Principais Conclusões',
  },
  'zh-CN': {
    executiveSummary: '执行摘要',
    analysis: '分析',
    recommendations: '建议',
    introduction: '介绍',
    conclusion: '结论',
    references: '参考文献',
    methodology: '方法论',
    background: '背景',
    keyFindings: '主要发现',
  },
};

/**
 * Returns localised section header labels for the given language.
 * Falls back to English for any language not in the map.
 */
export function getExportLabels(language: string): Record<string, string> {
  return EXPORT_LABELS[language] ?? EXPORT_LABELS['en'];
}

import ExcelJS from 'exceljs';

// ── Brand config type ────────────────────────────────────────
interface BrandFontEntry { family: string; size: string; color: string }
interface BrandConfig {
  fonts: { body: BrandFontEntry; h1: BrandFontEntry; h2: BrandFontEntry; h3: BrandFontEntry; h4: BrandFontEntry };
  palette: string[];
}

// ── Default brand colours (hex without #) ────────────────────
const DEF_TEAL = '2DD4A8';
const DEF_DARK = '0F1B2D';
const DEF_HEADER_BG = '152238';
const DEF_HEADER_FG = 'FFFFFF';
const DEF_ALT_ROW = '1A2E48';

/** Strip '#' from hex color */
function hexStrip(c: string): string { return c.replace('#', ''); }

/** Resolve brand overrides for Excel styling */
function resolveXlsxStyle(brand?: BrandConfig | null) {
  return {
    accent:   brand?.palette?.[0] ? hexStrip(brand.palette[0]) : DEF_TEAL,
    headerBg: DEF_HEADER_BG,
    headerFg: DEF_HEADER_FG,
    dark:     DEF_DARK,
    altRow:   DEF_ALT_ROW,
    titleFont: brand?.fonts?.h1?.family || 'Calibri',
  };
}

// ── RAG status detection ────────────────────────────────────
//
// Two things made the old version paint cells the wrong colour.
//
// 1. It matched with a bare `lower.startsWith(key)`. `high` is a key, so "Highly
//    effective" — a GOOD rating — was painted red. `red` is a key, so "Reduced" and
//    "Redundant" were too. `low` is a key, so "Lowest maturity" went green. Matching is
//    now anchored on a word boundary, and keys are tried longest-first so
//    "non-compliant" and "highly effective" win over "compliant" and "high".
//
// 2. `high`/`medium`/`low` have no fixed polarity. High RISK is red; high
//    EFFECTIVENESS is green. With one hardcoded mapping, every maturity, readiness and
//    control-strength matrix ANTON produces was inverted — the exporter confidently
//    coloured the good half of the assessment red. The column header now picks the
//    polarity. Words that carry their own polarity ("strong", "critical", "compliant")
//    are never flipped.

const RAG_GREEN = { bgColor: '1A4731', fgColor: '27AE60' };
const RAG_AMBER = { bgColor: '4A3900', fgColor: 'F5A623' };
const RAG_ORANGE = { bgColor: '4A2700', fgColor: 'E67E22' };
// Four-band scales (the Gap Assessor scores red / amber / yellow / green) need a
// tone between amber and green. Without it 'yellow' matched nothing and those
// rows rendered as plain alternating fill — on the AMLR run that was a fifth of
// all findings silently uncoloured while red and amber stood out.
const RAG_YELLOW = { bgColor: '4A4200', fgColor: 'D4C122' };
const RAG_RED   = { bgColor: '4A1010', fgColor: 'E74C3C' };

type RagColor = { bgColor: string; fgColor: string };

/** Ratings whose meaning does not depend on what the column measures. */
const RAG_ABSOLUTE: Record<string, RagColor> = {
  '🟢': RAG_GREEN, '🟡': RAG_AMBER, '🟠': RAG_ORANGE, '🔴': RAG_RED,
  '✅': RAG_GREEN, '❌': RAG_RED,
  green: RAG_GREEN, amber: RAG_AMBER, yellow: RAG_YELLOW, red: RAG_RED,
  // Compliance
  compliant: RAG_GREEN,
  'non-compliant': RAG_RED,
  'not compliant': RAG_RED,
  'partially compliant': RAG_AMBER,
  partial: RAG_AMBER,
  // Control strength — the Risk Atlas vocabulary (Strong / Adequate / Weak)
  strong: RAG_GREEN,
  adequate: RAG_AMBER,
  weak: RAG_RED,
  // Effectiveness
  'highly effective': RAG_GREEN,
  'fully effective': RAG_GREEN,
  effective: RAG_GREEN,
  'partially effective': RAG_AMBER,
  'not effective': RAG_RED,
  ineffective: RAG_RED,
  satisfactory: RAG_GREEN,
  unsatisfactory: RAG_RED,
  // Appetite (Risk Atlas stage 7)
  'within appetite': RAG_GREEN,
  'outside appetite': RAG_RED,
  unacceptable: RAG_RED,
  // Outcomes
  pass: RAG_GREEN,
  fail: RAG_RED,
  'on track': RAG_GREEN,
  'off track': RAG_RED,
  'at risk': RAG_AMBER,
  overdue: RAG_RED,
  complete: RAG_GREEN,
  completed: RAG_GREEN,
  critical: RAG_RED,
  severe: RAG_RED,
  negligible: RAG_GREEN,
};

/** Magnitude words: colour depends entirely on what the column measures. */
const RAG_SCALED = [
  'very high', 'highest', 'high',
  'medium', 'moderate',
  'very low', 'lowest', 'low',
] as const;

/**
 * Headers where a HIGH value is good. Everything else is treated as risk-like
 * (high = bad), which is the safer default for a compliance tool: under-stating a
 * risk is worse than under-stating a maturity score.
 */
const HIGHER_IS_BETTER = /effect|control|maturity|readiness|strength|confidence|quality|coverage|compliance|assurance|capabilit|performance|score|rating/i;
const HIGHER_IS_WORSE  = /risk|severity|impact|likelihood|probability|priority|gap|exposure|threat|vulnerab|deficien|issue|incident|breach|penalt/i;

function headerFavoursHigh(header: string): boolean {
  // A header naming a risk wins even if it also contains a positive word, so
  // "Control Risk Rating" is treated as a risk column.
  if (HIGHER_IS_WORSE.test(header)) return false;
  return HIGHER_IS_BETTER.test(header);
}

/** Escape a key for use in a RegExp — several are emoji or contain '-'. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `key` appears at the start of `value` as a whole word/phrase.
 * "highly effective" must not match key "high"; "Reduced" must not match "red".
 * Emoji have no word boundary, so they match as a bare prefix.
 */
function matchesKey(value: string, key: string): boolean {
  if (!/[a-z0-9]$/i.test(key)) return value.startsWith(key);   // emoji / symbol
  return new RegExp(`^${escapeRe(key)}\\b`, 'i').test(value);
}

function detectRag(value: string, header = ''): RagColor | null {
  const lower = value.toLowerCase().trim();
  if (!lower) return null;

  // Longest first: "non-compliant" before "compliant", "highly effective" before
  // "effective". Object key order must never be load-bearing here.
  const absolute = Object.keys(RAG_ABSOLUTE).sort((a, b) => b.length - a.length);
  for (const key of absolute) {
    if (matchesKey(lower, key)) return RAG_ABSOLUTE[key];
  }

  for (const key of [...RAG_SCALED].sort((a, b) => b.length - a.length)) {
    if (!matchesKey(lower, key)) continue;
    const isHigh = key.includes('high');
    const isLow = key.includes('low');
    if (!isHigh && !isLow) return RAG_AMBER;                   // medium / moderate
    const good = headerFavoursHigh(header) ? isHigh : isLow;
    return good ? RAG_GREEN : RAG_RED;
  }

  return null;
}

// ── Numeric cell coercion ───────────────────────────────────
//
// Markdown table cells are strings, and `ws.addRow(string[])` makes every one of them
// TEXT in Excel. A budget or scoring sheet then cannot be summed, sorted or charted,
// and Excel decorates each cell with its "number stored as text" warning — which is
// most of the value of exporting to .xlsx rather than .md in the first place.
//
// Coercion is deliberately conservative: mis-typing an identifier is worse than leaving
// a number as text. "007" must not become 7, "2026-07-28" must not become a date
// serial, and "1.2.3" must stay a version string. Anything not clearly a number is left
// exactly as written.

const CURRENCY = '\\$|€|£|¥|kr|SEK|NOK|DKK|EUR|USD|GBP|CHF|JPY';

/** A number Excel can compute on, plus the format that preserves how it was written. */
export function parseNumericCell(raw: string): { value: number; numFmt: string } | null {
  const s = raw.trim();
  if (!s) return null;

  // Dates, versions, ranges, ratios, ids — numeric-looking but not numbers.
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return null;           // 2026-07-28
  if (/^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/.test(s)) return null;  // 28/07/2026
  if (/^\d+(\.\d+){2,}$/.test(s)) return null;                 // 1.2.3
  if (/^\d+\s*[-–—/]\s*\d+$/.test(s)) return null;             // 1-5, 3/5

  let body = s;
  let numFmt = '#,##0.###';
  let sign = 1;

  // Accounting negatives: (1,234)
  const paren = body.match(/^\((.*)\)$/);
  if (paren) { body = paren[1].trim(); sign = -1; }

  const pct = /%$/.test(body);
  if (pct) body = body.replace(/%$/, '').trim();

  let currency = '';
  const curMatch = body.match(new RegExp(`^(${CURRENCY})\\s*|\\s*(${CURRENCY})$`, 'i'));
  if (curMatch) {
    currency = (curMatch[1] || curMatch[2] || '').trim();
    body = body.replace(new RegExp(`^(${CURRENCY})\\s*|\\s*(${CURRENCY})$`, 'gi'), '').trim();
  }

  if (body.startsWith('-')) { sign *= -1; body = body.slice(1).trim(); }
  else if (body.startsWith('+')) body = body.slice(1).trim();

  // Leading zeros are significant — an account or article number, not a quantity.
  if (/^0\d/.test(body)) return null;

  // A single dot followed by exactly three digits is the one genuinely undecidable
  // form: "1.200" is 1.2 in English and 1200 in German. Guessing wrong is a 1000x
  // error in a client's budget, so it stays text. "0.500" is exempt — a leading zero
  // means the dot is a decimal point in either convention.
  if (/^[1-9]\d{0,2}\.\d{3}$/.test(body)) return null;

  // Thousands separators: 1,234.56 or 1 234,56 / 1.234,56. A comma with exactly three
  // digits is read as grouping, with one or two as a decimal comma ("12,50") — the
  // usual heuristic, and unambiguous in practice because decimal commas carry 1-2
  // places and groups always carry 3.
  let normalised: string;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(body)) normalised = body.replace(/,/g, '');
  // Leading group must be 1-9: "0.500" is a decimal, never a grouped thousand.
  else if (/^[1-9]\d{0,2}([ .]\d{3})+(,\d+)?$/.test(body)) normalised = body.replace(/[ .]/g, '').replace(',', '.');
  else if (/^\d+(\.\d+)?$/.test(body)) normalised = body;
  else if (/^\d+,\d{1,2}$/.test(body)) normalised = body.replace(',', '.');   // 12,50
  else return null;

  const value = sign * Number(normalised);
  if (!Number.isFinite(value)) return null;

  const decimals = normalised.includes('.') ? normalised.split('.')[1].length : 0;

  if (pct) {
    // Excel percentages are fractions; 45 -> 0.45 formatted '0%' displays "45%" and
    // sums correctly. Storing 45 with a '%' format would display "4500%".
    return { value: value / 100, numFmt: decimals > 0 ? `0.${'0'.repeat(decimals)}%` : '0%' };
  }
  if (currency) {
    const sym = currency.replace(/"/g, '');
    numFmt = `"${sym}"#,##0${decimals > 0 ? '.' + '0'.repeat(decimals) : '.00'}`;
    return { value, numFmt };
  }
  numFmt = decimals > 0 ? `#,##0.${'0'.repeat(decimals)}` : '#,##0';
  return { value, numFmt };
}

// ── Parse markdown table ───────────────────────────────────

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

function parseMarkdownTable(lines: string[]): ParsedTable | null {
  const nonDivider = lines.filter((l) => !l.match(/^\|[\s:-]+\|/));
  if (nonDivider.length < 1) return null;

  function splitRow(line: string): string[] {
    return line.split('|').slice(1, -1).map((c) => c.trim());
  }

  const [headerLine, ...dataLines] = nonDivider;
  return {
    headers: splitRow(headerLine),
    rows: dataLines.map(splitRow),
  };
}

// ── Parse markdown into sections ──────────────────────────

interface Section {
  heading: string;
  tables: ParsedTable[];
  text: string[];
}

function parseMarkdown(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [{ heading: 'Summary', tables: [], text: [] }];
  let current = sections[0];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // New section on headings
    if (line.startsWith('# ') || line.startsWith('## ') || line.startsWith('### ')) {
      const heading = line.replace(/^#+\s+/, '').trim();
      current = { heading, tables: [], text: [] };
      sections.push(current);
      i++;
      continue;
    }

    // Table block
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const parsed = parseMarkdownTable(tableLines);
      if (parsed) current.tables.push(parsed);
      continue;
    }

    if (line.trim()) current.text.push(line);
    i++;
  }

  return sections.filter((s) => s.tables.length > 0 || s.text.length > 0);
}

// ── Apply header row style ──────────────────────────────────

function styleHeaderRow(row: ExcelJS.Row, colCount: number, style: ReturnType<typeof resolveXlsxStyle>) {
  row.height = 24;
  for (let col = 1; col <= colCount; col++) {
    const cell = row.getCell(col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${style.headerBg}` } };
    cell.font = { bold: true, color: { argb: `FF${style.headerFg}` }, size: 11 };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = {
      bottom: { style: 'medium', color: { argb: `FF${style.accent}` } },
    };
  }
}

// ── Apply data row style ────────────────────────────────────

function styleDataRow(
  row: ExcelJS.Row,
  rowIndex: number,
  colCount: number,
  style: ReturnType<typeof resolveXlsxStyle>,
  headers: string[] = [],
  numeric: Array<{ value: number; numFmt: string } | null> = [],
) {
  const isAlt = rowIndex % 2 === 0;
  // Cells already carry wrapText, but a fixed height clips every wrapped line
  // after the first — so a column holding a requirement or a recommendation
  // showed one truncated line and looked broken. Leave the height unset when a
  // cell is long enough to wrap and let Excel auto-fit it; keep the compact
  // 20px for ordinary short rows so dense tables stay dense.
  const hasLongCell = row.values instanceof Array
    && (row.values as unknown[]).some((v) => typeof v === 'string' && v.length > 60);
  if (!hasLongCell) row.height = 20;
  for (let col = 1; col <= colCount; col++) {
    const cell = row.getCell(col);
    const num = numeric[col - 1];

    if (num) {
      // Real number + the format it was written in, so it sums and sorts.
      cell.numFmt = num.numFmt;
      cell.alignment = { vertical: 'top', horizontal: 'right' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isAlt ? `FF${style.altRow}` : `FF${style.dark}` },
      };
      cell.font = { color: { argb: 'FFE0E0E0' }, size: 10 };
      continue;
    }

    const cellVal = String(cell.value ?? '');
    const rag = detectRag(cellVal, headers[col - 1] ?? '');

    if (rag) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${rag.bgColor}` } };
      cell.font = { color: { argb: `FF${rag.fgColor}` }, bold: true, size: 10 };
    } else {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isAlt ? `FF${style.altRow}` : `FF${style.dark}` },
      };
      cell.font = { color: { argb: 'FFE0E0E0' }, size: 10 };
    }
    cell.alignment = { vertical: 'top', wrapText: true };
  }
}

const LEGAL_DISCLAIMER_TEXT = 'This document has been prepared by ANTON AI (openEXPERT) for informational purposes only. It does not constitute legal, regulatory, or compliance advice. The analysis is based on information provided and AI-generated content, which may contain errors or omissions. Users must verify all findings independently and consult qualified legal and compliance professionals before acting on this output. Futurechain / openEXPERT accepts no liability for decisions made based on this document.';

// ── Cover-sheet styling constants (print-friendly, neutral) ──
// Kept independent of `style.dark` / `style.altRow` (which are tuned
// for the data sheets' dark-on-dark theme) so the cover stays readable
// on a printed page regardless of brand accent.
const COVER_INK    = '1A1B2E';
const COVER_BODY   = '3C3D4E';
const COVER_MUTED  = '6B6B7E';
const COVER_LIGHT  = 'FAFAFA';
const COVER_BORDER = 'E4E1DA';

type XlsxCoverMetadata = {
  title?: string;
  subject?: string;
  author?: string;
  model?: string;
  thinking?: string;
  moduleId?: string;
  sessionId?: string;
  creativity?: string;
  documentsLoaded?: string[];
  clientName?: string;
  projectName?: string;
  version?: string;
  reviewer?: string;
  status?: 'DRAFT' | 'FINAL' | 'CONFIDENTIAL DRAFT' | string;
  classificationLabel?: string;
};

// EXPORT-COVER-XLSX: build the front cover sheet for the workbook.
// Brand-customisable: top accent bar + label cell colour scale with
// `style.accent`. Lays out:
//   • ANTON branding + AI-assisted subtitle
//   • Classification
//   • Title + subject
//   • Status pill
//   • Governance & technical metadata table (zebra rows)
//   • About this analysis + Sources & scope
function buildCoverSheet(
  workbook: ExcelJS.Workbook,
  meta: XlsxCoverMetadata,
  style: ReturnType<typeof resolveXlsxStyle>,
  sectionCount: number,
) {
  const ws = workbook.addWorksheet('Cover', {
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'portrait', margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    views: [{ showGridLines: false }],
  });
  ws.properties.tabColor = { argb: `FF${style.accent}` };
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 70;

  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const titleFont = style.titleFont;

  // Row 1 — top accent bar (slim).
  const barRow = ws.addRow(['', '']);
  barRow.height = 8;
  for (let c = 1; c <= 2; c++) {
    barRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${style.accent}` } };
  }

  // Spacer.
  ws.addRow(['', '']).height = 8;

  // Branding line.
  const brandRow = ws.addRow(['ANTON by openEXPERT', '']);
  ws.mergeCells(brandRow.number, 1, brandRow.number, 2);
  brandRow.getCell(1).font = { name: titleFont, bold: true, size: 18, color: { argb: `FF${style.accent}` } };
  brandRow.getCell(1).alignment = { vertical: 'middle' };
  brandRow.height = 26;

  const subBrandRow = ws.addRow(['AI-assisted analysis · requires professional review', '']);
  ws.mergeCells(subBrandRow.number, 1, subBrandRow.number, 2);
  subBrandRow.getCell(1).font = { name: titleFont, italic: true, size: 10, color: { argb: `FF${COVER_MUTED}` } };
  subBrandRow.height = 16;

  ws.addRow(['', '']).height = 8;

  // Classification.
  const classification = (meta.classificationLabel || 'CONFIDENTIAL — For Recipient Only').toUpperCase();
  const classRow = ws.addRow([classification, '']);
  ws.mergeCells(classRow.number, 1, classRow.number, 2);
  classRow.getCell(1).font = { name: titleFont, bold: true, size: 10, color: { argb: 'FFC0392B' } };
  classRow.height = 16;

  ws.addRow(['', '']).height = 12;

  // Big title.
  const titleRow = ws.addRow([meta.title || 'Analysis Report', '']);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 2);
  titleRow.getCell(1).font = { name: titleFont, bold: true, size: 26, color: { argb: `FF${COVER_INK}` } };
  titleRow.getCell(1).alignment = { vertical: 'middle', wrapText: true };
  titleRow.height = 36;

  if (meta.subject) {
    const subjRow = ws.addRow([meta.subject, '']);
    ws.mergeCells(subjRow.number, 1, subjRow.number, 2);
    subjRow.getCell(1).font = { name: titleFont, size: 12, color: { argb: `FF${COVER_BODY}` } };
    subjRow.getCell(1).alignment = { vertical: 'middle', wrapText: true };
    subjRow.height = 20;
  }

  // Status pill.
  const status = meta.status || 'DRAFT';
  const statusColor = status === 'FINAL' ? '1E8E4E' : status === 'CONFIDENTIAL DRAFT' ? 'C0392B' : 'C8881E';
  const statusRow = ws.addRow([`▌ ${status}`, '']);
  ws.mergeCells(statusRow.number, 1, statusRow.number, 2);
  statusRow.getCell(1).font = { name: titleFont, bold: true, size: 12, color: { argb: `FF${statusColor}` } };
  statusRow.height = 20;

  ws.addRow(['', '']).height = 14;

  // Metadata table — zebra rows, accent top/bottom borders, hairline grid.
  const govRows: Array<[string, string]> = [
    ['Client', meta.clientName || '—'],
    ['Project', meta.projectName || '—'],
    ['Date', date],
    ['Version', meta.version || 'v1.0'],
    ['Author', meta.author || 'ANTON by openEXPERT'],
    ['Reviewer', meta.reviewer || '________________________'],
  ];
  const techRows: Array<[string, string]> = [];
  if (meta.moduleId)   techRows.push(['Module', meta.moduleId]);
  if (meta.model)      techRows.push(['Model', meta.model]);
  if (meta.thinking)   techRows.push(['Thinking level', meta.thinking]);
  if (meta.creativity) techRows.push(['Creativity', meta.creativity]);
  techRows.push(['Sheets', `${sectionCount} data sheet${sectionCount === 1 ? '' : 's'} + Disclaimer`]);
  if (meta.sessionId)  techRows.push(['Session', meta.sessionId.slice(0, 8).toUpperCase()]);

  const metaRows = [...govRows, ...techRows];
  const tableStart = ws.rowCount + 1;
  metaRows.forEach(([label, value], idx) => {
    const r = ws.addRow([label, value]);
    r.height = 18;
    const labelCell = r.getCell(1);
    const valueCell = r.getCell(2);
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COVER_LIGHT}` } };
    labelCell.font = { name: titleFont, bold: true, size: 10, color: { argb: `FF${COVER_MUTED}` } };
    labelCell.alignment = { vertical: 'middle' };
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : `FF${COVER_LIGHT}` } };
    valueCell.font = { name: titleFont, size: 10, color: { argb: `FF${COVER_INK}` } };
    valueCell.alignment = { vertical: 'middle', wrapText: true };
    // Hairline grid.
    const border = { style: 'thin' as const, color: { argb: `FF${COVER_BORDER}` } };
    labelCell.border = { bottom: border, right: border };
    valueCell.border = { bottom: border };
  });
  // Accent top/bottom on the table.
  const tableEnd = ws.rowCount;
  const accentBorder = { style: 'medium' as const, color: { argb: `FF${style.accent}` } };
  for (let c = 1; c <= 2; c++) {
    const top = ws.getRow(tableStart).getCell(c);
    top.border = { ...(top.border || {}), top: accentBorder };
    const bot = ws.getRow(tableEnd).getCell(c);
    bot.border = { ...(bot.border || {}), bottom: accentBorder };
  }

  ws.addRow(['', '']).height = 14;

  // About this analysis.
  const aboutHead = ws.addRow(['About this analysis', '']);
  ws.mergeCells(aboutHead.number, 1, aboutHead.number, 2);
  aboutHead.getCell(1).font = { name: titleFont, bold: true, size: 12, color: { argb: `FF${COVER_INK}` } };
  aboutHead.height = 20;

  const aboutPieces: string[] = ['This workbook was generated by ANTON, an AI-powered expert workspace.'];
  if (meta.moduleId) aboutPieces.push(`Module: ${meta.moduleId}.`);
  if (meta.model) {
    const cfg = [meta.model];
    if (meta.thinking)   cfg.push(`thinking "${meta.thinking}"`);
    if (meta.creativity) cfg.push(`creativity "${meta.creativity}"`);
    aboutPieces.push(`Run with ${cfg.join(', ')}.`);
  }
  aboutPieces.push('Tabular outputs are tab-separated below. AI-assisted — must be verified by a qualified professional before being relied on.');
  const aboutBody = ws.addRow([aboutPieces.join(' '), '']);
  ws.mergeCells(aboutBody.number, 1, aboutBody.number, 2);
  aboutBody.getCell(1).font = { name: titleFont, size: 10, color: { argb: `FF${COVER_BODY}` } };
  aboutBody.getCell(1).alignment = { vertical: 'top', wrapText: true };
  aboutBody.height = 48;

  if (meta.documentsLoaded && meta.documentsLoaded.length > 0) {
    ws.addRow(['', '']).height = 8;
    const srcHead = ws.addRow(['Sources & scope', '']);
    ws.mergeCells(srcHead.number, 1, srcHead.number, 2);
    srcHead.getCell(1).font = { name: titleFont, bold: true, size: 12, color: { argb: `FF${COVER_INK}` } };
    srcHead.height = 20;
    const srcBody = ws.addRow([meta.documentsLoaded.join(' · '), '']);
    ws.mergeCells(srcBody.number, 1, srcBody.number, 2);
    srcBody.getCell(1).font = { name: titleFont, size: 10, color: { argb: `FF${COVER_BODY}` } };
    srcBody.getCell(1).alignment = { vertical: 'top', wrapText: true };
    srcBody.height = 36;
  }

  return ws;
}

// ── Main export function ────────────────────────────────────

export async function generateXlsx(
  markdown: string,
  metadata: XlsxCoverMetadata = {},
  brandConfig?: BrandConfig | null
): Promise<Buffer> {
  const style = resolveXlsxStyle(brandConfig);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = metadata.author || 'ANTON by openEXPERT';
  workbook.created = new Date();
  workbook.title = metadata.title || 'openEXPERT Output';
  // EXPORT-06: Force Excel to recalculate all formulas on open — prevents #VALUE/#REF errors
  workbook.calcProperties = { fullCalcOnLoad: true };

  const sections = parseMarkdown(markdown);

  // Cover sheet always first — gives the workbook the same governance
  // surface as the DOCX export.
  const tableSectionCount = sections.filter(s => s.tables.length > 0).length;
  buildCoverSheet(workbook, metadata, style, tableSectionCount);

  // If there are tables, each section with a table gets its own sheet
  let hasSheets = false;

  // Excel worksheet names must be UNIQUE. Two sections called "Findings" — or any two
  // headings sharing a 31-char prefix — made addWorksheet throw "Worksheet name already
  // exists", which surfaced as a 500 the client swallowed: the Export-to-Excel button
  // simply appeared to do nothing. Repeated headings are the normal shape of ANTON
  // output, so this was the common case rather than an edge case.
  const usedSheetNames = new Set<string>();
  const uniqueSheetName = (heading: string): string => {
    const base = (heading.replace(/[\\/*?[\]:]/g, '').slice(0, 31).trim()) || 'Sheet';
    if (!usedSheetNames.has(base.toLowerCase())) {
      usedSheetNames.add(base.toLowerCase());
      return base;
    }
    // Suffix " (2)", " (3)" … trimming the stem so the result stays within 31 chars.
    for (let n = 2; n < 1000; n++) {
      const suffix = ` (${n})`;
      const candidate = base.slice(0, 31 - suffix.length) + suffix;
      if (!usedSheetNames.has(candidate.toLowerCase())) {
        usedSheetNames.add(candidate.toLowerCase());
        return candidate;
      }
    }
    return base.slice(0, 27) + ` (${Date.now() % 1000})`;
  };

  // Prose-only sections were dropped by a bare `continue`, so an executive summary or
  // a caveats section could vanish from the client's copy with no warning. Collected
  // here and written to a single Narrative sheet below — one sheet rather than one per
  // section, so the tab bar stays usable.
  const proseOnly: Section[] = [];

  for (const section of sections) {
    if (section.tables.length === 0) {
      if (section.text.some((t) => t.trim().length > 0)) proseOnly.push(section);
      continue;
    }

    const sheetName = uniqueSheetName(section.heading);
    const ws = workbook.addWorksheet(sheetName, {
      pageSetup: { fitToPage: true, fitToWidth: 1 },
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
    });

    // Sheet tab colour
    ws.properties.tabColor = { argb: `FF${style.accent}` };

    // Section heading as a title row
    const titleRow = ws.addRow([section.heading]);
    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: `FF${style.accent}` }, name: style.titleFont };
    titleRow.height = 28;
    ws.addRow([]); // spacer

    for (const table of section.tables) {
      const colCount = table.headers.length;

      // Header row
      const hRow = ws.addRow(table.headers);
      styleHeaderRow(hRow, colCount, style);
      ws.autoFilter = {
        from: { row: ws.rowCount, column: 1 },
        to: { row: ws.rowCount, column: colCount },
      };

      // Data rows — numeric-looking cells are written as numbers, not text
      table.rows.forEach((cells, idx) => {
        const numeric = cells.map(parseNumericCell);
        const row = ws.addRow(cells.map((c, i) => numeric[i] ? numeric[i]!.value : c));
        styleDataRow(row, idx, colCount, style, table.headers, numeric);
      });

      ws.addRow([]); // spacer between tables
    }

    // Auto-size columns (cap at 60 chars)
    ws.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 60);
    });

    // Append any non-table text at the bottom
    if (section.text.length > 0) {
      ws.addRow([]);
      ws.addRow(['Notes / Commentary']);
      ws.lastRow!.getCell(1).font = { bold: true, color: { argb: `FF${style.accent}` } };
      for (const line of section.text) {
        if (line.trim()) ws.addRow([line.replace(/^[-*]\s+/, '')]);
      }
    }

    hasSheets = true;
  }

  // Prose-only sections, preserved rather than silently dropped.
  if (hasSheets && proseOnly.length > 0) {
    const ws = workbook.addWorksheet(uniqueSheetName('Narrative'), {
      pageSetup: { fitToPage: true, fitToWidth: 1 },
    });
    ws.properties.tabColor = { argb: `FF${style.accent}` };
    ws.columns = [{ width: 110 }];
    let nrow = 1;
    for (const section of proseOnly) {
      const head = ws.getCell(nrow, 1);
      head.value = section.heading;
      head.font = { bold: true, size: 12, color: { argb: `FF${style.accent}` } };
      nrow += 1;
      for (const line of section.text) {
        if (!line.trim()) { nrow += 1; continue; }
        const cell = ws.getCell(nrow, 1);
        cell.value = line;
        cell.alignment = { wrapText: true, vertical: 'top' };
        nrow += 1;
      }
      nrow += 1; // blank row between sections
    }
  }

  // If no tables found, create a single text sheet
  if (!hasSheets) {
    const ws = workbook.addWorksheet('Output');
    ws.properties.tabColor = { argb: `FF${style.accent}` };
    const cleanLines = markdown
      .split('\n')
      .map((l) => [l.replace(/^#+\s+/, '').replace(/\*\*/g, '').replace(/\*/g, '')]);
    cleanLines.forEach((row, idx) => {
      const r = ws.addRow(row);
      if (idx === 0) r.getCell(1).font = { bold: true, size: 13, color: { argb: `FF${style.accent}` } };
    });
    ws.getColumn(1).width = 120;
  }

  // ── Legal disclaimer sheet (always last) ─────────────────
  const disclaimerWs = workbook.addWorksheet('Disclaimer');
  disclaimerWs.properties.tabColor = { argb: `FF${style.accent}` };
  const dTitleRow = disclaimerWs.addRow(['Legal Disclaimer']);
  dTitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: `FF${style.accent}` } };
  dTitleRow.height = 24;
  disclaimerWs.addRow([]);
  const dTextRow = disclaimerWs.addRow([LEGAL_DISCLAIMER_TEXT]);
  dTextRow.getCell(1).alignment = { wrapText: true };
  disclaimerWs.getColumn(1).width = 110;
  disclaimerWs.getRow(3).height = 60;

  // ATTR-02: Sources & Scope row
  if (metadata.documentsLoaded && metadata.documentsLoaded.length > 0) {
    disclaimerWs.addRow([]);
    const srcRow = disclaimerWs.addRow([`Sources & Scope: ${metadata.documentsLoaded.join(', ')}`]);
    srcRow.getCell(1).font = { size: 9 };
    srcRow.getCell(1).alignment = { wrapText: true };
    disclaimerWs.getRow(disclaimerWs.rowCount).height = 18;
  }

  // GOV-04: Analysis provenance row
  const provParts: string[] = [];
  if (metadata.moduleId) provParts.push(`Module: ${metadata.moduleId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`);
  if (metadata.model)    provParts.push(`Model: ${metadata.model}`);
  if (metadata.thinking) provParts.push(`Thinking: ${metadata.thinking}`);
  if (metadata.creativity) provParts.push(`Creativity: ${metadata.creativity}`);
  if (metadata.sessionId) provParts.push(`Session: ${metadata.sessionId}`);
  provParts.push(`Generated: ${new Date().toISOString().split('T')[0]}`);
  disclaimerWs.addRow([]);
  const provRow = disclaimerWs.addRow([`Analysis configuration: ${provParts.join(' | ')}`]);
  provRow.getCell(1).font = { italic: true, size: 9 };
  provRow.getCell(1).alignment = { wrapText: true };
  disclaimerWs.getRow(disclaimerWs.rowCount).height = 18;

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
