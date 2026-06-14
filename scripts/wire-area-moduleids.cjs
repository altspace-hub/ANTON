/**
 * wire-area-moduleids.cjs — insert module ids into the right AREAS.moduleIds
 * arrays in src/lib/constants.ts. Idempotent (skips ids already present in that
 * area). Operates only inside the `export const AREAS = [` block so it never
 * matches a MODULES entry.
 *
 * Usage: node scripts/wire-area-moduleids.cjs <pairsFile> [--apply]
 *   pairsFile: lines of "<area> <id>"
 *   without --apply: dry run (prints planned insertions, writes nothing)
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const CONSTANTS = path.join(REPO, 'src', 'lib', 'constants.ts');

function main() {
  const pairsFile = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!pairsFile) { console.error('usage: wire-area-moduleids.cjs <pairsFile> [--apply]'); process.exit(1); }

  const map = {}; // area -> [ids]
  for (const line of fs.readFileSync(pairsFile, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const [area, id] = t.split(/\s+/);
    if (!area || !id) continue;
    (map[area] = map[area] || []).push(id);
  }

  const raw = fs.readFileSync(CONSTANTS, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/); // clean lines (no trailing \r)
  const areasStart = lines.findIndex((l) => l.includes('export const AREAS'));
  if (areasStart < 0) { console.error('could not find AREAS declaration'); process.exit(1); }

  let totalInserted = 0;
  // Work area-by-area; re-scan each time because we mutate `lines`.
  for (const [area, ids] of Object.entries(map)) {
    const idLine = `    id: '${area}',`;
    const idIdx = lines.findIndex((l, i) => i > areasStart && l === idLine);
    if (idIdx < 0) { console.warn(`AREA NOT FOUND: ${area}`); continue; }
    // find moduleIds: after the id line
    let mi = -1;
    for (let i = idIdx; i < lines.length; i++) { if (lines[i].includes('moduleIds:')) { mi = i; break; } }
    if (mi < 0) { console.warn(`moduleIds not found for ${area}`); continue; }
    // find the closing `    ],` of the moduleIds array
    let close = -1;
    for (let i = mi; i < lines.length; i++) { if (lines[i] === '    ],') { close = i; break; } }
    if (close < 0) { console.warn(`moduleIds close not found for ${area}`); continue; }
    // existing ids in this area's slice
    const slice = lines.slice(mi, close).join('\n');
    const fresh = ids.filter((id) => !slice.includes(`'${id}'`));
    if (fresh.length === 0) { console.log(`${area}: all present (skip)`); continue; }
    const insertLines = [
      `      // Tier-C backlog (2026-06-14 audit plan):`,
      ...chunk(fresh, 2).map((c) => '      ' + c.map((id) => `'${id}'`).join(', ') + ','),
    ];
    console.log(`${area}: insert ${fresh.length} → [${fresh.join(', ')}]`);
    if (apply) {
      lines.splice(close, 0, ...insertLines);
    }
    totalInserted += fresh.length;
  }

  console.log(`\n${apply ? 'APPLIED' : 'DRY RUN'} — total ids: ${totalInserted}`);
  if (apply) {
    fs.writeFileSync(CONSTANTS, lines.join(eol));
    console.log('wrote', path.relative(REPO, CONSTANTS), `(eol=${eol === '\r\n' ? 'CRLF' : 'LF'})`);
  }
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

main();
