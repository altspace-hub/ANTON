/**
 * audit-hr-banking-patch.ts
 *
 * New module entries for Audit/Assurance, HR/People, and Banking/Financial Services areas.
 * These extend the existing MODULES array in constants.ts without modifying it directly.
 *
 * To use: import AUDIT_HR_BANKING_MODULES and spread into your module registry,
 * e.g.:  import { AUDIT_HR_BANKING_MODULES } from './area-patches/audit-hr-banking-patch';
 *        const allModules = [...MODULES, ...AUDIT_HR_BANKING_MODULES];
 */

import type { ModuleDefinition } from '../types';

// ── Audit & Assurance — New Modules ─────────────────────────────────────────

const AUDIT_NEW_MODULES: ModuleDefinition[] = [
  // ── Operational modules ────────────────────────────────────────────────────

  {
    id: 'workpaper-reviewer',
    label: 'Audit Workpaper Reviewer',
    shortLabel: 'Workpaper Review',
    icon: 'FileSearch',
    description:
      'Reviews completed audit workpapers for completeness, appropriate evidence, logical conclusions, and quality standards. Provides structured feedback aligned with IIA standards.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'IIA Standards, ISAE 3000, internal audit quality frameworks',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  {
    id: 'finding-followup-tracker',
    label: 'Audit Finding Follow-Up',
    shortLabel: 'Finding Follow-Up',
    icon: 'ClipboardCheck',
    description:
      'Tracks and assesses the remediation status of outstanding audit findings. Evaluates management actions against agreed remediation plans and identifies overdue or inadequate responses.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'monitoring-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  {
    id: 'evidence-request-generator',
    label: 'Audit Evidence Request Generator',
    shortLabel: 'Evidence Requests',
    icon: 'ListChecks',
    description:
      'Generates targeted, specific evidence requests for an audit engagement. Translates audit objectives into clear requests for documents, data, and demonstrations.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },

  {
    id: 'audit-committee-pack',
    label: 'Audit Committee Pack Generator',
    shortLabel: 'Committee Pack',
    icon: 'Presentation',
    description:
      'Assembles quarterly audit committee materials from audit findings, follow-up status, plan progress, and KRIs. Produces board-quality pack with executive summary and key metrics.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  {
    id: 'issue-rating-calibrator',
    label: 'Audit Issue Rating Calibrator',
    shortLabel: 'Issue Calibrator',
    icon: 'Gauge',
    description:
      'Ensures consistent severity rating of audit findings across the engagement and function. Applies a structured rating framework (Critical/High/Medium/Low/Informational) with evidence-based justification.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },

  // ── Consultant modules ─────────────────────────────────────────────────────

  {
    id: 'three-lines-assessment',
    label: 'Three Lines Model Assessment',
    shortLabel: 'Three Lines',
    icon: 'Layers',
    description:
      "Evaluates the effectiveness and independence of an organization's three lines of defense. Identifies overlaps, gaps, and conflicts in governance structure.",
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['maturity-assessment', 'gap-scoring-matrix', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'IIA Three Lines Model 2020, Basel Committee governance principles, EBA internal governance guidelines',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  {
    id: 'continuous-audit-design',
    label: 'Continuous Audit Framework Design',
    shortLabel: 'Continuous Audit',
    icon: 'Activity',
    description:
      'Designs automated, continuous audit checks for high-risk processes. Defines control monitoring, alert thresholds, reporting cadence, and escalation paths.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'monitoring-plan', 'project-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Continuous auditing frameworks, ISACA, IIA guidance on data analytics in audit',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// ── HR / People — New Modules ────────────────────────────────────────────────

const HR_NEW_MODULES: ModuleDefinition[] = [
  // ── Operational modules ────────────────────────────────────────────────────

  {
    id: 'cv-screener',
    label: 'CV/Resume Screener',
    shortLabel: 'CV Screener',
    icon: 'UserSearch',
    description:
      'Screens candidate CVs/resumes against job requirements. Evaluates qualification match, experience relevance, career progression, and flags red/green signals. Produces ranked shortlist with assessment notes.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: false },
      },
    },
  },

  {
    id: 'interview-question-gen',
    label: 'Interview Question Generator',
    shortLabel: 'Interview Questions',
    icon: 'MessageSquarePlus',
    description:
      'Generates role-specific, competency-based interview questions. Creates structured question banks with model answers, scoring guides, and follow-up probes aligned to the role competency framework.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['training-material', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },

  {
    id: 'performance-review-summarizer',
    label: 'Performance Review Summarizer',
    shortLabel: 'Review Summarizer',
    icon: 'BarChart3',
    description:
      'Aggregates 360-degree feedback from multiple reviewers into a coherent summary. Identifies themes, balances perspectives, and structures development recommendations.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },

  {
    id: 'exit-interview-analyzer',
    label: 'Exit Interview Pattern Analyzer',
    shortLabel: 'Exit Analysis',
    icon: 'LogOut',
    description:
      'Analyzes patterns across multiple exit interview responses to identify systemic issues, retention risks, and organizational health signals.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },

  {
    id: 'job-posting-optimizer',
    label: 'Job Posting Optimizer',
    shortLabel: 'Job Posting',
    icon: 'Megaphone',
    description:
      'Reviews and improves job postings for clarity, inclusion, competitiveness, and alignment with role requirements. Reduces bias and improves candidate quality.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'creative',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },

  {
    id: 'onboarding-checklist-manager',
    label: 'Onboarding Programme Builder',
    shortLabel: 'Onboarding Builder',
    icon: 'UserCheck',
    description:
      'Creates comprehensive, role-specific onboarding programmes. Structures the first 30/60/90 days with milestones, key meetings, training modules, and success criteria.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['project-plan', 'training-material'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },

  // ── Consultant modules ─────────────────────────────────────────────────────

  {
    id: 'org-restructuring-advisor',
    label: 'Organizational Restructuring Advisor',
    shortLabel: 'Org Restructuring',
    icon: 'Network',
    description:
      'Analyzes proposed organizational restructuring options. Evaluates span of control, decision rights, role clarity, culture fit, and implementation risk.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['decision-memo', 'impact-assessment', 'risk-appetite-statement'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: false },
      },
    },
  },

  {
    id: 'compensation-benchmarking',
    label: 'Compensation Benchmarking Analysis',
    shortLabel: 'Comp Benchmarking',
    icon: 'DollarSign',
    description:
      'Analyzes compensation data against market benchmarks. Identifies positions above/below market, pay equity considerations, and recommends adjustments within budget constraints.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'executive-summary', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: false },
      },
    },
  },
];

// ── Banking & Financial Services — New Modules ───────────────────────────────

const BANKING_NEW_MODULES: ModuleDefinition[] = [
  // ── Operational modules ────────────────────────────────────────────────────

  {
    id: 'product-approval-review',
    label: 'New Product Approval Compliance Review',
    shortLabel: 'Product Approval',
    icon: 'PackageCheck',
    description:
      'Assesses new financial products against regulatory requirements, risk appetite, and compliance frameworks. Produces structured approval recommendation with conditions.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['decision-memo', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'MiFID II product governance, EU PRIIPs, CRD/CRR, PSD2/PSD3, consumer protection requirements',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: false },
      },
    },
  },

  {
    id: 'complaint-root-cause',
    label: 'Customer Complaint Root Cause Analyzer',
    shortLabel: 'Complaint Analysis',
    icon: 'AlertTriangle',
    description:
      'Analyzes patterns in customer complaint data to identify systemic issues, process failures, and product deficiencies. Prioritizes remediation actions by frequency and impact.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },

  {
    id: 'regulatory-reporting-reconciliation',
    label: 'Regulatory Reporting Reconciliation',
    shortLabel: 'Reg Reporting Recon',
    icon: 'FileCheck2',
    description:
      'Validates regulatory reporting data (COREP, FINREP, AnaCredit, etc.) before submission. Identifies material errors, threshold breaches, and required corrections.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'EBA COREP/FINREP technical standards, ECB AnaCredit reporting framework, reporting validation rules',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: false },
      },
    },
  },

  // ── Consultant modules ─────────────────────────────────────────────────────

  {
    id: 'psd3-gap-analysis',
    label: 'PSD3/PSR Gap Analysis',
    shortLabel: 'PSD3 Gap Analysis',
    icon: 'CreditCard',
    description:
      "Assesses institution's readiness for Payment Services Regulation (PSD3) requirements. Maps obligations across open banking, authentication, liability, and consumer protection.",
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'executive-summary', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description:
            'PSD3 directive proposal, Payment Services Regulation (PSR), EBA RTS under PSD2, open banking technical standards',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  {
    id: 'banking-license-support',
    label: 'Banking License Application Support',
    shortLabel: 'License Application',
    icon: 'BadgeCheck',
    description:
      'Structures and reviews banking license applications. Covers governance requirements, capital adequacy, business plan assessment, and regulatory engagement strategy.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'executive-summary', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description:
            'CRD VI banking license requirements, EBA internal governance guidelines, ECB licensing methodology, national licensing requirements',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

/**
 * Combined export of all new modules for Audit, HR, and Banking areas.
 * Spread into the main MODULES array where needed.
 */
export const AUDIT_HR_BANKING_MODULES: ModuleDefinition[] = [
  ...AUDIT_NEW_MODULES,
  ...HR_NEW_MODULES,
  ...BANKING_NEW_MODULES,
];

/** Individual area exports for targeted use. */
export { AUDIT_NEW_MODULES, HR_NEW_MODULES, BANKING_NEW_MODULES };
