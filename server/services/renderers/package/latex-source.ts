// ── Renderer: LaTeX source (.tex) ────────────────────────────────────────
//
// Emits a compilable LaTeX SOURCE file. ANTON deliberately does NOT compile
// it: a TeX distribution is 1-8 GB (TeX Live) or auto-fetches packages from
// the network on first compile (MiKTeX), and both break the local-first
// promise that nothing but the LLM call leaves the machine. The .tex file is
// the deliverable — the point is that a firm or academic with an existing
// LaTeX house style can pour ANTON's content into THEIR structure and run
// their own pdflatex/xelatex/lualatex.
//
// Deterministic — no LLM. Converts the Markdown output with its own minimal
// parser (same shape as the standalone-html renderer next door, so the two
// stay comparable) and escapes the ten LaTeX special characters.

import type { BrandTemplate, RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

// ── Company preamble configuration ────────────────────────────────────────
//
// TRUST MODEL. `latex_preamble` is written into the .tex verbatim, so it can
// contain arbitrary TeX — including `\write18{…}`, which executes a shell
// command when the document is compiled with `-shell-escape`. That is
// acceptable here for two reasons, and only these two:
//
//   1. ANTON never runs a TeX binary. Inside this process the preamble is
//      inert text on its way to a file, so it cannot become code here. The
//      only thing a hostile preamble can do to ANTON is produce a broken
//      .tex — which is the bar the feature was designed to.
//   2. The value is operator configuration (the profile's brand config) or a
//      per-run option from the session's own owner — never third-party input.
//      Whoever writes the preamble is whoever compiles the result.
//
// We deliberately do NOT blacklist `\write18` / `\input` / `\openout`. TeX has
// too many aliases and expansion tricks for a blacklist to be sound, and a
// leaky blacklist is worse than none because it invites people to trust the
// output. Instead we (a) bound the size, (b) validate the document class
// against a strict pattern since it is interpolated into a command argument,
// and (c) fence the operator block with comment markers so anyone who is
// handed the .tex can see exactly which lines ANTON did not author.
const MAX_PREAMBLE_CHARS = 20_000;

/** LaTeX class names are file stems (`article.cls`, `acmecorp.cls`). */
const DOCUMENTCLASS_RE = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;

const DEFAULT_DOCUMENTCLASS = 'article';

/**
 * Sensible defaults for a firm that has no house style yet. inputenc/fontenc
 * make UTF-8 content (accents, dashes) compile under pdflatex; geometry gives
 * a readable measure; booktabs and hyperref are what the table and link
 * conversions below emit when they are available.
 */
const DEFAULT_PREAMBLE = [
  '\\usepackage[utf8]{inputenc}',
  '\\usepackage[T1]{fontenc}',
  '\\usepackage[margin=25mm]{geometry}',
  '\\usepackage{booktabs}',
  '\\usepackage{hyperref}',
].join('\n');

export const render: RenderFn = async (_payload, context): Promise<RenderResult> => {
  const markdown = context.markdown ?? '';
  if (!markdown.trim()) throw new Error('No markdown content available for LaTeX export');

  const style = resolveLatexStyle(context.brand_template, context.options);
  const { latex, stats } = buildDocument({
    title: context.session.title,
    author: context.brand_template?.header_text ?? '',
    style,
    markdown,
  });

  const filename = buildFilename('{module_id}-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'latex-source',
    file_type: 'tex',
  });
  const saved = await saveArtifact({ sessionId: context.session.id, filename, content: latex });

  return {
    file_path: saved.rel_path,
    file_type: 'tex',
    mime_type: 'application/x-tex',
    file_size_bytes: saved.size_bytes,
    metadata: {
      title: context.session.title,
      word_count: markdown.split(/\s+/).filter(Boolean).length,
      documentclass: style.documentclass,
      documentclass_source: style.documentclass_source,
      preamble_source: style.preamble_source,
      // Surfaced so an operator whose config was ignored can see why rather
      // than silently getting the ANTON defaults back.
      rejected_config: style.rejected,
      ...stats,
    },
    validation: { valid: true },
  };
};

// ── Style resolution ──────────────────────────────────────────────────────

