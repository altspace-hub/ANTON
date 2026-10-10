# FCP blueprint: Model validation report

Blueprint `model-validation-report` v1.1 (stable) from the FCP blueprint library, as ANTON skill `fcp-bp-model-validation-report`. Produces an independent validation report for AML/CTF models (transaction monitoring, PEP and sanctions screening, customer risk classification, and a business-wide risk assessment treated as a model), together with the documentation and data request, the validation work programme, the gap-analysis appendix (mapping against the business-wide risk assessment, national AML law and EBA guidelines) and the outcome-test appendix. Uses the four-area method (conceptual design and method, implementation risk, input data risk, output data risk) and a four-colour grading scale where each key area takes its worst sub-area result. Use for initial (full) or ongoing validations, for a first-time validation of an undocumented model, and when a client asks for a second-line style review of a monitoring, screening or risk-rating model.

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

The output format **Model validation report (blueprint)** (`bp-model-validation-report`) carries this blueprint's section order; selecting it attaches this skill. When another output format is selected, that format sets the layout and its own scale; keep this blueprint's method, evidence and wording rules within it.

## How references in this skill map to ANTON

The blueprint text points at files of the library it came from. In ANTON:
- `_core/house-standards.md`, `_core/glossary.md`, `_core/request-context.md`, `_core/output-formats.md` → the skill **FCP blueprint: house standards** (`fcp-bp-house-standards`). Attach it with this one for the full house rules; the essentials are in "Gap markers" above.
- `_core/risk-scales.md` → "Risk and control labels" and "Scale mapping" in the house standards skill (`fcp-bp-house-standards`), as wording only. Its matrix and aggregation rules belong to the risk-assessment blueprints and never override a score ANTON or the module supplies.
- `template.md` → the section "Deliverable template" below.
- `references/…` inlined below: `test-procedures-bwra.md`.
- The other `references/…` catalogues (`assessment-areas.md`, `data-request.md`, `interview-question-bank.md`, `rating-scale.md`, `test-procedures-crc.md`, `test-procedures-screening.md`, `test-procedures-tm.md`, `work-programme.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Method and quality bar (blueprint sections 1–14)

Load this blueprint together with `_core/house-standards.md`, `_core/request-context.md` and `_core/output-formats.md`. This file only repeats a house rule when validation work needs a sharper version of it.

Catalogues used by this blueprint are in `references/`:

| File | Content |
|---|---|
| `rating-scale.md` | Traffic-light scale, worst-result aggregation, coverage scale, review levels |
| `assessment-areas.md` | The four areas, their sub-areas, expectation texts, validation-team assessment points and anchors |
| `test-procedures-tm.md` | Transaction monitoring: gap-analysis mapping set, scenario validation, outcome ratios, replication |
| `test-procedures-crc.md` | Customer risk classification: mapping set, conceptual, implementation, input and output tests |
| `test-procedures-screening.md` | PEP and sanctions screening: mapping set, list management, name-matching and threshold tests |
| `test-procedures-bwra.md` | Business-wide risk assessment treated as a model: adapted areas, benchmark against EU and national risk assessments |
| `data-request.md` | Kick-off checklist, documentation and data request per model type, expected documentation list, email text |
| `interview-question-bank.md` | Interview questions per model type |
| `work-programme.md` | Layout of the validation work programme workbook and the outcome-ratio workbook |

### 1. Purpose and outcome

A validation report gives an independent, evidence-based opinion on whether an AML/CTF model is fit for its purpose, meets the legal and functional requirements placed on it, and where it must be improved. A "model" here means a quantitative method, system or approach that applies statistical, economic, financial or mathematical theories, techniques and/or assumptions to process input data into quantitative estimates. Every model carries model risk because no model represents reality perfectly; validation is the control that reduces that risk.

**Readers.** The model owner (usually the head of AML/CTF or the first-line function that runs the model), the compliance and risk control functions, the body that signs off validations under the client's MRM framework (often a risk or AML committee), and, through them, senior management, the board and the supervisor. The report must stand up if handed to the supervisor.

**Decisions it enables.** Whether the model can continue to be relied on; which deficiencies must be fixed first and by when; whether model documentation, scenarios, thresholds, risk factors, lists or data feeds must change; and whether the business-wide risk assessment (BWRA) itself needs updating. A validation finding drives a model change (house standard 1.4).

**Outcome.** A report with a one-page summary table rating each of the four key areas, sub-area tables that state the expectation, the status found and the recommendation, tests that show the evidence, and appendices with the full gap analysis and outcome tests.

### 2. When to use / when not to use

**Use when:**
- A model used for transaction monitoring (TM), PEP and sanctions screening, customer risk classification (CRC) or the business-wide risk assessment must be validated before first use, after a significant change, or periodically.
- A client wants an initial (full) validation, or an ongoing validation that follows up a previous report.
- A client's own validation team (for example compliance and risk control jointly) needs a work programme and report structure, with {{firm_name}} supporting or performing parts.
- The model is a vendor solution, an in-house build, or a set of manual rules that in practice works as a model.

**Do not use, use instead:**
- Writing or improving the model documentation itself, the model inventory or model tiering → `model-documentation`. If {{firm_name}} wrote the model documentation, independence is impaired: say so to the requester before accepting the validation.
- Producing the business-wide risk assessment → `aml-ctf-risk-assessment`. This blueprint only validates a BWRA when it is run as a scoring model.
- Assessing the whole AML/CTF framework against regulation (policies, routines, training, governance) → `gap-analysis` or `compliance-review-report`.
- Assessing sanctions exposure rather than the screening model → `sanctions-risk-assessment`.
- Fraud detection or credit models: the four-area method transfers, but the mapping sets and ratios here do not. Treat as `draft` work and mark assumptions.

### 3. Inputs

**Minimum to start** (in addition to the general minimum in `request-context.md`):

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| Model type(s) in scope (TM, CRC private/corporate, screening, BWRA) | Decides sub-area wording, mapping set and tests | Request, kick-off | Ask. Never guess. |
| Validation type: initial (full) or ongoing | Decides which assessment points and tests apply | Request; previous validation report | Ask; if a previous report exists, assume ongoing and mark `[ASSUMPTION]` |
| Client's institution type and licence | Background paragraph, applicable law, sectoral EBA guideline | Brief | `[DATA NEEDED: licence type]` |
| Report language and template (ours or the client's) | Structure and terminology | Kick-off | Default: {{language}}, our structure |
| Business-wide risk assessment (latest approved) | Basis of the gap analysis; the model must reflect it | Client | Cannot assess conceptual design fully; rate Documentation/Method as not assessable and say why |
| Model documentation (any form) | Basis for every conceptual sub-area | Client | Request; if none exists, that is itself a finding (usually Red for Documentation) |

**For a complete deliverable:**

| Input (all from the client unless stated) | Why it is needed | If missing |
|---|---|---|
| MRM / validation instruction | Client's own requirements and sign-off route | Assess against our expectations only; note it |
| Override procedures and log | Override sub-area | Ask whether overrides exist; finding if undocumented |
| Test documentation (IT, UAT, data quality), test plan | Implementation risk | Rate on available evidence; note limitation |
| User manual; data-flow process map | Model use; input data risk | Finding if none |
| Scenario list with parameters (TM); scoring model and parameter lists (CRC); list set-up and matching settings (screening) | Method, selection sub-areas | `[DATA NEEDED]`; limits testing depth |
| Outcome statistics for one year | Output risk tests | Output risk assessed qualitatively; state in Limitations |
| Replication or sample data; test access for name screening | Quantitative tests | State in Limitations that production testing was not possible |
| Previous validation report and action status | Ongoing validation | Treat as initial validation |
| Interviews (model owner, developers, analysts, IT) – agreed at kick-off | Practice versus documentation | Rate on documents only; say so |

Full request lists: `references/data-request.md`.

### 4. Regulatory and professional anchors

State the regulatory status date in the report ("Regulatory status as of {{date}}") and remind the reader that the EU AML package changes the baseline. Always check references against the current consolidated texts.

**EU baseline**
- Directive (EU) 2015/849 (AMLD), as amended: risk-based policies, controls and procedures; business-wide risk assessment (Article 8); CDD including ongoing monitoring (Article 13); EDD for PEPs (Article 20). It sets no explicit model validation regime; the need to validate follows from the requirement that monitoring, risk classification and screening are effective and risk-based. `[VERIFY REFERENCE]`
- Regulation (EU) 2024/1624 (AMLR), Directive (EU) 2024/1640 (AMLD6) and Regulation (EU) 2024/1620 (AMLA). The AMLR applies from 2027 `[VERIFY REFERENCE: application date]` and will replace much of the national layer. Check whether AMLR provisions or AMLA standards and guidelines add explicit expectations on models and automated systems. `[VERIFY REFERENCE]`
- EBA/GL/2021/02 (ML/TF risk factors, as amended): Title I on risk assessment and monitoring, and the Title II sectoral guideline matching the client's business.
- For screening: the two EBA guidelines on internal policies, procedures and controls to ensure the implementation of Union and national restrictive measures (EBA/GL/2024/14 and EBA/GL/2024/15) – one general, one for payment service providers and crypto-asset service providers under Regulation (EU) 2023/1113 `[VERIFY REFERENCE: confirm which number applies to which]`; Regulation (EU) 2023/1113 (transfers of funds and crypto-assets); EU restrictive measures regulations.
- The European Commission's supranational risk assessment (SNRA), the benchmark for a BWRA model.

**National layer through {{jurisdiction}}.** Identify the national AML act's requirements on monitoring, customer risk profiles and the BWRA; any explicit national rule on model risk management and validation; supervisory statements and enforcement decisions on models; the national risk assessment. Without explicit model rules, derive expectations from the monitoring and risk-based-approach requirements and say so.

*Sweden (worked example; {{supervisor}} = Finansinspektionen):*
- Lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism (PTL). The team's templates cite ch. 6, s. 1, second para. (routines for model risk management when models are used for risk assessment, risk classification and monitoring) `[VERIFY REFERENCE]`; ch. 4, s. 1 (monitoring); ch. 2, ss. 1–5 (BWRA, customer risk profile, low/high-risk factors); ch. 3 (CDD, PEPs).
- FFFS 2017:11, 6 kap. 14 § ff. `[VERIFY REFERENCE: check section and paragraph numbers]`: MRM routines describe the theory and assumptions behind the design and how changes are documented; fitness for purpose is ensured through validation that checks that parameters and data are correct and complete and assumptions appropriate and relevant; validation before first use and at significant changes; written report. `[VERIFY REFERENCE: the regulations have been amended]`
- Lag (1996:95) om vissa internationella sanktioner `[VERIFY REFERENCE: check for replacement]`. The team's templates treat EBA/GL/2021/02 as general guidance (*allmänna råd*) in Sweden `[VERIFY REFERENCE]`. Supervisory enforcement decisions criticising AML model risk management are cited generically, never with firm names.

**Professional and industry anchors**
- US Supervisory Guidance on Model Risk Management (SR 11-7 / OCC 2011-12) and OCC Bulletin 2000-16, as concretised for AML models in the ACAMS guidance on AML model validation `[VERIFY REFERENCE: title and year]`. Standard justification: originates outside the EU but is the most developed methodology for validating risk models; both regimes rest on the FATF Recommendations; the same foundation is used for credit and capital models; proportionate.
- FATF Recommendations 1, 6–7, 10, 12 and 20; FATF red-flag indicators.
- Wolfsberg Group: PEP Guidance (2017), Sanctions Screening Guidance (2019), Demonstrating Effectiveness (2021), statement on effective monitoring for suspicious activity `[VERIFY REFERENCE]`.

Register: "shall" only for binding law; "should" for EBA guidance, supervisory expectations and industry practice; "we assess" for the validator's opinion (house standard 1.5).

### 5. Method

The method rests on four assessment areas: **(i) conceptual design and method, (ii) implementation risk, (iii) input data risk and (iv) output data risk**. The regulation on validation is very general; the four areas concretise it with established MRM practice. The method is proportionate: depth follows the review level (A detailed, B mid-range, C high-level; see `references/rating-scale.md`).

1. **Kick-off meeting** (*uppstartsmöte*). Confirm model(s) and type (vendor or in-house); initial or ongoing validation; report language; the client's own template if any; deadline; model owner and report recipient; whether manual overrides are used; secure transfer of material. Book interviews early. *Why:* most delays come from late data and late interviews. *Judgement:* if {{firm_name}} built or documented the model, raise independence now.
2. **Documentation and data request** (`references/data-request.md`) the same day, with the one-year statistics period stated as dates and pseudonymised data where possible. Allow about two weeks' lead time `[TO CONFIRM]`. Ask for replication data only if the review level and timeline allow its use.
3. **Set up the work programme** (`references/work-programme.md`): model-type sheets, review level with justification, pre-filled expectations; for ongoing validations, previous findings first.
4. **Register and analyse the documentation** against the expected documentation list, noting where each item was found. If a sub-area cannot be answered, request the missing item or record the gap under that sub-area; never fill it from assumptions.
5. **Interviews and walkthroughs** with the model owner, developers and AML analysts (`references/interview-question-bank.md`). A short system walkthrough (alert queue, case handling, override function) is worth more than a long document; the report must say whether a rating rests on practice or documentation.
6. **Gap analysis (conceptual design tests).** (a) BWRA → model: select the risk factors and typologies that by their nature belong in this model, mark Yes/Partly/No, and list model components with no BWRA link; (b) national AML law; (c) relevant EBA guidelines; plus industry practice and benchmarks for CRC and Wolfsberg guidance for screening. Tag factors that belong in another control. Counts go in the body, detail in Appendix 1. *Judgement:* the mapping does not validate the BWRA; a model can cover every factor of an incomplete BWRA. Flag BWRA gaps separately.
7. **Assess each sub-area** against `references/assessment-areas.md`: status with evidence, rating, factual comment, recommendation. Ongoing validations focus on changes and remediation since the last validation.
8. **Implementation risk tests:** the three standard questions (test plan and training; user, code and input-data tests; data tests). For a long-established model assess change management and mark original-implementation items N/A with reason. At level A, re-perform (recalculate a sample or review code against documentation).
9. **Input data risk tests:** data flow from source to model, transfer controls, reconciliations, control logs, missing values.
10. **Output data risk tests** per model type (`references/test-procedures-*.md`). *Judgement:* interpret ratios against the client's product risk profile and volumes; never compare with an "industry benchmark" without a verifiable source.
11. **Rate and aggregate:** worst result per key area; a detailed finding (*Iakttagelse*) for each Orange or Red sub-area; every rating traceable to a test, document or interview.
12. **Write** sections 2–5, the appendices, section 6, section 1 (limitations reflecting what was actually possible), and the summary last.
13. **Quality review:** four-eyes review of ratings and wording; factual accuracy check by the model owner, where ratings change only on new evidence (good practice, `[TO CONFIRM]` as team routine).
14. **Presentation and sign-off** to the function designated in the client's MRM framework, which approves the report. Hand over the work programme for the next validation.

### 6. Deliverable structure

Section names and order follow the team's current templates. Swedish headings in parentheses. The full skeleton is in `template.md`.

| Section | Purpose | Must contain | Length | Style |
|---|---|---|---|---|
| Cover and document control | Identify and trace | Client, "Validation report" (*Valideringsrapport*), "Model for [type]", recipient, date, author, version, confidentiality; version table | 1–1½ pages | Profile layout |
| Summary (*Sammanfattning*) | Decision-ready answer | Who validated what for whom; overall conclusion in two to four sentences ("Our overall assessment is that…"); standard method paragraph; table **Key area \| Overall result** (*Huvudområde \| Övergripande resultat*); worst-result note; three to five key recommendations | 1 page | Conclusion first |
| 1 Introduction (*Introduktion*) | Frame the validation | 1.1 Background (*Bakgrund*): licence and why AML model rules apply; 1.2 About model validation (*Om modellvalidering*): model definition, model risk, legal basis; 1.3 Purpose (*Syfte*); 1.4 Sources and reference material (*Källor och referensmaterial*); 1.5 Method and implementation (*Metod och genomförande*): four-area table, documents, interviews, tests, traffic-light table; 1.6 Limitations (*Avgränsningar*) | 2–4 pages | Standard text; tailor 1.1, 1.5, 1.6 |
| 2 Conceptual design and method (*Konceptuell design och metod*) | Is the model designed for the client's risks? | 2.1 Brief overview (*Kort om…*); 2.2 Overall assessment (*Övergripande bedömning*) table; 2.3 Tests performed (*Utförda tester*): gap analysis against BWRA, national law, EBA guidelines (plus industry practice for CRC, Wolfsberg for screening) with count tables, documentation analysis where used; 2.4 Detailed results (*Detaljerade resultat*); 2.5 Discussion (*Diskussion*) | 4–8 pages | Expectation, status, consequence |
| 3 Observations and assessments: Implementation risk (*Iakttagelser och bedömningar: Implementeringsrisk*) | Implemented and changed under control? | Brief overview; table; tests performed (three standard questions); Discussion | 1–2 pages | Factual |
| 4 … Input data risk (*Indatarisk*) | Data complete, correct, controlled? | Brief overview; table; tests performed; Discussion | 1–2 pages | Name the controls found |
| 5 … Output data risk (*Utdatarisk*) | Reliable, effective output? | Brief overview; table; tests with key numbers; detailed results; Discussion | 2–5 pages | Numbers first |
| 6 Received documentation (*Mottagen dokumentation*) | Evidence base | Numbered document list | ½–1 page | Table |
| Appendix 1 – Tests (*Bilaga 1 – Tester*) | Gap-analysis detail | Tables 1–3 (BWRA, national law, EBA), optional industry-practice tables | As needed | Short comments |
| Appendix 2 – Outcome tests | Quantitative detail | TM ratios; CRC reports per risk class; screening test counts (no names); BWRA benchmark | As needed | Tables, figures |
| Appendix 3 – Consolidated recommendations (optional, house standard) | All actions in one place | ID, area, recommendation, rating, priority, owner | 1 page | Table |

**Sub-area table.** Each Overall assessment uses the five-column table **Area | Assessment | Expectation/requirement | Status | Recommendation** (*Områden | Bedömning | Förväntan/krav | Status | Rekommendation*). The Expectation column carries the standard expectation text for that sub-area (adapted to the model type); Status states what was found; Recommendation is one or two concrete actions. A four-column variant (**Area | Assessment | Comment/observation | Recommendation**) is acceptable for short reports; when a detailed finding exists, the Comment cell says "See observation N".

**Detailed finding block** (*Iakttagelse N – [topic]*), numbered across the report: **Observations** (*Iakttagelser*): the expectation in one sentence, then what was found with document references; **Assessment** (*Bedömning*): the rating and why it matters; **Suggested actions** (*Förslag på åtgärder*): what to do, in what order. In a client's own template the same block is called **Expectations and observations / Assessment / Suggestions for action**.

**Discussion** closes each area in three to six sentences: the overall level, the main driver of the rating and the link to other areas (for example, missing CDD data in input risk explaining low effectiveness in output risk).

### 7. Scales, scoring and calculations

- **Grading:** the four-colour traffic-light scale with N/A, defined in the report's section 1.5 with the team's standard descriptions (`references/rating-scale.md`). Labels: Green "No/insignificant improvements needed", Yellow "Minor improvements needed", Orange "Major improvements needed", Red "Not approved, unsatisfactory". Always print the label, not only the colour.
- **Aggregation:** a key area takes the worst result among its sub-areas. No averaging. No single overall model rating unless the client's framework requires it.
- **Gap-analysis coverage:** Yes / Partly / No per item; counts per source in the body ("Clear coverage, number of requirements"); reverse-gap count for TM and CRC.
- **TM outcome ratios:** scenario alert ratio (alerts per scenario / total alerts); alert-to-transaction ratio; alert-to-investigation ratio (in-depth investigations / alerts); alert-to-report ratio (*FIPO-larmkvot*: reports to the FIU / alerts); investigation-to-report ratio (*FIPO-utredningskvot*: reports / investigated alerts); totals and per scenario. These are the same names and definitions as in `model-documentation`. Separate scenario alerts from manual cases. Definitions and interpretation: `references/test-procedures-tm.md`.
- **CRC back-testing:** STR-reported customers by the risk class they had before reporting; the reporting rate should rise with the class. Other tests: `references/test-procedures-crc.md`.
- **Screening:** hit/quality per test name and variation; effect of a lowered threshold; list-update latency.
- **Documentation analysis:** Yes / No per expected document, with where found.

### 8. Supporting artefacts

1. **Documentation and data request** (email with list) per model type, sent at kick-off: `references/data-request.md`.
2. **Validation work programme** (Excel): Introduction; To report; Provided documentation; Documentation analysis; Regulatory expectations; Assessments; TM scenario sheets; screening sample-name list (internal only). Core columns: **Validation area | Sub-area | Ref. regulatory expectations (MD) | Expectations | Ref. regulatory expectations (MV) | Assessment point – initial (full) validation | Assessment point – ongoing validation | Current status | Assessment (drop-down) | Comment (rationale for assessment) | Recommendation**. Layout: `references/work-programme.md`.
3. **Appendix 1 – Tests (gap analysis)**, Word or Excel. Table 1: **Page no. | Risk factors identified in the BWRA | Yes | Partly | No | Comment**, grouped by products and services, customers, channels, geography. Table 2: **Ref. | Legal requirement | Yes | Partly | No | Comment**. Table 3: **Para. | EBA guideline text | Yes | Partly | No | Comment**.
4. **Appendix Tests – outcome ratios** (Excel, TM): sheets "Ratio requirements" (**Number | Name of ratio | Description | Calculation method | Motivation**) and "Ratio calculation" (per-scenario blocks).
5. **Received documentation list** (section 6): **No. | Document | Version/date | Comment**.

### 9. Writing rules specific to this deliverable

- **Expectation before status.** Every sub-area states what is expected, then what was found, then the consequence. The reader must see the bar.
- **Strictly factual comments.** The Status/Comment column contains facts and document references only. Opinions go in the Assessment or Discussion, phrased as "we assess".
- **Name the evidence.** "The routine for monitoring rules (document 1) describes…", "In interviews with the AML analysts…", "Of 2 400 alerts in the period, 15 led to reports" (invented example). Give documents a short label at first mention ("document 1") and use it consistently.
- **Numbers over adjectives.** "The model covers 14 of 19 risk factors from the BWRA that should be handled by customer risk classification" (invented example), not "the model covers most risk factors".
- **Recommendations are actions with an owner and an order.** For example: "Establish a decision log for deactivating scenarios that records the change, decision date, implementation date, whether it is time-limited, and the decision-maker. Deactivations should be decided by the AML committee; minor threshold adjustments may be delegated to the head of AML with periodic reporting."
- **Use the standard texts** for Brief overview, About model validation and the scale (in `template.md` and `references/assessment-areas.md`), but adapt them to the model type. A screening report must not mention risk classes; a TM report must not talk about the proportion of high-risk customers.
- **Independent voice.** "{{firm_name}} assesses…", "we recommend…". Never the client's voice. Do not market the firm inside the report; the method is described once in 1.5.
- **Terms:** model owner (*modellägare*), validation team (*valideringsteam*, VT), business-wide risk assessment (*allmän riskbedömning*, ARB/BWRA), alert (*larm*), in-depth investigation (*fördjupad utredning*), report to the FIU (in Sweden *rapport till Finanspolisen*, *FIPO-rapport*), override (*åsidosättande*), threshold (*tröskelvärde*), business objective (*affärsmål*), target outcome (*målresultat*).
- **Personal data.** No customer names, no real test names in the report. Customer data in examples is aggregated or pseudonymised.

### 10. Quality checklist

In addition to the universal checklist in `house-standards.md`:

- [ ] The summary states the overall conclusion in words, the four key-area results, and the key recommendations.
- [ ] Each key-area result equals the worst sub-area result in that area.
- [ ] Every sub-area has a rating or N/A with a reason; no template example ratings remain.
- [ ] Every Orange or Red sub-area has a detailed finding, or a reason why not.
- [ ] Expectation texts match the model type (no copy-paste from another model type).
- [ ] Gap-analysis counts in the body match Appendix 1 exactly.
- [ ] The mapping set fits the model: EBA risk-factor guidelines for TM and CRC; restrictive-measures guidelines for sanctions screening.
- [ ] Ratios are calculated with the definitions in this blueprint; manual cases are separated from scenario alerts; the period is stated.
- [ ] No external benchmark figure is cited without a verifiable source.
- [ ] Limitations state what could not be tested (production environment, sampling, code review) and how that affects the ratings.
- [ ] For an ongoing validation: previous findings are listed with their status.
- [ ] Received documentation list is complete and matches the documents cited in the text.
- [ ] Regulatory status date is stated; uncertain references carry `[VERIFY REFERENCE]`; AMLR/AMLA impact is mentioned.
- [ ] No real names in test lists, screenshots, file names or metadata.
- [ ] Independence statement holds: {{firm_name}} did not build or document the model, or the conflict is disclosed.

### 11. What makes it stand out

- **Traceability from risk assessment to model, in both directions.** The gap analysis shows which BWRA risk factors the model covers (Yes/Partly/No) and which model components have no BWRA basis. A generic validation checks the model in isolation.
- **Triple mapping with counts.** BWRA, national law and EBA guidelines are mapped separately and summarised as counts in the body, with full detail in an appendix. The reader sees both the headline and the evidence.
- **Right control for each risk.** Each risk factor is tagged with the control best suited to handle it (TM, CRC, KYC, manual handling, screening, product restriction). The report does not demand that one model cover everything, and it exposes risks that no control covers. Relevant coverage matters more than full coverage.
- **The models are treated as a system.** CRC output should feed TM thresholds and scope; TM and STR outcomes should feed the BWRA and CRC; overrides in one model show up in another. Findings state these links.
- **Inherent risk first.** A CRC model built on residual risk lets mitigating controls lower the risk class that should trigger those controls, which is circular. The report calls this out (house standard: inherent, then controls, then residual).
- **Quantitative tests, not just document review.** Standard outcome ratios per scenario, back-testing of STR-reported customers by risk class, replication of alerts, name-variation and threshold tests, and benchmarking of a BWRA against the SNRA.
- **Effectiveness beyond the alert-to-report ratio.** Following current industry thinking, the report asks whether reports are useful (priority areas, networks, complex investigations), whether false negatives are analysed (reports originating from manual referrals), and whether scenarios target material typologies.
- **An explicit bar.** The Expectation/requirement column shows the standard applied to each sub-area, so the model owner knows exactly what "fixed" means; the worst-result rule prevents a red sub-area being averaged away.
- **Built for the next validation.** Separate assessment points for initial and ongoing validation, and a work programme the client can reuse.

### 12. Common pitfalls

- Leaving template example ratings or text from another model type in the report (for example a screening report referring to customer risk classification).
- Mapping a screening model against the ML/TF risk-factor guidelines only, or labelling restrictive-measures guidelines with the wrong reference.
- Defining ratios incorrectly (for example calling a report-to-alert ratio a "false alarm ratio"); mixing manual cases with scenario alerts.
- Citing an "industry target" alert-to-report ratio without a source, or judging a low ratio without considering the product risk profile and small volumes.
- Treating a BWRA mapping as validation of the BWRA itself.
- Rating output risk on documents alone without saying that no data tests were possible.
- Missing de facto overrides: suppression lists, whitelists, deactivated scenarios, "extra monitoring" flags that bypass the risk class.
- Ignoring that a model based on residual risk understates risk classes.
- Mixing the traffic-light scale with "low/medium/high" findings ratings.
- Comments that contain opinions, or recommendations without an action ("improve the documentation").
- Putting real PEP or sanctioned names, or customer data, into the report or appendices.
- Validating a model that {{firm_name}} itself documented or designed without disclosing it.

### 13. Variants

**By model type** (use the matching file in `references/`):
- *Transaction monitoring:* scenarios and thresholds replace "risk factors" in the selection sub-area; KYC-based monitoring and real-time versus ex-post monitoring are standard check points; outcome ratios and scenario validation are core.
- *Customer risk classification (private or corporate):* risk factors, weights, scores and thresholds; back-testing and sample checks; inherent-risk basis; link to CDD/EDD and TM.
- *PEP and sanctions screening:* lists, data fields, matching logic and calibration; name tests; effectiveness measured as hits leading to investigation or action. "Most important: screening against the correct lists (updated and relevant) and fuzzy matching that works for the business."
- *BWRA as a model:* business objective, override and implementation sub-areas are mostly N/A; output tested by benchmarking against the SNRA and national risk assessment; ML and TF assessed separately.

**By client type:**
- *Bank or credit market company:* full scenario set; corporate and private segments; correspondent and trade typologies where relevant.
- *Payment or e-money institution:* background states the payment licence; screening of transfers before funds are made available; high volumes favour automated, partly real-time monitoring; agent and merchant channels.
- *Consumer credit:* lending typologies (early or over-repayment, quick repayment followed by new credit, third-party payments, loan brokers); low report volumes call for qualitative effectiveness evidence.
- *Insurance:* early surrender, premium overpayment, beneficiary changes.
- *Fund manager or investment firm:* securities typologies (low-priced securities, journaling, cancels and corrections, quick redemptions).
- *Crypto-asset service provider:* wallet screening, travel-rule data, blockchain analytics as an input model.
- *Non-financial obliged entity:* models are rare; confirm that what exists is a model before using the full method.

**By size and maturity:** set the review level (A/B/C). A first validation of an undocumented model typically yields Red on Documentation; focus recommendations on dedicated model documentation (objective, roles, specification, risk factors, data, dependencies). Mature clients get deeper quantitative tests.

**By delivery form:** our template (default); the client's own template (their section names, typically "Observations and assessments: [area]" with an "Expectations and observations / Assessment / Suggestions for action" block); or support to the client's validation team, with a work-programme column for the responsible function (e.g. compliance, risk control). Swedish and English templates exist for all model types.

### 14. How the assistant should work

**Ask first** (at most five questions, then proceed with marked assumptions if told to):
1. Which model(s) and type (vendor or in-house), and is this an initial or ongoing validation (is there a previous report)?
2. Which institution type and jurisdiction, and in which language and template should the report be written?
3. What has been received so far: BWRA, model documentation, scenario/risk-factor/list set-up, statistics, test data, interview notes?
4. Which tests were actually performed, and with what results (the assistant never invents test results)?
5. Who signs off the validation and who is the audience?

**Order of production:**
1. If nothing has been received yet: produce the kick-off agenda and the documentation and data request.
2. Set up the work programme structure with expectations pre-filled for the model type.
3. When documents and test results are available: Appendix 1 (gap-analysis tables) and outcome appendix.
4. Sections 2–5 with sub-area tables, detailed findings and discussions.
5. Section 6, then section 1, then the summary, then optional consolidated recommendations.

**Stop and ask when:**
- Asked to rate a sub-area without any evidence: offer `[DATA NEEDED]` and a provisional "not assessable" note instead of a rating.
- Asked to produce outcome-test numbers that were not supplied.
- The BWRA is missing: the gap analysis cannot be done; agree whether to proceed with national law and EBA mapping only.
- There is an independence conflict.
- The client's MRM framework prescribes a different scale, structure or sign-off route.

Never present template text as findings. Every rating must trace to a test, a document or an interview listed in the report.

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: Model validation report

Output language: {{language}}. Swedish headings from the team's templates are given in parentheses; use them when {{language}} is Swedish. Replace `[TYPE]` with the model type throughout: "transaction monitoring" (*transaktionsmonitorering*), "customer risk classification – private/corporate customers" (*kundriskklassificering privat/företag*), "PEP and sanctions screening" (*PEP- och sanktionsscreening*) or "business-wide risk assessment" (*allmän riskbedömning*). Guidance in [brackets] is removed before delivery.

---

#### [Cover page]

**{{client_name}}**
**Validation report** (*Valideringsrapport*)
Model for [TYPE] (*Modell för [TYP]*)

Recipient (*Mottagare*): [role or function named by the client]
Date (*Datum*): {{date}}
Author (*Författare*): {{firm_name}}
Version: {{version}} · Classification: [Confidential]

#### Document control

*Table 1: Version history*

| Version | Date | Author | Change |
|---|---|---|---|
| {{version}} | {{date}} | {{firm_name}} | [Draft for factual accuracy check / Final] |

---

#### Summary (*Sammanfattning*)

{{firm_name}} has, on behalf of {{client_name}} ("{{client_short}}"), validated {{client_short}}'s model for [TYPE].

[Overall conclusion in two to four sentences, conclusion first. State whether the model is assessed as fit for purpose, the main reason for the result, and the most important action.]

Example: "Our overall assessment is that the model for customer risk classification requires improvements before it can be relied on to differentiate risk. The improvement needs relate mainly to the model being based on residual rather than inherent risk, and to the absence of dedicated model documentation. We recommend that {{client_short}} establishes model documentation and bases the risk classes on inherent risk adjusted only for product limitations."

For undertakings within the scope of the anti-money laundering framework that use models in their work against money laundering and terrorist financing, specific requirements apply to both model risk management and model validation. {{firm_name}} has carried out such a validation, which is presented in this report. The validation follows {{firm_name}}'s established method for model validation, built on an assessment of four points: (i) conceptual method and design, (ii) implementation risk, (iii) input data risk and (iv) output data risk. The method is proportionate to the size and complexity of the institution.

The model has been assessed for its effectiveness and whether it fulfils its purpose. Where improvements have been identified, recommendations are given in each section of the report.

The table below shows, at a high level, the validation result for each key area. It should be noted that a key area in this summary has been assessed according to the lowest result, to indicate that there are improvements within the key area. The grading is described in section 1.5.

*Table 2: Validation result per key area*

| Key area (*Huvudområde*) | Overall result (*Övergripande resultat*) |
|---|---|
| Conceptual design/method (*Konceptuell design/metod*) | [Green/Yellow/Orange/Red label] |
| Implementation risk (*Implementeringsrisk*) | [label] |
| Input data risk (*Indatarisk*) | [label] |
| Output data risk (*Utdatarisk*) | [label] |

**Key recommendations** [three to five, in priority order, each one sentence with a reference to the observation]
1. [Recommendation] (see observation [N], rating [label])
2. […]

[Table of contents – for reports longer than about six pages]

---

#### 1 Introduction (*Introduktion*)

##### 1.1 Background (*Bakgrund*)

[Tailor to licence type. State the legal basis for the client being an obliged entity and why model risk rules apply. Use `[DATA NEEDED: company registration number]` if not given.]

Example (Sweden, financing business): "{{client_name}} (reg. no. [DATA NEEDED]) conducts financing business under the Banking and Financing Business Act (2004:297) and is therefore subject to the Act (2017:630) on Measures against Money Laundering and Terrorist Financing ("the AML Act") and Finansinspektionen's regulations on measures against money laundering and terrorist financing, FFFS 2017:11 ("the Regulations"). The AML Act and the Regulations contain requirements on model risk management and on the validation of models used in the work against money laundering and terrorist financing. This validation report has been prepared against this background."

Example (payment institution): "{{client_name}} is a payment institution authorised by {{supervisor}} and as such subject to the rules on measures against money laundering and terrorist financing [national reference], and specifically to the requirements on model risk management and validation of models used in that work."

##### 1.2 About model validation (*Om modellvalidering*)

A model refers to a quantitative method, system or approach that uses statistical, economic, financial or mathematical theories, techniques/calculations and/or assumptions to process input data into quantitative estimates. For [TYPE], a model and automated method can be used to focus the work on money laundering and terrorist financing risks by directing efforts according to risk. A well-designed model is likely to increase productivity and effectiveness, which in turn improves the quality of the work against financial crime. All models carry certain inherent risks, since no model can perfectly represent reality. This is referred to as model risk. Model validation is the method by which model risk is reduced, and it is a legal requirement in many jurisdictions, including [{{jurisdiction}}].

[EU layer, then national layer. Keep the sentences below only if verified for {{jurisdiction}}; otherwise describe the requirement and mark `[VERIFY REFERENCE]`.]

Example (Sweden): "The legal requirements for the validation of models used to combat money laundering and terrorist financing (AML models) follow from the AML Act and the Regulations, which together form the Swedish AML framework. Under Chapter 6, Section 1, second paragraph of the AML Act, an undertaking within the scope of the framework shall have routines for model risk management if it uses models for, among other things, risk assessment, risk classification and transaction monitoring. [VERIFY REFERENCE] FFFS 2017:11, 6 kap. 14 § ff. [VERIFY REFERENCE] sets further requirements: the routines shall describe the underlying theory and assumptions behind the model's design and how changes are documented; the model's fitness for purpose shall be ensured through a validation process in which the undertaking reviews that parameters and data are correct and complete and that assumptions are appropriate and relevant; validation shall be performed before the model is taken into use and at significant changes; and validations shall be documented in a written report. [VERIFY REFERENCE]"

The European Banking Authority (EBA) issued guidelines on ML/TF risk factors in 2021 (EBA/GL/2021/02). [For screening add: and the two EBA guidelines on internal policies, procedures and controls to ensure the implementation of Union and national restrictive measures (EBA/GL/2024/14 and EBA/GL/2024/15) – one general, one for payment service providers and crypto-asset service providers under Regulation (EU) 2023/1113 [VERIFY REFERENCE: confirm which number applies to which].] The guidelines are considered in the validation.

Regulatory status as of {{date}}. [One or two sentences on the EU AML package: the AMLR applies from 2027 [VERIFY REFERENCE] and will replace parts of the national framework; note what the client should watch.]

##### 1.3 Purpose (*Syfte*)

{{firm_name}} has, on behalf of {{client_short}}, validated {{client_short}}'s model for [TYPE]. The purpose of the validation is to assess whether the model meets the requirements placed on a model used to counter money laundering and terrorist financing. This primarily means evaluating and validating the model's fitness for its purpose with regard to the legal and functional requirements placed on such a model.

[Add: initial (full) validation or ongoing validation; for ongoing, name the previous validation date and state that previous findings are followed up.]

##### 1.4 Sources and reference material (*Källor och referensmaterial*)

[Standard justification, neutral wording. Do not name supervised firms from enforcement decisions.]

There has been some uncertainty in the financial sector about what constitutes a model and what model risk management and model validation include; supervisory reviews show that the area is still developing [VERIFY REFERENCE]. Given this, given that many fundamental rules are similar across regimes, and given the clear movement towards further harmonisation within the EU, {{firm_name}} uses the following source as industry practice for validation, in addition to the AML framework:

- The ACAMS guidance on AML model validation in compliance with OCC 2011-12 (Supervisory Guidance on Model Risk Management) and OCC Bulletin 2000-16 [VERIFY REFERENCE].

The guidance is used despite originating outside the EU because, in {{firm_name}}'s assessment, it represents the most developed methodology for validating risk models. Both the EU and US regimes rest on the FATF Recommendations, so the underlying logic is largely the same. The validation approach has the same foundation as that used for models in other areas of the financial sector (credit, capital adequacy) and is proportionate to the institution's size and complexity.

[Screening: add Wolfsberg Guidance on PEPs and Sanctions Screening Guidance. TM: add Wolfsberg statements on effectiveness where used. BWRA: add the EU supranational risk assessment and the national risk assessment.]

##### 1.5 Method and implementation (*Metod och genomförande*)

The validation has been carried out through quantitative and qualitative tests in accordance with {{firm_name}}'s established method for validating models used to combat money laundering and terrorist financing. The method primarily takes into account the AML framework's requirements on validation. To make the framework's very general requirements on model validation concrete, the method is in selected parts also informed by the industry guidance in section 1.4.

The validation is based on four areas: (i) conceptual design/method, (ii) implementation risk, (iii) input data risk and (iv) output data risk. The table below briefly introduces what is tested.

*Table 3: Assessment areas*

| Area | What is tested |
|---|---|
| Conceptual method (*Konceptuell metod*) | Documentation, business objectives, model use process, model monitoring, methodology, selection of risk factors [TM: scenarios and thresholds; screening: lists, fields and matching rules], governance and management's override process, model limitations, assumptions and data |
| Implementation risk (*Implementeringsrisk*) | Test plan and testing, data, change management |
| Input data risk (*Indatarisk*) | Data, missing data |
| Output data risk (*Utdatarisk*) | Sensitivity, limitations and assumptions, model effectiveness, quantitative and qualitative validation |

{{firm_name}} has performed the validation by reviewing governing documents such as the business-wide risk assessment, available model documentation on the model's objectives, purpose and other definitions of data and execution, and relevant routines. A full list of documents received is given in section 6 "Received documentation". [Interviews: "Relevant developers and AML analysts at {{client_short}} have been interviewed." State roles and number of interviews, never names.] [Tests: list the data tests performed and the period, e.g. "Outcome statistics for [period] have been analysed."]

Observations together with the quantitative and qualitative tests result in a validation result graded according to the table below. The assessment for each area is given under the headings "Overall assessment".

*Table 4: Traffic-light grading of validation results* (*Trafikljus för gradering av valideringsresultat*)

| Grading scale (*Bedömningsskala*) | Meaning (*Betydelse*) |
|---|---|
| Green | **No/insignificant improvements needed.** Suggested improvements are not necessary but are recommended to complete the overall picture. |
| Yellow | **Minor improvements needed.** Regulatory requirements are largely met; improvements are needed regarding adherence to guidelines or risk factors that are not addressed appropriately. |
| Orange | **Major improvements needed.** Similar to a critical result but less severe. It can, for example, mean that the area has serious deficiencies in formal model documentation, or that a legal requirement is not followed but is not decisive for the model's method. |
| Red | **Not approved, unsatisfactory.** A critical result of a more serious nature, for example because more than one legal requirement is not followed and cannot be remedied quickly; several risk factors from supervisory regulations/guidelines or the risk assessment are not considered; certain product areas are not covered by the model or it is almost entirely ineffective; or the model has serious deficiencies in output, logic and/or methodology, calculations or lack of input data. |

For each area assessed and rated, the expectation is stated together with the status found and a short recommendation of actions for {{client_short}} to take.

[If the client's MRM framework prescribes another scale, replace the table and write: "The grading follows the scale used in {{client_short}}'s model risk management framework."]

##### 1.6 Limitations (*Avgränsningar*)

[State what was not in scope and what could not be done, and the effect on the ratings. Never leave empty.]

Example: "The validation covers the model for [TYPE] as configured on [DATA NEEDED: date]. The model could not be tested in its production environment; {{firm_name}} has instead reviewed examples showing how the calculations are made and analysed outcome statistics provided by {{client_short}}. Code review and re-performance of alert generation were not within scope. Output data risk has therefore been assessed partly on the basis of documentation and interviews."

---

#### 2 Conceptual design and method (*Konceptuell design och metod*)

##### 2.1 Brief overview of conceptual design and method (*Kort om konceptuell design och metod*)

Validation of a model's conceptual design and method is based on appropriate documentation that serves as the foundation for the model's capabilities and implementation.

[Add the model-type sentence:]
- TM: "For the design to be appropriate, the set-up of scenarios, parameters, thresholds and limits should be in line with the undertaking's overall risk profile, taking into account the products, services, customer types and geographies covered."
- CRC: "For the design to be appropriate, the proportion of high-risk customers should, among other things, be in line with the undertaking's overall risk profile and, where possible, the model's accuracy should be significantly better than chance, taking into account the products, services, customer types and geographies covered."
- Screening: "For the screening process to be effective, the search criteria and matching algorithms should be adapted to the undertaking's overall risk profile, taking into account its products and services, customer demographics and geographic exposure."
- BWRA: "A model for the business-wide risk assessment is used to assess the business's risks systematically and forms the basis for most subsequent measures against financial crime."

##### 2.2 Overall assessment (*Övergripande bedömning*)

Below is a more detailed description of the areas assessed within the model's conceptual design/method.

*Table 5: Conceptual design/method*

| Area (*Områden*) | Assessment (*Bedömning*) | Expectation/requirement (*Förväntan/krav*) | Status | Recommendation (*Rekommendation*) |
|---|---|---|---|---|
| Documentation (*Dokumentation*) | [label] | [Standard expectation, see references/assessment-areas.md] | [Facts found, with document references] | [Action] |
| Business objectives (*Affärsmål*) | | | | |
| Process for model use (*Process för modellanvändning*) | | | | |
| Criteria and design for model monitoring (*Kriterier och design för modellövervakning*) | | | | |
| Process for model selection (*Process för val av modell*) | | | | |
| Method (*Metod*) | | | | |
| Process for selecting risk factors [TM: scenarios and thresholds] (*Process för val av riskfaktorer / scenarier och tröskelvärden*) | | | | |
| Management's process for overrides, incl. roles and responsibilities (*Ledningens process för åsidosättande, inkl. roller och ansvar*) | | | | |
| Governance (*Styrning*) | | | | |
| Data | | | | |
| Model limitations and assumptions (*Modellbegränsningar och antaganden*) | | | | |

Example Status cell: "There is no dedicated model documentation. The routine for monitoring rules (document 1) describes the model's structure at a high level; the scenario mapping (document 2) lists parameters and thresholds. The documents are not linked, and the business objective is not defined in terms of effectiveness."

Weak: "Documentation is insufficient." (no evidence, no reference)

##### 2.3 Tests performed (*Utförda tester*)

###### 2.3.1 Gap analysis (*Gap-analys*)

###### 2.3.1.1 {{client_short}}'s business-wide risk assessment (*Bolagets allmänna riskbedömning*)

{{firm_name}} has tested the model's link to {{client_short}}'s business-wide risk assessment. Risk factors that, by their nature, should be handled in the model for [TYPE] have been selected for the test. [Discuss the outcome: the main gaps, the categories concerned, and any model components with no basis in the BWRA.]

*Table 6: Coverage of risk factors identified in the business-wide risk assessment*

| Risk factors identified in the BWRA | Yes | Partly | No | Risk factors not identified in the BWRA [TM/CRC] |
|---|---|---|---|---|
| Clear coverage, number | [n] | [n] | [n] | [n] |

A more detailed assessment is given in Table 1 in Appendix 1. Note that the mapping does not assess the adequacy of the BWRA itself; a model can cover all risk factors of a BWRA that is not sufficiently comprehensive.

###### 2.3.1.2 Compliance with the [national AML act] (*Efterlevnad av penningtvättslagen*)

When mapping against the [national AML act], it can be noted that the model [outcome]. It should be emphasised that the act's requirements on [monitoring / customer risk profiles / PEP measures] are very general, and that for a business of {{client_short}}'s nature more detailed requirements can be assumed on how developed the [monitoring] should be.

*Table 7: Coverage of national legal requirements*

| [National] legal requirements | Yes | Partly | No |
|---|---|---|---|
| Clear coverage, number of requirements | [n] | [n] | [n] |

A more detailed assessment is given in Table 2 in Appendix 1.

###### 2.3.1.3 EBA guidelines (*EBA:s riktlinjer*)

The EBA has published guidelines on [ML/TF risk factors / the implementation of restrictive measures]. {{firm_name}} has extracted the guidelines relevant to [TYPE] and mapped {{client_short}}'s model and its coverage against them. [Discuss.]

Example (TM): "After the mapping, the model is assessed as partially covering. The main gaps concern real-time monitoring and, in its absence, an assessment in the model documentation of whether and why it is sufficient for {{client_short}} to monitor transactions after execution."

Example (CRC): "The number of 'No' in the table reflects the model's development potential, which we assess can largely be remedied through clearly reasoned and structured documentation."

*Table 8: Coverage of EBA guidelines*

| EBA guidelines | Yes | Partly | No |
|---|---|---|---|
| Clear coverage, number of guidelines | [n] | [n] | [n] |

A more detailed assessment is given in Table 3 in Appendix 1.

###### 2.3.1.4 Industry practice and benchmark risk factors [CRC; screening: Wolfsberg guidance]

*Table 9: Coverage of industry practice*

| Industry practice | Yes | Partly | No | Comment |
|---|---|---|---|---|
| Clear coverage, number | [n] | [n] | [n] | [main gaps] |

###### 2.3.2 Documentation analysis [include when it drives the ratings]

The model documentation has been compared with the documentation expected under industry practice.

*Table 10: Documentation analysis*

| Expectations on model documentation | Yes | No | Comment |
|---|---|---|---|
| Process description/map (practical process and technical: systems and data) | | | |
| Criteria and design for model monitoring | | | |
| Report from ongoing model monitoring | | | |
| Business objective for the model | | | |
| ML/TF risk assessment with mitigating measures | | | |
| Development evidence showing how the model was tested, data used and how results show the model works as intended | | | |
| Model methodology: theoretical approach, assumptions and known limitations | | | |
| Model specification: data, formulas, parameters, inputs, outputs, dependencies, processing flow, reports, dependencies on other models | | | |
| Data for implementation, describing all fields used | | | |
| Rules or segmentation logic with thresholds and calibration data | | | |
| Reporting of model output to management/board, with evidence of review and approval | | | |
| User procedures for executing and maintaining the model | | | |
| Compliance procedure describing how the model's output is used [TM: case handling and reporting to the FIU; CRC: CDD/EDD and TM] | | | |
| Management override process, incl. roles and responsibilities | | | |
| Annual model review, incl. continued suitability for the portfolio and market conditions | | | |

##### 2.4 Detailed results (*Detaljerade resultat*) [for Orange/Red sub-areas]

###### Observation [N] – [Topic] (*Iakttagelse N – [ämne]*)

| Observations (*Iakttagelser*) |
|---|
| [Expectation in one sentence. Then the facts: which documents describe what, what is missing, test results with numbers.] |
| **Assessment (*Bedömning*): [label]** |
| [Why it matters: consequence for the model's ability to mitigate risk; link to other areas.] |
| **Suggested actions (*Förslag på åtgärder*)** |
| [Concrete actions in priority order; what a remediated state looks like.] |

Example (overrides, TM): "Observations: Models always involve limitations, which creates a need to deviate from them. {{firm_name}} has not received documentation describing the override process. The rule review summary (document 3) shows that several rules have been deactivated, with an evaluation and a decision date, but not whether the deactivation is time-limited or who may decide. Assessment: Major improvements needed. Suggested actions: Formalise the override process: workflow and assessment criteria, roles and mandates, and a decision log recording the change, decision and implementation dates, whether it is time-limited, and the decision-maker. Deactivation of rules should be decided by the AML committee; minor adjustments may be delegated to the head of AML with periodic reporting."

##### 2.5 Discussion (*Diskussion*)

Based on the results for each assessment area above, the model's conceptual design and method are assessed as [summary]. [Three to six sentences: overall level, main driver, links to other areas.]

---

#### 3 Observations and assessments: Implementation risk (*Iakttagelser och bedömningar: Implementeringsrisk*)

##### 3.1 Brief overview of implementation risk (*Kort om implementeringsrisk*)

Implementation risk refers to the risk that the model is not implemented appropriately, that the code contains flaws, or that an unsuitable algorithm is used. To manage implementation risk, the undertaking is expected to address the risk and describe preventive measures throughout the implementation process. It is also expected to control how changes may affect and update the model, and to ensure that data, code and the overall solution are protected. The validation therefore checks whether tests have been performed and documented, whether documented routines for testing are in place, and whether there is an established change management process.

##### 3.2 Overall assessment (*Övergripande bedömning*)

*Table 11: Implementation risk*

| Area | Assessment | Expectation/requirement | Status | Recommendation |
|---|---|---|---|---|
| Test plan, testing and data (*Testplan, testning och data*) | | | | |
| Change management (*Förändringsledning*) | | | | |

##### 3.3 Tests performed (*Utförda tester*)

Implementation risk has been assessed qualitatively against the following questions and on the basis of {{firm_name}}'s review of the documentation provided by {{client_short}}.

*Table 12: Implementation risk questions*

| Question (*Frågeställning*) | Comments (*Kommentarer*) |
|---|---|
| Is there a test plan, and is it documented? Is there a training plan for analysts/case handlers? | |
| Have user acceptance tests been performed? Have code, input data, etc. been tested? | |
| Has the data been tested and evaluated? | |

[If the model has been in use for years: "The model is already implemented; risks related to the original implementation are therefore not relevant. Risks related to adjustments and changes to the existing model are assessed under change management." Mark test-plan rows N/A with this reason.]

##### 3.4 Discussion (*Diskussion*)

{{firm_name}} assesses that {{client_short}} [summary].

---

#### 4 Observations and assessments: Input data risk (*Iakttagelser och bedömningar: Indatarisk*)

##### 4.1 Brief overview of input data risk (*Kort om indatarisk*)

Input data risk is the risk that input parameters are inappropriate, incomplete or incorrect. Validation of raw data and other data used by the model is a key part of this process. The quality of both internal and external data must be evaluated to determine its suitability for the model and the application that uses the data. It is therefore important to assess whether, and to what extent, {{client_short}} has tested the completeness and accuracy of data capture.

##### 4.2 Overall assessment (*Övergripande bedömning*)

*Table 13: Input data risk*

| Area | Assessment | Expectation/requirement | Status | Recommendation |
|---|---|---|---|---|
| Data, complete and correct (*Data, komplett och korrekt*) | | | | |
| Missing data/compensation (*Avsaknad av data/kompensation*) | | | | |

##### 4.3 Tests performed (*Utförda tester*)

[Describe: data-flow review (source systems → data warehouse → model), transfer controls and their logs, reconciliations performed, missing-value analysis. Example: "Testing consisted of a qualitative review of the routine description and parameter settings, the system map and information obtained from {{client_short}}."]

##### 4.4 Discussion (*Diskussion*)

Based on the assessments above, we conclude that input data risk is [level]. [Discussion.]

---

#### 5 Observations and assessments: Output data risk (*Iakttagelser och bedömningar: Utdatarisk*)

##### 5.1 Brief overview of output data risk (*Kort om utdatarisk*)

Output data risk is the risk that the model's results are misleading because of incorrect settings or methods in the model or in the system that performs the calculations. The validation evaluates both the production of output data and the effectiveness of the output.

##### 5.2 Overall assessment (*Övergripande bedömning*)

*Table 14: Output data risk*

| Area | Assessment | Expectation/requirement | Status | Recommendation |
|---|---|---|---|---|
| Sensitivity (*Känslighet*) | | | | |
| Limitations and assumptions (*Begränsningar och antaganden*) [not for screening unless relevant] | | | | |
| Model effectiveness (*Modelleffektivitet*) | | | | |
| Quantitative and qualitative validation (*Kvantitativ och kvalitativ validering*) | | | | |

##### 5.3 Tests performed (*Utförda tester*)

[Model-type tests with key numbers and the period; full tables in Appendix 2.]
- TM: "The ratio between reports to the FIU and generated alerts has been analysed per scenario, together with the distribution of alerts and reports by product category and customer category, and scenario coverage of BWRA risk factors (Appendices 1 and 2)."
- CRC: "Output has been tested by obtaining the risk class that customers reported to the FIU had before reporting, and calculating the share of reports per risk class."
- Screening: "Name matching has been tested with [n] known PEPs and [n] listed persons, each in three variations of increasing deviation, and with a lowered matching threshold."
- BWRA: "Output has been tested by comparing risk levels per product and service with the EU supranational risk assessment."

##### 5.4 Detailed results (*Detaljerade resultat*)

###### Observation [N] – [Topic]

[Same block as 2.4.]

Example (TM, quantitative validation): "Observations: In [period] the monitoring generated [n] cases including manually created cases, of which [n] led to a report to the FIU ([x] %). Scenario-generated cases alone: [n] cases and [n] reports ([y] %). The distribution of cases per rule is skewed: [n] of [n] rules generate [x] % of cases. Assessment: [label]. A skewed distribution can indicate that some thresholds are too narrow and others too wide. Suggested actions: Analyse why manually created cases account for most reports, to see whether those behaviours can be monitored automatically; calibrate thresholds; analyse the distribution per rule and customer category and document the conclusions."

##### 5.5 Discussion (*Diskussion*)

Based on the assessments above, it can be concluded that [summary of output data risk].

---

#### 6 Received documentation (*Mottagen dokumentation*)

*Table 15: Documents received*

| No. | Document | Version/date | Comment |
|---|---|---|---|
| 1 | [Title as named by the client; short label used in the report, e.g. "document 1"] | | |
| 2 | | | |

---

#### Appendix 1 – Tests (*Bilaga 1 – Tester*)

##### Conceptual design – gap analysis (*Konceptuell design – gap-analys*)

**Introduction.** Testing of the model's conceptual design is based on a gap analysis: a mapping between the model and the business-wide risk assessment, between the model and the [national AML act], and between the model and the relevant EBA guidelines.

**Business-wide risk assessment.** The business-wide risk assessment shall form the basis of all of an undertaking's measures against money laundering and terrorist financing. It is therefore important that the model covers and handles the risk factors identified in it. Note that mapping the model against the BWRA does not assess the adequacy of the BWRA itself. [Summary: "The mapping shows that [n] of [n] risk factors are handled fully or partly by the model. Risk factors covered by the model but not identified in the BWRA are highlighted."]

*Table 1: Risk factors identified in the business-wide risk assessment* [TM title: Scenarios mapped against the business-wide risk assessment]

| Page no. | Risk factors identified in the BWRA | Yes | Partly | No | Comment |
|---|---|---|---|---|---|
| | **Products and services** | | | | |
| [p.] | [Risk factor / typology] | | | | [Which scenario/risk factor covers it, or which other control should] |
| | **Customers** | | | | |
| | **Distribution channels** | | | | |
| | **Geography** | | | | |
| | **Total** | [n] | [n] | [n] | |

**[National AML act].** [For Sweden, TM: "The Swedish legal requirements for transaction monitoring are set out in Chapter 4, Section 1 of the AML Act. They are not very specific and should be read in relation to each undertaking's business."]

*Table 2: Requirements under the [national AML act]*

| Ref. | Legal requirement | Yes | Partly | No | Comment |
|---|---|---|---|---|---|
| [Ch. x, Sec. y, para.] | [Requirement text] | | | | |

Example comment: "Partly covering. The scenarios do not sufficiently address the risks identified in the BWRA: the customer groups and geographies described in the BWRA should appear more clearly in the model and in relevant scenarios. Typologies such as third-party deposits and deposits followed by quick withdrawals are not covered."

**EBA guidelines.** [Which guidelines and why they are relevant to this model type.]

*Table 3: [Risk factors stated in the EBA guidelines / EBA guidelines on restrictive measures]*

| Para. | Guideline text | Yes | Partly | No | Comment |
|---|---|---|---|---|---|
| [x.xx] | | | | | [Include which control is appropriate where not this model: "Appropriate for TM", "Appropriate for KYC", "Appropriate for manual handling"] |

#### Appendix 2 – Outcome tests [model-type specific]

[TM]
*Table A2.1: Alerts, investigations and reports to the FIU per scenario, [period]*

| Scenario | Alerts | Share of alerts | In-depth investigations | Alert-to-investigation ratio | Reports to the FIU | Alert-to-report ratio | Investigation-to-report ratio |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
| Total (scenario-generated) | | | | | | | |
| Manually created cases | | | | | | | |

*Table A2.2: Scenario coverage per product category*

| Product category | Unique TM-relevant risk factors/modus | Covered by scenario | Difference |
|---|---|---|---|

[CRC]
*Table A2.3: Reports to the FIU by risk class before reporting*

| Risk class | Reports, period 1 | Share | Reports, period 2 | Share | Reporting rate per 1 000 customers in class |
|---|---|---|---|---|---|

[Screening]
*Table A2.4: Name-matching test summary (no names shown)*

| Test group | Names tested | Exact: hit | Variation 1: hit | Variation 2: hit | Variation 3: hit | Comment |
|---|---|---|---|---|---|---|
| Known PEPs | | | | | | |
| Listed persons/entities | | | | | | |

[BWRA]
*Table A2.5: Benchmark against the EU supranational risk assessment*

| Product/service | {{client_short}} inherent risk | Comparable SNRA category | SNRA ML level | SNRA TF level | Comment |
|---|---|---|---|---|---|

#### Appendix 3 – Consolidated recommendations [optional; house standard]

| ID | Area / sub-area | Recommendation | Rating | Priority / timing | Owner |
|---|---|---|---|---|---|
| MV-01 | | | | Immediate / within 6 months / within 6–12 months | [function] |

## Reference catalogues (inlined)

### Reference catalogue: test-procedures-bwra.md

Used by: `model-validation-report`. Swedish: *allmän riskbedömning (ARB)*. Use when the BWRA is produced with a scoring method (e.g. points per product for likelihood and consequence) and the client's MRM framework includes it in the model inventory. To produce or rewrite the BWRA, use `aml-ctf-risk-assessment`.

**Validation question.** Does the method produce risk levels that are plausible against external sources, separate ML and TF risk, assess inherent risk and controls separately, and form a usable basis for the other AML models and routines?

##### 1. Adapting the four areas

| Sub-area | Treatment for a BWRA model |
|---|---|
| Documentation | Full. Expect a dedicated model description: method, assumptions, assessment criteria per risk level, sources. |
| Business objective | Largely not applicable; the objective is to form the basis for other models and routines. Rate on whether that role is stated. |
| Model use process | How results are transferred to CRC, TM, KYC, training; which risk factors are handled by which process. |
| Model monitoring | The annual update can serve as monitoring if the routine says it also reviews the method. |
| Model selection | Less relevant (the law frames the BWRA), but a short rationale for the chosen method is expected. |
| Method | Full. Is the method supported by external sources? Is it proportionate (not too complex for the business)? |
| Risk-factor selection | Is there a documented link from each risk factor to risk levels and to specific controls? Are all channels given the same level without rationale? Is it clear how multiple country-risk sources produce the client's country rating? |
| Overrides | Not applicable – state why. |
| Governance, data, limitations | Full. |
| Implementation risk | Test plan and implementation data usually N/A for a model in use; assess change management: how changes (new products, channels, markets) trigger an update. |
| Input data risk | Data used in scoring (customer counts, volumes); if inputs are shared with TM, refer to the TM validation. |
| Output data risk | Benchmark test (section 3). |

##### 2. Mapping set

###### National law – Sweden example (`[VERIFY REFERENCE]`)
PTL ch. 2, s. 1: assess how products and services can be used for ML/TF and how large the risk is; consider products and services, customers, distribution channels and geographic risk factors; take into account information from the undertaking's own reporting of suspicious activity and information from authorities on ML/TF methods. PTL ch. 2, s. 2: scope proportionate to size and nature; designed to form the basis for routines, guidelines and other measures; documented and kept up to date.

Typical findings: analysis of reported cases mentioned but results not presented; authority information described but not related to the business; the BWRA does not visibly drive routines and controls.

###### EBA/GL/2021/02 Title I (numbering as in the team's mapping `[VERIFY REFERENCE]`)
1.2 (two separate steps: identify risk factors; assess risk); 1.3 (consider both inherent risk and the quality of controls); 1.4 (record the BWRA and changes so that the undertaking and authorities understand how and why); 1.5 (credit institutions: internal governance guidelines); 1.6–1.9 (systems to keep assessments current: set update dates, react to new or increasing risks, review internal information such as suspicious transaction reports and staff input, review external sources such as law-enforcement alerts and thematic reviews, cooperation with peers and authorities); 1.11–1.14 (holistic view across products, countries, customers and channels; diverse sources; tailored to the business; group-wide BWRA sufficiently specific); 1.16 (proportionality).

##### 3. Output test – benchmark against external risk assessments

1. List the client's products and services with their inherent risk scores.
2. Map each to the comparable category in the European Commission's supranational risk assessment (SNRA) and, where available, the national risk assessment.
3. Record the SNRA risk level for ML and for TF (the SNRA uses a four-level scale).
4. Comment on comparability: product limitations (e.g. closed-loop payment, offered only to employees or to a narrow merchant group) can justify a lower level; say so explicitly.

Columns: **Product/service | Client inherent risk | Comparable SNRA category | SNRA ML level | SNRA TF level | Comment**.

Interpretation: markedly lower levels than the external sources may indicate that the model underestimates risk; deviations are acceptable when reasoned and documented. Products without a comparable category are listed with "no comparable category".

##### 4. Key judgements

- ML and TF risk should be assessed separately; otherwise TF risks may not reach CRC, TM and routines.
- Risk factors should be linked to specific mitigating controls (KYC, TM, training, product restrictions, CRC) and, where possible, to KPIs and the results of control-function reviews – not only to a risk level.
- The method should be supported by external sources and proportionate; a complex bespoke scoring tool where external benchmarks are readily available is itself a risk.
- Inherent risk, control quality and residual risk are kept apart (house standard).

## Placeholders

The blueprint text uses these placeholders. Fill each one from the request brief or the inputs. If a value is not known, write `[DATA NEEDED: …]` in the deliverable; never invent it, and never leave a `{{…}}` placeholder in a finished deliverable.

- `{{client_name}}` — the client's legal name (brief: client.legal_name)
- `{{client_short}}` — the defined term for the client, e.g. "the Company" (brief: client.defined_term)
- `{{date}}` — the deliverable date (brief: engagement.date)
- `{{firm_name}}` — the issuing firm (brief: issuing_firm.name)
- `{{jurisdiction}}` — the jurisdiction(s) (brief: engagement.jurisdictions)
- `{{language}}` — the output language (brief: engagement.output_language)
- `{{supervisor}}` — the supervisor (brief: engagement.supervisor)
- `{{version}}` — the document version (brief: engagement.version)
