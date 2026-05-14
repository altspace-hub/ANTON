/**
 * Receipt detail — shows a single kvitto by number.
 *
 * Routed from the QR-screen "Paid ✓" tap and from the (future)
 * transactions list. Renders the same Skatteverket-compliant kvitto
 * model the PDF export will use.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KvittoView } from '../../src/components/KvittoView';
import {
  getReceipt,
  voidReceipt,
  type Receipt,
} from '../../src/services/receipts';
import { loadConfig, type MerchantConfig } from '../../src/services/merchant';

export default function ReceiptDetail() {
  const { number } = useLocalSearchParams<{ number?: string }>();
  const kvittoNumber = Number(number);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [merchant, setMerchant] = useState<MerchantConfig | null>(null);

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
        <Pressable style={s.action} onPress={() => router.replace('/home')}>
          <Text style={s.actionText}>Done</Text>
        </Pressable>
        {receipt.status === 'confirmed' && (
          <Pressable style={s.actionVoid} onPress={onVoid}>
            <Text style={s.actionVoidText}>Void this kvitto</Text>
          </Pressable>
        )}
      </View>

      <Text style={s.helper}>
        PDF export + email sharing land in the next commit (needs
        expo-print + expo-sharing). For now the kvitto is stored
        locally and available from the Transactions screen.
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
  action: { backgroundColor: '#2DD4A8', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  actionText: { color: '#0B1426', fontSize: 17, fontWeight: '700' },
  actionVoid: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E74C3C' },
  actionVoidText: { color: '#E74C3C', fontSize: 14, fontWeight: '600' },
  helper: { color: '#7F8A9C', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 24, paddingHorizontal: 12 },
});
