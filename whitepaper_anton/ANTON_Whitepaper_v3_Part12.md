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

The configuration defines the module's identity, its pre-configured defaults (so users don't need to make decisions for the 80% case), and guided inputs that help users provide the right context without needing to write prompts.

**2. System Prompt** (`system-prompt.md`)

The heart of the module — a detailed task definition containing: a clear objective statement, step-by-step methodology, output structure template with section definitions, quality criteria (what good output looks like), and common pitfalls to avoid. The quality of this prompt determines the quality of the module's output.

**3. Area Context** (shared across modules in the same area)

Domain background, key regulations and frameworks, common methodologies, and the stakeholder landscape. Area context is injected automatically for all modules within the area, providing shared domain knowledge.

---

### Module Design Best Practices

**Start with a real problem.** Don't create modules for the sake of it. Solve actual pain points. If you've done this task 50 times manually, you know exactly what a good prompt needs to contain.

**Define clear scope.** "AMLR Gap Analysis" (specific) produces better output than "AML Compliance" (too broad). A focused module with a precise methodology will outperform a generic one every time.

**Pre-configure intelligently.** Defaults should work for 80% of use cases. Users can override thinking level, creativity mode, and output formats, but shouldn't need to for the typical scenario.

**Provide guided inputs.** Help users provide the right context without requiring prompt engineering skills. Select fields for common choices (entity type, jurisdiction, focus area), free text for unique context. Three guided inputs minimum.

**Write specific prompts.** "Compare institution's CDD process against AMLR Article 4(1)-(4) requirements, scoring each sub-requirement as Compliant/Partial/Gap" — not "Analyse AML compliance." Specificity is what separates ANTON modules from generic chatbot interactions.

**Test, iterate, improve.** Run the module at least 5 times with different inputs. Check quality scores. Refine the prompt based on weaknesses. Test edge cases (small companies, unusual jurisdictions, incomplete inputs).

---

### The .anton Package Format

Modules can be packaged for sharing using the `.anton` format — a structured ZIP archive containing the module.json, system-prompt.md, area context (if creating a new area), sample inputs and outputs, and metadata (author, version, license, target audience).

A compliance specialist in Singapore can create a module for MAS regulatory analysis, package it as a `.anton` file, and share it with the global community in minutes. A cybersecurity expert in Germany can do the same for BSI IT-Grundschutz. The format is designed for domain experts who know their field but may not be software developers.

---

## §42. Contribution & Community

### How to Contribute

ANTON is open source under the MIT License. The openEXPERT foundation welcomes contributions from anyone with domain expertise and a desire to make professional AI tools accessible.

**Contribute a module:** Write module.json and system-prompt.md. Test with real-world scenarios (minimum 2). Submit a pull request with: module purpose, target users, example inputs, and sample outputs.

**Contribute a skill:** Package domain knowledge (a framework, methodology, or analytical lens) as a reusable skill prompt. Tag appropriately for discoverability. Submit as a pull request.

**Translate:** ANTON's architecture is i18n-ready from day one. Add your language to `src/i18n/locales/`, translate UI strings, and submit a pull request. The community drives localisation — initial platform development focuses on English with the architecture supporting any language.

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

A future marketplace will enable community members to share, discover, and rate modules, skills, areas, and complete workflows. The marketplace supports the `.anton` package format for easy export and import. Contributors can share modules publicly (MIT-licensed, free) or offer premium modules (creator-monetised expertise). User ratings and reviews help surface the highest-quality contributions.

The marketplace is designed so that ANTON grows more powerful over time as more domain experts contribute. A single installation that today covers 29 areas with 238 modules could, through community contribution, expand to hundreds of areas covering every professional domain imaginable.

---

## §43. Competitive Landscape

### Where ANTON Sits

Before adopting ANTON, you might reasonably ask: "Why not just use ChatGPT Plus, or Claude.ai directly, or a specialised platform like Harvey?" The answer depends on what you need.

