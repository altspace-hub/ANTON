// ── Missions — Financial Budget + Payment Proposals (Phase 4) ─────────────
//
// Layers on top of the existing FutureChain stack:
//   • fc_budget_rules / fc_spending_state / fc_spending_log → installation-wide caps
//   • fc_transactions / fc_wallets                          → transaction settlement
//   • missions.financial_budget_max / consumed              → mission-level cap
//   • missions.mission_payments                             → per-mission proposals
//
// Flow:
//   1. proposePayment() — checks mission cap + per-tx cap + category whitelist;
//      writes a `proposed` row with cancel_window_until = NOW() + delay.
//   2. approvePayment() — moves to `approved`. Cannot execute until the cancel
//      window has elapsed; runPendingExecutions() is the worker that flips
//      `approved → executing → executed` once the window passes.
//   3. cancelPayment() — terminal; refunds nothing because nothing was sent.
//   4. runPendingExecutions() — invoked by a scheduler tick; settles via
//      fc-transaction-service and updates missions.financial_budget_consumed.
//
// All state transitions append to mission_payment_log for audit.

import type { DatabaseAdapter } from '../../db/database.js';
import { randomUUID } from 'crypto';
// fc-budget-service / fc-transaction-service are dynamically imported inside
// the factory body. This matches the BEEHIVE / community-signing lazy-import
// pattern and removes any future circular-import risk if FC services later
// need to read mission-side data (e.g. "spending breakdown by mission").

export type PaymentStatus = 'proposed' | 'approved' | 'cancelled' | 'executing' | 'executed' | 'failed';

export interface PaymentProposalInput {
  missionId: string;
  taskId?: string;
  recipientAddress: string;
  recipientLabel?: string;
  amountFtc: number;
  category: string;
  purpose: string;
  walletId?: string;       // overrides mission default if provided
}

