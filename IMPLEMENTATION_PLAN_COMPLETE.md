# Complete Implementation Plan: Finishing the 5 Features + Configuration Layer

**Date:** February 20, 2026
**Goal:** Make all 14 transformative features "fully implemented" + add missing configuration layers
**Status:** Ready to Execute

---

## PART 1: COMPLETE THE 5 "CORE IMPLEMENTED" FEATURES

These features are functional but need completion to be "fully implemented."

---

### FEATURE 1: Institutional Memory (Make Fully Implemented)

**Current State:**
- ✅ Checkpoint decisions table exists (enhanced schema)
- ✅ Basic similarity matching works
- ✅ Decision logging functional
- 🟡 Advanced semantic search in progress

**What's Missing:**
1. **Semantic similarity using embeddings** (not just keyword matching)
2. **Automatic checkpoint suggestions** ("This looks like a decision point - checkpoint it?")
3. **Similarity dashboard** showing decision clusters
4. **Feedback loop** (rate checkpoint helpfulness)

**Implementation Plan:**

**Task 1.1: Add Embeddings for Semantic Search**
- File: `server/services/institutional-memory.ts`
- Add: `generateEmbedding()` function using Claude or local embedding model
- Update: `checkpoint_decisions` table to include `embedding` BLOB column
- Add: Cosine similarity search function
- Result: "Similar past decisions" now uses semantic matching, not just keywords

**Task 1.2: Automatic Checkpoint Detection**
- File: `src/components/shared/ConversationThread.tsx`
- Add: "Checkpoint This Decision" button that appears when AI output contains decision language
- Trigger: Detect phrases like "we should," "I recommend," "the best approach is"
- UI: Floating button appears next to relevant messages

**Task 1.3: Similarity Dashboard**
- File: `src/pages/IntelligenceDashboard.tsx` (enhance existing)
- Add: "Decision Clusters" widget showing checkpoints grouped by similarity
- Visualization: Force-directed graph with nodes = checkpoints, edges = similarity
- Click node → see full decision + related decisions

**Task 1.4: Feedback Loop**
- File: `memory_feedback` table already exists in enhanced schema
- UI: Add thumbs up/down to checkpoint suggestions
- Backend: Use feedback to adjust similarity thresholds
- Result: System learns which checkpoints are actually helpful

**Estimated Time:** 2-3 days
**Files to Create/Modify:**
- `server/services/institutional-memory.ts` (add embeddings)
- `src/components/shared/ConversationThread.tsx` (checkpoint button)
- `src/pages/IntelligenceDashboard.tsx` (decision clusters widget)
- `src/components/intelligence/FeedbackButton.tsx` (new)

---

### FEATURE 2: Cross-Workflow Intelligence (Make Fully Implemented)

**Current State:**
- ✅ Atom extraction working
- ✅ Entity extraction working
- ✅ Pattern detection basic
- 🟡 Full analytics dashboard in progress

**What's Missing:**
1. **Complete analytics dashboard** with all 5 layers visible
2. **Atom search and filtering** (find all atoms about "AMLR Article 8")
3. **Cross-session insights** ("You've analyzed 12 AMLR gaps - here are patterns")
4. **Export intelligence data** (CSV, JSON)

**Implementation Plan:**

**Task 2.1: Complete 5-Layer Dashboard**
- File: `src/pages/IntelligenceDashboard.tsx`
- Add missing widgets:
  - **Layer 1:** Raw sessions count with filters
  - **Layer 2:** Atom explorer (searchable table)
  - **Layer 3:** Entity graph (already has basic version, enhance)
  - **Layer 4:** Pattern alerts (existing, enhance with filters)
  - **Layer 5:** Strategic insights (NEW: auto-generated summary)
- Layout: Tab interface switching between layers

**Task 2.2: Atom Search & Filtering**
- File: `src/components/intelligence/AtomExplorer.tsx` (new)
- Features:
  - Search: Free text + filters (atom_type, area, module, date range)
  - Display: Table with columns (type, content, source session, confidence, tags)
  - Actions: Click atom → see source session, related atoms, related entities
- Backend: `GET /api/intelligence/atoms/search` with query params

