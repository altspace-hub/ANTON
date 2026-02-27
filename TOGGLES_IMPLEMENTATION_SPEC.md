# openEXPERT — Session Toggles Implementation Spec

**Version:** 1.0 — February 18, 2026
**Author:** Daniel Bardun & Claude (architecture session)
**Purpose:** Complete implementation specification for three new toggle features. This file is intended as a reference for Claude Code to implement these features in the openEXPERT / FCP Workbench codebase.

---

## Table of Contents

1. [Overview & Architecture Fit](#1-overview--architecture-fit)
2. [Toggle 1: Structured Reasoning Mode](#2-toggle-1-structured-reasoning-mode)
3. [Toggle 2: Writing Tone](#3-toggle-2-writing-tone)
4. [Toggle 3: Emoji Usage](#4-toggle-3-emoji-usage)
5. [Shared Architecture: SessionToggles System](#5-shared-architecture-sessiontoggles-system)
6. [Prompt Injection Layer — Where These Fit](#6-prompt-injection-layer--where-these-fit)
7. [UI Component Specification](#7-ui-component-specification)
8. [State Management & Persistence](#8-state-management--persistence)
9. [Integration with PromptComposer](#9-integration-with-promptcomposer)
10. [Testing & Validation](#10-testing--validation)

---

## 1. Overview & Architecture Fit

### What We're Building

Three user-facing toggles that modify AI behaviour at the prompt level:

| Toggle | Type | Options | Default | Prompt Layer |
|--------|------|---------|---------|-------------|
| Structured Reasoning | Multi-level toggle | Off / On | Off | Layer 7 (Transparency & Reasoning) |
| Writing Tone | Dropdown selector | Formal / Professional / Casual / Conversational | Professional |  Layer 1 (System Foundation) |
| Emoji Usage | Binary toggle | Off / On | Off | Layer 1 (System Foundation) |

### Architecture Principle

These toggles follow the same pattern as all other openEXPERT session controls:

1. **User sets the toggle** in the UI (sidebar settings panel or session config)
2. **State is stored** in the session object (SQLite persistence)
3. **PromptComposer reads the state** when assembling the 7-layer system prompt
4. **Prompt text is injected** at the appropriate layer position
5. **The Claude API call** includes the modified system prompt — no other changes needed

These toggles do NOT require any post-processing of Claude's response. They work entirely through prompt injection. This is important — it keeps the implementation clean and stateless on the response side.

### Relationship to Existing Transparency Toggle

The existing Transparency Toggle (Off / Summary / Detailed) is about **showing reasoning to the user** — it tells ANTON to explain its thought process, sources, and confidence.

The new Structured Reasoning toggle is different — it's about **how ANTON thinks internally**. It injects a meta-cognitive framework that forces decomposition, confidence scoring, and self-verification before producing the final answer.

They are complementary and can be used independently or together:

| Reasoning | Transparency | Behaviour |
|-----------|-------------|-----------|
| Off | Off | Standard response, no reasoning shown |
| Off | On | Standard thinking, but explains its process |
| On | Off | Deep structured thinking, but clean output only |
| On | On | Deep structured thinking AND shows reasoning — maximum rigour + maximum visibility |

Both should be implementable simultaneously. The Structured Reasoning prompt is injected BEFORE the Transparency prompt in Layer 7, so the transparency layer can explain the structured reasoning process if both are active.

---

## 2. Toggle 1: Structured Reasoning Mode

### Purpose

Forces ANTON to apply a disciplined meta-cognitive framework to complex problems. Based on the MIT Reasoning Prompt pattern. When active, ANTON decomposes problems, assigns explicit confidence scores, verifies its own logic, and reflects on weaknesses before finalising output.

For simple queries (quick lookups, definitions, greetings), the framework includes an escape clause so ANTON skips directly to a direct answer — avoiding unnecessary overhead.

### UI Control

- **Type:** Toggle switch (Off / On)
- **Label:** "Structured Reasoning"
- **Sublabel when Off:** "Standard processing"
- **Sublabel when On:** "Deep analysis with confidence scoring"
- **Icon suggestion:** Brain icon (FaBrain) or chess knight (FaChessKnight)
- **Tooltip:** "Activates a structured reasoning framework for complex analysis. ANTON will decompose problems, assign confidence scores (0.0–1.0), verify logic, and self-correct before responding. Automatically skipped for simple questions. Increases response quality for complex tasks but adds ~20-40% more tokens."

### Prompt Injection Text

When Structured Reasoning is **ON**, inject the following into the system prompt at Layer 7 (before the Transparency block):

```
## STRUCTURED REASONING FRAMEWORK

For every complex problem, question, or analysis in this session, adopt the role of a Meta-Cognitive reasoning expert and apply the following framework:

1. **DECOMPOSE** — Break the problem into distinct subproblems or components. List them explicitly before proceeding.

2. **SOLVE** — Address each subproblem independently. For each, state your conclusion and assign an explicit confidence score (0.0 to 1.0) reflecting how certain you are of that particular conclusion.

3. **VERIFY** — Before combining results, check each subproblem solution for:
   - Logical consistency (does the reasoning hold?)
   - Factual accuracy (are the facts correct and sourced?)
   - Completeness (have important aspects been missed?)
   - Bias (are there unexamined assumptions or one-sided framings?)

4. **COMBINE** — Synthesise the subproblem solutions into a coherent overall answer. Weight each component by its confidence score — low-confidence components should be flagged, not hidden.

5. **REFLECT** — If the overall weighted confidence is below 0.8:
   - Identify the specific weaknesses driving the low confidence
   - Attempt to address them (additional reasoning, caveats, alternative interpretations)
   - If confidence remains low after retry, state this explicitly and explain what additional information or expertise would be needed

**Escape clause:** For simple, factual questions or straightforward requests (definitions, quick lookups, yes/no answers, greetings), skip this framework entirely and respond directly. Only apply the framework when the query genuinely involves complex reasoning, multi-factor analysis, ambiguous interpretation, or high-stakes conclusions.

**Output format:** The structured reasoning process should inform and improve your answer but does not need to be shown to the user unless the Transparency toggle is also active. When Transparency is off, deliver clean output only — the reasoning happens behind the scenes.
```

When Structured Reasoning is **OFF**, inject nothing (no placeholder, no comment — clean removal).

### Token Impact Estimate

- Simple queries (escape clause triggers): +0 tokens
- Complex queries: +20-40% tokens due to internal decomposition
- Combined with Transparency ON: +40-60% tokens (reasoning is shown)

### Recommended Default by Module Type

Some modules benefit from having this ON by default. This should be configurable per module in the module config JSON:

| Module Type | Suggested Default |
|-------------|------------------|
| Gap Analysis | ON |
| Risk Assessment | ON |
| Regulatory Interpretation | ON |
| Policy Review | ON |
| Quick Reference / Lookup | OFF |
| Document Drafting | OFF |
| Brainstorming / Ideation | OFF |
| Data Point Analysis | ON |
| Implementation Planning | ON |

This is stored in the module config as `defaultReasoningMode: "on" | "off"` and the user can always override per session.

---

## 3. Toggle 2: Writing Tone

### Purpose

Controls the formality and style of ANTON's written output. Different deliverables need different tones — a board memo demands formal language, an internal Slack summary can be conversational, and a client workshop handout sits somewhere in between.

### UI Control

- **Type:** Dropdown selector (single-select)
- **Label:** "Writing Tone"
- **Options:**

| Value | Display Label | Short Description |
|-------|-------------|-------------------|
| `formal` | Formal | Precise, structured, no contractions, suitable for board papers and regulatory submissions |
| `professional` | Professional | Clear and polished but natural, appropriate for client deliverables and reports |
| `casual` | Casual | Relaxed but competent, suitable for internal memos and team communications |
| `conversational` | Conversational | Friendly and direct, suitable for chat-style interactions and brainstorming |

- **Default:** `professional`
- **Icon suggestion:** PenTool or FontAwesome FaPen
- **Tooltip:** "Sets the formality level of ANTON's responses. Formal for board papers and submissions. Professional for client deliverables. Casual for internal team use. Conversational for brainstorming and chat."

### Prompt Injection Text

Inject the following at the END of Layer 1 (System Foundation), so it applies as a base style to all subsequent layers:

**When `formal`:**
```
## WRITING STYLE: FORMAL

Adhere to a formal writing style throughout this session:
- Use precise, unambiguous language appropriate for regulatory submissions, board papers, and official documentation
- Never use contractions (write "do not" instead of "don't", "cannot" instead of "can't")
- Use passive voice where appropriate for objectivity ("It was determined that..." rather than "We found that...")
- Maintain third-person perspective unless directly addressing the reader
- Use complete sentences — no fragments, no bullet-point shorthand in prose sections
- Employ formal transitions ("Furthermore", "Consequently", "Notwithstanding") rather than casual connectors ("Also", "So", "But")
- Avoid colloquialisms, idioms, and informal expressions
- When referencing entities, use full formal names on first mention with abbreviation in parentheses, then abbreviation thereafter
- Structure output with clear hierarchical organisation (numbered sections, subsections)
```

**When `professional`:**
```
## WRITING STYLE: PROFESSIONAL

Adhere to a professional writing style throughout this session:
- Write clearly and directly, as a senior consultant would in a client deliverable
- Contractions are acceptable sparingly but avoid excessive informality
- Prefer active voice for clarity, but use passive voice when the actor is irrelevant or unknown
- Balance precision with readability — avoid unnecessarily complex sentence structures
- Use professional but accessible vocabulary — no jargon without context
- Structure content logically with clear headings and flow
- Be concise — every sentence should earn its place
```

**When `casual`:**
```
## WRITING STYLE: CASUAL

Adhere to a casual writing style throughout this session:
- Write as you would in an internal team memo or email to a trusted colleague
- Contractions are natural and expected ("it's", "don't", "we'll")
- Use active voice predominantly
- Keep sentences shorter and more direct
- Use straightforward vocabulary — no unnecessary formality
- It's fine to use phrases like "basically", "think of it as", "the key thing here is"
- Structure can be lighter — bullet points, short paragraphs, less formal headings
- Maintain accuracy and competence while being approachable
```

**When `conversational`:**
```
## WRITING STYLE: CONVERSATIONAL

Adhere to a conversational writing style throughout this session:
- Write as if speaking directly to the user in a friendly, knowledgeable discussion
- Use contractions freely
- Short sentences, natural rhythm, direct address ("you", "your")
- It's fine to use phrases like "here's the thing", "basically", "so what this means is"
- Minimal formal structure — flow naturally, use paragraphs and occasional bullets
- Analogies and examples are encouraged over technical definitions
- Match the energy of a smart colleague explaining something over coffee
- Still be accurate and substantive — conversational does not mean shallow
```

### Interaction with Other Toggles

- **Tone + Structured Reasoning ON:** The reasoning framework runs internally in the selected tone. If Transparency is also ON, the reasoning explanation follows the tone (a formal tone shows formal reasoning steps, a conversational tone explains reasoning more accessibly).
- **Tone + Export:** The tone carries through to exported documents. A formal tone with Word export produces formally styled text. The export system does NOT need to be modified — it just exports whatever ANTON produces.

### Recommended Default by Context

| Context | Suggested Default |
|---------|------------------|
| Module: Gap Analysis | Professional |
| Module: Regulatory Interpretation | Formal |
| Module: Brainstorming | Conversational |
| Module: Policy Drafting | Formal |
| Module: Implementation Planning | Professional |
| Open Chat | Conversational |
| Workflow execution | Professional |

Configurable per module via `defaultWritingTone: "formal" | "professional" | "casual" | "conversational"` in module config.

---

## 4. Toggle 3: Emoji Usage

### Purpose

Simple binary control over whether ANTON uses emojis in its output. Off by default for professional consulting output. Useful when turned on for internal communications, brainstorming sessions, or when the output will be used in casual contexts (Slack messages, internal wikis, team updates).

### UI Control

- **Type:** Toggle switch (Off / On)
- **Label:** "Emoji"
- **Sublabel when Off:** "No emojis in output"
- **Sublabel when On:** "Emojis enabled"
- **Icon suggestion:** Smiley face or FaSmile
- **Tooltip:** "When enabled, ANTON may use emojis to add visual emphasis and make output more engaging. Best for internal communications and casual use. Keep off for formal deliverables."

### Prompt Injection Text

Inject at the END of Layer 1 (System Foundation), immediately after the Writing Tone block:

**When Emoji is ON:**
```
## EMOJI USAGE

You may use emojis in your responses where they add clarity, visual structure, or engagement. Use them judiciously — as emphasis markers or section indicators, not as decoration in every sentence. Common useful patterns:
- Section markers (✅ for completed items, ⚠️ for warnings, 📌 for key points)
- Status indicators (🟢 green / 🟡 yellow / 🔴 red for RAG status)
- Visual emphasis for lists and categories
Do not overuse — one emoji per point or section heading is sufficient. Never use emojis in formal tables, regulatory text quotes, or numerical data.
```

**When Emoji is OFF:**
```
## EMOJI USAGE

Do not use any emojis in your responses. Use text-based indicators instead (e.g., "[OK]", "[WARNING]", "[NOTE]"). All output should be purely text-based and suitable for formal documents and print.
```

### Interaction with Writing Tone

| Tone | Emoji ON | Emoji OFF |
|------|----------|-----------|
| Formal | Emojis technically allowed but the prompt's "judicious" guidance means very few will appear — mainly RAG indicators in tables | No emojis (default and natural) |
| Professional | Light emoji use — mainly section markers and status indicators | No emojis |
| Casual | More natural emoji use — in line with the relaxed tone | No emojis |
| Conversational | Most natural emoji use — fits the friendly style | No emojis |

The prompt text is the same regardless of tone — ANTON self-calibrates based on the combined style context.

### Recommended Default

Always **OFF** by default. Emojis are opt-in only. No module should default to emoji ON, but the user can enable per session.

---

## 5. Shared Architecture: SessionToggles System

### TypeScript Interface

Define a single interface for all toggle state. This lives alongside the existing session config types:

```typescript
// File: src/types/sessionToggles.ts

export type WritingTone = 'formal' | 'professional' | 'casual' | 'conversational';

export interface SessionToggles {
  // Existing toggles (already in codebase — reference, don't duplicate)
  // transparencyLevel: 'off' | 'summary' | 'detailed';

  // NEW TOGGLES
  structuredReasoning: boolean;         // default: false
  writingTone: WritingTone;             // default: 'professional'
  emojiEnabled: boolean;                // default: false
}

export const DEFAULT_SESSION_TOGGLES: SessionToggles = {
  structuredReasoning: false,
  writingTone: 'professional',
  emojiEnabled: false,
};

// Module-level defaults (can override global defaults)
export interface ModuleToggleDefaults {
  defaultReasoningMode?: boolean;
  defaultWritingTone?: WritingTone;
  defaultEmojiEnabled?: boolean;
}
```

### Integration with Existing Session Object

The session object already stores configuration. Add the toggles as a nested object:

```typescript
// In the existing Session interface, add:
interface Session {
  // ... existing fields ...
  toggles: SessionToggles;
}
```

When creating a new session, initialise with `DEFAULT_SESSION_TOGGLES` merged with any module-level defaults:

```typescript
function initSessionToggles(moduleConfig?: ModuleToggleDefaults): SessionToggles {
  return {
    ...DEFAULT_SESSION_TOGGLES,
    ...(moduleConfig?.defaultReasoningMode !== undefined && {
      structuredReasoning: moduleConfig.defaultReasoningMode
    }),
    ...(moduleConfig?.defaultWritingTone && {
      writingTone: moduleConfig.defaultWritingTone
    }),
    ...(moduleConfig?.defaultEmojiEnabled !== undefined && {
      emojiEnabled: moduleConfig.defaultEmojiEnabled
    }),
  };
}
```

---

## 6. Prompt Injection Layer — Where These Fit

### 7-Layer Prompt Assembly Order

Here is where the new toggles inject into the existing 7-layer PromptComposer:

```
LAYER 1: System Foundation (ANTON identity, quality standards)
  └─ [INJECT] Writing Tone prompt (end of Layer 1)
  └─ [INJECT] Emoji Usage prompt (immediately after Tone)

LAYER 2: Area Context (domain landscape, terminology)

LAYER 3: Module Expertise (analytical framework, output structure)

LAYER 4: Persona Injection (expert perspectives)

LAYER 5: Skills Attachment (reusable knowledge packages)

LAYER 6: Knowledge Source Integration (Claude knowledge, URLs, local files)

LAYER 7: Transparency & Reasoning
  └─ [INJECT] Structured Reasoning prompt (FIRST in Layer 7)
  └─ [EXISTING] Transparency prompt (AFTER Reasoning)
```

### Why This Order Matters

- **Tone and Emoji in Layer 1:** They set the baseline communication style before any domain knowledge is added. All subsequent layers inherit the style.
- **Reasoning at start of Layer 7:** The reasoning framework governs HOW ANTON thinks, so it must come before the transparency layer which governs how reasoning is SHOWN. If both are active, the transparency layer can describe the structured reasoning process.

### PromptComposer Integration

The PromptComposer service (server-side) should have a method for each injection:

```typescript
// File: src/server/services/promptComposer.ts (or wherever it lives)

import { SessionToggles } from '../../types/sessionToggles';
import {
  TONE_PROMPTS,
  EMOJI_PROMPTS,
  STRUCTURED_REASONING_PROMPT
} from './togglePrompts';

class PromptComposer {

  // ... existing methods ...

  private composeLayer1(basePrompt: string, toggles: SessionToggles): string {
    let layer = basePrompt;

    // Append tone instruction
    layer += '\n\n' + TONE_PROMPTS[toggles.writingTone];

    // Append emoji instruction
    layer += '\n\n' + (toggles.emojiEnabled ? EMOJI_PROMPTS.on : EMOJI_PROMPTS.off);

    return layer;
  }

  private composeLayer7(
    existingTransparencyPrompt: string,
    toggles: SessionToggles
  ): string {
    let layer = '';

    // Structured Reasoning comes FIRST
    if (toggles.structuredReasoning) {
      layer += STRUCTURED_REASONING_PROMPT + '\n\n';
    }

    // Then existing transparency prompt
    layer += existingTransparencyPrompt;

    return layer;
  }

  // Main assembly method — called before every API request
  public assembleSystemPrompt(session: Session): string {
    const toggles = session.toggles;

    let prompt = '';
    prompt += this.composeLayer1(this.getFoundationPrompt(), toggles);
    prompt += '\n\n' + this.composeLayer2(session.areaId);
    prompt += '\n\n' + this.composeLayer3(session.moduleId);
    prompt += '\n\n' + this.composeLayer4(session.personas);
    prompt += '\n\n' + this.composeLayer5(session.skills);
    prompt += '\n\n' + this.composeLayer6(session.knowledgeSources);
    prompt += '\n\n' + this.composeLayer7(
      this.getTransparencyPrompt(session.transparencyLevel),
      toggles
    );

    return prompt;
  }
}
```

### Toggle Prompt Constants File

Store all prompt injection text in a single constants file for easy maintenance:

```typescript
// File: src/server/services/togglePrompts.ts

export const TONE_PROMPTS = {
  formal: `## WRITING STYLE: FORMAL
...full text from Section 3 above...`,

  professional: `## WRITING STYLE: PROFESSIONAL
...full text from Section 3 above...`,

  casual: `## WRITING STYLE: CASUAL
...full text from Section 3 above...`,

  conversational: `## WRITING STYLE: CONVERSATIONAL
...full text from Section 3 above...`,
};

export const EMOJI_PROMPTS = {
  on: `## EMOJI USAGE
...emoji ON text from Section 4 above...`,

  off: `## EMOJI USAGE
...emoji OFF text from Section 4 above...`,
};

export const STRUCTURED_REASONING_PROMPT = `## STRUCTURED REASONING FRAMEWORK
...full text from Section 2 above...`;
```

This pattern keeps all prompt text in one place. When we want to iterate on prompt wording (which we will), there's exactly one file to edit.

---

## 7. UI Component Specification

### Component: SessionTogglesPanel

A collapsible panel in the session sidebar that groups all three toggles. It should sit alongside (or within) the existing controls for thinking level, creativity, and model selection.

```
┌─────────────────────────────────────────┐
│ ⚙ Session Settings                      │
├─────────────────────────────────────────┤
│                                         │
│ Model:        [Claude Opus 4.6    ▼]    │
│ Thinking:     [Extended           ▼]    │
│ Creativity:   [───●────────────────]    │
│                                         │
│ ─── Output Controls ──────────────────  │
│                                         │
│ Writing Tone: [Professional       ▼]    │
│ Emoji:        [○ Off]                   │
│                                         │
│ ─── Reasoning ────────────────────────  │
│                                         │
│ Structured    [○ Off]                   │
│ Reasoning                               │
│                                         │
│ Transparency: [Summary            ▼]    │
│                                         │
└─────────────────────────────────────────┘
```

### Grouping Logic

- **Output Controls group:** Writing Tone + Emoji (these affect the output style)
- **Reasoning group:** Structured Reasoning + Transparency (these affect how ANTON thinks and explains)

This grouping makes conceptual sense to users — "how it looks" vs "how it thinks."

### React Component Structure

```typescript
// File: src/components/SessionTogglesPanel.tsx

interface SessionTogglesPanelProps {
  toggles: SessionToggles;
  onChange: (updated: Partial<SessionToggles>) => void;
  moduleDefaults?: ModuleToggleDefaults; // Show "Module default: X" hint
}
```

Use the existing UI component library (shadcn/ui based on the codebase):

- **Writing Tone:** `<Select>` dropdown with 4 options
- **Emoji:** `<Switch>` toggle
- **Structured Reasoning:** `<Switch>` toggle

Each toggle should show a subtle "(Module default: X)" hint if the module config specifies a non-standard default, so the user knows what the module recommends.

### Token Impact Indicator

Display a small, non-intrusive indicator showing estimated token impact of current toggle settings:

```
Token impact: ~Standard          (reasoning off, no transparency)
Token impact: ~+20%              (reasoning on)
Token impact: ~+30%              (transparency on)
Token impact: ~+50%              (reasoning + transparency on)
```

This should be a muted text line at the bottom of the settings panel, not a warning — just informational.

### Mid-Conversation Toggle Changes

Users CAN change toggles mid-conversation. When they do:

1. The UI updates immediately
2. The session state is persisted
3. The NEXT API call uses the new toggle settings
4. Previous messages are NOT re-processed (this is expected — just like changing model mid-conversation)
5. No confirmation dialog needed — these are lightweight style changes

---

## 8. State Management & Persistence

### SQLite Schema Addition

Add toggle columns to the sessions table (or a dedicated session_settings table if the schema prefers normalisation):

```sql
-- Option A: Add to existing sessions table
ALTER TABLE sessions ADD COLUMN structured_reasoning BOOLEAN DEFAULT 0;
ALTER TABLE sessions ADD COLUMN writing_tone TEXT DEFAULT 'professional';
ALTER TABLE sessions ADD COLUMN emoji_enabled BOOLEAN DEFAULT 0;

-- Option B: Separate settings table (cleaner for future toggle additions)
CREATE TABLE IF NOT EXISTS session_toggles (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id),
  structured_reasoning BOOLEAN DEFAULT 0,
  writing_tone TEXT DEFAULT 'professional' CHECK(writing_tone IN ('formal','professional','casual','conversational')),
  emoji_enabled BOOLEAN DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Recommendation:** Option B (separate table) is cleaner and easier to extend when we add more toggles in the future.

### API Endpoints

The existing session update endpoint should accept toggle changes:

```
PATCH /api/sessions/:id/toggles
Body: { structuredReasoning?: boolean, writingTone?: string, emojiEnabled?: boolean }
Response: { toggles: SessionToggles }
```

Or if the session update endpoint already accepts partial updates, just include toggles in the session PATCH payload.

### User-Level Defaults (Future)

For a later phase, add user-level default preferences so users don't have to reconfigure every session:

```sql
CREATE TABLE IF NOT EXISTS user_toggle_defaults (
  user_id TEXT PRIMARY KEY,
  structured_reasoning BOOLEAN DEFAULT 0,
  writing_tone TEXT DEFAULT 'professional',
  emoji_enabled BOOLEAN DEFAULT 0
);
```

Priority cascade: Module default → User default → Global default (with user always able to override per session).

---

## 9. Integration with PromptComposer

### Critical Implementation Notes

1. **Server-side only.** All prompt assembly happens server-side. The client sends toggle state with each request (or it's read from the session). The client NEVER constructs or sees the system prompt.

2. **No response post-processing.** These toggles work entirely through prompt injection. There is no need to parse, modify, or filter Claude's response based on toggle state. What comes back is what gets shown.

3. **Toggles are read fresh for every API call.** Don't cache the composed prompt — always read current toggle state and recompose. This ensures mid-conversation toggle changes take effect immediately.

4. **Prompt composition is idempotent.** Given the same session state, the same prompt is always produced. No side effects, no state mutation during composition.

5. **Empty layers are skipped.** If a layer has no content (e.g., no personas selected, no skills attached), don't inject blank lines or empty sections. The prompt should be clean.

### Error Handling

- If toggle state is missing or corrupt, fall back to `DEFAULT_SESSION_TOGGLES`
- If an invalid `writingTone` value is encountered, fall back to `'professional'`
- Log a warning when falling back so we can catch bugs

### Prompt Size Monitoring

The toggles add prompt text. Track the total system prompt size and warn (server-side log) if it exceeds reasonable limits:

- Tone prompt: ~100-200 tokens
- Emoji prompt: ~50-80 tokens
- Reasoning prompt: ~300-400 tokens
- **Maximum total addition from all toggles: ~700 tokens**

This is well within reasonable bounds for Claude's context window, but worth monitoring as we add more toggles over time.

---

## 10. Testing & Validation

### Manual Testing Checklist

For each toggle, verify:

- [ ] **Default state:** New session starts with correct defaults (reasoning off, professional tone, emoji off)
- [ ] **Module override:** Session created from a module with `defaultReasoningMode: true` starts with reasoning on
- [ ] **Toggle change persists:** Change a toggle, refresh the page — setting is preserved
- [ ] **Mid-conversation change:** Toggle a setting mid-conversation, send a new message — response reflects the new setting
- [ ] **Prompt injection verified:** Add a temporary log that prints the composed system prompt — verify the toggle text appears in the correct position

### Tone Validation Prompts

Use these test prompts to verify each tone setting produces noticeably different output:

**Test prompt:** "Explain the key requirements of AMLA's Article 11(6) data collection framework and what financial institutions need to prepare."

- **Formal:** Should produce: no contractions, third-person, structured with numbered sections, formal transitions
- **Professional:** Should produce: clear and direct, minimal jargon, well-structured but not stiff
- **Casual:** Should produce: contractions, shorter sentences, "here's the thing" style, still accurate
- **Conversational:** Should produce: direct address ("you'll need to..."), friendly, accessible, analogies

### Reasoning Validation

**Test prompt (complex — reasoning should activate):** "Analyse whether a Swedish neobank with 50,000 customers, no physical branches, and a heavy reliance on third-party KYC providers would be classified as high-risk under AMLR Article 74."

- **Reasoning OFF:** Direct answer, well-structured but no explicit decomposition or confidence scores
- **Reasoning ON:** Should show (or internally use) decomposition into subproblems (risk factors, entity classification, supervisory factors), confidence per factor, and a combined assessment

**Test prompt (simple — escape clause should trigger):** "What does KYC stand for?"

- **Reasoning OFF:** "Know Your Customer" — done
- **Reasoning ON:** Same — "Know Your Customer." The escape clause should prevent framework activation

### Emoji Validation

**Test prompt:** "Give me a status summary of our AMLR implementation readiness across five dimensions."

- **Emoji OFF:** Text-only status indicators ("[Complete]", "[In Progress]", "[Not Started]")
- **Emoji ON:** Emoji status indicators (✅, 🟡, 🔴) plus visual markers

---

## Appendix A: Module Config Example

Here's how a module config JSON includes toggle defaults:

```json
{
  "moduleId": "fcp-gap-analysis",
  "areaId": "financial-crime-prevention",
  "name": "Gap Analysis",
  "description": "Structured gap assessment against AMLR requirements",
  "toggleDefaults": {
    "defaultReasoningMode": true,
    "defaultWritingTone": "professional",
    "defaultEmojiEnabled": false
  },
  "recommendedThinkingLevel": "extended",
  "outputFormats": ["gap-matrix", "executive-summary", "scoring-sheet"],
  "systemPrompt": "fcp-gap-analysis.md"
}
```

## Appendix B: Quick Reference — What Goes Where

| File | What to Add |
|------|-------------|
| `src/types/sessionToggles.ts` | TypeScript interfaces and defaults |
| `src/server/services/togglePrompts.ts` | All prompt injection text constants |
| `src/server/services/promptComposer.ts` | Layer 1 and Layer 7 injection logic |
| `src/components/SessionTogglesPanel.tsx` | UI component for the three toggles |
| `src/server/db/migrations/xxx_add_toggles.sql` | SQLite schema changes |
| `src/server/routes/sessions.ts` | PATCH endpoint for toggle updates |
| Module config JSON files | Add `toggleDefaults` object where appropriate |

## Appendix C: Future Toggle Candidates

These are NOT in scope for this implementation but are noted here for future reference:

| Toggle | Description | Layer |
|--------|-------------|-------|
| Language | Output language (EN/SV/FI/DA/NO) | Layer 1 |
| Citation Style | How sources are referenced (APA, footnotes, inline) | Layer 1 |
| Output Length | Concise / Standard / Comprehensive | Layer 3 |
| Devil's Advocate | Automatically challenge own conclusions | Layer 7 |
| Audience Level | Board / Expert / Practitioner / Student | Layer 4 |
| Confidence Display | Show/hide confidence scores in output | Layer 7 |

When adding future toggles, follow the same pattern: TypeScript type → prompt text constant → PromptComposer injection → UI control → persistence.

---

## Appendix D: Marketplace & Exchange System (Future — Architecture Note)

### The Vision

Users who build great things inside ANTON — custom modules, refined skills, polished workflows, even entire area configurations — should be able to **share, export, and import** them. This creates a flywheel effect: the more people use ANTON, the more valuable ANTON becomes for everyone.

This is not just a "nice to have." It's the long-tail growth engine for the platform. openEXPERT ships with curated content from domain experts, but the real compounding value comes from thousands of practitioners contributing their own battle-tested configurations.

### CRITICAL DESIGN CONSTRAINT: Air-Gapped / File-Based Only

**ANTON never connects to an external marketplace.** There is no API call, no registry endpoint, no "check for updates" ping, no telemetry, no outbound connection of any kind related to the exchange system. This is non-negotiable for enterprise and financial institution deployment.

The exchange mechanism is **entirely file-based:**

- **Export** = ANTON produces a `.anton` file (a zip) and saves it to disk
- **Import** = the user selects a `.anton` file from disk and ANTON ingests it
- **Sharing** = happens OUTSIDE of ANTON entirely — email, Teams, Slack, shared drives, USB sticks, whatever the organisation permits

This means there is zero attack surface from the marketplace feature. No ports opened, no external dependencies, no network activity. The `.anton` file is a passive artifact — the same way a `.docx` file doesn't require Word to connect to Microsoft to open it.

If a community marketplace or web-based exchange is ever built, it exists as a **separate website/service** that has no connection to any running ANTON instance. Users browse the website, download `.anton` files, then manually import them. ANTON itself remains isolated.

**Why this matters:** Financial institutions, banks, and regulated entities will not deploy software that has undocumented external connections. Their CISO teams will audit network traffic and reject anything that phones home. By making the exchange system purely file-based from the architecture level, we eliminate this objection entirely.

### What Can Be Shared

| Asset Type | Description | Example |
|-----------|-------------|---------|
| **Skills** | Reusable knowledge packages (prompt + reference content) | "Swedish Regulatory Navigator", "IFRS 9 Impairment Framework" |
| **Modules** | Complete module configs (system prompt + guided inputs + defaults + recommended personas) | "DORA ICT Risk Assessment", "ESG Materiality Mapping" |
| **Workflows** | Multi-step orchestration templates | "End-to-End AML Gap Assessment (5-step)" |
| **Personas** | Expert persona profiles | "Nordic Banking CRO", "Fintech Compliance Lead" |
| **Area Packs** | Curated bundles of modules + skills + workflows for a domain | "Complete MiCA Implementation Toolkit" |
| **Prompt Templates** | Standalone prompt patterns for Open Chat | "Board Paper Structure", "Regulatory Response Letter" |

### Three Sharing Tiers

**Tier 1 — Team/Organisation (Private Exchange)**
- Share within your company or team workspace
- Admin-controlled: who can publish, who can install
- No approval process — trust-based within the org
- Use case: A senior consultant builds a great gap analysis module, the whole team gets it instantly

**Tier 2 — Community (Public Marketplace)**
- Share publicly with all openEXPERT users
- Light curation: quality rating, usage stats, version history
- Free contributions (open-source ethos matches the openEXPERT brand)
- Use case: A Finnish compliance expert publishes a "Finnish FIU Reporting" skill pack, anyone in the Nordics benefits

**Tier 3 — Premium (Paid Marketplace — future consideration)**
- Domain experts or firms sell premium content
- Revenue share model (creator gets X%, platform gets Y%)
- Higher quality bar — editorial review before listing
- Use case: A Big4 alumnus sells a comprehensive "AMLR Full Implementation Toolkit" with 20 modules, 15 skills, and 5 workflows
- **Note:** This tier needs careful thought around IP, licensing, and the open-source positioning of openEXPERT. May not be appropriate for v1. Flag for strategic discussion.

### Export/Import Format

Every shareable asset must be exportable as a **self-contained package** — a single file (or zip) that includes everything needed to import and run it in another ANTON instance.

**Proposed format: `.anton` package (JSON-based, zip-compressed)**

```
my-module.anton
├── manifest.json          # Metadata: name, version, author, description, type, dependencies
├── system-prompt.md       # The module's system prompt
├── config.json            # Module config (guided inputs, defaults, recommended toggles)
├── skills/                # Any bundled skills this module depends on
│   └── skill-1.json
├── personas/              # Any bundled personas
│   └── persona-1.json
├── README.md              # Human-readable description and usage notes
└── LICENSE                # Usage terms (CC-BY, MIT, proprietary, etc.)
```

**manifest.json structure:**

```json
{
  "formatVersion": "1.0",
  "type": "module",
  "id": "dora-ict-risk-assessment",
  "name": "DORA ICT Risk Assessment",
  "version": "2.1.0",
  "author": {
    "name": "Sofia Stenius-Linna",
    "org": "Advisense"
  },
  "description": "Structured ICT risk assessment aligned with DORA Chapter II requirements",
  "area": "financial-crime-prevention",
  "tags": ["DORA", "ICT", "risk-assessment", "EU-regulation"],
  "dependencies": {
    "skills": ["eu-regulatory-navigator"],
    "minPlatformVersion": "1.2.0"
  },
  "toggleDefaults": {
    "defaultReasoningMode": true,
    "defaultWritingTone": "professional",
    "defaultEmojiEnabled": false
  },
  "license": "CC-BY-4.0",
  "created": "2026-03-15T10:00:00Z",
  "updated": "2026-04-02T14:30:00Z"
}
```

### Architecture Implications for TODAY

Even though the marketplace is a future feature, these decisions affect the current implementation:

1. **Config-driven modules from day one.** Every module MUST be defined by config files (JSON + markdown prompt), never hardcoded in components. This is already the architectural intent — enforce it strictly. If a module can't be serialised to a `.anton` package, it's not built right.

2. **Stable schema for module configs.** The `config.json` structure we define now becomes the import/export contract later. Design it carefully. Include a `formatVersion` field from the start so we can migrate.

3. **Skills as standalone units.** Skills must be self-contained — no implicit dependencies on platform internals. A skill is a prompt fragment + optional reference content. If it works in one ANTON instance, it works in all of them.

4. **Dependency resolution.** The manifest declares dependencies (e.g., a module that needs a specific skill). The import system must check if dependencies exist and prompt the user to install missing ones. Think npm/package.json — same concept.

5. **Version tracking.** Every shareable asset has a semantic version. When a user imports v2.0 of a module they already have at v1.3, the system should offer to update or keep both. Build the version field into configs now.

6. **Author attribution.** Every asset carries author metadata. This is both a credit mechanism and a trust signal. Users will prefer assets from known experts or verified organisations.

7. **No platform lock-in.** The `.anton` format is deliberately JSON-based and human-readable. If someone wants to inspect or manually edit a package, they can. This aligns with the open-source philosophy and reduces the "walled garden" risk.

### Import Flow (Conceptual)

```
User clicks "Import" → selects .anton file from local disk
  → Platform validates file integrity (checksum, valid zip structure)
  → Platform validates manifest.json schema
  → Platform scans for disallowed content (see Security section below)
  → Reads manifest.json
  → Validates format version compatibility
  → Checks dependencies (missing skills? prompt to install from bundled or existing)
  → Shows preview: "This package contains: 1 module, 2 skills, 1 persona"
  → User confirms → assets installed into their local workspace
  → Module appears in the relevant area's module list
  → Success: "Installed 'DORA ICT Risk Assessment' v2.1.0 by Sofia Stenius-Linna"
  → NO network activity at any point during this flow
```

### Export Flow (Conceptual)

```
User opens a module they created → clicks "Export / Share"
  → Platform bundles: config + system prompt + dependent skills + personas
  → Generates manifest.json with metadata
  → Generates SHA-256 checksum of all contents
  → User adds description, tags, selects license
  → Package saved as .anton file to local disk (download)
  → NO network activity — file goes to disk only
  → Sharing happens outside ANTON (email, Teams, shared drive, etc.)
```

### Import Security Validation

Since `.anton` files can come from anywhere — colleagues, community forums, unknown sources — the import process MUST validate before ingesting:

```
VALIDATION PIPELINE (runs before any content is loaded):

1. ZIP STRUCTURE CHECK
   - Valid zip archive
   - No path traversal (../) in file paths
   - No symlinks
   - File count within limits (max 50 files per package)
   - Total uncompressed size within limits (max 10MB)

2. MANIFEST VALIDATION
   - manifest.json exists and is valid JSON
   - Required fields present (formatVersion, type, id, name)
   - formatVersion is supported by this ANTON version
   - Type is one of: module, skill, workflow, persona, area-pack, prompt-template

3. CONTENT VALIDATION
   - All referenced files exist in the package
   - System prompts are plain text/markdown (no embedded scripts)
   - Config JSON is valid and matches expected schema
   - No executable files (.exe, .sh, .bat, .py, .js outside of config)
   - No binary files except permitted types (images for icons: .png, .svg)

4. PROMPT INJECTION SCAN
   - Scan system prompts for known prompt injection patterns
   - Flag prompts that attempt to override ANTON's system foundation
   - Flag prompts that attempt to exfiltrate data or bypass controls
   - WARNING to user if flagged (not auto-block — user decides)

5. DEPENDENCY CHECK
   - Verify declared dependencies exist locally or are bundled
   - No circular dependencies
   - Version compatibility check
```

If any check in steps 1-3 fails → **hard reject** with clear error message.
If step 4 flags concerns → **warning with details**, user can proceed or cancel.
If step 5 finds missing dependencies → **prompt user** to install them first.

### Search & Discovery (Marketplace UI — Future)

When the marketplace is built, users need to find relevant content:

- Browse by area (30 areas as top-level categories)
- Search by tag, keyword, regulation name
- Sort by: most installed, highest rated, newest, most updated
- Filter by: type (module/skill/workflow/persona), license, author/org
- "Recommended for you" based on areas and modules the user already uses

### Governance & Quality

- **Team tier:** No governance — org admins control access
- **Community tier:** Basic quality checks (valid format, no malicious content, description present), user ratings and reviews
- **Premium tier:** Editorial review, tested by platform team, verified author credentials

### Revenue Model Consideration

For the open-source version, Tier 1 (team) and Tier 2 (community) are free. The `.anton` format is open and anyone can create/share packages.

For a hosted SaaS version, Tier 3 (premium) could generate revenue through a commission model, but this needs strategic alignment with the open-source positioning. One approach: the platform is free, the marketplace is free, but premium verified content from expert contributors can carry a price tag — similar to how WordPress themes/plugins work.

**This is a strategic decision, not a technical one. Flag for Daniel + team discussion.**

---

## Appendix E: Cybersecurity Self-Audit Readiness

### Why This Matters

ANTON will be deployed inside financial institutions — banks, payment institutions, insurance companies. Their information security teams (CISO, IT Security, sometimes a dedicated AppSec team) will scrutinise anything installed on their infrastructure. If we can't answer their questions with a documented self-audit, we don't get through the door.

Advisense should perform its own cybersecurity assessment of ANTON before offering it for in-house deployment. This serves two purposes: it catches real issues before clients find them, and it produces documentation that reassures client infosec teams.

### What Client Security Teams Will Ask

Based on typical financial institution vendor security assessments and DORA ICT risk requirements, expect these categories of questions:

**1. Network & Data Flow**
- What external connections does the application make?
- What data leaves the organisation's network?
- What ports does the application listen on?
- Is there telemetry, analytics, or crash reporting?
- Does the application auto-update or check for updates?

**ANTON's answer must be:**
- The ONLY external connection is to the Claude API (api.anthropic.com) — and this is configurable/proxiable
- No telemetry, no analytics, no crash reporting to external services
- No auto-update mechanism — updates are manual file deployments
- The .anton exchange system is fully air-gapped (file-based, no network)
- All data stays on the local machine or within the organisation's network boundary

**2. Data Handling & Storage**
- Where is data stored? (SQLite on local disk — document the path)
- Is data encrypted at rest? (Currently no — document this, recommend full-disk encryption at OS level)
- What happens to data sent to Claude API? (Anthropic's data retention policy — document the zero-retention options available via API)
- Can the application function without sending data to an external API? (Not currently — ANTON requires Claude API access. Document this dependency clearly)
- Is any PII or sensitive data logged? (Audit the logging — ensure no customer data, session content, or PII appears in application logs)

**3. Authentication & Access Control**
- How is access to the application controlled? (Document current state — is there user auth? API key management?)
- Can API keys be rotated? (Yes — document the process)
- Is there role-based access? (Not in v1 — document as a future enhancement for enterprise deployments)
- Session management security (session tokens, expiry, etc.)

**4. Supply Chain & Dependencies**
- Full list of npm/pip dependencies with versions
- Known vulnerabilities scan (run `npm audit` and document results)
- Are dependencies pinned to exact versions? (They should be — lock files)
- Are any dependencies maintained by single individuals vs organisations?
- License audit — ensure all dependencies have compatible licenses for enterprise use

**5. Code Quality & Secure Development**
- Is there input validation on all user inputs?
- SQL injection protection (parameterised queries for SQLite)
- Path traversal protection (critical for Knowledge Source Mode 3 — local folder access)
- XSS protection in the UI (React handles most of this, but audit any dangerouslySetInnerHTML usage)
- Content Security Policy headers
- CORS configuration

**6. The Claude API Trust Boundary**
- Clearly document that ANTON sends user prompts + knowledge source content to Anthropic's Claude API
- Document which Anthropic API plan is used (zero-data-retention options)
- Document that the client can use their OWN Anthropic API key (so data processing stays under their agreement with Anthropic, not Advisense's)
- Document what metadata is included in API calls (model, temperature, etc. — NOT user identity)
- Consider: can a client route API calls through their own proxy for logging/inspection?

### Self-Audit Deliverables

Perform the audit and produce these documents:

| Document | Purpose | Audience |
|----------|---------|----------|
| **ANTON Security Architecture Overview** | Network diagram, data flow, trust boundaries, external connections | Client CISO / IT Security |
| **Dependency Audit Report** | Full dependency tree, vulnerability scan results, license audit | Client AppSec team |
| **Data Handling Statement** | What data is stored, where, how, retention, encryption status | Client DPO / Legal |
| **Claude API Data Processing Addendum** | Specifics of what goes to Anthropic, under what terms, ZDR options | Client Legal / Procurement |
| **Import Validation Security Spec** | How .anton packages are validated before ingestion | Client AppSec team |
| **Penetration Test Summary** | Results of basic security testing (at minimum: OWASP Top 10 checks) | Client CISO |
| **Hardening Guide** | Recommendations for secure deployment (firewall rules, disk encryption, API key management, OS-level controls) | Client IT Operations |

### Implementation Actions for Claude Code

These are concrete things to build/fix in the codebase to pass a security audit:

1. **Audit all logging** — ensure no session content, user prompts, API responses, or PII appear in logs. Log operational events only (session created, API call made with status code, export triggered — never the content).

2. **Parameterise all SQLite queries** — no string concatenation for SQL. This is likely already done but verify every query.

3. **Path validation for local folder access (Mode 3)** — the Knowledge Source system reads local files. This MUST validate that the resolved path is within the allowed directory. Prevent path traversal (`../../etc/passwd`). Use `path.resolve()` and check that the result starts with the configured base directory.

4. **CSP headers** — add Content-Security-Policy headers to the Express server. At minimum: `default-src 'self'; script-src 'self'; connect-src 'self' https://api.anthropic.com`

5. **API key handling** — the Claude API key must never appear in client-side code, logs, or error messages. Store server-side only. Environment variable or encrypted config file.

6. **Dependency pinning** — ensure `package-lock.json` is committed and exact versions are used. Run `npm audit` and document (or fix) all findings.

7. **Input sanitisation on .anton import** — implement the full validation pipeline from the Import Security Validation section above.

8. **Rate limiting** — add basic rate limiting to the Express API endpoints to prevent abuse if the tool is exposed on a network (even internal).

9. **HTTPS enforcement** — document that ANTON should be deployed behind HTTPS in any network-accessible configuration. Include a note in the hardening guide.

10. **Graceful error handling** — ensure no stack traces, internal paths, or system information leak in error responses to the client.

### Timing

The self-audit should happen **before the first client in-house deployment** — not before. During internal use and development, security hardening is iterative. But the moment we offer this for installation at a bank or FI, the documentation and hardening must be complete.

Realistically, budget 2-3 days for the audit itself plus 1-2 days for fixing findings and producing documentation. This is well within the team's capability — we don't need external pen testers for v1, though a client may require independent testing for their own comfort.

---

*End of specification.*
