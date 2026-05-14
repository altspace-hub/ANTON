/**
 * KvittoView — the on-screen receipt rendering. Skatteverket /
 * Bokföringslagen-compliant per CLAUDE_ANTON_BUSINESS.md §7.
 *
 * Fields required by Bokföringslagen 5 kap.:
 *   - Seller's name + org nr (merchant.legalName, merchant.orgNr)
 *   - Date + time
 *   - Description of goods/services (lines for Extended, "Goods/Services" for Simple)
 *   - Price + VAT breakdown
 *   - Total
 *
 * ANTON Business additionally surfaces:
 *   - Kvitto number (sequential, gap-free)
 *   - Payment method "FutureChain Token (FTC)"
 *   - The encoded reference (so an auditor can match the on-chain tx)
 *   - The UETR (when confirmed via RPC poll — for now blank)
 *
 * The same render model is consumed by a future PDF export
 * (kvittoToHtml below) so on-device print + email use the same
 * source of truth.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { Receipt } from '../services/receipts';
import { formatKvittoNumber } from '../services/receipts';
import type { MerchantConfig } from '../services/merchant';

export function KvittoView({
  receipt,
  merchant,
}: {
  receipt: Receipt;
  merchant: MerchantConfig;
}) {
  const ftc = Number(receipt.amountMicroFtc) / 1_000_000;
  const created = new Date(receipt.createdAt);

  return (
    <View style={s.paper}>
      {/* Merchant header */}
      <Text style={s.merchant}>{merchant.legalName}</Text>
      <Text style={s.merchantSub}>Org. nr. {merchant.orgNr}</Text>
      <Text style={s.merchantSub}>
        {merchant.street}, {merchant.postcode} {merchant.city}
      </Text>

      <View style={s.hr} />

      {/* Kvitto number + date */}
      <View style={s.row}>
        <Text style={s.label}>Kvitto</Text>
        <Text style={s.value}>{formatKvittoNumber(receipt.kvittoNumber)}</Text>
      </View>
      <View style={s.row}>
        <Text style={s.label}>Date</Text>
        <Text style={s.value}>{formatDate(created)}</Text>
      </View>

      <View style={s.hr} />

      {/* Lines */}
      {receipt.lines && receipt.lines.length > 0 ? (
        receipt.lines.map((line) => (
          <View key={line.itemId} style={s.line}>
            <View style={s.lineLeft}>
              <Text style={s.lineName}>
                {line.name}
                {line.quantity > 1 ? ` × ${line.quantity}` : ''}
              </Text>
              <Text style={s.lineMeta}>VAT {line.vatRate}%</Text>
            </View>
            <Text style={s.lineValue}>
              {(line.unitPriceSek * line.quantity).toFixed(2)}
            </Text>
          </View>
        ))
      ) : (
        <View style={s.line}>
          <Text style={s.lineName}>Goods/Services</Text>
          <Text style={s.lineValue}>{receipt.amountSek.toFixed(2)}</Text>
        </View>
      )}

      <View style={s.hr} />

      {/* Discount, if any */}
      {receipt.discountSek > 0 && (
        <View style={s.row}>
          <Text style={s.label}>Discount</Text>
          <Text style={s.value}>−{receipt.discountSek.toFixed(2)}</Text>
        </View>
      )}

      {/* VAT breakdown */}
      {receipt.vatBreakdown.map((e) => (
        <View key={e.rate} style={s.row}>
          <Text style={s.labelSmall}>VAT {e.rate}% (on {e.netSek.toFixed(2)})</Text>
          <Text style={s.valueSmall}>{e.vatSek.toFixed(2)}</Text>
        </View>
      ))}

      <View style={s.hr} />

      {/* Total */}
      <View style={s.row}>
        <Text style={s.totalLabel}>Total SEK</Text>
        <Text style={s.totalValue}>{receipt.amountSek.toFixed(2)}</Text>
      </View>
      <View style={s.row}>
        <Text style={s.labelSmall}>Paid in FTC</Text>
        <Text style={s.valueSmall}>
          {ftc.toFixed(4)} (rate {receipt.ftcPerSek.toFixed(4)})
        </Text>
      </View>

      <View style={s.hr} />

      {/* Audit footer */}
      <View style={s.footer}>
        <Text style={s.footerSmall}>Payment method: FutureChain Token (FTC)</Text>
        <Text style={s.footerSmall}>Ref: {receipt.ref}</Text>
        {receipt.uetr && <Text style={s.footerSmall}>UETR: {receipt.uetr}</Text>}
        <Text style={s.footerStatus}>
          {receipt.status === 'voided' ? '⊘ VOIDED' :
            receipt.status === 'pending' ? '⌛ AWAITING CONFIRMATION' :
              '✓ Confirmed'}
        </Text>
      </View>
    </View>
  );
}

function formatDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const s = StyleSheet.create({
  paper: {
    backgroundColor: '#F5F3EF',
    borderRadius: 8,
    padding: 24,
    marginVertical: 8,
  },
  merchant: { color: '#1A1B2E', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  merchantSub: { color: '#4F5267', fontSize: 12, textAlign: 'center', marginTop: 2 },

  hr: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#7F8A9C', marginVertical: 12 },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginVertical: 2 },
  label: { color: '#4F5267', fontSize: 13, fontFamily: 'Courier' },
  value: { color: '#1A1B2E', fontSize: 13, fontFamily: 'Courier' },
  labelSmall: { color: '#7F8A9C', fontSize: 11, fontFamily: 'Courier' },
  valueSmall: { color: '#4F5267', fontSize: 11, fontFamily: 'Courier' },

  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginVertical: 4 },
  lineLeft: { flex: 1, marginRight: 12 },
  lineName: { color: '#1A1B2E', fontSize: 13, fontFamily: 'Courier' },
  lineMeta: { color: '#7F8A9C', fontSize: 10, fontFamily: 'Courier', marginTop: 1 },
  lineValue: { color: '#1A1B2E', fontSize: 13, fontFamily: 'Courier', fontVariant: ['tabular-nums'] },

  totalLabel: { color: '#1A1B2E', fontSize: 16, fontWeight: '700', fontFamily: 'Courier' },
  totalValue: { color: '#1A1B2E', fontSize: 16, fontWeight: '700', fontFamily: 'Courier', fontVariant: ['tabular-nums'] },

  footer: { alignItems: 'center', marginTop: 8 },
  footerSmall: { color: '#7F8A9C', fontSize: 10, fontFamily: 'Courier', marginVertical: 1 },
  footerStatus: { color: '#0D7D6C', fontSize: 12, fontFamily: 'Courier', fontWeight: '700', marginTop: 6 },
});

/** HTML form of the same kvitto, for the future expo-print PDF
 *  export. Same render model, different output surface. Kept here so
 *  the visual + audit fields stay in sync. */
export function kvittoToHtml(receipt: Receipt, merchant: MerchantConfig): string {
  const ftc = Number(receipt.amountMicroFtc) / 1_000_000;
  const created = new Date(receipt.createdAt);
  const formatDate = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const linesHtml = receipt.lines && receipt.lines.length > 0
    ? receipt.lines.map((l) => `
      <tr>
        <td>${escapeHtml(l.name)}${l.quantity > 1 ? ` × ${l.quantity}` : ''}<br><small>VAT ${l.vatRate}%</small></td>
        <td class="num">${(l.unitPriceSek * l.quantity).toFixed(2)}</td>
      </tr>`).join('')
    : `<tr><td>Goods/Services</td><td class="num">${receipt.amountSek.toFixed(2)}</td></tr>`;
  const vatHtml = receipt.vatBreakdown.map((e) =>
    `<tr><td><small>VAT ${e.rate}% (on ${e.netSek.toFixed(2)})</small></td>
         <td class="num"><small>${e.vatSek.toFixed(2)}</small></td></tr>`,
  ).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Courier New', monospace; max-width: 360px; margin: 24px auto; color: #1A1B2E; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 4px; }
  .sub { font-size: 11px; text-align: center; color: #4F5267; }
  hr { border: 0; border-top: 1px dashed #7F8A9C; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; font-size: 12px; vertical-align: top; }
  .num { text-align: right; }
  .total td { font-size: 15px; font-weight: 700; }
  .footer { text-align: center; font-size: 10px; color: #7F8A9C; margin-top: 8px; }
  .status { color: #0D7D6C; font-weight: 700; margin-top: 6px; }
  small { font-size: 10px; color: #7F8A9C; }
</style></head><body>
  <h1>${escapeHtml(merchant.legalName)}</h1>
  <div class="sub">Org. nr. ${escapeHtml(merchant.orgNr)}</div>
  <div class="sub">${escapeHtml(merchant.street)}, ${escapeHtml(merchant.postcode)} ${escapeHtml(merchant.city)}</div>
  <hr>
  <table>
    <tr><td>Kvitto</td><td class="num">${formatKvittoNumber(receipt.kvittoNumber)}</td></tr>
    <tr><td>Date</td><td class="num">${formatDate(created)}</td></tr>
  </table>
  <hr>
  <table>${linesHtml}</table>
  <hr>
  <table>
    ${receipt.discountSek > 0 ? `<tr><td>Discount</td><td class="num">−${receipt.discountSek.toFixed(2)}</td></tr>` : ''}
    ${vatHtml}
  </table>
  <hr>
  <table class="total">
    <tr><td>Total SEK</td><td class="num">${receipt.amountSek.toFixed(2)}</td></tr>
    <tr><td><small>Paid in FTC</small></td><td class="num"><small>${ftc.toFixed(4)} (rate ${receipt.ftcPerSek.toFixed(4)})</small></td></tr>
  </table>
  <hr>
  <div class="footer">
    Payment method: FutureChain Token (FTC)<br>
    Ref: ${escapeHtml(receipt.ref)}<br>
    ${receipt.uetr ? `UETR: ${escapeHtml(receipt.uetr)}<br>` : ''}
    <div class="status">${
      receipt.status === 'voided' ? '⊘ VOIDED' :
        receipt.status === 'pending' ? '⌛ AWAITING CONFIRMATION' :
          '✓ Confirmed'
    }</div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
