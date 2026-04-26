# 20f-database-compliance — Schema: Compliance / Audit / Evidence

**Status of diagram:** Generated 2026-04-26 by Claude Code from commit `0fabf7f` (`openexpert@0.7.5`)
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Maintainer note:** Regenerate when a new compliance rule type is added, when Evidence Pack item types expand, or when delegation-compliance evaluation criteria change.

The persistence behind ANTON's compliance-as-code surface, the Evidence Pack module, and the universal security/audit log.

## Diagram

```mermaid
erDiagram
  user_profiles ||--o{ login_attempts : authored
  user_profiles ||--o{ security_events : "associated with"
  user_profiles ||--o{ evidence_packs : owns
  evidence_packs ||--o{ evidence_pack_items : contains
  evidence_packs ||--o{ evidence_pack_shares : "shared via"
  evidence_packs ||--o{ evidence_pack_compliance_gaps : "gaps surfaced"
  evidence_pack_shares ||--o{ evidence_pack_access_log : "access trail"
  delegation_compliance_rules ||--o{ delegation_compliance_evaluations : evaluates
  api_rate_limits }o--|| user_profiles : throttles

  login_attempts {
    text id PK
    text email
    text ip
    text status "success·invalid_password·blocked·rate_limited"
    text reason
    timestamptz attempted_at
  }

  security_events {
    text id PK
    text user_id FK "nullable"
    text event_type "csrf_failure·rate_limit·permission_denied·…"
    text severity "info·warn·critical"
    json payload
    text source_ip
    timestamptz emitted_at
  }

  evidence_packs {
    text id PK
    text user_id FK
    text title
    text framework "AMLR · DORA · ISO27001 · custom"
    text status "draft·signed·shared"
    text instance_signature_ed25519
    text signing_key_fingerprint
    timestamptz created_at
    timestamptz signed_at
  }

  evidence_pack_items {
    text id PK
    text pack_id FK
    text item_type "session·module-output·attachment·external-cite"
    text source_id "session_id · file_uri · url"
    text canonical_body
    text item_signature
    int order_idx
  }

  evidence_pack_compliance_gaps {
    text id PK
    text pack_id FK
    text framework_control_id "e.g. AMLR Art 16 §3"
    text gap_text
    text status "open·waived·resolved"
  }

  evidence_pack_shares {
    text id PK
    text pack_id FK
    text recipient_kind "regulator·external-auditor·internal"
    text recipient_id
    text channel "url·anton-instance·email"
    timestamptz shared_at
  }

  evidence_pack_access_log {
    text id PK
    text share_id FK
    text accessor_id
    timestamptz accessed_at
    text user_agent
    text ip
  }

  delegation_compliance_rules {
    text id PK
    text rule_name
    text rule_body "yaml-encoded predicate"
    text scope "agent·mission·workflow"
    bool active
  }

  delegation_compliance_evaluations {
    text id PK
    text rule_id FK
    text subject_kind "agent_run·mission_step·workflow_run"
    text subject_id
    text outcome "ok·warn·block"
    text rationale
    timestamptz evaluated_at
  }

  api_rate_limits {
    text id PK
    text user_id FK
    text endpoint
    int window_seconds
    int max_requests
    int current_count
    timestamptz window_started_at
  }
```

## Notes

- **Evidence Pack** ✅ — instance-level Ed25519 signing of canonical bodies. Per memory: 4 frameworks shipped (AMLR / DORA / ISO27001 / custom); org-level signing + 3 minor frameworks deferred. Items can be sessions, module outputs, attachments, or external citations.
- **Compliance gaps** are surfaced by deterministic checks (e.g. AMLR Article 16 mandatory components) and rendered in the pack viewer with status flags.
- **Delegation compliance** is the safety net for Specialized Agents and Missions: rules are YAML predicates evaluated per agent run / mission step / workflow run.
- **Security events + login attempts** are the universal audit substrate; `auditLogger.ts` writes here on every middleware-detected anomaly.
- **API rate limits** ✅ — token-bucket per (user, endpoint).

## Source-of-truth references

- `server/db/schema.sql:129–139` — `login_attempts`.
- `server/db/schema.sql:141–155` — `security_events`.
- `server/db/migrations-pg/152_evidence_packs.sql` — Evidence Pack core.
- `server/db/migrations-pg/153_evidence_pack_compliance_gaps.sql` — gaps.
- `server/db/migrations-pg/079_task_delegation.sql` + `080_signed_trails_and_compliance.sql` — delegation foundation + signed trails.
- `server/services/auditLogger.ts` — emitter.
- `server/services/delegation-compliance-service.ts` — rule evaluation.
- `server/services/compliance-rules.ts` — rule registry.
- `server/middleware/{auth,csrf,rate-limit}.ts` — emitters that write `security_events`.
- `EVIDENCE_PACK_SPEC.md` — spec for the Evidence Pack module.

## Open questions

- **Org-level Evidence Pack signing** — deferred per memory; would add an `org_signature` column or a parallel `evidence_pack_org_signatures` table.
- **Compliance-rule format** — YAML-encoded today; if Compliance-as-Code matures further, may move to a dedicated DSL with its own AST table.

## Related diagrams

- `23-reasoning-trails` — broader audit-system architecture.
- `33-portals-pathfinder` — Portals can include Evidence Pack capability cards.
- `f-51-talent-discovery` — talent-specific compliance trails (Annex III, Pay Transparency).
