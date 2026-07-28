/**
 * standalone-theme.ts — the ONE place the collaboration standalone's operator
 * GUI is styled. Three surfaces share it: the read-only dashboard
 * (dashboard.ts), the agreement approval card (web-confirm.ts) and the action
 * layer's message page (dashboard-actions.ts). Before this module each of the
 * three carried its own private CSS and they had visibly drifted apart.
 *
 * WHY EVERYTHING IS INLINE (do not "improve" this into a stylesheet):
 * every HTML response from these three files ships
 *   Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline';
 *                            form-action 'self'; frame-ancestors 'none'; base-uri 'none'
 * `style-src` allows ONLY 'unsafe-inline' — not 'self', not a host — and
 * img-src / font-src / connect-src all fall back to `default-src 'none'`. So a
 * <link rel=stylesheet>, a webfont, an <img> logo (data: URI included) and any
 * fetch are all blocked by the browser. What IS legal is a <style> element, a
 * style="" attribute, and inline <svg> markup — markup is not a fetch. That is
 * exactly the budget this module spends. The CSP is the security posture of a
 * page that approves the signing of two-party agreements; it is not negotiable
 * for cosmetics.
 *
 * WHERE THE COLOURS COME FROM (pin this when you touch them):
 * the token values below are COPIED — not imported, they cannot be imported
 * across a process/origin boundary — from the main ANTON web app's
 * `src/index.css` as of v0.7.5:
 *   • light values  → the `html.light` block ("Web UX v2 — light theme overrides")
 *   • dark values   → the `@theme` defaults ("Web UX v2 — Evolution-direction tokens")
 * The brand deep teal #0D7D6C is the value CLAUDE.md declares LOCKED across
 * themes (logo SVG, sidebar logo box, login logo), so it is hard-coded in the
 * mark below rather than tokenised. If src/index.css moves, this file has
 * drifted — re-copy those two blocks.
 */

/** HTML-escape every dynamic value. Shared so the three surfaces cannot drift
 *  into three subtly different escapers. */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// ── Status pills ──────────────────────────────────────────────────────────────

/** The five visual tones a state can take. `muted` is the fallback so an
 *  unrecognised state degrades to the old grey pill rather than mis-signalling. */
export type PillTone = 'gold' | 'blue' | 'green' | 'red' | 'muted';

/**
 * state → tone, across ALL six state vocabularies the dashboard renders
 * (ApprovalState, NegotiationState, AgreementStatus, TaskStatus,
 * FulfilmentStatus, EscrowStatus). Until now every one of them rendered the
 * same grey pill, so "settled" and "declined" looked identical to an operator
 * scanning the page.
 *
 * The tones encode what the operator has to DO, not merely what happened:
 *   gold  — waiting on a human (yours or theirs). The only tone that means "act".
 *   blue  — in flight; a machine or a counterparty is working on it.
 *   green — resolved well; money/goods landed where they were supposed to.
 *   red   — resolved badly, or actively contested.
 *   muted — lapsed or inert. Nothing happened and nothing will.
 */
const PILL_TONES: Readonly<Record<string, PillTone>> = {
  // Waiting on a decision — the "needs a human" family.
  pending: 'gold',
  open: 'gold',
  draft: 'gold',
  proposed: 'gold',
  countered: 'gold',
  accept_unconfirmed: 'gold',
  awaiting: 'gold',
  requested: 'gold',
  release_pending: 'gold',
  refund_pending: 'gold',
  // In flight — approved/funded/shipped are commitments already made that are
  // still travelling, so they read as motion rather than as an outcome.
  running: 'blue',
  working: 'blue',
  approved: 'blue',
  funded: 'blue',
  shipped: 'blue',
  // Good outcomes.
  agreed: 'green',
  accepted: 'green',
  settled: 'green',
  done: 'green',
  delivered: 'green',
  released: 'green',
  refunded: 'green',
  // Bad outcomes / contested.
  rejected: 'red',
  declined: 'red',
  cancelled: 'red',
  disputed: 'red',
  // Lapsed — a dead end, but nobody said no. Kept visually quiet on purpose so
  // a page full of expired rows does not scream at the operator.
  expired: 'muted',
  withdrawn: 'muted',
};

