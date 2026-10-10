# FCP blueprint: Training and presentations

Blueprint `training-and-presentations` v1.1 (stable) from the FCP blueprint library, as ANTON skill `fcp-bp-training-and-presentations`. Produces trainings and talks on financial crime prevention (AML/CTF, sanctions, ABC, fraud, model risk, governance, FATCA/CRS and the EU AML package): the slide deck with speaker notes, cases and exercises with facilitator keys, knowledge checks, and the record that documents completed training as AML regulation requires. Use it for board and management training, role-based training for operational staff, specialist deep dives, modular onboarding of new colleagues, external conference or seminar talks and interactive workshops. Do not use it for proposals or credentials presentations.

## Scoring boundary (ANTON rule — read first)

This skill may change the wording, the evidence asked for and the report layout. It never changes how a score is computed.

1. A score, rating, level, band or count that ANTON computes or that the user supplies (for example from the Risk Atlas: inherent risk, control strength, residual risk, appetite position) is used exactly as given. Do not recompute, re-band, average, cap or override it, and do not state a different figure anywhere in the text.
2. Where the module's own instructions or the selected output format define a scoring method or scale, that method stands. The blueprint's scales then serve only as wording: name the module's scale in the methodology section and, if useful, show how its labels read in the blueprint's terms. Never mix two rating scales in one deliverable.
3. The blueprint's sections on scales, matrices and aggregation, and the shared risk language, describe how the team's method presents and explains ratings. Use them to structure and word the deliverable. Where no engine, module rule or client methodology supplies the ratings, every rating you propose is an expert judgement that states its basis; mark it `[TO CONFIRM: …]` until the user confirms it.

## Gap markers

Never invent client facts, figures, names, findings, quotes or regulatory references. Mark every gap in the deliverable:
- `[DATA NEEDED: …]` — missing information
- `[TO CONFIRM: …]` — uncertain information
- `[ASSUMPTION: …]` — an assumption you made
- `[VERIFY REFERENCE]` — a regulatory reference you are not sure of (describe the requirement; never invent an article or paragraph number)

Close the deliverable with the list of open items (every marker above) and the blueprint's quality checklist, naming any item not met.

## Layout

When no output format is selected, follow the deliverable structure in section 6 and the template below. When an output format is selected, that format sets the layout and its own scale; keep this blueprint's method, evidence and wording rules within it.

## How references in this skill map to ANTON

