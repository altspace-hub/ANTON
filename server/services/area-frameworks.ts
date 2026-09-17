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

/** The Gap Assessor domains a Work area is allowed to be grounded in. */
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
  legal: ['corporate-governance', 'compliance', 'privacy', 'anti-bribery'],
  audit: ['compliance', 'corporate-governance', 'aml'],
  risk: ['aml', 'ict-resilience', 'compliance'],
  esg: ['esg'],
  'software-eng': ['ai-governance', 'privacy', 'infosec'],
  coding: ['ai-governance', 'infosec'],
  hr: ['privacy'],
  'mobile-money': ['aml', 'financial-conduct'],
  microfinance: ['aml', 'financial-conduct'],
  'islamic-finance': ['financial-conduct', 'aml'],
  'comms-pr': ['online-safety'],
  marketing: ['online-safety', 'privacy'],
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
    areas: ['data-privacy', 'legal', 'cyber', 'software-eng', 'coding', 'hr', 'healthcare', 'marketing', 'product-management'] },
  { match: /\b(dora|nis2|cyber|digital resilience|ict|cybersecurity)\b/i,
    areas: ['payments-dora', 'cyber', 'banking', 'insurance', 'software-eng', 'risk', 'fcp'] },
  { match: /\b(mifid|mifir|mar\b|csmad|emir|sftr|aifmd|ucits|priips|capital markets|investment services|investment funds|asset management|market integrity)\b/i,
    areas: ['investment', 'banking', 'pe-vc', 'legal', 'fcp'] },
  { match: /\b(crr|crd|prudential|basel|mica|crypto|virtual asset|stablecoin)\b/i,
    areas: ['banking', 'blockchain', 'fcp', 'risk', 'investment'] },
  { match: /\b(esg|csrd|sfdr|taxonomy|sustainable)\b/i, areas: ['esg', 'banking', 'investment', 'legal', 'consulting'] },
  { match: /\b(employment|labou?r|working time|equal treatment)\b/i, areas: ['hr', 'legal'] },
  { match: /\b(competition|merger|procurement|company law|corporate|civil|litigation|dispute|intellectual property|licensing|trade mark|tfeu)\b/i,
    areas: ['legal', 'consulting', 'startups', 'pe-vc', 'public-sector', 'government'] },
  { match: /\b(psd2|psd3|psr|payment services|payment infrastructure|swift|iso 20022|tfr)\b/i,
    areas: ['payments-dora', 'banking', 'fcp', 'mobile-money', 'blockchain'] },
  { match: /\b(insurance|reinsurance|solvency)\b/i, areas: ['insurance', 'fcp', 'risk'] },
  { match: /\b(microfinance|financial inclusion|consumer protection|bop\b)/i,
    areas: ['microfinance', 'mobile-money', 'personal-finance-bop', 'consumer-rights', 'micro-business', 'fcp'] },
  { match: /\b(online safety|eccta|multi-domain)\b/i, areas: ['fcp', 'legal', 'cyber', 'data-privacy', 'comms-pr'] },
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
