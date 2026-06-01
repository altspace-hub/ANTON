/**
 * dom-driver.cjs — in-page driving + assertion helpers for the E2E harness.
 *
 * PRELUDE installs `window.__td` (typed driver) into the page. Eval it once per
 * CdpSession via install(session), then every later eval can use `__td.*`. This
 * centralizes the fiddly bits every .live-walk script re-implemented inline:
 *   - React-aware value setter (a plain el.value = … is ignored by React's
 *     controlled inputs; you must call the native setter + dispatch 'input')
 *   - text / aria matching, click-and-wait
 *   - long-press (synthetic touchstart -> hold -> touchend) for reactions/actions
 *   - IndexedDB store reads (BigInt-safe) — the deterministic oracle we assert
 *     against instead of live-chain balances or screen text.
 *
 * PRELUDE is a SINGLE comma-expression so it survives cdp.eval's `return (…)`
 * wrapper and returns a small string marker (not the function-bearing object,
 * which isn't structured-cloneable).
 */

const PRELUDE = `(window.__td = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const setVal = (el, v) => {
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  const allClickable = () => [...document.querySelectorAll('button,a,[role=button],input,textarea')];
  const txt = (el) => ((el.innerText || el.getAttribute('aria-label') || '').trim());
  const byText = (re) => allClickable().find((el) => re.test(txt(el)));
  const byExactText = (s) => allClickable().find((el) => txt(el).split('\\n')[0].trim() === s);
  const clickText = async (re, waitMs = 1200) => { const el = byText(re); if (el) { el.click(); await sleep(waitMs); return true; } return false; };
  const setText = async (selOrEl, v, waitMs = 400) => {
    const el = typeof selOrEl === 'string' ? document.querySelector(selOrEl) : selOrEl;
    const ok = setVal(el, v); await sleep(waitMs); return ok;
  };
  const longPress = async (el, ms = 600) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const fire = (type) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
      touches: [], changedTouches: [new Touch({ identifier: 1, target: el, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })] }));
    try { fire('touchstart'); await sleep(ms); fire('touchend'); return true; } catch { return false; }
  };
  const bodyText = (n = 400) => (document.body ? document.body.innerText.replace(/\\n+/g, ' | ').slice(0, n) : '');
  const ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const bigSafe = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  const readStore = (dbName, store) => new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(store)) { db.close(); return resolve([]); }
      const tx = db.transaction(store, 'readonly');
      const rq = tx.objectStore(store).getAll();
      rq.onsuccess = () => { const rows = rq.result || []; db.close(); resolve(bigSafe(rows)); };
      rq.onerror = () => { db.close(); reject(rq.error); };
    };
    req.onerror = () => reject(req.error);
  });
  const clearStore = (dbName, store) => new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => { const db = req.result; if (!db.objectStoreNames.contains(store)) { db.close(); return resolve(0); }
      const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).clear();
      tx.oncomplete = () => { db.close(); resolve(1); }; tx.onerror = () => { db.close(); reject(tx.error); }; };
    req.onerror = () => reject(req.error);
  });
  const deleteDb = (dbName) => new Promise((resolve) => { const r = indexedDB.deleteDatabase(dbName); r.onsuccess = r.onerror = r.onblocked = () => resolve(true); });
  return { sleep, setVal, setText, byText, byExactText, clickText, longPress, bodyText, ls, readStore, clearStore, deleteDb };
})(), '__td_installed')`;

/** Install the driver on a CdpSession (idempotent). */
async function install(session) {
  return session.eval('window.__td ? "__td_present" : ' + PRELUDE);
}

module.exports = { PRELUDE, install };
