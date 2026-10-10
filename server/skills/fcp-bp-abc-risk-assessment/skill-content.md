# FCP blueprint [DRAFT]: ABC (bribery and corruption) risk assessment

Blueprint `abc-risk-assessment` v1.1 (draft – needs team input) from the FCP blueprint library, as ANTON skill `fcp-bp-abc-risk-assessment`. Produces a business-wide bribery and corruption risk assessment (ABC risk assessment): a report and a supporting workbook with corruption typologies, inherent risk per risk area, assessment of general and specific anti-bribery controls, residual risk, a risk register and a prioritised action plan. Runs on the same logic and scales as the AML/CTF business-wide risk assessment, so the two can sit side by side or be integrated in one financial crime risk assessment. Benchmarks against ISO 37001, OECD guidance and the UK Bribery Act adequate-procedures guidance, with the national layer plugged in through the jurisdiction placeholder. Use for a first or updated ABC risk assessment, an ABC module inside an integrated financial crime risk assessment, or a risk-based starting point for an ABC programme build or gap analysis.

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
- `_core/risk-scales.md` → the section "Shared risk language" below (guidance for wording and structure only — see the scoring boundary).
- `template.md` → the section "Deliverable template" below.
- The other `references/…` catalogues (`abc-controls.md`, `abc-regulatory-map.md`, `abc-risk-factors.md`, `abc-typologies.md`, `abc-workbook-layout.md`, `abc-workshop-and-data-request.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Draft status

This blueprint is a DRAFT – needs team input: it rests partly on analogy or general best practice. Tell the user so, and treat its section order, scales and calibrations as proposals until the team has validated them.

Validate before setting `status: stable`:

Items still to validate:
1. Risk areas.
2. Labels and control scale.
3. Residual matrix and maximum reduction.
4. Likelihood × impact.
5. Combining general and specific controls.
6. General-control requirements.
7. Typology catalogue.
8. Default format.
9. References marked `[VERIFY REFERENCE]`.

## Method and quality bar (blueprint sections 1–14)

### 1. Purpose and outcome

The deliverable is a documented, business-wide assessment of how `{{client_short}}` could become involved in bribery or corruption, how well its controls manage that risk, what risk remains and what must be done about it. It is the ABC counterpart of the AML/CTF business-wide risk assessment (allmän riskbedömning) and is built the same way. **(team ABC material, AML analogy)**

Corruption reaches a financial institution from two sides, and the assessment covers both:

- **Own organisation.** Staff, management or representatives give or take bribes, or are pressured into acting as enablers (möjliggörare). Examples: a bribe to approve a loan, to "launder the KYC", to leak information that enables fraud, or a procurement kickback.
- **Customers and financing.** The institution's products move the proceeds of corruption or finance bribery, for example through a loan to a company that bribes. In Sweden this can raise negligent financing of bribery (vårdslös finansiering av mutbrott) or complicity `[VERIFY REFERENCE]`. This side overlaps with the AML BWRA, so cross-refer instead of duplicating.

**Readers:** the board and senior management, who adopt the assessment and set risk appetite; the ABC compliance function, compliance and the SAE; internal audit; HR, procurement and finance; heads of business lines with risk-exposed roles.

**Decisions it enables:**

- Which corruption risks are within appetite and which need action, by whom and how urgently.
- Which roles, business associates and transactions carry "more than low" bribery risk. That is the ISO 37001 trigger for due diligence, targeted training and policy communication.
- Where to strengthen financial and non-financial controls.
- Inputs to the AML BWRA, customer risk rating, TM for bribe-type payments, the training plan and the audit plan. Evidence for ISO 37001 clause 4.5.4, for "adequate procedures" under failure-to-prevent regimes, and for business-conduct reporting.

### 2. When to use / when not to use

**Use when:**

- A client needs a first or updated ABC risk assessment, standalone or as an ABC module in an integrated financial crime risk assessment (AML + sanctions + ABC + fraud).
- An ABC programme is being built or recalibrated. In the team's approach, the inventory and risk workshop come before scoping the programme.
- A client prepares for ISO 37001 certification or an internal audit of its ABC programme and lacks the risk assessment that clause 4.5 requires.
- A trigger event occurs: an incident, media attention, an investment or M&A, a new market, or an owner or customer demand.

**Do not use, use instead:**

| Situation | Use |
|---|---|
| Money laundering and terrorist financing risk, including PEP risk as such | `aml-ctf-risk-assessment` |
| Fraud risk, external and internal | `fraud-risk-assessment` |
| Sanctions risk | `sanctions-risk-assessment` |
| Gap analysis of the ABC programme against ISO 37001 or the World Bank guidelines, or review of an existing assessment | `gap-analysis` or `compliance-review-report` (this blueprint's control catalogue can be reused) |
| ABC policy, instruction or code of conduct | `governing-documents` |
| ABC training for staff or the board | `training-and-presentations` |
| Due diligence on one specific third party, transaction or recruitment | Not a risk assessment. Due diligence is a follow-up step where risk is "more than low". Use the client's due diligence procedure. |
| Investigation of a suspected bribe | Out of scope. Escalate to the client's investigation procedure and legal counsel. |

### 3. Inputs

**Minimum to start** (in addition to the request-context minimum):

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| Business description: legal entities, products, customer segments, decision processes (credit, onboarding, investment, claims, procurement) | Typologies are built process by process | Annual report, website, org chart, kick-off meeting | Ask. Do not build typologies without it. |
| Scope decision: entities, standalone or integrated, own organisation and/or customer side | Determines structure and depth | Request brief, kick-off | `[ASSUMPTION: all entities, both perspectives, standalone report]` |
| Existing ABC policy or code of conduct, and any previous ABC risk assessment | Baseline, risk appetite and objectives | Compliance | Note "no ABC policy in place" as a finding. Proceed. |
| Latest AML BWRA and its scales | Consistency of scales and cross-references | Compliance or SAE | Use the library default in `_core/risk-scales.md` (section 7) and mark `[TO CONFIRM: alignment with the client's AML scales]` |

**Needed for a complete deliverable** (full list in `references/abc-workshop-and-data-request.md`):

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| Delegation of authority and approval matrix (attestordning, beslutsordning) | Shows where one person can decide alone | Finance, legal | `[DATA NEEDED]`. Rate the vulnerability conservatively. |
| Suppliers and spend by category; intermediaries, brokers, agents and introducers with commission terms | Third-party exposure | Procurement, finance, business | `[DATA NEEDED]` |
| Registers of gifts and hospitality, sponsorship, donations and conflicts of interest | Volume and pattern of benefits | Compliance, HR | A missing register is a control finding |
| Public-official contacts and public-sector customers | Public-official exposure | Business, legal | `[DATA NEEDED]` |
| Incidents, whistleblowing reports and investigations (aggregated, no names) | Likelihood and control evidence | Compliance | Request aggregated figures only |
| HR: background-check scope, incentive schemes, training records | Personnel risk and control evidence | HR, compliance | `[DATA NEEDED]` |
| Audit and compliance reports touching ABC | Independent evidence | Internal audit | Note the absence |
| Geographic footprint; PEP, adverse-media and TM data relevant to corruption | Country risk; customer side | Business, AML function | Cross-refer to the AML BWRA |

### 4. Regulatory and professional anchors

Full layered map with clause references and mapping tables: `references/abc-regulatory-map.md`. In the report, state "Regulatory status as of `{{date}}`" and remind the user that every reference must be checked against the current version. Corruption law is changing at both EU and national level.

1. **EU baseline.** Private-sector bribery is a criminal offence under Council Framework Decision 2003/568/JHA. An EU anti-corruption directive was proposed in 2023; check whether it has been adopted and when it must be transposed `[VERIFY REFERENCE]`. Corruption is a predicate offence to money laundering (Directive (EU) 2018/1673), so the customer side of corruption risk is also an AML matter, including PEPs under the national AML law and, from 10 July 2027, the AML Regulation (Regulation (EU) 2024/1624) with AMLA. Other instruments: Directive (EU) 2019/1937 on whistleblowing; conflicts of interest and inducements (EBA/GL/2021/05, MiFID II, IDD); ESRS G1 business conduct under CSRD, whose scope has changed `[VERIFY REFERENCE]`.
2. **International and extraterritorial law.** UNCAC and the OECD Anti-Bribery Convention and Recommendation. UK Bribery Act 2010, section 7 (failure to prevent), with the Ministry of Justice guidance on adequate procedures (six principles; principle 3 covers risk assessment). US FCPA and the US Department of Justice guidance on evaluating compliance programmes. These apply when `{{client_short}}` has a UK or US nexus.
3. **Standards.** ISO 37001: clause 4.1 (context factors), 4.5 (bribery risk assessment: identify, analyse, assess and prioritise, evaluate controls, set criteria, review, keep evidence), 8.2–8.10 (operational controls) and 9.2–9.3 (internal audit, management review). Also the World Bank Integrity Compliance Guidelines, the ICC Rules on Combating Corruption, and the Wolfsberg FAQs on risk assessments for ML, sanctions and bribery and corruption. Wolfsberg notes that ABC shares jurisdiction and client factors with ML and adds third parties, hiring, charitable giving, and gifts and entertainment.
4. **National layer through `{{jurisdiction}}`: Sweden.** Penal Code (brottsbalken) Chapter 10, Sections 5 a–5 e: tagande och givande av muta, handel med inflytande, vårdslös finansiering av mutbrott. Related offences: förskingring and trolöshet mot huvudman. Corporate fine (företagsbot) `[VERIFY REFERENCE]`. Also the whistleblowing act (2021:890), the AML act (2017:630) with FFFS 2017:11, FFFS 2014:1 on governance, and Näringslivskoden as self-regulation. A reform of corruption and tjänstefel offences is in progress `[VERIFY REFERENCE]`. For other Nordic countries, see the reference file.
5. **Register.** In Sweden, most financial firms have no supervisory obligation to run a separate ABC risk assessment, and there is no administrative sanction comparable to AML. Write "shall" only for legal requirements, "is expected" for standards, and "we recommend" for professional judgement.

### 5. Method

The method mirrors the team's nine-step AML BWRA process (external monitoring, workshops, data, inherent risk, controls, residual risk, compilation, consultation and adoption, action plan and training) and the team's seven-step ABC approach. Steps 4 and 8 carry the ABC-specific content.

**ABC risk areas (risk factors are grouped under these):**

| Code | Risk area | AML counterpart | What it covers |
|---|---|---|---|
| BUS | Business activities, products and decision processes | Products and services | Decisions that can be bought: credit and loan approval, onboarding and KYC approval, alert handling, investment and fund selection, claims, collections and write-offs, pricing exceptions |
| TP | Business partners and third parties | Distribution channels | Intermediaries, loan brokers, agents, introducers, suppliers (IT, consultancy, training), outsourcing providers, joint ventures, correspondent and partner institutions |
| CUS | Customers and counterparties | Customers | Public bodies and state-owned entities as customers, PEPs and officials, customers in high-corruption sectors, financing of customers' activities |
| GEO | Geography | Geography | Countries of entities, operations, suppliers, intermediaries and customers |
| ORG | Internal organisation, people and culture | Organisation (secondary area in the AML method) | Contact with public officials, gifts, hospitality, donations, sponsorship and political contributions, recruitment, incentives, delegated authority, decentralisation, conflicts of interest, insiders and enablers |

Catalogue: `references/abc-risk-factors.md`.

1. **Kick-off and scoping.** Agree the scope (entities, standalone or integrated, which perspectives), the timeline, the client owner and the participants, and agree the scales with the AML owner. *Why:* ABC sits between compliance, HR, procurement and the business, and nobody owns it by default, so settle "who owns the ABC process?" early. *Client interaction:* a 60–90 minute kick-off, with the data request sent the same day. **(team ABC material)**

2. **Inventory and calibration.** List the current ABC objectives, policies and procedures. Then map what already exists in other processes, especially AML: KYC, PEP, adverse media, TM and incident reporting. *Why:* the team builds ABC on existing AML and compliance processes, not in parallel. *Judgement:* a control that exists only on paper is not a control. Record it now and test it in step 8. **(team ABC material)**

3. **Context (omvärldsbevakning).** Collect the ISO 37001 clause 4.1 factors: structure and delegated authority, locations and sectors, business model, business associates, and contact with public officials. External sources: national risk assessments, police and crime-prevention reports on enablers and infiltration, the national banking association's threat assessment, sector court cases, CPI scores and media. Internal sources: incidents, whistleblowing, audit findings and AML reports involving corruption. **(AML analogy, ABC best practice)**

4. **Identify typologies (corruption scenarios).** For each decision process and relationship, describe how a bribe would actually work: who pays whom, for which decision, through which channel, and how it is concealed. Start from `references/abc-typologies.md` and keep only what is relevant. *Why:* in the team's experience, organisations focus on gifts and entertainment and overlook enablers in credit decisions, large projects and procurement. *Judgement:* include passive corruption, meaning payment or threats to *not* review, escalate or report, as well as pressure on staff. **(team ABC material)**

5. **ABC risk workshops and interviews.** Run workshops with the key functions: the heads of credit, onboarding, investments and claims, plus procurement, IT, HR, finance, legal, compliance/AML and sales. Interview a sample of risk-exposed roles. In the workshops, confirm the typologies, describe existing controls and identify vulnerabilities. *Why:* ISO 37001 expects key functions to be involved, and the workshop also builds risk awareness. *Format:* 2–3 workshops of about 2 hours, grouped by process `[ASSUMPTION: adjust to client size]`. Use the question bank in `references/abc-workshop-and-data-request.md`, for example: "Is the intermediary needed? How is it priced? Is the person who introduced it also approving its invoices? Who checks delivery against the contract?" **(team ABC material)**

6. **Data collection and quantification.** Quantify exposure per risk factor: supplier spend by category, intermediaries and commissions, gifts above the threshold, contacts with public officials, credit decisions under single-person mandates, staff in risk-exposed roles, incidents and reports. State the sources, the reference date, the processing and the limitations. *Judgement:* corruption is under-detected, so give external evidence and vulnerabilities more weight than low internal incident counts. **(AML analogy)**

7. **Assess inherent risk.** For each risk factor and typology, document the threats, the vulnerabilities, the external and internal references, likelihood and impact, and the inherent level with its rationale (section 7). Show interactions. For example, a broker channel combined with single-person credit mandates raises the credit-approval typology. **(AML analogy)**

8. **Assess controls, general and specific.** *General controls* are the ABC management system. Assess each subarea against requirements for effectiveness (Y/N/PC) and rate it Strong to Non-existing (`references/abc-controls.md`, Part A). *Specific controls* are assessed per typology: for each red flag, the preventive or detective control in place and its effectiveness. They cover financial and non-financial controls, due diligence and the customer-side controls shared with AML (Part B). Test operating effectiveness by walkthrough or sample where the engagement allows (Part E). **(AML analogy, team ABC material)**

9. **Residual risk and risk appetite.** Apply the residual matrix in `_core/risk-scales.md` §3, aggregate per risk area and compare the result with risk appetite (`_core/risk-scales.md` §7). If the client has no appetite, recommend setting one; ISO 37001 requires evaluation criteria. Run a root cause analysis for High and Very high residual risks, so that training, control design and improvement address causes rather than symptoms. **(AML analogy, team ABC material)**

10. **Consultation, adoption, risk register and action plan.** Run a consultation round, quality-assure the data and present to senior management for adoption. Link every action to a risk ID. Name the outputs for the AML BWRA, the training plan, the due diligence thresholds and the audit plan. Propose the AML rule: an action plan within two months of adoption, with quarterly status reporting. **(AML analogy, team ABC material)**

11. **Monitoring and update.** Update at least annually and on significant change (new markets, M&A, restructuring, a major incident, new law). Top management reviews the programme at least yearly (ISO 37001 clause 9.3). Several minor non-conformities in one process count as a major one. The team proposes an effectiveness review 9–12 months after the first assessment. **(team ABC material, ABC best practice)**

### 6. Deliverable structure

The report follows the section order of the team's typology-based BWRA report, with the risk-area chapters re-cut into the five ABC areas (skeleton: `template.md`). When the report is integrated in a financial crime BWRA, sections 3–8 become one ABC chapter and sections 9–10 merge with the AML chapters.

| Section | Purpose and content | Typical length | Style |
|---|---|---|---|
| Decision and change log | Version, decided by, date, document owner, changes | Table | Factual |
| Executive summary | Overall residual ABC risk, a heat map per risk area, 3–5 key messages, top actions, decision required (adoption, risk appetite). Keep it short and lead with the conclusion. | 1–2 pages | Board language, no jargon |
| 1 Introduction | 1.1 Background and purpose; 1.2 Roles and responsibilities; 1.3 Scope and definitions (bribery, trading in influence, facilitation payment, business associate, public official) | 2–3 pages | Precise, defined terms |
| 2 Methodology | 2.1 Method (typology-based, inherent → controls → residual); 2.2 Criteria for the risk assessment (all scales); 2.3 Sources of information; 2.4 Sources of data and limitations; 2.5 Review and updates | 3–4 pages | Explanatory; why, not just what |
| 3 Corruption typologies and threats | Context and trends (enablers, insiders, friendship corruption), then the relevant typologies: own organisation first, then customers and financing. Each has a modus operandi and red flags. | 4–8 pages | Concrete scenarios |
| 4–8 Inherent risk per risk area | One chapter per area (BUS, TP, CUS, GEO, ORG). Each opens with "General information, relevant exposure and summary" (exposure figures plus a summary table), then per risk factor: About …, Risk description and red flags, Risk assessment ending in a rating sentence. | 2–5 pages each | Evidence-based; numbers over adjectives |
| 9 Controls | 9.1 General controls: summary table per subarea and a short assessment per subarea. 9.2 Specific controls: per typology, a table of Red flag / Detective or preventive controls in place / Assessment of effectiveness. | 5–10 pages | Balanced: strengths and weaknesses |
| 10 Residual risk and risk appetite | Risk overview table, aggregated residual risk per area, comparison with appetite, root causes | 2–3 pages | Decision-ready |
| 11 Conclusions, recommendations and action plan | Prioritised actions with owner and timing. Links to AML BWRA, training, due diligence and audit plan. | 2–3 pages | Actionable, prioritised |
| Appendices | A Risk register. B Scales and matrices. C Workshops, interviews and documents reviewed (roles, not names). D General controls checklist. E Mapping to ISO 37001, the UK MoJ principles and national law. | As needed | Tables |

### 7. Scales, scoring and calculations

ABC uses the shared risk engine in `_core/risk-scales.md` without changes: the risk labels (§1), the control scale and the rule for combining general and specific controls (§2), the residual risk matrix with its conservatism rules (§3), aggregation (§4), the likelihood × impact step (§6), appetite and KRIs (§7) and colours (§9). Never mix scales in one deliverable. If the client has adopted its own methodology, use the client's version and record each deviation from `_core/risk-scales.md` in the methodology section of the report. The library default is still to be confirmed by the team (see the validation list at the top). **(AML analogy)**

**Inherent risk (inneboende risk).** Labels: Low / Normal / High / Very high, plus Unacceptable (Swedish: Låg / Normal / Hög / Mycket hög / Oacceptabel). "Moderate" and "Medium" are not used as risk levels. ABC-specific descriptors:

| Level | Definition |
|---|---|
| Unacceptable | The activity or relationship is outside risk appetite regardless of controls, for example facilitation payments or retaining an intermediary with known corrupt conduct. It must be stopped or exited. |
| Very high | Clear and major vulnerabilities through which `{{client_short}}` or its staff could give, take or facilitate bribes, with high exposure. |
| High | Identified threats and vulnerabilities increase the risk that `{{client_short}}` is involved in bribery or corruption through the risk factor. |
| Normal | Threats and vulnerabilities are identified, but overall they are not significant for `{{client_short}}`'s exposure. |
| Low | Few or no identified threats or vulnerabilities for the risk factor. |

**Likelihood and impact.** Rate likelihood (1–4) and impact (1–4) with the descriptors and the matrix in `_core/risk-scales.md` §6, which are not repeated here. The resulting level is the inherent risk. The rating is a reasoned judgement: the matrix supports it and does not replace it. Document any override. ABC-specific additions when applying §6 (they guide how evidence is read and do not change the descriptors or the matrix):

- Corruption is under-detected. Do not rate likelihood 1 (Unlikely) only because no incidents are recorded. Check sector and peer evidence and indications such as whistleblowing reports, audit findings and open vulnerabilities in the process.
- Rate impact on the most serious realistic consequence, including criminal liability or a corporate fine (företagsbot), supervisory intervention, licence risk and credit loss, and read it against the impact descriptors in §6.

**Control effectiveness (kontrollnivå).** Strong / Adequate / Weak / Non-existing (Stark / Tillfredsställande / Svag / Obefintlig), as defined in `_core/risk-scales.md` §2. The scale is used for both specific controls and general-control subareas; subarea-level wording is in `references/abc-controls.md`. Strong requires evidence of operating effectiveness; controls assessed on design only are rated Adequate at most. ABC-specific addition: each requirement for effectiveness is answered Yes / No / Partly covered (Y/N/PC) with a justification. The subarea rating is a judgement based on the answers, and a "No" on a requirement that is critical for the subarea, for example "no channel for raising concerns", caps the rating at Weak.

**Combined control rating.** Apply the rule in `_core/risk-scales.md` §2. The specific control rating is the starting point. General controls in the relevant subarea may move the combined rating by at most one grade, up or down (specific Strong + general Weak = Adequate). Strong general controls never lift a Weak or Non-existing specific control. More weight may be given to general controls case by case when the general subarea is what actually mitigates the risk. Document the reasoning in the workbook's "Combined controls assessment" column.

**Residual risk (kvarstående risk).** Apply the matrix in `_core/risk-scales.md` §3, including its Unacceptable row (an Unacceptable inherent risk stays Unacceptable whatever the controls). The conservatism rules apply as written there: inherent risk is reduced by at most two levels (Very high to Normal only with a written motivation), weak or non-existing controls can raise residual risk above inherent risk (Low + Weak = Normal), and manual overrides need documented reasoning and are listed in the residual risk section. The matrix is shown in the report's scale appendix as a copy of §3.

**Residual risk and required measure** (house-standard priorities for the action plan; position against appetite per `_core/risk-scales.md` §7):

| Residual risk | Position against appetite | Required measure | Priority in action plan |
|---|---|---|---|
| Very high | Outside appetite. Board decision: remediate, restrict or exit | Requires extensive improvements to controls and mitigating measures | Immediate. Board attention. |
| High | Outside appetite unless a time-limited action plan is approved by management | Requires strengthened controls and mitigating measures; action plan with owner and deadline | Within about 3 months |
| Normal | Within appetite | Analyse and improve if necessary | Within 6–12 months |
| Low | Within appetite | Accept and monitor | Monitor |

**Aggregation per risk area.** As in `_core/risk-scales.md` §4: assign Very high = 4, High = 3, Normal = 2, Low = 1 and calculate the average residual value per risk area, mapped back with the intervals in §4. An Unacceptable item is reported separately and is never averaged away. A single Very high typology may justify raising the area rating; state why. **(AML analogy)**

**Colours:** as in `_core/risk-scales.md` §9. Always show the label as well.

### 8. Supporting artefacts

- **ABC risk assessment workbook** (Excel): Instructions; Inputs (data request answers); Typologies; one inherent-risk sheet per risk area with threat and vulnerability columns; General controls; Specific controls; Residual risk overview; Risk register and action plan; Scales. Sheets, columns and ID conventions are in `references/abc-workbook-layout.md`. The report is written from the workbook, and every rating in the report has a row ID in the workbook.
- **Data request list** and **workshop plan with question bank**: `references/abc-workshop-and-data-request.md`.
- **Risk register**, with the fields from the team's ABC material (risk ID, process, risk owner, effect, probability, consequence, action, estimated cost, deadline, status, residual risk). Layout in `references/abc-workbook-layout.md`.
- **Action plan**, a separate document or sheet linked to risk IDs. Use the house finding format for weaknesses.
- **Optional:** one board slide with a heat map and top five actions, following `_core/output-formats.md`.

### 9. Writing rules specific to this deliverable

- **Name the scenario.** Weak: "There is a risk of internal corruption in lending." Good: "A credit officer with a single-person mandate could approve a loan backed by falsified income documents from a loan broker in return for a payment. [n] % of consumer loans are broker-introduced, and mandates up to [amount] need no second approver."
- **Never imply that a person committed an offence.** Describe risk, red flags and control gaps. Report incidents in aggregate and anonymised form, with no names of employees, whistleblowers or counterparties. If the material reveals a possible actual bribe, stop and tell the user to escalate to the client's investigation procedure and legal counsel.
- **Use the legal terms of the jurisdiction.** For Sweden: muta, otillbörlig förmån, tagande/givande av muta, handel med inflytande, vårdslös finansiering av mutbrott, trolöshet mot huvudman, jäv, intressekonflikt, möjliggörare. Explain on first use when writing in English.
- **Keep the two perspectives visibly apart** (own organisation, and customers and financing), and cross-refer to the AML BWRA for PEP and proceeds-of-corruption risk instead of repeating it.
- **Distinguish due diligence from risk assessment.** The assessment sets the thresholds ("more than low"); due diligence applies them to a specific person, partner or transaction.
- **Do not overstate obligations.** See the register note in section 4. Avoid "zero tolerance" language unless controls back it.
- **ISO wording when benchmarking.** Use "more than low bribery risk", "business associate", "anti-bribery compliance function". Note that the compliance function can be combined with the general compliance function but not with internal audit.
- **Rating sentence**, reused from the AML template so the documents read the same: "Based on a qualitative assessment of the above, [risk factor] represents a risk factor for `{{client_short}}` that is [Very high/High/Normal/Low] with regard to bribery and corruption."

### 10. Quality checklist

- [ ] Both perspectives are covered, or the scope explicitly excludes one and says why.
- [ ] Every relevant decision process (credit, onboarding/KYC, investment, claims and collections, procurement, recruitment) has been considered for typologies.
- [ ] Each typology has a modus operandi, red flags, a likelihood and impact rationale and linked controls.
- [ ] Passive corruption and enablers under pressure are addressed, not only gifts and hospitality.
- [ ] Inherent risk, controls and residual risk are kept apart and each rating has a workbook row ID.
- [ ] The scales are identical to the AML BWRA or the deviation is explained.
- [ ] Data sources, reference date and limitations are stated, and missing data is marked `[DATA NEEDED]`.
- [ ] General controls are assessed against requirements (Y/N/PC), and specific controls against red flags.
- [ ] Residual risk is compared with risk appetite, or the absence of an appetite is a finding.
- [ ] Each High or Very high residual risk has a root cause and an action with owner and timing.
- [ ] Outputs to the AML BWRA, training plan, due diligence thresholds and audit plan are listed.
- [ ] No names of persons, counterparties or other clients appear, including in incident descriptions.
- [ ] Legal references carry the baseline date, and uncertain ones are marked `[VERIFY REFERENCE]`.
- [ ] House-standard checklist completed.

### 11. What makes it stand out

- **Two-sided view.** It covers corruption by the firm's own people and third parties, and also the firm's products being used to launder corruption proceeds or finance bribery, which links to the AML BWRA. A generic assessment covers only the first.
- **Typology-based and sector-specific.** It starts from how corruption actually happens in financial firms (credit decisions, laundered KYC, broker schemes, insider information, investment decisions, procurement), not from a gifts checklist.
- **Same engine as the AML assessment.** Shared scales, matrix, workbook columns and report structure give the board one financial crime risk picture and bring ABC into the annual BWRA cycle.
- **General and specific controls kept apart.** Management-system maturity (ISO 37001) is assessed separately from whether concrete red flags are caught.
- **Built-in links.** Results feed due diligence thresholds, training of risk-exposed roles, TM for bribe-type payments, customer risk rating and the audit plan. Root causes drive improvement.
- **Benchmark-ready.** The structure maps to ISO 37001, the UK MoJ principles and the World Bank guidelines.

### 12. Common pitfalls

- Gifts and hospitality get the attention while enablers in credit, large projects and procurement are overlooked.
- Risk assessment is confused with due diligence, or treated as a one-off.
- Compliance exists on paper only: controls are not tested, and nobody checks whether staff would report. Survey evidence the team uses shows that many employees do not.
- Likelihood is rated Low because no incidents are recorded, although corruption is under-detected.
- Passive corruption and pressure on staff are ignored.
- HR, IT or procurement are missing from the workshops.
- There is no risk appetite and no KPIs, so the ratings drive no decisions.
- ABC runs as a silo, duplicating the AML work on PEPs and adverse media.
- Internal audit acts as the ABC compliance function.
- Incentive schemes that reward volume are not assessed.
- Legal obligations are overstated, or a UK or US nexus is missed.

### 13. Variants

**By client type**

| Client type | Emphasis |
|---|---|
| Bank / credit market company | Credit and mortgage approval, broker channels, corporate lending to high-risk sectors (negligent financing), KYC and alert handling, procurement of IT and consulting, PEP and SOE customers |
| Payment or e-money institution | Agents and distributors, merchant onboarding decisions, partner programmes, cross-border corridors, incentive-driven sales |
| Insurance | Claims handling (accomplice to insurance fraud), intermediaries and inducements, sponsorships, investment of the insurance portfolio |
| Fund manager / investment firm | Fund selection and mandates, inducements, capital raising, PE and VC deal processes, unlisted holdings (corruption risk in portfolio companies affecting asset value), conflicts of interest |
| Consumer credit | Loan brokers and lead generators, falsified applications with insider help, collections and write-offs |
| Non-financial obliged entity or corporate | Public procurement, permits and licences, agents abroad, supply chain. The BUS area becomes sales and procurement processes. |

**By size.** Small firms get one combined workshop, a shortened report (executive summary, typologies, one consolidated inherent-risk table, controls, action plan) and the same scales. Large or group clients get assessments per entity or business line aggregated to group level, with group-wide general controls and local specific controls.

**By maturity.**

- *Low:* the first assessment doubles as awareness raising. Accept more `[DATA NEEDED]` markers, and give priority to policy, ownership, risk appetite and a register of benefits.
- *Medium:* add testing of key financial and non-financial controls.
- *High or ISO-oriented:* add KPI review, management review inputs and mapping against ISO 37001 clauses for each control.

**By format.** Standalone report, or an ABC chapter in an integrated financial crime BWRA. For the integrated format, keep separate rating rows for ABC so the views can still be segregated.

### 14. How the assistant should work

1. **Read the brief first** (`_core/request-context.md`). Ask at most five questions, for example on: entities in scope; standalone or integrated; previous ABC or AML assessment and its scales; decision processes and third-party channels; available incident and register data.
2. **Confirm scope and scales** in one short message before drafting. Apply the library default in `_core/risk-scales.md`. If the client has adopted its own methodology (for example different labels), use the client's version and record each deviation in the methodology section.
3. **Produce in this order:** (a) typology long-list and workshop plan with data request; (b) workbook structure with risk factors and typologies filled in from the input; (c) inherent ratings with rationale; (d) control assessment; (e) residual risk and action plan; (f) the report, executive summary last.
4. **Use the references.** Select relevant risk factors, typologies and controls from `references/` and adapt them to the client. Never paste the full catalogue.
5. **Mark gaps.** Use `[DATA NEEDED: …]` for missing data, `[TO CONFIRM: …]` for statements to verify with the client, and `[ASSUMPTION: …]` where you proceed without confirmation. List all markers at the end for the user.
6. **Stop and ask** when the material suggests an actual bribe or ongoing misconduct, when a rating would rest entirely on assumptions for a High or Very high risk, or when the client's appetite or scales conflict with this blueprint.
7. **Writing in the client's name** (`author_of_record: client`). Use the client's voice ("the Company has assessed…"), and keep firm references out of the body.
8. **Outputs:** follow `_core/output-formats.md` for Word and Excel. When the tool can only produce text, give the report in Markdown with workbook tables inline.

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: Bribery and corruption risk assessment

<!-- Skeleton of the main deliverable. Write in {{language}}. Swedish terms in parentheses are for output in Swedish. Delete all [bracketed guidance] before delivery. Every rating refers to a row ID in the workbook. -->

[Cover page]

**{{client_name}}**
**Bribery and corruption risk assessment {{reporting_period}}** (Allmän riskbedömning avseende mutor och korruption)
Document type: Risk assessment | Version {{version}} | {{date}} | Confidentiality: [Confidential]
Prepared by: [{{firm_name}} for {{client_short}}, or {{client_short}} when the client adopts the document as its own]

---

#### Decision and Change Log (Beslut- och ändringslogg)

| Version | Decided by | Date | Document owner | Changes |
|---|---|---|---|---|
| {{version}} | [Board / CEO] | {{date}} | [Role, e.g. Head of Compliance] | [First version / annual update / event-driven update: reason] |

---

#### Executive summary (Sammanfattning)

[One to two pages. Lead with the conclusion. Cover the overall residual bribery and corruption risk, the heat map, three to five key messages, the most important actions and the decision required. Keep it short and highlight the essentials.]

Example: "Overall, {{client_short}}'s residual risk of involvement in bribery and corruption is assessed as **[High]**. The inherent risk is driven mainly by broker-introduced lending under single-person credit mandates and by procurement of IT and consulting services. Controls are Adequate at the level of the management system but Weak for broker oversight and supplier due diligence. We recommend three immediate actions: […]. The Board is asked to adopt the assessment and to confirm the risk appetite for bribery and corruption."

*Table 1: Inherent and residual risk per risk area*

| Risk area | Inherent risk | Combined controls | Residual risk | Trend vs previous year |
|---|---|---|---|---|
| Business activities, products and decision processes | | | | ↑ / → / ↓ / new |
| Business partners and third parties | | | | |
| Customers and counterparties | | | | |
| Geography | | | | |
| Internal organisation, people and culture | | | | |
| **Overall** | | | | |

[Figure: heat map of residual risk per risk area. Label every cell; do not rely on colour alone.]

**Key messages**
1. […]
2. […]
3. […]

**Priority actions and decisions required**

| ID | Action | Owner | Timing |
|---|---|---|---|
| A-01 | | | Immediate |

---

[Table of contents]

---

#### 1 Introduction (Inledning)

##### 1.1 Background and purpose (Bakgrund och syfte)

[Who {{client_short}} is (institution type, supervisor, main activities), described generically. Then why the assessment is made: the legal framework (criminal law on bribery, whistleblowing, AML/PEP), standards used as benchmark, and any trigger (annual cycle, incident, new market, ISO 37001 preparation). Then the two perspectives.]

Example: "{{client_name}} ("{{client_short}}") is a [credit market company] under the supervision of {{supervisor}}. Bribery and corruption can affect {{client_short}} in two ways: its staff, management or business partners may give or take bribes in connection with {{client_short}}'s activities, and {{client_short}}'s products and services may be used to launder the proceeds of corruption or to finance bribery. The purpose of this assessment is to identify and assess both, to evaluate how well existing controls manage them and to decide the measures needed."

[State the regulatory baseline date: "Regulatory status as of {{date}}."]

##### 1.2 Roles and responsibilities (Roller och ansvar)

[Use roles, never names. Adapt to the client's governance documents.]

| Role | Responsibility in the assessment |
|---|---|
| Board of Directors (styrelsen) | Receives the results, sets the risk appetite, adopts [or notes] the assessment |
| CEO (VD) | [Adopts the assessment]; ensures resources and implementation of actions |
| Function responsible for anti-corruption compliance [e.g. Compliance] | Owns the method and process, carries out the assessment and reports the results |
| SAE / MLRO (särskilt utsedd befattningshavare / centralt funktionsansvarig) | Is consulted on the customer and financing perspective and the links to the AML BWRA |
| Business heads (credit, onboarding, investments, claims) | Contribute knowledge of decision processes, risks and controls |
| HR, Procurement, Finance, IT, Legal | Contribute knowledge of recruitment, incentives, suppliers, payments, access and contracts |
| Internal audit (internrevision) | Independent review; does not perform the assessment |

##### 1.3 Scope and definitions (Omfattning och definitioner)

[Entities, branches, business lines and period covered. Whether both perspectives are covered. What is out of scope and why (e.g. "fraud is assessed in a separate fraud risk assessment").]

*Table 2: Definitions*

| Term | Definition used in this assessment |
|---|---|
| Bribery (muta / mutbrott) | [Offering, promising, giving, accepting or requesting an undue advantage of any value, directly or indirectly, as an inducement or reward for acting or refraining from acting in relation to a person's duties. Align with the law of {{jurisdiction}}.] |
| Corruption (korruption) | [Abuse of an entrusted position for private gain, own or another's. Includes bribery, trading in influence, conflicts of interest and favouritism.] |
| Trading in influence (handel med inflytande) | |
| Negligent financing of bribery (vårdslös finansiering av mutbrott) | |
| Business associate (affärspartner) | [External party with which {{client_short}} has or plans a business relationship: customers, suppliers, intermediaries, agents, joint ventures.] |
| Public official (offentlig tjänsteperson) | |
| Facilitation payment | |
| Enabler (möjliggörare) | [Person who misuses an employment or assignment to help criminal actors, sometimes under pressure or threat.] |

---

#### 2 Methodology (Metod)

##### 2.1 Method

[If the method is described in a separate instruction, refer to it and summarise in one paragraph. Otherwise describe it here.]

Example: "The assessment is typology-based. {{client_short}} has first identified how bribery and corruption could realistically occur in its decision processes and relationships (typologies). On that basis, the inherent risk has been assessed per risk factor in five risk areas: business activities, products and decision processes; business partners and third parties; customers and counterparties; geography; and internal organisation, people and culture. Existing controls have then been assessed in two parts: general controls (the anti-bribery management system) and specific controls (measures addressing specific red flags). Combining inherent risk and controls gives the residual risk, which is compared with {{client_short}}'s risk appetite."

##### 2.2 Criteria for the risk assessment (Kriterier för riskbedömningen)

[Insert all scales as defined in `_core/risk-scales.md` (blueprint section 7): inherent risk levels, likelihood and impact (§6), control effectiveness and the combination rule (§2), residual risk matrix (§3), residual risk and required measure, aggregation (§4). Same scales as the AML BWRA. If the client has its own methodology, use it and state each deviation here.]

*Table 3: Inherent risk levels* | *Table 4: Control effectiveness* | *Table 5: Residual risk matrix* | *Table 6: Residual risk and required measure*

[State the conservative rules: "Inherent risk is reduced by at most two levels; Very high to Normal requires a written motivation. Weak or non-existing controls can raise residual risk above inherent risk."]

##### 2.3 Sources of information (Informationskällor)

[External and internal sources used. Who took part in workshops and interviews, by role. Full list in Appendix C.]

Example: "The external analysis considered [national risk assessments, reports from the police and crime-prevention authorities on enablers and infiltration, sector threat assessments, relevant court cases and the Corruption Perceptions Index (edition [year])]. Workshops were held with [credit, procurement, HR, IT, finance, compliance] on [dates]."

##### 2.4 Sources of data (Datakällor)

[Data per risk area, reference date, who processed it, and limitations.]

*Table 7: Data used*

| Data | Source system / owner | Reference date | Limitations |
|---|---|---|---|
| Supplier spend by category | [ERP / Procurement] | | |
| Intermediaries and commissions | | | |
| Gifts and hospitality register | | | [e.g. register introduced mid-year] |
| Whistleblowing and incident statistics (aggregated) | | | |

##### 2.5 Review and updates (Översyn och uppdatering)

Example: "The assessment is reviewed at least annually and updated when {{client_short}} enters new markets or segments, carries out acquisitions or restructuring, introduces significantly changed products or processes, or when an incident or new regulation affects the risk. [Role] is responsible for review and updates."

---

#### 3 Corruption typologies and threats (Typologier och hot)

##### 3.1 Context and trends (Omvärld och trender)

[Two or three paragraphs on the corruption situation relevant to {{client_short}}: national trends (e.g. friendship corruption, enablers and insiders, pressure on staff from organised crime), sector cases and regulatory change. Cite sources. No client-unrelated statistics without source and year.]

##### 3.2 Typologies: own organisation (Typologier: den egna organisationen)

[Only typologies relevant to {{client_short}}. For each, use the structure below. Source catalogue: references/abc-typologies.md.]

###### 3.2.x [Typology name, e.g. "Bribe for credit approval"] (T-ABC-xx)

**Modus operandi:** [How it would work at {{client_short}}: who, what decision, which channel, how concealed.]

**Red flags:** [3–6 indicators.]

**Relevant for:** [Processes, roles, products]

##### 3.3 Typologies: customers and financing (Typologier: kunder och finansiering)

[Proceeds of corruption through accounts, financing of bribery, public-sector customers. Cross-refer to the AML BWRA for PEP risk; do not duplicate.]

Example: "Customer-related corruption risk, in particular PEPs and the laundering of proceeds of corruption, is assessed in {{client_short}}'s AML/CTF business-wide risk assessment ([section]). This chapter covers the additional risk that {{client_short}}'s financing is used to pay bribes."

---

#### 4 Business activities, products and decision processes (Verksamhet, produkter och beslutsprocesser)

##### 4.1 General information, relevant exposure and summary

[Which decision processes exist and their volumes, e.g. number of credit decisions per mandate level, share of broker-introduced business, number of onboarding approvals. Summary table.]

*Table 8: Inherent risk – business activities, products and decision processes*

| Risk factor ID | Risk factor | Linked typologies | Likelihood | Impact | Inherent risk |
|---|---|---|---|---|---|
| R-BUS-01 | [Credit and loan approval] | T-ABC-01, T-ABC-02 | | | |

##### 4.2 [Risk factor, e.g. Credit and loan approval]

###### 4.2.1 About [risk factor]
[Description and exposure figures.]

###### 4.2.2 Risk description and red flags
[Threats: how corruption could occur. Vulnerabilities: what makes it possible at {{client_short}}. Refer to typologies in chapter 3.]

###### 4.2.3 Risk assessment
[Rationale for likelihood and impact.] Conclude: "Based on a qualitative assessment of the above, [risk factor] represents a risk factor for {{client_short}} that is **[Very high/High/Normal/Low]** with regard to bribery and corruption."

[Repeat 4.x for each risk factor.]

---

#### 5 Business partners and third parties (Affärspartner och tredje parter)

##### 5.1 General information, relevant exposure and summary
[Number of suppliers and spend by category, intermediaries/brokers/agents and commission volumes, outsourcing providers, joint ventures. Summary table as in Table 8.]

##### 5.2 [Risk factor, e.g. Loan brokers and introducers]
###### 5.2.1 About
###### 5.2.2 Risk description and red flags
###### 5.2.3 Risk assessment

---

#### 6 Customers and counterparties (Kunder och motparter)

##### 6.1 General information, relevant exposure and summary
[Public-sector and state-owned customers, customers in high-corruption sectors, corporate lending to sectors such as construction, export or public procurement. PEP figures by reference to the AML BWRA.]

##### 6.2 [Risk factor]
###### 6.2.1 About
###### 6.2.2 Risk description and red flags
###### 6.2.3 Risk assessment

---

#### 7 Geography (Geografi)

##### 7.1 General information, relevant exposure and summary
[Countries of entities, operations, suppliers, intermediaries and customers. Country risk source and edition, e.g. CPI [year]; use the same country model as the AML BWRA where possible.]

*Table 9: Geographic exposure*

| Country / group | Type of exposure (entity / supplier / intermediary / customer) | Volume | Country risk | Comment |
|---|---|---|---|---|

##### 7.2 [Risk factor]
###### 7.2.1 About
###### 7.2.2 Risk description and red flags
###### 7.2.3 Risk assessment

---

#### 8 Internal organisation, people and culture (Intern organisation, personal och kultur)

##### 8.1 General information, relevant exposure and summary
[Contacts with public officials, gifts and hospitality, sponsorship and donations, recruitment, incentive schemes, delegated authority, decentralisation, conflicts of interest, insider and enabler risk.]

##### 8.2 [Risk factor, e.g. Gifts, hospitality and other benefits]
###### 8.2.1 About
###### 8.2.2 Risk description and red flags
###### 8.2.3 Risk assessment

---

#### 9 Controls (Kontroller)

[Opening paragraph, adapted from the team's BWRA template.]

Example: "The assessment of controls is divided into two parts: general controls and specific controls. The general controls show {{client_short}}'s overall ability to manage bribery and corruption risk: its anti-bribery management system. The specific controls show whether the measures in place detect or prevent the specific red flags identified for each typology. Section 10 combines both to determine residual risk."

##### 9.1 General controls (Generella kontroller)

Example: "Overall, the general controls are assessed as **[Adequate]**. The assessment has been made qualitatively in workshops with [functions], against a list of requirements for effectiveness (Appendix D)."

*Table 10: Summary of effectiveness of general controls*

| Subarea | Effectiveness assessment | Comment |
|---|---|---|
| Governance, tone at the top and organisation | Non-existing / Weak / Adequate / Strong | |
| Policy framework | | |
| ABC risk assessment and risk management | | |
| Awareness, training and communication | | |
| Personnel: recruitment, screening and incentives | | |
| Due diligence on business associates | | |
| Financial controls | | |
| Non-financial controls: procurement and decision processes | | |
| Gifts, hospitality, donations and sponsorship | | |
| Conflicts of interest and related parties | | |
| Raising concerns and investigations | | |
| Customer-side controls integrated with AML | | |
| Monitoring, internal audit and management review | | |
| **Overall assessment** | | |

###### 9.1.1 [Subarea]
[What is in place, evidence reviewed, strengths, weaknesses, rating. Repeat for each subarea.]

##### 9.2 Specific controls (Specifika kontroller)

*Table 11: Summary of specific controls*

| Typology / risk factor | Level of control |
|---|---|
| T-ABC-01 Bribe for credit approval | |

###### 9.2.x [Typology or risk factor]

*Table 12: Specific controls – [typology]*

| Red flag | Detective/preventive controls in place | Assessment of effectiveness |
|---|---|---|
| [Loan approved by the same person who handled the application, above normal mandate] | [Describe the control, e.g. four-eyes rule above [amount], system-enforced] | [Strong/Adequate/Weak/Non-existing] |
| [Broker with an unusually high approval rate or many early defaults] | | |

Example: "Most red flags are covered by preventive controls in the credit system. No control detects concentration of broker-introduced applications on individual credit officers. Overall, the specific controls for this typology are assessed as **[Weak]**."

---

#### 10 Residual risk and risk appetite (Kvarstående risk och riskaptit)

##### 10.1 Risk overview

*Table 13: Risk overview*

| Risk area | Risk factor | Risk factor ID | Typology IDs | Inherent risk | General controls | Specific controls | Combined controls assessment | Residual risk | Comment on residual risk assessment | Identified remedial actions |
|---|---|---|---|---|---|---|---|---|---|---|

##### 10.2 Residual risk per risk area
[Aggregated residual risk per area using the average method; list any Unacceptable items separately.]

##### 10.3 Comparison with risk appetite
[Which residual risks exceed appetite. If there is no appetite statement, say so and recommend one.]

##### 10.4 Root causes
[For each High or Very high residual risk: root cause (e.g. single-person mandates, missing supplier due diligence, incentive structure, weak speak-up culture) and how it is addressed.]

---

#### 11 Conclusions, recommendations and action plan (Slutsatser, rekommendationer och handlingsplan)

##### 11.1 Conclusions
[Three to five conclusions, consistent with the executive summary.]

##### 11.2 Action plan (Handlingsplan)

*Table 14: Action plan*

| ID | Risk ref. | Weakness | Recommendation | Priority / timing | Owner (role) | Status |
|---|---|---|---|---|---|---|
| A-01 | R-BUS-01 / T-ABC-01 | | | Immediate / within 3 months / within 6–12 months | | Not started |

[Priority follows residual risk: Very high → immediate; High → within about 3 months; Normal → within 6–12 months; Low → monitor.]

##### 11.3 Links to other processes
[What changes in the AML BWRA, customer risk rating, transaction monitoring, due diligence thresholds ("more than low"), training plan for risk-exposed roles and internal audit plan.]

---

#### Appendix A Risk register (Riskregister)

| Risk ID | Date registered / identified by | Risk category | Process | Risk owner | Risk description | Effect (most serious consequence) | Probability | Consequence | Risk value | Responsible person (role) | Proposed action | Estimated cost | Action completed by | Status | Residual risk | Residual likelihood and consequence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

#### Appendix B Scales and matrices
[Full scales if not in 2.2.]

#### Appendix C Workshops, interviews and documents reviewed
| Date | Format | Participants (roles) | Topics |
|---|---|---|---|

| Document | Version / date | Owner |
|---|---|---|

#### Appendix D General controls: requirements for effectiveness
| Subarea | Requirement for effectiveness | Y/N/PC | Comment and justification |
|---|---|---|---|

#### Appendix E Mapping to ISO 37001, UK MoJ principles and national law
| Report section | ISO 37001 clause | UK MoJ principle | National requirement ({{jurisdiction}}) |
|---|---|---|---|

[List all open markers ([DATA NEEDED], [TO CONFIRM], [ASSUMPTION], [VERIFY REFERENCE]) for the client before delivery, then remove them from the final version.]

## Shared risk language (guidance for wording and structure only)

This is the library's shared risk vocabulary: the labels, control scale, matrix, aggregation, exposure, likelihood and impact, appetite and the mapping between finding scales. Use it to name levels consistently, to explain ratings and to lay out the methodology section. It is not an instruction to compute anything: under the scoring boundary above, scores that ANTON, the module, the output format or the client's methodology supply are used as given. Where the text below says "use", "apply" or "may move", read it as a description of the team's method for a deliverable whose ratings are produced outside this conversation, or as a basis for a rating you propose and mark `[TO CONFIRM]`.

All risk assessments in the library use this engine so that AML/CTF, sanctions, ABC and fraud results can be read together and merged into one financial crime risk picture.

- **Area-specific additions.** An area blueprint may add things on top, such as the ABC and fraud likelihood × impact step or sanctions-specific exposure factors. It may not change the labels, the control scale, the matrix or the reduction rule.
- **Client methodology.** When a client has adopted its own methodology (an instruction with its own scales), use the client's version. Record each deviation from this file in the methodology section of the deliverable.

> **Status.** These defaults come from the team's current business-wide risk assessment (BWRA) workbook and method instruction, the most recent and most used material. Older team material and some client instructions differ: a one-level cap, residual never above inherent, or the label "Moderate". Those versions are kept as named variants in `aml-ctf-risk-assessment/references/scales-and-scoring.md`. The choice of default is still to be confirmed by the team.

#### 1. Risk levels (inherent and residual)

| Value | Label (en) | Label (sv) | Generic meaning |
|---|---|---|---|
| 1 | Low | Låg | Few or no identified threats and vulnerabilities, and/or very small exposure. |
| 2 | Normal | Normal | Identified threats and vulnerabilities with substantial exposure, but not significant for the overall risk exposure. |
| 3 | High | Hög | Increased risk that the entity is used or exposed through identified threats and vulnerabilities. |
| 4 | Very high | Mycket hög | Clear and major vulnerabilities, very strong incentives, or frequent occurrence. |
| – | Unacceptable | Oacceptabel | Outside risk appetite by law or policy, e.g. listed (sanctioned) persons, shell banks, anonymous accounts, or bribery of public officials. Never mitigated or averaged: the activity is refused or terminated. |

**Rules for labels**
- Use these four labels in every deliverable. "Moderate" and "Medium" are **not** used for risk levels.
- Customer risk classes in governing documents and models use the same words: Low / Normal / High (/ Very high).
- Area blueprints add area-specific descriptors per level, for example for products, customers or scenarios, but keep the labels.

#### 2. Control effectiveness

| Value | Label (en) | Label (sv) | Specific controls (per risk factor or scenario) | General controls (per subarea) |
|---|---|---|---|---|
| 1 | Strong | Stark | Controls fully address the inherent risk, and effectiveness is evidenced. | Strong framework and well-functioning processes |
| 2 | Adequate | Tillfredsställande | Controls address the risk adequately, with room to strengthen. | Framework works reasonably well, with several shortcomings |
| 3 | Weak | Svag | Controls exist but do not adequately address the risk. | Underdeveloped framework and/or ineffective processes |
| 4 | Non-existing | Obefintlig | No controls or mitigating measures identified. | Not covered by a framework and/or not in place in practice |

**Rules for rating controls**
- **Strong requires evidence of operating effectiveness**, such as tests, samples, KPIs or audit results. Controls assessed on design only are rated Adequate at most ("paper controls are not controls").
- **General controls requirement lists** are answered Y / N / PC (partly covered) / N/A, each with evidence.

**Combining general and specific controls**
1. The specific control level is the starting point and weighs heavily.
2. The general control level may move the combined level by **at most one grade**, up or down. Example: specific Strong + general Weak = combined Adequate.
3. A strong general level never lifts a Weak or Non-existing specific control.
4. General controls may be given more weight case by case when the general subarea is what actually mitigates the risk, e.g. customer risk rating for a customer risk factor. Document the reasoning.

#### 3. Residual risk matrix (default)

| Inherent \ Combined controls | Strong | Adequate | Weak | Non-existing |
|---|---|---|---|---|
| Unacceptable | Unacceptable | Unacceptable | Unacceptable | Unacceptable |
| Very high | Normal (only if motivated) | High | Very high | Very high |
| High | Normal | Normal | High | Very high |
| Normal | Low | Low | Normal | High |
| Low | Low | Low | Normal | Normal |

**Conservatism rules**
- **Maximum reduction.** Inherent risk is reduced by **at most two levels**. Very high to Normal requires a written motivation, typically strong evidenced controls combined with a hard product limitation.
- **Residual above inherent.** Weak or non-existing controls can raise residual risk above inherent risk, e.g. Low + Weak = Normal. This expresses that missing controls are a vulnerability in themselves.
- **Manual overrides.** Allowed only with documented reasoning, and listed in the residual risk section.

#### 4. Aggregation

**Risk areas** (products, customers, geography, channels, scenarios)
- Use the simple average of factor values, mapped back with these intervals:

  | Average | Level |
  |---|---|
  | 1.00–1.49 | Low |
  | 1.50–2.49 | Normal |
  | 2.50–3.49 | High |
  | 3.50–4.00 | Very high |

- A single Very high factor may raise the area rating, with a stated reason.
- Unacceptable items are reported separately and never averaged.
- Show the ML and TF results (and sanctions) separately before any combined view.

**Grades of a model or control area** (validations, reviews)
- Use the worst sub-result, never an average. A critical weakness must not be diluted.

#### 5. Exposure and priority

| Value | Exposure | Typical basis |
|---|---|---|
| 0 | None | No customers or volumes |
| 1 | Very limited | A handful of customers; negligible share of volume |
| 2 | Small | Small share of customers or volumes |
| 3 | Significant | Material share of customers or volumes |
| 4 | Very significant | Core business; large share of customers or volumes |

- Write the client's actual figures next to the rating, not just the label.
- Prioritise work by residual risk × exposure.

#### 6. Likelihood and impact (event-based risks: ABC, fraud, scenario-based sanctions)

Use this step when risk is best expressed as events, such as bribery or fraud scenarios. The resulting level is the **inherent** risk, which then enters the matrix in section 3.

| Value | Likelihood | Descriptor |
|---|---|---|
| 1 | Unlikely | Not observed at the client or its peers; no indications |
| 2 | Possible | Observed in the sector or region, or isolated indications at the client |
| 3 | Likely | Observed at the client in the last 12 months, or clear indications |
| 4 | Very likely | Recurring at the client (several times a year) or ongoing |

| Value | Impact | Descriptor (financial, regulatory, reputational, customer harm) |
|---|---|---|
| 1 | Limited | Minor loss; no regulatory or reputational consequence |
| 2 | Moderate | Noticeable loss or customer harm; possible supervisory remark |
| 3 | Serious | Material loss; supervisory action likely; media attention |
| 4 | Severe | Very large loss; sanctions or licence risk; lasting reputational damage |

| Likelihood \ Impact | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 4 | Normal | High | Very high | Very high |
| 3 | Normal | High | High | Very high |
| 2 | Low | Normal | High | High |
| 1 | Low | Low | Normal | Normal |

The ABC and fraud blueprints use this matrix and these descriptors unchanged.

#### 7. Appetite and KRIs

| Residual | Position against appetite | Required action |
|---|---|---|
| Low | Within appetite | Accept and monitor |
| Normal | Within appetite | Analyse; improve where efficient |
| High | Outside appetite unless a time-limited action plan is approved by management (e.g. ≤ 6 months for a newly identified risk) | Strengthened controls; action plan with owner and deadline |
| Very high | Outside appetite | Board decision: remediate, restrict or exit |
| Unacceptable | Never accepted | Refuse or terminate |

**KRIs.** Propose at least one KRI, with an early-warning level and an appetite limit, for every risk area with High or Very high residual risk, and for Normal residual risk with very significant exposure. Area blueprints may be stricter: sanctions requires a KRI for every residual risk above Low.

#### 8. Official mapping between finding scales

Each deliverable type keeps the scale its readers know. The table shows how they correspond, for consolidated reporting.

| House 4-level (default) | Gap analysis / review (5-level) | Model validation (traffic light) | Default timing |
|---|---|---|---|
| 4 Critical | Critical deficiency | Red – not approved | Immediate |
| 3 High | Extensive deficiency | Orange – significant improvements needed | ≈ 3 months (validation: per the validation blueprint) |
| 2 Medium | Significant deficiency | Yellow – improvements needed | 6–12 months |
| 1 Low | Minor deficiency | Green – no or insignificant improvements | Next regular cycle |
| – | No deficiencies | – | – |

The house finding scale describes the **severity of a finding**, not a risk level. That is why it keeps "Medium" while risk levels use "Normal".

#### 9. Colours

| Level | Colour |
|---|---|
| Low / Strong / Minor | Green |
| Normal / Adequate / Medium | Yellow |
| High / Weak / High | Orange |
| Very high / Non-existing / Critical | Red |
| Unacceptable | Black or dark red |

Always show the label as well as the colour.

## Placeholders

The blueprint text uses these placeholders. Fill each one from the request brief or the inputs. If a value is not known, write `[DATA NEEDED: …]` in the deliverable; never invent it, and never leave a `{{…}}` placeholder in a finished deliverable.

- `{{client_name}}` — the client's legal name (brief: client.legal_name)
- `{{client_short}}` — the defined term for the client, e.g. "the Company" (brief: client.defined_term)
- `{{date}}` — the deliverable date (brief: engagement.date)
- `{{firm_name}}` — the issuing firm (brief: issuing_firm.name)
- `{{jurisdiction}}` — the jurisdiction(s) (brief: engagement.jurisdictions)
- `{{language}}` — the output language (brief: engagement.output_language)
- `{{reporting_period}}` — the reporting period (brief: engagement.reporting_period)
- `{{supervisor}}` — the supervisor (brief: engagement.supervisor)
- `{{version}}` — the document version (brief: engagement.version)
