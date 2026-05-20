/**
 * pay-app-e2e-smoke.mts — end-to-end smoke for the Pay app's chain
 * settlement path. Exercises THE EXACT CODE PATH that
 * `src/pay/services/payment.ts::executePayment` runs at runtime,
 * minus the React UI: SDK wallet → buildSignedPacs008Transaction →
 * POST /submit_signed_transaction to the hardened light hub.
 *
 *   1. Generate a fresh Ed25519 wallet (`fc_…`).
 *   2. Fund it from a known funded wallet via a Full node's
 *      `/submit_pacs008_batch` (this endpoint requires the funded
 *      wallet's password; it is REJECTED on light hubs per Phase 0.5,
 *      which is exactly why the pay app uses `/submit_signed_transaction`
 *      and signs locally).
 *   3. Poll the public light hub's `/balance` until the funds arrive.
 *   4. Build + sign a small PACS.008 transfer to a second fresh
 *      address, submit via the public light hub. Status comes back
 *      `queued` (Phase 0.5 P2P gossip path).
 *   5. Poll `/get_utxos/{recipient}` on the light hub until a UTXO
 *      with our `tx_id` appears — i.e. the tx has been mined into a
 *      block and the recipient's spendable UTXO set has been updated.
 *      (Polling `/transaction/{id}` is not a clean confirmation
 *      signal because futurechain's `blockchain.get_transaction`
 *      checks the mempool first and returns the tx body even before
 *      mining.)
 *   6. Confirm by reading the recipient's `/balance`.
 *
 * Verified on 2026-05-20 against:
 *   - Node 1 (Full + Heimdall, localhost:8545) as the funding source
 *   - Node 2 (--mine, localhost:8546) as the miner
 *   - Bahnhof (`https://rpc.futurechain.eu`) as the public light hub
 *
 * Required env (sensitive — never commit values):
 *   FC_FUND_NODE_URL    funding-side full node URL  (e.g. http://127.0.0.1:8545)
 *   FC_FUND_WALLET      funded fc_ address          (e.g. fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs — DB003)
 *   FC_FUND_PASSWORD    that wallet's password
 *   FC_RPC_URL          public light hub URL        (default: https://rpc.futurechain.eu)
 *   FC_RPC_API_KEY      LIGHT_HUB_API_KEYS value    (for /submit_signed_transaction)
 *
 * Optional env:
 *   FC_FUND_AMOUNT_FTC  default 0.5
 *   FC_PAY_AMOUNT_FTC   default 0.1
 *
 * Important: a miner must be active for the smoke to complete (Phase
 * 0.5 lands the tx in the mempool, but a miner has to pick it up). On
 * the Bahnhof + Node 1 + Node 2 dev topology, that means Node 2 is
 * up with --mine. If the smoke stalls at step 5 with the recipient
 * balance never moving, check that a miner is running on the network.
 */
import { wallet, pacs008, rpc } from '../src/index.js';

