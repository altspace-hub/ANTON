# Payments — One-Pager

> **What it is:** ANTON's wallet, budget, KYC, and gateway pillar — the foundation for FutureChain integration (Layer 6 of the six-layer vision).
> **Who it's for:** users wanting per-mission cost ceilings + per-instance spending governance + (future) cross-org payment settlement on FutureChain.
> **Status:** 🟢 Built scaffolding; FutureChain payment rail itself is 📋 external/future per the six-layer vision.

---

## The pitch

Most AI-cost tools count tokens after the fact. Payments lets you set the budget *before*:

- Per-mission token + dollar ceilings
- Per-org spending alerts + hard caps
- Per-user cost attribution
- Per-mission Service Pack credentials live in the Credential Vault — never inline
- (Future) Per-invocation pricing for `public-aap` Specialized Agents via FutureChain

The wedge: when the addressable market matures from "AI assistant for me" to "AI-as-a-business-function", per-call billing becomes table stakes. Payments is the substrate.

---

## What you can do today

| Surface | Purpose |
|---|---|
| `FCDashboardPage` | Pillar landing — wallets, recent transactions, budget posture |
| `FCWalletsPage` | Multi-currency wallet view |
| `FCTransactionsPage` | Transaction history with attribution |
| `FCBudgetPage` | Budget rules + alerts + spending state |
| `FCKycPage` | KYC profile (tiered) |
| `FCMarketplacePage` | Marketplace listings (post-FutureChain bundle exchange) |
| `FCGatewayPage` | Gateway config (incoming + outgoing payment routes) |
| `FCSettingsPage` | Per-instance payment settings |

8 pages in `src/pages/futurechain/`. ~5 services in `server/services/fc-*` (`fc-budget`, `fc-gateway`, `fc-marketplace`, `fc-settings`, `fc-transactions`).

---

## Schema

| Migration | Tables |
|---|---|
| 081 (FutureChain foundation) | `fc_wallets`, `fc_kyc_profiles`, `fc_transactions` |
| 082 (marketplace + budget) | `fc_budget_rules`, `fc_spending_log`, `fc_spending_state`, `fc_service_listings` |
| 087 (gateway) | `fc_connection_config`, `fc_gateway_audit_log`, `fc_gateway_config` |

---

## Per-mission cost ceilings

Missions consume tokens; tokens cost money. Payments provides the enforcement:

1. Mission template carries `default_budget` (token_budget_max + time_budget_max)
2. Mission instance binds to a wallet via `fc_spending_state`
3. Each task's token consumption decremented from the budget
4. On budget breach: mission auto-pauses + emits a Companion-App approval (per `app-checkpoint-service`)

The orchestrator's `applyOrchestratorAction` consults `action-risk-registry` — high-risk actions (anything that *spends*) always require user confirmation regardless of trust phase.

---

## FutureChain integration

📋 future. The integration spec exists; the rail itself is external. When FutureChain ships:

- `public-aap` Specialized Agents can charge per invocation
- `.anton skill-pack` bundles can be sold via the Marketplace
- Cross-org Beehive deliberations can carry per-contribution micropayments
- Mission outputs can be settled with the buyer at delivery

Per CLAUDE.md L6 vision: this is the substrate that makes "expertise as income" operational.

---

## Where to look

- **Try it:** `/futurechain` (dashboard), `/futurechain/wallets`, `/futurechain/budget`
- **Code:** `server/services/fc-*.ts`, `server/routes/fc-*.ts`
- **Schema:** mig 081, 082, 087
- **Architecture:** [`/docs/architecture/04-six-layer-vision.md`](../architecture/04-six-layer-vision.md) Layer 6
- **Vault link:** [`/docs/missions/credential-vault.md`](../missions/credential-vault.md)

---

*Refresh when FutureChain integration matures, when per-invocation pricing ships, or when the mission-budget enforcement contract changes.*
