# openEXPERT Expansion Proposal: Entertainment & Creative Production + Healthcare & Community Health

**Date:** February 27, 2026  
**Author:** Claude (Opus 4.6) for Daniel Bardun / FutureChain AB  
**Status:** Draft for iteration  
**Context:** Wine-fuelled brainstorm → structured proposal

---

## The Big Picture

Two new expansion domains, each with a fundamentally different character:

**Entertainment & Creative Production** — a *joyful* expansion. Low risk, high creative potential, enormous market. This is about giving creative professionals the same structured AI collaboration that compliance officers already have. The creative industry has massive unmet need for AI that understands craft, not just content generation.

**Healthcare & Community Health** — a *careful* expansion. High stakes, high impact, requires safety architecture that doesn't exist in the platform yet. But also potentially the most important thing openEXPERT ever does — especially the rural/underserved track. This one needs to be done right or not at all.

Both domains introduce capabilities that benefit the entire platform, not just their own areas. That's the hallmark of a good expansion.

---

## DOMAIN 1: ENTERTAINMENT & CREATIVE PRODUCTION

### Why This Is Different from Branding & Creative (Area 22)

Area 22 exists and has 5 modules focused on *marketing* — brand strategy, content marketing, visual identity. That's about *selling* creative work.

What Daniel described is about *making* creative work — the actual production pipeline: writing, translating, reviewing, testing, refining, and preparing for publication. These are fundamentally different professional workflows with different users, different quality standards, and different expert knowledge.

Think of it this way: Area 22 helps you market a film. This new area helps you write the screenplay, translate it for international distribution, run it through focus groups, and prepare it for production.

### The Creative Production Pipeline

The creative industry has a well-established professional pipeline that maps beautifully onto openEXPERT's module architecture:

```
Concept → Development → Review → Testing → Refinement → Pre-Publication → Market Analysis
```

Each stage has distinct professional tasks, quality standards, and expert perspectives — exactly what modules are designed to capture.

---

### AREA 30: Creative & Entertainment Production (New Area — 8 Modules)

**Area ID:** `creative-production`  
**Primary Users:** Writers, playwrights, screenwriters, translators, editors, publishers, producers, game narrative designers  
**Area Context:** Creative production workflows from concept through publication, covering dramatic writing, literary translation, editorial review, audience testing, and market preparation.

---

#### Module 1: Script & Screenplay Development Studio

**ID:** `script-development`  
**Purpose:** Structured creation and development of screenplays, stage plays, teleplays, and game narratives  
**Thinking:** `think_hard`  
**Creativity:** `balanced` (this is where creativity settings really earn their keep)

**What makes this different from "just asking Claude to write a script":**
The module encodes *craft knowledge* — three-act structure, the beat sheet, character arc methodology, dialogue techniques, format standards (Final Draft formatting for screenplays, Samuel French formatting for stage plays). It knows that a screenplay page roughly equals one minute of screen time. It knows that stage directions in a play serve a fundamentally different function than action lines in a screenplay. It knows genre conventions and when to subvert them.

**Guided Inputs:**
- Format: Screenplay / Stage Play / Teleplay / Game Narrative / Audio Drama / Short Film
- Genre: (multiselect) Drama, Comedy, Thriller, Horror, Sci-Fi, Fantasy, Documentary, Musical, etc.
- Stage: Concept/Logline → Treatment → Outline → First Draft → Revision
- Tone reference: (freetext) "Like Fleabag meets The Favourite" 
- Structure: Three-Act / Five-Act / Episodic / Non-linear / Anthology
- Constraints: Cast size, location count, budget tier, running time target

**Output Formats:** Script pages (proper formatting), character breakdowns, scene-by-scene outlines, beat sheets, revision notes

**Cross-Area Links:**
- → Area 2 (Legal): IP & rights review
- → Area 22 (Branding): Marketing positioning
- → Area 11 (Project Management): Production scheduling

---

#### Module 2: Literary & Dramatic Translation Workshop

**ID:** `literary-translation`  
**Purpose:** Translation of creative works with cultural adaptation, register matching, and idiomatic equivalence  
**Thinking:** `think_hard`  
**Creativity:** `balanced`

**Why this is genuinely hard and valuable:**
Literary translation isn't word-for-word conversion. It's re-creation. A joke that works in Swedish might need a completely different setup in English. A cultural reference that's obvious in one market is opaque in another. Rhythm and cadence matter in dialogue. Formal/informal registers vary between languages. This module encodes translation theory (Nida's dynamic equivalence, Venuti's domestication vs foreignization) and applies it practically.

