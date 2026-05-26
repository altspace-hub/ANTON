# ANTON × FutureChain — Integrated Marketing Brief

**Version:** v1.0 (integrated)
**Date:** 2026-05-24
**Authors:** Synthesised from Daniel's brain dump + prior Claude session (`ANTON_FutureChain_Marketing_Copy_Brief.md`) + IRE pass + codebase verification.
**Purpose:** Single source-of-truth handoff to Claude Design for a marketing page covering ANTON, FutureChain, and the four apps.

This document supersedes the prior `MARKETING_NARRATIVE.md` (4-USPs-parallel) for the joint ANTON + FutureChain page, because the spine is genuinely different. Where the narrative led with four parallel USPs, this brief leads with **one sovereignty thesis** that holds both products. The four USPs become evidence beneath it.

---

## 1. Primary audience (locked)

Tech operators, startup founders, fin-influencers, and crypto-native readers — the audience that is **exhausted** by AI/blockchain marketing and rewards substance, founder voice, and concrete numbers.

Secondary audiences welcome but not optimised for in v1: businesses, fintechs, NGOs, schools, family offices, private persons, agent builders.

**What this audience reads as a green flag:** technical specificity, named primitives, real numbers with units, honest qualifiers about what's shipped vs roadmap, founder voice, no slogans.

**What this audience reads as a red flag:** "AI-powered", "revolutionary", "the future of", motion-graphic gradients, generic crypto launchpad aesthetics, the word "sovereign" used without proof.

---

## 2. The spine

The page is built around one sentence:

> **We built the AI we wanted to use, and the rails we wanted to send money on. With the safety crypto forgot to build. Both open. Both yours.**

This line does five jobs at once:

1. **Founder voice** → credibility with sceptical readers
2. **"AI we wanted to use"** → ANTON's reason for existing
3. **"Rails we wanted to send money on"** → FutureChain's reason for existing
4. **"Safety crypto forgot to build"** → the financial-crime-prevention wedge, patent flag, crypto-audience hook
5. **"Both open. Both yours."** → sovereignty thesis as evidence, not slogan

"We" is the founder and the reader at the same time — by the end of the line the reader is inside the story.

**The thesis underneath:** the most powerful tools in your life — your AI and your money — are currently rented from someone else, on terms you can't see, with locks you didn't choose. We're building the alternative: tools you actually own, that work the way you actually work, on rails that carry the meaning real commerce needs.

That is the only thesis on the page. Every section is proof of it.

---

## 3. The page, top to bottom

### 3.1 — Hero

**Headline:**
> We built the AI we wanted to use, and the rails we wanted to send money on. With the safety crypto forgot to build. Both open. Both yours.

**Sub-headline:**
> ANTON is the open professional AI platform that runs on any model — Claude, Mistral, ChatGPT, or local — on your machine, with every prompt and reasoning step visible to you. FutureChain is the ISO 20022-native payment rail with financial-crime-prevention built into the chain itself.
>
> Each stands on its own. Together they make an AI economy that's accountable to you, not to a platform.

**CTAs:**
- *Primary:* Try ANTON
- *Secondary:* Read the FutureChain whitepaper

**Note on "patent pending":** the prior brief used this twice but it is **not referenced anywhere in the codebase**. Before publishing, Daniel needs to confirm scope (FCP-on-chain, full FutureChain architecture, or both) and have legal sign-off on the language. Until then, leave it out of the hero; restore once verified. *(See open questions §8.)*

---

### 3.2 — Stats strip (optional, recommended)

A four-tile anchor between hero and pillars. Use only numbers that are **verifiable in the codebase or shipping product** — never aspirational. Recommended set as of 2026-05-24:

| Stat | Source |
|---|---|
| **150+ modules** across 12 pillars | `src/lib/constants.ts` |
| **45+ open bundle types** in `.anton` format | `docs/anton-format/types/` |
| **27 jurisdictions** in the FutureChain tax engine | `anton-business/packages/futurechain-sdk/src/tax/rules/*.ts` |
| **6 LLM providers** supported | `server/services/model-adapter.ts` |

Alternative four if Daniel wants the FCP/throughput posture upfront:

| Stat | Caveat |
|---|---|
| **PACS.008 native** | ✅ Shipping in `futurechain-sdk/src/pacs008/` |
| **Open `.anton` format · 45+ bundle types** | ✅ Documented |
| **0.1% fee, capped at 0.1 FTC** | ⚠️ Whitepaper spec — not yet in code. Verify before publishing. |
| **Hundreds of TPS, scaling to thousands** | ⚠️ Whitepaper spec — no benchmark in repo. Verify before publishing. |

**Recommendation:** lead with the first set (all verifiable) for v1, and add the throughput/fee tile back in once Daniel can point Claude Design at a testnet benchmark or a chain explorer.

---

### 3.3 — Pillar 1 · ANTON: an AI coworker that works the way you do

**Lead paragraph (founder voice, hold this verbatim):**

> We were tired of AI platforms that hide their prompts, lock your data, and pretend the chat box is the product. So we built the opposite.

**Body:**

ANTON is open, model-agnostic, and local-first by default. Every prompt is visible. Every reasoning step is logged. Every artefact is yours to export, share, or fork. The same platform runs in the cloud, on your laptop, or fully air-gapped with local models. You move with the frontier; you don't get locked to it.

It's not a chat box. It's **modules** for the work you actually do — financial crime, project planning, legal counsel, coding, content, risk, markets, civic engagement, and more. **Workflows** you can chain. **Missions** that run autonomously. A **task manager** that takes a Jira ticket or a stand-up note and turns it into a plan. An **Iterative Reasoning Engine** that thinks through hard problems out loud and shows its working.

**Concrete proof points** (pull through what fits the layout):

- **150+ modules** across **12 pillars** — Work, School, Life, Pathfinder, Markets, Community, Procure, Civic, Grow, Payments, Portals, Missions
- **6 LLM providers** — Claude (default), OpenAI (incl. o3 / o4-mini reasoning), Azure OpenAI, Google Gemini, Mistral, Ollama (fully local). Switch per session, per module, per question.
- **30 languages** localised
- **Counsel's Desk** — 22 expert personas, 8 modes, live citation tracking
- **Risk Atlas** — seven-stage deterministic threat-path engine, 25 industry packs. The LLM never decides the residual score; only the rationale. Audit-defensible by construction.
- **Tabular Review** — 15 playbooks across 10 jurisdictions, 180 distinct regulatory anchor questions, shareable to a reviewer panel
- **Evidence Pack** — every run exportable as an Ed25519-signed bundle: model + prompt + knowledge + reasoning + verdicts + timestamps. Audit trail by construction.
- **`.anton` format** — 45+ open, versioned, signable bundle types. Knowledge packs you build move with you, share with colleagues, list on the marketplace.

**Then — quietly, in the background — it learns.** The more you use ANTON, the more it understands your work. The arc is **intern → teammate → coworker that flags things before you ask.** (This is the self-learning USP. Keep it at the foot of Pillar 1 — it earns more attention there than it would competing for the hero.)

---

### 3.4 — Pillar 2 · FutureChain: the rail that carries meaning, safely

**Lead paragraph (founder voice, hold verbatim):**

> Crypto can't do the basics real commerce needs. Bitcoin and Ethereum carry hashes and timestamps. SWIFT and SEPA carry sender, receiver, ultimate beneficial owner, purpose, and nature — because real-world payments need to.

**Body:**

So FutureChain is anchored in **ISO 20022 (PACS.008)** — the same standard banks use. It carries the full picture, on chain, in every transaction. *(Built and tested: `futurechain-sdk/src/pacs008/`.)*

Then we made it safe. Most chains treat financial-crime-prevention as someone else's problem. We built it in. **Heimdall**, the FCP screening node on the chain, checks every transaction in flight for fraud, sanctions, and money-laundering risk. Bank-grade defences on rails the open economy can actually use.

**Rich remittance.** Where vanilla ISO 20022 limits remittance to 140 characters, FutureChain's `AntonRemittance` format carries **structured line items, attachments, references, and integrity hashes** up to 100KB per payload — enough room to record itemised orders, agreement references, or an entire reasoning trail for an agent-initiated transaction. *(Built: `futurechain-sdk/src/pacs008/remittance.ts`.)*

