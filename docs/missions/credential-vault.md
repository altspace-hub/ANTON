# Credential Vault

> The **Credential Vault** is ANTON's per-instance store of secrets used by Missions and Specialized Agents to call external systems. AES-256-GCM encrypted at rest, never logged, fetched at call time.

---

## What it stores

| Credential type | Examples |
|---|---|
| API tokens | OpenAI / Anthropic keys for non-default providers, OAuth tokens for CRMs |
| Database connection strings | External DB connections used by Workflow Engine `database_query` step |
| SMTP / email credentials | Outbound email senders for Content Factory, Outbound Sales |
| OAuth refresh tokens | Long-lived refresh creds for CRMs (Salesforce, HubSpot) |
| Webhook secrets | HMAC keys for outbound webhooks |
| Per-pack secrets | Whatever a Service Pack declares it needs (`<<USER_INPUT>>` placeholders) |

---

## Encryption model

- **At rest:** AES-256-GCM with per-credential IV. The encryption key is derived from `INSTANCE_KEY_ENCRYPTION_KEY` (32-byte hex env var) — same key used to protect the instance's Ed25519 privkey in `instance_identity` (per `app-enrollment-service.ts`).
- **At use:** decrypted in-memory immediately before the outbound call, scrubbed after.
- **Transit:** never transmitted over the network. Credentials remain on the ANTON instance; AAP transports references, not values.
- **No plaintext fallback:** if `INSTANCE_KEY_ENCRYPTION_KEY` is unset, the vault refuses to store new credentials and logs a one-time warning.

---

## Access control

| Role | What they can do |
|---|---|
| Solo-mode user | Full vault access (single user = single owner) |
| Team-mode user (admin) | Full vault access |
| Team-mode user (member) | Read-only listing (sees credential *names*, not values); creates new entries via prompts |
| Mission task | Fetches a specific credential reference (not the credential id itself) at call time; binding declared in Service Pack |
| Specialized Agent | Same as mission tasks |

Every fetch is logged with: caller (mission id / agent id), credential reference, timestamp, success/fail. Enables audit-grade "who used what credential when" replay.

---

## Rotation policy

Manual + automatic options:

- **Manual rotation:** user updates the value in the vault UI. In-flight tasks finish with the old value; new tasks pick up the new value.
- **OAuth refresh:** `mission-credential.ts` proactively refreshes OAuth tokens when their `expires_at` is within 5 minutes; failure escalates to a checkpoint.
- **Automatic rotation:** scheduled rotation isn't built; flagged as a follow-up for the security investigation pass (F.2 in original brief).

---

## Vault contents are NEVER:

- Logged (`auditLogger.ts` strips known credential-shaped tokens)
- Returned in API responses (the route surface only returns names, not values)
- Included in evidence packs or `.anton` bundle exports
- Visible in workflow trail entries (the trail logs *that* a credential was used, not its value)
- Exported from the instance — credentials stay local; Service Pack references travel

---

## What if my `INSTANCE_KEY_ENCRYPTION_KEY` is lost?

Vault contents become unrecoverable. There is no key escrow by design — the trade-off is that an attacker with file-system access can't decrypt the vault either.

Recommended operational practice:

1. Store `INSTANCE_KEY_ENCRYPTION_KEY` in a separate secrets manager (cloud KMS, 1Password, sealed Kubernetes secret).
2. Back up `INSTANCE_KEY_ENCRYPTION_KEY` to an offline medium (e.g. printed QR in a safe).
3. After rotation events, re-encrypt the vault by exporting → re-importing under the new key.

---

## Where to look

- **Code:** `server/services/credential-vault.ts`, `server/services/missions/mission-credential.ts`
- **Schema:** the `credentials` table (under the missions migration set, 115–122) plus `app_enrollment_tokens` for similar at-rest patterns
- **Architecture:** [`/docs/architecture/20g-database-rbac-identity.md`](../architecture/20g-database-rbac-identity.md) for the broader identity tables
- **Service Packs:** [`service-packs.md`](service-packs.md)
