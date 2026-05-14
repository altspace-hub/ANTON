/**
 * ExtendedScreen — cart-based sale.
 *
 * Layout:
 *   - Cart bar (sticky top): item count + running total
 *   - Item grid: tap a catalogue item to add a quantity
 *   - Action bar: View cart / Charge
 *
 * Same wallet-aware behaviour as SimpleScreen: if the merchant
 * hasn't connected a wallet yet, the QR phase is skipped and we
 * issue a no-QR kvitto with the full VAT breakdown intact.
 */
import { useEffect, useMemo, useState } from 'react';
import { KvittoView } from '../components/KvittoView';
import PrimaryButton from '../components/PrimaryButton';
import QrDisplay from '../components/QrDisplay';
import { loadItems, type CatalogueItem } from '../services/items';
import { loadConfig } from '../services/merchant';
import {
  addLine, computeTotals, empty, removeLine, setQuantity,
  type Cart,
} from '../services/cart';
import { buildExtendedQr, computeMerchantId, generateOrderId, type BuiltQr } from '../services/qr';
import { persistReceipt } from '../services/receipts';
import type { MerchantConfig, Receipt } from '../services/types';
import { loadWallet } from '../services/wallet';

type Phase = 'cart' | 'review' | 'qr' | 'done';

export default function ExtendedScreen({ onBack }: { onBack: () => void }) {
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [cart, setCart] = useState<Cart>(empty());
  const [phase, setPhase] = useState<Phase>('cart');
  const [built, setBuilt] = useState<BuiltQr | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const cfg = await loadConfig();
      const wallet = await loadWallet();
      const cat = await loadItems();
      setConfig(cfg);
      setItems(cat);
      if (cfg) {
        const addr = wallet?.address ?? cfg.safelloReceiveAddress ?? cfg.orgNr;
        setMerchantId(computeMerchantId(cfg.orgNr, addr));
        setWalletConnected(!!wallet && !!cfg.safelloReceiveAddress);
      }
    })();
  }, []);

  const totals = useMemo(() => computeTotals(cart), [cart]);
  const amountFtc = useMemo(
    () => totals.totalSek * (config?.ftcPerSek ?? 0),
    [totals.totalSek, config],
  );

  function add(item: CatalogueItem) {
    setCart((c) => addLine(c, {
      itemId: item.id,
      name: item.name,
      unitPriceSek: item.unitPriceSek,
      vatRate: item.vatRate,
    }));
  }

  function generateQrOrIssue() {
    if (!config || !merchantId) return setError('Merchant not configured.');
    if (totals.totalSek <= 0) return setError('Cart is empty.');
    if (walletConnected) {
      try {
        const b = buildExtendedQr({
          toAddress: config.safelloReceiveAddress,
          merchantId,
          orderId: generateOrderId(),
          amountSek: totals.totalSek,
          ftcPerSek: config.ftcPerSek,
          vatSek: totals.totalVatSek,
          discountSek: totals.discountSek,
          itemCount: totals.itemCount,
          purpose: 'RESTAURANT',
        });
        setBuilt(b);
        setPhase('qr');
      } catch (err) {
        setError((err as Error).message);
      }
    } else {
      issueKvitto(null);
    }
  }

  async function issueKvitto(qr: BuiltQr | null) {
    if (!config || !merchantId) return;
    try {
      const r = await persistReceipt({
        orderId: qr?.inv ?? generateOrderId(),
        merchantId,
        mode: 'extended',
        purpose: 'RESTAURANT',
        amountSek: totals.totalSek,
        amountMicroFtc: qr?.amountMicroFtc ?? 0n,
        ftcPerSek: config.ftcPerSek,
        vatSek: totals.totalVatSek,
        discountSek: totals.discountSek,
        itemCount: totals.itemCount,
        lines: cart.lines,
        vatBreakdown: totals.vatBreakdown,
        qrUri: qr?.uri ?? '',
        ref: qr?.ref ?? '',
        status: 'confirmed',
      });
      setReceipt(r);
      setPhase('done');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function reset() {
    setCart(empty());
    setBuilt(null);
    setReceipt(null);
    setPhase('cart');
    setError(null);
  }

  if (!config) {
    return (
      <div className="flex flex-col h-full items-center justify-center"
           style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="text-sm" style={{ color: 'var(--color-text-faint)' }}>Loading…</div>
      </div>
    );
  }

  if (phase === 'done' && receipt) {
    return (
      <ReceiptIssued
        receipt={receipt}
        merchant={config}
        onAnother={reset}
        onBack={onBack}
      />
    );
  }

  if (phase === 'qr' && built) {
    return (
      <div className="flex flex-col h-full p-6 items-center safe-top safe-bottom"
           style={{ backgroundColor: 'var(--color-bg)' }}>
        <Header title="Show this to the customer" onBack={() => setPhase('cart')} />
        <div className="text-4xl font-light tabular mt-2"
             style={{ color: 'var(--color-text)' }}>
          {totals.totalSek.toFixed(2)} SEK
        </div>
        <div className="mono text-sm mt-1" style={{ color: 'var(--color-accent)' }}>
          {amountFtc.toFixed(4)} FTC
        </div>
        <div className="mt-6 p-4 rounded-2xl"
             style={{ backgroundColor: '#FFFFFF', border: '1px solid var(--color-border)' }}>
          <QrDisplay value={built.uri} size={240} />
        </div>
        <p className="text-sm mt-5 text-center"
           style={{ color: 'var(--color-text-muted)' }}>
          Customer scans with ANTON Communication to pay.
        </p>
        <p className="mono text-xs mt-1" style={{ color: 'var(--color-text-faint)' }}>
          Order {built.inv} · {totals.itemCount} item(s)
        </p>
        <div className="flex gap-3 mt-auto w-full">
          <button
            type="button"
            onClick={() => setPhase('cart')}
            className="flex-1 py-4 rounded-xl font-semibold"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
          >Back to cart</button>
          <button
            type="button"
            onClick={() => issueKvitto(built)}
            className="flex-1 py-4 rounded-xl font-bold"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
          >Paid ✓</button>
        </div>
      </div>
    );
  }

  // Cart phase
  return (
    <div className="flex flex-col h-full safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="px-6 pt-6 pb-3 flex justify-between items-center">
        <Header title="Extended sale" onBack={onBack} />
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider"
               style={{ color: 'var(--color-text-faint)' }}>
            Cart
          </div>
          <div className="text-lg font-bold tabular" style={{ color: 'var(--color-text)' }}>
            {totals.totalSek.toFixed(2)}
          </div>
        </div>
      </div>

      {cart.lines.length > 0 && (
        <div className="px-6 pb-2 max-h-[35%] overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            {cart.lines.map((line) => (
              <div key={line.itemId}
                   className="flex items-center justify-between p-2.5 rounded-lg"
                   style={{
                     backgroundColor: 'var(--color-surface)',
                     border: '1px solid var(--color-border-soft)',
                   }}>
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    {line.name}
                  </div>
                  <div className="text-[11px] mono mt-0.5"
                       style={{ color: 'var(--color-text-faint)' }}>
                    {line.unitPriceSek.toFixed(2)} × {line.quantity} = {(line.unitPriceSek * line.quantity).toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button"
                          onClick={() => setCart((c) => setQuantity(c, line.itemId, line.quantity - 1))}
                          className="w-7 h-7 rounded-full text-lg font-semibold flex items-center justify-center"
                          style={{
                            backgroundColor: 'var(--color-bg)',
                            color: 'var(--color-text)',
                            border: '1px solid var(--color-border)',
                          }}>−</button>
                  <span className="w-5 text-center tabular text-sm"
                        style={{ color: 'var(--color-text)' }}>{line.quantity}</span>
                  <button type="button"
                          onClick={() => setCart((c) => setQuantity(c, line.itemId, line.quantity + 1))}
                          className="w-7 h-7 rounded-full text-lg font-semibold flex items-center justify-center"
                          style={{
                            backgroundColor: 'var(--color-bg)',
                            color: 'var(--color-text)',
                            border: '1px solid var(--color-border)',
                          }}>+</button>
                  <button type="button"
                          onClick={() => setCart((c) => removeLine(c, line.itemId))}
                          className="w-7 h-7 rounded-full text-xs"
                          style={{ color: 'var(--color-error)' }}
                          aria-label={`Remove ${line.name}`}>×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 pt-3 pb-2">
        <div className="text-xs uppercase tracking-wider mb-2"
             style={{ color: 'var(--color-text-faint)' }}>
          {items.length > 0 ? 'Tap to add to cart' : 'No items in catalogue'}
        </div>
        {items.length === 0 ? (
          <div className="p-4 rounded-lg text-center text-sm"
               style={{
                 backgroundColor: 'var(--color-surface)',
                 color: 'var(--color-text-muted)',
                 border: '1px dashed var(--color-border)',
               }}>
            Add items in Settings → Items first, then come back here.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => add(item)}
                className="text-left p-3 rounded-xl active:scale-[0.97] transition-transform"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div className="font-semibold text-sm leading-tight"
                     style={{ color: 'var(--color-text)' }}>
                  {item.name}
                </div>
                <div className="text-xs mt-1 mono"
                     style={{ color: 'var(--color-text-muted)' }}>
                  {item.unitPriceSek.toFixed(2)} SEK
                </div>
                <div className="text-[10px] mt-0.5"
                     style={{ color: 'var(--color-text-faint)' }}>
                  VAT {item.vatRate}%
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="px-6 text-sm text-center" style={{ color: 'var(--color-error)' }}>{error}</p>
      )}

      <div className="p-6 pt-3">
        <PrimaryButton
          onClick={generateQrOrIssue}
          disabled={totals.totalSek <= 0}
          marginTopAuto={false}
        >
          {walletConnected ? `Charge ${totals.totalSek.toFixed(2)} SEK` : `Issue kvitto · ${totals.totalSek.toFixed(2)} SEK`}
        </PrimaryButton>
        {!walletConnected && totals.totalSek > 0 && (
          <p className="text-center text-xs mt-2"
             style={{ color: 'var(--color-text-faint)' }}>
            Connect a wallet in Settings to show a payment QR.
          </p>
        )}
      </div>
    </div>
  );
}

function ReceiptIssued({
  receipt, merchant, onAnother, onBack,
}: { receipt: Receipt; merchant: MerchantConfig; onAnother: () => void; onBack: () => void }) {
  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="p-6 pb-3">
        <Header title="Kvitto issued" onBack={onBack} />
      </div>
      <div className="px-6">
        <KvittoView receipt={receipt} merchant={merchant} />
      </div>
      <div className="p-6 flex flex-col gap-2 mt-auto">
        <PrimaryButton onClick={onAnother} marginTopAuto={false}>
          New sale
        </PrimaryButton>
        <button
          type="button"
          onClick={onBack}
          className="w-full py-3 rounded-xl font-semibold"
          style={{
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
          }}
        >Done</button>
      </div>
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 -ml-2">
      <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label="Back"
              style={{ color: 'var(--color-text-muted)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{title}</h2>
    </div>
  );
}
