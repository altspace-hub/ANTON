# openEXPERT / ANTON — Engagement Task: Full Specification & Implementation Guide

> **Audience:** Claude Code  
> **Purpose:** Full briefing on a major new interactive mode — "Engagement Task" — a structured engagement lifecycle manager where ANTON acts as senior engagement manager, guiding professionals through consulting and internal assignments from contract to final deliverable. This document explains the vision, every phase in detail, how it connects to the existing platform, and concrete guidance on implementation.  
> **First step for Claude Code:** Before writing a single line of code, read this document fully, then explore the codebase to understand what already exists — areas, modules, personas, skills, workflow engine, script execution, project storage, connections framework, and the seven-layer prompt architecture. Everything built here must integrate into and extend what is already there, not duplicate or diverge from it.

---

## 1. Context: What This Is and Where It Fits

openEXPERT is an open-source AI expert platform with 29 expert areas, 238 modules, 7 interaction modes, and a seven-layer prompt architecture. It already has modules that touch on engagement work — the FCP area includes an Engagement Proposal Builder (module 15), Engagement Delivery Planner (module 16), and Stakeholder Interview Planner (module 18). The Consulting area (Area 4) has related capabilities.

But those are individual modules: point tools for specific tasks within an engagement. What's missing is a **dedicated, structured lifecycle** that takes a professional from "here's what we agreed to do" all the way through to "here's the final deliverable" — with AI guiding every phase, managing the information flow, and producing work that reflects both the agreed scope and professional quality standards.

The Engagement Task is the **8th interaction mode** in openEXPERT. It sits alongside Standard Module Workspace, Brief Me, Guide Me, Batch Create, Workflow Builder, Collaborative Canvas, and Review Engine — but it is fundamentally different from all of them. Where modules are tools and workflows are sequences, the Engagement Task is a **project-level orchestration** that may invoke dozens of modules, multiple expert panels, several workflows, and iterative human-AI collaboration cycles across days or weeks.

**Critical design principle:** The Engagement Task does not create its own plan. It works from what has been agreed. The engagement letter, the project plan, the contract — those are the source of truth. ANTON extracts, structures, and executes against what was agreed. It does not invent scope, timelines, or methodology. When ANTON identifies gaps or ambiguities in the agreed materials, it flags them for human decision — it does not fill them in silently.

---

## 2. The Vision: Why a Dedicated Engagement Mode?

### The Problem

Professional engagements — whether a Big 4 firm delivering a regulatory gap assessment, a boutique consultancy running a data strategy project, or an internal team conducting a risk review — follow a remarkably consistent pattern:

1. Someone agrees to do work (engagement letter, contract, internal mandate)
2. The scope gets interpreted (often inconsistently across team members)
3. Materials get collected (slowly, incompletely, across email chains)
4. Work gets done (with varying quality depending on who's available)
5. Drafts iterate (with feedback loops that are hard to track)
6. A deliverable ships (and everyone hopes nothing was missed)

The problems at each stage are predictable: scope gets misunderstood, documents arrive late and incomplete, methodology gets applied inconsistently, junior team members lack context that senior partners carry in their heads, iterations lose track of what changed and why, and quality depends heavily on individual expertise.

### The Solution

ANTON as engagement manager doesn't replace any of the humans. It structures the chaos. Specifically:

**It reads what was agreed and structures it.** Instead of team members each interpreting the engagement letter differently, ANTON extracts the scope, methodology, deliverables, workstreams, timeline, assumptions, exclusions, and stakeholder map — and presents a structured view everyone can agree on.

**It knows what's needed before work can start.** Based on the scope, ANTON generates a categorised resource checklist — documents needed, meetings to transcribe, regulations to reference, data to collect — and tracks what's available, what's coming later, and what doesn't exist yet.

**It learns from how you've done it before.** Upload a "good example" from a previous engagement and ANTON deconstructs it: the structure, the depth of analysis, the citation style, the finding-vs-recommendation format, the executive summary approach. This becomes the quality standard for the current engagement.

**It executes with the right expertise.** ANTON pulls from all 29 expert areas, configures the right thinking levels, applies domain-specific knowledge, and produces work that reflects professional methodology — not just competent writing.

**It knows what to ask the client.** After the first iteration, the most valuable output isn't just the draft — it's the identification of what information, documents, and conversations would most improve the result. This turns the iteration cycle from "fix what's wrong" into "get what's needed."

### Two Entry Points

The feature supports two distinct entry paths:

**Full Engagement (External/Formal):** The user uploads an engagement letter/contract and optionally a project plan. These are complementary — some firms put everything in the engagement letter, others have minimal legal contracts with detailed project plans. ANTON accepts one or both and synthesises them.

**Lite Engagement (Internal/Informal):** No engagement letter exists. Instead, ANTON runs a guided discovery conversation: "What's the task? Who requested it? What's the expected output? When is it due? What resources are available?" — building the equivalent scope structure through dialogue. Same destination, lighter on-ramp.

---

## 3. The Eight Phases

The Engagement Task moves through eight distinct phases. Each phase has a clear purpose, defined inputs and outputs, and a UI state. Phases are sequential but **re-enterable** — you can always go back to add resources, adjust scope, or reconfigure experts as the engagement evolves. Each phase maintains its own completion state and change history.

---

### Phase 1: Setup & Context

**Purpose:** Establish who is doing the work, for whom, and in what professional domain.

**UI Elements:**

- **Your Organisation** — Text field with autocomplete from previous engagements. Example: "EY", "Advisense", "Internal — Risk Department". This isn't just a label — it tells ANTON about the professional context, typical methodologies, communication styles, and quality expectations associated with that organisation type.

- **Client / Recipient** — Text field with autocomplete. Example: "Nordea", "Board of Directors", "Group Compliance". For internal engagements, this is the requesting department or stakeholder.

- **Domain / Area** — Dropdown mapped to openEXPERT's 29+ areas, with multi-select support. Example: "Financial Crime Prevention" + "Legal". This pre-loads relevant expert context and personas. The user can also type a custom domain not yet in the system.

- **Engagement Type Toggle:**
  - **Full Engagement** — Shows document upload zone for engagement letter/contract + project plan
  - **Lite Engagement** — Shows guided discovery conversation (see Phase 1b)

- **Document Upload Zone (Full Engagement):**
  - **Engagement Letter / Contract** — Primary scope document. Accepts PDF, DOCX, scanned images (OCR supported).
  - **Project Plan** — Optional. If provided, ANTON merges it with the engagement letter to build a comprehensive scope view. Accepts PDF, DOCX, XLSX, MPP exports.
  - Visual indicator showing "Engagement Letter uploaded ✓" / "Project Plan uploaded ✓" / "Project Plan — not provided (scope will be derived from engagement letter only)"

**What ANTON Does:**

Upon upload of the engagement letter (and optionally the project plan), ANTON immediately begins extraction. This should be **fast** — the foundation documents are the most critical inputs and everything downstream depends on getting this right quickly. ANTON extracts in a single pass:

- **Parties & Roles:** Who is the service provider, who is the client, named contacts, team members mentioned, governance structure
- **Scope of Work:** What has been agreed — the services to be delivered, broken into discrete items
- **Methodology:** How the work will be done — document review, workshops, interviews, testing, peer review, regulatory analysis, etc.
- **Deliverables:** What the final products are — reports, Excel scorecards, presentations, training materials, roadmaps, etc.
- **Workstreams & Timeline:** If the project plan or engagement letter includes phases, workstreams, milestones, or dates — extract and structure them. ANTON does not create its own timeline; it structures what was agreed.
- **Assumptions & Limitations:** What has been explicitly assumed or excluded from scope
- **Pricing & Effort:** If mentioned — total price, daily rates, estimated hours/days per workstream
- **Governance:** Steering committee, reporting cadence, escalation paths, sign-off authorities
- **Dependencies:** What needs to happen before work can start (client to provide data, access to systems, etc.)

**Output:** A structured "Engagement Brief" card that summarises all extracted information. This is the foundation everything else builds on.

---

### Phase 1b: Lite Setup (Internal Engagements)

**Purpose:** Build an equivalent scope structure through guided conversation when no engagement letter exists.

**How It Works:**

Instead of document upload, ANTON presents a structured conversation flow. This is similar to Discovery Mode but specifically tuned for engagement scoping:

1. **What's the task?** — Open text. "Conduct a review of our KYC onboarding process against AMLR requirements"
2. **Who requested it?** — "Head of Compliance", "Board directive", "Regulatory finding follow-up"
3. **What triggered it?** — "New regulation", "Audit finding", "Strategic initiative", "Incident response"
4. **What's the expected output?** — Multiple choice + free text: Report, Gap analysis, Recommendations, Action plan, Training, Process documentation, Excel scorecard, Presentation
5. **What's the deadline?** — Date picker + urgency indicator
6. **What resources are available?** — "We have existing policies", "We have process documentation", "We have regulatory text", "We're starting from scratch"
7. **Who's involved?** — Team members, stakeholders, approvers
8. **What's the quality bar?** — "Internal working document", "Board-ready report", "Regulator submission quality"

ANTON synthesises the responses into the same structured Engagement Brief as Phase 1, allowing the user to review and adjust before proceeding.

**Key design point:** The Lite path should feel conversational, not like filling in a form. ANTON asks follow-up questions based on responses — if the user says "regulatory finding follow-up," ANTON asks about the specific finding, the regulator, and the remediation timeline.

---

### Phase 2: Scope Agreement

**Purpose:** Present the extracted scope for human review and confirmation before any work begins.

**What ANTON Presents:**

The Engagement Brief from Phase 1, structured into three clear sections with visual separation:

**Section A — What You've Agreed to Do (Scope)**
A structured list of scope items, each with:
- Description of the scope item
- Category tag: Analysis, Gap Assessment, Validation, Product Development, Workshop, Training, Review, Implementation, Advisory
- Linked workstream (if identified from project plan)
- Dependencies on other scope items

Example:
```
✅ 1. AMLR Gap Analysis — assess current compliance posture against AMLR requirements
   Category: Gap Assessment | Workstream: Phase 1 — Assessment | Depends on: Client data provision
✅ 2. Transaction Monitoring Review — evaluate existing TM rules and coverage
   Category: Analysis | Workstream: Phase 1 — Assessment | Depends on: TM documentation, rule library access
✅ 3. Remediation Roadmap — prioritised action plan with timeline and resourcing
   Category: Product Development | Workstream: Phase 2 — Recommendations | Depends on: Items 1, 2
```

**Section B — How You've Agreed to Do It (Methodology)**
Extracted methodology elements:
- Document review (which documents)
- Workshops (how many, with whom)
- Interviews / stakeholder consultations
- Data analysis / testing
- Peer review / expert panel input
- Regulatory mapping / legal analysis
- Benchmarking / industry comparison

**Section C — What You Need to Deliver (Deliverables)**
List of agreed deliverables with:
- Deliverable name and format (Report, Excel, PPTX, training package, etc.)
- Which scope items it maps to
- Quality standard (from engagement letter or derived from context)
- Delivery date (if specified)

**Section D — Boundaries & Governance**
- Assumptions extracted from the engagement letter
- Explicit exclusions / out-of-scope items
- Governance structure: who approves, who reviews, reporting cadence
- Risk, assumptions & exclusions register (kept visible throughout all phases)

**User Actions:**
- ✅ **Confirm** each section (or the whole brief)
- ✏️ **Edit** — modify, add, or remove items. Every edit is tracked against the original extraction.
- ➕ **Add** items ANTON missed — things discussed verbally but not in the letter, or implicit knowledge
- 🔗 **Link** scope items to deliverables, methodology to scope items (ANTON suggests links, user confirms)
- 💬 **Comment** — add notes that will be carried forward ("Client mentioned they may also want X if budget allows")

**Scope Creep Anchor:** This confirmed scope becomes the reference point for scope creep detection in later phases. Any work or requests that fall outside this confirmed scope will be flagged.

---

### Phase 2a: Client Intelligence

**Purpose:** Build a comprehensive understanding of who the client actually is — their business, structure, regulatory context, and specific circumstances — so that all engagement work is anchored in the client's reality, not generic assumptions.

**Why This Matters:**

A gap assessment for "Nordea" could mean wildly different things depending on whether it's Nordea's Finnish retail banking operation, their Danish corporate banking division, or their Baltic subsidiary. The client's size, business model, risk profile, regulatory jurisdiction, recent history with regulators, and organisational structure all shape how findings should be framed, what level of detail is appropriate, which regulations apply, and what recommendations are realistic given their actual capabilities.

Without this context, ANTON would produce generically correct but practically disconnected work — the kind of deliverable a client reads and thinks "they don't understand our business."

**How It Works:**

When the user provides a client name in Phase 1, ANTON initiates client intelligence gathering through multiple channels:

**Channel 1: User-Provided Context**

A structured input section where the user can specify:

- **Division / Department** — Which part of the client organisation is this engagement for? (e.g., "Group Compliance", "Nordic Retail Banking", "Payments & Cash Management")
- **Region / Jurisdiction** — Where does this client operate? Which regulatory regime applies? (e.g., "Headquartered in Finland, operates across Nordics and Baltics, supervised by ECB/SSM + local NCAs")
- **Products & Services in Scope** — What specific products or business lines are relevant? (e.g., "Retail deposits, consumer lending, payment services — excluding wealth management and life insurance")
- **Client Size & Scale Indicators** — Number of customers, transaction volumes, employee count, total assets — whatever is relevant to calibrate the engagement
- **Recent Regulatory History** — Recent supervisory actions, audit findings, regulatory letters, consent orders — anything that sets the context for why this engagement is happening
- **Key Contacts & Stakeholders** — Named individuals with roles (these feed into stakeholder mapping in Phase 2, Section D)

**Channel 2: Document-Derived Intelligence**

If the engagement letter, project plan, or any uploaded documents contain client information, ANTON extracts it automatically:

- Client description sections from the engagement letter
- Organisational charts or team structures
- References to specific business units, products, or regulatory relationships
- Mentioned systems, platforms, or technology stack
- Prior engagement history (if referenced)

**Channel 3: Online Research (Optional, User-Authorised)**

If the user authorises it (toggle: "Allow ANTON to research the client online"), ANTON uses web search to compile:

- Public company information (annual reports, regulatory filings, investor presentations)
- Regulatory status (supervised entity registers, licensing information)
- Recent news (regulatory actions, business developments, M&A activity)
- Industry positioning (market share, peer group, business model classification)
- Published organisational structure

**Important:** The user must explicitly authorise online research. Some engagements involve confidential clients or pre-announcement work where searching for the client online would be inappropriate. The default is OFF.

**What ANTON Produces: Client Intelligence Card**

A structured profile that becomes part of the engagement context:

```
CLIENT INTELLIGENCE: Nordea Bank Abp
═══════════════════════════════════════

ENTITY & STRUCTURE
├── Legal entity: Nordea Bank Abp (Finland)
├── Group structure: Universal bank, 4 business areas
├── Engagement scope: Personal Banking — Nordic Markets
├── Supervised by: ECB/SSM (significant institution) + Finansinspektionen (SE), Finanssyn (DK/NO)
└── ~10 million personal customers across Nordics

BUSINESS IN SCOPE
├── Products: Current accounts, savings, consumer lending, mortgages, payment services, cards
├── Channels: Branch, digital (app + web), call centre
├── Customer segments: Mass retail, personal banking, private banking (excluded from scope)
├── Key systems: [As identified from documents or user input]
└── Transaction volumes: [If available]

REGULATORY CONTEXT
├── Primary framework: AMLR (EU), 6AMLD (transposition varies by Nordic country)
├── Supervisory model: ECB SSM — joint supervisory teams with national NCAs
├── Recent history: [ECB thematic review on AML 2024, Danish FSA inspection Q3 2025]
├── Peer comparators: SEB, Handelsbanken, Danske Bank, DNB
└── Known sensitivities: [Baltic operations historically scrutinised; Danske Bank fallout increased Nordic AML focus]

ENGAGEMENT-RELEVANT CONTEXT
├── Why now: AMLR implementation deadline approaching + ECB supervisory expectations letter
├── Client maturity signal: Proactively commissioning assessment (not responding to finding)
├── Political/org context: [New Chief Compliance Officer appointed Q1 2026]
└── Dependencies: Client IT freeze Dec-Jan may affect data extraction timeline
```

**How This Feeds Into Subsequent Phases:**

- **Phase 6 (Execution):** Every workstream execution includes the Client Intelligence Card in the prompt context. Findings reference the client's actual products, jurisdictions, and regulatory relationships — not generic examples.
- **Phase 7 (Review):** Gap analysis considers the client's actual scale and maturity when assessing feasibility of recommendations. "Implement real-time transaction monitoring" means something different for a 10-million-customer bank than a 50,000-customer niche lender.
- **Phase 7D (Client Communications):** Communication drafts are calibrated to the client's organisational context — the right people, the right level of formality, awareness of sensitivities.
- **Phase 8 (Quality Gate):** The "Client Perspective" review lens uses the intelligence card to assess how findings and recommendations will land with this specific client.

**Client Intelligence is updateable.** As the engagement progresses and the user learns more about the client (from meetings, document review, or conversations), they can update the intelligence card. Changes are logged in the engagement changelog.

---

### Phase 2b: Regulatory & Standards Pre-Analysis

**Purpose:** Before execution begins, identify, validate, and establish how each relevant law, regulation, and standard will be interpreted and applied in the engagement — creating a shared regulatory foundation that prevents misalignment during execution.

**Why This Matters:**

Regulatory work fails most often not because the analysis is wrong, but because the regulatory basis was unclear from the start. Common problems:

- Using the wrong version of a regulation (draft vs. final, pre-amendment vs. post-amendment)
- Applying a regulation that doesn't actually apply to this client's jurisdiction or license type
- Interpreting a general principle differently from how the client's supervisor interprets it
- Missing a relevant standard or guideline that should inform the analysis
- Not distinguishing between binding regulation and non-binding guidance (which affects finding severity)
- Confusing EU-level regulation with national transposition (which can differ significantly)

The Regulatory Pre-Analysis prevents all of these by making the regulatory foundation explicit, reviewable, and agreed before any analysis begins.

**How It Works:**

**Step 1: Regulatory Identification**

Based on the scope (Phase 2) and client context (Phase 2a), ANTON identifies all relevant regulatory sources:

ANTON draws from three sources to build the regulatory inventory:
- **Engagement letter / project plan** — Often names specific regulations ("assessment against AMLR Articles 15-23")
- **Domain knowledge** — From the selected expert areas, ANTON knows which regulations typically apply (e.g., FCP area knows AMLR, 6AMLD, EBA Guidelines on AML/CFT)
- **Client context** — The client's jurisdiction, license type, and supervisory regime determine which regulations apply and which national transpositions are relevant

**Step 2: Regulatory Inventory Presentation**

ANTON presents a structured inventory for user review:

```
REGULATORY FOUNDATION FOR THIS ENGAGEMENT
═══════════════════════════════════════════

📜 PRIMARY REGULATION
┌─────────────────────────────────────────────────────────────────────┐
│ AMLR — Anti-Money Laundering Regulation (EU) 2024/1624             │
│ Status: Final, published OJ June 2024                              │
│ Applicable: YES — directly applicable EU regulation                │
│ Version: Final text as published (not earlier drafts/proposals)    │
│ Scope of use: Primary assessment framework for all workstreams     │
│ Key articles in scope: Art. 6-11 (Governance), Art. 15-23 (CDD),  │
│   Art. 24-31 (TM & Reporting), Art. 50-58 (Supervision)           │
│ Interpretation approach: Literal text + EBA guidance + ECB          │
│   supervisory expectations                                         │
│ ✅ Confirmed    ✏️ Edit    ❌ Remove                                │
└─────────────────────────────────────────────────────────────────────┘

📜 SUPPORTING REGULATIONS
┌─────────────────────────────────────────────────────────────────────┐
│ 6AMLD — 6th Anti-Money Laundering Directive (EU) 2024/1640         │
│ Status: Final, transposition deadline [date]                       │
│ Applicable: YES — but via national transposition (Finland, Sweden, │
│   Denmark, Norway)                                                 │
│ Note: National transpositions may differ. Assessment should flag   │
│   where national law goes beyond or diverges from directive.       │
│ Scope of use: Supplementary — where directive adds requirements    │
│   beyond AMLR                                                      │
│ ✅ Confirmed    ✏️ Edit    ❌ Remove                                │
├─────────────────────────────────────────────────────────────────────┤
│ EBA Guidelines on AML/CFT Internal Policies, Controls and          │
│   Procedures (EBA/GL/2022/05)                                      │
│ Status: Final, comply-or-explain                                   │
│ Applicable: YES — Nordea has confirmed compliance                  │
│ Binding force: Non-binding guidance, but supervisory expectation   │
│ Scope of use: Interpretive guidance for AMLR implementation —      │
│   used to inform best practice expectations but findings based     │
│   on guidelines alone rated as "Improvement Opportunity" not       │
│   "Compliance Gap"                                                  │
│ ✅ Confirmed    ✏️ Edit    ❌ Remove                                │
└─────────────────────────────────────────────────────────────────────┘

📜 SUPERVISORY EXPECTATIONS
┌─────────────────────────────────────────────────────────────────────┐
│ ECB SSM Supervisory Expectations on AML/CFT (2024 revision)        │
│ Status: Published                                                   │
│ Applicable: YES — Nordea is ECB-supervised significant institution  │
│ Binding force: Not legally binding but failure to meet expectations │
│   may result in supervisory measures                               │
│ Scope of use: Benchmark for "what the supervisor expects" —        │
│   findings referencing these expectations should note their non-   │
│   binding but practically significant nature                       │
│ ✅ Confirmed    ✏️ Edit    ❌ Remove                                │
└─────────────────────────────────────────────────────────────────────┘

📜 STANDARDS & BEST PRACTICE
┌─────────────────────────────────────────────────────────────────────┐
│ FATF Recommendations (2024 update)                                  │
│ Applicable: Background context                                      │
│ Scope of use: Referenced for international best practice context    │
│   only — not used as primary assessment basis                      │
│ ✅ Confirmed    ✏️ Edit    ❌ Remove                                │
├─────────────────────────────────────────────────────────────────────┤
│ Wolfsberg Group Standards — AML Principles                          │
│ Applicable: Industry benchmark                                      │
│ Scope of use: Used for benchmarking where relevant — not as        │
│   compliance requirement                                            │
│ ✅ Confirmed    ✏️ Edit    ❌ Remove                                │
└─────────────────────────────────────────────────────────────────────┘

➕ ADD REGULATION / STANDARD / GUIDELINE

⚠️ ANTON NOTES:
- Norwegian transposition of 6AMLD not yet published — monitor and flag if relevant
- AMLA (EU Anti-Money Laundering Authority) has published draft RTS on [topic] —
  currently draft only, recommend noting but not using as assessment basis
- Client is subject to Finnish national AML Act (Laki rahanpesun estamisesta) —
  should be included if assessment covers national-specific requirements
  → [Add to inventory] [Note for later] [Not relevant]
```

**Step 3: Interpretation Alignment**

For each confirmed regulatory source, ANTON presents its planned interpretation approach:

```
INTERPRETATION APPROACH: AMLR Article 16 (Customer Due Diligence)
═══════════════════════════════════════════════════════════════════

WHAT THE REGULATION SAYS:
"Obliged entities shall apply customer due diligence measures in the
following situations: (a) when establishing a business relationship..."
[Key provisions summarised — not full text reproduction]

HOW WE PLAN TO INTERPRET THIS:
1. "Business relationship" — Interpreted broadly per EBA guidance to
   include all ongoing customer relationships, not just formal contracts
2. Scope of CDD measures — Assessment will cover all five CDD elements
   (identification, verification, beneficial ownership, purpose & nature,
   ongoing monitoring) as specified in Art. 16-20
3. Risk-based approach — Assessment acknowledges that depth of CDD should
   be proportionate to risk, per Art. 16(2). Will assess whether client's
   risk-based differentiation is adequate, not whether maximum CDD is
   applied to all customers.
4. Timing of verification — Will assess against Art. 16(4) which permits
   completion of verification after relationship establishment in
   specified circumstances. Client's use of this flexibility will be
   evaluated against conditions, not penalised per se.

IMPLICATIONS FOR FINDINGS:
- Findings related to CDD will be assessed against this interpretation
- A gap in beneficial ownership identification is a COMPLIANCE GAP (binding requirement)
- A gap in risk-based CDD differentiation methodology is an IMPROVEMENT OPPORTUNITY
  (judgment-based assessment against supervisory expectations)

✅ Agree with interpretation    ✏️ Modify    💬 Add note
```

**Why This Level of Detail:**

This might seem like overkill, but for any professional working in regulated industries, this is exactly the conversation that happens (or should happen) at the start of every engagement — usually verbally, often inconsistently, and rarely documented. By making it explicit:

- Every team member (human or AI) works from the same regulatory basis
- The client can see exactly how regulations will be applied to their assessment
- If a finding is challenged ("that's not how we read Article 16"), the interpretation basis is documented
- Different regulatory sources have different binding force, and this affects finding severity
- The final deliverable's methodology section writes itself from this foundation

**User Actions:**
- ✅ **Confirm** each regulatory source and its interpretation
- ✏️ **Edit** interpretation approach (e.g., "Actually, the Finnish NCA interprets this more strictly")
- ➕ **Add** missing regulations or standards
- ❌ **Remove** regulations that don't apply
- 💬 **Comment** with context ("Client's previous auditor used a different interpretation of Art. 16(4) — we should note our approach differs")
- 🔗 **Link** regulatory sources to specific scope items and workstreams

**How This Feeds Into Subsequent Phases:**

- **Phase 5 (Workstreams):** Each workstream shows which regulations it's assessing against
- **Phase 6 (Execution):** The confirmed regulatory inventory and interpretation approach are injected into the prompt context for every workstream execution. ANTON cites regulations correctly, at the right granularity, with the right binding force classification.
- **Phase 7 (Review):** The "Regulatory" review lens checks outputs against the pre-analysis — are citations accurate? Is the interpretation consistent? Are finding severities calibrated correctly to binding force?
- **Phase 8 (Quality Gate):** Regulatory accuracy check uses the pre-analysis as its reference standard

**The regulatory pre-analysis is a living document.** As the engagement progresses, new regulatory sources may become relevant, interpretations may be refined based on deeper analysis, or regulatory updates may occur. Changes are tracked in the engagement changelog with clear before/after records.

---

### Phase 3: Resource Collection

**Purpose:** Gather all materials needed to execute the engagement, organised by category with clear status tracking.

**This is where the "good example" extraction happens, and it needs to be fast.** The engagement letter and project plan laid the groundwork for what to do. The good example lays the groundwork for how to do it. Together, these three document types form the foundation — getting information out of them quickly and accurately is what makes everything after this phase work well.

**Resource Categories (separate UI sections with distinct icons/buttons):**

Each category is a collapsible panel with its own upload zone, status indicator, and item list.

**📄 Documents & Policies**
- Upload zone for PDFs, DOCX, XLSX files
- Each uploaded document gets a brief AI-generated summary and relevance tag
- Status per document: Uploaded ✓ | Processing... | Reviewed by ANTON ✓
- Examples: Current AML policy, CDD procedures, risk assessments, board reports, previous audit findings

**🎤 Meeting Notes & Transcripts**
- Upload zone for transcripts, notes, recordings (with transcription)
- Each transcript gets key points extracted and tagged to relevant scope items
- Examples: Kick-off meeting notes, stakeholder interview transcripts, workshop outputs

**📜 Laws, Regulations & Standards**
- Upload zone for regulatory texts OR link input for online sources (EUR-Lex, national regulator sites)
- Leverages existing Knowledge Source Mode 2 (Online Reference Links) and Mode 3 (Local Folder)
- Examples: AMLR text, EBA guidelines, national transposition acts, industry standards

**📊 Data & Testing Results**
- Upload zone for data files, test results, system exports
- Examples: Transaction monitoring hit rates, false positive analysis, CDD data quality reports, system configuration exports

**💻 Code & Technical Artefacts**
- Upload zone or repository link for technical materials
- Leverages existing Coding Area integration (Tier 1: Code Review)
- Examples: TM rule libraries, API documentation, system architecture diagrams

**⭐ Good Example (Previous Engagement)**
- Dedicated upload zone with special treatment (see below)
- Upload one or more deliverables from previous, similar engagements
- ANTON deconstructs these into a **Quality Blueprint**

**Status Toggles Per Category:**

Each category (not individual documents, but the category as a whole) has three status options:

- 🟢 **Available** — "We have materials in this category" (default when something is uploaded)
- 🟡 **Coming Later** — "We'll get these during the engagement" (ANTON tracks and reminds)
- 🔴 **Not Available — Help Needed** — "We don't have this and need help getting it" (ANTON generates requests — see Client Communication in Phase 7)

---

### Phase 3a: Good Example Extraction (Quality Blueprint)

**Purpose:** Deconstruct a previous engagement's deliverable into a reusable quality standard for the current engagement.

**This is a critical differentiator.** When a senior partner says "make it look like the Nordea report from last year," they mean a dozen specific things that a junior consultant would need weeks to absorb. ANTON extracts them in minutes.

**What ANTON Extracts from a Good Example:**

When the user uploads a "good example" document, ANTON performs a deep structural analysis and presents findings under these headings:

1. **Document Structure**
   - How is the document organized? (Executive summary → Background → Methodology → Findings → Recommendations → Appendices)
   - What heading hierarchy is used? How deep does it go?
   - What is the typical section length? (Executive summary: 1-2 pages, individual findings: 0.5-1 page)
   - How are appendices used? What goes in appendices vs. main body?

2. **Language & Tone**
   - Formality level (board-ready formal / professional working / internal informal)
   - Sentence structure patterns (short declarative / complex analytical / mixed)
   - Active vs. passive voice ratio
   - Technical jargon level and how jargon is introduced/defined
   - Confidence language patterns ("We recommend" vs. "It is recommended" vs. "Consider")

3. **Finding / Observation Format**
   - How are individual findings structured? (Title → Description → Impact → Recommendation / Title → Current state → Gap → Risk → Action)
   - Is there a severity/priority rating? What scale? (High/Medium/Low, 1-5, Red/Amber/Green)
   - How detailed are individual observations?
   - Is root cause analysis included?

4. **Recommendation Style**
   - Specific vs. directional? ("Implement automated name screening within 6 months" vs. "Consider enhancing screening capabilities")
   - Are recommendations linked to specific findings?
   - Are they prioritised? By what criteria?
   - Do they include effort estimates, responsible parties, or timelines?

5. **Citation & Reference Depth**
   - How are laws/regulations cited? (Full article reference / abbreviated / footnoted / inline)
   - Frequency of regulatory references (every finding / only key ones / appendix-only)
   - Are specific article numbers and sub-paragraphs cited?
   - How are industry standards and best practices referenced?

6. **Data & Evidence Presentation**
   - How is quantitative data presented? (Inline text / tables / charts)
   - What level of data granularity? (Summary statistics / detailed breakdowns)
   - Are comparisons to benchmarks or peers included?
   - How are data limitations acknowledged?

7. **Visual & Formatting Conventions**
   - Table styles, colour coding, scoring matrices
   - Use of visual summaries (heat maps, traffic lights, maturity models)
   - Branding elements and formatting standards
   - Page layout, margins, font choices

**Output: Quality Blueprint Card**

A structured summary of all extracted patterns, presented as a set of "quality instructions" that will be injected into every execution step. The user can review and adjust — "Actually, we want more regulatory citation depth than last time" or "The finding format should include root cause analysis this time."

The Quality Blueprint becomes part of the prompt architecture (injected at Layer 5: Skills Library level) for all subsequent ANTON execution.

---

### Phase 4: Expert & Mode Configuration

**Purpose:** Configure the thinking depth, expert panels, and analytical modes for the engagement.

This phase leverages existing platform capabilities but presents them in the engagement context:

**Thinking Level Selection:**
- `quick` — Fast turnaround, suitable for straightforward analysis
- `think` — Standard analytical depth (default for most engagements)
- `think_hard` — Deep analysis with extensive reasoning (default for complex regulatory work)
- `investigate` — Maximum depth with research and cross-referencing

The user can set a default for the engagement and override per workstream.

**Expert Panel Configuration:**

Select which expert personas to involve. ANTON suggests a panel based on the scope:

- If scope includes regulatory gap analysis → Suggest: Regulatory Expert, Compliance Officer, Legal Advisor
- If scope includes technology assessment → Suggest: CTO, Security Analyst, Data Scientist
- If scope includes process review → Suggest: Operations Expert, Risk Manager, Process Engineer
- If scope includes board reporting → Suggest: Board Advisor, Communication Expert

The user can accept suggestions, add more, or configure which experts review which workstreams.

**Relevant information from the engagement letter feeds in here:** If the engagement letter or project plan includes CVs, team composition, or named roles, ANTON maps these to expert personas and suggests configurations that complement the human team.

**Review Modes:**
Select which review lenses to apply to outputs:
- Devil's Advocate — Challenge findings and assumptions
- Systems Thinking — Check for interconnections and second-order effects
- Pragmatist — Ensure recommendations are implementable
- Regulatory — Verify regulatory accuracy and completeness
- Client Perspective — How will the client receive this?

**Knowledge Source Configuration:**
- Which modes to activate (Claude Knowledge, Web Search, Local Folder, Online References, Combined)
- Priority ordering
- Specific knowledge sources to pre-load (regulations, standards, previous reports)

---

### Phase 5: Workstream Decomposition & Planning View

**Purpose:** Break the confirmed scope into trackable workstreams with resource mapping and dependencies.

**Critical principle: ANTON structures what was agreed, it does not create its own plan.**

If the engagement letter and/or project plan include phases, workstreams, timelines, or milestones, ANTON extracts and structures them. If they don't, ANTON proposes a logical decomposition based on the scope and asks the user to confirm.

**What ANTON Produces:**

A workstream map showing:

```
Engagement: AMLR Gap Assessment — Nordea
═══════════════════════════════════════════

Workstream 1: Governance & Framework Review
├── Scope items: #1 (AMLR Gap Analysis — governance articles)
├── Methodology: Document review + stakeholder interviews
├── Resources needed: 📄 AML Policy, Risk Appetite Statement | 🎤 MLRO interview | 📜 AMLR Articles 6-11
├── Resource status: 📄 Uploaded ✓ | 🎤 Coming later | 📜 Available via EUR-Lex ✓
├── Deliverable contribution: Gap Report §3, Scorecard Tab 1
├── Expert panel: Regulatory Expert, Compliance Officer
├── Depends on: Client to confirm policy versions are current
└── Timeline: Week 1-2 (from project plan)

Workstream 2: Transaction Monitoring Assessment
├── Scope items: #2 (TM Review)
├── Methodology: Document review + data analysis + system testing
├── Resources needed: 📄 TM Rule Library, Alert Handling Procedures | 📊 Hit rate data, sample alerts | 💻 TM system config
├── Resource status: 📄 Uploaded ✓ | 📊 Not available — help needed | 💻 Coming later
├── Deliverable contribution: Gap Report §4, Scorecard Tab 2
├── Expert panel: Data Scientist, Compliance Officer, Technology Expert
├── Depends on: Access to TM system, data extraction from client
└── Timeline: Week 2-4 (from project plan)

... (additional workstreams)
```

**User Actions:**
- Confirm workstream structure
- Adjust resource mapping
- Re-assign expert panels per workstream
- Set execution order (sequential, parallel, or mixed)
- Add dependencies between workstreams

**Progress Dashboard:**

From this point forward, a persistent progress view is available:

| Workstream | Resources | Status | Iteration |
|---|---|---|---|
| Governance & Framework | 4/6 available | Ready to execute | — |
| Transaction Monitoring | 2/5 available | Blocked — waiting for data | — |
| CDD Process Review | 5/5 available | Ready to execute | — |
| Reporting Obligations | 3/4 available | Can start (partial) | — |

This dashboard persists across all subsequent phases and updates in real time.

---

### Phase 6: Execution

**Purpose:** ANTON executes the engagement workstreams, producing first-iteration outputs.

**How Execution Works:**

ANTON executes each workstream using:
- The confirmed scope (Phase 2) as boundaries
- The collected resources (Phase 3) as inputs
- The Quality Blueprint (Phase 3a) as the quality standard
- The expert panel (Phase 4) as analytical lenses
- The workstream structure (Phase 5) as the execution plan

For each workstream, ANTON:

1. **Assembles the prompt** using the seven-layer architecture:
   - Layer 1: System Foundation (ANTON principles)
   - Layer 2: Area Context (from domain selection in Phase 1)
   - Layer 3: Module Expertise (drawn from relevant modules — Gap Analysis, Policy Review, etc.)
   - Layer 4: Expert Personas (from Phase 4 configuration)
   - Layer 5: Quality Blueprint + Skills (from good example extraction + selected skills)
   - Layer 6: Knowledge Sources (uploaded documents + regulations + online references)
   - Layer 7: User Input & Engagement Context (scope, methodology, deliverable requirements)

2. **Processes the resources** relevant to this workstream — reading documents, extracting relevant sections, cross-referencing against regulatory requirements

3. **Produces the output** in the format specified by the deliverable requirements — findings, scoring, analysis, recommendations — structured according to the Quality Blueprint

4. **Runs the expert panel review** — each configured expert reviews the output from their perspective

5. **Generates the workstream output** — a draft section of the final deliverable, plus metadata about confidence levels, areas of uncertainty, and information gaps

**Execution is per-workstream, not monolithic.** The user can:
- Execute workstreams individually (useful when resources arrive at different times)
- Execute all ready workstreams in parallel
- Review and approve each workstream output before moving to the next
- Re-execute a workstream with additional resources

**Output per workstream:**
- Draft deliverable section (in the agreed format)
- Confidence assessment (what ANTON is certain about vs. where it's uncertain)
- Information gap list (what additional materials would improve this section)
- Cross-references to other workstreams (findings that affect or connect to other areas)

---

### Phase 7: Review & Iteration

**Purpose:** Review first-iteration outputs, identify what's missing, plan client/stakeholder interactions, and prepare for subsequent iterations.

**This is where the real value of the iteration cycle shows.** The first iteration's main contribution isn't just the draft — it's the systematic identification of what information, conversations, and documents would move the quality needle.

**What ANTON Presents After First Iteration:**

**7A — Draft Output Review**

The assembled first-iteration output, with:
- Inline confidence indicators (green: high confidence / amber: moderate / red: low — needs verification)
- Margin notes showing which source document supported each finding
- Gaps explicitly marked: "⚠️ Could not assess — no documentation provided for this area"
- Cross-workstream connections highlighted: "Finding in WS1 affects assessment in WS3"

**7B — Gap Analysis & Needle Movers**

A prioritised list of what would most improve the output:

```
🔴 HIGH IMPACT — Would significantly change assessment:
1. Transaction monitoring hit rate data (WS2) — Currently scoring based on procedural review only;
   actual effectiveness data would validate or challenge this assessment
2. MLRO interview transcript (WS1) — Key governance questions remain based on documentation alone

🟡 MEDIUM IMPACT — Would strengthen specific findings:
3. Board meeting minutes re: AML risk appetite (WS1) — Would confirm whether risk appetite is
   formally endorsed at board level
4. CDD quality assurance sample results (WS3) — Would allow data-backed quality assessment

🟢 NICE TO HAVE — Would add depth but not change conclusions:
5. Industry benchmarking data (all WS) — Would provide comparative context
6. Previous audit findings and remediation status (all WS) — Would show trajectory
```

**7C — Scope Creep Detection**

ANTON monitors whether the work has drifted beyond the agreed scope:

```
⚠️ SCOPE CHECK:
- The client has requested analysis of their sanctions screening process. This was explicitly
  listed as out-of-scope in the engagement letter (Section 4, Exclusions).
  → [Flag as out-of-scope] [Adjust scope to include] [Note for future discussion]

- During document review, significant crypto-asset exposure was identified. The engagement
  scope covers traditional banking products only.
  → [Flag as out-of-scope] [Adjust scope to include] [Note for future discussion]
```

**7D — Client Communication Drafts**

Based on the gap analysis, ANTON drafts communications:

- **Document Request Email** — "Dear [Client Contact], following our initial analysis, we would benefit from the following additional materials to strengthen our assessment: [prioritised list with clear descriptions of what's needed and why]"
- **Meeting Agenda** — If follow-up workshops or interviews are needed, ANTON drafts the agenda with specific discussion points drawn from the gap analysis
- **Data Request Specification** — If specific data extracts are needed, ANTON drafts a technical specification the client can hand to their IT team
- **Status Update** — If the engagement has a reporting cadence, ANTON drafts the progress update showing what's complete, what's in progress, and what's waiting for input

These are drafted using the platform's existing message/document generation capabilities, styled according to the Quality Blueprint and the professional context (e.g., Big 4 communication norms vs. internal memo style).

**7E — Stakeholder Sign-off Tracking**

If the engagement has a governance structure (from Phase 2, Section D):

| Deliverable Section | Reviewer | Status | Due |
|---|---|---|---|
| Gap Report — Governance | Client MLRO | Pending review | Week 3 |
| Gap Report — TM | Client Head of FIU | Not yet shared | Week 4 |
| Scorecard | Steering Committee | — | Week 5 |

**User Actions in Phase 7:**

- Review and annotate the draft output
- Accept, modify, or reject ANTON's gap analysis priorities
- Approve and send client communications (or edit first)
- Mark items as "received" when additional materials arrive
- Trigger re-execution of specific workstreams with new materials
- Adjust scope if scope creep items are to be included

**Iteration Cycle:**

Each iteration creates a new version of the output. The system tracks:
- What changed between iterations (diff view)
- What new resources were added
- Which gap items were resolved
- How confidence scores changed
- What scope adjustments were made

Typical engagement: 2-3 iterations. First iteration surfaces what's missing. Second iteration incorporates additional materials and client feedback. Third iteration (if needed) is final polish and alignment.

---

### Phase 8: Quality Gate & Finalisation

**Purpose:** Final quality assurance before the deliverable ships.

**Quality Gate Process:**

ANTON runs the complete output through a structured quality review, distinct from the expert panel used during execution:

**8A — Scope Completeness Check**
- Every confirmed scope item from Phase 2 is checked: is it addressed in the output?
- Any gaps are flagged: "Scope item #4 (Reporting Obligations assessment) is mentioned but not fully addressed in the deliverable"

**8B — Quality Blueprint Alignment**
- Compare the output against the Quality Blueprint extracted from the good example
- Structure match: Does the document follow the agreed structure?
- Citation depth: Does the regulatory referencing match the agreed standard?
- Finding format: Are findings structured consistently with the blueprint?
- Language register: Does the tone and formality match?

**8C — Cross-Workstream Consistency**
- Are severity ratings applied consistently across workstreams?
- Do recommendations in one area conflict with findings in another?
- Is terminology used consistently throughout?
- Do cross-references between sections resolve correctly?

**8D — Assumptions & Limitations Section**
- ANTON auto-generates the "Assumptions and Limitations" section from the register maintained since Phase 2
- Includes: information that was not available, areas where assessment is based on limited data, scope exclusions, methodology limitations

**8E — Executive Summary Generation**
- If the deliverable includes an executive summary, ANTON generates it last (after all content is finalised)
- Draws from the Quality Blueprint for structure and tone
- Highlights the most significant findings and highest-priority recommendations

**8F — Expert Panel Final Review**
- Devil's Advocate: "What would a critical reader challenge?"
- Regulatory: "Are all regulatory references accurate and current?"
- Client Perspective: "How will the client receive this? Are there surprises?"
- Pragmatist: "Are recommendations actionable with the client's resources?"

**Output:**

A quality scorecard:

| Dimension | Score | Notes |
|---|---|---|
| Scope Completeness | 95% | Item #6 partially addressed — flagged |
| Blueprint Alignment | 90% | Citation depth slightly below benchmark |
| Cross-Consistency | 100% | No conflicts detected |
| Regulatory Accuracy | 95% | 2 article references to verify |
| Actionability | 85% | 3 recommendations need more specificity |

User can address flagged items, accept the quality assessment, and export the final deliverable.

**Export Options:**
- DOCX (primary for reports)
- XLSX (for scorecards, gap matrices)
- PPTX (for management presentations)
- PDF (for formal submissions)
- Combined package (all deliverables zipped with cover memo)

---

## 4. Cross-Phase Features

These capabilities operate across all phases:

### 4.1 Engagement Dashboard

A persistent top-level view showing:
- Current phase and progress within it
- Resource collection status across all categories
- Workstream execution status
- Iteration count and version history
- Upcoming deadlines and outstanding items
- Scope creep alerts

### 4.2 Engagement History & Templates

Completed engagements (with client-identifying information stripped) become reusable templates:
- "AMLR Gap Assessment — Nordic Bank" → Template with scope structure, resource checklist, quality blueprint, expert panel configuration
- Templates can be exported as `.anton` packages for sharing via the future marketplace

### 4.3 Change Log

Every modification across all phases is logged:
- Scope changes (with who changed what and when)
- Resource additions
- Configuration changes
- Output iterations with diffs
- Scope creep flags and resolutions

This creates a full audit trail — critical for regulated industries where demonstrating methodology rigour matters.

### 4.4 Parallel Engagement Support

Users should be able to run multiple engagements simultaneously. Each engagement is a separate project container (using the existing `projects` table) with its own scope, resources, and iteration state.

### 4.5 Engagement-to-Module Bridge

At any point during the engagement, the user should be able to "break out" to a specific module for deeper work. Example: during the TM workstream, the user wants to run a standalone Data Quality Checker (module 21) on a specific dataset. The results feed back into the engagement workstream.

This uses existing module infrastructure — the engagement just provides context and receives results.

---

## 5. Data Model

### New Tables

```sql
-- Core engagement record
CREATE TABLE engagements (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  title TEXT NOT NULL,
  engagement_type TEXT NOT NULL CHECK (engagement_type IN ('full', 'lite')),
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN (
    'setup', 'scope_agreement', 'client_intelligence', 'regulatory_preanalysis',
    'resource_collection', 'configuration',
    'workstream_planning', 'execution', 'review', 'quality_gate', 'completed', 'archived'
  )),
  your_organisation TEXT,
  client_name TEXT,
  domain_areas TEXT, -- JSON array of area IDs
  engagement_brief TEXT, -- JSON: extracted/confirmed scope, methodology, deliverables
  quality_blueprint TEXT, -- JSON: extracted patterns from good example
  thinking_level TEXT DEFAULT 'think_hard',
  expert_panel TEXT, -- JSON: configured expert personas
  review_modes TEXT, -- JSON: selected review modes
  knowledge_config TEXT, -- JSON: knowledge source configuration
  scope_confirmed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Uploaded foundation documents
CREATE TABLE engagement_documents (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  document_type TEXT NOT NULL CHECK (document_type IN (
    'engagement_letter', 'project_plan', 'good_example'
  )),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extracted_content TEXT, -- Full text extraction
  extraction_summary TEXT, -- JSON: structured extraction results
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scope items extracted and confirmed
CREATE TABLE engagement_scope_items (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT, -- analysis, gap_assessment, validation, etc.
  workstream_id TEXT REFERENCES engagement_workstreams(id),
  deliverable_ids TEXT, -- JSON array of deliverable IDs
  methodology TEXT, -- JSON array of methodology elements
  dependencies TEXT, -- JSON array of other scope item IDs
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'modified', 'added', 'removed')),
  original_text TEXT, -- Original text from engagement letter for audit
  sort_order INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workstreams
CREATE TABLE engagement_workstreams (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  title TEXT NOT NULL,
  description TEXT,
  expert_panel TEXT, -- JSON: workstream-specific expert override
  thinking_level TEXT, -- workstream-specific override
  timeline_start TEXT,
  timeline_end TEXT,
  execution_status TEXT DEFAULT 'pending' CHECK (execution_status IN (
    'pending', 'blocked', 'ready', 'executing', 'review', 'completed'
  )),
  dependencies TEXT, -- JSON array of other workstream IDs
  sort_order INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Resources collected for the engagement
CREATE TABLE engagement_resources (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  workstream_id TEXT REFERENCES engagement_workstreams(id), -- NULL if engagement-wide
  category TEXT NOT NULL CHECK (category IN (
    'documents', 'meetings', 'regulations', 'data', 'code', 'good_example', 'other'
  )),
  title TEXT NOT NULL,
  file_path TEXT,
  url TEXT,
  extracted_content TEXT,
  extraction_summary TEXT,
  relevance_tags TEXT, -- JSON array of scope item IDs this resource is relevant to
  status TEXT DEFAULT 'uploaded' CHECK (status IN (
    'uploaded', 'processing', 'reviewed', 'not_available', 'coming_later'
  )),
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Category-level status toggles
CREATE TABLE engagement_resource_categories (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  workstream_id TEXT REFERENCES engagement_workstreams(id),
  category TEXT NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'coming_later', 'not_available')),
  notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Deliverables
CREATE TABLE engagement_deliverables (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  title TEXT NOT NULL,
  format TEXT, -- docx, xlsx, pptx, pdf, etc.
  description TEXT,
  scope_item_ids TEXT, -- JSON array of scope items this deliverable covers
  quality_standard TEXT,
  delivery_date TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'draft', 'review', 'approved', 'delivered'
  )),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Execution iterations
CREATE TABLE engagement_iterations (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  workstream_id TEXT REFERENCES engagement_workstreams(id),
  iteration_number INTEGER NOT NULL,
  output_content TEXT, -- The generated content
  output_version_id TEXT REFERENCES output_versions(id), -- Link to platform versioning
  confidence_assessment TEXT, -- JSON: per-section confidence scores
  gap_analysis TEXT, -- JSON: identified gaps with impact ratings
  scope_creep_flags TEXT, -- JSON: detected scope creep items
  resources_used TEXT, -- JSON: which resources were used in this iteration
  expert_reviews TEXT, -- JSON: expert panel review results
  quality_scores TEXT, -- JSON: quality scorecard
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'superseded')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scope creep register
CREATE TABLE engagement_scope_creep (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  iteration_id TEXT REFERENCES engagement_iterations(id),
  description TEXT NOT NULL,
  source TEXT, -- Where this was detected: 'document_review', 'client_request', 'auto_detected'
  resolution TEXT CHECK (resolution IN ('out_of_scope', 'scope_adjusted', 'noted', 'pending')),
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Assumptions & exclusions register
CREATE TABLE engagement_boundaries (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  boundary_type TEXT NOT NULL CHECK (boundary_type IN ('assumption', 'exclusion', 'limitation', 'risk')),
  description TEXT NOT NULL,
  source TEXT, -- 'engagement_letter', 'project_plan', 'user_added', 'auto_detected'
  original_text TEXT, -- Original wording from source document
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'removed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Client intelligence profile
CREATE TABLE engagement_client_intelligence (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  client_name TEXT NOT NULL,
  division_department TEXT,
  region_jurisdiction TEXT,
  products_in_scope TEXT, -- JSON array
  scale_indicators TEXT, -- JSON: customer count, transaction volume, assets, employees
  regulatory_supervisors TEXT, -- JSON array of supervisory authorities
  recent_regulatory_history TEXT, -- JSON array of events
  peer_comparators TEXT, -- JSON array of peer entities
  business_model_description TEXT,
  technology_landscape TEXT, -- JSON: known systems, platforms
  organisational_context TEXT, -- Key org details: new appointments, restructuring, etc.
  engagement_trigger TEXT, -- Why now: regulatory, audit finding, strategic, incident
  client_maturity_signal TEXT, -- Proactive vs. reactive
  sensitivities TEXT, -- Known political/org sensitivities
  online_research_authorised BOOLEAN DEFAULT FALSE,
  source_channels TEXT, -- JSON: which channels contributed ('user_input', 'document', 'online')
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Client intelligence key contacts / stakeholders
-- (extends engagement_stakeholders with client-specific context)

-- Regulatory inventory for the engagement
CREATE TABLE engagement_regulatory_sources (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  title TEXT NOT NULL, -- e.g. "AMLR — Anti-Money Laundering Regulation (EU) 2024/1624"
  short_name TEXT, -- e.g. "AMLR"
  source_type TEXT NOT NULL CHECK (source_type IN (
    'primary_regulation', 'supporting_regulation', 'directive',
    'supervisory_expectation', 'guideline', 'standard', 'best_practice', 'national_law'
  )),
  status TEXT, -- Final, Draft, Proposed, etc.
  applicable TEXT DEFAULT 'yes' CHECK (applicable IN ('yes', 'no', 'partial', 'tbd')),
  binding_force TEXT, -- 'binding', 'comply_or_explain', 'non_binding_but_expected', 'best_practice'
  jurisdiction TEXT, -- EU, national (which), international
  version_details TEXT, -- Which version/publication is being used
  key_articles_in_scope TEXT, -- JSON array of article ranges relevant to this engagement
  scope_of_use TEXT, -- How this source will be used in the engagement
  interpretation_approach TEXT, -- Detailed interpretation notes
  finding_severity_mapping TEXT, -- JSON: how gaps against this source are classified
  url TEXT, -- Link to the regulation text
  file_path TEXT, -- Local file path if uploaded
  workstream_ids TEXT, -- JSON array of workstreams this applies to
  user_confirmed BOOLEAN DEFAULT FALSE,
  confirmed_at DATETIME,
  sort_order INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Specific interpretation decisions for regulatory articles
CREATE TABLE engagement_regulatory_interpretations (
  id TEXT PRIMARY KEY,
  regulatory_source_id TEXT REFERENCES engagement_regulatory_sources(id),
  engagement_id TEXT REFERENCES engagements(id),
  article_reference TEXT NOT NULL, -- e.g. "Article 16(2)(a)"
  provision_summary TEXT, -- What the provision says (summarised)
  interpretation TEXT NOT NULL, -- How we interpret this for the engagement
  implications_for_findings TEXT, -- What this means for how findings will be rated
  alternative_interpretations TEXT, -- Known alternative readings (e.g. stricter NCA interpretation)
  rationale TEXT, -- Why this interpretation was chosen
  user_confirmed BOOLEAN DEFAULT FALSE,
  notes TEXT, -- User comments / context
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ANTON's regulatory notes and flags
CREATE TABLE engagement_regulatory_notes (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  regulatory_source_id TEXT REFERENCES engagement_regulatory_sources(id),
  note_type TEXT NOT NULL CHECK (note_type IN (
    'missing_source', 'version_concern', 'draft_only', 'transposition_pending',
    'interpretation_divergence', 'recent_update', 'suggestion'
  )),
  description TEXT NOT NULL,
  resolution TEXT CHECK (resolution IN ('add_to_inventory', 'noted', 'not_relevant', 'pending')),
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Stakeholder sign-off tracking
CREATE TABLE engagement_stakeholders (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  name TEXT NOT NULL,
  role TEXT,
  organisation TEXT, -- 'provider' or 'client'
  contact_info TEXT,
  sign_off_authority TEXT, -- JSON: which deliverables/workstreams they approve
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Client communication drafts
CREATE TABLE engagement_communications (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  iteration_id TEXT REFERENCES engagement_iterations(id),
  comm_type TEXT NOT NULL CHECK (comm_type IN (
    'document_request', 'meeting_agenda', 'data_request', 'status_update', 'other'
  )),
  subject TEXT,
  body TEXT NOT NULL,
  recipients TEXT, -- JSON array of stakeholder IDs
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Change log for full audit trail
CREATE TABLE engagement_changelog (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  phase TEXT NOT NULL,
  action TEXT NOT NULL, -- 'scope_modified', 'resource_added', 'config_changed', etc.
  description TEXT NOT NULL,
  previous_value TEXT, -- JSON
  new_value TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. Platform Integration Points

### 6.1 Seven-Layer Prompt Builder

The Engagement Task uses the existing `prompt-builder.ts` but with a richer context than any single module:

- **Layer 2 (Area Context):** May pull from multiple areas simultaneously (FCP + Legal + Risk)
- **Layer 3 (Module Expertise):** Selects the most relevant module methodology per workstream
- **Layer 5 (Skills):** Injects the Quality Blueprint as an engagement-specific skill
- **Layer 6 (Knowledge Sources):** Feeds engagement resources per workstream, with category awareness
- **Layer 7 (User Input):** Includes full engagement context — scope, boundaries, workstream dependencies

### 6.2 Workflow Engine

Each engagement execution can be represented as a workflow with:
- Workstream steps (type: `llm` with module context)
- Approval gates (type: `approval` for stakeholder sign-off)
- Review steps (type: `review` using configured review modes)
- Export steps (type: `export` for deliverable generation)
- Conditional branching (type: `conditional` for scope variations)

### 6.3 Project Storage

Each engagement maps to a project in the existing `projects` table. The engagement tables add engagement-specific structure on top of the generic project container.

### 6.4 Output Versioning

Engagement iterations link to the existing `output_versions` and `version_diffs` tables, providing full diff capability between iterations.

### 6.5 Knowledge Source System

All four knowledge modes are available within the engagement:
- Mode 1: Claude Knowledge + Web Search (for regulatory context)
- Mode 2: Online Reference Links (for EUR-Lex, regulator sites)
- Mode 3: Local Folder (for bulk document access)
- Mode 4: Combined (default for most engagements)

### 6.6 Review Engine

The engagement's Phase 8 quality gate uses the existing Review Engine (5 review modes) but orchestrates them in a structured sequence rather than ad-hoc.

### 6.7 Coding Area

For engagements that involve technology assessment (system reviews, code audits), the Coding Area's Tier 1 (Code Review & Explain) and Tier 2 (Single File) capabilities can be invoked from within an engagement workstream.

### 6.8 Export Pipeline

Engagement deliverables use the existing export infrastructure (DOCX, XLSX, PPTX, PDF) but may produce **multiple coordinated outputs** — a gap report in DOCX plus a scoring matrix in XLSX plus a management summary in PPTX, all from the same engagement data.

### 6.9 Collaborative Canvas

For engagements with multiple human team members, the Collaborative Canvas can be used for internal review before client delivery. Engagement outputs can be pushed to a canvas session for team review.

### 6.10 Discovery Mode

The Lite Engagement path (Phase 1b) is essentially a specialised Discovery Mode conversation tuned for engagement scoping. It should reuse the Discovery Mode infrastructure where possible.

---

## 7. UI Architecture

### Navigation

The Engagement Task appears as a new item in the main navigation under Interactive Modes:

```
Interactive Modes
├── Standard Module Workspace
├── Brief Me
├── Guide Me
├── Batch Create
├── Workflow Builder
├── Collaborative Canvas
├── Review Engine
└── ⭐ Engagement Task (NEW)
```

### Page Structure

**Engagement List Page** (`EngagementListPage.tsx`)
- List of all engagements with status, client, domain, last activity
- "New Engagement" button → Phase 1
- Filter by status, domain, client
- Quick actions: Resume, Archive, Duplicate as template

**Engagement Workspace Page** (`EngagementWorkspacePage.tsx`)
- Persistent header: Engagement title, client, status, phase indicator
- Phase navigation sidebar (Phases 1-8 including sub-phases, with completion indicators):
  - Phase 1: Setup & Context (1b: Lite Setup)
  - Phase 2: Scope Agreement
  - Phase 2a: Client Intelligence
  - Phase 2b: Regulatory Pre-Analysis
  - Phase 3: Resource Collection (3a: Good Example)
  - Phase 4: Expert Configuration
  - Phase 5: Workstream Planning
  - Phase 6: Execution
  - Phase 7: Review & Iteration
  - Phase 8: Quality Gate
- Main content area: current phase UI
- Right panel: Dashboard / resource status / expert panel / client card (collapsible)
- Bottom bar: Actions relevant to current phase

**Phase Components:**
- `EngagementSetup.tsx` — Phase 1 UI
- `EngagementLiteSetup.tsx` — Phase 1b UI
- `EngagementScopeAgreement.tsx` — Phase 2 UI
- `EngagementClientIntelligence.tsx` — Phase 2a UI
- `EngagementRegulatoryPreAnalysis.tsx` — Phase 2b UI
- `EngagementResourceCollection.tsx` — Phase 3 UI
- `EngagementGoodExample.tsx` — Phase 3a UI
- `EngagementConfiguration.tsx` — Phase 4 UI
- `EngagementWorkstreams.tsx` — Phase 5 UI
- `EngagementExecution.tsx` — Phase 6 UI
- `EngagementReview.tsx` — Phase 7 UI
- `EngagementQualityGate.tsx` — Phase 8 UI

**Shared Components:**
- `EngagementDashboard.tsx` — Progress dashboard (persistent from Phase 5 onward)
- `EngagementResourcePanel.tsx` — Resource category panels with upload + status
- `EngagementScopeCard.tsx` — Reusable scope item display
- `EngagementClientCard.tsx` — Client intelligence profile display
- `EngagementRegulatoryInventory.tsx` — Regulatory source list with confirmation controls
- `EngagementInterpretationCard.tsx` — Individual regulatory interpretation display
- `EngagementCommunicationDraft.tsx` — Client communication composer
- `EngagementChangeLog.tsx` — Audit trail viewer
- `EngagementScopeCreepAlert.tsx` — Scope creep notification component

---

## 8. Implementation Priority

### MVP (Phase 1 — Essential)

Build the core flow that delivers immediate value:

1. **Phase 1: Setup** — Full Engagement path with engagement letter upload and extraction
2. **Phase 2: Scope Agreement** — Extracted scope review and confirmation
3. **Phase 2a: Client Intelligence** — Client profile from documents + user input (online research in Phase 2)
4. **Phase 3: Resource Collection** — Category-based upload with status toggles
5. **Phase 3a: Good Example Extraction** — Quality Blueprint generation
6. **Phase 6: Execution** — Single-workstream execution using existing prompt builder (with client intelligence + regulatory context in prompt)
7. **Phase 7: Review** — Gap analysis and iteration support (7A + 7B)
8. Basic export of deliverables

**Why this ordering:** This gives the user the complete extract → confirm → understand client → collect → execute → iterate loop. Client intelligence and regulatory context are in the MVP because without them, outputs are generically correct but practically disconnected — which defeats the purpose of a structured engagement tool.

### Phase 2 — Full Feature

Add the structural and quality capabilities:

9. **Phase 1b: Lite Setup** — Internal engagement path
10. **Phase 2b: Regulatory Pre-Analysis** — Full regulatory inventory with interpretation alignment
11. **Phase 4: Expert Configuration** — Expert panel and thinking level setup
12. **Phase 5: Workstream Decomposition** — Multi-workstream planning and tracking
13. **Phase 7C: Scope Creep Detection** — Automated scope monitoring
14. **Phase 7D: Client Communications** — Draft generation
15. **Phase 8: Quality Gate** — Full quality assurance process
16. Dashboard and progress tracking
17. Change log and audit trail
18. Client Intelligence — online research channel (web search integration)

### Phase 3 — Ecosystem

Build the connective tissue:

16. **Phase 7E: Stakeholder Sign-off** — Governance tracking
17. Multi-workstream parallel execution
18. Engagement-to-module bridge
19. Template creation from completed engagements
20. `.anton` package export for marketplace
21. Collaborative Canvas integration for team review
22. Workflow Engine integration for complex execution patterns

---

## 9. Key Design Principles

1. **Speed on foundations.** Extraction from engagement letter, project plan, and good example must be fast and accurate. Everything downstream depends on getting this right quickly. Don't make users wait or re-explain what's already in their documents.

2. **Stick to what was agreed.** ANTON does not invent scope, timelines, or methodology. It structures and executes what the humans agreed to do. When it finds gaps or ambiguities, it asks — it doesn't assume.

3. **Iterate with purpose.** Each iteration should clearly identify what information would most improve the output. The iteration cycle isn't just "try again" — it's "here's specifically what to get from the client to make this better."

4. **Professional context matters.** An engagement from EY for Nordea in FCP is different from an internal risk review at a mid-size bank. The professional context (who you are, who the client is, what domain) shapes everything: communication style, quality expectations, citation depth, formality level.

5. **Re-enterable, not linear.** Phases are a logical sequence but real work is messy. Resources arrive late. Scope changes. New information surfaces. Every phase must support going back and adjusting without breaking what came after.

6. **Audit trail is non-negotiable.** In regulated industries, demonstrating how conclusions were reached and what methodology was followed is as important as the conclusions themselves. Every change, every decision, every iteration is logged.

7. **The good example is the secret weapon.** The ability to deconstruct a previous engagement's deliverable and use it as the quality standard for the current one is the single most differentiating feature. It captures tacit knowledge that would otherwise take years to absorb. Invest in getting this extraction deep and accurate.

8. **Two on-ramps, same destination.** Full engagements with formal letters and lite engagements with just a conversation both end up at the same structured scope view. The lite path should feel natural, not like a bureaucratic workaround.

9. **Know the client, not just the scope.** Generic analysis is the enemy of professional work. A finding that says "the institution should improve CDD processes" is worth nothing. A finding that says "Nordea's digital onboarding flow for Nordic retail customers lacks the risk-differentiated verification required by AMLR Article 16(2), given the customer segment's profile and the ECB's stated supervisory expectations" is worth thousands. Client intelligence makes this difference.

10. **Agree on the law before you apply it.** Regulatory interpretation disagreements discovered during review are expensive and demoralising. By making interpretation explicit, confirmable, and documented before execution, the team (human and AI) works from the same regulatory foundation. When a finding cites Article 16, everyone knows exactly how Article 16 is being read.

---

## 10. Competitive Positioning

No existing tool does this. Let's be precise about why:

**Harvey AI** — Document analysis for legal. Single-domain. No engagement lifecycle, no workstream management, no iteration cycles, no quality blueprints from good examples.

**Legora** — Legal document automation. Template-driven. Doesn't understand consulting methodology, doesn't decompose engagements, doesn't iterate with gap analysis.

**ChatGPT / Claude (raw)** — Can do individual analysis tasks well. Cannot manage an engagement lifecycle, track resources across categories, maintain scope boundaries, detect scope creep, or produce coordinated multi-deliverable outputs with consistent quality standards.

**n8n / Zapier** — Automation tools. Can sequence tasks but have zero domain expertise, no understanding of professional engagement structure, no quality judgment.

**Cursor / Lovable** — Code tools. Entirely different domain.

**ANTON's Engagement Task** — The only tool that combines engagement letter comprehension, structured scope management, multi-domain expertise, methodology-aware execution, quality standard extraction from good examples, iterative gap-driven improvement, scope creep detection, client communication generation, and professional quality assurance in a single, integrated workflow. It understands how professionals actually work because it was built by someone who has spent 14+ years doing this work.

---

## 11. Marketplace & Community Implications

The Engagement Task creates high-value content for the future marketplace:

**Engagement Templates** — Anonymised, completed engagement structures become templates. A community member who has done 20 AMLR gap assessments can share a template that includes optimal scope structure, comprehensive resource checklists, proven quality blueprints, and effective expert panel configurations. This is worth hundreds of hours of experience, shared freely.

**Quality Blueprints** — Extracted quality patterns from good examples can be shared independently. "Big 4 Regulatory Report Style" or "Board Presentation Format — Nordic Banking" become reusable quality packages.

**Resource Checklists** — The "what documents do you need for an AMLR gap assessment" checklist, refined across multiple engagements, becomes community knowledge.

**Expert Panel Configurations** — "Optimal expert panel for a data privacy review" with specific persona combinations and review modes that produce the best results.

All shareable as `.anton` packages, discoverable through the marketplace, and composable with other community contributions.

---

*This specification is version 1.0, authored for the openEXPERT / ANTON platform by Daniel Bardun / FutureChain AB.*
