# UX Recommendations & Analysis
**Date:** 2026-02-21
**Re:** User Questions on Output Formats, Languages, Transparency Display, and Agents

---

## Question 1: Output Format Toggle to Save Tokens

### Current Situation
**How it works now:**
- OutputFormatSelector shows 20+ format options (Executive Summary, Gap Scoring Matrix, etc.)
- Each format injects **prompt instructions** that tell Claude HOW to structure the output
- Example: "Executive Summary" adds ~400 tokens to the system prompt with structure instructions
- These instructions are sent to Claude API → **costs tokens**
- Export (DOCX/XLSX/PDF) happens AFTER Claude responds (client-side or server-side conversion)

**Token Impact:**
- No format selected: Base system prompt only (~1,000-2,000 tokens)
- 1 format selected: +200-500 tokens in system prompt
- 3 formats selected: +800-1,500 tokens in system prompt
- Multiple formats multiply token costs

**User's Concern:** ✅ **Valid**
Selecting output formats DOES increase token usage (input tokens for prompt instructions).

### Recommendation: **Add "Plain Text / Markdown Only" Toggle**

**Solution:**
Add a simple toggle ABOVE the format selector:

```
┌─────────────────────────────────────────────────────────────┐
│ 📋 What should Claude produce?                              │
│                                                             │
│ Output style:                                               │
│ ○ Plain text / Markdown (faster, cheaper)                  │
│ ● Structured deliverable (select format below)             │
│                                                             │
│ [Only show format chips if "Structured deliverable" is selected]
│                                                             │
│ ── Strategic ──                                             │
│ [Executive Summary] [Decision Memo] ...                     │
└─────────────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Users can choose speed/cost vs. structure
- ✅ "Plain text" mode = no format instructions = ~500-1,500 tokens saved
- ✅ Still get expert analysis, just less formatted
- ✅ Can always re-run with format if needed

**Implementation:**
```typescript
// In ModulePage state:
const [useOutputFormats, setUseOutputFormats] = useState(true);

// In prompt building:
const outputInstructions = useOutputFormats && selectedOutputFormats.length > 0
  ? buildOutputInstruction(selectedOutputFormats)
  : ''; // No format instructions = plain text

// In UI:
<div className="mb-3">
  <label className="text-xs text-adv-gray">Output style</label>
  <div className="flex gap-2 mt-1">
    <button onClick={() => setUseOutputFormats(false)} className={...}>
      Plain text (faster)
    </button>
    <button onClick={() => setUseOutputFormats(true)} className={...}>
      Structured (select format)
    </button>
  </div>
</div>

{useOutputFormats && <OutputFormatSelector ... />}
```

**Token Savings Example:**
- Plain text mode: ~1,500 tokens (base prompt)
- With Executive Summary: ~2,000 tokens (+500)
- With 3 formats: ~3,000 tokens (+1,500)
- **Savings: 25-50% on input tokens** for users who just want quick answers

**Recommendation:** ✅ **IMPLEMENT THIS**

---

## Question 2: Add 30 Languages to Output Language Selector

### Current Situation
**CommunicationsPanel (lines 34-44):**
```typescript
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'sv', label: 'Svenska (Swedish)' },
  { code: 'fi', label: 'Suomi (Finnish)' },
  { code: 'da', label: 'Dansk (Danish)' },
  { code: 'no', label: 'Norsk (Norwegian)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'pl', label: 'Polski (Polish)' },
]; // Only 9 languages!
```

**We have 30 languages in i18n:**
en, sv, fr, de, it, es, hi, pt, pl, ur, zh, ar, bn, uk, id, ja, tr, vi, ko, th, fa, nl, ro, el, cs, hu, he, fi, no, da

**Gap:** Output language selector shows 9, but UI supports 30.

### Recommendation: **Expand to All 30 Languages**

**Solution:**
Import language list from i18n config:

```typescript
// src/components/shared/CommunicationsPanel.tsx
import { SUPPORTED_LANGUAGES } from '@/i18n';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'sv', label: 'Svenska (Swedish)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'it', label: 'Italiano (Italian)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'hi', label: 'हिंदी (Hindi)' },
  { code: 'pt', label: 'Português (Portuguese)' },
  { code: 'pl', label: 'Polski (Polish)' },
  { code: 'ur', label: 'اردو (Urdu)' },
  { code: 'zh', label: '中文 (Chinese)' },
  { code: 'ar', label: 'العربية (Arabic)' },
  { code: 'bn', label: 'বাংলা (Bengali)' },
  { code: 'uk', label: 'Українська (Ukrainian)' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'tr', label: 'Türkçe (Turkish)' },
  { code: 'vi', label: 'Tiếng Việt (Vietnamese)' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'th', label: 'ไทย (Thai)' },
  { code: 'fa', label: 'فارسی (Persian)' },
  { code: 'nl', label: 'Nederlands (Dutch)' },
  { code: 'ro', label: 'Română (Romanian)' },
  { code: 'el', label: 'Ελληνικά (Greek)' },
  { code: 'cs', label: 'Čeština (Czech)' },
  { code: 'hu', label: 'Magyar (Hungarian)' },
  { code: 'he', label: 'עברית (Hebrew)' },
  { code: 'fi', label: 'Suomi (Finnish)' },
  { code: 'no', label: 'Norsk (Norwegian)' },
  { code: 'da', label: 'Dansk (Danish)' },
];
```

**UI Improvement:**
Make dropdown searchable for 30 languages:

```typescript
// Consider using a better select component
import Select from 'react-select'; // or similar

