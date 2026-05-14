/**
 * Onboarding step 3 — local merchant configuration.
 *
 * v2.0 phone-first model: no HTTP call to a backend. We save the
 * config to `expo-secure-store` and continue. The Safello receive
 * address the merchant enters is the only external dependency, and
 * it's set up bilaterally with Safello before they reach this screen.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { saveConfig, type MerchantConfig } from '../../src/services/merchant';
import { loadWallet } from '../../src/services/wallet';

interface Form {
  legalName: string;
  orgNr: string;
  city: string;
  street: string;
  postcode: string;
  vatRegistered: boolean;
  defaultVatRate: 0 | 6 | 12 | 25;
  safelloReceiveAddress: string;
  kvittoEmail: string;
}

export default function Register() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({
    legalName: '',
    orgNr: '',
    city: '',
    street: '',
    postcode: '',
    vatRegistered: true,
    defaultVatRate: 25,
    safelloReceiveAddress: '',
    kvittoEmail: '',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWallet().then((w) => {
      if (!w) {
        setError('No wallet on device — generate one first.');
      } else {
        setWalletAddress(w.address);
        // Default the Safello receive field to the merchant's own
        // wallet address; the merchant overrides if Safello gave
        // them a different sweep address.
        setForm((f) => ({ ...f, safelloReceiveAddress: w.address }));
      }
    });
  }, []);

  function bind<K extends keyof Form>(key: K) {
    return (value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    const required: Array<keyof Form> = [
      'legalName', 'orgNr', 'city', 'street', 'postcode', 'safelloReceiveAddress',
    ];
    for (const k of required) {
      if (typeof form[k] === 'string' && !(form[k] as string).trim()) {
        setError(`Fill ${k} before continuing.`);
        return;
      }
    }
    if (!walletAddress) {
      setError('Wallet missing — generate one first.');
      return;
    }
    setError(null);
    const config: MerchantConfig = {
      legalName: form.legalName.trim(),
      orgNr: form.orgNr.trim(),
      city: form.city.trim(),
      street: form.street.trim(),
      postcode: form.postcode.trim(),
      vatRegistered: form.vatRegistered,
      defaultVatRate: form.defaultVatRate,
      safelloReceiveAddress: form.safelloReceiveAddress.trim(),
      kvittoEmail: form.kvittoEmail.trim() || undefined,
      nextKvittoNumber: 1,
      configuredAt: Date.now(),
    };
    await saveConfig(config);
    router.replace('/onboarding/done');
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0F1B2D' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.heading}>Business details</Text>
        <Text style={s.body}>
          These appear on every kvitto. Everything is stored locally on
          this device — no servers involved.
        </Text>

        <Field label="Legal name" value={form.legalName} onChange={bind('legalName')} placeholder="Karl's Café AB" />
        <Field label="Org. nr." value={form.orgNr} onChange={bind('orgNr')} placeholder="SE556000-0000" />
        <Field label="Street" value={form.street} onChange={bind('street')} placeholder="Drottninggatan 1" />
        <Field label="Postcode" value={form.postcode} onChange={bind('postcode')} placeholder="11151" keyboardType="numeric" />
        <Field label="City" value={form.city} onChange={bind('city')} placeholder="Stockholm" />

        <View style={s.row}>
          <Text style={s.label}>VAT registered</Text>
          <Switch
            value={form.vatRegistered}
            onValueChange={bind('vatRegistered')}
            trackColor={{ true: '#1BA882', false: '#4F5267' }}
            thumbColor="#E0E0E0"
          />
        </View>

        {form.vatRegistered && (
          <View style={s.field}>
            <Text style={s.label}>Default VAT rate</Text>
            <View style={s.vatRow}>
              {[0, 6, 12, 25].map((r) => (
                <Pressable
                  key={r}
                  onPress={() => bind('defaultVatRate')(r as 0 | 6 | 12 | 25)}
                  style={[s.vatChip, form.defaultVatRate === r && s.vatChipActive]}
                >
                  <Text style={[s.vatChipText, form.defaultVatRate === r && s.vatChipTextActive]}>{r}%</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Text style={s.section}>Settlement</Text>
        <Text style={s.bodySmall}>
          Customer FTC payments will land at this address. If you have a
          Safello sweep agreement, use the address Safello gave you.
          Otherwise leave this as your own wallet address and manage
          conversion yourself.
        </Text>
        <Field
          label="Receive address"
          value={form.safelloReceiveAddress}
          onChange={bind('safelloReceiveAddress')}
          placeholder="fc_..."
        />

        <Text style={s.section}>Receipts</Text>
        <Field
          label="Email for kvitto (optional)"
          value={form.kvittoEmail}
          onChange={bind('kvittoEmail')}
          placeholder="receipts@karls-cafe.se"
          keyboardType="email-address"
        />

        {walletAddress && (
          <View style={s.walletBox}>
            <Text style={s.label}>Your wallet (identity)</Text>
            <Text style={s.walletText} selectable>{walletAddress}</Text>
          </View>
        )}

        {error && <Text style={s.err}>{error}</Text>}

        <Pressable
          style={[s.cta, !walletAddress && s.ctaDisabled]}
          disabled={!walletAddress}
          onPress={submit}
        >
          <Text style={s.ctaText}>Save and continue</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label, value, onChange, placeholder, keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#4F5267"
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
        autoCorrect={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 24, paddingBottom: 48 },
  heading: { fontSize: 24, fontWeight: '700', color: '#E0E0E0', marginBottom: 8 },
  body: { color: '#B0B0B0', fontSize: 14, lineHeight: 20, marginBottom: 20 },
  bodySmall: { color: '#B0B0B0', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  section: { color: '#2DD4A8', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 12 },
  field: { marginBottom: 14 },
  label: { color: '#7F8A9C', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    backgroundColor: '#152238',
    color: '#E0E0E0',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 14 },
  vatRow: { flexDirection: 'row', gap: 8 },
  vatChip: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#152238' },
  vatChipActive: { backgroundColor: '#2DD4A8' },
  vatChipText: { color: '#B0B0B0', fontWeight: '600' },
  vatChipTextActive: { color: '#0B1426' },
  walletBox: { marginTop: 16, padding: 12, backgroundColor: '#152238', borderRadius: 10 },
  walletText: { color: '#2DD4A8', fontFamily: 'Courier', fontSize: 13 },
  err: { color: '#E74C3C', fontSize: 14, marginTop: 12 },
  cta: {
    backgroundColor: '#2DD4A8',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#0B1426', fontSize: 17, fontWeight: '700' },
});
