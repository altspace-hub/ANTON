# openEXPERT / ANTON — Coding Area Addendum: AI Code Instruction Builder & Project Alignment Reviewer

> **Audience:** Claude Code  
> **Purpose:** This document specifies two new cross-cutting capabilities for the Coding Area. They sit alongside the existing four tiers (Code Review, Script Lite, Script Medium, Coding Large) and serve as the bridge between ANTON's planning intelligence and external AI coding tools. Read the full `CODING_AREA_SPEC.md` first — everything in this addendum builds on and integrates with that specification.  
> **Relationship to existing spec:** This is an addendum, not a replacement. The existing four tiers remain exactly as specified. These two new capabilities add a layer above them — ANTON as the strategic intelligence that plans and governs work that is then executed in external coding tools.  
> **First step for Claude Code:** Read `CODING_AREA_SPEC.md` in full, then read this document. Then audit the codebase as described in Section 5.1 of the main spec. Everything here must integrate with existing platform capabilities — prompt builder, workflow engine, expert panels, project storage, versioning, quality scoring, export/import system.

---

## 1. The Strategic Gap This Fills

The existing Coding Area spec covers what happens when ANTON itself is the coding environment — reviewing code, generating scripts, managing large projects end-to-end. That is powerful and differentiated.

But there is a parallel reality: many professionals and teams already use dedicated AI coding tools — Claude Code, OpenAI Codex, Mistral Code — for their actual development work. These tools are good at writing code. They are not good at knowing what to write, why, for whom, under what constraints, with what governance, or whether the project is still aligned with its original goals three weeks into implementation.

That is exactly what ANTON excels at. The 29 expert areas, the persona library, the discovery frameworks, the expert panel reviews, the goal alignment checks — all of this intelligence currently lives inside ANTON's own Coding Large tier. These two new capabilities make that intelligence exportable to any AI coding tool the user prefers.

The mental model is simple: **ANTON is the senior architect and project governance layer. The coding tool is the developer who receives well-crafted instructions and builds accordingly.**

Together, the two capabilities create a continuous loop:

```
Plan (Instruction Builder) → Build (External Tool) → Review (Project Reviewer) → Steer (Export corrections) → Build → Review → Steer...
```

This is how the best engineering organisations work — planning before building, reviewing against goals during building, correcting course when drift is detected. No AI coding tool currently provides this. ANTON can.

---

## 2. Capability A: AI Code Instruction Builder

### 2.1 What It Is

A guided, multi-phase discovery and planning system that produces comprehensive, professional-grade `.md` instruction files optimised for a specific AI coding tool. The user goes through a structured process — similar to the Coding Large discovery phase but explicitly designed for external tool export — and at the end receives one or more `.md` files they can take directly to Claude Code, Codex, or Mistral Code to start building.

### 2.2 Who This Is For

- **Technical leads** who want to plan properly before starting a Claude Code session, rather than improvising as they go
- **Product managers** who understand what they want built but need the requirements translated into a format an AI coding tool can execute against
- **Consultants** building solutions for clients who want a documented, reviewable plan before committing to implementation
- **Teams** who want a shared, reviewed, approved set of instructions before anyone starts coding — the same "decisions before code" philosophy that drives Coding Large, but for external tools
- **Solo developers** who want to think through architecture, constraints, and goals systematically rather than diving straight into prompting

### 2.3 The Guided Flow

The Instruction Builder follows a phased approach that mirrors Coding Large's discovery but is shaped specifically for export. The user does not need to know which phase they are in — ANTON guides them through it conversationally.

**Step 1: Tool Selection**

The user selects which AI coding tool they will be building with:
- **Claude Code** — Anthropic's terminal-based agentic coding tool
- **OpenAI Codex** — OpenAI's coding agent
- **Mistral Code** — Mistral's coding assistant

This selection matters because it shapes the output format. Each tool has different conventions for how it consumes instructions, what metadata it expects, and what instruction patterns produce the best results. ANTON maintains a **tool profile** for each (see Section 2.7) that governs the output formatting.

The tool selection should be presented as the first question and should be easily changeable later — the user might want to export the same plan to multiple tools.

**Step 2: Project Vision & Goals**

ANTON asks the user to describe what they want to build at a high level. This is not a technical specification — it is a conversation about intent, audience, and success criteria. The questioning approach follows the same intelligent, adaptive pattern as the existing prompt improvement flow in `PromptPage.tsx` and the Coding Large discovery.

