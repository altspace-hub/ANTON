# `persona` — Expert Persona

> **Family:** Work-pillar core
> **Purpose:** Named expert role with defined tone, lens, and behavioural posture (Layer 4).
> **Typical transport:** Marketplace, AAP, local file.

## Content directory layout

```text
manifest.json
contents/personas/<persona-id>.md
```

## Apply behaviour

Adds the persona to the user's available roster. The persona becomes selectable as Layer-4 in any session.

## Signing

Optional.

## Related

- Service: `server/services/anton-importer.ts`
- Code anchor: `EXPERT_ROLE_INSTRUCTIONS` map in `prompt-builder.ts:25–145`
- Architecture: [`/docs/architecture/11-seven-layer-prompt-builder.md`](../../architecture/11-seven-layer-prompt-builder.md) (Layer 4)
