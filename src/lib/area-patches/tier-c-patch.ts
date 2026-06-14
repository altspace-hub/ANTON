// AUTO-GENERATED — Tier-C backlog modules from the 2026-06-14 module audit plan.
// Server configs (prompts + guided inputs) live in server/areas/<area>/modules/<id>/.

import type { ModuleDefinition } from '../types';

export const TIER_C_MODULES: ModuleDefinition[] = [
  {
    "id": "correspondent-concentration-risk",
    "label": "Correspondent & Nested Concentration Risk",
    "shortLabel": "Correspondent Concentration",
    "icon": "Network",
    "description": "Aggregate and assess concentration risk across correspondent-banking and nested relationships — by respondent, jurisdiction and downstream-clearing chain — under AMLR Art. 36 and the Wolfsberg CBDD framework. Weighs the de-risking-vs-concentration trade-off and runs single-point-of-failure analysis for MVTS and remittance corridors.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "risk-appetite-statement",
        "detailed-findings",
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
    "id": "amla-supervisory-cooperation",
    "label": "AMLA Supervisory Cooperation",
    "shortLabel": "AMLA Cooperation",
    "icon": "Network",
    "description": "Prepare an obliged entity to engage with the new AMLA supervisory architecture under Regulation (EU) 2024/1620: direct AMLA vs national supervision, selection criteria, Joint Supervisory Teams, supervisory colleges, joint analysis of cross-border SARs, the central AML/CFT database, and information-exchange and cooperation duties.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "detailed-findings",
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
    "id": "amlr-readiness-risk-assessment",
    "label": "AMLR Readiness Risk Assessment",
    "shortLabel": "AMLR Readiness",
    "icon": "ShieldAlert",
    "description": "A risk-based readiness assessment for AMLR (EU) 2024/1624 go-live (applicable 10 July 2027). Scores preparedness across CDD, beneficial ownership, transaction monitoring, governance, data and supervision-category, and produces a residual readiness-risk heatmap with a prioritised, time-boxed remediation runway.",
    "color": "adv-red",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "maturity-assessment",
        "data-readiness-scorecard",
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
    "id": "nis2-critical-asset-risk-framework",
    "label": "NIS2 Critical-Asset Risk Framework",
    "shortLabel": "NIS2 Asset Risk",
    "icon": "ShieldAlert",
    "description": "Classify essential vs important entity status, build a critical-asset inventory, assess the Art. 21 cybersecurity risk-management measures and supply-chain security, and evidence Art. 20 management-body accountability under the NIS2 Directive (EU) 2022/2555.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "gap-scoring-matrix",
        "risk-appetite-statement",
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
    "id": "amlr-data-quality-governance",
    "label": "AML/CFT Data-Quality Governance",
    "shortLabel": "AML Data Quality",
    "icon": "DatabaseZap",
    "description": "Field-level data-quality governance for AML/CFT programmes: beneficial-owner completeness, screening-list timeliness, CDD field accuracy, risk-tiered retention, and end-to-end data lineage for AMLA direct data requests. Applies ISO 8000 and BCBS 239 dimensions to AML data.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "data-readiness-scorecard",
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
    "id": "esg-adjusted-financial-reporting",
    "label": "ESG-Adjusted Financial Reporting",
    "shortLabel": "ESG Reporting",
    "icon": "Leaf",
    "description": "Connect sustainability data to the financial statements. Assess CSRD/ESRS double-materiality, ISSB IFRS S1/S2 disclosures, climate-related estimates in IAS 36 impairment and IAS 37 provisions, and the connectivity between the sustainability statement and the financials.",
    "color": "adv-green",
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
    "id": "real-time-vat-compliance",
    "label": "Real-Time VAT & E-Invoicing Readiness",
    "shortLabel": "Real-Time VAT",
    "icon": "ReceiptText",
    "description": "Assess readiness for continuous/real-time VAT reporting and structured e-invoicing. Covers the EU VAT in the Digital Age (ViDA) package (adopted 11 Mar 2025 as Directive (EU) 2025/516; reporting obligations apply from 2030), national digital reporting and e-invoicing mandates (Italy SdI, France, Poland KSeF, Spain SII/Verifactu), transaction-level VAT determination, and the data architecture and controls needed for near-real-time compliance.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "strict",
      "outputFormats": [
        "gap-scoring-matrix",
        "data-readiness-scorecard",
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
    "id": "regulatory-programme-risk-taxonomy",
    "label": "Regulatory Programme Risk Taxonomy & Register",
    "shortLabel": "Reg Programme Risk",
    "icon": "ShieldAlert",
    "description": "Build a structured risk taxonomy and RAID register for a large regulatory-change programme — interpretation, supervisory-deadline, dependency/sequencing, resourcing, scope-creep, and evidence/audit-trail risk — with programme-governance and escalation structures.",
    "color": "adv-gold",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "gap-scoring-matrix",
        "executive-summary",
        "raci-matrix"
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
    "id": "agile-regulatory-delivery-pattern",
    "label": "Agile Regulatory Delivery Pattern",
    "shortLabel": "Agile Reg Delivery",
    "icon": "GitBranch",
    "description": "Adapt agile delivery for fixed-deadline, fixed-scope regulatory programmes. Embed compliance gates inside sprints, write regulatory acceptance criteria, make evidence and audit trail a definition-of-done, and reconcile iterative delivery with immovable supervisory milestones (AMLR, DORA, MiCA, CSRD, EU AI Act).",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "project-plan",
        "action-plan",
        "raci-matrix"
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
    "id": "nis2-dpia-integration",
    "label": "NIS2 Security & GDPR DPIA Integration",
    "shortLabel": "NIS2 + DPIA",
    "icon": "ShieldCheck",
    "description": "Run a combined security-and-privacy assessment that maps NIS2 (EU) 2022/2555 Art. 21 risk-management measures onto the GDPR (EU) 2016/679 Art. 35 DPIA. Reuse one evidence base for incident handling, supply-chain, and access controls so a single integrated assessment satisfies both regimes without duplicate effort.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "gap-scoring-matrix",
        "privacy-impact-assessment",
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
    "id": "child-data-protection-by-design",
    "label": "Children's Data Protection by Design",
    "shortLabel": "Children's Data",
    "icon": "Baby",
    "description": "Assess and design protection for children's personal data in services likely to be accessed by children. Covers GDPR Art. 8 age of consent and parental authorisation, the UK Age Appropriate Design Code, EDPB and ICO guidance, and EU AI Act provisions on minors — producing a child-focused DPIA with an age-assurance / exclusion-risk balance.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "strict",
      "outputFormats": [
        "privacy-impact-assessment",
        "gap-scoring-matrix",
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
    "id": "venture-capital-fund-analytics",
    "label": "Venture Capital Fund Analytics",
    "shortLabel": "VC Fund Analytics",
    "icon": "TrendingUp",
    "description": "Fund-level VC analytics: portfolio construction and reserves/follow-on modelling, TVPI/DPI/RVPI and IRR, the J-curve, loss-ratio and power-law return concentration, and ILPA-aligned LP reporting.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "investment-memo",
        "executive-summary",
        "detailed-findings"
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
    "id": "secondary-market-assessment",
    "label": "Private-Market Secondaries Assessment",
    "shortLabel": "Secondaries",
    "icon": "Repeat",
    "description": "Assess private-market secondary transactions — LP-led portfolio sales and GP-led continuation vehicles. NAV-based pricing, discount/premium drivers, GP-led conflicts of interest, and due diligence on a secondary portfolio.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "balanced",
      "outputFormats": [
        "investment-memo",
        "detailed-findings",
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
    "id": "csrd-data-impact-assessment",
    "label": "CSRD Sustainability-Data Impact Assessment",
    "shortLabel": "CSRD Data Impact",
    "icon": "LineChart",
    "description": "Assess how CSRD (EU) 2022/2464 and ESRS-mandated sustainability data feed investment analysis — valuation and screening inputs, SFDR (EU) 2019/2088 Art. 8/9 alignment and PAI indicators, greenwashing risk, and data-availability gaps across the portfolio.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "data-readiness-scorecard",
        "detailed-findings",
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
    "id": "digital-transformation-business-case",
    "label": "Digital Transformation Business Case",
    "shortLabel": "DX Business Case",
    "icon": "TrendingUp",
    "description": "Build a rigorous, board-ready digital-transformation business case: value drivers, cost-to-serve, build-vs-buy, change-and-execution risk, TCO/ROI and benefits realisation, and the target operating model.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "investment-memo",
        "executive-summary",
        "budget-resource-estimate"
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
    "id": "innovation-pipeline-assessment",
    "label": "Innovation Pipeline Assessment",
    "shortLabel": "Innovation Pipeline",
    "icon": "FlaskConical",
    "description": "Assess an innovation pipeline and portfolio: stage-gate health, three-horizons balance, real-option value, kill-criteria discipline, resource allocation, and innovation-accounting metrics. Upload portfolio data and project briefs, get a structured, decision-ready assessment.",
    "color": "adv-gold",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "gap-scoring-matrix",
        "executive-summary",
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
    "id": "series-b-plus-scaling-plan",
    "label": "Series B+ Scaling Plan",
    "shortLabel": "Scaling Plan",
    "icon": "TrendingUp",
    "description": "Build a Series B+ scaling plan: unit economics at scale, organisational design, go-to-market motion evolution, international expansion, governance maturation, and the metrics that gate later rounds.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "decision-memo",
        "executive-summary",
        "investment-memo"
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
    "id": "venture-debt-navigator",
    "label": "Venture Debt Navigator",
    "shortLabel": "Venture Debt",
    "icon": "Landmark",
    "description": "Structure venture debt the right way: assess when it fits, model the dilution-vs-runway trade-off, size warrants and covenants, quantify MOIC impact, select lenders, and sequence the facility around the equity round.",
    "color": "adv-gold",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "decision-memo",
        "executive-summary",
        "investment-memo"
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
    "id": "regulatory-risk-startup-assessment",
    "label": "Regulatory Risk Assessment for Startups",
    "shortLabel": "Reg Risk (Startup)",
    "icon": "ShieldAlert",
    "description": "Pragmatic, stage-appropriate regulatory-risk assessment for founders: licensing perimeter, data and privacy, sector-specific rules (fintech, health, AI), the real cost of getting it wrong, and a risk-prioritised compliance roadmap proportionate to your stage and runway.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "executive-summary",
        "gap-scoring-matrix",
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
    "id": "correspondent-banking-risk",
    "label": "Correspondent Banking Risk",
    "shortLabel": "Corr. Banking",
    "icon": "Network",
    "description": "Bank-side correspondent banking risk management: respondent risk rating, the Wolfsberg CBDD questionnaire, nested / downstream-clearing risk, transaction monitoring of correspondent flows, and exit / de-risking governance against AMLR Art. 36–39 and FATF R.13.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
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
    "id": "emr-token-classification",
    "label": "MiCA Crypto-Asset Classification",
    "shortLabel": "Token Classification",
    "icon": "Coins",
    "description": "Classify a crypto-asset under MiCA (EU) 2023/1114 — e-money token (EMT), asset-referenced token (ART), other crypto-asset, or out-of-scope. Test against the significant-token thresholds, map the EMD2 interface for EMTs, and derive the issuer obligations that follow each class.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "decision-memo",
        "regulatory-comparison",
        "detailed-findings"
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
    "id": "innovation-sandbox-application",
    "label": "Innovation Sandbox & DLT Pilot Application",
    "shortLabel": "Sandbox Application",
    "icon": "FlaskConical",
    "description": "Prepare a regulatory-sandbox, innovation-hub, or DLT Pilot Regime application under Regulation (EU) 2022/858. Covers eligibility, application content, test parameters and limits, investor-protection and safeguarding terms, exit strategy, and structured regulator engagement.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "decision-memo",
        "action-plan",
        "regulatory-comparison"
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
    "id": "defi-governance-operational-risk",
    "label": "DeFi Governance & Operational Risk Assessment",
    "shortLabel": "DeFi Ops Risk",
    "icon": "ShieldAlert",
    "description": "Assess governance and operational risk in DeFi protocols: smart-contract and oracle risk, governance-token concentration, admin keys and upgradeability, MEV, the MiCA 'sufficiently decentralised' perimeter question, and an operational-resilience lens (DORA-style). Produces a scored risk register and remediation plan for builders, DAOs, investors, and regulated firms with DeFi exposure.",
    "color": "adv-red",
    "defaults": {
      "thinking": "investigate",
      "creativity": "balanced",
      "outputFormats": [
        "risk-appetite-statement",
        "gap-scoring-matrix",
        "detailed-findings"
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
    "id": "fintech-unit-economics-valuation",
    "label": "Fintech Unit Economics & Valuation",
    "shortLabel": "Fintech UE & Valuation",
    "icon": "TrendingUp",
    "description": "Build a defensible unit-economics and valuation picture for a fintech: contribution margin, CAC/LTV, cohort retention, take-rate, regulatory-capital drag, and the right multiple (revenue vs gross-profit) across lending, payments and SaaS-fintech models.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "balanced",
      "outputFormats": [
        "investment-memo",
        "detailed-findings",
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
    "id": "outcome-based-pricing-designer",
    "label": "Outcome-Based Pricing Designer",
    "shortLabel": "Outcome Pricing",
    "icon": "TrendingUp",
    "description": "Design outcome-based and value-based pricing for professional services. Define measurable outcomes and baselines, structure risk-sharing and gain-share mechanics, set guardrails, and decide when outcome pricing beats time-and-materials or fixed-fee.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "decision-memo",
        "detailed-findings",
        "risk-appetite-statement"
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
    "id": "esg-integration-in-delivery",
    "label": "ESG Integration in Delivery",
    "shortLabel": "ESG-by-Design",
    "icon": "Leaf",
    "description": "Embed ESG into consulting delivery: engagement-level materiality, ESG-by-design recommendations, measurable advice impact, and greenwashing-safe client deliverables — anchored to CSRD/ESRS, ISSB IFRS S1/S2, and SFDR.",
    "color": "adv-green",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "balanced",
      "outputFormats": [
        "impact-assessment",
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
    "id": "instant-payment-interoperability",
    "label": "Instant-Payment Interoperability",
    "shortLabel": "IPS Interop",
    "icon": "ArrowLeftRight",
    "description": "Assess domestic instant-payment systems and mobile-money interoperability in emerging markets — switch design, ISO 20022 messaging, settlement and risk, regional rails (PAPSS, regional RTGS), with the consumer-redress and AML/CFT overlay.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "strict",
      "outputFormats": [
        "gap-scoring-matrix",
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
    "id": "digital-identity-regtech",
    "label": "Digital Identity & eKYC for Inclusion",
    "shortLabel": "Digital ID RegTech",
    "icon": "Fingerprint",
    "description": "Design and assess digital-identity and eKYC RegTech for financial inclusion: national digital ID, tiered/risk-based KYC for the unbanked, GSMA mobile identity, and the privacy-vs-exclusion-vs-AML/CFT balance.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "investigate",
      "creativity": "balanced",
      "outputFormats": [
        "detailed-findings",
        "impact-assessment",
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
    "id": "climate-agri-finance-stress-test",
    "label": "Climate Agri-Finance Stress Test",
    "shortLabel": "Agri Climate Stress",
    "icon": "CloudRainWind",
    "description": "Climate stress-testing for agricultural and smallholder lending portfolios. Run drought, flood and yield-shock scenarios, project portfolio-at-risk under climate stress, model an index-insurance overlay, and adapt NGFS-style scenarios for agri-MFIs.",
    "color": "adv-green",
    "defaults": {
      "thinking": "investigate",
      "creativity": "balanced",
      "outputFormats": [
        "impact-assessment",
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
    "id": "gig-economy-wage-advance-detection",
    "label": "Gig & Wage-Advance Affordability Analyzer",
    "shortLabel": "EWA & Gig Credit",
    "icon": "Wallet",
    "description": "Assess affordability and over-reliance risk for variable-income gig workers and earned-wage-access (EWA) / wage-advance products. Detects income volatility, advance cycling, and designs responsible-lending controls for thin-file applicants.",
    "color": "adv-blue",
    "defaults": {
      "thinking": "think_hard",
      "creativity": "strict",
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
  }
];
