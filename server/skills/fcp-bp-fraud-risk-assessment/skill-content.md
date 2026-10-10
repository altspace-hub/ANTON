# FCP blueprint [DRAFT]: Fraud risk assessment

Blueprint `fraud-risk-assessment` v1.1 (draft – needs team input) from the FCP blueprint library, as ANTON skill `fcp-bp-fraud-risk-assessment`. Produces a business-wide fraud risk assessment for a financial institution: a report and a supporting workbook covering external fraud against customers and against the institution, internal fraud and infiltration, fraud typologies per product and channel, inherent risk, general and specific preventive and detective controls including detection rules and models, residual risk, quantified fraud exposure and a prioritised action plan. Runs on the same logic and scales as the AML/CTF business-wide risk assessment, so fraud can be integrated into one financial crime risk assessment. Anchored in COSO and ACFE fraud risk guidance and EU payment-fraud requirements, with the national layer plugged in through the jurisdiction placeholder. Use for a first or updated fraud risk assessment, a fraud module in an integrated assessment, or a data-driven current-state analysis (pilot) before scaling up fraud controls.

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
- `references/…` inlined below: `fraud-pilot.md`, `fraud-workbook-layout.md`.
- The other `references/…` catalogues (`fraud-controls.md`, `fraud-regulatory-map.md`, `fraud-risk-factors.md`, `fraud-typologies.md`, `fraud-workshop-and-data-request.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Draft status

This blueprint is a DRAFT – needs team input: it rests partly on analogy or general best practice. Tell the user so, and treat its section order, scales and calibrations as proposals until the team has validated them.

Validate before setting `status: stable`:

Items still to validate:
1. Default scope.
2. Risk areas.
3. Scales.
4. Likelihood × impact.
5. General-control subareas.
6. Typology catalogue.
7. Three-step pilot.
8. Restricted appendix.
9. References marked `[VERIFY REFERENCE]`.

## Method and quality bar (blueprint sections 1–14)

### 1. Purpose and outcome

The deliverable is a documented, business-wide assessment of how `{{client_short}}`, its customers and its products can be exploited for fraud, how well its preventive and detective controls work, what risk remains and what should be done first. It is built like the AML/CTF business-wide risk assessment, and the team argues for including AML, fraud and corruption in the same general risk assessment. **(team fraud material, AML analogy)**

The assessment covers four fraud categories:

| Code | Category | Example | Link |
|---|---|---|---|
| EXT-C | External fraud against customers | Social engineering (vishing, phishing, smishing), account takeover, investment and romance fraud, authorised push payments | Customer harm, liability for unauthorised transactions |
| EXT-I | External fraud against `{{client_short}}` | Credit application fraud with false documents or identities, card fraud, claims fraud, merchant fraud, invoice or CEO fraud against the firm | Credit and operational losses |
| INT | Internal fraud and infiltration | Abuse of trusted positions, collusion to circumvent controls, IT changes as backend manipulation, data theft, fake credit lines or cards | Cross-refer `abc-risk-assessment` for bribed insiders |
| PRC | Fraud proceeds through `{{client_short}}` | Money mules (målvakter, penningmulor), VAT carousel proceeds through corporate accounts | Predicate offence. Cross-refer `aml-ctf-risk-assessment`. |

The categories follow the operational risk taxonomy (internal fraud versus external fraud), so losses can be reconciled with the operational risk loss database.

**Readers:** the board and senior management; the head of fraud prevention or fraud operations; the CRO and operational risk function; compliance and the SAE; product owners; IT security; internal audit.

**Decisions it enables:**
- The fraud risk appetite or loss tolerance per product.
- Where to calibrate the scope of preventive and detective controls.
- Which detection scenarios and models to build, tune or validate.
- How to handle customer compensation liability.
- Which actions come first, and what feeds the AML BWRA (mules and proceeds), the operational risk framework, ICT security and training.

### 2. When to use / when not to use

**Use when:**
- A client needs a first or updated fraud risk assessment, standalone or as a fraud module in an integrated financial crime BWRA.
- A trigger occurs (team triggers): new or changed activities, products or services; changes to the structure or strategy of the organisation; or external changes in market conditions, liabilities or customer relationships.
- Rising fraud losses, a supervisory or audit finding, or a new payment rule (e.g. instant payments, verification of payee, liability changes).
- The client wants a fast, data-driven view first. Use the **pilot variant** (section 13).

**Do not use, use instead:**

| Situation | Use |
|---|---|
| Money laundering risk, including mules as an AML risk factor | `aml-ctf-risk-assessment` |
| Bribery and corruption, including bribed insiders as the main issue | `abc-risk-assessment` |
| Validation of a fraud detection model | `model-validation-report` |
| Documentation of a fraud detection model | `model-documentation` |
| Review of the fraud framework against requirements, without risk ratings | `gap-analysis` (requirement mapping) or `compliance-review-report` (evidence-based review) |
| Fraud policy or instruction | `governing-documents` |
| Fraud awareness training or social engineering awareness | `training-and-presentations` |
| Investigation of a specific fraud case | Out of scope. Escalate to the client's investigation function and police reporting. |

### 3. Inputs

**Minimum to start** (in addition to the request-context minimum):

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| Products, channels and customer segments, with volumes | Typologies are built per product and channel | Kick-off, annual report, product list | Ask. Do not rate without it. |
| Scope: fraud categories, entities, standalone, integrated or pilot | Determines structure | Brief, kick-off | `[ASSUMPTION: all four categories, standalone]` |
| Fraud loss and attempt data, at least 12 months, by product and type | Quantifies exposure and likelihood | Fraud operations, operational risk loss database | `[DATA NEEDED]`. Rate on qualitative evidence and mark it. |
| Latest AML BWRA and its scales | Consistency, mule and proceeds link | Compliance or SAE | Use the library default in `_core/risk-scales.md` (section 7) and mark `[TO CONFIRM]` |

**Needed for a complete deliverable** (full list in `references/fraud-workshop-and-data-request.md`):

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| Fraud detection setup: rules, models, real-time or batch, alert volumes, conversion, false positives, model documentation and validation | Specific controls and detection coverage | Fraud operations, model owner | `[DATA NEEDED]` |
| Authentication and payment safeguards (SCA, exemptions, payee verification, limits, holds) | Preventive controls | Payments, IT security | `[DATA NEEDED]` |
| Customer reimbursements, complaints and disputes about unauthorised transactions; chargebacks | Liability exposure | Customer service, legal, cards | `[DATA NEEDED]` |
| Regulatory fraud statistics reports (payment fraud reporting) | Comparable statistics | Compliance, reporting | Note if not applicable |
| Internal fraud incidents, whistleblowing statistics, access reviews, IT change incidents | Internal fraud and infiltration | HR, IT security, compliance | `[DATA NEEDED]` |
| Organisation, roles, policies and instructions for fraud | General controls | Compliance, fraud | A missing policy is a finding |
| Audit and second-line reports on fraud | Independent evidence | Internal audit, risk | Note the absence |
| Mule accounts identified and off-boarded; SARs linked to fraud | AML link | AML function | Cross-refer |

### 4. Regulatory and professional anchors

Full layered map: `references/fraud-regulatory-map.md`. In the report, state "Regulatory status as of `{{date}}`". Payment-fraud rules are changing, so always check the current version.

1. **EU baseline.**
   - Payment services: PSD2 (Directive (EU) 2015/2366) with the RTS on strong customer authentication (Delegated Regulation (EU) 2018/389), which requires transaction monitoring to detect unauthorised or fraudulent payments. PSD2 also covers operational and security risk management, the liability rules for unauthorised transactions, and payment-fraud statistics reporting under the EBA guidelines `[VERIFY REFERENCE]`.
   - Instant Payments Regulation (Regulation (EU) 2024/886): verification of payee, with phased dates per currency area `[VERIFY REFERENCE]`.
   - PSD3 and the Payment Services Regulation: fraud data sharing, extended IBAN/name checks and liability for impersonation fraud. Check adoption and application dates `[VERIFY REFERENCE]`.
   - DORA (Regulation (EU) 2022/2554) for ICT risk and incidents.
   - Directive (EU) 2019/713 on fraud and counterfeiting of non-cash means of payment.
   - AML package: fraud is a predicate offence (Directive (EU) 2018/1673); AMLR applies from 10 July 2027.
   - Directive (EU) 2019/1937 on whistleblowing.
2. **Professional frameworks.**
   - COSO/ACFE Fraud Risk Management Guide, with five principles: governance, risk assessment, preventive and detective control activities, investigation and corrective action, monitoring.
   - COSO Internal Control framework, principle 8 (consider the potential for fraud).
   - ACFE occupational fraud classification: asset misappropriation, corruption, financial statement fraud.
   - UK failure-to-prevent-fraud offence (Economic Crime and Corporate Transparency Act 2023, in force from September 2025), relevant for groups with a UK nexus.
   - Basel operational-risk event types (internal and external fraud).
3. **National layer through `{{jurisdiction}}`: Sweden.**
   - Penal Code (brottsbalken), Chapter 9 (bedrägeri) and Chapter 10 (förskingring, trolöshet mot huvudman) `[VERIFY REFERENCE for sections]`.
   - Betaltjänstlagen (2010:751), which transposes PSD2 and includes payer liability. Supreme Court case law on gross negligence in social engineering cases `[VERIFY REFERENCE]`.
   - FFFS 2014:1 on governance and operational risk; the AML act (2017:630) and FFFS 2017:11 for mules and proceeds; the whistleblowing act (2021:890).
   - Supervisor: Finansinspektionen. Intelligence sources: the police national fraud centre, Finanspolisen reports on fraud as a source of criminal proceeds, the Tax Agency on VAT fraud, and the crime prevention council's statistics.
4. **Register.** Fraud prevention is largely operational-risk and payment-law driven, so name the actual source of each requirement. Write "shall" only for law and binding regulation, "is expected" for guidelines and frameworks, and "we recommend" for judgement.

### 5. Method

The method follows the AML BWRA's nine-step logic, combined with the team's fraud approach: *contextual risk assessment of exposure and vulnerability*, *data-driven analysis plus dialogue with the business*, and *calibrating the scope of controls on the basis of risk mapping*.

**Fraud risk areas (risk factors are grouped under these).** Each factor is also tagged with fraud category EXT-C, EXT-I, INT or PRC.

| Code | Risk area | AML counterpart | What it covers |
|---|---|---|---|
| PRD | Products and services | Products and services | Instant and cross-border payments, accounts, cards, consumer credit, mortgages, savings and investments, acquiring, insurance claims, factoring and leasing |
| CUS | Customers | Customers | Customer groups as victims (e.g. elderly, digitally inexperienced), as perpetrators (first-party fraud) or as mules (e.g. young, new customers, new companies) |
| GEO | Geography | Geography | Cross-border payment corridors, beneficiary accounts and logins abroad, intra-EU trade (VAT carousels) |
| CHN | Distribution channels | Distribution channels | Digital onboarding with e-ID, remote channels, call centre, branches, brokers and agents, partners and embedded finance, open-banking access, merchants |
| INT | Internal organisation, processes and systems | Organisation | Access rights, IT change, segregation of duties, delegations, suspense accounts and general ledger, outsourcing, procurement and payables, incentives, staffing, insiders and infiltration |

Catalogue: `references/fraud-risk-factors.md`.

1. **Kick-off and scoping.** Agree on fraud categories, entities, format (standalone, integrated or pilot), loss definitions (gross, net, attempted, prevented), the alignment of scales with the AML owner, and data availability. Send the data request immediately; fraud data takes time to extract. **(AML analogy)**

2. **Contextual risk assessment: exposure and vulnerability.** This is the team's own framing. Assess exposure from the risk environment, market conditions, liabilities (including customer compensation liability) and customer relationships. Assess per product and service. Then assess the scope and coverage of the existing fraud management framework, how fraud is handled in the organisation's structure and strategy, and the ability to identify internal fraud and infiltration. Bring in external intelligence: police and fraud-centre reports, national risk assessments, sector threat assessments, EU payment-fraud reports, and trends such as AI-enabled fraud, real-time payment fraud and organised crime behind fraud. **(team fraud material)**

3. **Identify typologies.** For each product and channel, and for internal processes, describe how fraud would happen: modus operandi, victim, how funds leave, and red flags. Start from `references/fraud-typologies.md`. *Judgement:* there is no single fraudster playbook. Cover high-tech fraud (AI, account takeover, backend manipulation) and low-tech fraud (social engineering, forged documents, collusion). The individual is often the weakest link. **(team fraud material)**

4. **Data collection and data-driven analysis.** Quantify losses and attempts per typology and product, alert volumes and conversion, reimbursements and chargebacks. Where data allows, analyse behaviour to find deviating patterns, risk indicators and concrete case candidates, and to estimate the size of the problem and where to prioritise. *Judgement:* loss data understates risk because attempted, undetected and misclassified fraud (e.g. booked as credit loss) is missing. Treat recorded losses as a floor. **(team fraud material, AML analogy)**

5. **Workshops with the business.** Hold workshops with fraud operations, product owners (payments, cards, credit, savings, claims), customer service, IT security, HR, finance and procurement, and the AML function. Confirm typologies, describe controls, identify vulnerabilities and discuss the analysis results. Run the work iteratively, with regular check-ins with the client. *Format:* 2–4 workshops of about 2 hours `[ASSUMPTION: adjust to size]`. Question bank: `references/fraud-workshop-and-data-request.md`. **(team fraud material)**

6. **Assess inherent risk.** For each risk factor and typology, document threats, vulnerabilities, references, exposure data, likelihood and impact, and the inherent level with its rationale (section 7). Show interactions, for example instant payments combined with digital onboarding and young customers increase mule and APP-fraud risk. **(AML analogy)**

7. **Assess controls: general and specific.**
   - *General controls* are the fraud risk management framework: governance, policies, risk assessment, awareness, recruitment and insider protection, access and change management, operations and the control environment, customer knowledge, detection, investigation, compensation, whistleblowing, third parties and performance review. Assess each subarea with Y/N/PC requirements (`references/fraud-controls.md`, Part A).
   - *Specific controls* are assessed per typology and red flag. For detective controls, map each typology to the detection rules or models that should catch it, so that gaps in coverage show. Assess design and, where in scope, operating effectiveness. Effectiveness covers detection performance, the balance between sensitivity and customer friction, and whether detection is fast enough to delay or stop a real-time payment.
   - **(AML analogy, team fraud material)**

8. **Residual risk, quantified exposure and risk appetite.** Apply the residual matrix in `_core/risk-scales.md` §3 and aggregate per risk area. Add a quantified view per typology: current losses, estimated potential, and expected effect of actions. Compare with the client's fraud risk appetite or loss tolerance; if there is none, recommend one. **(AML analogy, team fraud material)**

9. **Consultation, adoption and action plan.** Run a consultation round and present the result for adoption. The action plan covers four things: calibrating the scope of preventive and detective controls to the risk mapping; criteria for individual processes and validation of models; automating detection and reporting; and the investigation process and customer compensation process. Link each action to a risk ID. Propose the AML rule: action plan within two months, quarterly status reporting. **(team fraud material, AML analogy)**

10. **Monitoring and update.** Update annually and on the team's triggers: new or changed products, changes in structure or strategy, and external changes. Track KPIs and KRIs (`references/fraud-controls.md`, Part D) and feed investigation results back into detection rules and the next assessment. **(team fraud material, fraud best practice)**

### 6. Deliverable structure

The report follows the team's typology-based BWRA report order, with fraud content (skeleton: `template.md`). In an integrated BWRA, sections 3–8 become one fraud chapter and sections 9–10 merge with the AML chapters.

| Section | Purpose and content | Length | Style |
|---|---|---|---|
| Decision and change log | Version, decided by, date, owner, changes | Table | Factual |
| Executive summary | Overall residual fraud risk, heat map, quantified exposure (losses and attempts, trend), 3–5 key messages, priority actions, decisions required (adoption, appetite, investments) | 1–2 pages | Lead with the conclusion |
| 1 Introduction | Background and purpose; roles and responsibilities; scope, fraud categories and definitions | 2–3 pages | Defined terms |
| 2 Methodology | Method; criteria for the risk assessment (scales); sources of information; sources of data, loss definitions and limitations; review and updates | 3–4 pages | Explain why |
| 3 Fraud typologies and threats | Context and trends; typologies by category (EXT-C, EXT-I, INT, PRC), each with modus operandi and red flags | 5–10 pages | Concrete scenarios |
| 4–8 Inherent risk per risk area | Products and services; Customers; Geography; Distribution channels; Internal organisation, processes and systems. Each has "General information, relevant exposure and summary", then per factor: About…, Risk description and red flags, Risk assessment. | 2–5 pages each | Numbers over adjectives |
| 9 Controls | 9.1 General controls (summary per subarea and assessment); 9.2 Specific controls (per typology: Red flag / Detective or preventive controls in place / Assessment of effectiveness); 9.3 Detection coverage (typologies mapped to rules and models) | 6–12 pages | Balanced |
| 10 Residual risk, fraud exposure and risk appetite | Risk overview, aggregation, quantified exposure and potential, comparison with appetite | 2–4 pages | Decision-ready |
| 11 Conclusions, recommendations and action plan | Prioritised actions with owner and timing. Links to AML, operational risk, ICT, model validation and training. | 2–3 pages | Actionable |
| Appendices | A Risk register; B Scales; C Workshops and documents (roles only); D General controls checklist; E Detection coverage matrix **(restricted distribution)**; F Regulatory mapping | As needed | Tables |

### 7. Scales, scoring and calculations

Fraud uses the shared risk engine in `_core/risk-scales.md` without changes: the risk labels (§1), the control scale and the rule for combining general and specific controls (§2), the residual risk matrix with its conservatism rules (§3), aggregation (§4), the likelihood × impact step (§6), appetite and KRIs (§7) and colours (§9). Never mix scales in one deliverable. If the client has adopted its own methodology, use the client's version and record each deviation from `_core/risk-scales.md` in the methodology section of the report. The library default is still to be confirmed by the team (see the validation list at the top). **(AML analogy)**

**Inherent risk.** Labels: Low / Normal / High / Very high, plus Unacceptable (Swedish: Låg / Normal / Hög / Mycket hög / Oacceptabel). "Moderate" and "Medium" are not used as risk levels. Fraud-specific descriptors:

| Level | Definition |
|---|---|
| Unacceptable | Outside risk appetite regardless of controls, e.g. a product feature or partner that cannot be controlled. Stop or redesign. |
| Very high | Clear and major vulnerabilities through which `{{client_short}}` or its customers can be defrauded, with high and observed exposure |
| High | Identified threats and vulnerabilities increase the risk of fraud through the risk factor |
| Normal | Threats and vulnerabilities are identified, but overall they are not significant for the exposure |
| Low | Few or no identified threats or vulnerabilities |

**Likelihood and impact.** Rate likelihood (1–4) and impact (1–4) with the descriptors and the matrix in `_core/risk-scales.md` §6, which are the same as in `abc-risk-assessment` and are not repeated here. The resulting level is the inherent risk. The rating is a reasoned judgement supported by the matrix. Document any override. Fraud-specific additions (they guide how evidence is read and do not change the descriptors or the matrix):

- **Likelihood evidence.** Use loss and attempt data where available. Fraud cases or attempts recorded for the typology in the last 12 months count as "observed at the client" in the §6 descriptors. Recorded losses are a floor, because attempted, undetected and misclassified fraud is missing.
- **Impact anchors.** Set the financial thresholds for the §6 impact levels with the client, as gross loss per year in the client's currency tied to its materiality thresholds, and record them as `[DATA NEEDED: materiality thresholds]`. The anchors are thresholds `[threshold 1]` < `[threshold 2]` < `[threshold 3]` between impact levels 1–2, 2–3 and 3–4 (for example, level 4 is a material share of operating profit). Customer harm, supervisory action and reputational effect are read against the same §6 levels.

**Control effectiveness.** Strong / Adequate / Weak / Non-existing (Stark / Tillfredsställande / Svag / Obefintlig), as defined in `_core/risk-scales.md` §2. Strong requires evidence of operating effectiveness; controls assessed on design only are rated Adequate at most. General-control subareas use the same four levels, from Y/N/PC requirements. Fraud-specific additions: a No on a critical requirement caps the subarea at Weak. For detective controls, weigh in coverage (is there a rule or model for the typology?), performance (detection rate, alert-to-case conversion, false positives) and timeliness (can a real-time payment be stopped?).

**Combined controls.** Apply the rule in `_core/risk-scales.md` §2, as in the ABC blueprint. The specific rating is the starting point. General controls may move the combined rating by at most one grade, up or down, and a strong general level never lifts a Weak or Non-existing specific control. Document the reasoning.

**Residual risk.** Apply the matrix in `_core/risk-scales.md` §3, including its Unacceptable row. The conservatism rules apply as written there: inherent risk is reduced by at most two levels (Very high to Normal only with a written motivation), weak or non-existing controls can raise residual risk above inherent risk (Low + Weak = Normal), and manual overrides need documented reasoning. The report's scale appendix shows the matrix as a copy of §3.

**Required measure and priority** (position against appetite per `_core/risk-scales.md` §7):
- **Very high:** outside appetite; board decision to remediate, restrict or exit. Extensive improvements, immediate, with board attention.
- **High:** outside appetite unless a time-limited action plan is approved by management. Strengthened controls within about 3 months.
- **Normal:** within appetite. Analyse and improve within 6–12 months.
- **Low:** within appetite. Accept and monitor.

**Aggregation:** as in `_core/risk-scales.md` §4. Very high = 4, High = 3, Normal = 2, Low = 1; average per risk area, mapped back with the intervals in §4. Unacceptable items are reported separately and never averaged.

**Quantified exposure (supplementary, not a rating):**
- *Gross fraud loss*: the loss before recoveries.
- *Net fraud loss*: gross loss after recoveries and insurance.
- *Attempted fraud*: completed plus prevented.
- *Prevention rate*: prevented ÷ attempted.
- *Customer losses*: losses borne by customers. Also show reimbursements made by `{{client_short}}`.

**Colours:** as in `_core/risk-scales.md` §9. Always show the label.

### 8. Supporting artefacts

- **Fraud risk assessment workbook:** the same sheet order as the ABC/AML workbooks, plus a *Fraud data* sheet (losses and attempts by typology and product) and a *Detection coverage* sheet (typology → rule or model → performance). See `references/fraud-workbook-layout.md`.
- **Data request and workshop plan:** `references/fraud-workshop-and-data-request.md`.
- **Action plan and risk register:** linked to risk IDs, in the house finding format.
- **Restricted appendix** with detection logic and control gaps. Its distribution is limited to named roles.
- **Pilot deliverables (variant):** current-state analysis, control model and scale-up decision basis. See `references/fraud-pilot.md`.

### 9. Writing rules specific to this deliverable

- **Name the scenario and the money path.** Weak: "Payment fraud risk is high." Good: "Customers aged 70+ are called by fraudsters posing as bank staff and persuaded to approve instant payments to newly added payees. [n] cases in 12 months, [amount] gross loss. The funds leave within minutes to mule accounts at other banks."
- **Be precise about fraud types.** Distinguish unauthorised transactions from authorised push payments, and first-party from third-party fraud, because liability and controls differ. Use the jurisdiction's terms. For Sweden: bedrägeri, bedrägeriförsök, obehörig transaktion, social manipulation, kontoövertagande, ID-kapning, falska individuppgifter, lånebedrägeri, fakturabedrägeri, VD-bedrägeri, investeringsbedrägeri, romansbedrägeri, annonsbedrägeri, momskarusell, målvakt/penningmula, internbedrägeri.
- **Define loss figures once** (gross, net, attempted, prevented, customer-borne) and use them consistently. State the period and source.
- **Protect detection logic.** Thresholds, rule parameters and specific gaps go in the restricted appendix, not in the board report or widely distributed versions.
- **Respect customers.** Describe vulnerable customer groups factually, never as careless. Victims are not perpetrators. Mules can be victims or complicit; say which you mean.
- **No names.** Report internal fraud incidents in aggregate. If material reveals ongoing internal fraud, stop and advise escalation.
- **Rating sentence** (as in the AML template): "Based on a qualitative assessment of the above, [risk factor] represents a risk factor for `{{client_short}}` that is [Very high/High/Normal/Low] with regard to fraud."
- **External statistics.** Cite the source and year, and never reuse figures from sales material without checking the primary source.

### 10. Quality checklist

- [ ] All four fraud categories are covered, or an exclusion is explained.
- [ ] Every product and channel in scope has been considered for typologies, including internal fraud and infiltration.
- [ ] Each typology has a modus operandi, red flags, likelihood and impact rationale, and linked controls.
- [ ] Loss data is defined, sourced and dated, and its limitations are stated (attempted, undetected, misclassified).
- [ ] Every relevant typology has a detection rule or model, or the gap is stated.
- [ ] Detection performance and customer friction are considered, not only whether a control exists.
- [ ] Inherent risk, controls and residual risk are kept apart, and each rating has a workbook ID.
- [ ] The scales are those of `_core/risk-scales.md` and identical to the AML BWRA, or the deviation is explained.
- [ ] Residual risk is compared with appetite or loss tolerance.
- [ ] The action plan covers control scope, model criteria and validation, automation, investigation and customer compensation, as relevant.
- [ ] Links to AML (mules, proceeds), ABC (bribed insiders), operational risk and ICT are stated.
- [ ] Detection logic is in the restricted appendix only.
- [ ] No names; incidents are aggregated. The house-standard checklist is done.

### 11. What makes it stand out

- **Integrated with AML.** It uses the same engine and scales and covers mules and proceeds. Customer data and customer risk assessment are used to delay or intercept fraudulent payments, which links KYC and transaction monitoring to fraud prevention.
- **Internal fraud, infiltration and corruption are in scope.** Generic assessments stop at external payment fraud. This one covers abuse of trusted positions, collusion, backend IT manipulation and insiders placed by organised crime.
- **Contextual and trigger-based.** Exposure and vulnerability are assessed from the risk environment, liabilities and customer relationships, and updated when products, structure or the market change.
- **Data-driven with case candidates.** The assessment quantifies how big the problem is and where to prioritise, and can produce concrete cases, not only ratings.
- **Typology-to-detection mapping.** Every typology is traced to the rule or model that should catch it, which connects the assessment to model development and validation.
- **The human factor.** Social engineering, awareness and testing of staff and customers are treated as a control area, alongside technology.

### 12. Common pitfalls

- Treating fraud only as an operational loss figure: risk is rated from booked losses alone, and attempted and undetected fraud is missed.
- Covering external payment fraud only, without internal fraud, insiders or IT change.
- Applying rule-based compliance instead of information-based and fact-based response. Rules exist, but nobody measures whether they catch the typologies.
- Fraud and AML teams working in silos, so mule accounts are detected late or twice.
- Setting detection too tight, causing customer friction, or too loose, missing fraud, without a stated balance.
- Detection models that are not documented, tuned or validated.
- No feedback from investigations and complaints to detection rules.
- Unclear ownership between fraud operations, operational risk and compliance.
- Control gaps and thresholds published in widely distributed documents.
- Statistics copied from secondary sources without year or source.

### 13. Variants

**By client type**

| Client type | Emphasis |
|---|---|
| Bank | APP and social engineering, account takeover, instant and cross-border payments, cards, mortgage and consumer credit application fraud, mules, internal fraud by personal bankers and advisers, VAT-carousel proceeds in corporate accounts |
| Payment or e-money institution | Merchant fraud and transaction laundering, chargeback levels, account takeover of wallets, agents, instant payments and verification of payee, PSD2 fraud reporting |
| Insurance | Claims fraud (staged, inflated, fictitious) as a major leakage item, provider fraud, collusion by claims handlers, application misrepresentation. Efficiency gains from automation and fewer unnecessary investigations. |
| Fund manager or investment firm | Account takeover and unauthorised redemptions, impersonation of the firm (clone firms), investment fraud using the firm's name, internal misappropriation of client assets |
| Consumer credit | Application fraud with false identity or false individual data (falska individuppgifter), synthetic identities, broker fraud, bust-out, identity theft complaints |
| Non-financial or corporate | Invoice and CEO fraud, payables and vendor master data, payroll and expenses, procurement fraud |

**By size and maturity.** For small or low-maturity clients, run one workshop, use a qualitative likelihood with a few data points, and focus on governance, ownership, the basic detection rules and the reporting process. For large or high-maturity clients, assess per business line, run full quantitative analysis, map detection coverage and include model-performance KPIs.

**By format**
- Standalone report.
- Fraud chapter in an integrated financial crime BWRA.
- **Pilot: a focused and scalable approach in three steps (team method).**
  1. Current-state analysis of a selected area: deviating behaviours, risk indicators, case candidates and quantification of potential.
  2. Control model: calibrate the control scope, set criteria for processes and model validation, automate detection and reporting, and design the investigation process.
  3. Scale up: mobilise the implementation programme.

  The pilot's output is a decision basis: should this be scaled up, and what should the future way of working look like? Details: `references/fraud-pilot.md`.

### 14. How the assistant should work

1. **Read the brief** (`_core/request-context.md`). Ask at most five questions, for example on: products and channels in scope; format (standalone, integrated or pilot); fraud loss and attempt data available; current detection setup; the AML BWRA's scales.
2. **Confirm the scope, fraud categories, loss definitions and scales** in one message before drafting. Apply the library default in `_core/risk-scales.md`; if the client has its own methodology, use it and record each deviation.
3. **Produce in this order:**
   1. Typology long-list, data request and workshop plan.
   2. Workbook skeleton with risk factors and typologies.
   3. Data analysis and inherent ratings.
   4. General and specific control assessment, with the detection coverage matrix.
   5. Residual risk, quantified exposure and action plan.
   6. The report, with the executive summary last.
4. **Select from `references/` and adapt.** Do not paste whole catalogues.
5. **Mark gaps** with `[DATA NEEDED: …]`, `[TO CONFIRM: …]` or `[ASSUMPTION: …]`, and list all of them at the end.
6. **Stop and ask** when the material indicates ongoing internal fraud, when High or Very high ratings would rest only on assumptions, or when the client wants detection details in a widely distributed document.
7. **Writing in the client's name:** use the client's voice, and keep any firm references out of the body.
8. **Outputs:** follow `_core/output-formats.md`. In text-only tools, use Markdown tables and mark `[Figure: heat map]`.

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: Fraud risk assessment

<!-- Skeleton of the main deliverable. Write in {{language}}. Swedish terms in parentheses are for output in Swedish. Delete all [bracketed guidance] before delivery. Every rating refers to a row ID in the workbook. Detection thresholds and rule logic belong only in the restricted Appendix E. -->

[Cover page]

**{{client_name}}**
**Fraud risk assessment {{reporting_period}}** (Allmän riskbedömning avseende bedrägerier)
Document type: Risk assessment | Version {{version}} | {{date}} | Confidentiality: [Confidential] (Appendix E: [Strictly confidential, restricted distribution])
Prepared by: [{{firm_name}} for {{client_short}}, or {{client_short}} when the client adopts the document as its own]

---

#### Decision and Change Log (Beslut- och ändringslogg)

| Version | Decided by | Date | Document owner | Changes |
|---|---|---|---|---|
| {{version}} | [Board / CEO] | {{date}} | [Role, e.g. Head of Fraud Prevention] | [First version / annual update / event-driven update: reason] |

---

#### Executive summary (Sammanfattning)

[One to two pages, conclusion first. Cover the overall residual fraud risk, the heat map, quantified exposure and trend, three to five key messages, priority actions and decisions required (adoption, risk appetite or loss tolerance, investments).]

Example: "Overall, {{client_short}}'s residual fraud risk is assessed as **[High]**. The main driver is social engineering against private customers using instant payments, where gross losses rose to [amount] in [period] and [share] were borne by customers. Detection covers [n] of [m] relevant typologies but cannot stop payments in real time. Internal fraud risk is **[Normal]**: access to change customer payment details is not reviewed. We recommend three immediate actions: […]."

*Table 1: Inherent and residual fraud risk per risk area*

| Risk area | Inherent risk | Combined controls | Residual risk | Trend |
|---|---|---|---|---|
| Products and services | | | | ↑ / → / ↓ / new |
| Customers | | | | |
| Geography | | | | |
| Distribution channels | | | | |
| Internal organisation, processes and systems | | | | |
| **Overall** | | | | |

*Table 2: Fraud exposure in figures ({{reporting_period}})*

| Fraud category | Attempted (no. / amount) | Prevented | Gross loss | Net loss | Of which borne by customers | Trend |
|---|---|---|---|---|---|---|
| External fraud against customers (EXT-C) | | | | | | |
| External fraud against {{client_short}} (EXT-I) | | | | | | |
| Internal fraud and infiltration (INT) | | | | | | |
| Fraud proceeds through {{client_short}} (PRC) | [mule accounts identified/offboarded] | | | | | |

[Figure: heat map of residual risk per risk area and category]

**Key messages** 1. […] 2. […] 3. […]

**Priority actions and decisions required**

| ID | Action | Owner | Timing |
|---|---|---|---|
| A-01 | | | Immediate |

---

[Table of contents]

---

#### 1 Introduction (Inledning)

##### 1.1 Background and purpose (Bakgrund och syfte)

[Who {{client_short}} is (generic). Why the assessment is made: payment-law and governance requirements, operational risk management, customer protection, AML link, triggers. State "Regulatory status as of {{date}}."]

Example: "The purpose of this assessment is to identify how {{client_short}}, its customers and its products can be exploited for fraud, to assess the effectiveness of preventive and detective controls, and to determine residual risk and the measures needed. The assessment covers external fraud against customers and against {{client_short}}, internal fraud and infiltration, and the risk that fraud proceeds are moved through {{client_short}}."

##### 1.2 Roles and responsibilities (Roller och ansvar)

| Role | Responsibility in the assessment |
|---|---|
| Board of Directors | Receives results, sets fraud risk appetite or loss tolerance, adopts [or notes] the assessment |
| CEO | [Adopts]; ensures resources and implementation |
| Head of Fraud Prevention / fraud function | Owns the method and process, carries out the assessment |
| Risk control / operational risk | Consulted; aligns with the operational risk framework and loss data |
| SAE / AML function | Consulted on mules, proceeds and links to the AML BWRA |
| Product owners, customer service, IT security, HR, finance, procurement | Contribute knowledge of typologies, controls and data |
| Internal audit | Independent review |

##### 1.3 Scope, fraud categories and definitions (Omfattning, bedrägerikategorier och definitioner)

[Entities, products, channels and period. Fraud categories in scope (EXT-C, EXT-I, INT, PRC). Exclusions and why.]

*Table 3: Definitions*

| Term | Definition used in this assessment |
|---|---|
| Fraud (bedrägeri) | [Align with the law of {{jurisdiction}} and the operational risk taxonomy] |
| Unauthorised transaction (obehörig transaktion) | |
| Authorised push payment fraud | [Customer is manipulated into authorising a payment] |
| First-party / third-party fraud | |
| Internal fraud (internbedrägeri) | [Fraud involving at least one employee or contractor] |
| Money mule (målvakt / penningmula) | |
| Gross loss, net loss, attempted fraud, prevented fraud | [Define once, use consistently] |

---

#### 2 Methodology (Metod)

##### 2.1 Method

Example: "The assessment is typology-based and starts from a contextual analysis of {{client_short}}'s exposure and vulnerability: its risk environment, market conditions, liabilities and customer relationships, and the coverage of the existing fraud management framework. Fraud typologies were identified per product, channel and internal process. Inherent risk was assessed per risk factor in five risk areas, combining data on losses and attempts with workshops with the business. Controls were assessed in two parts: general controls (the fraud risk management framework) and specific controls (measures addressing each typology's red flags, including detection coverage). Inherent risk and controls combined give residual risk, which is compared with {{client_short}}'s risk appetite."

##### 2.2 Criteria for the risk assessment (Kriterier för riskbedömningen)

[Insert the scales from `_core/risk-scales.md` (blueprint section 7), or the client's own methodology with each deviation stated: inherent risk, likelihood and impact (§6, with the client's financial thresholds as impact anchors), control effectiveness and the combination rule (§2), residual matrix (§3), required measure, aggregation (§4). State the conservative rules: inherent risk is reduced by at most two levels, and weak or non-existing controls can raise residual risk above inherent risk.]

##### 2.3 Sources of information (Informationskällor)

[External intelligence (police and fraud-centre reports, national risk assessment, sector threat assessments, EU payment-fraud reports) and internal sources (fraud cases, complaints, investigations, audit). Workshops held, by role. Full list in Appendix C.]

##### 2.4 Sources of data and limitations (Datakällor och begränsningar)

*Table 4: Data used*

| Data | Source system / owner | Period / reference date | Limitations |
|---|---|---|---|
| Fraud cases and losses by type and product | [Case management / op-risk loss database] | | [e.g. attempted fraud not recorded before [date]] |
| Detection alerts and outcomes | [Fraud detection system] | | |
| Reimbursements, complaints, chargebacks | | | |
| Regulatory fraud statistics | | | |

Example: "Recorded losses are a floor. Attempted fraud that was not detected, and fraud booked as credit losses, are not included."

##### 2.5 Review and updates (Översyn och uppdatering)

Example: "The assessment is reviewed at least annually and updated before new or significantly changed products, services or channels are launched, after changes to {{client_short}}'s structure or strategy, and after significant external changes such as new fraud trends, liability rules or market conditions."

---

#### 3 Fraud typologies and threats (Bedrägerityper och hot)

##### 3.1 Context and trends (Omvärld och trender)
[Fraud trends relevant to {{client_short}}: e.g. social engineering, real-time payment fraud, AI-enabled fraud, organised crime and crime-as-a-service, insiders and infiltration. Cite source and year.]

##### 3.2 External fraud against customers (EXT-C)
##### 3.3 External fraud against {{client_short}} (EXT-I)
##### 3.4 Internal fraud and infiltration (INT)
##### 3.5 Fraud proceeds and money mules (PRC)
[Cross-refer to the AML BWRA; do not duplicate.]

[For each relevant typology:]

###### 3.x.y [Typology name] (T-FRD-xx)
**Modus operandi:** [How it works at {{client_short}}, including the money path]
**Red flags:** [3–6 indicators]
**Products / channels:** […]
**Observed at {{client_short}}:** [cases, attempts, losses, period, or "not observed"]

---

#### 4 Products and services (Produkter och tjänster)

##### 4.1 General information, relevant exposure and summary

*Table 5: Inherent fraud risk – products and services*

| Risk factor ID | Product / service | Fraud categories | Linked typologies | Exposure (volume, losses) | Likelihood | Impact | Inherent risk |
|---|---|---|---|---|---|---|---|
| R-PRD-01 | [Instant payments] | EXT-C, PRC | T-FRD-01, 02, 05, 24 | | | | |

##### 4.2 [Product, e.g. Instant payments]
###### 4.2.1 About [product]
###### 4.2.2 Risk description and red flags
###### 4.2.3 Risk assessment
Conclude: "Based on a qualitative assessment of the above, [risk factor] represents a risk factor for {{client_short}} that is **[Very high/High/Normal/Low]** with regard to fraud."

---

#### 5 Customers (Kunder)
##### 5.1 General information, relevant exposure and summary
[Customer groups as victims, as first-party fraudsters and as mules. Use age bands, tenure and segment, never individual data.]
##### 5.2 [Risk factor]
###### 5.2.1 About
###### 5.2.2 Risk description and red flags
###### 5.2.3 Risk assessment

---

#### 6 Geography (Geografi)
##### 6.1 General information, relevant exposure and summary
[Payment corridors, beneficiary countries, logins or devices abroad, intra-EU trade.]
##### 6.2 [Risk factor]

---

#### 7 Distribution channels (Distributionskanaler)
##### 7.1 General information, relevant exposure and summary
[Digital onboarding, remote channels, call centre, branches, brokers and agents, partners, open-banking access, merchants.]
##### 7.2 [Risk factor]

---

#### 8 Internal organisation, processes and systems (Intern organisation, processer och system)
##### 8.1 General information, relevant exposure and summary
[Access management, IT change, segregation of duties, delegations, suspense accounts and general ledger, payables, outsourcing, incentives, staffing, insiders and infiltration.]
##### 8.2 [Risk factor, e.g. Privileged access and IT change]

---

#### 9 Controls (Kontroller)

Example: "The assessment of controls is divided into general controls (the fraud risk management framework) and specific controls (preventive and detective measures for each typology). Section 9.3 shows how far the detection rules and models cover the identified typologies. Section 10 combines these assessments with inherent risk to determine residual risk."

##### 9.1 General controls (Generella kontroller)

*Table 6: Summary of effectiveness of general controls*

| Subarea | Effectiveness assessment | Comment |
|---|---|---|
| Governance, tone at the top and organisation | Non-existing / Weak / Adequate / Strong | |
| Policies, instructions and guidelines | | |
| Fraud risk assessment and new product approval | | |
| Awareness and competence (staff and customers) | | |
| Recruitment, screening and insider protection | | |
| Access management and IT change control | | |
| Operations and control environment (incl. first-line QA) | | |
| Customer knowledge used for fraud prevention | | |
| Authentication and payment safeguards | | |
| Fraud detection and monitoring | | |
| Investigation, case management and reporting | | |
| Customer compensation and complaints | | |
| Whistleblowing with case management | | |
| Third parties and outsourcing | | |
| Monitoring, KPIs and performance review | | |
| **Overall assessment** | | |

###### 9.1.x [Subarea]
[What is in place, evidence, strengths, weaknesses, rating.]

##### 9.2 Specific controls (Specifika kontroller)

*Table 7: Specific controls – [typology]*

| Red flag | Detective/preventive controls in place | Assessment of effectiveness |
|---|---|---|
| [New payee added and high-value instant payment within minutes] | [e.g. real-time scoring, delay for new payees above [limit], call-back] | |

##### 9.3 Detection coverage (Täckning i detektionen)

[Summary only in the main report. Rule names, thresholds and parameters go in Appendix E.]

*Table 8: Detection coverage summary*

| Typology | Covered by rule/model (yes / partly / no) | Real-time capable | Performance (detection rate / conversion) | Assessment |
|---|---|---|---|---|

---

#### 10 Residual risk, fraud exposure and risk appetite (Kvarstående risk, exponering och riskaptit)

##### 10.1 Risk overview

*Table 9: Risk overview*

| Risk area | Risk factor | Risk factor ID | Typology IDs | Fraud category | Inherent risk | General controls | Specific controls | Combined controls assessment | Residual risk | Comment on residual risk assessment | Identified remedial actions |
|---|---|---|---|---|---|---|---|---|---|---|---|

##### 10.2 Residual risk per risk area
##### 10.3 Quantified exposure and potential
[Current losses per typology, estimated potential, expected effect of the proposed actions: how big is the problem, and where should {{client_short}} prioritise?]
##### 10.4 Comparison with risk appetite or loss tolerance

---

#### 11 Conclusions, recommendations and action plan (Slutsatser, rekommendationer och handlingsplan)

##### 11.1 Conclusions
##### 11.2 Action plan (Handlingsplan)

*Table 10: Action plan*

| ID | Risk ref. | Weakness | Recommendation | Priority / timing | Owner (role) | Status |
|---|---|---|---|---|---|---|
| A-01 | | | [e.g. calibrate control scope; criteria for model validation; automate detection and reporting; investigation process; customer compensation process] | Immediate / within 3 months / within 6–12 months | | |

##### 11.3 Links to other processes
[AML BWRA (mules, proceeds), ABC (bribed insiders), operational risk (loss data, KRIs), ICT security, model validation, training.]

---

#### Appendix A Risk register
#### Appendix B Scales and matrices
#### Appendix C Workshops, interviews and documents reviewed (roles only)
#### Appendix D General controls: requirements for effectiveness (Y/N/PC)
#### Appendix E Detection coverage matrix (restricted distribution)

| Typology | Rule / model ID | Logic summary | Threshold / parameters | Alerts (12 m) | True positives | Conversion | Gaps |
|---|---|---|---|---|---|---|---|

#### Appendix F Regulatory mapping
| Requirement | Source (EU / national) | Where addressed in this assessment |
|---|---|---|

[List all open markers ([DATA NEEDED], [TO CONFIRM], [ASSUMPTION], [VERIFY REFERENCE]) for the client before delivery.]

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

## Reference catalogues (inlined)

### Reference catalogue: fraud-pilot.md

This variant is the team's own approach, taken from its fraud pitch. It has not yet been documented as a delivered engagement, so the team needs to validate the phases, outputs and duration. Use it when the client wants a quick, data-driven answer before committing to a full fraud risk assessment or a fraud programme. Its output feeds the full assessment: typologies, data, case candidates and a first view of controls.

##### Principles

- **Focused effort:** a rapid analysis of one selected area, or a combination of areas, such as instant payments for private customers, consumer credit applications or claims.
- **Way of working:** data-driven analysis combined with dialogue with the business, carried out iteratively with regular check-ins with the client.
- **Output:** a concrete decision basis. Should this be scaled up? How should the future way of working look?

##### Steps

| Step | Focus | Main deliverables |
|---|---|---|
| 1. Current-state analysis (nulägesanalys) | Rapid analysis of the selected area. Identify deviating behaviours and risk indicators and concrete "case candidates". Quantify the potential: how big is the problem, and where should the client prioritise? Assess exposure from products and services, the scope and coverage of the existing fraud management framework, how fraud is handled in the organisation's structure and strategy, and the ability to identify internal fraud and infiltration. | Current-state report with quantified exposure, a list of case candidates handed to the client's investigators under the client's procedures, and the risk indicators found |
| 2. Model for controls (modell för kontroller) | Calibrate the scope of controls to prevent and detect fraud, based on the risk mapping and risk assessment. Set criteria for individual processes and for model validation. Automate detection and reporting. Design the investigation process. | Control model: proposed preventive and detective controls, detection rules or model approach, validation criteria, investigation process |
| 3. Scale up (skala upp) | Mobilise the implementation programme based on the conclusions from steps 1 and 2. | Implementation plan, business case and governance for the programme |

##### How the assistant should run the pilot

1. Agree the area and the data access, including legal approval for personal data, before starting.
2. Use `fraud-typologies.md` to choose hypotheses to test in the data, for example inflow and outflow velocity for mules, new payee plus high amount for vishing, or broker-level early defaults for application fraud.
3. Report case candidates only to the client's authorised investigators. Never name individuals in the report.
4. Express the potential as a range, with assumptions stated, and never as a precise forecast.
5. End with the decision basis: whether to scale up, what to change, the cost and effect of the change, and the next steps.

### Reference catalogue: fraud-workbook-layout.md

The workbook follows `_core/output-formats.md` and uses the same columns as the team's BWRA Excel template and the ABC workbook (AML analogy), so an integrated financial crime workbook can hold AML, ABC and fraud rows side by side.

Conventions:
- Every row has a unique ID.
- Every rating field has a drop-down list.
- Header rows are frozen.
- Data tables have no merged cells.

The **Detection coverage** sheet is restricted. Protect it, or deliver it as a separate file with limited distribution.

##### Sheet order

| # | Sheet | Purpose |
|---|---|---|
| 1 | Instructions | Purpose, how to use, colour legend, loss definitions, version log, contact roles |
| 2 | Inputs | Data request tracker (DR-Fxx) and key figures with reference dates |
| 3 | Fraud data | Losses and attempts by typology, product, channel and month: gross, net, recovered, customer-borne, prevented |
| 4 | Typologies | Long-list and selected typologies (T-FRD-xx), category, modus operandi, red flags |
| 5 | IR_Products & services | Inherent risk, area PRD |
| 6 | IR_Customers | Inherent risk, area CUS |
| 7 | IR_Geography | Inherent risk, area GEO |
| 8 | IR_Distribution channels | Inherent risk, area CHN |
| 9 | IR_Internal | Inherent risk, area INT |
| 10 | General controls | Subarea summary and requirements (Y/N/PC) |
| 11 | Specific controls | Red flag → control → effectiveness, per typology |
| 12 | Detection coverage (restricted) | Typology → rule/model → performance |
| 13 | Residual risk | Risk overview, matrix, aggregation, quantified exposure |
| 14 | Action plan | Actions linked to risk IDs |
| 15 | Scales | Scales, matrices, impact thresholds, lookup lists |
| 16 | Results | Heat map and tables for the report |

##### Inherent risk sheets (5–9)

| Column | Content / guidance |
|---|---|
| Legal entity / Business area | |
| Risk factor ID | R-PRD-01 etc. |
| Risk factor / Risk parameter | |
| Description | Key characteristics |
| Fraud category | EXT-C / EXT-I / INT / PRC (drop-down, multiple allowed) |
| Threats | Typologies (T-FRD-xx) and how they apply |
| Reference / Source External (T) | Police, fraud centre, NRA, EU reports |
| Reference / Source Internal (T) | Cases, complaints, investigations |
| Product / service limitations | Limits, restrictions |
| Vulnerabilities | What at the client makes the threat possible |
| Reference / Source External (V) | |
| Reference / Source Internal (V) | |
| Exposure data | Volumes, losses, attempts (from the Fraud data sheet), with period |
| General inherent risk | Typical level from external sources (anchor) |
| Likelihood (1–4) | Drop-down, rationale |
| Impact (1–4) | Drop-down, using the client's financial thresholds |
| Inherent risk | From the matrix; override allowed with rationale |
| Override and rationale | |

##### Fraud data sheet (3)

| Period | Typology ID | Fraud category | Product | Channel | No. attempted | No. prevented | No. completed | Gross loss | Recovered | Net loss | Customer-borne | Reimbursed by client | Source |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

##### Detection coverage sheet (12, restricted)

| Typology ID | Red flag | Rule / model ID | Type (rule / score / model / network) | Real-time (Y/N) | Alerts (12 m) | True positives | Conversion | False-positive rate | Last tuned | Last validated | Coverage (full / partial / none) | Comment |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

##### Residual risk sheet (13)

| Risk area | Risk factor | Risk factor ID | Typology IDs | Fraud category | Inherent risk | General controls | Specific controls | Combined controls assessment | Residual risk | Current net loss (period) | Estimated potential | Comment on residual risk assessment | Identified remedial actions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

The aggregation block is the same as in the AML and ABC workbooks:
- Values: 4 = Very high, 3 = High, 2 = Normal, 1 = Low (`_core/risk-scales.md` §4).
- Bands for the average: 3.50–4.00 Very high, 2.50–3.49 High, 1.50–2.49 Normal, 1.00–1.49 Low.
- Unacceptable items are listed separately and are not averaged.

##### ID conventions

| Object | Format |
|---|---|
| Risk factor | R-[PRD/CUS/GEO/CHN/INT]-nn |
| Typology | T-FRD-nn |
| General control subarea | G-FRD-nn |
| Specific control | C-FRD-nn |
| Detection rule/model | As in the client's system (restricted) |
| Data request | DR-Fnn |
| Test | TP-Fnn |
| Action | A-nn |

When workbooks from several areas are combined, prefix every ID with the area code (AML-, SAN-, ABC-, FRD-).

## Placeholders

The blueprint text uses these placeholders. Fill each one from the request brief or the inputs. If a value is not known, write `[DATA NEEDED: …]` in the deliverable; never invent it, and never leave a `{{…}}` placeholder in a finished deliverable.

- `{{client_name}}` — the client's legal name (brief: client.legal_name)
- `{{client_short}}` — the defined term for the client, e.g. "the Company" (brief: client.defined_term)
- `{{date}}` — the deliverable date (brief: engagement.date)
- `{{firm_name}}` — the issuing firm (brief: issuing_firm.name)
- `{{jurisdiction}}` — the jurisdiction(s) (brief: engagement.jurisdictions)
- `{{language}}` — the output language (brief: engagement.output_language)
- `{{reporting_period}}` — the reporting period (brief: engagement.reporting_period)
- `{{version}}` — the document version (brief: engagement.version)
