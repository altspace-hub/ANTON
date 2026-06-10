# A2A Demo — two ANTON instances talking to each other

The human, click-through version of the **two-instance verification ladder**
(`tests/a2a/two-instance.integration.test.ts` — the automated regression
gate). This script reproduces rungs 1–4 on two real installs: pairing,
end-to-end-encrypted mail, a cross-instance Specialized-Agent query, and a
full signed mission-delegation round trip. It is the source script for the
launch demo video.

Engineering background: `docs/A2A_ROADMAP.md`. Automated gate:

```bash
npx vitest run tests/a2a     # must be green before any A2A demo or claim
```

---

## 0. Prerequisites (BOTH instances)

1. **Migration 220 applied** — `pnpm run db:migrate:pg`.
   Without it three constraint bugs make the demo physically impossible:
   every successful mail delivery crashes its bookkeeping (queue
   `delivery_method` CHECK), delegation accept throws on its own audit log
   (`mission_delegation_log` event CHECK), and Beehive invites are rejected
   on arrival (`beehive_message_log` FK).
2. **Build newer than 2026-06-10** — includes the `agents.ts` route-ordering
   fix. On older builds `POST /agents/public/query` and
   `/agents/remote/query` are shadowed by `/agents/:id/query` and rung 3
   always fails with `400 message required`.
3. **`ALLOW_PRIVATE_P2P=true` in `.env`** — the SSRF guard otherwise blocks
   peer endpoints on `192.168.*` / `10.*` / `127.0.0.1`, i.e. every LAN and
   same-machine demo. (Leave it unset only when peers have public HTTPS
   endpoints.)
4. An **Anthropic API key** on the instance that hosts the agent (rung 3 is
   the only rung that calls an LLM).
5. Note each machine's LAN IP and port — below: ALPHA at
   `http://192.168.1.10:3001`, BRAVO at `http://192.168.1.20:3001`.

### Variant: one machine, two instances

Two checkouts (or one checkout, two terminals) with separate databases and
ports — exactly what the automated ladder does in-process:

```bash
# Instance ALPHA (terminal 1) — normal .env, PORT=3001
pnpm run start

# Instance BRAVO (terminal 2)
psql -U anton -c "CREATE DATABASE anton_bravo"
DATABASE_URL=postgresql://anton:anton@localhost:5432/anton_bravo PORT=3002 pnpm run start
# (set both in .env of a second checkout on Windows; PowerShell:
#   $env:DATABASE_URL='...'; $env:PORT='3002'; pnpm run start)
```

Endpoints are then `http://127.0.0.1:3001` and `http://127.0.0.1:3002`;
`ALLOW_PRIVATE_P2P=true` is mandatory.

**Delivery timing:** the live server processes its outbound message queue
every **30 seconds**. Whenever a step below says "wait for delivery", allow
up to half a minute before concluding something is wrong.

---

## Rung 1 — Pairing (Community contacts, both ways)

**On each instance** — *Community → Identity* (`/community/identity`):

1. Activate the identity (pick a display name). The instance generates its
   contact hash (`ANTON-XXXX-XXXX-XXXX-XXXX`), an **Ed25519 signing key**
   and an **X25519 encryption key** server-side.
2. Copy the identity card: contact hash, public key (long hex), X25519
   public key (long hex). The QR on this page carries the contact hash.

**On ALPHA** — *Community → Contacts* (`/community/contacts`) → Add contact:

- Contact hash: BRAVO's hash
- Display name: anything ("Bravo")
- Public key: BRAVO's Ed25519 public key (hex)
- X25519 key: BRAVO's X25519 public key (hex)
- Endpoint: `http://192.168.1.20:3001`

**On BRAVO** — same, with ALPHA's card and `http://192.168.1.10:3001`.

**Verify (the rung-1 gate):** open the contact's settings and run **Test
connection** on BOTH sides. Expected signals — four green checks:

```
Endpoint      pass   http://192.168.1.20:3001
Network       pass   Peer is online (responded at …)
Mutual Trust  pass   Peer accepts messages from us
Encryption    pass   X25519 encryption key configured — messages will be encrypted end-to-end
```

`Mutual Trust: fail (403)` means the OTHER side has not added you yet — the
contact add must happen on both machines.

> Screenshot moment #1: the two identity cards side by side + the four green
> checks.

---

## Rung 2 — End-to-end-encrypted mail

**On ALPHA** — *Community → Mail* (`/community/mail`) → Compose:

- To: the Bravo contact. Subject + body: anything distinctive
  ("Quarterly remediation plan — if you can read this, E2E works").
- Send, then wait for the queue tick (≤30 s).

**Expected signals:**

- ALPHA: the sent mail's delivery status becomes **delivered**; server log
  prints `[community-queue] Processed: 1 sent, 0 failed`.
- BRAVO: *Community → Mail → Inbox* shows the message with the exact
  subject and body, sender = ALPHA's hash.