**Designed for everyday speed and cost.** Hundreds of transactions per second, scaling to thousands. 0.1% fee, capped at 0.1 FTC. Cheaper than Visa, Mastercard, Bitcoin gas, or the rails most of the world uses today. *(These are whitepaper targets — verify against testnet before quoting publicly. See §8.)*

A blockchain you can actually use in day-to-day life. That's the standard we held it to.

**What's built today** *(small text, can sit as a tooltip / footnote — protects the page from over-claim):*
- PACS.008 builder + canonicalisation + signing — ✅ shipping
- Structured rich-remittance encoder (`AntonRemittance`) — ✅ shipping
- ANTON Mesh protocol (Noise_IK + ChaCha20-Poly1305) — ✅ spec finalised; handshake crypto in implementation
- Heimdall FCP screening — ⚠️ described as a chain-side node type; production-ready status to be confirmed with the FutureChain team
- 27-jurisdiction tax engine (FIFO/LIFO/avg/specific-ID/share-pooling, K4, CSV) — ✅ shipping in `futurechain-sdk/src/tax/`

---

### 3.5 — Pillar 3 · Together: an AI economy that's accountable to you

**Lead (this is the unique combination, the actual moat):**

> When your ANTON buys a train ticket on your behalf, FutureChain records that it was your ANTON that did it — with you as the ultimate beneficial owner. Provable. Traceable. On chain.

**Body:**

When your ANTON talks to a colleague's ANTON, peer-to-peer, the rails underneath carry the *why*, not just the *how much*. When your agents transact with agents you've never met, the chain knows who authorised what, on whose behalf, for what purpose. With expanded remittance space — not the 140 characters ISO 20022 normally allows — there's room to record the agreement, the line items, even the entire reasoning trail.

That's not crypto as it is today. That's not banking as it is today. **That's the AI economy as it has to be if we're going to live in it.**

**Why this combination is the actual moat** (Claude Design — this is the strongest "why are these on the same page?" argument):

- Stripe + ChatGPT = no integration
- Plaid + Claude = no integration
- Visa + GPT = no integration
- **ANTON + FutureChain = an AI economy substrate no one else has as one stack.**

Each individual component has competitors. The combination has none. *That* is what the joint page sells.

**What's built today** *(again, footnote-style — honesty protects against demo-failure):*
- ANTON-to-ANTON messaging, P2P, E2E-encrypted — ✅ shipping (Comm App, Phases R1–R13)
- AAP (ANTON Agent Protocol) signed-delegation infrastructure — ✅ shipping (`server/services/missions/mission-delegation.ts`)
- Agent-to-agent payment settlement — ⚠️ stubbed pending FutureChain Rust core integration (see `docs/A2A_ROADMAP.md`)
- Agent-as-UBO chain (Maya → Daniel) — ⚠️ data model present; production transaction flow on the roadmap
- Capability-aware peer discovery — ✅ shipping (Portals + AAP)

Marketing this as the **trajectory** is honest and powerful. Marketing it as "running today" would set up a demo failure.

---

### 3.6 — Built for the way you actually work

Six audience tiles, scannable, one strong line per audience. Bracketed module names pull through if Claude Design wants a "ANTON gives you…" sub-line.

**For startups** — Move fast on any model. Keep your data on your machine. Don't bleed margin to the AI tax. *(One workspace, six LLMs, swappable per session.)*

