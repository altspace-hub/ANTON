# Extending Payments

> How to add a new payment provider, a new budget rule type, or a new KYC tier requirement.

---

## Add a new payment provider

Inbound + outbound configuration goes through `fc_gateway_config` (mig 087). To add a new provider (e.g. Stripe, Adyen, FutureChain itself):

1. **Implement** the provider adapter under `server/services/fc-providers/<provider>.ts` with:
   - `inboundCheckHealth()` — verify the provider is reachable
   - `inboundReceiveWebhook(payload)` — handle incoming notifications
   - `outboundSend(transactionRow)` — send a payment
2. **Register** in `fc_gateway_config` with provider id, credentials reference (vault), webhook secret reference.
3. **Document** the provider's settlement window, retry policy, and supported currencies.
4. **Test** via the FCGatewayPage health-check.

Credentials flow through the Credential Vault — never inline.

---

## Add a new budget rule type

Budget rules in `fc_budget_rules` are declarative — currently support: per-org daily cap, per-mission token cap, per-user monthly cap. To add (e.g.) per-Service-Pack monthly cap:

1. **Extend** the rule schema with a `service_pack_id` scope dimension.
2. **Compute** the rule's spending state in `fc-budget.ts` evaluation loop.
3. **Enforce** at the mission-budget integration point.
4. **Surface** in `FCBudgetPage` UI.

Budget evaluations should be deterministic — same input produces same enforcement decision.

---

## Add a new KYC tier requirement

The current 3-tier model (tier1 / tier2 / tier3) supports most use cases. To extend (e.g. add tier4 for cross-border institutional):

1. **Extend** the `kyc_level` enum.
2. **Define** the additional evidence requirements.
3. **Implement** verification helpers in `fc-kyc.ts`.
4. **Update** the KYC tier gating in transaction-permit checks.
5. **Encrypt** PII fields per the security follow-up (currently 📋).

KYC tier transitions should be append-only in `fc_kyc_profiles` — record the tier history for audit.

---

## Anti-patterns

- **Don't store payment credentials in `fc_*` columns directly.** Always vault references.
- **Don't bypass `fc_gateway_audit_log`.** Every gateway action — inbound, outbound, retry, failure — must log.
- **Don't auto-execute high-tier transactions** without explicit user confirm (Orchestrator's `applyOrchestratorAction` enforces this for `tier='high'` actions).
- **Don't expose unencrypted PII in API responses.** Even tier1 PII is sensitive.

---

*Maintained alongside `server/services/fc-*.ts`. Refresh when a new provider lands or KYC tier model evolves.*