**Guided Inputs:**
- Source language / Target language
- Work type: Novel / Play / Screenplay / Poetry / Song lyrics / Game dialogue / Subtitle / Marketing copy
- Translation philosophy: Faithful/literal ↔ Free/adaptive (slider)
- Cultural adaptation level: Minimal / Moderate / Full localization
- Register: Formal / Informal / Mixed / Period-specific
- Reference material: (upload) Source text, glossary, style guide, previous translations

**Output Formats:** Translated text with translator's notes, cultural adaptation log, register analysis, alternative renderings for key passages

**Unique Feature — Side-by-Side Mode:** Shows source and translation in parallel with annotation layer explaining choices. This is how professional translation review actually works.

---

#### Module 3: World-Building & Setting Engine

**ID:** `world-building`  
**Purpose:** Create and maintain consistent fictional universes with internal rules, geography, culture, history, and timelines  
**Thinking:** `investigate`  
**Creativity:** `creative`

**The problem this solves:**
Any writer working on a series, a shared universe, or a complex narrative world knows the pain of consistency. What colour were the protagonist's eyes in chapter 3? What's the distance between the two cities? What's the monetary system? The World-Building module creates a structured, queryable "bible" for a fictional universe.

**Guided Inputs:**
- World type: Fantasy / Sci-Fi / Historical / Contemporary Alternate / Hybrid
- Scope: Single location / Region / Planet / Multi-world / Universe
- Focus areas: (multiselect) Geography, Politics, Economy, Religion, Magic/Technology Systems, Languages, Species/Races, History, Social Structure
- Existing material: (upload) Previous drafts, notes, maps, reference images
- Consistency priority: Internal logic vs. narrative convenience (slider)

**Output Formats:** World bible (structured reference document), timeline, character registry, location database, rules/magic system documentation, consistency checker reports

**Key Innovation — Consistency Checking:**
Upload a draft chapter and the module checks it against the established world bible, flagging inconsistencies. "In Chapter 12 you say the journey takes three days, but based on your established geography and travel speeds, it should take seven."

---

#### Module 4: Editorial & Proofreading Suite

**ID:** `editorial-review`  
**Purpose:** Multi-pass editorial review from developmental edit through line edit to copy edit and proofread  
**Thinking:** `think_hard`  
**Creativity:** `strict`

**What makes this professional-grade:**
Publishing uses distinct editorial passes, each with a different focus. A developmental edit looks at structure, pacing, character arcs. A line edit looks at prose style, voice, rhythm. A copy edit looks at grammar, consistency, fact-checking. A proofread catches typos and formatting. Most AI tools blur all of these together. This module separates them, like a real editorial process.

**Guided Inputs:**
- Edit type: Developmental / Line / Copy / Proofread / Sensitivity Read / Full (all passes)
- Work type: Novel / Short story / Play / Screenplay / Academic / Business / Poetry
- Style guide: Chicago / AP / House style (upload)
- Voice notes: (freetext) "Maintain the author's distinctive use of sentence fragments"
- Sensitivity areas: (multiselect) Cultural, Gender, Disability, Age, Religion, Political

**Output Formats:** Annotated manuscript (tracked changes style), editorial letter, style sheet, query list, pass-by-pass breakdown

---

#### Module 5: Audience & Focus Group Simulator

**ID:** `audience-testing`  
**Purpose:** Simulate audience reactions to creative content by testing against configurable reader/viewer personas  
**Thinking:** `think_hard`  
**Creativity:** `balanced`

**The insight here:**
Real focus groups are expensive and slow. But the *methodology* is well-established: you define target audience segments, present content, and gather structured reactions. This module simulates that process by creating detailed audience personas (not just "millennial women" but personas with reading habits, cultural references, emotional triggers, attention patterns) and running content against them.

**Guided Inputs:**
- Content type: Script excerpt / Chapter / Synopsis / Logline / Trailer description / Game narrative
- Target audiences: (configure up to 5 personas with demographics, psychographics, media consumption habits)
- Test focus: Emotional impact / Comprehension / Engagement / Cultural resonance / Marketability
- Comparison: (optional) Upload competitor content for relative positioning

