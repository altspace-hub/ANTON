# Contributing to openEXPERT

Thank you for your interest in contributing to openEXPERT. This document explains how to get set up, how the codebase is structured, and how to contribute code, modules, and documentation.

---

## What is openEXPERT?

openEXPERT is an open-source, locally-hosted AI expert platform. It gives professionals — compliance officers, lawyers, analysts, HR managers, and others — a guided interface for using large language models on expert-level tasks. It runs entirely on your machine: documents stay local, only Claude API calls leave the network.

The platform is built around **areas** (broad domains like FCP, Legal, Cyber) and **modules** (specific tasks within an area, like "AMLR Gap Analysis" or "Contract Summary"). Adding new modules is the most common and most impactful way to contribute.

---

## Development Setup

### Prerequisites

- Node.js 20 or later
- pnpm 9 or later (`npm install -g pnpm`)
- An Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))
- Git

### Clone and install

```bash
git clone https://github.com/advisense/openexpert.git
cd openexpert
pnpm install
```

### Configure environment

```bash
cp .env.example .env
```

Open `.env` and set `ANTHROPIC_API_KEY`. All other values have sensible defaults for local development.

### Initialise the database

```bash
pnpm run db:init
```

This creates `data/workbench.sqlite` with the schema from `server/db/schema.sql`.

### Start the development server

```bash
pnpm run dev
```

This starts:
- The React frontend at `http://localhost:5173` (Vite dev server with HMR)
- The Express API server at `http://localhost:3001`

The frontend proxies API calls to the backend automatically during development.

---

## Architecture Overview

```
openexpert/
├── src/              # React 18 + TypeScript frontend
│   ├── components/   # Shared UI components + per-module components
│   ├── pages/        # Top-level route pages (Dashboard, ModulePage, Settings)
│   ├── stores/       # Zustand state stores
│   ├── hooks/        # Custom React hooks
│   └── lib/          # API client, types, constants, output format definitions
│
├── server/           # Express API server (Node.js + TypeScript)
│   ├── routes/       # Express route handlers (claude, files, folders, sessions, export)
│   ├── services/     # Business logic (Claude client, RAG pipeline, export generators)
│   ├── areas/        # Expert area definitions (JSON + markdown per area)
│   ├── prompts/      # Module system prompts (markdown files)
│   └── db/           # SQLite schema and migration scripts
│
├── docs/             # User-facing documentation
└── .github/          # CI workflows, issue templates, PR template
```

### Key services

| Service | File | Purpose |
|---|---|---|
| Claude client | `server/services/claude-client.ts` | Wraps Anthropic SDK, handles streaming, thinking, web search |
| Knowledge source resolver | `server/services/knowledge-source.ts` | 4-mode resolver: Claude knowledge, online URLs, local folders, combined |
| RAG pipeline | `server/services/folder-indexer.ts` | BM25 indexing, token-aware chunking, folder registration |
| Prompt builder | `server/services/prompt-builder.ts` | Assembles 7-layer prompt from all sources |
| Export generators | `server/services/export-*.ts` | DOCX, XLSX, PDF, PPTX generation |
| Session store | `server/services/session-store.ts` | SQLite CRUD for sessions, messages, exports |

### Data flow (simplified)

1. User configures a module (model, thinking level, knowledge sources, output formats, guided inputs)
2. Frontend sends a request to `POST /api/claude/stream`
3. Server resolves knowledge sources (index folders, fetch URLs, add web search tool if enabled)
4. Server builds the 7-layer prompt via `prompt-builder.ts`
5. Server streams the Claude API response back as Server-Sent Events (SSE)
6. Frontend renders the streamed Markdown output in real time
7. User exports the output via `POST /api/export/:format`

---

## Adding a New Area

An **area** is a broad professional domain (e.g. FCP, Legal, Cyber, HR, Tax, ESG). Each area has:

1. `server/areas/<area-id>/area.json` — metadata
2. `server/areas/<area-id>/area-context.md` — injected into every module in this area as context
3. `server/areas/<area-id>/modules/` — one subdirectory per module

### Step 1: Create the area directory

```bash
mkdir -p server/areas/legal/modules
```

### Step 2: Write `area.json`

```json
{
  "id": "legal",
  "label": "Legal",
  "icon": "Scale",
  "description": "Contract analysis, regulatory compliance, legal risk assessment, and dispute support.",
  "color": "adv-blue",
  "defaultModel": "claude-opus-4-6",
  "defaultThinking": "think_hard",
  "defaultCreativity": "balanced"
}
```

### Step 3: Write `area-context.md`

This file is injected at the start of every module's system prompt for this area. Keep it concise (200–500 words). Describe the area's professional context, typical users, key terminology, and quality standards.

### Step 4: Register the area

Add the area ID to the `AREAS` array in `src/lib/constants.ts` and add a nav link in `src/components/layout/Sidebar.tsx`.

---

## Adding a New Module

A **module** is a specific expert task within an area (e.g. "Contract Summary" within Legal). Each module needs:

1. `server/areas/<area-id>/modules/<module-id>/module.json` — metadata and defaults
2. `server/areas/<area-id>/modules/<module-id>/system-prompt.md` — the module's system prompt

