// AUTO-GENERATED — net-new Tier-B horizon modules from the 2026-06-14 module audit plan.
// Server configs (prompts + guided inputs) live in server/areas/<area>/modules/<id>/.

import type { ModuleDefinition } from '../types';

export const TIER_B_MODULES: ModuleDefinition[] = [
  {
    "id": "beneficial-ownership-orchestration",
    "label": "Beneficial Ownership Orchestration",
    "shortLabel": "BO Orchestration",
    "icon": "Network",
    "description": "Identify and verify beneficial owners across two regimes at once: AMLR (EU) 2024/1624 UBO obligations (25% ownership-or-control threshold, indirect/multi-tier chains, senior-managing-official fallback, nominees, trusts and legal arrangements, BO-register cross-checking post-CJEU C-37/20) and the EU FDI Screening Regulation (EU) 2019/452 controlling-ownership lens for sensitive sectors. Produces a dual-threshold cross-walk that shows who is a UBO for AML/CFT versus who is a controlling owner triggering FDI screening, and where the ownership-chain analysis is shared versus divergent.",
    "color": "adv-teal",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "detailed-findings",
        "regulatory-comparison",
        "gap-scoring-matrix"
      ],
      "knowledgeSources": {
        "claudeKnowledge": {
          "enabled": true,
          "webSearchEnabled": true,
          "description": ""
        },
        "localFolder": {
          "enabled": true,
          "folderPaths": [],
          "recursive": true
        }
      }
    }
  },
  {
    "id": "fdi-screening-compliance",
    "label": "FDI Screening Compliance",
    "shortLabel": "FDI Screening",
    "icon": "Landmark",
    "description": "Assess whether a transaction is notifiable under the EU FDI Screening Regulation (EU) 2019/452 and national screening mechanisms (Germany AWG/AWV, France IEF, Italy Golden Power, Nordic regimes). Covers notifiability triggers, the EU cooperation mechanism, standstill obligations, conditions/mitigation, and the financial-institution acquirer/target angle.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "strict",
      "outputFormats": [
        "decision-memo",
        "detailed-findings",
        "action-plan"
      ],
      "knowledgeSources": {
        "claudeKnowledge": {
          "enabled": true,
          "webSearchEnabled": true,
          "description": ""
        },
        "localFolder": {
          "enabled": true,
          "folderPaths": [],
          "recursive": true
        }
      }
    }
  },
  {
    "id": "liquidity-adequacy-assessment",
    "label": "ILAAP — Liquidity Adequacy Assessment",
    "shortLabel": "ILAAP",
    "icon": "Droplets",
    "description": "Build, review, or stress-test an Internal Liquidity Adequacy Assessment Process (ILAAP) against the EBA ICAAP/ILAAP Guidelines (EBA/GL/2016/10), SREP (EBA/GL/2022/03), and the CRR LCR + NSFR. Covers liquidity risk identification, counterbalancing capacity, the survival horizon, idiosyncratic/market-wide/combined stress, intraday liquidity, the contingency funding plan, funds-transfer pricing, and ILAAP document/governance architecture.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "detailed-findings",
        "gap-scoring-matrix",
        "executive-summary"
      ],
      "knowledgeSources": {
        "claudeKnowledge": {
          "enabled": true,
          "webSearchEnabled": true,
          "description": ""
        },
        "localFolder": {
          "enabled": true,
          "folderPaths": [],
          "recursive": true
        }
      }
    }
  },
  {
    "id": "open-finance-strategy",
    "label": "Open Finance Strategy & Governance",
    "shortLabel": "Open Finance Strategy",
    "icon": "Network",
    "description": "Strategy and governance for the move beyond open banking to open finance. Frames the 2023 EU package — PSD3, PSR and FIDA — as PROPOSALS not yet in force, against the in-force PSD2 (EU) 2015/2366. Covers consent-driven data sharing, the data-holder / data-user ecosystem, premium and contractual API schemes, perimeter and authorisation, customer-permission dashboards, liability and fraud-data sharing, and the strategic and product response (monetisation, partnerships, build-vs-buy).",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "decision-memo",
        "executive-summary",
        "impact-assessment"
      ],
      "knowledgeSources": {
        "claudeKnowledge": {
          "enabled": true,
          "webSearchEnabled": true,
          "description": ""
        },
        "localFolder": {
          "enabled": true,
          "folderPaths": [],
          "recursive": true
        }
      }
    }
  },
  {
    "id": "fintech-credit-risk-assessment",
    "label": "Fintech Credit-Risk Assessment",
    "shortLabel": "Fintech Credit Risk",
    "icon": "Calculator",
    "description": "Credit-risk assessment for fintech, alternative-data and embedded lending — cash-flow-based, behavioural and alt-data underwriting, thin-file / no-file populations, BNPL and embedded-finance exposures, alt-data model governance and fairness, and affordability under EBA/GL/2020/06 and CCD2 (EU) 2023/2225. The fintech variant of traditional credit risk.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "detailed-findings",
        "gap-scoring-matrix",
        "decision-memo"
      ],
      "knowledgeSources": {
        "claudeKnowledge": {
          "enabled": true,
          "webSearchEnabled": true,
          "description": ""
        },
        "localFolder": {
          "enabled": true,
          "folderPaths": [],
          "recursive": true
        }
      }
    }
  },
  {
    "id": "payment-institution-licensing-roadmap",
    "label": "PI / EMI Authorisation Roadmap",
    "shortLabel": "PI/EMI Licensing",
    "icon": "Landmark",
    "description": "Builds the authorisation roadmap for a Payment Institution or E-Money Institution under PSD2 (EU) 2015/2366 and EMD2 2009/110/EC — from gap assessment to a submission-ready application dossier. Covers the programme of operations, business plan, initial capital and own-funds methods A/B/C, safeguarding, governance and outsourcing, security/SCA and operational-and-security risk (DORA interface), PII for AISP/PISP, the NCA timeline, passporting, and wind-down planning.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "action-plan",
        "gap-scoring-matrix",
        "executive-summary"
      ],
      "knowledgeSources": {
        "claudeKnowledge": {
          "enabled": true,
          "webSearchEnabled": true,
          "description": ""
        },
        "localFolder": {
          "enabled": true,
          "folderPaths": [],
          "recursive": true
        }
      }
    }
  },
  {
    "id": "ifrs-18-transition-roadmap",
    "label": "IFRS 18 Transition Roadmap",
    "shortLabel": "IFRS 18 Roadmap",
    "icon": "FileText",
    "description": "Build a practical transition roadmap to IFRS 18 Presentation and Disclosure in Financial Statements (effective 1 Jan 2027, replacing IAS 1). Maps current P&L lines to the new operating / investing / financing categories, inventories and governs Management-Defined Performance Measures (MPMs), assesses systems and tagging impact, plans comparatives, and frames the earnings-quality / investor-communication story.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "action-plan",
        "gap-scoring-matrix",
        "executive-summary"
      ],
      "knowledgeSources": {
        "claudeKnowledge": {
          "enabled": true,
          "webSearchEnabled": true,
          "description": ""
        },
        "localFolder": {
          "enabled": true,
          "folderPaths": [],
          "recursive": true
        }
      }
    }
  },
  {
    "id": "pillar-two-minimum-tax-assessment",
    "label": "Pillar Two Minimum Tax Assessment",
    "shortLabel": "Pillar Two",
    "icon": "Calculator",
    "description": "Assess OECD/G20 Pillar Two GloBE 15% global minimum tax exposure under the EU Minimum Tax Directive (EU) 2022/2523. Determine in-scope MNE groups, compute the GloBE effective tax rate by jurisdiction, quantify top-up tax (IIR/UTPR/QDMTT), test transitional CbCR safe harbours, and produce a data-readiness gap list for the GloBE Information Return.",
    "color": "adv-gold",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "detailed-findings",
        "gap-scoring-matrix",
        "executive-summary"
      ],
      "knowledgeSources": {
        "claudeKnowledge": {
          "enabled": true,
          "webSearchEnabled": true,
          "description": ""
        },
        "localFolder": {
          "enabled": true,
          "folderPaths": [],
          "recursive": true
        }
      }
    }
  },
  {
    "id": "ai-act-profiling-bias-assessment",
    "label": "AI Act Profiling & Bias Assessment",
    "shortLabel": "Bias & FRIA",
    "icon": "Scale",
    "description": "Bias and fundamental-rights assessment for high-risk AI systems at the intersection of the EU AI Act (high-risk Annex III, Art. 27 FRIA, data-governance, human-oversight) and GDPR (Art. 22 automated decisions, Art. 9 special-category data, DPIA). Covers the high-risk classification decision, the FRIA/DPIA interface, protected-attribute and proxy bias testing, fairness metrics, human-oversight design, and explanation rights.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "detailed-findings",
        "gap-scoring-matrix",
        "executive-summary"
      ],
      "knowledgeSources": {
        "claudeKnowledge": {
          "enabled": true,
          "webSearchEnabled": true,
          "description": ""
        },
        "localFolder": {
          "enabled": true,
          "folderPaths": [],
          "recursive": true
        }
      }
    }
  },
  {
    "id": "global-south-consumer-protection",
    "label": "Global-South Consumer Financial Protection",
    "shortLabel": "Global-South CFP",
    "icon": "Scale",
    "description": "Assess consumer financial protection issues in Global-South markets — digital-lending abuse, mobile-money redress, pricing transparency, over-indebtedness, and data privacy — against representative national regimes (Kenya, Nigeria, Bangladesh, India) and the realities of thin-regulation, ADR, and informal-justice settings.",
    "color": "adv-gold",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "detailed-findings",
        "executive-summary",
        "action-plan"
      ],
      "knowledgeSources": {
        "claudeKnowledge": {
          "enabled": true,
          "webSearchEnabled": true,
          "description": ""
        },
        "localFolder": {
          "enabled": true,
          "folderPaths": [],
          "recursive": true
        }
      }
    }
  }
];
