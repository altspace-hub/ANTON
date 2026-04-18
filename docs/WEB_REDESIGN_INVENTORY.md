# Web Redesign — Run Configuration inventory

**Source of truth.** Captured from Daniel's 5 screenshots of the current
Sanctions Advisory left config column (April 2026). Every section below
**must land** in the new `RunConfigPanel` (Phase 2 of the web redesign)
or be explicitly demoted with a note.

This is the Sanctions example — modules with different `guidedInputs`
schemas will substitute the **Module Settings** rows but everything
else applies universally.

## 1. Module Header
- Title (e.g. "Sanctions Advisory")
- Subtitle (one-line description)

## 2. Depth — "How deeply should Claude analyze?"
- 6 segmented buttons: **Quick · Think · Think Hard · Investigate · Plan First · Deep**
- Each can carry a Beta/IRE badge (Deep currently shows IRE)
- Active = accent fill + accent border
- Maps to `defaults.thinking` in module config

## 3. Model
- Dropdown: Claude Haiku 4.5 / Sonnet / Opus / GPT / Mistral / etc.
- Reflects active provider; tier-resolved via provider-router

## 4. Precision — "Controls temperature across providers"
- 5 buttons: **Strict · Precise · Balanced · Creative · Exploratory**
- Maps to `defaults.creativity`

## 5. Writing Style
- 3 buttons: **Strict · Balanced · Creative**
- Description below ("Precise, factual, formal regulatory language")

## 6. Persona (collapsible card)
- Counter pill (e.g. "1/3")
- Reasoning options sub-section (collapsible)
- Persona library (13 available)

## 7. Multi-Agent Mode (toggle card)
- Info icon + on/off toggle
- When on, exposes consul roles + agent mix config

## 8. Deliberation Mode (toggle card)
- Stack icon + on/off toggle
- When on, exposes multi-model deliberation config

## 9. Output Controls (card)
- **Writing Tone** — 4 buttons: Formal · Professional · Casual · Conversational
- **Emoji in output** — toggle (default Off)

## 10. Reasoning (card)
- **Structured Reasoning** — toggle (label "Standard")
- **Approach Transparency** — 3 buttons: Off · Summary · Detailed (with eye icons)

## 11. Knowledge Memory (card)
- **Use prior insights** — toggle ("Recent findings injected as context")
- **Collect insights** — toggle ("Responses contribute to knowledge base")
- Footer line: "Token impact: ~Standard"

## 12. Knowledge Atoms Used (collapsible card)
- Lists atoms injected into the current context

## 13. Skills (with suggested-skill banner)
- "Suggested skills for this module — Apply?" banner with **Apply** button + dismiss
- Skills card — collapsible, lists active skills per persona

## 14. Knowledge Sources (THIS IS THE BIG ONE — 7 modes)
- **Claude's Own Knowledge** — checkbox + sub-options:
  - Enable web search (sub-checkbox)
  - Focus area (optional text input)
- **Online Regulation / Document Links** — checkbox + URL input
- **Local Folders** — checkbox + folder path
- **Combined: Search + Local Documents** — checkbox
- **Indexed Knowledge Base (Folders)** — checkbox + "Mode 5a" badge
- **Knowledge Collections (RAG)** — checkbox + "Mode 5b" badge
- **Regulatory Knowledge Packs** — accent-tinted active card with "Mode 6" badge
  - "3 packs active — curated regulatory entities injected into every prompt"
  - Status banner: "3 regulatory packs active — 197 entities and 392 relationships available to Claude"

