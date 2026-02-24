// Patch for Phase 4 Professional areas
// Areas: marketing, tax-transfer-pricing, design, journalism, data-privacy, product-management
// Generated: 2026-02-23

import type { ModuleDefinition } from "../types";

// Marketing & Digital Marketing

export const MARKETING_MODULES: ModuleDefinition[] = [
  {
    id: "customer-journey-mapping",
    label: "Customer Journey Mapping",
    shortLabel: "Journey Map",
    icon: "Users",
    description: "Map and optimise customer journeys across all touchpoints from first awareness through to advocacy. Identify friction points, moments of truth, and high-impact improvement opportunities.",
    color: "adv-blue",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["detailed-findings","action-plan","quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Customer journey frameworks, CX best practices, touchpoint analysis methodologies" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "digital-campaign-planner",
    label: "Digital Campaign Planner",
    shortLabel: "Campaign Plan",
    icon: "BarChart2",
    description: "Plan multi-channel digital campaigns with objectives, audience targeting, channel allocation, budget splits, creative briefs, KPIs, and measurement frameworks.",
    color: "adv-blue",
    defaults: {
      thinking: "think_hard",
      creativity: "balanced",
      outputFormats: ["project-plan","action-plan","quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Digital advertising benchmarks, channel best practices, audience targeting options" },
        localFolder: { enabled: false, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "email-marketing-automation",
    label: "Email Marketing & Automation",
    shortLabel: "Email / Automation",
    icon: "Mail",
    description: "Design email marketing strategies, segmentation frameworks, automation flows, lifecycle campaigns, and deliverability improvement plans for B2B and B2C programmes.",
    color: "adv-blue",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["action-plan","project-plan","detailed-findings"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Email marketing best practices, automation frameworks, deliverability standards, GDPR/CAN-SPAM compliance" },
        localFolder: { enabled: false, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "market-research-competitive",
    label: "Market Research & Competitive Analysis",
    shortLabel: "Market Research",
    icon: "Megaphone",
    description: "Conduct structured competitive landscape analysis, market sizing, customer segment research, and opportunity assessments to inform strategic decisions.",
    color: "adv-blue",
    defaults: {
      thinking: "investigate",
      creativity: "balanced",
      outputFormats: ["detailed-findings","executive-summary","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Competitive intelligence, market sizing, industry trends, company research" },
        localFolder: { enabled: false, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "marketing-analytics-roi",
    label: "Marketing Analytics & ROI",
    shortLabel: "Analytics / ROI",
    icon: "Target",
    description: "Analyse marketing performance data, build attribution frameworks, calculate ROI by channel, identify optimisation opportunities, and recommend measurement infrastructure improvements.",
    color: "adv-blue",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["detailed-findings","action-plan","executive-summary"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Marketing attribution models, analytics frameworks, performance benchmarks" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "marketing-strategy",
    label: "Marketing Strategy Builder",
    shortLabel: "Strategy",
    icon: "TrendingUp",
    description: "Create comprehensive marketing strategies aligned to business objectives. Covers market positioning, audience segmentation, channel mix, value proposition, competitive differentiation, and go-to-market planning.",
    color: "adv-blue",
    defaults: {
      thinking: "investigate",
      creativity: "balanced",
      outputFormats: ["executive-summary","action-plan","detailed-findings"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Marketing strategy frameworks, competitive intelligence, industry benchmarks" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "seo-content-strategy",
    label: "SEO & Content Strategy",
    shortLabel: "SEO / Content",
    icon: "Search",
    description: "Develop SEO audit findings, keyword strategy, content pillars, and an editorial plan to drive organic search growth and establish topical authority.",
    color: "adv-blue",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["action-plan","detailed-findings","project-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "SEO best practices, Google Search quality guidelines, Core Web Vitals, E-E-A-T, content marketing frameworks" },
        localFolder: { enabled: false, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "social-media-strategy",
    label: "Social Media Strategy",
    shortLabel: "Social Media",
    icon: "Share2",
    description: "Build a coherent social media presence strategy: platform selection, content pillars, posting cadence, community management, influencer approach, and organic growth tactics.",
    color: "adv-blue",
    defaults: {
      thinking: "think",
      creativity: "creative",
      outputFormats: ["action-plan","project-plan","quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Social media platform algorithm updates, content format trends, engagement benchmarks by industry" },
        localFolder: { enabled: false, folderPaths: [], recursive: true },
      },
    },
  },
];

// Tax & Transfer Pricing

export const TAX_TP_MODULES: ModuleDefinition[] = [
  {
    id: "cross-border-transaction-advisor",
    label: "Cross-Border Transaction Advisor",
    shortLabel: "Cross-Border",
    icon: "Globe",
    description: "Analyse the tax implications of international transactions: withholding taxes, double tax treaties, permanent establishment risk, exit taxation, hybrid instruments, and supply chain structuring.",
    color: "adv-gold",
    defaults: {
      thinking: "investigate",
      creativity: "strict",
      outputFormats: ["decision-memo","detailed-findings","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "OECD Model Convention, bilateral tax treaties, ATAD, BEPS, WHT rates, PE rules" },
        localFolder: { enabled: false, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "tax-authority-audit-response",
    label: "Tax Authority Audit Response",
    shortLabel: "Audit Response",
    icon: "Scale",
    description: "Prepare responses to tax authority examinations, information document requests (IDRs), formal assessments, and transfer pricing challenges. Structure factual narratives, legal arguments, and negotiation positions.",
    color: "adv-gold",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["decision-memo","detailed-findings","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Tax audit procedures, OECD dispute resolution, MAP procedures, BEPS Action 14" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "tax-compliance-health-check",
    label: "Tax Compliance Health Check",
    shortLabel: "Health Check",
    icon: "ClipboardCheck",
    description: "Assess an entity's tax compliance status across all material tax types and jurisdictions. Identify filing gaps, payment exposures, procedural weaknesses, and governance deficiencies before a tax authority does.",
    color: "adv-gold",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["gap-scoring-matrix","executive-summary","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Corporate tax compliance requirements, filing obligations, penalty regimes" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "tax-incentive-navigator",
    label: "Tax Incentive & Relief Navigator",
    shortLabel: "Tax Incentives",
    icon: "Calculator",
    description: "Identify available tax incentives, credits, and reliefs including R&D tax credits, patent boxes, free zone benefits, investment allowances, and grant schemes. Assess eligibility conditions, Pillar Two interaction, and implementation steps.",
    color: "adv-gold",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["decision-memo","action-plan","executive-summary"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "R&D tax credits, patent boxes, free zone regimes, Pillar Two SBIE/QRDP interaction, EU state aid rules" },
        localFolder: { enabled: false, folderPaths: [], recursive: false },
      },
    },
  },
  {
    id: "tax-provision-reporting",
    label: "Tax Provision & Reporting",
    shortLabel: "Tax Provision",
    icon: "Receipt",
    description: "Prepare and review corporate tax provisions under IFRS (IAS 12) or US GAAP (ASC 740). Analyse deferred tax positions, uncertain tax positions (UTPs), effective tax rate (ETR), and Pillar Two GloBE top-up tax disclosures.",
    color: "adv-gold",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["detailed-findings","executive-summary"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "IAS 12 Income Taxes, ASC 740, IFRS 17, Pillar Two GloBE top-up tax accounting" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "tax-risk-assessment",
    label: "Tax Risk Assessment",
    shortLabel: "Tax Risk",
    icon: "Scale",
    description: "Identify, score, and prioritise tax risks across the business. Map risks to likelihood and financial exposure, assign ownership, and produce a board-ready risk register with remediation roadmap.",
    color: "adv-gold",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["gap-scoring-matrix","executive-summary","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Tax risk frameworks, OECD guidance, HMRC CCAB tax risk management, EU tax governance" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "transfer-pricing-documentation",
    label: "Transfer Pricing Documentation",
    shortLabel: "TP Docs",
    icon: "FileSearch",
    description: "Draft and structure transfer pricing documentation in compliance with OECD BEPS Action 13: Master File, Local File, and Country-by-Country Report. Includes functional analysis, benchmarking guidance, and policy narratives.",
    color: "adv-gold",
    defaults: {
      thinking: "investigate",
      creativity: "strict",
      outputFormats: ["detailed-findings","policy-document","executive-summary"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "OECD Transfer Pricing Guidelines 2022, BEPS Action 13, local TP documentation requirements" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "vat-gst-compliance",
    label: "VAT/GST Compliance Review",
    shortLabel: "VAT/GST",
    icon: "Receipt",
    description: "Review indirect tax compliance across the supply chain. Identify registration obligations, input tax recovery issues, cross-border supply classification, reverse charge obligations, and e-invoicing requirements.",
    color: "adv-gold",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["gap-scoring-matrix","action-plan","regulatory-comparison"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "EU VAT Directive, OECD VAT/GST guidelines, e-invoicing mandates, digital supply place-of-supply rules" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// Design & UX

export const DESIGN_MODULES: ModuleDefinition[] = [
  {
    id: "design-system-foundation",
    label: "Design System Foundation",
    shortLabel: "Design System",
    icon: "Component",
    description: "Create the foundational specifications for a design system: design tokens, component inventory, accessibility standards, governance model, and documentation approach.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["policy-document","detailed-findings"],
      knowledgeSources: {

      },
    },
  },
  {
    id: "information-architecture",
    label: "Information Architecture",
    shortLabel: "IA Design",
    icon: "GitBranch",
    description: "Design content structures, navigation systems, and labelling strategies for websites, apps, and intranets. Includes card sort analysis and tree testing design.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["detailed-findings","policy-document"],
      knowledgeSources: {

      },
    },
  },
  {
    id: "service-design-blueprint",
    label: "Service Design Blueprint",
    shortLabel: "Service Blueprint",
    icon: "Map",
    description: "Map the end-to-end service experience across all channels and touchpoints. Align front-stage interactions with back-stage processes, systems, and support structures.",
    color: "adv-teal",
    defaults: {
      thinking: "investigate",
      creativity: "balanced",
      outputFormats: ["detailed-findings","project-plan"],
      knowledgeSources: {

      },
    },
  },
  {
    id: "usability-audit",
    label: "Usability Audit",
    shortLabel: "Usability Audit",
    icon: "ClipboardCheck",
    description: "Evaluate an existing interface against usability heuristics, accessibility standards, and UX best practices. Produces prioritised findings with severity ratings.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["detailed-findings","action-plan"],
      knowledgeSources: {

      },
    },
  },
  {
    id: "ux-research-plan",
    label: "UX Research Plan",
    shortLabel: "Research Plan",
    icon: "Search",
    description: "Design a rigorous user research methodology: select methods, write discussion guides, define participant criteria, and plan analysis.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["detailed-findings","project-plan"],
      knowledgeSources: {

      },
    },
  },
];

// Journalism & Media

export const JOURNALISM_MODULES: ModuleDefinition[] = [
  {
    id: "article-structure-drafting",
    label: "Article Structure & Drafting",
    shortLabel: "Article Draft",
    icon: "PenTool",
    description: "Structure and draft news articles, features, long-form investigations, and opinion pieces. Develop compelling leads, logical structures, and strong endings.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["policy-document","detailed-findings"],
      knowledgeSources: {

      },
    },
  },
  {
    id: "content-strategy-planning",
    label: "Content Strategy Planning",
    shortLabel: "Content Strategy",
    icon: "BarChart2",
    description: "Develop content strategies for publications, brands, and organisations: audience analysis, content pillars, editorial calendars, channel strategies, and measurement frameworks.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "balanced",
      outputFormats: ["project-plan","executive-summary"],
      knowledgeSources: {

      },
    },
  },
  {
    id: "editorial-quality-review",
    label: "Editorial Quality Review",
    shortLabel: "Editorial Review",
    icon: "CheckCircle",
    description: "Review drafts for accuracy, fairness, structure, clarity, legal risk, and publication readiness. Provides editorial feedback with specific, actionable improvements.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["detailed-findings","action-plan"],
      knowledgeSources: {

      },
    },
  },
  {
    id: "interview-preparation",
    label: "Interview Preparation",
    shortLabel: "Interview Prep",
    icon: "Mic",
    description: "Prepare rigorous interview frameworks: background research, question sets for news, profile, and investigative interviews, and tactics for difficult or evasive subjects.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["action-plan","detailed-findings"],
      knowledgeSources: {

      },
    },
  },
  {
    id: "investigative-research",
    label: "Investigative Research",
    shortLabel: "Investigation",
    icon: "Microscope",
    description: "Plan and execute investigative research: identify sources, build document trails, cross-reference data, identify leads, and structure the investigation methodology.",
    color: "adv-teal",
    defaults: {
      thinking: "investigate",
      creativity: "strict",
      outputFormats: ["detailed-findings","project-plan"],
      knowledgeSources: {

      },
    },
  },
];

// Data Privacy & GDPR

export const DATA_PRIVACY_MODULES: ModuleDefinition[] = [
  {
    id: "breach-response-plan",
    label: "Data Breach Response Plan",
    shortLabel: "Breach Response",
    icon: "AlertOctagon",
    description: "Create and test data breach response plans. Covers detection, containment, assessment (72-hour notification decision), DPA notification, individual notification, and post-incident review.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["policy-document","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "GDPR Articles 33-34, EDPB Guidelines 9/2022 on data breach notification, ENISA breach taxonomy, national DPA breach notification portals" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "cross-border-transfer-assessment",
    label: "Cross-Border Data Transfer Assessment",
    shortLabel: "Transfer Assessment",
    icon: "Globe",
    description: "Assess lawfulness of international data transfers under GDPR Chapter V. Covers adequacy decisions, Standard Contractual Clauses (SCCs 2021), supplementary measures, and Schrems II implications.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["detailed-findings","decision-memo","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "GDPR Chapter V, Schrems II judgment (C-311/18), EU-US Data Privacy Framework, 2021 SCCs, EDPB Transfer Impact Assessment guidance, UK IDTA" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "dpia-builder",
    label: "Data Protection Impact Assessment (DPIA)",
    shortLabel: "DPIA",
    icon: "Search",
    description: "Conduct structured DPIA for new or changed processing activities as required by GDPR Article 35. Covers necessity/proportionality, risk assessment, and risk mitigation measures.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["detailed-findings","decision-memo"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "GDPR Article 35, EDPB Guidelines 9/2022 on DPIAs, national DPA DPIA lists, WP29 Guidelines on DPIAs" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "dsr-handler",
    label: "Data Subject Rights Handler",
    shortLabel: "DSR Handler",
    icon: "User",
    description: "Manage data subject rights requests efficiently and compliantly. Covers process design, identity verification, system searches, exemption assessment, response drafting, and logging.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["action-plan","policy-document"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "GDPR Articles 15-22 (data subject rights), EDPB guidelines on data subject rights, ICO SAR guidance" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "gdpr-compliance-assessment",
    label: "GDPR Compliance Assessment",
    shortLabel: "GDPR Assessment",
    icon: "ShieldCheck",
    description: "Systematic GDPR compliance maturity assessment covering lawful basis, consent management, data subject rights, DPO requirement, ROPA, technical/organisational measures, and processor contracts.",
    color: "adv-teal",
    defaults: {
      thinking: "investigate",
      creativity: "strict",
      outputFormats: ["gap-scoring-matrix","detailed-findings","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "GDPR Regulation 2016/679, EDPB guidelines, national DPA guidance, Article 29 Working Party opinions" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "privacy-notice-drafter",
    label: "Privacy Policy & Notice Drafter",
    shortLabel: "Privacy Notices",
    icon: "FileText",
    description: "Draft GDPR-compliant privacy notices and policies in plain language. Covers all required information elements (Articles 13/14), layered notice approach, and jurisdiction-specific requirements.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["policy-document"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "GDPR Articles 13 and 14, EDPB transparency guidelines, ePrivacy Directive, ICO guidance on privacy notices" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// Product Management

export const PRODUCT_MGMT_MODULES: ModuleDefinition[] = [
  {
    id: "feature-prioritisation",
    label: "Feature Prioritisation Framework",
    shortLabel: "Prioritisation",
    icon: "ListOrdered",
    description: "Apply structured prioritisation frameworks to product backlogs. RICE scoring, MoSCoW analysis, Kano model, dependency mapping, and stakeholder alignment.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "balanced",
      outputFormats: ["gap-scoring-matrix","decision-memo"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Product prioritisation frameworks: RICE, MoSCoW, Kano model, ICE scoring, dependency analysis" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "go-to-market-planning",
    label: "Go-to-Market Planning",
    shortLabel: "GTM Planning",
    icon: "Rocket",
    description: "Plan product launches and market entry strategies. Covers positioning, messaging, channel selection, launch sequencing, pricing, and success metrics.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "balanced",
      outputFormats: ["project-plan","action-plan","executive-summary"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Go-to-market strategy, positioning frameworks, PLG vs SLG models, launch planning, pricing strategy" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "prd-requirements",
    label: "PRD & Requirements Writer",
    shortLabel: "PRD Writer",
    icon: "FileText",
    description: "Write clear product requirements documents, user stories, acceptance criteria, and technical specifications. Structured for engineering teams to implement with confidence.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["policy-document","detailed-findings"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "PRD writing, user story frameworks, acceptance criteria, product specification standards" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "product-analytics-metrics",
    label: "Product Analytics & Metrics",
    shortLabel: "Analytics & Metrics",
    icon: "BarChart2",
    description: "Define product metrics frameworks, OKR metrics, north star metrics, and analytics instrumentation plans. Covers activation, retention, monetisation, and product health metrics.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["detailed-findings","decision-memo"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Product analytics frameworks, north star metrics, HEART framework, AARRR funnel, retention cohort analysis" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "product-strategy-roadmap",
    label: "Product Strategy & Roadmap",
    shortLabel: "Strategy & Roadmap",
    icon: "Map",
    description: "Define product vision, strategy, and roadmap using Jobs-to-Be-Done, opportunity mapping, and outcome-driven planning. Produces a north star vision and prioritised roadmap.",
    color: "adv-teal",
    defaults: {
      thinking: "investigate",
      creativity: "balanced",
      outputFormats: ["executive-summary","decision-memo","project-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Product strategy frameworks, market trends, Jobs-to-Be-Done methodology, OKR design" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "user-research-personas",
    label: "User Research & Persona Builder",
    shortLabel: "User Research",
    icon: "Users",
    description: "Design user research plans, interview guides, and synthesise findings into actionable personas and insights. Covers qualitative and quantitative research methods.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["detailed-findings","decision-memo"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "User research methodologies, JTBD interview techniques, persona development, continuous discovery" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

export const PHASE4_PROFESSIONAL_MODULES: ModuleDefinition[] = [
  ...MARKETING_MODULES,
  ...TAX_TP_MODULES,
  ...DESIGN_MODULES,
  ...JOURNALISM_MODULES,
  ...DATA_PRIVACY_MODULES,
  ...PRODUCT_MGMT_MODULES,
];
