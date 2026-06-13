/**
 * e2e-portal-nolf.mjs — end-to-end NOLF fan-archive portal for proving the
 * full Comm-App portal loop (Discover → Resolve → page-list → render → invoke)
 * after the Celebrini origin-transport break (plan item #6, Area 5).
 *
 * "No One Lives Forever" (the game): Cate Archer, UNITY, the H.A.R.M. spy-fi
 * caper — a retro-FPS fan archive. A 3-page `community` portal with
 * inquire/contact/subscribe capabilities.
 *
 * Cloned from e2e-portal-sharks.mjs. Two deliberate differences vs the sharks
 * clone:
 *
 *   1. The descriptor's `portal.originEndpoint` comes from PUBLISHER_ORIGIN
 *      (default http://localhost:3001). On a phone wired with
 *      `adb reverse tcp:3001 tcp:3001`, the phone's localhost:3001 reaches
 *      THIS PC's ANTON Local — so the page-list / page / invoke hops the
 *      phone makes DIRECTLY against the origin actually resolve.
 *      (Celebrini had this same origin but no adb reverse → unreachable.)
 *      For go-live this same field carries a LAN IP (APP_GATEWAY_PUBLIC_URL,
 *      Option A) or a WAN tunnel URL (Option C) instead.
 *
 *   2. The sharks clone INSERTed portal_descriptor_cache WITHOUT
 *      origin_endpoint, so the server-side proxy column was never written.
 *      We write origin_endpoint here (from PROXY_ORIGIN) so the cache row is
 *      populated and the ANTON-Local-as-proxy branch in
 *      server/routes/portals.ts is wired against real data.
 *
 *      IMPORTANT — single-machine caveat: the proxy branch only fires for a
 *      portal we do NOT own locally (after the local-first guard added in
 *      portals.ts). Pointing origin_endpoint back at THIS instance would
 *      otherwise self-loop. For a genuine ANTON-Local-as-proxy test point
 *      PROXY_ORIGIN at a DISTINCT peer ANTON (a second machine / LAN box) and
 *      do NOT also seed the portal locally there. On a one-box setup leave
 *      PROXY_ORIGIN='' (default) so the local portal_pages read serves the
 *      pages — exactly the path the phone exercises over adb reverse.
 *
 * Usage:
 *   PUBLISHER_ORIGIN=http://localhost:3001 \
 *   PROXY_ORIGIN=http://192.168.1.134:3001 \
 *   RELAY_OPERATOR_PASSWORD=... \
 *   node scripts/e2e-portal-nolf.mjs [portal-name]
 */

import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { canonify } from '@truestamp/canonify';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Client } = pg;

function loadDotEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      // Strip an inline `# comment` and surrounding quotes from the value so a
      // line like `APP_GATEWAY_PUBLIC_URL=http://x:3001  # note` parses cleanly.
      let v = m[2].replace(/\s+#.*$/, '').trim().replace(/^['"]|['"]$/g, '');
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch {}
}
loadDotEnv();

const PORTAL_NAME = process.argv[2] ?? 'nolf-archive';
const NAMESPACE = 'global';
// What the PHONE fetches directly. With `adb reverse tcp:3001 tcp:3001` the
// phone's localhost:3001 reaches this PC — the test shortcut that proves the loop.
const ORIGIN_ENDPOINT = process.env.PUBLISHER_ORIGIN ?? 'http://localhost:3001';
// origin_endpoint stored in portal_descriptor_cache. The server-side proxy
// branch only fires for a portal we do NOT own locally (local-first guard in
// portals.ts), so on a one-box setup leave this empty (default) and the local
// portal_pages read serves the pages. To genuinely test ANTON-Local-as-proxy,
// set PROXY_ORIGIN to a DISTINCT peer ANTON's URL (a non-loopback LAN/WAN
// address — the SSRF guard blocks localhost but allows private LAN).
const PROXY_ORIGIN = process.env.PROXY_ORIGIN ?? '';
const DATABASE_URL = process.env.DATABASE_URL;
const RELAY_BASE = process.env.RELAY_BASE ?? 'https://relay.futurechain.eu/v1';
const OPERATOR_ID = process.env.RELAY_OPERATOR_ID ?? 'op-daniel';
const OPERATOR_PASSWORD = process.env.RELAY_OPERATOR_PASSWORD;
const SKIP_RELAY = process.env.SKIP_RELAY === '1';

