# CLAUDE.md — ANTON AI Workbench

## PROJECT IDENTITY

**Name:** ANTON FCP Workbench  
**Internal codename:** `fcp-workbench`  
**Purpose:** A modular, AI-powered local web application that enables Financial Crime Prevention (FCP) consultants — including non-technical compliance officers, lawyers, and senior advisors — to leverage Claude's full capabilities through a visual, guided interface. No command-line knowledge required. Every Claude API feature is exposed as a simple toggle, click, or slider.

**Who built this:** Daniel Bardun & Futurechain team (Daniel Bardun, Jonas Karlsson, Max Krackhardt, Björn Heir, Sofia Stenius-Linna, Petra Andrésdottir)  
**Who uses this:** FCP consultants working in AML/CFT, sanctions, compliance, and regulatory implementation for Nordic and European financial institutions.

**Deployment:** Local — runs on consultant laptops via `localhost`. No cloud deployment. Documents stay on the machine. Only Claude API calls leave the network.

**Design philosophy:** "Start with the problem, not the solution." Every module begins with a clear problem statement and pre-configured AI behaviour. Users can override everything, but the defaults should produce excellent results for someone who just clicks "Run."

---

## TECH STACK

### Core Application
- **Framework:** React 18+ with TypeScript
- **Build tool:** Vite
- **UI library:** Tailwind CSS + shadcn/ui components (for professional, accessible UI)
- **State management:** Zustand (lightweight, simple)
- **Routing:** React Router v6
- **Icons:** Lucide React (matches ANTON clean aesthetic)
- **Markdown rendering:** `react-markdown` + `remark-gfm` for tables, `rehype-highlight` for code

### Backend / API Layer
- **Runtime:** Node.js (Express)
- **Claude API:** Anthropic SDK (`@anthropic-ai/sdk`) — latest version supporting adaptive thinking, web search tool, and effort parameter
- **File handling:** `multer` for uploads, `fs-extra` for folder operations, `chokidar` for folder watching
- **Document text extraction:**
  - `mammoth` for .docx → text
  - `pdf-parse` for PDF → text
  - `xlsx` for Excel → text
  - Plain text / Markdown read directly
- **Document generation (export):**
  - `docx` npm package for .docx creation
  - `exceljs` for .xlsx creation with formatting, formulas, conditional formatting
  - `puppeteer` for Markdown → HTML → PDF with ANTON branding
  - `markdown-it` for Markdown → HTML conversion

### Storage (All Local)
- **SQLite** via `better-sqlite3` — sessions, conversation history, module configs, folder registrations
- **Local file system** — uploaded documents, generated outputs, registered folder paths
- **JSON files** — module prompt templates (editable, version-controllable)

### Development
- **Package manager:** pnpm (faster, disk-efficient)
- **Linting:** ESLint + Prettier
- **Testing:** Vitest

---

## PROJECT STRUCTURE

