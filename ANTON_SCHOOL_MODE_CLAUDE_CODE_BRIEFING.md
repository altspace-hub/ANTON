# ANTON School Mode — Claude Code Implementation Briefing

**Version:** 2.0  
**Date:** March 4, 2026  
**Author:** Daniel Bardun / FutureChain AB  
**Status:** Implementation Specification  
**Audience:** Claude Code — implementation guide for `school-mode` branch  
**Source:** ANTON School Mode Full Specification v1.0 (March 3, 2026) + Review & Revision (March 4, 2026)

---

## CRITICAL CONTEXT FOR CLAUDE CODE

This document is the single source of truth for implementing ANTON School Mode. It replaces the original v1.0 specification with revised scope, phased delivery, and corrected requirements.

**Git strategy:** Create a new branch `school-mode` from `main`. All School Mode work happens on this branch. We build and test here before merging to `main`. This means you must first examine the current `main` branch thoroughly — every file, every table, every route — before creating anything new.

**Investigation-before-building rule applies.** Before implementing ANY feature, scan the existing codebase for:
- Related tables, services, routes, and pages
- How the seven-layer prompt builder works (`prompt-builder.ts`)
- How areas and modules are structured (`/areas/` or `/server/areas/`)
- How personas are stored and injected
- The existing user/auth system (`users` table, RBAC roles)
- The audit logging system
- The `.anton` package format implementation
- The Apprentice Model (`apprentice_profiles`, `apprentice_observations`)
- The Quality Ratchet (`quality_scores`, `quality_baselines`)
- The Regulatory Radar (`radar_sources`, `radar_items`)

**Assembly discipline:** When modifying existing files, act as a surgical editor. Change only what needs changing. Do not rewrite, reorganise, or "improve" existing code that works.

---

## 1. WHAT WE ARE BUILDING

### 1.1 The One-Sentence Version

A **School Mode** for ANTON that transforms the existing professional AI coworker platform into an AI tutoring platform for students aged 6–25+, using the same seven-layer prompt architecture, the same multi-LLM system, and the same `.anton` package format — but with pedagogical methodology instead of consulting methodology, teacher personas instead of expert personas, and a student-facing interface instead of a professional configuration panel.

### 1.2 The Core Principle

**In Work Mode, ANTON produces output. In School Mode, ANTON produces understanding.**

The AI must never just give the answer. It guides students toward discovering the answer themselves, verifies their reasoning, and builds genuine competence over time. This principle must be enforced at the prompt level (Layer 1 System Foundation injects this as a hard constraint) and at the assistance level system (teachers configure how much help the AI gives).

### 1.3 Architecture Decision

School Mode is a **configuration layer** on top of the existing ANTON architecture. It is NOT a separate application.

What changes:
- Navigation vocabulary (Areas → Subjects, Modules → Lessons)
- Prompt content in Layers 1–4 (pedagogical instead of professional)
- A new user role system (Student, Guardian, Teacher, School Admin)
- New database tables for education-specific state
- A new student-facing UI that hides professional configuration
- New `.anton` bundle types for education content

What does NOT change:
- The seven-layer prompt builder architecture
- The multi-LLM provider system
- The knowledge source system (4 modes)
- The `.anton` package ZIP structure
- The audit logging infrastructure
- The export system (MD, DOCX, XLSX, PDF, PPTX)
- The underlying database engine

---

## 2. PHASED DELIVERY

We build in strict phases. Each phase must be working and testable before the next begins. Do not build ahead.

### PHASE 1 — Foundation MVP (Target: 6–8 weeks)

**Goal:** A working School Mode with one subject, one teacher, one tier, one curriculum. Enough to put in front of test users (a few Swedish T2 students and their teachers).

**Scope:**
- Mode toggle UI (Work ↔ School) — top-level switch
- Study Dashboard (home screen) — subject cards, progress overview, quick question
- Contextualised Chat — pre-loaded context, teacher greeting, task-type selection
- **1 subject:** Mathematics at T2 level (Year 7–9, ages 13–15)
- **1 teacher persona:** Alma (patient, methodical, step-by-step maths specialist)
- Homework help with the Socratic nudging protocol and L1–L4 assistance levels
- Basic Läxhjälp mode (deep focus on stuck points)
- Learning Evidence Log (audit trail reframed for education)
- Curriculum upload → basic study plan generation (Swedish Lgr22 Matematik)
- Basic assessments: Multiple Choice, Short Answer, Calculation Problem Set
- Teacher configuration layer — assistance levels, knowledge sources, class setup
- Guardian account system (optional link to student account)
- **Teacher .anton workflow:** Teacher creates homework/exam → exports as `.anton` → student imports → completes → exports audit log back to teacher
- Swedish + English UI (all strings as i18n keys, zero hardcoded text)
- RTL-ready CSS from day one (even though not needed for Swedish/English, the architecture must support it)
- Database schema for all education-specific tables

**NOT in Phase 1:**
- T1 (Primary), T3 (Upper Secondary), T4 (University), T5 (Lifelong Learning)
- My Radar
- Course Journey (long-term progress tracking)
- Student Growth Model
- Voice interaction
- Any subject other than Mathematics
- Any country other than Sweden
- Group features
- SEN accommodations (designed in Phase 1, built in Phase 2)

### PHASE 2 — Core Expansion (Target: after Phase 1 validated)

**Scope:**
- All T2 subjects (10 subjects, ~55–80 modules)
- T3 subjects (programme-specific, ~80–110 modules)
- Full teacher persona roster (10 personas)
- Course Journey with block-level progress tracking
- Student Growth Model (stages S1–S2)
- Life Skills & Work Coaching — first 8 modules
- Full assessment toolkit (15+ formats including Socratic examination, adaptive)
- Progress Tracker with Bloom's taxonomy dimensions
- Teacher and Guardian dashboards with class-wide views
- .anton curriculum bundle support
- SEN accommodations framework
- Modersmål (Mother Tongue Instruction) subject
- Norway (LK20) and UK (National Curriculum) as additional countries
- T1 (Primary, ages 6–12) with redesigned interaction model (see Section 7)
- Contextual action bar (task-emergent tools)
- Notification system (deadlines, study reminders)

### PHASE 3 — Advanced & University

**Scope:**
- T4 university subjects
- Thesis support workspace
- My Radar with educational bridges
- Student Growth Model (stages S3–S4)
- Advanced assessment types (portfolio review, mock exams with timing)
- Career exploration bridges to Work Mode
- Additional Nordic countries (Denmark, Finland)
- Community translation pipeline
- Gamification foundations (XP, streaks, achievements)
- School IT integration (Google Classroom, Microsoft 365 SSO)

### PHASE 4 — Ecosystem & Global