### Step 1: Create the module directory

```bash
mkdir -p server/areas/legal/modules/contract-summary
```

### Step 2: Write `module.json`

```json
{
  "id": "contract-summary",
  "areaId": "legal",
  "label": "Contract Summary",
  "icon": "FileText",
  "description": "Extract key terms, obligations, risks, and red flags from any contract.",
  "defaultThinking": "think_hard",
  "defaultCreativity": "balanced",
  "defaultOutputFormats": ["executive-summary", "detailed-findings"],
  "defaultKnowledgeSources": {
    "claudeKnowledge": { "enabled": true, "webSearchEnabled": false },
    "localFolder": { "enabled": true }
  },
  "guidedInputs": [
    { "id": "contractType", "label": "Contract type", "type": "select", "options": ["Service agreement", "NDA", "Employment", "Vendor", "Other"] },
    { "id": "focusAreas", "label": "Focus areas (optional)", "type": "text", "placeholder": "e.g. liability caps, termination clauses, IP ownership" },
    { "id": "jurisdiction", "label": "Governing law / jurisdiction", "type": "text", "placeholder": "e.g. English law, Swedish law" }
  ]
}
```

### Step 3: Write `system-prompt.md`

This is the core of the module. Write a thorough system prompt that:
- Defines the AI's role and expertise
- States the primary task clearly
- Lists what to look for, check, or produce
- Sets quality standards (cite sources, flag uncertainty, use specific legal/regulatory language)
- Describes the expected output structure

See `server/prompts/gap-analysis.md` for a reference example.

### Step 4: Add the frontend module component (optional)

If your module needs custom guided inputs beyond what `module.json` supports, create a component in `src/components/modules/`. Otherwise, the generic `ModulePage.tsx` renders guided inputs automatically from `module.json`.

### Step 5: Test your module

1. Start the dev server (`pnpm run dev`)
2. Navigate to your area and module
3. Run a test with a sample document
4. Verify the output quality and format

---

## Adding a New Page

1. Create the page component in `src/pages/MyPage.tsx`
2. Add a route in `src/App.tsx`:
   ```tsx
   <Route path="/my-page" element={<MyPage />} />
   ```
3. Add a nav link in `src/components/layout/Sidebar.tsx`

---

## Code Style

### TypeScript

- Strict TypeScript throughout. No `any` without a comment explaining why.
- Define interfaces in `src/lib/types.ts` (frontend) or inline in the relevant service file (server).
- Use `zod` for runtime validation of API inputs on the server side.

### React

- Functional components only. No class components.
- Hooks for all state and side effects.
- Keep components focused: if a component exceeds ~200 lines, split it.

### Styling

- Tailwind CSS utility classes only. No custom CSS files (except `src/index.css` for base styles).
- Dark theme always. Use the ANTON colour tokens:
  - `bg-adv-dark`, `bg-adv-card` for backgrounds
  - `text-adv-off-white`, `text-adv-gray` for text
  - `text-adv-teal`, `bg-adv-teal`, `border-adv-teal` for primary accents and interactive states
  - `text-adv-gold` for warnings, `text-adv-red` for errors, `text-adv-green` for success
- Icons: Lucide React only. Import by name: `import { FileText } from 'lucide-react'`.
- Minimum font size: 14px (`text-sm` in Tailwind). Users are 35–65.

### Server

- Express route handlers stay thin. Business logic goes in `server/services/`.
- All file system paths go through path validation to prevent traversal attacks.
- Validate and sanitise all request inputs before processing.
- Use `async/await` and handle errors with try/catch; return structured error responses.

---

## Commit Message Format

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

Types:
- `feat` — new feature or module
- `fix` — bug fix
- `docs` — documentation only
- `style` — formatting, no logic change
- `refactor` — code change with no feature or fix
- `test` — adding or updating tests
- `chore` — build process, dependencies, CI

Examples:
```
feat(modules): add Contract Summary module to Legal area
fix(export): correct page numbering in PDF export for long documents
docs(contributing): add section on adding new personas
chore(deps): update @anthropic-ai/sdk to 0.38.0
```

---

## Pull Request Process

1. Fork the repository and create a feature branch from `develop`:
   ```bash
   git checkout -b feat/my-feature develop
   ```
2. Make your changes. Keep commits small and focused.
3. Ensure TypeScript checks pass:
   ```bash
   npx tsc --noEmit
   npx tsc -p tsconfig.node.json --noEmit
   ```
4. Ensure the build passes:
   ```bash
   pnpm run build
   ```
5. Open a pull request against `develop` (not `main`). Fill in the PR template.
6. A maintainer will review your PR within a few business days. Be ready to address feedback.
7. Once approved, a maintainer will squash-merge your PR into `develop`.

`main` is the stable release branch. Releases from `develop` to `main` are made by maintainers.

---

## Reporting Issues

Use the GitHub issue templates:
- **Bug report** — for things that are broken
- **Feature request** — for new functionality or improvements
- **New module submission** — to propose or submit a new expert module

---

## Questions?

Open a GitHub Discussion or reach out to the Daniel Bardun & Futurechain. We are happy to help you get your contribution merged.