interface LatexStyle {
  documentclass: string;
  preamble: string;
  documentclass_source: 'default' | 'config';
  preamble_source: 'default' | 'config';
  /** Config keys that were present but ignored, with the reason. */
  rejected: string[];
}

/**
 * Resolve `latex_documentclass` / `latex_preamble`, lowest precedence first:
 *
 *   1. the brand template's own top level — `loadBrandTemplate()` casts the
 *      whole stored `user_profiles.brand_config` JSON to a BrandTemplate, so
 *      keys an operator puts at the top level of that JSON arrive here even
 *      though the BrandTemplate interface doesn't declare them;
 *   2. `brand_template.extra` — the declared free-form escape hatch;
 *   3. the per-run `options` on POST /api/renderers/run, which is owner-bound
 *      and CSRF-protected, so it is the same trust level as (1) and (2).
 *
 * (3) matters today because the brand path is currently dead: the registry
 * reads `user_profiles WHERE user_id = ?` and that column does not exist on
 * the table (PK is `id`), so `loadBrandTemplate()` throws, is swallowed, and
 * every renderer sees `brand_template === undefined`. Fixing that is a
 * profile-schema change, out of scope here — but shipping the override with
 * no reachable path at all would just be dead code.
 */
function resolveLatexStyle(
  brand: BrandTemplate | undefined,
  options: Record<string, unknown> | undefined,
): LatexStyle {
  const sources = [asRecord(brand), asRecord(brand?.extra), asRecord(options)];
  const rejected: string[] = [];

  const rawClass = pickLast(sources, 'latex_documentclass');
  let documentclass = DEFAULT_DOCUMENTCLASS;
  let documentclassSource: LatexStyle['documentclass_source'] = 'default';
  if (rawClass !== undefined) {
    if (typeof rawClass === 'string' && DOCUMENTCLASS_RE.test(rawClass)) {
      documentclass = rawClass;
      documentclassSource = 'config';
    } else {
      rejected.push('latex_documentclass: not a plain class name');
    }
  }

  const rawPreamble = pickLast(sources, 'latex_preamble');
  let preamble = DEFAULT_PREAMBLE;
  let preambleSource: LatexStyle['preamble_source'] = 'default';
  if (rawPreamble !== undefined) {
    if (typeof rawPreamble !== 'string') {
      rejected.push('latex_preamble: not a string');
    } else if (rawPreamble.length > MAX_PREAMBLE_CHARS) {
      // Fall back whole rather than truncate — a preamble cut mid-command
      // produces a .tex that fails in a way nobody can diagnose.
      rejected.push(`latex_preamble: exceeds ${MAX_PREAMBLE_CHARS} characters`);
    } else {
      preamble = rawPreamble;
      preambleSource = 'config';
    }
  }

  return {
    documentclass,
    preamble,
    documentclass_source: documentclassSource,
    preamble_source: preambleSource,
    rejected,
  };
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
}

/** Last source that defines the key wins (later sources = higher precedence). */
function pickLast(sources: Array<Record<string, unknown> | undefined>, key: string): unknown {
  let found: unknown;
  for (const s of sources) {
    if (s && s[key] !== undefined) found = s[key];
  }
  return found;
}

// ── Document assembly ─────────────────────────────────────────────────────

interface BuildDocumentInput {
  title: string;
  author: string;
  style: LatexStyle;
  markdown: string;
}

