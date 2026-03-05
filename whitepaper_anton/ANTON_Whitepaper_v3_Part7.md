# PART 7: AI-LED SOFTWARE DEVELOPMENT — NEW IN v3.0

*The gap between "I know what software I need" and "I have working software that serves its purpose" is where most AI coding tools operate — generating code fast from a brief. But speed from brief to code is not what makes software projects succeed. What makes them succeed is understanding the full stakeholder landscape, embedding domain expertise into requirements, planning releases that are manageable and reversible, and building governance that keeps large projects aligned with their goals over time. ANTON's Coding Area brings all 29 expert domains into the software development process, functioning not as a code generator but as a professional delivery partner.*

---

## §28. The Coding Area (4-Tier Architecture)

Most AI coding tools solve one problem: getting from a description to code as quickly as possible. Loveable generates web apps from prompts. Cursor makes experienced developers faster. GitHub Copilot auto-completes code in real-time. What none of them do is bring domain expertise, compliance awareness, multi-stakeholder governance, and structured project management into the coding process.

This is where ANTON's position as a multi-domain expert platform becomes a decisive advantage. The Coding Area is not a separate product bolted onto the side — it is a new capability area that inherits the entire platform's intelligence: all 29 expert area personas, all skills, all workflows, all quality scoring, all knowledge graph integration. When ANTON reviews code for a financial application, it brings the FCP specialist's eye for regulatory compliance, the cybersecurity analyst's threat awareness, and the data scientist's data governance perspective — automatically, as part of the standard review.

The Coding Area is structured as four distinct but connected capability tiers, each serving different user needs and different levels of complexity.

---

### Tier 1: Code Review & Explain

**Who it's for:** Product owners, project leads, business stakeholders, compliance officers, security teams — anyone who needs to understand what code does or whether it does it well, without necessarily being a developer themselves.

**What it does:** Users point ANTON at code — a single file, a directory, a repository URL — and choose what they want to understand. The explanation level ranges from "Explain Like I'm Five" (for non-technical stakeholders) through "Technical Deep Dive" to "Architecture Assessment" (for senior engineers and CTOs). Users can also select review lenses: Business Logic (what does this code actually do?), Security (what vulnerabilities exist?), Performance (where are the bottlenecks?), Compliance (does this meet regulatory requirements?), or Quality (how maintainable is this code?).

**The power of cross-area expertise:** When ANTON reviews a transaction monitoring system, it draws on the FCP area for regulatory compliance, the Cybersecurity area for vulnerability assessment, the Data & Analytics area for data handling patterns, and the Software Engineering area for code quality — all assembled automatically through the seven-layer prompt system with appropriate persona injection.

**Outputs:** Structured, versioned, quality-scored, and exportable to DOCX/PDF. A review output can be promoted into a Coding Large project as a baseline assessment, or it can trigger a workflow — a security finding can automatically create a task assigned to a team member with a deadline.

**Export/Import:** Review configurations (selected lenses, explanation levels, active personas, custom instructions) can be exported as `.anton` review profile bundles and shared across teams, creating standardised code review baselines for an entire organisation.

---

### Tier 2: Script Lite

**Who it's for:** Analysts, compliance officers, researchers, consultants — people who work with data regularly, understand what analysis they want to do, but are not Python developers and don't want to spend hours wrestling with code.

