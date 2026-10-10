# FCP blueprint: Project plans and programme governance

Blueprint `project-plans-and-governance` v1.0 (stable) from the FCP blueprint library, as ANTON skill `fcp-bp-project-plans-and-governance`. Produces the governance and reporting pack for compliance and remediation programmes in financial crime prevention (AML/CTF, sanctions, fraud, model risk). The pack covers client and internal kick-off decks, a programme one-pager, a Gantt timeline, weekly steering group reports, monthly board reports and a final report. It also covers the programme tracker: hours against estimate, milestones, deliverables register, RAID log and RAG status. Use it when the firm runs or supports a remediation programme with several workstreams, for example after a gap analysis, supervisory findings or a licence readiness review, and needs consistent, decision-ready reporting from start to close.

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
- `references/…` inlined below: `mobilisation-checklist.md`.
- The other `references/…` catalogues (`programme-tracker-workbook.md`, `raid-log-and-rag.md`, `remediation-workstream-catalogue.md`, `status-phrase-bank.md`) are in the knowledge pack **FCP blueprint reference catalogues** (`fcp-blueprint-references`). When that pack is installed and active, its entries arrive in the prompt as reference text. When they are not there, work from the method above and mark catalogue-dependent content `[TO CONFIRM: catalogue not available]`.
- A neighbouring blueprint named in backticks (e.g. `gap-analysis`) → the skill `fcp-bp-<that name>`.
- A firm profile, if the brief names one, is supplied by the user; without it produce clean, neutral output and note that branding is pending.

## Method and quality bar (blueprint sections 1–14)

This blueprint covers one programme from start to close. It has six linked reporting deliverables and one tracker that feeds them all. Load it together with `_core/house-standards.md`, `_core/request-context.md` and `_core/output-formats.md`. Skeletons for every report are in `template.md`. Longer catalogues are in `references/`.

The team's own material is in Swedish. Swedish terms are given in parentheses so that output in `{{language}}` = `sv` uses the team's real headings.

### 1. Purpose and outcome

A remediation programme (åtgärdsprogram) fixes deficiencies that someone has already identified, typically in a pre-study (förstudie), gap analysis, internal audit or supervisory review. The reporting pack lets three audiences steer that work.

| Deliverable | Swedish name | Reader | Decision or action it enables | Cadence |
|---|---|---|---|---|
| Kick-off deck, client version | Uppstartsmöte | Client participants, sponsor | Agree staffing, on-site working, reporting format and frequency, contacts | Once, week 1 |
| Kick-off deck, internal version | Uppstartsmöte (intern) | Firm team | Shared understanding of client, scope, roles and working norms | Once, before client kick-off |
| Programme one-pager | One-pager / Snabb programöversikt | Client and team | Quick reference: purpose, scope, contacts, team, milestones | After kick-off, updated on change |
| Programme timeline | Tidplan | Steering group, board, team | Sequencing and dependencies, and where we are today | Updated monthly |
| Weekly report | Veckorapport | Steering group (styrgrupp) | Is each stream on plan? What needs action or a decision this week? | Weekly, Fridays |
| Monthly report | Månadsrapport till styrelsen | Board (styrelse), steering group | Is the programme delivering what the board commissioned, within time and estimate? Which risks need board attention? | Monthly, month-end |
| Final report | Slutrapport | Board | What changed, what was delivered, what remains after close, and the final hours | Once, at close |

The outcome is a programme with no surprises. Decisions are taken in time by the body entitled to take them. Deliverables are adopted and in operation, not just handed over. The board can show that it oversaw the remediation, which matters because the board is responsible for the AML/CTF framework that the programme rebuilds (section 4).

### 2. When to use / when not to use

**Use when:**
- the firm leads or co-leads a remediation programme with two or more workstreams (strömmar), a steering group and board visibility
- the programme follows a gap analysis, a pre-study for a licence application, supervisory findings, internal audit findings or an incident
- the programme is a regulatory readiness programme, for example for the EU AML package (AMLR/AMLA), or implements an AML system or model
- a single-stream project runs for more than about six weeks and has a steering group. In that case use the scaled-down variant (section 13).

**Do not use for the content of the work itself. Use these blueprints instead:**

| Need | Blueprint |
|---|---|
| The pre-study or gap analysis that triggers the programme | `gap-analysis` or `compliance-review-report` |
| Proposal, workplan and hour estimate before the programme is sold | `proposal` (its estimate is an input here) or `firm-and-team-presentation` |
| Policies, instructions, procedures, committee charters, role descriptions | `governing-documents` |
| Business-wide risk assessment or risk appetite content | `aml-ctf-risk-assessment`, `sanctions-risk-assessment`, `abc-risk-assessment`, `fraud-risk-assessment` |
| Validation of risk classification or transaction monitoring models | `model-validation-report` |
| Documentation of a new model | `model-documentation` |
| Training for the board, key roles or staff | `training-and-presentations` |

If the client runs its own PMO and the firm only contributes to the client's report, use this blueprint's content and writing rules, but use the client's template and section order.

### 3. Inputs

**Minimum to start** (enough for the kick-off deck, one-pager and timeline):

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| Programme scope: workstreams, phases, main deliverables, in and out of scope | Defines streams, numbering and every later report | Proposal or engagement letter, pre-study recommendation | Ask. Without scope no report is meaningful. Draft from the pre-study, mark `[TO CONFIRM: scope]` |
| Start date, end date and key milestones | Timeline, one-pager, milestone tracker | Proposal, client sponsor | Propose milestones from the workstream catalogue, mark `[ASSUMPTION]` |
| Trigger and background | Background slide, final "then and now" | Pre-study, gap analysis, supervisory letter | Mark `[DATA NEEDED: background and findings that triggered the programme]` |
| Governance set-up: sponsor, steering group members (roles), board meeting dates, client programme lead | Reporting lines, cadence, distribution | Client sponsor at kick-off | Propose the default (section 5, step 4), mark `[TO CONFIRM]` |
| Team staffing per stream: lead and QA role, members, on-site needs | Kick-off staffing slide, team block, participants slide | Firm programme lead | Use roles only, mark `[DATA NEEDED: staffing]` |

**For a complete weekly, monthly or final report:**

| Input | Why it is needed | Usual source | If missing |
|---|---|---|---|
| Stream status notes from the Thursday check-in | Status per stream, upcoming activities | Stream leads | Do not invent progress. Mark `[DATA NEEDED: status stream N]` |
| Hours per phase per week and hours to date | Hours table, % completed, forecast | Firm time-reporting export (codes per phase) | Leave the table with `[DATA NEEDED]` and do not compute % completed |
| Estimate per stream and phase, plus approved changes | Baseline for % completed and variance | Proposal, change log | Ask. Never re-baseline silently |
| RAID log, open and recently closed items | Issues and problems, headline indicators, follow-up | Programme tracker | State "No problems or risks reported this period" only if the stream leads confirmed it |
| Previous report | Continuity: follow-up of reported risks, removal of stale items | Last weekly or monthly report | Ask for it. Do not repeat old items without checking them |
| Deliverables register: status and adoption dates | Deliverables lists, then and now | Tracker, client decision minutes | Mark adoption as `[TO CONFIRM: adopted by …]` |
| Client-side events: recruitment, organisation changes, board and supervisor dates | Upcoming events, significant events after close | Client programme lead | Mark `[TO CONFIRM]` |
| Baseline state at programme start, per dimension | Then and now (final report) | Pre-study findings, kick-off notes | Reconstruct from the pre-study and mark `[TO CONFIRM]` |

### 4. Regulatory and professional anchors

Project governance is not regulated as such. What the programme rebuilds is. The pack must show that the remediated framework lands in the client's regulated governance, and that the decision bodies the law points to are informed and decide. Regulatory status is as of `{{date}}` and must be checked against current versions.