**Output Formats:** Persona reaction reports, engagement score matrix, "drop-off" analysis (where attention wanders), cultural sensitivity flags, suggested revisions per audience segment, market positioning summary

**Cross-Area Links:**
- → Area 22 (Branding): Market positioning
- → Area 7 (Data): Audience analytics methodology
- → Area 12 (Strategy): Go-to-market strategy

---

#### Module 6: Story Collaboration & Continuity Manager

**ID:** `story-collaboration`  
**Purpose:** Manage multi-author storylines, character handoffs, continuity tracking, and narrative coordination  
**Thinking:** `think`  
**Creativity:** `balanced`

**Who needs this:**
TV writers' rooms, shared-universe novel series, comic book continuity, game narrative teams — anywhere multiple writers contribute to the same narrative. The module tracks character arcs across episodes/chapters/issues, maintains a shared voice guide, and flags continuity conflicts.

**Guided Inputs:**
- Project type: TV Series / Novel Series / Comic Series / Shared Universe / Anthology / Game
- Number of contributors / episodes / chapters
- Existing canon: (upload) Previous episodes, style guides, character sheets
- Conflict resolution: Flag only / Suggest resolution / Auto-harmonize

**Output Formats:** Continuity tracker, character arc timeline, voice consistency report, handoff briefings ("here's where Character X is emotionally at the start of your episode"), conflict log

---

#### Module 7: Pre-Publication & Submission Readiness

**ID:** `pre-publication`  
**Purpose:** Assess manuscript/script readiness for submission to agents, publishers, festivals, or production companies  
**Thinking:** `investigate`  
**Creativity:** `strict`

**The professional gate:**
Before a creative work goes out into the world, it needs to meet professional standards — not just quality, but format, market fit, and submission requirements. This module simulates the assessment an agent or script reader would perform: "Is this market-ready? Does it meet submission guidelines? What's the elevator pitch?"

**Guided Inputs:**
- Submission target: Literary agent / Publisher / Film festival / Production company / Self-publication / Game studio
- Genre/market: (selected from current market categories)
- Manuscript: (upload) Full or partial manuscript
- Submission requirements: (upload or describe) Word count limits, formatting rules, genre guidelines

**Output Formats:** Readiness assessment (RAG-rated), submission package review (query letter, synopsis, first pages), market positioning analysis, comparable titles analysis ("comp titles"), recommended submission targets

---

#### Module 8: Market Reach & Audience Analysis

**ID:** `market-reach`  
**Purpose:** Analyse market potential, audience demographics, distribution strategy, and competitive landscape for creative works  
**Thinking:** `think_hard`  
**Creativity:** `strict`

**Guided Inputs:**
- Work type & genre
- Target markets: (multiselect) Domestic / European / US / Global / Specific territories
- Distribution: Traditional publishing / Self-publishing / Streaming / Theatrical / Festival circuit / Digital-first
- Budget tier: Micro / Indie / Mid-range / Studio
- Comparable works: (list 3-5 reference titles)

**Output Formats:** Market analysis report, audience size estimation, competitive landscape map, distribution strategy recommendation, revenue modeling (by scenario), rights and licensing opportunities

---

### STANDALONE FEATURE: Creative Review Panel

**Type:** Standalone engagement feature (like Sounding Board / Challenge This)  
**ID:** `creative-review-panel`

**Concept:** 
Like the expert panel review in the Coding Area, but for creative works. The user submits a creative piece, and ANTON runs it through multiple expert personas simultaneously — each providing a distinct professional perspective:

- **The Agent** — "Will this sell? Is there a market? What's the hook?"
- **The Dramaturg** — "Does the structure work? Are the stakes clear? Where does it sag?"
- **The Target Reader/Viewer** — "Am I engaged? Do I care about these characters? Would I recommend this?"
- **The Sensitivity Reader** — "Are there blind spots? Stereotypes? Harmful representations?"
- **The Technical Expert** — "Is the format correct? Are the stage directions clear? Is the dialogue speakable?"

Users select 2-4 reviewers. Each returns a structured review. Then a synthesis highlights consensus and disagreements.

**Implementation:** Uses the existing expert panel review workflow pattern from the Coding Area. Each reviewer is a persona with specific evaluation criteria. The synthesis step uses the existing parallel review + consensus mechanism.

**Why standalone rather than module:** This is a *mode of engagement* with creative content, not a specific task. You might run it on a first draft, then again on a revision, then again before submission. It complements multiple modules.

