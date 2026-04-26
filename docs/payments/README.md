# Payments

> ANTON's wallet + budget + KYC + gateway pillar. Foundation for Layer 6 (The Economy) per the six-layer vision. Status: 🟢 scaffolding built; FutureChain payment rail itself remains 📋 external/future.

---

## Quick map

| If you want to… | Read |
|---|---|
| Strategic positioning | [`/docs/marketing/payments.md`](../marketing/payments.md) |
| Budget enforcement (Mission ↔ Wallet contract) | [`budget-model.md`](budget-model.md) |
| Extending Payments | [`extending.md`](extending.md) |

---

## Service surface

5 services in `server/services/fc-*`:

| File | Responsibility |
|---|---|
| `fc-budget.ts` | Per-org budget rules + spending state + alerts |
| `fc-gateway.ts` | Inbound + outbound payment-rail config |
| `fc-marketplace.ts` | Marketplace listings (`fc_service_listings`) |
| `fc-settings.ts` | Per-instance payment settings |
| `fc-transactions.ts` | Transaction recording + attribution |

Adjacent services:

- `mission-credential.ts` — fetches credentials at call time + per-action accounting
- `mission-budget.ts` — per-mission token + time enforcement
- `credential-vault.ts` — at-rest encryption of payment-related secrets

---

## Pages

8 pages in `src/pages/futurechain/`:

| Page | Purpose |
|---|---|
| `FCDashboardPage` | Pillar landing |
| `FCWalletsPage` | Multi-currency wallet view |
| `FCTransactionsPage` | Transaction history with attribution |
| `FCBudgetPage` | Budget rules + alerts |
| `FCKycPage` | KYC profile (tier1 / tier2 / tier3) |
| `FCMarketplacePage` | Marketplace listings |
| `FCGatewayPage` | Gateway config |
| `FCSettingsPage` | Per-instance settings |

---

## Schema

| Migration | Tables |
|---|---|
| 081 | `fc_wallets`, `fc_kyc_profiles`, `fc_transactions` |
| 082 | `fc_budget_rules`, `fc_spending_log`, `fc_spending_state`, `fc_service_listings` |
| 087 | `fc_connection_config`, `fc_gateway_audit_log`, `fc_gateway_config` |

---

## Tier-based KYC

`fc_kyc_profiles` has a `kyc_level` enum (`tier1` / `tier2` / `tier3`):

- **tier1**: minimal — name + email + verification email
- **tier2**: enhanced — government-issued ID + proof of address
- **tier3**: full — institutional KYC (UBO chain, business registration, regulatory licences)

KYC tier gates which transaction sizes + transaction types are permitted. Encrypted PII blob is 📋 — currently unencrypted (security follow-up tracked).

---

## Where to start

- **Try it:** `/futurechain` (dashboard)
- **Code:** `server/services/fc-*.ts`, `server/routes/fc-*.ts`
- **Marketing:** [`/docs/marketing/payments.md`](../marketing/payments.md)
- **Architecture:** [`/docs/architecture/04-six-layer-vision.md`](../architecture/04-six-layer-vision.md) Layer 6
- **Extending:** [`extending.md`](extending.md)

---

*Refresh when FutureChain integration progresses, when per-invocation pricing lands, or when KYC tier semantics change.*