**Task 2.3: Cross-Session Insights Generator**
- File: `server/services/insight-generator.ts` (new)
- Function: Analyze all atoms/entities/patterns → generate insights
- Examples:
  - "You've run 12 AMLR gap analyses. Common gaps: sanctions screening (8/12), TM thresholds (7/12)"
  - "Entity 'Nordea' appears in 5 sessions across 3 modules"
  - "Pattern detected: Every BWRA followed by TM policy update within 72h"
- UI: Display in "Strategic Insights" widget

**Task 2.4: Export Intelligence Data**
- Add export buttons to each dashboard widget
- Formats: CSV (tables), JSON (full data), XLSX (formatted)
- API: `GET /api/intelligence/export?layer=atoms&format=csv`

**Estimated Time:** 3-4 days
**Files to Create/Modify:**
- `src/pages/IntelligenceDashboard.tsx` (complete all layers)
- `src/components/intelligence/AtomExplorer.tsx` (new)
- `src/components/intelligence/InsightGenerator.tsx` (new widget)
- `server/services/insight-generator.ts` (new)
- `server/routes/intelligence.ts` (add search/export endpoints)

---

### FEATURE 3: Knowledge Graph (Make Fully Implemented)

**Current State:**
- ✅ Entity extraction working
- ✅ Relationship extraction working
- ✅ Basic graph queries
- 🟡 Advanced visualization in progress

**What's Missing:**
1. **Interactive graph visualization** (drag, zoom, filter)
2. **Graph analytics** (centrality, clustering, path finding)
3. **Entity editing** (merge duplicates, add manual entities)
4. **Graph export** (GraphML, JSON, CSV)

**Implementation Plan:**

**Task 3.1: Interactive Graph Visualization**
- File: `src/pages/KnowledgeGraphPage.tsx` (enhance existing)
- Library: Use react-force-graph or vis-network
- Features:
  - Drag nodes
  - Zoom/pan
  - Click node → sidebar with entity details + relationships
  - Filter by entity type, relationship type, date range
  - Highlight paths between two selected nodes

**Task 3.2: Graph Analytics**
- File: `server/services/knowledge-graph.ts` (add analytics functions)
- Algorithms:
  - **Centrality:** Find most important entities (PageRank or degree centrality)
  - **Clustering:** Group related entities (community detection)
  - **Path Finding:** Shortest path between entities (Dijkstra)
  - **Importance Scoring:** Rank entities by mention count + relationship strength
- UI: Display analytics results in sidebar panel

**Task 3.3: Entity Management UI**
- File: `src/components/knowledge/EntityManager.tsx` (new)
- Features:
  - **Search entities:** Filter by name, type
  - **View entity:** See all mentions, relationships, aliases
  - **Merge duplicates:** Select 2+ entities → merge into canonical
  - **Add manual entity:** Create entity not auto-extracted
  - **Edit aliases:** Add alternative names
  - **Delete entity:** Soft delete (mark as inactive)

**Task 3.4: Graph Export**
- Formats:
  - **GraphML:** For Gephi/Cytoscape analysis
  - **JSON:** Nodes + edges
  - **CSV:** Two files (entities.csv, relationships.csv)
- API: `GET /api/knowledge-graph/export?format=graphml`

**Estimated Time:** 3-4 days
**Files to Create/Modify:**
- `src/pages/KnowledgeGraphPage.tsx` (interactive viz)
- `src/components/knowledge/EntityManager.tsx` (new)
- `src/components/knowledge/GraphAnalytics.tsx` (new widget)
- `server/services/knowledge-graph.ts` (add analytics algorithms)
- `server/routes/knowledge-graph.ts` (add export endpoint)

---

### FEATURE 4: Pattern Detection (Make Fully Implemented)

**Current State:**
- ✅ 5 detector types configured
- ✅ 3 of 5 detectors working (Temporal Correlation, Entity Convergence, Cascade)
- 🟡 2 detectors in progress (Trend Divergence, Gap Detection)
- 🟡 Auto-scheduling in progress

**What's Missing:**
1. **Complete all 5 detectors** (Trend Divergence + Gap Detection)
2. **Automatic scheduled runs** (daily/weekly detector execution)
3. **Pattern resolution workflow** (acknowledge, dismiss, escalate)
4. **Pattern alerts** (email/in-app when high-severity patterns detected)

**Implementation Plan:**

