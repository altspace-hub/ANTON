# `skill` — Skill

> **Family:** Work-pillar core
> **Purpose:** Reusable prompt fragment that can be mixed into any session as a Layer-5 skill.
> **Typical transport:** Marketplace, AAP, local file.

## Content directory layout

```text
manifest.json
contents/skills/<skill-id>.md      # the skill body — concise, opinionated
```

## Apply behaviour

Inserts a row into `skills` for the importing user. No automatic activation — the user enables per-session.

## Signing

Optional.

## Related

- Service: `server/services/anton-importer.ts`
- Table: `skills`, `community_skills`
- Architecture: [`/docs/architecture/11-seven-layer-prompt-builder.md`](../../architecture/11-seven-layer-prompt-builder.md) (Layer 5)