**What it does:** Script Lite closes the gap between "I know what I want to do with this data" and "I have a working script to do it." Through a guided conversation (consistent with ANTON's other module interactions), the user describes their analytical task in plain language. ANTON asks clarifying questions, selects the appropriate approach, and generates a complete, well-documented Python script.

**Supported tasks:** Data extraction and transformation (filter, merge, aggregate, pivot), statistical analysis (descriptive stats, correlation, distribution assessment), machine learning (k-means clustering, random forest, logistic regression, PCA, anomaly detection), visualisation (charts, dashboards, heatmaps), and report generation (automated narrative with embedded charts).

**Preview:** Generated scripts can be run directly in ANTON's sandboxed execution environment with a sample of the user's data, allowing verification before taking the script elsewhere.

**Key principle:** The goal is not to run the script for the user forever — it is to give them a working, understandable artifact they own and can reuse and adapt. Every script includes comprehensive comments, a requirements.txt, and a README explaining what it does and how to modify common settings.

**Export:** Script Lite templates can be exported as `.anton` bundles containing the generation prompt, the script, requirements, sample data structure, and notes on customisation points — enabling teams to share proven analytical scripts.

---

### Tier 3: Script Medium

**Who it's for:** Internal tool builders, data teams, small business operators, marketing teams — anyone who needs a functional application (not just a script) but doesn't have the resources for a full development project.

**What it does:** Script Medium generates complete, working applications: React dashboards for KPI monitoring, Python Flask APIs for data services, HTML data exploration tools, or standalone utilities. Like Script Lite, ANTON guides the user through a structured discovery conversation, but the output is a full application with folder structure, dependencies, configuration files, and a plain-language README.

**Live Preview:** For React and HTML outputs, ANTON provides a live preview panel using an embedded iframe. Users can see the application running with sample data and iterate with ANTON on design and functionality before finalising — each iteration versioned through ANTON's standard versioning system.

**Promotion path:** If a Script Medium project grows beyond its original scope, it can be promoted to a Coding Large project, carrying its history and context forward.

**The same standards as modules:** Script Medium output follows the same quality expectations as any ANTON module. ANTON explains architecture decisions, flags limitations and trade-offs, and suggests improvements. The output should be something a professional developer would be comfortable putting their name on, even though it was generated by AI.

---

### Tier 4: Coding Large — Professional AI-Led Software Development

**Who it's for:** Product teams building internal tools, startups building their first product, compliance teams commissioning regulatory reporting systems, consulting firms building client-facing platforms — anyone who needs real software with proper governance.

**The core differentiator:** ANTON front-loads everything that makes real software projects succeed, because the cost of misalignment grows exponentially as a project progresses. An hour of structured discovery at the start saves weeks of rework later.

#### Phase 1: Discovery & Stakeholder Alignment

Before any code is planned, ANTON conducts a structured multi-turn discovery session that brings in the appropriate expert perspective for each dimension:

**Business & Product** (Product Manager + Strategy personas): What problem are we solving, for whom, and why now? What does success look like? Who are the core users? What constraints exist? What is the minimum viable first release?

**Compliance & Regulatory** (FCP, Legal, Risk personas): Does this application handle personal data? Financial transactions? Health data? What regulatory reporting obligations apply? What audit trail requirements exist? This is where ANTON's unique strength is decisive — a generic AI coding tool doesn't know that a transaction monitoring dashboard needs an immutable audit log, but ANTON does and asks the right questions upfront.

**Technical** (Software Engineer, Solutions Architect, CTO personas): Frontend, backend, data storage requirements? Integrations? Performance expectations? Deployment constraints? Technology preferences?

**Security** (Cybersecurity, Ethical Hacker personas): Authentication model? Data protection at rest and in transit? Threat model? Security standards (ISO 27001, NIST, SOC 2, DORA)?

The discovery session produces a comprehensive document that captures all requirements, constraints, and decisions — the foundation everything else builds on.

#### Phase 2: Architecture Design & Expert Panel Review

ANTON generates architecture documentation based on the discovery findings, then automatically assembles an expert panel review. The panel is a workflow where each active expert persona reviews the architecture independently, producing structured review records with verdict (endorse, flag, or dissent), findings, and recommendations.

This is not an afterthought — it is a systematic governance checkpoint that catches compliance gaps, security vulnerabilities, and architectural weaknesses before a single line of code is written.

#### Phase 3: Release Planning & Milestone Management

Projects are broken into manageable releases, each with defined scope, acceptance criteria, and test plans. Releases link to ANTON's existing deadline and milestone tracking system, with SLA monitoring and overdue detection. This reuses the platform's workflow engine completely — no separate execution model needed.

#### Phase 4: Implementation & Goal Alignment

At each milestone, ANTON runs a Goal Alignment Check — a seven-layer module execution that takes the original discovery document and the current project state as inputs and produces a structured alignment report: green (on track), amber (worth discussing), red (drifted from goals), with specific questions for the project lead. This continuous alignment loop is what prevents large projects from drifting into irrelevance.

**Blueprint Export:** A completed Coding Large project can be exported as a rich `.anton` blueprint containing the discovery framework, architecture decisions and rationale, release structure, test suite, task breakdown, and expert review records. Another team can import this blueprint to start a similar project with all the professional scaffolding already in place — the most reusable artifact in the Coding Area.

---

### Connecting Tiers

The four tiers form a progression path, but they are equally valuable independently. A compliance officer might only ever use Tier 1 (Code Review) to understand what their development team built. An analyst might live in Tier 2 (Script Lite) generating data scripts weekly. A startup might jump straight to Tier 4 (Coding Large) for their first product. Each tier draws on the full platform — 29 expert areas, all personas, all skills, all workflows, all quality scoring — because the Coding Area is ANTON, not a separate product that happens to share a UI.

---

## §29. AI Code Instruction Builder

Beyond the four coding tiers, ANTON provides a capability that bridges the gap between ANTON's expert governance and external AI coding tools like Claude Code, Codex, or Mistral Code.

### The Problem

AI coding tools like Claude Code are powerful — they can generate, refactor, and debug code at remarkable speed. But they work from instructions, and the quality of the output is directly proportional to the quality of those instructions. A vague brief produces vague code. A comprehensive brief that includes stakeholder requirements, compliance constraints, architecture decisions, testing criteria, and governance checkpoints produces better code.

Writing that comprehensive brief is itself a professional skill that most non-technical stakeholders lack.

### The Solution

The AI Code Instruction Builder uses ANTON's guided discovery process — the same multi-turn, expert-informed conversation used in Coding Large — to produce a comprehensive markdown instruction file optimised for the user's chosen AI coding tool. The user selects their preferred tool (Claude Code, Codex, or Mistral Code), goes through the guided discovery, and ANTON generates an instruction file that includes project context, stakeholder requirements, compliance constraints, architecture decisions, implementation priorities, acceptance criteria, and testing requirements — all structured in the format that the target coding tool processes most effectively.

Before export, the instruction file goes through ANTON's expert panel review. The same multi-perspective validation that reviews architecture in Coding Large reviews the instructions: is the compliance framing correct? Are the security requirements complete? Do the acceptance criteria actually test what matters?

### Project Alignment Reviewer

The companion capability to the Instruction Builder is the Project Alignment Reviewer, which works in the opposite direction — ingesting an existing codebase and comparing it against stated goals and visions. Feed it a repository and a project brief, and ANTON produces a structured alignment assessment: which goals are fully met, partially met, or drifted from, with specific steering instructions to bring the project back on track.

Together, the Instruction Builder and Alignment Reviewer create a continuous governance loop where ANTON serves as the senior architect and project governance intelligence while external coding tools handle the actual development work. ANTON doesn't need to write the code — it needs to ensure the code serves its intended purpose.
