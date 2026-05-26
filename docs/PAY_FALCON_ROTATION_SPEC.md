# PAY_FALCON_ROTATION_SPEC.md

**Status:** Draft 1 (2026-05-24). Pre-implementation spec — sign-off needed on the design decisions in §10 before any chain-side or pay-app code lands. The work itself is **deferred** until the user-side FALCON hard fork (`PQ_ENFORCEMENT_HEIGHT`) is scheduled; this document captures the design now so the rotation UX is ready when the fork is.

**Why this spec exists.** ANTON Pay envelope v3 (shipped 2026-05-24, [[PAY_WALLET_PASSPHRASE_SPEC]] §3.2.1) generates a FALCON-512 keypair at wallet create + restore time. **FALCON keygen is non-deterministic** — a wallet restored from the same 24-word BIP-39 mnemonic on a different device gets a different FALCON keypair than the original. Before the FALCON hard fork this is harmless (FALCON priv is unused). After the hard fork, when chain consensus requires hybrid Ed25519+FALCON signatures on user transactions, every restored-from-seed wallet will have a FALCON pub that doesn't match the one currently registered for that address — and signing will fail until the user runs a one-time **rotation**.

**Closes the open caveat in:** [[PAY_WALLET_PASSPHRASE_SPEC]] §3.2.1, [[project_phase5_deployed_may24_2026]] B7, [task #280] commit-message warning.

---

## 1. The problem in one diagram

```
Day 0: user creates wallet on Phone A
  ┌─────────┐  Ed25519 priv = HD-derive(seed, 0, 0)
  │ Phone A │  Ed25519 pub  = derived
  │  seed   │  fc_ address  = SHA-256(pub) + checksum
  │   +     │  FALCON priv  = falcon512.keygen()  ← random
  │ FALCON  │  FALCON pub   = derived from FALCON priv
  │  (A)    │
  └─────────┘  → registered with Bahnhof + (after hard fork) on-chain registry

Day 30: phone lost. User restores on Phone B with the same 24 words.
  ┌─────────┐  Ed25519 priv = HD-derive(seed, 0, 0)        ✓ SAME
  │ Phone B │  Ed25519 pub  = derived                       ✓ SAME
  │  seed   │  fc_ address  = SHA-256(pub) + checksum       ✓ SAME
  │   +     │  FALCON priv  = falcon512.keygen()  ← random  ✗ DIFFERENT
  │ FALCON  │  FALCON pub   = derived from FALCON priv      ✗ DIFFERENT
  │  (B)    │
  └─────────┘  → Phone B has FALCON pub B; the chain still expects FALCON pub A

Day 90: PQ_ENFORCEMENT_HEIGHT is reached. The chain now requires hybrid
  sigs on every user tx. Phone B signs with FALCON priv B → verify fails
  against the registered FALCON pub A → transaction rejected.

The fix: a one-time ROTATION transaction.
  Phone B prepares: rotate_falcon_pub { from: fc_…, new_falcon_pub: B }
                    signed Ed25519 (PROVES ownership of the address —
                    the Ed25519 priv IS deterministic from the seed)
                    signed FALCON priv B (PROVES ownership of the new pub)
                    NOT signed by FALCON priv A (Phone B doesn't have it
                                                  — that's the whole point)
  The chain accepts the rotation, updates the registry, and from the next
  block onward user txs from this address must be hybrid-signed with
  Ed25519 + FALCON priv B.
```

---

## 2. Why this is a real UX problem (not theoretical)

It will happen to a meaningful fraction of users. Realistic scenarios:

| Scenario                                                     | Frequency |
|--------------------------------------------------------------|-----------|
| User loses phone, restores from 24-word backup               | Common over a 5-year wallet lifetime |
| User reinstalls ANTON Pay after wiping their phone           | Common |
| User migrates from Android to iOS (or vice versa)            | Periodic |
| User installs ANTON Pay on a tablet "as a backup"            | Niche but observed |
| Forensics: user is moving from a compromised device           | Rare but important |

All of these end with the same on-device state: same Ed25519, **fresh** FALCON. Pre-hard-fork this is invisible. Post-hard-fork it manifests as "I tried to pay 0.05 FTC for a coffee and it failed".

---

## 3. Design — the rotation transaction

### 3.1 New transaction type

A new chain-side transaction kind, in addition to the existing `Pacs008` and `Coinbase`:

```rust
pub enum TransactionKind {
    Pacs008,
    Coinbase,
    RotateFalconPub,  // NEW (post-PQ-fork)
}
```

Payload shape:

```
rotate_falcon_pub {
    address:           fc_…,             // address whose FALCON pub is changing
    old_falcon_pub:    bytes (897),      // current registry entry — included for
                                         //   defence-in-depth + audit log
    new_falcon_pub:    bytes (897),      // the new FALCON pub
    nonce:             u64,              // per-address rotation counter (prevents replay)
    timestamp:         i64,              // for fee freshness + audit
    sig_ed25519:       bytes (64),       // Ed25519(rotation_hash) — PROVES address ownership
    sig_falcon_new:    bytes (~666),     // FALCON(rotation_hash) signed by NEW priv —
                                         //   PROVES the user controls the new keypair
}

where:
    rotation_hash = SHA-256(
        "rotate_falcon_pub"        // domain separator
      | address                    // bound to a specific address
      | old_falcon_pub             // anti-substitution
      | new_falcon_pub             // anti-substitution
      | nonce.to_le_bytes()        // replay defence
      | timestamp.to_le_bytes()    // replay defence
    )
```

### 3.2 Consensus rules

A `RotateFalconPub` tx is valid iff:

1. `address` is in the on-chain wallet registry (i.e. has done at least one outgoing tx).
2. `old_falcon_pub` matches the address's currently-registered FALCON pub.
3. `nonce == registry[address].rotation_nonce + 1`. (First rotation: nonce=1. Strictly increasing.)
4. `timestamp` is within ±1 hour of block timestamp.
5. `sig_ed25519` is a valid Ed25519 signature on `rotation_hash` by the address's Ed25519 pub (which IS derivable from the address).
6. `sig_falcon_new` is a valid FALCON-512 signature on `rotation_hash` by `new_falcon_pub`.
7. The submitter has paid a small chain fee (~0.001 FTC) so unlimited rotations aren't free.

On acceptance:
- Registry update: `registry[address].falcon_pub = new_falcon_pub`, `registry[address].rotation_nonce += 1`, `registry[address].last_rotated_block = current_height`.
- Audit log: emit `RotationEvent { address, old_pub, new_pub, block_height, tx_id }` for downstream tooling (Mimir KYC, exchange compliance teams).

### 3.3 Bootstrap — wallets that never made an outgoing tx

A fresh wallet that never sent FTC has no registry entry. The registry is populated lazily on first outgoing tx (it's the natural moment to bind an Ed25519 pub to a FALCON pub). So a wallet on Phone A that NEVER sent anything before being lost is in a special case:

- User restores on Phone B → no FALCON pub registered → first outgoing tx from Phone B simply registers FALCON pub B as the canonical one. No rotation tx needed.
- This is the desirable behaviour: rotation is only needed when there's a prior registration to replace.

### 3.4 Why the OLD FALCON priv is NOT required to rotate

The strict version would require a signature from the old FALCON priv to authorise the rotation — "the user proves they used to control the wallet by signing with the old key". But that's **exactly** what's impossible after restoring from seed; the old priv is gone with the lost phone. Requiring it would mean restoration permanently bricks the wallet's signing capability post-fork.

The Ed25519 priv (deterministic from the seed) is the alternative root of trust. We treat the Ed25519 priv as the canonical wallet identity — restoring it from the BIP-39 mnemonic is by construction what the user CAN do, and the standard chain-wide assumption is "Ed25519 priv ownership = address ownership".

The trade-off: an attacker who steals the user's 24-word mnemonic can also rotate the FALCON pub to one they control, even if they don't have the original phone. **This is exactly the same threat surface as today's Ed25519-only setup** — the 24 words have always been the root of trust. We don't gain a new attack class by allowing rotation.

What we DO gain: defence against the much-more-common case of "phone died, I have my backup, why is the wallet broken".

---

## 4. Pay-app UX

### 4.1 Detection

ANTON Pay needs to detect the rotation-required state and surface it as a clear, recoverable action — not a cryptic "sign failed" error.

Detection happens at one of two trigger points:

**Trigger A — post-restore proactive check.** After a successful `restoreFromMnemonic()` (and after the FALCON keypair is freshly generated and stashed in envelope v3), Pay-app makes a read-only RPC call to fetch the current chain-registry FALCON pub for the restored address. If the on-chain pub differs from the local pub, set the wallet's state to `falcon_rotation_pending`.

**Trigger B — first sign post-fork.** If a `submit_signed_transaction` returns the new `FALCON_PUB_MISMATCH` error code (added to the chain RPC at the hard fork), Pay-app caches that the wallet is in the rotation-pending state and surfaces the rotation prompt before the tx can retry.

Trigger A is preferred — it surfaces the issue at the natural moment (restore), not in the middle of a payment.

### 4.2 The rotation modal

Reuses the same OS-native modal infrastructure as the device-attestation work (for ANTON Pay) and the proposal modal (for Anton Agent Pay):

```
┌──────────────────────────────────────────────────┐
│  Wallet recovery: complete one more step          │
│                                                  │
│  You restored this wallet on a new device. The   │
│  chain needs a one-time update so this device    │
│  can sign payments on your behalf.               │
│                                                  │
│  This costs 0.001 FTC in network fees.           │
│  After this, payments work normally.             │
│                                                  │
│  Your 24-word backup IS what proves you own this │
│  wallet. The recovery doesn't reveal it.          │
│                                                  │
│         [Skip for now]   [Update now]            │
└──────────────────────────────────────────────────┘
```

- "Skip for now" — wallet stays in `falcon_rotation_pending`; the prompt re-appears on next app launch.
- "Update now" — Pay-app constructs + signs the `rotate_falcon_pub` tx, submits via the standard `submit_signed_transaction` path, polls for confirmation, flips the wallet state to `active` once mined.
- Biometric / passphrase gate is identical to a normal send.

### 4.3 What does NOT happen

- We do NOT silently rotate without the user's explicit consent — the modal is the safety boundary same as device-attestation + Agent Pay.
- We do NOT block the user from receiving FTC during the pending window. Receives don't require FALCON sigs.
- We do NOT auto-rotate on every restore "just in case" — only when detection confirms a mismatch.

---

## 5. Chain-side changes

### 5.1 New consensus constant

```rust
// PQ user-signature enforcement starts here. Below this height,
// user-side FALCON sigs are SHADOW (validated when present, not
// required). At/above, hybrid Ed25519+FALCON is required on every
// user tx, and rotate_falcon_pub is the only way to register the
// FALCON pub bound to an address.
pub const PQ_ENFORCEMENT_HEIGHT: u64 = /* set when hard fork is scheduled */;
```

The choice of activation height is its own decision; the spec assumes ≥ 6 months of advance notice + a clear public roadmap so wallet operators can update.

### 5.2 RPC additions

```
GET /address/{fc_…}/falcon_pub
  → { pub: base64(897 bytes), rotation_nonce: u64, last_rotated_block: u64 | null }
  (404 if address has no registry entry yet)

POST /submit_signed_transaction
  → existing endpoint accepts the new RotateFalconPub variant
  → new error codes:
      FALCON_PUB_MISMATCH  (sig was hybrid but FALCON pub doesn't match registry)
      ROTATION_NONCE_BAD   (rotate_falcon_pub with wrong nonce)
      ROTATION_TOO_FREQUENT (>1 rotation in any 10 blocks; rate-limit per address)
```

### 5.3 Registry storage

Extends the per-address registry already used for the FALCON pub:

```sql
ALTER TABLE wallet_registry ADD COLUMN rotation_nonce BIGINT DEFAULT 0;
ALTER TABLE wallet_registry ADD COLUMN last_rotated_block BIGINT;
```

(Per-block undo data needs to capture old `falcon_pub` + `rotation_nonce` so a reorg rewind restores them correctly. Mirror the pattern already used for UTXO undo in `BlockUndo`.)

### 5.4 Heimdall awareness

A `RotateFalconPub` tx is in scope for Heimdall screening — same compliance signature requirement as PACS.008. The "this address rotated its FALCON keypair" event is a useful signal for the Mimir customer-risk engine (rotation patterns that look like account-takeover preparation should age into the risk score). Add a new `HD-PQ-04` control row tracking rotation frequency per address.

---

## 6. SDK additions

In `@futurechain/sdk`:

```typescript
// New wallet helper
export function buildRotateFalconPubTransaction(args: {
  address: string;
  oldFalconPub: Uint8Array;
  newFalconPub: Uint8Array;
  newFalconPriv: Uint8Array;
  ed25519Priv: Uint8Array;
  nonce: bigint;
  timestamp: number;
  feeFtc: number;
}): Transaction;

// Read-only registry helper
export class RpcClient {
  /** Returns the FALCON pub currently registered for an address,
   *  or null if no rotation/registration has happened yet. */
  async getRegisteredFalconPub(address: string): Promise<{
    pub: Uint8Array;
    rotationNonce: bigint;
    lastRotatedBlock: bigint | null;
  } | null>;
}
```

Pay-app uses these to implement the detection + rotation flow without re-implementing the byte-level transaction encoder.

---

## 7. Phases

| Phase | Scope                                                            | Trigger                                                |
|-------|------------------------------------------------------------------|--------------------------------------------------------|
| **P0** | This spec, signed off                                            | Now (2026-05-24)                                       |
| **P1** | Chain-side: new tx type + consensus rule + RPC + registry schema | When PQ hard fork is scheduled (≥ 6 months out)        |
| **P2** | SDK helpers (`buildRotateFalconPubTransaction` + RPC method)     | Same release as P1                                     |
| **P3** | Pay-app detection + modal + rotation flow                        | Released ≥ 1 month before `PQ_ENFORCEMENT_HEIGHT`      |
| **P4** | Agent Pay equivalent (mirror of P3 for the desktop client)       | Released same time as P3                               |
| **P5** | Heimdall HD-PQ-04 rotation-frequency control                     | Same release as P1                                     |
| **P6** | Post-fork operations: monitor rotation-event volume, support flows | After `PQ_ENFORCEMENT_HEIGHT` activates                |

---

## 8. Acceptance criteria (when implementation happens)

- [ ] **Chain — happy path.** A `RotateFalconPub` tx with valid Ed25519 sig + valid new-FALCON sig, correct nonce, and matching `old_falcon_pub` is accepted; the registry is updated; the event is emitted.
- [ ] **Chain — replay.** Re-submitting the same `RotateFalconPub` is rejected (nonce already used).
- [ ] **Chain — wrong old pub.** A `RotateFalconPub` whose `old_falcon_pub` doesn't match the registry is rejected.
- [ ] **Chain — bad Ed25519 sig.** Rejected (proves caller doesn't have the seed).
- [ ] **Chain — bad new FALCON sig.** Rejected (proves caller doesn't actually have the new priv).
- [ ] **Chain — rate-limit.** Two `RotateFalconPub` for the same address within 10 blocks: second rejected.
- [ ] **Chain — reorg safety.** A 5-block reorg that drops a `RotateFalconPub` correctly restores the old `falcon_pub` + `rotation_nonce`.
- [ ] **Pay-app — detection.** After restore, the proactive read of `/address/{fc_…}/falcon_pub` happens within 5 s of the wallet entering the active state.
- [ ] **Pay-app — modal.** The rotation modal appears; "Skip for now" persists the pending state; "Update now" submits + polls + flips to active.
- [ ] **Pay-app — biometric gate.** Same biometric + passphrase gate as a regular send.
- [ ] **Pay-app — failure recovery.** Network failure during rotation submit doesn't leave the wallet in a wedged state — the next attempt re-tries cleanly.
- [ ] **Agent Pay — same as Pay.** Mirror the detection + modal + flow.
- [ ] **Heimdall — HD-PQ-04.** Rotation events flow into the risk engine; a wallet that rotates twice in 24 h flags an INFORMATIONAL alert (could be normal — new device, new device again — but worth surfacing for the analyst review queue).

---

## 9. Threats + non-goals

### 9.1 Threats this defends against

- **Common case**: user restored from seed, can't sign post-fork. The rotation gives them a recoverable path with one click + a 0.001 FTC fee.

### 9.2 Threats this is NEUTRAL on

- **Mnemonic theft.** An attacker with the 24 words can rotate the FALCON pub to one they control. **Same threat surface as today's Ed25519-only setup** — the mnemonic has always been the root of trust. We don't gain a new attack class.
- **Phishing for "rotation"**. A malicious site could try to convince a user "your wallet needs a security update — sign here". The modal mitigates this: it shows the rotation tx contents (new FALCON pub) which a phisher gains nothing from making the user sign. But a generic "trick the user into signing anything" attack is broader than this spec.

### 9.3 Non-goals

- **Multi-FALCON-pub per address.** Some chains allow multiple co-signing keys; FutureChain explicitly does not. Each address has ONE current FALCON pub + a rotation history.
- **Time-locked rotations.** Some governance models require a delay between announcing a rotation and it taking effect. We don't do that — rotations are immediate. The chain rate-limit (10 blocks between rotations per address) prevents spam.
- **Recovery via friends / social custody.** Out of scope — see [[PAY_WALLET_PASSPHRASE_SPEC]] §6 "social recovery".

---

## 10. Open design questions — Daniel sign-off needed before implementation

1. **Rotation fee level.** 0.001 FTC vs 0.01 FTC vs match the standard transfer fee? My recommendation: **0.001 FTC** — low enough that legitimate users barely notice, high enough that an attacker scripting mass rotations against guessed mnemonics burns FTC fast.
2. **Pre-fork rotation allowed?** Should the chain accept `RotateFalconPub` BEFORE `PQ_ENFORCEMENT_HEIGHT` (early-adopter wallets can pre-stash their canonical FALCON pub)? My recommendation: **yes** — define the tx kind to activate at a separate, earlier `ROTATE_FALCON_ALLOWED_HEIGHT` so early-mover wallets are already canonical when enforcement starts.
3. **Rate-limit window.** 10 blocks between rotations per address vs longer (e.g. 100 blocks ≈ 10 min)? My recommendation: **10 blocks** — minimum-friction for users with legitimate "I bought a new phone, then bricked it the same day" scenarios, and the per-rotation fee already deters spam.
4. **Heimdall risk score impact.** Should rotations contribute to the risk score, or be purely informational? My recommendation: **informational below 3 rotations/30 days, low-risk signal at 3-5/30, escalate to manual review at >5/30** — gives the operator data without auto-penalising legitimate users.
5. **Notification on the receive side.** If Alice sends to Bob and Bob's address has rotated since Alice last paid him, should Alice's wallet show a "Bob rotated his security key on YYYY-MM-DD" badge? My recommendation: **no for MVP** — could confuse non-technical users and the security-relevance is minimal (the address still controls the same funds).
6. **First-rotation-vs-bootstrap distinction.** §3.3 says wallets with no prior outgoing tx don't need rotation — first send registers the FALCON pub. Should we ALWAYS require an explicit `RotateFalconPub` even for first-time-registers, for uniformity? My recommendation: **no** — the bootstrap path is simpler and there's no security cost (the first registration is implicitly proven by the standard tx signature).
7. **Receive-side wallet ID change.** Should restoring a wallet on a new device + rotating change the address (so the user gets a fresh fc_)? My recommendation: **NO** — the address derives from the Ed25519 pub which is deterministic from the seed; changing the address would break receive flows + invoice history. Only the FALCON pub rotates.

---

## 11. References

- [[PAY_WALLET_PASSPHRASE_SPEC]] §3.2.1 — FALCON keypair in envelope v3
- [[PAY_DEVICE_ATTESTATION_SPEC]] — sibling Phase-1-now / Phase-2-later spec pattern
- [[ANTON_AGENT_PAY_SPEC]] §6 — desktop client that ALSO has to implement this flow
- `[[project_quantum_resistance_plan]]` — broader PQ migration plan
- `[[project_phase5_deployed_may24_2026]]` B7 — the open question this spec closes
- FALCON / FN-DSA (FIPS 206 draft) §3.4 — non-determinism in `KeyGen` discussed at the algorithm level
- Bindel et al. (PQCrypto 2019) — naïve combiner EUF-CMA analysis (covered in `ey_audit_package/addenda/05A_CRYPTOGRAPHY_PHASE4_SUPERSESSION.md` Appendix A)
