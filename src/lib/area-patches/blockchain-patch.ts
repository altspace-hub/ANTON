import type { ModuleDefinition } from '../types';

export const BLOCKCHAIN_MODULES: ModuleDefinition[] = [
  // ── Crypto & Blockchain Compliance (Area 35) ──────────────────────────────

  {
    id: 'mica-gap-analysis',
    label: 'MiCA Gap Analysis',
    shortLabel: 'MiCA Gap',
    icon: 'SearchCheck',
    description: 'Comprehensive compliance gap assessment against EU MiCA (Regulation 2023/1114) for CASPs, EMT issuers, ART issuers, and utility token offerors. Produces RAG-rated gap matrix with remediation roadmap.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'executive-summary', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'MiCA Regulation 2023/1114, ESMA/EBA MiCA RTS and ITS, IOSCO crypto guidance' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'casp-authorization',
    label: 'CASP Authorization & Licensing',
    shortLabel: 'CASP Auth',
    icon: 'FileCheck',
    description: 'Structure and review CASP authorization applications under MiCA Title V. Covers governance, prudential capital, organisational requirements, custody safeguards, and whitepaper content obligations.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['policy-document', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'MiCA Title V authorization requirements, ESMA CASP guidelines, national NCA guidance' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'stablecoin-compliance',
    label: 'Stablecoin & Token Regulatory Framework',
    shortLabel: 'Stablecoin',
    icon: 'Coins',
    description: 'Classify and assess regulatory obligations for EMTs (e-money tokens), ARTs (asset-referenced tokens), and utility tokens under MiCA. Covers whitepaper obligations, reserve requirements, significant token thresholds, and redemption rights.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings', 'regulatory-comparison'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'MiCA Titles III and IV, EBA EMT/ART guidance, ECB stablecoin opinions, FSB crypto reports' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'crypto-aml-cft',
    label: 'Crypto AML/CFT & Travel Rule',
    shortLabel: 'Crypto AML',
    icon: 'ShieldAlert',
    description: 'AML/CFT compliance for CASPs and VASPs: EBA Guidelines on ML/TF risks in crypto, EU Transfer of Funds Regulation (TFR 2023/1113 — Travel Rule), FATF Recommendation 15 & VA Guidance, KYC/CDD for crypto clients, and sanctions screening.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'policy-document', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'EBA crypto AML guidelines, TFR 2023/1113, FATF R15 and VA guidance, FATF grey/black lists' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'blockchain-investigation',
    label: 'Blockchain Transaction Investigation',
    shortLabel: 'Blockchain Invest.',
    icon: 'Network',
    description: 'Structure and document blockchain transaction investigations. Interpret blockchain analytics outputs (Chainalysis, Elliptic, TRM), identify typologies (mixing, layering, DeFi abuse), map VASP exposure, and produce SAR-ready narratives and investigation reports.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['problem-solution', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Crypto ML/TF typologies, blockchain analytics interpretation, FATF VA typologies report, Egmont case studies' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'crypto-risk-assessment',
    label: 'Crypto & VASP Risk Assessment',
    shortLabel: 'Crypto Risk',
    icon: 'BarChart3',
    description: 'ML/TF risk assessment for CASPs and VASPs. Covers inherent risk scoring across crypto-specific dimensions (asset types, anonymity tools, DeFi exposure, NFTs, P2P, geographic risk), control effectiveness evaluation, and VASP due diligence.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['maturity-assessment', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'FATF VA guidance, EBA crypto ML/TF risk factors, ACAMS crypto risk frameworks, VASP due diligence standards' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'defi-regulatory',
    label: 'DeFi & Digital Assets Regulatory Advisor',
    shortLabel: 'DeFi Advisor',
    icon: 'Blocks',
    description: 'Regulatory analysis for decentralised finance, NFTs, DAOs, and novel digital asset structures. Assess regulatory perimeter questions, applicable obligations under MiCA, AMLR, MiFID II, and emerging IOSCO/FSB frameworks. Ideal for horizon scanning and new product regulatory assessment.',
    color: 'adv-teal',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'quick-briefing', 'impact-assessment'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'MiCA DeFi provisions, IOSCO DeFi report, FSB crypto reports, ECB/BIS digital asset papers, ESMA DeFi guidance' },
      },
    },
  },
];