**Scope:**
- T5 lifelong learning bridge to Work Mode
- Graduation pathway (School → Work transition)
- Humanitarian deployment (Tier C: Ollama local, Tier D: SMS/WhatsApp)
- 30+ country curriculum packages (community-driven)
- Cross-school analytics (anonymised, opt-in)
- Full 30-language coverage
- NGO partnership deployment toolkit

---

## 3. USER ROLES & ACCOUNT ARCHITECTURE

### 3.1 New Roles for School Mode

The existing RBAC system has 3 roles: `admin`, `analyst`, `user`. School Mode adds 4 new roles that coexist with the existing ones. A user can have BOTH a Work Mode role and a School Mode role (e.g., a teacher who also uses ANTON professionally).

| Role | Access | Notes |
|------|--------|-------|
| `student` | Own subjects, homework help, progress view, My Radar | The primary learner role |
| `guardian` | View linked children's progress, manage settings for T1 children, set Radar content | Optional — students can use ANTON without a guardian |
| `teacher` | Manage classes/subjects, set assistance levels, view student progress, create lessons/exams, generate assessments, export/import .anton education bundles | The primary educator role |
| `school_admin` | School-wide settings, manage teacher accounts, content policies, model selection, data management | One level above teacher |

### 3.2 Guardian Account Architecture

**Key principle: Guardian accounts are OPTIONAL.** A student (T2+) can use ANTON without any guardian link. For T1 students (ages 6–12), a guardian link is strongly recommended but enforced by school policy, not by the platform. The platform never prevents a student from accessing their own learning.

**Database design:**

```sql
-- Extends existing users table
ALTER TABLE users ADD COLUMN school_role TEXT; -- 'student', 'guardian', 'teacher', 'school_admin'
ALTER TABLE users ADD COLUMN education_tier TEXT; -- 'T1', 'T2', 'T3', 'T4', 'T5'

-- Guardian-Student relationship (many-to-many)
CREATE TABLE guardian_student_links (
  id TEXT PRIMARY KEY,
  guardian_user_id TEXT NOT NULL REFERENCES users(id),
  student_user_id TEXT NOT NULL REFERENCES users(id),
  relationship TEXT DEFAULT 'guardian', -- 'guardian', 'parent', 'caregiver'
  permissions TEXT DEFAULT 'view_progress', -- comma-separated: 'view_progress', 'manage_settings', 'view_activity', 'set_radar'
  status TEXT DEFAULT 'active', -- 'active', 'pending', 'revoked'
  created_at TIMESTAMP DEFAULT NOW(),
  linked_by TEXT -- 'guardian_invite', 'teacher_setup', 'school_admin'
);

-- Linking flow:
-- Option A: Guardian creates account → enters invite code from student/teacher
-- Option B: Teacher/school admin links existing guardian to student
-- Option C: Student (T3+) invites guardian from their settings
```

**Guardian dashboard shows:**
- Overall progress summary per subject (not per-message surveillance)
- Time spent studying (aggregate daily/weekly, not live tracking)
- Areas of strength and areas needing attention
- Upcoming deadlines
- Learning milestones reached
- Wellbeing flags (if any, surfaced by the system)

**What a guardian CANNOT do:**
- Read individual chat messages between student and AI teacher
- Change the student's tier or enrolled subjects (teacher/school admin only)
- Override teacher-set assistance levels
- Access the student's Quick Question history

### 3.3 Teacher Account Details

Teachers are the most important role for platform adoption. Their experience must be frictionless.

**A teacher can:**
- Create and manage classes (a class = a group of students + a subject + a curriculum)
- Set assistance levels per task type (L1–L4) and lock them
- Upload curriculum documents → generate study plans
- View class-wide progress (the dashboard from Section 7.6 of the original spec)
- View individual student progress and Learning Evidence Logs
- Create custom lessons and assessments
- **Create .anton homework/exam bundles** (see Section 10)
- **Receive completed .anton audit log bundles back from students** (see Section 10)
- Generate practice problems, worksheets, assessments using AI
- Configure which teacher personas are available for their class
- Set knowledge sources (textbooks, curriculum docs)
- Toggle web search availability per class

**A teacher CANNOT:**
- Access student accounts directly (they see dashboards, not accounts)
- Change school-wide model selection (school admin only)
- Disable content filtering (school admin only)
- See student interactions outside their own classes

---

## 4. DATABASE SCHEMA — NEW TABLES

All new tables for School Mode. These supplement — never replace — existing ANTON tables.

