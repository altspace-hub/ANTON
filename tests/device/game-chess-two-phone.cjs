/**
 * game-chess-two-phone.cjs — on-device smoke of the Chess board + move round-trip
 * between two paired Comm phones (A=QV7202N48K white, B=QV7101L31T black).
 * A invites Chess → B accepts → A plays e2-e4 → B plays e7-e5, each verified to
 * reach the other phone. Confirms the chess board renders + the move wire works
 * on-device (the engine itself is perft-verified in unit tests). Leaves clean.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('./lib/devices.cjs');
const { CdpSession } = require('./lib/cdp.cjs');
const { install } = require('./lib/dom-driver.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(idx) { const c = await forwardApp('comm', idx); const s = new CdpSession(c.wsUrl); await install(s); return s; }
async function openPeerThread(s, name) {
  await s.eval(`(async()=>{for(let i=0;i<6;i++){await __td.clickText(/Tillbaka|Back|Avbryt|Cancel/i,140);}})()`);
  await s.eval(`(()=>{const t=document.querySelector('[aria-controls="tabpanel-chat"]');if(t)t.click();})()`); await s.eval('__td.sleep(900)');
  await s.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.innerText||'').includes(${JSON.stringify(name)}));if(b)b.click();})()`); await s.eval('__td.sleep(1500)');
}
async function readGame(s, id) {
  return s.eval(`(async()=>{const rows=await __td.readStore('anton-comm','games');const g=rows.find(r=>r&&r.id===${JSON.stringify(id)});return g?{status:g.status,moves:g.moves.length}:null;})()`);
}
async function pollGame(s, id, pred, tries = 12) {
  for (let i = 0; i < tries; i++) { await sleep(2500); const g = await readGame(s, id); if (g && pred(g)) return g; } return null;
}
/** Tap a board square by its stable data-cell (e.g. 'e2'). */
async function tapSquare(s, label) {
  return s.eval(`(async()=>{const b=document.querySelector(${JSON.stringify('[data-cell="' + label + '"]')});if(!b)return{err:'no square ${label}'};b.click();await __td.sleep(700);return{ok:true};})()`);
}

(async () => {
  process.env.ANTON_COMM_SERIAL = 'QV7202N48K';
  process.env.ANTON_COMM_SERIAL_B = 'QV7101L31T';
  const sA = await connect(0); const sB = await connect(1);
  let failed = false; let gameId = null;
  try {
    const peer = (await sA.eval(`(async()=>{const cs=await __td.readStore('anton-comm','contacts');const p=cs.find(c=>c&&c.publicKeyHex&&c.confirmed!==false)||cs[0]||{};return p.displayName;})()`)) || 'Emma';
    const clean = `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');const g=tx.objectStore('games').getAll();g.onsuccess=()=>{for(const x of (g.result||[])) if(x&&x.gameId==='chess') tx.objectStore('games').delete(x.id);};tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;
    await sA.eval(clean); await sB.eval(clean);

    // 1. A invites Chess.
    await openPeerThread(sA, peer);
    const step1 = await sA.eval(`(async()=>{
      const att=[...document.querySelectorAll('button[aria-label]')].find(b=>/attach|bifoga|bilag/i.test(b.getAttribute('aria-label')||'')); if(!att)return{err:'no attach'}; att.click(); await __td.sleep(700);
      const tile=[...document.querySelectorAll('button')].find(b=>/^\\s*(Game|Spel)\\s*$/.test(((b.innerText||b.textContent)||'').trim())); if(!tile||tile.disabled)return{err:'no Game tile'}; tile.click(); await __td.sleep(700);
      const pick=[...document.querySelectorAll('button')].find(b=>/Chess|Schack/i.test(((b.innerText||b.textContent)||'').trim())); if(!pick)return{err:'no Chess in picker'}; pick.click(); await __td.sleep(1400);
      const rows=await __td.readStore('anton-comm','games'); const g=rows.find(r=>r&&r.gameId==='chess'&&r.role==='initiator'); return {ok:true,id:g&&g.id};
    })()`);
    if (step1.err) throw new Error('A invite: ' + step1.err);
    gameId = step1.id;
    console.log('1. A invited Chess (id=' + (gameId || '').slice(0, 12) + '…)');
    assert.ok(await pollGame(sB, gameId, (g) => g.status === 'invited'), 'B received the invite');

    // 2. B accepts → both active; B is auto-navigated to the board.
    await openPeerThread(sB, 'Daniel');
    await sB.eval(`(async()=>{const p=[...document.querySelectorAll('button')].find(b=>/^\\s*(Play|Spela)\\s*$/.test(((b.innerText||b.textContent)||'').trim()));if(p){p.click();await __td.sleep(1600);}})()`);
    assert.ok(await pollGame(sA, gameId, (g) => g.status === 'active'), 'A sees active');
    console.log('2. B accepted → active');

    // A opens the board + confirm pieces render (32 glyphs on a fresh board).
    await openPeerThread(sA, peer);
    await sA.eval(`(async()=>{const b=[...document.querySelectorAll('button')].find(x=>/Open board|Öppna brädet/i.test(((x.innerText||x.textContent)||'').trim()));if(b){b.click();await __td.sleep(1200);}})()`);
    const glyphs = await sA.eval(`(()=>{const t=document.body.textContent||'';return (t.match(/[\\u2654-\\u265F]/g)||[]).length;})()`);
    assert.ok(glyphs >= 16, "A's chessboard renders pieces (found " + glyphs + " glyphs)");
    console.log('   A board renders pieces (' + glyphs + ' chess glyphs)');

    // 3. A plays e2-e4 (tap e2 to select, e4 to move).
    let r = await tapSquare(sA, 'e2'); if (r.err) throw new Error('A e2: ' + r.err);
    r = await tapSquare(sA, 'e4'); if (r.err) throw new Error('A e4: ' + r.err);
    assert.ok(await pollGame(sB, gameId, (g) => g.moves >= 1), 'A e2-e4 reached B');
    console.log('3. A played e2-e4 → delivered to B');

    // 4. B plays e7-e5 (B is on the board after accept).
    r = await tapSquare(sB, 'e7'); if (r.err) throw new Error('B e7: ' + r.err);
    r = await tapSquare(sB, 'e5'); if (r.err) throw new Error('B e5: ' + r.err);
    assert.ok(await pollGame(sA, gameId, (g) => g.moves >= 2), 'B e7-e5 reached A');
    console.log('4. B played e7-e5 → delivered to A');

    console.log('✅ CHESS board + move round-trip verified phone-to-phone');
  } catch (e) { failed = true; console.log('❌ ' + e.message); }
  finally {
    if (gameId && !failed) {
      const del = `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').delete(${JSON.stringify(gameId)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;
      try { await sA.eval(del); await sB.eval(del); console.log('cleanup: game removed on both'); } catch { /* best effort */ }
    }
    sA.close(); sB.close(); process.exit(failed ? 1 : 0);
  }
})();