<Select
  value={LANGUAGES.find(l => l.code === outputLanguage)}
  onChange={(option) => onOutputLanguageChange(option.code)}
  options={LANGUAGES}
  placeholder="Select output language..."
  className="react-select-container"
  classNamePrefix="react-select"
  isSearchable
/>
```

**OR** keep native select with grouping:

```typescript
<select ...>
  <optgroup label="European Languages">
    <option value="en">English</option>
    <option value="sv">Svenska (Swedish)</option>
    ...
  </optgroup>
  <optgroup label="Asian Languages">
    <option value="zh">中文 (Chinese)</option>
    <option value="ja">日本語 (Japanese)</option>
    ...
  </optgroup>
  <optgroup label="Middle Eastern Languages">
    <option value="ar">العربية (Arabic)</option>
    ...
  </optgroup>
</select>
```

**Recommendation:** ✅ **IMPLEMENT THIS** (expand to all 30 languages)

---

## Question 3: Transparency/Thinking Display Location

### Current Situation
**How it displays now (ConversationThread.tsx lines 57-66):**
```typescript
{msg.role === 'assistant' && msg.thinkingContent && (
  <details className="mb-2">
    <summary className="flex cursor-pointer items-center gap-1.5 text-xs">
      <Brain className="h-3 w-3" />
      Thinking process
    </summary>
    <div className="mt-2 rounded-lg border border-border bg-adv-dark p-3 text-xs italic">
      {msg.thinkingContent}
    </div>
  </details>
)}
```

**Current behavior:**
- Thinking appears **inline** at the top of each assistant message
- Uses HTML `<details>` element (collapsible)
- Collapsed by default
- User clicks "Thinking process" to expand
- Thinking content shown in italics, slightly dimmed

**Pros:**
✅ Context: Thinking appears right before the output it produced
✅ Simple: No extra UI complexity
✅ Accessible: Native HTML element

**Cons:**
❌ Visual clutter when expanded (especially for long thinking)
❌ Breaks reading flow if user wants to focus on output
❌ Can't compare thinking across multiple responses easily

### Recommendation: **Add Separate Thinking Tab/Panel**

**Option A: Side-by-side Panels (Best UX)**

```
┌──────────────────────┬──────────────────────────┐
│ Left: Config Panel   │ Right: Output Area       │
│                      │                          │
│ [Controls...]        │ ┌─ Tabs ─────────────┐  │
│                      │ │ Output | Thinking  │  │
│                      │ └────────────────────┘  │
│                      │                          │
│                      │ [Content based on tab]  │
│                      │                          │
└──────────────────────┴──────────────────────────┘
```

**Implementation:**
```typescript
// In ModulePage:
const [activeTab, setActiveTab] = useState<'output' | 'thinking'>('output');