```sql
-- ============================================================
-- SCHOOL MODE CORE TABLES
-- ============================================================

-- School/organisation container
CREATE TABLE schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL, -- 'se', 'gb', 'no', etc.
  curriculum_id TEXT, -- reference to curriculum package
  default_model TEXT DEFAULT 'claude-sonnet-4-5',
  content_filter_tier TEXT DEFAULT 'T2',
  settings JSONB DEFAULT '{}', -- school-wide config
  created_at TIMESTAMP DEFAULT NOW()
);

-- Classes (a teacher + students + subject + curriculum)
CREATE TABLE school_classes (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  teacher_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, -- 'Matematik 9B'
  subject_id TEXT NOT NULL, -- 'mathematics'
  education_tier TEXT NOT NULL, -- 'T1', 'T2', 'T3', 'T4', 'T5'
  curriculum_doc_id TEXT, -- reference to uploaded curriculum
  study_plan JSONB, -- generated week-by-week plan
  assistance_levels JSONB DEFAULT '{"homework": "L1", "self_study": "L2", "exam_practice": "L3", "reference": "L4"}',
  default_teacher_persona TEXT DEFAULT 'alma',
  web_search_enabled BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Student enrollment in classes
CREATE TABLE class_enrollments (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES school_classes(id),
  student_user_id TEXT NOT NULL REFERENCES users(id),
  enrolled_at TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'active' -- 'active', 'withdrawn', 'completed'
);

-- ============================================================
-- STUDENT PROGRESS & LEARNING STATE
-- ============================================================

-- Per-student, per-subject progress (the Course Journey state)
CREATE TABLE student_progress (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT NOT NULL REFERENCES school_classes(id),
  subject_id TEXT NOT NULL,
  -- Block-level tracking
  current_block TEXT, -- 'block_2_functions'
  blocks_data JSONB DEFAULT '[]', -- array of {block_id, status, knowledge_pct, application_pct, started_at, completed_at}
  -- Skill-level tracking
  skills_data JSONB DEFAULT '{}', -- {skill_id: {mastery_pct, last_assessed, attempts, error_patterns}}
  -- Bloom's dimensions
  blooms_data JSONB DEFAULT '{"knowledge": 0, "application": 0, "analysis": 0, "evaluation": 0, "creation": 0, "metacognition": 0}',
  -- Overall
  overall_progress_pct INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Assessment results
CREATE TABLE assessment_results (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT REFERENCES school_classes(id),
  assessment_type TEXT NOT NULL, -- 'multiple_choice', 'short_answer', 'calculation', 'socratic', 'mock_exam', etc.
  subject_id TEXT NOT NULL,
  topic TEXT, -- specific topic assessed
  score_pct INTEGER, -- 0-100
  blooms_levels TEXT[], -- which Bloom's levels this tested
  details JSONB, -- per-question results, time per question, etc.
  ai_feedback TEXT, -- AI-generated feedback summary
  duration_seconds INTEGER,
  assistance_level TEXT, -- L1-L4 during assessment
  created_at TIMESTAMP DEFAULT NOW()
);

-- Läxhjälp sessions (deep focus homework help)
CREATE TABLE laxhjalp_sessions (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT REFERENCES school_classes(id),
  subject_id TEXT NOT NULL,
  topic TEXT NOT NULL, -- what they're stuck on
  stuck_point TEXT, -- identified gap
  resolution_approach TEXT, -- which explanation worked
  status TEXT DEFAULT 'stuck', -- 'stuck', 'working', 'resolved'
  phases_completed TEXT[], -- ['identify', 'trace_back', 'bridge', 'practice', 'return', 'verify']
  duration_seconds INTEGER,
  session_id TEXT REFERENCES sessions(id), -- links to the actual chat session
  created_at TIMESTAMP DEFAULT NOW()
);

-- Student Growth Model (Apprentice Model equivalent for students)
CREATE TABLE student_growth_profiles (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES users(id),
  stage TEXT DEFAULT 'S1', -- 'S1' (Getting to Know), 'S2' (Building Confidence), 'S3' (Growing Independence), 'S4' (Self-Directed)
  session_count INTEGER DEFAULT 0,
  -- Learning preferences (AI observes and adapts)
  preferred_explanation_style TEXT, -- 'visual', 'verbal', 'abstract', 'concrete', 'examples_first', 'theory_first'
  learning_speed JSONB DEFAULT '{}', -- per-subject speed indicators
  error_patterns JSONB DEFAULT '{}', -- recurring mistake types
  motivation_triggers JSONB DEFAULT '{}', -- what keeps them engaged
  attention_patterns JSONB DEFAULT '{}', -- session length preferences, best times
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TEACHER HOMEWORK & EXAM WORKFLOW
-- ============================================================

-- Teacher-created assignments (homework, exams, curricula)
CREATE TABLE teacher_assignments (
  id TEXT PRIMARY KEY,
  teacher_user_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT REFERENCES school_classes(id),
  title TEXT NOT NULL,
  description TEXT,
  assignment_type TEXT NOT NULL, -- 'homework', 'exam', 'project', 'practice', 'curriculum_plan'
  subject_id TEXT NOT NULL,
  topic TEXT,
  -- Configuration
  assistance_level TEXT DEFAULT 'L1', -- forced assistance level for this assignment
  time_limit_minutes INTEGER, -- null = unlimited
  retakes_allowed INTEGER DEFAULT 0, -- 0 = no retakes
  due_date TIMESTAMP,
  -- Content
  content JSONB NOT NULL, -- the actual questions/tasks/instructions
  rubric JSONB, -- grading criteria
  knowledge_sources TEXT[], -- attached textbook references
  -- .anton export tracking
  anton_bundle_id TEXT, -- if exported as .anton, the bundle reference
  created_at TIMESTAMP DEFAULT NOW()
);

-- Student submissions against assignments
CREATE TABLE assignment_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES teacher_assignments(id),
  student_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'not_started', -- 'not_started', 'in_progress', 'submitted', 'graded', 'returned'
  -- Work tracking
  started_at TIMESTAMP,
  submitted_at TIMESTAMP,
  duration_seconds INTEGER,
  -- Results
  score_pct INTEGER,
  ai_grade JSONB, -- auto-grade results
  teacher_grade JSONB, -- teacher override/review
  feedback TEXT,
  -- The audit log of learning
  learning_evidence_log JSONB, -- full record of AI interactions, reasoning steps, help requested
  -- .anton export tracking
  audit_anton_bundle_id TEXT, -- when student exports their completed work + audit log
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- CURRICULUM & CONTENT
-- ============================================================

-- Uploaded/structured curricula per country
CREATE TABLE curricula (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  curriculum_name TEXT NOT NULL, -- 'Lgr22', 'National Curriculum KS3', 'LK20'
  curriculum_authority TEXT, -- 'Skolverket', 'DfE', 'Udir'
  source_url TEXT,
  school_structure JSONB, -- tiers mapped to local names
  grading_system JSONB, -- scale, passing grade, etc.
  term_structure JSONB, -- terms per year, start/end months
  subjects JSONB, -- available subjects with grade ranges
  last_updated TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Teacher personas for School Mode
CREATE TABLE teacher_personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, -- 'Alma', 'Viktor', 'Nora'
  specialisation TEXT NOT NULL, -- 'Mathematics', 'Science', 'Languages'
  teaching_style TEXT, -- 'Patient, methodical, step-by-step'
  personality TEXT, -- 'Warm, encouraging, uses humour'
  tier_adaptations JSONB, -- how persona adjusts per tier
  expertise_depth TEXT, -- knowledge boundaries
  cultural_context TEXT, -- localisation awareness
  prompt_template TEXT NOT NULL, -- Layer 4 prompt for this persona
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. THE MODE TOGGLE

### 5.1 Implementation

Add a top-level mode state to the user profile:

```typescript
// In user profile / app state
type AppMode = 'work' | 'school';

// The mode toggle lives in the main header/sidebar
// Switching mode changes:
// 1. Navigation sidebar (areas → subjects)
// 2. Dashboard content
// 3. Layer 1 system prompt (professional → pedagogical)
// 4. Vocabulary throughout the UI
// 5. Available features (some Work Mode features hidden, some School Mode features shown)
```

### 5.2 What Changes Per Layer When Mode = 'school'

| Prompt Layer | Work Mode Content | School Mode Content |
|-------------|-------------------|---------------------|
| Layer 1: System Foundation | Professional identity, output-oriented, business governance | Pedagogical identity, learning-oriented, child safety, NEVER give direct answers at L1 |
| Layer 2: Area/Subject Context | Area expertise (e.g., FCP regulatory context) | Subject expertise (e.g., Mathematics Year 9, quadratic equations) |
| Layer 3: Module/Lesson Methodology | Task methodology (e.g., gap analysis steps) | Teaching methodology (e.g., Socratic method for this topic, scaffolding approach) |
| Layer 4: Persona | Expert persona (e.g., MLRO, CTO) | Teacher persona (e.g., Alma — patient, step-by-step, maths specialist) |
| Layer 5: Skills | Professional skills (regulatory frameworks) | Pedagogical skills (Socratic method, differentiation, scaffolding) |
| Layer 6: Knowledge Sources | Regulatory documents, industry standards | Textbooks, curriculum documents, approved resources |
| Layer 7: Transparency | Thinking levels for user | Visible reasoning to model good thinking for students |

### 5.3 Layer 1 — School Mode System Foundation

This is the most critical prompt. It replaces the entire Work Mode system foundation when School Mode is active.

```markdown
# ANTON School Mode — System Foundation

