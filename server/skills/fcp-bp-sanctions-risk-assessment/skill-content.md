# FCP blueprint [DRAFT]: Sanctions risk assessment (SRA)

Blueprint `sanctions-risk-assessment` v1.1 (draft – needs team input) from the FCP blueprint library, as ANTON skill `fcp-bp-sanctions-risk-assessment`. Produces a sanctions risk assessment (SRA; Swedish sanktionsriskbedömning, SRB) for a financial institution or other obliged entity. The main deliverable is a report that combines an OFAC-based exposure overview with client facts, risk scenarios by EBA category including circumvention and proliferation financing, control design and effectiveness, residual risk, risk indicators and a prioritised action plan. A supporting Excel workbook is optional. Use it for a first or updated sanctions (restrictive measures) exposure assessment, for a sanctions section or appendix to the AML/CTF business-wide risk assessment, to review or challenge an existing SRA, or to prepare for the EBA guidelines on restrictive measures and the AMLR. Do not use it for validating screening models, drafting sanctions policies or delivering training.

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
- `references/…` inlined below: `sra-workbook-layout.md`.
- The other `references/…` catalogues (`controls-and-screening.md`, `data-request-and-questions.md`, `exposure-matrix.md`, `kri-and-risk-appetite.md`, `regulatory-map.md`, `risk-scenarios-and-indicators.md`, `variant-layouts.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Draft status

This blueprint is a DRAFT – needs team input: it rests partly on analogy or general best practice. Tell the user so, and treat its section order, scales and calibrations as proposals until the team has validated them.

Items still to validate:
1. The report section order in "Deliverable structure", which is composed from the team's proposed SRA structure, practical guide and periodic sanctions report.
2. Scales and risk engine.
3. The guidance for combining the seven exposure factors into an overall exposure level, and the proposed mapping of the exposure scale Low / Normal / High to the 0–4 exposure scale in `_core/risk-scales.md` §5 (section 7.1).
4. Whether the maturity grid (Insufficient / Balanced / Focused) should be the standard yardstick for proportionality.
5. Whether the KRI calibration method (detection ratio and enforcement benchmarks) should be used for all client types.
6. Every reference marked `[VERIFY REFERENCE]`, in particular the AMLR article numbers, which of the two EBA restrictive-measures guidelines (EBA/GL/2024/14 and EBA/GL/2024/15) is the general one and which applies to PSPs and CASPs, their paragraph numbers, and the Swedish penalty provisions after the transposition of Directive (EU) 2024/1226.

## Method and quality bar (blueprint sections 1–14)

Load together with `_core/house-standards.md`, `_core/request-context.md` and `_core/output-formats.md`. This blueprint repeats house rules only where sanctions work sharpens them.

### 1. Purpose and outcome

The SRA shows how far `{{client_short}}`'s business is exposed to restrictive measures, how sanctions could be breached or circumvented through its customers, products, channels and geographies, how well the controls manage that exposure, and what must change. It answers three questions for the board and the senior staff member responsible for sanctions:

1. **Which sanctions apply to us, and where are we exposed?** This means the applicable regimes and the sanctions nexus, followed by an exposure profile backed by facts.
2. **How could a breach or circumvention happen here, and are our controls good enough?** This is answered by risk scenarios with inherent risk, controls and residual risk.
3. **What do we do now?** The answer is a set of prioritised actions, including screening calibration, KYC and beneficial-owner depth, product and geographic restrictions, risk indicators and the decision on risk appetite.

**Readers:** board and management (the CEO or the board adopts it, see step 11, and they set risk appetite); the sanctions-responsible senior staff member, often the specially appointed executive (SAE; *särskilt utsedd befattningshavare*, SUB), or the head of AML; the compliance and AFC functions (they design controls); internal audit; and the supervisor on request.

**The core idea is rule-based obligation, risk-based implementation.** Sanctions are *prohibitions*: strict liability, applied in real time, with no value thresholds, against named or clearly defined targets. AML/CTF consists of *obligations*: you are responsible for complying but not for every occurrence, the work looks back over past activity, it uses risk-based thresholds, and targets are found through risk factors. The SRA therefore never decides *whether* to comply. It decides *how much control* is needed to comply reliably. That covers which lists to use, what to screen and when, how fuzzy the matching should be, whether domestic payments are screened, how deep to go on ownership and control, whether to restrict access from certain geographies, and which customers to decline or exit. The deliverable must say this explicitly, because clients often hear "risk-based" and conclude that some sanctions exposure is acceptable.

### 2. When to use / when not to use

**Use for:**
- A first SRA, or the annual update, for a bank, payment or e-money institution, consumer credit company, insurer, fund or investment firm, crypto-asset service provider, or a non-financial entity with sanctions exposure.
- The sanctions part of an integrated BWRA, as an appendix or extension. Coordinate with `aml-ctf-risk-assessment`.
- A review or challenge of the client's existing SRA or sanctions risk scenarios (see Variants).
- Preparation for the EBA guidelines on restrictive measures (the restrictive measures exposure assessment) and for AMLR integration.
- Periodic (quarterly or annual) sanctions risk reporting to management (see Variants).

**Do not use for (use instead):**
- The ML/TF business-wide risk assessment: `aml-ctf-risk-assessment`.
- Independent validation of screening models, fuzzy-logic settings or list management: `model-validation-report`.
- A sanctions policy, instruction or screening SOP: `governing-documents`.
- A gap analysis against the EBA guidelines on restrictive measures: `gap-analysis`. Its findings can feed the control section here.
- Sanctions training or a workshop deck: `training-and-presentations`.
- A decision on a live potential true match or breach. That is an incident to escalate to the client's sanctions function and legal counsel, not content for a risk assessment.

### 3. Inputs

**Minimum to start** (in addition to the `_core/request-context.md` minimum):

| Input | Why it is needed | Usually comes from | If missing |
|---|---|---|---|
| Business description: products, customer segments, channels, countries of operation | Defines the exposure profile | Client, latest BWRA, website, annual report | Ask. Without it there is no assessment. |
| Latest ML/TF BWRA (allmän riskbedömning) | The SRA reuses its data, risk factors and scales | Compliance or AFC | Proceed. Collect the data directly and mark `[DATA NEEDED]`. |
| Sanctions regimes applied by policy (UN, EU, OFAC, UK, other) | Determines scope and the nexus analysis | Sanctions or financial crime policy | Assume UN and EU are mandatory. Mark the OFAC and UK position `[TO CONFIRM]`. |
| Screening set-up: what is screened, when, against which lists, provider | Core control for every factor | AFC, IT, screening provider documentation | Mark controls "not evidenced". |

**Needed for a complete deliverable:**

| Input | Why it is needed | Usually comes from | If missing |
|---|---|---|---|
| Customers by type, residence, citizenship and risk class; beneficial owners with foreign links; corporate customers by sector and import or export activity | Customer, sector and circumvention exposure | Core and KYC systems, industry risk list | `[DATA NEEDED]`; rate with a stated assumption |
| Cross-border payments by country, currency (USD share) and direction; card and digital usage abroad | Geographic, transaction and channel exposure; US nexus | Payment system, card processor, channel logs | `[DATA NEEDED]`; do not infer |
| Third-party set-up: correspondents, outsourcing, intermediaries (who screens what) | Reliance and delivery-channel risk | Contracts, outsourcing register | Rate reliance as not evidenced |
| Screening MI (alerts, auto-closed, manual, true matches, lead times) and backtesting or QA results | Control effectiveness | Screening system, QA | Control capped at Weak |
| History: freezes, reports, rejected payments, disclosures, incidents; compliance, audit and supervisory findings | History factor and control evidence | Sanctions function, audit | `[TO CONFIRM: none]` |
| Governance and risk appetite: responsible senior staff member, resources, training, board-approved appetite | Internal threats; residual comparison; KRI limits | Policy, organisation chart, board minutes | Propose wording for approval |

The full data request and the workshop question bank are in `references/data-request-and-questions.md`.

### 4. Regulatory and professional anchors

The full layered map, the Swedish authorities, the US nexus checklist and the Appendix E mapping table are in `references/regulatory-map.md`. State the regulatory status as of `{{date}}`. Remind the reader that sanctions regimes change weekly and that the framework is moving from guidelines (2025) to regulation (2027). Check every reference against the current version.

**EU baseline**
- **Legal basis and prohibitions.** Council decisions under Article 29 TEU and regulations under Article 215 TFEU, which are directly applicable. Examples are Regulation (EU) No 269/2014, Regulation (EU) No 833/2014 and Regulation (EC) No 765/2006. Listed persons' funds are frozen, and nothing may be made available to them directly or indirectly. Entities they own or control are covered. Participating in circumvention is prohibited. The EU implements all UN sanctions. Ownership and control follow the EU Best Practices `[VERIFY REFERENCE]`.
- **EBA guidelines on restrictive measures.** The two EBA guidelines on internal policies, procedures and controls to ensure the implementation of Union and national restrictive measures (EBA/GL/2024/14 and EBA/GL/2024/15) – one general, one for payment service providers and crypto-asset service providers under Regulation (EU) 2023/1113 `[VERIFY REFERENCE: confirm which number applies to which]`. Applicable from 30 December 2025 `[VERIFY REFERENCE: addressees, paragraphs]`. The general guideline requires a documented **restrictive measures exposure assessment** covering (a) which regimes apply, (b) the likelihood of non-implementation, (c) the likelihood of circumvention and (d) the impact of breaches, across customers, products and services, geographies and delivery channels. It must be updated after major changes and carried out at subsidiary level too. The guideline for PSPs and CASPs adds screening, freezing and reporting requirements under the Transfer of Funds Regulation (EU) 2023/1113.
- **Related instruments.** Instant Payments Regulation (EU) 2024/886 (daily verification of customers against EU lists) `[VERIFY REFERENCE]`; Directive (EU) 2024/1226 (criminal penalties); Dual-use Regulation (EU) 2021/821; the Commission's 2023 guidance on enhanced due diligence against Russia sanctions circumvention.
- **AML package (forward-looking).** AMLR (EU) 2024/1624 applies from 10 July 2027. It brings targeted financial sanctions into internal policies, the business-wide risk assessment, the tasks of the compliance officer, CDD and ongoing monitoring `[VERIFY REFERENCE: articles]`. AMLA (Regulation (EU) 2024/1620) takes over the EBA's AML mandates. AMLR prevails over the guidelines where they differ, but work done under the guidelines carries over because the structure is the same.

**National layer via `{{jurisdiction}}`.** Identify the act that implements sanctions and sets penalties, the competent authority for frozen-asset reports and derogations, the AML act and regulations behind the BWRA, any national lists, data protection rules on screening, and the supervisor's position on the EBA guidelines.

**Sweden (worked example).** *Lag (1996:95) om vissa internationella sanktioner* (no national lists; penalties; check the transposition of Directive (EU) 2024/1226 `[VERIFY REFERENCE]`). *Finansinspektionen* receives frozen-asset reports and Russia and Belarus deposit reports and grants certain derogations. *Penningtvättslagen (2017:630)* Chapter 2, Section 1 and Chapter 3, and *FFFS 2017:11* govern the BWRA that the SRA builds on. Suspected circumvention may also call for a report to Finanspolisen. *IMY* sets the rules on processing offence-related personal data in screening `[VERIFY REFERENCE]`. Other authorities with sanctions roles are the Ministry for Foreign Affairs, Inspektionen för strategiska produkter, Kommerskollegium and Försäkringskassan.

**Regimes that apply through exposure.** *US (OFAC)* applies through a US nexus: USD, US correspondents, US-origin goods or software, US group links and US-person staff. It brings the 50 Percent Rule, block and reject reporting and voluntary self-disclosure. *A Framework for OFAC Compliance Commitments* (2019) lists five components: management commitment, risk assessment, internal controls, testing and auditing, and training. The team's exposure matrix builds on the OFAC risk matrix in US examination guidance `[VERIFY REFERENCE]`. *UK (OFSI)* applies through the Sanctions and Anti-Money Laundering Act 2018.

**International standards.** FATF Recommendations 1 (PF risk assessment), 6 and 7; the FATF guidance on PF risk assessment and mitigation (2021); the Wolfsberg Guidance on Sanctions Screening (2019).

### 5. Method

The team's practical guide has three moves. (1) Collect data, which is mostly the same as for ML/TF. (2) Produce an overall SRA using the OFAC standard, or add fields to the ML/TF inherent risk and controls. (3) Assess specific risks (circumvention) as typologies, using the same method as specific ML/TF risks: threat or modus, then suitable control, then effectiveness. The steps below expand that guide.

**Step 1. Scope and set-up (kick-off meeting).** Agree the entities in scope (group, subsidiaries, branches; local assessments at subsidiary level), the reporting period, the audience and approval route, and whether the SRA is **separate or integrated**:

| | Integrated (appendix or extension of the BWRA) | Separate SRA, coordinated with the BWRA |
|---|---|---|
| Fits when | Exposure is low or normal: mainly domestic customers, few cross-border flows, no trade finance | Exposure is high: cross-border payments, correspondent banking, USD, trade-related customers, international lending or investment, a dedicated sanctions unit |
| Why | Proportionate. The same data, scales and approval cycle. | Sanctions risk differs from ML/TF risk, changes quickly and needs more frequent updates, and must act as a separate demand on screening, KYC and controls. Supervisors expect both an aggregate view and specific scenarios. |
| Maturity grid position | "Balanced" | "Focused" |

Whichever form is chosen, sanctions risk is **aggregated back** into the BWRA or the enterprise compliance risk assessment for a holistic view. The SRA uses the same data collection as the BWRA and the shared risk engine in `_core/risk-scales.md` (labels, control scale, combination rule and residual matrix), with the sanctions-specific additions in section 7. From July 2027 the AMLR expects sanctions risk to be part of the BWRA, so a separate SRA must still feed it. Record the choice and the reason in the introduction.

**Step 2. Data request.** Send the request in `references/data-request-and-questions.md` together with, or merged into, the BWRA request. Ask for numbers (counts, shares, volumes and values by country and currency, screening statistics) and for evidence. Where third parties are involved, ask who screens what.

**Step 3. Applicable regimes and sanctions nexus.** List the regimes that are mandatory (UN, EU, any national regime), those applied by policy, and those that apply through exposure (US nexus test, UK nexus). Make this a short table with a "Why it applies" column. Clients often say "we only follow EU" while they process USD via a US correspondent bank or issue cards usable worldwide.

**Step 4. Exposure overview (OFAC matrix with client status).** For each of the seven OFAC factors (customer base, customer risk, foreign and geographic exposure, e-banking, funds transfers, other international transactions, history), plus the EBA factors for channels, third parties and circumvention-prone exposure, write `{{client_short}}`'s **actual status, with numbers, in the status cell of the level that fits**, and leave the other status cells empty. Then fill the three control columns (customer or product restrictions; customer and payment screening; KYC and beneficial-owner checks), answer "Control effective?" for each with evidence, and finish with **Actions to take**. Close with an overall assessment (*helhetsbedömning*) and justify it in the BWRA. Descriptors, evidence and typical actions are in `references/exposure-matrix.md`.

**Step 5. Specific risk scenarios (workshop).** Run one or two workshops with the first line (product owners, onboarding, payments, procurement and HR where relevant), AFC and compliance. Start from the question "Which specific risks or methods do sanctioned parties use to transact with us?" Go through the categories in order: geographic; customer; products and services; delivery channels; then **circumvention for each of these**; then proliferation financing; then internal and general threats (staff, governance, resources, reporting lines, list and data management). Use the scenario catalogue in `references/risk-scenarios-and-indicators.md` as prompts, not as a list to copy. Each scenario names one category, one threat, the affected product or segment, and the data that evidences exposure. Do not combine several categories in one scenario. When aggregating existing scenarios, the aggregated scenario keeps the **highest** inherent risk of its parts.

**Step 6. Inherent risk.** Rate each scenario with the inherent risk levels in section 7 (Low / Normal / High / Very high, plus Unacceptable for identified listed persons) using the likelihood of non-implementation or circumvention and the impact of a breach. Impact is driven by the number of transactions, the amounts made available, the duration, the regulators with reach (US reach raises impact) and the reputational exposure. If the client has adopted its own methodology, use it and record each deviation from `_core/risk-scales.md`, but never mix scales.

**Step 7. Controls: design and effectiveness.** Map both the general controls and the scenario-specific controls to each scenario (catalogue in `references/controls-and-screening.md`) and combine them into one controls rating per scenario with the rule in `_core/risk-scales.md` §2: the scenario-specific control level is the starting point, and the general controls move it by at most one grade (section 7.3). Ask two questions separately. *Is the control designed to handle the risk?* (The AFC function usually designs, and compliance or internal audit checks the design.) *Does it work, and how do we know?* Evidence includes backtesting of fuzzy matching with original and manipulated names, QA sampling of closed alerts, alert statistics, overdue screening, KYC completeness, and compliance and audit results. "No serious findings from compliance or internal audit" is supporting evidence, not proof. Where a third party screens, ask for evidence of its controls (for example an industry due diligence questionnaire) and rate reliance accordingly. Then place the client on the maturity grid, read against its exposure level.

**Step 8. Residual risk and overall assessment.** Apply the residual matrix in `_core/risk-scales.md` §3 (section 7.4): inherent risk is reduced by at most two levels, Very high to Normal only with a written motivation that rests on tested evidence, and weak or non-existing controls can raise residual risk above inherent risk. Identified listed persons stay Unacceptable and are never mitigated. Aggregate by category and overall, and compare with the risk appetite. List the highest individual residual risks separately, because these drive the action plan and the KRIs.

**Step 9. Actions and links.** For every residual risk above Low, and every control rated Weak or Non-existing, write an action with an owner and a priority. Typical levers are screening scope and logic (lists, domestic payments, fuzzy thresholds differentiated by segment, natural or legal person, and risk class), beneficial-owner depth and ownership-and-control analysis below the AML 25 % threshold, geographic or IP restrictions on access, product limits, EDD and network analysis for higher-risk companies, adding sanctions risk factors to customer risk rating, TM scenarios for circumvention, contractual clauses, vendor and employee screening, training and governance. Show explicitly which control, model or procedure each action changes.

**Step 10. Risk indicators and risk appetite.** For each residual risk above Low, define at least one KRI or risk indicator with an early warning trigger and a risk appetite limit. This is a sanctions-specific rule: it is stricter than the default in `_core/risk-scales.md` §7, which requires KRIs for High and Very high residual risks and for Normal residual risk with very significant exposure. Calibrate the limits with the method in `references/kri-and-risk-appetite.md`, not by feel. Propose a risk appetite wording where none exists.

**Step 11. Review, adoption and update.** Hold a review meeting with the sanctions-responsible senior staff member, and then present to management and the board. The SRA is adopted by the CEO or the board, as required by national rules and the client's governing documents; the designated executive (SAE/SUB) owns the process and presents it `[VERIFY REFERENCE]`. State the update triggers: at least annually, and also after new major sanctions packages, new products, markets or channels, M&A, a breach or near miss, or relevant audit or supervisory findings. OFAC also expects the assessment to be updated for the root causes of any apparent violations.

**Judgement calls to make explicitly**
- *Low domestic exposure is not zero exposure.* Cards used abroad, beneficial owners with foreign citizenship, investor-citizenship schemes, and suppliers or employees still create exposure.
- *Ownership and control.* Aggregate holdings of several listed persons, control through board appointments, transfers to family members just after a listing, and missing ownership information all point towards treating an entity as sanctioned on a risk basis. Flag for legal review and do not decide individual cases in the SRA.
- *Reliance on correspondent banks.* Their screening protects them, not necessarily `{{client_short}}`. Rate it as a mitigant only with evidence.
- *Circumvention hubs.* No official list exists. Build the list from current EU and US designations of third-country entities, trade-diversion analysis and high-risk third-country lists, date it, and update it at least every six months.

### 6. Deliverable structure

Main deliverable: **Sanctions risk assessment report** (*Sanktionsriskbedömning*). Front matter follows house standards. Typical length is 15–30 pages plus appendices for a separate SRA, and 5–10 pages for an integrated appendix (sections 2–6 condensed). The skeleton is in `template.md`.

| # | Section | Purpose and must contain | Length and style |
|---|---|---|---|
| – | Executive summary (*Sammanfattning*) | The overall inherent exposure, control assessment and residual risk (one line each); the 3–5 highest residual risks; the most important actions; the decision required (approval, risk appetite, resources) | 1–2 pages, conclusion first |
| 1 | Introduction | Background, purpose, scope (entities, period), separate or integrated and why, method summary, sources (data, interviews, workshops), regulatory status as of `{{date}}`, limitations, definitions | 1–2 pages, factual |
| 2 | Applicable sanctions regimes and sanctions nexus | Table: regime, basis (mandatory, policy, exposure), why it applies, practical consequence (lists, reporting) | ½–1 page |
| 3 | Business overview and sanctions exposure profile | Short business description; the exposure matrix (7 OFAC factors plus EBA factors) with status in numbers and the exposure level; the overall exposure conclusion | 2–4 pages, numbers before adjectives |
| 4 | Risk scenarios by category | 4.1 Geographic, 4.2 Customer, 4.3 Products and services, 4.4 Delivery channels, 4.5 Circumvention of sanctions, 4.6 Proliferation financing, 4.7 Internal and general threats. Per category: scenarios, red flags, exposure data, inherent risk with justification | 4–10 pages, typology language |
| 5 | Mitigating controls and effectiveness | General controls; screening (customers, payments, other objects); KYC and beneficial owners; restrictions; monitoring; reporting and freezing; governance and training. Design and effectiveness with evidence; maturity grid position | 3–6 pages |
| 6 | Residual risk and overall assessment | Table per category (inherent, controls, residual); the highest individual residual risks; comparison with risk appetite; year-on-year change | 1–2 pages |
| 7 | Risk indicators and risk appetite | KRI table with early warning trigger and limit; proposed risk appetite statement | 1–2 pages |
| 8 | Conclusions, recommendations and action plan | Consolidated, prioritised actions with owner and timing; links to screening, CRR, KYC, TM, training and the BWRA | 1–3 pages |
| App. A | Method and scales | Scales, residual matrix, aggregation rules | As needed |
| App. B | Risk scenario register | Full register exported from the workbook | Table |
| App. C | Exposure matrix (full) | All columns of the matrix | Table |
| App. D | Sources, interviews and workshops | Roles (not names), dates, documents | List |
| App. E | Regulatory mapping | EBA exposure assessment elements (restrictive-measures guidelines) and AMLR requirements mapped to report sections | Table |

The section order follows the reader's logic: what applies, where we are exposed, how it could go wrong, how well we manage it, what remains and what we do. Executive summary and section 8 are written last.

### 7. Scales, scoring and calculations

Sanctions uses the shared risk engine in `_core/risk-scales.md`: the risk labels (§1), the control scale and the rule for combining general and specific controls (§2), the residual risk matrix (§3), appetite (§7) and colours (§9). The items marked **sanctions-specific** are additions on top of the engine, and none of them changes the labels, the control scale, the matrix or the reduction rule. Never mix scales in one deliverable. If the client has adopted its own methodology, use the client's version and record each deviation from `_core/risk-scales.md` in the methodology section. The library default is still to be confirmed by the team (see the validation list at the top).

**7.1 Exposure level per factor (section 3) – sanctions-specific.** Low / Normal / High (*Låg / Normal / Hög*), following the OFAC descriptors in `references/exposure-matrix.md`. The OFAC source text calls the middle level "Moderate"; in the deliverable it is written Normal. These are exposure levels, not risk ratings. Label them "Exposure" in tables so they are not confused with the risk levels.

**Mapping to the exposure scale in `_core/risk-scales.md` §5 (0–4), proposed `[TO CONFIRM]`:**

| Sanctions exposure level | Exposure scale (§5) | Reading |
|---|---|---|
| Low | 0 None, 1 Very limited | No exposure to the factor, or a handful of customers or transactions and a negligible share of volume |
| Normal | 2 Small | A small share of customers or volumes (the OFAC descriptor speaks of a limited or moderate number) |
| High | 3 Significant, 4 Very significant | A material or large share of customers or volumes, or core business |

Write the client's actual figures next to the level, and record the 0–4 value in the workbook so that work can be prioritised by residual risk × exposure (§5). If the figures straddle two levels, use the higher level and explain why.

**Overall exposure (helhetsbedömning).** This is a reasoned judgement and is never an average. Guidance: if any factor is High and uncontrolled, the overall exposure is at least Normal. If two or more factors are High, or the history factor is High, the overall exposure is High. A single Normal factor caused by a narrow feature (for example cards usable abroad) can sit within an overall Low, provided this is stated. Translate the overall exposure into the inherent risk in section 6 together with the scenario results.

**7.2 Inherent risk per scenario and category.** Labels as in `_core/risk-scales.md` §1: Low / Normal / High / Very high, plus Unacceptable (Swedish: *Låg / Normal / Hög / Mycket hög / Oacceptabel*). "Moderate" and "Medium" are not used as risk levels. Inherent risk per scenario is a reasoned judgement of the likelihood of non-implementation or circumvention and the impact of a breach. Where a scenario is written as an event, the likelihood × impact step in `_core/risk-scales.md` §6 can support the rating, with its descriptors and matrix unchanged. Sanctions-specific descriptors:

| Level | Label (sv) | Descriptor for sanctions risk |
|---|---|---|
| Unacceptable | Oacceptabel | A listed (sanctioned) person, or an entity owned or controlled by one, identified as a customer or counterparty, and relationships, products or flows that cannot be run in compliance with the applicable regimes. Outside appetite by law: refused or terminated. Never mitigated or averaged, and reported separately. |
| 4 Very high | Mycket hög | Structural, frequent exposure: regular flows, customers or counterparties linked to comprehensively sanctioned or circumvention-prone jurisdictions or sectors, or products that make funds available cross-border at scale. A failure would likely involve many transactions or large amounts and authorities with extraterritorial reach. |
| 3 High | Hög | Regular but bounded exposure in identifiable segments or products. A breach or circumvention is plausible and would be material in number, amount or reputation. |
| 2 Normal | Normal | Occasional or indirect exposure. A breach is possible but would likely be isolated and of limited value. |
| 1 Low | Låg | Remote exposure: domestic, transparent customer base, no cross-border or third-party flows in the scenario. |

Unacceptable applies to an identified listed person and to a relationship that cannot be run in compliance. The risk that a listed person is *not detected* stays an ordinary scenario, rated Low to Very high and then mitigated by controls.

**Category rating (sanctions-specific addition to `_core/risk-scales.md` §4).** Sanctions are prohibitions with strict liability, so a category is not an average of its scenarios. Start from the highest scenario in the category. Lower it by one level only if that scenario is narrow and the rest of the category is clearly lower, and write down why. **Aggregated scenarios** keep the highest inherent risk of their parts. Unacceptable items are reported separately.

**7.3 Control effectiveness.** Strong / Adequate / Weak / Non-existing (*Stark / Tillfredsställande / Svag / Obefintlig*), as defined in `_core/risk-scales.md` §2. This is the same scale as in the AML, ABC and fraud assessments. The labels Very effective / Effective / Moderately effective / Low effectiveness belong to the optional weighted general-controls variant in `aml-ctf-risk-assessment/references/scales-and-scoring.md`, not to the AML control scale. If a client's tool uses them, map them one to one: Very effective = Strong, Effective = Adequate, Moderately effective = Weak, Low effectiveness = Non-existing, and write the deliverable with the four labels above. Sanctions-specific descriptors:

| Level | Label (sv) | Descriptor |
|---|---|---|
| 1 Strong | Stark | Fully documented, tested with good results (for example backtesting, QA), and can only be marginally improved |
| 2 Adequate | Tillfredsställande | Documented and functioning; minor improvements possible |
| 3 Weak | Svag | Documentation, procedures or coverage insufficient, or effectiveness not evidenced |
| 4 Non-existing | Obefintlig | Missing, not working or not documented |

Rules: Strong requires evidence of operating effectiveness, so a control without test evidence is rated **at most Adequate** (§2). In the exposure matrix, "Control effective?" is answered **Yes / Partly / No / Not evidenced**, with the evidence stated.

**Combining general and specific controls.** Apply the rule in `_core/risk-scales.md` §2 to give one controls rating per scenario. The scenario-specific control level is the starting point. The general controls (governance, resources, training, list and data management) may move the combined level by at most one grade, up or down, and a strong general level never lifts a Weak or Non-existing specific control. Where a general control family is what actually mitigates the scenario, for example the screening set-up, it may carry more weight case by case, and the reasoning is documented.

**7.4 Residual risk.** Apply the matrix in `_core/risk-scales.md` §3 unchanged, including its Unacceptable row. It is copied into the report's method appendix and the workbook's scales sheet. The conservatism rules apply as written there:
- Inherent risk is reduced by at most two levels. Very high to Normal requires a written motivation, which for sanctions rests on tested evidence such as backtesting and QA results.
- Weak or non-existing controls can raise residual risk above inherent risk (for example Low + Weak = Normal). A rule that residual risk never exceeds inherent risk is not used.
- An Unacceptable inherent risk stays Unacceptable whatever the controls.
- Manual overrides need documented reasoning and are listed in the residual risk section.

**Position against appetite** (`_core/risk-scales.md` §7). Low and Normal residual risk are within appetite. High is outside appetite unless a time-limited action plan is approved by management (for example up to 6 months for a newly identified risk), with strengthened controls, an owner and a deadline. Very high is outside appetite and needs a board decision: remediate, restrict the product or segment, or exit. Unacceptable is never accepted: refuse or terminate. Colours follow `_core/risk-scales.md` §9 and the label is always shown.

**7.5 Actions.** Priorities follow house standards: Immediate / within 3 months / within 6–12 months.

**7.6 KRIs – sanctions-specific rule.** At least one KRI for every residual risk above Low, which is stricter than the default in `_core/risk-scales.md` §7 (KRIs for High and Very high residual risk, and for Normal residual risk with very significant exposure). Each KRI has an early warning trigger and a risk appetite limit. Status: within appetite, early warning reached, limit breached. Calibration is described in `references/kri-and-risk-appetite.md`.

### 8. Supporting artefacts

**Sanctions risk assessment workbook (Excel).** Built on the team's matrix and laid out according to `_core/output-formats.md`. The sheets are: Instructions (including the instruction text from the team's tool); Inputs; Exposure matrix (*Riskbedömning SRB*); Specific questions (*Specifika frågor som stöd*); Scenario register (IDs such as S-GEO-01); Control register (C-SCR-02); KRI; Scales and parameters (section 7, referenced by every formula); Results (category summary and heat map feeding report sections 6–7). Columns and validation rules are in `references/sra-workbook-layout.md`.

**Data request and workshop pack:** see `references/data-request-and-questions.md`.

**Board summary (optional, PowerPoint):** 5–8 slides covering the overall result, the exposure profile, the highest residual risks, the actions and the decision required. The slide titles state the message.

**Periodic sanctions risk report (variant):** see Variants.

### 9. Writing rules specific to this deliverable

- **Separate the prohibition from the method.** Write "`{{client_short}}` shall not make funds available to listed persons; the depth of screening is set on a risk basis". Never write "sanctions risk is accepted at a normal level" in a way that implies tolerance of breaches.
- **Name the regime** whenever you state a requirement ("under EU Regulation…", "under OFAC rules, applied because of USD clearing…").
- **Status in numbers.** Every exposure factor carries at least one figure or a `[DATA NEEDED]` marker.
  - *Weak:* "Geographic exposure is low."
  - *Good:* "[x] % of customers are resident in Sweden and [y] % in other EU/EEA countries; none are resident in comprehensively sanctioned jurisdictions. Cards can be used abroad and about [n] card transactions a month take place outside the EEA. We assess the geographic exposure as Normal."
- **Effectiveness with evidence.**
  - *Weak:* "Screening is effective."
  - *Good:* "Customers, representatives and beneficial owners are screened daily against the EU, UN and OFAC lists. In [year], [x] alerts were generated; [y] were auto-closed and [z] reviewed manually, with [n] true matches. The fuzzy-matching settings have not been backtested, so effectiveness cannot be evidenced. We assess the control as Weak."
- **Scenario wording** names who, through what, and how: "A sanctioned person uses a strawman (*målvakt*) with a clean profile to open a savings account and receive transfers from a third country." Avoid "Customer risk is high."
- **Terminology (sv):** restrictive measures (*restriktiva åtgärder*); international or financial sanctions (*internationella / finansiella sanktioner*); asset freeze (*frysning av tillgångar*); circumvention (*kringgående*); true match / false positive (*äkta träff / falsk träff*); beneficial owner (*verklig huvudman, VHM*); proliferation financing (*spridningsfinansiering*); exposure assessment (*exponeringsbedömning*); risk appetite (*riskaptit*). Keep established English terms (SDN, OFAC, KRI, fuzzy matching) where the client uses them.
- **No listed names, no live cases.** Do not name listed persons, and do not describe a specific true match in the body. Aggregate the figures, and put any case detail in a restricted annex only if the client asks for it.
- **No legal conclusions on individual entities.** Ownership-and-control determinations are flagged for legal review.
- **Date anything that ages fast:** list versions, hub lists, number of EU packages, enforcement statistics.

### 10. Quality checklist

In addition to the house checklist:

- [ ] The regimes table states why each regime applies, including the US nexus test.
- [ ] Every exposure factor has a status with numbers or a `[DATA NEEDED]` marker, placed under the right level.
- [ ] Circumvention is assessed for geography, customers, products and channels; PF and internal threats are covered or explicitly scoped out with a reason.
- [ ] No scenario mixes categories; aggregated scenarios carry the highest inherent risk of their parts.
- [ ] Every control rating states its evidence; untested controls are not rated Strong; third-party reliance is evidenced.
- [ ] Residual risk follows the matrix in `_core/risk-scales.md` §3: at most two levels of reduction, Very high to Normal only with a written motivation, and listed persons are Unacceptable and not mitigated.
- [ ] Every residual risk above Low has an action and a KRI (sanctions-specific rule); every KRI has a trigger, a limit and a calibration note.
- [ ] Screening scope covers customers, representatives, beneficial owners, payments and, where relevant, suppliers, employees, securities, goods and vessels.
- [ ] Ownership and control is addressed beyond the 25 % AML threshold.
- [ ] Separate or integrated is decided and justified, and the result is linked back into the BWRA.
- [ ] The EBA exposure assessment elements and the AMLR changes are mapped (Appendix E); the regulatory status date is stated.
- [ ] No listed person's name, live case or other client's data appears.

### 11. What makes it stand out

- **Two layers, one logic.** A holistic exposure profile (the OFAC matrix with the client's own facts) combined with a typology-based scenario layer. This matches what OFAC, the EBA and the Commission each ask for, where a generic SRA does only one.
- **Facts in the matrix.** The status is written in numbers under the level it matches, so the reader sees why the level was chosen.
- **The risk assessment drives the controls in the same row.** Each exposure factor sits next to the three standard control families and a concrete "action to take". The SRA becomes the specification for screening scope, lists, fuzzy-matching thresholds, domestic payment screening, beneficial-owner depth and geographic restrictions.
- **Circumvention is a lens on every category**, not a single footnote, together with proliferation financing and internal threats (staff, resources, reporting lines, list and data management).
- **Built on the BWRA.** One data collection, the same scales, conservative residual logic and coordinated approval. The design is ready for AMLR integration in 2027.
- **Proportionality made visible.** The maturity grid (Insufficient / Balanced / Focused) shows the client what control level its exposure calls for and avoids both under- and over-engineering.
- **KRI limits calibrated, not guessed.** Thresholds are derived from screening detection ratios and enforcement benchmarks in numbers of transactions and amounts.
- **Clear on rule-based versus risk-based.** The deliverable explains where the law is absolute and where the institution chooses its means.

### 12. Common pitfalls

- Treating sanctions as "AML plus screening". The only sanctions content is a customer risk factor ("listed customer = unacceptable"), and circumvention is missing.
- Copying the OFAC descriptors without client facts, or leaving status cells blank.
- Assuming a correspondent bank, card scheme or outsourced provider covers the risk without evidence. Accepting "no audit findings" as proof that screening works.
- Setting fuzzy matching close to an exact match to cut false positives without a risk analysis. This is a recurring enforcement root cause.
- Ignoring the US nexus. Using the 25 % beneficial-owner threshold as the sanctions test. Forgetting suppliers, employees and payees.
- Scenarios that mix categories, or that are so granular that the aggregate view is lost.
- Percentage KRIs that hide the absolute numbers and amounts that enforcement focuses on.
- Undated country or hub lists. Citing consultation papers instead of final guidelines.
- No process for shadow designations or for customers who become listed during the relationship.

### 13. Variants

**By client type**
- **Bank:** correspondent banking, USD clearing, trade finance (documents, vessels, goods), securities and custody. A separate SRA is usually expected. Include payment screening for international payments and, where the risk is very high, for domestic payments.
- **Payment or e-money institution:** the EBA restrictive-measures guideline for PSPs and CASPs, the Transfer of Funds Regulation, instant payments (verify customers daily; little time to stop a payment), merchants and agents, IP and geography-based access restrictions.
- **Consumer credit company:** mostly domestic customers. Typical exposure comes from cards usable abroad, beneficial owners of corporate customers and outsourced payments. An integrated appendix with the OFAC matrix and 5–10 scenarios is usually proportionate.
- **Insurance:** beneficiaries and claims payments, marine, cargo and aviation cover, reinsurance. Under EU rules, insurance is a form of financial assistance.
- **Fund or investment firm:** issuers under sectoral sanctions (screening of securities identifiers), investors and distributors, custody chains.
- **Crypto-asset service provider:** wallet and blockchain analytics, Travel Rule data, the EBA restrictive-measures guideline for PSPs and CASPs.
- **Non-financial obliged entity or corporate:** trade, dual-use goods, export licences, end users, suppliers.
- **Public-sector or development lender:** counterparties, promoters, contractors and vendors. Exposure through intermediated lending. Measure exposure in signed amounts.

**By size:** small entities use the integrated form and the seven-factor matrix with a short scenario list. Large or group entities use a separate SRA, group and subsidiary assessments, a scenario register, KRIs and quarterly reporting.

**By maturity and task**
- *First SRA:* emphasise steps 3–4 and the regime and nexus analysis; expect data gaps.
- *Annual update:* compare with last year (inherent, controls and residual per category), new packages and lists, incidents, and changes in products and channels.
- *Review or challenge of an existing SRA:* the firm writes as an independent reviewer. The sections are Summary, Background and guidelines, Analysis of current structure, Proposed structure and aggregation, Additional scenarios, Separate SRA, and Governance. It includes a seven-column mapping table from EBA category to aggregated scenario. See `references/variant-layouts.md`.
- *Periodic sanctions risk report (quarterly or annual):* covers regulatory and list developments, KRIs against thresholds, SRA outcome per category and the top residual risks, assurance results and screening KPIs, and a forward look with an action plan. See `references/variant-layouts.md`.

### 14. How the assistant should work

1. **Read the brief** (`_core/request-context.md`). Then ask at most five questions, choosing the ones whose answers are missing: (a) the institution type, main products and channels, and whether cards, cross-border or USD payments, or trade-related customers exist; (b) the entities and jurisdictions in scope; (c) which regimes the policy applies and who screens what, including third parties; (d) separate or integrated SRA, and whether the latest BWRA is available; (e) which data and screening statistics can be provided.
2. **Produce in this order:** the regimes and nexus table, the exposure matrix, the scenario list for workshop validation, the control assessment, residual risk and the KRIs, the actions, and finally the executive summary. For a first draft without data, produce the structure with `[DATA NEEDED]` markers and the data request rather than plausible-sounding numbers.
3. **Draft scenarios as proposals** for the workshop. Mark them `[TO CONFIRM in workshop]` until the client has validated them.
4. **Stop and ask** when: the US or UK nexus is unclear and changes the scope; the client describes a possible true match, breach or freeze (advise escalation to the sanctions function and legal counsel, and keep it out of the report); an ownership or control question needs a legal view; the client wants residual risk lowered without evidence; or the client's methodology conflicts with `_core/risk-scales.md` (record the deviation).
5. **Check before delivery:** the quality checklist above and the house checklist. Confirm that every `[VERIFY REFERENCE]` has been resolved or listed for the user.

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: Sanctions risk assessment report (Sanktionsriskbedömning)

Write in `{{language}}`. Headings are given in English with the Swedish term in parentheses. Text in `[brackets]` is guidance; delete it in the final document. Mark missing facts with `[DATA NEEDED: …]`, `[TO CONFIRM: …]` or `[ASSUMPTION: …]`. For an integrated SRA (an appendix to the BWRA), keep sections 2–6 and condense them to 5–10 pages.

---

`[Cover page]`

**Sanctions Risk Assessment {{reporting_period}}** (*Sanktionsriskbedömning*)
{{client_name}}
Document type: Risk assessment | Date: {{date}} | Version: {{version}} | Confidentiality: [Confidential]
Prepared by: [{{firm_name}} / the client's function, depending on `author_of_record`] | Recipient: [Board of Directors / CEO / senior staff member responsible for sanctions]

---

`[Page 2: Document control]` (*Dokumentinformation*)

| Version | Date | Author | Change |
|---|---|---|---|
| {{version}} | {{date}} | [Role] | [First draft] |

Owner: [Role, e.g. SAE (specially appointed executive, *särskilt utsedd befattningshavare*, SUB)] | Adopted by: [CEO or board, as required by national rules and the client's governing documents] | Adoption date: [ ] | Next review: [at the latest {{date}} + 12 months, or earlier on a trigger in section 1.4]

[The assessment is adopted by the CEO or the board, as required by national rules and the client's governing documents; the designated executive (SAE/SUB) owns the process and presents it. `[VERIFY REFERENCE]` Delete this note in the final document.]

---

#### Executive summary (*Sammanfattning*)

[1–2 pages, conclusion first. Write it last.]

**Overall assessment.** [One paragraph covering inherent exposure, control effectiveness and residual risk, compared with risk appetite.]

Example: "{{client_short}}'s overall inherent sanctions risk is assessed as **High**, mainly because of international payments and corporate customers with foreign ownership. Controls are assessed as **Weak**: screening covers the relevant lists, but the matching settings have not been tested and ownership and control is not analysed below the 25 % threshold. The residual risk is **High**, which exceeds the board's appetite of Normal. Three actions are required to bring it within appetite."

| Area | Inherent risk | Controls | Residual risk |
|---|---|---|---|
| Overall | [ ] | [ ] | [ ] |

**Key findings** [3–5 bullets: the highest residual risks and the main control gaps]

**Most important actions** [3–5 bullets with priority and owner]

**Decision required** [e.g. approval of the SRA; approval of the risk appetite statement; resources for screening calibration]

`[Table of contents]`

---

#### 1. Introduction (*Inledning*)

##### 1.1 Background and purpose (*Bakgrund och syfte*)
[Why the SRA is done: regulatory basis (EU sanctions regulations; the EBA guidelines on restrictive measures from 30 December 2025; AMLR from 10 July 2027; OFAC compliance commitments if there is a US nexus); the purpose of identifying exposure to restrictive measures and the risks of non-implementation and circumvention, and of setting controls accordingly.]

Example: "Sanctions are prohibitions: {{client_short}} shall not make funds or economic resources available to listed persons, directly or indirectly. This assessment does not determine whether sanctions are complied with, which is mandatory. It determines which controls are required, and how far they must go, to ensure compliance given {{client_short}}'s exposure."

##### 1.2 Scope (*Omfattning*)
[Entities, branches and subsidiaries; reporting period; regimes in scope (cross-reference section 2); exclusions with reasons.]

##### 1.3 Relationship to the general risk assessment (*Förhållande till den allmänna riskbedömningen*)
[State whether this SRA is separate or integrated, and why. Explain how the results feed back into the BWRA (allmän riskbedömning) and the enterprise risk assessment, and that the same data and the same risk engine (labels, control scale, combination rule, matrix) are used.]

##### 1.4 Method, sources and update (*Metod, underlag och uppdatering*)
[Summary of the two-layer method (exposure overview and scenarios); data request (period); workshops and interviews (roles and dates, details in Appendix D); scales (Appendix A; the risk engine of `_core/risk-scales.md`, with each deviation stated); update triggers: annually, and after new sanctions packages, new products, markets or channels, M&A, breaches or near misses, or audit and supervisory findings.]

##### 1.5 Regulatory status and limitations (*Regelverksstatus och begränsningar*)
Regulatory status as of {{date}}. [List limitations, e.g. data not provided, controls not tested by us.]

##### 1.6 Definitions (*Definitioner*)

| Term | Definition |
|---|---|
| Restrictive measures / sanctions (*restriktiva åtgärder / sanktioner*) | [ ] |
| Asset freeze (*frysning av tillgångar*) | [ ] |
| Circumvention (*kringgående*) | [ ] |
| Sanctions nexus | [ ] |
| Beneficial owner (*verklig huvudman, VHM*) | [ ] |
| Proliferation financing (*spridningsfinansiering*) | [ ] |
| True match / false positive (*äkta träff / falsk träff*) | [ ] |
| Comprehensively sanctioned / restricted jurisdictions | [as defined in {{client_short}}'s country lists] |

---

#### 2. Applicable sanctions regimes and sanctions nexus (*Tillämpliga sanktionsregimer*)

[State why each regime applies and what it means in practice. Test the US nexus explicitly: USD, US correspondents, US-origin goods or software, US-person staff, US group links.]

Table 1: Applicable sanctions regimes

| Regime | Basis (mandatory / policy / exposure) | Why it applies to {{client_short}} | Practical consequence (lists, reporting, contacts) |
|---|---|---|---|
| UN (through EU) | Mandatory | [ ] | [ ] |
| EU | Mandatory | [ ] | Freezing and reporting to {{supervisor}} |
| [National, via {{jurisdiction}}] | [ ] | [ ] | [ ] |
| US (OFAC) | [Policy / exposure] | [e.g. USD payments via correspondent bank] | [SDN and non-SDN lists; block or reject reports; voluntary self-disclosure procedure] |
| UK (OFSI) | [ ] | [ ] | [ ] |

---

#### 3. Business overview and sanctions exposure profile (*Verksamhetsbeskrivning och exponering*)

##### 3.1 Business overview (*Verksamheten*)
[½ page: products, customers, channels and geographies, with numbers.]

##### 3.2 Exposure profile (*Exponeringsbedömning*)
[The OFAC-based matrix in condensed form; the full matrix is in Appendix C. Write status with numbers. "Exposure" is Low / Normal / High per the descriptors in Appendix A, with the mapping to the 0–4 exposure scale.]

Table 2: Sanctions exposure profile

| ID | Risk factor (*Riskfaktor*) | Status {{client_short}} (evidence) | Exposure | Key mitigating controls | Control effective? | Actions to take (*Åtgärder att vidta*) |
|---|---|---|---|---|---|---|
| E-01 | Customer base (*Kundbas*) | [ ] | [Low / Normal / High] | [ ] | [Yes / Partly / No / Not evidenced] | [ ] |
| E-02 | Customer risk (*Kundrisk*) | [ ] | | | | |
| E-03 | Foreign / geographic exposure (*Utländsk/geografisk exponering*) | [ ] | | | | |
| E-04 | E-banking / digital channels | [ ] | | | | |
| E-05 | Number of funds transfers (*Antal transaktioner*) | [ ] | | | | |
| E-06 | Other international transactions / product exposure (*Produktexponering*) | [ ] | | | | |
| E-07 | History (*Tidigare status/historik*) | [ ] | | | | |
| E-08 | Delivery channels and intermediaries | [ ] | | | | |
| E-09 | Third parties (suppliers, staff, partners) | [ ] | | | | |
| E-10 | Circumvention-prone jurisdictions and sectors | [ ] | | | | |

##### 3.3 Overall exposure assessment (*Helhetsbedömning*)
[A reasoned conclusion, not an average. Say which factors drive it.]

Example: "Six of ten factors show Low exposure. Exposure is driven by international payments (E-05, High) and by corporate customers with foreign ownership (E-02, Normal). Overall, we assess {{client_short}}'s sanctions exposure as Normal; the scenario analysis in section 4 shows where it is concentrated."

---

#### 4. Risk scenarios by category (*Riskscenarier per kategori*)

[For each category: a short narrative of how the risk could materialise in {{client_short}}'s business (typology language); the scenario table; the exposure data; inherent risk with justification. One scenario = one category and one threat. Mark scenarios `[TO CONFIRM in workshop]` until validated. Full register in Appendix B.]

Table format for each subsection:

| Ref. | Scenario (who, through what, how) | Red flags / indicators | Exposure data | Inherent risk | Justification (likelihood / impact) |
|---|---|---|---|---|---|
| S-GEO-01 | [ ] | [ ] | [ ] | [Low / Normal / High / Very high / Unacceptable] | [ ] |

##### 4.1 Geographic risk (*Geografisk risk*)
##### 4.2 Customer risk (*Kundrisk*)
##### 4.3 Products and services (*Produkter och tjänster*)
##### 4.4 Delivery channels (*Distributionskanaler*)
##### 4.5 Circumvention of sanctions (*Kringgående av sanktioner*)
[Circumvention per category: geographic, customer, products, channels. Cover strawmen, name changes and acquired citizenship, complex structures, trade through third countries, dual-use and priority goods, changes in payment flows, high-risk sectors. Refer to the dated circumvention hub list.]

Example: "A sanctioned party uses a newly formed company in a third country, whose ownership changed shortly after the sanctions took effect, to buy [goods] from a corporate customer of {{client_short}} and re-export them. Indicators: new buyer, transhipment country, goods on the common high priority list."

##### 4.6 Proliferation financing (*Spridningsfinansiering*)
##### 4.7 Internal and general threats (*Interna och generella hot*)
[Staff and vendor screening, US-person staff, resources, reporting lines, list and data management, tool outages, no process for customers listed during the relationship.]

---

#### 5. Mitigating controls and effectiveness (*Riskreducerande åtgärder och kontroller*)

[For each control family: description, design assessment, effectiveness rating with evidence. A control without test evidence is rated at most Adequate. Place {{client_short}} on the maturity grid against its exposure.]

##### 5.1 Governance, policy, resources and training (*Styrning, styrdokument, resurser och utbildning*)
##### 5.2 Customer and product restrictions (*Kund- och produktbegränsningar*)
##### 5.3 Customer screening (*Kundscreening*)
##### 5.4 Payment screening and screening of other objects (*Betalningsscreening*)
##### 5.5 KYC, beneficial owners and EDD (*Kundkännedom, VHM och skärpta åtgärder*)
##### 5.6 Customer risk rating and monitoring (*Riskklassificering och övervakning*)
##### 5.7 Alert handling, freezing and reporting (*Utredning, frysning och rapportering*)
##### 5.8 Testing, quality assurance and audit (*Kvalitetssäkring, test och granskning*)

Table 3: Control assessment

| ID | Control | Scenarios covered | Design | Effectiveness (Strong / Adequate / Weak / Non-existing) | Tested? | Evidence |
|---|---|---|---|---|---|---|
| C-SCR-01 | [Daily customer screening against EU, UN, OFAC lists] | [S-CUS-01…] | [Adequate / Weak / Non-existing; a design assessment alone never gives Strong] | [ ] | [Yes/No] | [e.g. alert statistics [reporting period]; no backtesting] |

Table 4: Maturity position

| Area | Expected for exposure level | Observed | Gap |
|---|---|---|---|
| Customer screening | [Balanced / Focused] | [ ] | [ ] |

---

#### 6. Residual risk and overall assessment (*Kvarstående risk och samlad bedömning*)

Table 5: Results by category

| Category | Inherent risk | Controls | Residual risk | Change vs previous year | Comment |
|---|---|---|---|---|---|
| Geographic | | | | | |
| Customer | | | | | |
| Products and services | | | | | |
| Delivery channels | | | | | |
| Circumvention | | | | | |
| Proliferation financing | | | | | |
| Internal and general | | | | | |
| **Overall** | | | | | |

Table 6: Highest individual residual risks

| Ref. | Category | Short description | Inherent risk | Aggregated controls | Residual risk | Comments (e.g. tracked in KRI) |
|---|---|---|---|---|---|---|

[Compare with risk appetite as in `_core/risk-scales.md` §7. High residual risk is outside appetite unless a time-limited action plan is approved by management; Very high is outside appetite and needs a board decision (remediate, restrict or exit); Unacceptable is never accepted (refuse or terminate).]

---

#### 7. Risk indicators and risk appetite (*Riskindikatorer och riskaptit*)

Table 7: Risk indicators

| ID | Indicator name | KRI flag | Data type | Early warning trigger | Risk appetite limit | Current value | Calibration note |
|---|---|---|---|---|---|---|---|
| K-01 | [Number of active sanctioned counterparties, related parties and vendors] | Y | Numeric | [ ] | [ ] | [ ] | [benchmark, detection ratio] |

**Proposed risk appetite statement** [if none exists, a wording for board approval]

---

#### 8. Conclusions, recommendations and action plan (*Slutsatser, rekommendationer och handlingsplan*)

[Consolidate all actions. Show which control, model or procedure each changes (screening, CRR, KYC, TM, training, BWRA). Prioritise; do not list fifty equal items.]

Table 8: Action plan

| ID | Area | Observation | Recommendation | Priority | Owner | Timing |
|---|---|---|---|---|---|---|
| A-01 | [Customer screening] | [Matching settings not backtested] | [Backtest with original and manipulated names; recalibrate by segment] | [Within 3 months] | [Head of AFC] | [ ] |

---

#### Appendix A – Method and scales (*Metod och skalor*)
[Exposure descriptors (Low / Normal / High) and their mapping to the 0–4 exposure scale; inherent risk levels (Low / Normal / High / Very high, and Unacceptable for listed persons); control scale (Strong / Adequate / Weak / Non-existing) and the combination rule; residual matrix from `_core/risk-scales.md` §3 (reduction of at most two levels; Very high to Normal only with a written motivation; residual may exceed inherent); aggregation rules (highest scenario carries over); position against appetite; priority levels.]

#### Appendix B – Risk scenario register (*Riskscenarioregister*)
[Export from the workbook: ID | Category | Sub-category | Product/segment | Scenario | Threat/red flags | Exposure data | Inherent risk | Control references | Controls rating | Residual risk | KRI | Actions]

#### Appendix C – Exposure matrix, full version (*Riskmatris*)
[All columns: Risk factor | Low (OFAC definition) | Status | Normal (OFAC definition, "moderate") | Status | High (OFAC definition) | Status | Customer/product restrictions | Control effective? | Customer screening/payment screening | Control effective? | KYC/UBO checks | Control effective? | Actions to take]

#### Appendix D – Sources, interviews and workshops (*Underlag, intervjuer och workshoppar*)

| Date | Type (interview / workshop / document) | Participants (roles) | Topic |
|---|---|---|---|

#### Appendix E – Regulatory mapping (*Regelverksmappning*)

| # | Requirement (source) | Where addressed in this SRA | Status / comment |
|---|---|---|---|
| 1 | Applicable regimes identified (EBA guidelines on restrictive measures) [VERIFY REFERENCE] | Section 2 | |

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

### Reference catalogue: sra-workbook-layout.md

The workbook builds on the team's sanctions risk matrix (sheets 3 and 4 below). The other sheets follow the standard order and conventions in `_core/output-formats.md`: frozen and filtered header rows, input cells shaded, drop-downs for every rating, no merged cells in data tables, a unique ID on every row, and every calculation referring to the Scales sheet.

| # | Sheet | Origin |
|---|---|---|
| 1 | Instructions | Standard, plus the instruction text from the team's tool |
| 2 | Inputs | Standard |
| 3 | Exposure matrix (*Riskbedömning SRB*) | Team's tool |
| 4 | Specific questions (*Specifika frågor som stöd*) | Team's tool |
| 5 | Scenario register | Added. Columns follow the team's scenario and SRA outcome tables. |
| 6 | Control register | Added. Columns follow the team's control assessment practice. |
| 7 | KRI | Added. Columns follow the team's KRI reports. |
| 8 | Scales and parameters | Standard |
| 9 | Results | Standard |

##### 1. Instructions

Include: purpose; "The template for the financial sanctions risk assessment is based on the OFAC risk assessment template"; "The assessment shall be made on the basis of the ML/TF risk assessment and its analysis of risk factors, channels, products etc."; "The risk assessment shall form the basis for measures to reduce the risks of breaching financial sanctions"; the list of possible measures (see `exposure-matrix.md`, section 6); the colour legend; the version log (Version | Date | Author | Change).

##### 2. Inputs

| Column | Content |
|---|---|
| ID | IN-01… |
| Parameter / data item | e.g. "Regimes applied", "Circumvention hub list (date)", "Customers by country" |
| Value | |
| Source | Data request ID (D-xx), document, interview |
| Date | ISO date |
| Comment | |

##### 3. Exposure matrix

Columns as in `exposure-matrix.md`, section 2, preceded by **ID** (E-01…E-10). Below the table, add rows for **Overall assessment** (*Helhetsbedömning*), with the exposure level and its justification, and a cross-reference to the BWRA.

##### 4. Specific questions

Columns: Topic | Question | Answer (per customer or segment) | Source | Follow-up. Rows follow `data-request-and-questions.md`, section 4, plus the four exposure questions.

##### 5. Scenario register

| Column | Content / validation |
|---|---|
| ID | S-GEO-01, S-CIR-CUS-01… |
| Category | Drop-down: Geographic / Customer / Products and services / Delivery channels / Circumvention / Proliferation financing / Internal and general |
| Sub-category | Direct / Circumvention |
| Product / segment | |
| Scenario description | One sentence: who, through what, how |
| Threat / modus and red flags | |
| Exposure data | Figures with source (D-xx) |
| Likelihood (non-implementation / circumvention) | Short justification |
| Impact | Number of transactions, amounts, reach, reputation |
| Inherent risk | Drop-down: Low / Normal / High / Very high / Unacceptable |
| Control references | C-xx IDs |
| Aggregated controls rating | Drop-down: Strong / Adequate / Weak / Non-existing (specific controls lead; general controls move the result by at most one grade, `_core/risk-scales.md` §2) |
| Residual risk | Calculated from Scales (residual matrix in `_core/risk-scales.md` §3) |
| KRI reference | K-xx |
| Comments / actions | Action IDs |
| Workshop validated (Y/N, date) | |

##### 6. Control register

| Column | Content / validation |
|---|---|
| ID | C-GOV-01, C-SCR-01, C-KYC-01… |
| Control family | Governance / Preventive / Detective / Response / Assurance |
| Control title | |
| Control description | What, when, by whom, on which data |
| Control owner | Function or role |
| Scenarios covered | S-xx IDs |
| Design assessment | Drop-down: Adequate / Weak / Non-existing (a design assessment alone never gives Strong, `_core/risk-scales.md` §2) |
| Design tested? | Yes / No |
| Effectiveness rating | Drop-down: Strong / Adequate / Weak / Non-existing (values 1–4) |
| Effectiveness tested? | Yes / No (if No, the rating is capped at Adequate) |
| Evidence | Backtesting, QA, statistics, findings |
| Maturity grid area and position | Focused / Balanced / Insufficient |
| Open findings / remediation in progress | |

##### 7. KRI

Columns as in `kri-and-risk-appetite.md`, section 1 (definition and periodic reporting), with IDs K-01…

##### 8. Scales and parameters

The inherent risk levels (Low / Normal / High / Very high, and Unacceptable), the control scale (Strong / Adequate / Weak / Non-existing), the residual matrix (`_core/risk-scales.md` §3), the exposure levels (Low / Normal / High) with their 0–4 values, priorities, the drop-down lists, the comprehensively sanctioned and restricted country lists (dated), and the circumvention hub list (dated, with sources).

##### 9. Results

- Exposure summary: the ten factors with their exposure levels and the overall assessment.
- Category table: Category | Inherent risk | Controls | Residual risk | Comments, with a column for the previous year.
- Top residual risks: Ref. | Category | Short description | Inherent risk | Aggregated controls | Residual risk | Comments (e.g. "Tracked in KRI").
- Heat map: inherent against residual by category, colours with labels.
- Action list: ID | Area | Observation | Recommendation | Priority | Owner | Timing | Status.

##### 10. ID conventions

| Object | Format |
|---|---|
| Input | IN-nn |
| Exposure factor | E-nn |
| Scenario | S-[category]-nn, for example S-GEO-01 |
| Control | C-[family]-nn, for example C-SCR-01 |
| KRI | K-nn |
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
- `{{supervisor}}` — the supervisor (brief: engagement.supervisor)
- `{{version}}` — the document version (brief: engagement.version)
