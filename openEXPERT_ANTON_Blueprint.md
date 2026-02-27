# openEXPERT by ANTON — Complete Platform Blueprint

**Version:** 1.0 — February 17, 2026  
**Created by:** Daniel Bardun & FutureChain  
**Vision:** The first AI-powered expert platform that democratizes consulting, audit, legal, financial, creative, and operational expertise — making top-tier professional output accessible to every company, student, and individual.

---

## TABLE OF CONTENTS

1. [Vision & Market Position](#1-vision--market-position)
2. [Platform Architecture](#2-platform-architecture)
3. [Core Platform Features](#3-core-platform-features-available-across-all-areas)
4. [The 30 High-Level Areas & Their Modules](#4-the-30-high-level-areas--their-modules)
5. [Expert Personas System](#5-expert-personas-system---this-is-me--add-expert)
6. [Dashboard & Analytics System](#6-dashboard--analytics-system)
7. [Review & Peer Review System](#7-review--peer-review-system)
8. [Communication & Branding Hub](#8-communication--branding-hub)
9. [Project System](#9-project-system)
10. [Skills Repository](#10-skills-repository)
11. [Prompt Builder & Module Creator](#11-prompt-builder--module-creator---build-your-own)
12. [AI Reasoning Transparency Toggle](#12-ai-reasoning-transparency-toggle)
13. [Implementation Roadmap](#13-implementation-roadmap)
14. [Technical Architecture Evolution](#14-technical-architecture-evolution-from-fcp-workbench)

---

## 1. VISION & MARKET POSITION

### The Problem
Every company today pays €200-500/hour to Big4 firms, Accenture, McKinsey, and specialist consultancies for work that follows established frameworks, regulatory interpretation, document creation, gap analysis, risk assessment, and strategic planning. The consultants themselves spend 40-60% of their time on research, structuring, and document production — work that AI can now do at 95%+ quality if properly guided.

Meanwhile, students and smaller companies are locked out of this expertise entirely due to cost barriers.

### The Solution: openEXPERT by ANTON
A modular, AI-powered platform where every user — from a Fortune 500 compliance officer to a university student — can access expert-grade reasoning, analysis, and deliverables across 30+ professional domains. The platform is the **first tool they interact with** before engaging expensive human experts, enabling them to:

- Produce top-notch material that is actionable and understandable
- Save 60-80% of the time currently spent on expert-dependent tasks
- Make informed decisions with professional-grade analysis
- Understand the reasoning behind every recommendation (transparency toggle)
- Build their own custom modules and workflows

### Target Market
- **Primary:** Companies currently spending on Big4, Accenture, McKinsey, specialist consultancies
- **Secondary:** Mid-size companies with limited access to expensive expert advice
- **Growth:** Students, academics, entrepreneurs, individuals wanting professional-grade output
- **Enterprise:** Banks, insurance companies, asset managers, payment institutions
- **Public sector:** Government agencies, supervisory authorities, municipalities

### Competitive Moat
1. **Domain-specific prompt engineering** — each module is fine-tuned by actual domain experts (not generic AI)
2. **Expert personas** — pre-built and customizable personas that add professional "flavour" to outputs
3. **Skills repository** — reusable, version-controlled skill sets that compound in value
4. **Interconnected modules** — outputs from one area feed naturally into others
5. **Transparency mode** — builds trust by explaining AI reasoning step-by-step
6. **Build Your Own** — users create custom modules, creating a long-tail of value

---

## 2. PLATFORM ARCHITECTURE

### Evolution from FCP Workbench
The existing FCP Workbench (CLAUDE.md spec) becomes **Area 1** within the broader openEXPERT platform. The core engine remains identical:

```
openEXPERT Platform
├── Core Engine (inherited from FCP Workbench)
│   ├── Knowledge Source System (4 modes)
│   ├── Output Format System (22+ formats)
│   ├── Claude API Integration (Opus 4.6 default)
│   ├── Export System (md/docx/xlsx/pdf/pptx)
│   ├── Session Management (SQLite)
│   └── File & Folder System
│
├── Platform Layer (NEW)
│   ├── Area Router — navigates between 30 domains
│   ├── Expert Persona Engine — applies persona context to any module
│   ├── Dashboard Engine — charts, peers, news, benchmarks
│   ├── Review Engine — multi-agent review workflows
│   ├── Communication Hub — branding, messaging, stakeholder comms
│   ├── Skills Repository — reusable prompt/workflow packages
│   ├── Prompt Builder — "Build Your Own Module"
│   ├── Transparency Layer — reasoning explanation toggle
│   ├── Project System — group sessions, docs, results
│   └── "This Is Me" Identity System — personal/professional context
│
├── Areas (30 domains)
│   ├── Area 1: Financial Crime Prevention (8 existing modules + expansion)
│   ├── Area 2: Legal & Regulatory
│   ├── Area 3: Audit & Assurance
│   ├── ...
│   └── Area 30: Personal Development & Career
│
└── Deployment
    ├── Local (current — laptop deployment)
    ├── Cloud (future — multi-tenant SaaS)
    └── Hybrid (enterprise — cloud platform, local data)
```

### Key Architectural Principle: Modular Inheritance
Every Area inherits the same core engine. Every Module within an Area gets:
- Knowledge Source Panel (4 modes)
- Output Format Selector (22+ formats, with area-specific additions)
- Claude API controls (thinking, creativity, model)
- Expert Persona selector
- Skills attachment
- Export system
- Session persistence
- Transparency toggle
- Review workflow option

What makes each Module unique:
- **System prompt** (the domain expertise)
- **Guided inputs** (what the user needs to specify)
- **Pre-selected defaults** (thinking level, output formats, knowledge sources)
- **Area-specific output formats** (e.g., "Legal Brief" for Legal, "Audit Report" for Audit)
- **Recommended personas** (which expert perspectives are most useful)

---

## 3. CORE PLATFORM FEATURES (Available Across All Areas)

### 3.1 AI Reasoning Transparency Toggle
**"Show Me How You Think"**

A global toggle (also overridable per-module) that adds an explanatory layer to every AI response. When enabled, ANTON explains:
- What information sources it used and why
- How it weighted different factors
- What assumptions it made
- Where it has high vs. low confidence
- What alternative conclusions it considered
- Why it structured the output the way it did

**Implementation:**
- Toggle adds system prompt instruction: "After each section/conclusion, add a collapsible 'Reasoning' block that explains your thought process, sources used, confidence level, and alternative interpretations considered."
- UI renders these as expandable accordion sections styled differently (subtle background, smaller font)
- Token impact indicator: "~30% more tokens when enabled"
- Can be toggled mid-conversation
- Three levels: Off / Summary reasoning / Detailed reasoning

**Why this matters:** Most users don't understand AI. This builds trust, enables learning, and makes outputs auditable. Regulators and boards need to understand HOW conclusions were reached, not just what they are.

### 3.2 "Build Your Own Module" — Prompt Builder
**"I Did Something Great, Let Me Save It"**

After a successful work session, users can:
1. Click "Save as Module" button
2. ANTON automatically extracts: the system prompt used, knowledge source configuration, output format selection, the conversation flow (what questions were asked, in what order), persona configuration
3. User names and describes the module
4. Optionally edits/refines the auto-generated prompt
5. Module appears in their personal module library
6. Can be shared with team/organization or made public

**Advanced Prompt Builder:**
- Step-by-step wizard for creating modules from scratch
- Test playground to iterate on prompts
- Version history for prompts
- A/B testing capability (run same input through two prompt versions)
- Community-contributed module marketplace (future)

### 3.3 Skills Repository
**"Attach Expertise to Any Task"**

Skills are reusable packages of expertise that can be attached to any module or session:

```
Skill Package Structure:
├── skill.json          # Metadata: name, domain, version, author
├── system-prompt.md    # The skill's system prompt additions
├── knowledge/          # Reference documents the skill brings
├── examples/           # Few-shot examples for the AI
└── output-templates/   # Custom output format definitions
```

**Pre-built skills include:**
- "Swedish Regulatory Language" — writes in FI's preferred style
- "Board Communication" — executive-appropriate tone and structure
- "Technical-to-Non-Technical Translation" — explains complex topics simply
- "Academic Writing" — APA/Harvard citations, formal structure
- "Persuasive Business Case" — ROI-focused, decision-oriented
- "Risk-Based Thinking" — applies risk frameworks to any topic
- "Data Storytelling" — turns numbers into narratives
- "Socratic Teaching" — asks questions instead of giving answers
- Users create and share their own skills

### 3.4 "This Is Me" — Identity & Context System
**Personal knowledge that follows you everywhere**

Two components:

**A) Manual Profile ("Tell ANTON About Yourself"):**
- Name, role, company, industry, sector
- Expertise areas and experience level
- Communication preferences (formal/casual, detail level, language)
- Team context (who you work with, reporting structure)
- Company context (size, jurisdiction, regulatory status)
- What you're working on right now

**B) Pre-built Expert Personas (for discussion flavour):**
These are characters you can "invite" into your work session. Each brings a distinct perspective:

| Persona | Profile | Adds to Discussion |
|---------|---------|-------------------|
| **Daniel** | Senior FCP consultant, AMLR implementation expert, practical project mindset | Implementation pragmatism, "what does this mean Monday morning?" |
| **Fredrik** | PhD in Mathematics/ML, data scientist, quantitative thinker | Statistical rigor, model validation, "show me the data" |
| **Sara** | FCP modelling expert, risk assessment specialist | Model frameworks, risk quantification, scenario analysis |
| **Amanda** | Legal counsel, regulatory interpretation | Legal precision, regulatory text analysis, "what does the law actually say?" |
| **Björn** | Software developer, systems architect | Technical feasibility, "can we actually build this?", data flows |
| **Adrian** | Finance professional, investment analysis | Financial modelling, cost-benefit, ROI, market analysis |
| **Hugo** | Brand designer, visual communication | Design thinking, visual clarity, audience engagement |
| **Maria** | Project manager, delivery excellence | Timelines, dependencies, stakeholder management, risk mitigation |
| **Erik** | Board advisor, governance expert | Strategic oversight, "what would the board ask?", governance |
| **Li** | Data engineer, data quality specialist | Data architecture, ETL, data governance, "where does the data live?" |
| **Nadia** | UX researcher, customer experience | User needs, journey mapping, "what does the customer actually want?" |
| **Oscar** | Auditor, assurance specialist | Control frameworks, evidence requirements, "prove it" |
| **Custom** | User-defined persona | Whatever perspective the user needs |

**How it works in practice:**
User selects Daniel + Amanda + Oscar for a CDD policy review. ANTON receives a combined system prompt that includes all three perspectives, producing output that is practically implementable (Daniel), legally precise (Amanda), and audit-ready (Oscar).

### 3.5 Project System
**"Everything in one place"**

Projects group related work together:
- Named project with description and team members
- All sessions within the project are linked
- Documents uploaded to the project are available across all sessions
- Project-level knowledge sources (always loaded)
- Project dashboard showing progress, sessions, outputs
- Export entire project as a bundled deliverable
- Project templates for common engagement types
- Version history across all project documents

---

## 4. THE 30 HIGH-LEVEL AREAS & THEIR MODULES

### Naming Convention
Each area has a code, icon, and color accent for visual navigation.

---

### AREA 1: FINANCIAL CRIME PREVENTION (FCP)
**Code:** FCP | **Icon:** Shield | **Color:** Teal (#2DD4A8)  
**Status:** ✅ Built (FCP Workbench — 8 modules operational)

*The original. Proven. Production-ready.*

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 1.1 | AMLR Gap Analysis | AI-assisted regulatory gap assessment with scoring matrix | investigate | strict |
| 1.2 | Document Creation | Policy documents, procedures, governance frameworks, board reports | think_hard | balanced |
| 1.3 | Sanctions Advisory | Regime briefings, screening assessment, policy review, incident response | think_hard | strict |
| 1.4 | Regulatory Monitor | Analyse new regulations, guidelines, consultation papers | think | balanced |
| 1.5 | Training Content Creator | AML/CFT training for board, compliance, front-line, operations | think | creative |
| 1.6 | AMLA Data Management | Data readiness assessment, 176+ data point analysis, reporting prep | investigate | strict |
| 1.7 | Risk Assessment Support | BWRA, customer risk assessment, product risk evaluation | think_hard | balanced |
| 1.8 | Investigation & Case Support | Structure SAR analysis, case management support, pattern identification | think_hard | strict |
| 1.9 | Maturity & Capability Assessment | Organisational AML maturity scoring, benchmarking, roadmapping | think_hard | balanced |
| 1.10 | Regulatory Response Drafter | Draft responses to supervisory findings, remediation plans | think_hard | strict |
| 1.11 | Compliance Calendar | Track regulatory deadlines, consultation periods, implementation dates | think | strict |
| 1.12 | Transaction Monitoring Design | TM rule design, scenario analysis, threshold optimization | investigate | balanced |

---

### AREA 2: LEGAL & REGULATORY
**Code:** LEG | **Icon:** Scale/Balance | **Color:** Navy Blue (#1E3A5F)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 2.1 | Regulatory Interpretation | Analyse regulatory text, compare versions, identify obligations | investigate | strict |
| 2.2 | Contract Review & Analysis | Review contracts for risks, missing clauses, compliance issues | think_hard | strict |
| 2.3 | Legal Brief Creator | Draft legal memoranda, opinions, briefs with proper citations | think_hard | strict |
| 2.4 | Compliance Framework Builder | Design compliance programs, policy hierarchies, control frameworks | think_hard | balanced |
| 2.5 | Regulatory Change Impact | Assess how new regulation affects existing operations | investigate | balanced |
| 2.6 | GDPR & Data Privacy | Privacy impact assessments, DPIA, data mapping, consent analysis | think_hard | strict |
| 2.7 | Corporate Governance | Board packs, governance structures, committee terms of reference | think_hard | balanced |
| 2.8 | Dispute Resolution Support | Case analysis, argument structuring, settlement evaluation | investigate | balanced |
| 2.9 | Licensing & Authorization | Application support, regulatory filings, license compliance | think_hard | strict |
| 2.10 | Legal Research Assistant | Research case law, regulatory history, comparative law analysis | investigate | strict |

---

### AREA 3: AUDIT & ASSURANCE
**Code:** AUD | **Icon:** Clipboard Check | **Color:** Deep Purple (#6B21A8)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 3.1 | Audit Planning | Risk-based audit plans, scope definition, resource allocation | think_hard | balanced |
| 3.2 | Control Testing Design | Design test procedures, sampling methods, evidence requirements | think_hard | strict |
| 3.3 | Finding & Observation Writer | Draft audit findings with root cause analysis and recommendations | think_hard | strict |
| 3.4 | Internal Audit Report | Complete audit reports with executive summary and action plans | think_hard | balanced |
| 3.5 | SOX / ISAE Compliance | Control documentation, testing frameworks, compliance matrices | investigate | strict |
| 3.6 | Follow-Up Tracker | Track remediation progress, validate closure evidence | think | strict |
| 3.7 | Quality Assurance Review | QA review of audit work, methodology compliance checking | think_hard | strict |
| 3.8 | Risk Assessment (Audit Universe) | Annual risk assessment, audit universe prioritization | think_hard | balanced |
| 3.9 | Continuous Auditing Design | Design automated monitoring, analytics-based audit approaches | investigate | balanced |
| 3.10 | Regulatory Exam Preparation | Prepare for supervisory examinations, mock audit readiness | think_hard | strict |

---

### AREA 4: CLIENT ENGAGEMENT & CONSULTING
**Code:** CON | **Icon:** Handshake | **Color:** Gold (#D4A72D)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 4.1 | Proposal Generator | Client proposals with scope, approach, timeline, pricing framework | think_hard | balanced |
| 4.2 | Engagement Letter Drafter | Formal engagement letters, SoW, terms & conditions | think_hard | strict |
| 4.3 | Client Discovery Workshop | Structured discovery questions, needs assessment frameworks | think | creative |
| 4.4 | Deliverable Structuring | Plan deliverable packages, milestones, quality gates | think_hard | balanced |
| 4.5 | Post-Engagement Review | Lessons learned, client feedback analysis, improvement planning | think | balanced |
| 4.6 | Stakeholder Mapping | Identify and map stakeholders, influence dynamics, engagement strategy | think | creative |
| 4.7 | Change Management Planning | Change impact assessment, communication plans, resistance strategies | think_hard | balanced |
| 4.8 | Workshop & Meeting Facilitator | Design workshops, create agendas, structure facilitated discussions | think | creative |

---

### AREA 5: BANKING & FINANCIAL SERVICES
**Code:** BNK | **Icon:** Landmark/Bank | **Color:** Dark Green (#0D5C3F)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 5.1 | Credit Risk Analysis | Loan assessment, credit scoring analysis, portfolio risk | think_hard | strict |
| 5.2 | Product Development | New product assessment, regulatory implications, market analysis | think_hard | balanced |
| 5.3 | Operational Risk Assessment | Operational risk identification, control mapping, incident analysis | think_hard | balanced |
| 5.4 | Capital Adequacy (Pillar 2/3) | ICAAP/ILAAP support, stress testing analysis, capital planning | investigate | strict |
| 5.5 | Payment Services Regulation | PSD2/PSD3 compliance, open banking, payment licensing | think_hard | strict |
| 5.6 | Consumer Protection | Conduct risk, fair treatment analysis, complaint handling | think_hard | balanced |
| 5.7 | Outsourcing & Third Party Risk | Outsourcing risk assessment, vendor due diligence, concentration risk | think_hard | balanced |
| 5.8 | Recovery & Resolution Planning | Recovery plans, resolution strategies, critical function identification | investigate | strict |
| 5.9 | ESG in Banking | Sustainable finance regulation, ESG risk integration, taxonomy alignment | think_hard | balanced |
| 5.10 | Digital Assets & Crypto | MiCA compliance, crypto-asset classification, DeFi risk assessment | investigate | balanced |

---

### AREA 6: INVESTMENT & ASSET MANAGEMENT
**Code:** INV | **Icon:** TrendingUp | **Color:** Emerald (#047857)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 6.1 | Investment Analysis | Company/fund analysis, valuation frameworks, risk-return assessment | investigate | balanced |
| 6.2 | Portfolio Review | Portfolio composition analysis, rebalancing recommendations | think_hard | balanced |
| 6.3 | Fund Due Diligence | Fund selection analysis, manager evaluation, operational DD | investigate | strict |
| 6.4 | Market Research & Outlook | Sector analysis, macro trends, market commentary | think | creative |
| 6.5 | Regulatory Compliance (MiFID/AIFMD) | Investment regulation compliance, best execution analysis | think_hard | strict |
| 6.6 | Risk Modelling Support | VaR analysis, stress testing, scenario modelling documentation | investigate | strict |
| 6.7 | Client Reporting | Performance reports, investment letters, attribution analysis | think_hard | balanced |
| 6.8 | ESG & Impact Investing | ESG scoring, impact measurement, sustainability reporting | think_hard | balanced |

---

### AREA 7: INSURANCE
**Code:** INS | **Icon:** Shield + Heart | **Color:** Sky Blue (#0284C7)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 7.1 | Solvency II Compliance | SCR/MCR analysis, ORSA documentation, regulatory reporting | investigate | strict |
| 7.2 | Claims Analysis | Claims pattern analysis, fraud indicators, reserve adequacy | think_hard | balanced |
| 7.3 | Product Governance | Product design review, target market analysis, value assessment | think_hard | balanced |
| 7.4 | Underwriting Support | Risk assessment support, pricing factors, exclusion analysis | think_hard | strict |
| 7.5 | IDD Compliance | Insurance distribution regulation, disclosure requirements | think_hard | strict |
| 7.6 | Actuarial Communication | Translate actuarial analysis for non-technical stakeholders | think | creative |
| 7.7 | Reinsurance Review | Treaty analysis, reinsurance optimization, counterparty risk | investigate | balanced |

---

### AREA 8: RISK MANAGEMENT (ENTERPRISE)
**Code:** RSK | **Icon:** AlertTriangle | **Color:** Amber (#D97706)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 8.1 | Enterprise Risk Assessment | Top-down risk identification, heat maps, risk appetite definition | think_hard | balanced |
| 8.2 | Risk Register Management | Maintain risk registers, track risk evolution, escalation workflows | think | strict |
| 8.3 | Scenario Analysis | Design stress scenarios, assess impacts, develop response plans | investigate | balanced |
| 8.4 | Business Continuity Planning | BCP/DR planning, critical function identification, test scenarios | think_hard | balanced |
| 8.5 | Incident & Crisis Management | Incident response frameworks, crisis communication, post-mortem | think_hard | balanced |
| 8.6 | Risk Reporting | Board risk reports, KRI dashboards, trend analysis | think_hard | balanced |
| 8.7 | Model Risk Management | Model inventory, validation frameworks, model risk assessment | investigate | strict |
| 8.8 | Emerging Risk Identification | Horizon scanning, trend analysis, early warning indicators | think | creative |

---

### AREA 9: CYBERSECURITY & INFORMATION SECURITY
**Code:** SEC | **Icon:** Lock | **Color:** Red (#DC2626)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 9.1 | Security Policy Framework | Information security policies, standards, procedures | think_hard | strict |
| 9.2 | Threat Assessment | Threat landscape analysis, vulnerability prioritization | investigate | balanced |
| 9.3 | DORA Compliance | Digital Operational Resilience Act implementation | think_hard | strict |
| 9.4 | NIS2 Compliance | Network & Information Security directive implementation | think_hard | strict |
| 9.5 | Incident Response Planning | IR playbooks, tabletop exercise design, communication templates | think_hard | balanced |
| 9.6 | Third Party Security Assessment | Vendor security evaluation, supply chain risk | think_hard | strict |
| 9.7 | Security Awareness Training | Employee training content, phishing simulations, security culture | think | creative |
| 9.8 | Penetration Test Interpretation | Translate pentest findings into business risk and action plans | think_hard | balanced |

---

### AREA 10: DATA & ANALYTICS
**Code:** DAT | **Icon:** Database | **Color:** Cyan (#0891B2)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 10.1 | Data Quality Assessment | Data profiling, quality metrics, remediation planning | think_hard | strict |
| 10.2 | Data Governance Framework | Data ownership models, stewardship programs, policy creation | think_hard | balanced |
| 10.3 | Data Mapping & Lineage | Map data flows, identify dependencies, document lineage | investigate | strict |
| 10.4 | Analytics Use Case Design | Define analytics opportunities, data requirements, success metrics | think_hard | creative |
| 10.5 | Data Privacy Engineering | Privacy by design, anonymization strategies, consent architecture | think_hard | strict |
| 10.6 | Migration Planning | Data migration strategy, validation frameworks, rollback plans | think_hard | balanced |
| 10.7 | Master Data Management | MDM strategy, golden record design, matching/merging rules | investigate | balanced |
| 10.8 | Reporting Architecture | Design reporting frameworks, KPI hierarchies, dashboard specs | think_hard | balanced |

---

### AREA 11: PROJECT MANAGEMENT & DELIVERY
**Code:** PMO | **Icon:** Kanban | **Color:** Indigo (#4F46E5)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 11.1 | Project Planning | WBS creation, timeline estimation, resource allocation, dependencies | think_hard | balanced |
| 11.2 | Standup & Status Reporter | Generate standup summaries, status reports, progress dashboards | think | strict |
| 11.3 | Risk & Issue Management | Project risk identification, mitigation strategies, issue tracking | think_hard | balanced |
| 11.4 | Stakeholder Communication | Status updates, steering committee packs, escalation briefs | think | balanced |
| 11.5 | Retrospective Facilitator | Sprint/project retrospectives, action item generation | think | creative |
| 11.6 | Task Delegation Assistant | Break down work, assign based on skills, track completion | think | balanced |
| 11.7 | Budget & Resource Tracking | Budget variance analysis, forecast updates, resource optimization | think | strict |
| 11.8 | Timeline Reviewer & Optimizer | Review plan feasibility, identify bottlenecks, suggest optimization | think_hard | balanced |
| 11.9 | Meeting Notes & Action Items | Transform meeting notes into structured action items with owners | think | strict |
| 11.10 | Dependency Mapper | Identify cross-team dependencies, critical path analysis | think_hard | balanced |

---

### AREA 12: EDUCATION & TEACHING
**Code:** EDU | **Icon:** GraduationCap | **Color:** Orange (#EA580C)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 12.1 | Lesson Plan Creator | Structured lesson plans with objectives, activities, assessment | think | creative |
| 12.2 | Curriculum Designer | Course structure, learning pathways, competency mapping | think_hard | creative |
| 12.3 | Assessment Builder | Create exams, quizzes, rubrics, grading criteria | think_hard | balanced |
| 12.4 | Student Feedback Generator | Personalized feedback on student work, improvement suggestions | think | creative |
| 12.5 | Research Paper Assistant | Literature review support, methodology design, argument structuring | investigate | balanced |
| 12.6 | Adaptive Learning Content | Content at multiple difficulty levels, differentiated instruction | think | creative |
| 12.7 | Educational Material Translator | Translate academic content between complexity levels | think | creative |
| 12.8 | Case Study Creator | Design case studies for business schools, professional training | think_hard | creative |

---

### AREA 13: ACCOUNTING & TAX
**Code:** TAX | **Icon:** Calculator | **Color:** Forest Green (#166534)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 13.1 | Financial Statement Analysis | Ratio analysis, trend identification, peer comparison | think_hard | strict |
| 13.2 | Tax Planning Advisory | Tax optimization strategies, regulatory compliance, cross-border | think_hard | strict |
| 13.3 | IFRS/GAAP Application | Accounting standard interpretation, treatment analysis | investigate | strict |
| 13.4 | Transfer Pricing Documentation | TP policy, benchmarking analysis, documentation requirements | think_hard | strict |
| 13.5 | Consolidation Support | Group consolidation issues, intercompany elimination, currency | think_hard | strict |
| 13.6 | Management Reporting | Design management accounts, KPI frameworks, variance analysis | think_hard | balanced |
| 13.7 | Year-End Close Support | Close procedures, journal entry review, disclosure checklists | think | strict |

---

### AREA 14: HUMAN RESOURCES & PEOPLE
**Code:** HRP | **Icon:** Users | **Color:** Rose (#E11D48)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 14.1 | Job Description Creator | Role definition, competency requirements, grading alignment | think | balanced |
| 14.2 | Interview Framework | Competency-based interview questions, scoring guides | think | balanced |
| 14.3 | Performance Review Support | Review templates, feedback structuring, development planning | think | balanced |
| 14.4 | Learning & Development Planning | Training needs analysis, development program design | think_hard | creative |
| 14.5 | HR Policy Creation | Employment policies, code of conduct, handbook development | think_hard | strict |
| 14.6 | Compensation & Benefits Analysis | Benchmarking, pay equity analysis, benefits comparison | think_hard | balanced |
| 14.7 | Employee Engagement | Survey design, results analysis, action planning | think | creative |
| 14.8 | Organizational Design | Structure optimization, role mapping, operating model design | think_hard | balanced |

---

### AREA 15: BRANDING & CREATIVE
**Code:** BRN | **Icon:** Palette | **Color:** Fuchsia (#C026D3)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 15.1 | Brand Strategy | Brand positioning, value proposition, competitive differentiation | think_hard | creative |
| 15.2 | Content Strategy | Content calendar, audience mapping, channel strategy | think | creative |
| 15.3 | Copywriting Assistant | Headlines, taglines, website copy, social media content | think | creative |
| 15.4 | Visual Identity Brief | Brand guidelines, style guide specifications, design briefs | think | creative |
| 15.5 | Campaign Planning | Campaign structure, messaging hierarchy, media planning | think_hard | creative |
| 15.6 | Social Media Strategy | Platform strategy, content mix, engagement tactics, analytics | think | creative |
| 15.7 | Press Release & PR | Media communications, press releases, spokesperson briefs | think | balanced |
| 15.8 | Presentation Design Brief | Slide structure, narrative arc, visual direction, speaker notes | think | creative |

---

### AREA 16: SOFTWARE ENGINEERING & CODE
**Code:** DEV | **Icon:** Code | **Color:** Green (#16A34A)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 16.1 | Code Review & Explanation | Review code quality, explain logic, identify issues | think_hard | strict |
| 16.2 | Architecture Design | System architecture, design patterns, technology selection | investigate | balanced |
| 16.3 | API Design & Documentation | API design review, OpenAPI specs, documentation generation | think_hard | balanced |
| 16.4 | Bug Analysis & Resolution | Analyse error logs, suggest fixes, explain root causes | think_hard | strict |
| 16.5 | Technical Documentation | README, architecture docs, runbooks, onboarding guides | think | balanced |
| 16.6 | End Goal Translator | Translate business requirements into technical specifications | think_hard | balanced |
| 16.7 | Testing Strategy | Test plan design, test case generation, coverage analysis | think_hard | balanced |
| 16.8 | DevOps & CI/CD Planning | Pipeline design, deployment strategy, monitoring setup | think_hard | balanced |
| 16.9 | Code Migration Assistant | Language/framework migration planning, compatibility analysis | investigate | balanced |
| 16.10 | Security Code Review | OWASP compliance, vulnerability identification, secure coding | think_hard | strict |

---

### AREA 17: STRATEGY & BUSINESS DEVELOPMENT
**Code:** STR | **Icon:** Target | **Color:** Slate (#475569)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 17.1 | Market Analysis | Market sizing, competitive landscape, trend analysis | investigate | balanced |
| 17.2 | Business Case Builder | ROI analysis, cost-benefit, investment case structuring | think_hard | balanced |
| 17.3 | Strategic Planning | Strategy formulation, OKR definition, roadmap creation | think_hard | balanced |
| 17.4 | Competitive Intelligence | Competitor analysis, SWOT, positioning assessment | think_hard | balanced |
| 17.5 | M&A Due Diligence Support | Target analysis, synergy assessment, integration planning | investigate | strict |
| 17.6 | Business Model Design | Business model canvas, revenue model analysis, pivot planning | think_hard | creative |
| 17.7 | Board Strategy Pack | Board-ready strategy documents, decision memos, scenario analysis | think_hard | balanced |
| 17.8 | Innovation & Ideation | Structured brainstorming, idea evaluation, prototyping briefs | think | creative |

---

### AREA 18: ENVIRONMENT, SUSTAINABILITY & ESG
**Code:** ESG | **Icon:** Leaf | **Color:** Lime (#65A30D)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 18.1 | ESG Reporting (CSRD/ESRS) | Sustainability reporting, double materiality, ESRS standards | investigate | strict |
| 18.2 | EU Taxonomy Alignment | Taxonomy eligibility & alignment assessment, documentation | think_hard | strict |
| 18.3 | Carbon Footprint Analysis | Scope 1/2/3 calculation support, reduction pathway planning | think_hard | balanced |
| 18.4 | Climate Risk Assessment | Physical and transition risk analysis, scenario planning | investigate | balanced |
| 18.5 | Biodiversity Impact Assessment | Nature-related risk identification, TNFD framework application | think_hard | balanced |
| 18.6 | Sustainable Finance Framework | Green bond frameworks, sustainability-linked instruments | think_hard | strict |
| 18.7 | Greenwashing Risk Review | Review sustainability claims, identify greenwashing risks | think_hard | strict |
| 18.8 | Supply Chain Sustainability | Supply chain mapping, CSDDD compliance, social risk assessment | think_hard | balanced |

---

### AREA 19: PROCUREMENT & SUPPLY CHAIN
**Code:** PRC | **Icon:** Truck | **Color:** Brown (#92400E)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 19.1 | Vendor Evaluation | Supplier assessment frameworks, scoring matrices, selection criteria | think_hard | balanced |
| 19.2 | RFP/RFI Creator | Request for proposal/information drafting, evaluation frameworks | think_hard | balanced |
| 19.3 | Contract Negotiation Support | Negotiation preparation, fallback positions, BATNA analysis | think_hard | balanced |
| 19.4 | Spend Analysis | Category analysis, savings identification, benchmarking | think_hard | balanced |
| 19.5 | Supply Chain Risk Management | Supply chain mapping, disruption scenarios, resilience planning | think_hard | balanced |
| 19.6 | Procurement Policy | Procurement procedures, approval frameworks, delegation of authority | think_hard | strict |

---

### AREA 20: OPERATIONS & PROCESS IMPROVEMENT
**Code:** OPS | **Icon:** Cogs | **Color:** Steel (#64748B)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 20.1 | Process Mapping & Documentation | Process flows, RACI matrices, standard operating procedures | think_hard | balanced |
| 20.2 | Lean / Six Sigma Analysis | Waste identification, process optimization, value stream mapping | think_hard | balanced |
| 20.3 | Automation Assessment | Identify automation opportunities, ROI estimation, priority ranking | think_hard | balanced |
| 20.4 | Quality Management | QMS design, ISO 9001 support, quality metrics | think_hard | strict |
| 20.5 | Capacity Planning | Resource modelling, bottleneck identification, scaling plans | think_hard | balanced |
| 20.6 | KPI Framework Design | Define KPIs, measurement methodology, reporting cadence | think_hard | balanced |

---

### AREA 21: SALES & CUSTOMER SUCCESS
**Code:** SAL | **Icon:** Megaphone | **Color:** Orange-Red (#EA580C)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 21.1 | Sales Strategy | Territory planning, account strategy, pipeline management | think_hard | balanced |
| 21.2 | Pitch Deck Creator | Investor/sales pitch presentations, value proposition design | think_hard | creative |
| 21.3 | Customer Success Planning | Onboarding plans, health scoring, expansion strategies | think | balanced |
| 21.4 | Win/Loss Analysis | Deal analysis, competitive loss patterns, win factors | think_hard | balanced |
| 21.5 | Objection Handling Guide | Common objections, response frameworks, proof points | think | balanced |
| 21.6 | CRM Data Analysis | Pipeline analysis, conversion metrics, forecast accuracy | think_hard | balanced |

---

### AREA 22: COMMUNICATION & STAKEHOLDER MANAGEMENT
**Code:** COM | **Icon:** MessageSquare | **Color:** Violet (#7C3AED)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 22.1 | Internal Communication | Employee communications, town hall scripts, newsletter content | think | creative |
| 22.2 | External Communication | Press releases, stakeholder updates, regulatory communications | think_hard | balanced |
| 22.3 | Crisis Communication | Crisis comms plans, holding statements, Q&A preparation | think_hard | strict |
| 22.4 | Regulatory Communication | Draft responses to regulators, explain findings, propose remediation | think_hard | strict |
| 22.5 | Customer Communication | Product launches, service changes, complaint responses | think | balanced |
| 22.6 | Investor Relations | Earnings narratives, investor presentations, shareholder letters | think_hard | balanced |
| 22.7 | Tone & Voice Calibration | Review communications for tone, inclusivity, clarity, brand alignment | think | balanced |

---

### AREA 23: PERSONAL FINANCE & WEALTH
**Code:** PFI | **Icon:** Wallet | **Color:** Gold (#B45309)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 23.1 | Budget Planning | Personal/household budget creation, expense analysis | think | balanced |
| 23.2 | Investment Education | Explain investment concepts, compare products, risk profiling | think | creative |
| 23.3 | Mortgage & Loan Analysis | Compare loan terms, amortization planning, refinancing analysis | think_hard | strict |
| 23.4 | Retirement Planning | Pension projections, savings gap analysis, drawdown strategy | think_hard | balanced |
| 23.5 | Tax Return Preparation | Tax deduction identification, documentation checklists | think | strict |
| 23.6 | Insurance Review | Coverage gap analysis, policy comparison, needs assessment | think | balanced |

---

### AREA 24: REAL ESTATE & PROPERTY
**Code:** REA | **Icon:** Home | **Color:** Warm Gray (#78716C)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 24.1 | Property Analysis | Location analysis, price assessment, comparable analysis | think_hard | balanced |
| 24.2 | Due Diligence (Real Estate) | Property due diligence checklists, risk identification | think_hard | strict |
| 24.3 | Lease Analysis | Lease term review, rent escalation analysis, tenant evaluation | think_hard | strict |
| 24.4 | Development Feasibility | Project feasibility studies, cost estimation, market demand | investigate | balanced |
| 24.5 | Property Management Planning | Maintenance planning, budget creation, tenant communication | think | balanced |

---

### AREA 25: HEALTHCARE & LIFE SCIENCES
**Code:** HLS | **Icon:** Heart/Pulse | **Color:** Teal-Blue (#0D9488)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 25.1 | Regulatory Submission Support | EMA/FDA filing support, dossier structuring, gap analysis | investigate | strict |
| 25.2 | Clinical Trial Documentation | Protocol support, ICF drafting, study report structuring | think_hard | strict |
| 25.3 | Pharmacovigilance | QPPV support, signal detection analysis, PSMF documentation | think_hard | strict |
| 25.4 | Medical Writing | Medical communications, abstracts, manuscripts, patient info | think_hard | balanced |
| 25.5 | GxP Compliance | GMP/GDP/GLP compliance assessment, audit preparation | think_hard | strict |
| 25.6 | Health Economics (HTA) | HTA submissions, cost-effectiveness analysis, value dossier | investigate | balanced |

---

### AREA 26: NONPROFIT & SOCIAL IMPACT
**Code:** NPO | **Icon:** Heart | **Color:** Warm Orange (#F97316)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 26.1 | Grant Writing | Proposal writing, budget justification, impact narratives | think_hard | creative |
| 26.2 | Impact Measurement | Theory of change, logic models, outcome measurement frameworks | think_hard | balanced |
| 26.3 | Donor Communication | Annual reports, impact stories, donor stewardship materials | think | creative |
| 26.4 | Board Governance (Nonprofit) | Board development, governance structures, committee charters | think_hard | balanced |
| 26.5 | Program Design | Program logic, implementation plans, evaluation frameworks | think_hard | balanced |
| 26.6 | Fundraising Strategy | Campaign planning, donor segmentation, engagement strategy | think_hard | creative |

---

### AREA 27: GOVERNMENT & PUBLIC SECTOR
**Code:** GOV | **Icon:** Building | **Color:** Dark Slate (#334155)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 27.1 | Policy Analysis | Policy impact assessment, options appraisal, recommendation briefs | investigate | balanced |
| 27.2 | Public Consultation Response | Draft responses to public consultations, position papers | think_hard | balanced |
| 27.3 | Procurement (Public Sector) | Public procurement documents, evaluation criteria, compliance | think_hard | strict |
| 27.4 | Freedom of Information | FOI response drafting, redaction guidance, exemption analysis | think_hard | strict |
| 27.5 | Regulatory Impact Assessment | RIA documentation, cost-benefit analysis, stakeholder mapping | investigate | balanced |
| 27.6 | Service Design | Citizen journey mapping, service blueprints, digital transformation | think_hard | creative |

---

### AREA 28: ENTREPRENEURSHIP & STARTUPS
**Code:** ENT | **Icon:** Rocket | **Color:** Electric Blue (#2563EB)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 28.1 | Business Plan Creator | Complete business plans, financial projections, market validation | think_hard | balanced |
| 28.2 | Investor Pitch | Pitch narrative, deck structure, financial story, objection prep | think_hard | creative |
| 28.3 | Product-Market Fit Analysis | Customer validation, problem-solution fit, pivot assessment | think_hard | creative |
| 28.4 | Startup Legal Setup | Entity selection, shareholder agreements, IP protection basics | think_hard | strict |
| 28.5 | Growth Strategy | Growth frameworks, channel strategy, unit economics | think_hard | balanced |
| 28.6 | Funding Strategy | Funding options, term sheet analysis, valuation approaches | think_hard | balanced |

---

### AREA 29: ACADEMIC & RESEARCH
**Code:** RES | **Icon:** BookOpen | **Color:** Burgundy (#881337)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 29.1 | Literature Review | Systematic literature search, gap identification, synthesis | investigate | balanced |
| 29.2 | Research Methodology Design | Research design, methodology selection, sampling strategy | think_hard | balanced |
| 29.3 | Academic Paper Structuring | Paper outline, argument flow, section drafting support | think_hard | balanced |
| 29.4 | Statistical Analysis Interpretation | Explain statistical results, visualize findings, discuss limitations | think_hard | balanced |
| 29.5 | Thesis/Dissertation Planning | Timeline, chapter structure, supervisor communication | think_hard | balanced |
| 29.6 | Peer Review Support | Structure peer review feedback, identify methodology strengths/gaps | think_hard | strict |
| 29.7 | Citation & Reference Management | Citation formatting, bibliography generation, source evaluation | think | strict |

---

### AREA 30: PERSONAL DEVELOPMENT & CAREER
**Code:** PER | **Icon:** User/Star | **Color:** Pink (#DB2777)

| # | Module | Description | Thinking | Creativity |
|---|--------|-------------|----------|------------|
| 30.1 | CV & Resume Builder | Professional CV creation, achievement framing, ATS optimization | think | creative |
| 30.2 | Cover Letter Writer | Tailored cover letters, value proposition articulation | think | creative |
| 30.3 | Interview Preparation | Mock interviews, STAR responses, company research, question prep | think | balanced |
| 30.4 | Career Strategy | Career path planning, skill gap analysis, development roadmap | think_hard | balanced |
| 30.5 | Networking & Personal Brand | LinkedIn optimization, personal branding, networking strategy | think | creative |
| 30.6 | Learning Plan | Skill acquisition planning, resource curation, progress tracking | think | balanced |
| 30.7 | Negotiation Preparation | Salary/offer negotiation prep, BATNA analysis, value framing | think_hard | balanced |

---

## 5. EXPERT PERSONAS SYSTEM — "This Is Me" & "Add Expert"

### How Personas Work Technically
Each persona is a JSON profile that gets injected into the system prompt:

```json
{
  "id": "daniel",
  "name": "Daniel",
  "role": "Senior FCP Consultant",
  "expertise": ["AMLR implementation", "project management", "AI-assisted compliance"],
  "perspective": "Practical implementation. Always asks: what does this mean on Monday morning? Focuses on making things actionable and deliverable. Connects regulatory requirements to real-world operations.",
  "communication_style": "Direct, structured, pragmatic. Uses examples. Bridges technical and business language.",
  "questions_they_always_ask": [
    "How do we actually do this in practice?",
    "What's the first step on Monday morning?",
    "Who needs to be involved?",
    "What could go wrong?"
  ]
}
```

### Persona Categories for Future Expansion
- **Domain Experts** — deep knowledge in specific fields
- **Functional Roles** — CFO, CTO, CISO, Head of Compliance, etc.
- **Thinking Styles** — The Skeptic, The Optimist, The Devil's Advocate, The Simplifier
- **Audience Proxies** — "Explain this as if I'm a board member / a regulator / a customer / a journalist"

---

## 6. DASHBOARD & ANALYTICS SYSTEM

### Personal Dashboard
- **Usage stats:** Sessions this week, tokens used, cost tracking
- **Recent work:** Last 10 sessions with quick resume
- **Favorites:** Pinned modules and projects
- **Activity feed:** What colleagues in your team have been working on (optional, privacy-respecting)

### Domain Dashboards (per Area)
- **News feed:** Relevant regulatory/industry news (web search powered)
- **Peer benchmarking:** "You vs. peers" — how does your organization compare on key metrics
- **Regulatory timeline:** Upcoming deadlines, consultation periods, implementation dates
- **Charts & visualization:**
  - Sanctions: New sanctions vs. historical, new countries affected, entity types
  - Regulatory: New regulation vs. current framework, impact heat maps
  - Financial: Market trends, peer comparison charts
  - Compliance: Maturity scores over time, gap closure tracking

### Executive Dashboard
- **Cross-area view:** What's happening across all areas you're active in
- **Team productivity:** How the team is using ANTON (aggregate, not surveillance)
- **ROI tracker:** Estimated time/cost savings vs. traditional consulting
- **Risk indicators:** Flagged items requiring attention across projects

---

## 7. REVIEW & PEER REVIEW SYSTEM

### "Review My Work"
After producing a deliverable, users can send it through a multi-perspective review:

**Review Modes:**
1. **Expert Panel Review** — Select 2-4 personas (e.g., Regulator + Auditor + Board Member) who each review the document from their perspective
2. **Audience Accessibility Check** — "Is this understandable for technical / non-technical audiences?"
3. **Regulatory Compliance Review** — "Does this meet regulatory expectations?"
4. **Quality Assurance** — Completeness, consistency, accuracy, citations
5. **Red Team Review** — "What would a critic say? What are the weaknesses?"
6. **Plain Language Review** — "Is this clear to someone with no domain expertise?"

**Output of Review:**
Each reviewer provides:
- Overall assessment (🟢 Ready / 🟡 Minor issues / 🔴 Significant concerns)
- Specific comments on sections
- Suggested improvements
- Missing elements
- Strengths to keep

**Implementation:**
Sequential Claude API calls, each with a different reviewer persona system prompt. Results compiled into a structured review report.

---

## 8. COMMUNICATION & BRANDING HUB

A dedicated area for communication-focused work that spans all domains:

- **Audience Selector:** Who are you communicating with? (Board, Regulator, Customer, Employee, Investor, Media, Public)
- **Channel Selector:** How? (Email, Presentation, Report, Social media, Press release, Internal memo, Meeting brief)
- **Tone Calibration:** Formal ↔ Casual, Technical ↔ Accessible, Authoritative ↔ Collaborative
- **Brand Voice Check:** Ensure output aligns with your organization's brand guidelines (uploadable brand guide)
- **Message Testing:** Run your message through different audience personas to check reception
- **Translation Modes:** Same content adapted for different stakeholder groups

---

## 9. PROJECT SYSTEM

Projects serve as the central organizing unit:

```
Project: "AMLR Implementation — Nordea"
├── Settings (team, timeline, client context)
├── Knowledge Base (uploaded documents, registered folders)
├── Sessions
│   ├── Gap Analysis (Area 1, Module 1.1)
│   ├── Policy Drafts (Area 1, Module 1.2)
│   ├── Legal Review (Area 2, Module 2.1)
│   ├── Project Plan (Area 11, Module 11.1)
│   └── Board Presentation (Area 22, Module 22.6)
├── Deliverables
│   ├── Gap_Analysis_Report_v2.xlsx
│   ├── AML_Policy_Draft_v1.docx
│   └── Board_Update_Feb2026.pptx
├── Reviews
│   ├── Expert Panel Review — Gap Analysis
│   └── Regulatory Review — Policy Draft
└── Dashboard
    ├── Progress: 60% complete
    ├── Next deadline: March 15
    └── Open items: 12
```

---

## 10. SKILLS REPOSITORY

### Pre-Built Skill Packs (examples)

| Skill Pack | Description | Applies To |
|-----------|-------------|-----------|
| Swedish Regulatory Language | FI/Riksbanken communication style | FCP, Legal, Banking |
| EU Regulatory Navigator | Cross-reference EU directives & regulations | All regulatory areas |
| Board-Ready Communication | Executive tone, decision-focused structure | All areas |
| Academic Rigor | Proper citations, methodology, evidence-based | Research, Education |
| Startup Speed | Move fast, 80/20 thinking, MVP mindset | Entrepreneurship, Strategy |
| Data Storytelling | Turn numbers into narratives | Analytics, Finance, Reporting |
| Risk-Based Thinking | Apply risk frameworks to any topic | All areas |
| Socratic Method | Answer questions with better questions | Education, Coaching |
| Devil's Advocate | Challenge every assumption | Strategy, Risk, Audit |
| Visual Thinking | Describe things in visual/spatial terms | Branding, Architecture |
| Regulatory Examiner | Think like a supervisory authority | FCP, Banking, Insurance |
| Investor Lens | Evaluate everything through ROI | Finance, Strategy, Startups |

---

## 11. PROMPT BUILDER & MODULE CREATOR — "Build Your Own"

### The "Save This As A Module" Flow
1. Complete a successful work session
2. Click **"Save as Module"** button
3. ANTON extracts:
   - System prompt used (cleaned and generalized)
   - Knowledge source configuration
   - Output format selections
   - Conversation structure (the "recipe")
   - Persona configuration
   - Skills attached
4. User reviews and edits the auto-generated module
5. Names it, adds description, selects which Area it belongs to
6. Module appears in personal library
7. Optional: Share with team → organization → public marketplace

### The "Build From Scratch" Wizard
Step 1: **What problem does this solve?** (free text)  
Step 2: **Who is it for?** (audience selection)  
Step 3: **What should it produce?** (output format selection)  
Step 4: **What knowledge does it need?** (knowledge source config)  
Step 5: **How should it think?** (thinking level, creativity, personas)  
Step 6: **Write/refine the system prompt** (with AI assistance)  
Step 7: **Test it** (playground with sample inputs)  
Step 8: **Save and categorize**

---

## 12. AI REASONING TRANSPARENCY TOGGLE

### Three Levels

**Level 0: Off (Default for experienced users)**
- Standard output, no reasoning shown
- Fastest, lowest token cost

**Level 1: Summary Reasoning**
- After each major section, a collapsible block:
  > 💡 **How ANTON reached this conclusion:** Used 3 regulatory sources and 2 internal documents. High confidence on articles 28-30, moderate confidence on implementation timeline estimates. Considered alternative interpretation where CDD requirements could be phased, but regulatory text is clear on simultaneous application.

**Level 2: Detailed Reasoning**
- Step-by-step explanation:
  > 🔍 **Detailed Reasoning:**
  > 1. **Sources evaluated:** [list with relevance scores]
  > 2. **Key assumptions:** [explicit list]
  > 3. **Confidence assessment:** [per-claim]
  > 4. **Alternative interpretations considered:** [what else could this mean]
  > 5. **Why this structure:** [why the output is organized this way]
  > 6. **Limitations:** [what ANTON couldn't determine]

### Why This Is Critical
- Non-technical users need to understand WHY, not just WHAT
- Auditors and regulators require explainability
- Builds trust in AI-generated outputs
- Enables learning — users become better at their domain
- Reduces hallucination risk — makes it visible when AI is uncertain

---

## 13. IMPLEMENTATION ROADMAP

### Phase 1: Platform Foundation (Weeks 1-4)
*Extend FCP Workbench into openEXPERT shell*
- Area navigation system (sidebar → area → module)
- "This Is Me" identity system
- Expert Persona engine
- Transparency toggle (3 levels)
- Project system (basic)
- Dashboard shell

### Phase 2: Area Expansion — Wave 1 (Weeks 4-8)
*Launch 5 more areas based on existing Advisense expertise*
- Area 2: Legal & Regulatory
- Area 3: Audit & Assurance
- Area 4: Client Engagement & Consulting
- Area 5: Banking & Financial Services
- Area 8: Risk Management (Enterprise)

### Phase 3: Core Features Complete (Weeks 8-12)
- Review & Peer Review system
- Communication & Branding Hub
- Skills Repository (10 pre-built skills)
- "Build Your Own Module" (save from session)
- Dashboard with charts & news feeds
- Full project system with deliverables

### Phase 4: Area Expansion — Wave 2 (Weeks 12-20)
*Launch 10 more areas*
- Area 6: Investment & Asset Management
- Area 9: Cybersecurity & InfoSec
- Area 10: Data & Analytics
- Area 11: Project Management & Delivery
- Area 12: Education & Teaching
- Area 13: Accounting & Tax
- Area 15: Branding & Creative
- Area 16: Software Engineering & Code
- Area 17: Strategy & Business Development
- Area 18: Environment, Sustainability & ESG

### Phase 5: Area Expansion — Wave 3 (Weeks 20-30)
*Complete all 30 areas + marketplace*
- Remaining 15 areas
- Module marketplace (community sharing)
- Advanced prompt builder wizard
- Enterprise features (multi-tenant, SSO, audit trails)
- Advanced dashboards with peer benchmarking

### Phase 6: Scale & Ecosystem (Week 30+)
- Cloud deployment option
- API for integrations
- Mobile companion app
- Marketplace economy
- Partner program (domain experts contribute modules)

---

## 14. TECHNICAL ARCHITECTURE EVOLUTION (FROM FCP WORKBENCH)

### What Stays the Same
- React 18+ / TypeScript / Vite / Tailwind / shadcn/ui
- Express backend with Claude API proxy
- SQLite for local storage
- Knowledge Source System (4 modes)
- Output Format System
- Export pipeline (md/docx/xlsx/pdf)
- Session management
- File & folder system

### What Gets Added

**Frontend:**
```
src/
├── components/
│   ├── platform/                    # NEW: Platform-level components
│   │   ├── AreaNavigator.tsx        # Area selection & browsing
│   │   ├── PersonaSelector.tsx      # "Add Expert" persona picker
│   │   ├── IdentityPanel.tsx        # "This Is Me" profile editor
│   │   ├── TransparencyToggle.tsx   # Reasoning explanation controls
│   │   ├── SkillAttacher.tsx        # Attach skills to session
│   │   ├── ReviewLauncher.tsx       # "Review My Work" initiation
│   │   ├── ModuleSaver.tsx          # "Save as Module" flow
│   │   ├── DashboardWidgets/       # Charts, news, benchmarks
│   │   └── ProjectManager/         # Project CRUD, deliverables
│   │
│   ├── shared/                     # EXISTING: Enhanced
│   │   └── ... (all existing components)
│   │
│   └── modules/                    # EXPANDED: Dynamic module loader
│       └── DynamicModule.tsx       # Renders any module from config
│
├── areas/                          # NEW: Area-specific configs
│   ├── fcp/                        # Area 1 (existing modules migrate here)
│   │   ├── area.json               # Area metadata
│   │   └── modules/
│   │       ├── gap-analysis.json   # Module config
│   │       └── ...
│   ├── legal/                      # Area 2
│   ├── audit/                      # Area 3
│   └── ...
```

**Backend additions:**
```
server/
├── services/
│   ├── persona-engine.ts           # NEW: Persona prompt injection
│   ├── transparency-layer.ts       # NEW: Reasoning explanation
│   ├── review-engine.ts            # NEW: Multi-agent review
│   ├── skills-manager.ts           # NEW: Skill pack resolver
│   ├── dashboard-data.ts           # NEW: Charts, news, metrics
│   ├── module-factory.ts           # NEW: Dynamic module creation
│   └── project-manager.ts          # NEW: Project CRUD
│
├── personas/                       # NEW: Persona definitions
│   ├── daniel.json
│   ├── amanda.json
│   └── ...
│
├── skills/                         # NEW: Skill packs
│   ├── swedish-regulatory/
│   ├── board-communication/
│   └── ...
│
└── areas/                          # NEW: Area prompt templates
    ├── fcp/prompts/
    ├── legal/prompts/
    └── ...
```

### Key Design Decision: Config-Driven Modules
Instead of hard-coding each module as a React component (current approach), move to a **config-driven architecture** where modules are defined in JSON:

```json
{
  "id": "regulatory-interpretation",
  "area": "legal",
  "name": "Regulatory Interpretation",
  "description": "Analyse regulatory text, compare versions, identify obligations",
  "icon": "FileSearch",
  "defaults": {
    "thinking": "investigate",
    "creativity": "strict",
    "model": "claude-opus-4-6",
    "outputFormats": ["detailed-findings", "regulatory-comparison"],
    "knowledgeSources": {
      "claudeKnowledge": { "enabled": true, "webSearchEnabled": true },
      "localFolder": { "enabled": true }
    }
  },
  "guidedInputs": [
    { "id": "regulation", "type": "text", "label": "Which regulation?", "required": true },
    { "id": "jurisdiction", "type": "select", "label": "Jurisdiction", "options": ["EU", "Sweden", "Finland", "Denmark", "Norway"] },
    { "id": "comparison", "type": "boolean", "label": "Compare with previous version?" }
  ],
  "systemPrompt": "legal/regulatory-interpretation.md",
  "recommendedPersonas": ["amanda", "daniel"],
  "recommendedSkills": ["eu-regulatory-navigator"]
}
```

This means adding new modules is as simple as creating a JSON config + a system prompt markdown file. No code changes needed.

---

## APPENDIX: MODULE COUNT SUMMARY

| # | Area | Modules | Status |
|---|------|---------|--------|
| 1 | Financial Crime Prevention | 12 | ✅ Core 8 built |
| 2 | Legal & Regulatory | 10 | 🔲 Planned |
| 3 | Audit & Assurance | 10 | 🔲 Planned |
| 4 | Client Engagement & Consulting | 8 | 🔲 Planned |
| 5 | Banking & Financial Services | 10 | 🔲 Planned |
| 6 | Investment & Asset Management | 8 | 🔲 Planned |
| 7 | Insurance | 7 | 🔲 Planned |
| 8 | Risk Management (Enterprise) | 8 | 🔲 Planned |
| 9 | Cybersecurity & Information Security | 8 | 🔲 Planned |
| 10 | Data & Analytics | 8 | 🔲 Planned |
| 11 | Project Management & Delivery | 10 | 🔲 Planned |
| 12 | Education & Teaching | 8 | 🔲 Planned |
| 13 | Accounting & Tax | 7 | 🔲 Planned |
| 14 | Human Resources & People | 8 | 🔲 Planned |
| 15 | Branding & Creative | 8 | 🔲 Planned |
| 16 | Software Engineering & Code | 10 | 🔲 Planned |
| 17 | Strategy & Business Development | 8 | 🔲 Planned |
| 18 | Environment, Sustainability & ESG | 8 | 🔲 Planned |
| 19 | Procurement & Supply Chain | 6 | 🔲 Planned |
| 20 | Operations & Process Improvement | 6 | 🔲 Planned |
| 21 | Sales & Customer Success | 6 | 🔲 Planned |
| 22 | Communication & Stakeholder Mgmt | 7 | 🔲 Planned |
| 23 | Personal Finance & Wealth | 6 | 🔲 Planned |
| 24 | Real Estate & Property | 5 | 🔲 Planned |
| 25 | Healthcare & Life Sciences | 6 | 🔲 Planned |
| 26 | Nonprofit & Social Impact | 6 | 🔲 Planned |
| 27 | Government & Public Sector | 6 | 🔲 Planned |
| 28 | Entrepreneurship & Startups | 6 | 🔲 Planned |
| 29 | Academic & Research | 7 | 🔲 Planned |
| 30 | Personal Development & Career | 7 | 🔲 Planned |
| | **TOTAL** | **~235 modules** | |

---

## APPENDIX: THINGS I ADDED (Claude's Suggestions)

Beyond what you described, I've added these based on the architecture and market logic:

1. **Config-driven module architecture** — This is the key technical unlock. Instead of coding each module, define them in JSON + markdown. This means you can literally ship a new module in 15 minutes once the platform is built.

2. **Red Team Review mode** — In the review system, a "Devil's Advocate" option that actively tries to break your work and find weaknesses. Critical for consulting deliverables.

3. **Audience Proxy personas** — Beyond expert personas, add "Explain to me as if I'm a..." options (board member, regulator, journalist, customer, 10-year-old). Invaluable for communication testing.

4. **Project Templates** — Pre-built project structures for common engagements (e.g., "AMLR Implementation Project" comes pre-configured with the right modules, knowledge sources, and milestones).

5. **ROI Tracker** — Dashboard widget showing estimated time/cost savings vs. traditional consulting rates. This is your sales argument in a widget.

6. **Skill Pack marketplace** — Let users share their custom skills and modules. This creates a flywheel: more users → better modules → more value → more users.

7. **Cross-area module linking** — Some work naturally spans areas (e.g., an AMLR gap analysis might need Legal interpretation + Audit findings + Project planning). The project system should let sessions from different areas feed into each other.

8. **Version history on everything** — Prompts, modules, deliverables, reviews. Compliance-critical industries need audit trails.

9. **"Explain This Differently" button** — On any output, one click to get the same content reframed for a different audience (board vs. team vs. regulator).

10. **Offline capability** — Since it runs locally, ensure core functionality works without internet (Claude API still needed, but file management, project browsing, saved sessions all work offline).

---

> *"The question isn't whether AI will replace consultants. The question is whether consultants who use AI will replace those who don't. openEXPERT makes sure everyone has access to that power."*
> — openEXPERT by ANTON, February 2026
