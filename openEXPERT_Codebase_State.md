# openEXPERT by ANTON — Codebase State Extraction

*Generated: February 17, 2026*
*Project: openEXPERT by ANTON (current codebase name: `fcp-workbench`)*

---

## 1. Full Directory Tree

```
fcp-workbench/
├── .claude/
│   └── settings.local.json
├── .env.example
├── .gitignore
├── CLAUDE.md
├── index.html
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── THEME_AND_BRANDING_FIXES.md
├── gui_white_mode.png
│
├── openEXPERT_ANTON_Blueprint.md
├── openEXPERT_ANTON_DeepDive_Prompts_and_Areas.md
├── openEXPERT_ANTON_Persona_Validation.md
├── openEXPERT_Claude_Code_Extract_Prompt.md
├── openEXPERT_Whitepaper.md
│
├── data/
│   ├── workbench.sqlite
│   ├── workbench.sqlite-shm
│   └── workbench.sqlite-wal
│
├── public/
│   └── advisense-logo.svg
│
├── server/
│   ├── index.ts
│   ├── db/
│   │   ├── init.ts
│   │   └── schema.sql
│   ├── routes/
│   │   ├── claude.ts
│   │   ├── export.ts
│   │   ├── files.ts
│   │   ├── folders.ts
│   │   ├── health.ts
│   │   ├── modules.ts
│   │   └── sessions.ts
│   ├── services/
│   │   ├── claude-client.ts
│   │   ├── export-pptx.ts
│   │   ├── prompt-builder.ts
│   │   └── token-estimator.ts
│   └── prompts/
│       ├── data-management.md
│       ├── document-creation.md
│       ├── engagement-execution.md
│       ├── engagement-proposal.md
│       ├── gap-analysis.md
│       ├── investigation-support.md
│       ├── management-presentation.md
│       ├── model-validation.md
│       ├── regulatory-monitor.md
│       ├── risk-assessment.md
│       ├── sanctions-advisory.md
│       └── training-content.md
│
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── components/
    │   ├── layout/
    │   │   ├── Header.tsx
    │   │   ├── MainLayout.tsx
    │   │   └── Sidebar.tsx
    │   ├── shared/
    │   │   ├── ContextPanel.tsx
    │   │   ├── ConversationThread.tsx
    │   │   ├── CreativitySlider.tsx
    │   │   ├── ExportBar.tsx
    │   │   ├── FileUploader.tsx
    │   │   ├── FolderBrowser.tsx
    │   │   ├── HelpTooltip.tsx
    │   │   ├── KnowledgeSourcePanel.tsx
    │   │   ├── ModelSelector.tsx
    │   │   ├── OutputFormatSelector.tsx
    │   │   ├── OutputPanel.tsx
    │   │   ├── PromptEditor.tsx
    │   │   ├── SessionSummary.tsx
    │   │   ├── StatusIndicator.tsx
    │   │   ├── StructureReference.tsx
    │   │   ├── ThinkingControls.tsx
    │   │   └── WritingStylePanel.tsx
    │   └── modules/
    │       ├── DataManagement.tsx
    │       ├── DocumentCreation.tsx
    │       ├── EngagementExecution.tsx
    │       ├── EngagementProposal.tsx
    │       ├── GapAnalysis.tsx
    │       ├── InvestigationSupport.tsx
    │       ├── ManagementPresentation.tsx
    │       ├── ModelValidation.tsx
    │       ├── RegulatoryMonitor.tsx
    │       ├── RiskAssessment.tsx
    │       ├── SanctionsAdvisory.tsx
    │       └── TrainingContent.tsx
    ├── pages/
    │   ├── Dashboard.tsx
    │   ├── ModulePage.tsx
    │   ├── PromptPage.tsx
    │   ├── Settings.tsx
    │   ├── WorkflowBuilder.tsx
    │   └── WorkflowsPage.tsx
    ├── stores/
    │   ├── useModuleStore.ts
    │   ├── useSessionStore.ts
    │   ├── useSettingsStore.ts
    │   └── useWorkflowStore.ts
    ├── hooks/
    │   ├── useClaude.ts
    │   ├── useExport.ts
    │   ├── useFileUpload.ts
    │   └── useFolderBrowser.ts
    ├── lib/
    │   ├── api.ts
    │   ├── constants.ts
    │   ├── output-format-definitions.ts
    │   ├── types.ts
    │   └── workflow-definitions.ts
    └── theme/
        └── advisense.ts
```

**Total files:** 88 (excluding node_modules, .git, dist)

---

## 2. Component & Feature Inventory

### Core Engine

