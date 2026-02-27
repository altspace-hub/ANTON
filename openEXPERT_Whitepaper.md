# openEXPERT by ANTON — Whitepaper

**Version:** 1.0.0  
**Date:** February 17, 2026  
**Status:** Public Release  
**License:** Open Source (MIT)  
**Created by:** Daniel Bardun & FutureChain AB  
**Powered by:** Anthropic Claude API  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Important Notices](#2-important-notices)
3. [Our Story: Why We Built openEXPERT](#3-our-story-why-we-built-openexpert)
4. [The Vision: Where We See the Future](#4-the-vision-where-we-see-the-future)
5. [Benefits & Value Creation](#5-benefits--value-creation)
6. [How It Works: The Core Architecture](#6-how-it-works-the-core-architecture)
7. [The Seven Layers of Intelligence](#7-the-seven-layers-of-intelligence)
8. [Platform Features Walkthrough](#8-platform-features-walkthrough)
9. [openEXPERT and AI Agents — Where We Fit](#9-openexpert-and-ai-agents--where-we-fit)
10. [The 30 Expert Areas](#10-the-30-expert-areas)
11. [Area Deep Dives: Modules, Thinking & Use Cases](#11-area-deep-dives-modules-thinking--use-cases)
12. [Getting Started](#12-getting-started)
13. [Contribution & Community](#13-contribution--community)
14. [Roadmap](#14-roadmap)
15. [FAQ](#15-faq)

---

## 1. Executive Summary

openEXPERT by ANTON is an open-source, AI-powered expert platform that transforms how people work with AI across 30 professional domains — from financial crime prevention and legal advisory to project management, education, and personal development.

The platform was born from a simple realisation: AI models like Claude are extraordinarily capable — like having access to a super-smart graduate student who has read everything, remembers everything, and can reason at exceptional speed. But there is a gap. That graduate student, brilliant as they are, has never actually worked in your industry. They don't know how a gap analysis is structured in practice, what a regulator actually expects in a remediation plan, how a project status report should land with a steering committee, or what "good" looks like when a compliance officer reviews a policy document.

openEXPERT bridges that gap. We have taken the AI and given it what every talented graduate needs when they enter the real world: proper training. We have taught it how tasks and domains actually work — not in theory, but in practice. We have defined what should be done, what a good outcome looks like, who the relevant experts are, and how experienced professionals structure their thinking. We have given it coworkers and experts to "talk" to, frameworks to follow, and quality standards to meet.

The result is not just a tool — it is a new way of collaborating with AI. A way that works whether you are deeply technical or have never written a prompt in your life. A way that works whether you have hours to invest or only twenty minutes before a deadline. openEXPERT handles the AI complexity so you can focus on the work that matters.

Everyone talks about how AI will change work. But there is a gap between that promise and reality. People have vastly different levels of AI experience and technical knowledge. Even those who understand the technology often lack the time to craft the detailed prompts and context that produce professional-quality output. openEXPERT closes both gaps simultaneously — it makes AI accessible to everyone regardless of technical skill, and it makes AI productive for everyone regardless of available time.

The platform is open source because we believe this capability should power-charge every sector, enable more people, and drive growth, creativity, and genuine value creation from the time savings AI makes possible. A student preparing a thesis deserves the same analytical frameworks as a Fortune 500 compliance officer. A small business navigating regulations deserves the same structured guidance as a Big4 client. When more people can do more valuable work, everyone benefits.

openEXPERT runs locally on your machine. Your data never leaves your environment. You bring your own Claude API key from Anthropic, and the platform handles everything else — the domain expertise, the prompt engineering, the output formatting, the review workflows, and the knowledge management.

**Key numbers:**

- 30 expert areas covering the full spectrum of professional services
- ~235 modules, each with domain-specific prompting and guided inputs
- 22+ output formats from executive summaries to scoring matrices
- 4 knowledge source modes including local file integration
- Config-driven architecture: adding a new module takes 15 minutes, not hours of coding
- Built in Rust-grade TypeScript with React, running locally with zero cloud dependency for your data

---

## 2. Important Notices

### 2.1 Claude API Requirement

openEXPERT by ANTON requires a valid Anthropic Claude API key to function. The platform itself is free and open source, but the AI reasoning is provided by Anthropic's Claude models (Claude Opus 4.6 recommended, Claude Sonnet 4.5 supported for cost-sensitive use).

You are responsible for:

- Obtaining your own API key from [console.anthropic.com](https://console.anthropic.com)
- Managing your API usage and costs
- Complying with Anthropic's Acceptable Use Policy
- Understanding that API costs scale with usage — heavier thinking modes and longer conversations consume more tokens

Estimated API costs per session vary by complexity. A typical gap analysis session using Claude Opus 4.6 with deep reasoning costs approximately $0.50–2.00. A quick document review with Claude Sonnet 4.5 costs approximately $0.05–0.20.

### 2.2 Open Source License

openEXPERT by ANTON is released under the MIT License. You are free to use, modify, distribute, and build upon this software for any purpose, including commercial use, subject to the license terms.

The original work was created by Daniel Bardun and FutureChain AB. We ask that derivative works maintain attribution to the original project.

### 2.3 Not Professional Advice

openEXPERT is a productivity and analysis tool. Its outputs do not constitute legal advice, financial advice, audit opinions, medical advice, or any other form of professional counsel. AI-generated analysis should always be reviewed by qualified professionals before being used for decision-making in regulated or high-stakes contexts.

The platform is designed to augment human expertise, not replace it. Think of openEXPERT as the first draft that a qualified professional refines — not as the final word.

### 2.4 Data Privacy

openEXPERT runs entirely on your local machine. No data is transmitted to any server other than the Anthropic Claude API for AI processing. Your documents, projects, sessions, and analysis results are stored locally in a SQLite database on your computer.

When you submit a query to the Claude API, the content of that query (including any attached documents or context) is transmitted to Anthropic's servers for processing. Anthropic's data retention and privacy policies apply to that interaction. We recommend reviewing Anthropic's privacy policy at anthropic.com/privacy.

### 2.5 Internationalisation

The initial release of openEXPERT is in English. The architecture has been built with internationalisation (i18n) readiness from day one — all user-facing strings are externalisable, and the module configuration system supports locale-specific content. Language localisation is deferred to the community. If you want openEXPERT in Swedish, Finnish, German, Spanish, or any other language, contributions are welcome and the framework is ready.

---

## 3. Our Story: Why We Built openEXPERT

### The View From Inside Consulting

For fourteen years, I worked at the intersection of banking, financial crime prevention, and regulatory compliance — at SEB, one of Scandinavia's largest banks; with Sveriges Riksbank, Sweden's central bank; at EY, advising global institutions; and at Advisense, helping banks build their compliance capabilities.

Every day, I watched the same pattern repeat. A bank would identify a regulatory gap — perhaps a new EU regulation requiring changes to their customer due diligence processes. They would engage a consulting firm. The consultants would spend weeks researching the regulation, mapping it against the bank's current state, creating gap analysis spreadsheets, writing recommendations, and producing slide decks. The client would pay hundreds of thousands of euros. Then the regulation would change, and the cycle would begin again.

The work was valuable. But I couldn't escape the feeling that most of it followed predictable patterns. The gap analysis framework was the same every time. The regulatory interpretation followed the same methodology. The document structures were standardised. What made a good consultant wasn't access to secret knowledge — it was domain expertise applied through well-structured analytical processes.

When I began experimenting with Claude in early 2025, I realised something that changed my perspective entirely: AI models are like extraordinarily talented graduate students. They have read everything, they remember everything, they can reason at astonishing speed, and they are always available. But they have a critical gap — they have never actually done the work. They don't know how a gap analysis is structured in practice. They don't know what a regulator expects to see in a remediation plan. They don't know the difference between a board paper that lands well and one that gets torn apart in the first five minutes.

The gap wasn't intelligence. The gap was professional experience. And experience, unlike raw knowledge, can be encoded. You can teach someone — or something — how tasks work in practice, what good outcomes look like, who the relevant stakeholders are, and how professionals structure their thinking.

That was the founding insight of openEXPERT: if you give AI the right professional training — the same onboarding you would give a talented new hire — it can produce the foundational 80% of professional analytical work at a quality level that passes expert review. Not the final 20% — the nuanced judgment calls, the client relationship management, the political navigation, the deep institutional knowledge that comes from years of working with a specific organisation. But the research synthesis, the regulatory mapping, the document drafting, the comparative assessments, the risk scoring — all of that becomes faster, more consistent, and accessible to anyone.

### The Birth of ANTON

I started building what I called the "FCP Workbench" — a local web application that let me and my team at Advisense use Claude through a purpose-built interface optimised for financial crime prevention consulting. Instead of generic prompts, each module had domain-specific system instructions crafted from years of real consulting experience. Instead of copy-pasting text, the interface had guided inputs, output format selectors, and export pipelines that produced client-ready documents.

The first version had 8 modules: gap analysis, document creation, sanctions advisory, regulatory monitoring, training content creation, data management assessment, risk assessment support, and investigation case support. We named the AI engine ANTON.

Within weeks, I realised something: the architecture wasn't specific to financial crime prevention. The pattern — domain expertise encoded in system prompts, guided inputs that ask the right questions, structured output formats that produce professional deliverables, expert personas that add perspective — that pattern works for any professional domain.

A legal team interpreting new regulations follows the same structural pattern as a compliance team interpreting new AML requirements. A project manager creating a status report follows the same pattern as an auditor creating a findings report. A branding strategist developing messaging follows the same pattern as a compliance officer drafting a policy document.

The core engine is universal. The domain expertise is what makes each module special.

### From Workbench to Platform

That insight led to openEXPERT. I expanded the scope from 8 modules in one domain to 30 domains covering approximately 235 modules. Each domain represents a professional specialty where expensive human expertise is currently the only option. Each module within a domain encodes the analytical framework, the questioning methodology, and the output standards that define good work in that field.

I chose to make it open source for three reasons.

First, because the people who would benefit most from having a trained AI expert — small businesses, students, non-profits, professionals in developing economies — are often the ones with the least access to expensive human expertise. Open source means that anyone with a computer and a Claude API key can access the same professional frameworks that Fortune 500 companies use.

Second, because the gap between "people who know how to use AI effectively" and "everyone else" is growing fast. Making openEXPERT open source helps close that gap. You don't need to be an AI expert to get expert-quality output. The platform handles the complexity. The user handles the domain.

Third, because we believe the time savings from AI-augmented work should create a ripple effect across entire sectors. When more people can produce higher-quality analytical work in less time, the freed capacity flows into creative thinking, innovation, relationship building, and the kind of value-creating work that humans uniquely excel at. We want to power-charge every sector — not gate-keep access to a few who can afford premium tools.

---

## 4. The Vision: Where We See the Future

### A New Way of Working With AI

The conversation about AI is everywhere. But for most people, the reality of using AI is still frustratingly far from the promise. You open a chatbot, type a question, and get an answer that sounds impressive but lacks the depth, structure, and professional awareness that your work actually requires. You spend twenty minutes trying to explain what you need. You iterate five times. Eventually, you get something usable — but you've spent more time managing the AI than you would have spent doing the work yourself.

This is not an AI problem. It is an onboarding problem.

Think about what happens when a brilliant graduate student joins your team. On day one, they are smart, motivated, and full of theoretical knowledge. But they don't know how your organisation works, what your clients expect, how your industry structures its deliverables, or what "good" looks like in practice. You don't fire them — you train them. You show them examples. You introduce them to colleagues with different expertise. You give them frameworks. You review their work and explain what needs to change.

openEXPERT does exactly this — but for AI. We have taken the most capable reasoning engine available and given it a proper professional onboarding across 30 domains. The AI in openEXPERT doesn't just know about compliance or project management or brand strategy in theory — it knows how practitioners actually do this work. It knows the frameworks, the deliverable structures, the quality standards, and the common pitfalls. It has coworkers (expert personas) to consult with, skills (domain knowledge packs) to draw on, and review processes to ensure quality.

The result is not incremental improvement. It is a leapfrog. People who have never used AI productively can produce professional-grade output on their first session. People who are already skilled with AI can work three to five times faster because the platform eliminates the prompt engineering overhead. Both groups benefit because the domain expertise is embedded in the system, not in the user's ability to articulate it.

### What This Means For Different Sectors

We see openEXPERT power-charging sectors in ways that go beyond simple efficiency:

In **financial services**, compliance teams that currently spend weeks preparing for regulatory changes will be able to produce gap analyses and implementation plans within hours — not because the AI replaces their judgment, but because it handles the analytical heavy lifting while they focus on strategy and stakeholder management.

In **education**, teachers will reclaim the 40% of their time currently consumed by administrative and preparation tasks. Curriculum design, assessment creation, and personalised feedback become faster, freeing educators to do what they entered the profession to do — teach.

In **startups and small businesses**, founders who currently can't afford specialist advice will have access to the same analytical frameworks used by companies with dedicated strategy, legal, and compliance teams. This levels the playing field in ways that matter.

In **public sector and nonprofits**, organisations that operate under severe resource constraints will be able to produce the kind of structured analysis and documentation that currently requires expensive consultants.

In **personal development**, individuals at every career stage will have access to professional guidance — from CV building and interview preparation to career strategy and negotiation support — that was previously available only to those who could afford career coaches.

### The Compounding Effect

The most exciting aspect of openEXPERT is what happens when the time savings compound. When a professional saves four hours on analytical work, those four hours don't disappear — they become available for higher-value activities. Creative thinking. Client relationships. Mentoring junior colleagues. Exploring new ideas. Learning new skills.

Multiply that across an organisation, a sector, an economy, and the impact is transformative. We are not just building a productivity tool. We are building infrastructure that frees human creativity and judgment from the burden of routine analytical work, so that people can focus on the things that only humans can do — and the things that humans actually want to do.

### The Three Horizons

**Horizon 1 (Now — 2026):** openEXPERT runs locally, powered by Claude API. Individual professionals and small teams use it to multiply their output. The community begins contributing modules, personas, and skills. The platform proves that AI-augmented expertise works for everyone, not just AI experts.

**Horizon 2 (2027–2028):** Cloud deployment options emerge. Enterprise features — multi-tenant, SSO, audit trails — make openEXPERT viable for larger organisations. A marketplace for modules and skills creates a knowledge ecosystem where domain experts share their frameworks with the world.

**Horizon 3 (2029+):** openEXPERT becomes infrastructure. Just as WordPress democratised publishing and Shopify democratised e-commerce, openEXPERT democratises professional expertise. The platform supports multiple AI providers. The module ecosystem grows to thousands of domains. Cross-area intelligence — where insights from one domain automatically inform analysis in another — becomes the norm.

### Our Philosophical Position

We believe in augmentation, not replacement. We believe in transparency — every AI reasoning step should be explainable. We believe in accessibility — expert tools should work for everyone, regardless of their technical skill level. And we believe in community — the best domain expertise comes from practitioners who share their knowledge openly.

openEXPERT is not a product. It is infrastructure for a world where more people can do more valuable, creative, meaningful work.

---

## 5. Benefits & Value Creation

### The Core Benefit: A Better Way to Work With AI

The fundamental benefit of openEXPERT is not any single feature — it is a fundamentally better way of collaborating with AI. Instead of conversing with a blank-slate chatbot and hoping for the best, you work with a trained expert system that understands your domain, speaks your professional language, and produces output in the formats your work actually requires.

This matters for three types of users:

**If you are new to AI**, openEXPERT removes the learning curve entirely. You don't need to know anything about prompting, tokens, temperature settings, or system instructions. You select an area that matches your work, choose a module, answer guided questions in plain language, and receive structured, professional output. The platform handles the AI complexity. You handle the expertise.

**If you are experienced with AI**, openEXPERT eliminates the tedious setup work that drains productivity. No more spending 15 minutes crafting context at the start of every session. No more re-explaining your domain, your standards, and your expectations. The modules arrive pre-loaded with everything the AI needs to produce professional output from the first query.

**If you simply don't have time**, openEXPERT compresses what would be a multi-hour research and analysis session into a focused, structured interaction that respects your schedule. A gap analysis that takes a consultant two days of desk work becomes a two-hour guided session with professional output ready for review.

### For Companies and Organisations

**Capability multiplication:** Every team member becomes more capable. A junior analyst using openEXPERT can produce work that matches senior-level structure and rigour — not because the AI replaces experience, but because it provides the frameworks, templates, and quality benchmarks that junior staff normally learn over years. This doesn't reduce the value of experience; it raises the floor.

**Speed to insight:** In regulated industries, the time between a regulatory change and an organisation's understanding of its impact can be weeks or months. With openEXPERT, that regulatory change can be analysed, mapped against current operations, and presented as a structured assessment within hours. The competitive advantage goes to organisations that understand new requirements first.

**Consistency at scale:** Human output varies with energy, mood, workload, and individual methodology. openEXPERT applies the same analytical framework every time, ensuring that a gap analysis conducted in January follows the same structure, depth, and quality as one conducted in June. This is not about replacing human judgment — it is about providing a consistent analytical foundation on which human judgment can operate.

**Knowledge preservation:** When a senior expert leaves, their methodology, frameworks, and institutional knowledge often leave with them. openEXPERT encodes analytical approaches in reusable, version-controlled modules. The expertise becomes organisational infrastructure rather than individual capital.

**Collaboration across boundaries:** The persona and cross-area linking features mean that domain boundaries become less rigid. A compliance analysis can naturally incorporate legal, technical, and strategic perspectives. A project plan can draw on risk management, change management, and communication frameworks simultaneously. openEXPERT mirrors how real work crosses disciplinary lines.

### For Individual Professionals

**Learning through doing:** The transparency toggle doesn't just explain the AI's reasoning — it teaches professional methodology. A junior compliance officer who activates detailed transparency can see how a regulatory interpretation is structured, what sources are weighed, and how competing requirements are balanced. This is professional development embedded in the workflow.

**Multi-perspective thinking:** Before submitting work, professionals can review it through different lenses — a regulator's perspective, a board member's perspective, a technical expert's perspective, a devil's advocate. This catches blind spots and strengthens arguments in ways that would normally require multiple rounds of peer review.

**Creative freedom:** When the routine analytical work is handled, professionals gain time for the work that humans uniquely excel at — creative problem-solving, relationship building, strategic thinking, and the nuanced judgment that comes from experience. openEXPERT doesn't replace what makes professionals valuable; it amplifies it.

### For Students and Learners

**Access to professional frameworks:** A business student can use the same gap analysis methodology that consultants use with Fortune 500 clients. A law student can structure arguments using the same framework that senior lawyers apply. The analytical tools are no longer behind a paywall of professional experience — they are available to anyone willing to learn.

**Structured learning path:** Each module guides users through the analytical process step by step, asking the right questions in the right order. This is more effective than blank-page prompting because it teaches the professional methodology alongside delivering the output. You don't just get an answer — you learn how the answer was constructed.

### The Ripple Effect

When you save four hours of routine analytical work, those four hours don't disappear. They become available for the activities that create the most value — creative thinking, strategic planning, relationship building, innovation, mentoring, learning. Multiply that across teams, organisations, sectors, and the effect compounds into something much larger than efficiency. It becomes growth — in capability, in creativity, in the kinds of problems that people can take on.

This is why we built openEXPERT as open source. The more people who have access to these tools, the more value gets created across the entire economy. Not just financial value — though that matters — but creative value, social value, educational value, and the deeply human value that comes from people spending more of their time on work that matters to them.

---

## 6. How It Works: The Core Architecture

### Design Philosophy

openEXPERT is built on a single architectural principle: **modularity through configuration, not code.**

Traditional approaches to building AI applications hardcode each use case as a separate component. Adding a new capability means writing new code, testing it, deploying it. This approach doesn't scale to 235 modules across 30 domains.

openEXPERT takes a different approach. The platform has one core engine that handles all the common functionality — API communication, knowledge source management, output formatting, session persistence, export pipelines. On top of this engine sits a configuration layer where each module is defined as a JSON configuration file plus a markdown system prompt. Adding a new module means writing a configuration file and a system prompt. No code changes. No deployment. Fifteen minutes of work by a domain expert, and a new capability is live.

This is the key insight: **the domain expertise lives in the prompts and configuration, not in the code.** The code is infrastructure. The value is in the knowledge.

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERFACE                        │
│  Area Navigator │ Module Selector │ Guided Inputs       │
│  Output Format  │ Knowledge Sources │ Persona Selector  │
│  Transparency Toggle │ Review Launcher │ Export          │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│               PLATFORM LAYER                            │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  Area    │ │ Persona  │ │  Review  │ │  Skills  │  │
│  │  Router  │ │  Engine  │ │  Engine  │ │  Manager │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │Dashboard │ │Transparen│ │ Project  │ │ Module   │  │
│  │ Engine   │ │cy Layer  │ │ System   │ │ Factory  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│                 CORE ENGINE                              │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │          7-Layer Prompt Builder                   │   │
│  │  System + Area + Module + Persona + Skills +     │   │
│  │  Knowledge + Transparency                        │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │Knowledge │ │  Output  │ │ Claude   │ │  Export  │  │
│  │ Source   │ │  Format  │ │   API    │ │ Pipeline │  │
│  │ System   │ │  System  │ │  Proxy   │ │ (5 types)│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐                             │
│  │ Session  │ │  File &  │                             │
│  │ Manager  │ │  Folder  │                             │
│  │ (SQLite) │ │  System  │                             │
│  └──────────┘ └──────────┘                             │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18+ / TypeScript / Vite | Modern, fast, type-safe |
| Styling | Tailwind CSS / shadcn/ui | Consistent, accessible UI components |
| Backend | Express.js | Lightweight API proxy for Claude |
| Storage | SQLite | Zero-config local database, no server needed |
| AI | Anthropic Claude API | Best-in-class reasoning for professional analysis |
| Export | docx, xlsx, pptx, pdf, md | Native file generation, no external services |

### How a Module Runs: Step by Step

1. **User selects an area** (e.g., Financial Crime Prevention) from the sidebar navigator
2. **User selects a module** (e.g., Gap Analysis) from the area's module list
3. **Guided inputs appear** — the module asks the specific questions needed for this type of analysis (e.g., "Which regulation?", "Which jurisdiction?", "Current maturity level?")
4. **User configures the session** — selects knowledge sources (Claude knowledge, web search, local files, or all combined), output format (gap matrix, executive summary, scoring sheet), thinking depth, and optionally adds expert personas
5. **The 7-layer prompt is assembled** — the platform combines the system context, area instructions, module-specific expertise, persona perspectives, attached skills, knowledge source content, and transparency instructions into a single, optimised prompt
6. **Claude processes the request** — the assembled prompt is sent to the Claude API with the appropriate model and parameters
7. **Response streams back** — the user sees the analysis building in real-time, with the transparency layer optionally showing reasoning steps
8. **User refines in conversation** — follow-up questions, deeper dives, alternative perspectives
9. **Export when ready** — one click to export as Word document, Excel spreadsheet, PowerPoint, PDF, or Markdown

---

## 7. The Seven Layers of Intelligence

The most important technical innovation in openEXPERT is the **7-layer prompt builder**. This is what transforms a generic AI conversation into a structured expert analysis. Think of it as the professional training programme for our AI graduate student — each layer adds a specific dimension of professional capability, and together they create output that is qualitatively different from what you get by typing a question into a chatbot.

### Layer 1: System Foundation

The base layer establishes ANTON's identity, communication style, and quality standards. It instructs the AI to behave as a professional expert system, not a casual assistant. It sets expectations for depth, rigour, citation standards, and output structure.

This layer is constant across all modules. It ensures that whether you're doing a legal analysis or a branding strategy, the fundamental quality bar remains the same.

### Layer 2: Area Context

Each of the 30 areas has an area-level prompt that provides domain context. For Financial Crime Prevention, this includes the regulatory landscape (AMLR, MiCA, TFR), the key actors (AMLA, national supervisors, banks), the standard methodologies (risk-based approach, three lines of defence), and the common terminology.

This layer ensures that the AI doesn't need to be taught the basics of the domain in every conversation. It already knows the landscape.

### Layer 3: Module Expertise

This is where the deep domain knowledge lives. Each module has a system prompt written by practitioners — not generated by AI, but crafted from real consulting experience. A gap analysis module doesn't just know what a gap analysis is; it knows the specific column structure, the scoring methodology, the prioritisation framework, and the presentation standards that clients in that domain expect.

Module prompts typically include: the analytical framework to apply, the questions to ask, the output structure to produce, the common pitfalls to avoid, the quality standards to meet, and the professional conventions to follow.

### Layer 4: Persona Injection

When the user adds an expert persona — say, a legal specialist for a compliance analysis — the persona's perspective, expertise areas, communication style, and analytical priorities are injected into the prompt. This isn't just a label; it's a structured profile that changes how the AI approaches the analysis.

A compliance officer persona prioritises regulatory alignment and audit trail. A business executive persona prioritises strategic impact and cost-benefit. A technical architect persona prioritises implementation feasibility and system design. The same underlying analysis is framed through different professional lenses.

### Layer 5: Skills Attachment

Skills are reusable knowledge packages that can be attached to any session. A "Swedish Regulatory Navigator" skill contains knowledge of Swedish regulatory structure, Finansinspektionen practices, and Swedish legal conventions. An "Executive Communication" skill contains templates and standards for board-level communication.

Skills compound. A user who builds up a library of skills relevant to their work creates an increasingly powerful base of context that makes every future session better.

### Layer 6: Knowledge Source Integration

The Knowledge Source System has four modes:

**Mode 1 — Claude's Knowledge:** The AI uses its training knowledge, optionally enhanced with real-time web search for current information.

**Mode 2 — Online Regulation Links:** The user provides URLs to specific regulatory documents, standards, or guidelines. The AI fetches and incorporates this content directly.

**Mode 3 — Local Folder Integration:** The user points to a folder on their local machine containing relevant documents (policies, procedures, previous analyses, reference materials). The AI reads and incorporates this content.

**Mode 4 — Combined:** All sources active simultaneously. This is the most powerful mode — the AI reasons across its training knowledge, current web content, specific regulatory texts, and the user's local documents.

### Layer 7: Transparency & Reasoning

When the transparency toggle is active, the AI adds an explanatory layer to its output. This layer explains what sources were considered, what assumptions were made, how confidence was assessed, what alternative interpretations were considered and rejected, and what limitations apply to the analysis.

Three levels of transparency are available:

**Level 0 (Off):** Clean output only. Best for experienced users who want results without explanation.

**Level 1 (Summary):** A brief confidence assessment and methodology note at the end of each output section. The default for most users.

**Level 2 (Detailed):** Full step-by-step reasoning explanation including sources evaluated, assumptions listed, confidence scores per claim, alternative interpretations considered, and explicit limitations. Best for learning, audit trails, and high-stakes analysis.

### Why Seven Layers Matter

The difference between openEXPERT and typing a question into a chatbot is the difference between working with a trained professional and working with a brilliant stranger.

A skilled AI user can achieve similar results by spending 20 minutes crafting a detailed prompt — but most people aren't skilled AI users, and even those who are don't have 20 minutes to spare on every query. openEXPERT achieves professional-grade results in 20 seconds, every time, consistently, regardless of the user's AI expertise. The accumulated wisdom of every practitioner who has contributed to the module, persona, and skills ecosystem is available from the first click.

This is what makes openEXPERT truly accessible. The seven layers mean that someone who has never written a prompt in their life can produce the same quality of analysis as someone who has been working with AI for years. The platform's intelligence compensates for the user's AI experience gap — so they can focus entirely on their domain expertise.

---

## 8. Platform Features Walkthrough

### 8.1 Area Navigator

The left sidebar organises all 30 expert areas with colour-coded icons. Areas are grouped into logical clusters:

- **Regulatory & Compliance** — FCP, Legal, Audit, Risk Management
- **Financial Services** — Banking, Investment, Insurance, Accounting
- **Technology & Data** — Cybersecurity, Data & Analytics, Software Engineering
- **Strategy & Operations** — Strategy, Project Management, Operations, Procurement
- **People & Communication** — HR, Branding, Communication, Sales
- **Specialised Sectors** — Healthcare, Real Estate, Government, Nonprofit
- **Individual** — Education, Personal Finance, Career Development, Entrepreneurship, Academic Research

Clicking an area shows its modules, each with a short description, recommended thinking depth, and complexity indicator.

### 8.2 Guided Input System

Each module presents specific input fields tailored to the analysis type. A gap analysis module asks different questions than a contract review module or a branding strategy module. Guided inputs serve two purposes: they ensure the AI has the information it needs to produce quality output, and they teach users the professional methodology by showing them what questions an expert would ask.

Inputs can be text fields, dropdown selectors, toggles, file uploads, or multi-select options. The module configuration defines which inputs appear, which are required, and what default values apply.

### 8.3 Output Format System

22+ output formats organised across six categories:

**Strategic:** Executive Summary, Strategic Assessment, Board Paper, Market Analysis
**Analytical:** Gap Analysis Matrix, Comparative Assessment, Deep-Dive Analysis, Regulatory Impact Assessment
**Operational:** Implementation Plan, Action Item List, Process Documentation, Standard Operating Procedure
**Scoring:** Maturity Assessment, Risk Scoring Matrix, Compliance Scorecard, Benchmarking Report
**Communication:** Stakeholder Brief, Training Material, Internal Memo, External Communication
**Planning:** Project Plan, Roadmap, Resource Plan, Budget Framework

Each format has a defined structure, tone, and level of detail. The same analysis can be exported in multiple formats from a single session — an executive summary for the board, a detailed matrix for the project team, and an action plan for the implementation owners.

### 8.4 Expert Personas — "This Is Me" & "Add Expert"

**"This Is Me"** lets users create a personal profile — their role, expertise, communication style, and professional context. This profile is automatically included in every session, personalising outputs to the user's level and perspective.

**"Add Expert"** lets users bring additional perspectives into any analysis. Pre-built personas include domain experts (compliance officer, legal counsel, financial analyst), audience proxies (board member, regulator, journalist), and analytical styles (devil's advocate, systems thinker, pragmatist).

Personas are defined as JSON profiles and are fully customisable. Users and organisations can create personas that reflect their specific team members, stakeholders, or review requirements.

### 8.5 Review Engine — "Review My Work"

Before finalising any deliverable, users can launch a multi-perspective review. The review engine runs the output through one or more reviewer personas, each assessing the work from their professional vantage point.

Review modes include:

**Quality Review:** Checks for completeness, accuracy, logical consistency, and professional standards.
**Regulatory Review:** Assesses whether the output meets regulatory expectations and would satisfy a supervisor.
**Technical Review:** Evaluates implementation feasibility, technical accuracy, and system design implications.
**Communication Review:** Assesses whether the output is understandable to its intended audience.
**Red Team Review:** A devil's advocate mode that actively tries to find weaknesses, challenge assumptions, and identify risks in the analysis.

### 8.6 Skills Repository

Skills are reusable knowledge packages — structured prompts, reference frameworks, or contextual knowledge — that can be attached to any session. Think of them as "experience packs" that make the AI more effective in specific contexts.

Examples: "Nordic Regulatory Navigator" (knowledge of Swedish, Finnish, Danish, and Norwegian regulatory structures), "Board Communication Standards" (templates and conventions for board-level reporting), "AMLR Article-by-Article Reference" (detailed knowledge of the EU Anti-Money Laundering Regulation).

Skills are version-controlled and sharable. The community can contribute skills, and organisations can maintain private skill libraries for proprietary methodologies.

### 8.7 Project System — The Cross-Area Journey Container

Projects are where the cross-area power of openEXPERT comes to life. While individual modules produce valuable output, real professional work is a journey that spans multiple domains, and projects are the container for that journey.

A project groups all related sessions, documents, deliverables, reviews, and exports into a single workspace. Everything is linked and cross-referenced. When you run a gap analysis in Area 1 and then create a project plan in Area 11 based on those findings, the project maintains the connection — the gap analysis output feeds directly into the project planning input.

**Example: A Startup from Idea to Launch**

Imagine a founder building a new fintech product. In openEXPERT, this becomes a single project that tracks the entire journey:

1. **Area 28: Entrepreneurship** → Business Plan Development — validate the idea, model the economics, define the value proposition
2. **Area 17: Strategy** → Market Analysis — size the market, map competitors, identify the positioning
3. **Area 2: Legal** → Startup Legal Setup — company formation, licence requirements, regulatory obligations
4. **Area 1: FCP** → AMLR Gap Analysis — if it involves payments or banking, understand AML requirements from day one
5. **Area 16: Software Engineering** → Architecture Review — design the technology stack, define the MVP scope
6. **Area 16: Software Engineering** → Technical Specification — write the specs the development team will build from
7. **Area 15: Branding** → Brand Strategy — define the brand identity, messaging, and visual direction
8. **Area 21: Sales** → Go-to-Market Strategy — plan the customer acquisition approach
9. **Area 22: Communication** → Launch Communications — press release, social media, investor update
10. **Area 13: Accounting** → Financial Setup — reporting structure, tax planning, investor accounting

Each step produces output that feeds the next. The project dashboard shows progress across all steps, highlights dependencies, tracks deliverables, and provides a complete picture of the initiative. One project, ten areas, a coherent journey from idea to market — with every piece of analysis, every document, and every review in one place.

**Example: An AMLR Implementation Programme**

For a bank preparing for AMLR, the project might contain:

1. **Area 1: FCP** → Gap Analysis — understand the regulatory requirements and current gaps
2. **Area 1: FCP** → Data Management Assessment — map data points, identify system gaps
3. **Area 2: Legal** → Regulatory Interpretation — clarify ambiguous requirements
4. **Area 10: Data** → Data Quality Assessment — assess and remediate underlying data
5. **Area 11: Project Management** → Implementation Plan — build the programme with workstreams, timelines, and resources
6. **Area 14: HR** → Workforce Planning — identify capability gaps and recruitment needs
7. **Area 1: FCP** → Policy & Procedure Creation — draft the new compliance documentation
8. **Area 12: Education** → Training Content — build role-specific training programmes
9. **Area 3: Audit** → Audit Planning — design the independent validation approach
10. **Area 22: Communication** → Board Reporting — prepare the governance updates throughout

The project becomes a living workspace that evolves over months, with each deliverable building on the last and the project dashboard tracking the overall programme health.

**Project Templates** accelerate this further. Starting a new regulatory implementation? Choose the template and get pre-configured module sequences, suggested milestones, and deliverable checklists based on what has worked for similar projects.

### 8.8 Dashboard & Analytics

Dashboards provide visual summaries: session activity, deliverables produced, topics covered, and estimated time savings. For teams and organisations, dashboards show aggregate usage, popular modules, and comparative metrics.

The ROI tracker estimates the value of work produced by comparing output volume and complexity against typical consulting rates — providing a tangible metric for the platform's value.

### 8.9 "Build Your Own Module" — Prompt Builder

After a productive session, users can save their workflow as a new module. The platform extracts the effective prompt structure, the input parameters, and the output format preferences, and packages them into a reusable module configuration.

This creates a long-tail of value: every user who solves a domain-specific problem can share that solution as a module for others to use.

### 8.10 Open Chat — The Free-Form Mode

Not every task fits neatly into a predefined module. Sometimes you need to think freely, explore an idea, or work through a problem that doesn't have an established playbook. That is what Open Chat is for.

Open Chat gives you a blank canvas — a direct conversation with the AI — but with access to all of openEXPERT's capabilities through the settings panel. This is the critical difference between Open Chat and using a generic chatbot: even in free-form mode, you can activate expert personas, attach skills, select output formats, enable transparency, connect knowledge sources, and link to a project. The platform capabilities are always available — you just choose when and how to apply them.

**Prompt Enhancement Through Improvement Loops**

Open Chat also introduces a feature designed for users who know what they want but aren't sure how to ask for it: the prompt improvement loop. After you write your initial question or instruction, you can activate the improvement assistant, which:

1. **Analyses your prompt** — identifies what is clear, what is ambiguous, and what is missing
2. **Asks clarifying questions** — specific, targeted questions that help sharpen the request ("What format do you want the output in?", "Who is the audience?", "What level of detail?", "Are there constraints I should know about?")
3. **Suggests enhancements** — recommends personas to activate, skills to attach, output formats to select, or knowledge sources to connect
4. **Builds an improved version** — takes your original input plus your answers and produces an enhanced prompt that will generate significantly better output

This loop can run once for a quick refinement or multiple times for complex, high-stakes work. The result is that even users with no AI prompting experience can produce the kind of detailed, context-rich instructions that generate professional output — because the platform guides them through the process of articulating what they need.

For experienced users, Open Chat with the full capability panel becomes a power-user mode — combining the flexibility of free-form conversation with the structured capabilities of the platform. You can start exploratory, then gradually layer on personas, skills, and output formats as the work takes shape. And when you produce something valuable, you can save the session as a new module using the Build Your Own feature (8.9), turning a one-off exploration into a reusable capability.

### 8.11 Workflow Builder — Multi-Step Orchestration

Real professional work rarely consists of a single analytical step. A regulatory implementation involves gap analysis, then legal interpretation, then project planning, then document creation, then review, then communication. A product launch involves market analysis, then development planning, then testing, then branding, then launch communications. These are sequences — and openEXPERT's Workflow Builder lets you define, save, and execute them.

**How Workflows Work**

A workflow is a defined sequence of modules, each with pre-configured settings, that execute in order. Each step's output can feed into the next step's input, creating an automated analytical pipeline:

```
Workflow: "New Regulation Response"
─────────────────────────────────────────────
Step 1: Area 2 → Regulatory Interpretation
        Input: The new regulation text
        Output: Structured interpretation with obligations
              ↓ feeds into
Step 2: Area 1 → Gap Analysis
        Input: Interpretation + your current state
        Output: Scored gap matrix with priorities
              ↓ feeds into
Step 3: Area 11 → Project Planning
        Input: Gap priorities + your constraints
        Output: Implementation roadmap
              ↓ feeds into
Step 4: Area 22 → Communication
        Input: Key findings + roadmap
        Output: Board briefing paper
```

**Two Execution Modes**

**Guided mode (click and review):** Each step executes, then pauses for the user to review the output, make adjustments, add context, and confirm before the next step begins. This is the default — it keeps the human in the loop at every stage and allows for judgment calls between steps. You might look at the gap analysis results and decide to add an extra legal interpretation step before moving to project planning. Guided mode supports that flexibility.

**Automatic mode (pipeline execution):** For well-tested workflows with predictable inputs, the entire sequence can run end-to-end with minimal intervention. The workflow executes each step, passes the output forward, and presents the complete set of deliverables at the end for review. This is powerful for repeatable processes — running the same regulatory analysis every quarter, or applying a standard onboarding assessment to every new client.

**Building Workflows**

Users build workflows in three ways:

1. **From templates** — Pre-built workflow templates for common professional journeys (regulatory implementation, product launch, audit cycle, client onboarding)
2. **From project history** — When a project follows a successful sequence of modules, the platform can extract that sequence as a reusable workflow template
3. **From scratch** — A visual workflow builder where users drag modules into a sequence, define the input/output connections, and configure settings for each step

**Why This Matters**

Workflows are the feature that takes openEXPERT from "a tool you use" to "a platform that works for you." Instead of manually navigating between areas and modules, copying outputs, and managing the analytical sequence yourself, the platform orchestrates the journey. Combined with Projects (which store the results) and the Review Engine (which validates the output), workflows create a complete end-to-end system for professional analytical work.

For organisations, workflows become standardised methodologies — the way we do a gap analysis, the way we onboard a client, the way we respond to a regulatory change. This is institutional knowledge encoded in executable form.

### 8.12 Export Pipeline

One-click export to five formats:

**Markdown (.md):** Clean, portable text. Best for version control and documentation systems.
**Word (.docx):** Professional documents with formatting, headers, and styles. Best for client deliverables.
**Excel (.xlsx):** Structured data, scoring matrices, and comparison tables. Best for analytical outputs.
**PowerPoint (.pptx):** Slide decks from analytical content. Best for presentations and board packs.
**PDF (.pdf):** Final, formatted documents. Best for formal submissions and archives.

---

## 9. openEXPERT and AI Agents — Where We Fit

There is a valid observation to make about what happens when a user moves between areas and modules in openEXPERT, chains outputs from one step into the next through workflows, and orchestrates multi-step analytical processes through projects: this is, in a meaningful sense, a form of AI agents at work.

And that observation is correct. What openEXPERT does — decomposing a complex professional task into structured steps, routing each step to a specialised module with domain-specific context, passing outputs forward, applying expert review, and producing coherent end-to-end deliverables — is agent-like behaviour. The Workflow Builder, in particular, with its ability to chain modules in guided or automatic mode, is an orchestration layer that functions as an agentic pipeline.

But there is a crucial difference between openEXPERT and the general-purpose AI agent frameworks that are emerging across the industry. That difference is grounding.

### The Grounding Advantage

Most AI agent frameworks start from the technology and work outward: "Here is a powerful AI model. Let it figure out how to accomplish your goal." The agent decides which tools to use, which steps to take, and how to structure its output. This is impressive and will get better over time — but today, for professional work, it produces results that are often structurally sound but lack the domain specificity, professional conventions, and quality standards that make output genuinely usable.

openEXPERT starts from the opposite direction: from the professional reality and works inward. We begin with how actual practitioners do actual work. We encode the playbooks, the standards, the regulatory frameworks, the output conventions, and the quality benchmarks. We define what good looks like before the AI produces anything. Then we give the AI all of that domain knowledge and let it work within those guardrails.

The result is an agent-like system that is:

- **More personal** — it knows who you are ("This Is Me"), your context, your organisation, and your preferences
- **More grounded in business reality** — every module reflects how professionals actually structure their work, not how an AI thinks work should be structured
- **More predictable in quality** — because the frameworks, output formats, and review standards are defined in advance, the results are consistent and professionally credible
- **More transparent** — the transparency toggle shows exactly how the AI reached its conclusions, making the reasoning auditable and trustworthy
- **More collaborative** — expert personas bring multiple professional perspectives, not just one model's single viewpoint

### The Handoff: From Analysis to Execution

openEXPERT is deliberately designed as the analytical and planning layer — not the execution layer. The platform excels at producing the thinking, the structured analysis, the documents, the plans, the assessments, and the recommendations. But professional work doesn't end with a document. Plans need to be executed. Code needs to be written. Systems need to be configured. People need to be trained.

This is where openEXPERT's outputs naturally hand off to execution tools:

- A **technical specification** produced in Area 16 (Software Engineering) becomes the input for a coding tool like Claude Code, which writes and tests the actual implementation
- A **process design** from Area 20 (Operations) becomes the brief for a workflow automation tool like Claude Cowork, which configures the actual business processes
- A **project plan** from Area 11 (Project Management) becomes the structure for project management software like Jira, Asana, or Monday.com
- A **brand strategy** from Area 15 (Branding) becomes the brief for a design team or creative agency
- A **policy document** from Area 1 (FCP) goes through internal governance approval and manual implementation by the compliance team

openEXPERT does not try to do everything. It does the hard analytical work that precedes action — the thinking, structuring, and planning that turns a vague objective into a clear, actionable, professionally structured deliverable. Then it hands off cleanly to whatever execution tool or human process comes next.

This positioning is intentional. The AI agent landscape is evolving rapidly, and the tools for execution — coding agents, workflow automators, system integrators — will continue to improve. openEXPERT's value is durable because it sits upstream of execution: no matter how good the coding agent becomes, it still needs a well-structured technical specification. No matter how sophisticated the automation tool, it still needs a well-designed process. openEXPERT produces the inputs that make every downstream tool more effective.

### The Compound Effect of Grounded Agents

When you combine openEXPERT's structured analytical capabilities with execution tools, the compound effect is transformative. A single user can go from "we need to comply with this new regulation" to a complete implementation programme — gap analysis, legal interpretation, project plan, technical specifications, policy documents, training materials, and board reporting — with each step grounded in professional methodology and each output feeding the next.

This is not replacing professionals. This is giving every professional an analytical team that never sleeps, never forgets, and never starts from scratch. The human provides the judgment, the context, the relationships, and the final decisions. openEXPERT provides the structured foundation that makes those decisions better informed, faster, and more consistent.

---

## 10. The 30 Expert Areas

openEXPERT organises expertise into 30 high-level areas. Each area represents a professional domain where structured AI-assisted analysis can produce professional-grade output. Within each area, modules address specific analytical tasks.

| # | Area | Modules | Focus |
|---|------|---------|-------|
| 1 | Financial Crime Prevention | 12 | AML/CFT, sanctions, compliance frameworks |
| 2 | Legal & Regulatory | 10 | Regulatory interpretation, contracts, compliance frameworks |
| 3 | Audit & Assurance | 10 | Internal audit, external audit, control testing |
| 4 | Client Engagement & Consulting | 8 | Proposals, engagement management, delivery |
| 5 | Banking & Financial Services | 10 | Credit, payments, treasury, regulatory capital |
| 6 | Investment & Asset Management | 8 | Portfolio analysis, fund governance, market research |
| 7 | Insurance | 7 | Underwriting, claims, Solvency II, IFRS 17 |
| 8 | Risk Management (Enterprise) | 8 | ERM, operational risk, model risk, stress testing |
| 9 | Cybersecurity & Information Security | 8 | DORA, NIS2, penetration testing, incident response |
| 10 | Data & Analytics | 8 | Data strategy, quality, governance, BI, ML readiness |
| 11 | Project Management & Delivery | 10 | Agile, waterfall, programme management, standups |
| 12 | Education & Teaching | 8 | Curriculum design, assessment, learning resources |
| 13 | Accounting & Tax | 7 | Financial reporting, tax planning, IFRS |
| 14 | Human Resources & People | 8 | Recruitment, talent management, organisational design |
| 15 | Branding & Creative | 8 | Brand strategy, visual identity, content creation |
| 16 | Software Engineering & Code | 10 | Architecture review, code quality, documentation |
| 17 | Strategy & Business Development | 8 | Market analysis, competitive strategy, M&A |
| 18 | Environment, Sustainability & ESG | 8 | CSRD, EU taxonomy, carbon accounting |
| 19 | Procurement & Supply Chain | 6 | Vendor assessment, contract negotiation, supply risk |
| 20 | Operations & Process Improvement | 6 | Lean, Six Sigma, automation, BPR |
| 21 | Sales & Customer Success | 6 | Sales strategy, CRM, retention, account planning |
| 22 | Communication & Stakeholder Management | 7 | Crisis comms, investor relations, internal comms |
| 23 | Personal Finance & Wealth | 6 | Budgeting, retirement, tax optimisation |
| 24 | Real Estate & Property | 5 | Market analysis, investment appraisal, lease review |
| 25 | Healthcare & Life Sciences | 6 | Clinical governance, regulatory compliance, health policy |
| 26 | Nonprofit & Social Impact | 6 | Grant writing, impact measurement, governance |
| 27 | Government & Public Sector | 6 | Policy analysis, procurement, digital transformation |
| 28 | Entrepreneurship & Startups | 6 | Business planning, pitch decks, PMF analysis |
| 29 | Academic & Research | 7 | Literature review, methodology, paper structuring |
| 30 | Personal Development & Career | 7 | CV building, interview prep, career strategy |
| | **Total** | **~235** | |

---

## 11. Area Deep Dives: Modules, Thinking & Use Cases

### How to Read This Section

Every professional domain has a playbook — whether it comes from regulation, international standards, industry best practice, or accumulated professional know-how. An audit follows ISA standards. A gap analysis follows a defined methodology. A project plan follows PMI or PRINCE2 frameworks. A brand strategy follows established positioning models. These are not inventions — they are the codified wisdom of professional practice.

openEXPERT encodes these playbooks into its modules. But the platform cannot work alone. Every module is designed as a collaboration between the AI's encoded expertise and the user's real-world knowledge. The user brings the context: their organisation's specific situation, their documents, their constraints, their stakeholders. The AI brings the framework: the analytical structure, the quality standards, the professional conventions, and the structured output.

For each area below, we explain:

- **What matters** — the playbooks, standards, regulations, or professional conventions that define quality in this domain
- **What you bring** — what the user needs to contribute for the modules to produce valuable output
- **What good looks like** — the expected outputs, how a professional-grade result is structured, and what value it creates
- **Where to take it next** — the natural next steps across other openEXPERT areas, because real work never stops at one domain

This last point is critical. A gap analysis does not end when the gap matrix is complete. It flows into project planning, which flows into change management, which flows into communication, which flows into training. A product idea does not end with a business case. It flows into development planning, which flows into code architecture, which flows into testing, which flows into branding and launch communications. openEXPERT is designed for these journeys — not as 30 isolated silos, but as interconnected pathways where the output from one area becomes the input for the next.

---

### Area 1: Financial Crime Prevention (FCP)

**What matters:** This domain is governed by hard regulation — the EU Anti-Money Laundering Regulation (AMLR), the Transfer of Funds Regulation (TFR), national supervisory expectations, and AMLA's emerging standards. There are clear requirements for risk assessments (BWRA), customer due diligence, transaction monitoring, sanctions screening, and regulatory reporting. The playbook is defined by law, but how you implement it requires professional judgment. FATF guidance, EBA guidelines, and national supervisor interpretations add layers of practical expectation beyond the legal text.

**What you bring:** Your organisation's current policies, procedures, and risk assessments. Your understanding of your customer base, product landscape, and geographic exposure. Your previous supervisory findings, if any. Your internal structure — who owns AML, who owns data, who owns technology. The more context you provide, the more specific and actionable the output becomes.

**What good looks like:** A gap analysis should produce a scored matrix with clear red/amber/green ratings per regulatory article, specific findings explaining each gap, and a prioritised remediation roadmap that considers dependencies, resource constraints, and regulatory timelines. A policy document should follow the proper hierarchy (policy → framework → procedure → guideline) and meet the standard that a supervisor would expect during an inspection. A data management assessment should map each of AMLA's 176+ data points against available systems and classify them by implementation complexity.

**The modules and their purpose:**

**1.1 AMLR Gap Analysis** — Takes a regulation, maps it against your current state, and produces a scored gap matrix with prioritised remediation actions. Uses deep investigative thinking. The output should include traffic-light assessment, detailed findings per article, dependency mapping, and an implementation roadmap with realistic timelines.

**1.2 Document Creation** — Produces policy documents, procedures, governance frameworks, and board reports. Understands document hierarchies and regulatory expectations. A good policy document should be auditable — meaning a regulator can trace from the policy to the underlying regulatory requirement.

**1.3 Sanctions Advisory** — Regime briefings, screening assessment, policy review, and incident response. Output should include clear operational impact analysis — not just what the sanctions say, but what they mean for your specific transaction flows and customer base.

**1.4 Regulatory Monitor** — Analyses new regulations and consultation papers. Compares new requirements against previous versions. Good output identifies not just what changed, but what the change means operationally — who needs to do what differently, by when.

**1.5 Training Content Creator** — Training materials tailored to different audiences: board (governance), compliance (operational), front-line (red flags), operations (process changes). Good training is audience-appropriate — a board member needs different content than a KYC analyst.

**1.6 AMLA Data Management** — Readiness assessment for AMLA's data collection requirements. Encodes the insight that ~45% of data points are straightforward, ~35% require cross-system work, and ~20% present significant implementation challenges requiring manual work or data that may not exist today.

**1.7 Risk Assessment Support** — Business-wide risk assessments, customer risk assessments, product risk evaluations. A good BWRA is not a checklist — it is a reasoned assessment that connects inherent risks to mitigating controls and produces a residual risk picture.

**1.8 Investigation & Case Support** — Structures SAR analysis, case management workflows, and pattern identification. Strictly analytical — helps structure the investigation, not make compliance decisions.

**1.9 Maturity & Capability Assessment** — Scores AML maturity across governance, policies, systems, data, people, and culture. Good output benchmarks against industry standards and produces a capability improvement roadmap.

**1.10 Regulatory Response Drafter** — Drafts responses to supervisory findings. Good regulatory correspondence is factual, structured, acknowledges findings appropriately, and presents remediation plans with credible timelines.

**1.11 Compliance Calendar** — Tracks deadlines, consultation periods, and implementation dates. Value is in proactive alerting rather than reactive scrambling.

**1.12 Transaction Monitoring Design** — Rule design, scenario analysis, threshold optimisation. Good TM design balances detection effectiveness against false positive volumes — the module helps calibrate this balance.

**Where to take it next:** A gap analysis naturally flows to → **Area 11: Project Management** (to plan the remediation), → **Area 2: Legal** (to interpret ambiguous regulatory requirements), → **Area 10: Data & Analytics** (to address data gaps identified in the assessment), and → **Area 22: Communication** (to prepare board reporting and stakeholder updates). An AMLR implementation programme will likely touch all four of these areas in sequence.

---

### Area 2: Legal & Regulatory

**What matters:** Legal analysis is governed by statute, case law, and professional standards of legal practice. Precision matters — the difference between "shall" and "should" in a regulation is the difference between a binding obligation and guidance. Legal methodology follows established patterns: identify the applicable law, interpret its requirements, assess compliance, identify risks, and recommend actions.

**What you bring:** The specific regulations you need interpreted, your current contracts or agreements, your organisational context, and your jurisdiction. The more specific you are about your situation, the more precise the legal analysis becomes.

**What good looks like:** A regulatory interpretation should clearly distinguish between binding obligations and guidance, flag genuine ambiguity rather than glossing over it, and present actionable conclusions with supporting reasoning. A contract review should identify risks systematically, flag missing clauses, and prioritise findings by severity. All legal output should include appropriate caveats — this is AI-assisted analysis, not legal advice.

**Where to take it next:** Legal analysis often flows to → **Area 1: FCP** (when the regulation is AML-related), → **Area 3: Audit** (to verify compliance with legal requirements), → **Area 11: Project Management** (to implement legal requirements), and → **Area 22: Communication** (to explain legal obligations to stakeholders).

**Key modules:** Regulatory Interpretation, Contract Review & Analysis, Legal Brief Creator, Compliance Framework Builder, Regulatory Change Impact, GDPR & Data Privacy, Corporate Governance, Dispute Analysis, Licensing & Authorisation, Cross-Border Regulatory Comparison.

---

### Area 3: Audit & Assurance

**What matters:** Audit is one of the most standardised professional domains. International Standards on Auditing (ISA), COSO Internal Control Framework, and Institute of Internal Auditors (IIA) standards provide clear, codified methodologies. Every audit follows the same lifecycle: planning, risk assessment, fieldwork, finding documentation, reporting, and follow-up. Quality standards (ISQM) define what a good audit looks like.

**What you bring:** The scope of your audit (which process, control, or entity), previous audit findings and their status, relevant policies and procedures, control documentation, and any risk indicators you have identified. For internal audit, bring your annual audit plan and the risk assessment that underlies it.

**What good looks like:** Audit findings should follow the condition-criteria-cause-effect-recommendation (CCCEC) structure. Each finding should identify what was found, what should have been, why it happened, what the impact is, and what should be done. An audit report should be balanced, evidence-based, and clearly distinguish between high-risk findings that require immediate action and lower-risk observations. Root cause analysis should go beyond symptoms.

**Where to take it next:** Audit findings flow to → **Area 11: Project Management** (to plan remediation), → **Area 8: Risk Management** (to update the risk register based on audit findings), → **Area 2: Legal** (when findings have regulatory implications), and → **Area 22: Communication** (to present findings to audit committees and boards).

**Key modules:** Audit Planning, Control Testing Design, Finding & Observation Drafting, Audit Report Writing, Follow-up & Remediation Tracking, Internal Control Framework Assessment, Process Walkthrough Documentation, Data Analytics for Audit, Quality Assurance Review, Audit Committee Reporting.

---

### Area 4: Client Engagement & Consulting

**What matters:** Consulting follows a lifecycle: business development, scoping, planning, execution, delivery, and knowledge transfer. Each phase has established best practices. A good proposal is different from a good scope document, which is different from a good status report. The consulting playbook emphasises clarity of communication, actionable recommendations, and client value articulation.

**What you bring:** Your client context, the problem you are trying to solve, your team composition, your timeline, and your understanding of stakeholder dynamics. For proposals, bring the client's brief or RFP. For status reports, bring your project plan and current progress.

**What good looks like:** A proposal should articulate the problem clearly, present a structured approach, demonstrate relevant expertise, and quantify expected value. A status report should give a busy executive a clear picture in 30 seconds. A finding presentation should make the problem tangible and the recommendation actionable. Everything should pass the "so what" test — every page should have a clear point.

**Where to take it next:** Client engagement work flows naturally in all directions — the whole point of consulting is to hand off into domain-specific areas. From a scoping phase, work flows to → whichever domain the engagement covers (Areas 1-30). From delivery, it flows to → **Area 22: Communication** (stakeholder management) and → **Area 11: Project Management** (implementation tracking).

**Key modules:** Proposal & Scope Writer, Engagement Planning, Status & Progress Reporting, Finding Presentation Builder, Knowledge Transfer Documentation, Stakeholder Mapping & Communication, Benchmark & Peer Comparison, Client Readiness Assessment.

---

### Area 5: Banking & Financial Services

**What matters:** Banking is governed by an extensive regulatory framework — CRR/CRD for capital requirements, PSD2/PSD3 for payments, BRRD for resolution, MiFID II for markets, and national supervisory expectations on top. Beyond regulation, banking follows established operational frameworks for credit underwriting, treasury management, and product governance. The playbook is dense but well-defined.

**What you bring:** Your institution's specific context — licence type, product portfolio, customer segments, geographic footprint, current regulatory posture, and strategic priorities. For credit analysis, bring the credit file. For regulatory capital, bring your current capital ratios and planned activities.

**What good looks like:** Banking output must be quantitatively rigorous and regulatorily precise. A credit analysis should produce a structured assessment with clearly articulated risk factors, mitigants, and a supported recommendation. A regulatory capital assessment should show calculations, not just conclusions. A payment systems review should map technical infrastructure against regulatory requirements with gap identification.

**Where to take it next:** Banking analysis connects broadly — to → **Area 1: FCP** (AML compliance), → **Area 8: Risk Management** (operational and model risk), → **Area 2: Legal** (regulatory interpretation), → **Area 9: Cybersecurity** (DORA compliance), and → **Area 10: Data & Analytics** (regulatory reporting data readiness).

**Key modules:** Credit Analysis & Underwriting, Payment Systems & Infrastructure, Regulatory Capital Assessment, Treasury & ALM Analysis, Product Development Assessment, Customer Segmentation Analysis, Digital Banking Strategy, Correspondent Banking Review, Stress Testing Framework, Regulatory Reporting Readiness.

---

### Area 6: Investment & Asset Management

**What matters:** Investment management follows established professional standards — GIPS for performance reporting, AIFMD/UCITS for fund governance, fiduciary duty frameworks, and ESG integration standards. Portfolio analysis, due diligence, and investment committee processes all have defined structures.

**What you bring:** Portfolio data, investment mandates, performance benchmarks, fund documentation, and your investment philosophy or constraints. For due diligence, bring the target fund or investment documentation.

**What good looks like:** Investment analysis should be evidence-based, clearly structured, and explicit about assumptions and risks. A portfolio attribution report should decompose performance into understandable factors. An investment committee paper should present information in the decision-making format the committee expects.

**Where to take it next:** Investment work flows to → **Area 8: Risk Management** (portfolio risk assessment), → **Area 18: ESG** (ESG integration assessment), → **Area 2: Legal** (regulatory compliance AIFMD/UCITS), and → **Area 22: Communication** (investor reporting).

**Key modules:** Portfolio Analysis & Attribution, Fund Governance Assessment, Market Research & Outlook, Investment Committee Papers, ESG Integration Assessment, Alternative Investment Due Diligence, Performance Benchmarking, Regulatory Compliance (AIFMD, UCITS).

---

### Area 7: Insurance

**What matters:** Insurance is shaped by Solvency II for prudential requirements, IFRS 17 for accounting, IDD for distribution, and DORA for operational resilience. Actuarial science provides quantitative frameworks. Underwriting, claims management, and product design all follow established methodologies.

**What you bring:** Your product portfolio, claims data, current Solvency II position, and the specific regulatory question or business problem you are addressing.

**What good looks like:** Insurance output should balance technical actuarial rigour with business clarity. A Solvency II assessment should quantify capital impacts. An IFRS 17 analysis should address measurement model selection with clear reasoning. Product design output should consider regulatory constraints alongside commercial viability.

**Where to take it next:** → **Area 8: Risk Management** (ERM), → **Area 13: Accounting** (IFRS 17 reporting), → **Area 2: Legal** (regulatory interpretation), → **Area 9: Cybersecurity** (DORA compliance).

**Key modules:** Underwriting Analysis Support, Claims Assessment Framework, Solvency II Compliance, IFRS 17 Implementation, Product Design Assessment, Distribution Channel Analysis, Reinsurance Strategy Review.

---

### Area 8: Risk Management (Enterprise)

**What matters:** Enterprise risk management follows well-established frameworks — COSO ERM, ISO 31000, Basel standards for banking risk, and sector-specific risk standards. The playbook covers risk identification, assessment, mitigation, monitoring, and reporting. Risk appetite frameworks, three-lines-of-defence models, and key risk indicators (KRIs) are standard tools.

**What you bring:** Your organisation's risk register, risk appetite statement, previous risk assessments, material incident history, and the specific risk domain you want to assess (operational, model, third-party, emerging).

**What good looks like:** A risk assessment should be systematic, not ad hoc. It should use consistent methodology, clearly distinguish between inherent and residual risk, articulate control effectiveness, and produce actionable outputs — not just risk scores, but prioritised mitigation actions with owners and timelines. A risk appetite framework should connect board-level appetite statements to operational limits and escalation triggers.

**Where to take it next:** Risk management is a connecting hub. Outputs flow to → **Area 3: Audit** (audit plan informed by risk assessment), → **Area 11: Project Management** (mitigation project planning), → **Area 22: Communication** (board risk reporting), and → **Area 9: Cybersecurity** (IT and cyber risk specifically).

**Key modules:** Enterprise Risk Register Development, Operational Risk Assessment, Model Risk Management, Stress Testing & Scenario Analysis, Risk Appetite Framework, Third-Party Risk Assessment, Business Continuity Planning, Emerging Risk Identification.

---

### Area 9: Cybersecurity & Information Security

**What matters:** Cybersecurity follows established frameworks — NIST Cybersecurity Framework, ISO 27001/27002, and increasingly EU regulation through DORA and NIS2. The playbook covers asset management, threat assessment, vulnerability management, incident response, and security architecture review. These frameworks define clear maturity levels and control requirements.

**What you bring:** Your current security posture — existing policies, architecture documentation, previous assessment findings, threat landscape relevant to your sector, and the specific framework you need to assess against (DORA, NIS2, ISO 27001, NIST).

**What good looks like:** A DORA gap analysis should systematically map requirements against current capabilities with clear gap identification and remediation priorities. An incident response plan should be actionable — specific enough to execute under pressure, not a theoretical document that sits on a shelf. Security awareness training should be tailored to actual threats your organisation faces.

**Where to take it next:** → **Area 8: Risk Management** (integrate cyber risk into ERM), → **Area 16: Software Engineering** (security code review and architecture), → **Area 11: Project Management** (remediation programme), → **Area 12: Education** (security awareness programme design).

**Key modules:** DORA Compliance Assessment, NIS2 Gap Analysis, Security Architecture Review, Vulnerability Assessment Planning, Incident Response Planning, Security Awareness Training, Third-Party ICT Risk, Penetration Test Planning.

---

### Area 10: Data & Analytics

**What matters:** Data management follows established frameworks — DAMA-DMBOK for data management, BCBS 239 for banking data governance, and emerging AI governance standards. Data quality dimensions (accuracy, completeness, timeliness, consistency) are well-defined. Data strategy, governance, and architecture have mature professional methodologies.

**What you bring:** Your current data landscape — systems, data flows, known quality issues, strategic priorities. For data quality assessment, bring sample data dictionaries and known problem areas. For AI readiness, bring your use cases and current capabilities.

**What good looks like:** A data strategy should connect to business objectives — not just describe the data, but explain why it matters and what capabilities it enables. A data quality assessment should quantify issues (not just list them) and prioritise remediation by business impact. A governance framework should be implementable — clear roles, clear decision rights, clear escalation paths.

**Where to take it next:** Data is foundational to everything. Outputs flow to → **Area 1: FCP** (AMLA data readiness), → **Area 8: Risk Management** (data for risk models), → **Area 16: Software Engineering** (data architecture implementation), → **Area 11: Project Management** (data remediation programme).

**Key modules:** Data Strategy Development, Data Quality Assessment, Data Governance Framework, Business Intelligence Requirements, Machine Learning Readiness, Data Architecture Review, Master Data Management, Privacy-by-Design Assessment.

---

### Area 11: Project Management & Delivery

**What matters:** Project management has some of the most codified professional standards of any domain — PMI's PMBOK, PRINCE2, Agile Manifesto, SAFe, Scrum Guide. Every project follows a lifecycle: initiation, planning, execution, monitoring, and closure. Quality is defined by delivery on scope, time, budget, and stakeholder satisfaction.

**What you bring:** Your project charter or brief, your team composition, your timeline constraints, your stakeholder map, and any existing project documentation. For status reporting, bring your current plan and progress data.

**What good looks like:** A project charter should clearly define scope, objectives, success criteria, governance, and key milestones. A status report should give a busy sponsor a clear picture in 30 seconds — are we on track, what are the risks, what decisions are needed. A risk log should be living and actionable, not a compliance exercise. The project leader module in openEXPERT is unique — it can conduct virtual standups, track timeline status, identify dependencies, and delegate task analysis to other domain-specific modules.

**Where to take it next:** Project management is the orchestration layer for everything else. From a project plan, work flows to → **Area 22: Communication** (stakeholder updates), → **Area 20: Operations** (process changes), → **Area 14: HR** (change management and team development), and → whichever domain area the project addresses.

**Key modules:** Project Planning & Charter, Agile Sprint Planning, Waterfall Phase Planning, Programme Management, Risk & Issue Log, Stakeholder Communication Plan, Resource Planning, Status Reporting, Retrospective Facilitation, Change Management Planning.

---

### Area 12: Education & Teaching

**What matters:** Pedagogical frameworks — Bloom's Taxonomy for learning objectives, constructive alignment for curriculum design, formative and summative assessment standards, differentiated instruction approaches. Education has well-researched best practices for how people learn, how to assess learning, and how to design effective instruction.

**What you bring:** Your subject area, your learner profile (age, level, background), your curriculum requirements or standards, and your teaching context (classroom, online, hybrid). For assessment design, bring your learning objectives.

**What good looks like:** A lesson plan should align learning objectives, activities, and assessment (constructive alignment). An assessment should test what it claims to test (validity) and do so consistently (reliability). A curriculum design should show clear progression and build on prior learning. Good educational content is not just accurate — it is pedagogically sound.

**Where to take it next:** → **Area 29: Academic & Research** (for research-informed teaching), → **Area 15: Branding & Creative** (for engaging educational materials), → **Area 22: Communication** (for parent/stakeholder communication), → **Area 11: Project Management** (for curriculum rollout planning).

**Key modules:** Curriculum Design, Lesson Plan Creator, Assessment & Exam Generation, Rubric Development, Student Progress Analysis, Learning Resource Curation, Feedback & Grading Assistant, Research-Based Teaching Methods.

---

### Area 13: Accounting & Tax

**What matters:** Accounting follows IFRS or local GAAP standards with precise requirements for recognition, measurement, presentation, and disclosure. Tax follows statute and case law. Both are domains where accuracy is non-negotiable and professional standards (ISA, ethical codes) define quality. The playbook is the standard itself.

**What you bring:** Financial data, transaction details, your current reporting framework, and the specific accounting question or tax scenario. For IFRS guidance, specify the standard and the transaction type.

**What good looks like:** Financial analysis should be technically accurate and clearly presented. Tax planning should identify opportunities within legal boundaries and flag risks explicitly. IFRS guidance should cite specific paragraphs and provide worked examples. All output carries appropriate caveats — AI-assisted analysis, not professional accounting advice.

**Where to take it next:** → **Area 3: Audit** (audit preparation and response), → **Area 2: Legal** (tax law interpretation), → **Area 17: Strategy** (financial implications of strategic decisions), → **Area 5: Banking** (regulatory capital and financial reporting).

**Key modules:** Financial Statement Analysis, Tax Planning & Optimisation, IFRS Application Guidance, Management Accounting Design, Audit Preparation, Transfer Pricing Assessment, Budget & Forecast Support.

---

### Area 14: Human Resources & People

**What matters:** HR follows established frameworks for talent management, organisational design, compensation benchmarking, and employment law compliance. Professional bodies (CIPD, SHRM) define best practices. Labour law varies by jurisdiction but the analytical frameworks are transferable.

**What you bring:** Your organisational structure, headcount data, current HR policies, the specific role or team you are working with, and your strategic context (growth, restructuring, transformation).

**What good looks like:** A job description should clearly differentiate between requirements and nice-to-haves, avoid bias in language, and accurately reflect the role. An organisational design should align structure to strategy with clear reporting lines and decision rights. A workforce plan should be data-informed and connected to business objectives, not just a headcount exercise.

**Where to take it next:** → **Area 12: Education** (L&D programme design), → **Area 22: Communication** (internal communications), → **Area 11: Project Management** (change management during transformation), → **Area 2: Legal** (employment law compliance).

**Key modules:** Job Description & Role Design, Recruitment Process Design, Performance Management Framework, Compensation & Benefits Analysis, Organisational Design, Employee Engagement Analysis, Learning & Development Strategy, Workforce Planning.

---

### Area 15: Branding & Creative

**What matters:** Brand strategy follows established frameworks — brand pyramid, positioning statement, brand architecture, tone of voice guidelines. Creative direction follows brief-driven processes. The playbook comes from marketing science and professional practice — Keller's brand equity model, Aaker's brand identity model, and practical agency methodologies.

**What you bring:** Your brand's current positioning, target audience, competitive landscape, values, and the specific creative challenge you are addressing. For brand strategy, bring any existing brand documentation. For content, bring your brief and audience definition.

**What good looks like:** A brand strategy should articulate a clear, differentiated positioning that connects to audience needs and is defensible against competitors. A creative brief should be specific enough to guide execution without constraining creativity. Content should be on-brand, on-audience, and purposeful — every piece should serve a defined objective.

**Where to take it next:** → **Area 22: Communication** (multi-channel deployment), → **Area 21: Sales** (value proposition alignment), → **Area 17: Strategy** (brand-led business development), → **Area 28: Startups** (brand identity for new ventures).

**Key modules:** Brand Strategy Development, Visual Identity Brief, Content Strategy, Messaging & Positioning, Campaign Planning, Brand Audit, Social Media Strategy, Creative Brief Development.

---

### Area 16: Software Engineering & Code

**What matters:** Software engineering follows established standards — clean code principles, SOLID design, architectural patterns (microservices, event-driven, layered), testing methodologies, and code review best practices. Quality is defined by maintainability, reliability, performance, and security. Documentation standards (API docs, architecture decision records) are well-established.

**What you bring:** Your codebase or architecture documentation, your technical requirements, your constraints (performance, security, compliance), and the specific problem you are solving. For code review, bring the code. For architecture review, bring your system diagrams and requirements.

**What good looks like:** A technical specification should be precise enough to implement from. An architecture review should identify risks, bottlenecks, and improvement opportunities with actionable recommendations. Code review feedback should be constructive, specific, and prioritised by impact. Documentation should be written for its audience — API docs for developers, architecture overviews for stakeholders.

**Where to take it next:** → **Area 9: Cybersecurity** (security review), → **Area 10: Data** (data architecture), → **Area 11: Project Management** (sprint planning and delivery tracking), → **Area 20: Operations** (deployment and infrastructure).

**Key modules:** Architecture Review & Documentation, Code Review Assistant, Technical Specification Writer, API Design Review, Database Design Assessment, DevOps Pipeline Review, Technical Debt Assessment, Migration Planning, Performance Analysis, Security Code Review.

---

### Area 17: Strategy & Business Development

**What matters:** Strategy follows frameworks from Porter (competitive strategy), Osterwalder (business model canvas), Ansoff (growth matrix), Blue Ocean, and McKinsey's 7S. Market analysis has established methodologies for sizing, segmentation, and competitive assessment. M&A due diligence follows well-defined playbooks.

**What you bring:** Your company's current position, market data, competitive landscape, strategic objectives, and the specific strategic question you are addressing. For M&A, bring the target information and your investment thesis.

**What good looks like:** A market analysis should be data-informed, not speculative — clear methodology, defensible sizing, and actionable segmentation. A competitive assessment should go beyond feature comparison to understand strategic positioning and sustainable advantages. A business model canvas should reveal assumptions that need testing, not just describe what exists.

**Where to take it next:** → **Area 28: Startups** (for new venture assessment), → **Area 15: Branding** (brand strategy from positioning), → **Area 11: Project Management** (strategy implementation), → **Area 13: Accounting** (financial modelling for strategic decisions).

**Key modules:** Market Analysis & Sizing, Competitive Intelligence, Business Model Canvas, M&A Due Diligence, Partnership Assessment, Go-to-Market Strategy, Scenario Planning, Strategic Planning Facilitation.

---

### Area 18: Environment, Sustainability & ESG

**What matters:** ESG reporting is rapidly moving from voluntary to mandatory. CSRD defines reporting requirements for thousands of European companies. EU Taxonomy provides classification criteria. GHG Protocol standardises carbon accounting. TCFD/TNFD frameworks structure climate and nature risk disclosure. The playbook is increasingly regulation-driven.

**What you bring:** Your company's operations data, energy consumption, supply chain information, current sustainability initiatives, and the specific framework or regulation you need to address.

**What good looks like:** A CSRD assessment should systematically map reporting requirements against available data and identify gaps. Carbon accounting should follow GHG Protocol methodology with clear scope 1/2/3 boundaries. EU Taxonomy alignment should assess economic activities against technical screening criteria with documented evidence.

**Where to take it next:** → **Area 13: Accounting** (integrated financial and sustainability reporting), → **Area 8: Risk Management** (climate risk integration into ERM), → **Area 22: Communication** (sustainability reporting and stakeholder engagement), → **Area 19: Procurement** (supply chain sustainability).

**Key modules:** CSRD Compliance Assessment, EU Taxonomy Alignment, Carbon Accounting, ESG Risk Assessment, Sustainability Strategy, Green Bond Framework, Supply Chain Sustainability, Climate Risk Assessment.

---

### Area 19: Procurement & Supply Chain

**What matters:** Procurement follows established methodologies — sourcing strategy, vendor assessment frameworks, contract lifecycle management, and supply chain risk assessment. ISO 20400 covers sustainable procurement. Public procurement follows additional regulatory frameworks.

**What you bring:** Your procurement needs, vendor information, current contracts, supply chain structure, and risk tolerance.

**What good looks like:** A vendor assessment should use consistent, weighted scoring criteria. A contract negotiation brief should identify leverage points and walk-away conditions. A supply chain risk assessment should map vulnerabilities across tiers with probability and impact ratings.

**Where to take it next:** → **Area 2: Legal** (contract review), → **Area 8: Risk Management** (third-party risk), → **Area 18: ESG** (sustainable procurement), → **Area 20: Operations** (supply chain optimisation).

**Key modules:** Vendor Assessment Framework, Contract Negotiation Preparation, Supply Chain Risk Assessment, Procurement Strategy, Cost Analysis & Benchmarking, Supplier Diversity Assessment.

---

### Area 20: Operations & Process Improvement

**What matters:** Lean, Six Sigma, BPR, and continuous improvement methodologies provide well-established frameworks. Process mapping (BPMN), value stream analysis, root cause analysis (5 Whys, fishbone), and KPI design follow standardised approaches.

**What you bring:** Your current processes (documented or described), performance data, pain points, and improvement objectives.

**What good looks like:** A process map should accurately represent how work actually flows (not how it is supposed to flow). An automation assessment should identify opportunities based on volume, complexity, and error rates — not just because automation sounds good. KPIs should be specific, measurable, and connected to business objectives.

**Where to take it next:** → **Area 16: Software Engineering** (automation implementation), → **Area 11: Project Management** (improvement project planning), → **Area 14: HR** (change management for new processes), → **Area 10: Data** (data requirements for process monitoring).

**Key modules:** Process Mapping & Analysis, Lean Assessment, Automation Opportunity Assessment, KPI Design, Capacity Planning, Quality Management System Design.

---

### Area 21: Sales & Customer Success

**What matters:** Sales methodology (MEDDIC, Challenger, SPIN), account planning frameworks, customer journey mapping, and retention analytics provide the playbook. Value proposition design follows established canvas models.

**What you bring:** Your product or service, target customer profile, sales data, current pipeline, and customer feedback or churn data.

**What good looks like:** A sales strategy should connect market opportunity to specific, actionable plays. Account plans should identify stakeholders, decision criteria, and competitive threats with clear next actions. Customer journey maps should identify friction points and opportunities based on evidence, not assumption.

**Where to take it next:** → **Area 15: Branding** (messaging and positioning), → **Area 22: Communication** (customer communications), → **Area 17: Strategy** (market expansion), → **Area 10: Data** (CRM and sales analytics).

**Key modules:** Sales Strategy Development, Account Planning, Customer Journey Mapping, Retention Strategy, Pipeline Analysis, Value Proposition Design.

---

### Area 22: Communication & Stakeholder Management

**What matters:** Communication follows established frameworks — stakeholder mapping, message architecture, channel strategy, and crisis communication protocols. Investor relations follows regulatory disclosure requirements. Internal communications follows change management best practices. Every communication should be tailored to its audience, clear in its purpose, and actionable.

**What you bring:** Your stakeholder landscape, the message you need to communicate, the context and sensitivity involved, and your organisational tone of voice.

**What good looks like:** A crisis communication plan should be executable under pressure — clear roles, pre-drafted templates, escalation paths. Investor materials should balance transparency with strategic messaging. Internal communications should be honest, clear, and address the "what does this mean for me" question that every employee asks.

**Where to take it next:** Communication is the connective tissue between all other areas. Every domain-specific output eventually needs to be communicated — to boards, regulators, customers, employees, or the public. Communication modules serve as the final mile for outputs from all 29 other areas.

**Key modules:** Crisis Communication Planning, Investor Relations Materials, Internal Communication Strategy, Media Relations, Public Affairs Strategy, Annual Report Content, Regulatory Communication.

---

### Area 23: Personal Finance & Wealth

**What matters:** Personal financial planning follows established frameworks — budgeting methodology, compound interest principles, asset allocation theory, tax optimisation strategies, and retirement planning models. Professional financial planning standards (CFP, ISO 22222) define what good advice looks like.

**What you bring:** Your financial situation — income, expenses, assets, liabilities, goals, and time horizon. The more honest and complete the picture, the better the analysis.

**What good looks like:** A budget plan should be realistic and actionable — not aspirational targets that fall apart in week two. Retirement planning should model scenarios with clear assumptions. Tax guidance should identify opportunities within your specific jurisdiction. All output includes appropriate caveats — this is analytical guidance, not regulated financial advice.

**Where to take it next:** → **Area 24: Real Estate** (property investment decisions), → **Area 13: Accounting** (tax implications), → **Area 30: Personal Development** (career strategy influencing income trajectory).

**Key modules:** Budget Planning & Analysis, Retirement Planning, Investment Education, Tax Optimisation Guidance, Insurance Needs Assessment, Debt Management Strategy.

---

### Area 24: Real Estate & Property

**What matters:** Real estate analysis follows established valuation methods (comparable sales, income capitalisation, DCF), due diligence checklists, and market analysis frameworks. Lease review follows commercial property standards. Investment appraisal uses standard financial metrics (IRR, NPV, cap rate, yield).

**What you bring:** Property details, market data, financial parameters, investment criteria, or the specific lease or transaction you are evaluating.

**What good looks like:** A market analysis should be data-informed with clear comparable selection methodology. An investment appraisal should model multiple scenarios with sensitivity analysis on key assumptions. A lease review should identify commercial risks and negotiation opportunities systematically.

**Where to take it next:** → **Area 2: Legal** (property law and contracts), → **Area 13: Accounting** (tax and financial treatment), → **Area 17: Strategy** (portfolio strategy), → **Area 23: Personal Finance** (personal property decisions).

**Key modules:** Market Analysis, Investment Appraisal, Lease Review & Negotiation, Property Due Diligence, Development Feasibility.

---

### Area 25: Healthcare & Life Sciences

**What matters:** Healthcare follows stringent regulatory frameworks — MDR/IVDR for medical devices, GCP for clinical trials, WHO guidelines, and national healthcare standards. Clinical governance, patient safety, and quality improvement have established methodologies (PDSA cycles, root cause analysis, Never Events frameworks).

**What you bring:** Your healthcare context — clinical setting, patient population, regulatory requirements, quality data, and the specific governance or compliance question you are addressing.

**What good looks like:** A clinical governance assessment should be systematic and evidence-based. Regulatory compliance mapping should be thorough and traceable. Health economic analysis should follow established methodologies (QALY, ICER) with transparent assumptions. All healthcare output emphasises safety and evidence-based practice.

**Where to take it next:** → **Area 8: Risk Management** (patient safety risk assessment), → **Area 2: Legal** (healthcare regulatory compliance), → **Area 11: Project Management** (quality improvement projects), → **Area 10: Data** (health data governance).

**Key modules:** Clinical Governance Assessment, Regulatory Compliance (MDR, IVDR), Health Economic Analysis, Patient Safety Framework, Quality Improvement, Health Policy Analysis.

---

### Area 26: Nonprofit & Social Impact

**What matters:** Nonprofits follow established frameworks for governance (charity law, board standards), impact measurement (Theory of Change, Logic Models, SROI), and grant management (funder requirements, reporting standards). The playbook balances mission-driven purpose with operational sustainability.

**What you bring:** Your organisation's mission, programmes, funding landscape, impact data (or what you want to measure), and the specific challenge — whether that is a grant application, a governance review, or an impact evaluation.

**What good looks like:** A grant application should tell a compelling story backed by evidence, with a clear theory of change, realistic budget, and measurable outcomes. An impact measurement framework should capture what matters (not just what is easy to count) and connect activities to outcomes. Governance documentation should meet charity commission or equivalent standards.

**Where to take it next:** → **Area 22: Communication** (donor communication and annual reports), → **Area 13: Accounting** (nonprofit financial management), → **Area 17: Strategy** (strategic planning), → **Area 11: Project Management** (programme implementation).

**Key modules:** Grant Application Writing, Impact Measurement Framework, Nonprofit Governance, Donor Communication, Programme Design & Evaluation, Financial Sustainability Planning.

---

### Area 27: Government & Public Sector

**What matters:** Public sector work follows regulatory and democratic accountability frameworks — public procurement law, freedom of information, impact assessment standards, and digital government strategies. Policy analysis has established methodologies (Green Book appraisal, regulatory impact assessment, cost-benefit analysis).

**What you bring:** The policy area or public service challenge you are addressing, relevant legislation, stakeholder landscape, available data, and political context.

**What good looks like:** A policy analysis should present options with evidence-based assessment of costs, benefits, risks, and distributional impacts. Public procurement should follow legal frameworks meticulously. Digital government strategy should be citizen-centred, not technology-centred.

**Where to take it next:** → **Area 2: Legal** (legislative interpretation), → **Area 22: Communication** (public consultation and citizen engagement), → **Area 10: Data** (open data and digital infrastructure), → **Area 18: ESG** (public sector sustainability obligations).

**Key modules:** Policy Analysis & Drafting, Public Procurement, Digital Government Strategy, Regulatory Impact Assessment, Citizen Service Design, Inter-Agency Coordination.

---

### Area 28: Entrepreneurship & Startups

**What matters:** Startup methodology is well-codified — Lean Startup, Business Model Canvas, pitch deck conventions (Sequoia format), product-market fit frameworks, and funding stage expectations. The playbook covers validation, MVP design, unit economics, and investor communication.

**What you bring:** Your business idea, market observations, customer insights, team composition, financial projections (or assumptions to model), and the specific challenge — whether that is building a business plan, preparing a pitch, or validating product-market fit.

**What good looks like:** A business plan should be investor-ready — clear problem statement, defensible market sizing, credible financial model, and honest risk assessment. A pitch deck should tell a compelling story in 10-15 slides following established conventions. Product-market fit analysis should be evidence-based, not aspirational.

**Where to take it next:** This is where the cross-area power of openEXPERT really shines. From a business plan, the work flows to → **Area 2: Legal** (company formation and contracts), → **Area 16: Software Engineering** (product development), → **Area 15: Branding** (brand identity and positioning), → **Area 21: Sales** (go-to-market), → **Area 13: Accounting** (financial setup), and → **Area 22: Communication** (launch communications). A startup founder can trace an entire journey from idea through launch using interconnected openEXPERT modules.

**Key modules:** Business Plan Development, Pitch Deck Creation, Product-Market Fit Analysis, Startup Legal Setup, Growth Strategy, Funding Strategy.

---

### Area 29: Academic & Research

**What matters:** Academic research follows rigorous methodological standards — research design, literature review methodology, statistical analysis conventions, citation standards, and peer review expectations. The playbook is defined by the research community — APA, Harvard, or discipline-specific conventions for formatting, and established frameworks for methodology (qualitative, quantitative, mixed methods).

**What you bring:** Your research question, your literature base, your methodology (or the need to design one), your data (or data collection plan), and your academic context (degree level, discipline, publication target).

**What good looks like:** A literature review should systematically cover the field, identify gaps, and position the research question. A methodology section should justify design choices with reference to epistemological foundations. Statistical interpretation should be accurate and appropriately cautious. A thesis structure should demonstrate logical progression from question to conclusion.

**Where to take it next:** → **Area 12: Education** (teaching from research), → **Area 22: Communication** (research dissemination), → **Area 17: Strategy** (commercialising research findings), → **Area 30: Personal Development** (academic career planning).

**Key modules:** Literature Review, Research Methodology Design, Academic Paper Structuring, Statistical Analysis Interpretation, Thesis Planning, Peer Review Support, Citation Management.

---

### Area 30: Personal Development & Career

**What matters:** Career development follows established frameworks — competency models, personal branding, networking strategy, negotiation methodology (Harvard Negotiation Project), and career planning models. CV and interview best practices are well-documented and vary by industry and geography.

**What you bring:** Your career history, skills, aspirations, target roles or industries, and the specific challenge — job search, career pivot, negotiation, skill development, or professional branding.

**What good looks like:** A CV should be tailored to the target role, quantify achievements where possible, and follow industry conventions for format and length. Interview preparation should include anticipated questions with structured responses (STAR method). A career strategy should connect short-term actions to long-term objectives with realistic timelines.

**Where to take it next:** → **Area 29: Academic** (further education planning), → **Area 12: Education** (learning plan execution), → **Area 15: Branding** (personal brand development), → **Area 28: Startups** (entrepreneurship as a career path).

**Key modules:** CV & Resume Builder, Cover Letter Writer, Interview Preparation, Career Strategy, Networking & Personal Brand, Learning Plan Development, Negotiation Preparation.

---

## 12. Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic Claude API key (get one at console.anthropic.com)
- A modern web browser

### Installation

```bash
# Clone the repository
git clone https://github.com/danielbardun/openexpert.git
cd openexpert

# Install dependencies
npm install

# Configure your API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Start the application
npm run dev
```

The application runs locally at `http://localhost:3000`. Your data stays on your machine. Only API requests to Claude leave your environment.

### First Steps

1. Set up your identity in "This Is Me" — tell ANTON who you are, what you do, and what context matters for your work
2. Browse the 30 areas and explore the modules that match your needs
3. Start with a module that matches a current task — the guided inputs will walk you through the process
4. Experiment with different output formats and thinking depths
5. Try adding an expert persona for a different perspective on your analysis
6. Export your results and compare against your current workflow

---

## 13. Contribution & Community

### How to Contribute

openEXPERT grows through community contribution. Here's how you can help:

**Contribute a module:** Write a JSON configuration and a markdown system prompt for a domain you know well. Follow the existing module templates and submit a pull request.

**Contribute a persona:** Create an expert persona profile for a professional role you understand deeply. The better the persona description, the more value it adds to analyses.

**Contribute a skill:** Package domain-specific knowledge into a reusable skill. Regulatory frameworks, industry standards, and professional methodologies all make excellent skills.

**Translate:** The i18n framework is ready. Pick a language and translate the UI strings and module descriptions.

**Report issues:** Found a module that produces poor output? A UI that doesn't work? A missing capability? Open an issue.

**Improve prompts:** The quality of openEXPERT is directly proportional to the quality of its system prompts. If you find a module that could be better, improve the prompt and submit it.

### Quality Standards for Contributions

All contributed modules must:

- Be written by someone with professional experience in the domain
- Include clear, specific system prompts (not generic instructions)
- Specify appropriate thinking depth and creativity defaults
- Include at least three guided input fields
- Produce output that a professional in the field would find credible
- Be tested against at least two real-world scenarios before submission

### Community Guidelines

We value: domain expertise, clarity, accessibility, constructive feedback, and professional standards. We do not accept: modules that promote harm, discriminate, provide dangerous advice (medical, legal, financial) without appropriate disclaimers, or violate professional ethics in any domain.

---

## 14. Roadmap

### Phase 1: Foundation (Q1 2026) — Complete

- Core engine with 8 FCP modules
- Knowledge Source System (4 modes)
- Output Format System (22+ formats)
- Claude API integration (Opus 4.6)
- Export pipeline (md/docx/xlsx/pdf)
- Session management
- Local deployment

### Phase 2: Platform Launch (Q2 2026) — In Progress

- Open source release
- Config-driven module architecture
- Area navigation system (30 areas)
- Expert Persona engine
- Transparency toggle (3 levels)
- Project system
- Dashboard shell
- 5 additional areas launched (Legal, Audit, Client Engagement, Banking, Risk Management)

### Phase 3: Feature Complete (Q3 2026)

- Review & Peer Review engine
- Skills Repository with 10+ pre-built skills
- "Build Your Own Module" creator
- Communication & Branding Hub
- Full dashboard with charts and analytics
- 15 additional areas launched

### Phase 4: Ecosystem (Q4 2026)

- Remaining 10 areas launched
- Community contribution framework
- Module and skill sharing
- Advanced cross-area module linking
- Internationalisation (community-driven)
- Enterprise features (audit trails, RBAC)

### Phase 5: Scale (2027+)

- Cloud deployment option
- Multi-tenant SaaS for enterprises
- API for third-party integrations
- Mobile companion application
- Marketplace for premium modules and skills
- Advanced analytics and benchmarking
- Multi-provider AI support (beyond Claude)

This roadmap is indicative and subject to change based on community feedback and development capacity. Open source means the community drives priorities.

---

## 15. FAQ

**Q: Is openEXPERT free?**
A: The software is free and open source (MIT License). You need your own Anthropic Claude API key, which has usage-based costs. Typical sessions cost $0.05–$2.00 depending on model selection and analysis depth.

**Q: Can I use openEXPERT for commercial purposes?**
A: Yes. The MIT License permits commercial use. You can use openEXPERT for client work, internal operations, or as part of a commercial service.

**Q: Is my data safe?**
A: openEXPERT runs entirely locally. Your documents, sessions, and outputs are stored in a SQLite database on your machine. Only API requests to Claude leave your environment. Review Anthropic's privacy policy for details on how API requests are handled.

**Q: Can I use a different AI model?**
A: The current version is optimised for Anthropic Claude. The architecture is designed to support multiple providers in the future. Community contributions for OpenAI, Mistral, or local model support are welcome.

**Q: How accurate are the outputs?**
A: openEXPERT produces output that matches professional quality for structured analytical work. However, AI can make errors, miss nuances, or lack context that a human expert would have. Always review AI-generated output before using it for decisions, especially in regulated or high-stakes contexts.

**Q: Can I create modules for my organisation's specific needs?**
A: Yes. The "Build Your Own Module" feature and the config-driven architecture make it straightforward to create custom modules. You can keep them private or contribute them to the community.

**Q: Who created openEXPERT?**
A: openEXPERT was created by Daniel Bardun, founder of FutureChain AB, drawing on 14+ years of experience in banking, financial crime prevention, and regulatory consulting at institutions including SEB, Sveriges Riksbank, EY, and Advisense.

**Q: How do I get help?**
A: Open an issue on the GitHub repository. The community and maintainers are active and responsive. For enterprise support enquiries, contact via the GitHub repository.

---

## Attribution & Credits

**Creator:** Daniel Bardun — Concept, architecture, domain expertise, prompt engineering

**FutureChain AB** — Corporate entity, intellectual property stewardship

**The open source community** — Future contributors, module authors, translators, and reviewers

**Anthropic** — For building Claude, the AI model that makes openEXPERT possible

---

> *"Everyone talks about AI changing work. But between the promise and the reality, there's a gap — a gap of knowledge, a gap of time, a gap of training. openEXPERT closes all three. We gave the AI a proper professional education, so you don't have to be an AI expert to get expert results. The time you save isn't just efficiency — it's creative freedom."*
>
> — Daniel Bardun, Creator of openEXPERT by ANTON

---

**openEXPERT by ANTON**  
Open Source · Expert-Grade AI · For Everyone  
Version 1.0.0 — February 2026