**EU baseline**
- Directive (EU) 2015/849 (AMLD), as amended, Article 8. Obliged entities must have policies, controls and procedures that are proportionate to their risks and approved by senior management. Programme deliverables in the governance stream must be adopted at the right level, and the reports track adoption, not only delivery.
- EBA Guidelines on the role and responsibilities of the AML/CFT compliance officer (EBA/GL/2022/05). They cover the management body's overall responsibility, the member of the management body responsible for AML/CFT and the compliance officer's reporting to the management body. Programme board reports supplement the compliance officer's reporting. They never replace it.
- EBA Guidelines on internal governance (EBA/GL/2021/05) for credit institutions and investment firms in scope. They set expectations for the management body's oversight, organisation and clear responsibilities, which remediation of the AML organisation must meet.
- EBA Guidelines on ML/TF risk factors (EBA/GL/2021/02). They are the benchmark for business-wide risk assessment and customer risk classification work packages.
- Where a stream procures an AML, screening or monitoring system: Regulation (EU) 2022/2554 (DORA) on ICT third-party risk for financial entities, applying from 17 January 2025, and, where relevant, the EBA Guidelines on outsourcing arrangements (EBA/GL/2019/02). Contract and new product or system approval are milestones, not formalities.
- **EU AML package.** Regulation (EU) 2024/1624 (AMLR), Regulation (EU) 2024/1620 (AMLA Regulation) and Directive (EU) 2024/1640 (AMLD6). AMLR applies from 10 July 2027 [VERIFY REFERENCE: confirm current application dates]. A programme that runs into 2026–2027 should state how its deliverables (policies, risk classification, systems) will meet AMLR, so that nothing built now is obsolete on the day it applies.

**National layer via `{{jurisdiction}}`.** Example: Sweden.
- Lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism (PTL) and Finansinspektionen's regulations FFFS 2017:11. They require governing documents, the business-wide risk assessment (allmän riskbedömning) and the key roles: the specially appointed executive (särskilt utsedd befattningshavare, SUB) and the central function officer (centralt funktionsansvarig, CFA) [VERIFY REFERENCE: exact chapters and sections for each role]. Remediation of the AML organisation typically creates or re-assigns these roles, and the programme must report when they are in place.
- Aktiebolagslagen (2005:551), Chapter 8, Section 4. The board is responsible for the company's organisation, which is why the board receives the monthly report. For credit institutions, Finansinspektionen's rules on governance, risk management and control also apply [VERIFY REFERENCE: FFFS 2014:1 and its current status].
- Swedish practice uses a cascade of governing documents (the team calls it the "waterfall principle", vattenfallsprincipen). The board adopts the policy, the CEO adopts the instruction, and the head of the AML/FCP function adopts procedures and underlying documents. Confirm the client's own rules for governing documents: `[TO CONFIRM: decision levels]`.
- If the programme answers a supervisory decision or findings from `{{supervisor}}`, the supervisor's deadlines and any agreed progress reporting become fixed milestones. They are reported as their own line in every monthly report.

**Professional standards (project management)**
- ISO 21502:2020 (guidance on project management), the PMI PMBOK Guide and PRINCE2. They are the source of common practice for steering groups, stage gates, RAID logs, change control and lessons learned. The team's method follows these in substance with lighter documentation. Do not cite them inside client reports unless the client uses one of them.

### 5. Method

1. **Anchor the programme in what it must fix.** Read the pre-study, gap analysis or supervisory findings and the proposal. List the deficiencies and group them into workstreams, so that every stream has a remediation objective traceable to a finding. *Why:* the final report's "then and now" comparison, the scope boundary and any later scope discussion all depend on this trace. *Judgement:* state explicitly what is out of scope. For example, "review of the existing customer base is not included in this proposal" goes on the timeline as a greyed-out bar.

2. **Design streams, phases and sequence.** Number the streams (Stream 1, 2, 3) and keep the numbers and names identical in every report until close. Split a stream into phases when a later step depends on what an earlier step finds. For example, Phase 1 validates the existing risk classification and monitoring models, and Phase 2 builds the new model on the validation findings. Apply the standard dependencies in `references/remediation-workstream-catalogue.md`:
   - quality-assure the business-wide risk assessment before setting risk appetite
   - adopt governing documents before training
   - write the requirements before any RFI
   - validate the new model before go-live
   - put interim manual measures in place while a system is procured.

   Mark cross-cutting support, such as organisation and staffing, as *ongoing* (löpande) rather than as an execution bar. Set five to eight programme milestones (milstolpar). Each must be a verifiable event, such as "New governing documents in place", "Validation complete", "New risk classification model ready" or "Programme close", and each must have a date or a week number.

3. **Turn the estimate into the tracking structure.** Take hours per stream and phase from the proposal. Create one time-reporting code per phase, mirroring the plan's rows. Consultants report against the right phase with a short description of the work, for example "Validation of risk classification" or "Procedure for customer due diligence". *Why:* the hours table in every report then comes straight from the time export, with no manual allocation. Set up the programme tracker (`references/programme-tracker-workbook.md`).

4. **Set governance and the reporting rhythm.** The default, to confirm at kick-off:
   - **Steering group:** client sponsor (CEO or member of executive management), client programme lead, firm programme lead, the SUB/CFA or head of compliance or FCP, and the system owner while a system stream runs.
   - **Board:** receives the monthly report. The final report is presented in person.
   - **Rhythm:**
     - stream leads check in with the firm programme lead every Thursday
     - consultants report hours by Friday morning
     - the weekly report goes to the steering group every Friday
     - the monthly report goes out at month-end
     - the team aligns internally before anything is sent.
   - **Escalation:** stream lead, then programme lead, then steering group, then board (`references/raid-log-and-rag.md`).
   - **Decision rights:** follow the client's document hierarchy.

   *Why a fixed weekday:* the rhythm makes reporting a by-product of the work instead of an extra task, and it gives the client a predictable moment to raise issues.

5. **Brief the team (internal kick-off).** Before meeting the client, take the team through the background, the client (licence, ownership, products per customer segment), the streams, the timeline and the roles. Each stream lead is also the stream's QA (team lead och QA). Set the working norms listed in template Part B:
   - on-site presence where the client needs it
   - transparency, with delays and problems flagged early
   - the client's working language for all documentation and communication
   - time reporting rules
   - questions go to the programme lead first and the stream lead second
   - continuous feedback, and a lessons-learned session after each completed stream.

   *Why:* a remediation team is often assembled for the engagement. Shared norms on day one prevent surprises reaching the client before they reach the programme lead.

6. **Run the client kick-off (uppstartsmöte).** Hold it on site with all consultants and the client participants, using the agenda in template Part A. Two choices matter:
   - The client presents its own business. This signals ownership and gives the team context.
   - The reporting slide shows a draft weekly report, so the client agrees a concrete format.

   Afterwards, issue the one-pager and the first document request (`references/mobilisation-checklist.md`).

7. **Mobilise the streams.** Each stream starts with workshops and with reading the existing material, then sends document and data requests and holds interviews. Book recurring workshops early, for example risk appetite workshops 1 and 2 with the CEO and the SUB. The first weekly report states that the programme started, that all streams have begun, and what each will do in the coming week.

8. **Run the weekly cycle.**
   - **Thursday:** each stream lead gives status against plan, next activities, issues and what is needed from the client. The programme lead updates the RAID log and the milestones.
   - **Friday morning:** hours are in.
   - **Friday:** the programme lead drafts the one-slide report. The team checks it internally, and it goes to the steering group.

   *Judgement calls:*
   - Escalate what the steering group can act on, and leave the rest in the log.
   - Set "on schedule" and the mood indicator honestly.
   - Remove items that are done or past their date.
   - Report a client-side dependency, such as a key person leaving or a draft not received, factually, by role, with the consequence and the action.

9. **Report monthly to the board.** Build the monthly report from the month's weekly reports and the tracker.
   - State the period covered.
   - Lead with an executive summary: where the programme stands, what remains, the headline indicators and the milestone timeline with today marked.
   - Detail each stream, then cover issues, upcoming events, hours and the timeline.
   - Follow up every risk reported in the previous month, even if it is now resolved.
   - When a report is the last monthly report, say so and say when the final report will be presented.

10. **Control change.** When the client extends or alters scope, for example by giving a stream wider responsibility, record it in the change log with its effect on hours and time. Get steering group approval and explain it in the hours commentary. Never change the estimate column without a visible note. *Why:* a final overrun that was never approved is the most common source of disputes about the engagement.

