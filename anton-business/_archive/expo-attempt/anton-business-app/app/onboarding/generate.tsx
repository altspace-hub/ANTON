import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { createAndStoreWallet, hasWallet, loadWallet } from '../../src/services/wallet';

export default function Generate() {
  const [state, setState] = useState<'idle' | 'creating' | 'done' | 'existing' | 'error'>('idle');
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (await hasWallet()) {
        const w = await loadWallet();
        if (w) {
          setAddress(w.address);
          setState('existing');
        }
      }
    })();
  }, []);

  async function generate() {
    setState('creating');
    setError(null);
    try {
      const w = await createAndStoreWallet();
      setAddress(w.address);
      setState('done');
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  }

  return (
    <View style={s.container}>
      <Text style={s.heading}>Wallet</Text>

      {state === 'idle' && (
        <>
          <Text style={s.body}>
            We&apos;ll generate a secp256k1 keypair on this device. The
            private key never leaves your phone — it&apos;s stored in
            the device&apos;s secure keychain (iOS Keychain / Android
            Keystore).
          </Text>
          <Pressable style={s.cta} onPress={generate}>
            <Text style={s.ctaText}>Generate wallet</Text>
          </Pressable>
        </>
      )}

      {state === 'creating' && (
        <View style={s.spinner}>
          <ActivityIndicator color="#2DD4A8" size="large" />
          <Text style={s.body}>Generating…</Text>
        </View>
      )}

      {(state === 'done' || state === 'existing') && address && (
        <>
          {state === 'existing' && (
            <Text style={s.warn}>A wallet already exists on this device.</Text>
          )}
          <Text style={s.label}>Your merchant address</Text>
          <View style={s.address}>
            <Text style={s.addressText} selectable>
              {address}
            </Text>
          </View>
          <Text style={s.body}>
            This is what customers scan to pay you. It&apos;s public —
            you can share it freely.
          </Text>
          <Pressable style={s.cta} onPress={() => router.push('/onboarding/register')}>
            <Text style={s.ctaText}>Continue</Text>
          </Pressable>
        </>
      )}

      {state === 'error' && (
        <>
          <Text style={s.err}>{error ?? 'Unknown error'}</Text>
          <Pressable style={s.cta} onPress={() => setState('idle')}>
            <Text style={s.ctaText}>Try again</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0F1B2D' },
  heading: { fontSize: 24, fontWeight: '700', color: '#E0E0E0', marginBottom: 16 },
  body: { color: '#B0B0B0', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  warn: { color: '#F5A623', fontSize: 14, marginBottom: 16 },
  err: { color: '#E74C3C', fontSize: 15, marginBottom: 16 },
  spinner: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  label: { color: '#7F8A9C', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  address: {
    backgroundColor: '#152238',
    padding: 16,
    borderRadius: 10,
    marginBottom: 16,
  },
  addressText: {
    color: '#2DD4A8',
    fontFamily: 'Courier',
    fontSize: 14,
    lineHeight: 20,
  },
  cta: {
    backgroundColor: '#2DD4A8',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 'auto',
  },
  ctaText: { color: '#0B1426', fontSize: 17, fontWeight: '700' },
});
