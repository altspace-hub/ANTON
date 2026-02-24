/**
 * Migration script: adds "formatVersion": "1.0" to all module.json and area.json files
 * that don't already have it.
 *
 * Usage: npx tsx server/scripts/add-format-version.ts
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AREAS_DIR = join(__dirname, '..', 'areas');

function findJsonFiles(dir: string, targetName: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findJsonFiles(fullPath, targetName));
      } else if (entry.name === targetName) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return results;
}

function addFormatVersion(filePath: string): boolean {
  try {
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (content.formatVersion) return false; // Already has it

    const updated = { formatVersion: '1.0', ...content };
    writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n');
    return true;
  } catch (e) {
    console.error(`  Failed: ${filePath} — ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

// Run
console.log('Scanning for module.json and area.json files...\n');

const moduleFiles = findJsonFiles(AREAS_DIR, 'module.json');
const areaFiles = findJsonFiles(AREAS_DIR, 'area.json');
const allFiles = [...moduleFiles, ...areaFiles];

let updated = 0;
let skipped = 0;

for (const file of allFiles) {
  if (addFormatVersion(file)) {
    console.log(`  Updated: ${file}`);
    updated++;
  } else {
    skipped++;
  }
}

console.log(`\nDone. Updated: ${updated}, Skipped (already had formatVersion): ${skipped}, Total: ${allFiles.length}`);
