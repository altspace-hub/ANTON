# ANTON School Mode — Implementation Plan
**Branch:** `school-mode`
**Version:** 1.0 | **Date:** 2026-03-04
**Source specs:** ANTON_SCHOOL_MODE_CLAUDE_CODE_BRIEFING.md (primary), ANTON_SCHOOL_MODE_SPEC.md (reference), ANTON_School_Mode_Review.md (review notes)
**Strategy:** Configuration layer on existing ANTON architecture. NOT a separate app.

---

## Phase Overview

| Phase | Target | Scope |
|-------|--------|-------|
| **Phase 1 — Foundation MVP** | 6–8 weeks | 1 subject (Maths T2), 1 persona (Alma), Sweden only, full .anton homework workflow |
| **Phase 2 — Core Expansion** | After Phase 1 validated | All T2+T3 subjects, 10 personas, Course Journey, Student Growth Model, SEN, Norway+UK |
| **Phase 3 — Advanced** | After Phase 2 | T4 university, My Radar bridges, career exploration, Nordic+UK rollout |
| **Phase 4 — Ecosystem** | After Phase 3 | T5 lifelong, humanitarian deployment (Ollama/SMS), 30+ countries |

---

## Architecture Decision

School Mode is a **configuration layer** on the existing 7-layer prompt builder. What changes:
- Navigation vocabulary: Areas → Subjects, Modules → Lessons
- Prompt content in Layers 1–4 (pedagogical instead of professional)
- New user roles: `student`, `guardian`, `teacher`, `school_admin`
- New DB tables (supplement — never replace — existing tables)
- New student-facing UI (hides professional configuration panel)
- New `.anton` bundle types: `assignment`, `submission`, `curriculum`, `lesson`

What does NOT change:
- 7-layer prompt builder architecture
- Multi-LLM provider system
- Knowledge source system (4 modes)
- `.anton` ZIP structure
- Audit logging
- Export system (MD, DOCX, XLSX, PDF)

---

## Core Principle

**In Work Mode, ANTON produces output. In School Mode, ANTON produces understanding.**

The AI must never give the direct answer. It guides students to discover answers themselves via Socratic method. This is enforced at Layer 1 (hard constraint) and via the L1–L4 assistance level system.

---

## Week-by-Week Build Order (Phase 1)

### Week 1–2: Foundation
1. ✅ Create `school-mode` branch
2. Add DB tables: schools, school_classes, class_enrollments, student_progress, assessment_results, laxhjalp_sessions, student_growth_profiles, teacher_assignments, assignment_submissions, curricula, teacher_personas, guardian_student_links
3. Add `school_role` + `education_tier` columns to `users` table (safe migration)
4. Add `appMode: AppMode` + toggle to `useSettingsStore`
5. Create `ModeToggle.tsx` component (Work ↔ School pill/switch in main header)
6. Create `SchoolLayout.tsx` (sidebar shows Subjects instead of Areas when mode=school)
7. Create i18n locale files: `public/locales/en-school.json`, `public/locales/sv-school.json`

### Week 2–3: Core UI
8. Build `SchoolDashboard.tsx` — subject cards, progress bars, quick question
9. Build `SchoolChat.tsx` — contextualised chat with pre-loaded context, teacher greeting, task-type buttons
10. Build `TeacherClassConfig.tsx` — class setup, assistance levels, knowledge sources
11. Build `GuardianDashboard.tsx` + `GuardianLinkFlow.tsx`

### Week 3–4: Prompt Architecture
12. Create `school-system-foundation.md` (Layer 1)
13. Create mathematics subject context for T2 (Layer 2): `server/areas/school/mathematics/area-context.md`
14. Create homework help lesson methodology with Socratic protocol (Layer 3): `server/areas/school/mathematics/modules/algebra/system-prompt.md` (+ other topics)
15. Create Alma teacher persona (Layer 4): `server/personas/school/alma.json` + `alma-prompt.md`
16. Create pedagogical skills (Layer 5): Socratic method, scaffolding
17. Load Skolverket Lgr22 Matematik as knowledge source: `curricula/se/grundskolan/matematik/`
18. Modify `server/services/prompt-builder.ts` to support School Mode assembly (inject school layers when `isSchoolMode=true`)

