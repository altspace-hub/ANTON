# Extending Community

> How to add a new community surface, a new federation type, or a new trust signal.

---

## Add a new contact / messaging surface

The pattern follows the established Community service tree:

1. **Define** the surface route under `server/routes/community-<name>.ts`.
2. **Persist** to a new table or extend an existing one (e.g. `community_*` namespace).
3. **Sign** any cross-instance writes via `community-signing-service.sign()`.
4. **Verify** any cross-instance reads via `community-crypto.verifyEnvelopeSignature()`.
5. **Replay-protect** with the existing `p2p_message_nonces` table.
6. **Trail** every cross-instance interaction into `community_signed_trail_entries`.

Don't reinvent the crypto — use the existing helpers.

---

## Add a new federation type

Currently: peer-to-peer (most cases) + group-federated (a group hosted on multiple instances). To add (e.g.) a federation pattern for a regulator-led knowledge-pack syndicate:

1. **Define** the federation contract — what messages travel, what state syncs, what signatures are required.
2. **Extend** `entity_federation` (mig 101) with the new federation type.
3. **Implement** the sync via AAP transport (no parallel transport stack).
4. **Document** the trust model — who validates what, and how disagreements resolve.

---

## Add a new trust signal

Trust scoring is data-driven (per-contact attribution consistency, intro graph distance, signed-bundle delivery success rate). To add a new signal:

1. **Identify** what the signal measures (positive: e.g. "consistently-cited atoms"; negative: e.g. "frequently-flagged content").
2. **Compute** the signal in `community-projects.ts` (or a new dedicated trust-service).
3. **Persist** to a `connected_users.trust_signals` JSONB column or a dedicated `community_trust_signals` table.
4. **Surface** in `CommunityContactsPage` per-contact view.

Trust scoring should be **explainable** — every score must be traceable to underlying signals.

---

## Add a new group-forum capability

The forum stack (`community_group_topics`, `community_group_posts`, `community_content_flags`) is opinionated — it's a discussion surface, not a chat. To add (e.g.) thread-level subscriptions:

1. Add a `community_group_subscriptions` table.
2. Wire the subscription in the post-creation flow.
3. Surface in the forum UI.
4. Federate subscription state via AAP if the group is multi-host.

---

## Anti-patterns

- **Don't bypass the canonical-JSON envelope.** Every signed payload must canonicalise the same way — otherwise signatures don't verify across implementations.
- **Don't skip nonce persistence.** Replay attacks become trivial without it.
- **Don't store unencrypted message contents in transit.** E2E means E2E — even the relay-store buffer holds ciphertext, not plaintext.
- **Don't fork the crypto.** Use `community-crypto.ts` helpers.

---

*Maintained alongside `server/services/community-*.ts`. Refresh when a new community surface or federation type ships.*
