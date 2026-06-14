// AUTO-GENERATED — net-new Tier-A modules from the 2026-06-14 module audit plan.
// Server configs (prompts + guided inputs) live in server/areas/<area>/modules/<id>/.

import type { ModuleDefinition } from '../types';

export const TIER_A_MODULES: ModuleDefinition[] = [
  {
    "id": "dora-amla-nis2-integration",
    "label": "DORA + AMLA + NIS2 Integration Orchestrator",
    "shortLabel": "Tri-Framework",
    "icon": "Network",
    "description": "Stitches DORA, AMLA/AMLR and NIS2 into ONE programme: a shared ICT/asset inventory, an overlap-vs-distinct obligations matrix, a reconciled incident-reporting timeline, unified third-party registers, and a single sequenced roadmap — not three parallel projects.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "regulatory-comparison",
        "gap-scoring-matrix",
        "action-plan",
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
    "id": "ai-model-risk-assessment",
    "label": "AI & Model Risk Assessment",
    "shortLabel": "Model Risk",
    "icon": "Bot",
    "description": "First-class AI and model-risk assessment for financial-crime and credit models: builds a model inventory, then assesses transaction-monitoring drift, sanctions-screening match calibration, credit-scoring fairness, and GenAI/synthetic-identity fraud models across the full model lifecycle. Grounded in the EU AI Act, EBA model-governance expectations, DORA ICT-risk, and the SR 11-7 / TRIM lineage.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "maturity-assessment",
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
    "id": "model-risk-audit-framework",
    "label": "Model Risk Audit Framework",
    "shortLabel": "Model Audit",
    "icon": "ClipboardCheck",
    "description": "Third-line internal-audit framework for auditing financial-crime and credit models — transaction monitoring, sanctions screening, credit scoring, synthetic-identity detection. Builds the model audit universe, risk-based scope, and test procedures across data lineage, tuning governance, validation independence, bias, explainability and DORA/EU AI Act evidence.",
    "color": "adv-gold",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "audit-report",
        "gap-scoring-matrix",
        "board-pack"
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
    "id": "ai-governance-in-financial-crime",
    "label": "AI Governance in Financial Crime",
    "shortLabel": "AI Governance",
    "icon": "Bot",
    "description": "Governance and control framework for AI/ML used in financial-crime systems (transaction monitoring, screening, fraud, KYC) at the intersection of the AMLR risk-based approach, DORA ICT governance, and EU AI Act Title III high-risk requirements.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "gap-scoring-matrix",
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
  },
  {
    "id": "casp-mica-dora-amlr-programme",
    "label": "CASP Integrated Compliance Operating Model (MiCA + DORA + AMLR/TFR)",
    "shortLabel": "CASP Operating Model",
    "icon": "Network",
    "description": "Treats MiCA, DORA and AMLR/TFR as ONE compliance programme for a Crypto-Asset Service Provider, not three. Maps where the frameworks overlap and where they diverge, designs a single operating model with shared controls, and hands off to the FCP gap-analysis and risk-assessment workflows for the AML/CFT legs.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "executive-summary",
        "regulatory-comparison",
        "raci-matrix",
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
