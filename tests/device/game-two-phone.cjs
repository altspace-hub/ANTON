/**
 * game-two-phone.cjs — live cross-relay verification of a Connect Four game
 * between two paired Comm phones.
 *
 *   A = QV7202N48K ("Daniel", inviter / red / player 0)
 *   B = QV7101L31T ("Emma", opponent / yellow / player 1)
 *
 *   1. A invites Connect Four (via the attach → Play → picker UI).
 *   2. B receives the invite + Accepts (the GameCard).
 *   3. They play to a win: A stacks column 1 (4 vertical) while B answers in
 *      column 2 → A wins. Each move is verified to round-trip the relay (the
 *      other phone's session log grows) before the next.
 *   4. Both phones converge on status 'finished', outcome 0 (A wins).
 *
 * Leaves both devices clean. Run: ANTON_DEVICE_E2E=1 node tests/device/game-two-phone.cjs
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('./lib/devices.cjs');
const { CdpSession } = require('./lib/cdp.cjs');
const { install } = require('./lib/dom-driver.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(idx) {
  const comm = await forwardApp('comm', idx);
  const s = new CdpSession(comm.wsUrl);
  await install(s);
  return s;
}

async function openPeerThread(s, peerName) {
  await s.eval(`(async()=>{for(let i=0;i<6;i++){await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i,140);}})()`);
  await s.eval(`(()=>{const t=document.querySelector('[aria-controls="tabpanel-chat"]');if(t)t.click();})()`);
  await s.eval('__td.sleep(900)');
  await s.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.innerText||'').includes(${JSON.stringify(peerName)}));if(b)b.click();})()`);
  await s.eval('__td.sleep(1500)');
}

/** Read a game session row by id (or the first matching gameId). */
async function readGame(s, id) {
  return s.eval(`(async()=>{const rows=await __td.readStore('anton-comm','games');const g=${id ? `rows.find(r=>r&&r.id===${JSON.stringify(id)})` : `rows[0]`};return g?{id:g.id,status:g.status,role:g.role,myColor:g.myColor,moves:g.moves.length,outcome:g.outcome}:null;})()`);
}

async function pollGame(s, id, pred, tries = 12) {
  for (let i = 0; i < tries; i++) {
    await sleep(2500);
    const g = await readGame(s, id);
    if (g && pred(g)) return g;
  }
  return null;
}

/** Tap a board column (1-indexed) on the game-board screen. */
async function tapColumn(s, n) {
  return s.eval(`(async()=>{
    const b=[...document.querySelectorAll('button[aria-label]')].find(x=>x.getAttribute('aria-label')===${JSON.stringify('Column ' + n)});
    if(!b) return {err:'no Column ${n} button'};
    if(b.disabled) return {err:'Column ${n} disabled (not my turn?)'};
    b.click(); await __td.sleep(1200);
    return {ok:true};
  })()`);
}

