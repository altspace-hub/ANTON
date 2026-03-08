# ANTON — Iterative Reasoning Engine: From Insight to Revelation to Result

> **Audience:** Claude Code  
> **Purpose:** ANTON currently does mostly single-shot LLM calls: prompt in, response out. But the way Claude reasons in conversation — thinking step by step, where insight from step 2 changes the approach in step 3, where an "aha moment" mid-analysis pivots the entire conclusion — that capability exists in the API and ANTON must use it. This document specifies how to build iterative, multi-step reasoning into ANTON's modules and Orchestrator.  
> **First step for Claude Code:** Read this fully, then audit how `unified-llm-client.ts` and `prompt-builder.ts` currently handle LLM calls. Check whether extended thinking, adaptive thinking, tool use, and multi-turn conversations are already supported or partially implemented. This spec builds on what exists.

---

## 1. The Problem

When you talk to Claude in conversation, something powerful happens. You ask a question, Claude thinks about it, gives an initial answer — and then, as you discuss further, Claude has moments where an earlier insight connects to new information and produces a deeper understanding. The reasoning is iterative: observation → hypothesis → test → revision → deeper observation → breakthrough.

A compliance officer doing a gap analysis doesn't think in one shot either. They read the regulation, form an initial assessment, then go back and re-read a specific article because something didn't feel right, then cross-reference with another regulation, then realise the real gap is somewhere they didn't initially look, then restructure their entire analysis around that revelation.

**ANTON today:** Assembles a comprehensive prompt (seven layers), sends it to the LLM in one call, gets back one response. The response might be excellent — but it's a single pass. There's no "wait, let me reconsider that" moment. No "actually, that finding from paragraph 3 changes what I should say in paragraph 7." No iterative deepening where each step builds on and potentially revises the previous step.

**What ANTON needs:** The ability to think iteratively — where the output of one reasoning step becomes the input to the next, where intermediate findings can trigger re-evaluation, and where the final output represents not just one pass of analysis but a refined, deepened, self-corrected result.

---

## 2. What the API Actually Supports (Technical Reality Check)

Claude Code: this section documents what's genuinely available. Build against these capabilities, not aspirations.

### 2.1 Extended Thinking (Single-Turn Deep Reasoning)

The API supports extended thinking where Claude reasons step-by-step before producing output. This is deep thinking within a single call.

```typescript
// Extended thinking — Claude reasons internally before responding
const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 16000,
  thinking: {
    type: "enabled",
    budget_tokens: 10000  // How many tokens Claude can use for internal reasoning
  },
  messages: [{ role: "user", content: "Analyse this gap..." }]
});

// Response includes thinking blocks + final text
// response.content = [
//   { type: "thinking", thinking: "Let me work through this step by step..." },
//   { type: "text", text: "The analysis reveals..." }
// ]
```

**What this gives ANTON:** Deep single-pass reasoning. Claude already thinks step-by-step internally. Increasing the thinking budget gives it more space to reason, self-correct, and refine before responding.

**Limitation:** It's still one pass. Claude can't discover something in its analysis and then go fetch additional information or re-run a different module based on that discovery.

### 2.2 Adaptive Thinking (Opus 4.6 / Sonnet 4.6)

The newest models support adaptive thinking where Claude decides *how much* to think based on task complexity:

```typescript
const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 16000,
  thinking: {
    type: "adaptive"  // Claude decides when and how deeply to think
  },
  messages: [{ role: "user", content: "..." }]
});
```

With an effort parameter for guidance:

```typescript
thinking: {
  type: "adaptive",
  effort: "high"  // "low", "medium", "high"
}
```

**What this gives ANTON:** The model self-regulates its reasoning depth. For simple tasks, minimal thinking. For complex analyses, deep reasoning. This maps well to ANTON's existing thinking levels (quick → think → think_hard → investigate).

### 2.3 Interleaved Thinking (Think-Act-Think-Act Loops)

This is the critical capability. Claude can think *between* tool calls, reasoning about results before deciding the next action:

```
Think → Call Tool A → Think about Tool A results → Call Tool B → Think about combined results → Respond
```

On Opus 4.6, interleaved thinking is automatically enabled with adaptive thinking. On Sonnet 4.6, use the `interleaved-thinking-2025-05-14` beta header.

**What this gives ANTON:** When ANTON uses tools (web search, knowledge source retrieval, database queries, file reading), Claude can reason about each result before deciding what to do next. This is the foundation of iterative reasoning with external information.

### 2.4 The "Think" Tool (Explicit Reasoning Checkpoints)

Anthropic recommends implementing a dedicated "think" tool that Claude can call to reason explicitly:

```typescript
const think_tool = {
  name: "think",
  description: "Use this tool to think through complex problems step by step. " +
    "Call this when you need to reason about intermediate results, reconsider " +
    "your approach, or synthesise findings before proceeding.",
  input_schema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Your reasoning, reflection, or analysis"
      },
      conclusion: {
        type: "string", 
        description: "What you concluded and how it affects your next step"
      },
      confidence: {
        type: "number",
        description: "0.0-1.0: How confident you are in this reasoning"
      },
      revision_needed: {
        type: "boolean",
        description: "Whether this insight requires revising earlier conclusions"
      }
    },
    required: ["thought", "conclusion"]
  }
};
```

**What this gives ANTON:** Explicit, capturable reasoning checkpoints. Every time Claude calls the think tool, ANTON captures structured reasoning that feeds into the Reasoning Trail. The `revision_needed` flag is particularly powerful — it signals when an insight should trigger re-evaluation.

**Anthropic's research shows** that the think tool is especially effective for: complex tool call chains, policy-heavy environments, and sequential decisions where each step builds on previous ones. This is exactly ANTON's use case.

### 2.5 Multi-Turn Agentic Loops

The API supports full conversation history, meaning ANTON can build multi-turn reasoning loops:

```typescript
// Turn 1: Initial analysis
const turn1 = await client.messages.create({
  model: "claude-opus-4-6",
  thinking: { type: "adaptive" },
  messages: [
    { role: "user", content: "Analyse these 15 AMLR articles for gaps against our controls..." }
  ]
});

// Turn 2: Self-critique
const turn2 = await client.messages.create({
  model: "claude-opus-4-6",
  thinking: { type: "adaptive" },
  messages: [
    { role: "user", content: "Analyse these 15 AMLR articles..." },
    { role: "assistant", content: turn1.content },
    { role: "user", content: "Now review your analysis critically. What did you miss? " +
      "Where are your assessments weakest? What assumptions should be challenged?" }
  ]
});

// Turn 3: Deepening based on self-critique
const turn3 = await client.messages.create({
  model: "claude-opus-4-6",
  thinking: { type: "adaptive" },
  messages: [
    ...previousMessages,
    { role: "assistant", content: turn2.content },
    { role: "user", content: "Based on your critique, revise the analysis. " +
      "Focus on the areas you identified as weak. Produce the final version." }
  ]
});
```

**What this gives ANTON:** Full iterative reasoning. Initial analysis → self-critique → revision → deeper analysis. Each turn carries the full context of what came before, so insights compound.

---

## 3. ANTON's Iterative Reasoning Engine

### 3.1 The Core Pattern: Analyse → Reflect → Deepen → Synthesise

The Iterative Reasoning Engine (IRE) wraps every ANTON module execution in an optional multi-step reasoning loop:

```
Step 1: ANALYSE
  "Perform the task using the module's full seven-layer prompt"
  → Produces initial output with thinking content

Step 2: REFLECT
  "Review your analysis. What did you miss? Where are assumptions 
   weakest? What connections did you overlook? What would a critic say?"
  → Produces self-critique with specific identified gaps

Step 3: DEEPEN
  "Based on your reflection, investigate the areas you identified.
   Gather additional context if needed. Revise your conclusions."
  → May trigger: knowledge source queries, tool calls, pattern lookups
  → Produces revised analysis incorporating new insights

Step 4: SYNTHESISE
  "Produce the final output. Integrate initial analysis with deepened
   findings. Flag what changed between your first and final assessment.
   Note the key insight that shifted your analysis."
  → Produces final output with a "revelation trail" showing how 
    understanding evolved
```

