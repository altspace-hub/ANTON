# ANTON Risk Atlas — Feature Specification

**Powered by the Threat-Path Methodology**

Version: 0.1 (initial spec)
Status: Proposed — ready for Claude Code audit and build planning
Author context: Generalisation of the Advisense CASP BWRA Threat-Path Methodology (v0.2, April 2026) into a universal ANTON feature
Intended reader: Claude Code (primary implementation partner) and the maintainers of ANTON

---

## 0. TL;DR

The CASP BWRA threat-path methodology is a beautiful instance of a *universal* risk-management pattern that has been hiding in plain sight for decades — the same causal chain shows up in ISO 31000 bowtie analysis, FMEA in manufacturing, HAZOP in process safety, CVSS in cybersecurity, and COSO ERM at board level. What makes Daniel's version special isn't the chain itself; it's that he made each link *specific* instead of averaged, and wired it to board-level appetite with explicit prevent/detect/respond mapping.

**Risk Atlas generalises that methodology into a top-level ANTON feature** that any business — not just CASPs, not just financial services — can use to:

1. **Set up** a living risk picture from scratch, guided by AI, in under a day
2. **Maintain** it as a persistent workspace (not a stale document) with trigger-based and periodic review cycles
3. **Explain** every stage to non-specialists as they work — ANTON teaches risk management while it does risk management
4. **Extend** via industry-specific `.anton` bundle packs (Restaurant Pack, SaaS Pack, Hospital Pack, Construction Pack, etc.)
5. **Connect** to the rest of ANTON — Regulatory Radar feeds it, Pathfinder researches it, the Knowledge Graph queries it, the Marketplace monetises it

Three generalisation axes make this work:

- **Structure is universal.** The seven-stage causal chain is industry-agnostic.
- **Vocabulary is industry-packed.** Typical exposure points, threats, vulnerabilities and controls ship as `.anton` bundles per industry.
- **Guidance is AI-native.** Apprentice-mode walkthroughs, Socratic elicitation, and plain-English explainers make this accessible to a bakery owner *and* a bank MLRO using the same engine.

This spec is written in Daniel's investigation-first format: audit protocol first, then affected files, then implementation order, then acceptance criteria. The full four-phase vision is documented even though Phase 1 ships first. Extend existing systems; never duplicate.

---

## 1. Strategic Context

### 1.1 Why this exists

Every business has risks. Almost no business outside heavily regulated sectors has a usable risk picture. The typical state of play is:

- A spreadsheet someone built in 2022, last touched when the auditor asked
- "Customer risk is Medium-High" scores that tell the board nothing and the floor staff less
- Controls listed generically ("we have transaction monitoring", "we have a firewall") with no mapping to what they actually prevent
- A risk appetite statement that is either missing or so vague it cannot be used to say yes or no to anything

The Advisense BWRA methodology solved this for CASPs. It converts the risk picture from a set of scores into a *causal story* — exposure → threat → vulnerability → inherent risk → controls (prevent/detect/respond) → residual risk → appetite — that management can challenge link by link. This structure is not specific to crypto, or AML, or even financial services. It maps almost exactly onto:

- **ISO 31000 + Bowtie** (threats → top event → consequences, with preventive and recovery barriers) — Wolters Kluwer's Bowtie Suite, used across oil & gas, aviation, maritime, and nuclear, is essentially the same chain
- **NIST Cybersecurity Framework** (Identify → Protect → Detect → Respond → Recover) — the PDR triad is literally the same
- **FMEA / HAZOP** in engineering (failure modes → causes → effects → controls)
- **COSO ERM** at board level (risk identification → assessment → response → appetite)
- **OWASP Threat Modelling** in software (STRIDE, attack trees, mitigation mapping)
- **HACCP** in food safety (hazards → critical control points)

The generalisation claim is therefore strong, not speculative. What ANTON adds on top of the existing frameworks is:

1. **AI guidance** — the methodology is hard to apply without a specialist; ANTON becomes the specialist
2. **Persistence** — the Atlas is a living workspace, not an annual Word document
3. **Portability** — `.anton` bundle packs let industries share proven threat catalogues
4. **Cross-workflow intelligence** — the knowledge atom layer can detect when a risk pattern repeats across clients, engagements, or time
5. **Compliance-as-code wiring** — the appetite thresholds become enforceable rules everywhere else in ANTON

### 1.2 Where this sits in the ANTON pillar structure

**Work pillar, top-level feature.** Risk Atlas is analogous to Markets, Pathfinder, Missions, and the Regulatory Radar — a persistent workspace with its own navigation, not just a module. It is powered by modules in an upgraded Area 6 (Risk — renamed to "Enterprise Risk" for clarity) and integrates with modules in Area 1 (FCP), Area 9 (Cybersecurity), Area 5 (Audit), Area 11 (Project Management), and the Compliance-as-Code system.

Later phases extend it into:
- **Life pillar** (personal risk — household, travel, finances) via a simplified "Personal Risk Check" mode
- **School pillar** (school safeguarding, educational risk assessments) via the safeguarding pack
- **Civic / Procure / Grow** (new pillars) once those ship

### 1.3 Competitive and commercial framing

ANTON Risk Atlas competes on a different axis than existing tools:

| Category | Representative products | What they give | What they miss |
|---|---|---|---|
| **GRC platforms** | LogicGate, ServiceNow GRC, MetricStream, Archer | Large enterprise register, workflow, attestation | Expensive, slow to configure, no AI guidance, designed for CISO/CRO, not SMEs |
| **Bowtie tools** | Wolters Kluwer BowtieXP / BowTieServer | Excellent visualisation and methodology | No AI, no shared industry libraries, no marketplace, paid per seat |
| **Risk register spreadsheets** | Excel templates, Notion templates | Free, familiar | Stale immediately, no causal structure, no guidance |
| **RegTech point solutions** | Flagright, ComplyAdvantage | Operational compliance execution | No risk-assessment layer at all |
| **General AI assistants** | ChatGPT, Claude.ai | Can answer questions | No persistent Atlas, no methodology scaffolding, no industry packs |

**ANTON Risk Atlas positioning:** the only tool that gives a small business a professional-grade threat-path risk picture with an AI guide, that costs on the order of API calls rather than six-figure GRC licences, and that doubles as a professional-grade tool for regulated institutions. Same engine, different industry pack.

This is the **APCI thesis applied to risk management.** The model layer is commoditised; the value sits in the structured methodology plus the industry-specific context. We open-source the engine (Apache 2.0) and sell the certified industry packs and managed packs (Red Hat model).

### 1.4 Hype layer angle

Risk Atlas is visually compelling. A living causal-chain map with red/amber/green flows, threat path cards that read like a detective story ("Fraud proceeds cash-out: the scam victim sends money through your fiat on-ramp..."), and a board pack that writes itself — this demos extremely well. For the tech-bro / AI-influencer visibility track, Risk Atlas is a strong candidate for the demo video ("I built a risk assessment for a pizza restaurant in 12 minutes, and it's better than what most banks had 5 years ago") because it crosses the "holy shit, that's actually useful" threshold for both a non-specialist audience and a compliance audience simultaneously.

---

## 2. Core Thesis: The Three-Layer Generalisation

