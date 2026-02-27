# openEXPERT by ANTON — Codebase State Extraction for Alignment Session

## What This Is

I am preparing for an alignment session where I will compare the current codebase against the whitepaper vision and produce an implementation plan. I need you (Claude Code) to give me a complete, honest picture of what exists today, what works, what is partial, and what is missing. This will be combined with the whitepaper and taken to a planning chat.

## Please Produce the Following

### 1. Full Directory Tree

Run `find . -type f` (excluding node_modules, .git, dist, build) and give me the complete file structure. I need to see every file that exists — components, services, configs, prompts, assets, everything.

### 2. Component & Feature Inventory

For each of the following features, tell me honestly:
- ✅ **Built & Working** — with the file path(s) and a one-line description of what it does
- 🔨 **Partially Built** — what exists and what is missing
- 🔲 **Not Started** — no code exists
- 🐛 **Broken/Known Issues** — exists but has problems

Features to assess:

**Core Engine:**
- [ ] Claude API integration (proxy, model selection, thinking/creativity controls)
- [ ] Session management (create, persist, resume, SQLite storage)
- [ ] Chat interface (message display, streaming, markdown rendering)

**Knowledge Source System (4 modes):**
- [ ] Mode 1: Claude's own knowledge (no additional context)
- [ ] Mode 2: Online regulation links (fetch and inject URLs)
- [ ] Mode 3: Local folders (read and inject local files)
- [ ] Mode 4: Combined (all sources together)

**Output Format System:**
- [ ] Format selector UI
- [ ] How many formats are implemented? List them.
- [ ] Do formats actually modify the system prompt / output instruction?

**Area & Module System:**
- [ ] Area Navigator (browsing, selection, colour-coding, grouping)
- [ ] Module selector within areas
- [ ] How many areas are configured? Which ones?
- [ ] How many modules are configured? List them by area.
- [ ] Module config structure — show me one complete module JSON + system prompt as example
- [ ] Dynamic module loading from config (or are modules hardcoded?)

**7-Layer Prompt Builder:**
- [ ] Layer 1: System Foundation (ANTON identity, quality standards)
- [ ] Layer 2: Area Context (domain landscape, terminology)
- [ ] Layer 3: Module Expertise (analytical framework, output structure)
- [ ] Layer 4: Persona Injection
- [ ] Layer 5: Skills Attachment
- [ ] Layer 6: Knowledge Source Integration
- [ ] Layer 7: Transparency & Reasoning
- [ ] Is there a single prompt composition service that assembles all layers? Show the code.

**Expert Personas:**
- [ ] "This Is Me" personal profile (UI + storage + prompt injection)
- [ ] "Add Expert" persona selector
- [ ] Pre-built persona definitions — how many? List them.
- [ ] Persona prompt injection — how does it work technically?

**Guided Input System:**
- [ ] Module-specific input questions
- [ ] Are inputs defined in module configs or hardcoded?
- [ ] Show me one example of guided inputs for a module

**Review Engine:**
- [ ] Multi-perspective review (quality, regulatory, technical, communication, red team)
- [ ] Review persona definitions
- [ ] Review workflow (how does a review get triggered and executed?)

**Skills Repository:**
- [ ] Skill pack structure and storage
- [ ] Skill attachment to sessions
- [ ] Pre-built skills — how many? List them.

**Project System:**
- [ ] Project CRUD (create, read, update, delete)
- [ ] Session-to-project linking
- [ ] Cross-area session grouping
- [ ] Project templates
- [ ] Project dashboard

**Dashboard & Analytics:**
- [ ] Usage metrics / session tracking
- [ ] ROI tracker
- [ ] Charts and visualisations

**Build Your Own Module:**
- [ ] Save workflow as module
- [ ] Module config generator from session

**Open Chat / Free-Form Mode:**
- [ ] Free-form chat without module selection
- [ ] Capability settings panel in free-form mode
- [ ] Prompt improvement / enhancement loop

**Workflow Builder:**
- [ ] Multi-step module chaining
- [ ] Guided execution mode (step-by-step with review)
- [ ] Automatic execution mode (pipeline)
- [ ] Workflow templates
- [ ] Visual workflow builder

**Transparency Toggle:**
- [ ] UI toggle for reasoning explanation
- [ ] Does it actually modify the prompt to request explanation?
- [ ] Three levels (off, summary, detailed)?

**Export Pipeline:**
- [ ] Markdown export
- [ ] Word (.docx) export
- [ ] Excel (.xlsx) export
- [ ] PowerPoint (.pptx) export
- [ ] PDF export
- [ ] What libraries are used for each?

### 3. Database Schema

Show me the complete SQLite schema — all tables, columns, types, relationships. Run `.schema` or equivalent and give me the full output.

### 4. System Prompt Architecture

Show me exactly how system prompts are composed today:
- Where is the base/foundation prompt defined?
- Where are area-level prompts stored?
- Where are module-level prompts stored?
- How are they combined before sending to the Claude API?
- Show me the actual code that assembles the final prompt sent to the API.

### 5. Config Structure

Show me the complete config structure for:
- One area definition (the JSON that defines an area)
- One module definition (the JSON that defines a module within an area)
- One persona definition
- One skill definition (if any exist)
- The main app configuration / environment config

### 6. API Integration

Show me:
- How the Claude API is called (the actual fetch/request code)
- What model(s) are configured
- How streaming is handled
- How thinking/extended thinking is configured
- How creativity/temperature is set
- Any rate limiting or error handling

### 7. Frontend Architecture

Describe:
- Routing structure (what routes exist, what renders at each)
- State management approach (context, zustand, redux, etc.)
- Main layout components
- How the chat interface works
- How module selection changes the UI
- Any UI component library customisation

### 8. Known Issues & Technical Debt

Be honest. What is:
- Broken or flaky?
- Hardcoded when it should be configurable?
- Missing error handling?
- Performance concerns?
- UI issues (contrast, responsiveness, accessibility)?
- Things that work in dev but would break in production?

### 9. Package Dependencies

Give me the full `package.json` (or both if there is a separate client and server) so I can see all dependencies and their versions.

### 10. What You Think the Priorities Should Be

Based on your knowledge of the codebase, if you had to pick the 5 most impactful things to build or fix next to make this platform ready for an open source release, what would they be and why?

## Output Format

Please produce this as a single markdown document called `openEXPERT_Codebase_State.md`. Use the section numbers above (1-10) as headers. Be specific — file paths, code snippets, actual counts. "The persona system is partially built" is not useful. "PersonaSelector.tsx exists at src/components/platform/PersonaSelector.tsx, renders a dropdown of 3 hardcoded personas, but does not inject persona context into the system prompt — the injection logic is missing from server/services/prompt-builder.ts" is useful.

The goal is that I can take this document into another chat alongside the whitepaper and make concrete decisions about what to build, what to rework, and what to defer.

---

*Created: February 17, 2026*
*Project: openEXPERT by ANTON*
