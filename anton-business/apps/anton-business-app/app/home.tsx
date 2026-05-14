import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { loadConfig, type MerchantConfig, wipeConfig } from '../src/services/merchant';
import { loadWallet, wipeWallet } from '../src/services/wallet';

export default function Home() {
  const [addr, setAddr] = useState<string | null>(null);
  const [config, setConfig] = useState<MerchantConfig | null>(null);

  useEffect(() => {
    loadWallet().then((w) => setAddr(w?.address ?? null));
    loadConfig().then(setConfig);
  }, []);

  async function reset() {
    await wipeWallet();
    await wipeConfig();
    router.replace('/');
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>Home</Text>
      {config ? (
        <Text style={s.welcome}>Welcome back, <Text style={s.welcomeBold}>{config.legalName}</Text>.</Text>
      ) : null}
      <Text style={s.body}>
        Onboarding done. Simple-mode keypad and Extended-mode cart land in sprint 2.
      </Text>
      {addr && (
        <View style={s.idBox}>
          <Text style={s.label}>Identity wallet</Text>
          <Text style={s.idText} selectable>{addr}</Text>
        </View>
      )}
      {config && (
        <View style={s.idBox}>
          <Text style={s.label}>Receive address (settlement)</Text>
          <Text style={s.idText} selectable>{config.safelloReceiveAddress}</Text>
        </View>
      )}
      <Pressable style={s.reset} onPress={reset}>
        <Text style={s.resetText}>Reset wallet + config (dev)</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0F1B2D' },
  title: { fontSize: 24, fontWeight: '700', color: '#E0E0E0', marginVertical: 16 },
  welcome: { color: '#E0E0E0', fontSize: 16, marginBottom: 8 },
  welcomeBold: { fontWeight: '700' },
  body: { color: '#B0B0B0', fontSize: 15, lineHeight: 22, marginBottom: 24 },
  idBox: { backgroundColor: '#152238', padding: 16, borderRadius: 10, marginBottom: 12 },
  label: { color: '#7F8A9C', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  idText: { color: '#2DD4A8', fontFamily: 'Courier', fontSize: 13 },
  reset: { paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#3B3D50', marginTop: 'auto' },
  resetText: { color: '#B0B0B0', fontSize: 14 },
});