**Task 4.1: Complete Trend Divergence Detector**
- File: `server/services/pattern-detection/trend-divergence-detector.ts` (new)
- Logic:
  - Track metric over time (e.g., "sessions per area," "average quality scores")
  - Calculate baseline (30-day average)
  - Detect divergence (> 2 standard deviations)
  - Example: "Sanctions queries up 300% this month vs. baseline"

**Task 4.2: Complete Gap Detection Detector**
- File: `server/services/pattern-detection/gap-detector.ts` (new)
- Logic:
  - Check coverage across dimensions (areas, modules, regulations, geographies)
  - Identify missing coverage (e.g., "No crypto asset sessions in 90 days")
  - Recommend actions ("Consider running crypto risk assessment")

**Task 4.3: Automatic Scheduled Runs**
- File: `server/services/pattern-detection/scheduler.ts` (enhance existing or new)
- Use: node-cron for scheduling
- Frequency: Read from `detector_configs.next_run_at` column
- Execution:
  - Nightly: Run all enabled detectors
  - Update: `last_run_at`, `next_run_at` timestamps
  - Store: New patterns in `detected_patterns` table
  - Alert: If high-severity patterns found

**Task 4.4: Pattern Resolution Workflow**
- File: `src/pages/IntelligenceDashboard.tsx` (add pattern resolution UI)
- UI: Pattern card with actions:
  - ✅ **Acknowledge:** "I've seen this, will handle it"
  - ❌ **Dismiss:** "False positive, ignore"
  - ⚠️ **Escalate:** "High priority, needs action"
  - 💬 **Comment:** Add notes
- Backend: Update `pattern_resolutions` table

**Task 4.5: Pattern Alerts**
- File: `server/services/pattern-detection/alert-sender.ts` (new)
- Triggers: When high/critical severity pattern detected
- Channels:
  - In-app: Create `pattern_alerts` entry (shown in dashboard)
  - Email: Send via email service (if enabled in user preferences)
- Template: "Pattern detected: [title] — Severity: [high/critical] — View: [link]"

**Estimated Time:** 2-3 days
**Files to Create/Modify:**
- `server/services/pattern-detection/trend-divergence-detector.ts` (new)
- `server/services/pattern-detection/gap-detector.ts` (new)
- `server/services/pattern-detection/scheduler.ts` (enhance)
- `server/services/pattern-detection/alert-sender.ts` (new)
- `src/pages/IntelligenceDashboard.tsx` (add resolution UI)
- `src/components/intelligence/PatternCard.tsx` (resolution actions)

---

### FEATURE 5: Quality Ratchet (Make Fully Implemented)

**Current State:**
- ✅ 6-dimensional scoring working
- ✅ Baseline setting works
- ✅ Quality evolution tracking basic
- 🟡 Automated re-scoring suggestions in progress

**What's Missing:**
1. **Automatic scoring on every output** (currently on-demand)
2. **Re-scoring suggestions** ("Quality dropped 10 points - suggest regenerating with higher thinking level")
3. **Quality trends dashboard** (quality over time, by module, by user)
4. **Quality presets** ("Always score outputs for regulatory submissions")

**Implementation Plan:**

**Task 5.1: Automatic Scoring on Every Output**
- File: `server/routes/claude.ts` (modify streaming endpoint)
- Logic:
  - After LLM response completes → trigger quality scoring
  - Run quality-ratchet.ts scoring function
  - Save to `quality_scores` table
  - Compare to baseline (if exists)
  - Return quality data in SSE stream final message
- UI: Display quality scores automatically after every response

**Task 5.2: Re-scoring Suggestions**
- File: `server/services/quality-ratchet.ts` (add suggestion logic)
- Logic:
  - If score < baseline - threshold (e.g., -5 points):
    - Suggestion: "Quality dropped. Try: Higher thinking level / More context / Different model"
  - If score < absolute threshold (e.g., < 70/100):
    - Warning: "Output quality is low. Review recommended."
- UI: Display suggestions as banner above output

**Task 5.3: Quality Trends Dashboard**
- File: `src/pages/QualityPage.tsx` (enhance existing)
- Add widgets:
  - **Quality Over Time:** Line chart (overall score by date)
  - **Quality by Module:** Bar chart (average score per module)
  - **Quality by User:** Table (if multi-user deployment)
  - **Quality Distribution:** Histogram (how many outputs at each score range)
- Filters: Date range, module, area

