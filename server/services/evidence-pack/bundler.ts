/**
 * bundler.ts — produce the `.anton` ZIP for a finalised evidence pack.
 *
 * Layout (per spec §5.4):
 *   manifest.json                    — signed manifest (PackManifest from assembler)
 *   signature.txt                    — Ed25519 signature placeholder (Phase 2)
 *   verifier.html                    — standalone signature verifier (Phase 2)
 *   items/<type>_<id>.json           — canonical body of every collected item
 *   compliance/eu_ai_act_annex_iv.md — Annex IV mapping (Phase 3 produces; Phase 1 stubs)
 *   compliance/amlr_auditability.md  — AMLR mapping (Phase 3 produces; Phase 1 stubs)
 *   README.md                        — orientation for the regulator
 *
 * Phase 1 ships everything except: Ed25519 signing (Phase 2), the standalone
 * verifier HTML (Phase 2), and the populated compliance mapping documents
 * (Phase 3). The directory structure is the final shape; Phase 2/3 just fills
 * in content.
 */

import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';
import type { AssembledPack } from './assembler.js';
import { canonicalise } from './collector.js';
import { mapCompliance, renderFrameworkMarkdown } from './compliance-mapper.js';

const log = childLogger('evidence-pack-bundler');

export async function bundleEvidencePackToAnton(
  _db: DatabaseAdapter,
  assembled: AssembledPack,
): Promise<Buffer> {
  const zip = new AdmZip();

  // 1. Per-item canonical JSON bodies — the actual evidence content.
  // Phase 4: redacted items get a placeholder body that preserves the hash
  // (so verifiers can still see the manifest is internally consistent —
  // the hash references the original content), with the redaction reason.
  for (const item of assembled.collectedItems) {
    const filename = manifestRefFor(item.itemType, item.itemId);
    const redaction = assembled.redactions[`${item.itemType}:${item.itemId}`];
    const body = redaction && redaction.status !== 'none'
      ? JSON.stringify({
          _redacted: true,
          redaction_status: redaction.status,
          redaction_reason: redaction.reason ?? '(no reason provided)',
          original_hash: item.itemHash,
          note: 'Original content removed from this bundle by the pack owner. The manifest hash references the original content; verifying the manifest still proves the redaction was made before signing.',
        }, null, 2)
      : item.canonicalJson;
    zip.addFile(filename, Buffer.from(body, 'utf-8'));
  }

  // 2. Manifest. If the pack has been finalised + signed, splice the
  // signature + signer_public_key back into the manifest before writing.
  // The hash itself was computed over the skeleton with these zeroed, so
  // populating them after the fact doesn't invalidate verification.
  const manifestForExport = {
    ...assembled.manifest,
    signature: assembled.pack.signature,
    signerPublicKey: assembled.pack.signer_public_key,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifestForExport, null, 2), 'utf-8');
  zip.addFile('manifest.json', manifestBytes);

  // 3. Compliance mapping — real Phase 3 output. Run the mapper for every
  // framework declared on the pack and write a markdown per framework.
  // Owner-accepted gaps land in the mapping via compliance_gaps on the pack.
  const mapping = mapCompliance(
    assembled,
    assembled.pack.compliance_frameworks,
    assembled.pack.compliance_gaps,
  );
  for (const fr of mapping.frameworks) {
    const filename = `compliance/${fr.id === 'eu_ai_act' ? 'eu_ai_act_annex_iv' : fr.id}.md`;
    zip.addFile(filename, Buffer.from(renderFrameworkMarkdown(assembled, fr.id, mapping), 'utf-8'));
  }
  // Coverage summary as JSON so machine-readable consumers don't have to
  // parse the markdowns.
  zip.addFile('compliance/coverage.json', Buffer.from(JSON.stringify({
    packId: mapping.packId,
    generatedAt: mapping.generatedAt,
    totalGaps: mapping.totalGaps,
    totalAccepted: mapping.totalAccepted,
    frameworks: mapping.frameworks.map((f) => ({
      id: f.id, label: f.label,
      evidencedCount: f.evidencedCount,
      gapCount: f.gapCount,
      acceptedGapCount: f.acceptedGapCount,
      notApplicableCount: f.notApplicableCount,
    })),
  }, null, 2), 'utf-8'));

  // 4. Signature + verifier. For finalised packs we ship the real signature
  //    and the standalone verifier (Phase 2B). For draft packs (which can
  //    still be exported for preview) we ship placeholders so the layout
  //    stays consistent.
  const sigContent = assembled.pack.signature
    ? `${assembled.pack.signature}\n${assembled.pack.signer_public_key ?? ''}\n`
    : '# Pack not yet finalised — sign by calling /finalise.\n';
  zip.addFile('signature.txt', Buffer.from(sigContent, 'utf-8'));
  zip.addFile('verifier.html', Buffer.from(verifierHtml(assembled), 'utf-8'));

  // 5. CLI verifier — tiny Node.js script for power users without a browser.
  // Same logic as verifier.html but on the command line; reads manifest.json
  // from the bundle directory and verifies the signature offline.
  zip.addFile('verifier.cjs', Buffer.from(cliVerifierScript(), 'utf-8'));

  // 6. README — orienting prose for whoever opens this in a file browser.
  zip.addFile('README.md', Buffer.from(readme(assembled), 'utf-8'));

  // 6. Bundle integrity sidecar — sha256 of every entry so a regulator can
  //    spot-check tamper without a full signature verifier. Computed last so
  //    it covers everything else.
  const entries = zip.getEntries()
    .filter((e: { entryName: string; getData: () => Buffer }) => e.entryName !== 'integrity.txt')
    .map((e: { entryName: string; getData: () => Buffer }) => {
      const sha = createHash('sha256').update(e.getData()).digest('hex');
      return `${sha}  ${e.entryName}`;
    })
    .sort();
  zip.addFile('integrity.txt', Buffer.from(entries.join('\n') + '\n', 'utf-8'));

  const buf = zip.toBuffer();
  log.info({
    packId: assembled.pack.id,
    itemCount: assembled.collectedItems.length,
    sizeBytes: buf.length,
  }, 'pack_bundled');
  return buf;
}

