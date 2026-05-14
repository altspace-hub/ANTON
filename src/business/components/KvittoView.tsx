/**
 * KvittoView — Skatteverket-compliant kvitto rendering.
 *
 * Returns the same model from kvittoToHtml(receipt, merchant) used for
 * print + share, plus a React component for in-app display. Both share
 * the same minimal styling so the on-screen and printed copies match.
 */
import { formatKvittoNumber } from '../services/types';
import type { MerchantConfig, Receipt } from '../services/types';

export function KvittoView({ receipt, merchant }: { receipt: Receipt; merchant: MerchantConfig }) {
  const subtotalSek = receipt.amountSek + receipt.discountSek;
  return (
    <div className="rounded-xl p-5 mono text-[13px] leading-relaxed"
         style={{
           backgroundColor: '#FFFFFF',
           color: '#1A1B2E',
           border: '1px solid var(--color-border)',
         }}>
      <div className="flex justify-between items-baseline mb-2">
        <div className="font-bold text-base" style={{ fontFamily: 'inherit' }}>
          {merchant.legalName}
        </div>
        <div className="text-xs" style={{ color: '#4F5267' }}>
          {formatKvittoNumber(receipt.kvittoNumber)}
        </div>
      </div>
      <div className="text-[11px]" style={{ color: '#4F5267' }}>
        Org. nr. {merchant.orgNr} · {merchant.street}, {merchant.postcode} {merchant.city}
      </div>
      <div className="text-[11px] mt-1" style={{ color: '#4F5267' }}>
        {new Date(receipt.createdAt).toISOString().slice(0, 16).replace('T', ' ')}
      </div>

      <hr className="my-3" style={{ borderColor: '#EAE7E0' }} />

      {receipt.lines && receipt.lines.length > 0 ? (
        <div className="flex flex-col gap-1">
          {receipt.lines.map((l, i) => (
            <div key={i} className="flex justify-between">
              <span>{l.quantity}× {l.name}</span>
              <span>{(l.unitPriceSek * l.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex justify-between">
          <span>Sale</span>
          <span>{subtotalSek.toFixed(2)}</span>
        </div>
      )}

      {receipt.discountSek > 0 && (
        <div className="flex justify-between mt-1" style={{ color: '#4F5267' }}>
          <span>Discount</span>
          <span>−{receipt.discountSek.toFixed(2)}</span>
        </div>
      )}

      <hr className="my-3" style={{ borderColor: '#EAE7E0' }} />

      {receipt.vatBreakdown.length > 0 && (
        <div className="text-[11px] mb-2" style={{ color: '#4F5267' }}>
          {receipt.vatBreakdown.map((b, i) => (
            <div key={i} className="flex justify-between">
              <span>VAT {b.rate}% (net {b.netSek.toFixed(2)})</span>
              <span>{b.vatSek.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between font-bold text-base">
        <span>Total SEK</span>
        <span>{receipt.amountSek.toFixed(2)}</span>
      </div>

      {receipt.amountMicroFtc > 0n && (
        <div className="flex justify-between text-[11px] mt-1"
             style={{ color: '#3070C7' }}>
          <span>Total FTC</span>
          <span>{(Number(receipt.amountMicroFtc) / 1_000_000).toFixed(4)}</span>
        </div>
      )}

      <hr className="my-3" style={{ borderColor: '#EAE7E0' }} />

      <div className="text-[10px]" style={{ color: '#686A7C' }}>
        Order {receipt.orderId} · {receipt.status}
      </div>
      {receipt.ref && (
        <div className="text-[10px] break-all" style={{ color: '#686A7C' }}>
          ref: {receipt.ref}
        </div>
      )}
    </div>
  );
}

/** HTML string for print/share. Same structure as the React component
 *  with inline styles so the print iframe needs no CSS bundle. */
export function kvittoToHtml(receipt: Receipt, merchant: MerchantConfig): string {
  const subtotalSek = receipt.amountSek + receipt.discountSek;
  const lineRows = (receipt.lines ?? []).map((l) => `
    <tr><td>${l.quantity}× ${escapeHtml(l.name)}</td><td class="num">${(l.unitPriceSek * l.quantity).toFixed(2)}</td></tr>
  `).join('');
  const vatRows = receipt.vatBreakdown.map((b) => `
    <tr><td>VAT ${b.rate}% (net ${b.netSek.toFixed(2)})</td><td class="num">${b.vatSek.toFixed(2)}</td></tr>
  `).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: 'Courier New', monospace; color: #1A1B2E; max-width: 480px; margin: 24px auto; padding: 20px; }
    .head { display:flex; justify-content:space-between; font-family: sans-serif; font-weight:700; font-size:18px; }
    .meta { color:#4F5267; font-size:11px; margin-top:4px; }
    table { width:100%; border-collapse:collapse; margin-top:12px; }
    td { padding:2px 0; }
    td.num { text-align:right; }
    hr { border:0; border-top:1px solid #EAE7E0; margin:12px 0; }
    .total { font-weight:700; font-size:16px; }
    .ftc { color:#3070C7; font-size:11px; }
    .foot { color:#686A7C; font-size:10px; margin-top:12px; }
  </style></head><body>
    <div class="head">
      <span>${escapeHtml(merchant.legalName)}</span>
      <span>${formatKvittoNumber(receipt.kvittoNumber)}</span>
    </div>
    <div class="meta">Org. nr. ${escapeHtml(merchant.orgNr)} · ${escapeHtml(merchant.street)}, ${escapeHtml(merchant.postcode)} ${escapeHtml(merchant.city)}</div>
    <div class="meta">${new Date(receipt.createdAt).toISOString().slice(0, 16).replace('T', ' ')}</div>
    <hr/>
    <table>${lineRows || `<tr><td>Sale</td><td class="num">${subtotalSek.toFixed(2)}</td></tr>`}</table>
    ${receipt.discountSek > 0 ? `<table><tr style="color:#4F5267"><td>Discount</td><td class="num">−${receipt.discountSek.toFixed(2)}</td></tr></table>` : ''}
    <hr/>
    ${vatRows ? `<table style="font-size:11px; color:#4F5267">${vatRows}</table>` : ''}
    <table class="total"><tr><td>Total SEK</td><td class="num">${receipt.amountSek.toFixed(2)}</td></tr></table>
    ${receipt.amountMicroFtc > 0n ? `<table class="ftc"><tr><td>Total FTC</td><td class="num">${(Number(receipt.amountMicroFtc) / 1_000_000).toFixed(4)}</td></tr></table>` : ''}
    <div class="foot">Order ${escapeHtml(receipt.orderId)} · ${escapeHtml(receipt.status)}</div>
    ${receipt.ref ? `<div class="foot" style="word-break:break-all">ref: ${escapeHtml(receipt.ref)}</div>` : ''}
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
