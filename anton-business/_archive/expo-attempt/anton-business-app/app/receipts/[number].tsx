/**
 * Receipt detail — shows a single kvitto by number.
 *
 * Routed from the QR-screen "Paid ✓" tap and from the transactions
 * list. Renders the Skatteverket-compliant kvitto model and offers
 * the merchant Share / Print / Void actions.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KvittoView } from '../../src/components/KvittoView';
import { printKvitto, shareKvitto } from '../../src/services/kvitto-export';
import { loadConfig, type MerchantConfig } from '../../src/services/merchant';
import {
  getReceipt,
  voidReceipt,
  type Receipt,
} from '../../src/services/receipts';

export default function ReceiptDetail() {
  const { number } = useLocalSearchParams<{ number?: string }>();
  const kvittoNumber = Number(number);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [merchant, setMerchant] = useState<MerchantConfig | null>(null);
  const [busy, setBusy] = useState<'share' | 'print' | null>(null);

  useEffect(() => {
    if (!Number.isFinite(kvittoNumber)) return;
    Promise.all([getReceipt(kvittoNumber), loadConfig()]).then(([r, m]) => {
      setReceipt(r);
      setMerchant(m);
    });
  }, [kvittoNumber]);

  if (!Number.isFinite(kvittoNumber)) {
    return (
      <View style={s.center}>
        <Text style={s.body}>Invalid kvitto number.</Text>
      </View>
    );
  }

  if (!receipt || !merchant) {
    return <View style={s.center}><Text style={s.body}>Loading…</Text></View>;
  }

  async function onShare() {
    if (!receipt || !merchant) return;
    setBusy('share');
    try {
      await shareKvitto(receipt, merchant);
    } catch (err) {
      Alert.alert('Share failed', (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onPrint() {
    if (!receipt || !merchant) return;
    setBusy('print');
    try {
      await printKvitto(receipt, merchant);
    } catch (err) {
      Alert.alert('Print failed', (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onVoid() {
    if (!receipt) return;
    await voidReceipt(receipt.kvittoNumber);
    const refreshed = await getReceipt(receipt.kvittoNumber);
    setReceipt(refreshed);
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scroll}>
      <KvittoView receipt={receipt} merchant={merchant} />

      <View style={s.actions}>
        <View style={s.actionRow}>
          <Pressable style={s.actionSecondary} onPress={onShare} disabled={busy !== null}>
            {busy === 'share'
              ? <ActivityIndicator color="#E0E0E0" />
              : <Text style={s.actionSecondaryText}>Share PDF</Text>}
          </Pressable>
          <Pressable style={s.actionSecondary} onPress={onPrint} disabled={busy !== null}>
            {busy === 'print'
              ? <ActivityIndicator color="#E0E0E0" />
              : <Text style={s.actionSecondaryText}>Print</Text>}
          </Pressable>
        </View>

        <Pressable style={s.actionPrimary} onPress={() => router.replace('/home')}>
          <Text style={s.actionPrimaryText}>Done</Text>
        </Pressable>

        {receipt.status === 'confirmed' && (
          <Pressable style={s.actionVoid} onPress={onVoid}>
            <Text style={s.actionVoidText}>Void this kvitto</Text>
          </Pressable>
        )}
      </View>

      <Text style={s.helper}>
        Share opens your device&apos;s share-sheet — pick Email, Drive,
        or Print there. The PDF is generated on-device; nothing is
        uploaded to FutureChain or anywhere else.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1B2D' },
  scroll: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F1B2D' },
  body: { color: '#B0B0B0', fontSize: 14 },

  actions: { marginTop: 16, gap: 10 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionSecondary: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#152238', borderWidth: 1, borderColor: '#3B3D50' },
  actionSecondaryText: { color: '#E0E0E0', fontSize: 15, fontWeight: '600' },
  actionPrimary: { backgroundColor: '#2DD4A8', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  actionPrimaryText: { color: '#0B1426', fontSize: 17, fontWeight: '700' },
  actionVoid: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E74C3C' },
  actionVoidText: { color: '#E74C3C', fontSize: 14, fontWeight: '600' },

  helper: { color: '#7F8A9C', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 24, paddingHorizontal: 12 },
});
