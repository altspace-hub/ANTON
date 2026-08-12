// Unit tests for the latex-source renderer.
//
// Assertions are on the produced .tex STRING. Two habits keep them honest:
//
//   • Everything about the *content* is asserted against `bodyOf(tex)` — the
//     slice between the document environment markers. The preamble contains
//     backslashes, braces and percent signs of its own, so a naive
//     `tex.toContain('\\%')` would pass whether or not escaping works.
//   • Structural claims (verbatim byte-fidelity, table shape, list nesting)
//     compare whole extracted blocks rather than probing for substrings that
//     could match anywhere in the file.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import JSZip from 'jszip';
import type {
  LatexAssetFile,
  RenderContext,
  RenderResult,
} from '../../../server/services/renderer-registry.types.js';
import { BUILTIN_RENDERERS } from '../../../server/services/renderer-registry.builtin.js';

let tmpDir: string;
let sessionSeq = 0;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-latex-test-'));
  process.env.OUTPUT_DIR = tmpDir;
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Render `markdown` and return both the .tex text and the render result. */
async function renderTex(
  markdown: string,
  ctx: Partial<RenderContext> = {},
): Promise<{ tex: string; body: string; result: RenderResult }> {
  const { render } = await import('../../../server/services/renderers/package/latex-source.js');
  const sessionId = `sess_latex_${++sessionSeq}`;
  const result = await render(
    {
      schema_version: '1.0', module_id: 'test-module', area_id: '',
      content_type: 'analytic_report', sector: null, generated_at: '', model: '',
      body: {},
    },
    {
      session: {
        id: sessionId, module_id: 'test-module', title: 'Report',
        area_id: '', content_type: 'analytic_report', sector: null, user_id: null,
      },
      options: {},
      markdown,
      ...ctx,
    },
  );
  const tex = await fs.readFile(path.join(tmpDir, 'renderer-artifacts', result.file_path), 'utf-8');
  return { tex, body: bodyOf(tex), result };
}

/**
 * The document body only. Line-anchored on purpose — the header comment block
 * mentions the environment in prose, and an unanchored indexOf would slice
 * from there and quietly include the preamble in every assertion.
 */
function bodyOf(tex: string): string {
  const start = /^\\begin\{document\}$/m.exec(tex);
  const end = /^\\end\{document\}$/m.exec(tex);
  if (!start || !end) throw new Error('produced .tex has no document environment');
  return tex.slice(start.index + start[0].length, end.index);
}

/** The text inside the first verbatim environment, exactly as written. */
function verbatimBlock(tex: string): string {
  const m = /\\begin\{verbatim\}\n([\s\S]*?)\n\\end\{verbatim\}/.exec(tex);
  if (!m) throw new Error('no verbatim block in produced .tex');
  return m[1];
}

// ── Escaping ──────────────────────────────────────────────────────────────

