import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { loadConfig, type MerchantConfig, wipeConfig } from '../src/services/merchant';
import { wipeItems } from '../src/services/items';
import { wipeDb } from '../src/services/db';
import { isBackupOverdue } from '../src/services/backup';
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
    await wipeItems();
    await wipeDb();
    router.replace('/');
  }

  return (
    <View style={s.container}>
      {config && (
        <Text style={s.welcome}>
          Welcome back, <Text style={s.welcomeBold}>{config.legalName}</Text>.
        </Text>
      )}

      {isBackupOverdue(config) && (
        <Pressable style={s.banner} onPress={() => router.push('/settings/backup')}>
          <Text style={s.bannerTitle}>⚠ Backup overdue</Text>
          <Text style={s.bannerBody}>
            It&apos;s been a while since you exported your kvitto archive.
            Tap to back up now (Bokföringslagen retention).
          </Text>
        </Pressable>
      )}

      <Pressable style={s.primary} onPress={() => router.push('/simple')}>
        <Text style={s.primaryText}>Take payment</Text>
        <Text style={s.primarySub}>Simple mode · keypad → QR</Text>
      </Pressable>

      <Pressable style={s.primary} onPress={() => router.push('/extended')}>
        <Text style={s.primaryText}>Extended mode</Text>
        <Text style={s.primarySub}>Cart with items + VAT breakdown</Text>
      </Pressable>

      <Pressable style={s.tertiary} onPress={() => router.push('/settings')}>
        <Text style={s.tertiaryText}>Settings</Text>
      </Pressable>

      <Pressable style={s.tertiary} onPress={() => router.push('/transactions')}>
        <Text style={s.tertiaryText}>Transactions</Text>
      </Pressable>

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
  welcome: { color: '#E0E0E0', fontSize: 16, marginBottom: 20 },
  welcomeBold: { fontWeight: '700' },

  banner: {
    backgroundColor: '#3B2A0F',
    borderLeftWidth: 4,
    borderLeftColor: '#F5A623',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 14,
  },
  bannerTitle: { color: '#F5A623', fontSize: 13, fontWeight: '700' },
  bannerBody: { color: '#B0B0B0', fontSize: 12, marginTop: 4, lineHeight: 16 },

  primary: {
    backgroundColor: '#2DD4A8',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 12,
  },
  primaryText: { color: '#0B1426', fontSize: 22, fontWeight: '700' },
  primarySub: { color: '#0B1426', fontSize: 13, opacity: 0.7, marginTop: 4 },

  secondary: {
    backgroundColor: '#152238',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginBottom: 12,
    opacity: 0.6,
  },
  secondaryText: { color: '#E0E0E0', fontSize: 17, fontWeight: '600' },
  secondarySub: { color: '#7F8A9C', fontSize: 12, marginTop: 4 },

  tertiary: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3B3D50',
    alignItems: 'center',
    marginBottom: 12,
  },
  tertiaryText: { color: '#B0B0B0', fontSize: 15, fontWeight: '600' },

  idBox: { backgroundColor: '#152238', padding: 14, borderRadius: 10, marginBottom: 10 },
  label: { color: '#7F8A9C', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  idText: { color: '#2DD4A8', fontFamily: 'Courier', fontSize: 12 },

  reset: { paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#3B3D50', marginTop: 'auto' },
  resetText: { color: '#7F8A9C', fontSize: 13 },
});
