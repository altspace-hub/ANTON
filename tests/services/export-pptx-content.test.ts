/**
 * export-pptx-content.test.ts — four defects that made "Export to PowerPoint" produce a
 * deliverable that was wrong and looked right.
 *
 *  1. parseSlides() only understands the `## SLIDE n:` dialect, which a handful of
 *     presentation modules emit. Every other module — i.e. almost all 550 — produces
 *     ordinary markdown, so parseSlides returned NOTHING and the generator fell through
 *     to a single slide holding `markdown.slice(0, 2000)`: unstyled, and silently
 *     truncated. This was the common path, not an edge case.
 *
 *  2. Each layout capped its body with `.slice(0, n)`. Content past the cap was dropped
 *     with nothing to say so — a 30-finding analysis exported as 7 findings that looked
 *     like the whole thing.
 *
 *  3. A bulleted line inside a `Notes:` block was matched by the bullet rule before the
 *     notes rule, so the speaker's private notes were printed on the slide.
 *
 *  4. Body text was passed to addText() raw, so `**Finding:**` rendered as literal
 *     asterisks on a client-facing slide.
 *
 * Slide XML is read back out of the generated .pptx, because the failure was in what
 * reached PowerPoint.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generatePptx, parseSlides, parsePlainMarkdown, paginate, mdRuns } from '../../server/services/export-pptx.js';

/** Text of every slide in the deck, in order. */
async function slideTexts(md: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(await generatePptx(md, { title: 'T' }));
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)/)![1]) - Number(b.match(/(\d+)/)![1]));
  return Promise.all(names.map(async (n) => {
    const xml = await zip.file(n)!.async('string');
    return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join(' ');
  }));
}

async function notesTexts(md: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(await generatePptx(md, { title: 'T' }));
  const names = Object.keys(zip.files).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
  return Promise.all(names.map(async (n) => {
    const xml = await zip.file(n)!.async('string');
    return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join(' ');
  }));
}

// Ordinary module output — no `## SLIDE n:` anywhere. This is what almost every
// ANTON module produces, and what used to collapse to one truncated slide.
const PLAIN = `# Sanctions Screening Review

## Key Findings

- Screening runs daily against the consolidated list
- Fuzzy matching threshold is set at 85%
- No documented escalation path for partial matches

## Control Ratings

| Control | Rating |
| --- | --- |
| List currency | Strong |
| Match tuning | Adequate |

## Recommendations

- Document the escalation path
- Re-tune the matching threshold
`;

describe('ordinary markdown produces a real deck', () => {
  it('produces one slide per section, not a single crowded slide', async () => {
    // Assert on the SLIDE COUNT, not on joined text. An earlier version of this test
    // checked that headings appeared anywhere in the deck, which passed even with the
    // fallback disabled — the headings were present as raw "## Text" body lines on one
    // slide, which is precisely the bug. Joined-text assertions cannot see structure.
    const texts = await slideTexts(PLAIN);
    expect(texts.length).toBeGreaterThanOrEqual(4);
  });

  it('uses each heading as a slide TITLE, with the hashes stripped', () => {
    const titles = parsePlainMarkdown(PLAIN).map((s) => s.title);
    expect(titles).toContain('Key Findings');
    expect(titles).toContain('Control Ratings');
    expect(titles).toContain('Recommendations');
    expect(titles.every((t) => !t.startsWith('#'))).toBe(true);
  });

  it('does not leave headings sitting in the body as raw markdown', () => {
    const bodies = parsePlainMarkdown(PLAIN).flatMap((s) => s.body ?? []);
    expect(bodies.some((b) => b.startsWith('#'))).toBe(false);
  });

  it('routes ordinary markdown away from the SLIDE-dialect parser entirely', () => {
    // parseSlides returns 1 slide for ANY non-empty text, so a "did it return
    // anything" gate silently never reaches the fallback. The gate must test for the
    // markers themselves.
    expect(parseSlides(PLAIN)).toHaveLength(1);
    expect(parseSlides(PLAIN)[0].title).toBe('# Sanctions Screening Review');
    expect(parsePlainMarkdown(PLAIN).length).toBeGreaterThan(1);
  });

  it('the GENERATED deck shows a clean title, not the raw "# Heading"', async () => {
    // Pins the wiring, not just the helper: with the old gate the fallback was never
    // reached and slide 1's title was the literal "# Sanctions Screening Review".
    const first = (await slideTexts(PLAIN))[0];
    expect(first).toContain('Sanctions Screening Review');
    expect(first).not.toContain('# Sanctions');
  });

  it('the GENERATED deck carries no raw "##" section markers on any slide', async () => {
    const all = (await slideTexts(PLAIN)).join(' ');
    expect(all).not.toContain('## Key Findings');
    expect(all).not.toContain('## Recommendations');
  });

  it('does not lose the last section', async () => {
    const all = (await slideTexts(PLAIN)).join(' ');
    expect(all).toContain('Re-tune the matching threshold');
  });

  it('renders the markdown table as a table slide, not as bullets', async () => {
    const slides = parsePlainMarkdown(PLAIN);
    const table = slides.find((s) => s.type === 'table');
    expect(table).toBeDefined();
    expect(table!.headers).toEqual(['Control', 'Rating']);
    expect(table!.rows).toHaveLength(2);
  });

  it('does not emit the table divider row as data', async () => {
    const table = parsePlainMarkdown(PLAIN).find((s) => s.type === 'table')!;
    expect(table.rows!.some((r) => r.join('').includes('---'))).toBe(false);
  });

  it('leaves the authored `## SLIDE n:` dialect alone', async () => {
    const authored = `## SLIDE 1: Opening
Type: title
Title: Board Update
Subtitle: Q3
`;
    expect(parseSlides(authored)).toHaveLength(1);
    expect(parseSlides(authored)[0].type).toBe('title');
  });

  it('does not interpret markdown inside a code fence as slide structure', async () => {
    const md = '# Intro\n\n```python\n# not a heading\n- not a bullet\n```\n';
    const slides = parsePlainMarkdown(md);
    expect(slides.some((s) => s.title === 'not a heading')).toBe(false);
  });
});

