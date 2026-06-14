import type { ModuleDefinition, ModelInfo } from './types';
import { NEW_FCP_MODULES, NEW_LEGAL_MODULES } from './area-patches/fcp-legal-patch';
import { AUDIT_NEW_MODULES, HR_NEW_MODULES, BANKING_NEW_MODULES } from './area-patches/audit-hr-banking-patch';
import { ACCOUNTING_NEW_MODULES, PROJECT_MGMT_NEW_MODULES, COMMS_PR_NEW_MODULES } from './area-patches/accounting-pm-comms-patch';
import { SOFTWARE_ENG_NEW_MODULES, SALES_NEW_MODULES, ESG_NEW_MODULES } from './area-patches/software-sales-esg-patch';
import { STRATEGY_NEW_MODULES, OPERATIONS_NEW_MODULES } from './area-patches/strategy-ops-patch';
import { PHASE4_PROFESSIONAL_MODULES } from './area-patches/phase4-professional-patch';
import { PHASE4_GLOBAL_SOUTH_MODULES } from './area-patches/phase4-global-south-patch';
import { PHASE4_BOP_MODULES } from './area-patches/phase4-bop-patch';
import { CODING_MODULES } from './area-patches/coding-patch';
import { PE_VC_MODULES } from './area-patches/pe-vc-patch';
import { BLOCKCHAIN_MODULES } from './area-patches/blockchain-patch';
import { PAYMENTS_DORA_MODULES } from './area-patches/payments-dora-patch';
import { INSURANCE_MODULES } from './area-patches/insurance-patch';
import { TALENT_MODULES } from './area-patches/talent-patch';
import { HARDWARE_MODULES } from './area-patches/hardware-patch';
import {
  SURFACED_FCP_MODULES,
  SURFACED_CYBER_MODULES,
  SURFACED_INVESTMENT_MODULES,
  SURFACED_CONSULTING_MODULES,
  SURFACED_INSURANCE_MODULES,
  SURFACED_ACCOUNTING_MODULES,
} from './area-patches/surfaced-modules-patch';
import { TIER_A_MODULES } from './area-patches/tier-a-patch';
import { TIER_B_MODULES } from './area-patches/tier-b-patch';
import { TIER_C_MODULES } from './area-patches/tier-c-patch';

