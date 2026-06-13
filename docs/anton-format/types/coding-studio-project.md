# `coding-studio-project` — ANTON Studio Project

> **Family:** Coding / Records
> **Purpose:** A governed **ANTON Studio** build, packaged for reuse and inspection — the charter, the orchestrator's plan, all four core-team panel decisions, the chosen frameworks, the learned project atoms (the lessons), the final code, and the verified test results. The reusable artifact of the Studio Pillar (`CODING_STUDIO_DESIGN_2026-06-13.md` §F-P5).
> **Typical transport:** Local file, e-mail/chat to a colleague, Marketplace, AAP (peer ANTON).

## Content directory layout

```text
manifest.json            # spec envelope + self-describing security.checksum (+ checksum_files)
charter.md               # the kickoff-workshop Project Charter (problem-first)
plan.json                # the orchestrator's release + task plan, run state, and step log
panels.json              # ALL 4 core-team PANEL DECISIONS (start/build/testing/finish):
                         #   per-expert verdicts + the CODE-COMPUTED rollup + blocking flag
frameworks.json          # chosen frameworks, tech stack, expert panel, studio_language
atoms.json               # the learned PROJECT ATOMS — the lessons (what failed, not to repeat)
test-results.json        # EXECUTED test runs only — verified, never LLM-claimed
code-manifest.json       # every written file's path + sha256 + content_included flag
code/                    # the final written files (workspace-relative paths)
README.md                # human-friendly overview incl. the honesty list
```

Payload files live at the archive root (like `module-run` / `hive-collaborative-output`) — the registry entry's `primaryContentDir` is empty.

## What travels vs what does NOT (the honesty contract)

**Travels:**

- The **charter** (the workshop output, seeded into `coding_projects.discovery_summary`).
- The **release/task plan** the server-side orchestrator produced, plus the run state (status / autonomy / revise-cap / started/finished) and the step log.
- **All four core-team panel decisions** — the seven independent expert verdicts at each gate, plus the panel-level rollup and the `blocking` flag. These are **code-computed** (worst-of rollup; mandatory-role dissent), never set by the LLM.
- The **chosen frameworks**, tech stack, and expert panel.
- The **learned project atoms** — the deterministic lessons minted during the build (`test.failed` / `pattern.works` / `review.flag` / `risk.identified` / `decision.approval`).
- The **final code** — the latest applied workspace files, read back from the bound workspace, plus a manifest with each file's path + sha256.
- The **executed** test runs only — `executed = 1` rows (the server ran the command and observed the exit code). LLM-claimed numbers never travel.

**Does NOT travel:**

- **The scoped per-project DATABASE contents.** `proj_<slug>`'s rows stay home — only the build, not the data it produced, travels.
- **Secrets.** The scoped DSN and the generated DB password live ONLY in the encrypted vault (`coding_studio_databases.scoped_dsn_encrypted`) — never in this bundle, an API response, or a log.
- **Files that could not be read back** from the bound workspace at export time ship as a manifest entry (path + sha256) with no body (`content_included: false`).
- **Determinism.** Reproduction means "same charter + same plan + same models", not a bit-identical rebuild.

## Signing

Optional Ed25519 instance-key signature via the standard `maybeSign` path (the `POST /api/coding/studio/:projectId/export` route signs unless `sign: false`). The signature covers the manifest including the self-describing `security.checksum` over the payload `checksum_files`, so payload tamper is detectable transitively.

## Validation

Generic structural validation (`anton-validator.ts` dispatches on `bundle_type`): ZIP safety, manifest envelope, the self-describing content checksum (auto-verified — no per-type recipe needed), and the `<script>`-strip scan. The type is **source-bearing** (`SOURCE_BEARING_TYPES`), so the `code/` source files are accepted (a low-severity note, never an error — ANTON never executes bundle contents).

## Related

- Service: `server/services/anton-bundler.ts` (`bundleCodingStudioProject`)
- Orchestrator: `server/services/coding-studio-orchestrator.ts`
- Route: `server/routes/coding-studio.ts` (`POST /api/coding/studio/:projectId/export`)
- Migration: `server/db/migrations-pg/240_coding_studio_runs.sql`
