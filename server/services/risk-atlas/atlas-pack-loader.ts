// ── Atlas Pack Loader — Phase 1b ─────────────────────────────────────────
//
// Loads risk-atlas-industry-pack bundles from disk into the registry, and
// surfaces the pack's library content (exposures / threat paths /
// vulnerabilities / controls / glossary / socratic scripts) to the rest
// of the Atlas service.
//
// Discovery order:
//   1. data/risk-atlas/packs/<pack-id>/  — built-in packs shipped with the
//      install (this is where SME general lives in Phase 1b)
//   2. .anton bundles imported via the standard bundle import flow — the
//      bundle's primaryContentDir is 'risk-atlas-industry-packs' per the
//      registry entry added in Phase 1a
//
// Built-in packs are seeded into atlas_industry_packs on first call;
// updates via a re-seed call refresh the row without losing user-set
// status (is_enabled flag is preserved, mirroring the renderer registry
// pattern from OTS).

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { z } from 'zod';
import type { DatabaseAdapter } from '../../db/database.js';
import type {
  IndustryPackContent,
  IndustryPackManifest,
  PackExposureLibraryEntry,
  PackThreatPathLibraryEntry,
  PackVulnerabilityLibraryEntry,
  PackControlLibraryEntry,
  AtlasIndustryPackRow,
  AppetitePosition,
  Score1to5,
} from './types.js';

// ── Zod schemas for pack content ─────────────────────────────────────────
// Validates every pack file at load time so a malicious or malformed pack
// cannot smuggle out-of-domain values (e.g. severity 99) into the
// deterministic calculator. Reject the whole pack on schema failure rather
// than caching partial garbage.

