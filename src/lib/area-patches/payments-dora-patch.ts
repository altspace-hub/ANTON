import type { ModuleDefinition } from '../types';

// ── DORA & Payments Compliance — Area 36 ────────────────────────────────────
// FRAME-04: DORA modules (ICT risk, incident reporting, third-party risk)
// FRAME-06: PSD2/payment institution compliance module

export const PAYMENTS_DORA_MODULES: ModuleDefinition[] = [
  // ── DORA ────────────────────────────────────────────────────────────────────
  {
    id: 'dora-ict-risk',
    label: 'DORA ICT Risk Management',
    shortLabel: 'DORA ICT Risk',
    icon: 'ShieldCheck',
    description: 'Assess and improve ICT risk management frameworks under DORA Chapter II. Covers governance, ICT asset management, protection, detection, response, recovery, backup, and learning obligations for all financial entities in scope.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'executive-summary', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'DORA Regulation 2022/2554, ESA RTS/ITS on ICT risk management, NIS2 Directive, EBA ICT and security risk guidelines',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'dora-incident-reporting',
    label: 'DORA Incident Reporting',
    shortLabel: 'DORA Incidents',
    icon: 'AlertTriangle',
    description: 'Design and operationalise DORA Chapter III ICT incident management: classification, severity assessment, multi-stage NCA reporting timelines, post-incident review, and incident response playbooks.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['policy-document', 'action-plan', 'problem-solution'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'DORA Arts. 17–20, ESA joint RTS on incident classification, NIS2 incident reporting, GDPR Art.33 breach notification timelines',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'dora-third-party-risk',
    label: 'DORA Third-Party Risk',
    shortLabel: 'DORA TPRM',
    icon: 'Network',
    description: 'Assess ICT third-party risk management under DORA Chapter V: register of information, pre-contractual due diligence, Art.30 mandatory contract provisions, concentration risk, exit strategies, and CTPP oversight framework.',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'DORA Arts. 28–44, ESA ITS on register of information, ESA RTS on contractual provisions, EBA outsourcing guidelines, cloud risk guidance',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },

  // ── PSD2 / Payments ──────────────────────────────────────────────────────────
  {
    id: 'psd2-compliance',
    label: 'PSD2 / Payment Institution Compliance',
    shortLabel: 'PSD2',
    icon: 'CreditCard',
    description: 'Full PSD2 compliance assessment for payment institutions, EMIs, AISPs, and PISPs. Covers authorisation, safeguarding, SCA/open banking, information requirements, operational risk, and PSD3/PSR horizon scanning.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'executive-summary', 'regulatory-comparison'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'PSD2 Directive 2015/2366, SCA/CSC RTS EBA/RTS/2017/02, EBA PSD2 guidelines and Q&As, PSD3/PSR legislative package, national NCA guidance',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];
