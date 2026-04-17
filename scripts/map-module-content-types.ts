/**
 * Map every module.json in server/areas/ to one of the eight Phase 1
 * content types, writing the `contentType` field back into the file.
 *
 * Heuristic, not perfect. Owners can refine per area later. The default
 * (analytic_report) is the safest fallback — it means only generic
 * transforms apply, which is strictly better than a wrong-type mapping
 * that shows non-applicable renderers.
 *
 * Run with:  pnpm tsx scripts/map-module-content-types.ts [--dry]
 * Re-runs are idempotent — existing contentType values are respected
 * unless --force is passed.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AREAS_DIR = path.resolve(__dirname, '..', 'server', 'areas');

type ContentType =
  | 'gap_analysis'
  | 'risk_register'
  | 'process_map'
  | 'policy_document'
  | 'analytic_report'
  | 'plan_document'
  | 'entity_register'
  | 'scorecard';

interface ModuleJson {
  id: string;
  label?: string;
  shortLabel?: string;
  description?: string;
  tags?: string[];
  contentType?: ContentType;
  defaults?: { outputFormats?: string[] };
  [key: string]: unknown;
}

/**
 * Map of keyword → content type. Most specific matches win. The matcher
 * scans the module id, label, shortLabel, description, and tags for these
 * terms (case-insensitive, word-boundary where applicable).
 */
const KEYWORD_MAP: Array<{ match: RegExp; type: ContentType; weight: number }> = [
  // gap_analysis — regulatory compliance gaps
  { match: /\bgap[- ]?analysis\b|\bgap[- ]?assessment\b|\bgap[- ]?scoring\b|\bcompliance[- ]?gap\b|\bcontrol[- ]?gap\b/i, type: 'gap_analysis', weight: 100 },
  { match: /\breadiness\b.*\b(assessment|review|analysis|check)\b/i, type: 'gap_analysis', weight: 80 },
  { match: /\baudit[- ]?finding|\bcontrol[- ]?review\b/i, type: 'gap_analysis', weight: 60 },

  // risk_register — enumerated risks with L×I scoring
  { match: /\brisk[- ]?register\b|\brisk[- ]?matrix\b|\benterprise[- ]?risk\b/i, type: 'risk_register', weight: 100 },
  { match: /\brisk[- ]?assessment\b|\brisk[- ]?analysis\b|\brisk[- ]?evaluation\b|\brisk[- ]?profiling\b/i, type: 'risk_register', weight: 90 },
  { match: /\bthird[- ]?party[- ]?risk\b|\bvendor[- ]?risk\b|\bsupply[- ]?chain[- ]?risk\b/i, type: 'risk_register', weight: 90 },
  { match: /\bthreat[- ]?model\b|\bthreat[- ]?analysis\b|\battack[- ]?surface\b/i, type: 'risk_register', weight: 85 },
  { match: /\brisk\b.*\bregister\b/i, type: 'risk_register', weight: 70 },

  // process_map — steps, actors, decisions
  { match: /\bprocess[- ]?map\b|\bprocess[- ]?flow\b|\bflowchart\b|\bswim[- ]?lane\b/i, type: 'process_map', weight: 100 },
  { match: /\bworkflow\b.*\b(design|map|specification|definition)\b/i, type: 'process_map', weight: 80 },
  { match: /\bonboard(?:ing)?[- ]?flow\b|\bsubmission[- ]?flow\b/i, type: 'process_map', weight: 75 },
  { match: /\bsop\b|\bstandard[- ]?operating[- ]?procedure\b/i, type: 'process_map', weight: 70 },

  // policy_document — sectioned policy with clauses
  { match: /\bpolicy[- ]?document\b|\bpolicy[- ]?builder\b|\bpolicy[- ]?generator\b|\bpolicy[- ]?template\b/i, type: 'policy_document', weight: 100 },
  { match: /\b(sanctions|aml|kyc|privacy|acceptable[- ]?use|security|information[- ]?security|data[- ]?protection)[- ]?policy\b/i, type: 'policy_document', weight: 95 },
  { match: /\bdpa\b|\bdata[- ]?processing[- ]?agreement\b|\bstandard[- ]?contractual[- ]?clauses?\b/i, type: 'policy_document', weight: 90 },
  { match: /\bcode[- ]?of[- ]?conduct\b|\bcharter\b(?!.*\banalysis)/i, type: 'policy_document', weight: 75 },
  { match: /\bprocedure\b.*\b(document|manual)\b/i, type: 'policy_document', weight: 65 },

  // plan_document — timeline with milestones
  { match: /\bimplementation[- ]?(plan|roadmap)\b|\baudit[- ]?plan\b|\bproject[- ]?plan\b|\broadmap\b/i, type: 'plan_document', weight: 100 },
  { match: /\bremediation[- ]?plan\b|\btransition[- ]?plan\b|\bmigration[- ]?plan\b|\brollout[- ]?plan\b/i, type: 'plan_document', weight: 95 },
  { match: /\bwork[- ]?programme\b|\bdelivery[- ]?plan\b|\btest[- ]?plan\b/i, type: 'plan_document', weight: 80 },
  { match: /\bmilestones?\b.*\b(timeline|schedule)\b/i, type: 'plan_document', weight: 70 },

  // entity_register — list of entities with attributes
  { match: /\b(third[- ]?party|vendor|supplier|systems?|asset|application|data[- ]?processor)[- ]?(register|inventory|catalog(?:ue)?)\b/i, type: 'entity_register', weight: 100 },
  { match: /\brecord[- ]?of[- ]?processing\b|\bropa\b/i, type: 'entity_register', weight: 95 },
  { match: /\b(contract|agreement)[- ]?register\b/i, type: 'entity_register', weight: 85 },
  { match: /\binventory\b(?!.*\banalysis)/i, type: 'entity_register', weight: 60 },

  // scorecard — KPI list with targets
  { match: /\bscorecard\b|\bkpi\b|\bbalanced[- ]?scorecard\b/i, type: 'scorecard', weight: 100 },
  { match: /\bmaturity[- ]?(assessment|model|scorecard)\b/i, type: 'scorecard', weight: 90 },
  { match: /\besg[- ]?(rating|score)\b|\bsustainability[- ]?scorecard\b/i, type: 'scorecard', weight: 90 },
  { match: /\bperformance[- ]?(dashboard|scorecard|review)\b/i, type: 'scorecard', weight: 80 },
];

