/**
 * gap-domains.ts — which kind of specialist assesses which framework.
 *
 * Every Gap Assessor prompt was hard-coded as "a senior AML/CFT compliance
 * specialist … for Nordic and European financial institutions", and the
 * wizard's entity list was banks only. Of the 60 shipped frameworks, 56 are
 * not AML: DORA, GDPR, ISO 27001, the EU AI Act, NYDFS 500, SOC 2, MiCA …
 * A DORA assessment was judged by the wrong expert and its board pack talked
 * about "AML maturity". All 13 assessments on this instance are AMLR — which
 * is what a tool that is unusable for anything else looks like.
 *
 * The framework files carry no domain field, so the mapping lives here, by
 * framework id, with a conservative generic profile for anything unlisted.
 * Adding a framework means adding one line.
 */

export type GapDomain =
  | 'aml'
  | 'sanctions'
  | 'ict-resilience'
  | 'infosec'
  | 'privacy'
  | 'ai-governance'
  | 'anti-bribery'
  | 'financial-conduct'
  | 'digital-assets'
  | 'esg'
  | 'corporate-governance'
  | 'online-safety'
  | 'compliance';

export const FRAMEWORK_DOMAINS: Record<string, GapDomain> = {
  // AML / CFT
  'amld6-2024': 'aml',
  'amlr-2024': 'aml',
  'fatf-40': 'aml',
  'hk-amlo-vatp': 'aml',
  'ireland-cjmla-2010': 'aml',
  'luxembourg-aml-2004': 'aml',
  'sg-mas-notice-626-2025': 'aml',
  'swiss-amla-revised-2026': 'aml',
  'uae-fdl-10-2025-aml': 'aml',
  'us-bsa-aml-program-2026': 'aml',
  'us-cdd-cip-rules': 'aml',
  'us-ffiec-bsa-aml-exam-manual': 'aml',
  'us-fincen-cta-bo-narrowed-2025': 'aml',
  'us-nydfs-part-504': 'aml',
  'wolfsberg-cbddq': 'aml',
  // Sanctions
  'eba-restrictive-measures-2024': 'sanctions',
  'eu-sanctions-russia-269-833': 'sanctions',
  'uk-ofsi-financial-sanctions-2024': 'sanctions',
  'un-sanctions-baseline': 'sanctions',
  'us-ofac-cfcc-2019': 'sanctions',
  // ICT / operational resilience
  'dora-2022': 'ict-resilience',
  'iso22301-2019': 'ict-resilience',
  'nist-csf-2': 'ict-resilience',
  'us-nydfs-part-500': 'ict-resilience',
  // Information security
  'iso27001-2022': 'infosec',
  'pci-dss-4': 'infosec',
  'soc2-tsc': 'infosec',
  'us-ny-shield-act': 'infosec',
  // Privacy / data protection
  'gdpr-2016': 'privacy',
  'hk-pdpo-cap-486': 'privacy',
  'sg-pdpa-2012': 'privacy',
  'swiss-nfadp-2023': 'privacy',
  'uk-data-use-access-act-2025': 'privacy',
  // AI governance
  'eu-ai-act-2024': 'ai-governance',
  'iso42001-2023': 'ai-governance',
  // Anti-bribery / corporate crime
  'iso37001-2016': 'anti-bribery',
  'uk-eccta-2023': 'anti-bribery',
  // Financial services conduct and prudential
  'hk-sfo-licensing-conduct': 'financial-conduct',
  'ireland-cpc-2026': 'financial-conduct',
  'ireland-iaf-sear-2023': 'financial-conduct',
  'luxembourg-aifmd-ii-2026': 'financial-conduct',
  'luxembourg-cssf-circ-25-901': 'financial-conduct',
  'luxembourg-ucits-2010': 'financial-conduct',
  'mifid2-2014': 'financial-conduct',
  'mifir-2014': 'financial-conduct',
  'solvency2-2009': 'financial-conduct',
  'swiss-finsa-finia': 'financial-conduct',
  'uk-fca-consumer-duty-prin2a': 'financial-conduct',
  'us-nydfs-part-200': 'financial-conduct',
  // Digital assets / payments
  'hk-stablecoins-ordinance-2025': 'digital-assets',
  'mica-2023': 'digital-assets',
  'sg-fsma-dtsp-part9': 'digital-assets',
  'sg-psa-payment-services-2019': 'digital-assets',
  'swiss-leta-2026': 'digital-assets',
  'uae-cbuae-payment-token-services-2024': 'digital-assets',
  'uae-difc-adgm-digital-asset': 'digital-assets',
  'uae-vara-vasp-rulebooks': 'digital-assets',
  // ESG, governance, online safety
  'csrd-esrs': 'esg',
  'ireland-companies-act-2014-director-duties': 'corporate-governance',
  'uk-online-safety-act-2023': 'online-safety',
};

