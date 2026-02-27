## PART 6: THE 29 EXPERT AREAS

## 20. Expert Areas Overview

openEXPERT covers **29 professional domains** with **240 pre-configured modules**.

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

**Total: 240 modules**

---

### Area Categories

**Core Professional Services (Areas 1-10):**
- Financial services focus (FCP, Banking, Investment)
- Professional services (Legal, Audit, Consulting)
- Corporate functions (Risk, Data, ESG, Cybersecurity)

**Business Operations (Areas 11-18):**
- Project/program delivery
- Strategy and operations
- People and culture
- Technology development
- Finance and accounting
- Industry verticals (Insurance, Comms)

**Growth & Learning (Areas 19-21):**
- Entrepreneurship
- Academic research
- Personal development

**Specialized Domains (Areas 22-29):**
- Creative industries (Branding, Education)
- Healthcare and life sciences
- Manufacturing and industrial
- Consumer services (Legal, Real Estate, Nonprofit)
- Procurement and supply chain

---

### Module Structure (Consistent Across All Areas)

Every module follows the same pattern:

**1. Module Configuration** (`module.json`)
```json
{
  "id": "amlr-gap-analysis",
  "label": "AMLR Gap Analysis",
  "shortLabel": "AMLR Gap",
  "icon": "CheckSquare",
  "description": "Systematic comparison of current AML/CFT framework against EU AMLR 2024/1624 requirements",
  "color": "adv-red",
  "defaults": {
    "thinking": "investigate",
    "creativity": "strict",
    "outputFormats": ["executive-summary", "gap-scoring-matrix", "action-plan"],
    "knowledgeSources": {
      "claudeKnowledge": {"enabled": true, "webSearchEnabled": true, "description": "AMLR Regulation 2024/1624, EBA guidelines on AML risk factors"},
      "localFolder": {"enabled": false, "folderPaths": [], "recursive": true}
    }
  },
  "guidedInputs": [
    {"id": "entity_type", "label": "Entity Type", "type": "select", "options": ["Bank", "Payment Institution", "E-Money Institution", "Investment Firm", "Crypto Asset Service Provider"], "required": true},
    {"id": "jurisdiction", "label": "Primary Jurisdiction", "type": "select", "options": ["Sweden", "Finland", "Denmark", "Norway", "Iceland", "Other EU"], "required": true},
    {"id": "focus_areas", "label": "Focus Areas", "type": "multiselect", "options": ["Customer Due Diligence", "Transaction Monitoring", "Sanctions Screening", "SAR/STR Reporting", "Data Management", "Governance & Controls", "Crypto Assets", "Beneficial Ownership"], "required": false}
  ]
}
```

**2. System Prompt** (`system-prompt.md`)
- Task definition and objectives
- Methodology (step-by-step)
- Output structure template
- Quality criteria
- Common pitfalls to avoid

**3. Area Context** (shared across modules in same area)
- Domain background
- Key regulations and frameworks
- Common methodologies
- Stakeholder landscape

---

### Cross-Area Module Linking

Modules can reference related modules in other areas:

**Example: AMLR Gap Analysis (Area 1: FCP)**
```
Where to take it next:
  → Area 2 (Legal): Regulatory Interpretation — for legal questions on AMLR articles
  → Area 3 (Audit): Audit Planning — design audit program to verify gaps
  → Area 7 (Data): Data Readiness Assessment — assess data gaps for AMLR compliance
  → Area 11 (Project Management): Implementation Project Plan — create AMLR implementation roadmap
```

**Benefit:** Users discover complementary modules, enabling multi-area workflows

---

## 21. Flagship Area: Financial Crime Prevention

**Area 1: FCP** is the most comprehensive area — 23 modules covering the full AML/CFT lifecycle.

### Background

openEXPERT was born from FCP consulting work at Advisense. The FCP area represents 14+ years of banking and regulatory consulting experience codified into expert AI modules.

---

### The 23 FCP Modules

#### **Core Compliance (5 modules)**