**Not every task needs all four steps.** A routine Brief Me query might use Step 1 only (single pass). A standard gap analysis might use Steps 1-2 (analyse + reflect). A regulatory submission might use all four steps (full iterative deepening). The depth is configurable per module and per session.

### 3.2 Reasoning Depth Levels

Map to ANTON's existing thinking levels, but now with iteration:

| Thinking Level | Single Pass | Iterative | Steps Used | Typical Use |
|---|---|---|---|---|
| `quick` | Haiku, minimal thinking | No iteration | Step 1 only | Brief Me, simple queries |
| `think` | Sonnet, moderate thinking | No iteration | Step 1 only | Standard module execution |
| `think_hard` | Opus, deep thinking | Optional 2-step | Steps 1 + 2 | Important deliverables |
| `investigate` | Opus, maximum thinking | Full 4-step loop | Steps 1-4 | Regulatory submissions, complex analysis |
| `deep_investigate` | **NEW** — Opus, maximum thinking | Full loop with tool use | Steps 1-4 + tool calls | Research-grade analysis, discovery |

`deep_investigate` is the new level. It enables the full Think-Act-Think-Act pattern where ANTON:
- Performs initial analysis
- Reflects on gaps
- Uses tools to gather additional information (web search, knowledge source retrieval, database queries)
- Reasons about what it found
- Revises its analysis
- Potentially repeats the gather-reason-revise cycle

### 3.3 The Revelation Chain

This is the feature that makes iterative reasoning visible and valuable. Every iterative execution produces a **Revelation Chain** — a structured record of how ANTON's understanding evolved through the reasoning steps:

```typescript
interface RevelationChain {
  session_id: string;
  module_id: string;
  depth_level: 'quick' | 'think' | 'think_hard' | 'investigate' | 'deep_investigate';
  
  steps: RevelationStep[];
  
  // The key insight — what changed between first and final assessment
  key_revelation?: {
    description: string;          // "The real gap isn't in Article 19 — it's in the interaction between Article 19 and Article 28"
    step_discovered: number;      // Which step produced this revelation
    impact: string;               // "Restructured the entire gap matrix around cross-article interactions"
    confidence_before: number;    // Confidence in initial conclusion
    confidence_after: number;     // Confidence after revelation
  };
  
  // Metrics
  total_turns: number;
  total_tokens: number;
  total_cost: number;
  quality_improvement: {
    initial_estimated_quality: number;
    final_quality: number;
    delta: number;
  };
}

interface RevelationStep {
  step_number: number;
  step_type: 'analyse' | 'reflect' | 'deepen' | 'synthesise';
  
  // What happened in this step
  summary: string;
  thinking_content: string;       // Extended thinking for this step
  output_content: string;         // The output produced
  
  // What changed
  insights_gained: string[];      // New insights from this step
  revisions_made: string[];       // What was revised from previous steps
  tools_used?: string[];          // Tools called during this step (deep_investigate)
  
  // Confidence tracking
  confidence: number;             // Confidence at this step
  areas_of_uncertainty: string[]; // What's still uncertain
  
  tokens_used: number;
  cost: number;
}
```

**UI presentation — the Revelation Trail:**

```
┌──────────────────────────────────────────────────────────────────┐
│ AMLR Gap Analysis — Iterative Reasoning (investigate mode)       │
│ 4 steps • Quality: 7.2 → 8.9 • Key revelation at Step 3        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Step 1: Initial Analysis                          conf: 72%     │
│ ──────────────────────────────────────────────────────────────── │
│ Identified 8 gaps across 15 AMLR articles. Rated 2 as HIGH,     │
│ 3 as MEDIUM, 3 as LOW.                                           │
│ [View full analysis] [View thinking]                             │
│                                                                   │
│ Step 2: Self-Critique                             conf: 65% ↓   │
│ ──────────────────────────────────────────────────────────────── │
│ "My analysis treated each article independently. But Articles    │
│ 19 and 28 have cross-references that create compound             │
│ requirements I didn't assess. Also, I assumed the client's       │
│ crypto CDD process covers beneficial ownership — I should        │
│ verify this against their actual process documentation."          │
│ [View full critique] [View thinking]                             │
│                                                                   │
│ Step 3: Deepened Analysis                         conf: 88% ↑   │
│ ──────────────────────────────────────────────────────────────── │
│ 💡 KEY REVELATION: "The real gap isn't in Article 19 alone —    │
│ it's in the interaction between Articles 19, 28, and 40. The    │
│ client's crypto CDD process doesn't chain beneficial ownership  │
│ verification through to enhanced monitoring triggers. This is    │
│ a systemic gap, not three separate gaps."                        │
│                                                                   │
│ Restructured gap matrix: 1 CRITICAL (systemic), 2 HIGH,         │
│ 2 MEDIUM, 3 LOW. Total gap count stayed at 8 but severity       │
│ distribution changed significantly.                              │
│ [View revised analysis] [View thinking] [View tools used]       │
│                                                                   │
│ Step 4: Final Synthesis                           conf: 91% ↑   │
│ ──────────────────────────────────────────────────────────────── │
│ Integrated initial findings with systemic gap discovery.          │
│ Action plan now leads with the systemic remediation (which       │
│ addresses 3 gaps simultaneously) rather than treating each       │
│ gap independently. Estimated remediation effort reduced from      │
│ 340 hours to 220 hours because fixing the systemic issue         │
│ resolves multiple downstream gaps.                                │
│ [View final output] [View thinking]                              │
│                                                                   │
│ ┌─ Quality Journey ──────────────────────────────────────────┐  │
│ │ Step 1: ~7.2  →  Step 2: reflection  →  Step 3: 💡 8.5    │  │
│ │ →  Step 4: 8.9 (final)                                     │  │
│ │                                                             │  │
│ │ Improvement: +1.7 points through iterative deepening       │  │
│ └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│ [Export with revelation trail] [Export final only]                │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Architecture

### 4.1 The Reasoning Loop Service

**New service:** `server/services/iterative-reasoning.ts`

```typescript
interface ReasoningConfig {
  depth: 'quick' | 'think' | 'think_hard' | 'investigate' | 'deep_investigate';
  max_iterations: number;           // Safety limit (default: 4 for investigate, 6 for deep_investigate)
  quality_target?: number;          // Stop when estimated quality reaches this (optional)
  revision_threshold: number;       // Confidence below this triggers another iteration (default: 0.75)
  tools_enabled: boolean;           // Whether to allow tool use during deepening (deep_investigate only)
  available_tools: Tool[];          // Which tools ANTON can use (web search, knowledge retrieval, etc.)
}

interface ReasoningResult {
  final_output: string;
  revelation_chain: RevelationChain;
  total_iterations: number;
  total_tokens: number;
  total_cost: number;
  thinking_captured: boolean;       // Whether extended thinking was captured
}

