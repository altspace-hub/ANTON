import type { ModuleDefinition } from '../types';

export const PE_VC_MODULES: ModuleDefinition[] = [
  // ── PE/VC Area (Area 34) ─────────────────────────────────────────────────

  {
    id: 'deal-screening',
    label: 'Deal Screening & First Look',
    shortLabel: 'Deal Screen',
    icon: 'Filter',
    description: 'Rapid initial assessment of an investment opportunity — should we spend more time on this? Produces a structured first-look memo in minutes, not hours.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Investment screening frameworks, market comparables, sector knowledge' },
      },
    },
  },
  {
    id: 'market-intelligence',
    label: 'Market & Competitive Intelligence',
    shortLabel: 'Market Intel',
    icon: 'Globe',
    description: 'Deep market research — sizing, trends, competitive landscape mapping, and sector thesis development. Synthesises current data into investment-grade intelligence.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'regulatory-comparison'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Market sizing, competitive landscape, technology trends, sector analysis' },
      },
    },
  },
  {
    id: 'due-diligence',
    label: 'Due Diligence Workbench',
    shortLabel: 'Due Diligence',
    icon: 'SearchCheck',
    description: 'Structure and accelerate due diligence — from request lists to findings synthesis. Upload data room documents for analysis, gap identification, and risk flagging.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Due diligence frameworks, financial analysis, regulatory requirements' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'financial-analysis-pe',
    label: 'Financial Analysis & Modelling (PE/VC)',
    shortLabel: 'Financial Analysis',
    icon: 'Calculator',
    description: 'Analyse financial statements, build model narratives, stress-test assumptions, and identify value drivers. Covers VC unit economics, PE quality of earnings, LBO, and DCF.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'maturity-assessment'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Financial modelling, valuation, unit economics, LBO analysis' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'valuation-framework',
    label: 'Valuation Framework',
    shortLabel: 'Valuation',
    icon: 'Scale',
    description: 'Structure and execute valuation analysis using appropriate methodologies for stage and type. Triangulates DCF, comparables, precedent transactions, and LBO analysis.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'maturity-assessment'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Valuation multiples, comparable transactions, public company benchmarks' },
      },
    },
  },
  {
    id: 'ic-memo',
    label: 'Investment Committee Memo',
    shortLabel: 'IC Memo',
    icon: 'FileText',
    description: 'Generate structured IC memos that present the full investment case, risks, and recommendation. The most important document in any deal — now drafted in minutes, not weeks.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'IC memo structure, investment analysis, risk assessment frameworks' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'portfolio-monitoring',
    label: 'Portfolio Monitoring Dashboard',
    shortLabel: 'Portfolio Monitor',
    icon: 'LayoutDashboard',
    description: 'Track portfolio company performance, generate board pack summaries from raw data, and flag concerns early.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Portfolio monitoring frameworks, KPI benchmarks, early warning signals' },
      },
    },
  },
  {
    id: 'value-creation',
    label: 'Value Creation Planner',
    shortLabel: 'Value Creation',
    icon: 'Rocket',
    description: 'Develop and track value creation plans — from 100-day plans to exit-ready transformation playbooks. Covers revenue growth, margin improvement, and add-on acquisitions.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'project-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Value creation frameworks, operational improvement, 100-day plans, PE playbooks' },
      },
    },
  },
  {
    id: 'exit-planning',
    label: 'Exit Planning & Preparation',
    shortLabel: 'Exit Planning',
    icon: 'DoorOpen',
    description: 'Plan and prepare for portfolio company exits — timing, positioning, buyer universe, process management, and materials preparation.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'M&A market conditions, exit processes, buyer universe, CIM structures' },
      },
    },
  },
  {
    id: 'fund-reporting',
    label: 'Fund Performance & LP Reporting',
    shortLabel: 'Fund Reporting',
    icon: 'PieChart',
    description: 'Generate LP reports, calculate fund metrics, and prepare annual meeting materials. Turns portfolio data into professional investor communications.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Fund performance metrics, IRR/TVPI/DPI calculations, LP reporting standards' },
      },
    },
  },
  {
    id: 'deal-structure',
    label: 'Term Sheet & Deal Structure Advisor',
    shortLabel: 'Deal Structure',
    icon: 'Handshake',
    description: 'Analyse, draft, and negotiate term sheets and deal structures. Covers liquidation preferences, anti-dilution, board rights, drag-along, earn-outs, and return implications.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'VC/PE term sheet terms, deal structures, return waterfalls, legal frameworks' },
      },
    },
  },
  {
    id: 'team-assessment',
    label: 'Founder & Management Assessment',
    shortLabel: 'Team Assessment',
    icon: 'Users',
    description: 'Structured assessment of founders (VC) and management teams (PE). Synthesises interview notes, reference checks, and background research into a clear people assessment.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Founder assessment frameworks, management assessment, reference check synthesis' },
      },
    },
  },
];