function buildDocument({ title, author, style, markdown }: BuildDocumentInput): { latex: string; stats: ConversionStats } {
  // Loose feature probes rather than a real \usepackage parse. A false
  // positive means the operator's preamble mentioned booktabs without loading
  // it — their .tex, their fix. A false negative degrades gracefully to
  // \hline rules and plain-text links, which compile under any class.
  const features: LatexFeatures = {
    booktabs: /\bbooktabs\b/.test(style.preamble),
    hyperref: /\bhyperref\b/.test(style.preamble),
  };
  const { latex: body, stats } = markdownToLatex(markdown, features);

  const preambleBlock = style.preamble_source === 'config'
    ? [
        '% ── BEGIN preamble supplied by this instance\'s configuration ─────────',
        '% ANTON copied the following lines verbatim and did not author them.',
        style.preamble,
        '% ── END configured preamble ──────────────────────────────────────────',
      ]
    : ['% ── ANTON default preamble ───────────────────────────────────────────', style.preamble];

  const lines = [
    // Deliberately no literal \begin{document} in the prose here: tooling that
    // locates the body by scanning for that line should not trip over a comment.
    '% Generated by ANTON — LaTeX source export.',
    '% ANTON does not compile LaTeX. Run pdflatex/xelatex/lualatex yourself, or',
    '% lift the document body out of this file into your own house-style master.',
    `\\documentclass{${style.documentclass}}`,
    '',
    ...preambleBlock,
    '',
    `\\title{${escapeLatex(title)}}`,
    `\\author{${escapeLatex(author)}}`,
    '\\date{\\today}',
    '',
    '\\begin{document}',
    // \maketitle is defined by every standard class and by house-style classes
    // derived from them; a class that redefines the title page still honours it.
    '\\maketitle',
    '',
    // Content cannot break out of this environment: escapeLatex turns any
    // backslash in the Markdown into \textbackslash{}, so a literal
    // "\end{document}" in the source is typeset, not obeyed.
    body,
    '',
    '\\end{document}',
    '',
  ];
  return { latex: lines.join('\n'), stats };
}

// ── Markdown → LaTeX ──────────────────────────────────────────────────────

interface LatexFeatures {
  booktabs: boolean;
  hyperref: boolean;
}

interface ConversionStats {
  heading_count: number;
  table_count: number;
  code_block_count: number;
  list_count: number;
}

/**
 * Minimal Markdown → LaTeX over the subset ANTON modules actually emit:
 * headings (#/##/###…), bold, italic, inline code, fenced code, bullet and
 * numbered lists (including nesting), blockquotes, horizontal rules, tables,
 * paragraphs. Not CommonMark — deterministic and dependency-free.
 */
