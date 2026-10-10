# FCP blueprint: Proposal and RFP response

Blueprint `proposal` v1.1 (stable) from the FCP blueprint library, as ANTON skill `fcp-bp-proposal`. Produces client proposals (offert, uppdragsförslag) for financial crime prevention engagements, such as AML/CTF model validation, business-wide risk assessments, AMLR readiness and maturity assessments, gap analyses, sanctions and fraud work, pre-studies and managed services. The output is a letter-style Word proposal or a PowerPoint proposal deck, or a structured response to a request for proposal (RFP) or procurement questionnaire. Covers summary, background and identified needs, scope and exclusions, method, plan, team, structural price model, assumptions, value, references, terms and signature, with a CV appendix. Use when a client asks for an offer, when an RFP arrives, or when an engagement moves into a new phase. Firm facts, CVs and references come from the firm profile. Client and engagement facts come from the request brief. The library never holds rates, margins or discounts.

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
- `references/…` inlined below: `proposal-inputs.md`.
- The other `references/…` catalogues (`method-modules.md`, `phrase-bank.md`, `pricing-structure.md`, `rfp-response.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Method and quality bar (blueprint sections 1–14)

Load this blueprint together with `_core/house-standards.md`, `_core/request-context.md` and `_core/output-formats.md`. A proposal is written as the issuing firm (`author_of_record: firm`), so it uses "we" and `{{firm_name}}`. The house rule "never market ourselves inside a deliverable" does not apply here, but the rules on evidence, precision and never inventing client facts apply in full. Method descriptions, pricing structure, RFP handling, model phrases and the proposal brief are in `references/`.

### 1. Purpose and outcome

A proposal (*offert*, *uppdragsförslag*) turns a need the client has expressed into a concrete offer that the client can accept by signing it. The first page or slide must let the reader answer seven questions:

1. What will we get, meaning which deliverables, how many and in what format?
2. Why is it needed, meaning which need or requirement does it address?
3. How will it be done?
4. When will it be done, and how long will it take?
5. Who will do it, and who is responsible for quality?
6. What will it cost, and how is it charged?
7. What must we provide ourselves, and what is not included?

**Readers.** The person who asked for the offer, typically the head of compliance, head of FCP, the AML officer or MLRO, the CRO or the CEO. Behind them are the people who approve budget (management, sometimes the board) and, in an RFP, a procurement function that scores answers against criteria.

**Decision it enables.** Accept and sign, or shortlist. The proposal often doubles as the client's internal material for budget approval.

**It is also a contract document.** Together with the issuing firm's general terms, the proposal defines the engagement: "The engagement is governed, in addition to what is stated in this proposal, by {{firm_name}}'s general terms and conditions" (*Uppdraget regleras, utöver vad som nämns i offerten, i enlighet med {{firm_name}}s allmänna villkor*). Scope, exclusions, assumptions and price basis must therefore be precise enough that both parties can later tell whether something was included.

**It prepares delivery.** The plan, the document request and the contact model become the kick-off agenda.

### 2. When to use / when not to use

Use this blueprint for:

- A written offer after a needs dialogue. This is the most common case, usually as a PowerPoint deck.
- A response to an RFP, *offertförfrågan*, tender or supplier questionnaire.
- A call-off (*avrop*) under a framework agreement.
- A follow-on offer, for example from pre-study to implementation, from an initial validation to annual or continuous validation, or from phase 1 to phase 2.
- The "commercial offer" slide or section at the end of a pitch deck.

| If the need is… | Use instead |
|---|---|
| Introducing the firm, the team or a service with no priced offer | `firm-and-team-presentation` |
| A topical meeting deck on a regulatory change that ends with "next steps" | `firm-and-team-presentation` (insight-led pitch); add a proposal afterwards |
| Teaching a topic (training, webinar, conference talk) | `training-and-presentations` |
| The project plan, steering model and status reporting after signature | `project-plans-and-governance` |
| The engagement deliverable itself | The relevant area blueprint, e.g. `model-validation-report`, `aml-ctf-risk-assessment`, `gap-analysis` |
| Drafting a framework agreement, data processing agreement or other contract | The firm's legal function. This blueprint only refers to the general terms. |
| Internal price calculation | The firm's pricing tool. This blueprint describes its structure only (`references/pricing-structure.md`). |

### 3. Inputs

Source legend: **[Brief]** is a field in `_core/request-context.md`. **[Proposal brief]** is a field in the `proposal:` block defined in `references/proposal-inputs.md`. **[Profile]** is a field in the firm profile (the firm profile supplied with the request). The full list of profile fields is in `references/proposal-inputs.md`.

#### Minimum to start

| Input | Source | Why it is needed | If missing |
|---|---|---|---|
| Task, output format and language | [Brief] `request.task`, `request.output`, `engagement.output_language` | Decides Word, PowerPoint or RFP format and the language | Ask |
| Issuing firm | [Brief] `issuing_firm.name` and [Profile] legal name | Cover, terms clause, signature block | Ask |
| Client legal name, defined term and institution type | [Brief] `client.legal_name`, `client.defined_term`, `client.institution_type` | Cover, defined term, proportionality, variant | Ask |
| Jurisdiction | [Brief] `engagement.jurisdictions` | Regulatory driver and national layer | Ask |
| The need in one to three sentences, and its trigger | [Proposal brief] `need`, `trigger` | "Identified needs" section and summary | Ask. Never invent the client's situation. |
| Components in scope | [Proposal brief] `components` | Scope, estimate, deliverables | Ask. Example: "TM model, CRR model for natural and legal persons, screening". |

#### Needed for a complete proposal

| Input | Source | Why it is needed | If missing |
|---|---|---|---|
| Client context (size, products, segments, channels, geographies, systems and vendors, known issues) | [Brief] `client.*` | Proportionality and a credible "needs" section | Mark `[TO CONFIRM: …]` where the text depends on it |
| Driver and deadline; status of each component (in production, planned go-live, last validated) | [Proposal brief] `trigger`, `deadline_driver`, `components[].status` | Background; full or conceptual-only scope | `[TO CONFIRM]`; propose exclusions as `[ASSUMPTION]` |
| Known exclusions, client wishes, start, end and decision date | [Proposal brief] `exclusions`, `client_wishes`, `start`, `end`, `decision_date` | Exclusions (*Avgränsningar*), plan | Plan in relative weeks; mark dates `[TO CONFIRM]` |
| Proposed team with titles | [Brief] `issuing_firm.team`; [Profile] people and CVs | Team section, CV appendix | `[DATA NEEDED: team]`. Never invent names. |
| Price model and price figures (total, or hours and rates) | [Proposal brief] `pricing.*`, taken from the firm's pricing tool after internal approval | Price section | `[DATA NEEDED: price from pricing tool]`. The assistant never sets a price. |
| Offer validity date | [Proposal brief] `valid_until`; [Profile] standard validity | Contacts and terms section | `[DATA NEEDED: validity date]` |
| RFP documents, requirement list and evaluation criteria | [Proposal brief] `rfp.*` | Structure and compliance matrix | Ask for the documents before drafting |
| References with consent status; firm legal details, general terms reference, signatory | [Profile] reference, identity and commercial fields | References, contacts, terms and signature | Anonymise or omit references; `[DATA NEEDED]` for legal details |
| Visual profile | [Brief] `issuing_firm.profile` | Layout | Clean, unbranded output and a note that branding is pending |

### 4. Regulatory and professional anchors

A proposal makes regulatory statements: why the work is needed, which requirement it supports and when that requirement applies. They must be as accurate as in any deliverable. Note "Regulatory status as of {{date}}" in the draft, and verify every date and article before sending.

**EU baseline**

- The current AML/CTF directive framework, i.e. Directive (EU) 2015/849 as amended, as transposed nationally.
- The EU AML package: the AMLR (Regulation (EU) 2024/1624), which applies from 10 July 2027; the AMLA Regulation (Regulation (EU) 2024/1620); and AMLD6 (Directive (EU) 2024/1640). Until the AMLR applies, national law remains the binding baseline. Level 2 measures are still being finalised `[VERIFY REFERENCE: status as of {{date}}]`.
- Regulation (EU) 2023/1113 on information accompanying transfers of funds and certain crypto-assets.
- EBA guidelines that commonly drive engagements: ML/TF risk factors (EBA/GL/2021/02), the AML/CFT compliance officer (EBA/GL/2022/05), outsourcing (EBA/GL/2019/02, relevant to managed services) and restrictive measures (EBA/GL/2024/14 and EBA/GL/2024/15) `[VERIFY REFERENCE: application date of the restrictive measures guidelines]`.

**National layer via `{{jurisdiction}}`.** Name the national AML act, the supervisory regulations and the supervisor (`{{supervisor}}`). For Sweden:

- The Money Laundering Act, *lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism* (PTL).
- Finansinspektionen's regulations FFFS 2017:11. These require the firm to have procedures for validating models used in AML/CTF work, i.e. checking that parameters and data are correct and complete and that assumptions are appropriate and relevant `[VERIFY REFERENCE: chapter and section; team material cites ch. 6 § 15]`.
- Non-financial obliged entities have other supervisors, for example the county administrative boards (*länsstyrelserna*) or the gambling authority. Check `{{supervisor}}`.

**Industry and professional standards**

- AML model validation: the team's method draws on industry guidance that builds on the US model risk guidance (OCC Bulletin 2011-12 / SR 11-7), and on credit-risk validation practice. Present it as industry practice, not as EU law `[VERIFY REFERENCE]`.
- FATF Recommendations, Wolfsberg guidance and ISO 37001 (anti-bribery management systems), where relevant to the service offered.

**Commercial and legal**

- **Public procurement.** For a contracting authority, Directive 2014/24/EU applies, and in Sweden *lag (2016:1145) om offentlig upphandling* (LOU). The tender documents rule.
- **Personal data.** CVs are personal data under the GDPR (Regulation (EU) 2016/679). Use only CVs the profile marks as publishable.
- **Independence.** A validation or review must be independent of those who developed or operate the model or process. Check this first (Method step 1), and state it: *Valideringen genomförs oberoende från modellutveckling och användning*.

### 5. Method

#### Step 1. Qualify and frame the request

Before writing anything, establish:

- Who is asking.
- What triggered the request, for example a supervisory finding, a new model going live, AMLR, an audit remark, growth or a new licence.
- The deadline for the offer and the client's decision date.
- Whether the request is competitive (RFP) or a single-source request.
- Any budget signal, and the evaluation criteria.

**Why.** The trigger decides the framing of the whole proposal. The decision process decides how much decision material the summary must carry.

**Judgement calls**

- **Independence and conflicts.** If we built, documented or operate the model or process to be reviewed, do not offer an independent validation of it without a documented safeguard, such as a separate team and a separate quality reviewer. Otherwise decline or reframe. RFPs explicitly score "quality assurance and independence".
- **Feasibility.** If the client's timeframe cannot fit the full scope, offer a deliberately limited scope with a stated exclusion (wording in `references/phrase-bank.md`). Never promise the full scope on a short timeline.
- **First-time engagements.** A first validation often finds no model risk framework, no model documentation and unclear ownership. Offer the prerequisites first, or as a separate component, and say why.

#### Step 2. Understand the need and restate it

Use the needs dialogue, the client's brief and any documents supplied. Restate the need in the client's own terms in "Identified needs" (*Identifierade behov*): "{{client_short}} has identified a need for support in the validation of its AML models for transaction monitoring (TM) and customer risk classification (CRC)" (*har identifierat ett behov av stöd i…*). Then link it to the requirement it supports and to the client's own governing documents, for example the business-wide risk assessment (BWRA) that the models must reflect.

**Why.** Clients sign proposals that show they were heard, and every deliverable should answer a stated need. Facts about the client come only from the brief; otherwise write `[TO CONFIRM: …]`.

#### Step 3. Scope by component and set the exclusions

Break the work into components that can be described, estimated and delivered separately:

- per model (TM; CRR/CRC, possibly split into natural and legal persons; PEP and sanctions screening)
- per risk type (ML/TF, sanctions, fraud, ABC)
- per legal entity, branch or country
- per phase

For each component, write one or two sentences on what it is. Example: "The model is used to assess ML/TF risk by dividing customers into risk classes. The customer's risk class determines the extent, depth and frequency of controls." Then state the deliverable and any exclusion, with its reason.

**Typical exclusions** (wording in `references/phrase-bank.md`):

- A model not yet in production gets a conceptual validation only, so output and effectiveness are not assessed.
- No mapping against a specific set of guidelines.
- Collecting information missing from the submitted material is not included and is billed separately.
- Implementation work is not included in a pre-study.

**Shared or vendor-owned systems.** When several entities use a system owned by a parent, partner bank or vendor, mark which parts the system owner is responsible for and which the client must follow up. Offer the shared parts as a coordinated component, priced per entity with and without coordination.

#### Step 4. Choose and tailor the method module

Pick the module from `references/method-modules.md`, for example model validation, BWRA, AMLR discovery, pre-study, sanctions guideline implementation, fraud pilot, managed services, second opinion, workshops or ABC services. Describe it in client terms with four elements:

1. **Steps**, numbered, each with its purpose.
2. **The assessment framework**, as proof of rigour. For model validation this is the assessment-area table (primary area, secondary area, explanation). For maturity work it is the framework's domains. For a BWRA it is the three pillars of inherent risk, controls and residual risk.
3. **Client interactions**: document and data request, kick-off, interviews, one to three validation workshops, a fact-check meeting on preliminary observations, and a results presentation.
4. **Deliverable format**, for example "one validation report per model in Word/PDF and a presentation of the results".

**Why.** This is where the client sees a non-generic product. Tie the method to the client's components and show that the BWRA drives the models, controls and action plan.

#### Step 5. Plan the work

Use the team's phase pattern:

- **Before start** (*Innan start*): documentation request, initial review, optional introductory meeting.
- **Phase 1:** preliminary assessment.
- **Phase 2:** final assessment.
- **Phase 3, delivery** (*Fas 3/Leverans*): report and clarification meeting.

Give durations in weeks (section 7.5). State that exact dates are set jointly, that client experts must be available for questions and dialogue, especially early on, and that we need access to model developers or process owners. Where components share inputs, such as the BWRA and product knowledge, say they can run partly in parallel.

#### Step 6. Staff and estimate

**Roles.** Define the roles:

- Engagement lead and quality assurance, usually a Director or Senior Manager.
- Executors.
- For larger engagements, an expert panel for oversight, guidance and quality assurance, and an extended expert panel called in as needed (law, data, technology).

**Names and titles.** Take them from `issuing_firm.team`. Titles must match the CVs. Use one placeholder pair per role, never a bare name or title token: `{{lead_name}}`/`{{lead_title}}`, `{{executor_name}}`/`{{executor_title}}`, `{{panel_names}}`/`{{panel_titles}}`, `{{contact_name}}`/`{{contact_title}}` and `{{signatory_name}}`/`{{signatory_title}}`. For larger engagements add: "The final composition of the core team will be confirmed upon contract signature."

**Hours.** Estimate hours per component, then the total. Show the seniority mix as role shares. A standard model validation is about 10 % quality assurance at Director level and about 90 % execution at Associate level.

**Client time.** State the client's own time need explicitly, as the team's material does.

#### Step 7. Price the offer structurally

1. Choose the price model (section 7.1).
2. Run the firm's pricing tool. Rates, cost and approval data stay internal.
3. Assess the risk of a fixed price (section 7.4).
4. Obtain internal approval along the firm's approval chain before sending.

In the proposal, state the price model, the total or the estimate excluding VAT, its basis (hours and role mix), what is included, what is billed separately, the invoicing trigger, expenses and validity. Hours × rates must reconcile with the stated total.

The assistant never sets, adjusts or discounts a price. Figures come from `pricing.*` in the proposal brief. If they are missing, write `[DATA NEEDED: price from pricing tool]`.

#### Step 8. Write the assumptions and terms

Use the standard prerequisites in `references/phrase-bank.md`:

- Documentation is available, and more may be requested.
- One main contact at the client coordinates with named roles, such as the compliance officer, the specially appointed executive (*särskilt utsedd befattningshavare*, SUB), the AML officer, the model owner, the IT model owner and the vendor contact.
- The client sets aside internal time.
- We have access to developers.
- The order and timing may change with access to material and systems.
- Prices exclude VAT, on a basis of 8 hours a day and 40 hours a week.
- Any AI assistance used in delivery is disclosed.

Close with the general terms clause and the validity date.

#### Step 9. Write the remaining sections, summary last

Write the value section from the stated needs, as outcomes rather than features. Choose two or three references that match the client's segment and the service, and only with consent per the profile. Trim CVs so the projects most relevant to this engagement come first. Write the summary last, using the standard opening in `template.md`.

#### Step 10. Review, approve, send and follow up

1. A second person reviews the proposal against section 10.
2. Run a residue check for other clients' names, old dates and placeholders.
3. Confirm price approval and the signatory.
4. Send as PDF, and offer a walkthrough.
5. Track the validity date and record the outcome `[TO CONFIRM: bid log practice]`.

#### The RFP route

The RFP route adds these steps to steps 1–10:

- Log every deadline.
- Build a compliance matrix in the client's numbering.
- Ask clarifying questions in writing before the question deadline.
- Answer in the client's structure, confirming every mandatory requirement.
- Mirror the evaluation criteria in the summary and in the method, team and quality assurance sections.
- Fill the supplier questionnaire from the profile.
- Map our seniority ladder to the client's price-sheet categories.

The full process is in `references/rfp-response.md`.

### 6. Deliverable structure

The team uses two formats. **PowerPoint** is the default for most proposals, especially model validation, discovery and advisory work. **Word** is used for the letter-style offer and is the firm's generic proposal template. Both follow the same logic. `template.md` gives the Word skeleton and the PowerPoint slide map.

#### 6.1 Word proposal: section order of the team's template

`Förutsättningar och antaganden` is not in the Word template. It is added from the PowerPoint format, in the position the decks use.

| # | Section (Swedish heading) | Purpose and required content | Length | Style |
|---|---|---|---|---|
| – | **Cover** (*Omslag*) | "Offert" or "Proposal", engagement title, `{{client_name}}`, `{{date}}`, version, confidentiality, project lead | 1 page | Profile layout |
| 1 | **Summary** (*Sammanfattning*) | What we propose, what it results in (number and type of deliverables), when, price model and total, why us in one sentence. The standard opening is in `template.md`. | ½–1 page | Conclusion first. Written last. |
| 2 | **Background** (*Bakgrund*) | The client's situation as stated by the client, and the regulatory or business driver with a correct reference | ½ page | Factual. No invented facts. |
| 3 | **The client's needs** (*Bolagets behov*) | Restated needs, prioritised. Each need maps to a deliverable. | 3–6 bullets | Client's words |
| 4 | **The assignment** (*Uppdraget*) | 4.1 Purpose (*Syfte*). 4.2 Scope per component (*Omfattning*). 4.3 Exclusions with reasons (*Avgränsningar*). 4.4 Deliverables: name, format, language and recipient (*Leveranser*). | ½–1 page | Precise and countable |
| 5 | **Method and approach** (*Metod och tillvägagångssätt*) | 5.1 Steps. 5.2 Assessment areas or framework, as a table. 5.3 Collaboration: contact model, document and data request, interviews, workshops, fact-check meeting and presentation. 5.4 Proposed plan (*Förslag till plan*), as a phase table. | 1–3 pages | Numbered steps, each with its purpose |
| 6 | **Prerequisites and assumptions** (*Förutsättningar och antaganden*) | Documentation, access, client time, contact model, parallel work, adjustments to timing, use of tools | 4–8 bullets | Plain and specific |
| 7 | **Staffing and time** (*Bemanning och tidsåtgång*) | Team table (role, name, title, responsibility, share of time), hours per component and in total, client time need, access to specialists | ½–1 page | Roles before names |
| 8 | **Price** (*Pris*) | Price model, total or estimate excluding VAT, basis, inclusions and exclusions, invoicing, expenses. A rate table only if the brief supplies it and firm practice is to show it. | ½ page | Numbers, no adjectives |
| 9 | **Value for the client** (*Värde för bolaget*) | Three to five outcomes tied to the needs in section 3 | 3–5 bullets | Outcomes, not features |
| 10 | **Reference assignments** (*Referensuppdrag*) | Two or three relevant cases: client descriptor, challenge, what we did, outcome. Real names only with consent. | ½ page | Short case cards |
| 11 | **Contact details** (*Kontaktuppgifter*) | Validity ("The proposal is valid until {{valid_until}}"), the firm's legal name, organisation number and address from the profile, the firm's contact person, the client's contact person | ½ page | Data only |
| 12 | **Appendices** (*Bilagor*) | Appendix 1: CVs. Appendix 2: detailed method. Appendix 3: document and data request. Appendix 4 (RFP): compliance matrix. | As needed | – |
| 13 | **Terms and signature** | The general terms clause. Signature block with place and date, the client's legal name and the firm's legal name, and signature and name lines. | ¼ page | Fixed wording |

#### 6.2 PowerPoint proposal: slide order used in the team's proposals

`template.md`, Part B, gives the slide-by-slide map. The team uses three formats:

| Format | Slides | When | Order |
|---|---|---|---|
| **Full** | 12–15 | A new client, several components or a competitive situation | Cover; summary; identified needs (with scope and deliverables); experience; approach in structured steps; method; assessment areas; scope and exclusions; prerequisites and assumptions; proposed plan; team and price; general terms; CVs; end slide |
| **Short** | 5–8 | A repeat client, one component, or a client who knows the method | Cover; identified needs; scope with exclusions; team and price; CVs; end slide |
| **Advisory and discovery** | ~8 | Maturity assessments, BWRA, pre-studies | Cover; summary with key outcomes and contacts; about us; service overview (optional); background (driver, affected domains, cost pressure); approach (framework, steps A–B–C with durations, value); core team, expert panel and commercial offer; closing |

"Experience" comes before the method in the full deck, because it builds credibility before the detail. Every slide carries the footer "OFFERT | {{client_name}}", the date and the slide number. Use one date throughout.

#### 6.3 RFP response

Follow the RFP's own order and numbering. Where the RFP leaves the structure open, use the Word order above. Add a compliance matrix as an appendix and refer to it from the summary. Answers to supplier questionnaires go in the client's file format.

### 7. Scales, scoring and calculations

#### 7.1 Price models (structure only)

The models are:

- fixed price (*fast pris*)
- time and material with an estimate (*löpande räkning*)
- a per-entity price
- a recurring fee (managed services, validation as a service)
- a framework agreement call-off (*avrop*)
- a phased offer

`references/pricing-structure.md`, section 2, says when each fits and what the proposal must state for each. Use one model per proposal. If you offer alternatives, label them Option A and Option B and explain the difference. Never leave an internal alternative, such as a T&M slide next to a fixed-price slide, in the deck.

#### 7.2 Effort and calendar

- **Hours.** Total hours = the sum of the component hours. Hours per role = total hours × role share. In the firm's calculator, staffing is entered as consultants × % of an FTE × case length.
- **Calendar basis.** 8 hours per day, 40 hours per week, about 21 working days per month, 12 months for recurring services.
- **Fee estimate under T&M.** The sum over roles of role hours × role rate, with rates only from the pricing tool output in the brief.
- **Reconciliation.** Component hours add up to the total. Role shares add up to 100 %. Hours × rates equal the stated total within rounding.
- **Relative effort.** TM is usually the largest validation component, because scenarios, thresholds and output are tested. Components that share inputs, such as the BWRA, products and customers, can run partly in parallel. A conceptual-only scope removes output testing but not the documentation review.

#### 7.3 Seniority ladder and engagement roles

The ladder runs 1st-year Associate, Associate, Senior Associate, Manager, Senior Manager, Director, Managing Director. Engagement roles are quality assurance and expertise, engagement lead, executor, expert panel and extended expert panel. Section 6.2 of `references/pricing-structure.md` maps this ladder to typical RFP price-sheet categories.

#### 7.4 Fixed-price risk assessment

Before offering a fixed price, rate the five risk questions in `references/pricing-structure.md`, section 4. They cover standard methods, knowledge of the content, knowledge of the client environment, reliance on the client, and confidence in the scoping. The tool turns the ratings into a recommended risk buffer. If several answers are unfavourable, prefer a phased offer or time and material over a large buffer.

#### 7.5 Plan durations

These are the indicative patterns in the team's proposals. Confirm them for each engagement.

| Engagement | Pattern |
|---|---|
| Single-model validation | Before start; phase 1 about 2 weeks; phase 2 about 1 week; phase 3 about 1 week |
| Validation of two or three models | Before start; phase 1 about 3–4 weeks; phase 2 about 1–2 weeks; phase 3 about 1 week |
| Discovery or maturity assessment | Questionnaire about 2 weeks; one to three validation workshops about 1 week; readiness report and roadmap about 1 week |

#### 7.6 Scales shown in the proposal

If the proposal shows the rating scale of the deliverable, for example the four-colour validation grading (Green: no/insignificant improvements needed; Yellow: minor improvements needed; Orange: major improvements needed; Red: not approved, unsatisfactory), copy it from the delivery blueprint (`model-validation-report`). Never define a new scale in a proposal.

### 8. Supporting artefacts

- **Internal pricing worksheet.** The firm's calculator. Never sent to the client. Structure in `references/pricing-structure.md`.
- **RFP compliance matrix.** One row per requirement, in the client's numbering (`references/rfp-response.md`).
- **Pre-start document and data request list.** Per method module (`references/method-modules.md`).
- **CV appendix and reference case cards.** From the profile, in the formats in `firm-and-team-presentation/references/one-pager-and-cv-formats.md`.
- **Proposal brief.** The `proposal:` block that collects engagement inputs (`references/proposal-inputs.md`).

### 9. Writing rules specific to this deliverable

- **Lead with what the client gets.** The summary and each section open with the deliverable or outcome, not with us.
- **Define the client once.** Use "{{client_name}} ({{client_short}})" on first use and the defined term afterwards. Check the defined term in every footer and on every slide.
- **Commit only to what we control.** Write "supports {{client_short}} in meeting the requirements for…", not "ensures compliance". The team's phrase "describes how {{client_short}} thereby meets the requirements…" is acceptable in the summary only when the scope truly covers the requirement.
- **Put exclusions under their own heading** (*Avgränsning*/*Avgränsningar*), each with its reason. Never bury them in assumptions.
- **Use numbers, not adjectives:** weeks, hours, number of reports, number of workshops, number of models.
- **Keep one price model, one date and one set of titles** throughout the document and its CVs.
- **Describe the firm with profile boilerplate only.** The firm description and team facts come from the profile and carry an as-of date. No superlatives that the profile does not substantiate.
- **Leave no placeholder text** such as "lorem ipsum", "XXX", "[client name]" or "2026-xx-xx" in a sent proposal. Unresolved items stay visible as `[DATA NEEDED]` in drafts only.
- **Use the Swedish proposal terms** when writing in Swedish: *offert, summering/sammanfattning, identifierade behov, bakgrund, uppdraget, omfattning, avgränsning, leveranser, metod och tillvägagångssätt, bedömningsområden, förutsättningar och antaganden, förslag till plan, bemanning och tidsåtgång, teamsammansättning, pris, löpande räkning, fast pris, exklusive moms, värde för bolaget, referensuppdrag, allmänna villkor, giltighetstid*.
- **Use correct register in Swedish.** Use "Vi föreslår…" and "{{firm_name}} föreslår…". Use *bör* for recommendations to the client and *ska* only for requirements quoted from rules.

### 10. Quality checklist

In addition to the universal checklist in the house standards:

- [ ] The summary answers the seven questions in section 1, on one page or slide.
- [ ] Every stated need maps to a deliverable, and every deliverable is countable (number, format, language).
- [ ] Each component has a scope sentence. Every exclusion has a reason.
- [ ] The method shows steps, framework, client interactions and deliverable format. The plan has phases, durations and client inputs.
- [ ] Team names and titles match the CVs and the brief. The quality reviewer is named.
- [ ] The price model is single and clear. Hours, role shares and totals reconcile. VAT, invoicing, exclusions and validity are stated. No internal rate card, margin or discount reasoning appears.
- [ ] The assumptions include documentation, access, client time and the contact model.
- [ ] The terms clause and signature block are present, with legal details from the profile.
- [ ] Regulatory statements are correct and dated. Independence is checked and stated where relevant.
- [ ] No other client's name, figures or dates appear anywhere, including footers, plan slides, CVs, file names and notes.
- [ ] Every reference case has consent or is anonymised.
- [ ] In an RFP, every requirement has an answer in the compliance matrix, and the numbering matches the RFP.

### 11. What makes it stand out

1. **The client's need in the client's words, linked to the requirement.** The summary says how the work helps the client meet that requirement.
2. **Visible rigour before signature.** The assessment-area table, or the framework domains, appears in the proposal. The client sees exactly what will be tested, including the link to its own BWRA (*korrelation med allmän riskbedömning*).
3. **Explicit, reasoned exclusions.** For example, conceptual-only validation for a model not yet in production. Time-frame limits are stated, not hidden.
4. **Transparent effort.** Hours per component, the seniority mix, the client's own time need and the synergies between components are all stated.
5. **A typology-based, data-driven BWRA method.** Weighted risk factors and typologies fed by exposure data. General and specific controls, assessed on effectiveness and on design. Residual risk feeds an action plan with owners and deadlines.
6. **Low-threshold entry offers that create decision material.** A discovery phase (questionnaire, one to three validation workshops, a roadmap with the high-level investment need), a fixed-price pre-study or a pilot.
7. **A defined contact model and pre-start document request,** plus fact-check meetings before the final report.
8. **A senior, named quality reviewer,** and a team whose operational, supervisory and legislative backgrounds are shown as relevant experience lines.
9. **Honest prioritisation where the deadline is tight:** what must be in place by the date, and what must have started.

### 12. Common pitfalls

- **Residue from the previous proposal.** Another client's name in a footer, plan slide or phase text is the most frequent and most damaging error in the team's own material. Search for every client name and date from the template source before sending.
- **Inconsistencies:** dates that differ between cover, footer and plan, or a date left as "2026-04-XX"; two price models left in the deck; titles that differ between team slide and CV; a role split, hours and total that do not reconcile.
- **A generic "Experience" section** that would fit any client or service.
- **Template text left in** (lorem ipsum, "XXX", empty slides, "[client name]"), and **wrong regulatory dates**, such as a non-existent date or two different AMLR application months.
- **Overpromising,** such as "ensures compliance" or "AMLR compliant", where the scope only assesses or supports.
- **Exclusions hidden in the plan or assumptions** instead of stated under their own heading.
- **CVs not tailored.** The relevant experience is on page two, or CVs mix first and third person.
- **Ignoring the RFP structure** and answering in our own order, so that evaluators cannot find the answers.

### 13. Variants

**By client type**

| Client type | What changes |
|---|---|
| Bank, credit market company | More components and entities; steering group; formal procurement with supplier questionnaires; responsibility splits for shared systems |
| Payment or e-money institution, fintech | Lean, fixed price, short format; agents and distributors in scope; often a first validation that needs documentation first |
| Insurance | Life and savings products for AML; fraud and claims leakage as a separate pilot |
| Fund manager, investment or wealth firm | Vendor-provided CRR and screening models; conceptual validation before go-live |
| Consumer credit | Fraud and identity misuse alongside AML |
| Crypto-asset service provider | Transfer-of-funds rule; blockchain analytics in TM |
| Non-financial obliged entity | Another supervisor; smaller scope; proportionality |
| Branch of a foreign institution | Branch or whole bank; asymmetries between home and host rules |

**By size and maturity.** Small or immature clients get prerequisites first, a phased offer and the short format. Large or mature clients get component-level scoping, coordination with internal validation and audit functions, and a more detailed governance and reporting plan.

**By format.** Word letter proposal; PowerPoint full, short or discovery format; RFP response; framework call-off (one or two pages referencing the agreement); follow-on proposal (a summary of phase 1 results plus phase 2 scope).

### 14. How the assistant should work

**1. Read the brief, then ask at most five questions** if the minimum inputs are missing. Typical questions:

- What exactly should be offered (components, entities, models), and what triggered the request?
- Which format and language: Word, PowerPoint full or short, or an RFP response?
- Who is on the team, with titles? What price model applies, and what are the figures from the pricing tool?
- What are the desired start date, deadline and offer validity?
- Is there an RFP, a requirement list or evaluation criteria, and any known exclusions?

**2. Produce an outline first.** Give the section or slide list in the chosen format with one line per section, plus a list of open `[DATA NEEDED]` items. For RFPs, produce the compliance matrix skeleton first.

**3. Draft in this order:** needs, scope and exclusions, method, plan, team and effort, price, assumptions, value, references, contacts and terms, and the summary last.

**4. Run the checklist in section 10.** End with a short list of open items for the user: missing data, figures to confirm and references needing consent.

**5. Stop and ask when:**

- independence is in doubt
- no price figures or approval are available and the user wants a sendable version
- client facts in the brief contradict each other
- an RFP requirement cannot be met
- the requested scope does not fit the requested timeline

Never fill gaps with invented client facts, names, prices or references.

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: proposal (offert)

Write in `{{language}}`. Headings below are in English with the Swedish heading the team uses in parentheses. When writing in Swedish, use the Swedish heading. Guidance is in `[brackets]`; delete it in the final text. Placeholders `{{…}}` come from the brief, the proposal brief (`references/proposal-inputs.md`) or the profile. People have one placeholder pair per role: `{{lead_name}}`/`{{lead_title}}` (engagement lead and quality reviewer), `{{executor_name}}`/`{{executor_title}}`, `{{panel_names}}`/`{{panel_titles}}`, `{{contact_name}}`/`{{contact_title}}` (the firm's contact person) and `{{signatory_name}}`/`{{signatory_title}}` (the firm's signatory). The client's contact person uses `{{client_contact_name}}`/`{{client_contact_title}}`.

- Part A is the Word proposal, which is the firm's generic template order.
- Part B is the PowerPoint slide map used in most of the team's proposals.

---

#### Part A: Word proposal

##### [Cover page] (Omslag)

**Proposal (Offert)**
{{engagement_title}}, e.g. "Validation of AML models" (*Validering av AML-modeller*)
{{client_name}}
{{date}} · Version {{version}} · {{confidentiality}}
Project lead (*Projektledare*): {{lead_name}}, {{lead_title}}

[Layout, logo and photo follow the visual profile.]

---

##### 1 Summary (Sammanfattning)

[Write last. Half a page to one page. Answer: what we propose, what it results in, when, the price model and total, and why us in one sentence.]

Example: "{{firm_name}} has prepared this proposal for {{client_name}} ({{client_short}}). It describes how we propose to validate {{client_short}}'s AML models and how the validation supports {{client_short}} in meeting the requirements on models used to counter money laundering and terrorist financing. The work will result in {{n_deliverables}} separate validation reports, one per model ({{component_list}}), and a presentation of the results. We propose to start in {{start}} and deliver within {{n_weeks}} weeks. The engagement is offered at a {{price_model}} of {{price_total}} excluding VAT."

Example (sv): "{{firm_name}} har tagit fram detta förslag för {{client_name}} ({{client_short}}), vilket beskriver vårt tillvägagångssätt för att validera bolagets AML-modeller. Förslaget beskriver även hur {{client_short}} därigenom stöds i att uppfylla de krav som ställs på modeller som används för att motverka penningtvätt och finansiering av terrorism. Arbetet kommer att resultera i {{n_deliverables}} separata valideringsrapporter, en för respektive modell."

---

##### 2 Background (Bakgrund)

[Half a page. The client's situation as stated in the brief, and the driver: a supervisory finding, a new model going live, AMLR, an audit remark, growth. Cite the requirement correctly. Mark unknown facts `[TO CONFIRM: …]`.]

Example: "{{client_short}} plans to put new models for customer risk classification and screening into production in {{go_live}}. Before a new AML model is implemented, an initial validation shall be performed `[VERIFY REFERENCE: national requirement]`."

##### 3 The client's needs (Bolagets behov)

[Three to six bullets in the client's words. Each need is answered by a deliverable in 4.4.]

- {{client_short}} needs …
- …

---

##### 4 The assignment (Uppdraget)

###### 4.1 Purpose (Syfte)

Example: "The purpose of the validation is to assess whether the models are fit for their purpose and to ensure that they meet relevant legal and functional requirements. The work comprises an independent review in line with legal requirements and industry standards and is documented in a validation report describing method, assessments and results."

###### 4.2 Scope (Omfattning)

[One short paragraph per component: what it is and what is covered.]

| # | Component | Short description | Covered areas |
|---|---|---|---|
| 1 | {{component_1}} | [e.g. "The model divides customers into risk classes. The risk class determines the extent, depth and frequency of controls."] | [e.g. Conceptual; implementation; input; output] |
| 2 | {{component_2}} | … | … |

*Table 1: Scope per component*

###### 4.3 Exclusions (Avgränsningar)

[Each exclusion with its reason.]

Example: "The model is planned to be put into production in {{go_live}}. The validation is therefore limited to a conceptual review, which means that the model's output and effectiveness are not assessed at this stage."

Example: "Given the available time frame, the validation does not include an assessment of the model's mapping against the business-wide risk assessment or of its compliance with the Money Laundering Act."

###### 4.4 Deliverables (Leveranser)

| Deliverable | Format | Language | Recipient |
|---|---|---|---|
| Validation report – {{component_1}} | Word/PDF | {{language}} | {{recipient_role}} |
| Presentation of results | PowerPoint | {{language}} | {{recipient_role}} |

*Table 2: Deliverables*

---

##### 5 Method and approach (Metod och tillvägagångssätt)

###### 5.1 Approach (Angreppssätt)

[Numbered steps, each with one sentence on purpose. Take the module from `references/method-modules.md` and tailor it.]

Example (model validation): "We propose that the validation is carried out in structured steps:
1. Review internal documents, routines and model documentation.
2. Check that the scenarios, parameters, thresholds and risk factors applied are appropriate and relevant.
3. Evaluate the model's effectiveness.
4. Test the data used by the models to ensure that it is complete and accurate.
5. Assess the link to the business-wide risk assessment and the roles and responsibilities for model management in internal rules.

After the review, working meetings are held to fact-check and agree on preliminary observations. The work ends with written validation reports."

###### 5.2 Assessment areas or framework (Bedömningsområden)

[Show the framework the client will be assessed against. For model validation, use the table below. For other modules, use the domains or pillars in `references/method-modules.md`.]

| Primary assessment area | Secondary assessment area | Explanation |
|---|---|---|
| Documentation | Conceptual design | Tests the model's documented background, purpose and target state |
| Documentation | Description of the model and its components | Tests how the model and its quantitative and qualitative components are designed and described |
| Method | Consistency with industry practice | Tests whether the model reflects industry practice |
| Method | Consistency with legal requirements | Tests whether the model meets the legal requirements for the model in question |
| Assumptions | Correlation with the business-wide risk assessment | Tests whether the assumptions underlying the model correlate with the firm's BWRA |
| Assumptions | Appropriateness and relevance | Tests whether the assumptions are appropriate and relevant |
| Input data | Data quality and incompleteness risks | Tests whether the model takes data quality and incomplete data into account |
| Input data | Correct and complete data from sources | Tests whether the data sources produce correct and complete data |
| Implementation | Test plan and tests performed | Tests whether the model system is fit for use and correctly implemented |
| Ongoing validation | Routines for ongoing and future validation | Tests whether routines exist to report deviations and improvement potential |
| Output | Actual production and outcomes | Tests the model's output against the stated business objectives |
| Output | Quantitative accuracy | Tests how accurate the model is against its stated purpose and target state |

*Table 3: Assessment areas*

###### 5.3 Collaboration and dialogue (Samarbete och dialog)

[The contact model and client interactions.]

Example: "Contact is through one main contact at {{client_short}}, who coordinates with the relevant parties, such as the compliance officer, the specially appointed executive, the AML officer, the model owner, the IT model owner and the contact at the external vendor."

- Document and data request before start (Appendix 3)
- Introductory meeting, if needed
- Interviews or workshops: {{n}} sessions with {{roles}}
- Fact-check meeting on preliminary observations
- Presentation of results to {{forum}}

###### 5.4 Proposed plan (Förslag till plan)

| Phase | Duration | Activities | Input from {{client_short}} | Output |
|---|---|---|---|---|
| Before start (*Innan start*) | – | Request for documentation; overall review of received material; introductory meeting if needed | Documentation per Appendix 3 | Confirmed scope and plan |
| Phase 1: preliminary assessment | {{weeks}} weeks | [e.g. governance, conceptual soundness per component] | Availability for questions; access to model developers | Preliminary observations |
| Phase 2: final assessment | {{weeks}} weeks | [e.g. model effectiveness, data tests] | Data extracts | Draft reports |
| Phase 3: delivery | {{weeks}} weeks | Final reports; meeting to clarify any questions or changes | Fact-check feedback | Final reports and presentation |

*Table 4: Proposed plan*

Standard text: "The exact dates are set jointly by {{client_short}} and {{firm_name}}. It is important that experts from {{client_short}} are available for questions and dialogue throughout the project, especially in the initial phases."

---

##### 6 Prerequisites and assumptions (Förutsättningar och antaganden)

[Four to eight bullets. Pick from `references/phrase-bank.md` and adapt.]

- Relevant and current documentation for all components in scope is available as a basis. Further documentation may be requested during the work.
- {{client_short}} sets aside internal time to provide material and to be available for questions and meetings.
- We have access to the model developers and to the vendor's contact.
- Collection of information missing from the submitted material is not included and is billed separately.
- The work may run partly in parallel between components. The order and timing may be adjusted to the availability of material and system access.
- `[If applicable]` Parts of the work will be AI-assisted, in line with {{firm_name}}'s established method.

---

##### 7 Staffing and time (Bemanning och tidsåtgång)

| Role | Name | Title | Responsibility in this engagement | Share of time |
|---|---|---|---|---|
| Engagement lead and quality assurance | {{lead_name}} | {{lead_title}} | Responsible for delivery and quality assurance | ~{{x}} % |
| Executor | {{executor_name}} | {{executor_title}} | Performs the validation | ~{{y}} % |
| Expert panel `[optional]` | {{panel_names}} | {{panel_titles}} | Oversight, strategic guidance, quality assurance | As needed |

*Table 5: Proposed team*

Estimated effort: {{component_1}} about {{h1}} hours; {{component_2}} about {{h2}} hours; total about {{h_total}} hours.

Client time: "To achieve a successful result, we recommend that {{client_short}} sets aside internal time for providing material, answering questions and attending meetings."

`[Larger engagements]` "The final composition of the core team will be confirmed upon contract signature."

---

##### 8 Price (Pris)

[Use one price model. Figures come from the proposal brief. Never estimate a rate.]

Fixed price, example: "The price for the engagement is a fixed fee of {{price_total}} excluding VAT. It covers the deliverables in section 4.4. The fee is invoiced after delivery of the final report(s) and the presentation."

Time and material, example: "The engagement is carried out on a time-and-material basis. Based on the estimated time allocation in section 7 [and the hourly rates in the table below], we estimate the total cost at approximately {{price_total}} excluding VAT."

`[Only if the brief supplies rates and firm practice is to show them]`

| Role | Rate excl. VAT |
|---|---|
| {{role}} | {{rate_from_brief}} |

Prerequisites for the price:
- All prices exclude VAT.
- The estimated weekly cost is based on a working day of 8 hours and a working week of 40 hours.
- {{expenses_statement}}
- {{billed_separately_statement}}

---

##### 9 Value for {{client_short}} (Värde för bolaget)

[Three to five outcomes tied to section 3.]

- An independent assessment of whether the models are fit for purpose, documented for the board and the supervisor.
- Prioritised recommendations that {{client_short}} can act on.
- …

---

##### 10 Reference assignments (Referensuppdrag)

[Two or three cases from the profile. Use real client names only where consent is recorded.]

| Client | Assignment | What we did | Outcome |
|---|---|---|---|
| e.g. "A Nordic mid-sized bank" | e.g. "Validation of TM and CRR models" | … | … |

*Table 6: Reference assignments*

---

##### 11 Contact details (Kontaktuppgifter)

The proposal is valid until {{valid_until}}.

**{{firm_name}}**
Org. no. {{firm_org_number}} · {{firm_address}}

**Contact person at {{firm_name}}:** {{contact_name}}, {{contact_title}}, {{phone}}, {{email}}
**Contact person at {{client_short}}:** {{client_contact_name}}, {{client_contact_title}}, {{client_contact_phone}}, {{client_contact_email}}

---

##### 12 Appendices (Bilagor)

- Appendix 1: CVs (*CV*)
- Appendix 2: Detailed method (*Metod*)
- Appendix 3: Document and data request (*Dokument- och dataförfrågan*)
- Appendix 4 `[RFP only]`: Compliance matrix (*Svarsmatris*)

---

##### 13 Terms and signature (Allmänna villkor och underskrift)

The engagement is governed, in addition to what is stated in this proposal, by {{firm_name}}'s general terms and conditions ({{terms_document_reference}}).

*(sv) Uppdraget regleras, utöver vad som nämns i offerten, i enlighet med {{firm_name}}s allmänna villkor.*

| {{client_city}}, {{date_client}} | {{firm_city}}, {{date_firm}} |
|---|---|
| {{client_name}} | {{firm_name}} |
| ………………………… | ………………………… |
| Name: | Name: {{signatory_name}}, {{signatory_title}} |

---

#### Part B: PowerPoint proposal slide map

Footer on every content slide: "OFFERT | {{client_name}}" plus date and slide number.

##### Full format

| # | Slide title (sv / en) | Content |
|---|---|---|
| 1 | Offert / Proposal | {{engagement_title}}, {{client_name}}, {{date}} |
| 2 | Summering / Summary | Standard summary paragraph and deliverables sentence. Image or brand block per profile. |
| 3 | Identifierade behov / Identified needs | "Background: {{client_short}}'s current situation", purpose of the work, scope per component, deliverables |
| 4 | Erfarenhet / Experience | Experience in this service (from profile); the competence areas of the team, e.g. regulatory compliance, a risk-based AML/CTF perspective, data analysis and data quality, quantitative and statistical analysis; what the client gains |
| 5 | [Service] i strukturerade steg / [Service] in structured steps | Numbered steps; scope box; grading scale of the deliverable |
| 6 | {{firm_name}}s metod / Our method | 1 Collection of documents and data; 2 Principles and method (e.g. conceptual, implementation, input and output risk); 3 Assessment areas |
| 7 | Bedömningsområden / Assessment areas | Table 3 |
| 8 | Scope för [tjänst] / Scope | Per component: scope, mapping to BWRA, exclusions (*Avgränsningar*) |
| 9 | Förutsättningar och antaganden / Prerequisites and assumptions | Section 6 bullets plus price prerequisites |
| 10 | Förslag till plan / Proposed plan | Before start; phases 1–3 with weeks; responsibilities; "dates set jointly" |
| 11 | Teamsammansättning och pris för uppdraget / Team and price | Team sentence; effort per component; role mix; price statement; prerequisites |
| 12 | Allmänna villkor / General terms | Terms clause and signature block |
| 13 | CV | Divider, then one CV slide per person |
| 14 | [End slide] | Per profile |

##### Short format

1. Offert / Proposal
2. Identifierade behov / Identified needs
3. Scope (including Avgränsning)
4. Teamsammansättning och pris / Team and price
5. CV slides
6. End slide

##### Discovery and advisory format

1. Cover: "[Service] for {{client_name}}"
2. Summary: purpose; "Key business outcomes for {{client_short}}" (5–6 bullets); contacts
3. About us (profile boilerplate and facts with as-of date)
4. Services overview (optional; from profile)
5. Background: the regulatory driver; the most impacted domains; the cost or efficiency pressure; "we propose a structured discovery phase"
6. Approach: framework domains; A questionnaire (~2 weeks), B validation workshops 1–3 (~1 week), C report and roadmap (~1 week); "Value for {{client_short}}"
7. Proposed core team, expert panel and extended expert panel, and the commercial offer, with the footnote "*The final composition of the core team will be confirmed upon contract signature."
8. Closing slide

## Reference catalogues (inlined)

### Reference catalogue: proposal-inputs.md

A proposal draws on three sources. Keep them apart, so that the assistant knows where each fact must come from and never fills a gap by inventing.

| Source | What it holds | Where defined |
|---|---|---|
| **Request context** [Brief] | Who is issuing, the client, jurisdiction, language, date, version, the team | `_core/request-context.md` |
| **Proposal brief** [Proposal brief] | Engagement-specific commercial and scope inputs, as defined below | This file |
| **Firm profile** [Profile] | Stable facts about the issuing firm: legal identity, boilerplate, facts, people, CVs, references, terms, procurement answers, visual identity | the firm profile supplied with the request. The master field list is in `firm-and-team-presentation/references/profile-fields.md`. |

##### 1. Request-context fields used by proposals

| Field | Used in |
|---|---|
| `request.task`, `request.output`, `request.stage` | Format and depth |
| `issuing_firm.name`, `short_name`, `profile` | Cover, text, layout |
| `issuing_firm.team` (name, role, contact) | Team section, contacts, CV selection |
| `client.legal_name`, `defined_term`, `institution_type` | Cover, defined term, variant |
| `client.size`, `products_services`, `customer_segments`, `distribution_channels`, `geographies`, `key_systems`, `known_issues` | Background, scope realism, proportionality |
| `engagement.jurisdictions`, `supervisor`, `regulation_in_scope` | Regulatory driver |
| `engagement.output_language`, `date`, `version`, `confidentiality`, `deadline` | Language, cover, plan |

##### 2. Proposal brief block

Paste this under the request context and fill in what is known.

```yaml
proposal:
  type: new | follow-on | rfp-response | framework-call-off
  format: word | pptx-full | pptx-short | pptx-discovery | rfp-native
  engagement_title: "Validation of AML models"
  need: >                              # required. The client's need in one to three sentences, as the client stated it
    ...
  trigger: "new CRR model goes live in Q2" # required. Supervisory finding | new model | AMLR | audit | growth | other
  deadline_driver: "2027-07-10 AMLR application"   # optional
  components:                          # required. One entry per separately estimated part
    - name: "Transaction monitoring model"
      status: in-production | planned-go-live | last-validated-YYYY
      notes: "vendor system"
  exclusions: ["no mapping against guideline X"]   # known exclusions or client wishes
  client_wishes: ["report in Swedish", "presentation to the board"]
  start: "2026-11"
  end: "2027-01"
  decision_date: "2026-10-30"
  valid_until: "2026-11-30"            # date. Never invent; use the profile standard if the user says so
  pricing:                             # figures from the firm's pricing tool, after approval
    model: fixed | time-and-material | per-entity | recurring | framework | phased
    total_excl_vat: "[from pricing tool]"
    currency: SEK
    hours_per_component: {"TM": "[n]", "CRR": "[n]"}
    role_split: {"QA/Director": "~10%", "Execution/Associate": "~90%"}
    show_rates: false                  # true only if firm practice is to show rates and they are supplied
    rates: {}                          # filled only when show_rates is true
    invoicing: "after final report and presentation"
    billed_separately: ["collection of missing information", "travel"]
    approved: yes | no
  rfp:
    documents: ["RFP.pdf", "Annex 1 requirements.xlsx"]
    evaluation_criteria: ["competence", "fee", "..."]
    deadlines: {questions: "", submission: "", presentation: "", binding_until: ""}
  references_to_use: ["ref-id-1", "ref-id-2"]   # IDs from the profile
  independence_check: done | not-done | conflict-found
```

##### 3. Profile fields used by proposals

The full definitions are in the master list (`firm-and-team-presentation/references/profile-fields.md`). The table shows which of those fields a proposal needs.

| Profile field | Required for | If missing |
|---|---|---|
| `identity.legal_name`, `org_number`, `registered_address` | Contacts, signature block | `[DATA NEEDED]` |
| `identity.brand_name` | Text and footer | Use `{{firm_name}}` |
| `boilerplate.about_short` | Experience or about-us slide | Omit the slide |
| `boilerplate.experience_by_service` (e.g. "AML model validation since YYYY") | Experience section | Write generically and mark `[TO CONFIRM]` |
| `facts.*` with `as_of` | About-us slide, RFP questionnaires | Omit the numbers |
| `people[]` (name, title, contact, CVs, `publishable`) | Team section (`{{lead_name}}`, `{{executor_name}}`, `{{panel_names}}` and their titles), contact person (`{{contact_name}}`, `{{contact_title}}`), CV appendix | `[DATA NEEDED: CV]` |
| `references[]` (descriptor, consent, segment, service, outcome) | References section, RFP references | Omit, or describe the client type only |
| `commercial.general_terms_reference` | Terms clause | `[DATA NEEDED]` |
| `commercial.standard_validity`, `vat_note`, `invoicing_standard` | Price and validity | `[DATA NEEDED]` |
| `commercial.signatories` | Signature block (`{{signatory_name}}`, `{{signatory_title}}`) | Leave the name line empty |
| `procurement.*` (QA process, independence and conflict procedure, information security and staff screening, insurance, sustainability documents, subcontractor policy, audit rights) | RFP questionnaires | `[DATA NEEDED]` per question |
| `visual.*` | Layout | Unbranded output, with a note |

**Never in the profile, and never in this library:** rate cards, internal cost, margins, discount guidelines. These stay in the firm's pricing tool.

## Placeholders

The blueprint text uses these placeholders. Fill each one from the request brief or the inputs. If a value is not known, write `[DATA NEEDED: …]` in the deliverable; never invent it, and never leave a `{{…}}` placeholder in a finished deliverable.

- `{{billed_separately_statement}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{client_city}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{client_contact_email}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{client_contact_name}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{client_contact_phone}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{client_contact_title}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{client_name}}` — the client's legal name (brief: client.legal_name)
- `{{client_short}}` — the defined term for the client, e.g. "the Company" (brief: client.defined_term)
- `{{component_1}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{component_2}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{component_list}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{confidentiality}}` — the confidentiality marking (brief: engagement.confidentiality; default Confidential)
- `{{contact_name}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{contact_title}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{date}}` — the deliverable date (brief: engagement.date)
- `{{date_client}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{date_firm}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{email}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{engagement_title}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{executor_name}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{executor_title}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{expenses_statement}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{firm_address}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{firm_city}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{firm_name}}` — the issuing firm (brief: issuing_firm.name)
- `{{firm_org_number}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{forum}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{go_live}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{h1}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{h2}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{h_total}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{jurisdiction}}` — the jurisdiction(s) (brief: engagement.jurisdictions)
- `{{language}}` — the output language (brief: engagement.output_language)
- `{{lead_name}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{lead_title}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{n}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{n_deliverables}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{n_weeks}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{panel_names}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{panel_titles}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{phone}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{price_model}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{price_total}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{rate_from_brief}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{recipient_role}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{role}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{roles}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{signatory_name}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{signatory_title}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{start}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{supervisor}}` — the supervisor (brief: engagement.supervisor)
- `{{terms_document_reference}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{valid_until}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{version}}` — the document version (brief: engagement.version)
- `{{weeks}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{x}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{y}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