const NODE1 = required('FC_FUND_NODE_URL');
const FUND_ADDR = required('FC_FUND_WALLET');
const FUND_PASS = required('FC_FUND_PASSWORD');
const PUBLIC = process.env.FC_RPC_URL ?? 'https://rpc.futurechain.eu';
const PUBLIC_KEY = required('FC_RPC_API_KEY');
const FUND_FTC = Number(process.env.FC_FUND_AMOUNT_FTC ?? '0.5');
const PAY_FTC = Number(process.env.FC_PAY_AMOUNT_FTC ?? '0.1');

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function randHex(n: number): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function uuidv4(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function buildBankPacs008(senderAddr: string, recipientAddr: string, ftc: number): Record<string, unknown> {
  const ts = nowIso();
  return {
    document: {
      FIToFICstmrCdtTrf: {
        GrpHdr: {
          MsgId: `SMOKE-FUND-${randHex(8).toUpperCase()}`,
          CreDtTm: ts,
          NbOfTxs: '1',
          SttlmInf: { SttlmMtd: 'CLRG' },
        },
        CdtTrfTxInf: [{
          PmtId: {
            InstrId: `SMOKE-INSTR-${randHex(8).toUpperCase()}`,
            EndToEndId: `SMOKE-E2E-${randHex(8).toUpperCase()}`,
            TxId: `SMOKE-TXID-${randHex(8).toUpperCase()}`,
            UETR: uuidv4(),
          },
          IntrBkSttlmAmt: { '@Ccy': 'FTC', $value: ftc },
          ChrgBr: 'SLEV',
          Dbtr: { Nm: 'Smoke funding source', CtryOfRes: 'SE' },
          DbtrAcct: { Id: { Othr: { Id: senderAddr } } },
          DbtrAgt: { FinInstnId: { BICFI: 'TESTSE33XXX', Nm: 'Test Bank SE' } },
          CdtrAgt: { FinInstnId: { BICFI: 'TESTSE33XXX', Nm: 'Test Bank SE' } },
          Cdtr: { Nm: 'Smoke recipient (pay-app slice)', CtryOfRes: 'SE' },
          CdtrAcct: { Id: { Othr: { Id: recipientAddr } } },
          Purp: { Cd: 'OTHR' },
          RmtInf: { Ustrd: ['pay-app vertical-slice smoke'] },
        }],
      },
    },
    futurechain_metadata: {
      compliance_checked: false,
      kyc_verified: false,
      aml_checked: false,
      sanctions_checked: false,
      risk_score: 0.1,
      processing_timestamp: ts,
      blockchain_tx_id: null,
      node_type: 'archive',
      network_id: 'mainnet',
    },
  };
}

async function main() {
  const sender = wallet.createWallet().wallet;
  console.log(`\n[1] FRESH SENDER    ${sender.address}`);

  const target = wallet.createWallet().wallet;
  console.log(`[2] FRESH RECIPIENT ${target.address}`);

  console.log(`\n[3] FUND  ${FUND_ADDR} → ${sender.address}  ${FUND_FTC} FTC`);
  const fundMessage = buildBankPacs008(FUND_ADDR, sender.address, FUND_FTC);
  const fundResp = await fetch(`${NODE1}/submit_pacs008_batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [fundMessage],
      signing_address: FUND_ADDR,
      password: FUND_PASS,
    }),
  });
  const fundBody = await fundResp.text();
  console.log(`    HTTP ${fundResp.status}: ${fundBody.slice(0, 300)}`);
  if (!fundResp.ok) throw new Error(`funding submit failed (HTTP ${fundResp.status})`);

  const hub = new rpc.RpcClient({ endpoint: PUBLIC, apiKey: PUBLIC_KEY });
  console.log(`\n[4] POLL /balance via ${PUBLIC} until funded`);
  let funded = false;
  const fundDeadline = Date.now() + 3 * 60_000;
  while (Date.now() < fundDeadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const b = await hub.getBalance(sender.address);
    process.stdout.write(`    ${b.balance_ftc} FTC (${b.utxo_count} UTXOs) … `);
    if (b.balance > 0) { console.log('FUNDED'); funded = true; break; }
    console.log('still 0');
  }
  if (!funded) throw new Error('funding never confirmed within 3 minutes');

  console.log(`\n[5] PAY  ${sender.address} → ${target.address}  ${PAY_FTC} FTC (the app path)`);
  const utxos = await hub.getUtxos(sender.address);
  const amountSat = PAY_FTC * 100_000_000;
  const payMsg = pacs008.buildPacs008({
    debtor: { name: 'Smoke pay sender', countryOfResidence: 'SE', accountId: sender.address },
    creditor: { name: 'Smoke pay recipient', countryOfResidence: 'SE', accountId: target.address },
    amountFtc: PAY_FTC,
    remittanceText: 'pay-app vertical-slice E2E smoke',
  });
  const uetr = ((payMsg as { document: { FIToFICstmrCdtTrf: { CdtTrfTxInf: Array<{ PmtId: { UETR: string } }> } } })
    .document.FIToFICstmrCdtTrf.CdtTrfTxInf[0].PmtId.UETR);
  const tx = pacs008.buildSignedPacs008Transaction({
    wallet: sender,
    utxos,
    recipient: target.address,
    amountSatoshi: amountSat,
    feeSatoshi: 100,
    pacs008: payMsg,
    uetr,
  });
  const submit = await hub.submitSignedTransaction(tx);
  console.log(`    submit: ${JSON.stringify(submit).slice(0, 300)}`);

  const txId = submit.tx_id ?? uetr;
  console.log(`\n[6] POLL /get_utxos/${target.address} until a UTXO with tx_id=${txId} appears`);
  const payDeadline = Date.now() + 5 * 60_000;
  let mined = false;
  while (Date.now() < payDeadline) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const utxos = await hub.getUtxos(target.address);
      const hit = utxos.find((u) => u.tx_id === txId);
      if (hit) { console.log(`    MINED in block ${hit.block_height} (output ${hit.output_index})`); mined = true; break; }
      console.log(`    pending — recipient has ${utxos.length} UTXO(s), none yet match ${txId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`    error: ${msg.slice(0, 120)}`);
    }
  }

  const finalSender = await hub.getBalance(sender.address);
  const finalTarget = await hub.getBalance(target.address);
  console.log(`\n[7] FINAL`);
  console.log(`    sender    ${sender.address}  ${finalSender.balance_ftc} FTC (${finalSender.utxo_count} UTXOs)`);
  console.log(`    recipient ${target.address}  ${finalTarget.balance_ftc} FTC (${finalTarget.utxo_count} UTXOs)`);
  console.log(`\nSMOKE ${mined ? 'COMPLETE' : 'PARTIAL (poller hit deadline; check balances above)'}`);
  process.exit(mined ? 0 : 2);
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e);
  process.exit(1);
});
