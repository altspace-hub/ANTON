# ANTON Portals — Registry Protocol Reference

**Document:** Registry Protocol Reference
**Version:** 1.0.0-draft
**Target implementation version:** v0.7.x
**Status:** Draft for implementation — investigation-first
**Owner:** Daniel Bardun / FutureChain AB
**Companion to:** ANTON_Portals_Spec.md, ANTON_Portals_Strategic_Ground.md

---

## 0. Read this first

This document defines the wire protocol between ANTON clients and the `anton.portals` registry service. Every decision here is load-bearing — signatures, schema versions, namespace semantics, and the transparency log format all become permanent once v1 addresses are in use.

**For Claude Code:**

1. Do not implement anything until the Investigation Protocol (§2) is complete.
2. This protocol is **federation-ready by design**. Every operation explicitly declares its namespace and registry operator. The v0.7.x deployment runs one operator in one namespace, but the protocol must not assume that.
3. This protocol requires a **transparency log** from day one. Do not implement operations without implementing log append.
4. **Hard key loss is the v1 recovery model.** Protocol reserves fields for social recovery (v1.1+) — do not implement social recovery logic in v1.
5. Extend existing ANTON systems. Do not duplicate `identity.ts` logic. Do not re-implement Ed25519 handling. Do not invent new canonicalisation.
6. All code changes must follow existing project conventions (TypeScript, pnpm, existing file layout).

---

## 1. Scope and non-scope

### 1.1 In scope (v1.0.0)

- Wire format for registry operations (register, update, transfer, revoke, rotate-key, heartbeat).
- Canonical JSON serialisation rules.
- Ed25519 signature format.
- Namespace semantics (federation-ready, single-operator in practice).
- Reserved name list.
- Transparency log structure and Merkle tree computation.
- Inclusion proof format.
- HTTP endpoint definitions for the registry service.
- Client library guidance.
- Rate limit contract.
- Protocol versioning and migration rules.

### 1.2 Out of scope (deferred)

- Social recovery operations (v1.1+).
- Cross-registry federation handshake (v2.0).
- Namespace creation operations (v2.0).
- Certified-issuer attestation (v1.1+ — tracked in Capability Descriptor spec).
- Registry server implementation specifics (tracked in Registry Server Ops Spec).
- Capability descriptor format (tracked in Capability Descriptor Schema Reference).
- Payment rail integration (tracked in FutureChain spec).

### 1.3 Terminology

| Term | Meaning |
|------|---------|
| **Portal** | A user-created ANTON-accessible web space with a machine-readable capability descriptor. |
| **Name** | The human-readable string identifying a portal, e.g. `daniel.bardun`. |
| **Namespace** | A registry-scoped name space, e.g. `futurechain`. Operated by one registry operator. |
| **Registry operator** | The entity running a registry for a given namespace. v0.7.x: FutureChain AB. |
| **Registry** | The service implementing this protocol. `anton.portals` is FutureChain's registry. |
| **Actor** | The party signing and submitting an operation — typically the portal owner's ANTON identity. |
| **Contact hash** | ANTON's identity identifier, `ANTON-XXXX-XXXX-XXXX-XXXX`. Bound to an Ed25519 keypair. |
| **Operation** | A signed message representing an intended state change (register, update, etc.). |
| **Envelope** | The outer structure of every operation, containing metadata and a signed payload. |
| **Transparency log** | Append-only public record of all successful operations. |
| **Log entry** | A single row in the transparency log referencing one successful operation. |
| **Merkle root** | The root hash of the Merkle tree computed over the log, published hourly. |
| **Inclusion proof** | Cryptographic proof that a specific log entry is part of a published Merkle root. |

---

## 2. Investigation Protocol (MANDATORY)

Before writing any code, complete this investigation. Record findings in `investigation/registry-protocol-investigation.md` in the working branch.

### 2.1 Files to read and understand

```bash
# Identity layer — must be understood completely
find . -type f -name "identity.ts" -not -path "*/node_modules/*"
find . -type f -name "*identity*" -not -path "*/node_modules/*" | grep -v test

# Existing Ed25519 usage — reuse, do not duplicate
grep -rn "Ed25519\|ed25519\|@noble/ed25519" --include="*.ts" | head -30
grep -rn "nacl\|tweetnacl\|sodium" --include="*.ts" | head -20

# Existing canonicalisation or JSON signing patterns
grep -rn "RFC 8785\|canonicaliz\|canonical.*json" --include="*.ts" | head -20
grep -rn "detached.*sign\|signDetached" --include="*.ts" | head -20

# AAP protocol — the pattern to mirror
find . -type f -name "aap-*.ts" -not -path "*/node_modules/*"
grep -rn "AAP.*message\|AAP.*envelope" --include="*.ts" | head -20

# Contact hash format — must match exactly
grep -rn "ANTON-[A-Z0-9]\{4\}-\|contactHash\|contact_hash" --include="*.ts" | head -30
grep -rn "generateContactHash\|formatContactHash" --include="*.ts" | head -10

# HTTP client patterns in the codebase
grep -rn "axios\|fetch(" --include="*.ts" server/ | head -20
find . -type f -name "*-client.ts" -not -path "*/node_modules/*"

# Migration tooling — registry-schema migrations go here
find . -type f -name "*migration*.ts" -not -path "*/node_modules/*" | head -10
```

### 2.2 Questions to answer before coding

By the end of investigation, produce unambiguous answers in the investigation notes:

