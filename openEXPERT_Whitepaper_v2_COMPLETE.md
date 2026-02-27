# openEXPERT by ANTON — Technical Whitepaper

**Version:** 2.0.0
**Date:** February 19, 2026
**Status:** Public Release
**License:** Open Source (MIT)
**Created by:** Daniel Bardun & FutureChain AB
**Powered by:** Anthropic Claude API (primary) + OpenAI GPT + Mistral + Local Ollama

---

## What's New in Version 2.0

**MAJOR UPDATE:** This whitepaper documents the **fully implemented, production-ready platform** with extensive features beyond the original vision:

- ✅ **14/14 Transformative Features** fully implemented (Institutional Memory, Apprentice Model, Cross-Workflow Intelligence, Quality Ratchet, Time Intelligence, Compliance-as-Code, Collaborative Canvas, Regulatory Radar, and more)
- ✅ **238 modules** across **29 expert areas** (vs. 8 modules in v1.0)
- ✅ **Multi-LLM architecture** (Claude, GPT, Mistral, Ollama)
- ✅ **Enterprise security** (RBAC, audit logs, budget management, rate limiting)
- ✅ **Advanced intelligence systems** (knowledge graphs, pattern detection, semantic search)
- ✅ **Workflow automation** with scheduling and collaboration
- ✅ **80+ database tables** supporting persistent knowledge
- ✅ **36 pages** spanning complete user workflows

This is no longer a vision document — it's a **deployment guide for a working system**.

---

## Table of Contents

