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

This downloads approximately 400 MB of dependencies — React, Express, Claude SDK, export libraries, and all module definitions. Takes 3-5 minutes on typical broadband.

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

This creates `data/workbench.sqlite` with all 82 tables across 16 functional groups. Seeds RBAC roles (3 roles, 24 permissions), 8 compliance rules, and 5 pattern detector configurations.

**Step 5: Start application**

```bash
pnpm run dev
```

**Step 6: Open browser**

Navigate to `http://localhost:5173`

**Expected output:**

```
[server] openEXPERT by ANTON — server running on http://localhost:3001
[server] [module-loader] Loaded 29 area(s), 238 module(s)
[client] Vite dev server running on http://localhost:5173
```

---

### First Steps

**1. Create your profile** (optional but recommended)

Click "Settings" → "Profile." Enter your name, role, organisation, jurisdiction, and focus areas. This information is used by ANTON to personalise module recommendations and tailor output to your context.

**2. Browse expert areas**

The sidebar lists all 29 areas. Click any area to expand and see its modules. Click a module to open the execution interface.

**3. Run your first module**

*Quick Question (Brief Me mode):* Click "Brief Me" in the sidebar. Type a question — for example, "What are the key requirements of AMLR Article 4?" Click "Ask ANTON." A focused response appears in approximately 30 seconds, using Sonnet for fast, cost-effective answers.

*Full Module (AMLR Gap Analysis):* Navigate to Area 1: Financial Crime Prevention → AMLR Gap Analysis. Complete the guided inputs: Entity Type (Bank), Jurisdiction (Sweden), Focus Areas (Customer Due Diligence, Transaction Monitoring). Review the pre-configured settings: Thinking (Investigate), Creativity (Strict), Output Formats (Executive Summary + Gap Scoring Matrix + Action Plan). Optionally upload a policy document or regulation PDF. Click "Run Analysis." Wait 3-5 minutes for Investigate-level analysis. Review the multi-deliverable output. Export to DOCX or XLSX.

---

### Understanding Costs

**Typical session costs (February 2026 pricing):**

| Module Type | Model | Thinking | Tokens (est.) | Cost (est.) |
|-------------|-------|----------|---------------|-------------|
| Quick question | Haiku 4.5 | quick | 5k | $0.01 |
| Standard analysis | Sonnet 4.5 | think | 40k | $0.60 |
| Gap analysis | Opus 4.6 | think_hard | 120k | $2.50 |
| Regulatory submission | Opus 4.6 | investigate | 180k | $5.00 |

**Cost optimisation principles:**

Use Haiku for simple questions (10x cheaper than Opus). Use Sonnet for most analytical work (good quality-to-cost ratio). Reserve Opus with Investigate thinking for critical deliverables — regulatory submissions, board reports, complex multi-document analysis. Enable prompt caching: running related analyses back-to-back provides up to 90% cost reduction on repeated context.

---

## §39. Power User Guide

### Your First Hour with ANTON

A step-by-step walkthrough of what happens when you use ANTON for the first time. Real timings, real costs, real outputs.

---

#### Minutes 0-15: Installation & Setup

Follow the installation steps above. Total time: 10-15 minutes depending on network speed and whether you already have Node.js installed.

When you open the browser, you see: a dashboard with 29 expert areas, a welcome message, quick stats showing 238 available modules, and navigation to Brief Me, Guide Me, Modules, Workflows, Intelligence, and Settings.

---

#### Minutes 15-30: Your First Module

**Scenario:** You are a compliance officer at a Nordic bank. You need to analyse your Transaction Monitoring Policy against the new AMLR (Regulation 2024/1624).

**Navigate to module (30 seconds):** Click "Financial Crime Prevention" → "AMLR Gap Analysis."