**For businesses** — A coworker that scales with your team. Modules for the work your industry actually does. Audit trails compliance officers actually like. *(Counsel's Desk, Risk Atlas, Tabular Review, Evidence Pack.)*

**For fintechs** — A payment rail with bank-grade financial-crime-prevention built in. Build on rails that won't get sanctioned out of existence overnight. *(PACS.008, Heimdall, AML knowledge packs across 10 jurisdictions.)*

**For private persons** — One AI that's yours, on your machine, that learns your work without selling your context. One wallet that carries meaning, not just money. *(Local-first, Ollama support, Pay app.)*

**For NGOs** — Air-gapped deployment for hard operating environments. Local LLMs. No phone-home. Rails that work where banks won't go. *(Civic Pillar, BoP-finance modules, fully local Ollama stack.)*

**For schools** — Voice-first AI for young learners. Guardian and teacher infrastructure built in. Ages five and up. Open architecture so it scales without licence fees. *(School Pillar, teacher-oversight mode.)*

**Two more audiences worth surfacing in v2 if the page has room** *(both flagged by the IRE pass; not in prior brief)*:

**For AI agent builders** — A workspace plus a payment rail, in one stack. Build agents that can transact with provable lineage. Your agent's actions land on chain as agent-of-Daniel, not as a black-box bot. *(AAP, Missions, FutureChain.)*

**For family offices** — Sovereignty plus tax compliance across 27 jurisdictions plus KYC controls. Niche but high-value. *(Wealth Pillar, FutureChain tax engine.)*

---

### 3.7 — The arc (closing)

This is the whitepaper tagline arc. Treat as a four-line poem, generous whitespace, large type. Do **not** subdivide with bullets.

> *The prompt is the product.*
> *The context is the competitive advantage.*
> *The network is worth more than any single node.*
> *The network is the economy.*

**Caption beneath:**
Start with one. Grow into all of them. Or just see what we've built.

**CTAs:**
- *Primary:* Get started with ANTON
- *Secondary:* Read the whitepapers
- *Tertiary:* Talk to Daniel

---

### 3.8 — The Suite (recommended addition not in prior brief)

The four mobile apps are part of how the sovereignty thesis shows up in the real world. If the page has room, a four-tile suite row after Pillar 3 closes the picture from desktop to phone.

| App | Chevron | One-liner |
|---|---|---|
| **Companion** | Teal `#0D7D6C` | Your desktop ANTON, on a phone. Approvals, voice, capture. |
| **Business** | Blue `#3070C7` | Take FutureChain payments on any phone. No backend. |
| **Pay** | Sunrise `#C97220` | Scan, pay in FTC, get a receipt. |
| **Communications** | Navy `#0B1426` | Chat, events, social. Personal-identity ANTON. |

**Suite-lockup asset:** `docs/brand/anton-suite-lockup.svg` (light) / `anton-suite-lockup-dark.svg` (dark) / `anton-suite-icons-only.svg` (compact icon row). Real cream-chevron geometry, drop-in.

**Tagline option for the suite section:** *"Four apps. One ANTON."* or *"From desktop to handset, ANTON moves with you."*

---

## 4. Visual recommendation (one strong hero visual)

The prior brief is right: don't fill the hero with motion graphics — let the words carry. But the page wants **one** strong static visual lower down that crystallises the joint thesis.

Three options for Claude Design:

1. **Diagram (recommended for this audience):** ANTON instance ↔ ANTON instance via the mesh → FutureChain PACS.008 transaction → UBO chain recorded on the remittance. Two boxes + an arrow + a transaction record. Schematic, technical, immediately legible to a crypto-native or fintech reader.
2. **Code-style proof:** a short prompt + reasoning trail + signed Evidence Pack snippet. Shows the transparency story in a way no other AI tool can match.
3. **Two halves:** left = ANTON brand mark + "open AI", right = FC globe + "open rails", arrow between them = "the AI economy."

Pick one. Recommend (1) — it's the only one that visualises the unique combination.

---

## 5. Voice & tone

Carrying through verbatim from prior brief because it's right:

- **Founder voice throughout.** "We built this because…" not "Our platform offers…".
- **British English.** Spelling and idiom.
- **Short punchy sentences alternating with longer storytelling sentences.** Rhythm matters.
- **Concrete numbers over adjectives.** "0.1% fee, capped at 0.1 FTC" not "very low fees".
- **No corporate hedging.** "We were tired of…" lands harder than "Existing solutions have limitations in…".
- **The FCP wedge is the strongest differentiator** — patent-pending financial crime prevention on chain is something no major chain offers and it deserves the prominence it has in the hero and Pillar 2.
- **No claim that we can't demo.** If something is roadmap, mark it as direction not feature.

---

## 6. Tonal references & anti-patterns

**Sites whose *voice and substance* fit the brand:**

- **Linear** (linear.app) — confident minimalism, type-led, no filler
- **Modern Treasury** (moderntreasury.com) — compliance-grade but readable
- **Resend** (resend.com) — founder voice plus technical confidence
- **Anchorage** (anchorage.com) — institutional crypto, calm not loud

**Anti-patterns to avoid:**

- Solana-style loud / gamer-coded crypto aesthetics and copy
- Big-AI generic gradients and "intelligent automation" stock language
- Web3 launchpad aesthetics — countdowns, token-sale-coded layouts, hype copy
- Any framing that sounds adversarial against named competitors (we are not against OpenAI / Bitcoin / banks; we are for something the reader didn't know was possible)
- The word "sovereign" used as a slogan without proof beneath it (sovereignty is the **thesis**; never the **claim**)

---

## 7. Brand assets — complete map

Claude Design has everything in the `docs/brand/` directory and the `logo_app/` directory. Comprehensive list:

### 7.1 — ANTON mark
- `public/anton-logo.svg` — primary mark. SVG, 32×32, 8px corner, `#0D7D6C` teal fill, white "A" in Inter Bold 18pt. **Locked across themes.** Vector — render at any scale.

### 7.2 — FutureChain marks
- `design_handoff_companion_app/from_claude_design/uploads/fc logo.png` — coloured
- `design_handoff_companion_app/from_claude_design/uploads/fc logo white.png` — for dark surfaces
- `design_handoff_companion_app/from_claude_design/uploads/ftc logo globe.png` — globe variant for network contexts

**Note:** these are PNG only. Request a vector version from the FutureChain team before any final render — vector is essential for hero-scale use.

### 7.3 — Chevron icon system (the actual app marks)

**Master SVGs** in `logo_app/`:

| File | Use |
|---|---|
| `icon-launcher-master.svg` | Companion Inverted-Teal variant (bright teal + white chevrons) — for marketing/social/iOS app icon |
| `icon-launcher-foreground.svg` | Chevrons only (Android adaptive foreground layer) |
| `icon-launcher-background.svg` | Teal tile only (Android adaptive background layer) |
| `icon-signature-master.svg` | Mono Navy variant for whitepaper covers / print |
| `icon-launcher-companion.svg` | **Per-app: Companion cream-chevron** (teal chevrons on cream tile — what's installed on phones) |
| `icon-launcher-business.svg` | **Per-app: Business cream-chevron** (blue chevrons on cream tile) |
| `icon-launcher-pay.svg` | **Per-app: Pay cream-chevron** (sunrise chevrons on cream tile) |
| `icon-launcher-comm.svg` | **Per-app: Comm cream-chevron** (navy chevrons on cream tile) |
| `ICON_SYSTEM_BRIEF.md` | Spec doc — two-skin system, generation pipeline, acceptance criteria |

All four cream-chevron per-app SVGs use **identical polyline path geometry** (the master path data from `icon-launcher-master.svg`), stroke width 111 on a 1024 canvas, miter joins, square caps, opacity 0.22 / 0.55 / 1.0. Cream background `#F5F1EA`, 230px corner radius.

### 7.4 — Suite lockups (marketing-composed)

| File | Use |
|---|---|
| `docs/brand/anton-suite-lockup.svg` | Light · 4 real cream-chevrons + "The ANTON Suite" wordmark + tagline + per-app captions |
| `docs/brand/anton-suite-lockup-dark.svg` | Dark variant on navy |
| `docs/brand/anton-suite-icons-only.svg` | Compact icon row, no labels — for tight headers/footers |

### 7.5 — Live app launcher icons (production-fidelity)

Every density from `mdpi` (48px) to `xxxhdpi` (192px), plus round variants and adaptive XML, for all four apps:
- `android/app/src/main/res/mipmap-*/ic_launcher*.png` — Companion
- `android-business/app/src/main/res/mipmap-*/ic_launcher*.png` — Business
- `android-pay/app/src/main/res/mipmap-*/ic_launcher*.png` — Pay
- `android-comm/app/src/main/res/mipmap-*/ic_launcher*.png` — Comm

### 7.6 — Colours

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-primary` | `#0D7D6C` deep teal | `#2DD4A8` bright teal | Brand mark, primary action, links |
| Background | `#FFFFFF` / `#F8FAFC` | `#0B1426` navy | Page surfaces |
| Body text | `#0F172A` / `#1E293B` | `#E0E0E0` off-white | Reading copy |
| Success | `#27AE60` | `#27AE60` | "in appetite" |
| Warning | `#F5A623` gold | `#F5A623` | "boundary" |
| Error | `#E74C3C` | `#E74C3C` | "unacceptable" |

**Per-app chevron colours** — Companion `#0D7D6C` · Business `#3070C7` · Pay `#C97220` · Comm `#0B1426`.

### 7.7 — Typography

- **Primary typeface:** Inter (UI + body)
- **Heading scale:** 64 / 38 / 24 / 18 / 16 / 14
- **Body minimum:** 14px
- **Numerics:** tabular figures for any stat / data table

### 7.8 — Existing long-form material (for narrative copy)

Already in Claude Design's uploads folder:
- ANTON whitepaper Parts 1–3 (Starting Point / APCI Context Layer / Network)
- ANTON Capability Deck
- Beyond AGI — ANTON
- FutureChain Technical Whitepaper

**Use these for the long-form reading-room sections**; this brief is the homepage spine.

---

## 8. Open questions to lock before final render

The five from the prior brief, plus three new from the IRE pass + verification:

1. **Hero line variant.** Keep FCP wedge in hero (recommendation: yes) or cleaner two-beat version with FCP wedge getting full weight in Pillar 2.

2. **CTAs.** *Try ANTON / Read the whitepaper / Talk to Daniel* — confirm or replace with waitlist, GitHub star, Discord, etc.

3. **Stats strip.** Use the all-verifiable set (150+ / 45+ / 27 / 6) or the throughput/fee set (which needs Daniel to confirm with a testnet benchmark first)?

4. **"Daniel" or "the team"** in the closing tertiary CTA. Founder-led is right for this audience but a choice.

5. **"Patent pending" scope.** Used in prior brief — but **not referenced anywhere in the repo**. Before publishing: (a) confirm patent application has been filed, (b) specify scope (FCP-on-chain vs full architecture vs both), (c) get legal sign-off on the language. Until confirmed, **omit from hero**; can sit in Pillar 2 as "*patent pending — clearance pending publication*" or omitted entirely. **Most credible if narrow** ("patent pending on the FCP-on-chain mechanism").

6. *(New from IRE)* **Heimdal / Mimir naming.** The prior brief named two FCP engines: Heimdal and Mimir. Codebase verification (Explore agent, 2026-05-24) found: Heimdall referenced as a FutureChain blockchain node type (not yet a discrete shipping module in the ANTON repo); **Mimir does not appear anywhere in the codebase**. Either (a) confirm with the FutureChain team that these are real components named in the whitepaper and bring documentation, or (b) reduce to "Heimdall" only / a single un-named FCP engine to avoid claiming what we can't demo.

7. *(New from IRE)* **Throughput + fee claims.** "Hundreds of TPS scaling to thousands" + "0.1% fee, capped at 0.1 FTC" are whitepaper targets. No code or benchmark in the repo backs them. Before publishing: either reference a chain explorer / testnet, mark as "designed for", or drop from the page.

8. *(New from IRE)* **The agent-as-UBO Pillar 3 story.** Conceptually beautiful and unique to us. Operationally: the data model is in place but the full transaction flow (Maya's ANTON pays → chain records Daniel as UBO → Heimdall validates → settlement) is on the roadmap, not shipping. Position as **trajectory** (with the "what's built today" footnote) rather than current feature.

---

## 9. What both Claudes might still have missed (IRE notes)

These are not blockers but worth pressure-testing with Daniel before render:

### 9.1 — The actual integration is the moat
Both briefs almost land this but don't fully say it. The unique thing in the market right now is not ANTON alone (other AI workspaces exist), not FutureChain alone (other chains exist) — it's the *integration*: an AI workspace + a payment rail + an identity rail + an FCP engine + a mesh + an agent protocol, all from one team, all designed to interlock. **Stripe + ChatGPT ≠ ANTON + FutureChain.** Consider making this explicit in Pillar 3.

### 9.2 — The 6-layer vision is the long-form arc
The prior brief uses the whitepaper tagline arc as the close (good). My v1 narrative had the 6-layer progression (Individual → Intelligent → Network → Collaborative → Marketplace → Economy). Both arcs are real. **Recommendation:** keep the four-line tagline arc as the page close (it's poetic and quotable), and use the 6-layer vision in a dedicated whitepaper-page sub-surface for readers who want the deeper structural story.

### 9.3 — Two missing audiences for v2
The prior brief covers six audiences. The IRE pass surfaced two more worth considering for v2:
- **AI agent builders** — the people who'd actually use AAP. Strong fit.
- **Family offices** — sovereignty + 27-jurisdiction tax + KYC. Niche but high-LTV.

### 9.4 — The "open" framing needs honesty
The brief and my v1 narrative both lean on "open." The reality:
- The `.anton` bundle format is open and documented (`docs/anton-format/types/` — 45+ types)
- The architecture is transparent (CLAUDE.md, AGENTS.md, ADRs all public-readable)
- The actual ANTON source code is **closed but transparent** — not OSI open-source
- The Companion/Business/Pay/Comm apps are also closed-but-transparent

If we say "open source" without qualification, sophisticated readers will check the licence file and find it isn't. **Recommendation:** lead with "**open** architecture, open formats, your data yours" — let the reader infer the spirit. Reserve "open source" for the moment Daniel publishes under an OSI licence.

### 9.5 — The Stripe-of-Agents framing
Not in either brief but worth a sentence: when the agent economy actually arrives — agents booking flights, agents paying suppliers, agents subscribing to APIs — they will need rails that carry agent identity, UBO chains, and payment in one message. **FutureChain is the only stack designed end-to-end for that scenario.** This is the "where is this going" line that a fin-influencer can quote.

### 9.6 — A closing "talk to Daniel" personal note
The audience is a small set of high-signal individuals. A real human invitation at the foot of the page — "I'm Daniel. I built this because [reason]. If you want to see it, talk to me." — outperforms a contact form by a wide margin for this audience size. Recommend.

---

## 10. Recommended sequence to ship

1. **Daniel locks open questions 5 + 6 + 7** (patent / Heimdal-Mimir / TPS+fee) so we're publishing only what we can demo.
2. **Daniel reviews this brief.** Edits / confirms voice / approves.
3. **Hand to Claude Design** with this file + the existing whitepaper PDFs + the brand-asset directory.
4. **Design renders v1.** Render against the spine; iterate copy if any sentence feels weak in layout.
5. **Daniel approves.** Ship.
6. **First-week measurement.** Watch share patterns; the hero line is designed to travel in clips — confirm it does.

---

## 11. Provenance — what came from where

| Origin | What it contributed |
|---|---|
| Daniel's voice-memo brain dump | All raw thinking — flexibility, FCP wedge, ISO 20022, agent-as-UBO, the four apps, the six-layer vision |
| Prior Claude session (`ANTON_FutureChain_Marketing_Copy_Brief.md`) | Sovereignty spine · hero line · 3-pillar structure · whitepaper tagline arc · the 6-audience tiles · voice/tone notes · tonal references · anti-patterns · 5 of the open questions |
| My prior work (`MARKETING_BRIEF.md`, `MARKETING_NARRATIVE.md`) | Module counts · app suite + chevrons · Counsel's Desk / Risk Atlas / Tabular Review / Evidence Pack proof points · brand asset map · suite-lockup files · stats strip candidates |
| IRE pass (this session) | The integration-as-moat argument · what-both-missed list · v2 audiences · "open vs open-source" honesty · agent-economy framing |
| Explore agent codebase verification (this session) | What's built vs aspirational footnotes throughout · the "Heimdal / Mimir" caveat · the TPS/fee caveats · the agent-as-UBO honesty in Pillar 3 |

---

*End of integrated brief. For asset paths, see §7. For the full reference catalogue including all 12 pillars / 27 tax jurisdictions / 10 regulatory jurisdictions / 30 languages, see `MARKETING_BRIEF.md`. Direct any questions to Daniel — daniel.bardun@gmail.com.*
