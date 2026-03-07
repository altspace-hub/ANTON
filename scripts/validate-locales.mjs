/**
 * validate-locales.mjs
 * LONE-20: Validates that all locale files in public/locales/ have the same
 * top-level keys as the reference locale (en.json).
 *
 * Usage:  node scripts/validate-locales.mjs
 * Exit:   0 = all good, 1 = missing or extra keys found
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(__dirname, '../public/locales');
const REFERENCE_LOCALE = 'en.json';
// School-specific locales have a different key set — skip them
const SKIP_LOCALES = new Set(['en-school.json', 'ar-school.json']);

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

const refPath = resolve(LOCALES_DIR, REFERENCE_LOCALE);
const refContent = JSON.parse(readFileSync(refPath, 'utf-8'));
const refKeys = new Set(flattenKeys(refContent));
console.log(`Reference: ${REFERENCE_LOCALE} — ${refKeys.size} keys`);

const allFiles = readdirSync(LOCALES_DIR)
  .filter(f => f.endsWith('.json') && f !== REFERENCE_LOCALE && !SKIP_LOCALES.has(f))
  .sort();

let hasErrors = false;
const report = [];

for (const file of allFiles) {
  try {
    const content = JSON.parse(readFileSync(resolve(LOCALES_DIR, file), 'utf-8'));
    const fileKeys = new Set(flattenKeys(content));

    const missing = [...refKeys].filter(k => !fileKeys.has(k));
    const extra = [...fileKeys].filter(k => !refKeys.has(k));

    if (missing.length > 0 || extra.length > 0) {
      hasErrors = true;
      report.push({ file, missing: missing.length, extra: extra.length, missingKeys: missing.slice(0, 5), extraKeys: extra.slice(0, 5) });
    }
  } catch (e) {
    hasErrors = true;
    report.push({ file, error: e.message });
  }
}

if (report.length === 0) {
  console.log(`✓ All ${allFiles.length} locale files are consistent with ${REFERENCE_LOCALE}`);
} else {
  console.log(`\nLocale validation issues found:\n`);
  for (const item of report) {
    if (item.error) {
      console.log(`  ✗ ${item.file}: PARSE ERROR — ${item.error}`);
    } else {
      console.log(`  ✗ ${item.file}:`);
      if (item.missing > 0) console.log(`      Missing (${item.missing}): ${item.missingKeys.join(', ')}${item.missing > 5 ? '...' : ''}`);
      if (item.extra > 0) console.log(`      Extra   (${item.extra}): ${item.extraKeys.join(', ')}${item.extra > 5 ? '...' : ''}`);
    }
  }
  console.log(`\n${report.length} locale file(s) have inconsistencies.`);
}

process.exit(hasErrors ? 1 : 0);