function markdownToLatex(md: string, features: LatexFeatures): { latex: string; stats: ConversionStats } {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  const stats: ConversionStats = { heading_count: 0, table_count: 0, code_block_count: 0, list_count: 0 };
  let i = 0;

  function consumeFenced(): boolean {
    if (!/^```/.test(lines[i] ?? '')) return false;
    i++;
    const codeLines: string[] = [];
    while (i < lines.length && !/^```/.test(lines[i])) { codeLines.push(lines[i]); i++; }
    if (i < lines.length) i++; // consume the closing fence
    // verbatim is character-exact: its contents must NOT be escaped, or the
    // reader sees \textbackslash{} where the code said "\".
    //
    // The one thing that must be defused is a literal \end{verbatim} inside
    // the block — TeX would end the environment there and typeset the rest of
    // the code as LaTeX. TeX only recognises the terminator with nothing
    // between \end and {verbatim}, so a space neutralises it while keeping
    // the line readable.
    const code = codeLines.join('\n').replace(/\\end\{verbatim\}/g, '\\end {verbatim}');
    out.push(['\\begin{verbatim}', code, '\\end{verbatim}'].join('\n'));
    stats.code_block_count++;
    return true;
  }

  function consumeTable(): boolean {
    const header = lines[i];
    const sep = lines[i + 1];
    if (!/^\|/.test(header) || !sep || !/^\|?[\s:-]+\|/.test(sep)) return false;
    const split = (ln: string) => ln.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const head = split(header);
    const aligns = split(sep).map(cellAlignment);
    i += 2;
    const rows: string[][] = [];
    while (i < lines.length && /^\|/.test(lines[i])) { rows.push(split(lines[i])); i++; }

    // tabular is rigid: a row with the wrong number of & separators is a hard
    // compile error ("Extra alignment tab"). LLM tables are not always square,
    // so normalise every row to the header width.
    const cols = head.length;
    const colSpec = padTo(aligns, cols, 'l').join('');
    const block = [
      '\\begin{table}[htbp]',
      '\\centering',
      `\\begin{tabular}{${colSpec}}`,
      features.booktabs ? '\\toprule' : '\\hline',
      `${head.map(c => `\\textbf{${renderInline(c, features)}}`).join(' & ')} \\\\`,
      features.booktabs ? '\\midrule' : '\\hline',
      ...rows.map(r => `${padTo(r, cols, '').map(c => renderInline(c, features)).join(' & ')} \\\\`),
      features.booktabs ? '\\bottomrule' : '\\hline',
      '\\end{tabular}',
      '\\end{table}',
    ];
    out.push(block.join('\n'));
    stats.table_count++;
    return true;
  }

  function consumeList(): boolean {
    if (!LIST_ITEM_RE.test(lines[i] ?? '')) return false;
    const entries: ListEntry[] = [];
    while (i < lines.length) {
      const m = LIST_ITEM_RE.exec(lines[i]);
      if (!m) break;
      entries.push({
        indent: m[1].replace(/\t/g, '    ').length,
        ordered: /\d/.test(m[2]),
        text: m[3],
      });
      i++;
    }
    out.push(emitList(buildListTree(entries), 1, features).join('\n'));
    stats.list_count++;
    return true;
  }

  function consumeBlockquote(): boolean {
    if (!/^>\s?/.test(lines[i] ?? '')) return false;
    const content: string[] = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      content.push(lines[i].replace(/^>\s?/, ''));
      i++;
    }
    out.push([
      '\\begin{quote}',
      ...content.map(l => renderInline(l, features)),
      '\\end{quote}',
    ].join('\n'));
    return true;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^---+$/.test(line)) {
      // \rule needs no package, unlike \hrulefill's cousins in some classes.
      out.push('\\noindent\\rule{\\textwidth}{0.4pt}');
      i++; continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      const m = /^(#{1,6})\s+(.*)$/.exec(line)!;
      out.push(`${HEADING_COMMANDS[m[1].length - 1]}{${renderInline(m[2], features)}}`);
      stats.heading_count++;
      i++; continue;
    }
    if (consumeFenced()) continue;
    if (consumeTable())  continue;
    if (consumeList())   continue;
    if (consumeBlockquote()) continue;
    // Paragraph — accumulate until a blank line or a block break
    const para: string[] = [];
    while (i < lines.length && lines[i] && !/^#{1,6}\s+/.test(lines[i])
           && !/^```/.test(lines[i]) && !/^>\s?/.test(lines[i])
           && !LIST_ITEM_RE.test(lines[i])
           && !/^---+$/.test(lines[i]) && !/^\|/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    if (para.length) out.push(renderInline(para.join(' '), features));
  }

  // One `out` entry per BLOCK, not per line — blocks are joined with a blank
  // line because that is how LaTeX reads a paragraph break. Multi-line blocks
  // (verbatim, tabular, lists) therefore have to be assembled as a single
  // entry: a blank line spliced into verbatim would silently add an empty
  // line to the user's code, and one inside tabular ends the cell's paragraph.
  return { latex: out.join('\n\n'), stats };
}

/** article/report/book run out of sectioning depth after \subparagraph. */
const HEADING_COMMANDS = [
  '\\section', '\\subsection', '\\subsubsection',
  '\\paragraph', '\\subparagraph', '\\subparagraph',
];

const LIST_ITEM_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;

function cellAlignment(sepCell: string): string {
  if (/^:.*:$/.test(sepCell)) return 'c';
  if (/:$/.test(sepCell)) return 'r';
  return 'l';
}

function padTo<T>(arr: T[], length: number, fill: T): T[] {
  if (arr.length === length) return arr;
  if (arr.length > length) return arr.slice(0, length);
  return [...arr, ...Array<T>(length - arr.length).fill(fill)];
}

// ── Lists ─────────────────────────────────────────────────────────────────

interface ListEntry { indent: number; ordered: boolean; text: string }
interface ListNode { ordered: boolean; text: string; children: ListNode[] }

/**
 * Group a flat run of list lines into a tree by leading indentation. Indent
 * widths in real Markdown are inconsistent (2 vs 3 vs 4 spaces, tabs), so the
 * rule is relative: deeper than the current level opens a child list, shallower
 * closes back to the nearest matching level.
 */
function buildListTree(entries: ListEntry[]): ListNode[] {
  const roots: ListNode[] = [];
  if (entries.length === 0) return roots;
  const stack: Array<{ indent: number; nodes: ListNode[] }> = [{ indent: entries[0].indent, nodes: roots }];
  for (const e of entries) {
    while (stack.length > 1 && e.indent < stack[stack.length - 1].indent) stack.pop();
    const top = stack[stack.length - 1];
    if (e.indent > top.indent) {
      const parent = top.nodes[top.nodes.length - 1];
      // A deeper item with no sibling above it has nothing to nest under —
      // treat it as belonging to the current level instead of dropping it.
      if (parent) stack.push({ indent: e.indent, nodes: parent.children });
      else top.indent = e.indent;
    }
    stack[stack.length - 1].nodes.push({ ordered: e.ordered, text: e.text, children: [] });
  }
  return roots;
}

/**
 * LaTeX allows four levels of itemize/enumerate nesting; a fifth is a hard
 * "Too deeply nested" error. Deeper items are emitted at level 4 rather than
 * silently dropped — the outline flattens, but the document still compiles.
 */
const MAX_LIST_DEPTH = 4;

function emitList(nodes: ListNode[], depth: number, features: LatexFeatures): string[] {
  if (nodes.length === 0) return [];
  const env = nodes[0].ordered ? 'enumerate' : 'itemize';
  const nest = depth <= MAX_LIST_DEPTH;
  const pad = '  '.repeat(Math.min(depth, MAX_LIST_DEPTH) - 1);
  const out: string[] = [];
  if (nest) out.push(`${pad}\\begin{${env}}`);
  for (const n of nodes) {
    out.push(`${pad}  \\item ${renderInline(n.text, features)}`);
    if (n.children.length > 0) out.push(...emitList(n.children, depth + 1, features));
  }
  if (nest) out.push(`${pad}\\end{${env}}`);
  return out;
}

// ── Inline formatting ─────────────────────────────────────────────────────

// Placeholders are C0 control characters: they cannot appear in Markdown that
// came out of an LLM, they are not LaTeX specials, and none of the emphasis
// regexes below can match them. Pulling code spans and links out BEFORE
// escaping is what keeps `*` inside `code` from becoming \textit and keeps a
// URL from being mangled by text-mode escaping.
const CODE_TOKEN = (n: number) => `\u0001C${n}\u0002`;
const LINK_TOKEN = (n: number) => `\u0001L${n}\u0002`;

function renderInline(raw: string, features: LatexFeatures): string {
  const codes: string[] = [];
  const links: Array<{ text: string; url: string }> = [];

  let s = raw.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(code);
    return CODE_TOKEN(codes.length - 1);
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    links.push({ text, url });
    return LINK_TOKEN(links.length - 1);
  });

  s = escapeLatex(s);
  // Bold before italic so ** isn't eaten by the single-* rule.
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) => `\\textbf{${inner}}`);
  s = s.replace(/\*([^*]+)\*/g, (_m, inner: string) => `\\textit{${inner}}`);

  s = s.replace(/\u0001C(\d+)\u0002/g, (_m, n: string) => `\\texttt{${escapeLatex(codes[Number(n)])}}`);
  s = s.replace(/\u0001L(\d+)\u0002/g, (_m, n: string) => {
    const { text, url } = links[Number(n)];
    const label = escapeLatex(text);
    // \href only exists with hyperref loaded. Without it, degrade to text the
    // reader can still act on rather than emitting an undefined control
    // sequence into someone's house-style document.
    return features.hyperref
      ? `\\href{${escapeLatexUrl(url)}}{${label}}`
      : `${label} (\\texttt{${escapeLatex(url)}})`;
  });
  return s;
}

/**
 * The ten characters LaTeX treats specially in text mode. `~`, `^` and `\`
 * have no backslash-escape — `\~` and `\^` are accents that need an argument
 * and `\\` is a line break — so they take the \textasciitilde,
 * \textasciicircum and \textbackslash commands instead. Single pass, so the
 * `{}` those commands introduce are not re-escaped.
 */
const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  '$': '\\$',
  '#': '\\#',
  '_': '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

function escapeLatex(s: string): string {
  return s.replace(/[\\&%$#_{}~^]/g, ch => LATEX_ESCAPES[ch]);
}

/**
 * URLs inside \href need a different rule from body text. hyperref reads the
 * target with catcodes already relaxed for `~ _ & $ ^`, but `\ { } % #` are
 * consumed by TeX's input processor before hyperref ever sees them — so those
 * five, and only those five, get a backslash. Text-mode escaping would break
 * the link (`\textasciitilde{}` is not a character a web server resolves).
 */
function escapeLatexUrl(s: string): string {
  return s.replace(/[\\{}%#]/g, ch => `\\${ch}`);
}