async function executeWithReasoning(
  prompt: AssembledPrompt,          // From prompt-builder.ts (all 7 layers)
  userMessage: string,
  config: ReasoningConfig,
  context: SessionContext
): Promise<ReasoningResult> {
  
  const chain: RevelationStep[] = [];
  let conversationHistory: Message[] = [];
  let currentConfidence = 0;
  let iteration = 0;
  
  // Step 1: ANALYSE — initial execution with full seven-layer prompt
  const analyseResult = await llmCall({
    system: prompt.assembledSystemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    thinking: getThinkingConfig(config.depth),
    tools: config.tools_enabled ? [thinkTool, ...config.available_tools] : [thinkTool],
  });
  
  chain.push(createStep('analyse', analyseResult));
  conversationHistory = buildHistory(analyseResult);
  currentConfidence = extractConfidence(analyseResult);
  iteration++;
  
  // For 'quick' and 'think' — stop here (single pass)
  if (config.depth === 'quick' || config.depth === 'think') {
    return buildResult(chain, analyseResult);
  }
  
  // Step 2: REFLECT — self-critique
  const reflectPrompt = buildReflectionPrompt(config.depth);
  const reflectResult = await llmCall({
    system: prompt.assembledSystemPrompt,
    messages: [...conversationHistory, { role: 'user', content: reflectPrompt }],
    thinking: getThinkingConfig(config.depth),
    tools: [thinkTool],
  });
  
  chain.push(createStep('reflect', reflectResult));
  conversationHistory = buildHistory(reflectResult, conversationHistory);
  iteration++;
  
  // For 'think_hard' — stop after reflection (2-step)
  if (config.depth === 'think_hard') {
    // Optionally: if reflection identified significant issues, do one more pass
    if (reflectResult.significant_revisions_needed && iteration < config.max_iterations) {
      // One revision pass incorporating reflection
      const reviseResult = await llmCall({...});
      chain.push(createStep('synthesise', reviseResult));
    }
    return buildResult(chain, latestResult);
  }
  
  // Step 3: DEEPEN — investigate identified gaps
  const deepenPrompt = buildDeepeningPrompt(reflectResult, config);
  const deepenResult = await llmCall({
    system: prompt.assembledSystemPrompt,
    messages: [...conversationHistory, { role: 'user', content: deepenPrompt }],
    thinking: getThinkingConfig(config.depth),
    tools: config.tools_enabled ? [thinkTool, ...config.available_tools] : [thinkTool],
  });
  
  chain.push(createStep('deepen', deepenResult));
  conversationHistory = buildHistory(deepenResult, conversationHistory);
  iteration++;
  
  // For 'deep_investigate' — may do additional deepen cycles
  if (config.depth === 'deep_investigate') {
    while (
      iteration < config.max_iterations &&
      extractConfidence(deepenResult) < config.revision_threshold &&
      deepenResult.has_unresolved_questions
    ) {
      // Another deepen cycle — Claude identifies what it still doesn't know,
      // uses tools to find out, reasons about what it found
      const additionalDeepen = await llmCall({...});
      chain.push(createStep('deepen', additionalDeepen));
      conversationHistory = buildHistory(additionalDeepen, conversationHistory);
      iteration++;
    }
  }
  
  // Step 4: SYNTHESISE — final output integrating all insights
  const synthesisePrompt = buildSynthesisPrompt(chain);
  const synthesiseResult = await llmCall({
    system: prompt.assembledSystemPrompt,
    messages: [...conversationHistory, { role: 'user', content: synthesisePrompt }],
    thinking: getThinkingConfig(config.depth),
    tools: [thinkTool],
  });
  
  chain.push(createStep('synthesise', synthesiseResult));
  
  return buildResult(chain, synthesiseResult);
}
```

### 4.2 Reflection Prompts

The quality of iterative reasoning depends heavily on the reflection prompts. These are **not** generic "review your work" instructions. They're domain-aware, quality-aware, and structured to surface specific types of insights.

```typescript
function buildReflectionPrompt(depth: string): string {
  return `
Now critically review the analysis you just produced. This is not about polish or formatting — 
it's about substance. Answer each of these honestly:

1. COMPLETENESS: What aspects of the task did I not fully address? What sections feel thin?
   What would a senior reviewer flag as insufficient?

2. ASSUMPTIONS: What assumptions did I make that I didn't state? Which of those assumptions 
   might be wrong? What would change if they were wrong?

3. CONNECTIONS: Did I treat each finding independently when there are actually connections 
   between them? Are there compound or systemic issues hiding behind what look like separate gaps?

4. STRONGEST CHALLENGE: If an expert critic were reviewing this, what would be their single 
   strongest objection? How would I need to revise to address it?

5. MISSING PERSPECTIVES: What expert perspective am I missing? Would a different persona 
   (legal, technical, operational, strategic) see something I missed?

6. CONFIDENCE MAP: For each major conclusion, rate my confidence 0-10 and explain why. 
   Which conclusions am I least confident about?

Be honest. The goal is to improve the analysis, not to defend it.
  `;
}

function buildDeepeningPrompt(reflection: ReflectResult, config: ReasoningConfig): string {
  return `
Based on your self-critique, you identified these areas needing attention:
${reflection.identified_gaps.map(g => `- ${g}`).join('\n')}

Now investigate these areas specifically:
- For gaps in completeness: fill them with the same rigour as the rest of the analysis
- For questionable assumptions: test them against available evidence
- For missed connections: map the relationships and assess whether they change your conclusions
- For low-confidence conclusions: either find supporting evidence or revise them

${config.tools_enabled ? 
  'You have access to tools (web search, knowledge retrieval, database queries). Use them if you need additional information to address identified gaps.' : 
  'Work with the information available to you. Flag anything you cannot resolve without additional data.'}

Produce a revised analysis that incorporates your deeper investigation. Explicitly note what 
changed from your initial analysis and why.
  `;
}

