/**
 * e2e-portal-sharks.mjs — richer test portal for exercising the order/pay
 * capability path in the Comm App's in-app viewer.
 *
 * Builds a 3-page portal about the San Jose Sharks with a Macklin Celebrini
 * merch catalog, then runs the same insert-local-DB → submit-to-relay →
 * auto-approve flow as e2e-portal-live.mjs.
 *
 * Usage:
 *   RELAY_OPERATOR_PASSWORD=... node scripts/e2e-portal-sharks.mjs
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
      if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}
loadDotEnv();

const PORTAL_NAME = process.argv[2] ?? 'sjsharks-celebrini';
const NAMESPACE = 'global';
const ORIGIN_ENDPOINT = process.env.PUBLISHER_ORIGIN ?? 'http://localhost:3001';
const DATABASE_URL = process.env.DATABASE_URL;
const RELAY_BASE = process.env.RELAY_BASE ?? 'https://relay.futurechain.eu/v1';
const OPERATOR_ID = process.env.RELAY_OPERATOR_ID ?? 'op-daniel';
const OPERATOR_PASSWORD = process.env.RELAY_OPERATOR_PASSWORD;

if (!DATABASE_URL) { console.error('FAIL: DATABASE_URL not set'); process.exit(1); }
if (!OPERATOR_PASSWORD) { console.error('FAIL: RELAY_OPERATOR_PASSWORD not set'); process.exit(1); }

const bytesToHex = (b) => Buffer.from(b).toString('hex');
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const spkiHexToRawHex = (h) => (h.length === 88 ? h.slice(24) : (() => { throw new Error('bad spki'); })());
const sha256Hex = (s) => createHash('sha256').update(s).digest('hex');
function deriveRelayContactHash(rawHex) {
  const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const h = createHash('sha256').update(Buffer.from(rawHex, 'hex')).digest();
  const segs = [];
  for (let s = 0; s < 4; s++) { let q=''; for (let c=0;c<4;c++) q+=CHARSET[h[s*4+c]%CHARSET.length]; segs.push(q); }
  return `ANTON-${segs.join('-')}`;
}

// ── Page content ─────────────────────────────────────────────────────────────

// ── Rich page HTML — mimics the layout of nhl.com/sharks ─────────────────────
//
// The sandbox allows arbitrary inline <style> blocks, inline `style=""`, and
// remote images (it only blocks scripts/forms/top-nav). We use real NHL CDN
// URLs for the Sharks logo and Celebrini headshot (assets.nhle.com is the
// public canonical host for team logos + player mugs).
//
// Page-level styling is scoped under `.sjs-*` classes so it composes cleanly
// on top of the Comm App's sandbox base reset.

const PAGE_STYLE = `<style>
  .sjs-hero {
    margin: -1rem -1.125rem 1rem;
    padding: 1.5rem 1.125rem 1.75rem;
    background: linear-gradient(135deg, #006D75 0%, #00424A 60%, #000 100%);
    color: #fff;
    border-bottom: 4px solid #E57200;
    position: relative;
    overflow: hidden;
  }
  .sjs-hero::before {
    content: '';
    position: absolute; inset: 0;
    background-image:
      radial-gradient(circle at 85% 15%, rgba(229,114,0,0.18) 0%, transparent 40%),
      radial-gradient(circle at 15% 85%, rgba(0,109,117,0.4) 0%, transparent 50%);
    pointer-events: none;
  }
  .sjs-hero-row { display: flex; align-items: center; gap: 0.85rem; position: relative; }
  .sjs-hero-logo {
    width: 56px; height: 56px;
    background: #fff; border-radius: 50%;
    padding: 6px; flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    margin: 0;
  }
  .sjs-hero h1 {
    color: #fff; margin: 0; border: none; padding: 0;
    font-size: 1.5rem; font-weight: 800; letter-spacing: -0.01em;
  }
  .sjs-hero .sjs-sub {
    color: rgba(255,255,255,0.7); font-size: 0.85rem;
    text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px;
  }
  .sjs-hero-tag {
    position: relative;
    margin-top: 1rem;
    font-size: 0.95rem; color: rgba(255,255,255,0.92);
    line-height: 1.45;
  }
  .sjs-record {
    display: flex; gap: 0.5rem; margin-top: 1rem; position: relative;
  }
  .sjs-record-pill {
    flex: 1;
    background: rgba(255,255,255,0.1);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 0.6rem;
    padding: 0.55rem 0.5rem;
    text-align: center;
  }
  .sjs-record-pill .v { font-size: 1.15rem; font-weight: 700; color: #fff; }
  .sjs-record-pill .l { font-size: 0.65rem; color: rgba(255,255,255,0.65); text-transform: uppercase; letter-spacing: 0.07em; }

  .sjs-feature {
    margin: 1rem 0;
    border-radius: 0.85rem;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    border: 1px solid #EAE7E0;
  }
  .sjs-feature-img {
    width: 100%; aspect-ratio: 16/10;
    background:
      linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.55) 100%),
      linear-gradient(135deg, #006D75 0%, #003036 100%);
    position: relative;
    display: flex; align-items: flex-end; padding: 0.85rem 1rem;
  }
  .sjs-feature-img img {
    position: absolute; right: -10px; bottom: 0;
    height: 105%; width: auto; border-radius: 0; margin: 0;
    object-fit: contain; object-position: bottom right;
  }
  .sjs-feature-img .num {
    position: absolute; left: 0.5rem; top: 0.4rem;
    font-size: 4.5rem; font-weight: 900; color: rgba(255,255,255,0.13);
    line-height: 1; letter-spacing: -0.05em;
  }
  .sjs-feature-img .badge {
    position: relative; z-index: 1;
    background: #E57200; color: #fff;
    font-size: 0.7rem; font-weight: 700;
    padding: 0.2rem 0.55rem; border-radius: 0.3rem;
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .sjs-feature-body { padding: 0.85rem 1rem 1rem; }
  .sjs-feature-body h2 {
    margin: 0 0 0.2rem; font-size: 1.2rem; color: #1A1B2E;
  }
  .sjs-feature-body p { margin: 0; color: #4F5267; font-size: 0.92rem; }

  .sjs-stats {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem; margin: 1rem 0;
  }
  .sjs-stat {
    background: #fff; border: 1px solid #EAE7E0;
    border-radius: 0.6rem; padding: 0.65rem 0.5rem;
    text-align: center;
  }
  .sjs-stat .n { font-size: 1.4rem; font-weight: 800; color: #006D75; line-height: 1; }
  .sjs-stat .lbl { font-size: 0.65rem; color: #686A7C; margin-top: 0.25rem;
    text-transform: uppercase; letter-spacing: 0.07em; }

  .sjs-section-h {
    display: flex; align-items: center; justify-content: space-between;
    margin: 1.4rem 0 0.6rem;
  }
  .sjs-section-h h2 {
    margin: 0; font-size: 1.05rem; text-transform: uppercase;
    letter-spacing: 0.08em; color: #1A1B2E;
  }
  .sjs-section-h .bar { flex: 1; height: 2px; background: #E57200; margin-left: 0.75rem; }

  .sjs-tiles { display: grid; gap: 0.6rem; }
  .sjs-tile {
    display: flex; gap: 0.7rem;
    background: #fff; border: 1px solid #EAE7E0;
    border-radius: 0.7rem; padding: 0.65rem; align-items: stretch;
  }
  .sjs-tile-img {
    width: 88px; height: 88px; flex-shrink: 0;
    border-radius: 0.5rem; background: #EFECE5;
    background-size: cover; background-position: center;
  }
  .sjs-tile-body { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
  .sjs-tile-cat {
    font-size: 0.62rem; color: #E57200; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .sjs-tile-title { font-size: 0.95rem; font-weight: 600; color: #1A1B2E; line-height: 1.25; margin: 0.15rem 0; }
  .sjs-tile-meta { font-size: 0.75rem; color: #686A7C; }

  .sjs-schedule { display: grid; gap: 0.4rem; }
  .sjs-game {
    display: grid; grid-template-columns: 60px 1fr auto;
    align-items: center; gap: 0.5rem;
    background: #fff; border: 1px solid #EAE7E0;
    border-radius: 0.6rem; padding: 0.55rem 0.7rem;
  }
  .sjs-game .date {
    background: #006D75; color: #fff;
    border-radius: 0.4rem; padding: 0.35rem 0.2rem;
    text-align: center; line-height: 1;
  }
  .sjs-game .date .m { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; }
  .sjs-game .date .d { font-size: 1.15rem; font-weight: 800; display: block; margin-top: 2px; }
  .sjs-game .matchup { font-size: 0.92rem; font-weight: 600; color: #1A1B2E; }
  .sjs-game .venue { font-size: 0.72rem; color: #686A7C; margin-top: 2px; }
  .sjs-game .time { font-size: 0.85rem; font-weight: 600; color: #006D75; }

  .sjs-product {
    background: #fff; border: 1px solid #EAE7E0;
    border-radius: 0.8rem; margin: 0.6rem 0;
    overflow: hidden;
  }
  .sjs-product-img {
    width: 100%; aspect-ratio: 4/3;
    background: linear-gradient(135deg, #f8f6f1 0%, #EFECE5 100%);
    display: flex; align-items: center; justify-content: center;
    position: relative;
  }
  .sjs-product-img .ph {
    font-size: 3.5rem; font-weight: 900; color: rgba(0,109,117,0.12);
    letter-spacing: -0.03em;
  }
  .sjs-product-img .price {
    position: absolute; top: 0.5rem; right: 0.5rem;
    background: #E57200; color: #fff;
    font-weight: 700; font-size: 0.85rem;
    padding: 0.25rem 0.55rem; border-radius: 0.35rem;
  }
  .sjs-product-img .tag {
    position: absolute; top: 0.5rem; left: 0.5rem;
    background: #1A1B2E; color: #fff;
    font-size: 0.65rem; font-weight: 700;
    padding: 0.2rem 0.45rem; border-radius: 0.25rem;
    text-transform: uppercase; letter-spacing: 0.07em;
  }
  .sjs-product-body { padding: 0.7rem 0.85rem 0.85rem; }
  .sjs-product-body h3 {
    margin: 0 0 0.3rem; font-size: 1rem; color: #1A1B2E;
  }
  .sjs-product-body p { margin: 0.25rem 0; font-size: 0.85rem; color: #4F5267; }
  .sjs-product-body .sku {
    display: inline-block; margin-top: 0.45rem;
    background: #EFECE5; padding: 0.18rem 0.45rem; border-radius: 0.3rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.7rem; color: #1A1B2E;
  }

  .sjs-cta {
    margin: 1.25rem 0 0.5rem;
    padding: 0.85rem 1rem;
    background: linear-gradient(135deg, #006D75 0%, #00424A 100%);
    color: #fff; border-radius: 0.7rem;
    text-align: center;
  }
  .sjs-cta strong { color: #E57200; }
  .sjs-cta p { color: rgba(255,255,255,0.9); margin: 0; font-size: 0.88rem; }
</style>`;

// Real NHL CDN assets. The Sharks logo SVG is well-known + cacheable; the
// Celebrini headshot uses his NHL player ID (8484144) under the standard
// /mugs/nhl/{season}/{team}/{playerId}.png URL pattern that the league
// publishes for every active player.
const SHARKS_LOGO = 'https://assets.nhle.com/logos/nhl/svg/SJS_light.svg';
const CELEBRINI_MUG = 'https://assets.nhle.com/mugs/nhl/20242025/SJS/8484144.png';

const HOME_HTML = `${PAGE_STYLE}
<div class="sjs-hero">
  <div class="sjs-hero-row">
    <img class="sjs-hero-logo" src="${SHARKS_LOGO}" alt="San Jose Sharks logo">
    <div>
      <h1>San Jose Sharks</h1>
      <div class="sjs-sub">Western · Pacific · est. 1991</div>
    </div>
  </div>
  <div class="sjs-hero-tag">
    SAP Center · San Jose, CA — official ANTON fan portal. The latest on
    Macklin Celebrini, the schedule, and the team store.
  </div>
  <div class="sjs-record">
    <div class="sjs-record-pill"><div class="v">21-32-9</div><div class="l">Record</div></div>
    <div class="sjs-record-pill"><div class="v">51</div><div class="l">Points</div></div>
    <div class="sjs-record-pill"><div class="v">7th</div><div class="l">Pacific</div></div>
  </div>
</div>

<div class="sjs-feature">
  <div class="sjs-feature-img">
    <div class="num">71</div>
    <img src="${CELEBRINI_MUG}" alt="Macklin Celebrini">
    <span class="badge">Rookie Spotlight</span>
  </div>
  <div class="sjs-feature-body">
    <h2>Macklin Celebrini · #71</h2>
    <p>2024 #1 overall pick. Hobey Baker winner at BU. 25 G · 38 A in his rookie campaign.</p>
  </div>
</div>

<div class="sjs-stats">
  <div class="sjs-stat"><div class="n">25</div><div class="lbl">Goals</div></div>
  <div class="sjs-stat"><div class="n">38</div><div class="lbl">Assists</div></div>
  <div class="sjs-stat"><div class="n">63</div><div class="lbl">Points</div></div>
</div>

<div class="sjs-section-h"><h2>Latest</h2><span class="bar"></span></div>
<div class="sjs-tiles">
  <div class="sjs-tile">
    <div class="sjs-tile-img" style="background: linear-gradient(135deg,#006D75,#00424A);"></div>
    <div class="sjs-tile-body">
      <div>
        <div class="sjs-tile-cat">Game Recap</div>
        <div class="sjs-tile-title">Celebrini's OT winner sinks the Knights</div>
      </div>
      <div class="sjs-tile-meta">2 hours ago · 4 min read</div>
    </div>
  </div>
  <div class="sjs-tile">
    <div class="sjs-tile-img" style="background: linear-gradient(135deg,#E57200,#a14e00);"></div>
    <div class="sjs-tile-body">
      <div>
        <div class="sjs-tile-cat">Roster Move</div>
        <div class="sjs-tile-title">Sharks recall Quinn Vinlöf from the Barracuda</div>
      </div>
      <div class="sjs-tile-meta">Yesterday · 2 min read</div>
    </div>
  </div>
  <div class="sjs-tile">
    <div class="sjs-tile-img" style="background: linear-gradient(135deg,#1A1B2E,#3B3D50);"></div>
    <div class="sjs-tile-body">
      <div>
        <div class="sjs-tile-cat">Feature</div>
        <div class="sjs-tile-title">Behind the build: Celebrini's pre-game routine</div>
      </div>
      <div class="sjs-tile-meta">2 days ago · 8 min read</div>
    </div>
  </div>
</div>

<div class="sjs-cta">
  <p>Tap <strong>Order merch</strong> at the bottom to shop the team store.</p>
</div>`;

const MERCH_HTML = `${PAGE_STYLE}
<div class="sjs-hero" style="padding: 1.1rem 1.125rem 1.3rem;">
  <div class="sjs-hero-row">
    <img class="sjs-hero-logo" src="${SHARKS_LOGO}" alt="Sharks">
    <div>
      <h1 style="font-size: 1.3rem;">Team Store</h1>
      <div class="sjs-sub">Celebrini #71 collection</div>
    </div>
  </div>
</div>

<p style="font-size: 0.88rem; color: #4F5267; margin-top: 0.5rem;">
Officially licensed merchandise. Tap <strong>Order merch</strong> below to
place an order — we confirm price &amp; ETA before charging.</p>

<div class="sjs-product">
  <div class="sjs-product-img">
    <span class="tag">Bestseller</span>
    <span class="price">$299.99</span>
    <span class="ph">71</span>
  </div>
  <div class="sjs-product-body">
    <h3>Authentic Home Jersey</h3>
    <p>Teal Fanatics on-ice cut. Stitched name &amp; number. Sizes S–XXXL.</p>
    <p>Ships in 5–7 business days.</p>
    <span class="sku">SJS-CELE-71-HOME</span>
  </div>
</div>

<div class="sjs-product">
  <div class="sjs-product-img">
    <span class="tag">Limited · 50 ea</span>
    <span class="price">$1,499</span>
    <span class="ph">★</span>
  </div>
  <div class="sjs-product-body">
    <h3>Signed Game-Used Stick</h3>
    <p>Sherwood Code TMP Pro from the 2025–26 season. Silver Sharpie signature, COA from the club.</p>
    <span class="sku">SJS-CELE-71-STICK-SIGNED</span>
  </div>
</div>

<div class="sjs-product">
  <div class="sjs-product-img">
    <span class="price">$44.99</span>
    <span class="ph">TEE</span>
  </div>
  <div class="sjs-product-body">
    <h3>Fan T-Shirt</h3>
    <p>Soft cotton, unisex. Sharks logo front, Celebrini #71 back. Sizes S–XXL.</p>
    <span class="sku">SJS-CELE-71-TEE</span>
  </div>
</div>

<div class="sjs-product">
  <div class="sjs-product-img">
    <span class="price">$89.99</span>
    <span class="ph">HOOD</span>
  </div>
  <div class="sjs-product-body">
    <h3>Pullover Hoodie</h3>
    <p>Heavy fleece, embroidered crest, ribbed cuffs. Sizes S–XXXL.</p>
    <span class="sku">SJS-CELE-71-HOOD</span>
  </div>
</div>

<div class="sjs-product">
  <div class="sjs-product-img">
    <span class="tag">Kids</span>
    <span class="price">$24.99</span>
    <span class="ph">MINI</span>
  </div>
  <div class="sjs-product-body">
    <h3>Mini Stick Set</h3>
    <p>Two foam mini-sticks with Sharks branding. Ages 6+. Office or rec-room ready.</p>
    <span class="sku">SJS-MINI-STICK</span>
  </div>
</div>

<div class="sjs-cta">
  <p>Ready to buy? Tap <strong>Order merch</strong> and tell us the SKU + size.</p>
</div>`;

const SCHEDULE_HTML = `${PAGE_STYLE}
<div class="sjs-hero" style="padding: 1.1rem 1.125rem 1.3rem;">
  <div class="sjs-hero-row">
    <img class="sjs-hero-logo" src="${SHARKS_LOGO}" alt="Sharks">
    <div>
      <h1 style="font-size: 1.3rem;">Schedule</h1>
      <div class="sjs-sub">Next 5 matchups · all times PT</div>
    </div>
  </div>
</div>

<div class="sjs-section-h"><h2>Home</h2><span class="bar"></span></div>
<div class="sjs-schedule">
  <div class="sjs-game">
    <div class="date"><div class="m">May</div><span class="d">15</span></div>
    <div>
      <div class="matchup">vs Vegas Golden Knights</div>
      <div class="venue">SAP Center · Thu</div>
    </div>
    <div class="time">7:30 PM</div>
  </div>
  <div class="sjs-game">
    <div class="date"><div class="m">May</div><span class="d">17</span></div>
    <div>
      <div class="matchup">vs Edmonton Oilers</div>
      <div class="venue">SAP Center · Sat</div>
    </div>
    <div class="time">7:00 PM</div>
  </div>
  <div class="sjs-game">
    <div class="date"><div class="m">May</div><span class="d">20</span></div>
    <div>
      <div class="matchup">vs Calgary Flames</div>
      <div class="venue">SAP Center · Tue</div>
    </div>
    <div class="time">7:30 PM</div>
  </div>
</div>

<div class="sjs-section-h"><h2>Away</h2><span class="bar"></span></div>
<div class="sjs-schedule">
  <div class="sjs-game">
    <div class="date" style="background:#1A1B2E;"><div class="m">May</div><span class="d">22</span></div>
    <div>
      <div class="matchup">@ Los Angeles Kings</div>
      <div class="venue">Crypto.com Arena · Thu</div>
    </div>
    <div class="time">7:30 PM</div>
  </div>
  <div class="sjs-game">
    <div class="date" style="background:#1A1B2E;"><div class="m">May</div><span class="d">24</span></div>
    <div>
      <div class="matchup">@ Anaheim Ducks</div>
      <div class="venue">Honda Center · Sat</div>
    </div>
    <div class="time">7:00 PM</div>
  </div>
</div>

<div class="sjs-cta">
  <p>Want results in your ANTON after every game? Tap <strong>Send a message</strong> and ask to opt in.</p>
</div>`;

const CAPABILITIES = [
  {
    id: 'cap-order', verb: 'order',
    title: 'Order merch',
    description: 'Place an order for Celebrini merchandise. Tell us SKU, quantity, size, and shipping address.',
    aap_endpoint: 'orders',
    inputSchema: {
      type: 'object',
      required: ['sku', 'quantity', 'size', 'shipping_address'],
      properties: {
        sku: { type: 'string', title: 'SKU', description: 'e.g. SJS-CELE-71-HOME' },
        quantity: { type: 'string', title: 'Quantity' },
        size: { type: 'string', title: 'Size' },
        shipping_address: { type: 'string', title: 'Shipping address', description: 'Street, city, state, postal code, country' },
        notes: { type: 'string', title: 'Notes (optional)' },
      },
    },
  },
  {
    id: 'cap-inquire', verb: 'inquire',
    title: 'Ask a question',
    description: 'Availability, sizing, shipping times — anything we can answer before you buy.',
    aap_endpoint: 'inquiries',
  },
  {
    id: 'cap-contact', verb: 'contact',
    title: 'Send a message',
    description: 'General fan mail or feedback for the Sharks team.',
    aap_endpoint: 'messages',
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
      displayTitle: 'San Jose Sharks · Celebrini Shop',
      category: 'commerce',
      contactHash,
      publicKey: rawHex,
      originEndpoint: ORIGIN_ENDPOINT,
    },
    identity: {
      humanContact: { available: true, displayName: 'Sharks fan-relations', languages: ['en'] },
      organisationDetails: { legalName: 'San Jose Sharks (test portal)' },
    },
    capabilities: CAPABILITIES.map((c) => ({
      id: c.id, verb: c.verb, title: c.title, description: c.description,
      aapEndpoint: c.aap_endpoint,
      ...(c.inputSchema ? { inputSchema: c.inputSchema } : {}),
      tags: ['sharks', 'celebrini', 'merch'],
    })),
    description: 'Official-style San Jose Sharks fan portal. Buy Macklin Celebrini merch, check the schedule, ask questions.',
    tags: ['sharks', 'sjs', 'hockey', 'nhl', 'celebrini', 'merch'],
    serviceAreas: ['US', 'CA'],
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

  // Insert into local Postgres
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
        PORTAL_NAME, NAMESPACE, 'commerce',
        'San Jose Sharks · Celebrini Shop',
        'Official-style Sharks fan portal with Celebrini merch.',
        'commerce',
        contactHash, rawHex, pemPriv,
        descriptorHash,
        JSON.stringify({
          capabilityVerbs: ['order', 'inquire', 'contact'],
          tags: ['sharks', 'celebrini', 'merch', 'sjs', 'hockey', 'nhl'],
          serviceAreas: ['US', 'CA'],
          languages: ['en'],
          descriptorHash,
        }),
        JSON.stringify({ source: 'e2e-portal-sharks' }),
      ],
    );
    portalId = ins.rows[0].id;

    const pages = [
      { path: '/',         title: 'Home',     html: HOME_HTML,     order: 0 },
      { path: '/merch',    title: 'Merch',    html: MERCH_HTML,    order: 1 },
      { path: '/schedule', title: 'Schedule', html: SCHEDULE_HTML, order: 2 },
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
  console.log(`  local DB    : inserted portal_id=${portalId}, 3 pages, signed descriptor cached`);

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
        legalName: 'San Jose Sharks (test)',
        idDocumentType: 'org_registration',
        idDocumentNumber: 'TEST-SJS-001',
        idDocumentCountry: 'US',
        contactEmail: 'fan-relations@sjsharks-test.example.com',
        addressCountry: 'US',
        addressCity: 'San Jose',
        addressStreet: 'SAP Center, 525 W Santa Clara St',
      },
    }),
  });
  const submitData = await submitRes.json();
  if (!submitRes.ok) { console.error('relay submit:', submitRes.status, submitData); process.exit(1); }
  console.log(`  relay submit: ${submitRes.status} → submissionId=${submitData.submissionId}`);

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
      body: JSON.stringify({ reviewerNotes: 'sharks/celebrini test portal' }),
    },
  );
  const approveData = await approveRes.json();
  if (!approveRes.ok) { console.error('approve:', approveRes.status, approveData); process.exit(1); }
  console.log(`  relay approve: 200 → portalId=${approveData.portalId}`);

  // Sanity check
  const local = await fetch(`${ORIGIN_ENDPOINT}/api/portals/visit/${encodeURIComponent(portalAddress)}/pages`);
  if (local.ok) {
    const lp = await local.json();
    console.log(`  local pages : ${(lp.pages ?? []).length} pages exposed: ${(lp.pages ?? []).map((p) => p.path).join(', ')}`);
  }

  console.log(`\n✓ Done. On the phone:`);
  console.log(`  - Open Comm App → Portals → search "sharks" or "celebrini"`);
  console.log(`  - Tap the card → Home page renders with the team intro`);
  console.log(`  - Tap "Merch" tab → catalogue of 5 items`);
  console.log(`  - Tap "Order merch" capability button → 5-field form\n`);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