/** Secondary signals from outputFormats — only used when keyword map is inconclusive. */
const OUTPUT_FORMAT_HINTS: Record<string, ContentType> = {
  'gap-scoring-matrix': 'gap_analysis',
  'data-readiness-scorecard': 'scorecard',
  'risk-heatmap': 'risk_register',
  'risk-register': 'risk_register',
  'implementation-plan': 'plan_document',
  'action-plan': 'plan_document',
  'policy-document': 'policy_document',
  'process-map': 'process_map',
  'maturity-assessment': 'scorecard',
  'compliance-calendar': 'plan_document',
  'raci-matrix': 'entity_register',
};

function inferContentType(mod: ModuleJson): { type: ContentType; reason: string; confidence: number } {
  const haystacks: string[] = [
    mod.id,
    mod.label ?? '',
    mod.shortLabel ?? '',
    mod.description ?? '',
    ...(mod.tags ?? []),
  ];
  const text = haystacks.join(' ').toLowerCase();

  let best: { type: ContentType; weight: number; match: string } | null = null;
  for (const rule of KEYWORD_MAP) {
    const m = rule.match.exec(text);
    if (m && (best == null || rule.weight > best.weight)) {
      best = { type: rule.type, weight: rule.weight, match: m[0] };
    }
  }

  if (best) {
    return { type: best.type, reason: `keyword: "${best.match}"`, confidence: best.weight };
  }

  // Fallback: outputFormats hints
  const outputFormats = mod.defaults?.outputFormats ?? [];
  for (const fmt of outputFormats) {
    const hit = OUTPUT_FORMAT_HINTS[fmt];
    if (hit) return { type: hit, reason: `outputFormat: ${fmt}`, confidence: 50 };
  }

  // Fallback: analytic_report (most permissive)
  return { type: 'analytic_report', reason: 'default fallback', confidence: 0 };
}

async function walkModules(): Promise<string[]> {
  const areaDirs = await fs.readdir(AREAS_DIR, { withFileTypes: true });
  const modulePaths: string[] = [];
  for (const areaEntry of areaDirs) {
    if (!areaEntry.isDirectory()) continue;
    const modulesRoot = path.join(AREAS_DIR, areaEntry.name, 'modules');
    let moduleDirs: import('fs').Dirent[];
    try { moduleDirs = await fs.readdir(modulesRoot, { withFileTypes: true }); }
    catch { continue; }
    for (const modEntry of moduleDirs) {
      if (!modEntry.isDirectory()) continue;
      const modJson = path.join(modulesRoot, modEntry.name, 'module.json');
      try {
        await fs.access(modJson);
        modulePaths.push(modJson);
      } catch { /* skip */ }
    }
  }
  return modulePaths;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const force = args.includes('--force');

  const files = await walkModules();
  console.log(`Scanning ${files.length} module.json files…\n`);

  const countsByType: Record<string, number> = {};
  const lowConfidence: Array<{ file: string; id: string; inferred: string; reason: string }> = [];
  let updated = 0;
  let skippedExisting = 0;

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    let mod: ModuleJson;
    try { mod = JSON.parse(raw) as ModuleJson; }
    catch (err) {
      console.warn(`  SKIP (bad JSON): ${file}`, err instanceof Error ? err.message : err);
      continue;
    }

    if (mod.contentType && !force) {
      skippedExisting++;
      countsByType[mod.contentType] = (countsByType[mod.contentType] ?? 0) + 1;
      continue;
    }

    const inference = inferContentType(mod);
    countsByType[inference.type] = (countsByType[inference.type] ?? 0) + 1;
    if (inference.confidence < 80) {
      lowConfidence.push({ file: path.relative(process.cwd(), file), id: mod.id, inferred: inference.type, reason: inference.reason });
    }

    if (dry) continue;

    mod.contentType = inference.type;
    // Preserve existing key order as best-effort — reserialize with 2-space indent to
    // match the codebase convention.
    const out = JSON.stringify(mod, null, 2) + '\n';
    await fs.writeFile(file, out, 'utf8');
    updated++;
  }

  console.log('\n=== Summary ===');
  console.log(`Files:          ${files.length}`);
  console.log(`Updated:        ${updated}`);
  console.log(`Skipped (had):  ${skippedExisting}`);
  console.log(`Low confidence: ${lowConfidence.length}`);
  console.log('\nBy content type:');
  for (const [k, v] of Object.entries(countsByType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }

  if (lowConfidence.length > 0) {
    console.log(`\nLow-confidence inferences (confidence < 80) — sample:`);
    for (const lc of lowConfidence.slice(0, 30)) {
      console.log(`  [${lc.inferred}] ${lc.id}  (${lc.reason})`);
    }
    if (lowConfidence.length > 30) console.log(`  … +${lowConfidence.length - 30} more`);
  }

  if (dry) console.log('\n(dry run — no files written)');
}

main().catch(err => {
  console.error('Mapping failed:', err);
  process.exit(1);
});
