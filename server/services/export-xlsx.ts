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

// RAG status detection
const RAG_PATTERNS: Record<string, { bgColor: string; fgColor: string }> = {
  '🟢': { bgColor: '1A4731', fgColor: '27AE60' },
  '🟡': { bgColor: '4A3900', fgColor: 'F5A623' },
  '🟠': { bgColor: '4A2700', fgColor: 'E67E22' },
  '🔴': { bgColor: '4A1010', fgColor: 'E74C3C' },
  '✅': { bgColor: '1A4731', fgColor: '27AE60' },
  '❌': { bgColor: '4A1010', fgColor: 'E74C3C' },
  green:  { bgColor: '1A4731', fgColor: '27AE60' },
  red:    { bgColor: '4A1010', fgColor: 'E74C3C' },
  amber:  { bgColor: '4A3900', fgColor: 'F5A623' },
  high:   { bgColor: '4A1010', fgColor: 'E74C3C' },
  medium: { bgColor: '4A3900', fgColor: 'F5A623' },
  low:    { bgColor: '1A4731', fgColor: '27AE60' },
  critical: { bgColor: '4A1010', fgColor: 'E74C3C' },
  compliant: { bgColor: '1A4731', fgColor: '27AE60' },
  'non-compliant': { bgColor: '4A1010', fgColor: 'E74C3C' },
  partial: { bgColor: '4A3900', fgColor: 'F5A623' },
};

function detectRag(value: string): { bgColor: string; fgColor: string } | null {
  const lower = value.toLowerCase().trim();
  for (const [key, colors] of Object.entries(RAG_PATTERNS)) {
    if (lower === key || lower.startsWith(key)) return colors;
  }
  return null;
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

function styleDataRow(row: ExcelJS.Row, rowIndex: number, colCount: number, style: ReturnType<typeof resolveXlsxStyle>) {
  const isAlt = rowIndex % 2 === 0;
  row.height = 20;
  for (let col = 1; col <= colCount; col++) {
    const cell = row.getCell(col);
    const cellVal = String(cell.value ?? '');
    const rag = detectRag(cellVal);

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

// ── Main export function ────────────────────────────────────

export async function generateXlsx(
  markdown: string,
  metadata: { title?: string; author?: string } = {},
  brandConfig?: BrandConfig | null
): Promise<Buffer> {
  const style = resolveXlsxStyle(brandConfig);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = metadata.author || 'openEXPERT by ANTON';
  workbook.created = new Date();
  workbook.title = metadata.title || 'openEXPERT Output';

  const sections = parseMarkdown(markdown);

  // If there are tables, each section with a table gets its own sheet
  let hasSheets = false;

  for (const section of sections) {
    if (section.tables.length === 0) continue;

    // Sanitise sheet name (Excel limit: 31 chars, no special chars)
    const sheetName = section.heading.replace(/[\\/*?[\]:]/g, '').slice(0, 31) || 'Sheet';
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

      // Data rows
      table.rows.forEach((cells, idx) => {
        const row = ws.addRow(cells);
        styleDataRow(row, idx, colCount, style);
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

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