const score1to5Z = z.number().int().min(1).max(5);
const exposurePointZ = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  description: z.string().max(4000),
  category: z.string().max(80),
});
const threatPathLibraryZ = z.object({
  id: z.string().min(1).max(80),
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  description: z.string().max(4000),
  typical_inherent: score1to5Z,
  fcp_domain: z.enum(['amlcft','sanctions','fraud','abc','market_abuse','tax_evasion_facilitation','export_controls','modern_slavery']).optional(),
  exposure_refs: z.array(z.string()).max(50).optional(),
  vulnerability_refs: z.array(z.string()).max(50).optional(),
});
const vulnerabilityLibraryZ = z.object({
  id: z.string().min(1).max(80),
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  description: z.string().max(4000),
  typical_severity: score1to5Z,
});
const controlLibraryZ = z.object({
  id: z.string().min(1).max(80),
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  description: z.string().max(4000),
  default_type: z.enum(['prevent','detect','respond']),
  default_strength_when_in_place: z.enum(['strong','adequate','weak']),
  evidence_examples: z.array(z.string().max(500)).max(20).optional(),
  owner_role: z.string().max(200).optional(),
  vulnerability_refs: z.array(z.string()).max(50).optional(),
});
const appetiteHeuristicsZ = z.record(z.string(), z.enum(['within','boundary','outside','unacceptable']));
const escalationTriggerZ = z.object({
  event: z.string().min(1).max(500),
  action: z.string().min(1).max(1000),
  timeline: z.string().max(200).optional(),
});
const severityAnchorBlockZ = z.object({
  '1': z.string().min(1).max(2000),
  '2': z.string().min(1).max(2000),
  '3': z.string().min(1).max(2000),
  '4': z.string().min(1).max(2000),
  '5': z.string().min(1).max(2000),
}).partial();
const severityBenchmarksZ = z.object({
  exposure_anchors: severityAnchorBlockZ.optional(),
  threat_credibility_anchors: severityAnchorBlockZ.optional(),
  vulnerability_anchors: severityAnchorBlockZ.optional(),
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_PACKS_ROOT = path.resolve(__dirname, '..', '..', '..', 'data', 'risk-atlas', 'packs');

// ── Loader factory ─────────────────────────────────────────────────────

export function createAtlasPackLoader(db: DatabaseAdapter) {
  // In-memory cache of fully-parsed pack content keyed by pack id.
  // Cleared on seedBuiltinPacks.
  const contentCache = new Map<string, IndustryPackContent>();

  async function seedBuiltinPacks(): Promise<{ inserted: number; updated: number; errors: string[] }> {
    const errors: string[] = [];
    let inserted = 0; let updated = 0;
    contentCache.clear();

    let dirs: string[];
    try {
      const entries = await fs.readdir(BUILTIN_PACKS_ROOT, { withFileTypes: true });
      dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch (err) {
      errors.push(`Built-in pack root not found: ${BUILTIN_PACKS_ROOT} (${err instanceof Error ? err.message : String(err)})`);
      return { inserted, updated, errors };
    }

    // Two-pass insert to satisfy the parent_pack_id FK regardless of file-system
    // order. Pass 1: upsert all packs with parent_pack_id NULLed. Pass 2: update
    // each pack's parent_pack_id from its manifest (now that every parent row
    // exists). Replaces the previous Promise.allSettled which raced on the FK.
    type Loaded = { dirName: string; manifest: IndustryPackManifest; packDir: string };
    const loaded: Loaded[] = [];

    // Read every pack manifest first (parallel — no DB writes here).
    const reads = await Promise.allSettled(dirs.map(async (dirName) => {
      const packDir = path.join(BUILTIN_PACKS_ROOT, dirName);
      const content = await readPackDir(packDir);
      contentCache.set(content.manifest.id, content);
      return { dirName, manifest: content.manifest, packDir } satisfies Loaded;
    }));
    for (let i = 0; i < reads.length; i++) {
      const r = reads[i];
      if (r.status === 'fulfilled') {
        loaded.push(r.value);
      } else {
        errors.push(`${dirs[i]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      }
    }

    // Pass 1: upsert each pack with parent_pack_id forced to NULL — bypasses
    // the FK ordering problem. Captures inserted/updated counts.
    for (const { manifest, packDir } of loaded) {
      try {
        const parentless: IndustryPackManifest = { ...manifest, parent_pack_id: undefined };
        const result = await upsertPackRow(parentless, packDir);
        if (result === 'inserted') inserted++;
        else if (result === 'updated') updated++;
      } catch (err) {
        errors.push(`${manifest.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Pass 2: now every parent row exists, write parent_pack_id where set.
    for (const { manifest } of loaded) {
      if (!manifest.parent_pack_id) continue;
      try {
        await db.run(
          `UPDATE atlas_industry_packs SET parent_pack_id = ?, updated_at = NOW() WHERE id = ?`,
          manifest.parent_pack_id, manifest.id,
        );
      } catch (err) {
        errors.push(`${manifest.id} parent_pack_id link: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { inserted, updated, errors };
  }

  async function upsertPackRow(manifest: IndustryPackManifest, packDir: string): Promise<'inserted' | 'updated'> {
    const relPath = path.relative(process.cwd(), packDir);
    // pack_kind classifier — added in migration 128. Defaults to 'industry'
    // for backwards compatibility with manifests that pre-date the field.
    const packKind = (manifest as { pack_kind?: string }).pack_kind ?? 'industry';
    if (!['industry', 'fcp-domain', 'overlay'].includes(packKind)) {
      throw new Error(`Pack ${manifest.id}: pack_kind must be one of 'industry' | 'fcp-domain' | 'overlay'`);
    }
    const row = await db.get<{ was_insert: boolean }>(
      `INSERT INTO atlas_industry_packs
        (id, name, description, version, source, pack_path, parent_pack_id, amlr_obliged, is_enabled, pack_kind)
       VALUES (?, ?, ?, ?, 'builtin', ?, ?, ?, TRUE, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         version = EXCLUDED.version,
         pack_path = EXCLUDED.pack_path,
         parent_pack_id = EXCLUDED.parent_pack_id,
         amlr_obliged = EXCLUDED.amlr_obliged,
         pack_kind = EXCLUDED.pack_kind,
         updated_at = NOW()
       RETURNING (xmax = 0) AS was_insert`,
      manifest.id, manifest.name, manifest.description ?? null, manifest.version,
      relPath, manifest.parent_pack_id ?? null, manifest.amlr_obliged ?? false, packKind,
    );
    return row?.was_insert ? 'inserted' : 'updated';
  }

  // ── Pack content reading ─────────────────────────────────────────────

  async function readPackDir(packDir: string): Promise<IndustryPackContent> {
    const manifest = await readJson<IndustryPackManifest>(path.join(packDir, 'manifest.json'));
    if (!manifest.id) throw new Error(`Pack manifest missing 'id'`);
    if (!manifest.name) throw new Error(`Pack ${manifest.id}: manifest missing 'name'`);
    // Validate manifest.id — used as PK on atlas_industry_packs and as a
    // stored path component. Strict character set + length so a crafted
    // pack can't smuggle traversal sequences or shell metacharacters.
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(manifest.id)) {
      throw new Error(`Pack ${manifest.id}: id must match /^[a-z0-9][a-z0-9_-]{0,63}$/`);
    }
    // Defence in depth: assert id matches the directory name so two packs
    // in different folders can't silently overwrite each other in the DB.
    const dirName = path.basename(packDir);
    if (manifest.id !== dirName) {
      throw new Error(`Pack id "${manifest.id}" does not match directory name "${dirName}"`);
    }
    // Containment: the pack dir must live under one of the known roots.
    const resolved = path.resolve(packDir);
    const builtinWithSep = BUILTIN_PACKS_ROOT + path.sep;
    if (resolved !== BUILTIN_PACKS_ROOT && !resolved.startsWith(builtinWithSep)) {
      throw new Error(`Pack dir ${resolved} is outside the built-in packs root`);
    }

    const [exposurePointsRaw, threatPathsRaw, vulnerabilitiesRaw, controlsRaw, glossaryRaw, appetiteHeuristicsRaw, escalationTriggersRaw, regulatoryTagsRaw, severityBenchmarksRaw] = await Promise.all([
      readJsonOrEmpty<unknown>(path.join(packDir, 'exposure-points.json'), []),
      readJsonOrEmpty<unknown>(path.join(packDir, 'threat-paths.json'), []),
      readJsonOrEmpty<unknown>(path.join(packDir, 'vulnerabilities.json'), []),
      readJsonOrEmpty<unknown>(path.join(packDir, 'controls.json'), []),
      readJsonOrEmpty<unknown>(path.join(packDir, 'glossary.json'), {}),
      readJsonOrEmpty<unknown>(path.join(packDir, 'appetite-heuristics.json'), {}),
      readJsonOrEmpty<unknown>(path.join(packDir, 'escalation-triggers.json'), []),
      readJsonOrEmpty<unknown>(path.join(packDir, 'regulatory-tags.json'), { tags: [] }),
      readJsonOrEmpty<unknown>(path.join(packDir, 'severity-benchmarks.json'), null),
    ]);

    // Validate each library — reject the whole pack on any schema failure.
    // Cast through `unknown` for fields where Zod widens 1-5 to `number`
    // but the TS literal type is `Score1to5 = 1|2|3|4|5`. The runtime
    // values are guaranteed in [1,5] by .min(1).max(5), so the cast is safe.
    const exposurePoints       = z.array(exposurePointZ).parse(exposurePointsRaw) as PackExposureLibraryEntry[];
    const threatPaths          = z.array(threatPathLibraryZ).parse(threatPathsRaw) as unknown as PackThreatPathLibraryEntry[];
    const vulnerabilities      = z.array(vulnerabilityLibraryZ).parse(vulnerabilitiesRaw) as unknown as PackVulnerabilityLibraryEntry[];
    const controls             = z.array(controlLibraryZ).parse(controlsRaw) as PackControlLibraryEntry[];
    const glossary             = z.record(z.string(), z.string().max(2000)).parse(glossaryRaw ?? {});
    const appetiteHeuristics   = appetiteHeuristicsZ.parse(appetiteHeuristicsRaw ?? {});
    const escalationTriggers   = z.array(escalationTriggerZ).parse(escalationTriggersRaw);
    const regulatoryTagsParsed = z.object({ tags: z.array(z.string().max(120)).optional() }).parse(regulatoryTagsRaw ?? {});
    // Severity benchmarks — optional, validated against the Stage 4 anchor shape.
    const severityBenchmarks = severityBenchmarksRaw ? severityBenchmarksZ.parse(severityBenchmarksRaw) : undefined;

    const socraticScripts = await readSocraticScripts(path.join(packDir, 'socratic-scripts'));

    return {
      manifest,
      exposurePoints,
      threatPaths,
      vulnerabilities,
      controls,
      glossary,
      socraticScripts,
      appetiteHeuristics,
      escalationTriggers,
      regulatoryTags: regulatoryTagsParsed.tags ?? [],
      severityBenchmarks,
    };
  }

  async function readSocraticScripts(scriptsDir: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    try {
      const files = await fs.readdir(scriptsDir);
      for (const f of files) {
        // Strict pattern — only stage-N.md (1..9). Rejects:
        //   - hidden files (.foo.md)
        //   - traversal sequences (../foo.md)
        //   - alternate stage namespaces (stage-foo.md)
        // The strict pattern means a malicious community pack can't smuggle
        // arbitrary keys into socraticScripts.
        if (!/^stage-\d+\.md$/.test(f)) continue;
        const stage = f.replace(/\.md$/, '');
        out[stage] = await fs.readFile(path.join(scriptsDir, f), 'utf-8');
      }
    } catch { /* missing dir is fine */ }
    return out;
  }

  // ── Public read API ─────────────────────────────────────────────────

  async function listPacks(): Promise<AtlasIndustryPackRow[]> {
    return db.all<AtlasIndustryPackRow>(
      `SELECT * FROM atlas_industry_packs WHERE is_enabled = TRUE ORDER BY name`,
    );
  }

  async function getPack(id: string): Promise<AtlasIndustryPackRow | null> {
    return (await db.get<AtlasIndustryPackRow>(`SELECT * FROM atlas_industry_packs WHERE id = ?`, id)) ?? null;
  }

  /**
   * Resolve full pack content, merging parent packs if there's an inheritance
   * chain (FCP-CASP inherits from FCP-Bank inherits from SME-general). Child
   * entries override parent entries with the same id.
   *
   * Cycle protection (multi-expert review fix): track the visit set down
   * the recursion. A misconfigured `parent_pack_id` chain (especially from
   * a community-imported `.anton` bundle) would otherwise recurse until
   * stack overflow.
   */
  async function getPackContent(packId: string, visited?: Set<string>): Promise<IndustryPackContent | null> {
    if (contentCache.has(packId)) return contentCache.get(packId)!;
    const seen = visited ?? new Set<string>();
    if (seen.has(packId)) {
      throw new Error(`Pack inheritance cycle detected at "${packId}" (visited: ${Array.from(seen).join(' → ')})`);
    }
    seen.add(packId);
    const row = await getPack(packId);
    if (!row?.pack_path) return null;
    const absPackPath = path.isAbsolute(row.pack_path)
      ? row.pack_path
      : path.resolve(process.cwd(), row.pack_path);
    const own = await readPackDir(absPackPath);
    if (!row.parent_pack_id) {
      contentCache.set(packId, own);
      return own;
    }
    const parent = await getPackContent(row.parent_pack_id, seen);
    if (!parent) {
      contentCache.set(packId, own);
      return own;
    }
    const merged = mergePackContent(parent, own);
    contentCache.set(packId, merged);
    return merged;
  }

  /**
   * Surface the proposed Stage-1-3 content from a pack as draft Atlas
   * entries. The Atlas service consumes this to seed a new Atlas in Draft
   * or Socratic mode — the user reviews/accepts/rejects per spec §2.2.
   */
  async function proposeFromPack(packId: string): Promise<{
    exposures: PackExposureLibraryEntry[];
    threatPaths: PackThreatPathLibraryEntry[];
    vulnerabilities: PackVulnerabilityLibraryEntry[];
    controls: PackControlLibraryEntry[];
    appetiteHeuristics: Record<string, AppetitePosition>;
    escalationTriggers: Array<{ event: string; action: string; timeline?: string }>;
  } | null> {
    const content = await getPackContent(packId);
    if (!content) return null;
    return {
      exposures: content.exposurePoints,
      threatPaths: content.threatPaths,
      vulnerabilities: content.vulnerabilities,
      controls: content.controls,
      appetiteHeuristics: content.appetiteHeuristics ?? {},
      escalationTriggers: content.escalationTriggers ?? [],
    };
  }

  /** Used by the Socratic UI per stage. */
  async function getSocraticScript(packId: string, stage: number): Promise<string | null> {
    const content = await getPackContent(packId);
    return content?.socraticScripts?.[`stage-${stage}`] ?? null;
  }

  return {
    seedBuiltinPacks,
    listPacks,
    getPack,
    getPackContent,
    proposeFromPack,
    getSocraticScript,
    // Test seam
    _readPackDir: readPackDir,
  };
}

export type AtlasPackLoader = ReturnType<typeof createAtlasPackLoader>;

// ── Helpers ───────────────────────────────────────────────────────────

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

async function readJsonOrEmpty<T>(filePath: string, fallback: T): Promise<T> {
  try { return await readJson<T>(filePath); }
  catch { return fallback; }
}

/**
 * Merge child pack on top of parent pack — child entries with the same id
 * override parent entries. Lists are deduplicated by id; objects are
 * shallow-merged.
 */
export function mergePackContent(parent: IndustryPackContent, child: IndustryPackContent): IndustryPackContent {
  return {
    manifest: child.manifest,         // child manifest always wins
    exposurePoints: mergeById(parent.exposurePoints, child.exposurePoints),
    threatPaths: mergeById(parent.threatPaths, child.threatPaths),
    vulnerabilities: mergeById(parent.vulnerabilities, child.vulnerabilities),
    controls: mergeById(parent.controls, child.controls),
    glossary: { ...parent.glossary, ...child.glossary },
    socraticScripts: { ...parent.socraticScripts, ...child.socraticScripts },
    appetiteHeuristics: { ...parent.appetiteHeuristics, ...child.appetiteHeuristics },
    escalationTriggers: [...(parent.escalationTriggers ?? []), ...(child.escalationTriggers ?? [])],
    regulatoryTags: Array.from(new Set([...(parent.regulatoryTags ?? []), ...(child.regulatoryTags ?? [])])),
    // Severity benchmarks — child anchors override parent at the per-block level.
    severityBenchmarks: (parent.severityBenchmarks || child.severityBenchmarks) ? {
      exposure_anchors:           { ...(parent.severityBenchmarks?.exposure_anchors ?? {}),           ...(child.severityBenchmarks?.exposure_anchors ?? {}) },
      threat_credibility_anchors: { ...(parent.severityBenchmarks?.threat_credibility_anchors ?? {}), ...(child.severityBenchmarks?.threat_credibility_anchors ?? {}) },
      vulnerability_anchors:      { ...(parent.severityBenchmarks?.vulnerability_anchors ?? {}),     ...(child.severityBenchmarks?.vulnerability_anchors ?? {}) },
    } : undefined,
  };
}

function mergeById<T extends { id: string }>(parent: T[], child: T[]): T[] {
  const byId = new Map<string, T>();
  for (const p of parent) byId.set(p.id, p);
  for (const c of child) byId.set(c.id, c);     // child overrides parent
  return Array.from(byId.values());
}

/** Re-export for downstream type consumers. */
export type { Score1to5 };
