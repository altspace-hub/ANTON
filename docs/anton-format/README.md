# `.anton` Bundle Format — Canonical Reference

> **What is `.anton`?** A universal package format used across ANTON. ZIP-based, with a `manifest.json` + content directories. It's how pillars share work, how the marketplace lists items, how AAP transports payloads.
> **Audience:** open-source contributors, integration partners, anyone building tools that interoperate with ANTON instances.
> **Authoritative source:** the `BundleType` union in `server/services/anton-bundler.ts`. This documentation is generated from it; if they ever drift, the union wins.

---

## Manifest structure

```text
my-bundle.anton (ZIP)
├── manifest.json                # required
│   ├── format_version           # e.g. "1.0"
│   ├── bundle_type              # one of the 46 union types
│   ├── name
│   ├── description
│   ├── author { name, contactHash?, signing_key? }
│   ├── version                  # semver
│   ├── created_at
│   ├── contents_count
│   └── signature                # Ed25519 over canonical body (if signed)
├── system-prompt.md             # for module/persona/workflow types
├── guided-inputs.json           # for module types
├── default-config.json          # for module types
├── CHANGELOG.md                 # optional
└── contents/                    # per-type subdirectory
    └── <type-specific>/
```

---

## Signing

1. Build canonical-JSON body via `registry-protocol/canonical-json.ts` (deterministic key order, no whitespace).
2. Sign with the issuing instance's Ed25519 privkey via `community-signing-service.sign()`.
3. Wrap body + signature in a `registry-protocol/envelope.ts` envelope.
4. Set the `signature` field on the manifest.

Verification reverses the flow: open envelope → recompute canonical body → verify signature against author's pubkey (resolved via contact-hash → `connected_users`).

The contact-hash format is `ANTON-XXXX-XXXX-XXXX-XXXX` over hex (`server/services/community-crypto.ts:24`); a base32-style variant exists for career profiles (see `_audit-notes.md` §9 flag F2).

---

## The 46 bundle types

Per-type detail pages live in `types/`. The summary table groups them by family.

### Work-pillar core (5)

| Type | Family | Detail |
|---|---|---|
| `module` | core | [module.md](types/module.md) |
| `skill` | core | [skill.md](types/skill.md) |
| `persona` | core | [persona.md](types/persona.md) |
| `workflow` | core | [workflow.md](types/workflow.md) |
| `skill-pack` | core | [skill-pack.md](types/skill-pack.md) |

### Coding (5)

| Type | Detail |
|---|---|
| `coding-blueprint` | [coding-blueprint.md](types/coding-blueprint.md) |
| `coding-review-profile` | [coding-review-profile.md](types/coding-review-profile.md) |
| `script-lite-template` | [script-lite-template.md](types/script-lite-template.md) |
| `script-medium-template` | [script-medium-template.md](types/script-medium-template.md) |
| `instruction-builder-project` | [instruction-builder-project.md](types/instruction-builder-project.md) |

### Governance / brand / quality (8)

| Type | Detail |
|---|---|
| `compliance-ruleset` | [compliance-ruleset.md](types/compliance-ruleset.md) |
| `radar-config` | [radar-config.md](types/radar-config.md) |
| `quality-baseline` | [quality-baseline.md](types/quality-baseline.md) |
| `brand-template` | [brand-template.md](types/brand-template.md) |
| `output-chain` | [output-chain.md](types/output-chain.md) |
| `review-panel` | [review-panel.md](types/review-panel.md) |
| `project-template` | [project-template.md](types/project-template.md) |
| `audience-profile` | [audience-profile.md](types/audience-profile.md) |

### School (3)

| Type | Detail |
|---|---|
| `lesson-plan` | [lesson-plan.md](types/lesson-plan.md) |
| `study-pack` | [study-pack.md](types/study-pack.md) |
| `assessment-bank` | [assessment-bank.md](types/assessment-bank.md) |

### Knowledge (1)