You are an AI teacher within the ANTON platform. Your purpose is to help
students LEARN and UNDERSTAND — never to produce answers for them.

## Core Rules (NEVER VIOLATE):
1. NEVER give the student the direct answer to their homework or assignment
2. ALWAYS guide them toward discovering the answer through questions, hints, and scaffolding
3. If the student asks "what is the answer?", respond with "let me help you figure it out" and ask what they've tried
4. Celebrate effort and progress, not just correct answers
5. If the student is stuck, trace back to what they DO understand and build forward
6. Check understanding by asking the student to explain in their own words
7. Adjust your language complexity to the student's education tier
8. Follow the assistance level set by the teacher (L1–L4)

## Assistance Levels:
- L1 (Full Guidance): Step-by-step scaffolding. NEVER give answers. Guide through questions.
- L2 (Moderate Help): Explain concepts, give worked examples on SIMILAR (not identical) problems.
- L3 (Practice Mode): Generate practice problems, check answers, explain errors.
- L4 (Reference Mode): Answer questions directly (like a textbook). Still explain reasoning.

## Safety:
- Content must be age-appropriate for the student's tier
- If a student expresses distress beyond normal frustration, respond with empathy and gently suggest speaking to a trusted adult
- Never share personal opinions on controversial topics — present multiple perspectives
- All interactions are logged for academic integrity and student safety