| Feature | Status | Details |
|---|---|---|
| Claude API integration (proxy, model selection, thinking/creativity controls) | ✅ **Built & Working** | `server/routes/claude.ts` proxies requests. `server/services/claude-client.ts` wraps the Anthropic SDK (v0.39.0) with `getThinkingConfig()` for Opus (adaptive+effort) and Sonnet/Haiku (manual budget_tokens). Three models: `claude-opus-4-6`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001`. Streaming via SSE with `content_block_start/delta/stop` event parsing. |
| Session management (create, persist, resume, SQLite storage) | 🔨 **Partially Built** | `server/routes/sessions.ts` has CRUD (list, create, get+messages, delete). `server/db/schema.sql` has `sessions` and `messages` tables. **Missing:** Session resume from UI (no "load previous session" button), messages are not saved to DB after streaming (the server streams but never writes to `messages` table), no auto-summary generation, no session forking. The Dashboard shows "No sessions yet" hardcoded text — it doesn't query the DB. |
| Chat interface (message display, streaming, markdown rendering) | ✅ **Built & Working** | `src/components/shared/ConversationThread.tsx` renders messages. `react-markdown` + `remark-gfm` + `rehype-highlight` for rendering. Streaming text/thinking deltas display in real-time. Thinking content is shown collapsible. |

### Knowledge Source System (4 modes)

| Feature | Status | Details |
|---|---|---|
| Mode 1: Claude's own knowledge | ✅ **Built & Working** | `src/components/shared/KnowledgeSourcePanel.tsx` has a "Claude's Own Knowledge" card with enable checkbox, web search toggle, and focus area text field. Web search adds `{ type: 'web_search_20250305', name: 'web_search' }` tool in `server/routes/claude.ts:36-38`. |
| Mode 2: Online regulation links | 🔨 **Partially Built** | UI exists in `KnowledgeSourcePanel.tsx` — users can paste URLs, add/remove them, choose full/summary mode. **Missing:** The `server/routes/claude.ts` does NOT fetch URL content server-side. There is no `fetchAndExtract()` service. The URLs are passed in the config but never resolved. The whitepaper envisions server-side fetch + text extraction + injection into context — none of this exists. |
| Mode 3: Local folders | 🔨 **Partially Built** | UI exists in `KnowledgeSourcePanel.tsx` for adding folder paths. Server has `server/routes/folders.ts` with browse, register, index, and delete endpoints. `folder-indexer.ts` from whitepaper doesn't exist as a separate service — folder indexing is inline in `folders.ts`. **Missing:** The folder contents (files) are never actually extracted to text and injected into the prompt. There is no `extractTextFromFile()` service. No `mammoth` or `pdf-parse` libraries are installed for document text extraction. Folder paths are stored in the knowledge source config but the claude route ignores them. |
| Mode 4: Combined (all sources together) | 🔨 **Partially Built** | UI exists with priority selector (local_first/merged/claude_first) and special instructions textarea. **Missing:** Since neither URL fetching nor folder text extraction work, the combined mode has nothing to combine. The combined mode instructions are in the config but are never assembled into the system prompt. |

**Knowledge Source System Overall:** The UI for all 4 modes is built and functional. The server-side resolution pipeline (`knowledge-source.ts` from CLAUDE.md) does NOT exist. No document text extraction services exist. No URL fetching exists. The knowledge source config is sent to the server but only the web search toggle actually does anything.

### Output Format System

| Feature | Status | Details |
|---|---|---|
| Format selector UI | ✅ **Built & Working** | `src/components/shared/OutputFormatSelector.tsx` renders multi-select chips grouped by category (Strategic, Analysis, Operational, Scoring, Communication, Planning). Selected chips glow teal. Shows count of selected formats. |
| How many formats? | ✅ **27 formats** | Defined in `src/lib/output-format-definitions.ts`. All 27 have full `promptInstruction` strings, export format mappings, audience labels, and estimated lengths. Categories: Strategic (3), Analytical (3), Operational (6), Scoring (3), Communication (7), Planning (3). Added since whitepaper: `scope-tracker`, `proposal-response`, `management-presentation`. |
| Do formats modify the system prompt? | ✅ **Yes** | `buildOutputInstruction()` in `output-format-definitions.ts` assembles format instructions. For single format: returns the `promptInstruction` directly. For multiple: wraps them in "MULTIPLE DELIVERABLES REQUESTED" header with numbered deliverable sections. This is called in `src/hooks/useClaude.ts` and sent as part of the request config to the server. However, the server (`claude.ts`) receives `outputFormats` in the request body but **does not use it** — the output format instruction is assembled client-side and included in the `systemPrompt` field that gets sent. |

### Area & Module System

| Feature | Status | Details |
|---|---|---|
| Area Navigator | 🔲 **Not Started** | No area concept exists in the codebase. The whitepaper envisions areas as high-level groupings (e.g., "AML/CFT", "Sanctions", "Risk") with colour-coding and browsing. Currently all 12 modules are in a flat list in the sidebar and dashboard. |
| Module selector within areas | 🔲 **Not Started** | No area→module hierarchy. |
| How many modules are configured? | ✅ **12 modules** | Defined in `src/lib/constants.ts` MODULES array. |
| Which modules? | ✅ | 1. AMLR Gap Analysis, 2. Document Creation, 3. Sanctions Advisory, 4. Regulatory Monitor, 5. Training Content, 6. AMLA Data Management, 7. Risk Assessment, 8. Investigation Support, 9. Engagement Proposal Writer, 10. Engagement Execution Engine, 11. Management Presentation, 12. FCP Model Validation |
| Module config structure | ✅ **Built** | Each module has: `id`, `label`, `shortLabel`, `icon` (Lucide icon name), `description`, `color` (Advisense theme color), `defaults` ({ thinking, creativity, outputFormats[], knowledgeSources }). See Section 5 for complete example. |
| Module-specific guided inputs | ✅ **Built & Working** | Each module has a dedicated component in `src/components/modules/*.tsx` with custom form fields. 12 module components exist. They call `onInputChange()` which updates `moduleInputs` in session store. |
| Server-side module prompts | ✅ **Built** | 12 `.md` prompt files in `server/prompts/`. Server has `GET /api/modules/:id/prompt` to fetch them. **However:** `ModulePage.tsx` uses hardcoded `defaultPrompts` object (inline strings) rather than fetching from server. The server prompts exist but are unused by the frontend. |
| Dynamic module loading from config | 🔨 **Partially Built** | Module definitions are in `constants.ts` (data-driven). Module components are registered in `ModulePage.tsx` via `moduleComponents` map. **But** adding a new module requires: 1) adding to `MODULES` array in `constants.ts`, 2) creating a React component, 3) registering in `moduleComponents` map in `ModulePage.tsx`, 4) adding to `defaultPrompts` in `ModulePage.tsx`, 5) adding to `modules.ts` server route, 6) creating a prompt `.md` file. It's partially data-driven but not fully dynamic. |

### 7-Layer Prompt Builder

| Feature | Status | Details |
|---|---|---|
| Layer 1: System Foundation (ANTON identity, quality standards) | 🔨 **Partially Built** | No standalone "ANTON identity" system prompt layer. The `server/routes/claude.ts:41` falls back to `'You are a helpful compliance assistant.'` if no system prompt is provided. Each module has its own base prompt (in `defaultPrompts` in `ModulePage.tsx` and in `server/prompts/*.md` files), but there is no shared Layer 1 foundation that wraps all modules. |
| Layer 2: Area Context (domain landscape, terminology) | 🔲 **Not Started** | No area system exists, so no area-level context injection. |
| Layer 3: Module Expertise (analytical framework, output structure) | ✅ **Built & Working** | Module system prompts define the analytical framework. Output format instructions define output structure. Both are injected into the system prompt. |
| Layer 4: Persona Injection | ✅ **Built & Working** | `server/services/prompt-builder.ts` has `getExpertRoleInstruction(role)` which maps 9 expert role IDs to prompt instructions. Injected in `server/routes/claude.ts:44-47` when role is not `fcp-expert`. |
| Layer 5: Skills Attachment | 🔲 **Not Started** | No skills system exists. |
| Layer 6: Knowledge Source Integration | 🔨 **Partially Built** | Web search tool is added when enabled. But document/folder/URL content injection does not work (see Knowledge Source section above). |
| Layer 7: Transparency & Reasoning | ✅ **Built & Working** | Multi-perspective instruction (`getMultiPerspectiveInstruction()`) and meta-cognitive instruction (`getMetaCognitiveInstruction()`) are injected as toggleable layers. Both are in `server/services/prompt-builder.ts` and applied in `server/routes/claude.ts:50-57`. |
| Single prompt composition service? | 🔨 **Partially** | Prompt assembly happens in two places: **Client-side:** `useClaude.ts` sends `systemPrompt` (module prompt + output format instructions assembled client-side). **Server-side:** `server/routes/claude.ts:41-65` concatenates the system prompt with expert role, multi-perspective, meta-cognitive, and structure reference instructions. There is no single `buildRequest()` function as described in CLAUDE.md — it's split across client and server. |

**Show the code that assembles the final prompt:**

```typescript
// server/routes/claude.ts lines 40-65
const promptParts: string[] = [systemPrompt || 'You are a helpful compliance assistant.'];

if (expertRole && expertRole !== 'fcp-expert') {
  const roleInstr = getExpertRoleInstruction(expertRole);
  if (roleInstr) promptParts.push(roleInstr);
}
if (multiPerspective) {
  promptParts.push(getMultiPerspectiveInstruction());
}
if (metaCognitiveEnabled) {
  promptParts.push(getMetaCognitiveInstruction());
}
if (structureReference && structureReference.mode !== 'none') {
  const structInstr = getStructureReferenceInstruction(structureReference);
  if (structInstr) promptParts.push(structInstr);
}
const enhancedSystemPrompt = promptParts.join('\n\n');
```

The `systemPrompt` coming from the client already contains the module base prompt + creativity instruction + planning instruction + output format instructions (assembled in `useClaude.ts` / `ModulePage.tsx`).

### Expert Personas

| Feature | Status | Details |
|---|---|---|
| "This Is Me" personal profile | 🔲 **Not Started** | No personal profile UI, storage, or prompt injection. |
| "Add Expert" persona selector | ✅ **Built & Working** | `src/components/shared/WritingStylePanel.tsx` contains a `<select>` dropdown of expert roles. Imported from `EXPERT_ROLES` in `constants.ts`. Selected role stored in `useSessionStore.ts` as `expertRole`. |
| Pre-built persona definitions | ✅ **9 personas** | Defined in `src/lib/constants.ts` EXPERT_ROLES array: FCP Expert (default), Legal Expert, Chief Compliance Officer, Business Expert, Trade Finance Expert, FSA Regulator, Financial Intelligence (FIU), Cyber & Fraud Expert, Sanctions Expert. Each has `id`, `label`, `description`, `promptInstruction`. |
| Persona prompt injection | ✅ **Working** | `server/services/prompt-builder.ts` has `EXPERT_ROLE_INSTRUCTIONS` map with 9 entries. `getExpertRoleInstruction(role)` returns `## EXPERT ROLE\n{instruction}`. Called in `server/routes/claude.ts:44-47` — only injected when role is not `fcp-expert` (default). |

### Guided Input System

| Feature | Status | Details |
|---|---|---|
| Module-specific input questions | ✅ **Built & Working** | Each of the 12 modules has a dedicated component in `src/components/modules/` with custom form fields (selects, textareas, checkboxes, chip selectors). |
| Inputs defined in config or hardcoded? | **Hardcoded per component** | Each module component has its own JSX with hardcoded fields. Not driven by a config schema — each is a bespoke React component. To add a new module's inputs, you write a new TSX component. |
| Example guided inputs | See `src/components/modules/GapAnalysis.tsx` — has: Entity type (select: Credit Institution, etc.), Jurisdiction (select), Customer segments (textarea), AMLR focus areas (chip multi-select: CDD/KYC, Beneficial Ownership, etc.), Known concerns (textarea). |

### Review Engine

| Feature | Status | Details |
|---|---|---|
| Multi-perspective review | 🔲 **Not Started** | No dedicated review engine. The `multiPerspective` toggle in WritingStylePanel tells Claude to analyze from 5 viewpoints, but this is a prompt instruction not a structured review workflow. |
| Review persona definitions | 🔲 **Not Started** | No review-specific personas (quality reviewer, regulatory reviewer, red team, etc.). |
| Review workflow | 🔲 **Not Started** | No mechanism to trigger a review of a previous output, no second-pass analysis, no review scoring. |

### Skills Repository

| Feature | Status | Details |
|---|---|---|
| Skill pack structure and storage | 🔲 **Not Started** | No skills system. No skill definitions, no storage, no UI. |
| Skill attachment to sessions | 🔲 **Not Started** | — |
| Pre-built skills | 🔲 **Not Started** | 0 skills exist. |

### Project System

| Feature | Status | Details |
|---|---|---|
| Project CRUD | 🔲 **Not Started** | No project concept in code. No DB table. No UI. |
| Session-to-project linking | 🔲 **Not Started** | — |
| Cross-area session grouping | 🔲 **Not Started** | — |
| Project templates | 🔲 **Not Started** | — |
| Project dashboard | 🔲 **Not Started** | — |

### Dashboard & Analytics

| Feature | Status | Details |
|---|---|---|
| Usage metrics / session tracking | 🔲 **Not Started** | Dashboard (`src/pages/Dashboard.tsx`) shows module cards and a "Recent Sessions" section that is hardcoded to show "No sessions yet" — it never queries the DB. |
| ROI tracker | 🔲 **Not Started** | — |
| Charts and visualisations | 🔲 **Not Started** | — |

### Build Your Own Module

| Feature | Status | Details |
|---|---|---|
| Save workflow as module | 🔲 **Not Started** | — |
| Module config generator from session | 🔲 **Not Started** | — |

### Open Chat / Free-Form Mode

| Feature | Status | Details |
|---|---|---|
| Free-form chat without module selection | ✅ **Built & Working** | `src/pages/PromptPage.tsx` at route `/prompt`. Full chat interface with streaming. Has a 3-step prompt improvement loop: 1) Claude analyzes your prompt, 2) asks clarifying questions, 3) builds improved version. |
| Capability settings panel in free-form mode | 🔨 **Partially Built** | PromptPage has model selector (3 models) and thinking level selector. **Missing:** No creativity slider, no output format selector, no knowledge source panel, no expert role selector. It's a stripped-down version compared to ModulePage. |
| Prompt improvement / enhancement loop | ✅ **Built & Working** | PromptPage has the 3-phase loop with "Improve My Prompt" button. Claude analyzes, asks questions, then builds an enhanced prompt. The improved prompt gets placed in the main input field. |

### Workflow Builder

| Feature | Status | Details |
|---|---|---|
| Multi-step module chaining | ✅ **Built & Working** | `src/lib/workflow-definitions.ts` defines 10 pre-built workflows, each with 3-5 steps (input → Claude analysis → Claude synthesis → export). Steps have `dependsOn` arrays for sequencing. |
| Guided execution mode (step-by-step) | ✅ **Built & Working** | `src/pages/WorkflowsPage.tsx` renders selected workflow step-by-step. Each step shows its type, description, and config. Claude steps show thinking/creativity settings. Users advance through steps. |
| Automatic execution mode (pipeline) | 🔲 **Not Started** | No auto-run-all capability. Each step must be manually advanced. |
| Workflow templates | ✅ **10 pre-built workflows** | 1. Regulatory Change Impact Tracker, 2. Client Risk Re-assessment, 3. Policy & Procedure Update Scanner, 4. Supervisory Ruling Analyzer, 5. Peer Comparison Engine, 6. Regulatory Monitoring Feed, 7. Sanctions Regime Change Alerter, 8. BWRA Annual Refresh, 9. Due Diligence Package Builder, 10. Multi-Client Compliance Status Report |
| Visual workflow builder | ✅ **Built & Working** | `src/pages/WorkflowBuilder.tsx` at `/workflows/builder`. Form-based builder with metadata (name, category, description, estimated time), step list with expandable cards, step types (Input/Claude/Export), reorder with up/down buttons, delete steps, save to localStorage. `src/stores/useWorkflowStore.ts` provides Zustand store with localStorage persistence. |

### Transparency Toggle

| Feature | Status | Details |
|---|---|---|
| UI toggle for reasoning explanation | ✅ **Built & Working** | `src/components/shared/WritingStylePanel.tsx` has a "Meta-cognitive reasoning" toggle switch. When enabled, it injects the DECOMPOSE/SOLVE/VERIFY/COMBINE/REFLECT prompt. |
| Does it modify the prompt? | ✅ **Yes** | `getMetaCognitiveInstruction()` in `server/services/prompt-builder.ts` returns a detailed instruction block. Injected in `server/routes/claude.ts:55-57`. |
| Three levels (off, summary, detailed)? | **No — binary only.** | It's a simple on/off toggle, not three levels. When ON, it's always the full 5-step meta-cognitive prompt. |

### Export Pipeline

| Feature | Status | Details |
|---|---|---|
| Markdown export | ✅ **Built & Working** | `server/routes/export.ts` writes `.md` file to `outputs/` dir and sends as download. |
| Word (.docx) export | 🐛 **Placeholder** | `export.ts:36-40` — Returns markdown as `.docx.md` file. Comment says "Placeholder: return markdown as .txt until docx library is integrated". The `docx` npm package is NOT installed. |
| Excel (.xlsx) export | 🐛 **Placeholder** | `export.ts:43-49` — Returns markdown as `.xlsx.md` file. The `exceljs` npm package is NOT installed. |
| PDF export | 🐛 **Placeholder** | `export.ts:52-58` — Returns markdown as `.pdf.md` file. `puppeteer` is NOT installed. |
| PowerPoint (.pptx) export | ✅ **Built & Working** | `server/services/export-pptx.ts` uses `pptxgenjs` to generate real `.pptx` files. Parses structured slide format (SLIDE N: TITLE, Type, Body, Notes, etc.) into actual PowerPoint slides with Advisense branding. |
| Libraries used | `pptxgenjs` (installed and working). `docx`, `exceljs`, `puppeteer`, `markdown-it` — **none of these are installed**. Only `pptxgenjs` and raw markdown export work. |

---

## 3. Database Schema

```sql
-- FCP Workbench Database Schema

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  thinking_content TEXT,
  content_blocks TEXT,
  token_count INTEGER,
  cost REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registered_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  file_count INTEGER DEFAULT 0,
  last_indexed TEXT
);

CREATE TABLE IF NOT EXISTS module_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(module_id, name)
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_module ON sessions(module_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
```

**4 tables, 3 indexes.** No tables for: projects, skills, personas, workflows, exports, user profiles, analytics/metrics.

---

## 4. System Prompt Architecture

### Where is the base/foundation prompt defined?

There is no single "ANTON foundation prompt" layer. The fallback is in `server/routes/claude.ts:41`:
```typescript
const promptParts: string[] = [systemPrompt || 'You are a helpful compliance assistant.'];
```

### Where are module-level prompts stored?

**Two places (not connected):**

1. **Client-side `defaultPrompts` object** in `src/pages/ModulePage.tsx:51-64` — 12 inline string prompts, one per module. This is what actually gets used.

2. **Server-side `.md` files** in `server/prompts/` — 12 markdown files with more detailed prompts. The server has `GET /api/modules/:id/prompt` to serve them. **But the frontend never calls this endpoint.** These server prompts are unused.

### Where are area-level prompts stored?

Nowhere. No area system exists.

### How are prompts combined before sending to the Claude API?

The prompt is assembled across client and server:

**Client-side (in `useClaude.ts` → `streamMessage()`):**
- Module prompt (from `defaultPrompts`) is set as `systemPrompt` in session store
- Output format instructions (from `buildOutputInstruction()`) — but wait, looking at the code more carefully, the output format instruction is included in the `config` sent to the server but the server does not process `outputFormats` into prompt text. The `systemPrompt` sent from the client is the raw module prompt as edited by the user.
- The `outputFormats` array is sent in the request body but the server ignores it.

**Server-side (in `server/routes/claude.ts`):**
```
Final prompt = [systemPrompt]
  + [Expert Role instruction] (if not fcp-expert)
  + [Multi-Perspective instruction] (if enabled)
  + [Meta-Cognitive instruction] (if enabled)
  + [Structure Reference instruction] (if set)
```

**Missing from the assembly:**
- Output format instructions are NOT being injected into the system prompt. The `buildOutputInstruction()` function exists but is never called during the actual API request flow. The output format chips appear selected in the UI but their prompt instructions are not reaching Claude.
- Creativity instruction (`getCreativityInstruction()`) is defined in `prompt-builder.ts` but is NOT called in `claude.ts`. The creativity level is sent in the request but not turned into a prompt instruction.
- Planning instruction (`getPlanningInstruction()`) is defined but NOT called.
- Knowledge source context documents are not injected.

**This is a significant bug.** The output format system, creativity instructions, and planning instructions all have code that generates prompt text, but none of it is actually wired into the final prompt sent to Claude.

---

## 5. Config Structure

### One area definition

No areas exist in the codebase. The whitepaper envisions:
```json
{
  "id": "aml-cft",
  "label": "AML/CFT",
  "description": "Anti-Money Laundering and Counter-Terrorist Financing",
  "color": "adv-teal",
  "icon": "Shield",
  "modules": ["gap-analysis", "document-creation", ...]
}
```
But nothing like this exists today.

### One module definition (from `src/lib/constants.ts`)

```typescript
{
  id: 'gap-analysis',
  label: 'AMLR Gap Analysis',
  shortLabel: 'Gap Analysis',
  icon: 'SearchCheck',
  description: 'Analyze compliance gaps against AMLR and other regulatory frameworks. Upload client documents, point to regulations, and get structured gap assessments.',
  color: 'adv-teal',
  defaults: {
    thinking: 'investigate',
    creativity: 'strict',
    outputFormats: ['gap-scoring-matrix', 'executive-summary', 'action-plan'],
    knowledgeSources: {
      claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
      localFolder: { enabled: true, folderPaths: [], recursive: true },
    },
  },
}
```

### One persona definition (from `src/lib/constants.ts` EXPERT_ROLES)

```typescript
{
  id: 'legal-expert',
  label: 'Legal Expert',
  description: 'Regulatory law and compliance legal specialist',
  promptInstruction: 'You are a regulatory legal expert specializing in financial crime prevention law. You analyze legal texts with precision, cite specific articles and recitals, assess legal risks, and provide opinions grounded in statutory interpretation and case law. You distinguish between binding requirements and supervisory expectations.',
}
```

### One skill definition

No skills exist in the codebase. 0 skill definitions.

### Main app configuration / environment config

`.env.example` (not read but referenced in CLAUDE.md):
```bash
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
UPLOAD_DIR=./uploads
OUTPUT_DIR=./outputs
DB_PATH=./data/workbench.sqlite
MAX_FILE_SIZE_MB=50
MAX_CONTEXT_TOKENS=180000
DEFAULT_MODEL=claude-opus-4-6
DEFAULT_THINKING=think_hard
DEFAULT_CREATIVITY=balanced
```

Actual env usage in code:
- `ANTHROPIC_API_KEY` — used in `claude-client.ts`
- `PORT` — used in `server/index.ts` (default 3001)
- `UPLOAD_DIR` — used in `routes/files.ts` (default `./uploads`)
- `OUTPUT_DIR` — used in `routes/export.ts` (default `./outputs`)
- `MAX_FILE_SIZE_MB` — used in `routes/files.ts` (default 50)
- `DB_PATH` — likely used in `db/init.ts`
- Other env vars (`MAX_CONTEXT_TOKENS`, `DEFAULT_MODEL`, etc.) — **not referenced in any code**

---

## 6. API Integration

### How the Claude API is called

`server/services/claude-client.ts` creates an Anthropic SDK singleton:
```typescript
let client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}
```

Streaming call:
```typescript
const stream = await anthropic.messages.stream(requestParams as any);
for await (const event of stream) {
  // handle content_block_start, content_block_delta, content_block_stop, message_delta
}
```

### Models configured

```typescript
type ModelId = 'claude-opus-4-6' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001';
```

With cost info in constants:
- Opus 4.6: $15/M input, $75/M output, 32K max output
- Sonnet 4.5: $3/M input, $15/M output, 8K max output
- Haiku 4.5: $1/M input, $5/M output, 8K max output

### How streaming is handled

SSE (Server-Sent Events). Server sets headers:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

Events sent as `data: {json}\n\n`. Event types: `stream_start`, `thinking_delta`, `text_delta`, `web_search_start`, `usage`, `error`, `stream_end`. Terminates with `data: [DONE]\n\n`.

Client-side: `src/lib/api.ts` `streamMessage()` is an async generator that reads the SSE stream with `ReadableStream` reader and yields `StreamEvent` objects.

### How thinking/extended thinking is configured

```typescript
function getThinkingConfig(level: ThinkingLevel, model: ModelId) {
  if (model === 'claude-opus-4-6') {
    // Note: Uses enabled+budget_tokens(10000) + effort, NOT adaptive as CLAUDE.md specifies
    return {
      thinking: { type: 'enabled', budget_tokens: 10000 },
      effort: { quick: 'low', think: 'medium', think_hard: 'high', investigate: 'max', plan_first: 'max' }[level],
    };
  }
  // Sonnet/Haiku: manual budget_tokens
  const budget = { quick: null, think: 4096, think_hard: 16384, investigate: 32768, plan_first: 32768 }[level];
  return budget === null ? {} : { thinking: { type: 'enabled', budget_tokens: budget } };
}
```

**Note:** For Opus, the CLAUDE.md specifies `thinking: { type: 'adaptive' }` but the code uses `{ type: 'enabled', budget_tokens: 10000 }` — this is a discrepancy. The fixed 10000 budget_tokens for Opus may be suboptimal.

### How creativity/temperature is set

Creativity is NOT set via temperature. It's supposed to be via prompt injection using `getCreativityInstruction()` in `prompt-builder.ts`:
- Strict: "Precise, factual, cite everything, formal regulatory language, flag uncertainty"
- Balanced: "Accurate, accessible, use examples, professional but readable"
- Creative: "Engaging, storytelling, real-world examples, factual accuracy maintained"

**However, `getCreativityInstruction()` is never called in `claude.ts`.** The creativity level is accepted from the request body but not converted into a prompt instruction. This means creativity has no effect on the output.

### Rate limiting or error handling

- No rate limiting on the server.
- Basic error handling: try/catch around the stream, sends error event to client.
- `isApiKeyConfigured()` check before processing requests.
- No retry logic, no token counting before sending, no context limit enforcement.

---

## 7. Frontend Architecture

### Routing structure

Defined in `src/App.tsx`:

| Route | Component | Description |
|---|---|---|
| `/` | `Dashboard` | Module grid cards + "Recent Sessions" (static) |
| `/prompt` | `PromptPage` | Free-form chat with prompt improvement loop |
| `/module/:moduleId` | `ModulePage` | Main workspace — config panel + output panel |
| `/workflows` | `WorkflowsPage` | Workflow library (10 pre-built + custom) |
| `/workflows/builder` | `WorkflowBuilder` | Create new custom workflow |
| `/workflows/builder/:id` | `WorkflowBuilder` | Edit existing custom workflow |
| `/settings` | `Settings` | API status, default settings display |

All routes are wrapped in `<MainLayout>` which provides `<Sidebar>` + `<Header>` + `<Outlet>`.

### State management approach

**Zustand** (v5.0.3) with 4 stores:

1. **`useSessionStore`** — Current session state: messages, streaming state, model/thinking/creativity/expertRole/multiPerspective/metaCognitiveEnabled/structureReference, system prompt, output formats, knowledge sources, module inputs, usage stats. No persistence.

2. **`useSettingsStore`** — Health status, theme (dark/light/corporate with localStorage), sidebar collapsed state (localStorage).

3. **`useModuleStore`** — Appears to exist (file present) but not heavily used.

4. **`useWorkflowStore`** — Custom workflow CRUD with localStorage persistence (`fcp-workbench-custom-workflows` key).

### Main layout components

- `MainLayout.tsx` — Flex container: `<Sidebar>` + vertical stack of `<Header>` + `<Outlet>` (page content)
- `Sidebar.tsx` — Collapsible sidebar (280px ↔ 64px). Logo, Dashboard/Prompt/Workflows links, Modules section with all 12 modules, Recent Sessions placeholder, toggle button.
- `Header.tsx` — Top bar with theme toggle (dark/light/corporate cycle)

### How the chat interface works

`ModulePage.tsx` uses `useClaude()` hook which:
1. Creates user message, adds to store
2. Calls `startStreaming()` (creates AbortController)
3. Calls `streamMessage()` async generator from `api.ts`
4. Each yielded event goes through `handleStreamEvent()` in session store
5. `text_delta` events append to `streamingText`, `thinking_delta` to `streamingThinking`
6. `stream_end` event creates final assistant message, resets streaming state
7. `ConversationThread.tsx` renders all messages with markdown

### How module selection changes the UI

Navigating to `/module/:moduleId` triggers `ModulePage` `useEffect` which:
1. Calls `clearSession()` (resets all state)
2. Sets module ID, thinking level, creativity level, output formats, knowledge sources from module defaults
3. Sets system prompt from `defaultPrompts[moduleId]`
4. Renders the module's specific guided inputs component (from `moduleComponents` map)

### UI component library

Tailwind CSS v4 with custom Advisense theme. No shadcn/ui components imported despite CLAUDE.md mentioning it — all components are custom-built. Lucide React icons throughout.

---

## 8. Known Issues & Technical Debt

### Critical Bugs

1. **Output format instructions never reach Claude.** `buildOutputInstruction()` exists in `output-format-definitions.ts` and the UI lets users select formats, but the selected format instructions are never injected into the system prompt sent to the API. The server receives `outputFormats` in the body but ignores it. Users see format chips selected but Claude doesn't know about them.

2. **Creativity instructions never reach Claude.** `getCreativityInstruction()` is defined in `prompt-builder.ts` but never called. The creativity slider has no effect on the output.

3. **Planning instruction never reaches Claude.** `getPlanningInstruction()` is defined but never called. The "Plan First" thinking level adds effort=max but doesn't inject the planning prompt.

4. **Messages never persisted to SQLite.** The `messages` table exists in the schema, session CRUD works, but the streaming handler in `claude.ts` never writes assistant messages to the DB. The session store's `addMessage` only updates in-memory state. Sessions cannot be resumed.

5. **Server-side module prompts unused.** 12 `.md` files exist in `server/prompts/` and the API endpoint works, but `ModulePage.tsx` uses hardcoded `defaultPrompts` strings instead of fetching from the server.

### Hardcoded When Should Be Configurable

6. **Module list hardcoded in 3 places:** `src/lib/constants.ts` (MODULES array), `src/pages/ModulePage.tsx` (moduleComponents map + defaultPrompts), `server/routes/modules.ts` (module list). Adding a module requires touching all three.

7. **Default model hardcoded** as `'claude-opus-4-6'` in session store and claude.ts fallback. The `.env` `DEFAULT_MODEL` is never read by the frontend.

8. **Export formats hardcoded.** Each output format definition has `exportFormats` array, but the ExportBar shows whatever `getRecommendedExportFormats()` returns, which works. However, docx/xlsx/pdf are listed as export options despite being placeholder implementations.

### Missing Error Handling

9. **No token counting before sending.** There's a `token-estimator.ts` service file but it's not wired into the request flow. No warning when context is too large. No `MAX_CONTEXT_TOKENS` enforcement.

10. **No cost estimation before running.** The status indicator shows tokens after the response, but there's no pre-run cost estimate.

11. **No retry on API failure.** Single try/catch, no exponential backoff, no retry.

12. **Folder text extraction doesn't exist.** `mammoth`, `pdf-parse`, `xlsx` for reading are NOT installed. Uploading files and registering folders gives the appearance of functionality but the file contents never reach Claude.

### Performance Concerns

13. **No response caching.** Every run hits the API fresh.

14. **No prompt caching.** The Anthropic API supports prompt caching, but it's not used.

15. **Large bundle warning.** Build produces chunks >500 kB (expected for this app size but worth monitoring).

### UI Issues

16. **Dashboard "Recent Sessions" is static.** Shows "No sessions yet" always — never queries the DB.

17. **Sidebar "Recent Sessions" is static.** Shows "No recent sessions" always.

18. **Settings page is read-only.** Shows defaults but doesn't let you change them.

19. **No loading states for folder browsing/indexing.** Folder operations may hang without feedback.

20. **Export buttons show docx/xlsx/pdf options that don't produce real files.** Users click "Export as .docx" and get a `.docx.md` markdown file. This is confusing.

### Things That Would Break in Production

21. **API key is the only auth.** No user authentication, no session isolation between users if deployed on a shared network.

22. **No HTTPS.** localhost only, which is fine for single-user but would need TLS for any network deployment.

23. **`cors()` is wide open.** Accepts all origins.

24. **No input sanitization** on folder paths beyond `path.isAbsolute()` check. The path traversal protection on file downloads is present but basic.

---

## 9. Package Dependencies

```json
{
  "name": "fcp-workbench",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently -n client,server -c blue,green \"pnpm run dev:client\" \"pnpm run dev:server\"",
    "dev:client": "vite",
    "dev:server": "tsx watch server/index.ts",
    "build": "tsc -b && vite build",
    "start": "node dist/server/index.js",
    "db:init": "tsx server/db/init.ts",
    "typecheck": "tsc -b --noEmit",
    "preview": "vite preview"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "better-sqlite3": "^11.7.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "fs-extra": "^11.2.0",
    "lucide-react": "^0.469.0",
    "multer": "^1.4.5-lts.1",
    "pptxgenjs": "^4.0.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.3",
    "react-router-dom": "^6.28.1",
    "rehype-highlight": "^7.0.2",
    "remark-gfm": "^4.0.0",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.6",
    "@types/better-sqlite3": "^7.6.12",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/fs-extra": "^11.0.4",
    "@types/multer": "^1.4.12",
    "@types/node": "^22.10.7",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "concurrently": "^9.1.2",
    "tailwindcss": "^4.0.6",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vite": "^6.0.11"
  }
}
```

**Missing dependencies referenced in CLAUDE.md but not installed:**
- `docx` (Word export)
- `exceljs` (Excel export)
- `puppeteer` (PDF export)
- `markdown-it` (Markdown→HTML)
- `mammoth` (DOCX text extraction)
- `pdf-parse` (PDF text extraction)
- `xlsx` (Excel text extraction)
- `chokidar` (folder watching)

---

## 10. What I Think the Priorities Should Be

Based on thorough analysis of the codebase, here are the 5 most impactful things to build or fix for an open source release:

### Priority 1: Fix the Prompt Assembly Pipeline (Critical Bug)

**Why:** The output format system (27 formats), creativity instructions, and planning instructions are all beautifully designed but **none of them reach Claude**. Users select output formats, adjust creativity, and choose "Plan First" — and nothing happens. This is the single biggest gap between what the UI promises and what the system delivers.

**What to do:** Create a proper `buildRequest()` function (as described in CLAUDE.md) that assembles ALL layers into the final system prompt: module prompt + creativity instruction + planning instruction + output format instructions + expert role + multi-perspective + meta-cognitive + structure reference + knowledge source context. This should be done server-side in a single function.

### Priority 2: Implement Document Text Extraction & Knowledge Source Resolution

**Why:** This is "the killer feature" per CLAUDE.md. Users can upload files and register folders, but the content never reaches Claude. The entire Knowledge Source System (Modes 2, 3, 4) is UI-only. For FCP consultants, the ability to upload client documents + regulation texts and have Claude analyze them is the core value proposition.

**What to do:** Install `mammoth`, `pdf-parse`, and implement `extractTextFromFile()` service. Create `knowledge-source.ts` resolver that fetches URLs, extracts folder contents, estimates tokens, and injects everything into the system prompt. Wire it into the prompt assembly pipeline.

### Priority 3: Wire Session Persistence End-to-End

**Why:** Sessions exist in the DB schema but messages never get written. The Dashboard and Sidebar show "No sessions" hardcoded. Without persistence, users lose all work when they navigate away. For a tool used in multi-hour consulting engagements, this is critical.

**What to do:** After each assistant message completes streaming, save the message to SQLite. Save the user message before streaming starts. Make the Dashboard query actual sessions from DB. Make the Sidebar show recent sessions. Add a "Resume Session" flow.

### Priority 4: Implement Real Export (DOCX, XLSX, PDF)

**Why:** The export pipeline is a key value multiplier — "one analysis → board PDF + team Excel + PM action plan." Currently only Markdown and PowerPoint work. The DOCX, XLSX, and PDF buttons exist but produce markdown files with misleading extensions. For compliance consultants who deliver Word documents and Excel matrices to clients, this is table stakes.

**What to do:** Install `docx`, `exceljs`, and `puppeteer` (or a lighter PDF solution). Implement proper conversion with Advisense branding, headers/footers, conditional formatting for RAG scores in Excel, and professional typography in PDF.

### Priority 5: Rename & Rebrand to openEXPERT / ANTON

**Why:** The codebase currently identifies as "Advisense FCP Workbench" / "fcp-workbench" / "Anton" (partially renamed). For an open source release under the "openEXPERT by ANTON" brand, the naming needs to be consistent throughout: package.json name, page titles, sidebar branding, system prompts, CLAUDE.md, and all user-facing strings.

**What to do:** Systematic find-and-replace of "Advisense FCP Workbench" → "openEXPERT by ANTON", update `package.json` name, update sidebar branding, create a proper ANTON identity Layer 1 system prompt that wraps all modules, and ensure all module prompts reference the ANTON identity rather than "Advisense".

---

### Honourable Mentions (Priority 6-10):

6. **Server-side prompt loading** — Make ModulePage fetch prompts from `server/prompts/*.md` instead of using hardcoded inline strings. The server endpoint exists; just wire it up.

7. **Fix Opus thinking config** — Change from `{ type: 'enabled', budget_tokens: 10000 }` to `{ type: 'adaptive' }` as CLAUDE.md specifies, to get proper adaptive thinking behaviour.

8. **Area system** — Group the 12 modules into logical areas (AML/CFT, Sanctions, Risk, Advisory, etc.) with colour-coding and navigation. This is a key whitepaper feature.

9. **Pre-run cost estimation** — Show estimated cost before running, given model + estimated input tokens + thinking level. Users are spending real money on Opus calls.

10. **Review Engine** — Add the ability to run a second-pass review of output with different personas (quality reviewer, regulatory reviewer, red team). This is a key whitepaper differentiator.

---

*This document was generated by Claude Code from a complete analysis of all 88 files in the codebase.*