1. What Ed25519 library is already used in ANTON? What's the exact import path?
2. What is the current contact hash generation algorithm? Is it deterministic from the public key?
3. What timestamp format does ANTON use across AAP and Gateway? (ISO 8601 with milliseconds? With timezone? UTC always?)
4. Does ANTON already use RFC 8785 canonical JSON anywhere? If yes, use that. If no, what JSON library is available?
5. What HTTP client is standard in ANTON server code? (Axios, native fetch, ky?)
6. Where do database migrations live? What's the migration naming convention?
7. How does the existing AAP message type enum work? (String enum, integer enum, discriminated union?) The registry operations should mirror the pattern.
8. What's the existing error-response shape from ANTON API routes? (Standard error envelope?)
9. Does ANTON have a retry/backoff utility? The registry client should reuse it.
10. Is there an existing audit log table in the local client that registry client operations should write to?

### 2.3 Do not proceed past §2 until the investigation is documented.

---

## 3. Addressing and namespace semantics

### 3.1 Canonical address form

```
<name>.<namespace>.portal
```

- `<name>`: the portal's human-readable identifier.
- `<namespace>`: the registry-scoped namespace.
- `.portal`: literal suffix.

Examples:
- `daniel.bardun.futurechain.portal`
- `local-catering.futurechain.portal`
- `advisense.futurechain.portal`

### 3.2 Shorthand (client-side only)

Within an ANTON client with a configured default namespace, users may type `<name>.portal` as a shorthand. The client resolves it against the default namespace before protocol operations. The shorthand never appears on the wire — all protocol operations use the canonical form.

### 3.3 Name rules

A `<name>` must satisfy:

- Length: 3–63 Unicode code points after NFC normalisation.
- Allowed characters: letters (Unicode categories L*), digits (Nd), hyphen `-`, and period `.`.
- Must not start or end with `-` or `.`.
- Must not contain consecutive `.` or `-.` or `.-`.
- IDNA 2008 compliant (verified with a standard IDNA library).
- Lowercased internally (case-insensitive matching).
- Subject to homoglyph/confusable protection (§3.6).

Periods within a `<name>` are permitted (e.g. `daniel.bardun`) but do not create nested namespaces. The name is a single string even with dots.

### 3.4 Namespace rules

A `<namespace>` must satisfy:

- Length: 3–32 ASCII characters.
- Allowed characters: lowercase ASCII letters, digits, and hyphen.
- Must start with a letter.
- Governed by the registry operator (not user-registrable within v1).

**v0.7.x namespaces:**
- `futurechain` — operated by FutureChain AB.

Future namespaces (examples, not committed): `mistral`, `sovereign-eu`, `edu-nordic`. Creation requires an operator-published identity and a federation handshake defined in v2.0.

### 3.5 Reserved names

The following names are reserved globally across all namespaces (current and future):

- `anton`
- `antons`
- `anton-portal`
- `anton-portals`
- `anton-help`
- `anton-support`
- `anton-admin`
- `anton-system`

Per-namespace reservation (the registry operator decides, minimum set for v0.7.x):

- `admin`, `administrator`, `root`, `support`, `help`, `security`, `abuse`, `postmaster`, `noreply`, `no-reply`, `www`, `api`, `mail`, `system`, `test`, `example`, `status`, `staging`, `docs`, `dev`.

Registry operators may extend the per-namespace list. Extensions are announced in the transparency log (operation type `reserve_name`).

### 3.6 Homoglyph and confusable protection (MANDATORY)

Before accepting a registration, the registry performs:

1. **NFC normalisation** of the proposed name.
2. **IDNA 2008 mapping** using a standard library.
3. **Confusable detection** against Unicode UTS #39:
   - Skeleton transform of proposed name.
   - Compare against skeletons of all active registrations in the namespace.
   - Compare against skeletons of all reserved names.
   - Compare against skeletons of revoked names still in dormancy (§5.6).
4. **Rejection** if any skeleton match is found, with error code `E_CONFUSABLE_NAME`.

The registry publishes its UTS #39 version. Clients SHOULD perform the same check locally before submitting a registration to fail fast.

---

## 4. Operation envelope

### 4.1 Envelope schema

Every operation on the wire is wrapped in this envelope:

```json
{
  "schemaVersion": "registry-1.0.0",
  "operation": "<operation-type>",
  "namespace": "<namespace>",
  "registryOperator": "<operator-identity>",
  "timestamp": "<ISO 8601 UTC>",
  "nonce": "<128-bit hex>",
  "actor": {
    "contactHash": "ANTON-XXXX-XXXX-XXXX-XXXX",
    "publicKey": "<Ed25519 public key, base64url unpadded>"
  },
  "payload": { /* operation-specific, see §5 */ },
  "priorOperationId": "<log-id or null>"
}
```

All field names are mandatory. Absence of a field is a protocol error except where explicitly marked optional.

### 4.2 Field rules

| Field | Rule |
|-------|------|
| `schemaVersion` | Exact string `registry-1.0.0` for this protocol version. |
| `operation` | One of the operation types enumerated in §5. |
| `namespace` | Must match the target registry's namespace. |
| `registryOperator` | Identity string of the intended registry operator. v0.7.x value: `ANTON-REG-FUTURECHAIN-V1`. |
| `timestamp` | ISO 8601 UTC with millisecond precision and `Z` suffix: `2026-09-01T12:34:56.789Z`. |
| `nonce` | 32-character lowercase hexadecimal string (128 bits of entropy). Must be unique per actor within a 48-hour window. |
| `actor.contactHash` | Canonical ANTON contact hash. Must derive deterministically from `actor.publicKey`. |
| `actor.publicKey` | Ed25519 public key, base64url-encoded, unpadded (RFC 4648 §5 without `=`). |
| `payload` | Operation-specific body. See §5. |
| `priorOperationId` | Log ID of the most recent operation on the same portal. `null` for the first operation (typically `register`). Registry rejects with `E_CHAIN_BROKEN` if the chain is invalid. |