The AI landscape for professional services has five distinct categories, and ANTON occupies a unique position that none of the others do.

---

### Category A: Vertical AI Platforms (Legal Focus)

**Harvey AI** ($8B+ valuation, $1.2B+ raised from Sequoia, a16z, Kleiner Perkins, OpenAI) serves approximately 100,000 lawyers across 1,000+ organisations with deep legal research, contract analysis, due diligence, and agentic multi-step workflows. Harvey charges approximately $1,200 per lawyer per month with 20-seat minimums — a minimum entry point of roughly $288,000 per year.

**Legora** (formerly Leya, $1.8B valuation, $266M+ raised from Bessemer, ICONIQ, General Catalyst) serves 400+ law firms across 40+ countries with tabular review, document analysis, and a collaboration portal. Swedish origin, expanding globally, with reported pricing at £200+ per lawyer per month.

**What Harvey and Legora validate:** The market is pouring billions into vertical AI for professionals — confirming that practitioners need domain-specific AI, not generic chatbots. Their success proves the thesis that powers ANTON.

**What they don't do:** Both are cloud-only, closed-source, single-vertical (legal and adjacent), and expensive. Neither serves compliance officers, risk managers, auditors, project managers, or the 25+ other professional domains ANTON covers. Neither can run on your own infrastructure. Neither is available to a compliance team at a small fintech that can't afford $288,000/year.

---

### Category B: Open-Source Workflow Automation

**n8n** (100M+ Docker pulls, massive community) provides visual workflow building with 400+ integrations, AI nodes for LLM orchestration, self-hosting capability, and enterprise queue mode handling 220 executions per second. Fair-code licensed with a free community edition and paid enterprise tier.

**What n8n proves:** There is massive demand for self-hosted, open-source AI orchestration. The market wants tools that run on their own infrastructure.

**What n8n doesn't do:** n8n is infrastructure, not expertise. It provides the plumbing — workflow nodes, integrations, scheduling — but contains no domain knowledge. You must build every prompt, every methodology, every quality framework yourself. n8n is the foundation; ANTON is the finished house built on top of it.

---

### Category C: RegTech Point Solutions

Platforms like Flagright, Napier AI, and ComplyAdvantage automate compliance *operations* — transaction screening, sanctions matching, case management, SAR filing. They are operational tools focused on high-volume, real-time processing.

**What they solve:** Operational efficiency in compliance execution.

**What they don't solve:** Compliance *thinking* — gap analyses, implementation planning, policy drafting, regulatory interpretation, risk assessment methodology, training content creation. ANTON sits upstream of every RegTech tool on the market. It automates the strategic and analytical layer that determines how operational tools are configured, what policies govern them, and how their outputs are interpreted.

---

### Category D: AI Coding Tools

Cursor, GitHub Copilot, Claude Code, Loveable, and similar tools optimise for speed from brief to code. They help developers write code faster.

**Where ANTON's Coding Area differs:** Every other AI coding tool starts from "describe what you want, get code." They skip everything that makes real software projects succeed: understanding the full stakeholder landscape, embedding domain expertise into requirements, planning releases, defining acceptance criteria, building governance. ANTON's Coding Area (§28-29) front-loads discovery with 5 expert perspectives (business, compliance, technical, security, legal), creates architecture documents with expert panel review, and generates comprehensive instructions for external coding tools. ANTON functions as the senior architect; tools like Claude Code and Cursor handle implementation.

---

### Category E: General AI Assistants

ChatGPT Plus and Claude.ai (consumer interfaces at $20/month) provide excellent general-purpose AI conversation. They are ideal for brainstorming, quick research, personal productivity, and exploratory questions.

