/**
 * agreement-counter-two-phone.cjs — live cross-relay verification of the COUNTER
 * negotiation loop between two paired Comm phones.
 *
 *   A = QV7202N48K ("Daniel")   B = QV7101L31T ("Emma")
 *
 *   1. A proposes an agreement (via UI).
 *   2. B COUNTERS with revised terms (via the card's Counter button + composer).
 *      → A receives the counter: A's row flips role to 'acceptor' on the NEW head
 *        with B's revised terms.
 *   3. A ACCEPTS the counter → both converge on 'agreed' with the counter terms.
 *
 * No money (amount 0). Leaves both devices clean. Run:
 * ANTON_DEVICE_E2E=1 node tests/device/agreement-counter-two-phone.cjs
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
  await s.eval('__td.sleep(1600)');
}

async function pollRow(s, agreementId, pred, tries = 12) {
  for (let i = 0; i < tries; i++) {
    await sleep(3000);
    const r = await s.eval(`(async()=>{const rows=await __td.readStore('anton-comm','agreements');const a=rows.find(r=>r&&r.id===${JSON.stringify(agreementId)});return a?{status:a.status,role:a.role,decision:a.decision,seq:a.seq}:null;})()`);
    if (r && pred(r)) return r;
  }
  return null;
}

(async () => {
  process.env.ANTON_COMM_SERIAL = 'QV7202N48K';
  process.env.ANTON_COMM_SERIAL_B = 'QV7101L31T';
  const sA = await connect(0);
  const sB = await connect(1);
  const tag = 'CTR' + Date.now();
  const counterDecision = tag + ' — revised: 600 not 800';
  let failed = false; let agreementId = null;

  try {
    const peerName = (await sA.eval(`(async()=>{const cs=await __td.readStore('anton-comm','contacts');const p=cs.find(c=>c&&c.publicKeyHex&&c.confirmed!==false)||cs[0]||{};return p.displayName;})()`)) || 'Emma';

    const cleanEval = `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('agreements','readwrite');const g=tx.objectStore('agreements').getAll();g.onsuccess=()=>{for(const x of (g.result||[])) if(x&&/^CTR\\d/.test(x.decision||'')) tx.objectStore('agreements').delete(x.id);};tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;
    await sA.eval(cleanEval); await sB.eval(cleanEval);

    // 1. A proposes.
    await openPeerThread(sA, peerName);
    const step1 = await sA.eval(`(async()=>{
      const attach=[...document.querySelectorAll('button[aria-label]')].find(b=>/attach|bifoga|bilag/i.test(b.getAttribute('aria-label')||''));
      if(!attach) return {err:'no attach'};
      attach.click(); await __td.sleep(700);
      const tile=[...document.querySelectorAll('button')].find(b=>/^\\s*Agreement\\s*$/.test(((b.innerText||b.textContent)||'').trim()));
      if(!tile||tile.disabled) return {err:'no/disabled Agreement tile'};
      tile.click(); await __td.sleep(700);
      const input=document.querySelector('input[placeholder*="agreed"],input[placeholder*="What is"]');
      if(!input) return {err:'no decision input'};
      __td.setVal(input, ${JSON.stringify(tag + ' — original: pay 800')}); await __td.sleep(400);
      const send=[...document.querySelectorAll('button')].find(b=>/Send proposal/i.test(((b.innerText||b.textContent)||'').trim()));
      if(!send||send.disabled) return {err:'no Send proposal'};
      send.click(); await __td.sleep(1400);
      const rows=await __td.readStore('anton-comm','agreements');
      const mine=rows.find(r=>r&&(r.decision||'').startsWith(${JSON.stringify(tag)}));
      return {ok:true,id:mine&&mine.id};
    })()`);
    if (step1.err) throw new Error('A propose: ' + step1.err);
    agreementId = step1.id;
    console.log('1. A proposed ' + tag + ' (id=' + (agreementId||'').slice(0,12) + '…)');

    const bGot = await pollRow(sB, agreementId, (r) => r.status === 'proposed' && r.role === 'acceptor');
    assert.ok(bGot, 'B received the proposal');
    console.log('   B received it (acceptor, proposed)');

    // 2. B counters.
    await openPeerThread(sB, 'Daniel');
    const step2 = await sB.eval(`(async()=>{
      const counter=[...document.querySelectorAll('button')].find(b=>/^\\s*Counter\\s*$/.test(((b.innerText||b.textContent)||'').trim()));
      if(!counter) return {err:'no Counter button'};
      counter.click(); await __td.sleep(700);
      const input=document.querySelector('input[placeholder*="agreed"],input[placeholder*="What is"]');
      if(!input) return {err:'no counter input'};
      __td.setVal(input, ${JSON.stringify(counterDecision)}); await __td.sleep(400);
      const send=[...document.querySelectorAll('button')].find(b=>/Send counter/i.test(((b.innerText||b.textContent)||'').trim()));
      if(!send||send.disabled) return {err:'no Send counter'};
      send.click(); await __td.sleep(1500);
      const rows=await __td.readStore('anton-comm','agreements');
      const a=rows.find(r=>r&&r.id===${JSON.stringify(agreementId)});
      return {ok:true,role:a&&a.role,seq:a&&a.seq,decision:a&&a.decision};
    })()`);
    if (step2.err) throw new Error('B counter: ' + step2.err);
    assert.equal(step2.role, 'proposer', 'B is now the proposer of the counter');
    assert.equal(step2.seq, 1, 'counter is seq 1');
    console.log('2. B countered → "' + counterDecision + '" (B now proposer, seq 1)');

    // A receives the counter: role flips to acceptor on the new head + new terms.
    const aGotCounter = await pollRow(sA, agreementId, (r) => r.role === 'acceptor' && r.seq === 1 && (r.decision || '').includes('revised'));
    assert.ok(aGotCounter, 'A received the counter (acceptor of the new head, new terms)');
    console.log('   A received the counter (acceptor, seq 1, revised terms)');

    // 3. A accepts the counter.
    await openPeerThread(sA, peerName);
    const step3 = await sA.eval(`(async()=>{
      const accept=[...document.querySelectorAll('button')].find(b=>/^\\s*Accept\\s*$/.test(((b.innerText||b.textContent)||'').trim()));
      if(!accept) return {err:'no Accept button on the counter'};
      accept.click(); await __td.sleep(1600);
      return {ok:true};
    })()`);
    if (step3.err) throw new Error('A accept counter: ' + step3.err);
    console.log('3. A accepted the counter — waiting for convergence…');

    const aFinal = await pollRow(sA, agreementId, (r) => r.status === 'agreed');
    const bFinal = await pollRow(sB, agreementId, (r) => r.status === 'agreed');
    assert.ok(aFinal, 'A reached agreed on the counter terms');
    assert.ok(bFinal, 'B reached agreed (via the ack)');
    assert.ok((aFinal.decision || '').includes('revised'), 'the agreed terms are the COUNTER terms, not the original');
    console.log('✅ both AGREED on the counter terms (A seq=' + aFinal.seq + ', B seq=' + bFinal.seq + ')');
    console.log('🎉 COUNTER NEGOTIATION VERIFIED PHONE-TO-PHONE OVER THE RELAY');
  } catch (e) {
    failed = true;
    console.log('❌ ' + e.message);
  } finally {
    if (agreementId && !failed) {
      const del = `(async()=>{await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('agreements','readwrite');tx.objectStore('agreements').delete(${JSON.stringify(agreementId)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();});return 1;})()`;
      try { await sA.eval(del); await sB.eval(del); console.log('cleanup: removed on both'); } catch { /* best effort */ }
    }
    sA.close(); sB.close();
    process.exit(failed ? 1 : 0);
  }
})();
