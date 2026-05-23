#!/usr/bin/env node
/**
 * fetch-government-docs.cjs — download the Open Government Licence /
 * Crown Copyright documents in the UK ECCTA test corpus to docs/.
 *
 * Run once after cloning the repo. Idempotent: skips files already present.
 * Reads `sources.json` and pulls every entry with auto_fetchable=true.
 *
 *   node data/test-corpus/uk-eccta/scripts/fetch-government-docs.cjs
 *
 * The remaining (corporate) documents must be downloaded manually by the
 * user from the URLs in sources.json — they're publicly available but
 * not redistribution-licensed.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = path.join(ROOT, 'sources.json');
const DOCS = path.join(ROOT, 'docs');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function download(url, target) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(target);
    const req = https.get(url, { headers: { 'User-Agent': 'ANTON-test-corpus/1.0' } }, (res) => {
      // Follow redirects.
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(target);
        const next = new URL(res.headers.location, url).toString();
        return download(next, target).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(target);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
    req.on('error', (err) => {
      file.close();
      try { fs.unlinkSync(target); } catch { /* ignore */ }
      reject(err);
    });
  });
}

async function main() {
  ensureDir(DOCS);
  const sources = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
  const fetchable = sources.documents.filter((d) => d.auto_fetchable);
  console.log(`[uk-eccta] ${fetchable.length} OGL documents to fetch (of ${sources.documents.length} total).`);

  let ok = 0, skipped = 0, failed = 0;
  for (const doc of fetchable) {
    // Infer extension from URL; default .pdf
    const urlExt = (doc.url.match(/\.([a-z0-9]{2,4})(?:\?|$)/i) || [null, 'pdf'])[1].toLowerCase();
    const filename = `${doc.id}.${urlExt}`;
    const target = path.join(DOCS, filename);
    if (fs.existsSync(target)) {
      console.log(`  ✓ ${filename} (already present — skipping)`);
      skipped++;
      continue;
    }
    process.stdout.write(`  · ${filename} … `);
    try {
      await download(doc.url, target);
      const bytes = fs.statSync(target).size;
      console.log(`done (${(bytes / 1024).toFixed(0)} kB)`);
      ok++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n[uk-eccta] ${ok} downloaded, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;

  // List documents NOT auto-fetchable so the user knows what's left to do.
  const manual = sources.documents.filter((d) => !d.auto_fetchable);
  if (manual.length > 0) {
    console.log(`\n[uk-eccta] ${manual.length} documents must be downloaded manually:`);
    for (const doc of manual) {
      console.log(`  · ${doc.id} — ${doc.title}`);
      console.log(`      ${doc.url}`);
    }
    console.log(`\nSave them in docs/ named <id>.pdf (or matching the URL extension).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
