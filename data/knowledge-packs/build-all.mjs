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

async function isStale(slug) {
  const packDir = join(PACKS_DIR, slug);
  const antonPath = join(packDir, `${slug}.anton`);
  const antonMtime = await getModTime(antonPath);
  if (antonMtime === 0) return true; // missing

  const sourceFiles = ['manifest.json', 'entities.json', 'relationships.json', 'aliases.json'];
  for (const file of sourceFiles) {
    const mtime = await getModTime(join(packDir, file));
    if (mtime > antonMtime) return true; // source newer than bundle
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
