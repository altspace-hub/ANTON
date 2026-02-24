/**
 * area-patches/accounting-pm-comms-patch.ts
 *
 * Supplementary module definitions for the Accounting/Tax, Project Management,
 * and Communication/PR expert areas. These modules are loaded alongside the
 * file-system area definitions in server/areas/. This patch file registers
 * them in the frontend type system so that any direct constant imports
 * (e.g. for seeding or testing) include the full set.
 *
 * DO NOT modify src/lib/constants.ts — use this patch file instead.
 */

import type { ModuleDefinition } from '../types';

// ─── Accounting / Tax ────────────────────────────────────────────────────────

export const ACCOUNTING_NEW_MODULES: ModuleDefinition[] = [
  {
    id: 'receipt-processor',
    label: 'Receipt & Expense Processor',
    shortLabel: 'Expense Processor',
    icon: 'Receipt',
    description:
      'Extracts and categorizes expense receipts from descriptions or OCR output. Classifies by expense type, VAT deductibility (per Swedish/EU tax rules), and cost center. Produces structured expense report.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['data-readiness-scorecard', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Swedish VAT rules (Mervärdesskattelagen), EU VAT Directive, Skatteverket expense deductibility guidelines',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'vat-return-preparer',
    label: 'VAT Return Data Validator',
    shortLabel: 'VAT Validator',
    icon: 'ClipboardCheck',
    description:
      'Validates VAT return data before submission. Checks input/output VAT consistency, identifies suspicious patterns, ensures correct application of reduced rates and exemptions, and prepares audit trail.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Swedish Mervärdesskattelagen, EU VAT Directive 2006/112/EC, Skatteverket VAT reporting requirements, EC Sales List rules',
        },
      },
    },
  },
  {
    id: 'month-end-checklist',
    label: 'Month-End Close Checklist Runner',
    shortLabel: 'Month-End Close',
    icon: 'ListChecks',
    description:
      'Guides through systematic month-end close procedures. Generates role-specific checklists, identifies unreconciled items, tracks completion status, and produces sign-off documentation.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'monitoring-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Month-end close best practices, reconciliation standards, IFRS/GAAP accrual principles',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'budget-variance-analyzer',
    label: 'Budget vs. Actual Variance Analyzer',
    shortLabel: 'Variance Analyzer',
    icon: 'BarChart3',
    description:
      'Analyzes budget vs. actual variances across cost centers and accounts. Identifies material variances, classifies as price/volume/mix effects, and produces management commentary.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Management accounting variance analysis, price-volume-mix decomposition, management commentary standards',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'ifrs-implementation-advisor',
    label: 'IFRS/GAAP Implementation Advisor',
    shortLabel: 'IFRS Advisor',
    icon: 'BookOpen',
    description:
      'Provides guidance on implementing new IFRS or GAAP standards. Analyzes standard requirements, assesses accounting policy choices, and structures implementation project plan.',
    color: 'adv-gold',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'policy-document', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description:
            'IFRS standards (IASB), US GAAP (FASB), Swedish K3, EFRAG endorsement status, Big Four implementation guidance',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'transfer-pricing-documentation',
    label: 'Transfer Pricing Documentation',
    shortLabel: 'TP Documentation',
    icon: 'FileSearch',
    description:
      'Structures transfer pricing documentation for intra-group transactions. Covers functional analysis, comparability analysis, method selection, and documentation to OECD/BEPS standards.',
    color: 'adv-gold',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'policy-document'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description:
            'OECD Transfer Pricing Guidelines 2022, BEPS Actions 8-10 and 13, EU JTPF guidelines, Nordic transfer pricing rules and case law',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'financial-statement-drafter',
    label: 'Financial Statement Narrative Drafter',
    shortLabel: 'FS Narrative',
    icon: 'FileText',
    description:
      'Drafts narrative sections of financial statements (management commentary, notes, MD&A). Converts financial data into clear, compliant, board-quality narrative.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'IFRS financial statement disclosure requirements, Swedish ÅRL, management commentary best practice (IASB Practice Statement 1), MD&A guidance (SEC, FCA)',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'expense-policy-checker',
    label: 'Expense Report Policy Checker',
    shortLabel: 'Expense Checker',
    icon: 'ShieldCheck',
    description:
      'Validates expense reports against company expense policy. Flags policy violations, missing receipts, unusual amounts, and suggests appropriate approvals or rejections.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Expense management best practices, Swedish tax rules on deductibility, Skatteverket representation limits',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// ─── Project Management ───────────────────────────────────────────────────────

export const PROJECT_MGMT_NEW_MODULES: ModuleDefinition[] = [
  {
    id: 'sprint-planning-assistant',
    label: 'Sprint Planning Assistant',
    shortLabel: 'Sprint Planning',
    icon: 'Layers',
    description:
      'Facilitates sprint planning by estimating stories, checking team capacity, identifying dependencies, and generating a sprint plan with clear goals and success criteria.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['project-plan', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Scrum framework, agile estimation techniques, sprint planning best practices, velocity tracking',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'retrospective-facilitator',
    label: 'Sprint Retrospective Facilitator',
    shortLabel: 'Retrospective',
    icon: 'RefreshCcw',
    description:
      'Prepares and structures sprint retrospectives. Analyzes what went well/poorly, facilitates root cause analysis on blockers, and generates prioritized improvement actions.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Agile retrospective techniques, root cause analysis, team improvement frameworks, Scrum retrospective formats',
        },
      },
    },
  },
  {
    id: 'raid-log-updater',
    label: 'RAID Log Reviewer',
    shortLabel: 'RAID Log',
    icon: 'AlertTriangle',
    description:
      'Systematically reviews and updates project RAID logs (Risks, Assumptions, Issues, Dependencies). Reassesses risk ratings, identifies stale items, and generates updated RAID register with management actions.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['monitoring-plan', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'RAID log management, project risk management (PMI, PRINCE2), risk assessment frameworks',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'change-request-processor',
    label: 'Change Request Impact Assessor',
    shortLabel: 'Change Request',
    icon: 'GitPullRequest',
    description:
      'Evaluates project change requests for scope, schedule, budget, resource, and risk impact. Produces structured change request documentation with approval recommendation.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['impact-assessment', 'decision-memo'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Change control management, project impact assessment, PRINCE2 change management, scope creep analysis',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'programme-health-assessment',
    label: 'Programme Health Assessment',
    shortLabel: 'Health Assessment',
    icon: 'Activity',
    description:
      'Assesses the health of large programmes across delivery, governance, stakeholder, risk, and financial dimensions. Produces RAG-rated dashboard with priority recommendations.',
    color: 'adv-green',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['maturity-assessment', 'executive-summary', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Programme management health assessment frameworks, P3M3, PMI programme management, OGC Gateway reviews, RAG status assessment',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'pmo-setup-framework',
    label: 'PMO Framework Design',
    shortLabel: 'PMO Design',
    icon: 'Building2',
    description:
      'Designs Project Management Office (PMO) framework including governance structure, methodology standards, reporting cadence, tooling requirements, and capability development plan.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'project-plan', 'raci-matrix'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'PMO design frameworks, PRINCE2, PMI PMBOK, agile at scale, portfolio management, governance design',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'resource-allocation-optimizer',
    label: 'Resource Allocation Optimizer',
    shortLabel: 'Resource Optimizer',
    icon: 'Users',
    description:
      'Analyzes resource allocation across multiple projects. Identifies over-allocation, under-utilization, and skill mismatches. Recommends reallocation to maximize delivery throughput.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'budget-resource-estimate'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Resource management, capacity planning, portfolio resource optimization, skills matrix management',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// ─── Communication / PR ───────────────────────────────────────────────────────

export const COMMS_PR_NEW_MODULES: ModuleDefinition[] = [
  {
    id: 'meeting-minutes-generator',
    label: 'Meeting Minutes Generator',
    shortLabel: 'Meeting Minutes',
    icon: 'NotebookPen',
    description:
      'Transforms meeting notes or transcripts into formatted minutes. Structures: attendees, agenda items, decisions made, actions agreed (with owners and deadlines), and next steps.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'quick-briefing'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Formal meeting minutes conventions, corporate governance meeting documentation, board minutes standards',
        },
      },
    },
  },
  {
    id: 'town-hall-prep',
    label: 'Town Hall Preparation Kit',
    shortLabel: 'Town Hall Prep',
    icon: 'Megaphone',
    description:
      'Prepares comprehensive town hall materials: key messages, Q&A anticipation (likely tough questions with suggested answers), talking points for leadership, and run-of-show agenda.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['stakeholder-presentation', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Internal communications best practices, town hall facilitation, leadership communication, employee engagement',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'change-comm-planner',
    label: 'Change Communication Planner',
    shortLabel: 'Change Comms',
    icon: 'Workflow',
    description:
      'Creates multi-channel, stakeholder-segmented communication plan for organizational changes. Sequences messages across channels (all-hands, email, manager cascade, FAQ) with timing and tone guidance.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['monitoring-plan', 'stakeholder-presentation', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Change management communication (Prosci/ADKAR), organizational change communications, stakeholder engagement, change readiness',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'investor-update-letter',
    label: 'Investor Update Letter',
    shortLabel: 'Investor Update',
    icon: 'TrendingUp',
    description:
      'Drafts quarterly or monthly investor update letters. Covers: key metrics, progress against milestones, challenges being addressed, and forward-looking commentary. Calibrated for investor expectations.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Investor relations best practices, VC/PE investor update conventions, startup and growth company investor communications',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'crisis-comms-response',
    label: 'Crisis Communication Response',
    shortLabel: 'Crisis Comms',
    icon: 'AlertOctagon',
    description:
      'Structures crisis communication response for reputational, operational, or regulatory incidents. Develops holding statement, media response, internal communication, and stakeholder update sequence.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'quick-briefing', 'stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description:
            'Crisis communication management, media relations in crisis, regulatory incident communications, reputational risk management',
        },
      },
    },
  },
];

// ─── Combined export for registration ────────────────────────────────────────

/**
 * All new operational modules for Accounting/Tax, Project Management,
 * and Communication/PR areas. Import this array wherever the full
 * module catalogue needs to be available without modifying constants.ts.
 */
export const ACCOUNTING_PM_COMMS_PATCH_MODULES: ModuleDefinition[] = [
  ...ACCOUNTING_NEW_MODULES,
  ...PROJECT_MGMT_NEW_MODULES,
  ...COMMS_PR_NEW_MODULES,
];

export default ACCOUNTING_PM_COMMS_PATCH_MODULES;
