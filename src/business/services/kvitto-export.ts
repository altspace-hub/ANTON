/**
 * kvitto-export.ts — print or share a kvitto.
 *
 * Same two surfaces as the Expo project's kvitto-export.ts:
 *   - shareKvitto(): hands a text + URL summary to the OS share-sheet
 *     (or the system clipboard in dev). The full PDF flow waits until
 *     we add a programmatic-PDF dep; for v1 the receipt URL is enough
 *     to email or SMS, and printKvitto() covers the "give me a hard
 *     copy" path.
 *   - printKvitto(): opens the WebView's print dialog. On Android the
 *     "Save as PDF" option lands a real PDF in Downloads/.
 */
import { formatKvittoNumber } from './types';
import { printHtml } from './pdf';
import { shareText } from './share';
import type { MerchantConfig, Receipt } from './types';

export async function shareKvitto(
  receipt: Receipt,
  merchant: MerchantConfig,
  kvittoHtml: string,
): Promise<void> {
  // Caller passes pre-rendered HTML so this module doesn't have to
  // import the React renderer (which would pull in React + jsx-runtime
  // into every code path).
  void kvittoHtml; // reserved for the future PDF path
  const title = `Kvitto ${formatKvittoNumber(receipt.kvittoNumber)}`;
  const lines = [
    `${title} — ${merchant.legalName}`,
    `Org. nr. ${merchant.orgNr}`,
    `${receipt.amountSek.toFixed(2)} SEK · ${receipt.itemCount} item(s)`,
    `Ref: ${receipt.ref}`,
  ];
  await shareText({
    title,
    text: lines.join('\n'),
  });
}

export async function printKvitto(_receipt: Receipt, _merchant: MerchantConfig, kvittoHtml: string): Promise<void> {
  await printHtml(kvittoHtml, `Kvitto ${formatKvittoNumber(_receipt.kvittoNumber)}`);
}
