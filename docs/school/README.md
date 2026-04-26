# School

> ANTON's voice-first, guardian-overseen, curriculum-aligned learning pillar. Three roles (Guardian / Teacher / Student), four surfaces (Lessons / Assignments / Evidence / Curriculum), one safety overlay (`school-prompt-builder.ts`).

---

## Quick map

| If you want to… | Read |
|---|---|
| Understand the strategic positioning | [`/docs/marketing/school.md`](../marketing/school.md) |
| Add a new role / page | [`extending.md`](extending.md) |
| Understand the safeguarding model | [`safeguarding.md`](safeguarding.md) |
| See the architecture | [`/docs/architecture/future/f-54-school-mode.md`](../architecture/future/f-54-school-mode.md) |

---

## Service surface

| File | Responsibility |
|---|---|
| `server/services/school-prompt-builder.ts` | Safe-mode prompt overlay — wraps every student-facing module call with role-appropriate guardrails (no web-search by default for under-13, no sensitive content categories, age-aware response style) |
| `server/routes/school.ts` | Top-level school API — auth, role checks, dashboard data |
| `server/routes/school-evidence.ts` | Learning Evidence Log + Curriculum Registry REST surface (post-E.3) |

The pillar is intentionally light on per-pillar services because School **shares infrastructure with the Work pillar**: it uses the same prompt-builder, the same module system, the same Workflow Engine. School's contribution is the **safety overlay + role model + curriculum binding**, not a parallel stack.

---

## Schema

| Migration | Concern |
|---|---|
| 094 (`app_gateway.sql`) | Companion App pairing tables — used by School for guardian-paired devices |
| 168 (`school_evidence_curriculum.sql`) | Learning Evidence Log + Curriculum Registry (E.3); seeded with 5 countries |

Pages map to data tables already covered by core schema (`sessions`, `messages`, `module_configs`, plus `guardians` / `guardian_approvals` from companion-app migrations).

---

## Page layout

34 pages in `src/pages/school/`. Grouped by role:

### Student-facing
- `SchoolLoginPage` · `SchoolOnboardingPage` · `SchoolDashboardPage`
- `SchoolChatPage` · `SchoolCodingChatPage` (safe-mode chat)
- `LessonLibraryPage` · `SchoolLessonPage` (consume content)
- `CourseJourneyPage` (self-paced progression)
- `AssignmentTakingPage` (do an assignment)

### Teacher-facing
- `LessonBuilderPage` · `SchoolLessonBuilderPage` (author lessons)
- `AssignmentBuilderPage` (author assignments)
- `ReviewPage` (review student work)
- `MyRadarPage` (issues + signals)
- `SchoolCurriculumPage` (browse/edit curriculum)
- `CurriculumRegistryPage` (admin)
- `LearningEvidencePage` (per-student evidence)

### Guardian-facing
- `ParentDashboardPage` · `GuardianDashboardPage` (consent + oversight)

### Shared
- `SchoolSettingsPage` · `SchoolProfilePage` · `SchoolCodingPage`

---

## How a student session flows

1. Student opens `/school/chat` (or arrives via lesson assignment).
2. Frontend calls the Claude API as usual, but with `mode: 'school'` and the student's role/age.
3. Server-side `school-prompt-builder.ts` intercepts the request, wraps it with the safe-mode overlay (Layer 1 + 7 of the seven-layer prompt builder).
4. Response streams back as normal SSE — but every chunk has been generated under the safety overlay.
5. The session emits trail entries (revelation chains for IRE flows; standard message rows otherwise).
6. If the session produced something teacher-curated (an answer, a portfolio item, a quiz result), an Evidence Log row is written via `POST /api/school/evidence`.
7. Guardian-visible flag determines whether the entry surfaces in the Parent Dashboard.

---

## How a teacher session flows

1. Teacher opens `/school/lessons/build`.
2. 8-step walkthrough: identify → audience → curriculum-bind → structure → content → assessment → review → publish.
3. Curriculum binding pulls from `curriculum_registry` (5-country seed; expandable).
4. Published lessons appear in `LessonLibraryPage` for assigned students.
5. Student completion produces Evidence Log entries.

---

## How a guardian session flows

1. Guardian opens `/school/parent` or `/school/guardian`.
2. Sees activity for each ward (paired via the `guardians` table).
3. Approvals queue surfaces pending `guardian_approvals` rows.
4. Per-action consent — guardian can deny / approve / approve-with-conditions.
5. Evidence Log entries marked `guardian_visible = TRUE` appear in the Activity feed.

---

## Companion App integration

The Companion App (PWA + iOS/Android via Capacitor) has a dedicated `SchoolFeedScreen` that polls `/school/dashboard`. VoiceMode is the Tier-1 reader path. See [`/docs/architecture/31-companion-app-gateway.md`](../architecture/31-companion-app-gateway.md).

---

## Where to start

- **Try it:** `/school` (role-aware landing).
- **Code:** `server/services/school-prompt-builder.ts`, `server/routes/school.ts`, `server/routes/school-evidence.ts`.
- **Marketing:** [`/docs/marketing/school.md`](../marketing/school.md).
- **Extending:** [`extending.md`](extending.md).
- **Safeguarding model:** [`safeguarding.md`](safeguarding.md).

---

*Refresh when a new role ships, when curriculum-registry expands materially, or when the safeguarding model evolves.*