if (!DATABASE_URL) { console.error('FAIL: DATABASE_URL not set'); process.exit(1); }
if (!OPERATOR_PASSWORD && !SKIP_RELAY) {
  console.error('FAIL: RELAY_OPERATOR_PASSWORD not set (set SKIP_RELAY=1 to only seed local DB)');
  process.exit(1);
}

const bytesToHex = (b) => Buffer.from(b).toString('hex');
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const spkiHexToRawHex = (h) => (h.length === 88 ? h.slice(24) : (() => { throw new Error('bad spki'); })());
const sha256Hex = (s) => createHash('sha256').update(s).digest('hex');
function deriveRelayContactHash(rawHex) {
  const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const h = createHash('sha256').update(Buffer.from(rawHex, 'hex')).digest();
  const segs = [];
  for (let s = 0; s < 4; s++) { let q = ''; for (let c = 0; c < 4; c++) q += CHARSET[h[s * 4 + c] % CHARSET.length]; segs.push(q); }
  return `ANTON-${segs.join('-')}`;
}

// ── Page content ─────────────────────────────────────────────────────────────
//
// The sandbox allows inline <style>, inline `style=""`, and remote images; it
// blocks scripts/forms/top-nav. Styling is scoped under `.nolf-*` so it
// composes cleanly on top of the Comm App's sandbox base reset.