| Type | Detail |
|---|---|
| `regulatory-knowledge-pack` | [regulatory-knowledge-pack.md](types/regulatory-knowledge-pack.md) |

### Markets (7)

| Type | Detail |
|---|---|
| `market-index` | [market-index.md](types/market-index.md) |
| `market-thesis` | [market-thesis.md](types/market-thesis.md) |
| `market-intelligence-model` | [market-intelligence-model.md](types/market-intelligence-model.md) |
| `market-investigation` | [market-investigation.md](types/market-investigation.md) |
| `market-data-source-config` | [market-data-source-config.md](types/market-data-source-config.md) |
| `market-atom-collection` | [market-atom-collection.md](types/market-atom-collection.md) |
| `market-strategy-pack` | [market-strategy-pack.md](types/market-strategy-pack.md) |

### Network / AAP (1)

| Type | Detail |
|---|---|
| `contact-bundle` | [contact-bundle.md](types/contact-bundle.md) |

### Risk Atlas (3)

| Type | Detail |
|---|---|
| `risk-atlas-industry-pack` | [risk-atlas-industry-pack.md](types/risk-atlas-industry-pack.md) |
| `risk-atlas-fcp-domain-pack` | [risk-atlas-fcp-domain-pack.md](types/risk-atlas-fcp-domain-pack.md) |
| `risk-atlas-export` | [risk-atlas-export.md](types/risk-atlas-export.md) |

### Hardware (7)

| Type | Detail |
|---|---|
| `hardware-knowledge-pack` | [hardware-knowledge-pack.md](types/hardware-knowledge-pack.md) |
| `hardware-template` | [hardware-template.md](types/hardware-template.md) |
| `hardware-project` | [hardware-project.md](types/hardware-project.md) |
| `humanitarian-deployment-kit` | [humanitarian-deployment-kit.md](types/humanitarian-deployment-kit.md) |
| `diagnostic-case-bundle` | [diagnostic-case-bundle.md](types/diagnostic-case-bundle.md) |
| `patch-bundle` | [patch-bundle.md](types/patch-bundle.md) |
| `lifecycle-advisory-bundle` | [lifecycle-advisory-bundle.md](types/lifecycle-advisory-bundle.md) |

### Portals + Compliance + Misc (5)

| Type | Detail |
|---|---|
| `portal` | [portal.md](types/portal.md) |
| `evidence-pack` | [evidence-pack.md](types/evidence-pack.md) |
| `starter-pack` | [starter-pack.md](types/starter-pack.md) |
| `career-profile` | [career-profile.md](types/career-profile.md) |
| `video-playlist` | [video-playlist.md](types/video-playlist.md) |

### Beehive (1)

| Type | Detail |
|---|---|
| `hive-collaborative-output` | [hive-collaborative-output.md](types/hive-collaborative-output.md) |

---

## Lifecycle

```
Author → bundler.create() → optional signing → ZIP → transport → recipient
                                                       ↓
                                                       verify → unzip → apply
```

Transports:

| Transport | Used for |
|---|---|
| **AAP** (peer ANTON) | `contact-bundle`, `evidence-pack`, `market-*`, `risk-atlas-*`, `portal`, `career-profile`, etc. |
| **Companion App Gateway** | Push to paired phone/desktop |
| **Marketplace** | Discovery + monetisation |
| **Local file** | `.anton` saved to `data/` or `workspaces/` |

---

## See also

- **Architecture diagram:** [`/docs/architecture/32-anton-bundle-format.md`](../architecture/32-anton-bundle-format.md) — the full lifecycle + verification flow.
- **AAP transport:** [`/docs/architecture/30-aap-protocol.md`](../architecture/30-aap-protocol.md) — how bundles travel between ANTON instances.
- **Adding a new bundle type:** [`extending.md`](extending.md).

---

*This index is the contributor-facing reference; the architecture diagram (`32-anton-bundle-format.md`) is the structural view. Both regenerate when `BundleType` in `anton-bundler.ts` changes.*
