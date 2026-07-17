import type { DatabaseAdapter } from '../db/database.js';
import { randomBytes, timingSafeEqual } from 'crypto';
import { decrypt } from './credential-vault.js';

export async function createFCGatewayService(db: DatabaseAdapter) {

  async function getConfig() {
    let config = await db.get('SELECT * FROM fc_gateway_config WHERE id = ?', 'default');
    if (!config) {
      const apiKey = randomBytes(32).toString('hex');
      await db.run("INSERT INTO fc_gateway_config (id, api_key) VALUES ('default', ?)", apiKey);
      config = await db.get('SELECT * FROM fc_gateway_config WHERE id = ?', 'default');
    }
    return config as Record<string, unknown>;
  }

  async function updateConfig(updates: Record<string, unknown>) {
    const allowed = ['enabled', 'allow_balance_check', 'allow_contact_lookup', 'allow_send_payment', 'allow_create_transaction', 'max_per_transaction_ftc', 'max_daily_spend_ftc', 'require_approval_above_ftc', 'allowed_contacts_only'];
    const sets: string[] = []; const vals: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) { if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); } }
    if (sets.length > 0) { sets.push('updated_at = NOW()'); vals.push('default'); await db.run(`UPDATE fc_gateway_config SET ${sets.join(', ')} WHERE id = ?`, ...vals); }
    return await getConfig();
  }

  async function regenerateApiKey(): Promise<string> {
    const newKey = randomBytes(32).toString('hex');
    await db.run("UPDATE fc_gateway_config SET api_key = ?, updated_at = NOW() WHERE id = 'default'", newKey);
    return newKey;
  }

  async function validateApiKey(key: string): Promise<{ valid: boolean; config: Record<string, unknown> | null }> {
    const config = await getConfig();
    if (!config) return { valid: false, config: null };
    const storedKey = String(config.api_key);
    try {
      const a = Buffer.from(key, 'utf8');
      const b = Buffer.from(storedKey, 'utf8');
      if (a.length !== b.length) return { valid: false, config: null };
      const valid = timingSafeEqual(a, b);
      return { valid, config: valid ? config : null };
    } catch { return { valid: false, config: null }; }
  }

  async function checkPermission(action: string, config: Record<string, unknown>): Promise<{ allowed: boolean; reason?: string }> {
    if (!config.enabled) return { allowed: false, reason: 'Gateway is disabled' };
    const permMap: Record<string, string> = { balance_check: 'allow_balance_check', contact_lookup: 'allow_contact_lookup', send_payment: 'allow_send_payment', create_transaction: 'allow_create_transaction' };
    const field = permMap[action];
    if (!field) return { allowed: false, reason: `Unknown action: ${action}` };
    if (!config[field]) return { allowed: false, reason: `Permission denied: ${action}` };
    return { allowed: true };
  }

  async function checkGatewayLimits(amount: number): Promise<{ allowed: boolean; reason?: string }> {
    const config = await getConfig();
    if (amount > Number(config.max_per_transaction_ftc)) return { allowed: false, reason: `Exceeds per-transaction limit (${config.max_per_transaction_ftc} FTC)` };
    const daily = await db.get<{ total: number }>("SELECT COALESCE(SUM(amount_ftc), 0) as total FROM fc_gateway_audit_log WHERE action = 'send_payment' AND response_status = 'success' AND created_at >= CURRENT_DATE");
    if ((Number(daily?.total) || 0) + amount > Number(config.max_daily_spend_ftc)) return { allowed: false, reason: `Would exceed daily gateway limit (${config.max_daily_spend_ftc} FTC)` };
    return { allowed: true };
  }

  async function processPayment(params: { contactHash?: string; toAddress?: string; amount: number; purpose?: string; nature?: string; goal?: string }): Promise<Record<string, unknown>> {
    // Check gateway limits
    const limitCheck = await checkGatewayLimits(params.amount);
    if (!limitCheck.allowed) throw new Error(limitCheck.reason);

    // Check main budget
    const { createFCBudgetService } = await import('./fc-budget-service.js');
    const budgetService = await createFCBudgetService(db);
    const budgetCheck = await budgetService.checkSpending(params.amount);
    if (budgetCheck.result === 'blocked') throw new Error(budgetCheck.reason);

    // ── Load sender (debtor) ISO 20022 info from KYC profile ──
    const kyc = await db.get<Record<string, unknown>>(
      "SELECT full_legal_name_enc, country, street_address_enc, city_enc, postal_code_enc, address_country FROM fc_kyc_profiles WHERE id = 'default'"
    );
    const senderName = decrypt(String(kyc?.full_legal_name_enc ?? '')) || 'ANTON Agent';
    const senderCountry = String(kyc?.country ?? '');
    const senderStreet = decrypt(String(kyc?.street_address_enc ?? ''));
    const senderCity = decrypt(String(kyc?.city_enc ?? ''));
    const senderPostalCode = decrypt(String(kyc?.postal_code_enc ?? ''));

    // ── Load receiver (creditor) ISO 20022 info from contact ──
    let toAddress = params.toAddress ?? '';
    let receiverName = '';
    let receiverCountry = '';
    let receiverStreet = '';
    let receiverCity = '';

    if (params.contactHash) {
      const conn = await db.get<Record<string, unknown>>(
        `SELECT payment_address, payment_name, payment_country, payment_street, payment_city,
                agent_wallet_address, display_name
         FROM community_connections WHERE contact_hash = ? AND status = 'accepted'`,
        params.contactHash
      );
      if (conn) {
        toAddress = toAddress || String(conn.payment_address ?? conn.agent_wallet_address ?? '');
        receiverName = String(conn.payment_name ?? conn.display_name ?? '');
        receiverCountry = String(conn.payment_country ?? '');
        receiverStreet = String(conn.payment_street ?? '');
        receiverCity = String(conn.payment_city ?? '');
      }
    }
    if (!toAddress) throw new Error('No recipient address');

    // ── Get agent wallet + tx service WITH real-mode deps (2026-07-17: the
    // bare constructors hard-return stub, making stub_mode=false a no-op here) ──
    const { createRealModeFCServices } = await import('./fc-real-mode.js');
    const { fcWallet: walletService, fcTx: txService } = await createRealModeFCServices(db);
    const agentWallet = await walletService.getAgentWallet();
    if (!agentWallet) throw new Error('No agent wallet configured');

    // Build remittance with purpose/nature/goal
    const remittance = txService.buildRemittance(
      params.purpose ?? 'OTHR', params.nature ?? 'agent-payment', params.goal ?? 'service'
    );

    const tx = await txService.buildTransaction({
      fromAddress: String(agentWallet.address), toAddress, amountFtc: params.amount,
      walletType: 'agent', purpose: params.purpose, nature: params.nature, goal: params.goal,
    });

    // Enrich the transaction with full ISO 20022 debtor/creditor fields
    await db.run(`
      UPDATE fc_transactions SET pacs008_fields = ? WHERE id = ?
    `, JSON.stringify({
      // Debtor (sender) — from KYC
      debtorName: senderName,
      debtorCountry: senderCountry,
      debtorStreetName: senderStreet,
      debtorTownName: senderCity,
      debtorPostCode: senderPostalCode,
      debtorAccount: String(agentWallet.address),
      // Ultimate Debtor (UBO — the human behind the agent)
      ultimateDebtorName: senderName,
      ultimateDebtorCountry: senderCountry,
      // Creditor (receiver) — from contact payment info
      creditorName: receiverName,
      creditorCountry: receiverCountry,
      creditorStreetName: receiverStreet,
      creditorTownName: receiverCity,
      creditorAccount: toAddress,
      // Transaction details
      amount: params.amount,
      currency: 'FTC',
      purposeCode: params.purpose ?? 'OTHR',
      remittanceInformation: remittance,
    }), tx.id);

    const result = await txService.submitTransaction(tx.id);

    // Record spend
    await budgetService.recordSpend(params.amount, result.txId);

    // Update gateway stats
    await db.run("UPDATE fc_gateway_config SET total_requests = total_requests + 1, total_payments_ftc = total_payments_ftc + ? WHERE id = 'default'", params.amount);

    return {
      ...result, amount: params.amount,
      iso20022: {
        debtor: { name: senderName, country: senderCountry, account: String(agentWallet.address) },
        creditor: { name: receiverName, country: receiverCountry, account: toAddress },
        remittance,
      },
    };
  }

  async function logAction(action: string, callerIp: string | undefined, requestData: unknown, status: string, amount?: number, error?: string) {
    const id = `gal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run("INSERT INTO fc_gateway_audit_log (id, action, caller_id, request_data, response_status, amount_ftc, error) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id, action, callerIp ?? null, JSON.stringify(requestData ?? {}), status, amount ?? null, error ?? null);
  }

  async function getAuditLog(limit = 50) { return await db.all('SELECT * FROM fc_gateway_audit_log ORDER BY created_at DESC LIMIT ?', limit); }

  async function getStats() {
    const config = await getConfig();
    const today = await db.get<{ requests: number; payments: number }>(
      "SELECT COUNT(*) as requests, COALESCE(SUM(amount_ftc), 0) as payments FROM fc_gateway_audit_log WHERE created_at >= CURRENT_DATE AND response_status = 'success'"
    );
    return { totalRequests: Number(config.total_requests), totalPayments: Number(config.total_payments_ftc), todayRequests: Number(today?.requests ?? 0), todayPayments: Number(today?.payments ?? 0) };
  }

  return { getConfig, updateConfig, regenerateApiKey, validateApiKey, checkPermission, checkGatewayLimits, processPayment, logAction, getAuditLog, getStats };
}
export type FCGatewayService = Awaited<ReturnType<typeof createFCGatewayService>>;
