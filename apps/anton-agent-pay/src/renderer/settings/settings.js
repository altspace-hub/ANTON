/*
 * settings.js — vanilla-JS renderer for the Settings window.
 * Spec: docs/ANTON_AGENT_PAY_SPEC.md §10 (renderer/settings/)
 *
 * Each tab is a panel; flows (create/import/show-recovery/passphrase
 * prompts/delete confirm) render into the wallet panel's `#wallet-flow`
 * region as transient subviews. No framework — just direct DOM.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const api = window.agentPaySettings;

  // ── Tab switching ───────────────────────────────────────────

  document.addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('tab-active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('panel-active'));
    t.classList.add('tab-active');
    const tab = t.dataset.tab;
    $(`panel-${tab}`).classList.add('panel-active');
    if (tab === 'agents') refreshPaired();
    if (tab === 'network') loadBootInfo();
  });

  // ── Wallet panel ────────────────────────────────────────────

  function showMsg(panel, text, kind) {
    const id = panel === 'agents' ? 'agents-msg' : 'wallet-msg';
    const el = $(id);
    el.textContent = text;
    el.className = 'msg' + (kind ? ' msg-' + kind : '');
    el.hidden = false;
  }
  function clearMsg(panel) {
    const id = panel === 'agents' ? 'agents-msg' : 'wallet-msg';
    $(id).hidden = true;
  }
  function clearFlow() { $('wallet-flow').innerHTML = ''; }

  async function refreshWallet() {
    clearFlow();
    clearMsg('wallet');
    const info = await api.walletInfo();
    if (!info.exists) {
      $('wallet-empty').hidden = false;
      $('wallet-present').hidden = true;
      return;
    }
    $('wallet-empty').hidden = true;
    $('wallet-present').hidden = false;
    $('wallet-address').textContent = info.address;
    if (info.hasPassphrase) {
      $('wallet-pass-status').textContent = 'Set (required to sign + show recovery)';
      $('btn-passphrase').hidden = true;
      $('btn-change-passphrase').hidden = false;
      $('btn-remove-passphrase').hidden = false;
    } else {
      $('wallet-pass-status').textContent = 'Not set';
      $('btn-passphrase').hidden = false;
      $('btn-change-passphrase').hidden = true;
      $('btn-remove-passphrase').hidden = true;
    }
  }

  function flowCreate() {
    clearMsg('wallet'); clearFlow();
    const f = document.createElement('div');
    f.className = 'flow';
    f.innerHTML = `
      <h3>Create new wallet</h3>
      <p>You will see your 24-word recovery phrase ONCE. Write it down on paper before clicking Done.</p>
      <div class="actions">
        <button id="flow-create-go" class="btn btn-primary">Generate wallet</button>
        <button id="flow-cancel" class="btn">Cancel</button>
      </div>`;
    $('wallet-flow').appendChild(f);
    $('flow-cancel').onclick = () => { clearFlow(); };
    $('flow-create-go').onclick = async () => {
      const r = await api.walletCreate();
      if ('error' in r) { showMsg('wallet', r.error, 'error'); return; }
      clearFlow();
      const m = document.createElement('div');
      m.className = 'flow';
      m.innerHTML = `
        <h3>Wallet created — back it up now</h3>
        <p><strong>Write down these 24 words.</strong> They are the ONLY way
        to recover this wallet if you lose this install. We do not store
        them anywhere we can recover from for you.</p>
        <div class="mnemonic-display"></div>
        <div class="actions">
          <button id="flow-confirm-backup" class="btn btn-primary">I've written it down — done</button>
        </div>`;
      $('wallet-flow').appendChild(m);
      m.querySelector('.mnemonic-display').textContent = r.mnemonic;
      $('flow-confirm-backup').onclick = async () => {
        clearFlow();
        showMsg('wallet', 'Wallet created. Address: ' + r.address, 'success');
        await refreshWallet();
      };
    };
  }

  function flowImport() {
    clearMsg('wallet'); clearFlow();
    const f = document.createElement('div');
    f.className = 'flow';
    f.innerHTML = `
      <h3>Import wallet</h3>
      <p>Paste your 24-word BIP-39 recovery phrase. A fresh FALCON keypair
      is generated locally — see PAY_FALCON_ROTATION_SPEC.md for what
      happens at the post-quantum hard fork.</p>
      <textarea id="flow-import-input" placeholder="word1 word2 … word24"></textarea>
      <div class="actions">
        <button id="flow-import-go" class="btn btn-primary">Import</button>
        <button id="flow-cancel" class="btn">Cancel</button>
      </div>`;
    $('wallet-flow').appendChild(f);
    $('flow-cancel').onclick = () => { clearFlow(); };
    $('flow-import-go').onclick = async () => {
      const mnemonic = $('flow-import-input').value;
      const r = await api.walletImport({ mnemonic });
      if ('error' in r) { showMsg('wallet', r.error, 'error'); return; }
      clearFlow();
      showMsg('wallet', 'Wallet imported. Address: ' + r.address, 'success');
      await refreshWallet();
    };
  }

  function flowShowMnemonic() {
    clearMsg('wallet'); clearFlow();
    const f = document.createElement('div');
    f.className = 'flow';
    f.innerHTML = `
      <h3>Show recovery phrase</h3>
      <p>Anyone with this phrase can spend from your wallet.
      Make sure no one is looking at your screen.</p>
      <div id="show-mnemonic-prompt"></div>
      <div class="actions">
        <button id="flow-show-go" class="btn btn-primary">Reveal</button>
        <button id="flow-cancel" class="btn">Cancel</button>
      </div>`;
    $('wallet-flow').appendChild(f);
    $('flow-cancel').onclick = () => { clearFlow(); };
    api.walletInfo().then(info => {
      if (info.hasPassphrase) {
        $('show-mnemonic-prompt').innerHTML =
          '<label>Wallet passphrase</label><input type="password" id="show-passphrase" autocomplete="off"/>';
      }
    });
    $('flow-show-go').onclick = async () => {
      const pp = $('show-passphrase')?.value;
      const r = await api.walletRevealMnemonic({ passphrase: pp });
      if ('error' in r) { showMsg('wallet', r.error, 'error'); return; }
      if (r.mnemonic === null) {
        showMsg('wallet', 'No mnemonic stored for this wallet.', 'warning');
        return;
      }
      const out = document.createElement('div');
      out.className = 'mnemonic-display';
      out.textContent = r.mnemonic;
      f.querySelector('#show-mnemonic-prompt').appendChild(out);
      $('flow-show-go').textContent = 'Hide';
      $('flow-show-go').onclick = () => { clearFlow(); };
    };
  }

  function flowSetPassphrase(mode) {
    // mode: 'add' | 'change' | 'remove'
    clearMsg('wallet'); clearFlow();
    const f = document.createElement('div');
    f.className = 'flow';
    if (mode === 'add') {
      f.innerHTML = `
        <h3>Add wallet passphrase</h3>
        <p>A second factor on top of any device-level lock. Required
        on every send + when revealing your recovery phrase.</p>
        <label>New passphrase (12+ characters)</label>
        <input type="password" id="pp-new" autocomplete="new-password"/>
        <div class="actions">
          <button id="flow-go" class="btn btn-primary">Set passphrase</button>
          <button id="flow-cancel" class="btn">Cancel</button>
        </div>`;
    } else if (mode === 'change') {
      f.innerHTML = `
        <h3>Change wallet passphrase</h3>
        <label>Current passphrase</label>
        <input type="password" id="pp-old" autocomplete="off"/>
        <label>New passphrase (12+ characters)</label>
        <input type="password" id="pp-new" autocomplete="new-password"/>
        <div class="actions">
          <button id="flow-go" class="btn btn-primary">Change</button>
          <button id="flow-cancel" class="btn">Cancel</button>
        </div>`;
    } else {
      f.innerHTML = `
        <h3>Remove wallet passphrase</h3>
        <p>After this the wallet is only protected by the OS keystore.</p>
        <label>Current passphrase</label>
        <input type="password" id="pp-old" autocomplete="off"/>
        <div class="actions">
          <button id="flow-go" class="btn btn-danger">Remove</button>
          <button id="flow-cancel" class="btn">Cancel</button>
        </div>`;
    }
    $('wallet-flow').appendChild(f);
    $('flow-cancel').onclick = () => { clearFlow(); };
    $('flow-go').onclick = async () => {
      let r;
      if (mode === 'add') {
        r = await api.walletEnablePassphrase({ passphrase: $('pp-new').value });
      } else if (mode === 'change') {
        r = await api.walletChangePassphrase({
          oldPassphrase: $('pp-old').value,
          newPassphrase: $('pp-new').value,
        });
      } else {
        r = await api.walletRemovePassphrase({ passphrase: $('pp-old').value });
      }
      if ('error' in r) { showMsg('wallet', r.error, 'error'); return; }
      clearFlow();
      showMsg('wallet', mode === 'add' ? 'Passphrase set.'
        : mode === 'change' ? 'Passphrase changed.'
        : 'Passphrase removed.', 'success');
      await refreshWallet();
    };
  }

  function flowDelete() {
    clearMsg('wallet'); clearFlow();
    const f = document.createElement('div');
    f.className = 'flow';
    f.innerHTML = `
      <h3>Delete wallet</h3>
      <p><strong>This cannot be undone</strong> unless you have your 24-word
      recovery phrase written down. After deletion this install holds
      no wallet material — you'll need to import or create one to do
      anything.</p>
      <label>Type <code>DELETE</code> (uppercase) to confirm</label>
      <input type="text" id="del-confirm" autocomplete="off"/>
      <div class="actions">
        <button id="flow-go" class="btn btn-danger">Delete wallet</button>
        <button id="flow-cancel" class="btn">Cancel</button>
      </div>`;
    $('wallet-flow').appendChild(f);
    $('flow-cancel').onclick = () => { clearFlow(); };
    $('flow-go').onclick = async () => {
      const r = await api.walletDelete({ confirm: $('del-confirm').value });
      if ('error' in r) { showMsg('wallet', r.error, 'error'); return; }
      clearFlow();
      showMsg('wallet', 'Wallet deleted.', 'success');
      await refreshWallet();
    };
  }

  // Wire wallet buttons
  $('btn-create').onclick = flowCreate;
  $('btn-import').onclick = flowImport;
  $('btn-show-mnemonic').onclick = flowShowMnemonic;
  $('btn-passphrase').onclick = () => flowSetPassphrase('add');
  $('btn-change-passphrase').onclick = () => flowSetPassphrase('change');
  $('btn-remove-passphrase').onclick = () => flowSetPassphrase('remove');
  $('btn-delete-wallet').onclick = flowDelete;
  $('btn-copy-address').onclick = () => {
    const a = $('wallet-address').textContent || '';
    navigator.clipboard?.writeText(a);
  };

  // ── Agents (pairing) panel ────────────────────────────────

  async function refreshPaired() {
    clearMsg('agents');
    const r = await api.pairingList();
    const ul = $('paired-list');
    ul.innerHTML = '';
    if (r.agents.length === 0) {
      ul.innerHTML = '<li class="muted">(none yet)</li>';
      return;
    }
    for (const a of r.agents) {
      const li = document.createElement('li');
      const meta = `paired ${humanAgo(Date.now() - a.pairedAt)}`;
      li.innerHTML = `
        <div>
          <div class="paired-name"></div>
          <div class="paired-meta"></div>
        </div>
        <button class="btn btn-link paired-revoke">Revoke</button>`;
      li.querySelector('.paired-name').textContent = a.name;
      li.querySelector('.paired-meta').textContent = meta;
      li.querySelector('.paired-revoke').onclick = async () => {
        await api.pairingRevoke({ agentId: a.id });
        showMsg('agents', `Revoked "${a.name}".`, 'success');
        refreshPaired();
      };
      ul.appendChild(li);
    }
  }

  $('btn-new-code').onclick = async () => {
    const r = await api.pairingNewCode();
    $('pair-code').textContent = r.code.replace(/(\d{3})(\d{3})/, '$1 $2');
    const expiresAt = Date.now() + r.expiresInMs;
    const tick = () => {
      const remaining = Math.max(0, expiresAt - Date.now());
      $('pair-code-meta').textContent = remaining === 0
        ? 'Expired — generate a new one.'
        : 'Expires in ' + Math.ceil(remaining / 1000) + 's';
      if (remaining === 0) clearInterval(t);
    };
    tick();
    const t = setInterval(tick, 250);
  };

  // ── Network panel ──────────────────────────────────────────

  async function loadBootInfo() {
    const b = await api.bootInfo();
    $('boot-url').textContent = `http://127.0.0.1:${b.port}/rpc`;
    $('boot-pair').textContent = `http://127.0.0.1:${b.port}/pair`;
    $('boot-discovery').textContent = b.discoveryFile;
    $('boot-pid').textContent = String(b.pid);
    $('chain-endpoint').textContent = b.endpoint;
  }

  function humanAgo(ms) {
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return Math.round(ms / 60_000) + 'm ago';
    if (ms < 86_400_000) return Math.round(ms / 3_600_000) + 'h ago';
    return Math.round(ms / 86_400_000) + 'd ago';
  }

  // ── Initial load ───────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshWallet);
  } else {
    refreshWallet();
  }
})();