### Week 4–5: Learning Features
19. Build homework help flow with L1–L4 assistance level enforcement
20. Build `LaxhjalpMode.tsx` with 6-phase protocol + `laxhjalp_sessions` DB tracking
21. Build Learning Evidence Log capture + storage in `assignment_submissions.learning_evidence_log`
22. Build `AssessmentEngine.tsx` — multiple choice, short answer, calculation
23. Build `student_progress` tracking (overall + per-skill updates)

### Week 5–6: Teacher .anton Workflow
24. Build `AssignmentBuilder.tsx` — question builder UI (question types, rubric, settings)
25. Implement `assignment` `.anton` bundle export (ZIP: manifest + assignment.json + rubric.json + knowledge-sources/)
26. Implement student assignment import (unpack `.anton`, create DB records)
27. Build assignment completion flow (work through assignment, all interactions logged)
28. Implement `submission` `.anton` bundle export (answers + learning-evidence-log + ai-grade)
29. Build teacher submission review page (`SubmissionReviewer.tsx`)

### Week 6–7: Integration & Polish
30. Curriculum upload → study plan generation (AI-assisted parsing via Opus/Sonnet)
31. Student onboarding flow (account → tier → country → enroll via class code → diagnostic)
32. Teacher onboarding flow (account → create class → upload curriculum → get invite code)
33. Guardian onboarding flow (account → link to child via invite code → progress dashboard)
34. Connect all progress tracking to dashboard
35. Basic in-app notifications (deadlines, study reminders)

### Week 7–8: Testing & Stabilisation
36. Test full flow: teacher creates class → student enrolls → homework via `.anton` → submit → teacher reviews
37. Test all 3 assessment types
38. Test Läxhjälp 6-phase protocol end-to-end
39. Verify L1 assistance NEVER gives direct answers (systematic testing)
40. Verify all strings are i18n keys (grep for hardcoded text)
41. Fix bugs, stabilise

---

## Phase 1 Success Criteria

1. Teacher can create a class, set assistance levels, upload curriculum
2. Student can enroll via class code, see dashboard, start a maths session
3. Alma greets student and uses Socratic method
4. At L1, AI NEVER gives direct answer (verified through testing)
5. Teacher can create homework → export as `.anton`
6. Student can import `.anton` assignment, complete it, export submission + audit log
7. Teacher can import submission, see AI auto-grade + Learning Evidence Log
8. Guardian can link to child and see progress summary
9. All UI strings are i18n keys (zero hardcoded text)
10. Full flow works in both Swedish and English

---

## Database Schema — New Tables

All in `server/db/init.ts` as safe migrations (check column/table existence before ALTER/CREATE).

### Core Tables
- `schools` — school/org container
- `school_classes` — class (teacher + students + subject + curriculum)
- `class_enrollments` — many-to-many: student ↔ class
- `guardian_student_links` — optional guardian-student relationship

