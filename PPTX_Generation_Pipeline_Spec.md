# openEXPERT / ANTON — PowerPoint Generation Pipeline: Specification & Implementation Guide

> **Audience:** Claude Code  
> **Purpose:** This document specifies how ANTON modules generate PowerPoint (.pptx) files as output deliverables. The approach follows the same pattern already established for Word (.docx) and Excel (.xlsx) generation: the AI model generates the code, ANTON executes it through the script sandbox, and the user gets a finished file. The difference is that PowerPoint generation requires specific technical knowledge (pptxgenjs API, slide design principles, QA workflow) to be injected into the prompt alongside the module's domain expertise.  
> **First step for Claude Code:** Read this document, then read the existing script execution framework (`connection-manager.ts`, script adapters), the existing document generation patterns for Word and Excel, and the pptxgenjs reference material in `/mnt/skills/public/pptx/`. Understand how the seven-layer prompt builder works before implementing anything here.

---

## 1. The Problem and the Pattern

### What already works

ANTON already generates professional documents as module outputs:
- **Word (.docx)** — The AI generates JavaScript code using the `docx` (docx-js) library. That code is executed in the script sandbox. The result is a formatted .docx file delivered to the user.
- **Excel (.xlsx)** — The AI generates Python code using `openpyxl`. Executed in the sandbox. Formatted .xlsx file delivered.

The pattern is consistent: **module expertise shapes what to write → document generation knowledge shapes how to write it → script execution produces the file → QA validates the output.**

### What PowerPoint needs

PowerPoint follows the same pattern but with its own technical stack:
- **Library:** `pptxgenjs` (Node.js) — already available globally (`npm install -g pptxgenjs`)
- **Supporting libraries:** `react-icons`, `react`, `react-dom`, `sharp` — for icon rendering
- **Execution:** Node.js script in the existing script sandbox
- **QA:** Convert to PDF → images → visual inspection (requires LibreOffice + Poppler, both available)

The challenge specific to PowerPoint is that good slide generation requires significantly more design knowledge than Word or Excel generation. A Word document with correct headings and tables looks professional. A PowerPoint with bad layout, wrong spacing, text overflow, or default styling looks terrible. The AI model needs both the pptxgenjs API reference and the design principles injected into the prompt to produce good results.

---

## 2. How It Works: The Generation Pipeline

### Step 1: Module Determines Content