---

### STANDALONE WORKFLOW: Creative Production Pipeline

**Type:** Pre-built workflow template  
**ID:** `creative-pipeline`

**A complete end-to-end workflow connecting multiple modules:**

```
Step 1: Script Development (Module 1) — Create/develop the work
    ↓
Step 2: World-Building check (Module 3) — Verify consistency
    ↓
Step 3: Editorial Review (Module 4) — Developmental edit pass
    ↓ [CHECKPOINT: Author reviews feedback, revises]
Step 4: Creative Review Panel (Standalone) — Multi-perspective review
    ↓ [CHECKPOINT: Author incorporates feedback]
Step 5: Audience Testing (Module 5) — Focus group simulation
    ↓
Step 6: Final Editorial (Module 4) — Copy edit + proofread
    ↓
Step 7: Pre-Publication Review (Module 7) — Readiness assessment
    ↓
Step 8: Market Analysis (Module 8) — Distribution strategy
    ↓ [CHECKPOINT: Submission ready]
Step 9: (Optional) Translation (Module 2) — International markets
```

**This is a workflow template users can customise** — skip steps, add iterations, change the order. But having the full pipeline pre-built shows the power of the platform for creative production.

---

---

## DOMAIN 2: HEALTHCARE & COMMUNITY HEALTH

### The Careful Expansion

Daniel is absolutely right that healthcare is a domain where AI can do immense good *and* immense harm. The "everything is cancer" problem is real — WebMD has trained a generation to catastrophize, and poorly designed AI health tools could make it worse.

But the opportunity is equally real. There are two fundamentally different user groups with different needs and different risk profiles:

**Track A: Healthcare Professionals** — Doctors, nurses, and admin staff who need help with paperwork, documentation, and information synthesis so they can spend more time with patients. Risk profile: LOW (professionals can evaluate AI output against their training). 

**Track B: Community & Rural Health** — People who genuinely lack access to healthcare and need guidance that's better than Google but knows its own limitations. Risk profile: HIGH (users may not be able to evaluate medical information critically). This requires a completely new safety architecture.

### The Safety Architecture for Healthcare

Before describing modules, let me describe the safety principles that should govern everything in this domain:

**Principle 1: Never Diagnose, Always Guide**
ANTON never says "you have X." It says "your symptoms are consistent with several conditions including X, Y, and Z. Here's what each means and what to discuss with a healthcare provider."

**Principle 2: Questions First, Always**
Unlike most modules where the user provides input and gets output, healthcare modules *always* start by asking questions. The default mode is diagnostic interview, not information delivery.

**Principle 3: Red Flag Escalation**
Certain symptom combinations trigger immediate, unambiguous messaging: "Based on what you've described, you should seek emergency medical attention now. Here's why." No hedging, no nuance — clear, directive, potentially life-saving.

**Principle 4: Confidence-Weighted Multi-Model Deliberation (NEW PLATFORM CAPABILITY)**
This is Daniel's insight and it's brilliant. For high-stakes health guidance, a single model run isn't enough. The platform should run the same query through multiple models with different strengths and then synthesise:

```
User describes symptoms
        ↓
┌───────────────────────────────────────────────┐
│         PARALLEL MODEL DELIBERATION           │
├───────────────┬───────────────┬───────────────┤
│   Opus 4.6    │  Sonnet 4.5   │   Haiku 4.5   │
│ Deep clinical │ Pattern match │ Triage & red  │
│ reasoning,    │ common        │ flags, quick  │
│ rare          │ conditions,   │ safety check, │
│ conditions,   │ practical     │ immediate     │
│ complex       │ next steps    │ action items  │
│ interactions  │               │               │
├───────────────┴───────────────┴───────────────┤
│            DELIBERATION ENGINE                │
│  - Compare answers across models              │
│  - Weight by confidence and agreement         │
│  - Flag disagreements explicitly              │
│  - Apply safety rules (red flags override)    │
│  - Generate unified guidance with confidence  │
│    scores per recommendation                  │
└───────────────────────────────────────────────┘
        ↓
Unified response with:
- Confidence level (High/Medium/Low)
- Agreement level (All models agree / Majority / Split)
- Red flags (if any — these override everything)
- Recommended actions (ranked)
- "See a doctor if..." thresholds
```

