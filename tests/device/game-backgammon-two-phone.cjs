/**
 * game-backgammon-two-phone.cjs — the headline backgammon verification across two
 * paired phones (A=QV7202N48K, B=QV7101L31T): the commit-reveal DICE work over the
 * real relay. A invites Backgammon → B accepts → the dice bootstrap is exchanged
 * (both sessions hold the full setup) → A derives + plays roll 0 → it reaches B →
 * B derives + plays roll 1 → it reaches A. Proves the fair-dice protocol +
 * engine + board end-to-end. A turn is played greedily (tap a legal source → a
 * legal destination until Confirm enables) since the dice are random.
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
  return s.eval(`(async()=>{const rows=await __td.readStore('anton-comm','games');const g=rows.find(r=>r&&r.id===${JSON.stringify(id)});return g?{status:g.status,moves:g.moves.length,setup:g.setup||null}:null;})()`);
}
async function pollGame(s, id, pred, tries = 14) {
  for (let i = 0; i < tries; i++) { await sleep(2500); const g = await readGame(s, id); if (g && pred(g)) return g; } return null;
}
const setupComplete = (g) => !!g && !!g.setup && typeof g.setup.initiatorCommit === 'string' && typeof g.setup.opponentCommit === 'string' && typeof g.setup.opponentContribution === 'string';

/** Greedily stage a legal turn (tap source → destination) until Confirm enables. */
const PLAY_TURN = `(async()=>{
  const cell = c => document.querySelector('[data-cell="'+c+'"]');
  const isCtrl = c => c==='bg-confirm'||c==='bg-undo';
  for (let r=0; r<16; r++){
    const conf = cell('bg-confirm');
    if (conf && !conf.disabled){ conf.click(); await __td.sleep(1000); return {confirmed:true, rounds:r}; }
    const src = [...document.querySelectorAll('[data-cell^="bg-"]')].find(b=>!b.disabled && !isCtrl(b.getAttribute('data-cell')) && b.getAttribute('data-cell')!=='bg-off');
    if (!src) return {confirmed:false, reason:'no source', rounds:r};
    const selC = src.getAttribute('data-cell');
    src.click(); await __td.sleep(350);
    const dst = [...document.querySelectorAll('[data-cell^="bg-"]')].find(b=>!b.disabled && !isCtrl(b.getAttribute('data-cell')) && b.getAttribute('data-cell')!=='bg-bar' && b.getAttribute('data-cell')!==selC);
    if (!dst){ src.click(); await __td.sleep(150); continue; }
    dst.click(); await __td.sleep(350);
  }
  const conf = cell('bg-confirm');
  if (conf && !conf.disabled){ conf.click(); await __td.sleep(1000); return {confirmed:true, rounds:16}; }
  return {confirmed:false, reason:'could not reach a maximal turn'};
})()`;
const boardInfo = `(()=>{ const cells=[...document.querySelectorAll('[data-cell^="bg-"]')].filter(b=>/^bg-\\d+$/.test(b.getAttribute('data-cell'))).length; const conf=document.querySelector('[data-cell="bg-confirm"]'); return {cells, interactive: !!conf}; })()`;

