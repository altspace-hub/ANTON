/**
 * area-frameworks.test.ts — Wave 2 (2026-09-16): which regulatory knowledge
 * belongs to which Work area.
 *
 * Before this the pack layer's area test compared `fcp` against "AML/CFT" (never
 * a match), so every active pack was injected into every run; and no module run
 * ever received framework article text because nothing seeded the retriever.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { frameworksForArea, areasForPack, packAppliesToArea, AREA_DOMAINS } from '../../server/services/area-frameworks.js';
import { FRAMEWORK_DOMAINS } from '../../server/services/gap-domains.js';
import { AREAS } from '../../src/lib/constants';

const repoRoot = path.resolve(__dirname, '..', '..');

/**
 * Area ids as the running product knows them.
 *
 * A module run's `areaId` arrives from the front end, so the authoritative list
 * is src/lib/constants.ts AREAS. server/areas/ is where the module catalogue
 * and prompts live, and the binding id is the `id` inside each area.json — NOT
 * the directory name: `server/areas/consumer-protection/` declares
 * `"id": "consumer-rights"` on purpose.
 */
function serverAreaIds(): Set<string> {
  const areasDir = path.join(repoRoot, 'server', 'areas');
  const ids = new Set<string>();
  for (const entry of fs.readdirSync(areasDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const modulesDir = path.join(areasDir, entry.name, 'modules');
    if (!fs.existsSync(modulesDir) || fs.readdirSync(modulesDir).length === 0) continue;
    const areaJson = path.join(areasDir, entry.name, 'area.json');
    if (!fs.existsSync(areaJson)) continue;
    const parsed = JSON.parse(fs.readFileSync(areaJson, 'utf8')) as { id?: string };
    if (parsed.id) ids.add(parsed.id);
  }
  return ids;
}

/** Front-end areas that have no server/areas directory of their own. */
const FRONT_END_ONLY_AREAS = new Set(['payments-dora', 'procure', 'civic', 'grow', 'portals']);

describe('frameworksForArea', () => {
  it('fcp is seeded with the AML frameworks and sanctions, not privacy or ESG', () => {
    const ids = frameworksForArea('fcp');
    expect(ids).toContain('amlr-2024');
    expect(ids).toContain('fatf-40');
    const domains = new Set(ids.map((id) => FRAMEWORK_DOMAINS[id]));
    expect(domains.has('aml')).toBe(true);
    expect(domains.has('esg')).toBe(false);
    expect(domains.has('privacy')).toBe(false);
  });

  it('data-privacy is seeded with privacy and AI governance only', () => {
    const domains = new Set(frameworksForArea('data-privacy').map((id) => FRAMEWORK_DOMAINS[id]));
    expect([...domains].sort()).toEqual(['ai-governance', 'privacy']);
  });

  it('an unmapped or missing area seeds nothing (explicitly named regulations still ground)', () => {
    expect(frameworksForArea('marketing-does-not-exist')).toEqual([]);
    expect(frameworksForArea(null)).toEqual([]);
    expect(frameworksForArea(undefined)).toEqual([]);
  });

  it('every domain named in AREA_DOMAINS is a gap domain, and every area seeds at least one framework or is deliberately empty', () => {
    // The GapDomain union, spelled out so a typo in AREA_DOMAINS fails here.
    const union = new Set(['aml', 'sanctions', 'ict-resilience', 'infosec', 'privacy', 'ai-governance', 'anti-bribery', 'financial-conduct', 'digital-assets', 'esg', 'corporate-governance', 'online-safety', 'procurement', 'consumer-protection', 'compliance']);
    const withFrameworks = new Set(Object.values(FRAMEWORK_DOMAINS));
    for (const [area, domains] of Object.entries(AREA_DOMAINS)) {
      for (const d of domains) expect(union.has(d), `${area} → ${d}`).toBe(true);
      // Every mapped area must resolve to at least one framework file today.
      expect(domains.some((d) => withFrameworks.has(d)), `${area} seeds no framework`).toBe(true);
    }
  });

  /**
   * Wave 1 (2026-09-17) — catalogue guards.
   *
   * AREA_DOMAINS had 21 keys against 59 module-bearing server areas, and the
   * one entry for `hr` was ['privacy'] — so the EU AI Act, whose Annex III(4)
   * makes CV screening and performance evaluation high-risk, could not ground a
   * single run in the area that ships cv-screener. These four assertions are
   * the standing guard over that table.
   */
  it('every AREA_DOMAINS key is a real area id (bound on area.json id, not the folder name)', () => {
    const serverIds = serverAreaIds();
    const frontEndIds = new Set((AREAS as ReadonlyArray<{ id: string }>).map((a) => a.id));
    // The rename guard: `consumer-protection/` declares `consumer-rights`.
    expect(serverIds.has('consumer-rights')).toBe(true);
    expect(serverIds.has('consumer-protection')).toBe(false);

    const unknown = Object.keys(AREA_DOMAINS).filter((a) => !serverIds.has(a) && !frontEndIds.has(a));
    expect(unknown, 'AREA_DOMAINS keys that are neither a server area.json id nor a front-end area id').toEqual([]);

    // A key with no server/areas directory is allowed only for the known
    // front-end-only areas — otherwise it is a typo or a renamed area.
    const withoutServerArea = Object.keys(AREA_DOMAINS).filter((a) => !serverIds.has(a));
    expect(withoutServerArea.filter((a) => !FRONT_END_ONLY_AREAS.has(a))).toEqual([]);
  });

  it('every domain used in AREA_DOMAINS has at least one framework file, and every framework domain is reachable from some area', () => {
    const frameworksDir = path.join(repoRoot, 'data', 'frameworks');
    const onDisk = new Set(
      fs.readdirSync(frameworksDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    );
    // FRAMEWORK_DOMAINS must describe files that exist, or the inversion maps
    // a domain onto a framework the retriever can never load.
    const phantom = Object.keys(FRAMEWORK_DOMAINS).filter((id) => !onDisk.has(id));
    expect(phantom, 'FRAMEWORK_DOMAINS entries with no data/frameworks file').toEqual([]);

    const domainsWithFrameworks = new Set(Object.values(FRAMEWORK_DOMAINS));
    const domainsUsedByAreas = new Set(Object.values(AREA_DOMAINS).flatMap((d) => [...d]));

    // Forward: no area may be mapped to a domain that seeds nothing. `compliance`
    // is gap-domains.ts's fallback persona and carries no framework file, so
    // listing it in AREA_DOMAINS is a silent no-op and fails here.
    const empty = [...domainsUsedByAreas].filter((d) => !domainsWithFrameworks.has(d));
    expect(empty, 'domains used by an area that map to zero framework files').toEqual([]);

    // Reverse: a framework domain no area can reach is a set of files that only
    // ground when the user names the regulation by hand.
    const orphaned = [...domainsWithFrameworks].filter((d) => !domainsUsedByAreas.has(d));
    expect(orphaned, 'framework domains no area is mapped to').toEqual([]);
  });

  it('every area named by a knowledge-pack routing rule is a real area id', () => {
    const serverIds = serverAreaIds();
    const frontEndIds = new Set((AREAS as ReadonlyArray<{ id: string }>).map((a) => a.id));
    // areasForPack returns the union of every rule that matched, so a text that
    // trips every rule enumerates every area id the table can emit.
    const everyRuleText = [
      'aml cft sanctions ofac bribery gdpr privacy ai act dora nis2 cyber mifid mar emir crr basel mica crypto',
      'esg csrd employment labour working time equal treatment pay transparency platform work competition merger',
      'procurement company law corporate litigation psd2 payment services insurance reinsurance solvency',
      'microfinance financial inclusion consumer protection consumer credit bop online safety eccta multi-domain',
    ].join(' ');
    const areas = areasForPack({ display_name: everyRuleText, regulatory_area: null, regulation_ids: null });
    expect(areas).not.toBe('all');
    const emitted = [...(areas as ReadonlySet<string>)];
    expect(emitted.length).toBeGreaterThan(20);
    const unknown = emitted.filter((a) => !serverIds.has(a) && !frontEndIds.has(a));
    expect(unknown, 'pack routing rules naming an area that does not exist').toEqual([]);
  });

  it('regression: the EU AI Act can ground an HR run (Annex III(4) recruitment and performance)', () => {
    const hr = frameworksForArea('hr');
    expect(hr).toContain('eu-ai-act-2024');
    expect(hr).toContain('iso42001-2023');
    // The privacy grounding that was already there must survive.
    expect(hr).toContain('gdpr-2016');
    // The other three content/decision areas named in the same fix.
    for (const area of ['marketing', 'comms-pr', 'branding']) {
      expect(frameworksForArea(area), `${area} must reach the AI Act`).toContain('eu-ai-act-2024');
    }
    // …and it must not have leaked into an area with no AI-decision surface.
    expect(frameworksForArea('fcp')).not.toContain('eu-ai-act-2024');
  });
});

describe('areasForPack / packAppliesToArea', () => {
  const amlr = { display_name: 'AMLR 2024', regulatory_area: 'AML/CFT', regulation_ids: '["AMLR","Regulation (EU) 2024/1624"]' };
  const gdpr = { display_name: 'GDPR + AI Act', regulatory_area: 'Data Protection / AI Governance', regulation_ids: '["GDPR","EU AI Act"]' };
  const dora = { display_name: 'DORA + NIS2', regulatory_area: 'Digital Resilience / Cybersecurity', regulation_ids: '["DORA","NIS2"]' };
  const unmapped = { display_name: 'Something New', regulatory_area: 'Ornithology', regulation_ids: '[]' };

  it('an AML pack belongs to fcp and banking, not to marketing or healthcare', () => {
    expect(packAppliesToArea(amlr, 'fcp')).toBe(true);
    expect(packAppliesToArea(amlr, 'banking')).toBe(true);
    expect(packAppliesToArea(amlr, 'marketing')).toBe(false);
    expect(packAppliesToArea(amlr, 'healthcare')).toBe(false);
  });

  it('a privacy pack belongs to data-privacy and hr, not to blockchain or fcp', () => {
    expect(packAppliesToArea(gdpr, 'data-privacy')).toBe(true);
    expect(packAppliesToArea(gdpr, 'hr')).toBe(true);
    expect(packAppliesToArea(gdpr, 'blockchain')).toBe(false);
    expect(packAppliesToArea(gdpr, 'fcp')).toBe(false);
  });

  it('a resilience pack belongs to payments-dora and cyber', () => {
    expect(packAppliesToArea(dora, 'payments-dora')).toBe(true);
    expect(packAppliesToArea(dora, 'cyber')).toBe(true);
    expect(packAppliesToArea(dora, 'esg')).toBe(false);
  });

  /**
   * Every shipped pack should route somewhere. Falling through to 'all' is the
   * safe fallback — a pack is never hidden by a missing rule — but as a DEFAULT it
   * means the pack competes for grounding budget in every unrelated run.
   *
   * eu-consumer-rights-acquis fell through on a separator: packText() feeds
   * `regulatory_area` in, that field is written with hyphens, and the rule only
   * accepted "consumer protection" with a space.
   */
  it('every shipped knowledge pack routes to at least one area', () => {
    const dir = path.join(repoRoot, 'data', 'knowledge-packs');
    const unmapped: string[] = [];
    let checked = 0;
    for (const p of fs.readdirSync(dir)) {
      const mf = path.join(dir, p, 'manifest.json');
      if (!fs.existsSync(mf)) continue;
      checked++;
      const m = JSON.parse(fs.readFileSync(mf, 'utf8')) as Parameters<typeof areasForPack>[0];
      if (areasForPack(m) === 'all') unmapped.push(p);
    }
    expect(checked, 'no pack manifests found — did the layout move?').toBeGreaterThan(20);
    expect(unmapped).toEqual([]);
  });

  it('an unmapped pack is never hidden, and no area means no gate', () => {
    expect(areasForPack(unmapped)).toBe('all');
    expect(packAppliesToArea(unmapped, 'marketing')).toBe(true);
    expect(packAppliesToArea(amlr, null)).toBe(true);
    expect(packAppliesToArea(amlr, undefined)).toBe(true);
  });

  it('accepts regulation ids as an array or a JSON string, and tolerates bad JSON', () => {
    expect(packAppliesToArea({ ...amlr, regulation_ids: ['AMLR'] }, 'fcp')).toBe(true);
    expect(packAppliesToArea({ display_name: 'x', regulatory_area: null, regulation_ids: 'not json but mentions sanctions' }, 'fcp')).toBe(true);
  });
});
