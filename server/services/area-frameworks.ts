/**
 * area-frameworks.ts — which regulatory knowledge belongs to which Work area
 * (Wave 2, 2026-09-16).
 *
 * Two questions the prompt layers could not answer before:
 *
 *   1. Which framework files (data/frameworks/*.json) may ground a module run
 *      in area X when the user did not name a regulation? The framework
 *      retriever only had a "weak scope" by knowledge-pack id, and a module
 *      run through /api/claude/message never called it at all.
 *   2. Which knowledge packs belong in a run in area X? The pack layer listed
 *      every active pack in every run, and its area test compared an area id
 *      like `fcp` against strings like "AML/CFT", which can never match — so
 *      a marketing brief carried three AML packs.
 *
 * Both are answered here, by data, in one place. Frameworks map through the
 * Gap Assessor's domain table (server/services/gap-domains.ts); packs map by
 * keywords over the pack's declared area, name and regulation ids. A pack
 * that matches no rule is treated as relevant everywhere (unmapped = all),
 * so a newly imported pack is never silently hidden.
 */
import { FRAMEWORK_DOMAINS, type GapDomain } from './gap-domains.js';

/**
 * The Gap Assessor domains a Work area is allowed to be grounded in.
 *
 * Rules for editing this table (enforced by tests/services/area-frameworks.test.ts):
 *
 *   - The key must be a real area id — the `id` field of a
 *     `server/areas/<dir>/area.json` (note `consumer-protection/` declares
 *     `consumer-rights`, deliberately) or an id in src/lib/constants.ts AREAS
 *     (`payments-dora` is a front-end-only area whose modules have no
 *     server/areas directory, but the front end still sends that areaId).
 *   - Every domain listed must resolve to at least one framework file. The
 *     `compliance` domain does NOT: it is gap-domains.ts's fallback *persona*
 *     for a framework that has no domain entry, and no shipped framework is
 *     mapped to it. Listing it here was a silent no-op (it added zero
 *     frameworks to legal / audit / risk) and is now rejected by the tests.
 *     If a genuinely generic framework is ever mapped to `compliance`, add the
 *     domain back here — the reverse test will demand it.
 *   - Only map a domain an area's modules actually work in. These ids enter the
 *     retriever as *weak* scope (framework-text-retrieval.ts `matchFrameworks`),
 *     which needs two query-term hits per article before it scores — but a
 *     wrong domain still leaks articles on generic words like "risk",
 *     "assessment" and "control". An unmapped area is better than a wrong one.
 *
 * Areas deliberately left unmapped have no shipped framework for their subject
 * (property/EPBD, the consumer acquis, employment, tax, product safety,
 * competition, procurement, media) — see the Wave 1 notes in not_to_github/.
 */
