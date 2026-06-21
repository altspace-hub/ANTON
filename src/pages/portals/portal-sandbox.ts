/**
 * portal-sandbox.ts — wraps publisher HTML for safe rendering inside an
 * `<iframe sandbox="" srcdoc={…}>`, using the Comm App's mobile-tuned,
 * light-themed CSS reset.
 *
 * Home note
 * ─────────
 * This is the DESKTOP app's copy of the Comm App's portal reset. The desktop
 * Portal *builder* (PortalBuilderPage) has a "mobile preview" pane that must
 * render a publisher's page exactly the way the Comm App's PortalPageScreen
 * will — so the CSS below is kept byte-for-byte in sync with the Comm App's
 * `src/comm/lib/portal-sandbox.ts` (per the per-app-copy convention; the Comm
 * App ships out-of-repo via the App Store and keeps its own copy). The desktop
 * *visitor* surface uses a separate dark-themed wrapper inlined in
 * `PortalVisitorPage.tsx`.
 *
 * Threat model
 * ────────────
 * Portal HTML is authored by an untrusted publisher we have no agreement
 * with — at minimum we must assume it might try to:
 *   - read localStorage (steal session tokens)
 *   - run script (keylogger, redirect, fingerprint)
 *   - submit forms (data exfil)
 *   - navigate the top frame away
 *   - load same-origin resources (CSRF against the app's own API)
 *
 * We address all five at once by rendering the wrapped HTML inside an
 * `<iframe sandbox="" srcdoc={...}>`. `sandbox=""` with NO allow-* tokens
 * is the maximally-restrictive setting: scripts are blocked, forms are
 * blocked, top-navigation is blocked, popups are blocked, and the iframe
 * gets a unique opaque origin so it cannot reach the app's storage or its
 * API by origin.
 *
 * Multi-page navigation is therefore *not* in-iframe — the parent React keeps
 * a page-list rail outside the iframe; tapping a page re-renders the iframe
 * with new srcdoc. In-iframe `<a>` links will appear styled but not navigate;
 * that's an accepted v1 limitation.
 *
 * No script tags, no `<base>`, no `<meta http-equiv>` are emitted. The
 * publisher's HTML is inserted verbatim into <body>; we don't sanitize
 * it because the sandbox is doing that job at the browser level.
 */

export interface WrapOptions {
  /** Title shown in the iframe's <title> (also surfaces to a11y trees). */
  title?: string | null;
  /** Override the inline stylesheet. Most callers should leave this. */
  baseCss?: string;
}

const TITLE_DEFAULT = 'Portal page';

/** Default mobile-tuned CSS. Kept narrow on purpose — we want every
 *  portal to feel like the Comm App, not let publishers theme the chrome. */
const DEFAULT_BASE_CSS = `
  :root { color-scheme: light; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    background: #F5F3EF;
    color: #1A1B2E;
    font-family: 'Inter', 'Helvetica Neue', system-ui, -apple-system, sans-serif;
    -webkit-text-size-adjust: 100%;
    -webkit-tap-highlight-color: transparent;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  body {
    padding: 1rem 1.125rem 2rem;
    font-size: 17px;
    line-height: 1.55;
    max-width: 100%;
    overflow-x: hidden;
    word-wrap: break-word;
  }
  h1, h2, h3, h4 { color: #1A1B2E; line-height: 1.25; margin: 1.25rem 0 0.5rem; font-weight: 600; }
  h1 { font-size: 1.55rem; margin-top: 0.25rem; padding-bottom: 0.4rem; border-bottom: 1px solid #EAE7E0; }
  h2 { font-size: 1.3rem; }
  h3 { font-size: 1.1rem; }
  h4 { font-size: 1rem; }
  p { margin: 0.6rem 0; color: #3B3D50; }
  a { color: #0D7D6C; text-decoration: underline; text-decoration-thickness: 1.5px; text-underline-offset: 2px; }
  a:active { color: #06655A; }
  strong, b { color: #1A1B2E; font-weight: 600; }
  em, i { color: #3B3D50; }
  ul, ol { margin: 0.6rem 0; padding-left: 1.25rem; color: #3B3D50; }
  li { margin: 0.3rem 0; }
  li::marker { color: #686A7C; }
  blockquote {
    margin: 0.8rem 0;
    padding: 0.25rem 0 0.25rem 0.9rem;
    border-left: 3px solid #0D7D6C;
    color: #4F5267;
  }
  hr { border: 0; border-top: 1px solid #EAE7E0; margin: 1.25rem 0; }
  img, picture, video {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 0.5rem;
    margin: 0.5rem 0;
  }
  code {
    background: #EFECE5;
    color: #1A1B2E;
    padding: 0.1rem 0.35rem;
    border-radius: 0.3rem;
    font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.9em;
    word-break: break-word;
  }
  pre {
    background: #EFECE5;
    color: #1A1B2E;
    padding: 0.75rem 0.9rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 0.75rem 0;
    font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.9em;
    line-height: 1.45;
  }
  pre code { background: transparent; padding: 0; border-radius: 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0;
    font-size: 0.95em;
    display: block;
    overflow-x: auto;
  }
  th, td {
    padding: 0.5rem 0.65rem;
    text-align: left;
    border-bottom: 1px solid #EAE7E0;
  }
  th { background: #FAFAF8; color: #1A1B2E; font-weight: 600; }
  button, input, select, textarea { font: inherit; }
  /* Form controls are blocked by sandbox="" anyway, but keep them visually
     consistent for the rare case where a portal renders a form preview. */
  input, select, textarea {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid #DDD9D2;
    border-radius: 0.5rem;
    background: #FFFFFF;
    color: #1A1B2E;
  }
  /* Very long single-word strings (URLs, hashes) shouldn't blow out the
     viewport on a narrow phone screen. */
  p, li, td, th, h1, h2, h3, h4 { overflow-wrap: anywhere; }
`.trim();

/** Escape a string for safe use inside an HTML <title> element. */
function escapeTitle(s: string): string {
  return s.replace(/[<>"&]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' })[c] ?? c,
  );
}

/**
 * Wrap publisher-authored HTML for safe rendering inside an
 * `<iframe sandbox="" srcdoc={…}>`. Returns a full HTML document.
 *
 * Do NOT pre-sanitize the body — the iframe sandbox is the guarantee.
 * Sanitizing here would only give a false sense of security while
 * potentially mangling legitimate content.
 */
export function wrapForSandbox(html: string, opts: WrapOptions = {}): string {
  const title = escapeTitle(opts.title ?? TITLE_DEFAULT);
  const css = opts.baseCss ?? DEFAULT_BASE_CSS;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<style>${css}</style>
</head>
<body>${html}</body>
</html>`;
}