export interface MissionPaymentRow {
  id: string;
  mission_id: string;
  task_id: string | null;
  wallet_id: string;
  recipient_address: string;
  recipient_label: string | null;
  amount_ftc: string | number;
  category: string;
  purpose: string;
  status: PaymentStatus;
  cancel_window_until: string;
  approved_by: string | null;
  approved_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  executed_at: string | null;
  fc_transaction_id: string | null;
  budget_check_result: unknown;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface MissionFinancialSettings {
  financial_budget_max: number;
  financial_budget_consumed: number;
  financial_max_per_transaction: number;
  approved_spend_categories: string[];
  payment_approval_delay_seconds: number;
  payment_requires_human_approval: boolean;
  payment_wallet_id: string | null;
}

export async function createMissionBudget(db: DatabaseAdapter) {
  const { createFCBudgetService } = await import('../fc-budget-service.js');
  const { createFCTransactionService } = await import('../fc-transaction-service.js');
  const fcBudget = await createFCBudgetService(db);
  const fcTx = await createFCTransactionService(db);

  // ── Helpers ─────────────────────────────────────────────────────────────

  function newId(): string { return `mp_${randomUUID()}`; }

  async function getMissionFinancialSettings(missionId: string): Promise<MissionFinancialSettings> {
    interface Row {
      financial_budget_max: string | number;
      financial_budget_consumed: string | number;
      financial_max_per_transaction: string | number;
      approved_spend_categories: unknown;
      payment_approval_delay_seconds: number;
      payment_requires_human_approval: boolean;
      payment_wallet_id: string | null;
    }
    const row = await db.get<Row>(
      `SELECT financial_budget_max, financial_budget_consumed,
              financial_max_per_transaction, approved_spend_categories,
              payment_approval_delay_seconds, payment_requires_human_approval, payment_wallet_id
       FROM missions.missions WHERE id = ?`,
      missionId,
    );
    if (!row) throw new Error(`Mission not found: ${missionId}`);
    return {
      financial_budget_max: Number(row.financial_budget_max),
      financial_budget_consumed: Number(row.financial_budget_consumed),
      financial_max_per_transaction: Number(row.financial_max_per_transaction),
      approved_spend_categories: parseJsonArray(row.approved_spend_categories),
      payment_approval_delay_seconds: row.payment_approval_delay_seconds,
      payment_requires_human_approval: row.payment_requires_human_approval,
      payment_wallet_id: row.payment_wallet_id,
    };
  }

  async function logEvent(paymentId: string, event: string, actor: string | null, details: Record<string, unknown>): Promise<void> {
    await db.run(
      `INSERT INTO missions.mission_payment_log (payment_id, event, actor, details)
       VALUES (?, ?, ?, ?)`,
      paymentId, event, actor ?? 'system', JSON.stringify(details),
    );
  }

  // ── Propose a payment ───────────────────────────────────────────────────

  async function proposePayment(input: PaymentProposalInput, actor: string): Promise<MissionPaymentRow> {
    const settings = await getMissionFinancialSettings(input.missionId);

    // 0. Mission-level financial budget must be enabled (>0)
    if (settings.financial_budget_max <= 0) {
      throw new Error('Mission has no financial budget enabled. Set financial_budget_max > 0 first.');
    }
    // 1. Mission cap
    const remaining = settings.financial_budget_max - settings.financial_budget_consumed;
    if (input.amountFtc > remaining) {
      throw new Error(`Payment exceeds mission remaining budget (${remaining.toFixed(2)} FTC available)`);
    }
    // 2. Per-transaction cap
    if (settings.financial_max_per_transaction > 0 && input.amountFtc > settings.financial_max_per_transaction) {
      throw new Error(`Payment exceeds per-transaction cap (${settings.financial_max_per_transaction} FTC)`);
    }
    // 3. Category whitelist (skipped if empty)
    if (settings.approved_spend_categories.length > 0
        && !settings.approved_spend_categories.includes(input.category)) {
      throw new Error(`Category '${input.category}' is not in mission's approved categories: ${settings.approved_spend_categories.join(', ')}`);
    }
    // 4. Wallet resolution
    const walletId = input.walletId ?? settings.payment_wallet_id;
    if (!walletId) {
      throw new Error('No wallet specified — set payment_wallet_id on the mission or pass walletId');
    }
    // 5. Pre-check installation-wide FC budget — this only logs, doesn't block proposal
    const fcCheck = await fcBudget.checkSpending(input.amountFtc);
    if (fcCheck.result === 'blocked') {
      throw new Error(`Installation-wide FC budget would block this payment: ${fcCheck.reason}`);
    }

    const id = newId();
    const delaySeconds = settings.payment_approval_delay_seconds;
    const cancelWindow = new Date(Date.now() + delaySeconds * 1000).toISOString();

    await db.run(
      `INSERT INTO missions.mission_payments
        (id, mission_id, task_id, wallet_id, recipient_address, recipient_label,
         amount_ftc, category, purpose, status, cancel_window_until, budget_check_result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)`,
      id, input.missionId, input.taskId ?? null, walletId,
      input.recipientAddress, input.recipientLabel ?? null,
      input.amountFtc, input.category, input.purpose,
      cancelWindow, JSON.stringify(fcCheck),
    );
    await logEvent(id, 'proposed', actor, { amount_ftc: input.amountFtc, category: input.category, cancel_window_until: cancelWindow });
    await db.run(
      `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description, details)
       VALUES (?, ?, 'payment_proposed', ?, ?)`,
      input.missionId, input.taskId ?? null,
      `Payment proposed: ${input.amountFtc} FTC to ${input.recipientLabel ?? input.recipientAddress.slice(0, 12)}…`,
      JSON.stringify({ payment_id: id, amount_ftc: input.amountFtc, category: input.category }),
    );

    const row = await getPayment(id);
    if (!row) throw new Error('Payment row missing after insert');
    return row;
  }

  // ── Approve / cancel ────────────────────────────────────────────────────

  async function approvePayment(paymentId: string, actor: string): Promise<MissionPaymentRow> {
    const row = await getPayment(paymentId);
    if (!row) throw new Error(`Payment not found: ${paymentId}`);
    if (row.status !== 'proposed') throw new Error(`Cannot approve from status '${row.status}'`);
    // Separation of duties — the proposer cannot also approve. The proposer
    // is recorded as the actor on the 'proposed' log entry.
    const proposedEntry = await db.get<{ actor: string | null }>(
      `SELECT actor FROM missions.mission_payment_log
       WHERE payment_id = ? AND event = 'proposed' ORDER BY created_at ASC LIMIT 1`,
      paymentId,
    );
    if (proposedEntry?.actor && proposedEntry.actor === actor) {
      throw new Error('Separation of duties: the proposer cannot approve their own payment');
    }
    await db.run(
      `UPDATE missions.mission_payments
       SET status = 'approved', approved_by = ?, approved_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      actor, paymentId,
    );
    await logEvent(paymentId, 'approved', actor, {});
    const updated = await getPayment(paymentId);
    return updated!;
  }

  async function cancelPayment(paymentId: string, actor: string, reason?: string): Promise<MissionPaymentRow> {
    const row = await getPayment(paymentId);
    if (!row) throw new Error(`Payment not found: ${paymentId}`);
    if (row.status === 'executed' || row.status === 'failed' || row.status === 'cancelled') {
      throw new Error(`Cannot cancel from terminal status '${row.status}'`);
    }
    if (row.status === 'executing') {
      throw new Error('Cannot cancel: payment is currently executing');
    }
    await db.run(
      `UPDATE missions.mission_payments
       SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ?, updated_at = NOW()
       WHERE id = ?`,
      actor, reason ?? null, paymentId,
    );
    await logEvent(paymentId, 'cancelled', actor, { reason });
    await db.run(
      `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description, details)
       VALUES (?, ?, 'payment_cancelled', ?, ?)`,
      row.mission_id, row.task_id,
      `Payment cancelled: ${reason ?? 'no reason given'}`,
      JSON.stringify({ payment_id: paymentId, reason }),
    );
    const updated = await getPayment(paymentId);
    return updated!;
  }

  // ── Execute ready payments ──────────────────────────────────────────────

  async function runPendingExecutions(limit = 25): Promise<{ executed: number; failed: number; waiting: number }> {
    interface ReadyRow {
      id: string;
      mission_id: string;
      task_id: string | null;
      wallet_id: string;
      recipient_address: string;
      amount_ftc: string | number;
      category: string;
      purpose: string;
    }
    const ready = await db.all<ReadyRow>(
      `SELECT id, mission_id, task_id, wallet_id, recipient_address, amount_ftc, category, purpose
       FROM missions.mission_payments
       WHERE status = 'approved' AND cancel_window_until <= NOW()
       ORDER BY cancel_window_until ASC LIMIT ?`,
      limit,
    );
    const waitingRow = await db.get<{ count: string | number }>(
      `SELECT COUNT(*)::int AS count FROM missions.mission_payments
       WHERE status = 'approved' AND cancel_window_until > NOW()`,
    );
    let executed = 0; let failed = 0;
    for (const r of ready) {
      const result = await executePayment(r.id);
      if (result.success) executed++; else failed++;
    }
    return { executed, failed, waiting: Number(waitingRow?.count ?? 0) };
  }

  /**
   * Settle a single approved payment. Marks `executing`, builds + submits the
   * FC transaction, then either records the spend (mission + FC) or marks
   * `failed`.
   */
  async function executePayment(paymentId: string): Promise<{ success: boolean; error?: string; tx_id?: string }> {
    const row = await getPayment(paymentId);
    if (!row) return { success: false, error: 'not found' };
    if (row.status !== 'approved') return { success: false, error: `not in approved status (was ${row.status})` };

    // Re-verify human approval was actually recorded — defends against any
    // future code path that might flip status without going through approve.
    if (!row.approved_by) {
      return { success: false, error: 'payment is approved but has no approver recorded — refusing to execute' };
    }
    // Atomic transition — only the caller that flips approved → executing
    // proceeds. Concurrent ticks/manual calls see 0 rows updated and abort,
    // preventing double-execution + double-spend.
    const claimed = await db.get<{ id: string }>(
      `UPDATE missions.mission_payments SET status = 'executing', updated_at = NOW()
       WHERE id = ? AND status = 'approved' RETURNING id`,
      paymentId,
    );
    if (!claimed) return { success: false, error: 'race: another worker already claimed this payment' };
    await logEvent(paymentId, 'execute_started', null, {});

    try {
      // Re-check installation-wide FC budget at execution time (state may have moved)
      const amount = Number(row.amount_ftc);
      const recheck = await fcBudget.checkSpending(amount);
      if (recheck.result === 'blocked') {
        await markFailed(paymentId, `FC budget blocked at execution: ${recheck.reason ?? 'unknown'}`);
        return { success: false, error: recheck.reason };
      }

      // Resolve from-address from wallet
      const wallet = await db.get<{ address: string; wallet_type: string }>(
        `SELECT address, wallet_type FROM fc_wallets WHERE id = ?`,
        row.wallet_id,
      );
      if (!wallet) {
        await markFailed(paymentId, `Wallet not found: ${row.wallet_id}`);
        return { success: false, error: 'wallet not found' };
      }

      // Build + submit transaction
      const tx = await fcTx.buildTransaction({
        fromAddress: wallet.address,
        toAddress: row.recipient_address,
        amountFtc: amount,
        walletType: wallet.wallet_type as 'human' | 'agent',
        purpose: row.category,
        nature: 'mission_payment',
        goal: row.purpose.slice(0, 40),
        taskRef: row.task_id ?? row.mission_id,
      });
      const submitted = await fcTx.submitTransaction(tx.id);

      if (submitted.status !== 'confirmed') {
        await markFailed(paymentId, `Submission did not confirm: ${submitted.status}`);
        return { success: false, error: `submit returned ${submitted.status}` };
      }

      // Record spend on both the mission and the FC spending log
      await fcBudget.recordSpend(amount, tx.id);
      await db.run(
        `UPDATE missions.missions
         SET financial_budget_consumed = financial_budget_consumed + ?, updated_at = NOW()
         WHERE id = ?`,
        amount, row.mission_id,
      );
      await db.run(
        `UPDATE missions.mission_payments
         SET status = 'executed', executed_at = NOW(), fc_transaction_id = ?, updated_at = NOW()
         WHERE id = ?`,
        tx.id, paymentId,
      );
      await logEvent(paymentId, 'executed', null, { fc_transaction_id: tx.id, amount_ftc: amount });
      await db.run(
        `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description, details)
         VALUES (?, ?, 'payment_executed', ?, ?)`,
        row.mission_id, row.task_id,
        `Payment executed: ${amount} FTC, FC tx ${tx.id}`,
        JSON.stringify({ payment_id: paymentId, fc_transaction_id: tx.id, amount_ftc: amount }),
      );
      return { success: true, tx_id: tx.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markFailed(paymentId, message);
      return { success: false, error: message };
    }
  }

  async function markFailed(paymentId: string, reason: string): Promise<void> {
    await db.run(
      `UPDATE missions.mission_payments
       SET status = 'failed', failure_reason = ?, updated_at = NOW()
       WHERE id = ?`,
      reason, paymentId,
    );
    await logEvent(paymentId, 'failed', null, { reason });
  }

  // ── Read helpers ────────────────────────────────────────────────────────

  async function getPayment(id: string): Promise<MissionPaymentRow | null> {
    const row = await db.get<MissionPaymentRow>(`SELECT * FROM missions.mission_payments WHERE id = ?`, id);
    return row ?? null;
  }

  async function listMissionPayments(missionId: string): Promise<MissionPaymentRow[]> {
    return db.all<MissionPaymentRow>(
      `SELECT * FROM missions.mission_payments WHERE mission_id = ? ORDER BY created_at DESC`,
      missionId,
    );
  }

  async function getPaymentLog(paymentId: string): Promise<Array<{ id: number; event: string; actor: string | null; details: unknown; created_at: string }>> {
    return db.all(
      `SELECT id, event, actor, details, created_at
       FROM missions.mission_payment_log WHERE payment_id = ? ORDER BY created_at ASC`,
      paymentId,
    );
  }

  // ── Settings update (per-mission financial config) ──────────────────────

  async function updateFinancialSettings(missionId: string, updates: Partial<MissionFinancialSettings>): Promise<MissionFinancialSettings> {
    const allowed: Array<keyof MissionFinancialSettings> = [
      'financial_budget_max',
      'financial_max_per_transaction',
      'approved_spend_categories',
      'payment_approval_delay_seconds',
      'payment_requires_human_approval',
      'payment_wallet_id',
    ];
    // Enforce a minimum cancel-window delay so a proposal cannot become
    // executable before any human review window. Spec §5.3 default is 900s;
    // we cap the floor at 30s to allow tighter test scenarios but not zero.
    if (updates.payment_approval_delay_seconds !== undefined && updates.payment_approval_delay_seconds < 30) {
      throw new Error('payment_approval_delay_seconds cannot be set below 30 seconds');
    }
    const sets: string[] = []; const vals: unknown[] = [];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        sets.push(`${key} = ?`);
        vals.push(key === 'approved_spend_categories' ? JSON.stringify(updates[key]) : updates[key]);
      }
    }
    if (sets.length > 0) {
      sets.push('updated_at = NOW()');
      vals.push(missionId);
      await db.run(`UPDATE missions.missions SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    }
    return getMissionFinancialSettings(missionId);
  }

  return {
    proposePayment,
    approvePayment,
    cancelPayment,
    executePayment,
    runPendingExecutions,
    getPayment,
    listMissionPayments,
    getPaymentLog,
    getMissionFinancialSettings,
    updateFinancialSettings,
  };
}

export type MissionBudget = Awaited<ReturnType<typeof createMissionBudget>>;

function parseJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') {
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  }
  return [];
}
