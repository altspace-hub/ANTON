# School — One-Pager

> **What it is:** ANTON's voice-first, guardian-overseen, curriculum-aligned learning surface.
> **Who it's for:** students (Tier-1 voice-first through advanced text), teachers (lesson + assessment authoring), guardians (oversight + consent), and humanitarian / NGO field deployments.
> **What makes it different:** every other educational AI tool puts the AI between the student and the teacher. ANTON puts the AI **next to the teacher** — under guardian oversight, mapped to local curriculum, with a permanent learning evidence log.

---

## The pitch

The first wave of "AI for school" tools is mostly a chatbot in a sidebar. It can answer the student's homework. It can summarise the textbook. It cannot:

- Be configured by the teacher with a specific lesson plan
- Operate under guardian consent gates that block writes the parent hasn't approved
- Generate evidence the student actually learned (vs. just got a right answer)
- Map to the country's curriculum so a year-7 student in England gets year-7-England content
- Run entirely offline on a $50 board for an NGO field deployment

ANTON's School pillar does all five. The teacher is the centre, not the chatbot.

---

## What you can do today

| Surface | Audience | What it does |
|---|---|---|
| `/school` Dashboard | all | Per-role landing — Guardian / Teacher / Student dashboards |
| `LessonBuilderPage` / `SchoolLessonBuilderPage` | teacher | Author lesson plans (8-step walkthrough) |
| `LessonLibraryPage` | teacher / student | Browse + assign lessons |
| `AssignmentBuilderPage` / `AssignmentTakingPage` | teacher / student | Create + complete assignments |
| `SchoolChatPage` / `SchoolCodingChatPage` | student | Safe-mode chat (school-prompt-builder.ts overlay) |
| `CourseJourneyPage` | student | Self-paced course progression |
| `LearningEvidencePage` | guardian / teacher | Per-student evidence feed (E.3 deliverable, see below) |
| `CurriculumRegistryPage` | teacher / admin | Per-country curriculum (E.3 deliverable) |
| `MyRadarPage` | teacher | Issues + signals to address |
| `ReviewPage` | teacher | Review student work |
| `ParentDashboardPage` | guardian | Activity overview + consent |
| `GuardianDashboardPage` | guardian | Approvals queue |
| `SchoolOnboardingPage` | new student/teacher | Setup flow |

34 pages in `src/pages/school/` — heavy UI surface. Backed by `school-prompt-builder.ts` (the safe-mode prompt-overlay service) + `school-evidence.ts` (the Evidence Log + Curriculum Registry routes from E.3).

---

## Guardian consent — the wedge

Most adult AI tools ask the user to click "I agree" once. School's threshold is higher: a child can't consent to AI processing under most jurisdictions (COPPA, UK GDPR, EU Digital Services Act). The guardian must.

ANTON models this explicitly:

- **Guardian → Ward** relationship (`guardians` table, mig 094)
- **Per-action approval** (`guardian_approvals` table) for high-stakes writes
- **Visibility flag on Evidence Log entries** (`guardian_visible BOOLEAN` on `learning_evidence_log`, mig 168) — teacher decides what surfaces to the parent
- **Consent re-prompt** when the AI's behavioural envelope changes (new model, new module, new connector)

This is the regulated-school go-to-market — not "we have an AI tutor" but "we have an AI tutor your school's compliance officer can sign off on."

---

## Curriculum alignment

Per-country, per-jurisdiction, per-subject, per-year-level. The `curriculum_registry` table (mig 168) ships with seed data for **5 countries: SE, UK (England), US (California), IN (CBSE), KE**. Each row is a specific learning objective with a code (e.g. `SE-MATH-Y7-FRAC`) and a source URL pointing at the canonical national-curriculum publication.

Teachers extending to new jurisdictions add rows; lessons are then automatically eligible to bind to local objectives. The schema is country-agnostic by design.

25-country expansion is a roadmap item (E.3 follow-up).

---

## Voice-first, offline-capable

For Tier-1 readers + low-literacy learners + NGO field deployments:

- **VoiceMode** in the Companion App — hold-to-talk Telegram-style with on-device speech fallback when offline
- **Local LLM via Ollama** — `nomic-embed-text` for embeddings, small generation model for safe-mode responses; the same `school-prompt-builder` overlay applies
- **Humanitarian Deployment Kit** — pre-configured ANTON + Ollama + per-country curriculum packs that ship as `.anton humanitarian-deployment-kit` bundles to field hardware

A teacher in eastern DRC or Cox's Bazar can run the same School pillar that a teacher in Stockholm runs — locally, offline-first, with the same compliance posture.

---

## Why this matters strategically

Schools are conservative buyers with high compliance bars. The first AI-for-school tool that **survives a serious safeguarding audit** wins the next decade of the market. ANTON's School pillar is built for that audit:

- Every interaction emits a trail entry (queryable at `/audit-trail`)
- Every guardian-visible action is logged with consent state
- Every curriculum claim links to the canonical source URL
- Every offline deployment is signed against the issuing org's instance key

Add the humanitarian-deployment story and the addressable market widens dramatically: not just funded schools but every NGO running educational programmes in low-connectivity contexts.

---

## Where to look

- **Try it:** `/school` (role-aware landing).
- **Code:** `server/services/school-prompt-builder.ts`, `server/routes/school.ts`, `server/routes/school-evidence.ts`, `src/pages/school/` (34 pages).
- **Docs:** [`/docs/school/`](../school/) — README + extending + safeguarding.
- **Architecture:** [`/docs/architecture/future/f-54-school-mode.md`](../architecture/future/f-54-school-mode.md).
- **Companion app:** [`/docs/architecture/31-companion-app-gateway.md`](../architecture/31-companion-app-gateway.md) for VoiceMode + offline.
- **Humanitarian story:** [`/docs/marketing/humanitarian-deployment-kit.md`](humanitarian-deployment-kit.md).

---

*Refresh when curriculum-registry expands beyond 5 countries, when a new role surfaces (currently Guardian / Teacher / Student), or when the safeguarding model evolves.*