export const AREA_DOMAINS: Readonly<Record<string, readonly GapDomain[]>> = {
  fcp: ['aml', 'sanctions', 'anti-bribery', 'digital-assets', 'financial-conduct'],
  blockchain: ['digital-assets', 'aml', 'sanctions'],
  banking: ['financial-conduct', 'aml', 'ict-resilience'],
  insurance: ['financial-conduct', 'aml'],
  investment: ['financial-conduct', 'aml'],
  'pe-vc': ['financial-conduct', 'corporate-governance'],
  'payments-dora': ['ict-resilience', 'financial-conduct'],
  cyber: ['infosec', 'ict-resilience', 'privacy'],
  'data-privacy': ['privacy', 'ai-governance'],
  legal: ['corporate-governance', 'privacy', 'anti-bribery'],
  audit: ['corporate-governance', 'aml'],
  risk: ['aml', 'ict-resilience'],
  esg: ['esg'],
  'software-eng': ['ai-governance', 'privacy', 'infosec'],
  coding: ['ai-governance', 'infosec'],
  // Recruitment, selection, promotion, termination, task allocation and
  // performance evaluation are AI Act Annex III(4) high-risk uses, and this
  // area ships cv-screener, interview-question-gen, performance-review and
  // org-restructuring-advisor. The AI Act could not reach any of them.
  hr: ['privacy', 'ai-governance'],
  'mobile-money': ['aml', 'financial-conduct'],
  microfinance: ['aml', 'financial-conduct'],
  'islamic-finance': ['financial-conduct', 'aml'],
  // crisis-comms-response's own prompt names the GDPR 72-hour breach
  // notification and DORA operational incident reporting; investor-update-letter
  // and press-release are synthetic-content surfaces under AI Act Art 50.
  'comms-pr': ['online-safety', 'privacy', 'ict-resilience', 'ai-governance'],
  // AI Act Art 50 transparency for AI-generated campaign copy and imagery,
  // on top of the targeting/profiling privacy rules already mapped.
  // copywriting / campaign-design / content-strategy publish AI-generated
  // material (Art 50) and campaign-design's prompt already tells the model to
  // "ensure GDPR compliance in all data collection and email marketing".
  branding: ['ai-governance', 'privacy'],
  // healthcare-gdpr and research-ethics are pure GDPR; medical-device-compliance
  // and clinical-protocol sit on AI-as-safety-component (AI Act Art 6(1)).
  healthcare: ['privacy', 'ai-governance'],
  // prd-requirements and user-research-personas carry data-protection-by-design
  // (GDPR Art 25); AI features in a product make the firm an AI Act provider.
  'product-management': ['privacy', 'ai-governance'],
  // data-governance / data-quality / data-strategy are GDPR Art 5 accuracy and
  // storage limitation, and AI Act Art 10 / ISO 42001 data governance.
  'data-analytics': ['privacy', 'ai-governance'],
  // ux-research-plan's prompt already mandates "consent, data handling,
  // anonymisation plan"; design-system work is GDPR Art 25 by-design territory.
  design: ['privacy'],
  // digital-service-design and regulatory-impact-assessment for public bodies:
  // GDPR applies to authorities, and AI Act Annex III(5) + the Art 27
  // fundamental-rights impact assessment bind public-sector deployers.
  government: ['procurement', 'privacy', 'ai-governance'],
  'public-sector': ['procurement', 'privacy', 'ai-governance'],
  // esg-adjusted-financial-reporting cites CSRD/ESRS by reference; the
  // financial-statement and internal-controls modules sit on directors'
  // accounting-records and financial-statement duties.
  accounting: ['esg', 'corporate-governance'],
  // Retail advice for "financial planners, wealth advisors": suitability and
  // consumer-outcome rules (MiFID II Art 24-25, FCA Consumer Duty, CBI CPC).
  'personal-finance': ['financial-conduct'],
  // The consumer acquis (Wave 8, 2026-09-18). 'consumer-rights' is the area.json
  // id of the consumer-protection/ directory. 'marketing' is here because a green
  // claim is judged under the UCPD as amended, and that is where claims are written.
  'consumer-rights': ['consumer-protection', 'privacy'],
  'consumer-legal': ['consumer-protection'],
  marketing: ['consumer-protection', 'online-safety', 'privacy', 'ai-governance'],
};

let domainToFrameworks: Map<GapDomain, string[]> | null = null;

function invertDomains(): Map<GapDomain, string[]> {
  if (domainToFrameworks) return domainToFrameworks;
  const m = new Map<GapDomain, string[]>();
  for (const [frameworkId, domain] of Object.entries(FRAMEWORK_DOMAINS)) {
    const arr = m.get(domain) ?? [];
    arr.push(frameworkId);
    m.set(domain, arr);
  }
  domainToFrameworks = m;
  return m;
}

/**
 * Framework ids that may ground a run in `areaId` when the query does not
 * name a regulation ("weak scope"). Empty for an unmapped area — the retriever
 * then grounds only frameworks the user named explicitly.
 */
export function frameworksForArea(areaId: string | null | undefined): string[] {
  if (!areaId) return [];
  const domains = AREA_DOMAINS[areaId];
  if (!domains) return [];
  const inverted = invertDomains();
  const out = new Set<string>();
  for (const d of domains) for (const f of inverted.get(d) ?? []) out.add(f);
  return [...out];
}

/** A knowledge pack as the pack layer sees it. */
export interface PackAreaInput {
  display_name?: string | null;
  regulatory_area?: string | null;
  /** JSON array string or array of regulation ids/names. */
  regulation_ids?: string | string[] | null;
}

