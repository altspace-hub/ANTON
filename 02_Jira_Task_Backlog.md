# Jira Task Backlog — ICA Banken AML Maturity & AMLA Readiness
**Project:** ICA-AML  
**Sprint board:** ADV-2025-FCP-0142  
**Project Lead:** Max Krackhardt  
**Last updated:** 3 March 2025

---

## EPIC 1 — Project Setup and Governance

---

### ICA-AML-001
**Type:** Task  
**Title:** Kick-off meeting — prepare agenda and logistics  
**Assignee:** Petra Andrésdottir  
**Reporter:** Max Krackhardt  
**Priority:** High  
**Status:** To Do  
**Sprint:** Sprint 1  
**Story points:** 2  
**Labels:** setup, internal  

**Description:**  
Prepare and circulate the agenda for the kick-off meeting with ICA Banken. Meeting is scheduled for Monday 10 March, 10:00–12:00 at ICA Banken offices, Solna.

**Agenda to include:**
- Introductions and team overview
- Engagement scope confirmation (reference: Engagement Letter ADV-2025-FCP-0142)
- Document request list walkthrough
- Ways of working agreement (SharePoint, Teams, escalation)
- Timeline confirmation (Phase 1 weeks 1–6; Phase 2 weeks 7–12)
- ICA Banken counterpart availability and constraints

**Acceptance criteria:**
- [ ] Agenda distributed to all attendees minimum 48h before meeting
- [ ] Teams link created and tested
- [ ] ICA Banken confirmation received from CCO office

---

### ICA-AML-002
**Type:** Task  
**Title:** Create document request list (DRL) for Phase 1  
**Assignee:** Sofia Stenius-Linna  
**Reporter:** Max Krackhardt  
**Priority:** High  
**Status:** To Do  
**Sprint:** Sprint 1  
**Story points:** 3  
**Labels:** setup, document-management  

**Description:**  
Prepare a structured document request list covering all materials needed for the Phase 1 gap assessment. Each request must reference the specific assessment area it supports.

**Documents to request (initial list — expand as needed):**

| # | Document | Owner at ICA Banken | Needed by |
|---|---------|-------------------|----------|
| 1 | BWRA v5.0 (already shared) | CCO | ✅ |
| 2 | AML/KYC Policy v7.0 | CCO | ✅ |
| 3 | CDD Procedures v4.0 | Head of Compliance Ops | Week 1 |
| 4 | TM Policy v4.2 + full rule documentation | Head of Financial Crime | Week 1 |
| 5 | Actimize RCM rule library export | IT / Actimize admin | Week 2 |
| 6 | Alert volume and disposition data (FY2024) | Head of Financial Crime | Week 2 |
| 7 | STR log (anonymised — count, type, timeline) | CCO | Week 2 |
| 8 | PEP Policy v3.0 | CCO | ✅ |
| 9 | Sanctions Policy v3.1 | CCO | ✅ |
| 10 | KYC refresh programme plan | Head of Compliance Ops | Week 2 |
| 11 | AML training completion report (FY2024) | Compliance Ops | Week 2 |
| 12 | FI AML inspection reports (2019, 2022) | CCO | Week 2 |
| 13 | ML model documentation (4 models) | CDO / Data Science | Week 3 |
| 14 | Onboarding system flow and screen captures | CDO | Week 3 |
| 15 | Adverse media and sanctions screening config | Fircosoft admin | Week 3 |

**Acceptance criteria:**
- [ ] DRL submitted to ICA Banken project liaison by end of Week 1
- [ ] SharePoint upload folder confirmed and access granted
- [ ] Tracking sheet created in shared project folder to monitor receipt

---

### ICA-AML-003
**Type:** Task  
**Title:** Set up project SharePoint site and folder structure  
**Assignee:** Petra Andrésdottir  
**Reporter:** Max Krackhardt  
**Priority:** Medium  
**Status:** To Do  
**Sprint:** Sprint 1  
**Story points:** 1  
**Labels:** setup, IT  

**Description:**  
Create the Advisense SharePoint project site for ICA-AML-2025. Apply Advisense standard folder structure. Invite ICA Banken guest users (Lena Martinsson, Head of Compliance Operations, Head of Financial Crime).