describe('latex-source: escaping', () => {
  // Every LaTeX special, one at a time. ~ ^ and \ have no backslash form
  // (\~ and \^ are accents, \\ is a line break) so they take commands.
  const CASES: Array<[string, string, string]> = [
    ['ampersand',        'Fees A & B',      'Fees A \\& B'],
    ['percent',          'up 50% YoY',      'up 50\\% YoY'],
    ['dollar',           'costs $5m',       'costs \\$5m'],
    ['hash',             'finding #4',      'finding \\#4'],
    ['underscore',       'field snake_case','field snake\\_case'],
    ['opening brace',    'the set {a',      'the set \\{a'],
    ['closing brace',    'the set a}',      'the set a\\}'],
    ['tilde',            'about ~5 days',   'about \\textasciitilde{}5 days'],
    ['circumflex',       'value x^2 here',  'value x\\textasciicircum{}2 here'],
    ['backslash',        'path C:\\temp',   'path C:\\textbackslash{}temp'],
  ];

  for (const [name, input, expected] of CASES) {
    it(`escapes ${name}`, async () => {
      const { body } = await renderTex(input);
      expect(body).toContain(expected);
    });
  }

  it('escapes all ten specials in one pass without double-escaping', async () => {
    const { body } = await renderTex('all: & % $ # _ { } ~ ^ \\ end');
    expect(body).toContain(
      'all: \\& \\% \\$ \\# \\_ \\{ \\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{} end',
    );
    // The braces the three commands introduce must NOT be escaped in turn —
    // a two-pass escaper produces \textbackslash\{\}, which typesets as
    // literal "textbackslash{}" instead of a backslash.
    expect(body).not.toContain('\\textbackslash\\{\\}');
    expect(body).not.toContain('\\textasciitilde\\{\\}');
  });

  it('content cannot break out of the document environment', async () => {
    // A model that echoes LaTeX back at us must not be able to close the
    // document early — escaping the backslash is what prevents it.
    const { tex, body } = await renderTex('Then write \\end{document} and stop.');
    expect((tex.match(/^\\end\{document\}$/gm) ?? []).length).toBe(1);
    expect(body).toContain('Then write \\textbackslash{}end\\{document\\} and stop.');
  });

  it('escapes the session title in \\title{}', async () => {
    const { tex } = await renderTex('Body text.', {
      session: {
        id: 'sess_latex_title', module_id: 'm', title: 'Q3: 100% of AML & KYC_gaps',
        area_id: '', content_type: 'analytic_report', sector: null, user_id: null,
      },
    });
    expect(tex).toContain('\\title{Q3: 100\\% of AML \\& KYC\\_gaps}');
  });
});

// ── Verbatim ──────────────────────────────────────────────────────────────

describe('latex-source: fenced code', () => {
  it('reproduces code byte-for-byte inside verbatim — no escaping, no re-parsing', async () => {
    const code = [
      '# not a markdown heading',
      'if (a && b) { pct = 100% ~ ^ \\ $ _ }',
      '- not a list item',
      '**not bold** and `not code`',
      '| not | a | table |',
    ].join('\n');
    const { tex, body } = await renderTex(['```python', code, '```'].join('\n'));

    expect(verbatimBlock(tex)).toBe(code);
    // The markdown inside the fence must not have been interpreted.
    expect(body).not.toContain('\\section{not a markdown heading}');
    expect(body).not.toContain('\\textbf{not bold}');
    expect(body).not.toContain('\\begin{itemize}');
    expect(body).not.toContain('\\begin{tabular}');
  });

  it('defuses a literal \\end{verbatim} inside the code', async () => {
    const { tex } = await renderTex('```\nbefore \\end{verbatim} after\n```');
    // Exactly one real terminator — otherwise the rest of the document would
    // be typeset as LaTeX from that point on.
    expect((tex.match(/\\end\{verbatim\}/g) ?? []).length).toBe(1);
    expect(verbatimBlock(tex)).toBe('before \\end {verbatim} after');
  });

  it('does not splice blank lines into the code block', async () => {
    const { tex } = await renderTex('```\nline one\nline two\n```');
    expect(verbatimBlock(tex)).toBe('line one\nline two');
  });
});

// ── Inline formatting ─────────────────────────────────────────────────────