### Student Progress & Learning
- `student_progress` — per-student, per-subject progress (blocks + skills + Bloom's)
- `assessment_results` — individual assessment submissions
- `laxhjalp_sessions` — deep focus stuck-point resolution sessions
- `student_growth_profiles` — adaptive learning profile (S1–S4 stages)

### Teacher Workflow
- `teacher_assignments` — homework/exam content + config
- `assignment_submissions` — student work + learning evidence log

### Content
- `curricula` — uploaded/structured curricula per country
- `teacher_personas` — Alma + Phase 2 personas (DB record + prompt template)

### Users table additions
- `school_role TEXT` — 'student' | 'guardian' | 'teacher' | 'school_admin'
- `education_tier TEXT` — 'T1' | 'T2' | 'T3' | 'T4' | 'T5'

---

## User Roles

| Role | Can Do |
|------|--------|
| `student` | Own subjects, homework help, progress, My Radar (Phase 3) |
| `guardian` | View linked children's progress (summaries only, NOT individual messages) |
| `teacher` | Manage classes, set assistance levels, create/export assignments, view student progress |
| `school_admin` | School-wide settings, model selection, manage teachers |

---

## Key Architecture: 7-Layer Prompt in School Mode

| Layer | Work Mode | School Mode |
|-------|-----------|-------------|
| 1. System Foundation | Professional identity, output-oriented | Pedagogical identity, learning-oriented, NEVER give answers at L1 |
| 2. Area/Subject Context | Domain expertise (e.g., FCP regulatory) | Subject expertise (e.g., Maths Year 9, quadratic equations) |
| 3. Module/Lesson Methodology | Task methodology (e.g., gap analysis) | Teaching methodology (Socratic method, scaffolding) |
| 4. Persona | Expert persona (e.g., MLRO) | Teacher persona (Alma — patient, step-by-step) |
| 5. Skills | Professional skills | Pedagogical skills (Socratic, differentiation, scaffolding) |
| 6. Knowledge Sources | Regulatory docs, industry standards | Textbooks, curriculum documents |
| 7. Transparency | Thinking levels for user | Visible reasoning to model good thinking for students |

---

## Assistance Levels (Teacher-Controlled)

| Level | Behaviour |
|-------|-----------|
| **L1** (Full Guidance) | Step-by-step Socratic scaffolding. NEVER give answers. Guide through questions only. |
| **L2** (Moderate Help) | Explain concepts, give worked examples on SIMILAR (not identical) problems. |
| **L3** (Practice Mode) | Generate practice problems, check answers, explain errors. |
| **L4** (Reference Mode) | Answer questions directly like a textbook. Still explains reasoning. |

---

## Socratic Nudging Protocol (L1 Homework Help — Layer 3)

```
Step 1: UNDERSTAND — "What's the assignment asking you to do?"
Step 2: EXPLORE   — "What have you tried so far?"
Step 3: SCAFFOLD  — "Let's break this into smaller pieces."
Step 4: NUDGE     — "You said X — that's close. What if we think about Y?"
Step 5: VERIFY    — "You got [answer]. Can you explain why?"
Step 6: CONNECT   — "This is similar to [previous topic]. Can you see how?"
```

---

## Läxhjälp Protocol (Deep Focus Stuck-Point Resolution)

```
Phase 1: Identify the Stuck Point (diagnostic questions)
Phase 2: Trace Back to Solid Ground (last concept they understand)
Phase 3: Bridge the Gap (teach missing concept using what they know)
Phase 4: Practice on the Specific Gap (2–3 targeted problems)
Phase 5: Return to Original Problem (guide through actual homework)
Phase 6: Verify and Cement ("explain in your own words why this works")
```

Track each session in `laxhjalp_sessions` table. Feed into `student_progress.skills_data`.

---

## Alma Teacher Persona (Phase 1 — Mathematics)

```json
{
  "id": "alma",
  "name": "Alma",
  "specialisation": "Mathematics",
  "teaching_style": "Patient, methodical, step-by-step. Uses visual analogies and concrete examples before abstract notation.",
  "personality": "Warm, encouraging. Celebrates small wins. Never makes a student feel stupid.",
  "tier_adaptations": {
    "T2": "Socratic questioning, builds from concrete to abstract"
  }
}
```

Layer 4 prompt: uses Socratic questioning, tries different approaches when stuck, celebrates progress, checks understanding by asking student to explain back, speaks Swedish by default.

---

## .anton Education Bundle Types (New)

| Type | Direction | Contents |
|------|-----------|----------|
| `assignment` | Teacher → Students | manifest.json, assignment.json, rubric.json, knowledge-sources/ |
| `submission` | Student → Teacher | manifest.json, submission.json, learning-evidence-log.json, assessment-result.json |
| `curriculum` | Authority → Teachers | manifest.json, curriculum/, terminology/, grading/, sample-plans/ |
| `lesson` | Teacher → Teachers | manifest.json, system-prompt.md, teacher-persona.json, assessments/ |

---

## Key Files to Create (Phase 1)

```
src/
├── components/school/
│   ├── SchoolLayout.tsx
│   ├── SchoolDashboard.tsx
│   ├── SchoolChat.tsx
│   ├── SubjectCard.tsx
│   ├── AssistanceLevelBadge.tsx
│   ├── TeacherGreeting.tsx
│   ├── TaskTypeSelector.tsx
│   ├── QuickQuestion.tsx
│   ├── LaxhjalpMode.tsx
│   ├── AssessmentEngine.tsx
│   ├── LearningEvidenceLog.tsx
│   └── ModeToggle.tsx
│
├── components/teacher/
│   ├── TeacherDashboard.tsx
│   ├── TeacherClassConfig.tsx
│   ├── AssignmentBuilder.tsx
│   ├── SubmissionReviewer.tsx
│   └── StudentProgressView.tsx
│
├── components/guardian/
│   ├── GuardianDashboard.tsx
│   ├── GuardianLinkFlow.tsx
│   └── GuardianSettings.tsx
│
├── components/onboarding/
│   ├── StudentOnboarding.tsx
│   ├── TeacherOnboarding.tsx
│   └── GuardianOnboarding.tsx
│
└── pages/
    ├── SchoolDashboardPage.tsx
    ├── SchoolChatPage.tsx
    ├── TeacherDashboardPage.tsx
    └── GuardianDashboardPage.tsx

public/locales/
├── en-school.json
└── sv-school.json

server/
├── routes/school/
│   ├── school-classes.ts
│   ├── student-progress.ts
│   ├── assessments.ts
│   ├── assignments.ts
│   ├── laxhjalp.ts
│   ├── guardian.ts
│   └── curricula.ts
│
├── services/
│   ├── school-prompt-builder.ts
│   ├── assessment-engine.ts
│   ├── study-plan-generator.ts
│   ├── learning-evidence.ts
│   └── student-growth.ts
│
└── areas/school/
    └── mathematics/
        ├── area-context.md
        └── modules/
            ├── algebra/
            ├── geometry/
            ├── statistics/
            ├── number-theory/
            └── functions/

curricula/
└── se/
    ├── manifest.json
    └── grundskolan/
        └── matematik/
            ├── kursplan.md
            ├── centralt_innehall.json
            └── betygskriterier.json
```

---

## Phase 2–4 Scope (Do Not Build Yet)

**Phase 2:**
- All T2 subjects (10 subjects, ~55–80 modules)
- T3 subjects + T1 primary (redesigned interaction model with voice)
- Full teacher persona roster (10 personas)
- Course Journey with block-level progress tracking
- Student Growth Model (S1–S2)
- Life Skills & Work Coaching — first 8 modules
- Full assessment toolkit (15+ formats)
- SEN accommodations framework
- Modersmål (Mother Tongue Instruction)
- Norway (LK20) + UK (National Curriculum)

**Phase 3:**
- T4 university + thesis support
- My Radar with educational bridges
- Student Growth Model (S3–S4)
- Gamification (XP, streaks, achievements)
- Google Classroom + Microsoft 365 SSO

**Phase 4:**
- T5 lifelong learning bridge to Work Mode
- Humanitarian deployment (Ollama local, SMS/WhatsApp)
- 30+ country curriculum packages
- 30-language coverage

---

## i18n Rules (Non-Negotiable)

1. **No hardcoded strings** — every user-facing text is a translation key: `{t('school.dashboard.thisWeek')}`
2. **RTL-ready CSS** — use logical properties: `margin-inline-start` not `margin-left`
3. **Unicode-safe** — all text supports Arabic, CJK, emoji
4. **Locale-aware formatting** — dates + numbers via `Intl` APIs
5. **Fallback chain** — missing key → English → raw key (never show raw key to user)

---

## Safety & Privacy

| Tier | Content Filtering |
|------|------------------|
| T1 (6–12) | Strict. No violent/sexual content. No web search. Curated sources only. |
| T2 (13–15) | Moderate. Web search with safe search. |
| T3 (16–18) | Light. Most academic topics. Mature themes with academic framing. |
| T4–T5 (18+) | Same as Work Mode. |

- GDPR compliance — minimum data collection
- COPPA compliance — guardian consent for T1
- Student interactions never used for AI training without explicit consent
- Local-first option (Ollama) for full data sovereignty
- All data exportable/deletable per student request

---

*Build Phase 1. Test it. Then expand.*
