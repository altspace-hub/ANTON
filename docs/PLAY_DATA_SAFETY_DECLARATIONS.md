# Google Play Data Safety — declarations (draft)

**Status:** engineering draft for operator review, 2026-06-15. Derived from a code-level
data-flow audit of all four apps (off-device transmissions traced from `services/`).
**Not legal advice** — have counsel review before you submit each form in the Play Console.

## How to read this

Google Play's **"collected"** means *transmitted off the device*. Anything that stays only
on the device (the Android Keystore, IndexedDB, Capacitor Preferences) is **not** collected
and is **not** declared. All four apps are **local-first / self-custody**, so most sensitive
data (wallet private keys, recovery phrases, the local message store, contacts, receipts) is
**on-device only** and correctly omitted from the "collected" tables below.

**"Shared"** means transferred to a third party. For these apps the decisive case is the
**public FutureChain ledger**: a signed payment is broadcast to a world-readable blockchain,
so anything written on-chain is **shared** (and *permanent* — it cannot be deleted).

Each app section gives: (1) the three top-level form answers, (2) the per-data-type table to
enter, (3) the Security section, (4) app-specific notes. A consolidated list of
**decisions to make before submitting** is at the end.

Play purposes used: **AppFn** = App functionality · **Sec** = Fraud prevention, security &
compliance · **Acct** = Account management.

---

## 1. ANTON Pay — `com.futurechain.anton.pay`

A self-custody FTC wallet. It signs PACS.008 credit transfers on-device and broadcasts them
to a **public** ledger via an RPC node.

**Top-level answers**
- Collect or share required user data? → **Yes**
- All collected data **encrypted in transit**? → **Yes** (TLS to `rpc.futurechain.eu`; the only non-TLS option is a user-typed `http://127.0.0.1` local node)
- Provide a way to **request data deletion**? → **Yes** (Settings → Reset app wipes all local data + keys; uninstall clears the Keystore). *Caveat to disclose: on-chain history is immutable and cannot be deleted.*

| Data type (category) | Collected | Shared | Ephemeral | Req/Opt | Purposes | Why |
|---|---|---|---|---|---|---|
| **Purchase history** (Financial info) | Yes | **Yes** | No | Required | AppFn | Signed PACS.008 (amount, fee, sender+recipient `fc_` addresses, order/purpose) broadcast to the public ledger |
| **Name** (Personal info) | Yes | **Yes** | No | Required | AppFn, Sec | Payer's real name is mandatory in the on-chain PACS.008 Debtor party |
| **Address** (Personal info) | Yes | **Yes** | No | Optional¹ | Sec | Originator postal address on-chain **only for transfers ≥ €1000** (Travel Rule); sub-threshold sends omit it (GDPR minimisation) |
| **Other in-app messages** (Messages) | Yes | **Yes** | No | Optional | AppFn | Free-text remittance note / structured template, broadcast in **cleartext** on the public ledger (not encrypted, unlike Comm) |
| **Other financial info** (Financial info) | Yes | **Yes**² | Yes | Required | AppFn | Wallet `fc_` address sent to the RPC node on every balance/UTXO/history read (address↔IP linkage to the node operator) |
| **User IDs** (Personal info) | Yes | No | No | Optional | Sec, AppFn | `fc_` address + Ed25519 **public** key + signature to `/register_address` (proof-of-control). Private key never leaves the device |
| **Device or other IDs** (Device or other IDs) | Yes | No | No | Required | Sec, AppFn | Random per-install UUID (`install_id`) to `/enroll` for a per-install bearer (anti-abuse). Not a hardware/advertising ID |
| **Other actions** (App activity) | Yes | No | Yes | Required | Sec | Google **Play Integrity** verdict token to `/attest` gating high-risk submits |

¹ Address is "required" *when the ≥€1000 tier applies* — declare Optional (most P2P sends omit it). ² Shared because the address is observable on the public ledger; the RPC read itself goes only to the node operator.

