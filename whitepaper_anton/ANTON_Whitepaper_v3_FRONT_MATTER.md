# ANTON by openEXPERT — Technical Whitepaper

**Version:** 3.0.0
**Date:** February 23, 2026
**Status:** Public Release
**License:** Open Source (MIT)
**Created by:** Daniel Bardun & FutureChain AB
**Powered by:** Anthropic Claude API (primary) + OpenAI GPT + Google Gemini + Mistral + Local Ollama

---

> *"Everyone talks about AI changing work. But between the promise and the reality, there's a gap — a gap of knowledge, a gap of time, a gap of training. ANTON closes all three. We gave the AI a proper professional education, so you don't have to be an AI expert to get expert results. The time you save isn't just efficiency — it's creative freedom. And now, with v3.0, we've given it the ability to write code, connect to your data, and help discover where AI creates the most value. Give it away, hold nothing back, and let the work speak."*
>
> — Daniel Bardun, Creator of ANTON by openEXPERT

---

### What Is ANTON?

**ANTON** is an open-source, AI-powered expert platform that transforms how people work with AI across 29 professional domains — from financial crime prevention and legal advisory to project management, healthcare, education, and personal development. It is the flagship tool of the **openEXPERT** foundation, which represents a broader vision for how domain expertise should be captured, structured, and made accessible through AI.

**238 modules. 29 domains. 6 AI providers. 82 database tables. Completely free.**

**ANTON by openEXPERT**
Open Source · Expert-Grade AI · For Everyone

---

---

## Executive Summary

### The Problem

AI models like Claude are extraordinarily capable — like having access to a super-smart graduate student who has read everything, remembers everything, and can reason at exceptional speed. But there's a gap: that graduate student, brilliant as they are, has never actually worked in your industry. They don't know how a gap analysis is structured in practice, what a regulator expects in a remediation plan, how a project status report should land with a steering committee, or what "good" looks like when a compliance officer reviews a policy document.

### The Solution

ANTON bridges that gap by giving AI what every talented graduate needs when they enter the real world: **proper professional training**. We've taught it how 238 different tasks actually work — not in theory, but in practice. We've defined what should be done, what a good outcome looks like, who the relevant experts are, and how experienced professionals structure their thinking.

The result is not just a tool — it's a **new way of collaborating with AI** that works whether you're deeply technical or have never written a prompt in your life.

### Why It Matters

Everyone talks about how AI will change work. But there's a gap between promise and reality — actually, there are six gaps:

1. **The knowledge gap:** Most people lack the AI expertise to craft effective prompts
2. **The time gap:** Even experts don't have hours to provide perfect context
3. **The training gap:** AI models lack real-world professional experience
4. **The trust gap:** How do you know if AI output is actually good?
5. **The safety gap:** Where does my data go? Who can see it?
6. **The governance gap:** How do we ensure quality and compliance at scale?

**ANTON closes all six:**

- ✅ **Knowledge gap:** Pre-configured modules with expert-level prompts — no prompt engineering needed
- ✅ **Time gap:** Ready to use in minutes, not hours — persistent knowledge reused automatically
- ✅ **Training gap:** 238 modules give AI proper professional training across 29 domains
- ✅ **Trust gap:** Quality scoring, human review workflows, compliance checks, process-based trust
- ✅ **Safety gap:** Runs locally on your machine; data never leaves unless you choose cloud AI
- ✅ **Governance gap:** Built-in audit trails, RBAC, budget controls, compliance-as-code rules

### Key Numbers (Version 3.0)

