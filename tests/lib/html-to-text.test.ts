/**
 * html-to-text.test.ts — markup to plain text for the model (Online
 * References, uploaded .html files). CodeQL flagged the old chained replaces
 * in url-fetcher.ts and text-extractor.ts (2026-09-25): "&amp;lt;" decoded
 * twice into "<", a script split around another survived a single removal,
 * and "</script >" was not recognised as a closing tag.
 */
import { describe, it, expect } from 'vitest';
import { decodeEntities, removeScriptsAndStyles, stripTags, replaceUntilStable } from '../../server/lib/html-to-text';

describe('decodeEntities', () => {
  it('decodes once: an escaped entity stays an entity', () => {
    expect(decodeEntities('a &amp;lt; b')).toBe('a &lt; b');
    expect(decodeEntities('&lt;p&gt; &quot;x&quot; &apos;y&apos; &nbsp;')).toBe('<p> "x" \'y\'  ');
  });

  it('decodes numeric entities, decimal and hex, and leaves unknown or invalid ones', () => {
    expect(decodeEntities('&#8364; &#x20AC; &#X20ac;')).toBe('€ € €');
    expect(decodeEntities('&unknown; &#0; &#x110000;')).toBe('&unknown; &#0; &#x110000;');
  });
});

describe('removeScriptsAndStyles', () => {
  it('removes a script hidden around another, and a closing tag with spaces or attributes', () => {
    expect(removeScriptsAndStyles('a<scr<script>x</script>ipt>alert(1)</script>b')).toBe('ab');
    expect(removeScriptsAndStyles('a<script>x</script >b<style type="t">y</style foo>c')).toBe('abc');
    expect(removeScriptsAndStyles('a<SCRIPT src=x>y</SCRIPT\n>b')).toBe('ab');
  });

  it('negative control: text that only mentions a script tag is kept', () => {
    expect(removeScriptsAndStyles('use a script tag to load it')).toBe('use a script tag to load it');
  });
});

describe('stripTags', () => {
  it('turns every tag into a space, including one rebuilt by the removal', () => {
    expect(stripTags('<p>one</p><b>two</b>')).toBe(' one  two ');
    expect(stripTags('<<b>i>x')).not.toMatch(/<[^<>]*>/);
  });

  it('negative control: a lone comparison (a "<" with no ">") survives', () => {
    expect(stripTags('5 < 7, always')).toBe('5 < 7, always');
  });
});

describe('replaceUntilStable', () => {
  it('repeats until nothing changes', () => {
    expect(replaceUntilStable('aaaa', /aa/g, 'a')).toBe('a');
  });
});
