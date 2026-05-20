# Pay app — phone test plan (post Phase-3 slice)

Last updated **2026-05-20** after `f1e0ecfb` landed on ANTON `main`.

This is the hand-off card for verifying the pay-app vertical slice on
a real Android/iOS device. Everything tested here is the native-mobile
half of [[project_pay_slice_complete_may20_2026]] — the parts the
Linux-side end-to-end smoke (which already passed live) cannot
cover: Capacitor SecureStorage on the OS keychain, native camera QR
scanning, touch ergonomics on the new backup-verify + restore screens.

## Pre-flight on the dev machine

Verify the network the phone will hit is actually up before plugging
in a phone:

```bash
# Three nodes should all return the same chain_height + same
# latest_block_hash. Bahnhof is the entry point the app talks to.
for ep in \
    "http://127.0.0.1:8545|Node1(Heimdall)" \
    "http://127.0.0.1:8546|Node2(miner)"   \
    "https://rpc.futurechain.eu|Bahnhof"   ; do
  url="${ep%|*}"; name="${ep#*|}"
  h=$(curl -s "$url/info" | python3 -c "import sys,json; print(json.load(sys.stdin)['chain_height'])")
  printf "  %-22s %s\n" "$name" "$h"
done
```

If Node 1 (Heimdall side) is down, screened compliance gossip won't
fire and payments will hang in `queued` forever. Restart it with the
full env from [[project_pay_slice_complete_may20_2026]] op-notes
(needs `COMPLIANCE_SIGNING_SALT`, `COMPLIANCE_WALLET`,
`COMPLIANCE_WALLET_PASSWORD`, `COMPLIANCE_ANNOUNCE_ADDR`,
`HEIMDALL_API_KEY`).

If Node 2 (miner) is down, txs land in mempool but never confirm.
Restart it with at minimum `COMPLIANCE_SIGNING_SALT=COMPLIANCE_SIGNING_KEY`
in the env — without that env var Node 2 hard-rejects screened gossip
per the NF-5 audit fix.

## Building the phone app

```bash
cd /home/daniel/openexpert/ANTON
pnpm install              # if dependencies have drifted
pnpm test:pay             # 61 tests — should be all green
pnpm typecheck            # src/pay/ should be clean
pnpm run build:pay        # vite build for pay
npx cap sync android-pay  # propagate the build into the Android shell
# then in Android Studio: open ./android-pay, build + deploy to device
```

The pay app's app id is `com.futurechain.anton.pay` (see
`capacitor.config.pay.ts`).

## The script — what to verify in order

For each step, what you should see + what to do if not.

### 1. Cold-launch onboarding

- Tap **Create my wallet** on WelcomeScreen.
- Expected: brief spinner, then **BackupShowScreen** appears with a
  blurred 24-word grid + a "Tap to reveal" overlay.
- Failing here means the wallet creation crashed — most likely
  Capacitor SecureStorage. Open Logcat and look for stack traces in
  the `Capacitor` or `pay` tags. Falling back to web tier (IndexedDB)
  is wrong on a real device — the secure-store ladder should pick
  `native` first; if it lands on `web` the OS keystore plugin probably
  isn't installed for the pay flavour. Check
  `android-pay/app/src/main/AndroidManifest.xml` for the
  SecureStorage permissions.

### 2. Tap-to-reveal + write down the mnemonic

- Tap the overlay; 24 words appear in a numbered grid.
- The continue button should be enabled only after the reveal.
- Write the words down on paper — you'll need three of them in step 3.
- The continue copy is **"I have written it down — continue"**.

### 3. Backup verify

- Three randomly-chosen positions appear (one per third of the
  phrase: 1–8, 9–16, 17–24).
- Type the three words. They are case-insensitive and trimmed.
- A wrong word → inline error "One or more words don't match." Back
  button returns to BackupShowScreen so you can re-read the phrase.
- Correct triple → DoneScreen.

### 4. DoneScreen → Home

- DoneScreen shows your fresh `fc_…` address.
- Continue → HomeScreen with the wallet chip showing the abbreviated
  address. **Balance should read `—`** (no UTXOs yet) then auto-
  refresh on a 30 s tick.

### 5. Fund the wallet (do this from the dev machine, not the phone)

Open a Linux terminal on the dev machine and use the existing E2E
smoke to fund the phone's wallet. Get the phone's `fc_` address from
Settings → Wallet (long-press to copy). Then on the dev machine:

```bash
cd /home/daniel/openexpert/ANTON
PHONE_ADDR="fc_…paste here…"

# Fund from DB003 (Node 1 mining wallet, ~30M FTC available) via
# Node 1's submit_pacs008_batch — same call the smoke makes:
python3 -c "
import json, requests, uuid, secrets
from datetime import datetime, timezone
ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
m = {
  'document': {'FIToFICstmrCdtTrf': {
    'GrpHdr': {'MsgId': f'PHONE-FUND-{secrets.token_hex(4).upper()}', 'CreDtTm': ts, 'NbOfTxs': '1', 'SttlmInf': {'SttlmMtd': 'CLRG'}},
    'CdtTrfTxInf': [{'PmtId': {'InstrId': f'I-{secrets.token_hex(4)}', 'EndToEndId': f'E-{secrets.token_hex(4)}', 'TxId': f'T-{secrets.token_hex(4)}', 'UETR': str(uuid.uuid4())},
      'IntrBkSttlmAmt': {'@Ccy': 'FTC', '\$value': 1.0},
      'ChrgBr': 'SLEV',
      'Dbtr': {'Nm': 'Phone-test funding', 'CtryOfRes': 'SE'},
      'DbtrAcct': {'Id': {'Othr': {'Id': 'fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs'}}},
      'DbtrAgt': {'FinInstnId': {'BICFI': 'TESTSE33XXX', 'Nm': 'Test Bank SE'}},
      'CdtrAgt': {'FinInstnId': {'BICFI': 'TESTSE33XXX', 'Nm': 'Test Bank SE'}},
      'Cdtr': {'Nm': 'Phone test wallet', 'CtryOfRes': 'SE'},
      'CdtrAcct': {'Id': {'Othr': {'Id': '$PHONE_ADDR'}}},
      'Purp': {'Cd': 'OTHR'},
      'RmtInf': {'Ustrd': ['phone-test funding']},
    }],
  }},
  'futurechain_metadata': {'compliance_checked': False, 'kyc_verified': False, 'aml_checked': False, 'sanctions_checked': False, 'risk_score': 0.1, 'processing_timestamp': ts, 'blockchain_tx_id': None, 'node_type': 'archive', 'network_id': 'mainnet'},
}
r = requests.post('http://127.0.0.1:8545/submit_pacs008_batch',
  json={'messages':[m], 'signing_address': 'fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs', 'password': 'Jam3sochdaltonhundcrypto'})
print(r.status_code, r.text)
"
```

Wait ~30 s. The phone's HomeScreen wallet chip should auto-refresh
and show `1 FTC`. (The balance card on Settings → Wallet has a manual
refresh button if you don't want to wait for the 30 s tick.)

### 6. Make a payment

You need a payable QR. The Business app generates these natively (and
that's the production flow), but for this test you can:

- **Quick path**: Generate a `futurechain:pay` URI with curl on the
  dev machine + show it as a QR on the dev machine's screen, then
  scan it with the phone. URI shape (ADR-004 v1):
  ```
  futurechain:pay?to=<dest_fc>&amount=<micro_ftc>&ref=<v1_ref>&currency=FTC&v=1
  ```
  Easiest reference: the SDK's `reference.encodeV1` function — see
  `anton-business/packages/futurechain-sdk/src/reference/index.ts`.
- **Production path**: Open the Business app, ring up a sale, scan
  its QR with the Pay app.

Then on the Pay phone:

- Tap **Scan to pay** on HomeScreen → camera opens → frame the QR.
- Decoded → **ReviewScreen** shows the amount + merchant + SEK
  estimate. Tap **Confirm**.
- Brief spinner → **PaymentDoneScreen** in `submitting` state, then
  `queued` (spinner + "Awaiting confirmation"), then `confirmed`
  (green check + "Mined into a block").
- The transition should happen within ~30 s assuming the miner is up.
- The `Tx id` row should show a UETR-shaped string.

### 7. The recovery flow

- Settings → **Recovery phrase** → tap "I am alone — show me the
  phrase" → all 24 words visible.
- Settings → **Restore wallet** → paste the 24 words from step 2 →
  Restore → DoneScreen → HomeScreen with the same `fc_…` address as
  before. (Because the device was restoring the SAME phrase that was
  already on it, the address is identical. To prove restoration
  actually works, restore from a DIFFERENT phrase — e.g. one
  generated on another device — and the address should change.)
- Restoring from a known phrase with funds: balance card should
  show the funds immediately on auto-refresh.

## What to capture

For each step where something goes wrong (or even just looks off):

- Logcat output filtered to `pay` or `Capacitor`
- The current state of `fc_wallets` row if it exists (only relevant
  if a backend ANTON-local is attached, which the pay app does NOT
  use — it's self-custody on-device)
- Screenshot of the screen state

## Common failure modes

- **Tx stays in `queued` for >2 min**: check the network on the dev
  machine. Node 2 (miner) probably crashed or doesn't have
  `COMPLIANCE_SIGNING_SALT` set. See pre-flight.
- **Wallet creation crashes**: probably Capacitor SecureStorage
  permissions; see step 1.
- **Camera permission denied**: nothing the pay code can do — user
  must grant in OS settings.
- **Balance never appears even after funding shows in /balance on
  the dev machine**: check the device has internet; `fetchBalanceFtc`
  swallows errors and returns null, so the UI just shows `—`.
  Tapping Refresh on Settings → Wallet should re-try; if still null,
  CORS or TLS issue between the device and `rpc.futurechain.eu`.

## Out of scope for this test pass

These are known follow-ups, not bugs to file:

- No PIN / biometric gate on signing (planned for OS-keychain
  hardening pass)
- iso_received receive history (deferred)
- Settings-driven RPC endpoint (production hub is hard-coded for
  closed-test phase)
- Business + comm apps (same slice will be ported)
