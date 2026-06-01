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
# all scenarios (operator machine with two phones attached):
ANTON_DEVICE_E2E=1 node tests/device/run-e2e.cjs

# a single scenario:
node tests/device/scenarios/pay-to-business.e2e.cjs
```

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