describe('latex-source: inline formatting', () => {
  it('converts bold, italic and inline code', async () => {
    const { body } = await renderTex('A **bold** and *italic* and `code()` run.');
    expect(body).toContain('A \\textbf{bold} and \\textit{italic} and \\texttt{code()} run.');
  });

  it('escapes inside inline code but does not emphasise it', async () => {
    // The *stars* inside the span would become \textit if code were not
    // pulled out before the emphasis pass — that is the point of this case.
    const { body } = await renderTex('Run `grep -r "a_b" *.md*` now.');
    expect(body).toContain('\\texttt{grep -r "a\\_b" *.md*}');
    expect(body).not.toContain('\\textit');
  });

  it('keeps multiple code spans and adjacent digits apart', async () => {
    // Placeholders are numbered; a digit sitting next to one must not be
    // absorbed into its index when the spans are substituted back in.
    const { body } = await renderTex('Use `alpha` 1 and `beta` 2.');
    expect(body).toContain('Use \\texttt{alpha} 1 and \\texttt{beta} 2.');
  });

  it('emits \\href when the preamble loads hyperref', async () => {
    const { body } = await renderTex('See [the guide](https://example.com/a_b?x=1&y=2#frag).');
    // # and % are consumed by TeX's input processor even inside \href; _ and &
    // are not, because hyperref reads the target with relaxed catcodes.
    expect(body).toContain('\\href{https://example.com/a_b?x=1&y=2\\#frag}{the guide}');
  });

  it('degrades to plain text when the preamble has no hyperref', async () => {
    const { body } = await renderTex('See [the guide](https://example.com/x).', {
      brand_template: { extra: { latex_preamble: '\\usepackage{booktabs}' } },
    });
    expect(body).not.toContain('\\href');
    expect(body).toContain('the guide (\\texttt{https://example.com/x})');
  });
});

// ── Block structure ───────────────────────────────────────────────────────

describe('latex-source: block structure', () => {
  it('maps heading levels onto sectioning commands', async () => {
    const { body } = await renderTex('# One\n\n## Two\n\n### Three\n\n#### Four\n');
    expect(body).toContain('\\section{One}');
    expect(body).toContain('\\subsection{Two}');
    expect(body).toContain('\\subsubsection{Three}');
    expect(body).toContain('\\paragraph{Four}');
  });

  it('converts blockquotes and horizontal rules', async () => {
    const { body } = await renderTex('> Quoted 50% line.\n> Second line.\n\n---\n');
    expect(body).toContain('\\begin{quote}\nQuoted 50\\% line.\nSecond line.\n\\end{quote}');
    expect(body).toContain('\\noindent\\rule{\\textwidth}{0.4pt}');
  });

  it('separates blocks with a blank line so LaTeX sees paragraph breaks', async () => {
    const { body } = await renderTex('First para.\n\nSecond para.\n');
    expect(body).toContain('First para.\n\nSecond para.');
  });
});

// ── Tables ────────────────────────────────────────────────────────────────

describe('latex-source: tables', () => {
  const TABLE = [
    '| Metric | Q1 | Q2 |',
    '|:-------|:--:|---:|',
    '| Revenue & fees | 10 | 20 |',
    '| Short row |',
  ].join('\n');

  it('emits a tabular inside a table float with alignment from the separator row', async () => {
    const { body } = await renderTex(TABLE);
    expect(body).toContain([
      '\\begin{table}[htbp]',
      '\\centering',
      '\\begin{tabular}{lcr}',
      '\\toprule',
      '\\textbf{Metric} & \\textbf{Q1} & \\textbf{Q2} \\\\',
      '\\midrule',
      'Revenue \\& fees & 10 & 20 \\\\',
      // Ragged rows are padded to the header width — a short row would
      // otherwise be a hard "Extra alignment tab" compile error.
      'Short row &  &  \\\\',
      '\\bottomrule',
      '\\end{tabular}',
      '\\end{table}',
    ].join('\n'));
  });

  it('falls back to \\hline when the configured preamble has no booktabs', async () => {
    const { body } = await renderTex(TABLE, {
      brand_template: { extra: { latex_preamble: '\\usepackage{hyperref}' } },
    });
    expect(body).not.toContain('\\toprule');
    expect(body).toContain('\\hline\n\\textbf{Metric} & \\textbf{Q1} & \\textbf{Q2} \\\\\n\\hline');
  });

  it('counts tables in the artifact metadata', async () => {
    const { result } = await renderTex(TABLE);
    expect(result.metadata.table_count).toBe(1);
  });
});

// ── Lists ─────────────────────────────────────────────────────────────────

