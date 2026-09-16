/**
 * area-frameworks.test.ts — Wave 2 (2026-09-16): which regulatory knowledge
 * belongs to which Work area.
 *
 * Before this the pack layer's area test compared `fcp` against "AML/CFT" (never
 * a match), so every active pack was injected into every run; and no module run
 * ever received framework article text because nothing seeded the retriever.
 */
import { describe, it, expect } from 'vitest';
import { frameworksForArea, areasForPack, packAppliesToArea, AREA_DOMAINS } from '../../server/services/area-frameworks.js';
import { FRAMEWORK_DOMAINS } from '../../server/services/gap-domains.js';

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
    const union = new Set(['aml', 'sanctions', 'ict-resilience', 'infosec', 'privacy', 'ai-governance', 'anti-bribery', 'financial-conduct', 'digital-assets', 'esg', 'corporate-governance', 'online-safety', 'compliance']);
    const withFrameworks = new Set(Object.values(FRAMEWORK_DOMAINS));
    for (const [area, domains] of Object.entries(AREA_DOMAINS)) {
      for (const d of domains) expect(union.has(d), `${area} → ${d}`).toBe(true);
      // Every mapped area must resolve to at least one framework file today.
      expect(domains.some((d) => withFrameworks.has(d)), `${area} seeds no framework`).toBe(true);
    }
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