### 4.3 Signature

The envelope is signed by the actor's Ed25519 private key. The signature is computed over the canonical JSON form of the envelope (§6) and transmitted separately:

```json
{
  "envelope": { /* the envelope above */ },
  "signature": "<Ed25519 signature, base64url unpadded>"
}
```

The signature binds the actor's public key to every field of the envelope. Any mutation of any field invalidates the signature.

### 4.4 Two-signature operations

`transfer` (§5.5) requires two signatures — current owner and new owner — over the same envelope:

```json
{
  "envelope": { /* ... */ },
  "signatures": [
    {
      "role": "current_owner",
      "publicKey": "<current owner pubkey>",
      "signature": "<signature>"
    },
    {
      "role": "new_owner",
      "publicKey": "<new owner pubkey>",
      "signature": "<signature>"
    }
  ]
}
```

Order of signatures is not significant but each must declare its role. Both signatures verify against the same canonical envelope bytes.

### 4.5 Replay protection

The registry enforces three layers:

1. **Timestamp window.** Reject envelopes older than 5 minutes or more than 2 minutes in the future (clock skew tolerance). Error: `E_TIMESTAMP_OUT_OF_WINDOW`.
2. **Nonce uniqueness.** Reject nonces seen from the same `actor.contactHash` within the last 48 hours. Error: `E_NONCE_REPLAY`.
3. **Chain continuity.** Reject if `priorOperationId` doesn't match the last successful operation for the target portal. Error: `E_CHAIN_BROKEN`.

---

## 5. Operation types

Every operation type has: a purpose, a payload schema, validation rules, and log visibility. All operations are logged (§7) except where explicitly marked otherwise.

### 5.1 `register`

**Purpose:** Claim a new name in a namespace.

**Payload:**

```json
{
  "name": "<name>",
  "initialMetadata": {
    "title": "<string, optional>",
    "description": "<string, optional>",
    "category": "<personal|business|community|commerce|team|creator|bulletin|classroom|teacher|other>",
    "publicIndex": false,
    "capabilitySummary": null
  },
  "recoveryFieldsReserved": {
    "recoveryContacts": null,
    "recoveryQuorum": null
  }
}
```

**Validation:**

- `name` satisfies §3.3.
- Not in reserved list (§3.5).
- Not confusable with existing/reserved/dormant (§3.6).
- Actor has fewer than 5 active registrations (soft cap, configurable per-operator).
- `priorOperationId` is `null` (this is the first operation for this portal).

**Side effects:**

- New `portal_registrations` row created.
- Operation appended to transparency log.
- Response includes assigned `portalId` (UUID) and `logId`.

**Error codes:**

- `E_NAME_INVALID`, `E_NAME_RESERVED`, `E_NAME_TAKEN`, `E_CONFUSABLE_NAME`, `E_ACTOR_QUOTA_EXCEEDED`.

### 5.2 `update_metadata`

**Purpose:** Change mutable metadata fields on an existing portal.

**Payload:**

```json
{
  "portalId": "<UUID>",
  "changes": {
    "title": "<string, optional>",
    "description": "<string, optional>",
    "category": "<category, optional>",
    "publicIndex": true
  }
}
```

Only fields included in `changes` are modified. `null` explicitly clears a field; omitted fields are unchanged.

**Validation:**

- Actor is current owner of `portalId`.
- Registration is not revoked.
- Category is in allowed enum.

**Error codes:**

- `E_PORTAL_NOT_FOUND`, `E_NOT_OWNER`, `E_PORTAL_REVOKED`, `E_INVALID_CATEGORY`.

### 5.3 `update_capability_summary`

**Purpose:** Update the flattened capability summary used by Pathfinder discovery indexing.

**Payload:**

```json
{
  "portalId": "<UUID>",
  "capabilitySummary": {
    "capabilityVerbs": ["contact", "order", "book"],
    "tags": ["catering", "events", "stockholm"],
    "serviceAreas": ["SE-AB", "SE-C"],
    "languages": ["sv", "en"],
    "descriptorHash": "<sha-256 of current capability descriptor>"
  }
}
```

Separated from `update_metadata` because capability summaries change more frequently and can trigger search-index updates without touching other metadata.

**Validation:**

- Actor is current owner.
- `capabilityVerbs` values are from the canonical verb list (see Capability Descriptor Schema Reference).
- `descriptorHash` is a valid SHA-256 hex string.

### 5.4 `rotate_key`

**Purpose:** Replace the actor's public key for this portal (e.g. device migration, suspected key compromise).

**Payload:**

```json
{
  "portalId": "<UUID>",
  "newPublicKey": "<Ed25519 public key, base64url unpadded>",
  "newContactHash": "ANTON-XXXX-XXXX-XXXX-XXXX",
  "reason": "<scheduled_rotation|suspected_compromise|device_migration|other>"
}
```

**Validation:**

- Actor (`actor.publicKey` in envelope) is the current owner.
- `newPublicKey` is distinct from current public key.
- `newContactHash` derives deterministically from `newPublicKey`.

**Side effects:**

- Registration's `publicKey` and `contactHash` updated.
- Operation logged with `reason`.

**v1.1+ extension (reserved):** Social recovery rotation will use a variant of this operation with quorum signatures from pre-declared recovery contacts. The protocol reserves operation type `rotate_key_via_recovery` for this.

**Error codes:**

