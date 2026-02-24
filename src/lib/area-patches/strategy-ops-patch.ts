// ═══════════════════════════════════════════════════════════
// Strategy & Operations Area Patch
// Adds new modules to Strategy/Business Development and
// Project Management/Operations areas WITHOUT modifying
// the main constants.ts file.
// ═══════════════════════════════════════════════════════════

import type { ModuleDefinition } from '../types';

// ── New Strategy/Business Development Modules ───────────────

export const STRATEGY_NEW_MODULES: ModuleDefinition[] = [
  {
    id: 'competitive-intelligence',
    label: 'Competitive Intelligence Brief',
    shortLabel: 'Competitive Intel',
    icon: 'Crosshair',
    description:
      'Compiles structured competitive intelligence on specific competitors. Analyzes positioning, pricing, product capabilities, recent developments, and implications for strategy.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description:
            'Competitor positioning, pricing intelligence, product capabilities, recent strategic developments',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'board-meeting-prep',
    label: 'Board Meeting Preparation Pack',
    shortLabel: 'Board Prep',
    icon: 'Presentation',
    description:
      'Compiles board meeting materials from data inputs. Structures CEO report, financial highlights, strategic initiatives update, risk summary, and decisions required. Board-quality format.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Board governance best practices, corporate reporting standards, executive communication',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'okr-progress-tracker',
    label: 'OKR Progress Assessment',
    shortLabel: 'OKR Tracker',
    icon: 'Target',
    description:
      'Assesses quarterly OKR (Objectives and Key Results) progress. Evaluates key result achievement, identifies at-risk objectives, and produces executive summary with recommended focus areas.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'OKR methodology, goal-setting best practices, performance management frameworks',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'partnership-evaluation',
    label: 'Partnership Evaluation Scorecard',
    shortLabel: 'Partnership Eval',
    icon: 'Handshake',
    description:
      'Evaluates potential partnerships or alliances using structured scorecard. Assesses strategic fit, capability complementarity, financial terms, risk, and governance considerations.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['decision-memo', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'Partnership structures, alliance governance, joint venture frameworks, strategic alliance best practices',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'market-entry-briefing',
    label: 'Market Entry Research Brief',
    shortLabel: 'Market Entry Brief',
    icon: 'Map',
    description:
      'Produces rapid market entry assessment for a target geography or segment. Covers market size, competitive dynamics, regulatory requirements, entry strategy options, and risk assessment.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'decision-memo', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description:
            'Market entry frameworks, regulatory requirements by jurisdiction, competitive landscape, industry trends',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// ── New Operations/Process Improvement Modules ───────────────

export const OPERATIONS_NEW_MODULES: ModuleDefinition[] = [
  {
    id: 'sop-writer',
    label: 'Standard Operating Procedure Writer',
    shortLabel: 'SOP Writer',
    icon: 'ScrollText',
    description:
      'Transforms process descriptions into formal Standard Operating Procedures (SOPs). Includes purpose, scope, responsibilities, step-by-step procedure, exceptions handling, and version control.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'SOP writing standards, ISO documentation frameworks, operational procedure best practices',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'kpi-dashboard-updater',
    label: 'KPI Dashboard Commentary Generator',
    shortLabel: 'KPI Commentary',
    icon: 'BarChart2',
    description:
      'Transforms KPI data into management commentary. Explains variances, contextualizes trends, identifies actionable insights, and frames recommendations. For monthly/quarterly reporting.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'quick-briefing'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Management reporting best practices, KPI frameworks, business performance analysis',
        },
      },
    },
  },
  {
    id: 'incident-report-processor',
    label: 'Incident Report Writer',
    shortLabel: 'Incident Report',
    icon: 'AlertTriangle',
    description:
      'Structures operational incident reports from event descriptions. Covers timeline, impact, root cause analysis (5-Whys or Fishbone), immediate actions taken, and permanent remediation plan.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Incident management frameworks, root cause analysis techniques, operational risk management',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'sla-monitor',
    label: 'SLA Performance Analyzer',
    shortLabel: 'SLA Monitor',
    icon: 'Gauge',
    description:
      'Analyzes service level agreement performance data. Identifies breaches, near-misses, trends, and root causes. Produces SLA health report with improvement recommendations.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['monitoring-plan', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Service level management, SLA frameworks, operational performance best practices',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'capacity-planning',
    label: 'Capacity Planning Calculator',
    shortLabel: 'Capacity Planning',
    icon: 'Users',
    description:
      'Forecasts resource capacity requirements based on projected workload, seasonal patterns, and efficiency targets. Models staffing scenarios and identifies gaps or over-capacity periods.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['budget-resource-estimate', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Workforce planning frameworks, capacity modelling methodologies, resource management best practices',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// ── Combined export of all new modules ───────────────────────

export const ALL_NEW_MODULES: ModuleDefinition[] = [
  ...STRATEGY_NEW_MODULES,
  ...OPERATIONS_NEW_MODULES,
];

// ── Area module ID patches ────────────────────────────────────
// These arrays contain the module IDs that should be APPENDED
// to the respective area's moduleIds in constants.ts

export const STRATEGY_AREA_NEW_MODULE_IDS = [
  'competitive-intelligence',
  'board-meeting-prep',
  'okr-progress-tracker',
  'partnership-evaluation',
  'market-entry-briefing',
] as const;

export const PROJECT_MGMT_AREA_NEW_MODULE_IDS = [
  'sop-writer',
  'kpi-dashboard-updater',
  'incident-report-processor',
  'sla-monitor',
  'capacity-planning',
] as const;