**Folder structure:**
```
ICA-AML-2025/
├── 00_Engagement/
│   ├── Engagement_Letter_signed.pdf
│   ├── DPA_signed.pdf
│   └── Project_Plan.xlsx
├── 01_Documents_Received/
│   ├── Policies/
│   ├── Procedures/
│   └── Data/
├── 02_Working_Papers/
│   ├── Phase1_Gap_Assessment/
│   └── Phase2_AMLA_Readiness/
├── 03_Deliverables/
│   ├── D4_Phase1_Draft/
│   ├── D5_Phase1_Final/
│   ├── D7_Phase2_Draft/
│   └── D8_Phase2_Final/
└── 04_Meetings/
    └── [date]_Meeting_Notes/
```

**Acceptance criteria:**
- [ ] Site live and accessible
- [ ] ICA Banken guests have view/upload access to 01_Documents_Received only
- [ ] Advisense team has full access to all folders

---

## EPIC 2 — Phase 1: KYC and CDD Review

---

### ICA-AML-010
**Type:** Task  
**Title:** Review CDD framework against EBA GL/2021/02 and draft AMLR  
**Assignee:** Sofia Stenius-Linna  
**Reporter:** Max Krackhardt  
**Priority:** High  
**Status:** To Do  
**Sprint:** Sprint 2  
**Story points:** 8  
**Labels:** phase1, KYC, CDD, EBA  

**Description:**  
Conduct a line-by-line review of ICA Banken's CDD Procedures (v4.0) and AML/KYC Policy (v7.0) against:
- EBA Guidelines on ML/TF risk factors (EBA/GL/2021/02), Section 4.2 (CDD)
- AMLR draft Articles 20–40 (Customer due diligence)

**Review dimensions:**
1. Completeness — are all required CDD elements present?
2. Adequacy — are the required standards met or exceeded?
3. Operationalisation — is the policy reflected in actual procedures?
4. Documentation — is the rationale for risk-based decisions documented?

**Reference documents:**  
- ICA Banken CDD Procedures v4.0 (SharePoint: 01_Documents_Received/Procedures)  
- ICA Banken AML/KYC Policy v7.0  
- EBA/GL/2021/02 (stored in Advisense knowledge base)  
- AMLR draft (Q4 2024 trilogue text)

**Acceptance criteria:**
- [ ] Completed gap matrix (EBA GL vs. ICA Banken) with RAG rating per element
- [ ] Completed gap matrix (AMLR draft vs. ICA Banken) for CDD articles
- [ ] Findings summary (max 3 pages) ready for Phase 1 report integration
- [ ] Peer reviewed by Max Krackhardt before inclusion

---

### ICA-AML-011
**Type:** Task  
**Title:** Root cause analysis — KYC refresh backlog (38,000 customers)  
**Assignee:** Sofia Stenius-Linna  
**Reporter:** Max Krackhardt  
**Priority:** High  
**Status:** To Do  
**Sprint:** Sprint 2  
**Story points:** 5  
**Labels:** phase1, KYC, remediation  

**Description:**  
The BWRA (v5.0, §2.2) and AML/KYC Policy (§4.2) both identify a backlog of approximately 38,000 customers with KYC data older than 24 months. Current average refresh interval for medium-risk customers is 4.2 years against a target of 3 years.

Investigate and document:
1. Root cause — why has the backlog accumulated? (capacity, system, process, prioritisation?)
2. Current remediation plan — what is ICA Banken already doing? Is the plan adequate?
3. Risk exposure — what is the ML/TF risk posed by these 38,000 unrefreshed customers?
4. Recommended remediation — enhanced plan if current approach is insufficient

**Data needed from ICA Banken:**
- KYC refresh programme plan (DRL item 10)
- Breakdown of 38,000 customers by risk tier and product
- Current refresh throughput rate (how many per month?)

**Acceptance criteria:**
- [ ] Root cause identified and documented
- [ ] Risk rating of the backlog provided (Critical / High / Medium / Low)
- [ ] Remediation recommendation with timeline and resource estimate
- [ ] Ready for Phase 1 report Chapter 2

---

### ICA-AML-012
**Type:** Task  
**Title:** EDD process review — PEPs, non-residents, and cash-intensive businesses  
**Assignee:** Sofia Stenius-Linna  
**Reporter:** Max Krackhardt  
**Priority:** High  
**Status:** To Do  
**Sprint:** Sprint 2  
**Story points:** 5  
**Labels:** phase1, EDD, PEP  