```
fcp-workbench/
├── CLAUDE.md                          # This file — project instructions
├── package.json
├── pnpm-workspace.yaml
├── vite.config.ts
├── tsconfig.json
├── .env                               # ANTHROPIC_API_KEY + local config
├── .env.example
│
├── server/
│   ├── index.ts                       # Express entry — serves API + static React build
│   ├── routes/
│   │   ├── claude.ts                  # Claude API proxy — streaming SSE
│   │   ├── files.ts                   # File upload + text extraction
│   │   ├── folders.ts                 # Folder registration, browsing, indexing
│   │   ├── modules.ts                 # Module config CRUD
│   │   ├── sessions.ts               # Session management
│   │   └── export.ts                  # Export to .docx/.xlsx/.pdf
│   ├── services/
│   │   ├── claude-client.ts           # Full Claude API wrapper
│   │   ├── knowledge-source.ts        # Knowledge Source System — 4-mode resolver
│   │   ├── file-processor.ts          # Extract text from any supported file
│   │   ├── folder-indexer.ts          # Index folder contents, watch for changes
│   │   ├── prompt-builder.ts          # Assembles final prompt from all sources
│   │   ├── output-formatter.ts        # Routes output to correct format/template
│   │   ├── export-docx.ts             # Markdown → DOCX with ANTON styling
│   │   ├── export-xlsx.ts             # Structured data → Excel with scoring
│   │   ├── export-pdf.ts              # Markdown → PDF via Puppeteer
│   │   └── session-store.ts           # SQLite session CRUD
│   ├── prompts/                       # Pre-built system prompts per module
│   │   ├── gap-analysis.md
│   │   ├── document-creation.md
│   │   ├── sanctions-advisory.md
│   │   ├── regulatory-monitor.md
│   │   ├── training-content.md
│   │   ├── data-management.md
│   │   ├── risk-assessment.md
│   │   └── investigation-support.md
│   └── db/
│       └── schema.sql
│
├── src/                               # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── MainLayout.tsx
│   │   │
│   │   ├── shared/
│   │   │   ├── ThinkingControls.tsx       # Think levels as clickable cards
│   │   │   ├── CreativitySlider.tsx        # 3-position slider
│   │   │   ├── ModelSelector.tsx           # Model picker with descriptions
│   │   │   ├── KnowledgeSourcePanel.tsx    # THE 4-MODE KNOWLEDGE SOURCE SELECTOR
│   │   │   ├── OutputFormatSelector.tsx    # MULTI-SELECT OUTPUT FORMAT CHIPS
│   │   │   ├── PromptEditor.tsx            # View/edit system prompt
│   │   │   ├── FileUploader.tsx            # Drag-drop uploads
│   │   │   ├── FolderBrowser.tsx           # Browse + register local folders
│   │   │   ├── ContextPanel.tsx            # Shows all loaded context + token count
│   │   │   ├── OutputPanel.tsx             # Rendered output with export
│   │   │   ├── ConversationThread.tsx      # Message history + continue
│   │   │   ├── ExportBar.tsx               # Format-specific export buttons
│   │   │   ├── SessionSummary.tsx          # Auto-summary
│   │   │   ├── StatusIndicator.tsx         # API status, tokens, cost
│   │   │   └── HelpTooltip.tsx             # Contextual help
│   │   │
│   │   └── modules/
│   │       ├── GapAnalysis.tsx
│   │       ├── DocumentCreation.tsx
│   │       ├── SanctionsAdvisory.tsx
│   │       ├── RegulatoryMonitor.tsx
│   │       ├── TrainingContent.tsx
│   │       ├── DataManagement.tsx
│   │       ├── RiskAssessment.tsx
│   │       └── InvestigationSupport.tsx
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── ModulePage.tsx
│   │   └── Settings.tsx
│   │
│   ├── stores/
│   │   ├── useSessionStore.ts
│   │   ├── useModuleStore.ts
│   │   └── useSettingsStore.ts
│   │
│   ├── hooks/
│   │   ├── useClaude.ts
│   │   ├── useFileUpload.ts
│   │   ├── useFolderBrowser.ts
│   │   └── useExport.ts
│   │
│   ├── lib/
│   │   ├── api.ts
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   └── output-format-definitions.ts   # All output format configs
│   │
│   └── theme/
│       └── colors.ts
│
├── public/
│   └── anton-logo.svg
│
├── uploads/                           # User uploaded files (gitignored)
├── outputs/                           # Generated exports (gitignored)
└── data/                              # SQLite DB (gitignored)
```

---

## ADVISENSE DESIGN SYSTEM

The application must feel professional, calm, and trustworthy — matching the ANTON brand. Used by senior compliance professionals, lawyers, and board advisors aged 35-65. Not a startup toy.

### Color Palette
```typescript
const antonTheme = {
  colors: {
    'adv-dark':      '#0B1426',   // Main background
    'adv-dark-2':    '#0F1B2D',   // Secondary background
    'adv-card':      '#152238',   // Card/panel backgrounds
    'adv-teal':      '#2DD4A8',   // Primary accent — CTAs, active states
    'adv-teal-dark': '#1BA882',   // Hover states
    'adv-teal-dim':  '#144D3C',   // Subtle teal backgrounds
    'adv-teal-soft': '#0D2E3A',   // Insight/info panels
    'adv-white':     '#FFFFFF',
    'adv-off-white': '#E0E0E0',   // Primary body text
    'adv-gray':      '#B0B0B0',   // Secondary text
    'adv-gray-med':  '#707070',   // Tertiary/caption
    'adv-gold':      '#F5A623',   // Warning, attention
    'adv-red':       '#E74C3C',   // Error, critical
    'adv-green':     '#27AE60',   // Success
    'adv-blue':      '#3498DB',   // Info
  },
  fontFamily: {
    sans: ['Inter', 'Calibri', 'system-ui', 'sans-serif'],
  },
};
```

### UI Design Rules
1. **Dark theme by default** — ANTON brand. Optional light mode toggle.
2. **Card-based design** — modules, panels, outputs use cards with subtle `shadow-lg`.
3. **Teal = action** — all interactive elements: buttons, active tabs, progress, links.
4. **Large readable text** — minimum 14px body. Users are 35-65 years old.
5. **Clear labels on everything** — every toggle/slider has a human-readable label + tooltip.
6. **No jargon** — "How deeply should Claude analyze?" not "budget_tokens".
7. **Progressive disclosure** — advanced options behind "Advanced Settings" accordion.
8. **Keyboard navigable** — full ARIA labels, focus rings.