## Current context:
- Student tier: {tier}
- Subject: {subject}
- Topic: {topic}
- Assistance level: {assistance_level}
- Teacher persona: {persona_name}
- Curriculum: {curriculum_name}
```

---

## 6. THE STUDENT INTERFACE

### 6.1 Design Philosophy

**The student should feel like they're talking to a teacher, not configuring software.**

Everything technical that a professional controls manually in Work Mode is either:
1. **Pre-set** by the curriculum, teacher, or school admin
2. **Auto-selected** by the AI based on context
3. **Surfaced contextually** only when relevant

The student's cognitive load should be zero on configuration and 100% on learning.

### 6.2 Study Dashboard (Home Screen)

The landing page when a student opens School Mode. It is NOT a chat — it is a visual overview.

**Dashboard shows:**
- Subject cards for the current week (from study plan), each with progress bar and [Continue →] / [Start →]
- MY PROGRESS — per-subject progress bars with mastery level labels
- QUICK QUESTION — lightweight entry point for any question
- ALL SUBJECTS — browse full subject list

**Data sources:**
- Subject cards: from `school_classes` + `student_progress` + study plan dates
- Progress: from `student_progress.overall_progress_pct`
- Week context: calculated from curriculum `term_structure` + current date

### 6.3 Contextualised Chat (Learning Interface)

When a student clicks a subject card, the chat opens with everything pre-loaded:

**Pre-loaded (invisible to student):**
- Subject context (from class enrollment)
- Topic context (from study plan + current week)
- Teacher persona (from class default, student can switch)
- Assistance level (from class config per task type)
- Knowledge sources (from class config)
- Student Growth Model data (from `student_growth_profiles`)
- LLM selection (from school settings)

**The teacher persona greets the student and asks what they're working on:**
- [Homework help] → assistance level locks to teacher-set level (typically L1)
- [Studying] → more open assistance (typically L2)
- [Practice] → generates problems (L3)

### 6.4 What Students Can vs. Cannot Control

| Setting | Student Controls? | Who Controls It? |
|---------|------------------|------------------|
| Teacher persona | ✅ Switch between available | Student |
| Subject/topic | ✅ Navigate freely | Student |
| Assistance level | ❌ Locked per task type | Teacher |
| Web search | ⚠️ Teacher enables/disables | Teacher |
| Upload documents | ✅ Always available | Student |
| LLM model | ❌ | School admin |
| Content filter tier | ❌ | School admin |
| Knowledge sources | ⚠️ Can add own notes | Teacher sets base |
| System prompt | ❌ Never visible | Platform |

---

## 7. T1 PRIMARY SCHOOL — REDESIGNED INTERACTION MODEL (Ages 6–12)

### 7.1 Why T1 Is Different

A 7-year-old cannot type well, cannot read long text responses, and does not engage with a chat interface the way a 14-year-old does. The standard contextualised chat model from T2+ does not work for T1. We need a fundamentally different interaction layer for young children.

### 7.2 T1 Design Principles

1. **Voice-first:** The primary input is speech, not typing. The primary output is spoken + visual, not text.
2. **Storytelling as pedagogy:** Lessons are delivered through stories, characters, and narrative. "Alma is helping her friend bake a cake. She needs to double the recipe. If the recipe says 2 cups of flour, how many does she need now?"
3. **Visual and interactive:** Progress shown with pictures, colours, stars — not progress bars and percentages.
4. **Short sessions:** Maximum 15–20 minutes before a break prompt. Session timer visible as a friendly visual (not a countdown clock).
5. **Structured choices over free text:** At T1, the AI offers options rather than open-ended questions. "Do you think the answer is: A) 3, B) 4, or C) 5?" rather than "What do you think?"
6. **Celebration and encouragement:** Every correct answer gets positive reinforcement. Wrong answers get gentle redirection: "Almost! Let's try together."
7. **Guardian visibility:** Activity summaries (not message-level surveillance) sent to linked guardian account.

### 7.3 T1 Technical Requirements

**Voice input/output:**
- Web Speech API for speech-to-text (browser native, no external dependency)
- Text-to-speech for AI responses (browser native `speechSynthesis` API for MVP; consider higher-quality TTS later)
- Fallback to text input/output if voice is unavailable

**Storytelling prompt layer:**
- Layer 3 (Lesson Methodology) for T1 modules includes narrative framing instructions: "Present all mathematical concepts through short stories featuring relatable characters and concrete scenarios. Never use abstract notation without a story context first."
- Layer 4 (Teacher Persona) at T1 level: "Speak simply. Use sentences of 10 words or fewer. Use emojis and sound effects in your text. Celebrate every effort."

**Visual interface adaptations:**
- Larger font (minimum 18px body, 24px headings)
- More whitespace between elements
- Emoji-rich UI labels
- Stars/stickers for completed activities instead of progress bars
- Reduced navigation — only 3–4 visible options at any time
- No visible configuration options at all (everything pre-set by teacher/guardian)

### 7.4 T1 Implementation (Phase 2)

T1 is NOT in Phase 1. When we build it in Phase 2:

1. Create a `T1Layout` component separate from the standard `SchoolLayout`
2. Implement voice input/output as a shared component usable in any tier
3. Create "Story Mode" prompt templates for T1 lesson modules
4. Build the visual progress view (stars, stickers, character upgrades)
5. Implement session timer with break encouragement
6. Build simplified assessment types (picture-based multiple choice, drag-and-drop matching, verbal quizzes)

---

## 8. HOMEWORK HELP & THE SOCRATIC METHOD

### 8.1 The Nudging Protocol

When a student asks for help with homework and assistance level is L1 (Full Guidance):

```
Step 1: UNDERSTAND — "What's the assignment asking you to do?"
Step 2: EXPLORE — "What have you tried so far?"
Step 3: SCAFFOLD — "Let's break this into smaller pieces."
Step 4: NUDGE — "You said X — that's close. What if we think about Y?"
Step 5: VERIFY — "You got [answer]. Can you explain why?"
Step 6: CONNECT — "This is similar to [previous topic]. Can you see how?"
```

This protocol is injected into Layer 3 (Lesson Methodology) for all homework-help contexts.

### 8.2 The Läxhjälp Protocol

For deep-focus stuck-point resolution:

1. **Identify the Stuck Point** — Diagnostic questions to pinpoint the exact gap
2. **Trace Back to Solid Ground** — Find the last concept the student DOES understand
3. **Bridge the Gap** — Teach the missing concept using what they know as foundation
4. **Practice on the Specific Gap** — 2–3 practice problems on the exact stuck point
5. **Return to Original Problem** — Now guide them through their actual homework
6. **Verify and Cement** — "Can you explain in your own words why this works?"

Track each läxhjälp session in the `laxhjalp_sessions` table. Feed results into `student_progress.skills_data`.

### 8.3 Anti-Cheating: The Learning Evidence Log

Every homework help session generates a Learning Evidence Log stored in `assignment_submissions.learning_evidence_log`:

```json
{
  "session_id": "...",
  "started_at": "...",
  "completed_at": "...",
  "assistance_level": "L1",
  "steps": [
    { "type": "student_question", "content": "How do I solve 2x + 3 = 11?", "timestamp": "..." },
    { "type": "ai_scaffold", "content": "What operation would undo the +3?", "timestamp": "..." },
    { "type": "student_response", "content": "Subtract 3?", "timestamp": "..." },
    { "type": "ai_confirm", "content": "Exactly! So what do we get?", "timestamp": "..." },
    { "type": "student_response", "content": "2x = 8", "timestamp": "..." },
    { "type": "ai_scaffold", "content": "Now what operation undoes 2x?", "timestamp": "..." },
    { "type": "student_response", "content": "Divide by 2, so x = 4", "timestamp": "..." },
    { "type": "ai_verify", "content": "Can you check by plugging 4 back in?", "timestamp": "..." },
    { "type": "student_verify", "content": "2(4) + 3 = 11 ✓", "timestamp": "..." }
  ],
  "outcome": "resolved",
  "skills_demonstrated": ["linear_equations", "inverse_operations", "verification"],
  "ai_assessment": "Student demonstrated understanding of inverse operations and was able to solve and verify independently after scaffolding."
}
```

This log can be shared with the teacher as evidence that the student learned, not copied.

---

## 9. ASSESSMENT SYSTEM

### 9.1 Phase 1 Assessment Types (MVP — build these first)

| Type | Implementation | Complexity |
|------|---------------|------------|
| **Multiple Choice** | Present 3–5 options, student selects, AI evaluates and explains | Low |
| **Short Answer** | Student writes 2–5 sentences, AI evaluates depth and accuracy | Medium |
| **Calculation Problem Set** | Student receives maths problems, shows working, AI marks method + answer | Medium |

### 9.2 Phase 2 Assessment Types (build later)

| Type | Implementation | Complexity |
|------|---------------|------------|
| Fill-in-the-Blank | Student types word/number into blank | Low |
| Matching | Connect items from two columns | Low |
| True/False with Justification | T/F + explain why | Medium |
| Ordering/Sequencing | Arrange items in correct order | Low |
| Socratic Examination | Back-and-forth dialogue with progressive depth | High |
| Case Study Analysis | Present scenario, student analyses | High |
| Source Criticism | Evaluate 2–3 sources on same topic | High |
| Debate/Argumentation | Student argues a position, AI plays opposing side | High |
| Formal Writing | Full essay/report with section-by-section feedback | High |
| Lab Report / Technical Writing | Structured template with scientific reasoning check | Medium |
| Code Challenge | Programming with test cases | High (uses Coding Area) |
| Mock Exam | Full timed exam, AI marking after completion | High |
| Diagnostic Assessment | Broad assessment for gap identification, not graded | Medium |
| Adaptive Assessment | Real-time difficulty adjustment | High |

### 9.3 Assessment Configuration (Teacher-Controlled)

```json
{
  "time_limit": "unlimited | soft_timer | hard_timer",
  "time_minutes": 60,
  "ai_assistance_during": "none | hints_only | full_help",
  "retakes": "none | unlimited | 1 | 2 | 3",
  "question_order": "fixed | randomised",
  "feedback_timing": "immediate | after_submission | teacher_reviews_first",
  "grading": "auto_ai | ai_plus_teacher | teacher_only",
  "rubric": "swedish_FA | percentage | pass_fail | blooms"
}
```

---

## 10. THE TEACHER .ANTON WORKFLOW — Critical New Feature

### 10.1 The Flow

This is the homework/exam lifecycle as a .anton package exchange:

```
TEACHER                          STUDENT
  │                                │
  │  1. Creates homework/exam      │
  │     in ANTON School Mode       │
  │                                │
  │  2. Exports as .anton bundle   │
  │     (assignment-bundle type)   │
  │  ─────────────────────────►    │
  │                                │
  │                                │  3. Student imports .anton
  │                                │     assignment into their
  │                                │     School Mode
  │                                │
  │                                │  4. Student works through
  │                                │     assignment with AI help
  │                                │     (at teacher-set L level)
  │                                │
  │                                │  5. Student completes and
  │                                │     submits. ANTON generates
  │                                │     Learning Evidence Log.
  │                                │
  │  6. Student exports completed  │
  │     work + audit log as        │
  │     .anton submission bundle   │
  │  ◄─────────────────────────    │
  │                                │
  │  7. Teacher imports submission │
  │     bundle. Reviews:           │
  │     - Student's answers        │
  │     - AI's auto-grade          │
  │     - Learning Evidence Log    │
  │     - Time spent               │
  │     - Skills demonstrated      │
  │                                │
  │  8. Teacher confirms/adjusts   │
  │     grade, adds feedback       │
  └────────────────────────────────┘