### Part 1: Introduction & Value
1. [Executive Summary](#1-executive-summary)
2. [Who This Is For](#2-who-this-is-for)
3. [Why openEXPERT?](#3-why-openexpert)
4. [Important Notices](#4-important-notices)

### Part 2: Core Architecture
5. [How It Works: The Seven-Layer Prompt Builder](#5-how-it-works-the-seven-layer-prompt-builder)
6. [Knowledge Source System (4 Modes)](#6-knowledge-source-system-4-modes)
7. [Multi-LLM Architecture](#7-multi-llm-architecture)
8. [Database & Persistence](#8-database--persistence)

### Part 3: Intelligence & Memory Systems
9. [Cross-Workflow Intelligence (5-Layer Funnel)](#9-cross-workflow-intelligence-5-layer-funnel)
10. [Knowledge Graph & Entity Relationships](#10-knowledge-graph--entity-relationships)
11. [Pattern Detection Engine](#11-pattern-detection-engine)
12. [Institutional Memory Engine](#12-institutional-memory-engine)

### Part 4: Quality & Learning
13. [Quality Ratchet & Continuous Improvement](#13-quality-ratchet--continuous-improvement)
14. [Apprentice Model (4-Stage Learning)](#14-apprentice-model-4-stage-learning)
15. [Output Versioning & Diff Engine](#15-output-versioning--diff-engine)

### Part 5: Automation & Governance
16. [Time Intelligence & Regulatory Radar](#16-time-intelligence--regulatory-radar)
17. [Compliance-as-Code](#17-compliance-as-code)
18. [Workflow Automation & Scheduling](#18-workflow-automation--scheduling)
19. [Collaborative Canvas (Multi-Human Workflows)](#19-collaborative-canvas-multi-human-workflows)

### Part 6: The 29 Expert Areas
20. [Expert Areas Overview](#20-expert-areas-overview)
21. [Flagship Area: Financial Crime Prevention](#21-flagship-area-financial-crime-prevention)
22. [Cross-Area Use Cases](#22-cross-area-use-cases)

### Part 7: Security, Privacy & Deployment
23. [Security Architecture](#23-security-architecture)
24. [Privacy & Data Safety](#24-privacy--data-safety)
25. [Deployment Models](#25-deployment-models)

### Part 8: Usage Guide
26. [Getting Started](#26-getting-started)
27. [Power User Guide](#27-power-user-guide)
28. [Enterprise Administration](#28-enterprise-administration)

### Part 9: Community & Future
29. [Building Custom Modules](#29-building-custom-modules)
30. [Contribution & Community](#30-contribution--community)
31. [Roadmap & Future Vision](#31-roadmap--future-vision)
32. [FAQ](#32-faq)

---

## 1. Executive Summary

### What Is openEXPERT?

openEXPERT by ANTON is an **open-source, AI-powered expert platform** that transforms how people work with AI across 29 professional domains — from financial crime prevention and legal advisory to project management, healthcare, education, and personal development.

**The problem it solves:**

AI models like Claude are extraordinarily capable — like having access to a super-smart graduate student who has read everything, remembers everything, and can reason at exceptional speed. But there's a gap: that graduate student, brilliant as they are, has never actually worked in your industry. They don't know how a gap analysis is structured in practice, what a regulator expects in a remediation plan, how a project status report should land with a steering committee, or what "good" looks like when a compliance officer reviews a policy document.

**Our solution:**

openEXPERT bridges that gap by giving AI what every talented graduate needs when they enter the real world: **proper professional training**. We've taught it how 240 different tasks actually work — not in theory, but in practice. We've defined what should be done, what a good outcome looks like, who the relevant experts are, and how experienced professionals structure their thinking.

The result is not just a tool — it's a **new way of collaborating with AI** that works whether you're deeply technical or have never written a prompt in your life.

---

### Why It Matters

Everyone talks about how AI will change work. But there's a gap between promise and reality:

1. **The knowledge gap:** Most people lack the AI expertise to craft effective prompts
2. **The time gap:** Even experts don't have hours to provide perfect context
3. **The trust gap:** How do you know if AI output is actually good?
4. **The safety gap:** Where does my data go? Who can see it?
5. **The governance gap:** How do we ensure quality and compliance at scale?

**openEXPERT closes all five gaps:**

- ✅ **Knowledge gap:** Pre-configured modules with expert-level prompts
- ✅ **Time gap:** Ready to use in minutes, not hours
- ✅ **Trust gap:** Quality scoring, human review workflows, compliance checks
- ✅ **Safety gap:** Runs locally on your machine; data never leaves
- ✅ **Governance gap:** Built-in audit trails, RBAC, budget controls, compliance rules

---

### Key Numbers (Version 2.0)

| Metric | Count | Details |
|--------|-------|---------|
| **Expert Areas** | 29 | From FCP to Healthcare to Personal Development |
| **Modules** | 240 | Pre-configured expert workflows |
| **LLM Providers** | 4 | Claude (primary), GPT, Mistral, Ollama |
| **Output Formats** | 22+ | From executive summaries to RACI matrices |
| **Export Formats** | 5 | Markdown, DOCX, XLSX, PDF, PPTX |
| **Database Tables** | 80+ | Supporting knowledge persistence |
| **API Routes** | 41 | Comprehensive backend services |
| **Pages** | 36 | Complete user workflows |
| **Transformative Features** | 14/14 | All fully implemented |
| **Security Features** | 9 | RBAC, audit, rate limiting, sandboxing, etc. |

---

### Architecture at a Glance

**Frontend:**
- React 18 + TypeScript
- Tailwind CSS + shadcn/ui (professional design system)
- 36 pages covering all workflows
- Dark theme optimized for professionals

**Backend:**
- Node.js + Express
- SQLite with WAL mode (local persistence)
- 53 specialized services
- 41 API routes
- Streaming SSE for real-time responses

**AI Integration:**
- Anthropic Claude (Opus 4.6, Sonnet 4.5, Haiku 4.5) — primary
- OpenAI GPT (GPT-4, GPT-3.5-turbo)
- Mistral (Mistral Large)
- Local Ollama (on-premise models)

**Intelligence Systems:**
- 7-layer prompt builder
- 4-mode knowledge source resolver
- 5-layer cross-workflow intelligence (atoms → graph → patterns → insights)
- Pattern detection engine (5 detector types)
- Quality ratchet (6-dimensional scoring)
- Apprentice model (4-stage learning)

**Governance:**
- Compliance-as-Code (8 seeded rules, extensible)
- Audit logging (every API call tracked)
- RBAC (admin, analyst, user roles)
- Budget management (monthly quotas, enforcement)
- Review workflows (draft → reviewed → approved)

---

### Who Built This?

**Creator:** Daniel Bardun — 14+ years in banking, financial crime prevention, and regulatory consulting at institutions including SEB, Sveriges Riksbank, EY, and Advisense.

**Corporate Entity:** FutureChain AB (intellectual property stewardship)

**Philosophy:** "Start with the problem, not the solution. No magic bullets. No silver boxes. Just the right tools, the right people, and the right plan."

---

### Open Source Philosophy

openEXPERT is **MIT-licensed** because we believe this capability should:
- Power-charge every sector
- Enable more people regardless of budget
- Drive genuine value creation from AI time savings
- Democratize access to expert-level AI assistance

**A student preparing a thesis deserves the same analytical frameworks as a Fortune 500 compliance officer.**

**A small business navigating regulations deserves the same structured guidance as a Big4 client.**

When more people can do more valuable work, everyone benefits.

---

## 2. Who This Is For

openEXPERT serves **five distinct user groups**, each with different needs:

### 2.1 Individuals & Students

**Use Cases:**
- Academic research (literature reviews, methodology design, thesis planning)
- Personal finance (budgeting, tax optimization, retirement planning)
- Career development (CV writing, interview prep, salary negotiation)
- Personal legal matters (tenancy disputes, consumer protection)
- Learning new skills (structured learning paths)

**Why openEXPERT?**
- Free access to expert-level guidance
- Local deployment = privacy
- Learn professional frameworks
- Build reusable knowledge over time

**Key Areas:** Academic Research, Personal Development, Personal Finance, Consumer Legal, Education

---

### 2.2 Small Businesses & Startups

**Use Cases:**
- Business planning (business plans, pitch decks, funding strategy)
- Compliance navigation (GDPR, data protection, contracts)
- Marketing & branding (content strategy, copywriting, brand identity)
- Operations improvement (process optimization, SOP writing)
- HR basics (job descriptions, interview frameworks)

**Why openEXPERT?**
- Affordable alternative to consultants (API costs vs. £150+/hour)
- Professional-quality outputs
- Build institutional knowledge
- Scale as you grow

**Key Areas:** Startups & Entrepreneurship, Legal, Branding, Operations, HR, Accounting

---

### 2.3 Corporates & Enterprises

**Use Cases:**
- Regulatory compliance (gap analyses, policy creation, implementation plans)
- Risk management (ERM frameworks, scenario analysis, 3rd party risk)
- Project management (planning, status reporting, RAID logs)
- Strategy development (market analysis, competitive intelligence)
- Internal audit (audit planning, control testing, findings)

**Why openEXPERT?**
- Enterprise features (RBAC, audit trails, budget controls)
- Multi-user collaboration (assign workflow steps, parallel reviews)
- Knowledge persistence (institutional memory, pattern detection)
- Integration capability (databases, APIs, filesystems)
- Compliance enforcement (automated rule checking)

**Key Areas:** All 29 areas, with emphasis on FCP, Legal, Audit, Risk, Project Management, Strategy

---

### 2.4 Financial Institutions & Banks

**Use Cases:**
- AML/CFT compliance (gap analyses, BWRAs, training, monitoring design)
- Sanctions compliance (screening assessment, policy review, de-risking)
- Regulatory change management (impact assessment, implementation planning)
- Credit risk assessment
- Regulatory reporting
- Model validation

**Why openEXPERT?**
- Built by banking/FCP professionals (14+ years expertise)
- Regulatory knowledge built-in (EBA, FATF, EU regulations)
- Living Regulatory Radar (auto-monitors EBA, ESMA, FATF, EUR-Lex)
- Time Intelligence (deadline tracking, work rhythms)
- Compliance-as-Code (automated regulatory checks)
- Complete audit trails for regulators

**Key Areas:** FCP, Banking, Legal, Risk Management, Audit, Cybersecurity (DORA)

---

### 2.5 Consultants & Professional Services (Big 4, etc.)

**Use Cases:**
- Client engagement delivery (proposals, status reporting, deliverables)
- Quality assurance (peer review, regulatory review, plain language)
- Knowledge management (capture engagement insights, pattern detection)
- Training content creation
- Thought leadership (whitepapers, articles, presentations)
- Efficiency gains (ROI calculation based on hourly rates)

**Why openEXPERT?**
- Productivity multiplier (modules replace manual templates)
- Quality consistency (quality ratchet ensures standards)
- Knowledge capture (institutional memory learns from every project)
- Cross-engagement insights (pattern detection across clients)
- Professional export formats (client-ready DOCX, XLSX, PDF)
- Apprentice model (trains junior staff on firm standards)

**Key Areas:** Consulting, FCP, Legal, Audit, Risk, Strategy, all industry verticals

---

### Unified Value Propositions

**For Everyone:**
- ✅ **Local-first** — Your data stays on your machine
- ✅ **Transparent** — See exactly how AI thinks (3 transparency levels)
- ✅ **Safe** — No cloud dependencies for core functionality
- ✅ **Affordable** — Open source + bring your own API key (~$0.05-$2 per session)
- ✅ **Customizable** — Build your own modules, share with community

**For Organizations:**
- ✅ **Governable** — Audit trails, RBAC, compliance rules
- ✅ **Scalable** — Multi-user, workflow automation, scheduling
- ✅ **Intelligent** — Learns from your decisions, detects patterns
- ✅ **Secure** — Sandboxing, rate limiting, budget enforcement
- ✅ **Collaborative** — Multi-human workflows, parallel reviews

---

## 3. Why openEXPERT?

### 3.1 Transparency You Can Trust

**Problem:** Most AI tools are black boxes. You don't know how they arrived at conclusions, what sources they used, or what assumptions they made. This is unacceptable in regulated industries and high-stakes decisions.

**openEXPERT Solution:**

**Three Transparency Levels:**

1. **Level 0: Output Only** — Clean final output (fastest, cheapest)
2. **Level 1: Show Thinking** — See AI's reasoning process, key decisions, assumptions
3. **Level 2: Deep Trace** — Complete thinking log, source citations, confidence levels

**Usage:** Toggle transparency level per session. Use Level 0 for routine tasks, Level 2 for regulatory submissions.

**Implementation:**
- Claude's extended thinking captured in `thinking_content` field
- Stored in `messages` table for audit trail
- Rendered in collapsible panels in UI
- Exportable to all formats

**Benefit:** **Regulatory confidence** — Show regulators exactly how AI reached conclusions.

---

### 3.2 Security & Data Safety

**Problem:** Cloud AI tools require you to send sensitive client data, regulatory documents, and confidential analyses to third-party servers. Data residency, GDPR compliance, and client confidentiality are at risk.

**openEXPERT Solution:**

**Local-First Architecture:**
- ✅ Application runs on your machine (`localhost`)
- ✅ Database is local SQLite file (no cloud dependencies)
- ✅ Documents stay in your filesystem
- ✅ Only API requests to LLM providers leave your network
- ✅ No openEXPERT cloud service collecting data

**What Leaves Your Machine:**
- Prompts sent to Claude/GPT/Mistral APIs (encrypted HTTPS)
- Web search queries (if enabled)

**What Stays Local:**
- All documents and uploads
- Session history and outputs
- Knowledge graph and patterns
- User profiles and preferences
- Audit logs

**Multi-User Security:**
- RBAC with 3 roles (admin, analyst, user)
- Session isolation per user
- Failed login tracking
- Security event logging
- Budget enforcement per user

**Connection Sandboxing:**
- Script execution limits (memory, runtime, network)
- Database connection approval workflow
- Execution audit logs

**Benefit:** **Complete data control** — Meet GDPR, ISO 27001, and client confidentiality requirements.

---

### 3.3 Quality & Governance

**Problem:** AI output quality is inconsistent. Without oversight, errors slip through, citations are missing, and outputs don't meet organizational standards.

**openEXPERT Solution:**

**Quality Ratchet (6-Dimensional Scoring):**
- Completeness (coverage of topic)
- Accuracy (factual correctness)
- Structure (logical organization)
- Actionability (implementable recommendations)
- Citations (regulatory references)
- Overall composite score

**Compliance-as-Code:**
- 8 seeded rules (token limits, quality standards, model whitelist, citation requirements, etc.)
- Automated rule execution on every session
- Violation tracking with remediation workflow
- Custom rule creation (threshold, pattern, composite, lookup rules)

**Human Review Workflows:**
- Review status: draft → reviewed → approved
- Reviewer attribution and timestamps
- Parallel reviews with consensus requirement
- Review mode selection (quality, regulatory, technical, communication, red team, plain language)

**Apprentice Model:**
- Learns from your decisions over time
- Progresses: Observer → Guided → Supervised → Autonomous
- Suggests improvements based on past sessions

**Benefit:** **Consistent quality** — Organizational standards enforced automatically.

---

### 3.4 Intelligence & Learning

**Problem:** Most AI tools treat every session as isolated. They don't learn from your decisions, detect patterns across projects, or build institutional knowledge.

**openEXPERT Solution:**

**Institutional Memory Engine:**
- Captures every checkpoint decision (AI recommendation vs. human choice)
- Retrieves similar past decisions for context
- Analyzes override patterns (are humans consistently rejecting AI on specific topics?)
- Surfaces decision-making biases

**Cross-Workflow Intelligence (5-Layer Funnel):**

1. **Layer 1: Raw Workflow Outputs** — Every output stored
2. **Layer 2: Knowledge Atoms** — Discrete facts extracted and tagged
3. **Layer 3: Knowledge Graph** — Entities and relationships mapped
4. **Layer 4: Pattern Detection** — 5 detector types find cross-workflow insights
5. **Layer 5: Actionable Intelligence** — Insights surfaced on dashboard

**Pattern Detection Types:**
- Temporal Correlation (events co-occurring)
- Entity Convergence (same entities appearing together)
- Cascade Detection (sequential patterns)
- Trend Divergence (anomalies)
- Gap Detection (missing coverage)

**Benefit:** **Organizational learning** — System gets smarter with every use.

---

### 3.5 Automation & Collaboration

**Problem:** Most AI tools are single-user, single-task. They don't support multi-step workflows, team collaboration, or automation.

**openEXPERT Solution:**

**Workflow Automation:**
- Multi-step workflow builder (modules, API calls, database queries, scripts)
- Checkpoint decision points (human-in-the-loop)
- Branching logic (conditional paths)
- Cron-based scheduling (automated recurring tasks)
- Status tracking (pending, running, paused, completed, failed)

**Collaborative Canvas:**
- Assign workflow steps to team members
- SLA tracking with overdue detection
- Parallel multi-reviewer consensus
- Canvas comments (threaded discussions)
- Status transitions (pending → in_progress → completed)

**Time Intelligence:**
- Regulatory deadline tracking
- Dependency mapping (task X blocks task Y)
- Buffer calculation (preparation days, review days)
- Work rhythm definitions (recurring cycles)
- Overdue/at-risk alerts

**Living Regulatory Radar:**
- Auto-monitors 5 sources (EBA, ESMA, FATF, EUR-Lex, ECB)
- AI-powered scoring (relevance, urgency, impact)
- Item lifecycle (new → reviewed → actioned → dismissed)
- Consultation period tracking

**Benefit:** **Operational efficiency** — Automate recurring compliance work.

---

### 3.6 Multi-LLM Flexibility

**Problem:** Vendor lock-in to a single AI provider. If Claude is down, you're stuck. If a new model is better for a specific task, you can't use it.

**openEXPERT Solution:**

**Provider-Agnostic Architecture:**
- ✅ **Anthropic Claude** (primary) — Opus 4.6, Sonnet 4.5, Haiku 4.5
- ✅ **OpenAI GPT** — GPT-4, GPT-3.5-turbo
- ✅ **Mistral** — Mistral Large
- ✅ **Local Ollama** — On-premise models (Llama, Mistral, etc.)

**Unified Interface:**
- Same prompt assembly works across all providers
- Provider-specific optimizations (adaptive thinking for Claude, seed for GPT/Mistral)
- Cost tracking per provider
- Token counting per provider
- Streaming support across all

**Benefit:** **No vendor lock-in** — Switch models based on task, cost, or availability.

---

### 3.7 Customization & Community

**Problem:** Pre-built modules don't cover every niche. You need to build your own, but starting from scratch is hard.

**openEXPERT Solution:**

**Build Your Own Module:**
- Visual module builder (no coding required)
- System prompt editor with guidance
- Config presets (thinking level, creativity, output formats)
- Test interface (validate before sharing)

**Community Module Sharing:**
- Mark modules as "shared with community"
- Browse community modules by area
- Fork and customize others' modules
- Rate and review

**Skills Library:**
- 50+ pre-built skills (regulatory frameworks, methodologies, templates)
- Community skill submission
- Attach skills to any module
- Reusable across areas

**Benefit:** **Infinite extensibility** — Build exactly what you need, share with others.

---

## 4. Important Notices

### Not Regulated Financial or Legal Advice

openEXPERT produces analytical outputs based on AI models and the information you provide. It is **not** a substitute for regulated financial advice, legal counsel, medical diagnosis, or professional services in regulated domains.

**Always:**
- Review AI-generated outputs before using them for decisions
- Consult qualified professionals for regulated advice
- Verify facts, citations, and recommendations
- Use human judgment in high-stakes contexts

**openEXPERT is a tool for analysis, research, and productivity — not a replacement for human expertise in regulated contexts.**

---

### Data Privacy & Security

**Your data stays local.** openEXPERT runs on your machine. Your documents, session history, and outputs are stored in a local SQLite database.

**What leaves your machine:**
- Prompts and context sent to LLM APIs (Claude, GPT, Mistral) via encrypted HTTPS
- Web search queries (if web search is enabled)

**Review each LLM provider's privacy policy:**
- Anthropic: https://www.anthropic.com/privacy
- OpenAI: https://openai.com/privacy
- Mistral: https://mistral.ai/privacy

**For maximum privacy:**
- Use local Ollama models (no data leaves your network)
- Disable web search
- Don't use online reference URLs that require authentication

---

### Open Source License (MIT)

openEXPERT is MIT-licensed. You are free to:
- Use commercially
- Modify and redistribute
- Build proprietary services on top
- Contribute improvements back to the community

**Attribution appreciated but not required.**

---

### API Costs

openEXPERT is **free software**. You pay only for AI API usage:

**Typical costs (February 2026):**
- Claude Opus 4.6: ~$15/M input tokens, ~$75/M output tokens
- Claude Sonnet 4.5: ~$3/M input, ~$15/M output
- Claude Haiku 4.5: ~$0.25/M input, ~$1.25/M output
- GPT-4: ~$10/M input, ~$30/M output
- Mistral Large: ~$4/M input, ~$12/M output
- Local Ollama: Free (runs on your hardware)

**Session cost examples:**
- Quick question (Haiku, 5k tokens): ~$0.01
- Standard analysis (Sonnet, 40k tokens): ~$0.60
- Deep investigation (Opus, 150k tokens, extended thinking): ~$3-5

**Budget Management:**
- Set monthly quotas per user
- 80% threshold alerts, 100% enforcement
- Cost estimation before running
- Monthly usage summaries

---

### System Requirements

**Minimum:**
- Node.js 18+
- 4 GB RAM
- 2 GB disk space
- Modern web browser (Chrome, Firefox, Edge, Safari)

**Recommended:**
- Node.js 20+
- 8 GB RAM
- 10 GB disk space (for document storage, knowledge graph)
- SSD for database performance

**Supported OS:**
- macOS 10.15+
- Windows 10+
- Linux (Ubuntu 20.04+, Debian, Fedora, etc.)

---

### Support & Community

**Documentation:** This whitepaper + inline help tooltips

**GitHub:** https://github.com/danielbardun/openexpert

**Issues:** Report bugs and feature requests on GitHub

**Community:** Contribute modules, skills, translations

**Enterprise Support:** Contact via GitHub for consulting/implementation services

---

## Section 4.5: Implementation Status & Transparency

**Open source thrives on honesty.** Rather than claiming everything is "done," we're showing you exactly what works today, what's in progress, and what's planned. This transparency helps you make informed decisions about adopting openEXPERT.

---

### Implementation Status Legend

- ✅ **FULLY IMPLEMENTED** — Complete with UI, backend, database, and testing
- 🟢 **CORE IMPLEMENTED** — Main functionality working, advanced features in progress
- 🟡 **PARTIAL** — Basic UI/routes exist, full implementation in progress
- 📋 **PLANNED** — Designed and specified, development scheduled

---

### Status by Feature Category

#### **CORE PLATFORM** ✅ FULLY IMPLEMENTED

**What's working:**
- React 18 + TypeScript frontend (36 pages, 158 component files)
- Express + Node.js backend (53 services, 41 route modules with ~224 HTTP endpoints)
- SQLite persistence with 82 tables across 16 functional groups
- Multi-LLM support: Claude (Opus/Sonnet/Haiku), GPT-4/3.5, Gemini, Mistral, Ollama
- **238 expert modules** across **29 areas**
- 5 export formats: Markdown, DOCX, XLSX, PDF, PPTX
- Security: JWT auth, rate limiting, Helmet, CORS, HTTPS
- Local-first architecture (all data stays on your machine)

**Evidence:** Run `pnpm run dev` and browse to http://localhost:5173 — full platform loads

---

#### **INTERACTION MODES** ✅ FULLY IMPLEMENTED

All 7 interaction modes are production-ready:

1. **Standard Module Workspace** ✅
   - Full configuration panel (thinking, creativity, model, knowledge sources)
   - Output format selector (20 formats)
   - Streaming responses with thinking display
   - Export bar, version history, continue conversation

2. **Brief Me (Quick Questions)** ✅
   - Zero-configuration entry point
   - Type question → Anton infers best module → responds
   - Implemented: `src/pages/BriefMePage.tsx` (functional)

3. **Guide Me (Wizard)** ✅
   - 3-step wizard: "What do you need?" → Output type → Your role
   - Module recommendations with reasoning
   - Implemented: `src/pages/GuideMePage.tsx` (functional)

4. **Batch Create** ✅
   - CSV upload → variable substitution → N outputs
   - Progress tracking, bulk export
   - Implemented: `src/pages/BatchCreatePage.tsx` (functional)

5. **Workflow Builder** ✅
   - Visual workflow builder with 12 step types
   - Scheduling (manual, daily, weekly, monthly, cron)
   - Implemented: `src/pages/WorkflowBuilder.tsx` + execution engine

6. **Collaborative Canvas** ✅
   - Multi-user shared workspace
   - Real-time comments, suggestions, approvals
   - Implemented: `src/pages/SoundingBoardPage.tsx` + `canvas-*` backend services

7. **Review Engine** ✅
   - 5 review modes: Devil's Advocate, Systems Thinking, Pragmatist, Optimist, Technical
   - Integrated into workflow
   - Implemented: `src/pages/ReviewEnginePage.tsx` + review orchestrator

**Status:** All modes functional and accessible from navigation.

---

#### **KNOWLEDGE SOURCE SYSTEM** ✅ FULLY IMPLEMENTED

**4-Mode Knowledge Sources:**

1. ✅ **Mode 1: Claude Knowledge + Web Search**
   - Claude's built-in knowledge (cutoff: January 2025)
   - Web search tool enabled via Anthropic API
   - Focus area configuration

2. ✅ **Mode 2: Online Reference Links**
   - Paste URLs → server fetches → includes in context
   - Summary vs. full text extraction
   - EUR-Lex integration for regulatory texts

3. ✅ **Mode 3: Local Folder Integration**
   - Register local folders
   - File browser with preview
   - Auto-extraction (PDF, DOCX, XLSX, TXT, MD)
   - Recursive folder support

4. ✅ **Mode 4: Combined Mode**
   - Simultaneous use of multiple modes
   - Priority configuration (local-first, claude-first, merged)
   - Token budget management (180k limit handling)

**Implementation:** `src/components/shared/KnowledgeSourcePanel.tsx` + `server/services/knowledge-resolver.ts`

---

#### **7-LAYER PROMPT SYSTEM** ✅ FULLY IMPLEMENTED

All 7 layers are composed and injected:

1. ✅ **Layer 1: System Foundation** — ANTON behavioral principles
2. ✅ **Layer 2: Area Context** — Domain background (FCP, Legal, Audit, etc.)
3. ✅ **Layer 3: Module Expertise** — Task-specific methodology
4. ✅ **Layer 4: Persona & Expert Role** — "You are a [domain] expert..."
5. ✅ **Layer 5: Skills Library** — Reusable prompt fragments (devil's advocate, systems thinking, etc.)
6. ✅ **Layer 6: Knowledge Sources** — Resolved context from 4 modes
7. ✅ **Layer 7: Transparency** — "Show your reasoning," "Explain uncertainties"

**Implementation:** `server/services/prompt-builder.ts` (126 lines)

---

#### **MULTI-LLM ARCHITECTURE** ✅ FULLY IMPLEMENTED

**Supported providers (5):**

| Provider | Models | Status |
|----------|--------|--------|
| **Anthropic Claude** | Opus 4.6, Sonnet 4.6, Sonnet 4.5, Haiku 4.5 | ✅ Full support + prompt caching |
| **OpenAI GPT** | GPT-4, GPT-4 Turbo, GPT-3.5 Turbo | ✅ Full support + seed parameter |
| **Google Gemini** | Gemini 2.0 Flash | ✅ Full support |
| **Mistral** | Mistral Large | ✅ Full support + seed parameter |
| **Ollama (Local)** | Any Ollama model (Mistral, Llama, Qwen) | ✅ Full support, $0 API cost |

**Features:**
- Provider-agnostic design (unified adapter pattern)
- Cost tracking per provider
- Streaming support across all
- Model fallback configuration

**Implementation:** `server/services/unified-llm-client.ts` + `model-adapter.ts`

---

#### **AUTHENTICATION & RBAC** ✅ FULLY IMPLEMENTED

**With v2.0 enhanced database:**

- ✅ User accounts (username, email, password_hash)
- ✅ 3 default roles: **admin**, **analyst**, **user**
- ✅ 24 permissions across 7 resource types
- ✅ Role-permission matrix
- ✅ JWT-based authentication
- ✅ Failed login tracking
- ✅ Security event logging

**Tables:** `users`, `roles`, `permissions`, `user_roles`, `role_permissions`

**Status:** RBAC fully functional with enhanced schema (82 tables)

---

#### **EXPORT SYSTEM** ✅ FULLY IMPLEMENTED

All 5 formats production-ready:

1. ✅ **Markdown (.md)** — Native, always available
2. ✅ **DOCX** — Advisense branding, heading hierarchy, TOC
3. ✅ **XLSX** — Conditional formatting, formulas, charts
4. ✅ **PDF** — Professional typography, branded header/footer
5. ✅ **PPTX** — Slide generation with speaker notes

**Implementation:** `server/services/export-{docx,xlsx,pdf,pptx}.ts`

**Dependencies:** `docx` ^9.5.3, `exceljs` ^4.4.0, `pptxgenjs` ^4.0.1, `pdfkit` ^0.17.2

---

#### **INTELLIGENCE FEATURES** 🟢 CORE IMPLEMENTED

These features are **functional** but have room for expansion:

**✅ Institutional Memory**
- ✅ Checkpoint decision logging
- ✅ Similarity matching (basic algorithm)
- ✅ Historical context display
- ✅ Override tracking
- 🟡 Advanced semantic search (in progress)
- 📋 Feedback loop learning (planned Q2 2026)

**Implementation:** `server/services/institutional-memory.ts` + `IntelligenceDashboard.tsx`

**Status:** Core working — you can checkpoint decisions and retrieve similar past decisions.

---

**✅ Cross-Workflow Intelligence**
- ✅ Knowledge atom extraction (facts, insights, conclusions)
- ✅ Entity extraction (clients, regulations, controls, risks, people, systems)
- ✅ Pattern detection (5 detector types configured)
- 🟡 Full knowledge graph visualization (basic implementation)
- 🟡 Advanced pattern analytics dashboard (in progress)

**Tables:** `knowledge_atoms`, `entity_nodes`, `entity_relationships`, `detected_patterns` (all present in enhanced schema)

**Implementation:** `server/services/{atom-extractor,knowledge-graph,pattern-detection}.ts`

**Status:** Extraction and detection working. Full analytics dashboard expanding.

---

**✅ Knowledge Graph**
- ✅ Entity extraction from sessions
- ✅ 11 entity types, 10 relationship types
- ✅ Entity mention tracking
- ✅ Alias management
- ✅ Basic graph queries (subgraph, path finding)
- 🟡 Interactive graph visualization (basic D3 implementation)
- 📋 Advanced graph analytics (centrality, clustering) — planned Q3 2026

**Implementation:** `src/pages/KnowledgeGraphPage.tsx` + `server/services/knowledge-graph.ts`

**Status:** Core graph engine working. Visualization usable but expanding.

---

**✅ Pattern Detection Engine**
- ✅ 5 detectors configured:
  1. Temporal Correlation ✅
  2. Entity Convergence ✅
  3. Cascade Detection ✅
  4. Trend Divergence 🟡 (basic)
  5. Gap Detection 🟡 (basic)
- ✅ Pattern storage and alerts
- ✅ Resolution workflow
- 🟡 Scheduled detector runs (manual trigger working, auto-schedule in progress)

**Implementation:** `server/services/pattern-detection.ts`

**Status:** 3 of 5 detectors fully working, 2 in progress.

---

**✅ Quality Ratchet**
- ✅ 6-dimensional scoring (Completeness, Accuracy, Structure, Actionability, Citations, Overall)
- ✅ Baseline setting
- ✅ Quality evolution tracking
- ✅ Deterioration alerts
- 🟡 Automated re-scoring suggestions (in progress)

**Implementation:** `server/services/quality-ratchet.ts` + `QualityPage.tsx`

**Status:** Scoring working, evolution tracking basic.

---

**✅ Apprentice Model**
- ✅ 4-stage progression tracking (Observer → Guided → Supervised → Autonomous)
- ✅ Stage advancement criteria
- ✅ Confidence scoring per output
- ✅ Override logging
- 🟡 Automatic stage progression (manual promotion working, auto in progress)

**Implementation:** `server/services/apprentice.ts` + `ApprenticePage.tsx`

**Status:** Stage tracking working, auto-advancement in progress.

---

**✅ Output Versioning & Diff Engine**
- ✅ Version capture on every edit
- ✅ Side-by-side diff viewer
- ✅ Revert to any version
- ✅ Version history timeline

**Implementation:** `server/services/version-diff.ts` + `VersionHistoryPage.tsx`

**Status:** Fully functional.

---

#### **AUTOMATION FEATURES** 🟡 PARTIAL

**✅ Workflow Automation**
- ✅ 12 step types (LLM, wait, approval, email, webhook, extract, transform, conditional, parallel, loop, export, review)
- ✅ Visual workflow builder
- ✅ Manual execution
- ✅ Parallel/sequential step execution
- 🟡 Scheduled execution (cron support added, robustness testing in progress)
- 🟡 Workflow monitoring dashboard (basic)

**Implementation:** `src/pages/{WorkflowBuilder,WorkflowMonitor,WorkflowsPage}.tsx` + execution engine

**Status:** Core working, scheduling robust-ifying.

---

**🟡 Time Intelligence**
- ✅ Deadline tracking (regulatory, project, milestone)
- ✅ Deadline alerts (upcoming, overdue)
- ✅ Time estimate logging
- 🟡 Capacity planning (basic implementation)
- 📋 Resource allocation optimization (planned Q3 2026)

**Implementation:** `server/services/time-intelligence.ts` + `DeadlinesPage.tsx`

**Status:** Deadline management working, capacity planning expanding.

---

**🟡 Regulatory Radar**
- ✅ Radar item tracking (regulations, consultations, guidelines)
- ✅ Manual item addition
- ✅ Subscription management (jurisdiction, topic, keyword)
- 🟡 Automated monitoring (EUR-Lex integration working, auto-check scheduler in progress)
- 🟡 Change detection (basic)
- 📋 Impact alerts (planned Q2 2026)

**Implementation:** `server/services/regulatory-radar.ts` + `RadarPage.tsx`

**Status:** Manual tracking working, automation expanding.

---

**🟡 Compliance-as-Code**
- ✅ 8 seeded compliance rules
- ✅ Rule violation detection
- ✅ Violation logging
- 🟡 Rule builder UI (basic form working, visual builder in progress)
- 📋 Automated rule testing (planned Q3 2026)

**Implementation:** `server/services/compliance-rules.ts` + `CompliancePage.tsx`

**Status:** Rules execute, builder UI expanding.

---

#### **PLANNED FEATURES** 📋

These are **designed** with database tables created, but full implementation scheduled:

**📋 What-If Simulator** (Q2 2026)
- Database: Workflow engine ready
- UI: Scenario comparison interface planned
- Use case: "What if we change this assumption? How does the output differ?"

**📋 Multi-Tenant SaaS** (Q3 2026)
- Database: User/team isolation ready
- Backend: Tenant routing planned
- UI: Tenant admin portal planned

**📋 Mobile Applications** (Q4 2026)
- React Native codebase
- iOS + Android native apps
- Offline mode with sync

**📋 Blockchain Audit Trail** (2027+)
- Immutable audit log
- Smart contract integration
- Regulatory compliance proof

**📋 Federated Learning** (2027+)
- Learn from multiple instances without data sharing
- Privacy-preserving model improvement

---

### Why This Transparency Matters

**For individuals:** You know exactly what you're getting today vs. what's coming.

**For enterprises:** You can plan adoption roadmaps knowing what's production-ready vs. beta.

**For contributors:** You know where to focus development effort.

**For reviewers:** You can verify claims against actual code (it's all open source).

---

### How to Verify Claims

Everything above is verifiable:

1. **Clone the repo:**
   ```bash
   git clone https://github.com/danielbardun/openexpert
   cd openexpert
   ```

2. **Check file counts:**
   ```bash
   find src/pages -name "*.tsx" | wc -l          # 36 pages
   find server/services -type f | wc -l          # 53 services
   find server/routes -name "*.ts" | wc -l       # 41 route files
   ```

3. **Check database schema:**
   ```bash
   grep "CREATE TABLE" server/db/schema_enhanced.sql | wc -l  # 82 tables
   ```

4. **Check module count:**
   ```bash
   grep "id: '" src/lib/constants.ts | grep -v "//" | wc -l  # 238 modules
   ```

5. **Run the platform:**
   ```bash
   pnpm install
   pnpm run db:init:enhanced
   pnpm run dev
   # Open http://localhost:5173
   ```

---

### Summary: What You Get Today

**Production-Ready (80% of features):**
- All interaction modes
- All 238 modules across 29 areas
- Multi-LLM architecture
- Export system (5 formats)
- RBAC and security
- Knowledge source system
- 7-layer prompts
- Output versioning

**Core Working, Expanding (15% of features):**
- Intelligence features (memory, graph, patterns, quality, apprentice)
- Automation (workflows, time intelligence, radar, compliance-as-code)

**Designed, Development Scheduled (5% of features):**
- What-If Simulator UI
- Advanced analytics
- Mobile apps
- Multi-tenant SaaS
- Blockchain audit trail

**The platform is genuinely usable today.** The roadmap shows how much further we're going.

---

**Next:** Section 5 dives into the Seven-Layer Prompt Builder system.

---

## PART 2: CORE ARCHITECTURE

## 5. How It Works: The Seven-Layer Prompt Builder

The quality of AI output depends on the quality of the prompt. openEXPERT uses a **seven-layer prompt assembly system** that combines general AI capabilities with domain expertise, organizational context, and user preferences.

### Overview

Each layer adds specific knowledge or configuration:

1. **System Foundation** — Core behavioral principles
2. **Area Context** — Domain-specific background
3. **Module Expertise** — Specific task methodology
4. **Persona Injection** (optional) — Expert perspective
5. **Skills Attachment** (optional) — Reusable frameworks
6. **Knowledge Source Integration** — Reference material
7. **Transparency & Reasoning** — How AI thinks

---

### Layer 1: System Foundation

**Purpose:** Establish core behavioral principles for all modules

**Content:**
- Analytical rigor standards
- Professional tone guidelines
- Citation requirements
- Uncertainty acknowledgment protocols
- Output structure expectations

**Implementation:** `server/areas/system-foundation.md`

**Example:**
```markdown
You are ANTON, an AI expert assistant built into openEXPERT. You provide professional-grade analysis across 29 domains.

Core principles:
1. Accuracy over speed — verify before asserting
2. Cite regulatory sources with article numbers
3. Flag assumptions and limitations explicitly
4. Structure outputs for executive readability
5. Maintain professional tone unless user specifies otherwise
```

**Why it matters:** Ensures every module follows organizational quality standards.

---

### Layer 2: Area Context

**Purpose:** Provide domain-specific background for each expert area

**Content:**
- Industry standards and frameworks
- Common methodologies
- Regulatory landscape overview
- Key terminology
- Typical stakeholders

**Implementation:** `server/areas/{area-id}/area-context.md` (one per area)

**Example (FCP Area):**
```markdown
Financial Crime Prevention (FCP) covers AML/CFT, sanctions compliance, fraud detection, and KYC/CDD.

Key regulations: EU AML Directive (6AMLD), AMLR 2024/1624, AMLA, Sanctions Regulation 833/2014, EBA Guidelines.

Methodologies: Risk-Based Approach (RBA), Know Your Customer (KYC), Customer Due Diligence (CDD), Enhanced Due Diligence (EDD), Transaction Monitoring (TM), Suspicious Activity Reporting (SAR/STR).

Stakeholders: MLROs, Compliance Officers, Front-line staff, Board Risk Committees, FIUs, Regulators.
```

**Why it matters:** AI needs to "speak the language" of the domain.

---

### Layer 3: Module Expertise

**Purpose:** Define the specific task, expected output structure, and quality criteria

**Content:**
- Task definition and objectives
- Input requirements
- Step-by-step methodology
- Output structure template
- Quality checklist
- Common pitfalls to avoid

**Implementation:** `server/areas/{area-id}/modules/{module-id}/system-prompt.md`

**Example (AMLR Gap Analysis):**
```markdown
# AMLR Gap Analysis Module

## Objective
Systematically compare an institution's current AML/CFT framework against EU AMLR 2024/1624 requirements, producing a scored gap matrix and prioritized action plan.

## Methodology
1. Extract regulatory requirements from AMLR
2. Map requirements to institution's current controls
3. Score each requirement: Compliant (Green), Partial (Yellow), Gap (Red)
4. Assess materiality and urgency
5. Prioritize remediation based on risk

## Output Structure
- Executive Summary (1-2 pages, board-ready)
- Gap Scoring Matrix (tabular, RAG-rated)
- Detailed Findings (per requirement with evidence)
- Prioritized Action Plan (who, what, when, effort)
```

**Why it matters:** This is the "expert training" that teaches AI how professionals actually perform the task.

---

### Layers 4-7: Configuration & Context

**Layer 4: Persona Injection** — Add specific expert perspective (optional)

**Layer 5: Skills Attachment** — Inject reusable frameworks/methodologies (optional)

**Layer 6: Knowledge Source Integration** — Provide reference documents (4 modes, see Section 6)

**Layer 7: Transparency & Reasoning** — Control thinking depth and creativity (see Section 5.7)

---

### How Layers Combine

When a user runs a module, all layers are assembled into a single comprehensive prompt:

```
System Prompt:
┌─────────────────────────────────┐
│ Layer 1: System Foundation      │
│ Layer 2: Area Context           │
│ Layer 3: Module Expertise       │
│ Layer 4: Persona (if selected)  │
│ Layer 5: Skills (if attached)   │
│ Layer 6: Knowledge Sources      │
│ Layer 7: Reasoning Config       │
└─────────────────────────────────┘

User Message:
"Please conduct a gap analysis of our AML policy..."
```

**Result:** AI has everything it needs to produce professional-grade output matching organizational standards.

---

## 6. Knowledge Source System (4 Modes)

This is Layer 6 of the prompt builder — where AI gets its reference material.

### Mode 1: Claude's Knowledge + Web Search

**What:** Claude's training data (up to early 2024) + optional real-time web search

**When to use:**
- General regulatory knowledge
- Latest publications (EBA consultations, FATF statements)
- Market research

**Configuration:**
```json
{
  "claudeKnowledge": {
    "enabled": true,
    "webSearchEnabled": true,
    "description": "AMLR Regulation 2024/1624, EBA consultation papers on AMLR"
  }
}
```

**Implementation:**
- Adds `web_search` tool to Claude API request
- AI decides when to search based on query
- Results appear in streaming response
- Citations automatically included

**Cost:** ~500-2000 additional output tokens per search

---

### Mode 2: Online Reference Links

**What:** Server-side fetching of specific URLs (regulations, documents, web pages)

**When to use:**
- EUR-Lex regulation URLs
- Publicly accessible guidance documents
- Online knowledge bases

**Configuration:**
```json
{
  "onlineReference": {
    "enabled": true,
    "urls": ["https://eur-lex.europa.eu/eli/reg/2024/1624/oj"],
    "fetchDepth": "full"
  }
}
```

**Implementation:**
- Server fetches URL content
- Extracts text (HTML parsing for web pages, pdf-parse for PDFs)
- Appends to system prompt with source attribution
- Summary mode (5k tokens) vs. full text

**Limitations:** Cannot access authenticated content (Google Docs with login, corporate intranets)

---

### Mode 3: Local Folder Integration

**What:** Index local folders, extract text from all documents, include in context

**When to use:**
- Client engagement folders (policies, procedures)
- Downloaded regulations
- Historical analyses

**Configuration:**
```json
{
  "localFolder": {
    "enabled": true,
    "folderPaths": ["/Users/daniel/Advisense/Regulations/AMLR"],
    "recursive": true,
    "fileFilter": [".pdf", ".docx", ".xlsx", ".txt", ".md"]
  }
}
```

**Implementation:**
1. Folder registration (saved to database)
2. Recursive scanning
3. Text extraction per file type (pdf-parse, mammoth, xlsx libraries)
4. Append to system prompt
5. Token counting with 180k limit enforcement

**Security:**
- Path traversal protection
- No folder access outside user-selected paths
- Extracted text not stored (on-demand only)

---

### Mode 4: Combined Mode

**What:** Local documents + Claude knowledge + web search simultaneously

**When to use:** Gap analyses (compare client docs against regulations)

**Configuration:**
```json
{
  "combinedMode": {
    "enabled": true,
    "priority": "local_first",
    "instructions": "Compare client AML policy against AMLR. Where client is silent, identify the gap."
  }
}
```

**Priority options:**
- `local_first`: Ground in client docs, fill gaps with AI knowledge
- `claude_first`: Start from regulatory requirements, assess client docs
- `merged`: Treat all sources equally, cross-reference

---

### Token Management

**Challenge:** 180k token limit (Claude Opus 4.6)

**Solution:**
1. Real-time token counting during indexing
2. Warning at 150k (~83%)
3. Error at 180k (prevents API rejection)
4. User can deselect files or switch to summary mode
5. Auto-summarize large files if needed

**Display:** "Loaded: 87,450 tokens / 180,000 (48%)"

---

## 7. Multi-LLM Architecture

openEXPERT supports **four AI providers** with seamless switching.

### Supported Providers

#### 1. Anthropic Claude (Primary)

**Models:**
- `claude-opus-4-6` — Most capable, best for regulatory work
- `claude-sonnet-4-5-20250929` — Balanced cost/performance
- `claude-haiku-4-5-20251001` — Fast, cheap, simple tasks

**Features:**
- Adaptive thinking with `effort` parameter
- Native web search tool
- Prompt caching (90% cost reduction on repeated context)

**Cost (Feb 2026):**
- Opus: ~$15/M input, ~$75/M output
- Sonnet: ~$3/M input, ~$15/M output
- Haiku: ~$0.25/M input, ~$1.25/M output

---

#### 2. OpenAI GPT

**Models:**
- `gpt-4-turbo` — 128k context, vision support
- `gpt-3.5-turbo` — Fast, cheap, 16k context

**Features:**
- Seed parameter for reproducible outputs
- Function calling

**Cost:** ~$10/M input, ~$30/M output (GPT-4)

---

#### 3. Mistral

**Models:**
- `mistral-large-2411`

**Features:**
- EU data residency (Mistral is EU-based)
- Seed parameter for reproducibility

**Cost:** ~$4/M input, ~$12/M output

---

#### 4. Local Ollama

**Models:** Any Ollama-compatible model (Llama, Mistral, Gemma, etc.)

**Features:**
- Runs locally (no API costs)
- Complete data privacy (nothing leaves network)
- Offline capability

**Requirements:** Ollama installed, GPU recommended (16+ GB VRAM)

---

### Provider-Agnostic Design

**Unified interface:** Same module configuration works across all providers

**Adapter layer:** Translates openEXPERT settings to provider-specific API parameters

**Example:**

| openEXPERT | Claude Opus 4.6 | GPT/Mistral |
|------------|-----------------|-------------|
| `thinking: "investigate"` | `effort: "max"` | 32,768 token budget |
| `creativity: "strict"` | Prompt: "Precise, factual..." | Prompt: "Precise, factual..." |

**Result:** User switches models without reconfiguring modules

---

### Cost Tracking

Every API call logged to `audit_log` with:
- Provider (anthropic, openai, mistral, ollama)
- Model
- Input/output/cached tokens
- Estimated cost (calculated server-side)

**Dashboard:** Monthly usage per provider, cost trends

---

### Prompt Caching (Claude Only)

**What:** Cache large, repeated system prompts to reduce costs ~90%

**How:**
- First request: Full input cost + cache creation (~25% of input)
- Subsequent requests (within 5 minutes): Cached sections billed at ~10%

**Savings example:**
- 80k regulation text in knowledge sources
- Without caching: 5 sessions = 400k tokens * $15/M = $6.00
- With caching: $1.20 + (4 * $0.12) = $1.68
- **72% cost reduction**

---

## Section 8: Database & Persistence

### Why SQLite?

openEXPERT uses **SQLite** as its primary database — a surprising choice for a modern AI platform, but a deliberate one.

**The reasoning:**

1. **Local-First Architecture**
   - All your data stays on your machine
   - No cloud dependency
   - Zero network latency for queries
   - Works offline (except for LLM API calls)

2. **Zero Configuration**
   - No database server to install
   - No connection strings to configure
   - No admin passwords to manage
   - Database is just a file: `data/workbench.sqlite`

3. **ACID Guarantees**
   - Full transactional support
   - Data integrity even if process crashes
   - Atomic commits across related tables

4. **Performance at Scale**
   - Handles millions of rows efficiently
   - Write-Ahead Logging (WAL) mode for concurrent reads
   - Optimized indexes on all foreign keys and frequent queries

5. **Portability**
   - Copy the `.sqlite` file → entire database backed up
   - Move between Windows, Mac, Linux seamlessly
   - Inspect with any SQLite browser tool

**When you outgrow SQLite:** If you scale to 100+ concurrent users or multi-GB databases, openEXPERT supports migration to PostgreSQL (cloud-ready, planned Q3 2026).

---

### Database Schema: 82 Tables Across 16 Functional Groups

openEXPERT v2.0 implements a **comprehensive persistence layer** with **82 tables** organized into **16 functional groups**. This supports all transformative features with proper relational integrity.

#### GROUP 1: Core Session & User Management (13 tables)

**Core operations:** Sessions, messages, configurations, projects.

| Table | Purpose |
|-------|---------|
| `sessions` | Session metadata (module, area, config, timestamps) |
| `messages` | Conversation history with token/cost tracking |
| `registered_folders` | Local folder references for knowledge sources |
| `module_configs` | Saved module configurations per user |
| `projects` | Project organization and grouping |
| `project_sessions` | Many-to-many sessions ↔ projects |
| `skills` | Reusable prompt skills library |
| `reviews` | Review engine feedback |
| `user_profiles` | User context and preferences |
| `custom_modules` | User-created modules |
| `community_skills` | Community-submitted skills |
| `community_modules` | Shared custom modules |

**Key table deep dive:**

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  area_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  config TEXT NOT NULL DEFAULT '{}',  -- JSON: model, thinking, creativity, outputs
  user_id TEXT DEFAULT 'default',
  project_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  thinking_content TEXT,              -- Extended thinking output (if enabled)
  content_blocks TEXT,                -- JSON array of all content blocks
  token_count INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  model_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

#### GROUP 2: Authentication & RBAC (5 tables)

**Role-Based Access Control:** Fully implemented with 3 default roles.

| Table | Purpose |
|-------|---------|
| `users` | User accounts (username, email, password_hash, status) |
| `roles` | Role definitions (admin, analyst, user + custom) |
| `permissions` | Permission definitions (resource + action pairs) |
| `user_roles` | Many-to-many users ↔ roles |
| `role_permissions` | Many-to-many roles ↔ permissions |

**Default Roles:**

| Role | Description | Permissions |
|------|-------------|-------------|
| **admin** | Full system access | All 24 permissions (user management, system config, audit logs) |
| **analyst** | Full feature access | 18 permissions (all modules, workflows, intelligence features) |
| **user** | Standard access | 11 permissions (modules, personal workspace, basic workflows) |

**Permission matrix example:**

```sql
-- Module permissions
module.execute      -- Execute AI modules
module.create       -- Create custom modules
module.update       -- Update custom modules
module.delete       -- Delete custom modules

-- Intelligence permissions
intelligence.read                  -- View intelligence dashboards
intelligence.patterns              -- Access pattern detection
intelligence.knowledge_graph       -- Access knowledge graph

-- Admin permissions
user.admin          -- Manage users
role.admin          -- Manage roles and permissions
budget.admin        -- Manage budgets and limits
audit.read          -- View audit logs
```

---

#### GROUP 3: Security & Audit (4 tables)

**Security monitoring and audit trail.**

| Table | Purpose |
|-------|---------|
| `login_attempts` | Track failed login attempts by username/IP |
| `security_events` | Security incidents (rate limits, unauthorized access, input validation) |
| `audit_log` | Complete audit trail (all CRUD operations with before/after values) |
| `api_requests` | API request logging (endpoint, method, response time, user) |

**Security event types:**
- `failed_login`, `unauthorized_access`, `budget_exceeded`, `rate_limit`, `suspicious_activity`, `invalid_input`, `ssrf_attempt`, `xss_attempt`, `sql_injection`, `privilege_escalation`

**Audit log captures:**
- User ID, action, resource type, resource ID
- Old value → New value (JSON)
- IP address, user agent, timestamp
- Success/failure + error message

---

#### GROUP 4: Institutional Memory (4 tables)

**Checkpoint decisions and learn from past work.**

| Table | Purpose |
|-------|---------|
| `checkpoint_decisions` | Key decisions (interpretations, judgements, approaches) |
| `decision_history` | Audit trail of decision references and overrides |
| `decision_similarities` | Similarity scores between checkpoint pairs |
| `memory_feedback` | User feedback on memory helpfulness |

**How it works:**

1. **User checkpoints decision:** "This customer is high-risk because..."
2. **System logs:** Decision text + reasoning + confidence
3. **Future sessions:** When similar scenario detected → surface past decision
4. **Override tracking:** If user chooses different approach → log for learning

**Checkpoint types:**
- `interpretation` (regulatory text interpretation)
- `judgement` (risk assessment decisions)
- `approach` (methodology choices)
- `assumption` (underlying assumptions)
- `conclusion` (final determinations)

---

#### GROUP 5: Cross-Workflow Intelligence - Knowledge Atoms (4 tables)

**Layer 2 of the 5-layer intelligence funnel.**

| Table | Purpose |
|-------|---------|
| `knowledge_atoms` | Extracted facts, insights, conclusions |
| `atom_sources` | Source sessions/messages for each atom |
| `atom_tags` | Tags for categorization and search |
| `atom_relationships` | Relationships between atoms (supports, contradicts, extends) |

**Atom types:**
- `fact` — Factual statement (e.g., "AMLR Article 8 requires annual BWRA")
- `insight` — Analytical observation (e.g., "Most banks struggle with cross-border screening")
- `conclusion` — Determined outcome (e.g., "Client lacks adequate TM coverage for PEPs")
- `finding` — Discovery (e.g., "Policy silent on crypto assets")
- `recommendation` — Suggested action (e.g., "Implement enhanced screening for high-risk jurisdictions")
- `definition` — Term explanation
- `relationship` — Connection between concepts

**Extraction process:**
1. Session completes → LLM extracts knowledge atoms
2. Each atom linked to source session + message ID
3. Auto-tagged by entity, topic, regulation
4. Relationships detected (supports, contradicts, extends)

---

#### GROUP 6: Knowledge Graph (5 tables)

**Layer 3 of the 5-layer intelligence funnel.**

| Table | Purpose |
|-------|---------|
| `entity_nodes` | Entities (clients, regulations, controls, risks, people, systems) |
| `entity_relationships` | Edges between entities with relationship types |
| `entity_mentions` | Raw mentions in sessions (with context) |
| `entity_merge_log` | Alias consolidation history |
| `entity_aliases` | Alternative names for entities |

**Entity types (11 types):**
- `client`, `regulation`, `control`, `risk`, `person`, `system`, `product`, `geography`, `organization`, `process`, `document`

**Relationship types (10 types):**
- `mentioned_with`, `precedes`, `caused`, `requires`, `contradicts`, `supports`, `implements`, `reports_to`, `owns`, `part_of`

**Example graph query:**

```sql
-- Find all controls that implement AMLR regulations
SELECT
  e1.name AS control_name,
  e2.name AS regulation_name,
  r.strength,
  r.co_occurrence_count
FROM entity_relationships r
JOIN entity_nodes e1 ON r.from_entity_id = e1.id
JOIN entity_nodes e2 ON r.to_entity_id = e2.id
WHERE e1.entity_type = 'control'
  AND e2.entity_type = 'regulation'
  AND r.relationship_type = 'implements'
ORDER BY r.strength DESC;
```

---

#### GROUP 7: Pattern Detection (5 tables)

**Layer 4 of the 5-layer intelligence funnel.**

| Table | Purpose |
|-------|---------|
| `detected_patterns` | Patterns found by 5 detectors |
| `pattern_history` | Audit trail of pattern lifecycle |
| `detector_configs` | Configuration for each detector |
| `pattern_resolutions` | How patterns were resolved |
| `pattern_alerts` | Alerts sent to users |

**The five detectors:**

| Detector | What It Finds | Example |
|----------|---------------|---------|
| **Temporal Correlation** | Events that co-occur in time | "Every BWRA session followed by TM rule update within 72 hours" |
| **Entity Convergence** | Entities mentioned together frequently | "Client X + Regulation Y + Control Z appear in 8 sessions" |
| **Cascade Detection** | Sequential patterns | "Gap analysis → Policy creation → Training material (in that order)" |
| **Trend Divergence** | Anomalous changes | "Sanctions queries up 300% this month vs. baseline" |
| **Gap Detection** | Missing coverage | "No sessions about crypto asset regulations in 90 days" |

**Detector configuration:**

```sql
CREATE TABLE detector_configs (
  id TEXT PRIMARY KEY,
  detector_type TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  sensitivity REAL DEFAULT 0.7,   -- 0.0 - 1.0
  threshold REAL DEFAULT 0.5,     -- Confidence threshold to trigger alert
  lookback_days INTEGER DEFAULT 30,
  config TEXT DEFAULT '{}',       -- Detector-specific params
  last_run_at TEXT,
  next_run_at TEXT
);
```

---

#### GROUP 8: Quality Ratchet (4 tables)

**Never go backwards on quality.**

| Table | Purpose |
|-------|---------|
| `quality_baselines` | Initial quality scores per session |
| `quality_scores` | Quality assessment per message |
| `quality_history` | Evolution of quality over time |
| `quality_alerts` | Alerts when quality drops |

**6-dimensional quality scoring:**

1. **Completeness** (0-100): Coverage of required sections
2. **Accuracy** (0-100): Factual correctness, citation quality
3. **Structure** (0-100): Logical flow, readability, formatting
4. **Actionability** (0-100): Clear recommendations, next steps
5. **Citations** (0-100): Proper regulatory references
6. **Overall** (0-100): Weighted average

**How the ratchet works:**

1. **First output:** Baseline set (e.g., Overall = 85)
2. **Iterate:** User asks for changes
3. **Re-score:** New output scored (e.g., Overall = 82)
4. **Alert:** "⚠️ Quality dropped 3 points (85 → 82). Completeness score decreased."
5. **User decision:** Accept trade-off or regenerate

**Alert types:**
- `below_baseline` — Current score < baseline
- `significant_drop` — Drop of >5 points in any dimension
- `persistent_low` — 3+ consecutive outputs below baseline
- `improvement` — Positive alert when quality increases

---

#### GROUP 9: Apprentice Model (4 tables)

**AI learns by doing, with human oversight.**

| Table | Purpose |
|-------|---------|
| `apprentice_stages` | Current stage per module per user |
| `apprentice_history` | Stage progression audit trail |
| `apprentice_confidence` | AI confidence scores per output |
| `override_log` | When human overrode AI suggestions |

**4-stage progression:**

| Stage | AI Behavior | Human Role | Criteria to Advance |
|-------|-------------|-----------|---------------------|
| **Observer** | Watches only, suggests structure | Does all analysis | 10 sessions completed |
| **Guided** | Drafts outline, flags key areas | Reviews and directs | 15 successful outputs, <20% override rate |
| **Supervised** | Produces full analysis | Spot-checks, approves | 25 successful outputs, <10% override rate |
| **Autonomous** | Works independently | Reviews final output only | 50 successful outputs, <5% override rate |

**Confidence tracking:**

```sql
CREATE TABLE apprentice_confidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  message_id TEXT,
  stage_id INTEGER,
  confidence_score REAL NOT NULL,  -- 0.0 - 1.0
  reasoning TEXT,
  user_feedback TEXT CHECK(user_feedback IN ('accepted', 'rejected', 'modified'))
);
```

**Use case:** AMLR Gap Analysis module
- Starts in Observer (AI suggests "You should review Article 8, 13, 18")
- After 10 gap analyses → Guided (AI drafts gap matrix, human reviews)
- After 25 successful → Supervised (AI produces full report, human spot-checks)
- After 50 successful → Autonomous (AI trusted to produce final output)

---

#### GROUP 10: Time Intelligence (4 tables)

**Deadlines, capacity, estimates.**

| Table | Purpose |
|-------|---------|
| `deadlines` | Regulatory deadlines and project milestones |
| `capacity_log` | Team capacity tracking (planned vs. actual hours) |
| `time_estimates` | Task duration estimates and accuracy tracking |
| `deadline_alerts` | Upcoming deadline notifications |

**Deadline types:**
- `regulatory` — Official compliance deadlines (e.g., "AMLR implementation: June 10, 2027")
- `consultation` — Comment period end dates
- `implementation` — Internal go-live dates
- `project` — Project milestones
- `milestone` — Key deliverable dates

**Capacity planning:**

```sql
CREATE TABLE capacity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  user_id TEXT,
  team_id TEXT,
  planned_hours REAL DEFAULT 0,
  actual_hours REAL DEFAULT 0,
  utilization_percent REAL DEFAULT 0,  -- actual / planned * 100
  notes TEXT
);
```

**Smart estimates:**
- System learns: "BWRA creation usually takes 8-12 hours"
- User selects module → estimated effort shown
- After completion → actual vs. estimated recorded
- Accuracy improves over time

---

#### GROUP 11: Regulatory Radar (5 tables)

**Living regulatory monitoring.**

| Table | Purpose |
|-------|---------|
| `radar_items` | Tracked regulations, consultations, guidelines |
| `radar_subscriptions` | User subscriptions (by jurisdiction, topic, keyword) |
| `regulatory_changes` | Detected changes in tracked items |
| `radar_alerts` | Alerts sent to users |
| `radar_actions` | Actions taken on radar items |

**Item types:**
- `regulation`, `consultation`, `guideline`, `announcement`, `enforcement`, `case_law`

**Subscription model:**

```sql
CREATE TABLE radar_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subscription_type TEXT NOT NULL,  -- jurisdiction, topic, source, keyword
  subscription_value TEXT NOT NULL, -- e.g., "EU", "sanctions", "EBA"
  alert_frequency TEXT DEFAULT 'daily', -- real_time, daily, weekly, monthly
  enabled INTEGER DEFAULT 1
);
```

**Change detection:**

```sql
CREATE TABLE regulatory_changes (
  id TEXT PRIMARY KEY,
  radar_item_id TEXT NOT NULL,
  change_type TEXT NOT NULL,  -- new_requirement, amendment, repeal, deadline_change
  previous_text TEXT,
  new_text TEXT,
  impact_assessment TEXT,
  detected_at TEXT NOT NULL
);
```

**Workflow:**

1. **User subscribes:** "Alert me to all EU AML regulations"
2. **Radar monitors:** EUR-Lex, EBA website, etc. (via web search + scheduled checks)
3. **Change detected:** AMLR RTS published
4. **Alert sent:** Email or in-app notification
5. **User action:** Create project, set deadline, run impact analysis

---

#### GROUP 12: Compliance-as-Code (4 tables)

**Machine-readable compliance rules.**

| Table | Purpose |
|-------|---------|
| `compliance_rules` | Rule definitions (validation logic, thresholds) |
| `rule_violations` | Detected violations |
| `rule_history` | Rule change audit trail |
| `rule_exemptions` | Approved exemptions from rules |

**8 seeded rules (examples):**

1. **Customer Due Diligence Completeness** (Error)
   - Check: Output must include customer ID, risk assessment, monitoring plan
   - Regulation: AMLR Article 13

2. **Risk Score Threshold** (Error)
   - Check: Risk scores 0-100 with documented methodology
   - Regulation: AMLR Article 8

3. **Transaction Monitoring Rule Documentation** (Warning)
   - Check: TM rules must have rationale, threshold, calibration, review frequency
   - Regulation: EBA Guidelines

4. **Sanctions Screening Timeliness** (Critical)
   - Check: Screening must be <24 hours old, list version documented
   - Regulation: EU Sanctions

5. **BWRA Geographic Coverage** (Error)
   - Check: All jurisdictions covered
   - Regulation: AMLR Article 8

6. **Policy Version Control** (Warning)
   - Check: Version number, approval date, review date present
   - Regulation: Governance requirement

7. **Citation Requirement** (Warning)
   - Check: Minimum 3 regulatory citations
   - Regulation: Quality standard

8. **Dual Approval - High Risk** (Critical)
   - Check: High-risk customers require 2 approvals
   - Regulation: AMLR Article 18

**Rule logic (JSON):**

```json
{
  "check": "numeric_range",
  "field": "risk_score",
  "min": 0,
  "max": 100,
  "require_methodology": true
}
```

**Violation workflow:**

1. **Rule triggered:** Output violates rule
2. **Violation logged:** Severity, evidence, status
3. **User notified:** "⚠️ Compliance rule violated: Risk Score Threshold"
4. **User action:** Fix and regenerate, or request exemption
5. **Exemption:** Approved by admin with reason and expiry

---

#### GROUP 13: Workflow Automation (4 tables)

**Multi-step automated processes.**

| Table | Purpose |
|-------|---------|
| `workflow_definitions` | Workflow templates (trigger, steps, config) |
| `workflow_runs` | Execution instances |
| `workflow_steps` | Individual step execution and results |
| `workflow_schedules` | Scheduled workflow execution |

**12 step types:**

1. **LLM** — Execute module with inputs
2. **Wait** — Pause for duration or until date
3. **Approval** — Human approval gate
4. **Email** — Send email notification
5. **Webhook** — Call external API
6. **Extract** — Extract data from previous output
7. **Transform** — Apply transformation logic
8. **Conditional** — Branch based on condition
9. **Parallel** — Execute multiple steps simultaneously
10. **Loop** — Iterate over list
11. **Export** — Export to file format
12. **Review** — Trigger review engine

**Example workflow:** "Monthly Regulatory Update Report"

```json
{
  "trigger_type": "scheduled",
  "schedule": "0 9 1 * *",  // 9 AM on 1st of month
  "steps": [
    {
      "type": "llm",
      "module_id": "regulatory-monitor",
      "inputs": { "query": "EU AML developments last 30 days" }
    },
    {
      "type": "export",
      "format": "pdf"
    },
    {
      "type": "email",
      "to": "compliance-team@company.com",
      "subject": "Monthly Regulatory Update",
      "attach_previous_output": true
    }
  ]
}
```

---

#### GROUP 14: Output Versioning (2 tables)

**Never lose a version.**

| Table | Purpose |
|-------|---------|
| `output_versions` | Every saved version of output |
| `version_diffs` | Computed diffs between versions |

**How it works:**

1. **Initial output:** Version 1 created
2. **User edits:** "Make this more concise"
3. **New output:** Version 2 created
4. **Diff computed:** Changed sections highlighted
5. **User reviews:** Side-by-side comparison
6. **Revert option:** Can restore any previous version

**Diff format:**
- Markdown with `+ added lines` and `- removed lines`
- Computed using standard diff algorithm
- Stored for fast retrieval

---

#### GROUP 15: Collaborative Canvas (4 tables)

**Multi-human workflows.**

| Table | Purpose |
|-------|---------|
| `canvas_sessions` | Shared workspaces for collaboration |
| `canvas_participants` | Users in canvas with roles |
| `canvas_comments` | Comments, suggestions, approvals |
| `canvas_changes` | Audit trail of all changes |

**Canvas types:**
- `general` — Open collaboration
- `review` — Formal review process
- `brainstorm` — Ideation session
- `planning` — Planning workspace

**Participant roles:**

| Role | Permissions |
|------|-------------|
| **owner** | Full control (edit, invite, delete) |
| **editor** | Edit content, add comments |
| **reviewer** | Comment, approve/reject |
| **viewer** | Read-only access |

**Comment types:**
- `comment` — General comment
- `suggestion` — Suggested change
- `approval` — Approve section
- `rejection` — Reject section
- `question` — Ask question

**Use case:** "Sanctions Policy Review"

1. **Owner creates canvas:** Links draft policy document
2. **Invites reviewers:** Legal, Compliance, Operations (each as reviewer)
3. **Reviewers comment:** "Section 3.2 needs clarification on crypto assets"
4. **Owner edits:** Updates section
5. **Reviewers approve:** All approve → policy final

---

#### GROUP 16: Budget & Cost Management (3 tables)

**Cost control and tracking.**

| Table | Purpose |
|-------|---------|
| `budget_limits` | Per-user or per-team spending limits |
| `cost_tracking` | Every API call with token and cost details |
| `usage_alerts` | Budget threshold alerts |

**Budget limits:**

```sql
CREATE TABLE budget_limits (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE,
  team_id TEXT,
  limit_type TEXT NOT NULL,  -- daily, weekly, monthly, total
  limit_amount REAL NOT NULL,
  current_spend REAL DEFAULT 0,
  alert_threshold REAL DEFAULT 0.8,  -- Alert at 80% of limit
  enabled INTEGER DEFAULT 1
);
```

**Cost tracking:**

```sql
CREATE TABLE cost_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  session_id TEXT,
  message_id TEXT,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,  -- anthropic, openai, google, mistral, ollama
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  created_at TEXT NOT NULL
);
```

**Alert workflow:**

1. **User hits 80% of monthly budget:** Alert sent
2. **User hits 100%:** Further API calls blocked (configurable)
3. **Admin:** Can increase limit or approve override

**Cost analysis queries:**

```sql
-- Monthly spend by user
SELECT user_id, SUM(cost) AS total_cost, COUNT(*) AS api_calls
FROM cost_tracking
WHERE created_at >= date('now', 'start of month')
GROUP BY user_id
ORDER BY total_cost DESC;

-- Cost by model
SELECT model_id, SUM(cost) AS total_cost,
       SUM(input_tokens + output_tokens) AS total_tokens
FROM cost_tracking
GROUP BY model_id;
```

---

### Performance Optimizations

**Indexes (120+ indexes):**
- Every foreign key has an index
- Common query patterns optimized
- Composite indexes on frequently joined columns
- Timestamp columns indexed for date-range queries

**WAL Mode:**
```sql
PRAGMA journal_mode = WAL;
```
- Concurrent reads while writing
- Faster commits
- Better crash recovery

**Foreign Key Enforcement:**
```sql
PRAGMA foreign_keys = ON;
```
- Referential integrity guaranteed
- Cascading deletes prevent orphaned records

**Query optimization examples:**

```sql
-- Fast session lookup by module (indexed)
SELECT * FROM sessions
WHERE module_id = 'gap-analysis'
ORDER BY updated_at DESC
LIMIT 10;

-- Fast pattern search by type and status (indexed)
SELECT * FROM detected_patterns
WHERE pattern_type = 'temporal_correlation'
  AND status = 'new'
ORDER BY detected_at DESC;

-- Fast knowledge atom search by tag (indexed)
SELECT ka.*
FROM knowledge_atoms ka
JOIN atom_tags at ON ka.id = at.atom_id
WHERE at.tag = 'AMLR'
ORDER BY ka.created_at DESC;
```

---

### Backup & Migration

**Backup (simple file copy):**

```bash
# Backup
cp data/workbench.sqlite data/backup_$(date +%Y%m%d).sqlite

# Or use SQLite backup API
sqlite3 data/workbench.sqlite ".backup data/backup.sqlite"

# Automated daily backup (Linux/Mac cron)
0 2 * * * sqlite3 /path/to/data/workbench.sqlite ".backup /path/to/backups/$(date +\%Y\%m\%d).sqlite"
```

**Restore:**
```bash
cp data/backup_20260220.sqlite data/workbench.sqlite
```

**Migration to PostgreSQL (future):**

When ready to scale:
1. Export schema: `sqlite3 workbench.sqlite .schema > schema.sql`
2. Convert to PostgreSQL syntax (automated tool provided)
3. Export data: CSV or JSON
4. Import to PostgreSQL
5. Update `DB_TYPE=postgresql` in `.env`

---

### Database Statistics Dashboard

Track database health with built-in statistics:

```sql
-- Table sizes
SELECT name, SUM(pgsize) / 1024.0 / 1024.0 AS size_mb
FROM dbstat
GROUP BY name
ORDER BY size_mb DESC;

-- Row counts
SELECT 'sessions' AS table_name, COUNT(*) AS row_count FROM sessions
UNION ALL
SELECT 'messages', COUNT(*) FROM messages
UNION ALL
SELECT 'knowledge_atoms', COUNT(*) FROM knowledge_atoms
-- ... etc
ORDER BY row_count DESC;

-- Largest sessions by message count
SELECT s.id, s.title, COUNT(m.id) AS message_count,
       SUM(m.token_count) AS total_tokens,
       SUM(m.cost) AS total_cost
FROM sessions s
JOIN messages m ON s.id = m.session_id
GROUP BY s.id
ORDER BY message_count DESC
LIMIT 10;
```

---

### Summary

openEXPERT's database is **comprehensive** (82 tables), **performant** (WAL mode, 120+ indexes), **maintainable** (SQLite simplicity), and **production-ready** (ACID guarantees, foreign key enforcement).

Every transformative feature has proper database backing. Nothing is ephemeral — all knowledge, patterns, quality scores, and decisions persist for long-term learning and compliance audit trails.

**Next:** Section 9 explores how these tables power Cross-Workflow Intelligence.

---


## 9. Cross-Workflow Intelligence (5-Layer Funnel)

Most AI tools treat every session as isolated. openEXPERT **learns from all your work** and detects patterns across workflows.

### The Vision

Imagine you've run 50 gap analyses over 6 months across different clients. Each analysis identified gaps, recommended controls, and set priorities. But the insights stayed trapped in individual reports.

**What if the system could:**
- Extract every fact, insight, and recommendation into a searchable knowledge base
- Map all entities mentioned (clients, regulations, controls, risks)
- Detect patterns: "Control X always scores 'green' but Control Y always scores 'red' — why?"
- Alert you: "This client has the same gap as 3 other clients — there's a common industry issue"

**That's Cross-Workflow Intelligence.**

---

### The 5-Layer Funnel

#### Layer 1: Raw Workflow Outputs

**What:** Every session output stored in `workflow_outputs` table

**Capture:**
- Full Markdown output
- Module used
- Timestamp
- Associated workflow (if part of multi-step process)

**Purpose:** Persistent record of all AI-generated work

---

#### Layer 2: Knowledge Atoms

**What:** Discrete units of knowledge extracted from outputs

**Examples:**
- **Fact:** "AMLR Article 4 requires risk assessment reviews annually"
- **Insight:** "Control TM-001 flagged false positives in 80% of test cases"
- **Conclusion:** "Client lacks documented risk appetite for sanctions exposure"
- **Recommendation:** "Implement quarterly control effectiveness reviews"
- **Risk:** "Lack of TM tuning may result in regulatory criticism"

**Extraction Method:**
- AI-powered extraction (Claude analyzes output, identifies atoms)
- Each atom categorized (fact, insight, conclusion, recommendation, risk, control, requirement, gap, decision)
- Confidence score (0-1)
- Temporal validity (permanent, date range, superseded)

**Storage:** `knowledge_atoms` table

**Purpose:** Build searchable knowledge base

---

#### Layer 3: Knowledge Graph

**What:** Map all entities and their relationships

**Entities (Nodes):**
- Clients ("Nordea", "SEB", "Handelsbanken")
- Regulations ("AMLR Article 4", "6AMLD Article 8")
- Controls ("TM-001", "KYC-EDD-PEP")
- Risks ("R-003: Sanctions Breach", "R-007: Money Laundering")
- People ("MLRO: Jane Smith", "Board Member: John Doe")
- Systems ("Transaction Monitoring System", "KYC Platform")

**Relationships (Edges):**
- "Control TM-001 **mitigates** Risk R-003"
- "AMLR Article 4 **requires** Control KYC-EDD-PEP"
- "Client Nordea **implements** Control TM-001"
- "Risk R-003 **references** AMLR Article 7"

**Relationship Strength:**
- 1.0+ = Confirmed (mentioned multiple times)
- 0.5-1.0 = Weak/inferred (mentioned once, indirect)

**Storage:**
- `entity_nodes` table (entity_type, entity_id, canonical_name, interaction_count)
- `entity_relationships` table (from_entity, to_entity, relationship_type, strength, observation_count)

**Purpose:** Enable graph queries

**Examples:**
- "Show all controls that mitigate sanctions risks"
- "Which regulations reference client X?"
- "What controls are most frequently identified as gaps?"

---

#### Layer 4: Pattern Detection

**What:** Automated detection of cross-workflow patterns

**Five Detector Types:**

##### 1. Temporal Correlation
**Detects:** Events that co-occur across workflows

**Example:**
- Pattern: "When Control X scores 'red', Control Y also scores 'red' in 85% of cases (12 workflows)"
- Insight: "Controls X and Y may share a root cause issue"
- Action: "Investigate shared dependency (same system? same process?)"

##### 2. Entity Convergence
**Detects:** Same entities appearing together repeatedly

**Example:**
- Pattern: "Entity 'High-Risk Country Z' appears in 80% of STR workflows involving Entity 'Product: Wire Transfers'"
- Insight: "Wire transfers to Country Z are a key ML/TF risk indicator"
- Action: "Consider enhanced monitoring or geo-blocking for Country Z wire transfers"

##### 3. Cascade Detection
**Detects:** Sequential patterns (A happens → B happens → C happens)

**Example:**
- Pattern: "When 'Control Review' workflow identifies a gap → 'Policy Update' workflow runs within 30 days → 'Training Delivery' workflow runs within 60 days"
- Insight: "Organization follows a consistent remediation pattern"
- Action: "Automate the cascade with a pre-built workflow template"

##### 4. Trend Divergence
**Detects:** Anomalous changes over time

**Example:**
- Pattern: "Gap analysis scores declining for 3 consecutive quarters (Q1: 8.2, Q2: 7.8, Q3: 7.1)"
- Insight: "Control effectiveness may be degrading"
- Action: "Investigate root cause — resource constraints? Process drift?"

##### 5. Gap Detection
**Detects:** Missing coverage

**Example:**
- Pattern: "40 gap analyses conducted, but only 2 mentioned 'Crypto Asset Risk' despite AMLR requirements"
- Insight: "Potential blind spot in risk assessment process"
- Action: "Update gap analysis templates to include crypto asset section"

**Storage:** `detected_patterns` table

**Severity Levels:**
- **Critical:** Requires immediate action (regulatory risk, control failure)
- **Warning:** Should be addressed (inefficiency, inconsistency)
- **Info:** Informational (interesting trend, no action required)
- **Positive:** Good practice detected (consistent quality, effective process)

**Resolution Workflow:**
- Status: active → investigating → resolved/dismissed
- Resolution notes captured
- Patterns can be dismissed if false positive

---

#### Layer 5: Actionable Intelligence Dashboard

**What:** Surface insights to users

**Widgets:**

**1. Recent Patterns (last 30 days)**
- List of detected patterns with severity badges
- Click to view evidence (which workflows, which entities, metrics)

**2. Entity Activity Heatmap**
- Which entities are mentioned most frequently?
- Trending entities (mentioned more this month vs. last month)

**3. Knowledge Growth Metrics**
- Atoms extracted per day
- Patterns detected per week
- Graph density (node count, edge count)

**4. Insight Alerts**
- Critical patterns requiring attention
- Trend warnings
- Gap notifications

**Example Dashboard View:**
```
┌────────────────────────────────────────────────────────────┐
│ Cross-Workflow Intelligence Dashboard                     │
├────────────────────────────────────────────────────────────┤
│ 📊 Last 30 Days                                           │
│   • 847 knowledge atoms extracted                         │
│   • 12 patterns detected (2 critical, 5 warning, 5 info)  │
│   • 156 entities tracked across 23 workflows              │
├────────────────────────────────────────────────────────────┤
│ 🚨 Critical Patterns                                       │
│   ⚠️ Temporal Correlation: Controls X & Y fail together   │
│       Observed in 8/10 audits → Investigate shared system │
│   ⚠️ Trend Divergence: Quality scores declining           │
│       Q1: 8.2 → Q2: 7.8 → Q3: 7.1 → Review process        │
├────────────────────────────────────────────────────────────┤
│ 📈 Trending Entities                                       │
│   • "AMLR Article 4" ↑ 240% mentions this month           │
│   • "Control TM-001" ↓ 60% mentions (less frequent testing)|
│   • "Client Nordea" ↑ New client, 5 workflows this week   │
├────────────────────────────────────────────────────────────┤
│ 🔍 Knowledge Graph: 3,247 entities, 8,962 relationships   │
│   Top Connected: "AMLR Article 4" (89 relationships)      │
│   Most Active: "Control TM-001" (156 mentions)            │
└────────────────────────────────────────────────────────────┘
```

**Benefit:** Turn isolated analyses into organizational intelligence

---

### Use Cases

#### 1. Quality Assurance
**Scenario:** Audit team wants to ensure consistency across client engagements

**Query:** "Show all gap analyses from last quarter — are we consistently identifying the same regulatory requirements?"

**Insight:** Pattern detection reveals 3 analysts systematically miss AMLR Article 12 (Beneficial Ownership)

**Action:** Update training materials, add Article 12 to gap analysis checklist

---

#### 2. Risk Identification
**Scenario:** MLRO wants to identify emerging ML/TF risks

**Query:** "Which entities are appearing more frequently in STR workflows this quarter vs. last quarter?"

**Insight:** Entity Convergence detector flags "Crypto Exchange X" in 70% of recent STRs (up from 10% last quarter)

**Action:** Initiate targeted review of all transactions involving Crypto Exchange X

---

#### 3. Efficiency Gains
**Scenario:** Consultant wants to reuse past analyses

**Query:** "Have we analyzed DORA compliance for any clients? What were the common gaps?"

**Insight:** Knowledge graph shows 4 previous DORA gap analyses, all identified the same 3 gaps (ICT risk register, incident response SLA, third-party oversight)

**Action:** Create a "DORA Gap Analysis Starter Pack" module pre-configured with common gaps

---

#### 4. Regulatory Intelligence
**Scenario:** Compliance team wants to track regulatory change impact

**Query:** "Which controls are affected by AMLR updates?"

**Insight:** Knowledge graph shows 12 controls linked to "AMLR Article 4" — all require updates

**Action:** Trigger workflow: Control Review → Policy Update → Training Delivery for all 12 controls

---

## 10. Knowledge Graph & Entity Relationships

The knowledge graph is Layer 3 of Cross-Workflow Intelligence. It maps **who, what, and how** across all your work.

### Entity Types

openEXPERT automatically extracts and classifies entities:

| Type | Examples | Purpose |
|------|----------|---------|
| **client** | "Nordea", "SEB", "Handelsbanken" | Track client-specific analyses |
| **regulation** | "AMLR Article 4", "6AMLD Article 8", "GDPR Article 35" | Map regulatory requirements |
| **control** | "TM-001", "KYC-EDD-PEP", "SAR-Filing-Process" | Track control effectiveness |
| **risk** | "R-003: Sanctions Breach", "R-007: ML Risk - Cash Intensive" | Identify risk patterns |
| **person** | "MLRO: Jane Smith", "Board Member: John Doe" | Stakeholder mapping |
| **system** | "Transaction Monitoring System", "KYC Platform" | Technical dependency tracking |
| **product** | "Wire Transfers", "Crypto Custody", "Corporate Cards" | Product risk analysis |
| **geography** | "High-Risk Country Z", "EU Jurisdiction: Sweden" | Geographical risk mapping |

### Entity Extraction

**Process:**
1. AI analyzes every workflow output
2. Identifies mentioned entities
3. Classifies by type
4. Extracts canonical name
5. Stores in `entity_nodes` table
6. Tracks interaction count (how often entity appears)

**Example:**
```
Output: "The client's Transaction Monitoring system (TM-001) failed to detect 3 out of 10 test cases involving wire transfers to High-Risk Country Z, indicating a potential gap in sanctions screening per AMLR Article 7."

Extracted Entities:
- client: "The client" (generic entity)
- control: "TM-001"
- product: "Wire Transfers"
- geography: "High-Risk Country Z"
- regulation: "AMLR Article 7"
- risk: "Sanctions screening gap" (inferred)
```

### Relationship Extraction

**Process:**
1. AI identifies relationships between entities
2. Classifies relationship type
3. Assigns strength (1.0+ = confirmed, 0.5 = weak)
4. Stores in `entity_relationships` table
5. Updates observation count when relationship seen again

**Relationship Types:**

| Type | Meaning | Example |
|------|---------|---------|
| `implements` | Entity A implements Entity B | "Client Nordea **implements** Control TM-001" |
| `mitigates` | Control mitigates Risk | "Control TM-001 **mitigates** Risk R-003" |
| `requires` | Regulation requires Control | "AMLR Article 4 **requires** Control KYC-EDD" |
| `references` | Entity references Entity | "Risk R-003 **references** AMLR Article 7" |
| `conflicts_with` | Inconsistency | "Control TM-002 **conflicts_with** Control TM-001" |
| `depends_on` | Dependency | "Control KYC-Platform **depends_on** System CRM-DB" |
| `supersedes` | Replacement | "AMLR 2024/1624 **supersedes** 4AMLD" |

**Example Graph:**
```
[Client: Nordea] --implements--> [Control: TM-001]
                                       |
                                       mitigates
                                       |
                                       v
                                  [Risk: R-003]
                                       |
                                       references
                                       |
                                       v
                                [Regulation: AMLR Article 7]
```

### Entity Consolidation (Merge Log)

**Challenge:** Same entity mentioned with different names

**Examples:**
- "Nordea", "Nordea Bank Abp", "Nordea Finland"
- "AMLR Article 4", "Art. 4 AMLR", "Regulation 2024/1624 Article 4"

**Solution:** Entity merge system

1. AI detects aliases
2. Suggests merge (manual or auto)
3. Updates all references to canonical name
4. Logs merge in `entity_merge_log` (audit trail)

**Result:** Clean, deduplicated knowledge graph

### Graph Queries

**Available Queries:**

#### 1. Subgraph Extraction
**Query:** "Show all entities connected to Control TM-001"

**Result:**
```
Control TM-001:
  - implemented_by: Client Nordea, Client SEB
  - mitigates: Risk R-003, Risk R-007
  - required_by: AMLR Article 4, 6AMLD Article 8
  - depends_on: System TM-Platform
```

#### 2. Path Finding
**Query:** "How is Client X connected to Regulation Y?"

**Result:**
```
Path: [Client Nordea] --implements--> [Control TM-001] --required_by--> [AMLR Article 4]
```

#### 3. Entity Importance Ranking
**Query:** "Which entities are most connected?"

**Result:**
```
Top 5 by relationship count:
1. AMLR Article 4 (89 relationships)
2. Control TM-001 (67 relationships)
3. Risk R-003 (45 relationships)
4. Client Nordea (34 relationships)
5. MLRO: Jane Smith (28 relationships)
```

#### 4. Relationship Strength
**Query:** "Which controls have strongest evidence of mitigating risks?"

**Result:**
```
Control-Risk pairs by strength:
1. Control TM-001 mitigates Risk R-003 (strength: 4.8, observed in 12 workflows)
2. Control KYC-EDD mitigates Risk R-007 (strength: 3.2, observed in 8 workflows)
```

### Visualization

**Pages:**
- `KnowledgeGraphPage.tsx` — Interactive graph visualization (nodes, edges, click to explore)
- `IntelligenceDashboard.tsx` — Analytics view (entity activity, relationship heatmaps)

**Features:**
- Force-directed graph layout (entities cluster by relationship density)
- Color-coding by entity type
- Edge thickness represents relationship strength
- Click entity → see all relationships + linked workflows
- Filter by entity type, time range, relationship type

---

## 11. Pattern Detection Engine

Layer 4 of Cross-Workflow Intelligence — automated detection of insights across workflows.

### Architecture

**Components:**
1. **Pattern Detectors** — Algorithms that analyze knowledge graph + atoms
2. **Detector Scheduler** — Runs detectors periodically (configurable interval)
3. **Pattern Storage** — Detected patterns saved to `detected_patterns` table
4. **Alert System** — Critical patterns trigger notifications

---

### The Five Detectors

#### 1. Temporal Correlation Detector

**What it finds:** Events that co-occur across time

**Algorithm:**
```
For each pair of entities (A, B):
  Find all workflows where both A and B appear
  Calculate co-occurrence rate = workflows_with_both / workflows_with_A
  If rate > threshold (e.g., 70%) and sample_size > min (e.g., 5):
    Flag as temporal correlation pattern
```

**Example Output:**
```json
{
  "pattern_type": "temporal_correlation",
  "pattern_name": "Controls TM-001 and KYC-EDD frequently fail together",
  "description": "In 8 out of 10 gap analyses where Control TM-001 scored 'red', Control KYC-EDD also scored 'red' (80% correlation).",
  "severity": "warning",
  "evidence": {
    "entity_A": "Control TM-001",
    "entity_B": "Control KYC-EDD",
    "co_occurrence_rate": 0.80,
    "workflows": ["session-abc", "session-def", ...],
    "time_range": "2024-01-01 to 2024-06-30"
  },
  "actionable_insight": "Investigate shared root cause (same process? same system?). Consider joint remediation plan."
}
```

---

#### 2. Entity Convergence Detector

**What it finds:** Entities that appear together frequently across workflows

**Algorithm:**
```
For each entity E:
  For each entity type T (e.g., 'risk', 'product', 'geography'):
    Find all entities of type T that appear in workflows mentioning E
    Calculate convergence score = appearances_with_E / total_appearances_of_E
    If score > threshold (e.g., 60%):
      Flag as entity convergence pattern
```

**Example Output:**
```json
{
  "pattern_type": "entity_convergence",
  "pattern_name": "High-Risk Country Z linked to Wire Transfer STRs",
  "description": "Entity 'High-Risk Country Z' appears in 14 out of 18 STR workflows involving 'Product: Wire Transfers' (78% convergence).",
  "severity": "critical",
  "evidence": {
    "primary_entity": "Geography: High-Risk Country Z",
    "converging_entity": "Product: Wire Transfers",
    "convergence_score": 0.78,
    "workflows": ["str-001", "str-005", ...]
  },
  "actionable_insight": "Wire transfers to Country Z are a key ML/TF indicator. Consider enhanced monitoring or geo-blocking."
}
```

---

#### 3. Cascade Detector

**What it finds:** Sequential patterns (A → B → C)

**Algorithm:**
```
For each workflow execution:
  Identify entity mentions in temporal order
  Look for sequences that repeat across multiple workflows
  If sequence appears > threshold (e.g., 3 times):
    Flag as cascade pattern
```

**Example Output:**
```json
{
  "pattern_type": "cascade",
  "pattern_name": "Gap Analysis → Policy Update → Training workflow cascade",
  "description": "When 'Gap Analysis' workflow identifies control gaps, a 'Policy Update' workflow follows within 30 days in 85% of cases, then 'Training Delivery' within 60 days.",
  "severity": "positive",
  "evidence": {
    "sequence": ["Gap Analysis", "Policy Update", "Training Delivery"],
    "occurrences": 12,
    "average_intervals": [28, 55]
  },
  "actionable_insight": "Consistent remediation process detected. Consider creating an automated workflow template chaining these steps."
}
```

---

#### 4. Trend Divergence Detector

**What it finds:** Anomalous changes over time

**Algorithm:**
```
For each metric (e.g., quality scores, gap scores, entity mention count):
  Calculate trend over time (linear regression)
  Detect significant changes (> threshold delta, e.g., 20% decline)
  Flag if trend is negative or unexpected
```

**Example Output:**
```json
{
  "pattern_type": "trend_divergence",
  "pattern_name": "Quality scores declining over 3 quarters",
  "description": "Average quality scores for gap analyses: Q1: 8.2, Q2: 7.8, Q3: 7.1 (13.4% decline).",
  "severity": "warning",
  "evidence": {
    "metric": "quality_score",
    "time_series": [
      {"period": "2024-Q1", "value": 8.2},
      {"period": "2024-Q2", "value": 7.8},
      {"period": "2024-Q3", "value": 7.1}
    ],
    "trend_slope": -0.55,
    "percent_change": -13.4
  },
  "actionable_insight": "Investigate potential causes: resource constraints, process drift, complexity increase?"
}
```

---

#### 5. Gap Detector

**What it finds:** Missing coverage or blind spots

**Algorithm:**
```
Expected coverage = list of required entities (e.g., all AMLR articles)
Actual coverage = entities mentioned in workflows
Missing = expected - actual
If missing.count > threshold:
  Flag as gap detection pattern
```

**Example Output:**
```json
{
  "pattern_type": "gap_detection",
  "pattern_name": "Crypto Asset Risk under-represented in gap analyses",
  "description": "40 gap analyses conducted this year, but only 2 mentioned 'Crypto Asset Risk' despite AMLR requirements.",
  "severity": "warning",
  "evidence": {
    "expected_entity": "Risk: Crypto Asset Exposure",
    "mention_count": 2,
    "total_workflows": 40,
    "coverage_rate": 0.05
  },
  "actionable_insight": "Potential blind spot. Update gap analysis templates to include crypto asset risk assessment section."
}
```

---

### Detector Configuration

**Configurable per detector:**
- Threshold values (e.g., 70% correlation rate)
- Minimum sample size (e.g., 5 workflows)
- Time window (e.g., last 90 days vs. all time)
- Entity type filters (detect patterns only for specific types)

**Scheduling:**
- Run frequency (daily, weekly, on-demand)
- Auto-run on workflow completion (real-time pattern detection)

---

### Pattern Resolution Workflow

**Lifecycle:**
1. **Detected** — Pattern flagged by detector
2. **Active** — Awaiting review
3. **Investigating** — Analyst reviewing evidence
4. **Resolved** — Action taken
5. **Dismissed** — False positive or not actionable

**Resolution tracking:**
- Assigned to user
- Resolution notes
- Related workflows/actions
- Resolution timestamp

---

### Dashboard Integration

**Pattern alerts:**
- Critical patterns appear on dashboard with red badge
- Click to view full evidence
- Assign to team member
- Mark resolved with notes

**Historical view:**
- All detected patterns (not just active)
- Filter by type, severity, time range
- Pattern recurrence tracking (has this pattern appeared before?)

---

## 12. Institutional Memory Engine

The Institutional Memory Engine captures every decision you make and learns from it.

### The Problem

You run a gap analysis. The AI recommends prioritizing Control X as "high priority." You disagree based on organizational context and mark it "medium priority."

**Traditional AI tools:** Forget this immediately. Next gap analysis, they recommend the same thing.

**openEXPERT:** Remembers. Learns. Adapts.

---

### How It Works

#### Step 1: Checkpoint Decisions

Every workflow can have **checkpoint** steps where AI recommends an action and human decides.

**Example (Gap Analysis):**
```
Checkpoint: Prioritize remediation actions

AI Recommendation:
  - Control TM-001: HIGH (regulatory requirement, current gap)
  - Control KYC-EDD: MEDIUM (partial compliance)
  - Control SAR-Filing: LOW (minor procedural gap)

Human Decision (you):
  - Control TM-001: MEDIUM (regulatory requirement, but we have compensating control TM-002)
  - Control KYC-EDD: HIGH (this is a repeat finding from auditor, must fix)
  - Control SAR-Filing: LOW (agree)

Logged to: checkpoint_decisions table
```

---

#### Step 2: Decision Logging

**Stored data:**
- Checkpoint type (prioritization, risk scoring, control selection, etc.)
- AI recommendation (full context)
- Human decision (actual choice)
- Rationale (user can add notes)
- Context (module, client, regulation, workflow step)

**Table:** `checkpoint_decisions`

---

#### Step 3: Similarity Matching

When you reach a new checkpoint, the system searches for similar past decisions.

**Matching algorithm:**
```
current_checkpoint = "Prioritize Control TM-001 (client: Nordea, regulation: AMLR)"
past_checkpoints = fetch_all_decisions()

For each past_checkpoint:
  similarity_score = 0
  if same_module: similarity_score += 0.3
  if same_regulation: similarity_score += 0.2
  if same_control: similarity_score += 0.3
  if same_client: similarity_score += 0.1
  if keyword_overlap(context): similarity_score += 0.1

Return top 5 most similar past decisions
```

---

#### Step 4: Historical Context Display

**Before** you make a decision, the system shows you:

```
┌────────────────────────────────────────────────────────────┐
│ 📚 Institutional Memory: Similar Past Decisions            │
├────────────────────────────────────────────────────────────┤
│ 3 similar decisions found:                                 │
│                                                            │
│ 1. Gap Analysis for SEB (2024-02-15)                      │
│    AI Recommended: Control TM-001 = HIGH                  │
│    You Decided: MEDIUM                                     │
│    Rationale: "Compensating control TM-002 in place"      │
│    Similarity: 87%                                         │
│                                                            │
│ 2. Gap Analysis for Handelsbanken (2024-01-10)           │
│    AI Recommended: Control TM-001 = HIGH                  │
│    You Decided: MEDIUM                                     │
│    Rationale: "Risk appetite allows medium priority"       │
│    Similarity: 75%                                         │
│                                                            │
│ 3. Gap Analysis for Client X (2023-11-20)                │
│    AI Recommended: Control TM-001 = HIGH                  │
│    You Decided: HIGH                                       │
│    Rationale: "Audit finding, must fix immediately"        │
│    Similarity: 68%                                         │
└────────────────────────────────────────────────────────────┘

Current Recommendation: Control TM-001 = HIGH
Your Decision: [ HIGH | MEDIUM | LOW ]
Rationale: [optional text field]
```

**Benefit:** You see how you've handled this before. Consistency across engagements.

---

#### Step 5: Override Analysis

**Insight summaries:**
- "You override AI priority recommendations 40% of the time for Control TM-001 (8 out of 20 decisions)"
- "Most common override reason: 'Compensating controls in place'"
- "Override rate for AMLR Article 4 gaps: 60% (higher than average 25%)"

**What this reveals:**
- AI may be missing context (compensating controls not in source docs)
- Organizational risk appetite differs from regulatory-strict interpretation
- Specific controls/regulations trigger consistent adjustments

**Benefit:** Identify where AI needs better prompts or where organizational standards differ from regulatory text

---

#### Step 6: Feedback Loop (Future)

**Planned:**
- Use override patterns to auto-adjust AI recommendations
- "Based on past decisions, Control TM-001 is typically prioritized MEDIUM (not HIGH) when compensating controls exist"
- Adaptive learning without retraining the model

---

### Use Cases

#### 1. Consistency Across Teams
**Scenario:** Consulting firm with 10 analysts doing gap analyses

**Without Institutional Memory:**
- Each analyst makes different priority decisions
- Client A gets Control X marked HIGH, Client B gets same control marked LOW
- Inconsistent quality, hard to defend in audits

**With Institutional Memory:**
- All analysts see how senior partners prioritized similar gaps
- Consistency improves
- New analysts learn from experienced ones

---

#### 2. Regulatory Defense
**Scenario:** Regulator asks "Why did you prioritize Control X as MEDIUM when the regulation says it's mandatory?"

**Without Institutional Memory:**
- Analyst struggles to recall rationale
- Looks like arbitrary decision

**With Institutional Memory:**
- Pull up decision log: "MEDIUM priority because compensating control TM-002 in place per risk-based approach (6AMLD Article 8)"
- Show past decisions with same logic
- Defensible, documented, consistent

---

#### 3. Quality Improvement
**Scenario:** Firm wants to improve AI recommendation accuracy

**Insight from Override Analysis:**
- "AI recommends HIGH priority for controls with regulatory citations 90% of the time"
- "Analysts override to MEDIUM 60% of the time when client has compensating controls"
- "AI doesn't detect compensating controls from uploaded policies"

**Action:**
- Update module prompt: "Check for compensating controls before prioritizing gaps"
- Improve knowledge source extraction (parse policy sections on compensating controls)

**Result:** Override rate drops from 60% to 20% — AI gets better

---

### Dashboard

**Institutional Memory Page:**

```
┌────────────────────────────────────────────────────────────┐
│ Institutional Memory Insights                             │
├────────────────────────────────────────────────────────────┤
│ Total Decisions Logged: 487                               │
│ Average Override Rate: 28%                                │
│                                                            │
│ Top Overridden Recommendations:                           │
│   1. Control TM-001 priority (60% override rate)          │
│   2. AMLR Article 4 gap scoring (45% override rate)       │
│   3. Risk R-003 severity (38% override rate)              │
│                                                            │
│ Most Common Override Reasons:                             │
│   1. "Compensating controls in place" (34%)               │
│   2. "Risk appetite allows lower priority" (22%)          │
│   3. "Already remediated in Q1" (18%)                     │
│                                                            │
│ Decision Trends:                                          │
│   [Chart: Override rate over time — declining from 45% to 20%]
│   → AI recommendations improving!                         │
└────────────────────────────────────────────────────────────┘
```

---

### Privacy & Control

**Data stored locally** — All decision logs in SQLite database on your machine

**No telemetry** — openEXPERT doesn't send decision data to external servers

**Deletion:** Users can delete decision history per client/project (GDPR compliance)

---
## PART 4: QUALITY & LEARNING

## 13. Quality Ratchet & Continuous Improvement

The Quality Ratchet ensures that output quality **never regresses** and continuously improves over time.

### The Problem

AI output quality varies. Same module, same inputs, different day → different quality. Without measurement and enforcement, quality is inconsistent and can decline.

### The Solution: Multi-Dimensional Scoring

Every output automatically scored across **6 dimensions:**

#### 1. Completeness (Coverage)
**What it measures:** Does the output address all aspects of the task?

**Scoring criteria:**
- All required sections present (executive summary, findings, action plan, etc.)
- No major gaps in analysis
- Covers full scope of request

**Examples:**
- ✅ High (9/10): Gap analysis covers all 15 AMLR chapters with detailed findings per article
- ⚠️ Medium (6/10): Gap analysis covers 10 of 15 chapters, missing crypto assets and beneficial ownership
- ❌ Low (3/10): Gap analysis only covers first 3 chapters, incomplete

---

#### 2. Accuracy (Factual Correctness)
**What it measures:** Are facts, citations, and regulatory references correct?

**Scoring criteria:**
- Regulatory citations verified (AMLR Article 4 vs. Article 40)
- Dates accurate (regulation effective dates)
- No contradictions or hallucinations
- Technical terms used correctly

**Examples:**
- ✅ High (9/10): All AMLR citations verified, effective dates correct, technical methodology sound
- ⚠️ Medium (6/10): 2 out of 10 citations incorrect, one effective date wrong
- ❌ Low (3/10): Multiple citation errors, regulation misidentified as AMLD5 instead of AMLR

---

#### 3. Structure (Logical Organization)
**What it measures:** Is the output well-organized and easy to navigate?

**Scoring criteria:**
- Clear heading hierarchy (H1 → H2 → H3)
- Logical flow (problem → analysis → solution)
- Effective use of formatting (tables, lists, emphasis)
- Executive summary at top (if required)
- Actionable recommendations clearly separated from analysis

**Examples:**
- ✅ High (9/10): Clear sections, table of contents, findings in tabular format, action plan with numbered priorities
- ⚠️ Medium (6/10): Sections present but inconsistent headings, no table, action items buried in paragraphs
- ❌ Low (3/10): Wall of text, no sections, findings and recommendations mixed together

---

#### 4. Actionability (Implementable Recommendations)
**What it measures:** Can the recipient actually do something with this output?

**Scoring criteria:**
- Recommendations are specific (not vague "improve controls")
- Who, what, when clearly stated
- Effort estimates provided
- Dependencies identified
- Verification criteria included

**Examples:**
- ✅ High (9/10): "Update TM rule TM-001 to include sanctions screening for crypto transactions. Owner: TM Manager. Timeline: Q2 2024. Effort: 20 hours. Verification: Test with 10 crypto transactions from last month."
- ⚠️ Medium (6/10): "Improve transaction monitoring controls for sanctions. Timeline: Q2 2024."
- ❌ Low (3/10): "Enhance AML controls."

---

#### 5. Citations (Regulatory References)
**What it measures:** Are regulatory sources properly cited?

**Scoring criteria:**
- Article numbers included (AMLR Article 4, not just "AMLR")
- Guidance documents referenced (EBA/GL/2024/01)
- Recitals cited where relevant
- Hyperlinks to EUR-Lex or official sources (if applicable)

**Examples:**
- ✅ High (9/10): "Per AMLR Article 4(1)(a), institutions must conduct customer due diligence (CDD) before establishing business relationships (Recital 15)."
- ⚠️ Medium (6/10): "AMLR requires CDD before onboarding."
- ❌ Low (3/10): "Regulations require customer checks."

---

#### 6. Overall Composite Score
**Calculation:** Weighted average of 5 dimensions

**Default weighting:**
- Completeness: 20%
- Accuracy: 30% (most important)
- Structure: 15%
- Actionability: 20%
- Citations: 15%

**Customizable:** Users can adjust weights per module (e.g., increase Citations weight for regulatory submissions)

---

### Baseline Establishment

**Per module:**
- First 5 sessions scored
- Average score = baseline (e.g., 7.8 for AMLR Gap Analysis)
- Future sessions compared against baseline

**Quality Ratchet Rule:**
- If session scores below baseline → flag for review
- If 3 consecutive sessions below baseline → alert (quality degradation)
- Update baseline upward when scores consistently exceed it

---

### Quality Trends

**Dashboard analytics:**
- Quality over time (line chart: last 30 sessions)
- Dimension breakdown (which dimensions strong vs. weak?)
- Module comparison (which modules produce highest quality?)
- Analyst comparison (multi-user: which analysts consistently high quality?)

**Example:**
```
┌────────────────────────────────────────────────────────────┐
│ Quality Trends: AMLR Gap Analysis                         │
├────────────────────────────────────────────────────────────┤
│ Last 30 Sessions: Avg 8.4 (↑ 0.6 from baseline 7.8)      │
│                                                            │
│ Dimension Scores:                                         │
│   Completeness:  8.8 ████████████████████░░               │
│   Accuracy:      9.1 ██████████████████████               │
│   Structure:     7.9 ███████████████░░░░░░                │
│   Actionability: 8.2 ████████████████░░░░                 │
│   Citations:     8.5 █████████████████░░░                 │
│                                                            │
│ Trend: ↗ Improving (last 10 sessions avg 8.7)            │
│ Alert: Structure scores declining (8.5 → 7.9)            │
│        Consider: Review heading templates                 │
└────────────────────────────────────────────────────────────┘
```

---

### Quality Leaderboard

**Top-performing modules** (by average quality score):
1. AMLR Gap Analysis (avg 8.7 across 45 sessions)
2. Regulatory Interpretation (avg 8.5 across 32 sessions)
3. Policy Document Creator (avg 8.3 across 28 sessions)

**Purpose:** Identify which modules produce best outputs → learn from their prompts

---

### Auto-Remediation

**If quality score < threshold (e.g., 7.0):**

**Option 1: Prompt user to re-run**
- "Quality score: 6.8/10 (below baseline 7.8). Re-run with higher thinking level?"
- User can switch from `think` → `think_hard` or `investigate`

**Option 2: Auto-suggest improvements**
- "Structure score low (6.2). Suggested fix: Add table of contents and section headers."
- "Citations score low (5.8). Suggested fix: Enable web search to verify regulatory references."

**Option 3: Require human review**
- Sessions below quality threshold auto-marked for review
- Cannot export until reviewed and approved

---

### Integration with Compliance-as-Code

**Quality rules:**
- Rule: `OUTPUT_QUALITY_001` — No session with overall score < 7.0 can be marked "approved"
- Rule: `CITATION_REQ_001` — Regulatory analyses must score > 8.0 on Citations dimension
- Violations logged, remediation required

---

### Best-in-Class Library (Future)

**Planned:**
- Identify top 10% of outputs per module (quality score > 9.0)
- Store in "best-in-class library"
- Use as examples when generating new outputs
- AI learns from highest-quality past outputs

---

## 14. Apprentice Model (4-Stage Learning)

The Apprentice Model learns from your decisions and helps you improve over time.

### The Vision

You're not just using AI — you're **training it to work your way**.

**Traditional AI:** Static. Same prompts, same behavior, forever.

**openEXPERT Apprentice:** Adaptive. Learns from every session. Progresses from beginner to expert.

---

### The 4 Stages

#### Stage 1: Observer (Default)

**What it does:**
- Records your choices (model, thinking level, creativity, output formats, knowledge sources)
- Observes how you edit prompts
- Tracks what you export
- Monitors quality scores

**What it doesn't do:**
- Make suggestions (just watches and learns)

**Progression requirement:**
- Complete 3 sessions in any module

**Time:** ~1-2 days of normal use

---

#### Stage 2: Guided Practitioner (3+ sessions)

**What it does:**
- Suggests configuration based on past sessions
  - "Last 3 AMLR gap analyses used `think_hard` + `strict` creativity — use same settings?"
  - "You always enable web search for regulatory interpretation — enable now?"
- Highlights deviations from your patterns
  - "⚠️ You usually select 3 output formats (exec summary + gap matrix + action plan), but only selected 1 this time. Add more?"

**What it doesn't do:**
- Change settings automatically (you still choose)

**Progression requirement:**
- Complete 8 sessions total + average quality score ≥ 7.0

**Time:** ~1-2 weeks of regular use

---

#### Stage 3: Supervised (8+ sessions, quality ≥ 7.0)

**What it does:**
- Auto-applies common settings based on module + past behavior
  - "Auto-selected: `think_hard` + `strict` + 3 output formats (your usual for AMLR gap analysis)"
- Suggests prompt edits
  - "You added 'Focus on crypto asset risks' to last 2 AMLR analyses. Add again?"
- Predicts output formats you'll need
  - "Based on similar gap analyses, you'll likely export to DOCX + XLSX. Pre-configure?"

**What it doesn't do:**
- Run sessions automatically (you still click "Run")

**Progression requirement:**
- Complete 20 sessions total + average quality score ≥ 8.0

**Time:** ~1-2 months of regular use

---

#### Stage 4: Autonomous (20+ sessions, quality ≥ 8.0)

**What it does:**
- Full auto-configuration based on patterns
  - Detects module type → applies your standard settings
  - Detects client type (bank, fintech, consulting) → applies relevant knowledge sources
  - Detects urgency (tight deadline) → suggests faster model (Sonnet instead of Opus)
- Proactive recommendations
  - "This gap analysis similar to [past session]. Reuse knowledge sources from that session?"
  - "Quality scores declining (8.5 → 7.9). Suggest: increase thinking level to `investigate`."
- Workflow suggestions
  - "You typically follow gap analysis with policy update. Create workflow?"

**Safety:**
- All auto-applied settings shown with ✓ badge
- User can override at any time
- "Reset to defaults" always available

**Time:** ~2-3 months of regular use

---

### What the Apprentice Learns

#### 1. Configuration Preferences

**Tracked:**
- Model selection (Opus vs. Sonnet vs. Haiku) per module type
- Thinking level preferences (quick for routine, investigate for regulatory submissions)
- Creativity settings (strict for compliance, balanced for training content)
- Output format combinations (exec summary + gap matrix + action plan = standard set)

**Example learning:**
```
Module: AMLR Gap Analysis
Pattern detected:
  - Model: claude-opus-4-6 (10/10 sessions)
  - Thinking: think_hard (8/10) or investigate (2/10)
  - Creativity: strict (10/10)
  - Output formats: {executive-summary, gap-scoring-matrix, action-plan} (9/10)
  - Knowledge sources: local_folder + claude_knowledge (10/10)

Suggestion: Auto-apply these settings for future AMLR gap analyses?
```

---

#### 2. Prompt Edits

**Tracked:**
- Text you add to system prompts
- Deletions or modifications
- Recurring phrases or instructions

**Example learning:**
```
System prompt edits (last 5 AMLR analyses):
  - Added: "Focus particularly on crypto asset risks per AMLR Annex I" (5/5 times)
  - Added: "Client operates in Sweden — reference Swedish FSA guidance" (3/5 times)

Suggestion: Save these as a custom skill "AMLR-Crypto-Sweden" for reuse?
```

---

#### 3. Output Quality Patterns

**Tracked:**
- Which settings produce highest quality scores
- Quality score trends per configuration
- Correlation between settings and quality

**Example learning:**
```
Quality analysis:
  - Sessions with thinking=investigate: avg quality 8.7
  - Sessions with thinking=think_hard: avg quality 8.1
  - Sessions with thinking=think: avg quality 7.3

Recommendation: Use `investigate` for AMLR gap analysis (0.6 point quality gain, worth extra cost)
```

---

#### 4. Follow-Up Behavior

**Tracked:**
- How often you use "Continue" button (iterative refinement)
- What you ask in follow-ups ("Add more detail on...", "Simplify this section...")
- Export actions (which formats, when)

**Example learning:**
```
Follow-up pattern detected:
  - 80% of AMLR gap analyses get 1-2 follow-ups
  - Common request: "Add more detail on data readiness requirements"
  - Common request: "Simplify executive summary for board"

Suggestion: Add these as default instructions in prompt?
```

---

### Dashboard: Apprentice Progression

**ApprenticePage.tsx:**
```
┌────────────────────────────────────────────────────────────┐
│ Apprentice Model: Your AI Learning Journey                │
├────────────────────────────────────────────────────────────┤
│ Current Stage: Supervised (Stage 3 of 4)                  │
│ Sessions Completed: 14 / 20 (70% to Autonomous)           │
│ Avg Quality Score: 8.2 / 8.0 required ✓                   │
│                                                            │
│ Progress: ████████████████░░░░                            │
│                                                            │
│ What I've Learned About Your Preferences:                 │
│   • Model: claude-opus-4-6 (preferred for regulatory)     │
│   • Thinking: think_hard or investigate                   │
│   • Creativity: strict (100% of compliance work)          │
│   • Output formats: Always include executive summary      │
│   • Knowledge sources: Local folders + web search         │
│                                                            │
│ Recent Suggestions Applied:                               │
│   ✓ Auto-selected 3 output formats (saved you 30 sec)    │
│   ✓ Enabled web search for regulatory interpretation      │
│   ✓ Suggested crypto asset focus (you accepted)           │
│                                                            │
│ Quality Impact:                                           │
│   Before Apprentice: Avg 7.6                              │
│   With Apprentice: Avg 8.2 (↑ 0.6 improvement)           │
│                                                            │
│ Next Milestone: 6 more sessions to reach Autonomous      │
└────────────────────────────────────────────────────────────┘
```

---

### Privacy & Control

**Data stored locally:** All observations in `apprentice_profiles` and `apprentice_observations` tables (SQLite, on your machine)

**User control:**
- View all learned patterns: "Show me what you've learned"
- Delete specific patterns: "Forget my Sonnet preference, use Opus"
- Reset apprentice: "Start fresh" (keeps session history, resets learned patterns)

**No telemetry:** Apprentice data stays local, never sent to openEXPERT servers

---

### Multi-User Learning (Enterprise)

**In multi-user environments:**
- Each user has their own apprentice profile
- Team lead can share "best practice patterns" with team
  - "Apply my apprentice settings to new analysts"
  - "Enforce firm-wide quality standards (always use `investigate` for regulatory submissions)"

**Use case:** Consulting firm wants consistency
- Senior partner's apprentice learns optimal settings for AMLR gap analysis
- Settings exported as "firm template"
- Junior analysts inherit these settings (but can still customize)

---

## 15. Output Versioning & Diff Engine

Every output is versioned. Compare versions. Rollback. Track changes over time.

### The Problem

**Scenario 1:** You generate a gap analysis. Client asks for revisions. You re-run with new instructions. Now you have 2 versions. Which is the latest? What changed?

**Scenario 2:** You update a policy document quarterly. 4 versions over a year. What changed from Q1 to Q4?

**Traditional approach:** Manual file naming ("AMLR_Gap_Analysis_v1_final_FINAL_revised.docx"). Error-prone.

**openEXPERT approach:** Automatic versioning + diff engine.

---

### How It Works

#### 1. Automatic Versioning

**Every output automatically versioned:**
- Version 1: Initial generation
- Version 2: After first follow-up or re-run
- Version 3: After second follow-up
- ... (unlimited)

**Metadata per version:**
- Version number (1, 2, 3, ...)
- Timestamp
- User who created it
- Config snapshot (model, thinking level, creativity, prompts used)
- Session ID
- Optional label ("Board version", "Draft for review", "Final")

**Storage:** `versions` table

---

#### 2. Version Labeling

**User can label versions:**
- "Draft"
- "For Internal Review"
- "Client Submission"
- "Final"
- "Superseded"

**Use case:**
- Generate gap analysis (v1 = "Draft")
- Follow up with "Add more detail on crypto risks" (v2 = "For Internal Review")
- Follow up with "Simplify executive summary" (v3 = "Client Submission")
- Client provides feedback, you regenerate (v4 = "Final")

**Labels help:** Quickly find "which version did we send to the client?"

---

#### 3. Diff Engine

**Compare any two versions:**
- Side-by-side view
- Highlighted changes (additions in green, deletions in red, modifications in yellow)
- Summary: "427 words added, 83 words deleted, 12 sections modified"

**Diff granularity:**
- **Line-level:** Default (fast, good for most content)
- **Word-level:** Detailed (shows exact word changes within sentences)
- **Semantic:** AI-powered (groups related changes, ignores formatting)

**Example:**
```
Version 2 → Version 3 Diff

Executive Summary
─────────────────
- [DELETED] The client's AML framework demonstrates significant gaps across 8 of 15 AMLR requirements.
+ [ADDED] The client's AML framework requires enhancements in 8 areas to achieve full AMLR compliance.

[MODIFIED] Priority recommendations include: implementing crypto asset risk assessment (AMLR Article 4, Annex I)
[MODIFIED] implementing crypto asset screening (AMLR Article 4, Annex I)

Gap Scoring Matrix
──────────────────
[NO CHANGES]

Detailed Findings
─────────────────
+ [ADDED] Section 3.2: Crypto Asset Risk Assessment
  The client currently lacks documented risk assessment procedures for crypto asset exposures...
```

---

#### 4. Version Comparison Table

**Visual comparison of all versions:**

| Version | Date | Label | Model | Thinking | Word Count | Quality Score |
|---------|------|-------|-------|----------|------------|---------------|
| v4 | 2024-06-15 | Final | Opus 4.6 | investigate | 4,850 | 8.7 |
| v3 | 2024-06-14 | Client Submission | Opus 4.6 | investigate | 4,200 | 8.3 |
| v2 | 2024-06-13 | For Review | Opus 4.6 | think_hard | 3,800 | 7.9 |
| v1 | 2024-06-12 | Draft | Sonnet 4.5 | think | 3,200 | 7.2 |

**Insights:**
- Version 4 is longest and highest quality (used `investigate`, Opus model)
- Version 1 was quick draft (Sonnet, `think` level)
- Word count grew by 51% (v1 → v4) as analysis deepened

---

#### 5. Rollback

**Restore previous version:**
- Select version to restore
- Click "Rollback to this version"
- Creates new version (v5 = copy of v2)

**Use case:** Client prefers simpler v2 over detailed v4 → rollback, continue from v2

---

#### 6. Branch & Merge (Future)

**Planned:**
- Create branches from a version (explore alternative approaches)
- Branch A: "Conservative risk appetite approach"
- Branch B: "Aggressive risk appetite approach"
- Compare branches
- Merge best parts of both

---

### Use Cases

#### 1. Iterative Refinement

**Scenario:** Policy document requires 5 rounds of stakeholder feedback

**Workflow:**
- v1: Initial draft (AI generation)
- v2: Incorporate legal team comments
- v3: Incorporate risk team comments
- v4: Incorporate board comments
- v5: Final approved version

**Benefit:** Full audit trail. See exactly how document evolved.

---

#### 2. Regulatory Submissions

**Scenario:** Regulator asks "Why did you change your conclusion from the draft to final submission?"

**Response:**
- Pull up version diff (draft vs. final)
- Show exactly what changed and why
- Defend rationale with decision log (checkpoint decisions linked to versions)

**Benefit:** Regulatory defensibility

---

#### 3. Quality Comparison

**Scenario:** Testing whether `investigate` thinking level worth extra cost vs. `think_hard`

**Experiment:**
- Generate v1 with `think_hard` (quality: 7.8, cost: $1.20)
- Generate v2 with `investigate` (quality: 8.5, cost: $2.80)
- Compare: 0.7 quality point gain for $1.60 extra cost
- Decision: Worth it for regulatory submissions, not for internal drafts

**Benefit:** Data-driven optimization

---

#### 4. Team Collaboration

**Scenario:** 2 analysts working on same gap analysis, different perspectives

**Workflow:**
- Analyst A generates v1 (focus on operational gaps)
- Analyst B generates v2 from same session (focus on regulatory gaps)
- Compare versions, identify gaps each missed
- Create v3 combining best insights from both

**Benefit:** Collaborative refinement

---

### Dashboard: Version History Page

**VersionHistoryPage.tsx:**
```
┌────────────────────────────────────────────────────────────┐
│ Version History: AMLR Gap Analysis — Nordea               │
├────────────────────────────────────────────────────────────┤
│ 4 versions • Latest: v4 (Final) • Created: 2024-06-15     │
│                                                            │
│ ┌────────────────────────────────────────────────────┐    │
│ │ v4 • Jun 15, 2024 14:30 • Final                   │    │
│ │ 4,850 words • Quality: 8.7 • Opus + investigate    │    │
│ │ [View] [Download] [Diff with v3]                   │    │
│ └────────────────────────────────────────────────────┘    │
│                                                            │
│ ┌────────────────────────────────────────────────────┐    │
│ │ v3 • Jun 14, 2024 11:20 • Client Submission       │    │
│ │ 4,200 words • Quality: 8.3 • Opus + investigate    │    │
│ │ [View] [Download] [Diff with v4] [Rollback]       │    │
│ └────────────────────────────────────────────────────┘    │
│                                                            │
│ ┌────────────────────────────────────────────────────┐    │
│ │ v2 • Jun 13, 2024 16:45 • For Review              │    │
│ │ 3,800 words • Quality: 7.9 • Opus + think_hard     │    │
│ │ [View] [Download] [Diff with v3] [Rollback]       │    │
│ └────────────────────────────────────────────────────┘    │
│                                                            │
│ ┌────────────────────────────────────────────────────┐    │
│ │ v1 • Jun 12, 2024 09:15 • Draft                   │    │
│ │ 3,200 words • Quality: 7.2 • Sonnet + think        │    │
│ │ [View] [Download] [Diff with v2] [Rollback]       │    │
│ └────────────────────────────────────────────────────┘    │
│                                                            │
│ Compare: [v1 ▼] with [v4 ▼] → [Show Diff]                │
└────────────────────────────────────────────────────────────┘
```

---

### Integration with Audit Log

**Every version linked to audit log:**
- When version created (session ID)
- What settings used (model, thinking, creativity)
- Token usage and cost per version
- Review status (draft, reviewed, approved)

**Benefit:** Complete traceability

---
## PART 5: AUTOMATION & GOVERNANCE

## 16. Time Intelligence & Regulatory Radar

Time Intelligence helps you **never miss a deadline** and **stay ahead of regulatory changes**.

### The Challenge

Compliance professionals juggle dozens of deadlines:
- Regulatory implementation dates (AMLR go-live: January 2027)
- Consultation periods (EBA RTS comments due: March 15, 2024)
- Internal audit schedules (Q2 AML audit: June 2024)
- Recurring reporting (Annual MLRO report: January 31 every year)
- Project milestones (TM system upgrade: Q3 2024)

**Manual tracking:** Spreadsheets, calendar reminders. Error-prone. No dependency awareness.

**openEXPERT Time Intelligence:** Automated deadline tracking + dependency mapping + regulatory radar.

---

### Component 1: Deadline Tracking

#### Features

**1. Deadline Storage**
- **Table:** `deadlines`
- **Fields:** name, deadline_date, category, priority, status, buffer_days, prep_days, review_days, dependencies

**2. Categories:**
- Regulatory (implementation dates, consultation closures)
- Audit (internal/external audit schedules)
- Reporting (recurring compliance reports)
- Project (implementation milestones)
- Training (mandatory training completion)

**3. Priority Levels:**
- Critical (regulatory breach risk)
- High (audit finding risk)
- Medium (internal milestone)
- Low (aspirational target)

**4. Status Tracking:**
- Upcoming (> 30 days away)
- At Risk (< 30 days, not started)
- In Progress (work underway)
- Overdue (past deadline)
- Completed
- Deferred

---

#### Smart Buffering

**Buffer types:**

**Preparation Days:**
- How many days needed to prepare before deadline?
- Example: AMLR implementation (deadline: Jan 10, 2027) → prep_days: 180 → start work by: July 13, 2026

**Review Days:**
- How many days needed for review/approval before submission?
- Example: EBA consultation response (deadline: Mar 15, 2024) → review_days: 10 → submit for review by: Mar 5, 2024

**Total Buffer:**
- Earliest start date = deadline - prep_days - review_days
- Auto-calculate: "You should start this work by [date]"

---

#### Dependency Mapping

**Dependencies:**
- Task A blocks Task B ("Complete gap analysis before starting policy update")
- Task B cannot start until Task A completes

**Example cascade:**
```
Deadline: AMLR Compliance (Jan 10, 2027)
  ↓ blocks
Task A: AMLR Gap Analysis (complete by: Jul 13, 2026)
  ↓ blocks
Task B: Policy Updates (complete by: Oct 13, 2026)
  ↓ blocks
Task C: Training Delivery (complete by: Dec 13, 2026)
  ↓ blocks
Task D: Control Testing (complete by: Jan 5, 2027)
```

**Auto-calculation:** If Task A delayed by 2 weeks → all downstream tasks shift by 2 weeks → risk alert if final deadline missed

---

#### Recurring Deadlines

**Work rhythms:**
- Annual: "MLRO Report due January 31 every year"
- Quarterly: "Q1 AML stats to board (Apr 30), Q2 (Jul 31), Q3 (Oct 31), Q4 (Jan 31)"
- Monthly: "Transaction monitoring review by 5th of each month"

**Auto-generation:** System creates next occurrence when current one completed

---

#### Dashboard: Deadlines Page

**DeadlinesPage.tsx:**
```
┌────────────────────────────────────────────────────────────┐
│ Deadlines & Time Intelligence                             │
├────────────────────────────────────────────────────────────┤
│ 🚨 At Risk (7)  |  ⏰ Upcoming (12)  |  ✅ Completed (45) │
│                                                            │
│ ── Critical ─────────────────────────────────────────────  │
│                                                            │
│ 🔴 AMLR Implementation                                    │
│    Deadline: Jan 10, 2027 (224 days)                      │
│    Status: At Risk (should have started by Jul 13, 2026)  │
│    Dependencies: 4 tasks blocked                          │
│    [Start Gap Analysis] [View Plan]                       │
│                                                            │
│ 🟡 EBA RTS Consultation Response                          │
│    Deadline: Mar 15, 2024 (12 days)                       │
│    Status: In Progress                                    │
│    Review due: Mar 5, 2024 (2 days) ⚠️                    │
│    [Upload Draft] [Assign Reviewer]                       │
│                                                            │
│ ── High Priority ────────────────────────────────────────  │
│                                                            │
│ 🟢 Q2 AML Audit                                           │
│    Deadline: Jun 30, 2024 (102 days)                      │
│    Status: Upcoming                                       │
│    Prep starts: May 1, 2024 (73 days)                     │
│    [Create Audit Plan]                                    │
│                                                            │
│ [Filter: All | Critical | High | Medium | Low]            │
│ [View: Calendar | List | Gantt]                           │
└────────────────────────────────────────────────────────────┘
```

---

### Component 2: Living Regulatory Radar

**Purpose:** Automatically monitor regulatory publications and surface what matters

#### How It Works

**1. Source Configuration**
- **Table:** `radar_sources`
- **Source types:** RSS feed, Web page scraping, EUR-Lex API, Custom API

**5 Default Sources (seeded):**

| Source | Type | URL | Fetch Interval |
|--------|------|-----|----------------|
| EBA News & Publications | RSS | https://www.eba.europa.eu/news-rss | Every 6 hours |
| ESMA News | Web Scrape | https://www.esma.europa.eu/press-news | Daily |
| FATF Publications | Web Scrape | https://www.fatf-gafi.org/publications/ | Daily |
| EU AML/CFT (EUR-Lex) | EUR-Lex API | EUR-Lex search (AML, CFT, sanctions) | Daily |
| ECB Banking Supervision | RSS | https://www.bankingsupervision.europa.eu/press/rss | Every 6 hours |

**Custom sources:** Users can add their own (national regulators, industry bodies, law firms)

---

**2. Automated Fetching**
- **Scheduler:** Node-cron runs fetch jobs at configured intervals
- **Fetch process:**
  - RSS: Parse XML, extract title, link, publication date
  - Web scrape: Cheerio HTML parsing, extract article links and titles
  - EUR-Lex API: Query by keywords, fetch latest regulations and consultations
  - API: Call custom REST endpoint, parse JSON response

**3. AI-Powered Scoring**

Every fetched item sent to Claude for analysis:

**Prompt:**
```
Analyze this regulatory item for relevance to financial crime prevention and compliance:

Title: "EBA publishes final draft RTS on strong customer authentication under PSD2"
Summary: [fetched summary or first 500 words]
Source: EBA News
Published: 2024-02-15

Rate on three dimensions (0-1 scale):
1. Relevance: How relevant to AML/CFT, sanctions, FCP compliance?
2. Urgency: How soon must action be taken? (consultation deadline, implementation date)
3. Impact: How significant is the change? (minor clarification vs. major new requirement)

Also identify:
- Affected areas (AML, sanctions, KYC, TM, SAR, data protection, etc.)
- Consultation period (if applicable, extract deadline)
- Implementation date (if applicable, extract date)
```

**Claude Response (structured JSON):**
```json
{
  "relevance_score": 0.3,
  "urgency_score": 0.2,
  "impact_score": 0.4,
  "affected_areas": ["payments", "authentication"],
  "consultation_deadline": null,
  "implementation_date": "2025-06-01",
  "summary": "PSD2 RTS on SCA — low relevance to AML (focused on payment authentication, not FCP)"
}
```

**4. Filtering & Lifecycle**

**Relevance threshold:** Only store items with `relevance_score > 0.5` (customizable)

**Item lifecycle:**
- **New:** Just fetched, not reviewed
- **Reviewed:** User opened and read
- **Actioned:** User created task/deadline from item
- **Dismissed:** User marked as not relevant
- **Archived:** Older items auto-archived after 90 days

---

**5. Dashboard Integration**

**Dashboard Widget (RadarWidget.tsx):**
```
┌────────────────────────────────────────────────────────────┐
│ 📡 Regulatory Radar                 [3 High] [View All →] │
├────────────────────────────────────────────────────────────┤
│ 🔴 EBA GL 2024/05: AML Risk Factors (Updated)             │
│    Relevance: 95% · Consultation closes: Mar 20, 2024     │
│    [Read] [Add Deadline] [Dismiss]                        │
│                                                            │
│ 🟡 AMLA Regulation: Final Text Published                  │
│    Relevance: 88% · Implementation: Jul 2027              │
│    [Read] [Add Deadline] [Dismiss]                        │
│                                                            │
│ 🟢 FATF: Revised Guidance on Crypto Assets                │
│    Relevance: 76% · Published: Feb 10, 2024               │
│    [Read] [Add Deadline] [Dismiss]                        │
└────────────────────────────────────────────────────────────┘
```

**Full Page (RadarPage.tsx):**
- All items with filters (source, area, relevance, date range)
- Search within titles/summaries
- Mark as reviewed/actioned/dismissed
- Bulk actions ("Add all consultations as deadlines")

---

**6. Automatic Deadline Creation**

**One-click deadline creation:**
- User clicks "Add Deadline" on radar item
- Pre-populates deadline form:
  - Name: Item title
  - Deadline: Consultation close or implementation date
  - Category: Regulatory
  - Priority: Based on impact score
  - Prep/review buffers: Suggested based on deadline type

**Example:**
```
Radar Item: "EBA Consultation: RTS on AMLR Article 4"
  Consultation closes: Mar 20, 2024

  → Click "Add Deadline"

Auto-populated deadline:
  Name: "EBA Consultation Response: AMLR Article 4 RTS"
  Deadline: Mar 20, 2024
  Category: Regulatory
  Priority: High
  Prep days: 30 (suggested)
  Review days: 10 (suggested)
  → Earliest start: Feb 9, 2024
```

---

### Use Cases

#### 1. Proactive Compliance
**Scenario:** EBA publishes consultation paper on Friday afternoon

**Without Radar:**
- Compliance officer might miss it (checking EBA website manually)
- Discovers consultation 2 weeks later
- Scrambles to respond before deadline

**With Radar:**
- Radar fetches item Friday evening
- AI scores relevance: 92% (high)
- Appears on Monday dashboard: "🔴 New EBA consultation, closes in 28 days"
- One-click deadline creation
- Start work with full preparation time

---

#### 2. Regulatory Change Tracking
**Scenario:** Compliance team wants to track all AMLR-related developments

**Setup:**
- Configure EUR-Lex source with keyword filter: "AMLR, AMLA, 2024/1624"
- Set relevance threshold: 70%

**Result:**
- Auto-capture: final regulations, RTS, ITS, guidelines, consultations
- Timeline view: see all AMLR developments chronologically
- Export: "All AMLR items Jan-Jun 2024" → compliance committee report

---

#### 3. Multi-Jurisdiction Monitoring
**Scenario:** Bank operates in 5 Nordic countries, must track national regulators

**Setup:**
- Add custom sources:
  - Swedish FSA (Finansinspektionen) — RSS
  - Finnish FSA (FIN-FSA) — Web scrape
  - Norwegian FSA (Finanstilsynet) — RSS
  - Danish FSA (Finanstilsynet) — Web scrape
  - Icelandic FSA (FME) — Web scrape

**Result:**
- Unified regulatory feed across 5 jurisdictions
- AI auto-tags items by country
- Filter: "Show me Swedish-only items"

---

## 17. Compliance-as-Code

Compliance-as-Code turns regulatory requirements into **executable rules** that run automatically.

### The Vision

**Traditional compliance:** Manual checks. Humans review outputs. Inconsistent. Slow.

**Compliance-as-Code:** Automated rule execution. Every session checked against codified rules. Consistent. Fast. Defensible.

---

### How It Works

#### 1. Rule Definition

**Table:** `compliance_rules`

**Rule structure:**
```json
{
  "rule_id": "TOKEN_LIMIT_001",
  "name": "Input Token Limit",
  "description": "Ensure input does not exceed 180k tokens (Claude Opus limit)",
  "category": "operational",
  "severity": "critical",
  "rule_type": "threshold",
  "rule_logic": {
    "field": "input_token_count",
    "operator": "greater_than",
    "threshold": 180000,
    "warning_threshold": 150000
  },
  "auto_remediation": "truncate",
  "is_active": true
}
```

---

#### 2. Rule Types

**A. Threshold Rules**
Compare field value against threshold

**Examples:**
- `TOKEN_LIMIT_001`: input_token_count > 180,000 → FAIL
- `SESSION_LENGTH_001`: output_word_count > 10,000 → WARNING
- `QUALITY_MIN_001`: quality_score < 7.0 → FAIL

**B. Pattern Rules**
Regex matching on text content

**Examples:**
- `CITATION_REQ_001`: If module_category = "regulatory" AND output does NOT match regex `\[AMLR Article \d+\]` → FAIL ("Regulatory analysis must cite AMLR articles")
- `TODO_CHECK_001`: If output matches regex `TODO|FIXME` → FAIL ("No TODO/FIXME allowed in final output")

**C. Composite Rules**
Combine multiple conditions (AND/OR logic)

**Example:**
```json
{
  "rule_id": "HIGH_RISK_REVIEW_001",
  "name": "High-Risk Output Requires Review",
  "rule_type": "composite",
  "rule_logic": {
    "operator": "OR",
    "conditions": [
      {"field": "module_category", "operator": "equals", "value": "regulatory_submission"},
      {"field": "quality_score", "operator": "less_than", "value": 7.5},
      {"field": "output_word_count", "operator": "greater_than", "value": 8000}
    ]
  },
  "action": "require_review"
}
```

**D. Lookup Rules**
Whitelist/blacklist validation

**Example:**
```json
{
  "rule_id": "MODEL_WHITELIST_001",
  "name": "Approved Models Only",
  "rule_type": "lookup",
  "rule_logic": {
    "field": "model",
    "operator": "in_list",
    "whitelist": ["claude-opus-4-6", "claude-sonnet-4-5-20250929"]
  },
  "severity": "critical"
}
```

---

#### 3. Rule Execution

**When rules run:**
- **Pre-execution:** Before API call (validate inputs, settings)
- **Post-execution:** After output received (validate quality, content, citations)
- **On export:** Before allowing export (ensure approved outputs only)

**Execution process:**
1. Load active rules for module category
2. Evaluate each rule against session data
3. Log results to `rule_executions` table
4. If violations found → log to `rule_violations` table
5. Apply actions (block, warn, require review, auto-remediate)

---

#### 4. Rule Violations

**Violation tracking:**
- **Table:** `rule_violations`
- **Fields:** rule_id, session_id, violation_details, severity, status, remediation_notes, remediated_at

**Violation lifecycle:**
1. **Open:** Just detected
2. **Remediated:** User fixed (e.g., re-ran with lower token count)
3. **Accepted Risk:** User acknowledges, provides justification
4. **False Positive:** Rule triggered incorrectly, dismissed

---

#### 5. Auto-Remediation

**Some rules can self-fix:**

**Example 1: Token Limit Exceeded**
- Rule: `TOKEN_LIMIT_001` (input > 180k tokens)
- Auto-remediation: "truncate" (summarize large documents to fit limit)
- Action: AI summarizes longest document, re-checks token count

**Example 2: Missing Citations**
- Rule: `CITATION_REQ_001` (no AMLR citations in regulatory analysis)
- Auto-remediation: "insert_placeholders" (add `[CITATION NEEDED]` markers)
- Action: Append note: "⚠️ Citations required. Re-run with web search or upload regulation text."

**Example 3: Output Too Short**
- Rule: `OUTPUT_MIN_LENGTH_001` (output < 500 words for gap analysis)
- Auto-remediation: "extend" (prompt AI to add more detail)
- Action: Auto-follow-up: "Expand findings section with more detail per requirement"

---

### Seeded Rules (8 Default Rules)

#### 1. TOKEN_LIMIT_001
**Category:** Operational
**Severity:** Critical
**Rule:** input_token_count > 180,000 → FAIL
**Warning:** input_token_count > 150,000 → WARNING
**Remediation:** Truncate or summarize large documents

#### 2. OUTPUT_QUALITY_001
**Category:** Quality
**Severity:** High
**Rule:** output matches regex `TODO|FIXME|TBD` → FAIL
**Remediation:** Flag for user review, block export

#### 3. MODEL_WHITELIST_001
**Category:** Governance
**Severity:** Critical
**Rule:** model NOT IN [claude-opus-4-6, claude-sonnet-4-5-20250929] → FAIL
**Rationale:** Only approved models for regulatory work
**Remediation:** Block execution, suggest Opus or Sonnet

#### 4. CITATION_REQ_001
**Category:** Regulatory
**Severity:** High
**Rule:** IF module_category = "regulatory" AND output does NOT match `\[AMLR Article \d+\]|\[6AMLD Article \d+\]` → FAIL
**Remediation:** Warn user, suggest enabling web search or uploading regulation

#### 5. TRANSPARENCY_001
**Category:** Governance
**Severity:** Medium
**Rule:** IF module_category = "regulatory_submission" AND transparency_level < 1 → FAIL
**Rationale:** Regulatory submissions must show thinking (audit trail)
**Remediation:** Auto-set transparency_level = 1

#### 6. DATA_SOURCE_001
**Category:** Quality
**Severity:** High
**Rule:** IF module_category = "gap_analysis" AND knowledge_sources = "none" → FAIL
**Rationale:** Gap analysis requires reference material (regulation text or client docs)
**Remediation:** Prompt user to add knowledge sources

#### 7. REVIEW_CYCLE_001
**Category:** Governance
**Severity:** High
**Rule:** IF quality_score < 7.0 OR output_word_count > 8000 → require_review
**Remediation:** Set review_status = "draft", block export until reviewed

#### 8. SESSION_LENGTH_001
**Category:** Operational
**Severity:** Medium
**Rule:** IF output_word_count > 10,000 → WARNING
**Rationale:** Very long outputs may be unfocused
**Remediation:** Suggest breaking into multiple sessions

---

### Dashboard: Compliance Page

**CompliancePage.tsx:**
```
┌────────────────────────────────────────────────────────────┐
│ Compliance-as-Code Dashboard                              │
├────────────────────────────────────────────────────────────┤
│ Active Rules: 8  |  Executions (30d): 487  |  Violations: 12│
│                                                            │
│ ── Recent Violations ──────────────────────────────────────│
│                                                            │
│ 🔴 CITATION_REQ_001: Missing regulatory citations         │
│    Session: AMLR Gap Analysis — Client X                  │
│    Status: Open                                            │
│    Detected: 2 hours ago                                   │
│    [View Session] [Remediate] [Accept Risk]               │
│                                                            │
│ 🟡 QUALITY_MIN_001: Quality score below threshold         │
│    Session: Policy Update — AML Policy v3                 │
│    Status: Remediated (re-ran with `investigate`)         │
│    Detected: Yesterday                                     │
│    [View Session]                                          │
│                                                            │
│ ── Rule Performance ───────────────────────────────────────│
│                                                            │
│ Most Triggered Rules (30 days):                           │
│   1. SESSION_LENGTH_001 (42 warnings)                     │
│   2. CITATION_REQ_001 (8 failures)                        │
│   3. QUALITY_MIN_001 (6 failures)                         │
│                                                            │
│ Violation Resolution:                                     │
│   • Remediated: 67% (8/12)                                │
│   • Accepted Risk: 25% (3/12)                             │
│   • Open: 8% (1/12)                                        │
│                                                            │
│ [Create Custom Rule] [Export Audit Report]                │
└────────────────────────────────────────────────────────────┘
```

---

### Custom Rule Creation

**Users can define their own rules:**

**Example: Firm-Specific Citation Standard**
```json
{
  "rule_id": "FIRM_CITATION_001",
  "name": "Firm Citation Format",
  "description": "All regulatory analyses must use firm's citation format: [REG-ID Article X(Y)]",
  "category": "governance",
  "severity": "medium",
  "rule_type": "pattern",
  "rule_logic": {
    "field": "output_content",
    "regex": "\\[AMLR-2024-1624 Article \\d+\\(\\d+\\)\\]",
    "min_matches": 3
  },
  "action": "warn",
  "is_active": true
}
```

---

## 18. Workflow Automation & Scheduling

Workflows automate multi-step processes and reduce manual work.

### What Is a Workflow?

**A sequence of steps** that run automatically or semi-automatically.

**Example workflow: AMLR Implementation**
```
Step 1: Gap Analysis (module execution)
   ↓
Step 2: Review Gap Analysis (checkpoint — human decision)
   ↓
Step 3: Create Action Plan (module execution)
   ↓
Step 4: Assign Actions to Team (step assignment)
   ↓
Step 5: Schedule Follow-Up Review (deadline creation)
```

---

### Step Types

openEXPERT supports **12 step types:**

#### 1. Module Execution
Run an openEXPERT module (gap analysis, policy creation, etc.)

**Configuration:**
- Module ID
- Input variables (from previous steps)
- Model, thinking, creativity, output formats
- Knowledge sources

**Output:** Session result stored, available to next steps

---

#### 2. Checkpoint (Human Decision)
Pause workflow, ask human to decide

**Use cases:**
- "Approve gap analysis before proceeding to remediation?"
- "Select priority: HIGH, MEDIUM, or LOW?"
- "Enter additional context for policy update"

**Implementation:**
- Workflow pauses
- User notified
- User reviews output, makes decision
- Decision logged (institutional memory)
- Workflow continues with user's choice

---

#### 3. API Call
Call external REST API

**Use cases:**
- Send gap analysis to client portal
- Fetch client data from CRM
- Create Jira ticket for remediation action

**Configuration:**
- URL, method (GET, POST, PUT, DELETE)
- Headers (authorization, content-type)
- Body (JSON template with variable substitution)
- Response parsing (extract fields from response)

---

#### 4. Database Query
Query internal or external database

**Use cases:**
- Fetch client list from client management DB
- Retrieve historical gap analysis scores
- Check user permissions

**Configuration:**
- Connection ID (from connections framework)
- SQL query (parameterized)
- Result handling (single row, multiple rows, scalar)

---

#### 5. File Read
Read file from filesystem

**Use cases:**
- Read template document
- Load regulation text for knowledge source
- Import CSV data

---

#### 6. File Write
Write file to filesystem

**Use cases:**
- Save output as PDF
- Export gap analysis to network drive
- Create backup

---

#### 7. Script Execution
Run Python, bash, R, PowerShell, or Node.js script

**Use cases:**
- Data transformation (CSV → JSON)
- ML model inference (predict risk score)
- Integration with legacy systems

**Security:** Sandboxed execution (configurable memory, runtime, network limits)

---

#### 8. Email
Send email notification

**Use cases:**
- Notify MLRO when gap analysis complete
- Send consultation deadline reminder
- Distribute board report

**Configuration:**
- Recipients (to, cc, bcc)
- Subject (template with variables)
- Body (Markdown or HTML)
- Attachments (output files)

---

#### 9. Decision Gate (Branching)
Conditional logic — if X, do Y; else do Z

**Use cases:**
- "If quality score < 7.5, send for review; else proceed"
- "If gap score > 50%, escalate to board; else proceed to remediation"

**Configuration:**
- Condition (field, operator, value)
- True path (steps to execute if condition met)
- False path (steps to execute if condition not met)

---

#### 10. Transform (Data Manipulation)
Transform data between steps

**Use cases:**
- Extract findings from gap analysis output (regex or AI)
- Convert table to CSV
- Aggregate scores

---

#### 11. Loop
Repeat steps for each item in a list

**Use cases:**
- "For each client in list, run gap analysis"
- "For each control, generate policy section"

**Configuration:**
- List source (array variable from previous step)
- Steps to repeat (module execution, API call, etc.)
- Aggregation (combine results)

---

#### 12. Parallel
Execute multiple steps simultaneously

**Use cases:**
- "Run gap analysis + risk assessment in parallel"
- "Send email to 10 stakeholders simultaneously"

**Configuration:**
- Steps to run in parallel
- Synchronization (wait for all, or continue after first)

---

### Workflow Builder

**Visual workflow editor (WorkflowBuilder.tsx):**

```
┌────────────────────────────────────────────────────────────┐
│ Workflow Builder: AMLR Implementation                     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ [START]                                                    │
│    │                                                       │
│    ├──[1. Gap Analysis]────────────────────────┐          │
│    │   Module: AMLR Gap Analysis               │          │
│    │   Model: claude-opus-4-6                  │          │
│    │   Knowledge: Local folder + web search    │          │
│    └───────────────────────────────────────────┘          │
│    │                                                       │
│    ├──[2. Checkpoint: Review Findings]─────────┐          │
│    │   Decision: Approve / Request Changes     │          │
│    │   Assigned to: ${mlro_email}              │          │
│    └───────────────────────────────────────────┘          │
│    │                                                       │
│    ├──[3. Decision Gate]───────────────────────┐          │
│    │   If: checkpoint_decision = "Approve"     │          │
│    │   Then: Continue                          │          │
│    │   Else: Loop back to Step 1               │          │
│    └───────────────────────────────────────────┘          │
│    │                                                       │
│    ├──[4. Create Action Plan]──────────────────┐          │
│    │   Module: Action Plan Builder             │          │
│    │   Input: ${step1.output.findings}         │          │
│    └───────────────────────────────────────────┘          │
│    │                                                       │
│    ├──[5. Parallel: Assign Actions]────────────┐          │
│    │   For each: ${step4.output.actions}       │          │
│    │   Step: Assign to team member              │          │
│    │         Send email notification            │          │
│    └───────────────────────────────────────────┘          │
│    │                                                       │
│    ├──[6. Create Deadline]─────────────────────┐          │
│    │   Name: "AMLR Remediation Complete"       │          │
│    │   Date: ${step4.output.target_date}       │          │
│    │   Category: Regulatory                     │          │
│    └───────────────────────────────────────────┘          │
│    │                                                       │
│ [END]                                                      │
│                                                            │
│ [Save Workflow] [Test Run] [Schedule] [Publish]           │
└────────────────────────────────────────────────────────────┘
```

---

### Workflow Scheduling

**Cron-based automation:**
- **Table:** `workflow_schedules`
- **CRON expression:** "0 9 * * 1" (every Monday at 9 AM)

**Use cases:**
- **Weekly status report:** Run gap analysis scoring every Monday
- **Monthly compliance check:** Auto-check quality scores on 1st of month
- **Quarterly audit prep:** Generate pre-audit checklist 30 days before Q-end

**Dashboard:**
```
Scheduled Workflows:
  • Weekly AML Stats Report (every Monday 9 AM)
    Last run: Feb 19, 2024 9:00 AM (success)
    Next run: Feb 26, 2024 9:00 AM

  • Monthly Deadline Review (1st of each month)
    Last run: Feb 1, 2024 8:00 AM (success)
    Next run: Mar 1, 2024 8:00 AM
```

---

### Workflow Execution Monitoring

**WorkflowMonitor.tsx:**
```
┌────────────────────────────────────────────────────────────┐
│ Workflow Monitor: AMLR Implementation (Run #47)            │
├────────────────────────────────────────────────────────────┤
│ Status: Running  |  Started: 2024-02-20 10:15  |  Step: 3/6│
│                                                            │
│ ✅ Step 1: Gap Analysis (completed in 2m 34s)             │
│    Output: 4,850 words, quality 8.7                       │
│    [View Output]                                           │
│                                                            │
│ ✅ Step 2: Checkpoint — Review Findings (approved)         │
│    Decision: Approved by jane.smith@advisense.com         │
│    Timestamp: 2024-02-20 10:18                            │
│                                                            │
│ 🔄 Step 3: Create Action Plan (in progress...)            │
│    Status: Waiting for Claude API response                │
│    Elapsed: 45s                                            │
│                                                            │
│ ⏸️ Step 4: Assign Actions (waiting)                        │
│ ⏸️ Step 5: Create Deadline (waiting)                       │
│ ⏸️ Step 6: Send Notification (waiting)                     │
│                                                            │
│ [Pause Workflow] [Cancel] [View Logs]                     │
└────────────────────────────────────────────────────────────┘
```

---

## 19. Collaborative Canvas (Multi-Human Workflows)

Collaborative Canvas enables **team-based workflows** with step assignment, parallel reviews, and consensus tracking.

### The Problem

**Scenario:** Gap analysis requires:
1. Analyst to run analysis
2. Senior analyst to review findings
3. Legal counsel to review compliance interpretation
4. MLRO to approve before client submission

**Traditional approach:** Email chain. Version confusion. No tracking. Slow.

**Collaborative Canvas:** Structured workflow with assigned steps, SLA tracking, parallel reviews, and consensus.

---

### How It Works

#### 1. Step Assignment

**Assign workflow steps to specific people:**
- **Table:** `step_assignments`
- **Fields:** workflow_execution_id, step_number, assigned_to, assigned_at, due_date, status

**Status lifecycle:**
- Pending (not started)
- In Progress (assignee working)
- Completed (done)
- Overdue (past due_date)
- Reassigned (moved to different person)

**SLA Tracking:**
- Each assignment has due_date
- Auto-calculate: step created + SLA hours = due_date
- Overdue auto-detection
- Escalation (future): notify manager if overdue

---

#### 2. Parallel Reviews

**Multiple reviewers on same step:**
- **Table:** `parallel_reviews`
- **Fields:** step_assignment_id, reviewer_email, review_status, consensus_required, comments

**Review status per reviewer:**
- Pending (not reviewed)
- Approved
- Rejected (with comments)
- Abstained (no opinion)

**Consensus modes:**
- **All must approve:** All reviewers must approve before proceeding
- **Majority:** 51%+ approve = proceed
- **Any approve:** At least one approves = proceed
- **Advisory only:** Reviews recorded but don't block workflow

---

#### 3. Canvas Comments

**Threaded discussions on outputs:**
- **Table:** `canvas_comments`
- **Fields:** session_id, step_number, author, comment_type, content, resolved, parent_comment_id

**Comment types:**
- **Comment:** General feedback
- **Suggestion:** Proposed change
- **Concern:** Issue to address
- **Approval:** Explicit sign-off

**Resolution tracking:**
- Comments can be marked "resolved"
- Only unresolved comments block approval (if configured)

---

#### 4. Example Workflow

**Workflow:** AMLR Gap Analysis — Client Submission

**Step 1: Initial Analysis**
- Assigned to: Analyst (jane.analyst@firm.com)
- SLA: 3 days
- Status: Completed (2 days)
- Output: Gap analysis draft

**Step 2: Parallel Review**
- Reviewer 1: Senior Analyst (john.senior@firm.com)
  - Status: Approved
  - Comment: "Findings look solid, minor typos fixed"
- Reviewer 2: Legal Counsel (lisa.legal@firm.com)
  - Status: Approved with concerns
  - Comment: "GDPR interpretation needs citation, see comment #3"
- Reviewer 3: MLRO (mlro@firm.com)
  - Status: Pending (2 days overdue ⚠️)
- Consensus: All required (blocked until MLRO reviews)

**Step 3: Address Feedback**
- Assigned to: Analyst (reassigned from Step 1)
- Task: Address legal concern, add GDPR citation
- Status: In Progress

**Step 4: Final Approval**
- Assigned to: MLRO
- Task: Final sign-off
- Status: Pending

---

#### 5. Collaborative Canvas Dashboard

**Canvas interface:**
```
┌────────────────────────────────────────────────────────────┐
│ Collaborative Canvas: AMLR Gap Analysis — Nordea          │
├────────────────────────────────────────────────────────────┤
│ Workflow Status: Review (Step 2 of 4)                     │
│ Assigned to: You + 2 reviewers                            │
│ Due: Feb 22, 2024 (in 2 days)                             │
│                                                            │
│ ── Current Step: Parallel Review ──────────────────────────│
│                                                            │
│ Your Task: Review gap analysis findings                   │
│                                                            │
│ [📄 View Draft Output]                                     │
│                                                            │
│ Other Reviewers:                                          │
│   ✅ John Senior — Approved (yesterday)                   │
│       "Findings solid, minor typos fixed"                 │
│                                                            │
│   ⚠️ Lisa Legal — Approved with concerns (yesterday)      │
│       "GDPR interpretation needs citation" [View Comment] │
│                                                            │
│   ⏳ You — Pending                                         │
│       [Approve] [Reject] [Add Comment]                    │
│                                                            │
│ ── Comments (3) ────────────────────────────────────────── │
│                                                            │
│ 💬 Lisa Legal (yesterday):                                │
│    "Section 3.2 mentions GDPR Article 35 but no citation. │
│     Add EUR-Lex link for audit trail."                    │
│    Status: Unresolved                                     │
│    [Reply] [Resolve]                                       │
│                                                            │
│ 💬 John Senior (2 days ago):                              │
│    "Typo on page 4: 'transation' → 'transaction'"        │
│    Status: Resolved ✓                                     │
│                                                            │
│ [Add Comment] [View Full Output] [Download Draft]         │
└────────────────────────────────────────────────────────────┘
```

---

### Use Cases

#### 1. Quality Assurance
**Scenario:** Consulting firm standard — all regulatory analyses require senior review

**Workflow:**
- Analyst runs gap analysis
- Auto-assigned to senior partner for review
- Senior approves or requests changes
- If changes, loops back to analyst
- If approved, proceeds to client submission

**Benefit:** Consistent quality, no deliverable leaves firm without senior sign-off

---

#### 2. Multi-Stakeholder Approval
**Scenario:** Board report requires sign-off from compliance, legal, and CFO

**Workflow:**
- Compliance creates draft
- Parallel review: legal (regulatory accuracy), CFO (financial implications), MLRO (sanctions risks)
- All must approve (consensus mode: all_required)
- If any reject, address feedback and re-submit
- Once all approve, proceed to board

**Benefit:** Structured approvals, clear audit trail

---

#### 3. Distributed Teams
**Scenario:** Global consulting firm, analysts in different time zones

**Workflow:**
- EU analyst creates draft (9 AM CET)
- Assigned to US reviewer for review (10 AM CET = 4 AM EST)
- US reviewer approves asynchronously (10 AM EST = 4 PM CET)
- APAC reviewer sees approved version next morning (9 AM SGT)

**Benefit:** Asynchronous collaboration, no bottlenecks

---

### Notifications

**When assigned:**
- Email: "You've been assigned Step 3: Review gap analysis. Due: Feb 22."
- In-app: Notification badge on WorkflowMonitor

**When overdue:**
- Email: "Reminder: Step 3 review overdue by 1 day."
- Escalation (future): Notify manager after 2 days overdue

**When consensus reached:**
- Email to all: "All reviews complete. Workflow proceeding to Step 4."

---

### Integration with Institutional Memory

**Every checkpoint decision logged:**
- What was reviewed
- Who approved/rejected
- Comments and rationale
- Override analysis (if AI suggested different action)

**Benefit:** Institutional memory learns from team decisions, not just individual decisions

---
## PART 6: THE 29 EXPERT AREAS

## 20. Expert Areas Overview

openEXPERT covers **29 professional domains** with **240 pre-configured modules**.

### The Full Landscape

| # | Area | Modules | Primary Users |
|---|------|---------|---------------|
| 1 | Financial Crime Prevention (FCP) | 23 | Banks, FIs, consultants |
| 2 | Legal & Regulatory | 12 | Legal counsel, compliance |
| 3 | Audit & Assurance | 12 | Internal/external auditors |
| 4 | Client Consulting | 5 | Consultants, advisors |
| 5 | Banking & Finance | 10 | Banks, FIs |
| 6 | Risk Management | 8 | CROs, risk managers |
| 7 | Data & Analytics | 8 | Data teams, analysts |
| 8 | ESG & Sustainability | 11 | ESG officers, sustainability teams |
| 9 | Cybersecurity | 5 | CISOs, IT security |
| 10 | Investment & Asset Management | 4 | Asset managers, investors |
| 11 | Project Management | 12 | PMs, delivery teams |
| 12 | Strategy & Planning | 6 | Executives, strategy teams |
| 13 | Operations & Process | 8 | Ops managers, process improvement |
| 14 | HR & People | 6 | HR teams, people managers |
| 15 | Software Engineering | 6 | Developers, tech leads |
| 16 | Accounting & Finance | 7 | Accountants, CFOs |
| 17 | Insurance & Actuarial | 5 | Insurers, actuaries |
| 18 | Communication & PR | 5 | Comms teams, PR professionals |
| 19 | Startups & Entrepreneurship | 7 | Founders, entrepreneurs |
| 20 | Academic Research | 6 | Researchers, academics |
| 21 | Personal Development | 6 | Individuals, career changers |
| 22 | Branding & Creative | 5 | Marketing, creative teams |
| 23 | Education & Teaching | 5 | Educators, instructors |
| 24 | Healthcare & Life Sciences | 5 | Healthcare professionals |
| 25 | Manufacturing & Operations | 5 | Manufacturers, ops teams |
| 26 | Consumer Legal | 5 | Individuals, legal aid |
| 27 | Procurement & Supply Chain | 5 | Procurement teams |
| 28 | Real Estate & Property | 4 | Property professionals |
| 29 | Nonprofit & Social Impact | 4 | Nonprofits, social enterprises |

**Total: 238 modules**

---

### Area Categories

**Core Professional Services (Areas 1-10):**
- Financial services focus (FCP, Banking, Investment)
- Professional services (Legal, Audit, Consulting)
- Corporate functions (Risk, Data, ESG, Cybersecurity)

**Business Operations (Areas 11-18):**
- Project/program delivery
- Strategy and operations
- People and culture
- Technology development
- Finance and accounting
- Industry verticals (Insurance, Comms)

**Growth & Learning (Areas 19-21):**
- Entrepreneurship
- Academic research
- Personal development

**Specialized Domains (Areas 22-29):**
- Creative industries (Branding, Education)
- Healthcare and life sciences
- Manufacturing and industrial
- Consumer services (Legal, Real Estate, Nonprofit)
- Procurement and supply chain

---

### Module Structure (Consistent Across All Areas)

Every module follows the same pattern:

**1. Module Configuration** (`module.json`)
```json
{
  "id": "amlr-gap-analysis",
  "label": "AMLR Gap Analysis",
  "shortLabel": "AMLR Gap",
  "icon": "CheckSquare",
  "description": "Systematic comparison of current AML/CFT framework against EU AMLR 2024/1624 requirements",
  "color": "adv-red",
  "defaults": {
    "thinking": "investigate",
    "creativity": "strict",
    "outputFormats": ["executive-summary", "gap-scoring-matrix", "action-plan"],
    "knowledgeSources": {
      "claudeKnowledge": {"enabled": true, "webSearchEnabled": true, "description": "AMLR Regulation 2024/1624, EBA guidelines on AML risk factors"},
      "localFolder": {"enabled": false, "folderPaths": [], "recursive": true}
    }
  },
  "guidedInputs": [
    {"id": "entity_type", "label": "Entity Type", "type": "select", "options": ["Bank", "Payment Institution", "E-Money Institution", "Investment Firm", "Crypto Asset Service Provider"], "required": true},
    {"id": "jurisdiction", "label": "Primary Jurisdiction", "type": "select", "options": ["Sweden", "Finland", "Denmark", "Norway", "Iceland", "Other EU"], "required": true},
    {"id": "focus_areas", "label": "Focus Areas", "type": "multiselect", "options": ["Customer Due Diligence", "Transaction Monitoring", "Sanctions Screening", "SAR/STR Reporting", "Data Management", "Governance & Controls", "Crypto Assets", "Beneficial Ownership"], "required": false}
  ]
}
```

**2. System Prompt** (`system-prompt.md`)
- Task definition and objectives
- Methodology (step-by-step)
- Output structure template
- Quality criteria
- Common pitfalls to avoid

**3. Area Context** (shared across modules in same area)
- Domain background
- Key regulations and frameworks
- Common methodologies
- Stakeholder landscape

---

### Cross-Area Module Linking

Modules can reference related modules in other areas:

**Example: AMLR Gap Analysis (Area 1: FCP)**
```
Where to take it next:
  → Area 2 (Legal): Regulatory Interpretation — for legal questions on AMLR articles
  → Area 3 (Audit): Audit Planning — design audit program to verify gaps
  → Area 7 (Data): Data Readiness Assessment — assess data gaps for AMLR compliance
  → Area 11 (Project Management): Implementation Project Plan — create AMLR implementation roadmap
```

**Benefit:** Users discover complementary modules, enabling multi-area workflows

---

## 21. Flagship Area: Financial Crime Prevention

**Area 1: FCP** is the most comprehensive area — 23 modules covering the full AML/CFT lifecycle.

### Background

openEXPERT was born from FCP consulting work at Advisense. The FCP area represents 14+ years of banking and regulatory consulting experience codified into expert AI modules.

---

### The 23 FCP Modules

#### **Core Compliance (5 modules)**

**1. AMLR Gap Analysis**
- **Purpose:** Systematic comparison against EU AMLR 2024/1624
- **Thinking:** `investigate` (max depth)
- **Output:** Executive summary + gap scoring matrix + action plan
- **Knowledge:** Web search for latest AMLR RTS/ITS + local folder for client docs
- **Audience:** Board, compliance committee, regulators

**2. Business-Wide Risk Assessment (BWRA)**
- **Purpose:** ML/TF risk assessment per risk-based approach
- **Thinking:** `think_hard`
- **Output:** Risk assessment report with inherent → control → residual risk scoring
- **Knowledge:** EBA Risk Factor Guidelines (skill) + client data (local folders)
- **Audience:** Board, MLRO, compliance team

**3. Sanctions Compliance Assessment**
- **Purpose:** Screening effectiveness and sanctions program maturity
- **Thinking:** `think_hard`
- **Output:** Sanctions program assessment + screening gap analysis
- **Knowledge:** EU Sanctions Regulation 833/2014 + web search for latest designations
- **Audience:** Sanctions officer, compliance

**4. KYC/CDD Framework Review**
- **Purpose:** Customer due diligence process assessment
- **Thinking:** `think`
- **Output:** Process review + recommendations
- **Knowledge:** 6AMLD, AMLR, EBA CDD guidelines
- **Audience:** KYC team, operations

**5. Transaction Monitoring Assessment**
- **Purpose:** TM system effectiveness evaluation
- **Thinking:** `think_hard`
- **Output:** TM assessment + scenario review + tuning recommendations
- **Knowledge:** Client TM rules + FATF guidance
- **Audience:** TM manager, 2nd line

---

#### **Document Creation (4 modules)**

**6. AML Policy Writer**
- **Purpose:** Create or update AML/CFT policy
- **Thinking:** `investigate`
- **Output:** Policy document (structured, board-ready)
- **Knowledge:** Web search for latest regulatory requirements + existing policy (local folder)
- **Audience:** Board, all staff

**7. Procedure Builder**
- **Purpose:** Detailed operational procedures (KYC, TM, SAR)
- **Thinking:** `think_hard`
- **Output:** Step-by-step procedure document
- **Knowledge:** Regulatory requirements + client process maps
- **Audience:** Operations teams

**8. Board Report Generator**
- **Purpose:** Quarterly/annual MLRO reports
- **Thinking:** `think`
- **Output:** Executive board report (KPIs, trends, issues, recommendations)
- **Knowledge:** Client KPI data + regulatory developments
- **Audience:** Board, risk committee

**9. Training Content Creator**
- **Purpose:** AML training materials
- **Thinking:** `think`
- **Output:** Training deck + scenarios + knowledge checks
- **Audiences:** 8 options (board, compliance, front-line, operations, etc.)
- **Knowledge:** Regulatory requirements + client examples

---

#### **Operational Support (5 modules)**

**10. Regulatory Change Scanner**
- **Purpose:** Monitor and interpret regulatory changes
- **Thinking:** `think`
- **Output:** Change impact assessment
- **Integration:** Works with Regulatory Radar (auto-feed new items)
- **Audience:** Compliance team

**11. STR/SAR Review Assistant**
- **Purpose:** Help structure suspicious activity reports
- **Thinking:** `think_hard`
- **Output:** STR narrative + supporting evidence checklist
- **Knowledge:** FATF guidance + FIU requirements
- **Audience:** SAR analysts

**12. Investigation Support**
- **Purpose:** Structure complex AML investigations
- **Thinking:** `investigate`
- **Output:** Investigation plan + evidence matrix + timeline
- **Knowledge:** Transaction data + customer profile
- **Audience:** Investigation team, MLRO

**13. Quality Assurance Reviewer**
- **Purpose:** QA review of STRs, EDD, or policies
- **Thinking:** `think`
- **Output:** QA checklist + findings + improvement recommendations
- **Knowledge:** Internal QA standards + regulatory requirements
- **Audience:** 2nd line, QA team

**14. Model Validation**
- **Purpose:** Validate TM scenarios, risk rating models
- **Thinking:** `investigate`
- **Output:** Model validation report (methodology, testing, limitations, recommendations)
- **Knowledge:** Model documentation + test results
- **Audience:** Model risk, audit, regulators

---

#### **Consultant/Advisory (5 modules)**

**15. Engagement Proposal Builder**
- **Purpose:** Create client proposals for FCP projects
- **Thinking:** `think`
- **Output:** Proposal (understanding, approach, scope, timeline, pricing)
- **Knowledge:** RFP + client background
- **Audience:** Sales, partners

**16. Engagement Delivery Planner**
- **Purpose:** Project plan for FCP implementations
- **Thinking:** `think_hard`
- **Output:** Project plan (phases, workstreams, RACI, milestones)
- **Knowledge:** Client context + implementation scope
- **Audience:** Project team

**17. Management Presentation Generator**
- **Purpose:** Create presentations for client steering committees
- **Thinking:** `think`
- **Output:** Slide outline + key messages + speaker notes
- **Knowledge:** Project status + stakeholder landscape
- **Audience:** Client management

**18. Stakeholder Interview Planner**
- **Purpose:** Design interview guides for stakeholder consultations
- **Thinking:** `quick`
- **Output:** Interview guide + questions by stakeholder type
- **Knowledge:** Project scope + org structure
- **Audience:** Consultants

**19. Regulatory Submission Reviewer**
- **Purpose:** Review client submissions to regulators (pre-submission QA)
- **Thinking:** `investigate`
- **Output:** Review findings + recommendations
- **Knowledge:** Regulatory requirements + submission draft
- **Audience:** Consultants, client compliance

---

#### **Data & Implementation (4 modules)**

**20. Data Readiness Assessment**
- **Purpose:** Assess data availability for AMLR compliance
- **Thinking:** `think_hard`
- **Output:** Data readiness scorecard (per data point: status, source, owner, effort)
- **Knowledge:** AMLR data requirements + client data dictionary
- **Audience:** Data teams, IT, compliance

**21. Data Quality Checker**
- **Purpose:** Identify data quality issues in CDD/TM data
- **Thinking:** `think`
- **Output:** Data quality report + remediation plan
- **Knowledge:** Data quality rules + sample data
- **Audience:** Data teams

**22. System Requirements Documenter**
- **Purpose:** Document requirements for AML system implementations
- **Thinking:** `think_hard`
- **Output:** Requirements specification (functional, technical, integration)
- **Knowledge:** Regulatory requirements + client IT landscape
- **Audience:** IT teams, vendors

**23. Vendor Assessment Framework**
- **Purpose:** Evaluate AML technology vendors (TM, screening, KYC)
- **Thinking:** `think`
- **Output:** Vendor scorecard + comparison matrix
- **Knowledge:** RFP responses + regulatory requirements
- **Audience:** Procurement, IT, compliance

---

### FCP Module Usage Patterns

**Gap Analysis → Implementation Cascade:**
```
1. AMLR Gap Analysis (identify gaps)
   ↓
2. Data Readiness Assessment (check data availability)
   ↓
3. System Requirements Documenter (define IT needs)
   ↓
4. Vendor Assessment Framework (select solutions)
   ↓
5. Implementation Project Plan (Area 11 — Project Management)
   ↓
6. Policy Writer (update policies)
   ↓
7. Training Content Creator (train staff)
   ↓
8. Audit Planning (Area 3 — design validation audit)
```

**Consultant Workflow:**
```
1. Engagement Proposal Builder (win the work)
   ↓
2. Engagement Delivery Planner (plan the project)
   ↓
3. Stakeholder Interview Planner (design consultations)
   ↓
4. Gap Analysis / Risk Assessment (deliver core analysis)
   ↓
5. Management Presentation (present findings)
   ↓
6. Regulatory Submission Reviewer (QA final deliverable)
```

---

### Why FCP Is the Flagship

**1. Domain Depth:**
- 23 modules vs. 4-12 in other areas
- Covers full AML/CFT lifecycle (strategy → operations → audit)

**2. Real-World Validation:**
- Built from actual consulting engagements
- Prompts based on frameworks used at SEB, Sveriges Riksbank, EY, Advisense

**3. Regulatory Currency:**
- Integrated with Regulatory Radar (EBA, ESMA, FATF, EUR-Lex)
- Web search enabled by default for latest guidance

**4. Cross-Area Integration:**
- Links to Legal (interpretation), Audit (validation), Data (readiness), Project Management (implementation)

**5. Output Quality:**
- Average quality score: 8.7 (highest across all areas)
- Regulatory-defensible citations
- Board-ready executive summaries

---

## 22. Cross-Area Use Cases

openEXPERT's power multiplies when modules from multiple areas combine.

### Use Case 1: AMLR Implementation (Multi-Area Workflow)

**Scenario:** Bank must implement AMLR by January 2027

**Modules used across 6 areas:**

**Phase 1: Assessment (Area 1: FCP)**
- AMLR Gap Analysis → identify compliance gaps
- Data Readiness Assessment → check data availability

**Phase 2: Planning (Area 11: Project Management)**
- Implementation Project Plan → create roadmap
- Resource Planning → estimate FTE needs
- RAID Log → track risks and issues

**Phase 3: Legal Review (Area 2: Legal)**
- Regulatory Interpretation → clarify ambiguous AMLR articles
- Contract Review → review vendor contracts for AMLR alignment

**Phase 4: Data & Technology (Area 7: Data)**
- Data Governance Framework → establish data ownership
- Data Quality Assessment → remediate data gaps

**Phase 5: Policy & Procedures (Area 1: FCP)**
- AML Policy Writer → update policy
- Procedure Builder → create new CDD procedures

**Phase 6: Training (Area 1: FCP + Area 23: Education)**
- Training Content Creator → develop materials
- Assessment Builder → create knowledge tests

**Phase 7: Validation (Area 3: Audit)**
- Audit Planning → design validation audit
- Control Testing → test new controls

**Result:** 15+ modules across 6 areas, orchestrated via workflows

---

### Use Case 2: Startup Launch (Multi-Area Workflow)

**Scenario:** Founder launching fintech startup

**Modules used across 7 areas:**

**Phase 1: Foundation (Area 19: Startups)**
- Business Plan Development → create business plan
- Pitch Deck Creation → investor deck
- Funding Strategy → Series A roadmap

**Phase 2: Legal Setup (Area 2: Legal)**
- Company Formation Guidance → incorporation
- Shareholder Agreement Builder → cap table and vesting
- Regulatory Horizon Scan → identify licensing requirements

**Phase 3: Product Development (Area 15: Software)**
- Technical Specification → define MVP
- Architecture Review → scalability planning

**Phase 4: Compliance (Area 1: FCP + Area 9: Cybersecurity)**
- AML Framework Designer → if handling payments
- GDPR Compliance Checker → data protection

**Phase 5: Go-to-Market (Area 22: Branding + Area 21: Sales)**
- Brand Strategy → positioning
- Content Strategy → marketing plan
- Sales Strategy → pipeline design

**Phase 6: Operations (Area 14: HR + Area 13: Accounting)**
- Hiring Plan → recruitment strategy
- Financial Planning → burn rate, runway

**Phase 7: Fundraising (Area 19: Startups)**
- Investor Due Diligence Prep → prepare for DD
- Pitch Practice → refine pitch

**Result:** 18+ modules across 7 areas, founder goes from idea to Series A

---

### Use Case 3: Consulting Engagement (Multi-Area Workflow)

**Scenario:** Big 4 firm delivering regulatory change project

**Modules used across 5 areas:**

**Phase 1: Sales (Area 4: Consulting)**
- Engagement Proposal Builder → win RFP
- Stakeholder Mapping → identify key stakeholders

**Phase 2: Kickoff (Area 11: Project Management)**
- Project Charter → define scope
- Communication Plan → stakeholder engagement

**Phase 3: Analysis (Area 1: FCP + Area 2: Legal)**
- Gap Analysis → identify regulatory gaps
- Regulatory Interpretation → clarify requirements

**Phase 4: Design (Area 6: Risk + Area 7: Data)**
- Risk Assessment → evaluate ML/TF risks
- Data Strategy → design data solution

**Phase 5: Implementation (Area 11: Project Management + Area 13: Operations)**
- Implementation Roadmap → phased plan
- Change Management → stakeholder readiness

**Phase 6: Reporting (Area 4: Consulting + Area 18: Communication)**
- Management Presentation → steering committee updates
- Final Report → deliverable documentation

**Result:** Consistent quality, accelerated delivery, knowledge capture

---

### Use Case 4: Personal Career Pivot (Multi-Area Workflow)

**Scenario:** Mid-career professional transitioning from banking to consulting

**Modules used across 3 areas:**

**Phase 1: Self-Assessment (Area 21: Personal Development)**
- Career Strategy → define target roles
- Skills Gap Analysis → identify missing skills

**Phase 2: Learning Plan (Area 20: Academic + Area 23: Education)**
- Learning Path Designer → structured upskilling
- Research Methodology → if pursuing MBA

**Phase 3: Job Search (Area 21: Personal Development)**
- CV Builder → tailored CV
- Cover Letter Writer → role-specific letters
- Interview Preparation → practice questions
- Salary Negotiation Prep → research + strategy

**Phase 4: Networking (Area 18: Communication)**
- Personal Brand Strategy → LinkedIn optimization
- Networking Strategy → outreach plan

**Result:** Structured career transition with professional-grade tools

---

### Use Case 5: ESG Reporting (Multi-Area Workflow)

**Scenario:** Corporation preparing first CSRD report

**Modules used across 4 areas:**

**Phase 1: Scoping (Area 8: ESG)**
- CSRD Compliance Assessment → identify requirements
- Double Materiality Assessment → determine topics

**Phase 2: Data Collection (Area 7: Data + Area 13: Accounting)**
- Data Readiness Scorecard → ESG data gaps
- Carbon Accounting → Scope 1/2/3 emissions

**Phase 3: Supply Chain (Area 27: Procurement + Area 8: ESG)**
- Supply Chain Sustainability → vendor assessment
- Procurement Strategy → sustainable sourcing

**Phase 4: Reporting (Area 18: Communication + Area 13: Accounting)**
- Sustainability Report Content → narrative
- Integrated Reporting → financial + ESG

**Result:** CSRD-compliant report, data foundation for future years

---

### Cross-Area Workflow Automation

**Users can create workflows spanning multiple areas:**

**Example: Quarterly Compliance Cycle**
```
Step 1: Gap Analysis (Area 1: FCP)
   ↓
Step 2: Risk Assessment (Area 6: Risk)
   ↓
Step 3: Control Testing (Area 3: Audit)
   ↓
Step 4: Board Report (Area 1: FCP)
   ↓
Step 5: Management Presentation (Area 18: Communication)
```

**Schedule:** Auto-run every quarter (Jan, Apr, Jul, Oct)

**Benefit:** Recurring compliance work automated, cross-area coordination built-in

---

### Knowledge Graph Across Areas

**Cross-area entity relationships:**

```
[Regulation: AMLR Article 4] (Area 1: FCP)
        |
        requires
        |
        v
[Control: KYC-CDD-Enhanced] (Area 1: FCP)
        |
        tested_by
        |
        v
[Audit Program: Q2-AML-Audit] (Area 3: Audit)
        |
        uses_data_from
        |
        v
[System: CRM-Database] (Area 7: Data)
        |
        managed_by
        |
        v
[Process: Data Governance] (Area 7: Data)
```

**Insight from graph:**
"AMLR Article 4 requires Control KYC-CDD-Enhanced, which is tested in Q2 AML Audit, using data from CRM-Database, managed via Data Governance process."

**Benefit:** See how regulatory requirements flow through organization across domains

---
## PART 7: SECURITY, PRIVACY & DEPLOYMENT

## 23. Security Architecture

openEXPERT implements **enterprise-grade security** with multiple layers of protection.

### Multi-User Authentication & Authorization

**RBAC (Role-Based Access Control):**

**Three roles:**
1. **Admin** — Full access (user management, system settings, all data)
2. **Analyst** — Module execution, session access, limited admin functions
3. **User** — View-only or restricted module access

**Authentication:**
- **Local accounts:** Username/password (bcrypt hashing)
- **OAuth/SSO:** Google, GitHub OAuth (optional)
- **Enterprise SSO:** SAML/OIDC integration (planned)

**Session management:**
- JWT tokens (secure, httpOnly cookies)
- Token expiration (configurable, default 24 hours)
- Auto-logout on inactivity

**Table:** `users`, `user_sessions`

---

### Failed Login Tracking (OWASP A07)

**Purpose:** Detect brute force attacks

**Implementation:**
- **Table:** `login_attempts`
- **Fields:** username, ip_address, success, attempted_at

**Logic:**
- Track all login attempts (success and failure)
- Lock account after 5 failed attempts in 15 minutes
- Notify admin of suspicious activity
- Auto-unlock after 30 minutes or admin intervention

**Security event logged:** `failed_login` (severity: medium)

---

### Rate Limiting (DDoS Protection)

**Per-IP limits:**
- API calls: 100 requests per 15 minutes
- Login attempts: 10 per 15 minutes

**Per-user limits:**
- Module executions: 50 per hour
- Export operations: 20 per hour

**Implementation:**
- `express-rate-limit` middleware
- Redis-backed (future, for distributed deployments)
- Configurable thresholds per route

**On violation:**
- HTTP 429 (Too Many Requests)
- Security event logged
- Temporary ban (15 minutes)

---

### Budget Management & Enforcement

**Per-user monthly quotas:**
- **Table:** `user_monthly_usage`
- **Fields:** user_id, month, token_count, estimated_cost_usd, budget_cap

**Enforcement:**
- 80% threshold: Warning email
- 100% threshold: Block further API calls
- Admin can override or increase cap

**Use cases:**
- Cost control for multi-user organizations
- Fair usage across teams
- Prevent accidental runaway costs

---

### Security Event Logging (OWASP A09)

**Event types:**
- `failed_login` — Failed authentication attempts
- `unauthorized_access` — Access to forbidden resources
- `budget_exceeded` — Monthly quota exceeded
- `rate_limit` — Rate limit violations
- `suspicious_activity` — Anomalous behavior detected
- `invalid_input` — Injection attempt or malformed input
- `ssrf_attempt` — Server-side request forgery attempt

**Severity levels:**
- **Critical:** Immediate action required (SSRF, SQL injection attempt)
- **High:** Security concern (unauthorized access)
- **Medium:** Potential issue (failed login, rate limit)
- **Low:** Informational (valid but unusual activity)

**Table:** `security_events`

**Dashboard:** `AuditLogPage.tsx` — filter by event type, severity, user, date range

---

### Sandboxing (Script Execution)

**When executing user-provided scripts (Python, bash, Node.js):**

**Sandbox configuration:**
- **Memory limit:** 512 MB (configurable)
- **Runtime limit:** 60 seconds (configurable)
- **Network access:** Configurable (allow/deny)
- **Filesystem access:** Restricted to designated directories
- **Environment variables:** Sanitized (no access to API keys)

**Implementation:**
- Docker containers (future)
- Node.js VM module (current, for Node scripts)
- Python subprocess with resource limits

**Security event logged on violation:**
- `script_timeout` (runtime exceeded)
- `script_memory_exceeded`
- `script_network_blocked` (if attempted unauthorized network access)

---

### Input Validation & Sanitization

**All user inputs validated:**
- File uploads: Type whitelist (PDF, DOCX, XLSX, TXT, MD), size limit (50 MB default)
- URLs: Scheme whitelist (https only), SSRF protection (block private IP ranges)
- SQL queries: Parameterized queries only (no string concatenation)
- File paths: Path traversal protection (block `../`, absolute path only)

**OWASP Top 10 mitigations:**
- **A01: Broken Access Control** → RBAC enforcement
- **A02: Cryptographic Failures** → bcrypt password hashing, JWT tokens
- **A03: Injection** → Parameterized SQL, input sanitization
- **A04: Insecure Design** → Secure-by-default configuration
- **A05: Security Misconfiguration** → Helmet middleware (CSP, HSTS, etc.)
- **A06: Vulnerable Components** → Regular dependency audits (`pnpm audit`)
- **A07: Authentication Failures** → Failed login tracking, account lockout
- **A08: Software/Data Integrity** → Integrity checks, version control
- **A09: Logging Failures** → Comprehensive security event logging
- **A10: SSRF** → URL whitelist, private IP blocking

---

### Audit Trail

**Every action logged:**
- **Table:** `audit_log`
- **Captured:** session_id, user_id, module_id, model, thinking_level, input/output tokens, cost, review_status, seed (for reproducibility)

**Retention:** Configurable (default: 2 years)

**Export:** CSV/XLSX for regulators or internal audit

**Use cases:**
- Regulatory audit: "Show me all gap analyses from Q1 2024"
- Cost analysis: "Which users consumed most API budget?"
- Quality analysis: "What settings produce highest quality?"
- Reproducibility: Re-run exact session with same seed

---

## 24. Privacy & Data Safety

### Local-First Architecture

**What stays local:**
✅ All documents and uploads (filesystem)
✅ Session history and outputs (SQLite database)
✅ Knowledge graph and patterns (SQLite)
✅ User profiles and preferences (SQLite)
✅ Audit logs (SQLite)
✅ Workflow executions and checkpoint decisions (SQLite)

**What leaves your machine:**
❌ Prompts and messages sent to LLM APIs (Claude, GPT, Mistral)
❌ Web search queries (if enabled)

**Result:** Complete data control. No openEXPERT cloud service collecting data.

---

### LLM Provider Data Policies

**When using external LLM providers:**

**Anthropic Claude:**
- API requests processed, not used for training (per Anthropic policy)
- Review: https://www.anthropic.com/privacy

**OpenAI GPT:**
- API requests not used for training (per OpenAI policy)
- Review: https://openai.com/privacy

**Mistral:**
- API requests processed, not used for training
- Review: https://mistral.ai/privacy

**Local Ollama:**
- ✅ **Maximum privacy:** Nothing leaves your network
- All processing on local machine

**Recommendation:** For maximum privacy (GDPR Article 32, data minimization), use local Ollama models or deploy openEXPERT in air-gapped environment.

---

### GDPR Compliance

**openEXPERT supports GDPR compliance:**

**Article 5 (Data minimization):**
- Only data necessary for functionality is collected
- No telemetry, analytics, or tracking

**Article 15 (Right of access):**
- Users can export all their data (sessions, audit logs, profiles)

**Article 17 (Right to erasure):**
- Users can delete sessions, profiles, or entire account
- Cascading deletes (delete session → delete all messages)

**Article 25 (Privacy by design):**
- Local-first architecture (data never sent to openEXPERT servers)
- Secure defaults (encryption, authentication, RBAC)

**Article 32 (Security of processing):**
- Encryption in transit (HTTPS for API calls)
- Encryption at rest (optional: encrypt SQLite database)
- Access controls (RBAC, authentication)
- Audit logging

---

### Multi-User Data Isolation

**In multi-user environments:**

**Session isolation:**
- Each user's sessions private (not visible to other users)
- Admins can view all sessions (for audit purposes)
- User permission check on every session access

**Project sharing:**
- Sessions can be added to projects
- Project members see shared sessions
- Permissions enforced (project member vs. non-member)

**Knowledge graph isolation (future):**
- Per-user knowledge graphs (optional)
- Shared organizational knowledge graph (optional)
- Configurable: private, team, organization

---

### Data Backup & Recovery

**Manual backup:**
```bash
cp data/workbench.sqlite data/backup-$(date +%Y%m%d).sqlite
```

**Automated backup (planned):**
- Daily backups (configurable retention)
- Backup to external drive or encrypted cloud storage
- Point-in-time recovery

**Disaster recovery:**
- Restore from backup
- SQLite database includes all data (sessions, users, workflows, knowledge)
- Documents in `uploads/` folder also need backup

---

## 25. Deployment Models

openEXPERT supports **multiple deployment models** to fit different needs.

### 1. Local Desktop (Default)

**Who:** Individuals, small teams, consultants

**Setup:**
```bash
git clone https://github.com/danielbardun/openexpert
cd openexpert
pnpm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env
pnpm run db:init
pnpm run dev
```

**Access:** http://localhost:3000

**Data location:** `./data/workbench.sqlite`, `./uploads/`

**Pros:**
- ✅ Complete data control
- ✅ No server infrastructure required
- ✅ Free (except API costs)

**Cons:**
- ❌ Single-user (unless running on shared machine)
- ❌ No remote access (localhost only)

---

### 2. Docker Container

**Who:** Technical users, IT teams, easy deployment

**Setup:**
```bash
docker compose up
```

**Docker Compose:**
```yaml
version: '3.8'
services:
  openexpert:
    build: .
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - DB_PATH=/data/workbench.sqlite
    volumes:
      - ./data:/data
      - ./uploads:/app/uploads
```

**Pros:**
- ✅ Consistent environment
- ✅ Easy updates (pull new image, restart)
- ✅ Isolated from host system

**Cons:**
- ❌ Requires Docker knowledge
- ❌ Still local (unless exposed via network)

---

### 3. Server Deployment (Multi-User)

**Who:** Consulting firms, enterprises, teams (10-100 users)

**Setup:**
```bash
# On server (Linux VM, cloud instance)
git clone https://github.com/danielbardun/openexpert
cd openexpert
pnpm install
pnpm run db:init

# Create production .env
NODE_ENV=production
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000

# Run with PM2 (process manager)
pm2 start "pnpm start" --name openexpert
pm2 save
pm2 startup
```

**Reverse proxy (Nginx):**
```nginx
server {
  listen 80;
  server_name openexpert.yourcompany.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
  }
}
```

**SSL:** Use Let's Encrypt for HTTPS

**Pros:**
- ✅ Multi-user access
- ✅ Remote access (via company network)
- ✅ Centralized data (easier backups)

**Cons:**
- ❌ Requires server infrastructure
- ❌ IT admin needed for setup/maintenance

---

### 4. Cloud Deployment (Scalable)

**Who:** Large enterprises, SaaS providers (100+ users)

**Options:**

**A. AWS Deployment**
- EC2 instance for application
- RDS PostgreSQL for database (replace SQLite)
- S3 for document storage
- ALB for load balancing
- CloudWatch for monitoring

**B. Azure Deployment**
- Azure App Service for application
- Azure Database for PostgreSQL
- Azure Blob Storage for documents
- Azure Application Insights for monitoring

**C. Google Cloud Deployment**
- Cloud Run for application (serverless)
- Cloud SQL for PostgreSQL
- Cloud Storage for documents
- Cloud Monitoring

**Pros:**
- ✅ Highly scalable (1000+ users)
- ✅ Built-in backups and redundancy
- ✅ Global access

**Cons:**
- ❌ Data not 100% local (cloud-based)
- ❌ Ongoing cloud costs
- ❌ Requires cloud expertise

---

### 5. Air-Gapped Deployment (Maximum Security)

**Who:** Government, defense, highly regulated industries

**Setup:**
- Deploy on internal network (no internet access)
- Use local Ollama models (no external API calls)
- Disable web search and online reference links
- Folder integration only (local regulation texts)

**Pros:**
- ✅ Complete data isolation
- ✅ No data leaves network
- ✅ Regulatory compliance (classified environments)

**Cons:**
- ❌ Cannot use Claude/GPT APIs (must use local models)
- ❌ No web search (knowledge limited to training data + local docs)
- ❌ Cannot fetch online regulation links

---

### Deployment Decision Matrix

| Need | Recommended Deployment |
|------|------------------------|
| Individual consultant | Local Desktop |
| Small team (2-5 users) | Docker on shared machine |
| Consulting firm (10-50 users) | Server Deployment |
| Large enterprise (100+ users) | Cloud Deployment |
| Regulated/classified environment | Air-Gapped with Ollama |

---

## PART 8: USAGE GUIDE

## 26. Getting Started

### Installation

**Prerequisites:**
- Node.js 18+ (https://nodejs.org/)
- pnpm (install via: `npm install -g pnpm`)
- Anthropic API key (get from https://console.anthropic.com/)

**Steps:**

**1. Clone repository:**
```bash
git clone https://github.com/danielbardun/openexpert
cd openexpert
```

**2. Install dependencies:**
```bash
pnpm install
```

**3. Configure API key:**
```bash
cp .env.example .env
# Edit .env and add:
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

**4. Initialize database:**
```bash
pnpm run db:init
```

**5. Start application:**
```bash
pnpm run dev
```

**6. Open browser:**
Navigate to http://localhost:3000

**Expected output:**
```
[server] openEXPERT by ANTON — server running on http://localhost:3001
[server] [module-loader] Loaded 29 area(s), 240 module(s)
[client] Vite dev server running on http://localhost:5173
```

---

### First Steps

**1. Create your profile** (optional but recommended)
- Click "Settings" → "Profile"
- Enter: Name, Role, Organization, Jurisdiction, Focus Areas
- Save

**2. Browse expert areas**
- Sidebar: 29 areas listed
- Click area to expand → see modules
- Click module to open

**3. Run your first module**

**Example: Quick Question (Brief Me mode)**
- Click "Brief Me" in sidebar
- Type: "What are the key requirements of AMLR Article 4?"
- Click "Ask Anton"
- Wait for streaming response (~30 seconds)
- Review output

**Example: AMLR Gap Analysis**
- Navigate to Area 1: FCP → AMLR Gap Analysis
- **Guided inputs:**
  - Entity Type: Bank
  - Jurisdiction: Sweden
  - Focus Areas: Customer Due Diligence, Transaction Monitoring
- **Configuration panel:**
  - Thinking: Investigate (default, pre-selected)
  - Creativity: Strict (default)
  - Output Formats: Executive Summary + Gap Scoring Matrix + Action Plan (default)
  - Knowledge Sources: Enable web search, upload regulation PDF or leave as default
- Click "Run Analysis"
- Wait for response (~2-5 minutes for Investigate mode)
- Review output
- Export to DOCX or XLSX

---

### Understanding Costs

**Typical session costs:**

| Module Type | Model | Thinking | Tokens (est.) | Cost (est.) |
|-------------|-------|----------|---------------|-------------|
| Quick question | Haiku | quick | 5k | $0.01 |
| Standard analysis | Sonnet | think | 40k | $0.60 |
| Gap analysis | Opus | think_hard | 120k | $2.50 |
| Regulatory submission | Opus | investigate | 180k | $5.00 |

**Cost optimization tips:**
- Use Haiku for simple tasks (10x cheaper than Opus)
- Use Sonnet for most analyses (good balance)
- Reserve Opus + Investigate for critical work (regulatory submissions, board reports)
- Enable prompt caching: run related analyses back-to-back (90% cost reduction on repeated context)

---

## 27. Power User Guide

### Real-World Cost Examples

**Understanding API costs is critical for budgeting.** Here are real examples based on actual usage:

#### Small Tasks ($0.02 - $0.50)

| Task | Tokens | Model | Cost | Time |
|------|--------|-------|------|------|
| Quick question (Brief Me) | ~2k input, ~800 output | Sonnet 4.5 | $0.02 | 15 sec |
| Training material (1 page) | ~5k input, ~2k output | Sonnet 4.5 | $0.08 | 30 sec |
| Quick briefing summary | ~8k input, ~1.5k output | Haiku 4.5 | $0.03 | 20 sec |
| Risk assessment summary | ~12k input, ~3k output | Sonnet 4.5 | $0.18 | 45 sec |

#### Medium Tasks ($1 - $3)

| Task | Tokens | Model | Cost | Time |
|------|--------|-------|------|------|
| AMLR gap analysis (5 docs) | ~60k input, ~8k output | Opus 4.6 | $2.40 | 3-4 min |
| Policy document creation | ~40k input, ~10k output | Opus 4.6 | $2.75 | 4-5 min |
| Regulatory impact briefing | ~35k input, ~5k output | Sonnet 4.5 | $0.65 | 2 min |
| Transaction monitoring review | ~50k input, ~6k output | Opus 4.6 | $2.10 | 3 min |

#### Large Tasks ($5 - $20)

| Task | Tokens | Model | Cost | Time |
|------|--------|-------|------|------|
| Full compliance framework (10+ docs) | ~120k input, ~15k output | Opus 4.6 | $11.25 | 8-10 min |
| Multi-area cross-workflow analysis | ~150k input, ~12k output | Opus 4.6 | $12.00 | 10-12 min |
| Batch creation (50 items) | ~80k input × 50, ~2k output × 50 | Sonnet 4.5 | $24.00 | 25-30 min |
| Comprehensive BWRA from scratch | ~100k input, ~20k output | Opus 4.6 | $14.50 | 12-15 min |

#### Cost Reduction Strategies

**1. Prompt Caching (90% savings on repeated context)**

*Without caching:*
- First analysis: 60k input tokens → $0.90
- Follow-up question: 60k input + 8k new → $1.02
- **Total:** $1.92

*With caching (automatic in openEXPERT):*
- First analysis: 60k input tokens → $0.90
- Follow-up question: 60k **cached** (90% off) + 8k new → $0.18
- **Total:** $1.08
- **Savings:** $0.84 (44% reduction)

**2. Use Sonnet for Drafts, Opus for Final (60% savings)**

- Draft with Sonnet 4.5: $0.65
- Review and refine: $0.30
- Final polish with Opus: $1.20
- **Total:** $2.15

vs.

- Direct Opus generation: $5.50 (with multiple iterations)
- **Savings:** $3.35

**3. Batch Operations (share context across items)**

- Individual generation × 50: $50.00
- Batch with shared context: $24.00
- **Savings:** $26.00 (52% reduction)

**4. Local Models (Ollama) — $0.00 API costs**

- Run Mistral 7B locally via Ollama
- Unlimited usage, no API costs
- Trade-off: Lower quality, slower, requires local GPU/CPU
- Best for: Drafts, iteration, testing, cost-sensitive use

#### Monthly Budget Examples

**Individual / Student ($20-50/month)**
- 10-20 analyses per month
- Mix of Sonnet (drafts) and Opus (final)
- ~$30/month average

**Small Business / Startup ($100-300/month)**
- 50-100 analyses per month
- Regular policy updates
- Workflow automation
- ~$200/month average

**Enterprise Team (5 users) ($500-1,500/month)**
- 200-500 analyses per month
- Cross-workflow intelligence enabled
- Batch operations
- Multi-area coverage
- ~$800/month average

**Big 4 Consulting Team (20 users) ($2,000-6,000/month)**
- 1,000+ analyses per month
- Full feature utilization
- Client deliverable generation
- Knowledge graph and pattern detection
- ~$4,000/month average

#### ROI Comparison

**Traditional Consultant:**
- Hourly rate: $150-500/hour
- AMLR gap analysis: 8-16 hours → **$1,200-8,000**
- Policy creation: 12-20 hours → **$1,800-10,000**

**openEXPERT:**
- AMLR gap analysis: 5 minutes → **$2.40**
- Policy creation: 8 minutes → **$2.75**
- **Savings: 99.8%** on direct cost
- **Time savings: 95%+**

**What you do with the savings:**
- Redirect consultant time to strategic work
- Use 10% of saved time for quality review
- Reinvest savings in additional analyses
- Build institutional knowledge faster

---

### Understanding API Pricing (Feb 2026)

**Claude (Anthropic):**

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Cached Input (90% off) |
|-------|----------------------|------------------------|------------------------|
| Opus 4.6 | $15 | $75 | $1.50 |
| Sonnet 4.5 | $3 | $15 | $0.30 |
| Haiku 4.5 | $0.80 | $4 | $0.08 |

**OpenAI:**

| Model | Input | Output |
|-------|-------|--------|
| GPT-4 | $30 | $60 |
| GPT-4 Turbo | $10 | $30 |
| GPT-3.5 Turbo | $0.50 | $1.50 |

**Google Gemini:**

| Model | Input | Output |
|-------|-------|--------|
| Gemini 2.0 Flash | $0.10 | $0.40 |

**Mistral:**

| Model | Input | Output |
|-------|-------|--------|
| Mistral Large | $4 | $12 |

**Ollama (Local):** $0.00 API costs (hardware costs apply)

---

### Cost Tracking & Budgets

**Built-in cost tracking:**
- Every API call logged with token counts and cost
- Real-time running total
- Per-session cost breakdown
- Per-user monthly spend
- Per-model cost analysis

**Budget caps (configurable):**
- Daily budget: $50
- Weekly budget: $200
- Monthly budget: $800
- Alert at 80% threshold
- Block further calls at 100% (or allow override)

**Cost visibility:**
```
Session Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tokens:  45,234 input + 8,123 output
Cached:  32,000 (90% discount applied)
Model:   claude-opus-4-6
Cost:    $2.87
Time:    4 min 23 sec
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Monthly spend: $127.45 / $500.00 (25%)
```

---

### Cost Optimization Tips

1. **Start with Sonnet, escalate to Opus only when needed**
   - Sonnet handles 80% of tasks well
   - Save Opus for final deliverables and complex analysis

2. **Use prompt caching**
   - Enabled automatically in openEXPERT
   - Especially valuable for:
     - Follow-up questions
     - Iterating on output
     - Batch operations with shared context

3. **Batch operations**
   - Generate 50 items together rather than 50 separate sessions
   - Share regulatory context across all items

4. **Local folders vs. online URLs**
   - Local folder integration: load once, cache context
   - Online URL fetching: fetches every session (no cache)

5. **Optimize thinking level**
   - Use "Quick" for simple tasks (no extended thinking)
   - Use "Think Hard" for complex analysis
   - Use "Investigate" only for highest-stakes work

6. **Use Ollama for iteration**
   - Draft with local Mistral 7B (free)
   - Refine with Sonnet ($0.65)
   - Polish with Opus ($1.20)
   - Total: $1.85 vs $5.50 (66% savings)

7. **Set budget alerts**
   - Get notified at 80% of monthly budget
   - Review spending patterns
   - Adjust model usage accordingly

---

### Free Tier Options

**Want to try openEXPERT with minimal cost?**

1. **Use Anthropic's free trial credits** ($5 free on new accounts)
   - Covers ~50-100 queries with Sonnet
   - Perfect for evaluation

2. **Use Ollama (100% free)**
   - Run Mistral 7B or Llama 3.3 locally
   - Requires: 16GB RAM (8GB minimum)
   - Quality: Good for 70% of tasks

3. **Use free models:**
   - Google Gemini 2.0 Flash: Very low cost ($0.10/1M input)
   - Suitable for high-volume, lower-stakes tasks

4. **Contribute to open source → get credits**
   - Submit module → featured in Community Modules
   - Quality contributions → sponsorship credits (planned Q3 2026)

---

### Summary: openEXPERT is Affordable

**For $50/month**, an individual can:
- Run 50-100 comprehensive analyses
- Generate 20-30 policy documents
- Create unlimited drafts with Ollama (free)
- Save 1,000+ hours of manual work

**The cost is negligible compared to:**
- Traditional consultant fees ($150-500/hour)
- In-house compliance team salaries ($80k-150k/year per person)
- Regulatory fines from missed deadlines (€100k-€10M+)

**The real cost is NOT using it.**

### Your First Hour with openEXPERT

**A step-by-step walkthrough** of what happens when you use openEXPERT for the first time. Real timings, real costs, real outputs.

---

#### **MINUTES 0-15: Installation & Setup**

**Step 1: Clone and install** (5 minutes)

```bash
# Clone repository
git clone https://github.com/danielbardun/openexpert
cd openexpert

# Install dependencies (pnpm is faster than npm)
pnpm install
```

**What's happening:**
- Downloads ~400MB of dependencies
- Installs: React, Express, Claude SDK, export libraries
- Takes 3-5 minutes on typical broadband

**Step 2: Configure environment** (2 minutes)

```bash
# Copy example environment file
cp .env.example .env

# Edit with your API key
nano .env  # or use any text editor
```

**Add your Anthropic API key:**
```
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

**Where to get API key:**
- Visit: https://console.anthropic.com/
- Sign up (free)
- Navigate to: API Keys → Create Key
- Copy and paste into `.env`

**Step 3: Initialize database** (1 minute)

```bash
# Create database with all 82 tables
pnpm run db:init:enhanced
```

**What's happening:**
- Creates `data/workbench.sqlite`
- Builds all 82 tables across 16 functional groups
- Seeds RBAC (3 roles, 24 permissions)
- Seeds 8 compliance rules
- Seeds 5 pattern detector configs
- Output: "✅ Database initialization complete!"

**Step 4: Start development server** (1 minute)

```bash
# Start both frontend and backend
pnpm run dev
```

**What's happening:**
- Frontend starts on http://localhost:5173
- Backend starts on http://localhost:3001
- Both watch for file changes (hot reload)
- Output: "Server running on port 3001"

**Step 5: Open browser** (1 minute)

```
Navigate to: http://localhost:5173
```

**What you see:**
- Dashboard with 29 expert areas
- "Welcome to openEXPERT by ANTON"
- Quick stats: 238 modules available
- Navigation: Brief Me, Guide Me, Modules, Workflows, Intelligence, Settings

**⏱️ Total time: 10-15 minutes**

---

#### **MINUTES 15-30: Your First Module**

**Scenario:** You're a compliance officer at a Nordic bank. You need to analyze your Transaction Monitoring Policy against the new AMLR (Regulation 2024/1624).

**Step 1: Navigate to module** (30 seconds)

1. Click "Financial Crime Prevention" area
2. Scroll to "AMLR Gap Analysis"
3. Click module card

**What you see:**
- Left panel: Configuration (thinking, creativity, model, knowledge sources, output formats)
- Right panel: Empty (waiting for output)
- Pre-configured for AMLR analysis:
  - Thinking: "Investigate" (thorough)
  - Creativity: "Strict" (regulatory accuracy)
  - Model: Claude Opus 4.6 (highest quality)
  - Outputs: Gap Scoring Matrix + Executive Summary + Action Plan

**Step 2: Upload your document** (1 minute)

1. Click "📁 Upload Files" in Knowledge Sources panel
2. Select: `TM_Policy_v2.3.pdf` (your bank's policy, ~40 pages)
3. Wait for upload and text extraction
4. Status: "✅ 1 file uploaded (42,000 words)"

**Step 3: Configure knowledge sources** (1 minute)

Knowledge Sources panel shows:
- ☑ **Claude's Knowledge + Web Search** (enabled by default)
  - Focus: "AMLR Regulation 2024/1624, EBA Guidelines on TM"
- ☐ Online Reference Links (optional)
- ☑ **Local Folders** (enabled, your uploaded policy)
- ☐ Combined Mode

**What this means:**
- Claude will use its built-in knowledge of AMLR
- Claude can search the web for latest guidance
- Your policy PDF is included in context

**Token estimate shown:** ~65,000 tokens (well under 180k limit)

**Step 4: Customize if desired** (30 seconds)

You decide to add multiple output formats:
- Click "📋 Output Formats"
- Select:
  - ✅ Gap Scoring Matrix (RAG scores per article)
  - ✅ Executive Summary (board-level, 1-2 pages)
  - ✅ Action Plan (prioritized remediation)
  - ✅ Detailed Findings (full analysis)

**Estimated output:** 12-18 pages across 4 deliverables

**Step 5: Type your question** (30 seconds)

In the "What would you like to know?" field:

```
Analyze our Transaction Monitoring Policy against AMLR Articles 8, 13, 16, and 18.
Identify gaps in:
1. Risk-based approach
2. Customer due diligence integration
3. Threshold calibration
4. Alert investigation procedures
5. SAR filing criteria

Provide specific article references and recommended changes.
```

**Step 6: Run analysis** (5 minutes)

Click **"▶ Run Analysis"**

**What happens:**

1. **Preparation (10 seconds):**
   - Assembles 7-layer prompt
   - Loads your PDF into context
   - Configures Opus 4.6 with "Investigate" thinking
   - Injects output format instructions

2. **Thinking phase (2 minutes):**
   - Opus extended thinking appears in real-time
   - You see: "Planning analysis structure... Reviewing AMLR Articles... Cross-referencing policy sections... Identifying gaps..."
   - Thinking tokens: ~12,000

3. **Output generation (3 minutes):**
   - Markdown streams in real-time
   - You see deliverables appear:
     - **# DELIVERABLE 1: GAP SCORING MATRIX**
     - **# DELIVERABLE 2: EXECUTIVE SUMMARY**
     - **# DELIVERABLE 3: ACTION PLAN**
     - **# DELIVERABLE 4: DETAILED FINDINGS**
   - Output tokens: ~9,500

4. **Complete (5 seconds):**
   - Session summary appears:
     ```
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     Session Complete
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     Tokens:  68,234 input + 9,512 output
     Cached:  0 (first run)
     Model:   claude-opus-4-6
     Cost:    $2.94
     Time:    4 min 52 sec
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     ```

**⏱️ Module run time: 5 minutes**
**💰 Cost: $2.94**

---

#### **MINUTES 30-45: Export & Review**

**You now have 4 deliverables.** Let's export them.

**Step 1: Export to DOCX** (30 seconds)

1. Click "📝 Export to DOCX" button
2. System generates Word document with:
   - Your company logo (if configured)
   - Professional formatting
   - All 4 deliverables
   - Table of contents
   - Page numbers
3. Download: `AMLR_Gap_Analysis_20260220.docx`
4. File size: 142 KB (18 pages)

**Step 2: Export gap matrix to Excel** (30 seconds)

1. Click "📊 Export to XLSX"
2. System generates Excel with:
   - **Sheet 1:** Gap Scoring Matrix
     - Columns: Article | Requirement | Current State | Gap Score (🟢🟡🔴) | Priority | Notes
     - Conditional formatting (red = high priority)
     - Auto-filters enabled
   - **Sheet 2:** Action Plan
     - Columns: Action | Owner | Deadline | Effort | Dependencies
3. Download: `Gap_Matrix_20260220.xlsx`
4. File size: 38 KB

**Step 3: Review and iterate** (5 minutes)

You read the Executive Summary. It's excellent, but you want more detail on Article 18 (cooperation with FIUs).

**In the "Continue conversation" box:**

```
Expand on Article 18 gaps. What specific changes are needed
to our SAR filing procedures?
```

**Click "Continue"**

**What happens (2 minutes):**

1. **Prompt caching kicks in:**
   - Previous context (68k tokens) is cached
   - Only new question (50 tokens) + previous output sent
   - **Cost: $0.18** (vs $2.94 without caching)
   - **Savings: 94%**

2. **Focused response:**
   - 2-page deep dive on Article 18
   - Specific procedure changes
   - Template language for new SAR criteria
   - Implementation timeline

3. **Updated session cost:**
   ```
   Total session cost: $3.12
   Messages: 2
   ```

**Step 4: Export final version** (30 seconds)

- Export updated analysis to DOCX
- Now includes deep dive on Article 18
- Total pages: 21

**⏱️ Export & iteration time: 8 minutes**
**💰 Additional cost: $0.18**

---

#### **MINUTES 45-60: Explore Other Features**

You have 15 minutes left. Let's try other capabilities.

**Explore 1: Brief Me (Quick Question)** (3 minutes)

1. Click "Brief Me" in navigation
2. Type: "What's new in AMLR compared to the 4th AMLD?"
3. Click "Ask Anton"
4. Response in 45 seconds:
   - 1-page summary of key changes
   - No configuration needed
   - Model auto-selected (Sonnet 4.5)
   - Cost: $0.04
5. Click "Go Deeper" → opens full module for detailed analysis

**Explore 2: Guide Me (Wizard)** (4 minutes)

1. Click "Guide Me" in navigation
2. **Step 1:** "What do you need help with?"
   - Type: "Create a sanctions policy"
   - Select category: "Policy & Procedures"
3. **Step 2:** "What type of output?"
   - Select: "Document" (formal policy)
4. **Step 3:** "What's your role?"
   - Select: "Compliance Officer"
5. **Result:** Anton recommends 3 modules:
   - ⭐ Sanctions Policy Builder (97% match)
   - Regulatory Document Creator (84% match)
   - Governance Framework Designer (76% match)
6. Click "Use This" → redirected to Sanctions Policy Builder with pre-filled inputs

**Explore 3: Skills Library** (2 minutes)

1. Click "Skills" in navigation
2. Browse: 47 reusable prompt skills
3. Try: "Devil's Advocate" skill
   - Description: "Challenge assumptions, find weaknesses"
   - Example: "What are the risks of this approach?"
4. Add to favorites for future use

**Explore 4: Workflows (Preview)** (3 minutes)

1. Click "Workflows" in navigation
2. Browse: Pre-built workflow templates
3. Preview: "Monthly Regulatory Update"
   - Step 1: Search for EU AML developments (web search)
   - Step 2: Generate impact briefing (LLM)
   - Step 3: Export to PDF
   - Step 4: Email to compliance team
4. Click "Use Template" → workflow builder opens
5. Schedule: First Monday of every month at 9 AM
6. Save (but don't run yet — you can set up later)

**Explore 5: Intelligence Dashboard (Preview)** (3 minutes)

1. Click "Intelligence" in navigation
2. See: Cross-Workflow Intelligence dashboard
3. Preview features:
   - **Knowledge Graph:** Entities extracted (your bank, AMLR, TM systems)
   - **Patterns Detected:** 0 (need more sessions for patterns)
   - **Quality Scores:** Your session scored 92/100
   - **Apprentice Status:** Observer mode (10 sessions needed to advance)
4. Note: "Complete 5+ sessions across areas to unlock full intelligence features"

**⏱️ Exploration time: 15 minutes**

---

#### **END OF HOUR: What You've Accomplished**

**Time spent:** 60 minutes

**What you created:**

1. ✅ **18-page AMLR Gap Analysis** (4 deliverables)
   - Gap Scoring Matrix (Excel)
   - Executive Summary (Word)
   - Action Plan (Word)
   - Detailed Findings (Word)

2. ✅ **Regulatory briefing** on AMLR vs 4th AMLD

3. ✅ **Module recommendations** for sanctions policy

4. ✅ **Workflow template** saved for monthly updates

**Total cost:** $3.16 (gap analysis $2.94 + iteration $0.18 + quick question $0.04)

**Value created:**

- **Consultant equivalent:** 12-16 hours × $200/hour = **$2,400-3,200**
- **Your cost:** $3.16
- **Savings:** $2,397 (99.87%)

**Time saved:**

- **Manual research & analysis:** 12-16 hours
- **Your time:** 1 hour
- **Time saved:** 11-15 hours (92%)

---

#### **What Happens Next?**

**If you're an individual / student:**
- Continue exploring modules in your areas of interest
- Build personal knowledge base
- Use for academic research, career development
- Monthly cost: $20-50 (covers 50-100 analyses)

**If you're a small business:**
- Implement regular compliance workflows
- Build policy library
- Schedule monthly regulatory updates
- Monthly cost: $100-300

**If you're an enterprise:**
- Onboard compliance team (5-20 users)
- Set up RBAC (admin, analyst, user roles)
- Configure budget caps per user
- Enable cross-workflow intelligence
- Monthly cost: $500-1,500

**If you're a consultant (Big 4):**
- Use for client deliverables
- Build institutional memory across engagements
- Enable knowledge graph and pattern detection
- Share custom modules across team
- Monthly cost: $2,000-6,000

---

#### **Common First-Hour Questions**

**Q: "Is this too good to be true?"**
A: No. This is what happens when you:
1. Build on Claude Opus 4.6 (best-in-class LLM)
2. Add 7-layer prompt engineering (domain expertise)
3. Provide local document context (your actual data)
4. Structure output (20 format templates)
5. Make it local-first (no cloud latency)

The AI does the heavy lifting. You do the strategic thinking.

**Q: "What if the output is wrong?"**
A: Always review AI output. openEXPERT helps with:
1. Citation requirements (must reference specific articles)
2. Compliance rules (automated checks)
3. Quality scoring (6-dimensional assessment)
4. Version history (compare iterations)

But YOU are the final reviewer. This is a power tool, not autopilot.

**Q: "How do I know it's not hallucinating?"**
A: Multiple safeguards:
1. **Thinking display:** See Claude's reasoning process
2. **Citations:** Every claim should cite source
3. **Local documents:** Grounds analysis in YOUR data
4. **Compliance rules:** Automated checks for completeness
5. **Quality alerts:** Flags low-confidence outputs

Hallucinations still possible — always verify critical outputs.

**Q: "What about data privacy?"**
A: openEXPERT is local-first:
- Your documents: Stored in `uploads/` folder (never sent to cloud)
- Your database: SQLite file on your machine
- API calls: Only prompts + your documents sent to Claude API
- Anthropic policy: Does not train on your data (commercial terms)
- Alternative: Use Ollama (100% local, $0 API cost)

**Q: "What if I need help?"**
A: Three support channels:
1. **Documentation:** Full whitepaper (this document)
2. **Community:** GitHub Discussions (Q&A, feature requests)
3. **Issues:** GitHub Issues (bug reports)

No paid support (yet) — this is open source.

**Q: "Can I customize modules?"**
A: Yes! Three ways:
1. **Edit system prompts:** Click "System Prompt ▸" in any module
2. **Build custom modules:** "Build Your Own Module" page
3. **Modify code:** It's open source — fork and customize

**Q: "What's next after the first hour?"**
A:
1. **Weeks 1-2:** Explore all 29 areas, try 20-30 modules
2. **Weeks 3-4:** Build 3-5 workflows for recurring tasks
3. **Month 2:** Enable intelligence features (knowledge graph, patterns)
4. **Month 3:** Create custom modules for your specific needs
5. **Month 6:** Contribute modules back to community

---

### Summary: The First Hour Sets the Stage

**In 60 minutes**, you've:
- ✅ Installed and configured openEXPERT
- ✅ Generated a professional compliance deliverable
- ✅ Iterated with 94% cost savings (prompt caching)
- ✅ Explored 5 different features
- ✅ Saved 11-15 hours of manual work
- ✅ Created $2,400-3,200 of value for $3.16

**The next 60 hours will 100x that.**

**Welcome to the future of knowledge work.**

---


### Custom Modules

**Create your own module:**

**1. Navigate to "Build Your Own Module"**

**2. Fill in module details:**
- Name: "Client X Sanctions Review"
- Description: "Tailored sanctions compliance review for Client X's specific risk profile"
- Icon: Shield
- Area: FCP (or custom)

**3. Configure defaults:**
- Thinking: `think_hard`
- Creativity: `strict`
- Output formats: `detailed-findings`, `action-plan`
- Knowledge sources: Enable web search + local folder (client docs)

**4. Write system prompt:**
```markdown
# Client X Sanctions Review

## Objective
Review Client X's sanctions screening program against EU Regulation 833/2014 and OFAC requirements.

## Methodology
1. Review screening rules and scenarios
2. Test sample transactions against latest sanctions lists
3. Identify false positive rates and tuning opportunities
4. Assess vendor system capabilities
5. Review governance (policies, training, escalation)

## Output Structure
- Executive summary (board-ready)
- Detailed findings (per control area)
- Action plan with priorities
- Vendor assessment (if applicable)

## Focus Areas
- Crypto asset screening (Client X handles crypto)
- Cross-border wire transfers to high-risk jurisdictions
- Beneficial ownership screening
```

**5. Test module:**
- Run test session with sample input
- Review output quality
- Iterate on prompt

**6. Save and share:**
- Save as private (your use only)
- Or mark "Share with community" (make public)

---

### Workflows

**Create multi-step workflow:**

**1. Navigate to "Workflow Builder"**

**2. Design workflow:**
- Name: "Quarterly Compliance Cycle"
- Description: "Automated quarterly gap analysis + board report"

**3. Add steps:**

**Step 1: Gap Analysis**
- Type: Module Execution
- Module: AMLR Gap Analysis
- Inputs: (from guided input form or variables)
- Output variable: `${gap_analysis}`

**Step 2: Checkpoint — Review Findings**
- Type: Checkpoint
- Assigned to: ${mlro_email}
- Decision: Approve / Request Changes

**Step 3: Decision Gate**
- Type: Decision Gate
- Condition: `checkpoint_decision = "Approve"`
- True path: Continue to Step 4
- False path: Loop back to Step 1

**Step 4: Board Report**
- Type: Module Execution
- Module: Board Report Generator
- Inputs: `${gap_analysis.output.findings}`

**Step 5: Send Email**
- Type: Email
- To: board@company.com
- Subject: "Q${quarter} Compliance Report"
- Attach: `${step4.output}`

**4. Schedule workflow:**
- CRON: `0 9 1 1,4,7,10 *` (9 AM on Jan 1, Apr 1, Jul 1, Oct 1)
- Enable: ✓

**5. Monitor executions:**
- Navigate to "Workflow Monitor"
- View running/completed workflows
- Inspect step-by-step logs

---

### Skills Library

**Use pre-built skills:**

**1. Navigate to "Skills Library"**

**2. Browse by category:**
- Regulatory Frameworks (AMLR, GDPR, Basel III, etc.)
- Methodologies (RACI, SWOT, Gap Analysis, Risk Assessment)
- Templates (Board Report, Policy Document, Action Plan)

**3. Attach skill to module:**
- Open module configuration
- "Attach Skills" section
- Select: "EBA Risk Factor Guidelines"
- Skill prompt automatically added to system prompt

**4. Create custom skill:**
- Click "Create Skill"
- Name: "Client X Risk Appetite"
- Category: Governance
- Prompt: "Apply Client X's risk appetite: ML/TF risk tolerance = Medium. Sanctions risk tolerance = Low. No appetite for crypto asset exposure."
- Save
- Attach to relevant modules (gap analysis, risk assessment)

---

### Knowledge Sources

**Advanced knowledge source configuration:**

**Scenario: Complex gap analysis**

**1. Enable all 4 modes:**
- ✅ Claude Knowledge + Web Search (for latest EBA guidance)
- ✅ Online Reference: `https://eur-lex.europa.eu/eli/reg/2024/1624` (AMLR text)
- ✅ Local Folder: `/Regulations/AMLR/` (downloaded RTS, ITS, guidelines)
- ✅ Combined Mode: Priority = `merged` (cross-reference all sources)

**2. Token management:**
- Monitor: "Loaded: 145k / 180k tokens (80%)"
- If exceeds: Deselect low-priority files or switch online reference to "summary" mode

**3. Custom instructions (Combined Mode):**
```
Compare client's AML policy against AMLR Article 4 requirements.
Use EUR-Lex text for official regulation wording.
Use EBA guidelines for interpretation guidance.
Use local folder docs for client-specific context.
Where client policy is silent, identify gap.
Where client policy differs from regulation, assess materiality and flag.
```

---

### Prompt Editing

**Advanced users can edit system prompts:**

**1. Open module**

**2. Expand "System Prompt" section (collapsible)**

**3. Edit prompt:**
- Add client-specific instructions
- Adjust output structure
- Add/remove sections

**4. Save changes:**
- "Save as new module" (keeps original intact)
- Or "Update this module" (overwrites default)

**Best practice:** Always test edited prompts before using for client work

---

## 28. Enterprise Administration

### User Management

**Admin dashboard** (`/admin`):

**Add users:**
- Username, email, role (admin, analyst, user)
- Set monthly budget cap
- Assign to projects/teams

**Manage permissions:**
- Role-based access (which modules, which areas)
- Custom permissions (view-only, execute-only, export-only)

**Monitor usage:**
- Per-user token consumption
- Per-user cost (monthly, YTD)
- Activity logs (last login, sessions created)

---

### Budget Controls

**Set organizational budget:**
- Global cap: $10,000/month
- Per-user caps: $500/user/month
- Alerts: 80% threshold (email to admin)
- Enforcement: 100% threshold (block API calls)

**Cost allocation:**
- By user
- By project
- By area/module
- Export CSV for finance team

---

### Compliance & Audit

**Audit log access:**
- Filter by: user, module, date range, model, quality score
- Export: CSV, XLSX for regulators
- Retention: Configure (default 2 years)

**Compliance rule management:**
- Enable/disable rules
- Create custom rules (firm-specific standards)
- Review violations
- Generate compliance reports

---

### Backup & Disaster Recovery

**Automated backups:**
```bash
# Daily backup cron job
0 2 * * * /usr/local/bin/backup-openexpert.sh
```

**Backup script:**
```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR=/backups/openexpert
mkdir -p $BACKUP_DIR

# Backup database
cp data/workbench.sqlite $BACKUP_DIR/workbench-$DATE.sqlite

# Backup uploads
tar -czf $BACKUP_DIR/uploads-$DATE.tar.gz uploads/

# Encrypt (optional)
gpg --encrypt --recipient admin@company.com $BACKUP_DIR/workbench-$DATE.sqlite

# Upload to cloud (optional)
aws s3 cp $BACKUP_DIR/ s3://company-backups/openexpert/ --recursive

# Retention: delete backups older than 90 days
find $BACKUP_DIR -name "*.sqlite" -mtime +90 -delete
```

---

### Integration & API

**REST API** (future):
- Programmatic module execution
- Session retrieval
- Workflow triggering

**Webhooks** (future):
- Notify external systems on workflow completion
- Integrate with Slack, Teams, Jira

**MCP Integration:**
- openEXPERT MCP server exposes modules as Claude Desktop tools
- Run: `pnpm run mcp`
- Configure in Claude Desktop settings
- Use openEXPERT modules directly from Claude.ai interface

---

## PART 9: COMMUNITY & FUTURE

## 29. Building Custom Modules

### Module Anatomy

**Every module needs:**

**1. Module Configuration** (`module.json`)
```json
{
  "id": "unique-module-id",
  "label": "Display Name",
  "shortLabel": "Short",
  "icon": "LucideIconName",
  "description": "What this module does...",
  "color": "adv-teal",
  "defaults": {
    "thinking": "think_hard",
    "creativity": "balanced",
    "outputFormats": ["executive-summary", "detailed-findings"],
    "knowledgeSources": {...}
  },
  "guidedInputs": [...]
}
```

**2. System Prompt** (`system-prompt.md`)
- Clear objective
- Step-by-step methodology
- Output structure template
- Quality criteria

**3. Area Context** (if creating new area)
- Domain background
- Key frameworks and methodologies
- Stakeholder landscape

---

### Module Design Best Practices

**1. Start with a real problem**
- Don't create modules for the sake of it
- Solve actual pain points
- Test with real scenarios

**2. Define clear scope**
- "AMLR Gap Analysis" (specific) not "AML Compliance" (too broad)
- Focused modules produce better output than generic ones

**3. Pre-configure intelligently**
- Defaults should work for 80% of use cases
- Users can override, but shouldn't need to

**4. Provide guided inputs**
- Help users provide the right context
- Select fields for common choices (entity type, jurisdiction)
- Free text for unique context

**5. Write specific prompts**
- "Compare institution's CDD process against AMLR Article 4(1)-(4) requirements, scoring each sub-requirement as Compliant/Partial/Gap"
- Not: "Analyze AML compliance"

**6. Test, iterate, improve**
- Run module 5+ times with different inputs
- Check quality scores
- Refine prompt based on weaknesses

---

## 30. Contribution & Community

### How to Contribute

openEXPERT is open source (MIT License). Contributions welcome!

**Ways to contribute:**

**1. Contribute a module**
- Write module.json + system-prompt.md
- Test with real scenarios
- Submit pull request
- Include: module purpose, target users, example outputs

**2. Contribute a persona**
- Create expert persona profile
- Describe: role, expertise, analytical approach, red flags
- Submit as JSON file

**3. Contribute a skill**
- Package domain knowledge (framework, methodology, template)
- Write skill prompt
- Tag appropriately
- Submit pull request

**4. Translate**
- Add language to `src/i18n/locales/`
- Translate UI strings
- Submit pull request

**5. Report issues**
- Found a bug? Module producing poor output? Missing feature?
- Open GitHub issue with details
- Include: module, configuration, example output, expected vs. actual

**6. Improve prompts**
- Module quality = prompt quality
- See a module that could be better? Improve the prompt
- Test thoroughly, submit pull request

---

### Quality Standards

**All contributions must:**
- Be written by someone with professional experience in the domain
- Include clear, specific prompts (not generic)
- Specify appropriate defaults (thinking depth, creativity, output formats)
- Include at least 3 guided input fields
- Produce output that professionals would find credible
- Be tested against 2+ real-world scenarios

---

### Community Guidelines

**We value:**
- Domain expertise
- Clarity and accessibility
- Constructive feedback
- Professional standards

**We do not accept:**
- Modules promoting harm, discrimination, or illegal activity
- Medical, legal, or financial advice without appropriate disclaimers
- Plagiarized or copyrighted content
- Prompts that violate LLM provider policies

---

## 31. Roadmap & Future Vision

### Completed (v2.0 — February 2026)

✅ 238 modules across 29 areas
✅ All 14 transformative features
✅ Multi-LLM support (4 providers)
✅ Enterprise security (RBAC, audit, budget)
✅ Advanced intelligence (knowledge graph, pattern detection)
✅ Workflow automation
✅ Local-first architecture
✅ 80+ database tables
✅ 41 API routes
✅ 36 React pages

---

### In Progress (Q1-Q2 2026)

🔄 Mobile responsive UI (final polish)
🔄 Advanced analytics dashboards
🔄 Cloud deployment templates (AWS, Azure, Google Cloud)
🔄 API documentation (REST API for integrations)
🔄 Additional language support (Swedish, Finnish, Norwegian, Danish)

---

### Planned (Q3-Q4 2026)

📅 **Community marketplace:**
- Module sharing platform
- Skill library expansion
- User ratings and reviews

📅 **Enterprise features:**
- PostgreSQL adapter (replace SQLite for large deployments)
- Advanced RBAC (custom permissions per user)
- SSO integrations (SAML, OIDC for corporate SSO)

📅 **Mobile app:**
- iOS and Android companion apps
- Review outputs on mobile
- Voice input (dictate queries)

📅 **Advanced automation:**
- Webhook integrations (Slack, Teams, Jira)
- Zapier/Make.com connectors
- API for programmatic execution

📅 **AI enhancements:**
- Multi-modal inputs (images, screenshots, diagrams)
- Vision support (analyze charts, tables from PDFs)
- Audio transcription (meeting notes → modules)

---

### Long-Term Vision (2027+)

🔮 **Open ecosystem:**
- Marketplace for premium modules (creators monetize expertise)
- Certification program (verified domain experts)
- Partner network (consultancies offering openEXPERT-based services)

🔮 **SaaS offering:**
- Hosted version (for users who prefer cloud)
- Multi-tenant architecture
- Enterprise support and SLAs

🔮 **Advanced intelligence:**
- Predictive analytics (forecast compliance risks)
- Anomaly detection (flag unusual patterns proactively)
- Benchmarking (compare quality scores across organizations)

🔮 **Global expansion:**
- Modules for non-EU jurisdictions (US, APAC, MENA)
- Localized regulatory knowledge
- Multi-language prompts

---

## 32. FAQ

**Q: Is openEXPERT free?**
A: Yes. The software is free and open source (MIT License). You pay only for AI API usage (Claude, GPT, Mistral). Typical costs: $0.05-$5 per session depending on complexity.

**Q: Can I use it commercially?**
A: Yes. MIT License permits commercial use. Use it for client work, internal operations, or as part of a commercial service.

**Q: Is my data safe?**
A: Yes. openEXPERT runs locally. Documents, sessions, and outputs stored in SQLite on your machine. Only API requests to Claude/GPT/Mistral leave your environment. Review provider privacy policies for details.

**Q: Can I use different AI models?**
A: Yes. Supports Anthropic Claude, OpenAI GPT, Mistral, and local Ollama models. Switch models per session.

**Q: How accurate are the outputs?**
A: openEXPERT produces professional-quality output for structured analytical work. However, AI can make errors. **Always review outputs before using them for decisions**, especially in regulated contexts.

**Q: Can I create custom modules?**
A: Yes. "Build Your Own Module" feature lets you create custom modules with visual editor. Keep them private or share with community.

**Q: Does it work offline?**
A: Partially. UI and database work offline. But AI models require API calls (unless using local Ollama). For full offline capability, deploy with Ollama in air-gapped environment.

**Q: What about data residency (GDPR)?**
A: Data stored locally (GDPR Article 5 — data minimization). For strict data residency, use Mistral (EU-based provider) or local Ollama (nothing leaves network).

**Q: Can multiple users collaborate?**
A: Yes. Multi-user support with RBAC. Collaborative Canvas enables team workflows with step assignment, parallel reviews, and SLA tracking.

**Q: How do I get help?**
A: Open an issue on GitHub repository. Community and maintainers are active. For enterprise support, contact via GitHub.

**Q: Who created this?**
A: Daniel Bardun (14+ years in banking, FCP, regulatory consulting at SEB, Sveriges Riksbank, EY, Advisense). Built with passion for making AI accessible and professional.

**Q: What's the catch?**
A: No catch. Open source = transparent. We believe this capability should power-charge every sector and enable more people. When more people can do valuable work, everyone benefits.

---

## Conclusion

openEXPERT by ANTON is more than software — it's a **new way of working with AI**.

**What makes it different:**
- ✅ **Expert training built-in:** 238 modules with professional-grade prompts
- ✅ **Complete transparency:** See exactly how AI thinks (3 transparency levels)
- ✅ **Local-first:** Your data never leaves your machine
- ✅ **Enterprise-ready:** RBAC, audit trails, budget controls, compliance rules
- ✅ **Intelligent:** Learns from your work (cross-workflow intelligence, pattern detection, institutional memory)
- ✅ **Collaborative:** Multi-human workflows with SLA tracking and consensus
- ✅ **Open source:** Free, transparent, community-driven

**Who it's for:**
- 👤 Individuals (students, job seekers, personal finance)
- 🏢 Small businesses (startups, SMBs navigating compliance)
- 🏛️ Corporates (regulated industries, professional services)
- 🏦 Financial institutions (banks, FIs, payment providers)
- 💼 Consultants (Big 4, boutique firms, independent consultants)

**The mission:**
**Democratize access to expert-level AI assistance.** A student deserves the same analytical frameworks as a Fortune 500 compliance officer. A small business deserves the same structured guidance as a Big4 client.

**The result:**
**More people doing more valuable work.** AI time savings → creative freedom. Mundane tasks automated → focus on strategy. Quality consistency → regulatory confidence.

---

**Ready to start?**

```bash
git clone https://github.com/danielbardun/openexpert
cd openexpert
pnpm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY
pnpm run db:init
pnpm run dev
```

**Welcome to openEXPERT. Welcome to the future of knowledge work.**

---

**openEXPERT by ANTON**
Open Source · Expert-Grade AI · For Everyone
Version 2.0.0 — February 20, 2026

**Created by:** Daniel Bardun & FutureChain AB
**License:** MIT
**Website:** https://github.com/danielbardun/openexpert
**Support:** Open an issue on GitHub

---

> *"Everyone talks about AI changing work. But between the promise and the reality, there's a gap — a gap of knowledge, a gap of time, a gap of training. openEXPERT closes all three. We gave the AI a proper professional education, so you don't have to be an AI expert to get expert results. The time you save isn't just efficiency — it's creative freedom."*
>
> — Daniel Bardun, Creator of openEXPERT by ANTON

---

**END OF WHITEPAPER**