11. **Close each stream.** Hand over the deliverables. Confirm that each one was adopted by the right body and, for models and processes, that it went into operation. Run a lessons-learned session. Close the RAID items or transfer them to a named client owner (by role).

12. **Close the programme with the final report.**
    - Show the change per dimension in a "then and now" comparison (Då och Nu-läge).
    - List the deliverables per stream.
    - Set out the significant events after close: training, recruitment, continued support, system implementation.
    - Give the final hours against the estimate and explain the deviations.
    - Include the timeline and the participants.

    State that the programme now moves into operational management (operativ förvaltning). Every open item has a client owner and a date. Hold an internal programme-level lessons-learned session.

### 6. Deliverable structure

The team produces all reporting in PowerPoint (16:9). Every slide carries the confidentiality marking and a slide number. Section names and order are the team's own. The full slide-by-slide skeletons are in `template.md`, Parts A–G.

| Deliverable | Sections in order | Length | Style |
|---|---|---|---|
| **Kick-off, client** (Uppstartsmöte) | Cover; Agenda; Staffing and on-site working (Personalfrågor); Reporting (Rapportering): format, when, how; The programme at a glance (Programmet i stora drag); Overall timeline (Övergripande tidplan); one slide per stream: Assignment (Uppdrag), Team, Start and end (Start och slut); Project management and contacts (Projektledning och kontaktpersoner); Next steps | 10–12 slides | A working meeting, not a pitch. Show a draft weekly report so the format is agreed in concrete terms |
| **Kick-off, internal** | Background (Bakgrund); About the client; the client deck's programme, timeline and stream slides; Upcoming activities and prerequisites (Kommande aktiviteter och förutsättningar); Reporting, follow-up and feedback (Rapportering, uppföljning och feedback) | 10–12 slides | Informal and direct. Never sent to the client |
| **One-pager** | Quick programme overview (Snabb programöversikt): Purpose (Syfte) in one sentence, Background and scope (Bakgrund och omfattning); Project management and contact; Project team (Projektteam) per stream with the lead marked; Milestones (Milstolpar) on a vertical timeline | 1 slide | Reference card. Update it when the team or milestones change |
| **Timeline** (Tidplan) | Gantt: months and week numbers as columns, numbered work areas with responsible roles as rows, labelled bars split by phase or part; legend for execution time (tid för utförande) and ongoing (löpande); out-of-scope items greyed; current-week marker | 1 slide | Move the marker in every monthly report |
| **Weekly report** (Veckorapport) | Header (week range, programme, date); Status per stream; indicator line Project mood / On schedule; Upcoming activities (Kommande aktiviteter); Current issues and problems (Aktuella frågeställningar och problem); hours table on the right | 1 slide | Each bullet starts with the stream number. Three to six bullets per block, at most about 25 words each |
| **Monthly report** (Månadsrapport till styrelsen) | Cover; Contents (Innehåll); Executive summary: period covered, narrative, one line per stream, main activities, four headline tiles, milestone timeline with today marked; Detailed descriptions per stream (Detaljerade beskrivningar per ström), one slide each; Issues and potential problems (Frågeställningar och eventuella problem), including updates on earlier risks; Upcoming events in the near term (Kommande händelser i närtid); Hours and time spent (Timmar och tidsåtgång); Timeline | 8–11 slides | Board register: what was achieved, what it means, what comes next |
| **Final report** (Slutrapport) | Cover; Contents; Background and summary (Bakgrund och sammanfattning); Then and now (Då och Nu-läge) by dimension; Deliverables from `{{firm_name}}` (Leveranser) per stream; Significant events after close (Väsentliga händelser under [period]); Hours and time spent; Timeline; Participants (Deltagare) | 9–12 slides | Outcome-focused, showing the change, not the activity |

If the client wants a Word report instead, keep the same section order and follow `_core/output-formats.md` section 1.

### 7. Scales, scoring and calculations

