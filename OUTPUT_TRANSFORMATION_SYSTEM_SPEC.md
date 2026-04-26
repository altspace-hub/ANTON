# ANTON Output Transformation System — Phase 1 Specification

> **Audience:** Claude Code
> **Purpose:** Establish the foundational architecture that lets ANTON produce sector-specific, standards-compliant outputs (Mermaid, SVG heatmaps, PDF, SIE, ESRS XBRL, FHIR, and 50+ others) as post-hoc transformations of an already-generated canonical output — without touching the seven-layer prompt builder, the module schema, or the existing export pipeline.
> **Phase:** 1 of 3. This spec covers the platform-wide foundation only. Path A (format-native modules) and Path B (sector-aware core modules) are explicitly out of scope for this phase and are pointed to at the end.
> **First step for Claude Code:** Do not write a single line of code until you have completed Section 5 (Investigation Protocol) and produced a short written summary of what you found. The codebase already has an export system; this spec extends it rather than replacing it, and that only works if the integration points are correctly identified first.

---

## 1. Context: What this is and where it fits

ANTON today produces content in Markdown (canonical), then renders that Markdown into five export formats: DOCX, XLSX, PDF, PPTX, and raw MD. The export services live in `server/services/export-{docx,xlsx,pdf,pptx}.ts` and are exposed via `/api/export/*` routes. Every module across the 29 expert areas produces a Markdown output, and the user picks a format at the end.

This works. But it has a structural ceiling: every new output format today requires touching module code, because the generator has no structured representation of what it produced — only prose. A Mermaid process diagram can't be reliably produced from Markdown alone. A risk heatmap SVG needs scored entities. A Solvency II QRT needs named numeric fields. An ESRS XBRL submission needs the materiality topics to be tagged objects, not paragraph headings. The gap between "ANTON wrote a good analysis" and "ANTON can emit that analysis in 30 different sector-specific formats" is the gap between prose and structured data.

This spec closes that gap with three primitives:

1. **Canonical structured output** — every module, from this point forward, emits a small JSON payload alongside its Markdown, representing the content in a structured form. The Markdown stays exactly as it is today for human consumption. The JSON is the machine-readable twin.
2. **Renderer registry** — a single service that knows about every available output format. Each entry declares what structured content it consumes, what sector it applies to, and how it produces its output file. Adding a new format is a registry entry, not a platform change.
3. **Transform panel** — the UI surface where users see available transforms on a completed output. It reads the registry, filters against the current structured payload and active sector hint, and offers the right buttons. Extends the pattern already established by the Review Engine and Explain-to features.

After Phase 1 lands, every subsequent format — from a simple Mermaid flowchart to a fully compliant ESRS XBRL submission — becomes a drop-in renderer entry. Phase 2 will add sector hints to cross-sector modules. Phase 3 will build format-native modules (SIE File Generator, FHIR Bundle Composer, etc.). Each subsequent phase is additive and doesn't break Phase 1.

**What this phase does NOT change:**

- The seven-layer prompt builder (`prompt-builder.ts`) — untouched.
- The module schema (`module.json` files) — untouched, except that new OPTIONAL fields are added.
- The existing five export services (`export-docx.ts`, etc.) — untouched, but wrapped behind the new registry so they become the first registered renderers.
- The user's default workflow — a user who ignores the new transform panel gets exactly the experience they have today.

Backward compatibility is non-negotiable. Every existing module, every saved output, every workflow must continue to function identically after Phase 1.

---

## 2. The design principle: content-shaping vs packaging

Understanding this distinction is essential before reading the rest of the spec. It determines why Phase 1 is scoped the way it is.

**Content-shaping formats** have strict schemas that force the generator to think about specific data points. If ANTON writes a risk analysis freely and then tries to "convert" it to a Solvency II QRT after the fact, it will hallucinate values for fields that were never elicited. The format must shape what gets generated. Examples: ESRS XBRL, FHIR bundles, ACORD XML, SIE files, eCTD submissions, PRIIPs KID documents.

**Packaging formats** take existing content and repackage it. The content doesn't care; only the wrapper changes. A Mermaid flowchart can be drawn from any process narrative. A PDF can be rendered from any Markdown. A risk heatmap SVG can be drawn from any scored risk register. Examples: Mermaid, SVG charts, PDF, DOCX redline, executive one-pager rewrites, plain-language adaptations.

**Phase 1 ships packaging formats only.** Content-shaping formats are unlocked in Phase 2 (when the sector hint is available at generation time) and Phase 3 (when dedicated format-native modules exist). The split is principled, not arbitrary: trying to retrofit content-shaping onto existing modules without a sector hint at generation time produces unreliable output and damages user trust.

**Roughly 80% of the value lives in packaging.** 50+ of the formats discussed in the broader brainstorm (visualizations, PDF exports, audience adaptations, summaries, redlines, Gantt charts, heatmaps) are packaging transforms. Phase 1 unlocks all of them at once by building the foundation.

---

