/**
 * e2e-portal-live.mjs — end-to-end live test driver for the in-app portal viewer.
 *
 * Bypasses the 8-phase walkthrough UI (which would require LLM round-trips
 * and interactive UI) and directly:
 *
 *   1. generates an Ed25519 keypair
 *   2. builds + signs a canonical descriptor with
 *      `portal.originEndpoint = http://localhost:3001` so the phone (via
 *      `adb reverse tcp:3001 tcp:3001`) can reach ANTON Local
 *   3. INSERTs the portal + portal_pages + portal_descriptor_cache rows
 *      into local Postgres so the publisher's HTTP route serves real HTML
 *   4. POSTs the same descriptor + KYC to relay.futurechain.eu for review
 *   5. auto-approves via the operator login + JWT
 *
 * Result: the relay returns the portal in /v1/portals/search; the phone
 * resolves the descriptor, pulls pages from http://localhost:3001 over
 * adb reverse, and renders them inside the Comm App.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... \
 *   RELAY_OPERATOR_PASSWORD=... \
 *   node scripts/e2e-portal-live.mjs [portal-name]
 */

import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { canonify } from '@truestamp/canonify';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Client } = pg;

// ── Config from env ──────────────────────────────────────────────────────────

// Load env vars from `.env` if not already present in process.env — we want this
// script runnable from a plain shell without `dotenv -e .env -- node …` ceremony.
function loadDotEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const k = m[1], v = m[2];
      if (!(k in process.env)) process.env[k] = v.replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}
loadDotEnv();

const PORTAL_NAME = process.argv[2] ?? `live-${Date.now().toString(36)}`;
const NAMESPACE = 'global';
const ORIGIN_ENDPOINT = process.env.PUBLISHER_ORIGIN ?? 'http://localhost:3001';
const DATABASE_URL = process.env.DATABASE_URL;
const RELAY_BASE = process.env.RELAY_BASE ?? 'https://relay.futurechain.eu/v1';
const OPERATOR_ID = process.env.RELAY_OPERATOR_ID ?? 'op-daniel';
const OPERATOR_PASSWORD = process.env.RELAY_OPERATOR_PASSWORD;

if (!DATABASE_URL) {
  console.error('FAIL: DATABASE_URL not set (looked in env + .env)');
  process.exit(1);
}
if (!OPERATOR_PASSWORD) {
  console.error('FAIL: RELAY_OPERATOR_PASSWORD not set — needed to auto-approve');
  process.exit(1);
}

// ── Crypto helpers ───────────────────────────────────────────────────────────

function bytesToHex(buf) { return Buffer.from(buf).toString('hex'); }
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function spkiHexToRawHex(spkiHex) {
  if (spkiHex.length !== 88) throw new Error(`expected 88-char SPKI hex, got ${spkiHex.length}`);
  return spkiHex.slice(24);
}
function deriveRelayContactHash(rawHex) {
  const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const hash = createHash('sha256').update(Buffer.from(rawHex, 'hex')).digest();
  const segs = [];
  for (let s = 0; s < 4; s++) {
    let seg = '';
    for (let c = 0; c < 4; c++) seg += CHARSET[hash[s * 4 + c] % CHARSET.length];
    segs.push(seg);
  }
  return `ANTON-${segs.join('-')}`;
}
function sha256Hex(s) {
  return createHash('sha256').update(s).digest('hex');
}

// ── Sample portal content ────────────────────────────────────────────────────

const HOME_HTML = `<h1>Welcome to ${PORTAL_NAME}</h1>
<p>This portal was created by the live e2e test driver to verify the
in-app portal viewer works end-to-end. If you can read this on your
phone, the full pipeline is wired:</p>
<ul>
  <li>Comm App searches the relay's /v1/portals/search</li>
  <li>Tapping the card resolves the descriptor</li>
  <li>The Comm App joins descriptor.portal.originEndpoint with
      /api/portals/visit/&lt;address&gt;/page to fetch this page</li>
  <li>wrapForSandbox + sandbox="" render it safely below</li>
</ul>
<h2>What you can do</h2>
<p>Tap the action buttons at the bottom of the screen to send a
message or ask a question. They invoke capabilities on the publisher's
ANTON, which in this test is your local machine via adb reverse.</p>
<blockquote>Phase 3 ships the in-app portal viewer. Phase 1 + 2 + 3 + the
two adjacent fixes (originEndpoint in walkthrough, invokeCapability URL
join) made this loop possible.</blockquote>`;

const ABOUT_HTML = `<h1>About</h1>
<p>This is a second page to verify the page-tab rail above the iframe
works correctly. Tapping &quot;Home&quot; should take you back.</p>
<h3>Page facts</h3>
<ul>
  <li>Created by <code>scripts/e2e-portal-live.mjs</code></li>
  <li>Served from <code>${ORIGIN_ENDPOINT}</code></li>
  <li>Rendered in a <code>sandbox=&quot;&quot;</code> iframe</li>
</ul>`;

const CAPABILITIES = [
  { id: 'cap-contact', verb: 'contact', title: 'Send a message',
    description: 'Drop me a line; goes straight to my inbox.',
    aap_endpoint: 'messages' },
  { id: 'cap-inquire', verb: 'inquire', title: 'Ask a question',
    description: 'Get a structured response with availability + pricing.',
    aap_endpoint: 'inquiries' },
];

// ── Main flow ────────────────────────────────────────────────────────────────

