# PAY_QR_TRANSFER_SPEC.md

**Status:** Draft 1 (2026-05-26). Pre-code spec — pairs with `PAY_DEVICE_ATTESTATION_SPEC.md`, `PAY_WALLET_PASSPHRASE_SPEC.md`, `PAY_FALCON_ROTATION_SPEC.md` in the same docs folder.

**Purpose:** define how two ANTON Pay phones transfer a full PACS.008 payment payload between each other using **animated fountain-coded QR codes**, with no network dependency. Solves the "PACS.008 carries more data than one QR can hold" problem.

**TL;DR:** Sender plays a looped animation of fountain-coded QR frames at ~5 fps; receiver scans frames until the fountain decoder reports complete (typically 1-5 seconds); both phones flip to the OS-native confirmation modal showing recipient + amount + reason; user taps Approve to submit.

---

## 1. Why

ANTON Pay's payment flow needs to convey the full PACS.008 message — debtor name + address + country, creditor name + address + country, amount + currency, BIC codes if any, end-to-end ID, UETR, remittance information, structured payment-purpose fields, optional KYC tier hints. Typical payload size:

| Encoding | Approx size |
|---|---|
| Raw XML (PACS.008.001.13) | 2–4 KB |
| Canonical JSON | 1–2 KB |
| CBOR (what UR uses) | 600 B – 1.5 KB |
| CBOR + gzip | 400 B – 1 KB |

A single QR code at Version 40 ECC L can hold ~2,953 bytes — technically a CBOR-encoded payment fits inside one QR. But:
- Real PACS.008 with structured remittance, multiple BICs, longer text fields can push past one-QR-fits-all
- A single dense QR-V40 is hard to scan at distance / angle / poor lighting
- One-QR-fits-all means tomorrow's slightly-larger payment breaks the UX

Fountain-coded animated QR sidesteps the size ceiling entirely and gives a more forgiving scan experience.

This pattern is shipping in hardware wallets today: Foundation Passport, Sparrow, Specter, Keystone, Cobo Vault all use the same scheme for transferring PSBTs ≫ 1 KB between offline phones and online machines. We use the same standard so future interop is possible if a wallet vendor ever wants to read our format.

---

## 2. Threat model (current cut: no encryption)

**Daniel's framing (2026-05-26):** for Phase 1 we deliberately skip the end-to-end encryption layer.