## 3. The three-layer model

The output surface of ANTON is restructured as three layers, stacked on top of the existing platform:

**Layer 1: Core generation (unchanged).** The module does its job exactly as today — seven-layer prompt assembles, LLM produces Markdown, session saves. The only change is that the module's output now also contains a structured JSON payload (see Section 6). This payload is generated by a second, constrained LLM call or by parsing the Markdown depending on the module (see Section 6.5 for the migration approach).

**Layer 2: Sector signal (deferred to Phase 2).** A lightweight sector hint that either is implicit in the module's area or gets set via a dropdown at the top of cross-sector modules. Phase 1 reads this if present but does not yet collect it from the user — existing modules run without a sector hint and the transform panel shows only sector-agnostic transforms.

**Layer 3: Transform panel (new in Phase 1).** After generation completes, a panel appears alongside the existing export buttons. It reads the renderer registry, filters entries by "what the structured payload contains" and "what sector (if any) is active", and surfaces the applicable transforms grouped by intent. Each button runs a renderer, produces a file or inline artifact, stores it as a versioned output alongside the original, and offers download/preview.

The user experience is: core output looks exactly the same as today, plus a new panel below showing transforms. Users who never click into the panel see no change. Users who do see a rapidly growing set of ways to package their work.

---

## 4. The three output paths (reference map for future phases)

For orientation, the full architecture supports three paths. Phase 1 builds Path C only.

**Path A — Format-native module (Phase 3).** A module whose purpose is producing a specific regulatory artifact: "SIE File Generator", "ESRS Report Composer", "FHIR Patient Bundle". Input is raw data + context; output is the standards-compliant artifact directly. These are new modules in their respective areas. Phase 3 scope.

**Path B — Sector-aware core module (Phase 2).** Existing cross-sector modules (Risk Assessment, Policy Builder, Process Map, Training Material) extended to accept a sector hint that shapes their prompt. The hint unlocks sector-specific transforms in the transform panel because the structured payload now contains sector-specific fields. Phase 2 scope.

**Path C — Pure transformation (Phase 1, this spec).** Transforms that apply to any output regardless of sector: Mermaid diagrams, Gantt charts, risk heatmaps, SVG visualizations, executive one-pagers, plain-language rewrites, PDF export, DOCX redlines, board-deck condensations. Entirely post-hoc. Work on the canonical structured payload. No upfront signal needed.

This spec delivers Path C and the infrastructure (canonical payload + registry + panel) that Paths A and B will later plug into.

---

## 5. Investigation Protocol (required first step)

Before writing any code, read the following files in full and produce a short written summary (internal, not committed) of what exists, how it connects, and where the extension points are. Do not skip this — the integration risk is entirely in getting the existing pieces right.

### 5.1 Files to read

**Export pipeline (existing, must extend without breaking):**
1. `server/services/export-docx.ts` — full read
2. `server/services/export-xlsx.ts` — full read
3. `server/services/export-pdf.ts` — full read
4. `server/services/export-pptx.ts` — full read
5. `server/services/export-md.ts` if it exists; otherwise locate where MD is handled
6. `server/routes/export.ts` (or wherever `/api/export/*` lives) — full read
7. `package.json` — confirm versions of `docx`, `exceljs`, `pdfkit`, `pptxgenjs`

**Module and output model (to understand the payload contract):**
8. `server/services/prompt-builder.ts` — full read, do not modify
9. The folder `server/areas/` — read the directory structure; open the `module.json` and `system-prompt.md` for three modules, at minimum: one FCP (e.g. AMLR Gap Analysis), one Risk (e.g. Risk Register), one PM (e.g. Project Status Report)
10. The session/output storage — find where a completed module run is persisted. Likely in `server/db/` or a service like `session-manager.ts`. Note the table schema and all columns.
11. `src/pages/ModulePage.tsx` or equivalent — how is the output currently rendered? Where are the export buttons placed? This is where the transform panel will attach.

**Existing post-hoc features (the pattern to mirror):**
12. The Review Engine — find the service and UI. The transform panel mirrors its structural approach (post-hoc, applies to existing output).
13. The Explain-to / audience-adaptation feature if it exists — same pattern.
14. The Output Versioning tables (`output_versions`, `version_diffs`) — transforms produce new versions; understand how the existing versioning works before adding to it.

**Renderer registry peers (prior art to align with):**
15. The Skills Library — how are reusable prompt fragments registered and surfaced? The renderer registry should feel structurally similar.
16. The `.anton` bundle type definitions (17 types in Whitepaper §3.8) — note that "Brand Template" already exists; renderers will eventually be packaged as a new bundle type.

### 5.2 Questions to answer before coding

Write one-paragraph answers to each, in your summary:

1. Where exactly is the module output saved today? Is it stored as a single Markdown blob, or is there already some structured field I've missed?
2. How are export buttons rendered in the UI today? Are they hard-coded per module, or driven by config?
3. Does the Review Engine already have a "produces a new version of the output" flow? If so, transforms should follow the same pattern.
4. What is the current behavior if a user runs an export twice? Is there deduplication, overwriting, or versioning?
5. Are there any modules that already emit structured data (e.g. JSON sidecar) today? If so, note them — they are the easiest migration candidates.
6. How does the frontend receive and render the output? Streaming SSE, one-shot JSON response, or both?
7. What is the file storage convention for generated exports? Paths, naming, cleanup, retention?
8. Is there an existing concept of "output metadata" separate from the output content? If so, the structured payload may live there.

Deliver the investigation summary as a brief internal note before starting Section 6 implementation.

---

## 6. The Canonical Structured Output Schema

### 6.1 The contract

From Phase 1 onward, every module run produces **both**:

- `output_markdown` — the existing Markdown prose, unchanged.
- `output_structured` — a new JSON payload representing the content in machine-readable form.

Both are persisted on the session record. Both are versioned by the existing versioning system. The Markdown remains the human-facing default view. The structured payload is the input to every renderer.

### 6.2 Structure

`output_structured` is a JSON object with a fixed outer envelope and a content body whose shape varies by the module's output type. The envelope is identical across all modules:

```json
{
  "schema_version": "1.0",
  "module_id": "fcp.amlr-gap-analysis",
  "area_id": "fcp",
  "content_type": "gap_analysis",
  "sector": null,
  "generated_at": "2026-04-17T08:15:00Z",
  "model": "claude-opus-4-6",
  "body": { ... }
}
```

`content_type` is an enumerated string drawn from a controlled vocabulary (see Section 6.3). `sector` is null in Phase 1 (populated in Phase 2). `body` holds the content-type-specific payload.

### 6.3 Content-type vocabulary (Phase 1 set)

Phase 1 defines eight initial content types. Each existing module is mapped to one of these. New content types can be added in future phases.

| Content type | What it represents | Example modules |
|---|---|---|
| `gap_analysis` | Requirements × current-state matrix with scores | AMLR Gap Analysis, GDPR Gap Analysis |
| `risk_register` | Enumerated risks with scoring dimensions | Enterprise Risk Register, Product Risk Assessment |
| `process_map` | Ordered steps, actors, decisions, artefacts | AML Process Map, Onboarding Flow |
| `policy_document` | Sectioned policy text with clauses and obligations | Sanctions Policy, DPA |
| `analytic_report` | Narrative analysis with findings and recommendations | Market Analysis, Regulatory Briefing |
| `plan_document` | Timeline with milestones, owners, dependencies | Implementation Plan, Audit Plan |
| `entity_register` | List of entities with attributes | Third-Party Register, Systems Inventory |
| `scorecard` | KPI list with targets and current values | ESG Scorecard, Vendor Scorecard |

Each content type has a JSON Schema definition (Section 6.4). Modules declare their `content_type` in `module.json`. If a module produces something outside this vocabulary in Phase 1, it falls back to `analytic_report` (the most permissive schema) and only generic transforms apply.

### 6.4 Content-type schemas