export interface DomainProfile {
  /** Short label used in "Current <label> maturity" and headings. */
  label: string;
  /** Who assesses the articles. */
  assessorPersona: string;
  /** Who synthesises capability themes. */
  advisorPersona: string;
  /** Who briefs the board, and which boards. */
  boardPersona: string;
  /** Who builds the remediation roadmap. */
  programmePersona: string;
}

const P = (label: string, field: string, audience: string): DomainProfile => ({
  label,
  assessorPersona: `senior ${field} specialist`,
  advisorPersona: `senior ${field} transformation advisor with 20+ years of experience implementing ${label} requirements across ${audience}`,
  boardPersona: `senior ${field} advisor with deep experience presenting ${label} matters to boards of ${audience}`,
  programmePersona: `${field} programme manager with extensive experience delivering ${label} remediation programmes for ${audience}`,
});

export const DOMAIN_PROFILES: Record<GapDomain, DomainProfile> = {
  'aml': P('AML/CFT', 'AML/CFT compliance', 'European and international financial institutions'),
  'sanctions': P('sanctions', 'sanctions and export-controls compliance', 'financial institutions and international trading groups'),
  'ict-resilience': P('ICT and operational resilience', 'ICT risk and operational resilience', 'financial entities and their critical ICT providers'),
  'infosec': P('information security', 'information security and controls assurance', 'organisations that handle sensitive data and payment card data'),
  'privacy': P('data protection', 'data protection and privacy', 'controllers and processors in the private and public sector'),
  'ai-governance': P('AI governance', 'AI governance and algorithmic accountability', 'providers and deployers of AI systems'),
  'anti-bribery': P('anti-bribery and corporate-crime', 'anti-bribery and corporate-crime prevention', 'corporate groups and their supply chains'),
  'financial-conduct': P('conduct and prudential', 'financial-services regulatory', 'banks, investment firms, insurers and fund managers'),
  'digital-assets': P('digital-asset and payments', 'crypto-asset and payments regulatory', 'crypto-asset service providers, payment firms and their banking partners'),
  'esg': P('sustainability reporting', 'sustainability reporting and ESG assurance', 'reporting undertakings and their auditors'),
  'corporate-governance': P('corporate governance', 'corporate governance and directors\' duties', 'company boards and company secretaries'),
  'online-safety': P('online safety', 'online safety and platform regulation', 'online platforms and user-to-user services'),
  'compliance': P('regulatory compliance', 'regulatory compliance', 'regulated organisations'),
};

export function frameworkDomain(frameworkId: string): GapDomain {
  return FRAMEWORK_DOMAINS[frameworkId] ?? 'compliance';
}

/** One domain for an assessment: the frameworks' shared domain, or the
 *  generic profile when they mix (an AML + DORA assessment gets a generalist). */
export function domainForFrameworks(frameworkIds: string[]): GapDomain {
  const domains = new Set(frameworkIds.map(frameworkDomain));
  if (domains.size === 1) return [...domains][0];
  return 'compliance';
}

export function domainProfile(domain: GapDomain): DomainProfile {
  return DOMAIN_PROFILES[domain] ?? DOMAIN_PROFILES.compliance;
}