The blueprint text points at files of the library it came from. In ANTON:
- `_core/house-standards.md`, `_core/glossary.md`, `_core/request-context.md`, `_core/output-formats.md` → the skill **FCP blueprint: house standards** (`fcp-bp-house-standards`). Attach it with this one for the full house rules; the essentials are in "Gap markers" above.
- `_core/risk-scales.md` → "Risk and control labels" and "Scale mapping" in the house standards skill (`fcp-bp-house-standards`), as wording only. Its matrix and aggregation rules belong to the risk-assessment blueprints and never override a score ANTON or the module supplies.
- `template.md` → the section "Deliverable template" below.
- The other `references/…` catalogues (`case-and-exercise-bank.md`, `design-brief-and-agendas.md`, `facilitation-and-speaker-notes.md`, `module-abc.md`, `module-aml-ctf-foundations.md`, `module-fraud.md`, `module-governance-and-roles.md`, `module-kyc-cdd-pep.md`, `module-model-risk-management.md`, `module-monitoring-and-reporting.md`, `module-other-topics.md`, `module-regulatory-outlook.md`, `module-risk-assessment-and-crc.md`, `module-sanctions.md`, `quiz-bank.md`, `training-records-and-evaluation.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Method and quality bar (blueprint sections 1–14)

Load together with `_core/house-standards.md`, `_core/request-context.md` and `_core/output-formats.md` (section 2, Presentation). This blueprint only repeats a core rule where training needs a sharper version of it.

Reference files:

| File | Use it for |
|---|---|
| `references/design-brief-and-agendas.md` | The one-page design brief and agenda blueprints for each variant, including the onboarding programme |
| `references/facilitation-and-speaker-notes.md` | Speaker-note format, presenter hand-overs, interaction techniques, timing |
| `references/case-and-exercise-bank.md` | Cases and exercises with facilitator keys |
| `references/quiz-bank.md` | Knowledge-check items with answers, rationale and reference |
| `references/training-records-and-evaluation.md` | Documentation of completed training: plan, register, results, evaluation, summary note |
| `references/module-*.md` | Module library, one file per topic: learning objectives, slide sequence, key messages, tailoring hooks, anchors |

### 1. Purpose and outcome

A training or talk exists to change what people do, decide or understand. Each variant has its own outcome:

- **Board and management** set and follow up risk appetite, challenge the reporting from the special appointed executive (SAE, *särskilt utsedd befattningshavare*), the AML/CTF compliance officer (*centralt funktionsansvarig*, CFA) and the MLRO, and understand their own responsibility.
- **Operational staff** recognise red flags in their own products, escalate through the right route, document so that a third party can follow, and never tip off a customer.
- **Specialists** (AML function, investigators, model owners, compliance, internal audit) apply and challenge a method: weighting, scoring, investigation, screening, validation.
- **New colleagues in our own team** learn what the team does in practice, module by module.
- **External audiences** leave with one clear message and a few lessons they can act on.
- **Workshop participants** learn and produce something together, such as input to a sanctions risk assessment.

For the client, training is also a **control**. The supervisor expects it to be risk-based, adapted to roles and to the business-wide risk assessment (BWRA, *allmän riskbedömning*), ongoing and documented. The deliverable therefore includes the evidence: who was trained, on what version, when and with what result.

The main deliverable is a 16:9 slide deck with speaker notes on every content slide. The supporting artefacts are described in section 8.

### 2. When to use / when not to use

**Use** for annual or role-based training (AML/CTF, sanctions, ABC, fraud, model risk, governance) for a client's staff, management or board; targeted training after a finding, a new product or a regulatory change; training for specific roles (SAE, CFA, MLRO, model owners, investigators); onboarding modules for our own team; talks at conferences, specialist days and seminar series; and workshops that combine teaching with structured discussion of the client's own situation.

**Do not use** for:

- Credentials, sales or proposal presentations: use `firm-and-team-presentation` or `proposal`.
- Steering committee or status presentations: use `project-plans-and-governance`.
- A training policy or instruction (the governing document itself): use `governing-documents`.
- The risk assessment that a workshop feeds: use `aml-ctf-risk-assessment`, `sanctions-risk-assessment`, `abc-risk-assessment` or `fraud-risk-assessment`. Use this blueprint only for the workshop deck.
- Presenting review or validation findings to a board: use `gap-analysis`, `compliance-review-report` or `model-validation-report`. Use this blueprint only for the teaching slides that precede the findings.

### 3. Inputs

**Minimum to start:** the request-context minimum, plus the variant (audience), topic or topics, duration and format, and the client's main products and customer segments.

| Input | Why it is needed | Usually comes from | If missing |
|---|---|---|---|
| Audience and variant | Sets depth, tone, examples and duration | Request, kick-off call | Ask. Do not guess between board and operational staff. |
| Topic(s) and learning need | Selects modules from the library | Request, client's training plan | Ask what participants must do differently afterwards. |
| Duration, format, number of participants | Sets slide count, exercises and interaction | Client | Assume 60 minutes on site and mark `[ASSUMPTION]`. |
| Institution type, products, channels, customers, geographies | Makes examples and typologies relevant | Request context, client website, BWRA | Use sector-typical examples and mark `[TO CONFIRM]`. |
| Client's BWRA results (top risks, inherent risk, control effectiveness, residual risk) | Training must address the risks the client has identified | Client's BWRA report or workbook | Teach generic typologies for the sector. Add `[DATA NEEDED: BWRA summary]` on the "our risks" slides. |
| Internal rules and terminology (policy, instructions, risk classes, escalation route, roles) | Participants must hear their own process, not a generic one | Client's governing documents | Describe the generic process. Mark the client-specific steps `[TO CONFIRM]`. |
| Known issues (supervisory or audit findings, incidents) | Targets the training at real weaknesses | Client contact, CFA report | Leave out. Never infer weaknesses. |
| Previous training and completion statistics | Avoids repetition and shows progress | CFA, HR or learning system | Note as `[DATA NEEDED]` in the record pack. |
| Anonymised real material (alerts, closing texts, cases) | Makes exercises realistic | Client, anonymised by the client | Use the case bank. Never use another client's cases. |
| Documentation needs (attendance, test, pass mark, certificate, learning system) | Shapes the record pack and the knowledge check | Client compliance or HR | Provide the standard record pack and ask. |
| Presenters and split of slides | Speaker notes and hand-overs | `issuing_firm.team` | Write notes for one presenter. |
| Client template or branding | Some clients require their own template | Client | Use the visual profile in the request. |

### 4. Regulatory and professional anchors

There are two layers. Layer A is the obligation to train and to document training, covered here. Layer B is the regulation that the training teaches; each module file lists its own anchors. Every regulatory statement on a slide must be checked against the version in force on `{{date}}`, and the deck carries "Regulatory status as of {{date}}" in the footer of the regulatory slides or the appendix.

**EU baseline**

- Directive (EU) 2015/849 (AMLD4), Article 46(1): obliged entities take measures, proportionate to their risks, nature and size, so that employees are aware of the AML/CTF provisions, including participation in special ongoing training programmes.
- Regulation (EU) 2024/1624 (AMLR), applying from 10 July 2027: awareness and training of employees, and integrity checks of employees, as part of internal policies, procedures and controls `[VERIFY REFERENCE: AMLR Articles 12 and 13]`. Directive (EU) 2024/1640 (AMLD6) and Regulation (EU) 2024/1620 (AMLA) complete the package. Remind the audience that level 2 texts (RTS, ITS, guidelines) are still being published and that the position must be re-checked.
- EBA/GL/2022/05 (AML/CFT compliance officer and compliance management): the compliance officer's tasks include training and awareness, and the management body's responsibilities are set out `[VERIFY REFERENCE: paragraph numbers]`.
- EBA/GL/2021/02 (ML/TF risk factors): training as part of policies and procedures that follow from the risk assessment `[VERIFY REFERENCE]`.
- The two EBA guidelines on restrictive measures (EBA/GL/2024/14 and EBA/GL/2024/15) `[VERIFY REFERENCE: confirm which number applies to which]`: regular and role-specific training on restrictive measures and internal procedures.
- Joint ESMA and EBA suitability guidelines, EBA/GL/2021/06: induction and training of members of the management body, whose collective knowledge must cover ML/TF risk `[VERIFY REFERENCE]`.
- Standards: FATF Recommendation 18 (internal controls, including an ongoing employee training programme); ISO 37001 (awareness and training in an anti-bribery management system) for ABC.

**National layer through `{{jurisdiction}}`**

For each jurisdiction, identify the training provision in the national AML act, the supervisor's regulations and guidance, the national risk assessment, and any national rules on whistleblowing and employee screening.

**Sweden (worked example)**

- Penningtvättslagen (2017:630): the obligation to give employees and others taking part in the business ongoing relevant information and training `[VERIFY REFERENCE: chapter 6, section 3]`; the BWRA shall form the basis of the entity's routines, guidelines and other measures (chapter 2), which is why training must follow the BWRA.
- FFFS 2017:11 (Finansinspektionen): training, and the CFA's tasks including informing and training staff `[VERIFY REFERENCE: chapter and section]`.
- FFFS 2014:1 (governance, risk management and control) for board and management training in credit institutions and investment firms.
- Supervisory expectation in the team's material: training shall be business-adapted, linked to the risks identified in the BWRA, and staff expertise shall match their responsibilities and the complexity of the business `[VERIFY REFERENCE: source of the expectation]`.
- Finanspolisen (the FIU), the national coordination function's (*Samordningsfunktionen mot penningtvätt och finansiering av terrorism*) national risk assessment, and Länsstyrelsen for non-financial obliged entities.

### 5. Method

**Step 1. Clarify the purpose and the driver.** Annual mandatory training, onboarding, the board's yearly update, a supervisory or audit finding, a new regulation or product, or an external event. The driver decides the angle: remediation training addresses the finding explicitly; annual training shows what is new since last year. *Client interaction:* a 30-minute kick-off with the client contact (usually the CFA or head of AML) using the design brief.

**Step 2. Analyse the audience and set objectives.** Establish roles, prior knowledge and what participants must do differently. Write three to five learning objectives as observable behaviour ("escalate an unexplained third-party repayment through the internal reporting route", not "understand TM"). For talks and events, write the **key message**: what participants should think and feel when they leave. Choose the depth level (section 7.1).

**Step 3. Link the content to the client's risks.** Select from the client's BWRA the three to five risks or typologies most relevant to this audience. Training is one of the measures that must follow from the BWRA; showing the link is both a requirement and what makes the session relevant. Use the client's products, risk classes, escalation route and document names. *Client interaction:* a short data request (section 8).

**Step 4. Select modules and design the structure.** Pick modules from the library (`references/module-*.md`) and arrange them in the team's three-part structure:

- **Part I – Fundamentals** (*Del I – Grunder*): what the risk is, the legal requirement, how the measure works.
- **Part II – Role and client in focus** (*Del II*): the board's role, the SAE and CFA toolbox, the operational process, or the client's own risk picture. Exercises sit here.
- **Part III – Outlook** (*Del III – Framtidsspaning*): what is changing, what it means for the client, what to do now.

Within each topic, follow the sequence: definition and legal basis, plain-language "translation", how it works in practice, "What usually works / Common pitfalls" (*Vad brukar fungera? / Vanliga fallgropar?*), example or case, key takeaway. Budget time with section 7.2 and place an interaction at least every 10–15 minutes.

**Step 5. Build the slides.** Follow `_core/output-formats.md` section 2 and the writing rules in section 9. Re-show the agenda as a navigator at each section change. Use progressive build-up for definitions that have several parts, such as who counts as a family member of a PEP: one element per click, with the diagram growing.

**Step 6. Write the speaker notes.** Every content slide gets notes (format in `references/facilitation-and-speaker-notes.md`): presenter, time, what to say, the example, the question to ask, and the transition. With two or more presenters, the notes mark who speaks and the hand-over.

**Step 7. Build exercises, cases and the knowledge check.** Take cases from `references/case-and-exercise-bank.md` and adapt them to the client's products, or build new ones on the same pattern: situation, questions, facilitator key. Draw quiz items from `references/quiz-bank.md` with at least two items per learning objective. Myth-busting true/false statements work well between sections.

**Step 8. Review.** A second specialist reviews the content (four-eyes), especially regulatory statements, thresholds and dates, the anonymisation of every example and the consistency of repeated figures. Rehearse aloud once for sessions over 60 minutes or with several presenters. *Client interaction:* the client contact fact-checks the client-specific slides. A fact check is not a negotiation: weaknesses that are part of the purpose stay in.

**Step 9. Deliver.** Keep to time, run exercises as planned ("discuss in groups for 4–5 minutes, then we take it in plenary") and keep a question log. Questions not answered in the room are answered afterwards by email, or at the next team meeting for internal training.

**Step 10. Document and follow up.** Complete the training record pack: attendance, results, evaluation, answered questions and a summary note with observations and a recommendation for the next training, written so the CFA can attach it to the report to the board. For workshops, send the output memo.

### 6. Deliverable structure

The deck follows the order below. Sections marked *(variant)* are included or replaced according to section 13. `template.md` gives the slide-by-slide skeleton.

| # | Section | Purpose | Must contain | Typical length | Wording style |
|---|---|---|---|---|---|
| 0 | Cover | Identify the session | Title, subtitle, `{{client_name}}` or event, `{{date}}`, version | 1 slide | Title names the topic; subtitle names the angle, e.g. "Learn, Assess & Improve – together" |
| 1 | Agenda and presenters | Orientation | Numbered blocks (01–05) with minutes per block; presenters with role and contact | 1 slide | Block names as nouns; times visible |
| 2 | Purpose and starting points | Why we are here | Purpose in one sentence; 3–5 learning objectives or "starting points for today" phrased as questions; for a series, the learning journey with this module highlighted | 1–2 slides | Questions the session answers |
| 3 | Why it matters | Motivation | Current sourced figures, consequences (supervisory decisions in `{{jurisdiction}}`), or a short scenario; the purpose behind the rules (stopping crime, not only passing inspection) | 1–3 slides | Numbers with source and year |
| 4 | Part I – Fundamentals | Shared base | Per topic: definition and legal basis, plain-language translation, how it works, "What usually works / Common pitfalls" | 30–50% of time | Requirement, then what it means in practice |
| 5 | Part II – Role and client in focus *(variant)* | Application | Board's role, or SAE/CFA toolbox, or operational process and red flags, or the client's own BWRA results | 30–40% of time | "In our business this means…" |
| 6 | Exercises and cases | Practice | Instructions slide (task, groups, time, roles), case slides, debrief slide with key points | 20–35% of time in interactive formats | Short situations, open questions |
| 7 | Knowledge check | Check and consolidate | 1–3 items per section or 5–10 at the end; answer slide with rationale | 5–10 minutes | Statements and questions, no trick questions |
| 8 | Part III – Outlook | Forward-looking | What is changing (AMLR/AMLA, guidelines, national changes), what it means, what to do now | 2–5 slides | Dated, with uncertainty marked |
| 9 | Summary | Retention | 3–5 key takeaways ("Remember to…", *Tänk på att…*), where to find internal rules, whom to contact | 1 slide | Imperatives |
| 10 | Questions and contacts | Close | Questions slide; contact slide for presenters | 1–2 slides | — |
| A | Appendix | Reference | Abbreviations and definitions, sources and further reading, bonus slides (maturity grids, detailed tables), facilitator keys if not handed out separately | As needed | Reference style |

Rules on the structure:

- **Firm presentation.** In client training, the firm appears only on the agenda slide (presenters) and the contact slide. In external talks, one firm or speaker slide is allowed at the start. No service offering slides in client training (house standards, section 7).
- **Recurring agenda.** Show the agenda again at each part, with the current block highlighted.
- **Client in focus.** When the client's BWRA is available, Part II includes a slide per risk area (customers, products and services, distribution channels, geography) in the client's own scale, with the columns *Inherent Risk | Control Value | Residual Risk*, followed by the red flags participants will meet in their work.

### 7. Scales, scoring and calculations

#### 7.1 Depth levels

| Level | Audience | Participants should be able to | Typical content |
|---|---|---|---|
| A – Awareness | All staff, new joiners outside AML | Recognise ML/TF, sanctions, bribery and fraud risk in their role; know where to escalate; never tip off | Definitions, red flags, internal route, confidentiality |
| B – Applied | Customer-facing and first-line staff working with KYC, payments, credit or alerts | Perform the procedures, assess and document a case so that a third party can follow it | Process steps, red flags per product, good and weak documentation, cases |
| C – Specialist | AML function, investigators, model owners, compliance, internal audit, our own team | Apply, design and challenge methods | Weighting and scoring, investigation method, screening logic, validation, regulatory detail |
| D – Governance | Board, CEO, management | Own risk appetite, allocate resources, challenge reporting, understand liability | Consequences, roles, risk appetite, KRIs, culture, outlook |

A session may combine levels, but each slide is written for one level.

#### 7.2 Time budget

- **Module rule (onboarding and knowledge sessions):** at most 60 minutes per module, including questions. A typical split is 30 minutes learning, 20 minutes exercises and 10 minutes questions; modules on narrower topics run 30–50 minutes.
- **Learn-and-assess format (workshops):** two blocks of about 45 minutes, theory then interactive discussion, with a break between.
- **Seminar or series session:** about 2 hours in 4 blocks with discussion pauses.
- **Board session:** 60–90 minutes, with at least 15 minutes for discussion.
- **Breaks:** a 10-minute break at least every 60 minutes; give the break a discussion prompt where useful (*bensträckare* with a question).
- **Slide count:** about 1.5–2 minutes per content slide. Number of content slides ≈ learning minutes ÷ 1.75. An exercise takes 10–20 minutes including debrief; a quiz item 1 minute.

#### 7.3 Knowledge check

- At least two items per learning objective; 5–10 items for a 60-minute session; 15–25 for an e-learning or attestation test.
- One point per item; no negative marking.
- Pass mark: agreed with the client and stated in the record pack. Where the client has none, propose 80% and mark `[TO CONFIRM]`. One retake after reviewing the answer key.
- Every item has a rationale and, where relevant, a reference, so that a wrong answer teaches.

#### 7.4 Evaluation and completion

- Participant evaluation on a 1–5 scale (1 = not at all, 5 = fully) for relevance to my role, clarity, usefulness of exercises and pace, plus two open questions: "What will you do differently?" and "What was missing?"
- Completion KRI for the client's reporting: share of the target group trained within the period, number overdue, and average test score. This is the KRI the board sees ("number who have completed the training on measures against ML/TF").

#### 7.5 Scales inside the content

When the training teaches a method (BWRA, customer risk classification, control assessment, model validation), use the **client's own scale** if it exists. If not, use the team's standard scales in the module files, for example the four-level control effectiveness scale *Strong / Adequate / Weak / Non-existing* (*Stark / Tillfredsställande / Svag / Obefintlig*) and the risk levels *Low / Normal / High / Very high* (*Låg / Normal / Hög / Mycket hög*), as defined in `_core/risk-scales.md`. Never mix two scales in one deck, and say explicitly when a scale is illustrative.

### 8. Supporting artefacts

| Artefact | Content | Detail in |
|---|---|---|
| Design brief (1–2 pages) | Driver, audience, objectives, key message, BWRA link, modules, agenda, interaction, knowledge check, documentation, logistics | `design-brief-and-agendas.md` |
| Data request for training | BWRA summary; CRC model description; policy and instructions; organisation chart with AML roles; last training material and completion figures; anonymised alerts, closing texts or cases; supervisory and audit findings; participant numbers by role; documentation requirements | This section |
| Case and exercise pack | Participant version (situations and questions) and facilitator key (expected points, model answer, debrief) | `case-and-exercise-bank.md` |
| Knowledge check | Items, answer key and rationale; export table for a learning system (Q-ID, module, level, question, type, options, correct answer, rationale, reference) | `quiz-bank.md` |
| Training record pack | Training plan and target-group matrix, attendance register, results, evaluation summary, Q&A log, summary note to the client | `training-records-and-evaluation.md` |
| Participant handout | One page: key takeaways, red flags for their role, escalation route, where to find internal rules, contacts | `design-brief-and-agendas.md` |
| Programme overview (modular series) | One slide or table per module: content, duration, suitable trainer (role), date; learning journey | `design-brief-and-agendas.md` |
| Workshop output memo | Discussion points per question, agreed positions, open issues, actions with owner, input to the related deliverable | `design-brief-and-agendas.md` |

### 9. Writing rules specific to this deliverable

1. **Slide titles.** A content slide that makes a point states it ("The quality of TM can never exceed the quality of KYC"). Definition and reference slides may use a topic title with a question as subtitle ("PEP – who counts?").
2. **Legal text.** Quote the law only when the wording matters (definitions, PEP categories), keep it short, and follow with a plain-language translation (*Översättning*) of what it means in `{{jurisdiction}}`, for example which positions count as a PEP nationally.
3. **Requirement, then practice.** Every requirement slide is followed by what it means for the participant's work. Pair it with "What usually works / Common pitfalls".
4. **Mottos that stick.** Close topics with one memorable line drawn from practice, such as "High threshold for exiting customers, low threshold for reporting to the FIU", "AML is obligations; sanctions are prohibitions", "Know your customer, know your risk".
5. **Examples.** Invent them or take them from the client with its permission and anonymised. Use roles ("Customer A", "Company B"), round figures and plausible facts. Never use names, real cases of another client or identifiable details.
6. **Good and weak side by side.** For documentation skills (closing texts, SAR narratives, risk descriptions), show a weak and a strong version, and what makes the difference.
7. **Numbers.** Every figure has a source and year on the slide. Figures used twice must be identical. Use current national figures (FIU annual report, national risk assessment) and mark `[DATA NEEDED: current figure, source, year]` if not supplied.
8. **Supervisory cases.** Use recent public decisions from `{{supervisor}}` to show consequences: the deficiency, not only the amount. Mark `[DATA NEEDED]` for the current list; never present a client's own non-public matter.
9. **Tone.** Purpose before fear. Consequences motivate, but the message is why the measures exist: to make it hard for criminals to use the financial system. Respectful of the first line; never mock weak examples from the audience's own organisation.
10. **Language.** Slides and notes in `{{language}}`. Use the jurisdiction's legal terms with the English abbreviation once in parentheses where the client uses it (e.g. *kundkännedom* (KYC)). Notes are written in the language the presenter will speak.
11. **Interaction cues** are written on the slide ("Discuss in pairs – 3 min") and in the notes, with the expected answers in the notes.
12. **Outlook is dated and hedged.** "As of `{{date}}`, the draft RTS…". Never present a draft as final.

### 10. Quality checklist

In addition to the universal checklist in `_core/house-standards.md`, section 6:

- [ ] The design brief is agreed: audience, objectives, key message, duration, documentation.
- [ ] Every learning objective is covered by content, an exercise or discussion, and at least two knowledge-check items.
- [ ] The deck shows the link to the client's BWRA or, if not available, the gap is marked.
- [ ] Examples use the client's products, terms, risk classes and escalation route.
- [ ] The timing adds up: block times on the agenda match the slide count and exercises.
- [ ] Every content slide has speaker notes; hand-overs between presenters are marked.
- [ ] Every case has a facilitator key; every quiz item has an answer and rationale.
- [ ] Regulatory statements, thresholds and dates are checked against `{{date}}`; uncertain ones are marked; the outlook distinguishes adopted from draft texts.
- [ ] Figures have source and year and are consistent across slides.
- [ ] No names of people, clients or companies in examples, file names, notes or hidden slides; client material is anonymised.
- [ ] No sales content in client training.
- [ ] The record pack is ready: attendance register, knowledge check and evaluation, with the material version recorded.

### 11. What makes it stand out

- **Risk-based, not generic.** Built from the client's own BWRA: their products, risk classes, residual risks and red flags. A generic course covers the law; ours shows where the risk sits in the participant's own business.
- **The logic chain is visible.** BWRA, customer risk classification, KYC, monitoring and reporting are shown as one chain (the supervisor's "AML wheel"): the BWRA decides where to look, the risk class how hard, KYC sets expected behaviour, monitoring finds deviations. Each role sees where its step fits.
- **Practice from real work.** Cases come from real alert types, closing texts, SAR narratives and supervisory decisions, anonymised; documentation is taught with good and weak examples side by side.
- **Typologies, not labels.** Risk is taught as how the crime would happen in this product ("placement through third-party repayments of consumer credit"), linked to the control that should catch it.
- **Role-specific depth.** Boards get responsibility, liability, risk appetite and KRIs; SAE and CFA get tools (annual plan, control checklists, reporting content); first-line staff get red flags and what to do; specialists get method.
- **Interactive by design.** A fixed time split between learning, exercises and questions, group cases with roles, myth-busting quizzes, discussion prompts in breaks, live polls, and "How do others do it?" benchmarks.
- **Forward-looking and dated.** Every training ends with what is changing (AMLR/AMLA, guidelines) and what to do now.
- **Documented as a control.** The client receives the evidence a supervisor asks for: version, attendance, results, evaluation and a summary note that links the training to the BWRA and the CFA's annual plan.
- **Modular and reusable.** Modules of up to an hour can be combined into programmes, a board session or an e-learning without rewriting.

### 12. Common pitfalls

- A generic deck reused across clients: wrong products, wrong risk classes, wrong escalation route.
- Too much law on the slides and no "what this means for you".
- More slides than time; exercises cut on the day. Count minutes, not slides.
- Exercises without a facilitator key, so the debrief depends on who presents.
- Quiz items that test trivia (names of convicted companies, exact fine amounts) instead of decisions participants must make.
- Outdated regulatory status (for example an AML package described as "proposed" after adoption) or draft standards presented as final.
- Figures that differ between slides of the same deck, or figures without source.
- Speaker notes that only contain a presenter's initials, or that are a copy of the slide.
- Real names, client names or identifiable details left in notes, examples or hidden slides.
- A board session that becomes an operational KYC course; a staff session that lectures on governance.
- No attendance or results recorded, so the client cannot show the training took place.
- Sales slides at the end of a client's mandatory training.

### 13. Variants

#### 13.1 By audience

| Variant | Duration | Structure and emphasis | Interaction | Documentation |
|---|---|---|---|---|
| **Board and management** | 60–90 min | Part I compressed to the logic chain and consequences; Part II: the board's responsibility and liability, tasks at strategic, tactical and operational level, compliance culture, risk appetite, what good SAE/CFA reporting contains, KRIs; Part III outlook | Questions the board should ask; one short case on a risk-appetite decision | Attendance in board minutes; slides attached to minutes |
| **Operational staff** | 45–60 min, or e-learning | Part I basics at level A/B; Part II: the client's risks and red flags per product, the internal route, documentation quality (closing texts), tipping-off; frequent cases | Product-specific cases, true/false quiz | Register and test result per participant |
| **Specialists** | Half day, or a 60–90 min deep dive | One method in depth: weighting, scoring, investigation, screening, model validation; regulatory detail; client's own data where possible | Hands-on exercises on realistic data, peer review of outputs | Register; optional test |
| **Internal onboarding (own team)** | Modules of 30–60 min | Module programme with learning journey (`design-brief-and-agendas.md`); each module stands alone and is booked when trainers and participants are free; mandatory for new associates, optional for others | Cases from real engagements, anonymised; questions answered by email or at the next team meeting if time runs out | Programme overview with dates and trainers; attendance |
| **External conference or seminar** | 20–45 min talk; 2 h series session | Starting questions, numbers or a short scenario, one clear message, anonymised examples ("one institution…"), numbered key lessons and a recap, "What now?"; for series, a recap of developments since the last session and "Coming up next" | Rhetorical questions, show of hands, live poll, panel | Speaker slide, contact slide; no client data |
| **Workshop** | 90 min to half day | "Learn, assess & improve": theory block (about 45 min), then a structured interactive block on the client's own situation; workshop steps shown on the agenda | Poll-based discussion, break prompts on the client's own exposure, short risk-assessment exercise if time allows | Output memo with agreed points and actions |

#### 13.2 By client type

| Client type | Emphasis | Typical tailoring |
|---|---|---|
| Bank | Full chain; correspondent banking, trade, cash, private banking where relevant; sanctions payment screening | Product-specific red flags, high-risk segments, network investigations |
| Payment or e-money institution | Merchant and agent risk, fast and cross-border flows, fraud proceeds, models (TM, CRC, screening) | Speed-of-business trade-offs, merchant onboarding, model risk |
| Consumer credit or credit market company | Deposit and credit typologies: third-party and early repayments, credit fraud as predicate offence, straw men, savings accounts used as transaction accounts | Closing texts on repayments, who counts as customer (e.g. suppliers in leasing) |
| Fund manager or investment firm | Who the customer is (nominee and distributors), subscription and redemption patterns, limited TF exposure | Distributor oversight, sector risk factors from EBA guidelines |
| Insurance | Life products, premium payments by third parties, surrender patterns | Product-specific red flags |
| Crypto-asset service provider | Travel rule, blockchain analytics, sanctions exposure | Wallet screening, typologies |
| Non-financial obliged entity | Basic obligations, reporting, supervision by the county administrative board in Sweden | Level A/B content, sector typologies |

#### 13.3 By size and maturity

- **Small or low maturity:** one combined session for all staff plus a board session; fundamentals and "what do I do when…"; a **train-the-trainer** package so the CFA can deliver the annual training with the deck and notes.
- **Large:** a role-based curriculum (target-group matrix), e-learning for level A, classroom for levels B–D, records in the client's learning system.
- **High maturity:** from "what" to "how well": effectiveness, data quality, model performance, AMLR capability; more workshop than lecture.
- **Format:** digital sessions use blocks of at most 45 minutes, a poll about every 10 minutes and breakout rooms for cases; e-learning uses level A content, narration scripted from the notes and a randomised question bank.

### 14. How the assistant should work

**Ask first** (at most five questions, in one message):

1. Who is the audience (board, management, operational staff, specialists, own team, external) and how many?
2. Which topics, how long, and in what format (on site, digital, e-learning, workshop)?
3. Can you share the client's BWRA summary and internal rules, or should I use sector-typical risks?
4. What must be documented (attendance, test and pass mark, certificate, learning system)?
5. Who presents, and in which language?

If the user says to proceed, use the defaults in section 3 and mark every assumption.

**Order of production:**

1. Design brief (one page), for confirmation when the request is large or ambiguous.
2. Agenda with block times, then the slide list with message titles.
3. Slide content, Part I to Part III.
4. Speaker notes for every content slide.
5. Cases and exercises with facilitator keys; knowledge check with answers.
6. Training record pack and participant handout.
7. A short list of open items: `[DATA NEEDED]`, `[TO CONFIRM]`, references to verify.

For a text-only answer, give the slide list in Markdown with a notes block under each slide, as in `template.md`.

**Stop and ask** when:

- The training is to present the client's own risk picture or process and no BWRA or internal rules are available.
- The client wants real cases used and they are not yet anonymised.
- A regulatory statement central to the session cannot be verified (e.g. a threshold or date under AMLR level 2 texts).
- The training is meant as evidence for a supervisory remediation: confirm the scope and documentation with the client.
- The audience and depth level conflict (e.g. a board session requested with operational detail).

---

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: training deck with speaker notes

[Skeleton of the main deliverable in final order. Format 16:9 (`_core/output-formats.md`, section 2). Output language is `{{language}}`; Swedish terms are given in parentheses where the team's material is Swedish. Each slide has a **Notes** block: write it in the language the presenter will speak. Sections marked *(variant)* are swapped according to SKILL.md section 13. Remove all guidance in brackets before delivery.]

[Naming: `{{client_short}}_{{topic}}_training_{{date}}_v{{version}}.pptx`. Never put another client's name in a file name, a hidden slide or a note.]

---

#### Slide 0 – Cover

**{{topic}}** – e.g. "Measures against money laundering and terrorist financing" (*Åtgärder mot penningtvätt och finansiering av terrorism*)
Subtitle: [the angle, e.g. "Training for the board", "Learn, Assess & Improve – together", "Module 4 of the onboarding programme"]
`{{client_name}}` or [event name] · `{{date}}` · version `{{version}}`

> **Notes:** [None needed. For external events: venue, time slot, moderator's name for the introduction.]

---

#### Slide 1 – Agenda and presenters

| # | Block | Minutes |
|---|---|---|
| 01 | [e.g. Fundamentals] | [xx] |
| 02 | [e.g. Our risks and our process] | [xx] |
| 03 | [e.g. Cases and discussion] | [xx] |
| 04 | [e.g. Outlook] | [xx] |
| 05 | Questions | [xx] |

Presenters: [name, role, email, phone from `issuing_firm.team`]

[Workshop format: two headed blocks, e.g. "THEORETICAL FRAMEWORK – 45 min" and "INTERACTIVE DISCUSSION – 45 min", each with numbered items 01–07.]

> **Notes:** [Presenter: …] [Time: 2 min] Welcome; introduce presenters; practicalities (breaks, questions any time or at the end, polls). Say how the session ends: "You will leave with three things you can do differently on Monday."

---

#### Slide 2 – Purpose and starting points

**Purpose:** [one sentence, e.g. "To give the board the knowledge it needs to steer and follow up {{client_short}}'s work against money laundering and terrorist financing."]

Starting points for today *(Utgångspunkter för dagens föredrag)* – or learning objectives:
1. [Question or observable objective]
2. [ … ]
3. [ … ]

[Modular series: add the learning journey – all modules in sequence with this module highlighted, e.g. Intro to FCP › BWRA › KYC & CRC › TM & SAR › Risk appetite, steering & reporting › Models & validation › Other AML rules › ABC › Sanctions › Fraud › FATCA/CRS.]

[For a 60-minute module, show the split: "30 min learning · 20 min exercises · 10 min questions".]

> **Notes:** [Time: 2 min] Read the objectives aloud and connect them to the participants' work. Ask: "Which of these do you meet most often?"

---

#### Slide 3 – Why it matters

[Choose one or two:]
- **Numbers:** [2–3 current figures with source and year, e.g. suspicious transaction reports to the FIU per year from the FIU's annual report] `[DATA NEEDED: current figures, source, year]`
- **Consequences:** recent decisions by `{{supervisor}}` – what was deficient, not only the amount `[DATA NEEDED: 3–5 public decisions from the last 3 years]`
- **Short scenario:** two time-stamped events that show how quickly crime moves [invented, no names]
- **Purpose:** what the measures are for – making it hard for criminals to use the financial system (prevent, discover, report, enforce)

> **Notes:** [Time: 3 min] Tell the story behind one figure. Bridge: "So what do the rules actually ask of us? Let's start with the basics."

---

#### Section divider 01 – Part I: Fundamentals (*Del I – Grunder*)

[Large number and section name. Re-show the agenda with block 01 highlighted.]

---

#### Slides 4–n – Fundamentals, one topic at a time

[Take the slide sequence from the relevant `references/module-*.md` file. Repeat the four-slide pattern below for each topic.]

##### Slide 4a – [Message title, e.g. "Money laundering hides where money comes from; terrorist financing hides where it goes"]
[Definition or legal basis. Quote the law only if wording matters, max 3–4 lines, with reference: e.g. "Chapter 3, Section 19 of the Money Laundering Act".]

##### Slide 4b – In plain language (*Översättning*)
[What the requirement means in `{{jurisdiction}}` and for this audience, e.g. which positions count as PEP nationally.]

##### Slide 4c – How it works in practice
[Process steps, numbered tiles 01–04, or the logic chain: BWRA → customer risk classification → KYC → monitoring → reporting.]

##### Slide 4d – What usually works / Common pitfalls (*Vad brukar fungera? / Vanliga fallgropar?*)

| What usually works | Common pitfalls |
|---|---|
| [e.g. Risk classification of the customer at onboarding] | [e.g. Updating the risk class over time] |
| [ … ] | [ … ] |

> **Notes (each slide):** [Presenter] [Time: 1.5–2 min] Say: [the point in 2–4 spoken sentences]. Example: [one concrete, invented example from the client's products]. Ask: [one question to the audience, with the expected answer]. Transition: [one sentence to the next slide].

##### Quiz between topics (optional)
**True or false?** [Statement, e.g. "There are specific amount limits for what counts as a bribe."]
[Answer slide: **False.** One-sentence rationale and reference.]

> **Notes:** [Time: 1 min] Show of hands or poll. Reveal, then explain why the myth exists.

---

#### Section divider 02 – Part II *(variant)*

[Choose the Part II block for the audience. Re-show the agenda with block 02 highlighted.]

##### Option A – Client in focus: "{{client_short}}'s risk assessment"

One slide per risk area: Customers · Products and services · Distribution channels · Geography

**[Risk area, e.g. Products]**

| [Product / risk factor] | Inherent Risk | Control Value | Residual Risk |
|---|---|---|---|
| [e.g. Savings account] | [client's scale] | [client's scale] | [client's scale] |
| [ … ] | | | |

Risk indicators / red flags you may meet: [3–6, from the BWRA typologies]

`[DATA NEEDED: BWRA results per risk area, in the client's own scale]`

> **Notes:** Explain why the highest residual risk is where it is, and which control participants themselves operate. Ask: "Where in your daily work would you see this?"

##### Option B – The board's role (*Styrelsens roll*)
- Responsibility and mandate: overall responsibility, supervisory practice, liability of board members and CEO for serious, repeated or systematic breaches `[VERIFY REFERENCE: national provision]`; board members are also bound by confidentiality.
- Tasks: strategic (formulate risk appetite, follow up exposure), tactical (adapt organisation and capability to exposure), operational (order in the customer meeting, act on internal instructions).
- Compliance culture: from "Don't want to" → "OK then" → "How can I help?"
- Risk appetite: definition of ML/TF risk → risk appetite per identified risk → implementation and follow-up.
- Reporting: what the SAE and CFA should report, and KRIs (see module file).
- Questions the board should ask.

##### Option C – The SAE and CFA toolbox
- When each role is required; placement; reporting line; how they relate (SAE implements, CFA monitors and controls).
- SAE: BWRA, internal rules, implementation and follow-up, reporting content.
- CFA: risk analysis and risk-based annual plan, controls, advice, training, reporting, follow-up; example annual plan; five controls; ten things to check in a KYC file; "Remember to…" for control reports.

##### Option D – Operational practice
- The process step by step in `{{client_short}}`'s own terms; red flags per product; the internal reporting route; what to document; what never to say to the customer.
- Good and weak documentation side by side (closing texts, SAR narratives).

##### Option E – Workshop block
- Workshop steps on the agenda; poll or discussion questions about the client's own exposure; break prompts; a short risk-assessment exercise if time allows.

> **Notes:** [For each Part II slide, add the client-specific talking points and the expected discussion answers.]

---

#### Exercise slides

##### Exercise instructions
**Practical exercise** – [title]
- You are [role, e.g. "members of the customer committee"]. Discuss the [number] cases in front of you.
- Optional: take the role on your card and argue from that standpoint.
- Don't fight the scenario.
- Time: [4–5] minutes in groups, then plenary.

##### Case slide(s)
**Case [n] – [short title]**
[Situation in 2–4 lines, invented or anonymised, using `{{client_short}}`'s products.]
Questions:
1. [ … ]
2. [ … ]
3. [ … ]

##### Debrief slide
[Key points the groups should have raised; 4–8 bullets. Full facilitator key in the case pack.]

> **Notes:** [Time: 10–20 min incl. debrief] How to run it: groups, time-keeping, what to listen for, the facilitator key reference (`C-xx`), the one takeaway to land.

---

#### Knowledge check

[5–10 items for a 60-minute session, or 1–3 per section. Use items from `references/quiz-bank.md` by Q-ID.]

**Question [n]:** [statement or question]
A) … B) … C) …
[Answer slide: correct answer + rationale + reference]