describe('latex-source: lists', () => {
  it('nests child lists inside the parent item', async () => {
    const { body } = await renderTex([
      '- Alpha',
      '- Beta',
      '  - Beta one',
      '  - Beta two',
      '- Gamma',
    ].join('\n'));
    expect(body).toContain([
      '\\begin{itemize}',
      '  \\item Alpha',
      '  \\item Beta',
      '  \\begin{itemize}',
      '    \\item Beta one',
      '    \\item Beta two',
      '  \\end{itemize}',
      '  \\item Gamma',
      '\\end{itemize}',
    ].join('\n'));
  });

  it('uses enumerate for numbered lists, including nested ones', async () => {
    const { body } = await renderTex('1. First\n2. Second\n   1. Sub\n');
    expect(body).toContain([
      '\\begin{enumerate}',
      '  \\item First',
      '  \\item Second',
      '  \\begin{enumerate}',
      '    \\item Sub',
      '  \\end{enumerate}',
      '\\end{enumerate}',
    ].join('\n'));
  });

  it('clamps nesting at four levels but keeps every item', async () => {
    const { body } = await renderTex([
      '- L1',
      '  - L2',
      '    - L3',
      '      - L4',
      '        - L5',
      '          - L6',
    ].join('\n'));
    // A fifth \begin{itemize} is a hard "Too deeply nested" LaTeX error.
    expect((body.match(/\\begin\{itemize\}/g) ?? []).length).toBe(4);
    expect((body.match(/\\end\{itemize\}/g) ?? []).length).toBe(4);
    expect((body.match(/\\item /g) ?? []).length).toBe(6);
  });
});

// ── Preamble / document class ─────────────────────────────────────────────

describe('latex-source: preamble', () => {
  it('uses the ANTON default preamble when nothing is configured', async () => {
    const { tex, result } = await renderTex('Body.');
    expect(tex).toContain('\\documentclass{article}');
    expect(tex).toContain('\\usepackage[utf8]{inputenc}');
    expect(tex).toContain('\\usepackage[T1]{fontenc}');
    expect(tex).toContain('\\usepackage[margin=25mm]{geometry}');
    expect(tex).toContain('\\usepackage{booktabs}');
    expect(tex).toContain('\\usepackage{hyperref}');
    expect(result.metadata.preamble_source).toBe('default');
    expect(result.metadata.documentclass_source).toBe('default');
  });

  it('honours latex_documentclass + latex_preamble from brand_template.extra', async () => {
    const { tex, result } = await renderTex('Body.', {
      brand_template: {
        header_text: 'Acme LLP',
        extra: {
          latex_documentclass: 'acmecorp',
          latex_preamble: '\\usepackage{acmehouse}\n\\acmeConfidential{yes}',
        },
      },
    });
    expect(tex).toContain('\\documentclass{acmecorp}');
    // Copied verbatim, fenced so a recipient can see ANTON did not author it.
    expect(tex).toContain('\\usepackage{acmehouse}\n\\acmeConfidential{yes}');
    expect(tex).toMatch(/BEGIN preamble supplied by this instance/);
    expect(tex).toMatch(/END configured preamble/);
    // The defaults must be gone — otherwise the house style fights ANTON's.
    expect(tex).not.toContain('\\usepackage[margin=25mm]{geometry}');
    expect(tex).toContain('\\author{Acme LLP}');
    expect(result.metadata.documentclass).toBe('acmecorp');
    expect(result.metadata.preamble_source).toBe('config');
  });

  it('reads the keys from the brand config top level too', async () => {
    // loadBrandTemplate() casts the whole stored brand_config JSON to a
    // BrandTemplate, so operator keys at the top level arrive here undeclared.
    const { tex } = await renderTex('Body.', {
      brand_template: { latex_documentclass: 'scrartcl' } as unknown as RenderContext['brand_template'],
    });
    expect(tex).toContain('\\documentclass{scrartcl}');
  });

  it('lets per-run options override the brand config', async () => {
    const { tex } = await renderTex('Body.', {
      brand_template: { extra: { latex_documentclass: 'fromBrand' } },
      options: { latex_documentclass: 'fromOptions' },
    });
    expect(tex).toContain('\\documentclass{fromOptions}');
    expect(tex).not.toContain('\\documentclass{fromBrand}');
  });

  it('rejects a document class that is not a plain class name', async () => {
    const { tex, result } = await renderTex('Body.', {
      brand_template: { extra: { latex_documentclass: 'article}\n\\input{/etc/passwd}\n{' } },
    });
    expect(tex).toContain('\\documentclass{article}');
    expect(tex).not.toContain('\\input{/etc/passwd}');
    expect(result.metadata.documentclass_source).toBe('default');
    expect(result.metadata.rejected_config).toContain('latex_documentclass: not a plain class name');
  });

  it('rejects an oversized preamble rather than truncating it mid-command', async () => {
    const { tex, result } = await renderTex('Body.', {
      brand_template: { extra: { latex_preamble: `\\usepackage{x}${'%'.repeat(20_001)}` } },
    });
    expect(tex).toContain('\\usepackage[margin=25mm]{geometry}');
    expect(result.metadata.preamble_source).toBe('default');
    expect(result.metadata.rejected_config).toContain('latex_preamble: exceeds 20000 characters');
  });

  it('rejects a non-string preamble', async () => {
    const { result } = await renderTex('Body.', {
      brand_template: { extra: { latex_preamble: 42 } },
    });
    expect(result.metadata.preamble_source).toBe('default');
    expect(result.metadata.rejected_config).toContain('latex_preamble: not a string');
  });
});