**This Multi-Model Deliberation Protocol is a platform-level feature.** Once built for healthcare, it can be reused for any high-stakes domain: legal advice, financial decisions, safety-critical engineering. It's the AI equivalent of "getting a second opinion."

**Principle 5: Transparency of Limitations**
Every healthcare response includes what ANTON *cannot* do: "I cannot examine you physically, run lab tests, or access your medical history. This guidance is based solely on what you've told me and should complement, not replace, professional medical care."

---

### AREA 31: Healthcare Professional Tools (Expanding Area 24)

The existing Healthcare & Life Sciences area (Area 24) has 5 modules but they're relatively light. Rather than creating a completely new area, we expand Area 24 significantly with professional-grade modules that help healthcare workers be more efficient.

**Area ID:** `healthcare` (existing, expanded)  
**Primary Users:** Doctors, nurses, practice managers, hospital administrators, medical researchers  
**Risk Level:** LOW-MEDIUM (professional users who can evaluate output)

---

#### Module 6 (new): Clinical Documentation Assistant

**ID:** `clinical-documentation`  
**Purpose:** Generate structured clinical documents — patient notes, referral letters, discharge summaries, care plans — from minimal input  
**Thinking:** `think`  
**Creativity:** `strict` (medical documentation must be precise)

**The value proposition:**
Doctors spend up to 2 hours per day on documentation. This module takes brief clinical notes or bullet points and generates properly structured, medically accurate documents that the doctor reviews and approves. It knows the difference between a SOAP note and an admission history. It uses appropriate medical terminology. It structures information the way receiving clinicians expect to read it.

**Guided Inputs:**
- Document type: SOAP Note / Referral Letter / Discharge Summary / Care Plan / Progress Note / Procedure Note / Death Certificate Narrative
- Clinical context: (freetext) Brief notes, key findings, relevant history
- Patient demographics: Age, sex (for clinical relevance — e.g., pregnancy considerations)
- Specialty: General Practice / Cardiology / Oncology / Paediatrics / Psychiatry / Surgery / Emergency / etc.
- Urgency: Routine / Urgent / Emergency
- Recipient: (for referrals) Specialty, known preferences

**Output Formats:** Structured clinical document, ready for review and signature

**Safety Features:**
- Flags drug interactions mentioned in notes
- Highlights missing required fields
- Never invents clinical findings — only structures what's provided
- Clear "DRAFT — REQUIRES PHYSICIAN REVIEW" watermark

---

#### Module 7 (new): Medical Evidence Synthesiser

**ID:** `evidence-synthesis`  
**Purpose:** Synthesise medical research for clinical decision support — systematic review of evidence for specific clinical questions  
**Thinking:** `investigate`  
**Creativity:** `strict`

**Guided Inputs:**
- Clinical question: (PICO format encouraged: Patient/Problem, Intervention, Comparison, Outcome)
- Evidence scope: Latest guidelines only / Systematic reviews / All published evidence
- Specialty context
- Patient population specifics

**Output Formats:** Evidence summary (graded by quality: RCT > Cohort > Case series > Expert opinion), treatment comparison matrix, guideline concordance check, knowledge gaps identified

---

#### Module 8 (new): Practice Management & Admin Optimizer

**ID:** `practice-management`  
**Purpose:** Administrative tasks — scheduling optimization, patient communication templates, compliance documentation, staff rostering  
**Thinking:** `think`  
**Creativity:** `balanced`

**Guided Inputs:**
- Task type: Scheduling / Patient Communication / Compliance Report / Staff Roster / Budget Planning / Quality Improvement
- Practice type: Solo GP / Group Practice / Hospital Department / Clinic
- Jurisdiction: (for regulatory compliance — varies by country)

**Output Formats:** Optimized schedules, communication templates, compliance checklists, improvement plans

---

#### Module 9 (new): Patient Education Material Creator

**ID:** `patient-education`  
**Purpose:** Create clear, accurate, appropriate patient education materials at the right literacy level  
**Thinking:** `think`  
**Creativity:** `balanced`

**Why this matters:**
Health literacy is a massive problem. Most patient education materials are written at a reading level too high for the people who need them most. This module creates materials that are medically accurate *and* genuinely accessible.

**Guided Inputs:**
- Condition / Procedure / Medication
- Reading level target: Basic / Intermediate / Advanced
- Language: (for future localization)
- Format: Leaflet / FAQ / Video script / Poster / Digital
- Cultural considerations: (freetext)

