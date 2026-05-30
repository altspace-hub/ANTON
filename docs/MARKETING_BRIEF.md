# ANTON · FutureChain · The Apps

**Marketing source-of-truth for Claude Design**
v1.0 · 2026-05-24 · `openexpert` v0.7.5

This document is the canonical brief for a marketing deck / landing page covering ANTON, FutureChain, and the four mobile apps. Everything below is pulled from the live codebase as of 2026-05-24. Numbers, feature lists, and architecture statements are accurate to that date.

---

## 0. Brand assets

### Logos

**Primary marks**

| Asset | Path | Format | Notes |
|---|---|---|---|
| **ANTON mark** | `public/anton-logo.svg` | SVG, 32×32 | Rounded-square (8px radius), `#0D7D6C` fill, white "A" in Inter Bold 18pt. The primary brand mark. Locked across all themes. |
| **AdviSense mark** | `public/advisense-logo.svg` | SVG | Sister brand for advisory engagements. |
| **FutureChain mark** | `design_handoff_companion_app/from_claude_design/uploads/fc logo.png` | PNG | Coloured FC mark. |
| **FutureChain mark, white** | `design_handoff_companion_app/from_claude_design/uploads/fc logo white.png` | PNG | For dark surfaces. |
| **FTC globe** | `design_handoff_companion_app/from_claude_design/uploads/ftc logo globe.png` | PNG | The globe / network glyph that pairs with the FC mark. |