The feature works because three layers are cleanly separated:

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: UNIVERSAL METHODOLOGY (industry-agnostic)          │
│  Seven-stage causal chain. Scoring rubric. Control mapping.  │
│  Appetite framework. Maintenance cycle. Residual calculus.   │
│  THIS NEVER CHANGES ACROSS INDUSTRIES.                       │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2: INDUSTRY PACK (per-industry knowledge)             │
│  Typical exposure points. Threat catalogue. Vulnerability    │
│  library. Control taxonomy. Regulatory tie-ins. Appetite     │
│  heuristics. Board-reporting templates.                      │
│  Shipped as .anton bundles. Open packs + certified packs.    │
├─────────────────────────────────────────────────────────────┤
│  LAYER 3: AI-GUIDED WORKSPACE (per-user experience)          │
│  Socratic walkthrough. Plain-English explainers. Apprentice  │
│  progression. Draft-and-challenge mode. Maintenance prompts. │
│  Draws on Layers 1 + 2 + user's business context.            │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Layer 1 — Universal Seven-Stage Causal Chain

Lifted verbatim from the CASP BWRA methodology with only terminology adjustments for generality:

| Stage | Core question | Generalised name |
|---|---|---|
| 1 | What in the business creates exposure? | **Business Context & Exposure Map** |
| 2 | Which harm scenarios are credible? | **Threat Path Catalogue** |
| 3 | Which features make threats plausible? | **Vulnerability Register** |
| 4 | How severe is exposure before controls? | **Inherent Risk** (per path) |
| 5 | Which controls prevent, detect, respond — how strong, what evidence? | **Control–Vulnerability Matrix** |
| 6 | What's left after controls? | **Residual Risk** (per path) |
| 7 | Is what's left acceptable, and what action follows? | **Risk Appetite & Escalation Triggers** |

