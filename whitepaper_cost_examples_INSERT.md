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