---

## ═══════════════════════════════════════════════════════════════
## CORE SYSTEM 1: KNOWLEDGE SOURCE PANEL
## ═══════════════════════════════════════════════════════════════

This is a **critical differentiator**. Every module has a Knowledge Source Panel that controls WHERE Claude gets its reference material. Four modes, usable individually or in combination.

### The Four Knowledge Source Modes

```typescript
interface KnowledgeSourceConfig {
  modes: {
    claudeKnowledge: {
      enabled: boolean;
      webSearchEnabled: boolean;        // Use Claude API web_search tool
      description: string;               // What to search for / focus on
    };
    onlineReference: {
      enabled: boolean;
      urls: string[];                    // Direct URLs to regulations, documents
      fetchDepth: 'summary' | 'full';   // Summary or full text extraction
    };
    localFolder: {
      enabled: boolean;
      folderPaths: string[];             // Registered local folder paths
      fileFilter?: string[];             // Optional: only .pdf, .docx, etc.
      recursive: boolean;               // Include subfolders?
    };
    combinedMode: {
      enabled: boolean;                  // Claude knowledge + local docs
      priority: 'local_first' | 'claude_first' | 'merged';
      instructions?: string;            // How to combine/reconcile sources
    };
  };
}
```

### UI: KnowledgeSourcePanel Component

```
┌────────────────────────────────────────────────────────────────┐
│ 📚 Knowledge Sources                                     ⓘ    │
│ Where should Claude find regulatory text and reference         │
│ material? Select one or more sources.                          │
│                                                                │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ ☑ 🧠 Claude's Own Knowledge                               ││
│ │   Claude uses its built-in knowledge of regulations,       ││
│ │   guidelines, and legal frameworks.                        ││
│ │                                                            ││
│ │   ☑ Enable web search (Claude searches the internet       ││
│ │     for the latest regulatory publications)                ││
│ │                                                            ││
│ │   Focus area (optional):                                   ││
│ │   ┌──────────────────────────────────────────────────────┐ ││
│ │   │ AMLR Regulation 2024/1624, AMLA RTS consultations   │ ││
│ │   └──────────────────────────────────────────────────────┘ ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ ☐ 🔗 Online Regulation / Document Links                    ││
│ │   Paste URLs to specific regulatory texts, guidelines,     ││
│ │   or online documents. Claude will read and use them.      ││
│ │                                                            ││
│ │   ┌──────────────────────────────────────────────────────┐ ││
│ │   │ https://eur-lex.europa.eu/eli/reg/2024/1624/oj  [+] │ ││
│ │   └──────────────────────────────────────────────────────┘ ││
│ │   Added: (none yet)                                        ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ ☑ 📂 Local Folders                                         ││
│ │   Point to folders on your computer containing regulation  ││
│ │   texts, client documents, or reference materials.         ││
│ │                                                            ││
│ │   📁 /Users/daniel/ANTON/Regulations/AMLR       [✕]   ││
│ │      12 files · 145,000 words · .pdf .docx                 ││
│ │   📁 /Users/daniel/Clients/Nordea/AML-Docs          [✕]   ││
│ │      8 files · 62,000 words · .pdf .docx .xlsx             ││
│ │                                                            ││
│ │   [+ Add Folder]  ☑ Include subfolders                     ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ ☐ 🔄 Combined: Search + Local Documents                   ││
│ │   Claude uses its knowledge AND your local documents.      ││
│ │   Best for: comparing client docs against regulations      ││
│ │   Claude didn't receive as text.                           ││
│ │                                                            ││
│ │   Priority: ○ Local docs first  ● Merged  ○ Claude first  ││
│ │                                                            ││
│ │   Special instructions (optional):                         ││
│ │   ┌──────────────────────────────────────────────────────┐ ││
│ │   │ Compare the client's policy against the regulation.  │ ││
│ │   │ Where the client doc is silent, use the regulation   │ ││
│ │   │ text to identify the gap.                            │ ││
│ │   └──────────────────────────────────────────────────────┘ ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                │
│  Total loaded context: 207,000 words (~275k tokens)            │
│  ⚠ Approaching context limit — consider selecting fewer files  │
│  or using "Summary" mode for online references.                │
└────────────────────────────────────────────────────────────────┘
```

### Implementation: Knowledge Source Resolver