function buildSynthesisPrompt(chain: RevelationStep[]): string {
  const revisions = chain.filter(s => s.revisions_made.length > 0);
  return `
You have now completed ${chain.length} reasoning steps. Produce your final output that 
integrates everything you've learned.

Your analysis evolved through these key moments:
${revisions.map(r => `- Step ${r.step_number}: ${r.revisions_made.join('; ')}`).join('\n')}

In your final output:
1. Present the analysis in its final, best form — not as a revision history but as 
   a polished deliverable
2. At the end, include a brief "Analytical Note" section that explains the key insight 
   that most improved this analysis — what you initially missed and how discovering it 
   changed the outcome. This is the revelation that makes iterative analysis valuable.
3. Note your overall confidence level and any remaining uncertainties

The goal is an output that is demonstrably better than a single-pass analysis would have been.
  `;
}
```

### 4.3 The Think Tool Integration

Register the think tool alongside any other tools the module uses:

```typescript
const antonThinkTool = {
  name: "think",
  description: `Use this tool to pause and reason carefully before taking your next action.
    
    Call this tool when:
    - You've received information that changes your understanding
    - You need to reconcile conflicting evidence
    - You're about to make a significant analytical judgment
    - You've found something unexpected that might affect earlier conclusions
    - You need to plan your next investigative step
    
    Your thinking will be captured in ANTON's reasoning trail for transparency and audit.`,
  input_schema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Your detailed reasoning about the current situation"
      },
      conclusion: {
        type: "string",
        description: "What you concluded and how it affects your approach"
      },
      confidence: {
        type: "number",
        description: "0.0-1.0: Confidence in this reasoning step"
      },
      revision_needed: {
        type: "boolean",
        description: "Whether this insight requires revising earlier conclusions"
      },
      next_action: {
        type: "string",
        description: "What you plan to do next based on this reasoning"
      }
    },
    required: ["thought", "conclusion"]
  }
};
```

When Claude calls the think tool, ANTON:
1. Captures the structured reasoning in the Reasoning Trail
2. Returns `{ "acknowledged": true }` (the tool "succeeds" — it's purely a reasoning checkpoint)
3. Claude continues with its next action informed by its explicit reasoning

### 4.4 Tools Available During Deep Investigation

When `deep_investigate` is active, ANTON makes these tools available to Claude during the deepening step:

```typescript
const investigationTools = [
  antonThinkTool,                    // Always available — explicit reasoning checkpoints
  
  // Knowledge retrieval
  {
    name: "search_knowledge_base",
    description: "Search ANTON's knowledge sources for specific information",
    // ... searches local folders, indexed documents, knowledge graph
  },
  
  // Web search (if enabled in knowledge source config)
  {
    name: "web_search",
    description: "Search the web for current information",
    // ... uses existing web search integration
  },
  
  // Institutional memory
  {
    name: "search_past_decisions",
    description: "Search institutional memory for how similar situations were handled before",
    // ... searches checkpoint_decisions, decision_history
  },
  
  // Knowledge graph
  {
    name: "query_knowledge_graph",
    description: "Find entities and relationships relevant to the analysis",
    // ... queries entity_nodes, entity_relationships
  },
  
  // Quality history
  {
    name: "check_quality_history",
    description: "Check quality scores and trends for similar past analyses",
    // ... queries quality_scores, quality_baselines
  },
];
```

With interleaved thinking, Claude can:
1. Call `search_knowledge_base` for regulatory text
2. **Think** about what it found
3. Call `search_past_decisions` to check how similar gaps were handled before
4. **Think** about how past decisions inform the current analysis
5. Call `think` tool with a structured reflection on how this new information changes its assessment
6. Produce a revised analysis

This is the Think-Act-Think-Act pattern that makes `deep_investigate` qualitatively different from just running the same analysis with a bigger thinking budget.

---

## 5. Integration with Existing Systems

### 5.1 Prompt Builder Integration

`prompt-builder.ts` needs a minor extension to support iterative reasoning configuration:

```typescript
interface PromptBuilderConfig {
  // ... existing config
  reasoning: {
    depth: ReasoningDepth;
    iterative: boolean;              // Whether to use the reasoning loop
    tools_enabled: boolean;          // Whether to provide investigation tools
    quality_target?: number;         // Optional quality target for iteration
  };
}
```

### 5.2 Module Configuration

Every module can specify its default reasoning depth and whether iterative reasoning is recommended:

```typescript
// In module definition (e.g., amlr-gap-analysis)
{
  id: "amlr-gap-analysis",
  name: "AMLR Gap Analysis",
  // ... existing config
  reasoning: {
    default_depth: "investigate",         // Recommended depth for this module
    iterative_recommended: true,          // Show "iterative mode" toggle
    min_depth_for_iteration: "think_hard", // Don't iterate below this level
    available_tools: ["knowledge_base", "web_search", "past_decisions", "knowledge_graph"],
  }
}
```

Users can always override the default depth per session. The module definition just sets sensible defaults.

### 5.3 Quality Ratchet Integration

The Quality Ratchet should track quality improvement across iteration steps:

```sql
-- Add to quality scoring
ALTER TABLE quality_scores ADD COLUMN reasoning_depth TEXT;
ALTER TABLE quality_scores ADD COLUMN iteration_count INTEGER DEFAULT 1;
ALTER TABLE quality_scores ADD COLUMN quality_at_step_1 REAL;  -- Initial quality estimate
ALTER TABLE quality_scores ADD COLUMN quality_improvement REAL; -- Final - initial
```

Over time, this data reveals which modules benefit most from iterative reasoning and by how much — informing default recommendations and cost-benefit analysis.

### 5.4 Orchestrator Integration

The Orchestrator uses the reasoning engine for its own decisions:

- **Heartbeat signal assessment:** `think` level (single pass — fast and cheap)
- **Proposal generation:** `think_hard` with 2-step iteration (analyse + reflect)
- **Workflow plan generation:** `investigate` with full 4-step loop
- **Chain reasoning:** `investigate` — the decision to chain is important enough for iterative reasoning
- **Management reports:** `think` (structured, not complex)

The Orchestrator's Reasoning Trail (from the companion spec) captures the thinking from each iteration step.

### 5.5 Revelation Chain Storage

```sql
CREATE TABLE revelation_chains (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  module_id TEXT,
  org_id TEXT,
  
  depth_level TEXT NOT NULL,
  total_steps INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  total_cost REAL NOT NULL,
  
  -- The key revelation
  has_key_revelation INTEGER NOT NULL DEFAULT 0,
  key_revelation_summary TEXT,
  key_revelation_step INTEGER,
  key_revelation_impact TEXT,
  confidence_initial REAL,
  confidence_final REAL,
  
  -- Quality journey
  quality_initial REAL,
  quality_final REAL,
  quality_improvement REAL,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE revelation_steps (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES revelation_chains(id),
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL CHECK(step_type IN ('analyse', 'reflect', 'deepen', 'synthesise')),
  
  summary TEXT NOT NULL,
  thinking_content TEXT,              -- Extended thinking for this step
  output_content TEXT,                -- What was produced
  
  insights_gained TEXT DEFAULT '[]',  -- JSON array
  revisions_made TEXT DEFAULT '[]',   -- JSON array
  tools_used TEXT DEFAULT '[]',       -- JSON array
  
  confidence REAL,
  areas_of_uncertainty TEXT,          -- JSON array
  
  tokens_used INTEGER,
  cost REAL,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 5.6 Workspace Integration

Revelation chains are saved as files alongside their outputs:

```
~/.anton/workspace/outputs/2026-03-07/
├── amlr-gap-analysis-v2.docx                    # The final deliverable
├── amlr-gap-analysis-v2.xlsx                     # Supporting data
└── amlr-gap-analysis-v2.revelation-trail.md      # The reasoning journey
```

The revelation trail file is a human-readable Markdown document showing how the analysis evolved — useful for regulatory submissions where you need to demonstrate methodology, and for learning (junior staff can study how expert analysis develops through iteration).

---

## 6. Cost Management

Iterative reasoning uses more tokens. Cost transparency is essential:

| Depth | Typical Turns | Typical Cost (Opus) | Typical Cost (Sonnet) |
|---|---|---|---|
| `quick` | 1 | $0.05–0.15 | $0.01–0.03 |
| `think` | 1 | $0.10–0.50 | $0.03–0.10 |
| `think_hard` | 1–2 | $0.50–2.00 | $0.10–0.50 |
| `investigate` | 3–4 | $2.00–8.00 | $0.50–2.00 |
| `deep_investigate` | 4–6 | $5.00–15.00 | $1.00–5.00 |

The UI should show:
- Estimated cost before execution (based on depth and module history)
- Running cost during execution (updated per step)
- Final cost with breakdown per step
- Quality improvement vs. cost: "Iterative reasoning improved quality by 1.7 points at a cost of $4.23 additional"

**The value proposition:** A `deep_investigate` gap analysis costs ~$10 more than a single-pass `think` analysis. But if it catches a systemic gap that changes the remediation strategy, the value of that insight is measured in weeks of saved effort and reduced regulatory risk — not in API token costs.

---

## 7. Implementation Priority

**Wave 1: Extended Thinking Enhancement (with Orchestrator Phase 1)**
- Ensure `unified-llm-client.ts` supports `thinking: { type: "adaptive" }` for Opus 4.6
- Ensure `thinking: { type: "enabled", budget_tokens: N }` works for Sonnet 4.6
- Capture thinking content in existing `thinking_content` field
- Map ANTON's thinking levels to API parameters

**Wave 2: Think Tool + 2-Step Iteration (with Orchestrator Phase 2)**
- Implement the `think` tool and register it for all module executions
- Build the 2-step reasoning loop (analyse + reflect) for `think_hard`
- Capture think tool calls in Reasoning Trail
- Add reasoning depth selection to module UI

**Wave 3: Full Iterative Reasoning Engine (with Orchestrator Phase 3)**
- Build the full 4-step reasoning loop (analyse → reflect → deepen → synthesise)
- Implement `investigate` and `deep_investigate` with tool integration
- Build the Revelation Chain capture and storage
- Build the Revelation Trail UI (timeline view showing how analysis evolved)
- Integrate with Quality Ratchet for quality-across-steps tracking

**Wave 4: Investigation Tools + Self-Directed Research (with Orchestrator Phase 4)**
- Enable knowledge base search, web search, institutional memory, and knowledge graph as investigation tools
- Implement interleaved thinking for tool call chains
- Build the `deep_investigate` multi-cycle deepening loop
- Cost tracking and quality-vs-cost reporting
- Module-level defaults based on historical quality improvement data

---

## 8. UI Integration — Where the Controls Live

### 8.1 The Existing Configuration Panel

The Standard Module Workspace already has a configuration panel with: model selector, thinking level, creativity level, output formats, and knowledge sources. The iterative reasoning control integrates directly into this existing panel — it's not a separate page or mode.

**Claude Code: find the configuration panel component** (likely in or near `WorkspacePage.tsx` or the module session setup UI) and extend it. Do NOT create a separate controls surface.

### 8.2 Updated Thinking Level Selector

The existing thinking level selector shows options like `quick`, `think`, `think_hard`, `investigate`. Extend it to include the iterative reasoning dimension:

```
┌─ Reasoning Depth ──────────────────────────────────────────────┐
│                                                                 │
│  Speed ◄──────────────────────────────────────────────► Depth   │
│                                                                 │
│  ○ Quick          Single pass, fast response                    │
│  ○ Think          Single pass, moderate reasoning               │
│  ● Think Hard     + Self-critique (2 steps)         ⚡ DEFAULT │
│  ○ Investigate    Full iterative loop (4 steps)                │
│  ○ Deep Investigate  Iterative + tool research (4-6 steps)     │
│                                                                 │
│  Estimated cost: ~$1.50  |  Estimated time: ~3 min             │
│                                                                 │
│  ℹ️ Think Hard adds a self-critique step where ANTON reviews    │
│     its own analysis before delivering the final output.        │
└─────────────────────────────────────────────────────────────────┘
```

**Key UI behaviours:**

- The selector replaces the existing thinking level dropdown — it's the same control, extended with the new levels and better labelling
- Each option shows a brief plain-language description of what it actually does
- The estimated cost and time update dynamically based on the selected depth and the module's historical data (if available)
- The module's recommended default is marked with a badge (e.g., `⚡ DEFAULT` or `★ RECOMMENDED`)
- If the user selects `investigate` or `deep_investigate` for the first time, show a one-time tooltip: "This mode runs multiple reasoning passes and may take 3-10 minutes. Quality typically improves 1-2 points over single-pass mode."

### 8.3 The Revelation Trail Toggle (In Output View)

After execution, the output view needs a way to show the reasoning journey:

```
┌─ Output ────────────────────────────────────────────────────────┐
│                                                                  │
│  [📄 Final Output]  [🔍 Revelation Trail]  [💭 Thinking]       │
│                                                                  │
│  (Default tab: Final Output — the polished deliverable)         │
│  (Revelation Trail tab: the step-by-step journey, only visible  │
│   when iterative reasoning was used — hidden for single-pass)   │
│  (Thinking tab: existing extended thinking view)                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

When the user ran a single-pass (`quick` or `think`), only `Final Output` and `Thinking` tabs appear — same as today. When iterative reasoning was used (`think_hard` with reflection, `investigate`, or `deep_investigate`), the `Revelation Trail` tab appears showing the step-by-step reasoning journey from Section 3.3 of this spec.

### 8.4 Export Integration

The existing export bar (MD, DOCX, XLSX, PDF, PPTX) needs an additional option when iterative reasoning was used:

```
[Export ▼]
  ├─ Final output only (default)
  ├─ Final output + Revelation Trail
  └─ Full reasoning package (output + trail + all thinking)
```

"Final output + Revelation Trail" is particularly valuable for regulatory submissions where you want to demonstrate methodology. It appends the revelation trail as an analytical appendix to the deliverable.

### 8.5 Brief Me / Guide Me Integration

For non-workspace interaction modes:

**Brief Me:** Always uses `think` (single pass, fast). No iterative reasoning — this is the quick-answer mode and should stay fast.

**Guide Me:** After the wizard recommends a module, the reasoning depth is pre-selected based on the module's default. The user sees the recommendation but can change it before executing.

**Batch Create:** Uses the module's default depth for all items in the batch. Important: if `investigate` is selected for batch mode with 20 items, show a cost estimate prominently — 20 × $3.00 = $60 is different from a single $3.00 session.

**Workflow Builder:** Each module execution step in a workflow can have its own reasoning depth. When the Orchestrator auto-configures workflow plans, it selects appropriate depth per step (simple transform steps get `quick`, the main analysis step gets `investigate`).

---

## 9. Default Reasoning Depths — Per Module Recommendations

### 9.1 The Principle

Not every module benefits equally from iterative reasoning. A training content generator doesn't need self-critique the way a regulatory gap analysis does. The defaults should reflect the actual value of deeper reasoning for each module type.

**Three factors determine the recommended default:**

1. **Regulatory/accuracy stakes** — Will errors have compliance consequences? Higher stakes → deeper reasoning
2. **Structural complexity** — Does the analysis require cross-referencing multiple frameworks? More complexity → deeper reasoning
3. **Cost-benefit history** — Does quality actually improve with deeper reasoning for this module? If historical data shows no quality improvement from `investigate` vs `think_hard`, recommend the cheaper option

### 9.2 Default Mapping by Area

**Claude Code: update each module's configuration** (in `module.json` or equivalent in `constants.ts`) with a `reasoning_default` field. The following table defines the recommended defaults for every area:

#### Tier 1: `investigate` by default (high stakes, complex analysis)

These modules produce deliverables where errors have direct regulatory, legal, or financial consequences. Iterative reasoning with self-critique is essential.

| Area | Modules | Why |
|---|---|---|
| **Financial Crime Prevention** | AMLR Gap Analysis, BWRA Generator, Regulatory Interpretation, Sanctions Assessment, SAR/STR Drafting, Regulatory Submission Reviewer | Regulatory submissions, gap scores drive remediation budgets, citations must be accurate |
| **Legal Advisory** | Contract Review, Legal Risk Assessment, Regulatory Opinion, Litigation Analysis | Legal conclusions carry liability |
| **Audit & Assurance** | Internal Audit Report, Control Testing, Findings Assessment | Audit findings drive board decisions |
| **Risk Management** | Enterprise Risk Assessment, Risk Appetite Statement, Stress Testing Analysis | Risk ratings affect capital allocation |
| **Cybersecurity** | Security Assessment, DORA Compliance Analysis, Incident Analysis | Security gaps have breach consequences |
| **Banking & Finance** | Credit Risk Assessment, Capital Adequacy Analysis | Prudential regulatory compliance |
| **Coding Area (Tier 4)** | Coding Large discovery document, Architecture review | Governs the entire development process |

#### Tier 2: `think_hard` by default (important but less regulatory)

These modules produce important professional deliverables where quality matters, but the consequences of missing a nuance are professional rather than regulatory.

| Area | Modules | Why |
|---|---|---|
| **FCP** (continued) | Policy Writer, Training Content Creator, Action Plan Creator, Data Readiness Assessment, Vendor Assessment | Important deliverables but not direct regulatory submissions |
| **Consulting** | Engagement Proposal, Management Presentation, Stakeholder Interview Planner | Client-facing quality but not regulatory |
| **Project Management** | Project Plan, Status Report, Risk Log, RACI Matrix | Needs to be thorough but stakes are operational |
| **Strategy** | Strategy Paper, Market Analysis, Business Case | Important but errors are correctable |
| **Data & Analytics** | Data Quality Assessment, Data Governance Review | Technical assessment, not regulatory |
| **HR & People** | Competency Framework, Performance Review Template | Organisational impact but not compliance |
| **Coding Area (Tiers 2-3)** | Script Lite, Script Medium — guided flows | Code quality matters but is testable |

#### Tier 3: `think` by default (routine, lower complexity)

These modules produce useful outputs where speed matters more than exhaustive analysis. Single-pass reasoning is sufficient for most use cases.

| Area | Modules | Why |
|---|---|---|
| **Communication** | Email Drafting, Meeting Summary, Presentation Outline | Speed over depth — user will review |
| **Personal Development** | Learning Plan, Career Assessment, Skill Gap Analysis | Personal, not compliance-critical |
| **Education & Training** | Training Material, Quiz Generator, Case Study Creator | Educational content, iteratable |
| **Marketing** | Content Strategy, Campaign Brief, Social Media Plan | Creative, user reviews and adjusts |
| **Operations** | Process Documentation, SOP Writer, Checklist Generator | Structured but straightforward |
| **Coding Area (Tier 1)** | Code Review & Explain | Explanation, not analysis — speed matters |

#### Tier 4: `quick` by default (speed-critical, simple tasks)

| Modules | Why |
|---|---|
| **Brief Me** (all areas) | Quick answers by design — iterate manually via follow-ups |
| **Glossary generators**, **Template fillers** | Lookup/formatting tasks, not analytical |

### 9.3 Module Configuration Schema

```typescript
// Extend existing module definition
interface ModuleConfig {
  id: string;
  label: string;
  // ... existing fields
  
  reasoning: {
    default_depth: 'quick' | 'think' | 'think_hard' | 'investigate' | 'deep_investigate';
    recommended_depth?: string;           // Optional: different from default for power users
    iteration_supported: boolean;         // Whether this module benefits from iteration
    min_depth_for_iteration: 'think_hard' | 'investigate';  // Don't iterate below this
    max_depth: 'investigate' | 'deep_investigate';           // Cap for this module
    tools_in_investigation: string[];     // Which tools to enable for deep_investigate
    
    // Shown in UI as guidance
    depth_rationale: string;              // "This module defaults to investigate because regulatory citations must be cross-checked"
    
    // Cost guidance  
    estimated_cost_by_depth: {
      quick: { min: number; max: number };
      think: { min: number; max: number };
      think_hard: { min: number; max: number };
      investigate: { min: number; max: number };
      deep_investigate: { min: number; max: number };
    };
  };
}
```

**Example for AMLR Gap Analysis:**

```json
{
  "id": "amlr-gap-analysis",
  "label": "AMLR Gap Analysis",
  "reasoning": {
    "default_depth": "investigate",
    "recommended_depth": "investigate",
    "iteration_supported": true,
    "min_depth_for_iteration": "think_hard",
    "max_depth": "deep_investigate",
    "tools_in_investigation": ["knowledge_base", "web_search", "past_decisions", "knowledge_graph"],
    "depth_rationale": "Gap analysis requires cross-referencing multiple AMLR articles, verifying citations, and identifying systemic gaps across regulatory requirements. Iterative reasoning catches cross-article interactions that single-pass analysis misses.",
    "estimated_cost_by_depth": {
      "quick": { "min": 0.05, "max": 0.15 },
      "think": { "min": 0.10, "max": 0.50 },
      "think_hard": { "min": 0.50, "max": 2.00 },
      "investigate": { "min": 2.00, "max": 8.00 },
      "deep_investigate": { "min": 5.00, "max": 15.00 }
    }
  }
}
```

**Example for Email Drafting:**

```json
{
  "id": "email-drafting",
  "label": "Email Drafting",
  "reasoning": {
    "default_depth": "think",
    "iteration_supported": false,
    "min_depth_for_iteration": "think_hard",
    "max_depth": "think_hard",
    "tools_in_investigation": [],
    "depth_rationale": "Email drafting benefits from clear thinking but not from multi-step iteration. Users iterate via conversation follow-ups instead.",
    "estimated_cost_by_depth": {
      "quick": { "min": 0.01, "max": 0.05 },
      "think": { "min": 0.03, "max": 0.10 },
      "think_hard": { "min": 0.10, "max": 0.30 },
      "investigate": { "min": 0, "max": 0 },
      "deep_investigate": { "min": 0, "max": 0 }
    }
  }
}
```

### 9.4 Smart Defaults That Learn

The Apprentice Model already tracks which settings users prefer per module. Extend this to track reasoning depth choices and their quality outcomes:

```typescript
// Apprentice tracking (extends existing pattern tracking)
interface ReasoningDepthObservation {
  module_id: string;
  depth_selected: string;
  depth_was_default: boolean;           // Did user accept the default or change it?
  quality_score: number;
  user_satisfaction?: string;           // If rated
  cost: number;
}
```

Over time, if the data shows that users consistently override `investigate` to `think_hard` on a particular module with no quality loss, the Apprentice Model can suggest updating the default. Conversely, if users who pick `investigate` consistently get 1.5+ quality points over `think_hard` users on a specific module, the system can recommend upgrading the default.

### 9.5 Orchestrator-Triggered Reasoning Depth

When the Orchestrator triggers a module execution (Phase 2+), it selects the reasoning depth based on:

1. **Module default** — starting point
2. **Signal urgency** — high-urgency signals may warrant `investigate` even if the module default is `think_hard`
3. **PDP priorities** — if the PDP says "thorough over fast," bias toward deeper reasoning
4. **Quality history** — if this module's quality has been declining, increase depth
5. **Chain position** — the first step in a chain (which all subsequent steps depend on) gets deeper reasoning than later steps
6. **Cost budget** — if the Orchestrator's LLM budget is running low, bias toward cheaper depths

This selection logic is documented in the Orchestrator's Reasoning Trail so you can see why a particular depth was chosen.

---

## 10. Migration Path — Existing Modules

### 10.1 Phase 1: Add Defaults Without Changing Behaviour

First deployment adds the `reasoning` config to all 238 modules with the defaults from Section 9.2. **No behaviour changes** — existing sessions continue to use whatever thinking level the user had selected. The new defaults apply only to new sessions where the user doesn't override.

### 10.2 Phase 2: Enable Iteration for Tier 1 Modules

Once the 2-step reasoning loop (analyse + reflect) is built, enable it for Tier 1 modules (`investigate` default). Show the Revelation Trail tab on outputs from these modules. Users who previously selected `think_hard` continue to get single-pass unless they opt into the new depth levels.

### 10.3 Phase 3: Enable for All Modules

Once the full reasoning engine is stable, enable iteration support for Tier 2 modules and make `think_hard` do 2-step iteration by default. Tier 3 modules stay single-pass unless the user explicitly selects deeper reasoning.

### 10.4 Configuration Migration

```typescript
// For Claude Code: migration function to add reasoning config to all modules
async function migrateModuleReasoningDefaults(): Promise<void> {
  const modules = await getAllModules();
  
  for (const module of modules) {
    if (!module.reasoning) {
      const tier = getModuleTier(module.area_id, module.id);  // From Section 9.2 mapping
      const defaults = TIER_DEFAULTS[tier];
      
      await updateModuleConfig(module.id, {
        reasoning: {
          default_depth: defaults.default_depth,
          iteration_supported: defaults.iteration_supported,
          min_depth_for_iteration: defaults.min_depth_for_iteration,
          max_depth: defaults.max_depth,
          tools_in_investigation: defaults.tools,
          depth_rationale: defaults.rationale,
          estimated_cost_by_depth: defaults.costs,
        }
      });
    }
  }
}
```

---

## 11. ANTON Tasks — Iterative Reasoning as the Backbone of Autonomous Work

### 11.1 What ANTON Tasks Are

An "ANTON Task" is any work the Orchestrator initiates and manages autonomously — a gap analysis triggered by a radar signal, an overnight research chain, a scheduled compliance review, a multi-step workflow that runs while the team sleeps. These are the moments where ANTON is genuinely acting as a coworker who gets things done independently, not just responding to prompts.

The iterative reasoning engine is what makes ANTON Tasks qualitatively different from a CRON job firing off API calls. Without iterative reasoning, an autonomous gap analysis is: assemble prompt → call LLM → store output. That's a script, not a coworker. With iterative reasoning, an autonomous gap analysis is: analyse → discover a cross-article interaction you didn't initially consider → search institutional memory for how this was handled before → revise the analysis → verify the revision against the regulatory text → synthesise. That's how a professional actually works.

**The core principle: ANTON Tasks should use iterative reasoning by default, at a higher depth than human-initiated sessions, because there's no human in the loop to catch what a single pass might miss.**

### 11.2 Why ANTON Tasks Need Deeper Reasoning

When a user runs a module manually, they're present. They read the output, notice if something feels off, ask follow-up questions, redirect the analysis. The human *is* the iteration loop — they provide the self-critique and deepening through conversation.

When the Orchestrator runs a task autonomously, that human iteration loop is absent. The iterative reasoning engine replaces it. ANTON must:
- Self-critique its own work (the human isn't there to catch errors)
- Search for additional information when it's uncertain (the human isn't there to say "also check X")
- Verify its citations and cross-references (the human isn't there to spot a wrong article number)
- Decide whether the output is good enough to deliver or needs another pass (the human isn't there to say "this needs more work")

This is why ANTON Tasks should default to `investigate` minimum, and `deep_investigate` for high-stakes tasks — they need the iterative loop precisely because there's no human providing it.

### 11.3 Task Reasoning Depth by Execution Context

| Context | Reasoning Depth | Why |
|---|---|---|
| **Human-initiated, human present** | Module default (Tier 1-4) | Human provides the iteration via conversation |
| **Orchestrator-proposed, human-approved** | Module default + 1 level | Human approved but won't review line-by-line |
| **Orchestrator auto-executed (validated pattern)** | `investigate` minimum | No human in the loop — self-critique essential |
| **Orchestrator chain (multi-step)** | `investigate` for analysis steps, `think_hard` for formatting steps | Analysis steps need deepening; export/formatting steps don't |
| **Overnight / scheduled task** | `deep_investigate` for primary analysis | Maximum depth — nobody is watching, output must stand on its own |
| **Batch execution** | Module default (cost management) | 20 × deep_investigate would be expensive — but show the option |

```typescript
function getTaskReasoningDepth(
  moduleDefault: ReasoningDepth,
  executionContext: ExecutionContext
): ReasoningDepth {
  
  const DEPTH_ORDER = ['quick', 'think', 'think_hard', 'investigate', 'deep_investigate'];
  
  switch (executionContext.type) {
    case 'human_initiated':
      return moduleDefault;
      
    case 'orchestrator_approved':
      // One level deeper than default, capped at investigate
      return elevateDepth(moduleDefault, 1, 'investigate');
      
    case 'orchestrator_auto_executed':
      // Minimum investigate — no human in the loop
      return maxDepth(moduleDefault, 'investigate');
      
    case 'orchestrator_chain_analysis':
      // Minimum investigate for analysis steps
      return maxDepth(moduleDefault, 'investigate');
      
    case 'orchestrator_chain_formatting':
      // Formatting/export steps don't need deep reasoning
      return minDepth(moduleDefault, 'think_hard');
      
    case 'scheduled_overnight':
      // Maximum depth — output must stand alone
      return maxDepth(moduleDefault, 'deep_investigate');
      
    case 'batch':
      // Use module default — cost management takes priority
      return moduleDefault;
  }
}
```

### 11.4 The Autonomous Work Cycle

When the Orchestrator runs an ANTON Task, the full execution cycle looks like this:

```
1. SIGNAL DETECTED
   Orchestrator heartbeat detects actionable signal
   Reasoning: "EBA guideline published, urgency 0.91"
   
2. TASK PLANNED
   Orchestrator generates execution plan
   Reasoning: "Run gap analysis → if gaps found, chain to action plan"
   Depth selected: investigate (auto-executed, no human in loop)
   
3. PRIMARY ANALYSIS (Iterative Reasoning Engine)
   Step 1 — ANALYSE: Initial gap analysis against regulation
   Step 2 — REFLECT: "I treated articles independently but 19 and 28 cross-reference..."
   Step 3 — DEEPEN: Search knowledge base for prior crypto CDD decisions
                     Query knowledge graph for related entities
                     Check institutional memory for similar past analyses
                     → REVELATION: systemic gap across three articles
   Step 4 — SYNTHESISE: Restructured analysis around systemic finding
   Quality: 8.6 (vs estimated 7.2 without iteration)
   
4. CHAIN DECISION (Iterative Reasoning)
   Orchestrator reads output → "3 HIGH gaps found"
   Think: "Pattern VP-003 matches. Prior executions averaged 8.1 quality."
   Think: "But this analysis found a systemic gap — the action plan should 
           address the systemic issue first, not treat gaps independently."
   → Adjusts action plan input: "Lead with systemic remediation"
   
5. SECONDARY ANALYSIS (Iterative Reasoning Engine)
   Action Plan module runs with adjusted input
   Step 1 — ANALYSE: Generate remediation plan leading with systemic fix
   Step 2 — REFLECT: "Does the systemic fix actually resolve downstream gaps?"
   Step 3 — DEEPEN: Cross-reference each downstream gap against systemic fix
                     → Confirms: fixing systemic issue resolves 3 of 8 gaps
   Step 4 — SYNTHESISE: Final action plan with effort estimates
   Quality: 8.3
   
6. DELIVERY
   Outputs saved to workspace
   Assignments created for team members
   Deadlines set
   Reasoning trail complete — 2 revelation chains linked
   Narrative summary generated for morning briefing
   
7. MORNING BRIEFING
   "Overnight, I analysed the new EBA crypto CDD guidelines. The key 
   discovery was a systemic gap in how your CDD process chains through 
   to monitoring triggers — fixing this one issue addresses 3 of the 8 
   gaps I found. Action plan and assignments are ready in your workspace."
```

This is the full picture: the Orchestrator provides the *management* layer (what to do, when, why), and the Iterative Reasoning Engine provides the *thinking* layer (how to do it well, with self-correction). Together they enable autonomous work that's genuinely professional quality.

### 11.5 Long-Running Tasks and Multi-Session Reasoning

Some ANTON Tasks are too large for a single session. A comprehensive AMLR implementation review across 15 chapters might need to be broken into sub-tasks, each with its own iterative reasoning cycle, with a synthesis step that combines all sub-task outputs.

**Multi-Session Task Pattern:**

```
TASK: "Comprehensive AMLR Gap Analysis — All 15 Chapters"

Sub-task 1: Chapters 1-3 (General provisions, scope, definitions)
  → Iterative reasoning (investigate)
  → Output: partial gap matrix, 3 findings

Sub-task 2: Chapters 4-6 (CDD, beneficial ownership, PEPs)
  → Iterative reasoning (deep_investigate — this is the most complex area)
  → Output: partial gap matrix, 7 findings
  → REVELATION: CDD findings interact with Chapter 1 definitions
  → Flag for synthesis: "Re-evaluate Sub-task 1 findings in light of CDD interactions"

Sub-task 3: Chapters 7-9 (TM, reporting, record-keeping)
  → Iterative reasoning (investigate)
  → Output: partial gap matrix, 4 findings

... (sub-tasks 4-5 for remaining chapters)

SYNTHESIS TASK: Combine all sub-task outputs
  → Reads all partial gap matrices
  → Iterative reasoning (deep_investigate)
  → Step 1: Merge findings into unified matrix
  → Step 2: Reflect — check for cross-chapter interactions (flagged by Sub-task 2)
  → Step 3: Deepen — re-examine Sub-task 1 findings considering CDD interactions
             Query knowledge graph for all cross-chapter entity relationships
  → Step 4: Synthesise — final comprehensive gap matrix with systemic findings
  
TOTAL: 6 reasoning cycles, ~20 LLM calls, ~$25-40 cost
OUTPUT: Comprehensive gap analysis that no single-session could produce
```

**Implementation:**

```typescript
interface AntonTask {
  id: string;
  name: string;
  type: 'single' | 'multi_session' | 'chain';
  
  // For multi-session tasks
  sub_tasks?: AntonSubTask[];
  synthesis_config?: {
    reasoning_depth: ReasoningDepth;
    cross_reference_flags: string[];  // Insights from sub-tasks that need synthesis attention
  };
  
  // Execution context
  initiated_by: 'orchestrator_auto' | 'orchestrator_approved' | 'scheduled' | 'human';
  reasoning_depth_override?: ReasoningDepth;  // Override module defaults for this task
  
  // Progress
  status: 'planned' | 'running' | 'paused' | 'completed' | 'failed';
  sub_tasks_completed: number;
  sub_tasks_total: number;
  
  // Orchestrator integration
  proposal_id?: string;
  trail_id?: string;
  chain_id?: string;
}

interface AntonSubTask {
  id: string;
  task_id: string;
  sequence: number;
  
  module_id: string;
  input_config: object;
  reasoning_depth: ReasoningDepth;
  
  // Cross-task flags
  flags_for_synthesis: string[];     // Insights that need cross-task attention
  depends_on: string[];              // Sub-task IDs this depends on
  
  status: 'pending' | 'running' | 'completed' | 'failed';
  revelation_chain_id?: string;
  quality_score?: number;
  output_path?: string;              // Workspace path to output
}
```

### 11.6 Tool Use During Autonomous Tasks

When running ANTON Tasks at `investigate` or `deep_investigate`, the reasoning engine has access to tools — but the tool set differs for autonomous vs. human-initiated execution:

**Human-initiated sessions** can use:
- Knowledge base search
- Web search (if enabled)
- Knowledge graph queries
- Think tool

**ANTON Tasks (autonomous)** can additionally use:
- Institutional memory search (past decisions relevant to current analysis)
- Quality history lookup (how similar past analyses scored)
- Cross-session context (what other recent analyses found)
- Pattern library (validated approaches for this type of task)
- Workspace file reading (outputs from earlier steps in the chain)

These additional tools are what makes ANTON Tasks smarter than human-initiated sessions in some ways — the Orchestrator can draw on the full platform history, not just what the user remembers to provide as context.

**Tools ANTON Tasks can NEVER use autonomously:**
- External API calls (require pre-approved connection + admin override for autonomous use)
- Email sending (always requires explicit human approval, even at Stage 4)
- File writing outside the workspace
- Anything that modifies platform configuration

### 11.7 Quality Gates for Autonomous Output

Since no human is reviewing ANTON Task outputs in real-time, quality gates are automatic:

```typescript
interface TaskQualityGate {
  // Minimum quality to deliver without escalation
  delivery_threshold: number;         // Default: 7.5
  
  // Quality below this triggers automatic re-run with deeper reasoning
  retry_threshold: number;            // Default: 6.0
  
  // Maximum retries before escalating to human
  max_retries: number;                // Default: 2
  
  // Actions
  on_pass: 'deliver' | 'deliver_and_notify';
  on_retry: 'increase_depth_and_rerun' | 'escalate';
  on_fail: 'escalate_to_human' | 'park_with_explanation';
}
```

**The quality gate flow:**

```
Task output produced (quality 7.8)
  → Quality ≥ 7.5? YES → Deliver to workspace + notify user
  
Task output produced (quality 6.3)
  → Quality ≥ 7.5? NO
  → Quality ≥ 6.0? YES → Re-run with deeper reasoning (investigate → deep_investigate)
  → Second output (quality 7.6) → Quality ≥ 7.5? YES → Deliver
  
Task output produced (quality 5.1)
  → Quality ≥ 7.5? NO
  → Quality ≥ 6.0? NO → Escalate to human
  → Notification: "I attempted a gap analysis but the output quality (5.1) 
     didn't meet the threshold. I think the issue is insufficient knowledge 
     sources — the regulatory text I have may be outdated. Can you help me 
     update the knowledge sources before I retry?"
```

This is the Orchestrator being a responsible coworker: it tries to fix the problem itself (retry with deeper reasoning), but if it can't meet quality standards, it asks for help instead of delivering subpar work.

### 11.8 Database Schema for ANTON Tasks

```sql
CREATE TABLE anton_tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Task type
  type TEXT NOT NULL CHECK(type IN ('single', 'multi_session', 'chain')),
  
  -- Execution context
  initiated_by TEXT NOT NULL CHECK(initiated_by IN (
    'orchestrator_auto', 'orchestrator_approved', 'scheduled', 'human'
  )),
  proposal_id TEXT,                    -- Link to Orchestrator proposal
  trail_id TEXT,                       -- Link to Orchestrator reasoning trail
  
  -- Reasoning configuration
  reasoning_depth_override TEXT,       -- Override module defaults for this task
  quality_gate TEXT NOT NULL DEFAULT '{"delivery_threshold":7.5,"retry_threshold":6.0,"max_retries":2}',
  
  -- Progress
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN (
    'planned', 'running', 'paused', 'completed', 'failed', 'escalated'
  )),
  sub_tasks_total INTEGER NOT NULL DEFAULT 1,
  sub_tasks_completed INTEGER NOT NULL DEFAULT 0,
  current_retry INTEGER NOT NULL DEFAULT 0,
  
  -- Timing
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  estimated_duration_minutes INTEGER,
  actual_duration_minutes INTEGER,
  
  -- Cost
  estimated_cost REAL,
  actual_cost REAL,
  
  -- Output
  output_workspace_path TEXT,          -- Where the deliverable landed
  final_quality_score REAL,
  
  -- Summary
  narrative_summary TEXT,              -- "Here's what I did and what I found"
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE anton_sub_tasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES anton_tasks(id),
  sequence INTEGER NOT NULL,
  
  -- Module configuration
  module_id TEXT NOT NULL,
  input_config TEXT NOT NULL,          -- JSON: module configuration
  reasoning_depth TEXT NOT NULL,
  
  -- Dependencies
  depends_on TEXT DEFAULT '[]',        -- JSON: array of sub-task IDs
  
  -- Cross-task intelligence
  flags_for_synthesis TEXT DEFAULT '[]', -- JSON: insights for the synthesis step
  
  -- Execution
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
    'pending', 'running', 'completed', 'failed', 'skipped'
  )),
  revelation_chain_id TEXT,            -- Link to the iterative reasoning chain
  quality_score REAL,
  output_path TEXT,                    -- Workspace path
  
  started_at TEXT,
  completed_at TEXT,
  cost REAL,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 11.9 API Routes

