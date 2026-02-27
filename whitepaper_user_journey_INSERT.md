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