```typescript
// server/services/knowledge-source.ts

async function resolveKnowledgeSources(config: KnowledgeSourceConfig): Promise<ResolvedKnowledge> {
  const result: ResolvedKnowledge = { systemPromptAdditions: '', contextDocuments: '', tools: [], tokenEstimate: 0 };

  // MODE 1: Claude knowledge + optional web search
  if (config.modes.claudeKnowledge.enabled) {
    if (config.modes.claudeKnowledge.webSearchEnabled) {
      result.tools.push({ type: 'web_search_20250305', name: 'web_search' });
      result.systemPromptAdditions += `\n\n## WEB SEARCH ENABLED\nUse web search for latest regulatory texts and publications. Focus: ${config.modes.claudeKnowledge.description || 'relevant regulatory sources'}. Cite all web sources.`;
    }
    if (config.modes.claudeKnowledge.description) {
      result.systemPromptAdditions += `\n\n## KNOWLEDGE FOCUS\nFocus on: ${config.modes.claudeKnowledge.description}`;
    }
  }

  // MODE 2: Online URLs — fetch server-side and include as context
  if (config.modes.onlineReference.enabled) {
    for (const url of config.modes.onlineReference.urls) {
      try {
        const text = await fetchAndExtract(url);
        const truncated = config.modes.onlineReference.fetchDepth === 'summary' ? summarize(text, 5000) : text;
        result.contextDocuments += `\n\n### ONLINE REFERENCE: ${url}\n${truncated}`;
      } catch (e) {
        result.contextDocuments += `\n\n### ONLINE REFERENCE (FETCH FAILED): ${url}\nUse web search or knowledge for this source.`;
      }
    }
  }

  // MODE 3: Local folders — extract text from all files
  if (config.modes.localFolder.enabled) {
    for (const folderPath of config.modes.localFolder.folderPaths) {
      const files = await indexFolder(folderPath, { recursive: config.modes.localFolder.recursive, filter: config.modes.localFolder.fileFilter });
      for (const file of files) {
        const text = await extractTextFromFile(file.path);
        result.contextDocuments += `\n\n### LOCAL DOCUMENT: ${file.name} (from ${folderPath})\n${text}`;
        result.tokenEstimate += estimateTokens(text);
      }
    }
  }

  // MODE 4: Combined instructions
  if (config.modes.combinedMode.enabled) {
    const priorityMap = {
      'local_first': 'Ground analysis in local documents first. Use knowledge/web search to fill gaps.',
      'claude_first': 'Start from regulatory requirements (knowledge/web search), then assess local documents against them.',
      'merged': 'Treat all sources equally. Cross-reference local documents with regulatory requirements.',
    };
    result.systemPromptAdditions += `\n\n## COMBINED SOURCE MODE\n${priorityMap[config.modes.combinedMode.priority]}`;
    if (config.modes.combinedMode.instructions) {
      result.systemPromptAdditions += `\nAdditional: ${config.modes.combinedMode.instructions}`;
    }
  }

  return result;
}
```

### Folder Indexer and Browser

```typescript
// server/services/folder-indexer.ts
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.csv', '.html'];

async function indexFolder(folderPath: string, options: { recursive: boolean; filter?: string[] }): Promise<IndexedFile[]> {
  const files: IndexedFile[] = [];
  const extensions = options.filter || SUPPORTED_EXTENSIONS;
  
  async function scanDir(dirPath: string) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && options.recursive) await scanDir(fullPath);
      else if (entry.isFile() && extensions.includes(path.extname(entry.name).toLowerCase())) {
        const stat = await fs.stat(fullPath);
        files.push({ name: entry.name, path: fullPath, extension: path.extname(entry.name), sizeBytes: stat.size, lastModified: stat.mtime });
      }
    }
  }
  await scanDir(folderPath);
  return files;
}

// API routes for folder management
// POST /api/folders/browse — list directory contents
// POST /api/folders/register — save a folder for reuse across sessions
// GET  /api/folders/registered — list saved folders
// POST /api/folders/index — full text extraction from folder
```

---

## ═══════════════════════════════════════════════════════════════
## CORE SYSTEM 2: OUTPUT FORMAT SELECTOR
## ═══════════════════════════════════════════════════════════════

This is the **value multiplier**. One analysis → multiple deliverable types. Users select output format(s) BEFORE running, and Claude structures its response accordingly. Each format injects specific instructions into the system prompt.

### Output Format Definitions

```typescript
type OutputCategory = 'strategic' | 'analytical' | 'operational' | 'scoring' | 'communication' | 'planning';