export function pillTone(state: string): PillTone {
  // Object.hasOwn, not a bare index: a state of 'constructor' or 'toString' resolves
  // through the prototype to a FUNCTION, which is truthy, so `?? 'muted'` would not
  // fire and that value would be interpolated straight into a class attribute. States
  // come from our own tables today, but a lookup that depends on that is a trap.
  const key = String(state ?? '').trim().toLowerCase();
  return Object.hasOwn(PILL_TONES, key) ? PILL_TONES[key] : 'muted';
}

/** A colour-coded status pill. The tone class is what makes states legible at a
 *  glance; the label is still the raw state so nothing is hidden from the operator. */
export function pill(state: string): string {
  return `<span class="pill pill-${pillTone(state)}">${esc(state)}</span>`;
}

// ── Brand mark (inline SVG — CSP-legal, unlike an <img>) ──────────────────────

/**
 * The ANTON mark, drawn as markup. Geometry matches `public/anton-logo.svg`
 * (32×32 tile, rx 8, single-letter mark); the fill is INVERTED — white tile,
 * teal glyph — because the locked #0D7D6C tile would vanish into the teal
 * header band it sits on. The "A" is a stroked path, not <text>, so it renders
 * identically without the Inter webfont (which font-src 'none' forbids fetching).
 */
export function antonMark(size = 26): string {
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 32 32" role="img" aria-label="ANTON">`
    + `<rect width="32" height="32" rx="8" fill="#FFFFFF"/>`
    // Apex (16,8.5) → feet (9,23.5)/(23,23.5); the crossbar at y=19.2 is sized to
    // meet the legs (which are at x≈11 / x≈21 at that height), not to float inside them.
    + `<path d="M9 23.5 16 8.5 23 23.5 M11.5 19.2 H20.5" fill="none" stroke="#0D7D6C"`
    + ` stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`
    + `</svg>`;
}

// ── Tokens ────────────────────────────────────────────────────────────────────

/**
 * The ANTON token block. Light values are the default (ANTON Local ships light
 * by default as of v0.7.5); the dark block is a `prefers-color-scheme` override
 * rather than a class toggle because these pages are JS-free — there is no
 * theme switcher to set `html.dark`, so the OS is the only signal available.
 *
 * The whole family is declared, not only the tokens used below — the point is
 * that a future rule can reach for `--anton-accent-dim` and get the SAME value
 * ANTON Local uses, instead of inventing a near-miss hex.
 */