```

### 10.2 New .anton Bundle Types for Education

Add these to the existing 17 bundle types:

| Bundle Type | Purpose | Contents |
|-------------|---------|----------|
| `assignment` | Teacher → Students: homework, exam, project brief | `manifest.json`, `assignment.json` (questions/tasks), `rubric.json`, `knowledge-sources/`, `settings.json` (assistance level, time limit, retakes) |
| `submission` | Student → Teacher: completed work + audit trail | `manifest.json`, `submission.json` (answers/work), `learning-evidence-log.json`, `assessment-result.json` (AI auto-grade), `session-summary.json` |
| `curriculum` | School/authority → Teachers: structured curriculum package | `manifest.json`, `curriculum/` (structured content per subject per grade), `terminology/`, `grading/`, `sample-plans/` |
| `lesson` | Teacher → Teachers: shareable lesson plan | `manifest.json`, `system-prompt.md`, `teacher-persona.json`, `knowledge-sources/`, `assessments/`, `curriculum-alignment.json` |

### 10.3 Assignment Bundle Structure

```
homework-quadratic-equations.anton
├── manifest.json
│   {
│     "bundle_type": "assignment",
│     "version": "1.0",
│     "title": "Quadratic Equations — Week 38 Homework",
│     "subject": "mathematics",
│     "tier": "T2",
│     "teacher": "Anna Lindström",
│     "class": "Matematik 9B",
│     "created_at": "2026-09-14T08:00:00Z",
│     "due_date": "2026-09-18T23:59:00Z"
│   }
├── assignment.json
│   {
│     "instructions": "Complete all 5 problems. Show your working.",
│     "assistance_level": "L1",
│     "time_limit_minutes": null,
│     "retakes_allowed": 0,
│     "questions": [
│       { "id": "q1", "type": "calculation", "content": "Solve: x² + 5x + 6 = 0", "marks": 4, "blooms": "application" },
│       { "id": "q2", "type": "calculation", "content": "Solve: 2x² - 8 = 0", "marks": 3, "blooms": "application" },
│       { "id": "q3", "type": "short_answer", "content": "Explain in your own words what the discriminant tells us about a quadratic equation.", "marks": 5, "blooms": "evaluation" },
│       ...
│     ]
│   }
├── rubric.json
│   {
│     "grading_system": "swedish_FA",
│     "criteria": { ... }
│   }
└── knowledge-sources/
    └── textbook-chapter-5-excerpt.md
```

### 10.4 Submission Bundle Structure

```
submission-johan-quadratic-equations.anton
├── manifest.json
│   {
│     "bundle_type": "submission",
│     "version": "1.0",
│     "assignment_title": "Quadratic Equations — Week 38 Homework",
│     "student": "Johan K.", (or pseudonymised ID)
│     "submitted_at": "2026-09-17T19:42:00Z",
│     "duration_minutes": 47
│   }
├── submission.json
│   {
│     "answers": [
│       { "question_id": "q1", "student_answer": "x = -2 or x = -3", "working": "x² + 5x + 6 = 0\n(x+2)(x+3) = 0\nx = -2 or x = -3" },
│       { "question_id": "q3", "student_answer": "The discriminant (b²-4ac) tells us how many solutions..." }
│     ]
│   }
├── learning-evidence-log.json
│   {
│     "sessions": [
│       {
│         "question_id": "q1",
│         "assistance_level": "L1",
│         "steps": [ ... ], // full Socratic exchange
│         "outcome": "resolved_independently",
│         "skills_demonstrated": ["factoring", "zero_product_property"]
│       }
│     ],
│     "summary": "Student demonstrated strong factoring skills. Needed scaffolding on the discriminant concept (q3) — understood after visual explanation approach."
│   }
├── assessment-result.json
│   {
│     "ai_auto_grade": {
│       "total_score": "14/17",
│       "per_question": [ ... ],
│       "strengths": ["factoring", "equation_solving"],
│       "areas_for_improvement": ["discriminant_interpretation"],
│       "suggested_grade": "C"
│     }
│   }
└── session-summary.json
    {
      "total_time_minutes": 47,
      "active_time_minutes": 38,
      "questions_attempted": 5,
      "help_requests": 3,
      "stuck_points_resolved": 1
    }
```

### 10.5 Implementation for Phase 1

**Teacher side:**
1. Add "Create Assignment" page in teacher dashboard
2. Teacher fills in: title, instructions, questions (with a question builder UI), assistance level, due date
3. "Export as .anton" button → generates the assignment bundle ZIP
4. Teacher distributes (email, LMS, shared drive — the .anton file is just a file)

**Student side:**
1. Add "Import Assignment" button on Study Dashboard
2. Student uploads the `.anton` file
3. ANTON unpacks, creates entry in `teacher_assignments` + `assignment_submissions`
4. Student works through assignment in contextualised chat
5. All interactions logged in `assignment_submissions.learning_evidence_log`
6. When student clicks "Submit", ANTON:
   - Runs AI auto-grading
   - Generates Learning Evidence Log summary
   - Packages everything into a submission `.anton` bundle
   - Student downloads and sends back to teacher

**Teacher review side:**
1. Teacher imports submission `.anton` bundle
2. Sees: student answers, AI grade, Learning Evidence Log, time spent
3. Can confirm AI grade, adjust, add comments
4. Updates grade in their records

---

## 11. TEACHER PERSONAS (Phase 1: Alma only)

### 11.1 Alma — Mathematics Specialist

```json
{
  "id": "alma",
  "name": "Alma",
  "specialisation": "Mathematics",
  "teaching_style": "Patient, methodical, step-by-step. Uses visual analogies and concrete examples before abstract notation.",
  "personality": "Warm, encouraging. Celebrates small wins. Occasionally uses gentle humour. Never makes a student feel stupid for not knowing something.",
  "tier_adaptations": {
    "T1": "Very simple language, stories about real-world counting and measuring, lots of emoji, 'Let's figure this out together!'",
    "T2": "Socratic questioning, 'What do you think happens if...?', builds from concrete to abstract",
    "T3": "More direct, connects maths to real applications, exam technique focus",
    "T4": "Collegial, academic tone, discusses proof strategies and mathematical elegance"
  }
}
```

### 11.2 Layer 4 Prompt Template for Alma (T2)

```markdown
You are Alma, a mathematics teacher. Your approach:

