/**
 * Settings — index page. Three sub-screens for now.
 */
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { loadConfig, type MerchantConfig } from '../../src/services/merchant';

export default function SettingsIndex() {
  const [config, setConfig] = useState<MerchantConfig | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scroll}>
      <Row href="/settings/profile" title="Profile" subtitle={config?.legalName ?? '—'} />
      <Row
        href="/settings/items"
        title="Items"
        subtitle="Manage your catalogue used in Extended mode"
      />
      <Row
        href="/settings/pricing"
        title="Pricing"
        subtitle={
          config ? `1 SEK = ${config.ftcPerSek.toFixed(4)} FTC` : '—'
        }
      />
    </ScrollView>
  );
}

function Row({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <Link href={href as any} asChild>
      <Pressable style={s.row}>
        <View style={s.rowLeft}>
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
        <Text style={s.chev}>›</Text>
      </Pressable>
    </Link>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1B2D' },
  scroll: { padding: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#152238',
    padding: 18,
    borderRadius: 12,
    marginBottom: 10,
  },
  rowLeft: { flex: 1 },
  title: { color: '#E0E0E0', fontSize: 16, fontWeight: '600' },
  subtitle: { color: '#7F8A9C', fontSize: 13, marginTop: 4 },
  chev: { color: '#4F5267', fontSize: 26, fontWeight: '300', marginLeft: 12 },
});
