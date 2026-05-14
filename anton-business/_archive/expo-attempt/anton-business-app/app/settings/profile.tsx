/**
 * Settings → Profile. Edit the merchant config that was set during
 * onboarding. The wallet keypair (identity) is NOT editable here —
 * that's a one-time generation that requires the recovery seed to
 * change.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import {
  loadConfig,
  saveConfig,
  type MerchantConfig,
} from '../../src/services/merchant';

type DraftKeys =
  | 'legalName' | 'orgNr' | 'city' | 'street' | 'postcode'
  | 'safelloReceiveAddress' | 'kvittoEmail';

interface Draft extends Record<DraftKeys, string> {
  vatRegistered: boolean;
  defaultVatRate: 0 | 6 | 12 | 25;
}

export default function Profile() {
  const [original, setOriginal] = useState<MerchantConfig | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    loadConfig().then((cfg) => {
      if (!cfg) return;
      setOriginal(cfg);
      setDraft({
        legalName: cfg.legalName,
        orgNr: cfg.orgNr,
        city: cfg.city,
        street: cfg.street,
        postcode: cfg.postcode,
        safelloReceiveAddress: cfg.safelloReceiveAddress,
        kvittoEmail: cfg.kvittoEmail ?? '',
        vatRegistered: cfg.vatRegistered,
        defaultVatRate: cfg.defaultVatRate,
      });
    });
  }, []);

  if (!original || !draft) {
    return <View style={s.loading}><Text style={s.loadingText}>Loading…</Text></View>;
  }

  function bind<K extends keyof Draft>(key: K) {
    return (value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!draft || !original) return;
    const required: DraftKeys[] = ['legalName', 'orgNr', 'city', 'street', 'postcode', 'safelloReceiveAddress'];
    for (const k of required) {
      if (!draft[k].trim()) {
        setError(`${k} is required.`);
        return;
      }
    }
    setError(null);
    await saveConfig({
      ...original,
      legalName: draft.legalName.trim(),
      orgNr: draft.orgNr.trim(),
      city: draft.city.trim(),
      street: draft.street.trim(),
      postcode: draft.postcode.trim(),
      safelloReceiveAddress: draft.safelloReceiveAddress.trim(),
      kvittoEmail: draft.kvittoEmail.trim() || undefined,
      vatRegistered: draft.vatRegistered,
      defaultVatRate: draft.defaultVatRate,
    });
    setSavedAt(Date.now());
    setTimeout(() => router.back(), 600);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0F1B2D' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.section}>Identity</Text>
        <Field label="Legal name" value={draft.legalName} onChange={bind('legalName')} />
        <Field label="Org. nr." value={draft.orgNr} onChange={bind('orgNr')} />

        <Text style={s.section}>Address</Text>
        <Field label="Street" value={draft.street} onChange={bind('street')} />
        <Field label="Postcode" value={draft.postcode} onChange={bind('postcode')} keyboardType="numeric" />
        <Field label="City" value={draft.city} onChange={bind('city')} />

        <Text style={s.section}>VAT</Text>
        <View style={s.row}>
          <Text style={s.label}>VAT registered</Text>
          <Switch
            value={draft.vatRegistered}
            onValueChange={bind('vatRegistered')}
            trackColor={{ true: '#1BA882', false: '#4F5267' }}
            thumbColor="#E0E0E0"
          />
        </View>
        {draft.vatRegistered && (
          <View style={s.field}>
            <Text style={s.label}>Default VAT rate</Text>
            <View style={s.vatRow}>
              {([0, 6, 12, 25] as const).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => bind('defaultVatRate')(r)}
                  style={[s.vatChip, draft.defaultVatRate === r && s.vatChipActive]}
                >
                  <Text style={[s.vatChipText, draft.defaultVatRate === r && s.vatChipTextActive]}>{r}%</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Text style={s.section}>Settlement</Text>
        <Field
          label="Receive address"
          value={draft.safelloReceiveAddress}
          onChange={bind('safelloReceiveAddress')}
          autoCapitalize="none"
        />

        <Text style={s.section}>Receipts</Text>
        <Field
          label="Email for kvitto (optional)"
          value={draft.kvittoEmail}
          onChange={bind('kvittoEmail')}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {error && <Text style={s.err}>{error}</Text>}
        {savedAt && <Text style={s.ok}>Saved ✓</Text>}

        <Pressable style={s.cta} onPress={save}>
          <Text style={s.ctaText}>Save changes</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label, value, onChange, keyboardType, autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  autoCapitalize?: 'none' | 'words';
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholderTextColor="#4F5267"
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'words'}
        autoCorrect={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F1B2D' },
  loadingText: { color: '#B0B0B0' },
  scroll: { padding: 20, paddingBottom: 40 },
  section: { color: '#2DD4A8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  field: { marginBottom: 12 },
  label: { color: '#7F8A9C', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  input: {
    backgroundColor: '#152238',
    color: '#E0E0E0',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  vatRow: { flexDirection: 'row', gap: 8 },
  vatChip: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#152238' },
  vatChipActive: { backgroundColor: '#2DD4A8' },
  vatChipText: { color: '#B0B0B0', fontWeight: '600' },
  vatChipTextActive: { color: '#0B1426' },
  err: { color: '#E74C3C', fontSize: 14, marginTop: 12 },
  ok: { color: '#27AE60', fontSize: 14, marginTop: 12, fontWeight: '600' },
  cta: { backgroundColor: '#2DD4A8', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  ctaText: { color: '#0B1426', fontSize: 17, fontWeight: '700' },
});
