/**
 * devices.cjs — deterministic adb discovery for the on-device E2E harness.
 *
 * Replaces the stale, hand-pasted *-ws.txt files in .live-walk/ (the page GUID
 * changes on every app restart). Given a device serial + an app package, this
 * launches/locates the app, maps package -> PID -> webview_devtools_remote_<PID>
 * abstract socket, `adb forward`s a fixed local port, and queries /json for the
 * live webSocketDebuggerUrl.
 *
 * Role pinning: pass serials via env so the SAME phone always plays the SAME
 * role across runs — ANTON_PAY_SERIAL / ANTON_BIZ_SERIAL / ANTON_COMM_SERIAL
 * (+ _B for the second Comm phone). Falls back to the first/second adb device.
 */
const { execFileSync } = require('node:child_process');
const http = require('node:http');

const PKG = {
  pay: 'com.futurechain.anton.pay',
  business: 'com.futurechain.anton.business',
  comm: 'com.futurechain.anton.communication',
  companion: 'com.futurechain.anton.companion',
};

// One fixed local port per (app, deviceIndex) so forwards are stable + collision-free.
const BASE_PORT = { pay: 9400, business: 9600, comm: 9500, companion: 9700 };

function adb(args, serial) {
  const full = serial ? ['-s', serial, ...args] : args;
  return execFileSync('adb', full, { encoding: 'utf8', timeout: 30_000 }).trim();
}

/** All connected device serials (state == device). */
function listDevices() {
  const out = execFileSync('adb', ['devices'], { encoding: 'utf8' }).trim();
  return out.split('\n').slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p[1] === 'device')
    .map((p) => p[0]);
}

/** Resolve the serial for a role from env, else the Nth connected device. */
function resolveSerial(role, deviceIndex = 0) {
  const envKey = 'ANTON_' + role.toUpperCase() + '_SERIAL' + (deviceIndex > 0 ? '_B' : '');
  if (process.env[envKey]) return process.env[envKey];
  const devs = listDevices();
  if (!devs.length) throw new Error('no adb devices connected');
  return devs[Math.min(deviceIndex, devs.length - 1)];
}

function pidOf(serial, pkg) {
  try { return adb(['shell', 'pidof', pkg], serial).split(/\s+/)[0] || ''; }
  catch { return ''; }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Launch the app (or, if already running, resume it to the FOREGROUND) and
 *  return its PID. Always sending the LAUNCHER intent matters for the suite:
 *  a backgrounded WebView (left behind when the previous scenario foregrounded
 *  a different app) has its JS timers Android-throttled, which makes the next
 *  scenario's sleeps crawl. Foregrounding un-throttles it. The launcher intent
 *  resumes an existing task without restarting it (PID unchanged). */
async function ensureRunning(serial, pkg) {
  let pid = pidOf(serial, pkg);
  adb(['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'], serial);
  if (pid) { await sleep(500); return pid; }
  for (let i = 0; i < 12 && !pid; i++) { await sleep(800); pid = pidOf(serial, pkg); }
  if (!pid) throw new Error(`could not start ${pkg} on ${serial}`);
  return pid;
}

function getJson(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json' }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(5_000, () => req.destroy(new Error('/json timeout')));
  });
}

/**
 * Make `app` on `device[deviceIndex]` driveable. Launches if needed, forwards a
 * fixed port to its webview devtools socket, and returns:
 *   { serial, pkg, port, wsUrl, pid }
 */
async function forwardApp(app, deviceIndex = 0) {
  const pkg = PKG[app];
  if (!pkg) throw new Error('unknown app: ' + app);
  const serial = resolveSerial(app, deviceIndex);
  const pid = await ensureRunning(serial, pkg);
  const port = BASE_PORT[app] + deviceIndex;
  try { adb(['forward', '--remove', `tcp:${port}`], serial); } catch { /* none yet */ }
  adb(['forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`], serial);
  // small settle so the devtools endpoint is up
  let pages = [];
  for (let i = 0; i < 6; i++) {
    try { pages = await getJson(port); if (pages.length) break; } catch { /* retry */ }
    await sleep(700);
  }
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) || pages[0];
  if (!page || !page.webSocketDebuggerUrl) throw new Error(`no devtools page for ${pkg} on ${serial}:${port}`);
  return { serial, pkg, port, pid, wsUrl: page.webSocketDebuggerUrl };
}

/** Drop a forwarded port (cleanup). */
function unforward(serial, port) {
  try { adb(['forward', '--remove', `tcp:${port}`], serial); } catch { /* noop */ }
}

/** Capture a PNG screenshot of a device to `outPath` (for failure diagnostics). */
function screenshot(serial, outPath) {
  const fs = require('node:fs');
  // MSYS_NO_PATHCONV avoids Git-bash mangling the on-device path; exec-out streams the PNG.
  const png = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(outPath, png);
  return outPath;
}

module.exports = { PKG, BASE_PORT, listDevices, resolveSerial, forwardApp, unforward, screenshot, ensureRunning, pidOf };