**On-device only (NOT declared):** wallet Ed25519 keys + BIP-39 phrase (Keystore), sent/received payment history, contacts, payer identity, money/behaviour profiles + local fraud engine, tax residency/position + CSV export (export leaves only via the user's OS share sheet), payment PIN + passphrase, RPC endpoint list.

---

## 2. ANTON Comm — `com.futurechain.anton.communication`

E2E-encrypted messenger **+** self-custody wallet. Message content is sealed on-device
(X25519 + AES-256-GCM) before it touches the relay; the relay forwards opaque ciphertext.

**Top-level answers**
- Collect or share required user data? → **Yes**
- All collected data **encrypted in transit**? → **Yes** (messages/media/voice/location are E2E; relay/RPC/enroll/attest/push calls are TLS)
- Provide a way to **request data deletion**? → **Yes** (sign-out wipes identity + Keystore key; uninstall removes all local stores; no server-side account exists). *Caveat: on-chain payments are permanent.*

| Data type (category) | Collected | Shared | Ephemeral | Req/Opt | Purposes | Why |
|---|---|---|---|---|---|---|
| **Other in-app messages** (Messages) | Yes | No | Yes | Required | AppFn | Text/reactions/edits/agreements — **E2E-encrypted**, relayed; developer cannot read plaintext |
| **Photos / Videos** (Photos and videos) | Yes | No | Yes | Optional | AppFn | Image/video attachments — **E2E-encrypted** via the relay |
| **Voice or sound recordings** (Audio files) | Yes | No | Yes | Optional | AppFn | Voice messages — **raw audio**, E2E-encrypted (no on-device transcript). Live *call* audio is WebRTC P2P (not relayed) |
| **Precise location** (Location) | Yes | No | Yes | Optional | AppFn | GPS one-shot / live-share to a chosen contact — **E2E-encrypted**. Needs FINE/COARSE location permission |
| **User IDs** (Personal info) | Yes | No | No | Required | AppFn | Ed25519 **public** key + derived routing-id (pseudonymous account ID) sent as cleartext routing metadata so the relay can deliver |
| **Purchase history** (Financial info) | Yes | **Yes** | No | Optional | AppFn | In-app wallet: signed PACS.008 to the **public** ledger (same as Pay) |
| **Other financial info** (Financial info) | Yes | **Yes** | Yes | Required³ | AppFn | Wallet address on balance/UTXO reads |
| **Device or other IDs** (Device or other IDs) | Yes | No | No | Required | Sec, AppFn | Random `install_id` + Play Integrity token (`/enroll`, `/attest`) |
| **Device or other IDs** — push token (Device or other IDs) | Yes | **Yes**⁴ | No | Optional | AppFn | FCM/APNs push token. **Gated OFF by default** — only if the operator enables push. Payload carries only an opaque wake (event id + severity), never content |
| **Other user-generated content** (App activity) — Portals | Yes | **Yes** | Yes | Optional | AppFn | Visiting/invoking a third-party publisher portal sends the visitor contact-hash + typed form input **to that third-party instance** |

³ Only relevant if the user uses the wallet at all. ⁴ Shared with the OS push provider (Google FCM / Apple APNs). Omit this row entirely if push is **not** enabled at launch.

**Also for completeness (judgement call — may omit):** calling uses Google public **STUN** for NAT discovery, exposing device IP (no media) — arguably *App activity / Other actions*, no content.

**On-device only (NOT declared):** wallet & identity private keys + 24-word phrase (Keystore), the local message/media/call database, contacts/address-book, wallet ledger + tax (K4) data, payment/parental/app-lock PINs, profiles + local fraud engine. Device-migration backup leaves only via the user's OS share sheet.

**⚠ Marketing caveat:** the message crypto is confidential + key-separated but **not forward-secret** (static DH). Do **not** advertise "forward secrecy."

---

## 3. ANTON Business — `com.futurechain.anton.business`

A **receive-only** merchant POS. It does **not** sign or broadcast transactions itself — the
customer's Pay app does. Business only polls the public ledger for inbound payments to its
own address.

**Top-level answers**
- Collect or share required user data? → **Yes**
- All collected data **encrypted in transit**? → **Yes** (TLS to `*.futurechain.eu`; only a user-typed loopback node is non-TLS, and loopback is not off-device)
- Provide a way to **request data deletion**? → **Yes** (Settings → full reset wipes config/wallet/receipts/items; uninstall clears Keystore + IndexedDB). *Caveat: the merchant's on-chain address + sale history are permanent.*

| Data type (category) | Collected | Shared | Ephemeral | Req/Opt | Purposes | Why |
|---|---|---|---|---|---|---|
| **User payment info** (Financial info) | Yes | **Yes** | No | Required | AppFn | Merchant's `fc_` receiving address is the public credit account; inbound sales settle on the public ledger |
| **Purchase history** (Financial info) | Yes | **Yes** | No | Required | AppFn | Each confirmed sale is a public-ledger settlement leg read back via `/iso_received` |
| **Device or other IDs** (Device or other IDs) | Yes | No | No | Required | Sec, AppFn | Random `install_id` to `/enroll` for a per-install bearer gating the credentialed read |
| **Other financial info** (Financial info) | Yes | **Yes** | No | Optional | AppFn | Optional multi-till dashboard: signed terminal certs (incl. company `fc_` address) published to the public relay registry |

**No** Play Integrity, **no** FCM/push token, **no** camera/voice upload, **no** LLM/analytics SDK in this app.

**On-device only (NOT declared):** wallet keys + phrase + per-terminal signing key (Keystore), merchant config (legal name, org-nr, address, FX rate), all receipts/kvittos (incl. customer names lifted from inbound payments), Z-reports, customers list, items/inventory, tabs/carts/cash-drawer/refunds, app-lock PIN. CSV/SIE/kvitto exports leave only via the user's OS share sheet (not "collected").

---

## 4. ANTON Companion — `com.futurechain.anton.companion`

An assistant/approvals client paired to the user's **own self-hosted ANTON instance**. It holds
**no wallet keys** (the Wallet tab is a read-only view from the instance). Prompts/photos go to
the paired instance, which **may forward them to an LLM provider**.

**Top-level answers**
- Collect or share required user data? → **Yes**
- All collected data **encrypted in transit**? → **Yes** (fixed 2026-06-15, commit `5022d9da`). Pairing now requires HTTPS for any networked host; plain HTTP is allowed only for same-device loopback (`localhost`/`127.0.0.1`/`::1`, which never crosses the wire), and a cert-less local instance pairs via the E2E-encrypted mesh QR. The runtime user-data path (`server_base`) is gated the same way. *(The 30s reachability probe to `/api/app/discover` carries no user data.)*
- Provide a way to **request data deletion**? → **Yes** (Sign out / Unpair / Delete-all-data + uninstall; server-side data lives on the user's own instance).

| Data type (category) | Collected | Shared | Ephemeral | Req/Opt | Purposes | Why |
|---|---|---|---|---|---|---|
| **Other user-generated content** (App activity) — prompts | Yes | No⁵ | No | Required | AppFn | Typed/voice **queries** POSTed to the paired instance (which may forward to an LLM). Voice is transcribed **on-device**; only the transcript text is sent |
| **Photos** (Photos and videos) | Yes | No⁵ | No | Optional | AppFn | Capture feature: a resized photo to the instance (may forward to an LLM) |
| **Other in-app messages** (Messages) | Yes | No | No | Optional | AppFn | Community messages + mail replies (server-mediated plaintext to the instance — **not** client-E2E in this app) |
| **Other user-generated content** (App activity) — content | Yes | No | No | Optional | AppFn | Tasks / calendar events / deadlines / profile name; mail-provider OAuth/IMAP credentials if the user connects mail |
| **Other actions** (App activity) — approvals | Yes | No | No | Optional | AppFn | Approval/checkpoint decisions (Ed25519-signed envelopes) |
| **Device or other IDs** (Device or other IDs) | Yes | No | No | Required | AppFn, Acct, Sec | Pairing: device public key + device name/model/OS + app version (signed). Private key never leaves the device |
| **Device or other IDs** — push token (Device or other IDs) | Yes | **Yes** | No | Optional | AppFn | FCM/APNs push token (gated OFF unless Firebase enabled). Payload = event id + severity + title only |
| **App interactions** (App activity) | Yes | No | Yes | Optional | AppFn | Read-only discovery/control-plane calls to the user's own instance |

⁵ Not "shared" in Play's sense because it goes to the **user's own** instance; but if that instance forwards prompts/photos to a third-party LLM provider, consider disclosing that in your privacy policy.

**On-device only (NOT declared):** device Ed25519 + derived X25519 keys (Keystore), per-instance session token + device certificate, **raw microphone audio** (on-device speech recognition — only the transcript is sent), offline message queue, model/theme prefs, paired-instance list.

---

## Decisions to make before you submit

1. **Public-ledger "shared" is real and permanent (Pay / Business / Comm wallet).** Payment data —
   and for Pay the **payer's real name** (always) and **postal address** (≥ €1000) — is written to a
   world-readable blockchain. Declare these as **Shared**, and strongly consider surfacing it in-app
   + in the privacy policy (it's a genuine, irreversible privacy property users should understand).
2. ~~**Companion LAN-HTTP gap.**~~ **RESOLVED 2026-06-15 (commit `5022d9da`)** — pairing now requires
   HTTPS for off-device hosts (loopback-only HTTP; cert-less local instances use the E2E mesh QR), so
   Companion can answer "all encrypted in transit = **Yes**."
3. **Push token rows are conditional.** FCM/APNs is gated off by default in Pay/Comm/Companion. If push
   is **not** in the launch build, delete the push-token rows; if it is, keep them (Shared = Google/Apple).
4. **Privacy-policy URL.** All four forms require a public privacy-policy URL — blocked on the
   `terms.futurechain.eu` DNS + page deploy (your existing operator item).
5. **Don't claim forward secrecy** for Comm (static-DH crypto).
6. **Account deletion wording.** There is no server-side account to delete (self-custody); the deletion
   answer is "local wipe + uninstall," with the on-chain-immutability caveat. Use Play's
   "data isn't collected" / local-deletion phrasing accordingly.

*Generated from a code audit (workflow `wqk9bwypu`); evidence file:line refs are in the run output.*
