# openEXPERT / ANTON — Coding Area: Full Specification & Implementation Guide

> **Audience:** Claude Code  
> **Purpose:** Full briefing on a major new area — "Coding" — covering four distinct capability tiers. This document explains the vision, the thinking behind each tier, how they connect to each other and to the existing platform, and concrete guidance on how to implement them well.  
> **First step for Claude Code:** Before writing a single line of code, read this document fully, then explore the codebase to understand what already exists — areas, modules, personas, skills, workflow engine, script execution, project storage, connections framework, and the seven-layer prompt architecture. Everything built here must integrate into and extend what is already there, not duplicate or diverge from it.

---

## 1. Context: What openEXPERT / ANTON Is and Where This Fits

openEXPERT is an open-source AI expert platform built around the idea that AI models need proper professional training — not just raw intelligence — to produce work of genuine value. The platform organises that training into 29 expert areas with 238 pre-configured modules, each constructed with a seven-layer prompt architecture that injects domain knowledge, expert personas, skills, thinking levels, quality standards, and reasoning transparency into every interaction.

The platform is already built and running. Key capabilities that exist and that this new Coding Area must connect to:

- **Seven-layer prompt builder** (`prompt-builder.ts`) — persona injection, skills attachment, knowledge sources, thinking levels
- **29 expert areas and 238 modules** — covering FCP, Legal, Audit, Cyber, Software Engineering, Risk, Data, Project Management, Strategy, and 20+ more
- **Persona library** — expert personas (MLRO, CTO, Security Analyst, Data Scientist, Product Manager, etc.) that can be injected into any module
- **Skills library** — reusable knowledge packages (regulatory frameworks, methodologies, templates) attachable to any module
- **Workflow engine** (`workflow-engine.ts`) — multi-step, checkpointed, scheduled, collaborative workflows
- **Script execution framework** (`connection-manager.ts`, adapters) — Python, bash, R, Node.js scripts with sandboxing, memory limits, output capture
- **Project storage** (`projects` table) — named project containers for long-running work
- **Connections framework** — database, API, filesystem, email, script library connections
- **Knowledge graph** — entity extraction, relationship mapping, cross-session intelligence
- **Versioning and diff engine** — output version history, rollback, comparison
- **Deadline and milestone tracking** — task assignment, SLA monitoring, overdue detection
- **Quality scoring** — automated multi-dimensional output quality assessment
- **Apprentice learning system** — skill tracking and progression monitoring
- **RAG and semantic search** — vector embeddings, BM25, collection-based knowledge
- **Cross-workflow intelligence** — 5-layer funnel for pattern detection, knowledge extraction, and institutional learning across sessions

**Claude Code: before implementing, scan the codebase for:**
- All existing area directories and their module structure (`/areas/` or equivalent)
- All persona definitions and how they are stored and injected
- All skills definitions
- The exact signature of `prompt-builder.ts` and how layers are assembled
- How `connection-manager.ts` handles script execution and sandboxing today
- The `projects` table schema and how ProjectsPage.tsx uses it
- The workflow engine's step model — how steps are defined, assigned, checkpointed
- The existing Software Engineering area (Area 15) and its 6 modules — this is the closest relative to what we are building and we must build consistently with it, not alongside it as a separate thing
- The existing Cybersecurity area (Area 9) and its 5 modules — particularly relevant for the security review capabilities
- How `BuildYourOwnModule.tsx` works — the Coding Area will have a module-builder-style guided setup for Coding Large projects
- The knowledge graph ingestion pipeline — how entities, relationships, and knowledge atoms are extracted and stored, because completed coding projects will feed into this
- The `checkpoint_decisions` table and similarity matching logic — Coding Large milestone decisions should integrate with institutional memory

This matters because we are not building a separate coding product. We are building a new area within ANTON that inherits the entire platform's capabilities — all 29 expert areas' knowledge is available to be pulled into a coding engagement, all personas are available to review code, all workflows can be used for release management, all projects can house a Coding Large engagement.

---

## 2. The Vision: Why a Coding Area in an Expert Platform?

The core problem in software development is not that code is hard to write. It is that the people who write code and the people who need the outcomes of code rarely fully understand each other. A product owner cannot read a codebase and understand whether their intended feature is there, secure, and implemented well. A developer cannot always translate business, compliance, legal, and strategic requirements into code without losing important nuance along the way. A security team cannot always communicate threats to developers in terms developers care about, and vice versa.

The result: misaligned products, security vulnerabilities that persist because non-technical stakeholders couldn't see them, features built wrong because requirements were misunderstood, large projects that drift from their original goals, and technical debt that accumulates because no one had the full picture.

ANTON's Coding Area addresses this by bringing the platform's domain experts — business strategists, compliance officers, cybersecurity analysts, product managers, legal advisors, FCP specialists, data scientists, risk managers — into the coding process at every level. Not as post-hoc reviewers, but as integrated participants who shape the requirements, review the architecture, sign off on milestones, and ensure the delivered code serves its intended purpose in its intended context.

This is the differentiator. Tools like Loveable generate code from a description, fast and impressively, but with no discovery, no domain expertise, no compliance awareness, no governance. Cursor makes experienced developers faster but assumes they already know what to build. Neither bridges the communication gap between technical and non-technical stakeholders, neither injects domain expertise, neither provides a structured governance layer for large projects.

ANTON's Coding Area does all of that — and it does it by building on 29 expert areas of real domain knowledge already embedded in the platform.

---

## 3. The Four Capability Tiers

The Coding Area is structured as four distinct but connected capabilities. They share a common area context and navigation, but serve different user needs and different levels of complexity. Importantly, the tiers form a ladder — Tier 1 outputs feed naturally into Tier 4 as baseline assessments, Tier 2 scripts can become workflow steps in Tier 4 projects, and Tier 3 applications can be promoted to Tier 4 when they outgrow their scope. This is not four separate products; it is a progression path through which users build confidence, capability, and increasingly sophisticated outputs.

---

### Tier 1: Code Review & Explain

**Who this is for:** Product owners, project leads, business stakeholders, compliance officers, security teams — anyone who needs to understand what code does or whether it does it well, but may not be a developer themselves.

**The core insight:** Understanding code and reviewing code are two different activities that often need to happen together. A product owner needs to understand what the code does (explanation). A CISO needs to know if it's secure (security review). A compliance officer needs to know if it handles data correctly (compliance review). A developer needs to know if it follows best practices (technical review). ANTON can do all of these from the same code input, with different expert lenses applied to each.

**What it does:**

The user provides code in one of three ways: paste a single file directly into ANTON, provide a path to a local directory which ANTON reads using the existing local folder integration, or provide a link to a public code repository (GitHub, GitLab) which ANTON fetches. If they provide a repository link, ANTON first reads the README and key structural files to understand the overall project before diving into specific code.

Once code is ingested, the user selects an **explanation level**:

- **High level** — "What does this application do? What problem does it solve? Who is it for? What are its main components?" Written in plain language accessible to any stakeholder, no code terminology assumed.
- **Medium level** — "How does this work? What are the main flows? What does each module or component do? What are the key design decisions?" Written for technically literate people who are not necessarily developers — product managers, project leads, architects.
- **Deep level** — "Walk through the logic in detail. What does each function do? What are the data flows? What are the edge cases? Where are the performance bottlenecks? What are the architectural trade-offs?" Written for developers and technical reviewers.

The user then selects one or more **review lenses**, each backed by the appropriate expert persona and skills:

- **Professional developer review** — Code quality, readability, maintainability, design patterns, test coverage, documentation completeness, technical debt signals. Persona: Senior Software Engineer. Skills: Clean Code principles, SOLID principles, testing frameworks.
- **Product and feature review** — Does the code implement what was intended? Are features complete? Are there missing capabilities that were presumably in scope? What features exist that may not be documented? What would a product manager want to know? Persona: Senior Product Manager. Skills: User story frameworks, feature completeness assessment.
- **Security review** — General vulnerability assessment: input validation, authentication/authorisation gaps, injection risks, exposed secrets, insecure dependencies, OWASP Top 10. Persona: Security Analyst / Ethical Hacker.
  - Within security review, the user can choose a **security mode**:
    - **Vulnerability assessment** — Find weaknesses and explain them with severity scoring
    - **Pentest planning** — Generate a structured penetration testing plan based on the attack surface visible in the code: entry points, likely attack vectors, recommended test scenarios, tools to use
    - **Red team / Blue team framing** — Produce a paired view: how an attacker would approach this system (red), and what defences should be in place (blue)
    - **NIST CSF alignment** — Map the code's security posture against the NIST Cybersecurity Framework's five functions (Identify, Protect, Detect, Respond, Recover)
    - **ISO 27001 alignment** — Map against ISO 27001 Annex A controls relevant to the code's domain
    - **DORA alignment** — If the code relates to a financial institution, map against DORA ICT risk requirements (connects to the existing DORA Compliance module in Area 9)