**Upload your document (1 minute):** Click "Upload Files" in the Knowledge Sources panel. Select your bank's TM policy (e.g., `TM_Policy_v2.3.pdf`, approximately 40 pages). Wait for upload and text extraction. Status shows: "1 file uploaded (42,000 words)."

**Configure knowledge sources (1 minute):** Enable Claude's Knowledge + Web Search (for latest EBA guidance) and Local Folders (your uploaded policy). Token estimate displayed: approximately 65,000 tokens, well within the context window.

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

Click "Run Analysis." The system assembles the 7-layer prompt, loads your PDF into context, configures Opus 4.6 with Investigate thinking, and begins processing. You see extended thinking appear in real-time ("Planning analysis structure... Reviewing AMLR Articles... Cross-referencing policy sections... Identifying gaps..."), followed by four deliverables streaming in: Gap Scoring Matrix, Executive Summary, Action Plan, and Detailed Findings.

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

**Export to DOCX (30 seconds):** Click "Export to DOCX." The system generates a Word document with professional formatting, all four deliverables, table of contents, and page numbers. Download: `AMLR_Gap_Analysis_20260224.docx` (18 pages, 142 KB).

**Export gap matrix to Excel (30 seconds):** Click "Export to XLSX." Sheet 1 contains the Gap Scoring Matrix with columns for Article, Requirement, Current State, Gap Score (RAG), Priority, and Notes. Sheet 2 contains the Action Plan with Owner, Deadline, Effort, and Dependencies. Conditional formatting highlights high-priority gaps in red.

**Iterate (2 minutes):** You want more detail on Article 18 (cooperation with FIUs). Type a follow-up question:

```
Expand on Article 18 gaps. What specific changes are needed
to our SAR filing procedures?
```

Prompt caching kicks in — the previous 68k tokens of context are cached at 90% discount. The follow-up costs $0.18 instead of $2.94. You receive a focused 2-page deep dive on Article 18 with specific procedure changes, template language, and an implementation timeline.

**Total session cost: $3.12 for a 21-page analysis.**

---

#### Minutes 45-60: Explore Other Features

**Brief Me (3 minutes):** Quick questions answered in 45 seconds. "What's new in AMLR compared to the 4th AMLD?" — a 1-page summary for $0.04.

**Guide Me (4 minutes):** The wizard asks what you need help with, what type of output, and your role. ANTON recommends the best-fit modules with match percentages.

**Skills Library (2 minutes):** Browse 47 reusable prompt skills. Try "Devil's Advocate" — adds assumption-challenging to any module.

**Workflows (3 minutes):** Preview pre-built templates like "Monthly Regulatory Update." Schedule for automated execution.

**Intelligence Dashboard (3 minutes):** Preview cross-workflow intelligence. After one session, your knowledge graph already contains entities (your bank, AMLR, TM systems). Quality score for your first session: 92/100.

---

#### End of Hour: What You've Accomplished

In 60 minutes, you created: an 18-page AMLR Gap Analysis (4 deliverables in Word and Excel), a regulatory briefing, module recommendations for sanctions policy, and a workflow template for monthly updates.

**Total cost:** $3.16 (gap analysis $2.94 + iteration $0.18 + quick question $0.04).

**Consultant equivalent value:** 12-16 hours × $200/hour = $2,400-3,200. Your cost: $3.16. Savings: 99.87%. Time saved: 11-15 hours.

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
| Transaction monitoring review | ~50k input, ~6k output | Opus 4.6 | $2.10 | 3 min |

**Large tasks ($5-$20):**

| Task | Tokens | Model | Cost | Time |
|------|--------|-------|------|------|
| Full compliance framework (10+ docs) | ~120k input, ~15k output | Opus 4.6 | $11.25 | 8-10 min |
| Multi-area cross-workflow analysis | ~150k input, ~12k output | Opus 4.6 | $12.00 | 10-12 min |
| Batch creation (50 items) | ~80k × 50, ~2k × 50 | Sonnet 4.5 | $24.00 | 25-30 min |
| Comprehensive BWRA from scratch | ~100k input, ~20k output | Opus 4.6 | $14.50 | 12-15 min |