## 15. What should Claude produce? (Output Format Selector)
- **Plain Text Mode** toggle at top
- 6 categories with format buttons (40+ total):
  - **STRATEGIC**: Executive Summary · Decision Memo · Risk Appetite Statement · Board Pack · Investment Memo · Islamic Compliance Opinion · Transfer Pricing Memo · Policy Brief
  - **ANALYSIS**: Detailed Findings Report · Regulatory Comparison · Impact Assessment · Audit Report · Pentest Report · Clinical Trial Summary · Privacy Impact Assessment (DPIA) · Legal Memo · Legal Brief (IRAC)
  - **OPERATIONAL**: Implementation Project Plan · Action Plan · Mitigation/Remediation Plan · Policy/Procedure Document · Scope Tracker · RACI Matrix · Campaign Brief · Product Requirements Doc (PRD)
  - **SCORING**: Gap Scoring Matrix · Maturity Assessment · Data Readiness Scorecard
  - **COMMUNICATION**: Quick Briefing · Problem→Solution · Presentation Outline · Training Material · Engagement Proposal · Proposal/RFP Response · Management Presentation · Plain Language Guide · FAQ Document · Press Release/News Article · Field Guide/Reference Card · Step-by-Step Guide · Screenplay/Script
  - **PLANNING**: Compliance Calendar · Compliance Monitoring Plan · Budget & Resource Estimate
- Footer: "N format selected · Best export: .docx .pdf"

## 16. Communications (collapsible card)
- Sharing / collaboration setup

## 17. Structure reference (optional, collapsible)

## 18. Reference output (optional, collapsible)
- "Match this golden example" — paste reference output

## 19. Upload Documents
- Drag & drop zone
- Allowed: PDF · DOCX · TXT · XLSX · HTML · images (PNG, JPG, GIF, WebP) · max 50 MB

## 20. Module Settings (DynamicModule slot — JSON-driven per-module)
For Sanctions specifically:
- **Task Type *** — required dropdown (Select…)
- **Sanctions Regimes** — "Which sanctions regimes are in scope?" — 7 buttons: EU · US/OFAC · UN · UK/OFSI · Russia (2022+) · Iran · DPRK
- **Situation / Context** — textarea ("Describe the specific situation, customer, transaction, or concern…")

For other modules: render their `module.guidedInputs` schema instead.

## 21. Advanced Settings (collapsible)
- Anything power-user-only goes here

## 22. Follow-up message + Send (the run trigger)
- Textarea ("Ask a follow-up question or request changes…")
- Token meter — progress bar with "8.0k / 200.0k"
- "Prompt 1.4k · History 6.6k · Message 0"
- **Send** button + "~7 993 tokens · ~€0.02"
- AI disclaimer footer: "AI-generated output — not legal or compliance advice. Verify independently."

## 23. Domain banners (conditional)
- Risk Atlas migration banner (legacy FCP modules overlapping with 7-stage methodology)
- Healthcare / medical disclaimer (LEGAL-03)
- First-run gap analysis walkthrough (ATTR-05 — for new users)

## 24. Cost / token telemetry
- Pre-run cost estimate (TOKEN-04) — when context is non-trivial
- Smart Model Banner — "you typed X but Y is cheaper"
- Live context budget breakdown

---

# Mapping to the new layout

The new design's `WSanctionsFullRun` collapsible config panel covers
**~65 %** of the above. The redesign needs to be extended to absorb the
remaining 35 % without dropping anything.

**Extended layout (proposed for `RunConfigPanel`):**

1. Row 1 (4-col): Depth · Model · Precision · Writing Style
2. Row 2 (4-col): Persona toggles · Output Controls · Knowledge Memory · Module Settings
3. **Row 3 (NEW, 2-col): Knowledge Sources (full 7-mode picker) · Output Formats (40+ multi-select grid with category tabs)**
4. **Row 4 (NEW, 2-col): Skills (with suggested banner) · Knowledge Atoms Used**
5. Row 5 (2-col): Situation/Context · Upload Documents
6. Footer: Advanced Settings link (collapses Communications, Structure ref, Reference output, Risk Atlas / Healthcare / first-run banners)

The bottom chat composer carries the Send button + token meter +
AI disclaimer (matches the design's composer pattern).

# Modules NOT getting this layout (port later)

- Markets / Radar / Pathfinder — already have purpose-built screens
- Knowledge Library / Connections / Engagements — list/CRUD UIs
- Risk Atlas — has its own 5-tab workspace
