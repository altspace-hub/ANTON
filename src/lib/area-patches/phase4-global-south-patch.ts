// Patch for Phase 4 Global South areas
// Areas: islamic-finance, mobile-money, microfinance, government
// Generated: 2026-02-23

import type { ModuleDefinition } from "../types";

// Islamic Finance & Banking

export const ISLAMIC_FINANCE_MODULES: ModuleDefinition[] = [
  {
    id: "green-sustainable-sukuk",
    label: "Green & Sustainable Sukuk Framework",
    shortLabel: "Green Sukuk",
    icon: "Leaf",
    description: "Structure ESG-compliant Islamic bonds (sukuk) combining Sharia requirements with green/sustainability frameworks. Covers use-of-proceeds, reporting, third-party review, and investor requirements.",
    color: "adv-teal",
    defaults: {
      thinking: "investigate",
      creativity: "strict",
      outputFormats: ["policy-document","detailed-findings"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "ICMA Green Bond Principles, Climate Bonds Standard, ASEAN Green Bond Standards, AAOIFI sukuk standards, SC Malaysia SRI Sukuk Framework" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "islamic-product-review",
    label: "Islamic Product Review",
    shortLabel: "Product Review",
    icon: "ClipboardCheck",
    description: "Detailed review of Islamic finance products for Sharia compliance, documentation completeness, regulatory requirements, and operational soundness.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["detailed-findings","decision-memo"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "AAOIFI Sharia Standards by product type, national Sharia board resolutions, product documentation requirements" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "islamic-treasury-liquidity",
    label: "Islamic Treasury & Liquidity Management",
    shortLabel: "Islamic Treasury",
    icon: "BarChart3",
    description: "Manage Sharia-compliant treasury and liquidity operations including interbank placements, Murabaha facilities, Wakala deposits, and IFSB liquidity coverage ratio compliance.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["detailed-findings","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "IFSB-12 liquidity risk management, AAOIFI treasury standards, commodity Murabaha structures, IFSB High-Quality Liquid Assets for Islamic banks" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "islamic-window-assessment",
    label: "Islamic Window Assessment",
    shortLabel: "Window Assessment",
    icon: "Building2",
    description: "Assess conventional banks' Islamic window operations for Sharia compliance, ring-fencing from conventional funds, governance, and regulatory requirements.",
    color: "adv-teal",
    defaults: {
      thinking: "investigate",
      creativity: "strict",
      outputFormats: ["detailed-findings","gap-scoring-matrix"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "IFSB Islamic window guidelines, national regulations on conventional bank Islamic operations, ring-fencing requirements" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "profit-rate-benchmark-transition",
    label: "Profit-Rate Benchmark Transition",
    shortLabel: "Benchmark Transition",
    icon: "ArrowRightLeft",
    description: "Manage transition from IBOR benchmarks to risk-free rates for Islamic finance products while maintaining Sharia compliance and addressing reference rate uncertainty.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["impact-assessment","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "IBOR to RFR transition guidance, AAOIFI benchmark transition guidance, ISDA Islamic finance IBOR fallbacks, SOFR SONIA alternatives for Islamic products" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "sharia-board-governance",
    label: "Sharia Board Governance Framework",
    shortLabel: "Sharia Governance",
    icon: "Users",
    description: "Design or review Sharia governance frameworks including board composition, terms of reference, fatwas, audit processes, and regulatory compliance with IFSB-10 and local requirements.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["policy-document","detailed-findings"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "IFSB-10 Sharia Governance Systems, AAOIFI Governance Standards, national Sharia governance regulations" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "sharia-compliance-assessment",
    label: "Sharia Compliance Assessment",
    shortLabel: "Sharia Assessment",
    icon: "CheckCircle",
    description: "Comprehensive Sharia compliance assessment for financial products, services, and operations against AAOIFI standards, IFSB guidelines, and local Sharia board requirements.",
    color: "adv-teal",
    defaults: {
      thinking: "investigate",
      creativity: "strict",
      outputFormats: ["detailed-findings","gap-scoring-matrix","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "AAOIFI Sharia Standards, IFSB guidelines, fatwa references, national Sharia board rulings" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "sukuk-structuring",
    label: "Sukuk Structuring Guide",
    shortLabel: "Sukuk Structuring",
    icon: "GitBranch",
    description: "Structure Sharia-compliant sukuk (Islamic bonds) from inception through documentation. Covers asset selection, SPV structuring, Sharia documentation, pricing, and regulatory requirements.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["detailed-findings","decision-memo"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "AAOIFI Sharia Standard No. 17 (Investment Sukuk), IFSB capital markets standards, global sukuk market precedents" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "waqf-asset-management",
    label: "Waqf Asset Management",
    shortLabel: "Waqf Management",
    icon: "Wallet",
    description: "Manage Islamic endowment (waqf) assets covering governance, investment, maintenance, beneficiary management, and Sharia-compliant development strategies.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["policy-document","impact-assessment"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "AAOIFI waqf standards, national waqf authority regulations, Islamic real estate investment frameworks" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "zakat-compliance",
    label: "Zakat Compliance & Calculation",
    shortLabel: "Zakat",
    icon: "Calculator",
    description: "Calculate and manage zakat obligations for Islamic financial institutions and corporates, including nisab assessment, calculation methodology, distribution, and regulatory reporting.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["detailed-findings","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "AAOIFI Sharia Standard No. 35 (Zakah), national zakat authority regulations, corporate zakat calculation methodologies" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// Mobile Money & Digital Finance

export const MOBILE_MONEY_MODULES: ModuleDefinition[] = [
  {
    id: "agent-banking-oversight",
    label: "Agent Banking Oversight",
    shortLabel: "Agent Oversight",
    icon: "Users",
    description: "Design and assess agent banking oversight programs including due diligence, training, monitoring, liquidity management, and fraud prevention.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["gap-scoring-matrix","policy-document"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "GSMA agent banking guidelines, CGAP agent banking research, CBK agent banking regulations, World Bank agent banking toolkit" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "cross-border-mobile-payments",
    label: "Cross-Border Mobile Payment Compliance",
    shortLabel: "Cross-Border Payments",
    icon: "Globe",
    description: "Compliance framework for cross-border mobile payment corridors. Covers FATF Travel Rule implementation, correspondent relationships, regulatory approvals in multiple jurisdictions, and AML monitoring for cross-border flows.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["gap-scoring-matrix","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "FATF Recommendation 16 (Travel Rule / Wire Transfer Rule), GSMA international transfer guidelines, EAC payments integration, CEMAC payment regulations, AfricaNenda fast payment systems, ECOWAS payment framework" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "digital-lending-compliance",
    label: "Digital Lending Compliance",
    shortLabel: "Digital Lending",
    icon: "CreditCard",
    description: "Regulatory compliance for digital lending products covering consumer protection, interest rate caps, credit bureau reporting, data usage, and fair lending requirements.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["gap-scoring-matrix","policy-document"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Digital credit consumer protection frameworks, CBK digital credit providers regulations, Nigeria FCCPC digital lending guidelines, BSP digital lending circulars, interest rate cap regulations by jurisdiction" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "emi-licensing-guide",
    label: "E-Money Issuer Licensing Guide",
    shortLabel: "EMI Licensing",
    icon: "FileText",
    description: "Step-by-step guide through EMI licence application processes. Covers capital requirements, governance, AML/CFT programme requirements, and common rejection reasons.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["decision-memo","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "EMI licensing requirements by jurisdiction, CBK payment service provider guidelines, BSP e-money licensing, EU Electronic Money Directive 2, PSD2 authorisation requirements, MAS payment services act" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "fintech-sandbox-application",
    label: "Fintech Regulatory Sandbox Application",
    shortLabel: "Sandbox Application",
    icon: "FlaskConical",
    description: "Prepare regulatory sandbox applications. Covers eligibility criteria, test parameters, consumer protection safeguards, and graduation pathway to full licensing.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["decision-memo","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Regulatory sandbox frameworks by jurisdiction, CBK Kenya fintech sandbox, Bank of Ghana fintech regulatory sandbox, MAS Singapore fintech regulatory sandbox, FCA sandbox programme, ADGM RegLab, FSRA sandbox" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "mobile-money-aml",
    label: "Mobile Money AML/CFT Program",
    shortLabel: "Mobile Money AML",
    icon: "AlertTriangle",
    description: "AML/CFT programme design and assessment for mobile money operators. Covers tiered transaction limits, suspicious activity indicators, monitoring rules, STR/SAR processes, and FATF guidance compliance.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["gap-scoring-matrix","detailed-findings","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "FATF guidance on MVTS and mobile money, GSMA MMU AML/CFT toolkit, FATF typologies on mobile payment ML, national FIU guidance on STR for mobile money" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "mobile-money-compliance-framework",
    label: "Mobile Money Compliance Framework",
    shortLabel: "Compliance Framework",
    icon: "Shield",
    description: "Comprehensive compliance framework for mobile money operators covering licensing, tiered KYC, AML/CFT obligations, agent oversight, and consumer protection requirements.",
    color: "adv-teal",
    defaults: {
      thinking: "investigate",
      creativity: "strict",
      outputFormats: ["gap-scoring-matrix","policy-document","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "GSMA Code of Conduct for Mobile Money Providers, FATF Recommendation 14 (MVTS), national central bank payment service provider frameworks, tiered KYC regulations" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// Microfinance

export const MICROFINANCE_MODULES: ModuleDefinition[] = [
  {
    id: "financial-inclusion-strategy",
    label: "Financial Inclusion Strategy Design",
    shortLabel: "Inclusion Strategy",
    icon: "Target",
    description: "Design comprehensive financial inclusion strategies for governments, central banks, development organizations, and private sector actors. Covers demand-side barriers, supply-side gaps, regulatory enablers, and measurement frameworks.",
    color: "adv-teal",
    defaults: {
      thinking: "investigate",
      creativity: "balanced",
      outputFormats: ["executive-summary","action-plan","impact-assessment"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "AFI Maya Declaration, G20 GPFI principles, Global Findex database, FinScope surveys, financial inclusion measurement frameworks, UNSGSA annual reports, World Bank financial inclusion data" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "group-lending-risk",
    label: "Group Lending Risk Assessment",
    shortLabel: "Group Lending Risk",
    icon: "Users",
    description: "Risk assessment of group/solidarity lending portfolios covering credit risk, over-indebtedness, group cohesion, portfolio quality indicators, and stress testing.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["detailed-findings","gap-scoring-matrix"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "MFI portfolio risk management, PAR calculation methodology, group lending credit risk, over-indebtedness indicators, CGAP portfolio analysis, MIX Market benchmarks" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "islamic-microfinance",
    label: "Islamic Microfinance — Qard Hasan Framework",
    shortLabel: "Islamic Microfinance",
    icon: "Landmark",
    description: "Design Sharia-compliant microfinance programs covering product structuring, Sharia governance, regulatory compliance, and sustainability for Islamic MFIs and Qard Hasan funds.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["policy-document","decision-memo"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "AAOIFI Sharia standards, IFSB Islamic microfinance guidance, Qard Hasan product structures, Islamic Development Bank microfinance research, Pakistan SBP Islamic banking regulations, Indonesia OJK Islamic microfinance" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "mfi-regulatory-compliance",
    label: "MFI Regulatory Compliance Assessment",
    shortLabel: "MFI Compliance",
    icon: "ClipboardCheck",
    description: "Regulatory compliance assessment for microfinance institutions covering licensing, capital adequacy, consumer protection, AML/CFT obligations, and reporting requirements.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["gap-scoring-matrix","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "CBK Microfinance Act 2006 Kenya, CBN Microfinance Policy Nigeria, RBI NBFC-MFI directions India, Bangladesh MRA Act, CGAP regulatory frameworks for MFIs" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "microfinance-credit-scoring",
    label: "Microfinance Credit Scoring Design",
    shortLabel: "Credit Scoring",
    icon: "BarChart3",
    description: "Design and review credit scoring models for micro-borrowers without formal financial history. Covers alternative data sources, proxy indicators, model validation, and responsible lending integration.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["detailed-findings","decision-memo"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Alternative credit scoring for unbanked, psychometric credit scoring research, mobile money data for credit, CGAP fintech and financial inclusion research, responsible AI in credit scoring" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "social-performance-reporting",
    label: "Social Performance Measurement & Reporting",
    shortLabel: "Social Performance",
    icon: "Heart",
    description: "Measure and report social performance of microfinance institutions using SPI4, USSPM, and other frameworks. Supports investor reporting, rating agency requirements, and social mission management.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["detailed-findings","impact-assessment"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "CERISE SPI4 methodology, Universal Standards for Social Performance Management (USSPM), Client Protection Principles, Smart Campaign, SPTF, MIX Market social performance reporting, impact investment reporting standards" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// Government & Public Sector

export const GOVERNMENT_MODULES: ModuleDefinition[] = [
  {
    id: "digital-service-design",
    label: "Government Digital Service Design",
    shortLabel: "Digital Service",
    icon: "Monitor",
    description: "Design citizen-centred government digital services. Applies GDS (Government Digital Service) principles, accessibility standards, and inclusive design for public services.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["detailed-findings","action-plan","project-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "GDS service standards and design patterns, GOV.UK design system, WCAG 2.1 accessibility standards, once-only principle, assisted digital, service assessment process, government API economy, developing country mobile-first digital services, service performance measurement, digital exclusion" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "grant-application-writer",
    label: "Grant Application Writer",
    shortLabel: "Grant Writing",
    icon: "Award",
    description: "Write compelling government and NGO grant applications. Covers logic models, theory of change, monitoring and evaluation frameworks, and funder-specific requirements.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["policy-document","executive-summary"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Grant writing for EU Horizon, UKRI, World Bank, Gates Foundation, government programmes. Theory of change, logic models, SMART objectives, M&E frameworks, budget justification, consortium arrangements, review panel criteria, common rejection reasons." },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "policy-analysis-brief",
    label: "Policy Analysis & Brief Writer",
    shortLabel: "Policy Brief",
    icon: "FileText",
    description: "Analyse policy options systematically and write clear policy briefs. Covers option appraisal, evidence synthesis, stakeholder analysis, and recommendation frameworks.",
    color: "adv-teal",
    defaults: {
      thinking: "investigate",
      creativity: "balanced",
      outputFormats: ["executive-summary","decision-memo","detailed-findings"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Policy analysis frameworks: HM Treasury Green Book, OECD Better Regulation principles, EU Better Regulation, public value theory, option appraisal, cost-benefit analysis, stakeholder analysis, evidence assessment" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "public-consultation-response",
    label: "Public Consultation Response",
    shortLabel: "Consultation Response",
    icon: "MessageSquare",
    description: "Draft effective consultation responses to government, regulatory, and international consultations. Structured argumentation, evidence citation, and policy recommendation writing.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["detailed-findings","decision-memo"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Public consultation best practice, consultation response structure, argumentation and evidence standards, regulatory consultation conventions (FATF, EU, UK Parliamentary inquiries), how officials read and process responses" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "regulatory-impact-assessment",
    label: "Regulatory Impact Assessment",
    shortLabel: "RIA",
    icon: "Scale",
    description: "Conduct regulatory impact assessments to evaluate proposed regulations. Covers compliance costs, economic impacts, SME effects, and OECD better regulation principles.",
    color: "adv-teal",
    defaults: {
      thinking: "think_hard",
      creativity: "strict",
      outputFormats: ["detailed-findings","impact-assessment","decision-memo"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: "Regulatory impact assessment methodology: OECD RIA best practice, EU Better Regulation REFIT, UK Regulatory Policy Committee standards, SME impact test, compliance cost calculation, Standard Cost Model, sunset clauses, monitoring and evaluation design" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: "stakeholder-engagement-plan",
    label: "Stakeholder Engagement Plan",
    shortLabel: "Stakeholder Engagement",
    icon: "Network",
    description: "Design stakeholder engagement strategies for policy development, regulatory reform, and public service transformation. Covers mapping, methods, communication, and evaluation.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["project-plan","action-plan"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Stakeholder engagement strategy: power-interest mapping, engagement ladder (Arnstein), IAP2 spectrum, method selection for different stakeholder types, hard-to-reach groups, digital engagement limitations, deliberative democracy (citizens assemblies, consensus conferences), hostile stakeholder management, political considerations" },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

export const PHASE4_GLOBAL_SOUTH_MODULES: ModuleDefinition[] = [
  ...ISLAMIC_FINANCE_MODULES,
  ...MOBILE_MONEY_MODULES,
  ...MICROFINANCE_MODULES,
  ...GOVERNMENT_MODULES,
];
