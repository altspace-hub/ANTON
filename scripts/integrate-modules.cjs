/**
 * integrate-modules.cjs — write net-new ANTON modules from a workflow spec array.
 *
 * Usage: node scripts/integrate-modules.cjs <specsJsonPath> <PATCH_VAR> <patchOutPath>
 *
 * For each spec it writes:
 *   server/areas/<area>/modules/<id>/module.json
 *   server/areas/<area>/modules/<id>/system-prompt.md
 * and emits a patch file (src/lib/area-patches/<patchOutPath>) exporting
 *   export const <PATCH_VAR>: ModuleDefinition[] = [ ...light entries... ]
 * Finally prints the area→ids wiring map for constants.ts AREAS edits.
 *
 * It validates outputFormats / contentType against the allowed sets and skips
 * any id that already exists on disk (never overwrites).
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
// Read the format ids from the ONE source of truth rather than a hand-kept copy.
// The previous hard-coded list held 23 of the repo's 46 formats and `cleanFormats`
// SILENTLY dropped anything missing from it — `step-by-step-guide`, `field-guide`,
// `plain-language-guide`, `screenplay` and 19 others. A module authored with this
// script would have lost its output format without a word. (2026-09-18)
const VALID_FORMATS = (() => {
  const src = fs.readFileSync(path.join(REPO, 'src/lib/output-format-definitions.ts'), 'utf8');
  const ids = new Set();
  for (const m of src.matchAll(/^\s{4}id: '([a-z0-9-]+)'/gm)) ids.add(m[1]);
  if (ids.size < 30) throw new Error(`integrate-modules: only parsed ${ids.size} output formats — the parser has drifted from output-format-definitions.ts`);
  return ids;
})();
const VALID_CONTENT = new Set(['gap_analysis','risk_register','process_map','policy_document','analytic_report','plan_document','entity_register','scorecard']);
const VALID_THINKING = new Set(['quick','think','think_hard','investigate','plan_first','deep_investigate']);
const VALID_CREATIVITY = new Set(['strict','balanced','creative']);
const VALID_COLORS = new Set(['adv-teal','adv-blue','adv-gold','adv-red','adv-green']);

const thinkOf = (s) => VALID_THINKING.has(s.thinking) ? s.thinking : 'investigate';
const creatOf = (s) => VALID_CREATIVITY.has(s.creativity) ? s.creativity : 'strict';
const colorOf = (s) => VALID_COLORS.has(s.color) ? s.color : 'adv-teal';

function loadSpecs(p) {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (raw.result && Array.isArray(raw.result.specs)) return raw.result.specs;
  if (Array.isArray(raw.specs)) return raw.specs;
  throw new Error('could not find specs array in ' + p);
}

function cleanFormats(fmts, id) {
  const given = fmts || [];
  const bad = given.filter((f) => !VALID_FORMATS.has(f));
  // Fail loudly. Silently discarding a format the author chose is how a module ends up
  // emitting a consultant briefing when its author asked for a field guide.
  if (bad.length) {
    throw new Error(`integrate-modules: module '${id}' names output format(s) that do not exist: ${bad.join(', ')}`);
  }
  return given.length ? Array.from(new Set(given)) : ['executive-summary', 'action-plan'];
}

function buildModuleJson(s) {
  return {
    formatVersion: '1.0',
    id: s.id,
    label: s.label,
    shortLabel: s.shortLabel,
    icon: s.icon || 'Sparkles',
    description: s.description,
    color: colorOf(s),
    defaults: {
      thinking: thinkOf(s),
      creativity: creatOf(s),
      outputFormats: cleanFormats(s.outputFormats, s.id),
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: s.knowledgeDescription || '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
    guidedInputs: s.guidedInputs || [],
    exampleInput: s.exampleInput || '',
    exampleValues: s.exampleValues || {},
    recommendedPersonas: s.recommendedPersonas || [],
    tags: s.tags || [],
    contentType: VALID_CONTENT.has(s.contentType) ? s.contentType : 'analytic_report',
  };
}

function buildPatchEntry(s) {
  // Light ModuleDefinition for src/lib/constants.ts (via the patch file).
  return {
    id: s.id,
    label: s.label,
    shortLabel: s.shortLabel,
    icon: s.icon || 'Sparkles',
    description: s.description,
    color: colorOf(s),
    defaults: {
      thinking: thinkOf(s),
      creativity: creatOf(s),
      outputFormats: cleanFormats(s.outputFormats, s.id),
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  };
}

function main() {
  const [specsPath, patchVar, patchOut] = process.argv.slice(2);
  if (!specsPath || !patchVar || !patchOut) {
    console.error('usage: integrate-modules.cjs <specsJsonPath> <PATCH_VAR> <patchOutPath>');
    process.exit(1);
  }
  const specs = loadSpecs(specsPath);
  const wiring = {};   // area -> [ids]
  const patchEntries = [];
  let written = 0, skipped = 0;

  for (const s of specs) {
    if (!s || !s.id || !s.area) { console.warn('skip malformed spec'); continue; }
    const modDir = path.join(REPO, 'server', 'areas', s.area, 'modules', s.id);
    if (fs.existsSync(path.join(modDir, 'module.json'))) {
      console.warn('SKIP existing on disk:', s.area + '/' + s.id);
      skipped++;
      continue;
    }
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(path.join(modDir, 'module.json'), JSON.stringify(buildModuleJson(s), null, 2) + '\n');
    const prompt = (s.systemPrompt || '').trim();
    fs.writeFileSync(path.join(modDir, 'system-prompt.md'), prompt + '\n');
    console.log('WROTE', s.area + '/' + s.id, '| prompt lines=' + prompt.split('\n').length, '| inputs=' + (s.guidedInputs || []).length);
    (wiring[s.area] = wiring[s.area] || []).push(s.id);
    patchEntries.push(buildPatchEntry(s));
    written++;
  }

  // Emit the patch TS file.
  const patchPath = path.join(REPO, 'src', 'lib', 'area-patches', patchOut);
  const banner = '// AUTO-GENERATED by scripts/integrate-modules.cjs — net-new modules from the\n'
    + '// 2026-06-14 module audit plan. Server configs live in server/areas/<area>/modules/.\n';
  const body = 'import type { ModuleDefinition } from \'../types\';\n\n'
    + 'export const ' + patchVar + ': ModuleDefinition[] = '
    + JSON.stringify(patchEntries, null, 2) + ';\n';
  fs.writeFileSync(patchPath, banner + '\n' + body);
  console.log('\nWROTE patch:', path.relative(REPO, patchPath), '(' + patchEntries.length + ' entries)');

  console.log('\n=== WIRING (add these ids to each AREAS entry moduleIds in src/lib/constants.ts) ===');
  console.log(JSON.stringify(wiring, null, 2));
  console.log('\nwritten=' + written, 'skipped=' + skipped);
}

main();