// ── Contract ──────────────────────────────────────────────────────────────

describe('latex-source: renderer contract', () => {
  it('returns tex / application/x-tex and writes a .tex file', async () => {
    const { result } = await renderTex('# Title\n\nBody.');
    expect(result.file_type).toBe('tex');
    expect(result.mime_type).toBe('application/x-tex');
    expect(result.file_path.endsWith('.tex')).toBe(true);
    expect(result.validation).toEqual({ valid: true });
    expect(result.tokens_consumed).toBeUndefined();   // deterministic — no LLM
  });

  it('throws when the session has no markdown output', async () => {
    const { render } = await import('../../../server/services/renderers/package/latex-source.js');
    await expect(render(
      {
        schema_version: '1.0', module_id: 'm', area_id: '', content_type: 'analytic_report',
        sector: null, generated_at: '', model: '', body: {},
      },
      {
        session: { id: 'sess_latex_empty', module_id: 'm', title: 't', area_id: '', content_type: 'analytic_report', sector: null, user_id: null },
        options: {}, markdown: '   ',
      },
    )).rejects.toThrow(/No markdown content/);
  });
});

// ── Registration ──────────────────────────────────────────────────────────
//
// 'fountain' and 'fdx' were added to the legacy export path but never to its
// Zod enum, so they were unreachable from the day they shipped. These two
// tests are the guard against repeating that: the entry must exist AND the
// module path it declares must actually import and export `render`.

