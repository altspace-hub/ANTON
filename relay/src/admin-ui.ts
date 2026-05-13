/**
 * admin-ui.ts — single-page operator UI for the portal registry.
 *
 * Served at GET /admin (and /admin/). Self-contained: inline CSS,
 * vanilla JS, no build pipeline. The page calls the existing
 * /v1/admin/* endpoints; nothing here knows about the database
 * directly. Tokens are kept in localStorage so the operator stays
 * logged in across reloads (1h JWT TTL applies).
 *
 * Intentionally minimal — just enough to clear the review queue
 * without resorting to curl. A richer UI is a Phase E item.
 */

export const ADMIN_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ANTON Portals — Operator</title>
<style>
  :root {
    --bg: #F5F3EF;
    --surface: #FFFFFF;
    --surface-alt: #FAFAF8;
    --border: #DDD9D2;
    --border-soft: #EAE7E0;
    --text: #1A1B2E;
    --text-body: #3B3D50;
    --text-muted: #4F5267;
    --text-faint: #686A7C;
    --accent: #0D7D6C;
    --accent-dark: #06655A;
    --accent-dim: #D5F0EB;
    --accent-fg: #FFFFFF;
    --red: #C7361F;
    --red-dim: #F9E2DD;
    --gold: #C8842B;
    --gold-dim: #F7ECD9;
    --green: #1F8A5C;
    --green-dim: #DCEEE4;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Inter', -apple-system, system-ui, sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.45;
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; background: var(--surface);
    border-bottom: 1px solid var(--border-soft);
  }
  header h1 { font-size: 16px; font-weight: 600; margin: 0; }
  header .who { font-size: 12px; color: var(--text-muted); }
  main { max-width: 960px; margin: 0 auto; padding: 24px 20px; }
  .card {
    background: var(--surface); border: 1px solid var(--border-soft);
    border-radius: 16px; padding: 20px; margin-bottom: 16px;
  }
  h2 { font-size: 18px; font-weight: 600; margin: 0 0 12px; }
  label {
    display: block; font-size: 11px; font-weight: 500;
    text-transform: uppercase; letter-spacing: .05em;
    color: var(--text-muted); margin-bottom: 4px;
  }
  input[type=text], input[type=password], textarea {
    width: 100%; padding: 10px 12px; font-size: 14px;
    border: 1px solid var(--border); border-radius: 12px;
    background: var(--surface-alt); color: var(--text);
    font-family: inherit;
  }
  input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  textarea { min-height: 80px; resize: vertical; }
  button {
    cursor: pointer; padding: 10px 18px; font-size: 14px; font-weight: 500;
    border: none; border-radius: 10px; font-family: inherit;
    transition: filter 120ms;
  }
  button:hover:not(:disabled) { filter: brightness(0.95); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-primary { background: var(--accent); color: var(--accent-fg); }
  .btn-danger  { background: var(--red);    color: #fff; }
  .btn-ghost   { background: var(--surface-alt); color: var(--text-muted); }
  .row { display: flex; gap: 8px; margin-top: 12px; }
  .field { margin-bottom: 12px; }
  .err { color: var(--red); font-size: 13px; margin-top: 8px; }
  .ok  { color: var(--green); font-size: 13px; margin-top: 8px; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 500;
  }
  .badge-pending { background: var(--gold-dim); color: var(--gold); }
  .badge-tier2   { background: var(--accent-dim); color: var(--accent-dark); }
  .badge-tier3   { background: var(--surface-alt); color: var(--text-muted); }
  ul.list { list-style: none; padding: 0; margin: 0; }
  ul.list li {
    padding: 14px 0; border-bottom: 1px solid var(--border-soft); cursor: pointer;
  }
  ul.list li:last-child { border-bottom: none; }
  ul.list li:hover { background: var(--surface-alt); }
  .list-title { font-weight: 500; font-size: 14px; }
  .list-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  pre.detail {
    background: var(--surface-alt); border: 1px solid var(--border-soft);
    border-radius: 10px; padding: 12px; font-size: 12px;
    overflow-x: auto; max-height: 320px; overflow-y: auto;
    color: var(--text-body); font-family: 'JetBrains Mono', monospace;
  }
  .kyc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 13px; }
  .kyc-grid .k { color: var(--text-muted); }
  .kyc-grid .v { color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .empty { color: var(--text-faint); font-size: 14px; padding: 30px 0; text-align: center; }
  .hidden { display: none; }
</style>
</head>
<body>

<header>
  <h1>ANTON Portals — Operator</h1>
  <div id="who" class="who"></div>
</header>

<main>

<!-- ── Login ──────────────────────────────────────────────────────── -->
<section id="login" class="card hidden">
  <h2>Operator login</h2>
  <div class="field">
    <label for="op-id">Operator id</label>
    <input id="op-id" type="text" placeholder="op-yourname" autocomplete="off">
  </div>
  <div class="field">
    <label for="op-pw">Password</label>
    <input id="op-pw" type="password" autocomplete="current-password">
  </div>
  <div class="row">
    <button class="btn-primary" id="login-btn">Sign in</button>
  </div>
  <div id="login-err" class="err"></div>
</section>

<!-- ── Queue ──────────────────────────────────────────────────────── -->
<section id="queue" class="card hidden">
  <h2 style="display:flex;align-items:center;justify-content:space-between;">
    <span>Review queue</span>
    <button class="btn-ghost" id="refresh-btn">Refresh</button>
  </h2>
  <ul id="queue-list" class="list"></ul>
  <div id="queue-empty" class="empty hidden">No pending submissions.</div>
</section>

<!-- ── Detail ─────────────────────────────────────────────────────── -->
<section id="detail" class="card hidden">
  <h2 style="display:flex;align-items:center;justify-content:space-between;">
    <span id="d-title">Submission</span>
    <button class="btn-ghost" id="back-btn">← Back to queue</button>
  </h2>
  <div class="field">
    <label>Identity</label>
    <div class="kyc-grid" id="d-kyc"></div>
  </div>
  <div class="field">
    <label>Capability descriptor</label>
    <pre class="detail" id="d-descriptor"></pre>
  </div>
  <div class="field">
    <label for="notes">Internal notes (operator-only)</label>
    <textarea id="notes" placeholder="Visible only in the audit trail"></textarea>
  </div>
  <div class="field">
    <label for="reason">Rejection reason (shown to submitter)</label>
    <textarea id="reason" placeholder="Required to reject"></textarea>
  </div>
  <div class="row">
    <button class="btn-primary" id="approve-btn">Approve</button>
    <button class="btn-danger"  id="reject-btn">Reject</button>
  </div>
  <div id="d-err" class="err"></div>
  <div id="d-ok"  class="ok"></div>
</section>

</main>

<script>
(function() {
  const TOKEN_KEY = 'anton-relay-op-token';
  const OP_KEY = 'anton-relay-op-id';

  const $ = (id) => document.getElementById(id);
  const show = (el) => el.classList.remove('hidden');
  const hide = (el) => el.classList.add('hidden');

  // ── State ───────────────────────────────────────────────────────
  let token = localStorage.getItem(TOKEN_KEY);
  let operatorId = localStorage.getItem(OP_KEY);
  let currentDetail = null;

  // ── Helpers ─────────────────────────────────────────────────────
  async function api(path, opts = {}) {
    const headers = { 'content-type': 'application/json', ...(opts.headers||{}) };
    if (token && !path.endsWith('/login')) headers.authorization = 'Bearer ' + token;
    const res = await fetch(path, { ...opts, headers });
    let body;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) {
      const msg = (body && body.message) || (body && body.error) || res.statusText;
      const err = new Error(msg);
      err.status = res.status; err.body = body;
      if (res.status === 401) { logout(); }
      throw err;
    }
    return body;
  }

  function logout() {
    token = null; operatorId = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(OP_KEY);
    $('who').textContent = '';
    show($('login')); hide($('queue')); hide($('detail'));
  }

  // ── Login ───────────────────────────────────────────────────────
  $('login-btn').addEventListener('click', async () => {
    const op = $('op-id').value.trim();
    const pw = $('op-pw').value;
    $('login-err').textContent = '';
    if (!op || !pw) { $('login-err').textContent = 'Both fields required.'; return; }
    try {
      const r = await api('/v1/admin/login', {
        method: 'POST', body: JSON.stringify({ password: pw, operatorId: op }),
      });
      token = r.token; operatorId = r.operatorId;
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(OP_KEY, operatorId);
      $('op-pw').value = '';
      enterLoggedIn();
    } catch (e) {
      $('login-err').textContent = e.message;
    }
  });

  // ── Queue ───────────────────────────────────────────────────────
  async function loadQueue() {
    try {
      const r = await api('/v1/admin/submissions?status=pending');
      const list = $('queue-list');
      list.innerHTML = '';
      if (r.submissions.length === 0) {
        show($('queue-empty'));
      } else {
        hide($('queue-empty'));
        for (const s of r.submissions) {
          const li = document.createElement('li');
          li.innerHTML = \`
            <div class="list-title">\${escape(s.proposedName)}.\${escape(s.proposedNamespace)}</div>
            <div class="list-meta">
              <span class="badge \${s.tier === 'tier2_claimed' ? 'badge-tier2' : 'badge-tier3'}">\${escape(s.tier)}</span>
              <span class="badge badge-pending">pending</span>
              · submitted \${new Date(s.submittedAt).toLocaleString()}
              · \${escape(s.submitterContactHash)}
            </div>\`;
          li.addEventListener('click', () => openDetail(s.submissionId));
          list.appendChild(li);
        }
      }
    } catch (e) {
      $('queue-list').innerHTML = '<li class="empty">Failed to load: ' + escape(e.message) + '</li>';
    }
  }

  // ── Detail ──────────────────────────────────────────────────────
  async function openDetail(id) {
    $('d-err').textContent = ''; $('d-ok').textContent = '';
    $('notes').value = ''; $('reason').value = '';
    try {
      const r = await api('/v1/admin/submissions/' + encodeURIComponent(id));
      currentDetail = r;
      $('d-title').textContent = r.proposedName + '.' + r.proposedNamespace;
      $('d-descriptor').textContent = JSON.stringify(r.descriptor, null, 2);
      const kyc = r.kyc || {};
      $('d-kyc').innerHTML = \`
        <div class="k">Submitter hash</div><div class="v">\${escape(r.submitterContactHash)}</div>
        <div class="k">Signing pubkey</div><div class="v">\${escape(r.signingPubkeyHex)}</div>
        <div class="k">Legal name</div><div class="v">\${escape(kyc.legalName || '—')}</div>
        <div class="k">Doc type</div><div class="v">\${escape(kyc.idDocumentType || '—')}</div>
        <div class="k">Doc country</div><div class="v">\${escape(kyc.idDocumentCountry || '—')}</div>
        <div class="k">Email</div><div class="v">\${escape(kyc.contactEmail || '—')}</div>
        <div class="k">Org</div><div class="v">\${escape(kyc.orgName || '—')}</div>
        <div class="k">Org reg</div><div class="v">\${escape(kyc.orgRegistrationNumber || '—')}</div>
        <div class="k">Address</div><div class="v">\${escape((kyc.addressStreet || '') + ', ' + (kyc.addressCity || '') + ', ' + (kyc.addressCountry || ''))}</div>
      \`;
      hide($('queue')); show($('detail'));
    } catch (e) {
      $('d-err').textContent = e.message;
    }
  }

  $('back-btn').addEventListener('click', () => {
    hide($('detail')); show($('queue'));
    currentDetail = null;
    loadQueue();
  });

  $('approve-btn').addEventListener('click', async () => {
    if (!currentDetail) return;
    $('d-err').textContent = ''; $('d-ok').textContent = '';
    try {
      const r = await api('/v1/admin/submissions/' + encodeURIComponent(currentDetail.submissionId) + '/approve', {
        method: 'POST',
        body: JSON.stringify({ internalNotes: $('notes').value || undefined }),
      });
      $('d-ok').textContent = 'Approved as ' + r.portalAddress + '. Reload queue to continue.';
    } catch (e) {
      $('d-err').textContent = e.message;
    }
  });

  $('reject-btn').addEventListener('click', async () => {
    if (!currentDetail) return;
    $('d-err').textContent = ''; $('d-ok').textContent = '';
    const reason = $('reason').value.trim();
    if (!reason) { $('d-err').textContent = 'Reason is required (shown to the submitter).'; return; }
    try {
      await api('/v1/admin/submissions/' + encodeURIComponent(currentDetail.submissionId) + '/reject', {
        method: 'POST',
        body: JSON.stringify({ reason, internalNotes: $('notes').value || undefined }),
      });
      $('d-ok').textContent = 'Rejected. Reload queue to continue.';
    } catch (e) {
      $('d-err').textContent = e.message;
    }
  });

  $('refresh-btn').addEventListener('click', loadQueue);

  function enterLoggedIn() {
    $('who').textContent = operatorId + ' · sign out';
    $('who').style.cursor = 'pointer';
    $('who').onclick = logout;
    hide($('login')); show($('queue')); hide($('detail'));
    loadQueue();
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ── Boot ────────────────────────────────────────────────────────
  if (token && operatorId) enterLoggedIn();
  else show($('login'));
})();
</script>

</body>
</html>
`;