<div className="flex gap-2 mb-3">
  <button
    onClick={() => setActiveTab('output')}
    className={activeTab === 'output' ? 'active' : ''}
  >
    Output
  </button>
  <button
    onClick={() => setActiveTab('thinking')}
    className={activeTab === 'thinking' ? 'active' : ''}
  >
    🧠 Thinking
    {hasThinking && <span className="ml-1 badge">•</span>}
  </button>
</div>

{activeTab === 'output' && <ConversationThread {...} />}
{activeTab === 'thinking' && <ThinkingPanel messages={messages} />}
```

**Option B: Floating Panel (Less Intrusive)**

```
┌─────────────────────────────────────────┐
│ Output Panel                            │
│                                         │
│ [Assistant response...]                 │
│                                         │
│              ┌─────────────────┐        │
│              │ 🧠 Thinking     │← Floating
│              │ [thinking...]   │  overlay
│              │ [Minimize] [×]  │        │
│              └─────────────────┘        │
└─────────────────────────────────────────┘
```

**Option C: Split View Toggle (User Choice)**

Add button to toggle thinking panel on/off:

```
[Output] [🧠 Show Thinking]  ← Button toggles thinking panel
```

When toggled:
```
┌─────────────────┬──────────────────┐
│ Output (60%)    │ Thinking (40%)   │
│                 │                  │
│ [Response...]   │ [Thinking...]    │
│                 │                  │
└─────────────────┴──────────────────┘
```

### **Recommended Approach: Option A (Tabs)**

**Why:**
- ✅ Clean: No visual clutter
- ✅ Clear: User knows where to find thinking
- ✅ Flexible: Easy to add more tabs later (Citations, Sources, etc.)
- ✅ Familiar: Common pattern in developer tools
- ✅ Mobile-friendly: Tabs work well on small screens

**Implementation Priority:** ✅ **Medium** (not urgent, but nice UX improvement)

---

## Question 4: Claude Agents vs Personas

### Current Situation

**Personas (WritingStylePanel.tsx):**
- User selects up to 3 personas from ~30 options
- Categories: Domain Experts, Named Characters, Audiences, Analytical Styles
- Examples: "Legal Expert", "Risk Analyst", "Board Member", "Regulator"
- Personas affect **writing style and perspective**

**Multi-Perspective Mode (lines 139-160):**
```typescript
<label>
  <input type="checkbox" checked={multiPerspective} />
  Multi-perspective analysis
</label>
<p>Claude analyses from multiple expert viewpoints (legal, compliance,
business, regulatory) then synthesises.</p>
```

**What it does:**
- When enabled: Claude internally considers multiple viewpoints
- Then synthesizes into single coherent response
- No separate "agents" running in parallel

**Claude Agents (Hypothetical):**
- Multiple Claude instances running simultaneously
- Each with different role/instructions
- Collaborate or debate
- Results combined/compared

### Analysis: **Personas ≠ Agents**

**Current Personas:**
- ✅ **Single Claude instance**
- ✅ Takes on multiple perspectives mentally
- ✅ Produces unified output
- ✅ Fast (one API call)
- ✅ Cheaper (one set of tokens)
- ❌ Not true multi-agent collaboration
- ❌ No separate reasoning chains
- ❌ No agent-to-agent debate

**True Claude Agents:**
- ✅ Multiple Claude instances
- ✅ Separate reasoning for each
- ✅ Can debate/disagree
- ✅ More diverse perspectives
- ❌ Slower (N API calls)
- ❌ More expensive (N × tokens)
- ❌ Complex orchestration

### Recommendation: **Keep Personas, Add Optional Agents**

**Why keep current system:**
1. **Personas work well** for 90% of use cases
2. **Fast and cheap** — single API call
3. **Multi-perspective mode** already gives multiple viewpoints
4. **No breaking changes** needed

**When true agents are needed:**
1. **Red team / Blue team** debates
2. **Peer review** (one agent writes, another critiques)
3. **Multi-round refinement** (agent A drafts, agent B improves, agent C finalizes)
4. **Consensus building** (3 agents vote on recommendation)

### **Implementation Recommendation:**

**Add "Agent Mode" Toggle (Advanced Feature)**

```typescript
// In SessionTogglesPanel or WritingStylePanel:
<label>
  <input type="checkbox" checked={agentMode} />
  🤖 Multi-agent mode (experimental)