- **P2P friend pays friend**: parties already know each other's names + addresses, no new exposure.
- **P2C consumer pays merchant**: merchant inherently knows where the customer paid (transaction → customer ID at merchant's end).
- **Nordic-public-data context** (Sweden, where most of FutureChain's first users will be): name, civic registration number, postal address, and current employment are public records via Skatteverket / `mrkoll.se` / similar lookup services. The PACS.008 fields don't reveal anything that's not already public.
- **On-chain data is the bigger window**: whatever lands in the QR also lands on-chain (visible to any node operator + the public block explorer). The QR's brief on-screen exposure adds nothing over the chain-level exposure that follows seconds later.

Conclusion: **no encryption layer in v1**. The QR animation transports the PACS.008 payload in the clear.

**For Phase 2 / future** (regulated KYC customers, cross-border, EU-customer PII protection): see §10 — a `crypto-sealed-message`-wrapped variant is sketched but not implemented in v1.

---

## 3. Scope

### In scope (v1)

- Sender-side: take a draft PACS.008 (from `src/pay/services/pacs008-draft.ts` or composed in the Send screen), encode as CBOR, wrap in UR (Uniform Resources), generate the fountain-coded frame stream, render an animated QR canvas at 5 fps.
- Receiver-side: open camera + ML-Kit / @zxing scanner, feed every successfully-decoded QR frame to a UR fountain decoder, beep + advance to the confirmation modal when the decoder reports complete.
- Confirmation modal: existing OS-native review modal pattern (recipient name + fc_ address + amount + fee + agent/sender identity + remittance reference). Approve → submit through the existing payment.ts path.
- Timeouts + cancellation: receiver gives up + offers retry after 30 s of incomplete scan; sender's frame loop has no automatic timeout (shopkeeper stops when they choose).

### Out of scope (v1)

- End-to-end encryption (see §2 + §10).
- Pairing handshake / receiver-pubkey QR pre-step (collapsed away since no encryption).
- Bluetooth / NFC fallback (QR-only).
- Multi-recipient (split) payments — one PACS.008 = one recipient in v1.
- Animated QR receive on the *sender's* side (only the receiver scans; the sender displays).
- Replay defense in the QR layer (the chain rejects replays via UTXO model + UETR uniqueness).

### Explicitly not shipped

- Headless/silent transfer. The user-confirmation modal is mandatory on BOTH sides (sender confirms "show this payment to be received"; receiver confirms "accept this payment and submit to chain").

---

## 4. Architecture

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│      ANTON Pay — SENDER      │         │     ANTON Pay — RECEIVER     │
│ ┌──────────────────────────┐ │         │ ┌──────────────────────────┐ │
│ │ Send screen              │ │         │ │ Receive screen           │ │
│ │ (existing UI)            │ │         │ │ (taps "Scan to receive") │ │
│ └────────┬─────────────────┘ │         │ └────────┬─────────────────┘ │
│          │ user taps         │         │          │                   │
│          │ "Show as QR"      │         │          │ opens camera      │
│          ▼                   │         │          ▼                   │
│ ┌──────────────────────────┐ │         │ ┌──────────────────────────┐ │
│ │ pacs008-draft.ts builds  │ │         │ │ QR scanner (@zxing or    │ │
│ │ canonical PACS.008 obj   │ │         │ │  Capacitor BarcodeScan)  │ │
│ └────────┬─────────────────┘ │         │ └────────┬─────────────────┘ │
│          ▼                   │         │          ▼                   │
│ ┌──────────────────────────┐ │         │ ┌──────────────────────────┐ │
│ │ cbor-x encode            │ │         │ │ UR fountain decoder      │ │
│ │ → bc-ur encoder          │ │         │ │ (@ngraveio/bc-ur)        │ │
│ │ → fountain frame stream  │ │         │ └────────┬─────────────────┘ │
│ └────────┬─────────────────┘ │         │          │ on COMPLETE       │
│          ▼                   │  📷 cam │          ▼                   │
│ ┌──────────────────────────┐ │ ───────▶│ ┌──────────────────────────┐ │
│ │ AnimatedQrPlayer         │ │ frames  │ │ Confirmation modal       │ │
│ │ renders frame[i] at 5 fps│ │         │ │ (recipient/amount/fee)   │ │
│ │ in a loop, infinite      │ │         │ └────────┬─────────────────┘ │
│ └──────────────────────────┘ │         │          │ user taps Approve │
│                              │         │          ▼                   │
│                              │         │ ┌──────────────────────────┐ │
│                              │         │ │ payment.ts (existing)    │ │
│                              │         │ │ executePayment → chain   │ │
│                              │         │ └──────────────────────────┘ │
└──────────────────────────────┘         └──────────────────────────────┘
                                                  │
                                                  ▼
                                          Bahnhof / RPC
                                          /submit_signed_transaction
```

The arrow direction in v1: **the SENDER of the payment displays QR; the RECEIVER scans + submits to the chain.** This matches the common "pay-with-QR" model where the recipient holds the active scanner (shopkeeper scans customer's phone). Counter-intuitive at first glance but reflects who actually signs + submits the transaction: the wallet whose funds are being spent. So "sender" here = sender of the QR data = sender of the FTC; "receiver" = recipient of the FTC; receiver's app is the one that constructs the on-chain transaction from the scanned PACS.008 + their own UTXOs.

Alternative model — the customer scans the merchant's QR (merchant displays a payment-request QR) — is **Phase 2 / Receive-screen variant** and described in §11.

---

## 5. Wire format

### 5.1 Outer envelope: UR (Uniform Resources)

We use [Blockchain Commons' UR spec](https://github.com/BlockchainCommons/Research/blob/master/papers/bcr-2020-005-ur.md) — the same scheme Sparrow / Specter / Foundation Passport use.

Each frame is a URI of the shape:

```
ur:<type>/<seq-num>-<total>/<bytewords-payload>
```

- `<type>` — our custom type tag, e.g. `fc-pacs008` (see §5.3).
- `<seq-num>` — fountain chunk index (not strictly sequential — fountain codes generate combined chunks indexed by a seed).
- `<total>` — the original chunk count (lets the decoder know when it has "enough").
- `<bytewords-payload>` — bytewords-encoded fountain chunk. Bytewords is UR's preferred encoding (uses only QR-friendly characters; more compact than base32, less than base64).

A typical frame is 200–400 ASCII characters long → comfortable QR-V10-to-V15 ECC M code, scans easily at arm's length.

### 5.2 Inner payload: CBOR

The PACS.008 message is encoded with **CBOR** (RFC 8949) via the `cbor-x` library before UR wraps it. CBOR is ~30-50 % more compact than JSON for our shape (lots of short string keys, numeric amounts).

### 5.3 Custom UR type tag

We register `fc-pacs008` as our type tag. Decoders that don't know this tag will refuse the payload (defensive: prevents accidentally interpreting an unrelated UR stream as a payment).

Specifically: the inner CBOR object follows the canonical PACS.008.001.13 shape we already use in `src/pay/services/pacs008-draft.ts`. That same shape goes into the on-chain transaction's `metadata.iso20022_ref` field after submission, so this QR-transport encoding is the same encoding we already produce + verify everywhere else.

### 5.4 Sanity: example frame

For a payment with debtor "Alice Andersson, Stockholm", creditor "Coffee Shop AB", 0.5 FTC, end-to-end ID "INV-2026-05-26-0042", a single fountain frame might look like:

```
ur:fc-pacs008/12-9/lpadbbcsiecyaegyjygryteijejejphsiajeihjyjyjkjlihjkjkjeishsiehsjyjeishsisjeissehshsiehsjyjeishsisjeissehshs
```

— ~120 characters → QR-V8 ECC M.

### 5.5 Frame timing

- Default rendering: **5 frames per second** (200 ms per frame).
- Adaptive fallback: if the receiver reports < 1 successful decode in 1 s, sender drops to 3 fps (slower phones / poor cameras keep up).
- Frame loop is infinite — keeps replaying combined chunks forever. Each combined chunk is a different XOR of the input chunks, so each successive frame is useful even after many loops.
- Receiver progress display: "scanned N of ~M" where M is the original chunk count (sent in the very first frame's UR header, learned within ~200 ms).

---

## 6. Sender flow (state machine)

```
IDLE
  ↓ user taps "Show as QR" on the Send screen
  ↓ pacs008-draft.ts validates draft (mandatory fields present, amount > 0, etc.)
  ↓ if validation fails → toast + stay in Send screen
COMPOSING
  ↓ cbor-x encodes draft → bytes
  ↓ bc-ur encoder splits into N chunks (chunk size = 100 bytes by default)
  ↓ creates fountain-code generator (seeded from time + payload hash)
READY
  ↓ canvas + Animated QR Player render frame 0
PLAYING
  ↓ on every 200 ms tick:
  ↓   generate next fountain frame (combined chunk)
  ↓   render to canvas
  ↓ optional sender progress: "spinning · ~N chunks · M frames played"
USER_CANCEL
  ↓ user taps Close → return to Send screen unchanged
END
```

There is **no automatic completion** on the sender's side. The sender phone has no idea whether the receiver has scanned enough frames. The sender keeps spinning until the user explicitly closes it. (Optional Phase 2 enhancement: receiver beams a tiny "GOT IT" QR back to the sender, which switches the sender screen to a "Receiver got it ✓" confirmation; not in v1.)

---

## 7. Receiver flow (state machine)

```
IDLE
  ↓ user taps "Scan to receive" on the Receive screen
  ↓ request camera permission (if not granted → guide-to-Settings deep link)
SCANNING
  ↓ camera open, scanner running at ~10 fps
  ↓ each successfully-decoded QR string fed to bc-ur decoder
  ↓ decoder maintains running state: estimated chunks needed, chunks received
  ↓ UI shows: "scanned X / ~Y · keep pointing at the screen"
  ↓ if 30 s pass with progress < 50 %  → "Having trouble? Try closer / brighter / less angle"
  ↓ if 60 s pass with no progress → "Cancel and retry?"
DECODING
  ↓ on decoder COMPLETE: stop camera, decode → CBOR → PACS.008 object
  ↓ validate shape: required fields present, types correct, amount > 0, addresses are valid fc_
  ↓ if invalid → "QR was scanned but the payment is malformed" + Retry
REVIEW
  ↓ open OS-native confirmation modal (reuse the existing PaymentReviewScreen)
  ↓ show: sender address, sender name (PACS.008 debtor.name), recipient (self) address,
  ↓ amount, fee, remittance reference, ISO20022 end-to-end ID
USER_APPROVE
  ↓ user taps Approve → biometric / passphrase gate (existing flow)
  ↓ payment.ts::executePayment(decoded PACS.008) → chain submit
DONE
  ↓ success toast + activity-feed entry
```

Receiver UI feedback while scanning:
- A progress ring around the camera preview that fills as new chunks arrive.
- A "scanned N / ~M chunks" counter below the camera.
- Subtle vibration buzz on each successful new-chunk capture (haptic feedback so the user feels progress).

---

## 8. UI requirements

### 8.1 Sender-side (Display QR screen)

- Full-screen black background, QR centered, ~70 % of the shorter screen dimension.
- White margins around the QR (mandatory for scanner contrast).
- Above the QR: "Show this to the recipient" + the FTC amount + recipient name.
- Below the QR: subtle "spinning" indicator (small dot animation), so the user knows the screen is alive — frames look static at 5 fps to the human eye unless the QR pattern's "noise" is obvious.
- Single "Close" button.
- Screen brightness forced to max while displayed (existing `@capacitor/screen-brightness` plugin already used).

### 8.2 Receiver-side (Scan to receive screen)

- Camera preview filling top 60 % of the screen with a viewfinder overlay (rounded square crop guide).
- Progress ring around the viewfinder edge, ticks up with each successful chunk.
- "Scanned 7 / ~12 chunks" counter below.
- "Cancel" button.
- On error → in-place toast + retry button (don't lose the camera state).

### 8.3 Both sides — confirmation modal

Reuse the existing `PaymentReviewScreen` component (already in `src/pay/screens/ReviewScreen.tsx` or equivalent). No new modal needed — same OS-native review pattern as ordinary Pay flows, including biometric/passphrase gate.

---

## 9. Libraries + implementation footprint

| Concern | Lib | Notes |
|---|---|---|
| UR encoding/decoding | `@ngraveio/bc-ur` (or `@gridplus/bc-ur`) | The most maintained TypeScript port. ~40 KB minified. Includes the fountain code. |
| CBOR encode/decode | `cbor-x` | Fast, smaller than `cbor` package. Already a common dependency. |
| QR rendering (canvas) | `qrcode` (`npm:qrcode`) or `@bitjson/qr-code` (custom element) | Either works; `qrcode` is simpler for our case (we just need raster output to a canvas). |
| QR scanning | `@capacitor-community/barcode-scanner` (native ML-Kit on Android, AVFoundation on iOS) OR `@zxing/library` for in-WebView fallback | Capacitor plugin first for performance; fall back to zxing if a partner ships in pure-web context. |
| Camera + screen control | `@capacitor/camera`, `@capacitor/screen-brightness` | Already used elsewhere in the app — no new deps. |

**Code budget** for the full feature (sender + receiver + UI screens + state machines + tests):

| Area | LoC est. |
|---|---|
| `src/pay/services/qr-transfer/encoder.ts` (sender side: CBOR → UR → frame iterator) | ~120 |
| `src/pay/services/qr-transfer/decoder.ts` (receiver side: UR feeder + completion detector) | ~100 |
| `src/pay/screens/QrDisplayScreen.tsx` (animated QR canvas + Close button) | ~150 |
| `src/pay/screens/QrScanScreen.tsx` (camera + scanner + progress UI) | ~180 |
| Wiring + biometric gate reuse + activity-feed entry | ~80 |
| Unit tests (encoder, decoder, shape validation, round-trip) | ~150 |
| E2E test (two synthetic phones — Playwright/Detox or a vitest harness) | ~120 |
| **Total** | **~900 LoC** |

Roughly a week of focused work, including QA on actual hardware.

---

## 10. Phase 2 — encryption layer (deferred)

When ANTON Pay starts serving KYC'd customers across borders (especially out-of-Nordic where civic data is not public), the PII concern returns. The Phase 2 design layers a `crypto-sealed-message` envelope inside the UR stream:

```
   payload (PACS.008 CBOR)
       ↓
   NaCl sealed-box encrypt to recipient's ephemeral pubkey
       ↓
   UR wrap (type tag: fc-pacs008-sealed)
       ↓
   fountain code → animated QR stream
```

The recipient first displays a small **one-frame QR** containing an ephemeral X25519 public key (~80 bytes, fits in one V3 QR, instant scan). The sender's app reads that pubkey, encrypts the PACS.008 to it, then streams the encrypted blob via the animated QR loop. Only the recipient's app (holding the matching ephemeral private key) can decrypt.

This is exactly the [`crypto-sealed-message`](https://github.com/BlockchainCommons/Research/blob/master/papers/bcr-2020-008-eckey.md) pattern from BCR-2020-008. **Approximately +100 LoC + one extra screen on the receiver side.** Not in v1.

---

## 11. Phase 2b — merchant-displays-request variant (deferred)

The flow described in §4 has the customer's phone displaying the QR (the customer authorises spending their funds). An alternative — common in retail PSP flows — has the **merchant displaying a payment-request QR** that the customer scans:

```
Merchant phone:
  → composes a partial PACS.008 (creditor = merchant address, amount,
    end-to-end ID, no debtor yet)
  → fountain-codes + displays
Customer phone:
  → scans the request
  → ReviewScreen shows merchant + amount; customer approves
  → customer's wallet fills in debtor side + signs + submits
```

This is a strictly larger surface (now the customer is the one constructing + signing the on-chain transaction, but from a merchant-supplied draft) and we don't need it for the friend-to-friend or small-merchant cases the v1 design targets. Track as a Phase 2 idea.

---

## 12. Acceptance criteria (v1)

- [ ] Sender's Send screen has a "Show as QR" action that opens the new `QrDisplayScreen`.
- [ ] Receiver's app has a "Scan to receive" action that opens the new `QrScanScreen`.
- [ ] A round-trip of a typical PACS.008 (~1 KB CBOR) completes scan in ≤ 5 seconds with both phones held at arm's length under indoor lighting.
- [ ] Round-trip with a maxed-out PACS.008 (4 KB CBOR — full KYC, structured remittance, multiple BICs) completes in ≤ 15 seconds.
- [ ] Receiver shows live progress ("scanned X / ~Y") within 1 second of the first frame.
- [ ] Receiver beeps + haptic-buzzes on completion.
- [ ] On completion the confirmation modal opens with: debtor name, debtor address, amount, fee, end-to-end ID, remittance reference, ISO20022 message ID.
- [ ] Confirm flow goes through the existing biometric / passphrase gate (no bypass).
- [ ] After Approve → existing `payment.ts::executePayment` is called; the tx submits + the activity feed shows the new payment.
- [ ] Cancel during scan → camera released, no allocations leaked, no partial state retained.
- [ ] Cancel during display → frame timer stopped, canvas cleared, screen brightness restored.
- [ ] Scanner robustness: covering the screen mid-scan → resumes from where it left off (fountain code handles missing chunks).
- [ ] Backwards compatibility: a UR payload of a known type tag other than `fc-pacs008` (e.g. someone tries to scan a Bitcoin PSBT) → friendly error message, no crash, no silent acceptance.
- [ ] Telemetry / audit log: every successful transfer writes an entry to the local activity DB with `transport: 'qr'` so it's traceable in support.

---

## 13. Tests

- **Unit** (`src/pay/services/qr-transfer/*.test.ts`):
  - encoder produces decodable UR frames for sample PACS.008 shapes
  - decoder reconstructs the exact CBOR payload given any K-of-N subset of frames
  - decoder rejects mixed/wrong-type-tag frames
  - encoder handles 100 B, 1 KB, 4 KB, 16 KB payloads (last one as a sanity stress)
- **Integration** (vitest + headless harness):
  - simulate the sender's frame stream as an in-memory iterator
  - feed selected frames to the decoder (random drops to test fountain robustness)
  - assert correct PACS.008 reconstruction
- **E2E manual** (two phones, on-device):
  - send/receive a small payment (0.01 FTC, minimal PACS.008) — capture time
  - send/receive a maximum-size PACS.008 — capture time + error rate
  - intentionally cover the screen partway → scan resumes
  - low-light scan attempt → either succeeds slowly or surfaces "improve lighting" hint

---

## 14. References

- BCR-2020-005 — Uniform Resources (UR). https://github.com/BlockchainCommons/Research/blob/master/papers/bcr-2020-005-ur.md
- BCR-2020-009 — UR Multi-Part. https://github.com/BlockchainCommons/Research/blob/master/papers/bcr-2020-009-multi-part.md
- BCR-2020-008 — Crypto Sealed Message (for Phase 2 §10).
- RFC 8949 — Concise Binary Object Representation (CBOR).
- ISO 20022 PACS.008.001.13 — already documented in `futurechain/docs/MICA_COMPLIANCE.md`.
- Similar shipping implementations: Foundation Passport firmware (UR-PSBT), Sparrow wallet's "Animated QR" feature, Specter Desktop "QR Code Animation".

---

## 15. Open questions for Daniel sign-off

1. **Type tag name** — confirm `fc-pacs008` is fine, or prefer `futurechain-pacs008` (more descriptive) / `ftc-pacs008` (matches the token symbol).
2. **Default frame rate** — 5 fps is the proposed default. Hardware-wallet ecosystem typically uses 4-8 fps. Stay at 5 or pick a different default?
3. **Chunk size** — 100 bytes per chunk is a reasonable mid-point. Smaller (50 B) = more frames + smaller QRs = easier to scan but more frames; larger (200 B) = fewer frames + bigger QRs = harder to scan. Stay at 100 or pick a different default?
4. **Receiver progress indicator style** — progress ring around the camera viewfinder + "scanned X / ~Y" counter. OK or different preference?
5. **Sender screen brightness force-max** — proposed. OK or leave the user's setting alone?

Phase 1 acceptance is roughly a week of focused implementation. Ship as a follow-up commit to the pay-app after current work settles.