**Output Formats:** Patient-ready education material, reading level assessment, medical accuracy checklist, visual layout suggestions

---

### AREA 32: Community Health Advisor (New Area)

**Area ID:** `community-health`  
**Primary Users:** Individuals in rural/underserved areas, community health workers, first responders in remote locations  
**Risk Level:** HIGH — requires Multi-Model Deliberation Protocol  
**Default behaviour:** Questions first. Always. Never jump to conclusions.

**This is the revolutionary area.** It's also the one that requires the most care. Every module in this area uses the Multi-Model Deliberation Protocol by default. Every response is confidence-weighted. Every interaction starts with questions.

---

#### Module 1: Symptom Guidance Advisor

**ID:** `symptom-guidance`  
**Purpose:** Help people understand symptoms and make informed decisions about seeking care  
**Thinking:** `investigate`  
**Creativity:** `strict`  
**Model:** Multi-Model Deliberation (Opus + Sonnet + Haiku) — MANDATORY

**THIS IS NOT A DIAGNOSTIC TOOL.** This is a structured conversation that helps someone in a rural area with limited healthcare access understand what their symptoms might mean and what level of care they should seek.

**How it works:**

1. **Triage Phase (Haiku — fast):** Immediate red flag check. "Are you experiencing chest pain, difficulty breathing, severe bleeding, signs of stroke, or allergic reaction?" If yes → immediate emergency guidance, skip everything else.

2. **Interview Phase (Sonnet — thorough but efficient):** Structured symptom interview. Duration, severity, progression, associated symptoms, medical history, medications, allergies. The module asks follow-up questions based on answers — it doesn't just collect a checklist.

3. **Analysis Phase (All three models in parallel):**
   - **Opus:** Deep differential reasoning, considers rare conditions, drug interactions, complex presentations
   - **Sonnet:** Common condition matching, practical next steps, self-care where appropriate
   - **Haiku:** Re-runs triage with full symptom picture, flags anything that needs urgent attention

4. **Deliberation Phase (Platform engine):**
   - Compares all three analyses
   - Scores agreement level
   - If all three agree → high confidence
   - If two agree, one differs → medium confidence, note the dissent
   - If all three differ → low confidence, recommend professional consultation
   - Red flags from ANY model override everything

5. **Response:**
   - What your symptoms might indicate (ranked by likelihood, not scariness)
   - Confidence level of the assessment
   - Recommended action: Self-care / See doctor when convenient / See doctor soon / Seek urgent care / Emergency
   - What to tell the doctor (structured summary they can show or read)
   - Self-care guidance where appropriate (evidence-based only)
   - What to watch for (warning signs that should change the plan)

**What it NEVER does:**
- Never diagnoses ("you have X")
- Never prescribes ("take X medication")
- Never overrides professional medical advice
- Never minimises symptoms to avoid "bothering" the user
- Never catastrophises common conditions

**Safety Rails:**
- Hard-coded red flag list that triggers emergency guidance regardless of other analysis
- Mandatory "limitations" disclosure in every response
- Session logging for quality review
- Escalation pathway to telemedicine if available
- Cannot be used for children under 2 without directing to professional care

---

#### Module 2: Medication & Treatment Information

**ID:** `medication-info`  
**Purpose:** Provide clear, accurate information about medications, treatments, and their interactions  
**Thinking:** `investigate`  
**Creativity:** `strict`  
**Model:** Multi-Model Deliberation — MANDATORY

**What it does:**
Someone in a rural area has been prescribed a medication by a visiting doctor but has questions. Or they're taking multiple medications and want to understand interactions. Or they want to know about side effects they're experiencing.

**What it NEVER does:**
- Never recommends starting, stopping, or changing medications
- Never provides dosage guidance
- Always directs medication changes to their prescriber

**Guided Inputs:**
- Question type: Understanding my medication / Side effects / Interactions / Storage / What to ask my doctor
- Current medications: (list)
- Conditions: (list)
- Specific concern: (freetext)

---

#### Module 3: First Aid & Emergency Guidance

**ID:** `first-aid`  
**Purpose:** Immediate, practical first aid guidance for emergencies where professional help is not immediately available  
**Thinking:** `quick` (speed matters in emergencies)  
**Creativity:** `strict`  
**Model:** Haiku primary (speed), Sonnet secondary (verification)