- **Dependency and supply chain audit** — A distinct, dedicated capability within the security lens (not just a line item under general security). ANTON ingests `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `pom.xml`, or equivalent dependency manifests and produces a structured audit covering: known vulnerabilities (CVE mapping with severity scores and links to advisories), licence compliance (flagging GPL dependencies in commercial projects, licence incompatibilities, copyleft risks), maintenance health (when each dependency was last updated, whether it is actively maintained or abandoned, number of open security issues), and transitive dependency risks (vulnerabilities or licence issues in dependencies-of-dependencies that are not directly visible). This matters because supply chain attacks — Log4Shell, the xz utils backdoor, event-stream — are among the most significant real-world security risks, and security teams specifically ask for this kind of audit. The output is a structured report with severity-ranked findings and recommended actions (upgrade to version X, replace abandoned library Y with maintained alternative Z, add licence exception for dependency W with legal review).
- **Compliance review** — For code handling personal data, financial transactions, or regulated processes: GDPR data handling assessment, AML/KYC process review, regulatory logging and audit trail adequacy. This draws directly from Area 1 (FCP), Area 2 (Legal), and Area 9 (Cybersecurity) expertise.
- **Architecture review** — Scalability, resilience, separation of concerns, dependency management, cloud-readiness. Persona: Solutions Architect / CTO.

**Feature search:** Alongside explanation and review, the user can ask "Does this code have [feature]?" in plain language — ANTON searches the codebase for relevant implementations and responds with: whether the feature exists, where it is, how it is implemented, and a quality assessment. The user can also ask "What features exist in this code that I might not know about?" for undocumented discovery. This is particularly useful for legacy codebases or codebases where documentation has drifted from reality.

**Diff-aware re-reviews:** Code Review & Explain is not only a point-in-time activity — it also supports continuous monitoring. When a user runs a review on a codebase they have reviewed before, ANTON detects the previous review session, computes the diff (new files, changed files, deleted files), and produces a change-aware output: "Since your last review on [date], [N] files have changed. Here are the changes that affect the security posture... Here are new features that weren't present before... Here is new technical debt that has been introduced... Here are previously flagged issues that have been resolved." This transforms Tier 1 from a one-shot tool into a living audit capability. For Coding Large projects, diff-aware re-reviews run automatically at each milestone as part of the expert panel workflow — the code review at milestone 3 knows what was reviewed at milestone 2 and focuses its attention on what changed. Implementation: store review snapshots (file hashes, findings) in `code_review_sessions` and compare against previous sessions for the same source path.

**Output:** All Code Review & Explain outputs follow the standard openEXPERT output model — structured, versioned, quality-scored, exportable to DOCX/PDF, linkable to projects. A review output can be promoted directly into a Coding Large project as a "baseline assessment" artifact. It can also trigger a workflow — for example, a security review finding can automatically create a task assigned to a team member with a deadline.

**Connection to existing platform:** Uses the local folder integration already built. Uses the knowledge source system (Mode 2: Online Reference Links) for repository fetching. Uses the seven-layer prompt builder with appropriate persona injection. The security review modes connect to the existing Cybersecurity area modules and skills. The compliance review draws from Area 1 (FCP) and Area 2 (Legal) personas and skills. Outputs integrate with versioning, quality scoring, and project storage as standard.

---

### Tier 2: Script Lite

**Who this is for:** Analysts, compliance officers, researchers, consultants — people who work with data regularly, understand what analysis they want to do, but are not Python developers and don't want to spend hours learning to code or wrestling with a development environment.

**The core insight:** There is an enormous gap between "I know what I want to do with this data" and "I can write code to do it." Script Lite closes that gap by acting as a professional developer who takes a plain-English brief, asks the right clarifying questions, and produces a working, well-documented Python script the user can run themselves. The goal is not to run the script for the user (though preview should be considered) — it is to give them a working, understandable artifact they own and can reuse and adapt.

**What it supports:**

Script Lite covers common single-file analytical tasks that a data-literate professional would want to do:

- Data extraction and transformation — pull specific columns from a CSV or Excel file, filter rows by condition, merge two files on a common key, aggregate by category, pivot a table
- Statistical analysis — basic descriptive stats, correlation analysis, distribution assessment
- Machine learning — k-means clustering (find natural groupings in data), random forest classification or regression (predict an outcome from features), logistic regression (binary classification), PCA (dimensionality reduction for visualisation), anomaly detection (flag unusual records). ANTON selects the appropriate algorithm based on what the user wants to achieve and explains why.
- Output file generation — the user describes what they want the output file to look like (format, columns, any summary statistics) and ANTON generates code that produces exactly that
- Simple visualisations — bar charts, line charts, scatter plots, histograms, heatmaps saved as image files

**The guided flow:**

Script Lite does not just take a description and generate code. It first asks clarifying questions — the same prompt-improvement approach used in the open chat module. The questions are intelligent: if the user says "I want to cluster my customer data," ANTON asks what columns represent customer attributes, what they hope to learn from the clusters, what format the data is in, how many records approximately, what the output should look like. From the answers, it builds a complete, accurate brief before writing a single line of code.

Critically, the user should also be able to paste in a sample of their data — a few rows from their CSV or a screenshot of their spreadsheet — so that ANTON can infer column names, data types, and encoding rather than guessing. This makes the generated script actually runnable on the first attempt rather than requiring the user to debug column name mismatches, which is the most common reason simple scripts fail for non-developers.

The generated script is always: fully commented in plain language (not developer commentary — actual explanations of what each block does and why), structured so each section is independently readable, includes input validation and helpful error messages, includes a requirements.txt or pip install block at the top, and includes a brief README block at the head of the file explaining how to run it.

**Storage:** Scripts are saved to a designated coding folder for the user — `~/coding/lite/` by default, configurable. The folder structure is visible and navigable from within ANTON. The user can return to any previous script, run it again with different parameters, or ask ANTON to modify it.

**Preview / run from ANTON:** For scripts that produce a simple output (a transformed file, a chart image, a printed table), ANTON should be able to show a preview of what the output will look like based on a sample of the input data. This uses the existing script execution sandbox — the script is run against a small sample (first 100 rows) and the output is shown inline. This is not full execution — it is a preview to give the user confidence before they run the full script locally. Full execution requires the user to run it themselves, keeping the security model clean and appropriate.

**Connection to existing platform:** Uses the existing script execution framework in `connection-manager.ts` for preview execution. Saves outputs to the connections framework's script library. The guided questioning flow mirrors and can reuse the `PromptPage.tsx` prompt improvement flow. Quality scoring applies to the generated script. Scripts can be promoted to workflow steps — a Script Lite output can become a data preparation step in a larger workflow.

---

### Tier 3: Script Medium

**Who this is for:** Professionals who want a working application or interactive tool — not just a script — but are not developers. This includes analysts who want a dashboard to share with colleagues, consultants who want to automate a report generation process, compliance officers who want a tool to parse and display regulatory data, anyone who wants something they can open in a browser and show to others.

**What it supports:**

Script Medium produces complete, runnable applications that require a bit more setup than a single Python script but are still accessible to non-developers:

- **React dashboards** — Interactive data visualisation applications. User describes what they want to display, ANTON generates a self-contained React app with Recharts or similar, creates a package.json, and provides step-by-step instructions for running it locally (`npm install && npm start`). The user can preview it in ANTON's built-in preview panel.
- **Data fetching and parsing tools** — Scripts that fetch data from a public API or URL, parse the response, transform it, and output a clean file or display. Includes proper error handling, retry logic, and rate limiting where appropriate.
- **Automated report generators** — Scripts that take input data, run analysis, and produce a formatted PDF or DOCX report. Uses the existing document generation skills from the platform.
- **Simple web UIs for existing scripts** — Take a Script Lite Python script and wrap it in a simple web interface where the user can upload a file, set parameters, and download the output — without touching the command line.
- **Data visualisation tools** — Standalone HTML/JavaScript visualisations (D3, Plotly) that the user can open in any browser without any server.

**The guided flow:**

Same intelligent questioning approach as Script Lite, but with additional questions around: who will use this tool and what do they need to see, what data will it connect to and how often does it update, does it need to be shared with others or is it personal, what environment will it run in (local machine, shared server, cloud). These questions shape not just the code but the architecture and setup instructions.

**Setup and storage:** Script Medium projects are stored in `~/coding/medium/[project-name]/` with a clear folder structure — `src/`, `public/`, `README.md`, `requirements.txt` or `package.json` as appropriate. ANTON creates all of these files, not just the main code. The README is written in plain language: what this tool does, how to install dependencies, how to run it, how to modify common settings.

**Preview from ANTON:** For React and HTML outputs, ANTON should show a live preview panel using an iframe or embedded renderer. The user can see the application running — with sample data if real data isn't available yet — and iterate with ANTON on the design and functionality before finalising the code. Each iteration generates a new version (using the existing versioning system).

**The same standards as modules:** Script Medium output should feel as guided, as helpful, and as expert-led as any other ANTON module. ANTON should explain its architecture decisions, flag any limitations or trade-offs, and suggest improvements. The same quality standards apply — the output should be something a professional developer would be comfortable putting their name on, even if it was generated by AI.

**Connection to existing platform:** Preview uses an embedded iframe panel (new UI component) fed by the script execution sandbox for server-side outputs, or direct HTML rendering for client-side outputs. Versioning applies to each iteration. Projects created in Script Medium can be promoted to Coding Large projects if they grow in complexity. The document generation integration reuses existing DOCX/PDF export capabilities.

---

### Tier 4: Coding Large — Professional AI-Led Software Development

**Who this is for:** Anyone who needs to build real software — a product team building an internal tool, a startup building their first product, a compliance team commissioning a regulatory reporting system, a consulting firm building a client-facing platform. This is where ANTON functions as a full professional delivery partner, not just a coding assistant.

**The core differentiator:**

Every other AI coding tool — Loveable, Cursor, GitHub Copilot, even Claude Code used directly — starts from "describe what you want, get code." They optimise for speed from brief to code. What they skip is everything that makes real software projects succeed: understanding the full stakeholder landscape, embedding domain expertise into the requirements, planning releases that are manageable and reversible, defining acceptance criteria before a line is written, building a governance layer that keeps large projects aligned with their original goals over time.

Coding Large does not skip any of that. In fact, it front-loads it deliberately, because the cost of misalignment grows exponentially as a project progresses. An hour of structured discovery at the start saves weeks of rework later. This is how professional software delivery works in the best organisations — and it is what no AI coding tool has replicated yet.

**Phase 0: Codebase Onboarding (for non-greenfield projects)**

The majority of real Coding Large engagements will not start from nothing. They will be: "we have an existing system that does X, and we need to extend it to do Y" or "we inherited this codebase and need to modernise it" or "we are replacing component Z with something better while keeping the rest." For these projects, Phase 0 runs before discovery.

Phase 0 uses Tier 1 (Code Review & Explain) directly — this is the ladder in action, where Tier 1 literally becomes the foundation for Tier 4. ANTON ingests the existing codebase and produces:

- A **baseline architecture assessment** — what the system is, how it is structured, what technologies it uses, how components connect. This becomes the starting point for Phase 2's architecture work rather than designing from a blank canvas.
- A **technical debt inventory** — existing issues, outdated dependencies, architectural weaknesses, test coverage gaps. Each item is severity-ranked and tagged by category. This feeds directly into the `TECH_DEBT.md` file (see below) so that existing debt is tracked from day one alongside any new debt decisions.
- A **dependency and supply chain audit** — the full security lens from Tier 1 run against all dependency manifests, producing a structured report on vulnerabilities, licence risks, and maintenance health.
- A **feature map** — what the existing system actually does, discovered from the code rather than assumed from documentation. This becomes the baseline against which new feature requirements in Phase 1 are evaluated: "You want feature X — the existing codebase already has a partial implementation in `/src/modules/reports.ts`. Should we extend it or replace it?"
- A **security posture baseline** — the security review lens applied to the existing codebase, producing findings that become input requirements for the new work: "The existing authentication uses deprecated bcrypt rounds; any new work should upgrade this as part of Release 0."

Phase 0 outputs are stored in the project directory as `BASELINE.md` and `BASELINE_REVIEW/` (containing the full Tier 1 outputs). The discovery session in Phase 1 then references these findings — the questions are shaped by what was found in the existing code, not asked in a vacuum.

For greenfield projects, Phase 0 is skipped and the project begins at Phase 1.

**Phase 1: Discovery & Stakeholder Alignment**

Before any code is planned, ANTON conducts a structured discovery session. This is a multi-turn guided conversation, not a single prompt. ANTON asks questions across the following dimensions, bringing in the appropriate expert perspective for each:

**Business & Product (Product Manager + Strategy personas):**
- What problem are we solving, for whom, and why now?
- What does success look like in 3 months, 6 months, 12 months?
- Who are the core user groups and what are their most important needs?
- What existing tools or processes does this replace or complement?
- What are the constraints — budget, timeline, team size, technology preferences?
- What is the minimum viable first release — the smallest thing that delivers real value?

**Compliance & Regulatory (FCP, Legal, Risk personas — depending on the domain):**
- Does this application handle personal data? If so, GDPR implications are assessed.
- Does it relate to financial services? AML, KYC, sanctions screening implications are assessed.
- Does it handle payments or financial transactions? PSD2, PCI DSS implications.
- Does it store health data? HIPAA or local equivalents.
- What regulatory reporting obligations does this create or touch?
- What audit trail requirements apply?
This is where openEXPERT's unique strength becomes decisive. A generic AI coding tool does not know that a transaction monitoring dashboard needs an immutable audit log or that a KYC onboarding flow needs to comply with AMLR Article 4. ANTON does, and it asks the right questions to surface these requirements before architecture is locked in.

**Technical (Software Engineer, Solutions Architect, CTO personas):**
- What are the frontend, backend, and data storage requirements?
- What integrations with external systems are needed?
- What are the performance requirements — expected load, response times, data volumes?
- What are the deployment constraints — cloud, on-premise, air-gapped?
- What technology stack is preferred or mandated?
- What existing codebase or infrastructure does this connect to?

**Security (Cybersecurity, Ethical Hacker personas):**
- Who are the users and what authentication model is appropriate?
- What data is sensitive and how should it be protected at rest and in transit?
- What is the threat model — who might want to attack this and how?
- What security standards must be met (ISO 27001, NIST, SOC 2, DORA)?
- Are there penetration testing or security audit requirements?

**Legal (Legal persona):**
- What IP considerations apply?
- What third-party libraries or data sources are being used and what are their licence obligations?
- What liability or warranty considerations affect the delivery model?

**Product Innovation (Innovation persona):**
- What are comparable products and what do they do well or poorly?
- Are there emerging technologies or approaches that could differentiate this product?
- What would a version 2 or version 3 look like, and how should that inform version 1 architecture?

Once discovery is complete, ANTON produces a **Discovery Summary Document** — a structured, stakeholder-readable document that captures all agreed requirements, constraints, and goals. This becomes the anchor document for the entire project. Every subsequent decision can be evaluated against it.

**Phase 2: Architecture & Technology Design**

Based on the discovery (and the Phase 0 baseline assessment, if applicable), ANTON proposes a system architecture. This is not just a technology choice — it is a structured technical design that covers:

- Component diagram (what systems exist and how they connect)
- Data model (what data is stored, where, and in what format)
- API design (what interfaces exist between components)
- Technology stack recommendation with rationale
- Security architecture (authentication, authorisation, encryption, audit logging)
- Deployment architecture (how and where the system runs)
- Scalability assessment (how the architecture handles 10x and 100x growth)

This architecture proposal is then reviewed by a **second expert panel** — a deliberate structured review step where different expert personas weigh in with their perspective:
- The Security Analyst reviews for attack surface and threat vectors
- The Compliance persona reviews for regulatory adequacy
- The Product Manager reviews for alignment with user needs
- The Solutions Architect reviews for scalability and maintainability

Each reviewer produces a written endorsement or dissent with specific recommendations. This review is visible to the project lead — it is not hidden background checking. The project lead sees what each expert said and makes the final decision on how to proceed. This mirrors how the best engineering organisations do architecture review and is something no other AI tool provides.

**Phase 2b: Estimation & Sizing**

After architecture is approved and before release planning begins, ANTON produces effort estimates for the overall project and per-release. These are not hour estimates — which would be misleading given the AI-assisted nature of the work — but structured complexity assessments:

- Each task is classified into a complexity band: **small** (straightforward implementation, clear pattern, minimal unknowns), **medium** (requires design decisions, some integration work, moderate complexity), **large** (significant architectural work, multiple integrations, complex logic, potential unknowns)
- ANTON provides analogies for each band: "This task is comparable to building a standard CRUD interface with authentication and role-based access" — so the project lead can calibrate expectations against their own experience
- Per-release summaries aggregate these into an overall complexity profile: "Release 1 contains 8 tasks: 3 small, 4 medium, 1 large. Based on the defined scope, expect the implementation phase to take approximately 3–5 working sessions with ANTON, plus human review and testing time."
- Where Phase 0 data exists, ANTON factors in the existing codebase complexity: "The existing authentication system adds integration complexity to 3 tasks that would otherwise be medium — they are now rated large because they must work within the existing session management approach"

These estimates help the project lead set realistic expectations with stakeholders, allocate review time, and identify releases that may be riskier or slower than expected. The estimates are stored in `RELEASES.md` alongside each release plan and updated as the project progresses — actual vs. estimated complexity is tracked to improve future estimates.

**Phase 3: Release Planning & Milestone Definition**

The project is broken into releases — each release being a deployable, testable increment of value. ANTON structures releases using agile principles:

- **Release 0 (Foundation):** Environment setup, infrastructure, authentication, core data model, CI/CD pipeline setup, Git repository initialisation
- **Release 1 (MVP):** Minimum set of features that deliver the core value proposition — the thing that makes the product real enough to put in front of users
- **Release N (Enhancement):** Iterative feature additions, each a self-contained increment

**Release 0 and Environment Provisioning — How ANTON Handles Stack Installation:**

When the architecture phase specifies a technology stack — Rust, MSSQL, Python 3.12, Node 20, PostgreSQL, Redis, or anything else — something practical has to happen before implementation can begin. Someone or something needs to install, configure, and verify that the development environment actually works. How this happens depends on what ANTON is allowed to do in the user's environment, and ANTON must handle this gracefully across all scenarios.

The fundamental principle: **ANTON always produces the environment specification as a professional deliverable. Whether ANTON also executes the setup depends on what the user permits.**

**What ANTON always produces (regardless of execution permissions):**

As the first deliverable of Release 0, ANTON generates an `ENVIRONMENT.md` file in the project directory — a complete, structured environment setup guide that covers:

- **Required tools and exact versions** — Not "install Rust" but "install Rust 1.76.0 or later via rustup (https://rustup.rs). Required because the project uses async/await patterns stabilised in 1.75." Every dependency is listed with the specific version, where to get it, and why the project needs it.
- **Configuration requirements** — Database connection strings, environment variables, port allocations, file system permissions, and any service configurations. Presented as a `.env.example` file with annotated comments explaining each variable.
- **Verification steps** — For each installed tool, a command the user can run to verify it's working: `rustc --version` should return `1.76.0` or later, `sqlcmd -S localhost -Q "SELECT @@VERSION"` should return MSSQL 2022. These are not suggestions — they are a checklist that confirms the environment is ready.
- **Docker/container option** — ANTON generates a `Dockerfile` and `docker-compose.yml` that encapsulates the entire stack. For users who can run Docker, this is often the fastest path — one command and the entire environment is ready, with no installation on the host machine. The Docker configuration includes the database, any required services (Redis, message queues), and the development server, all pre-configured and networked.
- **Platform-specific notes** — Where installation differs between macOS, Linux, and Windows, the guide covers all three. Where corporate proxy or firewall settings might interfere (common in banks and large enterprises), the guide includes the relevant proxy configuration steps.
- **Air-gapped instructions** — For environments with no internet access, the guide lists every package, binary, and dependency that needs to be transferred manually, with checksums for verification. This is critical for ANTON's target market in regulated financial institutions.

**What ANTON does when it has execution permissions:**

During project setup, ANTON asks: "I've identified the tools and services needed for this project. Would you like me to install and configure them, or would you prefer to do this yourself or have your IT team handle it?" The options are:

- **Full auto-setup** — ANTON runs the installation commands, configures services, and verifies everything works. It shows each step in the Professional Delivery View using the same execution plan pattern: "I'm about to install PostgreSQL 16 via [package manager]. This will require [permissions]. Proceed?" Each installation step requires explicit approval before execution. ANTON never runs `sudo` or elevated commands without showing exactly what it will do and getting confirmation. All installation actions are logged in the project audit trail.
- **Guided manual setup** — ANTON presents the setup guide step by step, the user executes each command themselves, and ANTON verifies the result after each step: "Run this command: `brew install postgresql@16`. When it's done, I'll check it's configured correctly." This is pair-programming applied to environment setup — the human does the execution, ANTON does the verification and troubleshooting.
- **IT handoff** — ANTON exports the `ENVIRONMENT.md` as a structured handoff document that the user sends to their IT team or DevOps engineer. The document is written for a technical reader and includes everything needed to set up the environment without ANTON being involved. ANTON then waits and provides a verification workflow the user can run once IT has completed the setup: "Run this health check to confirm everything is ready" — a single script that tests every dependency and reports pass/fail.
- **Docker-only** — ANTON uses Docker to provision the entire stack without installing anything on the host machine beyond Docker itself. This is the cleanest option for environments where host installation is restricted but Docker is permitted.

**Why this matters for different deployment contexts:**

- **Personal laptop / developer workstation:** Full auto-setup or Docker. Fast, convenient, the user wants to get building.
- **Corporate machine with IT policies:** Guided manual setup or IT handoff. The user may not have admin rights. IT needs to approve software installations. ANTON respects this by producing the professional handoff document.
- **Air-gapped / regulated environment:** IT handoff with the air-gapped addendum. Everything must be transferred and verified manually. Docker images may need to be pre-built and transferred as tar files. The `ENVIRONMENT.md` covers this explicitly.
- **Cloud VM / CI environment:** Auto-setup or Docker. These environments are typically purpose-built and ANTON can configure them directly.
- **Existing development environment:** ANTON checks what's already installed (using version checks), reports what's present and what's missing, and only installs or recommends installing the gaps. No redundant work.

**Connection to the platform:**

The environment setup status is tracked in the `coding_projects` table (`environment_status`: pending/in-progress/verified/failed). The verification health check is a workflow that can be re-run at any time — useful when team members join the project later and need to set up their own environment. The `ENVIRONMENT.md` is part of the blueprint export, so when someone imports a project blueprint, they get the full environment specification and can set up an identical stack.

For Script Lite and Script Medium, the environment question is simpler — ANTON checks whether Python (Tier 2) or Node (Tier 3) is available and prompts the user to install it if not, or offers to run within the existing sandbox for preview. But the principle is the same: never assume the environment is ready, always verify, always give the user control over what gets installed on their machine.

For each release, ANTON defines:
- **Scope:** Exactly what features and capabilities are included
- **Acceptance criteria:** Specific, testable conditions that must be met before the release is considered complete — written in plain language that a non-developer can verify
- **Test plan:** Unit tests (what functions need test coverage), integration tests (what system interactions need validation), user acceptance tests (what scenarios a real user needs to work through), regression tests (what existing functionality must continue to work after this release)
- **Responsible roles:** Who is responsible for implementation (what technical skills are needed), who is responsible for review (which expert areas need to sign off), who is responsible for acceptance testing
- **Dependencies:** What must be completed before this release can start
- **Risk flags:** What could go wrong, and what the mitigation plan is
- **Complexity estimate:** The estimation from Phase 2b, per task and aggregated

This release plan lives in the project, is tracked using the existing deadline and milestone system, and is updated as the project progresses. Milestone completions trigger automated regression test runs using the existing workflow engine.

**Phase 4: Implementation**

Implementation follows an iterative cycle: plan → build → review → test → accept → next iteration.

For each implementation step:
1. ANTON breaks the work into specific, manageable tasks with clear completion criteria
2. ANTON generates the code for each task with full explanations — not just the code but why it is structured the way it is, what alternatives were considered, what the trade-offs are
3. Before each task is marked complete, the relevant expert review is triggered — a security task gets a security review, a compliance-related feature gets a compliance review, a core architectural change gets an architecture review
4. Automated tests are run against the task output
5. The project lead sees the output, the reviews, and the test results before approving the task
6. On approval, ANTON creates a Git commit with a meaningful message referencing the task ID and acceptance criteria

**Phase 5: Testing & Regression**

Every Coding Large project maintains a living test suite. After each milestone:
- The full regression test suite runs automatically using the workflow engine
- Results are logged against the milestone in the project record
- Any failures block milestone sign-off until resolved
- The project lead approves each milestone before work proceeds to the next

Test cases are stored in the project directory and can be rerun at any time. Where tests can be automated (unit tests, API tests, integration tests), they are set up to run as part of a scheduled workflow. Where tests require human action (user acceptance tests), ANTON generates the test scripts and assigns them to the appropriate team member with a deadline.

Test suites should be designed to be portable — they should work with the internal workflow engine for within-ANTON execution, but also be structured so they can integrate with standard CI runners (GitHub Actions, GitLab CI, Jenkins) when the project is deployed to a real environment. This means generating standard test configurations (`jest.config.js`, `pytest.ini`, `.github/workflows/test.yml`) alongside the ANTON-native workflow definitions.

**Phase 6: Operational Readiness**

Real software does not end at deployment. For Coding Large projects, ANTON produces an operational readiness package before the project is considered complete. This phase is led by the DevOps/SRE persona (or Operations persona if available in the library) with input from Security and Compliance:

- **Logging strategy** — What gets logged, at what level, where logs are stored, how long they are retained. For regulated applications, this includes audit trail requirements identified in Phase 1 discovery.
- **Monitoring and alerting** — Key metrics to track (response times, error rates, queue depths, resource utilisation), recommended alerting thresholds, suggested monitoring tools compatible with the chosen stack.
- **Incident response runbook** — What to do when things go wrong: common failure modes based on the architecture, escalation paths, rollback procedures, communication templates. Written so that an on-call engineer who didn't build the system can respond effectively.
- **Backup and recovery** — Data backup strategy, recovery point objectives (RPO), recovery time objectives (RTO), tested restore procedures.
- **Performance baseline** — Expected normal operating parameters documented so that anomalies can be detected: typical response times, normal resource consumption, expected traffic patterns.
- **Security operations** — Secret rotation schedule, certificate renewal dates, dependency update cadence, vulnerability scanning setup.

This is especially important for regulated industries where operational resilience is itself a compliance requirement — DORA explicitly mandates ICT risk management including operational resilience testing, and the AMLR requires systems used for compliance purposes to be reliable and auditable in operation, not just in development.

Phase 6 outputs are stored as `OPERATIONS.md` in the project directory and reviewed by the relevant expert panel before the project is marked complete.

**Multi-stakeholder collaboration model:**

Coding Large projects involve multiple people with different roles — the product owner in Stockholm, the compliance officer in Helsinki, the tech lead working remotely, the CISO reviewing architecture decisions asynchronously. The spec must be explicit about how this works in practice.

The collaboration model uses the existing workflow engine's step assignment and the deadline system's notification capabilities:

- **Asynchronous review workflows.** When a milestone requires sign-off from multiple stakeholders (e.g., compliance + security + product), the review workflow creates parallel steps — one per reviewer. Each reviewer is notified, reviews at their own pace, and submits their endorsement or dissent. The milestone status shows who has reviewed and who hasn't.
- **Escalation on stalled reviews.** If a reviewer has not responded within a configurable period (default: 3 business days), the system sends a reminder. After a second period (default: 5 business days), it escalates to the project lead with a notification: "Compliance review for Release 2 architecture has been pending for 5 days. [Reviewer name] has not responded. You can: reassign the review, extend the deadline, or proceed without this review (with the gap documented in the project record)." The project lead decides — the system does not auto-proceed.
- **Conditional blocking.** Some reviews are mandatory (configurable per project and per milestone). A mandatory compliance review blocks the milestone — work cannot proceed until it is completed. Optional reviews are surfaced but do not block. The project lead sets which reviews are mandatory during project setup.
- **Activity feed.** Every action on a Coding Large project — review submitted, task completed, test run finished, milestone approved — is logged in a chronological activity feed visible to all project participants. This is the single source of truth for "what happened and when" and supports both collaboration and audit.
- **Role-based visibility.** Not all participants need to see all details. The product owner sees acceptance criteria, milestone status, and goal alignment checks. The developer sees task breakdowns, code, and test results. The compliance officer sees discovery findings, compliance-specific review records, and relevant milestone approvals. The project dashboard adapts what it shows based on the viewer's role.

**Project storage and version control:**

Every Coding Large project has its own directory: `~/coding/large/[project-name]/`. This directory is initialised as a **Git repository** from the start. ANTON creates meaningful commits at each task completion, with commit messages that reference the task ID and a summary of what was implemented: `feat(TM-001): implement transaction monitoring dashboard with real-time alerts`. The commit history becomes part of the project audit trail.

The directory contains:
- `README.md` — Project overview, goals, stack, how to set up and run locally
- `DISCOVERY.md` — The discovery summary document from Phase 1
- `BASELINE.md` — The Phase 0 codebase assessment (if applicable)
- `ARCHITECTURE.md` — The architecture design and review record
- `ENVIRONMENT.md` — The environment setup guide, Docker configuration, and verification health check
- `RELEASES.md` — The release plan with milestone status and complexity estimates (estimated vs. actual)
- `TASKS.md` — The living task list with status, assignee, and completion criteria
- `TESTS.md` — The test suite and results log
- `TECH_DEBT.md` — The technical debt register (see below)
- `CHANGES.md` — The chronological change log recording every deliberate change to goals, scope, releases, or architecture
- `OPERATIONS.md` — The operational readiness package from Phase 6
- `src/` — The actual code, organised by component
- `docs/` — Any generated documentation
- `reviews/` — Expert review records for each major decision
- `.github/workflows/` or equivalent — CI/CD configuration for external test runners
- `.gitignore` — Properly configured for the project's stack

This directory structure mirrors how the best professional engineering teams organise projects. It is also connected to ANTON's Projects system so all project artifacts are searchable, linkable to sessions, and tracked in the knowledge graph.

For branching strategy: each release gets its own branch (`release/0-foundation`, `release/1-mvp`, etc.), with `main` representing the latest stable state. Task implementation happens on feature branches that are merged to the release branch on completion. This is a standard Git Flow variant that most development teams will be familiar with.

**Technical debt register:**

Technical debt is a normal and often necessary part of software development. The problem is not that it exists but that it is invisible. Coding Large makes it visible through a dedicated `TECH_DEBT.md` file in the project directory.

When ANTON or the project lead makes a conscious decision to defer work — "we'll skip proper caching in Release 1 and add it in Release 2 because time-to-market matters more right now" — it is captured as a debt entry with: a description of what was deferred, a rationale for why, a severity assessment (low / medium / high / critical), an owner (who is responsible for resolving it), and a target release for resolution. Pre-existing debt discovered in Phase 0 is also registered here.

The goal alignment check at every milestone surfaces outstanding debt items: "You accepted 3 technical debt items in Release 1. Item 2 (proper error handling for edge case X) was planned for Release 2 but has not been addressed. Is this intentional, or should it be scheduled for the current release?" This prevents the common failure mode where technical debt is acknowledged once and then forgotten. The debt register is a living document that is updated as items are resolved or rescheduled, and the project cannot be marked complete while critical debt items remain unresolved without an explicit sign-off from the project lead acknowledging the remaining risk.

**The second-opinion / expert panel review:**

A recurring pattern throughout Coding Large is that important decisions get a structured expert review — not just one AI generating and reviewing its own work, but explicitly bringing different domain expert personas to review decisions from their area of expertise. This is modelled as a workflow step that runs automatically at defined checkpoints: after architecture design, after each release plan, after security-sensitive code is written, after acceptance criteria are defined.

The review panel is configurable — the project lead can choose which expert areas are relevant to their project. A fintech product might have FCP, Legal, Security, and Architecture reviewers. An internal HR tool might have HR, Legal, and Security. The relevant personas and their expertise are drawn from the existing 29-area library.

**Goal alignment check:**

At every milestone, before work begins on the next release, ANTON runs a "goal alignment check" — it re-reads the Discovery Summary Document and compares the current state of the project against the original goals. It flags any drift: features that were planned but not implemented, scope that has crept in without explicit decision, requirements from the discovery phase that have not been addressed, and technical debt items that have passed their target resolution date. This is presented to the project lead as a brief alignment summary with specific questions: "In the original discovery, you said X was a priority — it has not yet been implemented. Is this intentional?" This keeps large projects honest and prevents the common failure mode where iterative development gradually loses sight of the original goals.

**Cost and token transparency:**

Coding Large with expert panel reviews at every milestone consumes significant LLM resources. ANTON must be transparent about this from the start. Before a project begins, ANTON provides a cost estimate based on the project scope: number of expected expert reviews, implementation complexity, test generation volume, and alignment check frequency. The estimate is presented as a range (optimistic/expected/pessimistic) and expressed in the unit the user understands — tokens for API users, messages or credits for plan-based users.

During the project, a running total is visible in the project dashboard: tokens consumed by phase (discovery, architecture, implementation, testing, reviews), with a comparison against the initial estimate. If the project is trending significantly above estimate, ANTON flags this proactively: "This project has consumed 60% of the estimated token budget with 40% of tasks complete. The main driver is the expert panel reviews — would you like to adjust review frequency for lower-risk milestones?"

The project lead can configure review depth — not every milestone needs every reviewer. Security review might only run on security-relevant milestones. Compliance review might be mandatory for data-model changes but optional for UI tasks. This configurability keeps costs proportional to value without compromising governance on the things that matter most.

**Change Management — Re-steering a Live Project:**

Plans change. This is not a failure of planning — it is the reality of building anything in a complex environment. After the MVP ships and real users react to it, the product owner may realise the core value proposition is different from what was assumed. Compliance may discover a new regulatory requirement that wasn't in scope during discovery. The technical team may find that the chosen database doesn't perform well under real load. A competitor may launch something that changes the strategic context entirely. These are all legitimate, common reasons to change direction, and ANTON must handle them as professionally as it handles the original plan.

The principle: **every change is a deliberate, documented decision — not an undone or silently overwritten plan.** The original decisions and the reasons for changing them are both part of the permanent record. This is how professional project governance works, and it is critical for the audit trail.

**How changes work at each level:**

*Changing individual tasks:*

The smallest unit of change. The project lead can add new tasks to a release, remove planned tasks, or modify a task's scope, acceptance criteria, or assigned role. When a task is modified:
- ANTON shows the original task alongside the proposed change in a side-by-side view
- The project lead provides a rationale for the change (even a short one — "customer feedback showed this isn't needed" or "security review identified an additional requirement")
- The task history preserves the original version and the change as a versioned record: Task TM-005 v1 (original) → v2 (modified, reason: "...")
- If the change affects acceptance criteria, ANTON flags any tests that need updating: "The acceptance criteria for TM-005 have changed. Two existing test cases no longer match the new criteria. I'll update them — here's what will change."
- If the change adds or removes dependencies, ANTON recalculates the task graph and flags any impacts: "Removing TM-005 means TM-008 no longer has a dependency blocker — it can start immediately. But TM-012 assumed TM-005's output as input — this needs rethinking."

*Restructuring releases:*

After seeing how Release 1 lands, the project lead may want to restructure what's in Release 2 and 3 — moving features between releases, adding a new release, splitting a large release into two smaller ones, or cancelling a planned release entirely. When a release is restructured:
- ANTON presents the current release plan alongside the proposed restructured version
- Tasks that move between releases have their dependencies and test plans checked automatically
- Complexity estimates are recalculated for affected releases
- Milestone dates are flagged for review: "Release 2 is now larger than originally planned. The original estimate was 3–5 working sessions; the restructured scope estimates 5–8. Do you want to adjust the milestone date?"
- The release plan version history shows what changed and when: RELEASES.md v1 (Phase 3 original) → v2 (restructured after Release 1 feedback, reason: "...")

*Changing project goals or discovery findings:*

The most significant kind of change. If the fundamental goals shift — "we thought we were building a reporting dashboard but actually we need a real-time monitoring system" — or if new compliance requirements emerge that weren't in the original discovery, the project needs a **re-discovery** cycle. This is not starting over. It is a structured update to the foundation that the rest of the project is built on.

When the project lead initiates a goal change:
1. ANTON runs a focused re-discovery session, scoped to what's changing. Not the full Phase 1 again — just the dimensions that are affected. If the product goals are changing but the compliance context is the same, only the Business & Product questions are revisited. If a new regulation has come into scope, only the Compliance dimension is revisited.
2. ANTON produces a **Change Summary Document** — a structured diff between the original discovery and the revised discovery. For each changed item: what was originally agreed, what is now agreed, why it changed, and what the impact is on architecture, releases, tasks, and tests.
3. The architecture is re-evaluated against the changed goals. If the changes are within the existing architecture's capability, ANTON notes this: "The current architecture supports the revised goals without structural changes." If not, a targeted architecture revision is proposed and goes through the expert panel review — but only for the changed aspects, not a full re-review of everything.
4. The release plan is updated to reflect the new goals. Tasks that no longer serve the revised goals are flagged for removal or deferral. New tasks needed to support the revised goals are proposed and estimated.
5. The goal alignment check module is updated with the revised Discovery Summary, so all future alignment checks compare against the *current* goals, not the original ones. But the original goals remain in the version history — the project lead can always see what was originally planned and why it changed.
6. All stakeholders who signed off on the original discovery are notified of the change and given the opportunity to review and re-sign-off on the revised version. This is important for the governance story — a compliance officer who approved the original scope needs to know it changed and confirm the revised scope is still compliant.

*Changing the technology stack mid-project:*

A special case that deserves its own handling. If the project needs to switch from PostgreSQL to MSSQL, or from React to Vue, or add a service that wasn't in the original architecture, this affects the environment, the existing code, and potentially many tasks and tests. When a stack change is proposed:
- ANTON runs an impact analysis: which files, tasks, tests, and environment components are affected
- The `ENVIRONMENT.md` is updated (or the environment re-provisioned if in auto mode)
- A migration plan is generated for any code that needs to change to support the new technology
- The expert panel reviews the stack change — particularly the Security and Architecture personas
- The change is logged as a formal architecture decision in `ARCHITECTURE.md` with full rationale

**The Change Log:**

Every change — at any level — is recorded in a new `CHANGES.md` file in the project directory. This is a chronological record of every deliberate change to the project's plan, goals, structure, or scope. Each entry includes: what changed, when, who initiated it, the rationale, the impact assessment, and links to the updated documents. This is separate from the Git history (which tracks code changes) and from the activity feed (which tracks all actions). `CHANGES.md` specifically tracks *decisions to change the plan*, which is what management and compliance teams want to see when they ask "why is this project different from what was originally approved?"

**The ANTON advantage in change management:**

This is another area where ANTON's approach is structurally better than competitors. In Loveable or Cursor, there is no plan to change — you just describe something different and the tool builds it. The previous version is overwritten or abandoned. There is no record of why the direction changed, no impact analysis, no stakeholder notification, no re-validation of compliance or security implications.

In a real professional engagement, when a project changes direction, the delivery team produces a change request, assesses the impact, updates the plan, notifies stakeholders, and gets re-approval. ANTON does exactly this, but faster and with more thoroughness than most human teams manage — because it can automatically check every task, test, and dependency for impact rather than relying on someone remembering what's connected to what.

The change management flow also integrates with the cost tracking: when a significant change is proposed, ANTON updates the cost estimate to reflect the revised scope. "This goal change adds an estimated 30% to the remaining project cost because it requires a new authentication module and re-testing of three completed features. The revised total estimate is [X]. Proceed?"

---

## 4. The Unified Coding Area: Navigation and User Experience

The four tiers are presented as a single Coding Area in ANTON's navigation, with clear onboarding that helps the user choose the right tier for their need. The entry point asks two simple questions: "What do you want to do with code?" and "How complex is what you're working on?" From the answers, ANTON recommends the appropriate tier and navigates the user there.

Each tier shares common elements:
- **Prompt improvement flow** — the guided questioning that improves the user's brief before work begins, consistent with the existing open chat prompt improvement feature
- **Expert selection** — which expert personas are active for this session, drawn from the existing persona library
- **Output quality standards** — the same quality scoring, transparency, and citation that applies to all ANTON outputs
- **Versioning** — every output is versioned using the existing versioning system
- **Project integration** — outputs can be saved to or promoted into projects
- **Workflow integration** — any output can become a workflow step or trigger a workflow
- **Deadline and task tracking** — tasks generated in any tier can be tracked using the existing deadline system

---

## 5. The Implementation View — How Code Work Is Presented to Users

This section addresses a fundamental design question: when ANTON is doing implementation work in Coding Large (and to a lesser extent in Script Lite and Medium), what does the user actually see?

The answer is deliberately different from every existing AI coding tool, and the difference is rooted in who the users are and what they actually need.

### What competitors show — and why it's wrong for ANTON's audience

**Loveable** shows the generated output — a live preview of the running app, with the option to view or edit code. There is no visibility into what decisions were made, what was considered, or why. The user sees the result and iterates on it. This works for its audience (founders who want a working demo fast) but provides nothing for the product owner, compliance officer, or project lead who needs to understand and trust the process.

**Cursor** shows code diffs — like reviewing a pull request. Its Agent mode edits files and shows the changes in real-time. Its "Mission Control" lets developers monitor multiple agents working in parallel. This is excellent for developers but assumes the viewer can read code and cares about code-level changes. A managing director looking at Cursor's diff view sees nothing meaningful.

**Claude Code** shows a terminal stream — what it's reading, what it's thinking, what commands it's running, what files it's changing. More transparent than the others, and the closest to what ANTON should aspire to in terms of reasoning visibility. But it's still a developer experience presented in a developer medium (the terminal).

### What ANTON shows instead: the Professional Delivery View

ANTON's implementation view is not code-first. It is **plan-first, reasoning-visible, file-aware, and audit-native.** The code exists and is accessible, but it is not the primary thing the user sees. What the user sees is a structured professional delivery interface that answers the questions non-technical stakeholders actually ask:

**Before execution — the Execution Plan:**

When ANTON is about to work on a task, it first presents an execution plan. This is not optional and not skippable. The plan shows:

- **What I'm about to do** — A plain-language description of the task, tied to its acceptance criteria and the release it belongs to: "I'm implementing Task TM-003: User authentication with JWT tokens. This task addresses acceptance criteria 2 and 3 from Release 1 (MVP)."
- **Why this approach** — The reasoning behind the implementation choice, including what alternatives were considered and why this one was selected: "I'm using JWT with refresh tokens rather than session-based auth because the architecture document specifies a stateless API layer. The Security Analyst persona reviewed this approach in the architecture phase and endorsed it with the recommendation to set token expiry to 15 minutes."
- **What knowledge and expertise I'm drawing on** — Which expert personas are active, what domain knowledge is being applied, what standards or frameworks are informing the work: "Drawing on the Software Engineering area's authentication patterns, the Cybersecurity area's OWASP session management guidelines, and the ISO 27001 access control skills."
- **What files I will create, modify, or enhance** — A clear manifest showing every file that will be touched, categorised by action:
  - 📄 **Create:** `src/auth/jwt-service.ts`, `src/auth/middleware.ts`, `src/auth/refresh-handler.ts`, `tests/auth/jwt-service.test.ts`
  - ✏️ **Modify:** `src/routes/index.ts` (add auth routes), `src/middleware/index.ts` (register auth middleware)
  - 🔗 **Enhance:** `src/models/user.ts` (add token-related fields to existing model)
- **What this connects to** — How this task relates to other tasks, what depends on it, what it depends on: "This task depends on TM-001 (database setup) which is complete. Tasks TM-004 (role-based access) and TM-005 (protected API endpoints) depend on this task."
- **What I will test** — The specific tests that will be created or run after implementation, tied to the test plan: "Will create 12 unit tests covering token generation, validation, expiry, and refresh. Will run the existing integration test suite to verify no regressions."

The project lead reviews this plan and either approves it ("proceed"), modifies it ("use session-based auth instead, here's why"), or asks questions ("what happens if the token store goes down?"). Only after approval does implementation begin.

**During execution — the Progress View:**

While ANTON is working, the user sees a progress view that is structured around the execution plan, not around code:

- A progress indicator showing which step of the plan is currently being executed
- For each completed step: a brief confirmation of what was done, which file was affected, and whether it succeeded
- Any decisions ANTON made during implementation that weren't in the original plan are flagged explicitly: "While implementing the refresh handler, I noticed the user model doesn't have a `last_login` timestamp. I've added one because the security review recommended tracking login activity. This is a minor addition beyond the original task scope."
- If ANTON encounters something unexpected — an error, a conflict with existing code, a design decision that needs human input — it stops and presents the situation clearly rather than guessing

The progress view does **not** show code streaming past in real-time. That is noise for the primary audience. What it shows is structured, purposeful status updates that a project lead can glance at and understand.

**After execution — the Completion Record:**

When a task is complete, ANTON produces a completion record that becomes part of the permanent project audit trail:

- **What was done** — Summary tied to the original execution plan, noting any deviations
- **Files created/modified/enhanced** — The final manifest with links to view each file (and for modified files, a link to view the diff)
- **Decisions made** — Any implementation decisions, with reasoning, that were made during execution
- **Tests run and results** — Pass/fail summary with details available on expansion
- **Expert review status** — Whether this task triggered an expert review, and if so, the review outcome
- **Git commit** — The commit hash and message, linking the audit record to the version control history
- **Time and cost** — How long the task took and what it consumed in tokens

This completion record is the thing that goes into the audit log. It is the answer to "what was done, why, and by whom" for every piece of work in the project.

### The code is there — it's just not the lead character

To be clear: the code is always accessible. The user can expand any file in the manifest to see its full contents. They can view diffs for modified files. They can browse the `src/` directory. They can open the Git history. A developer on the project will absolutely want to read the code, and that should be easy and well-presented.

But the code is available **on demand**, not forced into the primary view. The primary view is the professional delivery view: what was planned, what was done, why, and what it means. This is the view that a product owner can read, that a compliance officer can audit, that a managing director can understand, and that a developer can use as a starting point before diving into the code itself.

This design choice is the UI expression of the trust philosophy described in Section 7. If the goal is "you don't have to trust the output — you can verify the process," then the implementation view must show the process, not the output. The code is the output. The plan, reasoning, file manifest, decision log, and completion record are the process.

### How this applies to Script Lite and Script Medium

For Tier 2 (Script Lite) and Tier 3 (Script Medium), the implementation view is lighter but follows the same principle:

- **Before generation:** ANTON shows what it understood from the guided questioning, what approach it will take, what the script will do, and what libraries it will use — presented as a brief it has assembled, which the user confirms before code is generated
- **After generation:** The output is the script plus an explanation of what it does and why, presented side by side. The explanation is the primary view; the code is the secondary view. For Script Medium, the live preview panel shows the running result alongside the explanation
- **The prompt and the reasoning are as important as the code** — both are stored, versioned, and exportable. When someone exports a Script Lite template, they get the prompt and the reasoning, not just the code

### Implementation guidance for Claude Code

The Professional Delivery View requires the following UI components:

- **ExecutionPlanPanel.tsx** — Displays the structured execution plan before task implementation begins. Includes approve/modify/question actions for the project lead. Reusable across all Coding Large tasks.
- **ProgressView.tsx** — Real-time progress display during implementation, structured around plan steps rather than code output. Uses WebSocket or polling to update as ANTON works.
- **CompletionRecord.tsx** — The post-task audit record. Stored in `coding_tasks` and rendered as an expandable card in the project dashboard. Links to diffs, test results, reviews, and Git commits.
- **FileManifest.tsx** — A reusable component showing the create/modify/enhance file list with icons, expandable to show file contents or diffs. Used in both the execution plan (proposed changes) and completion record (actual changes).
- **CodeViewer.tsx** — An on-demand code viewing panel that opens when the user wants to see a specific file's contents or diff. Not shown by default — activated by clicking a file in the manifest. Should support syntax highlighting and diff view.

The execution plan, progress view, and completion record should all be stored in the database as structured JSON in the relevant `coding_tasks` record, so they are available for audit, export, and the activity feed. The completion record specifically feeds into the Git commit message and the project's audit trail.

This is the UI that makes ANTON's Coding Area feel like a professional delivery engagement rather than a coding tool. It is what makes the Trust section real in the user's experience, not just in the spec document.

---

## 6. Implementation Guidance for Claude Code

### 6.1 Start with a codebase audit

Before building anything, Claude Code should:
1. Read the full directory structure to understand how the existing 29 areas are organised
2. Open and read the Software Engineering area (Area 15) modules in full — these are the closest relatives to the Coding Area
3. Open and read the Cybersecurity area (Area 9) modules — these feed into the security review capabilities
4. Read `prompt-builder.ts` in full to understand the seven-layer assembly process
5. Read `connection-manager.ts` and all script adapters to understand the existing script execution sandbox
6. Read `workflow-engine.ts` to understand how workflows, checkpoints, and step assignments work
7. Read the `projects` table schema and `ProjectsPage.tsx` to understand project storage
8. Read `PromptPage.tsx` to understand the existing prompt improvement flow — this should be reused and extended, not rebuilt
9. Read all persona definitions and understand how they are injected into the prompt builder
10. Read the `scripts` table schema to understand how scripts are already stored and associated
11. Read the knowledge graph ingestion pipeline — `knowledge_atoms`, `entity_relationships`, and the extraction logic — because completed coding projects will feed into cross-workflow intelligence
12. Read the `checkpoint_decisions` table and similarity matching logic — Coding Large milestone decisions integrate with institutional memory

This audit should inform every architectural decision that follows. The Coding Area should feel like it was built by the same team that built the rest of ANTON, because it was — it just arrived later.

### 6.2 Database additions

The following new tables are likely needed (verify against existing schema before creating to avoid duplication):

**`coding_projects`** — Coding Large project records
- `id`, `name`, `description`, `tier` (lite/medium/large), `status`, `created_at`, `updated_at`
- `directory_path` — path to the project folder in the filesystem
- `git_initialized` — boolean, whether Git has been set up
- `discovery_summary` — JSON or text field with the discovery document
- `architecture_summary` — JSON or text field with the architecture document
- `baseline_summary` — JSON or text field with the Phase 0 assessment (nullable for greenfield)
- `tech_stack` — JSON array of chosen technologies
- `expert_panels` — JSON array of active expert persona IDs for this project
- `cost_estimate` — JSON with optimistic/expected/pessimistic token estimates
- `cost_actual` — running total of tokens consumed, updated per interaction
- `environment_status` — pending/in-progress/verified/failed — tracks whether the dev environment is set up and healthy
- `environment_mode` — auto/guided/handoff/docker — how the environment was provisioned
- Foreign key to `projects` table (existing) — Coding Large projects are a specialised type of project

**`coding_releases`** — Release plans within a Coding Large project
- `id`, `coding_project_id`, `release_number`, `name`, `scope`, `status`
- `acceptance_criteria` — JSON array of specific testable criteria
- `test_plan` — JSON structure of test categories and cases
- `complexity_estimate` — JSON with per-task and aggregate complexity assessments
- `complexity_actual` — updated after implementation with actual complexity encountered
- `milestone_date` — target completion date (links to existing `deadlines` table)
- `git_branch` — the branch name for this release

**`coding_tasks`** — Individual implementation tasks
- `id`, `coding_release_id`, `title`, `description`, `status`, `assigned_role`
- `complexity_band` — small/medium/large
- `acceptance_criteria`, `completion_notes`, `review_status`
- `git_commit_hash` — the commit(s) associated with this task's implementation
- Links to existing `step_assignments` table where collaborative assignment is needed

**`coding_reviews`** — Expert panel review records
- `id`, `coding_project_id`, `coding_release_id` (nullable), `coding_task_id` (nullable)
- `reviewer_persona_id`, `review_type`, `verdict` (endorse/flag/dissent), `findings`, `recommendations`
- `review_requested_at`, `review_completed_at` — for tracking review latency and escalation
- `is_mandatory` — whether this review blocks milestone progression

**`coding_test_runs`** — Test execution records
- `id`, `coding_project_id`, `coding_release_id`, `test_type`, `results`, `pass_count`, `fail_count`, `run_at`
- `ci_compatible` — whether the test was also configured for external CI runner
- Links to `workflow_executions` for automated regression runs

**`code_review_sessions`** — Records for Code Review & Explain outputs
- `id`, `session_id`, `source_type` (file/directory/repository), `source_path`, `explanation_level`, `review_lenses` (JSON array), `security_mode` (if applicable)
- `file_hashes` — JSON map of file paths to content hashes, for diff-aware re-reviews
- `previous_session_id` — nullable, links to the previous review of the same source for diff comparison

**`coding_tech_debt`** — Technical debt register entries
- `id`, `coding_project_id`, `title`, `description`, `rationale`
- `severity` (low/medium/high/critical), `owner`, `target_release_id`
- `status` (open/in-progress/resolved/accepted-risk), `resolved_at`, `resolution_notes`
- `source` — where this debt was identified (phase-0/implementation/review/alignment-check)

**`coding_changes`** — Change log entries for mid-project course corrections
- `id`, `coding_project_id`, `change_type` (task/release/goal/architecture/stack)
- `change_level` — task-level / release-level / project-level
- `title`, `rationale`, `initiated_by`, `created_at`
- `original_state` — JSON snapshot of what existed before the change
- `revised_state` — JSON snapshot of what it changed to
- `impact_assessment` — JSON: affected tasks, tests, releases, dependencies, estimated cost delta
- `affected_release_ids` — JSON array of release IDs impacted
- `stakeholder_notifications` — JSON: who was notified, who has re-approved
- `status` — proposed/approved/implemented/rejected

**`coding_dependencies`** — Dependency audit records (for Tier 1 supply chain audits and Phase 0)
- `id`, `code_review_session_id` or `coding_project_id`
- `package_name`, `current_version`, `latest_version`, `ecosystem` (npm/pypi/cargo/maven)
- `vulnerability_count`, `vulnerability_details` (JSON), `licence`, `licence_risk`
- `last_updated`, `maintenance_status`, `recommendation`

### 6.3 New API routes

Following the existing convention (see the 41 existing routes):
- `GET/POST /api/coding/projects` — CRUD for Coding Large projects
- `GET/POST /api/coding/projects/:id/releases` — Release management
- `GET/POST /api/coding/projects/:id/tasks` — Task management
- `GET/POST /api/coding/projects/:id/reviews` — Expert panel reviews
- `GET/POST /api/coding/projects/:id/tests` — Test run records
- `GET/POST /api/coding/projects/:id/tech-debt` — Technical debt register
- `GET/POST /api/coding/projects/:id/changes` — Change log: propose, review, and approve mid-project changes
- `POST /api/coding/projects/:id/changes/:changeId/impact` — Run impact analysis for a proposed change
- `POST /api/coding/projects/:id/rediscovery` — Scoped re-discovery session for goal-level changes
- `GET /api/coding/projects/:id/cost` — Token/cost tracking and estimates
- `GET /api/coding/projects/:id/activity` — Chronological activity feed
- `POST /api/coding/review` — Code Review & Explain (Tier 1)
- `POST /api/coding/review/diff` — Diff-aware re-review (Tier 1)
- `POST /api/coding/review/dependencies` — Dependency/supply chain audit (Tier 1)
- `POST /api/coding/script-lite` — Script Lite generation (Tier 2)
- `POST /api/coding/script-medium` — Script Medium generation (Tier 3)
- `POST /api/coding/large/baseline` — Phase 0 codebase onboarding
- `POST /api/coding/large/discovery` — Phase 1 discovery session
- `POST /api/coding/large/architecture` — Phase 2 architecture generation and review
- `POST /api/coding/large/estimate` — Phase 2b estimation and sizing
- `POST /api/coding/large/alignment-check` — Goal alignment check at milestone
- `POST /api/coding/large/operational-readiness` — Phase 6 operational readiness generation

### 6.4 New React pages and components

Following the existing 36-page convention:
- `CodingLandingPage.tsx` — Entry point for the Coding Area with tier selection
- `CodeReviewPage.tsx` — Tier 1: Code Review & Explain (including diff-aware and dependency audit modes)
- `ScriptLitePage.tsx` — Tier 2: Script generation
- `ScriptMediumPage.tsx` — Tier 3: Application generation with preview panel
- `CodingLargeDiscoveryPage.tsx` — Discovery session UI for Coding Large (including Phase 0 codebase onboarding)
- `CodingLargeProjectPage.tsx` — Project dashboard showing releases, tasks, reviews, tests, tech debt, cost tracking, and activity feed with role-based visibility
- `CodingLargeArchitecturePage.tsx` — Architecture design and expert panel review UI
- `CodingLargeReleasePage.tsx` — Release planning, estimation, and milestone management

New shared components for the Professional Delivery View (Section 5):
- `ExecutionPlanPanel.tsx` — Structured execution plan displayed before each task. Shows what will be done, why, which experts informed it, the file manifest, dependencies, and test plan. Includes approve/modify/question actions. Reusable across all Coding Large tasks.
- `ProgressView.tsx` — Real-time progress during implementation, structured around plan steps (not code output). Updates via WebSocket or polling. Shows step completion, flagged decisions, and any blockers encountered.
- `CompletionRecord.tsx` — Post-task audit record. Stored as structured JSON in `coding_tasks`. Expandable card in the project dashboard linking to diffs, test results, reviews, and Git commits.
- `FileManifest.tsx` — Reusable component showing create/modify/enhance file list with status icons. Expandable to show file contents or diffs. Used in both execution plans (proposed) and completion records (actual).
- `CodeViewer.tsx` — On-demand code viewing panel activated by clicking a file in the manifest. Syntax highlighting, diff view, and line-level annotation support. Not shown by default — the user opens it when they want to see code.

### 6.5 Script execution and preview

For Tier 2 (Script Lite preview) and Tier 3 (Script Medium live preview):
- Script Lite preview: use the existing script execution sandbox in `connection-manager.ts`. Pass the generated script with a 100-row sample of the user's data. Capture stdout and any output files. Display in a results panel. Time limit: 30 seconds. Memory limit: 256MB.
- Script Medium preview: for React apps, use an iframe pointing to a local dev server spun up in the sandbox. For HTML/JS, render directly in an iframe. For Python server apps, spin up in the sandbox and proxy through a local port. Consider whether the existing sandbox infrastructure supports this or whether it needs extending.
- All preview executions are logged to the `connection_audit_log` table (existing) with `execution_type: 'preview'`.

### 6.6 Expert panel review as a workflow

The Coding Large expert panel review should be implemented as a named workflow that is automatically created when a Coding Large project is initialised. This workflow:
- Has a step for each active expert persona
- Each step is an AI-executed review (not a human task assignment, though human review can be layered on top)
- The output of each step is a structured review record in `coding_reviews`
- The workflow is reusable — it runs again at each checkpoint defined in the project
- Supports parallel execution — multiple reviewers run concurrently, not sequentially
- Supports asynchronous human review steps that are inserted after AI review for mandatory sign-offs
- Tracks review latency and triggers escalation notifications when reviews are overdue
- This reuses the existing workflow engine completely — no new execution model needed

### 6.7 Goal alignment check

The alignment check at each milestone is a module-style execution using the seven-layer prompt builder:
- Layer 3 (Module Expertise): a new `goal-alignment-checker` module with a prompt that takes the discovery document, the current project state, and the technical debt register as inputs and produces a structured alignment report
- Layer 4 (Persona): Project Management persona combined with Product Manager persona
- Layer 5 (Skills): Goal-setting frameworks (OKR, North Star), agile retrospective methods
- Output: A structured report with: green (on track), amber (worth discussing), red (drifted from goals) items, outstanding technical debt past its target date, and specific questions for the project lead
- This runs as a workflow step triggered by milestone completion

### 6.8 Repository fetching

For Code Review when the user provides a repository URL:
- Use the existing Mode 2 knowledge source (Online Reference Links) if it supports repository fetching, or extend it
- For public GitHub/GitLab repos: fetch the repository tree via the GitHub/GitLab API, then fetch key files (README, package.json/requirements.txt, main entry points, key modules)
- For large repositories, do a smart prioritisation: README first, then entry points, then files by size/importance — do not try to ingest the entire repo at once
- The fetched content is added to the session's knowledge context before the prompt is assembled
- For dependency audits: specifically fetch all manifest files (package.json, requirements.txt, Cargo.toml, go.mod, pom.xml, build.gradle, Gemfile) and lock files where available

### 6.9 Git integration for Coding Large

Every Coding Large project initialises a Git repository in the project directory. Claude Code should:
- Run `git init` in the project directory at project creation
- Create a `.gitignore` appropriate to the chosen technology stack
- Commit the initial project structure (README.md, DISCOVERY.md, etc.) as the first commit
- Create release branches following the pattern `release/N-name` when release planning is complete
- Create feature branches for individual tasks when implementation begins
- Generate meaningful commit messages that reference task IDs: `feat(TASK-003): add user authentication with JWT tokens`
- Merge feature branches to release branches on task completion
- Merge release branches to `main` on release completion and milestone sign-off
- Tag releases: `v0.1.0-foundation`, `v1.0.0-mvp`, etc.
- The full Git history becomes part of the project audit trail — every code change is traceable to a task, a review, and an approval

### 6.10 Connecting to existing areas

The power of the Coding Area comes from its ability to draw on all 29 existing expert areas. Make this explicit and visible:
- In Code Review, when a compliance review lens is active, the FCP modules' system prompts and the Legal area's context are injected alongside the code review prompt
- In Coding Large discovery, the question sets for each stakeholder dimension are generated by the relevant area's system prompt logic — the Cybersecurity area generates the security questions, the FCP area generates the compliance questions, etc.
- In the expert panel review, each reviewer persona is exactly the persona defined in the existing persona library — no new personas need to be created, just selected and used
- In the goal alignment check, if the project is in a regulated domain, the relevant compliance area's skills are attached to the alignment prompt so that regulatory requirements are part of the alignment check

This integration is the core of the Coding Area's differentiation. Make it real and visible to the user — when the Security Analyst persona is reviewing their code, ANTON should be transparent that this review is drawing on the same expertise and frameworks as the Cybersecurity area's modules.

### 6.11 Knowledge feedback loop

When a Coding Large project reaches completion — or at the end of each release — the project's structured knowledge should be ingested into the platform's cross-workflow intelligence system. This is not the same as the blueprint export (which packages knowledge for other humans). This is the platform learning from its own work.

The knowledge graph ingestion pipeline should extract:
- **Architecture patterns** — what technology stacks were chosen for what kinds of projects, what worked and what was changed mid-project
- **Compliance findings** — what regulatory requirements were discovered during which types of projects, what domain-specific requirements were most commonly missed in discovery
- **Security patterns** — what vulnerabilities were found in what types of code, what security architecture decisions were made for what contexts
- **Estimation accuracy** — how actual complexity compared to estimated complexity, per task type and technology, building a calibration dataset over time
- **Common technical debt** — what debt items recur across projects, suggesting patterns that could be addressed earlier in future projects

Over time, this means that when a new user starts a fintech Coding Large project, ANTON can draw on institutional knowledge: "Based on 12 previous fintech projects on this platform, the most commonly missed compliance requirements in discovery are immutable audit logging, data retention policies for transaction records, and sanctions screening integration. Let me make sure we cover those." This is exactly what the cross-workflow intelligence 5-layer funnel was designed for — it just needs to be connected to the Coding Area's output.

Claude Code should ensure that project completion triggers knowledge extraction using the same pipeline that extracts knowledge atoms from module sessions, extended to handle the richer structured data that coding projects produce.

### 6.12 Cost tracking implementation

Token and cost tracking for Coding Large projects:
- Every LLM call made within a Coding Large project context should be tagged with the project ID, the phase (discovery/architecture/implementation/testing/review/alignment), and the specific task or review it relates to
- The `coding_projects.cost_actual` field is updated after each interaction
- The project dashboard shows a cost breakdown by phase, with a visual comparison against the initial estimate
- A threshold alert fires when actual cost exceeds 75% of the pessimistic estimate, prompting the project lead to review
- The initial estimate is generated in Phase 2b based on: number of releases × average tasks per release × average tokens per task, plus expert reviews × number of reviewers × average tokens per review, plus alignment checks and testing overhead. These multipliers should be calibrated over time using actual project data (see knowledge feedback loop).

---

## 7. Quality, Transparency, and the ANTON Standard

Every output from the Coding Area must meet the same quality standards as every other ANTON output. This means:

- **Transparency:** ANTON explains what it is doing and why. If it chooses Python over another language, it says why. If it flags a security risk, it explains the mechanism and the consequence, not just "this is a risk." If an expert panel reviewer endorses or dissents, they state their reasoning.
- **Citation and grounding:** Where outputs reference standards (OWASP, NIST, ISO 27001, AMLR, GDPR), those references are explicit and specific. Not "this may have GDPR implications" but "this function stores personal data as defined by GDPR Article 4(1) without an apparent lawful basis under Article 6."
- **Quality scoring:** All Code Review and Coding Large outputs are quality-scored using the existing quality scoring system. Script Lite and Medium outputs include a code quality assessment as part of the output.
- **Versioning:** All iterations are versioned. The user can go back to any previous version of a script, a review, an architecture document, or a task description.
- **Humility:** ANTON flags uncertainty explicitly. If the code is ambiguous or the intent is unclear, it says so and asks. If the security assessment is based on static analysis only (no runtime information), it says the limitations. If a compliance assessment requires legal advice to confirm, it says so.

The Coding Area is not a black box that generates code. It is a professional partner that does the work transparently, explains its reasoning, seeks review from the right experts, and keeps the human in control of every important decision. That is the ANTON way, and it must be the Coding Area way too.

---

## 8. Trust, Transparency, and Governance — Why This Approach Is Different

This section is not about features. It is about the philosophy behind how the Coding Area is designed, and why that philosophy matters for the people who are hardest to convince: skeptical business stakeholders, cautious management, compliance teams, and anyone who has watched AI coding tools produce something that looked impressive and turned out to be wrong.

Claude Code should understand this section deeply, because every implementation decision in the Coding Area should be made in its light. The question to ask at every design choice is not just "does this work?" but "does this build justified trust?"

### The problem with how AI coding tools currently work

The skepticism that surrounds AI-generated code is well-founded and should be taken seriously rather than dismissed. Most AI coding tools follow the same basic pattern: describe what you want, get code back fast, iterate if something is wrong. The speed is real. The impressiveness of the output is real. But the problems are also real:

The tool has no domain expertise. It does not know that a transaction monitoring dashboard in a regulated bank requires an immutable audit log. It does not know that a customer onboarding flow that stores national ID numbers has GDPR implications. It does not know that a payment processing component has PCI DSS obligations. It generates code that is syntactically correct and functionally plausible, but which may be substantively wrong in ways that only become visible when a compliance officer or a lawyer or an experienced domain expert looks at it — which often happens after the code is in production.

The tool generates without governance. There is no structured plan that was reviewed and approved before work began. There are no acceptance criteria that were written before the code was written. There are no test cases that were defined by someone other than the tool that generated the code. There is no audit trail of what was decided, why, and by whom. When something goes wrong, there is no record to review. When management asks "how was this built and who was responsible for what decisions," there is no answer.

The tool is a black box to non-technical stakeholders. A product owner or a compliance officer or a managing director cannot read the code and understand whether it does what they intended. They have to trust someone else's assessment of it, and that trust is fragile because it is not backed by any independent verification they can see.

The result is a specific kind of failure that is worse than a project that obviously went wrong: a project that appeared to succeed, that passed through development and testing and review, that was delivered and deployed — and that turns out on close inspection to have significant gaps, risks, or misalignments that nobody caught because nobody was looking in the right way at the right time.

### What ANTON's Coding Area does structurally differently

The difference is not that ANTON generates better code, though the domain expertise injected through the seven-layer architecture does meaningfully improve output quality. The structural difference is that ANTON changes *when* and *how* verification happens — from a post-hoc activity ("let's check what was built") to a pre-defined, integrated, documented process ("here is exactly what we committed to build, here is how we will know it was built correctly, here are the experts who reviewed it, here is the audit trail").

**Decisions before code.** In Coding Large, no code is written until the discovery phase is complete and the architecture has been reviewed and approved. The discovery document is signed off by the project lead before architecture begins. The architecture is reviewed by expert panels before implementation begins. The release plan and acceptance criteria are defined before a single line of implementation code is written. This is not just good practice — it is a structural guarantee that the people responsible for the outcome had the opportunity to shape it before it was too late to change direction cheaply.

**Existing codebase understanding before new code.** Phase 0 ensures that non-greenfield projects — which are the majority in reality — start from a documented understanding of what already exists. The baseline assessment, technical debt inventory, and security posture review mean that new work is built on a foundation of knowledge rather than assumptions. This addresses one of the most common failure modes in real software projects: building something new that conflicts with, duplicates, or undermines something that already exists.

**Domain expertise as a first-class participant.** The compliance review in Coding Large discovery is not a checkbox added at the end. It is a structured session conducted by a compliance-knowledgeable expert persona that asks specific questions about the application's regulatory context and produces documented findings that are part of the project record from day one. The same is true for legal, security, risk, and product perspectives. The people who understand the domain constraints are in the room before the technology decisions are locked in — which is exactly how the best-run professional projects work, and exactly the opposite of how most AI coding tools approach it.

**Transparent reasoning, not black-box output.** Every significant output from the Coding Area — a code review, a script, an architecture proposal, a task breakdown — includes an explanation of the reasoning behind it. Not "here is the code" but "here is the code, here is why it is structured this way, here are the alternatives that were considered, here are the trade-offs, here are the limitations of this assessment." A managing director cannot read assembly code but they can read a clear explanation of what the architecture does and why it was chosen and what risks were identified and how they were addressed. That transparency is what makes informed oversight possible for non-technical stakeholders. The Professional Delivery View (Section 5) is the UI embodiment of this principle — the user sees the plan, the reasoning, the file manifest, and the completion record by default, with code available on demand rather than forced into the primary view.

**Structured human sign-off at every milestone.** The workflow engine enforces checkpoint decisions — the project cannot proceed past a milestone until the designated approver has reviewed and signed off. These are not optional. They are structural gates. A compliance officer can be the approver for the data model. A product owner can be the approver for the acceptance criteria review. A CISO can be the approver for the security architecture. Each sign-off is logged with the approver's identity, the date, and any comments. This is an audit trail of human decisions, not just AI outputs. The asynchronous collaboration model ensures that sign-offs work across distributed teams with different schedules, while escalation logic ensures that stalled reviews don't silently block progress.

**Independent expert review of AI's own work.** One of the most important trust mechanisms in the Coding Area is the expert panel review of AI-generated outputs. When ANTON generates an architecture proposal, a different set of expert personas reviews it — not as a validation rubber-stamp, but as a genuine independent assessment that can and should produce dissent. When a security persona flags a risk in an architecture that the architecture persona did not mention, that dissent is visible to the project lead. This is modelled directly on how the best professional organisations do peer review and it addresses one of the most legitimate criticisms of AI tools: that they cannot identify the limitations of their own outputs. Structured adversarial review is how those limitations get surfaced.

**Test cases written before code, regression tests run after every milestone.** The test suite for a Coding Large project is defined as part of the release plan, before implementation begins. Acceptance criteria are written in plain language that a non-developer can verify. When a milestone is marked complete, the regression suite runs automatically. If tests fail, the milestone sign-off is blocked. The test history is part of the permanent project record. This means there is always a documented, objective answer to "does the software do what it was supposed to do at each stage." The tests are designed to be portable to standard CI runners, so they continue to protect the software after it leaves the ANTON environment.

**Technical debt made visible and tracked.** Conscious debt decisions are legitimate, but invisible debt is dangerous. The technical debt register ensures that every shortcut, deferral, and compromise is documented with a rationale, an owner, and a deadline. The goal alignment check surfaces overdue debt items. The project cannot be marked complete with unresolved critical debt without an explicit acknowledgement of the remaining risk. This gives management and compliance teams a clear answer to "what compromises were made and who accepted them."

**Goal alignment at every milestone.** The goal alignment check re-reads the original discovery document at each milestone and compares the current project state against the original goals. It flags drift explicitly. This is the institutional equivalent of asking "are we still building the right thing" — a question that professional delivery teams ask at retrospectives and steering committees, and that no AI coding tool currently asks at all. Keeping a large project aligned with its original intent over time is one of the hardest things in software delivery, and one of the most common failure modes when AI is doing the implementation fast without a structured check on direction.

**Operational readiness, not just development completion.** The project is not considered done when the code works. Phase 6 ensures that logging, monitoring, incident response, backup, and operational security are addressed before handover. For regulated industries, this is not optional — DORA and similar frameworks explicitly require operational resilience, and a system that was developed with perfect governance but deployed without monitoring or incident response procedures has a gap that regulators will find.

**Cost transparency throughout.** The project lead always knows what the project is consuming in LLM resources, how that compares to the estimate, and where the resources are being spent. No surprise bills, no opaque consumption. This builds trust with budget holders and procurement teams who have legitimate concerns about AI cost management.

### What this means for different stakeholders

**For management and boards:** They have a structured project record that shows what was planned, who reviewed and approved each phase, what the milestones were, whether they were met, and what the test results showed. They have cost tracking showing actual spend against estimates. They have a technical debt register showing what compromises were made and who accepted them. They can ask for the discovery document and the architecture review and the milestone sign-off log and get clear, readable answers. They do not have to trust a developer's word that "it was built correctly" — they have a documented process that they can verify.

**For compliance and legal teams:** The compliance review is part of the project record from day one. The expert persona that conducted the compliance discovery drew on the same domain knowledge as the platform's compliance modules — GDPR, AMLR, DORA, PCI DSS depending on context. Findings and requirements identified in discovery are tracked through the project and appear in the acceptance criteria. If a requirement was identified and not addressed, the goal alignment check will flag it. The audit trail supports supervisory review. The operational readiness package addresses operational compliance requirements that development-only tools miss entirely.

**For product owners and business stakeholders:** They participated in the discovery phase. Their requirements were documented and are verifiable. Acceptance criteria were written in their language, not developer language. They have a sign-off role at milestones. They can use the Code Review & Explain feature to read what was built at any stage and understand it at their level. The feature search capability lets them check "is X feature in the code" without needing a developer to answer. The diff-aware re-review lets them see what changed since they last looked, in language they understand.

**For technical leads and developers:** They have a documented architecture with explicit rationale and trade-off analysis. They have a task breakdown with clear scope and acceptance criteria. They have a test suite they did not have to write from scratch. They have expert review records showing what was flagged by security, compliance, and architecture reviewers. The Git history gives them a complete record of every code change linked to its task and review. If something goes wrong, they have a complete record of the decisions that led to it.

**For security teams:** The security review in Code Review & Explain produces structured findings mapped to OWASP, NIST, ISO 27001, or DORA as appropriate. The dependency and supply chain audit provides structured vulnerability and licence analysis. The security persona in Coding Large discovery asks the right questions about threat models and authentication and data protection before architecture is locked in. The expert panel includes a security reviewer at every architecture checkpoint. Penetration testing plans are generated from the actual codebase, not generic checklists. The operational readiness package includes security operations procedures.

### The honest limitations

Trust must be earned honestly, which means acknowledging what the system cannot do as clearly as what it can.

ANTON's expert personas are AI — they draw on the domain knowledge embedded in the platform's modules, skills, and area contexts, but they are not human professionals and should not be presented as equivalent. The compliance review flags likely issues based on pattern recognition and domain knowledge; it does not replace a qualified compliance officer reviewing the specific application in its specific regulatory context. Legal findings from the discovery phase are a starting point for legal review, not a substitute for it. Security findings from the code review are a structured assessment, not a certified penetration test. The dependency audit uses publicly available vulnerability databases and may not catch zero-day vulnerabilities or supply chain attacks that have not yet been disclosed. This must be communicated clearly in every relevant output.

Human judgment at the checkpoints is only as good as the humans involved. The system creates the structure for meaningful oversight — the documents, the questions, the review prompts — but it cannot force the humans at the sign-off gates to engage deeply rather than clicking through. Organisations that want to get the full benefit of this system need to treat the checkpoint reviews seriously, not as bureaucratic gates to be cleared. The platform can make serious review easy; it cannot make it mandatory.

AI-generated code at scale will have errors that testing does not catch. The regression test suite is a genuine quality mechanism, but it tests what was specified — if the specification itself was incomplete or wrong, the tests will pass and the problem will not be found. The goal alignment check and the expert panel reviews are designed to catch specification gaps, but they are not infallible. Human review of critical components remains important.

Cost estimates are projections based on scope and historical patterns, not guarantees. Actual costs may vary, particularly for projects that discover significant complexity during implementation. The estimation system improves over time as calibration data from completed projects accumulates.

These limitations should be documented in the platform's user-facing guidance for the Coding Area, and Claude Code should ensure that outputs in the Coding Area include appropriate caveats where the nature of the output warrants it — particularly for compliance and security findings.

### Why this matters for openEXPERT's positioning

The trust and governance layer is not just a feature of the Coding Area — it is, in the current AI landscape, a significant market differentiator. Every organisation that has had a bad experience with AI coding tools, or that has watched a high-profile AI coding failure in their industry, is asking the same question: "How do I know this is actually right?" The answer that most tools give is essentially "trust the output." 

ANTON's answer is different: "You don't have to trust the output — you can verify the process." The discovery document, the expert panel reviews, the milestone sign-offs, the test results, the goal alignment checks, the technical debt register, the cost tracking, the operational readiness assessment — these are all mechanisms that move trust from the output to the process. Process-based trust is more durable, more auditable, and more appropriate for professional and regulated contexts than output-based trust.

This is what makes the Coding Area a natural extension of openEXPERT's core identity. The platform has always been about transparency, expert reasoning, and professional standards. The Coding Area brings those same principles to software delivery — a domain that desperately needs them and where no current tool is providing them adequately.

---

## 9. Export, Import, and Reuse — The Coding Blueprint System

One of the most valuable things the platform already does for modules is allow users to export them as `.anton` packages — containing the full prompt architecture, configuration, skills, and personas — so that colleagues or community members can import them, adapt a few things to their context, and run the same quality of work without starting from scratch. The Coding Area must follow exactly this pattern, extended to cover the richer artifacts that coding work produces.

### The core principle

When someone builds a Script Lite prompt that extracts and analyses specific data in a particular way, that prompt has value beyond the single use. When someone completes a Coding Large project and has a working discovery template, architecture review checklist, release plan, test suite, and task breakdown for a fintech compliance tool — that is an enormous amount of structured knowledge that another organisation building something similar should not have to recreate. The export system makes that knowledge portable and reusable.

This is consistent with the platform's open-source philosophy and its community model. Just as a compliance consultant can export a custom AMLR gap analysis module and share it with colleagues or the community, a technical lead can export a Coding Large project blueprint and share it with their organisation's other teams or the broader developer community.

### What gets exported at each tier

**Tier 1 (Code Review & Explain) — Review Profile export:**
When a user has configured a Code Review session with a specific combination of lenses (e.g., security review in NIST mode + compliance review for fintech + deep technical review + dependency audit), they can export that configuration as a named Review Profile. The export contains:
- The selected review lenses and their configurations
- The explanation level default
- Any custom instructions added to the review
- The expert personas and skills active for the session
- The security mode and framework selections
- The dependency audit configuration (which ecosystems, which severity thresholds, licence policy)

Someone else imports this profile, points it at their own codebase, and gets the same structured expert review without having to configure anything. Useful for organisations that want a standard code review baseline across all their development teams.

**Tier 2 (Script Lite) — Script Template export:**
The export contains:
- The full generated prompt that produced the script (the brief ANTON assembled from the guided questions)
- The generated script itself with all comments intact
- The requirements.txt
- A brief description of what it does and what input data format it expects
- Sample input data structure (column names and types, not real data)
- Notes on what parameters are most likely to need changing for a new use case

Someone imports this, updates the input file path, adjusts a few parameters described in the export notes, and runs the same analysis on their own data. For common analytical tasks (e.g., transaction pattern clustering, customer segmentation, regulatory data transformation), these templates will save hours of work.

**Tier 3 (Script Medium) — Application Template export:**
The export contains:
- The full prompt brief
- All generated source files (the complete application)
- package.json or requirements.txt
- The README with setup and run instructions
- Configuration points — a clearly marked list of the things most likely to need changing: data source paths, API endpoints, column name mappings, display labels, colour schemes
- A description of what the application does and what it is designed to show

The configuration points section is important — it should be generated by ANTON as part of the export, not left to the recipient to figure out. ANTON identifies the variables, file paths, API keys, and display settings in the code that are most likely to be organisation-specific and lists them explicitly with instructions. This is what makes the export genuinely reusable rather than just a code dump.

**Tier 4 (Coding Large) — Project Blueprint export:**
This is the richest export and the one with the most reuse value. A completed Coding Large project represents a significant body of structured professional knowledge: the discovery framework that was used, the architecture decisions that were made and why, the release structure, the test suite, the task breakdown, the expert review records, the technical debt patterns, and the operational readiness checklist. A blueprint export packages all of this so another team can use it as the starting point for a similar project.

The export contains:
- `BLUEPRINT.md` — A high-level overview of what this project was, what it built, what decisions were made, and what someone reusing this blueprint should change for their context
- `DISCOVERY_TEMPLATE.md` — The discovery questions used, with the original answers removed and replaced by guidance notes ("Replace with your organisation's answer — key considerations are X, Y, Z")
- `ARCHITECTURE_TEMPLATE.md` — The architecture document with organisation-specific details replaced by configurable placeholders, and the architectural decisions explained so the importer can decide whether they apply to their context
- `RELEASE_PLAN_TEMPLATE.md` — The release structure with scopes and milestone dates cleared but acceptance criteria retained and annotated ("These criteria are specific to a GDPR-regulated context — if your jurisdiction differs, review Article references")
- `TASKS_TEMPLATE.md` — The full task breakdown with completion notes removed but task descriptions, acceptance criteria, and role assignments retained
- `TEST_SUITE_TEMPLATE.md` — All test cases with expected results, organised by release and category. Test cases that are generic (e.g., "authentication flow works correctly") are retained as-is. Test cases that are specific to the original project's data model are annotated with what needs to change.
- `TECH_DEBT_PATTERNS.md` — Common debt items that were encountered, how they were resolved (or accepted), and guidance for new projects on how to avoid them
- `ENVIRONMENT_TEMPLATE.md` — The environment setup guide with organisation-specific paths and credentials removed, Docker configuration retained, and verification health check adapted to be generic. Includes the air-gapped addendum if the original project used one.
- `CHANGES_LOG.md` — The project's change history, included so importers can see what pivots and course corrections happened during the original build, what caused them, and what their impact was. This is valuable learning for anyone building something similar — knowing that "every fintech project pivoted on audit logging requirements after Release 1" is the kind of pattern that saves weeks.
- `OPERATIONS_TEMPLATE.md` — The operational readiness checklist with organisation-specific details templated out
- `EXPERT_PANEL_CONFIG.json` — The expert persona configuration used for this project's review panels, importable directly
- `STACK.json` — The technology stack choices with rationale, so the importer can make an informed decision about whether to keep or change them
- `ESTIMATION_CALIBRATION.json` — Actual vs. estimated complexity data from this project, useful for calibrating estimates on similar future projects
- All of these are packaged as a `.anton` file following the existing bundler convention (`anton-bundler.ts`)

### Import and adaptation flow

When a user imports a coding blueprint or template:
1. ANTON reads the export and identifies all configurable points — placeholders, annotation flags, parameters marked as organisation-specific
2. ANTON presents a guided adaptation session: "This blueprint was built for [original context]. I've identified [N] things you'll likely need to change. Let me walk you through them." Each configurable point is presented with the original value, the annotation explaining why it might need to change, and an input field for the new value.
3. Once the user has worked through the adaptation, ANTON produces a new configured version of all files with their values substituted in
4. For Coding Large blueprints, ANTON then asks: "Would you like to start a new Coding Large project using this blueprint as the foundation?" If yes, the project is initialised with all the adapted documents pre-populated — the user skips Phase 1 discovery (since the template already covers it) and goes straight to reviewing and confirming the architecture.

This adaptation flow is the same pattern as the existing module import — import, review, adapt, use. It just operates at a richer level of structure for coding artifacts.

### Sharing options

Following the existing export/import model:
- **Local export** — download as `.anton` file, share manually with colleagues, import on another ANTON instance
- **Project export** — add to the current project's shared artifacts, accessible to all project members
- **Community export** — publish to the community library (same channel as community modules) with a title, description, tags (language, domain, use case), and usage notes

The community library for coding blueprints will become particularly valuable over time. An AMLR-compliant transaction monitoring dashboard blueprint, a GDPR data subject request handler blueprint, a React compliance reporting dashboard template — these are reusable across the industry and align directly with ANTON's domain expertise. They also position openEXPERT in the developer community as something that brings real professional knowledge to software delivery, not just generic code generation.

### Connection to existing platform

The export/import implementation should reuse `anton-bundler.ts` and `antonImport.ts` / `antonExport.ts` — the same services that handle module and skill exports. The coding exports are a new bundle type (`type: 'coding-review-profile'`, `type: 'script-lite-template'`, `type: 'script-medium-template'`, `type: 'coding-large-blueprint'`) added to the existing bundler. The import flow follows the same validation and adaptation pattern. The community library extension is additive to the existing community module sharing model.

Claude Code should read `anton-bundler.ts`, `antonImport.ts`, and `antonExport.ts` carefully before implementing this, and extend them cleanly rather than creating parallel export services.

---

## 10. Summary of What to Build, in Suggested Order

1. **Codebase audit** — read and understand before writing anything. Key files: Area 15 (Software Engineering), Area 9 (Cybersecurity), `prompt-builder.ts`, `connection-manager.ts`, `workflow-engine.ts`, `projects` table schema, `PromptPage.tsx`, `anton-bundler.ts`, `antonImport.ts`, `antonExport.ts`, all persona definitions, all skills definitions, knowledge graph ingestion pipeline, `checkpoint_decisions` table.
2. **Database schema additions** — extend existing schema cleanly, no duplication. Include: `coding_projects`, `coding_releases`, `coding_tasks`, `coding_reviews`, `coding_test_runs`, `code_review_sessions`, `coding_tech_debt`, `coding_changes`, `coding_dependencies`.
3. **Shared components** — Build `FileManifest.tsx`, `CodeViewer.tsx`, `ExecutionPlanPanel.tsx`, `ProgressView.tsx`, and `CompletionRecord.tsx` early, as they are used across multiple tiers and are the foundation of the Professional Delivery View.
4. **CodingLandingPage.tsx** — entry point and tier selector
5. **CodeReviewPage.tsx + API route** — Tier 1, using existing knowledge source + persona injection. Include diff-aware re-review capability and dependency/supply chain audit as distinct modes.
6. **Review Profile export/import** — extend `anton-bundler.ts` with `coding-review-profile` bundle type
7. **ScriptLitePage.tsx + API route** — Tier 2, using existing script execution sandbox + prompt improvement flow. Include data sample paste for column inference. Use the "brief confirmation" pattern from the Implementation View before generating.
8. **Script Lite export** — extend bundler with `script-lite-template` bundle type
9. **ScriptMediumPage.tsx + API route + preview panel** — Tier 3, extends Tier 2 with preview. Same brief-first pattern.
10. **Script Medium export** — extend bundler with `script-medium-template` bundle type, including configuration points generation
11. **Coding Large — Phase 0: Codebase onboarding** (uses Tier 1 capabilities, produces baseline assessment, tech debt inventory, dependency audit, feature map)
12. **Coding Large — Phase 1: Discovery** (`CodingLargeDiscoveryPage.tsx` + discovery workflow)
13. **Coding Large — Phase 2: Architecture design + expert panel review workflow** (parallel reviewer execution, async human sign-off, escalation logic)
14. **Coding Large — Phase 2b: Estimation and sizing** (complexity banding, analogies, per-release estimates)
15. **Coding Large — Phase 3: Release planning + milestone integration** (uses existing deadline/project systems, Git branching)
16. **Coding Large — Release 0: Environment provisioning** — ENVIRONMENT.md generation, Docker configuration, four setup modes (auto/guided/handoff/docker), verification health check workflow, environment status tracking
17. **Coding Large — Phase 4: Implementation with Professional Delivery View** — This is where ExecutionPlanPanel, ProgressView, and CompletionRecord come together. Each task follows the plan → approve → execute → record cycle. The completion record feeds into the audit trail and activity feed.
18. **Coding Large — Phase 5: Test suite and regression workflow** (uses existing workflow engine, CI-runner-compatible test configs)
19. **Coding Large — Phase 6: Operational readiness** (logging, monitoring, incident response, backup, security ops)
20. **Goal alignment check module** (seven-layer module, triggered by milestone completion, includes tech debt review)
21. **Technical debt register** (`TECH_DEBT.md` management, integration with alignment check and milestone sign-off)
22. **Cost and token tracking** (per-project, per-phase, estimate vs. actual, threshold alerts)
23. **Multi-stakeholder collaboration** (async review workflows, escalation, role-based visibility, activity feed)
24. **Change management** — Change proposal UI, impact analysis engine, scoped re-discovery flow, change log (`CHANGES.md`), stakeholder re-notification, cost re-estimation on scope change. This wires into task versioning, release restructuring, goal alignment updates, and architecture re-review.
25. **Git integration** (repository init, branching strategy, meaningful commits, release tags)
26. **Project directory creation and management** (filesystem integration for `~/coding/large/`)
27. **Knowledge feedback loop** (connect completed projects to cross-workflow intelligence pipeline)
28. **Coding Large Blueprint export** — the richest export; extend bundler with `coding-large-blueprint` type covering all documents including tech debt patterns and operational templates
29. **Blueprint import + adaptation flow** — guided adaptation session on import, project initialisation from blueprint
30. **Integration validation** — verify that each tier properly draws on the existing 29 area personas, skills, and modules, and that all export/import flows are consistent with existing module export behaviour

At every step, the guiding question is: **does this feel like it belongs in ANTON, or does it feel like a separate product?** It must feel like ANTON. Same design language, same quality standards, same transparency, same integration with every capability the platform already has. That is what makes it great.

---

*Written for Claude Code as a comprehensive briefing and implementation guide.*  
*Version 2.0 — February 2026*  
*Authors: Daniel Gullstrand (FutureChain AB / openEXPERT), with contributions from Claude Opus 4.6 and Claude Sonnet 4.5*