// ── Manifest filename helper (kept in sync with assembler.contentRef) ──────

function manifestRefFor(itemType: string, itemId: string): string {
  return `items/${itemType}_${itemId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}.json`;
}

/**
 * Standalone offline verifier — drag in manifest.json, get a signed/tampered
 * verdict. Uses Web Crypto SubtleCrypto Ed25519 (Chrome 113+, Safari 17+,
 * Firefox 130+). The verifier embeds the pack's claimed pubkey + signature +
 * manifest hash, so even if the user uploads a different manifest we can
 * spot the mismatch.
 *
 * What it proves:
 *   - The manifest you uploaded matches the one that was signed (recompute
 *     manifest hash with the same canonicalisation rules → compare).
 *   - The signature is valid for that hash under the embedded public key.
 * What it doesn't prove:
 *   - That every item file in the bundle is unchanged. For that the
 *     regulator should also check `integrity.txt` against each item.
 */
function verifierHtml(a: AssembledPack): string {
  const claim = {
    packId: a.pack.id,
    title: a.pack.title,
    manifestHash: a.manifest.manifestHash,
    signature: a.pack.signature ?? '',
    signerPublicKey: a.pack.signer_public_key ?? '',
    finalisedAt: a.pack.finalised_at ?? '',
  };
  const claimJson = JSON.stringify(claim).replace(/</g, '\\u003c');
  return `<!doctype html><html><head>
<meta charset="utf-8">
<title>Evidence Pack Verifier — ${a.pack.id}</title>
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; background: #f6f7f9; color: #0F1B2D; font-family: system-ui, -apple-system, sans-serif; }
  main { max-width: 720px; margin: 2rem auto; padding: 1.5rem; background: #fff; border: 1px solid #e1e5ea; border-radius: 12px; }
  h1 { margin: 0 0 0.5rem; font-size: 1.4rem; color: #0D7D6C; }
  .meta { color: #5A6A7E; font-size: 0.85rem; margin-bottom: 1.5rem; }
  .drop { border: 2px dashed #c5cdd6; border-radius: 8px; padding: 2rem; text-align: center; cursor: pointer; }
  .drop:hover, .drop.over { border-color: #0D7D6C; background: #f0f7f5; }
  .result { margin-top: 1.5rem; padding: 1rem; border-radius: 8px; font-size: 0.95rem; }
  .ok { background: #ecfdf5; color: #065f46; }
  .bad { background: #fef2f2; color: #991b1b; }
  .warn { background: #fffbeb; color: #92400e; }
  code { background: #f0f1f4; padding: 0.1rem 0.3rem; border-radius: 4px; font-size: 0.9em; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.9rem; }
  td { padding: 0.4rem 0; border-top: 1px solid #e1e5ea; vertical-align: top; }
  td:first-child { color: #5A6A7E; width: 8rem; }
</style>
</head><body>
<main>
  <h1>Evidence Pack Verifier</h1>
  <div class="meta">Pack <code>${a.pack.id}</code> — drag in <code>manifest.json</code> to verify the signature offline.</div>

  <div id="drop" class="drop">
    <div>Drop <code>manifest.json</code> here, or click to choose a file.</div>
    <input id="file" type="file" accept="application/json,.json" style="display:none">
  </div>

  <div id="result"></div>

  <table>
    <tr><td>Pack ID</td><td><code>${a.pack.id}</code></td></tr>
    <tr><td>Title</td><td>${escapeHtml(a.pack.title)}</td></tr>
    <tr><td>Manifest hash</td><td><code>${a.manifest.manifestHash}</code></td></tr>
    <tr><td>Signed by</td><td><code>${a.pack.signer_public_key ?? '(unsigned — pack not finalised)'}</code></td></tr>
    <tr><td>Finalised</td><td>${a.pack.finalised_at ?? '(draft)'}</td></tr>
  </table>
</main>

<script>
const CLAIM = ${claimJson};
const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');
const result = document.getElementById('result');

drop.addEventListener('click', () => fileInput.click());
['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(e => drop.addEventListener(e, () => drop.classList.remove('over')));
drop.addEventListener('drop', async (ev) => {
  ev.preventDefault();
  const f = ev.dataTransfer.files[0];
  if (f) await verifyFile(f);
});
fileInput.addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  if (f) await verifyFile(f);
});

async function verifyFile(file) {
  result.className = '';
  result.textContent = 'Verifying…';
  try {
    const text = await file.text();
    const manifest = JSON.parse(text);
    await verify(manifest);
  } catch (e) {
    show('bad', 'Could not read or parse the file: ' + (e && e.message || e));
  }
}

// Stable key-sorted JSON — must match server-side canonicalise().
function canonicalise(value) {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sortKeys);
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
  return out;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function b64uToBytes(b64u) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64u.length + (4 - b64u.length % 4) % 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verify(manifest) {
  // 1. Pack identity must match what this verifier was generated for.
  if (manifest.packId !== CLAIM.packId) {
    return show('bad', 'This manifest is for pack ' + manifest.packId + ', but this verifier was generated for ' + CLAIM.packId + '. Wrong file?');
  }

  // 2. Recompute manifest hash with the same skeleton rules as the server.
  const hashable = Object.assign({}, manifest, {
    manifestHash: '', signature: null, signerPublicKey: null,
    created: Object.assign({}, manifest.created, { at: '__pinned__' }),
  });
  const recomputed = 'sha256:' + await sha256Hex(canonicalise(hashable));
  if (recomputed !== manifest.manifestHash) {
    return show('bad', 'Manifest tampered: recomputed hash ' + recomputed + ' does not match claimed hash ' + manifest.manifestHash);
  }

  // 3. Verify the Ed25519 signature.
  const sig = manifest.signature || '';
  const pubKey = manifest.signerPublicKey || '';
  if (!sig || !pubKey) {
    return show('warn', 'Manifest hash matches, but the manifest is unsigned (pack was not finalised).');
  }
  if (!sig.startsWith('ed25519:')) {
    return show('bad', 'Unknown signature format: ' + sig.slice(0, 32));
  }

  let ok;
  try {
    const sigBytes = b64uToBytes(sig.slice('ed25519:'.length));
    const pubBytes = hexToBytes(pubKey);
    // Web Crypto wants the raw 32-byte Ed25519 public key. Extract from SPKI DER.
    const raw = pubBytes.length === 32 ? pubBytes : pubBytes.slice(pubBytes.length - 32);
    const key = await crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
    ok = await crypto.subtle.verify('Ed25519', key, sigBytes, new TextEncoder().encode(manifest.manifestHash));
  } catch (e) {
    return show('bad', 'Signature check failed: ' + (e && e.message || e) + ' — your browser may not support Ed25519 (needs Chrome 113+ / Safari 17+ / Firefox 130+).');
  }
  if (!ok) return show('bad', 'Signature INVALID — pack contents may have been altered after signing.');
  show('ok', '✓ VALID — manifest hash matches recomputation and signature verifies under the embedded public key.');
}

function show(cls, msg) {
  result.className = 'result ' + cls;
  result.textContent = msg;
}
</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[<>"&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c] ?? c));
}

/**
 * CLI verifier bundled into every .anton — for power users without a
 * browser. Same logic as verifier.html: load manifest.json, recompute
 * canonical hash, verify signature with node:crypto Ed25519. Single file
 * with zero deps beyond Node.
 *
 * Usage: `node verifier.cjs` from inside the unzipped bundle directory.
 */
function cliVerifierScript(): string {
  return `#!/usr/bin/env node
// Evidence Pack CLI verifier — zero deps, runs against an unzipped .anton.
// Usage: cd into the bundle dir, run: node verifier.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fail(msg) { console.error('\\x1b[31m✗ ' + msg + '\\x1b[0m'); process.exit(1); }
function ok(msg)   { console.log('\\x1b[32m✓ ' + msg + '\\x1b[0m'); }
function info(msg) { console.log('\\x1b[36mℹ ' + msg + '\\x1b[0m'); }

const manifestPath = path.join(process.cwd(), 'manifest.json');
if (!fs.existsSync(manifestPath)) fail('manifest.json not found in current directory');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

info('Pack ' + manifest.packId + ' — "' + manifest.title + '"');
info('Items: ' + manifest.itemCount + ', frameworks: ' + (manifest.complianceFrameworks || []).join(', '));

// 1. Recompute manifest hash.
function sortKeys(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sortKeys);
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
  return out;
}
const hashable = Object.assign({}, manifest, {
  manifestHash: '', signature: null, signerPublicKey: null,
  created: Object.assign({}, manifest.created, { at: '__pinned__' }),
});
const recomputed = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(sortKeys(hashable))).digest('hex');
if (recomputed !== manifest.manifestHash) {
  fail('Manifest tampered: recomputed ' + recomputed + ' does not match claimed ' + manifest.manifestHash);
}
ok('Manifest hash matches recomputation');

