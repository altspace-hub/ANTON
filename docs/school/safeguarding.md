# School Safeguarding Model

> The safeguarding model is what makes School deployable in regulated jurisdictions. It's a layered defence: **prompt overlay** + **guardian consent gates** + **content category filters** + **evidence trail**.

---

## Layer 1: prompt overlay (`school-prompt-builder.ts`)

Every student-facing module call is wrapped with a role-appropriate overlay applied to the seven-layer prompt builder:

- **Layer 1 (System Foundation)** is replaced with a school-safe foundation: no harmful content generation, age-appropriate vocabulary, refusal behaviours for self-harm / sexual / violence / discrimination categories.
- **Layer 7 (Transparency)** is augmented with an emit-trail directive — every reasoning trace is captured in `revelation_chains` for teacher / guardian audit.
- **Web search** is disabled by default for under-13 sessions (configurable at the school-mode settings level for older students).
- **Persona overrides** (Layer 4) cannot be applied to school-mode sessions — students can't escape the safety overlay by changing the AI's persona.

The overlay runs server-side. The student's frontend cannot disable it.

---

## Layer 2: guardian consent gates

Captured in two tables:

- `guardians` (mig 094) — guardian ↔ ward relationship
- `guardian_approvals` (mig 094) — per-action approval queue

### What requires a guardian approval

| Action | Approval level |
|---|---|
| Initial pairing of a student account | Required (one-time, signed) |
| Connecting any new external system (email, integration, etc.) | Required per-system |
| Changing the AI model (e.g. from Haiku to Opus) | Required (cost + behaviour change) |
| Sharing an Evidence Log entry outside the school | Required per-share |
| Adding a connector that touches private data | Required per-connector |

### What does NOT require approval (after pairing)

- Daily lesson sessions
- Assignment completion
- Reading lesson content
- Standard module use within the configured envelope

The threshold is intentional: **first-use of a capability** is gated, but **routine use** flows freely. Otherwise approvals would become noise.

---

## Layer 3: content category filters

Beyond the prompt overlay, content categories that are blocked outright in school-mode regardless of prompt:

| Category | Block reason |
|---|---|
| Sexual content (any age) | Universal in school-mode |
| Violence (graphic) | Universal in school-mode |
| Self-harm / suicide methods | Universal — surfaces a help resource link instead |
| Discrimination (slurs, hate speech) | Universal in school-mode |
| Illegal substance instructions | Universal in school-mode |
| Real persons (private individuals, especially other students) | Generated content cannot reference real private persons |
| Identifying information about other students | Cross-student data isolation (see Layer 4) |

These filters apply at the response-streaming layer — the model may attempt to generate, but the chunk is blocked + the session emits a trail entry flagging the attempt.

---

## Layer 4: cross-student isolation

Students in the same school cannot see each other's:

- Session history
- Atoms in the knowledge graph
- Evidence Log entries
- Module configurations

Teachers can see student data for their own assignments. Admins can see school-wide aggregates but not individual sessions without explicit reason logged.

This isolation is enforced at the route layer (`server/routes/school.ts` checks the `(student_id, viewer_id)` pair before any query) AND at the Evidence Log layer (`learning_evidence_log` has a `student_user_id` and queries always filter on it).

---

## Layer 5: evidence trail

Every interaction emits trail entries. Three categories of trail relevant to safeguarding:

| Trail | Where | What |
|---|---|---|
| Reasoning trail | `revelation_chains` + `revelation_steps` | Per-session AI reasoning trace |
| Evidence Log | `learning_evidence_log` (mig 168) | Per-student structured outputs (work samples, quiz results, observations, portfolio items) |
| Guardian approval log | `guardian_approvals` (mig 094) | Per-approval consent state, timestamps |

A safeguarding officer / DPO can answer "what did this student see, when, and with what consent?" from these three tables alone.

---

## Layer 6: humanitarian / offline mode

When deployed offline (Ollama local + Mistral local, no internet):

- Web-search Layer is hard-disabled (no fallback)
- Real-time content categories list is bundled into the deployment (versioned)
- Evidence Log writes locally; sync-back is signed-bundle-only
- Guardian approvals work fully offline

The safeguarding model **does not relax** for humanitarian deployment. The bar is the same; the implementation runs locally.

---

## Compliance posture

| Regime | How school-mode satisfies |
|---|---|
| **COPPA (US)** | Guardian consent for under-13; data isolation; no third-party data sharing without consent |
| **UK GDPR / Children's Code** | Age-appropriate design; guardian gates; default-private |
| **EU GDPR** | Lawful basis = guardian consent; data subject rights honoured at the Evidence Log + Reasoning Trail level |
| **EU Digital Services Act** | Risk assessment artefacts produced via Risk Atlas pillar |
| **EU AI Act (high-risk: education)** | Trail emission + transparency overlay + human-in-the-loop (teacher review) for high-stakes outputs |

The pillar isn't certified against any of these — what's claimed is that the **architecture supports the certification**. A school deploying ANTON brings its own DPA + compliance assessment.

---

## Where to look

- **Code:** `server/services/school-prompt-builder.ts`, `server/routes/school.ts`, `server/routes/school-evidence.ts`
- **Schema:** `server/db/migrations-pg/094_app_gateway.sql` (guardians + approvals), `168_school_evidence_curriculum.sql` (Evidence Log + Curriculum Registry)
- **Architecture:** [`/docs/architecture/future/f-54-school-mode.md`](../architecture/future/f-54-school-mode.md)
- **Marketing:** [`/docs/marketing/school.md`](../marketing/school.md)