/** Keyword rules: if the pack's text matches `match`, it belongs to `areas`. */
const PACK_RULES: ReadonlyArray<{ match: RegExp; areas: readonly string[] }> = [
  { match: /\b(aml|cft|cpf|money laundering|fatf|wolfsberg|eba\/gl|amlr|amla|amld|bsa|fincen|mlr 2017|jmlsg|correspondent banking)\b/i,
    areas: ['fcp', 'blockchain', 'banking', 'risk', 'audit', 'legal', 'insurance', 'investment', 'payments-dora', 'mobile-money', 'microfinance', 'islamic-finance'] },
  { match: /\b(sanction|ofac|ofsi|unscr|proliferation)\b/i,
    areas: ['fcp', 'blockchain', 'banking', 'risk', 'audit', 'legal', 'investment', 'payments-dora'] },
  { match: /\b(bribery|corruption|fcpa|uncac)\b/i, areas: ['fcp', 'legal', 'audit', 'risk', 'consulting'] },
  { match: /\b(gdpr|data protection|privacy|ai act|ai governance)\b/i,
    areas: ['data-privacy', 'legal', 'cyber', 'software-eng', 'coding', 'hr', 'healthcare', 'marketing', 'product-management',
      // Wave 1: kept in step with AREA_DOMAINS — these areas can now be
      // grounded in privacy / ai-governance frameworks, so a privacy or AI
      // pack must reach them too.
      'branding', 'comms-pr', 'data-analytics', 'design', 'government', 'public-sector'] },
  { match: /\b(dora|nis2|cyber|digital resilience|ict|cybersecurity)\b/i,
    areas: ['payments-dora', 'cyber', 'banking', 'insurance', 'software-eng', 'risk', 'fcp',
      // crisis-comms-response works the DORA/NIS2 incident-notification clock.
      'comms-pr'] },
  { match: /\b(mifid|mifir|mar\b|csmad|emir|sftr|aifmd|ucits|priips|capital markets|investment services|investment funds|asset management|market integrity)\b/i,
    areas: ['investment', 'banking', 'pe-vc', 'legal', 'fcp'] },
  { match: /\b(crr|crd|prudential|basel|mica|crypto|virtual asset|stablecoin)\b/i,
    areas: ['banking', 'blockchain', 'fcp', 'risk', 'investment'] },
  // 'accounting' ships esg-adjusted-financial-reporting (CSRD/ESRS into the
  // financial statements), so a CSRD pack belongs there as well.
  { match: /\b(esg|csrd|sfdr|taxonomy|sustainable)\b/i, areas: ['esg', 'banking', 'investment', 'legal', 'consulting', 'accounting'] },
  // 'workers-rights' and 'consumer-legal' are the two areas whose modules are
  // *about* employment rights; they were routed nowhere.
  { match: /\b(employment|labou?r|working time|equal treatment|pay transparency|platform work)\b/i,
    areas: ['hr', 'legal', 'workers-rights', 'consumer-legal'] },
  { match: /\b(competition|merger|procurement|company law|corporate|civil|litigation|dispute|intellectual property|licensing|trade mark|tfeu)\b/i,
    areas: ['legal', 'consulting', 'startups', 'pe-vc', 'public-sector', 'government', 'procure'] },
  { match: /\b(psd2|psd3|psr|payment services|payment infrastructure|swift|iso 20022|tfr)\b/i,
    areas: ['payments-dora', 'banking', 'fcp', 'mobile-money', 'blockchain'] },
  { match: /\b(insurance|reinsurance|solvency)\b/i, areas: ['insurance', 'fcp', 'risk'] },
  // 'consumer-legal' and 'credit-navigator' are consumer-facing rights areas
  // that a consumer-protection or consumer-credit pack must reach.
  { match: /\b(microfinance|financial inclusion|consumer protection|consumer credit|bop\b)/i,
    areas: ['microfinance', 'mobile-money', 'personal-finance-bop', 'consumer-rights', 'consumer-legal', 'credit-navigator',
      'micro-business', 'personal-finance', 'fcp'] },
  // marketing and branding publish the content the online-safety and
  // advertising rules bite on.
  { match: /\b(online safety|eccta|multi-domain)\b/i,
    areas: ['fcp', 'legal', 'cyber', 'data-privacy', 'comms-pr', 'marketing', 'branding'] },
];

function packText(p: PackAreaInput): string {
  let regs = '';
  if (Array.isArray(p.regulation_ids)) regs = p.regulation_ids.join(' ');
  else if (typeof p.regulation_ids === 'string') {
    try { const parsed = JSON.parse(p.regulation_ids) as unknown; regs = Array.isArray(parsed) ? parsed.join(' ') : p.regulation_ids; }
    catch { regs = p.regulation_ids; }
  }
  return `${p.regulatory_area ?? ''} ${p.display_name ?? ''} ${regs}`;
}

/**
 * The areas a pack belongs to, or 'all' when no rule matches (unmapped packs
 * are never hidden).
 */
export function areasForPack(p: PackAreaInput): ReadonlySet<string> | 'all' {
  const text = packText(p);
  const out = new Set<string>();
  for (const rule of PACK_RULES) {
    if (rule.match.test(text)) for (const a of rule.areas) out.add(a);
  }
  return out.size === 0 ? 'all' : out;
}

/** True when the pack belongs in a run in `areaId` (or when there is no area to gate on). */
export function packAppliesToArea(p: PackAreaInput, areaId: string | null | undefined): boolean {
  if (!areaId) return true;
  const areas = areasForPack(p);
  return areas === 'all' || areas.has(areaId);
}
