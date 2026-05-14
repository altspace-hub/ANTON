/**
 * Transactions / kvitto history. Most recent first. Tap a row to open
 * the detail view.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatKvittoNumber,
  listReceipts,
  type Receipt,
} from '../src/services/receipts';

export default function Transactions() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  // Reload on every focus — covers the "open receipt detail, void
  // it, come back" path without a manual refresh.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listReceipts().then((rs) => { if (!cancelled) setReceipts(rs); });
      return () => { cancelled = true; };
    }, []),
  );

  if (receipts.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyTitle}>No transactions yet.</Text>
        <Text style={s.emptyBody}>
          Once you take a payment via Simple or Extended mode, the
          kvitto shows up here. Tap any row for the full receipt.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={s.container}
      contentContainerStyle={s.scroll}
      data={receipts}
      keyExtractor={(r) => r.kvittoNumber.toString()}
      renderItem={({ item }) => (
        <Pressable
          style={s.row}
          onPress={() => router.push(`/receipts/${item.kvittoNumber}`)}
        >
          <View style={s.rowLeft}>
            <Text style={s.kvitto}>{formatKvittoNumber(item.kvittoNumber)}</Text>
            <Text style={s.meta}>
              {formatDate(item.createdAt)} · {item.mode === 'extended' ? `${item.itemCount} items` : '1 item'}
            </Text>
            <View style={s.statusRow}>
              <View style={[s.statusDot, statusDotStyle(item.status)]} />
              <Text style={s.statusText}>{statusLabel(item.status)}</Text>
            </View>
          </View>
          <Text style={s.amount}>{item.amountSek.toFixed(2)} SEK</Text>
        </Pressable>
      )}
    />
  );
}

function statusLabel(status: Receipt['status']): string {
  switch (status) {
    case 'pending':   return 'Awaiting confirmation';
    case 'confirmed': return 'Confirmed';
    case 'voided':    return 'Voided';
  }
}

function statusDotStyle(status: Receipt['status']) {
  switch (status) {
    case 'pending':   return { backgroundColor: '#F5A623' };
    case 'confirmed': return { backgroundColor: '#27AE60' };
    case 'voided':    return { backgroundColor: '#7F8A9C' };
  }
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1B2D' },
  scroll: { padding: 16 },
  empty: { flex: 1, padding: 24, backgroundColor: '#0F1B2D', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#E0E0E0', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyBody: { color: '#7F8A9C', fontSize: 14, lineHeight: 20, textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#152238', padding: 14, borderRadius: 10, marginBottom: 8 },
  rowLeft: { flex: 1 },
  kvitto: { color: '#E0E0E0', fontSize: 15, fontFamily: 'Courier', fontWeight: '600' },
  meta: { color: '#7F8A9C', fontSize: 12, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { color: '#B0B0B0', fontSize: 11 },
  amount: { color: '#2DD4A8', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
