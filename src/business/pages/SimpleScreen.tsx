/**
 * SimpleScreen — Simple-mode sale.
 *
 * Three phases:
 *   - entry: numeric keypad + amount preview
 *   - qr:    show the futurechain:pay QR (only if wallet connected)
 *   - done:  show the issued kvitto
 *
 * If no wallet is connected the QR phase is skipped. The merchant can
 * still issue a "no-QR" kvitto — useful for cash sales OR for trying
 * the app before committing to FTC.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Keypad from '../components/Keypad';
import { KvittoView } from '../components/KvittoView';
import PrimaryButton from '../components/PrimaryButton';
import QrDisplay from '../components/QrDisplay';
import { loadConfig } from '../services/merchant';
import { buildSimpleQr, computeMerchantId, generateOrderId, type BuiltQr } from '../services/qr';
import { persistReceipt } from '../services/receipts';
import type { MerchantConfig, Receipt } from '../services/types';
import { loadWallet } from '../services/wallet';

type Phase = 'entry' | 'qr' | 'done';

export default function SimpleScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [amountStr, setAmountStr] = useState('0');
  const [phase, setPhase] = useState<Phase>('entry');
  const [built, setBuilt] = useState<BuiltQr | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const cfg = await loadConfig();
      const wallet = await loadWallet();
      setConfig(cfg);
      if (cfg) {
        // If no wallet yet, derive merchant id from a placeholder address
        // so the kvitto's merchant_id field is stable. The id refreshes
        // automatically once the merchant connects a wallet.
        const addr = wallet?.address ?? cfg.safelloReceiveAddress ?? cfg.orgNr;
        setMerchantId(computeMerchantId(cfg.orgNr, addr));
        setWalletConnected(!!wallet && !!cfg.safelloReceiveAddress);
      }
    })();
  }, []);

  const amountSek = useMemo(() => parseAmount(amountStr), [amountStr]);
  const amountFtc = useMemo(() => amountSek * (config?.ftcPerSek ?? 0), [amountSek, config]);

  function press(key: string) {
    if (phase !== 'entry') return;
    setError(null);
    if (key === '⌫') {
      setAmountStr((s) => (s.length <= 1 ? '0' : s.slice(0, -1)));
      return;
    }
    if (key === '.') {
      if (amountStr.includes('.')) return;
      setAmountStr((s) => s + '.');
      return;
    }
    setAmountStr((s) => (s === '0' ? key : s + key));
  }

  function generateQr() {
    if (!config || !merchantId) return setError(t('sale.errMerchant'));
    if (amountSek <= 0) return setError(t('simple.errEnterAmount'));
    try {
      const b = buildSimpleQr({
        toAddress: config.safelloReceiveAddress || 'fc_pending_wallet',
        merchantId,
        orderId: generateOrderId(),
        amountSek,
        ftcPerSek: config.ftcPerSek,
        purpose: 'RETAIL',
      });
      setBuilt(b);
      setPhase('qr');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function issueKvitto(qr: BuiltQr | null) {
    if (!config || !merchantId) return;
    try {
      const r = await persistReceipt({
        orderId: qr?.inv ?? generateOrderId(),
        merchantId,
        mode: 'simple',
        purpose: 'RETAIL',
        amountSek,
        amountMicroFtc: qr?.amountMicroFtc ?? 0n,
        ftcPerSek: config.ftcPerSek,
        vatBreakdown: [],
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
    setAmountStr('0');
    setBuilt(null);
    setReceipt(null);
    setPhase('entry');
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
      <ReceiptIssuedView
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
        <Header title={t('sale.showToCustomer')} onBack={() => setPhase('entry')} />
        <div className="text-4xl font-light tabular mt-2"
             style={{ color: 'var(--color-text)' }}>
          {amountSek.toFixed(2)} SEK
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
          {t('simple.order', { id: built.inv })}
        </p>
        <div className="flex gap-3 mt-auto w-full">
          <button
            type="button"
            onClick={reset}
            className="flex-1 py-4 rounded-xl font-semibold"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
          >{t('common.cancel')}</button>
          <button
            type="button"
            onClick={() => issueKvitto(built)}
            className="flex-1 py-4 rounded-xl font-bold"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
          >{t('sale.paid')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <Header title={t('simple.title')} onBack={onBack} />

      <div className="flex flex-col items-center py-4">
        <div className="uppercase tracking-wider text-xs"
             style={{ color: 'var(--color-text-faint)' }}>
          SEK
        </div>
        <div className="text-6xl font-light tabular"
             style={{ color: 'var(--color-text)' }}>
          {amountStr}
        </div>
        <div className="mono text-base mt-1" style={{ color: 'var(--color-accent)' }}>
          {t('simple.ftcApprox', { amount: amountFtc.toFixed(4) })}
        </div>
      </div>

      {error && (
        <p className="text-sm text-center mb-2" style={{ color: 'var(--color-error)' }}>{error}</p>
      )}

      <Keypad onKey={press} />

      {walletConnected ? (
        <PrimaryButton
          onClick={generateQr}
          disabled={amountSek <= 0}
          marginTopAuto={false}
        >
          {t('simple.generateQr')}
        </PrimaryButton>
      ) : (
        <div className="flex flex-col gap-2">
          <PrimaryButton
            onClick={() => issueKvitto(null)}
            disabled={amountSek <= 0}
            marginTopAuto={false}
          >
            {t('simple.issueKvittoNoQr')}
          </PrimaryButton>
          <p className="text-center text-xs"
             style={{ color: 'var(--color-text-faint)' }}>
            {t('sale.connectWalletHint')}
          </p>
        </div>
      )}
    </div>
  );
}

function ReceiptIssuedView({
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
      <button
        type="button"
        onClick={onBack}
        className="p-2 rounded-lg"
        aria-label={t('common.back')}
        style={{ color: 'var(--color-text-muted)' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{title}</h2>
    </div>
  );
}

function parseAmount(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
