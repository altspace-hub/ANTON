# FCP blueprint: Governing documents (policies, instructions, routines)

Blueprint `governing-documents` v1.1 (stable) from the FCP blueprint library, as ANTON skill `fcp-bp-governing-documents`. Produces AML/CTF and financial sanctions governing documents written in the client's name: the board-adopted policy, the CEO instruction, manuals and routines, role mandates for the specially appointed executive (SAE) and the central function officer (CFA), plus a requirements traceability matrix, a governing document register and an annual review cycle. Use it to draft a first framework, restructure or re-level an existing one, run the annual review and re-adoption, remediate after supervisory or audit findings, or prepare the document set for the EU AML package (AMLR). It decides what belongs at which level, who adopts it, what each document type must contain and how each requirement is traced to a document and section. Not for the risk assessment itself or for gap and review reports written in the firm's name.

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

The output format **Governing document (blueprint)** (`bp-governing-document`) carries this blueprint's section order; selecting it attaches this skill. When another output format is selected, that format sets the layout and its own scale; keep this blueprint's method, evidence and wording rules within it.

## How references in this skill map to ANTON

The blueprint text points at files of the library it came from. In ANTON:
- `_core/house-standards.md`, `_core/glossary.md`, `_core/request-context.md`, `_core/output-formats.md` → the skill **FCP blueprint: house standards** (`fcp-bp-house-standards`). Attach it with this one for the full house rules; the essentials are in "Gap markers" above.
- `_core/risk-scales.md` → "Risk and control labels" and "Scale mapping" in the house standards skill (`fcp-bp-house-standards`), as wording only. Its matrix and aggregation rules belong to the risk-assessment blueprints and never override a score ANTON or the module supplies.
- `template.md` → the section "Deliverable template" below.
- `references/…` inlined below: `data-request-and-workshops.md`.
- The other `references/…` catalogues (`content-mapping-by-document-type.md`, `document-control-and-annual-review.md`, `model-clauses.md`, `requirements-to-document-matrix.md`, `risk-appetite-and-customer-risk.md`, `roles-and-mandates.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Method and quality bar (blueprint sections 1–14)

Load with `_core/house-standards.md`, `_core/request-context.md` and `_core/output-formats.md`. This blueprint always runs with `author_of_record: client`. The documents are written in the client's voice and adopted by the client's decision makers, and the issuing firm never appears in the body.

The reference files hold the detail:
- `references/content-mapping-by-document-type.md`: mandatory content, approver and exclusions per document type.
- `references/requirements-to-document-matrix.md`: each requirement traced to its EU and national anchors and to the level where it belongs.
- `references/roles-and-mandates.md`: the role catalogue.
- `references/risk-appetite-and-customer-risk.md`: risk appetite, prohibited and restricted activities, risk classes.
- `references/model-clauses.md`: proven clauses in English and Swedish, plus a glossary.
- `references/document-control-and-annual-review.md`: document header, versioning, review triggers, register and board memo.
- `references/data-request-and-workshops.md`: the data request and the workshop agendas.

### 1. Purpose and outcome

The deliverable is a coherent set of internal rules (*interna regler*, *styrdokument*). Through it, an obliged entity governs its work against money laundering, terrorist financing and breaches of financial sanctions. The team builds the set as a cascade, which it calls the waterfall principle (*vattenfallsprincipen*):

| Level | Swedish term | Adopted by | Answers |
|---|---|---|---|
| Policy | *Policy* | Board (*styrelsen*) | What do we commit to, how much risk do we accept, and who is accountable? |
| Instruction | *Instruktion*, *VD-instruktion* | CEO (*VD*) | Who does what, to which minimum standard, how often, and who decides? |
| Manual or guideline | *Manual*, *riktlinje* | SAE or business area head | How is the process carried out, step by step? |
| Routine or SOP | *Rutin*, *rutinbeskrivning* | Function head or process owner | How is one task carried out in one unit or system? |
| Mandate | *Mandat*, *befattningsbeskrivning* | CEO (key roles) or line manager | What does this role answer for, what may it decide, and to whom does it report? |

The board reads the policy, management reads the instruction, and the SAE, the CFA and operational staff read the manuals. The supervisor and internal audit read the whole set. They test whether documented routines exist, whether they are adequate and whether they are applied. The board adopts the policy and the risk appetite, the CEO adopts the instruction, and owners adopt the manuals. Implementation, training, control and audit then rest on the set.

The set works when two things are true. Any employee can answer "what must I do, why, and who decides?" from the document written for them. Every legal requirement traces to one document, one section and one owner.

### 2. When to use / when not to use

**Use it for these tasks:**
- a first AML/CTF framework, for a new licence or a new entity;
- restructuring an existing set, for example moving content to the right level or widening the scope from AML/CTF to financial crime;
- the annual review and re-adoption;
- remediation after supervisory, audit or validation findings;
- an AMLR update;
- single instruments. These include mandates for the SAE, the CFA or an AML specialist, and the terms of reference of the high-risk customer committee. They also include instructions on whistleblowing and protection of employees, an information-sharing routine, and the MRM policy or instruction.

**Use a neighbouring blueprint instead:**

| Need | Blueprint |
|---|---|
| The BWRA, its method instruction or a stand-alone risk appetite statement | `aml-ctf-risk-assessment` |
| A sanctions, ABC or fraud risk assessment | `sanctions-risk-assessment`, `abc-risk-assessment`, `fraud-risk-assessment` |
| A firm-voice assessment of the documents against the rules, including AMLR versus national law | `gap-analysis`, which can reuse this blueprint's matrix |
| A review of how the framework works in practice | `compliance-review-report` |
| Model inventory, tiering and documentation; validation | `model-documentation`; `model-validation-report`. This blueprint covers only the MRM policy and instruction layer. |
| Training on the new documents; the programme that delivers them | `training-and-presentations`; `project-plans-and-governance` |

### 3. Inputs

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| **Minimum to start** | | | |
| The brief: institution type, jurisdiction, supervisor, language | Sets the legal layer, the supervisor's regulations and the terminology | Request context | Ask; do not start |
| Scope: which documents; AML/CTF, plus sanctions, or full financial crime | Determines the set (section 13) | Kick-off | Propose a set, marked `[TO CONFIRM: scope]` |
| Existing governing documents at all levels, and the client's template | Starting point; keeps terms and format; avoids contradicting documents that stay in force | Data request | Draft from the team templates and say so |
| Role holders: board, CEO, SAE, CFA, AML function, internal audit, security officer | Every "shall" needs an owner | Organisation chart, board minutes | `[DATA NEEDED: role holder]`; never invent reporting lines |
| Group structure, outsourcing, agents | Decides between a group policy and local adoption | Annual report | Assume a single entity, marked `[ASSUMPTION]` |
| **For a complete deliverable** | | | |
| BWRA and SRA, with their scales | The documents must reflect the identified risks and use the same scale | SAE | `[DATA NEEDED: BWRA]`; see `aml-ctf-risk-assessment` |
| The board's risk appetite and its prohibited and restricted activities | The policy states them; they cannot be invented | Board minutes | Draft a proposal marked "for board decision" |
| CRR model: classes, factors, system, owner | Instruction text on classes, CDD levels and frequencies | SAE, model documentation | Use the team's four classes, marked `[TO CONFIRM]` |
| Process facts: channels, systems, sanctions lists applied, investigation timelines, FIU route, archive | Instructions and manuals must describe what actually happens | Workshops | Leave the fields open and list them |
| Delegation rules, committees, board calendar | Decision levels and reporting frequencies | *Delegationsordning*, committee terms of reference | Propose them, marked `[TO CONFIRM]` |
| Findings and open remediation | These must be visibly addressed | CFA, internal audit | State that none were provided |
| The client's rules on governing documents; related policies (outsourcing, privacy, whistleblowing, MRM) | Format, approval routes, cross-references | Data request | Apply `references/document-control-and-annual-review.md` |

### 4. Regulatory and professional anchors

Order the layers as in house standards §4. Article and section numbers belong in the requirements matrix, where each one is verified. They do not belong in the policy text. The "Background" section of a policy or instruction names its legal basis. It does not reproduce the instruments. State the regulatory status date and remind the user to check the current version of each instrument.

**EU baseline**
- **Directive (EU) 2015/849 (AMLD4), as amended by Directive (EU) 2018/843 (AMLD5).**
  - Article 8: policies, controls and procedures that are proportionate and approved by senior management. They cover model risk management, CDD, reporting, record keeping, internal control, compliance management, employee screening and, where appropriate, an independent audit function.
  - Article 45 (groups), Article 46 (training), Article 38 (protection of reporting employees), Article 39 (prohibition of disclosure) and Article 40 (record retention).
  - The management board member responsible for AML/CTF: Article 46(4) `[VERIFY REFERENCE]`.
- **The EU AML package.** Regulation (EU) 2024/1624 (AMLR) applies from 10 July 2027, with Regulation (EU) 2024/1620 (AMLA) and Directive (EU) 2024/1640 (AMLD6). It sets direct rules on internal policies and controls, the BWRA, compliance functions (a management body member responsible for AML/CFT and a compliance manager), groups, and employee training and integrity `[VERIFY REFERENCE: article numbers]`. Draft documents adopted now so they survive the switch: reference requirements by subject and flag AMLR-sensitive clauses in the matrix. Plan an update once the national adaptation legislation and the AMLA standards are final.
- **Other EU instruments.**
  - Regulation (EU) 2023/1113 on information accompanying transfers of funds and certain crypto-assets, which replaces Regulation (EU) 2015/847.
  - EU restrictive measures under Article 215 TFEU.
  - The GDPR (Regulation (EU) 2016/679).
  - Directive (EU) 2019/1937 on whistleblower protection.
- **Guidelines.**
  - EBA/GL/2021/02 on ML/TF risk factors. The team's policy template requires the BWRA and customer risk profiles to follow it.
  - EBA/GL/2022/05 on the AML/CFT compliance officer and the role of the management body. This is the reference model for SAE and CFA mandates.
  - The EBA guidelines on internal governance, on access to financial services, and on controls for restrictive measures `[VERIFY REFERENCE]`.

**National layer through `{{jurisdiction}}` (Sweden as the example)**
- **Lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism (PTL).** It covers:
  - the general risk assessment (*allmän riskbedömning*);
  - CDD;
  - monitoring and reporting;
  - record keeping;
  - routines and guidelines;
  - training;
  - protection of employees;
  - the SAE (*särskilt utsedd befattningshavare*, SUB);
  - the CFA (*centralt funktionsansvarig*).

  `[VERIFY REFERENCE: chapter and section per topic]`
- **FFFS 2017:11**, Finansinspektionen's regulations and general guidelines. They cover the BWRA, CDD, governance, the independence of the CFA, model risk management and periodic reporting `[VERIFY REFERENCE]`.
- **Entities supervised by Länsstyrelsen**, such as pawnbrokers, follow that authority's regulations `[VERIFY REFERENCE]`.
- **Related acts.**
  - Lag (2017:631) on the registration of beneficial owners.
  - Lag (2014:307) on money laundering offences.
  - Lag (2002:444) on the financing of particularly serious crime, which the templates use to define terrorist financing.
  - Lag (1996:95) on international sanctions.
  - Lag (2021:890) on whistleblower protection.
  - Sector governance rules such as FFFS 2014:1 `[VERIFY REFERENCE: applicability]`.
- **The FIU** is Finanspolisen, within Polismyndigheten.

**Industry standards:** FATF Recommendations 1 and 18; Wolfsberg guidance.

### 5. Method

**Step 1 – Clarify the mandate and the architecture.** Confirm the following:
- the institution type, supervisor, group structure and scope;
- the documents in scope;
- the client's rules on governing documents and its template.

Then send the data request. *Why:* the set must fit the client's existing hierarchy and approval routes, or it will not be adopted. *Judgement:* if the client has no rules on governing documents, put the hierarchy statement in the introduction of the policy, as the team's template does.

**Step 2 – Inventory and level screen.** Enter every existing document in the register. Map each document against the requirements matrix and record one of four outcomes: covered, partly covered, missing, or at the wrong level. *Why:* the commonest defects are gaps, duplication and misplaced content. Examples are system steps in a board policy, or principles that exist only in a manual. If the client wants a formal findings report, hand over to `gap-analysis`.

**Step 3 – Anchor in the BWRA and risk appetite.** Extract the following from the BWRA and SRA:
- the scale and the appetite;
- the unacceptable and restricted activities;
- the high-risk factors and the main typologies;
- the controls the BWRA relies on.

*Why:* this is where "everything connects" is tested. The policy states the appetite. The instruction turns it into risk classes, CDD levels, decision levels and frequencies. The manuals turn those into steps. All of them must use the BWRA's terms and scale, including the rule for reducing inherent to residual risk. The team's material holds both "at most one grade" and "normally at most two grades". State whichever the adopted BWRA method uses. *Judgement:* without a BWRA, draft with `[DATA NEEDED: BWRA]` markers and recommend doing the BWRA first.

**Step 4 – Design the architecture.** Decide the following:
- the set;
- the owner and approver of each document;
- the cross-references.

Draw the document map (*styrdokumentskarta*). Then apply the **level test** to each requirement:
- **Policy:** would changing it change the risk the board has accepted, or the allocation of accountability?
- **Instruction:** does it say who does what, to which standard, how often and who decides?
- **Manual or routine:** does staff need it to carry out the task?

Present the map to the SAE and the CFA in a workshop. *Judgement:* match the set to the client's size.
- A small entity can run with a policy, one instruction and a few routines.
- One pawnbroker in the team's material had a single board policy with the risk assessment appended.
- A group needs a group policy and a group instruction. Subsidiaries and branches adopt them with legally required adjustments only, and stricter local law prevails.

**Step 5 – Roles and mandates workshop.** Use `references/roles-and-mandates.md` as the agenda. Confirm the following:
- who holds the SAE, CFA and AML function roles;
- the reporting lines (functional and administrative in groups), with frequency and content;
- veto rights and delegation;
- the decision committee for high-risk customers;
- the independence of the CFA.

*Why:* unclear roles are the root cause of most framework failures. Apply the team's principles. Being **ultimately responsible** (*ytterst ansvarig*) can never be delegated. Being **responsible** (*ansvarig*) can. Reporting to the board and the CEO cannot be delegated either.

**Step 6 – Draft top-down.** Draft in this order: policy, instruction, manuals and routines, mandates.
- Start from `template.md`.
- Fill every client-specific field: systems, frequencies, decision makers, lists applied.
- Delete what does not apply.
- Give each "shall" an owner, a trigger or frequency, and a testable output.

*Why:* drafting top-down keeps the cascade consistent. Drafting a manual first pulls operational detail upward. *Judgement:* keep good existing wording. Continuity helps adoption and the audit trail.

**Step 7 – Consistency and traceability check.** Complete the matrix with the document and section for each requirement. Then check across the whole set:
- defined terms and role titles;
- one risk class label set (Low / Normal / High / Very high, as in `_core/risk-scales.md`; never Medium or Moderate);
- frequencies and deadlines;
- cross-references;
- parent and child statements;
- numbering. The team's own policy template repeats sections 4.2 and 4.3.

*Why:* inconsistency between levels is how supervisors show that a framework is not in control.

**Step 8 – Review rounds and approval.** The SAE and the CFA review the drafts against a comment log. Legal, the DPO and HR check the clauses that touch their areas. The CEO adopts the instruction. The board adopts the policy on a decision memo (*beslutsunderlag*) that lists the changes and the decision required. Owners adopt the manuals. *Judgement:* never take a manual to the board, and never let a manual change the appetite.

**Step 9 – Implementation.** Publish the set, archive the superseded versions with their decision evidence, inform the staff concerned and train them, and set the review dates in the register. *Why:* the policy makes the CEO responsible for ensuring that everyone concerned knows the policy and follows it.

**Step 10 – Annual review cycle.**
- **Policy and instruction:** at least annually. Re-adopt them even without changes.
- **Manuals:** re-adopted annually by their owner.
- **Mandates:** at the latest every three years, and whenever the holder or the regulation changes.
- **Ad hoc review triggers:** regulatory change, a BWRA update, organisational change, new products or markets, findings, and material incidents.

Use the checklist in `references/document-control-and-annual-review.md`.

### 6. Deliverable structure

Full skeletons are in `template.md`. The mandatory content of each document type, including the financial crime and group variants, is in `references/content-mapping-by-document-type.md`.

**Front matter (all types).** Every document opens with a document information block. Its fields are the following:
- document type and title;
- entity;
- adopted by (*fastställd av*) and adoption date (*fastställd*);
- document owner (*dokumentägare*);
- responsible for implementation (*ansvarig*);
- supersedes (*ersätter*);
- appendices (*bilagor*);
- next review;
- information class (*informationsklass*);
- version.

A change log follows the block, and a table of contents is added above about six pages. Governing documents have no executive summary. Their purpose section and the board memo do that job.

**Policy** (the team's order; 8–12 pages; formal, principle-level, no systems or step lists)

| Section | Must contain |
|---|---|
| 1 Introduction (*Inledning*) | Board's governance role. The hierarchy: the board adopts policies, the CEO instructions, function heads routines. Scope, including contractors and outsourced activities. The CEO's duty to make the policy known and to issue detailed rules. Annual review |
| 2 Background (*Bakgrund*) | Legal basis by name; the subordinate instruction |
| 3 Purpose (*Syfte*) | Why. A minimum standard; deviations only if stricter. The risk-based approach. Sanctions in scope |
| 4 Internal control and governance | Three lines. 4.1 Board. 4.2 CEO. 4.3 SAE (first line). 4.4 CFA (second line). 4.5 Independent audit (third line). 4.6 Managers and employees |
| 5 Management of ML/TF risks | 5.1 Risk appetite: unacceptable activities by law and by board decision. 5.2 Risk-based approach: BWRA and customer risk profile, following EBA/GL/2021/02. 5.3 Control measures. 5.4 Follow-up of controls against appetite. 5.5 Customer risk classification |
| 6 CDD process (*Kundkännedomsprocessen*) | Components. 6.1 Sanctions checks. 6.2 Measures. 6.3 Initial CDD per risk level. 6.4 Ongoing CDD with frequencies. What happens when CDD is insufficient |
| 7–13 | 7 Monitoring and reporting. 8 Record keeping. 9 Training. 10 Protection of employees. 11 Suitability. 12 Personal data. 13 Confidentiality. Each ½ page or less |
| 14 Model risk management and validation | Models in scope; SAE ownership; CFA validation |
| Appendix 1 Financial sanctions | Regimes applied, screening, true hits, freezing, reporting (1–2 pages) |

**Instruction** (the team's order; 12–20 pages; operational and specific; names systems in general terms)

| Section | Must contain |
|---|---|
| 1 Purpose | Parent policy, what this regulates, related routines, review |
| 2 Definitions | ML, TF, AML, business relationship, transaction, occasional transaction, PEP, RCA, plus the client's terms |
| 3 Responsibilities | 3.1 Overall. 3.2 SAE. 3.3 CFA. 3.4 AML officer (*AML-ansvarig*). 3.5 Security officer. 3.6 Managers. 3.7 Employees. 3.8 Personal liability. 3.9 Internal audit |
| 4 Risk assessment | Appetite operationalised (very high risk factors handled by special routines). 4.1 BWRA. 4.2 Customer risk classes with descriptors, the model, its ownership and its validation |
| 5 CDD | 5.1 General, with 5.1.1 Sanctions screening. 5.2 Basic, 5.3 Simplified and 5.4 Enhanced measures. 5.5 Ongoing follow-up. Add where relevant: decision levels, exit, reliance and outsourcing |
| 6 Transactions | 6.1 Monitoring. 6.2 Understanding the transaction. 6.3 Refraining. 6.4 Payer information. 6.5 International payments. 6.6 Authority contacts |
| 7 Reporting | 7.1 Internal. 7.2 FIU. 7.3 Confidentiality |
| 8–10 | 8 Record keeping. 9 Training and suitability. 10 Protection of employees |

**Manual or guideline** (20–60 pages; instructional, second person allowed)
- change log;
- introduction (parent documents, users, owner, "adopted annually even if unchanged");
- definitions;
- process chapters written as the questions staff ask ("Who is a customer?", "When must CDD be completed?");
- steps, accepted evidence, handling of false and true positives, and standard texts;
- documentation requirements;
- appendices.

**Routine or SOP** (2–10 pages): header; background and scope, including how stricter local rules are handled; steps with role, system and output; controls and evidence.

**Mandate** (2 pages)
- purpose line;
- about the position (title, location, reports to);
- main responsibility, with its legal anchor and, for the CFA, its independence;
- tasks;
- reporting, with a minimum frequency and mandatory points;
- staff responsibility;
- powers (veto, delegation);
- signature, adopted by the CEO or line manager and updated at the latest after three years.

**Other instruments.**
- Terms of reference for the high-risk customer committee.
- An instruction on whistleblowing and protection of employees.
- An information-sharing routine.
- The MRM policy or instruction, with a validation SOP.
- The sanctions screening manual.

### 7. Scales, scoring and calculations

**7.1 Decision rights and review cycle** (the default; confirm it against the client's rules)

| Document | Adopted by | Owner | Review |
|---|---|---|---|
| Policy | Board | CEO (SAE or CFA drafts) | At least annually; re-adopted even without changes |
| Instruction | CEO | SAE | At least annually |
| BWRA | CEO or board, as required by national rules and the client's governing documents `[VERIFY REFERENCE]` | SAE/SUB (owns the process and presents it) | Annually and on material change |
| Manual or guideline | SAE or business area head | Head of AML | Annually; re-adopted even if unchanged |
| Routine or SOP | Function head or SAE | Process owner | Annually or on change |
| Mandate (SAE, CFA) | CEO; the board appoints the holder | CEO or HR | At the latest every 3 years; on change of holder |
| Mandate (specialist) | Line manager | Line manager | At the latest every 3 years |
| Committee terms of reference | Board or CEO | Chair | Annually |
| MRM guideline | SAE; the validation section by the CFA | SAE and CFA per section | Annually, even if unchanged |

The BWRA (and the other financial crime risk assessments that follow the same path) is adopted by the CEO or the board, as required by national rules and the client's governing documents; the designated executive (SAE/SUB) owns the process and presents it `[VERIFY REFERENCE]`. The SAE is not the adopter.

**7.2 Customer risk classes** (library labels from `_core/risk-scales.md`: Low / Normal / High / Very high, plus Unacceptable as a separate outcome. If the client's CRR model and BWRA use other labels, use the client's, record the deviation, and use one set across the documents)

| Class | Descriptor | CDD | Periodic review | Decision |
|---|---|---|---|---|
| Low (*Låg*) | Risk assessed as negligible | Simplified | At least every 5 years | Within ordinary delegation |
| Normal (*Normal*) | Risk assessed as normal for the business and accepted in ordinary business | Basic | At least every 3 years | Within ordinary delegation |
| High (*Hög*) | Higher; accepted to a limited extent with mitigation | Enhanced | At least annually | Competent decision maker; committee with senior first- and second-line members |
| Very high (*Mycket hög*) | Higher still; accepted only to a limited extent with mitigation | Enhanced plus restrictions | At least annually | Committee; CFA veto; in some frameworks never at onboarding |
| Unacceptable (*Oacceptabel*) | Outside the appetite or prohibited by law | None | – | Do not onboard; exit |

Event-driven review applies on top of the periodic intervals. Triggers include a report to the FIU, new products and adverse information. A customer reported to the FIU is reassessed, normally to High, and evaluated for exit.

**7.3 Appetite logic.** A low overall appetite does not require every residual risk to be low. Higher risks are tolerated if they are monitored and controlled and the overall level stays low. The four-grade scale and the reduction rule must match the adopted BWRA method (`aml-ctf-risk-assessment`, section 7; the library default is `_core/risk-scales.md`).

**7.4 Versioning.**
- Drafts are numbered 0.x.
- Each adoption, including the annual re-adoption, creates a major version (1.0, 2.0).
- Minor versions (2.1) are only for editorial corrections, and only where the client's rules allow the owner to approve them.

**7.5 Reviews of an existing set.** Use the house finding format, but rate each finding on the five-level deficiency scale of `gap-analysis` and `compliance-review-report` (Critical / Extensive / Significant / Minor / No deficiencies; `gap-analysis/references/rating-scales.md`), not on the house four-level scale. The mapping between the scales for consolidated reporting is in `_core/risk-scales.md` §8. Cite the requirement ID from the matrix.

### 8. Supporting artefacts

- **Requirements traceability matrix (xlsx).**
  - Sheets: Instructions; Inputs (document inventory); Matrix; Scales and lists; Summary.
  - Matrix columns: Req ID | Area | Requirement | Layer (EU / national / supervisory / guideline) | Reference | Verified (Y / `[VERIFY]`) | Level | Document | Section | Coverage (Covered / Partly / Missing / N/A) | Comment or action | Owner | AMLR impact (None / Wording / Substantive).
  - Seed the rows from `references/requirements-to-document-matrix.md`.
- **Governing document register (xlsx).** Doc ID | Title | Type | Level | Parent | Entity | Owner | Approver | Adopted | Version | Next review | Status | Supersedes | Language | Location | Last change.
- **Document map.** A one-page figure of the cascade with the owner and approver of each document, used in the board memo and in the instruction's purpose section.
- **Board decision memo.** One to two pages covering the item and the decision proposed, the changes (section, change, reason, source), implementation and appendices.
- **Comment resolution log.** No | Document | Section | Comment | Raised by | Response | Status.

### 9. Writing rules specific to this deliverable

- **Client voice.** Use "{{client_short}} shall…" for binding rules and "should" for guidance. Never write "we recommend" inside a governing document.
- **Every "shall" is testable.** It needs a role, a trigger or frequency, and an output.
  - Weak: "Customers shall be followed up regularly."
  - Good: "High-risk customers shall be reviewed at least annually. The AML function performs the review and documents it in [system name]."
- **Roles, never names.** One delivered policy named the role holder, which forces a policy change every time staff change.
- **Detail by level.** The policy names no systems or forms and has no step lists. The instruction may name systems in general terms. Manuals name screens, fields and standard texts.
- **Do not copy the law.** Paraphrase the obligation and point to the instrument. Only definitions may quote the law.
- **Parent and children.** Each document states which document it details and where more detail is found.
- **Group wording.** Adopt the requirements locally with legally required adjustments only. Stricter national law prevails.
- **One term per concept across the set.** For example SAE or SUB, CFA or MLRO, and the risk class labels (Low / Normal / High / Very high). Glossary: `references/model-clauses.md` §9.
- **No template residue.** Remove placeholders, highlighted or red text, guidance pages and words for the wrong entity type, such as "the bank" in a credit market company's documents.

### 10. Quality checklist

- [ ] There is a document map. Every document states its parent, approver, owner, what it supersedes and its next review.
- [ ] Every requirement in the matrix has a document and a section, or N/A with a reason. Nothing is covered only at the wrong level.
- [ ] The appetite, the prohibited and restricted lists, the risk classes and the scales match the BWRA and the CRR model word for word.
- [ ] Frequencies, deadlines and decision levels are the same in the policy, instruction, manuals and mandates.
- [ ] Every role in the policy has tasks in the instruction and in a mandate. The CFA's independence is explicit.
- [ ] Reporting to the board and the CEO has a minimum frequency and mandatory content, and is not delegable.
- [ ] Group sets include local adoption, the stricter-law clause, and functional and administrative reporting lines.
- [ ] The neglected areas are covered: protection of employees, suitability, personal data, information sharing, model risk, sanctions true hits, authority requests, and customer exit and restriction.
- [ ] Outdated references are replaced, for example Regulation (EU) 2015/847 by 2023/1113. AMLR-sensitive clauses are flagged, and the regulatory status date is stated.
- [ ] There are no personal names, no template residue, no wording for the wrong entity type and no numbering errors.
- [ ] The board memo lists every material change and the decision required.

### 11. What makes it stand out

1. **Level discipline.** The waterfall principle is applied with an explicit level test. Documents stay stable, and changes are approved at the right level.
2. **Operational risk appetite.** The policy separates what is prohibited by law from what is prohibited by board decision. A restricted category feeds customer risk rating and KRIs. The appetite statement explains that low overall appetite does not mean every residual risk must be low. The appetite then flows into classes, decision levels, frequencies and SAE reporting.
3. **Accountability that holds.** Each role is either ultimately responsible (non-delegable) or responsible (delegable). Group functional and administrative lines are defined. The SAE and the CFA can veto activity outside the appetite. Mandates carry mandatory reporting points and minimum frequencies.
4. **The golden thread.** BWRA drives appetite, appetite drives CRR, and CRR drives the CDD level, the review frequency and the TM thresholds. Investigations and FIU reports feed back into scenarios, the BWRA and training, and the documents state these links explicitly.
5. **Traceability.** One matrix ties every requirement to a document, section and owner. The same matrix serves the annual review, audits and the AMLR transition.
6. **Precision that supervisors look for.**
   - Investigations are documented so that a reasonably informed reader understands why an alert was closed.
   - Suspicions are reported at a relatively low degree of suspicion.
   - Authority requests are handled as risk indicators and treated as manual alerts.
   - The exit process covers legal obstacles, group effects and interim mitigation.
7. **The neglected areas are covered.**
   - Protection of employees: threat analysis, standardised customer letters, no full names and source confidentiality.
   - Suitability matrices.
   - Special categories of personal data.
   - Information sharing within the group.
   - Model risk.
   - Voluntary self-disclosure of sanctions breaches.
8. **Built for maintenance.** Review dates, triggers, annual re-adoption and change logs that state what changed and why.

### 12. Common pitfalls

- **Law-copy policies.** The policy restates the law and contains no client decisions.
- **Content at the wrong level.** Operational detail at board level means every system change needs a board decision. Principles that appear only in manuals were never decided by the board.
- **Inconsistent labels and numbers.** Medium in one document and Normal in another. Five-year reviews in the policy and three-year reviews in the manual. Duplicated section numbers.
- **Role confusion.** CFA tasks are given to the operational AML function, the CFA ends up controlling its own work, or the SAE has no power to act.
- **Promises the client cannot keep.** Frequencies or deadlines the client cannot meet are breached daily.
- **Missing group mechanics.** No local adoption, no stricter-law clause or no subsidiary reporting.
- **Stale references.** Superseded EU regulations, old EBA guidelines, or a misstated payer-information threshold (one team template has this).
- **Outdated whistleblowing wording.** Text suggesting that external reporting may breach the employment contract conflicts with whistleblower protection law.
- **Template residue and personal names.**

### 13. Variants

| Client type | Typical set and adaptations |
|---|---|
| Bank, savings bank | Policy and instruction (team templates), plus KYC and TM manuals. Branch managers, cash and international payments, a security officer |
| Credit market company, consumer credit | A group financial crime policy and instruction, often in English, with KYC and monitoring guidelines. No cash. Automated TM. A restricted list, offboarding or restriction, and a watch list of exited customers |
| Payment or e-money institution | Agents and distributors, merchant onboarding, payer information, outsourcing; high volumes, so automated TM and screening fuzziness are set in the SRA |
| Insurance, fund manager, investment firm | Intermediaries and platforms, nominee structures, reliance on third parties, group frameworks |
| Crypto-asset service provider | Crypto transfer rules and wallet screening `[VERIFY REFERENCE: MiCA interface]` |
| Non-financial obliged entity (for example a pawnbroker under Länsstyrelsen) | One board policy with the BWRA appended. A compliance officer (*regelefterlevnadsansvarig*) holds both the SAE and CFA tasks. Manual transaction review. Annual board re-adoption |
| Group with foreign entities | Group policy and instruction. Local SAE and CFA report functionally to the group and administratively to the local CEO. The group CFA is consulted on changes to local CFA resources and can veto them. An information-sharing routine |

**Size.** A small entity has a lean set: a policy, an instruction and two or three routines, with the SAE role held within management. A large entity has the full cascade: committee terms of reference, an MRM guideline, SOPs, and financial crime intelligence and scenario processes.

**Maturity.**
- **First framework:** full templates and workshops.
- **Annual update:** change log, checklist and continuity of wording.
- **Remediation:** every change linked to a finding ID, with closure reported in the board memo.

**Scope.** AML/CTF only, with sanctions as an appendix; AML/CTF plus a sanctions section or manual; or full financial crime, with separate ABC and fraud instructions.

### 14. How the assistant should work

1. **Read the brief.** If anything is missing, ask at most five questions in one message. Cover:
   - the institution type and supervisor;
   - the group structure;
   - the documents in scope, whether existing documents and a template can be shared, and the client's governing document rules;
   - who holds the SAE, CFA and AML function roles;
   - whether an adopted BWRA and risk appetite exist.
2. **If existing documents are provided,** build the register and run the level screen first. Report the planned architecture and the main issues briefly. If the restructuring is material, wait for confirmation.
3. **Produce in this order:**
   1. the document map;
   2. the matrix;
   3. the policy;
   4. the instruction;
   5. the manuals and routines;
   6. the mandates and other instruments;
   7. the board memo;
   8. the open-items list.
4. **Wording.** Use `template.md` and `references/model-clauses.md`. Adapt each clause to the client's facts, and delete clauses that do not apply.
5. **Stop and ask when:**
   - role holders or reporting lines are unknown;
   - the board has not decided the appetite or the prohibited activities (draft a proposal marked for decision; never present it as decided);
   - existing documents contradict each other;
   - the client wants operational detail in the policy;
   - a requirement depends on a legal reading you cannot verify.
6. **Review mode** (`stage: review-of-existing`). Return comments per document. Each comment gives the requirement ID, the observation, a proposed redraft and a rating. Never rewrite silently.
7. **Before delivery,** run the quality checklist, list the remaining markers and state the regulatory status date.

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: AML/CTF governing document set

[This is the skeleton set for the main deliverable. Each part is a separate document, and each part follows the cascade:

| Part | Document | Adopted by |
|---|---|---|
| A | Policy | Board |
| B | Instruction | CEO |
| C | Manual or guideline | SAE or business area head |
| D | Routine or SOP | Function head |
| E | Role mandate | CEO or line manager |
| F | Board decision memo | – |

Produce only the parts in scope.

Write in `{{language}}`. Swedish headings from the team's templates are given in parentheses; when `{{language}}` is `sv`, use them as the headings.

The documents are written in the client's voice, using `{{client_short}}`. Replace every `[bracket]` with client facts, or with `[DATA NEEDED: …]`, `[TO CONFIRM: …]` or `[ASSUMPTION: …]`. Delete sections that do not apply. Remove all guidance before delivery.

Clauses marked `Example:` come from the team's proven wording (see `references/model-clauses.md`). Adapt them to the client; do not paste them unchanged.]

---

#### Common document information block (all parts)

[Place this block on the first page of every document. Use the client's own header if one is provided. The footer carries the document name, approver, document owner and information class.]

*Table 1: Document information (Dokumentinformation)*

| Field | Content |
|---|---|
| Document type (*Dokumenttyp*) | [Policy / Instruction / Manual / Routine / Mandate] |
| Title | [e.g. Policy for measures against money laundering and terrorist financing] |
| Entity | {{client_name}} [and group entities covered] |
| Adopted by (*Fastställd av*) | [Board of Directors / CEO / SAE / function head] |
| Date of adoption (*Fastställd*) | {{date}} [date of decision; board minutes reference] |
| Document owner (*Dokumentägare*) | [role responsible for content and updates] |
| Responsible for implementation (*Ansvarig*) | [role ensuring the organisation lives by the document] |
| Supersedes (*Ersätter*) | [title and date of the previous version, or "New document"] |
| Appendices (*Bilagor*) | [list, or "None"] |
| Next review (*Nästa översyn*) | [date, no later than 12 months after adoption; 3 years for mandates] |
| Information class (*Informationsklass*) | [Internal / Confidential] |
| Version | {{version}} |

*Table 2: Change log (Ändringslogg)*

| Version | Date | Section(s) | Description of change | Prepared by (role) | Adopted by / decision reference |
|---|---|---|---|---|---|
| [1.0] | [YYYY-MM-DD] | [All] | [New document] | [SAE] | [Board, minutes § x] |
| [2.0] | [YYYY-MM-DD] | [4.3, 5.1] | [Annual review and adoption. Risk appetite updated after the BWRA; SAE reporting frequency changed from half-yearly to quarterly.] | [SAE] | [Board, minutes § y] |

Example of a weak change description: "Updated." Example of a good one: "Annual review and adoption. No material changes; editorial clarifications in 6.4."

[Insert a table of contents for documents longer than about six pages.]

---

### PART A – POLICY

**{{client_name}}**
**Policy for measures against money laundering and terrorist financing** (*Policy för åtgärder mot penningtvätt och finansiering av terrorism*)

[Variant title for financial crime scope: "Financial Crime Policy". The structure for that variant is in `references/content-mapping-by-document-type.md` §1.3.]

#### 1. Introduction (Inledning)

[Four short paragraphs, in this order: governance and the hierarchy; scope; the CEO's duties; review.]

Example: "The Board of Directors works to ensure that {{client_short}} has sound governance and internal control. The Board is responsible for ensuring that {{client_short}} complies with laws and with the national and European regulations that govern its business. The governing documents of {{client_short}} consist of policies, instructions and routines. The Board adopts policies. Where needed, policies are broken down into instructions, which are adopted by the CEO. Instructions may in turn be broken down into detailed routines, which are adopted by the head of the function concerned."

Example: "This policy applies to the Board, management, all employees, consultants, temporary staff, partners, agents and contractors concerned by the business of {{client_short}}. It applies to all parts of the business, including activities and areas that have been outsourced to another party."

Example: "The CEO shall ensure that this policy is available to everyone concerned and that they know and follow its content. The CEO, or a person appointed by the CEO, shall issue the more detailed rules needed to apply this policy."

Example: "This policy shall be reviewed continuously, at least annually, and amended when needed by decision of the Board. The CEO shall assess and update the content of this policy each year and present it to the Board together with any proposed changes."

#### 2. Background (Bakgrund)

[Name the legal basis. Do not reproduce the provisions. Name the subordinate instruction.]

Example: "This policy has been established in accordance with [the national AML/CTF act; for Sweden: Lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism] and [the supervisor's regulations and general guidelines; for Sweden: FFFS 2017:11, or the regulations of Länsstyrelsen for entities under its supervision `[VERIFY REFERENCE]`], together with [EU sanctions regulations]. {{client_short}} has established an instruction, [title], which is subordinate to this policy."

[Regulatory status as of {{date}}. Add an AMLR note if the policy is adopted before 10 July 2027: "The policy will be reviewed when Regulation (EU) 2024/1624 and the national adaptation legislation apply."]

#### 3. Purpose (Syfte)

[Cover four points: why the policy exists (compliance, reputation, stability of the financial system); that it is a minimum standard; the risk-based approach; that sanctions are in scope.]

Example: "The purpose of this policy is to provide a framework for the work of {{client_short}} to counter money laundering and terrorist financing. The policy is a minimum standard. As a rule, no deviations are permitted. A deviation is allowed only if it means stricter measures."

Example: "A risk-based approach means that the scope of measures, procedures and controls shall be continuously adapted to the risks of money laundering and terrorist financing, with most measures applied where the risks are greatest. In addition, {{client_short}} shall manage the risk of breaching financial and international sanctions."

#### 4. Internal control and governance (Intern kontroll och styrning)

[One sentence stating that {{client_short}} applies the three lines model.]

##### 4.1 The Board of Directors (Styrelsen)
[The Board adopts the risk appetite, ensures adequate resources, promotes a culture of sound risk management and compliance, appoints or approves the appointment of the SAE and the CFA, and assesses the suitability of the CEO.]

##### 4.2 The Chief Executive Officer (Verkställande direktören)
[The CEO proposes the SAE and CFA and assesses their suitability, adopts the BWRA (the CEO or the board, as required by national rules and the client's governing documents `[VERIFY REFERENCE]`), ensures resources and competence, operationalises the risk appetite and establishes restrictions, and ensures that routines for financial sanctions exist.]

##### 4.3 Specially appointed executive (Särskilt utsedd befattningshavare) (first line)
[Cover the justification for the role given the entity's size and nature, membership of management, the appointment route, the BWRA, internal routines, follow-up of implementation, and reporting to the CEO and the Board, including residual risk against appetite at least annually.]

##### 4.4 Central function officer (Centralt funktionsansvarig) (second line)
[Cover appointment and independence, monitoring and control, advice and training, recommendations, responsibility for FIU reporting, reporting to the Board and CEO, reasonableness of the BWRA outcome against appetite, and cooperation with the other control functions.]

##### 4.5 Independent audit function (Oberoende granskningsfunktion) (third line)
[Internal audit, or an outsourced equivalent, regularly reviews the functions, work and processes.]

##### 4.6 Managers and employees (Kontors- och avdelningschefer samt medarbetare)
[Cover each manager's responsibility for staff knowing and applying the rules, every person's duty to prevent and report, and reporting without delay to [AML function].]

#### 5. Management of ML/TF risks (Hantering av risker kopplade till penningtvätt och finansiering av terrorism)

[One paragraph listing the components: risk-based approach, annual BWRA, control measures, and follow-up of control measures.]

##### 5.1 Risk appetite (Riskaptit)

Example: "{{client_short}} accepts that money laundering and terrorist financing exist in society, but has a low appetite for being exposed to this risk. The low overall risk appetite does not mean that all residual risks must be low. Higher risks may be tolerated provided that they can be monitored and controlled and that the overall risk level in the business is assessed as low."

[If the scope covers sanctions, add: "{{client_short}} has a very low appetite for financial sanctions risk."]

Based on the risk appetite adopted by the Board and on applicable law, the following are considered unacceptable risks:

*Table 3: Unacceptable activities*

| Basis | Activity |
|---|---|
| By law (*Enligt lag*) | [e.g. correspondent relationships with shell banks; anonymous accounts, passbooks or safe-deposit boxes; relationships where sufficient CDD cannot be achieved; customers listed on applicable sanctions lists] |
| By Board decision (*Enligt styrelsebeslut*) | [DATA NEEDED: Board decision. Examples from the catalogue: money service businesses; unlicensed financial institutions; legal entities with bearer shares; customers established in countries classified as unacceptable] |

[Optional: restricted activities, which are accepted only as high or very high risk under special limitations. See `references/risk-appetite-and-customer-risk.md`.]

##### 5.2 Risk-based approach (Riskbaserat förhållningssätt)
[Cover the BWRA, which considers products and services, customers, distribution channels and geography, together with SAR experience and information from authorities. It is evaluated at least annually. Then cover the customer risk profile, which is based on the BWRA and on knowledge of the customer. Both follow EBA/GL/2021/02.]

##### 5.3 Implementation of control measures (Implementering av kontrollåtgärder)
[List the most significant control measures:
- internal governance, governing documents, routines and culture;
- training;
- CDD measures and routines;
- customer risk classification;
- product limitations;
- transaction monitoring.

The compliance function advises on the design of measures. The head of the department concerned decides on that design.]

##### 5.4 Follow-up and assessment of control measures (Uppföljning och bedömning av kontrollåtgärder)
[The CFA follows up and assesses the design and effectiveness of the controls, which results in an assessment of residual risk against the risk appetite. The SAE follows up that the controls are implemented.]

##### 5.5 Customer risk classification (Kundriskklassificering)
[Summarise the classes and the principle. The detail goes in the instruction.]

#### 6. Customer due diligence process (Kundkännedomsprocessen)
[Cover the components:
- initial CDD;
- risk assessment and classification;
- enhanced measures for high risk;
- ongoing CDD;
- approval of new high-risk customers and, where applicable, exit.

Then state the consequence of insufficient CDD: the relationship is not established or maintained, and the case is assessed for an FIU report.]

##### 6.1 Checks against sanctions lists (Kontroller mot sanktionslistor)
[Customers, beneficial owners and representatives are checked against the lists applied before onboarding and on an ongoing basis.]

##### 6.2 Customer due diligence measures (Åtgärder för kundkännedom)

##### 6.3 Initial customer due diligence (Initial kundkännedom)

*Table 4: CDD level by risk class*

| Risk class | CDD measures |
|---|---|
| Low | Simplified measures may be applied [describe] |
| Normal | Basic measures: identification and verification, beneficial owner, high-risk third country check, purpose and nature, PEP/RCA |
| High / Very high | Enhanced measures: additional information or controls and, in certain cases, approval by a competent decision maker |

##### 6.4 Ongoing customer due diligence (Fortlöpande kundkännedom)

*Table 5: Periodic review frequency*

| Risk class | Review at least |
|---|---|
| Low | Every five years |
| Normal | Every three years |
| High / Very high | Annually |

[Add event-driven review, for example after a report to the FIU or when new products are taken up.]

#### 7. Monitoring and reporting (Granskning och rapportering)
[Cover:
- risk-based scrutiny of transactions and activities;
- cooperation with authorities;
- reporting to the FIU without delay, with the CFA responsible;
- every employee's duty to report internally;
- the SAE's duty to establish the internal reporting process.]

#### 8. Record keeping (Bevarande av handlingar och uppgifter)
[State the retention period for CDD, scrutiny and reporting records, how it is extended and how records are kept accessible. `[VERIFY REFERENCE: retention periods under the national law and AMLR]`]

#### 9. Training (Utbildning)
[Cover annual training for everyone concerned; content (legal requirements, the BWRA, internal rules, current methods); tailoring by role; priority for control units and outsourced activities; responsibility (the CFA together with managers); and documentation of attendance.]

#### 10. Protection of employees, contractors and others (Skydd av anställda, uppdragstagare eller annan)
[The SAE ensures routines that protect staff who scrutinise or report from threats and hostile actions, and that no reprisals occur. Refer to the whistleblowing instruction or policy.]

#### 11. Suitability assessment of employees (Lämplighetsbedömning av anställd)
[Cover an extended background check for new hires and for internal moves into AML-relevant tasks, a structured recruitment process, and the recruiting manager's responsibility.]

#### 12. Processing of personal data (Hantering av personuppgifter)
[Cover processing under the GDPR; special categories of data only where necessary for CDD; that information supplied to the FIU is not disclosed; and that registers of suspected ML/TF are not matched with other parties' registers `[VERIFY REFERENCE]`.]

#### 13. Confidentiality (Tystnadsplikt)
[State the prohibition on disclosing to the customer or third parties that scrutiny or reporting has taken place, and state what is not unauthorised disclosure.]

#### 14. Model risk management and validation (Modellriskhantering och validering)
[State the models in scope (BWRA, customer risk classification, TM, screening), that the SAE owns the models and updates the routines, that the CFA ensures validation (including at outsourced providers), and refer to the MRM instruction.]

#### Appendix 1 Financial sanctions (Bilaga 1 Finansiella sanktioner)
[Cover:
- the regimes applied: UN, EU, national, and others chosen by the client, with a reason;
- screening of customers, beneficial owners, representatives and payments;
- the handling of true hits: freezing, blocking and reporting to the supervisor and the FIU;
- licences;
- voluntary self-disclosure;
- roles.]

---

### PART B – INSTRUCTION

**{{client_name}}**
**Instruction for measures against money laundering and terrorist financing** (*Instruktion för åtgärder mot penningtvätt och finansiering av terrorism*)

#### 1. Purpose (Syfte)
Example: "In the [policy title], the Board has established the basic guidelines for the work of {{client_short}} on measures against money laundering and terrorist financing. This instruction sets out the rules for that work. Further information and routines are found in [internal rules / intranet]. The [approver role] shall review this instruction [annually] or when needed."

[Group variant: add a scope clause stating that the minimum requirements are adopted in subsidiaries and branches with necessary adjustments and that stricter national law prevails.]

#### 2. Definitions (Definitioner)

*Table 6: Definitions*

| Term | Definition |
|---|---|
| Money laundering (*Penningtvätt*) | [legal definition] |
| Terrorist financing (*Finansiering av terrorism*) | [legal definition] |
| AML | Measures against money laundering and terrorist financing |
| Business relationship (*Affärsförbindelse*) | A business relationship expected, when established, to have a certain duration |
| Transaction (*Transaktion*) | A deposit, withdrawal, payment, transfer or similar, within or outside a business relationship |
| Occasional transaction (*Enstaka transaktion*) | A transaction by someone who is not a customer |
| PEP | Politically exposed person |
| RCA | Family member or known close associate of a PEP |
| [Client terms] | [SAE, CFA, competent decision maker, CRR, FIU, …] |

#### 3. Responsibilities (Ansvar)

[Use `references/roles-and-mandates.md`. Each subsection gives tasks, the delegation rule and reporting. For a group, add the accountability principles and the subsidiary and branch roles.]

##### 3.1 Overall responsibility (Övergripande ansvar)
Example: "The [CEO] is, under the Board, ultimately responsible within {{client_short}} for the work against money laundering and terrorist financing."

##### 3.2 Specially appointed executive (Särskilt utsedd befattningshavare)
[Tasks:
- the BWRA, updated at least annually and assessed against appetite;
- internal routines, regularly updated;
- control and follow-up of implementation;
- reporting to the Board and CEO on the risk assessment, status against appetite and key controls.

Delegation of execution is allowed. Reporting frequency: [at least half-yearly / quarterly], plus direct reporting on serious deficiencies.]

##### 3.3 Central function officer (Centralt funktionsansvarig)
[Tasks:
- monitoring and control;
- advice and support;
- information and training;
- FIU reporting and acting as the FIU contact;
- assessing whether the routines are adequate and effective;
- recommendations;
- reporting on control results and an aggregated assessment of risks and appetite.

Reporting frequency: [ ]. Direct reporting on matters of principle. Independence: "Direct reporting to the Board and CEO ensures the CFA's independent position."]

##### 3.4 AML officer or AML function (AML-ansvarig)
[Cover:
- review of alerts from [TM system] and of internal reports;
- control activities on the most significant mitigating measures;
- support to the business.]

##### 3.5 Security officer (Säkerhetschef)
[Cover:
- investigation of incidents;
- analysis of threats against staff arising from scrutiny or reporting;
- protective action plans for before, during and after a threat;
- the routines in [document].]

##### 3.6 Branch and department managers (Kontors- och avdelningschefer)
[Cover:
- staff knowledge and training;
- direct customer contact when CDD questions arise;
- support to staff;
- reporting without delay to the AML function, and reporting deviations to compliance.]

##### 3.7 Other employees (Övriga medarbetare)

##### 3.8 Personal liability (Personligt ansvar)
Example: "Intentionally or through gross negligence participating in money laundering or terrorist financing, neglecting one's duty to scrutinise or report, or breaching confidentiality carries criminal liability. The personal liability applies to every employee of {{client_short}}."

##### 3.9 Independent audit function (Oberoende granskningsfunktion)

#### 4. Risk assessment (Riskbedömning)

##### Risk appetite (Riskaptit)
[List the factors that, in addition to the Board's unacceptable and prohibited ones, are treated as very high risk and handled under special routines and special follow-up. Examples: [industry], customers with a strong connection to a high-risk third country, customers previously reported to the FIU. The SAE establishes routines and monitors and reports the development of the risk exposure.]

##### 4.1 Business-wide risk assessment (Riskbedömning av verksamheten)
[State where the BWRA is documented, who owns the process and presents it (the designated executive, SAE/SUB) and who adopts it (the CEO or the board, as required by national rules and the client's governing documents `[VERIFY REFERENCE]`).]

##### 4.2 Customer risk classification (Riskklassificering av kunder)
[Cover the principle, the factors and the classes. Then describe how the classification works in [system name], with a figure if helpful. Finally state the owner of the model, how it is monitored and who validates it.]

*Table 7: Customer risk classes*

| Class | Description |
|---|---|
| Low (*Låg risk*) | The risk of {{client_short}} being used for ML/TF is assessed as negligible |
| Normal (*Normal risk*) | The risk is assessed as normal for the business and accepted in ordinary business |
| High (*Hög risk*) | The risk is assessed as higher than normal, but is accepted to a limited extent if mitigating measures are taken |
| Very high (*Mycket hög risk*) | The risk is assessed as higher than high, and can be accepted only to a limited extent if mitigating measures are taken |

#### 5. Customer due diligence (Kundkännedom)

##### 5.1 General (Allmänt)
[Cover:
- the purpose of CDD;
- the triggers: establishing a relationship, occasional transactions at or above [threshold], linked transactions, transfers of funds above [threshold], suspicion, doubt about earlier information, and ongoing CDD;
- that CDD must be completed before the relationship starts;
- where CDD is documented: [system name].

`[VERIFY REFERENCE: thresholds under national law and AMLR]`]

###### 5.1.1 Sanctions screening (Sanktionskontroll)
[Cover who screens, when, in which system, how a potential hit is handled, and the escalation path to [manager / AML function]. State how the ongoing screening of the customer base is performed.]

##### 5.2 Basic customer due diligence measures (Grundläggande åtgärder för kundkännedom)
[Cover:
- sanctions screening;
- basic information;
- foreign connections (tax residence, citizenship);
- identification and verification of the customer and its representative;
- ownership and control structure and beneficial owner;
- PEP/RCA;
- purpose and nature, covering why the customer is a customer, its financial situation and source of funds, and the expected products, volume and frequency;
- ongoing follow-up.]

##### 5.3 Simplified customer due diligence measures (Förenklade åtgärder för kundkännedom)

##### 5.4 Enhanced customer due diligence measures (Skärpta åtgärder för kundkännedom)
[Cover the triggers, which always include high risk, PEP/RCA, high-risk third countries, correspondent relationships outside the EEA, and complex, unusually large or unusual transactions. Then cover the measures and approval by a competent decision maker.]

##### 5.5 Ongoing follow-up of the business relationship (Löpande uppföljning av affärsförbindelsen)
[Give the frequencies per class (Table 5), the event triggers and who is responsible.]

##### 5.6 Decision level by risk class (Beslutsinstans för risknivå) [add where relevant]

*Table 8: Decision levels*

| Risk class | Decision on onboarding and continuation |
|---|---|
| Low | [Within ordinary delegation] |
| Normal | [Within ordinary delegation] |
| High | [Competent decision maker in the customer case committee, with senior first- and second-line representation] |
| Very high | [Committee; CFA right of veto] |

##### 5.7 Termination and restriction of business relationships (Avslut av affärsförbindelse) [add where relevant]
[Cover:
- the committee decision;
- the minimum assessment (reasons, legal obstacles, group-wide effects, interim mitigation, internal report);
- execution: letter, closure, repayment and watch list;
- restriction when exit is not immediate: block, freeze and restrict, with an action plan.]

##### 5.8 CDD performed by third parties (Åtgärder som utförts av utomstående) [add where relevant]

#### 6. Transactions (Transaktioner)

##### 6.1 General (Allmänt)
[Cover:
- monitoring as both detection and ongoing follow-up;
- that monitoring is automated unless the BWRA says otherwise;
- a short description of [TM system] and of sanctions monitoring;
- that the SAE owns the investigation routine.]

Example: "Investigations shall be carried out promptly to establish whether there is a suspicion. They shall be documented so that, when a report is made, the FIU can pursue the matter further, and so that, when an alert is closed, a reasonably informed reader clearly understands why it was closed without a report. Reports shall be made at a relatively low degree of suspicion."

##### 6.2 Understanding the transaction (Förstå transaktionen)
[Cover the questions to ask the customer and the supporting evidence to request. List the transactions requiring particular attention (see `references/risk-appetite-and-customer-risk.md` §6).]

##### 6.3 Refraining from a suspicious transaction (Avstå från att genomföra misstänkt transaktion)

##### 6.4 Information accompanying transfers of funds (Information som ska åtfölja betalning)
[Describe the requirements under Regulation (EU) 2023/1113 and where payer information is registered: [system name]. `[VERIFY REFERENCE: thresholds]`]

##### 6.5 Control of international payments (Kontroll av utlandsbetalningar)

##### 6.6 Contacts with authorities (Myndighetskontakter)
Example: "A request from an authority shall also be treated as a risk indicator. In addition to answering the request, the customer should be investigated, in the same way as a manual alert."

#### 7. Reporting of suspected money laundering or terrorist financing (Rapportering)

##### 7.1 Internal reporting (Rapportering internt)
##### 7.2 Reporting to the FIU (Rapportering till Finanspolisen)
[Cover who reviews internal reports, who decides and files, and timelines: [decision within x working days; filing within y working days after the decision] `[TO CONFIRM]`. The CFA has the overall responsibility and handles questions from the FIU.]
##### 7.3 Confidentiality (Tystnadsplikt)

#### 8. Record keeping (Arkivering)

#### 9. Training and suitability (Utbildning och lämplighet)
[Minimum formats: e-learning, an oral introduction for new staff, and an annual session on current methods. Content is based on regulation, the BWRA and observations from investigations. Suitability testing covers conflicts of interest, experience and ethics.]

#### 10. Protection of employees (Skydd av anställda)
[Cover manager support, security rules, reporting of threats to the security officer, and no reprisals, with a reference to whistleblowing.]

[Appendices: routine descriptions for specific CDD steps, the investigation routine, the sanctions routine.]

---

### PART C – MANUAL OR GUIDELINE

**{{client_name}}**
**Manual for [customer due diligence / transaction monitoring / sanctions screening] [within business area]** (*Manual för …*)

[Document information block and change log, as above.]

#### 1. Introduction (Introduktion)
##### 1.1 Background and purpose (Bakgrund och syfte)
Example: "The Board and the SAE of {{client_short}} have decided on governing documents that form the framework for its work against ML/TF. For [business area], the framework consists primarily of: [policy]; [instruction]. This manual describes the operational processes and routines for [topic] and supports staff in [task]."
##### 1.2 Scope (Omfattning)
[State who must use the manual (primary users) and who may use it.]
##### 1.3 Document owner and adoption (Dokumentägare och fastställande)
Example: "The manual shall be updated annually, or more often if needed, and is adopted by [business area head]. The [head of AML] is responsible for review and updates. The manual shall be adopted annually even if no changes are made."

#### 2. Definitions (Definitioner)

#### 3. [Topic] – general questions
[Write the headings as the questions staff ask:]
##### 3.1 Who is a customer? (Vem är kund?)
##### 3.2 When must customer due diligence be completed? (När ska kundkännedom uppnås?)
##### 3.3 Why must we obtain customer due diligence? (Varför ska vi inhämta kundkännedom?)
##### 3.4 What does the risk-based approach mean in practice?
##### 3.5 What happens if sufficient customer due diligence cannot be achieved?

#### 4. [Process] – step by step
[Give steps per customer type and channel. For each step: what to do, the accepted evidence, the system field, and when to escalate. Cover false and true positives for sanctions and PEP checks.]

#### 5. Risk classification and enhanced measures

#### 6. Documentation (Dokumentation)
[State what must always be documented, and add standard texts: closing texts and reporting texts.]

#### Appendices
[Checklists, customer letters, forms, standard texts.]

---

### PART D – ROUTINE OR SOP

**{{client_name}}**
**Routine for [topic]** (*Rutin för …*)

[Document information block: routine, responsible, decision maker, adopted.]

#### 1. Background and scope (Bakgrund och scope)
[State the parent document, the entities covered and how stricter local rules are handled.]
Example: "Where local rules go beyond the requirements of this routine, the local rules shall be applied. Stricter local requirements shall be reported to the routine owner and the SAE for analysis and then adopted in a local routine."

#### 2. Process

*Table 9: Process steps*

| Step | Activity | Role | System or record | Output and deadline |
|---|---|---|---|---|
| 1 | [ ] | [ ] | [ ] | [ ] |

#### 3. Controls and evidence
#### 4. Records and retention

---

### PART E – ROLE MANDATE (Befattningsbeskrivning)

**{{client_name}}**
**Role description: [Specially appointed executive / Central function officer / AML specialist]**

This role description sets out the role holder's areas of responsibility, tasks, powers and purpose.

#### About the position (Om befattningen)

| Position (*Befattning*) | [title] |
|---|---|
| Location (*Tjänsteställe*) | [unit] |
| Reports to (*Närmaste chef*) | [CEO / Head of AML] |

#### Main responsibility (Huvudansvar)
Example (CFA): "{{client_short}} shall have a central function officer (CFA). The Board has appointed the [head of compliance] as CFA (second line). The CFA is ultimately responsible for continuously controlling that {{client_short}} fulfils its obligations under [national AML/CTF law] and [the supervisor's regulations]. The CFA is independent of the functions and areas that the CFA monitors and controls."

#### Tasks (Arbetsuppgifter)
[Use bullet points from `references/roles-and-mandates.md`, adapted to the client.]

#### Reporting (Rapportering)
Example: "The [role] shall report to the Board and the CEO at an appropriate frequency, and at least [half-yearly]. The report shall cover {{client_short}} and give an overview of the whole group. The following reporting points are mandatory: [list]. See the template for the [role] report to the Board and CEO."

#### Staff responsibility (Personalansvar) [if applicable]

#### Powers (Befogenheter)
Example: "The [role] has the authority to issue a veto whenever the [role] assesses that the risk of money laundering or terrorist financing is unacceptable in relation to the risk appetite adopted by the Board. The [role] may delegate responsibility and tasks to persons with adequate competence, experience and suitability, but remains ultimately responsible. Reporting to the Board and the CEO cannot be delegated."

#### Signature (Underskrift)
"This role description has been adopted by [the CEO / the line manager] and shall be updated no later than three years after the date below."
Place, date: [ ]

---

### PART F – BOARD DECISION MEMO (Beslutsunderlag)

**To:** Board of Directors of {{client_name}} **From:** [CEO / SAE] **Date:** {{date}}
**Item:** Adoption of [policy title], version [x.0]

#### 1. Proposed decision
"The Board is proposed to adopt [policy title], version [x.0], to replace version [y.0] adopted on [date]."

#### 2. Background
[Give the reason: annual review, BWRA update, regulatory change, findings.]

#### 3. Summary of changes

*Table 10: Changes*

| Section | Change | Reason | Source (regulation, BWRA, finding ID) |
|---|---|---|---|
| [5.1] | [Restricted activities added] | [BWRA identified …] | [BWRA {{date}}] |

[If there are no material changes, state: "The annual review has not identified any need for material changes. Editorial changes are listed in the change log."]

#### 4. Implementation
[Cover the instructions and manuals to be updated, training, communication and the timeline.]

#### 5. Appendices
[The proposed policy, with tracked changes and as a clean version.]

## Reference catalogues (inlined)

### Reference catalogue: data-request-and-workshops.md

This file holds the standard data request and the workshop agendas for a governing documents engagement. The team's sources show the method (templates, client-specific fields, role workshops, review rounds), but the request list itself is consolidated from the templates' open fields. Validate it with the team before first use.

##### 1. Data request (send at kick-off)

| No | Item | Used for | Priority |
|---|---|---|---|
| 1 | All current AML/CTF, sanctions and financial crime governing documents (policy, instructions, manuals, routines, SOPs, mandates, committee terms of reference), with version, adoption date and approver | Register, level screen, matrix | Must |
| 2 | The client's rules on governing documents (naming, levels, approval routes, template, information classes) | Architecture, format | Must |
| 3 | Organisation chart; board decisions appointing the SAE and the CFA; delegation rules (*delegationsordning*) | Roles, decision levels | Must |
| 4 | Group structure: subsidiaries, branches, agents, outsourcing agreements touching AML tasks | Group and local adoption | Must |
| 5 | Latest BWRA and SRA, with method and scales; risk appetite or the board decision on prohibited activities | Appetite, classes, consistency | Must |
| 6 | Customer risk classification model description (classes, factors, system, owner, last validation) | Instruction §4.2 | Must |
| 7 | Process descriptions or maps: onboarding per channel, periodic review, TM and alert handling, FIU reporting, sanctions screening, exit | Instruction and manual content | Should |
| 8 | System overview: core, CDD tool, TM, screening, case management, archive | Client-specific fields | Should |
| 9 | Latest SAE and CFA reports to the board; the CFA annual plan | Reporting points, frequencies | Should |
| 10 | Supervisory decisions and findings, internal audit reports, validation reports, open remediation | Changes that must be visible | Must |
| 11 | Related policies: outsourcing, privacy, whistleblowing, information security, ethics, MRM, ABC, fraud | Cross-references | Should |
| 12 | Training plan and training log; suitability assessment routine | Training and suitability sections | Could |
| 13 | Board calendar and the decision route for this engagement | Plan for adoption | Must |

##### 2. Workshop 1: architecture (SAE, CFA; 1.5–2 hours)

1. Show the current set and the results of the level screen: gaps, duplication, content at the wrong level.
2. Agree the target document map: which documents, who adopts each one, who owns it, and the cross-references.
3. Decide the scope: AML/CTF, sanctions as an appendix or a separate document, financial crime.
4. Decide group mechanics: group documents and local adoption.
5. Agree the timeline, linked to board and CEO decision dates.

##### 3. Workshop 2: roles and decision rights (SAE, CFA, CEO or COO; 2 hours)

Use `roles-and-mandates.md` as the agenda.
1. Who is the SAE? Is the holder a member of management? Line: first or a separate function?
2. Who is the CFA? How is independence secured (organisation, tasks, remuneration)? Which tasks are delegated, and to whom?
3. What is the reporting to the board and CEO: frequency (half-yearly or quarterly), mandatory points, format?
4. Who has a veto? On which decisions (very high risk, PEP, restricted customers, activities outside the appetite)?
5. Decision levels per risk class; composition and terms of reference of the committee; exit process.
6. Group: functional and administrative lines, local SAE and CFA, the group CFA's rights.
7. Roles that are easily forgotten: security officer, model owner, internal audit, HR (suitability), DPO.

##### 4. Workshop 3: risk appetite and operational standards (SAE, CFA, business heads; 2 hours)

1. Walk through the BWRA results. Confirm the scale and labels (library default: Low / Normal / High / Very high; record any client deviation).
2. Unacceptable activities by law. Proposed unacceptable and restricted activities by board decision (`risk-appetite-and-customer-risk.md`). Mark these for board decision.
3. Customer risk classes: CDD level, review frequency, decision level. Check that they are feasible against volumes and staffing.
4. Monitoring: automated or manual, investigation timelines, FIU decision route, QC.
5. Sanctions: lists applied, screening scope, handling of true hits, licences, voluntary self-disclosure.

##### 5. Review round (written; 1–2 weeks per round)

- Send the drafts with a comment resolution log: No | Document | Section | Comment | Raised by | Response | Status.
- Round 1: the SAE and the CFA. Round 2: legal, the DPO, HR and business heads, on their clauses. Final: the CEO, and the board memo.
- Close every comment before submitting the document for adoption.

##### 6. Questions to ask when existing documents are reviewed

- Does each document say who adopted it, when, what it supersedes and when it is next reviewed?
- Could a new employee carry out CDD or handle an alert from the manual alone? This is the "what versus how" test also used in `gap-analysis`.
- Does the instruction give each role in the policy concrete tasks? Does any task lack an owner?
- Are the risk classes, frequencies and deadlines the same in every document, and do they match the BWRA?
- Is any requirement in the matrix covered only in a manual (the board never decided it), or only in the policy (staff have no guidance)?
- Are any references outdated, any personal names used, or any template text left over?

## Placeholders

The blueprint text uses these placeholders. Fill each one from the request brief or the inputs. If a value is not known, write `[DATA NEEDED: …]` in the deliverable; never invent it, and never leave a `{{…}}` placeholder in a finished deliverable.

- `{{client_name}}` — the client's legal name (brief: client.legal_name)
- `{{client_short}}` — the defined term for the client, e.g. "the Company" (brief: client.defined_term)
- `{{date}}` — the deliverable date (brief: engagement.date)
- `{{jurisdiction}}` — the jurisdiction(s) (brief: engagement.jurisdictions)
- `{{language}}` — the output language (brief: engagement.output_language)
- `{{version}}` — the document version (brief: engagement.version)
