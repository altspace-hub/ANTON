/**
 * Simple mode — keypad → QR.
 *
 * Sprint 2 task 1: generate the QR. Polling for the inbound PACS.008
 * (the "Paid ✓" state) lands when the FutureChain RPC module ships.
 * For now the merchant taps "Next" to clear once the customer scans.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { loadConfig, type MerchantConfig } from '../src/services/merchant';
import { loadWallet } from '../src/services/wallet';
import {
  buildSimpleQr,
  computeMerchantId,
  generateOrderId,
  type BuiltQr,
} from '../src/services/qr';
import { persistReceipt } from '../src/services/receipts';

type Phase = 'entry' | 'qr';

export default function Simple() {
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [amountSekString, setAmountSekString] = useState('0');
  const [phase, setPhase] = useState<Phase>('entry');
  const [built, setBuilt] = useState<BuiltQr | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const cfg = await loadConfig();
      const wallet = await loadWallet();
      setConfig(cfg);
      if (cfg && wallet) {
        setMerchantId(computeMerchantId(cfg.orgNr, wallet.address));
      }
    })();
  }, []);

  const amountSek = useMemo(() => parseAmount(amountSekString), [amountSekString]);
  const amountFtc = useMemo(() => {
    if (!config) return 0;
    return amountSek * config.ftcPerSek;
  }, [amountSek, config]);

  function press(key: string) {
    if (phase !== 'entry') return;
    setError(null);
    if (key === '⌫') {
      setAmountSekString((s) => (s.length <= 1 ? '0' : s.slice(0, -1)));
      return;
    }
    if (key === '.') {
      if (amountSekString.includes('.')) return;
      setAmountSekString((s) => s + '.');
      return;
    }
    setAmountSekString((s) => (s === '0' ? key : s + key));
  }

  function generateQr() {
    if (!config || !merchantId) {
      setError('Merchant not configured.');
      return;
    }
    if (amountSek <= 0) {
      setError('Enter an amount.');
      return;
    }
    try {
      const built = buildSimpleQr({
        toAddress: config.safelloReceiveAddress,
        merchantId,
        orderId: generateOrderId(),
        amountSek,
        ftcPerSek: config.ftcPerSek,
        purpose: 'RETAIL',
      });
      setBuilt(built);
      setPhase('qr');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function clear() {
    setAmountSekString('0');
    setBuilt(null);
    setPhase('entry');
    setError(null);
  }

  if (!config || !merchantId) {
    return (
      <View style={s.container}>
        <Text style={s.loading}>Loading…</Text>
      </View>
    );
  }

  async function confirmPayment() {
    if (!built || !merchantId) return;
    try {
      // Persist the kvitto and route to the receipt screen. When the
      // RPC poller lands, this transitions from manual-tap to
      // automatic on inbound PACS.008 detection — same persistence
      // call, just driven by a different event source.
      const r = await persistReceipt({
        orderId: built.inv,
        merchantId,
        mode: 'simple',
        purpose: 'RETAIL',
        amountSek,
        amountMicroFtc: built.amountMicroFtc,
        ftcPerSek: config!.ftcPerSek,
        vatBreakdown: [],
        qrUri: built.uri,
        ref: built.ref,
        status: 'confirmed',
      });
      clear();
      router.replace(`/receipts/${r.kvittoNumber}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (phase === 'qr' && built) {
    return (
      <QrPhase
        amountSek={amountSek}
        amountFtc={amountFtc}
        merchantName={config.legalName}
        built={built}
        onCancel={clear}
        onConfirm={confirmPayment}
      />
    );
  }

  return (
    <View style={s.container}>
      <View style={s.amountBox}>
        <Text style={s.amountLabel}>SEK</Text>
        <Text style={s.amount}>{amountSekString}</Text>
        <Text style={s.ftc}>≈ {amountFtc.toFixed(4)} FTC</Text>
      </View>

      {error && <Text style={s.err}>{error}</Text>}

      <View style={s.keypad}>
        {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map((k) => (
          <Pressable key={k} style={s.key} onPress={() => press(k)}>
            <Text style={s.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={[s.cta, amountSek <= 0 && s.ctaDisabled]} disabled={amountSek <= 0} onPress={generateQr}>
        <Text style={s.ctaText}>Generate QR</Text>
      </Pressable>
    </View>
  );
}

function QrPhase({
  amountSek, amountFtc, merchantName, built, onCancel, onConfirm,
}: {
  amountSek: number;
  amountFtc: number;
  merchantName: string;
  built: BuiltQr;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={s.qrContainer}>
      <Text style={s.qrAmount}>{amountSek.toFixed(2)} SEK</Text>
      <Text style={s.qrFtc}>{amountFtc.toFixed(4)} FTC</Text>
      <Text style={s.qrMerchant}>{merchantName}</Text>

      <View style={s.qrCard}>
        <QRCode
          value={built.uri}
          size={260}
          color="#0B1426"
          backgroundColor="#E0E0E0"
        />
      </View>

      <Text style={s.qrHelper}>Customer scans with ANTON Comm to pay.</Text>
      <Text style={s.qrInv}>Order {built.inv}</Text>

      <View style={s.qrActions}>
        <Pressable style={s.qrCancel} onPress={onCancel}>
          <Text style={s.qrCancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={s.qrNext} onPress={onConfirm}>
          <Text style={s.qrNextText}>Paid ✓</Text>
        </Pressable>
      </View>
    </View>
  );
}

function parseAmount(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0F1B2D' },
  loading: { color: '#B0B0B0', fontSize: 14, textAlign: 'center', marginTop: 32 },
  amountBox: { alignItems: 'center', paddingVertical: 24 },
  amountLabel: { color: '#7F8A9C', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  amount: { color: '#E0E0E0', fontSize: 56, fontWeight: '300', fontVariant: ['tabular-nums'] },
  ftc: { color: '#2DD4A8', fontSize: 16, fontFamily: 'Courier', marginTop: 6 },
  err: { color: '#E74C3C', fontSize: 14, marginBottom: 8, textAlign: 'center' },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginVertical: 16,
  },
  key: {
    width: '31.33%',
    aspectRatio: 1.6,
    backgroundColor: '#152238',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { color: '#E0E0E0', fontSize: 28, fontWeight: '500' },
  cta: { backgroundColor: '#2DD4A8', paddingVertical: 18, borderRadius: 12, alignItems: 'center', marginTop: 'auto' },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#0B1426', fontSize: 18, fontWeight: '700' },

  // QR phase
  qrContainer: { flex: 1, padding: 24, backgroundColor: '#0F1B2D', alignItems: 'center' },
  qrAmount: { color: '#E0E0E0', fontSize: 44, fontWeight: '300', marginTop: 16, fontVariant: ['tabular-nums'] },
  qrFtc: { color: '#2DD4A8', fontSize: 18, fontFamily: 'Courier', marginTop: 4 },
  qrMerchant: { color: '#B0B0B0', fontSize: 16, marginTop: 12, marginBottom: 24 },
  qrCard: { backgroundColor: '#E0E0E0', padding: 20, borderRadius: 16 },
  qrHelper: { color: '#7F8A9C', fontSize: 14, marginTop: 20, textAlign: 'center' },
  qrInv: { color: '#4F5267', fontSize: 12, fontFamily: 'Courier', marginTop: 8 },
  qrActions: { flexDirection: 'row', gap: 12, marginTop: 'auto', alignSelf: 'stretch' },
  qrCancel: { flex: 1, paddingVertical: 16, borderRadius: 12, borderWidth: 1, borderColor: '#3B3D50', alignItems: 'center' },
  qrCancelText: { color: '#B0B0B0', fontSize: 16, fontWeight: '600' },
  qrNext: { flex: 1, paddingVertical: 16, borderRadius: 12, backgroundColor: '#2DD4A8', alignItems: 'center' },
  qrNextText: { color: '#0B1426', fontSize: 16, fontWeight: '700' },
});