interface OutputFormat {
  id: string;
  label: string;
  icon: string;           // Lucide icon name
  description: string;     // Tooltip
  category: OutputCategory;
  promptInstruction: string;
  exportFormats: ('md' | 'docx' | 'xlsx' | 'pdf')[];
  estimatedLength: string;
  audience: string;
}
```

### All Output Formats

**STRATEGIC** (Board/Management deliverables):
| ID | Label | Description | Best Export | Audience |
|---|---|---|---|---|
| `executive-summary` | Executive Summary | 1-2 page board-ready summary: key findings, risks, recommended decisions | docx, pdf | Board, C-suite |
| `decision-memo` | Decision Memo | Options analysis with pros/cons, risk assessment, clear recommendation | docx, pdf | Decision-makers |
| `risk-appetite-statement` | Risk Appetite Statement | Formal ML/TF risk appetite with tolerance levels and boundaries | docx, pdf | Board, Risk Committee |

**ANALYTICAL** (Detailed analysis):
| ID | Label | Description | Best Export | Audience |
|---|---|---|---|---|
| `detailed-findings` | Detailed Findings Report | Comprehensive findings with evidence, citations, severity, interconnections | docx, pdf | Compliance, Auditors |
| `regulatory-comparison` | Regulatory Comparison | Side-by-side current vs. new requirements with delta analysis | docx, xlsx | Compliance, Legal |
| `impact-assessment` | Impact Assessment | Operational, technical, people, financial, timeline impact dimensions | docx, pdf | Project sponsors, COO |

**OPERATIONAL** (Action-oriented):
| ID | Label | Description | Best Export | Audience |
|---|---|---|---|---|
| `project-plan` | Implementation Project Plan | Phased roadmap with workstreams, milestones, dependencies, resources | docx, xlsx | Project managers |
| `action-plan` | Action Plan | Prioritized actions with owners, deadlines, dependencies, effort | xlsx, docx | Action owners |
| `mitigation-plan` | Mitigation / Remediation Plan | Per-finding: remediation steps, effort, timeline, verification criteria | xlsx, docx | Remediation owners |
| `policy-document` | Policy / Procedure Document | Formal governance document with version control, roles, escalation | docx, pdf | All staff |
| `raci-matrix` | RACI Matrix | Responsibility assignment: Responsible, Accountable, Consulted, Informed | xlsx, docx | Governance |

**SCORING & ASSESSMENT**:
| ID | Label | Description | Best Export | Audience |
|---|---|---|---|---|
| `gap-scoring-matrix` | Gap Scoring Matrix | RAG-rated scoring per requirement: ID, article, current state, score, priority | xlsx | Project team |
| `maturity-assessment` | Maturity Assessment | 5-level maturity scoring across 10 AML dimensions with evidence | xlsx, docx | Board, Compliance |
| `data-readiness-scorecard` | Data Readiness Scorecard | Per data point: readiness (🟢🟡🔴), source system, owner, effort | xlsx | Data teams, IT |

**COMMUNICATION**:
| ID | Label | Description | Best Export | Audience |
|---|---|---|---|---|
| `quick-briefing` | Quick Briefing | 1-page: What happened → So what → Now what | md, pdf | Busy stakeholders |
| `problem-solution` | Problem → Solution | Per issue: problem, root cause, solution, who, when, verification | md, docx | Action owners |
| `stakeholder-presentation` | Presentation Outline | Slide-by-slide outline with speaker notes and key messages | md, docx | Presenters |
| `training-material` | Training Material | Learning content with objectives, cases, red flags, knowledge checks | docx, pdf | Training participants |
| `client-proposal` | Engagement Proposal | Client proposal: understanding, approach, scope, timeline, differentiators | docx, pdf | Sales, Clients |

**PLANNING**:
| ID | Label | Description | Best Export | Audience |
|---|---|---|---|---|
| `compliance-calendar` | Compliance Calendar | Chronological deadlines, milestones, consultation periods, implementation dates | xlsx, md | Project team |
| `monitoring-plan` | Compliance Monitoring Plan | Annual programme: activities, frequencies, methods, escalation triggers | xlsx, docx | 2nd line |
| `budget-resource-estimate` | Budget & Resource Estimate | FTE needs, technology costs, external support, training investment | xlsx, docx | CFO, Sponsors |

Each format has a detailed `promptInstruction` that tells Claude exactly how to structure that deliverable (section headers, what to include, quality standards, format conventions). See the `output-format-definitions.ts` file for full prompt instructions per format.

### UI: Multi-Click Chip Selector

Users click chips to select one or multiple output formats. Selected chips glow teal. Formats group by category with visual headers.

```
┌────────────────────────────────────────────────────────────────┐
│ 📋 What should Claude produce?                            ⓘ   │
│ Click to select. Multiple formats = multiple deliverables.     │
│                                                                │
│ ── Strategic ──────────────────────────────────────────────    │
│ [■ Executive Summary] [ Decision Memo ] [ Risk Appetite ]      │
│                                                                │
│ ── Analysis ───────────────────────────────────────────────    │
│ [ Detailed Findings ] [■ Regulatory Comparison]                │
│ [ Impact Assessment ]                                          │
│                                                                │
│ ── Operational ────────────────────────────────────────────    │
│ [■ Action Plan ] [ Mitigation Plan ] [ Project Plan ]          │
│ [ Policy Document ] [ RACI Matrix ]                            │
│                                                                │
│ ── Scoring ────────────────────────────────────────────────    │
│ [■ Gap Scoring Matrix ] [ Maturity Assessment ]                │
│ [ Data Readiness ]                                             │
│                                                                │
│ ── Communication ──────────────────────────────────────────    │
│ [ Quick Briefing ] [ Problem→Solution ] [ Presentation ]       │
│ [ Training Material ] [ Engagement Proposal ]                  │
│                                                                │
│ ── Planning ───────────────────────────────────────────────    │
│ [ Calendar ] [ Monitoring Plan ] [ Budget Estimate ]           │
│                                                                │
│ ─────────────────────────────────────────────────────────────  │
│ Selected: Executive Summary + Action Plan + Gap Scoring Matrix │
│ Estimated: 8-27 pages │ Recommended: Investigate 🔍            │
│ Best export: .docx .xlsx                                       │
└────────────────────────────────────────────────────────────────┘
```

### Multi-Format Prompt Assembly

When multiple formats are selected, the prompt builder concatenates instructions with clear section markers so Claude produces each as a distinct deliverable in one response:

```typescript
function buildOutputInstruction(selectedIds: string[]): string {
  if (selectedIds.length === 0) return '';
  const formats = selectedIds.map(id => OUTPUT_FORMATS.find(f => f.id === id)!);
  if (formats.length === 1) return formats[0].promptInstruction;
  
  return `## MULTIPLE DELIVERABLES REQUESTED
Produce ${formats.length} distinct deliverables. Each must stand alone.
Use clear "# DELIVERABLE N: TITLE" headers between them.

${formats.map((f, i) => `### DELIVERABLE ${i + 1}: ${f.label.toUpperCase()}\n${f.promptInstruction}`).join('\n\n---\n\n')}`;
}
```

---

## ═══════════════════════════════════════════════════════════════
## CORE SYSTEM 3: CLAUDE API INTEGRATION
## ═══════════════════════════════════════════════════════════════

### Default Model: Claude Opus 4.6

**ALL modules default to `claude-opus-4-6`.** Most capable model. Compliance work demands maximum quality — the cost of a wrong answer exceeds the API cost.

```typescript
type ModelId = 'claude-opus-4-6' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001';