- On the wire the subject and body were `[encrypted]` — only the
  X25519/HKDF/AES-256-GCM envelope travels. (The automated ladder also
  proves a replayed envelope is rejected `409` and a tampered ciphertext is
  rejected `400` — rungs 2.2/2.3.)

> Screenshot moment #2: BRAVO's inbox showing the decrypted mail, next to
> ALPHA's "delivered" status.

---

## Rung 3 — Query a peer's Specialized Agent

**On BRAVO** — *Agent Hub* (`/agents` — type the URL if no nav entry yet):

1. Create an agent. Give it an unmistakable persona ("Bravo Sales Desk",
   system prompt mentioning something only this agent would know) and a few
   routing keywords ("pricing", "inventory", …).
2. **Activate** it (status must be `active`; "public queries" /
   auto-response stays enabled by default).

**On ALPHA** — *Agent Hub → Network tab*:

1. **Discover** — BRAVO's agent appears, attributed to the Bravo contact
   and its endpoint.
2. Select it and send a question matching its domain.

**Expected signals:**

- ALPHA renders the answer with the agent's name — content recognisably in
  the persona BRAVO configured (this is BRAVO's API key doing the work).
- BRAVO: the agent's conversation list shows a new conversation with
  `source: p2p` and ALPHA's contact hash as the requester — attribution is
  recorded on the answering side.

> Screenshot moment #3: ALPHA's network-agent answer + BRAVO's conversation
> log entry for the same exchange.

---

## Rung 4 — Mission delegation round trip (signed both ways)

**On ALPHA:**

1. *Missions* (`/missions`) → create a small mission (any objective) with at
   least one task.
2. Open the mission → **Delegations** tab → **New delegation**: pick the
   task, pick the Bravo peer (ranked by trust), write the brief, send.
3. The outbound delegation shows **sent**.

**On BRAVO** — *Missions → Inbox* (`/missions/inbox`), wait ≤30 s:

4. The delegation appears with the brief and — load-bearing — **signature
   verified** (Ed25519, checked against ALPHA's stored contact key).
5. Click **Accept**. A local sub-mission `[delegated] …` is created on
   BRAVO, and a signed accept-notice rides back automatically.

**On ALPHA:** the outbound delegation moves **sent → in progress** within
~30 s (the tab polls).

6. **Submit the result.** There is no result-submission UI yet (known gap —
   the automated rung drives the same API). From BRAVO, with the delegation
   id from the inbox row:

```bash
curl -X POST http://localhost:3001/api/missions/delegations/<DELEGATION_ID>/submit-result \
  -H "Content-Type: application/json" \
  -d '{"payload": {"summary": "Three risks identified: liquidity, latency, llama stampedes."}}'
```

**On ALPHA:** within ~30 s the delegation shows **completed** with the
result payload and **result signature verified**. Click **Approve**:

- status moves to **approved**;
- the originating task is marked completed with the peer's result folded
  into its output (Phase B3 ingestion);
- both sides' delegation logs carry the full audit trail
  (`created/sent/peer_accepted/completed/approved` on ALPHA,
  `received/accepted/accept_notified/completed` on BRAVO).

> Screenshot moment #4: ALPHA's outbound delegation card at "approved /
> signature verified" + BRAVO's `[delegated]` sub-mission.

The automated ladder additionally proves a **forged result is rejected**
(signed with the wrong key → delegation marked failed, approval refused) —
mention it in the demo, don't perform it live.

---

## Beyond the demo (automated-only rungs)

- **Rung 5 — Beehive:** Queen on ALPHA forms a hive, invites BRAVO over the
  wire, BRAVO joins and its signed round-1 contribution lands on the Queen.
  Works end-to-end in the ladder; the BeehivePage UI flow for *remote*
  participants is not yet wired for a click-through demo.
- **Rung 6 — Mesh:** the same encrypted mail envelope delivered over the
  ANTON Mesh (relay + Noise dialer + RPC framing) into the peer's real
  `/api/p2p/receive`. Loopback-verified in the ladder and in
  `tests/services/peer-transport-mesh.test.ts`; a live two-machine mesh demo
  needs `ANTON_MESH_RELAYS` pointed at a reachable relay on both sides.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Mutual Trust fails with 403 | Peer hasn't added YOUR contact hash (pairing is two-way) |
| Mail stuck "pending", log shows `endpoint blocked by SSRF policy` | `ALLOW_PRIVATE_P2P=true` missing |
| Mail delivered on peer but sender keeps retrying / errors in log | Migration 220 not applied (queue CHECK) |
| Accept on the inbox returns an error | Migration 220 not applied (delegation-log CHECK) |
| Network-agent query returns `message required` | Pre-fix build — `/agents/public/query` shadowed by `/agents/:id/query` |
| Replay of an old captured envelope | Always rejected: per-sender nonce table + 10-minute freshness window |
