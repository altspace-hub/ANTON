/**
 * build-pack.mjs — build an .anton regulatory-knowledge-pack bundle
 * Usage: node data/knowledge-packs/build-pack.mjs amlr-2024
 */
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packName = process.argv[2];
if (!packName) { console.error('Usage: node build-pack.mjs <pack-dir>'); process.exit(1); }

const packDir = path.join(__dirname, packName);
if (!fs.existsSync(packDir)) { console.error(`Pack directory not found: ${packDir}`); process.exit(1); }

// The manifest declares how many entities, relationships and aliases the pack
// holds. Nothing recomputes those numbers at import — the importer counts rows
// as it inserts them — so a wrong figure is never contradicted by anything and
// simply stands. Two packs shipped for months declaring counts they had never
// had: amlr-2024 said 132 entities against 134, and uk-fca-aml said 48
// relationships against 29.
//
// This refuses to build rather than quietly rewriting the number, because a
// mismatch means either the manifest is stale or a payload file lost rows, and
// only the author knows which. Silently "correcting" it would hide the second
// case, which is the one that matters.
const COUNTED = [
  ['entity_count', 'entities.json'],
  ['relationship_count', 'relationships.json'],
  ['alias_entry_count', 'aliases.json'],
];
{
  const manifestPath = path.join(packDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const declared = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const wrong = [];
    for (const [key, file] of COUNTED) {
      if (!(key in declared)) continue;
      const filePath = path.join(packDir, file);
      const actual = fs.existsSync(filePath)
        ? JSON.parse(fs.readFileSync(filePath, 'utf-8')).length
        : 0;
      if (declared[key] !== actual) {
        wrong.push(`  ${key}: manifest says ${declared[key]}, ${file} holds ${actual}`);
      }
    }
    if (wrong.length > 0) {
      console.error(`Manifest counts do not match the payload for '${packName}':`);
      console.error(wrong.join('\n'));
      console.error('\nFix whichever side is wrong, then rebuild. Do not just edit the number');
      console.error('to match — check first that the payload file has not lost rows.');
      process.exit(1);
    }
  }
}

const zip = new AdmZip();
const files = ['manifest.json', 'entities.json', 'relationships.json', 'aliases.json'];
let found = 0;
for (const file of files) {
  const filePath = path.join(packDir, file);
  if (fs.existsSync(filePath)) {
    if (file === 'manifest.json') {
      // Inject the standard spec-envelope fields (format_version, created_at,
      // generator — see docs/anton-format/README.md) alongside the authored
      // pack manifest. The knowledge-pack importer reads named fields only,
      // so this is purely additive; the authored source file is untouched.
      const authored = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const generator = (() => {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));
          return `${pkg.name ?? 'openexpert'}/${pkg.version ?? '0.0.0'}`;
        } catch { return 'openexpert/0.0.0'; }
      })();
      const enveloped = {
        format_version: '1.0.0',
        created_at: new Date().toISOString(),
        generator,
        ...authored,
      };
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(enveloped, null, 2), 'utf-8'));
    } else {
      zip.addLocalFile(filePath);
    }
    found++;
    console.log(`  + ${file}`);
  } else {
    console.warn(`  ! Missing (optional): ${file}`);
  }
}
if (found === 0) { console.error('No pack files found.'); process.exit(1); }

const outPath = path.join(packDir, `${packName}.anton`);
zip.writeZip(outPath);
console.log(`\nBuilt: ${outPath}`);