**Universal scoring rubric:** 1-5 on each of exposure, threat credibility, vulnerability severity, control strength. Inherent = max of the three factors (chain is as weak as its weakest link — same as Daniel's methodology). Residual adjustment: Strong controls reduce by 2 levels, Adequate by 1, Weak by 0. Appetite bands: 1-2 within, 3 at boundary, 4 outside, 5 unacceptable.

**Universal maintenance cycle** (lifted from the CASP methodology Appendix B):

| Activity | Default frequency | Trigger-based override | Default owner role |
|---|---|---|---|
| Full Atlas review | Annual | Material business change | Risk Owner |
| Threat catalogue update | Semi-annual | New typology / incident / intel feed | Risk Owner + Subject Matter Expert |
| Control effectiveness check | Quarterly | Control change / incident | 2nd line or Internal Audit |
| Residual re-scoring | Quarterly | Control quality change | Risk Owner |
| Appetite review | Annual | Any path reaches 4+ | Board / Leadership |
| Regulatory alignment check | On new regulation | Always | Compliance |

Roles are parameterised per industry (MLRO in a bank, Quality Manager in food, CISO in SaaS, Head of Operations in a small business).

### 2.2 Layer 2 — Industry Packs as `.anton` Bundles

This is where the commercial and community flywheel lives. An **Industry Risk Pack** is an `.anton` bundle of a new bundle type `risk-atlas-industry-pack`, containing:

- Typical exposure points for that industry (with descriptions)
- Starter threat path catalogue (with typical inherent-risk scores for the segment)
- Vulnerability library (with severity benchmarks)
- Control taxonomy (with prevent/detect/respond roles pre-assigned)
- Regulatory tie-ins (linked to Regulatory Radar feeds for that industry)
- Default appetite framework and escalation triggers
- Board-reporting templates tuned for that audience
- Glossary of industry-specific terms with plain-English explanations

**Phase-1 industry pack catalogue** (suggested build order — pressure-test with real users before committing):

1. **Financial Crime Prevention / CASP** (the reference pack — ship Daniel's NordicCrypto example unchanged)
2. **Financial Crime Prevention / Bank** (general obliged entity — drops the crypto-specific parts, adds correspondent banking, trade finance, cash-intensive business)
3. **SME general** (generic small business — the default on first launch for the majority of users)
4. **SaaS / tech startup** (data breach, service outage, vendor risk, churn, compliance)
5. **Restaurant / hospitality** (food safety, staff injury, license, fire, supplier)
6. **Construction / trades** (worker safety, project overrun, supplier default, environmental)
7. **Healthcare clinic** (patient safety, data protection, license, equipment failure)
8. **E-commerce / retail** (fraud, chargeback, inventory, data breach, vendor)
9. **Manufacturing SME** (product recall, supply chain, environmental, workforce)
10. **Non-profit / NGO** (donor fraud, volunteer safety, mission drift, safeguarding)

**Phase-2 certified packs** (paid, maintained, audited):

- AMLR-aligned Bank Pack (Advisense-certified, quarterly updates, regulatory opinion included)
- MiCA-aligned CASP Pack
- DORA-aligned Financial Institution Pack
- EU AI Act Annex III High-Risk System Pack (for AI vendors)
- ISO 27001/27002 Control Mapping Pack
- HIPAA-aligned US Healthcare Pack
- NIS2-aligned Critical Infrastructure Pack

**Phase-3 community packs** (open submission, peer-reviewed):

Anyone can publish a pack. Reviewed packs get a community badge. Certified packs get Advisense/partner badge. This is exactly the WordPress plugin model — open marketplace with quality signals.

### 2.3 Layer 3 — AI-Guided Workspace

The workspace is where a bakery owner and a bank MLRO both end up working, just with different packs loaded. Four interaction modes cover the range:

**Socratic mode** (default for new users): ANTON asks one question at a time, explains *why* it's asking, and drafts the Atlas entries from the answers. "Tell me about your business — what do you sell, to whom, and how?" → proposed Exposure Map → user reviews and edits → next stage.

**Draft-and-challenge mode** (default for intermediate users): ANTON generates a full draft Atlas from a short business description plus the chosen industry pack, then walks the user through each entry, challenging assumptions and inviting edits.

**Expert mode** (power users, MLROs, CROs): ANTON treats the user as the expert. Minimal explainers. Heavy use of the typed knowledge atom layer for cross-engagement reuse.

**Autonomous mode** (earned autonomy, per the APCI model): ANTON runs scheduled maintenance cycles and proposes updates unsupervised. The user reviews a weekly digest instead of doing the work.

All modes draw from the same data model. The mode determines the verbosity of the AI layer, not the underlying structure.

---

## 3. The Full Four-Phase Vision

Even though Phase 1 is what ships first, the complete vision is documented so that architectural decisions in Phase 1 don't paint Phases 2-4 into a corner.

### Phase 1 — Single-Organisation Risk Atlas (MVP)

One user builds and maintains an Atlas for their own business. Industry pack selected at setup. Seven stages implemented end-to-end with Socratic and Draft-and-challenge modes. Maintenance cycle configurable. Outputs: board pack (docx/pdf), threat path cards, residual heat map, appetite statement. Export to `.anton` bundle for portability. Connected to Regulatory Radar so new regulations flag affected paths. Connected to Cross-Workflow Intelligence so knowledge atoms flow into the graph.

**Ship target:** Part of v0.7 (following v0.6 current sprint). ~6-8 weeks engineering.

### Phase 2 — Multi-Entity and Enterprise Risk

One Atlas owner manages Atlases for multiple entities (parent company, subsidiaries, client engagements). Role-based access control via the `connected_user` model (Companion App Gateway). Cross-entity aggregation: "show me all paths at 4+ across all subsidiaries". Quality Ratchet applied to the Atlas itself (audit trail of how residual moved over time). Compliance-as-Code rules can reference Atlas state ("no output in FCP area if institution's TP-3 residual is 4+ without board attestation on file").

**Ship target:** v0.8-v0.9. Reuses `connected_user` role and RBAC from Companion App Gateway — do not build a separate access model.

### Phase 3 — Atlas-as-Marketplace

The `.anton` bundle format makes Atlases fully portable. Certified industry packs ship through the marketplace. Community packs follow. Atlas templates (e.g., "AMLR-ready Bank Atlas starter") are a compound bundle type. Revenue share with pack authors if they choose monetisation. This is where ANTON starts monetising professional knowledge at scale.

**Ship target:** Aligns with the broader Marketplace rollout (Layer 5 of the six-layer vision).

### Phase 4 — Beehive and Connected Enterprise Planning

Atlases from different legal entities can deliberate via the Beehive. A supply chain's worth of suppliers can pool anonymised threat path frequencies to build sector-wide threat intel. A parent entity can see which of its subsidiaries' paths contradict each other, and where controls are redundantly duplicated. Collaborative `.anton` bundles capture the inter-entity deliberation with signed attribution. This is Connected Enterprise Planning expressed through risk.

**Ship target:** After AAP (ANTON Agent Protocol) and Beehive are live.

---

## 4. Architecture

### 4.1 Data model — tables to add

Investigation-first: read the existing schema in full before creating any tables. In particular, **check whether the `knowledge_atoms`, `entity_nodes`, `entity_relationships`, `checkpoint_decisions`, `deadlines`, `projects`, `workflow_executions` tables can be reused or extended** before writing new ones. The 11 entity types already include `risk`, `control`, `regulation`, `client`, `process` — several of these map directly.

The following new tables are proposed; the build will refine these after the audit:

**`risk_atlases`** — one row per atlas
- `id`, `name`, `owner_user_id`, `entity_id` (FK to entity_nodes — the business being assessed), `industry_pack_id`, `status` (draft/active/archived), `mode` (socratic/draft/expert/autonomous), `created_at`, `updated_at`, `last_review_at`, `next_review_due_at`
- FK to `projects` table (existing) — an Atlas is a specialised project type, reuse existing project plumbing

**`atlas_exposure_points`** — Stage 1 entries
- `id`, `atlas_id`, `name`, `description`, `category` (e.g., service, customer_segment, channel, partner, geography), `created_at`, `updated_at`
- No scoring at this layer — this is just the map

**`atlas_threat_paths`** — Stage 2 entries
- `id`, `atlas_id`, `path_code` (TP-1, TP-2...), `name`, `description`, `source_pack_path_id` (nullable — if adopted from an industry pack), `created_at`, `updated_at`

**`atlas_threat_path_exposures`** — join table (many-to-many)
- `threat_path_id`, `exposure_point_id`, `order_in_path` (so we can draw the chain in the right sequence)

**`atlas_vulnerabilities`** — Stage 3 entries
- `id`, `atlas_id`, `vuln_code` (V-1, V-2...), `name`, `description`, `severity` (1-5), `source_pack_vuln_id` (nullable), `created_at`, `updated_at`

**`atlas_threat_path_vulnerabilities`** — join
- `threat_path_id`, `vulnerability_id`

**`atlas_inherent_scores`** — Stage 4 (one row per threat path)
- `threat_path_id`, `exposure_score`, `threat_score`, `vulnerability_score`, `inherent_score` (max of three), `rationale`, `scored_at`, `scored_by`

**`atlas_controls`** — Stage 5 entries
- `id`, `atlas_id`, `control_code`, `name`, `description`, `type` (prevent/detect/respond), `strength` (strong/adequate/weak), `evidence` (text), `owner_role`, `source_pack_control_id` (nullable)

**`atlas_control_vulnerability_map`** — the heart of the matrix
- `control_id`, `vulnerability_id`, `type` (prevent/detect/respond — because one control can play multiple roles)

**`atlas_residual_scores`** — Stage 6 (one row per path, regenerated when controls change)
- `threat_path_id`, `residual_score`, `control_quality_rollup` (strong/adequate/weak), `open_vulnerability_notes`, `calculated_at`

**`atlas_appetite_statements`** — Stage 7
- `id`, `atlas_id`, `threat_path_id`, `appetite_position` (within/boundary/outside/unacceptable), `required_action`, `target_date`, `budget`, `approved_by`, `approved_at`

**`atlas_escalation_triggers`** — generic triggers (not per-path)
- `id`, `atlas_id`, `trigger_event`, `required_action`, `timeline`

**`atlas_review_cycles`** — the maintenance schedule
- `id`, `atlas_id`, `activity` (full_review/threat_update/control_test/residual_rescore/appetite/regulatory_check), `frequency`, `next_due_at`, `last_run_at`, `owner_user_id`, `reuses FK to deadlines table (existing)`

**`atlas_events`** — the activity ledger (append-only)
- `id`, `atlas_id`, `event_type`, `payload` (JSON), `user_id`, `created_at`
- Event types: `path_added`, `vuln_added`, `control_updated`, `residual_recalculated`, `appetite_changed`, `regulator_change_linked`, `incident_linked`, `review_completed`, etc.

**`atlas_industry_packs`** — registry of installed packs
- `id`, `name`, `version`, `source` (built-in/community/certified), `pack_bundle_uri`, `installed_at`, `certified_by` (nullable)

**Reuse where possible:**
- `knowledge_atoms` — every Atlas entry generates atoms of type `risk`, `control`, `finding`, `recommendation` so the whole Atlas flows into Cross-Workflow Intelligence automatically
- `entity_nodes` / `entity_relationships` — threat paths, vulnerabilities, and controls all become entities; relationships (`mitigates`, `enables`, `requires`) are edges; this gives us graph queries for free
- `checkpoint_decisions` — every scoring decision is a checkpoint so the decision history is preserved
- `deadlines` — every review cycle and remediation target is a deadline so the existing SLA monitoring covers them

### 4.2 The seven-stage engine

Each stage is implemented as a module in the upgraded **Area 6: Enterprise Risk**:

| Module ID | Purpose | Key differences from existing FCP BWRA module |
|---|---|---|
| `atlas-exposure-mapper` | Stage 1 | Industry-pack-driven, generic across sectors |
| `atlas-threat-cataloguer` | Stage 2 | Threat path format, not generic category format |
| `atlas-vulnerability-assessor` | Stage 3 | Severity scoring with industry benchmarks |
| `atlas-inherent-scorer` | Stage 4 | Per-path, max-of-three rule hardcoded |
| `atlas-control-mapper` | Stage 5 | Prevent/detect/respond triad, evidence-required |
| `atlas-residual-calculator` | Stage 6 | Deterministic calculation with rationale |
| `atlas-appetite-manager` | Stage 7 | Board-statement generator, escalation trigger builder |

Each module is a full seven-layer prompt assembly. The modules can be invoked standalone (for focused work) or orchestrated through the Atlas workspace (for end-to-end flow).

**Relationship to the existing FCP BWRA module (`business-wide-risk-assessment`):** deprecate the standalone module but keep it working for backwards compatibility. Mark it as "superseded by the Risk Atlas (FCP pack)" with a one-click migration that converts the old output into a new Atlas. Do not delete — some users will have built workflows around it.

### 4.3 AI-guided explainer layer

This is the part that makes Risk Atlas accessible to a non-specialist. Five components:

**1. The Coach persona.** A new persona in the persona library — "Risk Coach" — trained on the methodology from first principles. Explains why we score exposure × threat × vulnerability the way we do, what a "threat path" actually is, why a causal chain is more useful than a matrix, what a "prevent" control looks like versus "detect" versus "respond". Always injected at Layer 4 of the seven-layer prompt for Socratic and Draft modes.

**2. Stage explainers.** Each stage has a plain-English explainer that is shown on first entry. The explainer contains a live worked example drawn from the currently loaded industry pack ("Here's what the exposure map looks like for a restaurant..."). Users can collapse the explainer once they're comfortable.

**3. Socratic elicitation scripts.** For each stage, a scripted question sequence that teases out the information from a non-specialist. "Tell me about your customers. Are most of them individuals, or businesses? Do you meet them in person, or is everything remote?" drives the Exposure Map for Stage 1. Scripts are shipped *per industry pack* because the right questions for a restaurant are not the right questions for a SaaS firm.

**4. Challenge mode.** After each stage, ANTON plays devil's advocate. "You've marked TP-4 as Low inherent risk, but your exposure score was 4 and your threat score was 5. The methodology requires the inherent score to be the max of the three. Do you want to override, or shall we re-examine?" This is the Quality Ratchet applied to the assessment itself.

**5. Glossary-in-context.** Every domain term on the screen has a hover/tap explainer. "Residual risk" → "the risk that remains after your controls are applied — think of it as what's still exposed once you've done everything you can reasonably do today". The glossary entries are per-industry where the same term carries different connotations (e.g., "customer" in AML vs "customer" in SaaS).

### 4.4 Maintenance cycle mechanics

The maintenance cycle is not a reminder system; it's an active review workflow. Specifically:

**Periodic reviews** are scheduled by creating entries in the existing `deadlines` table. When due, they spawn a review session in the Atlas workspace. ANTON pre-generates the delta: "Since your last review, these things changed — Regulatory Radar logged 3 new items relevant to your Atlas; Pathfinder found 2 new typology reports in your industry; your `atlas_events` log shows 7 control updates." The review session walks the user through the delta and prompts re-scoring where appropriate.

**Trigger-based reviews** fire automatically when:
- A regulation in Regulatory Radar with a tag matching any of the Atlas's threat paths is updated (wired via the existing Regulatory Radar integration)
- A knowledge atom of type `risk`, `finding`, or `recommendation` is extracted from another ANTON session that mentions entities also in this Atlas (wired via the Knowledge Graph — if a control entity appears in a new finding, flag it)
- An external event is linked to the Atlas (user reports an incident, near-miss, supervisory finding — lightweight event intake form)
- A `.anton` industry pack update is published (notify, diff, offer to apply)

**Pattern-detection integration.** Layer 4 of the Cross-Workflow Intelligence funnel (pattern detectors) can surface cross-engagement patterns in Atlas state — "Three of your clients have TP-7 at 4+; there's a common industry issue here" — turning individual Atlases into sector-wide intelligence for consulting practices.

**Compliance-as-Code integration.** Atlas state is queryable by the compliance rule engine. Example rule: "No board pack may be approved for any FCP client whose Atlas has any threat path at residual 5." Or: "All AMLR clients must have a completed Stage 7 appetite statement with board sign-off within 18 months, and Compliance-as-Code flags any output that references an obliged entity whose Atlas does not meet this condition."

### 4.5 UX walkthrough

**Entry points:**
1. New top-level navigation item "Risk Atlas" under Work (and, later, a simplified version under Life)
2. Command palette "create risk atlas for [business name]"
3. Deep link from Regulatory Radar ("this rule affects risk paths — link to Atlas")
4. Deep link from other modules (e.g., the FCP Gap Analysis module suggests promoting its findings into the Atlas)

**First run (onboarding):**
1. Pick industry pack (or accept the "SME general" default — always default to *something* working)
2. Business description (1-2 paragraphs, free text — the AI extracts exposures)
3. Choose mode (Socratic for new to risk, Draft for experienced, Expert for CROs)
4. ANTON drafts Stages 1-2 from the description + pack; user reviews
5. Stages 3-6 built interactively; ANTON flags where user input is needed vs where it can default from pack
6. Stage 7 requires explicit user action (appetite is a judgement call, not a calculation)
7. Board pack generated and exported

**Ongoing (the workspace):**
- Dashboard: heat map of all paths by residual position, colour-coded; list of paths outside appetite; next review dates; recent events
- Per-path view: the threat path card (as in Appendix A of the CASP methodology) — exposure, threat, vulnerabilities, inherent, controls, residual, appetite — editable inline
- Control view: all controls across all paths, filterable by type/strength, with an "untested" flag for controls without recent evidence
- Events timeline: the audit trail
- Maintenance view: scheduled reviews, overdue items, trigger feed

**Output generation:**
- Board pack (docx) — uses the pptx/docx skill, themed per industry (Advisense brand for AMLR-aligned clients, generic for SMEs)
- Regulator-ready package (pdf) — structured for NCA inspection in regulated sectors
- Threat path cards (individual pdf) — one per path, for team distribution
- Heat map (svg/png) — the residual matrix
- Appetite statement (standalone docx for board minutes)
- Full Atlas export (`.anton` bundle) — for sharing, archiving, or handing to a successor

### 4.6 Integrations (existing ANTON systems to wire into)

- **Seven-layer prompt system:** every Atlas module uses the standard assembly (Base Context → Area Context [Risk] → Module Expertise → Persona [Risk Coach] → Skills [industry pack methods] → Knowledge [industry pack content + user's docs] → Transparency)
- **Cross-Workflow Intelligence (5-layer funnel):** Atlas outputs auto-extract to knowledge atoms; entities flow to knowledge graph; pattern detectors apply
- **Knowledge Graph (11 entity types, 10 relationship types):** `risk`, `control`, `regulation` entity types are directly used; `implements`, `requires`, `supports` relationships wire regulations to controls
- **Regulatory Radar:** bidirectional — regulations feed Atlas; Atlas state filters Radar alerts
- **Compliance-as-Code:** Atlas state is queryable as a data source for rules
- **Quality Ratchet:** the Atlas itself is a quality-scored artefact over time; audit trail of how residual moved
- **Checkpoint Decisions:** every scoring decision becomes a checkpoint so interpretations carry across Atlases
- **Deadlines:** review cycles and remediation targets
- **Projects:** each Atlas is a project
- **`.anton` bundle format:** industry packs, Atlas exports, Atlas templates
- **Companion App Gateway (Phase 2):** `connected_user` role for stakeholders who need read-only Atlas access without a full ANTON seat
- **Missions (Phase 2):** a mission can be "run the Q4 review cycle on the Atlas; propose updates"
- **Beehive (Phase 4):** multi-entity Atlas deliberation
- **Pathfinder:** "research the latest fraud typologies in my industry" → proposes Atlas updates
- **Coding Area:** a Script Medium project template "Atlas Importer" can pull existing risk-register spreadsheets into the Atlas format as a migration tool
- **Markets (later, loosely):** AI consul personas can be recycled as Atlas reviewer personas — the Macro Strategist pattern maps to a "Senior Risk Officer" reviewer pattern

---

## 5. Investigation-First Audit Protocol (for Claude Code)

Before writing a line of code, Claude Code must complete the following audit. Any decisions in Section 6 depend on findings here.

### 5.1 Existing schema audit

```bash
# 1. Confirm the relevant existing tables and their shape
grep -r "CREATE TABLE" server/db/migrations/ | grep -iE "(risk|control|regulation|atom|entity|decision|deadline|project|workflow|event|audit)"

# 2. Check the 11 entity types — are 'risk' and 'control' already used this way?
grep -rn "entity_type" server/db/ server/src/ --include='*.ts' --include='*.sql' | head -30

# 3. Relationship types — confirm 'mitigates' / 'implements' vocabulary
grep -rn "relationship_type" server/db/ server/src/ --include='*.ts' --include='*.sql' | head -30

# 4. Existing FCP BWRA module
ls -la server/areas/fcp/modules/ | grep -i bwra
cat server/areas/fcp/modules/business-wide-risk-assessment/module.json
cat server/areas/fcp/modules/business-wide-risk-assessment/system-prompt.md

# 5. Existing Risk area (Area 6)
ls -la server/areas/ | grep -i risk
ls -la server/areas/risk/modules/

# 6. Seven-layer prompt assembly
cat server/src/prompt-builder.ts | head -200

# 7. .anton bundle handling — existing bundle types and registration
grep -rn "bundle_type\|bundleType" server/src/ --include='*.ts' | head -40
cat server/src/anton-bundler.ts | head -100
cat server/src/antonImport.ts | head -100
cat server/src/antonExport.ts | head -100

# 8. Regulatory Radar integration surface
grep -rn "radar" server/src/ --include='*.ts' | head -30

# 9. Compliance-as-Code rule engine
cat server/src/compliance-rules-engine.ts 2>/dev/null || grep -rn "compliance_rule" server/db/migrations/

# 10. Quality Ratchet / quality scoring
grep -rn "quality_score\|qualityScore\|qualityRatchet" server/src/ --include='*.ts' | head -20

# 11. Knowledge atom extraction
cat server/src/atom-extractor.ts 2>/dev/null || grep -rn "knowledge_atom\|extractAtom" server/src/ --include='*.ts' | head -20

# 12. Project storage pattern
cat server/db/migrations/*projects*.sql
cat client/src/pages/ProjectsPage.tsx | head -100
```

### 5.2 Module convention audit

```bash
# Module directory structure
tree server/areas/fcp/modules/business-wide-risk-assessment -L 2

# How a module JSON is shaped
cat server/areas/fcp/modules/amlr-gap-analysis/module.json

# How guided inputs are defined
grep -rn "guidedInputs" server/areas/ --include='*.json' | head -10

# Area context structure
cat server/areas/risk/area-context.md 2>/dev/null || ls server/areas/risk/

# Persona definitions
ls server/personas/
cat server/personas/senior-mlro.json 2>/dev/null || cat server/personas/*.json | head -50
```

### 5.3 UI convention audit

```bash
# Existing page pattern
ls client/src/pages/ | head -40
wc -l client/src/pages/*.tsx | sort -n | tail -20

# How workspace-style features are built (Pathfinder, Markets, Radar)
ls client/src/pages/ | grep -iE "(pathfinder|markets|radar)"
cat client/src/pages/PathfinderPage.tsx 2>/dev/null | head -80
cat client/src/pages/MarketsPage.tsx 2>/dev/null | head -80

# Navigation pattern — where top-level items live
grep -rn "navigation" client/src/ --include='*.tsx' | head -20
```

**Do not proceed to Section 6 until Sections 5.1-5.3 are complete and findings are summarised in a pre-implementation memo.** The memo should explicitly state: which tables can be reused vs created new, whether the existing Area 6 Risk has modules (and if so what they are), and whether the existing FCP BWRA module can be extended or needs superseding.

---

## 6. Affected Files

### 6.1 New files (Phase 1 MVP)

**Database migrations:**
- `server/db/migrations/00XX_risk_atlas_tables.sql` — all new tables from Section 4.1 after reuse decisions
- `server/db/migrations/00XX_risk_atlas_seed.sql` — default SME general pack seeded into DB as built-in

**Server — module system (Area 6 upgrade):**
- `server/areas/risk/area-context.md` — updated, generalised for enterprise risk
- `server/areas/risk/modules/atlas-exposure-mapper/module.json`
- `server/areas/risk/modules/atlas-exposure-mapper/system-prompt.md`
- `server/areas/risk/modules/atlas-threat-cataloguer/module.json`
- `server/areas/risk/modules/atlas-threat-cataloguer/system-prompt.md`
- `server/areas/risk/modules/atlas-vulnerability-assessor/module.json`
- `server/areas/risk/modules/atlas-vulnerability-assessor/system-prompt.md`
- `server/areas/risk/modules/atlas-inherent-scorer/module.json`
- `server/areas/risk/modules/atlas-inherent-scorer/system-prompt.md`
- `server/areas/risk/modules/atlas-control-mapper/module.json`
- `server/areas/risk/modules/atlas-control-mapper/system-prompt.md`
- `server/areas/risk/modules/atlas-residual-calculator/module.json`
- `server/areas/risk/modules/atlas-residual-calculator/system-prompt.md`
- `server/areas/risk/modules/atlas-appetite-manager/module.json`
- `server/areas/risk/modules/atlas-appetite-manager/system-prompt.md`

**Server — personas and skills:**
- `server/personas/risk-coach.json` — the educational persona
- `server/personas/senior-risk-officer.json` — the expert-mode persona
- `server/skills/threat-path-methodology.json` — codifies the chain rules
- `server/skills/control-evidence-scoring.json` — codifies strong/adequate/weak scoring rubric
- `server/skills/residual-calculation.json` — codifies the deterministic calc

**Server — business logic:**
- `server/src/risk-atlas/atlas-service.ts` — Atlas CRUD and lifecycle
- `server/src/risk-atlas/atlas-residual-calculator.ts` — deterministic calc (single source of truth — never let an LLM decide the final number)
- `server/src/risk-atlas/atlas-event-logger.ts` — append-only event ledger
- `server/src/risk-atlas/atlas-pack-loader.ts` — loads industry packs from installed bundles
- `server/src/risk-atlas/atlas-maintenance-scheduler.ts` — wires to deadlines table for review cycles
- `server/src/risk-atlas/atlas-trigger-engine.ts` — listens for radar/atom/incident triggers
- `server/src/risk-atlas/atlas-knowledge-bridge.ts` — pushes Atlas entries into knowledge_atoms and entity_nodes
- `server/src/risk-atlas/atlas-export.ts` — board pack, threat cards, heat map, `.anton` bundle

**Server — API routes:**
- `server/src/routes/atlas.ts` — CRUD for atlases, stages, paths, vulnerabilities, controls, scores, appetite, reviews, events

**Server — `.anton` bundle extension:**
- `server/src/anton-bundler.ts` — extend with `risk-atlas-industry-pack` and `risk-atlas-export` bundle types (modify existing file, don't create a parallel bundler)
- `server/src/anton-pack-schemas/risk-atlas-industry-pack.schema.json`
- `server/src/anton-pack-schemas/risk-atlas-export.schema.json`

**Client — pages:**
- `client/src/pages/RiskAtlasLandingPage.tsx` — list of atlases, "create new" entry
- `client/src/pages/RiskAtlasWorkspacePage.tsx` — the workspace shell (tabs: dashboard, paths, controls, events, maintenance)
- `client/src/pages/RiskAtlasSetupPage.tsx` — onboarding wizard (pack → description → mode → go)
- `client/src/pages/RiskAtlasPathPage.tsx` — single threat path view
- `client/src/pages/RiskAtlasControlPage.tsx` — single control view

**Client — components:**
- `client/src/components/atlas/StageExplainer.tsx` — collapsible stage explainer
- `client/src/components/atlas/SocraticQuestionRunner.tsx` — the elicitation UI
- `client/src/components/atlas/ThreatPathCard.tsx` — the causal-chain card view
- `client/src/components/atlas/ResidualHeatMap.tsx` — the heat map viz
- `client/src/components/atlas/ControlVulnerabilityMatrix.tsx` — the Stage 5 matrix
- `client/src/components/atlas/AppetitePositioner.tsx` — the appetite UI
- `client/src/components/atlas/GlossaryTooltip.tsx` — in-context term explainers
- `client/src/components/atlas/MaintenanceTimeline.tsx` — review cycle visualiser
- `client/src/components/atlas/EventLedger.tsx` — audit trail view

**Client — navigation:**
- Modify the top-level nav to include "Risk Atlas" under Work

**Industry pack bundles (ship with Phase 1):**
- `packs/risk-atlas/sme-general.anton` — the default
- `packs/risk-atlas/fcp-casp.anton` — the reference pack (built from Daniel's NordicCrypto example)
- `packs/risk-atlas/fcp-bank.anton`
- `packs/risk-atlas/saas-tech.anton`
- `packs/risk-atlas/restaurant-hospitality.anton`
- `packs/risk-atlas/construction-trades.anton`
- `packs/risk-atlas/healthcare-clinic.anton`

### 6.2 Files to modify (Phase 1)

- `server/src/prompt-builder.ts` — register the new modules; no structural change expected
- `server/src/anton-bundler.ts` / `antonImport.ts` / `antonExport.ts` — add the two new bundle types per Section 6.1; extend cleanly
- `server/src/regulatory-radar/radar-service.ts` — add hook to notify Atlas of new items matching path tags
- `server/src/knowledge-graph/atom-extractor.ts` — ensure Atlas entries are tagged with `source_type: 'risk_atlas'` so atoms are easy to query
- `client/src/App.tsx` / routing — register new pages
- `client/src/components/navigation/` — add Risk Atlas entry

### 6.3 Files NOT to create (to avoid duplication)

- **Do not** create a separate audit log table — reuse the existing `connection_audit_log` pattern or add `atlas_events` table only if truly needed
- **Do not** create a separate deadline/reminder system — reuse `deadlines`
- **Do not** create a parallel project model — extend `projects` with `project_type: 'risk_atlas'`
- **Do not** create a separate quality-scoring system for Atlas outputs — use the existing Quality Ratchet
- **Do not** create new entity types if `risk`, `control`, `regulation`, `process` already cover the need — extend the taxonomy only after confirming reuse is impossible
- **Do not** build a new RBAC model for Phase 2 multi-entity — reuse `connected_user` from the Companion App Gateway

---

## 7. Implementation Order

### Phase 1 (MVP) — suggested build order

1. **Codebase audit** (Section 5) — mandatory. Produce the pre-implementation memo.
2. **Database migrations** — after audit confirms what to reuse. Start with tables, add seed data for one pack (SME general).
3. **Pack schema + loader** — build the `risk-atlas-industry-pack` `.anton` bundle type first so everything else is pack-driven from day one. Do not hardcode any pack content into the app.
4. **SME general pack** — build this alongside the loader to exercise the schema end-to-end. This pack becomes the fixture that every other component tests against.
5. **Area 6 module upgrade + Risk Coach persona + methodology skill** — seven modules, one persona, three skills. These plug into the existing prompt-builder with no changes to the builder itself.
6. **Atlas service + residual calculator + event logger** — the server-side core. Deterministic calculator is critical — unit-test exhaustively.
7. **API routes** — CRUD for each stage.
8. **Client workspace shell + landing page + setup wizard** — get to "I can create an empty Atlas and see a dashboard".
9. **Stage-by-stage UIs** — build Stage 1 first, ship it, get feedback from one real user (the restaurant down the street from Daniel's office counts), then Stage 2, etc. Don't build all seven stages before any user sees one.
10. **Threat path card + residual heat map** — the visual payoff.
11. **Maintenance scheduler + trigger engine** — wire to existing deadlines and radar.
12. **Knowledge bridge + pattern integration** — Atlas → atoms → graph → patterns.
13. **Export** — board pack docx, threat path pdf, heat map png, `.anton` export. Use the pptx/docx skills for document output.
14. **Remaining Phase-1 industry packs** — FCP-CASP, FCP-Bank, SaaS, Restaurant, Construction, Healthcare. Each is a separate PR.
15. **Migration from existing FCP BWRA module** — one-click converter. Leave the old module in place but flagged as superseded.
16. **Compliance-as-Code rule references** — add a few seed rules that reference Atlas state so the integration is exercised.
17. **End-to-end Quality Ratchet wiring** — Atlas outputs flow through the existing QR system.
18. **Integration smoke test** — run the NordicCrypto example end-to-end and compare output to the reference docx.

### Phase 2 scope (deferred)

Multi-entity Atlases; `connected_user` stakeholder access; Atlas dashboards across entities; Quality Ratchet over time view; Compliance-as-Code rules referencing Atlas state across multiple Atlases; Missions for autonomous review cycles.

### Phase 3 scope (deferred)

Certified industry packs sold through marketplace; revenue share for pack authors; Atlas templates as compound bundles; pack versioning and diff UI.

### Phase 4 scope (deferred)

Beehive multi-entity Atlas deliberation; Connected Enterprise Planning cross-Atlas awareness; signed AAP exchange of anonymised sector-level threat intel.

---

## 8. Acceptance Criteria

### 8.1 Phase 1 functional criteria

A Phase 1 ship is acceptable when **all** of the following are true:

1. A user can create a new Atlas by selecting an industry pack and writing a 1-paragraph business description, and reach a usable draft of Stages 1-3 within 5 minutes (on Opus 4.7 default).
2. Every scoring decision is captured as a `checkpoint_decision` with rationale so the audit trail is complete.
3. The residual calculator is deterministic — the same Atlas state always produces the same residual scores, and the rule (Strong -2, Adequate -1, Weak 0; max of three for inherent) is encoded in `atlas-residual-calculator.ts`, not in any LLM prompt.
4. The NordicCrypto example from the source methodology can be imported as a fixture and produces a board pack that matches the reference docx in structure (content will differ because the AI regenerates, but the seven stages, ten threat paths, ten vulnerabilities, the prevent/detect/respond mapping, and the appetite statement must all appear).
5. At least three industry packs (SME general, FCP-CASP, one non-financial — recommend Restaurant) are installable, and each produces a substantively different Atlas from the same business description.
6. The Socratic mode explainer teaches a non-specialist what a "threat path" is, why the chain matters, and how to score exposure. User testing: one user who has never done a risk assessment can build a draft Atlas in Socratic mode in under 45 minutes without asking a human for help.
7. The Draft mode produces a full Atlas draft in under 3 minutes for Opus 4.7 default; user review is required before anything is persisted beyond draft status.
8. Every Atlas entry flows into `knowledge_atoms` with the right type tags and source references.
9. The maintenance cycle is scheduled by default when an Atlas reaches Stage 7 completion; reviews surface in the existing deadlines UI.
10. Trigger-based reviews fire on Regulatory Radar updates that match path tags, proven by an end-to-end test.
11. The `.anton` export round-trips — export an Atlas, import it on a fresh install, and the resulting Atlas state is identical.
12. Board pack export (docx) renders cleanly with the existing Advisense brand and a generic "SME" brand; both can be selected at export.
13. The old `business-wide-risk-assessment` module still works but shows a "Superseded by Risk Atlas" banner with a one-click migration.
14. Compliance-as-Code has at least one working rule that references Atlas state.
15. Quality Ratchet applies to each module output in the Atlas flow.
16. The Risk Atlas is listed as a top-level navigation item under Work.

### 8.2 Quality criteria (the ANTON standard)

In addition to the functional criteria, the Risk Atlas must meet the ANTON quality standard:

- **Transparency.** ANTON explains every scoring choice, never just produces a number. When the residual calculator reduces by 1, the UI says why. When a threat path is proposed from the pack, the UI shows "suggested from [pack name] — you can accept, edit, or reject."
- **Citations.** When an industry pack cites a regulation, standard, or typology report, the citation is explicit and traceable (not "industry best practice" but "FATF VA Guidance 2021, para 42").
- **Humility.** ANTON flags uncertainty. "The residual score for TP-3 depends on how you interpret 'Adequate' vs 'Weak' for the sanctions list control — I've scored it Adequate because the list is updated on most business days, but a stricter interpretation would be Weak because updates are not 24/7. You decide."
- **Versioning.** Every material change is versioned. Users can see what the Atlas looked like at any prior point in time and diff it.
- **Evidence-first.** Control strength claims ("Strong") require evidence ("Blocks ~3% of withdrawal attempts"). The UI refuses to let a user mark a control Strong without populating the evidence field.

### 8.3 Non-criteria (explicit scope cuts for Phase 1)

- **Not** multi-entity (Phase 2)
- **Not** marketplace-integrated pack discovery (Phase 3)
- **Not** Beehive multi-Atlas deliberation (Phase 4)
- **Not** automated control testing integration (out of scope — controls are scored by user judgement with evidence text)
- **Not** automated evidence collection from systems (out of scope — integrations come later)
- **Not** quantitative Monte Carlo residual modelling (out of scope — the ordinal scoring is deliberately simple)

---

## 9. The Industry Pack Specification

An industry pack is an `.anton` bundle of type `risk-atlas-industry-pack`. Contents:

```
pack.anton/
├── manifest.json              # pack name, version, author, license, certification
├── area-context-overlay.md    # additional Area 6 context for this industry
├── socratic-scripts/
│   ├── stage-1.md             # the questioning sequence for Stage 1 in this industry
│   ├── stage-2.md
│   └── ...
├── exposure-points.json       # starter library with descriptions and default categories
├── threat-paths.json          # starter catalogue with descriptions, typical scores, typical linkages
├── vulnerabilities.json       # vulnerability library with severity benchmarks
├── controls.json              # control taxonomy with prevent/detect/respond assignments
├── appetite-heuristics.json   # typical appetite positions for paths in this industry
├── escalation-triggers.json   # typical trigger events
├── regulatory-tags.json       # tags to filter Regulatory Radar for this industry
├── glossary.json              # per-industry term explainers
├── board-template/            # docx/pptx templates tuned for this industry's board style
│   ├── board-pack.docx
│   └── heat-map-style.json
└── examples/                  # reference Atlases for demo/training
    └── nordiccrypto-reference.json
```

Packs are **additive** — they propose entries, the user accepts/edits/rejects. A pack never auto-populates anything beyond review. Packs can also **inherit** — the FCP-CASP pack inherits from FCP-Bank which inherits from SME general. The inheritance chain is explicit in the manifest.

**Certification model** (Phase 2+):
- Community pack: anyone publishes, marketplace reviewers check schema validity only
- Reviewed pack: peer-reviewed by a community board, earns "Community Reviewed" badge
- Certified pack: reviewed by a named partner (Advisense, a Big Four firm, an industry body), earns "Certified by X" badge with visible attribution, includes a regulatory opinion where relevant, quarterly update commitment
- Open Sovereign pack: commissioned by a government or SOE (the EU Sovereign Edition angle) — freely distributed, maintained by the commissioning body

---

## 10. Pressure Tests (Multiple Expert Viewpoints)

Before committing to this spec, I've mentally run it past seven expert perspectives. Where it breaks, it's worth calling out in Phase 1 limitations.

**Compliance Officer (AMLR-focused, Advisense practitioner).** Likely response: "Finally, the BWRA isn't a Word document any more. The threat-path structure is our methodology — that's fine. What about the AMLA data-point reporting? Does the Atlas feed the AMLR reporting templates?" → **Action:** in Phase 2, wire the Atlas to the existing AMLA data-point implementation matrices (the Section A/B/B-v2 files in the project) so that Atlas state auto-fills as much of the AMLR reporting as it has evidence for.

**Enterprise Risk Manager (COSO-aligned, big corporate).** Likely response: "Threat paths feel operational, not strategic. Where's strategic risk, financial risk, reputational risk?" → **Action:** the seven-stage structure is domain-agnostic; strategic risk uses the same chain. Document this explicitly in the Enterprise pack. The "exposure" in strategic risk is "dependency on a single market" and the "threat path" is "market pivot away from us". Same machinery.

**Small Business Owner (no compliance background).** Likely response: "I don't know what 'inherent' means. I don't have time. I just want to know if I'm going to get sued." → **Action:** the Socratic mode and plain-English glossary are designed for this user. Output includes a "plain-English summary" that reads "Three things could hurt your business badly this year. Here's how to make them less likely." Delivery: less than 30 minutes to first draft.

**CISO (cybersecurity focus).** Likely response: "I already use a threat model. STRIDE, attack trees, CVSS scoring. Why another tool?" → **Action:** the SaaS-tech pack should explicitly support STRIDE as an alternative framing for Stage 2, and CVSS as an alternative scoring rubric for vulnerabilities. The pack layer is where framework translation happens. The underlying chain is the same.

**Internal Auditor.** Likely response: "Where's the control testing evidence? Who signed off? When was this last reviewed?" → **Action:** this is built in. Every scoring decision → checkpoint → audit trail. Review cycles → deadlines. Evidence → required field on control strength. Auditor dashboard shows: untested controls, overdue reviews, unapproved appetite statements.

**Board Member.** Likely response: "Don't show me a spreadsheet. Show me what's outside appetite and what you're doing about it, and don't make it ten pages." → **Action:** the board pack export is exactly this — the front page is the appetite exception table and the remediation programme. Everything else is appendix. Daniel's sample NordicCrypto board summary (Section 7.3 of the source methodology) is the template.

**Regulator / NCA supervisor.** Likely response: "Show me you can trace any residual position back to a specific control, evidence of that control's effectiveness, and a governance sign-off." → **Action:** this is *the* design constraint. Every residual score links to controls; every control has evidence; every appetite position has sign-off. The regulator-ready package is a specific export type.

### Structural gaps I see in Phase 1

1. **Scoring calibration drift.** Without anchoring, different users will score the same vulnerability differently. Mitigation: the pack ships with severity benchmarks (e.g., "V-speed-of-settlement is typically severity 4 in crypto, severity 2 in traditional banking") and ANTON challenges users who deviate significantly.

2. **Pack quality dependency.** A bad pack produces a bad Atlas. Mitigation: certification model; pack testing fixtures; community review process; and the "SME general" default is designed to never be harmful even if the user picks the wrong pack.

3. **Inherent-risk "max" rule is arguable.** Some frameworks use product or average, not max. Mitigation: document the choice and rationale (Daniel's reasoning: "chain is as weak as its weakest link"). Allow packs to override the rule in later phases if genuinely needed.

4. **Prevent/Detect/Respond isn't the only control taxonomy.** COSO uses Preventive/Detective/Corrective; NIST CSF uses Identify/Protect/Detect/Respond/Recover. Mitigation: Prevent/Detect/Respond maps cleanly to all of these and is the common denominator. Document the mapping in the Risk Coach explainer.

5. **The "one atlas per business" assumption breaks for conglomerates.** Mitigation: Phase 2 multi-entity. In Phase 1, a conglomerate creates one Atlas per material subsidiary.

6. **Ordinal scoring loses information.** Quantitative risk management people will hate it. Mitigation: document that this is deliberate. The Phase-4 Beehive work can layer a quantitative model on top without changing the ordinal foundation. FAIR (Factor Analysis of Information Risk) can be supported as an advanced scoring pack.

---

## 11. How This Connects to the Six-Layer Vision

Risk Atlas expresses every layer of the six-layer ANTON vision:

1. **Individual ANTON.** A single user builds their own Atlas. The feature is useful at Layer 1 alone.
2. **Intelligent ANTON.** The Cross-Workflow Intelligence funnel learns from all Atlas work, detects patterns, surfaces cross-client insights for consulting practices.
3. **The Network.** `.anton` pack sharing — a compliance officer exports a refined pack, a colleague imports it. Knowledge compounds.
4. **Collaborative Intelligence.** Beehive-era multi-Atlas deliberation — supply chain risk, parent-subsidiary rollup, sector-level threat intel.
5. **The Marketplace.** Certified industry packs, Atlas templates, managed packs as paid products. This is a direct Red Hat revenue vector.
6. **The Economy.** FutureChain rails settle pack purchases, pack author royalties, and (later) sector-level anonymised threat intel subscriptions.

Risk Atlas is therefore not a feature in isolation — it's an exemplar of the APCI thesis. It commoditises the risk-assessment software layer and moves value to the context layer (industry packs) and the intelligence layer (cross-Atlas patterns). Both of those layers are ANTON's moat.

---

## 12. A Concrete First-Demo Script

For internal testing and external demo:

**The Restaurant Down the Street.**

- Business description (pasted by demo runner): "We run a small sit-down Italian restaurant in central Stockholm. 45 seats, 12 staff, open 6 days a week. We source from local suppliers and a wholesaler. We take card payments through a terminal rented from our bank. We use a delivery app for 30% of our revenue. Peak hours Thursday-Saturday evening."
- Pack: `restaurant-hospitality.anton`
- Mode: Draft-and-challenge

**Expected output inside 10 minutes:**
- Exposure map: kitchen operations, dining room, delivery partner relationship, payment terminal, supplier dependencies, staff interactions with cash/card data
- Threat paths: foodborne illness outbreak (TP-1), kitchen fire (TP-2), staff injury (TP-3), payment card fraud (TP-4), delivery partner reputation spillover (TP-5), supplier interruption (TP-6), customer complaint escalation / licensing risk (TP-7)
- Vulnerabilities: unclear food rotation process, no fire suppression test schedule, thin staffing on Thursday, POS terminal not PCI-attested, over-dependence on single delivery partner, no backup supplier for key ingredient, no incident log
- Inherent scores: 5, 4, 3, 3, 3, 3, 2 (per path, calibrated from the pack)
- Controls proposed: HACCP checklist, monthly fire test, training log, PCI-DSS quarterly scan, diversify delivery partners, second-source key ingredient, complaint log
- Residual after plausible controls: 3, 2, 2, 2, 2, 2, 1
- Appetite statement: TP-1 at boundary, fix within 6 months; everything else within appetite; one escalation trigger (any health inspector citation → immediate review)

Output: a 6-page board pack that an owner can actually read, and a threat path card for the head chef ("here are the five kitchen-specific things you own").

**This is the demo that sells Risk Atlas.** A restaurant owner saying "I've never had a risk assessment before" to the camera, watching ANTON build one in 10 minutes, and then using it on Monday.

---

## 13. Appendix: Naming and Positioning

**Feature name:** ANTON Risk Atlas
**Methodology name:** Threat-Path Risk Assessment (credit Advisense/Daniel Bardun)
**Short form in UI:** "Risk Atlas"
**Tagline candidates:**
- "Your risk picture, as a causal story." (accurate, technical)
- "From spreadsheet to story. Risk management that management can actually use." (positions against GRC)
- "A risk assessment for every business, guided by AI." (accessibility-first)
- "Know where you're exposed. Know what could go wrong. Know what's between you and the worst day." (plain-English)

**Related named features for internal cross-reference:**
- Regulatory Radar (feeds Atlas)
- Pathfinder (researches threats into Atlas)
- Markets (analogous workspace pattern)
- Missions (autonomous maintenance later)
- Beehive (multi-Atlas deliberation later)
- The .anton bundle format (pack interchange)

---

## 14. Final Note to Claude Code

The hardest part of this feature is not the data model or the modules. It is the AI-guided explainer layer. A restaurant owner and a bank MLRO must both feel that ANTON is their peer while doing this work. The restaurant owner must not feel patronised; the MLRO must not feel the tool is toy-grade. The Risk Coach persona, the Socratic scripts, and the plain-English glossary all exist to hit that dual audience.

When in doubt about a UI decision, ask: "Would Daniel's MLRO contacts at Advisense take this seriously, *and* would the restaurant owner down the street understand it?" Both answers must be yes.

The second-hardest part is the residual calculator. Do not let an LLM decide the residual score. The rule is deterministic. The rationale around the score can be LLM-generated; the number cannot. This is non-negotiable for audit defensibility.

The third-hardest part is the industry pack quality. A shipped pack with a sloppy threat catalogue will generate sloppy Atlases and burn the feature's credibility. Spend the time on the seed packs. The SME general pack and the FCP-CASP pack (Daniel's own reference) are the two that set the quality bar for everything the community will contribute later.

Everything else — the tables, the routes, the pages, the export — is standard ANTON engineering on patterns that already exist. Extend, don't duplicate. Ship Phase 1 in a form that a restaurant owner can use on Monday.

**End of spec v0.1. Ready for Claude Code audit memo and build planning. Addenda will be issued as numbered amendments; this document is the spine.**