- `E_KEY_UNCHANGED`, `E_CONTACT_HASH_MISMATCH`, `E_NOT_OWNER`.

### 5.5 `transfer`

**Purpose:** Transfer a registration to a new owner.

**Payload:**

```json
{
  "portalId": "<UUID>",
  "newOwner": {
    "contactHash": "ANTON-XXXX-XXXX-XXXX-XXXX",
    "publicKey": "<Ed25519 public key, base64url unpadded>"
  },
  "acceptanceToken": "<opaque string, generated by new owner>"
}
```

**Signatures:** Both current owner and new owner sign the envelope (§4.4).

**Validation:**

- Current owner is actor.
- `newOwner.contactHash` derives from `newOwner.publicKey`.
- New owner's signature is valid against their declared public key.
- Portal has not been transferred in the last 30 days (rate limit to prevent rapid-transfer attacks).

**Side effects:**

- Registration's `publicKey`, `contactHash` updated.
- Operation logged, visible in full history.

**Error codes:**

- `E_NOT_OWNER`, `E_INVALID_SECOND_SIGNATURE`, `E_TRANSFER_RATE_LIMIT`.

### 5.6 `revoke`

**Purpose:** Permanently revoke a registration.

**Payload:**

```json
{
  "portalId": "<UUID>",
  "reason": "<voluntary|key_lost|compromise|other>",
  "note": "<optional free-text, max 500 chars>"
}
```

**Validation:**

- Actor is current owner.

**Side effects:**

- Registration marked `revokedAt` = current timestamp.
- Portal becomes unresolvable (registry returns `E_PORTAL_REVOKED` on resolution).
- Name enters **180-day dormancy**. During dormancy, the name cannot be re-registered (prevents impersonation chain attacks where an attacker waits for a revocation then claims the same name).
- After dormancy expires, the name returns to the available pool.
- Revocation is logged and publicly visible in the transparency log — anyone can verify ownership history.

**Not reversible.** A revoked registration cannot be un-revoked. The former owner must submit a new `register` operation after dormancy expires if they want the name back.

### 5.7 `heartbeat`

**Purpose:** Signed claim that a portal is actively maintained. Updates the registry's `last_seen_at` column used by search ranking.

**Payload:**

```json
{
  "portalId": "<UUID>"
}
```

**Validation:**

- Actor is current owner.

**Rate limit:** Maximum one heartbeat per portal per hour. More frequent submissions are silently accepted with the timestamp of the first accepted one (idempotent within the hour).

**Log visibility:** Heartbeats are **NOT logged to the transparency log** (would cause log bloat with no security value). They are stored in a separate `portal_heartbeats` audit trail accessible via admin API for abuse detection.

This is the single exception to the "all operations are logged" rule. It is explicitly called out here and must be documented in every client implementation.

### 5.8 `reserve_name` (operator-only)

**Purpose:** Registry operator extends the reserved name list.

**Payload:**

```json
{
  "names": ["<name1>", "<name2>"],
  "scope": "global|namespace",
  "reason": "<string>"
}
```

**Signed by:** the registry operator's identity key (not a regular user).

**Side effects:**

- Names added to reserved list.
- Operation logged in transparency log for public audit.
- Existing registrations matching a newly-reserved name are NOT auto-revoked. They continue to function but are flagged for manual review.

### 5.9 Reserved operation types (for forward compatibility)

The following operation type strings are reserved and MUST NOT be used by v1.0.0 clients:

- `rotate_key_via_recovery` (v1.1+ social recovery)
- `declare_recovery_contacts` (v1.1+ social recovery)
- `federate_namespace` (v2.0+ federation handshake)
- `attest_portal` (v1.1+ certified-issuer attestation)
- `create_namespace` (v2.0+ namespace creation)

Registry responds to these with `E_UNKNOWN_OPERATION` in v1.0.0.

---

## 6. Canonical JSON serialisation

All signatures are computed over the canonical JSON form of the envelope. The canonicalisation scheme is **RFC 8785 (JCS)** — JSON Canonicalization Scheme.

### 6.1 Why RFC 8785

- Published Internet standard.
- Reference implementations exist in multiple languages.
- Handles Unicode correctly.
- Handles numeric edge cases deterministically.
- Avoids the long history of bugs in hand-rolled canonicalisation.

### 6.2 Rules summary (informative — normative is RFC 8785)

- UTF-8 encoding, no BOM.
- Object members sorted by key in Unicode code point order.
- No insignificant whitespace.
- Numbers serialised using the shortest ECMAScript-compatible representation.
- Strings escaped per RFC 8259 with specific rules for control characters.
- No trailing commas.

### 6.3 Implementation

Use an existing RFC 8785 library. Do not write your own canonicaliser. Recommended: `@truestamp/canonify` or equivalent TypeScript implementation.

### 6.4 Signing and verification example (informative)

```typescript
// Signing
const envelope = { /* envelope fields */ };
const canonical = canonify(envelope);  // RFC 8785 canonical form as string
const signatureBytes = ed25519.sign(new TextEncoder().encode(canonical), privateKey);
const signature = base64urlEncode(signatureBytes);  // unpadded

// Verification
const canonical = canonify(receivedEnvelope);
const valid = ed25519.verify(
  base64urlDecode(receivedSignature),
  new TextEncoder().encode(canonical),
  publicKey
);
```

---

## 7. Transparency log

### 7.1 Purpose

The transparency log provides an **append-only, publicly auditable record** of every successful registry operation (except heartbeats — §5.7). It ensures that the registry operator cannot silently rewrite ownership history, censor registrations, or inject fake entries without leaving a cryptographically detectable mark.

