# openEXPERT / ANTON — Platform Expansion: Master Specification

> **Audience:** Claude Code
> **Purpose:** Complete implementation guide for three expansion tracks: (1) General professional area expansion, (2) Regional/Global South additions, and (3) Bottom-of-Pyramid areas for farmers, vendors, and informal economy workers.
> **First step for Claude Code:** Read this entire document, then read the companion files `EXPANSION_NEW_AREAS_SPEC.md` and `EXPANSION_SKILLS_PERSONAS_SPEC.md`. Then explore the codebase to understand existing area/module/skill/persona structure before implementing anything.

---

## 1. Context: Current State of the Platform

The platform currently has:
- **41 areas** in code (`constants.ts` AREAS array) — but only **29 documented** in the whitepaper
- **238 modules** across those areas
- **~20 personas** in the persona library
- **~15 skills** in the skills library
- **12 undocumented areas** that exist in code but are not in whitepaper (identify these first!)

### Depth Distribution (Current)
| Depth | Areas | Module Count |
|-------|-------|-------------|
| DEEP (15+) | FCP (23), Legal (12), Audit (12), Project Mgmt (12), Banking (10) | 69 total |
| GOOD (8-11) | ESG (11), Risk (8), Data (8), Operations (8) | 35 total |
| MODERATE (6-7) | Startups (7), Strategy (6), HR (6), Software (6), Accounting (7) | 32 total |
| THIN (4-5) | 15 areas including Consulting (5), Cyber (5), Insurance (5), Healthcare (5), Real Estate (4), Nonprofit (4) | ~72 total |

**Critical observation:** FCP has 23 modules; 15 areas have only 4-5 modules. The platform looks FCP-heavy with thin coverage elsewhere.

---

## 2. Three Expansion Tracks

### Track A: General Professional Expansion
**Goal:** Bring the platform from "FCP-focused with some breadth" to "genuinely comprehensive professional platform."
- Add ~12 new professional areas (~75 modules)
- Deepen ~15 existing thin areas (~85 additional modules)
- **Total Track A: ~160 new modules**

### Track B: Regional/Global South Expansion
**Goal:** Remove EU-centric blind spots. Make platform relevant for Africa, Middle East, South Asia.
- Add Islamic Finance area (8-10 modules)
- Add Mobile Money & Digital Finance area (6-8 modules)
- Add Microfinance & Financial Inclusion area (6 modules)
- Expand FCP with Hawala/IVTS, TBML, Cash Economy modules (+9 modules)
- Add 11+ jurisdictional skills (RBI, SAMA, CBN, SBP, etc.)
- Add 14 regional personas
- **Total Track B: ~40 new modules + 11 skills + 14 personas**

### Track C: Bottom-of-Pyramid Expansion
**Goal:** Extend platform to serve smallholder farmers, micro-businesses, informal economy workers — paired with smaller AI models.
- Add 13 new BoP expert areas (~100 modules)
- Design for Haiku/Ollama model tiers (not just Opus/Sonnet)
- WhatsApp/Voice/SMS delivery channels (reference architecture)
- **Total Track C: ~100 new modules + model tier architecture**

### Combined Totals
| Metric | Current | After Expansion |
|--------|---------|-----------------|
| Expert Areas | 41 (29 documented) | ~68 |
| Total Modules | 238 | ~538 |
| Skills | ~15 | ~55 |
| Personas | ~20 | ~65 |
| Addressable Market | ~50M professionals (EU/developed) | ~3B+ (global) |

---

## 3. Implementation Priority

### Phase 1: Critical Gaps (Weeks 1-4)
**Why first:** Removes "#1 criticism: too thin outside FCP" — and enables GitHub first impressions.

1. **Deepen Cybersecurity** 5→12 modules (CRITICAL — DORA alone justifies)
2. **Deepen Investment & Asset Management** 4→10 modules
3. **Deepen Client Consulting** 5→10 modules
4. **NEW: Tax & Transfer Pricing** area (8 modules) — ~30M professionals globally
5. **NEW: Marketing & Digital Marketing** area (8 modules) — ~15% of knowledge workers

### Phase 2: Regional Expansion (Weeks 5-8)
**Why second:** Opens the platform to the Global South — massive market signal.

1. **NEW: Islamic Finance & Banking** area (8-10 modules) — $6T industry
2. **EXPAND FCP:** Hawala/IVTS modules (+3), TBML modules (+3), Cash Economy (+3)
3. **Add Jurisdictional Skills:** RBI, SAMA, CBN, SBP, CBUAE, CBK, BoG, BNM, HKMA, MAS, BSP
4. **Add Regional Personas:** 14 new personas (see EXPANSION_SKILLS_PERSONAS_SPEC.md)