describe('latex-source: registry registration', () => {
  it('is declared in BUILTIN_RENDERERS with the tex output contract', () => {
    const def = BUILTIN_RENDERERS.find(r => r.id === 'latex-source');
    expect(def).toBeDefined();
    expect(def?.category).toBe('package');
    expect(def?.trigger).toBe('post_hoc');
    expect(def?.applies_when).toEqual({});
    expect(def?.phase).toBe(1);
    expect(def?.status).toBe('beta');
    expect(def?.output.file_type).toBe('tex');
    expect(def?.output.mime_type).toBe('application/x-tex');
  });

  it('declares a renderer_module that resolves and exports render()', async () => {
    const def = BUILTIN_RENDERERS.find(r => r.id === 'latex-source');
    // The registry does `await import(def.renderer_module)` relative to
    // server/services; from here that is ../../../server/services.
    const spec = `../../../server/services/${def!.renderer_module.replace(/^\.\//, '')}`;
    const mod = await import(/* @vite-ignore */ spec) as Record<string, unknown>;
    expect(typeof mod.render).toBe('function');
  });

  it('has a Transform Panel label for the tex file type', () => {
    // The panel is a .tsx component and these tests run in a node environment,
    // so this is a source-level guard rather than a render test. Without the
    // entry the button reads "a .tex file", which is technically fine but
    // hides that the user has to compile it themselves.
    const src = readFileSync(path.join(process.cwd(), 'src/components/shared/TransformPanel.tsx'), 'utf-8');
    expect(src).toMatch(/tex:\s*'[^']*LaTeX[^']*'/);
  });
});

/**
 * ── Defects found by adversarial review of the first version of this renderer ──
 *
 * These are the tests that were missing, not extra polish: the original 42 all passed
 * while the parser contained a reachable infinite loop.
 */
describe('malformed pipe lines cannot hang the parser', () => {
  /**
   * The outer loop advanced `i` only when a block consumer accepted the line or the
   * paragraph accumulator took it. A line starting with '|' that consumeTable() declined
   * was accepted by NEITHER — the accumulator excluded it with its own `!/^\|/` guard —
   * so `i` never moved. markdownToLatex is synchronous, so this did not hang one request:
   * it pegged Node's single-threaded event loop and stopped every route in ANTON until
   * the process was restarted.
   *
   * All five inputs are ordinary LLM output — a table missing its separator row, a table
   * truncated by a streamed response, an ASCII/BNF line.
   *
   * Be precise about what these tests do and do not give you. Against the old parser they
   * HANG; they do not fail. The per-test timeout below cannot save you, because a
   * synchronous spin blocks the event loop that vitest's timers run on — verified by
   * reverting the fix, at which point this file never finishes and CI dies on the job
   * timeout instead of reporting a failure.
   *
   * Clean failure comes from the progress assertion in markdownToLatex, which throws when
   * an iteration ends without advancing. That is why the assertion is there and why it
   * must not be removed as redundant: it is the difference between a future regression
   * showing up as a red test and showing up as a production outage.
   */
  it.each([
    ['a table with no separator row', '| Name | Value |\n| Alice | 1 |'],
    ['a table truncated mid-stream',  'Intro text.\n\n| pending |'],
    ['a lone pipe line',              '| trailing |'],
    ['a header that is the last line', '# T\n\n| A | B |'],
    ['an ASCII/BNF line',             '| expr ::= term | factor'],
  ])('returns for %s', async (_label, md) => {
    const { tex } = await renderTex(md);
    expect(typeof tex).toBe('string');
  }, 5000);

  it('keeps the text of a malformed table rather than dropping it', async () => {
    const { body } = await renderTex('| Name | Value |\n| Alice | 1 |');
    expect(body).toContain('Alice');
  });
});

describe('table rows are never silently truncated', () => {
  it('folds cells beyond the header width into the last column', async () => {
    // Dropping them kept the LaTeX valid but lost the client's content with no warning —
    // the exact failure mode this exporter exists to avoid.
    const { body } = await renderTex('| A | B |\n| --- | --- |\n| 1 | 2 | 3 | 4 |');
    expect(body).toContain('3');
    expect(body).toContain('4');
  });
});

// ── Bundling the company house style ──────────────────────────────────────
//
// The renderer's output SHAPE changes when the company has uploaded a class
// file: a .zip instead of a bare .tex. The assertions below deliberately read
// the archive back with JSZip while the renderer writes it with adm-zip — a
// round-trip through the same library would prove only that the library is
// self-consistent, and "the code called a zip function" is not the claim being
// made. The claim is that a recipient can open the file and find both halves of
// a compilable document inside it.

