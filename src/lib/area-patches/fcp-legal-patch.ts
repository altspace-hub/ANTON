// Patch for FCP and Legal areas — merge these into constants.ts
// Generated: 2026-02-19
//
// HOW TO USE:
// 1. Add NEW_FCP_MODULES entries into the MODULES array in constants.ts
//    (place them after the existing FCP modules, before the Legal section comment)
// 2. Add NEW_LEGAL_MODULES entries into the MODULES array in constants.ts
//    (place them after the existing Legal modules, before the Audit section comment)
// 3. Update the FCP area moduleIds in AREAS to include the new FCP module IDs
// 4. Update the Legal area moduleIds in AREAS to include the new Legal module IDs
//
// FCP area moduleIds should become:
//   'gap-analysis', 'document-creation', 'sanctions-advisory', 'regulatory-monitor',
//   'training-content', 'data-management', 'risk-assessment', 'investigation-support',
//   'engagement-proposal', 'engagement-execution', 'management-presentation', 'model-validation',
//   'regulatory-response-drafter', 'compliance-monitoring-design',
//   // Operational modules (new):
//   'alert-investigation', 'daily-screening-review', 'kyc-refresh-tracker',
//   'sar-quality-check', 'mis-report-generator', 'regulatory-change-scanner',
//   'training-needs-assessment',
//   // Consultant modules (new):
//   'amla-data-readiness', 'regulatory-exam-prep', 'tech-selection-support',
//
// Legal area moduleIds should become:
//   'regulatory-interpretation', 'contract-review', 'compliance-framework',
//   'regulatory-change-impact', 'gdpr-privacy', 'legal-brief',
//   'contract-negotiation', 'regulatory-sandbox',
//   // New modules:
//   'regulatory-horizon-scanning', 'contract-clause-checker', 'gdpr-dsar-handler',
//   'regulatory-deadline-tracker', 'board-legal-summary', 'multi-jurisdiction-comparison',

import type { ModuleDefinition } from '../types';

// ── FCP Area — New Operational Modules ──────────────────────────────────────

