# ANTON School Mode — Full Specification

**Version:** 1.0  
**Date:** March 3, 2026  
**Author:** Daniel Bardun / FutureChain AB  
**Status:** Design Specification  
**Audience:** Claude Code, whitepaper integration, strategic planning

---

## 1. Vision & Philosophy

ANTON was built as a platform for working professionals — trained AI coworkers across 56+ domains. But the same architecture that makes ANTON powerful for a compliance officer or a software engineer can make it transformative for a student learning algebra, a teenager preparing for university entrance exams, or a university student writing their thesis.

**The core insight:** If "the prompt IS the product" works for professionals, it works for learners. A well-structured prompt that injects subject expertise, pedagogical methodology, age-appropriate interaction patterns, and curriculum alignment produces an AI that doesn't just answer questions — it *teaches*.

**The critical difference:** In Work Mode, ANTON produces output. In School Mode, ANTON produces *understanding*. The AI must never just give the answer — it must guide the student toward discovering the answer themselves, verify their reasoning, and build genuine competence over time.

**Child safety commitment:** School Mode enforces strict content safety appropriate to each age tier. All interactions are logged with full audit trails. Parents/guardians and teachers have oversight access. The platform never collects data beyond what is necessary for the learning experience, and all data handling complies with GDPR, COPPA, and applicable child data protection regulations.

---

## 2. The Mode Toggle

### 2.1 How It Works

Just as ANTON already supports theme toggles (Dark, Light, Corporate), the platform adds a top-level **Mode Toggle**:

```
┌─────────────────────────────────────┐
│  Mode:  [🏢 Work]  [🎓 School]     │
│  Theme: [Dark] [Light] [Corporate]  │
└─────────────────────────────────────┘
```

The Mode Toggle is a fundamental context switch that changes:

- **Navigation structure** — Areas → Subjects; Modules → Lessons/Tools
- **Persona system** — Expert consultants → Teachers/Tutors/Coaches
- **Interaction philosophy** — Output-oriented → Learning-oriented (Socratic method, guided discovery)
- **Audit trail framing** — Professional governance → Academic integrity & learning evidence
- **Vocabulary** — "Engagement," "deliverable," "client" → "Assignment," "project," "class"
- **Horizon Radar** → **My Radar** (sports, e-sports, game releases, cultural events)
- **Quality Ratchet** → **Progress Tracker** (learning progression, mastery levels)
- **Apprentice Model** → **Student Growth Model** (the AI learns the student's level, not the other way around)

### 2.2 What Stays the Same

The underlying architecture does not change. School Mode is a *configuration layer* on top of the same seven-layer prompt builder, the same knowledge source system, the same multi-LLM architecture, the same database, and the same governance framework. This means:

- The seven-layer prompt builder assembles prompts the same way — Layer 2 becomes "Subject Context" instead of "Area Context," Layer 3 becomes "Lesson Methodology" instead of "Module Expertise"
- Knowledge sources work identically — textbooks, curriculum documents, and educational resources replace regulatory documents and industry standards
- Multi-LLM support applies — schools may prefer local Ollama models for data privacy, or smaller/cheaper models (Haiku, Sonnet) for routine tutoring interactions
- Audit logging captures everything for academic integrity verification
- The `.anton` package format works for sharing lesson plans, subject modules, and curriculum packages between teachers and schools

---

## 3. Education Levels (Tiers)

School Mode organises content into **five education tiers**, each with distinct interaction patterns, complexity levels, and safety boundaries.

### 3.1 Tier Overview

| Tier | Name | Ages | Interaction Style | Model Recommendation |
|------|------|------|-------------------|---------------------|
| **T1** | Primary School (Lågstadiet/Mellanstadiet) | 6–12 | Highly visual, encouraging, simple language, heavy guardrails | Haiku (cost), Sonnet (quality) |
| **T2** | Lower Secondary (Högstadiet) | 13–15 | More independent, Socratic questioning, structured projects | Sonnet (default) |
| **T3** | Upper Secondary (Gymnasiet) | 16–18 | Near-adult, deeper analysis, exam preparation, career orientation | Sonnet (default), Opus (deep analysis) |
| **T4** | University / Higher Education | 18–25 | Full academic rigour, thesis support, research methodology, critical analysis | Opus (default), Sonnet (routine) |
| **T5** | Lifelong Learning / Professional Retraining | 25+ | Self-directed, practical focus, bridges to Work Mode | Same as Work Mode |

### 3.2 Tier-Specific Behaviour

**T1 — Primary School:**
- Language is warm, simple, and encouraging
- Explanations use concrete examples, analogies, and visual metaphors
- Never uses jargon without immediate explanation
- Celebrates effort and progress ("Great thinking! You're on the right track")
- Maximum session length guardrails (encourages breaks)
- No access to internet search — all content from curated knowledge sources
- Parent/guardian dashboard with activity summaries

**T2 — Lower Secondary:**
- Socratic method becomes primary interaction pattern ("What do you think happens next?" before revealing answers)
- Encourages students to form hypotheses before providing information
- Introduces structured project work (plan → research → draft → review → submit)
- Source verification introduced ("Where did you find this? Let's check if it's reliable")
- Homework help with nudging (see Section 7)
- Web search available but with content filtering

**T3 — Upper Secondary:**
- Full analytical depth appropriate to subject
- Exam preparation modules with timed practice, past papers, marking schemes
- Essay and report writing with academic integrity focus
- Career orientation modules that connect subjects to professions
- Research methodology introduction
- Critical thinking explicitly modelled ("What assumptions are we making here?")
- Begins introducing Work Mode concepts where relevant (e.g., business studies students use Strategy modules)

**T4 — University:**
- Full academic rigour — proper citation formats, peer-reviewed sources, methodology
- Thesis/dissertation support (literature review, research design, data analysis, writing)
- Seminar preparation and academic discussion
- Lab report and technical writing support
- Cross-disciplinary connections (the Knowledge Graph becomes powerful here)
- Can toggle into Work Mode for internship/placement-related tasks
- Closer to a research assistant than a tutor

**T5 — Lifelong Learning:**
- Self-directed with flexible structure
- Bridges directly to Work Mode — "I'm learning data analysis to change careers" → relevant Work Mode modules suggested
- Professional certification preparation (CFA, PMP, AWS, etc.)
- Practical, applied focus
- No age-related interaction modifications

---

## 4. Subject System (Replaces Areas)

In Work Mode, ANTON organises expertise into **Areas** (Financial Crime Prevention, Legal & Regulatory, etc.). In School Mode, Areas become **Subjects**, organised by education tier and national curriculum alignment.

### 4.1 Core Subject Map

#### T1–T2: Primary & Lower Secondary

| # | Subject | Modules | Description |
|---|---------|---------|-------------|
| 1 | Mathematics | 8–12 | Arithmetic, geometry, algebra basics, statistics, problem-solving |
| 2 | Swedish / Language Arts | 8–10 | Reading comprehension, creative writing, grammar, oral presentation |
| 3 | English | 6–8 | Vocabulary, reading, writing, conversation practice |
| 4 | Science (NO) | 8–10 | Biology, chemistry, physics (integrated at lower levels, split at T2) |
| 5 | Social Studies (SO) | 6–8 | Geography, history, civics, religion/ethics |
| 6 | Technology & Digital Skills | 4–6 | Digital literacy, basic programming, online safety |
| 7 | Art & Music | 4–5 | Creative expression, music theory basics, art history |
| 8 | Physical Education & Health | 3–4 | Sports knowledge, nutrition, wellbeing |
| 9 | Home Economics | 3–4 | Cooking basics, household management, budgeting (age-appropriate) |
| 10 | Additional Languages | 4–6 | French, German, Spanish — vocabulary, grammar, culture |

#### T3: Upper Secondary (Gymnasiet)

Subjects expand and specialise based on programme (Naturvetenskapsprogrammet, Samhällsvetenskapsprogrammet, Teknikprogrammet, Ekonomiprogrammet, etc.):

| # | Subject | Modules | Description |
|---|---------|---------|-------------|
| 11 | Mathematics (Advanced) | 10–14 | Algebra, calculus, statistics, discrete mathematics (Ma1c–Ma5) |
| 12 | Physics | 6–8 | Mechanics, thermodynamics, electromagnetism, modern physics |
| 13 | Chemistry | 6–8 | Organic, inorganic, analytical, biochemistry |
| 14 | Biology | 6–8 | Cell biology, genetics, ecology, human biology |
| 15 | Swedish (Advanced) | 6–8 | Literary analysis, rhetoric, academic writing, linguistics |
| 16 | English (Advanced) | 6–8 | Academic English, literature, essay writing, debate |
| 17 | History | 6–8 | Ancient to modern, historiography, source criticism |
| 18 | Social Sciences | 6–8 | Political science, sociology, economics, media studies |
| 19 | Philosophy & Ethics | 4–6 | Logic, ethics, epistemology, political philosophy |
| 20 | Business & Economics | 6–8 | Micro/macroeconomics, accounting, entrepreneurship |
| 21 | Computer Science | 6–8 | Programming, algorithms, databases, web development |
| 22 | Psychology | 4–6 | Developmental, cognitive, social, clinical basics |
| 23 | Law (Introduction) | 4–5 | Legal systems, rights, criminal/civil law basics |
| 24 | Media & Communication | 4–5 | Journalism, digital media, visual communication |
| 25 | Environmental Science | 4–5 | Climate, sustainability, ecology, policy |

#### T4: University Level

University subjects are organised more like Work Mode areas — broader and deeper:

| # | Subject | Modules | Description |
|---|---------|---------|-------------|
| 26 | Academic Writing & Research Methods | 8–10 | Thesis writing, research design, citation, peer review |
| 27 | Statistics & Data Analysis | 6–8 | SPSS, R, Python for stats, experimental design, regression |
| 28 | Advanced Mathematics | 8–10 | Linear algebra, real analysis, differential equations, number theory |
| 29 | Engineering Fundamentals | 8–10 | Statics, dynamics, materials, thermodynamics, circuits |
| 30 | Computer Science (University) | 8–10 | Algorithms, OS, networking, AI/ML, software engineering |
| 31 | Economics (University) | 6–8 | Microeconomic theory, macroeconomic modelling, econometrics |
| 32 | Law (University) | 8–10 | Constitutional, contract, EU, international, criminal, administrative |
| 33 | Medicine & Health Sciences | 6–8 | Anatomy, physiology, pharmacology, clinical reasoning |
| 34 | Business Administration | 8–10 | Strategy, finance, marketing, operations, organisational behaviour |
| 35 | Humanities & Social Sciences | 6–8 | Philosophy, political science, sociology, anthropology, linguistics |

**Total estimated initial modules: ~180–220 across 35 subject areas**

#### Cross-Tier: Always Available Areas

These areas are not tied to a specific tier — they span the entire school experience and adapt to the student's age and level:

| # | Subject | Modules | Tiers | Description |
|---|---------|---------|-------|-------------|
| 36 | **Läxhjälp (Focused Homework Help)** | 6–8 | T1–T4 | Dedicated deep-focus area for specific struggles — see Section 8.5 |
| 37 | **Life Skills & Work Coaching** | 12–16 | T2–T4 | CV writing, job searching, personal finance, starting a business, digital presence, adulting essentials — see Section 8.6 |
| 38 | **Study Skills & Exam Technique** | 4–6 | T1–T4 | How to study effectively, manage time, take notes, prepare for exams, handle exam anxiety |

**Revised total: ~200–250 modules across 38 subject areas**

### 4.2 Curriculum Upload & AI Study Plan

**This is a key feature.** Students (or their parents/teachers) can upload their school's curriculum, syllabus, or year plan. ANTON processes it and generates:

1. **Subject Mapping** — Maps the uploaded curriculum to ANTON's subject/module structure
2. **Year Plan** — A week-by-week study schedule aligned to the curriculum timeline
3. **Teaching Role Assignments** — Each topic area gets assigned appropriate AI teacher personas (see Section 5)
4. **Milestone Calendar** — Key dates (exams, project deadlines, term breaks) plotted out
5. **Gap Identification** — If the curriculum covers topics ANTON doesn't have modules for, these are flagged (and community module creation is suggested)
6. **Difficulty Calibration** — Based on the student's current performance data, the study plan adjusts difficulty progression

**Upload formats supported:** PDF, DOCX, images (OCR), plain text, structured data (CSV/JSON)

**Example flow:**
```
Student uploads: "Matematik 2b - Kursplan HT2026.pdf"

ANTON processes and generates:
┌──────────────────────────────────────────────────────────────┐
│ 📚 Study Plan: Matematik 2b — Autumn Term 2026              │
│                                                              │
│ Week 35-37: Algebra & Equations                              │
│   🧑‍🏫 Teacher: Alma (Mathematics Specialist, patient style) │
│   📖 Modules: Linear Equations, Quadratic Equations          │
│   📝 Practice: 3 problem sets, 1 quiz                       │
│                                                              │
│ Week 38-40: Functions & Graphs                               │
│   🧑‍🏫 Teacher: Alma + Viktor (Visual/Applied Mathematics)  │
│   📖 Modules: Linear Functions, Quadratic Functions, Graphs  │
│   📝 Practice: 4 problem sets, 1 project (real-world data)  │
│                                                              │
│ Week 41: Autumn Break                                        │
│   💡 Optional: Review quiz, fun math challenges              │
│                                                              │
│ Week 42-44: Statistics & Probability                         │
│   🧑‍🏫 Teacher: Nora (Statistics & Data, analytical style)  │
│   📖 Modules: Descriptive Statistics, Probability            │
│   📝 Practice: Data collection project, 2 problem sets      │
│                                                              │
│ Week 45: Mid-term Exam Preparation                           │
│   🧑‍🏫 Teacher: Alma (exam technique focus)                 │
│   📖 Modules: Exam Simulator, Timed Practice                │
│   📝 Mock exam with AI marking and feedback                  │
│                                                              │
│ [Continue for remaining weeks...]                            │
│                                                              │
│ ⚙️ Adjust difficulty | 📅 Sync to calendar | 📤 Export plan │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Teacher System (Replaces Personas)

In Work Mode, ANTON injects expert personas (MLRO, CTO, Security Analyst). In School Mode, these become **Teacher Personas** — AI characters with distinct teaching styles, subject specialisations, and personality traits that make learning engaging and personal.

### 5.1 Teacher Persona Architecture

Each teacher persona is defined by:

| Attribute | Description | Example |
|-----------|-------------|---------|
| **Name** | A relatable, memorable name | "Alma" |
| **Subject Specialisation** | Primary and secondary subjects | Mathematics (primary), Physics (secondary) |
| **Teaching Style** | Pedagogical approach | Patient, step-by-step, uses visual analogies |
| **Personality** | Character traits that make interaction feel human | Warm, encouraging, occasionally uses humor, celebrates small wins |
| **Tier Adaptation** | How the persona adjusts across education levels | Simpler language at T1, Socratic at T2-T3, collegial at T4 |
| **Expertise Depth** | Knowledge boundaries | Can teach up to university-level calculus; defers to specialist for pure mathematics research |
| **Cultural Context** | Localisation awareness | Swedish curriculum references, culturally relevant examples |

### 5.2 Example Teacher Roster

| Teacher | Specialisation | Style | Best For |
|---------|---------------|-------|----------|
| **Alma** | Mathematics | Patient, methodical, step-by-step | Students who struggle with maths, need structure |
| **Viktor** | Science (Physics/Chemistry) | Experimental, "let's figure this out together" | Curious students, hands-on learners |
| **Nora** | Statistics & Data | Analytical, real-world examples | Students who ask "when will I use this?" |
| **Erik** | History & Social Studies | Storyteller, connects past to present | Students who learn through narrative |
| **Saga** | Languages & Literature | Creative, discussion-oriented | Reading, writing, literary analysis |
| **Leo** | Computer Science & Tech | Build-first, learn-by-doing | Coding, digital projects |
| **Freja** | Arts & Creative | Open-ended, exploratory | Creative expression, art history |
| **Oscar** | Sports & Health | Motivational, practical | Physical education theory, nutrition |
| **Mia** | Study Skills & Organisation | Structured, coaching-focused | Time management, exam technique, study habits |
| **Professor Lindström** | University-level research | Academic, rigorous, Socratic | Thesis supervision, research methodology |

### 5.3 Teacher Collaboration

Just as Work Mode can inject multiple personas into a session, School Mode allows **teacher collaboration**:

- **Cross-subject projects:** "Viktor (Science) and Leo (CS) co-teach a data collection & analysis project"
- **Study skills overlay:** "Mia joins any session when the student seems overwhelmed or disorganised"
- **Exam preparation teams:** "Alma (Maths) runs exam content, Mia (Study Skills) runs exam technique"

### 5.4 Teacher as Layer 4

In the seven-layer prompt builder, Teacher Personas occupy Layer 4 (same position as expert personas in Work Mode):

```
Layer 1: System Foundation (School Mode variant — child safety, pedagogical principles)
Layer 2: Subject Context (replaces Area Context)
Layer 3: Lesson/Module Methodology (replaces Module Expertise)
Layer 4: Teacher Persona (replaces Expert Persona)
Layer 5: Skills Attachment (pedagogical skills: Socratic method, scaffolding, differentiation)
Layer 6: Knowledge Sources (textbooks, curriculum docs, approved resources)
Layer 7: Transparency & Reasoning (visible thinking to model good reasoning for students)
```

---

## 6. The Student Interface — A New Interaction Model

### 6.1 Why Work Mode's Interface Doesn't Work for Students

In Work Mode, a professional opens a module and sees a full configuration screen: model selection, thinking level, creativity slider, persona picker, skills attachment, knowledge source toggles, output format checkboxes, and a system prompt they can edit. This makes sense for someone who knows exactly what they want to produce and has the expertise to calibrate the AI.

A 14-year-old opening ANTON to get help with quadratic equations should never see any of that. They should see their teacher and start talking.

The student's relationship with the tool is fundamentally different from a professional's. A professional *configures and commands*. A student *enters and learns*. The AI drives the structure; the student brings the questions, effort, and thinking.

### 6.2 The Three Layers of the Student Experience

The student interface has three distinct layers, each serving a different purpose:

#### Layer A: The Study Dashboard (Home Screen)

This is where the student lands when they open ANTON in School Mode. It is not a chat — it is a visual overview of their learning world.

```
┌──────────────────────────────────────────────────────────────────────┐
│  🎓 ANTON School                                    [Nora, Year 9]  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  📅 THIS WEEK                                                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                    │
│  │ 📐 Maths    │ │ 🧪 Science  │ │ 📝 Swedish  │                    │
│  │ Quadratic   │ │ Electricity │ │ Essay draft  │                    │
│  │ equations   │ │ & circuits  │ │ due Friday   │                    │
│  │ ████░░ 60%  │ │ ██░░░░ 30%  │ │ ░░░░░░ 0%   │                    │
│  │ [Continue →]│ │ [Start →]   │ │ [Start →]    │                    │
│  └─────────────┘ └─────────────┘ └─────────────┘                    │
│                                                                      │
│  📊 MY PROGRESS                    📡 MY RADAR                       │
│  Maths: ████████░░ Strong          ⚽ Arsenal 3-1 Wolves             │
│  Science: █████░░░░ Building       🎮 Elden Ring DLC out Friday      │
│  Swedish: ██████░░░ Good           🏆 Worlds 2026 Quarter-Finals     │
│  English: ████████░░ Strong        🚀 SpaceX Starship launch Thurs   │
│                                                                      │
│  💡 QUICK QUESTION          📚 ALL SUBJECTS                          │
│  [Ask anything →]           [Browse →]                               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

The dashboard is driven by the uploaded curriculum and study plan. It knows what week of term it is, what topics are active, what deadlines are approaching, and what the student has and hasn't done. It surfaces the right things at the right time.

**Entry points into learning:**
- Click a subject card → enters the contextualised chat (Layer B)
- Click "Quick Question" → lightweight chat for fast lookups (like Brief Me in Work Mode)
- Click a Radar item → explores the topic with an educational bridge
- Click "All Subjects" → browse the full subject list

#### Layer B: The Contextualised Chat (Primary Learning Interface)

This is where the actual learning happens. It looks like a chat, but it is not a blank chat. When the student clicks "Maths — Quadratic equations," the chat opens with everything already configured behind the scenes:

**Pre-loaded (invisible to student):**
- Subject context (Mathematics, Year 9 level)
- Topic context (Quadratic equations, week 38 of curriculum)
- Teacher persona (Alma — patient, step-by-step)
- Assistance level (set by teacher — L1 for homework, L2 for self-study)
- Knowledge sources (textbook chapters, curriculum standards)
- Student Growth Model data (this student struggles with factoring, strong on graphing)
- LLM selection (Sonnet by default, auto-selected by school admin)

**What the student sees:**

```
┌──────────────────────────────────────────────────────────────────┐
│  📐 Mathematics — Quadratic Equations        🧑‍🏫 Alma          │
│  Year 9 · Week 38 · Homework: L1 Guided                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  👩‍🏫 Alma:                                                      │
│  Hi! I see you're working on quadratic equations this week.     │
│  What are you trying to figure out — is this from your          │
│  homework, or are you studying on your own?                     │
│                                                                  │
│  ┌──────────────────────────────────────────┐                    │
│  │ [Homework help]  [Studying]  [Practice]  │                    │
│  └──────────────────────────────────────────┘                    │
│                                                                  │
│                                                                  │
│                                                                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Type your message...                                      │    │
│  │                                                    [Send] │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  Context Actions (appear when relevant):                         │
│  [📎 Upload photo of problem]  [📊 Show my progress]            │
│  [🔄 Switch teacher]  [📖 View textbook section]                │
└──────────────────────────────────────────────────────────────────┘
```

**Key design principle: the student types and talks. The AI drives the structure.** The student doesn't need to configure anything. Alma knows what they're working on, what level they're at, what they've struggled with before, and what the teacher expects.

**The contextual action bar** at the bottom is the only "configuration" the student has access to, and it is dynamic — actions appear and disappear based on what's happening in the conversation:

| Action | When It Appears | What It Does |
|--------|----------------|--------------|
| 📎 Upload photo | Always available | Student photographs a textbook problem or their handwritten work |
| 🔍 Search the web | When doing research projects (if enabled by teacher) | Opens web search with safe search filtering |
| 📄 Link a document | When working on projects/essays | Attach a source document for AI to review |
| 📊 Show my progress | Always available | Shows Progress Tracker for current subject |
| 🔄 Switch teacher | Always available | Change to a different teacher persona |
| 📖 View textbook | When working on curriculum-aligned content | Shows relevant textbook section from knowledge sources |
| ✏️ Practice problems | After concept explanation | Generates practice questions at the student's level |
| 📝 Quiz me | After covering a topic | Runs a quick assessment |
| 📤 Export/save | When a useful summary or solution is generated | Save to notes, export as PDF |
| ⏱️ Timed practice | During exam preparation | Starts a timed problem set |

These actions are **task-emergent, not menu-driven**. The student doesn't browse a settings panel — the right tools appear at the right moment because the AI understands the context of what they're doing.

#### Layer C: The Teacher/Parent/Admin Configuration Layer

All the configuration that exists in Work Mode migrates here — invisible to the student, fully accessible to the adults who set up the learning environment.

**Teacher view:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  ⚙️ Class Configuration: Matematik 9B                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  📚 Curriculum: Matematik 2b (Skolverket) — uploaded ✓               │
│  📅 Current week: 38 — Quadratic Equations                           │
│  🧑‍🏫 Default teacher: Alma (can be changed by students)            │
│                                                                      │
│  🔒 Assistance Levels:                                               │
│  ┌─────────────────────────────────────────┐                         │
│  │ Homework:        [L1 — Full Guidance ▼] │  ← Teacher locks this   │
│  │ Self-study:      [L2 — Moderate Help ▼] │                         │
│  │ Exam practice:   [L3 — Practice Mode ▼] │                         │
│  │ Reference/lookup: [L4 — Open         ▼] │                         │
│  └─────────────────────────────────────────┘                         │
│                                                                      │
│  🤖 Model Selection:                                                 │
│  [Sonnet 4.5 ▼]  (School admin sets available models)                │
│                                                                      │
│  🔍 Web Search: [Enabled ✓] Safe search enforced                     │
│  📄 Knowledge Sources: [Textbook Ch. 5-7] [Curriculum doc]           │
│  🛡️ Content Filter: [T2 — Age 13-15]                                │
│                                                                      │
│  📊 Student Progress Overview:                                       │
│  [View class progress →]  [Export reports →]  [Flag concerns →]      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.3 Interaction Patterns by Task Type

Different learning activities produce different interface experiences, all within the same chat frame:

**Homework Help:**
Student enters chat → selects "Homework help" → assistance level locks to teacher-set level (typically L1) → Alma guides through the problem without giving answers → audit trail captures the full learning process → student can export their work with the Learning Evidence Log attached.

**Self-Study / Revision:**
Student enters chat → selects "Studying" → assistance level is more open (L2) → Alma explains concepts, gives worked examples on *similar* problems, answers questions directly when it's about understanding rather than producing an answer → Progress Tracker updates.

**Practice & Drill:**
Student clicks "Practice problems" in context bar → Alma generates problems at the student's level → student solves them in the chat → AI marks and explains → difficulty adapts based on performance → this can become a game-like streak/challenge flow to build motivation.

**Exam Preparation:**
Student enters from dashboard "Exam prep" card → timed mode available → mock exams with realistic format and timing → detailed feedback after completion → identifies areas to revise → generates targeted practice for weak areas.

**Project Work:**
Student starts a multi-session project → the chat becomes a persistent workspace (like a project in Work Mode) → web search and document upload actions appear → source verification runs automatically → the draft history shows evolution of the work → the Learning Evidence Log tracks the full process from brief to final submission.

**Quick Question:**
Student uses "Quick Question" from dashboard → lightweight, no subject pre-loading → just ask anything → AI identifies subject and adjusts → if it becomes a deeper conversation, suggests "Want to continue this in your [subject] workspace?"

### 6.4 What the Student Can Change vs. What Is Locked

| Setting | Student Can Change? | Who Controls It? |
|---------|-------------------|-----------------|
| Teacher persona | ✅ Yes — switch between available teachers | Student |
| Subject/topic | ✅ Yes — navigate between subjects | Student |
| Assistance level | ❌ No — set per task type | Teacher |
| Web search toggle | ⚠️ Sometimes — teacher enables/disables | Teacher |
| Upload documents | ✅ Yes — always available | Student |
| LLM model | ❌ No | School admin |
| Content filtering tier | ❌ No | School admin |
| Knowledge sources | ⚠️ Partially — can add own notes, can't remove curriculum sources | Teacher sets base, student adds |
| Output format | ✅ Yes — export as PDF, save notes | Student |
| Thinking level / creativity | ❌ No — auto-set by context | System (based on task type) |
| System prompt editing | ❌ No — never visible to students | Teacher / Platform |

### 6.5 The Design Philosophy

The principle is: **the student should feel like they're talking to a teacher, not configuring software.**

Everything technical that a professional controls manually in Work Mode is either:
1. **Pre-set** by the curriculum, teacher, or school admin (assistance levels, models, content filters)
2. **Auto-selected** by the AI based on context (thinking level, knowledge sources, pedagogical approach)
3. **Surfaced contextually** only when relevant (web search during research projects, upload when discussing a specific problem)

The student's cognitive load should be zero on configuration and 100% on learning. They type, they think, they answer questions, they try problems. The platform handles everything else.

### 6.6 Tier-Specific Interface Adaptations

The interface itself adjusts by education tier:

**T1 (Primary, ages 6–12):**
- Larger text, more visual elements, emoji-rich
- Voice input option (students who can't type well yet)
- Simplified context bar (just upload photo and practice)
- Session length timer with break encouragement
- More structured interaction (multiple choice options alongside free text)

**T2 (Lower Secondary, ages 13–15):**
- Standard chat interface as described above
- Full context bar
- My Radar integration
- Group project features available

**T3 (Upper Secondary, ages 16–18):**
- Adds more Work Mode-like features: output format selection, export options
- Career exploration links visible
- Can view (read-only) some Work Mode areas for career context
- More student control over study approach

**T4 (University, ages 18+):**
- Nearly Work Mode interface but with pedagogical layer
- Can edit some configuration (knowledge sources, output formats)
- Research tools prominent (citation manager, source verification, literature search)
- Thesis workspace is a dedicated long-running environment
- Toggle to Work Mode available for internship tasks

**T5 (Lifelong Learning, ages 25+):**
- Full Work Mode interface with optional pedagogical layer
- Student chooses their own level of AI scaffolding
- Bridges directly to Work Mode modules

---

## 7. Course Journey — Long-Duration Learning with Progress Tracking

### 7.1 The Problem: School Learning Isn't a Task, It's a Journey

In Work Mode, a professional opens a module, runs a task, gets output, and moves on. The engagement might last an hour or a day. Even the Engagement Task feature, which models multi-phase consulting projects, operates on a scale of weeks.

School learning is fundamentally different. A student studying Mathematics 2b doesn't open a module on Monday and close it on Tuesday. They work through the course over an entire term — 18 weeks of lessons, practice, assignments, and exams. They might study quadratic equations for three weeks, then move on to functions, then statistics, circling back to earlier topics when they appear in later contexts. The AI needs to understand where the student is on this months-long journey, what they've covered, what's coming next, and how well they've absorbed what's behind them.

This is directly analogous to the Engagement Task system in Work Mode — but adapted for learning instead of consulting.

### 7.2 The Course Journey Model

Every subject the student is enrolled in has a **Course Journey** — a persistent, long-running tracker that maps the entire course from start to finish.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  📐 Course Journey: Matematik 2b — Autumn Term 2026                     │
│  🧑‍🏫 Primary Teacher: Alma     📅 Week 38 of 52     ⏱️ Started: Aug 19 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  OVERALL PROGRESS                                                        │
│  ████████████████████░░░░░░░░░░░░░░░░░░░░  42%                          │
│                                                                          │
│  ┌─ COMPLETED ──────────────────────────────────────────────────────┐    │
│  │                                                                   │    │
│  │  ✅ Block 1: Algebra & Equations (Weeks 35-37)                   │    │
│  │     Knowledge: ████████░░ 80%   Application: ██████░░░░ 60%     │    │
│  │     📝 Quiz 1: 78%  📝 Problem Set 1-3: Avg 72%                │    │
│  │     💡 Note: Factoring still shaky — revisit before exam        │    │
│  │                                                                   │    │
│  ├─ IN PROGRESS ────────────────────────────────────────────────────┤    │
│  │                                                                   │    │
│  │  🔄 Block 2: Functions & Graphs (Weeks 38-40)  ← YOU ARE HERE   │    │
│  │     Knowledge: ████░░░░░░ 40%   Application: ██░░░░░░░░ 20%    │    │
│  │     📝 Problem Set 4: Not started                                │    │
│  │     🎯 This week: Linear functions — slope and intercept        │    │
│  │     [Continue learning →]                                        │    │
│  │                                                                   │    │
│  ├─ UPCOMING ───────────────────────────────────────────────────────┤    │
│  │                                                                   │    │
│  │  ⬜ Block 3: Statistics & Probability (Weeks 42-44)              │    │
│  │  ⬜ Block 4: Geometry & Trigonometry (Weeks 45-47)               │    │
│  │  ⬜ Mid-term Exam (Week 48)                                      │    │
│  │  ⬜ Block 5: Advanced Functions (Weeks 49-51)                    │    │
│  │  ⬜ Block 6: Integration & Review (Week 2-4)                    │    │
│  │  ⬜ Final Exam (Week 5)                                          │    │
│  │                                                                   │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  📊 Bloom's Dimensions (Course-wide):                                    │
│  Knowledge:    ████████░░ Strong                                         │
│  Application:  █████░░░░░ Building — needs more practice problems        │
│  Analysis:     ████░░░░░░ Early — develops more in Blocks 4-6           │
│  Evaluation:   ███░░░░░░░ Not yet assessed                              │
│  Creation:     ██░░░░░░░░ Project in Block 3 will assess this           │
│  Metacognition: ██████░░░░ Good — asks for help proactively             │
│                                                                          │
│  🔔 ALERTS:                                                              │
│  ⚠️ Factoring (Block 1) scored below threshold — review recommended     │
│  📅 Problem Set 4 due Friday — not yet started                          │
│  💡 You're ahead of schedule on Functions — consider extra practice     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 7.3 How It Works (Engagement Task Parallel)

The Engagement Task system in Work Mode follows an 8-phase consulting lifecycle. The Course Journey follows a parallel educational lifecycle:

| Engagement Task Phase (Work) | Course Journey Phase (School) | What Happens |
|-----|------|------|
| Scoping & Planning | **Course Setup** | Curriculum uploaded, study plan generated, teacher personas assigned, milestones set |
| Discovery & Analysis | **Diagnostic Assessment** | AI assesses student's starting level, identifies pre-existing knowledge and gaps |
| Execution & Delivery | **Active Learning** | Week-by-week teaching, practice, assignments — the core journey |
| Review & Quality Gate | **Assessment Checkpoints** | Quizzes, tests, and exams at block boundaries — must demonstrate understanding to progress |
| Iteration & Refinement | **Remediation & Review** | Weak areas identified and revisited, extra practice generated, concepts re-taught from different angles |
| Handover & Documentation | **Term Summary & Report** | End-of-term progress report, areas of strength, areas for continued focus |
| Follow-up & Monitoring | **Carry-Forward** | Knowledge gaps and strengths carry into the next term/course |
| Archive & Learning | **Learning Record** | Complete audit trail of the student's journey preserved for future reference |

### 7.4 Progress Bars and Mastery Levels

Progress in a Course Journey is tracked at three granularities:

**Block Level:** Each teaching block (typically 2-4 weeks) has its own progress bar showing completion of content, practice, and assessment. A block is "complete" when the student has engaged with all content AND demonstrated sufficient understanding through assessment.

**Course Level:** The overall progress bar aggregates block progress, weighted by importance and complexity. This is the bar the student sees on their dashboard.

**Skill Level:** Individual skills within a block are tracked independently. "Quadratic equations" might be at 80% while "factoring" within that same block is at 45%. This granular tracking enables targeted remediation.

**Mastery thresholds:**

| Level | Score Range | Visual | Meaning |
|-------|-----------|--------|---------|
| **Not Started** | 0% | ░░░░░░░░░░ | Content not yet engaged |
| **Emerging** | 1–30% | ██░░░░░░░░ | Initial exposure, early understanding |
| **Developing** | 31–55% | █████░░░░░ | Grasps basics, struggles with application |
| **Proficient** | 56–80% | ███████░░░ | Solid understanding, can apply to standard problems |
| **Mastery** | 81–100% | █████████░ | Deep understanding, can apply to novel situations, can explain to others |

A student doesn't need to reach "Mastery" on every topic — but the Course Journey makes it visible where they are and where they're heading, so they (and their teachers and parents) can make informed decisions about where to focus effort.

### 7.5 Continuity Across Sessions

Unlike Work Mode tasks, a Course Journey persists across hundreds of sessions over months. The system maintains:

- **Session memory:** When the student returns to Maths after two days working on Swedish, Alma picks up exactly where they left off: "Last time we were working on slope-intercept form and you got stuck on negative slopes. Want to pick up there, or start fresh with a quick review?"
- **Spaced repetition:** Topics from earlier blocks resurface at optimal intervals. "You learned factoring 4 weeks ago — let's do a quick check to make sure it's still solid."
- **Cross-block connections:** When a new topic builds on an earlier one, the system explicitly connects them: "The function graphing we're doing now uses the equation-solving skills from Block 1. Remember how we found x-intercepts? That's the same thing as finding where this graph crosses the x-axis."
- **Difficulty progression:** The system tracks that the student found Block 1 moderately challenging, and adjusts Block 2's pacing accordingly — not harder for the sake of it, but calibrated to keep the student in the productive struggle zone.

### 7.6 Teacher and Parent Views

**Teachers** see Course Journey progress for their entire class:

```
┌──────────────────────────────────────────────────────────────────┐
│  📊 Class Progress: Matematik 9B — Autumn 2026                  │
│                                                                  │
│  Block 2: Functions & Graphs                                     │
│  Class average: 38% complete                                     │
│                                                                  │
│  Student         Progress   Knowledge   Application   Alert     │
│  ─────────────   ────────   ─────────   ───────────   ────────  │
│  Anna S.         ████░░ 55%   Strong      Building              │
│  Erik L.         ███░░░ 42%   Building    Building              │
│  Fatima A.       ██████ 71%   Strong      Strong      🌟 Ahead │
│  Johan K.        █░░░░░ 15%   Emerging    Not started  ⚠️ Behind│
│  Linnéa B.       ████░░ 48%   Building    Building              │
│  ...                                                             │
│                                                                  │
│  ⚠️ 3 students below expected pace — intervention suggested     │
│  🌟 2 students ahead — enrichment material recommended          │
└──────────────────────────────────────────────────────────────────┘
```

**Parents** see a simplified view focused on their child's progress, upcoming deadlines, and any areas flagged for attention.

---

## 8. Homework Help & Project Support — The Guided Approach

This is where School Mode fundamentally differs from a generic AI chatbot. **ANTON does not do homework for students.** It helps them learn how to do it themselves.

### 8.1 The Nudging Philosophy

When a student asks for help with homework, ANTON follows a strict pedagogical protocol:

```
Step 1: UNDERSTAND — "What's the assignment asking you to do?"
   → Draw out the student's understanding of the task

Step 2: EXPLORE — "What have you tried so far? What do you think the approach might be?"
   → Identify what the student already knows and where they're stuck

Step 3: SCAFFOLD — "Let's break this into smaller pieces. What's the first thing we need to figure out?"
   → Guide toward the solution without revealing it

Step 4: NUDGE — "You said X — that's close. What if we think about Y instead?"
   → Gentle course corrections that preserve student agency

Step 5: VERIFY — "You got [answer]. Can you explain why that works? How would you check it?"
   → Ensure understanding, not just correct answers

Step 6: CONNECT — "This is similar to [previous topic]. Can you see how they relate?"
   → Build connections between concepts for deeper learning
```

### 8.2 The Anti-Cheating Architecture

ANTON takes academic integrity seriously. The system includes:

**Audit Trail (Learning Evidence Log):**
Every interaction in a homework help session is logged:
- Questions the student asked
- What the AI suggested (never the final answer directly)
- How the student responded and iterated
- Where the student's own thinking led them
- What sources were consulted
- Time spent on each step
- Final output with clear annotation of AI-assisted vs. student-generated content

**The audit trail can be shared with teachers** so they can see exactly how the student used AI — not as surveillance, but as evidence of the learning process. A teacher reviewing the log can see: "This student struggled with quadratic equations, ANTON guided them through the discriminant, they tried three approaches before getting it right, and then successfully applied it to the next problem independently."

**Configurable Assistance Levels:**

| Level | Name | Behaviour | Use Case |
|-------|------|-----------|----------|
| **L1** | Full Guidance | Step-by-step scaffolding, never gives answers | Homework, graded assignments |
| **L2** | Moderate Help | Explains concepts, gives worked examples on *similar* (not identical) problems | Study sessions, revision |
| **L3** | Practice Mode | Generates practice problems, checks answers, explains errors | Self-study, exam prep |
| **L4** | Reference Mode | Answers questions directly (like a textbook) | Background reading, concept lookup |

**Teachers/parents can set the default level** and lock it for specific assignment types. For instance: "All maths homework must use L1 (Full Guidance)."

### 8.3 Project Support

For longer projects (essays, science experiments, presentations), ANTON provides a structured project workflow:

```
Phase 1: PROJECT UNDERSTANDING
   → What's the brief? What are the criteria? When is it due?
   → AI helps student break down the requirements

Phase 2: RESEARCH & PLANNING
   → Guided research with source evaluation ("Is this source reliable? How do we know?")
   → AI helps create an outline/plan but student makes all structural decisions
   → Source verification: ANTON checks cited sources exist and says what the student claims they say

Phase 3: DRAFTING
   → Student writes; AI provides feedback on structure, clarity, argumentation
   → Never rewrites — highlights issues and asks "How could you make this clearer?"
   → Tracks which sections are student-written vs. AI-suggested

Phase 4: REVIEW & IMPROVEMENT
   → AI acts as a peer reviewer: "Your introduction is strong, but your third paragraph doesn't connect to your thesis. Can you see why?"
   → Suggests improvements as questions, not edits

Phase 5: FINAL CHECK
   → Source verification, consistency check, rubric alignment
   → Generates a "Process Log" showing the full journey from brief to final submission
```

### 8.4 Source Verification

ANTON always verifies sources in homework and project work:

- **Citation checking:** "You cited this article — let me verify it exists and says what you think it says"
- **Source quality assessment:** "This is a Wikipedia article. For a school project, can we find a primary source?"
- **Bias detection:** "This source has a particular perspective. What would a different viewpoint look like?"
- **Fabrication prevention:** If a student cites something that doesn't exist, ANTON flags it immediately

### 8.5 Läxhjälp — Deep Focus Homework Support

In Sweden, "läxhjälp" is a well-understood concept — dedicated time and support for students who are stuck on specific homework or struggling with a particular topic. ANTON's Läxhjälp area is not a general tutoring session. It is a **deep-focus, problem-solving mode** designed to take a student from confusion to understanding on one specific issue, and to stay there until it's resolved.

#### How Läxhjälp Differs from Regular Homework Help

Regular homework help (Section 8.1) follows the nudging protocol through a complete assignment. Läxhjälp is more targeted — the student arrives with a specific problem: "I don't understand how to factorise," "I can't figure out this physics problem," "I don't know how to start my essay."

```
┌──────────────────────────────────────────────────────────────────┐
│  🎯 Läxhjälp — Deep Focus Mode                                 │
│  📐 Subject: Mathematics    🧑‍🏫 Teacher: Alma                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  👩‍🏫 Alma:                                                      │
│  Welcome to Läxhjälp! Tell me what you're struggling with,      │
│  and we'll work through it together until it clicks.            │
│  You can type it, or take a photo of the problem.               │
│                                                                  │
│  📎 [Upload photo]  ✏️ [Type your problem]                       │
│                                                                  │
│                                                                  │
│  STATUS: 🔴 Stuck → 🟡 Working on it → 🟢 Got it!              │
│  Current: 🔴 Stuck                                              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### The Läxhjälp Protocol

**Phase 1 — Identify the Stuck Point:**
The AI doesn't assume it knows where the student is stuck. It asks targeted diagnostic questions to pinpoint the exact gap: "Can you tell me what you've tried so far?" "Where exactly did you get lost?" "Show me how far you got."

**Phase 2 — Trace Back to Solid Ground:**
Once the stuck point is identified, the AI traces back to the last concept the student *does* understand. "OK, so you can solve 2x + 3 = 11, but you're stuck when there's an x on both sides. Let's start from what you know and build forward."

**Phase 3 — Bridge the Gap:**
The AI teaches the missing concept using the student's current understanding as a foundation. Multiple explanation approaches are tried if the first doesn't land — visual, numerical, analogical, step-by-step procedural, real-world example.

**Phase 4 — Practice on the Specific Gap:**
Before returning to the original homework problem, the AI generates 2–3 practice problems targeting exactly the stuck point. The student must demonstrate they can do these independently.

**Phase 5 — Return to the Original Problem:**
Only now does the student go back to their actual homework problem. The AI guides but doesn't solve — and because the gap has been addressed, the student can now make progress.

**Phase 6 — Verify and Cement:**
The AI checks that the understanding is solid: "Can you explain in your own words why we need to move the x terms to one side?" If the student can explain it, the session status moves to 🟢. If not, back to Phase 3 with a different approach.

#### Progression Tracking in Läxhjälp

Every Läxhjälp session feeds into the Course Journey. The system tracks:

- **What the student got stuck on** (topic, specific skill)
- **How long it took to resolve** (indicator of difficulty level)
- **Which explanation approach worked** (informs future teaching style)
- **Whether the same stuck point recurs** (triggers spaced repetition and curriculum flag)

If a student keeps coming back to Läxhjälp for the same topic, the system flags this to both the student ("You've struggled with factoring three times now — let's try a completely different approach") and the teacher ("Johan has visited Läxhjälp for factoring 3 times this month — may need additional support").

#### Läxhjälp ≠ Answer Machine

The assistance level in Läxhjälp is always **L1 (Full Guidance)** and cannot be changed. The AI never provides the answer to the homework problem itself. It teaches the *concept* that the homework problem tests, practices on *similar* problems, and then guides the student to apply that understanding to their actual homework. The Learning Evidence Log captures the entire process, making it clear to any reviewing teacher that the student learned and applied — not copied.

---

### 8.6 Life Skills & Work Coaching — Livskunskap

One of the most consistent complaints from young adults is: "School taught me calculus but not how to do my taxes." ANTON's Life Skills & Work Coaching area fills this gap — practical knowledge that every young person needs but that sits awkwardly between subjects in the traditional curriculum.

This area is available from T2 (age 13) onwards and matures with the student. It connects to and extends the Home Economics subject (Subject #9) but goes much further into practical adulting skills.

#### Module Map

**Finding Work (T2–T4):**

| Module | Tier | What It Teaches |
|--------|------|----------------|
| **Summer Job Search** | T2–T3 | Where to look, how to approach employers, what to say, rights as a minor worker |
| **Writing Your First CV** | T2–T3 | Structure, what to include when you have no experience, how to describe school projects and hobbies as skills |
| **Cover Letters & Applications** | T3–T4 | Tailoring applications, professional tone, following up, handling rejection |
| **Job Interview Preparation** | T3–T4 | Common questions, how to present yourself, what to wear, body language, follow-up |
| **Internship & PRAO Guide** | T2–T3 | How PRAO works, finding placements, what to learn during your time there, writing a reflection |
| **LinkedIn & Professional Online Presence** | T3–T4 | Setting up a profile, networking basics, professional vs. personal social media |

**Personal Finance (T2–T4):**

| Module | Tier | What It Teaches |
|--------|------|----------------|
| **Your First Bank Account** | T2 | What a bank account is, how to open one, online banking, keeping track of money |
| **Understanding Your Salary** | T3 | Gross vs. net, tax deductions, payslips explained, employer contributions |
| **How Taxes Work** | T3–T4 | Why we pay tax, how the Swedish tax system works, deklaration, what tax pays for |
| **Budgeting & Saving** | T2–T3 | Monthly budgets, saving goals, the difference between needs and wants, compound interest |
| **Rent, Bills & Living Costs** | T3–T4 | What it costs to live independently, how rent works, electricity/internet/insurance, first apartment checklist |
| **Credit, Loans & Debt** | T3–T4 | How credit works, why debt is expensive, student loans (CSN), avoiding predatory lending |

**Starting Something (T3–T4):**

| Module | Tier | What It Teaches |
|--------|------|----------------|
| **Starting a Student Business (UF)** | T3 | UF-företag process, business ideas, team roles, business plan basics |
| **Becoming a YouTuber / Content Creator** | T2–T3 | Platform basics, content planning, equipment, audience building, monetisation basics, online safety |
| **Freelancing & Side Projects** | T3–T4 | Finding clients, pricing your work, invoicing, F-skatt, simple bookkeeping |
| **Entrepreneurship Fundamentals** | T3–T4 | Business models, market research, MVP thinking, pitching, failure as learning |

**Life Admin (T3–T4):**

| Module | Tier | What It Teaches |
|--------|------|----------------|
| **Navigating Government Services** | T3–T4 | Skatteverket, Försäkringskassan, CSN, healthcare (1177), how to handle bureaucracy |
| **Tenants' Rights & Housing** | T3–T4 | How to find housing, rental contracts, rights and obligations, bostadskö |
| **Insurance Basics** | T3–T4 | Why insurance matters, types (home, liability, travel), hemförsäkring |
| **Health & Wellbeing as an Adult** | T3–T4 | Registering at a vårdcentral, mental health resources, healthy habits, knowing when to seek help |

#### Teaching Approach for Life Skills

The Life Skills area uses a distinct teaching approach:

**Practical over theoretical.** Instead of explaining what a CV is in abstract, the module walks the student through building *their actual CV*. Instead of explaining how taxes work in general, it uses the student's age and situation to show what their deklaration will look like.

**Templates and tools.** Where Work Mode produces professional deliverables, Life Skills produces personal tools: a CV template the student fills in, a budget spreadsheet they populate with their own numbers, a cover letter they customise for a real job listing.

**Role-play scenarios.** The Job Interview module lets the student practice interviews with the AI playing the employer. The Bank Account module simulates the process of opening an account. The Tenant Rights module walks through a scenario where something goes wrong with a rental.

**No judgment.** Some students come from families where financial literacy is taught at home. Others don't. The AI never assumes prior knowledge and never makes the student feel stupid for not knowing something. "You haven't learned this yet, and that's fine — that's what we're here for."

#### Connection to Work Mode

Life Skills modules serve as a natural bridge to Work Mode. A student who completes "Starting a Student Business" has been exposed to concepts they'll later find in ANTON's Work Mode areas for Startups & Entrepreneurship, Accounting & Finance, and Strategy & Planning. The skills and mental models transfer — and when they eventually switch to Work Mode, the Apprentice Model has a foundation to build on.

---

## 9. Exams & Assessment (Replaces Quality Ratchet)

### 9.1 Assessment Types — A Complete Toolkit

Different learning objectives require different assessment methods. ANTON supports a comprehensive range of exam and assessment formats, each testing different capabilities:

#### A. Knowledge Testing Formats

| Format | How It Works | What It Tests | Best For |
|--------|-------------|---------------|----------|
| **Multiple Choice (Flerval)** | Student clicks the correct answer from 3–5 options. Can include "select all that apply" and image-based options. | Factual recall, recognition, elimination reasoning | Quick knowledge checks, diagnostic assessments, standardised test prep |
| **Fill-in-the-Blank** | Student types a word, number, or short phrase into a blank within a sentence or equation. | Recall without cues, precise terminology, calculations | Vocabulary, formulas, dates, definitions |
| **Matching** | Student connects items from two columns (concepts↔definitions, dates↔events, formulas↔applications). | Association, categorisation, pattern recognition | Terminology, historical events, scientific classifications |
| **True/False with Justification** | Student marks T/F and then must explain *why*. The AI evaluates both the answer and the reasoning. | Not just recall — forces articulation of understanding | Correcting misconceptions, identifying faulty reasoning |
| **Ordering/Sequencing** | Student arranges items in the correct order (historical events, process steps, mathematical operations). | Understanding of processes, timelines, logical sequences | History, lab procedures, mathematical proofs |

#### B. Reasoning & Discussion Formats

| Format | How It Works | What It Tests | Best For |
|--------|-------------|---------------|----------|
| **Short Answer Discussion** | AI asks an open-ended question. Student writes 2–5 sentences. AI evaluates depth, accuracy, and reasoning — not just keywords. | Comprehension, ability to explain in own words | Demonstrating understanding beyond memorisation |
| **Socratic Examination** | AI and student have a back-and-forth dialogue. AI asks progressively deeper questions based on student's answers. No fixed endpoint — continues until understanding depth is established. | Deep comprehension, ability to defend a position, reasoning under pressure | Oral exam simulation, thesis defence prep, philosophy, advanced subjects |
| **Case Study Analysis** | AI presents a scenario (historical event, scientific observation, business situation, ethical dilemma). Student must analyse, identify key issues, and propose a response. | Application, analysis, evaluation — higher-order Bloom's | Social sciences, law, business, ethics, medicine |
| **Source Criticism Exercise** | AI presents 2–3 sources on the same topic (possibly contradictory). Student must evaluate reliability, identify bias, and synthesise a position. | Critical thinking, source evaluation, academic rigour | History, social studies, media studies, research methods |
| **Debate/Argumentation** | Student must argue a specific position (possibly one they disagree with). AI plays the opposing side. Assessed on argument quality, evidence use, and rhetorical skill. | Persuasive reasoning, evidence handling, perspective-taking | Swedish/English essay prep, philosophy, social sciences |

#### C. Production & Calculation Formats

| Format | How It Works | What It Tests | Best For |
|--------|-------------|---------------|----------|
| **Calculation Problem Set** | Student receives mathematical problems of increasing difficulty. Shows working step-by-step. AI evaluates both the answer and the method. Can include photo upload of handwritten working. | Mathematical reasoning, procedural skill, error identification | Mathematics, physics, chemistry, economics |
| **Formal Writing Assessment** | Student writes a full essay, report, or analysis within the platform. AI evaluates structure, argumentation, language quality, source use, and rubric alignment. Provides section-by-section feedback. | Written communication, academic writing, analytical thinking | Swedish, English, history, social sciences |
| **Lab Report / Technical Writing** | Structured template: hypothesis, method, results, analysis, conclusion. AI checks scientific reasoning, data handling, and whether conclusions follow from evidence. | Scientific method, technical communication | Science subjects, engineering |
| **Creative Production** | Open-ended creative task (write a story, compose a poem, design a solution, propose an invention). AI assesses creativity, technique, and alignment with brief — never "corrects" creative choices, only provides constructive feedback. | Creative thinking, originality, technique | Art, music theory, Swedish creative writing, design |
| **Code Challenge** | Programming problems with auto-testing. Student writes code, platform runs it against test cases, AI reviews code quality and suggests improvements. | Programming skill, logical thinking, problem-solving | Computer science, technology |

#### D. Comprehensive Assessment Formats

| Format | How It Works | What It Tests | Best For |
|--------|-------------|---------------|----------|
| **Mock Exam (Övningsprov)** | Full-length, timed examination mirroring real exam format. Includes mix of question types. Formal conditions — no AI help during the exam, only AI marking and feedback afterwards. | Exam readiness, time management, performance under pressure | Pre-exam preparation |
| **Diagnostic Assessment** | Broad assessment across a subject or block. Identifies specific knowledge gaps and strengths. Not graded — purely informational. | Knowledge mapping, gap identification | Start of term, after long breaks, before exam revision |
| **Adaptive Assessment** | Difficulty adjusts in real-time based on student performance. Gets harder when student answers correctly, easier when they struggle. Converges on the student's actual level. | Precise level calibration | Ongoing progress tracking, personalised difficulty setting |
| **Portfolio Review** | AI reviews a collection of student work over time (essays, projects, problem sets) and assesses growth, consistency, and depth. | Long-term development, sustained effort, improvement trajectory | End-of-term evaluation, university applications |

### 9.2 Assessment Configuration

Teachers can configure assessments with granular control:

| Setting | Options |
|---------|---------|
| **Time limit** | Unlimited, soft timer (warning only), hard timer (auto-submit) |
| **AI assistance during exam** | None (exam conditions), hints only, full help (practice mode) |
| **Retakes** | None, unlimited, limited (1-3 attempts) |
| **Question order** | Fixed, randomised |
| **Question pool** | Fixed set, random selection from larger pool |
| **Feedback timing** | Immediate (after each question), after submission, delayed (teacher reviews first) |
| **Grading** | AI auto-grade, AI grade + teacher review, teacher-only |
| **Rubric** | Swedish grading (F, E, D, C, B, A), percentage, pass/fail, Bloom's dimensions |

### 9.3 Marking & Feedback

ANTON provides layered feedback on every assessment:

**Per-question feedback:** Not just "wrong" — explains why the answer is incorrect, what the correct reasoning is, and links to the relevant learning material.

**Pattern identification:** "You got 3 of 4 algebra questions right but both geometry questions wrong — let's focus on geometry."

**Progress over time:** "Your score on linear equations improved from 45% to 82% over the last 4 weeks."

**Exam technique feedback:** "You spent 12 minutes on question 3 (worth 5 marks) but only 3 minutes on question 7 (worth 15 marks). In the real exam, allocate time proportionally to marks."

**Bloom's dimension mapping:** Each question is tagged with the Bloom's level it tests. Assessment results are mapped to the student's Progress Tracker, showing which cognitive levels they're strong at and which need development.

### 9.4 Progress Tracker (Quality Ratchet Equivalent)

The Work Mode Quality Ratchet measures output quality across 6 dimensions. The School Mode **Progress Tracker** measures learning across educational dimensions:

| Dimension | What It Measures | Example |
|-----------|-----------------|---------|
| **Knowledge** | Factual recall and understanding | "Can recall the quadratic formula and explain when to use it" |
| **Application** | Ability to apply knowledge to new problems | "Successfully applies formula to word problems" |
| **Analysis** | Breaking down complex problems | "Can decompose a multi-step physics problem" |
| **Evaluation** | Critical thinking and source assessment | "Can assess the reliability of a historical source" |
| **Creation** | Original work and synthesis | "Writes coherent analytical essays with own argumentation" |
| **Metacognition** | Self-awareness of learning process | "Identifies own knowledge gaps and seeks help proactively" |

These map to Bloom's Taxonomy and are tracked per subject, per student, over time. Every assessment feeds into these dimensions — a multiple choice quiz primarily tests Knowledge, while a Socratic examination tests Analysis and Evaluation.

---

## 10. My Radar (Horizon Radar Refocused)

The Work Mode Horizon Radar tracks regulatory changes, industry developments, and professional deadlines. In School Mode, this becomes **My Radar** — a personalised feed of things the student cares about, blended with educational value.

### 10.1 Radar Categories

| Category | Content | Educational Tie-In |
|----------|---------|-------------------|
| **Sports** | Match results, fixtures, tournament standings (football, hockey, basketball, etc.) | Statistics, probability, data analysis, geography |
| **E-Sports** | Tournament results, team rankings, game patches, meta changes | Strategic thinking, data analysis, teamwork dynamics |
| **Gaming** | New game releases, reviews, industry news | Technology, creative industries, economics (game pricing, business models) |
| **Science & Tech** | Space missions, discoveries, tech product launches | Direct subject connection — "NASA launched X, here's the physics behind it" |
| **Culture & Entertainment** | Movies, music, books, streaming releases | Language arts, cultural studies, media analysis |
| **School Calendar** | Exam dates, assignment deadlines, school events | Time management, planning |
| **World Events** | Age-appropriate current affairs (filtered by tier) | Social studies, geography, civics |

### 10.2 The Educational Bridge

The genius of My Radar is that it makes learning feel relevant. Every radar item can optionally include an **educational bridge**:

```
┌──────────────────────────────────────────────────────────┐
│ ⚽ Champions League Results                              │
│ Barcelona 3 — Manchester City 1                          │
│                                                          │
│ 💡 Learning Bridge:                                      │
│ "Barcelona's possession was 62%. If they had 847 passes  │
│ and City had 519, what's the pass completion rate for    │
│ each team?" [Try it →]                                   │
│                                                          │
│ 🌍 Geography: Barcelona is in Catalonia, Spain.          │
│ City is from Manchester, England. How far apart are they?│
│ [Explore →]                                              │
└──────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────┐
│ 🎮 E-Sports: Worlds 2026 — League of Legends            │
│ T1 defeats Gen.G 3-2 in Semi-Finals                     │
│                                                          │
│ 💡 Learning Bridge:                                      │
│ "In a best-of-5 series, how many possible game           │
│ combinations end in a 3-2 result? (Hint: combinatorics)" │
│ [Try it →]                                               │
│                                                          │
│ 🌍 Culture: T1 is from South Korea. What do you know    │
│ about South Korea's technology industry?                 │
│ [Explore →]                                              │
└──────────────────────────────────────────────────────────┘
```

### 10.3 Personalisation

Students configure their Radar by selecting:
- Sports teams they follow
- E-sports games and teams
- Gaming platforms and genres
- Science/tech interests
- Cultural interests

The AI learns which educational bridges the student engages with and adjusts accordingly — if a student always clicks the maths bridges on football stats but ignores the geography ones, the system generates more maths-oriented bridges.

---

## 11. Student Growth Model (Apprentice Model Equivalent)

In Work Mode, the Apprentice Model learns the *user's* preferences to optimise AI configuration. In School Mode, the **Student Growth Model** learns the *student's* learning patterns to optimise teaching.

### 11.1 What the Model Tracks

| Dimension | What It Learns | How It Adapts |
|-----------|---------------|---------------|
| **Knowledge Level** | What the student knows per topic | Skips known material, focuses on gaps |
| **Learning Speed** | How quickly new concepts are absorbed | Adjusts pacing — more examples for slower topics, faster progression for strong areas |
| **Preferred Explanation Style** | Visual vs. verbal, abstract vs. concrete, examples-first vs. theory-first | Teacher personas adapt their explanation approach |
| **Attention Patterns** | When the student is most engaged, session length preferences | Suggests optimal study times, breaks |
| **Error Patterns** | Common mistake types (calculation errors, misunderstanding instructions, conceptual gaps) | Targets specific weaknesses |
| **Motivation Triggers** | What keeps the student engaged (challenges, praise, competition, real-world relevance) | Adjusts tone and framing |
| **Struggle Points** | Topics where the student consistently needs more help | Flags for teacher/parent attention, generates extra practice |

### 11.2 The Four Stages (Student Version)

| Stage | Name | AI Behaviour | Advancement |
|-------|------|-------------|-------------|
| **S1** | Getting to Know You | Observes learning patterns, asks diagnostic questions, provides full scaffolding | 5+ sessions |
| **S2** | Building Confidence | Begins adapting to student's level, reduces scaffolding where student is strong, maintains support where needed | 15+ sessions, demonstrated improvement |
| **S3** | Growing Independence | Student leads more, AI provides less scaffolding, challenges student with harder problems | 30+ sessions, consistent performance |
| **S4** | Self-Directed Learner | AI acts as a resource, student drives their own learning, AI intervenes mainly to challenge or verify | Demonstrated self-correction, initiative |

### 11.3 Parent & Teacher Dashboards

The Student Growth Model feeds into dashboards:

**Parent Dashboard:**
- Overall progress summary per subject
- Time spent studying (not surveillance — aggregate, not per-message)
- Areas of strength and areas needing attention
- Upcoming deadlines and suggested study focus
- Learning milestones reached

**Teacher Dashboard:**
- Class-wide progress overview
- Individual student summaries
- Topic difficulty analysis (which topics are most students struggling with?)
- Suggested intervention points
- Exportable progress reports

---

## 12. Platform Feature Mapping

Here is the complete mapping of Work Mode features to their School Mode equivalents:

| Work Mode Feature | School Mode Equivalent | Adaptation |
|---|---|---|
| **Areas** (29→56 domains) | **Subjects** (38 subject areas across 5 tiers) | Organised by curriculum and year level |
| **Modules** (485+) | **Lessons & Tools** (~200–250 initial) | Teaching methodology replaces task methodology |
| **Expert Personas** | **Teacher Personas** | Teaching styles, age-appropriate interaction |
| **Seven-Layer Prompt Builder** | **Same architecture** | Layer content changes, structure stays |
| **Knowledge Sources** | **Textbooks, Curricula, Approved Resources** | Filtered by age tier, curriculum-aligned |
| **Multi-LLM** | **Same** | Haiku for T1 routine, Sonnet default, Opus for T4+ |
| **Horizon Radar** | **My Radar** | Sports, e-sports, gaming, science, culture |
| **Quality Ratchet** | **Progress Tracker** | Bloom's Taxonomy dimensions |
| **Apprentice Model** | **Student Growth Model** | Learns student, not preferences |
| **Discovery Mode** | **Learning Pathway Discovery** | "What do I need to learn and in what order?" |
| **Engagement Tasks** | **Project Workflows** | Research, draft, review, submit cycle |
| **Workflow Builder** | **Study Plan Builder** | Week-by-week curriculum delivery |
| **Compliance-as-Code** | **Academic Integrity Rules** | Anti-plagiarism, source verification, assistance levels |
| **Audit Trail** | **Learning Evidence Log** | Shows process, not just output |
| **Collaborative Canvas** | **Group Project Space** | Team assignments, peer review |
| **Institutional Memory** | **Learning Memory** | Remembers what student has mastered |
| **Knowledge Graph** | **Concept Map** | Visual connections between topics |
| **Output Versioning** | **Draft History** | Shows essay/project evolution |
| **Brief Me** | **Quick Question** | "What does photosynthesis mean?" |
| **Guide Me** | **Help Me Study** | "I have a maths test on Friday, where should I start?" |
| **Batch Create** | **Worksheet Generator** | Generate 20 practice problems |
| **Context & Constraints** | **Learning Preferences & Accommodations** | Dyslexia support, ADHD adjustments, language preferences |
| **.anton packages** | **.anton packages** | Teachers share lesson plans, curricula, subject modules |
| **Build Your Own Module** | **Build Your Own Lesson** | Teachers create custom lessons |
| **Coding Area** | **Learn to Code Area** | Same 4 tiers but with pedagogical scaffolding |
| **PowerPoint Pipeline** | **Presentation Builder** | Students create presentation for school projects |
| **Dark/Light/Corporate Theme** | **Dark/Light/School Theme** | Colourful, friendly school theme option |
| **Engagement Tasks (8-phase)** | **Course Journey** | Term-long progress tracking with mastery levels and progress bars |
| **Module workspace** | **Contextualised Chat** | Pre-loaded context, task-emergent actions, teacher-driven structure |
| **Configuration panel** | **Teacher/Admin Layer** | All config moved to teacher/parent/admin — invisible to students |
| *No equivalent* | **Läxhjälp (Deep Focus)** | Targeted stuck-point resolution with diagnostic protocol |
| *No equivalent* | **Life Skills & Work Coaching** | CV writing, personal finance, job search, entrepreneurship |
| *No equivalent* | **Assessment Toolkit (15+ formats)** | Multiple choice, Socratic exam, case study, timed mock, adaptive |
| **i18n (30 languages, community-driven)** | **Full localisation (3 layers)** | UI + AI conversation + content language, separated for flexibility |

---

## 13. Safety, Privacy & Governance

### 13.1 Age-Appropriate Content Filtering

- **T1 (6–12):** Strict content filtering. No violent, sexual, or disturbing content. No unsupervised web search. Curated knowledge sources only.
- **T2 (13–15):** Moderate filtering. Web search with safe search enforced. Mature topics handled age-appropriately (e.g., WWII can discuss the Holocaust factually but not graphically).
- **T3 (16–18):** Light filtering. Most academic topics accessible. Mature themes handled with academic framing.
- **T4–T5 (18+):** Adult filtering same as Work Mode.

### 13.2 Data Privacy

- **GDPR compliance** — Minimum data collection, full data portability, right to deletion
- **COPPA compliance** — Parental consent required for T1, verifiable parental consent mechanisms
- **No advertising** — School Mode never shows ads or promotes products
- **No training data** — Student interactions are never used to train AI models without explicit consent
- **Local-first option** — Schools can deploy ANTON locally (Ollama) for full data sovereignty
- **Data residency** — Schools choose where data is stored (EU requirement for Swedish schools)

### 13.3 Role-Based Access

| Role | Permissions |
|------|------------|
| **Student** | Access own subjects, homework help, My Radar, progress view |
| **Parent/Guardian** | View child's progress dashboard, set assistance levels, manage Radar content |
| **Teacher** | Manage class subjects, set assistance levels, view student progress, create custom lessons, generate assessments |
| **School Admin** | Configure school-wide settings, manage teacher accounts, set content policies, data management |

### 13.4 Audit & Transparency

Every interaction produces an audit record containing:
- Timestamp
- Student identifier (pseudonymised where required)
- Module/lesson used
- Assistance level in effect
- AI responses (summarised, not full text — for storage efficiency)
- Student inputs and reasoning demonstrated
- Sources consulted
- Assessment results
- Flags raised (if any)

This audit trail serves three purposes:
1. **Academic integrity** — Teachers can verify AI was used as a learning aid, not a homework machine
2. **Learning analytics** — Data drives adaptive teaching
3. **Safety** — Pattern detection for student wellbeing concerns (see Section 11.5)

### 13.5 Wellbeing Monitoring

ANTON includes passive wellbeing awareness (not surveillance):
- If a student expresses distress, frustration beyond normal levels, or concerning content, the system gently redirects and can flag for teacher/counsellor attention
- This is not automated reporting — it surfaces concerns to appropriate adults through the dashboard
- Follows local laws on mandatory reporting
- All wellbeing-related interactions are handled by the system's most careful, empathetic responses

---

## 14. Language & Localisation — Every Student in Their Own Language

### 14.1 Why This Is Non-Negotiable for School Mode

ANTON's Work Mode already supports 30 languages and the architecture is i18n-ready with `src/i18n/locales/`. For professionals, this is a nice-to-have — most can work in English if they need to. For School Mode, it's a hard requirement.

A 10-year-old whose home language is Arabic, Somali, or Dari cannot learn mathematics through an English interface. A parent who speaks Tigrinya cannot review their child's progress in English. A teacher in a multilingual classroom needs the platform to meet each student where they are linguistically.

This is also central to ANTON's democratisation mission. If School Mode only works well in English and Swedish, it fails the students who need it most — precisely the students in under-resourced schools with high proportions of newly arrived families, where an AI tutor available in their home language could be transformative.

### 14.2 The Three Language Layers

Language in School Mode operates across three distinct layers, and the architecture must handle each separately:

#### Layer 1: Interface Language (UI Strings)

This is the chrome — buttons, labels, navigation, dashboard headings, status indicators, settings panels. Everything the platform *itself* says to the student.

**Architecture:** Standard i18n with locale files (`src/i18n/locales/{lang}.json`). Every UI string is a key-value pair. No hardcoded text anywhere in the codebase.

```json
// src/i18n/locales/sv.json
{
  "dashboard.thisWeek": "DENNA VECKA",
  "dashboard.myProgress": "MIN FRAMSTEG",
  "dashboard.quickQuestion": "Snabb fråga",
  "dashboard.allSubjects": "Alla ämnen",
  "chat.typeMessage": "Skriv ditt meddelande...",
  "chat.send": "Skicka",
  "chat.uploadPhoto": "Ladda upp foto",
  "chat.switchTeacher": "Byt lärare",
  "progress.strong": "Stark",
  "progress.building": "Bygger upp",
  "progress.emerging": "Börjar",
  "laxhjalp.stuck": "Fastnat",
  "laxhjalp.working": "Jobbar på det",
  "laxhjalp.gotIt": "Fattar!"
}

// src/i18n/locales/ar.json
{
  "dashboard.thisWeek": "هذا الأسبوع",
  "dashboard.myProgress": "تقدمي",
  "dashboard.quickQuestion": "سؤال سريع",
  ...
}
```

**RTL support:** Arabic, Hebrew, Farsi, and Urdu require right-to-left layout. The CSS architecture must support `dir="rtl"` from day one — retrofitting RTL is extremely painful. Tailwind CSS (which ANTON uses) has built-in RTL utilities (`rtl:` prefix).

**What this means practically:** Every component, every label, every button — written as a translatable key from the start. No `<button>Send</button>` — always `<button>{t('chat.send')}</button>`. This discipline must be enforced in code review. Any hardcoded string in a PR is rejected.

#### Layer 2: AI Conversation Language (LLM Output)

This is how the teacher personas speak to the student — the actual teaching conversation, explanations, questions, feedback. This is the most important layer for learning.

**Architecture:** The LLM handles this naturally. When the student's language preference is set to Arabic, the system prompt (Layer 1 of the seven-layer builder) includes a language instruction:

```markdown
LANGUAGE: Communicate with the student in Arabic (العربية). 
All explanations, questions, feedback, and encouragement must be 
in Arabic. Use culturally appropriate examples where possible. 
If the student writes in another language, respond in that language 
but gently confirm their preferred language.
```

**This mostly works out of the box** with modern LLMs. Claude, GPT, and Mistral all handle multilingual conversation well. However, quality varies by language — Claude's Arabic is good but not as nuanced as its English or Swedish. For lower-resource languages (Somali, Tigrinya, Dari), output quality needs explicit testing and the system should be transparent about limitations.

**Subject-specific terminology:** Mathematics and science have specialised terminology that varies by language. "Ekvation" in Swedish, "معادلة" in Arabic, "equation" in English. The subject context layer (Layer 2 of the prompt builder) should include a terminology reference for the student's language where available. This can be community-contributed — a maths teacher who teaches in Arabic contributes the Arabic maths terminology file, which enriches the subject context for all Arabic-speaking students.

**Mixed-language handling:** Students in multilingual environments often code-switch. A student in Sweden might write in Swedish but use Arabic for words they know better in Arabic, or switch to English for technical terms they learned in English. The AI should handle this gracefully — respond in the student's primary language but accept input in any language without correcting or commenting on the switch.

#### Layer 3: Content Language (Knowledge Sources, Curricula, Assessments)

This is the educational content itself — textbook references, curriculum documents, exam questions, worked examples.

**Architecture:** This is the hardest layer because content must be authored, not generated. A Swedish curriculum document uploaded in Swedish stays in Swedish. A textbook chapter in English stays in English.

**Approach:**
- **Curriculum packages** (`.anton` bundles) are tagged with their language
- **AI can translate on-the-fly** for explanation purposes ("The textbook says X — in your language, this means Y") but always attributes the original source
- **Assessment questions** can be authored in multiple languages within the same module (the `.anton` format supports a `locales/` directory within any bundle)
- **Community translation of educational content** follows the same model as Work Mode — domain experts (teachers) contribute translated module content for their language

### 14.3 The Language Setting

The student (or parent, for younger children) sets their home language during setup. This single setting cascades across all three layers:

```
┌──────────────────────────────────────────────────────┐
│  🌐 Language / Språk / اللغة                         │
│                                                      │
│  Interface language:     [العربية (Arabic)     ▼]    │
│  Teaching language:      [العربية (Arabic)     ▼]    │
│  I also understand:      [☑ Svenska  ☑ English]      │
│                                                      │
│  This changes all buttons, menus, and navigation     │
│  to Arabic. Your AI teachers will speak Arabic.      │
│  Swedish and English content will be translated      │
│  where possible.                                     │
└──────────────────────────────────────────────────────┘
```

**Why separate "interface" and "teaching" language?** Because a student might want the interface in Swedish (they're learning Swedish, it helps with immersion) but the AI teaching explanations in Arabic (they understand maths concepts better in their first language). Or a university student might want the interface in Swedish but teaching in English (because their academic programme is in English).

The "I also understand" checkboxes tell the system which languages the student can handle for content that hasn't been translated — if a source document is only available in Swedish and the student has checked "Svenska," the AI can reference it directly rather than attempting a translation.

### 14.4 The 30 ANTON Languages — Country Mapping

ANTON already supports 30 languages in Work Mode. In School Mode, each language maps to one or more **countries**, and each country has its own national curriculum. The student selects both **language** and **country** — these are independent settings.

A student who speaks Arabic might be in Sweden (Skolverket curriculum), Egypt (Ministry of Education curriculum), or Germany (KMK/Bildungsstandards curriculum). Same language, completely different learning content. The country setting determines which curriculum the Course Journey follows.

#### The 30 Languages and Their Primary Education Countries

| # | Language | Code | Script | RTL | Primary Countries (Curriculum) |
|---|----------|------|--------|-----|-------------------------------|
| 1 | English | en | Latin | No | UK, USA, Australia, Canada, Ireland, South Africa, Kenya, Nigeria, India (CBSE English-medium) |
| 2 | Swedish | sv | Latin | No | Sweden |
| 3 | Norwegian | no | Latin | No | Norway |
| 4 | Danish | da | Latin | No | Denmark |
| 5 | Finnish | fi | Latin | No | Finland |
| 6 | German | de | Latin | No | Germany, Austria, Switzerland (DE) |
| 7 | French | fr | Latin | No | France, Belgium (FR), Switzerland (FR), Canada (QC), Senegal, Côte d'Ivoire |
| 8 | Spanish | es | Latin | No | Spain, Mexico, Colombia, Argentina, Chile, Peru |
| 9 | Portuguese | pt | Latin | No | Portugal, Brazil |
| 10 | Italian | it | Latin | No | Italy |
| 11 | Dutch | nl | Latin | No | Netherlands, Belgium (NL) |
| 12 | Polish | pl | Latin | No | Poland |
| 13 | Ukrainian | uk | Cyrillic | No | Ukraine |
| 14 | Russian | ru | Cyrillic | No | Russia (optional — community-driven) |
| 15 | Arabic | ar | Arabic | **Yes** | Egypt, Saudi Arabia, UAE, Jordan, Morocco, Iraq, Sweden (SFI context) |
| 16 | Farsi/Dari | fa | Arabic | **Yes** | Iran, Afghanistan |
| 17 | Turkish | tr | Latin | No | Turkey |
| 18 | Kurdish (Kurmanji) | ku | Latin | No | Turkey (Kurdish regions), Iraq (KRI), Sweden (diaspora) |
| 19 | Somali | so | Latin | No | Somalia, Somaliland, Sweden (diaspora) |
| 20 | Tigrinya | ti | Ge'ez | No | Eritrea, Ethiopia (Tigray), Sweden (diaspora) |
| 21 | Amharic | am | Ge'ez | No | Ethiopia |
| 22 | Swahili | sw | Latin | No | Kenya, Tanzania, Uganda |
| 23 | Hindi | hi | Devanagari | No | India (CBSE/state boards) |
| 24 | Bengali | bn | Bengali | No | Bangladesh, India (West Bengal) |
| 25 | Urdu | ur | Arabic | **Yes** | Pakistan, India (Urdu-medium) |
| 26 | Mandarin Chinese | zh | CJK | No | China, Taiwan, Singapore |
| 27 | Japanese | ja | CJK | No | Japan |
| 28 | Korean | ko | Hangul | No | South Korea |
| 29 | Thai | th | Thai | No | Thailand |
| 30 | Indonesian/Malay | id | Latin | No | Indonesia, Malaysia |

**RTL languages (4):** Arabic, Farsi/Dari, Kurdish (Sorani variant), Urdu — all require RTL layout support from day one.

**Note:** The exact 30 languages should be confirmed against `src/lib/constants.ts` in the codebase. This list reflects ANTON's target markets: Nordic core, European expansion, migration languages in Sweden, global reach for BoP delivery.

### 14.5 The Country Setting — Why It Matters

Language tells the AI *how* to speak. Country tells the AI *what* to teach.

```
┌──────────────────────────────────────────────────────┐
│  📍 Country / Land                                    │
│                                                      │
│  Where are you studying?   [Sweden 🇸🇪          ▼]    │
│                                                      │
│  This determines:                                    │
│  • Which national curriculum your courses follow     │
│  • What grading system is used (F-A, 1-10, %, etc.) │
│  • Which exam formats apply                          │
│  • Life Skills content (taxes, government services)  │
│  • School calendar and term structure                │
│                                                      │
│  🌐 Language:              [العربية (Arabic)     ▼]  │
│  📚 Teaching language:     [العربية (Arabic)     ▼]  │
│  💬 I also understand:     [☑ Svenska  ☑ English]    │
│                                                      │
│  Your AI teachers will follow Sweden's curriculum    │
│  (Skolverket Lgr22) and speak Arabic.                │
└──────────────────────────────────────────────────────┘
```

**Country affects:**
- **Curriculum content** — What topics are taught at which grade level (Year 7 maths in Sweden ≠ Year 7 maths in UK)
- **Grading system** — Sweden uses F-A (soon 1-10), UK uses 1-9 GCSE, Germany uses 1-6, France uses 0-20
- **Assessment format** — Swedish nationella prov vs. UK SATs/GCSEs vs. German Klassenarbeiten
- **Life Skills content** — Skatteverket vs. HMRC vs. Finanzamt; CSN vs. student finance; personnummer vs. NI number
- **School structure** — Sweden: lågstadiet/mellanstadiet/högstadiet; UK: Key Stages; Germany: Grundschule/Gymnasium
- **Cultural context** — Examples, references, and scenarios drawn from the student's country
- **Term calendar** — When school starts, when exams happen, when breaks fall

**Country does NOT affect:**
- The AI's teaching methodology (Bloom's taxonomy, Socratic method — universal)
- The three-layer interface design (universal)
- Assessment quality standards (universal)
- Safety and privacy framework (universal, plus local legal requirements)

### 14.6 National Curriculum Source Registry

For ANTON to teach according to a country's curriculum, it needs the actual curriculum documents loaded as knowledge sources. These are the authoritative sources, country by country. All listed sources are **publicly available and free** — they are government documents meant for public use.

#### Tier 1: Full Curriculum Packages (Build First)

These countries have well-structured, downloadable curriculum documents suitable for direct ingestion:

**🇸🇪 Sweden — Skolverket**
- **Source:** skolverket.se
- **Documents:** Lgr22 (grundskolan), Lgy11 (gymnasiet), kursplaner per ämne
- **Format:** PDF downloads, structured by subject and grade
- **Direct URL:** `skolverket.se/undervisning/grundskolan/kursplaner-for-grundskolan`
- **Language:** Swedish (English translations available for Lgr22 framework)
- **Update cycle:** Major revision underway (10-årig grundskola, new kursplaner expected 2027-2028)
- **Grading:** Currently F-A, proposed change to 1-10
- **Key feature:** Ämnesspecifika instruktioner (subject-specific instructions) available as PDFs per subject — excellent for AI training
- **Status:** Priority 1 — build first

**🇬🇧 United Kingdom — Department for Education**
- **Source:** gov.uk/government/collections/national-curriculum
- **Documents:** National Curriculum KS1-KS4, programmes of study per subject
- **Format:** PDF and HTML, well-structured
- **Direct URL:** `gov.uk/government/publications/national-curriculum-in-england-framework-for-key-stages-1-to-4`
- **Language:** English
- **Update cycle:** Current framework from 2014, new review underway
- **Grading:** KS1-2 teacher assessment, KS4 GCSE 9-1
- **Note:** England-specific; Scotland, Wales, NI have separate curricula (Curriculum for Excellence, Curriculum for Wales, NI Curriculum)
- **Status:** Priority 1

**🇳🇴 Norway — Utdanningsdirektoratet (Udir)**
- **Source:** udir.no
- **Documents:** LK20 (Fagfornyelsen), subject curricula (læreplaner), core curriculum
- **Format:** PDF and web, per subject with English translations available
- **Direct URL:** `data.udir.no/kl06/v201906/laereplaner-lk20/{CODE}.pdf?lang=eng`
- **Language:** Norwegian Bokmål (English translations available)
- **Update cycle:** LK20 from 2020, modular VET curricula from 2024-2025
- **Grading:** 1-6 scale
- **Status:** Priority 1

**🇩🇰 Denmark — Børne- og Undervisningsministeriet**
- **Source:** emu.dk / retsinformation.dk
- **Documents:** Fælles Mål (Common Objectives) per subject, Folkeskole Act
- **Format:** PDF downloads from emu.dk
- **Direct URL:** `emu.dk/grundskole` (subject curricula)
- **Language:** Danish
- **Grading:** 7-point scale (-3 to 12)
- **Status:** Priority 1

**🇫🇮 Finland — Opetushallitus (Finnish National Agency for Education)**
- **Source:** oph.fi
- **Documents:** National Core Curriculum for Basic Education (2014), General Upper Secondary (2019)
- **Format:** PDF, purchasable from oph.fi; summary/framework available free
- **Language:** Finnish (English summaries available)
- **Note:** Full curriculum document is a paid publication (~47€) but framework documents and subject-specific goals are accessible
- **Grading:** 4-10 scale (basic education), 4-10 scale (upper secondary)
- **Status:** Priority 1

#### Tier 2: Major European Curricula (Build Second)

**🇩🇪 Germany — Kultusministerkonferenz (KMK)**
- **Source:** kmk.org + individual Bundesland education ministries
- **Documents:** Bildungsstandards (national standards), Lehrpläne (state-specific)
- **Complexity:** 16 Bundesländer each have their own curricula; KMK sets national standards
- **Recommended approach:** Start with KMK Bildungsstandards for core subjects (Maths, German, English, Sciences), then add state-specific Lehrpläne as community contributions
- **Language:** German
- **Grading:** 1-6 (1=best), Abitur on 0-15 points

**🇫🇷 France — Ministère de l'Éducation nationale / Éduscol**
- **Source:** eduscol.education.fr
- **Documents:** Programmes scolaires (per cycle and subject)
- **Format:** PDF, well-structured by cycle (Cycle 2: CP-CE2, Cycle 3: CM1-6e, Cycle 4: 5e-3e)
- **Language:** French
- **Grading:** 0-20 scale

**🇪🇸 Spain — Ministerio de Educación**
- **Source:** educagob.educacionfpydeportes.gob.es
- **Documents:** Currículo LOMLOE (Real Decreto 157/2022 Primaria, 217/2022 ESO)
- **Complexity:** 17 Comunidades Autónomas adapt the national curriculum
- **Language:** Spanish (+ Catalan, Basque, Galician variants)
- **Grading:** 0-10 scale

**🇳🇱 Netherlands — SLO (Curriculum.nu)**
- **Source:** slo.nl / curriculum.nu
- **Documents:** Kerndoelen (core objectives) and Eindtermen (final terms)
- **Language:** Dutch

**🇵🇱 Poland — Ministerstwo Edukacji Narodowej**
- **Source:** gov.pl/web/edukacja
- **Documents:** Podstawa programowa (Core Curriculum)
- **Language:** Polish

**🇮🇹 Italy — Ministero dell'Istruzione**
- **Source:** miur.gov.it
- **Documents:** Indicazioni Nazionali per il curricolo (2012, updated 2018)
- **Language:** Italian

#### Tier 3: Global South & Major Markets (Build with Community)

**🇮🇳 India — NCERT**
- **Source:** ncert.nic.in
- **Documents:** National Curriculum Framework for School Education (NCFSE 2023), textbooks per class
- **Key asset:** NCERT textbooks are freely downloadable as PDFs — extremely valuable
- **Direct URL:** `ncert.nic.in/textbook.php` (all textbooks, all classes, free PDFs)
- **Languages:** Hindi and English (textbooks available in both)
- **Complexity:** CBSE (national) + 28 state boards with varying curricula
- **Grading:** Percentage-based, CBSE uses letter grades A1-E

**🇧🇷 Brazil — Ministério da Educação**
- **Source:** basenacionalcomum.mec.gov.br
- **Documents:** Base Nacional Comum Curricular (BNCC)
- **Language:** Portuguese

**🇹🇷 Turkey — Millî Eğitim Bakanlığı (MEB)**
- **Source:** mufredat.meb.gov.tr
- **Documents:** Öğretim Programları (Teaching Programs) per subject
- **Language:** Turkish

**🇪🇬 Egypt — Ministry of Education**
- **Source:** moe.gov.eg
- **Documents:** National curriculum framework, textbooks (being reformed under Education 2.0)
- **Language:** Arabic

**🇰🇪 Kenya — Kenya Institute of Curriculum Development (KICD)**
- **Source:** kicd.ac.ke
- **Documents:** Competency-Based Curriculum (CBC), curriculum designs per grade
- **Language:** English and Swahili

**🇯🇵 Japan — MEXT**
- **Source:** mext.go.jp
- **Documents:** Course of Study (学習指導要領)
- **Language:** Japanese (English overview available)

**🇰🇷 South Korea — Ministry of Education**
- **Source:** moe.go.kr
- **Documents:** National Curriculum (2022 revised)
- **Language:** Korean

**🇨🇳 China — Ministry of Education**
- **Source:** moe.gov.cn
- **Documents:** Curriculum Standards (课程标准)
- **Language:** Mandarin Chinese

**🇮🇩 Indonesia — Kemendikbudristek**
- **Source:** kurikulum.kemdikbud.go.id
- **Documents:** Kurikulum Merdeka (Freedom Curriculum, 2022)
- **Language:** Indonesian

**🇹🇭 Thailand — Ministry of Education**
- **Source:** moe.go.th
- **Documents:** Basic Education Core Curriculum B.E. 2551 (2008, revised)
- **Language:** Thai

**🇵🇰 Pakistan — National Curriculum Council**
- **Source:** ncc.gov.pk
- **Documents:** Single National Curriculum (SNC)
- **Language:** Urdu and English

**🇧🇩 Bangladesh — NCTB**
- **Source:** nctb.gov.bd
- **Documents:** National Curriculum and Textbook Board materials
- **Language:** Bengali
- **Key asset:** Textbooks freely available as PDFs

**🇪🇹 Ethiopia — Ministry of Education**
- **Source:** moe.gov.et
- **Documents:** National curriculum framework
- **Languages:** Amharic (+ Tigrinya for Tigray region)

**🇸🇴 Somalia — Ministry of Education**
- **Source:** Limited centralised curriculum due to ongoing challenges
- **Recommended approach:** Use community-contributed educational materials; partner with Somali diaspora educators
- **Language:** Somali

**🇺🇦 Ukraine — Ministry of Education and Science**
- **Source:** mon.gov.ua
- **Documents:** New Ukrainian School (NUS) curriculum framework
- **Language:** Ukrainian

#### The UNESCO-IBE Resource

For any country not listed above, or for supplementary reference:
- **UNESCO International Bureau of Education (IBE):** ibe.unesco.org
- **Coverage:** 160+ countries with education system profiles
- **World Data on Education:** Country dossiers with curriculum overviews
- **Digital library:** National reports, curriculum frameworks, training tools
- **Documentation Centre:** 600,000+ documents, 127,000+ pages digitised
- **Use:** Starting point for community contributors building curriculum packages for countries not in Tier 1-3

### 14.7 Curriculum Knowledge Architecture

Curriculum documents are loaded into ANTON as structured knowledge sources. Here's how they integrate:

```
curricula/
├── se/                                    # Sweden
│   ├── manifest.json                      # Country metadata, grading system, school structure
│   ├── grundskolan/                       # Basic education (Years 1-9)
│   │   ├── matematik/                     # Mathematics
│   │   │   ├── kursplan.md                # Full syllabus (from Skolverket)
│   │   │   ├── centralt_innehall.json     # Core content, structured by year range
│   │   │   ├── betygskriterier.json       # Grading criteria
│   │   │   └── termer_sv.json             # Subject terminology in Swedish
│   │   ├── svenska/
│   │   ├── engelska/
│   │   ├── no/                            # Sciences (NO = naturorienterande)
│   │   └── so/                            # Social studies
│   ├── gymnasiet/                         # Upper secondary
│   │   ├── matematik_1a/
│   │   ├── matematik_2b/
│   │   └── ...
│   └── README.md                          # Notes on Swedish system
├── gb/                                    # United Kingdom
│   ├── manifest.json
│   ├── ks1/                               # Key Stage 1 (Years 1-2)
│   ├── ks2/                               # Key Stage 2 (Years 3-6)
│   ├── ks3/                               # Key Stage 3 (Years 7-9)
│   └── ks4/                               # Key Stage 4 (Years 10-11, GCSE)
├── no_country/                            # Norway
├── dk/                                    # Denmark
├── fi/                                    # Finland
├── de/                                    # Germany (KMK standards + Bundesland extras)
├── fr/                                    # France
└── ...
```

**The `manifest.json` per country:**
```json
{
  "country": "se",
  "countryName": { "en": "Sweden", "sv": "Sverige" },
  "curriculumAuthority": "Skolverket",
  "curriculumName": "Lgr22",
  "sourceUrl": "https://skolverket.se",
  "schoolStructure": {
    "primary": { "name": "Lågstadiet", "years": [1, 3], "ages": [7, 9] },
    "middle": { "name": "Mellanstadiet", "years": [4, 6], "ages": [10, 12] },
    "lower_secondary": { "name": "Högstadiet", "years": [7, 9], "ages": [13, 15] },
    "upper_secondary": { "name": "Gymnasiet", "years": [1, 3], "ages": [16, 18] }
  },
  "gradingSystem": {
    "type": "letter",
    "scale": ["F", "E", "D", "C", "B", "A"],
    "passing": "E",
    "note": "Proposed change to 1-10 scale from ~2028"
  },
  "termStructure": {
    "terms_per_year": 2,
    "term_names": ["Hösttermin", "Vårtermin"],
    "school_year_start": "August",
    "school_year_end": "June"
  },
  "nationalExams": ["Nationella prov (Year 3, 6, 9)"],
  "curriculumLanguage": "sv",
  "lastUpdated": "2025-03-01"
}
```

### 14.8 How to Build the Curriculum Knowledge Base

This is a practical plan for actually getting curriculum content into ANTON — not a wish list but a step-by-step process:

**Step 1: Download and Structure (Manual, per country)**
1. Go to the curriculum authority website (see registry above)
2. Download official curriculum documents (PDFs, HTML)
3. Extract text content, structure into markdown files per subject per grade range
4. Create `manifest.json` with country metadata
5. Verify against official source (teacher review)

**Step 2: Package as .anton Curriculum Bundle**
Each country's curriculum becomes an `.anton` bundle:
```
se-grundskolan-lgr22.anton
├── manifest.json          # Bundle metadata
├── curriculum/            # Structured curriculum content
├── terminology/           # Subject terms in local language
├── grading/               # Grading criteria and rubrics
└── sample-plans/          # Example study plans per grade
```

**Step 3: Community Contribution Model**
- Core team builds Sweden + UK + Norway + Denmark + Finland (Tier 1)
- Community contributors build their own countries following the same structure
- Teacher review required before a curriculum bundle is accepted
- `.anton` packages enable easy sharing: a German teacher builds `de-gymnasium-nrw.anton`, shares it, any German student can use it

**Step 4: Ongoing Maintenance**
- Curricula change! Sweden is moving to new kursplaner (2027-2028), UK reviewing its national curriculum, Germany varies by state
- Each curriculum bundle has a `lastUpdated` field and a `sourceUrl` for the teacher/maintainer to check against
- Community alert system: when a country's curriculum changes, flag the bundle as needing update
- AI should note when teaching: "Based on [Curriculum Year]. If your school uses a newer version, please let your teacher know so they can update the curriculum source."

**Step 5: AI-Assisted Curriculum Extraction (Future)**
For countries where PDFs are the only source, build a pipeline:
1. Upload official curriculum PDF
2. ANTON (using a high-capability model like Opus) extracts and structures content into `centralt_innehall.json` format
3. Teacher reviews and corrects
4. Saves time vs. manual extraction — but teacher validation is always required

### 14.9 What Needs Translating vs. What Doesn't

| Component | Needs Human Translation? | Can AI Handle? | Notes |
|-----------|------------------------|----------------|-------|
| UI strings (buttons, labels, menus) | ✅ Yes — must be precise | Can draft, human reviews | ~500–800 string keys |
| Teacher persona names & descriptions | ✅ Yes — cultural adaptation | Can draft | Names may change by culture |
| Assessment question banks | ✅ Yes — must be accurate | Can draft, teacher reviews | Maths notation is universal but word problems need adaptation |
| Subject area names & descriptions | ✅ Yes | Can draft | Often have official translations in national curricula |
| AI conversation (real-time teaching) | ❌ No — LLM handles natively | ✅ Yes | Quality varies by language |
| Error messages & system notifications | ✅ Yes | Can draft | Must be clear and simple |
| Curriculum documents | ❌ No — uploaded in source language | AI translates on-the-fly when needed | Attribution to original always maintained |
| My Radar content | ❌ No — sourced in local language | ✅ Yes — search in student's language | Sports results are language-neutral, commentary varies |
| Help documentation | ✅ Yes | Can draft | Progressive — start with key guides |

### 14.10 Architecture Rules (Non-Negotiable)

These rules apply to all development, Work Mode and School Mode alike:

1. **No hardcoded strings.** Every user-facing text is a translation key. Violations are caught in CI/CD.
2. **RTL-ready CSS.** All layout must work in both LTR and RTL. Use logical properties (`margin-inline-start` not `margin-left`).
3. **Unicode-safe everywhere.** All text handling, storage, search, and display must handle full Unicode including Arabic, CJK, Devanagari, Ge'ez, and emoji.
4. **Locale-aware formatting.** Dates, numbers, currency, and time must use the student's locale (e.g., `1.234,56` in Swedish vs. `1,234.56` in English).
5. **Fallback chain.** If a string isn't translated, fall back to English, never show a raw key. `ar → en → key`.
6. **Translation files are community-contributed.** The platform ships with English and Swedish. All other languages are community PRs, reviewed by native speakers.
7. **Pluralisation support.** Many languages have complex plural rules (Arabic has six forms). Use ICU MessageFormat or equivalent.
8. **Font support.** The UI font stack must include fallbacks for Arabic (Noto Sans Arabic), CJK (Noto Sans CJK), Devanagari (Noto Sans Devanagari), and Ge'ez (Noto Sans Ethiopic). System font stacks won't cover all scripts.

### 14.11 The Community Translation Model

Translation follows the same open-source contribution model as modules:

1. **Fork and translate.** A contributor copies `src/i18n/locales/en.json` to their language code, translates strings, and submits a PR.
2. **Native speaker review.** At least one native speaker (ideally a teacher) reviews the translation before merge.
3. **Incremental is fine.** A partial translation (dashboard + chat interface) is better than no translation. The fallback chain handles untranslated strings gracefully.
4. **Subject terminology files.** Teachers contribute `subjects/{subject-id}/terms/{lang}.json` with subject-specific vocabulary in their language. These enrich the AI's teaching in that language.
5. **Educational `.anton` packages** in specific languages are the highest-value community contributions — a complete Matematik 2b course package translated and culturally adapted for Arabic-speaking students in Sweden is worth more than a thousand UI string translations.

---

## 15. The .anton Package in Education

The `.anton` package format works identically in School Mode. This enables:

### 15.1 Teacher-Created Content

A teacher creates a custom lesson module for their specific class and exports it as a `.anton` package. Other teachers can import it. Example:

```
my-linear-equations-lesson.anton
├── manifest.json (lesson metadata, tier, subject, prerequisites)
├── system-prompt.md (teaching methodology for this lesson)
├── teacher-persona.json (customised teacher configuration)
├── knowledge-sources/
│   ├── textbook-chapter-5.pdf
│   └── practice-problems.json
├── assessments/
│   ├── quiz-1.json
│   └── end-of-lesson-test.json
└── curriculum-alignment.json (maps to national curriculum codes)
```

### 15.2 School-Wide Packages

A school exports their entire curriculum configuration as a multi-module `.anton` bundle:

```
vasaskolan-matematik-ht2026.anton
├── manifest.json
├── curriculum.json (full term plan)
├── modules/ (12 lesson modules)
├── assessments/ (term tests, mock exams)
├── teacher-configs/ (preferred personas and settings)
└── policies.json (assistance levels, content filtering)
```

### 15.3 National Curriculum Packages

Skolverket (or equivalent national body) could publish official `.anton` curriculum packages:

```
skolverket-matematik-2b-2026.anton
├── manifest.json
├── kursplan.json (official course plan)
├── betygskriterier.json (grading criteria)
├── modules/ (aligned to centralt innehåll)
└── nationella-prov/ (national test preparation)
```

---

## 16. Integration with Work Mode

School Mode and Work Mode are not separate platforms — they are views of the same system. This creates natural bridges:

### 16.1 Career Exploration

Upper secondary and university students can "peek into" Work Mode areas to understand what professionals do:

- Business studies student explores the Strategy & Planning area
- Law student explores the Legal & Regulatory area
- CS student explores the Software Engineering and Coding areas
- Economics student explores Banking & Finance and Investment areas

These are read-only previews with educational framing: "This is how a professional compliance officer uses ANTON to analyse money laundering regulations. In your studies, you're learning the foundations of this work."

### 16.2 Graduation Pathway

As a student completes their education and enters the workforce, their ANTON account transitions:

- **Learning Memory** → **Professional baseline** (the system knows what they've studied)
- **Subject mastery data** → **Competency profile** (useful for professional development)
- **Study habits** → **Work preferences** (the Apprentice Model has a head start)
- **All student data** can be exported or deleted — the student controls this

### 16.3 Dual Mode for Working Students

University students or adult learners who work part-time can toggle between modes:

- Morning: School Mode for thesis writing
- Afternoon: Work Mode for internship tasks
- Evening: School Mode for exam revision

The toggle is instant and the context switch is clean.

---

## 17. Implementation Roadmap

### Phase 1: Foundation (MVP)
- Mode toggle UI (Work ↔ School)
- Study Dashboard (Layer A) — subject cards, progress overview, quick question entry
- Contextualised Chat (Layer B) — pre-loaded context, teacher greeting, task-type selection
- 3 subject areas (Mathematics, Language Arts, Science) at T2 level
- 3 teacher personas (Alma, Viktor, Saga)
- Homework help with nudging protocol and L1–L4 assistance levels
- Basic Läxhjälp mode (deep focus on stuck points)
- Basic audit trail / Learning Evidence Log
- Curriculum upload → study plan generation
- Course Journey with block-level progress bars
- Quick Quiz, Multiple Choice, and Short Answer assessment types
- Teacher configuration layer (Layer C) — assistance levels, knowledge sources
- **Language:** Swedish + English full coverage. All UI strings as i18n keys (zero hardcoded text). RTL-ready CSS. Fallback chain implemented.
- **Country:** Country selector in setup. Sweden `manifest.json` + curriculum content for grundskolan (Lgr22). UK national curriculum (KS1-4) as second country.
- **Curriculum:** Sweden (Skolverket Lgr22) and UK (National Curriculum) fully structured and loaded for Maths, Language Arts, Science.

### Phase 2: Expansion
- All T1–T3 subjects including cross-tier areas
- Full teacher persona roster (10+ personas)
- Life Skills & Work Coaching area — first 8 modules (CV, job search, personal finance basics)
- My Radar (sports, e-sports, gaming) with educational bridges
- Full assessment toolkit (15+ formats including Socratic examination, case study, calculation sets)
- Course Journey with skill-level tracking and spaced repetition
- Progress Tracker with Bloom's dimensions
- Student Growth Model (stages S1–S2)
- Parent and Teacher dashboards with class-wide views
- Contextual action bar (task-emergent tools)
- .anton package support for education bundles
- Group Project Space
- Tier-specific interface adaptations (T1 large text/voice, T3 expanded tools)
- **Language:** Community translation pipeline live. First community-contributed UI translations (Arabic, Somali as highest-need in Swedish schools). Subject terminology files for contributed languages.
- **Country:** Norway (LK20), Denmark (Fælles Mål), Finland (OPH Core Curriculum) — all Tier 1 Nordic countries complete. `.anton` curriculum bundle format finalised.
- **Curriculum:** All subjects structured for SE, GB, NO, DK, FI. Community template published for building new country curriculum bundles.

### Phase 3: University & Advanced
- T4 university subjects
- Thesis support module (persistent long-running workspace)
- Research methodology and academic writing with citation management
- Life Skills expansion — full module set (taxes, housing, insurance, government services)
- Advanced assessment types (adaptive, diagnostic, portfolio review, mock exams with timing)
- Student Growth Model (stages S3–S4)
- Career exploration bridges to Work Mode
- T3–T4 entrepreneurship modules (UF, freelancing, content creation)
- **Language:** Font stacks for all scripts. Pluralisation support (ICU MessageFormat). Community translations growing across the 30 languages.
- **Country:** Tier 2 European countries (Germany/KMK, France/Éduscol, Spain/LOMLOE, Netherlands, Poland, Italy). Community-contributed Tier 3 countries starting to appear (India/NCERT, Brazil/BNCC, Turkey, Kenya).
- **Curriculum:** AI-assisted curriculum extraction pipeline (upload PDF → structured content, teacher reviews). Country count target: 15+.

### Phase 4: Ecosystem
- Teacher community for .anton lesson sharing
- School administration tools (multi-class, multi-teacher management)
- T5 lifelong learning / professional retraining
- Graduation pathway (School → Work transition with competency transfer)
- Wellbeing monitoring system
- Cross-school analytics (anonymised, opt-in) for curriculum improvement
- **Language:** All 30 ANTON languages with at least partial UI translation. Educational `.anton` packages in non-English/Swedish languages. RTL fully battle-tested.
- **Country:** 30+ countries with structured curriculum bundles. UNESCO-IBE integration for supplementary reference. Automatic curriculum update detection (flag when source documents change).
- **Curriculum:** Full global coverage through community contributions. Country-specific Life Skills adapted per jurisdiction (tax systems, government services, employment laws).

---

## 18. Why This Matters

ANTON already democratises professional AI expertise — giving solo practitioners the same tools as Big Four consultants. School Mode extends this mission to education:

**For students:** An AI tutor that actually teaches, doesn't just give answers. Available 24/7, infinitely patient, adapts to your level, makes learning relevant through your interests (sports, gaming, e-sports), and builds genuine competence with evidence.

**For parents:** Visibility into how their child uses AI for schoolwork. Confidence that the AI is helping them learn, not doing their homework. Control over assistance levels.

**For teachers:** A force multiplier — generate assessments, track progress, create custom lessons, share curriculum packages. The teacher's expertise sets the direction; ANTON handles the personalised delivery at scale.

**For schools:** A platform that respects data privacy, runs locally if needed, aligns with national curricula, and produces audit trails that demonstrate responsible AI use in education.

**For society:** If we're going to live in a world where AI is everywhere, we should ensure that young people learn to use it as a tool for genuine learning — not as a shortcut that undermines education. ANTON's School Mode is designed to make AI a force for better education, not a threat to it.

---

## 19. Strategic Alignment with ANTON's Mission

The whitepaper prologue identifies 10 gaps that ANTON addresses. School Mode extends every single one to education:

| Gap | Work Mode | School Mode |
|-----|-----------|-------------|
| **Knowledge** | Domain expertise injection | Subject expertise + pedagogical methodology |
| **Time** | Faster professional output | Efficient study, personalised pacing |
| **Training** | AI trained as professional | AI trained as teacher |
| **Trust** | Audit trails, transparency | Learning evidence, academic integrity |
| **Safety** | Compliance-as-Code | Content filtering, child safety |
| **Governance** | RBAC, review workflows | Teacher/parent oversight, assistance levels |
| **Repeatability** | Consistent quality | Consistent teaching methodology |
| **Shareability** | .anton packages for professionals | .anton packages for curricula and lessons |
| **Flexibility** | Multi-LLM, multi-deployment | Same — schools choose models and deployment |
| **Accessibility** | Open source, free | Open source, free, **in every student's language** — regardless of family income or mother tongue |

The last point is perhaps the most important. The best human tutors cost money that most families cannot afford — and they rarely speak the student's home language. ANTON's School Mode, as open-source software with a three-layer localisation architecture, makes personalised, high-quality AI tutoring available to every student — whether they attend a prestigious international school or a newly arrived family's child in a kommun with limited SFI resources. The architecture is ready from day one; the community fills in the languages. That's the democratisation promise extended to where it matters most.

---

## 20. The Global Education Mission — From Stockholm to the Last Mile

### 20.1 Two Markets, One Architecture

ANTON School Mode serves two fundamentally different markets with the same codebase, the same curriculum architecture, and the same teaching methodology. The only things that change are the deployment model and the AI model powering it.

**Market 1: Mature Education Systems**
Sweden, Norway, Denmark, Finland, UK, Germany, France, and other countries with established education infrastructure, connected schools, and students who already have devices. Here, School Mode is a supplement — it helps students learn more effectively, gives teachers a force multiplier, gives parents visibility, and handles the personalisation that no teacher can do individually for 30 students at once.

In this market, the value proposition is quality. Sonnet and Opus deliver teaching quality that approaches a skilled human tutor. Schools pay for API access or use Haiku for cost efficiency. The curriculum packages are official (Skolverket, Udir, gov.uk). Integration with existing school IT systems matters. GDPR compliance matters. Data stays in Europe.

**Market 2: The Underserved — Where School Mode Becomes a Lifeline**
Rural communities in Sub-Saharan Africa, South Asia, and Southeast Asia. Refugee camps. Home schooling families in restrictive environments. Girls in Afghanistan, Yemen, and parts of Pakistan who are banned from attending school. Children in conflict zones where schools have been destroyed. Remote villages where the nearest qualified teacher is hours away.

In this market, the value proposition is access. The question isn't "how good is the AI compared to a human tutor?" — it's "this or nothing." A Mistral 7B model running on a local server, connected to a few phones over a local network, teaching the Pakistani national curriculum in Urdu to girls who will never set foot in a school — that isn't a compromise. That is transformative.

### 20.2 The Model Tier Strategy for Global Deployment

ANTON's multi-LLM architecture was originally designed for cost flexibility and vendor independence. For School Mode's global mission, it becomes the core enabler of free education at scale.

```
┌─────────────────────────────────────────────────────────────────┐
│  MODEL TIERS FOR SCHOOL MODE                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TIER A: Premium (Mature Markets)                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Claude Opus 4.6 / Sonnet 4.5                           │    │
│  │  • Best teaching quality, nuanced explanations           │    │
│  │  • Extended thinking for complex problem-solving         │    │
│  │  • ~$0.50–5.00 per deep study session                    │    │
│  │  • Target: Schools, families who can afford API costs    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  TIER B: Efficient (Schools with budgets)                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Claude Haiku 4.5 / GPT-4o mini / Mistral Small         │    │
│  │  • Good teaching quality for most subjects               │    │
│  │  • Fast responses, low cost                              │    │
│  │  • ~$0.01–0.10 per session                               │    │
│  │  • Target: Schools managing budgets, developing nations  │    │
│  │    with some connectivity                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  TIER C: Free / Local (NGO & Humanitarian Deployment)           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Mistral 7B / Llama 3.x / Gemma — via Ollama            │    │
│  │  • Runs on modest hardware (a single laptop or server)   │    │
│  │  • Zero ongoing cost after setup                         │    │
│  │  • No internet required after model download             │    │
│  │  • Good enough for Q&A, explanations, basic tutoring     │    │
│  │  • Curriculum-grounded (loaded from .anton bundles)       │    │
│  │  • Target: NGOs, refugee camps, rural schools,           │    │
│  │    banned-from-school populations, home schooling         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  TIER D: Ultra-Light (SMS/WhatsApp/Voice)                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Haiku / Small local model via gateway                   │    │
│  │  • Text-only interface via SMS or WhatsApp               │    │
│  │  • Voice interface for low-literacy learners             │    │
│  │  • No app installation required                          │    │
│  │  • Works on any phone (not just smartphones)             │    │
│  │  • Target: Bottom-of-pyramid, feature phone users        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**The critical insight:** A 7B parameter model running locally is not as capable as Claude Opus. But for a student who has *no teacher at all*, it is vastly better than nothing. And ANTON's seven-layer prompt architecture means even a smaller model gets structured, curriculum-aligned prompts with subject methodology built in. The prompt does most of the heavy lifting — the model just needs to be good enough to follow the instructions and explain clearly. That's exactly what modern open-source models like Mistral 7B and Llama 3 can do well.

### 20.3 The NGO Deployment Model

NGOs don't build software. They build distribution networks, community trust, and local capacity. ANTON provides the technology; NGOs provide the reach.

**What an NGO gets:**
- An open-source platform (Apache 2.0) they can deploy without licensing fees or vendor contracts
- Pre-built curriculum packages for their target country (`.anton` bundles)
- A deployment that runs on a single server or even a laptop with Ollama — no cloud infrastructure needed
- Multi-language support in the languages their communities speak
- A teaching methodology designed to produce understanding, not just output
- Safety frameworks appropriate for children and vulnerable populations
- Complete data privacy — nothing leaves the local deployment

**What an NGO deployment looks like:**

```
NGO Field Office / Community Center / School
┌──────────────────────────────────────────────────┐
│                                                  │
│  [ Low-cost server / laptop ]                    │
│  ├── Ollama + Mistral 7B (or Llama 3)            │
│  ├── ANTON School Mode                           │
│  ├── Curriculum: pakistan-snc.anton               │
│  ├── Curriculum: afghanistan-moe.anton            │
│  ├── Languages: Urdu, Dari, Pashto               │
│  └── Local WiFi network                          │
│                                                  │
│  Students connect via:                           │
│  ├── Smartphones (browser, no app needed)         │
│  ├── Tablets (shared devices, multiple accounts)  │
│  ├── Laptops (where available)                   │
│  └── SMS gateway (for feature phones)            │
│                                                  │
│  Cost after setup: $0                            │
│  Internet required: No (after initial setup)     │
│  Teacher required: No (but beneficial as guide)  │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Hardware requirements for Tier C deployment:**
- Mistral 7B: ~8 GB RAM, any modern CPU (no GPU required, slower but functional)
- Mistral 7B with GPU: ~6 GB VRAM (an older gaming laptop will do)
- Storage: ~20 GB (model + ANTON + curriculum packages)
- Serves: 5-15 concurrent students on a local network
- Total hardware cost: $200-500 for a refurbished laptop capable of running this

That $200-500 serves an entire classroom. Indefinitely. With no ongoing costs.

### 20.4 Use Cases That Matter

**Girls' Education in Afghanistan**
Since the Taliban banned secondary and university education for girls in 2021, millions of Afghan girls have been cut off from formal schooling. Underground schools exist but operate at enormous risk. ANTON on a local device with Dari and Pashto language support, running the Afghan Ministry of Education curriculum (pre-ban), gives these students a private, invisible teacher. No internet connection to monitor. No school building to shut down. No attendance records for authorities to find. The student opens a browser on a shared phone, learns mathematics, closes the browser. Nothing is visible.

**Refugee Education in East Africa**
UNHCR reports that only 38% of refugee children attend secondary school, and many who do attend receive instruction in a language they don't speak well. A Somali refugee in Kenya might attend a school taught in English or Swahili while thinking in Somali. ANTON deployed at a community centre or refugee support point, with the Kenyan CBC curriculum loaded and teaching in Somali, bridges this gap. The curriculum is the host country's (for integration and credential recognition), but the teaching language is the student's own.

**Rural India — NCERT Access for All**
India's NCERT textbooks are already freely available as PDFs — a deliberate government policy. But a textbook alone doesn't teach. ANTON loaded with NCERT content can explain concepts, answer questions, generate practice problems, and adapt to the student's level — in Hindi, Bengali, Urdu, or English depending on the state and the student. For a village where the school has one teacher for 60 students across multiple grades, ANTON doesn't replace the teacher — it gives each student individual attention that one teacher physically cannot provide.

**Home Schooling in Restrictive Environments**
Beyond conflict zones, home schooling families globally — whether by choice or necessity — often struggle with curriculum alignment and subject expertise. A parent who is strong in humanities but weak in mathematics can rely on ANTON for the subjects they can't teach themselves. The country selector ensures the student follows the official national curriculum, so they can re-enter formal education or sit exams when the time comes.

**Post-Disaster Education Continuity**
When earthquakes, floods, or conflicts destroy school infrastructure, education stops. Recovery takes years. ANTON on portable hardware, solar-charged, running offline with local models, can provide educational continuity while physical schools are rebuilt. This is directly relevant in Ukraine, Syria, Turkey (post-earthquake), and anywhere natural disasters disrupt schooling.

### 20.5 Why Mistral's Open-Source Models Are Strategically Critical

ANTON already supports Mistral through the multi-LLM architecture. For the humanitarian deployment, Mistral's open-source models (and Meta's Llama, Google's Gemma) are not just an alternative — they're the foundation.

**Why open-source models enable what commercial APIs cannot:**

First, **zero marginal cost**. Once the model is downloaded and running locally, every question a student asks costs nothing. A commercial API, even at Haiku's pricing of ~$0.01 per session, adds up across thousands of students. For NGOs operating on fixed grants, unpredictable API bills are a non-starter. Local models make the economics simple: fund the hardware once, run forever.

Second, **no internet dependency**. Large parts of Sub-Saharan Africa, South Asia, and conflict zones have intermittent or no internet access. A cloud-based AI tutor that goes offline when the satellite link drops is unreliable. A local model works as long as there's power (and even power can be solar).

Third, **data sovereignty**. NGOs operating in sensitive contexts (refugee data, minors in conflict zones) cannot send student interaction data to US or EU cloud servers. Local models keep everything on the local device. No API calls, no data in transit, no third-party access. This also satisfies the strictest interpretations of GDPR, COPPA, and local child protection laws.

Fourth, **no vendor dependency**. An NGO that builds their programme around Claude or GPT is dependent on Anthropic or OpenAI's pricing, terms of service, and continued existence. Open-source models are permanently available. Even if Mistral the company changes direction, the model weights are already released. The technology can never be taken away.

Fifth, **censorship resistance**. Commercial AI providers, for understandable reasons, implement content filtering that may block legitimate educational content in some cultural contexts (reproductive health education, political history, religious studies). Open-source models can be deployed with filtering appropriate to the local context, under local control.

**The architecture already supports this.** ANTON's Ollama integration means switching from `claude-opus-4-6` to `mistral:7b` is a configuration change, not a rewrite. The same seven-layer prompts, the same curriculum packages, the same teacher personas, the same assessment toolkit — all work regardless of which model processes the request. The module quality is in the prompt architecture, not in any single model.

### 20.6 The Partnership Model

ANTON (FutureChain) builds and maintains the platform. NGOs and development organisations handle deployment, training, and community support. This division of labour plays to each party's strengths.

**Potential partnership categories:**

*Education-focused NGOs:*
UNICEF, Save the Children, Room to Read, Aga Khan Foundation, War Child, BRAC (Bangladesh — already runs the world's largest non-government education programme), Pratham (India — "Read India" campaign). These organisations already have field infrastructure, community relationships, and educational expertise. They need technology that works in their contexts.

*Telecom and technology distributors:*
Safaricom (Kenya — M-Pesa infrastructure already reaches remote areas), Grameenphone (Bangladesh), Roshan (Afghanistan — has operated under Taliban governance). These companies have the device distribution, network coverage, and local technical capacity to deploy and maintain hardware.

*Development agencies and funders:*
Sida (Swedish International Development Cooperation Agency), NORAD, DFID/FCDO, USAID, World Bank Education, Global Partnership for Education. These fund education programmes and are actively looking for scalable technology solutions. An open-source, curriculum-aligned, locally-deployable AI education platform is exactly the kind of tool their education strategies call for.

*Government programmes:*
India's Digital India, Kenya's Digital Literacy Programme, Rwanda's One Laptop Per Child legacy. Government education technology initiatives that already have device distribution channels and need educational software to run on them.

**What ANTON brings to these partnerships:**
- The platform (open source, free, maintained by FutureChain and community)
- Curriculum packages (structured, country-specific, growing via community)
- Multi-language support (30 languages, growing)
- Teacher personas and pedagogical methodology
- The `.anton` package format for easy content distribution
- Technical documentation for deployment
- Training materials for local facilitators

**What partners bring:**
- Local distribution networks (they already reach the communities)
- Cultural knowledge and local adaptation (they know what works in their context)
- Hardware provision and maintenance
- Community trust (students and families trust established NGOs)
- Funding (grant-funded programmes that can cover initial setup costs)
- Curriculum localisation (local educators adapt content for their specific context)
- Impact measurement (NGOs have existing monitoring and evaluation frameworks)

### 20.7 The Flywheel Effect

This isn't charity bolted onto a commercial product. It's a virtuous cycle where both markets strengthen each other:

```
Mature market (Sweden, UK, Germany...)
  │
  ├── Revenue funds platform development
  ├── Teachers contribute high-quality curriculum packages
  ├── Bug reports and feature requests improve the platform
  ├── Professional credibility attracts more users
  │
  ▼
Better platform
  │
  ├── Open source means NGOs get the improvements for free
  ├── More languages, more curricula, more teacher personas
  ├── Testing at scale in diverse contexts reveals edge cases
  │
  ▼
Humanitarian deployment (NGOs, rural, restricted access)
  │
  ├── Community contributors from developing nations add new languages
  ├── Curriculum packages for new countries benefit everyone
  ├── Real-world testing in low-resource environments makes the
  │   platform more robust and efficient
  ├── Impact stories strengthen the brand and attract funding
  ├── User base grows by millions, not thousands
  │
  ▼
Stronger platform, larger community, more content
  │
  ├── Feeds back into mature market quality
  ├── Attracts enterprise/government contracts
  ├── Platform becomes the global standard for AI-assisted education
  └── FutureChain's reputation grows → more partnerships → more reach
```

A German teacher contributes a physics curriculum package. A Kenyan teacher adapts it to the CBC framework. A refugee education NGO uses the Kenyan version with Somali language teaching. A student in a Dadaab refugee camp learns physics that is curriculum-aligned with the country they hope to build a life in. The German teacher's contribution reached a student they will never meet, through a chain they never imagined.

That's the network effect of open source applied to education. Every contribution multiplies.

### 20.8 What This Means for the Specification

One principle overrides everything else here: **ANTON stays ANTON.** The platform is under 1 GB and runs on ~500 MB to 1 GB of RAM. It's the *model* that's heavy (Mistral 7B is ~4-5 GB, Opus runs in the cloud) — not the platform. There is zero reason to strip down, simplify, or create a "lite version" of ANTON for humanitarian deployment. Every student, whether they're in a Stockholm gymnasium or a community centre in Dadaab, gets the full platform: all teacher personas, all assessment types, the full Course Journey, My Radar, the complete Student Growth Model, every feature in this specification. The platform is already lightweight enough. We build upon it, we don't shrink it.

The *only* thing that changes between a premium deployment and an NGO deployment is which model is running and how the prompts talk to it.

**The Prompt Tier Toggle**

This is implemented as an automatic toggle based on the selected model, with manual override available:

```
Model Selection                     Prompt Tier (auto-detected)
┌────────────────────────┐         ┌──────────────────────────┐
│ Claude Opus 4.6        │ ──────► │ TIER 1: Full Prompts     │
│ Claude Sonnet 4.5/4.6  │ ──────► │ TIER 1: Full Prompts     │
│ GPT-4o / GPT-4 Turbo   │ ──────► │ TIER 1: Full Prompts     │
│ Mistral Large           │ ──────► │ TIER 1: Full Prompts     │
│ Claude Haiku 4.5        │ ──────► │ TIER 1: Full Prompts     │
│ GPT-4o mini             │ ──────► │ TIER 1: Full Prompts     │
│ Mistral Small           │ ──────► │ TIER 1: Full Prompts     │
├────────────────────────┤         ├──────────────────────────┤
│ Mistral 7B (Ollama)    │ ──────► │ TIER 2: Adapted Prompts  │
│ Llama 3 8B (Ollama)    │ ──────► │ TIER 2: Adapted Prompts  │
│ Gemma 7B (Ollama)      │ ──────► │ TIER 2: Adapted Prompts  │
│ Phi-3 (Ollama)         │ ──────► │ TIER 2: Adapted Prompts  │
│ Any model <20B params  │ ──────► │ TIER 2: Adapted Prompts  │
└────────────────────────┘         └──────────────────────────┘

Manual override: Settings → Advanced → Prompt Tier [Auto / Tier 1 / Tier 2]
```

**What changes between tiers:**

| Prompt Layer | Tier 1 (Full) | Tier 2 (Adapted) |
|-------------|---------------|-------------------|
| Layer 1: Ground Work | Full ANTON identity + all behavioural instructions | Condensed identity + core behavioural instructions (fewer tokens) |
| Layer 2: Module prompt | Full methodology with nuanced instructions | Same methodology, more direct and explicit instructions |
| Layer 3: Output format | Complex structured output (tables, matrices, multi-section) | Simpler output structure (clear sections, plain formatting) |
| Layer 4: Persona | Full persona background, teaching style, personality | Core persona traits + teaching approach (shorter) |
| Layer 5: Skills | Full skill injection | Same — skills are already concise |
| Layer 6: Knowledge sources | Full curriculum context | Same — curriculum doesn't change |
| Layer 7: User message | Full guided input assembly | Same — user input doesn't change |

**What does NOT change between tiers:**
- The platform UI — identical
- The features available — identical (all assessment types, Course Journey, Läxhjälp, everything)
- The curriculum content — identical
- The teacher personas — same names, same subjects, same approach
- The assessment methodology — identical
- The safety framework — identical
- The student's experience — as close to identical as possible

**The difference in practice:**

Tier 1 prompt for a maths explanation (excerpt from Layer 2):
```markdown
You are teaching mathematics to a Year 8 student. Apply the Socratic method:
begin with what the student already knows, build bridges to the new concept,
use concrete examples before abstract notation, check understanding at each
step by asking the student to explain back in their own words. If the student
shows misconception patterns (e.g., confusing correlation with causation in
statistics, or applying integer rules to fractions), address the root
misconception rather than just correcting the surface error. Adjust your
language complexity to Bloom's Level 3 (Application) for this student based
on their demonstrated progress. Use the Swedish curriculum's centralt
innehåll for Year 7-9 as your scope boundary...
```

Tier 2 prompt for the same situation (adapted):
```markdown
You are a maths teacher for a Year 8 student. 
Rules:
1. Start from what the student knows. Ask what they remember.
2. Use concrete examples first, then show the formula.
3. After explaining, ask the student to explain it back to you.
4. If they get something wrong, find out WHY they think that.
5. Stay within the Swedish Year 7-9 maths curriculum.
6. Speak clearly and simply.
```

Both produce teaching. Tier 1 gives the large model room to apply nuanced pedagogy. Tier 2 gives the smaller model clear, followable rules. The student gets taught either way. The quality ceiling is different, but the quality *floor* — the minimum acceptable teaching — is maintained in both tiers because the structured rules in Tier 2 compensate for the model's smaller reasoning capacity.

**Implementation:**

```typescript
// In prompt-builder.ts
const promptTier = getPromptTier(selectedModel);

function getPromptTier(model: string): 'full' | 'adapted' {
  // Auto-detect based on model
  const smallModels = ['mistral:7b', 'llama3:8b', 'gemma:7b', 'phi3'];
  if (smallModels.some(m => model.toLowerCase().includes(m))) {
    return 'adapted';
  }
  return 'full';
  // Can be overridden by user setting
}

// Each prompt layer has both versions
function getModulePrompt(moduleId: string, tier: 'full' | 'adapted'): string {
  const basePath = `server/areas/${areaId}/prompts/`;
  if (tier === 'adapted') {
    // Try adapted version first, fall back to full
    return loadPrompt(`${basePath}${moduleId}.adapted.md`) 
        ?? loadPrompt(`${basePath}${moduleId}.md`);
  }
  return loadPrompt(`${basePath}${moduleId}.md`);
}
```

Each module prompt can optionally have a `.adapted.md` version alongside its standard `.md`. If no adapted version exists, the full version is used (it will still work, just less optimally on small models). Over time, community contributors create adapted prompt versions for the modules they use most — just like translations, this is incremental.

**Offline-First as Standard Practice**

ANTON should already work offline once loaded — no CDN dependencies, no external font loading, no analytics calls. This is good practice for any deployment, not just humanitarian ones. Service worker for caching. All fonts bundled. The only thing that requires network access is calling a cloud-hosted LLM API — and when using local Ollama models, even that is local.

**Facilitator Dashboard**

For NGO deployments, a simple dashboard view for the local community volunteer managing the deployment:

```
┌──────────────────────────────────────────────────────────┐
│  Facilitator Dashboard                    [Community Hub]│
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Active Students: 12 / 15 registered                     │
│                                                          │
│  Currently Working:                                      │
│  • Amina K.      Mathematics — Fractions (30 min)        │
│  • Hassan M.     Science — States of Matter (15 min)     │
│  • Fatima A.     English — Reading Comprehension (45 min)│
│  • ... 9 more                                            │
│                                                          │
│  Today's Activity: 47 sessions, 12 assessments completed │
│                                                          │
│  ⚠️ Flags: None                                          │
│                                                          │
│  [Add Student]  [View Progress]  [System Status]         │
│                                                          │
│  System: Ollama running ✅  Model: Mistral 7B ✅          │
│  Storage: 34 GB free ✅    RAM: 6.2/8 GB                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

No educational expertise required to use. The facilitator helps students log in, monitors that the system is running, and escalates any safety flags. The teaching is handled by ANTON.

---

*End of specification.*