const PAGE_STYLE = `<style>
  .nolf-hero {
    margin: -1rem -1.125rem 1rem;
    padding: 1.5rem 1.125rem 1.75rem;
    background: linear-gradient(135deg, #1a1340 0%, #2b1b5e 55%, #07050f 100%);
    color: #fff;
    border-bottom: 4px solid #E94560;
    position: relative;
    overflow: hidden;
  }
  .nolf-hero::before {
    content: '';
    position: absolute; inset: 0;
    background-image:
      radial-gradient(circle at 82% 18%, rgba(233,69,96,0.22) 0%, transparent 42%),
      radial-gradient(circle at 14% 88%, rgba(120,80,255,0.35) 0%, transparent 52%);
    pointer-events: none;
  }
  .nolf-eyebrow {
    position: relative;
    font-size: 0.7rem; letter-spacing: 0.22em; text-transform: uppercase;
    color: #E94560; font-weight: 700;
  }
  .nolf-hero h1 {
    color: #fff; margin: 0.35rem 0 0; border: none; padding: 0;
    font-size: 1.55rem; font-weight: 800; letter-spacing: -0.01em; position: relative;
  }
  .nolf-hero .nolf-sub {
    position: relative;
    color: rgba(255,255,255,0.72); font-size: 0.85rem; margin-top: 4px;
  }
  .nolf-hero-tag {
    position: relative; margin-top: 1rem;
    font-size: 0.95rem; color: rgba(255,255,255,0.92); line-height: 1.45;
  }
  .nolf-pills { display: flex; gap: 0.5rem; margin-top: 1rem; position: relative; flex-wrap: wrap; }
  .nolf-pill {
    background: rgba(255,255,255,0.09);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 999px;
    padding: 0.3rem 0.7rem;
    font-size: 0.72rem; color: rgba(255,255,255,0.9);
  }

  .nolf-card {
    background: #fff; border: 1px solid #E6E3F0;
    border-radius: 0.85rem; padding: 0.95rem 1.05rem; margin: 0.9rem 0;
    box-shadow: 0 2px 8px rgba(20,10,60,0.05);
  }
  .nolf-card h2 { margin: 0 0 0.4rem; font-size: 1.15rem; color: #1a1340; }
  .nolf-card h3 { margin: 0 0 0.3rem; font-size: 1rem; color: #2b1b5e; }
  .nolf-card p { margin: 0.35rem 0; color: #44415a; font-size: 0.92rem; line-height: 1.5; }

  .nolf-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 1rem 0; }
  .nolf-stat {
    background: #fff; border: 1px solid #E6E3F0; border-radius: 0.6rem;
    padding: 0.65rem 0.5rem; text-align: center;
  }
  .nolf-stat .n { font-size: 1.35rem; font-weight: 800; color: #E94560; line-height: 1; }
  .nolf-stat .lbl { font-size: 0.63rem; color: #6b6884; margin-top: 0.25rem; text-transform: uppercase; letter-spacing: 0.07em; }

  .nolf-section-h { display: flex; align-items: center; margin: 1.4rem 0 0.6rem; }
  .nolf-section-h h2 { margin: 0; font-size: 1.02rem; text-transform: uppercase; letter-spacing: 0.08em; color: #1a1340; }
  .nolf-section-h .bar { flex: 1; height: 2px; background: #E94560; margin-left: 0.75rem; }

  .nolf-list { display: grid; gap: 0.55rem; }
  .nolf-row {
    display: flex; gap: 0.7rem; align-items: flex-start;
    background: #fff; border: 1px solid #E6E3F0; border-radius: 0.7rem; padding: 0.7rem 0.8rem;
  }
  .nolf-row .badge {
    flex-shrink: 0; background: #2b1b5e; color: #fff;
    font-size: 0.62rem; font-weight: 700; padding: 0.22rem 0.5rem; border-radius: 0.3rem;
    text-transform: uppercase; letter-spacing: 0.06em; margin-top: 0.1rem;
  }
  .nolf-row .body .t { font-size: 0.95rem; font-weight: 600; color: #1a1340; }
  .nolf-row .body .m { font-size: 0.8rem; color: #6b6884; margin-top: 2px; }

  .nolf-quote {
    margin: 1rem 0; padding: 0.85rem 1rem;
    border-left: 3px solid #E94560; background: #f6f4fc; border-radius: 0 0.5rem 0.5rem 0;
    color: #2b1b5e; font-style: italic; font-size: 0.92rem;
  }

  .nolf-cta {
    margin: 1.25rem 0 0.5rem; padding: 0.9rem 1rem;
    background: linear-gradient(135deg, #2b1b5e 0%, #1a1340 100%);
    color: #fff; border-radius: 0.7rem; text-align: center;
  }
  .nolf-cta strong { color: #E94560; }
  .nolf-cta p { color: rgba(255,255,255,0.92); margin: 0; font-size: 0.88rem; }
</style>`;

const HOME_HTML = `${PAGE_STYLE}
<div class="nolf-hero">
  <div class="nolf-eyebrow">UNITY · Fan Archive</div>
  <h1>No One Lives Forever</h1>
  <div class="nolf-sub">The Operative Cate Archer · 1960s spy-fi FPS</div>
  <div class="nolf-hero-tag">
    A community archive for the cult Monolith shooter <em>The Operative: No One
    Lives Forever</em> (2000) and <em>A Spy in H.A.R.M.'s Way</em> (2002).
    Walkthroughs, lore, and the long campaign to get it re-released.
  </div>
  <div class="nolf-pills">
    <span class="nolf-pill">Cate Archer</span>
    <span class="nolf-pill">UNITY</span>
    <span class="nolf-pill">H.A.R.M.</span>
    <span class="nolf-pill">Retro FPS</span>
  </div>
</div>

<div class="nolf-card">
  <h2>What is NOLF?</h2>
  <p><strong>No One Lives Forever</strong> casts you as Cate Archer, a reformed
  cat burglar turned operative for the British intelligence agency UNITY, against
  the shadowy crime syndicate H.A.R.M. Equal parts <em>James Bond</em>,
  <em>The Avengers</em>, and Austin-Powers wit — with stealth, gadgets, and one
  of the sharpest scripts the genre ever shipped.</p>
</div>

<div class="nolf-stats">
  <div class="nolf-stat"><div class="n">2000</div><div class="lbl">Released</div></div>
  <div class="nolf-stat"><div class="n">14</div><div class="lbl">Missions</div></div>
  <div class="nolf-stat"><div class="n">∞</div><div class="lbl">Gadgets</div></div>
</div>

<div class="nolf-section-h"><h2>Latest from the archive</h2><span class="bar"></span></div>
<div class="nolf-list">
  <div class="nolf-row">
    <span class="badge">Guide</span>
    <div class="body">
      <div class="t">Berlin by night — the silent-takedown route</div>
      <div class="m">Updated · 6 min read</div>
    </div>
  </div>
  <div class="nolf-row">
    <span class="badge">Lore</span>
    <div class="body">
      <div class="t">Who really runs H.A.R.M.? A timeline</div>
      <div class="m">2 days ago · 9 min read</div>
    </div>
  </div>
  <div class="nolf-row">
    <span class="badge">News</span>
    <div class="body">
      <div class="t">The re-release rights tangle, explained</div>
      <div class="m">Last week · 4 min read</div>
    </div>
  </div>
</div>

<div class="nolf-cta">
  <p>Tap <strong>Ask a question</strong> or <strong>Subscribe</strong> below to
  keep up with the archive.</p>
</div>`;