**This is the "satellite phone" module.** For someone 2 hours from the nearest hospital, knowing what to do RIGHT NOW can save a life. The module provides step-by-step, plain-language first aid guidance for common emergencies.

**Guided Inputs:**
- Emergency type: Bleeding / Burns / Fracture / Choking / Allergic reaction / Snake/insect bite / Drowning / Heat stroke / Hypothermia / Poisoning / Seizure / Heart attack signs / Stroke signs / Childbirth complications
- Patient: Adult / Child / Infant
- Resources available: Basic first aid kit / Nothing / Vehicle for transport / Phone for emergency services

**Output:** Step-by-step instructions, what NOT to do (critical — many first aid myths cause harm), when to transport vs. wait for help, ongoing care while waiting

---

#### Module 4: Maternal & Child Health Guide

**ID:** `maternal-child-health`  
**Purpose:** Pregnancy, childbirth, newborn care, and child development guidance for underserved communities  
**Thinking:** `think_hard`  
**Creativity:** `strict`  
**Model:** Multi-Model Deliberation — MANDATORY

**Why this deserves its own module:**
Maternal and child mortality in rural/underserved areas is one of the biggest global health challenges. Many deaths are preventable with basic knowledge: warning signs in pregnancy, when to seek emergency obstetric care, newborn danger signs, nutrition guidance, vaccination schedules.

**Guided Inputs:**
- Stage: Trying to conceive / Pregnancy (which trimester) / Labour & delivery / Postpartum / Newborn (0-28 days) / Infant (1-12 months) / Toddler (1-5 years)
- Concern: (freetext)
- Available care: Hospital access / Health centre / Community health worker / None

**Safety Rails:**
- Pregnancy danger signs (pre-eclampsia symptoms, bleeding, reduced fetal movement) trigger immediate emergency guidance
- Newborn danger signs (not feeding, high fever, jaundice, breathing difficulty) trigger immediate escalation
- Never provides guidance that could delay necessary emergency obstetric care

---

#### Module 5: Mental Health & Wellbeing Support

**ID:** `mental-health-support`  
**Purpose:** Mental health information, coping strategies, and guidance on seeking professional support  
**Thinking:** `think_hard`  
**Creativity:** `balanced`  
**Model:** Multi-Model Deliberation — MANDATORY

**The gap this fills:**
Mental health services are scarce everywhere but especially in rural/underserved areas. Stigma is often higher. This module provides evidence-based information about mental health conditions, practical coping strategies, and clear guidance on when and how to seek professional help.

