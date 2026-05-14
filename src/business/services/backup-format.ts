/**
 * backup-format.ts — pure functions used by the backup export.
 *
 * Separated from backup.ts because the I/O layer (Web Share + Blob
 * download in Capacitor) is platform-bound. These helpers are
 * testable in isolation under vitest's node environment.
 */
import type { Receipt, MerchantConfig } from './types';

const STALE_BACKUP_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Has it been more than 30 days since the last successful backup
 *  (or no backup ever)? Drives the Home-screen reminder banner. */
export function isBackupOverdue(config: MerchantConfig | null): boolean {
  if (!config) return false;
  if (!config.lastBackupAt) return true;
  return (Date.now() - config.lastBackupAt) > STALE_BACKUP_DAYS * MS_PER_DAY;
}

/** Build the CSV body for all kvittos. Header row in English so any
 *  bookkeeping spreadsheet anywhere imports it cleanly. */
export function buildCsv(receipts: Receipt[]): string {
  const headers = [
    'kvitto_number',
    'date_iso',
    'status',
    'mode',
    'purpose',
    'order_id',
    'merchant_id',
    'item_count',
    'subtotal_sek',
    'discount_sek',
    'vat_0_sek',
    'vat_6_sek',
    'vat_12_sek',
    'vat_25_sek',
    'vat_total_sek',
    'total_sek',
    'amount_micro_ftc',
    'ftc_per_sek',
    'reference',
    'uetr',
  ];
  const lines = [headers.join(',')];
  for (const r of receipts) {
    const vatByRate: Record<number, number> = { 0: 0, 6: 0, 12: 0, 25: 0 };
    for (const e of r.vatBreakdown) vatByRate[e.rate] = e.vatSek;
    const totalVat = Object.values(vatByRate).reduce((a, b) => a + b, 0);
    const subtotalSek = r.amountSek + r.discountSek;
    const row = [
      r.kvittoNumber,
      new Date(r.createdAt).toISOString(),
      r.status,
      r.mode,
      r.purpose,
      r.orderId,
      r.merchantId,
      r.itemCount,
      subtotalSek.toFixed(2),
      r.discountSek.toFixed(2),
      vatByRate[0]!.toFixed(2),
      vatByRate[6]!.toFixed(2),
      vatByRate[12]!.toFixed(2),
      vatByRate[25]!.toFixed(2),
      totalVat.toFixed(2),
      r.amountSek.toFixed(2),
      r.amountMicroFtc.toString(),
      r.ftcPerSek.toFixed(6),
      csvEscape(r.ref),
      r.uetr ?? '',
    ];
    lines.push(row.join(','));
  }
  return lines.join('\n') + '\n';
}

/** Quick HTML summary the merchant can print or save as a single
 *  human-readable manifest. */
export function buildHtmlSummary(receipts: Receipt[], merchant: MerchantConfig): string {
  const totalCount = receipts.length;
  const confirmedReceipts = receipts.filter((r) => r.status === 'confirmed');
  const totalSek = confirmedReceipts.reduce((sum, r) => sum + r.amountSek, 0);
  const totalVat = confirmedReceipts.reduce(
    (sum, r) => sum + r.vatBreakdown.reduce((a, e) => a + e.vatSek, 0),
    0,
  );
  const rows = receipts.map((r) => {
    const dt = new Date(r.createdAt);
    const date = dt.toISOString().slice(0, 16).replace('T', ' ');
    return `<tr class="${r.status}">
      <td>K-${r.kvittoNumber.toString().padStart(6, '0')}</td>
      <td>${date}</td>
      <td>${r.status}</td>
      <td>${r.mode}</td>
      <td class="num">${r.itemCount}</td>
      <td class="num">${r.amountSek.toFixed(2)}</td>
    </tr>`;
  }).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 24px auto; color: #1A1B2E; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #4F5267; font-size: 13px; margin-bottom: 24px; }
  .summary { background: #F5F3EF; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
  .summary table { width: 100%; }
  .summary td:first-child { color: #4F5267; }
  .summary td:last-child { text-align: right; font-weight: 600; font-family: 'Courier New', monospace; }
  table.kvittos { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.kvittos th { background: #152238; color: #E0E0E0; padding: 8px; text-align: left; font-size: 12px; }
  table.kvittos td { padding: 6px 8px; border-bottom: 1px solid #E5E5E5; font-family: 'Courier New', monospace; }
  table.kvittos td.num { text-align: right; }
  tr.voided td { color: #999; text-decoration: line-through; }
  tr.pending td { color: #F5A623; }
  .footer { color: #4F5267; font-size: 11px; margin-top: 24px; }
</style></head><body>
  <h1>${escapeHtml(merchant.legalName)} — kvitto archive</h1>
  <div class="sub">Org. nr. ${escapeHtml(merchant.orgNr)} · Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</div>

  <div class="summary">
    <table>
      <tr><td>Total kvittos</td><td>${totalCount}</td></tr>
      <tr><td>Confirmed</td><td>${confirmedReceipts.length}</td></tr>
      <tr><td>Total revenue (confirmed)</td><td>${totalSek.toFixed(2)} SEK</td></tr>
      <tr><td>Total VAT (confirmed)</td><td>${totalVat.toFixed(2)} SEK</td></tr>
    </table>
  </div>

  <table class="kvittos">
    <thead>
      <tr><th>Kvitto</th><th>Date</th><th>Status</th><th>Mode</th><th>Items</th><th>SEK</th></tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="6" style="text-align: center; color: #999">No kvittos yet.</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    Generated by ANTON Business v0.0.1 — full receipt detail is in the
    accompanying CSV file. Retain for 7 years per Bokföringslagen 5 kap.
  </div>
</body></html>`;
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
