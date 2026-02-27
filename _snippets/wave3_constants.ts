// ============================================================================
// Wave 3 Constants Snippet — Ready to insert into src/lib/constants.ts
// ============================================================================

// ── MODULES to add to the MODULES array ─────────────────────────────────────

  // ── Startups & Entrepreneurship (Wave 3) ──────────────────────
  {
    id: 'business-plan',
    label: 'Business Plan Builder',
    shortLabel: 'Business Plan',
    icon: 'FileText',
    description: 'Build comprehensive business plans with market analysis, financial projections, operational strategy, and go-to-market planning for startups and new ventures.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'pitch-deck',
    label: 'Pitch Deck Creator',
    shortLabel: 'Pitch Deck',
    icon: 'Presentation',
    description: 'Create compelling investor pitch decks with structured narratives, market sizing, competitive positioning, financial projections, and team slides.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'funding-strategy',
    label: 'Funding Strategy Advisor',
    shortLabel: 'Funding Strategy',
    icon: 'DollarSign',
    description: 'Develop a comprehensive funding strategy: evaluate funding options, timing, valuation considerations, investor targeting, and term sheet negotiation guidance.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['decision-memo', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'mvp-scoping',
    label: 'MVP Scoping Workshop',
    shortLabel: 'MVP Scoping',
    icon: 'Target',
    description: 'Define your Minimum Viable Product: prioritise features, map user journeys, establish success metrics, and create a realistic development roadmap.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'project-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'cofounder-agreements',
    label: 'Co-founder Agreements',
    shortLabel: 'Co-founder',
    icon: 'Handshake',
    description: 'Structure co-founder relationships: equity splits, vesting schedules, roles and responsibilities, decision-making frameworks, IP assignment, and exit provisions.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Personal Development & Career (Wave 3) ────────────────────
  {
    id: 'cv-writer',
    label: 'CV & LinkedIn Writer',
    shortLabel: 'CV Writer',
    icon: 'FileText',
    description: 'Create professional CVs and LinkedIn profiles tailored to your target role. Optimise for ATS systems, highlight achievements, and craft compelling personal statements.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'interview-prep',
    label: 'Interview Preparation Coach',
    shortLabel: 'Interview Prep',
    icon: 'MessageSquare',
    description: 'Prepare for job interviews with tailored questions, model answers using the STAR framework, competency mapping, and strategy for different interview formats.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['quick-briefing'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'salary-negotiation',
    label: 'Salary Negotiation Coach',
    shortLabel: 'Salary Negotiation',
    icon: 'DollarSign',
    description: 'Prepare for salary negotiations with market benchmarking, negotiation strategy, script templates, and guidance on total compensation packages.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'career-planning',
    label: 'Career Path Planning',
    shortLabel: 'Career Planning',
    icon: 'TrendingUp',
    description: 'Map your career trajectory: assess current position, identify target roles, close skill gaps, build development plans, and design a strategic career roadmap.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'personal-brand',
    label: 'Personal Brand Builder',
    shortLabel: 'Personal Brand',
    icon: 'Star',
    description: 'Define and build your professional personal brand: positioning, thought leadership strategy, content planning, speaking opportunities, and digital presence.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'creative',
      outputFormats: ['stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Academic Research (Wave 3) ────────────────────────────────
  {
    id: 'literature-review',
    label: 'Literature Review Assistant',
    shortLabel: 'Lit Review',
    icon: 'BookOpen',
    description: 'Conduct systematic or narrative literature reviews: identify key sources, synthesise findings, map research gaps, and structure thematic analysis across scholarly works.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'research-methodology',
    label: 'Research Methodology Design',
    shortLabel: 'Methodology',
    icon: 'FlaskConical',
    description: 'Design robust research methodologies: select appropriate methods, justify choices, plan data collection, define sampling strategies, and address validity and ethics.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'thesis-writing',
    label: 'Thesis & Dissertation Writer',
    shortLabel: 'Thesis Writer',
    icon: 'FileText',
    description: 'Structure and draft thesis chapters: introduction, literature review, methodology, findings, analysis, and conclusion with academic rigour and proper argumentation.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'citation-management',
    label: 'Citation & Reference Manager',
    shortLabel: 'Citations',
    icon: 'Link',
    description: 'Format citations, build bibliographies, verify references, check consistency across citation styles, and identify missing or weak sources in your reference list.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'research-proposal',
    label: 'Research Proposal Writer',
    shortLabel: 'Research Proposal',
    icon: 'ScrollText',
    description: 'Draft compelling research proposals: problem formulation, theoretical framework, methodology, timeline, budget justification, and impact statement for grants and programmes.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['client-proposal'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Communication & PR (Wave 3) ──────────────────────────────
  {
    id: 'press-release',
    label: 'Press Release Writer',
    shortLabel: 'Press Release',
    icon: 'Newspaper',
    description: 'Draft professional press releases with inverted pyramid structure, compelling headlines, quotable quotes, boilerplates, and distribution-ready formatting.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['quick-briefing'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'crisis-comms',
    label: 'Crisis Communications',
    shortLabel: 'Crisis Comms',
    icon: 'AlertTriangle',
    description: 'Develop crisis communication strategies: holding statements, stakeholder messaging, media responses, internal communications, and escalation protocols for reputational events.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['decision-memo', 'stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'internal-comms',
    label: 'Internal Communications',
    shortLabel: 'Internal Comms',
    icon: 'Users',
    description: 'Create internal communications: town hall scripts, email announcements, change communications, intranet articles, and employee engagement content.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['training-material'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'stakeholder-messaging',
    label: 'Stakeholder Messaging Framework',
    shortLabel: 'Stakeholder Messaging',
    icon: 'Network',
    description: 'Build comprehensive stakeholder messaging frameworks: audience segmentation, key messages per stakeholder group, channel strategy, and communication timelines.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'media-briefing',
    label: 'Media Briefing & Q&A Prep',
    shortLabel: 'Media Briefing',
    icon: 'Mic',
    description: 'Prepare for media interviews and briefings: key messages, anticipated questions with model answers, bridging techniques, and dos and don\'ts for spokespeople.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['quick-briefing'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

// ── AREAS to add to the AREAS array ─────────────────────────────────────────

  // ── Wave 3 Areas ─────────────────────────────────────────
  {
    id: 'startups',
    label: 'Startups & Entrepreneurship',
    shortLabel: 'Startups',
    icon: 'Rocket',
    color: 'adv-gold',
    moduleIds: [
      'business-plan', 'pitch-deck', 'funding-strategy',
      'mvp-scoping', 'cofounder-agreements',
    ],
  },
  {
    id: 'personal-dev',
    label: 'Personal Development & Career',
    shortLabel: 'Career',
    icon: 'TrendingUp',
    color: 'adv-teal',
    moduleIds: [
      'cv-writer', 'interview-prep', 'salary-negotiation',
      'career-planning', 'personal-brand',
    ],
  },
  {
    id: 'academic',
    label: 'Academic Research',
    shortLabel: 'Academic',
    icon: 'GraduationCap',
    color: 'adv-blue',
    moduleIds: [
      'literature-review', 'research-methodology', 'thesis-writing',
      'citation-management', 'research-proposal',
    ],
  },
  {
    id: 'comms-pr',
    label: 'Communication & PR',
    shortLabel: 'Comms & PR',
    icon: 'Megaphone',
    color: 'adv-green',
    moduleIds: [
      'press-release', 'crisis-comms', 'internal-comms',
      'stakeholder-messaging', 'media-briefing',
    ],
  },
