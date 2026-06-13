/*
 * anton-checkout.js — embeddable "Pay with FutureChain" widget.
 *
 * Plan #11 (Area 7). Vanilla, dependency-free, ~6KB. The merchant creates a
 * payment request SERVER-SIDE with their gateway API key, then drops this
 * script and mounts by the public request id:
 *
 *   <script src="https://your-anton/checkout/anton-checkout.js"></script>
 *   <div id="pay"></div>
 *   <script>
 *     AntonCheckout.mount({
 *       requestId: 'wpr_…',          // from POST /api/checkout/v1/requests
 *       el: '#pay',
 *       baseUrl: 'https://your-anton', // optional; defaults to script origin
 *       onSettled: (s) => { … },       // fired on 'confirmed'
 *       onSeen:    (s) => { … },       // fired on 'seen' (mempool)
 *       onExpired: (s) => { … },
 *     });
 *   </script>
 *
 * The widget holds ONLY the request id. It never sees the amount, the merchant
 * receiving address, the gateway apiKey, or any private key. The customer's
 * ANTON Pay app is the only key-holder.
 *
 * Honest finality: 'seen' = in the mempool (scanned + submitting); 'confirmed'
 * = mined. We NEVER say "Paid – final" on 'seen' alone.
 */
(function (global) {
  'use strict';

  function originFromScript() {
    try {
      var cur = document.currentScript && document.currentScript.src;
      if (cur) return new URL(cur).origin;
    } catch (_) {}
    return global.location ? global.location.origin : '';
  }

  var STATE_COPY = {
    pending:   { label: 'Scan to pay with ANTON Pay', sub: 'Open ANTON Pay and scan the code', cls: 'anton-pending' },
    seen:      { label: 'Payment seen', sub: 'In the network (mempool) — waiting for confirmation', cls: 'anton-seen' },
    confirmed: { label: 'Payment confirmed', sub: 'Mined on FutureChain', cls: 'anton-confirmed' },
    expired:   { label: 'Code expired', sub: 'This payment request has expired', cls: 'anton-expired' },
    failed:    { label: 'Payment failed', sub: 'Could not complete', cls: 'anton-failed' }
  };

  var CSS = [
    '.anton-checkout{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:340px;border:1px solid #e2e8f0;border-radius:16px;padding:20px;text-align:center;background:#fff;color:#0B1426}',
    '.anton-checkout .anton-qr{width:240px;height:240px;margin:8px auto;display:flex;align-items:center;justify-content:center}',
    '.anton-checkout .anton-qr svg{width:100%;height:100%}',
    '.anton-checkout .anton-label{font-size:16px;font-weight:600;margin-top:8px}',
    '.anton-checkout .anton-sub{font-size:13px;color:#64748b;margin-top:4px}',
    '.anton-checkout .anton-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}',
    '.anton-checkout.anton-pending .anton-dot{background:#F5A623}',
    '.anton-checkout.anton-seen .anton-dot{background:#3498DB;animation:anton-pulse 1.2s infinite}',
    '.anton-checkout.anton-confirmed .anton-dot{background:#27AE60}',
    '.anton-checkout.anton-expired .anton-dot,.anton-checkout.anton-failed .anton-dot{background:#E74C3C}',
    '.anton-checkout .anton-spin{margin-top:10px;font-size:12px;color:#94a3b8}',
    '@keyframes anton-pulse{0%{opacity:1}50%{opacity:.3}100%{opacity:1}}'
  ].join('');

  function injectCss() {
    if (document.getElementById('anton-checkout-css')) return;
    var s = document.createElement('style');
    s.id = 'anton-checkout-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function mount(opts) {
    if (!opts || !opts.requestId) throw new Error('AntonCheckout.mount: requestId is required');
    var el = typeof opts.el === 'string' ? document.querySelector(opts.el) : opts.el;
    if (!el) throw new Error('AntonCheckout.mount: el not found');
    var base = (opts.baseUrl || originFromScript()).replace(/\/+$/, '');
    var id = opts.requestId;
    var pollMs = opts.pollMs || 2500;

    injectCss();
    var root = document.createElement('div');
    root.className = 'anton-checkout anton-pending';
    var qrBox = document.createElement('div'); qrBox.className = 'anton-qr';
    var labelEl = document.createElement('div'); labelEl.className = 'anton-label';
    var subEl = document.createElement('div'); subEl.className = 'anton-sub';
    var spin = document.createElement('div'); spin.className = 'anton-spin'; spin.textContent = 'Waiting…';
    root.appendChild(qrBox);
    var dotLabel = document.createElement('div');
    dotLabel.innerHTML = '<span class="anton-dot"></span>';
    dotLabel.appendChild(labelEl);
    root.appendChild(dotLabel);
    root.appendChild(subEl);
    root.appendChild(spin);
    el.innerHTML = '';
    el.appendChild(root);

    var timer = null;
    var frameTimer = null;
    var stopped = false;
    var lastStatus = null;
    var qrRendered = false;
    var animatedRendered = false;

    function setState(s) {
      var c = STATE_COPY[s.status] || STATE_COPY.pending;
      root.className = 'anton-checkout ' + c.cls;
      labelEl.textContent = c.label;
      subEl.textContent = c.sub;
      if (s.status === 'confirmed' || s.status === 'expired' || s.status === 'failed') {
        spin.style.display = 'none';
      }
    }

    // Static QR — fetch the server-rendered SVG once (the qrUri is fixed for
    // the life of the request). The widget never builds the URI itself.
    function renderStaticQr() {
      if (qrRendered) return;
      qrRendered = true;
      fetch(base + '/api/checkout/v1/requests/' + encodeURIComponent(id) + '/qr.svg')
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (svg) { if (svg) qrBox.innerHTML = svg; })
        .catch(function () {});
    }

    // Animated QR — fetch the pre-rendered fountain frame SVGs and cycle them.
    function renderAnimatedQr() {
      if (animatedRendered) return;
      animatedRendered = true;
      fetch(base + '/api/checkout/v1/requests/' + encodeURIComponent(id) + '/frames')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.frames || !data.frames.length) { renderStaticQr(); return; }
          var i = 0;
          frameTimer = setInterval(function () {
            if (stopped) return;
            qrBox.innerHTML = data.frames[i % data.frames.length];
            i++;
          }, 200); // 5 fps — matches the Business AnimatedQrDisplay loop
        })
        .catch(function () { renderStaticQr(); });
    }

    function stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (frameTimer) clearInterval(frameTimer);
    }

    function tick() {
      if (stopped) return;
      fetch(base + '/api/checkout/v1/requests/' + encodeURIComponent(id) + '/status', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (s) {
          if (!s || stopped) return;
          // Render the right QR on the first status (tells us needsAnimated).
          if (s.needsAnimated) renderAnimatedQr(); else renderStaticQr();
          if (s.status !== lastStatus) {
            lastStatus = s.status;
            setState(s);
            if (s.status === 'seen' && opts.onSeen) opts.onSeen(s);
            if (s.status === 'confirmed') { stop(); if (opts.onSettled) opts.onSettled(s); }
            if (s.status === 'expired') { stop(); if (opts.onExpired) opts.onExpired(s); }
            if (s.status === 'failed') { stop(); if (opts.onFailed) opts.onFailed(s); }
          }
        })
        .catch(function () {});
    }

    tick();
    timer = setInterval(tick, pollMs);
    return { stop: stop, el: root };
  }

  global.AntonCheckout = { mount: mount, version: '1.0.0' };
})(typeof window !== 'undefined' ? window : this);
