# PART 9: THE EXPERT AREAS

*Every module in ANTON exists because someone with real professional experience identified a specific task that follows established frameworks, requires domain knowledge, and produces output that professionals need. The 238 modules across 29 domains (expanding to 41+) represent codified professional expertise — not generic AI prompts, but structured methodologies that reflect how experienced practitioners actually approach their work.*

---

## §32. Expert Areas Overview (29 → 41+)

ANTON covers **29 professional domains** with **238 pre-configured modules** today, with architecture designed to expand to **41+ domains** through community contribution and ongoing development.

### The Full Landscape

| # | Area | Modules | Primary Users |
|---|------|---------|---------------|
| 1 | Financial Crime Prevention (FCP) | 23 | Banks, FIs, consultants |
| 2 | Legal & Regulatory | 12 | Legal counsel, compliance |
| 3 | Audit & Assurance | 12 | Internal/external auditors |
| 4 | Client Consulting | 5 | Consultants, advisors |
| 5 | Banking & Finance | 10 | Banks, FIs |
| 6 | Risk Management | 8 | CROs, risk managers |
| 7 | Data & Analytics | 8 | Data teams, analysts |
| 8 | ESG & Sustainability | 11 | ESG officers, sustainability teams |
| 9 | Cybersecurity | 5 | CISOs, IT security |
| 10 | Investment & Asset Management | 4 | Asset managers, investors |
| 11 | Project Management | 12 | PMs, delivery teams |
| 12 | Strategy & Planning | 6 | Executives, strategy teams |
| 13 | Operations & Process | 8 | Ops managers, process improvement |
| 14 | HR & People | 6 | HR teams, people managers |
| 15 | Software Engineering | 6 | Developers, tech leads |
| 16 | Accounting & Finance | 7 | Accountants, CFOs |
| 17 | Insurance & Actuarial | 5 | Insurers, actuaries |
| 18 | Communication & PR | 5 | Comms teams, PR professionals |
| 19 | Startups & Entrepreneurship | 7 | Founders, entrepreneurs |
| 20 | Academic Research | 6 | Researchers, academics |
| 21 | Personal Development | 6 | Individuals, career changers |
| 22 | Branding & Creative | 5 | Marketing, creative teams |
| 23 | Education & Teaching | 5 | Educators, instructors |
| 24 | Healthcare & Life Sciences | 5 | Healthcare professionals |
| 25 | Manufacturing & Operations | 5 | Manufacturers, ops teams |
| 26 | Consumer Legal | 5 | Individuals, legal aid |
| 27 | Procurement & Supply Chain | 5 | Procurement teams |
| 28 | Real Estate & Property | 4 | Property professionals |
| 29 | Nonprofit & Social Impact | 4 | Nonprofits, social enterprises |

**Total: 238 modules across 29 areas**

---

### Expansion Roadmap (to 41+ Areas)

ANTON's modular architecture is designed for growth. The following areas are planned or in development, with community contributors invited to accelerate their creation:

| Planned Area | Target Modules | Primary Users |
|---|---|---|
| Agriculture & Farming | 6 | Farmers, agribusiness |
| Tax Advisory | 8 | Tax professionals, accountants |
| Marketing & Sales | 7 | Marketing teams, sales ops |
| Translation & Localisation | 5 | Translators, localisation teams |
| Consumer Protection | 5 | Consumer advocates, regulators |
| Community & Association | 4 | Association managers, community leaders |
| Islamic Finance | 6 | Sharia-compliant FIs |
| Mobile Money & Digital Finance | 5 | Telcos, fintech |
| Government & Public Sector | 8 | Civil servants, policy makers |
| Architecture & Construction | 5 | Architects, project managers |
| Energy & Utilities | 5 | Energy companies, regulators |
| Media & Entertainment | 4 | Content creators, media companies |

The `.anton` package format and module contribution process (see §41) make it straightforward for domain experts anywhere in the world to create and share new modules. A compliance specialist in Singapore can create a module for MAS regulatory analysis, package it, and share it with the global community in minutes.

---

### Area Categories

**Core Professional Services (Areas 1-10):** Financial services focus (FCP, Banking, Investment), professional services (Legal, Audit, Consulting), and corporate functions (Risk, Data, ESG, Cybersecurity). These are the most deeply developed areas, reflecting ANTON's origins in regulated industries.

**Business Operations (Areas 11-18):** Project and program delivery, strategy and operations, people and culture, technology development, finance and accounting, and industry verticals (Insurance, Communications).

