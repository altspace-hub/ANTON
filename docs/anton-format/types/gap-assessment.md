# `gap-assessment` — Gap Assessment

> **Family:** Records / Reproducibility
> **Purpose:** A complete Compliance Gap Assessment record — context, per-article findings with their deterministic-rubric provenance, evidence manifest, iteration history, second opinions — packaged for sharing with a client/board/auditor or for archival.
> **Typical transport:** Local file, e-mail to stakeholders, AAP (peer ANTON).

## Content directory layout

```text
manifest.json              # spec envelope + assessment block + sha256 content checksum
assessment.json            # title, frameworks, scope_config, context_config (minus evidence texts)
findings.json              # per-article findings: facts, rubricVersion, computed + effective
                           # scores, override metadata (who/why/when/kind), evidenceRefs, warnings
evidence-manifest.json     # every addressable evidence item: docId + name + kind + sha256 + chars
evidence/<docId>.md        # the text evidence items that are stored IN the assessment record
iterations.json            # iteration summaries: number, status, score summary, notes, dates
second-opinions.json       # comparison-slot opinions from a different model (when present)
board-summary.md           # board summary (when generated)
capability-view.json       # capability synthesis (when generated)
roadmap.json               # remediation roadmap (when generated)
README.md
```

Payload files live at the archive root — the registry entry's `primaryContentDir` is empty.

## Evidence — what travels vs what does NOT (ground truth)

- Small **text evidence items** (pasted/typed into the assessment) are stored in the database (`context_config.evidenceItems`) and **do travel** under `evidence/`, each hash-listed in `evidence-manifest.json`.
- Documents referenced through **knowledge sources** (local folders, uploads, URLs) were never stored in the assessment row — they do **not** travel. The manifest still names and hashes the addressable items, so a recipient who is given the documents separately can verify them.
- Full iteration **snapshots stay home** (they duplicate `findings.json`); only per-iteration summaries travel.

## Scoring provenance

Findings carry the Wave-1 deterministic-scoring trail: structured criterion `facts`, the `rubricVersion` that computed them, `computedScore/computedNumericScore/computedPriority` preserved beside the effective values, and assessor overrides with `overrideKind`, `overrideReason`, `overriddenBy`, `overriddenAt`. The LLM only wrote the rationale — the scores are reproducible from the facts via `gap-scoring.ts`.

## Apply behaviour

**Export-only in this wave — there is no importer.** This is a *record*, not a template: it documents what was assessed and how it was scored. (Honesty note: do not promise "successor handover" workflows on top of this type until an importer exists.) The structural validation pass in the dispatching validator covers safety on receipt.

## Signing

Opt-in instance-key Ed25519 signature (`sign: false` to skip) — the signature covers the manifest including the content checksum.

## Export surface

- `POST /api/gap-assessments/:id/export-bundle` `{ sign?, author? }` (owner-gated).

## Related

- Service: `server/services/anton-bundler.ts` (`bundleGapAssessmentToAnton`)
- Tables: `gap_assessments` (incl. `evidence_manifest`, migration 222), `gap_findings` (facts/rubric/override columns, migration 222), `gap_iterations`, `gap_finding_opinions` (migration 224)
- Engine: `server/services/gap-assessment-engine.ts` (`mapFindingRow`, evidence helpers), `server/services/gap-scoring.ts`
