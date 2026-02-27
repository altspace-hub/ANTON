// ═══════════════════════════════════════════════════════════════
// WAVE 4 — MODULES entries for src/lib/constants.ts
// Add these to the MODULES array after Wave 3 modules
// ═══════════════════════════════════════════════════════════════

// ── Human Resources & People ─────────────────────────────────
{
  id: 'job-description',
  label: 'Job Description Writer',
  shortLabel: 'Job Descriptions',
  icon: 'FileText',
  description: 'Draft professional, inclusive job descriptions with clear requirements, responsibilities, and competency profiles. Ensures alignment with role level, market standards, and anti-discrimination best practices.',
  color: 'adv-blue',
  defaults: {
    thinking: 'think',
    creativity: 'balanced',
    outputFormats: ['policy-document'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'interview-framework',
  label: 'Interview Framework Builder',
  shortLabel: 'Interview Framework',
  icon: 'MessageSquare',
  description: 'Design structured interview frameworks with competency-based questions, scoring rubrics, and evaluation criteria. Reduces bias and improves hiring quality through consistent assessment.',
  color: 'adv-blue',
  defaults: {
    thinking: 'think',
    creativity: 'balanced',
    outputFormats: ['policy-document'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'performance-review',
  label: 'Performance Review Template',
  shortLabel: 'Performance Reviews',
  icon: 'BarChart3',
  description: 'Generate structured performance review templates with goal-setting frameworks, competency assessments, development plans, and calibration guidance.',
  color: 'adv-blue',
  defaults: {
    thinking: 'think',
    creativity: 'balanced',
    outputFormats: ['policy-document'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'hr-policy',
  label: 'HR Policy Drafting',
  shortLabel: 'HR Policies',
  icon: 'ScrollText',
  description: 'Draft comprehensive HR policies covering employment terms, workplace conduct, leave, remote work, diversity, disciplinary procedures, and more. Aligned with Nordic employment law and best practices.',
  color: 'adv-blue',
  defaults: {
    thinking: 'think_hard',
    creativity: 'strict',
    outputFormats: ['policy-document'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'ld-planning',
  label: 'L&D Programme Planning',
  shortLabel: 'L&D Planning',
  icon: 'GraduationCap',
  description: 'Design comprehensive learning and development programmes with needs analysis, curriculum design, delivery plans, evaluation frameworks, and ROI measurement.',
  color: 'adv-blue',
  defaults: {
    thinking: 'think_hard',
    creativity: 'balanced',
    outputFormats: ['project-plan', 'training-material'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},

// ── Accounting & Finance ─────────────────────────────────────
{
  id: 'ifrs-gaap-analysis',
  label: 'IFRS/GAAP Analysis',
  shortLabel: 'IFRS/GAAP',
  icon: 'FileSearch',
  description: 'Analyse accounting standards, assess compliance with IFRS and local GAAP requirements, identify disclosure gaps, and evaluate the impact of new or amended standards on financial reporting.',
  color: 'adv-gold',
  defaults: {
    thinking: 'investigate',
    creativity: 'strict',
    outputFormats: ['detailed-findings', 'gap-scoring-matrix'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'IFRS standards, IASB updates, local GAAP requirements' },
    },
  },
},
{
  id: 'management-reporting',
  label: 'Management Reporting',
  shortLabel: 'Mgmt Reporting',
  icon: 'BarChart2',
  description: 'Design and improve management reports, KPI frameworks, dashboards, and financial commentary. Create reports that drive decisions rather than just present data.',
  color: 'adv-gold',
  defaults: {
    thinking: 'think_hard',
    creativity: 'balanced',
    outputFormats: ['executive-summary'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'tax-planning',
  label: 'Tax Planning Support',
  shortLabel: 'Tax Planning',
  icon: 'DollarSign',
  description: 'Analyse tax implications, structure transactions for tax efficiency, evaluate cross-border tax considerations, and support corporate tax planning within Nordic and EU frameworks.',
  color: 'adv-gold',
  defaults: {
    thinking: 'think_hard',
    creativity: 'strict',
    outputFormats: ['decision-memo'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Nordic tax law, EU tax directives, OECD BEPS' },
    },
  },
},
{
  id: 'financial-analysis',
  label: 'Financial Analysis',
  shortLabel: 'Financial Analysis',
  icon: 'LineChart',
  description: 'Perform financial statement analysis, ratio analysis, trend analysis, benchmarking, and financial modelling support. Interpret financial data and generate insights for decision-makers.',
  color: 'adv-gold',
  defaults: {
    thinking: 'think_hard',
    creativity: 'balanced',
    outputFormats: ['detailed-findings', 'executive-summary'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'transfer-pricing',
  label: 'Transfer Pricing Analysis',
  shortLabel: 'Transfer Pricing',
  icon: 'GitBranch',
  description: 'Analyse intercompany transactions, assess arm\'s length compliance, design transfer pricing policies, prepare documentation, and evaluate OECD BEPS and Pillar Two implications.',
  color: 'adv-gold',
  defaults: {
    thinking: 'investigate',
    creativity: 'strict',
    outputFormats: ['detailed-findings'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'OECD Transfer Pricing Guidelines, BEPS Actions 8-10, Nordic transfer pricing rules' },
    },
  },
},

// ── Branding & Creative ──────────────────────────────────────
{
  id: 'brand-strategy',
  label: 'Brand Strategy Workshop',
  shortLabel: 'Brand Strategy',
  icon: 'Target',
  description: 'Develop comprehensive brand strategies including positioning, brand architecture, value propositions, brand personality, and competitive differentiation.',
  color: 'adv-red',
  defaults: {
    thinking: 'think_hard',
    creativity: 'creative',
    outputFormats: ['decision-memo', 'stakeholder-presentation'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Brand strategy frameworks, market trends, competitive positioning' },
    },
  },
},
{
  id: 'content-strategy',
  label: 'Content Strategy Builder',
  shortLabel: 'Content Strategy',
  icon: 'Layers',
  description: 'Design comprehensive content strategies with editorial calendars, channel plans, audience mapping, content pillars, and measurement frameworks.',
  color: 'adv-red',
  defaults: {
    thinking: 'think_hard',
    creativity: 'balanced',
    outputFormats: ['project-plan'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Content marketing trends, editorial best practices' },
    },
  },
},
{
  id: 'copywriting',
  label: 'Copywriting Assistant',
  shortLabel: 'Copywriting',
  icon: 'FileText',
  description: 'Write compelling copy for websites, marketing materials, social media, email campaigns, ads, and thought leadership pieces. Adapts tone and style to your brand voice.',
  color: 'adv-red',
  defaults: {
    thinking: 'think',
    creativity: 'creative',
    outputFormats: ['quick-briefing'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'visual-identity',
  label: 'Visual Identity Guidelines',
  shortLabel: 'Visual Identity',
  icon: 'Layers',
  description: 'Create comprehensive visual identity guidelines covering logo usage, colour palette, typography, imagery, iconography, and application rules.',
  color: 'adv-red',
  defaults: {
    thinking: 'think_hard',
    creativity: 'balanced',
    outputFormats: ['policy-document'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'campaign-design',
  label: 'Campaign Design Planner',
  shortLabel: 'Campaign Design',
  icon: 'Megaphone',
  description: 'Plan integrated marketing campaigns from concept to execution. Covers campaign strategy, creative concepts, channel planning, content calendars, budget allocation, and performance measurement.',
  color: 'adv-red',
  defaults: {
    thinking: 'think_hard',
    creativity: 'creative',
    outputFormats: ['project-plan'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Marketing campaign best practices, channel trends' },
    },
  },
},

// ── Software Engineering ─────────────────────────────────────
{
  id: 'code-review',
  label: 'Code Review Assistant',
  shortLabel: 'Code Review',
  icon: 'GitBranch',
  description: 'Review code for quality, security vulnerabilities, performance issues, maintainability, and adherence to best practices. Provides actionable feedback with severity ratings.',
  color: 'adv-teal',
  defaults: {
    thinking: 'think_hard',
    creativity: 'strict',
    outputFormats: ['detailed-findings'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'architecture-review',
  label: 'Architecture Review',
  shortLabel: 'Architecture',
  icon: 'Network',
  description: 'Evaluate system architecture for scalability, reliability, security, and maintainability. Assess technical decisions, identify risks, and recommend improvements.',
  color: 'adv-teal',
  defaults: {
    thinking: 'investigate',
    creativity: 'balanced',
    outputFormats: ['detailed-findings', 'decision-memo'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Architecture patterns, cloud services, scalability best practices' },
    },
  },
},
{
  id: 'technical-spec',
  label: 'Technical Specification Writer',
  shortLabel: 'Tech Specs',
  icon: 'FileText',
  description: 'Write comprehensive technical specifications for features, systems, and integrations. Covers requirements, design decisions, API contracts, data models, and rollout plans.',
  color: 'adv-teal',
  defaults: {
    thinking: 'think_hard',
    creativity: 'balanced',
    outputFormats: ['policy-document'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'api-design',
  label: 'API Design Advisor',
  shortLabel: 'API Design',
  icon: 'Database',
  description: 'Design RESTful and GraphQL APIs with consistent conventions, proper error handling, pagination, versioning, authentication, and documentation.',
  color: 'adv-teal',
  defaults: {
    thinking: 'think_hard',
    creativity: 'balanced',
    outputFormats: ['policy-document'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'tech-debt-assessment',
  label: 'Tech Debt Assessment',
  shortLabel: 'Tech Debt',
  icon: 'AlertTriangle',
  description: 'Systematically identify, categorise, and prioritise technical debt. Assess business impact, create remediation roadmaps, and build the case for investing in code quality.',
  color: 'adv-teal',
  defaults: {
    thinking: 'investigate',
    creativity: 'balanced',
    outputFormats: ['gap-scoring-matrix', 'action-plan'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},

// ── Sales & Business Development ─────────────────────────────
{
  id: 'deal-review',
  label: 'Deal Review & Coaching',
  shortLabel: 'Deal Review',
  icon: 'Handshake',
  description: 'Analyse sales opportunities, assess deal health, identify risks and gaps, and get coaching on strategy, messaging, and next steps.',
  color: 'adv-green',
  defaults: {
    thinking: 'think',
    creativity: 'balanced',
    outputFormats: ['decision-memo'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'pipeline-analysis',
  label: 'Pipeline Analysis',
  shortLabel: 'Pipeline Analysis',
  icon: 'BarChart3',
  description: 'Analyse sales pipeline health, forecast accuracy, conversion rates, and velocity metrics. Identify risks, stalled deals, and coverage gaps.',
  color: 'adv-green',
  defaults: {
    thinking: 'think_hard',
    creativity: 'balanced',
    outputFormats: ['executive-summary'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},
{
  id: 'pricing-strategy',
  label: 'Pricing Strategy',
  shortLabel: 'Pricing Strategy',
  icon: 'DollarSign',
  description: 'Develop and evaluate pricing strategies, models, and structures. Covers value-based pricing, competitive pricing analysis, and pricing communication.',
  color: 'adv-green',
  defaults: {
    thinking: 'think_hard',
    creativity: 'balanced',
    outputFormats: ['decision-memo'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Pricing strategies, market benchmarks' },
    },
  },
},
{
  id: 'proposal-writing',
  label: 'Sales Proposal Writer',
  shortLabel: 'Proposals',
  icon: 'FileText',
  description: 'Write compelling sales proposals and RFP responses. Covers executive summaries, approach descriptions, team profiles, pricing presentations, and win themes.',
  color: 'adv-green',
  defaults: {
    thinking: 'think_hard',
    creativity: 'balanced',
    outputFormats: ['client-proposal'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Client industry context, competitive positioning' },
    },
  },
},
{
  id: 'win-loss-analysis',
  label: 'Win/Loss Analysis',
  shortLabel: 'Win/Loss',
  icon: 'TrendingUp',
  description: 'Analyse won and lost deals to identify patterns, improve sales effectiveness, and refine go-to-market strategy.',
  color: 'adv-green',
  defaults: {
    thinking: 'think_hard',
    creativity: 'balanced',
    outputFormats: ['detailed-findings'],
    transparencyLevel: 1,
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    },
  },
},

// ═══════════════════════════════════════════════════════════════
// WAVE 4 — AREAS entries for src/lib/constants.ts
// Add these to the AREAS array after Wave 3 areas
// ═══════════════════════════════════════════════════════════════

{
  id: 'hr',
  label: 'Human Resources & People',
  shortLabel: 'HR',
  icon: 'Users',
  color: 'adv-blue',
  moduleIds: [
    'job-description', 'interview-framework', 'performance-review', 'hr-policy', 'ld-planning',
  ],
},
{
  id: 'accounting',
  label: 'Accounting & Finance',
  shortLabel: 'Accounting',
  icon: 'Calculator',
  color: 'adv-gold',
  moduleIds: [
    'ifrs-gaap-analysis', 'management-reporting', 'tax-planning', 'financial-analysis', 'transfer-pricing',
  ],
},
{
  id: 'branding',
  label: 'Branding & Creative',
  shortLabel: 'Branding',
  icon: 'Palette',
  color: 'adv-red',
  moduleIds: ['brand-strategy', 'content-strategy', 'copywriting', 'visual-identity', 'campaign-design'],
},
{
  id: 'software-eng',
  label: 'Software Engineering',
  shortLabel: 'Software Eng',
  icon: 'Code',
  color: 'adv-teal',
  moduleIds: ['code-review', 'architecture-review', 'technical-spec', 'api-design', 'tech-debt-assessment'],
},
{
  id: 'sales',
  label: 'Sales & Business Development',
  shortLabel: 'Sales',
  icon: 'Target',
  color: 'adv-green',
  moduleIds: ['deal-review', 'pipeline-analysis', 'pricing-strategy', 'proposal-writing', 'win-loss-analysis'],
},
