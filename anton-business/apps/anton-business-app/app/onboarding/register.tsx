import { router } from 'expo-router';
import { sha256 } from '@noble/hashes/sha2';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { HttpError, api } from '../../src/services/api';
import { loadWallet } from '../../src/services/wallet';

interface Form {
  legalName: string;
  orgNr: string;
  city: string;
  street: string;
  postcode: string;
  vatRegistered: boolean;
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
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWallet().then((w) => {
      if (!w) {
        setError('No wallet on device — generate one first.');
      } else {
        setWalletAddress(w.address);
      }
    });
  }, []);

  function bind<K extends keyof Form>(key: K) {
    return (value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!walletAddress) return;
    if (!form.legalName || !form.orgNr || !form.city || !form.street || !form.postcode) {
      setError('Fill all fields before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // The kybMetadataHash is a placeholder: in the real flow this
      // would be a hash of the KYB documents submitted via the
      // off-app onboarding portal. For the beta we hash the form
      // fields themselves so it's verifiable but not document-bound.
      const enc = new TextEncoder();
      const blob = enc.encode(JSON.stringify(form));
      const hashBytes = sha256(blob);
      let hashHex = '';
      for (const b of hashBytes) hashHex += b.toString(16).padStart(2, '0');

      const res = await api.registerMerchant({
        walletAddress,
        kybMetadataHash: hashHex,
        legalName: form.legalName,
        orgNr: form.orgNr,
        city: form.city,
        street: form.street,
        postcode: form.postcode,
        vatRegistered: form.vatRegistered,
      });
      router.replace({
        pathname: '/onboarding/done',
        params: { merchantId: res.merchantId },
      });
    } catch (err) {
      if (err instanceof HttpError) {
        setError(`${err.body.code}: ${err.body.message}`);
      } else {
        setError((err as Error).message);
      }
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0F1B2D' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.heading}>Register</Text>
        <Text style={s.body}>
          KYB details. These are sent to the merchant backend and signed
          off as part of operator approval.
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

        {walletAddress && (
          <View style={s.walletBox}>
            <Text style={s.label}>Wallet</Text>
            <Text style={s.walletText} selectable>{walletAddress}</Text>
          </View>
        )}

        {error && <Text style={s.err}>{error}</Text>}

        <Pressable
          style={[s.cta, (submitting || !walletAddress) && s.ctaDisabled]}
          disabled={submitting || !walletAddress}
          onPress={submit}
        >
          {submitting ? (
            <ActivityIndicator color="#0B1426" />
          ) : (
            <Text style={s.ctaText}>Submit</Text>
          )}
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
  keyboardType?: 'default' | 'numeric';
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
        autoCapitalize="words"
        autoCorrect={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 24, paddingBottom: 48 },
  heading: { fontSize: 24, fontWeight: '700', color: '#E0E0E0', marginBottom: 8 },
  body: { color: '#B0B0B0', fontSize: 14, lineHeight: 20, marginBottom: 20 },
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 14,
  },
  walletBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#152238',
    borderRadius: 10,
  },
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