**Task 5.4: Quality Presets**
- File: `src/stores/useSettingsStore.ts` (add quality preset settings)
- Presets:
  - "Always Score": Automatic scoring on all outputs
  - "Score Regulatory": Auto-score when module category = regulatory
  - "Score on Baseline Breach": Only score if previous baseline exists
  - "Never Score": Manual scoring only
- UI: Add quality settings tab in Settings page
- Storage: Persist to user preferences in DB

**Estimated Time:** 2 days
**Files to Create/Modify:**
- `server/routes/claude.ts` (add automatic scoring hook)
- `server/services/quality-ratchet.ts` (add suggestions logic)
- `src/pages/QualityPage.tsx` (add trends dashboard)
- `src/components/quality/QualitySuggestions.tsx` (new banner component)
- `src/stores/useSettingsStore.ts` (add quality presets)

---

## PART 2: ADD CONFIGURATION PAGE FOR WORKFLOWS/APIS/SCRIPTS

**Problem:** Users can configure API/DB/script connections, but there's no central Settings page tab for managing these and setting defaults.

---

### NEW FEATURE: Connections & Security Settings Tab

**Goal:** Create a comprehensive Settings tab where admins can:
1. Manage API/database/script connections (already exists in ConnectionManager, need to embed)
2. Configure security policies (rate limits, timeouts, sandboxing)
3. Set workflow defaults
4. Configure allowlists for external services

**Implementation Plan:**

**Task 6.1: Create Settings Main Component with Tabs**
- File: `src/pages/Settings.tsx` (create or enhance)
- Structure:
  ```tsx
  <Settings>
    <Tabs>
      <Tab label="Profile">
        <ProfileSettingsTab /> {/* existing */}
      </Tab>
      <Tab label="Connections">
        <ConnectionsSettingsTab /> {/* NEW */}
      </Tab>
      <Tab label="Workflows">
        <WorkflowDefaultsTab /> {/* NEW */}
      </Tab>
      <Tab label="Security">
        <SecuritySettingsTab /> {/* NEW */}
      </Tab>
      <Tab label="UI Preferences">
        <UIPreferencesTab /> {/* NEW - for sidebar customization */}
      </Tab>
    </Tabs>
  </Settings>
  ```
- URL param: `/settings?tab=connections`
- Default: Opens last-used tab (stored in localStorage)

**Task 6.2: Connections Settings Tab**
- File: `src/pages/settings/ConnectionsSettingsTab.tsx` (new)
- Content: Embed `<ConnectionManager />` component (already exists!)
- Add: Quick actions at top:
  - "Add New Connection" button
  - Filter dropdown (All / Active / Pending / Error)
  - Search bar (filter by name)

**Task 6.3: Workflow Defaults Tab**
- File: `src/pages/settings/WorkflowDefaultsTab.tsx` (new)
- Settings:
  - **Default Timeout:** Slider (10s - 300s) for all workflow steps
  - **Retry Policy:** Enable/disable, max retries (1-5)
  - **Error Handling:** Continue on error / Stop workflow / Rollback
  - **Logging Level:** Minimal / Normal / Verbose
  - **Notification Preferences:** Email on workflow complete / Error only / Never
- Storage: Save to user preferences in DB

**Task 6.4: Security Settings Tab**
- File: `src/pages/settings/SecuritySettingsTab.tsx` (new)
- Settings:
  - **API Rate Limiting:**
    - Enable/disable per connection
    - Max requests per minute (slider)
    - Burst allowance
  - **Script Sandboxing:**
    - Enable/disable (checkbox)
    - Max runtime (seconds)
    - Max memory (MB)
    - Network access (allow/deny)
  - **Database Connections:**
    - Read-only mode (checkbox per connection)
    - Query timeout (seconds)
    - Max rows returned (limit)
  - **File System Access:**
    - Allowed directories (whitelist)
    - Max file size (MB)
- Storage: Save to `security_settings` table (new table)

**Task 6.5: Backend for Security Settings**
- File: `server/routes/settings.ts` (new or enhance)
- Endpoints:
  - `GET /api/settings/security` — Fetch current security settings
  - `PUT /api/settings/security` — Update security settings (admin only)
  - `GET /api/settings/workflow-defaults` — Fetch workflow defaults
  - `PUT /api/settings/workflow-defaults` — Update workflow defaults
