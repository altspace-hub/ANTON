#!/usr/bin/env node
/**
 * build-all.mjs — Batch builder for ANTON regulatory knowledge packs
 *
 * Scans all subdirectories of data/knowledge-packs/ for packs with a
 * manifest.json. Builds any pack whose .anton bundle is missing or older
 * than any of its source JSON files.
 *
 * Usage:
 *   node data/knowledge-packs/build-all.mjs           # build stale/missing only
 *   node data/knowledge-packs/build-all.mjs --force   # rebuild all packs
 */

import { readdir, stat, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import AdmZip from 'adm-zip';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKS_DIR = __dirname;
const BUILD_SCRIPT = join(PACKS_DIR, 'build-pack.mjs');
const FORCE = process.argv.includes('--force');

async function getModTime(filePath) {
  try {
    const s = await stat(filePath);
    return s.mtimeMs;
  } catch {
    return 0;
  }
}

/** Fields build-pack.mjs injects; they differ on every build and mean nothing. */
const ENVELOPE_FIELDS = ['format_version', 'created_at', 'generator'];

/**
 * A bundle is stale when its contents disagree with the JSON beside it.
 *
 * This used to compare mtimes, which git does not preserve. That is wrong in
 * both directions: a fresh clone looks uniformly up to date, and a checkout
 * looks uniformly stale. The second is merely wasteful — it once rebuilt 20
 * unchanged bundles, changing nothing but a timestamp inside each zip. The
 * first is the one that costs something: installBundledPack reads the bundle,
 * not the JSON, so a bundle left behind by an edit ships the old data and
 * nothing says so.
 */
async function isStale(slug) {
  const packDir = join(PACKS_DIR, slug);
  const antonPath = join(packDir, `${slug}.anton`);
  if (!existsSync(antonPath)) return true;

  let bundled;
  try {
    const zip = new AdmZip(antonPath);
    bundled = {};
    for (const entry of zip.getEntries()) {
      bundled[entry.entryName] = JSON.parse(zip.readAsText(entry));
    }
  } catch {
    return true; // unreadable or not a zip — rebuild it
  }

  for (const file of ['manifest.json', 'entities.json', 'relationships.json', 'aliases.json']) {
    const filePath = join(packDir, file);
    const present = existsSync(filePath);
    let inBundle = bundled[file];
    if (!present) {
      if (inBundle !== undefined) return true; // file removed since the build
      continue;
    }
    if (inBundle === undefined) return true;   // file added since the build
    const onDisk = JSON.parse(await readFile(filePath, 'utf8'));
    if (file === 'manifest.json') {
      inBundle = { ...inBundle };
      for (const k of ENVELOPE_FIELDS) delete inBundle[k];
    }
    if (JSON.stringify(inBundle) !== JSON.stringify(onDisk)) return true;
  }
  return false;
}

async function buildPack(slug) {
  console.log(`\nBuilding: ${slug}`);
  try {
    const { stdout, stderr } = await execFileAsync('node', [BUILD_SCRIPT, slug]);
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    return true;
  } catch (err) {
    console.error(`  ERROR building ${slug}:`, err.message);
    return false;
  }
}

async function main() {
  const entries = await readdir(PACKS_DIR, { withFileTypes: true });
  const packs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const manifestPath = join(PACKS_DIR, slug, 'manifest.json');
    const manifestMtime = await getModTime(manifestPath);
    if (manifestMtime === 0) continue; // no manifest — skip

    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (manifest.bundle_type !== 'regulatory-knowledge-pack') continue;
      packs.push(slug);
    } catch {
      console.warn(`  Skipping ${slug} — invalid manifest.json`);
    }
  }

  if (packs.length === 0) {
    console.log('No regulatory knowledge packs found.');
    return;
  }

  console.log(`Found ${packs.length} pack(s): ${packs.join(', ')}`);

  let built = 0;
  let skipped = 0;
  let failed = 0;

  for (const slug of packs) {
    const stale = FORCE || await isStale(slug);
    if (!stale) {
      console.log(`  Skipping ${slug} — up to date`);
      skipped++;
      continue;
    }
    const ok = await buildPack(slug);
    if (ok) built++;
    else failed++;
  }

  console.log(`\nDone. Built: ${built} | Skipped: ${skipped} | Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
