// ═══════════════════════════════════════════════════════════
// Software Engineering, Sales/Business Development, and
// ESG/Sustainability Area Patch
//
// Adds new operational and consultant modules to three expert
// areas WITHOUT modifying the main constants.ts file.
// ═══════════════════════════════════════════════════════════

import type { ModuleDefinition } from '../types';

// ── Software Engineering — New Operational Modules ─────────

export const SOFTWARE_ENG_NEW_MODULES: ModuleDefinition[] = [
  {
    id: 'code-review-checklist',
    label: 'Code Review Checklist Generator',
    shortLabel: 'Review Checklist',
    icon: 'ClipboardCheck',
    description:
      'Generates comprehensive, language/framework-specific code review checklists from PR descriptions or changed file summaries. Covers security, performance, maintainability, and test coverage.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['action-plan', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
      },
    },
  },
  {
    id: 'release-notes-generator',
    label: 'Release Notes Generator',
    shortLabel: 'Release Notes',
    icon: 'FileOutput',
    description:
      'Transforms commit messages, PR descriptions, and Jira tickets into polished release notes. Produces both technical and user-facing versions.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['quick-briefing', 'stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
      },
    },
  },
  {
    id: 'adr-writer',
    label: 'Architecture Decision Record Writer',
    shortLabel: 'ADR Writer',
    icon: 'BookMarked',
    description:
      'Creates well-structured Architecture Decision Records (ADRs) from technical discussions. Documents context, decision, consequences, and alternatives considered in standard format.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
      },
    },
  },
  {
    id: 'api-documentation-generator',
    label: 'API Documentation Generator',
    shortLabel: 'API Docs',
    icon: 'FileCode2',
    description:
      'Generates comprehensive API documentation from endpoint descriptions, code snippets, or OpenAPI specs. Includes usage examples, error codes, authentication, and rate limiting.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
      },
    },
  },
  {
    id: 'sprint-demo-prep',
    label: 'Sprint Demo Preparation',
    shortLabel: 'Sprint Demo',
    icon: 'Presentation',
    description:
      'Creates structured demo scripts from completed sprint stories. Defines demo flow, talking points, success criteria to showcase, and anticipated questions.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
      },
    },
  },
  {
    id: 'dependency-audit',
    label: 'Dependency Security Audit',
    shortLabel: 'Dependency Audit',
    icon: 'PackageSearch',
    description:
      'Analyzes package dependencies for security vulnerabilities, outdated versions, and license compliance. Prioritizes updates by severity and produces remediation plan.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'CVE database, NIST NVD, package security advisories',
        },
      },
    },
  },
  {
    id: 'tech-debt-tracker',
    label: 'Technical Debt Assessment',
    shortLabel: 'Tech Debt',
    icon: 'Gauge',
    description:
      'Identifies, categorizes, and prioritizes technical debt from code descriptions, architecture notes, or incident patterns. Produces debt register with business impact and remediation recommendations.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'action-plan', 'maturity-assessment'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
      },
    },
  },
  {
    id: 'zero-trust-assessment',
    label: 'Zero Trust Architecture Assessment',
    shortLabel: 'Zero Trust',
    icon: 'ShieldCheck',
    description:
      'Evaluates an organization\'s readiness for and progress toward zero trust architecture. Assesses identity, network, workload, and data security dimensions against NIST and vendor frameworks.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['maturity-assessment', 'gap-scoring-matrix', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'NIST SP 800-207, CISA Zero Trust Maturity Model, DoD ZTA, vendor zero trust frameworks',
        },
      },
    },
  },
];

// ── Sales/Business Development — New Operational Modules ────

export const SALES_NEW_MODULES: ModuleDefinition[] = [
  {
    id: 'lead-qualification-scorer',
    label: 'Lead Qualification Scorer',
    shortLabel: 'Lead Qualifier',
    icon: 'UserCheck',
    description:
      'Applies BANT/MEDDIC or custom scoring frameworks to qualify sales leads. Evaluates budget, authority, need, timeline, and competitive position to prioritize pipeline.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
      },
    },
  },
  {
    id: 'proposal-generator-sales',
    label: 'Sales Proposal Generator',
    shortLabel: 'Proposal',
    icon: 'FilePen',
    description:
      'Creates tailored sales proposals from opportunity data, customer context, and solution capabilities. Structures value proposition, approach, timeline, and commercial terms.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['client-proposal', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'win-loss-report',
    label: 'Win/Loss Analysis Report',
    shortLabel: 'Win/Loss Report',
    icon: 'TrendingUp',
    description:
      'Analyzes deal outcomes (wins and losses) to identify patterns, competitive insights, and process improvement opportunities. Produces actionable insights for sales strategy.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
      },
    },
  },
  {
    id: 'customer-health-score',
    label: 'Customer Health Score Calculator',
    shortLabel: 'Health Score',
    icon: 'HeartPulse',
    description:
      'Aggregates customer engagement signals (product usage, support interactions, NPS, commercial activity) to produce a health score with at-risk identification and recommended actions.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['maturity-assessment', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
      },
    },
  },
  {
    id: 'renewal-risk-assessor',
    label: 'Contract Renewal Risk Assessment',
    shortLabel: 'Renewal Risk',
    icon: 'RefreshCcw',
    description:
      'Assesses renewal risk for key accounts by analyzing usage trends, satisfaction signals, competitive threats, and relationship health. Produces risk-ranked renewal plan.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
      },
    },
  },
  {
    id: 'sales-call-prep',
    label: 'Sales Call Preparation Brief',
    shortLabel: 'Call Prep',
    icon: 'PhoneCall',
    description:
      'Prepares comprehensive pre-call briefing for prospect or customer meetings. Includes company research, contact intelligence, tailored talking points, likely objections, and suggested next steps.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['quick-briefing'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'Company news, regulatory updates, industry context',
        },
      },
    },
  },
  {
    id: 'competitive-win-loss-analyzer',
    label: 'Competitive Win/Loss Deep Dive',
    shortLabel: 'Competitive Analysis',
    icon: 'Swords',
    description:
      'Conducts systematic analysis of competitive deal outcomes. Identifies competitive patterns, differentiators, and positioning gaps through structured win/loss review methodology.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'decision-memo', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'Competitor public information, industry positioning, analyst reports',
        },
      },
    },
  },
];