---

### Cost Reduction Strategies

**1. Prompt Caching (up to 90% savings on repeated context)**

Without caching: First analysis 60k input tokens ($0.90) + follow-up 68k tokens ($1.02) = $1.92. With caching (automatic in ANTON): First analysis ($0.90) + follow-up with cached context ($0.18) = $1.08. Savings: 44%.

**2. Use Sonnet for Drafts, Opus for Final (60% savings)**

Draft with Sonnet ($0.65) → review and refine ($0.30) → final polish with Opus ($1.20) = $2.15. Versus direct Opus generation with multiple iterations: $5.50. Savings: $3.35.

**3. Batch Operations (share context across items)**

Individual generation × 50: $50.00. Batch with shared context: $24.00. Savings: 52%.

**4. Local Models via Ollama ($0.00 API costs)**

Run Mistral 7B or Llama 3.3 locally. Unlimited usage, zero API costs. Trade-off: Lower quality, slower processing, requires local GPU or adequate CPU. Best for: Drafts, iteration, testing, and cost-sensitive use cases.

**5. Tiered model strategy**

Draft with local Ollama (free) → refine with Sonnet ($0.65) → polish with Opus ($1.20) = $1.85 total versus $5.50 for Opus-only. Savings: 66%.

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

### Cost Tracking & Budget Controls

**Built-in cost tracking:** Every API call is logged with token counts and estimated cost. Real-time running totals are displayed per session, per user (monthly), and per model.

**Session cost visibility:**

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

**Budget caps (configurable):** Daily, weekly, and monthly budgets. Alert at 80% threshold. Block further API calls at 100% (or allow admin override).

---

### Monthly Budget Examples

**Individual / Student ($20-50/month):** 10-20 analyses per month. Mix of Sonnet (drafts) and Opus (final deliverables). Average: $30/month.

**Small Business / Startup ($100-300/month):** 50-100 analyses per month. Regular policy updates. Workflow automation. Average: $200/month.

**Enterprise Team — 5 users ($500-1,500/month):** 200-500 analyses per month. Cross-workflow intelligence enabled. Batch operations. Multi-area coverage. Average: $800/month.

**Big 4 Consulting Team — 20 users ($2,000-6,000/month):** 1,000+ analyses per month. Full feature utilisation. Client deliverable generation. Knowledge graph and pattern detection. Average: $4,000/month.

---

### ROI Comparison

**Traditional consultant:**

AMLR gap analysis: 8-16 hours at $150-500/hour = **$1,200-8,000**. Policy creation: 12-20 hours = **$1,800-10,000**.

**ANTON:**

AMLR gap analysis: 5 minutes = **$2.40**. Policy creation: 8 minutes = **$2.75**. **Direct cost savings: 99.8%. Time savings: 95%+.**

**What the savings enable:** Redirect consultant time to strategic work. Use a fraction of saved time for quality review. Reinvest in additional analyses. Build institutional knowledge faster.

The honest caveat: ANTON produces professional-quality first drafts and structured analyses. It does not replace human judgment for high-stakes strategic decisions. The optimal model is ANTON for production, human review for validation, traditional consultants for the decisions that require years of contextual experience.

---

### Free and Low-Cost Options

**Anthropic free trial credits** ($5 on new accounts) cover approximately 50-100 queries with Sonnet — more than enough for evaluation.

**Ollama (100% free):** Run Mistral 7B or Llama 3.3 locally. Requires 16 GB RAM (8 GB minimum). Quality is good for approximately 70% of tasks.

**Google Gemini 2.0 Flash:** Very low cost ($0.10/1M input tokens). Suitable for high-volume, lower-stakes tasks.

---

### Power User Configuration

