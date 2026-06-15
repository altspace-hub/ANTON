/**
 * comm-export.e2e.cjs — "Export all transactions" (CSV) for Comm's wallet.
 *
 * Drives Comm: Wallet tab → History (wallet.history) → asserts the Export
 * button in the history header renders + is enabled, taps it, then reads back
 * the CSV the export wrote into the app Cache dir over `adb run-as` and
 * asserts the unified-ledger header. Read-only; spends/signs nothing.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const PKG = 'com.futurechain.anton.communication';
function adb(serial, args) {
  return execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 30_000 }).trim();
}

module.exports = {
  name: 'comm-export',
  apps: ['comm'],
  async run({ log }) {
    const c = await forwardApp('comm');
    const serial = c.serial;
    const s = new CdpSession(c.wsUrl);
    await install(s);
    try {
      const r = await s.eval(`(async () => {
        for (let i = 0; i < 5; i++) { await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 250); }
        // bottom tab: Wallet / Plånbok
        await __td.clickText(/^(Plånbok|Wallet)$/i, 1000);
        // wallet action: History / Historik
        await __td.clickText(/^(Historik|History)$/i, 1100);
        const body = __td.bodyText(500);
        const onHistory = /Historik|History|FTC|transaktion|transaction/i.test(body);
        const exportBtn = [...document.querySelectorAll('button')].find((b) => {
          const a = (b.getAttribute('aria-label') || ''); const t = (b.innerText || '');
          return /Export all transactions|Exportera alla/i.test(a) || /^(Export|Exportera)$/i.test(t.trim());
        });
        const found = !!exportBtn;
        const enabled = found && !exportBtn.disabled;
        if (found && enabled) { exportBtn.click(); }
        await __td.sleep(1600);
        return { onHistory, found, enabled, body: body.slice(0, 220) };
      })()`);

      assert.ok(r.onHistory, 'reached the wallet History screen — got: ' + r.body);
      assert.ok(r.found, 'Export button present on the wallet history header');
      assert.ok(r.enabled, 'Export button enabled (wallet has transactions)');
      log('wallet history reached; Export button present + enabled');

      const listing = adb(serial, ['shell', 'run-as', PKG, 'ls', '-1', 'cache']);
      const csvName = listing.split('\n').map((x) => x.trim())
        .filter((x) => /^anton-comm-transactions-.*\.csv$/.test(x)).sort().pop();
      assert.ok(csvName, 'export wrote anton-comm-transactions-*.csv; saw: ' + listing.replace(/\n/g, ', '));
      log(`export file written: ${csvName}`);

      const csv = adb(serial, ['shell', 'run-as', PKG, 'cat', `cache/${csvName}`]);
      const lines = csv.replace(/\r/g, '').split('\n').filter(Boolean);
      assert.ok(lines[0].startsWith('Date (UTC),Direction,Counterparty'),
        'CSV header matches Comm export schema — got: ' + lines[0]);
      assert.ok(lines.length >= 2, 'CSV has at least one data row');
      log(`CSV verified: header OK + ${lines.length - 1} data row(s)`);

      adb(serial, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
      await s.eval('(async () => { for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Back/i, 250); } return 1; })()');
    } finally {
      s.close();
    }
  },
};
