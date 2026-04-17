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

    for (const dirName of dirs) {
      try {
        const packDir = path.join(BUILTIN_PACKS_ROOT, dirName);
        const content = await readPackDir(packDir);
        contentCache.set(content.manifest.id, content);
        const result = await upsertPackRow(content.manifest, packDir);
        if (result === 'inserted') inserted++; else if (result === 'updated') updated++;
      } catch (err) {
        errors.push(`${dirName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { inserted, updated, errors };
  }

  async function upsertPackRow(manifest: IndustryPackManifest, packDir: string): Promise<'inserted' | 'updated'> {
    const relPath = path.relative(process.cwd(), packDir);
    const row = await db.get<{ was_insert: boolean }>(
      `INSERT INTO atlas_industry_packs
        (id, name, description, version, source, pack_path, parent_pack_id, amlr_obliged, is_enabled)
       VALUES (?, ?, ?, ?, 'builtin', ?, ?, ?, TRUE)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         version = EXCLUDED.version,
         pack_path = EXCLUDED.pack_path,
         parent_pack_id = EXCLUDED.parent_pack_id,
         amlr_obliged = EXCLUDED.amlr_obliged,
         updated_at = NOW()
       RETURNING (xmax = 0) AS was_insert`,
      manifest.id, manifest.name, manifest.description ?? null, manifest.version,
      relPath, manifest.parent_pack_id ?? null, manifest.amlr_obliged ?? false,
    );
    return row?.was_insert ? 'inserted' : 'updated';
  }

  // ── Pack content reading ─────────────────────────────────────────────

  async function readPackDir(packDir: string): Promise<IndustryPackContent> {
    const manifest = await readJson<IndustryPackManifest>(path.join(packDir, 'manifest.json'));
    if (!manifest.id) throw new Error(`Pack manifest missing 'id'`);
    if (!manifest.name) throw new Error(`Pack ${manifest.id}: manifest missing 'name'`);

    const [exposurePoints, threatPaths, vulnerabilities, controls, glossary, appetiteHeuristics, escalationTriggers, regulatoryTags] = await Promise.all([
      readJsonOrEmpty<PackExposureLibraryEntry[]>(path.join(packDir, 'exposure-points.json'), []),
      readJsonOrEmpty<PackThreatPathLibraryEntry[]>(path.join(packDir, 'threat-paths.json'), []),
      readJsonOrEmpty<PackVulnerabilityLibraryEntry[]>(path.join(packDir, 'vulnerabilities.json'), []),
      readJsonOrEmpty<PackControlLibraryEntry[]>(path.join(packDir, 'controls.json'), []),
      readJsonOrEmpty<Record<string, string>>(path.join(packDir, 'glossary.json'), {}),
      readJsonOrEmpty<Record<string, AppetitePosition>>(path.join(packDir, 'appetite-heuristics.json'), {}),
      readJsonOrEmpty<Array<{ event: string; action: string; timeline?: string }>>(path.join(packDir, 'escalation-triggers.json'), []),
      readJsonOrEmpty<{ tags?: string[] }>(path.join(packDir, 'regulatory-tags.json'), { tags: [] }),
    ]);

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
      regulatoryTags: regulatoryTags.tags ?? [],
    };
  }

  async function readSocraticScripts(scriptsDir: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    try {
      const files = await fs.readdir(scriptsDir);
      for (const f of files) {
        if (!f.endsWith('.md')) continue;
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
   */
  async function getPackContent(packId: string): Promise<IndustryPackContent | null> {
    if (contentCache.has(packId)) return contentCache.get(packId)!;
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
    const parent = await getPackContent(row.parent_pack_id);
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
