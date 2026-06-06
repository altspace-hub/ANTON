/**
 * comm-call.e2e.cjs — Wave-3 calling: the ONE thing only a device can prove.
 *
 * A real WebRTC LOOPBACK inside phone A's WebView — two RTCPeerConnections exchanging
 * offer/answer/ICE (with the same public-STUN config call.ts uses) and reaching
 * connectionState 'connected', with a real media track flowing. This proves the
 * WebView actually does WebRTC + ICE + media negotiation. (A real 2-phone call needs
 * both phones on this build — phone B is stale — so it's out of scope here.)
 * Also asserts the chat header exposes the voice + video call buttons.
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone (Swedish locale).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-call',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    try {
      // ── 1. Real WebRTC loopback in the WebView ──────────────────────────
      const rtc = await s.eval(`(async () => {
        if (typeof RTCPeerConnection === 'undefined') return { hasRTC: false };
        const ice = [{ urls: ['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302'] }];
        const pc1 = new RTCPeerConnection({ iceServers: ice });
        const pc2 = new RTCPeerConnection({ iceServers: ice });
        pc1.onicecandidate = (e) => { if (e.candidate) pc2.addIceCandidate(e.candidate).catch(()=>{}); };
        pc2.onicecandidate = (e) => { if (e.candidate) pc1.addIceCandidate(e.candidate).catch(()=>{}); };
        let remoteGotTrack = false;
        pc2.ontrack = () => { remoteGotTrack = true; };
        // Synthetic video track (canvas) — avoids a camera-permission prompt.
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        const cx = canvas.getContext('2d'); cx.fillStyle = '#2DD4A8'; cx.fillRect(0,0,64,64);
        const stream = canvas.captureStream(8);
        stream.getTracks().forEach((t) => pc1.addTrack(t, stream));
        const offer = await pc1.createOffer(); await pc1.setLocalDescription(offer); await pc2.setRemoteDescription(offer);
        const answer = await pc2.createAnswer(); await pc2.setLocalDescription(answer); await pc1.setRemoteDescription(answer);
        const ok = await new Promise((res) => {
          const check = () => { if (pc1.connectionState === 'connected' && pc2.connectionState === 'connected') res(true); };
          pc1.onconnectionstatechange = check; pc2.onconnectionstatechange = check;
          setTimeout(() => res(false), 9000);
        });
        const out = { hasRTC: true, hasGUM: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia), pc1: pc1.connectionState, pc2: pc2.connectionState, ice1: pc1.iceConnectionState, ice2: pc2.iceConnectionState, remoteGotTrack, connected: ok };
        pc1.close(); pc2.close();
        return out;
      })()`);
      if (!rtc.hasRTC) throw new Error('RTCPeerConnection not available in the WebView');
      assert.ok(rtc.hasGUM, 'navigator.mediaDevices.getUserMedia is available');
      assert.ok(rtc.connected, `WebRTC loopback reached connected (pc1=${rtc.pc1} pc2=${rtc.pc2} ice1=${rtc.ice1} ice2=${rtc.ice2})`);
      assert.ok(rtc.remoteGotTrack, 'a media track flowed to the remote peer');
      log(`WebRTC loopback: pc1=${rtc.pc1} pc2=${rtc.pc2} track=${rtc.remoteGotTrack} gUM=${rtc.hasGUM}`);

      // ── 2. Call buttons present in a 1:1 chat header ────────────────────
      const ui = await s.eval(`(async () => {
        for (let j = 0; j < 3; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150);
        let tab = document.querySelector('[aria-controls="tabpanel-chat"]');
        if (!tab) return { err: 'no chat tab' };
        tab.click(); await __td.sleep(500);
        const contacts = await __td.readStore('anton-comm', 'contacts');
        if (!contacts.length) return { err: 'no contacts' };
        const target = contacts[0];
        const rows = [...document.querySelectorAll('button')].filter((b) => (b.innerText || '').includes(target.displayName));
        const row = rows.find((b) => b.querySelector('*')) || rows[0];
        if (!row) return { err: 'contact row not found' };
        row.click(); await __td.sleep(800);
        const voice = [...document.querySelectorAll('button')].some((b) => /Röstsamtal|Voice call/i.test(b.getAttribute('aria-label') || ''));
        const video = [...document.querySelectorAll('button')].some((b) => /Videosamtal|Video call/i.test(b.getAttribute('aria-label') || ''));
        return { voice, video };
      })()`);
      if (ui.err) throw new Error(ui.err);
      assert.ok(ui.voice, 'voice-call button present in the chat header');
      assert.ok(ui.video, 'video-call button present in the chat header');
      log(`call buttons: voice=${ui.voice} video=${ui.video}`);
    } finally {
      s.close();
    }
  },
};
