/**
 * Settings — index page. Three sub-screens for now.
 */
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isBackupOverdue } from '../../src/services/backup';
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
      <Row
        href="/settings/backup"
        title="Backup"
        subtitle={backupSubtitle(config)}
        warn={isBackupOverdue(config)}
      />
    </ScrollView>
  );
}

function backupSubtitle(config: MerchantConfig | null): string {
  if (!config) return '—';
  if (!config.lastBackupAt) return 'Never exported';
  const dt = new Date(config.lastBackupAt);
  return `Last export ${dt.toISOString().slice(0, 10)}`;
}

function Row({ href, title, subtitle, warn }: { href: string; title: string; subtitle: string; warn?: boolean }) {
  return (
    <Link href={href as any} asChild>
      <Pressable style={s.row}>
        <View style={s.rowLeft}>
          <Text style={s.title}>{title}</Text>
          <Text style={[s.subtitle, warn && s.subtitleWarn]} numberOfLines={1}>
            {warn ? '⚠ ' : ''}{subtitle}
          </Text>
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
  subtitleWarn: { color: '#F5A623' },
  chev: { color: '#4F5267', fontSize: 26, fontWeight: '300', marginLeft: 12 },
});
