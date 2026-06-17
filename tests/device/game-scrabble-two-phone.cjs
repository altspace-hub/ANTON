/**
 * game-scrabble-two-phone.cjs — Scrabble across two paired phones (A=QV7202N48K,
 * B=QV7101L31T): the FAIR BAG works over the relay. A invites → B accepts → the
 * shuffle-seed bootstrap is exchanged (both hold the full setup) → A (the inviter)
 * sees its opening rack BEFORE move 0 (local prime), plays a first word across the
 * centre + reveals the seed → it reaches B → the seed unlocks B's rack (dealt from
 * the same bag) and shows A's word → B takes a turn (pass). Proves bag bootstrap +
 * dealing + a turn round-trip.
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
const setupComplete = (g) => !!g && !!g.setup && typeof g.setup.initiatorCommit === 'string' && typeof g.setup.opponentContribution === 'string';
const boardInfo = `(()=>{ const cells=[...document.querySelectorAll('[data-cell^="sc-"]')].filter(b=>/^sc-\\d+-\\d+$/.test(b.getAttribute('data-cell'))).length; const racks=[...document.querySelectorAll('[data-cell^="sc-rack-"]')].length; return {cells, racks}; })()`;

/** (1) Verify the dictionary GATE is wired: stage the first 2 rack tiles and
 *  assert submit-disabled ⟺ an invalid-word hint is shown. (2) Find a real
 *  2-letter word formable from the rack, place it across the centre, assert
 *  submit is ENABLED (dictionary accepted it) + submit (move 0). */
const PLAY_VALID = `(async()=>{
  const COMMON = ['AT','TO','IN','ON','AN','OR','IT','IS','AS','HE','BE','GO','SO','NO','OF','UP','WE','DO','ME','MY','BY','HI','MA','PA','US','AM','AX','OX','EL','EN','ER','ET','OE','OD','UT','UN','HA','YE','LO','ID','OW','AW','OH','AH'];
  const letterOf = (b) => { const sp=b.querySelector('span span'); return sp ? (sp.textContent||'').trim() : ''; };
  const readRack = () => [...document.querySelectorAll('[data-cell^="sc-rack-"]')].map((b,i)=>({i, L: letterOf(b)})).filter(x=>/^[A-Z]$/.test(x.L));
  const place = async (ri, r, c) => { document.querySelector('[data-cell="sc-rack-'+ri+'"]').click(); await __td.sleep(250); document.querySelector('[data-cell="sc-'+r+'-'+c+'"]').click(); await __td.sleep(250); };
  await __td.sleep(2500); // let the word list load

  // (1) gate-consistency on the first 2 tiles
  const rack0 = readRack();
  if (rack0.length < 2) return {err:'need 2 letter tiles'};
  await place(rack0[0].i, 7, 7); await place(rack0[1].i, 7, 8);
  const sub1 = document.querySelector('[data-cell="sc-submit"]');
  const bad1 = !!document.querySelector('[data-cell="sc-badword"]');
  const gateOk = !!sub1 && (sub1.disabled === bad1); // submit blocked exactly when a word is invalid
  document.querySelector('[data-cell="sc-recall"]').click(); await __td.sleep(300);

  // (2) find + play a real word
  const rack = readRack();
  let pick = null;
  for (const w of COMMON) { if (w[0]===w[1]) continue;
    const a = rack.find(x=>x.L===w[0]); const b = a ? rack.find(x=>x.L===w[1] && x.i!==a.i) : null;
    if (a && b) { pick = {word:w, ia:a.i, ib:b.i}; break; } }
  if (!pick) return {err:'no common word formable from rack ['+rack.map(x=>x.L).join('')+']', gateOk};
  await place(pick.ia, 7, 7); await place(pick.ib, 7, 8);
  const sub = document.querySelector('[data-cell="sc-submit"]');
  if (!sub || sub.disabled) return {err:'submit disabled for real word '+pick.word, gateOk};
  sub.click(); await __td.sleep(1000);
  return {ok:true, word: pick.word, gateOk, firstBlocked: bad1};
})()`;