describe('overflow continues onto more slides instead of being dropped', () => {
  const many = Array.from({ length: 20 }, (_, i) => `Finding number ${i + 1}`);

  it('keeps every item across continuation slides', () => {
    const out = paginate([{ number: 1, title: 'Findings', type: 'content', body: many }]);
    const kept = out.flatMap((s) => s.body ?? []);
    expect(kept).toHaveLength(20);
    expect(kept).toContain('Finding number 20');
  });

  it('marks the continuations so the reader knows it is one section', () => {
    const out = paginate([{ number: 1, title: 'Findings', type: 'content', body: many }]);
    expect(out[0].title).toBe('Findings');
    expect(out[1].title).toBe('Findings (cont.)');
  });

  it('renumbers slides consecutively after pagination', () => {
    const out = paginate([{ number: 1, title: 'Findings', type: 'content', body: many }]);
    expect(out.map((s) => s.number)).toEqual(out.map((_, i) => i + 1));
  });

  it('does not repeat speaker notes on every continuation', () => {
    // Otherwise the presenter reads the same script three times.
    const out = paginate([{ number: 1, title: 'F', type: 'content', body: many, notes: 'Say this once' }]);
    expect(out[0].notes).toBe('Say this once');
    expect(out.slice(1).every((s) => s.notes === undefined)).toBe(true);
  });

  it('paginates long tables and repeats the header row', () => {
    const rows = Array.from({ length: 30 }, (_, i) => [`Row ${i + 1}`, 'Strong']);
    const out = paginate([{ number: 1, title: 'Controls', type: 'table', headers: ['Control', 'Rating'], rows }]);
    expect(out.length).toBeGreaterThan(1);
    expect(out.flatMap((s) => s.rows ?? [])).toHaveLength(30);
    expect(out.every((s) => s.headers?.[0] === 'Control')).toBe(true);
  });

  it('leaves a slide within capacity untouched', () => {
    const out = paginate([{ number: 1, title: 'Short', type: 'content', body: ['a', 'b'] }]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Short');
  });

  it('carries every item through to the real deck', async () => {
    const md = '# Findings\n\n' + many.map((m) => `- ${m}`).join('\n') + '\n';
    const all = (await slideTexts(md)).join(' ');
    expect(all).toContain('Finding number 1');
    expect(all).toContain('Finding number 20');
  });
});

describe('speaker notes stay off the slide', () => {
  const md = `## SLIDE 1: Findings
Type: content
Body:
- Visible bullet
Notes:
- Do not read this aloud
- Second private line
`;

  it('does not print a bulleted note on the slide', async () => {
    const slides = (await slideTexts(md)).join(' ');
    expect(slides).toContain('Visible bullet');
    expect(slides).not.toContain('Do not read this aloud');
  });

  it('puts it in the notes pane instead of discarding it', async () => {
    const notes = (await notesTexts(md)).join(' ');
    expect(notes).toContain('Do not read this aloud');
    expect(notes).toContain('Second private line');
  });

  it('strips the bullet marker from the note text', () => {
    const parsed = parseSlides(md)[0];
    expect(parsed.notes).not.toContain('- ');
  });

  it('keeps genuine body bullets in the body', () => {
    const parsed = parseSlides(md)[0];
    expect(parsed.body).toEqual(['Visible bullet']);
  });
});

describe('inline markdown becomes formatting, not literal asterisks', () => {
  it('splits bold into a run rather than printing **', () => {
    const runs = mdRuns('**Finding:** the control is weak');
    expect(Array.isArray(runs)).toBe(true);
    const arr = runs as Array<{ text: string; options?: Record<string, unknown> }>;
    expect(arr[0]).toEqual({ text: 'Finding:', options: { bold: true } });
    expect(arr.map((r) => r.text).join('')).not.toContain('**');
  });

  it('handles italics and code spans', () => {
    const arr = mdRuns('see *note* and `db.get()`') as Array<{ text: string; options?: Record<string, unknown> }>;
    expect(arr.some((r) => r.options?.italic)).toBe(true);
    expect(arr.some((r) => r.options?.fontFace === 'Consolas')).toBe(true);
  });

  it('does not parse markdown inside a code span', () => {
    const arr = mdRuns('`**literal**`') as Array<{ text: string }>;
    expect(arr[0].text).toBe('**literal**');
  });

  it('returns a plain string when there is nothing to format', () => {
    expect(mdRuns('just text')).toBe('just text');
  });

  it('no longer shows asterisks on a generated slide', async () => {
    const all = (await slideTexts('# Report\n\n- **Critical:** escalate now\n')).join(' ');
    expect(all).toContain('Critical:');
    expect(all).not.toContain('**Critical:**');
  });
});