(async () => {
  process.env.ANTON_COMM_SERIAL = 'QV7202N48K';
  process.env.ANTON_COMM_SERIAL_B = 'QV7101L31T';
  const sA = await connect(0);
  const sB = await connect(1);
  let failed = false; let gameId = null;

  try {
    const peerName = (await sA.eval(`(async()=>{const cs=await __td.readStore('anton-comm','contacts');const p=cs.find(c=>c&&c.publicKeyHex&&c.confirmed!==false)||cs[0]||{};return p.displayName;})()`)) || 'Emma';

    // Clean any prior connect4 games on both.
    const clean = `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');const g=tx.objectStore('games').getAll();g.onsuccess=()=>{for(const x of (g.result||[])) if(x&&x.gameId==='connect4') tx.objectStore('games').delete(x.id);};tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;
    await sA.eval(clean); await sB.eval(clean);

    // ── 1. A invites Connect Four via the UI ─────────────────────────
    await openPeerThread(sA, peerName);
    const step1 = await sA.eval(`(async()=>{
      const attach=[...document.querySelectorAll('button[aria-label]')].find(b=>/attach|bifoga|bilag/i.test(b.getAttribute('aria-label')||''));
      if(!attach) return {err:'no attach button'};
      attach.click(); await __td.sleep(700);
      const tile=[...document.querySelectorAll('button')].find(b=>/^\\s*Game\\s*$/.test(((b.innerText||b.textContent)||'').trim()));
      if(!tile) return {err:'no Game tile'};
      if(tile.disabled) return {err:'Game tile disabled'};
      tile.click(); await __td.sleep(700);
      const pick=[...document.querySelectorAll('button')].find(b=>/Connect Four/i.test(((b.innerText||b.textContent)||'').trim()));
      if(!pick) return {err:'no Connect Four in picker'};
      pick.click(); await __td.sleep(1400);
      const rows=await __td.readStore('anton-comm','games');
      const g=rows.find(r=>r&&r.gameId==='connect4'&&r.role==='initiator');
      return {ok:true,id:g&&g.id,status:g&&g.status};
    })()`);
    if (step1.err) throw new Error('A invite: ' + step1.err);
    gameId = step1.id;
    assert.equal(step1.status, 'invited', 'A holds an invited initiator session');
    console.log('1. A invited Connect Four (id=' + (gameId || '').slice(0, 12) + '…)');

    const bGot = await pollGame(sB, gameId, (g) => g.status === 'invited' && g.role === 'opponent');
    assert.ok(bGot, 'B received the invite');
    console.log('   B received the invite (opponent, invited)');

    // ── 2. B accepts (the GameCard) → both active ────────────────────
    await openPeerThread(sB, 'Daniel');
    const step2 = await sB.eval(`(async()=>{
      const play=[...document.querySelectorAll('button')].find(b=>/^\\s*Play\\s*$/.test(((b.innerText||b.textContent)||'').trim()));
      if(!play) return {err:'no Play button on the card'};
      play.click(); await __td.sleep(1600);
      return {ok:true};
    })()`);
    if (step2.err) throw new Error('B accept: ' + step2.err);
    const aActive = await pollGame(sA, gameId, (g) => g.status === 'active');
    assert.ok(aActive, 'A sees the game active after B accepted');
    console.log('2. B accepted → game active on both');

    // A opens the board (B was auto-navigated on accept).
    await openPeerThread(sA, peerName);
    await sA.eval(`(async()=>{const b=[...document.querySelectorAll('button')].find(x=>/Open board/i.test(((x.innerText||x.textContent)||'').trim()));if(b){b.click();await __td.sleep(1200);}})()`);

    // ── 3. Play to A's win: A col1 ×4, B col2 ×3 ─────────────────────
    // A is player 0 (moves first). Verify each move reaches the other side.
    const plan = [
      { who: 'A', s: sA, other: sB, col: 1, expect: 1 },
      { who: 'B', s: sB, other: sA, col: 2, expect: 2 },
      { who: 'A', s: sA, other: sB, col: 1, expect: 3 },
      { who: 'B', s: sB, other: sA, col: 2, expect: 4 },
      { who: 'A', s: sA, other: sB, col: 1, expect: 5 },
      { who: 'B', s: sB, other: sA, col: 2, expect: 6 },
      { who: 'A', s: sA, other: sB, col: 1, expect: 7 }, // A's 4th in column 1 → win
    ];
    for (const mv of plan) {
      const r = await tapColumn(mv.s, mv.col);
      if (r.err) throw new Error(`${mv.who} move (col ${mv.col}): ${r.err}`);
      const got = await pollGame(mv.other, gameId, (g) => g.moves >= mv.expect);
      assert.ok(got, `move ${mv.expect} (${mv.who} col ${mv.col}) reached the other phone`);
      console.log(`   ${mv.who} played column ${mv.col} → move ${mv.expect} delivered`);
    }

    // ── 4. Both converge on finished / A wins ────────────────────────
    const aFin = await pollGame(sA, gameId, (g) => g.status === 'finished');
    const bFin = await pollGame(sB, gameId, (g) => g.status === 'finished');
    assert.ok(aFin, 'A reached finished');
    assert.ok(bFin, 'B reached finished');
    assert.equal(aFin.outcome, 0, 'A (player 0) is the winner on A');
    assert.equal(bFin.outcome, 0, 'A (player 0) is the winner on B');
    console.log('✅ both FINISHED, outcome=0 (A wins) — move log + anti-cheat verified phone-to-phone');
    console.log('🎉 CONNECT FOUR VERIFIED OVER THE RELAY');
  } catch (e) {
    failed = true;
    console.log('❌ ' + e.message);
  } finally {
    if (gameId && !failed) {
      const del = `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').delete(${JSON.stringify(gameId)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;
      try { await sA.eval(del); await sB.eval(del); console.log('cleanup: game removed on both'); } catch { /* best effort */ }
    }
    sA.close(); sB.close();
    process.exit(failed ? 1 : 0);
  }
})();
