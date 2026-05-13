/**
 * portal-sandbox.test.ts — coverage for the mobile sandbox wrapper that
 * the Comm App uses to render publisher HTML safely.
 *
 * Three concerns we're locking down:
 *   (1) The wrapped string really is a parseable HTML document with the
 *       publisher's body content inlined verbatim. (Inline verbatim is
 *       deliberate — the iframe sandbox is the protection, not us.)
 *   (2) The <title> is HTML-escaped so a publisher can't break out and
 *       inject markup in the head.
 *   (3) The mobile-specific CSS rules are present — these are the
 *       guarantee that every portal looks consistent in the Comm App.
 */
import { describe, it, expect } from 'vitest';
import { wrapForSandbox } from '../lib/portal-sandbox';

describe('wrapForSandbox', () => {
  it('produces a parseable HTML document', () => {
    const out = wrapForSandbox('<h1>Hello</h1>', { title: 'Hello world' });
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out.includes('<html lang="en">')).toBe(true);
    expect(out.includes('<head>')).toBe(true);
    expect(out.includes('<body>')).toBe(true);
    expect(out.endsWith('</html>')).toBe(true);
  });

  it('inlines the body content verbatim', () => {
    const html = '<h1>Title</h1><p>Para with <em>emphasis</em> &amp; entity.</p>';
    const out = wrapForSandbox(html);
    expect(out.includes(html)).toBe(true);
  });

  it('does not sanitize or strip user HTML', () => {
    // We deliberately leave arbitrary tags in — sandbox="" is what protects us.
    // Even something that LOOKS scary like a <script> tag passes through, because
    // the iframe sandbox blocks scripts at the browser level.
    const html = '<script>alert(1)</script><div style="color:red">x</div>';
    const out = wrapForSandbox(html);
    expect(out.includes('<script>alert(1)</script>')).toBe(true);
    expect(out.includes('style="color:red"')).toBe(true);
  });

  it('html-escapes the <title>', () => {
    const out = wrapForSandbox('<p>x</p>', { title: 'Evil </title><script>bad</script>' });
    // Raw injection should not survive into the head — the <,>, " in the title
    // become entities and the markup becomes inert text.
    expect(out.includes('Evil &lt;/title&gt;&lt;script&gt;bad&lt;/script&gt;')).toBe(true);
    expect(out.includes('</title><script>bad</script>')).toBe(false);
  });

  it('escapes ampersands in the title', () => {
    const out = wrapForSandbox('', { title: 'Tom & Jerry' });
    expect(out.includes('<title>Tom &amp; Jerry</title>')).toBe(true);
  });

  it('escapes double quotes in the title', () => {
    const out = wrapForSandbox('', { title: 'She said "hi"' });
    expect(out.includes('<title>She said &quot;hi&quot;</title>')).toBe(true);
  });

  it('falls back to "Portal page" when title is null', () => {
    const out = wrapForSandbox('<p>x</p>', { title: null });
    expect(out.includes('<title>Portal page</title>')).toBe(true);
  });

  it('falls back to "Portal page" when title is omitted', () => {
    const out = wrapForSandbox('<p>x</p>');
    expect(out.includes('<title>Portal page</title>')).toBe(true);
  });

  it('emits the mobile viewport meta tag', () => {
    const out = wrapForSandbox('');
    expect(out.includes('name="viewport"')).toBe(true);
    expect(out.includes('width=device-width')).toBe(true);
  });

  it('includes the Comm App light-theme background color', () => {
    const out = wrapForSandbox('');
    // #F5F3EF == --color-bg in src/comm/app.css. Locked here so future edits
    // that drift away from the Comm App tokens fail the test.
    expect(out.includes('#F5F3EF')).toBe(true);
  });

  it('includes the Comm App accent (brand teal)', () => {
    const out = wrapForSandbox('');
    expect(out.includes('#0D7D6C')).toBe(true);
  });

  it('declares color-scheme: light', () => {
    const out = wrapForSandbox('');
    expect(out.includes('color-scheme: light')).toBe(true);
  });

  it('disables iOS text-size auto-adjust', () => {
    const out = wrapForSandbox('');
    expect(out.includes('-webkit-text-size-adjust')).toBe(true);
  });

  it('disables tap-highlight (Android default blue flash)', () => {
    const out = wrapForSandbox('');
    expect(out.includes('-webkit-tap-highlight-color: transparent')).toBe(true);
  });

  it('forces max-width:100% on images so wide images do not overflow', () => {
    const out = wrapForSandbox('');
    expect(out.match(/img[^{]*\{[^}]*max-width: 100%/s)).not.toBeNull();
  });

  it('makes tables scrollable horizontally', () => {
    const out = wrapForSandbox('');
    // table { ...; overflow-x: auto; ... } — narrow phones can't fit wide tables
    expect(out.match(/table[^{]*\{[^}]*overflow-x: auto/s)).not.toBeNull();
  });

  it('breaks long single-word strings (URLs, hashes) on narrow screens', () => {
    const out = wrapForSandbox('');
    expect(out.includes('overflow-wrap: anywhere')).toBe(true);
  });

  it('honours a caller-supplied baseCss override', () => {
    const customCss = 'body { background: lime; }';
    const out = wrapForSandbox('<p>x</p>', { baseCss: customCss });
    expect(out.includes(customCss)).toBe(true);
    // Default CSS markers should not appear when overridden
    expect(out.includes('#F5F3EF')).toBe(false);
  });

  it('does not emit any <script> tags of its own', () => {
    // We rely on sandbox="" to block scripts in the body; but the WRAPPER must
    // also not include a script tag in the head, since that would be the
    // attack-surface entry point.
    const out = wrapForSandbox('<p>nothing</p>');
    const wrapperOnly = out.replace('<p>nothing</p>', '');
    expect(wrapperOnly.toLowerCase().includes('<script')).toBe(false);
  });

  it('handles an empty html body', () => {
    const out = wrapForSandbox('');
    expect(out.includes('<body></body>')).toBe(true);
  });
});
