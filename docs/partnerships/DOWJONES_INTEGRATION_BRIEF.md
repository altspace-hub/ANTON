# ANTON × Dow Jones Risk & Compliance — Integration Brief
**For:** Dow Jones Risk & Compliance enterprise/partnership team
**From:** FutureChain AB / openEXPERT
**Date:** March 2026
**Status:** Partnership Proposal — Demonstration Grade Integration Complete

---

## What is ANTON?

ANTON (openEXPERT) is an open-source AI professional platform built by FutureChain AB (Sweden), designed for Financial Crime Prevention (FCP) professionals at Nordic and EU financial institutions.

**Platform profile:**
- 65+ AI-powered FCP modules including Sanctions Advisory, EDD Structurer, SAR Narrative Builder, Compliance Gap Assessor, and Counsel's Desk (legal research)
- Used by Tier 1 banks, payment institutions, and specialised FCP consultancies
- EU-native stack meeting EU data sovereignty requirements
- Apache 2.0 open-source — preferred by regulated institutions uncomfortable with proprietary AI lock-in
- Air-gapped / on-premise deployment available for public sector and central bank use

---

## Why Dow Jones R&C?

ANTON's FCP modules currently use AI knowledge and regulatory knowledge packs for sanctions analysis. For production compliance use, this must be grounded in **real-time, authoritative screening data** — the kind of comprehensive, continuously-updated global database that only Dow Jones R&C provides.

The integration delivers:

1. **Real-time screening in every sanctions advisory session** — analyst asks about an entity → ANTON screens against 50+ lists simultaneously → AI reasons over live DJ results in its compliance opinion
2. **PEP-aware EDD** — 1.4M+ PEP database with tier classification and political exposure history drives the EDD depth recommendation
3. **Adverse media-informed Counsel's Desk** — legal research sessions include DJ adverse media context alongside regulatory analysis
4. **Ongoing monitoring with AI interpretation** — DJ watchlist change alerts trigger ANTON Proactive Intelligence insights, which auto-brief the compliance team
5. **AMLR Art. 22/16 compliance evidence** — every screening generates a timestamped reference ID that documents compliance with AMLR real-time screening and PEP EDD obligations

---

## AMLR Alignment — The Regulatory Urgency

AMLR (EU Anti-Money Laundering Regulation 2024/1624) enters full enforcement in July 2027. Article 16 mandates real-time screening against designated persons lists. Article 22 mandates enhanced due diligence for PEPs. Article 40 mandates ongoing monitoring.

ANTON users are currently assessing their AMLR compliance gaps. The three questions they ask about screening in every AMLR gap assessment session are:

1. *"Which lists do we screen against, and how current is our data?"*
2. *"How do we demonstrate we identified PEPs at the point of onboarding?"*
3. *"What is our process when a monitored entity is added to a list?"*

DJ R&C provides the authoritative answer to all three. ANTON provides the compliance intelligence layer that turns those answers into documented workflows, gap assessments, and board-ready risk opinions.

---

## How DJ Data Enters the ANTON Prompt

ANTON uses a 10-layer prompt architecture. DJ screening results are injected at **Layer 2d** — positioned alongside the Roaring entity layer and before the user's session context:

```
Layer 2b: Active Regulatory Knowledge Packs (AMLR 2024, EU Sanctions, etc.)
Layer 2c: Roaring Entity Data (Swedish registry, UBO chain)
Layer 2d: DOW JONES SCREENING DATA [Live]                     ← HERE
          Entity: John Smith
          Risk Score: HIGH | Ref: DJ-2024-00847-XK
          Sanctions: CLEAR ✓
          PEP: STRONG MATCH — T2 PEP
               Former Municipal Councillor, Gothenburg 2018-2022
          Adverse Media: 2 articles (Financial Crime, Fraud)
               2024-11: Swedish prosecutor investigation opened
          SOE: No government linkage ✓
          AMLR: Art. 22 (PEP EDD) + Art. 40 (ongoing monitoring)
Layer 3: User document context
```

