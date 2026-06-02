#!/usr/bin/env node
/**
 * run-e2e.cjs — orchestrator for the on-device E2E regression suite.
 *
 * Discovers connected phones, runs every scenarios/*.e2e.cjs in order, prints a
 * pass/fail summary, screenshots the phones on a failure, and exits non-zero if
 * anything failed. Two physical phones are required, so this is operator-run
 * only — it is NOT wired into the GitHub `test` job. Gate: set ANTON_DEVICE_E2E=1.
 *
 *   ANTON_DEVICE_E2E=1 node tests/device/run-e2e.cjs            # all scenarios
 *   ANTON_DEVICE_E2E=1 node tests/device/run-e2e.cjs pay        # only names matching "pay"
 *
 * A scenario module exports: { name, apps: ['pay'|'business'|'comm'...], run(t) }
 * where t = { log(msg) }. `run` throws (e.g. via node:assert) on failure.
 */
const fs = require('node:fs');
const path = require('node:path');
const { listDevices, resolveSerial, screenshot } = require('./lib/devices.cjs');

const SCENARIOS_DIR = path.join(__dirname, 'scenarios');
const ARTIFACTS_DIR = path.join(__dirname, '.artifacts');

function ts() { return new Date().toISOString().replace(/[:.]/g, '-'); }

async function main() {
  if (process.env.ANTON_DEVICE_E2E !== '1') {
    console.log('ANTON_DEVICE_E2E is not set to 1 — this two-phone suite is operator-run only.');
    console.log('Re-run with:  ANTON_DEVICE_E2E=1 node tests/device/run-e2e.cjs');
    process.exit(0);
  }
  const devices = listDevices();
  if (devices.length < 1) { console.error('No adb devices connected.'); process.exit(2); }
  console.log('Devices:', devices.join(', '));

  const only = process.argv[2];
  const files = fs.readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.e2e.cjs') && !f.startsWith('_'))
    .filter((f) => !only || f.includes(only))
    .sort();
  if (!files.length) { console.error('No scenarios found' + (only ? ` matching "${only}"` : '')); process.exit(2); }

  let pass = 0; let fail = 0; const failures = [];
  for (const file of files) {
    const mod = require(path.join(SCENARIOS_DIR, file));
    const name = mod.name || file;
    process.stdout.write(`\n▶ ${name}`);
    const t0 = Date.now();
    try {
      await mod.run({ log: (m) => process.stdout.write(`\n   · ${m}`) });
      process.stdout.write(`\n✅ ${name} (${Date.now() - t0}ms)\n`);
      pass++;
    } catch (e) {
      process.stdout.write(`\n❌ ${name}: ${e && e.message}\n`);
      fail++; failures.push(name);
      // best-effort screenshot of every app this scenario uses
      try {
        if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
        const seen = new Set();
        for (const app of (mod.apps || [])) {
          let serial; try { serial = resolveSerial(app); } catch { continue; }
          if (seen.has(serial)) continue; seen.add(serial);
          const out = path.join(ARTIFACTS_DIR, `${name}_${serial}_${ts()}.png`);
          try { screenshot(serial, out); console.log(`   📸 ${out}`); } catch { /* noop */ }
        }
      } catch { /* noop */ }
    }
  }
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if (fail) console.log('failed:', failures.join(', '));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('runner error:', e); process.exit(1); });