(async () => {
  process.env.ANTON_COMM_SERIAL = 'QV7202N48K';
  process.env.ANTON_COMM_SERIAL_B = 'QV7101L31T';
  const sA = await connect(0); const sB = await connect(1);
  let failed = false; let gameId = null;
  try {
    const peer = (await sA.eval(`(async()=>{const cs=await __td.readStore('anton-comm','contacts');const p=cs.find(c=>c&&c.publicKeyHex&&c.confirmed!==false)||cs[0]||{};return p.displayName;})()`)) || 'Emma';
    const clean = `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');const g=tx.objectStore('games').getAll();g.onsuccess=()=>{for(const x of (g.result||[])) if(x&&x.gameId==='scrabble') tx.objectStore('games').delete(x.id);};tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;
    await sA.eval(clean); await sB.eval(clean);

    // 1. A invites Scrabble.
    await openPeerThread(sA, peer);
    const step1 = await sA.eval(`(async()=>{
      const att=[...document.querySelectorAll('button[aria-label]')].find(b=>/attach|bifoga|bilag/i.test(b.getAttribute('aria-label')||'')); if(!att)return{err:'no attach'}; att.click(); await __td.sleep(700);
      const tile=[...document.querySelectorAll('button')].find(b=>/^\\s*(Game|Spel)\\s*$/.test(((b.innerText||b.textContent)||'').trim())); if(!tile||tile.disabled)return{err:'no Game tile'}; tile.click(); await __td.sleep(700);
      const pick=[...document.querySelectorAll('button')].find(b=>/Scrabble/i.test(((b.innerText||b.textContent)||'').trim())); if(!pick)return{err:'no Scrabble in picker'}; pick.click(); await __td.sleep(1400);
      const rows=await __td.readStore('anton-comm','games'); const g=rows.find(r=>r&&r.gameId==='scrabble'&&r.role==='initiator'); return {ok:true,id:g&&g.id};
    })()`);
    if (step1.err) throw new Error('A invite: ' + step1.err);
    gameId = step1.id;
    console.log('1. A invited Scrabble (id=' + (gameId || '').slice(0, 12) + '…)');
    assert.ok(await pollGame(sB, gameId, (g) => g.status === 'invited'), 'B received the invite');

    // 2. B accepts → both active; the shuffle-seed bootstrap is exchanged.
    await openPeerThread(sB, 'Daniel');
    await sB.eval(`(async()=>{const p=[...document.querySelectorAll('button')].find(b=>/^\\s*(Play|Spela)\\s*$/.test(((b.innerText||b.textContent)||'').trim()));if(p){p.click();await __td.sleep(1800);}})()`);
    assert.ok(await pollGame(sA, gameId, (g) => g.status === 'active'), 'A sees active');
    const aG = await readGame(sA, gameId); const bG = await readGame(sB, gameId);
    assert.ok(setupComplete(aG) && setupComplete(bG), 'both hold the complete shuffle-seed bootstrap');
    console.log('2. B accepted → both active; shuffle-seed bootstrap exchanged');

    // 3. A opens the board → sees its opening rack (pre-move-0 prime) → plays word 0.
    await openPeerThread(sA, peer);
    await sA.eval(`(async()=>{const b=[...document.querySelectorAll('button')].find(x=>/Open board|Öppna brädet/i.test(((x.innerText||x.textContent)||'').trim()));if(b){b.click();await __td.sleep(1300);}})()`);
    const aBoard = await sA.eval(boardInfo);
    assert.equal(aBoard.cells, 225, "A's board renders 225 squares");
    assert.equal(aBoard.racks, 7, "A sees its 7 opening tiles (dealt from the fair bag)");
    console.log('3. A board: 225 squares + 7-tile rack from the fair bag');
    const play = await sA.eval(PLAY_VALID);
    if (play.err) throw new Error('A first word: ' + play.err);
    assert.ok(play.gateOk, 'the dictionary gate is wired (submit blocked exactly when a word is invalid)');
    assert.ok(await pollGame(sB, gameId, (g) => g.moves >= 1), 'A move 0 (' + play.word + ') reached B');
    console.log('   dictionary gate OK (first 2 tiles ' + (play.firstBlocked ? 'were gibberish → blocked' : 'happened to be a word') + ')');
    console.log('   A played a VALID word "' + play.word + '" → accepted + delivered to B');

    // 4. B's board: the seed unlocked → B sees ITS rack + A's word → B takes a turn (pass).
    const bBoard = await sB.eval(boardInfo);
    assert.equal(bBoard.racks, 7, "B's rack was dealt once A revealed the seed");
    const bPlaced = await sB.eval(`(()=>[...document.querySelectorAll('[data-cell^="sc-"]')].some(b=>/^sc-7-[78]$/.test(b.getAttribute('data-cell')) && b.querySelector('span span')))()`);
    assert.ok(bPlaced, "A's word is visible on B's board (replayed)");
    await sB.eval(`(async()=>{const p=document.querySelector('[data-cell="sc-pass"]'); if(p&&!p.disabled){p.click();await __td.sleep(900);}})()`);
    assert.ok(await pollGame(sA, gameId, (g) => g.moves >= 2), 'B turn reached A');
    console.log('4. B saw its dealt rack + the word → took a turn → delivered to A');

    console.log('✅ SCRABBLE VERIFIED OVER THE RELAY — fair bag bootstrap + dealing + a turn round-trip');
  } catch (e) { failed = true; console.log('❌ ' + e.message); }
  finally {
    if (gameId && !failed) {
      const del = `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').delete(${JSON.stringify(gameId)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;
      try { await sA.eval(del); await sB.eval(del); console.log('cleanup: game removed on both'); } catch { /* best effort */ }
    }
    sA.close(); sB.close(); process.exit(failed ? 1 : 0);
  }
})();