**Description:**  
Review ICA Banken's Enhanced Due Diligence process for the three highest-risk customer categories:

1. **PEPs** — review PEP Policy v3.0 and CDD Procedures §4 for completeness, senior management approval workflow, source of wealth adequacy
2. **Non-residents** — review non-resident onboarding requirements; assess face-to-face verification process; check against AMLR draft requirements
3. **Cash-intensive business owners** — review how these customers are identified, what EDD is applied, and how transaction monitoring is calibrated for them

**Reference documents:**
- PEP Policy v3.0
- CDD Procedures v4.0 §4
- Customer Onboarding Policy v5.1 §5
- BWRA §2.3 (PEP exposure)

**Acceptance criteria:**
- [ ] Finding note (1–2 pages per category) with gaps and recommendations
- [ ] RAG rating per category
- [ ] Integrated into Phase 1 report

---

## EPIC 3 — Phase 1: Transaction Monitoring Review

---

### ICA-AML-020
**Type:** Task  
**Title:** TM rule assessment — coverage, calibration, and documentation quality  
**Assignee:** Björn Heir  
**Reporter:** Max Krackhardt  
**Priority:** High  
**Status:** To Do  
**Sprint:** Sprint 2  
**Story points:** 13  
**Labels:** phase1, transaction-monitoring, Actimize  

**Description:**  
Conduct a structured review of ICA Banken's 48 TM rules in Actimize RCM. Assess:

1. **Coverage** — do the rules cover all major FATF typologies relevant to ICA Banken's risk profile?
2. **Calibration** — are thresholds set appropriately? (neither generating excessive false positives nor missing true positives)
3. **Documentation** — is each rule documented with: rationale, threshold basis, last review date, expected alert volume, and performance data?
4. **Governance** — is the rule tuning process (TM Governance Committee) adequate? Is quarterly cadence sufficient?

**Key data inputs:**
- Actimize RCM rule library export (DRL item 5)
- Alert volume and disposition data FY2024 (DRL item 6)
- TM Policy v4.2 (already received)

**Specific focus areas from TM Policy §7.3 (known gaps):**
- Crypto-asset typology rules (currently just CASH-004 at SEK 25,000 — assess adequacy)
- Mule account detection (VEL-009 only — likely insufficient given rising mule risk in Sweden)

**Acceptance criteria:**
- [ ] Rule-by-rule assessment matrix (48 rules) with coverage, calibration, and documentation rating
- [ ] Typology gap analysis — what major FATF typologies are not covered?
- [ ] Top 5 high-priority rule recommendations
- [ ] Summary findings for Phase 1 report Chapter 3

---

### ICA-AML-021
**Type:** Task  
**Title:** Assess ML model governance and validation framework  
**Assignee:** Björn Heir  
**Reporter:** Max Krackhardt  
**Priority:** Medium  
**Status:** To Do  
**Sprint:** Sprint 3  
**Story points:** 8  
**Labels:** phase1, ML-models, AI-Act  

**Description:**  
ICA Banken deployed 4 ML models for TM in Q3 2023 (Anomaly Detection, Network Analysis, PEP Behaviour, Crypto-Asset Risk). Review:

1. **Model governance** — is there a model risk management framework? Who owns and validates the models?
2. **Performance** — are precision/recall metrics (as documented in TM Policy §5) adequate and being tracked? Are benchmarks appropriate?
3. **Explainability** — can analysts explain why the model generated an alert? (GDPR, EU AI Act requirements)
4. **EU AI Act relevance** — ICA Banken's TM ML models likely fall under EU AI Act Article 6 (high-risk AI systems used in financial services). What are the implications?

**Reference:** TM Policy §5, EU AI Act (August 2024 — phased enforcement)

**Acceptance criteria:**
- [ ] Finding note on model governance adequacy
- [ ] EU AI Act applicability assessment (in scope / out of scope / partial)
- [ ] Recommended model risk management framework (if gap identified)

---

## EPIC 4 — Phase 1: Sanctions and Governance Review

---

### ICA-AML-030
**Type:** Task  
**Title:** Sanctions screening configuration review — Fircosoft/Dow Jones  
**Assignee:** Björn Heir  
**Reporter:** Max Krackhardt  
**Priority:** High  
**Status:** To Do  
**Sprint:** Sprint 3  
**Story points:** 5  
**Labels:** phase1, sanctions, screening  

