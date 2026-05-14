/**
 * backup.ts — exports the merchant's full kvitto archive.
 *
 * v0 emits two files:
 *   - kvittos-<orgnr>-<date>.csv   Machine-readable, accountant-friendly.
 *   - kvittos-<orgnr>-<date>.html  Human-readable summary.
 *
 * Both are written to the device cache dir; the CSV is shared via
 * the OS share-sheet. The merchant picks Google Drive / iCloud /
 * email / etc. We don't upload anywhere ourselves.
 *
 * Pure helpers (buildCsv, buildHtmlSummary, isBackupOverdue) live in
 * `backup-format.ts` so vitest can cover them without pulling in
 * expo-file-system + expo-sharing native modules.
 *
 * SIE 4 (Swedish bookkeeping import format) is the v1.1 polish.
 */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { buildCsv, buildHtmlSummary } from './backup-format';
import { loadConfig, saveConfig } from './merchant';
import { listReceipts } from './receipts';

export { buildCsv, buildHtmlSummary, isBackupOverdue } from './backup-format';

/** Generate + share the backup archive. Stamps `lastBackupAt` on
 *  successful share. */
export async function runBackupExport(): Promise<{ count: number; csvUri: string }> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  const merchant = await loadConfig();
  if (!merchant) throw new Error('Merchant not configured.');

  const receipts = await listReceipts(10000);
  const dateStr = new Date().toISOString().slice(0, 10);
  const orgSafe = merchant.orgNr.replace(/[^A-Za-z0-9]/g, '');

  const csvBody = buildCsv(receipts);
  const csvUri = `${FileSystem.cacheDirectory}kvittos-${orgSafe}-${dateStr}.csv`;
  await FileSystem.writeAsStringAsync(csvUri, csvBody, { encoding: FileSystem.EncodingType.UTF8 });

  const htmlBody = buildHtmlSummary(receipts, merchant);
  const htmlUri = `${FileSystem.cacheDirectory}kvittos-${orgSafe}-${dateStr}.html`;
  await FileSystem.writeAsStringAsync(htmlUri, htmlBody, { encoding: FileSystem.EncodingType.UTF8 });

  await Sharing.shareAsync(csvUri, {
    mimeType: 'text/csv',
    dialogTitle: `Kvitto archive · ${receipts.length} kvittos`,
    UTI: 'public.comma-separated-values-text',
  });

  await saveConfig({ ...merchant, lastBackupAt: Date.now() });

  return { count: receipts.length, csvUri };
}
