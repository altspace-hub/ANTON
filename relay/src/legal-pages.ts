/**
 * legal-pages.ts — static Terms of Service + Privacy Policy pages.
 *
 * Served by the relay's HTTP handler (same pattern as admin-ui.ts) so the
 * operator can point a dedicated hostname (terms.futurechain.eu) at the
 * existing Bahnhof box with nothing more than a DNS record + Caddy site.
 *
 * Routes (host-agnostic, GET only):
 *   /terms, /legal/terms      → Terms of Service
 *   /privacy, /legal/privacy  → Privacy Policy
 *   /legal, /legal/           → index linking both
 *   /                         → index, ONLY when the Host header starts with
 *                               "terms." (so the relay root stays a 404)
 *
 * ⚠️ CONTENT STATUS: DRAFT — pending counsel review (GO_LIVE_CHECKLIST §5).
 * Every [OPERATOR: …] placeholder must be filled and the DRAFT banner
 * removed before launch. When the final copy lands, also bump
 * DISCLOSURE_VERSION in src/pay/services/disclosure.ts so Pay users
 * re-accept against the final text.
 */

import type http from 'node:http';

const LAST_UPDATED = '10 June 2026';

// Shared chrome: self-contained, no JS, palette matches admin-ui.ts.
function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — FutureChain</title>
<style>
  :root {
    --bg: #F5F3EF; --surface: #FFFFFF; --border: #DDD9D2;
    --text: #1A1B2E; --text-body: #3B3D50; --text-muted: #4F5267;
    --accent: #3070C7; --accent-dark: #235397;
    --gold: #C8842B; --gold-dim: #F7ECD9;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter', -apple-system, system-ui, sans-serif;
         background: var(--bg); color: var(--text); line-height: 1.55; }
  header { padding: 18px 24px; background: var(--surface);
           border-bottom: 1px solid var(--border); }
  header a { color: var(--accent); text-decoration: none; font-weight: 600; }
  main { max-width: 760px; margin: 0 auto; padding: 28px 20px 64px; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  h2 { font-size: 1.12rem; margin: 28px 0 8px; }
  p, li { color: var(--text-body); font-size: 0.95rem; }
  .meta { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px; }
  .draft { background: var(--gold-dim); border: 1px solid var(--gold);
           border-radius: 8px; padding: 10px 14px; margin: 18px 0;
           color: #6B4A12; font-size: 0.9rem; }
  .card { background: var(--surface); border: 1px solid var(--border);
          border-radius: 12px; padding: 22px 26px; margin-top: 16px; }
  footer { max-width: 760px; margin: 0 auto; padding: 0 20px 40px;
           color: var(--text-muted); font-size: 0.82rem; }
  footer a { color: var(--accent); }
</style>
</head>
<body>
<header><a href="/legal">FutureChain — Legal</a></header>
<main>
<div class="draft"><strong>DRAFT — pending legal counsel review.</strong>
This document is a working draft and is not yet legally effective.
[OPERATOR: remove this banner once counsel approves the final copy.]</div>
${body}
</main>
<footer>
<p><a href="/terms">Terms of Service</a> · <a href="/privacy">Privacy Policy</a></p>
<p>FutureChain is self-custody software: your keys stay on your device and
nobody — including us — can recover them for you.</p>
</footer>
</body>
</html>`;
}

export const LEGAL_INDEX_HTML = page('Legal', `
<h1>FutureChain — Legal</h1>
<p class="meta">Last updated: ${LAST_UPDATED}</p>
<div class="card">
  <h2 style="margin-top:0"><a href="/terms" style="color:var(--accent);text-decoration:none">Terms of Service →</a></h2>
  <p>The agreement that applies when you use the FutureChain apps
  (ANTON Pay, ANTON Communication, ANTON Business, ANTON Companion, ANTON Local)
  and the relay services we operate.</p>
</div>
<div class="card">
  <h2 style="margin-top:0"><a href="/privacy" style="color:var(--accent);text-decoration:none">Privacy Policy →</a></h2>
  <p>What little data our services handle, why local-first means your content
  stays on your device, and your rights under the GDPR.</p>
</div>
`);

export const TERMS_HTML = page('Terms of Service', `
<h1>Terms of Service</h1>
<p class="meta">Version 0.1 (draft) · Last updated: ${LAST_UPDATED}</p>

<h2>1. Who we are</h2>
<p>These terms are between you and [OPERATOR: legal entity name, org. number,
registered address] ("we", "us"), the publisher of the FutureChain
applications — ANTON Pay, ANTON Communication, ANTON Business, ANTON
Companion, and ANTON Local (together, the "Apps") — and the operator of the
FutureChain relay and RPC services (the "Services").</p>

<h2>2. What the Apps are — and are not</h2>
<p>The Apps are <strong>self-custody software</strong>. Cryptographic keys
for wallets and messaging identities are generated and stored on
<em>your</em> device. We never receive, hold, or transmit your private keys
or recovery phrases. We do not hold customer funds, execute orders on your
behalf, or act as an exchange, broker, or custodian.</p>

<h2>3. Self-custody risks — please read carefully</h2>
<ul>
  <li>If you lose your device <em>and</em> your recovery phrase, your wallet
  and its contents are <strong>permanently unrecoverable</strong>. Nobody,
  including us, can restore them.</li>
  <li>Blockchain transactions are <strong>irreversible</strong>. A payment
  sent to a wrong address cannot be undone by us or anyone else.</li>
  <li>The value of FTC may go up or down. Nothing in the Apps is financial,
  investment, tax, or legal advice.</li>
</ul>

<h2>4. The relay and network services</h2>
<p>We operate relay infrastructure that routes end-to-end-encrypted messages
and provides network access (RPC) for transaction submission. The Services
are provided on a best-effort basis; we may throttle, suspend, or
discontinue them for maintenance, security, or legal reasons.</p>

<h2>5. Acceptable use</h2>
<p>You may not use the Apps or Services to break the law, to harm or harass
others, to attempt to disrupt or overload our infrastructure, or to
circumvent the protections built into the software (including parental
controls and rate limits).</p>

<h2>6. Public blockchain data</h2>
<p>Transaction records on the FutureChain network are public and permanent.
Payment details you attach to a transaction are encrypted so that only the
recipient can read them, but the existence, time, and amounts of
transactions are publicly visible forever. Think before you transact.</p>

<h2>7. No warranty; limitation of liability</h2>
<p>The Apps and Services are provided <strong>"as is"</strong> and "as
available", without warranties of any kind, to the maximum extent permitted
by law. To the same extent, we are not liable for indirect or consequential
loss, loss of funds caused by lost keys or phrases, mistyped addresses,
device compromise, or network unavailability. Nothing in these terms limits
liability that cannot be limited under applicable law, including your
statutory rights as a consumer.</p>

<h2>8. Changes</h2>
<p>We may update these terms. Material changes will be announced in the
Apps and on this page, with the "last updated" date above. Continued use
after a change takes effect constitutes acceptance.</p>

<h2>9. Governing law</h2>
<p>These terms are governed by the laws of Sweden. Disputes are subject to
the jurisdiction of the Swedish courts, without prejudice to mandatory
consumer-protection rules of your country of residence.</p>

<h2>10. Contact</h2>
<p>[OPERATOR: contact email for legal/support, e.g. legal@futurechain.eu]</p>
`);

export const PRIVACY_HTML = page('Privacy Policy', `
<h1>Privacy Policy</h1>
<p class="meta">Version 0.1 (draft) · Last updated: ${LAST_UPDATED}</p>

<h2>1. Controller</h2>
<p>[OPERATOR: legal entity name, org. number, registered address] is the
data controller for the processing described here. Contact:
[OPERATOR: privacy/DSR email]. [OPERATOR: add DPO name + contact if/when
appointed.]</p>

<h2>2. The short version</h2>
<p>The FutureChain apps are <strong>local-first</strong>. Your messages,
contacts, payment history, and documents are stored on your own device.
Messages are end-to-end encrypted — our relay routes sealed envelopes that
we cannot read. We run no analytics, no advertising, and no tracking.</p>

<h2>3. What we process, and why</h2>
<ul>
  <li><strong>Relay routing metadata</strong> — pseudonymous routing
  identifiers (cryptographic hashes, not names) and connection IP addresses,
  processed transiently to route messages and enforce rate limits / abuse
  protection. Legal basis: legitimate interest in operating and securing
  the service (Art. 6(1)(f) GDPR).</li>
  <li><strong>Offline mailbox</strong> — encrypted message envelopes held
  for delivery when the recipient is offline, automatically deleted after
  <strong>7 days</strong>. We cannot decrypt their contents.</li>
  <li><strong>Push notification tokens</strong> — only if you enable push:
  a device token used to send content-free wake-up signals via Google
  Firebase Cloud Messaging. The notification payload never contains message
  content. Legal basis: consent (Art. 6(1)(a)). [OPERATOR/COUNSEL: confirm
  US-transfer mechanism (SCCs / DPF) before enabling push in production.]</li>
  <li><strong>Things you choose to publish</strong> — portal listings and
  merchant terminal certificates you explicitly submit to our public
  registry. Legal basis: contract (Art. 6(1)(b)).</li>
  <li><strong>Operational logs</strong> — security/audit events without
  message content, retained for [OPERATOR: retention period, e.g. 30 days].</li>
</ul>

<h2>4. What we do <em>not</em> process</h2>
<p>We cannot read your messages (end-to-end encryption), we do not upload
your contacts, we build no advertising or behavioural profiles, and we use
no third-party analytics.</p>

<h2>5. Blockchain data</h2>
<p>Transactions on the FutureChain network are public and
<strong>permanent</strong>. Wallet addresses are pseudonymous. Payment
details (remittance information) are encrypted so only the recipient can
read them. Because a blockchain cannot be edited, on-chain data cannot be
erased — this is a technical limitation recognised by data-protection
guidance; do not put personal data in payment fields you would later want
removed.</p>

<h2>6. Recipients and processors</h2>
<ul>
  <li><strong>Bahnhof AB (Sweden)</strong> — hosting of our relay
  infrastructure. [OPERATOR: Article 28 DPA — in progress.]</li>
  <li><strong>Google (Firebase Cloud Messaging)</strong> — only if push is
  enabled; receives device tokens and content-free wake payloads.</li>
</ul>
<p>We do not sell or share personal data for marketing.</p>

<h2>7. Your rights</h2>
<p>Under the GDPR you can request access, rectification, erasure,
restriction, portability, and object to processing based on legitimate
interest. Most of your data lives only on your device, where you can
delete it directly in the app. For relay-side requests, contact
[OPERATOR: DSR email] — we respond within one month. You may complain to
the Swedish Authority for Privacy Protection (IMY) or your local
supervisory authority.</p>

<h2>8. Changes</h2>
<p>We will announce material changes to this policy in the apps and on this
page, with the "last updated" date above.</p>
`);

/**
 * Handle a legal-page request. Returns true when the request was handled
 * (response ended), false when the caller should continue routing.
 */
export function handleLegalRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
): boolean {
  if (req.method !== 'GET') return false;

  const path = (url.split('?')[0] ?? url).replace(/\/+$/, '') || '/';
  const host = String(req.headers.host ?? '').toLowerCase();

  let html: string | null = null;
  if (path === '/terms' || path === '/legal/terms') html = TERMS_HTML;
  else if (path === '/privacy' || path === '/legal/privacy') html = PRIVACY_HTML;
  else if (path === '/legal') html = LEGAL_INDEX_HTML;
  // Root serves the index ONLY on the dedicated legal hostname, so the
  // relay's own root stays a 404 (don't leak internals).
  else if (path === '/' && host.startsWith('terms.')) html = LEGAL_INDEX_HTML;

  if (html === null) return false;

  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=300',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
  });
  res.end(html);
  return true;
}
