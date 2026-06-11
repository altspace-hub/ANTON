# `module-run` — Module Run

> **Family:** Records / Reproducibility
> **Purpose:** ONE module run, packaged so a coworker can inspect exactly what was asked, with what configuration and which sources, and reproduce it on their own ANTON. The heart-of-vision item of Wave 2 (CORE_EXPERIENCE_REVIEW 2026-06, item 2.2).
> **Typical transport:** Local file, e-mail/chat to a colleague, AAP (peer ANTON).

## Content directory layout

```text
manifest.json              # spec envelope + run block + sha256 content checksum
run.json                   # run metadata: module ref, model, thinking, cost, tokens, prompt hash
config-snapshot.json       # the per-message config_snapshot, VERBATIM — the reproduce keystone
composed-prompt.md         # the full system prompt as sent to the LLM (when captured)
source-manifest.json       # resolved knowledge sources: name + type + sha256 + char count
input.md                   # the user message that produced the output
output.md                  # the assistant output
structured-payload.json    # cached structured extraction (only when hash-proven to match output.md)
quality.json               # Haiku quality score (only when scored)
README.md                  # human-friendly overview incl. the honesty list
```

Payload files live at the archive root (like `hive-collaborative-output`) — the registry entry's `primaryContentDir` is empty.

## What travels vs what does NOT (the honesty contract)

**Travels:**

- The composed 7-layer system prompt (from `run_artifacts`, migration 223). If the stored copy was capped at 2 MB the file carries a `TRUNCATED` header and `run.json`'s `prompt.sha256` still covers the FULL untruncated prompt. Runs that predate migration 223 carry `prompt.included: false` with an honest reason instead of a fabricated prompt.
- The per-message `config_snapshot`, verbatim (model, thinking, formats, personas, skills, knowledge-source config, …).
- The pinned source manifest: every resolved knowledge source's name, type, sha256 and char count. Sources whose content never passes through the resolver (Claude built-in knowledge, native web search) carry `contentHashed: false`.
- Input and output text, cost, token count, `rerun_of` linkage.
- The cached structured payload — only when `sessions.structured_hash` proves the cache belongs to this exact output (never a stale extraction from another turn).
- The quality score, when one was recorded for this content hash.

**Does NOT travel:**

- **Source contents.** Uploaded files, local folders and fetched URL text stay home — only their hashes ship. The importer surfaces these as `sourcesNotIncluded`, and a rerun on the importing instance reports them as *removed* in the source-drift report until re-provided.
- **The model's parametric knowledge** and any web-search results.
- **A seed.** ANTON's providers expose no deterministic seed; `run.json` carries `seed: null`. Reproduction means "same prompt + same config", not a bit-identical output.

## Apply behaviour

Import via `POST /api/exchange/import-run` (multipart `file`). The importer:

1. runs the dispatching validator (structural pass + Ed25519 provenance; an invalid signature blocks import),
2. verifies the manifest's content checksum over the payload files,
3. creates a NEW session in the importer's My Work (`module_id` = the bundle's module id when installed locally, else `imported-run`) with the input + output as messages, `config_snapshot` preserved, and a provenance note on the session (origin session/message, exporting ANTON, signature status),
4. re-pins the run artifact (prompt + source manifest) on the new assistant message so prompt inspection and source-drift work.

The response includes `moduleExists` and a `reproducible: { locally, missingModule?, notes }` hint.

**Reproduce:** because the imported run is a normal session message with a `config_snapshot`, the existing `POST /api/rerun` endpoint ("Rerun with…" in the output toolbar) replays it through the live pipeline — knowledge resolution, prompt assembly, any provider. No run-specific rerun code exists or is needed.

## Signing

Opt-in instance-key Ed25519 signature via the standard `maybeSign` path (`sign: false` to skip). The signature covers the manifest including the content checksum, so payload tamper is detectable transitively.

## Export surfaces

- `POST /api/exchange/export-run` `{ sessionId, messageId?, sign?, author? }` — `messageId` optional (defaults to the latest assistant message in the session).
- UI: the **Export run** chip in the output toolbar (modules and Open Chat — the data model is identical).

## Related

- Service: `server/services/anton-bundler.ts` (`bundleModuleRunToAnton`), `server/services/anton-run-importer.ts`
- Tables: `messages` (`config_snapshot`, `model_id`, `rerun_of`), `run_artifacts`, `quality_scores`, `sessions` (`output_structured`/`structured_hash`)
- Reproduce: `server/routes/rerun.ts` (`POST /api/rerun`)
