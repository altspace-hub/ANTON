# `legal-research-session` — Legal Research Session

> **Family:** Records / Reproducibility
> **Purpose:** A Counsel's Desk research session packaged as a record: the full Q&A transcript, pinned findings, the verified-citation ledger WITH per-citation verification statuses, and the mode/expert-role configuration.
> **Typical transport:** Local file, e-mail to co-counsel, AAP (peer ANTON).

## Content directory layout

```text
manifest.json              # spec envelope + session block + sha256 content checksum
session.json               # mode, expert_role, active knowledge pack ids, counts, dates
transcript.json            # research questions with their full message history (incl. thinking)
transcript.md              # the same transcript, human-readable
pinned-findings.json       # findings the researcher pinned, with sources
citations.json             # citation ledger incl. verification status per citation
README.md
```

Payload files live at the archive root — the registry entry's `primaryContentDir` is empty.

## What travels vs what does NOT

**Travels:** the complete Q&A transcript as persisted (`research_questions` holds the per-question message history), pinned findings, every captured citation with its ground-truth verification status (`verified_local` / `verified_remote` / `unresolved` / `not_found` — item 1.4's ledger), and the session's mode + expert-role configuration.

**Does NOT travel:**

- **Knowledge pack contents** — `active_knowledge_packs` lists pack ids only; the packs themselves ship as `regulatory-knowledge-pack` bundles.
- **Verification ≠ correctness.** A verified citation proves the reference RESOLVES against local frameworks or EUR-Lex — not that the AI's reading of it is legally correct. The statuses travel verbatim, including unresolved ones.

## Apply behaviour

**Export-only in this wave — there is no importer.** This is a research *record* for sharing and archival, not a re-runnable session. The structural validation pass in the dispatching validator covers safety on receipt.

## Signing

Opt-in instance-key Ed25519 signature (`sign: false` to skip) — the signature covers the manifest including the content checksum.

## Export surface

- `POST /api/legal-research/:id/export-bundle` `{ sign?, author? }` (owner-gated).

## Related

- Service: `server/services/anton-bundler.ts` (`bundleLegalResearchSessionToAnton`)
- Table: `legal_research_sessions` (`research_questions`, `pinned_findings`, `citations`, `active_knowledge_packs`)
- Citation ledger: `server/services/citation-ledger.ts` (item 1.4)