export const NEW_FCP_MODULES: ModuleDefinition[] = [
  // ── FCP Operational ─────────────────────────────────────────────────────
  {
    id: 'alert-investigation',
    label: 'Alert Investigation Assistant',
    shortLabel: 'Alert Triage',
    icon: 'AlertCircle',
    description: 'Guided triage for transaction monitoring alerts. Analyzes alert context, transaction patterns, customer profile, and risk indicators to produce a structured assessment with recommended disposition.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['problem-solution', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'AML/CFT typologies, transaction monitoring best practices, FATF guidance' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'daily-screening-review',
    label: 'Daily Screening Results Review',
    shortLabel: 'Screening Review',
    icon: 'ScanSearch',
    description: 'Morning review of overnight sanctions/PEP screening hits. Categorizes hits by urgency, provides initial assessment of matches, and generates a prioritized action list.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['action-plan', 'quick-briefing'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Sanctions regimes, PEP definitions, screening match assessment methodology' },
      },
    },
  },
  {
    id: 'kyc-refresh-tracker',
    label: 'KYC Refresh Prioritization',
    shortLabel: 'KYC Refresh',
    icon: 'UserCheck',
    description: 'Analyzes upcoming KYC periodic review queue and prioritizes based on risk rating, days overdue, and regulatory requirements. Produces a prioritized work plan.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'project-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'KYC periodic review requirements under AMLR, EBA guidelines, and national regulations' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'sar-quality-check',
    label: 'SAR/STR Quality Checker',
    shortLabel: 'SAR Quality',
    icon: 'FileSearch',
    description: 'Reviews draft Suspicious Activity Reports (SARs) or Suspicious Transaction Reports (STRs) before filing. Checks for completeness, regulatory requirements, adequate grounds, and clear narrative.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'SAR/STR quality standards, FATF recommendations, AMLA/national FIU reporting requirements' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'mis-report-generator',
    label: 'FCP MIS Report Generator',
    shortLabel: 'MIS Reports',
    icon: 'BarChart3',
    description: 'Generates monthly management information (MIS) reports for FCP functions. Structures KPIs, alert volumes, investigation outcomes, SAR statistics, and training completion into board-ready reporting.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'maturity-assessment'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'FCP MIS reporting best practices, regulatory expectations for AML management information' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'regulatory-change-scanner',
    label: 'Regulatory Change Impact Scanner',
    shortLabel: 'Change Scanner',
    icon: 'ScanLine',
    description: 'Analyzes new regulatory publications, guidance, or amendments and assesses their specific impact on current AML/CFT policies, procedures, and systems.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['impact-assessment', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'AML/CFT regulatory developments, AMLA technical standards, EBA guidelines' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'training-needs-assessment',
    label: 'AML Training Needs Assessment',
    shortLabel: 'Training Needs',
    icon: 'GraduationCap',
    description: 'Identifies training gaps across FCP teams based on regulatory changes, audit findings, investigation outcomes, and competency frameworks. Produces a targeted training plan.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'training-material'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'AML/CFT training requirements, FATF guidance, AMLA staff training obligations' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── FCP Consultant ───────────────────────────────────────────────────────
  {
    id: 'amla-data-readiness',
    label: 'AMLA Data Point Readiness Assessment',
    shortLabel: 'AMLA Data Readiness',
    icon: 'Database',
    description: 'Assesses an institution\'s ability to report all 250+ AMLA data points. Maps current data availability, quality, and system capabilities against AMLA reporting requirements.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['data-readiness-scorecard', 'gap-scoring-matrix', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'AMLA reporting requirements, data point specifications, EBA technical standards on data reporting' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'regulatory-exam-prep-fcp',
    label: 'Regulatory Examination Preparation (FCP)',
    shortLabel: 'Exam Preparation',
    icon: 'ClipboardCheck',
    description: 'Prepares institutions for regulatory examinations (FI, BaFin, FCA, AMLA). Conducts pre-exam gap assessment, document readiness review, and staff preparation briefings.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'executive-summary', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Supervisory examination methodologies, SREP, regulatory inspection priorities, enforcement trends' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'tech-selection-support',
    label: 'AML Technology Selection Support',
    shortLabel: 'Tech Selection',
    icon: 'Server',
    description: 'Evaluates and compares AML/CFT technology solutions (transaction monitoring, screening, case management, KYC). Produces structured vendor comparison and selection recommendation.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['regulatory-comparison', 'decision-memo', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'AML technology vendors, transaction monitoring platforms, screening solutions, KYC technology landscape' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// ── Legal Area — New Modules ─────────────────────────────────────────────────

export const NEW_LEGAL_MODULES: ModuleDefinition[] = [
  {
    id: 'regulatory-horizon-scanning',
    label: 'Regulatory Horizon Scanning',
    shortLabel: 'Horizon Scanning',
    icon: 'Radar',
    description: 'Systematic scan of upcoming regulatory changes across specified jurisdictions and areas. Produces prioritized watch list with timeline, impact assessment, and recommended preparation actions.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['compliance-calendar', 'impact-assessment', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'EU regulatory pipeline, national financial services regulation, EBA/ESMA/EIOPA consultations, legislative calendar' },
      },
    },
  },
  {
    id: 'contract-clause-checker',
    label: 'Contract Clause Compliance Checker',
    shortLabel: 'Clause Checker',
    icon: 'FileCheck',
    description: 'Reviews contracts against a standard clause library or regulatory requirements. Identifies missing, non-standard, or risky clauses with specific recommendations.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Financial services contract requirements, outsourcing regulations, DORA, EBA outsourcing guidelines' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'gdpr-dsar-handler',
    label: 'GDPR Data Subject Request Handler',
    shortLabel: 'DSAR Handler',
    icon: 'Lock',
    description: 'Processes GDPR Data Subject Access Requests (DSARs) efficiently. Analyzes the request, identifies relevant data sources, drafts response framework, and flags compliance requirements.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'GDPR data subject rights, DSAR handling requirements, exemptions and restrictions, supervisory guidance' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'regulatory-deadline-tracker',
    label: 'Regulatory Deadline Tracker',
    shortLabel: 'Deadline Tracker',
    icon: 'Calendar',
    description: 'Creates and maintains a regulatory compliance calendar based on applicable regulations, effective dates, submission deadlines, and periodic requirements.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['compliance-calendar', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Regulatory deadlines, compliance calendar requirements, periodic reporting obligations' },
      },
    },
  },
  {
    id: 'board-legal-summary',
    label: 'Board Legal & Regulatory Update',
    shortLabel: 'Board Update',
    icon: 'Presentation',
    description: 'Compiles a concise monthly or quarterly legal/regulatory update for board and senior management. Synthesizes developments across relevant regulatory areas into actionable board-level briefing.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'quick-briefing'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Current regulatory developments, enforcement actions, supervisory priorities' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'multi-jurisdiction-comparison',
    label: 'Multi-Jurisdiction Regulatory Comparison',
    shortLabel: 'Multi-Jurisdiction',
    icon: 'Globe',
    description: 'Compares regulatory requirements across multiple jurisdictions for a specific topic (e.g., AML/CFT, GDPR, licensing). Identifies overlaps, conflicts, and strictest requirements.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['regulatory-comparison', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Multi-jurisdiction regulatory requirements, national implementation measures, supervisory expectations' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];