type ThinkingLevel = 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first';
type CreativityLevel = 'strict' | 'balanced' | 'creative';
```

### Thinking → API Mapping

```typescript
function getThinkingConfig(level: ThinkingLevel, model: ModelId) {
  if (model === 'claude-opus-4-6') {
    // Adaptive thinking + effort parameter (recommended for Opus 4.6)
    return {
      thinking: { type: 'adaptive' as const },
      effort: { quick: 'low', think: 'medium', think_hard: 'high', investigate: 'max', plan_first: 'max' }[level],
    };
  }
  // Sonnet/Haiku: manual thinking with budget_tokens
  const budget = { quick: null, think: 4096, think_hard: 16384, investigate: 32768, plan_first: 32768 }[level];
  return budget === null
    ? { thinking: { type: 'disabled' as const } }
    : { thinking: { type: 'enabled' as const, budget_tokens: budget } };
}
```

### Creativity → Prompt Injection (not temperature)

Temperature is incompatible with extended thinking. Creativity is controlled via system prompt:
- **Strict:** "Precise, factual, cite everything, formal regulatory language, flag uncertainty"
- **Balanced:** "Accurate, accessible, use examples, professional but readable"
- **Creative:** "Engaging, storytelling, real-world examples, factual accuracy maintained"

### Plan First Mode

Adds instruction: "Before output, create an explicit plan (sections, order, depth, assumptions, gaps). Present plan first, then execute systematically."

### Web Search Integration

When enabled, add to API request:
```typescript
tools: [{ type: 'web_search_20250305', name: 'web_search' }]
```
Streaming must handle `server_tool_use`, `web_search_tool_result`, and `text` blocks.

### Full Request Assembly

```typescript
async function buildRequest(config: FullConfig) {
  const knowledge = await resolveKnowledgeSources(config.knowledgeSources);
  const outputInstr = buildOutputInstruction(config.selectedOutputFormats);
  const creativityInstr = getCreativityInstruction(config.creativity);
  const planInstr = config.thinkingLevel === 'plan_first' ? getPlanningInstruction() : '';
  const thinkingConfig = getThinkingConfig(config.thinkingLevel, config.model);
  
  return {
    model: config.model,
    max_tokens: config.model === 'claude-opus-4-6' ? 32000 : 8192,
    system: [config.modulePrompt, creativityInstr, planInstr, outputInstr, knowledge.systemPromptAdditions, knowledge.contextDocuments ? `\n\n## REFERENCE DOCUMENTS\n${knowledge.contextDocuments}` : ''].filter(Boolean).join('\n'),
    messages: [...config.history, { role: 'user', content: config.userMessage }],
    stream: true,
    ...thinkingConfig,
    ...(knowledge.tools.length > 0 ? { tools: knowledge.tools } : {}),
  };
}
```

---

## MODULES — SPECIFICATIONS

Every module has: `claude-opus-4-6` default, KnowledgeSourcePanel, OutputFormatSelector, ThinkingControls, CreativitySlider, PromptEditor, FileUploader, FolderBrowser, ConversationThread, ExportBar.

### MODULE 1: AMLR Gap Analysis
**Thinking:** `investigate` | **Creativity:** `strict`  
**Pre-selected outputs:** `gap-scoring-matrix` + `executive-summary` + `action-plan`  
**Knowledge:** Claude ON + web search ON + local folders (client docs + regulation texts)  
**Guided inputs:** Entity type, Jurisdiction, Customer segments, AMLR focus areas, Known concerns

### MODULE 2: Document Creation
**Thinking:** `think_hard` | **Creativity:** `balanced`  
**Pre-selected outputs:** `policy-document`  
**Knowledge:** Claude ON + local folders (existing docs to update/reference)  
**Sub-types:** AML Policy, BWRA, KYC Procedures, TM Policy, STR Procedures, Sanctions Policy, Training Programme, Board Report, Governance Framework, Risk Appetite Statement

### MODULE 3: Sanctions Advisory
**Thinking:** `think_hard` | **Creativity:** `strict`  
**Pre-selected outputs:** varies by sub-task  
**Knowledge:** Claude ON + web search ON (sanctions change daily)  
**Sub-tasks:** Regime Briefing, EBA Guidelines Implementation, Screening Assessment, Policy Review, De-risking Analysis, Incident Response

### MODULE 4: Regulatory Monitor
**Thinking:** `think` | **Creativity:** `balanced`  
**Pre-selected outputs:** `quick-briefing` + `impact-assessment`  
**Knowledge:** Claude ON + web search ON + online reference links  
**Inputs:** Upload text, Paste URL, Describe development, Select category

### MODULE 5: Training Content Creator
**Thinking:** `think` | **Creativity:** `creative`  
**Pre-selected outputs:** `training-material`  
**Audiences:** Board, Compliance, Front-line, Relationship managers, Operations/IT

### MODULE 6: AMLA Data Management
**Thinking:** `investigate` | **Creativity:** `strict`  
**Pre-selected outputs:** `data-readiness-scorecard` + `action-plan`  
**Knowledge:** Claude ON + local folders (AMLA templates + client data dictionaries)

### MODULE 7: Risk Assessment Support
**Thinking:** `think_hard` | **Creativity:** `balanced`  
**Pre-selected outputs:** `maturity-assessment` + `detailed-findings`

### MODULE 8: Investigation & Case Support
**Thinking:** `think_hard` | **Creativity:** `strict`  
**Pre-selected outputs:** `problem-solution`  
**Safeguard:** Does NOT make compliance decisions. Structures analysis only.

Each module has a carefully crafted system prompt in `server/prompts/[module].md`. See the individual prompt files for full content.

---

## MODULE WORKSPACE LAYOUT

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Sidebar │                    Module Header                              │
│         │                                                               │
│ Modules │ ┌───────────────────────┐  ┌───────────────────────────────┐  │
│         │ │  CONFIGURATION PANEL  │  │       OUTPUT PANEL            │  │
│ • Gap   │ │                       │  │                               │  │
│ • Docs  │ │ ThinkingControls      │  │  [Thinking indicator...]      │  │
│ • Sanct │ │ CreativitySlider      │  │                               │  │
│ • Reg   │ │ ModelSelector         │  │  # Executive Summary          │  │
│ • Train │ │                       │  │  Analysis of 12 documents...  │  │
│ • Data  │ │ ─────────────────     │  │                               │  │
│ • Risk  │ │ Knowledge Sources     │  │  [streaming Markdown output]  │  │
│ • Invest│ │ [4-mode panel]        │  │                               │  │
│         │ │                       │  │ ─────────────────────────     │  │
│ ─────── │ │ ─────────────────     │  │ Session Summary               │  │
│ Recent  │ │ Output Formats        │  │ Tokens: 45k | Cost: ~$2.10   │  │
│ Sessions│ │ [chip selector]       │  │ ─────────────────────────     │  │
│         │ │                       │  │ Continue:                     │  │
│         │ │ ─────────────────     │  │ ┌─────────────────────────┐   │  │
│         │ │ Files & Folders       │  │ │ Type follow-up...       │   │  │
│         │ │ [upload + browse]     │  │ └─────────────────────────┘   │  │
│         │ │                       │  │ [Expand] [Simplify] [Focus]  │  │
│         │ │ Module Inputs         │  │ [More detail] [Translate]    │  │
│         │ │ [guided fields]       │  │                               │  │
│         │ │                       │  │ Export:                       │  │
│         │ │ System Prompt ▸       │  │ [📄 .md] [📝 .docx]          │  │
│         │ │ [collapsible editor]  │  │ [📊 .xlsx] [📕 .pdf]         │  │
│         │ │                       │  │                               │  │
│         │ │ [▶ Run Analysis]      │  │                               │  │
│         │ └───────────────────────┘  └───────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## EXPORT SYSTEM

| Format | Library | Features |
|---|---|---|
| **.md** | Native | Default. Source of truth. Copy/download. |
| **.docx** | `docx` npm | ANTON header/footer, heading hierarchy, tables, page numbers, ToC |
| **.xlsx** | `exceljs` | Conditional formatting (🟢🟡🟠🔴), auto-filters, freeze panes, formulas, charts |
| **.pdf** | `puppeteer` | ANTON branding, professional typography, page numbers, ToC |

---

## SESSION MANAGEMENT

Sessions persist in SQLite. Each stores: module, config (model, thinking, creativity, output formats, knowledge sources, system prompt), documents, messages, summary, exports. Sessions can be resumed, forked, and exported.

---

## ENVIRONMENT

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

---

## BUILD & RUN (LOCAL)

```bash
git clone <repo> && cd fcp-workbench
pnpm install
cp .env.example .env   # Add ANTHROPIC_API_KEY
pnpm run db:init
pnpm run dev            # http://localhost:5173 + API at :3001
pnpm run build && pnpm run start  # Production: http://localhost:3001
```

---

## IMPLEMENTATION ORDER

### Phase 1: Foundation (Day 1-2)
Project scaffolding, ANTON theme, Express + Claude API proxy, layout shell, dashboard

### Phase 2: Core Engine (Day 2-4)
Claude client (adaptive thinking, effort, streaming, web search), ThinkingControls, CreativitySlider, ModelSelector, PromptEditor, ConversationThread, OutputPanel with Markdown

### Phase 3: Knowledge Source System (Day 4-6)
FileUploader, FolderBrowser, folder indexer, KnowledgeSourcePanel (all 4 modes), URL fetching, web search integration, token counting, context warnings

### Phase 4: Output Format System (Day 6-8)
All format definitions, OutputFormatSelector UI, prompt assembly, DOCX export, XLSX export (with conditional formatting), PDF export

### Phase 5: Modules (Day 8-12)
All 8 modules with guided inputs, pre-built prompts, default configs

### Phase 6: Polish (Day 12-14)
Sessions, dashboard, auto-summary, settings, cost display, tooltips, error handling, keyboard nav

---

## IMPLEMENTATION NOTES

1. **Opus 4.6 always default.** Adaptive thinking + effort. No budget_tokens for Opus.
2. **Always stream.** Show text as it arrives. Handle web search blocks in stream.
3. **Knowledge Source System is the killer feature.** Folder browser must feel native. Show file counts, word counts, token estimates.
4. **Output Format chips must be delightful.** Teal glow on selected. Show combined estimates. Auto-recommend thinking level.
5. **Multi-format output + export = value multiplier.** One analysis → board PDF + team Excel + PM action plan.
6. **Token management critical.** Count before sending. Warn at 80% capacity. Smart truncation.
7. **System prompts are the product.** Save edits separately. Always offer reset.
8. **Cost display before running.** Opus: ~$15/M input, ~$75/M output.
9. **Folder registration persists.** Saved in SQLite. Available across sessions.
10. **Security.** API key server-side only. Path traversal protection on folder access.
11. **Accessibility.** 14px+ fonts, keyboard nav, ARIA labels. Users are 35-65.

---

## FUTURE MODULES

Regulatory Comparison, Compliance Calendar, Interview Prep, Peer Review, Client Proposal Generator, Regulatory Response Drafter, Compliance Monitoring Design, Model Validation, Whistleblower Framework, Outsourcing Risk Assessment

---

> "Start with the problem, not the solution. No magic bullets. No silver boxes.
> Just the right tools, the right people, and the right plan." — Futurechain FCP
