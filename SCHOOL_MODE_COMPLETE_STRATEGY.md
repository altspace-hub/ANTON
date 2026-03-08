# ANTON School Mode — Complete Strategic & Implementation Thinking Document
## All Perspectives · Must-Haves · Open Questions · World Agents

**Version:** 1.0
**Date:** March 2026
**Status:** Strategic Planning Document — Foundation for School Mode v2 Spec
**Scope:** Everything that must be considered, built, and decided before ANTON School Mode goes to scale

---

> *The goal of ANTON School Mode is not to make students faster at completing homework. It is to make learning more visible, more supported, and more equitable — for students, teachers, parents, and the communities they belong to. The AI conforms to the learning process. Not the other way around.*

---

## Part 1: The Strategic Case (Why This Matters)

### The Core Insight

Every AI education tool launched between 2023 and 2026 made the same mistake: it positioned itself as a student productivity tool. That made it a cheating enabler in the eyes of every teacher, parent, and school administrator who mattered for adoption.

ANTON School Mode is built on the opposite premise. **The teacher sees more, not less.** The Learning Evidence Log gives teachers unprecedented visibility into how a student thinks — not just what they submitted. The `.anton` assignment format is structured specifically so the teacher's pedagogical intent is preserved and traceable throughout. Guardian accounts mean parents are informed participants, not passive observers.

This is not a minor positioning difference. It is the difference between a tool that gets banned from schools and one that gets endorsed by curriculum authorities.

### The Long-Term Strategic Argument

Students who use ANTON at school will carry those habits into their professional lives. The generation entering the workforce in 2035 will have grown up with AI as a learning tool. If ANTON is the tool they grew up with — the one that taught them how to think alongside AI rather than outsource thinking to it — they become ANTON's professional users by default.

This is the school-to-work pipeline. It is a moat that takes ten years to build and is essentially impossible to buy.

---

## Part 2: The Ten Perspectives — What Each Stakeholder Needs

### Perspective 1: The Student (Primary Learner)

**What they actually need (not what they say they want):**

Students do not primarily want AI to do their homework for them. They want to not feel lost, embarrassed, or left behind. They want to feel capable. The risk with any AI education tool is that it shortcircuits the productive struggle that is essential to genuine learning.

**Must-haves from the student perspective:**

- **Socratic mode is the default** — ANTON never gives the answer first. It asks the student a question. It guides. It prompts. It reflects back. The answer emerges from the student's thinking, not the AI's.
- **Scaffolded help levels** — "I need a small hint" vs. "I'm really stuck and need more" — student controls how much help they get, but each step is logged. The teacher sees which students needed more scaffolding and can intervene.
- **Age-appropriate language at all times** — AMLR language is never appropriate in a Year 6 classroom. The language model must adapt not just to the topic but to the specific age and reading level of the student. This is a hard technical requirement.
- **Voice interaction for young learners** — The T1 interaction model (storytelling, conversational, voice-first) is essential for students who cannot type fluently. A 7-year-old learning to read should not be writing prompts.
- **Emotional safety** — ANTON must never shame a student for a wrong answer. It must never express frustration. It must model the patience and encouragement of the best teachers.
- **"My progress" view** — A simple, visual representation of what the student has learned, what they've asked for help with, and how they've improved. Not a grade. A journey.
- **Privacy from peers** — Student learning data is never visible to other students. Only teacher and guardian can see it.

**Open questions — student perspective:**
- At what age is voice interaction mandatory vs. optional?
- How do we handle students with learning disabilities (dyslexia, ADHD) — does the interaction model adapt automatically or require teacher configuration?
- What happens when a student is clearly distressed (repeated failure, signs of frustration)? Should ANTON flag this for teacher attention?
- How much autonomy does a student have to opt out of AI assistance for a given task?

---

### Perspective 2: The Teacher (The Critical Adoption Gate)

**What teachers actually fear:**

Teachers do not primarily fear that AI will replace them. They fear that AI will make them accountable for something they can't see or verify. The spectre of a student submitting AI-generated work and the teacher being unable to distinguish it from the student's own thinking is a professional and institutional liability.

ANTON's answer to this fear is the single most important feature in School Mode: **the teacher always knows more about what happened, not less.**

**Must-haves from the teacher perspective:**

