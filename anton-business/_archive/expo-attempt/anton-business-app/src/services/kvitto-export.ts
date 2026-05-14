/**
 * kvitto-export.ts — render a kvitto to PDF on-device + hand it off.
 *
 * Two surfaces:
 *   - shareKvitto(): runs the OS share-sheet. The merchant picks
 *     "Email", "Save to Drive", "Print", whatever fits. The PDF
 *     binary is what gets shared.
 *   - printKvitto(): opens the native print dialog directly.
 *
 * Both use the same HTML model (`kvittoToHtml`) that the in-app
 * `<KvittoView>` mirrors, so customers receive a PDF that matches
 * what the merchant saw on screen.
 *
 * The generated PDF lands in the cache dir (`expo-print` defaults).
 * It's automatically cleaned by the OS — we don't need to hold the
 * URI long-term. The kvitto itself is already persisted in
 * expo-sqlite for the 7-year retention story; the PDF is a derived
 * artifact that can be re-generated on demand.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { kvittoToHtml } from '../components/KvittoView';
import type { MerchantConfig } from './merchant';
import { formatKvittoNumber, type Receipt } from './receipts';

/** Render the kvitto to a PDF on disk + invoke the OS share-sheet.
 *  The user picks an email app, Drive, Print, etc. */
export async function shareKvitto(receipt: Receipt, merchant: MerchantConfig): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  const html = kvittoToHtml(receipt, merchant);
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Kvitto ${formatKvittoNumber(receipt.kvittoNumber)}`,
    UTI: 'com.adobe.pdf', // iOS hint
  });
}

/** Open the native print dialog directly. */
export async function printKvitto(receipt: Receipt, merchant: MerchantConfig): Promise<void> {
  const html = kvittoToHtml(receipt, merchant);
  await Print.printAsync({ html });
}
