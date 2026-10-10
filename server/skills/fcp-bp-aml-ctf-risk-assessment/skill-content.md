# FCP blueprint: AML/CTF business-wide risk assessment (BWRA)

Blueprint `aml-ctf-risk-assessment` v1.1 (stable) from the FCP blueprint library, as ANTON skill `fcp-bp-aml-ctf-risk-assessment`. Produces the business-wide money laundering and terrorist financing risk assessment (BWRA or EWRA; Swedish allmän riskbedömning) as a board-ready report with a supporting Excel risk assessment tool. The method is typology-based. It assesses inherent risk per product, customer risk factor, geography and distribution channel, separately for ML and TF. It then evaluates general and specific controls, derives residual risk through a fixed matrix, and ends in a prioritised action plan. Also covers the BWRA instruction (methodology) that the client adopts, the assessment of general controls, the country risk list and industry risk list, and an ML/TF risk appetite statement. Use it for annual or event-driven updates, first-time assessments and reviews of an existing BWRA, for any obliged entity.

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

The output format **BWRA report — house structure (blueprint)** (`bp-bwra-report`) carries this blueprint's section order; selecting it attaches this skill. When another output format is selected, that format sets the layout and its own scale; keep this blueprint's method, evidence and wording rules within it.

## How references in this skill map to ANTON

