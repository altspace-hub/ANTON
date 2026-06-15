/**
 * business-export.e2e.cjs — "Export all transactions" (CSV) for Business.
 *
 * Drives Business: Home → Receipts (Kvitton) → asserts the Export button in
 * the Receipts header renders + is enabled, taps it, then reads back the CSV
 * the export wrote into the app Cache dir over `adb run-as` and asserts the
 * receipts+refunds ledger header. Read-only; spends/signs nothing.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const PKG = 'com.futurechain.anton.business';
function adb(serial, args) {
  return execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 30_000 }).trim();
}

module.exports = {
  name: 'business-export',
  apps: ['business'],
  async run({ log }) {
    const b = await forwardApp('business');
    const serial = b.serial;
    const s = new CdpSession(b.wsUrl);
    await install(s);
    try {
      const r = await s.eval(`(async () => {
        for (let i = 0; i < 5; i++) { await __td.clickText(/Tillbaka|Avbryt|Back|Cancel|Stäng|Klar/i, 250); }
        // Home tile: "Receipts / Kvitton" (has a subtitle, so match loosely)
        await __td.clickText(/Receipts|Kvitton/i, 1100);
        const body = __td.bodyText(500);
        // confirm we left Home: the Home sale tiles are gone, the filter chips are present
        const onReceipts = !/Extended sale|Open tabs|Cash drawer/i.test(body)
                        && /Receipts|Kvitton|kvitto|All|Confirmed|Bekräftad/i.test(body);
        const exportBtn = [...document.querySelectorAll('button')].find((b2) => {
          const a = (b2.getAttribute('aria-label') || ''); const t = (b2.innerText || '');
          return /Export all transactions|Exportera alla/i.test(a) || /^(Export|Exportera)$/i.test(t.trim());
        });
        const found = !!exportBtn;
        const enabled = found && !exportBtn.disabled;
        if (found && enabled) { exportBtn.click(); }
        await __td.sleep(1600);
        return { onReceipts, found, enabled, body: body.slice(0, 220) };
      })()`);

      assert.ok(r.onReceipts, 'reached the Receipts screen — got: ' + r.body);
      assert.ok(r.found, 'Export button present on the Receipts header');
      assert.ok(r.enabled, 'Export button enabled (merchant has receipts)');
      log('receipts reached; Export button present + enabled');

      const listing = adb(serial, ['shell', 'run-as', PKG, 'ls', '-1', 'cache']);
      const csvName = listing.split('\n').map((x) => x.trim())
        .filter((x) => /^anton-business-transactions-.*\.csv$/.test(x)).sort().pop();
      assert.ok(csvName, 'export wrote anton-business-transactions-*.csv; saw: ' + listing.replace(/\n/g, ', '));
      log(`export file written: ${csvName}`);

      const csv = adb(serial, ['shell', 'run-as', PKG, 'cat', `cache/${csvName}`]);
      const lines = csv.replace(/\r/g, '').split('\n').filter(Boolean);
      assert.ok(lines[0].startsWith('Date (UTC),Document,Kind'),
        'CSV header matches Business export schema — got: ' + lines[0]);
      assert.ok(lines.length >= 2, 'CSV has at least one data row');
      log(`CSV verified: header OK + ${lines.length - 1} data row(s)`);

      adb(serial, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
      await s.eval('(async () => { for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Back/i, 250); } return 1; })()');
    } finally {
      s.close();
    }
  },
};