const GUIDE_HTML = `${PAGE_STYLE}
<div class="nolf-hero" style="padding: 1.1rem 1.125rem 1.3rem;">
  <div class="nolf-eyebrow">Field Manual</div>
  <h1 style="font-size: 1.3rem;">Operative's Guide</h1>
  <div class="nolf-sub">Stealth, gadgets, and getting an A-rank</div>
</div>

<div class="nolf-card">
  <h3>Gadgets you'll actually use</h3>
  <p><strong>Lipstick Mine</strong> — proximity charge disguised as cosmetics.
  Drop it on a patrol seam.</p>
  <p><strong>Coded Décoder Ring</strong> — pops locks and safes; the bread and
  butter of every infiltration.</p>
  <p><strong>Perfume / Sleeping Gas</strong> — non-lethal takedowns that keep your
  stealth rating clean.</p>
  <p><strong>Robotic Poodle (CL-30)</strong> — yes, an explosive poodle. NOLF, in
  one item.</p>
</div>

<div class="nolf-section-h"><h2>Stealth rules</h2><span class="bar"></span></div>
<div class="nolf-list">
  <div class="nolf-row"><span class="badge">1</span><div class="body">
    <div class="t">Shoot the lights, not the guards</div>
    <div class="m">Darkness drops your visibility meter faster than crouching.</div>
  </div></div>
  <div class="nolf-row"><span class="badge">2</span><div class="body">
    <div class="t">Read the conversations</div>
    <div class="m">Half the codes — and most of the jokes — are in overheard guard banter.</div>
  </div></div>
  <div class="nolf-row"><span class="badge">3</span><div class="body">
    <div class="t">Hide the bodies</div>
    <div class="m">A discovered guard raises the alarm; drag them out of patrol sightlines.</div>
  </div></div>
</div>

<div class="nolf-quote">
  "I'm not going to dignify that with a response." — Cate Archer, to roughly
  everyone at H.A.R.M.
</div>

<div class="nolf-cta">
  <p>Stuck on a mission? Tap <strong>Ask a question</strong> and we'll point you
  to the right walkthrough.</p>
</div>`;