</label>
<p className="text-xs text-adv-gray">
  Run multiple Claude instances with different roles.
  Slower and more expensive, but produces more diverse perspectives.
</p>

{agentMode && (
  <div>
    <label>Number of agents:</label>
    <select value={agentCount} onChange={...}>
      <option value={2}>2 agents</option>
      <option value={3}>3 agents</option>
      <option value={5}>5 agents</option>
    </select>

    <label>Collaboration style:</label>
    <select value={collaboration} onChange={...}>
      <option value="debate">Debate (agents disagree)</option>
      <option value="consensus">Consensus (agents agree)</option>
      <option value="sequential">Sequential (refine each other)</option>
    </select>
  </div>
)}
```

**How it would work:**
1. User enables "Multi-agent mode"
2. Selects N agents and collaboration style
3. System makes N API calls with different system prompts
4. Aggregates results based on collaboration style:
   - **Debate:** Show all perspectives side-by-side
   - **Consensus:** Show areas of agreement + disagreement
   - **Sequential:** Show progressive refinement

**Token/Cost Impact:**
- 2 agents = 2× cost
- 3 agents = 3× cost
- 5 agents = 5× cost

**Use cases:**
- High-stakes decisions (board papers, regulatory submissions)
- Red team reviews (one agent writes, another attacks)
- Consensus building (multiple experts vote)

**Recommendation:** ✅ **OPTIONAL ENHANCEMENT** (not critical for v1.0)

**For now:**
- ✅ Keep current personas system
- ✅ Multi-perspective mode is sufficient
- ✅ Can add true agents in future if demand exists

---

## Summary of Recommendations

| # | Question | Current State | Recommendation | Priority | Effort |
|---|----------|---------------|----------------|----------|--------|
| 1 | Output format token usage | All formats cost tokens | Add "Plain text" toggle to save tokens | **HIGH** ✅ | 2-3 hours |
| 2 | Language selector | 9 languages shown | Expand to all 30 languages | **HIGH** ✅ | 1-2 hours |
| 3 | Thinking display | Inline collapsible | Add separate Thinking tab/panel | **MEDIUM** | 3-4 hours |
| 4 | Agents vs Personas | Personas only | Keep personas, optionally add agents later | **LOW** | 8-12 hours (agents) |

**Immediate Actions (Before Production):**
1. ✅ Add "Plain text / Structured" toggle → Save users 25-50% on tokens
2. ✅ Expand output language selector to 30 languages → Match i18n coverage

**Nice-to-Have (Post-Launch):**
3. ⚠️ Add Thinking tab for better UX
4. ⚠️ Add true multi-agent mode (experimental feature)

---

## Implementation Notes

### 1. Plain Text Toggle
**File:** `src/components/shared/OutputFormatSelector.tsx`
**Changes:**
- Add toggle above format chips
- Conditionally show format selector
- Pass `useOutputFormats` boolean to parent

### 2. Expand Languages
**File:** `src/components/shared/CommunicationsPanel.tsx`
**Changes:**
- Replace LANGUAGES array with all 30
- Add native names (中文, العربية, etc.)
- Consider grouping in `<optgroup>` for better UX

### 3. Thinking Tab
**Files:**
- `src/pages/ModulePage.tsx` — Add tab state
- `src/components/shared/ThinkingPanel.tsx` — NEW component
- `src/components/shared/ConversationThread.tsx` — Keep inline option as fallback

### 4. Multi-Agent Mode
**Files:**
- `src/components/shared/AgentModePanel.tsx` — NEW component
- `server/services/multi-agent.ts` — NEW orchestration logic
- Requires significant backend work

---

**Next Steps:**
1. Review these recommendations
2. Prioritize: #1 and #2 for immediate implementation
3. #3 and #4 can wait for post-launch