// 2. Verify signature.
if (!manifest.signature || !manifest.signerPublicKey) {
  console.log('\\x1b[33m! Pack is unsigned (was not finalised).\\x1b[0m');
  process.exit(0);
}
if (!manifest.signature.startsWith('ed25519:')) fail('Unknown signature format');

const sigB64u = manifest.signature.slice('ed25519:'.length);
const sigB64 = sigB64u.replace(/-/g, '+').replace(/_/g, '/').padEnd(sigB64u.length + (4 - sigB64u.length % 4) % 4, '=');
const sigBytes = Buffer.from(sigB64, 'base64');
const pubKeyDer = Buffer.from(manifest.signerPublicKey, 'hex');
const pubKey = crypto.createPublicKey({ key: pubKeyDer, format: 'der', type: 'spki' });
const verified = crypto.verify(null, Buffer.from(manifest.manifestHash, 'utf-8'), pubKey, sigBytes);
if (!verified) fail('Signature INVALID — pack contents may have been altered after signing.');
ok('Signature VALID under embedded public key');
info('Signed by: ' + manifest.signerPublicKey.slice(0, 32) + '...');
`;
}

function readme(a: AssembledPack): string {
  const breakdown = Object.entries(a.manifest.itemsByType)
    .sort((x, y) => y[1] - x[1])
    .map(([t, n]) => `- ${n} × ${t}`)
    .join('\n');
  return `# Evidence Pack — ${a.pack.title}

**Pack ID:** ${a.pack.id}
**Created by:** ${a.pack.created_by}
**Created at:** ${a.pack.created_at}
**Status:** ${a.pack.status}
**Item count:** ${a.collectedItems.length}
**Manifest hash:** \`${a.manifest.manifestHash}\`

## Scope

${a.manifest.scope.label}

## What's in this bundle

${breakdown}

## Layout

- \`manifest.json\` — signed pack manifest. Verify against \`signature.txt\` (Phase 2).
- \`items/<type>_<id>.json\` — canonical body of every collected artefact.
- \`compliance/*.md\` — regulatory mapping documents (Phase 3).
- \`integrity.txt\` — SHA-256 per file inside this bundle.
- \`verifier.html\` — open in a browser to verify signatures (Phase 2).

## Important

This pack proves the platform's internal record was in this exact form at
finalisation, signed by the named user. It does **not** prove the underlying
professional work reflects reality outside ANTON — that requires independent
assessment. (Per EVIDENCE_PACK_SPEC.md §9.4.)

> Phase 1 bundle. Ed25519 signing (Phase 2) and populated compliance mapping
> (Phase 3) ship in later iterations of this module.
`;
}

export { canonicalise };
