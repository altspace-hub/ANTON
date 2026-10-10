# FCP blueprint [DRAFT]: Compliance review report

Blueprint `compliance-review-report` v1.1 (draft – needs team input) from the FCP blueprint library, as ANTON skill `fcp-bp-compliance-review-report`. Produces a compliance review report (granskningsrapport) on a client's AML/CTF compliance or on a specific process, such as customer due diligence files, customer risk classification, transaction monitoring and alert handling, investigation and reporting to the FIU, sanctions screening or internal control. The review is evidence-based, using document review, walkthroughs, interviews, sample testing and data analysis. Output is a Word report with findings rated on the team's five-level deficiency scale, an overall conclusion per area and an action plan, supported by an Excel test workbook and findings log. It separates a review from a gap analysis (requirement mapping) and from internal audit (the independent audit function under an audit plan), and covers pre-inspection readiness, follow-up of remediation and the outsourced audit function variant.

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

The output format **Compliance review report (blueprint, draft)** (`bp-compliance-review-report`) carries this blueprint's section order; selecting it attaches this skill. When another output format is selected, that format sets the layout and its own scale; keep this blueprint's method, evidence and wording rules within it.

## How references in this skill map to ANTON

The blueprint text points at files of the library it came from. In ANTON:
- `_core/house-standards.md`, `_core/glossary.md`, `_core/request-context.md`, `_core/output-formats.md` → the skill **FCP blueprint: house standards** (`fcp-bp-house-standards`). Attach it with this one for the full house rules; the essentials are in "Gap markers" above.
- `_core/risk-scales.md` → "Risk and control labels" and "Scale mapping" in the house standards skill (`fcp-bp-house-standards`), as wording only. Its matrix and aggregation rules belong to the risk-assessment blueprints and never override a score ANTON or the module supplies.
- `template.md` → the section "Deliverable template" below.
- `references/…` inlined below: `review-scales-and-sampling.md`.
- The other `references/…` catalogues (`test-programme.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Draft status

This blueprint is a DRAFT – needs team input: it rests partly on analogy or general best practice. Tell the user so, and treat its section order, scales and calibrations as proposals until the team has validated them.

Validate before setting `status: stable`:

Items still to validate:
1. Terminology and positioning.
2. Report structure.
3. Ratings.
4. Sample sizes.
5. Management responses.
6. Independence rules.
7. Test programme.
8. Workpapers and personal data.
9. References marked `[VERIFY REFERENCE]`.

## Method and quality bar (blueprint sections 1–14)

Load this blueprint together with `_core/house-standards.md`, `_core/request-context.md` and `_core/output-formats.md`. Reuse the scale, the wording and the control points from `gap-analysis` wherever this blueprint refers to them.

### 1. Purpose and outcome

A compliance review answers two questions. Is {{client_short}}'s AML/CTF framework, or a defined process, designed adequately and does it operate effectively in practice? And can {{client_short}} demonstrate this to an outsider? The review tests the client's own procedures and the regulatory requirements against evidence: case files, system data, minutes and reports, walkthroughs and interviews. (team gap/review material)

**Readers and decisions**
- The board and CEO receive an independent view on whether a key area works, and approve the action plan.
- The compliance officer uses the review as part of the compliance monitoring plan, or to prepare for an inspection.
- Process owners get concrete findings with root causes.
- The supervisor may receive the report as evidence of remediation.

**Deliverables**
- A review report in Word, typically 10–20 pages plus appendices.
- A test workbook in Excel, with the findings log and test sheets.
- The review plan and the data request at the start.

### 2. When to use / when not to use

| | Gap analysis (`gap-analysis`) | Compliance review (this blueprint) | Internal audit (independent audit function) |
|---|---|---|---|
| Question | Do we have what the rules require? | Does it work in practice, and can we show it? | Independent assurance to the board on governance, risk management and control |
| Object | The rulebook against governing documents, plus a limited check | One process or the framework, end to end | Areas in the board-approved, risk-based audit plan |
| Criteria | Each requirement, row by row | Requirements, the client's own procedures and supervisory expectations | The same, plus audit standards |
| Evidence | Documents, meetings, small samples | Walkthroughs, samples, data analysis, interviews | The same, documented to audit standards |
| Commissioned by | Compliance officer or management | Board, CEO or compliance officer | Board or audit committee |
| Output | Gap log and gap report | Review report with rated findings and actions | Audit report, management responses, formal follow-up |
| Independence | Advisory | Independent of the process reviewed | Organisationally separate from the functions audited; reports to the board |

**Use for:**
- A review of the whole AML/CTF framework in operation.
- A process review, e.g. a CDD/KYC file review, customer risk classification, monitoring and alert handling, investigation and FIU reporting, sanctions screening, training, or internal control by the first and second lines.
- Pre-inspection readiness.
- A post-incident review.
- Follow-up of the closure of earlier gaps or findings.
- Acting as, or supporting, the outsourced independent audit function (internal audit variant, section 13).

**Use another blueprint when:**
- The client needs a requirement-by-requirement inventory, e.g. for new rules: use `gap-analysis`.
- The client needs its ML/TF exposure assessed: use `aml-ctf-risk-assessment`.
- A risk classification, screening or monitoring model must be validated: use `model-validation-report`. A review may *check* that a validation exists and is acted on.

**Two rules:**
1. Do not call the work "internal audit" unless {{firm_name}} has been appointed to perform the independent audit function, or part of it.
2. Do not use assurance-opinion language (e.g. "reasonable assurance") unless the engagement is performed under an assurance standard. (best practice)

### 3. Inputs

**Minimum needed to start**

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| Brief fields (`_core/request-context.md`) | Placeholders, language, audience | Brief | Ask, with at most five questions |
| Object and purpose of the review, and who commissioned it | Determines scope, criteria and the reader | Engagement letter | Ask. Without it there is no review plan. |
| Review period, e.g. the last 12 months | Defines the populations and samples | Kick-off | Propose one and mark it `[TO CONFIRM]` |
| The client's governing documents for the object | These are the criteria the client set itself | Data request | Review against the regulation only, and state this as a limitation |
| Institution type, products, channels, supervisor | Applicability; risk-based focus | Brief | Ask |
| Independence check: prior involvement of {{firm_name}} in designing or remediating the object | Independence | Internal check | Stop and raise it with the engagement lead |

**Needed for a complete deliverable**

| Input | Why it is needed | If missing |
|---|---|---|
| BWRA, customer risk classification model, recent compliance and internal audit reports, supervisory findings, earlier gap analyses | Risk-based scoping; links findings to known issues | Note as a limitation |
| Population lists for the review period, e.g. customers onboarded by risk class, high-risk customers, alerts generated and closed, internal reports, FIU reports, screening hits, periodic reviews due and done | Sampling and data analysis | Use targeted samples; state that coverage is limited |
| Sampled case files and system extracts | Operating-effectiveness testing | Exception: "Evidence not provided" |
| Interviews with process owners and staff who perform the controls (roles) | Understanding of the process and its design | Note as a limitation |
| A system walkthrough or demo | Whether the systems support and enforce the procedure | Ask |
| The status of earlier actions (for follow-up reviews) | Verifying closure | Rely on evidence only |

### 4. Regulatory and professional anchors

Check every reference against the current version. State "Regulatory status as of {{date}}".

**EU baseline**
- *Current regime:* Directive (EU) 2015/849 as transposed nationally. The obliged entity must have internal controls and, where appropriate, an independent audit function.
- *AMLR:* Regulation (EU) 2024/1624, applying from 10 July 2027 `[VERIFY REFERENCE]`.
  - Art. 9(2)(b) requires internal controls and an independent audit function that tests the internal policies, procedures and controls.
  - Art. 9(4) requires AMLA guidelines on how internal controls are organised at the commercial, compliance and audit levels, and on when the audit function can be performed by an external expert.
  - Art. 11 covers the compliance manager and compliance officer, including regular reporting to the management body.
- *European guidelines:* EBA guidelines on the role of the AML/CFT compliance officer and on internal governance (three lines of defence) `[VERIFY REFERENCE: EBA/GL numbers and AMLA successors]`; EBA risk factors guidelines (EBA/GL/2021/02).

**National layer via `{{jurisdiction}}`.** **Sweden** as the worked example:
- PTL 6 kap. 1 §: procedures and guidelines for internal control, plus validation of models used in risk assessment, classification and monitoring.
- PTL 6 kap. 2 §: where justified by size and nature, a designated member of management, a compliance officer (*centralt funktionsansvarig*) and an independent audit function (*oberoende granskningsfunktion*).
- FFFS 2017:11, 6 kap.:
  - 3 §: the designated executive checks and follows up that decided measures are implemented;
  - 5 §: the compliance officer monitors and regularly checks compliance;
  - 10–13 §§: the independent audit function reviews and evaluates; is directly subordinate to the board; is organisationally separate; may be outsourced, with the company retaining responsibility;
  - 14 § ff.: model risk management and validation `[VERIFY REFERENCE]`.
- Governance rules for compliance and internal audit functions in credit institutions: FFFS 2014:1 `[VERIFY REFERENCE: applicability]`.
- Published sanction decisions and thematic reviews by Finansinspektionen and the county administrative boards, used to calibrate severity.

**Professional standards** (best practice, applied by analogy unless engaged under them)
- Internal audit variant: the IIA's Global Internal Audit Standards `[VERIFY REFERENCE: current version]`.
- Audit process and evidence: ISO 19011 (guidelines for auditing management systems).
- ABC and compliance management system audits: the internal audit clauses of ISO 37001 and ISO 37301.
- Assurance reports, only if expressly engaged: ISAE 3000 `[VERIFY REFERENCE]`.

### 5. Method

**Step 1: Frame the engagement.** Agree the following:
- **Purpose:** board assurance, compliance monitoring, pre-inspection, post-incident or follow-up.
- **Object:** the process or framework, entities, channels.
- **Criteria:** regulation, the client's procedures, supervisory expectations.
- **Review period.**
- **Review type:** design only; design and operating effectiveness; or follow-up.
- **Reporting line** and the recipient of the report.

Run the independence check. *Why:* findings are only meaningful against stated criteria and a defined period, and the reader must know whose opinion it is. (best practice)

**Step 2: Risk-based scoping and review plan.** Use the BWRA, earlier gap analyses, internal audit and supervisory findings, incidents and KRIs to choose the sub-processes and key controls with the highest risk. For each area, set out:
- the criteria;
- the key controls;
- the test procedures;
- the populations and sample sizes;
- the evidence needed.

Agree the plan with the commissioning body. *Why:* a review cannot test everything, so the selection must be explainable from the client's risks. (team audit material: the audit plan is prepared, agreed and approved before fieldwork) *Judgement:* areas the client's own BWRA rates highest, and areas with prior findings, come first.

**Step 3: Data request and opening meeting.** Send the request (`references/test-programme.md` lists the evidence per area), including the **population lists** for the review period. At the opening meeting, present the purpose, scope, criteria, timetable, contacts and the way findings will be validated. (team audit material)

**Step 4: Understand and walk through (design).**
- Read the procedures and interview the process owners and the staff who perform the controls.
- Walk one case through end to end in the system.
- Map the process with its key controls.
- Assess the design against the criteria with the *what versus how* test from `gap-analysis`: could staff perform the control consistently from the instructions?

*Why:* a well-performed control that is badly designed still fails, and testing without understanding the design produces noise. (team gap/review material)

**Step 5: Test operating effectiveness.**
- Draw samples from the populations: risk-based or targeted for known weak spots, random for coverage.
- Test each item against predefined attributes in the test sheet (`references/test-programme.md`), and record pass, exception or not applicable with the evidence reference.
- Trace cases end to end: trigger, then investigation or EDD, then decision, then subsequent handling of the customer's risk.
- Where data allows, run full-population analyses, e.g. customers without a risk class, periodic reviews overdue, alert ageing, time from alert to report, screening hits closed without rationale.

*Judgement:* a targeted sample of five is indicative only. Report results as "x of n" and never extrapolate rates from small samples. (team gap/review material: five items per category)

**Step 6: Evaluate and validate findings.**
- For each exception, decide whether it lies in the design (the procedure is missing or unclear), in the operation (the procedure is not followed) or in the documentation (it was done, but cannot be shown).
- Assess how pervasive it is, and find the root cause.
- Group exceptions into findings.
- Test every finding thoroughly before rating it, and validate the facts with the process owner.

(team audit material: findings are tested and evaluated before a corrective action request is raised) *Judgement:* an undocumented decision is treated as not demonstrated. The *outsider test* applies: can someone outside the team follow what was done and why?

**Step 7: Rate and conclude.**
- Rate each finding on the 5-level scale (section 7.1), on the basis of risk level, sanction exposure and process importance.
- Derive the overall conclusion per area (section 7.2).
- State strengths as well as weaknesses.

**Step 8: Closing meeting and responses.** Present the findings to the process owners and the compliance officer. Agree the facts, and, if the team decides to include them, collect management responses: action, owner and date `[TEAM INPUT]`. (team audit material)

**Step 9: Report.** Draft the report (section 6) and send it for a factual-accuracy review. Then finalise it and present it to the CEO or the board.

**Step 10: Follow-up.** On request, verify that the actions have been implemented *and* that they are effective. If an action is ineffective, raise a new finding rather than closing the old one. (team audit material)

### 6. Deliverable structure

Proposed section order, built on the team's gap report (team gap/review material) and extended for scope, method and per-area observations (best practice). Swedish headings are given in parentheses.

| Section | Purpose and content | Length / style |
|---|---|---|
| Cover | "Compliance review" (*Granskning*) and a subtitle naming the object, e.g. "Review of customer due diligence for high-risk customers" (*Granskning av kundkännedom för högriskkunder*). Client, period, date, version, author ({{firm_name}}), confidentiality. | — |
| Document control, TOC | Per house standards | — |
| Executive summary (*Sammanfattning*) | **Required.** Overall conclusion per area (table), 3–5 key findings, priority actions, decision required, main limitation | 1–2 pages |
| **1 Introduction** (*Inledning*) | | |
| 1.1 Background and assignment (*Bakgrund och uppdrag*) | Who commissioned the review, why, and the review type. If {{firm_name}} acts as the independent audit function, say so here. | 0.5 page |
| 1.2 Scope, criteria and limitations (*Omfattning, bedömningsgrunder och avgränsningar*) | Object, entities, review period, criteria (regulation "in the wording in force on [date]", the client's procedures by title and version), what is excluded, limitations (sample sizes, evidence not obtained) | 0.5 page |
| 1.3 Method and evidence (*Metod och underlag*) | Steps, interviews (roles), walkthroughs, and a table of tests: area, population, sample, method | 0.5–1 page |
| 1.4 Scale for assessing deficiencies (*Skala för bedömning av brister*) | The 5-level scale with its basis and forecast caveat (as in `gap-analysis`), and the overall conclusion scale | 0.5 page |
| **2 Summary of significant findings** (*Sammanfattning av signifikanta fynd*) | | |
| 2.1 Overall assessment per area (*Samlad bedömning per område*) | Table: area, design, operating effectiveness, highest finding, overall conclusion | Table + 3–5 sentences |
| 2.2 Critical deficiencies (*Kritiska brister*) | Always present; "none" stated explicitly | As needed |
| 2.3 Extensive deficiencies (*Omfattande brister*) | Short summaries with references to chapter 3 | 0.5–1 page |
| 2.4 Other deficiencies (*Övriga brister*) | Significant and minor deficiencies in summary; cross-cutting patterns | 0.5 page |
| **3 Observations per review area** (*Iakttagelser per granskningsområde*) | For each area 3.x: criteria; what we did (tests, samples); what we found ("x of n"), with strengths; assessment (risk, root cause, design or operation); rating; recommendation | 1–2 pages per area |
| **4 Action plan** (*Åtgärdsplan*) | Consolidated, prioritised and sequenced: action, finding reference, priority, suggested owner, target date; management response if agreed | Table + short text |
| **5 Concluding remarks** (*Avslutande kommentarer*) | Order of work; follow-up proposal | 0.5 page |
| Appendix A Findings log (*Bilaga A Iakttagelselogg*) | All findings in house finding format | Table or Excel |
| Appendix B Documents reviewed and interviews (*Granskade dokument och intervjuer*) | Documents with version; interviews by role and date | Table |
| Appendix C Sample testing results (*Resultat av stickprov*) | Per test: attribute results by pseudonymised item ID | Table or Excel |

*Internal audit variant:* rename the deliverable "Internal audit report" (*Internrevisionsrapport*). Include the audit plan reference, management responses and the follow-up procedure, and address the report to the board.

### 7. Scales, scoring and calculations

**7.1 Finding rating (team scale).** Use the 5-level deficiency scale from `gap-analysis` (`gap-analysis/references/rating-scales.md`) with the same descriptors and basis:

| Level | Label (*Swedish*) | House priority |
|---|---|---|
| 5 | Critical deficiencies (*Kritiska brister*) | Immediate |
| 4 | Extensive deficiencies (*Omfattande brister*) | Within about 3 months |
| 3 | Significant deficiencies (*Betydande brister*) | Within 6–12 months |
| 2 | Minor deficiencies (*Mindre brister*) | Improvement |
| 1 | No deficiencies (*Inga brister*) | — |

The basis for each rating is risk level, sanction exposure and process importance. The rating is a forecast. (team gap/review material)

**7.2 Overall conclusion per area (proposal `[TEAM INPUT]`)**

| Conclusion | Swedish | Derivation rule |
|---|---|---|
| Effective | *Ändamålsenlig* | Only minor deficiencies or none |
| Largely effective | *I huvudsak ändamålsenlig* | Highest finding Significant |
| Partially effective | *Delvis ändamålsenlig* | At least one Extensive finding |
| Not effective | *Inte ändamålsenlig* | At least one Critical finding, or several Extensive findings in the same key control |

Judgement may lower a conclusion by one level, with the reason stated. It may never raise one.

**7.3 Design and operating effectiveness per key control (proposal)**
- Design: Adequate / Partly adequate / Inadequate.
- Operating: Effective / Effective with exceptions / Not effective / Not tested.

A control cannot be "Effective" in operation if its design is Inadequate.

**7.4 Test result per sample item:** Pass / Exception / N/A, with the evidence reference. Report results as "x of n items". "Evidence not provided" counts as an exception and is flagged.

**7.5 Sampling (proposal `[TEAM INPUT]`; details in `references/review-scales-and-sampling.md`)**
- Targeted check: 5 per category (the team's practice). This is indicative only.
- Standard review: a larger risk-based sample per key control, scaled to the population and the risk.
- Full-population data analysis wherever the data allows.

### 8. Supporting artefacts

- **Review plan:** objective, object, criteria, period, areas and key controls, tests, populations and samples, timetable, contacts, reporting.
- **Data request:** evidence and population lists per area (`references/test-programme.md`).
- **Test workbook (Excel).** Sheets: Instructions; Review plan; Populations; one Test sheet per area; Findings log; Scale; Lists; Summary (`references/review-scales-and-sampling.md`).
- **Findings log columns:** the house standard finding format (ID, Area, Requirement, Observation, Assessment, Rating, Recommendation, Priority/timing, Owner), plus Criteria source, Evidence reference, Deficiency type (Design / Operation / Documentation), Root cause, Management response, Status.
- **Interview notes:** role, date, topics, facts confirmed, open points. Record no personal opinions about named individuals.
- **Follow-up tracker:** finding ID, action, owner, due date, evidence of implementation, effectiveness verified (Yes/No), status.

### 9. Writing rules specific to this deliverable

- **Every finding states its evidence and its denominator.**
  - *Good:* "In 3 of 5 sampled high-risk customer files, the source of funds was recorded without supporting documentation."
  - *Weak:* "Source of funds is often not documented."
- **Classify the deficiency type:** design ("the procedure does not say who decides…"), operation ("the procedure was not followed in…") or documentation ("the check may have been done but leaves no trace").
- **State the limits:** "The sample is targeted and indicative; it does not support conclusions on the frequency of the deficiency across the population."
- **Opinion language:** "Based on the documents reviewed, the interviews held and the samples tested, we assess that…". Avoid "the company is compliant" and avoid assurance wording.
- **No personal data or names in the report.** Refer to roles, and to sampled items by pseudonymised IDs (e.g. KYC-07). Keep the mapping in the workpapers only.
- **Root cause over symptom:** "Exceptions arise because the onboarding form does not require…", not only "fields were empty".
- **Balanced and forward-looking:** state strengths for each area, and note upcoming changes (e.g. AMLR requirements) that affect the recommended fix.
- Reuse the phrasing in `gap-analysis/references/wording-examples.md` (the red thread, the outsider test, control credit, what versus how).

### 10. Quality checklist

In addition to the house standards checklist:

- [ ] Purpose, object, criteria, review period and review type are stated in 1.1–1.2.
- [ ] The independence check has been done, and any prior involvement is disclosed.
- [ ] Each area has criteria, a design assessment, an operating test (or "not tested" with a reason), findings, a rating and a recommendation.
- [ ] Each finding has evidence, "x of n" where sampled, a deficiency type, a root cause and a priority.
- [ ] Ratings use the 5-level scale. The overall conclusions follow the derivation rule, and any deviation is explained.
- [ ] Limitations and indicative samples are stated. No rates are extrapolated from small samples.
- [ ] Findings were validated with the process owners before the draft.
- [ ] No customer names, personal identity numbers, transaction IDs or staff names appear in the report.
- [ ] The report is not called internal audit, and uses no assurance language, unless the engagement is one.
- [ ] Workpapers allow each finding to be traced to its test items and evidence.

### 11. What makes it stand out

1. **End-to-end tracing.** Cases are followed from trigger to decision to subsequent risk handling, which exposes broken links that tests of single controls miss. (team gap/review material)
2. **The outsider test.** Decisions and their reasoning must be documented so that a supervisor can follow them. "Done but not documented" is reported, not excused.
3. **Risk-based scope.** Areas are chosen from the client's own BWRA, its prior findings and published supervisory sanction practice, so effort goes where a supervisor would look.
4. **Design versus operation versus documentation.** Classifying each finding points to the right fix: rewrite the procedure, train and supervise, or fix the system and the record-keeping.
5. **One scale across the team's deliverables.** The same five levels as the gap analysis let the client compare results across engagements and track progress.
6. **Actionable remediation.** Actions come sequenced, with options and trade-offs (e.g. automated versus manual customer risk classification) and links to existing programmes.
7. **Closure means effective.** Follow-up verifies effectiveness, not just implementation.

### 12. Common pitfalls

- Calling a review "internal audit", or using audit or assurance opinions without the mandate.
- Testing without first understanding the design, which produces exceptions that are really design choices.
- Samples with no defined population, period or selection method.
- Extrapolating from five items, or hiding small samples behind percentages.
- Reporting symptoms without root causes; listing every exception as a separate finding.
- Treating undocumented actions as done.
- Overlooking the first-line controls and the compliance function's own monitoring.
- Personal data or customer identifiers in the report.
- Reviewing a process {{firm_name}} designed without disclosure.

### 13. Variants

**By object** (test steps in `references/test-programme.md`):
- Framework-wide review, using the thematic control points from `gap-analysis`.
- CDD/KYC file review (onboarding, EDD, PEP, beneficial ownership).
- Customer risk classification.
- Ongoing due diligence.
- Transaction monitoring and alert handling.
- Investigation and FIU reporting.
- Sanctions screening.
- Governance, reporting and internal control.
- Training.
- Outsourcing, agents and distributors.

**By purpose:**
- *Pre-inspection readiness:* focus on the areas in recent supervisory decisions; test documentation and the outsider test.
- *Post-incident:* root cause and similar exposures.
- *Follow-up of gap or finding closure:* test the implementation and effectiveness of each action. Rate "closed", "partly closed" or "not closed" alongside a new rating.
- *Internal audit variant (outsourced independent audit function):* audit plan approved by the board; independence; audit standards; management responses; formal follow-up `[TEAM INPUT]`.
- *Management-system audit (ISO 37001/37301):* clause-based criteria, nonconformities and corrective action requests (team audit material).

**By client type:**
- *Bank:* larger populations, so use data analytics; model-dependent monitoring (link to `model-validation-report`).
- *Payment or e-money institution:* agents and distributors, remote onboarding, high-volume monitoring.
- *Consumer credit:* remote channel; risk classification and ongoing due diligence at volume.
- *Insurance and funds:* intermediated relationships and payouts.
- *Non-financial obliged entity with a branch network:* consistency across branches; sample per branch; key-person dependency.

**By size and maturity:**
- Small entity: combine areas, use smaller samples, rely more on walkthroughs.
- Mature entity: rely on data analytics and testing of the second line's own monitoring.

### 14. How the assistant should work

1. **Read the brief.** If anything is missing, ask at most five questions, in this order: the object and purpose of the review; who commissioned it and who receives the report; the review period; whether {{firm_name}} acts as the independent audit function; and what evidence is available (procedures, populations, samples).
2. **Produce in this order:**
   1. Review plan and data request.
   2. Test sheets with attributes per area.
   3. Evaluation of the evidence supplied, item by item.
   4. Findings log.
   5. Report draft.
   6. Action plan.
3. **Never invent test results.** If samples or evidence are not supplied, produce the plan, the test sheets and the report skeleton with `[DATA NEEDED]`, and do not draft findings.
4. **Stop and ask when:**
   - an independence issue appears;
   - the evidence contains personal data that should not be in the output;
   - a finding would be rated Critical (confirm the evidence);
   - the client's procedures conflict with the regulation;
   - the review drifts into a requirement-by-requirement inventory (switch to `gap-analysis`).
5. **Text-only tools.** Present test sheets and the findings log as Markdown tables with the column headings from `references/review-scales-and-sampling.md`.
6. **Language.** For Swedish output, use the Swedish headings and scale labels given in parentheses.

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: Compliance review report

<!-- Skeleton of the main deliverable in final section order. Output language: {{language}}.
Swedish terms in parentheses are given for Swedish output. Use them when {{language}} = sv.
Guidance in [brackets] is removed before delivery. "Example:" lines are models of wording, not client facts.
Status of this structure: draft – needs team input (see SKILL.md).
The report is written by the firm. No customer names, personal identity numbers, transaction IDs or staff names:
refer to roles and pseudonymised item IDs. Do not call it internal audit unless the firm is the independent
audit function (then use the internal audit variant noted in SKILL.md section 6). -->

[Cover page]
**Compliance review** (*Granskning*)
**[Object, e.g. "Review of customer due diligence for high-risk customers" (*Granskning av kundkännedom för högriskkunder*) / "Review of alert handling and reporting to the FIU" / "Review of the AML/CTF framework in operation"]**
{{client_name}} · Review period: [YYYY-MM-DD – YYYY-MM-DD] · Date: {{date}} · Version {{version}} · Author: {{firm_name}} · Confidentiality: [default Confidential]

#### Document control (*Dokumentinformation*)

| Version | Date | Author | Change |
|---|---|---|---|
| {{version}} | {{date}} | {{firm_name}} | [Draft for factual review / Final] |

Regulatory status as of {{date}}.

#### Executive summary (*Sammanfattning*)

[Required. 1–2 pages. Conclusion first: the overall conclusion per area (Table 1), the 3–5 key findings, the priority actions, the decision required, the main limitation.]

Example: "We assess customer due diligence for high-risk customers as partially effective. The procedure is adequately designed, but in 3 of 5 sampled files the source of funds was recorded as stated by the customer and not substantiated, and in 2 of 5 the reasons for the high-risk classification were not documented. Alert handling is largely effective. We have not identified any critical deficiencies. We recommend that {{client_short}} first clarifies the EDD instruction on what evidence is required, and then introduces second-line quality checks of high-risk files. The samples are targeted and indicative."

*Table 1: Overall assessment per review area*

| Review area | Design | Operating effectiveness | Highest finding | Overall conclusion |
|---|---|---|---|---|
| [e.g. CDD – high-risk customers] | [Adequate / Partly adequate / Inadequate] | [Effective / Effective with exceptions / Not effective / Not tested] | [Extensive deficiencies] | [Partially effective] |

#### Table of contents

#### 1 Introduction (*Inledning*)

##### 1.1 Background and assignment (*Bakgrund och uppdrag*)

[Who commissioned the review, why (board assurance / compliance monitoring / pre-inspection / post-incident / follow-up) and the review type (design / design and operating effectiveness / follow-up). If {{firm_name}} acts as the independent audit function, say so. Disclose any prior involvement in the object.]

Example: "On behalf of [the board / the CEO / the compliance officer] of {{client_name}} ("{{client_short}}"), {{firm_name}} has reviewed [object]. The purpose has been to assess whether [object] is designed adequately and operates effectively in practice, and whether {{client_short}} can demonstrate this."

##### 1.2 Scope, criteria and limitations (*Omfattning, bedömningsgrunder och avgränsningar*)

[The object, the entities and channels, and the review period. Criteria: [regulation] "in the wording in force on [date]", plus the client's own procedures by title and version. What is excluded. The limitations: targeted samples, evidence not obtained, systems not accessed.]

*Table 2: Review criteria*

| Area | Regulatory criteria | Client's governing documents (version) |
|---|---|---|
| [CDD – high-risk customers] | [e.g. 3 kap. 16 § PTL; FFFS 2017:11 3 kap.] [VERIFY REFERENCE] | [CDD instruction v[x], date] |

##### 1.3 Method and evidence (*Metod och underlag*)

[Steps: review plan, opening meeting, document review, interviews (by role), walkthroughs, sample tests, data analysis, validation of findings, closing meeting.]

*Table 3: Tests performed*

| Test-ID | Area | Population (period, count) | Sample (size, selection) | Procedure |
|---|---|---|---|---|
| T-CDD-01 | [CDD – high-risk customers] | [Customers rated high risk onboarded in the period; n = [DATA NEEDED]] | [5; latest onboarded] | [File review against 9 attributes] |

##### 1.4 Scale for assessing deficiencies (*Skala för bedömning av brister*)

[Use the rationale paragraph and Table 2 from the gap-analysis template unchanged. Add the overall conclusion scale.]

*Table 4: Overall conclusion per area*

| Conclusion | Description |
|---|---|
| Effective (*Ändamålsenlig*) | Only minor deficiencies or none |
| Largely effective (*I huvudsak ändamålsenlig*) | Highest finding significant |
| Partially effective (*Delvis ändamålsenlig*) | At least one extensive deficiency |
| Not effective (*Inte ändamålsenlig*) | At least one critical deficiency, or several extensive deficiencies in the same key control |

#### 2 Summary of significant findings (*Sammanfattning av signifikanta fynd*)

##### 2.1 Overall assessment per area (*Samlad bedömning per område*)

[Refer to Table 1, plus 3–5 sentences on the overall picture, including strengths.]

##### 2.2 Critical deficiencies (*Kritiska brister*)

[Always include this section.]

Example: "We do not assess that there are any critical deficiencies within the scope of the review."

##### 2.3 Extensive deficiencies (*Omfattande brister*)

[One paragraph per finding, with a reference to chapter 3.]

##### 2.4 Other deficiencies (*Övriga brister*)

[Significant and minor deficiencies in summary, plus cross-cutting patterns: what versus how; key-person dependency; decisions not documented.]

#### 3 Observations per review area (*Iakttagelser per granskningsområde*)

##### 3.1 [Area, e.g. Customer due diligence for high-risk customers (*Kundkännedom för högriskkunder*)]

**Criteria** (*Bedömningsgrund*): [the requirement and the client's own procedure, briefly]

**What we did** (*Genomförd granskning*): [interviews (roles), walkthrough, Test-IDs, sample sizes]

**Strengths** (*Styrkor*): [what works]

**Findings** (*Iakttagelser*):

| ID | Observation (with "x of n") | Deficiency type | Root cause | Rating |
|---|---|---|---|---|
| R-CDD-01 | [In 3 of 5 sampled files (KYC-01, -03, -05) the source of funds was recorded as stated by the customer, without supporting documentation.] | [Operation] | [The EDD instruction does not specify what evidence is required] | [Extensive deficiencies] |

**Assessment** (*Bedömning*): [Why it matters: risk, sanction exposure, process importance. Design, operation or documentation. Whether the finding is pervasive.]

**Recommendation** (*Rekommendation*): [Concrete action, with what good looks like; options with trade-offs where relevant.]

Example: "Specify in the EDD instruction which documents substantiate source of funds and source of wealth for each customer type, and how the assessment of their sufficiency is recorded. Introduce a second-line quality check of a monthly sample of high-risk files, with results reported to the CEO."

##### 3.2 [Area]

#### 4 Action plan (*Åtgärdsplan*)

[Consolidated, prioritised and sequenced: foundations first. Include management responses only if agreed [TO CONFIRM: with the client].]

*Table 5: Action plan*

| A-ID | Finding(s) | Action | Priority | Suggested owner | Target date | Management response |
|---|---|---|---|---|---|---|
| A-01 | R-CDD-01 | [Clarify EDD evidence requirements in the instruction] | [Within 3 months] | [Compliance officer / Head of onboarding] | [TO CONFIRM] | [optional] |

#### 5 Concluding remarks (*Avslutande kommentarer*)

[The recommended order of work, and a proposal for follow-up (what is retested and when).]

#### Appendix A Findings log (*Bilaga A Iakttagelselogg*)

| ID | Area | Requirement | Observation | Assessment | Rating | Recommendation | Priority / timing | Owner |
|---|---|---|---|---|---|---|---|---|
| R-[area]-[nn] | | | | | | | | |

#### Appendix B Documents reviewed and interviews (*Bilaga B Granskade dokument och intervjuer*)

| Document | Version | Date |
|---|---|---|
| | | |

| Interview (role) | Date | Topics |
|---|---|---|
| [Compliance officer] | | |

#### Appendix C Sample testing results (*Bilaga C Resultat av stickprov*)

| Test-ID | Item ID | Attr. 1 | Attr. 2 | Attr. 3 | … | Result | Finding ID |
|---|---|---|---|---|---|---|---|
| T-CDD-01 | KYC-01 | Pass | Exception | Pass | | Exception | R-CDD-01 |

## Reference catalogues (inlined)

### Reference catalogue: review-scales-and-sampling.md

The finding scale is the team's own (`gap-analysis/references/rating-scales.md`). Everything else in this file is a proposal `[TEAM INPUT]`.

##### 1. Finding rating: the team's 5-level scale

| Level | Label (*Swedish*) | Descriptor (short) | Priority |
|---|---|---|---|
| 5 | Critical deficiencies (*Kritiska brister*) | Unacceptable risk level; could quickly result in extensive sanctions | Immediate |
| 4 | Extensive deficiencies (*Omfattande brister*) | Undesirable risk level if not remedied; may result in significant sanctions | Within about 3 months |
| 3 | Significant deficiencies (*Betydande brister*) | Increased risk level if not remedied; may to some extent result in sanctions | Within 6–12 months |
| 2 | Minor deficiencies (*Mindre brister*) | Improvements only; not expected to result in sanctions | Improvement |
| 1 | No deficiencies (*Inga brister*) | No apparent deficiencies | — |

**Basis for each rating:** risk level, sanction exposure (informed by published supervisory decisions) and process importance. The rating is a forecast.

**Pervasiveness adjusts the rating within the scale.** An exception in one item may be minor. The same exception across most of the items in a key control may be extensive.

##### 2. Overall conclusion per area (proposal)

| Conclusion | Swedish | Rule |
|---|---|---|
| Effective | *Ändamålsenlig* | Only minor deficiencies or none |
| Largely effective | *I huvudsak ändamålsenlig* | Highest finding Significant |
| Partially effective | *Delvis ändamålsenlig* | At least one Extensive finding |
| Not effective | *Inte ändamålsenlig* | At least one Critical finding, or several Extensive findings in the same key control |

Judgement may lower a conclusion by one level, with a stated reason. It never raises one.

##### 3. Key control assessment (proposal)

| Dimension | Values |
|---|---|
| Design | Adequate / Partly adequate / Inadequate |
| Operating effectiveness | Effective / Effective with exceptions / Not effective / Not tested |
| Deficiency type (per finding) | Design / Operation / Documentation |

##### 4. Sampling guide (proposal)

| Review type | Sample per key control or category | What it supports |
|---|---|---|
| Targeted check (the team's practice in operational review steps) | 5 latest or highest-risk items | Indicative findings; "x of 5" |
| Standard review | Risk-based and random mix, scaled to the population size and risk `[TEAM INPUT: house sample sizes]` | Findings with a stated frequency in the sample |
| Data analysis | Full population | Rates and trends (e.g. overdue reviews, alert ageing) |

**Rules**
- Define the population (source, period, filters) before selecting the sample, and record how the selection was made.
- Use targeted selection for known weak spots and random selection for coverage, and do not mix them in one rate.
- Replace an item only if it is out of scope, never because it is hard to test, and document the replacement.
- Report "x of n". Do not extrapolate from targeted or small samples.
- "Evidence not provided" counts as an exception.

##### 5. Test workbook layout (Excel)

| Sheet | Content |
|---|---|
| Instructions | Purpose, scope, criteria, period, colour legend, version log |
| Review plan | Area | Key control | Criteria | Test procedure | Population | Sample size | Selection method | Owner (client role) | Status |
| Populations | One block per population: source system, extraction date, period, filters, count |
| Test sheets (one per area) | Test-ID | Item ID (pseudonymised) | Attribute 1 … n (Pass / Exception / N/A) | Evidence reference | Comment | Exception → Finding ID |
| Findings log | ID | Area | Requirement / criterion | Criteria source | Observation | Evidence reference | Deficiency type | Root cause | Assessment | Rating | Recommendation | Priority / timing | Owner | Management response | Status |
| Scale | The 5-level scale, the overall conclusion rule, the test values |
| Lists | Dropdown values |
| Summary | Findings by area × rating; overall conclusion per area; exception counts per test |

**IDs:** findings R-[area]-[nn] (e.g. R-CDD-03); tests T-[area]-[nn]; sampled items with an area prefix (e.g. KYC-07, ALR-12). Keep the mapping from item ID to customer only in the restricted workpapers.

##### 6. Follow-up status (follow-up reviews)

| Status | Meaning |
|---|---|
| Closed – effective | Action implemented and tested as effective |
| Closed – not effective | Implemented but not effective; raise a new finding |
| Partly closed | Some elements implemented |
| Not closed | No implementation evidence |
| Superseded | Replaced by another action or a regulatory change; explain |

## Placeholders

The blueprint text uses these placeholders. Fill each one from the request brief or the inputs. If a value is not known, write `[DATA NEEDED: …]` in the deliverable; never invent it, and never leave a `{{…}}` placeholder in a finished deliverable.

- `{{client_name}}` — the client's legal name (brief: client.legal_name)
- `{{client_short}}` — the defined term for the client, e.g. "the Company" (brief: client.defined_term)
- `{{date}}` — the deliverable date (brief: engagement.date)
- `{{firm_name}}` — the issuing firm (brief: issuing_firm.name)
- `{{jurisdiction}}` — the jurisdiction(s) (brief: engagement.jurisdictions)
- `{{language}}` — the output language (brief: engagement.output_language)
- `{{version}}` — the document version (brief: engagement.version)