This is analogous to Certificate Transparency for the Web PKI. Any third party can download the log, verify its integrity, and audit ownership claims.

### 7.2 Log entry format

Every successful non-heartbeat operation produces a log entry:

```json
{
  "logId": <monotonic uint64>,
  "appendedAt": "<ISO 8601 UTC>",
  "signedEnvelope": {
    "envelope": { /* full envelope */ },
    "signature": "<actor signature>",
    "signatures": null
  },
  "registrySignature": "<Ed25519 signature by registry operator key over the above>"
}
```

`signatures` is used for two-signature operations (transfer); otherwise `null`. The registry's signature binds the log entry to its sequence position and commits the operator to its authenticity.

### 7.3 Merkle tree structure

The registry maintains a Merkle tree over the log:

- **Leaf hash:** `SHA-256(0x00 || canonical_json_bytes_of_log_entry)`.
- **Internal node hash:** `SHA-256(0x01 || left_child_hash || right_child_hash)`.
- **Tree structure:** RFC 6962-compatible (same scheme as Certificate Transparency).

Leaf and internal-node domain separators (`0x00` / `0x01`) prevent second-preimage attacks.

### 7.4 Merkle root publication

Every hour, the registry:

1. Computes the current Merkle root over all log entries.
2. Constructs a **signed tree head (STH)**:

```json
{
  "schemaVersion": "sth-1.0.0",
  "registryOperator": "ANTON-REG-FUTURECHAIN-V1",
  "treeSize": <uint64>,
  "merkleRoot": "<SHA-256 hash, hex>",
  "timestamp": "<ISO 8601 UTC>"
}
```

3. Signs the canonical JSON of the STH with the registry operator key.
4. Publishes the STH at `GET /v1/sth/latest` and appends to `GET /v1/sth/history`.

If the hourly STH publication is missed (more than 90 minutes since the last), clients SHOULD raise a visible warning. Missed STH publication is treated as an integrity signal, not a minor outage.

### 7.5 Inclusion proofs

Any client can request an inclusion proof for a specific log entry:

```
GET /v1/log/proof?logId=<id>&treeSize=<size>
```

Response:

```json
{
  "logId": <id>,
  "treeSize": <size>,
  "leafHash": "<hex>",
  "auditPath": ["<hex>", "<hex>", ...]
}
```

Verification: hash the leaf, combine with audit path per RFC 6962, compare against the Merkle root in an STH.

### 7.6 Consistency proofs

Clients can verify that a new STH is a consistent extension of an old STH:

```
GET /v1/sth/consistency?first=<size1>&second=<size2>
```

Response provides the proof path allowing the client to verify that `size2` is an append-only extension of `size1`. If inconsistency is ever detected, the client MUST treat the registry as compromised.

### 7.7 Log auditability — third party tools

The Registry Server Ops Spec defines:

- Anonymous log downloads (paginated, unlimited).
- Open tooling to verify log consistency and STH signatures.
- Publication of the registry operator's public key (`ANTON-REG-FUTURECHAIN-V1`) on the FutureChain site and in the ANTON client's built-in trust store.
- Monitoring recommendations for independent third-party log monitors.

---

## 8. HTTP API

### 8.1 Base URL

v0.7.x: `https://registry.anton.space/v1`

All endpoints are under `/v1`. Future major versions (`/v2`) serve in parallel during the transition period defined in §12.

### 8.2 Endpoint table

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `POST` | `/operations` | Submit a signed operation | Embedded signatures |
| `GET` | `/resolve/{namespace}/{name}` | Resolve a portal name | None |
| `GET` | `/search` | Search public-indexed portals | None |
| `GET` | `/portal/{portalId}` | Get portal metadata by ID | None |
| `GET` | `/portal/{portalId}/history` | Get ownership history from log | None |
| `GET` | `/sth/latest` | Latest signed tree head | None |
| `GET` | `/sth/history` | STH history (paginated) | None |
| `GET` | `/log/entries` | Log entries (paginated) | None |
| `GET` | `/log/proof` | Inclusion proof | None |
| `GET` | `/sth/consistency` | Consistency proof | None |
| `POST` | `/reports` | Submit signed abuse report | Embedded signature |
| `GET` | `/reserved-names` | Current reserved name list | None |
| `GET` | `/status` | Registry health and metadata | None |

### 8.3 Standard response envelope

Success:

```json
{
  "status": "ok",
  "data": { /* endpoint-specific */ }
}
```

Error:

```json
{
  "status": "error",
  "error": {
    "code": "<E_SOMETHING>",
    "message": "<human-readable>",
    "details": { /* optional machine-readable context */ }
  }
}
```

### 8.4 Status codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Operation accepted and committed |
| 400 | Malformed request (invalid envelope, invalid JSON) |
| 401 | Signature invalid |
| 403 | Authorised but not permitted (quota, not owner) |
| 404 | Resource not found |
| 409 | Conflict (name taken, chain broken) |
| 410 | Gone (revoked registration) |
| 422 | Validation failure (invalid payload content) |
| 429 | Rate limit exceeded (§10) |
| 500 | Registry internal error |
| 503 | Registry temporarily unavailable |

### 8.5 Error code catalogue (v1.0.0)

Full list of protocol-defined error codes. Registries MUST NOT invent new codes in v1.0.0; additions require a minor version bump.