async function main() {
  // 1. Keypair + canonical descriptor
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
      displayTitle: 'E2E live portal',
      category: 'personal',
      contactHash,
      publicKey: rawHex,
      originEndpoint: ORIGIN_ENDPOINT,
    },
    identity: {
      humanContact: { available: true, displayName: 'Daniel (live e2e)' },
    },
    capabilities: CAPABILITIES.map((c) => ({
      id: c.id, verb: c.verb, title: c.title, description: c.description,
      aapEndpoint: c.aap_endpoint, tags: ['e2e', 'live'],
    })),
    description: 'Live e2e test portal — pages served from local ANTON via adb reverse.',
    tags: ['e2e', 'live', 'demo'],
    serviceAreas: ['SE'],
    languages: ['en'],
  };

  const canonical = canonify(descriptor);
  const descriptorHash = sha256Hex(canonical);
  const sigBuf = sign(null, Buffer.from(canonical), pemPriv);
  const signature = b64url(sigBuf);

  console.log(`\n── ${PORTAL_NAME} ──`);
  console.log(`  address     : ${portalAddress}`);
  console.log(`  origin      : ${ORIGIN_ENDPOINT}`);
  console.log(`  pubkey      : ${rawHex.slice(0, 16)}…`);
  console.log(`  contact     : ${contactHash}`);

  // 2. Insert into local Postgres so ANTON Local's /api/portals/visit/* serves it
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
        PORTAL_NAME, NAMESPACE, 'personal', 'E2E live portal',
        'Live e2e driver-built portal.',
        'personal',
        contactHash, rawHex, pemPriv,
        descriptorHash,
        JSON.stringify({
          capabilityVerbs: ['contact', 'inquire'],
          tags: ['e2e', 'live', 'demo'],
          serviceAreas: ['SE'],
          languages: ['en'],
          descriptorHash,
        }),
        JSON.stringify({ source: 'e2e-portal-live' }),
      ],
    );
    portalId = ins.rows[0].id;

    // Pages
    for (const [i, p] of [
      { path: '/', title: 'Home', html: HOME_HTML },
      { path: '/about', title: 'About', html: ABOUT_HTML },
    ].entries()) {
      await client.query(
        `INSERT INTO portal_pages (portal_id, path, title, html, sort_order, visible)
         VALUES ($1,$2,$3,$4,$5,TRUE)
         ON CONFLICT (portal_id, path) DO UPDATE SET
           title = EXCLUDED.title, html = EXCLUDED.html,
           sort_order = EXCLUDED.sort_order, visible = TRUE`,
        [portalId, p.path, p.title, p.html, i],
      );
    }

    // Signed descriptor cache
    await client.query(
      `INSERT INTO portal_descriptor_cache
         (portal_address, descriptor_hash, descriptor, signature,
          signing_key_fingerprint, valid_from, valid_until)
       VALUES ($1,$2,$3,$4,$5, NOW(), NOW() + INTERVAL '365 days')
       ON CONFLICT (portal_address) DO UPDATE SET
         descriptor_hash = EXCLUDED.descriptor_hash,
         descriptor = EXCLUDED.descriptor,
         signature = EXCLUDED.signature`,
      [portalAddress, descriptorHash, JSON.stringify(descriptor), signature, rawHex],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
  console.log(`  local DB    : inserted portal_id=${portalId}, 2 pages, signed descriptor cached`);

  // 3. Submit to relay
  const submitBody = {
    proposedName: PORTAL_NAME,
    proposedNamespace: NAMESPACE,
    signingPubkeyHex: rawHex,
    submitterContactHash: contactHash,
    descriptorJson: descriptor,
    descriptorSignature: signature,
    kyc: {
      legalName: 'Daniel Bardun (live e2e)',
      idDocumentType: 'national_id',
      idDocumentNumber: `LIVE-${PORTAL_NAME}`,
      idDocumentCountry: 'SE',
      contactEmail: 'daniel.bardun@gmail.com',
      addressCountry: 'SE',
      addressCity: 'Stockholm',
      addressStreet: 'Live test 1',
    },
  };
  const submitRes = await fetch(`${RELAY_BASE}/portals/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submitBody),
  });
  const submitData = await submitRes.json();
  if (!submitRes.ok) {
    console.error(`  relay submit: ${submitRes.status}`, submitData);
    process.exit(1);
  }
  console.log(`  relay submit: ${submitRes.status} → submissionId=${submitData.submissionId}`);

  // 4. Auto-approve via operator login
  const loginRes = await fetch(`${RELAY_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operatorId: OPERATOR_ID, password: OPERATOR_PASSWORD }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.token) {
    console.error(`  relay login : ${loginRes.status}`, loginData);
    process.exit(1);
  }
  const approveRes = await fetch(
    `${RELAY_BASE}/admin/submissions/${submitData.submissionId}/approve`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${loginData.token}` },
      body: JSON.stringify({ reviewerNotes: 'live e2e auto-approve' }),
    },
  );
  const approveData = await approveRes.json();
  if (!approveRes.ok) {
    console.error(`  relay approve: ${approveRes.status}`, approveData);
    process.exit(1);
  }
  console.log(`  relay approve: 200 → portalId=${approveData.portalId}`);

  // 5. Sanity-fetch from publisher
  const localPageRes = await fetch(
    `${ORIGIN_ENDPOINT}/api/portals/visit/${encodeURIComponent(portalAddress)}/page?path=/`,
  );
  if (localPageRes.ok) {
    const lp = await localPageRes.json();
    console.log(`  local page  : 200, html length=${lp.html?.length ?? 0}`);
  } else {
    console.warn(`  local page  : ${localPageRes.status} — publisher not serving (ANTON Local running?)`);
  }

  console.log(`\n✓ Done. On the phone:`);
  console.log(`  - Open Comm App → Portals tab`);
  console.log(`  - Search for "${PORTAL_NAME}"`);
  console.log(`  - Tap the card → expect rendered page from ${ORIGIN_ENDPOINT}\n`);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