**Description:**  
Review ICA Banken's sanctions screening programme against Sanctions Policy v3.1 and FI expectations:

1. **List coverage** — confirm all required lists are loaded (EU, UN, OFAC SDN, OFSI, Riksgälden)
2. **Matching threshold** — assess whether the 85% fuzzy matching threshold is appropriate (risk of both false positives and false negatives)
3. **Update frequency** — confirm EU and UN list updates are applied within required timeframes
4. **Myanmar** — Sanctions Policy §7.3 notes Myanmar was newly FATF-blacklisted (Oct 2024). Confirm ICA Banken's TM rule GEO-008 has been implemented
5. **Russia/Belarus** — review implementation of post-2022 comprehensive sanctions (Sanctions Policy §8)
6. **Correspondent banking** — review SEB, Citi, Deutsche Bank correspondent sanctions controls

**Acceptance criteria:**
- [ ] Screening configuration review note
- [ ] Myanmar/Russia/Belarus compliance confirmation or gap
- [ ] RAG rating and recommendations

---

### ICA-AML-031
**Type:** Task  
**Title:** AML governance review — three lines, MLRO mandate, Board reporting  
**Assignee:** Sofia Stenius-Linna  
**Reporter:** Max Krackhardt  
**Priority:** Medium  
**Status:** To Do  
**Sprint:** Sprint 3  
**Story points:** 5  
**Labels:** phase1, governance, MLRO  

**Description:**  
Assess the adequacy of ICA Banken's AML governance structure:

1. **MLRO mandate** — is the CCO/MLRO role adequately defined? Does the MLRO have sufficient independence, authority, and resources?
2. **Board reporting** — review the Board/Risk Committee AML reporting pack. Is the content and frequency adequate? Does it provide sufficient oversight?
3. **Three lines** — interview 1st line (onboarding / operations) to assess their understanding of AML obligations. Are escalation paths clear?
4. **Training** — review training programme: 94% completion vs 100% target. Who are the non-completers? Is the training content adequate for the current risk environment?

**Reference documents:**
- Governance & Reporting Framework v2.2 (ICA Banken doc 15)
- AML/KYC Policy §2 (governance section)
- AML training completion report (DRL item 11)

**Acceptance criteria:**
- [ ] Governance assessment note (2–3 pages)
- [ ] Interview notes from 1st line discussions (anonymised)
- [ ] Training programme assessment

---

## EPIC 5 — Phase 1 Report

---

### ICA-AML-040
**Type:** Task  
**Title:** Draft Phase 1 Gap Assessment Report  
**Assignee:** Max Krackhardt  
**Reporter:** Jonas Karlsson  
**Priority:** Critical  
**Status:** To Do  
**Sprint:** Sprint 3  
**Story points:** 13  
**Labels:** phase1, deliverable, report  

**Description:**  
Compile all Phase 1 working papers into the Gap Assessment Report (Deliverable D4/D5 per engagement letter).

**Report structure:**
1. Executive Summary (1 page — for CCO and CEO)
2. Methodology and scope
3. CDD and KYC findings
4. Transaction Monitoring findings
5. Sanctions and screening findings
6. Governance findings
7. Consolidated findings register (with RAG rating and priority)
8. Recommended remediation roadmap (high-level)
9. Appendix: Gap matrices

**Format:** PowerPoint presentation (for verbal delivery) + Word document (formal written report)

**Review process:**
- Björn and Sofia deliver working papers to Max: end of Week 4
- Max drafts report: Week 5
- Jonas reviews: Day 1–2 of Week 6
- Draft D4 to ICA Banken: Day 3 of Week 6
- ICA Banken feedback: 3 business days
- Final D5 issued: End of Week 6

**Acceptance criteria:**
- [ ] All working papers integrated
- [ ] Every finding has: description, evidence, risk rating, recommendation, owner suggestion
- [ ] Executive summary can stand alone
- [ ] Jonas Karlsson sign-off before issuance
- [ ] Issued in both PDF and editable Word format

---

## EPIC 6 — Phase 2: AMLA Readiness

---

### ICA-AML-050
**Type:** Task  
**Title:** AMLR article mapping — CDD and EDD articles (20–40)  
**Assignee:** Sofia Stenius-Linna  
**Reporter:** Max Krackhardt  
**Priority:** High  
**Status:** To Do  
**Sprint:** Sprint 4  
**Story points:** 8  
**Labels:** phase2, AMLR, AMLA  

