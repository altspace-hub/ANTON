import type { ModuleDefinition } from '../types';

// ── Insurance & Reinsurance Compliance — Area 37 ────────────────────────────
// FRAME-07: Solvency II / IDD insurance compliance modules

export const INSURANCE_MODULES: ModuleDefinition[] = [
  {
    id: 'solvency-ii-compliance',
    label: 'Solvency II Compliance',
    shortLabel: 'Solvency II',
    icon: 'ShieldCheck',
    description: 'Three-pillar Solvency II assessment: Pillar I (SCR/MCR/own funds/technical provisions), Pillar II (governance, ORSA, key functions), Pillar III (QRTs, SFCR, RSR). Includes Solvency II Review 2025 horizon scanning and proportionality analysis.',
    color: 'adv-gold',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'executive-summary', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'Solvency II Directive 2009/138/EC, Delegated Regulation EU 2015/35, EIOPA guidelines, Solvency II Review 2025 Directive',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'idd-distribution',
    label: 'IDD Insurance Distribution',
    shortLabel: 'IDD',
    icon: 'Handshake',
    description: 'Insurance Distribution Directive (IDD) compliance for insurance intermediaries, ancillary intermediaries, and direct-writing undertakings. Covers registration, disclosures, demands & needs, POG, IBIPs suitability, conflicts of interest, and conduct of business.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'IDD Directive 2016/97, Delegated Regulation 2017/2359, EIOPA IDD guidelines, PRIIPs KID regulation, national NCA guidance',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];
