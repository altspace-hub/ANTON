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

**ANTON** is an open-source, AI-powered expert platform that transforms how people work with AI across 56 professional domains — from financial crime prevention and legal advisory to project management, healthcare, education, and personal development. It is the flagship tool of the **openEXPERT** foundation, which represents a broader vision for how domain expertise should be captured, structured, and made accessible through AI.

**485 modules. 56 domains. 5 AI providers. 73 database tables. Completely free.**

**ANTON by openEXPERT**
Open Source · Expert-Grade AI · For Everyone

---

---

## Executive Summary

### The Problem

AI models like Claude are extraordinarily capable — like having access to a super-smart graduate student who has read everything, remembers everything, and can reason at exceptional speed. But there's a gap: that graduate student, brilliant as they are, has never actually worked in your industry. They don't know how a gap analysis is structured in practice, what a regulator expects in a remediation plan, how a project status report should land with a steering committee, or what "good" looks like when a compliance officer reviews a policy document.

### The Solution

ANTON bridges that gap by giving AI what every talented graduate needs when they enter the real world: **proper professional training**. We've taught it how 485 different tasks actually work — not in theory, but in practice. We've defined what should be done, what a good outcome looks like, who the relevant experts are, and how experienced professionals structure their thinking.

The result is not just a tool — it's a **new way of collaborating with AI** that works whether you're deeply technical or have never written a prompt in your life.

### Why It Matters

Everyone talks about how AI will change work. But there's a gap between promise and reality — actually, there are ten gaps:

1. **The knowledge gap:** Most people lack the AI expertise to craft effective prompts
2. **The time gap:** Even experts don't have hours to provide perfect context
3. **The training gap:** AI models lack real-world professional experience
4. **The trust gap:** How do you know if AI output is actually good?
5. **The safety gap:** Where does my data go? Who can see it?
6. **The governance gap:** How do we ensure quality and compliance at scale?
7. **The repeatability gap:** How do we get consistent results across users and sessions?
8. **The shareability gap:** How do we share professional AI expertise across teams?
9. **The flexibility gap:** How do we avoid vendor lock-in to a single AI provider?
10. **The accessibility gap:** How do we make professional AI available to everyone?

**ANTON closes all ten:**

- ✅ **Knowledge gap:** Pre-configured modules with expert-level prompts — no prompt engineering needed
- ✅ **Time gap:** Ready to use in minutes, not hours — persistent knowledge reused automatically
- ✅ **Training gap:** 485 modules give AI proper professional training across 56 domains
- ✅ **Trust gap:** Quality scoring, human review workflows, compliance checks, process-based trust
- ✅ **Safety gap:** Runs locally on your machine; data never leaves unless you choose cloud AI
- ✅ **Governance gap:** Built-in audit trails, RBAC, budget controls, compliance-as-code rules
- ✅ **Repeatability gap:** Seven-layer prompt architecture ensures consistent methodology every time
- ✅ **Shareability gap:** The `.anton` open format packages and shares professional configurations
- ✅ **Flexibility gap:** 5 LLM providers — switch per session, no vendor lock-in
- ✅ **Accessibility gap:** Open source, MIT-licensed, available to everyone

### Key Numbers (Version 3.0)