export const ANTON_TOKENS = `
  /* Light — copied from src/index.css html.light (Web UX v2 overrides). */
  :root {
    color-scheme: light dark;
    --anton-bg: #F5F3EF;            /* warm linen page */
    --anton-bg-deep: #EFECE5;
    --anton-surface: #FFFFFF;
    --anton-surface-alt: #FAFAF8;
    --anton-surface-muted: #EFECE5;
    --anton-text: #1A1B2E;          /* headings */
    --anton-text-body: #3B3D50;     /* body */
    --anton-text-muted: #636577;    /* labels, secondary */
    --anton-text-faint: #878999;    /* captions, empty states */
    --anton-border-soft: #EAE7E0;
    --anton-border-strong: #C9C4BA;
    --anton-accent: #0D7D6C;        /* LOCKED brand deep teal */
    --anton-accent-hover: #06655A;
    --anton-accent-dim: #D5F0EB;
    --anton-accent-soft: #E5F5F2;
    --anton-accent-fg: #FFFFFF;
    --anton-gold: #C8842B;  --anton-gold-dim: #F7ECD9;  --anton-gold-soft: #FCF5E8;
    --anton-red: #C7361F;   --anton-red-dim: #F9E2DD;   --anton-red-soft: #FCEFEB;
    --anton-green: #1F8A5C; --anton-green-dim: #DCEEE4; --anton-green-soft: #EEF6F1;
    --anton-blue: #3070C7;  --anton-blue-dim: #DEE8F6;  --anton-blue-soft: #EFF4FA;
    /* The header band keeps a DEEP teal in both schemes: the dark-mode accent
       (#2DD4A8) is far too bright to run edge-to-edge across a page. */
    --anton-header-bg: #0D7D6C;
    --anton-header-fg: #FFFFFF;
    --anton-shadow: 0 1px 2px rgba(26,27,46,.04), 0 4px 12px rgba(26,27,46,.04);
    --anton-shadow-lg: 0 4px 8px rgba(26,27,46,.06), 0 12px 32px rgba(26,27,46,.08);
    --anton-r1: 6px; --anton-r2: 10px; --anton-r3: 14px;
    /* Inter is named first but never fetched (font-src 'none'); it is used only
       when the operator already has it installed, otherwise system-ui wins. */
    --anton-font: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --anton-mono: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  }
  /* Dark — copied from src/index.css @theme defaults (the dark values). */
  @media (prefers-color-scheme: dark) {
    :root {
      --anton-bg: #121316;
      --anton-bg-deep: #0B0C0E;
      --anton-surface: #1A1B1F;
      --anton-surface-alt: #1F2024;
      --anton-surface-muted: #17181B;
      --anton-text: #F5F5F4;
      --anton-text-body: #D0D0CC;
      --anton-text-muted: #93938E;
      --anton-text-faint: #5C5C58;
      --anton-border-soft: #1F2024;
      --anton-border-strong: #3A3B40;
      --anton-accent: #2DD4A8;      /* dark-mode accent per CLAUDE.md palette */
      --anton-accent-hover: #1BA882;
      --anton-accent-dim: #1A3A34;
      --anton-accent-soft: #122623;
      --anton-accent-fg: #06231D;   /* dark ink on the bright dark-mode teal */
      --anton-gold: #E0A050;  --anton-gold-dim: #3A2D13;  --anton-gold-soft: #27200C;
      --anton-red: #E5573F;   --anton-red-dim: #3A1915;   --anton-red-soft: #26110E;
      --anton-green: #3FBD85; --anton-green-dim: #13301F; --anton-green-soft: #0C1F14;
      --anton-blue: #5F9AE0;  --anton-blue-dim: #1A2A3E;  --anton-blue-soft: #0F1A29;
      --anton-header-bg: #0B4F45;
      --anton-header-fg: #E9F5F2;
      --anton-shadow: 0 1px 2px rgba(0,0,0,.4), 0 4px 12px rgba(0,0,0,.3);
      --anton-shadow-lg: 0 4px 8px rgba(0,0,0,.45), 0 12px 32px rgba(0,0,0,.5);
    }
  }
`;

/** Layout + component rules shared by every standalone page. Page-specific rules
 *  are appended by the caller via ShellOptions.css. */
