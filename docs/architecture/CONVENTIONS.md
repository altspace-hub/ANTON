# Architecture Diagram Conventions

Distilled from `ANTON_Architecture_Schematics_Brief.md` Part D. These rules apply to every file in `/docs/architecture/`.

---

## File-header template

```markdown
# [Diagram ID] — [Title]

**Status of diagram:** Generated YYYY-MM-DD by [author/tool] from commit [sha]
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Maintainer note:** Regenerate when [condition].

## Diagram

` ` ` mermaid
[diagram code]
` ` `

## Legend
[explain any non-obvious labels, colours, or status badges]

## Source-of-truth references
- `path/to/file.ts:L120-L180` — what this defines
- `path/to/other.ts:L45-L90` — what this defines

## Open questions
- [anything the audit could not confirm]

## Related diagrams
- [Diagram ID] — [Title]
```

The strategic-exception diagram (`04-six-layer-vision`) is allowed looser citations because it maps features to vision layers rather than describing structure. Every other diagram requires per-node/edge citations.

---

## Status badges

Use these exact strings inside node labels and tables:

- `✅ Built` — code present and wired in nav/UI; reachable by a user.
- `🟢 Partial` — code exists but not fully wired or with known gaps.
- `📋 Spec-only` — design doc exists, no code yet.
- `❌ Future` — mentioned in roadmap, not yet specified.

Don't combine badges in one node ("✅/🟢"). If a node spans both states, split it into two nodes with separate edges.

---

## Citations

- Every node, edge, or label that refers to a real code element must end with a citation marker — either `[1]` style with a numbered footer, OR a direct `path/to/file.ts:Lxx` reference in the *Source-of-truth references* section.
- "Obvious" references are not exempt. If you wrote `prompt-builder.ts`, cite `server/services/prompt-builder.ts` in the footer.
- Line ranges are preferred over file-only references when a specific function is meant.

---

## Mermaid features known to work in GitHub

GitHub renders Mermaid in markdown natively. Confirmed-working features in this repo:

- `flowchart LR` / `TB` / `TD`
- `sequenceDiagram`
- `stateDiagram-v2`
- `erDiagram`
- `classDef` styling + `class Node className` assignment
- `subgraph` (with `direction TB|LR`)
- `stroke-dasharray` for dashed/dotted borders
- HTML `<br/>` and `<b>…</b>` inside node labels
- Bidirectional arrow `<-->`

Not safe in GitHub Mermaid (avoid):

- `gantt` charts with complex date arithmetic
- `mindmap` (rendering inconsistent)
- `requirementDiagram`
- Mermaid `init` directive blocks (theming) — works but breaks when GitHub bumps Mermaid version
- Custom fonts via `themeVariables`
- Click events / external links (silently dropped)

---

## Things to avoid

- **Bidirectional arrows** unless the relationship is genuinely two-way. Default is unidirectional with named direction.
- **Vague labels** like "Service Layer" or "Various services". Name the actual service.
- **Edges you can't grep for.** If you can't `grep` an import, route registration, or message send, don't draw the connection.
- **Mixing built and spec-only state in one node.** Split the node — one ✅ Built, one 📋 Spec-only — and connect with an arrow.
- **Mermaid features that don't render on GitHub.** Test before commit by viewing the file on `github.com`.
- **Stale "regenerated on" dates.** If you edit a Mermaid block, bump the date.
- **Unstable IDs.** Don't number nodes by line of code; name them semantically.

---

## Naming convention for files

- `NN-short-slug.md` for Group 1–4 (NN = two-digit ID).
- Database group: `20-database-schema.md` is the index; `20a-database-areas.md`, `20b-database-knowledge.md`, etc. are the per-group ER diagrams.
- Future-state in `future/` with `f-` prefix: `future/f-50-markets-pillar.md`.

---

## Subsystem status — current snapshot

These are the canonical labels for the major subsystems (matched against `_audit-notes.md`):

| Subsystem | Current status |
|---|---|
| Multi-LLM Routing | ✅ Built |
| Prompt Caching (Anthropic) | ✅ Built |
| 7-Layer Prompt Builder | ✅ Built |
| Knowledge Sources (4 modes) | ✅ Built |
| External Data Integration | 🟢 Partial |
| Workflow Engine (12 step types) | 🟢 Partial |
| Orchestrator (4-phase) | 🟢 Partial (Phase 1 wired, 2–4 scaffolded) |
| Iterative Reasoning Engine (IRE) | ✅ Built |
| Reasoning Trails (audit) | 🟢 Partial (DB ✅, viewer surface 📋) |
| Pathfinder | ✅ Built |
| Companion App Gateway | ✅ Built |
| AAP / ANTON Agent Protocol | 🟢 Partial |
| Specialized Agents (Layer 4) | ✅ Built |
| Risk Atlas (7-stage) | ✅ Built |
| Missions | ✅ Built |
| Portals + Pathfinder | ✅ Built |
| Markets Pillar | ✅ Built |
| Coding Area (4-tier) | ✅ Built |
| `.anton` Bundle Format | ✅ Built (~48 types) |
| Marketplace economy | 🟢 surface · 📋 mechanics |
| FutureChain payment rail | 📋 Spec-only |

When the snapshot above changes, also update `_audit-notes.md` §3.

---

**Owner:** project contributors.
**Last update:** 2026-04-26.
