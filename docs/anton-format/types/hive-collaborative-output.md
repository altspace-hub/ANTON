# `hive-collaborative-output` — Hive Collaborative Output

> **Family:** Beehive
> **Purpose:** A concluded BEEHIVE multi-party deliberation, packaged for sharing and archival: the final synthesis plus the full reasoning trail (rounds, contributions, dissents, approvals, convergence path).
> **Typical transport:** Local file, AAP (peer ANTON), Companion App Gateway.

## Content directory layout

```text
manifest.json                  # spec-compliant package metadata + hive block
synthesis.md                   # the final synthesis text (preserves dissent)
README.md                      # human-friendly overview
contents/hive.json             # hive configuration + governance
contents/participants.json     # joined participants + roles
contents/rounds.json           # round summaries + consensus progression
contents/contributions.json    # full signed reasoning trail
contents/dissents.json         # preserved minority positions
contents/approvals.json        # who approved / dissented / abstained
contents/convergence.json      # how positions shifted across rounds
```

Note: unlike most bundle types, the payload files live directly under `contents/` (no per-type subdirectory) — the registry entry's `primaryContentDir` is empty.

The manifest carries an extra `hive` block alongside the standard `package` fields: consensus mode, output format, participant/round/contribution/dissent counts, and the final consensus temperature.

## Apply behaviour

Export-only in v1 — there is no importer. Bundles are produced when a hive is concluded, for sharing the deliberation outcome or archiving the reasoning trail. Re-import may come in a later version.

## Signing

Not signed at the bundle level in v1; individual contributions inside `contents/contributions.json` carry their own signatures from the deliberation protocol.

## Related

- Service: `server/services/beehive/beehive-bundle.ts`
- Tables: `hives`, `hive_participants`, `hive_rounds`, `hive_contributions`, `hive_outputs`