- Table: `security_settings` (new in enhanced schema or add to migration)
- Enforcement: When executing workflow steps, check security_settings and enforce limits

**Estimated Time:** 3 days
**Files to Create:**
- `src/pages/Settings.tsx` (main component with tabs)
- `src/pages/settings/ConnectionsSettingsTab.tsx`
- `src/pages/settings/WorkflowDefaultsTab.tsx`
- `src/pages/settings/SecuritySettingsTab.tsx`
- `src/pages/settings/UIPreferencesTab.tsx` (see Part 3)
- `server/routes/settings.ts` (new endpoints)
- Migration: Add `security_settings` table

---

## PART 3: UI CUSTOMIZATION - SIDEBAR FAVORITES & HIDING

**Problem:** With 29 areas and 238 modules, the sidebar is cluttered. New users should see everything, but power users need customization.

---

### NEW FEATURE: Sidebar Customization

**Goal:**
1. **Favorites:** Mark frequently-used modules/areas as favorites
2. **Hide/Show:** Hide irrelevant modules (but can be revealed)
3. **Ordering:** Reorder areas/modules (drag-and-drop)
4. **Default View:** New users see everything, returning users see their custom view

**Implementation Plan:**

**Task 7.1: Add Sidebar Customization Data Model**
- Table: `sidebar_preferences` (new)
  ```sql
  CREATE TABLE sidebar_preferences (
    user_id TEXT PRIMARY KEY,
    favorites TEXT DEFAULT '[]',  -- JSON array of module IDs
    hidden_modules TEXT DEFAULT '[]',  -- JSON array of module IDs
    hidden_areas TEXT DEFAULT '[]',  -- JSON array of area IDs
    area_order TEXT DEFAULT '[]',  -- JSON array of area IDs in custom order
    expanded_areas TEXT DEFAULT '[]',  -- JSON array of currently expanded areas
    updated_at TEXT
  );
  ```
- API:
  - `GET /api/sidebar/preferences` — Fetch user's preferences
  - `PUT /api/sidebar/preferences` — Update preferences

**Task 7.2: Favorites UI**
- File: `src/components/layout/Sidebar.tsx` (enhance)
- UI Changes:
  - **Favorite Icon:** Star icon next to each module name
  - **Click star:** Toggle favorite status (filled ⭐ / outline ☆)
  - **Favorites Section:** Add "⭐ Favorites" section at top of sidebar
  - **Display:** Show favorited modules in favorites section + in their original areas
- State: Store in React state + sync to DB on change

**Task 7.3: Hide/Show UI**
- File: `src/components/layout/Sidebar.tsx`
- UI Changes:
  - **Right-click menu:** Right-click on module → "Hide Module" option
  - **Eye icon:** Hover over module → eye icon appears → click to hide
  - **Hidden indicator:** Hidden modules shown in light gray with "🙈 Hidden" badge
  - **Show All toggle:** Checkbox in sidebar header: "Show Hidden Modules"
  - **Settings integration:** Link to UI Preferences tab "Manage hidden modules"
- State: Maintain `hiddenModules` Set, sync to DB

**Task 7.4: Area Reordering (Drag-and-Drop)**
- File: `src/components/layout/Sidebar.tsx`
- Library: Use `react-beautiful-dnd` or `dnd-kit`
- UI:
  - Drag handle icon (☰) next to each area name
  - Drag to reorder
  - Drop → update order, sync to DB
- State: `areaOrder` array in preferences

**Task 7.5: UI Preferences Settings Tab**
- File: `src/pages/settings/UIPreferencesTab.tsx` (new, from Part 2)
- Content:
  - **Favorites Management:**
    - List all favorited modules
    - Remove button per favorite
    - "Clear All Favorites" button
  - **Hidden Modules:**
    - List all hidden modules
    - "Unhide" button per module
    - "Unhide All" button
  - **Area Ordering:**
    - Drag-and-drop list to reorder areas
    - "Reset to Default Order" button
  - **Reset All:**
    - "Reset Sidebar to Default" button → clears all customizations
  - **Sidebar Behavior:**
    - Checkbox: "Remember expanded/collapsed areas"
    - Checkbox: "Always expand Favorites section"
    - Number input: "Max recent sessions to show" (default: 4)