Key questions ANTON asks (adapted based on the user's answers — not a rigid checklist):

- What are you building? Describe it as if explaining to a colleague who has never heard of it.
- Who is it for? Who will use it, and what problem does it solve for them?
- What does success look like? If this project is done well, what is true that is not true today?
- What is the scope? What is in scope for the first version, and what is explicitly out of scope?
- Are there existing systems this needs to integrate with?
- What technology preferences or constraints exist? (Language, framework, deployment environment, etc.)
- What is the timeline and what are the priorities if trade-offs are needed?

ANTON captures these answers and synthesises them into a **Vision & Goals Document** — a structured summary that becomes the anchor for everything that follows. This document is stored in the project and is reusable (it feeds into Capability B: the Project Alignment Reviewer).

**Step 3: Domain-Specific Discovery**

Based on what the user described in Step 2, ANTON activates the relevant expert personas from the existing 29-area library and asks domain-specific questions. This is the same pattern as Coding Large Phase 1 discovery, but the user experience is a flowing conversation rather than a formal phase gate.

Examples of how domain expertise shapes the questions:

- If the project handles personal data → the Legal and Compliance personas ask about GDPR obligations, data retention, lawful basis, subject access rights
- If it is a financial services application → the FCP personas ask about AML requirements, transaction monitoring, audit trail obligations, sanctions screening
- If it involves authentication and sensitive data → the Security persona asks about threat models, authentication mechanisms, encryption requirements, OWASP considerations
- If it is a customer-facing product → the Product Manager persona asks about user journeys, feature prioritisation, analytics requirements, accessibility
- If it involves data processing → the Data Science persona asks about data volumes, processing requirements, output formats, error handling

The user does not need to know which personas are active — they just experience a thorough, intelligent set of questions that cover angles they might not have considered. ANTON makes it visible which expert perspective each question comes from (e.g., "From a security perspective: how should authentication work in this system?") so the user understands why the question is being asked.

**Step 4: Architecture & Technical Decisions**

Based on the vision, goals, and domain-specific requirements gathered in Steps 2-3, ANTON proposes:

- A high-level architecture (components, data flow, key integrations)
- Technology stack recommendation with rationale
- Project structure (directory layout, key files, module organisation)
- A phased implementation approach (what to build first, second, third)
- Key technical decisions that need to be made upfront, with ANTON's recommendation and the reasoning behind it

The user reviews these proposals, asks questions, pushes back, and refines. This is interactive — not a one-shot output. ANTON explains trade-offs clearly so non-developers can participate in the decisions.

**Step 5: Expert Panel Review of the Plan**

Before generating the final instruction files, ANTON runs the plan through a structured expert panel review — the same mechanism described in the main Coding Area spec (Section 5.6), reusing the existing workflow engine.

The review panel is selected based on the project's domain:
- **Always included:** Software Architect, Product Manager
- **Conditionally included:** Security Analyst (if security-sensitive), Compliance/FCP persona (if regulated domain), Data Scientist (if data-heavy), Legal (if IP or licensing considerations)

Each reviewer produces a structured verdict: endorse, flag (proceed with noted concerns), or dissent (recommends changes before proceeding). The user sees all reviews and decides how to proceed.

This review step is what makes the Instruction Builder's output qualitatively different from "just writing a prompt." The instructions that reach the coding tool have been examined from multiple professional perspectives before a single line of code is written.

**Step 6: Instruction File Generation**

ANTON generates the final `.md` instruction file(s), formatted according to the selected tool's profile (see Section 2.7). The output is not a single monolithic document — it is a structured set of files that together give the coding tool everything it needs:

**Primary instruction file** (e.g., `CLAUDE.md` for Claude Code, `INSTRUCTIONS.md` for Codex, `PROJECT.md` for Mistral Code):
- Project overview and goals (concise, tool-optimised)
- Architecture decisions and technical constraints
- Technology stack and dependencies
- Implementation phases with priorities
- Coding standards and conventions to follow
- Key domain requirements that must not be missed (compliance, security, etc.)
- Testing expectations
- What "done" looks like for each phase

**Supplementary files** (generated as needed based on project complexity):
- `ARCHITECTURE.md` — Detailed architecture document with component diagrams (in Mermaid or text), data models, API designs
- `ROADMAP.md` — Phased implementation plan with dependencies, milestones, and acceptance criteria for each phase
- `DECISIONS.md` — Key technical and architectural decisions made during planning, with rationale — so the coding tool understands not just what to build but why specific choices were made
- `DOMAIN_REQUIREMENTS.md` — Domain-specific requirements that the coding tool must be aware of (regulatory obligations, security standards, compliance constraints) — extracted from the domain-specific discovery in Step 3
- `TEST_PLAN.md` — Testing strategy and key test cases, defined before implementation begins

All files are stored in the project and versioned using the existing versioning system.

**Step 7: Review Cycle on Instruction Files**

This is a critical differentiator. Before the user takes the files to their coding tool, ANTON offers a review cycle — the same multi-perspective expert review that modules already support.

The user can:
- **Self-review:** Read through the generated files and ask ANTON to clarify, expand, or modify specific sections
- **Expert review:** Run the instruction files through another round of expert panel review, this time with the panel reading the actual instructions rather than the plan — "If a coding tool follows these instructions exactly, will the result meet the goals we defined?"
- **Peer review:** Share the files with a colleague (via the existing project sharing mechanism) who can add comments or suggest changes, which ANTON integrates
- **Iterative refinement:** The user can go through multiple review cycles, each time refining the instructions based on feedback — ANTON tracks versions and shows diffs between iterations

The review cycle uses the same `coding_reviews` table and workflow engine as the main Coding Area. The only difference is that the artifact being reviewed is an instruction document rather than code or an architecture design.

The goal is that by the time the user takes these files to Claude Code or Codex, the instructions have been through the same rigour that a professional engineering organisation applies to a project brief — multiple expert perspectives, documented decisions, reviewed assumptions, clear acceptance criteria.

### 2.4 Connection to Existing Platform

The Instruction Builder is not a standalone feature. It draws deeply on the existing platform:

- **Seven-layer prompt builder** — The discovery questions, expert reviews, and instruction generation all use the standard prompt architecture with appropriate persona injection, skills attachment, and thinking levels
- **Persona library** — Expert reviewers are drawn from the existing persona definitions. No new personas need to be created — the Software Architect, Product Manager, Security Analyst, FCP Specialist, Legal Advisor, CTO, and others are already defined and ready to use
- **Skills library** — Domain-specific skills (GDPR frameworks, OWASP methodology, agile planning, clean architecture principles, etc.) are attached to the relevant prompt layers during discovery and review
- **Workflow engine** — The expert panel review is implemented as a named workflow, exactly as described in the main spec's Section 5.6
- **Project storage** — Each Instruction Builder session is stored as a project (or within an existing project), using the existing `projects` table. All generated files are versioned and searchable
- **Prompt improvement flow** — The guided questioning in Steps 2-3 reuses and extends the existing `PromptPage.tsx` approach
- **Export/import system** — Instruction Builder outputs can be exported as `.anton` packages (see Section 2.8), following the same bundler convention as all other exports
- **Quality scoring** — Generated instruction files are quality-scored using the existing quality scoring system

### 2.5 What Makes This Different From "Just Writing a Prompt"

The critical insight is that a good set of instructions for an AI coding tool is not a prompt — it is a professional brief. The difference:

A prompt says: "Build me a transaction monitoring dashboard with React and Node.js."

An Instruction Builder output says: "Here is a complete project brief with architecture decisions, domain requirements, security constraints, testing expectations, and phased implementation plan — all reviewed by relevant domain experts and aligned with explicitly stated goals. Here is exactly what to build, in what order, to what standard, and here is how to know when each phase is done."

The first produces code that might work. The second produces code that is likely to be right — right for the domain, right for the users, right for the regulatory context, right for the technical constraints.

### 2.6 Storage and Project Structure

Each Instruction Builder session creates or extends a project with the following directory structure:

```
~/coding/instruction-builder/[project-name]/
├── VISION_AND_GOALS.md          — The anchor document from Step 2
├── DISCOVERY_NOTES.md            — Full record of domain-specific discovery (Step 3)
├── ARCHITECTURE_PROPOSAL.md      — Architecture and tech decisions (Step 4)
├── EXPERT_REVIEWS/               — Review records from Step 5
│   ├── review_software_architect.md
│   ├── review_security_analyst.md
│   └── review_product_manager.md
├── exports/                      — Generated instruction files (Step 6)
│   ├── claude-code/              — Claude Code formatted exports
│   │   ├── CLAUDE.md
│   │   ├── ARCHITECTURE.md
│   │   ├── ROADMAP.md
│   │   ├── DECISIONS.md
│   │   ├── DOMAIN_REQUIREMENTS.md
│   │   └── TEST_PLAN.md
│   ├── codex/                    — Codex formatted exports
│   │   └── INSTRUCTIONS.md       — (format varies by tool profile)
│   └── mistral-code/             — Mistral Code formatted exports
│       └── PROJECT.md
├── review-cycles/                — Iteration history from Step 7
│   ├── v1/
│   ├── v2/
│   └── v3/
└── README.md                     — Project overview, status, links
```

This directory is connected to ANTON's project system so all artifacts are searchable, linked to sessions, and tracked in the knowledge graph.

### 2.7 Tool Profiles

ANTON maintains a tool profile for each supported coding tool. These profiles shape how instruction files are formatted, structured, and optimised for consumption by each tool. The profiles should be stored as configurable JSON or YAML files so they can be updated as tools evolve, and so users or the community can contribute profiles for additional tools.

**Claude Code Profile:**
- Primary file: `CLAUDE.md` — Claude Code looks for this file by convention in the project root
- Structure: Follows Claude Code's convention of project-level instructions. Clear sections with markdown headers. Concise, imperative tone. Specific about file paths, naming conventions, and patterns to follow.
- Supplementary files: Multiple `.md` files in the project root or a `docs/` directory — Claude Code can be instructed to read these
- Special considerations: Claude Code works in the terminal and reads the filesystem directly. Instructions should reference file paths, directory structures, and command-line workflows. Claude Code responds well to explicit "do this, then this, then this" sequencing and to "before you start, read these files" directives.
- Instruction patterns that work well: Numbered implementation steps, explicit acceptance criteria per step, "verify by running [command]" checkpoints, references to existing files in the project

**OpenAI Codex Profile:**
- Primary file: `INSTRUCTIONS.md`
- Structure: Task-oriented instruction blocks. Codex works well with clear input/output specifications and explicit success criteria.
- Special considerations: Codex instruction format and conventions — adapt as OpenAI's tooling evolves. Focus on clear task decomposition and expected outputs.
- Instruction patterns that work well: Task blocks with clear boundaries, expected outputs described explicitly, error handling expectations stated upfront

**Mistral Code Profile:**
- Primary file: `PROJECT.md`
- Structure: Adapt to Mistral Code's conventions as they stabilise — this is the newest of the three tools
- Special considerations: Monitor Mistral Code's evolving instruction format and update the profile accordingly
- Note: This profile will need more frequent updates as Mistral Code matures. Build the profile system to accommodate easy updates.

**Implementation guidance:**
- Store profiles in a `tool_profiles/` directory within the Coding Area's configuration
- Each profile is a JSON/YAML file defining: primary filename, file structure template, tone guidelines, formatting rules, special directives, and example patterns
- The profile is loaded when the user selects their tool in Step 1 and applied during instruction generation in Step 6
- Users should be able to view and customise profiles (e.g., "I know Claude Code, and I want my instructions formatted in a specific way") — this customisation is saved per-user or per-project
- New tool profiles can be added by the user or imported from the community — same pattern as importing skills or modules

### 2.8 Export as .anton Package

Following the existing export/import convention (see main spec Section 7), a completed Instruction Builder project can be exported as an `.anton` package. The export contains:

- The full Vision & Goals document
- The discovery notes
- The architecture proposal
- All expert review records
- The generated instruction files for the selected tool(s)
- The tool profile used
- The review cycle history
- Metadata: project name, description, domain tags, tool target, creation date

Someone importing this package gets a complete, reviewed project brief they can adapt to their context — change the technology stack, adjust the domain requirements, update the goals — and then re-export for their preferred coding tool. This is the same "import, adapt, use" flow described in the main spec for Coding Large blueprints.

Bundle type for the existing bundler: `type: 'instruction-builder-project'`

---

## 3. Capability B: Project Alignment Reviewer

### 3.1 What It Is

A comprehensive project review system that ingests an existing codebase (or project state), compares it against stated visions, goals, and plans (ideally the files created in Capability A, but also manually provided), and produces a structured alignment assessment. From that assessment, it generates targeted instruction files for the user's preferred AI coding tool to steer the project back on track or forward toward its goals.

### 3.2 Who This Is For

- **Technical leads** mid-way through a project who want an objective check on whether they are still building what they set out to build
- **Product managers** who want to verify that the development work matches the requirements they defined
- **Teams** doing sprint reviews or milestone check-ins who want a structured assessment rather than a subjective conversation
- **Solo developers** who have been deep in implementation and want to step back and evaluate progress against their original plan
- **Anyone** who has an existing codebase and wants professional-grade guidance on what to do next, shaped by domain expertise and delivered as actionable instructions for their coding tool

### 3.3 The Difference From Existing Code Review (Tier 1)

The existing Code Review & Explain (Tier 1) asks: "What does this code do? Is it well-written? Is it secure?" — it evaluates the code on its own terms.

The Project Alignment Reviewer asks: "Is this code achieving what you set out to achieve? Are you on track? Where have you drifted? What should you do next?" — it evaluates the code against external goals and visions.

This is a fundamentally different question and requires different inputs, different analysis, and different outputs. Tier 1 does not need goals or a vision document. The Project Alignment Reviewer requires them — they are the standard against which the code is measured.

Think of it this way: Tier 1 is a code auditor. The Project Alignment Reviewer is a project governance advisor who happens to also read code.

### 3.4 The Guided Flow

**Step 1: Project Ingestion**

The user provides the current state of their project. This can be done in several ways:

- **Repository link** — GitHub, GitLab, or other public repository URL. ANTON uses the repository fetching mechanism described in the main spec (Section 5.8) with smart prioritisation: README first, then entry points, key modules, configuration files, test files, then breadth-first through the rest.
- **Local directory** — Path to a local project folder. ANTON reads the directory structure and key files using the existing local folder integration.
- **File upload** — The user uploads key project files directly into ANTON. Useful for smaller projects or when only specific components need review.
- **Existing ANTON project** — If the project was originally planned using the Instruction Builder (Capability A) or managed as a Coding Large project, ANTON already has the full project context and can load it directly.

For large repositories, ANTON performs intelligent sampling rather than trying to ingest everything:
1. Read the README, package.json/requirements.txt/Cargo.toml (project metadata)
2. Read the directory tree structure (understanding organisation)
3. Read entry points and main application files
4. Read configuration files (environment, deployment, CI/CD)
5. Read test files (understanding what is tested and what is not)
6. Read key modules identified from the entry points
7. For files not read in full, maintain an index of what exists and where — the alignment assessment can flag areas that need deeper review

The ingestion should produce a **Project State Summary** — an internal structured document that captures: what the project contains, how it is organised, what technologies it uses, what features appear to be implemented, what the test coverage looks like, and what the overall health indicators are (dependency freshness, code organisation quality, documentation completeness).

**Step 2: Vision & Goals Input**

The user provides the goals and vision against which the project should be measured. Multiple input methods:

- **From Instruction Builder** — If the user used Capability A to plan this project, ANTON loads the Vision & Goals document, the architecture proposal, the roadmap, and the domain requirements automatically. This is the ideal case — the goals are already structured, reviewed, and stored in the project.
- **From existing files** — The user uploads or points to `.md` files containing their project vision, goals, requirements, or specifications. ANTON parses these and extracts the key goals, milestones, and requirements.
- **From conversation** — The user describes their goals conversationally. ANTON uses the same intelligent questioning approach as the Instruction Builder's Step 2 to elicit a structured set of goals. This is captured and stored as a Vision & Goals document for future reference.
- **Combination** — The user might have an Instruction Builder plan from three months ago plus verbal updates about changed priorities. ANTON can merge these, noting what has changed.

ANTON synthesises all inputs into a **Goals Reference Document** — a structured summary of what the project is supposed to achieve, what the milestones are, what the domain-specific requirements are, and what "done" looks like. This becomes the standard for the alignment assessment.

**Step 3: Alignment Analysis**

This is the core analytical step. ANTON compares the Project State Summary against the Goals Reference Document and produces a structured alignment assessment. The analysis is performed using the seven-layer prompt builder with multiple expert personas, each examining alignment from their perspective.

**Dimensions of alignment analysis:**

- **Feature completeness** — Which planned features are implemented, partially implemented, or missing? Are there implemented features that were not in the plan (scope creep)? Product Manager persona leads this analysis.

- **Architecture alignment** — Does the actual architecture match the planned architecture? Have architectural decisions drifted? Are there structural issues that will make future planned features difficult to implement? Software Architect and CTO personas lead this.

- **Domain requirement compliance** — Are the regulatory, compliance, security, or other domain-specific requirements from the goals being met in the implementation? This is where ANTON's 29-area expertise becomes decisive — a generic code review tool cannot assess whether a financial services application meets AMLR obligations, but ANTON can. FCP, Legal, Security, and other relevant domain personas lead this based on the project's domain.

- **Technical health** — Is the codebase in a healthy state to continue toward the remaining goals? Dependency issues, technical debt accumulation, test coverage gaps, documentation drift. Software Engineer persona leads this.

- **Security posture** — Does the current security implementation match the security requirements defined in the goals? Are there new attack surfaces that were not anticipated? Security Analyst persona leads this, using the same security review modes described in the main spec's Tier 1.

- **Goal drift assessment** — Looking at the overall trajectory: is the project converging toward its goals or diverging? Are there decisions that have been made during implementation that contradict the original intent? This is the meta-level alignment check — the same concept as the goal alignment check in Coding Large (main spec Section 5.7), but applied to an externally-developed project. Project Management and Product Manager personas lead this.

**Output: Alignment Report**

The alignment assessment produces a structured report with:

- **Executive summary** — One paragraph: is this project on track, partially on track, or off track? What is the single most important thing to address?

- **Traffic light assessment** — For each dimension above:
  - 🟢 **Green** — On track, no action needed
  - 🟡 **Amber** — Partially aligned, worth discussing, specific concerns noted
  - 🔴 **Red** — Drifted from goals, action needed, specific issues detailed

- **Feature alignment matrix** — A structured table showing each planned feature/goal and its current status: implemented, partially implemented, not started, or unplanned (scope creep). With notes on each.

- **Domain-specific findings** — Detailed findings from each expert perspective, with the same structured format used in Coding Large expert panel reviews (endorse/flag/dissent with specific recommendations)

- **Priority recommendations** — A ranked list of what to do next, informed by the original goals and the current state. Not just "fix these bugs" but "these three things will bring you back into alignment with your stated goals, in this order, for these reasons."

- **Questions for the project lead** — Specific questions where the assessment identified ambiguity: "The original plan specified real-time data processing, but the current implementation uses batch processing. Was this an intentional change? If so, the downstream features X and Y may need to be redesigned."

**Step 4: Expert Panel Review of the Assessment**

Before generating correction instructions, the alignment report itself goes through expert panel review — the same workflow as the Instruction Builder's Step 5. This ensures the assessment is balanced, that domain-specific findings are accurate, and that the recommendations are prioritised correctly.

The user sees the full assessment with all expert perspectives and can add their own context: "Yes, we intentionally changed from real-time to batch processing because of infrastructure constraints." ANTON incorporates this feedback into the final recommendations.

**Step 5: Steering Instruction Generation**

Based on the alignment assessment and the user's feedback, ANTON generates targeted instruction files for the user's preferred AI coding tool. These files tell the coding tool specifically what to do to bring the project back into alignment or push it forward toward the next goals.

The user selects their tool (same selection as Capability A: Claude Code, Codex, or Mistral Code), and ANTON generates tool-optimised instruction files using the same tool profiles described in Section 2.7.

**Types of steering instructions generated:**

- **Correction instructions** — For red and amber items: specific, actionable tasks to fix alignment issues. Each task includes: what to change, why (referencing the original goal), where in the codebase the change should be made (file paths and function references where possible), acceptance criteria for the change, and what to verify after making it.

- **Continuation instructions** — For green items and next-phase work: instructions for what to build next, in what order, maintaining consistency with the existing codebase and the original architectural decisions. These are essentially the next sprint's worth of instructions, informed by the current state and the remaining goals.

- **Refactoring instructions** — For technical health issues: specific refactoring tasks with rationale, prioritised by impact on the project's ability to reach its goals. Not "refactor everything" but "these specific refactoring tasks unblock the next set of planned features."

- **Updated project plan** — If the alignment assessment reveals that the original plan needs updating (changed priorities, discovered constraints, scope adjustments), ANTON generates an updated set of planning documents that reflect the current reality while maintaining alignment with the core vision.

All generated instruction files follow the same structure and formatting as Capability A's outputs, using the selected tool profile. They are stored in the project and versioned.

**Step 6: Review Cycle on Steering Instructions**

Same review cycle mechanism as Capability A's Step 7. The user can self-review, run expert panel reviews on the steering instructions, iterate, and refine before taking them to their coding tool.

### 3.5 The Continuous Loop

Capabilities A and B are designed to work together in a continuous cycle:

1. **Plan** (Capability A) — Create comprehensive, reviewed instructions for your coding tool
2. **Build** (External tool) — Execute the instructions in Claude Code, Codex, or Mistral Code
3. **Review** (Capability B) — Bring the project back to ANTON for alignment assessment
4. **Steer** (Capability B output) — Take the steering instructions back to your coding tool
5. **Build** (External tool) — Continue building with corrected course
6. **Review** (Capability B) — Assess again at the next milestone
7. Repeat until the project goals are achieved

ANTON is the persistent intelligence that holds the vision and ensures continuity across the entire lifecycle. The coding tool changes, the codebase evolves, team members come and go — but the goals, the domain requirements, the architectural decisions, and the governance trail remain in ANTON.

This loop should be made visible and easy to navigate in the UI. When a user opens a project that was created with the Instruction Builder, ANTON should proactively offer to run an alignment review when appropriate (e.g., when significant time has passed since the last review, or when the user returns to the project after a period of external development).

### 3.6 Connection to Existing Platform

The Project Alignment Reviewer integrates with:

- **Goal alignment check module** (main spec Section 5.7) — The core alignment analysis reuses the same module, extended to handle externally-developed projects. The `goal-alignment-checker` module with its seven-layer prompt is the same; the inputs are broader (external codebase + goals vs. internal project state + discovery document).
- **Expert panel workflow** (main spec Section 5.6) — Same review workflow, same personas, same verdict structure
- **Code Review (Tier 1)** — The technical health and security posture dimensions of the alignment analysis use the same review lenses and security modes as Tier 1, but applied within the alignment context rather than standalone
- **Repository fetching** (main spec Section 5.8) — Same mechanism for ingesting external codebases
- **Project storage** — Alignment reviews are stored as project artifacts, versioned and searchable
- **Versioning and diff** — The user can compare alignment reports across time: "How has our alignment changed since last month's review?"
- **Knowledge graph** — Alignment findings feed into the knowledge graph, building cross-project intelligence about common drift patterns, frequent compliance gaps, etc.
- **Export/import** — Alignment review configurations (which dimensions to assess, which experts to include, what goals to measure against) can be exported and reused across projects

### 3.7 Storage and Project Structure

```
~/coding/alignment-reviews/[project-name]/
├── project-state/                   — Captured project state at time of review
│   ├── PROJECT_STATE_SUMMARY.md     — Structured summary of ingested codebase
│   └── ingested-files/              — Cached copies of key files reviewed
├── goals/                           — Goals reference documents
│   ├── VISION_AND_GOALS.md          — From Instruction Builder or user input
│   ├── DOMAIN_REQUIREMENTS.md       — Domain-specific requirements
│   └── ORIGINAL_INSTRUCTIONS/       — Original instruction files if from Capability A
├── assessments/                     — Alignment assessment outputs
│   ├── ALIGNMENT_REPORT_v1.md       — Full structured alignment report
│   ├── ALIGNMENT_REPORT_v2.md       — Updated after user feedback
│   └── EXPERT_REVIEWS/              — Individual expert review records
├── steering-instructions/           — Generated correction/continuation files
│   ├── claude-code/
│   │   ├── CORRECTIONS.md
│   │   ├── NEXT_PHASE.md
│   │   └── REFACTORING.md
│   ├── codex/
│   └── mistral-code/
├── history/                         — Review cycle history for trending
│   ├── 2026-02-15/
│   ├── 2026-03-01/
│   └── 2026-03-15/
└── README.md
```

When the same project is reviewed multiple times, the `history/` directory accumulates assessment snapshots that enable trend analysis: "Your feature completeness has improved from 45% to 72% over the last three reviews, but security posture has declined — here is why."

---

## 4. Database Additions

Verify against existing schema before creating to avoid duplication. These extend the tables defined in the main spec's Section 5.2.

**`instruction_builder_projects`** — Instruction Builder project records
- `id`, `name`, `description`, `status`, `created_at`, `updated_at`
- `target_tool` — enum: 'claude-code', 'codex', 'mistral-code'
- `vision_goals` — JSON or text field with the Vision & Goals document
- `discovery_notes` — JSON or text field with domain-specific discovery notes
- `architecture_proposal` — JSON or text field with the architecture proposal
- `tool_profile_id` — reference to the tool profile used for generation
- `review_cycle_count` — number of review iterations completed
- Foreign key to `projects` table (existing) — Instruction Builder projects are a specialised type of project
- Foreign key to `coding_projects` table (if connected to a Coding Large project)

**`instruction_files`** — Generated instruction file records
- `id`, `instruction_builder_project_id`, `filename`, `file_path`, `file_type` (primary/supplementary)
- `target_tool`, `version`, `content_hash`
- `review_status` — whether this version has been reviewed
- `created_at`, `updated_at`

**`tool_profiles`** — Tool profile configurations
- `id`, `tool_name`, `display_name`, `primary_filename`, `structure_template`
- `tone_guidelines`, `formatting_rules`, `special_directives`
- `is_default` — whether this is the system default for this tool
- `user_id` (nullable) — for user-customised profiles
- `created_at`, `updated_at`

**`alignment_reviews`** — Project Alignment Reviewer records
- `id`, `project_name`, `review_date`, `status`
- `project_state_summary` — JSON with the ingested project state
- `goals_reference` — JSON with the goals reference document
- `alignment_report` — JSON with the structured alignment assessment
- `overall_status` — enum: 'on-track', 'partially-aligned', 'off-track'
- `instruction_builder_project_id` (nullable) — link to original Instruction Builder project if applicable
- Foreign key to `projects` table (existing)

**`alignment_dimensions`** — Individual dimension assessments within a review
- `id`, `alignment_review_id`, `dimension_name`
- `status` — enum: 'green', 'amber', 'red'
- `findings`, `recommendations`
- `reviewer_persona_id` — which expert persona assessed this dimension

**`steering_instructions`** — Generated steering instruction records
- `id`, `alignment_review_id`, `target_tool`
- `instruction_type` — enum: 'correction', 'continuation', 'refactoring', 'plan-update'
- `filename`, `file_path`, `version`
- `review_status`
- `created_at`, `updated_at`

---

## 5. New API Routes

Following the existing convention:

**Instruction Builder:**
- `GET/POST /api/coding/instruction-builder/projects` — CRUD for Instruction Builder projects
- `POST /api/coding/instruction-builder/projects/:id/discovery` — Run guided discovery session
- `POST /api/coding/instruction-builder/projects/:id/architecture` — Generate architecture proposal
- `POST /api/coding/instruction-builder/projects/:id/review` — Trigger expert panel review
- `POST /api/coding/instruction-builder/projects/:id/generate` — Generate instruction files for selected tool
- `POST /api/coding/instruction-builder/projects/:id/review-cycle` — Submit review cycle feedback
- `GET /api/coding/instruction-builder/tool-profiles` — List available tool profiles
- `GET/PUT /api/coding/instruction-builder/tool-profiles/:id` — View/update tool profile

**Project Alignment Reviewer:**
- `GET/POST /api/coding/alignment-reviews` — CRUD for alignment reviews
- `POST /api/coding/alignment-reviews/:id/ingest` — Ingest project from repository/directory/files
- `POST /api/coding/alignment-reviews/:id/goals` — Set/update goals reference
- `POST /api/coding/alignment-reviews/:id/analyse` — Run alignment analysis
- `POST /api/coding/alignment-reviews/:id/expert-review` — Trigger expert panel review of assessment
- `POST /api/coding/alignment-reviews/:id/generate-steering` — Generate steering instructions for selected tool
- `GET /api/coding/alignment-reviews/:id/history` — Get review history for trend analysis

---

## 6. New React Pages

Following the existing page convention:

- `InstructionBuilderLandingPage.tsx` — Entry point: tool selection, new project or continue existing
- `InstructionBuilderDiscoveryPage.tsx` — Guided discovery conversation (Steps 2-4)
- `InstructionBuilderReviewPage.tsx` — Expert panel review display and user feedback (Step 5)
- `InstructionBuilderExportPage.tsx` — Generated instruction files display, download, review cycle (Steps 6-7)
- `AlignmentReviewLandingPage.tsx` — Entry point: project ingestion method selection
- `AlignmentReviewSetupPage.tsx` — Project ingestion and goals input (Steps 1-2)
- `AlignmentReviewReportPage.tsx` — Alignment assessment display with traffic lights, expert findings, and interactive Q&A (Steps 3-4)
- `AlignmentReviewSteeringPage.tsx` — Steering instruction generation, review, and export (Steps 5-6)
- `AlignmentReviewHistoryPage.tsx` — Trend analysis across multiple reviews of the same project

**Integration into existing Coding Landing Page:**

The `CodingLandingPage.tsx` (defined in the main spec) should be extended to include these two capabilities alongside the existing four tiers. The entry point question "What do you want to do with code?" should include options like:

- "I want to plan a project before building it" → Instruction Builder
- "I want to review how my project is going" → Project Alignment Reviewer
- "I want to review or understand existing code" → Code Review (Tier 1)
- "I want to generate a script or tool" → Script Lite/Medium (Tiers 2-3)
- "I want to manage a full project end-to-end" → Coding Large (Tier 4)

---

## 7. Integration With Main Spec Build Order

These two capabilities should be built after the core four tiers are functional, as they depend on several of the same subsystems. Suggested addition to the main spec's Section 8 build order:

After item 18 (Blueprint import + adaptation flow), add:

19. **Tool Profiles** — Create the `tool_profiles` table and default profiles for Claude Code, Codex, and Mistral Code. Store in `tool_profiles/` configuration directory. Build the profile viewer and editor UI.
20. **Instruction Builder — Discovery flow** (`InstructionBuilderDiscoveryPage.tsx` + guided conversation engine reusing `PromptPage.tsx` patterns + domain-specific persona activation)
21. **Instruction Builder — Architecture and expert review** (reuse Coding Large expert panel workflow)
22. **Instruction Builder — File generation** (tool-profile-aware `.md` generation with structured output templates)
23. **Instruction Builder — Review cycle** (versioned iteration with expert review, reuse existing review infrastructure)
24. **Instruction Builder — Export as .anton** (extend `anton-bundler.ts` with `instruction-builder-project` bundle type)
25. **Project Alignment Reviewer — Project ingestion** (extend repository fetching from Section 5.8 to produce structured Project State Summary)
26. **Project Alignment Reviewer — Goals input and matching** (load from Instruction Builder project, file upload, or conversational input)
27. **Project Alignment Reviewer — Alignment analysis** (extend `goal-alignment-checker` module to handle external projects, multi-dimension assessment with persona-specific analysis)
28. **Project Alignment Reviewer — Steering instruction generation** (tool-profile-aware output, reuse Instruction Builder's file generation with correction/continuation/refactoring templates)
29. **Project Alignment Reviewer — History and trend analysis** (multiple review snapshots with comparison and visualisation)
30. **Coding Landing Page update** — Extend `CodingLandingPage.tsx` to include Instruction Builder and Alignment Reviewer as navigation options alongside the four tiers
31. **Integration validation** — Verify that both capabilities properly draw on existing 29-area personas, skills, and modules. Verify that the continuous loop (Plan → Build → Review → Steer) works end-to-end. Verify export/import consistency.

---

## 8. The Guiding Principle

The question to ask at every implementation decision is the same one from the main spec: **does this feel like it belongs in ANTON, or does it feel like a separate product?**

These two capabilities are not coding tools. They are governance and planning tools that happen to output coding instructions. Their value comes from ANTON's domain expertise, expert panels, structured review processes, and goal alignment intelligence — not from code generation. The coding tools do the building. ANTON does the thinking, the planning, the reviewing, and the steering.

That positioning — ANTON as the architect, the coding tool as the builder — should be visible in every UI element, every workflow step, and every generated document. The user should feel that they are getting something from ANTON that they cannot get from any coding tool alone: professional-grade project governance powered by genuine domain expertise.

---

*Addendum to CODING_AREA_SPEC.md*  
*Written for Claude Code as a comprehensive briefing and implementation guide.*  
*Version 1.0 — February 2026*  
*Author: Daniel Gullstrand, FutureChain AB / openEXPERT*