export const MODULES: ModuleDefinition[] = [
  {
    id: 'gap-analysis',
    label: 'AMLR Gap Analysis',
    shortLabel: 'Gap Analysis',
    icon: 'SearchCheck',
    description: 'Analyze compliance gaps against AMLR and other regulatory frameworks. Upload client documents, point to regulations, and get structured gap assessments.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'executive-summary', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'document-creation',
    label: 'Document Creation',
    shortLabel: 'Documents',
    icon: 'FileText',
    description: 'Create AML policies, BWRAs, KYC procedures, training programmes, and other compliance documents from templates or from scratch.',
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
    id: 'sanctions-advisory',
    label: 'Sanctions Advisory',
    shortLabel: 'Sanctions',
    icon: 'Shield',
    description: 'Sanctions regime briefings, screening assessments, policy reviews, de-risking analysis, and incident response guidance.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
      },
    },
  },
  {
    id: 'regulatory-monitor',
    label: 'Regulatory Monitor',
    shortLabel: 'Reg Monitor',
    icon: 'Radar',
    description: 'Analyze new regulatory developments, consultation papers, and guideline updates. Get impact assessments and implementation briefings.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['quick-briefing', 'impact-assessment'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        onlineReference: { enabled: true, urls: [], fetchDepth: 'full' },
      },
    },
  },
  {
    id: 'training-content',
    label: 'Training Content',
    shortLabel: 'Training',
    icon: 'GraduationCap',
    description: 'Generate training materials for different audiences: Board, Compliance, Front-line staff, Relationship managers, and Operations/IT.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'creative',
      outputFormats: ['training-material'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'data-management',
    label: 'AMLA Data Management',
    shortLabel: 'Data Mgmt',
    icon: 'Database',
    description: 'AMLA data readiness assessments, data quality scoring, gap identification, and implementation planning for data management requirements.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['data-readiness-scorecard', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'risk-assessment',
    label: 'Risk Assessment',
    shortLabel: 'Risk',
    icon: 'BarChart3',
    description: 'ML/TF risk assessment support: maturity scoring, risk factor analysis, inherent/residual risk evaluation, and control effectiveness.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['maturity-assessment', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
      },
    },
  },
  {
    id: 'investigation-support',
    label: 'Investigation Support',
    shortLabel: 'Investigation',
    icon: 'Search',
    description: 'Structure investigation analysis, case documentation, and suspicious activity reporting. Does NOT make compliance decisions — structures analysis only.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['problem-solution'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'engagement-proposal',
    label: 'Engagement Proposal Writer',
    shortLabel: 'Proposal',
    icon: 'Handshake',
    description: 'Create tailored client proposals and RFP responses. Upload RFP documents, select engagement type, and generate professional, structured proposals.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['client-proposal', 'project-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'engagement-execution',
    label: 'Engagement Execution Engine',
    shortLabel: 'Execution',
    icon: 'Rocket',
    description: 'Parse engagement letters into scope items and systematically analyze each against client documents and regulatory frameworks. Track progress across deliverables.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'management-presentation',
    label: 'Management Presentation',
    shortLabel: 'Presentation',
    icon: 'Presentation',
    description: 'Convert analysis findings into structured management presentations. Generate slide-by-slide content with speaker notes, RAG tables, and export to PowerPoint.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['management-presentation', 'stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'model-validation',
    label: 'FCP Model Validation',
    shortLabel: 'Model Valid.',
    icon: 'FlaskConical',
    description: 'Validate FCP models including transaction monitoring, sanctions screening, risk scoring, and customer risk rating. Assess model design, calibration, and regulatory compliance.',
    color: 'adv-gold',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Legal & Regulatory (Area 2) ─────────────────────────────
  {
    id: 'regulatory-interpretation',
    label: 'Regulatory Interpretation',
    shortLabel: 'Reg Interpretation',
    icon: 'FileSearch',
    description: 'Interpret financial services regulations, identify obligations, cross-reference delegated acts, and translate legal text into practical compliance requirements.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'regulatory-comparison'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'contract-review',
    label: 'Contract Review & Analysis',
    shortLabel: 'Contract Review',
    icon: 'FileCheck',
    description: 'Review contracts for risk, regulatory compliance, missing clauses, and commercial balance. Get clause-by-clause findings with negotiation guidance.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'compliance-framework',
    label: 'Compliance Framework Builder',
    shortLabel: 'Compliance Framework',
    icon: 'LayoutDashboard',
    description: 'Design or restructure compliance frameworks: policy hierarchies, control architectures, three lines of defence, monitoring programmes, and governance structures.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'regulatory-change-impact',
    label: 'Regulatory Change Impact',
    shortLabel: 'Change Impact',
    icon: 'GitCompare',
    description: 'Assess the operational, technical, and organisational impact of new or amended regulation on your institution. Produce impact heat maps and implementation roadmaps.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['impact-assessment', 'project-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'gdpr-privacy',
    label: 'GDPR & Data Privacy',
    shortLabel: 'GDPR / Privacy',
    icon: 'Lock',
    description: 'DPIA methodology, lawful basis analysis, data mapping, privacy by design, and GDPR compliance assessment for financial services and corporate contexts.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'legal-brief',
    label: 'Legal Brief Creator',
    shortLabel: 'Legal Brief',
    icon: 'ScrollText',
    description: 'Draft structured legal memoranda, regulatory opinion letters, and legal briefs with issue identification, applicable law analysis, and conclusions.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Audit & Assurance (Area 3) ──────────────────────────────
  {
    id: 'audit-planning',
    label: 'Audit Planning',
    shortLabel: 'Audit Plan',
    icon: 'ClipboardList',
    description: 'Design risk-based audit plans for internal audits, compliance reviews, and thematic examinations. Includes scope, methodology, resource allocation, and timeline.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'maturity-assessment'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'control-testing',
    label: 'Control Testing Design',
    shortLabel: 'Control Testing',
    icon: 'TestTube',
    description: 'Design specific audit test procedures, define sampling methodology, specify evidence requirements, and create detailed fieldwork work programmes.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['action-plan', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'finding-writer',
    label: 'Finding & Observation Writer',
    shortLabel: 'Finding Writer',
    icon: 'FileWarning',
    description: 'Write clear, impactful audit findings using the 5C framework. Turn test results into well-structured findings that drive remediation.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'audit-report',
    label: 'Internal Audit Report',
    shortLabel: 'Audit Report',
    icon: 'FileText',
    description: 'Compile complete internal audit reports: executive summary, findings with ratings, root cause themes, management action plans, and distribution.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'sox-isae',
    label: 'SOX / ISAE Compliance',
    shortLabel: 'SOX / ISAE',
    icon: 'Shield',
    description: 'Control documentation, ITGC testing design, process-level control matrices, and management assertion testing for ISAE 3402 and SOX compliance.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'regulatory-exam-prep',
    label: 'Regulatory Exam Preparation',
    shortLabel: 'Exam Prep',
    icon: 'ClipboardCheck',
    description: 'Prepare for regulatory examinations and supervisory reviews. Assess readiness, identify gaps, structure documentation, and prepare management for supervisory meetings.',
    color: 'adv-gold',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Client Engagement & Consulting (Area 4) ─────────────────
  {
    id: 'proposal-generator',
    label: 'Proposal Generator',
    shortLabel: 'Proposals',
    icon: 'Send',
    description: 'Create winning client proposals and RFP responses. Demonstrate deep understanding of the client\'s problem and present a compelling, tailored approach.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['client-proposal', 'project-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'stakeholder-mapping',
    label: 'Stakeholder Mapping',
    shortLabel: 'Stakeholders',
    icon: 'Network',
    description: 'Map stakeholder power and interest, design engagement strategies, identify blockers, and build communication plans for complex change programmes.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['raci-matrix', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'engagement-delivery',
    label: 'Engagement Delivery Management',
    shortLabel: 'Delivery',
    icon: 'Rocket',
    description: 'Structure engagement delivery: scope management, status reporting, issue escalation, quality control, and client relationship management throughout a consulting engagement.',
    color: 'adv-green',
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
    id: 'client-presentation',
    label: 'Client Presentation Builder',
    shortLabel: 'Presentations',
    icon: 'Presentation',
    description: 'Structure management presentations, steering committee updates, and board papers. Slide-by-slide outlines with speaker notes and key messages.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['stakeholder-presentation', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'change-management',
    label: 'Change Management',
    shortLabel: 'Change Mgmt',
    icon: 'RefreshCw',
    description: 'Design change management strategies for regulatory and transformation programmes: readiness assessment, resistance management, training, and embedding.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },

  // ── Banking & Financial Services (Area 5) ────────────────────
  {
    id: 'credit-risk',
    label: 'Credit Risk Analysis',
    shortLabel: 'Credit Risk',
    icon: 'TrendingDown',
    description: 'Analyse credit risk for corporate and retail borrowers: financial analysis, risk assessment, collateral review, scenario analysis, and credit recommendation.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'payment-services',
    label: 'Payment Services Regulation',
    shortLabel: 'Payments',
    icon: 'CreditCard',
    description: 'PSD2/PSD3 compliance, payment institution licensing, SCA requirements, open banking obligations, and fraud liability analysis.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'regulatory-comparison'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
      },
    },
  },
  {
    id: 'financial-statement',
    label: 'Financial Statement Analysis',
    shortLabel: 'Financials',
    icon: 'BarChart2',
    description: 'Analyse financial statements for banks and financial institutions: profitability, capital adequacy, asset quality, funding, and liquidity with regulatory context.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'regulatory-capital',
    label: 'Regulatory Capital & Basel',
    shortLabel: 'Capital / Basel',
    icon: 'Building',
    description: 'CRR3/Basel IV capital requirements, ICAAP support, capital planning, stress testing, and Pillar 2 assessment for credit institutions.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'impact-assessment'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'product-compliance',
    label: 'Product Compliance Review',
    shortLabel: 'Product Compliance',
    icon: 'PackageCheck',
    description: 'Assess financial product compliance: suitability, disclosure requirements, fair value, product governance, and consumer protection obligations.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Risk Management / Enterprise (Area 6) ────────────────────
  {
    id: 'enterprise-risk',
    label: 'Enterprise Risk Assessment',
    shortLabel: 'ERM Assessment',
    icon: 'AlertTriangle',
    description: 'Structured enterprise risk assessment: risk identification, likelihood/impact scoring, control assessment, residual risk, and action prioritisation across all risk categories.',
    color: 'adv-red',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['maturity-assessment', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'risk-appetite',
    label: 'Risk Appetite Framework',
    shortLabel: 'Risk Appetite',
    icon: 'Gauge',
    description: 'Design or review risk appetite statements, tolerance levels, risk limits, and KRI frameworks. Board-ready risk appetite documentation.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'operational-risk',
    label: 'Operational Risk Management',
    shortLabel: 'Operational Risk',
    icon: 'Settings',
    description: 'Operational risk assessment, RCSA design, loss data analysis, scenario analysis, and operational risk framework design for financial institutions.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'scenario-analysis',
    label: 'Scenario Analysis & Stress Testing',
    shortLabel: 'Scenarios',
    icon: 'GitBranch',
    description: 'Design stress scenarios, assess institution-specific impact paths, and produce scenario analysis for ICAAP, risk appetite calibration, and strategic planning.',
    color: 'adv-red',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'impact-assessment'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'third-party-risk',
    label: 'Third-Party Risk Management',
    shortLabel: 'Third-Party Risk',
    icon: 'Share2',
    description: 'Third-party risk assessment, outsourcing register review, due diligence frameworks, and DORA/EBA outsourcing compliance for financial institutions.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Cybersecurity & Information Security (Wave 2) ────────────
  {
    id: 'dora-compliance',
    label: 'DORA Compliance Assessment',
    shortLabel: 'DORA',
    icon: 'ShieldCheck',
    description: 'Assess compliance with the Digital Operational Resilience Act across all five pillars. Produces gap scoring matrix and remediation roadmap.',
    color: 'adv-red',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'DORA Regulation EU 2022/2554, ESA RTS/ITS' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'security-assessment',
    label: 'Information Security Assessment',
    shortLabel: 'Security Assessment',
    icon: 'ScanSearch',
    description: 'Assess information security maturity against ISO 27001, NIST CSF, and EBA ICT guidelines. Identify control gaps and produce a security improvement roadmap.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['maturity-assessment', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'incident-response',
    label: 'Cyber Incident Response',
    shortLabel: 'Incident Response',
    icon: 'Siren',
    description: 'Structure cyber incident response: classification, DORA regulatory reporting, containment strategy, root cause analysis, and lessons learned.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['action-plan', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'ict-risk-management',
    label: 'ICT Risk Management Framework',
    shortLabel: 'ICT Risk',
    icon: 'Network',
    description: 'Design or review ICT risk management frameworks meeting DORA Pillar 1 and EBA ICT guidelines: governance, asset management, protection controls, and recovery.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'third-party-cyber-risk',
    label: 'Third-Party & Cloud Cyber Risk',
    shortLabel: 'Vendor Cyber Risk',
    icon: 'Network',
    description: 'Assess ICT third-party risk under DORA Pillar 4: vendor tiering, contractual requirements, Register of Information, and exit strategy planning.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Data & Analytics (Wave 2) ─────────────────────────────────
  {
    id: 'data-quality',
    label: 'Data Quality Assessment',
    shortLabel: 'Data Quality',
    icon: 'DatabaseZap',
    description: 'Assess data quality across six dimensions: completeness, accuracy, consistency, timeliness, uniqueness, and validity. Root cause analysis and remediation plan.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['data-readiness-scorecard', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'data-governance',
    label: 'Data Governance Framework',
    shortLabel: 'Data Governance',
    icon: 'Database',
    description: 'Design or review data governance frameworks: ownership structures, policies, data dictionaries, master data management. Aligned with DAMA and BCBS 239.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'analytics-design',
    label: 'Analytics & Reporting Design',
    shortLabel: 'Analytics Design',
    icon: 'BarChart2',
    description: 'Design analytics solutions, KRI/KPI frameworks, dashboards, and MI structures for compliance, risk, and business performance reporting.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'data-strategy',
    label: 'Data Strategy Development',
    shortLabel: 'Data Strategy',
    icon: 'Layers',
    description: 'Develop an organisational data strategy: vision, principles, capability roadmap, technology architecture direction, and operating model.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Project Management & Delivery (Wave 2) ────────────────────
  {
    id: 'project-planning',
    label: 'Project Planning',
    shortLabel: 'Project Plan',
    icon: 'FolderKanban',
    description: 'Create realistic project plans for regulatory change, technology implementation, and transformation. WBS, dependency mapping, RAID log, and governance structure.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['project-plan', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'status-reporting',
    label: 'Status & Progress Reporting',
    shortLabel: 'Status Report',
    icon: 'ClipboardList',
    description: 'Generate professional project status reports, standup summaries, and steering committee updates with clear RAG status and decisions required.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['quick-briefing', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'risk-issue-tracker',
    label: 'RAID Log & Risk Management',
    shortLabel: 'RAID Log',
    icon: 'AlertCircle',
    description: 'Create and manage project RAID logs (Risks, Assumptions, Issues, Dependencies). Analyse risks, develop mitigations, and produce resolution plans.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'resource-planning',
    label: 'Resource & Budget Planning',
    shortLabel: 'Resources & Budget',
    icon: 'Users',
    description: 'Plan resource requirements, team composition, and budget estimates. FTE needs by workstream, skills gap analysis, build/buy/borrow decisions, and investment cases.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['budget-resource-estimate', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Environment, Sustainability & ESG (Wave 2) ────────────────
  {
    id: 'csrd-reporting',
    label: 'CSRD / ESRS Reporting',
    shortLabel: 'CSRD / ESRS',
    icon: 'FileBarChart',
    description: 'Navigate CSRD and ESRS sustainability reporting: scope, double materiality, gap analysis, data requirements, process design, and assurance readiness.',
    color: 'adv-green',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['gap-scoring-matrix', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'CSRD, ESRS 1-2, topical ESRS, EU Taxonomy' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'double-materiality',
    label: 'Double Materiality Assessment',
    shortLabel: 'Double Materiality',
    icon: 'CircleDot',
    description: 'Conduct ESRS 1-compliant Double Materiality Assessment: impact and financial materiality scoring, stakeholder engagement, and topic determination.',
    color: 'adv-green',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['maturity-assessment', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'ESRS 1, EFRAG implementation guidance' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'esg-strategy',
    label: 'ESG Strategy Development',
    shortLabel: 'ESG Strategy',
    icon: 'Leaf',
    description: 'Develop or review ESG strategy: materiality alignment, target setting, science-based targets, governance structure, and implementation roadmap.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'climate-risk',
    label: 'Climate Risk Assessment',
    shortLabel: 'Climate Risk',
    icon: 'Thermometer',
    description: 'Assess physical and transition climate risks: exposure mapping, NGFS scenario analysis, financial impact, and TCFD/ESRS E1 disclosure support.',
    color: 'adv-green',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'impact-assessment'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'TCFD, ESRS E1, NGFS scenarios, ECB climate risk guidance' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Strategy & Business Development (Wave 2) ─────────────────
  {
    id: 'business-case',
    label: 'Business Case Builder',
    shortLabel: 'Business Case',
    icon: 'TrendingUp',
    description: 'Build investment-grade business cases: problem definition, options analysis, cost-benefit, NPV/ROI, risk assessment, and a clear recommendation for approval.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['decision-memo', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'strategic-analysis',
    label: 'Strategic Analysis',
    shortLabel: 'Strategic Analysis',
    icon: 'Compass',
    description: 'Conduct structured strategic analysis: SWOT, PESTLE, Porter\'s Five Forces, and scenario planning. Assess competitive positioning and strategic options.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'market-entry',
    label: 'Market Entry Assessment',
    shortLabel: 'Market Entry',
    icon: 'MapPin',
    description: 'Assess feasibility of entering a new market: market attractiveness, regulatory landscape, competitive dynamics, entry modes, path to profitability, go/no-go.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['decision-memo', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'competitive-analysis',
    label: 'Competitive Analysis',
    shortLabel: 'Competitive Analysis',
    icon: 'Crosshair',
    description: 'Analyse competitive landscape: competitor profiling, positioning maps, competitive advantage assessment, and win/loss analysis for strategic positioning.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Investment & Asset Management (Wave 2) ────────────────────
  {
    id: 'investment-analysis',
    label: 'Investment Analysis',
    shortLabel: 'Investment Analysis',
    icon: 'LineChart',
    description: 'Analyse investment opportunities: business model, financial analysis, valuation (DCF, comparables), risk identification, ESG, and investment recommendation.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'portfolio-review',
    label: 'Portfolio Review & Attribution',
    shortLabel: 'Portfolio Review',
    icon: 'PieChart',
    description: 'Conduct portfolio reviews: performance attribution, risk factor analysis, positioning assessment, benchmark comparison, and construction recommendations.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'fund-compliance',
    label: 'Fund Regulatory Compliance',
    shortLabel: 'Fund Compliance',
    icon: 'ShieldCheck',
    description: 'Assess regulatory compliance for investment funds and asset managers: UCITS, AIFMD, MiFID II, SFDR, PRIIPs, mandate compliance, and ESG disclosure.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'mifid-advisory',
    label: 'MiFID II / Investment Advisory',
    shortLabel: 'MiFID Advisory',
    icon: 'Scale',
    description: 'MiFID II suitability assessments, appropriateness testing, best execution analysis, product governance reviews, and client classification advisory.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── B18 Extensions: FCP ──────────────────────────────────────
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

  // ── B18 Extensions: Legal ────────────────────────────────────
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

  // ── Startups & Entrepreneurship ──────────────────────────────
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

  // ── Personal Development & Career ────────────────────────────
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

  // ── Academic Research ────────────────────────────────────────
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

  // ── Communication & PR ───────────────────────────────────────
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
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'OECD Transfer Pricing Guidelines, BEPS Actions 8-10, Nordic transfer pricing rules' },
      },
    },
  },

  // ── Insurance & Actuarial ────────────────────────────────────
  {
    id: 'solvency-ii',
    label: 'Solvency II Compliance',
    shortLabel: 'Solvency II',
    icon: 'ShieldCheck',
    description: 'Analyse Solvency II regulatory requirements, assess compliance gaps, and produce structured findings reports covering Pillar 1, 2, and 3.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'claims-analysis',
    label: 'Claims Analysis & Fraud Detection',
    shortLabel: 'Claims Analysis',
    icon: 'Search',
    description: 'Analyse insurance claims data, identify fraud indicators, assess claims patterns, and develop fraud detection frameworks.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'product-governance',
    label: 'Insurance Product Governance',
    shortLabel: 'Product Governance',
    icon: 'PackageCheck',
    description: 'Develop and review insurance product governance frameworks in line with IDD requirements and EIOPA guidelines.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'idd-compliance',
    label: 'IDD Compliance',
    shortLabel: 'IDD Compliance',
    icon: 'FileCheck',
    description: 'Assess compliance with the Insurance Distribution Directive requirements covering conduct of business, suitability testing, inducements, and disclosure.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'actuarial-comms',
    label: 'Actuarial Communications',
    shortLabel: 'Actuarial Comms',
    icon: 'BarChart3',
    description: 'Transform complex actuarial analyses into clear communications for non-technical stakeholders. Produces board-ready summaries and management reports.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'quick-briefing'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Real Estate & Property ───────────────────────────────────
  {
    id: 'property-due-diligence',
    label: 'Property Due Diligence',
    shortLabel: 'Due Diligence',
    icon: 'SearchCheck',
    description: 'Conduct comprehensive property due diligence analysis covering legal, environmental, structural, and financial dimensions.',
    color: 'adv-gold',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'lease-review',
    label: 'Lease Agreement Review',
    shortLabel: 'Lease Review',
    icon: 'FileSearch',
    description: 'Review and analyse commercial and residential lease agreements. Identifies key terms, unusual clauses, risk areas, and tenant/landlord obligations.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'valuation-support',
    label: 'Property Valuation Support',
    shortLabel: 'Valuation Support',
    icon: 'BarChart2',
    description: 'Support property valuation processes with structured analysis of comparable transactions, market conditions, and valuation methodology considerations.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'planning-analysis',
    label: 'Planning & Zoning Analysis',
    shortLabel: 'Planning Analysis',
    icon: 'Map',
    description: 'Analyse planning and zoning regulations, assess development potential, and evaluate planning risks for property transactions and development projects.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'impact-assessment'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 're-investment-analysis',
    label: 'Real Estate Investment Analysis',
    shortLabel: 'RE Investment',
    icon: 'TrendingUp',
    description: 'Analyse real estate investment opportunities with structured evaluation of financial returns, risk factors, market positioning, and strategic fit.',
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

  // ── Personal Finance ─────────────────────────────────────────
  {
    id: 'budget-planning',
    label: 'Budget Planning Assistant',
    shortLabel: 'Budget Planning',
    icon: 'Calculator',
    description: 'Create comprehensive personal or household budgets with structured income and expense analysis, savings targets, and spending optimisation recommendations.',
    color: 'adv-green',
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
    id: 'tax-optimisation',
    label: 'Tax Optimisation Advisor',
    shortLabel: 'Tax Optimisation',
    icon: 'DollarSign',
    description: 'Analyse tax situations and identify legitimate optimisation opportunities across income tax, capital gains, property taxes, and retirement contributions.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
      },
    },
  },
  {
    id: 'pension-planning',
    label: 'Pension & Retirement Planning',
    shortLabel: 'Pension Planning',
    icon: 'Calendar',
    description: 'Analyse pension arrangements and develop retirement planning strategies covering occupational pensions, private savings, and state pension entitlements.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['decision-memo', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
      },
    },
  },
  {
    id: 'debt-management',
    label: 'Debt Management Strategy',
    shortLabel: 'Debt Management',
    icon: 'TrendingDown',
    description: 'Analyse debt situations and develop structured repayment strategies using avalanche and snowball methods, consolidation analysis, and practical steps.',
    color: 'adv-green',
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
    id: 'savings-strategy',
    label: 'Savings & Investment Strategy',
    shortLabel: 'Savings Strategy',
    icon: 'TrendingUp',
    description: 'Develop personalised savings and investment strategies aligned with financial goals, risk tolerance, and time horizons.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
      },
    },
  },

  // ── Healthcare & Life Sciences ───────────────────────────────
  {
    id: 'clinical-protocol',
    label: 'Clinical Protocol Development',
    shortLabel: 'Clinical Protocol',
    icon: 'FileText',
    description: 'Develop and review clinical protocols and standard operating procedures for healthcare settings with evidence-based design.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'regulatory-pathway',
    label: 'Regulatory Pathway Planning',
    shortLabel: 'Regulatory Pathway',
    icon: 'GitBranch',
    description: 'Plan and analyse regulatory pathways for pharmaceuticals, medical devices, and healthcare products covering EMA and national agency procedures.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['project-plan', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'patient-comms',
    label: 'Patient Communication Materials',
    shortLabel: 'Patient Comms',
    icon: 'MessageSquare',
    description: 'Create clear, empathetic, and accessible patient communication materials including leaflets, consent forms, and health education content.',
    color: 'adv-red',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['training-material'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'healthcare-gdpr',
    label: 'Healthcare Data & GDPR',
    shortLabel: 'Healthcare GDPR',
    icon: 'Lock',
    description: 'Assess and strengthen healthcare data protection practices against GDPR requirements with specific focus on health data processing.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'research-ethics',
    label: 'Research Ethics Framework',
    shortLabel: 'Research Ethics',
    icon: 'Scale',
    description: 'Develop and review research ethics frameworks, policies, and procedures for healthcare and life sciences research.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'hospital-operations',
    label: 'Hospital Operations Optimisation',
    shortLabel: 'Hospital Operations',
    icon: 'Building2',
    description: 'Operational efficiency assessment for hospitals and healthcare facilities covering patient flow, bed management, OR utilisation, ED throughput, and workforce planning.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'impact-assessment', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Lean in healthcare, Theory of Constraints, bed management, OR utilisation, ED throughput, workforce planning' },
      },
    },
  },
  {
    id: 'medical-device-compliance',
    label: 'Medical Device Regulatory Compliance',
    shortLabel: 'Medical Devices',
    icon: 'Stethoscope',
    description: 'Navigate medical device regulatory compliance globally — EU MDR/IVDR, FDA 510(k)/PMA, risk classification, technical documentation, Post-Market Surveillance, ISO 13485.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'action-plan', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'EU MDR 2017/745, IVDR 2017/746, FDA 510(k), PMA, ISO 13485, risk classification, technical documentation, Post-Market Surveillance, SaMD' },
      },
    },
  },
  {
    id: 'patient-safety-quality',
    label: 'Patient Safety & Quality Assessment',
    shortLabel: 'Patient Safety',
    icon: 'ShieldCheck',
    description: 'Assess patient safety programmes, clinical quality indicators, serious adverse event processes, root cause analysis, and accreditation readiness — JCI, ISO 15189, CQC.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'WHO patient safety goals, JCI International Patient Safety Goals, RCA methodology, FMEA in healthcare, Just Culture, clinical quality indicators, accreditation standards' },
      },
    },
  },
  {
    id: 'pharma-market-access',
    label: 'Pharmaceutical Market Access Strategy',
    shortLabel: 'Market Access',
    icon: 'TrendingUp',
    description: 'Develop market access strategies for pharmaceutical and biotech products — HTA submissions, reimbursement negotiations, pricing strategy, HEOR evidence generation, payer engagement.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'decision-memo', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'HTA methodologies, NICE cost-effectiveness, G-BA benefit assessment, HAS SMR/ASMR, HEOR evidence, managed entry agreements, payer landscape, international reference pricing' },
      },
    },
  },
  {
    id: 'healthcare-regulatory-submission',
    label: 'Healthcare Regulatory Submission Guide',
    shortLabel: 'Regulatory Submission',
    icon: 'FileCheck',
    description: 'Prepare and manage regulatory submissions to health authorities — EMA, FDA, MHRA. Covers CTD format, scientific advice, marketing authorisation, and variation applications.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['action-plan', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'CTD format, EMA CHMP procedures, FDA review pathways, marketing authorisation requirements, variation applications, regulatory timelines' },
      },
    },
  },
  {
    id: 'clinical-documentation-assistant',
    label: 'Clinical Documentation Assistant',
    shortLabel: 'Clinical Docs',
    icon: 'ClipboardPen',
    description: 'Draft discharge summaries, referral letters, outpatient letters, and clinical notes to professional standards — saving clinicians administrative time while maintaining medico-legal accuracy.',
    color: 'adv-red',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Clinical documentation standards, SBAR, SOAP notes, NHS discharge summary requirements, referral letter etiquette, medico-legal documentation' },
      },
    },
  },
  {
    id: 'medical-evidence-synthesiser',
    label: 'Medical Evidence Synthesiser',
    shortLabel: 'Evidence Synthesis',
    icon: 'Microscope',
    description: 'Synthesise medical evidence using PICO, GRADE, and Oxford CEBM frameworks. Critically appraises study quality, grades evidence strength, and translates research into actionable clinical guidance.',
    color: 'adv-red',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Clinical evidence, systematic reviews, RCTs, GRADE methodology, critical appraisal, NNT/NNH, Cochrane methodology, medical literature' },
      },
    },
  },
  {
    id: 'practice-management-optimizer',
    label: 'Practice Management & Admin Optimizer',
    shortLabel: 'Practice Management',
    icon: 'CalendarClock',
    description: 'Optimise healthcare practice workflows — scheduling, referrals, QOF recall, patient communications, staff rotas, CQC preparation. Specific, actionable guidance for primary and specialist care.',
    color: 'adv-red',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'policy-document'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Primary care management, QOF framework, e-RS referral pathways, scheduling optimisation, EMIS/SystmOne workflows, CQC inspection criteria, PCN requirements' },
      },
    },
  },
  {
    id: 'patient-education-material-creator',
    label: 'Patient Education Material Creator',
    shortLabel: 'Patient Education',
    icon: 'BookOpen',
    description: 'Create clinically accurate, readable patient education materials — condition guides, discharge instructions, self-management plans — at precisely the right reading level using health literacy and behaviour change principles.',
    color: 'adv-red',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['training-material'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Health literacy standards, plain language guidelines, NICE patient information standards, behaviour change models, condition-specific clinical information' },
      },
    },
  },

  // ── Manufacturing & Operations ───────────────────────────────
  {
    id: 'process-improvement',
    label: 'Process Improvement',
    shortLabel: 'Process Improvement',
    icon: 'RefreshCw',
    description: 'Analyse manufacturing and operational processes to identify improvement opportunities including bottleneck identification and waste elimination.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'project-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'supply-chain-risk',
    label: 'Supply Chain Risk Assessment',
    shortLabel: 'Supply Chain Risk',
    icon: 'Network',
    description: 'Assess and mitigate risks across manufacturing supply chains including supplier risk profiling and geopolitical risk assessment.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'quality-management',
    label: 'Quality Management System',
    shortLabel: 'Quality Management',
    icon: 'CheckSquare',
    description: 'Develop, review, and improve Quality Management Systems aligned with ISO 9001 and industry-specific standards.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['policy-document', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'lean-six-sigma',
    label: 'Lean Six Sigma Analysis',
    shortLabel: 'Lean Six Sigma',
    icon: 'BarChart3',
    description: 'Apply Lean Six Sigma methodology using DMAIC framework: waste identification, statistical process control, root cause analysis, and solution design.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'operational-audit',
    label: 'Operational Audit',
    shortLabel: 'Operational Audit',
    icon: 'ClipboardCheck',
    description: 'Plan and execute operational audits across manufacturing and business operations with risk-rated findings and corrective action recommendations.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── Public Sector & Government ───────────────────────────────
  {
    id: 'policy-analysis',
    label: 'Policy Analysis',
    shortLabel: 'Policy Analysis',
    icon: 'FileSearch',
    description: 'Analyse public policy proposals, legislative drafts, and regulatory frameworks. Assess policy coherence, stakeholder impact, and implementation feasibility.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
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
    description: 'Review public procurement processes, tender documents, and bid evaluations for compliance with public procurement directives and value for money.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'gap-scoring-matrix'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'regulatory-impact',
    label: 'Regulatory Impact Assessment',
    shortLabel: 'RIA',
    icon: 'BarChart3',
    description: 'Conduct regulatory impact assessments for proposed legislation analysing costs, benefits, proportionality, and alternatives.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['impact-assessment', 'detailed-findings'],
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

  // ── Humanitarian & NGO Programme Design (LONE-11) ────────────
  {
    id: 'log-frame-generator',
    label: 'Log Frame Generator',
    shortLabel: 'Log Frame',
    icon: 'LayoutGrid',
    description: 'Generate a complete Logical Framework Analysis (LFA / Log Frame Matrix) with Goal, Purpose, Outputs, Activities, verifiable indicators, means of verification, and key assumptions for a development or humanitarian programme.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['gap-scoring-matrix', 'action-plan'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Logical Framework Analysis, results-based management, OECD DAC evaluation criteria' },
      },
    },
  },
  {
    id: 'theory-of-change',
    label: 'Theory of Change Builder',
    shortLabel: 'Theory of Change',
    icon: 'GitBranch',
    description: 'Build a rigorous Theory of Change (ToC) narrative mapping inputs → activities → outputs → outcomes → impact, with causal assumptions, evidence base, and pathway validation for NGO programmes.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'executive-summary'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Theory of Change methodology, impact evaluation, programme design' },
      },
    },
  },
  {
    id: 'monitoring-evaluation-framework',
    label: 'M&E Framework Designer',
    shortLabel: 'M&E Framework',
    icon: 'BarChart2',
    description: 'Design a Monitoring & Evaluation framework: results framework, indicator selection (process/output/outcome/impact), data collection methods, baseline design, and reporting schedule.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['project-plan', 'action-plan'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'OECD DAC evaluation criteria, SMART indicators, results-based management' },
      },
    },
  },
  {
    id: 'donor-reporting',
    label: 'Donor Report Writer',
    shortLabel: 'Donor Reports',
    icon: 'FileText',
    description: 'Draft narrative donor reports and impact updates: progress vs targets, activities delivered, outcomes achieved, lessons learned, and financial narrative.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'executive-summary'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: false },
      },
    },
  },

  // ── Consumer Legal ───────────────────────────────────────────
  {
    id: 'tenancy-disputes',
    label: 'Tenancy & Housing Disputes',
    shortLabel: 'Tenancy',
    icon: 'Building',
    description: 'Analyse tenancy agreements, identify rights and obligations, structure arguments for housing disputes, and draft communications to landlords or tribunals.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
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
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
      },
    },
  },
  {
    id: 'consumer-protection',
    label: 'Consumer Protection',
    shortLabel: 'Consumer Protection',
    icon: 'Shield',
    description: 'Analyse consumer rights issues including defective goods, unfair contract terms, misleading advertising, and consumer credit disputes.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
      },
    },
  },
  {
    id: 'personal-contracts',
    label: 'Personal Contract Review',
    shortLabel: 'Contract Review',
    icon: 'FileSearch',
    description: 'Review personal contracts including service agreements, subscription terms, insurance policies, and membership agreements to identify risks and unfair terms.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
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
    description: 'Structure and prepare small claims cases, draft claim forms and statements, assess claim strength, and provide guidance on procedures and evidence.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
      },
    },
  },

  // ── Education & Teaching ─────────────────────────────────────
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
      outputFormats: ['action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'curriculum-design',
    label: 'Curriculum Design',
    shortLabel: 'Curriculum',
    icon: 'Layers',
    description: 'Design complete curricula, course outlines, and learning pathways. Map learning outcomes, sequence content, and ensure alignment with educational standards.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['project-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'assessment-builder',
    label: 'Assessment & Quiz Builder',
    shortLabel: 'Assessments',
    icon: 'CheckSquare',
    description: 'Create assessments, quizzes, exams, and rubrics at specified difficulty levels with marking schemes and formative/summative assessments.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['training-material'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'student-feedback',
    label: 'Student Feedback & Reports',
    shortLabel: 'Feedback',
    icon: 'MessageSquare',
    description: 'Generate constructive student feedback, progress reports, and parent communications with balanced, developmental feedback that guides improvement.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['quick-briefing'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
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
      },
    },
  },

  // ── Branding & Creative ─────────────────────────────────────
  { id: 'brand-strategy', label: 'Brand Strategy Workshop', shortLabel: 'Brand Strategy', icon: 'Target', description: 'Define brand positioning, values, personality, and messaging architecture through structured strategic analysis.', color: 'adv-red', defaults: { thinking: 'think_hard', creativity: 'creative', outputFormats: ['decision-memo', 'stakeholder-presentation'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
  { id: 'content-strategy', label: 'Content Strategy Builder', shortLabel: 'Content Strategy', icon: 'Layers', description: 'Develop comprehensive content strategies with channel mix, editorial calendars, and audience journey mapping.', color: 'adv-red', defaults: { thinking: 'think_hard', creativity: 'balanced', outputFormats: ['project-plan'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
  { id: 'copywriting', label: 'Copywriting Assistant', shortLabel: 'Copywriting', icon: 'FileText', description: 'Create compelling copy for websites, ads, emails, and marketing materials that converts and resonates with target audiences.', color: 'adv-red', defaults: { thinking: 'think', creativity: 'creative', outputFormats: ['quick-briefing'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
  { id: 'visual-identity', label: 'Visual Identity Guidelines', shortLabel: 'Visual Identity', icon: 'Layout', description: 'Develop brand visual identity guidelines covering logo usage, colour palette, typography, and brand application rules.', color: 'adv-red', defaults: { thinking: 'think_hard', creativity: 'balanced', outputFormats: ['policy-document'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
  { id: 'campaign-design', label: 'Campaign Design Planner', shortLabel: 'Campaign Design', icon: 'Send', description: 'Plan integrated marketing campaigns with objectives, target segments, channel strategy, and measurement framework.', color: 'adv-red', defaults: { thinking: 'think_hard', creativity: 'creative', outputFormats: ['project-plan'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },

  // ── Creative & Entertainment Production ─────────────────────
  { id: 'script-development', label: 'Script & Screenplay Development', shortLabel: 'Script Dev', icon: 'Film', description: 'Develop screenplays, stage plays, teleplays, and game narratives with proper craft structure — beat sheets, character arcs, genre conventions, and professional formatting.', color: 'adv-teal', defaults: { thinking: 'think_hard', creativity: 'balanced', outputFormats: ['screenplay'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Screenwriting craft, dramatic structure, genre conventions' } } } },
  { id: 'literary-translation', label: 'Literary & Dramatic Translation', shortLabel: 'Translation', icon: 'Languages', description: 'Translate creative works with cultural adaptation, register matching, and idiomatic equivalence — novels, plays, screenplays, song lyrics, and game dialogue.', color: 'adv-blue', defaults: { thinking: 'think_hard', creativity: 'balanced', outputFormats: ['detailed-findings'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Literary translation theory, cultural adaptation, register matching' } } } },
  { id: 'world-building', label: 'World-Building & Setting Engine', shortLabel: 'World-Building', icon: 'Globe', description: 'Create and maintain consistent fictional universes — geography, history, culture, politics, magic/technology systems, and timelines — with built-in consistency checking.', color: 'adv-teal', defaults: { thinking: 'investigate', creativity: 'creative', outputFormats: ['detailed-findings'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'World-building methodology, fantasy and sci-fi conventions, cultural anthropology' } } } },
  { id: 'editorial-review', label: 'Editorial & Proofreading Suite', shortLabel: 'Editorial', icon: 'PenLine', description: 'Professional multi-pass editorial review — developmental editing, line editing, copy editing, proofreading, and sensitivity reading.', color: 'adv-teal', defaults: { thinking: 'think_hard', creativity: 'strict', outputFormats: ['detailed-findings'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Editorial standards, publishing conventions, style guides' } } } },
  { id: 'audience-testing', label: 'Audience & Focus Group Simulator', shortLabel: 'Audience Test', icon: 'Users', description: 'Simulate structured audience reactions to creative content by testing against configurable reader/viewer personas — emotional impact, engagement, and marketability.', color: 'adv-blue', defaults: { thinking: 'think_hard', creativity: 'balanced', outputFormats: ['detailed-findings', 'gap-scoring-matrix'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Audience psychology, reader response theory, market demographics' } } } },
  { id: 'story-collaboration', label: 'Story Collaboration & Continuity', shortLabel: 'Continuity', icon: 'GitBranch', description: 'Manage multi-author storylines, character handoffs, continuity tracking, and narrative coordination for TV writers\' rooms, novel series, and shared universes.', color: 'adv-gold', defaults: { thinking: 'think', creativity: 'balanced', outputFormats: ['detailed-findings'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Series bible methodology, continuity management, character arc tracking' } } } },
  { id: 'pre-publication', label: 'Pre-Publication Readiness Check', shortLabel: 'Pre-Publication', icon: 'Send', description: 'Assess manuscript or script readiness for submission — simulates the evaluation an agent, script reader, or publisher would perform.', color: 'adv-green', defaults: { thinking: 'investigate', creativity: 'strict', outputFormats: ['detailed-findings', 'gap-scoring-matrix'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Literary agency submission standards, publisher guidelines, festival criteria, market categories' } } } },
  { id: 'market-reach', label: 'Market Reach & Audience Analysis', shortLabel: 'Market Reach', icon: 'TrendingUp', description: 'Analyse market potential, audience demographics, distribution strategy, and competitive landscape for creative works across publishing, film, theatre, and digital channels.', color: 'adv-gold', defaults: { thinking: 'think_hard', creativity: 'strict', outputFormats: ['detailed-findings', 'executive-summary'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Creative industry market data, publishing trends, film distribution, audience demographics' } } } },

  // ── Software Engineering ─────────────────────────────────────
  { id: 'code-review', label: 'Code Review Assistant', shortLabel: 'Code Review', icon: 'GitBranch', description: 'Conduct thorough code reviews identifying security vulnerabilities, performance issues, and best practice deviations.', color: 'adv-teal', defaults: { thinking: 'think_hard', creativity: 'strict', outputFormats: ['detailed-findings'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
  { id: 'architecture-review', label: 'Architecture Review', shortLabel: 'Architecture', icon: 'Network', description: 'Assess system architecture against quality attributes: scalability, resilience, security, and maintainability.', color: 'adv-teal', defaults: { thinking: 'investigate', creativity: 'balanced', outputFormats: ['detailed-findings', 'decision-memo'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
  { id: 'technical-spec', label: 'Technical Specification Writer', shortLabel: 'Tech Spec', icon: 'FileText', description: 'Write clear technical specifications, RFCs, ADRs, and design documents that align engineering teams.', color: 'adv-teal', defaults: { thinking: 'think_hard', creativity: 'balanced', outputFormats: ['policy-document'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
  { id: 'api-design', label: 'API Design Advisor', shortLabel: 'API Design', icon: 'Database', description: 'Design RESTful, GraphQL, or event-driven APIs with proper resource modelling and developer experience principles.', color: 'adv-teal', defaults: { thinking: 'think_hard', creativity: 'balanced', outputFormats: ['policy-document'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
  { id: 'tech-debt-assessment', label: 'Tech Debt Assessment', shortLabel: 'Tech Debt', icon: 'AlertTriangle', description: 'Identify, quantify, and prioritise technical debt with structured remediation roadmaps and effort estimates.', color: 'adv-teal', defaults: { thinking: 'investigate', creativity: 'balanced', outputFormats: ['gap-scoring-matrix', 'action-plan'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },

  // ── Sales & Business Development ─────────────────────────────
  { id: 'deal-review', label: 'Deal Review & Coaching', shortLabel: 'Deal Review', icon: 'Handshake', description: 'Analyse deal dynamics, identify risk factors, and develop strategies to advance and close opportunities.', color: 'adv-green', defaults: { thinking: 'think', creativity: 'balanced', outputFormats: ['decision-memo'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
  { id: 'pipeline-analysis', label: 'Pipeline Analysis', shortLabel: 'Pipeline', icon: 'BarChart3', description: 'Analyse sales pipeline health, forecast accuracy, stage conversion rates, and identify bottlenecks.', color: 'adv-green', defaults: { thinking: 'think_hard', creativity: 'balanced', outputFormats: ['executive-summary'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
  { id: 'pricing-strategy', label: 'Pricing Strategy', shortLabel: 'Pricing', icon: 'DollarSign', description: 'Develop pricing strategies based on value analysis, competitive positioning, and margin objectives.', color: 'adv-green', defaults: { thinking: 'think_hard', creativity: 'balanced', outputFormats: ['decision-memo'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
  { id: 'proposal-writing', label: 'Sales Proposal Writer', shortLabel: 'Sales Proposals', icon: 'FileText', description: 'Create compelling sales proposals that address customer pain points, demonstrate ROI, and drive decisions.', color: 'adv-green', defaults: { thinking: 'think_hard', creativity: 'balanced', outputFormats: ['client-proposal'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
  { id: 'win-loss-analysis', label: 'Win/Loss Analysis', shortLabel: 'Win/Loss', icon: 'TrendingUp', description: 'Conduct structured win/loss analysis to understand competitive patterns and actionable improvements.', color: 'adv-green', defaults: { thinking: 'think_hard', creativity: 'balanced', outputFormats: ['detailed-findings'], transparencyLevel: 1, knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } } },
];

// ── Area definitions (mirror of server/areas/*/area.json) ────
// Used to group modules in the sidebar and on the dashboard.
export const AREAS = [
  {
    id: 'fcp',
    label: 'Financial Crime Prevention',
    shortLabel: 'FCP',
    icon: 'Shield',
    color: 'adv-teal',
    moduleIds: [
      'gap-analysis', 'document-creation', 'sanctions-advisory', 'regulatory-monitor',
      'training-content', 'data-management', 'risk-assessment', 'investigation-support',
      'engagement-proposal', 'engagement-execution', 'management-presentation', 'model-validation',
      'regulatory-response-drafter', 'compliance-monitoring-design',
      // Operational modules (Batch 1):
      'alert-investigation', 'daily-screening-review', 'kyc-refresh-tracker',
      'sar-quality-check', 'mis-report-generator', 'regulatory-change-scanner',
      'training-needs-assessment',
      // Consultant modules (Batch 1):
      'amla-data-readiness', 'regulatory-exam-prep', 'tech-selection-support',
      // Surfaced server modules (June 2026, plan 1.5):
      'cash-intensive-business-risk', 'correspondent-banking-dd', 'de-risking-impact-assessment',
      'hawala-ivts-risk-assessment', 'informal-remittance-corridor-analysis', 'ivts-detection-investigation',
      'remittance-compliance-framework', 'tbml-assessment', 'trade-finance-due-diligence',
      // AI governance (2026-06-14 audit plan, Tier A):
      'ai-governance-in-financial-crime',
      // Beneficial-ownership orchestration (Tier B):
      'beneficial-ownership-orchestration',
      // Tier-C backlog (2026-06-14 audit plan):
      'correspondent-concentration-risk',
    ],
  },
  {
    id: 'legal',
    label: 'Legal & Regulatory',
    shortLabel: 'Legal',
    icon: 'Scale',
    color: 'adv-blue',
    moduleIds: [
      'regulatory-interpretation', 'contract-review', 'compliance-framework',
      'regulatory-change-impact', 'gdpr-privacy', 'legal-brief',
      'contract-negotiation', 'regulatory-sandbox',
      // Batch 1:
      'regulatory-horizon-scanning', 'contract-clause-checker', 'gdpr-dsar-handler',
      'regulatory-deadline-tracker', 'board-legal-summary', 'multi-jurisdiction-comparison',
      // FDI screening (Tier B):
      'fdi-screening-compliance',
      // Tier-C backlog (2026-06-14 audit plan):
      'amla-supervisory-cooperation',
    ],
  },
  {
    id: 'audit',
    label: 'Audit & Assurance',
    shortLabel: 'Audit',
    icon: 'ClipboardCheck',
    color: 'adv-gold',
    moduleIds: [
      'audit-planning', 'control-testing', 'finding-writer',
      'audit-report', 'sox-isae', 'regulatory-exam-prep',
      // Batch 1:
      'workpaper-reviewer', 'finding-followup-tracker', 'evidence-request-generator',
      'audit-committee-pack', 'issue-rating-calibrator', 'three-lines-assessment',
      'continuous-audit-design',
      // Model-risk audit (2026-06-14 audit plan, Tier A):
      'model-risk-audit-framework',
    ],
  },
  {
    id: 'consulting',
    label: 'Client Consulting',
    shortLabel: 'Consulting',
    icon: 'Briefcase',
    color: 'adv-green',
    moduleIds: [
      'proposal-generator', 'stakeholder-mapping', 'engagement-delivery',
      'client-presentation', 'change-management',
      // Surfaced server modules (June 2026, plan 1.5):
      'benchmarking-best-practice', 'change-management-strategy', 'client-workshop-facilitator',
      'expert-testimony-prep', 'value-assessment-benefits',
      // Tier-C backlog (2026-06-14 audit plan):
      'outcome-based-pricing-designer', 'esg-integration-in-delivery',
    ],
  },
  {
    id: 'banking',
    label: 'Banking & Finance',
    shortLabel: 'Banking',
    icon: 'Building2',
    color: 'adv-blue',
    moduleIds: [
      'credit-risk', 'payment-services', 'financial-statement',
      'regulatory-capital', 'product-compliance',
      // Batch 1:
      'product-approval-review', 'complaint-root-cause', 'regulatory-reporting-reconciliation',
      'psd3-gap-analysis', 'banking-license-support',
      // Banking horizon modules (Tier B):
      'liquidity-adequacy-assessment', 'open-finance-strategy',
      'fintech-credit-risk-assessment', 'payment-institution-licensing-roadmap',
      // Tier-C backlog (2026-06-14 audit plan):
      'correspondent-banking-risk',
    ],
  },
  {
    id: 'risk',
    label: 'Risk Management',
    shortLabel: 'Risk',
    icon: 'AlertTriangle',
    color: 'adv-red',
    moduleIds: [
      'enterprise-risk', 'risk-appetite', 'operational-risk',
      'scenario-analysis', 'third-party-risk',
      // AI/model risk (2026-06-14 audit plan, Tier A):
      'ai-model-risk-assessment',
      // Tier-C backlog (2026-06-14 audit plan):
      'amlr-readiness-risk-assessment', 'nis2-critical-asset-risk-framework',
    ],
  },
  // ── Wave 2 Areas ─────────────────────────────────────────
  {
    id: 'cyber',
    label: 'Cybersecurity & InfoSec',
    shortLabel: 'Cyber',
    icon: 'ShieldAlert',
    color: 'adv-teal',
    moduleIds: [
      'dora-compliance', 'security-assessment', 'incident-response',
      'ict-risk-management', 'third-party-cyber-risk',
      // Surfaced server modules (June 2026, plan 1.5):
      'cloud-security-review', 'incident-response-plan', 'nis2-compliance',
      'pen-test-scope', 'security-awareness-training', 'third-party-security',
      // Cross-framework orchestrator (2026-06-14 audit plan, Tier A):
      'dora-amla-nis2-integration',
    ],
  },
  {
    id: 'esg',
    label: 'Environment, Sustainability & ESG',
    shortLabel: 'ESG',
    icon: 'Leaf',
    color: 'adv-green',
    moduleIds: [
      'csrd-reporting', 'double-materiality', 'esg-strategy', 'climate-risk',
      // Batch 1:
      'carbon-footprint-calculator', 'csrd-data-collector', 'sustainability-report-drafter',
      'esg-rating-questionnaire', 'supply-chain-esg-screener', 'tcfd-gap-analysis',
    ],
  },
  {
    id: 'data-analytics',
    label: 'Data & Analytics',
    shortLabel: 'Data',
    icon: 'BarChart',
    color: 'adv-blue',
    moduleIds: [
      'data-quality', 'data-governance', 'analytics-design', 'data-strategy',
      // Tier-C backlog (2026-06-14 audit plan):
      'amlr-data-quality-governance',
    ],
  },
  {
    id: 'investment',
    label: 'Investment & Asset Management',
    shortLabel: 'Investment',
    icon: 'LineChart',
    color: 'adv-teal',
    moduleIds: [
      'investment-analysis', 'portfolio-review', 'fund-compliance', 'mifid-advisory',
      // Surfaced server modules (June 2026, plan 1.5):
      'alternative-investment-dd', 'esg-investment-screening', 'fund-due-diligence',
      'investor-reporting-factsheet', 'portfolio-risk-analytics', 'regulatory-capital-assessment',
      // Tier-C backlog (2026-06-14 audit plan):
      'venture-capital-fund-analytics', 'secondary-market-assessment',
      'csrd-data-impact-assessment',
    ],
  },
  {
    id: 'project-mgmt',
    label: 'Project Management',
    shortLabel: 'Projects',
    icon: 'FolderKanban',
    color: 'adv-green',
    moduleIds: [
      'project-planning', 'status-reporting', 'risk-issue-tracker', 'resource-planning',
      // Batch 1 (D):
      'sprint-planning-assistant', 'retrospective-facilitator', 'raid-log-updater',
      'change-request-processor', 'programme-health-assessment', 'pmo-setup-framework',
      'resource-allocation-optimizer',
      // Batch 1 (E):
      'sop-writer', 'kpi-dashboard-updater', 'incident-report-processor',
      'sla-monitor', 'capacity-planning',
      // Tier-C backlog (2026-06-14 audit plan):
      'regulatory-programme-risk-taxonomy', 'agile-regulatory-delivery-pattern',
    ],
  },
  {
    id: 'strategy',
    label: 'Strategy & Business Development',
    shortLabel: 'Strategy',
    icon: 'TrendingUp',
    color: 'adv-gold',
    moduleIds: [
      'business-case', 'strategic-analysis', 'market-entry', 'competitive-analysis',
      // Batch 1 (E):
      'competitive-intelligence', 'board-meeting-prep', 'okr-progress-tracker',
      'partnership-evaluation', 'market-entry-briefing',
      // Tier-C backlog (2026-06-14 audit plan):
      'digital-transformation-business-case', 'innovation-pipeline-assessment',
    ],
  },
  // ── Wave 3 Areas ─────────────────────────────────────────
  {
    id: 'startups',
    label: 'Startups & Entrepreneurship',
    shortLabel: 'Startups',
    icon: 'Rocket',
    color: 'adv-gold',
    moduleIds: [
      'business-plan', 'pitch-deck', 'funding-strategy', 'mvp-scoping', 'cofounder-agreements',
      // Tier-C backlog (2026-06-14 audit plan):
      'series-b-plus-scaling-plan', 'venture-debt-navigator',
      'regulatory-risk-startup-assessment',
    ],
  },
  {
    id: 'personal-dev',
    label: 'Personal Development & Career',
    shortLabel: 'Career',
    icon: 'TrendingUp',
    color: 'adv-teal',
    moduleIds: [
      'cv-writer', 'interview-prep', 'salary-negotiation', 'career-planning', 'personal-brand',
    ],
  },
  {
    id: 'academic',
    label: 'Academic Research',
    shortLabel: 'Academic',
    icon: 'GraduationCap',
    color: 'adv-blue',
    moduleIds: [
      'literature-review', 'research-methodology', 'thesis-writing', 'citation-management', 'research-proposal',
    ],
  },
  {
    id: 'comms-pr',
    label: 'Communication & PR',
    shortLabel: 'Comms & PR',
    icon: 'Megaphone',
    color: 'adv-green',
    moduleIds: [
      'press-release', 'crisis-comms', 'internal-comms', 'stakeholder-messaging', 'media-briefing',
      // Batch 1 (D):
      'meeting-minutes-generator', 'town-hall-prep', 'change-comm-planner',
      'investor-update-letter', 'crisis-comms-response',
    ],
  },
  {
    id: 'hr',
    label: 'Human Resources & People',
    shortLabel: 'HR',
    icon: 'Users',
    color: 'adv-blue',
    moduleIds: [
      'job-description', 'interview-framework', 'performance-review', 'hr-policy', 'ld-planning',
      // Batch 1 (B):
      'cv-screener', 'interview-question-gen', 'performance-review-summarizer',
      'exit-interview-analyzer', 'job-posting-optimizer', 'onboarding-checklist-manager',
      'org-restructuring-advisor', 'compensation-benchmarking',
      // Talent Discovery & Recruitment:
      'talent-discovery', 'talent-ad-generator', 'talent-assessment', 'talent-aspiration',
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
      // Batch 1 (D):
      'receipt-processor', 'vat-return-preparer', 'month-end-checklist',
      'budget-variance-analyzer', 'ifrs-implementation-advisor', 'transfer-pricing-documentation',
      'financial-statement-drafter', 'expense-policy-checker',
      // Surfaced server modules (June 2026, plan 1.5):
      'aaoifi-compliance', 'internal-controls-sox', 'treasury-cash-management',
      // Accounting horizon modules (Tier B):
      'ifrs-18-transition-roadmap', 'pillar-two-minimum-tax-assessment',
      // Tier-C backlog (2026-06-14 audit plan):
      'esg-adjusted-financial-reporting', 'real-time-vat-compliance',
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
    id: 'creative-production',
    label: 'Creative & Entertainment Production',
    shortLabel: 'Creative',
    icon: 'Clapperboard',
    color: 'adv-teal',
    moduleIds: [
      'script-development', 'literary-translation', 'world-building', 'editorial-review',
      'audience-testing', 'story-collaboration', 'pre-publication', 'market-reach',
    ],
  },
  {
    id: 'software-eng',
    label: 'Software Engineering',
    shortLabel: 'Software Eng',
    icon: 'Code',
    color: 'adv-teal',
    moduleIds: [
      'code-review', 'architecture-review', 'technical-spec', 'api-design', 'tech-debt-assessment',
      // Batch 1 (C):
      'code-review-checklist', 'release-notes-generator', 'adr-writer',
      'api-documentation-generator', 'sprint-demo-prep', 'dependency-audit',
      'tech-debt-tracker', 'zero-trust-assessment',
    ],
  },
  {
    id: 'sales',
    label: 'Sales & Business Development',
    shortLabel: 'Sales',
    icon: 'Target',
    color: 'adv-green',
    moduleIds: [
      'deal-review', 'pipeline-analysis', 'pricing-strategy', 'proposal-writing', 'win-loss-analysis',
      // Batch 1 (C):
      'lead-qualification-scorer', 'proposal-generator', 'win-loss-report',
      'customer-health-score', 'renewal-risk-assessor', 'sales-call-prep',
      'competitive-win-loss-analyzer',
    ],
  },
  {
    id: 'insurance',
    label: 'Insurance & Actuarial',
    shortLabel: 'Insurance',
    icon: 'Shield',
    color: 'adv-blue',
    moduleIds: [
      'solvency-ii', 'claims-analysis', 'product-governance', 'idd-compliance', 'actuarial-comms',
      'solvency-ii-compliance', 'idd-distribution',
      // Surfaced server modules (June 2026, plan 1.5):
      'ifrs17-implementation', 'reinsurance-program-review', 'takaful-product-design', 'takaful-regulatory',
    ],
  },
  {
    id: 'real-estate',
    label: 'Real Estate & Property',
    shortLabel: 'Real Estate',
    icon: 'Building',
    color: 'adv-gold',
    moduleIds: [
      'property-due-diligence', 'lease-review', 'valuation-support', 'planning-analysis', 're-investment-analysis',
    ],
  },
  {
    id: 'personal-finance',
    label: 'Personal Finance',
    shortLabel: 'Personal Finance',
    icon: 'Wallet',
    color: 'adv-green',
    moduleIds: [
      'budget-planning', 'tax-optimisation', 'pension-planning', 'debt-management', 'savings-strategy',
    ],
  },
  {
    id: 'healthcare',
    label: 'Healthcare & Life Sciences',
    shortLabel: 'Healthcare',
    icon: 'Heart',
    color: 'adv-red',
    moduleIds: [
      'clinical-protocol', 'regulatory-pathway', 'patient-comms', 'healthcare-gdpr', 'research-ethics',
      'hospital-operations', 'medical-device-compliance', 'patient-safety-quality', 'pharma-market-access',
      'healthcare-regulatory-submission', 'clinical-documentation-assistant', 'medical-evidence-synthesiser',
      'practice-management-optimizer', 'patient-education-material-creator',
    ],
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing & Operations',
    shortLabel: 'Manufacturing',
    icon: 'Factory',
    color: 'adv-teal',
    moduleIds: [
      'process-improvement', 'supply-chain-risk', 'quality-management', 'lean-six-sigma', 'operational-audit',
    ],
  },
  {
    id: 'public-sector',
    label: 'Public Sector & Government',
    shortLabel: 'Public Sector',
    icon: 'Building2',
    color: 'adv-blue',
    moduleIds: [
      'policy-analysis', 'public-consultation', 'procurement-review', 'regulatory-impact', 'grant-writing',
    ],
  },
  {
    id: 'humanitarian',
    label: 'Humanitarian & NGO Programme Design',
    shortLabel: 'Humanitarian',
    icon: 'Globe',
    color: 'adv-green',
    moduleIds: [
      'log-frame-generator', 'theory-of-change', 'monitoring-evaluation-framework',
      'donor-reporting', 'grant-writing',
    ],
  },
  {
    id: 'consumer-legal',
    label: 'Consumer Legal',
    shortLabel: 'Consumer Legal',
    icon: 'Scale',
    color: 'adv-red',
    moduleIds: [
      'tenancy-disputes', 'employment-rights', 'consumer-protection', 'personal-contracts', 'small-claims',
      // Global-South consumer protection (Tier B coherence pair):
      'global-south-consumer-protection',
    ],
  },
  {
    id: 'education',
    label: 'Education & Teaching',
    shortLabel: 'Education',
    icon: 'BookOpen',
    color: 'adv-gold',
    moduleIds: [
      'lesson-planning', 'curriculum-design', 'assessment-builder', 'student-feedback', 'e-learning-design',
    ],
  },
  {
    id: 'coding',
    label: 'Coding',
    shortLabel: 'Coding',
    icon: 'Terminal',
    color: 'adv-teal',
    moduleIds: [
      'code-review-explain', 'script-lite', 'script-medium',
      'coding-large-discovery', 'coding-large-architecture',
      'coding-large-implementation', 'goal-alignment-check',
    ],
  },
  // ── Phase 4: Professional Deepening ──────────────────────────────
  {
    id: 'marketing',
    label: 'Marketing & Digital Marketing',
    shortLabel: 'Marketing',
    icon: 'Megaphone',
    color: 'adv-blue',
    moduleIds: [
      'marketing-strategy', 'digital-campaign-planner', 'seo-content-strategy',
      'social-media-strategy', 'market-research-competitive', 'email-marketing-automation',
      'marketing-analytics-roi', 'customer-journey-mapping',
    ],
  },
  {
    id: 'tax-transfer-pricing',
    label: 'Tax & Transfer Pricing',
    shortLabel: 'Tax',
    icon: 'Calculator',
    color: 'adv-gold',
    moduleIds: [
      'tax-compliance-health-check', 'transfer-pricing-documentation', 'vat-gst-compliance',
      'tax-risk-assessment', 'cross-border-transaction-advisor', 'tax-incentive-navigator',
      'tax-provision-reporting', 'tax-authority-audit-response',
    ],
  },
  {
    id: 'design',
    label: 'Design (UX/UI/Service)',
    shortLabel: 'Design',
    icon: 'Palette',
    color: 'adv-teal',
    moduleIds: [
      'ux-research-plan', 'information-architecture', 'design-system-foundation',
      'usability-audit', 'service-design-blueprint',
    ],
  },
  {
    id: 'journalism',
    label: 'Journalism & Content Writing',
    shortLabel: 'Journalism',
    icon: 'FileText',
    color: 'adv-green',
    moduleIds: [
      'article-structure-drafting', 'investigative-research', 'interview-preparation',
      'editorial-quality-review', 'content-strategy-planning',
    ],
  },
  {
    id: 'data-privacy',
    label: 'Data Privacy & Protection',
    shortLabel: 'Data Privacy',
    icon: 'Lock',
    color: 'adv-red',
    moduleIds: [
      'gdpr-compliance-assessment', 'dpia-builder', 'dsr-handler',
      'privacy-notice-drafter', 'cross-border-transfer-assessment', 'breach-response-plan',
      // AI Act profiling/bias (Tier B):
      'ai-act-profiling-bias-assessment',
      // Tier-C backlog (2026-06-14 audit plan):
      'nis2-dpia-integration', 'child-data-protection-by-design',
    ],
  },
  {
    id: 'product-management',
    label: 'Product Management',
    shortLabel: 'Product',
    icon: 'Layers',
    color: 'adv-blue',
    moduleIds: [
      'product-strategy-roadmap', 'prd-requirements', 'feature-prioritisation',
      'user-research-personas', 'go-to-market-planning', 'product-analytics-metrics',
    ],
  },
  // ── Phase 4: Islamic Finance & Global South ───────────────────────
  {
    id: 'islamic-finance',
    label: 'Islamic Finance & Banking',
    shortLabel: 'Islamic Finance',
    icon: 'Landmark',
    color: 'adv-gold',
    moduleIds: [
      'sharia-compliance-assessment', 'islamic-product-review', 'sukuk-structuring',
      'zakat-compliance', 'waqf-asset-management', 'sharia-board-governance',
      'profit-rate-benchmark-transition', 'islamic-treasury-liquidity',
      'green-sustainable-sukuk', 'islamic-window-assessment',
    ],
  },
  {
    id: 'mobile-money',
    label: 'Mobile Money & Digital Finance',
    shortLabel: 'Mobile Money',
    icon: 'Smartphone',
    color: 'adv-green',
    moduleIds: [
      'mobile-money-compliance-framework', 'mobile-money-aml', 'emi-licensing-guide',
      'digital-lending-compliance', 'cross-border-mobile-payments',
      'agent-banking-oversight', 'fintech-sandbox-application',
      // Tier-C backlog (2026-06-14 audit plan):
      'instant-payment-interoperability', 'digital-identity-regtech',
    ],
  },
  {
    id: 'microfinance',
    label: 'Microfinance & Financial Inclusion',
    shortLabel: 'Microfinance',
    icon: 'Heart',
    color: 'adv-teal',
    moduleIds: [
      'financial-inclusion-strategy', 'microfinance-credit-scoring', 'mfi-regulatory-compliance',
      'group-lending-risk', 'social-performance-reporting', 'islamic-microfinance',
      // Tier-C backlog (2026-06-14 audit plan):
      'climate-agri-finance-stress-test',
    ],
  },
  {
    id: 'government',
    label: 'Government & Public Administration',
    shortLabel: 'Government',
    icon: 'Landmark',
    color: 'adv-blue',
    moduleIds: [
      'policy-analysis-brief', 'regulatory-impact-assessment', 'public-consultation-response',
      'stakeholder-engagement-plan', 'digital-service-design', 'grant-application-writer',
    ],
  },
  // ── Phase 4: Bottom-of-Pyramid (BoP) ─────────────────────────────
  {
    id: 'government-services',
    label: 'Government Services Navigator',
    shortLabel: 'Gov Services',
    icon: 'Building2',
    color: 'adv-blue',
    moduleIds: [
      'document-id-application', 'government-subsidy-finder', 'permit-license-guide',
      'social-protection-navigator', 'voting-rights-process', 'complaint-against-official',
      'corruption-reporting-guide', 'court-process-demystifier',
    ],
  },
  {
    id: 'smallholder-farming',
    label: 'Smallholder Farming Expert',
    shortLabel: 'Farming',
    icon: 'Sprout',
    color: 'adv-green',
    moduleIds: [
      'crop-planning-advisor', 'soil-health-assessment', 'pest-disease-guide',
      'weather-farming-decisions', 'market-price-guide', 'subsidy-navigator',
      'water-irrigation-management', 'post-harvest-loss',
    ],
  },
  {
    id: 'micro-business',
    label: 'Micro-Business Expert',
    shortLabel: 'Micro-Business',
    icon: 'ShoppingBag',
    color: 'adv-gold',
    moduleIds: [
      'business-registration-guide', 'simple-bookkeeping', 'pricing-profit-calculator',
      'customer-relationship-basics', 'inventory-management', 'tax-compliance-simplified',
      'supplier-negotiation', 'business-growth-guide',
    ],
  },
  {
    id: 'workers-rights',
    label: "Workers' Rights Expert",
    shortLabel: "Workers' Rights",
    icon: 'HardHat',
    color: 'adv-red',
    moduleIds: [
      'employment-rights-checker', 'minimum-wage-calculator', 'workplace-safety-rights',
      'wrongful-dismissal', 'gig-economy-rights', 'union-collective-bargaining',
      'migrant-worker-rights', 'domestic-worker-rights',
    ],
  },
  {
    id: 'personal-finance-bop',
    label: 'Personal Finance & Savings Expert',
    shortLabel: 'Personal Finance',
    icon: 'PiggyBank',
    color: 'adv-teal',
    moduleIds: [
      'budget-builder', 'savings-goal-planner', 'mobile-money-safety',
      'remittance-cost-comparison', 'debt-trap-warning', 'micro-insurance-guide',
      'zakat-calculator', 'pension-retirement-basics',
    ],
  },
  {
    id: 'credit-navigator',
    label: 'Credit & Loan Navigator',
    shortLabel: 'Loans & Credit',
    icon: 'CreditCard',
    color: 'adv-gold',
    moduleIds: [
      'loan-comparison', 'microfinance-application', 'group-lending-guide',
      'credit-score-builder', 'collateral-explainer', 'predatory-lending-checker',
      'loan-default-rights', 'business-plan-for-loan',
      // Tier-C backlog (2026-06-14 audit plan):
      'gig-economy-wage-advance-detection',
    ],
  },
  {
    id: 'land-rights',
    label: 'Land & Property Rights Expert',
    shortLabel: 'Land Rights',
    icon: 'MapPin',
    color: 'adv-gold',
    moduleIds: [
      'land-title-verification', 'community-land-registration', 'boundary-dispute',
      'tenant-rights', 'inheritance-rights', 'government-land-scheme',
      'land-grab-eviction-response', 'womens-land-rights',
    ],
  },
  {
    id: 'consumer-rights',
    label: 'Consumer Protection Expert',
    shortLabel: 'Consumer Rights',
    icon: 'ShieldCheck',
    color: 'adv-teal',
    moduleIds: [
      'product-complaint', 'banking-rights', 'mobile-money-dispute',
      'consumer-court-guide', 'digital-privacy-rights', 'scam-fraud-warning',
      'utility-bill-dispute', 'government-service-complaint',
    ],
  },
  {
    id: 'community-health',
    label: 'Community Health Expert',
    shortLabel: 'Health',
    icon: 'Heart',
    color: 'adv-red',
    moduleIds: [
      'symptom-assessment', 'maternal-child-health', 'nutrition-feeding-guide',
      'disease-prevention-first-aid', 'vaccination-tracker', 'medicine-dosage-safety',
      'mental-health-referral', 'wash-advisor',
    ],
  },
  {
    id: 'education-literacy',
    label: 'Education & Literacy Expert',
    shortLabel: 'Education',
    icon: 'GraduationCap',
    color: 'adv-blue',
    moduleIds: [
      'adult-literacy-tutor', 'numeracy-maths-helper', 'homework-helper',
      'exam-preparation-guide', 'digital-literacy-basics', 'language-learning-helper',
      'scholarship-funding-finder', 'skills-training-navigator',
    ],
  },
  {
    id: 'food-business',
    label: 'Food & Restaurant Micro-Business Expert',
    shortLabel: 'Food Business',
    icon: 'ChefHat',
    color: 'adv-gold',
    moduleIds: [
      'food-safety-hygiene', 'menu-pricing-cost-control', 'food-licensing-permits',
      'food-preservation-storage', 'food-waste-portion-control', 'bulk-buying-supply-chain',
      'halal-kosher-dietary', 'catering-business-expansion',
    ],
  },
  {
    id: 'artisan-craft',
    label: 'Artisan & Craft Business Expert',
    shortLabel: 'Artisan & Craft',
    icon: 'Palette',
    color: 'adv-teal',
    moduleIds: [
      'product-costing-pricing', 'market-access-ecommerce', 'branding-storytelling',
      'quality-standards-export', 'packaging-shipping-basics', 'ip-traditional-crafts',
      'fair-trade-certification', 'cooperative-formation',
    ],
  },
  {
    id: 'livestock-poultry',
    label: 'Livestock & Poultry Expert',
    shortLabel: 'Livestock',
    icon: 'Bird',
    color: 'adv-green',
    moduleIds: [
      'animal-health-disease', 'feeding-nutrition-planner', 'poultry-business-starter',
      'veterinary-emergency-first-response', 'grazing-pasture-management',
      'breeding-herd-management', 'livestock-market-timing', 'dairy-production-optimizer',
    ],
  },
  {
    id: 'trades',
    label: 'Trades & Service Workers',
    shortLabel: 'Trades',
    icon: 'Wrench',
    color: 'adv-gold',
    moduleIds: [
      'invoice-generator', 'job-quote-builder', 'customer-comms',
      'tax-rot-rut-guide', 'material-order-list',
    ],
  },
  // ── Area 34: Private Equity & Venture Capital ─────────────────────────────
  {
    id: 'pe-vc',
    label: 'Private Equity & Venture Capital',
    shortLabel: 'PE/VC',
    icon: 'TrendingUp',
    color: 'adv-blue',
    moduleIds: [
      'deal-screening', 'market-intelligence', 'due-diligence',
      'financial-analysis', 'valuation-framework', 'ic-memo',
      'portfolio-monitoring', 'value-creation', 'exit-planning',
      'fund-reporting', 'deal-structure', 'team-assessment',
      // Tier-C backlog (2026-06-14 audit plan):
      'fintech-unit-economics-valuation',
    ],
  },
  // ── Area 35: Crypto & Blockchain Compliance ────────────────────────────────
  {
    id: 'blockchain',
    label: 'Crypto & Blockchain Compliance',
    shortLabel: 'Blockchain',
    icon: 'Blocks',
    color: 'adv-teal',
    moduleIds: [
      'mica-gap-analysis', 'casp-authorization', 'stablecoin-compliance',
      'crypto-aml-cft', 'blockchain-investigation', 'crypto-risk-assessment',
      'defi-regulatory',
      // Integrated CASP operating model (2026-06-14 audit plan, Tier A):
      'casp-mica-dora-amlr-programme',
      // Tier-C backlog (2026-06-14 audit plan):
      'emr-token-classification', 'innovation-sandbox-application',
      'defi-governance-operational-risk',
    ],
  },

  // ── Area 36: Payments & Operational Resilience ──────────────────────────────
  // FRAME-04: DORA modules | FRAME-06: PSD2/payment institution
  {
    id: 'payments-dora',
    label: 'Payments & Operational Resilience',
    shortLabel: 'Payments & DORA',
    icon: 'CreditCard',
    color: 'adv-blue',
    moduleIds: [
      'psd2-compliance',
      'dora-ict-risk', 'dora-incident-reporting', 'dora-third-party-risk',
    ],
  },

  // Area 37 (Insurance & Reinsurance Compliance) merged into 'insurance' area above

  // ── Pillar Areas (top-level navigation pillars with dedicated UIs) ──────────
  {
    id: 'procure',
    label: 'Procure',
    shortLabel: 'Procure',
    icon: 'ShoppingCart',
    color: 'adv-blue',
    moduleIds: [],
  },
  {
    id: 'civic',
    label: 'Civic',
    shortLabel: 'Civic',
    icon: 'Landmark',
    color: 'adv-green',
    moduleIds: [],
  },
  {
    id: 'grow',
    label: 'Grow',
    shortLabel: 'Grow',
    icon: 'TrendingUp',
    color: 'adv-teal',
    moduleIds: [],
  },
  // ── Tier 5 of Coding: Hardware Engineering (ESP32 launch) ───────────────
  {
    id: 'hardware-engineering',
    label: 'Hardware Engineering',
    shortLabel: 'Hardware',
    icon: 'Cpu',
    color: 'adv-teal',
    moduleIds: [
      'hw-classifier',
      'hw-diagnose-symptom-walkthrough',
      'hw-diagnose-photo-id',
      'hw-diagnose-runtime-trace',
      'hw-maintain-cve-applicability',
      'hw-maintain-patch-planner',
      'hw-develop-requirements',
      'hw-develop-architecture',
      'hw-develop-pin-mapper',
      'hw-humanitarian-deployment-planner',
    ],
  },
  // ── Portals (spec v0.2): user-created ANTON-only web spaces ────────────
  {
    id: 'portals',
    label: 'Portals',
    shortLabel: 'Portals',
    icon: 'Globe',
    color: 'adv-teal',
    moduleIds: [],
  },
] as const;

export const MODELS: ModelInfo[] = [
  // ── Anthropic ─────────────────────────────────────────────
  {
    id: 'claude-fable-5',
    label: 'Claude Fable 5',
    description: 'Most powerful Claude — a new tier above Opus. 1M context, 128k output. For the hardest reasoning and long-horizon agentic work. Note: ~2× Opus pricing. Adaptive thinking only. Knowledge cutoff Jan 2026.',
    inputCostPer1M: 10,
    outputCostPer1M: 50,
    maxOutput: 128000,
    provider: 'anthropic',
    contextWindow: 1000000,
    costTier: 3,
  },
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    description: 'Most capable. 1M context, 128k output. Best for complex reasoning, agentic coding, and high-stakes compliance work. Adaptive thinking (effort defaults to high). Knowledge cutoff Jan 2026.',
    inputCostPer1M: 5,
    outputCostPer1M: 25,
    maxOutput: 128000,
    recommended: true,
    provider: 'anthropic',
    contextWindow: 1000000,
    costTier: 3,
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    description: 'Previous Opus generation. 1M context, 128k output. Adaptive thinking only. Knowledge cutoff Jan 2026.',
    inputCostPer1M: 5,
    outputCostPer1M: 25,
    maxOutput: 128000,
    provider: 'anthropic',
    contextWindow: 1000000,
    costTier: 3,
  },
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    description: 'Earlier Opus generation. 1M context, 128k output. Supports both adaptive and extended thinking (budget_tokens). Knowledge cutoff May 2025.',
    inputCostPer1M: 5,
    outputCostPer1M: 25,
    maxOutput: 128000,
    provider: 'anthropic',
    contextWindow: 1000000,
    costTier: 3,
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    description: 'Latest Sonnet. 1M context, 64k output. Excellent balance of speed, capability, and cost. Recommended for most work.',
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    maxOutput: 64000,
    recommended: true,
    provider: 'anthropic',
    contextWindow: 1000000,
    costTier: 2,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    label: 'Claude Sonnet 4.5 (Legacy)',
    description: 'Previous Sonnet version. Kept for compatibility.',
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    maxOutput: 64000,
    provider: 'anthropic',
    contextWindow: 200000,
    costTier: 2,
    legacy: true,
    eolDate: '2026-09-01',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    description: 'Fastest and most affordable. 200k context. Suitable for simple queries, summaries, and quick lookups.',
    inputCostPer1M: 1,
    outputCostPer1M: 5,
    maxOutput: 8192,
    provider: 'anthropic',
    contextWindow: 200000,
    costTier: 1,
  },
  // ── OpenAI ────────────────────────────────────────────────
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'OpenAI latest flagship. Advanced reasoning, coding, and instruction following.',
    inputCostPer1M: 5,
    outputCostPer1M: 15,
    maxOutput: 32768,
    provider: 'openai',
    contextWindow: 256000,
    costTier: 3,
    supportsSeed: true,
    recommended: true,
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    description: 'OpenAI previous flagship. Strong general reasoning and instruction following.',
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
    maxOutput: 16384,
    provider: 'openai',
    contextWindow: 128000,
    costTier: 2,
    supportsSeed: true,
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    description: 'Fast and affordable OpenAI model for lighter tasks.',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    maxOutput: 16384,
    provider: 'openai',
    contextWindow: 128000,
    costTier: 1,
    supportsSeed: true,
  },
  // ── Google ────────────────────────────────────────────────
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Google ultra-fast model with 1M token context window.',
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    maxOutput: 8192,
    provider: 'google',
    contextWindow: 1000000,
    costTier: 1,
  },
  // ── Mistral (verified from docs.mistral.ai 2026-05-30) ───
  // `-latest` aliases resolve to the newest version server-side on Mistral's API.
  {
    id: 'mistral-large-latest',
    label: 'Mistral Large 3',
    description: '675B MoE (41B active). 256k context. Multimodal, function calling, structured output. Best Mistral model.',
    inputCostPer1M: 0.50,
    outputCostPer1M: 1.50,
    maxOutput: 128000,
    provider: 'mistral',
    contextWindow: 256000,
    costTier: 2,
    supportsSeed: true,
  },
  {
    id: 'mistral-medium-latest',
    label: 'Mistral Medium 3.5',
    description: 'Frontier-class multimodal, tuned for agentic + coding use. 128k context. Great balance of quality and cost.',
    inputCostPer1M: 0.40,
    outputCostPer1M: 2.00,
    maxOutput: 64000,
    provider: 'mistral',
    contextWindow: 128000,
    costTier: 2,
    supportsSeed: true,
  },
  {
    id: 'mistral-small-latest',
    label: 'Mistral Small 4',
    description: 'Hybrid instruct + reasoning + coding in one efficient open-weight model. 128k context. Good for simple tasks, drafts, and quick checks.',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.30,
    maxOutput: 8192,
    provider: 'mistral',
    contextWindow: 128000,
    costTier: 1,
    supportsSeed: true,
  },
  {
    id: 'magistral-medium-latest',
    label: 'Magistral Medium',
    description: 'Mistral reasoning model. Structured thinking output. Best for complex analysis and deep reasoning.',
    inputCostPer1M: 2.00,
    outputCostPer1M: 5.00,
    maxOutput: 64000,
    provider: 'mistral',
    contextWindow: 128000,
    costTier: 3,
    supportsSeed: true,
  },
  {
    id: 'magistral-small-latest',
    label: 'Magistral Small',
    description: 'Lightweight reasoning model. Structured thinking output at lower cost.',
    inputCostPer1M: 0.50,
    outputCostPer1M: 1.50,
    maxOutput: 16384,
    provider: 'mistral',
    contextWindow: 128000,
    costTier: 2,
    supportsSeed: true,
  },
  // ── Mistral code specialists ─────────────────────────────────
  {
    id: 'codestral-latest',
    label: 'Codestral',
    description: 'Premier code-completion specialist. FIM (fill-in-the-middle), short completions, multi-language. 256k context.',
    inputCostPer1M: 0.30,
    outputCostPer1M: 0.90,
    maxOutput: 8192,
    provider: 'mistral',
    contextWindow: 256000,
    costTier: 1,
    supportsSeed: true,
  },
  {
    id: 'devstral-medium-latest',
    label: 'Devstral 2 Medium',
    description: 'Frontier code-agents model for software-engineering tasks. The Mistral coding default. 128k context.',
    inputCostPer1M: 0.40,
    outputCostPer1M: 2.00,
    maxOutput: 32768,
    provider: 'mistral',
    contextWindow: 128000,
    costTier: 2,
    supportsSeed: true,
  },
  // ── Local Models (Ollama) ────────────────────────────────────
  {
    id: 'ollama:mistral:7b',
    label: 'Mistral 7B (Local)',
    description: 'Local Mistral 7B via Ollama. No API costs, runs on your machine. Requires Ollama installed.',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    maxOutput: 4096,
    provider: 'ollama',
    contextWindow: 32000,
    costTier: 0,
    requiresLocal: true,
  },
  {
    id: 'ollama:mistral:16b',
    label: 'Mistral 16B (Local)',
    description: 'Local Mistral 16B via Ollama. Higher quality than 7B, still runs locally.',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    maxOutput: 4096,
    provider: 'ollama',
    contextWindow: 32000,
    costTier: 0,
    requiresLocal: true,
  },
  {
    id: 'ollama:llama3.3:70b',
    label: 'Llama 3.3 70B (Local)',
    description: 'Meta Llama 3.3 70B via Ollama. Powerful open model, requires significant RAM.',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    maxOutput: 8192,
    provider: 'ollama',
    contextWindow: 128000,
    costTier: 0,
    requiresLocal: true,
  },
  {
    id: 'ollama:qwen2.5:32b',
    label: 'Qwen 2.5 32B (Local)',
    description: 'Alibaba Qwen 2.5 32B via Ollama. Excellent for multilingual and reasoning tasks.',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    maxOutput: 8192,
    provider: 'ollama',
    contextWindow: 128000,
    costTier: 0,
    requiresLocal: true,
  },
];

/**
 * Per-million input/output pricing for a model id, from the MODELS source of
 * truth — so frontend cost displays never drift from the model catalogue.
 * Falls back to Opus 4.8 pricing for an unknown id (matches prior behaviour).
 */
export function getModelPricing(modelId: string): { input: number; output: number } {
  const m = MODELS.find((x) => x.id === modelId);
  return m ? { input: m.inputCostPer1M, output: m.outputCostPer1M } : { input: 5, output: 25 };
}

export const THINKING_LEVELS = [
  { id: 'quick' as const, label: 'Quick', description: 'Fast response, minimal analysis', icon: 'Zap' },
  { id: 'think' as const, label: 'Think', description: 'Standard analysis depth', icon: 'Brain' },
  { id: 'think_hard' as const, label: 'Think Hard', description: 'Deep analysis with careful reasoning', icon: 'Microscope' },
  { id: 'investigate' as const, label: 'Investigate', description: 'Thorough investigation, maximum depth', icon: 'SearchCode' },
  { id: 'plan_first' as const, label: 'Plan First', description: 'Create explicit plan before executing', icon: 'ListChecks' },
];

export const CREATIVITY_LEVELS = [
  { id: 'strict' as const, label: 'Strict', description: 'Precise, factual, formal regulatory language' },
  { id: 'balanced' as const, label: 'Balanced', description: 'Accurate and accessible, professional but readable' },
  { id: 'creative' as const, label: 'Creative', description: 'Engaging with real-world examples, maintains accuracy' },
];

// ── EXPERT_ROLES moved ────────────────────────────────────────────────────────
// ExpertRole, PersonaCategory, and EXPERT_ROLES have been moved to
// src/lib/expert-roles.ts to avoid including 44 KB of prompt strings in the
// initial bundle. Import directly from '@/lib/expert-roles'.
// ─────────────────────────────────────────────────────────────────────────────


// ── Module default skills & knowledge categories ────────────────────────────

export const MODULE_DEFAULT_SKILLS: Record<string, string[]> = {
  'gap-analysis': ['fcp-compliance', 'regulatory-analysis'],
  'sanctions-advisory': ['sanctions-expert'],
  'document-creation': ['fcp-compliance', 'document-drafting'],
  'regulatory-monitor': ['regulatory-analysis'],
  'training-content': ['training-design'],
  'data-management': ['data-analysis'],
  'risk-assessment': ['risk-assessment', 'regulatory-analysis'],
  'investigation-support': ['investigation-support', 'fcp-compliance'],
};

export const MODULE_KNOWLEDGE_CATEGORIES: Record<string, string[]> = {
  'gap-analysis': ['regulation', 'case_law', 'client'],
  'sanctions-advisory': ['regulation', 'case_law'],
  'document-creation': ['regulation', 'client'],
  'regulatory-monitor': ['regulation'],
  'training-content': ['regulation', 'client'],
  'data-management': ['client'],
  'risk-assessment': ['regulation', 'client'],
  'investigation-support': ['case_law', 'client'],
};

// ── Patch module registry expansion ─────────────────────────────────────────
// Adds all 87 new modules from Batch 1 agents, deduplicating by ID
// (core modules take precedence if ID conflicts exist).
;(() => {
  const existingIds = new Set(MODULES.map(m => m.id));
  const patchModules: ModuleDefinition[] = [
    ...NEW_FCP_MODULES,
    ...NEW_LEGAL_MODULES,
    ...AUDIT_NEW_MODULES,
    ...HR_NEW_MODULES,
    ...BANKING_NEW_MODULES,
    ...ACCOUNTING_NEW_MODULES,
    ...PROJECT_MGMT_NEW_MODULES,
    ...COMMS_PR_NEW_MODULES,
    ...SOFTWARE_ENG_NEW_MODULES,
    ...SALES_NEW_MODULES,
    ...ESG_NEW_MODULES,
    ...STRATEGY_NEW_MODULES,
    ...OPERATIONS_NEW_MODULES,
    ...PHASE4_PROFESSIONAL_MODULES,
    ...PHASE4_GLOBAL_SOUTH_MODULES,
    ...PHASE4_BOP_MODULES,
    ...CODING_MODULES,
    ...PE_VC_MODULES,
    ...BLOCKCHAIN_MODULES,
    ...PAYMENTS_DORA_MODULES,
    ...INSURANCE_MODULES,
    ...TALENT_MODULES,
    ...HARDWARE_MODULES,
    ...SURFACED_FCP_MODULES,
    ...SURFACED_CYBER_MODULES,
    ...SURFACED_INVESTMENT_MODULES,
    ...SURFACED_CONSULTING_MODULES,
    ...SURFACED_INSURANCE_MODULES,
    ...SURFACED_ACCOUNTING_MODULES,
    ...TIER_A_MODULES,
    ...TIER_B_MODULES,
    ...TIER_C_MODULES,
  ];
  for (const m of patchModules) {
    if (!existingIds.has(m.id)) {
      MODULES.push(m);
      existingIds.add(m.id);
    }
  }
})();
