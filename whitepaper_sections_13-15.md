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
