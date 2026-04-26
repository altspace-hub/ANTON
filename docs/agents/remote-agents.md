# Remote Agents (AAP-via-Agents)

> An agent on **your** ANTON can be invoked by an agent on **someone else's** ANTON, with capability negotiation, signed authentication, and end-to-end audit. This is how Layer 4 (Collaborative Intelligence) becomes operational across instance boundaries.

---

## The pattern

The two ANTONs each have agents. Owner-A has an `FCP-Researcher` agent. Owner-B's analyst wants to consult it. Without remote-agents, this is a "send a message and wait" pattern. With remote-agents, B's session can:

1. **Discover** Owner-A's `FCP-Researcher` via Pathfinder (which queries the registry — same protocol as portals).
2. **Verify** the agent's capability descriptor (signed by A's instance key).
3. **Invoke** a capability (e.g. `search`) over AAP.
4. **Receive** the structured response — the conversation turn happens on A's instance, the result returns to B's session.
5. **Audit** — both sides record the exchange in `community_signed_trail_entries` + `agent_invocations`.

It's like calling a function — but the function lives on someone else's machine, requires their consent (capability + visibility), and produces a verifiable trail.

---

## Discovery

Implemented in `server/services/remote-agent-client.ts`:

```ts
const client = await createRemoteAgentClient(db);
const remoteAgents = await client.discover({
  contactHash: 'ANTON-XXXX-XXXX-XXXX-XXXX',  // peer's contact hash
  capability: 'search',                        // we want a search-capable agent
  domain: 'fcp',                                // optional domain filter
});
// remoteAgents: Array<{ agent_id, name, description, capabilities, signature }>
```

Discovery uses the same registry-protocol (`server/services/registry-protocol/`) that portals use. The peer's published agent profiles flow through canonical-JSON envelopes, allowing the receiver to verify provenance.

---

## Invocation

```ts
const result = await client.invoke({
  contactHash: 'ANTON-XXXX-XXXX-XXXX-XXXX',
  agentId: '<remote agent id>',
  verb: 'search',
  args: { query: 'AMLR Article 16 mandatory components' },
});
// result: { ok, data, error?, durationMs, signature }
```

Under the hood:

1. Open AAP session (per [`/docs/aap/wire-format-v1.md`](../aap/wire-format-v1.md)).
2. Send a `BUNDLE` message with bundle_type `agent-invocation` carrying the encrypted call.
3. Peer's `agent-processor` runs the turn.
4. Peer responds with `ACK` + result envelope.
5. Local `community-crypto.verifyEnvelopeSignature` validates the signed result.
6. Local cache stores the resolution (`agent_remote_resolutions`).

---

## Visibility model

An agent's `visibility` field controls who can discover it:

| Visibility | Discovery | Invocation |
|---|---|---|
| `private` | owner only | owner only |
| `team` | team members | team members |
| `public-aap` | any AAP peer who knows the contact-hash | any AAP peer (subject to capability auth) |

A `public-aap` agent is the only kind reachable across instances. Owners must explicitly opt in — there's no implicit publication. This matches the same opt-in model as Portals.

---

## Per-capability auth

An agent can specify per-capability auth requirements: `public` (any peer), `peer` (peer must be in `connected_users`), or `owner` (only the owner). The remote-agent-client passes the caller's identity in the AAP envelope; the peer's processor enforces the auth tier.

---

## Audit trail

Every remote invocation produces TWO trail entries:

| Side | Table | Records |
|---|---|---|
| Caller | `agent_remote_resolutions` + `agent_invocations` | "I invoked X on peer Y at time Z; response was..." |
| Peer | `agent_invocations` + `community_signed_trail_entries` | "Peer Y invoked my agent X at time Z; I responded..." |

The trail surfaces in the `/audit-trail` consolidated viewer ([`/docs/architecture/23-reasoning-trails.md`](../architecture/23-reasoning-trails.md)) on both sides.

---

## Why this matters

A research analyst at consultancy A and a regulator at agency B can have their respective AI agents collaborate on a question — with cryptographic attribution, capability gating, and a permanent trail — without either side handing over their data or their tooling.

That's Layer 4 made operational.

---

## Where to look

- **Code:** `server/services/remote-agent-client.ts`
- **AAP transport:** [`/docs/aap/wire-format-v1.md`](../aap/wire-format-v1.md), `server/services/aap-transport-server.ts` + `aap-transport-client.ts`
- **Registry protocol:** [`/docs/portals/registry-protocol.md`](../portals/registry-protocol.md)
- **Visibility schema:** migration 111 (`agent_profiles.visibility`)
