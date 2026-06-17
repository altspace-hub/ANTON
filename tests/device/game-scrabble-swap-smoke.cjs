/**
 * game-scrabble-swap-smoke.cjs — single-phone (A) smoke of Scrabble tile EXCHANGE.
 * Injects an active Scrabble game where it's my turn (inviter; the board primes my
 * rack from my seed), navigates to the board via the "your move" hub, enters Swap
 * mode, picks 2 rack tiles, and confirms — then asserts the recorded move is an
 * `exchange` carrying those 2 letters + the move-0 seed reveal. Uses a REAL
 * reachable contact (det-03 gate); the wire is harmless. Leaves clean.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { forwardApp } = require('./lib/devices.cjs');
const { CdpSession } = require('./lib/cdp.cjs');
const { install } = require('./lib/dom-driver.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hex16 = () => crypto.randomBytes(16).toString('hex');
const commit = (h) => crypto.createHash('sha256').update(Buffer.from(h, 'hex')).digest('hex');

(async () => {
  process.env.ANTON_COMM_SERIAL = 'QV7202N48K';
  let s = new CdpSession((await forwardApp('comm', 0)).wsUrl); await install(s);
  let failed = false;
  try {
    const opp = await s.eval(`(async()=>{ const cs=await __td.readStore('anton-comm','contacts'); const c=(cs||[]).find(x=>x&&x.publicKeyHex&&!x.blocked); return c?c.contactHash:null; })()`);
    if (!opp) throw new Error('no reachable contact to use as opponent');
    const sA = hex16(), sB = hex16();
    const game = {
      id: 'swap_test', gameId: 'scrabble', role: 'initiator', myColor: 0, opponentHash: opp, opponentName: 'SwapTest',
      status: 'active', moves: [], setup: { initiatorCommit: commit(sA), opponentContribution: sB }, mySecrets: [sA], createdAt: 1, updatedAt: 1,
    };
    await s.eval(`(async()=>{await new Promise((res,rej)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').put(${JSON.stringify(game)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();rej(tx.error);};};req.onerror=()=>rej(req.error);});return 1;})()`);
    await s.eval(`(()=>{setTimeout(()=>location.reload(),100);return 1;})()`); s.close();
    await sleep(5000);
    s = new CdpSession((await forwardApp('comm', 0)).wsUrl); await install(s);

    // Navigate: chat tab → games entry → the Scrabble row → board.
    const nav = await s.eval(`(async()=>{
      for(let i=0;i<5;i++){await __td.clickText(/Tillbaka|Back|Avbryt|Cancel/i,120);}
      const t=document.querySelector('[aria-controls="tabpanel-chat"]'); if(t)t.click(); await __td.sleep(800);
      const ban=[...document.querySelectorAll('button')].find(b=>/🎮/.test((b.innerText||b.textContent)||'')); if(!ban) return {err:'no games entry'};
      ban.click(); await __td.sleep(900);
      const row=[...document.querySelectorAll('button')].find(b=>/Scrabble/i.test((b.innerText||b.textContent)||'')); if(!row) return {err:'no Scrabble row'};
      row.click(); await __td.sleep(1200);
      const racks=[...document.querySelectorAll('[data-cell^="sc-rack-"]')].length;
      return {ok:true, racks};
    })()`);
    if (nav.err) throw new Error('nav: ' + nav.err);
    assert.equal(nav.racks, 7, 'my opening rack (7 tiles) is shown on the board');
    console.log('1. reached the board via the hub; 7-tile rack primed');

    // Enter Swap, pick 2 tiles, confirm.
    const swap = await s.eval(`(async()=>{
      const sw=document.querySelector('[data-cell="sc-swap"]'); if(!sw) return {err:'no Swap button'}; if(sw.disabled) return {err:'Swap disabled'};
      sw.click(); await __td.sleep(400);
      const r0=document.querySelector('[data-cell="sc-rack-0"]'); const r1=document.querySelector('[data-cell="sc-rack-1"]');
      if(!r0||!r1) return {err:'rack tiles missing in swap mode'};
      r0.click(); await __td.sleep(250); r1.click(); await __td.sleep(250);
      const conf=document.querySelector('[data-cell="sc-swap-confirm"]'); if(!conf) return {err:'no confirm'}; if(conf.disabled) return {err:'confirm disabled'};
      conf.click(); await __td.sleep(1000);
      const rows=await __td.readStore('anton-comm','games'); const g=rows.find(x=>x&&x.id==='swap_test'); const mv=g&&g.moves[0];
      return {ok:true, moves:g&&g.moves.length, type:mv&&mv.move&&mv.move.type, n:mv&&mv.move&&mv.move.letters&&mv.move.letters.length, hasSeed: !!(mv&&mv.move&&mv.move.seedReveal)};
    })()`);
    if (swap.err) throw new Error('swap: ' + swap.err);
    assert.equal(swap.moves, 1, 'the exchange was recorded as a move');
    assert.equal(swap.type, 'exchange', 'move type is exchange');
    assert.equal(swap.n, 2, 'two tiles were swapped');
    assert.ok(swap.hasSeed, 'move 0 carried the seed reveal (unlocks the bag for the opponent)');
    console.log('2. Swap: 2 tiles exchanged, recorded as type=exchange + seed revealed');

    console.log('✅ tile exchange verified on-device');
    await s.eval(`(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').delete('swap_test');tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`);
    console.log('cleanup: test game removed');
  } catch (e) { failed = true; console.log('❌ ' + e.message); }
  s.close();
  process.exit(failed ? 1 : 0);
})();