**7.1 Headline indicators (the team's standard).** They appear as tiles on the monthly executive summary and as one line on the weekly report.

| Indicator | Swedish | Values | Rule |
|---|---|---|---|
| On schedule | Håller tidplanen | YES / NO | YES only if every programme milestone is forecast on or before its planned date. If NO, name the milestone and the new forecast on the same slide |
| Problems and risks | Problem och risker | NONE IDENTIFIED / n OPEN | Count open RAID risks and issues rated High or Critical (7.5). If the count is above zero, list them on the issues slide |
| Project mood | Stämningen i projektet | VERY GOOD / GOOD / MIXED / STRAINED | The team's and the client counterparts' assessment of collaboration and momentum. Below GOOD requires one line of explanation |
| Completed | Slutförandegrad | % | Hours completed ÷ current approved estimate (7.3). Label it "(based on estimated hours)" |

**7.2 RAG status.** This extends the team's material, which uses YES/NO indicators, and is used when the client or steering group expects RAG or the programme has more than three streams. Rate each stream on four dimensions (schedule, deliverables and quality, hours, dependencies and resourcing). The overall stream status is the worst dimension, unless the programme lead records why not.

| Colour | Label | Meaning |
|---|---|---|
| Green | On track | Milestones on plan; forecast hours within ±5% of estimate; no open High/Critical item |
| Amber | At risk | Slippage that can be recovered within the stream, forecast overrun of 5–10%, or a High item with a mitigation in place. The steering group is informed |
| Red | Off track | A programme milestone, a regulatory deadline or the end date will be missed, overrun above 10% or unapproved scope change, or a Critical item. A steering group or board decision is needed |
| Blue | Complete | Delivered and adopted or in operation |

The thresholds are defaults. The team should confirm them, and the full criteria are in `references/raid-log-and-rag.md`. Always show the label as well as the colour. Map to the team's indicators like this: On schedule = YES only when no stream is Amber or Red on schedule.

**7.3 Hours and completion.**
- *Completed %* = hours completed to date ÷ approved estimate, per row and in total.
- *Forecast at completion* = hours completed to date + estimate to complete (from the stream lead).
- *Variance* = forecast at completion − approved estimate. Report it in hours and %.
- *Approved estimate* = the proposal estimate + approved changes from the change log. If a row's estimate changes between reports, footnote it.
- *Progress check:* completed % on hours is not progress on deliverables. If hours % exceeds deliverable progress by more than about 15 percentage points, flag the stream for review (Amber on hours).
- The weekly table shows the previous week and the current week as separate columns (v. n−1, v. n). The monthly and final tables show totals only.

**7.4 Milestone and deliverable status.** Milestones: Completed / On track / At risk / Delayed. Deliverables follow a lifecycle and the reports say which stage applies:

| Stage | Meaning |
|---|---|
| Not started | No work begun |
| Drafting | Work in progress |
| Draft delivered | Draft sent for client review |
| Final delivered | Handed over (överlämnad) |
| Adopted | Decided by the right body under the client's document hierarchy |
| In operation | In use, for models and processes after validation |

**7.5 RAID rating.** Risks are rated Likelihood (1–4) × Impact (1–4). Issues are rated on Impact only (×4 for the score).

| Score | Label |
|---|---|
| 12–16 | Critical |
| 8–9 | High |
| 4–6 | Medium |
| 1–3 | Low |

The labels match the house 4-level scale. Never mix this with another scale in the same pack.

### 8. Supporting artefacts

- **Programme tracker workbook (Excel).** Sheets: Instructions, Programme set-up, Plan (work breakdown feeding the Gantt), Milestones, Hours, Deliverables register, RAID log, Decisions log, Change log, Lessons learned, Scales and parameters, Report feed. Columns are in `references/programme-tracker-workbook.md`. The weekly and monthly reports are filled from the Report feed sheet.
- **RAID log.** Risks, assumptions, issues and dependencies, with rating, owner (role), action, escalation level and report references. See `references/raid-log-and-rag.md`.
- **Initial document and data request** sent at kick-off, plus a mobilisation checklist. See `references/mobilisation-checklist.md`.
- **Lessons-learned record** per stream and for the programme. It is internal and feeds the next proposal.
- **Phrase bank** for status, issues, hours commentary and final-report wording in English and Swedish. See `references/status-phrase-bank.md`.

### 9. Writing rules specific to this deliverable

- **Same skeleton every time.** Stream numbers, stream names, row order in the hours table and milestone names do not change between reports. The board must be able to lay two monthly reports side by side.
- **State the period.** Every weekly and monthly report says exactly which period it covers, in one form, for example "Covers the period 1–30 April". Check it against the cover.
- **Status bullets: stream, state against plan, next step.** Example: "Stream 2 – New risk classification models for retail and corporate customers are progressing according to plan (Phase 2). Draft model ready for data testing in week 18." Weak: "Stream 2 – Work continues."
- **Dates, not seasons.** Write "Programme close: week 26, subject to contract signature", not "June sometime". A milestone without a date is a pitfall.
- **Separate delivered, adopted and in operation.** "New AML policy delivered; adoption by the board scheduled for [date]" is not the same as "new policy in place".
- **Follow through.** Every risk or issue in one report is followed up in the next one until closed: "Update on previously reported risk (see the March report)".
- **Roles, not names, in board material.** Contact and team slides may carry names from the brief (`issuing_firm.team`, client contacts). Status, issues and upcoming events use roles: "the acting SUB", "the client's procurement lead".
- **Hours commentary is relative to the proposal.** Say whether the estimate holds for time and cost, the expected deviation and its cause. Example: "The original estimates in the proposal hold for both time and cost, except for Stream 3, where `{{client_short}}` extended the stream's scope in [month] (change C-02)."
- **Do not pre-empt decisions.** In procurement, report evaluation steps and the remaining candidates. The recommendation goes in its own memo, and the decision in the client's minutes. Do not write "vendor X will probably be chosen" before the decision.
- **No unsupported benchmarks.** A statement such as "hit rate of 1–2%, which is industry standard" needs a source or must go.
- **Proofread board material.** Spelling errors in a board pack undermine the remediation message.
- **Swedish register.** Use "Bolaget" or the client's defined term, Ström 1/2/3, Fas 1/2, styrgruppen, styrelsen, SUB and CFA written out on first use, and "överlämnad" for handed over.

### 10. Quality checklist

- [ ] Period, date and version on the cover and in the executive summary are consistent and correct.
- [ ] Stream numbers, names and the hours table row order match the previous report.
- [ ] Every status bullet states the position against plan, not just activity.
- [ ] The four headline indicators are set by the rules in 7.1 and explained when not positive.
- [ ] Every risk or issue reported last time is followed up or closed. Stale items (past dates, completed actions) are removed.
- [ ] Hours: totals add up, the % is calculated against the approved estimate, any estimate change is footnoted, and the commentary explains deviations.
- [ ] Milestones have dates. The timeline's current-week marker has been moved.
- [ ] Each deliverable's stage is stated (delivered, adopted, in operation).
- [ ] Decisions needed from the steering group or board are explicit, with the date needed.
- [ ] No individual's name appears in status, issues or upcoming events. Vendor names appear only where the client has agreed to it.
- [ ] Final report: every "then" has a "now"; every open item has a client owner (role) and a date.
- [ ] House-standards checklist passed.

### 11. What makes it stand out

1. **Reporting built into the working rhythm.**
   - Thursday check-ins, Friday-morning time reporting, the Friday steering group report and the month-end board report form one chain.
   - The board report is a roll-up of facts already reported, so it is never a new story.
2. **One-glance status.** Four headline tiles and a milestone timeline with today marked answer the board's first question in five seconds: are we on track?
3. **Hours transparency against the proposal.** Every report shows hours per stream and phase against the estimate, completion % and a plain statement on time and cost. Time codes mirror the plan, so the numbers are not massaged.
4. **Traceability from finding to outcome.** Streams are designed from the deficiencies that triggered the programme. The final report closes the loop with a "then and now" table per dimension. A generic project report lists activities. This shows that the problem was fixed.
5. **Delivered is not done.** Deliverables are tracked to adoption by the right decision body under the client's document hierarchy, and models to validated go-live.
6. **Dependency-aware sequencing.** Validate before redesigning, risk assessment before risk appetite, documents before training, and interim manual controls while the system is procured. The plan follows the logic of AML remediation, not just the calendar.
7. **Continuity of risk reporting.** Previously reported risks are followed up explicitly until closed, so issues cannot quietly disappear.
8. **An explicit after-life.** The final report lists what happens after close (training, recruitment, continued support, implementation) and hands the programme over to operational management with owners.
9. **Team discipline.** The internal kick-off sets norms: transparency, early flagging, a single point of contact, QA by each stream lead and lessons learned per stream.

### 12. Common pitfalls

- **Activity lists instead of progress.** "Workshops held" does not tell the steering group whether the milestone holds.
- **Copy-forward decay.** Items from earlier weeks, such as last month's demo dates or deadlines already passed, stay in the issues and activities blocks. Rebuild those blocks every week from the RAID log and the stream notes.
- **Inconsistent period or dates.** A period label that contradicts the cover, or start and end dates in the hours table that no longer match reality.
- **Silent re-baselining.** An estimate row changes between reports without explanation. This erodes trust in every number.
- **Vague milestones** such as "early April", "sometime in June" or "after the risk assessment is done", with no forecast date.
- **Everything green.** The mood is always "very good" and problems are always "none identified" until a month before the deadline. Report Amber early. It is cheaper than Red late.
- **Names in board material.** Personal names in issues and upcoming events create personal data and blame. Use roles.
- **Pre-empting decisions,** for example signalling a vendor choice before the formal decision and approval process.
- **Unsupported claims and benchmarks** in board material.
- **Treating delivery as completion.** Reporting the programme as 100% complete while key policies await adoption or roles remain unfilled.
- **Typos in board packs and inconsistent spelling of key terms.**

### 13. Variants

| Variant | Adjustments |
|---|---|
| **Bank or credit market company** | More streams and a formal steering group with minutes. Internal audit is informed. The board risk committee may receive the monthly report. Supervisor deadlines are fixed milestones. RAG (7.2) is usually expected. |
| **Payment or e-money institution** | Licence-driven timelines. Agent and distributor networks and outsourced functions add dependency risks. The board is small, so combine steering group and board reporting if they are the same people. |
| **Consumer credit** | Often a pre-study for a new licence. Streams on governing documents, risk classification and system support are typical. KYC forms for corporate and private customers are often their own deliverable. |
| **Insurance, fund manager or investment firm** | Narrower AML scope. Distribution through third parties is a dependency. Align with existing compliance reporting cycles. |
| **Non-financial obliged entity** | One stream, biweekly reporting, a one-page monthly summary and no hours table if the engagement is fixed-fee. |
| **Small programme (one or two streams, under 3 months)** | Weekly report and final report only. The final report is 5–6 slides. The RAID log is a simple list. |
| **Large programme (5+ streams, over 6 months)** | Add a PMO role and RAG per stream, a decisions log in the monthly report, quarterly re-planning, and a dedicated "Decisions requested" slide. |
| **Low maturity client** | More hands-on drafting, interim measures and training milestones. Report capability building, such as new roles and an established committee, as outcomes. |
| **Supervisory-driven programme** | Add a "Supervisory commitments" line to every monthly report: commitment, deadline, status, evidence. Keep an evidence log per deliverable. |
| **Firm supports the client's own programme lead** | Provide stream input in the client's template. The firm's hours go to the client's programme lead, not to the board. |
| **Fixed-fee engagement** | Replace hours with deliverable progress (7.4), unless the client wants the hours. |

### 14. How the assistant should work

1. **Identify the deliverable and the moment.** Kick-off (client or internal), one-pager, timeline, weekly report, monthly report, final report, or a tracker or RAID update. If it is unclear, ask.
2. **Ask at most five questions first**, for example:
   - Which period does the report cover, and who receives it?
   - Can you share the previous report and the programme set-up (streams, phases, estimate, milestones)?
   - What is the status per stream from this week's check-in, and are hours available?
   - Which risks or issues are open, and was anything reported last time that needs follow-up?
   - Is any decision needed from the steering group or board?
3. **Production order for status reports:**
   1. Update the tracker data: hours, milestones, RAID, deliverables.
   2. Set the headline indicators by the rules in 7.1.
   3. Write the issues and upcoming blocks.
   4. Write the stream detail.
   5. Write the executive summary last, so it reflects everything above.
   6. Update the hours table and commentary.
   7. Move the timeline marker.
   8. Run the checklist.
4. **For a final report**, build the "then and now" table first from the pre-study and the deliverables register. Then write the background and summary.
5. **Stop and ask when:**
   - hours do not reconcile with the estimate or the previous report
   - an indicator would turn negative and you do not know the reason
   - an issue concerns a named individual's performance or a client-side failing that needs careful wording
   - a vendor or procurement position is not yet decided
   - adoption status is unknown.
6. **Never invent progress, hours, dates or decisions.** Use `[DATA NEEDED: …]`, `[TO CONFIRM: …]` or `[ASSUMPTION: …]`. List all markers at the end of the output for the programme lead.
7. **Text-only output:** give the slide-by-slide structure in Markdown with `[Slide n: title]` markers, the tables in Markdown and the indicator tiles as a four-row table.

## Deliverable template

The skeleton of the main deliverable in final section order. Guidance in [brackets] and HTML comments is removed before delivery; "Example:" lines are models of wording, not client facts.

### Template: programme governance and reporting pack

[The pack has seven parts, in the order they are used during a programme. Produce only the part requested. Every part is a 16:9 PowerPoint deck unless stated otherwise. Every slide carries the confidentiality marking (default "CONFIDENTIAL", in Swedish "KONFIDENTIELL") and a slide number. Write in `{{language}}`. Swedish headings from the team's material are given in parentheses.]

[Placeholders used in addition to the standard ones in `_core/request-context.md`:
- `{{programme_name}}`, e.g. "The AML programme 2026" (AML-programmet 2026)
- `{{reporting_period}}`, the reporting period, taken from `engagement.reporting_period`
- `{{week_range}}`, e.g. "4–8 May"
- `{{wk_prev}}` / `{{wk_now}}`, week numbers
- `{{start_date}}` / `{{end_date}}` and `{{start_month}}` / `{{end_month}}`
- `{{confidentiality}}`, taken from `engagement.confidentiality`.
Stream numbers and names are set once in Part A and never change afterwards.]

| Part | Deliverable | Swedish name | Length |
|---|---|---|---|
| A | Kick-off deck, client version | Uppstartsmöte | 10–12 slides |
| B | Kick-off deck, internal version | Uppstartsmöte (intern) | 10–12 slides |
| C | Programme one-pager | One-pager | 1 slide |
| D | Programme timeline | Tidplan | 1 slide |
| E | Weekly report to the steering group | Veckorapport | 1 slide |
| F | Monthly report to the board | Månadsrapport till styrelsen | 8–11 slides |
| G | Final report to the board | Slutrapport | 9–12 slides |

---

#### Part A. Kick-off deck, client version (Uppstartsmöte)

##### [Slide 1] Cover
KICK-OFF MEETING (UPPSTARTSMÖTE)
{{programme_name}}
{{date}}
[Client and firm logos if the profile allows. Confidentiality marking.]

##### [Slide 2] Agenda
1. Introductions of all participants (Presentation av alla deltagare)
2. {{client_short}} presents the business [presented by the client's sponsor]
3. Staffing and on-site working (Personalfrågor)
4. Reporting (Rapportering)
5. The programme at a glance (Programmet i stora drag)
6. Overall timeline (Övergripande tidplan)
7. The workstreams
8. Project management and contacts (Projektledning och kontaktpersoner)
9. Next steps

##### [Slide 3] Staffing and on-site working (Personalfrågor)
[Question as title: "Which {{firm_name}} staff will work on site at {{client_short}}?" Two groups: Priority (on site) and Flexible.]

| Group | Team | Number and roles | Start – end |
|---|---|---|---|
| Priority | Team 1 – [stream name] | [n] – [lead and QA, consultants] | {{start_date}} – [date] |
| Priority | Team 2 – [stream name, phase] | [n] – [roles] | [date] – [date] |
| Priority | Programme management, advice and support (flexible) | 1 – programme lead | {{start_date}} – {{end_date}} |
| Flexible | Team 2 – [phase 1] | [n] – [roles] | [date] – [date] |
| Flexible | Team 3 – [stream name] | [n] – [roles] | [date] – [date] |

[`[TO CONFIRM: workspace, access cards, system access for on-site staff]`]

##### [Slide 4] Reporting (Rapportering)
| | |
|---|---|
| **Format** | PowerPoint (see draft) [attach or show a draft weekly report from Part E] |
| **When** | Weekly on Fridays to the steering group (veckovis fredagar till styrgruppen). Check-ins with each team on Thursdays. Monthly at the end of each month to the steering group and the board. |
| **How** | The programme lead checks in with each team every Thursday. The team also aligns internally before every report. |

[Ask the client to confirm steering group members (roles), distribution list and board meeting dates: `[TO CONFIRM]`.]

##### [Slide 5] The programme at a glance (Programmet i stora drag)
The programme consists of [three] main workstreams:
1. [Stream 1, e.g. Establishing new governing documents and governance]
2. [Stream 2, e.g. Validation and development of a new customer risk classification model]
3. [Stream 3, e.g. Support for procurement of a new system for transaction monitoring and risk classification]

[Optional fourth tile for cross-cutting support, e.g. "Risk appetite" or "Organisation and staffing".]

##### [Slide 6] Overall timeline (Övergripande tidplan)
[Insert Part D.]

##### [Slides 7–9] One slide per workstream
[Title: stream name. 50/50 split: left Assignment, right Team plus Start and end.]

**Assignment (Uppdrag)**
[Group the bullets under three to four headings. Example for a governance stream:]
- Review and revision of the existing AML policy and AML instruction
- Development of new internal documents: procedure for customer due diligence (rutin för kundkännedom), procedure for monitoring and reporting
- Review and improvement of customer due diligence forms and systems: requirements and implementation of forms used online and on paper, so that adequate customer due diligence is obtained
- Organisation and staffing (governance): advice and support on an appropriate and effective future AML organisation based on external requirements and good practice. Mandates and role descriptions.

**Team.** Team [n]: [role] – team lead and QA; [roles]

**Start and end (Start och slut).** [date] – [date] [For phased streams, give one line per phase, e.g. "Phase 1 – Validation: [date] – [date]"; "Phase 2 – New model and implementation: [date] – [date]".]

##### [Slide 10] Project management and contacts (Projektledning och kontaktpersoner)
**Assignment (Uppdrag)**
- Reporting to the steering group and follow-up of deliverables
- Advice and support to the workstreams in the programme and to {{client_short}}
- Other questions and problems

| | {{firm_name}} | {{client_short}} |
|---|---|---|
| Programme lead | [name from brief] | [name from brief] |
| Contact | [e-mail, phone] | [e-mail, phone] |

**Start and end.** {{start_date}} – {{end_date}}

##### [Slide 11] Next steps
- [First workshops per stream with week number]
- [Document and data request sent [date]; responses requested by [date]]
- [First weekly report: Friday [date]]
- [Steering group meeting dates]

---

#### Part B. Kick-off deck, internal version (Uppstartsmöte, intern)

[Internal only. Never send it to the client. Informal, direct register.]

##### [Slide 1] Cover
KICK-OFF – {{programme_name}} – {{date}}

##### [Slide 2] Background (Bakgrund)
[What led to the programme. Example: "During [period], {{firm_name}} supported {{client_short}} with a pre-study of [purpose, e.g. readiness for a licence application]. A deeper analysis of the company's work against money laundering and terrorist financing led to a recommendation to set up a remediation programme to remedy the deficiencies identified." Link to the pre-study report in the team channel.]

##### [Slide 3] About {{client_short}} (Om kunden)
- Licence and supervisor: [e.g. credit market company supervised by {{supervisor}}]
- Ownership and history: [privately owned, part of a group, operating since …]
- Products and services:
  - Corporate customers: [products]
  - Private customers: [lending products; savings products]
- [Known issues relevant to the programme, from the pre-study]

##### [Slides 4–9] As in Part A
[Same slides as Part A: programme at a glance, overall timeline, one slide per stream, project management and contacts.]

##### [Slide 10] Upcoming activities and prerequisites (Kommande aktiviteter och förutsättningar)
- Kick-off on site at {{client_short}} on [day, date]. Prepare a short presentation of yourself (max 30 seconds).
- Work is done on site at the client in the first instance for [team]. Adjust to needs and your own circumstances, and agree with the people concerned in the simplest way.
- We are transparent with each other and with the client. Flag delays and problems to each other and to the programme lead as soon as they arise.
- Have fun and learn from each other.

##### [Slide 11] Reporting, follow-up and other things to remember (Rapportering, uppföljning och annat bra att ta med sig)
- **Language:** all documentation and communication is in [client's working language].
- **Time reporting:** each phase has its own code in the time-reporting system, allocated per person. Make sure you report on the right phase. Add a short description of what you worked on, e.g. "Validation of risk classification", "Procedure for customer due diligence". Report your hours every Friday morning.
- **Rhythm:** the programme lead reports to the steering group every Friday, so each stream checks in with the programme lead every Thursday (invitations will follow).
- **Questions about the programme:** contact the programme lead first and your stream lead second.
- **Feedback:** give each other feedback continuously. After each completed stream, the programme lead and the stream lead hold a lessons-learned session.
- **Where things are:** [team channel, folder structure, pre-study report].

---

#### Part C. Programme one-pager

[One slide. Title: {{programme_name}}. Four blocks.]

**QUICK PROGRAMME OVERVIEW (SNABB PROGRAMÖVERSIKT)**

*Purpose (Syfte).* [One sentence.] Example: "To support and guide {{client_short}} in strengthening its measures against money laundering and terrorist financing ("AML")."

*Background and scope (Bakgrund och omfattning).* [Two or three short paragraphs:
- the trigger (pre-study, gap analysis, supervisory findings)
- the recommendation to set up a comprehensive remediation programme
- the period ("The programme runs from [month] to [month] [year].")
- the number of consultants ("The number of consultants in the workstreams is currently [n].")]

**PROJECT MANAGEMENT AND CONTACT (PROJEKTLEDNING OCH KONTAKT)**

| {{firm_name}} | {{client_short}} |
|---|---|
| [Programme lead, phone, e-mail] | [Programme lead, phone, e-mail] |

**PROJECT TEAM (PROJEKTTEAM)**

| Stream | Members (lead marked) | Contact |
|---|---|---|
| [Stream 1 name] (Team 1) | [Name] (Team lead), [names] | [e-mails] |
| [Stream 2 name] (Team 2) | … | … |
| [Stream 3 name] (Team 3) | … | … |
| [Cross-cutting, e.g. Risk appetite] | … | … |

**MILESTONES (MILSTOLPAR)**
[Vertical timeline, date on the left and milestone on the right. Use exact dates or week numbers.]

| Date | Milestone |
|---|---|
| {{start_date}} | Programme start. Streams: [list] |
| [date] | Validation complete |
| [date] | Development of new risk classification model starts |
| [date] | New governing documents in place |
| [date] | New risk classification model ready |
| {{end_date}} | Programme close |

---

#### Part D. Programme timeline (Tidplan)

[One slide, Gantt. Title: "Timeline – {{programme_name}}". Columns are months and week numbers. Rows are the numbered work areas with the responsible roles. Bars carry the activity label.]

| Work area (responsible) | Month 1: wk … | Month 2: wk … | Month 3: wk … | Month 4: wk … | Month 5: wk … | Month 6: wk … |
|---|---|---|---|---|---|---|
| 1. Risk appetite ([role]) | | ▇ Risk appetite | | | | |
| 2. Quality assurance of the business-wide risk assessment ([role]) | | ▇ Update of business-wide risk assessment | | | | |
| 3. New internal documents ([roles]) | | ▇▇▇ New internal documents | ▇▇ | | | |
| 4. Customer risk classification and transaction monitoring ([roles]) | | ▇ Validation (Phase 1) | ▇▇ Implementation of new model (Phase 2) | ▇▇ | | |
| | | | ▇ Transaction monitoring and reporting | ▇▇ | ▇ | |
| 5. System procurement and implementation ([roles]) | | ▇ Part 1: procurement and requirements | ▇▇ | ▇ Part 2: implementation | ▇▇ | ▇▇ |
| Organisation and staffing (ongoing support as needed) | ░░ | ░░ | ░░ | ░░ | ░░ | ░░ |
| Review of existing customer due diligence ({{client_short}} and {{firm_name}}) | | | | ▒ Not included in this proposal | ▒ | ▒ |

[Legend:
- ▇ Execution time (tid för utförande)
- ░ Ongoing (löpande)
- ▒ Out of scope, greyed.
Draw a vertical marker for the current week and move it in every monthly report.]

---

#### Part E. Weekly report to the steering group (Veckorapport)

[One slide. Left two-thirds: text blocks. Right third: hours table.]

**Header.** WEEKLY REPORT {{week_range}} – {{programme_name}} | {{date}}

**Status**
[One to two bullets per stream. Start with the stream number and give the position against plan, then the next step.]
- Stream 1 – [e.g. "Policy and instruction revised; proposal for the new customer due diligence process to be presented in week [n]. Drafting of the written procedures then starts."]
- Stream 2 – [e.g. "Development of new risk classification models for private and corporate customers is progressing according to plan (Phase 2). Draft process for manual transaction monitoring prepared for private customers; corporate customers in progress."]
- Stream 3 – [e.g. "All [n] shortlisted suppliers booked for in-depth sessions in week [n]."]

**Project mood (Stämningen i projektet):** [VERY GOOD / GOOD / MIXED / STRAINED] | **On schedule (Håller tidplanen):** [YES / NO – milestone and new forecast]

**Upcoming activities (Kommande aktiviteter)**
- [Activity, stream, week number or date. E.g. "Walkthrough of the new customer due diligence process with advisers once the new AML organisation has been communicated, week [n]."]
- [E.g. "Risk appetite workshop no. 2, weeks [n]–[n]."]

**Current issues and problems (Aktuella frågeställningar och problem)**
- [Only open items for the steering group, from the RAID log. Give the ID, the issue, the consequence, the action and the owner (role). Remove items that are closed or past their date.]
- [If none: "No problems identified or reported at present." (Inga problem identifierade eller rapporterade i dagsläget.)]

**Hours (Timmar)**

Table E1: Hours per workstream

| Workstream (Strömmar) | Estimated hours (Timmar totalt) | Wk {{wk_prev}} | Wk {{wk_now}} | Hours completed to date (Timmar slutfört totalt) | % completed (% slutfört) | Start | End (Slut) |
|---|---|---|---|---|---|---|---|
| **Total** | [Σ] | [Σ] | [Σ] | [Σ] | [%] | {{start_date}} | {{end_date}} |
| Programme management, advice and support | | | | | | | |
| Advice and support on risk appetite | | | | | | | |
| **Stream 1 – [name]** | | | | | | [date] | [date] |
| [Work package 1.1] | | | | | | | |
| [Work package 1.2] | | | | | | | |
| **Stream 2 – [name]** | | | | | | | |
| Phase 1 – [name] | | | | | | [date] | [date] |
| Phase 2 – [name] | | | | | | [date] | [date] |
| **Stream 3 – [name]** | | | | | | [date] | [date] |

[Rows mirror the time-reporting codes. Footnote any estimate that differs from the proposal: "Estimate increased from [x] to [y] h, change C-0n approved by the steering group on [date]."]

[Optional for programmes with RAG: add a column "RAG" after the stream rows, or a line under Status: "Stream 1 ● Green | Stream 2 ● Amber (data delivery) | Stream 3 ● Green".]

---

#### Part F. Monthly report to the board (Månadsrapport till styrelsen)

##### [Slide 1] Cover
MONTHLY REPORT (MÅNADSRAPPORT) – {{programme_name}} – [Month Year] – {{confidentiality}}

##### [Slide 2] Contents (Innehåll)
1. Executive summary
2. Detailed descriptions per stream (Detaljerade beskrivningar per ström)
3. Issues and potential problems (Frågeställningar och eventuella problem)
4. Upcoming events in the near term (Kommande händelser i närtid)
5. Hours and time spent (Timmar och tidsåtgång)
6. Timeline (Tidsplan)

##### [Slide 3] Executive summary
[Kicker: COVERS THE PERIOD (AVSER PERIODEN) [date] – [date]. Check it against the cover.]

[Narrative, 3–5 sentences. Say where the programme stands, what was achieved in the period and what remains before close.] Example: "The programme has now been running for about [n] months and is [on plan / approaching its end]. A new model for customer risk classification has been developed during the period. What remains before the programme formally closes is [decision / contract signature / adoption of …]."

[If this is the last monthly report:] "Note that this is the last monthly report from the programme management. A final report on the work will be distributed separately and presented to the board in [month]."

[One line per stream recalling its purpose:]
- **Stream 1** develops new governing documents and customer due diligence processes and supports better internal governance and control, including the new AML organisation.
- **Stream 2** [Phase n] develops new models for risk classification of private and corporate customers.
- **Stream 3** leads the procurement of a new AML system for customer due diligence, risk classification and transaction monitoring.

**Main activities carried out during the period (Huvudsakliga aktiviteter som genomförts under perioden)**
- [Handover of new governing documents and processes]
- [Handover of new process and procedure for manual transaction monitoring (Stream 2, Phase 2)]
- [Draft of new risk classification model; data testing in progress]
- [Supplier evaluation: shortlist reduced from [n] to [n]]

**Decisions or support needed from the board** [Add when relevant, otherwise omit:] [Decision, by when, why.]

[Four tiles across the bottom:]

| ON SCHEDULE | PROBLEMS AND RISKS | PROJECT MOOD | COMPLETED |
|---|---|---|---|
| [YES / NO] | [NONE IDENTIFIED / n OPEN] | [VERY GOOD / GOOD / MIXED / STRAINED] | [n %] |

[Right panel: MILESTONES (MILSTOLPAR). A vertical timeline from Part C with a "today" marker at the report date.]

##### [Slides 4–6] One slide per stream: "Stream [n] – [name]"
[Kicker: DETAILED DESCRIPTION OF COMPLETED AND ONGOING ACTIVITIES (DETALJERAD BESKRIVNING ÖVER GENOMFÖRDA OCH PÅGÅENDE AKTIVITETER)]

[Paragraph 1: what the work in the period has mainly consisted of.]
[Paragraph 2: list of deliverables with their stage (7.4 in SKILL.md). Example for a governance stream:]
- New AML policy – final delivered; adoption by the board [date]
- New AML instruction – adopted by the CEO [date]
- New charter for the AML committee
- New procedure for customer due diligence
- New procedure for transaction monitoring
- New customer due diligence forms for corporate customers (customer-facing and internal)
- New instruction on risk appetite for money laundering, terrorist financing and financial sanctions
- New role descriptions for [SUB, CFA, head of FCP, senior AML officer, AML officer]

[Paragraph 3, where useful: how the stream is organised (phases) or a governance principle.] Example: "The governing documents follow the cascade principle: the board adopts the policy, the CEO adopts the instruction, and the head of financial crime prevention adopts procedures and underlying documents."

[Phased stream: "The stream consists of two consecutive phases. Phase 1 validates [models]. Phase 2 develops [new model, including model documentation] and documents and improves [process]." Then the status per phase.]

[Procurement stream: evaluation steps completed in the period, number of remaining candidates, the remaining steps before a formal decision (e.g. architecture mapping of current systems, request for quotation, new product approval process). Do not pre-empt the decision.]

##### [Slide 7] Issues and potential problems (Frågeställningar och eventuella problem)
**Update on previously reported risk (see the [month] monthly report for details)**
[Status of each item reported last month: resolved, or current position. Use roles, not names.]
Example: "Since a new project lead for the procurement stream was appointed by {{client_short}}, work has proceeded according to the original timetable. A procurement decision can be taken before [date]."

**New issues and risks this period**
| ID | Issue or risk | Consequence | Action and owner (role) | Decision needed |
|---|---|---|---|---|
| [I-0n] | | | | [Yes – by [date] / No] |

##### [Slide 8] Upcoming events in the near term (Kommande händelser i närtid)
**Stream 1 – [name]**
- [E.g. Presentation and summary of the programme to the board in [month]]
- [E.g. Training for the acting SUB (specially appointed executive) and the CFA (central function officer) to raise AML competence in these roles]
- [E.g. Board training in [month]; training for the new FCP function]

**Stream 2 – [name]**
- [E.g. Final delivery of the new risk classification model with model documentation and validation]

**Stream 3 – [name]**
- [E.g. Request for quotation and price negotiation; new product approval process; contract signature]

##### [Slide 9] Hours and time spent (Timmar och tidsåtgång)
**Completion rate (Slutförandegrad) [n] %** (based on estimated hours)

[n] hours worked of an estimated [n].

[Commentary relative to the proposal.] Example: "The original estimates in the proposal hold for both time and cost. We expect about [n] fewer hours than estimated, which means a lower cost for {{client_short}}."

Table F1: Hours per workstream, cumulative

| Workstream (Strömmar) | Estimated hours (Timmar totalt) | Hours completed to date (Timmar slutfört totalt) | % completed (% slutfört) | Start | End (Slut) |
|---|---|---|---|---|---|
| **Total** | | | | | |
| [Same rows as Table E1] | | | | | |

##### [Slide 10] Timeline (Tidsplan)
[Part D with the current-week marker moved.]

---

#### Part G. Final report to the board (Slutrapport)

##### [Slide 1] Cover
FINAL REPORT (SLUTRAPPORT) – {{programme_name}} – [Month Year] – {{confidentiality}}

##### [Slide 2] Contents (Innehåll)
1. Background and summary (Bakgrund och sammanfattning)
2. Then and now (Då och Nu-läge)
3. Deliverables from {{firm_name}} (Leveranser från {{firm_name}})
4. Significant events after close (Väsentliga händelser under [period])
5. Hours and time spent (Timmar och tidsåtgång)
6. Timeline (Tidplan)
7. Participants from {{firm_name}} (Deltagare)

##### [Slide 3] Background and summary (Bakgrund och sammanfattning)
[Paragraph 1: the trigger and the decision.] Example: "During [period], {{firm_name}} supported {{client_name}} ("{{client_short}}") with a pre-study of [purpose]. {{firm_name}} identified several deficiencies in the area of money laundering and terrorist financing ("AML"). After a deeper analysis, the CEO decided to set up a remediation programme to remedy the deficiencies and strengthen {{client_short}}'s resilience against financial crime."

[Paragraph 2: start, size, goal reached, transition.] Example: "The programme started in [month year]. In total, [n] consultants from {{firm_name}} took part to varying degrees. With [the final milestone, e.g. the procurement of a new AML system], the programme has reached its goal and closes. The work now moves into operational management (operativ förvaltning)."

[Paragraph 3: one line per stream on what it did.]

[Right panel: the milestones timeline, all marked completed or with the final date.]

##### [Slide 4] Then and now (Då och Nu-läge)
[Kicker: COVERS THE PERIOD [start] TO [end]. Use one row per finding that drove the programme. Write "then" factually, from the pre-study. "Now" states the change and its stage (established, adopted, in operation, in progress with date).]

Table G1: Then and now

| Dimension | {{start_month}} (then) | {{end_month}} (now) |
|---|---|---|
| **Organisation** | [e.g. No dedicated AML function] | [e.g. FCP function established in [month]] |
| | [e.g. Staff in dual roles (operations and AML)] | [e.g. Dedicated AML roles created] |
| | [e.g. Insufficient resources] | [e.g. Recruitment of head of FCP in progress, expected [date]] |
| | [e.g. No forum for decisions on high-risk customers] | [e.g. AML committee established with charter] |
| **Governing documents and governance** | [e.g. Policy too detailed, instruction too thin] | [e.g. New AML policy and instruction adopted] |
| | [e.g. Business-wide risk assessment covers too few risk factors] | [e.g. Updated business-wide risk assessment] |
| | [e.g. Manual customer due diligence process spread over many documents] | [e.g. Consolidated procedure and fewer documents] |
| | [e.g. Weakly formulated AML risk appetite] | [e.g. New instruction on risk appetite adopted] |
| **Risk classification models** | [e.g. Too few risk factors; models too simple] | [e.g. New model for private and corporate customers, validated, in operation since [date]] |
| **System support** | [e.g. Manual transaction monitoring; manual sanctions screening] | [e.g. New AML system procured; contract [date]; implementation starts [month]] |

##### [Slides 5–7] Deliverables from {{firm_name}}, one slide per stream
[Kicker: DELIVERABLES FROM {{firm_name}} (LEVERANSER FRÅN {{firm_name}}). List each deliverable with its stage. Add facts that show the effect, using the client's own data only.]

*Example for a model stream:*
- [n] validation reports handed over: risk classification of private customers; risk classification of corporate customers; manual transaction monitoring
- New risk classification model developed on the basis of the validation reports; model handed over [in the format agreed, e.g. as a workbook built for migration to the selected system]
- Model documentation handed over
- Validation of the new model completed and handed over before go-live on [date]
- New process for manual transaction monitoring pending the new system: existing scenarios adjusted and new scenarios created. [Before: n scenarios, product coverage gaps. Now: n scenarios, of which n are daily monitoring and the rest periodic sample reviews.] `[DATA NEEDED: client's own figures]`

*Example for a procurement stream:*
- Long list of supplier candidates evaluated [period]
- Candidates eliminated on stated criteria (e.g. suitability as a strategic partner, proximity of support)
- RFI sent to [n] remaining candidates and evaluated with value-based scoring of the responses
- New demonstration sessions with [n] finalists; reference customer interview held
- Recommendation of supplier presented to {{client_short}} on [date] [refer to the recommendation memo]

##### [Slide 8] Significant events after close (Väsentliga händelser under [period])
**[Stream 1 – governance]**
- [Training for key roles (acting SUB, CFA), the board and the new FCP function]
- [Recruitment of FCP roles: head of FCP, senior AML officer, AML officer]
- [Continued support from {{firm_name}} in [months] with [e.g. further updates of the business-wide risk assessment, a new country risk methodology, procedures for financial sanctions]]

**[Stream 3 – system]**
- [New product approval process]
- [Contract signature by [date]]
- [Implementation starts [month]; {{firm_name}} supports with project management and AML expertise during [months]]

[Each item has a client owner (role) and a date.]

##### [Slide 9] Hours and time spent (Timmar och tidsåtgång)
**Completion rate [n] %** (based on estimated hours)

[n] hours worked of an estimated [n].

[Commentary.] Example: "The original estimates in the proposal held for both time and cost, except for Stream 3. The deviation there is because {{client_short}} extended the scope of and responsibility for the stream compared with the original proposal (change C-0n, approved [date])."

Table G2: Final hours per workstream
[Same columns as Table F1, final figures. Show rows above 100% with a note.]

##### [Slide 10] Timeline (Tidplan)
[Final Gantt with actual bars.]

##### [Slide 11] Participants from {{firm_name}} (Deltagare)
[Per stream: programme management; governing documents and governance; validation; new risk classification models; risk appetite; system procurement. Names come from `issuing_firm.team`; add the programme lead's contact.]

| Area | Participants |
|---|---|
| Programme management | [name, contact] |
| [Stream 1] | [names] |
| [Stream 2] | [names] |
| [Stream 3] | [names] |

---

[End of pack. List all `[DATA NEEDED]`, `[TO CONFIRM]` and `[ASSUMPTION]` markers for the programme lead.]

## Reference catalogues (inlined)

### Reference catalogue: mobilisation-checklist.md

Used by: `SKILL.md` section 5, steps 4–7. It covers what the programme lead settles before and at kick-off, and the first document request sent to the client. Items marked † come from the team's own kick-off material. The others are common practice that the team should confirm.

##### 1. Before the internal kick-off

- [ ] Proposal, estimate per stream and phase, and scope boundary read; out-of-scope items listed †
- [ ] Pre-study, gap analysis or supervisory findings available to the team (team channel or folder) †
- [ ] Streams numbered and named; stream leads appointed, each also QA for the stream †
- [ ] One time-reporting code per phase set up and allocated per person †
- [ ] Draft timeline with milestones, execution versus ongoing bars, and out-of-scope items greyed †
- [ ] Draft weekly report prepared, so the format can be agreed at kick-off †
- [ ] Thursday check-ins booked per stream †
- [ ] Tracker workbook set up (Set-up, Plan, Milestones, Hours, Deliverables, RAID)
- [ ] Working language for documentation and communication confirmed †
- [ ] Confidentiality, file sharing and e-mail rules for client material agreed

##### 2. Internal kick-off: norms to state

- [ ] On-site presence per team (priority or flexible) and how to agree on adjustments †
- [ ] Transparency: flag delays and problems to each other and the programme lead early †
- [ ] Questions go to the programme lead first and the stream lead second †
- [ ] Hours reported every Friday morning on the right phase, with a short description †
- [ ] Continuous feedback, and a lessons-learned session after each stream †
- [ ] 30-second self-introduction prepared for the client kick-off †

##### 3. Client kick-off: to agree

- [ ] Participants introduced; the client presents its business †
- [ ] Staffing on site: number, period, workspace and access †
- [ ] Reporting format, frequency (weekly Friday, monthly month-end) and how it is compiled †
- [ ] Steering group members (roles), meeting rhythm and distribution list
- [ ] Board meeting dates and lead time for board papers
- [ ] Client programme lead and stream counterparts (roles) †
- [ ] Decision levels for governing documents under the client's own rules
- [ ] Supervisor deadlines or commitments, if any
- [ ] First workshops booked per stream (e.g. risk appetite workshop 1) †

##### 4. Initial document and data request

Send it within the first week. Ask for each item with a due date and a client contact. Track the responses in the tracker. Merge with stream-specific requests from other blueprints (`model-validation-report`, `governing-documents`, `aml-ctf-risk-assessment`) rather than sending duplicates.

| # | Item | Needed by stream |
|---|---|---|
| 1 | Organisation chart, mandates and role descriptions for AML roles (SUB, CFA, compliance, first line) | Governance |
| 2 | Current AML policy, instruction, procedures and any underlying documents, with the decision body and date for each | Governance |
| 3 | Rules for governing documents (who adopts what, review cycle) | Governance, programme management |
| 4 | Current business-wide risk assessment and its approval record | Risk assessment, models |
| 5 | Current risk appetite statements, if any | Risk appetite |
| 6 | Customer due diligence forms and checklists (online and paper), and the process description | Governance |
| 7 | Customer risk classification model(s): logic, risk factors, weights, documentation, distribution of customers per risk class | Models |
| 8 | Transaction monitoring: scenario list, thresholds, alert volumes and outcomes, investigation documentation, reports to the FIU (volumes only) | Models |
| 9 | Sanctions screening process and tools | Governance, system |
| 10 | System landscape: core systems, customer and transaction data flows, current AML tools | System, models |
| 11 | Product and customer overview per segment and channel | All |
| 12 | Latest internal audit, compliance and supervisory reports on AML | All |
| 13 | Board and management minutes on AML from the last 12–24 months | Governance, programme management |
| 14 | Training records for the board and staff | Training |
| 15 | Any ongoing procurement or IT project documentation | System |

Data extracts for model work (customer and transaction data) go in a separate request with a secure transfer method and data minimisation. Request volumes and aggregates where they are enough.

## Placeholders

The blueprint text uses these placeholders. Fill each one from the request brief or the inputs. If a value is not known, write `[DATA NEEDED: …]` in the deliverable; never invent it, and never leave a `{{…}}` placeholder in a finished deliverable.

- `{{client_name}}` — the client's legal name (brief: client.legal_name)
- `{{client_short}}` — the defined term for the client, e.g. "the Company" (brief: client.defined_term)
- `{{confidentiality}}` — the confidentiality marking (brief: engagement.confidentiality; default Confidential)
- `{{date}}` — the deliverable date (brief: engagement.date)
- `{{end_date}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{end_month}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{firm_name}}` — the issuing firm (brief: issuing_firm.name)
- `{{jurisdiction}}` — the jurisdiction(s) (brief: engagement.jurisdictions)
- `{{language}}` — the output language (brief: engagement.output_language)
- `{{programme_name}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{reporting_period}}` — the reporting period (brief: engagement.reporting_period)
- `{{start_date}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{start_month}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{supervisor}}` — the supervisor (brief: engagement.supervisor)
- `{{week_range}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{wk_now}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
- `{{wk_prev}}` — area-specific: take it from the brief or the inputs (see the Inputs section)