// ── ESG/Sustainability — New Modules ─────────────────────────

export const ESG_NEW_MODULES: ModuleDefinition[] = [
  {
    id: 'carbon-footprint-calculator',
    label: 'Carbon Footprint Data Collector',
    shortLabel: 'Carbon Footprint',
    icon: 'Leaf',
    description:
      'Guides systematic collection of Scope 1, 2, and 3 emissions data. Identifies data sources, calculates preliminary footprint estimates, and highlights data gaps requiring further collection.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['data-readiness-scorecard', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'GHG Protocol, IPCC emission factors, IEA electricity factors, EU emission factors',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'csrd-data-collector',
    label: 'CSRD Data Collection Orchestrator',
    shortLabel: 'CSRD Data',
    icon: 'Database',
    description:
      'Structures CSRD (Corporate Sustainability Reporting Directive) data collection across departments. Maps ESRS requirements to data sources, owners, and collection methods.',
    color: 'adv-green',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'action-plan', 'monitoring-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'ESRS standards, EFRAG guidance, CSRD Directive 2022/2464, EFRAG Q&A',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'sustainability-report-drafter',
    label: 'Sustainability Report Section Writer',
    shortLabel: 'Report Drafter',
    icon: 'FileText',
    description:
      'Drafts sections of sustainability/ESG reports from data inputs. Follows GRI, CSRD, or TCFD frameworks and produces narrative that meets disclosure requirements.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'ESRS standards, GRI Standards, TCFD recommendations, EFRAG implementation guidance',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'esg-rating-questionnaire',
    label: 'ESG Rating Questionnaire Pre-Filler',
    shortLabel: 'Rating Questionnaire',
    icon: 'ClipboardList',
    description:
      'Pre-populates common ESG rating agency questionnaires (MSCI, Sustainalytics, CDP, EcoVadis) from available company data and publicly disclosed information.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'supply-chain-esg-screener',
    label: 'Supply Chain ESG Risk Screener',
    shortLabel: 'Supply Chain ESG',
    icon: 'Network',
    description:
      'Assesses ESG risks across the supply chain based on supplier information, geographic exposure, and sector characteristics. Identifies high-risk suppliers requiring enhanced due diligence.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'maturity-assessment', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description:
            'Supply chain ESG risk databases, country risk indices, sector risk profiles, CSDDD requirements',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'tcfd-gap-analysis',
    label: 'TCFD Climate Risk Gap Analysis',
    shortLabel: 'TCFD Gap Analysis',
    icon: 'ThermometerSun',
    description:
      'Assesses alignment with TCFD (Task Force on Climate-related Financial Disclosures) recommendations across governance, strategy, risk management, and metrics/targets pillars.',
    color: 'adv-green',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description:
            'TCFD recommendations, IPCC climate scenarios, NGFS scenarios, ESRS E1 requirements, financial supervisor guidance',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// ── Combined export of all new modules ───────────────────────

export const ALL_NEW_MODULES: ModuleDefinition[] = [
  ...SOFTWARE_ENG_NEW_MODULES,
  ...SALES_NEW_MODULES,
  ...ESG_NEW_MODULES,
];

// ── Area module ID patches ────────────────────────────────────
// These arrays contain the module IDs that should be APPENDED
// to the respective area's moduleIds in constants.ts

export const SOFTWARE_ENG_AREA_NEW_MODULE_IDS = [
  'code-review-checklist',
  'release-notes-generator',
  'adr-writer',
  'api-documentation-generator',
  'sprint-demo-prep',
  'dependency-audit',
  'tech-debt-tracker',
  'zero-trust-assessment',
] as const;

export const SALES_AREA_NEW_MODULE_IDS = [
  'lead-qualification-scorer',
  'proposal-generator-sales',
  'win-loss-report',
  'customer-health-score',
  'renewal-risk-assessor',
  'sales-call-prep',
  'competitive-win-loss-analyzer',
] as const;

export const ESG_AREA_NEW_MODULE_IDS = [
  'carbon-footprint-calculator',
  'csrd-data-collector',
  'sustainability-report-drafter',
  'esg-rating-questionnaire',
  'supply-chain-esg-screener',
  'tcfd-gap-analysis',
] as const;