(async () => {
  process.env.ANTON_COMM_SERIAL = 'QV7202N48K';
  process.env.ANTON_COMM_SERIAL_B = 'QV7101L31T';
  const sA = await connect(0); const sB = await connect(1);
  let failed = false; let gameId = null;
  try {
    const peer = (await sA.eval(`(async()=>{const cs=await __td.readStore('anton-comm','contacts');const p=cs.find(c=>c&&c.publicKeyHex&&c.confirmed!==false)||cs[0]||{};return p.displayName;})()`)) || 'Emma';
    const clean = `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');const g=tx.objectStore('games').getAll();g.onsuccess=()=>{for(const x of (g.result||[])) if(x&&x.gameId==='backgammon') tx.objectStore('games').delete(x.id);};tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;
    await sA.eval(clean); await sB.eval(clean);

    // 1. A invites Backgammon.
    await openPeerThread(sA, peer);
    const step1 = await sA.eval(`(async()=>{
      const att=[...document.querySelectorAll('button[aria-label]')].find(b=>/attach|bifoga|bilag/i.test(b.getAttribute('aria-label')||'')); if(!att)return{err:'no attach'}; att.click(); await __td.sleep(700);
      const tile=[...document.querySelectorAll('button')].find(b=>/^\\s*(Game|Spel)\\s*$/.test(((b.innerText||b.textContent)||'').trim())); if(!tile||tile.disabled)return{err:'no Game tile'}; tile.click(); await __td.sleep(700);
      const pick=[...document.querySelectorAll('button')].find(b=>/Backgammon/i.test(((b.innerText||b.textContent)||'').trim())); if(!pick)return{err:'no Backgammon in picker'}; pick.click(); await __td.sleep(1400);
      const rows=await __td.readStore('anton-comm','games'); const g=rows.find(r=>r&&r.gameId==='backgammon'&&r.role==='initiator'); return {ok:true,id:g&&g.id};
    })()`);
    if (step1.err) throw new Error('A invite: ' + step1.err);
    gameId = step1.id;
    console.log('1. A invited Backgammon (id=' + (gameId || '').slice(0, 12) + '…)');
    assert.ok(await pollGame(sB, gameId, (g) => g.status === 'invited'), 'B received the invite');

    // 2. B accepts → both active; the dice bootstrap is fully exchanged.
    await openPeerThread(sB, 'Daniel');
    await sB.eval(`(async()=>{const p=[...document.querySelectorAll('button')].find(b=>/^\\s*(Play|Spela)\\s*$/.test(((b.innerText||b.textContent)||'').trim()));if(p){p.click();await __td.sleep(1800);}})()`);
    assert.ok(await pollGame(sA, gameId, (g) => g.status === 'active'), 'A sees active');
    const aG = await readGame(sA, gameId); const bG = await readGame(sB, gameId);
    assert.ok(setupComplete(aG), 'A holds the complete dice bootstrap');
    assert.ok(setupComplete(bG), 'B holds the complete dice bootstrap');
    assert.equal(aG.setup.initiatorCommit, bG.setup.initiatorCommit, 'both agree on the inviter commit');
    console.log('2. B accepted → both active; dice bootstrap exchanged + agreed');

    // 3. A opens the board → A derived roll 0 (board interactive) → plays it.
    await openPeerThread(sA, peer);
    await sA.eval(`(async()=>{const b=[...document.querySelectorAll('button')].find(x=>/Open board|Öppna brädet/i.test(((x.innerText||x.textContent)||'').trim()));if(b){b.click();await __td.sleep(1300);}})()`);
    const aBoard = await sA.eval(boardInfo);
    assert.equal(aBoard.cells, 24, "A's board renders 24 points");
    assert.ok(aBoard.interactive, 'A derived its roll-0 dice (board interactive)');
    console.log('3. A board: 24 points, roll-0 dice derived from the commit-reveal');
    const aPlay = await sA.eval(PLAY_TURN);
    if (!aPlay.confirmed) throw new Error('A could not complete roll 0: ' + aPlay.reason);
    assert.ok(await pollGame(sB, gameId, (g) => g.moves >= 1), 'A roll-0 turn reached B');
    console.log('   A played roll 0 → delivered to B');

    // 4. B's open board updates → B derived roll 1 → plays it back.
    const bPlay = await sB.eval(PLAY_TURN);
    if (!bPlay.confirmed) throw new Error('B could not complete roll 1: ' + bPlay.reason);
    assert.ok(await pollGame(sA, gameId, (g) => g.moves >= 2), 'B roll-1 turn reached A');
    console.log('4. B played roll 1 → delivered to A');

    console.log('✅ BACKGAMMON VERIFIED OVER THE RELAY — fair dice bootstrap + two pipelined rolls');
  } catch (e) { failed = true; console.log('❌ ' + e.message); }
  finally {
    if (gameId && !failed) {
      const del = `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').delete(${JSON.stringify(gameId)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;
      try { await sA.eval(del); await sB.eval(del); console.log('cleanup: game removed on both'); } catch { /* best effort */ }
    }
    sA.close(); sB.close(); process.exit(failed ? 1 : 0);
  }
})();