/** Render with the given assets and return the artifact's raw bytes + result. */
async function renderArtifact(
  markdown: string,
  assets: LatexAssetFile[] | undefined,
  options: Record<string, unknown> = {},
): Promise<{ result: RenderResult; bytes: Buffer }> {
  const { render } = await import('../../../server/services/renderers/package/latex-source.js');
  const sessionId = `sess_latex_${++sessionSeq}`;
  const result = await render(
    {
      schema_version: '1.0', module_id: 'test-module', area_id: '',
      content_type: 'analytic_report', sector: null, generated_at: '', model: '',
      body: {},
    },
    {
      session: {
        id: sessionId, module_id: 'test-module', title: 'Report',
        area_id: '', content_type: 'analytic_report', sector: null, user_id: null,
      },
      options,
      markdown,
      latex_assets: assets,
    },
  );
  const bytes = await fs.readFile(path.join(tmpDir, 'renderer-artifacts', result.file_path));
  return { result, bytes };
}

const CLS_BYTES = Buffer.from(
  [
    '\\NeedsTeXFormat{LaTeX2e}',
    '\\ProvidesClass{acmecorp}[2026/07/29 ACME house style]',
    '\\LoadClass{article}',
    '',
  ].join('\n'),
  'utf-8',
);
const STY_BYTES = Buffer.from('\\ProvidesPackage{acmecolors}\n', 'utf-8');
const BIB_BYTES = Buffer.from('@book{x, title={T}}\n', 'utf-8');