- `E_SCHEMA_VERSION_UNSUPPORTED`
- `E_OPERATION_UNKNOWN`
- `E_NAMESPACE_UNKNOWN`
- `E_REGISTRY_OPERATOR_MISMATCH`
- `E_TIMESTAMP_OUT_OF_WINDOW`
- `E_NONCE_REPLAY`
- `E_CHAIN_BROKEN`
- `E_SIGNATURE_INVALID`
- `E_SECOND_SIGNATURE_INVALID`
- `E_CONTACT_HASH_MISMATCH`
- `E_PUBLIC_KEY_INVALID`
- `E_NAME_INVALID`
- `E_NAME_RESERVED`
- `E_NAME_TAKEN`
- `E_CONFUSABLE_NAME`
- `E_ACTOR_QUOTA_EXCEEDED`
- `E_PORTAL_NOT_FOUND`
- `E_NOT_OWNER`
- `E_PORTAL_REVOKED`
- `E_INVALID_CATEGORY`
- `E_KEY_UNCHANGED`
- `E_TRANSFER_RATE_LIMIT`
- `E_RATE_LIMIT_EXCEEDED`
- `E_UNKNOWN_OPERATION`
- `E_UNKNOWN_CAPABILITY_VERB`
- `E_INTERNAL`

### 8.6 Caching

Resolution responses include `Cache-Control` headers:

- Active registration, not recently updated: `max-age=21600` (6 hours).
- Recently updated (within last hour): `max-age=300` (5 minutes).
- Not found: `max-age=300`.
- Revoked: `max-age=86400` (24 hours; revocations are permanent).

Clients SHOULD respect these TTLs. Offline or rate-limited situations use cached data.

---

## 9. Client library guidance

A reference TypeScript client library is part of the v0.7.x deliverable. It MUST:

### 9.1 Core responsibilities

1. Construct, sign, and submit operations.
2. Resolve names with local caching.
3. Verify STH signatures using a bundled trusted operator key.
4. Verify inclusion proofs on demand.
5. Detect and surface STH gaps (missed hourly publications).
6. Detect and surface consistency proof failures (registry compromise).
7. Respect rate limits with backoff.
8. Batch resolution requests where possible.

### 9.2 Trust bootstrap

The client ships with a trust bundle containing registry operator public keys and their claimed namespaces:

```json
{
  "trustStoreVersion": 1,
  "registryOperators": [
    {
      "operatorId": "ANTON-REG-FUTURECHAIN-V1",
      "namespaces": ["futurechain"],
      "publicKey": "<base64url unpadded>",
      "publicKeyFingerprint": "<sha-256 hex>",
      "bundleDate": "2026-04-19",
      "expiresAt": "2027-04-19"
    }
  ]
}
```

The trust bundle is updated via ANTON's standard update channel. Rotating the operator key requires a coordinated trust bundle refresh — the protocol supports overlap periods where both old and new keys are trusted.

### 9.3 Local audit log

Every registry operation submitted by the client is written to the local ANTON audit log (reuse the existing audit table — do not create a new one). Record: operation type, target portal, timestamp, response status, returned log ID if any.

### 9.4 Failure modes and UX signals

The client MUST distinguish and surface:

- **Network failure** (retryable, transient).
- **Registry 5xx** (retryable, registry ops issue).
- **Rate limit (429)** (retry with backoff).
- **Validation error (4xx)** (not retryable, user must fix).
- **Signature verification failure on response** (critical — possible compromise).
- **STH gap detected** (warning — possible operator issue).
- **Consistency proof failure** (critical — registry compromise or fork).

Critical failures must produce a visible, unskippable warning in the ANTON UI.

---

## 10. Rate limits

### 10.1 Protocol-declared limits (registry enforces)

Per-actor (identified by `actor.contactHash`):

| Operation | Burst | Sustained |
|-----------|-------|-----------|
| `register` | 5 per 24 hours | 20 per 30 days |
| `update_metadata` | 20 per 24 hours per portal | — |
| `update_capability_summary` | 20 per 24 hours per portal | — |
| `rotate_key` | 3 per 30 days per portal | — |
| `transfer` | 3 per 30 days per portal | — |
| `revoke` | No limit | — |
| `heartbeat` | 24 per 24 hours per portal | — |

Per-IP (for read endpoints):

| Endpoint | Limit |
|----------|-------|
| `/resolve/*` | 10,000 per hour |
| `/search` | 1,000 per hour |
| `/sth/*` | 1,000 per hour |
| `/log/*` | 500 per hour |
| `/portal/*` | 5,000 per hour |

### 10.2 Rate limit response

On exceeding a limit:

```
HTTP 429 Too Many Requests
Retry-After: <seconds>

{
  "status": "error",
  "error": {
    "code": "E_RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded for operation type 'register'",
    "details": {
      "limit": "5 per 24h",
      "retryAfterSeconds": 3600
    }
  }
}
```

### 10.3 Operator flexibility

Registry operators MAY implement:

- Higher limits for verified actors (e.g. business registrations).
- Lower limits for actors with a history of abuse reports.
- Temporary global limits during incidents.

All such adjustments are policy, not protocol. The protocol specifies the default contract.

---

## 11. Federation forward-compatibility

v1.0.0 runs single-operator. This section describes the protocol fields and semantics that make federation additive rather than breaking.

### 11.1 Already federation-ready

- **Explicit namespace on every operation.** No operation is ambiguous about which namespace it targets.
- **Explicit operator identifier on every operation.** `registryOperator` binds the operation to a specific registry. An operation signed for one operator cannot be replayed at another.
- **Trust store is per-operator.** The client's trust bundle is a list, not a singleton.
- **Transparency log is per-operator.** Each registry operator maintains its own log. Federation does not merge logs.
- **Addressing is per-namespace.** Names in different namespaces do not collide.

### 11.2 Reserved for v2.0 federation

The following operation types and fields are reserved:

- `create_namespace` — operator-published declaration of a new namespace.
- `federate_namespace` — mutual attestation between two registry operators.
- `delegate_resolution` — one operator forwards resolution for a namespace to another.
- Cross-registry search coordination protocol.

v1.0.0 clients encountering these operation types in logs MUST ignore them gracefully (they will be served by v2.0-aware clients).

### 11.3 What v1.0.0 clients will need to handle when federation arrives

v2.0 clients will be able to:

- Resolve names in namespaces operated by multiple registries.
- Verify cross-namespace attestations.
- Aggregate search results across federated registries.

v1.0.0 clients will be upgraded via the standard ANTON update channel before federation goes live.

---

## 12. Versioning and migration

### 12.1 Semantic versioning

`schemaVersion` values follow semver: `registry-MAJOR.MINOR.PATCH`.

- **Patch** (1.0.0 → 1.0.1): editorial clarifications, bugfixes. No wire format changes.
- **Minor** (1.0.0 → 1.1.0): additive changes. New optional fields, new operation types, new error codes. Older clients ignore unknown fields.
- **Major** (1.0.0 → 2.0.0): breaking changes. Registry MUST serve both versions in parallel for minimum 180 days.

### 12.2 Client version declaration

Clients SHOULD include a `User-Agent` identifying the ANTON version and the supported protocol version range:

```
User-Agent: ANTON/0.7.0 RegistryProtocol/1.0.0
```

This allows the registry to provide backward-compatible responses during transitions.

### 12.3 Forward compatibility requirements

v1.0.0 clients MUST:

- Accept responses with additional unknown fields.
- Skip log entries with unknown operation types (with warning logged locally).
- Prompt the user to update ANTON if the registry responds with `E_SCHEMA_VERSION_UNSUPPORTED`.

### 12.4 Migration strategy for the v1 → v2 transition

When v2.0 ships:

1. Registry begins serving both `/v1` and `/v2` endpoints.
2. v2.0 clients distributed via normal update channel.
3. Telemetry tracks v1 client share.
4. Once v1 share falls below 2% AND minimum 180 days have elapsed, v1 is deprecation-announced with 90 days' notice.
5. Final v1 shutdown logged in transparency log (using v2 operation).

---

## 13. Security considerations

### 13.1 Threat model

The protocol is designed assuming:

- Any party can submit any operation with any claimed identity. Signatures are the only trust boundary.
- The registry operator may be honest-but-curious (wants to learn what users are doing) or may become compromised.
- Network observers can see all traffic (counter: TLS for transport; signatures for integrity).
- Key compromise is possible (counter: rotation, revocation, dormancy).
- Third-party clients may be malicious (counter: no client trust is required; all verification is local).

### 13.2 Key management

- Private keys never leave the user's device.
- Registry operator identity key stored in a hardware security module or equivalent.
- Trust bundle rotation procedure documented in the Registry Server Ops Spec.
- No key escrow, no recovery via registry, no custody of user keys by the operator.

### 13.3 Denial of service

- Rate limits (§10) constrain legitimate abuse.
- Registry operator runs its own DoS protection (reverse proxy, WAF) — out of protocol scope.
- Log/STH endpoints served via CDN where possible to absorb traffic.

### 13.4 Registry compromise

If the operator's signing key is compromised:

1. Consistency proofs between STHs will eventually reveal fork attempts.
2. Third-party log monitors raise alarms.
3. Operator rotates key, publishes new trust bundle entry, old entry marked compromised-from date X.
4. Operations under the old key are flagged in the transparency log.

The protocol cannot prevent the window between compromise and detection. It can only ensure that tampering is detectable after the fact.

### 13.5 Privacy

Registry metadata (name, title, description, capability summary) is public when `publicIndex: true`. When `publicIndex: false`, only the name and contact_hash are resolvable; no other metadata is returned to unauthenticated callers.

Actor identity (contact hash and public key) is visible in every signed operation and in the transparency log. **Users submitting registry operations are publishing their identity association with a portal name.** This is by design — registry integrity requires public signing.

Users who want unlinkable portals must use a distinct ANTON identity for each such portal.

---

## 14. Affected files

### 14.1 New files expected

- `server/services/registry-protocol/canonical-json.ts` — RFC 8785 wrapper.
- `server/services/registry-protocol/envelope.ts` — envelope construction and validation.
- `server/services/registry-protocol/signatures.ts` — sign/verify using existing Ed25519 layer.
- `server/services/registry-protocol/operations/*.ts` — one file per operation type.
- `server/services/registry-protocol/rate-limiter.ts` — client-side rate-limit respect.
- `server/services/registry-client/index.ts` — the client library.
- `server/services/registry-client/trust-store.ts` — operator key bundle.
- `server/services/registry-client/log-verifier.ts` — STH and inclusion proof verification.
- `server/services/registry-client/cache.ts` — resolution cache.
- `server/services/registry-client/audit-writer.ts` — writes to existing audit log.
- `server/types/registry.ts` — shared TypeScript types.
- Migration file for any client-side local caching tables.

### 14.2 Existing files to extend

- `identity.ts` — confirm contact hash derivation is deterministic; add helper if needed.
- Audit log service — add registry-operation event types.
- ANTON update channel — trust bundle distribution hook.

### 14.3 NOT in scope for this document

The registry server implementation (the thing at `registry.anton.space`) is tracked in the Registry Server Ops Spec. This document defines what the server serves; the Ops Spec defines how it's run.

---

## 15. Acceptance criteria

### 15.1 Functional

