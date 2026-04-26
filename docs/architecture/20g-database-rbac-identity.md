# 20g-database-rbac-identity — Schema: RBAC / Identity / Auth

**Status of diagram:** Generated 2026-04-26 by Claude Code from commit `0fabf7f` (`openexpert@0.7.5`)
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Maintainer note:** Regenerate when a new identity surface ships (e.g. SSO), when team-mode RBAC roles change, or when the KYC schema evolves.

The persistence behind multi-tenant identity, the Companion App pairing ritual, the FutureChain wallet KYC, and team-mode user/org structures.

## Diagram

```mermaid
erDiagram
  user_profiles ||--o{ connected_users : "is connected user"
  connected_users ||--o{ connected_user_orgs : "member of"
  connected_user_orgs }o--|| org_profiles : "joins"
  org_profiles ||--o{ org_invitations : issues
  org_profiles ||--o{ org_announcements : posts
  org_profiles ||--o{ org_intent_categories : defines
  user_profiles ||--o{ app_devices : "paired devices (Ed25519)"
  app_devices ||--o{ app_sessions : "session per device"
  app_sessions ||--o{ app_session_tokens : "rotating tokens"
  app_devices ||--o{ app_push_tokens : "APNs/FCM/web-push"
  app_devices ||--o{ app_signed_envelope_nonces : "replay-protect"
  app_enrollment_tokens ||--o{ app_devices : "issued for pairing"
  app_auth_nonces }o--|| user_profiles : "anti-replay"
  user_profiles ||--o{ guardians : "guarded by (school)"
  user_profiles ||--o{ guardian_approvals : "approved by"
  user_profiles ||--o{ fc_kyc_profiles : owns
  user_profiles ||--o{ fc_wallets : owns
  instance_identity {
    text id PK
    text pubkey_ed25519
    text privkey_encrypted "AES-256-GCM (INSTANCE_KEY_ENCRYPTION_KEY)"
    text cert_fingerprint
    timestamptz created_at
  }

  user_profiles {
    text id PK
    text email
    text display_name
    text role "admin·member·viewer"
    text deployment_mode
    timestamptz created_at
  }

  connected_users {
    text id PK
    text user_id FK
    text contact_hash "ANTON-XXXX-XXXX-XXXX-XXXX (📋 format)"
    text trust_score
    timestamptz first_seen_at
  }

  connected_user_orgs {
    text user_id FK
    text org_id FK
    text role
    timestamptz joined_at
  }

  org_profiles {
    text id PK
    text name
    text industry
    text region
    json metadata
    timestamptz created_at
  }

  org_invitations {
    text id PK
    text org_id FK
    text email
    text role
    text token
    timestamptz expires_at
  }

  org_announcements {
    text id PK
    text org_id FK
    text title
    text body
    timestamptz posted_at
  }

  org_intent_categories {
    text id PK
    text org_id FK
    text category_name
    text policy
  }

  app_devices {
    text id PK
    text user_id FK
    text device_name
    text platform "ios·android·web"
    text pubkey_ed25519
    text cert_serial
    timestamptz paired_at
    timestamptz last_seen_at
    bool revoked
  }

  app_sessions {
    text id PK
    text device_id FK
    text origin_ip
    timestamptz started_at
    timestamptz expires_at
  }

  app_session_tokens {
    text id PK
    text session_id FK
    text token_hash
    timestamptz issued_at
    timestamptz rotated_to_id FK "rotation chain"
  }

  app_enrollment_tokens {
    text id PK
    text instance_id
    text token
    text confirmation_code "6-digit OOB"
    text intended_user_id
    text intended_role
    timestamptz issued_at
    timestamptz expires_at
    bool consumed
  }

  app_push_tokens {
    text id PK
    text device_id FK
    text platform "apns·fcm·web-push"
    text token
    timestamptz registered_at
  }

  app_signed_envelope_nonces {
    text nonce PK
    text device_id FK
    timestamptz used_at
  }

  app_auth_nonces {
    text nonce PK
    text user_id FK "nullable"
    timestamptz issued_at
    timestamptz consumed_at
  }

  app_messages {
    text id PK
    text session_id FK
    text role
    text content
    timestamptz created_at
  }

  guardians {
    text id PK
    text guardian_user_id FK
    text ward_user_id FK
    text relationship
    timestamptz established_at
  }

  guardian_approvals {
    text id PK
    text guardian_id FK
    text subject_kind "session·module·delivery"
    text subject_id
    text status "pending·approved·denied"
    timestamptz requested_at
    timestamptz resolved_at
  }

  fc_kyc_profiles {
    text user_id FK
    text kyc_level "tier1·tier2·tier3"
    text verification_status
    text encrypted_pii_blob "📋 encryption: deferred"
    timestamptz verified_at
  }

  fc_wallets {
    text id PK
    text user_id FK
    text address
    text chain "futurechain·…"
    text balance_quote
    timestamptz created_at
  }
```

## Notes

- **Two identity surfaces** — `user_profiles` is the universal identity (Work / School / Life / Markets / etc.); `connected_users` is the Network-layer surface used by Community + AAP, carrying the contact hash and trust score.
- **Companion App pairing** ✅ — `instance_identity` holds the instance Ed25519 keypair (privkey AES-GCM encrypted via `INSTANCE_KEY_ENCRYPTION_KEY`). Pairing flow writes `app_enrollment_tokens` → consumed → `app_devices` (with phone Ed25519 pubkey) → `app_sessions` + `app_session_tokens`.
- **Guardian flow** ✅ — School pillar requires `guardians` link before student-account write paths; `guardian_approvals` gates writes that need consent.
- **KYC encryption** 📋 — per memory `project_vision_gaps.md`, encrypted-PII blob handling for `fc_kyc_profiles` is deferred.
- **Contact hash format** — `ANTON-XXXX-XXXX-XXXX-XXXX` is in the spec/memory; not directly grep-confirmed in code yet (📋 for that exact format string).

## Source-of-truth references

- `server/db/schema.sql:86–98` — `user_profiles`.
- `server/db/migrations-pg/077_community_network_foundation.sql` — `connected_users` foundation.
- `server/db/migrations-pg/084_kyc_enhanced.sql` — KYC table.
- `server/db/migrations-pg/085_contact_payment_fields.sql`, `086_identity_payment_and_visibility.sql` — payment + visibility.
- `server/db/migrations-pg/094_app_gateway.sql` — `app_devices`, `app_sessions`, `app_messages`, `app_session_tokens`, `app_enrollment_tokens`.
- `server/db/migrations-pg/130_app_companion_security.sql` — `app_push_tokens`, `app_checkpoints`, `app_signed_envelope_nonces`, `instance_identity`.
- `server/db/migrations-pg/131_app_companion_security_review_fixes.sql` — review fixes.
- `server/db/migrations-pg/110_p2p_replay_protection.sql` — `p2p_message_nonces`.
- `server/services/app-enrollment-service.ts` — pairing ritual + privkey encryption.
- `server/services/identity.ts` (and `src/app/services/identity.ts`) — Ed25519 surface.
- `server/middleware/auth.ts` — JWT (team mode) + session auth (solo mode).

## Related diagrams

- `30-aap-protocol` — uses contact_hash + Ed25519 keys.
- `31-companion-app-gateway` — pairing flow + signed envelopes.
- `f-54-school-mode` — guardian + ward flow.