> **Notes:** Reveal answers one by one; spend time on the ones most got wrong.

---

#### Section divider 03 – Part III: Outlook (*Del III – Framtidsspaning*)

##### Slide – What is changing
[Dated timeline: adopted acts, application dates, level 2 texts expected. Mark drafts as drafts.] "Regulatory status as of `{{date}}`."

##### Slide – What it means for `{{client_short}}`
[3–5 impacts on this audience's work.]

##### Slide – What to do now
[3–5 actions, e.g. numbered key lessons: 1 start now · 2 break it down · 3 follow level 2 texts · 4 expect change.]

> **Notes:** Distinguish what is decided from what is expected. Avoid predictions presented as facts.

---

#### Summary – Remember to… (*Tänk på att…*)

1. [Imperative, e.g. "Document your assessment so that someone else can follow it."]
2. [ … ]
3. [ … ]
[Where to find internal rules: `[TO CONFIRM: document names and location]`. Whom to contact: `[TO CONFIRM: role or function]`.]

> **Notes:** [Time: 2 min] Restate the key message in one sentence.

---

#### Questions

> **Notes:** Log questions not answered; promise an answer by email [or at the next team meeting].

#### Contacts

[Presenters: name, role, email, phone.]

---

#### Appendix

##### A1 – Abbreviations and definitions

| Abbreviation | Definition |
|---|---|
| AML / CTF | Anti-money laundering / counter-terrorist financing (*penningtvätt / finansiering av terrorism*) |
| BWRA | Business-wide risk assessment (*allmän riskbedömning*, ARB) |
| CRC / CRA | Customer risk classification / assessment (*riskklassificering av kund*) |
| CDD / EDD / SDD / ODD | Customer / enhanced / simplified / ongoing due diligence (*kundkännedom / skärpta / förenklade åtgärder / löpande uppföljning*) |
| KYC | Know your customer |
| BO / UBO | (Ultimate) beneficial owner (*verklig huvudman*, VH) |
| PEP / RCA | Politically exposed person / relative or close associate (*person i politiskt utsatt ställning / familjemedlem eller känd medarbetare*) |
| TM | Transaction monitoring (*transaktionsövervakning*) |
| SAR / STR | Suspicious activity / transaction report (*rapport till Finanspolisen*) |
| FIU | Financial intelligence unit (in Sweden *Finanspolisen*) |
| MLRO | Money laundering reporting officer |
| SAE | Specially appointed executive (*särskilt utsedd befattningshavare*, SUB) |
| CFA | Central functional officer, AML/CTF compliance officer (*centralt funktionsansvarig*) |
| [ … ] | [Add topic-specific terms] |

##### A2 – Sources and further reading
[Regulation, guidelines, national risk assessment, FIU guidance, supervisor's pages. Each with date accessed.]

##### A3 – Bonus slides
[Detailed tables, maturity grids, extra cases. Not presented unless time allows.]

---

#### Accompanying files (separate)

- Case and exercise pack – participant version and facilitator key (`references/case-and-exercise-bank.md`)
- Knowledge check with answer key (`references/quiz-bank.md`)
- Training record pack: attendance register, results, evaluation, Q&A log, summary note (`references/training-records-and-evaluation.md`)
- Participant handout (`references/design-brief-and-agendas.md`)

## Placeholders

The blueprint text uses these placeholders. Fill each one from the request brief or the inputs. If a value is not known, write `[DATA NEEDED: …]` in the deliverable; never invent it, and never leave a `{{…}}` placeholder in a finished deliverable.

- `{{client_name}}` — the client's legal name (brief: client.legal_name)
- `{{client_short}}` — the defined term for the client, e.g. "the Company" (brief: client.defined_term)
- `{{date}}` — the deliverable date (brief: engagement.date)
- `{{jurisdiction}}` — the jurisdiction(s) (brief: engagement.jurisdictions)
- `{{language}}` — the output language (brief: engagement.output_language)
- `{{supervisor}}` — the supervisor (brief: engagement.supervisor)
- `{{topic}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{version}}` — the document version (brief: engagement.version)