/** ZIP local-file-header magic. Present iff the artifact really is an archive. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

describe('latex-source: no house style uploaded', () => {
  it('emits a plain .tex, exactly as it always did', async () => {
    const { result, bytes } = await renderArtifact('# Title\n\nBody.', undefined);
    expect(result.file_type).toBe('tex');
    expect(result.mime_type).toBe('application/x-tex');
    expect(result.file_path.endsWith('.tex')).toBe(true);
    // Not merely "does not claim to be a zip" — it must not BE one.
    expect(bytes.subarray(0, 4).equals(ZIP_MAGIC)).toBe(false);
    expect(bytes.toString('utf-8')).toContain('\\begin{document}');
    expect(result.metadata.bundled).toBe(false);
    expect(result.metadata.bundled_files).toEqual([]);
  });

  it('emits a plain .tex when the asset list is present but empty', async () => {
    const { result } = await renderArtifact('# Title\n\nBody.', []);
    expect(result.file_type).toBe('tex');
  });
});

describe('latex-source: house style uploaded', () => {
  it('emits a zip that really contains BOTH the .tex and the class file', async () => {
    const { result, bytes } = await renderArtifact(
      '# Findings\n\nThe residual risk is acceptable.',
      [{ filename: 'acmecorp.cls', content: CLS_BYTES }],
      { latex_documentclass: 'acmecorp' },
    );

    expect(result.file_type).toBe('zip');
    expect(result.mime_type).toBe('application/zip');
    expect(bytes.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);

    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).sort();
    expect(names).toHaveLength(2);
    expect(names).toContain('acmecorp.cls');

    const texName = names.find(n => n.endsWith('.tex'));
    expect(texName).toBeDefined();

    // The .tex in the archive is the real document, not a stub or a manifest.
    const tex = await zip.file(texName!)!.async('string');
    expect(tex).toContain('\\documentclass{acmecorp}');
    expect(tex).toContain('\\begin{document}');
    expect(tex).toContain('\\section{Findings}');
    expect(tex).toContain('The residual risk is acceptable.');

    // The class file is the uploaded bytes, unaltered — a class file that has
    // been re-encoded or trimmed is a class file that will not load.
    const cls = await zip.file('acmecorp.cls')!.async('nodebuffer');
    expect(cls.equals(CLS_BYTES)).toBe(true);
  });

  it('names the archive after the .tex it carries', async () => {
    const { result, bytes } = await renderArtifact(
      'Body.', [{ filename: 'acmecorp.cls', content: CLS_BYTES }],
    );
    const zip = await JSZip.loadAsync(bytes);
    const texName = Object.keys(zip.files).find(n => n.endsWith('.tex'))!;
    expect(path.basename(result.file_path)).toBe(texName.replace(/\.tex$/, '.zip'));
    expect(result.metadata.tex_filename).toBe(texName);
  });

  it('carries every uploaded file, not just the first', async () => {
    const { bytes, result } = await renderArtifact(
      'Body.',
      [
        { filename: 'acmecorp.cls', content: CLS_BYTES },
        { filename: 'acmecolors.sty', content: STY_BYTES },
        { filename: 'refs.bib', content: BIB_BYTES },
      ],
    );
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(
      expect.arrayContaining(['acmecorp.cls', 'acmecolors.sty', 'refs.bib']),
    );
    expect(result.metadata.bundled_files).toEqual(['acmecorp.cls', 'acmecolors.sty', 'refs.bib']);
    expect((await zip.file('refs.bib')!.async('nodebuffer')).equals(BIB_BYTES)).toBe(true);
  });

  it('reports the archive size, not the .tex size', async () => {
    const { result, bytes } = await renderArtifact(
      'Body.', [{ filename: 'acmecorp.cls', content: CLS_BYTES }],
    );
    expect(result.file_size_bytes).toBe(bytes.length);
  });
});

describe('latex-source: a hostile asset name cannot shape the archive', () => {
  it('reduces a traversal path to its basename instead of writing outside the archive', async () => {
    const { bytes } = await renderArtifact(
      'Body.',
      [
        { filename: '../../../etc/acmecorp.cls', content: CLS_BYTES },
        { filename: '..\\..\\windows\\evil.sty', content: STY_BYTES },
      ],
    );
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    expect(names).toContain('acmecorp.cls');
    expect(names).toContain('evil.sty');
    for (const n of names) {
      expect(n).not.toContain('..');
      expect(n).not.toContain('/');
      expect(n).not.toContain('\\');
    }
  });

  it('drops an asset whose real extension is not a LaTeX one', async () => {
    const { result, bytes } = await renderArtifact(
      'Body.',
      [
        { filename: 'acmecorp.cls', content: CLS_BYTES },
        { filename: 'payload.exe', content: Buffer.from('MZ', 'utf-8') },
        { filename: 'acmecorp.cls.exe', content: Buffer.from('MZ', 'utf-8') },
      ],
    );
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort().filter(n => !n.endsWith('.tex'))).toEqual(['acmecorp.cls']);
    expect(result.metadata.bundled_files).toEqual(['acmecorp.cls']);
  });

  it('falls back to a plain .tex when NOTHING survives the filter', async () => {
    // Not an empty archive: a zip holding only the .tex would be a worse
    // deliverable than the .tex itself.
    const { result } = await renderArtifact(
      'Body.', [{ filename: 'payload.exe', content: Buffer.from('MZ', 'utf-8') }],
    );
    expect(result.file_type).toBe('tex');
    expect(result.metadata.bundled).toBe(false);
  });

  it('keeps the first of two assets claiming the same name', async () => {
    const { bytes } = await renderArtifact(
      'Body.',
      [
        { filename: 'acmecorp.cls', content: CLS_BYTES },
        { filename: 'acmecorp.cls', content: STY_BYTES },
      ],
    );
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).filter(n => n === 'acmecorp.cls')).toHaveLength(1);
    expect((await zip.file('acmecorp.cls')!.async('nodebuffer')).equals(CLS_BYTES)).toBe(true);
  });

  it('ignores an asset whose content is not a Buffer', async () => {
    const bogus = [{ filename: 'acmecorp.cls', content: 'not a buffer' }] as unknown as LatexAssetFile[];
    const { result } = await renderArtifact('Body.', bogus);
    expect(result.file_type).toBe('tex');
  });
});