**What it NEVER does:**
- Never provides therapy (it's information and support, not treatment)
- Never diagnoses mental health conditions
- Never minimises distress
- Never suggests stopping psychiatric medication
- Suicidal ideation triggers immediate crisis resource provision and supportive response

**Guided Inputs:**
- Topic: Understanding a condition / Coping strategies / Supporting someone else / Finding professional help / Crisis support
- Context: (freetext)
- Available resources: Professional services available / Community support only / Very limited

---

### STANDALONE FEATURE: Multi-Model Deliberation Protocol

**Type:** New platform-level capability  
**ID:** `multi-model-deliberation`

This is the biggest technical innovation in this proposal. Built for healthcare but applicable across the platform for any high-stakes decision.

**How it works at the platform level:**

1. **Configuration:** Module specifies which models participate and their roles
2. **Parallel Execution:** All specified models receive the same prompt (with role-specific instructions) simultaneously
3. **Response Collection:** All responses collected
4. **Deliberation Engine:** New service (`deliberation-engine.ts`) compares responses:
   - Extracts key claims/recommendations from each
   - Scores agreement (unanimous / majority / split)
   - Identifies disagreements with explanations
   - Applies domain-specific safety rules (red flags override)
   - Generates confidence-weighted synthesis
5. **Output:** Unified response with transparency about the deliberation process

**Why this matters beyond healthcare:**
- Legal advice: Three models deliberate on contract risk
- Financial decisions: Three models evaluate investment risk
- Safety-critical engineering: Three models review a design
- Regulatory interpretation: Three models analyse a new requirement

**Cost consideration:** Running three models is 3x the cost. For healthcare community modules, this is non-negotiable — safety > cost. For other domains, it should be opt-in. The module.json can specify `"deliberation": true` as a default that users can override (except in healthcare, where it's locked).

---

### STANDALONE FEATURE: Health Guidance Confidence Dashboard

**Type:** Specialised UI component for Community Health area  
**ID:** `health-confidence-dashboard`

**Displays:**
- Model agreement visualisation (Venn diagram or similar)
- Confidence score per recommendation
- Red flags (if any) prominently displayed
- "What each model found" expandable section (transparency)
- Session history (track symptom progression over time)
- "Prepare for your doctor visit" — generates a structured summary of the interaction that the user can bring to their appointment

---

---

## SUMMARY: ALL PROPOSED ITEMS

### Entertainment & Creative Production

| # | Type | Name | Risk | Effort |
|---|------|------|------|--------|
| 1 | Module | Script & Screenplay Development Studio | Low | Medium |
| 2 | Module | Literary & Dramatic Translation Workshop | Low | Medium |
| 3 | Module | World-Building & Setting Engine | Low | Medium |
| 4 | Module | Editorial & Proofreading Suite | Low | Medium |
| 5 | Module | Audience & Focus Group Simulator | Low | Medium |
| 6 | Module | Story Collaboration & Continuity Manager | Low | Medium |
| 7 | Module | Pre-Publication & Submission Readiness | Low | Low |
| 8 | Module | Market Reach & Audience Analysis | Low | Low |
| 9 | Standalone Feature | Creative Review Panel | Low | Medium |
| 10 | Standalone Workflow | Creative Production Pipeline | Low | Low (uses existing workflow engine) |

**Total for Entertainment: 8 modules + 1 standalone feature + 1 workflow template = Area 30 with 8 modules**

---

### Healthcare & Community Health

| # | Type | Name | Risk | Effort |
|---|------|------|------|--------|
| 11 | Module (Area 24 expansion) | Clinical Documentation Assistant | Low | Medium |
| 12 | Module (Area 24 expansion) | Medical Evidence Synthesiser | Low | Medium |
| 13 | Module (Area 24 expansion) | Practice Management & Admin Optimizer | Low | Low |
| 14 | Module (Area 24 expansion) | Patient Education Material Creator | Low-Med | Medium |
| 15 | Module (Area 32 — new) | Symptom Guidance Advisor | HIGH | High |
| 16 | Module (Area 32 — new) | Medication & Treatment Information | HIGH | High |
| 17 | Module (Area 32 — new) | First Aid & Emergency Guidance | HIGH | High |
| 18 | Module (Area 32 — new) | Maternal & Child Health Guide | HIGH | High |
| 19 | Module (Area 32 — new) | Mental Health & Wellbeing Support | HIGH | High |
| 20 | Platform Feature | Multi-Model Deliberation Protocol | N/A | Very High |
| 21 | UI Component | Health Guidance Confidence Dashboard | N/A | Medium |

**Total for Healthcare: 4 modules expanding Area 24 + 5 modules in new Area 32 + 1 platform feature + 1 UI component**

---

## IMPLEMENTATION PRIORITY RECOMMENDATION

**Phase 1 — Quick wins, low risk:**
Entertainment modules 1-4 + Creative Review Panel. These follow existing patterns exactly, just new domain content. Could be built in a sprint.

**Phase 2 — Platform capability:**
Multi-Model Deliberation Protocol. This is infrastructure that enables Phase 3 and benefits the entire platform. Build this before the healthcare community modules.

**Phase 3 — Healthcare professional tools:**
Area 24 expansion (modules 11-14). Low risk because the users are professionals. Follows existing module patterns.

**Phase 4 — Entertainment completion:**
Modules 5-8 + workflow template. Nice-to-haves that complete the creative production pipeline.

**Phase 5 — Community Health (careful rollout):**
Area 32 modules, starting with First Aid (most straightforward) and Symptom Guidance (most impactful). Each module should go through expert review (real medical professionals, not just AI personas) before release.

---

## TOTAL PLATFORM IMPACT

**Before expansion:**
- 29 areas, 238 modules

**After expansion:**
- 31 areas (or 30 if we count Area 24 expansion as staying at 29 existing + 2 new)
- 238 + 8 + 4 + 5 = **255 modules**
- 1 new platform capability (Multi-Model Deliberation)
- 2 new standalone features
- 1 new workflow template

This is a meaningful expansion that opens openEXPERT to two massive new markets — the creative industry and healthcare — while adding a platform capability (deliberation) that strengthens every existing area too.

---

*Enjoy the rest of the wine. This is a good direction.*
