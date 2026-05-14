/**
 * backup.ts — exports the merchant's full kvitto archive.
 *
 * Same v0 surface as the Expo project: emits a CSV (machine-readable,
 * accountant-friendly) and an HTML summary (human-readable manifest),
 * then hands the CSV to the OS share-sheet. On confirmed share the
 * lastBackupAt stamp updates so the Home banner dismisses.
 *
 * On Capacitor: @capacitor/share with a base64 data URL.
 * On desktop browser: anchor download.
 *
 * SIE 4 (Swedish bookkeeping import format) is the v1.1 polish.
 */
import { buildCsv, buildHtmlSummary } from './backup-format';
import { loadConfig, saveConfig } from './merchant';
import { listReceipts } from './receipts';
import { shareFile } from './share';

export { buildCsv, buildHtmlSummary, isBackupOverdue } from './backup-format';

export async function runBackupExport(): Promise<{ count: number; filename: string }> {
  const merchant = await loadConfig();
  if (!merchant) throw new Error('Merchant not configured.');

  const receipts = await listReceipts(10000);
  const dateStr = new Date().toISOString().slice(0, 10);
  const orgSafe = merchant.orgNr.replace(/[^A-Za-z0-9]/g, '');
  const csvBody = buildCsv(receipts);
  const filename = `kvittos-${orgSafe}-${dateStr}.csv`;

  await shareFile(
    { filename, mimeType: 'text/csv', body: csvBody },
    { title: `Kvitto archive · ${receipts.length} kvittos` },
  );

  await saveConfig({ ...merchant, lastBackupAt: Date.now() });

  return { count: receipts.length, filename };
}

/** Generate (without sharing) the HTML summary — useful for the
 *  Settings → "Preview backup" affordance. */
export async function previewBackupHtml(): Promise<string> {
  const merchant = await loadConfig();
  if (!merchant) throw new Error('Merchant not configured.');
  const receipts = await listReceipts(10000);
  return buildHtmlSummary(receipts, merchant);
}
