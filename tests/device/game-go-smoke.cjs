/**
 * game-go-smoke.cjs — single-phone (A = QV7202N48K) smoke of the polished games
 * UX: the 9×9 Go board renders, the new GHOST-CONFIRM placement works (tap stages
 * a stone, Place commits) and captures correctly, Pass records a pass, and the
 * Resign CONFIRMATION gate prevents a one-tap forfeit. Reaches each board via the
 * ChatList "your move" tray.
 *
 * Uses a REAL reachable contact as the opponent because the wire-hardening pass
 * (det-03) now makes a move to an unreachable peer throw instead of recording.
 * The opponent receives game wires for sessions it doesn't have → harmlessly
 * rejected. Cells are targeted by stable data-cell attrs (aria-labels are now
 * human/localized). Leaves clean.
 *
 * Run: ANTON_DEVICE_E2E=1 node tests/device/game-go-smoke.cjs
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('./lib/devices.cjs');
const { CdpSession } = require('./lib/cdp.cjs');
const { install } = require('./lib/dom-driver.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const putEval = (g) => `(async()=>{await new Promise((res,rej)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').put(${JSON.stringify(g)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();rej(tx.error);};};req.onerror=()=>rej(req.error);});return 1;})()`;
const delEval = (id) => `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').delete(${JSON.stringify(id)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;
const reload = `(()=>{setTimeout(()=>location.reload(),100);return 1;})()`;

// nav: overlays → chat tab → "your move" banner → the Go row → board (returns the
// intersection count + white-stone count, both scoped by the stable data-cell).
const NAV = `(async()=>{
  for(let i=0;i<5;i++){await __td.clickText(/Tillbaka|Back|Avbryt|Cancel/i,120);}
  const tab=document.querySelector('[aria-controls="tabpanel-chat"]'); if(tab)tab.click(); await __td.sleep(700);
  const ban=[...document.querySelectorAll('button')].find(b=>/your move|din tur/i.test((b.innerText||b.textContent)||'')); if(!ban) return {err:'no your-move banner'};
  ban.click(); await __td.sleep(900);
  const row=[...document.querySelectorAll('button')].find(b=>/Go \\(9/i.test((b.innerText||b.textContent)||'')); if(!row) return {err:'no Go row in tray'};
  row.click(); await __td.sleep(1200);
  const cells=[...document.querySelectorAll('[data-cell^="go-"]')].filter(b=>b.getAttribute('data-cell')!=='go-pass'&&b.getAttribute('data-cell')!=='go-place').length;
  const white=[...document.querySelectorAll('[data-cell^="go-"] span')].filter(s=>getComputedStyle(s).backgroundColor==='rgb(244, 244, 244)').length;
  return {ok:true, cells, white};
})()`;

async function freshAfterReload() {
  await sleep(5000);
  const c = await forwardApp('comm', 0);
  const s = new CdpSession(c.wsUrl); await install(s); return s;
}
const navOrThrow = async (s, tag) => { const r = await s.eval(NAV); if (r.err) throw new Error(tag + ': ' + r.err); return r; };

(async () => {
  process.env.ANTON_COMM_SERIAL = 'QV7202N48K';
  let s = new CdpSession((await forwardApp('comm', 0)).wsUrl); await install(s);
  let failed = false;
  try {
    // A reachable contact to play against (det-03 requires the peer be reachable).
    const opp = await s.eval(`(async()=>{ const cs=await __td.readStore('anton-comm','contacts'); const c=(cs||[]).find(x=>x&&x.publicKeyHex&&!x.blocked); return c?{hash:c.contactHash,name:c.displayName||'Opp'}:null; })()`);
    if (!opp) throw new Error('no reachable contact on this phone to use as opponent');
    console.log('0. opponent = ' + (opp.name) + ' (' + opp.hash.slice(0, 10) + '…)');

    const base = { gameId: 'go', role: 'initiator', myColor: 0, opponentHash: opp.hash, status: 'active', createdAt: 1, updatedAt: 1 };
    const CAPTURE_GAME = { ...base, id: 'go_test', opponentName: 'GoTest', moves: [
      { seq: 0, player: 0, move: { pt: 39 } }, { seq: 1, player: 1, move: { pt: 0 } },
      { seq: 2, player: 0, move: { pt: 31 } }, { seq: 3, player: 1, move: { pt: 1 } },
      { seq: 4, player: 0, move: { pt: 49 } }, { seq: 5, player: 1, move: { pt: 40 } },
    ] };
    const PASS_GAME = { ...base, id: 'go_pass', opponentName: 'GoPass', moves: [] };
    const RESIGN_GAME = { ...base, id: 'go_resign', opponentName: 'GoResign', moves: [] };

    // ── Part A: ghost-confirm capture ────────────────────────────────────────
    await s.eval(delEval('go_pass')); await s.eval(delEval('go_resign')); await s.eval(putEval(CAPTURE_GAME));
    await s.eval(reload); s.close(); s = await freshAfterReload();
    const navA = await navOrThrow(s, 'navA');
    assert.equal(navA.cells, 81, '9×9 board rendered (81 intersections)');
    assert.equal(navA.white, 3, 'three white stones before the capture');
    console.log('A1. board via tray: ' + navA.cells + ' cells, ' + navA.white + ' white stones');

    const cap = await s.eval(`(async()=>{
      const c=document.querySelector('[data-cell="go-F5"]'); if(!c) return {err:'no go-F5'};
      if(c.disabled) return {err:'go-F5 not a legal point'};
      c.click(); await __td.sleep(450);                                   // first tap stages a ghost
      const place=document.querySelector('[data-cell="go-place"]'); if(!place) return {err:'no Place button after staging'};
      place.click(); await __td.sleep(1100);                             // confirm → commit + send
      const white=[...document.querySelectorAll('[data-cell^="go-"] span')].filter(x=>getComputedStyle(x).backgroundColor==='rgb(244, 244, 244)').length;
      const rows=await __td.readStore('anton-comm','games'); const g=rows.find(r=>r&&r.id==='go_test'); const last=g&&g.moves[g.moves.length-1];
      return {ok:true, white, moves:g&&g.moves.length, pt:last&&last.move&&last.move.pt};
    })()`);
    if (cap.err) throw new Error('capture: ' + cap.err);
    assert.equal(cap.pt, 41, 'F5 (pt 41) recorded after Place');
    assert.equal(cap.moves, 7, 'capturing move appended to the log');
    assert.equal(cap.white, 2, 'white@E5 captured (3 → 2 white stones)');
    console.log('A2. ghost→Place: white 3→' + cap.white + ', move pt=' + cap.pt);

    // ── Part B: pass ─────────────────────────────────────────────────────────
    await s.eval(delEval('go_test')); await s.eval(putEval(PASS_GAME));
    await s.eval(reload); s.close(); s = await freshAfterReload();
    await navOrThrow(s, 'navB');
    const pass = await s.eval(`(async()=>{
      const p=document.querySelector('[data-cell="go-pass"]'); if(!p) return {err:'no Pass button'};
      if(p.disabled) return {err:'Pass disabled on my turn'};
      p.click(); await __td.sleep(1000);
      const rows=await __td.readStore('anton-comm','games'); const g=rows.find(r=>r&&r.id==='go_pass'); const last=g&&g.moves[g.moves.length-1];
      return {ok:true, moves:g&&g.moves.length, pt:last&&last.move&&last.move.pt};
    })()`);
    if (pass.err) throw new Error('pass: ' + pass.err);
    assert.equal(pass.moves, 1, 'pass appended');
    assert.equal(pass.pt, -1, 'Pass recorded as { pt: -1 }');
    console.log('B. Pass: recorded move pt=' + pass.pt);

    // ── Part C: resign requires confirmation (no one-tap forfeit) ────────────
    await s.eval(delEval('go_pass')); await s.eval(putEval(RESIGN_GAME));
    await s.eval(reload); s.close(); s = await freshAfterReload();
    await navOrThrow(s, 'navC');
    const resign = await s.eval(`(async()=>{
      const rx=/^\\s*(Resign|Ge upp)\\s*$/;
      const arm=[...document.querySelectorAll('button')].find(b=>rx.test(((b.innerText||b.textContent)||'').trim())); if(!arm) return {err:'no Resign button'};
      arm.click(); await __td.sleep(500);
      const confirmShown=/Resign this game|Ge upp spelet/i.test(document.body.textContent||'');
      const g1=(await __td.readStore('anton-comm','games')).find(r=>r&&r.id==='go_resign');
      const stillActive=!!g1 && g1.status==='active';
      const conf=[...document.querySelectorAll('button')].find(b=>rx.test(((b.innerText||b.textContent)||'').trim())); if(!conf) return {err:'no confirm Resign'};
      conf.click(); await __td.sleep(1100);
      const g2=(await __td.readStore('anton-comm','games')).find(r=>r&&r.id==='go_resign');
      return {ok:true, confirmShown, stillActive, status:g2&&g2.status};
    })()`);
    if (resign.err) throw new Error('resign: ' + resign.err);
    assert.ok(resign.confirmShown, 'Resign shows a confirmation prompt');
    assert.ok(resign.stillActive, 'one tap does NOT forfeit (the gate holds)');
    assert.equal(resign.status, 'resigned', 'confirming actually resigns');
    console.log('C. resign gate: 1 tap kept active, confirm → ' + resign.status);

    console.log('✅ Go UX verified on-device: ghost-confirm capture, pass, resign-confirm gate');
    await s.eval(delEval('go_resign'));
    console.log('cleanup: test games removed');
  } catch (e) { failed = true; console.log('❌ ' + e.message); }
  s.close();
  process.exit(failed ? 1 : 0);
})();
