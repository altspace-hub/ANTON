/**
 * cdp.cjs — evaluate JS inside a debuggable Android WebView over the Chrome
 * DevTools Protocol. Hardened, module form of the original .live-walk/cdp-eval.cjs.
 *
 * Two entry points:
 *   - evalInPage(wsUrl, expr, opts) -> Promise<any>   one-shot (opens+closes a socket)
 *   - new CdpSession(wsUrl)                            pools ONE socket across many evals
 *
 * The expression is wrapped in an async IIFE, so it can `await` (IndexedDB,
 * fetch, …). The result is returned by value (JSON-cloned). A page exception
 * rejects with an Error carrying `.cdpException`.
 *
 * Get `wsUrl` from devices.cjs (forwardApp -> webSocketDebuggerUrl).
 */
const WebSocket = require('ws');

const DEFAULT_EVAL_TIMEOUT = 30_000;
const SOCKET_IDLE_TIMEOUT = 60_000;

function wrap(expr) {
  // Wrap so callers can pass either a bare expression or a full async IIFE.
  return `(async () => { return (${expr}); })()`;
}

/** A pooled CDP connection to one WebView page. Reuse it across evals to avoid
 *  the per-call socket setup cost. Call .close() when done. */
class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this._ready = null;
  }

  _connect() {
    if (this._ready) return this._ready;
    this._ready = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
      const failOpen = setTimeout(() => reject(new Error('CDP connect timeout: ' + this.wsUrl)), 15_000);
      ws.on('open', async () => {
        clearTimeout(failOpen);
        this.ws = ws;
        try { await this._send('Runtime.enable'); resolve(this); }
        catch (e) { reject(e); }
      });
      ws.on('message', (data) => {
        let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
        if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); }
      });
      ws.on('error', (e) => { clearTimeout(failOpen); reject(new Error('CDP socket error: ' + e.message)); });
      ws.on('close', () => { this.ws = null; this._ready = null; });
    });
    return this._ready;
  }

  _send(method, params) {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  /** Evaluate `expr` in the page; resolves with the returned value. */
  async eval(expr, opts = {}) {
    await this._connect();
    const r = await this._send('Runtime.evaluate', {
      expression: wrap(expr),
      awaitPromise: true,
      returnByValue: true,
      timeout: opts.timeout || DEFAULT_EVAL_TIMEOUT,
    });
    const ed = r.result && r.result.exceptionDetails;
    if (ed) {
      const desc = (ed.exception && (ed.exception.description || ed.exception.value)) || ed.text || 'page exception';
      const err = new Error('CDP eval exception: ' + desc);
      err.cdpException = ed;
      throw err;
    }
    const res = r.result && r.result.result;
    return res ? (('value' in res) ? res.value : res.description) : null;
  }

  close() {
    if (this.ws) { try { this.ws.close(); } catch { /* noop */ } this.ws = null; }
    this._ready = null;
  }
}

/** One-shot eval: opens a socket, evaluates, closes. */
async function evalInPage(wsUrl, expr, opts = {}) {
  const s = new CdpSession(wsUrl);
  try {
    return await Promise.race([
      s.eval(expr, opts),
      new Promise((_, rej) => setTimeout(() => rej(new Error('evalInPage hard timeout')), (opts.timeout || DEFAULT_EVAL_TIMEOUT) + 5_000)),
    ]);
  } finally {
    s.close();
  }
}

module.exports = { CdpSession, evalInPage, SOCKET_IDLE_TIMEOUT };

// CLI compatibility: `node cdp.cjs <wsUrl> "<expr>"` prints the JSON result.
if (require.main === module) {
  const [, , wsUrl, expr] = process.argv;
  if (!wsUrl || !expr) { console.error('usage: cdp.cjs <wsUrl> "<expr>"'); process.exit(2); }
  evalInPage(wsUrl, expr)
    .then((v) => { process.stdout.write(typeof v === 'string' ? v : JSON.stringify(v)); process.exit(0); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
