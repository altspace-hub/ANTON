# `.anton` Bundle Format — Canonical Reference

> **What is `.anton`?** A universal package format used across ANTON. ZIP-based, with a `manifest.json` + content directories. It's how pillars share work, how the marketplace lists items, how AAP transports payloads.
> **Audience:** open-source contributors, integration partners, anyone building tools that interoperate with ANTON instances.
> **Authoritative source:** the `BundleType` union in `server/services/anton-bundler.ts`. This documentation is generated from it; if they ever drift, the union wins.

---

## The manifest envelope — the contract

Every `.anton` bundle is a ZIP with a `manifest.json`. Since Wave 2 of the
June-2026 core-experience plan there is exactly **one manifest writer** for
everything the generic bundler produces: `buildSpecManifest()` in
`server/services/anton-bundler.ts`. Whatever else a type needs, the manifest
MUST carry the standard envelope:

```jsonc
{
  "format_version": "1.0.0",        // pinned; readers accept any 1.x with a warning
  "bundle_type": "module",          // one of the 46 registered union types
  "created_at": "2026-06-11T…Z",    // ISO timestamp the bundle was built
  "generator": "openexpert/0.7.5",  // writing software + version
  "package": {
    "id": "com.openexpert.<type>.<id>",
    "name": "…", "version": "1.0.0",
    "author": { "name": "…", "organization": "", "email": "", "url": "" },
    "license": "…", "created_at": "…", "updated_at": "…",
    "tags": [], "target_areas": [], "target_roles": [],
    "min_platform_version": "2.0.0", "languages": ["en"], "description": "…"
  },
  "contents": { "<contentsKey>": 1 },             // counts per registry key
  "compatibility": { "llm_providers": ["…"] },     // derived from real config, never fabricated
  "governance": {                                  // OPTIONAL trust metadata (see below)
    "effective_date": "2027-07-10",
    "source_url": "https://eur-lex.europa.eu/…",
    "validated_by": "jane@example.org",
    "content_confirmed": true
  },
  "signature": { "alg": "ed25519", "…": "…" }      // OPTIONAL Ed25519 provenance (see Signing below)
}
```

Per-type bespoke fields may sit **alongside** the envelope (e.g. the coding
types keep their `type`/`review_lenses` fields; hardware keeps its camelCase
`bundleType` block; module bundles keep the legacy `version`/`meta`/`security`
fields the importer reads). Domain-native formats (knowledge packs, portals,
evidence packs, risk-atlas, career profiles, beehive) keep their own inner
manifests; where their importers tolerate unknown fields, the envelope fields
are written alongside.

```text
my-bundle.anton (ZIP)
├── manifest.json                # required — envelope above (+ per-type fields)
├── system-prompt.md             # for module/persona/workflow types
├── guided-inputs.json           # for module types
├── default-config.json          # for module types
├── CHANGELOG.md                 # optional
└── contents/                    # per-type subdirectory
    └── <type-specific>/
```

### Read-old / write-new

The writer always emits the envelope; the reader accepts **every dialect ever
shipped**: legacy flat module manifests (`formatVersion: "1.0"`), legacy hybrid
module manifests (`version: "1.0.0"` + `meta`, no `bundle_type`), ad-hoc
per-feature manifests (coding `type`, hardware/portal camelCase `bundleType`),
and signed evidence-pack manifests (recognised by `packId` + `manifestHash`).
No `.anton` file ever exported stops importing.

---

## Governance fields (trust metadata)

The `governance` block generalises the knowledge-pack KP-03 pattern to every
bundle type. All fields are **optional** and the writer never fabricates them —
when nothing is known the block is omitted entirely.

