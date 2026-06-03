/**
 * two-phone-collab.cjs — live cross-relay verification of the #81/#82 wires
 * between two paired Comm phones over wss://relay.futurechain.eu.
 *
 *   A = QV7202N48K ("Daniel", ANTON-2S6G…)   B = QV7101L31T ("Emma", ANTON-55MM…)
 *
 * Proves the new ephemeral wires actually round-trip phone→relay→phone:
 *   1. A invites B to an event (event_invite)         → B's events store gains it
 *   2. B posts an in-event note (event_note)          → A's event_notes gains it
 *   3. A sets a profile avatar, broadcast on reconnect → B's contact row for A
 *      gains avatarImage (profile wire)
 *
 * Run: ANTON_DEVICE_E2E=1 node tests/device/two-phone-collab.cjs
 * Leaves both devices clean (deletes the test event/notes; clears A's avatar).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('./lib/devices.cjs');
const { CdpSession } = require('./lib/cdp.cjs');
const { install } = require('./lib/dom-driver.cjs');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(idx) {
  const comm = await forwardApp('comm', idx);
  const s = new CdpSession(comm.wsUrl);
  await install(s);
  return s;
}

(async () => {
  process.env.ANTON_COMM_SERIAL = 'QV7202N48K';   // A
  process.env.ANTON_COMM_SERIAL_B = 'QV7101L31T'; // B
  let sA = await connect(0);
  let sB = await connect(1);
  const tag = 'TP' + Date.now();
  const evId = 'EVT' + tag;
  let failed = false;
  try {
    // Identities + a clean slate of prior test events on both phones.
    const ids = await sA.eval(`(async () => {
      const me = JSON.parse(localStorage.getItem('anton-comm-identity')).contactHash;
      const cs = await __td.readStore('anton-comm','contacts');
      return { me, peer: (cs[0]||{}).contactHash };
    })()`);
    const A = ids.me, B = ids.peer;
    console.log('A(Daniel)=' + A + '  B(Emma)=' + B);

    const cleanEval = `(async () => {
      await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction(['events','event_notes'],'readwrite');const e=tx.objectStore('events').getAll();e.onsuccess=()=>{for(const x of (e.result||[])) if(x&&/^TP\\d/.test(x.title||'')) tx.objectStore('events').delete(x.id);};const n=tx.objectStore('event_notes').getAll();n.onsuccess=()=>{for(const x of (n.result||[])) if(x&&/^EVTTP\\d/.test(x.eventId||'')) tx.objectStore('event_notes').delete(x.id);};tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});
      return 1;
    })()`;
    await sA.eval(cleanEval); await sB.eval(cleanEval);

    // ── 1. A invites B to an event (event_invite A→B) ─────────────────
    const step1 = await sA.eval(`(async () => {
      const me = JSON.parse(localStorage.getItem('anton-comm-identity')).contactHash;
      await new Promise((res,rej)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('events','readwrite');tx.objectStore('events').put({id:${JSON.stringify(evId)},createdBy:me,title:${JSON.stringify(tag)},eventType:'dinner',startAt:new Date(Date.now()+86400000).toISOString(),allDay:false,location:'Bistro',description:'plan',invitees:[me],rsvps:{[me]:'going'},myStatus:'going',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),canceled:false});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();rej(tx.error);};};req.onerror=()=>rej(req.error);});
      for (let i=0;i<5;i++){ await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 120); }
      const et = document.querySelector('[aria-controls=tabpanel-events]'); if (et) et.click(); await __td.sleep(1200);
      if ((document.body.textContent||'').indexOf(${JSON.stringify(tag)}) < 0) return { err: 'event not in A list' };
      await __td.clickText(new RegExp(${JSON.stringify(tag)}), 1000);
      const add = [...document.querySelectorAll('button')].find(b => /Lägg till personer|Add people/i.test(((b.innerText||b.textContent)||'').trim()));
      if (!add) return { err: 'no Add-people chip' };
      add.click(); await __td.sleep(800);
      const emma = [...document.querySelectorAll('button')].find(b => /Emma/.test((b.textContent||'')));
      if (!emma) return { err: 'Emma not in picker' };
      emma.click(); await __td.sleep(300);
      const invite = [...document.querySelectorAll('button')].find(b => /^\\s*Bjud in\\s*$|^\\s*Invite\\s*$/i.test(((b.innerText||b.textContent)||'').trim()));
      if (!invite) return { err: 'no Invite button' };
      if (invite.disabled) return { err: 'Invite disabled (Emma not selected)' };
      invite.click(); await __td.sleep(1200);
      return { ok: true };
    })()`);
    if (step1.err) throw new Error('step1(A invite): ' + step1.err);
    console.log('step1: A invited Emma to event ' + tag + ' — waiting for relay…');
    await sleep(9000);

    const gotInvite = await sB.eval(`(async () => {
      const rows = await __td.readStore('anton-comm','events');
      const ev = rows.find(r => r && r.id === ${JSON.stringify(evId)});
      return { has: !!ev, title: ev && ev.title, createdBy: ev && ev.createdBy };
    })()`);
    assert.ok(gotInvite.has, 'B received the event invite over the relay');
    assert.equal(gotInvite.title, tag, 'B sees the right event title');
    console.log('✅ event_invite A→B: B received "' + tag + '" (created by ' + (gotInvite.createdBy||'').slice(0,12) + '…)');

    // ── 2. B posts an in-event note (event_note B→A) ──────────────────
    const step2 = await sB.eval(`(async () => {
      for (let i=0;i<5;i++){ await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 120); }
      const et = document.querySelector('[aria-controls=tabpanel-events]'); if (et) et.click(); await __td.sleep(1200);
      if ((document.body.textContent||'').indexOf(${JSON.stringify(tag)}) < 0) return { err: 'event not in B list' };
      await __td.clickText(new RegExp(${JSON.stringify(tag)}), 1000);
      const ta = document.querySelector('textarea[placeholder*="anteckning"],textarea[placeholder*="note"]');
      if (!ta) return { err: 'no note composer on B' };
      __td.setVal(ta, 'Cake by Emma'); await __td.sleep(550);
      const send = [...document.querySelectorAll('button')].find(b => /^\\s*Skicka\\s*$|^\\s*Send\\s*$/i.test(((b.innerText||b.textContent)||'').trim()));
      if (!send || send.disabled) return { err: 'note send missing/disabled' };
      send.click(); await __td.sleep(1000);
      return { ok: true };
    })()`);
    if (step2.err) throw new Error('step2(B note): ' + step2.err);
    console.log('step2: B posted a note — waiting for relay…');
    await sleep(9000);

    const gotNote = await sA.eval(`(async () => {
      const rows = await __td.readStore('anton-comm','event_notes');
      const mine = rows.filter(r => r && r.eventId === ${JSON.stringify(evId)});
      return { count: mine.length, text: (mine[0]||{}).text, from: (mine[0]||{}).fromHash };
    })()`);
    assert.equal(gotNote.count, 1, 'A received the event note over the relay');
    assert.equal(gotNote.text, 'Cake by Emma', 'A sees the note text');
    assert.equal(gotNote.from, B, 'note is attributed to Emma (relay-stamped)');
    console.log('✅ event_note B→A: A received "Cake by Emma" from Emma');

    // ── 3. A sets an avatar → broadcast on reconnect → B's contact ────
    await sA.eval(`(() => { const id = JSON.parse(localStorage.getItem('anton-comm-identity')); id.avatarImage = ${JSON.stringify(PNG)}; id.avatarMime = 'image/png'; localStorage.setItem('anton-comm-identity', JSON.stringify(id)); setTimeout(() => location.reload(), 120); return 1; })()`);
    sA.close();
    console.log('step3: A set avatar + reloading to broadcast…');
    await sleep(5000);
    sA = await connect(0);          // reattach to the reloaded page
    await sleep(9000);              // relay connect + broadcastProfile → B

    const gotAvatar = await sB.eval(`(async () => {
      const cs = await __td.readStore('anton-comm','contacts');
      const daniel = cs.find(c => c && c.contactHash === ${JSON.stringify(A)});
      return { has: !!(daniel && daniel.avatarImage), mime: daniel && daniel.avatarMime };
    })()`);
    assert.ok(gotAvatar.has, "B's contact row for Daniel gained the avatar over the relay");
    console.log('✅ profile A→B: B now shows the Daniel avatar (' + (gotAvatar.mime || '') + ')');

    console.log('🎉 ALL THREE WIRES VERIFIED PHONE-TO-PHONE OVER THE RELAY');
  } catch (e) {
    failed = true;
    console.log('❌ ' + e.message);
  } finally {
    // Cleanup: clear A's avatar (+ rebroadcast) and delete the test event/notes on both.
    try {
      await sA.eval(`(() => { const id = JSON.parse(localStorage.getItem('anton-comm-identity')); delete id.avatarImage; delete id.avatarMime; localStorage.setItem('anton-comm-identity', JSON.stringify(id)); setTimeout(() => location.reload(), 120); return 1; })()`);
      const del = `(async () => { await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction(['events','event_notes'],'readwrite');tx.objectStore('events').delete(${JSON.stringify(evId)});const ix=tx.objectStore('event_notes').index('by_event').getAllKeys(${JSON.stringify(evId)});ix.onsuccess=()=>{for(const k of ix.result) tx.objectStore('event_notes').delete(k);};tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1; })()`;
      await sB.eval(del);
      console.log('cleanup: avatar cleared on A (rebroadcast), event/notes removed on B');
    } catch { /* best effort */ }
    sA.close(); sB.close();
    process.exit(failed ? 1 : 0);
  }
})();
