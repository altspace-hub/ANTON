# Knowledge Packs

Structured knowledge-graph bundles (`.anton`, `bundle_type: regulatory-knowledge-pack`)
that ground module prompts with entity text. Each pack directory contains:

| File | Purpose |
|---|---|
| `manifest.json` | Pack metadata + governance fields (`effective_date`, `source_url`, `validated_by`, `content_confirmed`) |
| `entities.json` | The entities — `canonical_name — description` is the text injected into prompts |
| `relationships.json` | Typed edges between entities (`from_ref`/`to_ref` must exist in entities) |
| `aliases.json` | Alternative names per entity (entity resolution) |

## Build / validate / eval

```bash
node data/knowledge-packs/build-pack.mjs <pack-dir>   # build one .anton (adds the spec envelope)
node data/knowledge-packs/build-all.mjs               # build stale/missing packs
node data/knowledge-packs/validate-all.mjs            # structural integrity check, all packs
node scripts/eval-bop-packs.mjs                       # retrieval eval for the BoP packs (zero-spend)
```

Import at runtime via `POST /api/knowledge-packs/import` (or the Knowledge UI); activate the
pack so `buildKnowledgePackLayer` injects its entity text into module prompts. Entity
descriptions are embedded at import when an embedding key is configured; without one,
retrieval falls back to deterministic/keyword paths.

## Pack families

- **EU / international regulatory packs** (amlr-2024, dora-nis2, eu-sanctions, …) — authored
  from the regulations by the FCP/Legal workstream; most carry `content_confirmed: true`.
- **Jurisdiction compliance packs 2025/2026** (uk-, swiss-, singapore-, …) — same model,
  per-jurisdiction.
- **BoP packs** (`bop-*`) — see below. Different honesty status; read before relying on them.

## BoP packs (Life pillar grounding) — validation status: AI-DRAFTED, NOT VALIDATED

`bop-kenya-financial-services` (48 entities), `bop-nigeria-financial-services` (46),
`bop-microfinance-universal` (35) exist so Life/BoP modules (microfinance, group lending,
mobile money, consumer protection) stop depending on frontier-model world knowledge and
work acceptably on small/offline models. The universal pack grounds modules when no
country pack matches.

**Honesty headline:** this content was AI-drafted in June 2026 from model knowledge, with
no independent verification. Every manifest says so (`content_confirmed: false`,
`validated_by` absent, disclaimer first in the description), and the import validator
surfaces a "content NOT confirmed" governance warning. Fees, limits, shortcodes, insurance
amounts, and institutional details change frequently and may be wrong or stale — entities
carrying volatile figures have `metadata.verify` notes. Treat the packs as grounding
vocabulary and process scaffolding, **never** as verified regulatory fact.

### How an NGO partner reviews and corrects a BoP pack

1. Open the pack's `entities.json` and review every entity description against current
   local sources (regulator websites, provider tariffs, field experience). Fix or delete
   anything wrong; entities flagged `metadata.verify` first.
2. Update `manifest.json`: set `validated_by` to the reviewer's name/organization/email,
   set `content_confirmed: true`, bump `version`, and add `source_url`s where applicable.
3. Rebuild (`node data/knowledge-packs/build-pack.mjs <pack-dir>`) and re-run
   `validate-all.mjs` + `scripts/eval-bop-packs.mjs`.
4. Re-import the new version on target instances. The governance line shown at import then
   reads "validated by …, content confirmed by author" instead of the warning.

### Retrieval eval

`scripts/eval-bop-packs.mjs` checks, for 20 realistic questions per pack, whether the
expected grounding entities rank in the top 3/5/10 by the production keyword-fallback
scoring over exactly the text the pack layer injects. Zero-spend by default; optional
`--with-llm <ollama-model>` prints with/without-pack answers for manual comparison
(no automated answer grading — that would be an unvalidated judgment).

Scores as of 2026-06-11 (keyword path only; fixtures were authored alongside the content,
so shared vocabulary inflates them — independent questions will score lower):
Kenya hit@10 100% / MRR 0.92 · Nigeria hit@10 100% / MRR 0.86 · Universal hit@10 100% / MRR 0.82.