const BASE_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; flex-direction: column;
    font: 14px/1.55 var(--anton-font);
    background: var(--anton-bg); color: var(--anton-text-body);
    -webkit-font-smoothing: antialiased;
  }
  /* Header band — the one piece of chrome every surface shares, so an operator
     can tell at a glance that a page belongs to ANTON and which mode it is in. */
  .topbar {
    display: flex; align-items: center; gap: 12px;
    background: var(--anton-header-bg); color: var(--anton-header-fg);
    padding: 11px 20px; box-shadow: var(--anton-shadow);
  }
  .topbar .mark { flex: none; display: block; }
  .topbar .brand { font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
  .topbar .brand .sub { font-weight: 400; opacity: .78; }
  .topbar .spacer { flex: 1; }
  .chip {
    font-size: 12px; font-weight: 600; letter-spacing: .01em;
    background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.3);
    color: var(--anton-header-fg); border-radius: 999px; padding: 3px 10px;
  }
  .topbar a {
    color: var(--anton-header-fg); font-size: 14px; font-weight: 600;
    text-decoration: none; border-bottom: 1px solid rgba(255,255,255,.45);
    padding-bottom: 1px; margin-left: 12px;
  }
  .page { flex: 1; padding: 22px 24px 34px; }
  body.centered .page { display: flex; align-items: center; justify-content: center; padding: 28px 20px; }

  /* Card / section — ANTON surface treatment: white card, soft warm border,
     the barely-there web shadow (NOT the heavy admin-panel drop shadow). */
  section, .card {
    background: var(--anton-surface); border: 1px solid var(--anton-border-soft);
    border-radius: var(--anton-r3); box-shadow: var(--anton-shadow);
  }
  section { padding: 16px 18px; margin: 0 0 16px; max-width: 1040px; }
  /* Section headings: normal case, semibold, full-strength text. The previous
     uppercase micro-caps read as a generic admin panel and were the single
     biggest tell that this was not an ANTON surface. */
  h2 { font-size: 15px; font-weight: 600; letter-spacing: -.005em; color: var(--anton-text); margin: 0 0 12px; }

  /* Status pills — one tone per state family (see PILL_TONES).
     14px, not the 11px a dense admin table invites: this pill IS the status of a
     financial agreement, and CLAUDE.md sets a 14px floor for ANTON's 35-65 audience.
     The two places that stay at 12px (.chip, .decide .sep) are supplementary labels
     whose meaning is already carried by adjacent full-size text. */
  .pill {
    display: inline-block; font-size: 14px; font-weight: 600; letter-spacing: .01em;
    border-radius: 999px; padding: 2px 9px; border: 1px solid transparent; white-space: nowrap;
  }
  .pill-gold  { background: var(--anton-gold-dim);  color: var(--anton-gold);  border-color: var(--anton-gold); }
  .pill-blue  { background: var(--anton-blue-dim);  color: var(--anton-blue);  border-color: var(--anton-blue); }
  .pill-green { background: var(--anton-green-dim); color: var(--anton-green); border-color: var(--anton-green); }
  .pill-red   { background: var(--anton-red-dim);   color: var(--anton-red);   border-color: var(--anton-red); }
  .pill-muted { background: var(--anton-surface-muted); color: var(--anton-text-muted); border-color: var(--anton-border-soft); }

  /* Banners — the -soft background / -dim border / full-strength text triple. */
  .banner {
    border-radius: var(--anton-r2); padding: 10px 12px; margin: 0 0 12px; font-size: 14px;
    background: var(--anton-surface-muted); border: 1px solid var(--anton-border-soft);
    color: var(--anton-text-body);
  }
  .banner b { color: var(--anton-text); }
  .banner-gold  { background: var(--anton-gold-soft);  border-color: var(--anton-gold-dim); }
  .banner-red   { background: var(--anton-red-soft);   border-color: var(--anton-red-dim); }
  .banner-green { background: var(--anton-green-soft); border-color: var(--anton-green-dim); }

  a { color: var(--anton-accent); }
  .muted { color: var(--anton-text-muted); }
  .faint { color: var(--anton-text-faint); }
  .mono { font-family: var(--anton-mono); }
`;

export interface ShellOptions {
  /** State chip in the header band, e.g. 'read-only', 'operator', 'approval'. */
  chip?: string;
  /**
   * Trailing header links. Deliberately <a> elements, never <button>:
   * dashboard.test.ts pins the read-only page as containing no
   * <form / <button / <input, and that assertion IS the read-only guarantee.
   * Any nav or refresh control added here must stay an anchor.
   */
  links?: ReadonlyArray<{ href: string; label: string }>;
  /** Page-specific CSS appended after the shared rules. */
  css?: string;
  /** Extra <body> classes — 'centered' vertically centres a single card. */
  bodyClass?: string;
  /** Secondary line next to the product name (e.g. 'dashboard'). */
  subtitle?: string;
}

/** The one shell. Every standalone HTML response goes through here. */
export function shell(title: string, inner: string, opts: ShellOptions = {}): string {
  const chip = opts.chip ? `<span class="chip">${esc(opts.chip)}</span>` : '';
  const links = (opts.links ?? []).map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join('');
  const sub = opts.subtitle ? ` <span class="sub">${esc(opts.subtitle)}</span>` : '';
  const bodyClass = opts.bodyClass ? ` class="${esc(opts.bodyClass)}"` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(title)}</title>`
    + `<style>${ANTON_TOKENS}${BASE_CSS}${opts.css ?? ''}</style></head>`
    + `<body${bodyClass}>`
    + `<header class="topbar">${antonMark()}`
    + `<span class="brand">ANTON Collaboration${sub}</span>`
    + `<span class="spacer"></span>${chip}${links}</header>`
    + `<main class="page">${inner}</main>`
    + `</body></html>`;
}
