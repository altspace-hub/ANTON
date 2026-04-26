# Coding

> ANTON's 4-tier software development pillar (Code Review → Script-Lite → Script-Medium → Coding-Large) plus Tier 5 (Hardware Build, see [`/docs/hardware/`](../hardware/)). Tier 4 is the differentiator — persona-panel architecture review + AI Code Instruction Builder + Project Alignment Reviewer.

---

## Quick map

| If you want to… | Read |
|---|---|
| Strategic positioning | [`/docs/marketing/coding.md`](../marketing/coding.md) |
| Architecture diagram | [`/docs/architecture/25-coding-area.md`](../architecture/25-coding-area.md) |
| Tier 5 (Hardware Build) | [`/docs/hardware/`](../hardware/) |
| Extending Coding | [`extending.md`](extending.md) |

---

## Tier surfaces

| Tier | Pages | Routes | Purpose |
|---|---|---|---|
| 1 — Code Review | `CodeReviewPage` | `coding-review.ts` | Single-shot review |
| 2 — Script-Lite | `ScriptLitePage` | `coding-scripts.ts` | Single-file script |
| 3 — Script-Medium | `ScriptMediumPage` | `coding-scripts.ts` | Multi-file skeleton |
| 4 — Coding-Large | `CodingLargeDiscoveryPage` · `CodingLargeArchitecturePage` · `CodingLargeReleasePage` · `CodingLargeProjectPage` · `InstructionBuilderPage` · `AlignmentReviewerPage` | `coding-large.ts` · `coding.ts` | Full discovery → architecture → release → instruction → alignment programme |

10 Tier 1–4 pages + 9 Tier 5 (Hardware) pages.

---

## Service surface

| Service | Tier |
|---|---|
| `coding-review.ts` | 1 |
| `coding-scripts.ts` | 2, 3 |
| `coding-large.ts` | 4 — discovery, architecture, release |
| `coding-large-project.ts` | 4 — project workspace |
| `coding-instruction-builder.ts` | 4 — prompts for AI assistant |
| `coding-alignment-reviewer.ts` | 4 — gate 4 verification |

Persona-panel personas live as system prompts under `server/areas/coding/personas/` (Security Analyst, Compliance Officer, Product Manager, Solutions Architect).

---

## The Tier 4 stage flow

1. **Discovery** — produce a Discovery Summary Document capturing problem, constraints, success criteria, glossary, stakeholders.
2. **Architecture** — expand into system design.
3. **Persona-panel review** — Security / Compliance / PM / Solutions Architect each return a structured critique. User updates architecture.
4. **Release Planning** — turn architecture into milestones + risk register + rollout strategy.
5. **Instruction Builder** — produce per-chunk prompts for an AI assistant (Claude Code, Cursor, etc.) to implement.
6. **Alignment Review** — verify produced code traces back to Discovery Summary; no scope drift; signed alignment certificate.

Output of Stage 5: `.anton instruction-builder-project` bundle (#10) — portable + signed + reusable.

---

## Bundle types (Coding family)

Per [`/docs/anton-format/`](../anton-format/):

| Bundle | Purpose |
|---|---|
| `coding-blueprint` (#6) | Architectural blueprint + persona critiques |
| `coding-review-profile` (#7) | Configurable review profile |
| `script-lite-template` (#8) | Single-file script template |
| `script-medium-template` (#9) | Multi-file project scaffold |
| `instruction-builder-project` (#10) | Tier 4 Stage 5 output |

---

## Where to start

- **Try it:** `/coding` (landing) → pick a tier
- **Code:** `server/services/coding-*.ts`
- **Marketing:** [`/docs/marketing/coding.md`](../marketing/coding.md)
- **Architecture:** [`/docs/architecture/25-coding-area.md`](../architecture/25-coding-area.md)
- **Hardware (Tier 5):** [`/docs/hardware/`](../hardware/)
- **Extending:** [`extending.md`](extending.md)

---

*Refresh when a new tier ships, when persona-panel composition changes, or when Instruction Builder bundle format bumps.*