**1. AMLR Gap Analysis**
- **Purpose:** Systematic comparison against EU AMLR 2024/1624
- **Thinking:** `investigate` (max depth)
- **Output:** Executive summary + gap scoring matrix + action plan
- **Knowledge:** Web search for latest AMLR RTS/ITS + local folder for client docs
- **Audience:** Board, compliance committee, regulators

**2. Business-Wide Risk Assessment (BWRA)**
- **Purpose:** ML/TF risk assessment per risk-based approach
- **Thinking:** `think_hard`
- **Output:** Risk assessment report with inherent → control → residual risk scoring
- **Knowledge:** EBA Risk Factor Guidelines (skill) + client data (local folders)
- **Audience:** Board, MLRO, compliance team

**3. Sanctions Compliance Assessment**
- **Purpose:** Screening effectiveness and sanctions program maturity
- **Thinking:** `think_hard`
- **Output:** Sanctions program assessment + screening gap analysis
- **Knowledge:** EU Sanctions Regulation 833/2014 + web search for latest designations
- **Audience:** Sanctions officer, compliance

**4. KYC/CDD Framework Review**
- **Purpose:** Customer due diligence process assessment
- **Thinking:** `think`
- **Output:** Process review + recommendations
- **Knowledge:** 6AMLD, AMLR, EBA CDD guidelines
- **Audience:** KYC team, operations

**5. Transaction Monitoring Assessment**
- **Purpose:** TM system effectiveness evaluation
- **Thinking:** `think_hard`
- **Output:** TM assessment + scenario review + tuning recommendations
- **Knowledge:** Client TM rules + FATF guidance
- **Audience:** TM manager, 2nd line

---

#### **Document Creation (4 modules)**

**6. AML Policy Writer**
- **Purpose:** Create or update AML/CFT policy
- **Thinking:** `investigate`
- **Output:** Policy document (structured, board-ready)
- **Knowledge:** Web search for latest regulatory requirements + existing policy (local folder)
- **Audience:** Board, all staff

**7. Procedure Builder**
- **Purpose:** Detailed operational procedures (KYC, TM, SAR)
- **Thinking:** `think_hard`
- **Output:** Step-by-step procedure document
- **Knowledge:** Regulatory requirements + client process maps
- **Audience:** Operations teams

**8. Board Report Generator**
- **Purpose:** Quarterly/annual MLRO reports
- **Thinking:** `think`
- **Output:** Executive board report (KPIs, trends, issues, recommendations)
- **Knowledge:** Client KPI data + regulatory developments
- **Audience:** Board, risk committee

**9. Training Content Creator**
- **Purpose:** AML training materials
- **Thinking:** `think`
- **Output:** Training deck + scenarios + knowledge checks
- **Audiences:** 8 options (board, compliance, front-line, operations, etc.)
- **Knowledge:** Regulatory requirements + client examples

---

#### **Operational Support (5 modules)**

**10. Regulatory Change Scanner**
- **Purpose:** Monitor and interpret regulatory changes
- **Thinking:** `think`
- **Output:** Change impact assessment
- **Integration:** Works with Regulatory Radar (auto-feed new items)
- **Audience:** Compliance team

**11. STR/SAR Review Assistant**
- **Purpose:** Help structure suspicious activity reports
- **Thinking:** `think_hard`
- **Output:** STR narrative + supporting evidence checklist
- **Knowledge:** FATF guidance + FIU requirements
- **Audience:** SAR analysts

**12. Investigation Support**
- **Purpose:** Structure complex AML investigations
- **Thinking:** `investigate`
- **Output:** Investigation plan + evidence matrix + timeline
- **Knowledge:** Transaction data + customer profile
- **Audience:** Investigation team, MLRO

**13. Quality Assurance Reviewer**
- **Purpose:** QA review of STRs, EDD, or policies
- **Thinking:** `think`
- **Output:** QA checklist + findings + improvement recommendations
- **Knowledge:** Internal QA standards + regulatory requirements
- **Audience:** 2nd line, QA team