**What they lack for professional use:** Domain-specific expertise (no pre-configured regulatory modules), structured outputs (you format manually), institutional memory (sessions don't build knowledge over time), compliance governance (no audit trails, checkpoint reviews, quality scoring), local-first architecture (data goes to cloud), and batch processing capability.

---

### ANTON's Unique Position

After mapping the full competitive landscape, ANTON's position becomes clear across five differentiators that no other platform combines:

**1. The only multi-domain expert platform (open or closed).** Harvey does legal. Legora does legal. Flagright does AML operations. Nobody covers 29+ professional domains with domain-specific expertise in a single platform. The cross-area capability — a compliance project that spans legal analysis, project management, data governance, and stakeholder communication — is something no competitor matches.

**2. Open source with professional-grade quality.** n8n is open-source but has no domain expertise. Harvey has domain expertise but costs hundreds per seat per month and is closed. ANTON is the only platform combining MIT-licensed open-source availability with 238 professionally engineered modules.

**3. True air-gapped deployment for regulated industries.** Harvey and Legora cannot run without cloud connectivity. ANTON with Ollama models runs on a laptop with no internet connection. For banks with strict data classification policies, defence organisations, and enterprises in jurisdictions with data localisation requirements, this is not a feature — it is a prerequisite.

**4. Multi-LLM architecture with local model support.** ANTON supports 5 providers (Anthropic Claude, OpenAI GPT, Google Gemini, Mistral, and local Ollama). No vendor lock-in. Choose the provider that matches your quality, cost, and privacy requirements per session.

**5. Institutional memory and governance.** Cross-workflow intelligence, knowledge graph, pattern detection, quality ratcheting, checkpoint reviews, compliance-as-code — these features transform ANTON from a tool into an organisational capability that compounds over time.

---

### Honest Positioning

| Feature | ANTON | Harvey AI | Legora | n8n | ChatGPT/Claude.ai |
|---------|-------|-----------|--------|-----|-------------------|
| Domain expertise | 29+ areas, 238 modules | Legal (deep) | Legal | None (build your own) | None |
| Cost | Free + API costs | ~$1,200/user/month | ~£200+/user/month | Free + Enterprise tier | $20/month |
| Data privacy | Local-first | Cloud only | Cloud only | Self-hosted option | Cloud only |
| Open source | MIT License | Closed | Closed | Fair-code | Closed |
| Multi-LLM | 5 providers + Ollama | OpenAI only | Multiple | Any LLM via nodes | Single provider |
| Institutional memory | Knowledge graph + patterns | Limited | Limited | None | Projects (limited) |
| Air-gapped deployment | Full support | Not possible | Not possible | Possible (no AI) | Not possible |
| Structured outputs | 20+ format templates | Legal-specific | Legal-specific | Custom build | Manual formatting |
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

**Can they work together?** Many users will: explore with ChatGPT or Claude.ai (brainstorming, quick research), execute with ANTON (formal deliverables, compliance outputs), validate with consultants (spot-check high-stakes outputs), and implement with Cursor or Claude Code (using ANTON-generated architectural instructions).

**The honest truth:** If you do 1-2 compliance analyses per year, ChatGPT Plus is probably sufficient. If you do 10+ per month, ANTON pays for itself in the first week. If you work in a regulated industry and need audit trails, structured governance, and institutional memory, there is no alternative at any price point.

---

## §44. Roadmap & Future Vision

### Completed (v3.0 — February 2026)

238 modules across 29 expert areas. 7-layer prompt architecture with 4-mode knowledge sources. Multi-LLM support (5 providers including local Ollama). Enterprise security (RBAC, audit trails, budget controls, compliance-as-code). Cross-workflow intelligence (knowledge graph, pattern detection, institutional memory). Workflow automation (12 step types, CRON scheduling, collaborative canvas). AI-Led Software Development (4-tier Coding Area, AI Code Instruction Builder, Project Alignment Reviewer). External Data Integration (PostgreSQL, MySQL, MSSQL, MongoDB, REST APIs, MCP connectivity). Discovery Mode (paper workshop framework, digital guided conversation). Local-first architecture with 5 deployment models (desktop through air-gapped). 82+ database tables, 41+ API routes, 36+ React pages.

---

### In Progress (Q1-Q2 2026)

Mobile responsive UI (final polish). Advanced analytics dashboards. Cloud deployment templates (AWS, Azure, Google Cloud). REST API documentation for programmatic integration. Language localisation — community-driven, with architecture i18n-ready from day one.

---

### Planned (Q3-Q4 2026)

**Community marketplace:** Module, skill, and workflow sharing platform. User ratings and reviews. The `.anton` package format enabling easy distribution. Premium module support for creators who want to monetise domain expertise.

**Enterprise features:** PostgreSQL adapter (replacing SQLite for large-scale deployments). Advanced RBAC (custom permissions per user or team). Enterprise SSO integrations (SAML 2.0, OpenID Connect for Azure AD, Okta, Auth0).

**Expanded connectivity:** Webhook integrations (Slack, Microsoft Teams, Jira, ServiceNow). Zapier and Make.com connectors. REST API for programmatic module execution and workflow triggering. Target: match n8n's 400+ integrations over time.

**AI enhancements:** Multi-modal inputs (images, screenshots, diagrams). Vision support (analyse charts, tables from scanned PDFs). Audio transcription (meeting notes → module inputs).

---

### Long-Term Vision (2027+)

**Open ecosystem:** Marketplace for premium modules (domain experts monetise their expertise globally). Certification program (verified domain experts whose modules carry a quality badge). Partner network (consultancies offering ANTON-powered services to clients).

**SaaS offering:** Hosted version for users who prefer cloud deployment without infrastructure management. Multi-tenant architecture with per-organisation isolation. Enterprise support tiers with SLAs.

**Advanced intelligence:** Predictive analytics (forecast compliance risks before they materialise). Anomaly detection (flag unusual patterns proactively across the knowledge graph). Cross-organisational benchmarking (compare quality scores and coverage across organisations, anonymised and aggregated).

**Global expansion:** Modules for non-EU jurisdictions — US (FinCEN, BSA/AML), APAC (MAS, HKMA, RBI), MENA (CBUAE, SAMA). Localised regulatory knowledge and jurisdiction-specific module variants. Multi-language prompts optimised for each locale.

**Partnership opportunities:** LLM providers (Mistral, Anthropic) for co-development and optimised model support. Government AI sandbox programs in Sweden and the EU for pilot deployments. Academic institutions for research collaboration and module development.

---

### The Compounding Effect

ANTON's architecture creates a compounding value dynamic: every module contributed makes the platform more useful, attracting more users. Every user's work enriches the knowledge graph. Every pattern detected improves future analyses. Every workflow shared saves someone else the setup time.

This is the core thesis behind the open-source approach: when a compliance specialist in Stockholm, a risk manager in Singapore, and an auditor in Nairobi all contribute their domain expertise to the same platform, the combined result is greater than anything any single organisation could build. The whole becomes greater than the sum of its parts.

---

## §45. FAQ

**Q: Is ANTON free?**
A: Yes. The software is free and open source (MIT License). You pay only for LLM API usage (Claude, GPT, Mistral) or nothing at all if you use local Ollama models. Typical costs: $0.02-$5 per session depending on complexity, model, and thinking level.

**Q: Can I use it commercially?**
A: Yes. The MIT License permits commercial use without restriction. Use it for client work, internal operations, or as part of a commercial service. Build a consulting practice around it. Embed it in your product. The licence is deliberately permissive.

**Q: Is my data safe?**
A: Yes. ANTON runs locally on your infrastructure. Documents, sessions, and outputs are stored in a SQLite database on your machine. Only LLM API requests leave your environment (and Anthropic does not train on commercial API data). For maximum privacy, use Ollama models — nothing leaves your network.

**Q: Can I use different AI models?**
A: Yes. ANTON supports Anthropic Claude (Opus, Sonnet, Haiku), OpenAI GPT, Google Gemini, Mistral, and local Ollama models. Switch models per session based on quality needs, cost constraints, or privacy requirements.

**Q: How accurate are the outputs?**
A: ANTON produces professional-quality output for structured analytical work. The 7-layer prompt architecture, domain-specific system prompts, and quality governance framework (compliance rules, quality scoring, expert panel reviews) significantly raise the baseline above generic AI interactions. However, AI can make errors. Always review outputs before using them for decisions, especially in regulated contexts.

**Q: Can I create custom modules?**
A: Yes. The "Build Your Own Module" interface provides a visual editor for creating modules with custom configurations, guided inputs, and system prompts. Keep them private or share with the community via pull request.

**Q: Does it work offline?**
A: Partially. The UI, database, all modules, and all local functionality work without internet connectivity. LLM inference requires either an API connection (for cloud-hosted models) or local Ollama models. For fully offline capability, deploy with Ollama in an air-gapped environment.

**Q: What about data residency (GDPR)?**
A: Data is stored locally by default — fully aligned with GDPR Article 5 (data minimisation). For strict data residency requirements within the EU, use Mistral (EU-based provider, Paris headquarters) or local Ollama (nothing leaves your network). ANTON supports all privacy postures from "API calls to a US provider" to "complete air-gapped isolation."

**Q: Can multiple users collaborate?**
A: Yes. Multi-user support with RBAC (admin, analyst, user roles). The Collaborative Canvas (§27) enables team workflows with step assignment, parallel reviews (4 consensus modes), threaded comments, and SLA tracking.

**Q: How do I get help?**
A: GitHub Issues for bug reports. GitHub Discussions for questions, feature requests, and community conversation. This whitepaper serves as comprehensive documentation. For enterprise deployment support, reach out via GitHub.

**Q: Who created this?**
A: Daniel Bardun (14+ years in banking, financial crime prevention, and regulatory consulting at SEB, Sveriges Riksbank, EY, and Advisense) and FutureChain AB. Built with the conviction that professional-grade AI capability should be available to everyone.

**Q: What's the catch?**
A: There is no catch. Open source means transparent. The openEXPERT philosophy — "give it away, hold nothing back, and let the work speak" — drives every decision. We believe this capability should power-charge every sector and enable more people to do valuable work. When more people can do valuable work, everyone benefits.

---

## Conclusion

ANTON, built on the openEXPERT foundation, represents a new way of working with AI — one where the AI arrives trained, governed, and ready to contribute as a professional coworker rather than a blank-slate assistant that needs constant instruction.

**What makes it different:**

Expert training built in — 238 modules with professional-grade system prompts across 29 domains, designed by practitioners who have done this work for years. Complete transparency — see exactly how ANTON thinks through configurable thinking levels, from quick responses to deep investigation. Local-first — your data never leaves your machine unless you explicitly choose cloud-hosted models. Enterprise-ready — RBAC, audit trails, budget controls, compliance-as-code, and checkpoint governance. Intelligent — learns from your work through cross-workflow intelligence, building organisational knowledge that compounds over time. Collaborative — multi-human workflows with parallel reviews, consensus modes, and institutional memory. Open source — free, transparent, community-driven, MIT-licensed. No lock-in, no subscription, no artificial limitations.

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
**License:** MIT
**Repository:** https://github.com/futurechain/anton
**Community:** GitHub Discussions
**Support:** GitHub Issues

---

> *"Everyone talks about AI changing work. But between the promise and the reality, there's a gap — a gap of knowledge, a gap of time, a gap of training. openEXPERT closes all three. We gave the AI a proper professional education, so you don't have to be an AI expert to get expert results. The time you save isn't just efficiency — it's creative freedom."*
>
> — Daniel Bardun, Creator of openEXPERT by ANTON

---

**END OF WHITEPAPER**
