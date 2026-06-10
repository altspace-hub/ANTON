import type { ModuleDefinition } from '../types';

// ── Surfaced server modules — June 2026 (plan item 1.5) ─────────────────────
// 33 complete server modules (full module.json + domain prompt under
// server/areas/) that previously had no frontend registry entry and were
// therefore unreachable from any UI. Definitions below are lifted verbatim
// from each module's module.json so the frontend and server stay in sync.
// The dynamic ModulePage route renders them without further wiring.

// ── Financial Crime Prevention (9) ──────────────────────────────────────
export const SURFACED_FCP_MODULES: ModuleDefinition[] = [
  {
    id: 'cash-intensive-business-risk',
    label: 'Cash-Intensive Business Risk Assessment',
    shortLabel: 'Cash Business Risk',
    icon: 'Banknote',
    description: 'AML risk assessment for cash-intensive businesses (restaurants, retail, car washes, ATM operators, casinos). Covers revenue plausibility testing, structuring indicators, EDD requirements, and demarketing considerations.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'gap-scoring-matrix'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'FATF guidance on cash-intensive businesses, national FIU typologies on cash-based ML, industry revenue benchmarks',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'correspondent-banking-dd',
    label: 'Correspondent Banking Due Diligence',
    shortLabel: 'Correspondent DD',
    icon: 'Building2',
    description: 'Expert methodology for correspondent banking due diligence. Covers the Wolfsberg CBDD questionnaire, FATF R.13 requirements, key risk factors, information-sharing obligations, and responding to de-risking pressure.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'decision-memo'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'Wolfsberg Correspondent Banking Due Diligence questionnaire, FATF R.13 guidance, FSB de-risking reports, World Bank correspondent banking surveys',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'de-risking-impact-assessment',
    label: 'De-Risking Impact Assessment',
    shortLabel: 'De-Risking Impact',
    icon: 'TrendingDown',
    description: 'Assessment framework for correspondent banking de-risking impacts on financial inclusion and economic development. Covers FSB/World Bank data, humanitarian impacts, alternative channel analysis, FATF guidance on proportionate risk management, and regulatory responses.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['impact-assessment', 'executive-summary', 'action-plan'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'FSB de-risking reports, World Bank Remittance Prices Worldwide, FATF guidance on de-risking, IMF financial access data',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'hawala-ivts-risk-assessment',
    label: 'Hawala/IVTS Risk Assessment',
    shortLabel: 'Hawala Risk',
    icon: 'Network',
    description: 'Assess ML/TF risks associated with informal value transfer systems (hawala, fei-ch\'ien, hundi) operating in or connected to regulated financial institutions.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'gap-scoring-matrix', 'action-plan'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'informal-remittance-corridor-analysis',
    label: 'Informal Remittance Corridor Analysis',
    shortLabel: 'Corridor Analysis',
    icon: 'ArrowRightLeft',
    description: 'Analyse ML/TF risks in specific remittance corridors, covering formal versus informal channel dynamics, corridor-specific typologies, regulatory environments, and FATF mutual evaluation findings.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'risk-appetite-statement'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'FATF mutual evaluation reports, World Bank remittance data, corridor-specific ML/TF typologies',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'ivts-detection-investigation',
    label: 'IVTS Detection & Investigation Guide',
    shortLabel: 'IVTS Investigation',
    icon: 'Search',
    description: 'Structured investigation methodology for suspected hawala and informal value transfer system activity. Covers financial intelligence analysis, typology matching, settlement mechanism identification, and SAR/STR preparation.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'problem-solution'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'FATF IVTS guidance, APG hawala typologies, FinCEN SAR guidance, UNODC underground banking reports',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'remittance-compliance-framework',
    label: 'Remittance Compliance Framework',
    shortLabel: 'Remittance Compliance',
    icon: 'SendHorizonal',
    description: 'Design AML/CFT compliance frameworks for money service businesses and money transfer operators. Covers MSB registration requirements, tiered KYC, Travel Rule compliance, agent due diligence, and FATF R.14/R.16 obligations.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['policy-document', 'gap-scoring-matrix'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'FATF Recommendations 14 and 16, MSB licensing requirements by jurisdiction, Travel Rule implementation guidance',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'tbml-assessment',
    label: 'Trade-Based Money Laundering Assessment',
    shortLabel: 'TBML Assessment',
    icon: 'Ship',
    description: 'Conduct a FATF-methodology trade-based money laundering risk assessment covering over/under invoicing, phantom shipments, commodity price manipulation, free trade zone exploitation, and Black Market Peso Exchange mechanics.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'gap-scoring-matrix', 'action-plan'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'FATF TBML guidance 2006/2020, Egmont Group trade finance typologies, APG TBML reports, FinCEN TBML advisories',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'trade-finance-due-diligence',
    label: 'Trade Finance Due Diligence',
    shortLabel: 'Trade Finance DD',
    icon: 'FileSearch',
    description: 'Due diligence methodology for individual trade finance transactions. Covers customer and counterparty assessment, commodity and route risk, document verification, SWIFT message analysis, and red flag checklist.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'Wolfsberg Trade Finance Principles, FATF TBML guidance, ICC Banking Commission guidance on trade finance',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// ── Cybersecurity & InfoSec (6) ──────────────────────────────────────
export const SURFACED_CYBER_MODULES: ModuleDefinition[] = [
  {
    id: 'cloud-security-review',
    label: 'Cloud Security Architecture Review',
    shortLabel: 'Cloud Sec',
    icon: 'Cloud',
    description: 'Assess cloud security posture across AWS, Azure, or GCP against CIS Benchmarks, CSA STAR, and financial regulatory requirements including EBA cloud guidance, DORA, and GDPR. Produces prioritised findings with CIS control references.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'CIS Benchmarks for AWS/Azure/GCP, CSA Cloud Controls Matrix, EBA cloud outsourcing guidelines, DORA cloud provisions, GDPR cloud compliance, NIST CSF',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'incident-response-plan',
    label: 'Incident Response Plan Builder',
    shortLabel: 'IR Plan',
    icon: 'AlertTriangle',
    description: 'Create or update a comprehensive cyber incident response plan aligned to NIST SP 800-61, ISO/IEC 27035, DORA incident classification requirements, and GDPR Article 33/34 obligations for personal data breaches.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['policy-document', 'action-plan', 'project-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'NIST SP 800-61, ISO/IEC 27035, DORA RTS on ICT incident classification, GDPR Articles 33-34, ENISA incident reporting guidelines',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'nis2-compliance',
    label: 'NIS2 Compliance Assessment',
    shortLabel: 'NIS2',
    icon: 'Network',
    description: 'EU Network and Information Security Directive 2 compliance assessment. Evaluate security measures, incident reporting obligations, supply chain security, and supervisory exposure for essential and important entities.',
    color: 'adv-red',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'action-plan', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'NIS2 Directive EU 2022/2555, ENISA guidelines, national transposition laws, NIS2 implementing acts',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'pen-test-scope',
    label: 'Penetration Testing Scope & Plan',
    shortLabel: 'Pen Test',
    icon: 'Target',
    description: 'Design scope, methodology, rules of engagement, and success criteria for penetration tests. Produces a complete engagement plan aligned to OWASP, PTES, MITRE ATT&CK, and CREST standards.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['project-plan', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'OWASP Testing Guide, PTES, OSSTMM, MITRE ATT&CK, CREST standards, TIBER-EU/DORA TLPT framework',
        },
        localFolder: { enabled: false, folderPaths: [], recursive: false },
      },
    },
  },
  {
    id: 'security-awareness-training',
    label: 'Security Awareness Training Content',
    shortLabel: 'Awareness',
    icon: 'GraduationCap',
    description: 'Design security awareness programmes, phishing simulations, and training content aligned to NIS2 Article 20, DORA Article 13, and adult learning principles. Covers modern threats including BEC, vishing, and deepfake attacks.',
    color: 'adv-red',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['training-material', 'project-plan', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'NIS2 Article 20 training obligations, DORA Article 13, current threat landscape, phishing techniques, social engineering tactics',
        },
        localFolder: { enabled: false, folderPaths: [], recursive: false },
      },
    },
  },
  {
    id: 'third-party-security',
    label: 'Third-Party / Supply Chain Security Assessment',
    shortLabel: '3rd Party',
    icon: 'Link',
    description: 'Vendor security risk assessment framework aligned to DORA ICT third-party requirements, EBA ICT guidelines, and supply chain security best practices. Produces RAG-rated vendor assessment with contractual gap analysis.',
    color: 'adv-red',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'action-plan', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'DORA Articles 28-44, EBA Guidelines on ICT and Security Risk Management, ISO 27001/27036, SOC 2, TISAX, supply chain security frameworks',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// ── Investment & Asset Management (6) ──────────────────────────────────────
export const SURFACED_INVESTMENT_MODULES: ModuleDefinition[] = [
  {
    id: 'alternative-investment-dd',
    label: 'Alternative Investment Due Diligence',
    shortLabel: 'Alternatives DD',
    icon: 'Layers',
    description: 'Due diligence framework for private equity, venture capital, real assets, and private credit investments.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'decision-memo', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'ILPA Principles 3.0, INREV guidelines, IPEV valuation guidelines, AIFMD, private equity due diligence best practice',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'esg-investment-screening',
    label: 'ESG Investment Screening',
    shortLabel: 'ESG Screening',
    icon: 'Leaf',
    description: 'Screen and assess investments against ESG criteria, SFDR classifications, and sustainability regulations.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'SFDR, EU Taxonomy, TCFD, TNFD, ESMA guidelines on fund names, EU Green Bond Standard, ICMA principles',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'fund-due-diligence',
    label: 'Fund Due Diligence Report',
    shortLabel: 'Fund Due Diligence',
    icon: 'Search',
    description: 'Comprehensive evaluation of investment funds including strategy, performance, risk, operations, and team.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'decision-memo', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'AIMA due diligence questionnaires, ILPA principles, UCITS/AIFMD compliance, fund manager track records',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'investor-reporting-factsheet',
    label: 'Investor Reporting & Factsheet',
    shortLabel: 'Investor Reporting',
    icon: 'FileText',
    description: 'Create investor reports, fund factsheets, and regulatory disclosures for investment funds.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'quick-briefing'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'UCITS KIID, PRIIPs KID, AIFMD investor disclosure, MiFID II product governance, GIPS, SFDR PAI statements',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'portfolio-risk-analytics',
    label: 'Portfolio Risk Analytics',
    shortLabel: 'Risk Analytics',
    icon: 'BarChart2',
    description: 'Analyse portfolio risk metrics including VaR, stress testing, factor analysis, and regulatory capital.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'executive-summary', 'maturity-assessment'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'BCBS 239 risk data aggregation, ESMA stress testing guidelines, IOSCO principles, Basel risk frameworks',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'regulatory-capital-assessment',
    label: 'Regulatory Capital Assessment (Basel III/IV)',
    shortLabel: 'Capital Assessment',
    icon: 'Building2',
    description: 'Calculate and assess regulatory capital requirements under Basel III/IV, CRR2/CRR3 for banks and investment firms.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'executive-summary', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'Basel III/IV framework, CRR2/CRR3, IFR/IFD, EBA Q&As, ECB SREP methodology, FRTB, SA-CCR',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// ── Client Consulting (5) ──────────────────────────────────────
export const SURFACED_CONSULTING_MODULES: ModuleDefinition[] = [
  {
    id: 'benchmarking-best-practice',
    label: 'Benchmarking & Best Practice Study',
    shortLabel: 'Benchmarking',
    icon: 'BarChart',
    description: 'Conduct peer benchmarking analysis and best practice research to support client recommendations.',
    color: 'adv-green',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'executive-summary', 'regulatory-comparison'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'Industry surveys, regulatory findings, EBA convergence reports, BIS papers, public disclosures',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'change-management-strategy',
    label: 'Change Management Strategy',
    shortLabel: 'Change Strategy',
    icon: 'RefreshCw',
    description: 'Create change management plans for major client transformations — regulatory, digital, or structural.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['project-plan', 'action-plan', 'executive-summary', 'stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'client-workshop-facilitator',
    label: 'Client Workshop Facilitator',
    shortLabel: 'Workshop Design',
    icon: 'Users',
    description: 'Design and facilitate effective client workshops, strategy sessions, and working groups.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['project-plan', 'action-plan', 'stakeholder-presentation'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      },
    },
  },
  {
    id: 'expert-testimony-prep',
    label: 'Expert Testimony & Witness Preparation',
    shortLabel: 'Expert Testimony',
    icon: 'Scale',
    description: 'Prepare expert witness reports, regulatory submissions, and supporting materials for legal and regulatory proceedings.',
    color: 'adv-green',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'executive-summary', 'decision-memo'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'value-assessment-benefits',
    label: 'Value Assessment & Benefits Tracker',
    shortLabel: 'Value Assessment',
    icon: 'TrendingUp',
    description: 'Measure, quantify, and report the value delivered by consulting engagements and transformation programmes.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'detailed-findings', 'maturity-assessment'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// ── Insurance & Actuarial (4) ──────────────────────────────────────
export const SURFACED_INSURANCE_MODULES: ModuleDefinition[] = [
  {
    id: 'ifrs17-implementation',
    label: 'IFRS 17 Implementation Guide',
    shortLabel: 'IFRS 17',
    icon: 'BookOpen',
    description: 'Guidance on implementing IFRS 17 Insurance Contracts — measurement models (GMM, PAA, VFA), transition approaches, disclosure requirements, and impact on P&L and equity. Supports insurers at every stage from impact assessment through post-go-live refinement.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'gap-scoring-matrix', 'action-plan'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'reinsurance-program-review',
    label: 'Reinsurance Program Review',
    shortLabel: 'Reinsurance Review',
    icon: 'Network',
    description: 'Evaluate reinsurance program structures for adequacy, efficiency, and strategic alignment. Covers proportional and non-proportional treaty design, facultative placements, reinsurer credit quality, pricing adequacy, aggregate protection, IFRS 17 impact on reinsurance held, and retakaful for Islamic insurers.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'decision-memo'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Reinsurance program design, treaty and facultative structures, reinsurer rating methodologies, IFRS 17 reinsurance held requirements',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'takaful-product-design',
    label: 'Takaful Product Design',
    shortLabel: 'Takaful Products',
    icon: 'Heart',
    description: 'Design and evaluate Takaful insurance products in compliance with Sharia principles and applicable regulatory frameworks. Covers Takaful models (Wakala, Mudarabah, Hybrid, Waqf), participant fund mechanics, surplus distribution, and product structuring across Family, General, Medical, and Micro-Takaful segments.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'decision-memo'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'AAOIFI FAS 12, IFSB-8 Takaful standards, SAMA Cooperative Insurance regulations, BNM Takaful Operational Framework',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'takaful-regulatory',
    label: 'Takaful Regulatory Compliance',
    shortLabel: 'Takaful Compliance',
    icon: 'Shield',
    description: 'Assess regulatory compliance for Takaful operators against applicable prudential and Sharia governance standards. Covers IFSB-8 solvency requirements, AAOIFI governance standards, fund segregation, Sharia Supervisory Board requirements, and key jurisdictional frameworks including SAMA, BNM, and CBUAE.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'policy-document'],
      transparencyLevel: 1,
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'IFSB-8 Takaful governance standards, AAOIFI FAS 12 and governance standards, SAMA Cooperative Insurance Law, BNM Takaful Operational Framework',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];

// ── Accounting & Finance (3) ──────────────────────────────────────
export const SURFACED_ACCOUNTING_MODULES: ModuleDefinition[] = [
  {
    id: 'aaoifi-compliance',
    label: 'AAOIFI Standards Compliance',
    shortLabel: 'AAOIFI',
    icon: 'BookOpen',
    description: 'Assess compliance with AAOIFI Financial Accounting Standards (FAS), Sharia Standards (SS), and Governance Standards (GSIFI) for Islamic financial institutions. Covers Murabaha, Ijara, Sukuk accounting, Sharia board disclosure, governance maturity, and differences from IFRS.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'AAOIFI FAS series (FAS 28 Murabaha, FAS 32 Ijara, FAS 33 Sukuk), AAOIFI Sharia Standards, GSIFI governance standards, differences from IFRS',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'internal-controls-sox',
    label: 'Internal Controls Assessment (SOX / J-SOX)',
    shortLabel: 'Internal Controls',
    icon: 'CheckSquare',
    description: 'Assess internal controls over financial reporting (ICFR) against SOX Section 302/404, J-SOX, or COSO framework requirements. Covers entity-level controls, IT general controls, key financial statement controls, deficiency classification (control deficiency, significant deficiency, material weakness), and remediation planning.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'COSO 2013 integrated framework, SOX Section 302 and 404, PCAOB AS 2201, J-SOX requirements, IT general controls best practices',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'treasury-cash-management',
    label: 'Treasury & Cash Management',
    shortLabel: 'Treasury',
    icon: 'Wallet',
    description: 'Analyse and improve treasury and cash management frameworks for corporates, banks, and public sector entities. Covers cash pooling structures, FX hedging and IFRS 9 hedge accounting, interest rate risk management, liquidity policies, investment policy design, counterparty credit risk, and Sharia-compliant treasury instruments.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Corporate treasury management, IFRS 9 hedge accounting, LCR/NSFR bank liquidity standards, cash pooling structures, Sharia-compliant treasury instruments',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];