**Description:**  
Map ICA Banken's current CDD framework against AMLR draft Articles 20–40 (customer due diligence and enhanced due diligence). Identify:
- Provisions that align with current ICA Banken policy (compliant)
- Provisions that partially align (gap)
- Provisions with no current ICA Banken equivalent (missing)

Pay particular attention to:
- AMLR's harmonised definition of PEPs (potentially narrower or broader than current Swedish implementation)
- AMLR Article 29–34 EDD requirements — any new mandated elements?
- AMLR beneficial ownership thresholds and verification requirements

**Acceptance criteria:**
- [ ] Article-by-article mapping table (compliant / gap / missing)
- [ ] Top 5 material gaps identified
- [ ] Narrative summary (2 pages)

---

### ICA-AML-051
**Type:** Task  
**Title:** Assess AMLA direct supervision applicability for ICA Banken  
**Assignee:** Petra Andrésdottir  
**Reporter:** Max Krackhardt  
**Priority:** Medium  
**Status:** To Do  
**Sprint:** Sprint 4  
**Story points:** 3  
**Labels:** phase2, AMLA, supervision  

**Description:**  
AMLA will directly supervise certain obliged entities meeting criteria (expected: cross-border presence, transaction volumes, or assets above defined thresholds). Assess whether ICA Banken could fall under direct AMLA supervision.

ICA Banken's profile:
- Domestic-only operations (Sweden)
- ~1.82M customers
- Total assets SEK 68.4 billion
- No branches outside Sweden

Preliminary expectation: ICA Banken is below direct supervision threshold. Confirm this assessment against AMLR Article 100+ (supervisory criteria) and prepare a Board briefing note.

**Acceptance criteria:**
- [ ] 1-page Board briefing note: "Will AMLA directly supervise ICA Banken?"
- [ ] Legal basis cited (AMLR articles)
- [ ] Recommendation on whether ICA Banken should monitor this or take proactive action

---

### ICA-AML-052
**Type:** Task  
**Title:** Technology readiness — assess Actimize and Fircosoft for AMLR compliance  
**Assignee:** Björn Heir  
**Reporter:** Max Krackhardt  
**Priority:** High  
**Status:** To Do  
**Sprint:** Sprint 5  
**Story points:** 8  
**Labels:** phase2, technology, AMLR  

**Description:**  
Assess whether ICA Banken's core AML technology (Actimize RCM, Fircosoft, Temenos T24 data feeds) is capable of meeting anticipated AMLR requirements without significant re-platforming.

Key questions:
1. Will Actimize RCM's data model support AMLR's harmonised customer risk scoring approach?
2. Does the Fircosoft configuration support AMLR's required list coverage (will new EU-level lists be mandated)?
3. Are there data quality or data architecture gaps that could prevent AMLR compliance?
4. What is the vendor roadmap for Actimize and Fircosoft with respect to AMLR?

**Acceptance criteria:**
- [ ] Technology gap assessment note
- [ ] Vendor roadmap findings (from public sources or Advisense partner contacts)
- [ ] Recommendation: upgrade / configure / replace assessment per system

---

### ICA-AML-060
**Type:** Task  
**Title:** Prepare AMLA Readiness Report and Board deck (D7/D8)  
**Assignee:** Max Krackhardt  
**Reporter:** Jonas Karlsson  
**Priority:** Critical  
**Status:** To Do  
**Sprint:** Sprint 6  
**Story points:** 13  
**Labels:** phase2, deliverable, report, board  

**Description:**  
Compile Phase 2 findings into the AMLA Readiness Report (D7 draft, D8 final) and Board presentation.

**Report structure:**
1. Executive Summary — AMLA in 60 seconds (for the Board)
2. AMLR — what is changing and when
3. ICA Banken gap assessment (article-by-article)
4. AMLA supervision — ICA Banken's position
5. Technology readiness
6. Implementation roadmap 2025–2027 (with milestones and indicative costs)
7. Recommended immediate actions (Q2–Q3 2025)

**Board deck:** Max 12 slides. Senior-appropriate language. No jargon.

**Acceptance criteria:**
- [ ] Draft D7 issued to ICA Banken by end of Week 11
- [ ] Board deck ready for Risk Committee review
- [ ] Final D8 issued after ICA Banken feedback, Week 12
- [ ] Jonas Karlsson sign-off before issuance
