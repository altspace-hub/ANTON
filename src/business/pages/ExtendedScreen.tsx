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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KvittoView } from '../components/KvittoView';
import PrimaryButton from '../components/PrimaryButton';
import QrDisplay from '../components/QrDisplay';
import ActiveSyncBanner from '../components/ActiveSyncBanner';
import { loadItems, type CatalogueItem } from '../services/items';
import { loadConfig } from '../services/merchant';
import {
  addLine, computeTotals, empty, removeLine, setQuantity,
  type Cart,
} from '../services/cart';
import { buildExtendedQr, computeMerchantId, generateOrderId, type BuiltQr } from '../services/qr';
import { merchantToCreditorParty } from '../services/payment-party';
import { persistReceipt } from '../services/receipts';
import { startActiveSync, type ActiveSyncSnapshot } from '../services/active-sync';
import { notifyReceiptConfirmed } from '../services/notifications';
import type { MerchantConfig, Receipt } from '../services/types';
import { loadWallet } from '../services/wallet';

type Phase = 'cart' | 'review' | 'qr' | 'done';

export default function ExtendedScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  // Active segment chip — null = show all items. Computed lazily from
  // distinct category values, so a flat (segment-less) catalogue keeps
  // the legacy single-grid layout.
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>(empty());
  const [phase, setPhase] = useState<Phase>('cart');
  const [built, setBuilt] = useState<BuiltQr | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSync, setActiveSync] = useState<ActiveSyncSnapshot | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const pendingReceiptIdRef = useRef<number | null>(null);

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
    if (!config || !merchantId) return setError(t('sale.errMerchant'));
    if (totals.totalSek <= 0) return setError(t('extended.errCartEmpty'));
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
          creditor: merchantToCreditorParty(config),
        });
        setBuilt(b);
        setPhase('qr');
      } catch (err) {
        setError((err as Error).message);
      }
    } else {
      // No wallet path → straight to manual confirm (cash sale).
      void manualFinish(null);
    }
  }

  async function persistPendingReceipt(qr: BuiltQr | null): Promise<Receipt | null> {
    if (!config || !merchantId) return null;
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
        status: 'pending',
        receivingAddress: config.safelloReceiveAddress || undefined,
      });
      setReceipt(r);
      pendingReceiptIdRef.current = r.kvittoNumber;
      return r;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }

  /** Manual force-confirm — chain-lag escape hatch (BlueWallet
   *  "limbo state" pattern). */
  async function manualFinish(qr: BuiltQr | null) {
    const r = receipt ?? await persistPendingReceipt(qr);
    if (!r) return;
    setReceipt(r);
    setPhase('done');
    cancelRef.current?.();
  }

  // Auto-arm on QR phase entry: persist pending receipt + 10-min
  // active-sync. Same Galoy POS pattern as SimpleScreen.
  useEffect(() => {
    if (phase !== 'qr' || !built || pendingReceiptIdRef.current !== null) return;
    let cancelled = false;
    void (async () => {
      const r = await persistPendingReceipt(built);
      if (cancelled || !r) return;
      const cancel = startActiveSync({
        budgetMs: 10 * 60 * 1000,
        onTick: setActiveSync,
        onFresh: (fresh) => {
          const match = fresh.find(f => f.kvittoNumber === r.kvittoNumber);
          if (match) {
            setReceipt(match);
            void notifyReceiptConfirmed(match);
            setPhase('done');
          } else {
            for (const f of fresh) void notifyReceiptConfirmed(f);
          }
        },
        onEnd: () => {
          cancelRef.current = null;
          setActiveSync(null);
        },
      });
      cancelRef.current = cancel;
      setActiveSync({ elapsedMs: 0, budgetMs: 10 * 60 * 1000, nextPollInMs: 5_000, pollCount: 0 });
    })();
    return () => { cancelled = true; cancelRef.current?.(); };
  }, [phase, built]);

  function reset() {
    cancelRef.current?.();
    pendingReceiptIdRef.current = null;
    setCart(empty());
    setBuilt(null);
    setReceipt(null);
    setActiveSync(null);
    setPhase('cart');
    setError(null);
  }

  if (!config) {
    return (
      <div className="flex flex-col h-full items-center justify-center"
           style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="text-sm" style={{ color: 'var(--color-text-faint)' }}>{t('common.loading')}</div>
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
        <Header title={t('sale.showToCustomer')} onBack={() => setPhase('cart')} />
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
          {t('sale.customerScans')}
        </p>
        <p className="mono text-xs mt-1" style={{ color: 'var(--color-text-faint)' }}>
          {t('extended.orderItems', { id: built.inv, count: totals.itemCount })}
        </p>

        {/* Live "Waiting for payment…" banner — auto-armed when this
            screen mounted. Same POS pattern as SimpleScreen. */}
        {activeSync && (
          <div className="mt-5 w-full">
            <ActiveSyncBanner
              snapshot={activeSync}
              onCancel={() => cancelRef.current?.()}
            />
          </div>
        )}

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
          >{t('extended.backToCart')}</button>
          <button
            type="button"
            onClick={() => manualFinish(built)}
            className="flex-1 py-4 rounded-xl font-bold"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
          >{t('sale.markPaid', 'Mark as paid')}</button>
        </div>
      </div>
    );
  }

  // Cart phase
  return (
    <div className="flex flex-col h-full safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="px-6 pt-6 pb-3 flex justify-between items-center">
        <Header title={t('extended.title')} onBack={onBack} />
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('extended.cart')}
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
                          aria-label={t('items.removeAria', { name: line.name })}>×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 pt-3 pb-2">
        <div className="text-xs uppercase tracking-wider mb-2"
             style={{ color: 'var(--color-text-faint)' }}>
          {items.length > 0 ? t('extended.tapToAdd') : t('extended.noItemsLabel')}
        </div>
        {items.length === 0 ? (
          <div className="p-4 rounded-lg text-center text-sm"
               style={{
                 backgroundColor: 'var(--color-surface)',
                 color: 'var(--color-text-muted)',
                 border: '1px dashed var(--color-border)',
               }}>
            {t('extended.noItemsHint')}
          </div>
        ) : (() => {
          // Build the ordered category list once per render.
          const seenCats = new Set<string>();
          const orderedCats: string[] = [];
          for (const it of items) {
            const c = (it.category ?? '').trim();
            if (!c || seenCats.has(c)) continue;
            seenCats.add(c);
            orderedCats.push(c);
          }
          // Filter visible items by the active chip (if any).
          const visible = activeCategory
            ? items.filter((i) => (i.category ?? '').trim() === activeCategory)
            : items;
          return (
            <>
              {orderedCats.length > 1 && (
                <div className="flex gap-2 overflow-x-auto mb-3 -mx-1 px-1 pb-1">
                  <button type="button" onClick={() => setActiveCategory(null)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
                          style={{
                            backgroundColor: activeCategory === null ? 'var(--color-accent)' : 'var(--color-surface)',
                            color: activeCategory === null ? 'var(--color-accent-fg)' : 'var(--color-text)',
                            border: '1px solid var(--color-border)',
                          }}>
                    {t('extended.allCategories', 'All')}
                  </button>
                  {orderedCats.map((cat) => (
                    <button key={cat} type="button" onClick={() => setActiveCategory(cat)}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
                            style={{
                              backgroundColor: activeCategory === cat ? 'var(--color-accent)' : 'var(--color-surface)',
                              color: activeCategory === cat ? 'var(--color-accent-fg)' : 'var(--color-text)',
                              border: '1px solid var(--color-border)',
                            }}>
                      {cat}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {visible.map((item) => (
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
                  {t('extended.vatPercent', { rate: item.vatRate })}
                </div>
              </button>
            ))}
              </div>
            </>
          );
        })()}
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
          {walletConnected
            ? t('extended.charge', { amount: totals.totalSek.toFixed(2) })
            : t('extended.issueKvitto', { amount: totals.totalSek.toFixed(2) })}
        </PrimaryButton>
        {!walletConnected && totals.totalSek > 0 && (
          <p className="text-center text-xs mt-2"
             style={{ color: 'var(--color-text-faint)' }}>
            {t('sale.connectWalletHint')}
          </p>
        )}
      </div>
    </div>
  );
}

function ReceiptIssued({
  receipt, merchant, onAnother, onBack,
}: { receipt: Receipt; merchant: MerchantConfig; onAnother: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="p-6 pb-3">
        <Header title={t('sale.kvittoIssued')} onBack={onBack} />
      </div>
      <div className="px-6">
        <KvittoView receipt={receipt} merchant={merchant} />
      </div>
      <div className="p-6 flex flex-col gap-2 mt-auto">
        <PrimaryButton onClick={onAnother} marginTopAuto={false}>
          {t('sale.newSale')}
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
        >{t('common.done')}</button>
      </div>
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 -ml-2">
      <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label={t('common.back')}
              style={{ color: 'var(--color-text-muted)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{title}</h2>
    </div>
  );
}
