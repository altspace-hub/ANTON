/**
 * Settings → Backup. The merchant exports their full kvitto archive
 * (CSV + HTML manifest) and shares it to wherever they back up to —
 * Drive, iCloud, email to their accountant, etc.
 *
 * The button is always available. The Home-screen reminder banner
 * nudges them when it's been > 30 days since the last successful
 * export. Bokföringslagen 5 kap. requires 7 years of retention; this
 * is the safety net for "phone got dropped in the dishwasher" cases.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isBackupOverdue, runBackupExport } from '../../src/services/backup';
import { loadConfig, type MerchantConfig } from '../../src/services/merchant';
import { listReceipts } from '../../src/services/receipts';

export default function Backup() {
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [count, setCount] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const [cfg, receipts] = await Promise.all([loadConfig(), listReceipts(10000)]);
    setConfig(cfg);
    setCount(receipts.length);
  }

  async function runBackup() {
    setBusy(true);
    try {
      const { count } = await runBackupExport();
      await refresh();
      Alert.alert('Backup ready', `Shared ${count} kvitto${count === 1 ? '' : 's'}.`);
    } catch (err) {
      Alert.alert('Backup failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!config) {
    return <View style={s.center}><Text style={s.body}>Loading…</Text></View>;
  }

  const lastLabel = config.lastBackupAt
    ? new Date(config.lastBackupAt).toISOString().slice(0, 16).replace('T', ' ')
    : 'Never';
  const overdue = isBackupOverdue(config);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scroll}>
      <Text style={s.heading}>Kvitto archive</Text>
      <Text style={s.body}>
        Bokföringslagen requires you to retain receipts for 7 years.
        Your kvittos are stored locally on this device — back them up
        regularly so you don&apos;t lose them if the phone breaks or
        gets replaced.
      </Text>

      <View style={s.statsBox}>
        <View style={s.statRow}>
          <Text style={s.statLabel}>Kvittos on this device</Text>
          <Text style={s.statValue}>{count}</Text>
        </View>
        <View style={s.statRow}>
          <Text style={s.statLabel}>Last backup</Text>
          <Text style={[s.statValue, overdue && s.overdueText]}>{lastLabel}</Text>
        </View>
        {overdue && (
          <Text style={s.overdueHint}>
            ⚠ Over 30 days since the last backup. Export now.
          </Text>
        )}
      </View>

      <Pressable style={[s.cta, busy && s.ctaDisabled]} disabled={busy} onPress={runBackup}>
        {busy
          ? <ActivityIndicator color="#0B1426" />
          : <Text style={s.ctaText}>Export now</Text>}
      </Pressable>

      <Text style={s.helper}>
        Exports a CSV file with every kvitto split out by VAT rate. Your
        device&apos;s share-sheet opens — pick Email, Drive, iCloud, or
        whatever you back up to.{'\n\n'}
        SIE (Swedish bookkeeping import format) lands in a later release;
        the CSV imports cleanly into Fortnox / Visma / Bokio meanwhile.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1B2D' },
  scroll: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F1B2D' },
  heading: { color: '#E0E0E0', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  body: { color: '#B0B0B0', fontSize: 14, lineHeight: 20, marginBottom: 20 },
  statsBox: { backgroundColor: '#152238', borderRadius: 12, padding: 16, marginBottom: 16 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  statLabel: { color: '#7F8A9C', fontSize: 13 },
  statValue: { color: '#E0E0E0', fontSize: 14, fontVariant: ['tabular-nums'] },
  overdueText: { color: '#F5A623' },
  overdueHint: { color: '#F5A623', fontSize: 12, marginTop: 10 },
  cta: { backgroundColor: '#2DD4A8', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#0B1426', fontSize: 17, fontWeight: '700' },
  helper: { color: '#7F8A9C', fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
});
