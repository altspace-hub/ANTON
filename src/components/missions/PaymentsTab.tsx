// Mission Payments tab — financial settings + payment proposals.
// Disabled by default; user must opt in by setting financial_budget_max > 0.

import { useEffect, useState, useCallback } from 'react';
import { Wallet, Plus, AlertCircle, Check, X, Settings2, Clock } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type PaymentStatus = 'proposed' | 'approved' | 'cancelled' | 'executing' | 'executed' | 'failed';

interface Payment {
  id: string;
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
  failure_reason: string | null;
  created_at: string;
}

interface Settings {
  financial_budget_max: number;
  financial_budget_consumed: number;
  financial_max_per_transaction: number;
  approved_spend_categories: string[];
  payment_approval_delay_seconds: number;
  payment_requires_human_approval: boolean;
  payment_wallet_id: string | null;
}

const STATUS_META: Record<PaymentStatus, { label: string; classes: string }> = {
  proposed:   { label: 'Awaiting approval', classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  approved:   { label: 'Approved',          classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  cancelled:  { label: 'Cancelled',         classes: 'text-adv-gray border-border bg-adv-dark' },
  executing:  { label: 'Executing',         classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  executed:   { label: 'Executed',          classes: 'text-adv-green border-adv-green/40 bg-adv-green/10' },
  failed:     { label: 'Failed',            classes: 'text-adv-red border-adv-red/40 bg-adv-red/10' },
};

export default function PaymentsTab({ missionId }: { missionId: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Settings draft
  const [draft, setDraft] = useState<Settings | null>(null);

  // Propose form
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientLabel, setRecipientLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [purpose, setPurpose] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sRes, pRes] = await Promise.all([
        fetchWithAuth(`/api/missions/${missionId}/financial-settings`, { headers: getAuthHeader() }),
        fetchWithAuth(`/api/missions/${missionId}/payments`, { headers: getAuthHeader() }),
      ]);
      const sData = await sRes.json();
      if (!sRes.ok) throw new Error(sData?.error || `HTTP ${sRes.status}`);
      setSettings(sData.settings);
      const pData = await pRes.json();
      if (!pRes.ok) throw new Error(pData?.error || `HTTP ${pRes.status}`);
      setPayments(pData.payments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  useEffect(() => { void load(); }, [load]);

  async function saveSettings(): Promise<void> {
    if (!draft) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetchWithAuth(`/api/missions/${missionId}/financial-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          financial_budget_max: draft.financial_budget_max,
          financial_max_per_transaction: draft.financial_max_per_transaction,
          approved_spend_categories: draft.approved_spend_categories,
          payment_approval_delay_seconds: draft.payment_approval_delay_seconds,
          payment_requires_human_approval: draft.payment_requires_human_approval,
          payment_wallet_id: draft.payment_wallet_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSettings(data.settings); setShowSettings(false); setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function propose(): Promise<void> {
    setSubmitting(true); setError(null);
    try {
      const amtNum = parseFloat(amount);
      if (!Number.isFinite(amtNum) || amtNum <= 0) throw new Error('Amount must be a positive number');
      const res = await fetchWithAuth(`/api/missions/${missionId}/payments/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          recipient_address: recipientAddress,
          recipient_label: recipientLabel || undefined,
          amount_ftc: amtNum,
          category, purpose,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setShowPropose(false);
      setRecipientAddress(''); setRecipientLabel(''); setAmount(''); setCategory(''); setPurpose('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function approve(paymentId: string): Promise<void> {
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/missions/payments/${paymentId}/approve`, {
        method: 'POST', headers: getAuthHeader(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function cancel(paymentId: string): Promise<void> {
    const reason = prompt('Cancellation reason (optional):') ?? undefined;
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/missions/payments/${paymentId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading && !settings) return <div className="text-center text-xs text-adv-gray py-8">Loading…</div>;

  const enabled = settings && settings.financial_budget_max > 0;
  const remaining = settings ? settings.financial_budget_max - settings.financial_budget_consumed : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-adv-off-white">Financial</h2>
          <p className="text-[11px] text-adv-gray">FutureChain payments authorised by this mission.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setDraft(settings); setShowSettings(s => !s); }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
          </button>
          <button
            onClick={() => setShowPropose(s => !s)}
            disabled={!enabled}
            className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title={!enabled ? 'Enable a financial budget first' : ''}
          >
            <Plus className="h-3.5 w-3.5" />
            Propose payment
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[12px] text-adv-red flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Budget summary */}
      {settings && (
        <div className="rounded-xl border border-border bg-adv-card p-4">
          {!enabled ? (
            <div className="text-xs text-adv-gray">
              Financial budget is <span className="text-adv-gold font-medium">disabled</span>. Set a budget cap in Settings to enable payments.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <Stat label="Budget" value={`${settings.financial_budget_max.toFixed(2)} FTC`} />
              <Stat label="Consumed" value={`${settings.financial_budget_consumed.toFixed(2)} FTC`} />
              <Stat label="Remaining" value={`${remaining.toFixed(2)} FTC`} highlight={remaining < settings.financial_budget_max * 0.1} />
            </div>
          )}
        </div>
      )}

      {/* Settings drawer */}
      {showSettings && draft && (
        <div className="rounded-xl border border-border bg-adv-card p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-teal">Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <NumLabel label="Mission budget cap (FTC)" value={draft.financial_budget_max}
              onChange={v => setDraft({ ...draft, financial_budget_max: v })} />
            <NumLabel label="Per-transaction cap (FTC, 0 = no cap)" value={draft.financial_max_per_transaction}
              onChange={v => setDraft({ ...draft, financial_max_per_transaction: v })} />
            <NumLabel label="Approval delay (seconds, ≥ 30)" value={draft.payment_approval_delay_seconds}
              min={30} onChange={v => setDraft({ ...draft, payment_approval_delay_seconds: Math.max(30, Math.round(v)) })} />
            <label className="text-[11px] text-adv-gray">
              Wallet ID (optional)
              <input
                type="text"
                value={draft.payment_wallet_id ?? ''}
                onChange={e => setDraft({ ...draft, payment_wallet_id: e.target.value || null })}
                className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white"
              />
            </label>
          </div>
          <label className="block text-[11px] text-adv-gray">
            Approved categories (comma-separated, blank = any)
            <input
              type="text"
              value={draft.approved_spend_categories.join(', ')}
              onChange={e => setDraft({ ...draft, approved_spend_categories: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white"
              placeholder="advertising, subscriptions, vendor_fees"
            />
          </label>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => { setShowSettings(false); setDraft(null); }} className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white">Cancel</button>
            <button onClick={() => void saveSettings()} disabled={submitting} className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Propose drawer */}
      {showPropose && (
        <div className="rounded-xl border border-border bg-adv-card p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-teal">Propose payment</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-[11px] text-adv-gray">
              Recipient address
              <input type="text" value={recipientAddress} onChange={e => setRecipientAddress(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white font-mono" />
            </label>
            <label className="text-[11px] text-adv-gray">
              Recipient label (optional)
              <input type="text" value={recipientLabel} onChange={e => setRecipientLabel(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white" />
            </label>
            <label className="text-[11px] text-adv-gray">
              Amount (FTC)
              <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white" />
            </label>
            <label className="text-[11px] text-adv-gray">
              Category
              <input type="text" value={category} onChange={e => setCategory(e.target.value)}
                placeholder="e.g. advertising"
                className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white" />
            </label>
          </div>
          <label className="block text-[11px] text-adv-gray">
            Purpose
            <textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={2} maxLength={1000}
              className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white" />
          </label>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => setShowPropose(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white">Cancel</button>
            <button onClick={() => void propose()} disabled={submitting} className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              {submitting ? 'Proposing…' : 'Propose'}
            </button>
          </div>
        </div>
      )}

      {/* Payments list */}
      {payments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Wallet className="h-6 w-6 text-adv-gray mx-auto mb-2" />
          <p className="text-xs text-adv-gray">No payments yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-adv-card divide-y divide-border">
          {payments.map(p => {
            const meta = STATUS_META[p.status];
            const cancellable = p.status === 'proposed' || p.status === 'approved';
            const approvable = p.status === 'proposed';
            const cancelWindow = new Date(p.cancel_window_until);
            const windowOpen = cancelWindow.getTime() > Date.now();
            return (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-adv-off-white">{Number(p.amount_ftc).toFixed(2)} FTC</span>
                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium ${meta.classes}`}>
                        {meta.label}
                      </span>
                      <span className="text-[11px] text-adv-gray">[{p.category}]</span>
                    </div>
                    <p className="text-[11px] text-adv-off-white">{p.purpose}</p>
                    <p className="text-[10px] text-adv-gray">
                      to {p.recipient_label ? `${p.recipient_label} (${p.recipient_address.slice(0, 12)}…)` : p.recipient_address}
                    </p>
                    {p.status === 'approved' && windowOpen && (
                      <p className="text-[10px] text-adv-blue inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Settles after {cancelWindow.toLocaleTimeString()}
                      </p>
                    )}
                    {p.failure_reason && <p className="text-[11px] text-adv-red">{p.failure_reason}</p>}
                    {p.cancel_reason && <p className="text-[10px] text-adv-gray">Cancelled: {p.cancel_reason}</p>}
                    {p.fc_transaction_id && (
                      <p className="text-[10px] text-adv-green font-mono">FC tx: {p.fc_transaction_id}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {approvable && (
                      <button onClick={() => void approve(p.id)} className="rounded border border-adv-green/40 px-2 py-1 text-[11px] text-adv-green hover:bg-adv-green/10 inline-flex items-center gap-1">
                        <Check className="h-3 w-3" /> Approve
                      </button>
                    )}
                    {cancellable && (
                      <button onClick={() => void cancel(p.id)} className="rounded border border-adv-red/40 px-2 py-1 text-[11px] text-adv-red hover:bg-adv-red/10 inline-flex items-center gap-1">
                        <X className="h-3 w-3" /> Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded border border-border bg-adv-dark px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-adv-gray">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-adv-gold' : 'text-adv-off-white'}`}>{value}</div>
    </div>
  );
}

function NumLabel({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (v: number) => void }) {
  return (
    <label className="text-[11px] text-adv-gray">
      {label}
      <input
        type="number"
        step="0.01"
        min={min ?? 0}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white"
      />
    </label>
  );
}