- [ ] All 8 operation types implemented per §5.
- [ ] Canonical JSON via RFC 8785 library, not hand-rolled.
- [ ] Ed25519 signatures reuse existing ANTON identity primitives.
- [ ] Envelope signing/verification round-trips correctly for all operation types.
- [ ] Two-signature operations (transfer) verify both signatures independently.
- [ ] Replay protection rejects stale timestamps, duplicate nonces, and broken chains.
- [ ] Homoglyph protection rejects confusable registrations against active/reserved/dormant names.
- [ ] Transparency log entries produced for all operations except heartbeat.
- [ ] STH inclusion and consistency proofs verifiable by the client.
- [ ] Client trust bundle loaded at startup and used to verify all STHs.
- [ ] Rate limits respected with backoff.
- [ ] All declared error codes reachable and testable.

### 15.2 Non-functional

- [ ] Single resolution round-trip completes in under 200ms from an empty cache against an online registry on typical broadband.
- [ ] Cached resolution resolves in under 5ms.
- [ ] Operation submission with signature round-trip under 500ms.
- [ ] Canonical JSON output is byte-identical across 10 implementations of RFC 8785 used cross-platform.
- [ ] Log verification for a 100-entry range completes in under 1 second client-side.
- [ ] No hand-rolled cryptography.
- [ ] No hand-rolled canonicalisation.
- [ ] No reinvention of identity primitives.

### 15.3 Forward-compatibility

- [ ] v1.0.0 client ignores unknown operation types in logs without crashing.
- [ ] v1.0.0 client ignores unknown fields in responses.
- [ ] v1.0.0 client prompts update on `E_SCHEMA_VERSION_UNSUPPORTED`.
- [ ] User-Agent header includes protocol version range.

### 15.4 Security

- [ ] Private keys never leave the local ANTON.
- [ ] Trust bundle cannot be overridden by untrusted sources.
- [ ] Consistency proof failure produces a critical, unskippable UI warning.
- [ ] STH gap (>90 minutes since last) produces a visible warning.
- [ ] All registry operations recorded to local audit log.

---

## 16. Open questions (non-blocking for draft, resolve before freeze)

1. **Exact RFC 8785 library.** Decision during investigation (§2.2 question 4). `@truestamp/canonify`, `json-canonicalize`, or a vetted alternative.
2. **Trust bundle distribution.** Does it piggyback on the ANTON update channel, or ship as a separate signed artifact with its own cadence? Recommendation: same channel, separate file.
3. **`update_capability_summary` vs a single `update` operation.** Currently split for log-load reasons. Could be merged if capability summary update frequency turns out to be low.
4. **Heartbeat storage.** Separate `portal_heartbeats` table or just an in-memory LRU with periodic flush? Ops-level decision, track in Ops Spec.
5. **Abuse report structure.** Thin for v1.0.0; could expand. Currently deferred to Ops Spec.
6. **IDNA library specifically.** ICU-based, punycode-based, or a vetted JS library? Investigation question.
7. **UTS #39 data version.** Which Unicode version are we pinning for confusables?

---

## 17. Glossary

| Term | Meaning |
|------|---------|
| **STH** | Signed Tree Head. The registry's signed commitment to the current Merkle root and tree size. |
| **RFC 8785** | JSON Canonicalization Scheme. The deterministic JSON serialisation used for signing. |
| **RFC 6962** | Certificate Transparency. The Merkle tree construction adapted here. |
| **IDNA 2008** | Internationalized Domain Names in Applications. Used for name normalisation. |
| **UTS #39** | Unicode Security Mechanisms. Used for confusable detection. |
| **Dormancy** | 180-day period after revocation during which a name cannot be re-registered. |
| **Actor** | The contact hash submitting an operation. |
| **Operator** | The entity running the registry service. |

---

## 18. Appendix: Example operation

### Register operation, fully specified

Envelope (before canonicalisation):

```json
{
  "schemaVersion": "registry-1.0.0",
  "operation": "register",
  "namespace": "futurechain",
  "registryOperator": "ANTON-REG-FUTURECHAIN-V1",
  "timestamp": "2026-09-01T12:34:56.789Z",
  "nonce": "a7f3e4d5c6b8a9f0e1d2c3b4a5968708",
  "actor": {
    "contactHash": "ANTON-7K9P-M2XN-4Q3V-HB5W",
    "publicKey": "p7XKz3fG6h9_D2eR4sT8uV0wXyZbC1dE3fH5iJ7kL9m"
  },
  "payload": {
    "name": "daniel.bardun",
    "initialMetadata": {
      "title": "Daniel Bardun",
      "description": "Personal portal.",
      "category": "personal",
      "publicIndex": true,
      "capabilitySummary": null
    },
    "recoveryFieldsReserved": {
      "recoveryContacts": null,
      "recoveryQuorum": null
    }
  },
  "priorOperationId": null
}
```

Signed submission (to `POST /v1/operations`):

```json
{
  "envelope": { /* the above */ },
  "signature": "oK1mN2bV3cX4dZ5eY6fW7gA8hB9iC0jD1kE2lF3mG4nH5oI6pJ7qK8rL9sM0tN1uO2vP3w"
}
```

Successful response:

```json
{
  "status": "ok",
  "data": {
    "portalId": "6a8f3c2e-1d4b-4a7e-9c0f-5e2b1d8a6c4f",
    "logId": 847231,
    "appendedAt": "2026-09-01T12:34:57.123Z"
  }
}
```

---

**End of Registry Protocol Reference v1.0.0-draft.**

*Extend via numbered addenda (1.0.0-A1, 1.0.0-A2, etc.) for clarifications. Minor additions produce 1.1.0. Breaking changes produce 2.0.0 with mandatory parallel-serve period.*
