// ============================================================
// Wave 5b — constants.ts snippets
// Paste these into src/lib/constants.ts
// ============================================================

// ─── NEW MODULES: Add to the MODULES array ──────────────────

// ── Public Sector & Government (B15) ─────────────────────────
  {
    id: 'policy-analysis',
    label: 'Policy Analysis',
    shortLabel: 'Policy Analysis',
    icon: 'FileSearch',
    description: 'Analyse public policy proposals, legislative drafts, and regulatory frameworks. Assess policy coherence, stakeholder impact, implementation feasibility, and alignment with government objectives.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'impact-assessment'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'public-consultation',
    label: 'Public Consultation Response',
    shortLabel: 'Consultation',
    icon: 'MessageSquare',
    description: 'Draft structured, evidence-based responses to government and regulatory public consultations, green papers, and calls for evidence.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'procurement-review',
    label: 'Public Procurement Review',
    shortLabel: 'Procurement',
    icon: 'ClipboardList',
    description: 'Review public procurement processes, tender documents, and bid evaluations for compliance with public procurement directives, fairness, and value for money.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'regulatory-impact',
    label: 'Regulatory Impact Assessment',
    shortLabel: 'RIA',
    icon: 'BarChart3',
    description: 'Conduct regulatory impact assessments for proposed legislation and regulation. Analyse costs, benefits, proportionality, and alternatives to support evidence-based policymaking.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['impact-assessment', 'decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'grant-writing',
    label: 'Grant Writing Support',
    shortLabel: 'Grant Writing',
    icon: 'FileText',
    description: 'Structure and draft grant applications, funding proposals, and project bids for public funding, EU programmes, and research grants.',
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

  // ── Consumer Legal (B16) ───────────────────────────────────
  {
    id: 'tenancy-disputes',
    label: 'Tenancy & Housing Disputes',
    shortLabel: 'Tenancy',
    icon: 'Building',
    description: 'Analyse tenancy agreements, identify rights and obligations, structure arguments for housing disputes, and draft communications to landlords or tenancy tribunals.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'employment-rights',
    label: 'Employment Rights Advisor',
    shortLabel: 'Employment',
    icon: 'Users',
    description: 'Analyse employment law issues, assess rights and obligations under employment contracts and labour legislation, and structure advice on workplace disputes.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'consumer-protection',
    label: 'Consumer Protection',
    shortLabel: 'Consumer Protection',
    icon: 'Shield',
    description: 'Analyse consumer rights issues including defective goods, unfair contract terms, misleading advertising, and consumer credit disputes under applicable consumer protection legislation.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'personal-contracts',
    label: 'Personal Contract Review',
    shortLabel: 'Contract Review',
    icon: 'FileSearch',
    description: 'Review personal contracts including service agreements, subscription terms, insurance policies, and membership agreements. Identify risks, unfair terms, and hidden obligations.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'small-claims',
    label: 'Small Claims Support',
    shortLabel: 'Small Claims',
    icon: 'Scale',
    description: 'Structure and prepare small claims cases, draft claim forms and statements, assess claim strength, and provide guidance on small claims procedures and evidence requirements.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Education & Teaching (B17) ─────────────────────────────
  {
    id: 'lesson-planning',
    label: 'Lesson Planning Assistant',
    shortLabel: 'Lesson Plans',
    icon: 'Calendar',
    description: 'Create structured lesson plans with learning objectives, activities, differentiation strategies, assessment methods, and timing for any subject and age group.',
    color: 'adv-gold',
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
    id: 'curriculum-design',
    label: 'Curriculum Design',
    shortLabel: 'Curriculum',
    icon: 'Layers',
    description: 'Design complete curricula, course outlines, and learning pathways. Map learning outcomes, sequence content, plan assessments, and ensure alignment with educational standards.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['project-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'assessment-builder',
    label: 'Assessment & Quiz Builder',
    shortLabel: 'Assessments',
    icon: 'CheckSquare',
    description: 'Create assessments, quizzes, exams, and rubrics. Generate questions at specified difficulty levels, design marking schemes, and build formative and summative assessments.',
    color: 'adv-gold',
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
    id: 'student-feedback',
    label: 'Student Feedback & Reports',
    shortLabel: 'Feedback',
    icon: 'MessageSquare',
    description: 'Generate constructive student feedback, progress reports, and parent communications. Produce balanced, developmental feedback that motivates and guides improvement.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['quick-briefing'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'e-learning-design',
    label: 'E-Learning Course Design',
    shortLabel: 'E-Learning',
    icon: 'Cpu',
    description: 'Design complete e-learning courses with module structures, interactive content, multimedia storyboards, knowledge checks, and learner engagement strategies.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'creative',
      outputFormats: ['training-material', 'project-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── B18: FCP Extensions ────────────────────────────────────
  {
    id: 'regulatory-response-drafter',
    label: 'Regulatory Response Drafter',
    shortLabel: 'Reg Response',
    icon: 'ScrollText',
    description: 'Draft formal responses to regulatory enquiries, supervisory letters, and consultation papers. Structure evidence-based, defensible responses that demonstrate compliance awareness and proactive remediation.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'compliance-monitoring-design',
    label: 'Compliance Monitoring Design',
    shortLabel: 'Monitoring Design',
    icon: 'Activity',
    description: 'Design comprehensive compliance monitoring programmes, testing frameworks, and 2nd line oversight structures. Define monitoring activities, frequencies, sampling methods, and escalation procedures.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['monitoring-plan', 'policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── B18: Legal Extensions ──────────────────────────────────
  {
    id: 'contract-negotiation',
    label: 'Contract Negotiation Advisor',
    shortLabel: 'Negotiation',
    icon: 'Handshake',
    description: 'Analyse contract terms, identify negotiation leverage, and prepare position papers for contract negotiations. Assess risk allocation, benchmark terms, and develop negotiation strategies.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['decision-memo', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'regulatory-sandbox',
    label: 'Regulatory Sandbox Advisor',
    shortLabel: 'Sandbox',
    icon: 'FlaskConical',
    description: 'Guide through regulatory sandbox applications, innovation hub engagement, and no-action letter processes. Assess eligibility, structure applications, and navigate regulatory innovation frameworks.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['client-proposal', 'project-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },


// ─── NEW AREAS: Add to the AREAS array ──────────────────────

  // ── Wave 5b Areas ──────────────────────────────────────────
  {
    id: 'public-sector',
    label: 'Public Sector & Government',
    shortLabel: 'Public Sector',
    icon: 'Building2',
    color: 'adv-blue',
    moduleIds: [
      'policy-analysis', 'public-consultation', 'procurement-review',
      'regulatory-impact', 'grant-writing',
    ],
  },
  {
    id: 'consumer-legal',
    label: 'Consumer Legal',
    shortLabel: 'Consumer Legal',
    icon: 'Scale',
    color: 'adv-red',
    moduleIds: [
      'tenancy-disputes', 'employment-rights', 'consumer-protection',
      'personal-contracts', 'small-claims',
    ],
  },
  {
    id: 'education',
    label: 'Education & Teaching',
    shortLabel: 'Education',
    icon: 'BookOpen',
    color: 'adv-gold',
    moduleIds: [
      'lesson-planning', 'curriculum-design', 'assessment-builder',
      'student-feedback', 'e-learning-design',
    ],
  },


// ─── B18 UPDATES: Add to EXISTING area moduleIds arrays ─────

// FCP area — add to the end of the fcp moduleIds array:
//   'regulatory-response-drafter', 'compliance-monitoring-design',
//
// Legal area — add to the end of the legal moduleIds array:
//   'contract-negotiation', 'regulatory-sandbox',
//
// Updated FCP area entry:
//   moduleIds: [
//     'gap-analysis', 'document-creation', 'sanctions-advisory', 'regulatory-monitor',
//     'training-content', 'data-management', 'risk-assessment', 'investigation-support',
//     'engagement-proposal', 'engagement-execution', 'management-presentation', 'model-validation',
//     'regulatory-response-drafter', 'compliance-monitoring-design',
//   ],
//
// Updated Legal area entry:
//   moduleIds: [
//     'regulatory-interpretation', 'contract-review', 'compliance-framework',
//     'regulatory-change-impact', 'gdpr-privacy', 'legal-brief',
//     'contract-negotiation', 'regulatory-sandbox',
//   ],
