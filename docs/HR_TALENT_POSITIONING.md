# ANTON HR / Talent — Positioning

**Status:** Positioning document (plan item #10, Area 4 of `docs/INVESTIGATION_AND_PLAN_2026-06-13.md`).
**Date:** 2026-06-13
**Scope:** ANTON's people / HR / talent domain — what it is, how it differs from Talentium, and why the open architecture is the differentiator.

> **Honesty framing (read first).** This is **not** a product-vs-product comparison. ANTON has no shipped, focused, go-to-market hiring *product*. What it has is a **deep, EU-AI-Act-instrumented talent platform plus a portable, candidate-owned data format**. Talentium has a funded, shipping employer SaaS with paying customers. Where the comparison favours ANTON it is on **architecture and approach** (verifiable in code); where it favours Talentium it is on **product focus and distribution** (Section 4). Everything below is file:line-referenced so the claims can be checked against the committed code.

---

## 1. What ANTON's HR / Talent capabilities actually are

ANTON's people domain is **two systems that share the `talent_*` tables**: a set of generic HR LLM modules, and a much deeper Talent Discovery & Recruitment engine. Adjacent to both sits a `workers-rights` area that exists to defend the employee — a deliberate counterweight to the employer-only posture of conventional recruiting tools.

### 1a. The generic HR modules (real but shallow)
- **13 one-shot prompt modules** under `server/areas/hr/modules/` (`compensation-benchmarking`, `cv-screener`, `interview-framework`, `job-description`, `performance-review`, `onboarding-checklist-manager`, etc.). Area defined in `server/areas/hr/area.json` ("Human Resources & People").
- These are honest, useful, single-shot generators with **no persistent workflow**. They are the breadth layer, not the depth.
- **Inventory caveat (honest):** `src/lib/constants.ts:2872` registers four IDs — `talent-discovery`, `talent-ad-generator`, `talent-assessment`, `talent-aspiration` — that have **no module definition** in the module runner. Those names are *not* orphaned features: the functionality lives in the dedicated Talent workspace (below), not the generic module pipeline. The registry entry is a naming artefact, not a capability.

### 1b. The Talent Discovery & Recruitment engine (the real depth)
A 7-phase pipeline (discovery → ad → screening → shortlist → interview → offer) plus internal mobility and a candidate-facing job-search side.

- **Data model:** 16+ `talent_*` tables across four migrations — `107_talent_recruitment.sql`, `108_talent_compliance_rules.sql`, `109_talent_internal_mobility.sql`, and `162_jobs_candidate_side.sql` (under `server/db/migrations-pg/`).
- **Services:**
  - `server/services/talent-service.ts` — audited CRUD; every write goes through an audit trail with an EU-AI-Act category column (`talent_audit_trail` … `eu_ai_act_category`, `talent-service.ts:113`, `:137-138`) and a dedicated human-decision recorder (`recordHumanDecision`, `talent-service.ts:580`, writing `talent_human_decisions`).
  - `server/services/talent-ai-service.ts` — the assessment intelligence. **Dual-model, bias-audited scoring** (see 1c). All model calls route through the model-agnostic `provider-router`.
- **Routes:**
  - `server/routes/talent.ts` — recruiter side. **Pay transparency enforced in code** (see 1d), GDPR hard-delete of aspiration content (`talent.ts:660`), and k-anonymised analytics with a minimum group size of 5 (`MIN_GROUP=5`, `talent.ts:727`).
  - `server/routes/jobs.ts` — candidate side (job search, profile import/export).

### 1c. Dual-model, bias-audited assessment (the most powerful feature)
The candidate assessment is run by **two independent models**:
1. A **primary assessor** scores the candidate against the campaign's defined dimensions and stores reasoning, wild-card flags, and explicit *uncertainties* (`talent-ai-service.ts` primary path, ending `:258-260`).
2. An **independent bias auditor** then reviews that scoring for proxy discrimination, framework drift, scoring consistency, and native-vs-non-native language bias, and records its findings as a separate `bias_auditor` assessment (`talent-ai-service.ts:262-300`).

A pre-flight **bias simulation** can audit the framework *weights* before any candidate is scored (`runBiasSimulation`, `talent-ai-service.ts:429`). Compliance checks are **deterministic**, not LLM-judged (`checkCompliance`, `talent-ai-service.ts:505-583`).

**Maturity — honestly stated.** This dual-model engine was fully built server-side while the recruiter UI still showed a placeholder. **That gap is now closed:** the Assessments tab in `src/pages/talent/TalentCampaignPage.tsx` wires the live backend — it triggers the dual run (`runAssessment`, `:328`), renders the primary assessment and the independent bias-auditor verdict (`:700`, `:780`), and records the recruiter's Art. 14 human review (`recordHumanReview` → `POST …/decisions`, `:358-378`). The remaining placeholder in that page is the **Shortlist** tab ("coming in Session 5", `:872`), not the assessment engine. `talent_skill_gaps` remains a scaffold (table exists; no service populates it yet).

### 1d. Pay transparency, enforced in code
A recruiter **cannot advance a campaign past the discovery phase without a salary range**. The route hard-blocks any status in `['ad_live','screening','shortlist','interview','offer']` when a min/max salary is missing, returning compliance code `EUPT-RECRUIT-001` and citing the EU Pay Transparency Directive 2023/970 (`talent.ts:176-188`). This is a code-level guarantee, not a UI suggestion.

### 1e. Internal mobility (manager-blind, GDPR-deletable)
Employees can opt into an internal aspiration profile that is **manager-blind by default**, GDPR-hard-deletable (`talent.ts:660`), and surfaced only through k-anonymised aggregate analytics (`MIN_GROUP=5`, `talent.ts:727`). Internal matches express/withdraw interest as a two-way action (`talent.ts:698-721`).

### 1f. The candidate-owned, signed `.anton` career profile
The portable artefact that anchors ANTON's open approach.
- It is the candidate's portable CV + aspiration data — **bundle type #44** (`server/services/anton-bundler.ts:175`: "Portable CV + aspiration data. Candidate-owned, AAP-signed, importable across ANTON instances").
- The schema and trust model live in `server/services/portals/career-profile.ts`: the candidate **authors, signs, and holds** the bundle; a recruiter verifies authorship **without trusting the candidate's ANTON instance** (`career-profile.ts:1-11`). Aspiration data is opt-out by default (`aspirations.opt_in` defaults `false`, `career-profile.ts:37`). Spec: `docs/anton-format/types/career-profile.md` ("manager-blind by default", "signing REQUIRED").
- **Signature verification is enforced.** `parseCareerProfile` defaults `requireSignature` to `true` (`career-profile.ts:152`); `verifyCareerProfileSignature` rejects unsigned bundles (`:109-110`), verifies the Ed25519/AAP signature over the RFC-8785-canonical payload (`:134`), and **binds the signing key to the claimed candidate** so an unrelated key cannot impersonate the named person (`:140-143`). The candidate-side import path uses the secure default (`jobs.ts:249`). *(This closes the earlier caveat in the plan that the import path accepted unsigned bundles — the sibling Talent work fixed it.)*

### 1g. The two-sided + workers-rights framing
ANTON serves **both sides** of the hiring relationship: a candidate surface (`server/routes/jobs.ts` + the candidate pages) and a recruiter surface (`server/routes/talent.ts` + the Talent workspace). Alongside sits a dedicated **`workers-rights` area** with 8 modules (`server/areas/workers-rights/modules/`) whose entire purpose is to defend the employee. Conventional recruiting SaaS serves the employer and *tracks* the candidate; ANTON treats the candidate as a first-class, served party.

---

## 2. ANTON vs Talentium

**Talentium** (talentium.io, Stockholm; €3.5M EQT pre-seed, Dec 2024) is a funded, shipping **employer** recruiting SaaS. Its model includes **scraping and enriching candidate data from the open web** (GitHub, portfolios) — the candidate is the *subject* of the data, not its owner.

| Dimension | Talentium (Stockholm; €3.5M EQT pre-seed Dec 2024) | ANTON |
|---|---|---|
| **Candidate data ownership** | Employer-owned workflow; candidate data **scraped & enriched from the open web**; candidate is the *subject*, not the owner. | Local-first; the `.anton` career-profile bundle is **candidate-authored, candidate-signed, candidate-held** (`career-profile.ts:1-11`). Recruiter verifies authorship *without trusting the candidate's instance*. |
| **Openness / portability** | Closed SaaS; data in Talentium's cloud; no portable format. | Open `.anton` bundle — portable, import/export, peer-to-peer shareable by construction (`anton-bundler.ts:175`). |
| **Local-first / privacy** | Cloud SaaS; strong *operator* posture (GDPR, AES-256, regional hosting, no model-training-on-user-data) but **centralised**. | Runs on localhost; only LLM calls leave the machine. Privacy by data-residency-on-device. |
| **Explainability / audit (EU AI Act)** | Claims "alignment" + a security advisory board; **no public detail** on how matching/ranking is explained. (Recruitment AI = high-risk, Annex III §4.) | Every AI action → `talent_audit_trail` with `eu_ai_act_category` (`talent-service.ts:113,137`); every candidate-affecting decision → `talent_human_decisions` (Art. 14, `talent-service.ts:580`); assessments store reasoning + uncertainties + confidence. |
| **Bias mitigation** | Not stated. | **Independent second-model bias auditor** + pre-flight weight bias-simulation (`talent-ai-service.ts:262-300, :429`). |
| **Pay transparency** | Not stated. | **Enforced in code** — cannot advance past discovery without a salary range (`talent.ts:176-188`, EUPT-RECRUIT-001). |
| **Employer vs jobseeker** | Heavily employer-tilted; jobseeker is sourced/tracked, not served. | Two-sided: candidate surface (`jobs.ts`) + recruiter surface (`talent.ts`) + a `workers-rights` area (8 modules) defending the employee. |
| **Vendor lock-in** | High (proprietary engine, cloud data). | Low — local-first, open format, multi-LLM. |
| **Cost / accessibility** | Freemium → VC-priced recruiter SaaS. | Self-hostable, free to run (user pays only their own LLM API). |
| **Internal mobility** | Not a focus. | Opt-in, manager-blind, GDPR-deletable, k-anonymised (`talent.ts:660,727`). |
| **Maturity (honest)** | **Shipping, funded product** with named users and a large waitlist. | **Deep platform + portable format.** Recruiter assessment UI previously lagged its own backend; that gap is now wired (`TalentCampaignPage.tsx:328,700,780`). |

> **Read this table as: shipped product (Talentium) vs. capability + architecture (ANTON).** It is honest precisely because it does not pretend the two are at the same stage of commercialisation.

---

## 3. ANTON's open-approach differentiators (verifiable)

Each of these is a structural property of the system, checkable in the committed code:

1. **The individual owns and physically carries their signed career data.** The `.anton` career profile is candidate-authored, candidate-signed, candidate-held, and importable across instances (`career-profile.ts:1-11`; `anton-bundler.ts:175`). No lock-in by construction — there is no employer-owned data lake to leave behind.
2. **No central data lake.** ANTON is local-first; data lives in the org's own Postgres, not a vendor cloud. Only LLM API calls leave the machine.
3. **EU-AI-Act-native auditability the *subject* can inspect.** Decisions are logged in `talent_audit_trail` / `talent_human_decisions` with an EU-AI-Act category on each action (`talent-service.ts:113,137,580`), and the candidate holds their own signed record. Auditability is not a vendor's private log.
4. **Bias audited by an independent model, and weights audited pre-scoring.** A second model reviews every assessment (`talent-ai-service.ts:262-300`); framework weights can be bias-simulated before any candidate is scored (`:429`).
5. **Pay transparency enforced for the candidate, in code.** The salary-range gate cannot be skipped (`talent.ts:176-188`).
6. **Two-sided + a worker-rights area, not employer-only** (`jobs.ts`; `server/areas/workers-rights/`).
7. **Model-agnostic.** Assessment runs through `provider-router`; the org can use Claude, GPT, Gemini, Mistral, or a local Ollama model — and **self-host** the whole thing.

---

## 4. What Talentium does that ANTON should learn from

Honesty cuts both ways. Talentium's advantages are real and ANTON does not yet have equivalents:

- **A focused, shipped product with a sharp wedge.** Talentium does one thing — employer recruiting — and ships it. ANTON's talent capability is one surface inside a large multi-pillar platform; it is *deep* but not *packaged* as a standalone hiring product a recruiter can adopt in an afternoon.
- **Go-to-market and distribution.** Funding, named reference customers, and a waitlist mean Talentium has demand-side proof ANTON lacks. Architecture without distribution does not hire anyone.
- **Sourcing reach.** Web-scraping + enrichment, whatever its ethics, gives Talentium candidate *coverage*. ANTON's candidate-owned model is cleaner but requires candidates to *bring* their profile — a cold-start problem ANTON must solve with a compelling candidate-side reason to author and carry an `.anton` profile.
- **Product surface polish on the highest-value path.** The dual-model assessment was world-class on the backend long before the UI surfaced it. The lesson: **ship the differentiator's UI as soon as the backend is real.** (Wave A applied exactly this to the assessment tab.)

**The asymmetry, stated plainly:** Talentium has the product and the market; ANTON has the architecture. The strategy that follows is to package ANTON's verifiable, candidate-owned, EU-AI-Act-native approach into something with Talentium's product focus — not to out-scrape it.

---

## 5. The EU AI Act angle (a compliance asset, not a checkbox)

Under the **EU AI Act, recruitment and candidate-evaluation AI is classified high-risk (Annex III, §4)**. High-risk systems carry obligations around transparency, record-keeping, human oversight (Art. 14), and bias/risk management. Most recruiting SaaS treats these as a roadmap problem. ANTON's data model treats them as **design invariants**:

- **Record-keeping / traceability** — every AI action is logged with an EU-AI-Act category (`talent_audit_trail.eu_ai_act_category`, `talent-service.ts:113,137`).
- **Human oversight (Art. 14)** — every candidate-affecting decision is recorded as a human decision (`talent_human_decisions`, `recordHumanDecision`, `talent-service.ts:580`), and the recruiter UI forces that record before acting on AI output (`TalentCampaignPage.tsx:358-378`).
- **Bias / risk management** — independent-model bias audit + pre-flight weight simulation (`talent-ai-service.ts:262-300, :429`).
- **Subject rights / data minimisation** — GDPR hard-delete (`talent.ts:660`), k-anonymised analytics (`talent.ts:727`), opt-out-by-default aspiration data (`career-profile.ts:37`), and a candidate who holds their own signed record.
- **Transparency of obligations** — the pay-transparency gate (`talent.ts:176-188`) is a worked example of compliance enforced *in the workflow*.

For an EU buyer, this is not marketing: the audit trail, the human-decision records, and the independent bias audit are the exact artefacts an Annex III conformity assessment asks for. **ANTON's compliance posture is a feature, and it is the part of the story that is most defensible because it is in the code.**

---

## 6. One-line summary

ANTON does not (yet) out-product Talentium — it **out-architects** it: a deep, model-agnostic, self-hostable talent engine where the candidate owns and signs their own portable data, every AI decision is EU-AI-Act-logged and human-reviewed, bias is audited by an independent model, and pay transparency is enforced in code. The work ahead is packaging and distribution, not capability.

---

### Appendix — primary source files (verified 2026-06-13)
| Claim | File:line |
|---|---|
| Dual-model bias auditor | `server/services/talent-ai-service.ts:262-300` |
| Pre-flight weight bias simulation | `server/services/talent-ai-service.ts:429` |
| Deterministic compliance check | `server/services/talent-ai-service.ts:505-583` |
| Pay-transparency salary gate (EUPT-RECRUIT-001) | `server/routes/talent.ts:176-188` |
| GDPR hard-delete | `server/routes/talent.ts:660` |
| k-anonymised analytics (MIN_GROUP=5) | `server/routes/talent.ts:727` |
| Audit trail + EU-AI-Act category | `server/services/talent-service.ts:113, :137-138` |
| Human-decision recorder (Art. 14) | `server/services/talent-service.ts:580` |
| Career-profile trust model + opt-in default | `server/services/portals/career-profile.ts:1-11, :37` |
| Signature enforced (default true) + key binding | `server/services/portals/career-profile.ts:109-110, :134, :140-143, :152` |
| Candidate import uses secure default | `server/routes/jobs.ts:249` |
| Career-profile = bundle type #44 | `server/services/anton-bundler.ts:175` |
| Assessment UI wired (run + render + human review) | `src/pages/talent/TalentCampaignPage.tsx:328, :700, :780, :358-378` |
| Remaining placeholder = Shortlist (Session 5) | `src/pages/talent/TalentCampaignPage.tsx:872` |
| Orphan registry IDs (no module def) | `src/lib/constants.ts:2872` |
| HR area (13 modules) | `server/areas/hr/area.json` + `server/areas/hr/modules/` |
| Workers-rights area (8 modules) | `server/areas/workers-rights/modules/` |
| Talent migrations | `server/db/migrations-pg/107,108,109,162` |
