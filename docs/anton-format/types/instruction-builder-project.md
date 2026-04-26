# `instruction-builder-project` — Instruction Builder Project

> **Family:** Coding
> **Purpose:** Output of the AI Code Instruction Builder (Tier 4 Stage 4) — prompts for an external AI assistant to implement work in chunks.
> **Typical transport:** Local, AAP.

## Content directory layout

```text
manifest.json
contents/instruction-builder/<project-id>/
  ├── overview.md
  ├── chunks/
  │   └── chunk-NN.md
  └── alignment.md
```

## Apply behaviour

Loads as a project workspace; the receiving developer feeds chunks to their AI assistant in order.

## Signing

Recommended.

## Related

- Service: `server/services/anton-importer.ts`

- Architecture: [`/docs/architecture/25-coding-area.md`](../../architecture/25-coding-area.md)