**14. Model Validation**
- **Purpose:** Validate TM scenarios, risk rating models
- **Thinking:** `investigate`
- **Output:** Model validation report (methodology, testing, limitations, recommendations)
- **Knowledge:** Model documentation + test results
- **Audience:** Model risk, audit, regulators

---

#### **Consultant/Advisory (5 modules)**

**15. Engagement Proposal Builder**
- **Purpose:** Create client proposals for FCP projects
- **Thinking:** `think`
- **Output:** Proposal (understanding, approach, scope, timeline, pricing)
- **Knowledge:** RFP + client background
- **Audience:** Sales, partners

**16. Engagement Delivery Planner**
- **Purpose:** Project plan for FCP implementations
- **Thinking:** `think_hard`
- **Output:** Project plan (phases, workstreams, RACI, milestones)
- **Knowledge:** Client context + implementation scope
- **Audience:** Project team

**17. Management Presentation Generator**
- **Purpose:** Create presentations for client steering committees
- **Thinking:** `think`
- **Output:** Slide outline + key messages + speaker notes
- **Knowledge:** Project status + stakeholder landscape
- **Audience:** Client management

**18. Stakeholder Interview Planner**
- **Purpose:** Design interview guides for stakeholder consultations
- **Thinking:** `quick`
- **Output:** Interview guide + questions by stakeholder type
- **Knowledge:** Project scope + org structure
- **Audience:** Consultants

**19. Regulatory Submission Reviewer**
- **Purpose:** Review client submissions to regulators (pre-submission QA)
- **Thinking:** `investigate`
- **Output:** Review findings + recommendations
- **Knowledge:** Regulatory requirements + submission draft
- **Audience:** Consultants, client compliance

---

#### **Data & Implementation (4 modules)**

**20. Data Readiness Assessment**
- **Purpose:** Assess data availability for AMLR compliance
- **Thinking:** `think_hard`
- **Output:** Data readiness scorecard (per data point: status, source, owner, effort)
- **Knowledge:** AMLR data requirements + client data dictionary
- **Audience:** Data teams, IT, compliance

**21. Data Quality Checker**
- **Purpose:** Identify data quality issues in CDD/TM data
- **Thinking:** `think`
- **Output:** Data quality report + remediation plan
- **Knowledge:** Data quality rules + sample data
- **Audience:** Data teams

**22. System Requirements Documenter**
- **Purpose:** Document requirements for AML system implementations
- **Thinking:** `think_hard`
- **Output:** Requirements specification (functional, technical, integration)
- **Knowledge:** Regulatory requirements + client IT landscape
- **Audience:** IT teams, vendors

**23. Vendor Assessment Framework**
- **Purpose:** Evaluate AML technology vendors (TM, screening, KYC)
- **Thinking:** `think`
- **Output:** Vendor scorecard + comparison matrix
- **Knowledge:** RFP responses + regulatory requirements
- **Audience:** Procurement, IT, compliance

---

### FCP Module Usage Patterns

**Gap Analysis → Implementation Cascade:**
```
1. AMLR Gap Analysis (identify gaps)
   ↓
2. Data Readiness Assessment (check data availability)
   ↓
3. System Requirements Documenter (define IT needs)
   ↓
4. Vendor Assessment Framework (select solutions)
   ↓
5. Implementation Project Plan (Area 11 — Project Management)
   ↓
6. Policy Writer (update policies)
   ↓
7. Training Content Creator (train staff)
   ↓
8. Audit Planning (Area 3 — design validation audit)
```

**Consultant Workflow:**
```
1. Engagement Proposal Builder (win the work)
   ↓
2. Engagement Delivery Planner (plan the project)
   ↓
3. Stakeholder Interview Planner (design consultations)
   ↓
4. Gap Analysis / Risk Assessment (deliver core analysis)
   ↓
5. Management Presentation (present findings)
   ↓
6. Regulatory Submission Reviewer (QA final deliverable)
```

---

### Why FCP Is the Flagship

