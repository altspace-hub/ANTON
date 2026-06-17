/**
 * game-reentry-smoke.cjs — single-phone (A) regression for "you can't get back
 * into a game you left when it's the opponent's turn". Injects an ACTIVE connect4
 * game where it's the OPPONENT's turn (so it's NOT actionable — previously it had
 * no banner + wasn't in the tray), then verifies: the ChatList shows the games
 * entry, the games HUB lists the game (status "their turn"), and tapping it
 * re-opens the board. Bogus opponent (no wire sent — pure navigation). Leaves clean.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('./lib/devices.cjs');
const { CdpSession } = require('./lib/cdp.cjs');
const { install } = require('./lib/dom-driver.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GAME = {
  id: 'reentry_test', gameId: 'connect4', role: 'initiator', myColor: 0,
  opponentHash: 'ANTON-TEST-REENTRY', opponentName: 'ReentryTest', status: 'active',
  moves: [{ seq: 0, player: 0, move: { col: 3 } }], // I moved → it's the opponent's turn (not actionable)
  createdAt: 1, updatedAt: 1,
};
const putEval = `(async()=>{await new Promise((res,rej)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').put(${JSON.stringify(GAME)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();rej(tx.error);};};req.onerror=()=>rej(req.error);});return 1;})()`;
const delEval = `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').delete('reentry_test');tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;

(async () => {
  process.env.ANTON_COMM_SERIAL = 'QV7202N48K';
  let s = new CdpSession((await forwardApp('comm', 0)).wsUrl); await install(s);
  let failed = false;
  try {
    await s.eval(putEval);
    await s.eval(`(()=>{setTimeout(()=>location.reload(),100);return 1;})()`); s.close();
    await sleep(5000);
    s = new CdpSession((await forwardApp('comm', 0)).wsUrl); await install(s);
    await s.eval(`(async()=>{for(let i=0;i<5;i++){await __td.clickText(/Tillbaka|Back|Avbryt|Cancel/i,120);}const t=document.querySelector('[aria-controls="tabpanel-chat"]');if(t)t.click();await __td.sleep(800);})()`);

    // 1. The ChatList shows a games entry even though nothing is actionable.
    const banner = await s.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/🎮/.test((x.innerText||x.textContent)||''));return b?((b.innerText||b.textContent)||'').replace(/\\s+/g,' ').trim():null;})()`);
    assert.ok(banner && /game|spel/i.test(banner), 'ChatList shows a games entry for the ongoing game (got: ' + banner + ')');
    console.log('1. ChatList games entry present (not actionable): "' + banner + '"');

    // 2. Tap it → the hub lists the (their-turn) game.
    const nav = await s.eval(`(async()=>{
      const b=[...document.querySelectorAll('button')].find(x=>/🎮/.test((x.innerText||x.textContent)||'')); b.click(); await __td.sleep(1000);
      const row=[...document.querySelectorAll('button')].find(x=>/Connect Four|Fyra i rad/i.test((x.innerText||x.textContent)||''));
      if(!row) return {err:'game not in hub'};
      const turn=/their turn|deras tur/i.test((row.innerText||row.textContent)||'');
      return {ok:true, turn};
    })()`);
    if (nav.err) throw new Error('hub: ' + nav.err);
    assert.ok(nav.turn, 'the hub row shows it is the opponent’s turn');
    console.log('2. games hub lists the left game with "their turn"');

    // 3. Tap the row → the board re-opens (read-only).
    const board = await s.eval(`(async()=>{
      const row=[...document.querySelectorAll('button')].find(x=>/Connect Four|Fyra i rad/i.test((x.innerText||x.textContent)||'')); row.click(); await __td.sleep(1200);
      const cells=[...document.querySelectorAll('[data-cell^="col-"]')].length;
      const body=document.body.textContent||'';
      return {cells, theirTurn:/their turn|deras tur/i.test(body)};
    })()`);
    assert.equal(board.cells, 7, 'the board re-opened (7 columns)');
    assert.ok(board.theirTurn, 'the re-opened board shows "their turn" (read-only)');
    console.log('3. re-opened the board from the hub (7 columns, "their turn")');

    console.log('✅ re-entry verified: a left, not-your-turn game is reachable again via the hub');
    await s.eval(delEval);
    console.log('cleanup: test game removed');
  } catch (e) { failed = true; console.log('❌ ' + e.message); }
  s.close();
  process.exit(failed ? 1 : 0);
})();