**Custom modules:** Navigate to "Build Your Own Module." Define module configuration (name, description, icon, area), configure defaults (thinking, creativity, output formats, knowledge sources), write the system prompt (objective, methodology, output structure, quality criteria), add guided inputs, test with real scenarios, and save as private or share with the community.

**Workflows:** Use the Workflow Builder to create multi-step automations. Define steps (module execution, checkpoints, decision gates, email notifications), connect step outputs to subsequent step inputs using variable syntax (`${step1.output.findings}`), schedule with CRON expressions, and monitor via the Workflow Monitor dashboard.

**Skills:** Browse the Skills Library for reusable prompt techniques (Devil's Advocate, Systems Thinking, Pragmatist, and more). Attach skills to any module to add analytical perspectives. Create custom skills to encode your organisation's frameworks, risk appetites, or methodologies.

**Knowledge sources:** Configure all four modes for maximum analytical depth: Claude Knowledge + Web Search (latest guidance and interpretation), Online Reference (direct regulation URLs from EUR-Lex or national sources), Local Folder (your policies, procedures, client documents), and Combined Mode (cross-reference all sources with custom instructions).

**Prompt editing:** Advanced users can expand the "System Prompt" section in any module to view and edit the underlying prompt. Save edits as a new module (preserving the original) or update the existing module. Always test edited prompts before using for client work.

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

**Compliance rule management:** Enable or disable built-in rules. Create custom rules specific to your organisation's standards. Review violations and track remediation status. Generate compliance reports for governance committees.

---

### Backup & Disaster Recovery

**Automated backup configuration:**

```bash
# Daily backup cron job
0 2 * * * /usr/local/bin/backup-anton.sh
```

The backup script (see §36) handles database backup, uploads directory archival, optional encryption, optional cloud upload, and retention management (configurable, default 90 days).

**Disaster recovery procedure:** Restore from the most recent backup by replacing the SQLite database file and extracting the uploads archive. Verify data integrity by checking session counts and user records. Resume operation.

---

### Integration & API

**REST API (planned):** Programmatic module execution, session retrieval, and workflow triggering. Enables integration with internal tools, dashboards, and reporting systems.

**Webhooks (planned):** Notify external systems on workflow completion, checkpoint decisions, or compliance violations. Integration targets: Slack, Microsoft Teams, Jira, ServiceNow.

**MCP Integration:** ANTON's MCP server exposes modules as Claude Desktop tools. Run `pnpm run mcp` to start the MCP server. Configure in Claude Desktop settings. Use ANTON modules directly from the Claude.ai interface — ANTON serves as the expert layer while Claude provides the conversation interface.

---

### Common Questions

**"Is this too good to be true?"** No. This is what happens when you combine a frontier LLM (Claude Opus 4.6) with 7-layer prompt engineering (domain expertise), local document context (your actual data), structured output templates (20 format options), and local-first architecture (no cloud latency). The AI does the production work. You do the strategic thinking and quality review.

**"What if the output is wrong?"** Always review AI output. ANTON helps with citation requirements (references to specific articles), compliance rules (automated checks), quality scoring (6-dimensional assessment), and version history (compare iterations). But you are the final reviewer. This is a power tool, not autopilot.

**"How do I know it's not hallucinating?"** Multiple safeguards: thinking display shows Claude's reasoning process, citation requirements ensure claims reference sources, local documents ground analysis in your actual data, compliance rules check for completeness, and quality alerts flag low-confidence outputs. Hallucinations are still possible — always verify critical outputs.

**"What about data privacy?"** ANTON is local-first. Documents are stored on your machine. The database is a SQLite file on your machine. Only prompts and attached documents are sent to the LLM API (and Anthropic does not train on commercial API data). For maximum privacy, use Ollama (100% local, $0 API cost).

**"Can I customise modules?"** Three ways: edit system prompts directly in any module, build custom modules from scratch via the visual editor, or fork the open-source code and modify anything.