**1. Domain Depth:**
- 23 modules vs. 4-12 in other areas
- Covers full AML/CFT lifecycle (strategy → operations → audit)

**2. Real-World Validation:**
- Built from actual consulting engagements
- Prompts based on frameworks used at SEB, Sveriges Riksbank, EY, Advisense

**3. Regulatory Currency:**
- Integrated with Regulatory Radar (EBA, ESMA, FATF, EUR-Lex)
- Web search enabled by default for latest guidance

**4. Cross-Area Integration:**
- Links to Legal (interpretation), Audit (validation), Data (readiness), Project Management (implementation)

**5. Output Quality:**
- Average quality score: 8.7 (highest across all areas)
- Regulatory-defensible citations
- Board-ready executive summaries

---

## 22. Cross-Area Use Cases

openEXPERT's power multiplies when modules from multiple areas combine.

### Use Case 1: AMLR Implementation (Multi-Area Workflow)

**Scenario:** Bank must implement AMLR by January 2027

**Modules used across 6 areas:**

**Phase 1: Assessment (Area 1: FCP)**
- AMLR Gap Analysis → identify compliance gaps
- Data Readiness Assessment → check data availability

**Phase 2: Planning (Area 11: Project Management)**
- Implementation Project Plan → create roadmap
- Resource Planning → estimate FTE needs
- RAID Log → track risks and issues

**Phase 3: Legal Review (Area 2: Legal)**
- Regulatory Interpretation → clarify ambiguous AMLR articles
- Contract Review → review vendor contracts for AMLR alignment

**Phase 4: Data & Technology (Area 7: Data)**
- Data Governance Framework → establish data ownership
- Data Quality Assessment → remediate data gaps

**Phase 5: Policy & Procedures (Area 1: FCP)**
- AML Policy Writer → update policy
- Procedure Builder → create new CDD procedures

**Phase 6: Training (Area 1: FCP + Area 23: Education)**
- Training Content Creator → develop materials
- Assessment Builder → create knowledge tests

**Phase 7: Validation (Area 3: Audit)**
- Audit Planning → design validation audit
- Control Testing → test new controls

**Result:** 15+ modules across 6 areas, orchestrated via workflows

---

### Use Case 2: Startup Launch (Multi-Area Workflow)

**Scenario:** Founder launching fintech startup

**Modules used across 7 areas:**

**Phase 1: Foundation (Area 19: Startups)**
- Business Plan Development → create business plan
- Pitch Deck Creation → investor deck
- Funding Strategy → Series A roadmap

**Phase 2: Legal Setup (Area 2: Legal)**
- Company Formation Guidance → incorporation
- Shareholder Agreement Builder → cap table and vesting
- Regulatory Horizon Scan → identify licensing requirements

**Phase 3: Product Development (Area 15: Software)**
- Technical Specification → define MVP
- Architecture Review → scalability planning

**Phase 4: Compliance (Area 1: FCP + Area 9: Cybersecurity)**
- AML Framework Designer → if handling payments
- GDPR Compliance Checker → data protection

**Phase 5: Go-to-Market (Area 22: Branding + Area 21: Sales)**
- Brand Strategy → positioning
- Content Strategy → marketing plan
- Sales Strategy → pipeline design

**Phase 6: Operations (Area 14: HR + Area 13: Accounting)**
- Hiring Plan → recruitment strategy
- Financial Planning → burn rate, runway

**Phase 7: Fundraising (Area 19: Startups)**
- Investor Due Diligence Prep → prepare for DD
- Pitch Practice → refine pitch

**Result:** 18+ modules across 7 areas, founder goes from idea to Series A

---

### Use Case 3: Consulting Engagement (Multi-Area Workflow)

**Scenario:** Big 4 firm delivering regulatory change project

**Modules used across 5 areas:**

**Phase 1: Sales (Area 4: Consulting)**
- Engagement Proposal Builder → win RFP
- Stakeholder Mapping → identify key stakeholders

**Phase 2: Kickoff (Area 11: Project Management)**
- Project Charter → define scope
- Communication Plan → stakeholder engagement