When the AI generates a compliance opinion, it cites the DJ reference ID and screening timestamp as audit evidence — creating a documented compliance record at the point of decision.

---

## Endpoints ANTON Uses

| Endpoint | Purpose | AMLR Article |
|---|---|---|
| `POST /screen` | Real-time entity screen (sanctions + PEP + adverse media) | Art. 16, Art. 22 |
| `POST /batch` | Portfolio-level screening (up to 100 entities) | Art. 16 |
| `GET /entity/:id` | Full entity profile for a DJ match | Art. 22, 23 |
| `GET /pep/:id` | PEP detail — position history, family, associates | Art. 22 |
| `GET /adverse-media` | Active adverse media search beyond screening | Art. 13 |
| `POST /monitor` | Register entity for ongoing watchlist monitoring | Art. 40 |
| `GET /alerts/:sessionId` | Retrieve monitoring alerts for a session | Art. 40 |

**Webhook:** `POST /webhooks/inbound/dowjones` — receives real-time watchlist change notifications from DJ. These are processed by ANTON's event-workflow-processor, which creates Proactive Intelligence alerts and (optionally) auto-opens a Counsel's Desk session with alert context pre-loaded.

**Expected call volume:** Per-session model for individual screens (5-20/day per power user). Batch portfolio screens: weekly or monthly (50-500 entities). Ongoing monitoring: event-driven (only fires when DJ notifies a change).

---

## Technical Implementation

- **Connector:** `server/services/dowjones-connector.ts` — full TypeScript client with OAuth 2.0, retry logic, rate limiting
- **Routes:** `server/routes/dowjones.ts` — 9 REST endpoints
- **Frontend:** `DJScreeningPanel.tsx` — rich screening result component with per-list accordions, adverse media timeline, PEP profile tree
- **Pages:** `DJScreeningPage.tsx` — enterprise screening workspace with batch screen, monitoring dashboard, audit log
- **Mock layer:** If `DOWJONES_API_KEY` is not set, all functions return structurally identical mock data — demo works without credentials
- **Prompt injection:** `buildDJScreeningLayer()` in `prompt-builder.ts` — Layer 2d injection function

**To go live:** Set `DOWJONES_API_KEY=your-oauth-credentials` in `.env`. Configure webhook URL to `https://[domain]/webhooks/inbound/dowjones`. Zero code changes needed.

---

## The Nordic/EU Advantage

ANTON's user base is Nordic and European financial institutions — exactly the market most affected by AMLR enforcement. These institutions need:
- EU-domiciled AI platform (data sovereignty) → ANTON (FutureChain AB, Sweden)
- Comprehensive global screening (not just EU/UN lists) → DJ R&C

The combination creates a complete AMLR compliance stack:
- **Regulatory framework:** AMLR knowledge packs in ANTON
- **Nordic entity data:** Roaring (Swedish registry + UBO)
- **Global screening:** Dow Jones R&C
- **AI compliance intelligence:** ANTON modules + Counsel's Desk

No other vendor offers this complete stack with EU-native data sovereignty.

---

## Proposed Next Steps

1. **API sandbox access** — credentials for the DJ R&C sandbox/test environment
2. **Webhook configuration** — test endpoint for watchlist change notifications
3. **Technical integration call** — 60 minutes with DJ engineering + FutureChain engineering
4. **Joint pilot** — Nordic Tier 2 bank or FCP consultancy (Advisense relationship available)
5. **AMLR co-positioning** — Joint content: "Art. 22 PEP compliance in the AMLR era: how ANTON + DJ R&C create the audit trail"
6. **Partnership structure** — Revenue share, data reseller agreement, or reference partnership

---

*Demo available at: `/demo/data-partnerships` (Scene 2 — Sanctions Alert, Scene 3 — Combined EDD)*
*Technical questions: daniel@futurechain.se*