**Growth & Learning (Areas 19-21):** Entrepreneurship, academic research, and personal development — areas that demonstrate ANTON's value beyond enterprise contexts.

**Specialized Domains (Areas 22-29):** Creative industries, healthcare and life sciences, manufacturing, consumer services, procurement, and social impact.

---

### Module Structure (Consistent Across All Areas)

Every ANTON module follows the same structural pattern, ensuring consistency regardless of domain:

**Module Configuration** (`module.json`): Defines the module's identity (ID, label, description, icon, colour), defaults (thinking level, creativity mode, output formats, knowledge source configuration), and guided inputs (structured fields that help users provide the right context without needing to write prompts).

```json
{
  "id": "amlr-gap-analysis",
  "label": "AMLR Gap Analysis",
  "shortLabel": "AMLR Gap",
  "icon": "CheckSquare",
  "description": "Systematic comparison of current AML/CFT framework against EU AMLR 2024/1624 requirements",
  "defaults": {
    "thinking": "investigate",
    "creativity": "strict",
    "outputFormats": ["executive-summary", "gap-scoring-matrix", "action-plan"],
    "knowledgeSources": {
      "claudeKnowledge": {"enabled": true, "webSearchEnabled": true},
      "localFolder": {"enabled": false}
    }
  },
  "guidedInputs": [
    {"id": "entity_type", "label": "Entity Type", "type": "select", "options": ["Bank", "Payment Institution", "E-Money Institution", "Investment Firm", "Crypto Asset Service Provider"], "required": true},
    {"id": "jurisdiction", "label": "Primary Jurisdiction", "type": "select", "options": ["Sweden", "Finland", "Denmark", "Norway", "Iceland", "Other EU"], "required": true},
    {"id": "focus_areas", "label": "Focus Areas", "type": "multiselect", "options": ["Customer Due Diligence", "Transaction Monitoring", "Sanctions Screening", "SAR/STR Reporting", "Data Management", "Governance & Controls"], "required": false}
  ]
}
```

**System Prompt** (`system-prompt.md`): The heart of the module — a detailed task definition with objectives, step-by-step methodology, output structure template, quality criteria, and common pitfalls to avoid.

**Area Context** (shared across modules in the same area): Domain background, key regulations and frameworks, common methodologies, and the stakeholder landscape.

### Cross-Area Module Linking

Modules reference related modules in other areas, creating natural discovery paths. An AMLR Gap Analysis (Area 1: FCP) points users toward Regulatory Interpretation (Area 2: Legal), Audit Planning (Area 3: Audit), Data Readiness Assessment (Area 7: Data), and Implementation Project Plan (Area 11: Project Management) — enabling multi-area workflows that address complex professional challenges holistically.

---

## §33. Flagship Area: Financial Crime Prevention

Area 1 — Financial Crime Prevention — is ANTON's most comprehensive domain, with 23 modules covering the full AML/CFT lifecycle. This area reflects the platform's origins: 14+ years of banking and regulatory consulting experience at institutions including SEB, Sveriges Riksbank, EY, and Advisense, codified into expert AI modules.

### The 23 FCP Modules

**Core Compliance (5 modules):** AMLR Gap Analysis (systematic comparison against EU AMLR 2024/1624 with investigate-level thinking), Business-Wide Risk Assessment (ML/TF risk assessment with inherent-to-residual scoring), Sanctions Compliance Assessment (screening effectiveness and program maturity), KYC/CDD Framework Review (due diligence process assessment), and Transaction Monitoring Assessment (TM system effectiveness with scenario review and tuning recommendations).

**Document Creation (4 modules):** AML Policy Writer (board-ready policy documents), Procedure Builder (step-by-step operational procedures), Board Report Generator (quarterly/annual MLRO reports with KPIs and trends), and Training Content Creator (materials tailored to 8 audience levels from board to front-line).

**Operational Support (5 modules):** Regulatory Change Scanner (monitor and interpret changes, integrated with Regulatory Radar), STR/SAR Review Assistant (structured suspicious activity reports with evidence checklists), Investigation Support (complex AML investigation plans with evidence matrices), Peer Benchmarking (compare practices against industry peers), and Control Testing Framework (design and execute AML control tests).

**Consulting & Engagement (5 modules):** Engagement Proposal Builder (client proposals with approach, scope, and pricing), Engagement Delivery Planner (project plans with phases, RACI, and milestones), Management Presentation Generator (steering committee slides with key messages and speaker notes), Stakeholder Interview Planner (interview guides by stakeholder type), and Regulatory Submission Reviewer (pre-submission quality assurance).