**Phase 3: Analysis (Area 1: FCP + Area 2: Legal)**
- Gap Analysis → identify regulatory gaps
- Regulatory Interpretation → clarify requirements

**Phase 4: Design (Area 6: Risk + Area 7: Data)**
- Risk Assessment → evaluate ML/TF risks
- Data Strategy → design data solution

**Phase 5: Implementation (Area 11: Project Management + Area 13: Operations)**
- Implementation Roadmap → phased plan
- Change Management → stakeholder readiness

**Phase 6: Reporting (Area 4: Consulting + Area 18: Communication)**
- Management Presentation → steering committee updates
- Final Report → deliverable documentation

**Result:** Consistent quality, accelerated delivery, knowledge capture

---

### Use Case 4: Personal Career Pivot (Multi-Area Workflow)

**Scenario:** Mid-career professional transitioning from banking to consulting

**Modules used across 3 areas:**

**Phase 1: Self-Assessment (Area 21: Personal Development)**
- Career Strategy → define target roles
- Skills Gap Analysis → identify missing skills

**Phase 2: Learning Plan (Area 20: Academic + Area 23: Education)**
- Learning Path Designer → structured upskilling
- Research Methodology → if pursuing MBA

**Phase 3: Job Search (Area 21: Personal Development)**
- CV Builder → tailored CV
- Cover Letter Writer → role-specific letters
- Interview Preparation → practice questions
- Salary Negotiation Prep → research + strategy

**Phase 4: Networking (Area 18: Communication)**
- Personal Brand Strategy → LinkedIn optimization
- Networking Strategy → outreach plan

**Result:** Structured career transition with professional-grade tools

---

### Use Case 5: ESG Reporting (Multi-Area Workflow)

**Scenario:** Corporation preparing first CSRD report

**Modules used across 4 areas:**

**Phase 1: Scoping (Area 8: ESG)**
- CSRD Compliance Assessment → identify requirements
- Double Materiality Assessment → determine topics

**Phase 2: Data Collection (Area 7: Data + Area 13: Accounting)**
- Data Readiness Scorecard → ESG data gaps
- Carbon Accounting → Scope 1/2/3 emissions

**Phase 3: Supply Chain (Area 27: Procurement + Area 8: ESG)**
- Supply Chain Sustainability → vendor assessment
- Procurement Strategy → sustainable sourcing

**Phase 4: Reporting (Area 18: Communication + Area 13: Accounting)**
- Sustainability Report Content → narrative
- Integrated Reporting → financial + ESG

**Result:** CSRD-compliant report, data foundation for future years

---

### Cross-Area Workflow Automation

**Users can create workflows spanning multiple areas:**

**Example: Quarterly Compliance Cycle**
```
Step 1: Gap Analysis (Area 1: FCP)
   ↓
Step 2: Risk Assessment (Area 6: Risk)
   ↓
Step 3: Control Testing (Area 3: Audit)
   ↓
Step 4: Board Report (Area 1: FCP)
   ↓
Step 5: Management Presentation (Area 18: Communication)
```

**Schedule:** Auto-run every quarter (Jan, Apr, Jul, Oct)

**Benefit:** Recurring compliance work automated, cross-area coordination built-in

---

### Knowledge Graph Across Areas

**Cross-area entity relationships:**

```
[Regulation: AMLR Article 4] (Area 1: FCP)
        |
        requires
        |
        v
[Control: KYC-CDD-Enhanced] (Area 1: FCP)
        |
        tested_by
        |
        v
[Audit Program: Q2-AML-Audit] (Area 3: Audit)
        |
        uses_data_from
        |
        v
[System: CRM-Database] (Area 7: Data)
        |
        managed_by
        |
        v
[Process: Data Governance] (Area 7: Data)
```

**Insight from graph:**
"AMLR Article 4 requires Control KYC-CDD-Enhanced, which is tested in Q2 AML Audit, using data from CRM-Database, managed via Data Governance process."

**Benefit:** See how regulatory requirements flow through organization across domains

---
