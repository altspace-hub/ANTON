import type { DatabaseAdapter } from '../db/database.js';

export async function createFCTransactionService(db: DatabaseAdapter) {
  function buildRemittance(purpose: string, nature: string, goal: string, taskRef?: string) {
    let rem = `P:${purpose} N:${nature} G:${goal}`;
    if (taskRef) rem += ` T:${taskRef}`;
    return rem.slice(0, 140);
  }

  async function buildTransaction(params: {
    fromAddress: string; toAddress: string; amountFtc: number;
    walletType: 'human' | 'agent'; purpose?: string; nature?: string; goal?: string; taskRef?: string;
  }) {
    const id = `fctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const amountRaw = Math.round(params.amountFtc * 100000000);
    const remittance = buildRemittance(params.purpose ?? 'OTHR', params.nature ?? 'payment', params.goal ?? 'service', params.taskRef);
    const pacs008 = { senderAddress: params.fromAddress, receiverAddress: params.toAddress, amount: params.amountFtc, purpose: params.purpose ?? 'OTHR' };

    await db.run(`INSERT INTO fc_transactions (id, from_address, to_address, amount_ftc, amount_raw, wallet_type, status, pacs008_fields, remittance_raw, task_ref, submission_method)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, 'stub')`,
      id, params.fromAddress, params.toAddress, params.amountFtc, amountRaw,
      params.walletType, JSON.stringify(pacs008), remittance, params.taskRef ?? null);
    return { id, status: 'draft' };
  }

  async function submitTransaction(txId: string) {
    // Stub mode: auto-confirm
    const stubTxId = `STUB_TX_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`UPDATE fc_transactions SET status = 'confirmed', tx_id = ?, submitted_at = NOW(), confirmed_at = NOW(), submission_method = 'stub' WHERE id = ?`, stubTxId, txId);
    return { txId: stubTxId, status: 'confirmed' };
  }

  async function listTransactions(filters?: { status?: string; limit?: number }) {
    let where = 'WHERE 1=1'; const params: unknown[] = [];
    if (filters?.status) { where += ' AND status = ?'; params.push(filters.status); }
    params.push(filters?.limit ?? 50);
    return await db.all(`SELECT * FROM fc_transactions ${where} ORDER BY created_at DESC LIMIT ?`, ...params);
  }

  async function getTransaction(id: string) {
    return await db.get('SELECT * FROM fc_transactions WHERE id = ?', id);
  }

  return { buildRemittance, buildTransaction, submitTransaction, listTransactions, getTransaction };
}
export type FCTransactionService = Awaited<ReturnType<typeof createFCTransactionService>>;
