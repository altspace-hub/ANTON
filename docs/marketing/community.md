# Community — One-Pager

> **What it is:** ANTON's E2E-encrypted ANTON-to-ANTON messaging layer + contact graph + group forums. The Layer-3 (Network) substrate every multi-instance feature builds on.
> **Who it's for:** consultancies sharing intelligence between offices, regulators networking with supervised entities, NGO field offices coordinating with HQ, anyone who needs cross-org collaboration with cryptographic attribution.
> **What makes it different:** **contact-hash-anchored, signed at every layer, no centralised relay**. Trust is earned via direct introduction, not granted by a platform.

---

## The pitch

Most cross-org collaboration tools are SaaS in disguise: messages route through the vendor's servers; contacts live in the vendor's database; if the vendor goes down or pivots, the network goes with them.

ANTON's Community pillar is shaped differently:

- **Contact-hash format** `ANTON-XXXX-XXXX-XXXX-XXXX` derived from your instance's Ed25519 public key — your identity is portable across Community surfaces and survives any one ANTON instance's lifetime.
- **E2E encryption** at the message layer (`community-crypto.ts` + `community-e2e.ts`).
- **Signed attribution** for every shared atom, every group post, every delegated task (`community-signing-service.ts`).
- **Trust scoring** based on direct introductions and consistent attribution over time.
- **No central relay** — peer instances exchange directly via AAP transport (post-E.2 wire-format v1).

---

## What you can do today

| Surface | Purpose |
|---|---|
| `/community` Dashboard | Pillar landing |
| `CommunityContactsPage` | Manage your connected_users |
| `CommunityForumPage` | Group forums (cross-org topical discussions) |
| `CommunityGroupPage` / `CommunityGroupForumPage` | Per-group surfaces |
| `CommunityGroupModerationPage` | Moderation surface |
| `CommunityEventPage` / `CommunityCalendarPage` | Cross-org events |
| `CommunityCapabilityCardPage` | Browse capabilities exposed by peer ANTONs |
| `BeehivePage` / `BeehiveSessionPage` | Multi-instance deliberation (see [Beehive](beehive.md)) |
| (Companion App) `FriendsPage` | Friend-graph surface (mig 164–165) |

5+ services in `server/services/community-*` (`community-crypto`, `community-e2e`, `community-signing-service`, `community-projects`, `community-msg-relay-buffer`).

---

## Schema

| Migration | Tables |
|---|---|
| 077 (network foundation) | `connected_users` |
| 078 (knowledge sharing) | `community_shared_atoms` |
| 079 (task delegation) | `community_delegated_tasks` |
| 080 (signed trails) | `community_signed_trail_entries`, `community_trail_verifications` |
| 099–104 | Group discussions, moderation, federation, E2E keys, relay store, marketplace bundle |
| 110 | P2P replay protection |
| 164 (friends layer) | `friend_*` tables |
| 165 (friend messaging) | `friend_messages` |

---

## Why this matters strategically

Every multi-instance feature in ANTON — Beehive deliberation, Specialized Agents reachable across orgs, Portals + Pathfinder discovery, signed evidence-pack sharing — builds on Community's substrate. **No Community = no Layer 3. No Layer 3 = no Layer 4 (Collaborative Intelligence).**

Most platforms in this space try to be the network. Community lets you BE the network — your contact-hash, your signing key, your relationships, all portable, all survivable.

For consultancies: a single trust graph that survives the next platform migration. For regulators: the supervised-entity network you've built doesn't lock you into one vendor. For NGOs: cross-office coordination that works the same whether you're well-connected or in a low-bandwidth field deployment.

---

## Where to look

- **Try it:** `/community` (dashboard), `/community/contacts` (your network), `/community/forum` (group discussions)
- **Code:** `server/services/community-*.ts`, `server/routes/community*.ts`
- **Docs:** [`/docs/community/`](../community/) — README + extending
- **Architecture:** [`/docs/architecture/30-aap-protocol.md`](../architecture/30-aap-protocol.md), [`/docs/architecture/04-six-layer-vision.md`](../architecture/04-six-layer-vision.md) Layer 3
- **Beehive (related):** [`/docs/marketing/beehive.md`](beehive.md)

---

*Refresh when a new transport surface ships, when the trust-scoring model evolves, or when group-forum capabilities expand.*
