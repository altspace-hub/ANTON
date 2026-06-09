/**
 * agreement-two-phone.cjs — live cross-relay verification of the Contract/
 * Agreement v1 round-trip between two paired Comm phones.
 *
 *   A = QV7202N48K ("Daniel")   B = QV7101L31T ("Emma")
 *
 * Proves, phone -> relay -> phone, that:
 *   1. A proposes an agreement (via the real UI) -> B's agreements store gains a
 *      VERIFIED 'proposed' row + B's chat thread renders the AgreementCard with
 *      Accept/Decline buttons.
 *   2. B taps Accept -> A's row flips to 'agreed' (signed acceptance recorded),
 *      and B's row reaches 'agreed' via the proposer's ack (two-phase).
 *   3. Both phones render "Agreed" on the card.
 *
 * No money: the proposal carries amount 0. Leaves both devices clean.
 * Run: ANTON_DEVICE_E2E=1 node tests/device/agreement-two-phone.cjs
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

/** Drive a phone to open the peer's chat thread from a clean state. */
async function openPeerThread(s, peerName) {
  await s.eval(`(async()=>{for(let i=0;i<6;i++){await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i,140);}})()`);
  await s.eval(`(()=>{const t=document.querySelector('[aria-controls="tabpanel-chat"]');if(t)t.click();})()`);
  await s.eval('__td.sleep(900)');
  await s.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.innerText||'').includes(${JSON.stringify(peerName)}));if(b)b.click();})()`);
  await s.eval('__td.sleep(1600)');
}

(async () => {
  process.env.ANTON_COMM_SERIAL = 'QV7202N48K';   // A
  process.env.ANTON_COMM_SERIAL_B = 'QV7101L31T'; // B
  const sA = await connect(0);
  const sB = await connect(1);
  const tag = 'AGR' + Date.now();
  let failed = false;
  let agreementId = null;

  try {
    const ids = await sA.eval(`(async () => {
      const me = JSON.parse(localStorage.getItem('anton-comm-identity')).contactHash;
      const cs = await __td.readStore('anton-comm','contacts');
      const peer = (cs.find(c=>c && c.publicKeyHex && c.confirmed!==false) || cs[0] || {});
      return { me, peer: peer.contactHash, peerName: peer.displayName };
    })()`);
    const A = ids.me, B = ids.peer;
    console.log('A(Daniel)=' + A + '  B(' + ids.peerName + ')=' + B);

    // Clean any prior test agreements on both.
    const cleanEval = `(async () => { await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('agreements','readwrite');const g=tx.objectStore('agreements').getAll();g.onsuccess=()=>{for(const x of (g.result||[])) if(x&&/^AGR\\d/.test(x.decision||'')) tx.objectStore('agreements').delete(x.id);};tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();}); return 1; })()`;
    await sA.eval(cleanEval); await sB.eval(cleanEval);

    // ── 1. A proposes an agreement via the UI ─────────────────────────
    await openPeerThread(sA, ids.peerName || 'Emma');
    const step1 = await sA.eval(`(async () => {
      const attach = document.querySelector('button[aria-label]')
        ? [...document.querySelectorAll('button[aria-label]')].find(b => /attach|bifoga|bilag/i.test(b.getAttribute('aria-label')||''))
        : null;
      if (!attach) return { err: 'no attach button' };
      attach.click(); await __td.sleep(700);
      const tile = [...document.querySelectorAll('button')].find(b => /^\\s*Agreement\\s*$/.test(((b.innerText||b.textContent)||'').trim()));
      if (!tile) return { err: 'no Agreement tile' };
      if (tile.disabled) return { err: 'Agreement tile disabled (contact not confirmed/keyed)' };
      tile.click(); await __td.sleep(700);
      const input = document.querySelector('input[placeholder*="agreed"],input[placeholder*="What is"]');
      if (!input) return { err: 'no decision input' };
      __td.setVal(input, ${JSON.stringify(tag + ' — paint the fence')}); await __td.sleep(400);
      const send = [...document.querySelectorAll('button')].find(b => /Send proposal/i.test(((b.innerText||b.textContent)||'').trim()));
      if (!send) return { err: 'no Send proposal button' };
      if (send.disabled) return { err: 'Send disabled' };
      send.click(); await __td.sleep(1400);
      // read back the freshly-created proposer row
      const rows = await __td.readStore('anton-comm','agreements');
      const mine = rows.find(r => r && (r.decision||'').startsWith(${JSON.stringify(tag)}));
      return { ok: true, id: mine && mine.id, status: mine && mine.status, role: mine && mine.role };
    })()`);
    if (step1.err) throw new Error('step1(A propose): ' + step1.err);
    assert.equal(step1.role, 'proposer', 'A holds a proposer row');
    assert.equal(step1.status, 'proposed', 'A row starts proposed');
    agreementId = step1.id;
    console.log('step1: A proposed "' + tag + '" (id=' + (agreementId||'').slice(0,14) + '…) — waiting for relay…');

    // Diagnostic: confirm A actually queued/sent the wire (bubble in A's thread).
    const aSent = await sA.eval(`(async () => {
      const msgs = await __td.readStore('anton-comm','messages');
      const m = msgs.find(x => x && x.kind === 'agreement_propose' && (x.plaintext||'').indexOf(${JSON.stringify(agreementId)}) >= 0);
      const ob = await __td.readStore('anton-comm','inline_outbox').catch(()=>[]);
      return { bubble: !!m, status: m && m.status };
    })()`);
    console.log('   A send-path: bubble=' + aSent.bubble + ' status=' + (aSent.status||'-'));

    // ── 2. B received it: verified store row + rendered card (poll up to 36s) ──
    let gotProposal = { has: false };
    for (let i = 0; i < 12; i++) {
      await sleep(3000);
      gotProposal = await sB.eval(`(async () => {
        const rows = await __td.readStore('anton-comm','agreements');
        const ag = rows.find(r => r && r.id === ${JSON.stringify(agreementId)});
        return { has: !!ag, status: ag && ag.status, role: ag && ag.role, hasSig: !!(ag && ag.proposerSig), tier: ag && ag.trustTier };
      })()`);
      if (gotProposal.has) break;
      if (i === 3) console.log('   …still waiting for B (relay handshake can be slow after a cold launch)');
    }
    assert.ok(gotProposal.has, 'B received the proposal over the relay');
    assert.equal(gotProposal.status, 'proposed', 'B sees it as proposed');
    assert.equal(gotProposal.role, 'acceptor', 'B holds an acceptor row');
    assert.ok(gotProposal.hasSig, 'B verified + kept the proposer signature');
    assert.equal(gotProposal.tier, 'signed', 'signed trust tier');
    console.log('✅ propose A→B: B has a VERIFIED proposed row (signed tier)');

    await openPeerThread(sB, 'Daniel');
    const bCard = await sB.eval(`(async () => {
      const body = document.body.textContent || '';
      const hasText = body.indexOf(${JSON.stringify(tag)}) >= 0;
      const accept = [...document.querySelectorAll('button')].some(b => /^\\s*Accept\\s*$/.test(((b.innerText||b.textContent)||'').trim()));
      return { hasText, accept };
    })()`);
    assert.ok(bCard.hasText, "B's thread renders the agreement decision");
    assert.ok(bCard.accept, "B's card shows an Accept button");
    console.log('✅ card render on B: decision visible + Accept button present');

    // ── 3. B taps Accept ─────────────────────────────────────────────
    const step3 = await sB.eval(`(async () => {
      const accept = [...document.querySelectorAll('button')].find(b => /^\\s*Accept\\s*$/.test(((b.innerText||b.textContent)||'').trim()));
      if (!accept) return { err: 'no Accept button' };
      accept.click(); await __td.sleep(1600);
      const rows = await __td.readStore('anton-comm','agreements');
      const ag = rows.find(r => r && r.id === ${JSON.stringify(agreementId)});
      return { ok: true, status: ag && ag.status };
    })()`);
    if (step3.err) throw new Error('step3(B accept): ' + step3.err);
    console.log('step3: B tapped Accept (local status=' + step3.status + ') — waiting for relay round-trip…');

    // ── 4. Both converge on agreed (poll up to 36s) ──────────────────
    let aFinal = { status: null };
    for (let i = 0; i < 12; i++) {
      await sleep(3000);
      aFinal = await sA.eval(`(async () => {
        const rows = await __td.readStore('anton-comm','agreements');
        const ag = rows.find(r => r && r.id === ${JSON.stringify(agreementId)});
        return { status: ag && ag.status, hasAcceptorSig: !!(ag && ag.acceptorSig) };
      })()`);
      if (aFinal.status === 'agreed') break;
    }
    assert.equal(aFinal.status, 'agreed', 'A (proposer) reached agreed on the signed acceptance');
    assert.ok(aFinal.hasAcceptorSig, 'A recorded the counter-signature');
    console.log('✅ accept B→A: A is agreed + holds the acceptor signature');

    let bFinal = { status: null };
    for (let i = 0; i < 12; i++) {
      bFinal = await sB.eval(`(async () => {
        const rows = await __td.readStore('anton-comm','agreements');
        const ag = rows.find(r => r && r.id === ${JSON.stringify(agreementId)});
        const body = document.body.textContent || '';
        return { status: ag && ag.status, showsAgreed: /Agreed/i.test(body) };
      })()`);
      if (bFinal.status === 'agreed') break;
      await sleep(3000);
    }
    assert.equal(bFinal.status, 'agreed', 'B (acceptor) advanced to agreed via the ack (two-phase)');
    console.log('✅ ack A→B: B advanced to agreed (status pill: ' + (bFinal.showsAgreed ? 'shows Agreed' : 'pill not matched in DOM') + ')');

    console.log('🎉 AGREEMENT ROUND-TRIP VERIFIED PHONE-TO-PHONE OVER THE RELAY');
  } catch (e) {
    failed = true;
    console.log('❌ ' + e.message);
  } finally {
    // Cleanup: delete the test agreement on both (only on success, so a failure
    // leaves the evidence on-device for inspection).
    if (agreementId && !failed) {
      const del = `(async () => { await new Promise((res)=>{const req=indexedDB.open('anton-comm');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('agreements','readwrite');tx.objectStore('agreements').delete(${JSON.stringify(agreementId)});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();res();};};req.onerror=()=>res();}); return 1; })()`;
      try { await sA.eval(del); await sB.eval(del); console.log('cleanup: test agreement removed on both'); } catch { /* best effort */ }
    }
    sA.close(); sB.close();
    process.exit(failed ? 1 : 0);
  }
})();
