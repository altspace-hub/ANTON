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

import { createRequire } from 'module';
const _req = createRequire(import.meta.url);
// pptxgenjs is CJS — use createRequire to get the constructor reliably
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PptxGenJS = _req('pptxgenjs') as any;

// ── Public brand interface ─────────────────────────────────────────────────────

export interface PresentationBrand {
  companyName:    string;   // shown in footer / title slide
  accentColor:    string;   // primary accent — hex WITHOUT #, e.g. "2DD4A8"
  secondaryColor: string;   // secondary accent — hex WITHOUT #, e.g. "F5A623"
  fontFamily:     string;   // e.g. "Calibri", "Arial", "Inter"
  chartColors:    string[]; // palette for charts — hex WITHOUT #
}

const DEFAULT_BRAND: PresentationBrand = {
  companyName:    'ANTON',
  accentColor:    '2DD4A8',
  secondaryColor: 'F5A623',
  fontFamily:     'Calibri',
  chartColors:    ['2DD4A8', '3498DB', 'F5A623', 'E74C3C', '27AE60', '152238'],
};

/** Merge a partial brand with the defaults — always returns a complete object. */
export function resolveBrand(brand?: Partial<PresentationBrand>): PresentationBrand {
  const stripHash = (s: string) => s.replace(/^#/, '');
  return {
    companyName:    brand?.companyName?.trim()                   || DEFAULT_BRAND.companyName,
    accentColor:    brand?.accentColor  ? stripHash(brand.accentColor)  : DEFAULT_BRAND.accentColor,
    secondaryColor: brand?.secondaryColor ? stripHash(brand.secondaryColor) : DEFAULT_BRAND.secondaryColor,
    fontFamily:     brand?.fontFamily?.trim()                    || DEFAULT_BRAND.fontFamily,
    chartColors:    brand?.chartColors?.length
      ? brand.chartColors.map(stripHash)
      : DEFAULT_BRAND.chartColors,
  };
}

// ── Internal types ─────────────────────────────────────────────────────────────

interface ParsedSlide {
  number: number;
  title: string;
  type: SlideType;
  subtitle?: string;
  body?: string[];
  headers?: string[];
  rows?: string[][];
  data?: { label: string; value: number }[];
  left?: string[];
  right?: string[];
  notes?: string;
}

type SlideType =
  | 'title' | 'agenda' | 'content' | 'table'
  | 'chart-bar' | 'chart-pie' | 'two-column' | 'quote'
  | 'section-divider' | 'stats' | 'numbered-cards'
  | 'callout' | 'icon-list';

/** Slide-builder context — resolved brand values + pptx instance */
interface Ctx {
  pptx:        any;
  acc:         string;    // accent colour (no #)
  sec:         string;    // secondary colour (no #)
  fnt:         string;    // font family
  co:          string;    // company name
  chartColors: string[];  // chart palette (no #)
}

// ── Fixed structural colours (not brand-overridable) ──────────────────────────

const C = {
  dark:      '0B1426',
  dark2:     '0F1B2D',
  card:      '152238',
  tealDim:   '144D3C',
  tealSoft:  '0D2E3A',
  white:     'FFFFFF',
  offWhite:  'E0E0E0',
  gray:      'B0B0B0',
  grayMed:   '707070',
  lightBg:   'F4F6F9',
  lightCard: 'EDF0F5',
  lightBord: 'D8E2EE',
  red:       'E74C3C',
  amber:     'F5A623',
  green:     '27AE60',
  blue:      '3498DB',
};

const RAG: Record<string, string> = {
  RED: C.red, AMBER: C.amber, GREEN: C.green,
};

// ── Slide Parser ───────────────────────────────────────────────────────────────

export function parseSlides(markdown: string): ParsedSlide[] {
  const slides: ParsedSlide[] = [];
  const slideBlocks = markdown.split(/^## SLIDE \d+:/m).filter((b) => b.trim());

  for (let i = 0; i < slideBlocks.length; i++) {
    const block = slideBlocks[i].trim();
    const lines = block.split('\n');
    const headerTitle = lines[0]?.trim() || `Slide ${i + 1}`;
    const slide: ParsedSlide = { number: i + 1, title: headerTitle, type: 'content' };

    let currentSection: string | null = null;
    const bodyLines: string[] = [];
    const leftLines: string[] = [];
    const rightLines: string[] = [];

    for (let j = 1; j < lines.length; j++) {
      const trimmed = lines[j].trim();

      if (trimmed.startsWith('Type:')) {
        const v = trimmed.slice(5).trim().toLowerCase() as SlideType;
        const valid: SlideType[] = [
          'title', 'agenda', 'content', 'table', 'chart-bar', 'chart-pie',
          'two-column', 'quote', 'section-divider', 'stats', 'numbered-cards',
          'callout', 'icon-list',
        ];
        if (valid.includes(v)) slide.type = v;
        currentSection = null;
      } else if (trimmed.startsWith('Title:'))    { slide.title    = trimmed.slice(6).trim();  currentSection = null; }
        else if (trimmed.startsWith('Subtitle:'))   { slide.subtitle = trimmed.slice(9).trim();  currentSection = null; }
        else if (trimmed.startsWith('Headers:'))    { slide.headers  = trimmed.slice(8).split('|').map(h => h.trim()); currentSection = null; }
        else if (trimmed.startsWith('Row:'))        {
          if (!slide.rows) slide.rows = [];
          slide.rows.push(trimmed.slice(4).split('|').map(c => c.trim()));
          currentSection = null;
        }
        else if (trimmed.startsWith('Data:'))       {
          slide.data = trimmed.slice(5).split(',').map(p => {
            const [label, val] = p.split(':').map(s => s.trim());
            return { label: label || '', value: parseFloat(val) || 0 };
          });
          currentSection = null;
        }
        else if (trimmed.startsWith('Notes:'))      { slide.notes = trimmed.slice(6).trim(); currentSection = 'notes'; }
        else if (trimmed === 'Body:')               { currentSection = 'body'; }
        else if (trimmed === 'Left:')               { currentSection = 'left'; }
        else if (trimmed === 'Right:')              { currentSection = 'right'; }
        // Notes MUST be consumed before the bullet rule. A bulleted line inside a
        // Notes: block was previously matched by the branch below and pushed onto the
        // slide body — so the speaker's private notes were printed on the slide, in
        // front of the audience. Notes are the one section where a leading '- ' is
        // ordinary prose rather than structure.
        else if (currentSection === 'notes' && trimmed) {
          const noteText = trimmed.replace(/^[-*]\s+/, '');
          slide.notes = (slide.notes ? slide.notes + ' ' : '') + noteText;
        }
        else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const content = trimmed.slice(2);
          if (currentSection === 'left')        leftLines.push(content);
          else if (currentSection === 'right')  rightLines.push(content);
          else                                  bodyLines.push(content);
        }
        else if (trimmed && !trimmed.startsWith('```')) {
          if (currentSection === 'body' || currentSection === null) bodyLines.push(trimmed);
        }
    }

    if (bodyLines.length > 0)  slide.body  = bodyLines;
    if (leftLines.length > 0)  slide.left  = leftLines;
    if (rightLines.length > 0) slide.right = rightLines;
    slides.push(slide);
  }
  return slides;
}

// ── Plain-markdown fallback ────────────────────────────────────────────────────
//
// parseSlides() only understands the `## SLIDE n:` dialect, which just a handful of
// presentation modules emit. Every other module — i.e. almost all 550 — produces
// ordinary markdown.
//
// Fed that, parseSlides did not fail loudly. `split(/^## SLIDE \d+:/m)` on text without
// markers returns the whole document as a single block, so it produced exactly ONE
// slide: title = the literal "# Heading" (hashes included), body = every remaining
// line with "## Section" appearing as raw text, then cut to the layout's 7-item cap.
// A 40-page analysis exported as one crowded slide holding about seven lines of it.
//
// This derives a real deck from ordinary structure instead: headings start slides,
// bullets and paragraphs become body items, markdown tables become table slides. It is
// used only when no SLIDE markers are present, so the authored dialect is untouched.

const MAX_BULLET_CHARS = 240;

/** One markdown table, if `lines` starting at `i` are one. */
function takeTable(lines: string[], i: number): { headers: string[]; rows: string[][]; next: number } | null {
  if (!lines[i]?.trim().startsWith('|')) return null;
  const block: string[] = [];
  let j = i;
  while (j < lines.length && lines[j].trim().startsWith('|')) { block.push(lines[j].trim()); j++; }
  const cells = (l: string) => l.split('|').slice(1, -1).map((c) => c.trim());
  const rows = block.filter((l) => !/^\|[\s:|-]+\|$/.test(l));
  if (rows.length < 1) return null;
  return { headers: cells(rows[0]), rows: rows.slice(1).map(cells), next: j };
}

export function parsePlainMarkdown(markdown: string): ParsedSlide[] {
  const lines = markdown.split('\n');
  const slides: ParsedSlide[] = [];
  let current: ParsedSlide | null = null;
  let body: string[] = [];
  let inFence = false;

  const flush = () => {
    if (!current) return;
    if (body.length) current.body = body;
    // A heading with nothing under it is a section divider, not an empty content slide.
    if (!current.body?.length && !current.rows?.length) current.type = 'section-divider';
    slides.push(current);
    current = null;
    body = [];
  };

  const open = (title: string, type: SlideType = 'content') => {
    flush();
    current = { number: slides.length + 1, title: title || 'Overview', type };
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // Code fences are copied verbatim, never interpreted as headings or bullets.
    if (/^(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) { if (line) body.push(line); continue; }

    if (/^#{1,3}\s+/.test(line)) {
      open(line.replace(/^#+\s+/, '').trim());
      continue;
    }

    const table = takeTable(lines, i);
    if (table && table.headers.length > 0) {
      // Annotated because control-flow analysis cannot see that open() assigns
      // `current` from inside a closure, so it narrows the variable to null here.
      const title = (current as ParsedSlide | null)?.title ?? 'Table';
      // A table becomes its own slide: mixing it into a bullet list loses the grid.
      flush();
      slides.push({ number: slides.length + 1, title, type: 'table', headers: table.headers, rows: table.rows });
      i = table.next - 1;
      continue;
    }

    if (!line) continue;
    if (/^([-*_])\1{2,}$/.test(line)) continue;                 // horizontal rule

    if (!current) open('Overview');
    const text = line.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '');
    // Long paragraphs are truncated per bullet rather than dropped, and the ellipsis
    // is visible — unlike the old silent slice of the whole document.
    body.push(text.length > MAX_BULLET_CHARS ? text.slice(0, MAX_BULLET_CHARS - 1) + '…' : text);
  }
  flush();

  // Promote a lone leading heading to a proper title slide.
  if (slides.length > 1 && slides[0].type === 'section-divider') slides[0].type = 'title';
  return slides;
}

// ── Overflow pagination ────────────────────────────────────────────────────────
//
// Each layout capped its body with `.slice(0, n)` — 7 items for content, 8 for agenda,
// 6 for numbered cards. Anything past the cap was DROPPED, with nothing in the file or
// the UI to say so. A 30-finding analysis exported as 7 findings that looked complete,
// which is the worst way for an export to fail: the deliverable is wrong and looks
// right, and the reader has no way to know.
//
// Body items beyond a layout's capacity now continue onto additional slides titled
// "… (cont.)". Layouts keep their slice() as a hard backstop, so a layout that gains a
// tighter cap can never silently drop content again — it just paginates.

/** Body capacity per layout, matching each builder's slice(). */
const BODY_CAPACITY: Partial<Record<SlideType, number>> = {
  content: 7,
  agenda: 8,
  'numbered-cards': 6,
  'icon-list': 7,
  stats: 6,
};

/** Rows per table slide — beyond this the table runs off the bottom of the slide. */
const TABLE_ROW_CAPACITY = 12;

export function paginate(slides: ParsedSlide[]): ParsedSlide[] {
  const out: ParsedSlide[] = [];

  for (const slide of slides) {
    const bodyCap = BODY_CAPACITY[slide.type];

    if (bodyCap && slide.body && slide.body.length > bodyCap) {
      for (let i = 0; i < slide.body.length; i += bodyCap) {
        const part = slide.body.slice(i, i + bodyCap);
        out.push({
          ...slide,
          number: out.length + 1,
          title: i === 0 ? slide.title : `${slide.title} (cont.)`,
          body: part,
          // Notes belong to the first slide only; repeating them would have the
          // presenter read the same script on every continuation.
          notes: i === 0 ? slide.notes : undefined,
        });
      }
      continue;
    }

    if (slide.type === 'table' && slide.rows && slide.rows.length > TABLE_ROW_CAPACITY) {
      for (let i = 0; i < slide.rows.length; i += TABLE_ROW_CAPACITY) {
        out.push({
          ...slide,
          number: out.length + 1,
          title: i === 0 ? slide.title : `${slide.title} (cont.)`,
          headers: slide.headers,           // repeated, so a continued table stays readable
          rows: slide.rows.slice(i, i + TABLE_ROW_CAPACITY),
          notes: i === 0 ? slide.notes : undefined,
        });
      }
      continue;
    }

    out.push({ ...slide, number: out.length + 1 });
  }

  return out;
}

// ── PPTX Generator ─────────────────────────────────────────────────────────────

export async function generatePptx(
  markdown: string,
  metadata?: { title?: string; author?: string },
  brand?: Partial<PresentationBrand>
): Promise<Buffer> {
  const b = resolveBrand(brand);
  const ctx: Ctx = { pptx: null, acc: b.accentColor, sec: b.secondaryColor, fnt: b.fontFamily, co: b.companyName, chartColors: b.chartColors };

  // Gate on the MARKERS, not on how many slides parseSlides returned.
  //
  // `"text".split(/^## SLIDE \d+:/m)` yields ["text"] — one element, not zero — so
  // parseSlides returns a slide for ANY non-empty input. Ordinary module output
  // therefore became exactly one content slide whose title was the literal "# Heading"
  // and whose body was every remaining line, headings included as raw "## Text", then
  // cut to the layout's 7 items. That is the "one truncated slide" symptom; the
  // `slides.length === 0` fallback below was never what produced it.
  const hasSlideMarkers = /^## SLIDE \d+:/m.test(markdown);
  const slides = paginate(hasSlideMarkers ? parseSlides(markdown) : parsePlainMarkdown(markdown));
  const pptx = new PptxGenJS();
  ctx.pptx = pptx;

  pptx.author  = metadata?.author || b.companyName;
  pptx.title   = metadata?.title  || 'Presentation';
  pptx.subject = 'AI-Generated Presentation';
  pptx.company = b.companyName;
  pptx.layout  = 'LAYOUT_WIDE'; // 13.33 × 7.5 inches

  // ── Slide Masters ──────────────────────────────────────────────────────────

  pptx.defineSlideMaster({
    title: 'TITLE_MASTER',
    background: { color: C.dark },
    objects: [
      { rect: { x: 0,   y: 0,    w: 0.5,   h: 7.5,  fill: { color: C.tealDim }  } },
      { rect: { x: 0.5, y: 7.1,  w: 12.83, h: 0.08, fill: { color: b.accentColor } } },
      { text: { text: b.companyName, options: { x: 11.0, y: 7.18, w: 2.1, h: 0.28, fontSize: 8, color: C.grayMed, align: 'right', bold: true, fontFace: b.fontFamily } } },
    ],
  });

  pptx.defineSlideMaster({
    title: 'CONTENT_MASTER',
    background: { color: C.white },
    objects: [
      { rect: { x: 0, y: 0,    w: '100%', h: 1.0,  fill: { color: C.dark }         } },
      { rect: { x: 0, y: 1.0,  w: '100%', h: 0.05, fill: { color: b.accentColor }  } },
      { rect: { x: 0, y: 7.15, w: '100%', h: 0.35, fill: { color: C.dark }         } },
      { text: { text: `CONFIDENTIAL — ${b.companyName}`, options: { x: 0.4, y: 7.18, w: 6, h: 0.28, fontSize: 7, color: C.grayMed, fontFace: b.fontFamily } } },
    ],
  });

  pptx.defineSlideMaster({
    title: 'DARK_MASTER',
    background: { color: C.dark },
    objects: [
      { rect: { x: 0, y: 7.15, w: '100%', h: 0.35, fill: { color: C.card }         } },
      { rect: { x: 0, y: 7.15, w: '100%', h: 0.04, fill: { color: b.accentColor }  } },
      { text: { text: `CONFIDENTIAL — ${b.companyName}`, options: { x: 0.4, y: 7.18, w: 6, h: 0.28, fontSize: 7, color: C.grayMed, fontFace: b.fontFamily } } },
    ],
  });

  pptx.defineSlideMaster({
    title: 'SECTION_MASTER',
    background: { color: C.card },
    objects: [
      { rect: { x: 0,   y: 0,   w: 0.3,   h: 7.5,  fill: { color: b.accentColor } } },
      { rect: { x: 0.3, y: 3.6, w: 13.03, h: 0.04, fill: { color: C.tealDim }     } },
      { text: { text: b.companyName, options: { x: 11.0, y: 7.18, w: 2.1, h: 0.28, fontSize: 8, color: C.grayMed, align: 'right', fontFace: b.fontFamily } } },
    ],
  });

  // ── Build Slides ───────────────────────────────────────────────────────────

  for (const parsed of slides) {
    switch (parsed.type) {
      case 'title':           addTitleSlide(ctx, parsed);         break;
      case 'section-divider': addSectionSlide(ctx, parsed);       break;
      case 'stats':           addStatsSlide(ctx, parsed);         break;
      case 'callout':         addCalloutSlide(ctx, parsed);       break;
      case 'numbered-cards':  addNumberedCardsSlide(ctx, parsed); break;
      case 'icon-list':       addIconListSlide(ctx, parsed);      break;
      case 'agenda':          addAgendaSlide(ctx, parsed);        break;
      case 'table':           addTableSlide(ctx, parsed);         break;
      case 'chart-bar':
      case 'chart-pie':       addChartSlide(ctx, parsed);         break;
      case 'two-column':      addTwoColumnSlide(ctx, parsed);     break;
      case 'quote':           addQuoteSlide(ctx, parsed);         break;
      default:                addContentSlide(ctx, parsed);       break;
    }
  }

  // Only reachable when BOTH parsers found nothing — i.e. the input carries no heading,
  // bullet, table or paragraph at all. This used to be the COMMON path (parseSlides
  // returned [] for any non-presentation module) and silently truncated the whole
  // document at 2000 characters; the plain-markdown fallback now handles that case.
  // If content is still cut here, the slide says so rather than looking complete.
  if (slides.length === 0) {
    const s = pptx.addSlide({ masterName: 'CONTENT_MASTER' });
    const LIMIT = 2000;
    const shown = markdown.slice(0, LIMIT);
    s.addText('Presentation Content', t({ x: 0.5, y: 0.15, w: 12, h: 0.7, fontSize: 22, color: C.white, bold: true }, ctx));
    s.addText(shown, t({ x: 0.5, y: 1.2, w: 12.3, h: 5.5, fontSize: 12, color: C.dark, valign: 'top' }, ctx));
    if (markdown.length > LIMIT) {
      s.addText(
        `Content truncated — ${markdown.length - LIMIT} more characters not shown. Export to Word or Markdown for the full text.`,
        t({ x: 0.5, y: 6.75, w: 12.3, h: 0.35, fontSize: 10, color: C.red, italic: true }, ctx),
      );
    }
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Inject fontFace into any pptxgenjs text options object */
function t(options: Record<string, unknown>, ctx: Ctx): Record<string, unknown> {
  return { ...options, fontFace: ctx.fnt };
}

/**
 * Markdown inline formatting → pptxgenjs text runs.
 *
 * Body text was passed to addText() as a raw string, so `**Finding:**` rendered on the
 * slide as the literal characters `**Finding:**`. ANTON's prompts ask for emphasis, so
 * this fired on ordinary output — asterisks on a slide in front of a client.
 *
 * Returns a plain string when there is no formatting, since pptxgenjs handles that
 * fast path and it keeps the produced XML smaller.
 */
export function mdRuns(text: string): string | Array<{ text: string; options?: Record<string, unknown> }> {
  if (!/[*_`]/.test(text)) return text;

  const runs: Array<{ text: string; options?: Record<string, unknown> }> = [];
  // Code spans first and never re-parsed, so `**literal**` inside backticks stays literal.
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g);

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      runs.push({ text: part.slice(1, -1), options: { fontFace: 'Consolas' } });
    } else if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      runs.push({ text: part.slice(2, -2), options: { bold: true } });
    } else if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      if (part.length > 2) runs.push({ text: part.slice(1, -1), options: { italic: true } });
      else runs.push({ text: part });
    } else {
      runs.push({ text: part });
    }
  }
  return runs.length > 0 ? runs : text;
}

/** Title text in the dark header bar */
function hdr(s: any, title: string, ctx: Ctx) {
  s.addText(title, t({ x: 0.5, y: 0.12, w: 12.3, h: 0.76, fontSize: 22, color: C.white, bold: true, valign: 'middle' }, ctx));
}

/** Thin accent bar on the left edge of a row */
function accentBar(s: any, ctx: Ctx, x: number, y: number, h: number, color?: string) {
  s.addShape(ctx.pptx.ShapeType.rect, { x, y, w: 0.07, h, fill: { color: color ?? ctx.acc }, line: { type: 'none' } });
}

/** Light card row background */
function cardBg(s: any, ctx: Ctx, x: number, y: number, w: number, h: number, fill = C.lightCard) {
  s.addShape(ctx.pptx.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: C.lightBord, pt: 0.75 } });
}

// ── Slide Builders ─────────────────────────────────────────────────────────────

function addTitleSlide(ctx: Ctx, slide: ParsedSlide) {
  const { pptx, acc, fnt: _ } = ctx;
  const s = pptx.addSlide({ masterName: 'TITLE_MASTER' });

  // Dark card with accent top edge behind title
  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.8, w: 10.5, h: 2.8,  fill: { color: C.card }, line: { type: 'none' } });
  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.8, w: 10.5, h: 0.07, fill: { color: acc   }, line: { type: 'none' } });

  s.addText(slide.title, t({ x: 0.8, y: 1.9, w: 10.0, h: 1.9, fontSize: 34, color: C.white, bold: true, valign: 'middle', wrap: true }, ctx));

  if (slide.subtitle) {
    s.addText(slide.subtitle, t({ x: 0.8, y: 4.75, w: 11.0, h: 0.65, fontSize: 17, color: acc }, ctx));
  }
  if (slide.body?.length) {
    s.addText(slide.body.join('  ·  '), t({ x: 0.8, y: 5.5, w: 11.0, h: 0.5, fontSize: 12, color: C.gray }, ctx));
  }
  if (slide.notes) s.addNotes(slide.notes);
}

function addSectionSlide(ctx: Ctx, slide: ParsedSlide) {
  const { pptx, acc } = ctx;
  const s = pptx.addSlide({ masterName: 'SECTION_MASTER' });

  // Large faint section number as background decoration
  s.addText(String(slide.number).padStart(2, '0'), t({
    x: 8.5, y: 0.5, w: 4.5, h: 6.5,
    fontSize: 140, color: C.tealSoft, bold: true, align: 'right', valign: 'middle',
  }, ctx));

  s.addText(slide.title, t({ x: 0.8, y: 2.4, w: 9.0, h: 1.6, fontSize: 38, color: C.white, bold: true, valign: 'middle', wrap: true }, ctx));

  if (slide.subtitle) {
    s.addText(slide.subtitle, t({ x: 0.8, y: 4.15, w: 9.0, h: 0.6, fontSize: 16, color: acc }, ctx));
  }
  if (slide.notes) s.addNotes(slide.notes);
}

function addContentSlide(ctx: Ctx, slide: ParsedSlide) {
  const { pptx } = ctx;
  const s = pptx.addSlide({ masterName: 'CONTENT_MASTER' });
  hdr(s, slide.title, ctx);

  if (slide.body?.length) {
    const items = slide.body.slice(0, 7);
    const gap = 0.1;
    const itemH = Math.min(0.82, (5.75 - (items.length - 1) * gap) / items.length);

    items.forEach((item, i) => {
      const y = 1.12 + i * (itemH + gap);
      cardBg(s, ctx, 0.5, y, 12.3, itemH);
      accentBar(s, ctx, 0.5, y, itemH);
      s.addText(mdRuns(item) as never, t({ x: 0.75, y: y + 0.05, w: 11.9, h: itemH - 0.1, fontSize: 13, color: C.dark, valign: 'middle', wrap: true }, ctx));
    });
  }
  if (slide.notes) s.addNotes(slide.notes);
}

function addAgendaSlide(ctx: Ctx, slide: ParsedSlide) {
  const { pptx, acc } = ctx;
  const s = pptx.addSlide({ masterName: 'CONTENT_MASTER' });
  hdr(s, slide.title, ctx);

  if (slide.body?.length) {
    const items = slide.body.slice(0, 8);
    const useTwoCols = items.length > 4;
    const perCol = useTwoCols ? Math.ceil(items.length / 2) : items.length;
    const colW = useTwoCols ? 5.9 : 12.0;
    const gap = 0.12;
    const itemH = Math.min(1.0, (5.65 - (perCol - 1) * gap) / perCol);
    const circleD = Math.min(0.6, itemH * 0.65);

    items.forEach((item, i) => {
      const col = useTwoCols ? Math.floor(i / perCol) : 0;
      const row = useTwoCols ? i % perCol : i;
      const x = 0.5 + col * (colW + 0.5);
      const y = 1.15 + row * (itemH + gap);

      s.addShape(pptx.ShapeType.ellipse, { x, y: y + (itemH - circleD) / 2, w: circleD, h: circleD, fill: { color: acc }, line: { type: 'none' } });
      s.addText(String(i + 1), t({ x, y: y + (itemH - circleD) / 2, w: circleD, h: circleD, fontSize: 15, color: C.dark, bold: true, align: 'center', valign: 'middle' }, ctx));

      cardBg(s, ctx, x + circleD + 0.12, y, colW - circleD - 0.12, itemH);
      s.addText(mdRuns(item) as never, t({ x: x + circleD + 0.28, y: y + 0.05, w: colW - circleD - 0.45, h: itemH - 0.1, fontSize: 14, color: C.dark, valign: 'middle', wrap: true }, ctx));
    });
  }
  if (slide.notes) s.addNotes(slide.notes);
}

function addNumberedCardsSlide(ctx: Ctx, slide: ParsedSlide) {
  const { pptx, acc } = ctx;
  const s = pptx.addSlide({ masterName: 'CONTENT_MASTER' });
  hdr(s, slide.title, ctx);

  if (slide.body?.length) {
    const items = slide.body.slice(0, 6);
    const gap = 0.1;
    const itemH = Math.min(0.88, (5.75 - (items.length - 1) * gap) / items.length);
    const circleD = Math.min(0.62, itemH * 0.7);

    items.forEach((item, i) => {
      const y = 1.12 + i * (itemH + gap);
      cardBg(s, ctx, 0.5, y, 12.3, itemH);
      s.addShape(pptx.ShapeType.ellipse, { x: 0.65, y: y + (itemH - circleD) / 2, w: circleD, h: circleD, fill: { color: acc }, line: { type: 'none' } });
      s.addText(String(i + 1), t({ x: 0.65, y: y + (itemH - circleD) / 2, w: circleD, h: circleD, fontSize: 16, color: C.dark, bold: true, align: 'center', valign: 'middle' }, ctx));
      s.addText(mdRuns(item) as never, t({ x: 0.65 + circleD + 0.2, y: y + 0.07, w: 11.7 - circleD, h: itemH - 0.14, fontSize: 13, color: C.dark, valign: 'middle', wrap: true }, ctx));
    });
  }
  if (slide.notes) s.addNotes(slide.notes);
}

function addIconListSlide(ctx: Ctx, slide: ParsedSlide) {
  const { pptx } = ctx;
  const s = pptx.addSlide({ masterName: 'CONTENT_MASTER' });
  hdr(s, slide.title, ctx);

  if (slide.body?.length) {
    const items = slide.body.slice(0, 7);
    const gap = 0.1;
    const itemH = Math.min(0.82, (5.75 - (items.length - 1) * gap) / items.length);
    const fills = [C.lightCard, C.lightBg];

    items.forEach((item, i) => {
      const y = 1.12 + i * (itemH + gap);
      cardBg(s, ctx, 0.5, y, 12.3, itemH, fills[i % 2]);
      s.addText(mdRuns(item) as never, t({ x: 0.72, y: y + 0.05, w: 12.0, h: itemH - 0.1, fontSize: 13, color: C.dark, valign: 'middle', wrap: true }, ctx));
    });
  }
  if (slide.notes) s.addNotes(slide.notes);
}

function addStatsSlide(ctx: Ctx, slide: ParsedSlide) {
  const { pptx, acc } = ctx;
  const s = pptx.addSlide({ masterName: 'DARK_MASTER' });

  s.addText(slide.title, t({ x: 0.5, y: 0.18, w: 12.3, h: 0.9, fontSize: 28, color: C.white, bold: true }, ctx));
  if (slide.subtitle) {
    s.addText(slide.subtitle, t({ x: 0.5, y: 0.98, w: 12.3, h: 0.4, fontSize: 13, color: acc }, ctx));
  }

  if (slide.body?.length) {
    const stats = slide.body.map(item => {
      const parts = item.split('|').map(p => p.trim());
      return { value: parts[0] || '', label: parts[1] || '' };
    }).slice(0, 6);

    const count = stats.length;
    const cols = count <= 2 ? count : count <= 4 ? 4 : 3;
    const rows = Math.ceil(count / cols);
    const gapX = 0.28, gapY = 0.28;
    const boxW = (12.3 - (cols - 1) * gapX) / cols;
    const boxH = rows === 1 ? 3.5 : (5.4 - (rows - 1) * gapY) / rows;
    const startX = 0.5;
    const startY = rows === 1 ? 2.0 : 1.5;

    stats.forEach((stat, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (boxW + gapX);
      const y = startY + row * (boxH + gapY);

      s.addShape(pptx.ShapeType.rect, { x, y, w: boxW, h: boxH, fill: { color: C.card }, line: { color: C.tealDim, pt: 1.5 } });
      s.addShape(pptx.ShapeType.rect, { x, y, w: boxW, h: 0.07, fill: { color: acc }, line: { type: 'none' } });

      const valFs = stat.value.length <= 4 ? 46 : stat.value.length <= 8 ? 34 : stat.value.length <= 12 ? 24 : 18;
      s.addText(stat.value, t({ x: x + 0.1, y: y + 0.15, w: boxW - 0.2, h: boxH * 0.58, fontSize: valFs, color: acc, bold: true, align: 'center', valign: 'middle', wrap: true }, ctx));

      if (stat.label) {
        s.addText(stat.label, t({ x: x + 0.1, y: y + boxH * 0.68, w: boxW - 0.2, h: boxH * 0.3, fontSize: 12, color: C.offWhite, align: 'center', valign: 'top', wrap: true }, ctx));
      }
    });
  }
  if (slide.notes) s.addNotes(slide.notes);
}

function addCalloutSlide(ctx: Ctx, slide: ParsedSlide) {
  const { pptx, acc } = ctx;
  const s = pptx.addSlide({ masterName: 'DARK_MASTER' });

  s.addText(slide.title, t({ x: 0.5, y: 0.18, w: 12.3, h: 0.8, fontSize: 22, color: acc, bold: true }, ctx));

  const calloutText = slide.body?.[0] ?? slide.subtitle ?? '';
  const supporting = slide.body?.slice(1) ?? [];
  const calloutH = supporting.length > 0 ? 2.1 : 4.0;

  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.1, w: 12.3, h: calloutH, fill: { color: C.tealDim }, line: { color: acc, pt: 2 } });
  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.1, w: 0.14, h: calloutH, fill: { color: acc }, line: { type: 'none' } });
  s.addText(calloutText, t({ x: 0.82, y: 1.1, w: 11.8, h: calloutH, fontSize: supporting.length > 0 ? 21 : 28, color: C.white, valign: 'middle', wrap: true }, ctx));

  if (supporting.length > 0) {
    const suppH = Math.min(0.72, (3.4 - (supporting.length - 1) * 0.1) / supporting.length);
    supporting.forEach((item, i) => {
      const y = 3.35 + i * (suppH + 0.1);
      s.addShape(pptx.ShapeType.rect, { x: 0.5, y, w: 12.3, h: suppH, fill: { color: C.card }, line: { color: '1E3A5F', pt: 0.75 } });
      accentBar(s, ctx, 0.5, y, suppH);
      s.addText(mdRuns(item) as never, t({ x: 0.72, y: y + 0.05, w: 12.0, h: suppH - 0.1, fontSize: 12, color: C.offWhite, valign: 'middle', wrap: true }, ctx));
    });
  }
  if (slide.notes) s.addNotes(slide.notes);
}

function addTwoColumnSlide(ctx: Ctx, slide: ParsedSlide) {
  const { pptx, acc, sec } = ctx;
  const s = pptx.addSlide({ masterName: 'CONTENT_MASTER' });
  hdr(s, slide.title, ctx);

  const labels = slide.subtitle?.split('|').map(l => l.trim()) ?? [];
  const colW = 5.9;
  const lX = 0.5, rX = lX + colW + 0.53;
  const headerH = 0.42;

  ([[lX, acc, labels[0] ?? ''], [rX, sec, labels[1] ?? '']] as [number, string, string][]).forEach(([x, color, label]) => {
    s.addShape(pptx.ShapeType.rect, { x, y: 1.12, w: colW, h: headerH, fill: { color: C.dark }, line: { type: 'none' } });
    s.addShape(pptx.ShapeType.rect, { x, y: 1.12 + headerH, w: colW, h: 0.05, fill: { color }, line: { type: 'none' } });
    if (label) s.addText(label, t({ x: x + 0.12, y: 1.12, w: colW - 0.24, h: headerH, fontSize: 12, color, bold: true, valign: 'middle' }, ctx));
  });

  const available = 5.15;
  const renderCol = (items: string[], x: number, accentColor: string) => {
    const gap = 0.08;
    const itemH = Math.min(0.78, (available - (items.length - 1) * gap) / items.length);
    items.forEach((item, i) => {
      const y = 1.67 + i * (itemH + gap);
      cardBg(s, ctx, x, y, colW, itemH);
      accentBar(s, ctx, x, y, itemH, accentColor);
      s.addText(mdRuns(item) as never, t({ x: x + 0.16, y: y + 0.04, w: colW - 0.26, h: itemH - 0.08, fontSize: 12, color: C.dark, valign: 'middle', wrap: true }, ctx));
    });
  };

  if (slide.left?.length)  renderCol(slide.left,  lX, acc);
  if (slide.right?.length) renderCol(slide.right, rX, sec);
  if (slide.notes) s.addNotes(slide.notes);
}

function addTableSlide(ctx: Ctx, slide: ParsedSlide) {
  const { pptx, acc } = ctx;
  const s = pptx.addSlide({ masterName: 'CONTENT_MASTER' });
  hdr(s, slide.title, ctx);

  if (slide.headers && slide.rows) {
    const headerRow = slide.headers.map((h: string) => ({
      text: h,
      options: { fill: { color: C.dark }, color: acc, bold: true, fontSize: 11, align: 'left', margin: [5, 8, 5, 8], fontFace: ctx.fnt },
    }));

    const dataRows = slide.rows.map((row: string[], ri: number) =>
      row.map((cell: string) => {
        const ragColor = RAG[cell.toUpperCase()];
        return {
          text: cell,
          options: {
            fontSize: 10, fontFace: ctx.fnt,
            color: ragColor ? C.white : C.dark,
            fill: ragColor ? { color: ragColor } : { color: ri % 2 === 0 ? C.white : C.lightCard },
            align: 'left', margin: [4, 8, 4, 8],
          },
        };
      })
    );

    s.addTable([headerRow, ...dataRows], {
      x: 0.5, y: 1.15, w: 12.3,
      colW: Array(slide.headers.length).fill(12.3 / slide.headers.length),
      border: { type: 'solid', pt: 0.5, color: C.lightBord },
      rowH: 0.38, autoPage: true,
    });
  }
  if (slide.notes) s.addNotes(slide.notes);
}

function addChartSlide(ctx: Ctx, slide: ParsedSlide) {
  const { pptx } = ctx;
  const s = pptx.addSlide({ masterName: 'CONTENT_MASTER' });
  hdr(s, slide.title, ctx);

  if (slide.data?.length) {
    const chartType = slide.type === 'chart-pie' ? pptx.ChartType.pie : pptx.ChartType.bar;
    s.addChart(chartType, [{
      name: slide.title,
      labels: slide.data.map((d: any) => d.label),
      values: slide.data.map((d: any) => d.value),
    }], {
      x: 1, y: 1.2, w: 11, h: 5.5,
      showLegend: true, legendPos: 'b', showValue: true,
      chartColors: ctx.chartColors,
    });
  }
  if (slide.notes) s.addNotes(slide.notes);
}

function addQuoteSlide(ctx: Ctx, slide: ParsedSlide) {
  const { pptx, acc } = ctx;
  const s = pptx.addSlide({ masterName: 'DARK_MASTER' });

  s.addText('\u201C', t({ x: 0.5, y: 0.6, w: 1.6, h: 2.2, fontSize: 130, color: C.tealSoft, bold: true }, ctx));

  const quoteText = slide.body ? slide.body.join(' ') : slide.title;
  s.addText(quoteText, t({ x: 1.6, y: 1.5, w: 10.8, h: 3.4, fontSize: 26, color: C.white, italic: true, valign: 'middle', wrap: true }, ctx));

  if (slide.subtitle) {
    s.addShape(pptx.ShapeType.rect, { x: 1.6, y: 5.1, w: 3.5, h: 0.06, fill: { color: acc }, line: { type: 'none' } });
    s.addText(`— ${slide.subtitle}`, t({ x: 1.6, y: 5.25, w: 10.8, h: 0.55, fontSize: 15, color: acc }, ctx));
  }
  if (slide.notes) s.addNotes(slide.notes);
}
