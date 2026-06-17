/**
 * game-promo-smoke.cjs — single-phone (A = QV7202N48K) smoke of the chess
 * under-promotion picker AND the "your move" games tray (G4).
 *
 * Injects an active chess game whose move log leaves a white pawn on b7 (white to
 * move). Navigates via the ChatList "your move" banner → Games tray → board,
 * then plays b7xa8, picks a KNIGHT in the promotion picker, and verifies the
 * recorded move carries promo:'n'. The game has a bogus opponent, so the move is
 * not actually sent (sendInlineWire soft-fails on a non-contact). Leaves clean.
 *
 * Run: ANTON_DEVICE_E2E=1 node tests/device/game-promo-smoke.cjs
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('./lib/devices.cjs');
const { CdpSession } = require('./lib/cdp.cjs');
const { install } = require('./lib/dom-driver.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  process.env.ANTON_COMM_SERIAL = 'QV7202N48K';
  const comm = await forwardApp('comm', 0);
  const s = new CdpSession(comm.wsUrl); await install(s);
  let failed = false;
  try {
    // A reachable contact to play against (det-03 requires the peer be reachable).
    const opp = await s.eval(`(async()=>{ const cs=await __td.readStore('anton-comm','contacts'); const c=(cs||[]).find(x=>x&&x.publicKeyHex&&!x.blocked); return c?c.contactHash:null; })()`);
    if (!opp) throw new Error('no reachable contact to use as opponent');
    // 1. Inject the active near-promotion game (white pawn on b7, white to move).
    const game = { id: 'promo_test', gameId: 'chess', role: 'initiator', myColor: 0, opponentHash: opp, opponentName: 'Test', status: 'active',
      moves: [ {seq:0,player:0,move:{from:12,to:28}},{seq:1,player:1,move:{from:51,to:35}},{seq:2,player:0,move:{from:28,to:35}},{seq:3,player:1,move:{from:50,to:42}},
              {seq:4,player:0,move:{from:35,to:42}},{seq:5,player:1,move:{from:62,to:45}},{seq:6,player:0,move:{from:42,to:49}},{seq:7,player:1,move:{from:52,to:44}} ],
      createdAt: 1, updatedAt: 1 };
    await s.eval(`(async()=>{await new Promise((res,rej)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').put(${JSON.stringify(game)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();rej(tx.error);};};req.onerror=()=>rej(req.error);});return 1;})()`);
    console.log('1. injected an active near-promotion chess game vs a reachable contact');

    // Reload so the ChatList re-reads + shows the "your move" banner.
    await s.eval(`(()=>{setTimeout(()=>location.reload(),100);return 1;})()`); s.close();
    await sleep(5000);
    const c2 = await forwardApp('comm', 0); const s2 = new CdpSession(c2.wsUrl); await install(s2);
    await s2.eval(`(async()=>{for(let i=0;i<5;i++){await __td.clickText(/Tillbaka|Back|Avbryt|Cancel/i,140);}const t=document.querySelector('[aria-controls="tabpanel-chat"]');if(t)t.click();await __td.sleep(900);})()`);

    // 2. Tap the "🎮 … your move" banner → Games tray → the game row.
    const nav = await s2.eval(`(async()=>{
      const ban=[...document.querySelectorAll('button')].find(b=>/your move|din tur/i.test(((b.innerText||b.textContent)||''))); if(!ban) return {err:'no your-move banner'};
      ban.click(); await __td.sleep(1000);
      const row=[...document.querySelectorAll('button')].find(b=>/Chess|Schack/i.test(((b.innerText||b.textContent)||''))); if(!row) return {err:'no game row in tray'};
      row.click(); await __td.sleep(1300);
      const glyphs=(document.body.textContent||'').match(/[\\u2654-\\u265F]/g)||[]; return {ok:true, glyphs:glyphs.length};
    })()`);
    if (nav.err) throw new Error('nav: ' + nav.err);
    assert.ok(nav.glyphs >= 8, 'board rendered (' + nav.glyphs + ' glyphs)');
    console.log('2. reached the board via the your-move tray (' + nav.glyphs + ' glyphs)');

    // 3. Play b7xa8 → the picker must appear.
    const step = await s2.eval(`(async()=>{
      const b7=document.querySelector('[data-cell="b7"]'); if(!b7) return {err:'no b7'}; b7.click(); await __td.sleep(500);
      const a8=document.querySelector('[data-cell="a8"]'); if(!a8) return {err:'no a8'};
      if(a8.disabled) return {err:'a8 not a legal target'};
      a8.click(); await __td.sleep(600);
      const pick=document.querySelector('[data-promo="n"]'); if(!pick) return {err:'no promotion picker'};
      pick.click(); await __td.sleep(1000);
      const rows=await __td.readStore('anton-comm','games'); const g=rows.find(r=>r&&r.id==='promo_test');
      const last=g&&g.moves[g.moves.length-1];
      return {ok:true, moves:g&&g.moves.length, promo:last&&last.move&&last.move.promo};
    })()`);
    if (step.err) throw new Error('promote: ' + step.err);
    assert.equal(step.moves, 9, 'the promotion move was recorded');
    assert.equal(step.promo, 'n', 'under-promotion to KNIGHT recorded (not auto-queen)');
    console.log('3. b7xa8: picker shown → chose KNIGHT → move recorded with promo=n');
    console.log('✅ under-promotion picker + your-move tray verified on-device');
    s2.close();
    var sFinal = await forwardApp('comm', 0).then(c => { const x = new CdpSession(c.wsUrl); return install(x).then(() => x); });
    await sFinal.eval(`(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').delete('promo_test');tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`);
    console.log('cleanup: test game removed');
    sFinal.close();
  } catch (e) { failed = true; console.log('❌ ' + e.message); }
  process.exit(failed ? 1 : 0);
})();