Ship eight JSON Schemas in `server/schemas/content-types/`. Keep them minimal — the goal is "what does a renderer need to work", not "everything the module knows." Here is the `gap_analysis` schema as the canonical example:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "anton:content-type:gap_analysis:1.0",
  "title": "Gap Analysis",
  "type": "object",
  "required": ["title", "items"],
  "properties": {
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "scoring_scheme": {
      "type": "object",
      "properties": {
        "dimensions": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["compliance"]
        },
        "scale": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "value": { "type": "string" },
              "label": { "type": "string" },
              "color": { "type": "string" }
            }
          }
        }
      }
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "requirement", "score"],
        "properties": {
          "id": { "type": "string" },
          "requirement": { "type": "string" },
          "reference": { "type": "string", "description": "Regulation article or source" },
          "current_state": { "type": "string" },
          "gap_description": { "type": "string" },
          "score": { "type": "string" },
          "priority": { "type": "string", "enum": ["low", "medium", "high", "critical"] },
          "owner": { "type": "string" },
          "effort": { "type": "string", "enum": ["S", "M", "L", "XL"] }
        }
      }
    },
    "summary_statistics": {
      "type": "object",
      "properties": {
        "total_items": { "type": "integer" },
        "by_score": { "type": "object", "additionalProperties": { "type": "integer" } },
        "by_priority": { "type": "object", "additionalProperties": { "type": "integer" } }
      }
    }
  }
}
```

The other seven schemas follow the same pattern: a small required core, optional enrichment fields, no sector-specific extensions (those come in Phase 2 via the `sector` envelope field and `"oneOf"` body branches). Define them all before shipping — renderers depend on predictability.

### 6.5 How modules produce the structured payload

Two approaches are available. Pick per module based on complexity.

**Approach 1: Dual-output LLM call (preferred for new modules).** Change the module's system prompt to instruct the LLM to end its response with a fenced `json` block labelled `anton:structured` containing the payload. The response parser extracts the block, validates it against the content-type schema, stores it as `output_structured`, and strips it from `output_markdown`. This is the cleanest approach but requires a prompt change per module.

**Approach 2: Post-hoc extraction (for retrofitting existing modules without touching prompts).** After generation, run a small second LLM call (Haiku 4.5, low cost) with the Markdown output and the content-type schema, asking it to extract the structured payload. Cache aggressively — for a given Markdown output, the extraction is deterministic. This lets Phase 1 ship without rewriting 238 module prompts.

The migration plan is: implement Approach 2 as the platform default so every existing module immediately gets a structured payload; over time, migrate high-value modules to Approach 1 as prompts are revised anyway. Both approaches converge on the same schema — the rest of the system doesn't know or care which was used.

Validation is mandatory. If extraction fails or validation fails, the session still completes successfully (user sees their Markdown) but the transform panel shows "structured extraction unavailable for this output" and only the fully generic transforms (PDF, DOCX, plain-language rewrite) are available. Do not block the user on extraction failures.

### 6.6 Database changes for the payload

Two additions only:

- Add column `output_structured JSON` to the existing `sessions` table (or wherever output is persisted). Nullable; existing rows remain null.
- Add column `content_type TEXT` to the same table. Nullable; populated alongside `output_structured`.

Do not create a separate table. The structured payload belongs with the session record.

---

## 7. The Renderer Registry

### 7.1 Data model

Renderers are declared as records in a new table `renderers` and loaded at startup. Each record:

```typescript
interface RendererDefinition {
  id: string;                       // "mermaid-flowchart", "svg-risk-heatmap"
  label: string;                    // "Process flow diagram"
  description: string;              // One-line user-facing description
  category: "visualize"
         | "adapt_audience"
         | "package"                // PDF, DOCX redline, etc.
         | "regulatory"             // Phase 2+: ESRS, SIE, FHIR, etc.
         | "review";                // Second-opinion passes
  trigger: "post_hoc" | "upfront" | "both";
  applies_when: {
    content_types?: string[];       // ["process_map", "gap_analysis"] — empty = any
    sectors?: string[];             // ["esg"] — empty = any; Phase 2+
    requires_fields?: string[];     // JSON-path expressions on the payload body
  };
  output: {
    file_type: string;              // "svg", "pdf", "html", "docx", "xml"
    mime_type: string;
    filename_template: string;      // "{module_id}-flowchart-{timestamp}.svg"
  };
  renderer_module: string;          // Path to the TS file implementing RenderFn
  preview_module?: string;          // Optional separate preview generator
  phase: 1 | 2 | 3;                 // Which phase introduces this renderer
  status: "stable" | "beta" | "experimental";
}

type RenderFn = (
  payload: StructuredOutput,
  context: RenderContext
) => Promise<RenderResult>;

