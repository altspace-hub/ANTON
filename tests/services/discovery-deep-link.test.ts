/**
 * discovery-deep-link.test.ts — a Discovery suggestion has to be openable.
 *
 * Discovery's whole promise is ending up with things you can actually try. The module
 * cards were static divs: the user spent twenty minutes describing their work, got a list
 * of module NAMES, and then had to go and find each one by hand. That is where most
 * people stop, and it made the preceding conversation feel like it had led nowhere.
 *
 * Three things had to be true for a link to work, and none of them were:
 *
 *   1. the id has to exist       — fixed by grounding + validation (#44);
 *   2. the id has to REACH the UI — the frontend type did not even declare moduleId;
 *   3. the target has to accept a prefill — ModulePage did, but double-decoded it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const DISCOVER = read('src/pages/DiscoverPage.tsx');
const MODULE_PAGE = read('src/pages/ModulePage.tsx');
const ENGINE = read('server/services/discovery-engine.ts');

describe('the id reaches the UI', () => {
  it('the frontend type declares moduleId', () => {
    // It did not. The backend returned a validated id and the UI type dropped it on the
    // floor, so no link could have been built even in principle.
    const type = DISCOVER.slice(DISCOVER.indexOf('moduleMatches: Array<'));
    expect(type.slice(0, 300)).toContain('moduleId: string');
  });

  it('the frontend type declares the prefill', () => {
    const type = DISCOVER.slice(DISCOVER.indexOf('moduleMatches: Array<'));
    expect(type.slice(0, 300)).toContain('suggestedPrompt');
  });
});

describe('the card is a link', () => {
  it('routes to /module/:id', () => {
    expect(DISCOVER).toMatch(/`\/module\/\$\{encodeURIComponent\(m\.moduleId\)\}/);
  });

  it('encodes the id and the prefill', () => {
    // A module id is safe today, but the prefill is arbitrary user prose.
    expect(DISCOVER).toMatch(/encodeURIComponent\(m\.moduleId\)/);
    expect(DISCOVER).toMatch(/encodeURIComponent\(m\.suggestedPrompt\)/);
  });

  it('falls back to a plain card when there is no id', () => {
    // Validation guarantees a PRESENT id is real. It does not guarantee presence — an
    // older stored output has none — and a link that 404s is worse than a static card.
    expect(DISCOVER).toMatch(/const href = m\.moduleId/);
    expect(DISCOVER).toMatch(/return href \? \(/);
  });

  it('uses a router Link, not a raw anchor', () => {
    // <a href> would full-page reload and drop React state.
    expect(DISCOVER).toMatch(/import \{ Link \} from 'react-router-dom'/);
  });
});

describe('the prefill is the user\'s own words', () => {
  it('is composed from recorded pain points, not model prose', () => {
    // Asking the model for one more field would add prompt surface and a new thing to
    // hallucinate. The pain points are what the user actually said.
    const block = ENGINE.slice(ENGINE.indexOf('const painContext'));
    expect(block.slice(0, 400)).toMatch(/session\.state\.painPoints/);
  });

  it('is capped, because it travels in a query string', () => {
    expect(ENGINE).toMatch(/\.slice\(0, 1200\)/);
  });

  it('is only attached when there is context to attach', () => {
    expect(ENGINE).toMatch(/if \(painContext\) \{/);
  });
});

describe('the target accepts it without breaking', () => {
  it('does NOT decode a value URLSearchParams already decoded', () => {
    // The bug this would otherwise have shipped: get() returns decoded text, so a
    // second decodeURIComponent runs over text that is no longer encoded. Any literal
    // '%' then throws URIError and takes the page down — and "we lose 30% of the day to
    // formatting" is an entirely ordinary thing for a user to have said.
    const block = MODULE_PAGE.slice(
      MODULE_PAGE.indexOf("ITEM 11: Prefill from URL param"),
      MODULE_PAGE.indexOf('Prefill from Pathfinder'),
    );
    expect(block).toMatch(/setUserInput\(prefill\)/);
    expect(block).not.toMatch(/setUserInput\(decodeURIComponent/);
  });

  it('round-trips text containing a percent sign', () => {
    // The actual failing case, exercised rather than asserted about.
    const text = 'we lose 30% of the day to formatting & re-keying';
    const url = new URL(`http://x/module/m?prefill=${encodeURIComponent(text)}`);
    expect(url.searchParams.get('prefill')).toBe(text);
  });

  it('round-trips newlines and markdown, which the prefill contains', () => {
    const text = 'Context from my ANTON discovery session:\n\n- 100% manual\n- #2 priority';
    const url = new URL(`http://x/module/m?prefill=${encodeURIComponent(text)}`);
    expect(url.searchParams.get('prefill')).toBe(text);
  });
});
