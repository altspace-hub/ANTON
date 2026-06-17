/**
 * game-go-smoke.cjs — single-phone (A = QV7202N48K) smoke of Go: the 9×9 board
 * renders, a capture tap removes the right stone, and the Pass button records a
 * pass. Reaches the board via the ChatList "your move" banner → Games tray
 * (so it also re-exercises the G4 inbox for a non-chess game).
 *
 * Part A — a near-capture position (white@40 in atari, black to move). Black
 * plays F5 (pt 41) → white@40 is captured. We assert the white-stone count drops
 * 3→2 AND the recorded move is { pt: 41 }.
 * Part B — a fresh game (black to move). Tap Pass → a { pt: -1 } move is recorded.
 *
 * Both games have a bogus opponent, so moves aren't actually sent. Leaves clean.
 * Run: ANTON_DEVICE_E2E=1 node tests/device/game-go-smoke.cjs
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('./lib/devices.cjs');
const { CdpSession } = require('./lib/cdp.cjs');
const { install } = require('./lib/dom-driver.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CAPTURE_GAME = {
  id: 'go_test', gameId: 'go', role: 'initiator', myColor: 0,
  opponentHash: 'ANTON-TEST-GO', opponentName: 'GoTest', status: 'active',
  moves: [
    { seq: 0, player: 0, move: { pt: 39 } }, { seq: 1, player: 1, move: { pt: 0 } },
    { seq: 2, player: 0, move: { pt: 31 } }, { seq: 3, player: 1, move: { pt: 1 } },
    { seq: 4, player: 0, move: { pt: 49 } }, { seq: 5, player: 1, move: { pt: 40 } },
  ],
  createdAt: 1, updatedAt: 1,
};
const PASS_GAME = {
  id: 'go_pass', gameId: 'go', role: 'initiator', myColor: 0,
  opponentHash: 'ANTON-TEST-GO', opponentName: 'GoPass', status: 'active', moves: [], createdAt: 1, updatedAt: 1,
};

const putEval = (g) => `(async()=>{await new Promise((res,rej)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').put(${JSON.stringify(g)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();rej(tx.error);};};req.onerror=()=>rej(req.error);});return 1;})()`;
const delEval = (id) => `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').delete(${JSON.stringify(id)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;
const reload = `(()=>{setTimeout(()=>location.reload(),100);return 1;})()`;

// nav: dismiss overlays → chat tab → "your move" banner → the Go row → board.
const NAV = `(async()=>{
  for(let i=0;i<5;i++){await __td.clickText(/Tillbaka|Back|Avbryt|Cancel/i,120);}
  const t=document.querySelector('[aria-controls="tabpanel-chat"]'); if(t)t.click(); await __td.sleep(700);
  const ban=[...document.querySelectorAll('button')].find(b=>/your move/i.test((b.innerText||b.textContent)||'')); if(!ban) return {err:'no your-move banner'};
  ban.click(); await __td.sleep(900);
  const row=[...document.querySelectorAll('button')].find(b=>/Go \\(9/i.test((b.innerText||b.textContent)||'')); if(!row) return {err:'no Go row in tray'};
  row.click(); await __td.sleep(1200);
  const cells=[...document.querySelectorAll('button[aria-label^="go-"]')].filter(b=>b.getAttribute('aria-label')!=='go-pass').length;
  const white=[...document.querySelectorAll('button[aria-label^="go-"] span')].filter(s=>getComputedStyle(s).backgroundColor==='rgb(244, 244, 244)').length;
  return {ok:true, cells, white};
})()`;

async function freshAfterReload() {
  await sleep(5000);
  const c = await forwardApp('comm', 0);
  const s = new CdpSession(c.wsUrl); await install(s); return s;
}

(async () => {
  process.env.ANTON_COMM_SERIAL = 'QV7202N48K';
  let s = new CdpSession((await forwardApp('comm', 0)).wsUrl); await install(s);
  let failed = false;
  try {
    // ── Part A: capture ──────────────────────────────────────────────────────
    await s.eval(delEval('go_pass')); await s.eval(putEval(CAPTURE_GAME));
    await s.eval(reload); s.close(); s = await freshAfterReload();
    const nav = await s.eval(NAV);
    if (nav.err) throw new Error('navA: ' + nav.err);
    assert.equal(nav.cells, 81, '9×9 board rendered (81 intersections)');
    assert.equal(nav.white, 3, 'three white stones before the capture');
    console.log('A1. board via tray: ' + nav.cells + ' cells, ' + nav.white + ' white stones');

    const cap = await s.eval(`(async()=>{
      const c=[...document.querySelectorAll('button[aria-label]')].find(x=>x.getAttribute('aria-label')==='go-F5'); if(!c) return {err:'no go-F5'};
      if(c.disabled) return {err:'go-F5 not a legal point'};
      c.click(); await __td.sleep(1000);
      const white=[...document.querySelectorAll('button[aria-label^="go-"] span')].filter(s=>getComputedStyle(s).backgroundColor==='rgb(244, 244, 244)').length;
      const rows=await __td.readStore('anton-comm','games'); const g=rows.find(r=>r&&r.id==='go_test'); const last=g&&g.moves[g.moves.length-1];
      return {ok:true, white, moves:g&&g.moves.length, pt:last&&last.move&&last.move.pt};
    })()`);
    if (cap.err) throw new Error('capture: ' + cap.err);
    assert.equal(cap.pt, 41, 'the F5 move (pt 41) was recorded');
    assert.equal(cap.moves, 7, 'move appended to the log');
    assert.equal(cap.white, 2, 'white@E5 was captured (3 → 2 white stones)');
    console.log('A2. F5 capture: white 3→' + cap.white + ', move pt=' + cap.pt + ' recorded');

    // ── Part B: pass ─────────────────────────────────────────────────────────
    await s.eval(delEval('go_test')); await s.eval(putEval(PASS_GAME));
    await s.eval(reload); s.close(); s = await freshAfterReload();
    const navB = await s.eval(NAV);
    if (navB.err) throw new Error('navB: ' + navB.err);
    assert.equal(navB.white, 0, 'fresh board, no stones');
    const pass = await s.eval(`(async()=>{
      const p=[...document.querySelectorAll('button[aria-label]')].find(x=>x.getAttribute('aria-label')==='go-pass'); if(!p) return {err:'no Pass button'};
      if(p.disabled) return {err:'Pass disabled on my turn'};
      p.click(); await __td.sleep(900);
      const rows=await __td.readStore('anton-comm','games'); const g=rows.find(r=>r&&r.id==='go_pass'); const last=g&&g.moves[g.moves.length-1];
      return {ok:true, moves:g&&g.moves.length, pt:last&&last.move&&last.move.pt};
    })()`);
    if (pass.err) throw new Error('pass: ' + pass.err);
    assert.equal(pass.moves, 1, 'pass appended to the log');
    assert.equal(pass.pt, -1, 'Pass recorded as { pt: -1 }');
    console.log('B. Pass button: recorded move pt=' + pass.pt);

    console.log('✅ Go verified on-device: tray nav, 9×9 render, capture, pass');
    await s.eval(delEval('go_pass'));
    console.log('cleanup: test games removed');
  } catch (e) { failed = true; console.log('❌ ' + e.message); }
  s.close();
  process.exit(failed ? 1 : 0);
})();