The user is working in any ANTON module — an AMLR Gap Analysis module, a Strategy module, a Risk Assessment module, whatever. They select PowerPoint as their output format (or the module's default output includes a PowerPoint deliverable).

At this point, the module's seven-layer prompt has already determined **what** the content should be: the findings, the recommendations, the data, the structure. The module knows the domain. It knows the audience. It knows what story the presentation needs to tell.

### Step 2: PowerPoint Generation Knowledge Is Injected

When the output format is PowerPoint, ANTON injects additional context into the prompt assembly — specifically, the pptxgenjs technical reference and the slide design principles. This happens at the prompt builder level, not at the module level.

**What gets injected:**

1. **pptxgenjs API reference** — The complete technical reference for creating slides: text, shapes, images, charts, tables, backgrounds, slide masters, icons. This is the content of `/mnt/skills/public/pptx/pptxgenjs.md` (or a condensed version optimised for prompt inclusion — see Section 5).

2. **Design principles** — The slide design guidance from `/mnt/skills/public/pptx/SKILL.md`: colour palette selection, typography, layout options, spacing rules, common mistakes to avoid. This ensures the AI does not produce generic, ugly slides.

3. **Output format instructions** — Specific instructions telling the AI to generate a complete, self-contained Node.js script that:
   - Imports pptxgenjs and any needed libraries
   - Creates the full presentation programmatically
   - Writes the output to a specified file path
   - Is executable with `node script.js` without any additional setup
   - Includes all content, styling, and design decisions inline (no external dependencies beyond the installed packages)

4. **Brand context** (when available) — If the user or organisation has defined brand colours, fonts, or logo, these are injected so the generated presentation follows brand guidelines. This connects to any future brand template system in ANTON.

### Step 3: AI Generates the Code

The AI model (Opus 4.6 by default, as it handles the complexity of good slide design best) generates a complete Node.js script. The script is a single file that, when run, produces the .pptx file.

**What the generated script must include:**

```javascript
// Example structure — the AI generates the full content
const pptxgen = require("pptxgenjs");
// + react-icons imports if icons are needed
// + sharp import if icon rasterisation is needed

async function createPresentation() {
  let pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.author = 'openEXPERT / ANTON';
  pres.title = 'Presentation Title';

  // Slide 1: Title slide
  let slide1 = pres.addSlide();
  slide1.background = { color: "1E4B42" }; // Brand colour or chosen palette
  slide1.addText("Title Here", { ... });
  // ... full slide content

  // Slide 2-N: Content slides
  // ... each slide fully defined with layout, styling, content

  await pres.writeFile({ fileName: "/output/path/presentation.pptx" });
}

createPresentation().catch(console.error);
```

**Critical requirements for the generated code:**
- Must be a single self-contained file (no imports from local project files)
- Must use `async/await` pattern for icon generation and file writing
- Must never use `#` prefix on hex colours (corrupts the file)
- Must never encode opacity in hex strings (corrupts the file)
- Must use `bullet: true` instead of unicode bullet characters
- Must use `breakLine: true` between text array items
- Must never reuse option objects across calls (pptxgenjs mutates them)
- Must use factory functions for repeated styles: `const makeShadow = () => ({ ... })`
- Output path must be parameterised (ANTON sets it at execution time)

### Step 4: Script Execution

ANTON executes the generated script through the existing script execution sandbox in `connection-manager.ts`:

- **Runtime:** Node.js
- **Time limit:** 60 seconds (PowerPoint generation with icons can be slower than Word/Excel)
- **Memory limit:** 512MB (icon rasterisation via sharp needs more memory)
- **Network access:** Not required (all libraries pre-installed globally)
- **Output capture:** Capture stdout/stderr for error reporting
- **Output file:** The .pptx file at the specified output path

**Pre-installed global packages required:**
- `pptxgenjs` — core PowerPoint generation
- `react-icons` — icon library
- `react` — required by react-icons
- `react-dom` — required for icon SVG rendering
- `sharp` — SVG to PNG rasterisation for icons

**Execution command:**
```bash
node /path/to/generated-script.js
```

If execution fails, ANTON captures the error, analyses it, and either auto-fixes common issues (missing semicolons, path errors) or presents the error to the user with an explanation and a fix option.

### Step 5: QA Validation

After the .pptx file is generated, ANTON runs automated QA:

**Content QA:**
```bash
python -m markitdown output.pptx
```
- Verify all expected content is present
- Check for placeholder text that should have been replaced
- Verify slide count matches expectations
- Check for typos or formatting errors in extracted text

**Visual QA:**
```bash
# Convert to PDF then to images
python scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```
- Convert each slide to an image
- Use a subagent (separate AI call) to visually inspect each slide image for:
  - Overlapping elements
  - Text overflow or cut-off
  - Low contrast text/icons
  - Alignment issues
  - Excessive empty space or cramped layout
  - Missing visual elements

**If QA finds issues:** ANTON automatically fixes the generated script and re-runs. This fix-and-verify cycle runs up to 3 times. If issues persist after 3 cycles, the presentation is delivered with a note about known visual issues and suggestions for manual fixes.

### Step 6: Delivery

The finished .pptx file is:
- Stored in the session's output directory
- Versioned using the existing versioning system
- Linked to the project (if the session is part of a project)
- Available for download
- Available for export as part of an `.anton` package

---

## 3. Integration With the Seven-Layer Prompt Builder

The PowerPoint generation knowledge needs to be injected cleanly into the existing prompt architecture. This should not require changes to how modules are defined — it should be an automatic addition when the output format is PowerPoint.

### Where it fits in the seven layers

The seven-layer prompt architecture is:
1. **System identity** — ANTON's core identity and behaviour
2. **Area context** — The expert area (FCP, Legal, Risk, etc.)
3. **Module expertise** — The specific module's knowledge and instructions
4. **Persona** — The expert persona active for this session
5. **Skills** — Attached reusable knowledge packages
6. **Thinking level** — Depth of reasoning
7. **Quality standards** — Output quality requirements

PowerPoint generation knowledge fits as a **conditional Layer 5 (Skills) injection** — it is a skill that is automatically attached when the output format requires it. This is analogous to how a "report writing" skill might be attached when the output is a Word document.

### Implementation approach

**Option A (Recommended): Create a PowerPoint Generation Skill**

Create a new skill in the skills library:
- **Skill name:** `pptx-generation`
- **Skill type:** `output-format` (a new skill type category for format-specific skills)
- **Contents:**
  - Condensed pptxgenjs API reference (see Section 5)
  - Design principles and colour palettes
  - Common pitfalls and how to avoid them
  - Output format instructions (single-file Node.js script structure)
  - QA expectations
- **Auto-attachment rule:** This skill is automatically attached to the prompt whenever the session's output format includes PowerPoint. The user does not need to manually select it.

This approach is clean because:
- It uses the existing skills infrastructure — no new injection mechanism needed
- The skill content is versioned and updatable independently of the prompt builder
- It can be customised per-user or per-organisation (e.g., adding brand templates)
- Other output format skills can follow the same pattern (there may already be implicit skills for Word and Excel generation that should be formalised)

**Option B: Prompt builder format-aware injection**

Add format-awareness to `prompt-builder.ts` so it automatically appends the relevant technical reference when assembling a prompt for a specific output format. This is more tightly coupled but might be simpler if the skill system does not easily support auto-attachment.

**Claude Code should evaluate both options against the existing codebase and choose the one that integrates more naturally.** The key requirement is that when a module's output is set to PowerPoint, the AI model receives the pptxgenjs reference and design guidance without any manual configuration by the user or module author.

### Brand context injection

If the user or organisation has defined brand settings (colours, fonts, logo), these should be injected alongside the pptxgenjs skill. This could be:
- A separate `brand-template` skill that is always attached when generating documents
- A configuration in the user/organisation settings that the prompt builder reads
- For now, the Advisense brand system (HK Grotesk, English Green #1E4B42/#2A6459) can serve as the reference implementation

Brand context should include:
- Primary, secondary, and accent colours (hex values)
- Header and body fonts
- Logo image (base64 or file path) for title slides
- Any specific layout conventions (e.g., "always include slide numbers", "use dark backgrounds for title and closing slides")

---

## 4. Module Author Considerations

Module authors should not need to understand pptxgenjs to offer PowerPoint as an output format. The module defines **what** the presentation should contain; the platform handles **how** to generate it.

### What module authors specify

When defining a module that supports PowerPoint output, the module author specifies:

- **Slide structure guidance** — A description of what slides the output should contain. For example, an AMLR Gap Analysis module might specify: "The output presentation should include: a title slide, an executive summary slide, a methodology slide, one slide per gap category showing the scoring matrix, a recommendations slide, and a next steps slide."
- **Content mapping** — How the module's output content maps to slides. For example: "The gap scores should be presented as a table on slides 4-8, with conditional colour coding (red for critical gaps, amber for significant, green for compliant)."
- **Audience context** — Who the presentation is for, which affects design tone and complexity level. "This is for a board presentation — keep text minimal, use large numbers and clear visuals."

### What the platform handles automatically

- Selecting and applying a colour palette appropriate to the content and domain
- Laying out each slide with proper spacing, typography, and visual hierarchy
- Generating the pptxgenjs code
- Executing the code and producing the file
- Running QA and fixing issues
- Delivering the file

### Backward compatibility

Existing modules that do not currently specify PowerPoint output guidance should still be able to generate presentations. When a user selects PowerPoint as the output format for a module that does not have specific slide structure guidance, ANTON should:
1. Use the module's standard output structure as the basis
2. Intelligently break the content into slides (one main topic per slide)
3. Apply default design principles
4. Generate and deliver the presentation

This "best effort" mode means every module can produce PowerPoint output, even if the result is better for modules that have explicit slide guidance.

---

## 5. Condensed pptxgenjs Reference for Prompt Injection

The full pptxgenjs reference (`/mnt/skills/public/pptx/pptxgenjs.md`) is ~420 lines. For prompt injection, a condensed version should be created that covers the essential API surface without exceeding a reasonable token budget. The condensed reference should include:

**Must include:**
- Setup and basic structure (new pptxgen, layout, addSlide, writeFile)
- Text (addText with positioning, formatting, rich text arrays, breakLine, margin)
- Shapes (addShape — RECTANGLE, OVAL, LINE, ROUNDED_RECTANGLE, fill, shadow with factory functions)
- Images (addImage from path, URL, and base64, sizing modes)
- Icons (react-icons setup, renderIconSvg, iconToBase64Png, addImage)
- Backgrounds (solid colour, image)
- Tables (addTable with header styling, merged cells, colW)
- Charts (BAR, LINE, PIE with chartColors, clean styling options)
- Slide masters (defineSlideMaster for consistent layouts)
- All critical pitfalls (no # in hex, no opacity in hex strings, bullet: true not unicode, breakLine: true, never reuse option objects, factory functions for repeated styles)

**Can omit:**
- Detailed sizing calculations (include the formula but not extended examples)
- Full chart option reference (include the "better looking" example pattern only)
- Editing workflow (not relevant — we are creating from scratch)
- Reading content (not relevant — we are generating, not parsing)

**Target:** ~250-300 lines of condensed, high-signal reference material.

The design principles section from `SKILL.md` should also be condensed and included:
- Colour palette table (the 10 palettes)
- Typography recommendations (font pairings, size hierarchy)
- Layout options (two-column, icon+text rows, grids, stat callouts)
- Spacing rules (0.5" margins, 0.3-0.5" between blocks)
- The "avoid" list (same layout, centred body text, text-only slides, low contrast, accent lines)

**Target:** ~80-100 lines of design guidance.

**Total prompt injection budget for PowerPoint skill:** ~350-400 lines, which translates to roughly 2,000-2,500 tokens. This is comparable to other skills in the library and should not significantly impact the available context for module content.

Claude Code should create this condensed reference as the skill's content file, test it by generating several presentations across different module types, and iterate on what to include/exclude based on output quality.

---

## 6. Script Execution Configuration

### Required global packages

Ensure these are installed globally in the ANTON environment:

```bash
npm install -g pptxgenjs react-icons react react-dom sharp
```

### Script adapter configuration

The existing script execution framework in `connection-manager.ts` handles multiple runtimes (Python, bash, R, Node.js). For PowerPoint generation, the Node.js adapter is used with these settings:

- **Runtime:** `node` (Node.js)
- **Timeout:** 60 seconds (increased from default 30 for icon rasterisation)
- **Memory:** 512MB (increased from default 256MB for sharp image processing)
- **Working directory:** Session-specific temp directory
- **Output path:** Parameterised — ANTON sets this to the session's output directory
- **Error handling:** Capture stderr, parse for common pptxgenjs errors, provide user-friendly messages

### Common execution errors and auto-fixes

| Error | Cause | Auto-fix |
|-------|-------|----------|
| `Cannot find module 'pptxgenjs'` | Package not installed globally | Run `npm install -g pptxgenjs` and retry |
| `Invalid hex color` | `#` prefix in colour string | Remove `#` from all colour values in generated code |
| `sharp: Input buffer contains unsupported image format` | Bad SVG from react-icons | Regenerate icon with explicit size parameter |
| `ENOMEM` | Icon processing exceeding memory | Reduce icon resolution from 256 to 128, retry |
| `TypeError: Cannot read property of undefined` | Reused option object mutation | Wrap in factory function, retry |

---

## 7. QA Pipeline Configuration

### Content QA

```bash
pip install "markitdown[pptx]" --break-system-packages
python -m markitdown output.pptx
```

Parse the extracted text and verify:
- All expected section titles are present
- No placeholder text remains (check for "Lorem", "XXXX", "placeholder", "TBD")
- Slide count matches the expected structure
- Key data points from the module output are present in the extracted text

### Visual QA

```bash
# Convert PPTX → PDF → JPEGs
python scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```

For each slide image, run a visual inspection subagent with the prompt template from the SKILL.md QA section. The subagent should check for:
- Overlapping elements
- Text overflow or cut-off at boundaries
- Low-contrast text or icons
- Elements too close together (< 0.3" gaps)
- Uneven spacing
- Insufficient margins (< 0.5" from edges)
- Misaligned columns or elements
- Leftover placeholder content
- Text boxes too narrow causing excessive wrapping

### QA budget

The full QA pipeline (content check + visual conversion + subagent inspection) adds approximately 15-30 seconds to the generation time and costs one additional API call for the visual inspection subagent. This is acceptable for a professional deliverable — the alternative is delivering a presentation with visual bugs that the user has to fix manually.

For sessions where speed is prioritised over quality (e.g., quick drafts), the visual QA step can be skipped. The content QA should always run.

---

## 8. Database and Storage

### No new tables required

PowerPoint generation does not need its own database tables. It uses:
- The existing `scripts` table — the generated Node.js script is stored as a script record
- The existing session output storage — the .pptx file is stored as a session output
- The existing versioning system — iterations of the presentation are versioned
- The existing `connection_audit_log` — script execution is logged

### File storage

Generated files are stored in the session's output directory:
```
~/outputs/[session-id]/
├── presentation.pptx          — The final .pptx file
├── presentation-generator.js  — The generated Node.js script (for reference/re-execution)
├── qa/
│   ├── content-check.txt      — Content QA results
│   ├── slide-01.jpg           — Visual QA slide images
│   ├── slide-02.jpg
│   └── visual-check.txt       — Visual QA results
└── versions/
    ├── v1/                    — First generation attempt
    ├── v2/                    — After QA fix cycle 1
    └── v3/                    — After QA fix cycle 2
```

---

## 9. New API Routes

Minimal additions — PowerPoint generation is an output format, not a separate feature:

- `POST /api/outputs/generate-pptx` — Generate a PowerPoint from a session's content. Accepts: session ID, slide structure (optional), brand settings (optional). Returns: file path to generated .pptx.
- `POST /api/outputs/qa-pptx` — Run QA on a generated .pptx file. Accepts: file path. Returns: content QA results, visual QA results, list of issues found.
- `POST /api/outputs/fix-pptx` — Auto-fix issues found by QA and regenerate. Accepts: session ID, issues list. Returns: updated file path.

These routes follow the existing output generation pattern. If Word and Excel generation already have similar routes, PowerPoint should follow the same convention exactly.

---

## 10. UI Integration

### Output format selector

The existing output format selector in module sessions should include PowerPoint as an option:
- **Icon:** Presentation/slides icon
- **Label:** "PowerPoint (.pptx)"
- **Available for:** All modules (with "best effort" mode for modules without explicit slide guidance)

### Generation progress

When generating a PowerPoint, show the user a progress indicator with stages:
1. "Designing slides..." (AI generating the code)
2. "Building presentation..." (script execution)
3. "Quality checking..." (QA pipeline)
4. "Fixing issues..." (if QA found problems, with a note about what was fixed)
5. "Ready" (file available for download/preview)

### Preview

After generation, show a preview of the slides:
- Use the slide images generated during QA (`slide-01.jpg`, `slide-02.jpg`, etc.)
- Display as a horizontal carousel or grid
- Allow click-to-enlarge on individual slides
- Show a "Download .pptx" button prominently

### Regeneration

The user should be able to:
- **Regenerate with feedback** — "Make the title slide darker" or "Add more data to slide 3" — ANTON modifies the script and re-runs
- **Regenerate with different design** — "Try a different colour palette" or "Use a more minimal style" — ANTON generates a new script with different design choices
- **Edit the script directly** — For power users, expose the generated Node.js script in an editor. The user can modify it and re-run. This is an advanced feature but aligns with ANTON's transparency philosophy.

---

## 11. Consistency With Word and Excel Generation

This is important: PowerPoint generation should follow the exact same patterns as Word and Excel generation wherever possible. Specifically:

- **Same prompt injection approach** — If Word generation injects docx-js reference as a skill, PowerPoint should inject pptxgenjs reference as a skill. If Word uses a different mechanism, PowerPoint should use the same one.
- **Same script execution path** — Same sandbox, same logging, same error handling conventions.
- **Same QA approach** — If Word documents are validated after generation, PowerPoint should be too.
- **Same output storage** — Same directory structure, same versioning, same project linking.
- **Same UI patterns** — Same progress indicators, same preview approach, same regeneration options.

**Claude Code should audit the existing Word and Excel generation pipelines first** and ensure PowerPoint follows the same architecture. If the existing pipelines have inconsistencies, this is an opportunity to standardise all three under a common `document-generation` service that handles format-specific concerns through pluggable adapters.

### Proposed unified architecture

```
DocumentGenerationService
├── FormatAdapter (interface)
│   ├── DocxAdapter      — docx-js, Node.js execution
│   ├── XlsxAdapter      — openpyxl, Python execution
│   └── PptxAdapter      — pptxgenjs, Node.js execution
├── SkillInjector
│   ├── docx-generation skill
│   ├── xlsx-generation skill
│   └── pptx-generation skill
├── QAPipeline
│   ├── ContentValidator
│   └── VisualValidator (PPTX and DOCX — convert to images and inspect)
└── OutputManager
    ├── Storage
    ├── Versioning
    └── Preview generation
```

This unified architecture makes it easy to add future formats (e.g., PDF generation, Markdown with Mermaid diagrams) by implementing new adapters without changing the core pipeline.

---

## 12. Build Order

1. **Audit existing Word and Excel generation** — Understand the current patterns, identify where PowerPoint fits, note any inconsistencies to resolve
2. **Install global packages** — Ensure pptxgenjs, react-icons, react, react-dom, sharp are available
3. **Create the pptx-generation skill** — Condensed pptxgenjs reference + design principles, stored in the skills library with auto-attachment on PowerPoint output format
4. **Implement prompt injection** — When output format is PPTX, automatically attach the pptx-generation skill to the prompt assembly
5. **Implement script generation** — The AI generates a complete Node.js script; validate the script structure before execution
6. **Implement script execution** — Use existing script sandbox with Node.js adapter, increased timeout/memory limits
7. **Implement content QA** — markitdown text extraction and validation
8. **Implement visual QA** — LibreOffice PDF conversion, pdftoppm image generation, subagent visual inspection
9. **Implement auto-fix cycle** — Parse QA findings, modify script, re-execute, re-validate (max 3 cycles)
10. **Add UI components** — Output format selector, progress indicator, slide preview carousel, download button, regeneration options
11. **Test across modules** — Generate presentations from at least 5 different module types (FCP, Strategy, Risk, Legal, Data) to verify that the pipeline works regardless of domain content
12. **Consider unified document generation service** — If the patterns are consistent enough, refactor Word, Excel, and PowerPoint generation into a common service with format-specific adapters

At every step, the question is: **does this follow the same pattern as Word and Excel generation?** Consistency across output formats is more important than PowerPoint-specific optimisation.

---

*Addendum to CODING_AREA_SPEC.md and platform output generation architecture.*  
*Written for Claude Code as implementation guidance.*  
*Version 1.0 — February 2026*  
*Author: Daniel Gullstrand, FutureChain AB / openEXPERT*
