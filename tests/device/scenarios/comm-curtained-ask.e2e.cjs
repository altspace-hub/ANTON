/**
 * comm-curtained-ask.e2e.cjs — Pulse Curtained Ask, answerer side (single funded
 * Comm phone, idempotent, no network).
 *
 * The A→B wire + signature path is covered by unit tests (pulse-curtained-ask).
 * Here we verify the ANSWERER's on-device flow that can't be unit-tested: a
 * received ask (injected straight into the pulse_asks store) surfaces a badge,
 * renders in the inbox, opens the composer with the question + curtain toggle,
 * and — on publish — embeds the ask in the pulse_posts row (LOCAL copy keeps the
 * asker name) while flipping the ask to status='answered'.
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone (Swedish locale).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const ASK_ID = 'e2e-ask-fixture-1';
const QUESTION = 'E2E Curtained question — pivot or persevere?';
const ANSWER = 'E2E answer body';

module.exports = {
  name: 'comm-curtained-ask',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    try {
      const r = await s.eval(`(async () => {
        // resume-robust nav to the Pulse tab
        let tab = null;
        for (let i = 0; i < 12 && !tab; i++) {
          for (let j = 0; j < 3; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150);
          tab = document.querySelector('[aria-controls="tabpanel-pulse"]');
          if (!tab) await __td.sleep(400);
        }
        if (!tab) return { err: 'pulse tab never appeared (app not resumed?)' };
        tab.click(); await __td.sleep(700);

        // Inject a received ask straight into pulse_asks (idempotent). Raw IDB put;
        // the verify ladder already ran when a real ask arrives — the inbox only reads.
        const putAsk = (rec) => new Promise((resolve, reject) => {
          const req = indexedDB.open('anton-comm');
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('pulse_asks')) { db.close(); return reject(new Error('pulse_asks store missing — DB not at v16')); }
            const tx = db.transaction('pulse_asks', 'readwrite');
            tx.objectStore('pulse_asks').put(rec);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
          };
          req.onerror = () => reject(req.error);
        });

        let asks = await __td.readStore('anton-comm', 'pulse_asks');
        let existing = asks.find((a) => a.id === ${JSON.stringify(ASK_ID)});
        const had = !!existing && existing.status === 'answered';
        if (!existing) {
          await putAsk({
            id: ${JSON.stringify(ASK_ID)}, askerHash: 'ANTON-E2E-ASKER', askerName: 'Curtain Tester',
            askerPubkey: 'ab'.repeat(32), question: ${JSON.stringify(QUESTION)}, curtain: true,
            createdAt: new Date().toISOString(), sig: 'e2e-sig', status: 'open', receivedAt: new Date().toISOString(),
          });
          await __td.sleep(300);
          // bounce the tab so the feed re-reads the badge count
          const chat = document.querySelector('[aria-controls="tabpanel-chat"]'); if (chat) { chat.click(); await __td.sleep(400); }
          tab = document.querySelector('[aria-controls="tabpanel-pulse"]'); tab.click(); await __td.sleep(800);
        }

        // Open the asks inbox (header message-icon button, aria-label = Frågor/Questions)
        if (existing && existing.status === 'answered') {
          // already answered on a prior run — just assert the post embed below
        } else {
          const inboxBtn = [...document.querySelectorAll('button')].find((b) => /Frågor|Questions/i.test(b.getAttribute('aria-label') || ''));
          if (!inboxBtn) return { err: 'asks inbox header button not found' };
          inboxBtn.click(); await __td.sleep(800);

          const inboxText = document.body.innerText || '';
          const askVisible = inboxText.includes(${JSON.stringify(QUESTION)});

          // Tap Answer/Svara on the injected ask
          const answerBtn = [...document.querySelectorAll('button')].find((b) => /^(Svara|Answer)$/.test((b.innerText || '').trim()));
          if (!answerBtn) return { err: 'Answer button not found in inbox', askVisible };
          answerBtn.click(); await __td.sleep(900);

          // Composer should show the question header + a curtain toggle ("Svarar — frågeställaren dold")
          const composeText = document.body.innerText || '';
          const questionShown = composeText.includes(${JSON.stringify(QUESTION)});
          const curtainShown = /frågeställaren dold|asker hidden|Frågeställarens namn/i.test(composeText);

          const ta = document.querySelector('textarea');
          if (!ta) return { err: 'compose textarea not found', askVisible, questionShown };
          __td.setVal(ta, ${JSON.stringify(ANSWER)}); await __td.sleep(400);
          const post = [...document.querySelectorAll('button')].find((b) => /^(Post|Publicera)$/.test((b.innerText || '').trim()) && !b.disabled);
          if (!post) return { err: 'post submit not found/enabled', askVisible, questionShown };
          post.click(); await __td.sleep(1800);

          var flags = { askVisible, questionShown, curtainShown };
        }

        const posts = await __td.readStore('anton-comm', 'pulse_posts');
        const answered = posts.find((p) => p.ask && p.ask.askId === ${JSON.stringify(ASK_ID)});
        asks = await __td.readStore('anton-comm', 'pulse_asks');
        const askRow = asks.find((a) => a.id === ${JSON.stringify(ASK_ID)});
        return {
          had,
          flags: typeof flags !== 'undefined' ? flags : null,
          postFound: !!answered,
          postAskCurtain: answered ? answered.ask.curtain : null,
          postAskName: answered ? answered.ask.askerName : null,
          postAskQuestion: answered ? answered.ask.question : null,
          askStatus: askRow ? askRow.status : null,
          askAnsweredPostId: askRow ? askRow.answeredPostId : null,
        };
      })()`);
      if (r.err) throw new Error(`${r.err} ${JSON.stringify(r)}`);
      if (r.flags) {
        assert.ok(r.flags.askVisible, 'injected ask question renders in the inbox');
        assert.ok(r.flags.questionShown, 'composer shows the question being answered');
        assert.ok(r.flags.curtainShown, 'composer shows the curtain toggle for a curtained ask');
      }
      assert.ok(r.postFound, 'published post embeds the ask (pulse_posts row carries ask.askId)');
      assert.equal(r.postAskCurtain, true, 'LOCAL post embed keeps the curtain flag');
      assert.equal(r.postAskName, 'Curtain Tester', 'LOCAL post embed keeps full attribution (asker name)');
      assert.equal(r.postAskQuestion, QUESTION, 'embedded question matches');
      assert.equal(r.askStatus, 'answered', 'the ask flips to status=answered after publishing');
      assert.ok(r.askAnsweredPostId, 'the ask records which post answered it');
      log(`ask ${r.had ? 'already answered' : 'answered now'}; post embed curtain=${r.postAskCurtain} name="${r.postAskName}"; askStatus=${r.askStatus}`);
    } finally {
      s.close();
    }
  },
};