**Task 7.6: New User Experience**
- Logic:
  - On first visit: `sidebar_preferences` doesn't exist → show all modules, all areas visible
  - After any customization: Create `sidebar_preferences` entry
  - On return: Load preferences, apply custom view
- Onboarding: First-time popup explaining customization features
  - "👋 Welcome! Your sidebar shows all 238 modules across 29 areas. You can:"
  - "⭐ Favorite frequently-used modules"
  - "👁️ Hide irrelevant modules"
  - "☰ Reorder areas"
  - "Customize anytime in Settings → UI Preferences"

**Estimated Time:** 3-4 days
**Files to Create/Modify:**
- Database migration: Add `sidebar_preferences` table
- `src/components/layout/Sidebar.tsx` (major enhancements)
- `src/components/layout/FavoriteStar.tsx` (new component)
- `src/components/layout/ModuleContextMenu.tsx` (new - right-click menu)
- `src/pages/settings/UIPreferencesTab.tsx` (new)
- `server/routes/sidebar.ts` (new - preferences CRUD)

---

## PART 4: OTHER LOOSE THREADS

Looking across the codebase for other areas needing similar configuration or polish:

---

### LOOSE THREAD 1: Email Notification Settings (Incomplete)

**Current State:**
- Email service exists (`server/services/email.ts`)
- User can enable/disable in ProfileSettingsTab
- But no configuration for SMTP server, templates, frequency

**What's Needed:**
- **SMTP Configuration:** In Settings → Connections or Settings → Security
  - SMTP host, port, username, password
  - Test email button
- **Email Templates:** Customize templates for different notification types
- **Frequency Control:** Immediate / Daily digest / Weekly digest / Off

**Implementation:**
- Add `EmailSettingsTab` in Settings
- Store SMTP config in `connection` table (type: 'email')
- Add email template editor

**Priority:** Medium (only needed if users want email notifications)
**Estimated Time:** 1 day

---

### LOOSE THREAD 2: Budget Management UI (Partially Implemented)

**Current State:**
- `budget_limits` table exists in enhanced schema
- Cost tracking exists (`cost_tracking` table)
- But no UI to set budget limits or view usage

**What's Needed:**
- **Budget Settings:** In Settings → Security or new Settings → Budget tab
  - Set monthly/weekly/daily budget limits
  - Enable/disable budget enforcement
  - Alert thresholds (notify at 80%, block at 100%)
- **Usage Dashboard:** Show current spend vs. budget
  - By user, by module, by model
  - Export usage reports (CSV)

**Implementation:**
- Add `BudgetSettingsTab` in Settings
- Add `BudgetDashboard` component
- Endpoints: `GET /api/budget/usage`, `PUT /api/budget/limits`

**Priority:** High (needed for enterprise deployment)
**Estimated Time:** 2 days

---

### LOOSE THREAD 3: Module Search/Filtering (Missing)

**Current State:**
- 238 modules across 29 areas
- No search functionality
- Finding a module requires expanding areas manually

**What's Needed:**
- **Search Bar:** At top of sidebar
  - Type to filter modules by name
  - Show matching modules from any area
  - Highlight search term in results
- **Quick Open:** Keyboard shortcut (Cmd/Ctrl+K) to open command palette
  - Type module name → select → navigate directly

**Implementation:**
- Add search input to Sidebar header
- Filter modules by search term
- Highlight matching areas (expand automatically)

**Priority:** Medium-High (quality of life improvement)
**Estimated Time:** 0.5 days

---

### LOOSE THREAD 4: Deployment Mode Detection (Incomplete)

**Current State:**
- Code references "team mode" vs "solo mode"
- Detection happens in `useSettingsStore` from `/api/config`
- But no clear UI to switch modes or understand current mode

**What's Needed:**
- **Mode Indicator:** Show current mode in footer/header
- **Mode Switcher:** In Settings → General
  - Radio buttons: Solo / Team
  - Explanation of differences
- **RBAC Enforcement:** If team mode → enforce roles strictly

**Implementation:**
- Add mode indicator to Sidebar footer
- Add mode switcher in Settings → General tab
- Backend: `PUT /api/config/deployment-mode`

**Priority:** Medium (needed for multi-user deployments)
**Estimated Time:** 1 day

---

### LOOSE THREAD 5: Connection Testing Feedback (Basic)

**Current State:**
- "Test Connection" button exists in ConnectionManager
- But no detailed feedback on what failed (just success/error)

