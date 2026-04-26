# Coding — One-Pager

> **What it is:** ANTON's AI-led software development pillar. Five tiers (Code Review → Script-Lite → Script-Medium → Coding-Large → Hardware Build) covering the spectrum from "fix this snippet" to "design + implement a multi-team release programme".
> **Who it's for:** anyone shipping software with AI assistance — from solo developers wanting a structured code-review pass, through teams designing a release programme, to hardware/firmware builders.
> **What makes it different:** **persona-panel architecture review** + **AI Code Instruction Builder** + **Project Alignment Reviewer**. Not "AI writes your code" — AI helps you make defensible decisions about what to build, then helps you generate the prompts to feed your AI assistant of choice.

---

## The pitch

Most "AI for coding" tools are autocomplete + chat. Useful, but they don't help you with the hardest parts:

- **Architecture decisions** that survive scrutiny across security / compliance / product / solutions-architect lenses
- **Release planning** that makes the trade-offs explicit
- **Project alignment** — verifying that what got built actually matches what was specified

ANTON's Coding Area is shaped around those harder problems. Tier 1–3 are the standard "AI writes code" tier. Tier 4 (Coding-Large) is where ANTON differentiates: structured discovery → multi-persona architecture review → release planning → instruction generation → alignment verification.

---

## What you can do today

| Tier | Surface | Purpose |
|---|---|---|
| 0 — Landing | `CodingLandingPage` | Tier selector |
| 1 — Code Review | `CodeReviewPage` | Single-shot review of a code snippet / PR |
| 2 — Script-Lite | `ScriptLitePage` | Generate a single script with constraints |
| 3 — Script-Medium | `ScriptMediumPage` | Generate a multi-file project skeleton |
| 4 — Coding-Large | `CodingLargeDiscoveryPage` → `CodingLargeArchitecturePage` → `CodingLargeReleasePage` → `CodingLargeProjectPage` + `InstructionBuilderPage` + `AlignmentReviewerPage` | Full programme: discovery → architecture (with persona panel) → release planning → instruction generation → alignment verification |
| 5 — Hardware Build | See [`/docs/hardware/`](../hardware/) | Firmware + electronics + regulated hardware + field deployments |

10 pages in `src/pages/` (Coding-named) + 9 pages under Hardware.

---

## Persona panel architecture review (Tier 4)

`CodingLargeArchitecturePage` runs the proposed design through a panel of named personas:

- **Security Analyst** — threat-model, OWASP top-10, secret handling, supply-chain
- **Compliance Officer** — data-protection (GDPR), regulated-domain hooks, retention
- **Product Manager** — scope discipline, release-blocking gaps, user value
- **Solutions Architect** — trade-offs, alternatives, technical debt, scalability

Each persona reads the Discovery Summary + draft architecture and returns a structured critique. The user reviews critiques and updates the architecture before passing the next gate.

---

## AI Code Instruction Builder

`InstructionBuilderPage` (Tier 4 Stage 4): takes the spec produced by Discovery + Architecture + Release Planning and produces **prompts for Claude Code** (or any AI assistant) to implement the work in chunks.

The output is a `.anton instruction-builder-project` bundle (#10) — portable, signed, reusable. Your AI assistant runs the chunks; ANTON tracks alignment.

---

## Project Alignment Reviewer

`AlignmentReviewerPage` (Tier 4 Gate 4): verifies that the produced code traces back to the Discovery Summary. No scope drift. Signed alignment certificate.

---

## Tier 5 — Hardware Build

Tier 5 extends the model into firmware + electronics + regulated hardware + humanitarian field deployments. See [`/docs/marketing/tier5-hardware-build.md`](tier5-hardware-build.md) and [`/docs/hardware/`](../hardware/).

---

## Where to look

- **Try it:** `/coding` (landing) → pick a tier
- **Code:** `server/services/coding-*.ts`, `server/routes/coding-*.ts`
- **Docs:** [`/docs/coding/`](../coding/)
- **Architecture:** [`/docs/architecture/25-coding-area.md`](../architecture/25-coding-area.md)
- **Hardware:** [`/docs/marketing/tier5-hardware-build.md`](tier5-hardware-build.md)

---

*Refresh when a new tier ships, when persona-panel review evolves, or when the Instruction Builder format changes.*
