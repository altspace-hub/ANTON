/**
 * Settings → Pricing. Edits the SEK→FTC rate the merchant uses to
 * convert displayed prices to the QR's `amount` field.
 *
 * In v0 this is a static value the merchant updates manually. A
 * future iteration pulls live rates from a FutureChain RPC oracle or
 * Safello's published rate so the merchant doesn't have to do this.
 * The kvitto records whatever rate was active at confirmation time.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { loadConfig, saveConfig, type MerchantConfig } from '../../src/services/merchant';

export default function Pricing() {
  const [original, setOriginal] = useState<MerchantConfig | null>(null);
  const [rateText, setRateText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    loadConfig().then((cfg) => {
      if (cfg) {
        setOriginal(cfg);
        setRateText(cfg.ftcPerSek.toString());
      }
    });
  }, []);

  const rate = useMemo(() => Number.parseFloat(rateText), [rateText]);
  const valid = Number.isFinite(rate) && rate > 0;

  async function save() {
    if (!original) return;
    if (!valid) { setError('Enter a positive number.'); return; }
    setError(null);
    await saveConfig({ ...original, ftcPerSek: rate });
    setSavedAt(Date.now());
    setTimeout(() => router.back(), 600);
  }

  if (!original) {
    return <View style={s.loading}><Text style={s.loadingText}>Loading…</Text></View>;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0F1B2D' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.heading}>Conversion rate</Text>
        <Text style={s.body}>
          This is the SEK → FTC rate used to compute the QR&apos;s amount
          field from displayed prices. The kvitto records whichever rate
          was in effect at confirmation. Update before a shift if the
          underlying market has moved.
        </Text>

        <View style={s.field}>
          <Text style={s.label}>FTC per 1 SEK</Text>
          <TextInput
            style={s.input}
            value={rateText}
            onChangeText={setRateText}
            placeholder="0.1"
            placeholderTextColor="#4F5267"
            keyboardType="decimal-pad"
            autoCorrect={false}
          />
          <Text style={s.hint}>
            {valid
              ? `1 FTC = ${(1 / rate).toFixed(2)} SEK · 1 SEK = ${rate.toFixed(4)} FTC`
              : 'Enter a positive decimal.'}
          </Text>
        </View>

        <View style={s.previewBox}>
          <Text style={s.previewLabel}>Example</Text>
          {[50, 100, 250].map((sek) => (
            <View key={sek} style={s.previewRow}>
              <Text style={s.previewSek}>{sek.toFixed(2)} SEK</Text>
              <Text style={s.previewFtc}>
                = {valid ? (sek * rate).toFixed(4) : '—'} FTC
              </Text>
            </View>
          ))}
        </View>

        {error && <Text style={s.err}>{error}</Text>}
        {savedAt && <Text style={s.ok}>Saved ✓</Text>}

        <Pressable style={[s.cta, !valid && s.ctaDisabled]} onPress={save} disabled={!valid}>
          <Text style={s.ctaText}>Save</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F1B2D' },
  loadingText: { color: '#B0B0B0' },
  scroll: { padding: 20, paddingBottom: 40 },
  heading: { color: '#E0E0E0', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  body: { color: '#B0B0B0', fontSize: 14, lineHeight: 20, marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { color: '#7F8A9C', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  input: {
    backgroundColor: '#152238',
    color: '#E0E0E0',
    fontSize: 24,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
  },
  hint: { color: '#7F8A9C', fontSize: 12, marginTop: 8 },
  previewBox: { backgroundColor: '#152238', borderRadius: 12, padding: 16, marginBottom: 16 },
  previewLabel: { color: '#7F8A9C', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  previewSek: { color: '#E0E0E0', fontSize: 15, fontVariant: ['tabular-nums'] },
  previewFtc: { color: '#2DD4A8', fontSize: 15, fontVariant: ['tabular-nums'], fontFamily: 'Courier' },
  err: { color: '#E74C3C', fontSize: 14 },
  ok: { color: '#27AE60', fontSize: 14, fontWeight: '600' },
  cta: { backgroundColor: '#2DD4A8', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#0B1426', fontSize: 17, fontWeight: '700' },
});