### Phase 3: Professional Services (Weeks 9-12)
1. **Deepen Insurance** 5→11 modules (Solvency II + Takaful)
2. **Deepen Healthcare** 5→12 modules
3. **Deepen Accounting** 7→12 modules (+ AAOIFI for Islamic)
4. **NEW: Sales & Business Development** area (6 modules)
5. **NEW: Product Management** area (6 modules)
6. **NEW: Data Privacy & Protection** area (6 modules)
7. **NEW: Mobile Money & Digital Finance** area (6-8 modules)
8. **NEW: Microfinance & Financial Inclusion** area (6 modules)

### Phase 4: Bottom of Pyramid (Weeks 13-16)
1. **NEW: Smallholder Farming Expert** area (8 modules)
2. **NEW: Micro-Business Expert** area (8 modules)
3. **NEW: Personal Finance & Savings Expert** area (8 modules)
4. **NEW: Workers' Rights Expert** area (8 modules)
5. **NEW: Land & Property Rights Expert** area (8 modules)
6. Model tier architecture (Ollama compatibility verification)
7. Reference WhatsApp bot (example implementation)

### Phase 5: Broader Professions + Remaining BoP (Weeks 17-20)
1. **NEW: Government & Public Administration** area (6 modules)
2. **NEW: Design (UX/UI/Service)** area (5 modules)
3. **NEW: Journalism & Content Writing** area (5 modules)
4. **NEW: Livestock & Poultry Expert** area (8 modules, BoP)
5. **NEW: Community Health Expert** area (8 modules, BoP)
6. **NEW: Education & Literacy Expert** area (8 modules, BoP)
7. **NEW: Consumer Protection Expert** area (8 modules, BoP)
8. **NEW: Government Services Navigator** area (8 modules, BoP)
9. Remaining BoP areas and deepening

---

## 4. Architecture Decisions for Claude Code

### 4.1 Module Structure (Unchanged)
Every new module follows the exact same structure as existing modules:

```
/areas/{area-id}/modules/{module-id}/
  module.json          — Configuration, guided inputs, defaults
  system-prompt.md     — The seven-layer prompt
```

The module.json format is identical to existing modules. See AMLR Gap Analysis as reference.

### 4.2 Model Tier System (NEW)

**Current state:** All modules default to Claude Opus 4.6 as primary model.

**New requirement:** Modules should support a `modelTier` property in module.json:

```json
{
  "modelTier": {
    "recommended": "haiku",
    "minimum": "ollama-llama-8b",
    "professional": "sonnet",
    "notes": "This module works well with smaller models when expert prompts are loaded. Voice-first delivery supported."
  }
}
```

**Model tier definitions:**
| Tier | Models | Use Case | Connectivity |
|------|--------|----------|-------------|
| `ollama-local` | Llama 3.1 8B, Mistral 7B, Phi-3 Mini, Gemma 2B | Offline/air-gapped, BoP | No internet needed |
| `haiku` | Claude Haiku 4.5 | BoP with basic internet, cost-sensitive | Low bandwidth OK |
| `sonnet` | Claude Sonnet 4.5/4.6 | Professional use, complex reasoning | Standard internet |
| `opus` | Claude Opus 4.5/4.6 | Consulting-grade, maximum quality | Full internet |

**Implementation note:** This is additive — existing modules don't need to change. New BoP modules should specify their recommended tier. The UI should show the tier recommendation. The actual model selection remains user's choice.

### 4.3 BoP Module Prompt Design

BoP modules need different prompt engineering than professional modules:

**Professional module prompts (existing):**
- Assume literate, educated user
- Complex output structures (matrices, frameworks, reports)
- Technical terminology expected
- Long-form outputs acceptable
- English as primary language

**BoP module prompts (new):**
- Assume semi-literate or non-expert user
- Simple, actionable output (short paragraphs, numbered steps)
- Plain language, no jargon
- Short responses (under 300 words typically)
- Voice-friendly (can be read aloud by TTS)
- Must include: "When to seek professional help" warning where relevant
- Must include: jurisdiction awareness (different rules in different countries)

**Example prompt header for BoP modules:**
```markdown
You are an expert advisor helping a {persona} in {jurisdiction}.

IMPORTANT PRINCIPLES:
- Use simple, clear language. Avoid jargon.
- Keep responses SHORT (under 300 words unless the user asks for more).
- Use numbered steps for any instructions.
- Always mention when the user should seek professional help.
- Be culturally sensitive and respectful.
- If you're unsure about local regulations, say so clearly.
- Never give medical diagnoses or specific legal advice — always refer to professionals.
```

### 4.4 Guided Inputs for BoP Modules

BoP guided inputs should be simpler than professional modules:
- Maximum 5 fields (vs. 7+ for professional modules)
- Use `select` over `text` where possible (easier on mobile)
- Include a `jurisdiction` field on every BoP module
- Include a `language` preference field

