// Tiny CDP client — sends a JS expression to the WebView via Runtime.evaluate.
// Usage: node cdp-eval.cjs <ws-url> <js-expr>
const WebSocket = require('ws');
const wsUrl = process.argv[2];
const expr = process.argv[3];
const ws = new WebSocket(wsUrl);
let id = 1;
ws.on('open', () => {
  ws.send(JSON.stringify({
    id: id++, method: 'Runtime.evaluate',
    params: { expression: expr, returnByValue: true, awaitPromise: true },
  }));
});
ws.on('message', (data) => {
  const m = JSON.parse(data.toString());
  if (m.id) {
    if (m.result?.result?.value !== undefined) {
      console.log(JSON.stringify(m.result.result.value));
    } else if (m.result?.exceptionDetails) {
      console.error('EXC:', JSON.stringify(m.result.exceptionDetails));
      process.exit(2);
    } else {
      console.log(JSON.stringify(m.result));
    }
    ws.close();
  }
});
ws.on('error', (e) => { console.error('WS ERR:', e.message); process.exit(3); });