const LORE_HTML = `${PAGE_STYLE}
<div class="nolf-hero" style="padding: 1.1rem 1.125rem 1.3rem;">
  <div class="nolf-eyebrow">Dossier</div>
  <h1 style="font-size: 1.3rem;">Lore & Characters</h1>
  <div class="nolf-sub">UNITY vs H.A.R.M., the cast, the canon</div>
</div>

<div class="nolf-card">
  <h3>Cate Archer</h3>
  <p>Orphaned Scot, ex-cat-burglar, and UNITY's first female field operative.
  Underestimated by every villain she dismantles — which is rather the point.</p>
</div>
<div class="nolf-card">
  <h3>Bruno Lawrie</h3>
  <p>Cate's gruff handler and field partner. The straight man to her quips and the
  voice in her ear when a mission goes sideways.</p>
</div>
<div class="nolf-card">
  <h3>The Director · Mr. Smith · Dr. Schenker</h3>
  <p>H.A.R.M.'s rotating brain trust. Theatrical, lethal, and forever monologuing
  long enough for Cate to slip the lock behind them.</p>
</div>

<div class="nolf-section-h"><h2>Canon timeline</h2><span class="bar"></span></div>
<div class="nolf-list">
  <div class="nolf-row"><span class="badge">'00</span><div class="body">
    <div class="t">The Operative: No One Lives Forever</div>
    <div class="m">Cate's first solo assignment spirals into a global H.A.R.M. plot.</div>
  </div></div>
  <div class="nolf-row"><span class="badge">'02</span><div class="body">
    <div class="t">NOLF 2: A Spy in H.A.R.M.'s Way</div>
    <div class="m">Bigger sandbox, Japan-and-trailer-park set-pieces, the infamous mimes.</div>
  </div></div>
  <div class="nolf-row"><span class="badge">'03</span><div class="body">
    <div class="t">Contract J.A.C.K.</div>
    <div class="m">A prequel spin-off — H.A.R.M.'s side of the war, sans Cate.</div>
  </div></div>
</div>

<div class="nolf-cta">
  <p>Want the deep cuts? Tap <strong>Subscribe</strong> for new lore entries as
  the archive grows.</p>
</div>`;

const CAPABILITIES = [
  {
    id: 'cap-inquire', verb: 'inquire',
    title: 'Ask a question',
    description: 'Stuck on a mission, hunting a gadget, or after a lore detail? Ask the archivists.',
    aap_endpoint: 'inquiries',
    inputSchema: {
      type: 'object',
      required: ['topic', 'question'],
      properties: {
        topic: { type: 'string', title: 'Topic', description: 'e.g. Mission 4, gadgets, lore' },
        question: { type: 'string', title: 'Your question' },
      },
    },
  },
  {
    id: 'cap-contact', verb: 'contact',
    title: 'Send a message',
    description: 'Corrections, additions, or fan mail for the NOLF archive crew.',
    aap_endpoint: 'messages',
  },
  {
    id: 'cap-subscribe', verb: 'subscribe',
    title: 'Subscribe',
    description: 'Get a ping when new guides or lore entries land in the archive.',
    aap_endpoint: 'subscriptions',
  },
];

// ── Main flow ────────────────────────────────────────────────────────────────