**What's Needed:**
- **Detailed Test Results:** Show exactly what was tested
  - API: "GET request to /health returned 200 OK"
  - Database: "Connected to PostgreSQL, executed SELECT 1"
  - Script: "Script loaded, syntax valid, sandbox constraints OK"
- **Error Diagnosis:** If test fails, suggest fixes
  - "Connection timeout → Check firewall / VPN"
  - "Authentication failed → Verify credentials"

**Implementation:**
- Enhance `connection-manager.ts` test functions
- Return detailed test results object
- Display in ConnectionManager UI with expandable details

**Priority:** Medium (improves user experience)
**Estimated Time:** 1 day

---

## EXECUTION ROADMAP

### Week 1: Intelligence Features (Part 1)
- **Day 1-2:** Feature 1 (Institutional Memory) — embeddings, auto-checkpoint, dashboard
- **Day 3-4:** Feature 2 (Cross-Workflow Intelligence) — complete dashboard, atom search
- **Day 5:** Feature 3 (Knowledge Graph) — interactive viz (start)

### Week 2: Intelligence Features (Part 1 continued) + Configuration (Part 2)
- **Day 1-2:** Feature 3 (Knowledge Graph) — analytics, entity management
- **Day 3:** Feature 4 (Pattern Detection) — complete 2 missing detectors
- **Day 4:** Feature 4 (Pattern Detection) — auto-scheduling, alerts
- **Day 5:** Feature 5 (Quality Ratchet) — automatic scoring, trends dashboard

### Week 3: Configuration & UI Customization (Parts 2 & 3)
- **Day 1-2:** Part 2 (Configuration Page) — Settings tabs, Connections tab, Workflow defaults
- **Day 3:** Part 2 (Security Settings) — Rate limiting, sandboxing, allowlists
- **Day 4-5:** Part 3 (Sidebar Customization) — Favorites, hide/show, drag-and-drop

### Week 4: Polish & Loose Threads (Part 4)
- **Day 1:** Budget Management UI
- **Day 2:** Module Search/Filtering
- **Day 3:** Email Settings, Deployment Mode Indicator
- **Day 4:** Connection Testing Feedback
- **Day 5:** Testing, bug fixes, documentation

**Total Estimated Time:** 4 weeks (20 working days)

---

## PRIORITY MATRIX

| Feature | Impact | Effort | Priority | Week |
|---------|--------|--------|----------|------|
| Feature 1: Institutional Memory | High | Medium | **P1** | Week 1 |
| Feature 2: Cross-Workflow Intelligence | High | High | **P1** | Week 1-2 |
| Feature 3: Knowledge Graph | Medium | High | **P2** | Week 2 |
| Feature 4: Pattern Detection | High | Medium | **P1** | Week 2 |
| Feature 5: Quality Ratchet | Medium | Low | **P2** | Week 2 |
| Settings Configuration Page | High | Medium | **P1** | Week 3 |
| Sidebar Customization | High | Medium | **P1** | Week 3 |
| Budget Management UI | High | Low | **P2** | Week 4 |
| Module Search | Medium | Low | **P3** | Week 4 |
| Email Settings | Low | Low | **P4** | Week 4 |

---

## SUCCESS CRITERIA

**After completion, you can honestly say:**

✅ **All 14/14 Transformative Features are fully implemented** (not just "core implemented")

✅ **Configuration is complete:**
- Users can manage API/DB/script connections in Settings
- Security policies (rate limits, sandboxing) are configurable
- Workflow defaults can be set
- Allowlists for external services exist

✅ **UI is customizable:**
- Users can favorite modules
- Users can hide irrelevant modules
- Sidebar can be reordered
- New users see everything, power users see their custom view

✅ **No loose threads:**
- Budget management has UI
- Email settings are configurable
- Module search exists
- Connection testing provides detailed feedback
- Deployment mode is clear

**Result:** openEXPERT is **100% production-ready** with no "partially implemented" features.

---

## NEXT STEP

**Ready to start implementation?**

We can either:
1. **Execute all 4 weeks** (full completion)
2. **Start with Week 1** (intelligence features first)
3. **Start with Week 3** (configuration + sidebar customization first, defer intelligence)
4. **Cherry-pick** (choose specific features to implement immediately)

**What would you like to prioritize?**
