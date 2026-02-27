# Intelligence Dashboard — User Guide

## Quick Start

The Intelligence Dashboard is your command center for understanding patterns, entities, and trends across all your workflows and knowledge.

**Access:** Click "Intelligence" in the sidebar (Brain icon) or visit `/intelligence`

## The Three Views

### 📰 Insight Feed

**What it shows:** A timeline of detected patterns and important knowledge atoms, newest first.

**When to use:**
- Start of your day — see what's new
- After running multiple workflows — spot emerging patterns
- Investigating a compliance issue — find related patterns

**How to use:**

1. **Scan the timeline** for patterns marked CRITICAL (red) or WARNING (amber)
2. **Filter the view:**
   - Click "Patterns Only" to focus on detected patterns
   - Click "Atoms Only" to see just raw knowledge
   - Select a severity (critical/warning/info/positive) to narrow down
3. **Take action:**
   - Click **"Investigate"** to explore the pattern in the Knowledge page
   - Click **"Mark Resolved"** once you've addressed the issue

**Pattern Types Explained:**

| Icon | Type | What it means |
|------|------|---------------|
| 📈 TrendingUp | Temporal Correlation | Two things keep happening at the same time |
| 👥 Users | Entity Convergence | Multiple entities showing up together repeatedly |
| ⚡ Zap | Cascade | One event triggering a chain reaction |
| ↗️ ArrowUpRight | Trend Divergence | Something changed direction unexpectedly |
| ℹ️ Info | Gap | Something expected is missing |

**Severity Meanings:**

- **CRITICAL** (red): Immediate attention required (compliance risk, data gap, inconsistency)
- **WARNING** (amber): Notable issue, investigate when possible
- **INFO** (blue): Informational finding, good to know
- **POSITIVE** (green): Good pattern detected (e.g., compliance improvement)

---

### 🗺️ Entity Heat Map

**What it shows:** Visual map of all entities (regulations, clients, persons, transactions) sized by activity and colored by recency.

**When to use:**
- Spotting which regulations are most discussed
- Finding high-activity clients or projects
- Identifying entities that haven't been touched recently

**How to read it:**

- **Size of cell** = How many times this entity has been referenced (interaction_count)
- **Brightness of color** = How recently it was last seen (brighter = more recent)
- **Large + Bright** = High-activity, current entity
- **Large + Dim** = Historically important, but not recent
- **Small + Bright** = New entity, just appeared

**How to use:**

1. **Scan for outliers:**
   - Unusually large cells → high-activity entities (investigate why)
   - Dim cells → entities you haven't touched in a while (might need review)
2. **Click any entity** to navigate to the Knowledge page and see all related atoms

**Example scenarios:**

- **Compliance Officer:** See which regulations are most referenced → focus policy updates there
- **Consultant:** See which clients appear most → allocate resource accordingly
- **Risk Manager:** See which persons/transactions are flagged → investigate patterns

---

### 📊 Temporal View

**What it shows:** Four trend charts showing activity over time.

**When to use:**
- Monthly/quarterly reporting
- Understanding seasonality in compliance work
- Tracking quality improvement over time
- Justifying resource allocation

**The Four Charts:**

#### 1. Atoms Created per Day (Last 30 Days)
- Shows daily knowledge capture rate
- **Trend ↑** = More workflows, more activity
- **Trend ↓** = Quiet period, fewer inputs
- **Use case:** Track consultant productivity, spot busy periods

#### 2. Patterns Detected per Week (Last 12 Weeks)
- Shows how many patterns the AI detected each week
- **Trend ↑** = System is finding more connections (good for insights, or sign of issues)
- **Trend ↓** = Fewer patterns (could be more routine work)
- **Use case:** Report on compliance risk landscape changes

#### 3. Entity Activity (Entities per Week)
- Shows how many unique entities were touched each week
- **Trend ↑** = Broader scope of work
- **Trend ↓** = More focused work on fewer entities
- **Use case:** Measure breadth vs. depth of analysis

#### 4. Average Quality Score (per Week)
- Shows average quality of knowledge atoms over time
- **Trend ↑** = Improving knowledge quality (better inputs, better prompts)
- **Trend ↓** = Quality degradation (investigate cause)
- **Use case:** QA monitoring, training effectiveness

**How to read the charts:**

- **Green arrow ↑** = Trend is UP
- **Red arrow ↓** = Trend is DOWN
- **Gray dash →** = STABLE (no significant change)

---

## Dashboard Header Stats

Always visible at the top, regardless of view:

1. **Knowledge Atoms** — Total active knowledge atoms captured
2. **Entities Tracked** — Total unique entities in the knowledge graph
3. **Active Patterns** — Currently active patterns requiring attention
4. **Critical Alerts** — Number of CRITICAL severity patterns (turns red if > 0)

**Pro tip:** If Critical Alerts > 0, switch to Insight Feed and filter for "critical" severity immediately.

---

## Common Workflows

### Morning Routine
1. Open Intelligence Dashboard
2. Check **Critical Alerts** stat
3. If > 0, switch to Insight Feed → filter "critical" → investigate each
4. Scan Heat Map for new entities (small + bright)
5. Mark resolved patterns that you've addressed

### Weekly Review
1. Switch to Temporal View
2. Check Atoms Created trend → are we capturing enough knowledge?
3. Check Patterns Detected → any spikes? (investigate why)
4. Check Quality Score → is it improving? (if not, review training)
5. Export findings to weekly report

### Compliance Investigation
1. Switch to Insight Feed
2. Filter for "Patterns Only" + relevant severity
3. Look for Temporal Correlation or Cascade patterns
4. Click "Investigate" on suspicious patterns
5. In Knowledge page, explore related entities and atoms
6. Document findings, mark pattern as Resolved

### Client Engagement Prep
1. Switch to Heat Map
2. Find client entity (should be large if active project)
3. Click client entity → see all knowledge atoms
4. Review recent atoms for talking points
5. Check related entities (regulations, persons) in context

---

## Tips & Best Practices

### 🎯 Pattern Investigation
- Don't dismiss patterns without investigation — they're AI-detected signals
- CRITICAL patterns should be investigated within 24 hours
- Use the Knowledge page to see full context (not just the pattern summary)

### 🗺️ Heat Map Insights
- Regularly review dim cells — they might need updating
- If a regulation cell is small despite being important, knowledge capture may be incomplete
- Large cells that shouldn't be large = investigate why (over-referencing? misclassification?)

### 📊 Trend Analysis
- Compare weeks to identify seasonality (e.g., end-of-quarter spikes)
- If Atoms Created is high but Quality Score is low → improve prompts
- If Patterns Detected spikes suddenly → investigate what changed in workflows

### 🚀 Efficiency
- Use filters liberally — don't scroll through 50+ items manually
- Bookmark `/intelligence?view=timeline&filter=critical` for morning reviews
- Mark patterns as Resolved as you go — keeps the feed actionable

### 📈 Reporting
- Use Temporal View charts for executive summaries
- Screenshot Heat Map for visual impact in presentations
- Cite pattern counts in compliance reports ("12 active patterns detected this quarter")

---

## Keyboard Shortcuts (Future)

*Coming soon:*
- `i` — Switch to Insight Feed
- `h` — Switch to Heat Map
- `t` — Switch to Temporal View
- `f` — Focus filter input
- `r` — Reload data
- `Esc` — Clear filters

---

## Troubleshooting

**Q: Dashboard shows 0 atoms/patterns but I've run workflows**
- Pattern detection runs every hour in the background
- Knowledge extraction happens automatically after workflows
- If still 0, check `/quality` page to verify extraction is working
- Manual trigger: Admin can POST to `/api/patterns/detect`

**Q: Charts are empty**
- Charts show data from last 30 days (atoms) or 12 weeks (patterns)
- If system is new, wait for more data accumulation
- Check temporal endpoints directly: `/api/intelligence/temporal/atoms-per-day`

**Q: Heat Map entities are all the same size**
- Entities need multiple workflow references to differentiate
- Run more workflows with entity mentions
- Check entity extraction in `/knowledge` page

**Q: Pattern severity seems wrong**
- Severity is AI-determined based on rule-based heuristics
- If consistently wrong, report to admin for pattern detection tuning
- You can still resolve/dismiss patterns regardless of severity

**Q: "Investigate" button doesn't show what I expected**
- Investigate navigates to Knowledge page (general view)
- Future versions will link directly to pattern-specific view
- For now, use Knowledge search to find related atoms

---

## Related Pages

- **Knowledge** (`/knowledge`) — Browse all atoms, entities, and connections
- **Knowledge Graph** (`/graph`) — Visual graph of entity relationships
- **Quality** (`/quality`) — Quality scoring and atom management
- **Workflows** (`/workflows`) — Run workflows that create knowledge

---

**Need help?** Contact your openEXPERT administrator or check the full technical documentation.

---

*Last updated: 2026-02-19*
