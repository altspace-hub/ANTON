// Probe a fetch through Capacitor's WebView with Network domain on so we
// can see exactly why the request fails. Prints loadingFailed events.
const WebSocket = require('ws');
const wsUrl = process.argv[2];
const targetUrl = process.argv[3];
const ws = new WebSocket(wsUrl);
let id = 1;
const send = (m) => ws.send(JSON.stringify({ id: id++, ...m }));
ws.on('open', () => {
  send({ method: 'Network.enable' });
  send({
    method: 'Runtime.evaluate',
    params: {
      expression: `fetch(${JSON.stringify(targetUrl)}).then(r => 'OK ' + r.status).catch(e => 'ERR ' + e.message)`,
      awaitPromise: true,
      returnByValue: true,
    },
  });
});
const failures = [];
ws.on('message', (data) => {
  const m = JSON.parse(data.toString());
  if (m.method === 'Network.loadingFailed') {
    failures.push(m.params);
    console.log('FAIL:', JSON.stringify(m.params));
  } else if (m.method === 'Network.requestWillBeSent') {
    console.log('REQ:', m.params.request?.url);
  } else if (m.id && m.result?.result) {
    console.log('JS:', m.result.result.value);
    setTimeout(() => { ws.close(); }, 500);
  }
});
ws.on('error', (e) => { console.error('WS ERR:', e.message); process.exit(3); });
setTimeout(() => { ws.close(); }, 5000);