**Example (Micro-Business Expert — Pricing & Profit Calculator):**
```json
{
  "guidedInputs": [
    {"id": "business_type", "label": "What type of business?", "type": "select", "options": ["Shop/Kiosk", "Market stall", "Food vendor", "Tailor/Craftsperson", "Service provider", "Other"], "required": true},
    {"id": "jurisdiction", "label": "Country", "type": "select", "options": ["Kenya", "Nigeria", "India", "Pakistan", "Ghana", "Tanzania", "South Africa", "Other"], "required": true},
    {"id": "question", "label": "What do you need help with?", "type": "text", "placeholder": "e.g., How much should I charge for my products?", "required": true}
  ]
}
```

### 4.5 Area Categories (Updated)

Current areas are categorised in the UI. New categories needed:

```typescript
// Existing categories
"Core Professional Services"     // FCP, Legal, Audit, Consulting, Banking, Risk, Data, ESG, Cyber, Investment
"Business Operations"            // PM, Strategy, Operations, HR, Software, Accounting, Insurance, Comms
"Growth & Learning"              // Startups, Academic, Personal Development
"Specialized Domains"            // Branding, Education, Healthcare, Manufacturing, Consumer Legal, Procurement, Real Estate, Nonprofit

// NEW categories
"Financial Inclusion"            // Islamic Finance, Mobile Money, Microfinance, Personal Finance (BoP), Credit Navigator (BoP)
"Farming & Agriculture"          // Smallholder Farming, Livestock & Poultry
"Small Business & Enterprise"    // Micro-Business, Artisan & Craft, Food Business
"Rights & Governance"            // Workers' Rights, Land Rights, Consumer Protection, Government Services
"Community Services"             // Community Health, Education & Literacy
```

### 4.6 Skills Architecture for Jurisdictions

Jurisdictional skills are the HIGHEST ROI addition — one skill enhances ALL modules in an area.

**Skill format (existing pattern):**
```
/skills/{skill-id}/
  skill.json           — Metadata
  skill-content.md     — The actual knowledge
```

**New jurisdictional skill structure:**
```json
{
  "id": "jurisdiction-india-rbi",
  "label": "India — Reserve Bank of India (RBI)",
  "category": "jurisdiction",
  "applicableAreas": ["banking", "fcp", "islamic-finance", "mobile-money", "microfinance"],
  "description": "Indian financial regulatory framework: RBI regulations, PMLA, FEMA, SEBI. Covers banking licensing, AML/CFT requirements, digital payment regulations, microfinance oversight.",
  "tags": ["india", "rbi", "asia", "developing-economy"]
}
```

**Skill content should include:**
- Regulatory authority name and mandate
- Key regulations and their requirements
- Licensing/registration requirements
- AML/CFT reporting obligations
- Consumer protection rules
- Key terminology unique to this jurisdiction
- Useful links/references

---

## 5. Quality Principles for All New Modules

These apply equally to professional and BoP modules:

1. **Reality-based tasks** — every module represents work professionals (or people) actually do regularly
2. **Expert-level prompts** — methodology from 10+ years practitioners, not textbook theory
3. **Structured outputs** — match real deliverables people actually need
4. **Cross-area linking** — 3-5 "where to take it next" references per module
5. **Guided inputs** — capture essential context (3-5 fields for BoP, 5-7 for professional)
6. **Jurisdictional awareness** — never assume EU/US as default
7. **Honest scope** — explicit about what the module can and cannot do
8. **Practitioner language** — precise professional terminology (or plain language for BoP)

---

## 6. Files in This Specification Set

| File | Contents |
|------|----------|
| `EXPANSION_MASTER_SPEC.md` | This file — overview, architecture, priorities |
| `EXPANSION_NEW_AREAS_SPEC.md` | Detailed specs for every new area and module |
| `EXPANSION_SKILLS_PERSONAS_SPEC.md` | All new skills and personas with full definitions |

**Claude Code implementation order:**
1. Read all three files completely
2. Explore existing codebase structure
3. Implement Phase 1 (deepening existing thin areas + Tax + Marketing)
4. Implement Phase 2 (Islamic Finance + FCP expansion + jurisdictional skills)
5. Implement Phase 3 (remaining professional areas)
6. Implement Phase 4 (BoP areas + model tier architecture)
7. Implement Phase 5 (remaining areas)

---

## 7. What NOT to Build

- **No mobile app** — openEXPERT is the expertise layer, not the delivery layer
- **No WhatsApp infrastructure** — provide a reference bot only (example code)
- **No hosting/billing** — NGOs/partners handle this
- **No user management for BoP** — that's the distribution partner's job
- **No translations** — architecture must be i18n-ready, but actual translations are community-contributed
- **No separate codebase** — everything integrates into the existing ANTON platform
