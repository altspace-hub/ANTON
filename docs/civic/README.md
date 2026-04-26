# Civic

> ANTON's government-services and public-institution navigator. **Deterministic eligibility evaluation + jurisdiction-bundled process packs** is the architectural commitment.

---

## Quick map

| If you want to… | Read |
|---|---|
| Strategic positioning | [`/docs/marketing/civic.md`](../marketing/civic.md) |
| Eligibility-rule semantics | [`eligibility-rules.md`](eligibility-rules.md) |
| Add a new process pack | [`extending.md`](extending.md) |
| Architecture | [`/docs/architecture/future/f-53-future-pillars.md`](../architecture/future/f-53-future-pillars.md) |

---

## Service surface

| File | Responsibility |
|---|---|
| `server/services/civic-service.ts` | Engagement + process + document CRUD (mig 092 tables) |
| `server/services/civic-eligibility.ts` | Declarative rule evaluator (post Phase B.1) |
| `server/services/civic-process-library.ts` | Pack loader + activation (post Phase B.1) |
| `server/services/civic-knowledge-pack.ts` | Bridge to `civic_knowledge_packs` (mig 092) |

The pillar shares heavy infrastructure with Work (modules), Knowledge (atom + pack systems), Risk Atlas (deterministic-engine pattern). Civic's contribution is the **eligibility-rule engine + jurisdiction-bundled process packs**.

---

## Pages

5 pages in `src/pages/civic/`:

| Page | Purpose |
|---|---|
| `CivicPage` | Pillar landing — engagements list |
| `CivicEngagementPage` | Per-engagement workspace |
| `CivicEligibilityCheckPage` | Citizen-facing eligibility checker |
| `CivicProcessLibraryPage` | Browse jurisdiction-bundled process packs |
| `CivicSubmissionsPage` | Cross-engagement submission view |

---

## Schema

| Migration | Tables |
|---|---|
| `092_civic_pillar.sql` | `civic_engagements`, `civic_processes`, `civic_eligibility_checks`, `civic_documents`, `civic_submissions`, `civic_knowledge_packs` |
| `170_civic_eligibility_packs.sql` (Phase B.1) | `civic_eligibility_rules`, `civic_eligibility_results`, `civic_process_packs` |

Seeded with 3 process packs: SE personal tax, UK business registration, US-CA benefits navigator.

---

## How an engagement flows

1. **Create engagement** at `/civic` — title + goal + jurisdiction.
2. **Mapping** — civic-service identifies relevant processes from the active packs for the jurisdiction.
3. **Eligibility** — for each process, `civic-eligibility.ts` evaluates rules against the applicant context.
4. **Gap** — what's needed to clear ineligibility / requires_evidence outcomes.
5. **Complete** — generate forms, fill them, submit.
6. **Track** — submissions visible at `/civic/submissions` until status transitions to approved / rejected.

Phase enum lives in `civic_engagements.phase`: `situation` → `mapping` → `eligibility` → `gap` → `complete` → `track`.

---

## Where to start

- **Try it:** `/civic` (engagements), `/civic/eligibility` (single check), `/civic/processes` (library)
- **Code:** `server/services/civic-*.ts`, `server/routes/civic*.ts`
- **Marketing:** [`/docs/marketing/civic.md`](../marketing/civic.md)
- **Eligibility rules:** [`eligibility-rules.md`](eligibility-rules.md)
- **Extending:** [`extending.md`](extending.md)

---

*Refresh when a new pack lands, when a new rule kind ships, or when the engagement-phase model evolves.*
