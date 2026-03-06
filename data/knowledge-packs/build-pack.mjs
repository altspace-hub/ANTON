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

const zip = new AdmZip();
const files = ['manifest.json', 'entities.json', 'relationships.json', 'aliases.json'];
let found = 0;
for (const file of files) {
  const filePath = path.join(packDir, file);
  if (fs.existsSync(filePath)) {
    zip.addLocalFile(filePath);
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
