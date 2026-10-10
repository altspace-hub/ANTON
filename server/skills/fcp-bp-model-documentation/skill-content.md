# FCP blueprint: Model documentation (TM, screening, customer risk classification)

Blueprint `model-documentation` v1.1 (stable) from the FCP blueprint library, as ANTON skill `fcp-bp-model-documentation`. Produces model documentation for AML/CTF models (customer risk classification, transaction monitoring, PEP and sanctions screening) under model risk management principles, written in the client's voice for adoption by the model owner. Also covers the supporting model inventory, the model risk assessment (tiering by criticality and quality) and change management (change validation request form and optimisation and adjustment log). Use when a client must document a new or live AML/CTF model, prepare a model for independent validation, remediate supervisory or validation findings on documentation, or set up inventory, tiering and change control. Not for writing the independent validation report itself.

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
- `references/…` inlined below: `change-management.md`.
- The other `references/…` catalogues (`crc-risk-factors.md`, `data-request-and-workshops.md`, `evaluation-metrics.md`, `model-inventory.md`, `model-risk-assessment.md`, `screening.md`, `tm-scenarios.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Method and quality bar (blueprint sections 1–14)

Load `_core/house-standards.md`, `_core/request-context.md` and `_core/output-formats.md` with this blueprint. This file only repeats a house rule where model documentation needs a sharper version of it. Detailed catalogues are in `references/`.

### 1. Purpose and outcome

Model documentation describes one AML/CTF model: what it is meant to achieve, how it is built, why it was built that way, how well it works, what it cannot do, and how it may be changed. In AML/CTF, a "model" is any procedure that automates or standardises the assessments an obliged entity makes to meet AML/CTF requirements. A scoring sheet, a set of monitoring rules or a name-matching configuration is a model even if no statistics are involved.

**Readers and the decisions they make**

| Reader | Uses the document to |
|---|---|
| Model owner, usually the specially appointed executive (SAE; Sw. *särskilt utsedd befattningshavare, SUB*) | Adopt the model, its parameters and its stated limitations; approve changes |
| AML specialists and the AFC/AML team | Operate, calibrate and optimise the model within documented boundaries |
| Independent validator (compliance or risk function, or external) | Plan and perform validation against documented theory, assumptions and expected results |
| Internal audit and the supervisor | Verify that the model is understood, governed and fit for purpose |

The document is written in the client's voice (`author_of_record: client`) and adopted by the model owner. It fulfils four purposes, which the team states in every document: (i) describe the structure and function of the model, (ii) describe how changes are implemented and documented, (iii) evaluate and quality-assure the model, including its effectiveness and accuracy, and (iv) make further development and independent validation possible.

**Quality test:** a competent validator who has never met the developers can write a validation plan from the document alone, and can see for every risk factor, scenario or list which BWRA risk it addresses and why each parameter has its value.

### 2. When to use / when not to use

**Use for**
- Customer risk classification (CRC/CRR; Sw. *kundriskklassificering*), transaction monitoring (TM; Sw. *transaktionsövervakning/-monitorering*), including real-time rules, and PEP/sanctions screening of customers and payments.
- Other inventory-listed AML/CTF models, such as a country risk model or the scoring method of the business-wide risk assessment (BWRA; Sw. *allmän riskbedömning*). Adapt section 7.
- First documentation of a live model ("as-is" reverse documentation), a new model before go-live, or an update after a significant change or validation findings.
- Setting up the model inventory, model risk assessment and change management artefacts.
- One combined document for tightly linked models (e.g. TM and CRC in one platform), if the client prefers it.

**Do not use for**
- The independent validation opinion. Use `model-validation-report`; this blueprint produces what that validation tests.
- The BWRA itself. Model documentation depends on the BWRA and maps to it, but does not replace it. Use `aml-ctf-risk-assessment`, or `sanctions-risk-assessment` for the sanctions exposure behind a screening model.
- The MRM policy or instruction. This blueprint supplies its content (inventory, tiering, change process), but the governing document follows the client's policy format.
- Operational routines (alert handling, screening routine, KYC manual). Refer to them; do not reproduce them.
- Credit, fraud or capital models. The structure transfers, but the risk sections and regulatory anchors do not.

### 3. Inputs

**Minimum to start**

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| Brief per `_core/request-context.md` | Names, jurisdiction, language, voice | Engagement lead | Ask (max five questions) |
| Model identification: model type, system (in-house or vendor), status, owner | Determines section 7 variant and depth | Client AML function | Ask; cannot start without model type |
| Current BWRA | Anchor for every risk factor, scenario and list | Client | Proceed, but mark coverage analysis `[DATA NEEDED: BWRA]` and record it as a limitation |
| Current configuration: risk factors, options, scores, weights, class bands (CRC); active scenarios with parameters and thresholds (TM); lists, matching settings, match categories and frequencies (screening) | The model specification is the configuration | System export, vendor manual, scenario log | Produce skeleton only. Never invent parameters |
| MRM instruction (roles, validation, change process) | Roles and change sections must match it | Client governance | Describe proposed set-up, mark `[TO CONFIRM]` |

**Needed for a complete deliverable**

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| AML policy, instruction, KYC routine, TM and screening routines, risk appetite statement | Roles, manual correction, consequences of risk class | Client | Refer generically, mark `[DATA NEEDED]` |
| System documentation, system map, data dictionary, import file specifications | Data, structure and data quality sections | IT, vendor | Interview IT; mark gaps |
| Test plan, test cases, UAT results, sensitivity analyses | Test and results sections need evidence | AML team, IT ticketing | State that evidence is missing; recommend retest |
| Statistics for 12 months: risk-class distribution; alerts, cases and FIU reports per scenario; FIU reports per risk class; screening hits by category; handling times; data-load incidents; overrides | Expected results, KPIs and suitability | AML team, BI | Mark `[DATA NEEDED]`; do not estimate |
| Previous validation, audit and supervisory findings; remediation plan | Limitations and future development | Compliance, audit | Ask |
| Change history | Optimisation and adjustment log | AML team, system logs | Start log from current version |
| Client template | Layout | Client | Use neutral layout per `_core/output-formats.md` |

The standard data request and interview questions are in `references/data-request-and-workshops.md`.

### 4. Regulatory and professional anchors

State "Regulatory status as of {{date}}" in the background section, and check every reference against the current consolidated text.

**EU baseline**
- Directive (EU) 2015/849 (AMLD4), as amended by Directive (EU) 2018/843: risk-based policies, controls and procedures proportionate to the nature and size of the entity, expressly including model risk management practices (Article 8(4)(a) `[VERIFY REFERENCE]`); customer due diligence, including ongoing monitoring (Article 13); enhanced due diligence for high-risk third countries and PEPs (Articles 18a and 20 `[VERIFY REFERENCE]`); record retention (Article 40).
- EBA Guidelines on ML/TF risk factors (EBA/GL/2021/02): customer risk assessment, weighting of risk factors and the expectation that a firm using an automated or bought-in scoring system understands how it combines risk factors into a score `[VERIFY REFERENCE: paragraph]`; monitoring expectations.
- EBA Guidelines on the AML/CFT compliance officer (EBA/GL/2022/05): reporting to management on the functioning of systems and controls, including monitoring `[VERIFY REFERENCE]`.
- EU restrictive measures regulations (Article 215 TFEU): directly applicable asset freezes and the prohibition on making funds available. This is the legal basis for screening, with no risk-based discretion on whether to screen.
- GDPR (Regulation (EU) 2016/679): legal basis (Article 6(1)(c)), limits to erasure during AML retention (Article 17(3)(b)) and automated individual decisions (Article 22), which matter where model output drives on-boarding refusal or exit.
- Forward look: the AML package. This is Regulation (EU) 2024/1624 (AMLR, applicable from 10 July 2027), Regulation (EU) 2024/1620 (AMLA) and Directive (EU) 2024/1640 (AMLD6). AMLR sets internal policies, controls, CDD and monitoring requirements directly, and AMLA will issue technical standards and guidelines. Check which provisions address models and automated tools `[VERIFY REFERENCE]`. For machine-learning components, assess whether Regulation (EU) 2024/1689 (AI Act) applies `[VERIFY REFERENCE]`.

**National layer via `{{jurisdiction}}`.** For each jurisdiction, identify where national law covers: the BWRA; the customer risk assessment; monitoring; documented procedures, including model risk management; record keeping; and the SAE and compliance roles. Then add the supervisor's regulations, the preparatory works or guidance that define "model", the national sanctions act and the FIU.

*Sweden (worked example):*
- Lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism (PTL). Chapter 2, Section 1 covers the BWRA. Chapter 2, Section 3 covers the customer risk assessment, which is the legal basis for CRC. Chapter 4, Section 1 covers monitoring and is the basis for TM, including its three limbs: deviation from customer knowledge, deviation from knowledge of customers generally, and activity that may otherwise form part of ML/TF. Documented procedures, including model risk management, are covered at `[VERIFY REFERENCE: Chapter 2, Section 8]`. Retention is five years `[VERIFY REFERENCE: Chapter 5]`. The SAE (*SUB*) and the central function responsible (*CFA*) are covered at `[VERIFY REFERENCE: Chapter 6]`.
- Prop. 2016/17:173: defines a model as procedures that "automate or standardise" assessments. It also expects model risk procedures to describe the underlying theory and assumptions, how changes are documented, and a validation process `[VERIFY REFERENCE: page]`. Quote this in every background section.
- FFFS 2017:11, Finansinspektionen's regulations and general guidelines `[VERIFY REFERENCE: chapter and section on monitoring and models]`. Finansinspektionen supervises, and the Financial Police (*Finanspolisen*) is the FIU.
- Sanctions: the EU regulations plus the national sanctions act `[VERIFY REFERENCE]`. Sweden applies an 18-month post-function period for PEP measures, while some other Nordic states apply 12 months `[VERIFY REFERENCE]`. State which rule applies to multi-country clients.
- National industry guidance, e.g. on internal control and CDD from the national AML industry body `[VERIFY REFERENCE]`. The police list of particularly vulnerable areas (*särskilt utsatta områden*) is an optional geographic risk input.

**International and professional practice** (not binding EU AML law, but used by supervisors and validators): FATF Recommendations 1, 10, 12 and 20, and FATF guidance on new technologies for AML/CFT (2021); Wolfsberg FAQs on risk assessments, and Wolfsberg Guidance on Sanctions Screening (2019). General MRM practice, such as US supervisory guidance SR 11-7 and the UK PRA's SS1/23, supplies the concepts of conceptual soundness, ongoing monitoring, outcomes analysis, inventory, tiering and effective challenge. Cite these as good practice, never as binding requirements.

### 5. Method

**Step 1 – Scope and kick-off (meeting, 1 hour).** Confirm which model(s), the system and vendor, the status (in development, live, in remediation), the owner, the client template and the language. Confirm that an MRM instruction exists and who validates. *Why:* a model documentation drafted outside the client's MRM framework will contradict it on roles and change rights. *Judgement:* if the client wants one document for TM and CRC, check that both share owner, system and data flows; otherwise document them separately and cross-refer.

**Step 2 – Inventory entry.** Record the model in the model inventory (`references/model-inventory.md`), or build the inventory if none exists. Apply the model definition broadly: CRC, TM, real-time payment rules, customer and payment screening, country risk lists that feed other models, and the BWRA scoring method. *Why:* models missing from the inventory escape validation and change control, and supervisors ask for the inventory first.

**Step 3 – Model risk assessment (tiering).** Rate criticality and quality and combine them in the matrix in section 7.1 (`references/model-risk-assessment.md`). *Why:* the tier sets documentation depth, validation frequency and approval level. *Judgement:* sanctions screening is rarely below High criticality, because its failure means a direct legal breach. For a model not yet live, rate quality on design and test evidence and mark the rating provisional.

**Step 4 – Data request and document review.** Send the standard request (`references/data-request-and-workshops.md`) and read the BWRA, governing documents, configuration exports, test evidence and statistics before any interview. *Why:* interviews are spent on why things are as they are, not on what they are.

**Step 5 – Interviews and workshops.**
- **Interviews:** the model owner, the AML specialist who calibrates the model, investigators or KYC analysts, the IT or data owner and, where useful, the vendor.
- **Coverage workshop** (2–3 hours): map BWRA risks, typologies and red flags to model elements or compensating controls.
- **CRC calibration and sensitivity workshops:** several sessions over two to three weeks, using test-environment data and a simulation tool that shows which factors drive the outcome.

*Why:* parameters are expert judgements, and the documentation must capture the reasoning, not only the values.

**Step 6 – Coverage mapping.** Build the BWRA-to-model mapping table: risk or modus → risk factor or scenario type → specific factor or scenario → coverage (Yes / Partly / No / Handled by another control) → gap. Every gap gets a compensating control or an entry in "future development". Also check the **reverse gap**: model factors or scenarios that cannot be traced to the BWRA point either to a BWRA gap or to an unexplained model element. This uses the same coverage scale as `model-validation-report`. *Why:* this is the link between risk assessment and controls that validators and supervisors test first.

**Step 7 – Draft the specification.** Write the model choice against the typology of designs (section 7 and `references/`), the systems considered, the structure, scales, parameters, and a **rationale for each threshold or score**. *Judgement:* proportionality. A score-adding CRC can be adequate for a narrow consumer-credit business. A diversified bank needs a risk-weighted model, possibly with a behavioural component. Say why, with reference to the BWRA and to products, customers and volumes.

**Step 8 – Testing and sensitivity evidence.** Document what was tested, how and with what result. Team-standard designs:
- **CRC:** at least four test cases per risk class for natural and legal persons, then a full customer-base run, sample checks per class and recalibration until the result is reasonable.
- **TM:** test environment mirroring production, with above-the-line/below-the-line analysis on key parameters.
- **Screening:** a name-variation back-test for unmanipulated and manipulated names.
- **Missing data:** always test its effect explicitly.

Details are in the references. Where evidence is weak, say so ("testing at implementation was not documented in a form that supports analysis; a structured retest is planned for [date]").

**Step 9 – Evaluation and suitability.** Set expected results, KPIs and KRIs with tolerance bands (section 7.3). Then write an honest suitability conclusion that links to limitations and future development. *Judgement:* "acceptable", "acceptable with reservations" and "not acceptable" are all legitimate conclusions, and the document is credible only if the conclusion follows from the evidence.

**Step 10 – Data, dependencies and governance sections.** Describe the data flow from source to output, data quality controls and data limitations, interactions with other models, lifecycle, information security and record keeping.

**Step 11 – Change management set-up.** Open the optimisation and adjustment log, align the definition of significant change with the MRM instruction, and attach the change validation request form (`references/change-management.md`).

**Step 12 – Review and adoption.** Review the draft with the model owner and close or list every `[DATA NEEDED]`. Fill in the model summary last. Submit for adoption by the model owner and hand over to the validator.

### 6. Deliverable structure

Section order follows the team's template (headings in English, with Swedish equivalents in `template.md`). Typical total length: 20–45 pages for CRC or TM, and 15–25 for screening, plus appendices.

| Section | Purpose and content | Length / style |
|---|---|---|
| **Cover and document information** | Document type, model name, client, owner (SAE), approver, information class, version, last updated, next revision. "Adoption and revision": the owner adopts the document, approves changes, and reviews it at least annually or on change. Version table | 1 page; table |
| **Model summary** | One box: model ID from the inventory, type, system, status, version, owner, model risk tier, last validation, suitability conclusion, top three limitations, open actions | ½ page; table. Written last |
| **1 Background** | Why the client must have the model (legal basis, BWRA, governing documents). States the AML model definition and the MRM requirements (theory and assumptions, change documentation, validation). States the **main model risks for this model type** and the sources used. States that the document is reviewed at least annually and that significant changes trigger validation | ½–1 page; formal |
| **2 Purpose and business objective** | What the model must achieve, measurable where possible (target outcome, observation period). States what the model is *not* for: CRC does not detect suspicious behaviour, but supports KYC and TM. Gives the four purposes of the document | ½ page |
| **3 Definitions and abbreviations** | Table, in addition to terms defined in the AML policy and MRM instruction. Always define: model, model risk, significant change, risk factor, risk value, risk score, risk profile/class | Table |
| **4 Roles and responsibilities** | Model owner, AML specialists or AFC lead, users, independent validation, AML/CFT forum or committee, IT/data owner, system owner, vendor. Says who decides changes and overrides, and who must be informed | 1 page; one paragraph per role |
| **5 Process description** | Illustrations of (a) the model in the customer lifecycle or KYC flow, (b) the components (data sources → input → processing → output → use), (c) the component workflow | 1–2 pages; figures with short text |
| **6 Model specification** | 6.1 Model selection and implementation (6.1.1 theories and assumptions, 6.1.2 implementation prerequisites, 6.1.3 test process, 6.1.4 test results, 6.1.5 sensitivity analysis); 6.2 Model structure; 6.3 Model scope; 6.4 Model limitations (general, system/vendor, model-specific); 6.5 Manual correction/override; 6.6 Model evaluation (6.6.1 expected results, 6.6.2 responsibility and performance, 6.6.3 metrics KPI/KRI, 6.6.4 suitability) | 6–12 pages; the analytical core |
| **7 Model-specific risk coverage** | CRC: Risk factors (selection, scoring, included, excluded). TM: Risks to manage through TM (overview, monitoring method, design/optimisation/deactivation process, active scenarios, gaps). Screening: Risks to manage through screening (PEP/RCA, sanctions exposure, customer and payment screening, matching logic, lists, IP blocking) | 5–20 pages; tables per factor or scenario |
| **8 Data** | 8.1 Input (sources, data points, frequencies, databases, responsible parties for import files); 8.2 Output (what is produced, where it is stored and investigated); 8.3 Data quality assurance; 8.4 Data limitations; 8.5 Data adjustments; 8.6 Flow chart | 2–5 pages |
| **9 Interactions with and dependencies on other models** | Upstream and downstream: BWRA → CRC → TM thresholds; screening → CRC; TM/FIU reports → CRC and BWRA. If none, say so explicitly | ½–1 page |
| **10 Future development** | Known planned changes, linked to limitations, gaps, suitability and the remediation plan, with timing | ½ page; list |
| **11 Lifecycle management** | Lifecycle stages per the MRM instruction (development, approval, implementation, use, monitoring, validation, change, retirement) with a figure | ½ page |
| **12 Information security** | Confidentiality of detection logic on a need-to-know basis; who decides the circle of access; audit and risk functions keep access; reason (customers must not learn to evade the model) | ½ page |
| **13 Documentation and record keeping** | Update triggers, related documents (scenario log, risk factor specification, routines), retention (at least five years in the Swedish example), storage | ½ page |
| **Appendix A Optimisation and adjustment log** | Change log (columns in section 8) | Table |
| **Appendix B Specification** | Risk factor specification (CRC), scenario log (TM) or list and matching settings (screening) | Table or workbook reference |
| **Appendix C Test cases and results** | Test matrix, results, sensitivity outputs | Table |
| **Appendix D BWRA mapping** | Coverage table from step 6 | Table |

**Wording style.** Descriptive present tense for how the model works ("The Model calculates…"). Use "shall" for binding internal rules ("Every override shall be documented and time-limited"), and "{{client_short}} assesses" for self-assessments. Use future tense only in section 10, or with a date.

### 7. Scales, scoring and calculations

#### 7.1 Model risk assessment (tiering)

Rate each assessment area on four levels: **Low / Normal / High / Very high** (*Låg / Normal / Hög / Mycket hög*; the library labels in `_core/risk-scales.md` §1). Then combine them by documented judgement into a collected criticality and a collected quality. Do not use a mechanical average: a single Very high area may dominate.

- **Criticality areas:** materiality; area of use; complexity; documentation and transparency; input and assumptions; dependencies on other models; dependencies on business processes.
- **Quality areas:** performance/precision; accuracy/predictability; stability/sensitivity; reliability; input data; assumptions; implementation.

**Collected model risk** (criticality across, quality down):

| Model quality ↓ / Model criticality → | Very high | High | Normal | Low |
|---|---|---|---|---|
| **Very high** | Normal | Low | Low | Low |
| **High** | High | Normal | Normal | Low |
| **Normal** | Very high | High | Normal | Normal |
| **Low** | Very high | Very high | High | High |

Mark the final rating in bold and state who performed it (the model owner) and the approval date. Descriptors per area and the proposed consequences per tier are in `references/model-risk-assessment.md`.

#### 7.2 CRC scoring mechanics

Place the design in the team's typology:
- **Dominant-factor:** single factors set the class; supervisors do not favour it.
- **Score-adding:** summed points against class bands; acceptable for low complexity.
- **Risk-weighted:** category scores are weighted and combined; the expected design for broader businesses.
- **AI/ML:** a component only, never stand-alone.

Then specify:
- categories and weights, which sum to 1 and carry a BWRA-based rationale;
- per factor, the options, risk level, score and **missing-data score**;
- the complementary methods: minimum (mandatory high), exact, add-on, risk-reducing, unacceptable and *Undetermined*;
- one class-band table with the CDD consequence of each class.

The team's missing-data rule: score at the most frequent observed answer plus an uncertainty add-on. Risk-reducing factors get no add-on, and critical factors lead to *Undetermined*. Full mechanics and the factor catalogue are in `references/crc-risk-factors.md`.

#### 7.3 Evaluation: KPIs and KRI tolerance bands

The team's default tolerance table for CRC, to calibrate per client and mark `[TO CONFIRM]`:

| Metric (KRI) | Target | Low impact | Medium impact | High impact | Action required |
|---|---|---|---|---|---|
| Share of high-risk customers | [client target %] | ± 0–2 pp | ± 2–4 pp | ± 4–6 pp | ± >6 pp |
| FIU-reported customers: share in high risk | 50% | 40–50% | 30–40% | 20–30% | <20% |
| Error assessment: Normal → should be High (sample) | 5% | 5–10% | 10–15% | 15–20% | >20% |
| Error assessment: High → should be Normal (sample) | 5% | 5–10% | 10–15% | 15–20% | >20% |

The first two are for continuous follow-up and the last two for in-depth checks.

For TM, use these definitions:
- **Alert-to-report ratio** (sv *FIPO-larmkvot*): FIU reports ÷ alerts, per scenario and in total.
- **Alert-to-investigation ratio**: alerts escalated to investigation or EDD ÷ alerts.
- **Investigation-to-report ratio** (sv *FIPO-utredningskvot*), if needed: FIU reports ÷ alerts that went to in-depth investigation.

These are the same names and definitions as in `model-validation-report`, so that a model documented here and validated there reports the same figures.
- **FIU rate** per risk class: reported customers ÷ customers in the class.
- **FIU share**: reported customers in the class ÷ all reported customers.

Do not use an industry benchmark without a verifiable source. Targets must be set per client and per scenario, and both a very low and a very high alert-to-report ratio trigger review, because a very high ratio suggests hits are being missed below the threshold. For screening, set back-test targets for unmanipulated and manipulated names. The full metric library is in `references/evaluation-metrics.md`.

### 8. Supporting artefacts

| Artefact | Format | Content |
|---|---|---|
| Model inventory | Excel, one row per model | Model ID, name, type, area of use, status, version, owner, purpose, countries, products, dependencies, criticality, quality, model risk, MRA approval, last and next validation (full list in `references/model-inventory.md`). Sheet "Version control" |
| Model risk assessment | Excel, one sheet per model | Criticality block, quality block, matrix, comments, performer, date. Drop-downs for ratings |
| Model change validation request form | Word | Fields in `references/change-management.md` |
| Optimisation and adjustment log | Appendix A, or an Excel log for TM-heavy clients | Problem statement and date; problem description; test process; suggested solution; presented (date); adopted (date); implemented (date) |
| Risk factor specification / scenario log | Excel appendix | CRC: factor ID, category, factor, option, risk level, score, weight, missing-data score, method (weighted/minimum/exact/add-on), BWRA reference, data source. TM: scenario ID, name, typology, product/segment, scenario type, parameters, thresholds per segment or risk class, rationale, expected volume, alert-to-report ratio, last tuned, status |
| Test case matrix | Excel | Case ID, customer category, attributes, expected class or alert, actual result, deviation, retest |

The workbooks follow `_core/output-formats.md` §3, with IDs such as M-01 (model), RF-CUS-03 (risk factor), SC-07 (scenario) and T-12 (test case) that the document references.

### 9. Writing rules specific to this deliverable

1. **Every parameter has a reason.** Each threshold, score and weight is followed by its rationale, e.g. "Most credits in the portfolio are below [amount]; the threshold is set at [amount] to capture payments materially above normal behaviour." Weak: "The threshold is set at a reasonable level."
2. **Name the model risk for the type** in the background section:
   - CRC: "a single factor is given too much or too little weight, or a well-informed customer can steer the outcome".
   - TM: "alerts are easy to circumvent, or the rules are not adapted to how the products are actually used".
   - Screening: "the model does not use the correct lists, or the matching logic is not in line with the risk exposure".
3. **Separate current state from target state.** Planned functionality belongs in section 10 with a date. Never describe a planned scenario as active.
4. **One scale, one set of numbers.** Class bands, thresholds and currencies must be identical in the body, the tables and the appendices. Show amounts in one currency, or convert them consistently.
5. **Limitations are written in three layers** (general, system or vendor, model-specific), and each carries its mitigation. The general layer always states that the model depends on complete data, on a correct BWRA and on the expertise of the AML specialists (standard wording in `template.md` 6.4.1).
6. **Suitability is a reasoned conclusion, not a slogan.** Good: "{{client_short}} assesses the overall suitability as acceptable with reservations. The Model classifies all customers at on-boarding and on change, but three BWRA customer risk factors are not yet parameterised and are handled manually (section 7A.4); see the remediation plan in section 10." Weak: "The Model is deemed appropriate." Never cite the vendor's reputation as evidence.
7. **Self-assessment voice.** Write "{{client_short}} assesses", never "we recommend". The issuing firm does not appear in the body.
8. **Expectations stated as testable statements**, e.g. "weighting shall not let one factor dominate, nor make it impossible for a relationship to be classified as high risk", and "the share of FIU-reported customers in higher classes shall be materially higher than a random distribution".
9. **No secrets in the document.** No passwords, access links with credentials, or production thresholds in documents circulated outside the need-to-know circle. Where the client requires it, put thresholds in a restricted appendix.
10. **Terms.** For Swedish output, use *modellägare, modellrisk, väsentlig förändring, riskfaktor, riskvärde, riskpoäng, riskklass, larm, scenario, tröskelvärde, FIPO-larmkvot (alert-to-report ratio), manuell korrigering, optimerings- och justeringslogg*.

### 10. Quality checklist

- [ ] The model is in the inventory with an ID that matches the document; the tier is stated in the model summary.
- [ ] The background cites the model definition and MRM requirements, with references verified or marked.
- [ ] The purpose states a measurable objective and what the model is not for.
- [ ] The roles match the MRM instruction; change rights and override decisions are named.
- [ ] The model choice is argued against alternatives and proportionality, and the systems considered are listed.
- [ ] Every risk factor, scenario or list is traced to a BWRA risk; excluded factors and gaps have compensating controls.
- [ ] Every threshold, score and weight has a rationale; the missing-data treatment is specified.
- [ ] Test process and results are described with evidence; weak or missing evidence is stated.
- [ ] Sensitivity analysis is described, or its absence is a stated limitation with a date.
- [ ] Limitations are covered in three layers, with mitigations.
- [ ] Manual correction covers when, who approves, documentation, time limit and the informing of the validator.
- [ ] Expected results, KPIs and KRIs have targets and tolerance bands; the suitability conclusion follows from them.
- [ ] The data section covers sources, frequencies, responsibilities, quality controls, limitations and adjustments.
- [ ] Dependencies on other models are explicit, both ways.
- [ ] The change log is opened; "significant change" is defined consistently with the MRM instruction.
- [ ] Scales and numbers are consistent throughout; no template guidance text or broken cross-references remain.
- [ ] No credentials, vendor marketing or other clients' details appear.

### 11. What makes it stand out

1. **BWRA-anchored, with gaps made visible.** Every factor, scenario and list is traced to a BWRA risk or typology. Excluded factors and gaps are listed with their compensating manual control, and reverse gaps are checked.
2. **Model choice argued, not asserted.** The design is placed in a typology, tested for proportionality against products, customers and volumes, and compared with the systems that were rejected.
3. **Every number explained.** Thresholds, scores, weights and missing-data defaults carry reasoning and test evidence, so the validator can challenge the reasoning instead of reverse-engineering it.
4. **Testable expectations.** Expected results and KRI tolerance bands with action levels make the suitability conclusion verifiable.
5. **Honest self-assessment.** Limitations are set out in three layers, the suitability conclusion may be qualified, and weak evidence is stated rather than smoothed over.
6. **Models as a system.** The links between BWRA, CRC, TM, screening and FIU feedback are documented, including risk-class-dependent thresholds and double coverage.
7. **Built-in change control and proportional depth.** A significant-change definition, a request form, a log, an inventory and tiering make the document a living control.
8. **Ready for adoption.** Written in the client's voice and template, with bilingual terms.

### 12. Common pitfalls

- **Copy-paste between model types**, e.g. "monitoring scenarios" in a CRC document, or B2B tables labelled B2C.
- **Inconsistent numbers:** two class-band tables, or amount conversions that do not match.
- **Mislabelled design:** "weighted" while all weights equal 1.
- **Unchecked missing-data defaults** that push a large share of customers to High.
- **Thresholds without rationale**, or "based on experience" only.
- **Weak test reporting:** results referred to a ticket system without a summary, or no retest date for weak tests.
- **Wrong legal basis:** CRC cited under the monitoring provision instead of the customer risk assessment provision.
- **Unstated split data:** CRC output not used in TM, or one customer with two products treated as two customers, without saying so.
- **Leftover template material:** guidance questions, placeholder dates, broken cross-references.
- **Vendor reputation as suitability evidence**; credentials pasted into the text.
- **Uncontrolled overrides and auto-closures:** no time limit or documentation for overrides; low-category screening hits auto-closed without rationale or sample testing.

### 13. Variants

**By client type** (typologies per type are in `references/tm-scenarios.md`)
- **Bank.** Weighted CRC, often combined with "legal high" rules, a behavioural ML component and manual assessment; the highest component sets the class. TM is segmented by product, purpose and occupation, with real-time rules and payment screening.
- **Niche bank, credit market company, consumer credit.** A score-adding CRC can be justified. TM targets repayment-side typologies. State that the client sees only part of the customer's finances.
- **Payment or e-money institution.** Real-time payment screening, velocity rules, merchant, agent and distributor risk.
- **Insurance.** Early surrender, beneficiary change, overpayment and refund, third-party payer.
- **Fund manager or investment firm.** Service and segment risk, securities flow-through, off-market trades.
- **Non-financial obliged entity.** Spreadsheet or questionnaire models are still models; document them lightly but completely.

**By set-up**
- **Vendor model.** Add system limitations and evidence that the client understands how the system combines factors.
- **In-house model.** Add code and version control and developer/validator separation.
- **Group model used by several entities.** Each entity documents applicability, local deviations and mitigations.
- **ML component.** Add features, training data, recall and accuracy, decay monitoring, retraining, explainability, GDPR and AI Act considerations.

**By maturity**
- **Live model documented for the first time.** As-is, with undocumented history marked.
- **New model.** Phasing, transition of the legacy customer stock (e.g. legacy class as an exact value until KYC renewal) and pre-production verification.
- **After validation.** Each finding mapped to the changed section and to the log.

### 14. How the assistant should work

1. **Read the brief**, then ask at most five questions, choosing from: which model(s) and system; live or new; whether the BWRA and the current configuration are available; whether an MRM instruction exists and who validates; client template and language.
2. **Produce in this order:**
   1. Inventory row and provisional tier.
   2. Data request with gaps.
   3. Skeleton from `template.md` with section 7 in the right variant.
   4. BWRA coverage table.
   5. Section 7 and the specification.
   6. Testing and evaluation.
   7. Data and governance sections.
   8. Change log and form.
   9. Model summary last.
3. **Use only client facts.** Parameters, thresholds, statistics, test results and system behaviour come from the client's material. Everything else gets `[DATA NEEDED: …]`, `[TO CONFIRM: …]` or `[ASSUMPTION: …]`.
4. **Stop and ask** when:
   - configuration values are missing;
   - the BWRA does not support a factor or scenario the client uses, or vice versa;
   - statistics contradict the expected results;
   - the roles in the brief contradict the MRM instruction;
   - the client asks to describe planned functionality as current.
5. **Use the references:** `references/crc-risk-factors.md`, `references/tm-scenarios.md` and `references/screening.md` give catalogues to check completeness against. They are not content to paste: include only what the client actually has, and treat the rest as gaps or future development.
6. **Before delivery**, run the checklist in section 10 and the universal checklist in `_core/house-standards.md`, and list all open markers for the client.

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: Model documentation – [Model name]

[Skeleton of the main deliverable, in final section order. The document is written in the client's voice (`author_of_record: client`) and adopted by the model owner. Write it in `{{language}}`. Swedish equivalents of headings are given in parentheses for Swedish-language output. Text in [brackets] is guidance; delete it in the final document. Lines marked `Example:` show wording that has worked; adapt them, never copy them unchanged. Section 7 has three variants (7A CRC, 7B TM, 7C Screening): keep the one that fits, or keep two in a combined document.]

---

#### [Cover page] (Försättsblad)

**Model Documentation (Modelldokumentation)**
**[Model name, e.g. "Customer Risk Classification Model" / "Transaction Monitoring Model" / "PEP and Sanctions Screening Model"]**
{{client_name}}

| Field | Content |
|---|---|
| Prepared by (Upprättad av) | [Role, e.g. AML function] |
| Decided and approved by ("Approver") (Beslutad av) | [Model owner, normally the SAE (SUB)] |
| Document owner (Dokumentägare) | [SAE (SUB)] |
| Information class (Informationsklass) | [Internal / Confidential – per brief; default Confidential] |
| Version | {{version}} |
| Last updated (Senast uppdaterad) | {{date}} |
| Next revision (Nästa revidering) | [Date, at most 12 months after adoption] |
| Superior governing documents (Överordnade styrdokument) | [AML policy; MRM instruction] |
| Associated documents (Tillhörande dokument) | [Risk factor specification / scenario log; routines] |

#### Document information (Dokumentinformation)

##### Document owner (Dokumentägare)
[Who is responsible for content and communication.]
Example: "The Specially Appointed Executive (the "SAE") is responsible for the content and communication of this document."

##### Adoption and revision (Fastställande och revidering)
Example: "The SAE shall adopt the Model Documentation and approve any changes. The Model Documentation shall be updated when needed and reviewed at least annually. If significant changes are made to the Model, the Model shall be validated in accordance with the MRM instruction before the change is implemented."

##### Version history (Versionshistorik)

*Table 1: Version history*

| Version | Status | Date | Modified by (role) | Description of change (sections updated) | Approved by |
|---|---|---|---|---|---|
| 1.0 | Adopted (Fastställd) | [YYYY-MM-DD] | [Role] | Initial version | [SAE] |

#### Model summary (Modellsammanfattning)

[Half a page. Fill in last. Must agree with the model inventory and the model risk assessment.]

*Table 2: Model summary*

| Item | Content |
|---|---|
| Model ID (from model inventory) | [e.g. M-02] |
| Model name and type | [e.g. Transaction monitoring – rule-based] |
| System | [In-house / vendor system – describe generically in the library, name it in the client document] |
| Status | [Under development / Live / Under remediation / Retired] |
| Model version | [x.y] |
| Model owner | [Role] |
| Model risk (tier) | [Low / Normal / High / Very high], per model risk assessment dated [date] |
| Last independent validation | [Date, performed by (function); overall result] |
| Suitability conclusion | [Acceptable / Acceptable with reservations / Not acceptable – one sentence, see 6.6.4] |
| Main limitations | [Top three, with section references] |
| Open actions | [Remediation items with dates, see section 10] |

#### [Table of contents] (Innehållsförteckning)

---

#### 1 Background (Bakgrund)

[Purpose: why the model exists and which rules govern it. Content:
- the legal obligation and governing documents;
- the AML/CTF definition of a model;
- the MRM requirements: theory and assumptions, change documentation, validation;
- the main model risks for this model type;
- the sources;
- the review cycle.
½–1 page. State "Regulatory status as of {{date}}".]

Example: "{{client_short}} shall have a model for [customer risk classification / transaction monitoring / PEP and sanctions screening] in line with regulatory requirements, {{client_short}}'s business-wide risk assessment (the "BWRA"), the policy and instruction on measures against money laundering ("ML") and terrorist financing ("TF") and other internal governing documents (the "Model")."

Example: "When models are used in the work against ML/TF, {{client_short}} shall have procedures for model risk management. A model is defined as procedures that aim to automate or standardise the assessments and other procedures used to meet the requirements of the AML/CTF regulation [VERIFY REFERENCE: national source of the definition]. Model risk management procedures shall describe the underlying theory and the assumptions behind the design of the model and how changes are documented, and there shall be a validation process that ensures the model is fit for purpose."

[Main model risk – keep the one that applies:]
- CRC example: "The risks with such a model are that a single factor is given too much or too little relative weight, or that a well-informed customer can manipulate or steer the outcome of the assessment."
- TM example: "The risks with such a model are that the alerts are easy to circumvent, or that the automated system is not relevant to, or adapted to, how the products are actually used."
- Screening example: "The risk with a screening model is mainly that it does not include the correct lists, or that the name-matching (fuzzy matching) logic is flawed or not sufficiently in line with the risk exposure."

[Sources: list in layer order – EU, national law, national regulations, EBA guidelines, national guidance, industry standards, internal governing documents. Mark uncertain references `[VERIFY REFERENCE]`.]

Example: "Since the work against ML/TF is under constant development, the Model Documentation shall be reviewed at least annually and updated when changes in the Model's structure are made."

#### 2 Purpose and business objective (Syfte och affärsmål)

[Purpose: what the model must achieve and how success is measured. State the target outcome, an observation period and a measurable objective where possible. Say what the model is not intended to do. End with the four purposes of the document. ½ page.]

Example (CRC): "The purpose of the Model is to mitigate the risks identified in the BWRA by classifying {{client_short}}'s customers when a business relationship is established and continuously during the relationship. This allows {{client_short}} to apply a risk-based approach and focus its resources on customers who pose a higher risk. The Model is not intended to identify suspicious behaviour for investigation and reporting; it supports the KYC process and transaction monitoring. The share of FIU-reported customers in higher risk classes shall be materially higher than a random distribution."

Example (TM): "The business objective is that the scenarios, together and over a 12-month period, reach an alert-to-report ratio (FIU reports ÷ alerts) of [target, DATA NEEDED] and an alert-to-investigation ratio (alerts leading to investigation or EDD ÷ alerts) of [target]."

Example: "The purpose of the Model Documentation is to (i) describe the structure and function of the Model, (ii) describe how changes are to be implemented and documented, (iii) evaluate and quality-assure the Model and thereby ensure and analyse its effectiveness and accuracy, and (iv) facilitate further model development and the performance of model validation."

#### 3 Definitions and abbreviations (Definitioner och förkortningar)

[Definitions in addition to those in the AML policy and MRM instruction. Always include the terms below. Adapt the risk classes to the model.]

*Table 3: Definitions and abbreviations*

| Term or abbreviation (Begrepp eller förkortning) | Definition or description (Definition eller beskrivning) |
|---|---|
| BWRA | Business-wide risk assessment (allmän riskbedömning) |
| ML/TF | Money laundering and terrorist financing (penningtvätt och finansiering av terrorism, PT/FT) |
| Model (Modell) | Procedures for automating or standardising assessments and other procedures used to meet the requirements of the AML/CTF regulation |
| Model risk (Modellrisk) | Risk of errors that may arise from the application of a particular model |
| Significant change (Väsentlig förändring) | A change that affects the underlying purpose of the model, has a significant impact on its assumptions, design or data input, or otherwise significantly affects its output |
| Risk factor (Riskfaktor) | An item of information indicating risk; part of the risk model |
| Risk value (Riskvärde) | A value on a scale set for each risk factor, where the highest value indicates the highest risk |
| Risk score (Riskpoäng) | The calculated (weighted) result of the risk model for a customer |
| Risk profile / risk class (Riskprofil / riskklass) | Grouping of risk scores on the scale [Low / Normal / High / Very high / Unacceptable] |
| SAE (SUB) | Specially appointed executive (särskilt utsedd befattningshavare) |
| [CFA / compliance] | [Central function responsible (centralt funktionsansvarig) or compliance function] |
| [TM-specific] | Alert (larm), scenario, threshold (tröskelvärde), alert-to-report ratio (FIPO-larmkvot) |
| [Screening-specific] | PEP/RCA, fuzzy matching, match category, false positive |

#### 4 Roles and responsibilities (Roller och ansvarsfördelning)

[Purpose: who owns, operates, uses, validates and changes the model. Must match the MRM instruction. Include where change decisions are made, who decides on overrides, and who must be informed. One paragraph per role. Write roles, not names.]

##### 4.1 Specially appointed executive / model owner (SUB / modellägare)
Example: "The SAE is the model owner and ultimately responsible for model risk management. This includes the implementation of new models and changes to existing models. The SAE adopts this document, decides on changes, overrides and deactivation of scenarios, and ensures that relevant routines are in place and kept up to date."

##### 4.2 AML specialists / AFC lead (AML-specialister / AFC-ansvarig)
[Operational management. Design, calibration and efficiency testing. Proposals for improvement. Maintains the optimisation and adjustment log.]

##### 4.3 Users: investigators and KYC analysts (Användare: utredare och KYC-analytiker)
[Handle alerts or classifications. Provide feedback and propose overrides.]

##### 4.4 Independent validation function (Oberoende validering) [CFA / compliance / risk function]
Example: "[Function] is responsible for independent model validation in accordance with the MRM instruction. [Function] shall be informed of manual override decisions and of cases where relevant risks are deliberately left without [monitoring/coverage] by the Model."

##### 4.5 AML/CFT forum or committee (AML/CFT-forum) [if applicable]
[Reviews change validation requests, sets validation periods and gives recommendations.]

##### 4.6 IT, data owner and system owner (IT, dataägare och systemägare)
[Import files and associated tests; correctness of input data; operation, continuity and information security of the platform.]

##### 4.7 System supplier (Systemleverantör) [if applicable]
[Support, releases, list delivery. Who owns the contract.]

#### 5 Process description (Processbeskrivning)

[Purpose: show how the model works as a process. Use three figures with short explanatory text. 1–2 pages.]

[Figure 1: The Model in the KYC / customer lifecycle flow]
[Figure 2: The Model's components – data sources, input, processing, output and use]
[Figure 3: Workflow of the Model's components]

*Table 4: Model components*

| Data sources (Källor till data) | Input to the model (Indata) | Processing (Bearbetning) | Output (Utdata) | Use (Användning) |
|---|---|---|---|---|
| [Identified relevant internal and external sources] | [Quality controls: completeness, accuracy, identified risk; personal data considered] | [Calculation/rule engine processing data according to rules and risk factors] | [Risk class / alerts / possible matches; delivery to dependent systems and processes] | [Drives depth, breadth and frequency of KYC and monitoring; investigation; reporting] |
| *Dependencies* | *Conceptual design* | | *AML process* | |

#### 6 Model specification (Modellspecifikation)

##### 6.1 Model selection and implementation (Val och implementering av modell)

###### 6.1.1 Theories and assumptions (Teorier och antaganden)
[Describe the possible designs and why this one was chosen. Base the choice on proportionality to the BWRA, the products, customers and volumes. Describe the systems considered and rejected, with reasons. List the key assumptions.]

[CRC: typology of dominant-factor, score-adding, risk-weighted and AI/ML models. See `references/crc-risk-factors.md`.]
[TM: rule-based versus behaviour-based; need for real-time monitoring; why manual monitoring alone is insufficient. See `references/tm-scenarios.md`.]
[Screening: name matching with fuzzy logic, lists, screening points. See `references/screening.md`.]

Example: "Given the nature of {{client_short}}'s products, which are not transaction-intensive and do not enable fast transfers to multiple parties, and the number of customers and transactions, {{client_short}} considers that relying solely on manual monitoring would be insufficient, while a behaviour-based model would require data and resources that are not proportionate to the risk. A rule-based model is therefore assessed as sufficient to address the risks identified in the BWRA."

*Table 5: Key assumptions*

| # | Assumption | Type (expert / analytical) | Testing evidence | Related control |
|---|---|---|---|---|
| A-01 | [e.g. Deviating transactions can be identified against what is reasonable for the purpose and nature of the product] | Expert | [Test or analysis reference] | [Control] |

###### 6.1.2 Prerequisites for implementing the model (Förutsättningar vid implementering av modellen)
[When the model was implemented, the implementation plan, the input used (own experience, supplier recommendation, external experts), phasing, data that was missing at implementation and how it was handled, and the transition of the existing customer stock.]

###### 6.1.3 Test process (Testprocess)
[Test plan covering all model inputs, coding and outputs, with planned user acceptance and operational test cases. Describe the design of the test cases (per risk class and customer category / per scenario / name-variation set), the test environment and how closely it mirrors production, and the iteration loop.]

Example (CRC): "Test cases were designed for each risk class (Low, Normal, High, Very high) for natural and legal persons, based on industry and internal experience. Customers were given different combinations of attributes, and the scoring was adjusted until the classes reflected the intended risk. The resulting calibration was then run against the full customer base to identify deficiencies not visible in the test cases and to estimate the expected distribution, and individual customers in each class were sample-checked."

###### 6.1.4 Test results (Testresultat)
[User acceptance, functional implementation testing and results. If problems were found, give evidence that they have been fixed. Summarise the results in the document; do not only refer to a ticket system.]

*Table 6: Summary of test results*

| Test ID | What was tested | Expected result | Actual result | Deviation and action | Status |
|---|---|---|---|---|---|
| T-01 | | | | | |

###### 6.1.5 Sensitivity analysis (Känslighetsanalys)
[How the model and scenarios were tested for different parameters and threshold values, including missing data. Describe the steps, who took part (workshops), the tools, and the findings: which factors drive the outcome. If no structured analysis has been made, say so and give a date.]

##### 6.2 Model structure (Modellens uppbyggnad)
[How the model, risk factors or scenarios and thresholds are structured, and the link to the risk factors and the system. CRC: categories, weights, scoring logic, complementary methods, class bands. TM: scenario types, segmentation, scoring of alerts, run frequency. Screening: lists, screening points, frequency, matching categories.]

*Table 7: Risk classes and score bands [CRC]*

| Risk class (Riskklass) | Risk score (Riskpoäng) | Consequence for CDD (Konsekvens för kundkännedom) |
|---|---|---|
| Low (Låg) | [band] | [Simplified measures permitted; KYC refresh every [x] years] |
| Normal | [band] | [Standard measures] |
| High (Hög) | [band] | [Enhanced measures; approval per risk appetite statement] |
| Very high (Mycket hög) | [band] | [Enhanced measures; senior approval] |
| Unacceptable (Oacceptabel) | [band] | [No relationship; existing relationship terminated] |
| Undetermined (Obestämd) | n/a | [Insufficient KYC; relationship cannot be established or continued until data is obtained] |

##### 6.3 Model scope (Modellens omfattning)
[What the model covers: customers, products, markets and channels, including partner-channel customers. Say what is handled manually or by another system, with a reference to the BWRA or to routines.]

##### 6.4 Model limitations (Modellens begränsningar)
[Built-in limitations, in three layers, each with its mitigation.]

###### 6.4.1 General limitations (Allmänna begränsningar)
Example: "There are general limitations for all [model type] models. The most important condition for a functioning [model] is that all appropriate data is fed through the system and analysed appropriately; limitations of input data are therefore described in section 8. Furthermore, the analysis can only be effective if the correct risks have been identified and appropriate measures taken. The effectiveness of the Model therefore depends on the quality of the BWRA and on the expertise of the AML specialists."

###### 6.4.2 System limitations (Systembegränsningar)
[E.g. which factors can be weighted, scenario parameters that are unavailable (percentage instead of absolute amounts, number of counterparties), lack of real-time capability, dependence on the supplier for change.]

###### 6.4.3 Model-specific limitations (Modellspecifika begränsningar)
[E.g. fixed thresholds that miss activity just below them, products not covered, missing data points, qualitative rather than quantitative calibration.]

*Table 8: Limitations and mitigations*

| # | Limitation | Layer (general / system / model) | Consequence | Mitigation or compensating control | Planned remediation (section 10) |
|---|---|---|---|---|---|
| L-01 | | | | | |

##### 6.5 Manual correction (Manuell korrigering)
[When manual correction or override may be needed, who may propose it, who approves it, how it is documented, its time limit, and who is informed (the validation function). Give examples.]

Example (CRC): "A manual correction may be necessary, for example if risk factors not covered by the Model are identified during customer due diligence, if input data is incorrect, or if the Model places too much or too little weight on a factor in the individual case. Manual corrections shall be made sparingly, only by authorised staff, with a documented justification attached to the customer file, and are subject to approval by the SAE or the person to whom the SAE has delegated this."

Example (TM): "Manual override refers mainly to the temporary exclusion of certain scenarios for certain customers. Every override shall be justified and documented in the customer file, shall be time-limited, and is decided by the SAE. All overrides are included in the basis for the evaluation of scenarios."

##### 6.6 Model evaluation (Modellutvärdering)

###### 6.6.1 Expected results (Förväntat resultat)
[Expected risk class distribution / alert volumes / alert-to-report ratios / hit ratios, linked to the objective in section 2. State the margin of error and any transition effects.]

Example (CRC): "{{client_short}} expects the Model to assess the overall ML/TF risk of each customer. The weighting shall not be unduly influenced by one factor, nor lead to a situation where it is impossible for a business relationship to be classified as high risk. A well-functioning model is indicated by relatively more alerts and FIU reports in higher risk classes."

###### 6.6.2 Responsibility and performance (Ansvar och utförande)
[Who analyses risk coverage on an ongoing basis, the link to BWRA updates (an updated BWRA triggers re-evaluation of the Model), the annual testing, and reporting to the validation function and to management.]

###### 6.6.3 Metrics (KPI/KRI) (Mätvärden)
[Metrics followed up continuously, grouped as system functionality, operational functionality, and assumptions and design. See `references/evaluation-metrics.md`.]

*Table 9: KRI tolerance bands*

| Metric (KRI) (Mätvärde) | Target (Mål) | Low impact (Låg påverkan) | Medium impact (Medel påverkan) | High impact (Hög påverkan) | Action required (Åtgärd krävs) |
|---|---|---|---|---|---|
| [Share of high-risk customers] | [x %] | [± 0–2 pp] | [± 2–4 pp] | [± 4–6 pp] | [± >6 pp] |
| [FIU-reported customers: share in high risk] | [50 %] | [40–50 %] | [30–40 %] | [20–30 %] | [<20 %] |
| [Error assessment Normal → High (sample)] | [5 %] | [5–10 %] | [10–15 %] | [15–20 %] | [>20 %] |
| [Error assessment High → Normal (sample)] | [5 %] | [5–10 %] | [10–15 %] | [15–20 %] | [>20 %] |

Example: "Depending on the assessed degree of impact of a deviation, a decision on action to move closer to the target is taken."

###### 6.6.4 Suitability (Lämplighet)
[A reasoned conclusion on whether the model is appropriate for the exposure and risk, linked to limitations (6.4), gaps (7) and future development (10). Use one of: acceptable / acceptable with reservations / not acceptable. Do not use supplier reputation as evidence.]

Example: "{{client_short}} assesses the overall suitability of the Model as acceptable with reservations. Based on its rule coverage, the Model meets the basic requirement to detect activities that deviate from what {{client_short}} has reason to expect. However, not all products are covered and the Model is not yet linked to customer risk classification (section 7B.4). A remediation plan is set out in section 10. The assessment will be revisited when the remediation is complete or the BWRA is updated."

---

#### 7A Risk factors (Riskfaktorer) [CRC variant]

##### 7A.1 Selection of risk factors (Val av riskfaktorer)
Example: "The BWRA forms the basis for the customer risk assessment. The risks identified in the BWRA, together with the information available on the individual customer, make up the customer's risk profile. Risk factors in the EBA ML/TF risk factor guidelines have also been considered."

##### 7A.2 Scoring of risk factors (Poängsättning av riskfaktorer)
[How scores and weights were set and on what basis. The score scale and its interpretation (risk-reducing, low, normal, elevated, high, very high). The treatment of missing data. That changes are simulated in the test environment before implementation.]

*Table 10: Weighting of risk categories*

| Risk category (Riskkategori) | Weight (Vikt) | Rationale (Motivering) |
|---|---|---|
| Customer (Kund) | [ ] | [BWRA exposure; history of incidents] |
| Country and geography (Land och geografi) | [ ] | |
| Products and services (Produkter och tjänster) | [ ] | |
| Distribution channel (Distributionskanal) | [ ] | |
| Purpose and nature (Syfte och art) | [ ] | |
| **Total** | **1.00** | |

*Table 11: Complementary risk methods*

| Risk factor | Method (minimum / exact / add-on / risk-reducing / unacceptable / undetermined) | Value | Rationale |
|---|---|---|---|
| [PEP/RCA] | [Minimum – mandatory high] | | |

##### 7A.3 Included risk factors (Inkluderade riskfaktorer)
[One subsection per factor, grouped by category: a short description of why the factor indicates risk, then a table. Exact values may sit in Appendix B.]

###### 7A.3.x [Risk factor name]
[Why it indicates risk, data source, update frequency.]

*Table 12: Risk level and score for risk factor "[name]"*

| Risk factor option (Riskfaktor) | Risk level (Risknivå) | Risk score (Riskpoäng) |
|---|---|---|
| [Option] | [Low / Normal / High / Unacceptable / Risk-reducing] | [ ] |
| Score when data is missing (Riskpoäng vid saknad data) | | [Score / Undetermined / Not applicable – data always present] |

##### 7A.4 Excluded risk factors and gaps (Uteslutna riskfaktorer)
[BWRA risk factors not in the model, why they are excluded, the manual measure that compensates (e.g. in the KYC routine), and any plan to include them.]

*Table 13: Excluded risk factors*

| BWRA risk factor | Reason for exclusion | Compensating measure | Planned inclusion (date) |
|---|---|---|---|
| | | | |

---

#### 7B Risks to manage through transaction monitoring (Risker att hantera genom transaktionsövervakning) [TM variant]

##### 7B.1 Overview (Översikt)
[The BWRA risks and modi assessed as appropriate to manage through TM, mapped to the scenario types used.]

*Table 10: Risks and scenario types*

| Risk / modus (Risk / modus) | Product (Produkt) | Scenario type(s) (Scenariotyp) | Scenario ID(s) |
|---|---|---|---|
| [e.g. Early repayment with funds of unclear origin] | [Consumer loan] | [Early repayment; transaction amount] | [SC-01] |

##### 7B.2 Monitoring scenarios (Monitoreringsscenarier)

###### 7B.2.1 Monitoring method (Övervakningsmetod)
[How monitoring works:
- the methods used: typology, deviation from KYC, deviation from history, deviation from peer group;
- for which products each method is used;
- thresholds, segmentation and alert scoring;
- run frequency, and real-time versus batch.]

###### 7B.2.2 Design and optimisation process (Design- och optimeringsprocess)

###### 7B.2.2.1 Design of new scenarios (Design av nya scenarier)
[Sources of the need: BWRA, investigations, FIU, authorities, industry, supplier. Formulation of the scenario with a balanced number of false positives. Customer-base analysis. Test run and above-the-line/below-the-line testing. Approval, implementation and logging.]

###### 7B.2.2.2 Optimisation of existing scenarios (Optimering av befintliga scenarier)
[Annual formal evaluation plus ongoing work. Scenarios with an alert-to-report ratio significantly below or above target are evaluated. Testing in a test environment. Documentation in the scenario log.]

###### 7B.2.2.3 Deactivation of existing scenarios (Inaktivering av befintliga scenarier)
Example: "A scenario that is assessed as ineffective shall be phased out. If it is not immediately replaced by a new scenario addressing the same risk, the decision shall be approved by the SAE, and any remaining risk shall be managed by other appropriate means. Deactivation is documented in the optimisation and adjustment log."

##### 7B.3 Active scenarios (Aktiva scenarier)
[List of all active scenarios with purpose, risk covered, threshold values, and appropriate initial investigative measures. Detailed settings may sit in Appendix B. One subsection per scenario.]

*Table 11: Active scenarios*

| Scenario ID | Scenario name | Customer segment / product | Purpose | Threshold(s) |
|---|---|---|---|---|
| SC-01 | | | | |

###### 7B.3.x Scenario [ID]: [name]
[Risk and typology addressed, with BWRA reference. Scenario logic. Threshold and its rationale. Expected volume and alert-to-report ratio. Known limitations. Initial investigative measures.]

*Table 12: Typologies and red flags for scenario [ID]*

| Typology / product / risk factor (Typologi / produkt / riskfaktor) | Red flags (Varningssignaler) |
|---|---|
| | |

##### 7B.4 Gaps in scenarios (Luckor i scenarier)
[Known behaviours or risks not covered, why (data, system, complexity), how they are managed meanwhile (manual analysis, KYC controls), and the remediation plan.]

---

#### 7C Risks to manage through screening (Risker att hantera genom screening) [Screening variant]

##### 7C.1 PEP/RCA (PEP/RCA)
[Risk description. Definition per national law. Post-function period. RCA definition. How a PEP/RCA status affects the risk class and the EDD.]

##### 7C.2 Sanctions risk factors and exposure (Översikt sanktionsriskfaktorer/exponering)
[Sanctions regimes applied (mandatory EU and national; others per risk appetite). Circumvention risk. Freezing and reporting obligations.]

###### 7C.2.1 Customer database screening (Kunddatabasscreening)
[Who is screened (customers, beneficial owners, representatives), when (before on-boarding / real time / daily), and re-screening on list or customer data change.]

###### 7C.2.2 Payment screening (Betalningsscreening)
[Which payments and fields are screened, real-time or not, and the stop procedure.]

###### 7C.2.3 Fuzzy matching logic (Fuzzy matchning/logik)
[Matching method, thresholds, match categories, identifiers used, auto-closure rules with rationale, and false-positive suppression and re-alert conditions.]

*Table 10: Match categories*

| Match category (Träffkategori) | Description (Förklaring) | Handling (Hantering) |
|---|---|---|
| [0 – identifier match] | | |
| [1 – full primary name] | | |

##### 7C.3 Screening lists (Screeninglistor)
[Lists used, their source and update frequency, coverage gaps, and the assessment of list-quality risk.]

##### 7C.4 IP address and geolocation controls (IP-adressblockering) [if applicable]

---

#### 8 Data (Data)

##### 8.1 Data input (Indata)
[Sources, data points and frequencies; where data is stored; which party compiles and sends each import file.]

*Table 14: Data input*

| Parameter / data point (Parameter) | Data source (Datakälla) | Database (Databas) | Update frequency (Uppdateringsfrekvens) | Responsible (Ansvarig) |
|---|---|---|---|---|
| | | | | |

##### 8.2 Data output (Utdata)
[What output is generated (risk score and class / alerts / possible matches), where it is handled and stored, where investigations are documented, and to which systems it is delivered.]

##### 8.3 Data quality assurance (Kvalitetssäkring av data)
[How completeness and accuracy are ensured, for example: checksums or record counts per batch with acknowledgement files; file specification validation; alerts on failed transfers; daily reasonableness checks of volumes and alert spread; import log review; annual sample testing of input tables against source systems; who acts on incidents.]

##### 8.4 Data limitations (Databegränsningar)
[Known limitations, e.g. KYC data not transferred, free-text fields, customers with several products treated as separate customers, transactions excluded from a source, data not refreshed automatically.]

##### 8.5 Data adjustments (Datajusteringar)
[Mappings and transformations made to fit the model, why they were made and their effect. Example rule: "Any change to data or its interpretation shall first be implemented and tested in the test environment."]

##### 8.6 Flow chart (Flödesschema)
[Figure: data sources to final results.]

#### 9 Interactions with and dependencies on other models (Interaktioner med/beroenden av andra modeller)

[Upstream and downstream models and how they interact: automated or manual, and in which direction. If there are none, state it explicitly.]

Example: "The Model is affected by the PEP and sanctions screening model, as PEP/RCA and sanctions status affect the customer's risk score. The customer risk class is used in [n] monitoring scenarios to lower thresholds for higher-risk customers. Results from investigations and FIU reports feed back into the risk class and into the next BWRA."

#### 10 Future development (Framtida utveckling)

[Known future development, linked to the BWRA, limitations (6.4), gaps (7), suitability (6.6.4) and validation findings. Give each item an owner and a date.]

*Table 15: Planned development*

| # | Development item | Addresses (section / finding) | Owner | Planned date |
|---|---|---|---|---|
| F-01 | | | | |

#### 11 Lifecycle management (Livscykelhantering)

[Reference to the MRM instruction, and a figure of the model lifecycle: development → approval → implementation → use and ongoing monitoring → validation → change → retirement.]

#### 12 Information security (Informationssäkerhet)

Example: "Good model risk management includes keeping the Model's design strictly confidential. Information on which settings generate alerts shall not be disclosed to anyone who does not need it to perform their work, and in no case to customers. The SAE and [validation function] jointly determine which employees have access to details of the Model's design. The risk management and internal audit functions always have access to the information they need to evaluate the Model. The reason for this confidentiality is that customers who know the design of the Model could adapt their behaviour to avoid detection."

#### 13 Documentation and record keeping (Dokumentation)

[When the document is updated. Related documents (risk factor specification, scenario log, routines). Retention. Storage. Where changes are recorded.]

Example: "Information and documentation on model specifications and outcomes shall be stored for at least five years [VERIFY REFERENCE], securely and in a way that makes it easily accessible and identifiable. Changes to the Model and its settings are documented in the optimisation and adjustment log (Appendix A)."

---

#### Appendix A Optimisation and adjustment log (Optimerings- och justeringslogg)

Example: "Optimisation and adjustment of the Model can be carried out, for example, based on a validation or result analysis, changes in legal requirements, or changes in the BWRA. A problem statement is formulated, and a situation-based test process is designed to present a solution. The solution is presented by the model owner's delegate and decided by the SAE, after which it is implemented. Each step is documented in the log below."

*Table A1: Optimisation and adjustment log*

| Problem statement, date (Problemformulering, datum) | Problem description (Problembeskrivning) | Test process (Testprocess) | Suggested solution (Föreslagen lösning) | Presented, date (Presenterad, datum) | Adopted, date (Beslutad, datum) | Implemented, date (Implementerad, datum) |
|---|---|---|---|---|---|---|
| | | | | | | |

#### Appendix B Specification (Specifikation) [risk factor specification / scenario log / list and matching settings]

[Exact configuration, in a restricted workbook if the client requires it. Columns are in SKILL.md section 8.]

#### Appendix C Test cases and results (Testfall och resultat)

*Table C1: Test cases*

| Test ID | Customer category / scenario | Attributes / input | Expected result | Actual result | Deviation | Retest date |
|---|---|---|---|---|---|---|
| | | | | | | |

#### Appendix D BWRA coverage mapping (Täckning mot allmän riskbedömning)

*Table D1: BWRA coverage*

| BWRA risk / typology / red flag | Model element (factor / scenario / list) | Coverage (Yes / Partly / No / Other control) | Compensating control | Comment |
|---|---|---|---|---|
| | | | | |

[Then list model elements that cannot be traced to the BWRA (reverse gap).]

## Reference catalogues (inlined)

### Reference catalogue: change-management.md

Used by: `model-documentation` (step 11; template Appendix A). Sw. *förändringshantering*.

##### 1. Significant versus other changes

**Significant change** (Sw. *väsentlig förändring*), the team's standard definition: a change that affects the underlying purpose of the model, has a significant impact on the model's assumptions, design or data input, or otherwise significantly affects the model's output.

| Change | Typically | Consequence |
|---|---|---|
| New model, or model replaced (new system) | Significant | Full documentation, validation before go-live, adoption by SAE |
| New risk category, change of model type (e.g. score-adding → weighted), new ML component | Significant | Validation before implementation |
| New or removed scenario or risk factor; change of weights or class bands | Significant, unless the MRM instruction defines a materiality threshold | Change validation request; validation; SAE decision |
| Threshold tuning within the documented rationale and tested range | Normally not significant | Test, log, SAE or delegate decision |
| Update of input lists defined as model inputs (country risk list, industry list) under an approved process | Not significant if the method is unchanged | Log; a defined latency (e.g. effective within one month) is acceptable if documented |
| New data source, or a change in data mapping that affects output | Significant if output is affected | Test in test environment first; validation as needed |
| Temporary override or deactivation (e.g. extraordinary alert flows) | Not a model change, but must be controlled | SAE decision, time limit, validator informed, log |
| Editorial update of the documentation | Not significant | Version table |

When in doubt, treat a change as significant. A significant change also triggers reassessment of the model risk and an update of the inventory.

##### 2. Workflow (team standard)

1. **Trigger:** validation or result analysis, BWRA update, regulatory change, new product or system, investigation feedback, or a data issue.
2. **Problem statement:** what is wrong or missing, and its background.
3. **Situation-based test process:** test design in a test environment that mirrors production, including above-the-line and below-the-line testing (TM), a full-base simulation (CRC), or a name-variation test (screening).
4. **Suggested solution:** presented by the model owner's delegate (AML specialist or AFC lead) to the model owner.
5. **Change validation request:** for significant changes, the form in section 3 is sent to the validation function or the AML/CFT forum.
6. **Decision:** the SAE adopts or rejects. Some clients give the compliance or risk function a veto on deactivation.
7. **Implementation:** under the client's release and change routines, with acceptance by the model owner before production.
8. **Log and update:** the optimisation and adjustment log, the model documentation (version table), the inventory and, if relevant, the MRA.
9. **Post-implementation review:** compare the outcome with the expected effect at the next evaluation.

##### 3. Model change validation request form (team template)

| Field | Content |
|---|---|
| Model Change Validation Request Form | Date for request [YYYY-MM-DD] |
| Summary | Summary of key aspects of the suggested change |
| Model in scope | [Model name, model ID] |
| Rule name / Risk factor · Change type · Risk type | [Name] · [Added / Removed / Tuned] · [ML / TF / Other] |
| Typologies | Refer to typologies in the typology library or the BWRA |
| Risk factors | Refer to risk factors in the BWRA |
| Alternative risk factors / parameters / rules | Other factors, parameters or rules that cover the same factors and typologies, partly or fully |
| Historical performance | Relevant performance indicators, e.g. false-positive ratio (both SARs and cases that went to further investigation and EDD) |
| Change description | Background (e.g. regulatory), intended purpose, objectives and target results; how the change affects the model's theoretical basis, general design or assumptions |
| Suggested date for implementation | [YYYY-MM-DD] |
| Appendices | Supporting documentation: initial logic, assumptions, limitations, testing |
| Request prepared by | [Model owner's delegate: role] · [Date] |
| SAE approval | [SAE] · [Date] |
| **AML/CFT forum: period for validation** | When validation may be performed; deadline for report and approval · [Date] |
| **AML/CFT forum: conclusion** | Key comments and assessment of impact · [Date] |
| **AML/CFT forum: recommendation** | Recommendation based on the validation outcome (use / do not use); refer to the validation report · [Date] |

##### 4. Optimisation and adjustment log (team template)

| Problem statement, date | Problem description | Test process | Suggested solution | Presented, date | Adopted, date | Implemented, date |
|---|---|---|---|---|---|---|

Recommended additions for TM-heavy clients: Scenario/factor ID; Before/after parameter values; Measured alert-to-report ratio before/after; Change significant (Y/N); Validation reference.

A simpler variant (Date | Section | Description of change) is acceptable only for low-tier models.

## Placeholders

The blueprint text uses these placeholders. Fill each one from the request brief or the inputs. If a value is not known, write `[DATA NEEDED: …]` in the deliverable; never invent it, and never leave a `{{…}}` placeholder in a finished deliverable.

- `{{client_name}}` — the client's legal name (brief: client.legal_name)
- `{{client_short}}` — the defined term for the client, e.g. "the Company" (brief: client.defined_term)
- `{{date}}` — the deliverable date (brief: engagement.date)
- `{{jurisdiction}}` — the jurisdiction(s) (brief: engagement.jurisdictions)
- `{{language}}` — the output language (brief: engagement.output_language)
- `{{version}}` — the document version (brief: engagement.version)
