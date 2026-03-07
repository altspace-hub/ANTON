# ANTON × Roaring — Integration Brief
**For:** Roaring technical and partnership team
**From:** FutureChain AB / openEXPERT
**Date:** March 2026
**Status:** Partnership Proposal — Demonstration Grade Integration Complete

---

## What is ANTON?

ANTON (openEXPERT) is an open-source AI professional platform built by FutureChain AB (Sweden), designed for Financial Crime Prevention (FCP) consultants, compliance officers, lawyers, and financial supervisory authorities.

**Platform profile:**
- 65+ AI-powered FCP modules (AML gap analysis, sanctions advisory, EDD structuring, SAR narrative builder, risk assessment)
- Used by Nordic financial institutions and FCP consultants at Advisense and similar firms
- EU-native stack: FutureChain AB (Sweden) + Mistral AI (France) as primary model option
- Apache 2.0 open-source — zero licensing cost for institutions
- Local/on-premise deployment available — no data leaves the institution

---

## Why Roaring?

ANTON's FCP modules currently reason over regulatory frameworks using AI knowledge and uploaded documents. The missing link is **live, structured entity data** — company registry facts, UBO chains, and sanctions cross-checks that are authoritative, machine-readable, and fresh.

Roaring provides exactly this for Swedish and Nordic entities. The integration would:

1. **Complete the EDD workflow** — analyst enters a company name → ANTON automatically fetches Roaring data → AI reasons over live registry facts, not AI-hallucinated entity data
2. **Ground the BWRA (Business-Wide Risk Assessment) module** — financial health, ownership complexity, and sanctions status for the institution's entire customer portfolio
3. **Enhance SAR narrative generation** — verified identity data, UBO chains, and beneficial owner flags appear directly in the AI-generated narrative
4. **Enable automated customer onboarding screening** — new client onboarding triggers Roaring lookup → risk score → auto-EDD or auto-pass

---

## Endpoints ANTON Uses

| Endpoint | Purpose | Expected calls |
|---|---|---|
| `GET /company/:query` | Company lookup by name or org number | Per FCP session with a named entity |
| `GET /company/:orgNumber/beneficial-owners` | Full UBO chain (5-level recursion) | Per EDD/KYC session |
| `GET /company/:orgNumber/board` | Board members + signatories | Per EDD session |
| `GET /company/:orgNumber/sanctions-screen` | EU/UN/national sanctions cross-check | Per CDD session |
| `GET /company/:orgNumber/financial-risk` | Credit rating, payment remarks, revenue data | Per BWRA session |
| `POST /company/batch-screen` | Portfolio-level screening (100 entities max) | Periodic automated runs |

**Expected call volume:** Per-session model, not bulk. Average 3-5 API calls per FCP session that involves a named entity. A typical consultant running 5-10 sessions/day = 15-50 API calls/day. Portfolio screening runs: weekly, ~50-500 entities.

---

## How Roaring Data Enters the ANTON Prompt

ANTON uses a 10-layer prompt architecture. Roaring data is injected at **Layer 2c** — the entity context layer — positioned between the regulatory knowledge packs (Layer 2b) and the user's document context (Layer 3):

```
Layer 2b: Active Regulatory Knowledge Packs (AMLR 2024, EU Sanctions, etc.)
Layer 2c: ROARING ENTITY DATA [Live]                          ← HERE
          Company: Acme Holdings AB (556123-4567) — ACTIVE
          UBO: John Smith (67% via Panama Holdings) — PEP FLAG
          Board: 3 members — 1 PEP flag
          Sanctions: Clear across 4 lists
          Financial: MEDIUM risk — revenue declining 2y
          Risk Score: 58/100
Layer 3: User document context (uploaded policies, client documents)
```

This means the AI reasons over **live registry data** when drafting EDD opinions, SAR narratives, or BWRA sections — not over AI-generated or hallucinated entity facts.

---

## What This Looks Like for the End User

**Scenario: EDD workflow**

1. Compliance officer opens ANTON's "Enhanced Due Diligence" module
2. Types: *"I need to assess Acme Holdings AB (556123-4567)"*
3. ANTON automatically calls Roaring (background, 200ms)
4. AI receives: company profile + UBO chain (PEP flag on John Smith via indirect ownership) + sanctions clear
5. AI generates: structured EDD opinion citing AMLR Art. 22 (PEP EDD), with specific ownership chain analysis, risk score rationale, and recommended actions
6. Compliance officer sees: a professional EDD opinion that would have taken 2 hours to write manually — completed in 45 seconds, with live data from Roaring cited

---

## Technical Implementation

- **Connector:** `server/services/roaring-connector.ts` — full TypeScript client with retry logic, rate limiting, and graceful degradation
- **Routes:** `server/routes/roaring.ts` — 7 REST endpoints exposing Roaring data to the frontend
- **Frontend:** `RoaringEntityCard.tsx` — visual entity card with UBO tree, risk meter, board members, financial risk
- **Pages:** `RoaringSearchPage.tsx` — full search + batch screening workspace
- **Mock layer:** If `ROARING_API_KEY` is not set, all functions return structurally identical mock data labelled `"source": "mock_demo_data"`

**To go live:** Set `ROARING_API_KEY=your-api-key` in `.env`. Zero code changes needed.

---

## Mutual Value Proposition

| ANTON gains | Roaring gains |
|---|---|
| Live, authoritative Swedish entity data in every FCP session | Deep embedding in the compliance workflow where data is actually used |
| Compliance-grade UBO chains (not scraped data) | Reference client: Nordic FCP consultants + financial institutions |
| Sanctions/PEP cross-checks grounded in registry data | AMLR-positioned use case (Art. 12, 22, 40) — high regulatory urgency |
| FCP workflow-aware data consumption (not bulk API) | Joint case study: "How Roaring powers AMLR compliance" |

**The combination is unique:** Roaring provides the authoritative registry data. ANTON provides the compliance intelligence and AI reasoning layer. Together, they produce compliant EDD opinions from raw org numbers in under 60 seconds. Neither can fully serve this use case alone.

---

## Proposed Next Steps

1. **Sandbox API access** — 30-day sandbox key for integration testing
2. **Technical review call** — 45 minutes with Roaring engineering + FutureChain engineering
3. **Joint pilot** — One Nordic FCP consultancy (Advisense or similar) uses the integrated product for 60 days
4. **Co-case study** — "AMLR Article 22 compliance in 60 seconds: Roaring + ANTON"
5. **Partnership agreement** — Revenue share or data partnership structure to be discussed

---

*Demo available at: `/demo/data-partnerships` (Scene 1 — Customer Onboarding)*
*Technical questions: daniel@futurechain.se*