| Metric | Count | Details |
|--------|-------|---------|
| **Expert Areas** | 29 | Expanding to 41+ across professional, regional, and accessibility tracks |
| **Modules** | 238 | Pre-configured expert workflows with professional-grade prompts |
| **LLM Providers** | 6 | Claude (primary), GPT, Gemini, Mistral, Ollama, MCP |
| **Skills** | 20+ | Reusable analytical techniques (Devil's Advocate, Systems Thinking, etc.) |
| **Personas** | 26+ | Expert role definitions with calibrated experience profiles |
| **Output Formats** | 22+ | From executive summaries to RACI matrices |
| **Export Formats** | 5 | Markdown, DOCX, XLSX, PDF, PPTX |
| **Database Tables** | 82 | Across 16 functional groups supporting knowledge persistence |
| **API Routes** | 41 | ~224 HTTP endpoints across comprehensive backend services |
| **Pages** | 36+ | Complete user workflows |
| **Transformative Features** | 14/14 | All fully implemented |
| **Security Features** | 9 | RBAC, audit, rate limiting, sandboxing, budget enforcement, etc. |

### What's New in Version 3.0

**MAJOR UPDATE:** Version 3.0 expands ANTON from a professional analysis platform into a comprehensive **AI coworker system** — now including AI-led software development, external data integration, discovery workshops, and dramatically expanded expert coverage.

**New capabilities:**

- ✅ **AI-Led Software Development** — 4-tier Coding Area (Code Review → Script Lite → Script Medium → Coding Large) with professional governance
- ✅ **AI Code Instruction Builder** — ANTON as "senior architect" generating .md instruction files for Claude Code, Codex, or Mistral Code
- ✅ **Discovery Mode** — Workshop framework + digital guided conversation for identifying AI opportunities
- ✅ **External Data Integration** — Direct database connectivity (PostgreSQL, MySQL, MSSQL, MongoDB, REST APIs, MCP)
- ✅ **PowerPoint Generation Pipeline** — Full PPTX output with AI content, pptxgenjs rendering, and QA loop
- ✅ **Expanded Expert Coverage** — Roadmap from 29 to 41+ areas across 3 expansion waves
- ✅ **Google Gemini + Sonnet 4.6** — 6th LLM provider and latest Claude model added
- ✅ **MCP Integration** — Model Context Protocol server and client for universal connectivity

### Architecture at a Glance

**Frontend:** React 18 + TypeScript, Tailwind CSS + shadcn/ui, 36+ pages, dark theme

**Backend:** Node.js + Express, SQLite with WAL mode, 53 specialised services, streaming SSE

**AI Integration:** Anthropic Claude (Opus 4.6, Sonnet 4.6, Sonnet 4.5, Haiku 4.5), OpenAI GPT, Google Gemini 2.0 Flash, Mistral Large, Local Ollama, MCP

**Intelligence:** 7-layer prompt builder, 4-mode knowledge source resolver, 5-layer cross-workflow intelligence, pattern detection (5 types), quality ratchet (6 dimensions), apprentice model (4 stages)

**Governance:** Compliance-as-Code, audit logging, RBAC, budget management, review workflows

### Who Built This?

**Creator:** Daniel Bardun — 14+ years in banking, financial crime prevention, and regulatory consulting at SEB, Sveriges Riksbank, EY, and Advisense.

**Corporate Entity:** FutureChain AB (intellectual property stewardship)

**Part of the openEXPERT Foundation:** ANTON is the flagship platform in the openEXPERT ecosystem, which also includes ALMA and ALEXANDER — sharing the same philosophy that expert-level AI capabilities should be accessible to everyone.

---

---

## Important Notices

### This Is a Tool, Not a Replacement

ANTON is designed to **augment** professional work, not replace professional judgment. Every output should be reviewed by a qualified professional before use in decisions, submissions, or client deliverables.

**Critical limitations:**
- AI can and does make errors — factual mistakes, logical gaps, hallucinated citations
- Regulatory analysis requires human verification by qualified compliance professionals
- Legal outputs are not legal advice — consult qualified lawyers
- Financial outputs are not financial advice — consult qualified advisors
- Medical outputs are not medical advice — consult qualified healthcare professionals

### Your Responsibilities

**Review everything.** ANTON produces high-quality starting points, not finished deliverables. Your expertise, judgment, and accountability remain essential.

**Protect sensitive data.** While ANTON runs locally, prompts sent to cloud AI providers (Claude, GPT, Gemini, Mistral) leave your machine. Review provider privacy policies. For maximum privacy, use local Ollama models.

**Comply with regulations.** You are responsible for ensuring that your use of ANTON complies with applicable laws, regulations, and professional standards in your jurisdiction.

**Verify citations.** Always verify regulatory references, case citations, and source attributions. AI can generate plausible but incorrect citations.

### API Costs

ANTON is free. The AI models are not (except Ollama). You need API keys from your chosen provider(s):
- **Anthropic Claude:** ~$0.02-$20 per session depending on model and complexity
- **OpenAI GPT:** Similar range
- **Google Gemini:** Free tier available; paid tier competitive
- **Mistral:** Competitive pricing
- **Ollama:** Completely free (runs locally on your hardware)

### Open Source License

ANTON is released under the **MIT License** — the most permissive open-source license available. You can use it commercially, modify it, distribute it, and build on it. Attribution appreciated but not required.

### Five Safeguards Built In

1. **Extended Thinking** — See AI's reasoning process (transparency levels 0-2)
2. **Citation Requirements** — Modules require regulatory references where applicable
3. **Local Document Grounding** — AI analyses your actual documents, not generic knowledge
4. **Compliance Rules** — Automated checks against regulatory and quality standards
5. **Quality Alerts** — Warnings when output quality drops below configured thresholds

---

---

## Table of Contents

### Prologue: Our Story
- [Why We Built This](#why-we-built-this)

### Part 1: Vision & Philosophy
1. [The Problem We're Solving](#1-the-problem-were-solving)
2. [Our Philosophy: AI as a Coworker, Not a Magic Box](#2-our-philosophy-ai-as-a-coworker-not-a-magic-box)
3. [Transparency: Seeing How AI Thinks](#3-transparency-seeing-how-ai-thinks)
4. [Trust: Building a Working Relationship with AI](#4-trust-building-a-working-relationship-with-ai)
5. [Integration: Your Organisation, Your Machine, Your Data](#5-integration-your-organisation-your-machine-your-data)
6. [Safety & Security: Non-Negotiable Foundations](#6-safety--security-non-negotiable-foundations)
7. [Open Source: Why We Give This Away](#7-open-source-why-we-give-this-away)
8. [The Connected Vision: Where This Goes](#8-the-connected-vision-where-this-goes)

### Part 2: Introduction & Value
9. [What You Get Today](#9-what-you-get-today)
10. [Who This Is For](#10-who-this-is-for)
11. [Why ANTON?](#11-why-anton)

### Part 3: Core Architecture
12. [How It Works: The Seven-Layer Prompt Builder](#12-how-it-works-the-seven-layer-prompt-builder)
13. [Knowledge Source System (4 Modes)](#13-knowledge-source-system-4-modes)
14. [Multi-LLM Architecture](#14-multi-llm-architecture)
15. [Database & Persistence](#15-database--persistence)

### Part 4: Intelligence & Memory Systems
16. [Cross-Workflow Intelligence (5-Layer Funnel)](#16-cross-workflow-intelligence-5-layer-funnel)
17. [Knowledge Graph & Entity Relationships](#17-knowledge-graph--entity-relationships)
18. [Pattern Detection Engine](#18-pattern-detection-engine)
19. [Institutional Memory Engine](#19-institutional-memory-engine)

### Part 5: Quality & Learning
20. [Quality Ratchet & Continuous Improvement](#20-quality-ratchet--continuous-improvement)
21. [Apprentice Model (4-Stage Learning)](#21-apprentice-model-4-stage-learning)
22. [Output Versioning & Diff Engine](#22-output-versioning--diff-engine)

### Part 6: Automation & Governance
23. [Time Intelligence & Regulatory Radar](#23-time-intelligence--regulatory-radar)
24. [Compliance-as-Code](#24-compliance-as-code)
25. [Workflow Automation & Scheduling](#25-workflow-automation--scheduling)
26. [Collaborative Canvas (Multi-Human Workflows)](#26-collaborative-canvas-multi-human-workflows)

### Part 7: AI-Led Software Development *(NEW in v3.0)*
27. [The Coding Area (4-Tier Architecture)](#27-the-coding-area-4-tier-architecture)
28. [AI Code Instruction Builder](#28-ai-code-instruction-builder)

### Part 8: External Data & Discovery *(NEW in v3.0)*
29. [External Data Integration Framework](#29-external-data-integration-framework)
30. [Discovery Mode](#30-discovery-mode)

### Part 9: The Expert Areas
31. [Expert Areas Overview (29 → 41+)](#31-expert-areas-overview)
32. [Flagship Area: Financial Crime Prevention](#32-flagship-area-financial-crime-prevention)
33. [Cross-Area Use Cases](#33-cross-area-use-cases)

### Part 10: Security, Privacy & Deployment
34. [Security Architecture](#34-security-architecture)
35. [Privacy & Data Safety](#35-privacy--data-safety)
36. [Deployment Models](#36-deployment-models)

### Part 11: Usage Guide
37. [Getting Started](#37-getting-started)
38. [Power User Guide](#38-power-user-guide)
39. [Enterprise Administration](#39-enterprise-administration)

### Part 12: Community & Future
40. [Building Custom Modules](#40-building-custom-modules)
41. [Contribution & Community](#41-contribution--community)
42. [Competitive Landscape](#42-competitive-landscape)
43. [Roadmap & Future Vision](#43-roadmap--future-vision)
44. [FAQ](#44-faq)

---

### Glossary

| Term | Definition |
|------|-----------|
| **ANTON** | The AI-powered expert platform — the flagship tool of the openEXPERT foundation |
| **openEXPERT** | The broader foundation and philosophy for AI-powered professional tools (includes ANTON, ALMA, ALEXANDER) |
| **Module** | A pre-configured expert workflow for a specific professional task (e.g., "AML Gap Analysis") |
| **Area** | A professional domain grouping related modules (e.g., "Financial Crime Prevention") |
| **Skill** | A reusable analytical technique that can be applied to any module (e.g., "Devil's Advocate", "Systems Thinking") |
| **Persona** | An expert role definition with calibrated experience, perspective, and communication style |
| **Knowledge Source** | One of four modes for providing context: AI knowledge, web search, local documents, or full integration |
| **Quality Ratchet** | 6-dimensional scoring system that measures and improves output quality over time |
| **Apprentice Model** | 4-stage learning progression (Novice → Supervised → Proficient → Expert) per module |
| **Compliance-as-Code** | Encoded regulatory and organisational rules checked automatically against every output |
| **Knowledge Graph** | Entity-relationship network built from extracted knowledge atoms across all sessions |
| **Institutional Memory** | Persistent capture of decisions, overrides, and organisational patterns |
| **Collaborative Canvas** | Multi-human workflow system with step assignment, parallel reviews, and SLA tracking |
| **Coding Area** | 4-tier AI-led software development system (Code Review → Script Lite → Script Medium → Coding Large) |
| **Discovery Mode** | Workshop and digital conversation system for identifying AI automation opportunities |
| **.anton package** | Exportable/importable module bundle for sharing expertise with colleagues or community |
| **MCP** | Model Context Protocol — open standard for connecting AI models to external tools and data |
| **RBAC** | Role-Based Access Control — permission system with admin, analyst, and user roles |
| **LLM** | Large Language Model — the AI models that power ANTON (Claude, GPT, Gemini, Mistral, Ollama) |
| **Ollama** | Local AI model runtime enabling fully offline, air-gapped operation |
| **Extended Thinking** | Claude's visible reasoning process, captured for transparency and audit |
| **Transparency Levels** | Three levels of AI reasoning visibility: Level 0 (output only), Level 1 (show thinking), Level 2 (deep trace) |

---

---

## PROLOGUE: OUR STORY

---

### Why We Built This

*(The rest of the document continues with the Prologue, Part 1 Vision chapters, and all technical parts as previously structured)*

---