| Metric | Count | Details |
|--------|-------|---------|
| **Expert Areas** | 56 | Spanning professional services, enterprise, social impact, and personal use |
| **Modules** | 485 | Pre-configured expert workflows with professional-grade prompts |
| **LLM Providers** | 5 | Claude (primary), GPT, Gemini, Mistral, Ollama |
| **Skills** | 20 domain skills | Reusable analytical techniques (Devil's Advocate, Systems Thinking, etc.) |
| **Personas** | 26 expert personas | Expert role definitions with calibrated experience profiles |
| **Output Formats** | 42 output format templates | From executive summaries to RACI matrices |
| **Export Formats** | 5 | Markdown, DOCX, XLSX, PDF, PPTX |
| **Database Tables** | 73 | Across 16 functional groups supporting knowledge persistence |
| **API Routes** | 71 | 542 HTTP endpoints across comprehensive backend services |
| **Pages** | 65 | Complete user workflows |
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
- ✅ **Expanded Expert Coverage** — 56 expert domains spanning professional services, enterprise operations, social impact, and personal use
- ✅ **Google Gemini + Sonnet 4.6** — 5 LLM providers and latest Claude model added
- ✅ **MCP Integration** — Model Context Protocol server and client for universal connectivity
- ✅ **Multi-language interface** — 30 languages shipped
- ✅ **Multi-Model Deliberation Protocol** — parallel Opus/Sonnet/Haiku analysis with synthesis
- ✅ **Hybrid semantic search** — BM25 + vector similarity with Reciprocal Rank Fusion
- ✅ **Command Palette** — ⌘K/Ctrl+K keyboard-driven access to all functions

### Architecture at a Glance

**Frontend:** React 18 + TypeScript, Tailwind CSS + shadcn/ui, 65 pages, dark theme

**Backend:** Node.js + Express, SQLite with WAL mode, 53 specialised services, streaming SSE

**AI Integration:** Anthropic Claude (Opus 4.6, Sonnet 4.6, Sonnet 4.5, Haiku 4.5), OpenAI GPT, Google Gemini 2.5, Mistral Large, Local Ollama, MCP

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

ANTON is released under the **Apache 2.0 License** — a permissive open-source license. You can use it commercially, modify it, distribute it, and build on it. The .anton format specification is additionally published under Creative Commons CC BY 4.0, so anyone can implement it in their own tools. Attribution appreciated but not required.

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
16. [Semantic Search & Embedding Architecture](#16-semantic-search--embedding-architecture)
17. [Cross-Workflow Intelligence (5-Layer Funnel)](#17-cross-workflow-intelligence-5-layer-funnel)
18. [Knowledge Graph & Entity Relationships](#18-knowledge-graph--entity-relationships)
19. [Pattern Detection Engine](#19-pattern-detection-engine)
20. [Institutional Memory Engine](#20-institutional-memory-engine)

### Part 5: Quality & Learning
21. [Quality Ratchet & Continuous Improvement](#21-quality-ratchet--continuous-improvement)
22. [Apprentice Model (4-Stage Learning)](#22-apprentice-model-4-stage-learning)
23. [Output Versioning & Diff Engine](#23-output-versioning--diff-engine)

### Part 6: Automation & Governance
24. [Time Intelligence & Regulatory Radar](#24-time-intelligence--regulatory-radar)
25. [Compliance-as-Code](#25-compliance-as-code)
26. [Workflow Automation & Scheduling](#26-workflow-automation--scheduling)
27. [Collaborative Canvas (Multi-Human Workflows)](#27-collaborative-canvas-multi-human-workflows)

### Part 7: AI-Led Software Development *(NEW in v3.0)*
28. [The Coding Area (4-Tier Architecture)](#28-the-coding-area-4-tier-architecture)
29. [AI Code Instruction Builder](#29-ai-code-instruction-builder)

### Part 8: External Data & Discovery *(NEW in v3.0)*
30. [External Data Integration Framework](#30-external-data-integration-framework)
31. [Discovery Mode](#31-discovery-mode)

### Part 9: The Expert Areas
32. [Expert Areas Overview (56 domains)](#32-expert-areas-overview)
33. [Flagship Area: Financial Crime Prevention](#33-flagship-area-financial-crime-prevention)
34. [Cross-Area Use Cases](#34-cross-area-use-cases)

### Part 10: Security, Privacy & Deployment
35. [Security Architecture](#35-security-architecture)
36. [Privacy & Data Safety](#36-privacy--data-safety)
37. [Deployment Models](#37-deployment-models)

### Part 11: Usage Guide
38. [Getting Started](#38-getting-started)
39. [Power User Guide](#39-power-user-guide)
40. [Enterprise Administration](#40-enterprise-administration)

### Part 12: Community & Future
41. [Building Custom Modules](#41-building-custom-modules)
42. [Contribution & Community](#42-contribution--community)
43. [Competitive Landscape](#43-competitive-landscape)
44. [Roadmap & Future Vision](#44-roadmap--future-vision)
45. [FAQ](#45-faq)

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

# openEXPERT Whitepaper — Foreword

## Foreword: The Promise We Keep Getting Wrong

Everyone in a leadership position has heard the pitch. AI will make your organisation leaner. You'll need fewer people. The business case is headcount reduction.

I've been in banking, financial crime prevention, and regulatory consulting for over fourteen years. I've sat in the rooms where those business cases are presented. And I have never — not once — seen that promise play out the way the slide deck said it would.

Not because the technology didn't work. It usually did. But because the assumption behind the business case was wrong.

The assumption is that organisations have just the right amount of work, and AI will let them do it with fewer hands. But that's not how it works. The truth is that every professional I've ever met has a backlog — not of busywork, but of things they genuinely want to do. Important things. Interesting things. Things that would make the organisation better, stronger, smarter. They just never get to them, because the day is already full.

Full of what? Full of the daily grind. Recurring checks. Assessments that need to be done. Reports that need to be written. Frameworks that need to be updated. Tasks that absolutely must happen, but that don't, by themselves, move anyone forward.

Think about a compliance assessment. There's some value in the snapshot — you learn where you stand. But be honest: the fact that you need to do an assessment at all means you didn't already know. The real value was never in the assessment itself. The real value comes after: in the plan, the roadmap, the implementation, the actual changes that make things better. That's where growth lives. That's where interesting work lives. And that's exactly what people rarely have time for, because they're still stuck doing the next assessment.

This is where AI changes the equation — but not in the way most people think.

AI is not here to replace your colleagues. It's here to become one. A coworker. Someone who helps you get through the necessary work faster, so you can spend more time on the work that actually matters.

And when you can do things faster together, something profound happens: you don't just save time, you change the rhythm entirely. A gap analysis that used to take two weeks and happened once a year can happen in a day. And when it can happen in a day, it can happen every quarter. Or every month. Suddenly you're not doing an annual check-up — you're running continuous diagnostics. You're not reacting to problems discovered twelve months too late. You're catching them in weeks, acting on them in days, and actually moving forward.

That changes everything. Not because you have fewer people. But because the same people are finally free to do what they've always wanted to: build things, improve things, explore ideas, create genuine value — for themselves, for their teams, and for their organisations.

And here's what gets really exciting: when you can move through that full cycle faster — research, plan, test, get feedback, adapt, improve — you don't just do things quicker. You learn quicker. Every loop through the cycle teaches you something. Every iteration sharpens your thinking, your structures, your capabilities. You investigate a problem, build a feasibility plan, test your thesis, gather peer feedback, run a beta, learn from what worked and what didn't, adapt, evolve — and then you close the loop and do it again. Better this time. Faster. With sharper questions and clearer direction.

This continuous improvement cycle applies to everything and everyone. A compliance team iterating on their risk framework. A product team running feasibility studies on new features. A researcher testing hypotheses. A consultant refining their methodology. When the cycle time drops from months to weeks or days, you don't just improve — you compound. Each cycle builds on the last. Each iteration carries forward what you learned. And suddenly, the things that felt impossible start to feel achievable.

That's when the real magic happens. The moonshots. The big bets. The once-in-a-lifetime opportunities that everyone talks about chasing but nobody has time for — because the daily grind, the operational overhead, the weight of everything else in our lives and our businesses, leaves no room for the audacious ideas. When AI helps carry the necessary work, it creates space not just for incremental improvement, but for the kind of bold, ambitious thinking that changes trajectories. The new product line. The market expansion. The research breakthrough. The thing you'd attempt if you only had the bandwidth.

But — and this is crucial — none of this happens without trust. And trust starts at the top.

It falls on management and senior leadership to enable and nurture this kind of thinking within their organisations. Not just to approve AI tools, but to genuinely believe in the capability of their people to use those tools wisely. To create a culture where experimentation is encouraged, where trying and learning is valued over playing it safe, where the goal of AI adoption is explicitly about empowering people rather than reducing them. Because without that trust — trust in the AI implementation, trust in how people will use it, trust in the process of learning and adapting — everything falls flat. The technology sits unused. The potential goes unrealised. And the old pattern continues: too much to do, not enough time, and the interesting work stays on the backlog forever.

The organisations that will thrive with AI are not the ones that use it to cut costs. They're the ones whose leaders say: "We're giving you a powerful coworker. Now go chase the things we never had time for."

There is something else I want to say here — something that rarely shows up in business cases or strategy decks, but that every person who has ever worked in a team understands instinctively.

There's a human energy in good teams that no data point captures. It's the warmth in a meeting where people actually listen. The friendliness that makes a client feel valued. The unspoken chemistry that turns a sales call from transactional to genuine. The care someone shows when a colleague is struggling. You can't measure it. You can't automate it. Most economic models don't even try to account for it. But when it's missing — and this is the telling part — everyone notices. The team feels flat. The meetings feel hollow. The client feels handled, not helped. The joy is gone, and you can feel its absence like a draft in a warm room.

This is what humans bring that AI never will. Not analysis. Not speed. Not pattern recognition. But presence. Energy. The invisible glue that holds teams together and makes work worth showing up for. AI can be a wonderful coworker — helpful, tireless, knowledgeable, even friendly. And it should be. We should welcome it. But some things are done better face to face, and some things are done better with a screen between us, and caring about both spaces — the digital and the physical, the online and the offline — is essential to building workplaces and societies where people actually want to be.

This leads to perhaps the boldest implication of the AI coworker — and one I believe we should talk about openly.

If AI can genuinely share the workload — if knowledge is always there when you need it, if the handoff between your work cycle and your colleague's is seamless, if the routine tasks that fill eight hours can be done well in four or six — then maybe, just maybe, we don't need to work as much as we think we do.

I know this sounds radical. There's a strong culture, particularly in certain industries, that equates long hours with commitment and productivity. The "996" mentality — nine in the morning to nine at night, six days a week — is still celebrated in some circles as the price of success. And to those people, it's genuinely hard to make the counter-argument. Not because they're wrong about the value of hard work, but because they're so convinced they're right that they won't consider any other way of working and living.

But the evidence says otherwise. When Sweden's Toyota plant in Gothenburg switched to six-hour days, they reported higher profits and happier staff. When the UK ran the world's largest four-day week trial with 61 companies and 2,900 employees, revenue stayed broadly the same, sick days dropped 65%, and 71% of employees reported lower burnout — 92% of companies chose to continue. Germany's 2024 trial of 45 companies found no significant difference in revenue or profit with reduced hours — which means the same output was produced in less time. The largest study to date — 141 organisations across six countries — found improved mental health, higher job satisfaction, and maintained productivity, with 90% retaining the policy afterwards. Even the Stanford economist John Pencavel showed that beyond a certain number of hours, work output doesn't just plateau — it starts to decline.

We don't live to work. We work to live. And if that's true — and I believe it is — then we should work as effectively as we can so we can live as fully as we can.

Those who argue that reducing work hours will hurt GDP or growth are, I believe, looking at the wrong side of the equation. When people have more time, they don't disappear from the economy. They vitalise it. They eat out more often. They travel. They attend concerts, visit museums, explore hobbies. They invest in their health, their education, their families. They spend money on experiences, services, and goods that create jobs and growth in other sectors. The economic activity doesn't shrink — it shifts into parts of the economy that have been starved of attention because everyone was too busy or too exhausted to participate.

And there's one more thing that might matter most of all: with fewer fires to fight and less constant overload, we finally have the capacity to teach. To mentor. To guide the next generation. Right now, apprentices, thesis students, and summer workers often arrive into organisations that are too stretched to properly onboard them, too harried to give them meaningful projects, and too overwhelmed to invest in their development. These young people need the chance to feel what it's like to work a real job, to be trusted with responsibility, to learn from experienced professionals who have time to explain not just what to do, but why. That investment in the next generation is something we talk about endlessly but rarely deliver — because we never have the bandwidth. AI coworkers can help create that bandwidth.

And there's a second dimension that matters enormously. It's not just large corporations that benefit. Think about the small business owner navigating regulations for the first time. The startup founder who needs a compliance framework but can't afford a consultant. The growing company that wants to do things right but is drowning in overhead just trying to keep up. When AI can help carry the weight of the "must-do" work, these companies can focus on what actually drives them — their core business, their customers, their growth. They can compete. They can innovate. They can thrive.

When more people can do more meaningful work — when the repetitive burden is shared with an AI coworker rather than consuming entire teams — we all benefit. Companies grow. Professionals develop. Small businesses find their footing. Young people get the mentorship they deserve. And sometimes, when the capacity is there and the trust is real, someone chases a moonshot and catches it.

That's the promise openEXPERT is built on. Not fewer people. More impact. Faster learning. Bolder ambitions. Better balance. And the trust to let people run with it.

*— Daniel Bardun, February 2026*

---

## PROLOGUE: OUR STORY

---

### Why We Built This

#### The View from Inside the System

For fourteen years, I worked at the heart of the financial system — at SEB, one of Scandinavia's largest banks; with Sveriges Riksbank, Sweden's central bank; at EY, advising global institutions; and at Advisense, helping Nordic banks fight financial crime. I saw first-hand how knowledge moves through organisations, and more importantly, how often it fails to move at all.

Every day, I watched brilliant professionals struggle not with the complexity of their work, but with the tools available to do it. A compliance officer who understood every nuance of anti-money laundering regulation would spend hours formatting a gap analysis because no tool existed to help structure the output properly. A project manager who could intuitively sense where risks were developing would spend days manually compiling status reports. A consultant who had delivered hundreds of engagements would start every new project from scratch because there was no way to capture and reuse the patterns they'd learned.

The waste was staggering — not just in hours, but in potential. These were people who could have been thinking strategically, identifying emerging risks, designing better controls, mentoring junior colleagues. Instead, they were wrestling with formatting, context-setting, and repetitive analysis. And this wasn't a technology problem in the traditional sense. They had tools. They had systems. What they didn't have was a way to turn their expertise into a repeatable, shareable, scalable capability.

And then AI arrived.

#### The Promise and the Gap

When large language models like Claude emerged, they promised to change everything. And in a way, they were right. For the first time, you could sit down and have a conversation with a system that had read virtually everything ever published, could reason across domains, and could produce well-structured written output in seconds.

But from my position inside regulated industries, I could see something that the technology enthusiasts were missing. There was a gap — not in the AI's intelligence, but in its experience.

Think of it this way: imagine you've just hired the smartest graduate student who ever walked through your door. They've read every textbook, every regulation, every industry report. They can analyse, synthesise, and write at extraordinary speed. But they've never actually worked in your industry. They don't know how a gap analysis is really structured — not the textbook version, but the version that a regulator actually expects when they walk through your door. They don't know what "good" looks like when a compliance officer reviews a policy document. They don't know that a project status report needs to land differently depending on whether it's going to a steering committee or a project sponsor.

That gap is real, and it's the reason that most AI interactions today produce output that is impressive but not quite right. It's the reason that professionals spend almost as much time editing AI output as they would have spent writing it themselves. It's the reason that many organisations have adopted AI with excitement and then quietly reduced their use because the results weren't meeting professional standards.

I realised that what AI needed wasn't more intelligence — it needed professional training.

#### Building ANTON

In 2025, I began building ANTON. The name stands for something simple: this is your AI colleague. Not a chatbot. Not an assistant. A colleague with proper professional training who earns trust through the quality and transparency of its work.

The core insight was simple but, I believe, profound: **what if we gave AI the same kind of professional development that every talented graduate receives when they enter the real world?**

When a new analyst joins a bank, they don't start by writing policy documents. They're trained. They learn frameworks. They study examples of what good looks like. They work under supervision, receiving feedback that gradually builds their competence. They learn not just *what* to do, but *how* to do it — the practical knowledge that separates textbook understanding from professional expertise.

ANTON does exactly this for AI. We've defined 485 different professional tasks across 56 domains, and for each one, we've captured the practical expertise that makes the difference between a generic AI response and a genuinely professional output. We've defined what should be done, what good looks like, who the relevant experts are, how experienced professionals structure their thinking, and what pitfalls to avoid.

But as I built the platform, it kept growing beyond the original vision. What started as better prompts for financial crime professionals became something much larger. The modules grew to cover legal advisory, project management, healthcare, education, cybersecurity, sustainability — 56 domains and counting. The architecture evolved to include institutional memory, so the system learns from every interaction. A quality engine that scores and improves output over time. Workflow automation that chains complex multi-step processes.

And then, in v3.0, capabilities I hadn't originally imagined: a Coding Area where ANTON acts as a senior architect guiding software development with proper governance. A Discovery Mode that helps organisations find where AI creates the most value before they invest in it. Direct database connectivity that eliminates the spreadsheet bottleneck plaguing most AI tools. Integration with external tools and data sources through the Model Context Protocol. Support for five different AI providers, including fully local models that keep everything on your machine.

Each addition followed the same principle: **don't just add AI capability — add it with the professional training, governance, and transparency that makes it trustworthy in real-world professional environments.**

That principle is what makes ANTON different, and it's what this document is about.

#### From ANTON to openEXPERT

As ANTON grew, it became clear that the underlying philosophy — capturing domain expertise, structuring it for AI, and making it accessible with proper governance — was bigger than any single tool. The frameworks, the architecture patterns, the approach to trust and transparency — these apply whether you're building an AI expert for financial crime, for medical diagnostics, or for agricultural planning.

That's why ANTON is part of the **openEXPERT** foundation. openEXPERT is the broader vision: a family of AI-powered professional tools that share the same philosophy about how domain expertise should be captured, structured, and made accessible. ANTON is the flagship — the platform you're reading about in this document. ALMA and ALEXANDER are siblings in the same family, each applying the openEXPERT principles to different contexts.

What unites them is a belief that AI capabilities should be open, expert-trained, transparent, and governed. What makes ANTON specific is its implementation: 485 modules, 56 domains, 73 database tables, enterprise security, and the complete architecture described in this whitepaper.

#### Why Open Source?

People ask me this a lot, especially people in business. "You've built something valuable — why give it away?"

The answer comes from watching what happens when capability is locked behind price walls. I've spent my career in financial services, where a small firm pays the same regulatory fines as a large one but has a fraction of the compliance resources. Where a startup in Lagos faces the same AML obligations as a bank in London but can't afford the consulting fees to understand them. Where a student writing a thesis uses the same tools as a Fortune 500 analyst, but doesn't have access to the frameworks that make the analysis professional.

ANTON is MIT-licensed because I believe this capability should power-charge every sector and enable more people to do valuable work regardless of their budget, location, or connections. When a compliance officer in Nairobi can run the same quality gap analysis as a partner at a Big Four firm in London, something genuinely important has happened. Not charity — capability.

The economics work because ANTON is infrastructure, not a service. The software is free. You bring your own AI provider (Claude, GPT, Gemini, Mistral, or completely free local models through Ollama). The value compounds through community contributions — every module someone shares makes the platform better for everyone.

Give it away, hold nothing back, and let the work speak.

---

---

## PART 1: VISION & PHILOSOPHY

*The following chapters explain the thinking behind ANTON — not the technical specifications (those come later), but the principles, values, and beliefs that drove every design decision. If you want to understand why ANTON works the way it does, start here. If you want to jump straight to the technical details, skip to Part 2.*

---

## 1. The Problem We're Solving

### Beyond the Hype

Everyone talks about AI changing work. Conferences are full of presentations about transformation. Consultancies publish reports about productivity gains. Technology vendors promise revolution. And there is real substance behind the excitement — AI genuinely is one of the most important technological developments in decades.

But between the promise and the reality, there's a gap. Actually, there are ten gaps, and until all ten are closed, AI will remain a brilliant tool that most people and organisations can't fully use.

---

### The Ten Gaps

**Gap 1: Knowledge**

Most people don't know how to use AI effectively. They've heard about prompting, maybe experimented with ChatGPT, but they don't know how to structure a request to get professional-quality output. And why should they? They're compliance officers, project managers, lawyers, consultants — not AI engineers. The expectation that every professional should become an expert prompt engineer to benefit from AI is unreasonable and, frankly, a failure of imagination on the part of the technology community.

openEXPERT closes this gap by removing the need for prompt expertise entirely. You choose a module — "AML Gap Analysis" or "Project Status Report" or "Legal Contract Review" — and the platform handles all the prompt engineering behind the scenes. A seven-layer system assembles domain context, task methodology, expert personas, analytical skills, knowledge sources, and quality controls automatically. You don't need to know what a system prompt is. You just need to know what you want to accomplish.

---

**Gap 2: Time**

Even people who are skilled at using AI spend enormous amounts of time providing context. Every new conversation requires explaining your industry, your organisation, your regulatory framework, your quality expectations. This context-setting can take longer than the actual work you're asking AI to do.

openEXPERT closes this gap through persistent knowledge systems. Your documents, your previous decisions, your organisational patterns — they're all captured and reused automatically. The second time you run a gap analysis, the platform already knows your regulatory jurisdiction, your preferred output format, and the quality standards your organisation requires. The tenth time, it can suggest approaches based on patterns it's detected across your previous work.

---

**Gap 3: Training**

This is the gap I saw most clearly from inside the financial system. AI models have read everything — but they've never done anything. They lack the practical, experiential knowledge that separates a textbook answer from a professional deliverable. They don't know how regulators actually think, what partners at consulting firms actually expect, how a board member actually reads a risk report.

openEXPERT closes this gap by giving AI proper professional training. Each of our 485 modules embeds the kind of expertise that takes years to develop: the frameworks, the judgment calls, the awareness of what "good" looks like in practice. We didn't just teach AI what a gap analysis is — we taught it how a gap analysis is actually done by someone with fifteen years of regulatory experience.

---

**Gap 4: Trust**

How do you know if AI output is actually good? In a casual conversation, that question doesn't matter much. But when the output is a regulatory submission, a client deliverable, a compliance assessment, or a risk analysis that will inform a board decision — the question becomes critical. And most AI tools have no answer beyond "trust us."

openEXPERT closes this gap with multiple trust mechanisms. A Quality Ratchet scores every output across six dimensions (completeness, accuracy, structure, actionability, citations, overall). Compliance-as-Code rules check outputs against regulatory requirements automatically. Review workflows enable human oversight before anything is finalised. Institutional memory captures your team's decisions over time, building a knowledge base that makes each subsequent output more aligned with your standards. And three transparency levels let you see exactly how the AI reached its conclusions — from clean output only, through visible reasoning, to a complete deep trace with confidence levels and source citations.

---

**Gap 5: Safety**

Where does my data go? Who can see it? Can I use this for confidential client work? These are not edge-case concerns — they are the first questions that any serious professional or organisation asks, and they are deal-breakers if the answers aren't right.

openEXPERT closes this gap with a local-first architecture. The application runs on your machine. The database is a local file. Your documents stay in your filesystem. Only the specific text you send to an AI model leaves your environment — and even that can be eliminated entirely by using local Ollama models in an air-gapped deployment where nothing leaves your network. Not the prompts, not the outputs, not the metadata. Nothing.

---

**Gap 6: Governance**

Individual AI use is one thing. Organisational AI use is another entirely. When fifty people across a company are using AI daily for client deliverables and regulatory submissions — you need audit trails, access controls, budget management, compliance rules, and quality standards that are enforced consistently. You need to know who ran what, when, with which model, at what cost, and whether the output met your standards.

openEXPERT closes this gap with enterprise governance built into the foundation. Role-based access control determines who can use which modules. Audit logs capture every API call and decision. Budget controls prevent runaway costs. Compliance-as-Code rules run automatically on every session. Review workflows enforce human oversight. Workflow automation chains complex multi-step processes with scheduling and SLA tracking. And collaborative workflows enable multiple humans to review, contribute to, and approve outputs before they leave the organisation.

---

**Gap 7: Repeatability**

In professional work, consistency isn't a nice-to-have — it's a requirement. When your colleague runs the same type of analysis you did last quarter, the client expects comparable rigour. When a regulator reviews two assessments produced by your team, they expect a consistent methodology. When an auditor checks your work, they expect a defined, documented process that produces predictable results.

Standard chat AI offers none of this. Ask the same question twice and you get different answers. Change a few words in your prompt and the output shifts dramatically. There's no defined methodology anchoring the response, no quality baseline ensuring consistency, no structured process you can point to and say: "this is how we do it." Every session is a fresh improvisation — brilliant sometimes, mediocre other times, and never quite the same twice. For any organisation that needs defensible, auditable, reproducible work, this is a fundamental problem, not a minor inconvenience.

openEXPERT closes this gap through its structured seven-layer prompt architecture. Every time a module runs, it assembles the same foundational layers: the same system principles, the same domain context, the same task methodology, the same expert perspective, the same quality criteria. The user's specific input varies — their documents, their questions, their data — but the professional framework surrounding that input remains constant. This is exactly how repeatability works in professional services: two auditors at the same firm follow the same methodology and apply the same standards, so their findings differ based on subject matter, not on random variation in approach. The Quality Ratchet establishes baselines that persist. Output versioning captures every iteration. The process is transparent, traceable, and — critically — reproducible. You can show a client, a regulator, or an internal governance committee exactly how a deliverable was produced, and they can be confident that the same process will produce comparable results next time.

---

**Gap 8: Shareability**

When someone in your team figures out how to get exceptional results from AI — the perfect setup for a regulatory gap analysis, a brilliant workflow for policy drafting, a finely tuned configuration for client reporting — that knowledge is trapped. Sharing it means copying and pasting long prompts, writing paragraphs of instructions about which settings to use, and hoping the recipient can somehow reverse-engineer the magic. It's like trying to share a recipe by describing the taste instead of listing the ingredients.

In practice, most AI excellence stays locked inside individual conversations and is never replicated. The organisation invests time and expertise in one person's breakthrough, but that investment doesn't compound. Multiply this across every team, every office, every engagement — and you start to see the scale of knowledge that's being wasted every day.

openEXPERT closes this gap with the `.anton` file format — an open interchange standard for professional AI configurations. A `.anton` file is a self-contained package (technically a ZIP archive, like `.docx`) that captures everything needed to reproduce a specific AI capability: the module configuration, attached skills and frameworks, persona settings, thinking level calibration, output format preferences, and quality criteria. Everything except your data.

The workflow is simple. A user who has built a high-performing setup exports it as a `.anton` file. They share it — with a colleague, a team, or the open-source community. The recipient imports it into their own openEXPERT instance and immediately has the exact same professional capability: same expert perspective, same methodology, same quality standards. They add their own data and they're working. No reverse-engineering, no guesswork, no "can you send me that prompt you used?"

This changes the economics of AI expertise entirely. A new team member imports the department's proven configurations on day one and produces quality work immediately. A consulting firm creates `.anton` files for every engagement type, ensuring consistent methodology across partners and offices. A financial crime expert in Stockholm publishes a sanctions screening module, and a compliance officer in Nairobi benefits from it the same afternoon. When someone improves a configuration, they re-export it and the entire team levels up simultaneously.

This is fundamentally different from sharing prompts. A prompt is a string of text. A `.anton` file is a complete professional environment — the equivalent of handing someone a fully equipped workstation instead of a sticky note with some tips.

---

**Gap 9: Flexibility**

Vendor lock-in to a single AI provider is a strategic risk. If your entire workflow depends on one model from one company, you're exposed to their pricing decisions, their uptime, their content policies, and their corporate strategy. When a better model emerges for a specific task — and in AI, this happens constantly — you can't use it without rebuilding everything from scratch.

This risk isn't theoretical. Models are deprecated with months of notice. Pricing changes overnight. Rate limits shift without warning. Service outages affect entire continents. And the competitive landscape is moving so fast that today's leading model may not be the best choice for your specific task six months from now.

openEXPERT closes this gap with a provider-agnostic architecture. The same seven-layer prompt system works across Anthropic Claude, OpenAI GPT, Mistral, Google Gemini, and local Ollama models. Switch providers per session, per module, or per task — based on cost, capability, availability, or data sensitivity requirements. Your modules, your skills, your workflows, your institutional knowledge — they all work regardless of which model processes the request. You invest in your expertise, not in a vendor relationship.

---

**Gap 10: Accessibility**

AI should be a great equaliser. In theory, it gives everyone access to analytical capabilities that were previously reserved for well-funded organisations with large professional teams. In practice, it's becoming a new dividing line. Those with prompt engineering skills, expensive subscriptions, and technical fluency get extraordinary results. Everyone else gets mediocre answers to poorly formed questions and concludes that AI "isn't really useful for what I do."

This is both a waste and an injustice. A student researching their thesis deserves the same analytical frameworks as a Fortune 500 compliance officer. A plumber building their business deserves the same structured guidance as a Big 4 consultant. A community health worker in rural Kenya deserves the same access to clinical guidelines as a specialist at a teaching hospital. The gap between who *can* use AI effectively and who *should* be able to is widening, not closing.

openEXPERT closes this gap by design. The platform is open source and MIT-licensed — every module, every expert persona, every skill, every workflow is free. There are no premium tiers, no feature gates, no artificial limitations. You bring your own API key (with costs as low as $0.02 per query, and entirely free with local models), and you get the same capabilities as everyone else.

But accessibility isn't just about price. It's about usability. The seven-layer prompt architecture is powerful precisely because the user never needs to understand it. A compliance officer who has never heard of "prompt engineering" gets the same analytical depth as someone who has spent years mastering AI interactions. For tradespeople and service workers, the "My Way of Working" capability goes further — a plumber can upload examples of their own invoices and quotes, and the system learns to match their specific business style. They don't adapt to the technology; the technology adapts to them.

And the roadmap extends access further still. Planned delivery channels include WhatsApp, voice, and SMS — meeting people where they are, not where Silicon Valley assumes they should be. A smallholder farmer checking crop guidance via text message. A micro-business owner getting tax advice through WhatsApp. Professional AI capability delivered through the devices people already have, in the languages they already speak. When this is combined with shareability — domain experts worldwide publishing `.anton` files that anyone can import — accessibility creates a compounding effect where every contribution makes the platform more valuable for everyone.

---

### Why All Ten Matter

It would have been easier to solve one or two of these gaps and call it a product. Better prompts alone would have been useful. Local deployment alone would have been valuable. But our experience inside regulated industries taught us that partial solutions create their own problems.

A platform with excellent prompts but no governance becomes a compliance risk. A platform with strong security but poor quality controls produces private but unreliable output. A platform with good quality tools but no time savings doesn't get adopted because it's too slow. A platform that trains AI well but can't connect to your data still forces you to copy-paste from spreadsheets. A platform that produces brilliant work but can't reproduce it consistently is a liability in any professional setting. A platform where knowledge can't flow between people wastes the most valuable thing an organisation has — what its best people have already figured out. And a platform that only works for the technically fluent and financially comfortable fails the people who need it most.

openEXPERT was designed to close all ten gaps simultaneously because that's what individuals and organisations actually need to adopt AI with confidence — and because we believe the benefits of this technology should reach everyone, not just those who already have the most.

---

## 2. Our Philosophy: AI as a Coworker, Not a Magic Box

### How You Treat Your AI Matters

There's a revealing pattern in how people and organisations interact with AI, and it tells you more about their AI maturity than any technology assessment could. We've observed three distinct stages, and they mirror how humans build any professional working relationship.

**Stage 1: "The Overworked Intern"**

In this stage, people treat AI like an overworked intern. They throw tasks at it without context, without structure, without clear expectations. "Write me a report." "Analyse this document." "Give me a policy." The results are predictably mediocre — not because the AI lacks capability, but because it hasn't been given the foundation to do good work. And then people blame the AI: "See? AI isn't ready for professional work."

But imagine doing the same thing to a human colleague. Imagine hiring a brilliant analyst and on their first day saying: "Write me a gap analysis" — with no context about which regulation, which client, which methodology, what format, or what good looks like. You wouldn't blame the analyst for producing generic work. You'd recognise that you failed to set them up for success.

This is where most organisations are today with AI. They're getting mediocre results not because AI is mediocre, but because they're treating it like an overworked intern rather than a capable professional who needs the right setup.

**Stage 2: "Do What I Mean, Not What I Say"**

In this stage, people have higher expectations but still provide inadequate context. They've seen impressive AI demos and expect the same results without understanding what made those demos work. They know AI *can* produce excellent output — they've seen the case studies, the LinkedIn posts, the conference presentations — but their own results don't match.

The frustration is genuine but misdirected. It's not that AI can't do professional work. It's that professional work requires professional setup. Those impressive demos were powered by carefully crafted prompts with extensive context, specific personas, detailed instructions, and domain expertise baked in. The person at the keyboard just typed "analyse this" — but behind the scenes, someone had spent hours building the prompt architecture that made the magic possible.

This stage often leads to AI disillusionment. Organisations invest in AI access, run a few pilots, get underwhelming results, and conclude that AI "isn't ready" for their industry. The technology gets shelved. The subscription gets cancelled. And the potential goes unrealised — not because of a technology failure, but because of a setup failure.

**Stage 3: "Exploring and Growing Together"**

This is where real value creation begins. In this stage, people treat AI as a capable coworker — providing context, setting expectations, reviewing output, giving feedback, and building a working relationship over time. They understand that AI brings complementary strengths (speed, breadth, consistency, tirelessness) to a partnership where humans bring judgment, experience, creativity, and accountability.

Stage 3 users don't just ask AI to write a gap analysis. They specify the regulation, the jurisdiction, the client context, the methodology they prefer, the format the output should take, the audience who will read it, and the quality standards it must meet. They review the output critically, provide feedback, and use that feedback to improve the next interaction.

The results are dramatically different. Not incrementally better — dramatically better. And over time, as the working relationship deepens and both parties learn from each interaction, the quality compounds. What takes an hour in Month 1 takes fifteen minutes in Month 6, with better output.

### ANTON Is Designed for Stage 3

Here's the key insight that drove ANTON's design: **Stage 3 is where the value is, but most people can't get there on their own.**

The jump from Stage 1 to Stage 3 requires prompt engineering skills, domain knowledge about what good AI setup looks like, time to build the context and personas and instructions, and patience to iterate and refine. Most professionals don't have any of these — and they shouldn't need them. They have their own expertise, and their time is better spent using that expertise than learning how to configure AI.

ANTON eliminates the barrier to Stage 3. Every module is a pre-built Stage 3 relationship. When you select "AML Gap Analysis," you're not just choosing a topic — you're activating a seven-layer prompt system that provides domain context, task methodology, expert persona, analytical skills, knowledge sources, quality controls, and transparency settings. All the work of getting to Stage 3 has already been done. You start there.

But ANTON goes further than just providing good prompts. The platform is designed to make the Stage 3 relationship *deepen* over time, in ways that even a skilled prompt engineer can't easily replicate:

The **transparency levels** let you see how ANTON thinks, just as you'd want to understand how a colleague reached their conclusions. You can verify the approach, challenge assumptions, and redirect thinking — the natural dynamics of a professional working relationship.

The **Quality Ratchet** provides the feedback mechanism that helps the relationship improve over time. Quality isn't static — it's measured, tracked, and managed. You can see whether outputs are getting better, and the system uses quality signals to adjust its approach.

The **institutional memory** captures what you've decided and learned together, so you don't start from scratch every time. Approved methodologies, rejected approaches, preferred formats, quality thresholds — they persist across sessions and compound over months.

The **Apprentice Model** tracks competence development through four stages. A module that consistently produces quality output in your context gradually earns more autonomy — just as you'd trust a colleague with a track record differently than a new hire.

### The Right Human-AI Relationship

We believe the right relationship between humans and AI has clear characteristics, and every design decision in ANTON is tested against them:

**AI should be a force multiplier, not a replacement.** The goal is not to eliminate human professionals — it's to make them dramatically more effective. A compliance officer using ANTON doesn't become redundant. They become a compliance officer who can do in an afternoon what used to take a week, freeing their expertise for the judgment calls, strategic thinking, and relationship management that only humans can provide. The mundane parts of professional work — the formatting, the boilerplate, the repetitive analysis — are precisely what AI handles well. The strategic parts — the interpretation, the prioritisation, the recommendation — are precisely what humans handle well. ANTON is designed to make this division of labour natural and productive.

**Humans must remain in control of every important decision.** AI can analyse, suggest, draft, and flag — but the human signs off. This is not a limitation; it's a design principle. In regulated industries especially, human accountability is non-negotiable, and it should be. ANTON is built so that at every stage, the human is clearly in charge and the AI is clearly an advisor. Review workflows, approval gates, milestone sign-offs in the Coding Area, stakeholder review in Discovery Mode — these aren't bureaucratic overhead. They're the mechanisms that keep humans in control while letting AI do what it does best.

**The relationship should improve over time.** Just as a human working relationship deepens with experience, the AI-human partnership in ANTON becomes more valuable the longer you use it. The Apprentice Model tracks competence development across four stages. The institutional memory captures your decisions. The Quality Ratchet measures improvement. The knowledge graph builds connections across your work. After six months, the system understands your regulatory landscape, your quality expectations, and your working patterns in ways that make every subsequent interaction faster and better. After a year, it's an institutional asset. After two years, it contains knowledge that would otherwise walk out the door when experienced team members move on.

**Trust should be earned through process, not promised in marketing.** This is perhaps our most important philosophical commitment, and it applies to everything we build — including, in v3.0, software development itself. When we built the Coding Area, we could have followed the same pattern as every other AI coding tool: describe what you want, get code back fast, iterate if something is wrong. Instead, we designed a system where ANTON acts as a senior architect who does structured discovery, creates detailed specifications, conducts expert panel reviews at every milestone, and maintains governance checkpoints throughout. The result is that trust isn't based on "the output looks good" — it's based on "the process was rigorous, transparent, and reviewable."

Process-based trust is more durable, more auditable, and more appropriate for professional and regulated contexts than output-based trust. It's the core of how the openEXPERT philosophy approaches AI — and it's why organisations in banking, healthcare, legal, and other regulated sectors can adopt ANTON with confidence.

### What This Means in Practice

The coworker philosophy isn't abstract. It shows up in concrete design decisions throughout the platform:

**You talk to ANTON, you don't command it.** The interaction model is conversational, not transactional. You can refine, redirect, ask for clarification, challenge an approach — the same dynamics you'd have with a thoughtful colleague.

**ANTON tells you when it's uncertain.** Modules are designed to flag uncertainties, state assumptions explicitly, and distinguish between high-confidence conclusions and areas that need human verification. A good colleague doesn't pretend to know things they don't — and neither should AI.

**ANTON explains its reasoning.** Through the three transparency levels, you can always understand *how* ANTON reached its conclusions. Not just what it concluded, but why — the sources, the logic, the trade-offs. This is essential for professional work where you need to defend your analysis.

**ANTON remembers what you've decided.** The institutional memory system means that when you make a decision — "we use this methodology for BWRA," "our quality threshold for client deliverables is 85/100," "we always include regulatory citations" — that decision persists. You don't repeat yourself.

**ANTON gets better at working with you specifically.** The Apprentice Model and Quality Ratchet create a personalised learning loop. ANTON's output quality isn't static — it improves as the system learns your standards, your preferences, and your context.

This is what we mean by AI as a coworker. Not a tool you use. Not a service you consume. A working partner that brings genuine value to a relationship where both parties contribute their strengths.

---

## 3. Transparency: Seeing How AI Thinks

### Why Transparency Is Non-Negotiable

In casual AI use, it doesn't matter much how the AI reached its answer. You asked for restaurant recommendations, you got some, they look reasonable, done. But in professional work — especially regulated work — the "how" matters as much as the "what."

A compliance officer can't submit a gap analysis to a regulator and say "AI wrote it" without being able to explain the reasoning. A consultant can't hand a client a risk assessment without understanding the methodology that produced it. A lawyer can't rely on a legal analysis without seeing the sources and reasoning chain. A board member can't accept a risk report without understanding the assumptions behind it.

And it's not just about external accountability. Internal trust depends on transparency too. If a senior partner can't understand how ANTON reached a conclusion, they won't trust the conclusion — regardless of how good it actually is. If a compliance team can't trace how a policy recommendation was derived, they can't sign off on it. If a project sponsor can't see the logic behind a risk assessment, they won't act on it.

Transparency isn't a nice-to-have. In professional contexts, it's a requirement. And in ANTON, it's a foundational design principle — not an optional feature you can toggle on when regulators come knocking.

### Three Levels of Transparency

ANTON implements transparency through a three-level system that lets you choose how much visibility you need for each task. This matters because transparency has a cost — deeper visibility means more tokens, more processing time, and more information to review. The right level depends on the stakes, the audience, and the purpose.

**Level 0: Output Only**

Clean, final output with no visible reasoning. Best for routine tasks where you trust the module and just need the deliverable. Fastest and cheapest, because no extended thinking tokens are generated.

*When to use it:* Internal working drafts, routine analyses you've done many times, exploratory sessions where you're testing ideas. Essentially, any time you'd trust a colleague's work product without needing to see their notes.

**Level 1: Show Thinking**

The AI's reasoning process is visible alongside the output. You can see how it approached the problem, what key decisions it made, what assumptions it relied on. The thinking appears in collapsible panels in the interface — present when you want to verify, hidden when you just want the output.

*When to use it:* Important work where you want to verify the approach without reading every detail. Client deliverables that need review. Analysis where the methodology matters as much as the conclusion. Any work that might be questioned — you'll want to be able to point to the reasoning.

**Level 2: Deep Trace**

Complete thinking log with source citations, confidence levels for each conclusion, and explicit flagging of uncertainties. This level makes AI's reasoning as transparent as a human expert's written methodology — every step documented, every source referenced, every uncertainty acknowledged.

*When to use it:* Regulatory submissions where you need to demonstrate methodology. High-stakes decisions where the reasoning chain must be auditable. Any output that might be challenged in a formal context — by regulators, by legal counsel, by audit committees, by courts. Also valuable for learning — Level 2 traces show you how expert analysis is structured, which is itself a training resource.

### Transparency in Practice

The three-level system means that different users in the same organisation can choose appropriate transparency for their context. A junior analyst might always use Level 2 while they're learning — not just for quality assurance, but because the reasoning traces are excellent training material showing how expert analysis actually works. A senior partner might use Level 0 for routine work and Level 2 for board presentations. A compliance officer might use Level 1 for internal work and Level 2 for anything touching a regulatory submission.

The transparency data is captured in the database, so it's available for audit purposes regardless of the level chosen during the session. If you ran a session at Level 0 and later need to demonstrate the reasoning, the underlying data is there. And it's exportable — you can include the reasoning trace in a Word document, an Excel file, or a PDF delivered to a client or regulator.

### Transparency Across the Platform

A critical design decision was to make transparency a platform-wide principle, not something limited to the analysis modules. This means transparency works consistently across every capability ANTON offers:

**In the Coding Area:** When ANTON generates a software specification, you can see exactly how it reasoned through the security requirements, why it flagged certain compliance obligations, and what assumptions it made about the technology stack. When it conducts a code review, the reasoning behind each finding — security vulnerability, performance concern, maintainability issue — is visible and explainable. Non-technical stakeholders can read the Tier 1 plain-language explanations and understand what the code does and why the review flagged specific concerns.

**In Discovery Mode:** When ANTON produces an AI Opportunity Report, you can trace how each priority was scored and why certain areas were ranked higher than others. The scoring methodology is transparent — not a black box that says "this area scored 8.5/10" but a documented assessment showing the factors, weights, and data that produced that score.

**In External Data Integration:** When ANTON analyses data from a connected database, the queries it ran, the transformations it applied, and the reasoning behind its analysis are all traceable. This matters enormously in regulated contexts where you need to demonstrate that your analysis was based on actual data, correctly queried, and properly interpreted.

**In Workflow Automation:** When a multi-step workflow produces a final deliverable, each step's reasoning is individually traceable. You can see how the output of Step 3 informed the approach in Step 7, how a quality check in Step 5 triggered a revision loop, and how the final output integrates contributions from multiple steps.

### The Transparency Philosophy

Transparency in ANTON serves three purposes, and understanding all three helps explain why we've invested so heavily in it:

**Accountability:** The ability to explain and defend AI-assisted work to regulators, clients, auditors, and courts. This is the most obvious purpose and the one most people think of first.

**Trust-building:** The ability for users to verify ANTON's reasoning and build confidence in its approach over time. This is how the Stage 3 working relationship (Chapter 2) actually develops — through repeated observation of sound reasoning, not through blind faith.

**Learning:** The ability for less experienced users to learn professional analytical techniques by observing how expert analysis is structured. When a junior compliance officer sees a Level 2 trace of how ANTON structures a gap analysis — the regulatory framework it references, the methodology it applies, the prioritisation logic it uses — they're learning how experienced compliance professionals think. This is an underappreciated benefit: ANTON doesn't just produce expert output, it *teaches* expert methodology.

---

## 4. Trust: Building a Working Relationship with AI

### The Trust Problem

The fundamental challenge with AI in professional work isn't capability — it's trust. And trust, in professional contexts, has two dimensions that most AI tools conflate but that are actually quite different.

**Output trust** is the question: "Is this particular output correct and reliable?" Most AI tools address this (partially) with techniques like citations, confidence scores, and the general quality of their responses. Output trust is important, but it's inherently fragile — one bad output, one hallucinated citation, one missed regulatory requirement, and it's damaged. And it's impossible to verify at scale: no organisation can manually fact-check every AI output.

**Process trust** is the deeper question: "Can I rely on the *system* that produced this to consistently produce reliable outputs?" This is what organisations actually need for sustainable AI adoption, and almost no AI tool addresses it. Process trust doesn't depend on any individual output being perfect. It depends on the process being rigorous enough that the probability of error is low, the impact of error is contained, and errors that do occur are caught and corrected.

Think about how trust works in traditional professional services. When a board relies on an audit report from a Big Four firm, they're not personally verifying every finding. They're trusting the *process* — the audit methodology, the quality review procedures, the partner sign-off, the firm's reputation and accountability. Process trust is what makes professional work scalable.

ANTON is designed to build both kinds of trust, with particular emphasis on process trust because that's what enables organisational adoption and sustainable use.

### How Trust Builds in ANTON

ANTON doesn't ask you to trust it. It gives you the mechanisms to verify, measure, and manage trust across every dimension that matters for professional work.

**Quality Ratchet**

Every output is scored across six dimensions — completeness, accuracy, structure, actionability, citations, and overall composite. These aren't subjective impressions; they're structured assessments applied consistently across every session.

But the Quality Ratchet is more than measurement. It's *management*. Scores are tracked over time, so you can see trends — is output quality improving, stable, or declining? You can set minimum thresholds — if a score drops below 80/100 on any dimension, the system alerts you before the output is delivered. You can compare quality across modules, across users, across time periods. And you can use quality data to make informed decisions about which modules are ready for lighter oversight and which need closer review.

Over months, the Quality Ratchet creates an evidence base for trust. Not "ANTON seems to produce good work" but "ANTON's average quality score for AML gap analyses is 91/100 over the last 47 sessions, with zero scores below 82, and an improving trend of +2.3 points per quarter." That's the kind of evidence that satisfies a compliance committee.

**Compliance-as-Code**

Regulatory and organisational rules are encoded and checked automatically against every output. Citation requirements, token limits, model restrictions, format standards, required sections, prohibited content — these are enforced consistently, not left to human memory or individual judgment.

The platform ships with eight seeded rules, but the system is extensible. An organisation can encode its own standards: "All client deliverables must include regulatory citations." "No output may use GPT-3.5 for compliance work." "All banking area outputs must reference the applicable EBA guideline." Once encoded, these rules are enforced everywhere, by everyone, every time. A new team member using ANTON for the first time is held to exactly the same standards as a twenty-year veteran.

When a rule is violated, the system flags it before the output reaches the user. This is preventive governance, not detective governance — the error is caught before it causes harm.

**Review Workflows**

Before any output becomes a deliverable, it can pass through structured review. Human reviewers can approve, request changes, or reject. Review comments are captured and linked to specific sections. Revision history is maintained — you can see what changed between versions and why.

This creates the kind of four-eyes principle that regulated industries require. The first pair of eyes is ANTON's quality system. The second pair is the human reviewer. The audit trail proves that both reviews happened, what they found, and what decisions were made.

Review workflows can be configured to match organisational requirements. A boutique firm might have a single partner review. A bank might require compliance officer sign-off for anything touching regulatory obligations. An enterprise might have a multi-stage review with different reviewers for technical accuracy, regulatory compliance, and client appropriateness. ANTON's workflow system supports all of these patterns.

**Institutional Memory**

Every decision your team makes — approved outputs, rejected approaches, quality feedback, methodological preferences — is captured and used to improve future outputs. Over time, the system develops an understanding of your specific quality standards, risk appetite, and methodological preferences.

This is more than a preference store. Institutional memory captures *judgment* — the kind of knowledge that typically lives only in the heads of experienced professionals and walks out the door when they leave. When a senior compliance officer reviews a gap analysis and says "we always prioritise data quality issues over process issues for this client type," that judgment is captured and applied to future analyses. When a partner consistently requests a specific structure for board presentations, that pattern is learned.

The result is that ANTON's outputs become more aligned with your organisation's standards over time, not because the AI model improved, but because the institutional context deepened.

**The Apprentice Model**

The platform tracks its own competence development through four stages — Novice, Supervised, Proficient, and Expert — specific to each module and each user's context. This isn't a self-assessment; it's based on measured quality scores, human feedback signals, and consistency of performance over time.

A module at the Novice stage gets the most oversight — mandatory review, lower autonomy, more conservative defaults. As it demonstrates consistent quality in your specific context (not in general, but with your data, your standards, your reviewers), it progresses through stages. At Proficient, review might shift from mandatory to recommended. At Expert, the module has earned enough trust that light-touch oversight is appropriate — though never zero oversight, because the human remains accountable.

This mirrors how you'd gradually give a talented team member more responsibility as they prove themselves. You don't give a new hire the same autonomy as a ten-year veteran on their first day. But you also don't keep a proven performer on a short leash forever. The Apprentice Model formalises this natural trust-building process with data rather than gut feel.

### Trust and Code: A Case Study in v3.0

The clearest illustration of our trust philosophy is how we designed the Coding Area in v3.0. We could have built another "describe what you want, get code back" tool. The market is full of them — Cursor, GitHub Copilot, Lovable, and many others. They're fast, impressive, and genuinely useful for experienced developers. But they share a fundamental limitation: they generate code without governance.

ANTON's Coding Area is different because it applies the same trust architecture to software development that the analysis modules apply to professional deliverables. And it does so most fully at Tier 4 (Coding Large), where the process includes:

**Structured Discovery.** Before any code is planned, ANTON conducts a multi-turn guided conversation across business, compliance, technical, security, and legal dimensions. It asks the questions that a senior architect would ask — not just "what should this do?" but "what regulatory obligations does this create?", "what data sensitivity considerations apply?", "what happens when this fails?", and "who needs to approve what?" The output is a discovery document that stakeholders review and approve before work proceeds.

**Architecture Review.** Based on the approved discovery, ANTON creates a technical architecture that goes through its own review — including assessment by compliance and security expert personas. A generic coding tool doesn't know that a transaction monitoring dashboard requires an immutable audit log. ANTON does, because it has access to ANTON's 56 expert areas, including Financial Crime Prevention, Cybersecurity, and Legal.

**Milestone Governance.** Implementation is broken into milestones, each with acceptance criteria defined before work begins, expert panel review at completion, and sign-off gates that require human approval. Progress is tracked, decisions are documented, and the audit trail captures everything.

**Goal Alignment Checks.** Before release, ANTON reviews the completed work against the original discovery document — does what was built actually match what was intended? Requirements drift is a common problem in software development, and this check catches it before deployment.

At every stage, the humans involved can see exactly what ANTON is thinking, challenge its assumptions, redirect its approach, and approve the next step. Non-technical stakeholders can participate meaningfully — the Tier 1 Code Review capability translates code and technical decisions into plain language explanations that product owners, compliance officers, and executives can actually understand and evaluate.

This is process-based trust in action. You don't have to trust the code because it "looks right." You can trust the process that produced it — because the process was rigorous, transparent, and governed at every stage.

### Trust Across the Platform

The same trust architecture applies to every capability ANTON offers, because trust isn't a feature that gets added to some capabilities and not others. It's a property of the platform itself.

**Discovery Mode** doesn't just produce an AI opportunity score — it shows you how the scoring worked, what data it used, what weights it applied, and what assumptions it made. You can challenge the scoring methodology and adjust the inputs. The output is a transparent recommendation, not an opaque verdict.

**External Data Integration** doesn't just connect to your database — it logs every query, requires admin approval for new connections, encrypts credentials, enforces least-privilege access, and maintains a complete audit trail. You can verify exactly what data was accessed, how it was transformed, and how it was used in the analysis.

**Workflow Automation** applies governance at every step of a multi-step process. Each step can have its own review requirements, quality thresholds, and approval gates. The final output inherits the trust of every preceding step — and the audit trail proves it.

### The Trust Equation

We think about trust in ANTON as an equation:

**Trust = Transparency × Consistency × Governance × Time**

- **Transparency** means you can see how ANTON works, at whatever level of detail you need.
- **Consistency** means the same quality standards are applied every time, by every user, across every module.
- **Governance** means there are controls, checks, and human oversight built into every workflow.
- **Time** means trust compounds — the longer you use ANTON with good results, the stronger the evidence base for trust becomes.

No single factor is sufficient. A transparent system without consistency is unpredictable. A consistent system without governance is unaccountable. A governed system without transparency is a black box. And all three without time are just promises.

ANTON provides the mechanisms for all four. Your job is to use them, verify them, and build the trust that your organisation's context requires.

Trust isn't a feature. It's an architecture.

---

## 5. Integration: Your Organisation, Your Machine, Your Data

### The Integration Spectrum

AI tools exist on a spectrum from completely isolated to deeply integrated. Most consumer AI tools — ChatGPT, Claude.ai, Gemini — sit at the isolated end. You type a question, get an answer, and the tool has no connection to your organisation, your data, or your existing systems. Every conversation starts from zero. Every session requires you to re-explain who you are, what you're working on, and what context matters.

At the other end of the spectrum are deeply embedded enterprise AI systems that connect to every database, every document store, every workflow. These are powerful but expensive, complex to deploy, and often require months of integration work before they deliver value.

ANTON is designed to meet you where you are and move along this spectrum at your pace. You can start with a completely standalone experience — no connections, no configuration, just choose a module and go. And you can progressively integrate with your organisation's data, documents, databases, and tools as your comfort and governance readiness allow.

This isn't a compromise. It's a recognition that different organisations, different teams, and different use cases have different integration requirements — and that those requirements change over time as trust builds and value is demonstrated.

### The Four Knowledge Modes

At the foundation, ANTON's Knowledge Source System provides four modes that determine how much context the AI has access to. You choose the mode per session, so you can be conservative for one task and fully integrated for another.

**Mode 1: AI Knowledge Only**

The AI model's built-in knowledge. No external data, no documents, no web search. The simplest and most private mode — nothing about your organisation is shared with anyone. This mode is ideal for general research, brainstorming, learning new frameworks, or any task where organisational context isn't needed.

Even in this mode, ANTON's value is clear. The seven-layer prompt system still provides expert persona, task methodology, quality controls, and domain context from the module definition itself. You're getting professional-grade output structure even without organisational data.

**Mode 2: AI + Web Search**

Adds real-time web search for current information. The AI can access the latest regulatory publications, news, market data, and research. Useful for regulatory change monitoring, competitive analysis, market research, and staying current on evolving topics.

Only search queries leave your environment — your documents and organisational data remain local. This mode is a practical choice for work that needs current external information without involving sensitive internal data.

**Mode 3: AI + Local Documents**

This is where organisational integration begins. You can attach your own documents — policies, procedures, reports, contracts, internal guidelines, client materials — and ANTON analyses them with full professional expertise. The documents stay on your machine; only the text content is sent to the AI model as part of the prompt.

This is the mode that typically delivers the first "wow" moment. When a compliance officer uploads their current AML policy and asks ANTON to run a gap analysis against AMLR requirements, the output isn't generic — it's specific to their actual policy, identifying real gaps, referencing real sections, and suggesting concrete improvements. The difference between Mode 1 and Mode 3 output quality is often dramatic because the AI can ground its analysis in your actual reality rather than general knowledge.

**Mode 4: Full Integration**

All sources combined: AI knowledge, web search, local documents, specific URLs, and — new in v3.0 — direct database connectivity and MCP tool access. This mode enables the most powerful analyses because ANTON has access to your actual data, your documents, current external information, and connected tools simultaneously.

A risk assessment in Mode 4 might combine the AI's regulatory knowledge, current EBA guidance pulled via web search, your internal risk framework document, customer exposure data queried from your PostgreSQL database, and transaction patterns accessed via a connected analytics tool. The result is an analysis grounded in reality at every level — not theoretical, not based on sample data, but reflecting your actual current state.

### Beyond Documents: Direct Data Connectivity (v3.0)

One of the most significant additions in v3.0 is the External Data Integration framework. In previous versions, getting organisational data into ANTON required exporting to CSV or copying into documents — a bottleneck that slowed adoption and limited what the platform could analyse. It also meant the data was always a snapshot, potentially outdated by the time the analysis was complete.

Now, ANTON can connect directly to your live databases:

**Supported databases:** PostgreSQL, MySQL, Microsoft SQL Server, MongoDB, and REST APIs. This covers the vast majority of enterprise data sources. Additional connectors are planned based on community demand.

**Visual connection wizard:** A guided setup experience handles connection configuration, authentication, and initial testing. You don't need to write connection strings or configure drivers manually.

**Data transformation layer:** Different databases structure data differently. The transformation layer normalises data formats so that ANTON's analysis modules work consistently regardless of the underlying database technology.

**Connection pooling:** For performance in multi-user environments, database connections are pooled and managed efficiently.

**Governance built in:** This is where ANTON's philosophy shows most clearly. Every database query is logged to the audit trail. New connections require admin approval. Credentials are encrypted at rest. The principle of least privilege is enforced — a connection is granted only the permissions it needs, nothing more. Query results are scoped to what the analysis actually requires.

The practical impact is substantial. An AML analyst can run a risk assessment that queries the actual customer database, analyses real transaction patterns, and cross-references with regulatory requirements — all in a single session, with full transparency and governance. A project manager can pull actual resource utilisation data, budget figures, and milestone status from project management systems. A consultant can analyse a client's actual operational data as part of an engagement, with a complete audit trail that both parties can review.

### MCP: The Universal Connector (v3.0)

The Model Context Protocol (MCP) is an open standard developed by Anthropic for connecting AI models to external tools and data sources. It's becoming the standard way that AI applications connect to the outside world — and ANTON integrates it in both directions.

**ANTON as an MCP server:** ANTON exposes its 485 modules as tools that Claude Desktop and other MCP clients can use. This means you can access ANTON's expert capabilities from other AI applications in your workflow. If you're already using Claude Desktop for general work, you can invoke ANTON's AML Gap Analysis module or Project Status Report module without leaving your current environment. The expert training, the governance, the quality framework — it all comes through the MCP connection.

**ANTON as an MCP client:** ANTON can connect to external MCP servers, accessing databases, file systems, APIs, and other tools through the standardised protocol. As the MCP ecosystem grows — and it's growing rapidly — ANTON automatically gains access to new data sources and capabilities without needing custom integration code. A new MCP server for Jira, or Salesforce, or Bloomberg data becomes accessible to ANTON's modules as soon as it's published.

This dual-mode MCP integration positions ANTON at the centre of a growing ecosystem. It can both consume external capabilities and provide its own expertise to other tools — a network effect that increases value over time.

### Integration at Your Pace

The critical principle underlying all of this is that **you control the integration depth**. ANTON doesn't require any integration to deliver value. A solo practitioner can use it with Mode 1 from day one and never connect it to anything. An enterprise can deploy it with full database connectivity, MCP integration, and multi-user governance.

The progression typically follows a natural trust-building pattern:

1. **Week 1:** Mode 1, exploring modules, understanding capabilities
2. **Month 1:** Mode 3, uploading documents for specific analyses
3. **Month 3:** Mode 2+3, adding web search for regulatory currency
4. **Month 6:** Mode 4, connecting databases for live data analysis
5. **Ongoing:** MCP integration, workflow automation, cross-system connectivity

Each step adds capability without compromising the security and governance guarantees that make the platform trustworthy. And each step is reversible — you can always reduce integration depth if circumstances change, if a project ends, or if governance requirements shift.

---

## 6. Safety & Security: Non-Negotiable Foundations

### Security by Design, Not Afterthought

In many AI tools, security is an add-on — something bolted onto an existing architecture to satisfy enterprise procurement requirements. The security features exist, but they're layered on top of a system that was designed for convenience first and locked down later. This approach always leaves gaps, always creates friction, and never fully satisfies the security professionals who evaluate these tools.

In ANTON, security is foundational. It was designed into the architecture from the first line of code, because the target users — compliance officers, lawyers, auditors, consultants working with confidential client data, government officials handling sensitive policy matters — cannot compromise on security. For these users, a data breach isn't an inconvenience; it's a career-ending, organisation-threatening event. The security architecture must be trustworthy enough that these professionals stake their reputations on it.

### Local-First Architecture

This is the most important security decision we made, and it's the one that enables everything else.

ANTON runs on your machine. The application server runs on localhost. The database is a local SQLite file. Your documents stay in your filesystem. Your knowledge graph, your institutional memory, your quality scores, your audit logs, your apprentice model data — all local. All under your control.

**What stays on your machine:**
- All documents and uploads you provide to ANTON
- Complete session history — every conversation, every output
- Knowledge graph with all entities and relationships
- Pattern detection results across your work
- User profiles and preferences
- Full audit logs and security events
- Quality Ratchet scores and trends
- Apprentice Model progression data
- Institutional memory — decisions, overrides, preferences
- Workflow definitions and scheduling data
- Database connection configurations (credentials encrypted)

**What leaves your machine (when using cloud AI providers):**
- Prompt text sent to the AI provider (Claude, GPT, Gemini, Mistral) via encrypted HTTPS
- Web search queries (if Mode 2 or 4 is enabled)
- That's it. No telemetry. No analytics. No usage data sent to us.

**What leaves your machine (when using local Ollama):**
- Nothing. Absolutely nothing. Zero external communication.

This distinction matters enormously. For organisations that can use cloud AI providers, the security model is straightforward: your data stays local, only analysis prompts go to the provider, and you choose which provider based on their privacy policy and your regulatory requirements.

For organisations with the strictest requirements — government, defence, intelligence, certain healthcare and financial contexts — the air-gapped Ollama deployment means you get the full ANTON platform with zero external communication. The entire system runs within your network perimeter. No data leaves. No data enters from outside. The trade-off is that local models (Mistral, Llama, Qwen) are less capable than Claude Opus 4.6 or GPT-4, but for many use cases — internal policy analysis, document review, structured reporting — they are more than sufficient. And as open-source model capability improves rapidly, this trade-off diminishes with every new model release.

### Enterprise Security Controls

Beyond the local-first architecture, ANTON includes the security controls that enterprise environments require. These aren't optional features; they're part of the platform's core:

**RBAC (Role-Based Access Control):** Three roles with distinct permissions — admin, analyst, user. Admins control module access, model selection, budget allocation, database connection approval, and security settings. Analysts can run all modules, conduct reviews, and access intelligence features. Users have a focused set of capabilities appropriate for standard use. Permissions are enforced at the API level, not just the UI level — there's no way to bypass access controls by calling the API directly.

**Audit Logging:** Every API call, every session, every decision is logged with timestamp, user ID, module used, model selected, token count, cost, and outcome. This creates the audit trail that regulators, internal audit, and compliance functions require. Audit logs are tamper-resistant — they're append-only with integrity checksums.

**Budget Management:** Monthly quotas per user, per model, with automatic enforcement. When a user's budget is exhausted, the system prevents further API calls rather than running up unexpected costs. Budget data provides cost visibility across the organisation — total spend, spend by user, spend by module, spend by model. This isn't just cost control; it's cost governance.

**Security Event Monitoring:** Failed login attempts are tracked and can trigger lockouts. Unusual patterns — sudden spikes in usage, access attempts to restricted modules, bulk data exports — are logged as security events for review.

**Rate Limiting:** API call limits per user per hour prevent both abuse and accidental runaway processes. Limits are configurable per role.

**Connection Sandboxing:** Script execution in the Coding Area runs in a sandboxed environment with enforced limits on memory usage, runtime duration, and network access. Database connections have separate sandboxing with query logging, result size limits, and mandatory admin approval for new connections. A script in the Coding Area cannot access the filesystem outside its sandbox, cannot make arbitrary network calls, and cannot access database connections it hasn't been explicitly granted.

**Input Validation:** All user inputs are validated and sanitised before processing. This protects against prompt injection attempts, SQL injection through data connectors, and other input-based attack vectors.

### GDPR and Data Privacy

ANTON's local-first architecture is inherently aligned with GDPR's data minimisation principle (Article 5). No personal data is collected by the platform itself. No telemetry is sent to ANTON's creators or to FutureChain AB. No usage data is aggregated. There is no "phone home" functionality, no anonymous analytics, no crash reporting that sends data externally.

For AI provider interactions, users should review the privacy policies of their chosen provider. The key consideration is whether the provider uses your prompts for model training:
- **Anthropic (Claude):** API usage is not used for model training by default
- **Mistral:** EU-based provider, subject to EU data protection law — attractive for European data residency requirements
- **Ollama:** Completely local, no privacy considerations beyond your own machine
- **OpenAI and Google:** Review their current data handling policies for your jurisdiction

Multi-user deployments provide complete user isolation. Users cannot see each other's sessions, documents, outputs, or quality data unless explicitly shared through collaborative workflows with appropriate permissions. The database implements row-level isolation so that even a direct database query cannot access another user's data without admin privileges.

### The Security Mindset

Security in ANTON isn't a feature list — it's a mindset that influences every design decision. When we built External Data Integration in v3.0, the first design conversation wasn't "how do we connect to databases?" but "how do we connect to databases safely?" When we built the Coding Area, script execution was sandboxed from day one, not retrofitted after a security review.

This mindset extends to how we think about the platform's future. Every new capability — marketplace, mobile app, cloud deployment — will be designed with the same security-first approach. If we can't make it secure, we won't ship it.

---

## 7. Open Source: Why We Give This Away

### The Democratisation Argument

There is a growing divide in AI capability between those who can afford enterprise tools and those who cannot. Harvey AI, one of the leading legal AI platforms, costs approximately $1,200 per lawyer per month with a 20-seat minimum — that's $24,000 per month, $288,000 per year, before you've done a single analysis. Legora, another legal AI platform, has similar enterprise pricing. This isn't unusual; it's the standard business model for professional AI tools.

This pricing model creates a capability gap that mirrors — and reinforces — existing inequalities. Large firms with large budgets get dramatically better AI capability than small firms, solo practitioners, public sector organisations, NGOs, academic institutions, and professionals in developing economies. The same regulatory obligations apply regardless of size. The same quality expectations apply regardless of budget. But the tools to meet those obligations and expectations are available only to those who can pay.

A five-person compliance team at a community bank faces the same AMLR requirements as a five-hundred-person team at a global systemically important bank. A solo practitioner lawyer in Accra has the same professional obligations as a partner at a Magic Circle firm in London. A public health researcher in Manila needs the same analytical rigour as one at Harvard. But their access to AI tools that could help them meet these standards is vastly different.

We think this is wrong, and we think it's unnecessary. The marginal cost of software is zero. The marginal cost of AI is the API usage — typically $0.05 to $5 per session. There is no economic reason why a compliance officer in Lagos should have worse tools than a compliance officer in London.

### The Power-Charge Principle

Our belief is that AI capabilities should power-charge every sector and enable more people to do valuable work. When we say "power-charge," we mean something specific: the time that AI saves isn't just efficiency — it's creative freedom.

A consultant who can produce a gap analysis in 30 minutes instead of 8 hours doesn't just save 7.5 hours. They gain 7.5 hours that they can invest in strategic thinking, relationship building, mentoring junior colleagues, developing new methodologies, or simply in a better work-life balance. The mundane work — the formatting, the boilerplate, the repetitive structure — is handled by ANTON. The meaningful work — the insight, the judgment, the recommendation — remains with the human.

When more people can do more valuable work, everyone benefits. The organisation gets better output. The clients get better service. The professionals get more fulfilling careers. And society gets better outcomes from the professionals who serve it — better compliance, better governance, better risk management, better healthcare, better education.

This is not altruism (though I'd argue there's nothing wrong with altruism). It's a genuine belief that democratising AI capability creates more value than restricting it. The consulting industry alone generates $300+ billion in annual revenue, much of it for work that ANTON's modules can accelerate by 5-10x. When that acceleration is available to everyone — not just firms that can afford enterprise AI licences — the entire sector levels up.

### A Student Deserves the Same Frameworks

One of the lines we come back to again and again is this: **a student preparing a thesis deserves the same analytical frameworks as a Fortune 500 compliance officer.**

This isn't a metaphor. ANTON's Academic Research module uses the same rigorous methodology frameworks that the Regulatory Gap Analysis module uses. The Quality Ratchet applies the same scoring to a student's literature review as to a bank's AML assessment. The transparency levels work the same way whether you're analysing a dissertation question or a sanctions screening policy.

The tools are the same. The quality expectations are the same. The governance is the same. The only thing that differs is the domain context, and that's handled by the module system. This is what openEXPERT means as a philosophy — expert-grade AI capability that is genuinely open and genuinely accessible.

And it works in both directions. The student who learns professional analytical methodology through ANTON's modules becomes a better professional when they enter the workforce. The frameworks they've internalised, the quality standards they've absorbed, the structured thinking they've practised — these are professional skills that transfer directly. ANTON isn't just a tool for students; it's a training ground.

### The Community Multiplication Effect

Open source isn't just a licensing choice. It's a growth strategy based on a simple observation: the world has more domain experts than any single company could ever hire.

ANTON currently has 485 modules across 56 domains. That's the work of one creator and a growing community. It's a substantial foundation — but it's a fraction of what the world's professionals know.

What happens when a cardiac surgeon contributes a set of clinical decision support modules? When an environmental lawyer adds climate regulation analysis? When an agricultural economist adds crop pricing models for smallholder farmers in Sub-Saharan Africa? When a maritime compliance specialist in Singapore contributes shipping regulation modules? When a teacher in São Paulo contributes curriculum design modules for under-resourced schools?

The modular architecture makes this practical. The .anton package format enables anyone with domain expertise to create a module — defining the task, the methodology, the expert persona, the quality criteria, the compliance rules — and share it with the community. Every contribution makes the platform more valuable for everyone. And every contribution comes with the same governance framework — Quality Ratchet, transparency levels, compliance checks, review workflows — that ensures professional standards regardless of who created the module.

Our roadmap continues to expand beyond 56 expert areas through community contribution. It's a plan to create the conditions — the architecture, the package format, the community infrastructure, the quality standards — where a global community of domain experts builds what the world actually needs.

### What Open Source Doesn't Mean

It's worth being clear about what open source means and doesn't mean in ANTON's context:

**It means** the software is free, the source code is public, you can modify it, and you can use it commercially. MIT licence — the most permissive open-source licence available.

**It means** there are no gated features, no premium tiers, no artificial limitations. The solo practitioner and the enterprise get the same platform.

**It means** you can inspect every line of code, every prompt template, every module definition. Full transparency — not just in how ANTON's AI thinks, but in how ANTON itself is built.

**It doesn't mean** no cost. You still pay for AI API usage (unless using free Ollama models). ANTON is free; the AI models that power it charge for usage.

**It doesn't mean** no quality standards. Community contributions will go through quality review. The .anton package format includes quality metadata. The goal is an open ecosystem with professional standards, not an unmoderated free-for-all.

**It doesn't mean** no support. GitHub Issues and GitHub Discussions provide community support. Enterprise support options may be offered in the future by FutureChain AB or by community members who build practices around ANTON.

### The Distribution Philosophy

Our approach to distribution reflects the same values as our approach to the software itself. We use GitHub Discussions rather than a separate community platform because it's where the code lives and where developers already are. We don't require email registration, don't capture marketing data, don't run retargeting ads, and don't gate any content behind sign-up forms.

If you want to use ANTON, clone the repository. If you want to contribute, open a pull request. If you want to discuss ideas, start a GitHub Discussion. If you want to report a problem, open an Issue. No friction, no funnel, no tracking.

This isn't idealism disconnected from business reality. It's a calculated bet that the best way to build a valuable platform is to remove every barrier between the software and the people who need it. Usage creates community. Community creates contributions. Contributions create value. Value creates more usage. The flywheel works — but only if you don't put toll booths on it.

---

## 8. The Connected Vision: Where This Goes

### From Expert Tool to AI Coworker Platform

ANTON began as a way to make AI analyses more professional — a set of well-crafted prompts for financial crime prevention, wrapped in a clean interface. It was called the "FCP Workbench" and had 8 modules.

It evolved into something much larger. Version 2.0 delivered 238 modules across 29 domains, 14 transformative intelligence features, enterprise security, and a complete governance framework. But even at v2.0, ANTON was primarily an analysis tool — you asked it questions, it produced expert answers.

Version 3.0 represents a qualitative shift. ANTON is no longer just an analysis tool. It's an **AI coworker platform** — a system where AI participates meaningfully in the full spectrum of professional activity:

- With the **Coding Area**, ANTON doesn't just analyse — it builds. Software development with professional governance, milestone reviews, and multi-stakeholder participation.
- With **Discovery Mode**, ANTON doesn't just execute tasks — it helps organisations figure out which tasks to execute. Strategic AI adoption guidance grounded in real assessment.
- With **External Data Integration**, ANTON doesn't just work with documents you provide — it connects to your actual live data. Analysis grounded in reality, not snapshots.
- With the expanded **expert areas**, ANTON's professional training extends across 56 domains — with a community architecture designed to scale to hundreds.

But we see v3.0 as a waypoint, not a destination. The platform's architecture — modular, extensible, governance-first — was designed to support capabilities we haven't built yet. Here's where we see this going.

### Discovery: Finding Where AI Creates Value

One of the hardest problems in AI adoption isn't the technology — it's knowing where to start. Most organisations know that AI could help them, but they don't know which processes, which departments, which workflows would benefit most. They see the conferences, they read the case studies, but they can't map those generic success stories to their specific context.

Discovery Mode, introduced in v3.0, directly addresses this gap through two complementary tracks:

**Paper-based workshops** provide a facilitator-led format for teams and organisations. A structured guide walks the facilitator through current-state assessment, opportunity identification, and prioritisation. Cards representing different AI capabilities are mapped against organisational processes. Scoring matrices help quantify impact and complexity. The output is a prioritised action plan with concrete next steps.

**Digital guided conversations** provide a self-service alternative within the platform itself. ANTON guides users through a structured assessment — what do you do, how long does it take, what are the pain points, what data is involved — and produces an AI Opportunity Report. The report maps identified opportunities to specific ANTON modules, estimates ROI, and scores implementation complexity.

But Discovery Mode does something more subtle than producing reports. It starts a conversation about AI across the organisation. When a compliance team discovers that three of their most time-consuming processes could be automated, that insight propagates — the operations team asks the same question, then finance, then legal. We call this the **Discovery Cascade**, and it's how organisational AI adoption actually happens in practice: not through top-down mandates and transformation programmes, but through bottom-up proof of value spreading organically between teams.

### Building Software with Professional Governance

The Coding Area in v3.0 is perhaps the most ambitious expression of the openEXPERT philosophy applied to a new domain. The market is full of AI coding tools — Cursor, GitHub Copilot, Lovable, and many others. They're fast, impressive, and increasingly powerful. But they share a common characteristic: they generate code without governance.

ANTON's Coding Area is different because it treats software development the way it treats every other professional activity — with structured expertise, process-based trust, and human oversight at every critical decision point.

At the highest tier (Coding Large), ANTON acts as a senior architect, not a code generator. The process includes structured discovery across business, compliance, technical, security, and legal dimensions. Multi-stakeholder review at every milestone. Compliance and security assessment drawing on ANTON's expert areas. Goal alignment checks comparing the finished product against the original intent. And throughout, non-technical stakeholders can participate meaningfully because the Tier 1 Code Review capability translates technical decisions into plain language.

And when the specification is complete, ANTON doesn't compete with existing coding tools — it collaborates with them. The AI Code Instruction Builder exports professional .md instruction files that Claude Code, Codex, or Mistral Code can execute. **ANTON is the architect; the coding tools are the builders.** Each does what it does best. The result is software that was designed with the rigour of a professional consulting engagement and built with the speed of AI-assisted development.

### A Marketplace for Expertise

Looking ahead, we see ANTON's modular architecture creating ideal conditions for a marketplace where domain expertise is shared, traded, and valued globally.

The .anton package format already supports export, import, and sharing of complete module bundles — prompts, personas, skills, quality criteria, compliance rules, and workflow definitions. The next step is a community marketplace where specialists contribute their expertise and benefit from others' contributions.

Imagine the possibilities: a maritime compliance expert in Singapore contributes shipping regulation modules. A healthcare privacy specialist in Germany contributes GDPR-health data modules. A microfinance researcher in Nairobi contributes smallholder lending assessment modules. An Indigenous rights lawyer in Australia contributes native title analysis modules. A climate scientist in Norway contributes carbon accounting modules. Each contribution makes the platform more valuable for everyone, and each contributor gains access to the expanding ecosystem.

The marketplace model we envision is contribution-based rather than purely commercial. Contribute quality modules, build reputation, access premium capabilities. The economics align incentives: experts are rewarded for sharing knowledge, users get access to world-class domain expertise, and the platform grows more powerful with every contribution. ANTON gets stronger as a coworker because the global community continuously teaches it new professional skills.

This isn't just a feature roadmap — it's the logical endpoint of the openEXPERT philosophy. If the goal is to enable more people to do valuable work, then the mechanism should be a global community of experts sharing what they know, with the platform providing the infrastructure that makes that sharing structured, governed, and valuable.

### AI That Grows With You

The most exciting aspect of ANTON's vision is its learning capability. Every session, every decision, every human override contributes to a growing institutional knowledge base. Patterns emerge across projects. Quality improves over time. The Apprentice Model gradually earns greater autonomy as it demonstrates competence with your specific work patterns.

In Year 1, ANTON is a powerful but general tool. You're exploring modules, learning what works, building initial context. The Quality Ratchet is establishing baselines. The knowledge graph is sparse but growing.

In Year 3, it's an organisational knowledge repository. ANTON understands your regulatory landscape, your quality standards, your risk appetite, and your decision-making patterns. The knowledge graph has hundreds of entities and thousands of relationships. Pattern detection is surfacing insights you'd never have found manually. Institutional memory has captured years of professional decisions. Several modules have progressed to Proficient or Expert stage in the Apprentice Model.

In Year 5, it's an institutional asset. It captures and preserves expertise that would otherwise walk out the door when experienced professionals move on. A new team member joining your compliance function can benefit from years of accumulated quality standards, methodological preferences, regulatory interpretations, and decision patterns — all captured in ANTON's institutional memory and knowledge graph.

This isn't science fiction. Every component needed for this vision is already implemented in ANTON v3.0. The knowledge graph captures entities and relationships. The pattern detection engine identifies cross-workflow insights. The institutional memory engine learns from your decisions. The Apprentice Model tracks competence development. The External Data Integration connects to your organisational data. The workflow automation chains complex processes. The quality system measures improvement over time.

What remains is time — time for the data to accumulate, for patterns to emerge, and for the system to demonstrate value that justifies increasing levels of trust and integration. The architecture is ready. The platform is ready. The vision is waiting to be proven through use.

### An Invitation

ANTON is an invitation to explore a different way of working with AI. Not AI as a black box that produces output of uncertain quality. Not AI as a threat to professional expertise. Not AI as a cost centre that requires expensive subscriptions and complex procurement. But AI as a genuinely capable coworker that brings complementary strengths to a partnership where humans remain firmly in charge.

We believe this vision is both technically achievable — the platform proves it with 485 working modules — and practically valuable — professionals in financial crime, legal, consulting, and many other domains demonstrate it daily. We've built the foundations. Now we're inviting you to build on them.

Whether you're a compliance officer running your first gap analysis, a consultant delivering your hundredth engagement, a student preparing a thesis, a developer architecting a new application, a teacher designing a curriculum, or an organisation trying to figure out where AI fits — ANTON is here, it's free, it's open, and it's ready.

Give it a try. Tell us what works. Tell us what doesn't. Contribute what you know. Build modules for your domain. Share them with colleagues. And together, let's make AI genuinely useful for professional work — for everyone, everywhere.

Give it away, hold nothing back, and let the work speak.

---


---

## PART 2: INTRODUCTION & VALUE

> **Note:** Source file `ANTON_Whitepaper_v3_Part2.md` was not present in the working folder at time of assembly (March 1, 2026). Sections §9 (What You Get Today), §10 (Who This Is For), and §11 (Why openEXPERT) are therefore absent from this assembled document. This gap is flagged for the human reviewer to supply the missing file and insert these sections here.

---

## PART 3: CORE ARCHITECTURE

*Part 3 opens the hood. Where Part 1 explained the philosophy and Part 2 explained the value, this section explains how ANTON actually works — the technical architecture that makes everything possible. We cover the seven-layer prompt system that gives every module its expertise, the knowledge source system that connects ANTON to your data, the multi-LLM architecture that prevents vendor lock-in, and the database persistence layer that ensures nothing is ever lost.*

*This is the section for technical evaluators, architects, and anyone who wants to understand not just what ANTON does, but how it does it.*

---


## 12. How It Works: The Seven-Layer Prompt Builder

The quality of AI output depends on the quality of the prompt. This is the foundational truth of professional AI work, and it's the reason ANTON exists. Rather than expecting every professional to become a prompt engineer, ANTON uses a **seven-layer prompt assembly system** that combines general AI capabilities with domain expertise, organisational context, and user preferences — automatically, behind the scenes, for every module.

### Overview

Each layer adds specific knowledge or configuration, building from general principles to task-specific expertise:

1. **System Foundation** — Core behavioural principles
2. **Area Context** — Domain-specific background
3. **Module Expertise** — Specific task methodology
4. **Persona Injection** (optional) — Expert perspective
5. **Skills Attachment** (optional) — Reusable frameworks
6. **Knowledge Source Integration** — Reference material
7. **Transparency & Reasoning** — How AI thinks

The result is a comprehensive prompt that can run to tens of thousands of tokens — far more detailed and nuanced than any prompt a human would write for a single session. This is the "professional training" described in Part 1: the structured expertise that transforms a general AI model into a domain-specific professional.

---

### Layer 1: System Foundation

**Purpose:** Establish core behavioural principles that apply to every module, every session, every interaction.

**Content:**
- Analytical rigour standards
- Professional tone guidelines
- Citation requirements
- Uncertainty acknowledgment protocols
- Output structure expectations

**Implementation:** `server/areas/system-foundation.md`

**Example:**
```markdown
You are ANTON, an AI expert assistant built on the openEXPERT platform. You provide professional-grade analysis across 56 domains.

Core principles:
1. Accuracy over speed — verify before asserting
2. Cite regulatory sources with article numbers
3. Flag assumptions and limitations explicitly
4. Structure outputs for executive readability
5. Maintain professional tone unless user specifies otherwise
```

**Why it matters:** This layer ensures every module follows consistent quality standards. Whether you're running an AML gap analysis or a project status report, the foundational principles — accuracy, citations, uncertainty acknowledgment — are always present.

---

### Layer 2: Area Context

**Purpose:** Provide domain-specific background for each expert area. This is what gives ANTON "industry awareness" — the regulatory landscape, key terminology, common methodologies, and stakeholder context that any professional in the field would know.

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

**Why it matters:** AI needs to "speak the language" of the domain. When a compliance officer asks about customer risk categorisation, ANTON already knows the regulatory context, the standard terminology, and the stakeholder expectations — it doesn't need to be told.

---

### Layer 3: Module Expertise

**Purpose:** Define the specific task, expected output structure, and quality criteria. This is the core of ANTON's "professional training" — the layer that transforms a general AI conversation into a structured professional deliverable.

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
Systematically compare an institution's current AML/CFT framework against EU AMLR 2024/1624 requirements, producing a scored gap matrix and prioritised action plan.

## Methodology
1. Extract regulatory requirements from AMLR
2. Map requirements to institution's current controls
3. Score each requirement: Compliant (Green), Partial (Yellow), Gap (Red)
4. Assess materiality and urgency
5. Prioritise remediation based on risk

## Output Structure
- Executive Summary (1-2 pages, board-ready)
- Gap Scoring Matrix (tabular, RAG-rated)
- Detailed Findings (per requirement with evidence)
- Prioritised Action Plan (who, what, when, effort)
```

**Why it matters:** This is the "expert training" that teaches AI how professionals actually perform the task — not the textbook version, but the version that experienced practitioners use in real engagements. The methodology, the output structure, the quality criteria — these come from years of professional practice.

---

### Layers 4-7: Configuration & Context

**Layer 4: Persona Injection** — Adds a specific expert perspective. When activated, the AI adopts the analytical approach, priorities, and communication style of the selected persona (e.g., "Senior AML Compliance Officer with 15 years' regulatory experience" or "CISO with financial services background"). This changes not just what the AI says, but how it thinks about the problem.

**Layer 5: Skills Attachment** — Injects reusable analytical frameworks and methodologies. Skills are portable across modules — a "Devil's Advocate" skill works equally well in a gap analysis and a project risk assessment. The skills library contains 50+ pre-built frameworks, and you can create your own.

**Layer 6: Knowledge Source Integration** — Provides reference material through the 4-mode system (see §13). This is where your documents, web search results, database query results, and URL content are assembled and included in the prompt.

**Layer 7: Transparency & Reasoning** — Controls how the AI thinks and how much of that thinking is visible. Maps to the three transparency levels (Level 0: output only, Level 1: show thinking, Level 2: deep trace). Also controls creativity settings and output format preferences.

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

**Result:** The AI receives a comprehensive context that combines organisational principles, domain knowledge, task-specific methodology, expert perspective, analytical tools, reference material, and reasoning configuration. This assembled prompt is what makes the difference between "AI helped me write something" and "AI produced a professional deliverable."

**Implementation:** `server/services/prompt-builder.ts` — a single service that orchestrates all seven layers into a unified prompt, handling token counting, priority ordering, and overflow management.

---

## 13. Knowledge Source System (4 Modes)

This is Layer 6 of the prompt builder — where ANTON gets its reference material. The four modes determine how much of the outside world ANTON can see, from isolated (your data stays completely private) to fully integrated (databases, documents, web, and tools all connected).

### Mode 1: AI Knowledge + Web Search

**What:** The AI model's built-in knowledge (training data) plus optional real-time web search.

**When to use:**
- General regulatory knowledge
- Latest publications (EBA consultations, FATF statements)
- Market research, competitive analysis
- Any task where organisational data isn't needed

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
- AI decides when to search based on query context
- Results appear in streaming response
- Citations automatically included

**Cost:** ~500-2000 additional output tokens per search

---

### Mode 2: Online Reference Links

**What:** Server-side fetching of specific URLs — regulations, guidance documents, web pages.

**When to use:**
- EUR-Lex regulation URLs
- Publicly accessible guidance documents
- Online knowledge bases and regulatory portals

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
- Server fetches URL content (HTML parsing for web pages, pdf-parse for PDFs)
- Extracts and cleans text
- Appends to system prompt with source attribution
- Summary mode (~5k tokens) vs. full text extraction

**Limitations:** Cannot access authenticated content (Google Docs with login, corporate intranets)

---

### Mode 3: Local Folder Integration

**What:** Index local folders, extract text from all documents, include in prompt context.

**When to use:**
- Client engagement folders (policies, procedures, internal documents)
- Downloaded regulations and guidance
- Historical analyses and deliverables

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
1. Folder registration (saved to database for persistence)
2. Recursive scanning with file type filtering
3. Text extraction per file type (pdf-parse, mammoth, xlsx libraries)
4. Append to system prompt with file attribution
5. Token counting with 180k limit enforcement

**Security:**
- Path traversal protection
- No folder access outside user-selected paths
- Extracted text not permanently stored (on-demand only)

---

### Mode 4: Combined Mode

**What:** Local documents + AI knowledge + web search + URLs + database connectivity (v3.0) simultaneously.

**When to use:** Gap analyses (compare client docs against regulations), risk assessments with live data, any task requiring multiple data sources.

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
- `local_first`: Ground in client documents, fill gaps with AI knowledge
- `claude_first`: Start from regulatory requirements, assess client documents
- `merged`: Treat all sources equally, cross-reference

---

### Token Management

**Challenge:** Context window limits (180k tokens for Claude Opus 4.6)

**Solution:**
1. Real-time token counting during knowledge source indexing
2. Warning at 150k tokens (~83%)
3. Hard stop at 180k (prevents API rejection and wasted costs)
4. User can deselect files or switch to summary mode
5. Auto-summarise large files when token budget is tight

**Display:** "Loaded: 87,450 tokens / 180,000 (48%)" — visible in the UI at all times.

---

## 14. Multi-LLM Architecture

ANTON supports **five AI providers** with seamless switching. This is a deliberate design choice: no vendor lock-in, no dependency on any single provider's pricing, availability, or capability decisions.

### Supported Providers

**Anthropic Claude:**
- `claude-opus-4-6` — Most capable. Adaptive thinking with `effort` parameter (low/medium/high/max). 1M context window. 32k max output. Native reasoning. Default for all modules.
- `claude-sonnet-4-5-20250929` — Balanced quality and speed. 200k context. 8k output. Extended thinking with budget_tokens.
- `claude-haiku-4-5-20251001` — Fast and cost-efficient. 200k context. 8k output. Ideal for classification, filtering, and first-pass analysis.

**OpenAI GPT:**
- `gpt-4.1` — 1M context window. 32k output. Strong at instruction-following and structured output.
- `gpt-4o` — 128k context. 16k output. Multimodal-capable.
- `gpt-4o-mini` — 128k context. 16k output. Cost-efficient for high-volume tasks.

**Google Gemini:**
- `gemini-2.5-pro` — 1M context. 65k output. Native reasoning support. Strong at long-document analysis.
- `gemini-2.5-flash` — 1M context. 65k output. High throughput.
- `gemini-2.0-flash` — 1M context. 8k output. Efficient for standard tasks.

**Mistral:**
- `mistral-large-latest` — 131k context. 16k output. EU-based provider (Paris) for strict data residency requirements.
- `mistral-medium-latest` — 131k context. 16k output.
- `mistral-small-latest` — 131k context. 8k output.

**Local Ollama:**
- Any model available on your local Ollama installation, specified as `ollama:[model-name]` (e.g., `ollama:llama3.2`, `ollama:mistral`). Runs entirely on your machine — no API calls, no data transmission, no cost per query. The only fully offline option.

**Total: 5 providers, 12 named cloud models + unlimited local Ollama models.**

---

### Provider-Agnostic Design

**Unified interface:** The same module configuration, the same 7-layer prompt system, and the same quality framework work identically across all providers. The adapter layer translates ANTON's settings to provider-specific API parameters.

**Example translation:**

| ANTON Setting | Claude Opus 4.6 | GPT/Mistral |
|---------------|-----------------|-------------|
| `thinking: "investigate"` | `effort: "max"` | 32,768 token budget |
| `creativity: "strict"` | Prompt: "Precise, factual..." | Prompt: "Precise, factual..." |

**Result:** Users switch models without reconfiguring modules. A gap analysis module works identically whether powered by Claude Opus, GPT-4, Mistral Large, or a local Ollama model — the professional training, the quality framework, and the governance are provided by ANTON, not by the model.

**Implementation:** `server/services/unified-llm-client.ts` + `model-adapter.ts`

---

### Cost Tracking

Every API call is logged to `audit_log` with:
- Provider (anthropic, openai, google, mistral, ollama)
- Model
- Input/output/cached tokens
- Estimated cost (calculated server-side using current pricing)

**Dashboard:** Monthly usage per provider, cost by user, cost by module, cost trends over time.

---

### Prompt Caching (Claude Only)

**What:** Cache large, repeated system prompts to reduce costs by up to 90%.

**How it works:**
- First request: Full input cost + cache creation (~25% of input cost)
- Subsequent requests within 5 minutes: Cached sections billed at ~10% of normal rate

**Savings example:**
- 80k regulation text in knowledge sources
- Without caching: 5 sessions = 400k tokens × $15/M = $6.00
- With caching: $1.20 + (4 × $0.12) = $1.68
- **72% cost reduction**

This makes a material difference when running multiple analyses against the same regulatory text — a common pattern in professional work where the regulation is constant but the analysis questions vary.

---

### Multi-Model Deliberation Protocol

The Multi-Model Deliberation Protocol addresses a fundamental limitation of single-model responses: even the most capable model has characteristic blind spots, and a single perspective — however sophisticated — can miss considerations that a different cognitive approach would catch.

**How it works:** When deliberation mode is activated, openEXPERT runs the same analysis simultaneously across three Claude models:

- **Claude Opus 4.6** — depth and nuance, best for complex multi-step reasoning and regulatory interpretation
- **Claude Sonnet 4.5** — balanced breadth, strong at structured analysis and cross-domain connections
- **Claude Haiku 4.5** — speed and conciseness, often surfaces the core issue without elaboration

The three responses are returned independently and then passed to a Claude Opus synthesis step. The synthesis is not a simple merge — it is a structured review: where all three models agree, the conclusion is stated with confidence; where they diverge, the synthesis presents the differing perspectives rather than forcing a false consensus; where one model raises a concern the others missed, that concern is surfaced explicitly with its source.

**What this produces:** Output that is simultaneously more complete and more honest about its uncertainty than any single-model response. Areas of three-model agreement carry high confidence. Areas of disagreement carry explicit acknowledgment that the question is genuinely complex or context-dependent.

**When to use it:** Deliberation mode is appropriate for high-stakes outputs where the cost of a missed consideration is significant — complex regulatory gap analyses, legal interpretations of ambiguous provisions, risk assessments where classification drives decisions, and board-level outputs that will inform strategy. For standard operational tasks, single-model execution is sufficient and more cost-efficient. Activate deliberation from the session toggles panel in any module or prompt session.

**Cost note:** Deliberation mode runs three full model calls plus one synthesis call — typically 3–4× the cost of a single response. For analyses where completeness matters, this is an acceptable premium for the additional rigour and confidence it provides.

---

## 15. Database & Persistence

### Why SQLite?

ANTON uses **SQLite** as its primary database — a choice that surprises some enterprise architects, but it's deliberate and well-reasoned.

**The reasoning:**

1. **Local-First Architecture** — All your data stays on your machine. No cloud dependency. Zero network latency for queries. Works offline (except for LLM API calls).

2. **Zero Configuration** — No database server to install. No connection strings to configure. No admin passwords to manage. The database is a single file: `data/workbench.sqlite`.

3. **ACID Guarantees** — Full transactional support. Data integrity even if the process crashes. Atomic commits across related tables.

4. **Performance at Scale** — Handles millions of rows efficiently. Write-Ahead Logging (WAL) mode for concurrent reads. Optimised indexes on all foreign keys and frequent query patterns.

5. **Portability** — Copy the `.sqlite` file and your entire database is backed up. Move between Windows, Mac, Linux seamlessly. Inspect with any SQLite browser tool.

**When you outgrow SQLite:** If you scale to 100+ concurrent users or multi-GB databases, ANTON supports migration to PostgreSQL (planned Q3 2026). The schema is designed for portability — the same table structures work in both engines.

---

### Database Schema: 73 Tables Across 16 Functional Groups

ANTON implements a **comprehensive persistence layer** with **73 tables** organised into **16 functional groups**. Every transformative feature has proper database backing — nothing is ephemeral.

#### GROUP 1: Core Session & User Management (13 tables)

**Core operations:** Sessions, messages, configurations, projects.

| Table | Purpose |
|-------|---------|
| `sessions` | Session metadata (module, area, config, timestamps) |
| `messages` | Conversation history with token/cost tracking |
| `registered_folders` | Local folder references for knowledge sources |
| `module_configs` | Saved module configurations per user |
| `projects` | Project organisation and grouping |
| `project_sessions` | Many-to-many sessions ↔ projects |
| `skills` | Reusable prompt skills library |
| `reviews` | Review engine feedback |
| `user_profiles` | User context and preferences |
| `custom_modules` | User-created modules |
| `community_skills` | Community-submitted skills |
| `community_modules` | Shared custom modules |

**Key table structure:**

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  area_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  config TEXT NOT NULL DEFAULT '{}',
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
  thinking_content TEXT,
  content_blocks TEXT,
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

---

#### GROUP 3: Security & Audit (4 tables)

| Table | Purpose |
|-------|---------|
| `login_attempts` | Track failed login attempts by username/IP |
| `security_events` | Security incidents (rate limits, unauthorised access, input validation) |
| `audit_log` | Complete audit trail (all CRUD operations with before/after values) |
| `api_requests` | API request logging (endpoint, method, response time, user) |

---

#### GROUP 4: Institutional Memory (4 tables)

| Table | Purpose |
|-------|---------|
| `checkpoint_decisions` | Key decisions (interpretations, judgements, approaches) |
| `decision_history` | Audit trail of decision references and overrides |
| `decision_similarities` | Similarity scores between checkpoint pairs |
| `memory_feedback` | User feedback on memory helpfulness |

---

#### GROUPS 5–16: Intelligence, Quality, Automation & Budget

Groups 5–16 cover Knowledge Atoms (4 tables), Knowledge Graph (5 tables), Pattern Detection (5 tables), Quality Ratchet (4 tables), Apprentice Model (4 tables), Time Intelligence (4 tables), Regulatory Radar (5 tables), Compliance-as-Code (4 tables), Workflow Automation (4 tables), Output Versioning (2 tables), Collaborative Canvas (4 tables), and Budget & Cost Management (3 tables). Full schema details for each group appear in the database documentation (`db/schema.sql`).

---

### Performance Optimisations

**Indexes:** 120+ indexes covering every foreign key, common query patterns, composite columns for frequently joined tables, and timestamp columns for date-range queries.

**WAL Mode:** `PRAGMA journal_mode = WAL;` — concurrent reads while writing, faster commits, better crash recovery.

**Foreign Key Enforcement:** `PRAGMA foreign_keys = ON;` — referential integrity guaranteed, cascading deletes prevent orphaned records.

---

### Backup & Migration

**Backup is trivially simple:**
```bash
cp data/workbench.sqlite data/backup_$(date +%Y%m%d).sqlite
sqlite3 data/workbench.sqlite ".backup data/backup.sqlite"
0 2 * * * sqlite3 /path/to/data/workbench.sqlite ".backup /path/to/backups/$(date +\%Y\%m\%d).sqlite"
```

**Restore:** `cp data/backup_20260220.sqlite data/workbench.sqlite`

**Migration to PostgreSQL (planned Q3 2026):** Schema designed for portability. Export schema, convert syntax (automated tool provided), export data, import to PostgreSQL, update `DB_TYPE=postgresql` in `.env`.

---

### Summary

ANTON's database is **comprehensive** (73 tables), **performant** (WAL mode, 120+ indexes), **maintainable** (SQLite simplicity), and **production-ready** (ACID guarantees, foreign key enforcement).

Every transformative feature has proper database backing. Nothing is ephemeral — all knowledge, patterns, quality scores, and decisions persist for long-term learning and compliance audit trails.

---

## PART 4: INTELLIGENCE & MEMORY SYSTEMS

*Part 4 covers ANTON's intelligence layer — the systems that transform individual AI sessions into cumulative organisational knowledge. These aren't features you interact with directly (though dashboards surface their outputs). They work in the background, extracting insights from every session, building a knowledge graph of entities and relationships, detecting patterns across your work, and creating an institutional memory that makes every subsequent interaction more informed.*

*This is what makes ANTON fundamentally different from tools that treat every conversation as a clean slate. ANTON remembers. ANTON learns. And ANTON gets better at working with your specific organisation over time.*

---

## §16. Semantic Search & Embedding Architecture

*Knowledge is only as valuable as your ability to find it. When a knowledge graph contains thousands of entities and relationships accumulated across hundreds of sessions, the difference between surfacing the right precedent and missing it entirely comes down to retrieval quality. openEXPERT's semantic search and embedding architecture maximises retrieval quality by combining two fundamentally different search strategies.*

---

### Two-Stage Hybrid Retrieval

openEXPERT uses a hybrid retrieval system that runs two search strategies in parallel and combines their results using Reciprocal Rank Fusion (RRF):

**BM25 (Sparse Retrieval):** The industry-standard term frequency–inverse document frequency algorithm. Excellent at exact keyword matching — when you search for "AMLR Article 4", BM25 finds every document containing those precise terms. Fast, interpretable, and reliable for regulatory citations where the exact wording matters.

**Vector Similarity (Dense Retrieval):** Documents and queries are converted to dense numerical representations (embeddings) that capture semantic meaning. Excellent at conceptual matching — searching for "customer identification requirements" returns documents about KYC, beneficial ownership, and CDD obligations, even when those exact words don't appear. Handles synonyms, paraphrases, and domain-equivalent terminology naturally.

**Reciprocal Rank Fusion (RRF):** The two result sets are merged using RRF, which consistently outperforms either method in isolation. RRF scores each document based on its rank position in both lists — a document ranked highly by both methods scores higher than one that tops only one. This compensates for their complementary weaknesses: BM25 misses semantic matches; vector search can surface conceptually related but textually distant results. Together, they cover each other's blind spots.

---

### Embedding Pipeline

Documents from local folders, uploaded files, and knowledge graph entities are processed through an embedding pipeline that converts text to vector representations for semantic retrieval. A probe guard checks whether embeddings already exist before reprocessing — avoiding redundant computation when documents haven't changed. Adaptive batch processing handles large document collections efficiently without blocking the interface.

The embedding model integrates with whichever LLM provider is configured. Switching providers does not break knowledge retrieval — the embedding adapter switches accordingly.

---

### Why This Matters for Compliance Work

Regulatory text uses precise legal language that must be found exactly. The knowledge accumulated in your sessions uses your organisation's vocabulary, which may differ. A hybrid system handles both simultaneously — finding AMLR Article 4(1)(b) by exact citation while also surfacing your previous CDD gap analysis even though it described "customer identification" rather than the regulation's exact language. Neither retrieval method alone achieves this. Together, they do.

---

## 17. Cross-Workflow Intelligence (5-Layer Funnel)

Most AI tools treat every session as isolated. ANTON **learns from all your work** and detects patterns across workflows.

### The Vision

Imagine you've run 50 gap analyses over 6 months across different clients. Each analysis identified gaps, recommended controls, and set priorities. But the insights stayed trapped in individual reports.

**What if the system could:**
- Extract every fact, insight, and recommendation into a searchable knowledge base
- Map all entities mentioned (clients, regulations, controls, risks)
- Detect patterns: "Control X always scores 'green' but Control Y always scores 'red' — why?"
- Alert you: "This client has the same gap as 3 other clients — there's a common industry issue"

**That's Cross-Workflow Intelligence.** It's the difference between a tool that helps you do individual tasks and a platform that builds organisational knowledge.

---

### The 5-Layer Funnel

#### Layer 1: Raw Workflow Outputs

**What:** Every session output stored persistently.

**Capture:** Full Markdown output, module used, timestamp, associated workflow (if part of multi-step process).

**Purpose:** Complete persistent record of all AI-generated work — nothing is ever lost.

---

#### Layer 2: Knowledge Atoms

**What:** Discrete units of knowledge extracted from outputs by AI-powered analysis.

**Examples:**
- **Fact:** "AMLR Article 4 requires risk assessment reviews annually"
- **Insight:** "Control TM-001 flagged false positives in 80% of test cases"
- **Conclusion:** "Client lacks documented risk appetite for sanctions exposure"
- **Recommendation:** "Implement quarterly control effectiveness reviews"
- **Risk:** "Lack of TM tuning may result in regulatory criticism"

**Extraction Method:**
- AI analyses each output, identifies discrete knowledge units
- Each atom categorised (fact, insight, conclusion, recommendation, risk, control, requirement, gap, decision)
- Confidence score (0-1) assigned
- Temporal validity tracked (permanent, date range, superseded)

**Storage:** `knowledge_atoms` table with source linkage via `atom_sources`

---

#### Layer 3: Knowledge Graph

**What:** Map all entities and their relationships across your entire body of work.

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

**Relationship Strength:** 1.0+ = confirmed (mentioned multiple times), 0.5-1.0 = weak/inferred

**Purpose:** Enable graph queries — "Show all controls that mitigate sanctions risks", "Which regulations reference client X?", "What controls are most frequently identified as gaps?"

---

#### Layer 4: Pattern Detection

**What:** Automated detection of cross-workflow patterns using five specialised detectors.

**The Five Detectors:**

| Detector | What It Finds | Example |
|----------|---------------|---------|
| **Temporal Correlation** | Events that co-occur in time | "Every BWRA session followed by TM rule update within 72 hours" |
| **Entity Convergence** | Entities mentioned together frequently | "Client X + Regulation Y + Control Z appear in 8 sessions" |
| **Cascade Detection** | Sequential patterns | "Gap analysis → Policy creation → Training material (in that order)" |
| **Trend Divergence** | Anomalous changes | "Sanctions queries up 300% this month vs. baseline" |
| **Gap Detection** | Missing coverage | "No sessions about crypto asset regulations in 90 days" |

**Severity Levels:** Critical (requires immediate action), Warning (should be addressed), Info (interesting trend), Positive (good practice detected)

**Resolution Workflow:** active → investigating → resolved/dismissed, with resolution notes captured.

---

#### Layer 5: Actionable Intelligence Dashboard

**What:** Surface insights to users through a unified dashboard.

**Widgets:**
1. **Recent Patterns** — Detected patterns with severity badges, click-through to evidence
2. **Entity Activity Heatmap** — Most frequently mentioned entities, trending entities
3. **Knowledge Growth Metrics** — Atoms extracted per day, patterns per week, graph density
4. **Insight Alerts** — Critical patterns, trend warnings, gap notifications

**Example Dashboard:**
```
┌────────────────────────────────────────────────────────────┐
│ Cross-Workflow Intelligence Dashboard                      │
├────────────────────────────────────────────────────────────┤
│ 📊 Last 30 Days                                            │
│   • 847 knowledge atoms extracted                          │
│   • 12 patterns detected (2 critical, 5 warning, 5 info)  │
│   • 156 entities tracked across 23 workflows               │
├────────────────────────────────────────────────────────────┤
│ 🚨 Critical Patterns                                       │
│   ⚠️ Temporal Correlation: Controls X & Y fail together    │
│       Observed in 8/10 audits → Investigate shared system  │
│   ⚠️ Trend Divergence: Quality scores declining            │
│       Q1: 8.2 → Q2: 7.8 → Q3: 7.1 → Review process       │
├────────────────────────────────────────────────────────────┤
│ 📈 Trending Entities                                       │
│   • "AMLR Article 4" ↑ 240% mentions this month           │
│   • "Control TM-001" ↓ 60% mentions (less frequent testing)│
│   • "Client Nordea" ↑ New client, 5 workflows this week   │
├────────────────────────────────────────────────────────────┤
│ 🔍 Knowledge Graph: 3,247 entities, 8,962 relationships   │
│   Top Connected: "AMLR Article 4" (89 relationships)       │
│   Most Active: "Control TM-001" (156 mentions)             │
└────────────────────────────────────────────────────────────┘
```

---

### Use Cases

**Quality Assurance:** Audit team discovers that 3 analysts systematically miss AMLR Article 12 — pattern detection catches the inconsistency, training materials updated.

**Risk Identification:** MLRO queries "which entities appear more frequently in STR workflows this quarter?" — Entity Convergence flags "Crypto Exchange X" in 70% of recent STRs (up from 10%).

**Efficiency Gains:** Consultant asks "have we analysed DORA compliance before?" — Knowledge graph shows 4 previous analyses, all identifying the same 3 gaps. Creates a "DORA Starter Pack" module.

**Regulatory Intelligence:** Compliance team queries "which controls are affected by AMLR updates?" — Knowledge graph shows 12 controls linked to AMLR Article 4, all requiring updates. Triggers automated remediation workflow.

---

## 18. Knowledge Graph & Entity Relationships

The knowledge graph is Layer 3 of Cross-Workflow Intelligence. It maps **who, what, and how** across all your work.

### Entity Types

ANTON automatically extracts and classifies 11 entity types:

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
| **organization** | "EBA", "FATF", "FIU Sweden" | Institutional relationship mapping |
| **process** | "Customer Onboarding", "SAR Filing" | Process flow analysis |
| **document** | "AML Policy v3.2", "Board Risk Report Q1" | Document lineage tracking |

### Entity Extraction Process

1. AI analyses every workflow output
2. Identifies mentioned entities and classifies by type
3. Extracts canonical name
4. Stores in `entity_nodes` table
5. Tracks interaction count (how often entity appears)
6. Detects aliases ("Nordea", "Nordea Bank Abp", "Nordea Finland") and consolidates

### Relationship Types

| Type | Meaning | Example |
|------|---------|---------|
| `implements` | Entity A implements Entity B | "Client Nordea **implements** Control TM-001" |
| `mitigates` | Control mitigates Risk | "Control TM-001 **mitigates** Risk R-003" |
| `requires` | Regulation requires Control | "AMLR Article 4 **requires** Control KYC-EDD" |
| `references` | Entity references Entity | "Risk R-003 **references** AMLR Article 7" |
| `conflicts_with` | Inconsistency detected | "Control TM-002 **conflicts_with** Control TM-001" |
| `depends_on` | Dependency | "Control KYC-Platform **depends_on** System CRM-DB" |
| `supersedes` | Replacement | "AMLR 2024/1624 **supersedes** 4AMLD" |

### Entity Consolidation

**Challenge:** Same entity mentioned with different names across sessions.

**Solution:** AI-powered alias detection with manual merge support. Merge log tracks all consolidations for audit purposes. Users can manually correct or split incorrectly merged entities.

---

## 19. Pattern Detection Engine

The pattern detection engine is Layer 4 of Cross-Workflow Intelligence. It runs five specialised detectors that identify meaningful patterns across your accumulated work — patterns that would be invisible in individual session outputs.

### Detector Configuration

Each detector has configurable parameters:
- **Sensitivity** (0.0-1.0): How aggressively to detect patterns
- **Threshold** (0.0-1.0): Confidence level required to trigger an alert
- **Lookback period**: How far back to search (default 30 days)
- **Schedule**: How often to run detection (manual trigger or automated)

### The Five Detectors — Detailed

**1. Temporal Correlation:** Detects events that co-occur across workflows. Identifies when activities in one domain consistently trigger or accompany activities in another. Example: "When Control X scores 'red', Control Y also scores 'red' in 85% of cases — investigate shared root cause."

**2. Entity Convergence:** Detects entities appearing together repeatedly in ways that suggest meaningful relationships not yet captured in the knowledge graph. Example: "Entity 'High-Risk Country Z' appears in 80% of STR workflows involving 'Wire Transfers' — consider enhanced monitoring."

**3. Cascade Detection:** Detects sequential patterns where one type of work consistently follows another. Example: "Gap analysis → Policy update → Training delivery occurs in that order 90% of the time — automate the cascade."

**4. Trend Divergence:** Detects anomalous changes over time by comparing current metrics against established baselines. Example: "Gap analysis quality scores declining for 3 consecutive quarters — investigate resource constraints or process drift."

**5. Gap Detection:** Detects missing coverage by identifying topics, regulations, or entities that should appear in your work but don't. Example: "40 gap analyses conducted, but only 2 mentioned 'Crypto Asset Risk' despite AMLR requirements — potential blind spot."

### Pattern Lifecycle

1. **Detection** → Pattern logged with evidence, severity, and confidence
2. **Alert** → User notified (in-app, dashboard)
3. **Investigation** → User reviews evidence, marks as investigating
4. **Resolution** → Pattern resolved (action taken) or dismissed (false positive)
5. **Learning** → Dismissed patterns improve future detection sensitivity

---

## 20. Institutional Memory Engine

The Institutional Memory Engine captures every decision you make and learns from it. This is what enables ANTON to build a working relationship with your organisation over time — not just remembering what you've done, but understanding how your team thinks about problems.

### The Problem

You run a gap analysis. ANTON recommends prioritising Control X as "high priority." You disagree based on organisational context and mark it "medium priority."

**Traditional AI tools:** Forget this immediately. Next gap analysis, they recommend the same thing.

**ANTON:** Remembers. Learns. Adapts.

### How It Works

**Step 1: Checkpoint Decisions.** Every workflow can have checkpoint steps where ANTON recommends an action and the human decides. The recommendation, the actual decision, the rationale, and the context are all captured.

**Step 2: Decision Logging.** Each decision is stored with full context — checkpoint type, ANTON's recommendation, human decision, rationale, module, client, regulation, and workflow step.

**Step 3: Similarity Matching.** When you reach a new checkpoint, ANTON searches for similar past decisions using a multi-factor matching algorithm (same module +0.3, same regulation +0.2, same control +0.3, same client +0.1, keyword overlap +0.1). Top 5 most similar past decisions are surfaced.

**Step 4: Historical Context Display.** Before you make a decision, you see how you've handled similar situations before — complete with the rationale you provided at the time. This promotes consistency across engagements and helps new team members learn from experienced ones.

**Step 5: Override Analysis.** ANTON tracks override patterns — how often humans disagree with its recommendations, and for which topics. Insights like "You override AI priority recommendations 40% of the time for Control TM-001, most commonly because of compensating controls" reveal where ANTON's prompts need improvement or where organisational risk appetite differs from strict regulatory interpretation.

**Step 6: Feedback Loop (Future).** Use override patterns to auto-adjust ANTON's recommendations — adaptive learning without retraining the model. "Based on past decisions, Control TM-001 is typically prioritised MEDIUM (not HIGH) when compensating controls exist."

### Use Cases

**Consistency Across Teams:** All analysts see how senior partners prioritised similar gaps. New analysts learn from experienced ones. Decision quality converges.

**Regulatory Defence:** When a regulator asks "Why did you prioritise Control X as MEDIUM?", you pull up the decision log — documented rationale, past decisions with same logic, defensible and consistent.

**Quality Improvement:** Override analysis reveals that AI doesn't detect compensating controls from uploaded policies → update module prompt → override rate drops from 60% to 20%.

### Privacy & Control

All decision logs stored locally in SQLite. No telemetry sent externally. Users can delete decision history per client/project for GDPR compliance. Data belongs to you.

---

---

## PART 5: QUALITY & LEARNING

*Part 5 covers the systems that ensure ANTON's output meets professional standards — and improves over time. The Quality Ratchet measures and manages output quality across six dimensions. The Apprentice Model tracks competence development through four stages. And the Output Versioning system ensures you never lose work and can always trace how a deliverable evolved. Together, these systems create the evidence base for trust described in Chapter 4 — concrete, measurable proof that ANTON's work meets your standards.*

---

## 21. Quality Ratchet & Continuous Improvement

The Quality Ratchet ensures that output quality **never regresses** and continuously improves over time.

### The Problem

AI output quality varies. Same module, same inputs, different day — different quality. Without measurement and enforcement, quality is inconsistent and can decline without anyone noticing. And in professional contexts, inconsistent quality is itself a quality problem — clients, regulators, and internal stakeholders expect reliability, not lottery.

### The Solution: Multi-Dimensional Scoring

Every output is automatically scored across **6 dimensions:**

| Dimension | What It Measures | Score Range |
|-----------|-----------------|-------------|
| **Completeness** | Coverage of required sections and topics | 0-100 |
| **Accuracy** | Factual correctness, citation quality | 0-100 |
| **Structure** | Logical flow, readability, formatting | 0-100 |
| **Actionability** | Clear recommendations, concrete next steps | 0-100 |
| **Citations** | Proper regulatory references, source quality | 0-100 |
| **Overall** | Weighted composite score | 0-100 |

### How the Ratchet Works

1. **First output:** Baseline established (e.g., Overall = 85)
2. **User iterates:** "Make this more concise" or "Add more detail on Article 12"
3. **Re-scored:** New version scored (e.g., Overall = 82)
4. **Alert triggered:** "⚠️ Quality dropped 3 points (85 → 82). Completeness decreased."
5. **User decides:** Accept the trade-off (conciseness may cost completeness) or regenerate

### Alert Types

- **`below_baseline`** — Current score below established baseline
- **`significant_drop`** — Drop of >5 points in any dimension
- **`persistent_low`** — 3+ consecutive outputs below baseline
- **`improvement`** — Positive alert when quality increases (reinforcement)

### Quality Over Time

The Quality Ratchet doesn't just measure individual outputs — it tracks trends. You can see:
- Quality scores per module over weeks and months
- Quality comparison across users (are all analysts meeting the same standard?)
- Quality by AI model (does Claude Opus consistently outscore Sonnet for this task?)
- Quality improvement rate (is the system getting better as institutional memory grows?)

This data is what transforms "I think ANTON produces good work" into "ANTON's average quality score for AML gap analyses is 91/100 over 47 sessions, with an improving trend of +2.3 points per quarter." The former is an opinion. The latter is evidence for a compliance committee.

### Minimum Thresholds

Organisations can set minimum quality thresholds per module:
- "No output below 80/100 overall for client deliverables"
- "Citations score must be 90+ for regulatory submissions"
- "Actionability must be 85+ for any consulting engagement output"

When an output falls below the threshold, the user is alerted before it can be exported or shared. This is preventive quality management — catching issues before they become problems.

---

## 22. Apprentice Model (4-Stage Learning)

The Apprentice Model tracks ANTON's competence development through four stages — specific to each module and each user's context. This isn't a global setting; it's a personalised trust relationship between you and ANTON for each type of work.

### The Four Stages

| Stage | ANTON's Behaviour | Human Role | Criteria to Advance |
|-------|-------------------|-----------|---------------------|
| **Observer** | Watches, suggests structure | Does all analysis | 10 sessions completed |
| **Guided** | Drafts outline, flags key areas | Reviews and directs | 15 successful outputs, <20% override rate |
| **Supervised** | Produces full analysis | Spot-checks, approves | 25 successful outputs, <10% override rate |
| **Autonomous** | Works independently | Reviews final output only | 50 successful outputs, <5% override rate |

### How Progression Works

Advancement is earned through demonstrated competence in your specific context — not in general, but with your data, your standards, your reviewers.

**Example: AMLR Gap Analysis Module**

- **Month 1 (Observer):** ANTON suggests "You should review Article 8, 13, 18" but the analyst does the analysis. Quality scores establish a baseline.
- **Month 3 (Guided):** After 10 sessions, ANTON drafts the gap matrix. Analyst reviews, adjusts priorities. Override rate is 18% — acceptable for advancement.
- **Month 6 (Supervised):** After 25 successful outputs with override rate below 10%, ANTON produces the full gap analysis report. Analyst spot-checks critical sections.
- **Month 12 (Autonomous):** After 50 successful outputs with override rate below 5%, ANTON works independently. Analyst reviews the final output before delivery.

### Confidence Tracking

Every output includes a confidence score (0.0-1.0) with reasoning. Low-confidence outputs automatically trigger additional review, regardless of the module's overall stage.

### Override Logging

When a human overrides ANTON's suggestion, the override is logged with context. Over time, override patterns reveal where ANTON needs better prompts, where organisational standards differ from ANTON's defaults, and where additional training data would be valuable.

### The Trust Connection

The Apprentice Model is the operational implementation of the trust philosophy described in Chapter 4. Trust isn't a binary setting — it's a spectrum that's earned through demonstrated performance. The four stages provide a structured, measurable path from "new hire" to "trusted colleague," with clear criteria at each step and full audit trail throughout.

---

## 23. Output Versioning & Diff Engine

### The Problem

Professional work is iterative. You don't produce a gap analysis in one pass — you draft, review, refine, review again, refine again. Each iteration needs to be tracked, comparable, and reversible. And when a client asks "what changed between version 2 and version 5?", you need to answer precisely.

### How It Works

1. **Initial output:** Version 1 created automatically
2. **User requests changes:** "Make section 3 more concise" or "Add regulatory citations to each finding"
3. **New output:** Version 2 created, linked to Version 1
4. **Diff computed:** Changed sections highlighted in a standard diff format
5. **User reviews:** Side-by-side comparison shows exactly what changed
6. **Revert option:** Any previous version can be restored with one click

### Diff Format

Diffs use standard markdown format with `+ added lines` and `- removed lines`. They're computed using standard diff algorithms and stored for fast retrieval — you don't have to wait for recomputation.

### Version History Timeline

Every session has a visual timeline showing all versions, with timestamps, the prompt that triggered each change, and quality scores for each version. You can see how quality evolved across iterations — did the changes improve or degrade the output?

### Audit Trail

Version history serves a dual purpose. For the user, it's a productivity feature — track changes, revert mistakes, compare iterations. For the organisation, it's an audit trail — demonstrating that deliverables went through a proper review and refinement process, with each change documented and traceable.

---

# PART 6: AUTOMATION & GOVERNANCE

*Professional work is defined not just by the quality of individual outputs, but by the systems that ensure deadlines are met, regulations are tracked, compliance rules are enforced, and teams collaborate effectively. ANTON's automation and governance capabilities transform ad hoc professional workflows into structured, auditable, repeatable processes — the kind of systematic discipline that separates professional-grade operations from good intentions.*

---

## §24. Time Intelligence & Regulatory Radar

Every professional working in a regulated environment knows the feeling: a consultation deadline surfaces unexpectedly, an implementation date approaches faster than anticipated, or a regulatory change slips through the cracks because nobody was watching the right publication feed that week. Time Intelligence is ANTON's answer to the chronic challenge of deadline management and regulatory awareness — not as a simple calendar, but as an intelligent system that understands dependencies, calculates buffer requirements, and actively monitors the regulatory landscape on your behalf.

### The Challenge

Compliance professionals juggle dozens of deadlines simultaneously — regulatory implementation dates (AMLR go-live: January 2027), consultation periods (AMLA RTS comments due), internal audit schedules (Q2 AML audit), recurring reporting obligations (annual MLRO report), and project milestones (TM system upgrade). Manual tracking through spreadsheets and calendar reminders is error-prone, lacks dependency awareness, and provides no early warning when cascading delays threaten final deadlines.

ANTON's Time Intelligence combines automated deadline tracking, dependency mapping, smart buffering, and a living regulatory radar into a single integrated system.

---

### Component 1: Deadline Tracking

**Deadline Storage**

The `deadlines` table stores comprehensive deadline metadata including name, deadline date, category, priority, status, and — critically — buffer calculations: `buffer_days`, `prep_days`, `review_days`, and `dependencies`.

**Categories** cover the full professional landscape: Regulatory (implementation dates, consultation closures), Audit (internal and external schedules), Reporting (recurring compliance reports), Project (implementation milestones), and Training (mandatory completion dates).

**Priority Levels** range from Critical (regulatory breach risk) through High (audit finding risk) and Medium (internal milestone) to Low (aspirational target).

**Status Tracking** follows a clear lifecycle: Upcoming (more than 30 days away), At Risk (less than 30 days and not started), In Progress (work underway), Overdue (past deadline), Completed, or Deferred.

---

#### Smart Buffering

The real value of Time Intelligence lies not in recording deadlines but in working backwards from them. For each deadline, ANTON calculates:

**Preparation Days:** How many days are needed to prepare before the deadline? For example, an AMLR implementation deadline of January 10, 2027 with 180 preparation days means work should begin by July 13, 2026.

**Review Days:** How many days are needed for review and approval before submission? An EBA consultation response with a deadline of March 15 and 10 review days means the draft must be submitted for internal review by March 5.

**Total Buffer:** The earliest start date equals the deadline minus preparation days minus review days. ANTON auto-calculates this and surfaces alerts: "You should start this work by [date]."

---

#### Dependency Mapping

Real-world deadlines rarely exist in isolation. ANTON models task dependencies where one task blocks another, creating cascading timelines:

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

When Task A is delayed by two weeks, all downstream tasks shift automatically — and ANTON triggers a risk alert if the final deadline becomes threatened.

---

#### Recurring Deadlines

Many professional obligations follow predictable rhythms: annual MLRO reports due January 31 every year, quarterly AML statistics to the board, monthly transaction monitoring reviews by the 5th. ANTON supports recurring deadline patterns and auto-generates the next occurrence when the current one is completed.

---

### Component 2: Living Regulatory Radar

While Time Intelligence manages known deadlines, the Regulatory Radar addresses the unknown — monitoring regulatory publications in real-time and surfacing what matters to your work.

#### How It Works

**Source Configuration:** The `radar_sources` table supports multiple feed types: RSS feeds, web page scraping, EUR-Lex API queries, and custom REST APIs. Five default sources are seeded out of the box: EBA News & Publications (RSS, every 6 hours), ESMA News (web scrape, daily), FATF Publications (web scrape, daily), EU AML/CFT via EUR-Lex (API, daily), and ECB Banking Supervision (RSS, every 6 hours). Users can add their own sources — national regulators, industry bodies, law firms — to create jurisdiction-specific monitoring.

**Automated Fetching:** A node-cron scheduler runs fetch jobs at configured intervals. RSS feeds are parsed via XML extraction; web pages are scraped via Cheerio HTML parsing; EUR-Lex items are queried by keyword; and custom APIs return JSON responses.

**AI-Powered Scoring:** Every fetched item is sent to the configured LLM for analysis across three dimensions (0-1 scale): Relevance (how relevant to the user's domain), Urgency (how soon must action be taken), and Impact (how significant is the change).

**Filtering & Lifecycle:** Only items exceeding the relevance threshold (default 0.5, customizable) are stored. Items then progress through a lifecycle: New (fetched, not reviewed), Reviewed (user opened), Actioned (user created task or deadline), Dismissed (not relevant), or Archived (auto-archived after 90 days).

---

### Use Cases

**Proactive Compliance:** An EBA consultation paper published on Friday afternoon is fetched by the Radar that evening, AI-scored at 92% relevance, and appears on Monday's dashboard as a high-priority item with 28 days until the deadline closes.

**Regulatory Change Tracking:** A compliance team configures EUR-Lex monitoring with keywords "AMLR, AMLA, 2024/1624" and a 70% relevance threshold. The system auto-captures final regulations, RTS, ITS, guidelines, and consultations.

**Multi-Jurisdiction Monitoring:** A Nordic bank operating across five countries adds custom sources for the Swedish FSA (Finansinspektionen), Finnish FSA (FIN-FSA), Norwegian FSA (Finanstilsynet), Danish FSA (Finanstilsynet), and Icelandic FSA (FME). The result is a unified regulatory feed across all jurisdictions.

---

## §25. Compliance-as-Code

Traditional compliance relies on manual checks — humans reviewing outputs against internal standards, inconsistently and slowly. Compliance-as-Code represents a fundamental shift: regulatory requirements and internal quality standards become executable rules that run automatically against every ANTON session. The result is consistent enforcement, immediate violation detection, and a defensible audit trail that demonstrates systematic compliance rather than ad hoc checking.

### How It Works

#### Rule Definition

Rules are stored in the `compliance_rules` table with a structured JSON format defining rule identity, category, severity, type, logic, and remediation actions.

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

#### Rule Types

ANTON supports four rule types: **Threshold Rules** compare field values against defined limits. **Pattern Rules** use regex matching on text content. **Composite Rules** combine multiple conditions with AND/OR logic. **Lookup Rules** validate against whitelists or blacklists.

#### Rule Execution

Rules execute at three checkpoints: **pre-execution** (before the API call), **post-execution** (after the output is received), and **on export** (before allowing export).

#### Violation Lifecycle

Violations progress through a clear lifecycle: Open (just detected), Remediated (user fixed the issue), Accepted Risk (user acknowledges with justification), or False Positive (rule triggered incorrectly, dismissed).

---

### Seeded Rules (8 Default Rules)

ANTON ships with eight pre-configured rules covering operational limits (token ceiling and session length), quality standards (no TODO markers, minimum quality scores), governance requirements (approved models only, transparency level for regulatory submissions), and data integrity (knowledge sources required for gap analyses, review cycles for high-risk outputs).

---

### Custom Rule Creation

Users define custom rules through the same JSON structure. A firm might create `FIRM_CITATION_001` requiring at least three instances of their specific citation format `[AMLR-2024-1624 Article X(Y)]` in all regulatory analyses, or `CLIENT_REVIEW_001` requiring partner sign-off on any deliverable exceeding 5,000 words.

---

## §26. Workflow Automation & Scheduling

Individual module executions produce valuable outputs. But real professional work involves sequences of related activities — an analysis leads to a review, which triggers a plan, which requires assignments and follow-ups. ANTON's workflow automation transforms these multi-step processes from manual coordination into structured, repeatable, schedulable workflows.

### What Is a Workflow?

A workflow is a sequence of steps that run automatically or semi-automatically, with each step's output available as input to subsequent steps. A typical AMLR implementation workflow might proceed: Gap Analysis (module execution) → Review Gap Analysis (human checkpoint) → Create Action Plan (module execution) → Assign Actions to Team (parallel assignments) → Schedule Follow-Up Review (deadline creation).

---

### Step Types

ANTON supports **12 step types** covering the full range of professional workflow needs:

**1. Module Execution** — Run any ANTON module with configurable inputs, model selection, thinking level, output formats, and knowledge sources.

**2. Checkpoint (Human Decision)** — Pause the workflow and require human input. The workflow pauses, the assignee is notified, they review the output and make their decision, the decision is logged to institutional memory, and the workflow continues.

**3. API Call** — Call external REST APIs: send outputs to a client portal, fetch client data from a CRM, or create a Jira ticket for a remediation action.

**4. Database Query** — Query internal or external databases using the connections framework.

**5. File Read** — Read files from the filesystem: template documents, regulation texts, or CSV data for knowledge source injection.

**6. File Write** — Write files to the filesystem: save outputs as PDF, export to network drives, or create backups.

**7. Script Execution** — Run Python, bash, R, PowerShell, or Node.js scripts with sandboxed execution.

**8. Email** — Send email notifications with configurable recipients, subject templates with variables, Markdown or HTML body, and file attachments from previous steps.

**9. Decision Gate (Branching)** — Conditional logic that routes the workflow based on data.

**10. Transform (Data Manipulation)** — Transform data between steps: extract findings from analysis output, convert tables to CSV, or aggregate scores.

**11. Loop** — Repeat steps for each item in a list.

**12. Parallel** — Execute multiple steps simultaneously.

---

### Workflow Scheduling

CRON-based scheduling automates recurring workflows. The `workflow_schedules` table stores CRON expressions (e.g., `0 9 * * 1` for every Monday at 9 AM) with use cases including weekly status reports, monthly compliance checks, and quarterly audit preparation.

---

## §27. Collaborative Canvas (Multi-Human Workflows)

Professional deliverables rarely emerge from a single person's work. A gap analysis might require an analyst to run the initial analysis, a senior analyst to review findings, legal counsel to verify compliance interpretation, and the MLRO to approve before client submission. The Collaborative Canvas brings this multi-stakeholder process into ANTON as a structured, trackable, auditable workflow.

### How It Works

#### Step Assignment

Workflow steps can be assigned to specific people via the `step_assignments` table, with fields for assignee, assignment date, due date, and status. Assignments progress through a lifecycle: Pending, In Progress, Completed, Overdue, or Reassigned.

#### Parallel Reviews

When a step requires multiple reviewers, the `parallel_reviews` table tracks each reviewer's status independently. Four consensus modes accommodate different governance requirements:

- **All must approve:** Every reviewer must approve before the workflow proceeds
- **Majority:** 51%+ approval is sufficient
- **Any approve:** A single approval unblocks the workflow
- **Advisory only:** Reviews are recorded but don't block progress

#### Canvas Comments

Threaded discussions on outputs enable structured feedback. Comment types include general Comments, Suggestions (proposed changes), Concerns (issues to address), and Approvals (explicit sign-offs).

---

### Example Workflow

**AMLR Gap Analysis — Client Submission:**

**Step 1: Initial Analysis** — Assigned to the analyst with a 3-day SLA. Completed in 2 days.

**Step 2: Parallel Review** — Three reviewers work simultaneously. The Senior Analyst approves. Legal Counsel approves with concerns ("GDPR interpretation needs citation, see comment #3"). The MLRO review is pending and 2 days overdue. Consensus mode requires all three, so the workflow is blocked until the MLRO reviews.

**Step 3: Address Feedback** — Reassigned to the original analyst to address legal counsel's citation concern.

**Step 4: Final Approval** — Assigned to the MLRO for final sign-off.

---

### Integration with Institutional Memory

Every checkpoint decision is logged to institutional memory: what was reviewed, who approved or rejected, their comments and rationale, and any override analysis. This means ANTON's institutional memory learns from team decisions, not just individual ones — building organisational knowledge over time.

---

# PART 7: AI-LED SOFTWARE DEVELOPMENT — NEW IN v3.0

*The gap between "I know what software I need" and "I have working software that serves its purpose" is where most AI coding tools operate — generating code fast from a brief. But speed from brief to code is not what makes software projects succeed. What makes them succeed is understanding the full stakeholder landscape, embedding domain expertise into requirements, planning releases that are manageable and reversible, and building governance that keeps large projects aligned with their goals over time. ANTON's Coding Area brings all 56 expert domains into the software development process, functioning not as a code generator but as a professional delivery partner.*

---

## §28. The Coding Area (4-Tier Architecture)

Most AI coding tools solve one problem: getting from a description to code as quickly as possible. Loveable generates web apps from prompts. Cursor makes experienced developers faster. GitHub Copilot auto-completes code in real-time. What none of them do is bring domain expertise, compliance awareness, multi-stakeholder governance, and structured project management into the coding process.

This is where ANTON's position as a multi-domain expert platform becomes a decisive advantage. The Coding Area is not a separate product bolted onto the side — it is a new capability area that inherits the entire platform's intelligence: all 56 expert area personas, all skills, all workflows, all quality scoring, all knowledge graph integration. When ANTON reviews code for a financial application, it brings the FCP specialist's eye for regulatory compliance, the cybersecurity analyst's threat awareness, and the data scientist's data governance perspective — automatically, as part of the standard review.

The Coding Area is structured as four distinct but connected capability tiers, each serving different user needs and different levels of complexity.

---

### Tier 1: Code Review & Explain

**Who it's for:** Product owners, project leads, business stakeholders, compliance officers, security teams — anyone who needs to understand what code does or whether it does it well, without necessarily being a developer themselves.

**What it does:** Users point ANTON at code — a single file, a directory, a repository URL — and choose what they want to understand. The explanation level ranges from "Explain Like I'm Five" through "Technical Deep Dive" to "Architecture Assessment". Users can also select review lenses: Business Logic, Security, Performance, Compliance, or Quality.

**The power of cross-area expertise:** When ANTON reviews a transaction monitoring system, it draws on the FCP area for regulatory compliance, the Cybersecurity area for vulnerability assessment, the Data & Analytics area for data handling patterns, and the Software Engineering area for code quality — all assembled automatically through the seven-layer prompt system with appropriate persona injection.

**Export/Import:** Review configurations can be exported as `.anton` review profile bundles and shared across teams, creating standardised code review baselines for an entire organisation.

---

### Tier 2: Script Lite

**Who it's for:** Analysts, compliance officers, researchers, consultants — people who work with data regularly but are not Python developers.

**What it does:** Script Lite closes the gap between "I know what I want to do with this data" and "I have a working script to do it." Through a guided conversation, the user describes their analytical task in plain language. ANTON asks clarifying questions and generates a complete, well-documented Python script.

**Supported tasks:** Data extraction and transformation, statistical analysis, machine learning (k-means clustering, random forest, PCA, anomaly detection), visualisation, and report generation.

**Key principle:** The goal is not to run the script for the user forever — it is to give them a working, understandable artifact they own and can reuse and adapt.

---

### Tier 3: Script Medium

**Who it's for:** Internal tool builders, data teams, small business operators — anyone who needs a functional application but doesn't have the resources for a full development project.

**What it does:** Script Medium generates complete, working applications: React dashboards for KPI monitoring, Python Flask APIs for data services, HTML data exploration tools, or standalone utilities.

**Live Preview:** For React and HTML outputs, ANTON provides a live preview panel using an embedded iframe. Users can see the application running with sample data and iterate with ANTON on design and functionality before finalising.

---

### Tier 4: Coding Large — Professional AI-Led Software Development

**Who it's for:** Product teams building internal tools, startups building their first product, compliance teams commissioning regulatory reporting systems.

**The core differentiator:** ANTON front-loads everything that makes real software projects succeed, because the cost of misalignment grows exponentially as a project progresses.

#### Phase 1: Discovery & Stakeholder Alignment

Before any code is planned, ANTON conducts a structured multi-turn discovery session that brings in the appropriate expert perspective for each dimension:

**Business & Product** (Product Manager + Strategy personas): What problem are we solving, for whom, and why now?

**Compliance & Regulatory** (FCP, Legal, Risk personas): Does this application handle personal data? Financial transactions? Health data? What regulatory reporting obligations apply?

**Technical** (Software Engineer, Solutions Architect, CTO personas): Frontend, backend, data storage requirements? Integrations? Performance expectations?

**Security** (Cybersecurity, Ethical Hacker personas): Authentication model? Data protection? Threat model?

#### Phase 2: Architecture Design & Expert Panel Review

ANTON generates architecture documentation based on the discovery findings, then automatically assembles an expert panel review. The panel catches compliance gaps, security vulnerabilities, and architectural weaknesses before a single line of code is written.

#### Phase 3: Release Planning & Milestone Management

Projects are broken into manageable releases, each with defined scope, acceptance criteria, and test plans. Releases link to ANTON's existing deadline and milestone tracking system.

#### Phase 4: Implementation & Goal Alignment

At each milestone, ANTON runs a Goal Alignment Check — a seven-layer module execution that takes the original discovery document and the current project state as inputs and produces a structured alignment report: green (on track), amber (worth discussing), red (drifted from goals).

**Blueprint Export:** A completed Coding Large project can be exported as a rich `.anton` blueprint containing the discovery framework, architecture decisions and rationale, release structure, test suite, task breakdown, and expert review records.

---

### Connecting Tiers

The four tiers form a progression path, but they are equally valuable independently. Each tier draws on the full platform — 56 expert areas, all personas, all skills, all workflows, all quality scoring — because the Coding Area is ANTON, not a separate product that happens to share a UI.

---

## §29. AI Code Instruction Builder

Beyond the four coding tiers, ANTON provides a capability that bridges the gap between ANTON's expert governance and external AI coding tools like Claude Code, Codex, or Mistral Code.

### The Problem

AI coding tools like Claude Code are powerful — they can generate, refactor, and debug code at remarkable speed. But they work from instructions, and the quality of the output is directly proportional to the quality of those instructions. A vague brief produces vague code. A comprehensive brief that includes stakeholder requirements, compliance constraints, architecture decisions, testing criteria, and governance checkpoints produces better code.

Writing that comprehensive brief is itself a professional skill that most non-technical stakeholders lack.

### The Solution

The AI Code Instruction Builder uses ANTON's guided discovery process — the same multi-turn, expert-informed conversation used in Coding Large — to produce a comprehensive markdown instruction file optimised for the user's chosen AI coding tool. The user selects their preferred tool (Claude Code, Codex, or Mistral Code), goes through the guided discovery, and ANTON generates an instruction file that includes project context, stakeholder requirements, compliance constraints, architecture decisions, implementation priorities, acceptance criteria, and testing requirements.

Before export, the instruction file goes through ANTON's expert panel review.

### Project Alignment Reviewer

The companion capability to the Instruction Builder is the Project Alignment Reviewer, which works in the opposite direction — ingesting an existing codebase and comparing it against stated goals and visions. Feed it a repository and a project brief, and ANTON produces a structured alignment assessment: which goals are fully met, partially met, or drifted from, with specific steering instructions to bring the project back on track.

Together, the Instruction Builder and Alignment Reviewer create a continuous governance loop where ANTON serves as the senior architect and project governance intelligence while external coding tools handle the actual development work.

---

# PART 8: EXTERNAL DATA & DISCOVERY — NEW IN v3.0

*The most powerful AI analysis in the world is only as valuable as the data it can access and the questions it knows to ask. ANTON v3.0 introduces two capabilities that dramatically expand both dimensions: an External Data Integration Framework that connects ANTON to live databases, APIs, and MCP services, and Discovery Mode that ensures the right questions are asked before any analysis begins.*

---

## §30. External Data Integration Framework

ANTON's original knowledge source system provided four modes: Claude's built-in knowledge with web search, online reference links, local file folders, and combined mode. These remain powerful for document-centric analysis. But professional work increasingly requires integration with live data — querying a client database for transaction patterns, pulling real-time risk scores from an API, or connecting to enterprise systems via standardised protocols.

The External Data Integration Framework extends ANTON's reach beyond documents into the world of live, structured data.

### Supported Data Sources

ANTON supports six categories of external data connections:

**PostgreSQL** — The industry-standard relational database for enterprise applications. ANTON can query PostgreSQL databases to pull client data, transaction records, compliance metrics, or any structured data needed for analysis.

**MySQL** — Widely deployed in web applications and mid-market systems. Full query support with the same configuration and security model as PostgreSQL.

**MSSQL (Microsoft SQL Server)** — Common in enterprise Windows environments, particularly in financial services.

**MongoDB** — Document-oriented database popular for flexible schema requirements. ANTON can query MongoDB collections using the native query syntax.

**REST APIs** — Connect to any HTTP API: internal microservices, third-party data providers, regulatory databases, or SaaS platforms.

**MCP (Model Context Protocol)** — Anthropic's open protocol for connecting AI models to external tools and data sources. ANTON can function as both an MCP client (consuming tools exposed by MCP servers) and an MCP server (exposing ANTON's modules as tools to other AI interfaces like Claude Desktop).

---

### Connection Management

All external connections are managed through ANTON's connections framework, which provides:

**Secure Credential Storage:** Database credentials and API keys are stored with encryption at rest, never included in prompts or logs.

**Connection Testing:** Before any connection is used in production, ANTON tests connectivity, validates credentials, and confirms access permissions.

**Query Sandboxing:** All database queries execute through parameterized statements only — no string concatenation, no injection risk. Read-only access is the default.

**Audit Logging:** Every external data access is logged to the `connection_audit_log` table.

---

### Use Case: Live Data Gap Analysis

**Scenario:** A compliance team needs to assess their AMLR data readiness — not against documentation, but against actual data.

**With ANTON External Data Integration:**
1. Configure a read-only connection to the client's CDD database
2. Run the "Data Readiness Assessment" module with the database connection as a knowledge source
3. ANTON queries the database to understand: which data fields exist, what percentage are populated, what data types and formats are used, which fields map to AMLR data point requirements
4. The module produces a data readiness scorecard grounded in actual data — not estimates or documentation that may be outdated

**Result:** Analysis based on reality rather than assumptions, completed in minutes rather than weeks.

---

## §31. Discovery Mode

The best analysis in the world is wasted if it answers the wrong question. In consulting, the most critical phase of any engagement is discovery — understanding what the client actually needs, not just what they say they need.

Discovery Mode brings this professional discipline into ANTON through two complementary formats: physical paper workshops and digital guided conversations.

### Paper Workshop Framework

**What it is:** A structured workshop format designed for in-person or hybrid sessions where a facilitator guides a group through a discovery process using ANTON-generated materials.

**How it works:** The facilitator selects a Discovery Workshop template. ANTON generates a complete workshop package including pre-workshop materials, a facilitator's guide, working templates, and post-workshop processing instructions.

**Example:** An AMLR readiness workshop might include a maturity self-assessment (participants score their organisation across 12 dimensions), a capability assessment, a priority mapping exercise, and a constraints discussion.

---

### Digital Guided Conversation

**What it is:** An AI-led discovery session within ANTON that replaces (or supplements) the physical workshop with a structured multi-turn conversation.

**How it works:** ANTON conducts a guided interview, asking questions across multiple dimensions and bringing in appropriate expert perspectives for each. The conversation follows a deliberate structure — starting broad (context, goals, constraints) and narrowing progressively (specific requirements, priorities, trade-offs) — but adapts based on the user's responses.

**Expert perspective injection:** During a compliance assessment discovery, ANTON doesn't just ask compliance questions — it brings in the regulatory perspective, the technology perspective, the data perspective, the project management perspective, and the governance perspective.

**Adaptive questioning:** Unlike a static questionnaire, the guided conversation adapts based on previous answers. If a participant indicates they have no transaction monitoring system, ANTON doesn't ask about TM scenario tuning — it pivots to system selection and implementation planning.

**Output:** The guided conversation produces a structured discovery document which feeds directly into ANTON's analytical modules.

---

### Connecting Discovery to Action

The real power of Discovery Mode is what happens after the discovery. The structured discovery document becomes a knowledge source that enriches every subsequent analysis:

**Direct module feeding:** "Run AMLR Gap Analysis using the discovery document as primary context."

**Workflow triggering:** A discovery session can automatically trigger a pre-configured workflow: Discovery → Gap Analysis → Action Plan → Team Assignment → Deadline Creation.

**Cross-session intelligence:** Discovery findings are extracted as knowledge atoms and added to ANTON's knowledge graph.

---

### Why Both Formats Matter

Paper workshops and digital conversations serve different needs and contexts. A paper workshop works best for large groups, complex topics requiring diverse perspectives, and situations where relationship building and alignment are as important as information gathering. Digital guided conversations work best for individual or small-team assessments, follow-up sessions, and situations where participants are distributed across locations.

---

# PART 9: THE EXPERT AREAS

*Every module in openEXPERT exists because someone with real professional experience identified a specific task that follows established frameworks, requires domain knowledge, and produces output that professionals need. The 485 modules across 56 domains represent codified professional expertise — not generic AI prompts, but structured methodologies that reflect how experienced practitioners actually approach their work.*

---

## §32. Expert Areas Overview (56 → Expanding)

openEXPERT covers **56 expert domains** with **485 pre-configured modules** — the result of sustained development and community contribution, spanning professional services, enterprise operations, creative industries, personal use, and social impact contexts worldwide.

### The Full Landscape

**Core Professional Services (Areas 1–12):**

| # | Area | Modules | Primary Users |
|---|------|---------|---------------|
| 1 | Financial Crime Prevention (FCP) | 33 | Banks, FIs, consultants |
| 2 | Legal & Regulatory | 14 | Legal counsel, compliance |
| 3 | Audit & Assurance | 13 | Internal/external auditors |
| 4 | Consulting & Client Services | 10 | Consultants, advisors |
| 5 | Banking & Finance | 10 | Banks, FIs |
| 6 | Risk Management | 5 | CROs, risk managers |
| 7 | Data & Analytics | 4 | Data teams, analysts |
| 8 | ESG & Sustainability | 10 | ESG officers, sustainability teams |
| 9 | Cybersecurity | 11 | CISOs, IT security |
| 10 | Investment & Asset Management | 10 | Asset managers, investors |
| 11 | Private Equity & Venture Capital | 12 | PE/VC funds, deal teams |
| 12 | Islamic Finance | 10 | Sharia-compliant financial institutions |

**Business & Enterprise Operations (Areas 13–25):**

| # | Area | Modules | Primary Users |
|---|------|---------|---------------|
| 13 | Project Management | 16 | PMs, delivery teams |
| 14 | Strategy & Planning | 9 | Executives, strategy teams |
| 15 | Operations & Process | 5 | Ops managers, process teams |
| 16 | HR & People | 13 | HR teams, people managers |
| 17 | Software Engineering | 13 | Developers, tech leads |
| 18 | Accounting & Finance | 16 | Accountants, CFOs |
| 19 | Insurance & Actuarial | 9 | Insurers, actuaries |
| 20 | Communication & PR | 10 | Comms teams, PR professionals |
| 21 | Sales & Revenue | 12 | Sales teams, revenue operations |
| 22 | Marketing | 8 | Marketing teams, growth professionals |
| 23 | Branding & Creative | 5 | Marketing, creative teams |
| 24 | Product Management | 6 | Product managers, owners |
| 25 | Tax & Transfer Pricing | 8 | Tax advisors, international finance |

**Knowledge, Education & Creative (Areas 26–31):**

| # | Area | Modules | Primary Users |
|---|------|---------|---------------|
| 26 | Academic Research | 5 | Researchers, academics |
| 27 | Education & Teaching | 5 | Educators, instructors |
| 28 | Journalism & Media | 5 | Journalists, content creators |
| 29 | Creative Production | 8 | Writers, translators, storytellers |
| 30 | Design | 5 | Designers, UX and product teams |
| 31 | Data Privacy | 6 | DPOs, privacy officers, GDPR teams |

**Personal & Consumer (Areas 32–37):**

| # | Area | Modules | Primary Users |
|---|------|---------|---------------|
| 32 | Personal Development | 5 | Individuals, career changers |
| 33 | Consumer Legal | 5 | Individuals, legal aid organisations |
| 34 | Personal Finance | 5 | Individuals, financial advisors |
| 35 | Real Estate & Property | 5 | Property professionals |
| 36 | Startups & Entrepreneurship | 5 | Founders, entrepreneurs |
| 37 | Trades & Skilled Services | 5 | Tradespeople, service businesses |

**Emerging Markets & Social Impact (Areas 38–56):**

| # | Area | Modules | Primary Users |
|---|------|---------|---------------|
| 38 | Healthcare Professional | 14 | Clinicians, practitioners |
| 39 | Community Health | 8 | Community health workers, CHWs |
| 40 | Manufacturing & Operations | 5 | Manufacturers, ops teams |
| 41 | Procurement & Supply Chain | 5 | Procurement teams |
| 42 | Nonprofit & Social Impact | 4 | Nonprofits, social enterprises |
| 43 | Public Sector & Government | 6 | Civil servants, policy makers |
| 44 | Smallholder Farming | 8 | Farmers, agribusiness |
| 45 | Livestock & Poultry | 8 | Livestock farmers, veterinary extension |
| 46 | Food Business | 8 | Food producers, restaurateurs |
| 47 | Artisan & Craft | 8 | Artisans, craft businesses |
| 48 | Mobile Money & Digital Finance | 7 | Telcos, fintechs, mobile network operators |
| 49 | Microfinance | 6 | MFIs, development finance institutions |
| 50 | Consumer Protection | 8 | Consumer advocates, regulators |
| 51 | Workers' Rights | 8 | Labour unions, HR teams, workers |
| 52 | Land Rights | 8 | Land registrars, communities, NGOs |
| 53 | Education & Literacy | 8 | Literacy workers, adult education |
| 54 | Personal Finance (Base of Pyramid) | 8 | Low-income individuals, financial coaches |
| 55 | Credit Navigator | 8 | Microenterprise credit seekers |
| 56 | Islamic Microfinance | 10 | Islamic MFIs, sharia-compliant development finance |

**Total: 485 modules across 56 expert domains**

---

### A Note on Growth

The expansion areas planned in earlier versions of this whitepaper have been delivered — including Islamic Finance, Mobile Money & Digital Finance, Agriculture & Farming, Tax Advisory, Marketing, Sales, and Government & Public Sector. openEXPERT's community contribution model continues to add new areas as domain experts worldwide contribute their expertise. The `.anton` package format (see §3.8) makes it straightforward for any practitioner to create and share a new module or area without a software development background.

---

### Module Structure (Consistent Across All Areas)

Every ANTON module follows the same structural pattern, ensuring consistency regardless of domain:

**Module Configuration** (`module.json`): Defines the module's identity (ID, label, description, icon, colour), defaults (thinking level, creativity mode, output formats, knowledge source configuration), and guided inputs (structured fields that help users provide the right context without needing to write prompts).

```json
{
  "id": "amlr-gap-analysis",
  "label": "AMLR Gap Analysis",
  "shortLabel": "AMLR Gap",
  "icon": "CheckSquare",
  "description": "Systematic comparison of current AML/CFT framework against EU AMLR 2024/1624 requirements",
  "defaults": {
    "thinking": "investigate",
    "creativity": "strict",
    "outputFormats": ["executive-summary", "gap-scoring-matrix", "action-plan"],
    "knowledgeSources": {
      "claudeKnowledge": {"enabled": true, "webSearchEnabled": true},
      "localFolder": {"enabled": false}
    }
  },
  "guidedInputs": [
    {"id": "entity_type", "label": "Entity Type", "type": "select", "options": ["Bank", "Payment Institution", "E-Money Institution", "Investment Firm", "Crypto Asset Service Provider"], "required": true},
    {"id": "jurisdiction", "label": "Primary Jurisdiction", "type": "select", "options": ["Sweden", "Finland", "Denmark", "Norway", "Iceland", "Other EU"], "required": true},
    {"id": "focus_areas", "label": "Focus Areas", "type": "multiselect", "options": ["Customer Due Diligence", "Transaction Monitoring", "Sanctions Screening", "SAR/STR Reporting", "Data Management", "Governance & Controls"], "required": false}
  ]
}
```

**System Prompt** (`system-prompt.md`): The heart of the module — a detailed task definition with objectives, step-by-step methodology, output structure template, quality criteria, and common pitfalls to avoid.

**Area Context** (shared across modules in the same area): Domain background, key regulations and frameworks, common methodologies, and the stakeholder landscape.

### Cross-Area Module Linking

Modules reference related modules in other areas, creating natural discovery paths. An AMLR Gap Analysis (Area 1: FCP) points users toward Regulatory Interpretation (Area 2: Legal), Audit Planning (Area 3: Audit), Data Readiness Assessment (Area 7: Data), and Implementation Project Plan (Area 13: Project Management) — enabling multi-area workflows that address complex professional challenges holistically.

---

## §33. Flagship Area: Financial Crime Prevention

Area 1 — Financial Crime Prevention — is openEXPERT's most comprehensive domain, with 33 modules covering the full AML/CFT lifecycle. This area reflects the platform's origins: 14+ years of banking and regulatory consulting experience at institutions including SEB, Sveriges Riksbank, EY, and Advisense, codified into expert AI modules.

### The 33 FCP Modules

**Core Compliance (5 modules):** AMLR Gap Analysis (systematic comparison against EU AMLR 2024/1624 with investigate-level thinking), Business-Wide Risk Assessment (ML/TF risk assessment with inherent-to-residual scoring), Sanctions Compliance Assessment (screening effectiveness and program maturity), KYC/CDD Framework Review (due diligence process assessment), and Transaction Monitoring Assessment (TM system effectiveness with scenario review and tuning recommendations).

**Document Creation (4 modules):** AML Policy Writer (board-ready policy documents), Procedure Builder (step-by-step operational procedures), Board Report Generator (quarterly/annual MLRO reports with KPIs and trends), and Training Content Creator (materials tailored to 8 audience levels from board to front-line).

**Operational Support (5 modules):** Regulatory Change Scanner (monitor and interpret changes, integrated with Regulatory Radar), STR/SAR Review Assistant (structured suspicious activity reports with evidence checklists), Investigation Support (complex AML investigation plans with evidence matrices), Peer Benchmarking (compare practices against industry peers), and Control Testing Framework (design and execute AML control tests).

**Consulting & Engagement (5 modules):** Engagement Proposal Builder (client proposals with approach, scope, and pricing), Engagement Delivery Planner (project plans with phases, RACI, and milestones), Management Presentation Generator (steering committee slides with key messages and speaker notes), Stakeholder Interview Planner (interview guides by stakeholder type), and Regulatory Submission Reviewer (pre-submission quality assurance).

**Data & Implementation (4 modules):** Data Readiness Assessment (AMLR data point readiness scorecards), Data Quality Checker (CDD/TM data quality with remediation plans), System Requirements Documenter (functional and technical specifications for AML systems), and Vendor Assessment Framework (technology vendor evaluation with comparison matrices).

**Additional Modules (10 modules):** Further specialist modules covering sanctions advisory, BWRA methodology, correspondent banking risk, crypto asset compliance, financial intelligence analysis, PEP management, adverse media screening, outsourcing risk, payment monitoring, and de-risking analysis — reflecting the breadth of the FCP domain and the depth of practitioner input.

### FCP Module Usage Patterns

The FCP modules form natural cascades. A typical implementation engagement flows: Gap Analysis → Data Readiness Assessment → System Requirements → Vendor Assessment → Implementation Project Plan (Area 13) → Policy Writer → Procedure Builder → Training Content Creator → Board Report Generator. Each module's output feeds the next, building institutional knowledge throughout.

---

## §34. Cross-Area Use Cases

ANTON's real power emerges when modules from multiple areas combine to address complex professional challenges that no single domain can solve alone.

### Use Case 1: AMLR Implementation (6 Areas, 15+ Modules)

A bank must implement AMLR by January 2027. The workflow spans assessment (FCP: Gap Analysis + Data Readiness), planning (Project Management: Implementation Plan + Resource Planning + RAID Log), legal review (Legal: Regulatory Interpretation + Contract Review), data and technology (Data: Governance Framework + Quality Assessment), policy and procedures (FCP: Policy Writer + Procedure Builder), training (FCP + Education: Training Creator + Assessment Builder), and validation (Audit: Planning + Control Testing). Result: 15+ modules across 6 areas, orchestrated via ANTON workflows with dependency management and milestone tracking.

### Use Case 2: Startup Launch (7 Areas, 18+ Modules)

A fintech founder goes from idea to Series A readiness through: foundation (Startups: Business Plan + Pitch Deck + Funding Strategy), legal setup (Legal: Company Formation + Shareholder Agreement + Regulatory Scan), product development (Software Engineering: Technical Spec + Architecture Review), compliance (FCP + Cybersecurity: AML Framework + GDPR Compliance), go-to-market (Branding + Communication: Brand Strategy + Content Strategy + Sales Strategy), operations (HR + Accounting: Hiring Plan + Financial Planning), and fundraising (Startups: Due Diligence Prep + Pitch Practice).

### Use Case 3: Consulting Engagement (5 Areas)

A Big 4 firm delivering a regulatory change project uses ANTON across sales (Consulting: Proposal Builder + Stakeholder Mapping), kickoff (Project Management: Charter + Communication Plan), analysis (FCP + Legal: Gap Analysis + Regulatory Interpretation), design (Risk + Data: Assessment + Strategy), implementation (Project Management + Operations: Roadmap + Change Management), and reporting (Consulting + Communication: Management Presentation + Final Report). Result: consistent quality, accelerated delivery, and knowledge capture across every engagement.

### Use Case 4: ESG Reporting (4 Areas)

A corporation preparing its first CSRD report works through scoping (ESG: Compliance Assessment + Double Materiality), data collection (Data + Accounting: Readiness Scorecard + Carbon Accounting), supply chain (Procurement + ESG: Sustainability Assessment + Sourcing Strategy), and reporting (Communication + Accounting: Sustainability Report + Integrated Reporting). Result: CSRD-compliant report with a data foundation for future years.

### Use Case 5: Personal Career Pivot (3 Areas)

A mid-career banking professional transitioning to consulting uses self-assessment (Personal Development: Career Strategy + Skills Gap Analysis), learning (Academic + Education: Learning Path Designer + Research Methodology), job search (Personal Development: CV Builder + Cover Letter Writer + Interview Preparation + Salary Negotiation), and networking (Communication: Personal Brand Strategy + Networking Strategy). Result: a structured career transition supported by professional-grade tools that would normally require a career coach.

---

### Use Case 6: Investment Due Diligence (4 Areas, 10+ Modules)

A PE fund evaluating a fintech acquisition works through: target screening and initial assessment (PE/VC: Deal Screening + Market Intelligence), deep due diligence (PE/VC: Due Diligence + Financial Analysis + Valuation Framework), compliance review (FCP: AML Framework Review + Sanctions Assessment), legal analysis (Legal: Contract Review + Regulatory Scan), and investment committee preparation (PE/VC: IC Memo + Deal Structure). The IC Memo module produces an investment committee memorandum in standard PE format — deal thesis, financial model summary, risk factors, management assessment, and recommendation — structured so committee members can review the critical information in fifteen minutes before the meeting. Result: a complete deal package produced in hours rather than days, with consistent structure across every transaction regardless of which team member led the analysis.

---

### Use Case 7: NGO Programme Delivery (5 Areas, 12+ Modules)

A community development organisation working in rural East Africa coordinates: community health assessment (Community Health: Symptom Assessment + Maternal-Child Health), livelihoods support (Smallholder Farming: Crop Planning Advisor + Soil Health Assessment), rights and protection (Land Rights + Consumer Protection: Rights documentation), financial inclusion (Microfinance + Mobile Money: Digital Finance Guidance), and donor reporting (Communication + Nonprofit: Impact Assessment + Stakeholder Report). All modules calibrated for low-resource operating contexts — outputs appropriate for community health workers without clinical training, farmers without formal education, and field officers covering wide geographic areas. Result: a structured programme delivery framework built from professional-grade tools, available to an organisation that could not otherwise afford specialist consultants in five different domains simultaneously.

---

### Cross-Area Workflow Automation

Users can create workflows spanning multiple areas and schedule them for recurring execution. A Quarterly Compliance Cycle workflow might run: Gap Analysis (FCP) → Risk Assessment (Risk) → Control Testing (Audit) → Board Report (FCP) → Management Presentation (Communication), scheduled to auto-run every January, April, July, and October.

### Knowledge Graph Across Areas

Cross-area entity relationships create powerful organisational intelligence. A knowledge graph might trace: Regulation AMLR Article 4 → requires → Control KYC-CDD-Enhanced → tested by → Q2 AML Audit → uses data from → CRM Database → managed by → Data Governance Process. This reveals how regulatory requirements flow through the organisation across domains — insight that no single-area analysis can provide.

---

# PART 10: SECURITY, PRIVACY & DEPLOYMENT

*Professional AI platforms handling regulated data must meet the same security standards as the institutions they serve. ANTON implements enterprise-grade security with multiple layers of protection — authentication, authorization, rate limiting, audit trails, sandboxing, and compliance enforcement — all designed to satisfy the expectations of CISOs, regulators, and internal audit teams in financial services and beyond.*

---

## §35. Security Architecture

ANTON's security architecture follows defence-in-depth principles, addressing the OWASP Top 10 vulnerabilities and implementing controls appropriate for deployment in regulated industries.

### Multi-User Authentication & Authorization

**Role-Based Access Control (RBAC):**

ANTON implements three principal roles, each with granular permissions across 24 capabilities:

**Admin** — Full platform access including user management, system settings, compliance rule configuration, budget controls, and all operational data.

**Analyst** — Module execution, session management, workflow creation, knowledge source access, and export capabilities. Analysts can create and share custom modules, build workflows, and access the intelligence dashboard.

**User** — View-only or restricted module access. Users can execute pre-approved modules, view their own session history, and export their own outputs.

**Authentication mechanisms:**

*Local accounts:* Username and password authentication with bcrypt hashing (cost factor 12). Password complexity requirements enforced (minimum 12 characters, mixed case, numeric, special characters).

*OAuth/SSO:* Google and GitHub OAuth integration (optional, configurable).

*Enterprise SSO:* SAML 2.0 and OpenID Connect integration (planned) for corporate identity systems (Azure AD, Okta, Auth0).

**Session management:**

JWT tokens stored in secure, httpOnly cookies with SameSite=Strict policy. Token expiration is configurable (default: 24 hours). Auto-logout on inactivity (configurable, default: 2 hours).

---

### Brute Force Protection (OWASP A07)

All login attempts (successful and failed) are recorded. After 5 failed attempts within a 15-minute window, the account is locked. Admin notification is triggered on suspicious activity patterns. Accounts auto-unlock after 30 minutes, or an administrator can manually unlock them.

---

### Rate Limiting (DDoS Protection)

**Per-IP limits:** API calls are capped at 100 requests per 15-minute window. Login attempts are limited to 10 per 15-minute window.

**Per-user limits:** Module executions are capped at 50 per hour. Export operations are limited to 20 per hour.

---

### Budget Management & Enforcement

**Per-user monthly quotas** are tracked with enforcement thresholds: At 80% of budget: Warning notification. At 100% of budget: Further API calls are blocked until the next billing period or admin override.

---

### Security Event Logging (OWASP A09)

ANTON logs seven categories of security events: `failed_login`, `unauthorized_access`, `budget_exceeded`, `rate_limit`, `suspicious_activity`, `invalid_input`, `ssrf_attempt`.

**Severity framework:** *Critical:* SSRF attempts, SQL injection attempts, path traversal attacks. *High:* Unauthorised access, repeated failed authentication. *Medium:* Failed logins, rate limit hits, budget threshold notifications. *Low:* Informational patterns.

---

### Script Execution Sandboxing

When ANTON executes user-provided or AI-generated scripts through the Coding Area or workflow steps, strict sandboxing controls apply: memory capped at 512 MB, runtime limited to 60 seconds, network access configurable per-script (default deny), filesystem access restricted to designated temporary directories.

---

### Input Validation & Sanitisation

All user inputs are validated and sanitised: file uploads (type whitelist, 50 MB limit, magic bytes verification), URLs (HTTPS only, SSRF protection), database queries (parameterized only), file paths (path traversal protection).

**OWASP Top 10 coverage:** A01 (RBAC), A02 (bcrypt, JWT, HTTPS), A03 (parameterized SQL, input sanitisation), A04 (secure-by-default), A05 (Helmet middleware), A06 (pnpm audit), A07 (account lockout, session management), A09 (comprehensive logging), A10 (URL whitelist, private IP blocking).

---

### Audit Trail

Every action in ANTON is logged for accountability and reproducibility. **Retention:** Configurable (default: 2 years). **Export:** CSV and XLSX formats for regulators, internal audit teams, or external auditors.

---

## §36. Privacy & Data Safety

### Local-First Architecture

ANTON's architecture ensures that data stays under the user's control.

**What stays local:** All documents and uploaded files. All session history, messages, and outputs. Knowledge graph entities, atoms, and relationships. User profiles, preferences, and role assignments. Audit logs and security events. Workflow definitions, execution logs, and checkpoint decisions. Compliance rules and violation records. All custom modules, skills, and area configurations.

**What leaves your environment:** Prompts and messages sent to external LLM APIs when using cloud-hosted models. Web search queries (when enabled). URL fetching requests (when configured).

**What never leaves your environment:** No telemetry data. No analytics or tracking. No usage data sent to ANTON, FutureChain, or any third party. No "phone home" functionality of any kind.

---

### LLM Provider Data Policies

**Anthropic Claude:** API requests are processed but not used for model training (per Anthropic's commercial API terms). This is ANTON's recommended provider for professional work.

**OpenAI GPT:** API requests are not used for model training under commercial API terms.

**Mistral:** API requests are processed but not used for training. EU-based provider (Paris headquarters), which may satisfy EU data residency requirements.

**Local Ollama:** Maximum privacy — nothing leaves your network. All inference runs on local hardware. Zero external API calls.

---

### GDPR Support

ANTON's architecture supports GDPR compliance across the relevant articles: Article 5 (data minimisation), Article 15 (right of access — full data export available), Article 17 (right to erasure — cascading deletes), Article 25 (privacy by design — local-first architecture), Article 32 (security of processing — encryption, RBAC, audit logging).

---

### Multi-User Data Isolation

In multi-user deployments, ANTON enforces strict data isolation: each user's sessions are private, project sharing requires explicit membership, and permission checks are enforced on every session access.

---

## §37. Deployment Models

ANTON supports five deployment models, from a consultant's laptop to an air-gapped government network.

### 1. Local Desktop (Default)

**Who:** Individual consultants, researchers, students, small teams.

**Setup:**
```bash
git clone https://github.com/futurechain/anton
cd anton
pnpm install
cp .env.example .env
pnpm run db:init
pnpm run dev
```

**Access:** `http://localhost:3000`

**Advantages:** Complete data control. No server infrastructure required. Free (except API costs). Up and running in 10-15 minutes.

---

### 2. Docker Container

**Who:** Technical users, IT teams wanting consistent reproducible deployment.

**Setup:**
```bash
docker compose up
```

**Advantages:** Consistent environment across machines. Easy updates. Isolated from host system. Portable across any Docker-capable infrastructure.

---

### 3. Server Deployment (Multi-User)

**Who:** Consulting firms, enterprise teams (10-100 users).

**Advantages:** Multi-user access with RBAC. Remote access via company network or VPN. Centralised data (easier backups, compliance). Shared knowledge graph across users.

---

### 4. Cloud Deployment (Scalable)

**Who:** Large enterprises, organisations with 100+ users.

**Supported:** AWS (EC2 + RDS + S3 + ALB), Azure (App Service + PostgreSQL + Blob Storage), Google Cloud (Cloud Run + Cloud SQL + Cloud Storage).

**Advantages:** Highly scalable (1,000+ users). Built-in backups, redundancy, and disaster recovery.

---

### 5. Air-Gapped Deployment (Maximum Security)

**Who:** Government agencies, defence organisations, highly regulated industries with data classification requirements.

**Setup:** Deploy on internal network with no internet access. Use local Ollama models (no external API calls). Disable web search and online reference link features.

**Advantages:** Complete data isolation — nothing enters or leaves the network. No dependency on external services. Satisfies the strictest data sovereignty and classification requirements.

---

### Deployment Decision Matrix

| Need | Recommended Deployment |
|------|------------------------|
| Individual consultant | Local Desktop |
| Small team (2-5 users) | Docker on shared machine |
| Consulting firm (10-50 users) | Server Deployment |
| Large enterprise (100+ users) | Cloud Deployment |
| Regulated or classified environment | Air-Gapped with Ollama |

The deployment model is a configuration choice, not a feature limitation. All five deployments access the same 485 modules, the same workflow engine, the same Coding Area, the same intelligence capabilities.

---

# PART 11: USAGE GUIDE

*This section walks through ANTON from first installation to enterprise administration. Whether you are an individual consultant running your first gap analysis, a team lead configuring cost controls, or a CISO reviewing the audit framework, this guide covers what you need to get productive quickly.*

---

## §38. Getting Started

### Prerequisites

**Software requirements:**

Node.js 18+ (download from https://nodejs.org/). pnpm package manager (install via: `npm install -g pnpm`). A modern web browser (Chrome, Firefox, Safari, Edge).

**API key (for cloud-hosted models):**

Anthropic API key for Claude models (recommended — get from https://console.anthropic.com/). OpenAI API key for GPT models (optional). Mistral API key (optional). Or: install Ollama for local models with zero API costs.

---

### Installation (10-15 Minutes)

**Step 1: Clone repository**

```bash
git clone https://github.com/futurechain/anton
cd anton
```

**Step 2: Install dependencies**

```bash
pnpm install
```

**Step 3: Configure API key**

```bash
cp .env.example .env
# Edit .env and add your API key:
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

**Step 4: Initialise database**

```bash
pnpm run db:init:enhanced
```

**Step 5: Start application**

```bash
pnpm run dev
```

**Step 6: Open browser**

Navigate to `http://localhost:5173`

---

### First Steps

**1. Create your profile** (optional but recommended)

Click "Settings" → "Profile." Enter your name, role, organisation, jurisdiction, and focus areas.

**2. Browse expert areas**

The sidebar lists all 56 areas. Click any area to expand and see its modules.

**3. Run your first module**

*Quick Question (Brief Me mode):* Click "Brief Me" in the sidebar. Type a question. Click "Ask ANTON."

*Full Module (AMLR Gap Analysis):* Navigate to Area 1: Financial Crime Prevention → AMLR Gap Analysis. Complete the guided inputs. Review the pre-configured settings. Optionally upload a policy document. Click "Run Analysis." Export to DOCX or XLSX.

---

### Understanding Costs

**Typical session costs (February 2026 pricing):**

| Module Type | Model | Thinking | Tokens (est.) | Cost (est.) |
|-------------|-------|----------|---------------|-------------|
| Quick question | Haiku 4.5 | quick | 5k | $0.01 |
| Standard analysis | Sonnet 4.5 | think | 40k | $0.60 |
| Gap analysis | Opus 4.6 | think_hard | 120k | $2.50 |
| Regulatory submission | Opus 4.6 | investigate | 180k | $5.00 |

---

## §39. Power User Guide

### Your First Hour with ANTON

A step-by-step walkthrough of what happens when you use ANTON for the first time.

---

#### Minutes 0-15: Installation & Setup

Follow the installation steps above. Total time: 10-15 minutes depending on network speed and whether you already have Node.js installed.

When you open the browser, you see: a dashboard with 56 expert areas, a welcome message, quick stats showing 485 available modules, and navigation to Brief Me, Guide Me, Modules, Workflows, Intelligence, and Settings.

---

#### Minutes 15-30: Your First Module

**Scenario:** You are a compliance officer at a Nordic bank. You need to analyse your Transaction Monitoring Policy against the new AMLR (Regulation 2024/1624).

**Navigate to module (30 seconds):** Click "Financial Crime Prevention" → "AMLR Gap Analysis."

**Upload your document (1 minute):** Click "Upload Files" in the Knowledge Sources panel. Select your bank's TM policy. Wait for upload and text extraction.

**Configure knowledge sources (1 minute):** Enable Claude's Knowledge + Web Search (for latest EBA guidance) and Local Folders (your uploaded policy).

**Type your question (30 seconds):**

```
Analyse our Transaction Monitoring Policy against AMLR Articles 8, 13, 16, and 18.
Identify gaps in:
1. Risk-based approach
2. Customer due diligence integration
3. Threshold calibration
4. Alert investigation procedures
5. SAR filing criteria

Provide specific article references and recommended changes.
```

**Run analysis (5 minutes):**

Click "Run Analysis." You see extended thinking appear in real-time, followed by four deliverables streaming in: Gap Scoring Matrix, Executive Summary, Action Plan, and Detailed Findings.

**Session summary:**

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

---

#### Minutes 30-45: Export & Iterate

**Export to DOCX (30 seconds):** Click "Export to DOCX." Download: `AMLR_Gap_Analysis_20260224.docx` (18 pages, 142 KB).

**Export gap matrix to Excel (30 seconds):** Click "Export to XLSX." Sheet 1 contains the Gap Scoring Matrix with RAG-rated columns. Sheet 2 contains the Action Plan with Owner, Deadline, Effort, and Dependencies.

**Iterate (2 minutes):** Prompt caching kicks in — the follow-up costs $0.18 instead of $2.94.

**Total session cost: $3.12 for a 21-page analysis.**

---

#### End of Hour: What You've Accomplished

In 60 minutes: an 18-page AMLR Gap Analysis (4 deliverables in Word and Excel), a regulatory briefing, module recommendations for sanctions policy, and a workflow template for monthly updates.

**Total cost:** $3.16. **Consultant equivalent value:** $2,400-3,200. **Savings: 99.87%.**

---

### Real-World Cost Examples

**Small tasks ($0.02-$0.50):**

| Task | Tokens | Model | Cost | Time |
|------|--------|-------|------|------|
| Quick question (Brief Me) | ~2k input, ~800 output | Sonnet 4.5 | $0.02 | 15 sec |
| Training material (1 page) | ~5k input, ~2k output | Sonnet 4.5 | $0.08 | 30 sec |
| Quick briefing summary | ~8k input, ~1.5k output | Haiku 4.5 | $0.03 | 20 sec |
| Risk assessment summary | ~12k input, ~3k output | Sonnet 4.5 | $0.18 | 45 sec |

**Medium tasks ($1-$3):**

| Task | Tokens | Model | Cost | Time |
|------|--------|-------|------|------|
| AMLR gap analysis (5 docs) | ~60k input, ~8k output | Opus 4.6 | $2.40 | 3-4 min |
| Policy document creation | ~40k input, ~10k output | Opus 4.6 | $2.75 | 4-5 min |
| Regulatory impact briefing | ~35k input, ~5k output | Sonnet 4.5 | $0.65 | 2 min |

---

### Cost Reduction Strategies

**1. Prompt Caching (up to 90% savings on repeated context)**

**2. Use Sonnet for Drafts, Opus for Final (60% savings)**

**3. Batch Operations (share context across items)**

**4. Local Models via Ollama ($0.00 API costs)**

**5. Tiered model strategy** — Draft with local Ollama (free) → refine with Sonnet ($0.65) → polish with Opus ($1.20) = $1.85 total versus $5.50 for Opus-only. Savings: 66%.

---

### API Pricing Reference (February 2026)

**Anthropic Claude:**

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Cached Input (90% off) |
|-------|----------------------|------------------------|------------------------|
| Opus 4.6 | $15 | $75 | $1.50 |
| Sonnet 4.5 | $3 | $15 | $0.30 |
| Haiku 4.5 | $0.80 | $4 | $0.08 |

**OpenAI:** GPT-4 ($30 input / $60 output), GPT-4 Turbo ($10 / $30), GPT-3.5 Turbo ($0.50 / $1.50).

**Google Gemini:** Gemini 2.0 Flash ($0.10 input / $0.40 output).

**Mistral:** Mistral Large ($4 input / $12 output).

**Ollama (Local):** $0.00 API costs (hardware costs apply).

---

### Power User Configuration

**Custom modules:** Navigate to "Build Your Own Module." Define module configuration, configure defaults, write the system prompt, add guided inputs, test with real scenarios, and save as private or share with the community.

**Workflows:** Use the Workflow Builder to create multi-step automations. Define steps, connect step outputs to subsequent step inputs, schedule with CRON expressions, and monitor via the Workflow Monitor dashboard.

**Skills:** Browse the Skills Library for reusable prompt techniques. Attach skills to any module to add analytical perspectives. Create custom skills to encode your organisation's frameworks.

**Knowledge sources:** Configure all four modes for maximum analytical depth.

**Prompt editing:** Advanced users can expand the "System Prompt" section in any module to view and edit the underlying prompt.

---

### Command Palette

**Shortcut:** ⌘K (Mac) · Ctrl+K (Windows/Linux)

The Command Palette provides instant keyboard-driven access to every function in openEXPERT without leaving your current context. Press the shortcut from anywhere in the interface.

**Features:**

**Context-aware suggestions:** The palette shows relevant commands based on where you are. In a module session it suggests follow-on actions (export, share, continue, version). In the knowledge graph it suggests entity operations. In the workflow builder it suggests step types and connections.

**History navigation:** Press the up/down arrow keys to cycle through your recent commands. Repeat a previous command without retyping it.

**Multi-step commands:** Chain commands into sequences — for example, "Run analysis → export to DOCX → create review deadline" executes as a single keyboard-driven flow.

**Macros:** Save frequently used command sequences as named macros. Give a macro a keyboard shortcut and trigger the entire sequence with a single keystroke. Useful for recurring workflows: weekly regulatory check, monthly board report cycle, client onboarding sequence.

**Module quick-launch:** Type any module name (or part of it) to jump directly to that module's configuration panel without navigating the sidebar.

**Session search:** Search across all past sessions by content, module name, date range, or persona. Find the gap analysis you ran three months ago without scrolling through session history.

The Command Palette is designed for users who work with openEXPERT daily and want to move at the speed of thought. It does not replace the visual interface — it accelerates it.

---

## §40. Enterprise Administration

### User Management

**Admin dashboard** (`/admin`):

**Add users:** Configure username, email, role (admin, analyst, user), monthly budget cap, and team or project assignment.

**Manage permissions:** Role-based access determines which modules and areas each user can access. Custom permissions can restrict to view-only, execute-only, or export-only access.

**Monitor usage:** Per-user token consumption, monthly and year-to-date cost, activity logs (last login, sessions created, modules used), and quality scores.

---

### Budget Controls

**Organisational budget configuration:**

Global cap (e.g., $10,000/month). Per-user caps (e.g., $500/user/month). Alert thresholds at 80% (email notification to admin). Enforcement at 100% (block further API calls or allow override).

**Cost allocation reporting:** Breakdown by user, by project, by area/module, and by model. Export to CSV for finance teams, internal budgeting, or client billing.

---

### Compliance & Audit

**Audit log access:** Filter by user, module, date range, model, or quality score. Export to CSV or XLSX for regulators or external auditors. Configure retention period (default 2 years, extendable per regulatory requirements).

**Compliance rule management:** Enable or disable built-in rules. Create custom rules specific to your organisation's standards. Review violations and track remediation status.

---

### Backup & Disaster Recovery

**Automated backup configuration:**

```bash
# Daily backup cron job
0 2 * * * /usr/local/bin/backup-anton.sh
```

The backup script handles database backup, uploads directory archival, optional encryption, optional cloud upload, and retention management (configurable, default 90 days).

---

### Integration & API

**REST API (planned):** Programmatic module execution, session retrieval, and workflow triggering. Enables integration with internal tools, dashboards, and reporting systems.

**Webhooks (planned):** Notify external systems on workflow completion, checkpoint decisions, or compliance violations.

**MCP Integration:** ANTON's MCP server exposes modules as Claude Desktop tools. Run `pnpm run mcp` to start the MCP server. Configure in Claude Desktop settings. Use ANTON modules directly from the Claude.ai interface — ANTON serves as the expert layer while Claude provides the conversation interface.

---

### Common Questions

**"Is this too good to be true?"** No. This is what happens when you combine a frontier LLM (Claude Opus 4.6) with 7-layer prompt engineering (domain expertise), local document context (your actual data), structured output templates (42 output format templates), and local-first architecture (no cloud latency). The AI does the production work. You do the strategic thinking and quality review.

**"What if the output is wrong?"** Always review AI output. ANTON helps with citation requirements, compliance rules, quality scoring, and version history. But you are the final reviewer. This is a power tool, not autopilot.

**"How do I know it's not hallucinating?"** Multiple safeguards: thinking display shows Claude's reasoning process, citation requirements ensure claims reference sources, local documents ground analysis in your actual data, compliance rules check for completeness, and quality alerts flag low-confidence outputs. Hallucinations are still possible — always verify critical outputs.

**"What about data privacy?"** ANTON is local-first. Documents are stored on your machine. The database is a SQLite file on your machine. Only prompts and attached documents are sent to the LLM API (and Anthropic does not train on commercial API data). For maximum privacy, use Ollama (100% local, $0 API cost).

**"Can I customise modules?"** Three ways: edit system prompts directly in any module, build custom modules from scratch via the visual editor, or fork the open-source code and modify anything.

---

# PART 12: COMMUNITY & FUTURE

*ANTON is built on a conviction: that expert-level AI capability should be available to everyone, not just those who can afford expensive subscriptions or employ teams of prompt engineers. This final part covers how to build custom modules, contribute to the community, where ANTON sits in the competitive landscape, what the future roadmap looks like, and answers to the questions we hear most often.*

---

## §41. Building Custom Modules

### Module Anatomy

Every ANTON module consists of three components:

**1. Module Configuration** (`module.json`)

```json
{
  "id": "unique-module-id",
  "label": "Display Name",
  "shortLabel": "Short",
  "icon": "LucideIconName",
  "description": "What this module does and who it's for...",
  "color": "adv-teal",
  "defaults": {
    "thinking": "think_hard",
    "creativity": "balanced",
    "outputFormats": ["executive-summary", "detailed-findings"],
    "knowledgeSources": {
      "claudeKnowledge": {"enabled": true, "webSearchEnabled": true},
      "localFolder": {"enabled": false}
    }
  },
  "guidedInputs": [
    {"id": "entity_type", "label": "Entity Type", "type": "select", "options": ["Bank", "Insurance", "Fintech"], "required": true},
    {"id": "jurisdiction", "label": "Jurisdiction", "type": "select", "options": ["Sweden", "Finland", "Other EU"], "required": true},
    {"id": "context", "label": "Additional Context", "type": "textarea", "required": false}
  ]
}
```

**2. System Prompt** (`system-prompt.md`)

The heart of the module — a detailed task definition containing: a clear objective statement, step-by-step methodology, output structure template with section definitions, quality criteria, and common pitfalls to avoid.

**3. Area Context** (shared across modules in the same area)

Domain background, key regulations and frameworks, common methodologies, and the stakeholder landscape. Area context is injected automatically for all modules within the area.

---

### Module Design Best Practices

**Start with a real problem.** Don't create modules for the sake of it. Solve actual pain points.

**Define clear scope.** "AMLR Gap Analysis" (specific) produces better output than "AML Compliance" (too broad).

**Pre-configure intelligently.** Defaults should work for 80% of use cases.

**Provide guided inputs.** Help users provide the right context without requiring prompt engineering skills.

**Write specific prompts.** Specificity is what separates ANTON modules from generic chatbot interactions.

**Test, iterate, improve.** Run the module at least 5 times with different inputs.

---

### The .anton Package Format

Modules can be packaged for sharing using the `.anton` format — a structured ZIP archive containing the module.json, system-prompt.md, area context (if creating a new area), sample inputs and outputs, and metadata (author, version, license, target audience).

A compliance specialist in Singapore can create a module for MAS regulatory analysis, package it as a `.anton` file, and share it with the global community in minutes. A cybersecurity expert in Germany can do the same for BSI IT-Grundschutz. The format is designed for domain experts who know their field but may not be software developers.

---

### The .anton Open Interchange Standard

**Problem:** Professional knowledge is trapped. A compliance officer builds a perfect AMLR gap analysis workflow — custom modules, expert personas, quality thresholds, regulatory monitoring setup, review panels, compliance rules — and it lives on their laptop. A colleague starting a similar engagement at another client has to build everything from scratch. A new team member spends weeks recreating what already exists. Professional configuration has no portability.

This problem exists across every AI tool today. ChatGPT conversations can't be meaningfully shared. Claude projects don't transfer methodology. Enterprise AI plugins are locked to their vendor's platform. The work of configuring AI for professional use — which is often the most valuable work — has no interchange format.

**openEXPERT Solution: The .anton format.**

The .anton format is an **open interchange standard** for packaging and sharing professional AI configurations. It is to AI expert modules what PDF is to documents or DOCX is to word processing — a universal format that any compatible software can produce and consume.

An .anton file is a simple ZIP archive containing JSON configuration and Markdown documentation. No executable code. No scripts. No binaries. Everything inside is human-readable and can be inspected before import. This is security by design — you can look at exactly what you're importing, and importing a package can never run code or make network requests on your machine.

---

#### What You Can Share

The .anton format supports **17 bundle types** — covering virtually every piece of professional configuration in the platform:

**Core Content:**

| Bundle Type | What It Contains | Example |
|-------------|-----------------|---------|
| **Module** | Expert module (system prompt, config, input/output schema) | "AMLR Gap Analysis" module with guided questions and expected output structure |
| **Skill** | Reusable prompt fragment attachable to any module | "Risk-Based Approach" skill that applies FATF methodology |
| **Persona** | Expert perspective with tone, background, expertise | "Senior MLRO" persona with 15 years Nordic banking experience |
| **Workflow** | Multi-step automation template with checkpoints | "Monthly Regulatory Update" — fetch, analyze, report, email |

**Professional Standards:**

| Bundle Type | What It Contains | Example |
|-------------|-----------------|---------|
| **Compliance Ruleset** | Custom compliance checking rules | "All AMLR outputs must cite 5+ specific articles and include risk quantification" |
| **Quality Baseline** | Quality thresholds per module or area | "Client deliverables: 8.0+ on structure, 7.5+ on citations" |
| **Review Panel** | Multi-perspective expert review configuration | 4-reviewer panel: Regulator, Board Member, Devil's Advocate, Auditor |
| **Audience Profile** | Stakeholder communication adaptation rules | "Scandinavian Bank Board" — understated, consensus-oriented, decision-focused |

**Compound Packages:**

| Bundle Type | What It Contains | Example |
|-------------|-----------------|---------|
| **Skill Pack** | Curated bundle: modules + skills + personas + workflow + baselines | "MLRO Compliance Officer Pack" — everything an MLRO needs on day one |
| **Output Chain** | Sequential module chain for document production | Gap Analysis → Executive Summary → Board Presentation → Action Plan |
| **Radar Config** | Regulatory monitoring source setup and filters | EU AML monitoring: EBA feeds, EUR-Lex queries, FATF updates |
| **Brand Template** | Document export styling (colors, fonts, headers, logos) | "Advisense 2026" brand applied to all DOCX/PDF/PPTX exports |
| **Project Template** | Complete engagement setup with all components | "AMLR Readiness Assessment" — 8-week engagement with everything pre-configured |

**Coding Area** (with Coding Area feature):

| Bundle Type | What It Contains | Example |
|-------------|-----------------|---------|
| **Code Review Profile** | Review lens configuration and expert setup | "Fintech Security Review" — OWASP + compliance + architecture lenses |
| **Script Template** | Data analysis script with adaptation notes | "Transaction Pattern Clustering" — Python script with parameterized inputs |
| **Application Template** | Full application with configuration points | "Compliance Dashboard" — React app with annotated customization points |
| **Coding Blueprint** | Complete project template (discovery, architecture, release plan, tests) | "GDPR Data Subject Request Handler" — full project with 7 document templates |

---

#### How It Works

**Exporting:** On any relevant page — modules, compliance rules, quality settings, workflows, radar configuration — click the export button. ANTON packages everything into a self-contained .anton file, automatically resolving dependencies. Export a module and its linked persona and skills come with it. Export a project template and every referenced component is bundled.

**Sharing:** The .anton file is a regular file. Email it to a colleague, put it in a shared drive, upload it to the community library, or distribute it through your organization's channels. No platform connection required. No accounts. No subscriptions.

**Importing:** Drag and drop an .anton file into openEXPERT. The platform shows a full preview of the package contents — every module, skill, persona, rule, and configuration — before anything is applied. Select what to import, skip what you don't need, and ANTON integrates the components into your workspace.

**Adapting:** For rich packages like project templates and coding blueprints, ANTON runs a guided adaptation session on import: "This was built for [original context]. I've identified 8 things you might want to change for your situation." Each configurable point is presented with the original value and guidance for how to adapt it. You make your choices, ANTON produces the customized version, and you're ready to work.

---

#### Security by Design

The .anton format is deliberately constrained:

- **No executable code.** Packages contain JSON and Markdown only. There is no mechanism for scripts, binaries, or executable content of any kind.
- **No network access.** Importing a package triggers zero network requests. All content is self-contained in the archive.
- **Human-reviewable.** Every file in the archive is plain text. You can open any .anton file with a ZIP tool and read every line before importing.
- **Sandboxed prompts.** System prompts from imported modules are processed through the same seven-layer prompt builder as all other content. The platform's system foundation layer applies regardless of what the module prompt says.
- **Audit-logged.** Every import is recorded in the audit trail — who imported what, when, from which package.

This matters for regulated industries. When your IT security team asks "what does importing this package actually do?", the answer is clear and verifiable: it adds text-based configuration to the local database. Nothing else.

---

#### The Ecosystem Vision

Individual .anton packages are useful. An ecosystem of .anton packages is transformative.

Consider what happens as the community grows:

A compliance consultant at one firm builds a complete AMLR readiness package — gap analysis module, remediation planning workflow, board reporting chain, quality baselines, regulatory radar config, review panel — and shares it. Another consultant imports it, adapts it for their jurisdiction, improves the output chain, and shares that version. A third team adds Islamic finance considerations and shares a regional variant. Each iteration builds on the last.

This is how professional methodology scales. Not through centralised training programmes that take months, but through portable, inspectable, adaptable packages of expert configuration that any professional can import and start using immediately.

The .anton format is published as an open specification (`docs/ANTON_FORMAT_SPEC.md`) under Creative Commons. Anyone building professional AI tools is encouraged to implement it. The goal is not to lock an ecosystem into openEXPERT — it's to create a universal standard for professional AI module interchange that works across platforms.

---

#### What Is NOT Shared

The .anton format exports **configuration and methodology**, never data or secrets:

- ❌ Database credentials, API keys, or authentication tokens
- ❌ Session history or outputs (may contain client-confidential information)
- ❌ User profiles or personal preferences
- ❌ Audit logs or operational metrics
- ❌ Knowledge graph entities (may contain extracted PII)
- ❌ Institutional memory decisions (organisation-specific reasoning)
- ❌ Budget or usage data

The rule is simple: if someone configured it, it's sharable. If the system generated it from data, it's not.

**Benefit:** **Professional knowledge becomes portable.** Your methodology, your standards, your expert configurations — packaged, shared, and reused without starting from scratch. The .anton format turns individual expertise into organisational capability and organisational capability into community knowledge.

---

## §42. Contribution & Community

### How to Contribute

ANTON is open source under the Apache 2.0 License. The openEXPERT foundation welcomes contributions from anyone with domain expertise and a desire to make professional AI tools accessible.

**Contribute a module:** Write module.json and system-prompt.md. Test with real-world scenarios (minimum 2). Submit a pull request with: module purpose, target users, example inputs, and sample outputs.

**Contribute a skill:** Package domain knowledge (a framework, methodology, or analytical lens) as a reusable skill prompt. Tag appropriately for discoverability. Submit as a pull request.

**Translate:** openEXPERT ships with 30 languages out of the box: Arabic, Bengali, Czech, Danish, German, Greek, English, Spanish, Persian, Finnish, French, Hebrew, Hindi, Hungarian, Indonesian, Italian, Japanese, Korean, Dutch, Norwegian, Polish, Portuguese, Romanian, Swedish, Thai, Turkish, Ukrainian, Urdu, Vietnamese, and Chinese. The i18n architecture uses HTTP-loaded locale files (`public/locales/[lang].json`), making it straightforward to add or improve a language without a code change — no software development background required. Submit improved translations or entirely new languages as a pull request. The community drives localisation quality; the architecture makes it possible.

**Improve existing prompts:** Module quality equals prompt quality. If you see a module that could produce better output, improve the system prompt, test thoroughly, and submit a pull request. This is one of the highest-impact contributions possible.

**Report issues:** Found a bug? Module producing poor output? Missing feature? Open a GitHub issue with module name, configuration used, example output, and expected versus actual behaviour.

---

### Quality Standards

All contributions must be written by someone with professional experience in the relevant domain. Generic prompts that could have been written without domain expertise will not be accepted. Specific requirements: clear, specific system prompts (not generic), appropriate defaults (thinking depth, creativity, output formats), at least 3 guided input fields, output that professionals would find credible, and testing against at least 2 real-world scenarios.

---

### Community Guidelines

**We value:** Domain expertise, clarity and accessibility, constructive feedback, professional standards, and contributions that make ANTON more useful for more people.

**We do not accept:** Modules promoting harm, discrimination, or illegal activity. Medical, legal, or financial advice without appropriate disclaimers. Plagiarised or copyrighted content. Prompts that violate LLM provider policies.

**Community platform:** GitHub Discussions — for questions, feature requests, module ideas, and general conversation. No separate community platform, no email capture, no marketing funnels. The work speaks for itself.

---

### The Marketplace (Planned)

A future marketplace will enable community members to share, discover, and rate modules, skills, areas, and complete workflows. The marketplace supports the `.anton` package format for easy export and import. Contributors can share modules publicly (Apache 2.0-licensed, free) or offer premium modules (creator-monetised expertise). User ratings and reviews help surface the highest-quality contributions.

The marketplace is designed so that ANTON grows more powerful over time as more domain experts contribute. A single installation that today covers 56 areas with 485 modules could, through community contribution, expand to hundreds of areas covering every professional domain imaginable.

---

## §43. Competitive Landscape

### Where ANTON Sits

Before adopting ANTON, you might reasonably ask: "Why not just use ChatGPT Plus, or Claude.ai directly, or a specialised platform like Harvey?" The answer depends on what you need.

The AI landscape for professional services has five distinct categories, and ANTON occupies a unique position that none of the others do.

---

### Category A: Vertical AI Platforms (Legal Focus)

**Harvey AI** ($8B+ valuation, $1.2B+ raised from Sequoia, a16z, Kleiner Perkins, OpenAI) serves approximately 100,000 lawyers across 1,000+ organisations with deep legal research, contract analysis, due diligence, and agentic multi-step workflows. Harvey charges approximately $1,200 per lawyer per month with 20-seat minimums — a minimum entry point of roughly $288,000 per year.

**Legora** (formerly Leya, $1.8B valuation, $266M+ raised from Bessemer, ICONIQ, General Catalyst) serves 400+ law firms across 40+ countries with tabular review, document analysis, and a collaboration portal.

**What Harvey and Legora validate:** The market is pouring billions into vertical AI for professionals — confirming that practitioners need domain-specific AI, not generic chatbots.

**What they don't do:** Both are cloud-only, closed-source, single-vertical (legal and adjacent), and expensive. Neither serves compliance officers, risk managers, auditors, project managers, or the 25+ other professional domains ANTON covers.

---

### Category B: Open-Source Workflow Automation

**n8n** (100M+ Docker pulls, massive community) provides visual workflow building with 400+ integrations, AI nodes for LLM orchestration, self-hosting capability.

**What n8n proves:** There is massive demand for self-hosted, open-source AI orchestration.

**What n8n doesn't do:** n8n is infrastructure, not expertise. It provides the plumbing — workflow nodes, integrations, scheduling — but contains no domain knowledge. n8n is the foundation; ANTON is the finished house built on top of it.

---

### Category C: RegTech Point Solutions

Platforms like Flagright, Napier AI, and ComplyAdvantage automate compliance *operations* — transaction screening, sanctions matching, case management, SAR filing.

**What they solve:** Operational efficiency in compliance execution.

**What they don't solve:** Compliance *thinking* — gap analyses, implementation planning, policy drafting, regulatory interpretation, risk assessment methodology, training content creation. ANTON sits upstream of every RegTech tool on the market.

---

### Category D: AI Coding Tools

Cursor, GitHub Copilot, Claude Code, Loveable, and similar tools optimise for speed from brief to code.

**Where ANTON's Coding Area differs:** Every other AI coding tool starts from "describe what you want, get code." They skip everything that makes real software projects succeed. ANTON's Coding Area front-loads discovery with 5 expert perspectives, creates architecture documents with expert panel review, and generates comprehensive instructions for external coding tools.

---

### Category E: General AI Assistants

ChatGPT Plus and Claude.ai (consumer interfaces at $20/month) provide excellent general-purpose AI conversation.

**What they lack for professional use:** Domain-specific expertise, structured outputs, institutional memory, compliance governance, local-first architecture, and batch processing capability.

---

### ANTON's Unique Position

After mapping the full competitive landscape, ANTON's position becomes clear across five differentiators that no other platform combines:

**1. The only multi-domain expert platform (open or closed).** Nobody covers 56+ professional domains with domain-specific expertise in a single platform.

**2. Open source with professional-grade quality.** n8n is open-source but has no domain expertise. Harvey has domain expertise but costs hundreds per seat per month and is closed. ANTON is the only platform combining Apache 2.0-licensed open-source availability with 485 professionally engineered modules.

**3. True air-gapped deployment for regulated industries.** Harvey and Legora cannot run without cloud connectivity. ANTON with Ollama models runs on a laptop with no internet connection.

**4. Multi-LLM architecture with local model support.** ANTON supports 5 providers (Anthropic Claude, OpenAI GPT, Google Gemini, Mistral, and local Ollama). No vendor lock-in.

**5. Institutional memory and governance.** Cross-workflow intelligence, knowledge graph, pattern detection, quality ratcheting, checkpoint reviews, compliance-as-code — these features transform ANTON from a tool into an organisational capability that compounds over time.

---

### Honest Positioning

| Feature | ANTON | Harvey AI | Legora | n8n | ChatGPT/Claude.ai |
|---------|-------|-----------|--------|-----|-------------------|
| Domain expertise | 56+ areas, 485 modules | Legal (deep) | Legal | None (build your own) | None |
| Cost | Free + API costs | ~$1,200/user/month | ~£200+/user/month | Free + Enterprise tier | $20/month |
| Data privacy | Local-first | Cloud only | Cloud only | Self-hosted option | Cloud only |
| Open source | Apache 2.0 | Closed | Closed | Fair-code | Closed |
| Multi-LLM | 5 providers + Ollama | OpenAI only | Multiple | Any LLM via nodes | Single provider |
| Institutional memory | Knowledge graph + patterns | Limited | Limited | None | Projects (limited) |
| Air-gapped deployment | Full support | Not possible | Not possible | Possible (no AI) | Not possible |
| Structured outputs | 42 output format templates | Legal-specific | Legal-specific | Custom build | Manual formatting |
| Batch processing | CSV → N outputs | Enterprise feature | Enterprise feature | Via workflows | Not available |
| Quality governance | 6-dimensional scoring | Firm-specific | Firm-specific | None | None |

---

### When to Use What

| Use Case | Best Tool |
|----------|-----------|
| Quick regulatory question | ChatGPT Plus or Claude.ai (fast, cheap, good enough) |
| Formal compliance deliverable | ANTON (structured, auditable, professional) |
| High-stakes strategic decision | Traditional consultant (human judgment critical) |
| 50+ similar analyses at scale | ANTON batch mode (economies of scale) |
| Personal learning and research | ChatGPT Plus (conversational, exploratory) |
| Building institutional knowledge | ANTON (knowledge graph, pattern detection) |
| Legal contract review | Harvey or Legora (deep legal vertical) |
| Workflow automation (no domain AI) | n8n (400+ integrations) |
| Code generation | Cursor, Claude Code, GitHub Copilot |
| Code architecture and governance | ANTON Coding Area (senior architect role) |

**The honest truth:** If you do 1-2 compliance analyses per year, ChatGPT Plus is probably sufficient. If you do 10+ per month, ANTON pays for itself in the first week. If you work in a regulated industry and need audit trails, structured governance, and institutional memory, there is no alternative at any price point.

---

## §44. Roadmap & Future Vision

### Completed (v3.0 — February 2026)

485 modules across 56 expert areas. 7-layer prompt architecture with 4-mode knowledge sources. Multi-LLM support (5 providers including local Ollama). Enterprise security (RBAC, audit trails, budget controls, compliance-as-code). Cross-workflow intelligence (knowledge graph, pattern detection, institutional memory). Workflow automation (12 step types, CRON scheduling, collaborative canvas). AI-Led Software Development (4-tier Coding Area, AI Code Instruction Builder, Project Alignment Reviewer). External Data Integration (PostgreSQL, MySQL, MSSQL, MongoDB, REST APIs, MCP connectivity). Discovery Mode (paper workshop framework, digital guided conversation). Local-first architecture with 5 deployment models (desktop through air-gapped). 73 database tables, 71 API routes, 65 React pages. Multi-language interface — 30 languages shipped (Arabic, Bengali, Chinese, Danish, Finnish, French, German, Hindi, Japanese, Korean, Norwegian, Polish, Portuguese, Spanish, Swedish, Thai, Turkish, Ukrainian, Urdu, Vietnamese, and 10 more). Hybrid semantic search — BM25 sparse retrieval combined with vector similarity search using Reciprocal Rank Fusion, with a full embedding pipeline. Multi-Model Deliberation Protocol — parallel Claude Opus/Sonnet/Haiku analysis with Opus synthesis, highlighting agreement and surfacing genuine uncertainty. Slack and Microsoft Teams integrations — outbound webhook notifications and inbound Slack slash commands with HMAC signature verification. Command Palette (⌘K / Ctrl+K) — context-aware suggestions, history navigation, multi-step commands, and macro support. Private Equity & Venture Capital hub — 12 modules covering the full deal lifecycle with an investment committee memo generator. Creative Production area — 8 modules for screenwriting, literary translation, world-building, editorial review, and audience testing. NGO & Social Impact hub — dedicated entry point with 9 social sector areas covering community health, smallholder farming, land rights, mobile money, and more. Trades hub — dedicated entry for skilled service businesses.

---

### In Progress (Q1-Q2 2026)

Mobile responsive UI (final polish). Advanced analytics dashboards. Cloud deployment templates (AWS, Azure, Google Cloud). REST API documentation for programmatic integration.

---

### Planned (Q3-Q4 2026)

📅 **Community Marketplace (via .anton ecosystem):**
- Browse and download .anton packages from the community library
- Drag-and-drop import with full preview and selective installation
- 17 shareable bundle types (modules, skills, workflows, compliance rulesets, project templates, and more)
- Package ratings, reviews, and usage statistics
- Export your own modules, workflows, and configurations for the community

**Enterprise features:** PostgreSQL adapter (replacing SQLite for large-scale deployments). Advanced RBAC (custom permissions per user or team). Enterprise SSO integrations (SAML 2.0, OpenID Connect for Azure AD, Okta, Auth0).

**Expanded connectivity:** Zapier and Make.com connectors. REST API for programmatic module execution and workflow triggering. Target: match n8n's 400+ integrations over time.

**AI enhancements:** Multi-modal inputs (images, screenshots, diagrams). Vision support (analyse charts, tables from scanned PDFs). Audio transcription (meeting notes → module inputs).

---

### Long-Term Vision (2027+)

**Open ecosystem:** Marketplace for premium modules (domain experts monetise their expertise globally). Certification program (verified domain experts whose modules carry a quality badge). Partner network (consultancies offering ANTON-powered services to clients).

**SaaS offering:** Hosted version for users who prefer cloud deployment without infrastructure management. Multi-tenant architecture with per-organisation isolation.

**Advanced intelligence:** Predictive analytics (forecast compliance risks before they materialise). Anomaly detection (flag unusual patterns proactively across the knowledge graph). Cross-organisational benchmarking (compare quality scores and coverage across organisations, anonymised and aggregated).

**Global expansion:** Modules for non-EU jurisdictions — US (FinCEN, BSA/AML), APAC (MAS, HKMA, RBI), MENA (CBUAE, SAMA). Localised regulatory knowledge and jurisdiction-specific module variants. Multi-language prompts optimised for each locale.

---

### The Compounding Effect

ANTON's architecture creates a compounding value dynamic: every module contributed makes the platform more useful, attracting more users. Every user's work enriches the knowledge graph. Every pattern detected improves future analyses. Every workflow shared saves someone else the setup time.

This is the core thesis behind the open-source approach: when a compliance specialist in Stockholm, a risk manager in Singapore, and an auditor in Nairobi all contribute their domain expertise to the same platform, the combined result is greater than anything any single organisation could build.

---

## §45. FAQ

**Q: Is ANTON free?**
A: Yes. The software is free and open source (Apache 2.0 License). You pay only for LLM API usage (Claude, GPT, Mistral) or nothing at all if you use local Ollama models. Typical costs: $0.02-$5 per session depending on complexity, model, and thinking level.

**Q: Can I use it commercially?**
A: Yes. The Apache 2.0 License permits commercial use without restriction. Use it for client work, internal operations, or as part of a commercial service. Build a consulting practice around it. Embed it in your product. The licence is deliberately permissive.

**Q: Is my data safe?**
A: Yes. ANTON runs locally on your infrastructure. Documents, sessions, and outputs are stored in a SQLite database on your machine. Only LLM API requests leave your environment (and Anthropic does not train on commercial API data). For maximum privacy, use Ollama models — nothing leaves your network.

**Q: Can I use different AI models?**
A: Yes. ANTON supports Anthropic Claude (Opus, Sonnet, Haiku), OpenAI GPT, Google Gemini, Mistral, and local Ollama models. Switch models per session based on quality needs, cost constraints, or privacy requirements.

**Q: How accurate are the outputs?**
A: ANTON produces professional-quality output for structured analytical work. The 7-layer prompt architecture, domain-specific system prompts, and quality governance framework significantly raise the baseline above generic AI interactions. However, AI can make errors. Always review outputs before using them for decisions, especially in regulated contexts.

**Q: Can I create custom modules?**
A: Yes. The "Build Your Own Module" interface provides a visual editor for creating modules with custom configurations, guided inputs, and system prompts. Keep them private or share with the community via pull request.

**Q: Does it work offline?**
A: Partially. The UI, database, all modules, and all local functionality work without internet connectivity. LLM inference requires either an API connection (for cloud-hosted models) or local Ollama models. For fully offline capability, deploy with Ollama in an air-gapped environment.

**Q: What about data residency (GDPR)?**
A: Data is stored locally by default — fully aligned with GDPR Article 5 (data minimisation). For strict data residency requirements within the EU, use Mistral (EU-based provider, Paris headquarters) or local Ollama (nothing leaves your network).

**Q: Can multiple users collaborate?**
A: Yes. Multi-user support with RBAC (admin, analyst, user roles). The Collaborative Canvas (§27) enables team workflows with step assignment, parallel reviews (4 consensus modes), threaded comments, and SLA tracking.

**Q: How do I get help?**
A: GitHub Issues for bug reports. GitHub Discussions for questions, feature requests, and community conversation. This whitepaper serves as comprehensive documentation. For enterprise deployment support, reach out via GitHub.

**Q: Who created this?**
A: Daniel Bardun (14+ years in banking, financial crime prevention, and regulatory consulting at SEB, Sveriges Riksbank, EY, and Advisense) and FutureChain AB. Built with the conviction that professional-grade AI capability should be available to everyone.

**Q: What is the Multi-Model Deliberation Protocol?**
A: An optional analysis mode where openEXPERT runs the same query simultaneously across Claude Opus, Sonnet, and Haiku, then synthesises the three responses with Opus. Where the models agree, the conclusion is stated with confidence. Where they diverge, the synthesis presents both perspectives honestly rather than forcing a false consensus. Use it for high-stakes outputs — complex gap analyses, regulatory interpretations, risk assessments — where the cost of a missed consideration is significant. Activate it from the session toggles panel. Note that it runs four model calls (three analysis + one synthesis), so it costs approximately 3–4× a standard single-model response.

**Q: Does openEXPERT support languages other than English?**
A: Yes. The interface ships with 30 languages: Arabic, Bengali, Czech, Danish, German, Greek, English, Spanish, Persian, Finnish, French, Hebrew, Hindi, Hungarian, Indonesian, Italian, Japanese, Korean, Dutch, Norwegian, Polish, Portuguese, Romanian, Swedish, Thai, Turkish, Ukrainian, Urdu, Vietnamese, and Chinese. Switch language in Settings. AI output language is controlled separately — you can run the interface in Swedish while requesting analysis output in English, or vice versa.

**Q: What is the .anton format?**
A: The .anton format is an open interchange standard for packaging professional AI configurations — modules, skills, personas, workflows, compliance rules, quality baselines, and more. It's a ZIP file containing JSON and Markdown (no executable code). You can export your configurations as .anton files, share them with colleagues or the community, and import others' packages into your workspace. The format specification is openly published and anyone is encouraged to implement it.

**Q: Is it safe to import .anton files from others?**
A: Yes. The .anton format contains no executable code — only text-based configuration (JSON and Markdown). Importing a package cannot run scripts, make network requests, or access your filesystem. openEXPERT shows you the full contents of any package before importing, and you can select exactly which components to install. All imports are logged in the audit trail.

**Q: Can I use the .anton format in my own software?**
A: Yes. The format specification is published under Creative Commons (CC BY 4.0) and anyone is encouraged to implement it. The goal is a universal standard for professional AI module interchange, not vendor lock-in. The ".anton" format name is a trademark of FutureChain AB to protect format integrity — ensuring files called .anton actually conform to the specification.

**Q: What's the catch?**
A: There is no catch. Open source means transparent. The openEXPERT philosophy — "give it away, hold nothing back, and let the work speak" — drives every decision. We believe this capability should power-charge every sector and enable more people to do valuable work. When more people can do valuable work, everyone benefits.

---

## Conclusion

ANTON, built on the openEXPERT foundation, represents a new way of working with AI — one where the AI arrives trained, governed, and ready to contribute as a professional coworker rather than a blank-slate assistant that needs constant instruction.

**What makes it different:**

Expert training built in — 485 modules with professional-grade system prompts across 56 domains, designed by practitioners who have done this work for years. Complete transparency — see exactly how ANTON thinks through configurable thinking levels, from quick responses to deep investigation. Local-first — your data never leaves your machine unless you explicitly choose cloud-hosted models. Enterprise-ready — RBAC, audit trails, budget controls, compliance-as-code, and checkpoint governance. Intelligent — learns from your work through cross-workflow intelligence, building organisational knowledge that compounds over time. Collaborative — multi-human workflows with parallel reviews, consensus modes, and institutional memory. Open source — free, transparent, community-driven, Apache 2.0-licensed. No lock-in, no subscription, no artificial limitations. Multilingual — 30-language interface with AI output in any language, meeting users where they are rather than requiring English fluency. Multi-model deliberation — optional parallel analysis across three Claude models with synthesis, for outputs that are more complete and more honest about their uncertainty than any single model can produce. Portable expertise — the `.anton` open interchange format packages your methodology, skills, and configurations so professional knowledge travels between colleagues, teams, and the global community rather than staying locked in individual sessions.

**Who it's for:**

Individuals — students, researchers, job seekers, anyone who deserves access to professional-grade analytical frameworks. Small businesses — startups and SMBs navigating compliance, operations, and growth without enterprise budgets. Corporates — regulated industries, professional services firms, and organisations that need structured governance around AI use. Financial institutions — banks, payment providers, and financial intermediaries implementing AMLR, DORA, MiCA, and other regulatory frameworks. Consultants — Big 4 firms, boutique practices, and independent consultants who want to deliver more value in less time.

**The mission:**

Democratise access to expert-level AI assistance. A compliance officer at a 50-person fintech in Tallinn deserves the same analytical frameworks as a team at a global bank. A student researching regulatory policy deserves the same structured guidance as a Big 4 consultant. A startup founder navigating their first AML framework deserves the same expert support as a seasoned compliance professional.

**The result:**

More people doing more valuable work. AI handles the production — the research, the structuring, the formatting, the cross-referencing. Humans handle the judgment — the decisions, the strategy, the context that only experience provides. The time saved is not just efficiency — it is creative freedom, redirected toward the work that matters most.

---

**Ready to start?**

```bash
git clone https://github.com/futurechain/anton
cd anton
pnpm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY
pnpm run db:init
pnpm run dev
```

**Welcome to ANTON. Welcome to the future of knowledge work.**

---

**openEXPERT by ANTON**
Open Source · Expert-Grade AI · For Everyone
Version 3.0.0 — February 2026

**Created by:** Daniel Bardun & FutureChain AB
**License:** Apache 2.0
**Repository:** https://github.com/futurechain/anton
**Community:** GitHub Discussions
**Support:** GitHub Issues

---

> *"Everyone talks about AI changing work. But between the promise and the reality, there's a gap — a gap of knowledge, a gap of time, a gap of training. openEXPERT closes all ten. We gave the AI a proper professional education, so you don't have to be an AI expert to get expert results. The time you save isn't just efficiency — it's creative freedom."*
>
> — Daniel Bardun, Creator of openEXPERT by ANTON

---

**END OF WHITEPAPER**
