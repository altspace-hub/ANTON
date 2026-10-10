# FCP blueprint: Gap analysis (gap log and gap report)

Blueprint `gap-analysis` v1.1 (stable) from the FCP blueprint library, as ANTON skill `fcp-bp-gap-analysis`. Produces a regulatory gap analysis of an obliged entity's AML/CTF framework, or of a sanctions, anti-bribery or guideline-specific framework. The output is a requirement-by-requirement gap log in Excel and a gap report in Word with a five-level deficiency rating, consolidated findings and a sequenced action plan. Covers baseline gap analyses against national AML law and supervisory regulations, regulatory-change analyses that map a new instrument against current national rules (for example the EU AMLR against the national AML act), Level 2 analyses (RTS, guidelines), remediation after supervisory or audit findings, and thematic quick scans. Use when a client needs to know what it lacks against the rules, needs an AMLR readiness assessment, or must plan remediation.

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

The output format **Gap report and gap log (blueprint)** (`bp-gap-report`) carries this blueprint's section order; selecting it attaches this skill. When another output format is selected, that format sets the layout and its own scale; keep this blueprint's method, evidence and wording rules within it.

## How references in this skill map to ANTON

The blueprint text points at files of the library it came from. In ANTON:
- `_core/house-standards.md`, `_core/glossary.md`, `_core/request-context.md`, `_core/output-formats.md` → the skill **FCP blueprint: house standards** (`fcp-bp-house-standards`). Attach it with this one for the full house rules; the essentials are in "Gap markers" above.
- `_core/risk-scales.md` → "Risk and control labels" and "Scale mapping" in the house standards skill (`fcp-bp-house-standards`), as wording only. Its matrix and aggregation rules belong to the risk-assessment blueprints and never override a score ANTON or the module supplies.
- `template.md` → the section "Deliverable template" below.
- `references/…` inlined below: `data-request-list.md`.
- The other `references/…` catalogues (`amlr-national-mapping.md`, `gap-log-layouts.md`, `other-framework-templates.md`, `rating-scales.md`, `thematic-control-points.md`, `wording-examples.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Method and quality bar (blueprint sections 1–14)

Load this blueprint together with `_core/house-standards.md`, `_core/request-context.md` and `_core/output-formats.md`. It replaces the default 4-level rating scale in the house standards with the team's 5-level deficiency scale (section 7). Catalogues and layouts are in `references/`.

### 1. Purpose and outcome

A gap analysis answers three questions about a defined set of rules. Which requirements does {{client_short}} not meet today? How serious is each gap? What must be done, by whom and in what order? It compares the client's framework with the requirements one at a time. It looks first at the governing documents, meaning what the client has decided. Where the scope includes it, it also looks at the operational procedures, meaning what the client actually does.

It produces two linked deliverables:

| Deliverable | Role | Primary reader | Typical size |
|---|---|---|---|
| **Gap log** (Excel) (*gap-logg*) | Complete and traceable record. Each requirement has one row, mapped to the current national rule, to the client's documents and to an action. | AML/CTF compliance officer (*centralt funktionsansvarig*), compliance function, workstream leads | One sheet per chapter of the reference instrument; often several hundred rows |
| **Gap report** (Word) (*rapport gap-analys*) | Consolidated view: significant deficiencies, cross-cutting patterns, action plan and order of work | CEO, management, board; the supervisor on request | 8–15 pages, with the log as Appendix 1 |

The analysis lets management approve a prioritised remediation or implementation plan, assign owners and resources, and show the supervisor that the company knows where it stands. In a regulatory-change analysis, such as AMLR readiness, the log also becomes the backbone of the implementation project's workstreams.

### 2. When to use / when not to use

**Use for:**
- **Baseline gap analysis** against the national AML/CTF act and the supervisory regulations. Typical triggers are a new authorisation, a new compliance officer, a reorganisation or an expected inspection.
- **Regulatory-change gap analysis.** This maps a new instrument against the current national rules and against the client. Examples are the AMLR mapped against the national AML act (the team's preferred template) and a Level 2 measure such as the RTS on customer due diligence.
- **Remediation after supervisory or internal audit findings.** The findings are mapped onto the full set of requirements, so the remediation covers the whole rulebook and not only the points that were cited.
- **Guideline- or framework-specific gap analysis.** Examples are EBA guidelines (e.g. remote customer onboarding), a sanctions compliance programme and an anti-bribery and corruption (ABC) programme.
- **Thematic quick scan**, where a line-by-line review would not be proportionate.

**Use another blueprint when:**

| The question is… | Use instead |
|---|---|
| Does the framework or a process work in practice, tested on samples, data and walkthroughs? | `compliance-review-report` |
| We act as the client's independent audit function (*oberoende granskningsfunktion*) | `compliance-review-report`, internal audit variant |
| How exposed is the client to ML/TF, sanctions or bribery risk? | `aml-ctf-risk-assessment`, `sanctions-risk-assessment`, `abc-risk-assessment` |
| Draft the policy or procedures that close the gaps | A policy and procedures blueprint, if available |
| Is a risk classification or monitoring model fit for purpose? | `model-validation-report` |

A gap analysis asks "do we have what the rules require?"; a review asks "does it work, and can we show it?". A gap analysis may include a limited operational verification (step 6), but if testing becomes the main object, switch to `compliance-review-report`.

### 3. Inputs

**Minimum needed to start**

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| Brief fields from `_core/request-context.md` | Placeholders, language, audience | Brief | Ask, with at most five questions |
| Reference framework(s) and regulatory baseline date | Defines the rows and what counts as a gap | Engagement letter, kick-off | Ask. Default to the version in force on {{date}} and state it. |
| Institution type, licences, group structure, supervisor | Decides which provisions apply and which are N/A | Brief, licence register | Ask. Mark applicability decisions `[TO CONFIRM]`. |
| The client's AML/CTF policy (*riktlinjer*) and main procedures (*rutiner*) | Core evidence for every row | Data request | Build only the log skeleton and the data request |
| The team's gap template, or the official text of the instrument | The row backbone. Legal text is never reproduced from memory. | Template library, Official Journal, national law database | Ask. Otherwise list requirements by article with short descriptions marked `[VERIFY REFERENCE]`. |

**Needed for a complete deliverable**

| Input | Why it is needed | If missing |
|---|---|---|
| All AML/CTF governing documents with version, date and approving body; the BWRA (*allmän riskbedömning*) and its method; the customer risk classification model | Traceability; these are the core evidence | Rate the affected rows "Cannot be assessed"; a missing BWRA method is itself a gap |
| Training plan and records; internal control plan; latest compliance officer reports to CEO and board; minutes | Training, internal control and reporting requirements | The assessment rests on wording only; say so |
| Internal audit reports and open observations; supervisory decisions and correspondence | Cross-referencing; avoids duplicate actions | Note as a limitation |
| Organisation chart, appointments of the AML/CTF roles, outsourcing, agents and distributors; system overview | Governance requirements; whether procedures can be operated | `[TO CONFIRM]` in the clarification meeting; ask for a demo |
| Operational samples (step 6) | Paper versus practice | Leave step 6 out and state the limitation |
| Published sanction decisions and supervisory statements for the sector; previous gap analyses | Calibrating severity; avoiding rework | Use public sources; note if none exist |

### 4. Regulatory and professional anchors

Regulation must always be checked against the current consolidated version. State the baseline as "in the wording in force on {{date}}" (*i lydelse gällande den …*).

**EU baseline**
- *Current regime:* Directive (EU) 2015/849 (AMLD4), as amended, transposed into national law.
- *New AML package:* Regulation (EU) 2024/1624 (AMLR) is directly applicable and applies from 10 July 2027 `[VERIFY REFERENCE: application dates and transitional provisions]`. The package also includes Directive (EU) 2024/1640 (AMLD6) and Regulation (EU) 2024/1620 establishing AMLA. The AMLR largely replaces the national rules on obliged entities' duties. The national layer then shrinks to options, supervision and sanctions.
- Regulation (EU) 2023/1113 on information accompanying transfers of funds and certain crypto-assets.
- *Level 2:* RTS, ITS and AMLA guidelines. Under the AMLR several are due by 10 July 2026, for example guidelines on the minimum content of the BWRA (Art. 10(4)) and on internal policies and controls (Art. 9(4)), and RTS on customer due diligence (Art. 28(1)). `[VERIFY REFERENCE: adoption status]` Never treat a draft as final.
- *European guidelines:* EBA ML/TF risk factors guidelines (EBA/GL/2021/02); EBA guidelines on remote customer onboarding solutions under Article 13(1) of Directive (EU) 2015/849 `[VERIFY REFERENCE: EBA/GL number]`; EBA guidelines on the AML/CFT compliance officer `[VERIFY REFERENCE]`. Check whether AMLA has replaced them.

**National layer via `{{jurisdiction}}`.** For each jurisdiction this covers the national AML act, the supervisory regulations, the supervisor's guidance and its published sanction decisions. **Sweden** as the worked example:
- *Lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism* (PTL), and *lag (2017:631) om registrering av verkliga huvudmän*.
- *FFFS 2017:11* (Finansinspektionen) for the entities it supervises.
- For obliged entities supervised by a county administrative board (*länsstyrelsen*): that board's AML regulations `[VERIFY REFERENCE: current regulation number and wording]`.
- For governance of internal rules, such as approval level and annual review: *FFFS 2014:1* where applicable `[VERIFY REFERENCE: applicability by institution type]`.
- Published sanction decisions and statements by Finansinspektionen and the county administrative boards, used to calibrate severity.
- National law is being adapted to the AMLR and AMLD6 `[VERIFY REFERENCE: status of Swedish legislation]`. Until the application date the current national rules apply, and an AMLR mapping is preparatory.

**Other frameworks:** FATF Recommendations. For sanctions: EU and UN regimes, and OFAC's framework for sanctions compliance commitments `[VERIFY REFERENCE]`. For ABC: the World Bank Group Integrity Compliance Guidelines and ISO 37001. For compliance management systems: ISO 37301.

**Professional anchor:** no formal standard governs gap analyses. Our ratings are a professional forecast of how a supervisor would view a deficiency, and the report says so (section 7).

### 5. Method

**Step 1: Scope and baseline (kick-off).** Agree with the compliance officer: the reference framework(s) (e.g. "PTL and FFFS 2017:11", "AMLR mapped against PTL", "draft RTS on CDD"); the baseline date; documents only or documents plus targeted operational review; entities and business lines; output language and whether the log is bilingual; and whether internal audit or supervisory findings are cross-referenced. *Why:* the scope defines what a gap is, and a gap log without a baseline date is wrong the day the rules change. *Judgement:* before the AMLR applies, decide whether to assess against the AMLR only or also against current law. Assess against both if the client has known weaknesses under current law, because those must be fixed now.

**Step 2: Data request.** Send the document request (`references/data-request-list.md`) straight after the kick-off. Ask for the latest approved versions with approval date and body. *Why:* traceability depends on knowing exactly which version was assessed. *Judgement:* ask for operational evidence only in step 6, and only for material areas.

**Step 3: Build the log, map the rules and decide applicability.**
- Choose the layout (section 8; `references/gap-log-layouts.md`).
- Rows follow the reference instrument at paragraph level, plus point level where a point carries its own obligation. Number them as in the instrument (e.g. 20.1 = Article 20(1)).
- In a change analysis, map each row to the corresponding current national provision(s) and quote them in the adjacent column. A blank means "no current equivalent", i.e. a new requirement. `references/amlr-national-mapping.md` gives the team's mapping as a starting point.
- Pre-assess applicability. Provisions addressed to Member States, supervisors, the Commission or AMLA, or to other types of obliged entity, get N/A with a reason, e.g. "Addressed to Member States" or "{{client_short}} is not the ultimate parent of a group".
- Rows that announce Level 2 measures are flagged *Observe*.

*Why:* the backbone makes the analysis complete and auditable, and deciding applicability early saves time. *Judgement:* never delete rows. N/A rows stay visible with their reason.

**Step 4: Desk review (row by row).** For each applicable row:
1. Locate where the client's documents address the requirement: document and section, or "Not mentioned" (*Nämns inte*).
2. Test **coverage**: does the text cover every element of the requirement?
3. Test **operability**: does it say *how*, i.e. who does what, when, with which tool and documentation? Saying only *that* it shall be done is not enough.
4. Write the gap description. Set GAP and GAP classification, and propose an action and a responsible function.

In a change analysis, the first sentence of "Extent of GAP" states the regulatory delta. Examples: "New requirement; no equivalent in current national law." "Equivalent to 3 kap. 12 § PTL but more detailed: adds …"

*Why:* supervisors test both coverage and operability. Governing documents that state *what* but not *how* are one of the most common cross-cutting deficiencies, especially where many staff in branches or shops carry out the measures. *Judgement:*
- Where the client does not use an option in the rules, such as simplified measures or delayed verification, decide whether this is a risk-appetite choice or an omission. Write it down and mark it `[TO CONFIRM]`.
- Where the wording is right but there is no evidence of application, say that the assessment rests on the wording only.

**Step 5: Clarification meeting(s).** Send a short list of open questions (section 8), then meet the compliance officer and the relevant process owners. Record each resolution in the log, e.g. "Initially flagged because …; clarified at the meeting on [date] that …; no gap." *Why:* this prevents false positives and builds client ownership. *Judgement:* resolve every "unclear" before the final version, or classify the row as "Cannot be assessed" and state what is needed.

**Step 6: Operational verification (optional).** Limit this to material processes and to areas where the document review suggests weaknesses. The team's model request:
- the latest report from the responsible function to the CEO;
- minutes of the two latest monitoring or review meetings, with supporting material;
- the five latest internal reports of suspected ML/TF;
- five files on high-risk customers, with system extracts;
- the five latest reports to the FIU, including the CDD measures taken afterwards;
- a demo of the customer system.

Trace each case end to end: trigger, investigation or EDD, decision to report or not, and subsequent risk handling of the customer. *Why:* this shows whether procedures are followed and whether decisions leave an audit trail an outsider can follow. *Judgement:* samples of five are indicative. Say so and do not extrapolate rates.

**Step 7: Rate and calibrate.** Apply the scale in section 7. Rate on three factors:
- the risk level the gap exposes the client to;
- the sanction risk if the supervisor examines the area, informed by published sanction decisions, including decisions against peers;
- the importance of the process. The BWRA, customer risk classification, CDD, and investigation and reporting to the FIU weigh most.

Check consistency: a requirement and its sub-points carry consistent ratings, and the same gap gets the same rating on every sheet. *Judgement:* at a boundary, choose one level and use the text to nuance it ("these deficiencies border on critical").

**Step 8: Consolidate.** Group the row-level gaps into a few findings per area. Write critical and extensive deficiencies up individually. Summarise significant and minor ones and refer to the log. Look for cross-cutting patterns:
- "what, not how";
- dependency on a key person;
- no documented BWRA method;
- typologies (*modus*) not described;
- controls credited in the BWRA with no evidence that they work;
- decisions not documented.

*Why:* hundreds of rows do not help a board, and patterns reveal root causes and efficient fixes.

**Step 9: Action plan.**
- For each area, set out concrete actions (what to build or change, with content requirements), a suggested owner (a function), a priority taken from the rating, and the order of work.
- Put foundations first. The BWRA, with a documented method, usually comes first because customer risk classification, monitoring, controls and training depend on it.
- Indicate effort qualitatively, e.g. "structural; limited effort" or "requires identifying and evaluating controls; larger effort".
- Where there are real options, such as automated versus manual customer risk classification, present both with their trade-offs.
- Link actions to existing programmes and open observations; minor deficiencies are usually closed in parallel as documents are rewritten.

**Step 10: Report, factual review and handover.** Draft the report (section 6) and send it with the log for a factual-accuracy check. Hold a closing meeting, then finalise. If the client will run remediation from the log, hand it over in the tracker layout with workstream, stakeholder, responsible and status columns.

### 6. Deliverable structure

#### 6.1 Gap report (Word): the team's section order

| Section | Purpose and content | Length / style |
|---|---|---|
| Cover | "Gap analysis" (*Gap-analys*), with a scope subtitle such as "AML/CTF governing documents and operational procedures" (*AML/CTF-styrdokument och operativa rutiner*) or "AMLR readiness". Client, date, author ({{firm_name}}), version, confidentiality. | — |
| Document control, TOC | Per house standards | — |
| *Executive summary (conditional)* | Required when the board is the audience or the report runs beyond about 12 pages. Contents: overall conclusion, number of gaps per level, the 3–5 themes, first actions, decision required. | 1 page |
| **1 Introduction** (*Inledning*) | | |
| 1.1 Background and assignment (*Bakgrund och uppdrag*) | Who commissioned what. The rules assessed "in the wording in force on [date]". Other sources considered (sanction decisions, statements). Step 1 and step 2 described. The list of evidence requested, any system demo, and signposts to chapters 2 and 3 and Appendix 1. | 0.5–1 page; factual, past tense |
| 1.2 Scale for assessing deficiencies (*Skala för bedömning av brister*) | The basis for rating plus the forecast caveat (section 7.3), and the scale table | 0.5 page |
| *1.3 Regulatory mapping approach (change analyses only)* | How the new and current rules were mapped, the status of Level 2 measures, and what is outside scope | 0.5 page |
| **2 Summary of significant findings** (*Sammanfattning av signifikanta fynd*) | | |
| 2.1 Critical deficiencies (*Kritiska brister*) | Always present. If there are none, say so: "We do not assess that there are any critical deficiencies." | As needed |
| 2.2 Extensive deficiencies (*Omfattande brister*) | One subsection per area, e.g. 2.2.1 Internal control and compliance, 2.2.2 Business-wide risk assessment, 2.2.3 Investigation of alerts and reporting to the FIU. Each covers: the requirement and supervisory expectation (2–4 sentences); strengths observed; what we found, with evidence; why it matters; and the conclusion with its rating. | 0.5–1.5 pages per area |
| 2.3 Other deficiencies (*Övriga brister*) | Significant and minor deficiencies in summary, why they rank lower (e.g. "easy to remedy; would likely lead to a remark rather than a sanction"), cross-cutting observations, and a reference to Appendix 1 | 0.5 page |
| **3 Action plan** (*Åtgärdsplan*) | Subsections by area, mirroring chapter 2, plus structural actions. The team's model: 3.1 Business-wide risk assessment; 3.2 Structure and content of governing documents (*struktur och innehåll i styrande dokument*), with a proposed hierarchy from policy to topic instructions; 3.3 Documentation of measures (3.3.1 CDD, 3.3.2 Customer risk assessment, 3.3.3 Investigation and reporting); 3.4 Internal control of key controls (*intern kontroll av nyckelkontroller*). Each gives bullet actions, what good looks like, options and trade-offs, and the suggested owner. Optionally end with an action table. | 2–4 pages; directive ("we recommend…") |
| **4 Concluding remarks** (*Avslutande kommentarer*) | Recommended order of work (foundation first), how the minor items are absorbed, follow-up | 0.5 page |
| Appendix 1 Gap log (*Bilaga 1 Gap-logg*) | The Excel log, referenced by sheet and row ID | — |
| Appendix 2 Documents reviewed (optional) | Title, version, date, approving body | Table |

*Change analyses:* organise chapter 2 by change theme and open it with a regulatory delta table (`template.md`). Turn chapter 3 into an implementation roadmap by workstream, with milestones up to the application date.

#### 6.2 Gap log (Excel): preferred layout

The preferred layout maps the AMLR against national law. It has one sheet per AMLR chapter:
1. General provisions
2. Internal policies
3. CDD
4. BO transparency
5. Reporting obligations
6. Information sharing
7. Data protection and record retention
8. Measures to mitigate risks deriving from anonymous instruments
9. Final provisions

Add a **Scale** sheet, and **Instructions**, **Lists** and **Summary** sheets per `_core/output-formats.md`. The team has marked the manual paragraph-overview sheet in older templates as "consider removing". Generate the summary from the log instead.

| # | Column | Content |
|---|---|---|
| 1 | Article | Reference to article and paragraph (e.g. 20.1) |
| 2 | Description | Requirement text from the official source |
| 3 | [National act] reference, e.g. "Lag (2017:630) …" | Corresponding current provision(s), e.g. "3 kap. 12 § PTL"; blank if new [Current regulatory framework] |
| 4 | (national text) | Quoted national provision |
| 5 | Extent of GAP | [Analysis]: regulatory delta first, then the client's position and why this is or is not sufficient |
| 6 | Initial assessment | [Suggestion(s) on what to be done]: first view, refined in "Action" |
| 7 | Descriptions in internal regulations | [If applicable]: document, section and summary of what it says, or "Not mentioned" |
| 8 | Procedure description | [If applicable]: how the procedure works in practice and what evidence was seen |
| 9 | GAP | YES / NO / N/A |
| 10 | GAP classification | Critical gaps – No gaps (Compliant) |
| 11 | Action | [Suggested actions]: concrete |
| 12 | Responsible | [Suggestion on responsible]: function, not person |

Layouts for the variants (implementation tracker, national-law log, client extensions, thematic, guideline-based and document evidence matrix) are in `references/gap-log-layouts.md`.

### 7. Scales, scoring and calculations

**7.1 GAP (YES / NO / N/A)**
- **YES** means a requirement element is not met, in documents or in practice.
- **NO** means it is met as far as the evidence shows.
- **N/A** means the provision does not apply to {{client_short}}, and the reason is stated.

Working drafts may use "Unclear" (*Kanske*). It must be resolved before final.

**7.2 GAP classification (5 levels).** This is the team's standard scale for gap logs and gap reports.

| Level | English (log dropdown) | Swedish | Descriptor | Expected action | Priority (house mapping) | Colour, if used |
|---|---|---|---|---|---|---|
| 5 | Critical gaps | Kritiska brister | One or more serious deficiencies that expose {{client_short}} to an unacceptable level of risk. Could quickly result in extensive sanctions. | Immediately | Immediate | Red |
| 4 | Extensive gaps | Omfattande brister | One or more significant deficiencies that, if not remedied, cause an undesirable level of risk. May result in significant sanctions. | As soon as possible | Within about 3 months | Orange |
| 3 | Significant gaps | Betydande brister | Deficiencies that, if not remedied, mean an increased level of risk. May to some extent result in sanctions. | Within a reasonable time | Within 6–12 months | Yellow |
| 2 | Minor gaps | Mindre brister | Only minor deficiencies. Improvement recommendations may be given. Not expected to result in sanctions. | When documents are next updated | Improvement | Light green |
| 1 | No gaps (Compliant) | Inga brister | No apparent deficiencies identified. Improvement recommendations may still be given. | — | — | Green |
| — | N/A | Ej tillämpligt | Provision does not apply | — | — | Grey |
| — | Cannot be assessed | Kan inte bedömas | Evidence not obtained; state what is needed | Obtain evidence | `[DATA NEEDED]` | Hatched or white |

Always show the label as well as any colour.

**7.3 Basis for the rating.** Report 1.2 explains the basis, paraphrased in `{{language}}`. The rating expresses our assessment of how serious a deficiency is, in relation to three things: the risk level it exposes {{client_short}} to, the risk of a sanction if the supervisor examines the area, and the importance of the process for the AML/CTF framework to work. The BWRA, customer risk classification, CDD, and investigation and reporting to the FIU are examples of particularly important processes. The rating is therefore partly subjective. It is a forecast based on our experience of how supervisors view deficiencies, not a statement of fact.

**7.4 Evidence status.** Never rate "No gaps" when evidence is missing. Distinguish *no record* (the document does not exist) from *record not obtained* (the document was not provided). The document evidence matrix uses + (record), X (no record) and NO DATA (records not obtained).

**7.5 Aggregation.** Do not calculate averages or scores. The Summary sheet counts rows by chapter and classification and lists every critical and extensive row. The overall conclusion is stated in words, from the highest level present and how concentrated the gaps are, e.g. "no critical deficiencies; extensive deficiencies in three areas: …".

**7.6 Other scales in team templates.** The tracker and guideline variants use other scales. `references/rating-scales.md` defines them and maps each to the 5-level scale. Never mix scales within one deliverable.

### 8. Supporting artefacts

- **Gap log workbook.** Sheets: Instructions; one sheet per chapter (or per law or regulation); Scale; Lists (dropdowns: GAP, classification, status); Summary (counts by chapter × classification, critical and extensive rows, open "Cannot be assessed" items). Each assessed row gets a unique ID, e.g. GAP-3-014 (sheet 3, row 14). Use dropdowns from the Lists sheet; the older client logs show "#REF!" because their criteria sheet was deleted.
- **Data request**, step 1 and step 2: `references/data-request-list.md`.
- **Clarification question list.** Columns: Q-ID | Log row ID | Question | Answer | Answered by (role) | Date | Effect on the assessment.
- **Action plan table.** Columns: A-ID | Area | Action | Linked log rows | Priority | Suggested owner | Effort (qualitative) | Dependency | Target date | Status.
- **Regulatory delta table** (change analyses only): see `template.md`.
- **Catalogues:** `references/thematic-control-points.md` (quick scans) and `references/other-framework-templates.md` (ABC, sanctions, EBA guidelines, readiness quick scan).

### 9. Writing rules specific to this deliverable

- **Gap description pattern:** requirement element → what the client's document or practice says, with its section → why that is insufficient → consequence. Lead with the conclusion.
  - *Weak:* "The policy is insufficient regarding PEPs."
  - *Good:* "The guideline neither defines PEP nor refers to the CDD handbook, which does contain the definition (section 9.3). We assess this as a minor gap: the requirement is met in practice, but the guideline should reflect it."
- **Traceability:** every NO and YES cites document and section, or "Not mentioned". Do not write "See above" chains; reference the row ID instead.
- **Basis stated when limited:** "This assessment rests solely on the guideline matching the wording of the regulation; we have not seen evidence that it is applied."
- **Options not used:** "The option is not mentioned, which may reflect the company's risk appetite or be an omission. `[TO CONFIRM]`"
- **N/A always has a reason**, in one line.
- **Report conclusions use the scale label:** "Overall, extensive deficiencies exist regarding …" (*Sammantaget föreligger omfattande brister avseende …*). Signal boundary cases in words ("bordering on critical") rather than inventing intermediate levels.
- **Balanced:** state the strengths before the weaknesses in each area, e.g. "The company has a BWRA and a clear risk mindset throughout its documents; however, …".
- **Actions are specific:**
  - *Weak:* "Update the procedure."
  - *Good:* "Draw up a procedure for investigation and reporting that states who does what, escalation, how investigations are documented, prioritisation of alerts, internal deadlines, who decides that reasonable grounds exist, how reports are filed and how the customer is handled afterwards."
- **"No gaps" wording:** write "no apparent deficiencies identified", never "fully compliant".
- **Translations:** if the log quotes national law in another language, label it "unofficial translation".
- More phrasing in English and Swedish: `references/wording-examples.md`.

### 10. Quality checklist

In addition to the house standards checklist:

- [ ] The reference framework(s) and the baseline date are stated in the report and on the log's Instructions sheet.
- [ ] Every row has GAP set. Every N/A row has a reason. No "Unclear" remains.
- [ ] Every YES has a description, classification, action and responsible function. Every NO cites where the requirement is met.
- [ ] "Cannot be assessed" rows are listed, with the evidence needed.
- [ ] Ratings are consistent across sub-points and sheets. Every critical and extensive row appears in report chapter 2.
- [ ] In change analyses, each row's regulatory delta is stated, Level 2 rows are flagged Observe, and no draft measure is presented as final.
- [ ] National provision references were checked against the current text. Template references were not copied blindly.
- [ ] Section 2.1 exists even when there are no critical deficiencies.
- [ ] The action plan is sequenced, with foundations first, and links to existing audit or supervisory observations.
- [ ] Strengths are stated in each area of chapter 2.
- [ ] Dropdowns work (no "#REF!"). The summary is calculated, not typed.
- [ ] No client names, system names or file names of other clients appear anywhere, including sheet names and comments.

### 11. What makes it stand out

1. **Four-way traceability.** Each row links the new requirement, the current national provision, the exact section of the client's document and the client's actual practice. A generic gap list stops at "requirement – yes/no".
2. **Paper versus practice.** The two-step method (document review, then targeted verification of material processes on small samples) catches procedures that exist on paper but are not followed, or that leave no audit trail.
3. **"What versus how" test.** Governing documents are judged on whether staff could carry out the measure consistently from them. This is the weakness supervisors most often cite.
4. **Calibrated severity.** Ratings combine risk level, likely sanction exposure (informed by published sanction decisions, including against peers) and process importance, with an explicit forecast caveat.
5. **From hundreds of rows to a few decisions.** Findings are consolidated into themes with root causes, and actions come in a defensible order (foundation first) with an indication of effort and real options.
6. **Risk-based insight inside a compliance exercise.** For example, a BWRA gap is assessed by whether typologies (*modus*) are described, sources are cited, and the chain from inherent risk through control effectiveness to residual risk can be followed. A control only lowers inherent risk if there is evidence it is applied and works.
7. **Built to be used afterwards.** Tracker columns turn the log into the client's implementation tool, cross-references prevent duplicate actions, and Observe rows keep it current as AMLA delivers Level 2 measures.

### 12. Common pitfalls

- Copying the law into the log and marking YES or NO with no description.
- Treating one sentence in a policy as compliance ("paper compliance").
- Rating missing evidence as "No gaps", or confusing "not provided" with "does not exist".
- Marking applicable provisions N/A (e.g. group provisions, agents and distributors) or leaving N/A unexplained.
- In AMLR mapping: assuming the national provisions will survive, mapping to the wrong chapter (one team template points to "4 kap." where "3 kap. 4–6 och 13 §§ PTL" is meant), ignoring Level 2 measures, or quoting a draft RTS as final.
- A report that repeats the log, or lists fifty equal items with no order of work.
- Generic actions ("update the policy") with no content requirements.
- Unofficial translations presented as the law; sales messages inside the deliverable.

### 13. Variants

**By purpose.** The team has eight template variants: AMLR mapped to national law (preferred), implementation tracker, national law and regulations, post-supervisory remediation, thematic quick scan, guideline-specific, sanctions or ABC programme, and readiness self-assessment (a client pre-scan, not a substitute for a gap analysis). `references/gap-log-layouts.md` gives when to use each and its exact columns.

**By client type** (where to look hardest):
- *Bank or credit market company:* full scope; group provisions, correspondent relationships, model risk management.
- *Payment or e-money institution:* agents and distributors, the e-money exemption, remote onboarding, virtual IBANs, monitoring "how" at high volumes.
- *Insurance:* life and investment-related insurance provisions; alternatives to termination for life contracts.
- *Fund manager or investment firm:* intermediated distribution; Level 2 simplified measures for collective investment undertakings `[VERIFY REFERENCE]`.
- *Consumer credit:* remote channel, customer risk classification, ongoing due diligence.
- *Crypto-asset service provider:* the lower CDD threshold, the travel rule, self-hosted addresses.
- *Non-financial obliged entity supervised by a county administrative board (e.g. pawnbroker):* that board's regulations; branch networks, where detailed instructions are essential; key-person dependency.

**By size:** for small entities, check proportionality decisions, such as whether to appoint the three AML/CTF functions "where justified by size and nature". The absence of a function is not in itself a gap, but the documented reasoning must exist.

**By maturity:**
- First analysis: full line-by-line review.
- Mature client: delta-only (new rules) or a thematic scan.
- After supervisory findings: map each finding onto the rulebook and check for similar gaps elsewhere.

### 14. How the assistant should work

1. **Read the brief.** If it is incomplete, ask at most five questions, in this order: reference framework and baseline date; institution type and licences; scope (documents only, or with operational verification); outputs (log, report or both) and language; whether the team's template or the official text is supplied.
2. **Never reproduce legal text from memory.** Use the supplied template or official text. If none is available, list requirements by article with a short paraphrase and `[VERIFY REFERENCE]`, and ask for the source.
3. **Produce in this order:**
   1. Scoping note and data request.
   2. Log skeleton with mapping and applicability.
   3. Row assessments based on the documents supplied.
   4. Clarification question list.
   5. Consolidated findings with ratings.
   6. Report draft.
   7. Action plan.
   Share the skeleton and the first chapter before completing all chapters if the volume is large.
4. **Stop and ask when:**
   - an area has no documents (rate it "Cannot be assessed" meanwhile);
   - document versions conflict;
   - applicability is unclear;
   - a rating would be Critical (confirm the evidence first);
   - the client's choice of options may reflect risk appetite.
5. **Text-only tools.** Output the log as one Markdown table per sheet, with the exact column headings from section 6.2, or as CSV-ready text. Mark the dropdown fields with their allowed values.
6. **Language.** For Swedish output, use the Swedish labels in parentheses here and in `template.md`.

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: Gap analysis report with gap log (Appendix 1)

<!-- Skeleton of the main deliverable in final section order. Output language: {{language}}.
Swedish terms in parentheses come from the team's Swedish material. Use them when {{language}} = sv.
Guidance in [brackets] is removed before delivery. "Example:" lines are models of wording, not client facts.
The report is written by the firm (author_of_record: firm). Use "we" sparingly and never market the firm.
The full row-by-row results live in the gap log (Excel); the report consolidates them. -->

[Cover page]
**Gap analysis** (*Gap-analys*)
**[Scope subtitle, e.g. "AML/CTF governing documents and operational procedures" (*AML/CTF-styrdokument och operativa rutiner*) / "Readiness for Regulation (EU) 2024/1624 (AMLR)" / "Draft RTS on customer due diligence"]**
Company: {{client_name}} · Date: {{date}} · Version {{version}} · Author: {{firm_name}} · Confidentiality: [default Confidential]

#### Document control (*Dokumentinformation*)

| Version | Date | Author | Change |
|---|---|---|---|
| {{version}} | {{date}} | {{firm_name}} | [Draft for factual review / Final] |

Regulatory status as of {{date}}.

#### Executive summary (*Sammanfattning*)

[Conditional. Include when the board is the audience or the report runs beyond about 12 pages. Otherwise chapter 2 serves as the summary. One page. Cover: overall conclusion; number of gaps per level; the 3–5 themes; the first actions in order; the decision required.]

Example: "We do not assess that there are any critical deficiencies. We have identified extensive deficiencies in three areas: internal control and compliance, the business-wide risk assessment, and the investigation of alerts and reporting to the FIU. Across the governing documents, a recurring weakness is that they state what shall be done but not how. We recommend that {{client_short}} starts by updating the business-wide risk assessment and its method, because the other actions build on it. Management is asked to approve the action plan in chapter 3 and to appoint owners."

*Table 1: Number of identified gaps per area and classification*

| Area | Critical gaps | Extensive gaps | Significant gaps | Minor gaps | No gaps | N/A |
|---|---|---|---|---|---|---|
| [e.g. Risk assessment and procedures] | | | | | | |
| **Total** | | | | | | |

#### Table of contents

#### 1 Introduction (*Inledning*)

##### 1.1 Background and assignment (*Bakgrund och uppdrag*)

[Who commissioned the analysis and why. The reference framework "in the wording in force on [date]". Other sources considered. The method in steps. The evidence requested in step 2. Any system demo. Signposts to chapters 2 and 3 and to Appendix 1. Factual, past tense, 0.5–1 page.]

Example: "{{firm_name}} has been engaged by {{client_name}} ("{{client_short}}") to carry out a gap analysis of {{client_short}}'s compliance with the anti-money laundering rules. The analysis was carried out in two steps.

In the first step, we reviewed the documentation {{client_short}} has drawn up to meet the requirements of [the national AML act] and [the supervisory regulations], in the wording in force on [date]. We also considered the views and statements in [published sanction decisions / supervisory statements, described generically]. The main results are presented in chapter 2. The complete gap analysis is documented in an Excel workbook, see Appendix 1.

In the second step, we reviewed and quality-checked {{client_short}}'s operational processes, to establish whether they are carried out in line with the governing documents. We limited the information request to material processes and to the areas where the document review indicated possible deficiencies. We requested the following:
- the latest report from [the responsible function] to the CEO on internal control;
- the minutes of the two latest [monitoring/review] meetings, including the supporting documentation;
- the five latest internal reports of suspected money laundering or terrorist financing;
- five customer files, with system extracts, for customers rated high risk;
- the five latest reports to the FIU, including the customer due diligence measures taken during and after the investigation.

We also received a demonstration of {{client_short}}'s customer system, to assess how it guides staff through customer due diligence. Our proposed actions are presented in chapter 3."

[Change analyses: replace step 2 with the mapping step. "Each article of [new instrument] was mapped to the corresponding provision(s) of [current national act/regulations]. Where no corresponding provision exists, the requirement is treated as new."]

##### 1.2 Scale for assessing deficiencies (*Skala för bedömning av brister*)

[The rationale paragraph and the scale table. Do not change the descriptors between engagements.]

Example: "We use a scale from 'critical deficiencies' to 'no deficiencies'. The scale expresses our assessment of how serious a deficiency is, in relation to the level of risk it exposes {{client_short}} to and the risk of a sanction if the supervisor were to examine the area. We also consider how important the process is for the measures against money laundering and terrorist financing to work. The business-wide risk assessment, customer risk classification, customer due diligence and the investigation and reporting of suspicious activity are examples of particularly important areas. The assessment is therefore partly subjective. It rests on a forecast of how supervisors value deficiencies, and should be read as a forecast based on our collective experience, not as a statement of fact."

*Table 2: Scale for assessing deficiencies*

| Rating | Description |
|---|---|
| Critical deficiencies (*Kritiska brister*) | One or more serious deficiencies, which expose {{client_short}} to an unacceptable level of risk. We recommend immediate action. Could quickly result in extensive sanctions. |
| Extensive deficiencies (*Omfattande brister*) | One or more significant deficiencies which, if not remedied, cause an undesirable level of risk. We recommend action as soon as possible. May result in significant sanctions. |
| Significant deficiencies (*Betydande brister*) | One or more deficiencies which, if not remedied, mean an increased level of risk. We recommend corrective action within a reasonable time. May to some extent result in sanctions. |
| Minor deficiencies (*Mindre brister*) | Only minor deficiencies have been identified. Recommendations for improvement may be given. Not expected to result in sanctions. |
| No deficiencies (*Inga brister*) | No apparent deficiencies have been identified. Recommendations for improvement may still be given. |

##### 1.3 Regulatory mapping approach (*Regelverksunderlag och mappning*)

[Change analyses only. Describe the instruments mapped and their status (adopted / draft), Level 2 measures pending and how they are flagged (Observe), the national provisions still applicable until the application date, and any exclusions. Mark uncertain references [VERIFY REFERENCE].]

*Table 3: Regulatory delta per theme (change analyses only)*

| Theme | New requirement (article) | Current national rule | Change (New / Amended / Unchanged) | Impact on {{client_short}} | Classification |
|---|---|---|---|---|---|
| [e.g. Business-wide risk assessment] | [AMLR Art. 10] | [2 kap. 1–2 §§ PTL; 2 kap. 1 § FFFS 2017:11] | [Amended] | [e.g. approval by management body; Annex I–III factors] | [Significant gaps] |

#### 2 Summary of significant findings (*Sammanfattning av signifikanta fynd*)

[Optional opening paragraph: overall assessment in two or three sentences.]

##### 2.1 Critical deficiencies (*Kritiska brister*)

[Always include this section. Write each critical deficiency up as in 2.2. If there are none:]

Example: "We do not assess that there are any critical deficiencies in {{client_short}}'s operations."

##### 2.2 Extensive deficiencies (*Omfattande brister*)

###### 2.2.1 [Area, e.g. Internal control and compliance (*Intern kontroll och regelefterlevnad*)]

[Structure for each area, 0.5–1.5 pages:
1. The requirement and the supervisory expectation, in 2–4 sentences, with references.
2. Strengths observed.
3. What we found, with evidence: document and section, samples, meetings.
4. Why it matters: risk and sanction exposure.
5. Conclusion with the scale label, nuanced in words if needed.]

Example: "The AML rules build internal control on the three lines of defence. … Given {{client_short}}'s size, complexity and risk profile compared with other entities under the same supervisor, we consider that there should be clear, documented considerations of roles and responsibilities for internal control and compliance. During the review we understood that the written reporting to the CEO described in the policy does not take place. Instead, the CEO attends monthly follow-up meetings, whose minutes are very brief. In the material we received, there is in practice no documentation showing that {{client_short}} follows up and checks that key AML processes work, such as customer due diligence and the reporting of suspicions. The CEO and the board therefore lack structured information on which to assess the status of these processes. Overall, extensive deficiencies exist regarding {{client_short}}'s compliance with the requirements on internal control. These deficiencies border on critical, and remediation should be prioritised."

###### 2.2.2 [Area, e.g. Business-wide risk assessment (*Allmän riskbedömning*)]

Example: "We note that {{client_short}} has a business-wide risk assessment, and that a clear risk mindset runs through all its documents. Overall, we assess that {{client_short}} has a reasonably good understanding of the risks it is exposed to. However, we do not assess that the risk assessment itself is structured clearly, rigorously and concretely enough. First, it lacks an analysis of the methods (*modus*) by which {{client_short}} could be used for money laundering and terrorist financing. Second, it does not show how the risks were identified: there are no references to national or supranational risk assessments, supervisory information or {{client_short}}'s own reporting. Third, it lacks an assessment of inherent and residual risk for [geography and distribution channels]. Fourth, controls are credited without evidence that they are applied and work. Fifth, there is no documented method. Overall, extensive deficiencies exist regarding the business-wide risk assessment. The deficiencies in the inherent risk assessment are mainly structural, and {{client_short}} can address them without excessive effort. A robust residual risk assessment will, however, require more work on identifying and evaluating controls."

###### 2.2.3 [Area, e.g. Investigation of alerts and reporting to the FIU (*Utredning av larm och rapportering till Finanspolisen*)]

[Same structure. Use anonymised case evidence, e.g. "In one of the five cases reviewed, the transaction was flagged for further documentation, but neither the reason for flagging nor the basis for closing the case without a report was documented."]

##### 2.3 Other deficiencies (*Övriga brister*)

[Summarise the significant and minor deficiencies, and say why they rank lower. Add any cross-cutting observation. Refer to Appendix 1.]

Example: "In addition, we have identified a number of less serious deficiencies (significant or minor), presented in Appendix 1. Most are relatively easy to remedy and would likely lead to a remark rather than a sanction in a supervisory review, so they have lower priority. We would, however, emphasise one cross-cutting observation that borders on extensive: the governing documents state what shall be done but not how. This applies, for example, to customer risk classification, enhanced due diligence and the method for identifying beneficial owners. Where many staff carry out the measures, the lack of instructions on how risks inconsistent application across [offices/teams], and deficiencies that may surface in supervisory sample checks."

#### 3 Action plan (*Åtgärdsplan*)

[One subsection per area, mirroring chapter 2, plus structural actions. For each: recommended actions as bullets, what good looks like, options with trade-offs, suggested owner (function) and priority. Put the foundation first.]

##### 3.1 [e.g. Business-wide risk assessment (*Allmän riskbedömning*)]

Example: "We recommend that {{client_short}} strengthens the business-wide risk assessment by developing a documented method and remedying the gaps identified, with particular focus on the following:
- Describe the methods (*modus*) by which {{client_short}}'s business could be used for ML/TF, with references to external and internal sources (footnotes and a source list).
- Describe the risk factors (customer types, behaviours, distribution channels) so that mitigating controls can be linked clearly to them.
- Assess inherent risk per product, customer, distribution channel and geography, based on the identified methods.
- List the existing controls in a structured way (e.g. CDD, system flags, limits) and relate each to the methods and risk factors it addresses.
- Evaluate whether the controls and limits work and are complied with.
- Based on inherent risk and control effectiveness, assess residual risk."

##### 3.2 Structure and content of governing documents (*Struktur och innehåll i styrande dokument*)

[Proposed document hierarchy. A policy adopted by the board or CEO sets out what shall be done and who is responsible. Instructions or procedures by topic set out how. For each topic document, state what it must contain.]

*Table 4: Proposed governing documents and required content*

| Document | Adopted by | Must describe |
|---|---|---|
| AML/CTF policy (*policy*) | [Board / CEO] | What shall be done and who is responsible, at a high level |
| Customer risk classification (*riskklassificering av kund*) | [CEO / responsible function] | How staff assess the customer's risk class and what they consider |
| Customer due diligence (*åtgärder för kundkännedom*) | | Identification of customer, beneficial owner, complex structures and trusts; enhanced measures; refusal of relationships and transactions |
| Investigation and reporting (*utredning och rapportering*) | | Who does what; escalation; how investigations are done and documented; prioritisation of alerts; internal deadlines; who decides that reasonable grounds exist; filing reports; handling of the customer afterwards |
| [Monitoring/review body] | | Its tasks; the risk-based criteria for selecting transactions and customers, linked to the BWRA |
| Staff (*anställda*) | | Protection of staff; suitability assessment; who does what |
| Internal control (*intern kontroll*) | | Roles across the three functions; which processes are controlled, by whom, how often and how results are reported |

##### 3.3 Documentation of measures (*Dokumentation av åtgärder*)

###### 3.3.1 Customer due diligence (*Kundkännedom*)
###### 3.3.2 Customer risk assessment (*Riskbedömning av kunder*)

[Where real options exist, present them with trade-offs.]

Example: "There are two ways to improve how customer risk is assessed and documented. The first is an automated risk classification integrated in the customer system, which builds on the answers collected in the CDD process and can combine risk factors or use a weighted model. The second is continued manual classification, supported by a clear instruction that ensures like cases are treated alike, and by system support that records which circumstances led to a high-risk rating."

###### 3.3.3 Investigation and reporting (*Utredning och rapportering av kunder*)

[Include key-person dependency, the audit trail and case management where relevant.]

##### 3.4 Internal control of key controls (*Intern kontroll av nyckelkontroller*)

[Which key controls should be subject to internal control, by whom, how often and how results are reported. As a next step, suggest key risk indicators for regular reporting to the CEO.]

*Table 5: Action plan*

| A-ID | Area | Action | Linked log rows | Priority | Suggested owner | Effort | Dependency | Target date |
|---|---|---|---|---|---|---|---|---|
| A-01 | [Business-wide risk assessment] | [Document the method; describe typologies; …] | [GAP-2-001–005] | [Immediate / within 3 months / 6–12 months] | [Compliance officer] | [Low / Medium / High] | — | [TO CONFIRM] |

#### 4 Concluding remarks (*Avslutande kommentarer*)

[The recommended order of work, how the less serious items are absorbed, and follow-up.]

Example: "We recommend that {{client_short}} starts its remediation with the actions in chapter 3, beginning with an update of the business-wide risk assessment, which lays the foundation for the other actions. In parallel, the less serious deficiencies in Appendix 1 should be addressed as part of this work, since many of them can be closed by clarifications in the updated governing documents."

#### Appendix 1 Gap log (*Bilaga 1 Gap-logg*)

[Attach the Excel workbook. Refer to sheets and row IDs. Model of the preferred layout (one sheet per chapter of the reference instrument); variants in references/gap-log-layouts.md.]

| Article | Description | [National act] reference | (national text) | Extent of GAP | Initial assessment | Descriptions in internal regulations | Procedure description | GAP | GAP classification | Action | Responsible |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [20.1(c)] | [Requirement text from the official source] | [3 kap. 12 § PTL] | [Quoted national text] | [Amended: …; the CDD form asks for purpose but not expected volumes …] | [Add expected activity questions] | [CDD instruction section 3.10] | [Onboarding form, field X; seen in demo] | YES | Significant gaps | [Concrete action] | [Compliance officer / Head of Customer Service] |

#### Appendix 2 Documents reviewed (*Bilaga 2 Granskade dokument*)

| Document | Version | Date | Adopted by |
|---|---|---|---|
| [AML/CTF policy] | | | |

## Reference catalogues (inlined)

### Reference catalogue: data-request-list.md

Send part A right after the kick-off. Send part B only if operational verification (step 2 of the method) is in scope, and only for material processes and the areas where the document review points to weaknesses. For every document, ask for the **latest approved version, approval date and approving body**. Track the request in a log with these columns: Req-ID | Item | Requested (date) | Received (date) | Version/date of document | Comment.

##### A. Governing documents and supporting material (step 1)

| # | Item | Why |
|---|---|---|
| A1 | AML/CTF policy or guidelines (*riktlinjer*) adopted by the board or CEO | Top-level requirements, roles, approval level |
| A2 | Procedures and instructions (*rutiner*, *instruktioner*, procedure handbooks) for CDD, EDD, PEP, beneficial ownership, ongoing due diligence | Coverage and "how" |
| A3 | Customer risk classification model and its description (criteria, weights, review triggers) | Customer risk profile requirements |
| A4 | Business-wide risk assessment (BWRA) and its method or instruction | BWRA requirements; whether a method exists |
| A5 | Procedure for monitoring, alert handling, investigation and reporting to the FIU | Monitoring and reporting requirements |
| A6 | Procedure for insufficient CDD (refusal, termination, restriction) | Prohibition to establish or maintain relationships |
| A7 | Procedure for responding to enquiries from the FIU and other authorities | Requirement to reply promptly and fully |
| A8 | Sanctions screening procedure | Targeted financial sanctions |
| A9 | Procedures for processing personal data under the AML rules, and record retention | Data protection and retention requirements |
| A10 | Fit and proper and suitability procedures for staff in relevant roles | Staff integrity requirements |
| A11 | Training plan, training materials and training records (content, participants, date) | Training requirements, incl. documentation |
| A12 | Procedures to protect staff from threats and retaliation; analysis of threats | Protection of staff |
| A13 | Whistleblowing policy and internal reporting channel | Reporting of breaches |
| A14 | Code of conduct | Culture, conflicts of interest |
| A15 | Internal control plan or compliance monitoring plan, with its latest results | Internal control requirements |
| A16 | Appointment decisions and role descriptions: designated member of management, compliance officer, independent audit function; organisation chart | Governance requirements |
| A17 | Latest reports from the compliance officer or responsible function to the CEO and board, with minutes | Reporting lines; follow-up in practice |
| A18 | Internal audit reports on AML/CTF and the list of open observations | Cross-referencing; independent audit function |
| A19 | Supervisory decisions, inspection reports, correspondence and remediation plans | Known issues; calibration |
| A20 | Outsourcing and reliance agreements; agents and distributors | Outsourcing and reliance requirements |
| A21 | Group policies and information-sharing arrangements (if part of a group) | Group requirements |
| A22 | Model inventory and validation documentation for risk classification, screening and monitoring models | Model risk management and validation |
| A23 | System overview: onboarding, screening, monitoring and case management tools | Whether procedures can be operated |
| A24 | Product and service list, customer segments, distribution channels, geographies | Applicability and proportionality |
| A25 | Previous gap analyses and status of remediation | Avoid rework |

##### B. Operational evidence (step 2): the team's model request

The sample sizes are the team's standard for a targeted check. They are indicative, not statistical.

| # | Item | What to look for |
|---|---|---|
| B1 | The latest report from the responsible function (e.g. compliance officer) to the CEO on internal control | Whether it exists, its content and depth, and whether it covers the key processes |
| B2 | Minutes of the two latest monitoring or review meetings, with the supporting documentation | Whether decisions and reasoning are documented; whether an outsider can follow them |
| B3 | The five latest internal reports of suspected ML/TF from the business to the responsible function | Trigger, timeliness, escalation |
| B4 | Five customer files with system extracts for customers rated high risk | Basis for the risk rating; EDD performed; documentation; next review date |
| B5 | The five latest reports to the FIU, including the CDD measures taken during and after the investigation | Timeliness; quality of reasoning; handling of the customer after reporting |
| B6 | Demonstration of the customer system, onboarding flow or case management tool | Whether the system guides staff and stores CDD consistently |

Add these where relevant to the scope:

| # | Item |
|---|---|
| B7 | A sample of closed alerts without a report, with the closing rationale |
| B8 | A sample of customers onboarded remotely, with the identification evidence |
| B9 | Training completion records for a sample of staff in relevant roles |
| B10 | Evidence of BWRA approval and annual evaluation (minutes) |

##### C. Interviews and meetings

| Meeting | Typical participants (roles) | Purpose |
|---|---|---|
| Kick-off | Compliance officer, project owner | Scope, baseline date, data request, timetable |
| Clarification meeting(s) | Compliance officer, process owners (onboarding, monitoring, investigations) | Resolve open questions; confirm facts behind preliminary gaps |
| System demo | Process owner, system owner | See how CDD and monitoring are supported |
| Closing meeting | Compliance officer, CEO (optional) | Present findings and action plan; factual accuracy |

## Placeholders

The blueprint text uses these placeholders. Fill each one from the request brief or the inputs. If a value is not known, write `[DATA NEEDED: …]` in the deliverable; never invent it, and never leave a `{{…}}` placeholder in a finished deliverable.

- `{{client_name}}` — the client's legal name (brief: client.legal_name)
- `{{client_short}}` — the defined term for the client, e.g. "the Company" (brief: client.defined_term)
- `{{date}}` — the deliverable date (brief: engagement.date)
- `{{firm_name}}` — the issuing firm (brief: issuing_firm.name)
- `{{jurisdiction}}` — the jurisdiction(s) (brief: engagement.jurisdictions)
- `{{language}}` — the output language (brief: engagement.output_language)
- `{{version}}` — the document version (brief: engagement.version)