- You are patient and methodical. You never rush.
- You always start from what the student already knows.
- You use concrete examples before abstract notation.
- When a student gets stuck, you don't just repeat the explanation — you try a completely different approach (visual, numerical, real-world example).
- You celebrate progress: "Great thinking!" "You're getting it!"
- You check understanding by asking the student to explain back to you.
- If the student makes a mistake, you're curious about it: "Interesting — what made you think that?" Find the misconception, don't just correct the error.
- You connect new topics to things the student has already mastered.
- You speak Swedish with the student unless they write in another language.
```

### 11.3 Phase 2 Persona Roster

| Teacher | Specialisation | Style |
|---------|---------------|-------|
| Alma | Mathematics | Patient, methodical, step-by-step |
| Viktor | Science (Physics/Chemistry) | Experimental, "let's figure this out" |
| Nora | Statistics & Data | Analytical, real-world examples |
| Erik | History & Social Studies | Storyteller, connects past to present |
| Saga | Languages & Literature | Creative, discussion-oriented |
| Leo | Computer Science & Tech | Build-first, learn-by-doing |
| Freja | Arts & Creative | Open-ended, exploratory |
| Oscar | Sports & Health | Motivational, practical |
| Mia | Study Skills & Organisation | Structured, coaching |
| Professor Lindström | University research | Academic, rigorous, Socratic |

---

## 12. CURRICULUM ARCHITECTURE

### 12.1 Phase 1: Sweden Only

Download and structure Skolverket Lgr22 for Matematik (Year 7–9):
- Source: `skolverket.se/undervisning/grundskolan/kursplaner-for-grundskolan`
- Structure into `curricula/se/grundskolan/matematik/`
- Create `manifest.json` for Sweden (see Section 14.7 of original spec)
- Create `centralt_innehall.json` with core content by year range
- Create `betygskriterier.json` with grading criteria

### 12.2 Curriculum File Structure

```
curricula/
├── se/
│   ├── manifest.json        # Country metadata
│   ├── grundskolan/
│   │   ├── matematik/
│   │   │   ├── kursplan.md
│   │   │   ├── centralt_innehall.json
│   │   │   ├── betygskriterier.json
│   │   │   └── termer_sv.json
│   │   └── ...
│   └── gymnasiet/
│       └── ...
└── gb/                       # Phase 2
    └── ...
```

### 12.3 Curriculum Upload Flow (Phase 1)

Teacher uploads PDF/DOCX of their school's specific year plan. ANTON (using Opus or Sonnet) processes it:
1. Extract text from uploaded document
2. Map content to ANTON's subject/module structure
3. Generate week-by-week study plan
4. Teacher reviews and adjusts
5. Save as `school_classes.study_plan`

This is AI-assisted, not fully automated. Set expectations: works well for clean, structured documents. May need manual adjustment for messy or image-heavy files.

---

## 13. i18n & LOCALISATION RULES

### 13.1 Non-Negotiable Architecture Rules

These apply to ALL code in the `school-mode` branch:

1. **No hardcoded strings.** Every user-facing text is a translation key: `{t('dashboard.thisWeek')}`. Never `<button>Send</button>`.
2. **RTL-ready CSS.** Use logical properties: `margin-inline-start` not `margin-left`. Tailwind `rtl:` prefix where needed.
3. **Unicode-safe everywhere.** All text handling must support Arabic, CJK, Devanagari, Ge'ez, emoji.
4. **Locale-aware formatting.** Dates, numbers via `Intl` APIs using student's locale.
5. **Fallback chain.** Missing translation → English → raw key. Never show `dashboard.thisWeek` to a user.

### 13.2 Phase 1 Language Files

Create two locale files:
- `src/i18n/locales/sv-school.json` — Swedish School Mode strings
- `src/i18n/locales/en-school.json` — English School Mode strings

School Mode strings are separate from (but loaded alongside) Work Mode strings. They share common strings (buttons, navigation) but have school-specific vocabulary.

---

## 14. SAFETY, PRIVACY & GOVERNANCE

### 14.1 Content Filtering by Tier

| Tier | Filtering |
|------|-----------|
| T1 (6–12) | Strict. No violent, sexual, or disturbing content. No web search. Curated sources only. |
| T2 (13–15) | Moderate. Web search with safe search. Mature topics handled age-appropriately. |
| T3 (16–18) | Light. Most academic topics accessible. Mature themes with academic framing. |
| T4–T5 (18+) | Same as Work Mode. |

Implemented as a content filter instruction in Layer 1 system prompt, varying by `education_tier`.

### 14.2 Data Privacy

- GDPR compliance — minimum data collection
- COPPA compliance — guardian consent mechanism for T1
- No advertising in School Mode (ever)
- Student interactions never used for AI training without explicit consent
- Local-first option (Ollama) for full data sovereignty
- All data exportable and deletable per student request

### 14.3 Wellbeing Monitoring (Passive)

If AI detects distress patterns (not keyword matching — contextual assessment):
- AI responds with empathy
- Flags surfaced on teacher dashboard (not automated reporting)
- Follows local mandatory reporting laws
- Never generates false urgency — errs on side of gentle concern

---

## 15. ONBOARDING FLOWS

### 15.1 Student Onboarding (Phase 1)

```
1. Student creates account (or teacher creates for them)
2. "Welcome to ANTON School! Let's set things up."
3. Select education tier (or pre-set by teacher/school)
4. Select country → determines curriculum
5. Select language (interface + teaching language)
6. Enroll in classes (via class code from teacher)
7. Quick diagnostic: "Let's see where you are in Maths" (5 min)
8. Dashboard loads with first week's subjects
```

### 15.2 Teacher Onboarding (Phase 1)

```
1. Teacher creates account with school code
2. "Welcome! Let's set up your first class."
3. Create class: name, subject, tier, curriculum upload
4. Set assistance levels (defaults provided — can accept defaults)
5. Get class invite code to share with students
6. See empty class dashboard → "Invite students to get started"
7. Optional: create first assignment with guided builder
```

### 15.3 Guardian Onboarding (Phase 1)

```
1. Guardian creates account
2. "Link to your child's account" → enter student's invite code (or email)
3. Student confirms link (or teacher confirms for T1)
4. Guardian dashboard shows: progress summary, nothing else yet
5. "Your child's learning is private. You'll see progress summaries, not individual messages."
```

---

## 16. BUILD ORDER FOR PHASE 1

Claude Code should implement in this order:

### Week 1–2: Foundation
1. Create `school-mode` branch
2. **Investigate existing codebase thoroughly** — database schema, prompt builder, areas/modules structure, user system, .anton format
3. Add new database tables (Section 4)
4. Add `school_role` and `education_tier` to users table
5. Add Mode Toggle to main header (`AppMode` state)
6. Create `SchoolLayout` component (sidebar with subjects instead of areas)
7. Create i18n files (`sv-school.json`, `en-school.json`) with initial strings

### Week 2–3: Core UI
8. Build Study Dashboard (`SchoolDashboard.tsx`) — subject cards, progress bars, quick question
9. Build Contextualised Chat (`SchoolChat.tsx`) — pre-loaded context, teacher greeting, task-type buttons
10. Build Teacher Configuration page (`TeacherClassConfig.tsx`) — class setup, assistance levels, knowledge sources
11. Build Guardian link flow and Guardian Dashboard

### Week 3–4: Prompt Architecture
12. Create School Mode Layer 1 system prompt (`school-system-foundation.md`)
13. Create Mathematics subject context (Layer 2) for T2 level
14. Create homework help lesson methodology (Layer 3) with Socratic protocol
15. Create Alma teacher persona (Layer 4) with tier adaptations
16. Create pedagogical skills (Layer 5) — Socratic method, scaffolding
17. Load Skolverket Lgr22 Matematik as knowledge source (Layer 6)
18. Modify `prompt-builder.ts` to support School Mode layer assembly

### Week 4–5: Learning Features
19. Build homework help flow with L1–L4 assistance levels
20. Build Läxhjälp mode with the 6-phase protocol
21. Build Learning Evidence Log capture
22. Build basic assessment engine (multiple choice, short answer, calculation)
23. Build `student_progress` tracking (overall + per-skill)

### Week 5–6: Teacher .anton Workflow
24. Build assignment creation page (question builder UI)
25. Implement `assignment` .anton bundle export
26. Implement student assignment import
27. Build assignment completion flow (work through + submit)
28. Implement `submission` .anton bundle export (answers + audit log)
29. Implement teacher submission import and review page

### Week 6–7: Integration & Polish
30. Curriculum upload → study plan generation
31. Student onboarding flow
32. Teacher onboarding flow
33. Guardian onboarding flow
34. Connect all progress tracking to dashboard
35. Basic notification system (in-app: deadlines, study reminders)

### Week 7–8: Testing & Stabilisation
36. Test full flow: teacher creates class → student enrolls → homework assigned via .anton → student completes → audit log returned via .anton → teacher reviews
37. Test all assessment types
38. Test Läxhjälp protocol end-to-end
39. Test assistance level enforcement (L1 truly never gives answers)
40. Test i18n (all strings via keys, no hardcoded text)
41. Fix bugs, stabilise, prepare for test users

---

## 17. KEY FILES TO CREATE

```
Branch: school-mode