The blueprint text points at files of the library it came from. In ANTON:
- `_core/house-standards.md`, `_core/glossary.md`, `_core/request-context.md`, `_core/output-formats.md` → the skill **FCP blueprint: house standards** (`fcp-bp-house-standards`). Attach it with this one for the full house rules; the essentials are in "Gap markers" above.
- `_core/risk-scales.md` → the section "Shared risk language" below (guidance for wording and structure only — see the scoring boundary).
- `template.md` → the section "Deliverable template" below.
- The other `references/…` catalogues (`data-request.md`, `general-controls.md`, `geographic-risk.md`, `industry-risk.md`, `method-and-instruction.md`, `risk-appetite.md`, `risk-factors.md`, `scales-and-scoring.md`, `specific-controls.md`, `typologies.md`, `workbook-layout.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Method and quality bar (blueprint sections 1–14)

> **Status: stable.** Built on the team's own proven material: the typology-based BWRA report template, the nine-step method instruction, the BWRA Excel tools, the general controls template, the typology library, the industry risk list and the geographic risk master, all checked against many delivered reports. Three points are less settled and are flagged where they occur. (1) Older team material and some client instructions use "Moderate" for the second risk level; the library default is "Normal". (2) The team's material holds three slightly different residual risk matrices; the default is the one in `_core/risk-scales.md`. (3) The risk appetite variant rests on a single delivered example. The defaults below follow `_core/risk-scales.md`, and `references/scales-and-scoring.md` shows the alternatives as named variants.

Load `_core/house-standards.md`, `_core/request-context.md` and `_core/output-formats.md` with this blueprint. This file only sharpens them.

### 1. Purpose and outcome

The BWRA answers one question for the board and the specially appointed executive (SAE; Sw. *särskilt utsedd befattningshavare*, SUB): **how, and how much, could our products and services be used for money laundering or terrorist financing, and is what we do about it enough?**

It has two objectives, and the report says so in its introduction:

1. **Basis for mitigating measures.** It identifies and rates the inherent ML/TF risk in products and services, customers, geography and distribution channels. These risks then drive customer due diligence, customer risk rating (CRR), transaction monitoring (TM) scenarios, training and the control plan.
2. **Evaluation of mitigating measures.** It assesses the design and effectiveness of controls, general and specific, and so determines the residual risk. Residual risk outside appetite triggers an action plan with owners and deadlines.

Readers: the board and management (recipients), the CEO or the board (adopts it, as required by national rules and the client's governing documents), the SAE (owns the process and presents it `[VERIFY REFERENCE]`), the compliance officer (*centralt funktionsansvarig*, CFA, or MLRO; consulted), first-line AML operations (design controls from it) and the supervisor (reads it first in any inspection). It also serves as training material.

### 2. When to use / when not to use

**Use for**
- The annual BWRA update, or an event-driven update before a new or significantly changed product, a new market, new technology or a reorganisation.
- A first-time BWRA, for a new licence application or after a supervisory finding that the BWRA is missing or generic.
- A group BWRA that consolidates subsidiary and branch assessments in one template.
- Sub-deliverables on their own: the BWRA instruction, a general controls assessment, a country or industry risk list, or a risk appetite statement.
- A review of a client's existing BWRA. Use this blueprint as the benchmark and report findings in the house finding format.

**Do not use for**
| Need | Use instead |
|---|---|
| Sanctions or proliferation financing risk assessment (SRA) | `sanctions-risk-assessment`. Integrate as a section or appendix if the client wants one document. |
| Bribery and corruption, or fraud, risk assessment | `abc-risk-assessment`, `fraud-risk-assessment` (same engine and scales) |
| Gap analysis of the AML framework against the law | `gap-analysis` |
| Independent review or audit of AML compliance | `compliance-review-report` |
| AML policy, instruction or routine (other than the BWRA instruction) | `governing-documents` |
| Documenting or validating the CRR or TM models that the BWRA feeds | `model-documentation`, `model-validation-report` |
| Training on the BWRA results | `training-and-presentations` |

### 3. Inputs

**Minimum to start** (with the core brief fields in `_core/request-context.md`):

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| Institution type, licence and supervisor | Sets the regulatory layer, sector guidance and typical typologies | Brief, public register | Ask. Do not guess the licence. |
| Product and service list | The product chapter is the backbone of a typology-based BWRA | Client product list, website, terms | Draft from the public offering and mark each item `[TO CONFIRM]` |
| Customer segments (individuals, corporates, sole traders, associations) | Determines which customer risk factors apply | Brief, CRR documentation | Ask in the first message |
| Countries of operation and of customers | Geography chapter, cross-border exposure | Brief | Ask |
| Distribution channels (branch, remote, agents, partners, outsourced KYC) | Channel chapter | Brief, onboarding process description | Ask |
| Previous BWRA and BWRA instruction | Continuity; the adopted method | Client | Use this blueprint's method; recommend an instruction |

**Needed for a complete deliverable**

| Input | Why | Usual source | If missing |
|---|---|---|---|
| Data request answers (counts per risk factor, volumes, cross-border flows, SARs, CRR distribution) | Exposure and probability; without data the rating is opinion | `references/data-request.md` | Rate qualitatively, mark `[DATA NEEDED]`, report the gap as a finding |
| SAR and alert statistics | Internal typologies; back-testing of CRR and TM | AML operations | State the limitation; recommend an annual SAR analysis |
| CRR model description, TM scenario list | Link between risk factors, CRR and detective controls | Model owner | Finding: link not demonstrated; specific controls "not evidenced" |
| Governing documents, training records, second- and third-line and supervisory findings | General controls evidence | Compliance, internal audit | Rate affected subareas conservatively; never assume there are no findings |
| Workshop and interview notes | Rationale behind each rating | Our own documentation | Not optional |
| Risk appetite statement | Acceptability of residual risk | Board documents | Use the default mapping in section 7; recommend one |

### 4. Regulatory and professional anchors

State the regulatory baseline date in the report ("Regulatory status as of `{{date}}`") and remind the reader that the rules must be checked against the current version.

**EU baseline**
- Directive (EU) 2015/849 as amended by Directive (EU) 2018/843. Article 8 requires a documented, up-to-date risk assessment proportionate to nature and size, covering customers, countries or geographic areas, products, services, transactions and delivery channels. Annexes II and III list lower- and higher-risk factors. High-risk third countries (HR3C) are covered by Article 18a and Delegated Regulation (EU) 2016/1675 as amended.
- EBA/GL/2021/02 (ML/TF Risk Factors Guidelines): Title I on business-wide risk assessments, including inherent and residual risk; Title II sector guidelines `[VERIFY REFERENCE: numbering and later amendments, e.g. for crypto-asset service providers]`. EBA/GL/2022/05 on the AML/CFT compliance officer `[VERIFY REFERENCE]`.
- The Commission's supranational risk assessment (SNRA), whose threat and vulnerability ratings per product are the usual "general inherent risk" baseline.
- **EU AML package.** Regulation (EU) 2024/1624 (AMLR) applies from 10 July 2027 and contains a directly applicable business-wide risk assessment requirement that also covers the evasion of targeted financial sanctions `[VERIFY REFERENCE: article, expected Art. 10]`. AMLA (Regulation (EU) 2024/1620) will issue guidance on BWRA content. Directive (EU) 2024/1640 governs national risk assessments and supervision. Note in every BWRA what the package changes for the client `[VERIFY REFERENCE: current status]`.

**National layer through `{{jurisdiction}}`**: national AML act, supervisory regulations, national risk assessment (NRA), FIU publications.

*Sweden (worked example)*
- Act (2017:630) on measures against money laundering and terrorist financing (PTL), Chapter 2, Section 1: the general risk assessment (*allmän riskbedömning*) of products and services, customers, distribution channels and geographical risk factors. It must also use information from the entity's own reporting and from authorities. Further Chapter 2 provisions cover scope, documentation and updating `[VERIFY REFERENCE: section numbers]`. Ordinance (2009:92) `[VERIFY REFERENCE]`. Government bill 2016/17:173.
- Finansinspektionen's regulations FFFS 2017:11, Chapter 2 (sources, updating before new products and other changes) `[VERIFY REFERENCE: section numbers]`. Entities supervised by the County Administrative Boards or the Gambling Authority follow those authorities' regulations `[VERIFY REFERENCE]`.
- The national risk assessment and thematic NRAs from the coordination function (*Samordningsfunktionen*) `[VERIFY REFERENCE: current edition]`, the FIU's (*Finanspolisen*) annual report and bulletins, the Police list of particularly vulnerable areas, and SIMPT guidance on the general risk assessment.

**Professional anchors**: FATF Recommendation 1 (risk-based approach; since 2020 also proliferation financing risk) and its interpretive note; FATF risk-based approach guidance for the relevant sector; FATF typology reports and red-flag indicators; Wolfsberg Group FAQs on risk assessments; Basel Committee guidance where the client is a bank.

### 5. Method

The team's method has nine steps. They are written into the client's instruction (`references/method-and-instruction.md`) and run as an engagement with three client touchpoints: data request, workshops and consultation.

1. **Scope and method choice.** Confirm the entities (subsidiaries, branches), the assessment period and data reference date, the risk types (ML and TF always; sanctions as a separate SRA or an integrated section), the scales, and whether an adopted instruction exists. Collect last year's BWRA, the instruction, the CRR description, the TM scenario list, the governing documents and recent findings. *Why:* changing the method mid-engagement destroys comparability with last year.

2. **External monitoring and typology selection** (*omvärldsbevakning*). Go through the mandatory sources (SNRA, NRA, FIU reports, EBA, supervisor, FATF) and pick the client-relevant typologies from `references/typologies.md`. For each typology record the modus operandi, the ML phase (placement, layering, integration) or TF phase (collection, concealment and movement, use), the red flags and the source with page reference. *Why:* the typology, not the product label, carries the risk, and it is what controls must detect.

3. **Data request**, sent two to three weeks before the workshops (`references/data-request.md`). Data covers the previous calendar year or the position at year-end. *Judgement:* missing data is itself a finding about CRR and data quality. Never present estimates as facts.

4. **Workshops and interviews**, normally three. (a) *Inherent risk*, with product and process owners, AML operations and TM investigators. Ask how each product and customer group could be misused, what limitations exist, what alerts and SARs show, and what has changed. Allow about 90 minutes per business area, and send the pre-filled matrix and last year's version a week ahead. (b) *General controls*: each requirement answered Yes / No / Partly covered, with evidence. (c) *Specific controls*: red flag by red flag. Follow-up interviews (TM owner, HR, IT) close gaps. Minutes record participants by role and are part of the evidence trail.

5. **Inherent risk, ML and TF separately.** Start from the *general inherent risk* in external sources. Adjust for *product limitations*, which count only if they are hard system limits or evidenced in operation. Then weigh *probability* (exposure: customers, volumes, SARs) and *impact* (how much, how fast) to reach the *final inherent risk*, with a two-to-four-sentence justification. Customer risk factors are rated on incentive, characteristics and over-representation in investigations and SARs. A factor can be High in general and Normal for this client, but only with stated reasons. The risk factor catalogue with typical starting ratings is in `references/risk-factors.md`.

6. **Controls in two layers.** *General controls*: 13 subareas (15 when CDD and ODD are split into B2B and B2C) with efficiency requirements answered Y/N/PC. Each subarea and the overall level are judgements. A Non-existing critical subarea, such as model risk management or outsourcing, pulls the overall level down and is never averaged away (`references/general-controls.md`). *Specific controls*: for each red flag, the preventive and detective control, whether it is in place and whether it is effective, summarised as "4 of 5 red flags have effective controls" (`references/specific-controls.md`). *Combined strength* starts from the specific control, and the general level moves it by at most one grade (specific Strong with general Weak gives Adequate). *Why:* general controls show whether the framework can work at all; specific controls show whether the red flags are actually caught. A smurfing scenario must detect many small transactions, not only large ones.

7. **Residual risk and priority.** Apply the matrix in section 7, for ML and TF separately. Inherent risk is reduced by at most two levels (`_core/risk-scales.md` §3), and Very high to Normal needs a written motivation. Any manual override is documented. Then rate *exposure* (0–4) and set the priority: a High residual risk on a product with three customers is not the same priority as a Normal residual risk on the product carrying 80 % of volumes.

8. **Findings, actions and KRIs.** Every High or Very high residual risk and every Weak or Non-existing subarea gets a finding, a root cause, an action, an owner and a deadline. Check the links: BWRA risk factors used in CRR, TM scenarios covering the typologies, training built on the BWRA. Propose at least one KRI, with an early-warning level and an appetite limit, for every risk area with High or Very high residual risk and for Normal residual risk with very significant exposure (`_core/risk-scales.md` §7). The team's instruction model sets the action plan deadline at two months after adoption.

9. **Compile, consult, adopt, implement.** Write the report from the workbook, never the reverse. Consult the CFA/MLRO and let product owners verify facts. The BWRA is adopted by the CEO or the board, as required by national rules and the client's governing documents; the designated executive (SAE/SUB) owns the process and presents it `[VERIFY REFERENCE]`. It is reported to the board. Implementation means updating CRR, TM, KYC questions, training and the action plan, and agreeing the event-driven triggers and the next periodic update.

**Stop and ask** when: the client cannot say which products it offers; a product appears to be outside the licence; data suggests the CRR does not work (for example most SARs come from low-risk customers); or a rating would rest entirely on assumptions for a High or Very high factor.

### 6. Deliverable structure

#### 6.1 Main deliverable: BWRA report

The team's report order (`template.md`): 25–60 pages for a mid-sized institution, 12–20 for a small one. Write in the client's voice ("the Company has assessed…") when the client adopts the BWRA, which is the norm. In a review, write as the firm.

| Section | Purpose and content | Length / style |
|---|---|---|
| Decision and change log | Version, decided by, date, document owner, changes | Table |
| Executive summary | Conclusion first; one paragraph each on products, customers, geography and channels; general controls level; residual risks outside appetite; three to five key actions; one heat-map table | 1–3 pages, decisive |
| 1 Introduction | Background and purpose (legal basis, the two objectives); roles and responsibilities; scope | 1–2 pages |
| 2 Methodology | Method or reference to the instruction; criteria (scales); sources of information; sources of data and limitations; review and updates, assessment period | 2–4 pages |
| 3 Typologies and threats | ML: placement, layering, integration. TF: collection, concealment, transfer and movement, use. Only client-relevant typologies, with red flags | 3–10 pages, sourced |
| 4 Products and services | Summary table (ML/TF), then per product: about; risk description and red flags; risk assessment | 1–2 pages per product |
| 5 Customers | Who the customers are, numbers, data limitations, how CRR works; heat map; per risk factor: description, red flags, rating sentence | 0.5–1 page per factor |
| 6 Geography | Exposure by country group, country risk method, HR3C/HRC risk factors | 1–3 pages |
| 7 Distribution channels | Channels; risks (outcomes) and vulnerabilities (causes); rating | 1–3 pages |
| 8 Controls | General controls summary and a paragraph per subarea; specific controls per product and risk factor (red flag, controls, effectiveness) | 5–20 pages |
| 9 Residual risk | Summary table (inherent, general/specific/total controls, residual, ML and TF); the "so what"; findings, actions, KRIs | 2–4 pages |
| Sources; Appendices | Sources actually used. A General controls; B Exposure data; C Typology and red-flag register; D Country risk method; E Industry list; F Action plan | As needed |

**Rating sentence** (keep it; it makes the reasoning visible): "Based on a qualitative assessment of the above, [risk factor] typically represents a customer risk factor for `{{client_short}}` that is [Very high / High / Normal / Low] with regard to ML and [..] with regard to TF."

#### 6.2 Sub-deliverables

- **BWRA instruction (methodology)**, in the client's voice for adoption by the CEO or board: definitions, roles, risk areas, the nine steps, scales, aggregation, action plan, training and updates. Skeleton in `references/method-and-instruction.md`.
- **Assessment of general controls**, Excel appendix (`references/general-controls.md`).
- **Country risk list** and **industry risk list** (NACE/SNI; ML, TF and dual-use), used in the BWRA and as CRR inputs (`references/geographic-risk.md`, `references/industry-risk.md`).
- **ML/TF risk appetite statement**: three categories of inherent risk with mandates and limits, and an appetite for residual risk with KPIs (`references/risk-appetite.md`). This rests on one delivered example, so validate it before first use.

### 7. Scales, scoring and calculations

The default scales are those of `_core/risk-scales.md`. Full definitions, variants and Swedish terms are in `references/scales-and-scoring.md`. Use one set per deliverable, define it in section 2, and never mix sets.

**Inherent risk (ML and TF separately)**: Low / Normal / High / Very high, plus **Unacceptable** as the appetite boundary (prohibited by law or policy, never "mitigated"). Swedish: *Låg / Normal / Hög / Mycket hög / Oacceptabel*. "Moderate" and "Medium" are not used as risk levels. If a client's adopted instruction uses "Moderate" for level 2, use the client's version and record the deviation (`references/scales-and-scoring.md`).

| Level | Product, channel or geography definition | Customer risk factor definition |
|---|---|---|
| Low | Few or no identified threats and vulnerabilities, and/or very small exposure | Few or no incentives or characteristics indicating ML/TF |
| Normal | Identified threats and vulnerabilities, and the exposure is substantial | Identified incentives; characteristics include risks of such behaviour |
| High | The risk of use for ML/TF through identified threats and vulnerabilities is increased | Strong incentives; characteristics indicate increased risk; may be frequently represented in SARs |
| Very high | Clear and major vulnerabilities; risk at a very high level | Very strong incentives and/or characteristics; frequently represented in investigations and SARs |

**Control level**

| Level | Specific controls | General controls (per subarea) |
|---|---|---|
| Strong (*Stark*) | Fully address the inherent risk | Strong framework and well-functioning processes |
| Adequate (*Tillfredsställande*) | Adequately address the risk, with room to strengthen | Framework in place and working reasonably well; several shortcomings to improve |
| Weak (*Svag*) | Controls exist but do not adequately address the risk | Underdeveloped framework and/or ineffective processes |
| Non-existing (*Obefintlig*) | No controls identified | No framework and/or processes not in place in practice |

**Residual risk matrix** (default, from the team's BWRA workbook; combined control strength in columns)

| Inherent \ Controls | Strong | Adequate | Weak | Non-existing |
|---|---|---|---|---|
| Unacceptable | Unacceptable | Unacceptable | Unacceptable | Unacceptable |
| Very high | Normal (only if motivated) | High | Very high | Very high |
| High | Normal | Normal | High | Very high |
| Normal | Low | Low | Normal | High |
| Low | Low | Low | Normal | Normal |

Rules: specific controls lead, and general controls move the result by at most one grade. Inherent risk is reduced by at most two levels, and weak or non-existing controls can raise residual risk above inherent risk. Variants in the team's material are one grade at most, Low + Weak = Low, and residual never above inherent. Use them only if the client's adopted instruction says so (`references/scales-and-scoring.md`, section 4).

**Residual risk and appetite** (`_core/risk-scales.md` §7): Low and Normal are within appetite (*acceptabel*). High is outside appetite unless a time-limited action plan is approved by management (for example up to 6 months for a newly identified risk), with strengthened controls, an owner and a deadline. Very high is outside appetite and needs a board decision: remediate, restrict or exit. Unacceptable is never accepted: refuse or terminate. Required measure: Very high, extensive improvements; High, strengthened measures; Normal, analyse and improve where efficient; Low, accept and monitor. **KRIs:** at least one KRI, with an early-warning level and an appetite limit, for every risk area with High or Very high residual risk and for Normal residual risk with very significant exposure.

**Aggregation per risk area**: Low = 1, Normal = 2, High = 3, Very high = 4. Take the average residual value per area: 1.00–1.49 Low, 1.50–2.49 Normal, 2.50–3.49 High, 3.50–4.00 Very high. Report an Unacceptable item separately; never average it away. A single Very high factor may justify raising the area rating; say why.

**Exposure** (0–4): 0 None, 1 Very limited, 2 Small, 3 Significant, 4 Very significant. Base it on customer counts, share of customers, transaction volume and share of volume. Priority comes from residual risk and exposure together.

**Colours**: Low green, Normal yellow, High orange, Very high red, Unacceptable black or dark red. Controls: Strong green, Adequate yellow, Weak orange, Non-existing red. Always show the label as well.

### 8. Supporting artefacts

- **BWRA workbook** (`references/workbook-layout.md`): an inherent risk sheet per risk area with threat and vulnerability columns, general and specific control evaluations, and a residual risk overview with action and KRI columns. Every row has an ID (`T-01` typology, `P-01` product, `C-01` customer factor, `G-01`, `D-01`, `GC-01`, `SC-01`, `A-01`) that the report cites.
- **Data request** (`references/data-request.md`) and the **document request**.
- **SAR analysis**: per SAR, the risk class at detection, the triggering rule or manual detection, the product, the typology covered and any proposed rule change. If most SARs come from low-risk customers, that is a CRR finding.
- **TM and KYC coverage map**: typology or red flag → covered (Y/N/partly) → rule or KYC question → proposed change.
- **Workshop pack**: agenda, pre-filled matrix, last year's results, questions, minutes template.
- **Board summary**: three to six slides or a one-page memo following `_core/output-formats.md`, showing the heat map, the residual risks outside appetite and the decisions needed.

### 9. Writing rules specific to this deliverable

- **ML and TF are rated separately, always.** TF often involves small, legitimately sourced amounts. A product can be High for ML and Low for TF.
- **Describe the modus, not the label.** Weak: "Cards are high risk." Good: "Prepaid cards bought with cash can be loaded and used without identification. Criminal proceeds can then be spent or moved across borders without leaving a link to the purchaser."
- **Every rating has its reasons and its evidence**: source (external and internal), data point, workshop. State what data was missing.
- **Separate threats from vulnerabilities.** Threats are external and common to everyone offering the product. Vulnerabilities are internal and specific to the client's routines, systems and product design.
- **Give PEP/RCA, sanctions and FIU-reported customers a nuanced treatment.** PEP status "does not incriminate individuals but places the customer in a higher risk category". Sanctioned persons are Unacceptable, not Very high. Customers reported to the FIU need a rule (for example automatic High, and Unacceptable after repeated reports) that is stated in the CRR.
- **Show trends.** Compare with the previous BWRA and explain every material change. Example (invented figures): "430 customers (3 %) are rated high risk, compared with 11 % last year; the decrease is due to a changed definition of high-risk industry, not to a change in the customer base."
- **Name gaps as findings, not footnotes.** "The issue is not so much the exposure, which is expected to be low, but the lack of data to demonstrate it."
- **Keep the voice consistent.** In a client-adopted BWRA the firm is not mentioned in the body. Workshops are described as held "together with external expertise".
- **Do not copy country scores** from index providers into the report. Show the method and the result category.

### 10. Quality checklist

In addition to house-standards section 6:

- [ ] Every product in the client's product list appears, or its exclusion is explained.
- [ ] Typologies are client-relevant, sourced with page references, and linked to products and red flags.
- [ ] ML and TF are rated separately for every risk factor, each with a justification.
- [ ] Inherent ratings use client data (exposure) where it exists; data gaps are listed and treated as findings.
- [ ] All general control subareas are assessed with Y/N/PC evidence; the overall rating is reasoned, not averaged.
- [ ] Every red flag for each High or Very high factor has a preventive and/or detective control assessment.
- [ ] Combined controls and residual risk follow the stated matrix and rules; any deviation is motivated.
- [ ] The residual risk table matches the chapter texts and the workbook (same IDs, same levels).
- [ ] Every High or Very high residual risk and every Weak or Non-existing subarea has an action with owner and deadline.
- [ ] The BWRA → CRR → TM → training links are checked and reported.
- [ ] HR3C references reflect the current Delegated Regulation; FATF lists, sanctions and indices are dated.
- [ ] The AMLR/AMLA impact is noted; the regulatory status date is shown.
- [ ] The decision log, the adopting body and the next review date are filled in.

### 11. What makes it stand out

- **Typology-first.** Products are rated on how they can actually be misused (modus, phase, red flags), drawn from a maintained typology library built on FIU and NRA sources, not on abstract "product risk".
- **A traceable chain.** Typology → red flag → specific control (preventive or detective, in place, effective) → residual risk → action → KRI, with IDs across report and workbook. A supervisor can follow any risk from threat to remedy.
- **Two layers of controls.** Concrete efficiency requirements (for example "at least 95 % of relevant staff trained") separate "can the framework work?" from "is this red flag caught?".
- **Conservative, rule-based residual risk.** A fixed matrix, a cap on how far controls can reduce risk, and the specific-before-general rule stop the classic optimistic BWRA in which everything ends up Low.
- **Exposure-weighted prioritisation.** Residual risk is combined with volumes and customer numbers, so the action plan targets where money can actually flow.
- **Feedback from SARs and TM.** SAR back-testing by risk class and rule shows whether CRR and TM work. The findings go straight into scenario and model changes.
- **Ready-made national layer.** An SNI/NACE industry list (ML, TF and dual-use sanctions risk), a country risk method with dominant lists and a manual adjustment column, high-risk address and vulnerable-area factors, and sector typologies.
- **Decision-ready output.** A heat-map summary, residual risks mapped to appetite (within appetite / outside appetite unless a time-limited plan is approved / outside appetite with a board decision / never accepted) and an action plan with owners.

### 12. Common pitfalls

- Rating products from the product name, without typologies, data or limitations. The result is generic and fails supervisory review.
- Treating a control "on paper" as effective. Manual limits and limits that can be overridden need evidence.
- Averaging general controls: a Non-existing model risk management or outsourcing subarea cannot be offset by strong training.
- Reducing Very high to Low because "TM exists". The matrix and the two-grade cap prevent this.
- Customer risk factors in the BWRA that differ from those in the CRR model, or a CRR that ignores high-risk addresses and industries named in the BWRA.
- A BWRA that is backward-looking and not updated when products changed. Check the new-product approval process.
- Mixing scales ("Moderate" in one table, "Normal" in another), or mixing up inherent and residual in the executive summary.
- Copying last year's text without updating data, sources (current HR3C list, FATF lists) and typologies.
- Leaving residual results without consequences: no owner, no deadline, no KRI.
- Including client-identifying data in examples, or index scores copied from licensed sources.

### 13. Variants

**By client type**

| Client type | Emphasis |
|---|---|
| Bank, credit market company | Broad product catalogue (accounts, cash, payments, cards, loans, trade finance, correspondent accounts); corporate customer factors; many TM scenarios to map; group consolidation. |
| Payment or e-money institution | Acquiring, refunds and original credit transfers, e-wallets; payment facilitators and marketplaces as customers (MCC-based industry list); partner channels and outsourced KYC. The channel often drives residual risk. |
| Consumer credit, leasing | Loan layering and integration (early repayment, overpayment, third-party payers, refund to another account); point-of-sale channels; product limitations often lower the risk. |
| Investment firm, fund manager, platform | Deposits and withdrawals without investment, transfers between accounts, third-party deposits, complex structures. A small fund manager needs a short BWRA. |
| Life insurance and pension | Single premiums, early surrender, beneficiary changes; long-term, non-transferable products lower the risk. |
| Non-financial obliged entity (pawnbroker, gaming, dealer) | Table per product or transaction method: industry inherent risk → company-specific risk after limitations → controls → residual → improvement need → business volume. Applicability review of the supervisor's red flags. |
| Crypto-asset service provider | Mixers, peer-to-peer flows, unhosted wallets, crypto-to-cash, travel-rule data. |

**By size and maturity**: *small or first-time*: one workshop, qualitative controls, 12–20 pages, and a recommendation to adopt an instruction and a basic data set. *Mid-sized*: the full method. *Group*: one template per entity plus a consolidated group report. *After supervisory findings*: remediation status per finding, with the residual risk treated as outside appetite until actions are delivered. *Integrated financial crime assessment*: add sanctions, fraud and ABC as separate risk types on the same engine.

### 14. How the assistant should work

1. **Read the brief.** If missing, ask (at most five questions): institution type and licence; product list; customer segments and countries; whether a BWRA instruction and last year's BWRA exist; and which output (report, workbook, instruction, review). Then also ask for data request answers or say that the work will proceed with `[DATA NEEDED]` markers.
2. **Agree method and scales.** Use the client's adopted instruction if there is one; otherwise use this blueprint's defaults. State which matrix and labels apply.
3. **Produce in this order:** (a) the data request and workshop pack, if the engagement is at the start; (b) the typology selection; (c) the workbook rows or inherent risk tables per risk area; (d) the general and specific control evaluations; (e) the residual table, findings and actions; (f) the report text, executive summary last; (g) the board summary.
4. **Drafting without client data:** write the structure, typologies and generic risk descriptions, but leave every client fact, count and rating basis as `[DATA NEEDED: …]` or `[ASSUMPTION: …]`. Never present an invented rating as the client's assessment.
5. **Reviewing an existing BWRA:** test it against the checklist in section 10 and the pitfalls in section 12. Use the house finding format, and give the five most material improvements first.
6. **Stop and ask** when facts suggest a breach (for example sanctioned customers onboarded, or no SAR reporting at all), when products appear outside the licence, or when the client wants ratings lowered without evidence.

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: Business-wide ML/TF risk assessment (BWRA)

<!-- Skeleton of the main deliverable in final section order. Output language: {{language}}.
Swedish terms in parentheses come from the team's Swedish material. Use them when {{language}} = sv.
Guidance in [brackets] is removed before delivery. "Example:" lines are models of wording, not client facts.
Write in the client's voice when the client adopts the BWRA (author_of_record: client). -->

[Cover page]
**Business-wide risk assessment of money laundering and terrorist financing {{reporting_period}}** (*Allmän riskbedömning avseende penningtvätt och finansiering av terrorism*)
{{client_name}} · Document type: Risk assessment · Version {{version}} · {{date}} · Confidentiality: [confidentiality level, default Confidential]
Owner: [role, e.g. Specially Appointed Executive (*särskilt utsedd befattningshavare*)] · Adopted by: [CEO or board, as required by national rules and the client's governing documents]

#### Decision and change log (*Beslut- och ändringslogg*)

| Version | Decided by | Date | Document owner | Changes |
|---|---|---|---|---|
| {{version}} | [CEO / SAE / Board] | [YYYY-MM-DD] | [role] | [e.g. annual update [reporting period]; new product X added] |

Next periodic review: [date]. Regulatory status as of {{date}}.

#### Executive summary (*Sammanfattning*)

[One to three pages. Conclusion first. Keep it short and highlight the essentials. Use the heat map. Cover:
1. Overall risk: the inherent ML and TF risk for the business as a whole and the main drivers.
2. Products and services: which products carry the highest risk and why (typologies), with the exposure.
3. Customers: key risk factors and their exposure, plus any data limitations.
4. Geography: exposure to HR3C/HRC and other high-risk countries.
5. Distribution channels: the main vulnerabilities.
6. Controls: the overall level of general controls and the weakest subareas; specific controls that are Weak or Non-existing.
7. Residual risk: what lies outside appetite (High without an approved time-limited plan, Very high, Unacceptable).
8. The three to five most important actions, each with owner and deadline, and any decision required of the board.]

Example: "{{client_short}} assesses its overall inherent risk of being used for money laundering as High and for terrorist financing as Normal. The risk is driven mainly by [product], where [typology] allows [mechanism]. General controls are assessed as Adequate, but model risk management and outsourcing are Weak. As a result, the residual risk for [product] and for the customer risk factor [factor] is High and outside the risk appetite. The actions in section 9.3 shall be completed by [date]."

*Table 1: Summary of inherent risk, controls and residual risk*

| Risk area | Risk factor | Inherent ML | Inherent TF | General controls | Specific controls | Total controls | Residual ML | Residual TF |
|---|---|---|---|---|---|---|---|---|
| Products and services | [P-01 Product] | [Low/Normal/High/Very high] | | [Strong/Adequate/Weak/Non-existing] | | | | |
| Customers | [C-01 PEP/RCA] | | | | | | | |
| Geography | [G-01 Establishment in or significant connection to HR3C/HRC] | | | | | | | |
| Distribution channels | [D-04 Partners, agents, resellers] | | | | | | | |

[Figure: heat map of residual risk per risk area, ML and TF, with colour and label]

#### Table of contents

#### 1 Introduction (*Inledning*)

##### 1.1 Background and purpose (*Bakgrund och syfte*)

[Legal identity, licence and supervisor; the legal basis; the two objectives; inherent and residual risk.]

Example: "{{client_name}} ("{{client_short}}") is a [bank / payment institution / credit market company / …] under the supervision of {{supervisor}}. As such, {{client_short}} is subject to [the national AML act, e.g. Act (2017:630) on measures against money laundering and terrorist financing] and is thereby obliged to conduct a business-wide risk assessment (BWRA) of its money laundering (ML) and terrorist financing (TF) risks.

The BWRA shall include an assessment of how the products and services provided by {{client_short}} can be used for ML/TF and how great the risk is that this happens. It covers products and services, customer types, distribution channels and geographical risk factors. Account is also taken of information from {{client_short}}'s reporting of suspicious activity and transactions, and of information on ML/TF methods and other relevant information from authorities.

The extent of the BWRA has been determined with regard to the size and nature of {{client_short}} and the ML/TF risks assumed to exist. The first objective of the BWRA is to form the basis for {{client_short}}'s mitigating measures. The risk shall be assessed both before and after mitigating measures; EBA/GL/2021/02 specifically requires both inherent and residual risk. The second objective is therefore to evaluate the design and effective implementation of the mitigating measures in place and, on that basis, determine the residual risk."

##### 1.2 Roles and responsibilities (*Roller och ansvar*)

[Include if there is no separate instruction, or for a smaller company. Otherwise refer to the instruction.]

| Role | Responsibility in the BWRA |
|---|---|
| Board of Directors | Receives the results; sets the risk appetite |
| CEO or Board of Directors (as required by national rules and the client's governing documents) | Adopts the BWRA annually and when necessary `[VERIFY REFERENCE]` |
| Specially Appointed Executive (SAE; *särskilt utsedd befattningshavare*, SUB) | Owns the process: establishes the BWRA under the adopted method, approves data sources, presents it to the adopting body, reports results to the CEO and the Board; may appoint persons to carry out the work |
| Compliance officer / MLRO (*centralt funktionsansvarig*) | Is consulted before a new BWRA is adopted |
| AML operations / TM investigators | Provide information on alerts, SARs, modus and the controls performed |
| Product and process owners | Provide product terms, characteristics and controls in the business |
| IT / Data | Deliver data as specified by the SAE |
| [Branches / subsidiaries] | Contribute knowledge of local distribution and controls |

##### 1.3 Scope (*Omfattning*)

[Legal entities, branches and subsidiaries covered; assessment period; what is excluded and why. Expand if scope is affected in any way.]

##### 1.4 Abbreviations and definitions (*Förkortningar och definitioner*)

[Include if more than five terms. Typical terms: BWRA, CDD, ODD, EDD, CRR, TM, SAR/STR, FIU, HR3C, HRC, PEP, RCA, SAE, UBO, ML, TF.]

#### 2 Methodology (*Metod*)

##### 2.1 Method

[If a separate instruction exists: "The methodology for the BWRA is described in a separate instruction adopted by [body] on [date]." Then summarise it.]

Example: "The starting point for the BWRA is an assessment of how {{client_short}}'s products can be used for ML or TF, i.e. the typologies relevant to the products. Based on the typologies, each product undergoes an inherent risk assessment, focusing on how it can be used for ML/TF and which red flags exist. The typologies also feed into the customer risk assessment, which analyses which customers or groups of customers are associated with higher ML/TF risk, informed by the customer risk factors in [the national AML act and EBA/GL/2021/02]. Distribution channels and geographical risk are then assessed to determine the extent of exposure. To assess geographical risk, {{client_short}} uses [sources, see section 6]. Finally, the risks are assessed in light of the mitigating measures in place (residual risk)."

##### 2.2 Criteria for the risk assessment (*Kriterier för riskbedömningen*)

*Table 2: Inherent risk levels* (*inneboende risk*)

| Level | Definition |
|---|---|
| Low (*Låg*) | There are few or no identified threats and vulnerabilities through which {{client_short}} could be used for ML/TF, and/or the exposure is very small. |
| Normal (*Normal*) | There are identified threats and vulnerabilities through which {{client_short}} could be used for ML/TF, and the exposure is substantial. |
| High (*Hög*) | The risk that {{client_short}} is used for ML/TF through identified threats and vulnerabilities is increased. |
| Very high (*Mycket hög*) | The risk is at a very high level; there are clear and major vulnerabilities for this risk factor. |
| [Unacceptable (*Oacceptabel*)] | [Outside risk appetite by law or policy. No business relationship is established; existing relationships are terminated.] |

*Table 3: Level of control* (*kontrollnivå*)

| Level | Definition |
|---|---|
| Strong (*Stark*) | The identified controls and mitigating measures are considered to fully address the inherent risk. |
| Adequate (*Tillfredsställande*) | The controls adequately address the inherent risk, but there is room to strengthen them. |
| Weak (*Svag*) | There are controls, but they do not adequately address the inherent risk. |
| Non-existing (*Obefintlig*) | No controls or mitigating measures are identified for the inherent risk. |

*Table 4: Residual risk levels* (*kvarstående risk*)

| Level | Definition |
|---|---|
| Low | Few or no identified threats and vulnerabilities, and/or sufficient controls are in place to deal with them. |
| Normal | Identified threats and vulnerabilities exist; controls are generally considered to manage them, with room for improvement. |
| High | The risk is increased, and controls are not considered to manage it sufficiently. |
| Very high | The risk is very high, with clear and major vulnerabilities, and controls do not manage the risk. |

*Table 5: Residual risk matrix (combined general and specific controls)*

| Inherent \ Controls | Strong | Adequate | Weak | Non-existing |
|---|---|---|---|---|
| Very high | Normal (if motivated) | High | Very high | Very high |
| High | Normal | Normal | High | Very high |
| Normal | Low | Low | Normal | High |
| Low | Low | Low | Normal | Normal |

[Replace with the matrix in the client's adopted instruction if it differs. Never mix.]

Example: "When assessing residual risk, the method is conservative and aims to build a well-functioning AML/CTF process. An inherent risk is therefore normally not reduced by more than two grades. If the levels of general and specific controls differ, the specific control directs the total strength of controls, but the general controls may move it by at most one grade."

##### 2.3 Sources of information (*Informationskällor*)

Example: "{{client_short}} follows trends by analysing reports from authorities and organisations in [country] and international bodies, and monitors media events that may affect its work to prevent ML/TF. [Function], together with external expertise, has held workshops for external and internal analysis. The external analysis considered publications from FATF, the EBA, {{supervisor}}, the [national FIU] and [others]. Together, the group identified which of the threats, vulnerabilities and risk factors are relevant for {{client_short}}. To evaluate typologies and trends, the group also considered information from {{client_short}}'s transaction monitoring and suspicious activity reports (SARs)."

[List the workshops: date, topic and participants by role.]

##### 2.4 Sources of data (*Datakällor*)

[Internal data used: customer due diligence data, CRR distribution, TM and SAR data, transaction volumes; reference date; who processed the data. **State data limitations** and their effect on the assessment.]

##### 2.5 Review and updates (*Översyn och uppdatering*)

Example: "{{client_short}} shall evaluate its BWRA regularly, at least once a year, and update it as necessary. It shall also be updated before {{client_short}} offers new or significantly changed products or services, enters new markets, uses new technology or makes other relevant changes to its operations. The SAE is responsible for review and updates. The assessment period for this BWRA is [period]; unless otherwise stated, data refers to [date]."

#### 3 Typologies and threats (*Typologier och hot*)

[Only typologies relevant to {{client_short}}'s products. Each typology: description of the modus, why it is attractive, red flags (transaction patterns; customer behaviour and traits), linked products, source. See references/typologies.md.]

Example: "The first step of the risk assessment is to identify and evaluate how a perpetrator may exploit {{client_short}} for ML or TF, i.e. the typologies relevant to {{client_short}}'s products. The typologies are based on external and internal sources. Each typology includes relevant red flags related to transaction patterns and/or customer behaviour or traits."

##### 3.1 Typologies and threats for money laundering (*penningtvätt*)

###### 3.1.1 Introduction
[Placement, layering and integration explained briefly; which phase {{client_short}}'s products are most exposed to.]

###### 3.1.2 Placement (*Placering*)
[List of typologies, then one subsection each.]

###### 3.1.2.1 [Typology, e.g. Cash-intensive businesses]

[Modus. Why attractive. Red flags:]
- [Red flag]
- [Red flag]

###### 3.1.3 Layering (*Skiktning*)
###### 3.1.3.1 [Typology, e.g. Loans: disbursement and repayment to and from different accounts]

###### 3.1.4 Integration (*Integrering*)
###### 3.1.4.1 [Typology, e.g. Repayment of loans with criminal proceeds]

##### 3.2 Typologies and threats for terrorist financing (*finansiering av terrorism*)

[TF often uses small amounts, which may come from legitimate sources such as salary, student loans or benefits.]

###### 3.2.1 Collection of funds (*Insamling*)
###### 3.2.2 Concealment of funds (*Förvaring och döljande*)
###### 3.2.3 Transfer and movement of funds (*Överföring och förflyttning*)
###### 3.2.4 Use of funds (*Användning*)

[Optional 3.3 Sanctions circumvention, if sanctions are integrated in the BWRA; otherwise refer to the separate SRA.]

#### 4 Products and services (*Produkter och tjänster*)

##### 4.1 General information, relevant exposure and summary

[List of products; exposure per product (customers, volumes, share). Overall product risk level.]

*Table 6: Products and services – inherent risk*

| ID | Product / service | Customers (no., share) | Volume [currency] {{reporting_period}} | Inherent ML | Inherent TF |
|---|---|---|---|---|---|
| P-01 | [Product] | [DATA NEEDED] | [DATA NEEDED] | | |

##### 4.2 [Product 1]

###### 4.2.1 About the product
[How the product works: who can use it, amounts, frequency, cash, cross-border, third parties, remote access, limitations.]

###### 4.2.2 Risk description and red flags
[How the product can be used for ML/TF, with reference to typologies T-xx and the phases. Product limitations and whether they are system-enforced. Red flags.]

###### 4.2.3 Risk assessment

Example: "{{client_short}} has identified [number] typologies through which ML could occur when using [product], mainly in the [layering] phase. Considering [limitation] and the exposure of [n customers / volume], {{client_short}} assesses that [product] has a [High] inherent risk for ML. No / [number] typologies for TF have been identified; the inherent risk for TF is assessed as [Low]."

| | ML | TF |
|---|---|---|
| [Product 1] | | |

[Repeat 4.x for each product.]

#### 5 Customers (*Kunder*)

##### 5.1 General information, relevant exposure and summary

[Who the customers are (individuals, corporates, sole traders, associations), numbers, CRR model (risk indicators, weighting), KYC data limitations. If no CRR model exists, record it as a finding for chapter 9.]

*Table 7: Customer risk factors – inherent risk*

[IDs follow the catalogue in `references/risk-factors.md`. Keep the catalogue IDs; do not renumber. Add only the factors that are relevant to the client.]

| ID | Customer risk factor | Customers (no., share) | Inherent ML | Inherent TF |
|---|---|---|---|---|
| | **Individual and corporate customers** | | | |
| C-01 | PEP/RCA (*person i politiskt utsatt ställning / familjemedlem eller känd medarbetare*) | | | |
| C-02 | Customer, beneficial owner or representative convicted of, or associated with, income-generating crime (adverse media) | | | |
| C-03 | High-risk address (*högriskadress*) | | | |
| C-04 | Address in a particularly vulnerable area (*särskilt utsatt område*) | | | |
| C-05 | Low taxed income relative to activity | | | |
| C-06 | Customers previously reported to the FIU | | | |
| C-07 | Customers on EU or UN sanctions lists | | Unacceptable | Unacceptable |
| | **Specific to individuals** | | | |
| C-12 | Post box address | | | |
| | **Specific to corporate customers** | | | |
| C-14 | Complex or unusual ownership or control structure | | | |
| C-15 | High-risk industry | | | |
| C-16 | New companies and companies with new owners or representatives | | | |
| C-17 | [Non-profit organisations, foundations] | | | |

##### 5.2 Risk factors relevant to individual and corporate customers

###### 5.2.1 [Risk factor, e.g. PEP/RCA]

**Risk description and red flags**
[Why the factor indicates risk; which typologies it relates to; red flags.]

**Risk assessment**
Example: "Based on a qualitative assessment of the above, a PEP/RCA typically represents a customer risk factor for {{client_short}} that is [High] with regard to ML and [Normal] with regard to TF."

##### 5.3 Risk factors specific to individuals
##### 5.4 Risk factors specific to corporate customers

#### 6 Geography (*Geografi*)

##### 6.1 General information and exposure

[Countries where products are offered and customers are based; share per country group; prohibited countries under policy; country risk method and sources (dominant lists, indices, manual adjustment). Do not reproduce index scores.]

*Table 8: Geographic exposure*

| Country group | Customers {{reporting_period}} (no., %) | Customers previous year (no., %) | Cross-border volume (in/out) |
|---|---|---|---|
| Home market | | | |
| Other EU/EEA | | | |
| Normal-risk countries outside EU/EEA | | | |
| High-risk countries (HRC) | | | |
| High-risk third countries (HR3C, EU list) | | | |
| Prohibited / sanctioned | 0 [TO CONFIRM] | | |

##### 6.2 Risk assessments

*Table 9: Geographic risk factors*

| ID | Geographic risk factor | Inherent ML | Inherent TF |
|---|---|---|---|
| G-01 | Customer established or resident in HR3C/HRC | | |
| G-02 | Transactions to or from HR3C/HRC | | |
| G-03 | Beneficial owner or ownership structure in HR3C/HRC | | |

###### 6.2.1 [G-01 Establishment in, or significant connection to, HR3C/HRC]
[Risk description, red flags, rating sentence.]

#### 7 Distribution channels (*Distributionskanaler*)

##### 7.1 General information
[How {{client_short}} meets its customers, at onboarding and in use: physical meeting, remote onboarding with electronic ID, partners and agents, resellers, outsourced KYC, self-onboarding.]

##### 7.2 Available channels

##### 7.3 Risk factors

*Table 10: Risks and vulnerabilities in distribution*

| Risks (what may happen) | Vulnerabilities (why) |
|---|---|
| A customer outside the risk appetite is onboarded | Insufficient knowledge of the person distributing the service |
| Collected CDD is incomplete or incorrect | Insufficient routines for distributors; conscious disregard of routines |
| [ ] | Deficiencies in systems transmitting KYC data; incentives to onboard (commission) |

##### 7.4 Risk assessment

| ID | Channel | Inherent ML | Inherent TF |
|---|---|---|---|
| D-04 | [Partners, agents, resellers] | | |
| D-02 | [Remote onboarding with secure electronic identification] | | |

#### 8 Controls (*Kontroller*)

Example: "{{client_short}} separates the control assessment into general controls and specific controls. The general controls show the overall capacity of the AML/CTF framework to manage risks; the specific controls show whether specific red flags are captured. Section 8.1 assesses the general controls and section 8.2 the specific controls. Chapter 9 uses both to determine residual risk."

##### 8.1 General controls (*Generella kontroller*)

[Overall assessment first. The assessment was made qualitatively in workshops, against a list of requirements for efficiency (Appendix A).]

*Table 11: Summary of effectiveness of general controls*

| ID | Subarea | Effectiveness assessment |
|---|---|---|
| GC-01 | Governance and organisation | [Strong/Adequate/Weak/Non-existing] |
| GC-02 | Awareness and education | |
| GC-03 | Business-wide risk assessment and general risk management | |
| GC-04 | Customer risk rating | |
| GC-05 | Model risk management | |
| GC-06 | Employees (protection, suitability, whistleblowing) | |
| GC-07 | General (non-risk-based) CDD – onboarding [B2B / B2C] | |
| GC-08 | General (non-risk-based) ongoing due diligence (ODD) [B2B / B2C] | |
| GC-09 | Transaction monitoring (general) | |
| GC-10 | Investigation and SAR reporting | |
| GC-11 | Offboarding and other measures for customer-specific risk management | |
| GC-12 | Outsourcing and continuity planning | |
| GC-13 | Internal controls and oversight | |
| | **Overall assessment** | |

###### 8.1.1 Governance and organisation
[One paragraph per subarea: what works, what does not, the evidence, the rating.]

[8.1.2–8.1.13 as in Table 11]

##### 8.2 Specific controls (*Specifika kontroller*)

###### 8.2.1 Evaluation of specific controls on product risk

| ID | Product | Level of control |
|---|---|---|
| SC-P01 | [Product 1] | |

###### [Product 1]

Example: "Several red flags relating to [product] are relevant to the effectiveness of specific controls, mainly concerning KYC and transaction monitoring. The table shows whether controls are in place to detect and act on each red flag."

| Red flag | Preventive / detective controls in place | Assessment of effectiveness |
|---|---|---|
| [High-value deposits, at least over time] | [e.g. TM scenario on unusually large deposits over time; alerts investigated] | [Strong/Adequate/Weak/Non-existing] |
| [Withdrawal shortly after deposit] | [e.g. none specific] | [Non-existing] |

Example conclusion: "4 of 6 red flags are covered by effective controls. Overall, the specific controls for [product] are assessed as [Adequate]."

###### 8.2.2 Evaluation of specific controls on customer and geographic risk

| ID | Specific control | Level of control |
|---|---|---|
| | **Customer risk** | |
| SC-C01 | PEP/RCA | |
| SC-C02 | Convicted or associated with crime (adverse media) | |
| SC-C03 | High-risk address, incl. post box address | |
| SC-C04 | Address in particularly vulnerable area | |
| SC-C05 | Low taxed income | |
| SC-C06 | Reported to the FIU | |
| SC-C07 | Sanctions lists | |
| SC-C08 | Complex or unusual ownership or control structure | |
| SC-C09 | High-risk industry | |
| SC-C10 | New companies, new owners or representatives | |
| | **Geographic risk** | |
| SC-G01 | Connections to HR3C/HRC | |

###### [SC-C01 PEP/RCA]
[What is done at onboarding and ongoing (questions, screening, frequency, EDD, approval); gaps; rating. Example: "There is currently no specific routine for adverse media screening, automatic or manual. Manual searches are performed only when a customer is caught by other alerts. The specific control is assessed as Weak."]

###### 8.2.3 Evaluation of specific controls on distribution channels
[If relevant to the method.]

#### 9 Residual risk (*Kvarstående risk*)

##### 9.1 Summary of residual risk

Example: "All residual risks have been assessed in line with the methodology [no manual overrides were deemed necessary / the following overrides were made: …]. An acceptable residual risk means that the AML/CTF framework and the specific controls are sufficient to manage the inherent risk, provided they are applied effectively in each individual case."

*Table 12: Residual risk results*

| Risk area | ID | Risk factor | Inherent ML | Inherent TF | General | Specific | Total | Residual ML | Residual TF | Appetite |
|---|---|---|---|---|---|---|---|---|---|---|
| Products | P-01 | | | | | | | | | [Within appetite / Outside appetite unless a time-limited plan is approved / Outside appetite: board decision / Never accepted] |
| Customers | C-01 | | | | | | | | | |
| Geography | G-01 | | | | | | | | | |
| Channels | D-04 | | | | | | | | | |

*Table 13: Aggregated residual risk per risk area* [average value 1–4 per area, see section 2.2]

| Risk area | ML (value, level) | TF (value, level) | Change from previous BWRA |
|---|---|---|---|
| Products and services | | | |
| Customers | | | |
| Geography | | | |
| Distribution channels | | | |

##### 9.2 Conclusions

[Link inherent risk to controls. Give the "so what": what {{client_short}} should do with the results, and what has already started. Typical findings: data limitations that prevent a sound exposure assessment; lack of linkage between parts of the framework (e.g. CRR uses risk indicators other than those in the BWRA); deficiencies in the control environment.]

##### 9.3 Actions and key risk indicators

*Table 14: Action plan*

| ID | Finding / risk factor | Action | Owner (function) | Deadline | Priority |
|---|---|---|---|---|---|
| A-01 | [P-01 residual ML High: no TM scenario for withdrawal after deposit] | [Implement and tune scenario] | [TM owner] | [date] | [Immediate / within 3 months / within 6–12 months] |

*Table 15: Proposed key risk indicators*

| KRI | Definition and frequency | Threshold (green / amber / red) | Linked risk factor |
|---|---|---|---|
| [Share of customers with complete KYC] | [quarterly] | [>95 % / 90–95 % / <90 %] | [GC-07] |

#### Sources (*Källförteckning*)

**EU regulations and directives** [e.g. Directive (EU) 2015/849 as amended; the current Delegated Regulation on high-risk third countries; Regulation (EU) 2024/1624 where relevant]
**Other official EU material** [EBA/GL/2021/02; the Commission's supranational risk assessment]
**National regulation** [e.g. Act (2017:630); FFFS 2017:11; Government bill 2016/17:173]
**Other sources** [national risk assessment; FIU annual report and bulletins; FATF guidance; Basel AML Index (edition, retrieval date); national AML institute guidance; only sources actually used, with retrieval dates]

#### Appendices (*Bilagor*)

- Appendix A – Assessment of general controls (requirements for efficiency, Y/N/PC, comments)
- Appendix B – Exposure data and data limitations
- Appendix C – Typology and red-flag register with TM/KYC coverage
- Appendix D – Country risk method and list (categories only)
- Appendix E – Industry risk list
- Appendix F – Action plan (if kept as a separate document)

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
- `{{jurisdiction}}` — the jurisdiction(s) (brief: engagement.jurisdictions)
- `{{language}}` — the output language (brief: engagement.output_language)
- `{{reporting_period}}` — the reporting period (brief: engagement.reporting_period)
- `{{supervisor}}` — the supervisor (brief: engagement.supervisor)
- `{{version}}` — the document version (brief: engagement.version)
