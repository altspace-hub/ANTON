# Community

> ANTON's Layer-3 (The Network) pillar. Cross-instance E2E messaging, contact graph, group forums, and signed knowledge sharing — the substrate every multi-instance feature builds on.

---

## Quick map

| If you want to… | Read |
|---|---|
| Strategic positioning | [`/docs/marketing/community.md`](../marketing/community.md) |
| Cryptography deep-dive | [`crypto.md`](crypto.md) |
| Extend Community | [`extending.md`](extending.md) |
| Beehive (multi-instance deliberation) | [`/docs/beehive/`](../beehive/) |

---

## Service surface

| File | Responsibility |
|---|---|
| `server/services/community-crypto.ts` | Contact-hash format, signature verification (now exports `verifyEnvelopeSignature` + `contactHashMatchesPubkey` post-E.2) |
| `server/services/community-e2e.ts` | E2E session wrappers |
| `server/services/community-signing-service.ts` | Sign canonical bodies with the instance Ed25519 key |
| `server/services/community-projects.ts` | Cross-org project + task primitives |
| `server/services/community-msg-relay-buffer.ts` | Buffer messages when the recipient is offline |

The pillar shares the AAP transport layer with Specialized Agents, Beehive, Portals — Community is the *contact-graph + messaging* slice; AAP is the *transport*.

---

## Schema (across multiple migrations)

| Migration | Tables introduced |
|---|---|
| 077 | `connected_users` (the contact graph) |
| 078 | `community_shared_atoms` (signed atom sharing) |
| 079 | `community_delegated_tasks` (task hand-off between instances) |
| 080 | `community_signed_trail_entries`, `community_trail_verifications` (audit trail) |
| 099 | `community_group_topics`, `community_group_posts` (forum) |
| 100 | `community_content_flags` (moderation) |
| 101 | `entity_federation` (cross-org entity sync) |
| 102 | `e2e_keys` (per-conversation key state) |
| 103 | `relay_store` (offline-buffered messages) |
| 104 | `bundle_marketplace` (`.anton` bundle exchange) |
| 110 | `p2p_message_nonces` (replay protection) |
| 164 | `friend_contacts`, `friend_groups`, `friend_invitations`, `friend_activity_events`, `friend_group_members` |
| 165 | `friend_messages` |

---

## How a contact is established

1. Owner-A and Owner-B exchange contact-hashes out of band (QR / paste / introduction).
2. Each instance writes a row to `connected_users` with the peer's contact-hash + signed introduction payload.
3. From that point on, AAP transport between the two instances is authorised — capability descriptors can be exchanged, messages can flow, signed bundles can be delivered.
4. A sub-graph of friends + groups can grow on top of this seed (`friend_*` tables, mig 164–165).

---

## How a message flows

1. Sender's instance composes the message in `friend_messages` (or `community_group_posts` for group context).
2. Local signing — the body is canonicalised, signed with the instance Ed25519 key, wrapped in an envelope.
3. AAP transport delivers to the recipient instance (via `aap-transport-client`).
4. Recipient verifies the signature against the sender's pubkey (resolved from `connected_users`).
5. Verified message persists in the recipient's `friend_messages`; trail entry written to `community_signed_trail_entries` + `community_trail_verifications`.

E2E encryption: each conversation has a key derived via X25519 ephemeral exchange; messages encrypted with AES-256-GCM. Per-conversation key state lives in `e2e_keys`.

---

## Group forums

Cross-org topical discussions (`community_group_topics` + `community_group_posts`). Membership is opt-in; moderation happens via `community_content_flags` + `CommunityGroupModerationPage`.

A group can be:

- **Open** — any peer ANTON can post (subject to moderation)
- **Invitation-only** — explicit add by group owner
- **Federated** — multiple instances host the same group; messages sync via AAP

---

## Where to start

- **Try it:** `/community` (dashboard), `/community/contacts`, `/community/forum`
- **Code:** `server/services/community-*.ts`, `server/routes/community*.ts`
- **Marketing:** [`/docs/marketing/community.md`](../marketing/community.md)
- **Crypto detail:** [`crypto.md`](crypto.md)
- **Extending:** [`extending.md`](extending.md)

---

*Refresh when a new community surface ships, when trust-scoring is wired, or when friend-layer features land.*