| Field | Meaning |
|---|---|
| `effective_date` | ISO date the underlying content takes effect (e.g. a regulation's application date) |
| `source_url` | Canonical URL of the source material (e.g. EUR-Lex permalink) |
| `validated_by` | Name/email of the person who verified the content |
| `content_confirmed` | Author confirmed accuracy at build time |

`POST /api/exchange/validate` and `POST /api/exchange/import` surface the
declared governance in their reports ("Validated by X · Source: Y ·
Effective: Z"). These are author claims — they are **not** independently
verified.

---

## Validation — one dispatching validator

`POST /api/exchange/validate` (`server/services/anton-validator.ts`) reads
`bundle_type` from the manifest and dispatches:

| `bundle_type` | Depth | What runs |
|---|---|---|
| `module` | `full` | The original 5-step deep validation: ZIP integrity, schema + sha256 checksum, content sanitization, prompt-injection scan, dependency resolution |
| any other registered type | `structural` | ZIP safety (path traversal, forbidden binaries; source files are warnings for source-bearing types), manifest envelope checks (1.x version tolerance), `<script>` scan over Markdown, JSON parseability, declared-contents presence via the registry's `contentsKey`/`primaryContentDir` |
| unregistered | — | Friendly error naming the unknown type |

The response carries `{ bundle_type, validated_depth: 'full' | 'structural',
governance?, notes? }`. For types with their own deep validator (portal,
knowledge packs, evidence packs, career profiles, market bundles, school
bundles) the `notes` array points at the surface where deep validation
happens.

Version tolerance: `format_version` 1.x minor variations are accepted with a
warning; only a different major (or garbage) fails.

---

## Signing (Ed25519 provenance — opt-in)

Implemented in `server/services/anton-bundle-signing.ts` (Wave 2.4). Signing is
**opt-in at export** and applied as a post-build step over the finished ZIP:
every bundle type the generic bundler produces can carry it. Unsigned bundles
— every `.anton` ever shipped — keep importing forever with provenance
`{ signed: false }`.

**Signer identity:** the per-instance Ed25519 keypair in the
`instance_identity` table — the same key the App Gateway uses for enrollment
envelopes and Evidence Pack finalisation signs with (key access is shared via
`evidence-pack/signer.ts#getInstanceSigningKeypair`). It is lazily created on
first use in every install, so signing works without any user setup; the
private key is AES-256-GCM encrypted at rest when `INSTANCE_KEY_ENCRYPTION_KEY`
is set. (`community_identity` was rejected as the signer because it only
exists after Community-pillar activation.)

**How a bundle is signed:**

1. Parse `manifest.json` from the built ZIP.
2. Construct the signature block without the signature value, embed it as
   `manifest.signature` with `sig_base64: ""` (the evidence-pack "blanking"
   trick — so `signed_at`, `signer_name` and `signer_pubkey` are themselves
   covered by the signature).
3. Canonicalise the whole manifest via RFC 8785 (JCS,
   `registry-protocol/canonical-json.ts`) and Ed25519-sign the UTF-8 bytes.
4. Fill `sig_base64` and write the manifest back into the ZIP:

```jsonc
"signature": {
  "alg": "ed25519",
  "sig_base64": "…",                  // standard base64, over the blanked canonical manifest
  "signer_pubkey": "302a30…",         // Ed25519 public key, DER SPKI hex
  "signer_name": "ANTON",             // instance display name (optional, signed)
  "signed_at": "2026-06-11T…Z"        // ISO timestamp (signed)
}
```

If no signing identity is available (or the manifest already carries a foreign
`signature` field, e.g. evidence packs), the export proceeds **unsigned** —
signing never blocks a download. `POST /api/exchange/export*` endpoints accept
`sign: false` to opt out; `GET /api/exchange/signing-identity` reports whether
and as whom this instance signs.

**Verification (import/validate):** the dispatching validator recomputes the
blanked canonical manifest and verifies the signature against the **embedded**
pubkey (self-attesting key, like portal descriptors). Results carry
`provenance: { signed, valid, signer_pubkey, signer_name?, signed_at, known }`:

- **valid** → "Signed by X (✓ verified)". Tampering with ANY manifest field
  after signing — envelope, bespoke fields, the content checksum, or the
  signature block itself — fails verification.
- **invalid** → critical error, **import is blocked** ("signature INVALID —
  bundle may have been modified").
- **unsigned** → imports exactly as before, labelled "unsigned (no provenance)".

**TOFU:** valid signers are recorded in the `bundle_signers` table (migration
`225_bundle_signers.sql`) on first sight; `known: true` means this instance has
seen the key before. The first-seen name is pinned — a later bundle claiming a
different name for the same key triggers a warning. This is not a PKI.

**Honest claim — exactly this, no more:** a valid signature proves the
manifest (including the sha256 content checksum where the type carries one) is
untouched since it was signed by the holder of `signer_pubkey`. It does NOT
vouch for content quality, safety, or the real-world identity behind the key.

The contact-hash format is `ANTON-XXXX-XXXX-XXXX-XXXX` over hex (`server/services/community-crypto.ts:24`); a base32-style variant exists for career profiles (see `_audit-notes.md` §9 flag F2).

---

## The 49 bundle types

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

### Records / Reproducibility (3 — Wave 2.2 + 2.5)

| Type | Detail | Importer |
|---|---|---|
| `module-run` | [module-run.md](types/module-run.md) | `POST /api/exchange/import-run` (read-only run viewer; reproduce via Rerun) |
| `gap-assessment` | [gap-assessment.md](types/gap-assessment.md) | export-only (a record, not a template) |
| `legal-research-session` | [legal-research-session.md](types/legal-research-session.md) | export-only (a record, not a template) |

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
