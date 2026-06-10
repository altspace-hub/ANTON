# ANTON on-device E2E harness (`tests/device/`)

Rerunnable, committed two-phone end-to-end tests for the ANTON phone apps
(Pay / Business / Comm), driven over the Chrome DevTools Protocol against real
Android WebViews. Supersedes the untracked scratch scripts in `.live-walk/`.

**Guiding rule:** assert against persisted **IndexedDB rows** (deterministic),
never live-chain balances (which read `— FTC` on a WebView origin — see
`docs`/memory `project_fc_wallet_read_path`).

## Layout

```
tests/device/
├── lib/
│   ├── cdp.cjs         # evalInPage(wsUrl, expr) + CdpSession (pooled socket)
│   ├── devices.cjs     # adb discovery: app -> PID -> webview socket -> forward -> wsUrl
│   └── dom-driver.cjs  # window.__td: React-aware setVal, byText, longPress, readStore(IDB)
├── fixtures/           # canonical addresses, fixed amounts/PIN/exp (deterministic)
├── scenarios/          # *.e2e.cjs — one flow each (pay-to-business, terminal, comm)
└── run-e2e.cjs         # orchestrator: forward -> reset -> run scenarios -> screenshot-on-fail
```

## Prerequisites

- Two Android phones with the debug APKs installed, USB-debugging on, authorized.
- The apps must have **WebView content debugging** enabled (debug builds do).
- `adb` on PATH; Node with the repo's deps (`ws` is already a dependency).

## Role pinning (deterministic)

Set serials so the SAME phone always plays the SAME role:

```bash
export ANTON_PAY_SERIAL=QV7202N48K      # the funded/customer phone
export ANTON_BIZ_SERIAL=QV7101L31T      # the merchant phone
export ANTON_COMM_SERIAL=QV7202N48K     # Comm phone A (Alice)
export ANTON_COMM_SERIAL_B=QV7101L31T   # Comm phone B (Bob)
```

Without them, `devices.cjs` falls back to the 1st/2nd connected device.

Fixed local forward ports per app: Pay 9400, Comm 9500, Business 9600
(`+deviceIndex` for the second phone).

## Run

```bash
# all scenarios (operator machine, two phones attached, serials pinned):
ANTON_DEVICE_E2E=1 ANTON_PAY_SERIAL=… ANTON_BIZ_SERIAL=… \
  ANTON_COMM_SERIAL=… ANTON_COMM_SERIAL_B=… pnpm test:e2e:device

# only scenarios whose filename matches a substring:
ANTON_DEVICE_E2E=1 ANTON_PAY_SERIAL=… node tests/device/run-e2e.cjs pay
```

The orchestrator (`run-e2e.cjs`) discovers the phones, runs every
`scenarios/*.e2e.cjs` (underscore-prefixed files are scratch and skipped),
prints a pass/fail summary, screenshots the involved phones into `.artifacts/`
on a failure, and exits non-zero if anything failed.

### Current scenarios

| file | phones | asserts |
|---|---|---|
| `pay-review.e2e.cjs` | Pay ×1 | a ref-less pay URI decodes → Review shows amount + **0.1% network fee** + total (no spend) |
| `pay-friends.e2e.cjs` | Pay ×1 | Settings → Friends → add a fixture friend → persisted `fc_contacts` row (idempotent) |
| `comm-events.e2e.cjs` | Comm ×1 | Events tab → create a fixture event (only the title; type+date default) → persisted `events` row (idempotent) |
| `comm-message.e2e.cjs` | Comm ×2 | Alice sends a unique-marker E2E message → polls Bob's `messages` store until the inbound row arrives |
| `remittance-template.e2e.cjs` | Pay + Comm ×1 | **Spends 0.01 FTC on-chain** — extra gate `ANTON_DEVICE_E2E_SPEND=1`, else it self-skips. Pay sends with the Faktura template (unique ref + line items) → Comm syncs → asserts the full structured remittance on the received `wallet_txs` row (meta.tpl/tplv, ref, items, amountSek/vatSek) + the FAKTURA RemittanceView render |
| `remittance-template-two-phone.e2e.cjs` | Pay (phone A) → Comm (phone B) | **Spends 0.01 FTC** (`ANTON_DEVICE_E2E_SPEND=1` gate). Same shape as the single-phone scenario but cross-phone + the **Offert (quote)** template: validUntil meta, two line items, `paymentType: information`. Asserts the structured remittance round-trips chain-side onto B's `wallet_txs` + the OFFERT RemittanceView render. Pin `ANTON_PAY_SERIAL` / `ANTON_COMM_SERIAL` to different phones |
| `agreement-settlement-two-phone.e2e.cjs` | Pay ×2 + Business | **Spends 0.02 FTC** (`ANTON_DEVICE_E2E_SPEND=1` gate; `ANTON_AGRSETTLE_SKIP_LEG1=1` resumes leg 2 without re-paying leg 1). Agreement v1 settlement tier: leg 1 A-Pay → B-Pay with the Avtal template (proposer row 'settled' at submit; B reconciles an acceptor row bound by the on-chain-echoed agreementId + renders 'Settled · public, unsigned'); leg 2 Business Simple-sale QR auto-armed active-sync (credentialed `/iso_received`) + customer pays with Avtal carrying the kvitto ref → kvitto flips confirmed WITH the customer agreement attached + KvittoView badge |

Each scenario is idempotent (no real on-chain spend unless you opt in to the
`SPEND` gate above; re-runs are no-ops or use a fresh marker), so the default
suite is safe to re-run. **Roadmap (#73):** Comm wallet
(read balance/address/history), portals browse, Pulse feed; Pay→Business full
receipt-match; photo-viewer tap; events RSVP + each type.

This suite needs two physical phones, so it is **operator-run only** — it must
not run in GitHub-hosted CI (gate it behind `ANTON_DEVICE_E2E=1`). The fast,
device-independent contracts live in the per-app vitest suites
(`pnpm test:pay` / `test:comm` / `test:business`).

## Writing a scenario

```js
const { forwardApp, unforward } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const { wsUrl, serial, port } = await forwardApp('pay');     // launch + forward
const s = new CdpSession(wsUrl); await install(s);            // inject __td
await s.eval('__td.clickText(/Skanna/i)');                   // drive
const rows = await s.eval("__td.readStore('anton-pay','payments')"); // assert oracle
// assert.equal(rows.length, 1) ...
s.close(); unforward(serial, port);
```