interface RenderResult {
  file_path: string;                // Path in /outputs
  preview_path?: string;            // Thumbnail/first-page PNG
  validation?: {
    validated_against?: string;     // Schema URI
    valid: boolean;
    errors?: string[];
  };
  metadata: Record<string, unknown>;
}
```

### 7.2 Filtering logic

When a session output page loads, the frontend requests applicable renderers:

```
GET /api/renderers/applicable?session_id={id}
```

The service:
1. Loads the session's `content_type`, `sector` (nullable), and `output_structured`.
2. Selects registry entries where `trigger` includes `post_hoc`.
3. Filters by `applies_when.content_types` (empty = matches).
4. Filters by `applies_when.sectors` (empty = matches; non-null required if specified).
5. For each remaining entry, evaluates `applies_when.requires_fields` against the payload (all paths must resolve non-null).
6. Returns grouped-by-category list.

Renderers whose requirements aren't met are excluded silently, not shown greyed-out. Showing disabled buttons is noise; the filter is the feature.

### 7.3 Execution

```
POST /api/renderers/run
{
  "session_id": "...",
  "renderer_id": "mermaid-flowchart",
  "options": { ... }              // Renderer-specific, optional
}
```

The service:
1. Loads the session and its structured payload.
2. Looks up the renderer in the registry.
3. Re-validates the payload against the content-type schema (paranoia: reject if invalid).
4. Calls the renderer function with `(payload, { session, options, brand_template? })`.
5. Stores the result as a new artifact in the outputs directory.
6. Creates a new entry in `output_versions` linking the artifact to the session.
7. Logs the execution in the audit log (who ran it, when, which renderer, outcome).
8. Returns the artifact reference and preview path.

Renderers that use LLM calls (e.g. audience adaptation) go through the same `unified-llm-client.ts` the rest of the platform uses. Renderers that are pure deterministic transforms (Mermaid, SVG charts) don't call any LLM.

### 7.4 Brand template hook

The existing brand template infrastructure (currently applied at export time by `export-docx.ts` etc.) becomes available to every renderer. `RenderContext.brand_template` carries the user's active brand — colours, fonts, logos, headers, footers. Renderers that produce visual output (SVG, PDF, HTML) must apply it. Renderers that produce data-only output (XML, JSON) ignore it.

### 7.5 The registered built-ins

The five existing export services get wrapped as the first registry entries, preserving their current behavior exactly:

- `export-md` — markdown passthrough
- `export-docx` — existing Advisense-branded DOCX
- `export-xlsx` — existing XLSX with conditional formatting
- `export-pdf` — existing branded PDF
- `export-pptx` — existing PPTX with speaker notes

These become `category: "package"`, `trigger: "post_hoc"`, `applies_when: {}` (any content type), `phase: 1`, `status: "stable"`. Their internal implementations don't change — they are invoked through the registry interface instead of directly through the export routes. The existing `/api/export/*` routes remain functional (delegating to the registry) for backward compatibility with any caller already using them.

---

## 8. The Transform Panel (UI)

### 8.1 Placement

On the module output page (the page that today shows the generated Markdown and export buttons), add a new panel beneath the current content. The existing export buttons remain where they are — do not move or rename them. Users who use the existing flow see zero change. The new panel is additive.

### 8.2 Layout

```
┌─ Your output is ready ────────────────────────┐
│  [View Markdown]  [Export ▾]                  │  ← unchanged
│                                                │
│  ─────────────────────────────────────────    │
│  Transform                                     │  ← new panel
│                                                │
│  📊 Visualize                                  │
│    [ Process flow (Mermaid) ]                  │
│    [ Timeline (Gantt) ]                        │
│    [ Risk heatmap (SVG) ]                      │
│                                                │
│  👥 Adapt for audience                         │
│    [ Executive one-pager ]                     │
│    [ Board deck (3 slides) ]                   │
│    [ Plain language ]                          │
│                                                │
│  📦 Package                                    │
│    [ Redlined DOCX against baseline... ]       │
│    [ Standalone HTML report ]                  │
│                                                │
│  🔄 Review                                     │
│    [ Devil's advocate ]                        │
│    [ Regulator's-eye view ]                    │
└────────────────────────────────────────────────┘
```

Categories render as collapsible sections, collapsed by default except the first non-empty one. Buttons render the renderer's `label`; hovering shows its `description`. Clicking invokes the execute endpoint and shows a spinner; on completion, the result appears inline with a preview thumbnail and download/open actions. The artifact is added to the session's version history.

### 8.3 Empty states

If the structured payload is missing (extraction failed) or the content type matched nothing beyond the built-in exports, the panel renders the header and a single muted line: "Generic exports available above." No empty categories, no phantom buttons.

### 8.4 Regulatory placeholders (Phase 2 preview)

Renderers with `trigger: "upfront"` and `phase: 2` or `3` are not shown in the transform panel. They only appear once the corresponding phase ships. Do not add "coming soon" entries — it creates noise.

---

## 9. Sector hint system (stub for Phase 2)

Phase 1 does not ask the user to set a sector, but does prepare the ground:

- Add `sector TEXT` column to the sessions table. Nullable. Not populated in Phase 1.
- In `output_structured`, the `sector` envelope field is always `null` in Phase 1.
- The renderer registry already filters by sector; Phase 1 renderers don't specify sectors, so they match any session.

When Phase 2 adds the sector dropdown, the data model is already in place. No schema migration needed at that point.

---

## 10. Phase 1 built-in renderer catalogue

The renderers Claude Code should build in Phase 1, in priority order. Each one is a single file in `server/services/renderers/` implementing the `RenderFn` signature.

### Priority 1 — deliver first (highest ratio of value to effort)

**`mermaid-flowchart`** — produces a Mermaid diagram for `process_map` content. Uses `@mermaid-js/mermaid-cli` to render to SVG. Applies to `content_types: ["process_map"]`. Output: SVG + PNG fallback.

**`mermaid-gantt`** — produces a Gantt chart for `plan_document` content. Same renderer lineage; different Mermaid syntax (`gantt` block). Applies to `content_types: ["plan_document"]`.

**`svg-risk-heatmap`** — renders a 5×5 (or NxN) heatmap SVG from `risk_register` content. Deterministic: use a small D3-based server-side renderer or hand-rolled SVG builder. No LLM call. Applies to `content_types: ["risk_register"]` with `requires_fields: ["items[*].likelihood", "items[*].impact"]`.

**`executive-one-pager`** — LLM-based audience adaptation. Takes any content type, produces a single-page summary in Markdown optimised for a C-suite reader. Runs through `unified-llm-client.ts` with a dedicated system prompt; outputs Markdown that then flows through `export-pdf` for the final file. Applies to any content type.

**`plain-language`** — LLM-based simplification, CEFR B1 level. Same structural pattern as one-pager. Output: Markdown.

### Priority 2 — deliver next

**`board-deck`** — 3–5 slide PPTX generated via `pptxgenjs` using the existing brand template. Consumes `analytic_report`, `gap_analysis`, `scorecard`. Slide 1: headline. Slide 2: key findings. Slide 3: recommendations. Slides 4–5: optional supporting detail.

**`standalone-html`** — self-contained single-file HTML with inlined CSS/JS. Consumes any content type. Useful for interactive preview and sharing without platform access.

**`mermaid-sequence`** — sequence diagram for process maps that have actor-message structure. Applies conditionally when the payload contains actor fields.

**`mermaid-mindmap`** — for `analytic_report` content with hierarchical sections.

**`devils-advocate-review`** — LLM pass that produces a structured critique. Output: Markdown. Reuses the existing "Devil's Advocate" skill. Creates a new session version, not a new session.

**`regulators-eye-review`** — LLM pass with a compliance-officer persona. Structurally identical to devils-advocate-review; different system prompt.

### Priority 3 — deliver if time permits in Phase 1

**`svg-gantt`** — standalone SVG Gantt (cleaner than Mermaid for print). Deterministic. Consumes `plan_document`.

**`svg-sankey`** — flow attribution for analytic reports with flow structure.

**`standalone-pdf-portfolio`** — multiple artifacts bundled into a single PDF. Aggregator over existing exports.

**`docx-redline`** — produces a DOCX with tracked changes against an uploaded baseline. Requires a second file upload; uses the `docx` library's revision support.

Do not attempt XBRL, SIE, FHIR, ACORD, eCTD, Solvency II QRT, ESRS, PEPPOL, or any other content-shaping format in Phase 1. Those are Phase 2/3 scope and depend on sector hints being available at generation time.

---

## 11. Database additions (complete list for Phase 1)

Only four changes, all additive, all backward-compatible:

```sql
-- Sessions table
ALTER TABLE sessions ADD COLUMN output_structured JSON;
ALTER TABLE sessions ADD COLUMN content_type TEXT;
ALTER TABLE sessions ADD COLUMN sector TEXT;           -- reserved for Phase 2

-- New table: renderer registry
CREATE TABLE renderers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  trigger TEXT NOT NULL,
  applies_when JSON NOT NULL,
  output JSON NOT NULL,
  renderer_module TEXT NOT NULL,
  preview_module TEXT,
  phase INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'stable',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- New table: rendered artifacts (per session, per renderer run)
CREATE TABLE rendered_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  renderer_id TEXT NOT NULL REFERENCES renderers(id),
  file_path TEXT NOT NULL,
  preview_path TEXT,
  file_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  validation JSON,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_rendered_artifacts_session ON rendered_artifacts(session_id);
CREATE INDEX idx_rendered_artifacts_renderer ON rendered_artifacts(renderer_id);
```

The existing `output_versions` table is extended via linkage, not schema change — a rendered artifact is *also* an output version (creates a row there too, referencing the artifact).

Verify against the existing schema before running these migrations. If any of these columns or tables already exist under different names, extend them rather than duplicating.

---

## 12. Implementation order

Build in this order. Each step is independently testable and deployable.

1. **Schemas.** Write the eight content-type JSON Schemas in `server/schemas/content-types/`. Include at least two fully worked examples per schema (in `server/schemas/examples/`). No code depending on these yet.

2. **Structured payload extraction service.** Implement `server/services/structured-extractor.ts` using Approach 2 (post-hoc LLM extraction with Haiku 4.5). Takes `(markdown, content_type)` → returns validated payload or failure. Cache results keyed by a hash of the markdown.

3. **Module-to-content-type mapping.** Add `content_type` field to `module.json` files for all 238 modules. Default any unmapped module to `analytic_report`. This is a spreadsheet exercise; don't overthink per-module assignments, just get something reasonable. Owners can refine later.

4. **Session persistence changes.** Add the three new columns. Hook the extraction service into the session save path so every new session run produces a structured payload (or a null with an error note if extraction fails).

5. **Renderer registry infrastructure.** Database table, TypeScript types, registry loader (`server/services/renderer-registry.ts`), `GET /api/renderers/applicable` endpoint, `POST /api/renderers/run` endpoint.

6. **Wrap the five existing exports.** Register `export-md`, `export-docx`, `export-xlsx`, `export-pdf`, `export-pptx` as renderer entries. Route the existing `/api/export/*` endpoints through the registry. Confirm existing export tests still pass.

7. **Priority 1 renderers.** `mermaid-flowchart`, `mermaid-gantt`, `svg-risk-heatmap`, `executive-one-pager`, `plain-language`. Each is a single-file renderer in `server/services/renderers/` with its own unit test.

8. **Transform panel UI.** New React component, attached below the existing output view on the module page. Fetches applicable renderers, renders grouped buttons, invokes execution endpoint, shows results inline with preview and download actions.

9. **Priority 2 renderers.** Build after the panel is working and Priority 1 is validated.

10. **Backfill.** Run the extraction service over the most recent N sessions per user (ask Daniel for N; reasonable default 100) so users opening older sessions also see transforms available.

11. **Documentation update.** IMPLEMENTATION_CHECKLIST.md gets a new section. Whitepaper gets a short paragraph pointing to the transform panel. The five existing export formats in the whitepaper become "5 built-in renderers" rather than a separate enumeration.

Each step should produce a working platform at the end of the step. Do not accumulate unfinished intermediate states.

---

## 13. Acceptance criteria

Phase 1 is done when all of the following are true:

**Core platform:**

- [ ] Every new session run produces both `output_markdown` and `output_structured` (unless extraction fails, in which case the session still succeeds and the user sees a clear note).
- [ ] All 238 existing modules have a `content_type` assigned in `module.json`.
- [ ] The eight content-type JSON Schemas are checked into the repo and reviewed for reasonableness.
- [ ] Structured extraction works for at least 90% of module runs (measured across a sample of 50 runs per content type).
- [ ] Backward compatibility: every existing export URL (`/api/export/*`) continues to work and produces output identical to the pre-refactor behavior for at least three representative modules.

**Renderer registry:**

- [ ] Registry table seeded with the five built-in exports plus the 10 Priority 1 + Priority 2 renderers.
- [ ] `GET /api/renderers/applicable` returns correctly filtered renderer lists for test sessions across five content types.
- [ ] `POST /api/renderers/run` produces a valid artifact, creates an `output_versions` entry, logs to the audit log, and returns a preview path.
- [ ] Renderers that require specific fields (`svg-risk-heatmap`) are correctly excluded when those fields are missing from the payload.

**UI:**

- [ ] Transform panel appears below existing export buttons on every module output page.
- [ ] Panel shows only categories with at least one applicable renderer (no empty groups).
- [ ] Buttons trigger renderer execution, show a spinner, and display results inline on completion.
- [ ] Each rendered artifact is visible in the session's version history with a preview and download action.
- [ ] Brand template is applied to all visual renderers (Mermaid SVG, SVG heatmap, one-pager PDF, board deck PPTX).

**Quality gates:**

- [ ] No regression in existing module run latency (measured on three representative modules before and after Phase 1).
- [ ] Audit log captures every renderer invocation.
- [ ] Extraction failures are silent to the user beyond a muted UI note; they do not block the session.
- [ ] All new code is covered by unit tests for the renderer registry, at least one renderer per category, and the structured extractor.

**Dogfood test:**

- [ ] Run Daniel's AMLR Gap Analysis module on a fresh example. Confirm the transform panel shows Mermaid, heatmap, executive one-pager, plain-language, and board-deck buttons. Click each and confirm the artifact is useful — not perfect, but clearly valuable. If any renderer produces output that would embarrass the Advisense brand, fix it before calling Phase 1 complete.

---

## 14. Explicit non-goals for Phase 1

**Do not build these in Phase 1, even if tempted:**

1. No content-shaping formats. No ESRS XBRL, SIE, FHIR, ACORD, Solvency II QRT, eCTD, PEPPOL, Akoma Ntoso, SBOM, OSCAL, HL7. These need Phase 2's sector hints to produce trustworthy output.
2. No sector dropdown in the UI. The `sector` column exists; the UI to set it is Phase 2.
3. No format-native modules. No "SIE File Generator" or "FHIR Bundle Composer" module. Those are Phase 3.
4. No modifications to the seven-layer prompt builder. Structured output is produced by the extractor service, not by rewriting the core prompt pipeline.
5. No marketplace/community renderer submission flow. Renderers are platform-defined in Phase 1. Community-contributed renderers via `.anton` bundles are a Phase 3 topic at earliest.
6. No multi-file archive renderers beyond the simple `standalone-pdf-portfolio`. ZIP bundles, `.anton` output packs, and PDF portfolios with navigation are Phase 2+.
7. No AI-generated diagrams beyond what Mermaid syntax produces. No D3-based bespoke visualizations, no Plotly interactive charts. Those are Phase 2+.
8. No webhook/API integration for pushing artifacts to external systems (Confluence, SharePoint, etc.). Artifacts live in the outputs folder and are user-downloaded. External push is a later concern.

Avoiding these keeps Phase 1 shippable in the target timeframe and preserves Phase 2's design space.

---

## 15. Handover to Phase 2 and Phase 3

Phase 1 deliberately sets up Phases 2 and 3 without committing to their details. Here are the handover points:

**Phase 2 (sector hints + Path B):**
- The sector dropdown attaches to the existing `sector` column. No schema migration needed.
- When sector is set, the prompt builder injects a sector context layer (new addition — does not modify the existing seven layers, but adds a conditional sector-context fragment to Layer 2 Area Context).
- The structured payload's envelope already supports `"sector"`; Phase 2 starts populating it.
- Renderers with `applies_when.sectors` set start appearing in the transform panel.
- New content-type schema variants can be added per sector via `"oneOf"` branches without breaking existing renderers.

**Phase 3 (format-native modules + Path A):**
- New modules (SIE Generator, FHIR Composer, ESRS Composer, etc.) get their own `content_type` values (e.g. `sie_accounting_file`, `fhir_bundle`, `esrs_report`) and dedicated schemas.
- These modules are Path A — their output *is* the format, not a transformation of a canonical payload.
- They register their own renderers with `trigger: "upfront"` — the renderer runs as part of the module execution, not in the transform panel.
- The `.anton` bundle format is extended with a new "Output Pack" bundle type that packages renderer definitions plus brand templates for a particular industry, enabling community contribution.

Nothing in Phase 2 or Phase 3 requires changing anything shipped in Phase 1. That is the whole point of the three-primitive design.

---

## 16. Working notes for Claude Code

A few directional reminders that apply throughout this build:

- **Extend, don't duplicate.** If something already exists (brand templates, version history, audit logging, LLM client, prompt caching), use it. The renderer registry is an orchestrator, not a new infrastructure layer.
- **Favour deterministic renderers.** Mermaid diagrams, SVG heatmaps, Gantt charts, PDF exports — these should produce byte-identical output for the same input. Deterministic renderers are testable, cacheable, and debuggable. Only use LLM-based renderers where creativity is actually required (audience adaptation, devil's advocate review).
- **Validate twice.** Structured payload is validated at save time (did the extraction produce schema-valid JSON?) and at render time (is the payload still valid when the renderer runs?). This catches schema evolution bugs early.
- **Log everything.** Every renderer invocation is audit-logged with session ID, renderer ID, user ID, duration, success/failure, and artifact path. The audit log is ANTON's trust fabric; don't let the transform panel bypass it.
- **Test with AMLR Gap Analysis.** It is the reference module for the whole platform. If a change makes AMLR Gap Analysis worse in any way, the change is wrong. If it makes AMLR Gap Analysis visibly better, the change is probably right.
- **Document the registry format.** The renderer registry schema is a contract that Phase 2 and Phase 3 will rely on and community contributors will eventually consume. Treat its documentation as seriously as its implementation.

---

## Appendix A: Content-type to module mapping (starter set)

A quick sanity-check mapping for Claude Code to validate against the actual module list during investigation. Most mappings will be obvious; flag any module that doesn't fit one of the eight Phase 1 content types for Daniel to review.

| Module (example) | Area | Content type |
|---|---|---|
| AMLR Gap Analysis | FCP | `gap_analysis` |
| Sanctions Policy Builder | FCP | `policy_document` |
| Transaction Monitoring Review | FCP | `analytic_report` |
| GDPR Gap Analysis | Legal | `gap_analysis` |
| Audit Plan | Audit | `plan_document` |
| Enterprise Risk Register | Risk | `risk_register` |
| Third-Party Risk Assessment | Risk | `risk_register` |
| ESG Materiality Assessment | ESG | `analytic_report` |
| CSRD Readiness Scorecard | ESG | `scorecard` |
| Threat Model | Cyber | `risk_register` |
| Project Status Report | PM | `analytic_report` |
| Implementation Roadmap | PM | `plan_document` |
| Process Map | Ops | `process_map` |
| Vendor Scorecard | Procurement | `scorecard` |
| Systems Inventory | Data | `entity_register` |

The actual list should be completed by reading all 238 `module.json` files during investigation.

---

## Appendix B: Single-file renderer example

A reference implementation structure for Claude Code to follow when building the Priority 1 renderers.

```typescript
// server/services/renderers/mermaid-flowchart.ts

import { RenderFn, RenderResult, StructuredOutput, RenderContext }
  from "../renderer-registry.types";
import { renderMermaidToSvg } from "../lib/mermaid-cli-wrapper";
import { applyBrandTemplate } from "../lib/brand-template";
import { saveArtifact } from "../lib/artifact-storage";

export const render: RenderFn = async (
  payload: StructuredOutput,
  context: RenderContext
): Promise<RenderResult> => {
  if (payload.content_type !== "process_map") {
    throw new Error(
      `mermaid-flowchart only supports process_map, got ${payload.content_type}`
    );
  }

  const mermaidSource = buildMermaidSource(payload.body);
  const svg = await renderMermaidToSvg(mermaidSource, {
    theme: context.brand_template?.mermaid_theme ?? "default"
  });
  const brandedSvg = applyBrandTemplate(svg, context.brand_template);

  const artifact = await saveArtifact({
    session_id: context.session.id,
    file_type: "svg",
    mime_type: "image/svg+xml",
    filename: `${context.session.module_id}-flowchart-${Date.now()}.svg`,
    content: brandedSvg
  });

  return {
    file_path: artifact.path,
    preview_path: artifact.path,
    validation: { valid: true },
    metadata: { mermaid_syntax: mermaidSource }
  };
};

function buildMermaidSource(body: ProcessMapBody): string {
  // Transform payload body into Mermaid flowchart syntax
  // ...
}
```

Every Phase 1 renderer follows this shape: single file, single exported `render` function, explicit content-type guard, deterministic where possible, brand-template-aware where visual.

---

*End of Phase 1 specification.*
