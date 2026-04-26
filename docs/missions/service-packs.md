# Service Packs

> A **Service Pack** is a templated bundle of credentials + capability descriptors + per-mission configuration. It's how a mission gets the external-system access it needs without the user re-entering credentials per run.

---

## What's in a Service Pack

| Component | Purpose |
|---|---|
| **Credential bindings** | References (not the secrets themselves) to entries in the Credential Vault |
| **Capability descriptors** | Which AAP verbs the mission may invoke at which portals |
| **Service-specific config** | E.g. CMS site id, CRM workspace id, sender email, default channel |
| **Authoring metadata** | Who built the pack, version, expected mission category |

A pack is a portable artefact — it can be exported as a `.anton skill-pack` bundle (bundle type #5) and shared between users / orgs.

---

## How `service-pack-manager.ts` works

The lifecycle:

1. **Install** — user adds a Service Pack to their workspace (from a `.anton skill-pack` bundle or built-in catalogue).
2. **Validate** — `service-pack-manager.ts` verifies the credential references resolve to vault entries and the capability descriptors are syntactically valid.
3. **Bind** — when a mission instantiates that needs the pack's services, `mission-credential.ts` binds the vault references to the running mission. Credentials remain in the vault — only references travel into the mission's task graph.
4. **Invoke** — task execution that calls an external service goes through `mission-credential.ts` to fetch the actual credential at call time. Each fetch is logged.
5. **Rotate** — on credential rotation in the vault, no mission code changes; the next fetch returns the rotated value.
6. **Revoke** — pack can be uninstalled at any time. In-flight missions either pause (if mid-task) or fail-fast (if task is in progress).

---

## Pack types

Today's seeded packs (loose; expand as missions are added):

| Pack | For mission(s) | External systems |
|---|---|---|
| **Roaring Entity** | AMLR Readiness, FCP-aligned modules | Roaring registry feed (Nordic) |
| **Dow Jones Screening** | AMLR Readiness, sanctions-related modules | DJ sanctions / PEP / adverse-media |
| **Generic CMS** | Content Factory (when seeded) | WordPress / Ghost / generic CMS API |
| **Generic CRM** | Outbound Sales Machine (when seeded) | Salesforce / HubSpot via the connectors shipped in `connectors/` |

(The marketing-named missions per [`README.md`](README.md) each imply a target Service Pack — those ship together.)

---

## Distributing a Service Pack as `.anton skill-pack`

Packs travel between ANTON instances as bundle type #5 (`skill-pack`). The bundle:

- Lists the credential references (NOT the credentials — vault content stays per-instance)
- Lists the capability descriptors
- Lists the per-service config templates (with `<<USER_INPUT>>` placeholders for sensitive bits)

A receiving instance imports the pack, prompts the user for the placeholders (which become vault entries), and the pack is then ready for use.

---

## Where to look

- **Code:** `server/services/missions/service-pack-manager.ts`
- **Bundle format:** [`/docs/anton-format/types/skill-pack.md`](../anton-format/types/skill-pack.md)
- **Vault:** [`credential-vault.md`](credential-vault.md)
- **Architecture:** [`/docs/architecture/24-workflow-engine.md`](../architecture/24-workflow-engine.md)