src/
├── components/school/
│   ├── SchoolLayout.tsx          # Main layout for School Mode
│   ├── SchoolDashboard.tsx       # Study Dashboard (home screen)
│   ├── SchoolChat.tsx            # Contextualised Chat interface
│   ├── SubjectCard.tsx           # Subject card component for dashboard
│   ├── ProgressBar.tsx           # Visual progress component
│   ├── AssistanceLevelBadge.tsx  # Shows current L1/L2/L3/L4
│   ├── TeacherGreeting.tsx       # Teacher persona greeting
│   ├── TaskTypeSelector.tsx      # [Homework] [Studying] [Practice] buttons
│   ├── QuickQuestion.tsx         # Lightweight question entry
│   ├── LaxhjalpMode.tsx          # Deep focus homework help
│   ├── AssessmentEngine.tsx      # Assessment runner
│   ├── LearningEvidenceLog.tsx   # Audit log viewer
│   └── ModeToggle.tsx            # Work ↔ School toggle
│
├── components/teacher/
│   ├── TeacherDashboard.tsx      # Class-wide progress view
│   ├── TeacherClassConfig.tsx    # Class setup and configuration
│   ├── AssignmentBuilder.tsx     # Create homework/exams
│   ├── SubmissionReviewer.tsx    # Review student submissions
│   ├── StudentProgressView.tsx   # Individual student detail
│   └── AssessmentGenerator.tsx   # AI-powered assessment creation
│
├── components/guardian/
│   ├── GuardianDashboard.tsx     # Child progress overview
│   ├── GuardianLinkFlow.tsx      # Link to student account
│   └── GuardianSettings.tsx      # Notification preferences
│
├── components/onboarding/
│   ├── StudentOnboarding.tsx     # First-time student setup
│   ├── TeacherOnboarding.tsx     # First-time teacher setup
│   └── GuardianOnboarding.tsx    # First-time guardian setup
│
├── i18n/locales/
│   ├── en-school.json            # English School Mode strings
│   └── sv-school.json            # Swedish School Mode strings
│
├── server/
│   ├── routes/school/
│   │   ├── school-classes.ts     # Class CRUD + enrollment
│   │   ├── student-progress.ts   # Progress tracking
│   │   ├── assessments.ts        # Assessment engine API
│   │   ├── assignments.ts        # Teacher assignments + student submissions
│   │   ├── laxhjalp.ts           # Läxhjälp session tracking
│   │   ├── guardian.ts           # Guardian link management
│   │   └── curricula.ts          # Curriculum management
│   │
│   ├── services/
│   │   ├── school-prompt-builder.ts  # School Mode prompt assembly
│   │   ├── assessment-engine.ts      # Assessment logic
│   │   ├── study-plan-generator.ts   # Curriculum → study plan
│   │   ├── learning-evidence.ts      # Evidence log generation
│   │   └── student-growth.ts         # Student Growth Model
│   │
│   ├── areas/school/
│   │   └── mathematics/
│   │       ├── area-context.md       # Layer 2: Subject context
│   │       ├── modules/
│   │       │   ├── algebra/
│   │       │   │   ├── system-prompt.md    # Layer 3: Lesson methodology
│   │       │   │   └── module.json         # Module config
│   │       │   ├── geometry/
│   │       │   ├── statistics/
│   │       │   └── ...
│   │       └── README.md
│   │
│   └── personas/school/
│       ├── alma.json              # Alma persona definition
│       └── alma-prompt.md         # Layer 4 prompt template
│
├── curricula/
│   └── se/
│       ├── manifest.json
│       └── grundskolan/
│           └── matematik/
│               ├── kursplan.md
│               ├── centralt_innehall.json
│               └── betygskriterier.json
│
└── school-mode.sql               # All new database tables (migration)
```

---

## 18. WHAT SUCCESS LOOKS LIKE

### Phase 1 Success Criteria

1. A teacher can create a class, set assistance levels, and upload a curriculum
2. A student can enroll via class code, see their dashboard, and start a maths session
3. Alma greets the student, identifies what they're working on, and uses Socratic method
4. At L1, the AI NEVER gives the direct answer — verified through testing
5. A teacher can create a homework assignment and export it as `.anton`
6. A student can import the `.anton` assignment, complete it, and export the submission + audit log
7. A teacher can import the submission, see the AI auto-grade AND the Learning Evidence Log
8. A guardian can link to their child and see a progress summary
9. All UI strings are i18n keys — no hardcoded text anywhere
10. The full flow works in both Swedish and English

---

## APPENDIX A: ORIGINAL SPECIFICATION REFERENCE

The full original specification (v1.0, 2,302 lines) covers many features deferred to later phases. Key sections to reference when building Phase 2+:

- **Section 7:** Course Journey — term-long progress tracking (Phase 2)
- **Section 9:** Full Assessment Toolkit — 15+ types (Phase 2)
- **Section 10:** My Radar — personalised interest feed with educational bridges (Phase 3)
- **Section 11:** Student Growth Model — adaptive learning profiles (Phase 2)
- **Section 14:** Full Localisation Architecture — 30 languages, 3 layers (Phase 2–4)
- **Section 15:** .anton in Education — full package ecosystem (progressive)
- **Section 16:** Work Mode Integration — career bridges (Phase 3)
- **Section 20:** Humanitarian Deployment — Tier C/D (Phase 4)

These sections are designed, not thrown away. They will be built when their phase arrives.

---

*End of implementation briefing. Build Phase 1. Test it. Then we expand.*