**Data & Implementation (4 modules):** Data Readiness Assessment (AMLR data point readiness scorecards), Data Quality Checker (CDD/TM data quality with remediation plans), System Requirements Documenter (functional and technical specifications for AML systems), and Vendor Assessment Framework (technology vendor evaluation with comparison matrices).

### FCP Module Usage Patterns

The FCP modules form natural cascades. A typical implementation engagement flows: Gap Analysis → Data Readiness Assessment → System Requirements → Vendor Assessment → Implementation Project Plan (Area 11) → Policy Writer → Procedure Builder → Training Content Creator → Board Report Generator. Each module's output feeds the next, building institutional knowledge throughout.

---

## §34. Cross-Area Use Cases

ANTON's real power emerges when modules from multiple areas combine to address complex professional challenges that no single domain can solve alone.

### Use Case 1: AMLR Implementation (6 Areas, 15+ Modules)

A bank must implement AMLR by January 2027. The workflow spans assessment (FCP: Gap Analysis + Data Readiness), planning (Project Management: Implementation Plan + Resource Planning + RAID Log), legal review (Legal: Regulatory Interpretation + Contract Review), data and technology (Data: Governance Framework + Quality Assessment), policy and procedures (FCP: Policy Writer + Procedure Builder), training (FCP + Education: Training Creator + Assessment Builder), and validation (Audit: Planning + Control Testing). Result: 15+ modules across 6 areas, orchestrated via ANTON workflows with dependency management and milestone tracking.

### Use Case 2: Startup Launch (7 Areas, 18+ Modules)

A fintech founder goes from idea to Series A readiness through: foundation (Startups: Business Plan + Pitch Deck + Funding Strategy), legal setup (Legal: Company Formation + Shareholder Agreement + Regulatory Scan), product development (Software Engineering: Technical Spec + Architecture Review), compliance (FCP + Cybersecurity: AML Framework + GDPR Compliance), go-to-market (Branding + Communication: Brand Strategy + Content Strategy + Sales Strategy), operations (HR + Accounting: Hiring Plan + Financial Planning), and fundraising (Startups: Due Diligence Prep + Pitch Practice).

### Use Case 3: Consulting Engagement (5 Areas)

A Big 4 firm delivering a regulatory change project uses ANTON across sales (Consulting: Proposal Builder + Stakeholder Mapping), kickoff (Project Management: Charter + Communication Plan), analysis (FCP + Legal: Gap Analysis + Regulatory Interpretation), design (Risk + Data: Assessment + Strategy), implementation (Project Management + Operations: Roadmap + Change Management), and reporting (Consulting + Communication: Management Presentation + Final Report). Result: consistent quality, accelerated delivery, and knowledge capture across every engagement.

### Use Case 4: ESG Reporting (4 Areas)

A corporation preparing its first CSRD report works through scoping (ESG: Compliance Assessment + Double Materiality), data collection (Data + Accounting: Readiness Scorecard + Carbon Accounting), supply chain (Procurement + ESG: Sustainability Assessment + Sourcing Strategy), and reporting (Communication + Accounting: Sustainability Report + Integrated Reporting). Result: CSRD-compliant report with a data foundation for future years.

### Use Case 5: Personal Career Pivot (3 Areas)

A mid-career banking professional transitioning to consulting uses self-assessment (Personal Development: Career Strategy + Skills Gap Analysis), learning (Academic + Education: Learning Path Designer + Research Methodology), job search (Personal Development: CV Builder + Cover Letter Writer + Interview Preparation + Salary Negotiation), and networking (Communication: Personal Brand Strategy + Networking Strategy). Result: a structured career transition supported by professional-grade tools that would normally require a career coach.

---

### Cross-Area Workflow Automation

Users can create workflows spanning multiple areas and schedule them for recurring execution. A Quarterly Compliance Cycle workflow might run: Gap Analysis (FCP) → Risk Assessment (Risk) → Control Testing (Audit) → Board Report (FCP) → Management Presentation (Communication), scheduled to auto-run every January, April, July, and October.

### Knowledge Graph Across Areas

Cross-area entity relationships create powerful organisational intelligence. A knowledge graph might trace: Regulation AMLR Article 4 → requires → Control KYC-CDD-Enhanced → tested by → Q2 AML Audit → uses data from → CRM Database → managed by → Data Governance Process. This reveals how regulatory requirements flow through the organisation across domains — insight that no single-area analysis can provide.