async function main() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spkiHex = bytesToHex(publicKey.export({ type: 'spki', format: 'der' }));
  const pemPriv = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const rawHex = spkiHexToRawHex(spkiHex);
  const contactHash = deriveRelayContactHash(rawHex);
  const portalAddress = `${PORTAL_NAME}.${NAMESPACE}.portal`;
  const now = new Date().toISOString();
  const oneYear = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

  const descriptor = {
    schemaVersion: 'capability-1.0.0',
    descriptorId: `desc-${PORTAL_NAME}-${Date.now()}`,
    issuedAt: now,
    validFrom: now,
    validUntil: oneYear,
    portal: {
      name: portalAddress,
      namespace: NAMESPACE,
      displayTitle: 'NOLF Archive · No One Lives Forever',
      category: 'community',
      contactHash,
      publicKey: rawHex,
      originEndpoint: ORIGIN_ENDPOINT,
    },
    identity: {
      humanContact: { available: true, displayName: 'NOLF Archive crew', languages: ['en'] },
      organisationDetails: { legalName: 'NOLF Fan Archive (community test portal)' },
    },
    capabilities: CAPABILITIES.map((c) => ({
      id: c.id, verb: c.verb, title: c.title, description: c.description,
      aapEndpoint: c.aap_endpoint,
      ...(c.inputSchema ? { inputSchema: c.inputSchema } : {}),
      tags: ['nolf', 'no-one-lives-forever', 'cate-archer', 'fan'],
    })),
    description: 'Community fan archive for No One Lives Forever (Cate Archer / UNITY): walkthroughs, lore, and the re-release campaign.',
    tags: ['nolf', 'no-one-lives-forever', 'cate-archer', 'retro', 'fps', 'fan'],
    serviceAreas: ['SE', 'US', 'GB'],
    languages: ['en'],
  };

  const canonical = canonify(descriptor);
  const descriptorHash = sha256Hex(canonical);
  const sigBuf = sign(null, Buffer.from(canonical), pemPriv);
  const signature = b64url(sigBuf);

  console.log(`\n── ${PORTAL_NAME} ──`);
  console.log(`  address       : ${portalAddress}`);
  console.log(`  descriptor origin (phone fetches this directly): ${ORIGIN_ENDPOINT}`);
  console.log(`  proxy origin (server-side cache.origin_endpoint): ${PROXY_ORIGIN || '(none — local pages read)'}`);
  console.log(`  pubkey        : ${rawHex.slice(0, 16)}…`);
  console.log(`  contact       : ${contactHash}`);

  // ── Insert into local Postgres so ANTON Local's /api/portals/visit/* serves it
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  let portalId;
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO portals
         (name, namespace, category, display_title, description,
          template, contact_hash, public_key_hex, private_key_pem,
          public_index, status, descriptor_hash, capability_summary, metadata,
          surface_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,'active',$10,$11,$12,'managed')
       ON CONFLICT (name, namespace) DO UPDATE SET
         display_title = EXCLUDED.display_title,
         descriptor_hash = EXCLUDED.descriptor_hash,
         capability_summary = EXCLUDED.capability_summary,
         status = 'active'
       RETURNING id`,
      [
        PORTAL_NAME, NAMESPACE, 'community',
        'NOLF Archive · No One Lives Forever',
        'Community fan archive for No One Lives Forever (Cate Archer / UNITY).',
        'community',
        contactHash, rawHex, pemPriv,
        descriptorHash,
        JSON.stringify({
          capabilityVerbs: ['inquire', 'contact', 'subscribe'],
          tags: ['nolf', 'no-one-lives-forever', 'cate-archer', 'retro', 'fps', 'fan'],
          serviceAreas: ['SE', 'US', 'GB'],
          languages: ['en'],
          descriptorHash,
        }),
        JSON.stringify({ source: 'e2e-portal-nolf' }),
      ],
    );
    portalId = ins.rows[0].id;

    const pages = [
      { path: '/',      title: 'Home',  html: HOME_HTML,  order: 0 },
      { path: '/guide', title: 'Guide', html: GUIDE_HTML, order: 1 },
      { path: '/lore',  title: 'Lore',  html: LORE_HTML,  order: 2 },
    ];
    for (const p of pages) {
      await client.query(
        `INSERT INTO portal_pages (portal_id, path, title, html, sort_order, visible)
         VALUES ($1,$2,$3,$4,$5,TRUE)
         ON CONFLICT (portal_id, path) DO UPDATE SET
           title = EXCLUDED.title, html = EXCLUDED.html,
           sort_order = EXCLUDED.sort_order, visible = TRUE`,
        [portalId, p.path, p.title, p.html, p.order],
      );
    }

    // Signed descriptor cache. Unlike the sharks clone, populate
    // origin_endpoint so the server-side proxy path (portals.ts:1217-1234,
    // ANTON-Local-as-proxy) is exercised. PROXY_ORIGIN must be a non-loopback
    // address — the SSRF guard blocks localhost but allows private LAN.
    await client.query(
      `INSERT INTO portal_descriptor_cache
         (portal_address, descriptor_hash, descriptor, signature,
          signing_key_fingerprint, valid_from, valid_until, origin_endpoint)
       VALUES ($1,$2,$3,$4,$5, NOW(), NOW() + INTERVAL '365 days', $6)
       ON CONFLICT (portal_address) DO UPDATE SET
         descriptor_hash = EXCLUDED.descriptor_hash,
         descriptor = EXCLUDED.descriptor,
         signature = EXCLUDED.signature,
         origin_endpoint = EXCLUDED.origin_endpoint`,
      [portalAddress, descriptorHash, JSON.stringify(descriptor), signature, rawHex, PROXY_ORIGIN || null],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
  console.log(`  local DB      : inserted portal_id=${portalId}, 3 pages, signed descriptor cached (origin_endpoint=${PROXY_ORIGIN || 'null'})`);

  if (SKIP_RELAY) {
    console.log('  relay         : SKIPPED (SKIP_RELAY=1) — local DB only');
  } else {
    // Submit to relay
    const submitRes = await fetch(`${RELAY_BASE}/portals/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        proposedName: PORTAL_NAME,
        proposedNamespace: NAMESPACE,
        signingPubkeyHex: rawHex,
        submitterContactHash: contactHash,
        descriptorJson: descriptor,
        descriptorSignature: signature,
        kyc: {
          legalName: 'NOLF Fan Archive (test)',
          idDocumentType: 'org_registration',
          idDocumentNumber: 'TEST-NOLF-001',
          idDocumentCountry: 'SE',
          contactEmail: 'archive@nolf-test.example.com',
          addressCountry: 'SE',
          addressCity: 'Stockholm',
          addressStreet: 'UNITY HQ, 1 Cate Archer Way',
        },
      }),
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok) { console.error('relay submit:', submitRes.status, submitData); process.exit(1); }
    console.log(`  relay submit  : ${submitRes.status} → submissionId=${submitData.submissionId}`);

    // Auto-approve
    const loginRes = await fetch(`${RELAY_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operatorId: OPERATOR_ID, password: OPERATOR_PASSWORD }),
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok || !loginData.token) { console.error('login:', loginRes.status, loginData); process.exit(1); }

    const approveRes = await fetch(
      `${RELAY_BASE}/admin/submissions/${submitData.submissionId}/approve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${loginData.token}` },
        body: JSON.stringify({ reviewerNotes: 'NOLF fan-archive test portal (plan item #6)' }),
      },
    );
    const approveData = await approveRes.json();
    if (!approveRes.ok) { console.error('approve:', approveRes.status, approveData); process.exit(1); }
    console.log(`  relay approve : 200 → portalId=${approveData.portalId}`);

    // Eyeball the resolved descriptor's originEndpoint — this is the field
    // that broke Celebrini. It MUST be reachable from the phone.
    try {
      const resolveRes = await fetch(`${RELAY_BASE}/portals/resolve/${PORTAL_NAME}.${NAMESPACE}`);
      const resolveData = await resolveRes.json();
      const resolvedOrigin = resolveData?.descriptor?.portal?.originEndpoint;
      console.log(`  relay resolve : ${resolveRes.status} → originEndpoint="${resolvedOrigin}"  (eyeball: this is what broke Celebrini)`);
    } catch (e) {
      console.warn('  relay resolve : could not re-read descriptor:', e.message);
    }
  }

  // Sanity check — publisher serves the pages locally
  const local = await fetch(`${ORIGIN_ENDPOINT}/api/portals/visit/${encodeURIComponent(portalAddress)}/pages`);
  if (local.ok) {
    const lp = await local.json();
    console.log(`  local pages   : ${(lp.pages ?? []).length} pages: ${(lp.pages ?? []).map((p) => p.path).join(', ')}`);
  } else {
    console.warn(`  local pages   : ${local.status} — publisher not serving (ANTON Local running?)`);
  }

  console.log(`\n✓ Done. On the phone (with 'adb reverse tcp:3001 tcp:3001'):`);
  console.log(`  - Open Comm App → Portals (Portaler) → search "nolf" or "no one lives forever"`);
  console.log(`  - Tap the card → Home page renders the NOLF archive`);
  console.log(`  - Tap "Guide" / "Lore" tabs → pages render`);
  console.log(`  - Tap "Ask a question" → invoke → expect invoke_accepted + inboxId\n`);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
