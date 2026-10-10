# FCP blueprint: Firm and team presentation

Blueprint `firm-and-team-presentation` v1.0 (stable) from the FCP blueprint library, as ANTON skill `fcp-bp-firm-and-team-presentation`. Produces presentations of the issuing firm, its financial crime prevention (FCP) team and its services. Covers first-meeting introduction decks, insight-led client pitches on a regulatory or risk topic (for example the AML package, restrictive measures, fraud, anti-bribery or model validation), service presentations (for example managed services or validation as a service), one-pagers and leave-behinds, workshop invitations, expert background slides and team CV packs. Use when the goal is to earn a next step with a prospect or client, rather than to deliver a priced offer or a training. All firm facts, team members, CVs, credentials and references come from the firm profile. Client context comes from the request brief. Claims must be sourced, regulatory statements layered and verified, and no client is named without recorded consent.

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
- `references/…` inlined below: `claims-and-messaging.md`.
- The other `references/…` catalogues (`one-pager-and-cv-formats.md`, `profile-fields.md`, `service-catalogue.md`, `topic-insight-modules.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Method and quality bar (blueprint sections 1–14)

Load this blueprint together with `_core/house-standards.md`, `_core/request-context.md` and `_core/output-formats.md`, especially section 2 on PowerPoint.

This is marketing material written as the issuing firm. "We" is natural, and the house rule against sales messages inside client deliverables does not apply. All other house rules apply, sharpened here: evidence over assertion, no invented facts, no other client's data, and precise regulatory statements.

The firm's own facts never live in this blueprint. They live in the **firm profile** (`references/profile-fields.md`). Service descriptions (`references/service-catalogue.md`), topic modules (`references/topic-insight-modules.md`), one-pager and CV formats (`references/one-pager-and-cv-formats.md`) and messaging rules (`references/claims-and-messaging.md`) are in `references/`.

### 1. Purpose and outcome

A firm and team presentation exists to earn a **next step**: a meeting, a request for proposal, a workshop, a discovery phase or a pilot. It does this by showing three things in the reader's terms:

- We understand your situation and what is changing.
- We have a clear view on what to do about it.
- We have the people and methods to help.

**Readers and audiences.** The head of FCP or compliance, the AML officer or MLRO, the specially appointed executive (SUB), the CRO, the CEO and, for some topics, management or the board. Procurement teams read capability statements. Fintech founders and product owners read lighter, faster material.

**What it enables.** The audience decides whether to continue the dialogue and what to ask for. A good deck ends with a concrete, low-threshold next step and leaves the client with questions it needs answered: questions about scope, ambition, resources and budget.

**The outcome test.** After the meeting the client can say:

1. what is changing and by when
2. what it means for them specifically
3. what the firm would do, and how
4. who the people are
5. what the next step is

### 2. When to use / when not to use

Use for:

| Format | Typical use |
|---|---|
| **Insight-led client presentation** (the main deliverable) | A meeting with a prospect or client on a topic. Example: new guidelines on restrictive measures and what they mean for this bank. |
| **Firm and team introduction deck** | A first meeting, a partner meeting, or a capability statement |
| **Service presentation** | Presenting one service in depth, e.g. managed services or model validation, as a one-off or a continuous service |
| **One-pager or A4 leave-behind** | A teaser before or after a meeting, an email attachment, an event handout |
| **Invitation** | Inviting to a workshop or webinar |
| **CV pack or expert slide** | Attached to a pitch or proposal; capability statements |

| If the need is… | Use instead |
|---|---|
| A priced offer, an RFP answer or a call-off | `proposal`. The pitch may end with a "commercial offer" slide built per `proposal`. |
| Teaching a topic (training, webinar, conference talk where knowledge transfer is the goal) | `training-and-presentations` |
| Presenting the results of an engagement | The delivery blueprint, e.g. `model-validation-report` or `aml-ctf-risk-assessment` |
| Internal strategy, growth plans, target client lists | Not covered. Internal material must never be reused in client decks. |

### 3. Inputs

Source legend: **[Brief]** is a field in `_core/request-context.md`. **[Presentation brief]** is a field in the `presentation:` block below. **[Profile]** is a field in the firm profile (`references/profile-fields.md`).

#### 3.1 Minimum to start

| Input | Source | Why | If missing |
|---|---|---|---|
| Purpose and desired next step | [Presentation brief] `purpose`, `next_step` | Shapes the storyline and the closing slide | Ask |
| Format and length | [Brief] `request.output`; [Presentation brief] `format`, `length` | Deck, one-pager, invitation or CV pack | Ask |
| Audience | [Brief] `engagement.audience`; [Presentation brief] `audience_roles` | Depth, tone, terminology | Assume compliance and FCP management, marked `[ASSUMPTION]` |
| Topic | [Presentation brief] `topic` | Choice of topic module | Ask |
| Client name and institution type, or the target segment for generic material | [Brief] `client.legal_name`, `client.institution_type` | Tailoring | For generic material: segment only |
| Language and jurisdiction | [Brief] `engagement.output_language`, `engagement.jurisdictions` | Wording and regulatory layer | Ask |
| Issuing firm and profile | [Brief] `issuing_firm.name`, `issuing_firm.profile` | Every firm fact, the brand and the layout | Ask. Without a profile, produce the structure with `[PROFILE: …]` markers. |

#### 3.2 Needed for a complete deliverable

| Input | Source | Why | If missing |
|---|---|---|---|
| Presenting team, with roles and contacts | [Brief] `issuing_firm.team`; [Profile] `people[]` | Agenda slide, team slide, contact slide | `[DATA NEEDED: presenters]` |
| What the client has said: pain points, current projects, known issues | [Brief] `client.known_issues`; [Presentation brief] `client_statements` | Section "What it means for you" | Turn it into questions to ask, not assertions |
| Client size, products, segments, channels, geographies, systems | [Brief] `client.*` | Relevance of examples and services | Generic segment examples |
| Meeting date, duration and setting | [Presentation brief] `meeting` | Slide budget | Assume 45–60 minutes |
| Services to feature | [Profile] `services[]`, filtered by topic | Offering slides | Use only services listed in the profile |
| Reference cases | [Profile] `references[]` with consent status | Credibility | Anonymised descriptors, or omit |
| Approved claims and facts, with as-of dates | [Profile] `boilerplate`, `facts`, `approved_claims` | About-us slides | Omit the numbers rather than guess |
| External statistics to use | [Presentation brief] `sources` | Context slides | Leave a placeholder `[DATA NEEDED: source]`. Never invent a number. |

#### 3.3 Presentation brief block

```yaml
presentation:
  purpose: "Position our support for implementing the new sanctions guidelines"   # required
  next_step: "Agree a scoping workshop"           # required: meeting | workshop | discovery | pilot | proposal request
  format: client-deck | intro-deck | service-deck | one-pager | a4-brochure | invitation | cv-pack
  length: "20 slides incl. 4 backup"
  topic: amlr | sanctions | fraud | abc | model-validation | managed-services | ai-and-data | other
  audience_roles: ["Head of FCP", "SUB", "CRO"]
  meeting: {date: "", duration_min: 60, setting: "on site"}
  client_statements: ["two TM systems", "ODD is calendar-driven"]   # what the client has told us
  presenters: ["name-id-1", "name-id-2"]           # profile people IDs
  services_to_feature: ["service-id-1"]            # profile service IDs
  references_to_use: ["ref-id-1"]                 # profile reference IDs, consent checked
  sources: [{claim: "", source: "", year: ""}]     # external facts with source
  tailoring_level: L1 | L2 | L3                    # see section 7.1
```

#### 3.4 Profile fields this deliverable needs

The full definitions are in `references/profile-fields.md`. Fields marked **R** are required for any presentation that mentions the firm. **C** fields are required when the slide or element that uses them is included. **O** fields are optional.

| Profile field | Need | Used in |
|---|---|---|
| `identity.brand_name` | R | Cover, footers, text |
| `identity.legal_name`, `website` | R | Contact slide, one-pager footer |
| `identity.tagline` | O | Cover, closing slide |
| `identity.former_names` | R (internal) | Residue check only. Never displayed. |
| `boilerplate.about_short` (≤ 50 words) and `about_long` (≤ 150 words) | R | About-us slide, one-pager "about" box |
| `boilerplate.vision` | O | About-us slide |
| `boilerplate.fcp_team_positioning` | R | Team or offering slide |
| `boilerplate.approved_claims[]` (claim, substantiation, owner, date) | R | Any positioning statement |
| `facts.founded_year`, `employees_or_experts` + `as_of`, `offices[]` + `as_of`, `countries`, `client_count` + `as_of`, `client_segments_served` | C | About-us slide, capability statement |
| `facts.fcp_team_size` + `as_of`, `facts.fcp_team_backgrounds` | C | Team slide |
| `service_lines[]` (e.g. advisory, managed services, technology, training) | R | Service map |
| `services[]` (id, name, domain, one-liner, modules, typical outputs, entry offer, owner) | R | Offering slides, one-pagers |
| `people[]`: name, title, practice, contact, languages, `aml_experience_since`, `highlights[]` (2–3 lines), `cv_long`, `cv_short`, `photo_consent`, `publishable` | C | Agenda, team, contact, CV pack, expert slide |
| `references[]`: id, client descriptor, client name (internal), `consent_to_name` (+ expiry), segment, year, service, challenge, what we did, outcomes | C | Reference slides and cards |
| `credentials[]`: certifications, memberships, standards committees, publications | O | Team slide, CVs |
| `technology_partners[]` with `may_name` | O | Technology slides. Name a partner only where `may_name` is true. |
| `contacts.default_presenters[]` | O | Contact slide on generic material |
| `visual.*`: template, colours, fonts, slide layouts, footer convention, logo rules | R | Layout |

### 4. Regulatory and professional anchors

Presentations make regulatory and factual claims. These must meet the same standard as a deliverable.

**Regulatory content (layered)**

- *EU baseline first.* The AML package: AMLR (Regulation (EU) 2024/1624), which applies from 10 July 2027; the AMLA Regulation (Regulation (EU) 2024/1620); AMLD6 (Directive (EU) 2024/1640). Also Regulation (EU) 2023/1113 on transfers of funds and crypto-assets; EBA guidelines such as ML/TF risk factors (EBA/GL/2021/02) and restrictive measures (EBA/GL/2024/14 and 2024/15) `[VERIFY REFERENCE: application date]`; and EU sanctions regulations.
- *Then the national layer* via `{{jurisdiction}}`. For Sweden: PTL (2017:630), FFFS 2017:11 and Finansinspektionen. Other supervisors apply to non-financial obliged entities.
- *Then industry standards:* FATF, Wolfsberg, ISO 37001 for anti-bribery and ISO 37301 for compliance management.

Give exact dates only when verified. Write "Regulatory status as of {{date}}" in the speaker notes. Material from the team itself contained a non-existent adoption date and two different AMLR application months, so verify every date in reused slides.

**Marketing and consumer-protection law.** Statements about the firm must be truthful and possible to substantiate. In Sweden the Marketing Act (*marknadsföringslagen*, 2008:486) applies; at EU level, business-to-business advertising is covered by Directive 2006/114/EC on misleading and comparative advertising. Comparative claims ("leading", "the most specialised", "unmatched") need proof in the profile's `approved_claims`, or they are rephrased.

**Personal data.** Team CVs, photos and contact details are personal data under the GDPR. Use only people and CV versions that the profile marks `publishable`, and photos only with `photo_consent`.

**Client confidentiality.** Engagements are confidential. Name a client, or give details that identify it, only with consent recorded in the profile. Otherwise use a descriptor such as "a Nordic tier-2 bank", "a European fintech" or "an insurance company".

**Statistics.** Every number about the market, crime trends or costs carries a source and a year in the slide footer. Prefer primary sources: Europol threat assessments, FATF and EBA reports, national police and crime-prevention statistics, supervisory reports. Secondary press figures are a last resort and must be labelled.

### 5. Method

#### Step 1. Define purpose, audience and next step

Write one sentence: "After this meeting, {{client_short}} should [decision or action]." Everything in the deck serves that sentence.

**Judgement.** If the client already asked for an offer, you need a proposal, not a pitch. If the audience wants to learn, use `training-and-presentations`.

#### Step 2. Choose the format and slide budget

| Format | Length | Firm credentials share |
|---|---|---|
| Insight-led client presentation | 15–25 slides, plus backup | At most about 15–20 % of the slides (2–4) |
| Intro deck | 8–12 slides | 30–50 % |
| Service presentation | 6–12 slides | 20–30 % |
| One-pager | 1 slide or 1–4 A4 panels | One "about us and contact" box |
| Invitation | 1 page | One line plus contact |

**Why.** The team's strongest client deck spends 2 of 24 slides on the firm and the rest on the client's issue. Decks that open with four or more slides about the firm lose senior audiences.

#### Step 3. Build the storyline before the slides

**Insight-led storyline** (the team's standard for client meetings):

1. Introduction: who we are, in one or two slides, and our offering on this topic.
2. The landscape: what is changing, the requirements and the timeline.
3. What it means for {{client_short}}: implications, priorities and key questions.
4. How we support, and the next steps.

Write the slide titles as messages first and check that they tell the story on their own. Then fill the slides.

**Service storyline** (service decks):

1. Why it matters (benefits)
2. What it is (definition, requirement, when and who)
3. How we do it (process)
4. Delivery models (one-off or continuous; modules)
5. Prerequisites and our perspective
6. Team
7. Contact

#### Step 4. Tailor to the client

Use the client facts in the brief. Where you lack facts, turn assertions into **questions** ("Can sanctions handling be centralised, or must it sit separately in each country?").

Map the topic's requirements to the client's set-up: branch or group, number of countries, systems, products and segments. Pick two to four relevant services from the profile, not the whole catalogue.

The tailoring level (section 7.1) must match the brief. Never present a generic deck as client-specific.

#### Step 5. Pull the firm facts and the team from the profile

- **Facts.** Use the boilerplate and facts with a valid as-of date (section 7.3).
- **People.** Choose presenters and experts relevant to the topic. Show each with title, years of AML/CTF experience and two or three experience lines exactly as the profile gives them.
- **Grouping.** In larger decks, group the team by competence: regulatory and compliance experts; model validation and FCP process experts; technology, innovation and transformation experts.
- **Team structure.** For bigger pitches, show the core team, expert panel and extended expert panel.

#### Step 6. Substantiate every claim

Build a claims list as you write (section 7.2). Each claim is one of three kinds:

- **profile-approved**
- **externally sourced**, with source and year
- **to verify**

No slide goes out with a claim still "to verify". Regulatory statements follow section 4.

#### Step 7. Write speaker notes

The notes on each content slide say four things:

1. what to say
2. which questions to ask the audience
3. which sources lie behind the numbers
4. alternatives, such as an alternative agenda

The team uses notes for exactly this.

#### Step 8. Close with a concrete next step

Use the "next steps" pattern:

- **Scope and time:** the entity or entities in scope, the ambition level and deadline, project planning, a steering structure if needed.
- **Secure resources:** competence and capacity that compete with daily operations.
- **Start the work.**
- **External needs:** what the client can do itself, what external help it needs, and the budget.

Offer a low-threshold entry: a discovery phase, quick scan, second opinion, workshop or pilot. The closing slide is "Thank you" (*Tack!*) with two presenter contacts.

#### Step 9. Review

Use the checklist in section 10. Pay particular attention to:

- brand and name residue: former brand names, another client's name in a reused "client-specific" deck
- outdated facts
- mixed languages
- placeholder slides
- unsourced numbers
- internal material: growth targets, target client lists, "our goal" slides, comments to colleagues

### 6. Deliverable structure

#### 6.1 Insight-led client presentation (main deliverable)

This follows the team's final client deck on a regulatory topic. Section dividers use a large number and the section name (`output-formats.md`). The full skeleton is in `template.md`.

| # | Section | Slides | Purpose and content | Style |
|---|---|---|---|---|
| 0 | Cover | 1 | Topic title; "{{firm_name}} x {{client_short}}"; subtitle naming the change; date | Profile cover layout |
| 0 | Agenda (*På agendan*) | 1 | Numbered sections 01–04, plus the presenting team (name, title, phone, email) | Agenda plus team photos if consented |
| 01 | Introduction (*Introduktion*) | 2–3 | Divider. About {{firm_name}} (profile facts with as-of date and the office map). Our offering on this topic (service tiles, e.g. risk assessment, gap analysis against new guidelines, implementation and optimisation of screening, processes, governing documents, training). | Brief |
| 02 | The landscape, e.g. "New sanctions rules" | 4–9 | Divider. A timeline (today, then key dates). "Rules in major change: higher demands; the guidelines are the start of a larger change". The instrument summary (adopted and applicable dates, key articles, how it relates to other instruments). Requirement areas (e.g. 1–5), then one slide per area with three to seven requirement bullets. | Factual; references in the footer |
| 03 | What it means for {{client_short}} | 2–4 | Divider. "What do the requirements mean for your business?" Dates, supervisory focus, our assessment of priorities, honestly put (e.g. full implementation is unlikely by the deadline, so a clear gap picture and an action plan matter; these elements must be in place by date X, these must have started). "Key questions" (*Frågeställningar*), each with our preliminary view. | Client-specific; questions where facts are missing |
| 04 | How we support, and next steps | 2–3 | Divider. "We guide and support with concrete actions": coverage of every requirement area, from governing documents and process descriptions to quality assurance and practical insight into how others organise the work. Approach (phases, pilot or discovery). Next steps (scope and time; secure resources; start work; external needs and budget). | Action-oriented |
| – | Close | 1 | "Thank you!", two contacts and the website | Profile closing layout |
| – | Backup (optional) | 0–6 | CVs, references, detailed requirement mapping, sources | – |

#### 6.2 Firm and team introduction deck

1. Title: "Our Financial Crime Prevention Offering" and the tagline from the profile.
2. About us: profile boilerplate and facts with as-of date; service lines.
3. Where we are: an office map, if relevant.
4. Our FCP experience: team size and backgrounds; client segments served; four or five service areas, each with one line (risk assessments, interim roles, policies and frameworks, analytics and automation, validations).
5. Senior experts: background examples with years of experience.
6. One or two method examples relevant to the audience, e.g. the risk appetite and risk assessment overview, or the five-stage validation process.
7. The full financial crime spectrum: why ABC, fraud and sanctions matter and how they link to AML.
8. CVs.
9. Contact.

#### 6.3 Service presentation

| Variant | Slide order |
|---|---|
| **Managed services** | Cover with service name and tagline. Context: cost of compliance, supervisory attention to efficiency, competence shortage; contacts. Service map (framework, operational functions, internal control), with one slide highlighting each module. Our commitment (dedicated team; competence matched to task complexity; cost-efficient use of internal resources; client value). Senior experts. One detail slide per module. |
| **Model validation** | Why it matters (five benefits). What it means, why it is required, when and by whom. How it is done (five stages). One-off validation or continuous assurance. What must be in place for a successful validation. Our perspective. Team. |

#### 6.4 One-pagers, invitations and CVs

Formats are in `references/one-pager-and-cv-formats.md`:

- the four-box "What's new" one-pager
- the A4 service brochure
- the team one-pager
- the offering one-pager
- the workshop invitation
- the long CV, the short CV and the expert background line
- the reference case card

### 7. Scales, scoring and calculations

This deliverable has no risk rating. It uses the following definitions instead.

#### 7.1 Tailoring level

| Level | Definition | Required |
|---|---|---|
| L1 Generic | Firm or service material for any client | Segment-neutral examples; no client name |
| L2 Segment | Tailored to a segment and jurisdiction (e.g. Swedish payment institutions) | Segment examples; the national regulatory layer |
| L3 Client | Tailored to one client | The client's name and facts from the brief; a "what it means for {{client_short}}" section; client-specific questions |

#### 7.2 Claim status

| Status | Meaning | Allowed in a sent deck |
|---|---|---|
| Profile-approved | In `approved_claims` or `facts`, with a valid as-of date | Yes |
| Externally sourced | External number or statement with source and year in the footer | Yes |
| To verify | Anything else | No. Rephrase, source it or remove it. |

#### 7.3 Freshness of firm facts

A fact with an `as_of` date older than 12 months `[TO CONFIRM: firm rule]` is re-confirmed before use. When two decks give different numbers, for example for employees, offices or team size, the profile wins.

#### 7.4 Notation

- **Years of experience:** "+N years AML/CTF experience", computed as the current year minus `aml_experience_since`, rounded down. Use the same notation on every slide.
- **Agenda and dividers:** numbered 01–05.
- **Timelines:** left to right from "today", with verified dates only.

### 8. Supporting artefacts

| Artefact | Content |
|---|---|
| Speaker notes | What to say, questions to ask, sources, alternative agenda |
| Claims and sources list | Every claim with its status, source and year. Kept with the deck file, not shown on slides. |
| One-pager or A4 leave-behind | One of the formats in `references/one-pager-and-cv-formats.md` |
| CV pack | Long CVs of the presenters and the proposed team, tailored to the topic |
| Expert background slide | Four to eight experts with years of experience and two or three lines each |
| Reference case cards | Two or three cases with consent status |
| Follow-up email | Three to five lines: thanks, the agreed next step, the leave-behind attached, and a proposed date |

### 9. Writing rules specific to this deliverable

- **One message per slide, with an action title.** Write "Sanctions must be integrated into the AML framework by July 2027", not "AMLR".
- **Keep slides lean:** at most about six bullets of about twelve words. Detail goes into the notes or backup.
- **Write about the client first, then about us.** Use the client's name as the defined term (`{{client_short}}`) consistently.
- **Use one language per deck.** Never mix languages on one slide or keep headings from another country's version. Keep established English terms (PEP, TM, KYC, ODD/EDD) where the audience uses them.
- **Source every number** in the footer: "Source: [publisher], [title], [year]".
- **Use claims within the profile's limits.** Instead of "Our experts wrote the rules themselves", write a verifiable line from the profile, such as "Team members have contributed to drafting national AML legislation", and only if the profile says so.
- **No fear-mongering and no absolutes.** Avoid "Not AMLR compliant" verdicts about practices in general. Say what the requirement is and what typically needs to change.
- **No placeholders in sent material:** no lorem ipsum, "X & X", "[client]", empty slides or comments to colleagues in visible text.
- **No testimonials or quotes** unless the profile holds the quote with consent and attribution.
- **Take the brand name only from `{{firm_name}}`.** Never copy a firm name from an older deck. Check `identity.former_names` for residue.
- **Swedish terms when writing in Swedish:** *finansiell brottsprevention, penningtvätt, finansiering av terrorism, kundkännedom, löpande uppföljning, allmän riskbedömning, internationella sanktioner, restriktiva åtgärder, riskaptit, transaktionsövervakning/transaktionsmonitorering, kundriskklassificering, modellvalidering, särskilt utsedd befattningshavare, centralt funktionsansvarig*.

### 10. Quality checklist

- [ ] The purpose sentence and the next step are clear, and the closing slide asks for that next step.
- [ ] The storyline reads from the slide titles alone.
- [ ] Firm credentials take up no more than the slide budget for the format (section 5, step 2).
- [ ] The tailoring level matches the brief, and an L3 deck has a client-specific section with questions.
- [ ] Every firm fact comes from the profile and has a valid as-of date. Numbers are consistent across slides.
- [ ] Every external number has a source and year. No claim is still "to verify".
- [ ] Regulatory dates and references are verified and layered EU, then national, then industry.
- [ ] No client is named or identifiable without recorded consent, including in CVs and reference slides.
- [ ] No former brand names, other clients' names, internal strategy, placeholders or colleague comments remain.
- [ ] One language throughout, and the Swedish terms are correct.
- [ ] Presenter names, titles and contacts match the profile. Only publishable CVs and consented photos are used.
- [ ] Speaker notes exist on every content slide.
- [ ] The layout follows the visual profile.

### 11. What makes it stand out

1. **Insight first, credentials second.** The deck spends its time on the client's issue: the change, the requirement and the implications. The firm appears briefly and then as the answer.
2. **Regulatory precision with a timeline.** Requirements are broken into clear areas and placed on a verified timeline from "today". The deck shows how instruments relate, for example how sector guidelines anticipate the AML Regulation.
3. **An honest view on priorities.** The deck says what must be in place by the deadline, what must merely have started, and when full implementation is unrealistic. It recommends a gap picture and an action plan instead.
4. **Client-specific questions instead of assumptions.** "Key questions" with our preliminary view show expertise and invite dialogue. Examples: can the function be centralised across countries; where should the senior responsible person sit; what are the pitfalls of operating in two jurisdictions.
5. **The FCP domains connected.** ABC, fraud, sanctions and AML are shown as linked. Corruption enables fraud and money laundering. Sanctions become part of the AML framework. Fraud methods resemble AML methods: risk assessment, real-time monitoring and model development. This supports integrated risk assessments and shared controls.
6. **Credibility through relevant backgrounds.** Experts are shown with years of experience and experience lines from all three lines of defence, supervisory authorities, financial intelligence units and legislative work, as the profile states them, so that the audience sees practitioners.
7. **Pragmatic, proportionate and system-agnostic.** Solutions are tailored to size and industry, and services work regardless of the client's systems.
8. **A low-threshold next step.** A discovery phase, quick scan, pilot, second opinion or workshop makes it easy to say yes.

### 12. Common pitfalls

- **Brand residue:** a former firm name in the text of a deck that uses the new template, or headings in another country's language.
- **Reuse residue:** a deck "for" one client reused for another, with the first client's name left in notes, footers or "challenges" slides.
- **Inconsistent firm facts:** different numbers for employees, offices or team size across decks in circulation.
- **Unsourced statistics,** such as crime growth rates or cost shares, or a source mentioned only in the notes.
- **Wrong or inconsistent regulatory dates,** including impossible dates.
- **Anonymous or invented testimonials.**
- **Too much "about us":** several slides of service-line animation before the client's topic.
- **Internal material leaking in:** growth ambitions, revenue models, target client lists, "how we win" notes, draft comments.
- **Lorem ipsum, "X & X" speaker placeholders,** or empty slides left in the deck.
- **Absolute claims** such as "unmatched", "the leading" or "AMLR compliant" without proof.
- **CVs that name previous clients without consent,** or mix first and third person.
- **Pricing in a pitch deck** without the `proposal` checks.

### 13. Variants

**By audience**

| Audience | Adjust |
|---|---|
| Board or management | Fewer requirement details; consequences, deadlines, decisions and investment; 10–15 slides |
| Compliance and FCP specialists | Requirement-level detail; mapping to current processes; method slides |
| Fintech founders and product teams | Shorter; "compliance by design"; scalable and subscription-style offers; practical next steps |
| Procurement | Capability statement: facts, services, QA, references, CVs; no persuasion slides |

**By client type**

| Client type | Typical emphasis |
|---|---|
| Bank | Operating model, group-wide consistency, systems landscape (multiple TM systems, case management), supervisory focus |
| Payment or e-money institution, fintech | Speed, scalability, agents and distributors, crypto exposure, first-time model validation |
| Insurance | Fraud leakage, life and savings AML |
| Fund manager, investment or wealth firm | Customer risk classification and screening, high-net-worth and complex structures |
| Consumer credit | Fraud, identity misuse, credit and AML data overlap |
| Crypto-asset service provider | Transfer-of-funds rule, blockchain analytics |
| Non-financial obliged entity | A different supervisor, proportionality, basic framework |
| Branch of a foreign institution | Branch or group scope; asymmetry between home and host rules |

**By maturity.** Low maturity: the basics, the requirement and a starter package. High maturity: optimisation, efficiency, data and AI, transformation.

**By format.** Live meeting deck; send-ahead deck (more text, self-explanatory); conference or webinar (use `training-and-presentations`); animated teaser (sector-by-sector impact, no detail); one-pager; invitation; CV pack.

### 14. How the assistant should work

**1. Read the brief and the profile.** If the profile is missing, say that firm facts will be marked `[PROFILE: …]`.

**2. Ask at most five questions** if the minimum is missing:

- What is the purpose and the desired next step?
- Who is the audience, and how long is the meeting?
- Which topic, and what has the client told us?
- Which format and language?
- Who presents?

**3. For decks over ten slides,** first deliver the storyline: the section list and slide titles as messages, with a one-line purpose each. Then write the full content with speaker notes.

**4. Draft in this order:** the client's issue (sections 02–03), then the support and next steps (04), then the introduction (01), then the cover, agenda and close. Write one-pagers last, as a distillation of the deck.

**5. Deliver** the deck content, the speaker notes, the claims and sources list, and a list of open `[DATA NEEDED]`, `[TO CONFIRM]` and `[VERIFY REFERENCE]` items.

**6. Stop and ask when:**

- the user wants a client named in a reference without recorded consent
- a requested claim cannot be substantiated
- a number has no source
- material from an internal strategy deck is requested for a client deck
- the user asks for prices (switch to `proposal`)

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: insight-led client presentation

Write in `{{language}}`. Format: PowerPoint 16:9 in the visual profile. Each content slide has an **action title**, at most about six bullets, a source footer where numbers appear, and **speaker notes**. Guidance is in `[brackets]`. `[PROFILE: field]` means the content is taken from the firm profile. Slide titles are given in English with the Swedish wording the team uses in parentheses.

The variant skeletons for the intro deck and the service decks are at the end. One-pagers and CVs are in `references/one-pager-and-cv-formats.md`.

---

#### Slide 1: Cover

**{{topic_title}}**, e.g. "Restrictive measures" (*Restriktiva åtgärder*)
Subtitle: [the change, e.g. "New guidelines from the European Banking Authority"]
{{firm_name}} x {{client_short}}
{{date}}

Notes: [Purpose sentence; who presents what.]

#### Slide 2: On the agenda (På agendan)

| | Section |
|---|---|
| 01 | Introduction (*Introduktion*) |
| 02 | {{landscape_title}}, e.g. "New sanctions rules" (*Nya sanktionsregelverk*) |
| 03 | What it means for {{client_short}} (*Påverkan för {{client_short}}*) |
| 04 | Our support and next steps (*{{firm_name}}s stöd i arbetet och nästa steg*) |

Presenting team: [PROFILE: people[].name, title, practice, phone, email, photo if consented]

Notes: [Alternative agenda, if the meeting is shorter.]

---

#### Slide 3: Divider "01 Introduction"

#### Slide 4: About {{firm_name}}

Title: [PROFILE: boilerplate.about_short, as an action title]
- [PROFILE: facts.employees_or_experts] experts (as of [PROFILE: as_of])
- [PROFILE: facts.offices] locations: [map]
- Founded [PROFILE: facts.founded_year]
- [PROFILE: boilerplate.fcp_team_positioning]

Notes: [Keep to 60 seconds.]

#### Slide 5: Our offering on {{topic}}

Title example: "{{firm_name}}'s offering in sanctions risk management" (*{{firm_name}}s erbjudande inom sanktionsriskhantering*)
[Four to six service tiles from PROFILE: services[], filtered by topic]

Example tiles: risk assessment · gap analysis against new guidelines · implementation and optimisation of screening systems · processes for managing sanctions risk · governing documents · training

---

#### Slide 6: Divider "02 {{landscape_title}}"

#### Slide 7: Timeline

Title example: "Rules in major change: the guidelines are the start of a larger regulatory shift"
[Timeline: Today → {{date_1}} {{instrument_1}} applies → {{date_2}} {{instrument_2}} applies]
Footer: "Regulatory status as of {{date}}". [Verify every date.]

#### Slide 8: The instrument in brief

Title example: "Under the AMLR, international sanctions become an integral part of the AML framework"
- Adopted: {{date}} · Applies from: {{date}} `[VERIFY REFERENCE]`
- Where the topic appears in the instrument: [articles, verified]
- What this means: [e.g. "Sanctions must be integrated with the rest of the AML work, including the framework, risk assessments and KYC"]
- How it relates to other instruments: [e.g. "The guidelines share the structure of the regulation and largely the same content"]

Notes: [Quote the key article text in the notes, with the reference.]

#### Slide 9: Requirement areas overview

Title example: "The guidelines set requirements in five areas"
1. {{area_1}}, e.g. Governance and allocation of responsibilities
2. {{area_2}}, e.g. Exposure assessment of sanctions risk
3. {{area_3}}, e.g. KYC and screening
4. {{area_4}}, e.g. Transaction monitoring
5. {{area_5}}, e.g. Reporting and handling of frozen assets

#### Slides 10–14: One slide per requirement area ("Requirements under the guideline", *Krav enligt riktlinjen*)

Title: [the core requirement as a message]
- [Three to seven requirement bullets, paraphrased with reference]
- [e.g. "Evaluate whether the screening system fits the size, nature and complexity of the business, and review it regularly"]
- [e.g. "Calibrate the system's sensitivity, including fuzzy matching"]
- [e.g. "Control over external service providers, including a requirement for written agreements"]

---

#### Slide 15: Divider "03 What it means for {{client_short}}"

#### Slide 16: What the requirements mean for your business

Title example: "Not everything will be ready by the deadline, so a clear gap picture and an action plan are essential"

**What happens after entry into application?**
- Applies from {{date}}. Firms are expected to adapt their programmes as soon as possible.
- Supervisory focus: [verified statement or `[TO CONFIRM]`; our expectation clearly labelled as our view]

**Focus for {{client_short}}:**
- [Must be in place by {{date}}: e.g. exposure assessment, organisation, basic governance]
- [Must be started with a clear plan: e.g. list management, model documentation]

#### Slide 17: Key questions (Frågeställningar)

Title example: "Key questions on organisation and governance for {{client_short}}"

| Question | Our preliminary view |
|---|---|
| [e.g. Can the function be centralised, or must it sit separately in each country?] | [e.g. It can be central if justified, depending on whether onboarding runs in the same system. The split can mirror the AML set-up.] |
| [e.g. Where should the senior responsible person sit?] | [e.g. The legal position is unclear `[VERIFY REFERENCE]`. There is no independence requirement, but there is a seniority requirement.] |
| [e.g. Pitfalls of operating in two jurisdictions?] | [e.g. Asymmetry where the guidelines apply in one country only] |

---

#### Slide 18: Divider "04 Our support and next steps"

#### Slide 19: How we support

Title example: "We guide and support you with concrete actions in all five areas"
- Experience, expertise and method support for every requirement area
- From governing documents and process and routine descriptions to quality assurance
- Practical insight into how other institutions have organised the work

#### Slide 20: Approach

Title example: "A time-boxed discovery gives you the gap picture and a prioritised plan in four weeks"
[Phases with durations, from proposal/references/method-modules.md: e.g. A questionnaire, B validation workshops, C report and roadmap. Or a pilot in three steps.]

#### Slide 21: Next steps (Nästa steg)

| Scope and time | Secure resources | Start the work |
|---|---|---|
| Which entity or entities? Ambition level: when must everything be done? Project planning. Project structure, steering group. | Ensure competence and capacity, which often compete with daily operations | Actions taken according to plan |

**External needs:** What can {{client_short}} do with its own competence and resources? What external help is needed? What is the budget?

**Proposed next step:** {{next_step}} on {{proposed_date}}

#### Slide 22: Thank you! (Tack!)

[PROFILE: people[] for two presenters: name, title, practice, phone, email] · [PROFILE: identity.website]

#### Backup slides (optional)

- Expert background slide (see references)
- CVs of presenters (long format)
- Reference cases (consented or anonymised)
- Detailed requirement mapping table
- Sources

---

#### Variant skeleton A: firm and team introduction deck (8–12 slides)

1. **Title:** "Our Financial Crime Prevention Offering" · [PROFILE: identity.tagline]
2. **About us:** [PROFILE: boilerplate.about_long]; facts with as-of date; service lines
3. **Where we are:** office map (optional)
4. **Our FCP experience:** team size and backgrounds (three lines of defence, supervisors, FIU); client segments; five service areas, one line each:
   - *Risk assessments:* from methodological support to full assessments
   - *Interim roles:* full or part time, e.g. KYC or TM analyst, AML officer, managers
   - *Policies and frameworks:* from specific parts such as risk appetite to full frameworks
   - *Analytics and automation:* AML frameworks built on an analytical framework with a high degree of automation
   - *Validations:* one-off, or ongoing as a service
5. **Senior experts:** background examples (expert line format)
6. **Method example 1:** e.g. "Risk appetite and risk assessment: overview" or "Validation process in five stages"
7. **Method example 2** (optional)
8. **The full financial crime spectrum:** ABC, fraud, sanctions, with three or four bullets each on why it matters and how it links to AML
9. **CVs**
10. **Contact**

#### Variant skeleton B: service presentation, managed services (8–11 slides)

1. **Cover:** service name and tagline
2. **Context and contacts:** cost of compliance; supervisory attention to efficiency in fundamental processes (BWRA, KYC, TM, risk-based approach overall); competence and retention challenge; two contacts
3. **Service map:** three modules
4. **Highlight 1:** AML/CTF framework (annual review and adaptation)
5. **Highlight 2:** operational functions (KYC/CDD/EDD/ODD, TM alerts and investigations, FIU reporting, sanctions screening hits; system-agnostic)
6. **Highlight 3:** internal control (outsourced or co-sourced MLRO or compliance function)
7. **Our commitment:** dedicated team; competence matched to task complexity; cost-efficient use of internal resources; client value
8. **Senior experts:** background examples; role types (TM specialists, AML lawyers, sanctions leads, AML risk analysts, KYC specialists, data scientists, AML officers and MLROs, AML investigators)
9. **Contact**

#### Variant skeleton C: service presentation, model validation (6–12 slides)

1. **Cover**
2. **Why model validation matters**, five benefits:
   - ensures regulatory compliance
   - increases model effectiveness
   - optimises resource use (fewer unnecessary manual reviews)
   - prepares for risks (the model covers the risk areas identified in the BWRA)
   - strengthens risk management (an ineffective model may miss high-risk transactions)
3. **What validation means:** 01 what it is; 02 why it is required (national requirement `[VERIFY REFERENCE]`); 03 when; 04 who. Validation normally has a qualitative and a quantitative part.
4. **How validation is done:** five stages (planning, discovery, analysis and validation, findings and reporting, follow-up)
5. **Model inputs:** customers, products, channels, geography, risk factors and red flags, linked to the BWRA
6. **One-off validation or continuous assurance:** the benefits of validation as a service (independence, industry practice, reduced key-person risk, long-term cost efficiency, resource efficiency)
7. **What should be in place for a successful validation:** model risk framework with model inventory; validation framework; model documentation; model owner; independent validation function
8. **Our perspective:** first-time validations are challenging, so we offer support with prerequisites and validation of all or selected models, one-off or as a managed service
9. **Team and contact**

## Reference catalogues (inlined)

### Reference catalogue: claims-and-messaging.md

##### 1. Messaging building blocks

These are the messages the team's material uses repeatedly, neutralised. Use them when the profile supports them. Each needs a proof point from the profile or the brief.

| Message | Typical wording | Proof point to pair it with |
|---|---|---|
| Expertise mix | "We combine regulatory and legal expertise with strategic, operational, technical and transformation capabilities." | The team composition; backgrounds in `facts.fcp_team_backgrounds` |
| Practitioners | "Many of our consultants come from operational first-line positions in banks and other financial institutions, so we understand the practical side of AML work." | Expert background lines |
| Supervisory insight | "Experience from supervisory authorities and financial intelligence units." | Only if people in the profile have such backgrounds |
| Full lifecycle | "Supporting our clients in every step, from analysis and advice to implementation and operations." | Service lines |
| Proportionate | "Tailored to your industry and size, ensuring a proportionate response." | Segment variants of the method |
| System-agnostic | "We do not depend on the specific systems you use." | Managed services delivery model |
| Integrated FCP | "Fraud and corruption are managed as an integrated part of financial crime prevention, with efficiency gains from coordination with AML." | Combined risk assessment method |
| Low threshold | "A structured yet low-cost discovery phase, which gives decision material before investment." | Discovery offer with duration |
| Trusted adviser | "We seek to be a trusted adviser and find business-oriented solutions that fit your operating model, with a high focus on compliance." | References |

##### 2. Substantiation rules

| Claim type | Allowed source | If no source |
|---|---|---|
| Firm size, offices, founding year, client count | `facts.*` with a valid `as_of` | Omit the number |
| "Leading", "largest", "most specialised", "unmatched" | `approved_claims` with substantiation | Rephrase descriptively, e.g. "a team of [N] FCP specialists" |
| Years of experience | `people[].aml_experience_since` | Omit |
| "Our experts wrote / drafted…" | `people[].highlights` that say exactly that | Omit |
| Market and crime statistics | A primary external source with year | `[DATA NEEDED: source]`; never invent |
| Results of earlier engagements | `references[]` outcomes, with consent | A qualitative description of the client type |
| AI or automation benefits ("x % faster") | Measured firm results in the profile, or a cited study | A qualitative benefit only |
| Quotes and testimonials | Profile, with attribution and consent | No quote |
| Regulatory dates and requirements | The official text, verified | `[VERIFY REFERENCE]` |

##### 3. Weak and strong

| Weak | Strong |
|---|---|
| "Confused by regulations? Our experts wrote the rules themselves." | "Team members have taken part in drafting national AML legislation and in international standard-setting work." (If the profile confirms it.) |
| "The most specialised AML consultants on the market." | "A team of [N] specialists in AML and financial crime prevention, with backgrounds from banks, supervisors and financial intelligence units." |
| "Legacy systems? Not AMLR compliant." | "Batch monitoring and manual onboarding will be hard to reconcile with the AMLR's expectations on monitoring and data. Here is what typically needs to change." |
| "Fraud is growing by a third every year." (no source) | "[Figure] increase in reported fraud, [year] ([source])." |
| "Head of Financial Crime at a Nordic tier-1 bank: 'The workshop transformed our approach.'" (no record) | No quote, or a consented quote from the profile |
| "AMLR applies from June 2027." | "The AMLR applies from 10 July 2027." |

##### 4. Residue and leakage check (before sending)

- Search the deck, notes and file properties for every name in `identity.former_names`.
- Search for every client name used in decks that this deck was copied from.
- Remove internal slides: growth ambitions, revenue models, target client lists, go-to-market notes, "notes to self".
- Remove draft comments in any language, lorem ipsum, "X & X" and empty template slides.
- Check that the language is consistent, including headings carried over from another country's version.

## Placeholders

The blueprint text uses these placeholders. Fill each one from the request brief or the inputs. If a value is not known, write `[DATA NEEDED: …]` in the deliverable; never invent it, and never leave a `{{…}}` placeholder in a finished deliverable.

- `{{area_1}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{area_2}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{area_3}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{area_4}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{area_5}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{client_short}}` — the defined term for the client, e.g. "the Company" (brief: client.defined_term)
- `{{date}}` — the deliverable date (brief: engagement.date)
- `{{date_1}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{date_2}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{firm_name}}` — the issuing firm (brief: issuing_firm.name)
- `{{instrument_1}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{instrument_2}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{jurisdiction}}` — the jurisdiction(s) (brief: engagement.jurisdictions)
- `{{landscape_title}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{language}}` — the output language (brief: engagement.output_language)
- `{{next_step}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{proposed_date}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{topic}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{topic_title}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
