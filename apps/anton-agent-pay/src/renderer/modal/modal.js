/*
 * modal.js — renderer logic for the confirmation modal.
 *
 * Loaded via <script src="modal.js"></script> in the sandboxed
 * renderer. No bundler — vanilla ES2020 because Electron's renderer
 * supports modern syntax natively. Talks to the main process via
 * window.agentPayModal (exposed by preload.cjs).
 *
 * Spec: docs/ANTON_AGENT_PAY_SPEC.md §7.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let _payload = null;
  let _expiryInterval = null;

  function render(payload) {
    _payload = payload;
    $('agent-name').textContent = payload.agentName || '—';
    $('agent-paired-ago').textContent = payload.agentPairedAgo || '—';
    $('amount').textContent = formatFtc(payload.amountFtc) + ' FTC';
    $('to-address').textContent = payload.to || '—';
    const meta = composeAddressMeta(payload);
    if (meta) {
      $('to-meta').textContent = meta;
      $('to-meta').hidden = false;
    } else {
      $('to-meta').hidden = true;
    }
    $('fee').textContent = formatFtc(payload.feeFtc) + ' FTC';
    if (payload.agentNote) {
      $('agent-note').textContent = payload.agentNote;
      $('note-block').hidden = false;
    }
    $('balance-after').textContent = formatFtc(payload.balanceAfterFtc) + ' FTC';
    if (payload.walletHasPassphrase) {
      $('passphrase-block').hidden = false;
      setTimeout(() => { $('passphrase-input').focus(); }, 50);
    }
    startExpiryCountdown(payload.expiresAtMs);
  }

  function composeAddressMeta(payload) {
    const parts = [];
    if (payload.toLabel) parts.push(payload.toLabel);
    if (typeof payload.toSeenTimes === 'number' && payload.toSeenTimes > 0) {
      parts.push(`seen ${payload.toSeenTimes}×`);
    }
    return parts.join(' — ');
  }

  function formatFtc(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    // 4 sig figs by default; trim trailing zeros but keep at least
    // 2 decimals so 1 FTC reads as "1.00".
    return n.toFixed(Math.max(2, Math.min(8, 4))).replace(/(\.\d{2,}?)0+$/, '$1');
  }

  function startExpiryCountdown(expiresAtMs) {
    const tick = () => {
      const remaining = Math.max(0, expiresAtMs - Date.now());
      const s = Math.ceil(remaining / 1000);
      $('expires-in').textContent = s + 's';
      if (remaining === 0) {
        clearInterval(_expiryInterval);
        // The main process owns the auto-reject; we just stop updating.
      }
    };
    tick();
    _expiryInterval = setInterval(tick, 250);
  }

  function decideApprove() {
    if (_payload && _payload.walletHasPassphrase) {
      const pp = $('passphrase-input').value;
      if (!pp || pp.length === 0) {
        // Soft prompt — focus the field, don't send yet.
        $('passphrase-input').focus();
        return;
      }
      // NB: in the MVP we send the passphrase back to the main process
      // and main.ts validates it via the wallet-passphrase module. A
      // production hardening pass might prefer to hash it in the
      // renderer first — but jsdom-free hashing in a sandboxed renderer
      // is a bigger lift than it sounds, and the IPC channel is
      // process-local (no network) so the marginal benefit is small.
      window.agentPayModal.send({ kind: 'approve', passphrase: pp });
      return;
    }
    window.agentPayModal.send({ kind: 'approve' });
  }

  function decideReject(reason) {
    window.agentPayModal.send({
      kind: 'reject',
      reason: reason || 'user clicked Reject',
    });
  }

  function wireUp() {
    $('approve-btn').addEventListener('click', decideApprove);
    $('reject-btn').addEventListener('click', () => decideReject(null));

    // Esc → Reject (mirrors window-close behaviour in spec §7.3).
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') decideReject('user pressed Esc');
      if (e.key === 'Enter' && document.activeElement === $('passphrase-input')) {
        decideApprove();
      }
    });

    window.agentPayModal.onPayload(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUp);
  } else {
    wireUp();
  }
})();