- **Assignment builder with pedagogical intent capture** — Before assigning anything, the teacher specifies: what skill is being practiced, what cognitive level (Bloom's taxonomy), what subject area, what the expected level of AI assistance is (none / hints only / guided / full collaboration). This intent is locked into the `.anton` assignment bundle.
- **Learning Evidence Log (LEL)** — For every student submission, the teacher sees: when they started, how many times they asked for help, what kinds of questions they asked, where they got stuck, what the AI said to them, how long they spent, and how the final submission compares to the draft work. This is not surveillance. It is pedagogy.
- **Class-level view** — Across a whole class, the teacher sees: which students are struggling with which concepts (not just which students got the right answer), which parts of the assignment generated the most requests for help (indicating the task was too hard or poorly explained), and which students may need individual follow-up.
- **Curriculum mapping** — Every assignment maps explicitly to the national curriculum standard being assessed. The teacher shouldn't have to manually tag this — ANTON should suggest the curriculum mapping based on the assignment content.
- **AI assistance level enforcement** — The teacher can lock the assistance level for a specific assignment. A test condition means ANTON provides zero hints. A learning activity means full Socratic guidance is available. A creative project means open collaboration. The student cannot override this.
- **Feedback generator** — After reviewing the LEL, the teacher can ask ANTON to draft personalised feedback for each student based on their learning evidence. The teacher edits and approves — not AI-to-student direct.
- **Parent communication tool** — One-click generation of parent summary reports (what was assigned, how the student engaged, what the teacher recommends next) in plain language.

**Open questions — teacher perspective:**
- How do teachers get trained on ANTON? A tool this capable is also complex. What is the onboarding pathway? Who delivers it?
- What is the liability framework? If ANTON gives a student incorrect information, who is responsible?
- How do part-time or substitute teachers access the LEL for students they haven't taught before?
- How does ANTON handle team assignments where multiple students collaborate?
- Should teachers be able to see AI interactions in real-time (live monitoring) or only retrospectively?

---

### Perspective 3: The School Administrator

**What administrators are responsible for:**

Administrators carry institutional liability. They are responsible for data protection compliance, safeguarding, equitable access, and the school's relationship with parents and community. They can be the biggest adoption enablers or the biggest blockers.

**Must-haves from the administrator perspective:**

- **GDPR-compliant by default** — Student data is the most sensitive category under GDPR (children under 16 require parental consent for data processing). ANTON must have a complete GDPR compliance package specifically for schools — data processing agreements, consent forms, data retention policies, right to erasure implementation.
- **No student data leaves the school/EU** — For EU schools this is a hard requirement. Ideally, on-premise deployment using Mistral Local means zero data leaves the building. For schools without the infrastructure for on-premise, EU-hosted cloud with documented data residency.
- **Content safety at the infrastructure level** — ANTON must never generate content that is age-inappropriate. This is not just a prompt instruction — it needs to be enforced at the system level. Content filtering, guardrails, and monitoring.
- **Safeguarding integration** — If ANTON detects potential indicators of child welfare concerns (e.g. a student's writing expresses distress, mentions of abuse, self-harm), there must be a clear escalation pathway. This is a legal requirement in most EU countries (mandatory reporting obligations).
- **Equitable access** — The school cannot deploy a tool that only some students can use. The UI must be accessible (WCAG 2.1 AA minimum), available in the national language, and functional on low-spec devices (Chromebooks, tablets, older laptops).
- **Audit trail for parents** — If a parent requests to see all AI interactions their child had, the school must be able to produce this. ANTON's data model must support right-of-access requests.
- **Integration with existing school systems** — Schools cannot manage another login system. ANTON needs SSO integration with: Google Workspace for Education, Microsoft 365 Education, and national school identity systems (e.g. Swedish eSkolID, Finnish Suomi.fi).

**Open questions — administrator perspective:**
- Who owns the data — the school, the municipality, the national authority, or FutureChain AB? This must be crystal clear in the data processing agreement.
- What happens when ANTON goes down during an exam or assessment period? What is the SLA and the contingency?
- How are software updates managed? Schools cannot handle unscheduled changes to tools students are actively using.
- Can a school exclude specific modules or capabilities from student access (e.g. disable the coding area for primary school)?

---

### Perspective 4: The Parent / Guardian

**What parents actually want:**

Parents want to know their child is learning, not just completing tasks. They are the most powerful advocates for a tool that shows them their child is growing — and the most vocal opponents of one that feels like it is replacing parental involvement.

**Must-haves from the parent perspective:**

- **Guardian account with appropriate visibility** — Parents should see: what assignments are active, how their child is engaging (time spent, help requested), teacher feedback, and progress over time. They should NOT see the full AI conversation transcript by default — that level of scrutiny could discourage students from asking for help. The school administrator configures what parents see.
- **Consent management** — Clear, plain-language consent for data processing. Opt-out capability that doesn't disadvantage the student (if a parent opts out, the student gets a non-AI version of the same assignment, not exclusion from the activity).
- **Language accessibility** — Parent communications in their home language. ANTON's i18n architecture must extend to guardian interfaces. In a Swedish school with parents who speak Arabic, Somali, or Polish as their first language, English-only communications are a barrier.
- **"What is ANTON?" explainer** — Integrated, plain-language explanation of what ANTON does, how it works, what data it uses, and how it protects their child's privacy. Not a legal document — a friendly, honest explanation. Video format preferred.
- **Homework context** — When a parent asks "what are you working on?", the guardian app can show them the assignment brief and the learning objective in plain language — not the full transcript, but enough to have a real conversation with their child about their work.

**Open questions — parent perspective:**
- At what age does the student's right to privacy from their parents begin to supersede the guardian's right to visibility? (A 16-year-old has different privacy expectations than a 7-year-old.)
- How do we handle split-custody families or families where different guardians have conflicting instructions?
- What is the notification model — push notifications for assignment completion? Weekly digest? Parent chooses?

---

### Perspective 5: The School System / National Curriculum Authority

**What national authorities need to endorse and scale:**

A national curriculum authority (Skolverket, Opetushallitus, etc.) cannot endorse a tool that has not been validated against their curriculum framework. But if they do endorse it, they can deploy it to thousands of schools simultaneously.

**Must-haves from the national authority perspective:**

- **Formal curriculum alignment documentation** — For each major subject area and each year group, ANTON's assignment templates and module outputs must be mapped to the specific curriculum standards of that country. This is a significant documentation effort but it is the price of national endorsement.
- **Pedagogical framework alignment** — National authorities have positions on pedagogical approaches (inquiry-based learning, constructivism, competency-based assessment). ANTON must be able to demonstrate alignment with the dominant framework in each market.
- **Teacher professional development integration** — Any nationally-endorsed tool needs a formal PD (professional development) pathway. ANTON needs a certified teacher training programme — not just documentation, but something a teacher can complete that counts toward their CPD hours.
- **Evidence base** — National authorities will want to see learning outcome data before endorsing. The pilot programme design (below) must be structured to generate publishable evidence.
- **National language as first-class citizen** — Not a translation afterthought. Swedish UI, Swedish curriculum mapping, Swedish example content, Swedish pedagogical terminology. Same for Finnish, Danish, Norwegian. The i18n architecture from the School Mode spec is a prerequisite — but execution requires native curriculum experts for each language.
- **Independence from commercial interests** — National authorities cannot endorse a commercial product that changes its pricing or terms of service. The Apache 2.0 open-source licence and the FutureChain commitment to the free model are essential to this conversation.

**Open questions — national authority perspective:**
- Who certifies the ANTON teacher training programme? FutureChain cannot self-certify — it needs academic or governmental backing.
- How is the curriculum mapping maintained when the national curriculum changes (Skolverket updates curriculum regularly)?
- What is the governance model for the School Mode? A public-sector advisory board? A national curriculum working group?
- How do we handle conflict between national curriculum standards? (What Swedish Skolverket mandates may differ from Finnish Opetushallitus — the platform must handle both without compromise.)

---

### Perspective 6: The Student's Peer Group and Social Context

**Why this matters:**

Learning is social. A tool that works in isolation but disrupts the social dynamics of a classroom will fail. Students who use ANTON in ways that create visible inequality (one student gets dramatically better results because they use ANTON more skilfully) will generate resentment, peer exclusion, and tool abandonment.

**Must-haves from the social context perspective:**

- **Equaliser, not differentiator** — ANTON must be accessible to ALL students in a class simultaneously and equally. If only some students have accounts, those with accounts have an unfair advantage. Deployment must be all-or-nothing at the class level.
- **No "AI power user" visibility** — Students should not be able to tell from each other's outputs whether someone used more or less AI assistance. The Learning Evidence Log is for the teacher, not for peer comparison.
- **Collaborative learning support** — Group assignments where students work together, each interacting with ANTON in their own context, then combining their thinking. ANTON should support collaborative workflows, not just individual ones.
- **Cultural sensitivity in content** — ANTON's example content, personas, and illustrations must reflect the diversity of the student population. A Nordic school classroom in 2026 is not homogeneous. Students from different cultural backgrounds should see themselves reflected in the tool.
- **Language diversity** — Many Nordic classrooms include students for whom the national language is a second language. ANTON should be able to operate in both the student's home language and the school language simultaneously — supporting language learning as a meta-skill.

---

### Perspective 7: The Teaching Profession (Systemic)

**The profession-level concern:**

Teaching unions across Europe have been vocal about AI tools that appear to deskill or replace teachers. ANTON's teacher-workflow design is the correct response — but it needs to be communicated and demonstrated at the union/professional body level, not just at the individual school level.

**Must-haves from the professional perspective:**

- **Teacher as expert, AI as tool** — Every design decision in School Mode must reinforce the teacher's professional authority. ANTON never tells students what the teacher said was wrong. ANTON never overrides the teacher's assignment structure. ANTON is explicitly described as "your teacher's AI assistant" not "your personal AI tutor."
- **No teacher performance data visible to management** — The class-level LEL data is for the teacher's professional use. School management (principals, HR) must not have access to data that could be used to evaluate or discipline teachers based on their AI usage patterns.
- **Union consultation in pilot design** — Before any national-scale rollout, engage with the relevant teaching union. In Sweden, Lärarförbundet and Lärarnas Riksförbund. In Finland, OAJ. Frame the pilot as a professional development collaboration, not a product trial.
- **CPD credit for ANTON training** — Work with professional development authorities to have ANTON teacher training count toward official CPD requirements. This makes it worth a teacher's time.

---

### Perspective 8: The Special Educational Needs (SEN) Perspective

**Why this requires specific design attention:**

An estimated 15-20% of students have some form of learning difference — dyslexia, ADHD, autism spectrum conditions, processing differences, physical disabilities. A tool that works brilliantly for neurotypical students but excludes students with SEN is both ethically unacceptable and legally non-compliant in most EU jurisdictions (EU Web Accessibility Directive, national disability rights legislation).

**Must-haves from the SEN perspective:**

- **Screen reader compatibility** — Full WCAG 2.1 AA compliance. Every interactive element labelled, keyboard navigation throughout, no functionality that requires mouse use.
- **Dyslexia-friendly typography option** — OpenDyslexic font option, adjustable line spacing, colour overlays, high contrast mode.
- **ADHD-friendly interaction design** — Short interactions, frequent check-ins, clear task chunking, minimal distractions in the interface, progress indicators for every step.
- **Speech-to-text as a first-class input method** — Students who cannot type fluently (whether due to age, motor difficulties, or dyslexia) must be able to interact fully with ANTON via voice. This is not an accessibility feature — it is core functionality.
- **Simplified language mode** — For students with cognitive disabilities or language processing difficulties, ANTON's responses must be available in simplified language (shorter sentences, simpler vocabulary, concrete examples rather than abstract concepts).
- **Individual Education Plan (IEP) integration** — In countries with formal IEP systems, the teacher should be able to configure ANTON's interaction model for a specific student based on their IEP requirements. This requires a per-student configuration layer that overrides defaults.
- **No time pressure** — ANTON should never indicate speed or urgency. No countdown timers in learning interactions. No "you're taking a long time" signals.

---

### Perspective 9: The World Agents Perspective (AI Ethics, Policy, Future)

**The macro questions ANTON must answer:**

As AI in education scales globally, ANTON will face policy, ethical, and regulatory scrutiny that goes beyond any individual school or country. Getting these right from the start — rather than retrofitting after criticism — is essential to the project's credibility and longevity.

**The EU AI Act and Education**

Under the EU AI Act (full enforcement August 2026), AI systems used in education that influence learning outcomes are classified as **high-risk AI systems**. This means:

- Mandatory risk management system documentation
- Technical documentation of the system's design and operation
- Logging and audit trail requirements
- Human oversight mechanism
- Accuracy, robustness, and cybersecurity standards
- Transparency to students and parents that AI is being used

ANTON's existing audit trail, transparency levels, and governance framework address most of these. But formal EU AI Act compliance documentation for School Mode must be produced before any national-scale deployment.

**The "Does AI Harm Learning?" Question**

This is the question that will be asked at every school board meeting, every national authority consultation, and every media interview. The honest answer is: it depends entirely on how it is used.

ANTON's Socratic-first design (never give the answer, always ask a question) is the correct technical response. But the evidence base must be built. The pilot programme design must include:
- Pre/post assessment of learning outcomes
- Comparison group (same curriculum, no ANTON)
- Qualitative research with students and teachers
- Peer-reviewed publication pathway

Without published evidence, ANTON's claim that it improves learning is an assertion. With published evidence, it becomes an argument that policymakers can act on.

**Algorithmic Bias in Education**

If ANTON's AI models perform differently for students from different backgrounds — different languages, different socioeconomic contexts, different cultural references — it will systematically disadvantage already-disadvantaged students. This is not hypothetical. It is a documented problem with large language models.

Must-haves:
- Bias testing across student population segments before any deployment
- Ongoing monitoring of output quality across demographic groups
- Diverse evaluation team (not just technical — include educators from the communities being served)
- Transparent methodology: publish how ANTON tests for and addresses bias

**The Long-Term Data Question**

Learning data accumulated over a student's entire school career is among the most sensitive personal data in existence. Decisions made about how to store, use, and eventually delete this data will have consequences that last decades.

- Student data must be deletable in full on request (GDPR right to erasure)
- Data must not be used for any purpose beyond supporting that student's learning
- No retention of student data after the student leaves the school system
- No future commercialisation of aggregated student learning data, ever
- This commitment must be in the open-source licence and the FutureChain corporate commitments — not just a policy document that can be changed

**The Global Equity Question (UNESCO Perspective)**

If ANTON School Mode succeeds in wealthy Nordic schools but is inaccessible to students in low-income countries, it exacerbates the global education gap rather than closing it. The humanitarian deployment model (Ollama on a single laptop, zero marginal cost) exists precisely to prevent this. But it needs active pursuit:

- A specific deployment configuration tested and documented for low-bandwidth, low-device environments
- Curriculum packs built for non-Nordic, non-Western educational contexts
- Language support extending beyond European languages (Swahili, Arabic, Hindi as near-term priorities)
- A formal partnership with at least one UNESCO education programme or equivalent

---

### Perspective 10: The Platform / Technology Perspective

**The technical must-haves that everything else depends on:**

- **Age-appropriate model configuration** — Different model behaviours for different age groups. The prompt architecture for a 7-year-old must be fundamentally different from a 17-year-old. This is a separate configuration layer, not just a tone adjustment.
- **Content safety at inference level** — Safety filtering must be enforced at the model invocation layer, not just the prompt. Use Anthropic's / Mistral's content safety APIs plus ANTON's own filtering layer.
- **Local model as first-class for schools** — Ollama + Mistral 7B (or smaller) must be a fully supported, fully featured deployment path. Not a degraded experience — the same curriculum packs, the same LEL, the same teacher workflow — just running locally.
- **Offline capability** — In many schools, internet connectivity is unreliable. Core learning interactions should be possible offline, with sync when connectivity is restored.
- **Multi-tenancy** — A school, a municipality, and a national authority are three different administrative levels. ANTON's multi-tenancy model must support: school-level data isolation, municipality-level administration, national-level curriculum pack distribution. The database schema and RBAC system must be extended for this hierarchy.
- **Student identity management** — Students cannot manage API keys. The school administrator provisions student accounts, and students authenticate through school SSO. No student should ever see an API key or be responsible for AI cost management.
- **Cost management for schools** — Schools operate on fixed budgets. The per-session cost model is fine for enterprises but not for schools. Options: bulk API key from school budget, Ollama local (zero marginal cost), or a FutureChain managed endpoint with per-school monthly cost cap.
- **Version consistency** — If a teacher builds an assignment today, it must work identically in six months. ANTON cannot silently change module behaviour in ways that break existing assignments. School Mode requires a versioned, stable prompt layer.
- **Testing before deployment** — A dedicated staging environment for schools. A teacher should be able to preview exactly what a student will experience before assigning anything.

---

## Part 3: The Pilot Programme Design

### Pilot Structure

**Phase 1 — Foundational (2026 H2)**
- 3-5 schools in Sweden (Skolverket relationship)
- 2 schools in Finland (via Finnish contacts)
- Year groups: 7-9 (secondary, where AI adoption debate is loudest)
- Subjects: Swedish/Finnish language, Social Studies, Mathematics
- Duration: One semester (approximately 16 weeks)
- Participant roles: 5-10 teachers, 100-200 students, guardian consent programme

**Measurement Framework**
- Pre/post curriculum assessment (teacher-designed, not AI-administered)
- Teacher experience survey (time spent, confidence with tool, observed student engagement)
- Student experience survey (age-appropriate, co-designed with teachers)
- LEL data analysis: which students sought help most, which assignment structures generated most learning evidence
- Qualitative interviews: 10 teachers, 20 students, 10 parents post-pilot

**Evidence Publication Pathway**
- Interim report at 8 weeks (internal, for Skolverket)
- Final report at semester end (publishable)
- Academic paper submission: Computers & Education or similar peer-reviewed journal
- Conference presentation: Nordic educational technology conference (e.g. NordForum)

### The UNESCO Pathway

After Nordic pilot evidence is published:
1. Present to UNESCO-IBE as evidence of AI-supported learning in EU context
2. Propose humanitarian pilot: one school in a low-resource context (e.g. via UNESCO field office partnership)
3. Document the Ollama/local model deployment as the humanitarian configuration
4. Use this to engage UNICEF, Save the Children education programmes

---

## Part 4: Must-Build List — School Mode v2

The following are not optional enhancements — they are required for credible school deployment:

### Non-Negotiable Features
- [ ] Guardian account system with configurable visibility levels
- [ ] Full GDPR compliance package: DPA template, consent forms, retention policy, erasure mechanism
- [ ] EU AI Act high-risk system documentation (technical documentation, risk management system record)
- [ ] Content safety enforcement at inference level (not just prompt)
- [ ] Age group configuration layer (separate behaviour profiles for: 6-9, 10-13, 14-17, 18+)
- [ ] Learning Evidence Log with teacher-facing analytics dashboard
- [ ] Socratic mode as the enforced default (configurable per assignment to allow more direct assistance)
- [ ] Voice input as first-class interaction method (not accessibility afterthought)
- [ ] SSO integration: Google Workspace for Education + Microsoft 365 Education
- [ ] Per-student configuration for SEN/IEP requirements (teacher-administered)
- [ ] WCAG 2.1 AA accessibility compliance
- [ ] Student account system (school-provisioned, no student API key management)
- [ ] Offline mode for core learning interactions
- [ ] Version-locked assignments (teacher's assignment doesn't silently change after publishing)
- [ ] Skolverket curriculum mapping for core subjects (Swedish Year 1-12)
- [ ] Anonymised data export for research/evidence purposes (no student PII)

### Strongly Recommended for v2
- [ ] Bloom's taxonomy integration in assignment builder
- [ ] Class-level learning analytics (aggregate, not individual-level)
- [ ] Parent communication generator (teacher-approved, AI-drafted)
- [ ] Multi-language UI (Swedish, Finnish, Danish, Norwegian as minimum)
- [ ] Dyslexia-friendly typography and colour mode
- [ ] Teacher CPD module and certification pathway
- [ ] `.anton` curriculum bundle exchange format (teacher shares assignment templates with colleagues)
- [ ] School administrator dashboard (user management, data governance, usage reporting)
- [ ] Municipal/authority level administration tier
- [ ] Bias monitoring report (quarterly, per deployment)

---

## Part 5: The Narrative — How to Talk About This

### What ANTON School Mode Is

*"ANTON School Mode gives teachers something no other AI tool has given them: a complete picture of how every student learned, not just what they submitted. The teacher designs the assignment, sets the learning objectives, and decides how much AI help is appropriate. ANTON guides the student through the learning process — asking questions, not giving answers — and records everything in a Learning Evidence Log that only the teacher and guardian can see. Students learn more. Teachers know more. And the AI never undermines the teacher's professional authority."*

### What It Is Not

*"ANTON School Mode is not a homework machine. It will not write a student's essay for them. It is not a tutoring service that replaces human teachers. It is not a surveillance tool. And it will never share student learning data with advertisers, researchers, or third parties."*

### The Counter-Narrative to "AI Enables Cheating"

*"Every AI tool launched before ANTON made teachers less informed about student learning. ANTON makes teachers more informed. For the first time, a teacher can see exactly where a student got stuck, what questions they asked, and how their thinking developed — not just the final answer. If anything, AI-assisted learning with ANTON makes it harder for students to pretend they understand something they don't."*

---

*This document is a foundation for the School Mode v2 specification. It is intentionally comprehensive — some items will be phased across v2.1, v2.2, and later releases. The non-negotiable list above defines what must be true before any external pilot launch.*