```
GET  /api/tasks                        — List ANTON Tasks (filterable by status, initiator, date)
GET  /api/tasks/:id                    — Task detail with sub-tasks and reasoning chains
POST /api/tasks                        — Create a task manually (or via Orchestrator)
PATCH /api/tasks/:id                   — Update task (pause, resume, cancel)
GET  /api/tasks/:id/progress           — Real-time progress (for monitoring running tasks)
GET  /api/tasks/:id/reasoning          — All reasoning trails linked to this task
POST /api/tasks/:id/retry              — Manually retry a failed task
POST /api/tasks/:id/escalate           — Escalate to human review
```

### 11.10 UI — Task Monitor

Extends the existing WorkflowMonitor pattern:

```
┌──────────────────────────────────────────────────────────────────┐
│ ANTON Tasks                                                      │
│ [Running: 1]  [Completed today: 4]  [Scheduled: 2]             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 🔄 RUNNING — Comprehensive AMLR Gap Analysis                    │
│    Started: 02:15 AM  |  Progress: 3/5 sub-tasks  |  Est: 45m  │
│    Current: Chapters 7-9 (investigate mode, Step 2: Reflecting)  │
│    Quality so far: 8.4 avg across completed sub-tasks            │
│    💡 1 cross-chapter insight flagged for synthesis               │
│    [View Live] [Pause] [Cancel]                                  │
│                                                                   │
│ ✅ COMPLETED — Crypto CDD Gap Analysis + Action Plan     8:47 AM │
│    Quality: 8.6 → 8.3 (chain)  |  Cost: $4.23  |  47 min       │
│    💡 Key revelation: systemic gap across Articles 19, 28, 40   │
│    [View Output] [View Reasoning] [View Trail]                   │
│                                                                   │
│ ✅ COMPLETED — Weekly Regulatory Update                  7:00 AM │
│    Quality: 8.1  |  Cost: $1.85  |  12 min  |  Auto-executed    │
│    [View Output] [View Reasoning]                                │
│                                                                   │
│ 📅 SCHEDULED — Monthly BWRA Review              Tomorrow 2:00 AM │
│    Depth: deep_investigate  |  Est. cost: $12-18  |  Est: 90 min│
│    [Edit] [Cancel] [Run Now]                                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 11.11 Connection to Orchestrator Spec

The ANTON Task system is the execution layer for everything the Orchestrator plans:

| Orchestrator Function | ANTON Task Equivalent |
|---|---|
| Auto-executed validated pattern | Single ANTON Task with `investigate` depth |
| Workflow chain (gap → action plan) | Chain ANTON Task with linked sub-tasks |
| Scheduled recurring workflow | Scheduled ANTON Task with CRON trigger |
| Overnight comprehensive review | Multi-session ANTON Task with `deep_investigate` |
| Proactive recommendation (when approved) | Single ANTON Task initiated by Orchestrator |

**The Orchestrator decides *what* to do. The Iterative Reasoning Engine decides *how deeply* to think about it. The ANTON Task system manages the *execution lifecycle*.**

These three systems together give ANTON the ability to work overnight, chain complex analyses, discover insights that single-pass reasoning would miss, self-correct when quality is low, and deliver professional-grade output with a complete reasoning trail — all while the human team sleeps.

That's not an automation script. That's a coworker.
