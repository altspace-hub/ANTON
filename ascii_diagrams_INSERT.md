### 7-Layer Prompt System Visualization

```
╔═══════════════════════════════════════════════════════════════╗
║                    LAYER 7: TRANSPARENCY                      ║
║  "Show your reasoning step-by-step"                           ║
║  "Explain uncertainties and confidence levels"                ║
╠═══════════════════════════════════════════════════════════════╣
║                  LAYER 6: KNOWLEDGE SOURCES                   ║
║  Claude's Knowledge + Web Search + Local Documents + URLs     ║
║  (Resolved via 4-mode Knowledge Source Panel)                 ║
╠═══════════════════════════════════════════════════════════════╣
║                    LAYER 5: SKILLS LIBRARY                    ║
║  Devil's Advocate | Systems Thinking | Pragmatist            ║
║  (Reusable prompt techniques selected by user)                ║
╠═══════════════════════════════════════════════════════════════╣
║                LAYER 4: PERSONA & EXPERT ROLE                 ║
║  "You are a financial crime prevention expert with 15 years   ║
║   experience in AML compliance for Nordic banks..."           ║
╠═══════════════════════════════════════════════════════════════╣
║                   LAYER 3: MODULE EXPERTISE                   ║
║  Specific methodology for the task:                           ║
║  "AMLR Gap Analysis: Compare current state vs regulation,    ║
║   score gaps using RAG (Red/Amber/Green), prioritize..."      ║
╠═══════════════════════════════════════════════════════════════╣
║                    LAYER 2: AREA CONTEXT                      ║
║  Domain background:                                           ║
║  "Financial Crime Prevention domain includes AML, CFT,        ║
║   sanctions, transaction monitoring, customer due diligence..." ║
╠═══════════════════════════════════════════════════════════════╣
║                  LAYER 1: SYSTEM FOUNDATION                   ║
║  ANTON behavioral principles:                                 ║
║  • Accuracy over speed  • Cite all sources                    ║
║  • Flag uncertainties   • Structured outputs                  ║
╚═══════════════════════════════════════════════════════════════╝
                              ↓
                    ┌─────────────────┐
                    │  Claude API     │
                    │  (Assembled     │
                    │   Prompt)       │
                    └─────────────────┘
                              ↓
                    ┌─────────────────┐
                    │  Expert-Level   │
                    │  Output         │
                    └─────────────────┘
```

**How the layers combine (example):**

When you select "AMLR Gap Analysis" module with "Think Hard" and "Strict" creativity:

1. **Layer 1 (Foundation):** Anton's base principles loaded
2. **Layer 2 (Area Context):** FCP domain background injected
3. **Layer 3 (Module):** Gap analysis methodology added
4. **Layer 4 (Persona):** "You are an AMLR compliance expert..."
5. **Layer 5 (Skills):** User adds "Devil's Advocate" skill → challenges assumptions
6. **Layer 6 (Knowledge):** User's local policy PDF (60k tokens) + Claude knowledge + web search enabled
7. **Layer 7 (Transparency):** "Show your thinking" enabled

**Result:** ~80k token prompt combining all layers → sent to Claude Opus 4.6 → expert-level gap analysis returned.

---

### 5-Layer Cross-Workflow Intelligence Funnel Visualization

```
┌─────────────────────────────────────────────────────────────┐
│   LAYER 1: RAW WORKFLOW OUTPUTS                             │
│   All user sessions across all modules and areas            │
│   • 500 sessions  • 12,000 messages  • 8.5M tokens          │
└─────────────────────────────────────────────────────────────┘
                          ↓
              ┌───────────────────────┐
              │   EXTRACTION PROCESS  │
              │   (LLM-powered)       │
              └───────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│   LAYER 2: KNOWLEDGE ATOMS                                  │
│   Extracted facts, insights, conclusions                    │
│   • 3,200 atoms  • 7 types  • Auto-tagged                   │
│                                                             │
│   Example atoms:                                            │
│   • "AMLR Article 8 requires annual BWRA" (fact)           │
│   • "Most banks struggle with cross-border screening"       │
│     (insight)                                               │
│   • "Client lacks adequate TM coverage for PEPs"            │
│     (conclusion)                                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
              ┌───────────────────────┐
              │   ENTITY RECOGNITION  │
              │   (NER + linking)     │
              └───────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│   LAYER 3: KNOWLEDGE GRAPH                                  │
│   Entities and relationships                                │
│   • 850 entities  • 11 types  • 2,400 relationships         │
│                                                             │
│   Example graph:                                            │
│   (Client: Nordea) ──implements──> (Control: TM System)    │
│   (Control: TM System) ──monitors──> (Risk: PEP Exposure)  │
│   (Risk: PEP Exposure) ──regulated_by──> (Reg: AMLR Art 13)│
└─────────────────────────────────────────────────────────────┘
                          ↓
              ┌───────────────────────┐
              │   PATTERN DETECTION   │
              │   (5 detector types)  │
              └───────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│   LAYER 4: DETECTED PATTERNS                                │
│   Correlations, gaps, trends, cascades, convergences        │
│   • 45 patterns detected  • 12 high severity                │
│                                                             │
│   Example patterns:                                         │
│   • Temporal: "Every BWRA followed by TM update within 72h" │
│   • Gap: "No crypto asset sessions in 90 days"             │
│   • Trend: "Sanctions queries up 300% this month"           │
└─────────────────────────────────────────────────────────────┘
                          ↓
              ┌───────────────────────┐
              │   SYNTHESIS & ALERTS  │
              └───────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│   LAYER 5: ACTIONABLE INTELLIGENCE DASHBOARD                │
│   Strategic insights delivered to users                     │
│                                                             │
│   Dashboard widgets:                                        │
│   • 🚨 High-Priority Patterns (12 require action)           │
│   • 📊 Knowledge Graph Visualization (850 nodes)            │
│   • 🎯 Coverage Gaps (3 areas under-analyzed)               │
│   • 📈 Quality Trends (average score: 87/100, +3 vs month)  │
│   • 🧠 Institutional Memory (142 checkpoint decisions)      │
│   • 🤖 Apprentice Progress (5 modules at Supervised stage)  │
└─────────────────────────────────────────────────────────────┘
```

**The power of the funnel:**

- **Layer 1 (Raw):** 8.5M tokens of unstructured output
- **Layer 2 (Atoms):** 3,200 structured knowledge pieces
- **Layer 3 (Graph):** 850 entities with 2,400 relationships
- **Layer 4 (Patterns):** 45 actionable insights
- **Layer 5 (Dashboard):** 6 strategic recommendations

**Compression ratio:** 8.5M tokens → 6 strategic actions = **99.9% signal extraction**

**Value:** The system learns from ALL your work, not just individual sessions. Every analysis enriches the knowledge base. Over time, the intelligence compounds.
