/**
 * agent-remittance.ts — the structured remittance an external agent may
 * attach to a payment proposal, plus a pure modal summariser.
 *
 * Kept runtime-SDK-free (the @futurechain/sdk type is erased at compile) so
 * server.ts can build + summarise an agent's remittance without pulling the
 * SDK into its module graph. The actual on-wire encoding (encodeRemittance →
 * PACS.008 RmtInf, with the size cap + v=1 validation) happens at submit time
 * in chain.ts, which is already SDK-bound.
 *
 * Scope (per #3): an agent can attach an invoice/order (items), an agreement
 * (decision + terms — the lightweight "contract" that rides with the payment),
 * or free-text info (message). File attachments are deliberately NOT exposed
 * to agents here.
 */
import type { AntonRemittance, AntonRemittanceItem } from '@futurechain/sdk/pacs008';

/** The remittance shape an agent sends on proposePayment. Maps 1:1 onto a
 *  v=1 AntonRemittance (the SDK adds nothing the agent shouldn't control). */
export interface AgentRemittanceInput {
  kind?: 'order' | 'invoice' | 'agreement' | 'message';
  ref?: string;
  items?: Array<{
    name: string; qty: number;
    unitPriceSek?: number; lineTotalSek?: number; vatRate?: number; sku?: string;
  }>;
  amountSek?: number;
  vatSek?: number;
  message?: string;
  decision?: string;
  terms?: string;
  meta?: Record<string, string>;
}

/** Build a v=1 AntonRemittance from an agent's input, inferring `kind` when
 *  the agent didn't set it (items → invoice; decision/terms → agreement; else
 *  message). Pure object construction — no SDK runtime. */
export function buildAntonRemittance(input: AgentRemittanceInput): AntonRemittance {
  const kind: AntonRemittance['kind'] = input.kind
    ?? (input.items && input.items.length > 0 ? 'invoice'
      : (input.decision || input.terms) ? 'agreement'
        : 'message');
  const items: AntonRemittanceItem[] | undefined = input.items?.map((it) => ({
    name: it.name, qty: it.qty,
    ...(it.unitPriceSek !== undefined ? { unitPriceSek: it.unitPriceSek } : {}),
    ...(it.lineTotalSek !== undefined ? { lineTotalSek: it.lineTotalSek } : {}),
    ...(it.vatRate !== undefined ? { vatRate: it.vatRate } : {}),
    ...(it.sku !== undefined ? { sku: it.sku } : {}),
  }));
  return {
    v: 1, kind,
    ...(input.ref !== undefined ? { ref: input.ref } : {}),
    ...(items ? { items } : {}),
    ...(input.amountSek !== undefined ? { amountSek: input.amountSek } : {}),
    ...(input.vatSek !== undefined ? { vatSek: input.vatSek } : {}),
    ...(input.message !== undefined ? { message: input.message } : {}),
    ...(input.decision !== undefined ? { decision: input.decision } : {}),
    ...(input.terms !== undefined ? { terms: input.terms } : {}),
    ...(input.meta !== undefined ? { meta: input.meta } : {}),
  };
}

/** Human-readable lines for the approval modal so the operator sees the
 *  invoice / agreement / info the agent attached before approving. Pure. */
export function summarizeRemittance(r: AntonRemittance): string[] {
  const label = LABELS[r.kind] ?? 'Remittance';
  const lines: string[] = [r.ref ? `${label} #${r.ref}` : label];
  if (r.items && r.items.length > 0) {
    for (const it of r.items.slice(0, 12)) {
      const qty = it.qty > 1 ? `${it.qty}× ` : '';
      const price = it.lineTotalSek ?? it.unitPriceSek;
      lines.push(`  ${qty}${it.name}${price !== undefined ? ` — ${price} SEK` : ''}`);
    }
    if (r.items.length > 12) lines.push(`  …and ${r.items.length - 12} more`);
  }
  if (r.amountSek !== undefined) {
    // "Stated" — this is the agent's claimed figure in SEK, NOT the FTC the
    // human is authorising (that's shown separately + prominently in the modal).
    lines.push(`Stated total: ${r.amountSek} SEK${r.vatSek !== undefined ? ` (VAT ${r.vatSek})` : ''}`);
  }
  if (r.decision) lines.push(`Agreed: ${truncate(r.decision, 200)}`);
  if (r.terms) lines.push(`Terms: ${truncate(r.terms, 200)}`);
  if (r.message) lines.push(`Message: ${truncate(r.message, 200)}`);
  // Escrow legs must be legible AT THE MONEY GATE. The collaboration gateway
  // stamps meta.escrow on fund/release/refund instructions, but the human
  // approving the spend previously saw only "an agreement payment" — with no
  // indication that this was, say, a RELEASE paying out custodial funds rather
  // than the original purchase. Surfacing it costs nothing: it rides the
  // existing remittanceSummary array, which both approval drivers already
  // render and control-strip.
  const m = r.meta as Record<string, unknown> | undefined;
  if (m?.escrow) {
    lines.push(`ESCROW ${String(m.escrow).toUpperCase()} leg`);
    if (m.escrowAddress) lines.push(`Escrow address: ${truncate(String(m.escrowAddress), 80)}`);
  }
  return lines;
}

const LABELS: Record<string, string> = {
  order: 'Order', invoice: 'Invoice', agreement: 'Agreement', message: 'Note', mixed: 'Remittance',
};

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
