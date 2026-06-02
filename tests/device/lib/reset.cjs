/**
 * reset.cjs — put an app into a known clean state before a scenario so runs are
 * idempotent (without it, prior `payments`/`received`/`messages` rows pollute
 * assertions — the live .live-walk scripts needed ad-hoc cleanup for this).
 *
 *   SOFT (default): wipe the app's IndexedDB + localStorage, but KEEP the OS
 *     keystore (anton-*-secure) so the wallet address/keys are stable and need
 *     no re-funding. The app re-creates its IDB on next launch.
 *   HARD: SOFT + the caller is expected to also re-run wallet/identity creation
 *     (we cannot wipe the native keystore from JS; HARD just signals intent +
 *     clears any JS-reachable secure mirror).
 *
 * Assertion oracle = IndexedDB rows, never live-chain balances.
 */
const { install } = require('./dom-driver.cjs');

// What each app persists (db name + localStorage keys). Keystore stores
// (anton-*-secure) are deliberately NOT listed — SOFT keeps them.
const APP_STATE = {
  pay: { db: 'anton-pay', localStorageKeys: [] },
  business: { db: 'anton-business', localStorageKeys: [] },
  comm: { db: 'anton-comm', localStorageKeys: ['anton-comm-identity'] },
};

/**
 * Reset `app` on an open CdpSession. `mode` is 'soft' | 'hard'.
 * Returns a small report. The app should be RELAUNCHED by the caller afterwards
 * (forwardApp re-launches a stopped app) so it rebuilds its IDB cleanly.
 */
async function resetApp(session, app, mode = 'soft') {
  const st = APP_STATE[app];
  if (!st) throw new Error('reset: unknown app ' + app);
  await install(session);
  const expr = `(async () => {
    const out = { db: ${JSON.stringify(st.db)}, deletedDb: false, clearedKeys: [] };
    try { await __td.deleteDb(${JSON.stringify(st.db)}); out.deletedDb = true; } catch (e) { out.dbErr = String(e && e.message || e); }
    for (const k of ${JSON.stringify(st.localStorageKeys)}) { try { localStorage.removeItem(k); out.clearedKeys.push(k); } catch (e) {} }
    ${mode === 'hard' ? "try { localStorage.clear(); out.clearedAll = true; } catch (e) {}" : ''}
    return out;
  })()`;
  return session.eval(expr);
}

module.exports = { resetApp, APP_STATE };