**Live app launcher icons (from each app's Android project)**

Use these as the canonical app icons in any mockup or marketing strip — they're the exact bits installed on customers' phones, at every Android density.

| App | xxxhdpi (192px) | Adaptive foreground | Adaptive background |
|---|---|---|---|
| **Companion** (teal) | `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` | `android/app/src/main/res/drawable/ic_launcher_background.xml` |
| **Business** (blue) | `android-business/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | `android-business/.../drawable-v24/ic_launcher_foreground.xml` | `android-business/.../drawable/ic_launcher_background.xml` |
| **Pay** (sunrise) | `android-pay/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | `android-pay/.../drawable-v24/ic_launcher_foreground.xml` | `android-pay/.../drawable/ic_launcher_background.xml` |
| **Comm** (navy + teal) | `android-comm/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | `android-comm/.../drawable-v24/ic_launcher_foreground.xml` | `android-comm/.../drawable/ic_launcher_background.xml` |

Every density also exists (`mdpi` 48px / `hdpi` 72px / `xhdpi` 96px / `xxhdpi` 144px / `xxxhdpi` 192px) plus round variants (`ic_launcher_round.png`). The adaptive-icon XML pair (foreground vector + background vector) is what you want for any modern target — pure vector, scales to any size.

**Chevron icon system (canonical sources)**

The four apps share one chevron geometry — three V-shaped strokes rising in opacity (0.22 → 0.55 → 1.0) on a cream linen tile (`#F5F1EA`). Each app re-colours the chevrons in its signature colour. Same path data, same proportions, same corner radius — only the stroke colour changes.

Authoritative SVG masters in `logo_app/`:

| File | Use |
|---|---|
| `logo_app/icon-launcher-master.svg` | **Companion — Inverted Teal variant** (bright teal `#2DD4A8` background + white chevrons). For marketing splash, social avatars, iOS app icon (which doesn't support adaptive icons). |
| `logo_app/icon-launcher-foreground.svg` | Just the chevrons (Android adaptive foreground layer). |
| `logo_app/icon-launcher-background.svg` | Just the bright-teal tile (Android adaptive background layer). |
| `logo_app/icon-signature-master.svg` | **Mono Navy** signature variant — for whitepaper covers, print, monochrome contexts. |
| `logo_app/ICON_SYSTEM_BRIEF.md` | Spec doc — two-skin system, generation pipeline, acceptance criteria. |

**Per-app launcher masters (cream-chevron skin — what's actually on phones):**

| App | Colour | Master SVG (1024×1024) |
|---|---|---|
| Companion | `#0D7D6C` teal | `logo_app/icon-launcher-companion.svg` |
| Business | `#3070C7` blue | `logo_app/icon-launcher-business.svg` |
| Pay | `#C97220` sunrise | `logo_app/icon-launcher-pay.svg` |
| Comm | `#0B1426` navy | `logo_app/icon-launcher-comm.svg` |

All four use identical chevron polyline geometry (the master path data from `icon-launcher-master.svg`), stroke width 111 on a 1024 canvas, miter joins, square caps, opacity 0.22 / 0.55 / 1.0. Cream background `#F5F1EA`, 230px corner radius (~22.5%).

**In-app React components** (per-app variants with theme awareness):

- `src/app/components/Logo.tsx` — Companion
- `src/business/components/Logo.tsx` — Business
- `src/pay/components/Logo.tsx` — Pay
- `src/comm/components/Logo.tsx` — Comm

**Android live VectorDrawables** (the bytes installed on phones — useful if Claude Design wants to see exact production fidelity):

- `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` — Companion chevrons
- `android-business/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` — Business chevrons
- `android-pay/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` — Pay chevrons
- `android-comm/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` — Comm chevrons
- Each app's `drawable/ic_launcher_background.xml` = cream tile

**Pre-rasterised launcher PNGs** (every density, both apps):

- `android*/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png`
- `android*/app/src/main/res/mipmap-{...}/ic_launcher_round.png`

**Suite-lockup compositions** (marketing-designed, all using real chevron geometry):

| Asset | Path | Use |
|---|---|---|
| Suite lockup, light | `docs/brand/anton-suite-lockup.svg` | All four real cream-chevron marks side-by-side + "The ANTON Suite" wordmark + tagline + per-app captions. |
| Suite lockup, dark | `docs/brand/anton-suite-lockup-dark.svg` | Dark variant on navy background. |
| Suite icons-only | `docs/brand/anton-suite-icons-only.svg` | Compact icon row — for headers / footers / tight spaces. |

These are the same chevron geometry, just composed for marketing layouts.

The ANTON logo SVG is literally:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="8" fill="#0D7D6C"/>
  <text x="50%" y="55%" dominant-baseline="central" text-anchor="middle"
        font-family="Inter, sans-serif" font-weight="700" font-size="18" fill="#FFFFFF">A</text>
</svg>
```

Use this verbatim for any web surface; render it at any size — it's vector and the proportions are deliberately balanced for favicons through to billboards.

### Colours

| Token | Light mode (default) | Dark mode | Use |
|---|---|---|---|
| `--color-primary` | `#0D7D6C` deep teal | `#2DD4A8` bright teal | Brand mark, primary action, links, focus rings |
| `--color-primary-hover` | `#06655A` | `#1BA882` | Hover state |
| Background | `#FFFFFF` / `#F8FAFC` | `#0B1426` deep navy | Page surfaces |
| Body text | `#0F172A` / `#1E293B` | `#E0E0E0` off-white | Reading copy |
| Secondary text | `#475569` | `#B0B0B0` | Captions, labels |
| Success | `#27AE60` | `#27AE60` | Confirmations, "in appetite" |
| Warning | `#F5A623` gold | `#F5A623` | Cautions, "boundary" |
| Error | `#E74C3C` | `#E74C3C` | Failures, "unacceptable" |
| Info | `#3498DB` | `#3498DB` | Neutral signals |

**Per-app chevron colours** — each app in the suite has a distinct chevron mark so they're glanceable on a home screen:

| App | Chevron | Hex |
|---|---|---|
| ANTON (desktop) | Deep teal | `#0D7D6C` |
| ANTON Companion | Teal cream | `#0D7D6C` on cream |
| ANTON Business | Blue | `#3070C7` |
| ANTON Pay | Sunrise orange | `#C97220` |
| ANTON Communications | Navy | (paired with teal) |

### Typography

- **Primary typeface**: Inter (UI + body)
- **Minimum body size**: 14px (we serve professionals 35–65; readability is non-negotiable)
- **Heading scale**: 32 / 24 / 20 / 18 / 16 / 14
- **Numerics**: Tabular figures for any data table, gap matrix, scorecard

### Design principles

1. **Light theme is the default** as of v0.7.5. Three themes total: `light` (default), `dark` (original ANTON look), `corporate` (blue-tinted enterprise variant).
2. **Teal = action.** Never use teal for decoration; if it's teal, it's clickable or it's the brand.
3. **Progressive disclosure.** Defaults should let someone click "Run" and get an excellent result; advanced controls are present but tucked away.
4. **Clear labels over icon-only.** Our users are not 22-year-old founders; they are 55-year-old MLROs. Labels win.

### Source whitepapers (already with Claude Design)

`design_handoff_companion_app/from_claude_design/uploads/` contains the long-form material these summaries condense:

- **ANTON by openEXPERT whitepaper Part 1 — The Starting Point**
- **ANTON by openEXPERT whitepaper Part 2 — The Context Layer (How APCI Changes Professional AI)**
- **ANTON by openEXPERT whitepaper Part 3 — The Network (When ANTONs Connect)**
- **ANTON Capability Deck (Small)**
- **Beyond AGI — ANTON**
- **FutureChain Technical Whitepaper**

Use those for full-bleed narrative copy where this brief is only summarising.

---

## 1. The one-liner

> **ANTON is the AI workspace for professionals who have to be right.**
> Local-first, audit-defensible, multi-LLM. 150+ expert modules across 12 pillars. Built for the people whose work gets read by regulators.

### Three alternative one-liners for hero rotation

1. **"The AI workspace that holds up in court."**
2. **"Frontier AI for people whose work is regulated."**
3. **"Compliance, legal, markets, life — one workspace, your machine."**

### The 30-second pitch

ANTON is a local-first AI workspace for professionals — compliance officers, lawyers, analysts, advisors, and 50+ other domains. It runs on the user's own machine, so documents never leave; it speaks to every frontier LLM (Claude, GPT, Gemini, Mistral, Ollama); and every output is audit-defensible because the architecture is deterministic where it has to be and AI-augmented where that's safe.

Around the workspace sits the **ANTON suite**: a Companion app that lets you drive your desktop ANTON from your phone; a Business app that turns any phone into a FutureChain merchant POS; a Pay app for customers; and a Communications app for the social layer. Underneath sits **FutureChain**, our own payment + identity rail with ISO 20022 PACS.008 messaging and a tax engine that covers 27+ jurisdictions out of the box.

The point of the whole stack is the six-layer vision: individual tool → intelligent tool → network → collaborative intelligence → marketplace → economy. Each layer is independently useful. Each makes the next more powerful.

---

## 2. Why ANTON exists

### The problem

Frontier AI is extraordinary at producing fluent text. It is dangerous at producing **defensible** work.

Professionals whose deliverables are read by a regulator, an auditor, a partner, or a court need three things general AI tools refuse to give them:

1. **A defensible record** — what model ran, what prompt, what knowledge sources, what was the deterministic answer vs. the AI-rationalised one, who reviewed it and when. None of the major chat tools produce a paper trail that survives an examination.
2. **Local control of sensitive documents** — most compliance teams cannot lawfully paste a client file into a cloud chatbot. ANTON runs on the professional's own machine; only the LLM API call leaves the network, and the LLM provider is the user's choice, not ours.
3. **Structure that matches the work** — a real piece of professional output is not a "chat response." It is a gap assessment, a board pack, a risk register, a decision memo, a tabular review of 47 contracts. ANTON ships 150+ modules and 40+ output formats that are shaped like the actual deliverable.

### The 6-layer vision

ANTON is built in six layers. Each layer is independently valuable. Each makes the next more powerful. We are deliberate about which layer a feature serves and what it unlocks downstream.

| Layer | Name | What it means | Status |
|---|---|---|---|
| **1** | **Individual ANTON** | Pillars, modules, 7-layer prompts. A frontier-AI workbench for one professional. | **Done** |
| **2** | **Intelligent ANTON** | Knowledge atoms, pattern detection, prediction tracking, calibration, feedback loops. Markets Pillar is the proof of concept. | **Mostly done** |
| **2.5** | **Temporal Reasoning** | Goals, values constraints, strategy alignment, cross-horizon reasoning. | **Done (all 4 phases)** |
| **3** | **The Network** | E2E-encrypted ANTON-to-ANTON messaging, contact hashes, trust. | **Built** |
| **4** | **Collaborative Intelligence** | ANTON-to-ANTON via the AAP (ANTON Agent Protocol). Specialized Agents are the foundation. | **In progress** |
| **5** | **The Marketplace** | `.anton` knowledge-pack trading, rating, discovery. | **Not started** |
| **6** | **The Economy** | FutureChain payments, expertise as income, AI salary. | **Building (FutureChain shipping in parallel)** |

When we add a feature, the question is always: *which layer does this serve, and does it make the next layer more powerful?*

### The cultural thesis

Most "AI for professionals" tools are wrappers that ask the user to trust the AI. ANTON's posture is the opposite: **the AI is a powerful intern; the workspace is the professional.** The deterministic engine (Risk Atlas, Tabular Review, gap scoring) never lets the model decide a residual score or a compliance verdict — the model writes the *rationale* around the deterministic output. That is what makes ANTON outputs survive review.

---

## 3. What ANTON is — the product

### 3.1 Pillars (12, current as of v0.7.5)

A pillar is a top-level mode of intelligence the user switches into. Each one is a distinct surface.

| Pillar | What it is for | Notable feature |
|---|---|---|
| **Work** | 150+ expert modules across 55+ domains | The original ANTON surface |
| **School** | Educational interface with teacher oversight | Two-tier teacher/student roles |
| **Life** | Personal-life modules (microfinance, BoP finance, consumer protection) | Built for the global majority |
| **Pathfinder** | Mode-aware research assistant — a "smart action bar" | Routes intent to the right ANTON surface |
| **Markets** | Self-learning financial intelligence — ANTON 100 indices, predictions, calibration | The proof of intelligent ANTON |
| **Community** | E2E-encrypted ANTON-to-ANTON messaging, contact hashes, trust scoring | The network layer |
| **Procure** | Procurement cycles, vendor evaluation, criteria scoring, contract tracking | RFP → award workflow |
| **Civic** | Civic engagements, eligibility checks, document submissions | For NGOs and public-interest work |
| **Grow** | CRM-style contacts, pipeline, opportunities, signals, briefings | Sales without Salesforce |
| **Payments** | FutureChain wallet & marketplace integration | The economy layer rendered |
| **Portals** | User-created ANTON-only web spaces with capability descriptors | Each portal is human site + machine endpoint |
| **Missions** | Multi-step automation jobs (research / outreach / monitoring) with credential vault | Long-running agents that ask permission |

### 3.2 The deterministic-where-it-matters showcases

These are the modules that prove the thesis. When a buyer wants to see why ANTON is different, you show them these.

#### Counsel's Desk

A legal workspace with 22 expert personas, 8 modes (research / drafting / negotiation / litigation / opinion / memo / argument / strategy), live citation tracking, and a writing surface where every paragraph the AI produces is anchored to a source it actually read. Built for lawyers who have to defend every sentence.

#### Risk Atlas

A seven-stage threat-path methodology generalised from the CASP BWRA standard into a universal causal-chain risk engine that any business — bakery to bank — can use to maintain a living risk register.

- **Stages 1–7**: Exposures → Threat paths → Vulnerabilities → Inherent risk (deterministic: `max(E, T, V)`) → Controls (Strong / Adequate / Weak, rolled up worst-of) → Residual (deterministic: `inherent − reduction`, clamped to [1,5]) → Appetite (5×5 grid: within / boundary / outside / unacceptable).
- **The LLM never decides a residual score**, only the rationale around it. Audit-defensible by construction.
- **25 industry packs** — composable `.anton` overlays across SME / FCP-bank / FCP-CASP / sector-specific / FCP-domain (AMLCFT, sanctions, fraud, ABC, market abuse, tax-evasion-facilitation, export controls) / universal-FCP-core. Inheritance via parent packs.
- **6 Compliance-as-Code integrity rules** run as pure functions over the Atlas state and surface live findings on the workspace dashboard.

#### Tabular Review

Folder-of-documents → AI grid. Per-cell Claude calls via bounded-parallelism executor; SSE live progress; per-cell reviewer feedback and shareable read-only links so external panels can validate.

**Coverage as of 2026-05-24:**

| Family | Playbooks |
|---|---|
| **EU** | AMLR · GDPR DPA · DORA Art. 30 |
| **EU-adjacent** | UK ECCTA · Swiss AMLA / LETA · Ireland SEAR · Luxembourg AIFMD II |
| **US** | NYDFS Part 500 · US BSA / AML Federal (FinCEN + PATRIOT + AMLA 2020 + CTA-narrowed) |
| **APAC** | Singapore MAS 626 + DTSP · Hong Kong Stablecoins Ordinance + VATP |
| **MENA** | UAE FDL 10/2025 |
| **Cross-jurisdictional** | Sanctions (OFAC + OFSI) |
| **Sector-agnostic** | NDA Review · Employment Contract Review |

**15 playbooks × 12 cells = 180 distinct AI-driven regulatory anchor questions.** Each cell is parameterised against a regulation-anchor, a knowledge pack, and a column-specific system prompt.

#### Evidence Pack

Every ANTON run can be exported as an Ed25519-signed, hash-chained evidence bundle: the model used, the prompt, the knowledge sources, the deterministic outputs, the AI outputs, the reviewer verdicts, the timestamps. Instance-level signing keys with optional org-level signing. JSONL / HTML / CLI export formats. Four regulatory frameworks pre-wired (AMLR / GDPR / DORA / NYDFS).

This is the single feature that converts "AI assistant" into "evidence that the work was done correctly."

#### Knowledge Packs (`.anton` bundles)

Importable, signed, versioned knowledge packs that ship: entities (regulations, authorities, obligations), relationships (statutory underpinning chains, duty composition), aliases, and per-regulation framework JSONs (articles with anchor IDs).

A pack is a distributable atom. A consultant can build one once, sign it, and share it across instances. Phase 5 of the vision (Marketplace) is built on this primitive.

### 3.3 Multi-LLM, by design

Claude is the default and the most deeply integrated, but ANTON is not an Anthropic wrapper. It speaks to every frontier provider through adapter modules:

| Provider | Default model | Anchor |
|---|---|---|
| Anthropic | `claude-opus-4-8` (Opus 4.7) | Built-in |
| OpenAI | `gpt-4o` | Adapter |
| Azure OpenAI | per-deployment | Adapter (reasoning models o3 / o4-mini supported) |
| Google | `gemini-2.0-flash` | Adapter |
| Mistral | `mistral-large-latest` | Adapter |
| Ollama | user-selected | Adapter (fully local) |

Users switch model per session. The default is Claude because it is the best at the deeply contextual, citation-grounded work ANTON modules ask for; Ollama is there because some clients can't legally use a cloud model at all.

### 3.4 Output Transformation System

Every module run produces Markdown + a structured JSON payload. From the JSON, a renderer registry picks the right output(s) — DOCX with ANTON branding, XLSX with conditional formatting and formulas, PDF, PPTX with speaker notes, Mermaid diagrams, SVG risk heatmaps, executive one-pagers, plain-language rewrites, board decks, devil's-advocate reviews, regulator's-eye reviews. **Adding a new format is one file in `server/services/renderers/` plus a registry entry.** That is how we ship "this output, but as a slide deck" without rewriting the module.

### 3.5 Hard numbers, current

- **12** pillars
- **150+** expert modules
- **55+** professional domains covered
- **30** languages localised
- **15** tabular review playbooks across **10** jurisdictions
- **180** distinct regulatory anchor questions in the Tabular Review surface
- **25** Risk Atlas industry packs
- **22** Counsel's Desk expert personas
- **40+** output formats
- **30+** built-in system prompts
- **70+** API route files
- **80+** service files
- **6** LLM providers (Anthropic / OpenAI / Azure OpenAI / Google / Mistral / Ollama)

---

## 4. How ANTON wins — the moat

### The four-axis comparison

| Axis | ChatGPT / Claude.ai | Harvey / Legora | ANTON |
|---|---|---|---|
| **Local-first** | No (cloud-only) | No | **Yes** (only LLM call leaves the machine) |
| **Audit-defensible record** | No | Partial | **Yes** (Evidence Pack, Ed25519-signed) |
| **Multi-LLM** | No (single vendor) | Anthropic-anchored | **Yes** (6 providers, swappable per session) |
| **Cross-domain** | Yes (but generic) | No (legal-only) | **Yes** (55+ domains, one workspace) |
| **Deterministic where it matters** | No | No | **Yes** (Risk Atlas, gap scoring) |
| **Price** | Cheap consumer | Enterprise-only | Mid-market accessible |

### The four things only ANTON does

1. **Run the same powerful workspace on a consultant's laptop and a bank's hardened server**, without the consultant losing features and without the bank losing control.
2. **Produce a deliverable, not a chat log.** Open Word / Excel / PowerPoint / PDF / Mermaid / board deck. From one run.
3. **Speak six LLMs.** The bank that has an Azure OpenAI tenancy and the NGO that wants free Ollama get the same UX.
4. **Hand the regulator the trail.** Evidence Pack is the killer feature for the people who buy.

---

## 5. FutureChain

**FutureChain is ANTON's own payment + identity rail.** It is the technology that closes the six-layer vision: when ANTON instances pay each other for expertise, route real-money payments, and run the merchant POS that funds the network, FutureChain is the substrate underneath.

### What FutureChain is

| Component | What it does |
|---|---|
| **PACS.008 builder** | Native ISO 20022 payment-message construction. Builder + canonicalisation + hash. Lets a payment instruction be a structured, signable artifact rather than a wire format string. |
| **Wallet** | Ed25519 keypair + address derivation + signing. Phone-resident; private keys never leave the device. |
| **RPC** | `submit_pacs008_batch` and query endpoints. The chain interface. |
| **Tax engine** | Lot tracking + FIFO / LIFO / average / specific-ID / share-pooling cost basis + holding-period rules + wealth-tax + loss-offset + K4 reporting + CSV exports. **Jurisdiction rules shipping for**: SE · DE · FR · US · ES · NG · JP · SG · AE · CH · PT · CY · MT · BE · PL · CA · KR · IL · BR · KE · AU · ZA · IT · GB · IE · NL — 27+ jurisdictions. |
| **Reference encoder** | ADR-004 versioned remittance envelope (v1+v2). The payload format that travels in a QR or a SEPA reference field. |
| **Mesh dialer** | ANTON-native E2E relay protocol (Phase 0+1 spec done — Noise IK handshake + WireGuard cipher suite) replacing reliance on Cloudflare Tunnel. v0.1 scope = household + NGO + self-hosting SME. |
| **Identity** | Contact hashes derived from raw Ed25519 pubkeys; trust scoring; AAP (ANTON Agent Protocol) for inter-instance discovery. |

### The strategic role

| Without FutureChain | With FutureChain |
|---|---|
| ANTON is a great workspace | ANTON is a network with a settlement layer |
| Layer 6 (Economy) is a slide | Layer 6 is a running rail |
| Merchants need Stripe + a bank | Merchants take FTC directly on a phone |
| Consultants charge by invoice | Consultants get paid per-pack download |
| Each ANTON is an island | Each ANTON is addressable + transactable |

### Why this matters to the design

**Wherever the marketing surface mentions payments, the merchant app, the Pay app, the marketplace, or "ANTON-to-ANTON," FutureChain is the substrate**. The FC and FTC globe logos belong on those surfaces.

ANTON, FutureChain, and the apps are **one company, four product surfaces**:

1. ANTON workspace (desktop / local-first)
2. The four mobile apps (Companion, Business, Pay, Communications)
3. FutureChain SDK (payments + tax + mesh)
4. The hosted ANTON option (for consumers without a desktop)

---

## 6. The four mobile apps

Each is a separate APK, separate identity, separate purpose. They share the chevron design language but each has its own colour and its own job. **Same person can install several; they remain intentionally separate identities** (work email vs personal email model). Optional cross-app linking is deferred.

### 6.1 ANTON Companion · *teal chevron*

**The remote control for a desktop ANTON.**

A phone-resident PWA + Android app, Capacitor-wrapped, paired to a desktop ANTON instance via an Ed25519 enrollment ritual (60s-TTL QR + 6-digit out-of-band confirmation code + biometric re-confirm on critical approvals). Multi-instance: a consultant can have their own personal ANTON and three client ANTONs paired; the InstanceSwitcher (Wallet-card-style bottom sheet) makes the active one unambiguous.

**Key surfaces**:
- **Approvals** — the enterprise wedge. Severity-sorted inbox; biometric re-confirm on critical / high; signed-envelope responses (Ed25519 sig + replay-protected nonce). The MLRO approves a SAR submission from the lift.
- **Voice mode** — full-screen overlay with Telegram-style hold-to-talk, on-device speech fallback, live captions, immediate barge-in on tap.
- **Capture** — camera / library / share-target → resize-to-2048px → POST to ANTON's `/query-sync`. Photograph a contract, ANTON reviews it.
- **Push** — APNs / FCM / web-push. Payload carries only `event_id + severity + opaque title + deep_link`, never confidential content.

**Why it's the enterprise wedge**: bank security teams have been telling vendors for two years they want approval workflows on a phone. ANTON Companion gives them that, signed, replay-protected, biometric-gated.

### 6.2 ANTON Business · *blue chevron · #3070C7*

**Phone-only merchant POS for FutureChain payments.**

No backend. The phone is the entire merchant. The merchant has a bilateral KYC + sweep agreement with Safello (out of scope for us); the phone's QRs point at a Safello-arranged receive address. Safello sweeps + converts FTC → SEK independently. **ANTON Business doesn't touch any of that infrastructure** — that's the point. A bakery, a barber, a market stall can take crypto in 60 seconds with no servers.

**Surfaces**:
- **Simple mode**: keypad → QR with ADR-004 v1 remittance reference
- **Extended mode**: cart with item catalog → QR
- **Refunds**: build + sign PACS.008 to customer
- **Kvitto** (receipt) rendering on-device as PDF, emailed via Resend/Postmark
- **7-year retention export** (PDF + SIE) for Swedish Bokföringslagen

Built on Capacitor + Vite + Tailwind in `src/business/` + `android-business/`. Expo was tried and abandoned (four compounding Windows-toolchain failures). All 38 language catalogues complete.

### 6.3 ANTON Pay · *sunrise chevron · #C97220*

**The customer-side counterpart to Business.**

A consumer scans a merchant's `futurechain:pay` QR and pays in FTC. Same build chain as Business; cloned from `android-business/` and renamed (more reliable on Windows than `npx cap add`). QR scanning uses the `qr-scanner` npm package (pure web, getUserMedia + worker) — zero plugin-list changes. Includes a paste-a-URI fallback for testing without a second phone.

Settlement is bilateral (merchant ↔ Safello) — Pay only records the customer's local receipt in IndexedDB; it does not broadcast a chain transaction.

### 6.4 ANTON Communications · *navy + teal*

**Separate consumer app — the social / personal layer.**

Chat with friends. Social events (dinners, parties, birthdays). Portals visitor surface. Wallet shell paired to FutureChain.

**Architectural deliberation**: The Companion App is the user's professional surface; Comm is paired to hosted ANTON for the consumer surface. Same person can have both, with **two intentionally separate identities** — forcing a single identity creates a "your boss can find you via your party-planner profile" leak.

**13-item feature roadmap (R1–R13) all shipped**:
R1 Reply · R2 React · R3 Wassup (closed-graph status feed) · R4 Voice notes · R5 Disappearing · R6 View-once · R7 Polls · R8 Forward / Edit / Delete · R9 Read receipts + typing · R10 Scheduled · R11 Event reminders · R12 Stickers · R13 Location.

**E2E crypto**: X25519 keypair derived from device Ed25519 → AES-256-GCM via WebCrypto with per-message HKDF salt for forward secrecy → AAD binds `(fromHash, toHash)` into auth tag. Messages travel as encrypted envelopes over the relay protocol; the relay sees routing IDs, not content.

**5 tabs**: Chat · Wassup · Events · Portals · Wallet.

### Together: the app suite

| App | Chevron | One-liner |
|---|---|---|
| **Companion** | Teal | Your desktop ANTON, on a phone. Approvals, voice, capture. |
| **Business** | Blue | Take FutureChain payments on any phone. No backend. |
| **Pay** | Sunrise | Scan, pay in FTC, get a receipt. |
| **Communications** | Navy + teal | Chat, events, social — your personal ANTON identity. |

The four chevrons together are the suite icon system. On a home screen they read as a family.

---

## 7. The customer / target audience

### Primary buyer: the regulated mid-market professional

- **Who**: MLROs, heads of compliance, partners at law firms, risk officers, internal audit leads, financial-crime investigators, advisory consultants
- **Age**: 35–65
- **Pain**: They like AI; their security/compliance team won't let them use it on real client data
- **Budget**: Real, but allergic to enterprise lock-in (Harvey-style $500/seat)
- **Win condition for them**: "I can show the regulator how this output was made, and the document never left my laptop."

### Secondary buyer: the boutique firm

- Compliance consultancies, AML advisories, mid-market law firms, fund administrators
- 5–50 seats
- ANTON's pricing and local-first posture beats Harvey/Legora on both axes simultaneously

### The expansion path

The buyer above buys ANTON workspace. Their team starts running 100s of audits per month. Tabular Review explodes their hit rate. They start sharing knowledge packs internally. The Marketplace (Layer 5) becomes the discovery surface. The Economy (Layer 6, FutureChain) becomes the way they get paid for the packs they author. **The professional becomes both buyer and supplier.**

---

## 8. Headline copy bank — ready to use

### Hero headlines

- **The AI workspace that holds up in court.**
- **Frontier AI for people whose work is regulated.**
- **Your documents stay on your laptop. Only the question goes to the AI.**
- **One workspace. 150 modules. Six LLMs. Yours.**
- **Compliance, legal, markets, life — one workspace.**

### Sub-headlines

- Local-first. Multi-LLM. Audit-defensible. Built for the work that gets read by regulators.
- 150+ expert modules across 55+ professional domains. Each one starts with the problem, not the model.
- Where the AI never decides the residual score, only writes the rationale around it.
- The workspace that produces a deliverable, not a chat log.

### Section-level copy

**For "Local-first"**
> Your client files never touch our servers. They don't touch *any* servers. ANTON runs on your machine; only the question you send to the model leaves your network — and you choose which model. We never see your work.

**For "Multi-LLM"**
> Claude, GPT, Gemini, Mistral, Azure, Ollama. Switch per session, per module, per question. Use Claude for the deep work and Ollama for the work that can't leave the building. One workspace, six brains.

**For "Audit-defensible"**
> Every run can be exported as an Ed25519-signed evidence bundle: the model, the prompt, the knowledge sources, the deterministic outputs, the AI rationale, the reviewer verdicts, the timestamps. When the regulator asks how you got there, you hand them the trail.

**For "Risk Atlas"**
> A deterministic, seven-stage threat-path engine. The AI writes the rationale; the math writes the score. Twenty-five industry packs. Six Compliance-as-Code integrity rules that surface findings live.

**For "Tabular Review"**
> Folder of contracts in. Answers grid out. Fifteen pre-built playbooks across ten jurisdictions and 180 regulatory anchor questions — share the result with a panel of reviewers via a read-only link, and every cell is calibrated.

**For "FutureChain"**
> Our own payment + identity rail. ISO 20022 PACS.008 messaging, a tax engine across 27 jurisdictions, Ed25519 signing throughout, and a mesh dialer that talks ANTON-to-ANTON without going through anybody's tunnel. The substrate under the entire suite.

**For "The four apps"**
> One company. Four phones. Companion is your desktop ANTON on the move. Business is a merchant POS with no backend. Pay is the customer side. Communications is the social layer. The chevrons read as a family on the home screen.

**For "The vision"**
> Six layers, each independently valuable, each making the next more powerful. We're past layer three. Layers four, five, and six are why we built layers one, two, and three.

### Three taglines for the suite icon group

- **Four apps. One ANTON.**
- **The ANTON suite — pocket-sized.**
- **From desktop to handset, ANTON moves with you.**

---

## 9. Trust / proof points for the page

- **Local-first** — only the LLM call leaves the machine
- **Ed25519-signed** evidence bundles
- **Deterministic engines** behind every score that matters
- **Six LLMs** — never locked to one vendor
- **30** languages localised
- **27+** tax jurisdictions in FutureChain SDK
- **180** pre-built regulatory anchor questions
- **25** Risk Atlas industry packs
- **22** Counsel's Desk expert personas
- **40+** output formats
- **Open source-style** transparency on architecture (CLAUDE.md, AGENTS.md, ADRs all in the repo)

---

## 10. Information architecture recommendation for the page

A four-section linear scroll works best:

```
[ HERO ]
  ANTON mark, large.
  Hero headline + sub.
  Two CTAs: "See it run" + "Talk to us"
  Background: subtle teal-on-cream geometric pattern, no photography

[ THE PROBLEM ]
  Three-column: "Local control" / "Audit-defensible" / "Multi-LLM"
  Each with a 1-line claim + 2-line proof
  Visual: small device + lock + chain icons in teal

[ THE PRODUCT ]
  12-pillar grid (one card each)
  Then 4 highlighted modules: Counsel's Desk, Risk Atlas, Tabular Review, Evidence Pack
  Each module: screenshot + one paragraph + "Watch demo" link
  Visual: real product screenshots, not stock illustrations

[ THE SUITE ]
  Four-up: Companion / Business / Pay / Comm
  Each with its chevron + one-liner + "Download" CTA
  Visual: the four chevrons in a row at large size — this is the suite identity

[ FUTURECHAIN ]
  Half-screen: FC globe logo + tagline
  Three-up below: PACS.008 / Tax engine / Mesh
  Visual: globe imagery, network diagrams in teal lines on cream

[ THE VISION ]
  The six-layer diagram, full bleed
  Each layer with its status (done / building / next)
  Closing line: "Each layer independently valuable. Each makes the next more powerful."

[ CTA FOOTER ]
  "Run ANTON on your machine in 5 minutes."
  Download button + GitHub + Docs + Talk to us
```

---

## 11. Notes for Claude Design

1. **Render the ANTON SVG inline** — never rasterise it; it's vector and looks better at every scale.
2. **The FC PNG logos are PNG-only** — if you need a vector version, request it. We can produce one quickly.
3. **The four-chevron lockup is the suite identity** — please design a clean horizontal lockup of the four chevrons (teal / blue / sunrise / navy) for the "Suite" section. This will become a brand asset across all surfaces.
4. **Light mode is the canonical surface** — design for light. Dark and corporate variants exist but light is what we lead with.
5. **No stock photography of generic businesspeople in headsets.** Our customer is a 55-year-old MLRO; they laugh at that imagery. Use real product screenshots, abstract geometric, or photography of physical objects (a desk, a building, a pen on paper).
6. **The whitepapers and the Capability Deck PDF** (already in your uploads folder) carry the longer narrative arc. This document is the condensed brief; the PDFs are the long form.
7. **Numbers in this brief are accurate to 2026-05-24.** Before publishing, ask me to verify any specific count you want to put in the hero — they grow week by week.

---

## 12. Open positioning questions for the team

These aren't blocking, but they sharpen the page:

1. **Single product or product family?** Recommendation: present as one company with two products (ANTON workspace + FutureChain rail) and four apps (Companion / Business / Pay / Comm). Marketing site has tabs for each.
2. **Sell to firms or sell to professionals?** Recommendation: lead with the individual professional, mention firm pricing in the footer / contact path.
3. **Where does AdviSense fit?** AdviSense is our consulting brand (the people who use ANTON to deliver client work). On the marketing site it should appear as "ANTON is built and operated by AdviSense" in the about footer.
4. **Open source or closed source?** Currently closed-source-but-transparent. The architecture is public via CLAUDE.md. We are not yet ready to claim "open source" as a marketing axis.

---

*End of brief. Direct any questions to Daniel — `daniel.bardun@gmail.com`.*
