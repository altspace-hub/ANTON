import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { loadWallet, wipeWallet } from '../src/services/wallet';

export default function Home() {
  const [addr, setAddr] = useState<string | null>(null);

  useEffect(() => {
    loadWallet().then((w) => setAddr(w?.address ?? null));
  }, []);

  async function reset() {
    await wipeWallet();
    router.replace('/');
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>Home</Text>
      <Text style={s.body}>
        Onboarding done. The Simple-mode keypad and Extended-mode cart land in
        sprint 1 task 3.
      </Text>
      {addr && (
        <View style={s.idBox}>
          <Text style={s.label}>Merchant address</Text>
          <Text style={s.idText} selectable>{addr}</Text>
        </View>
      )}
      <Pressable style={s.reset} onPress={reset}>
        <Text style={s.resetText}>Reset wallet (dev)</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0F1B2D' },
  title: { fontSize: 24, fontWeight: '700', color: '#E0E0E0', marginVertical: 16 },
  body: { color: '#B0B0B0', fontSize: 15, lineHeight: 22, marginBottom: 24 },
  idBox: { backgroundColor: '#152238', padding: 16, borderRadius: 10, marginBottom: 'auto' },
  label: { color: '#7F8A9C', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  idText: { color: '#2DD4A8', fontFamily: 'Courier', fontSize: 14 },
  reset: { paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#3B3D50' },
  resetText: { color: '#B0B0B0', fontSize: 14 },
});
