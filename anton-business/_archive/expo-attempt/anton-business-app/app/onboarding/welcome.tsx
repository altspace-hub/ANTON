import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function Welcome() {
  return (
    <View style={s.container}>
      <Text style={s.title}>ANTON Business</Text>
      <Text style={s.tagline}>Accept FTC payments. Settle to your bank.</Text>

      <View style={s.bullets}>
        <Bullet label="Generate a merchant wallet on this device" />
        <Bullet label="Register with FutureChain after KYB" />
        <Bullet label="Take FTC payments via QR" />
        <Bullet label="Auto-convert to SEK via Safello" />
      </View>

      <Pressable style={s.cta} onPress={() => router.push('/onboarding/generate')}>
        <Text style={s.ctaText}>Get started</Text>
      </Pressable>

      <Text style={s.note}>
        Already onboarded? Tap Get started to recover from your seed.
      </Text>
    </View>
  );
}

function Bullet({ label }: { label: string }) {
  return (
    <View style={s.bullet}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0F1B2D' },
  title: { fontSize: 30, fontWeight: '700', color: '#2DD4A8', marginTop: 24 },
  tagline: { fontSize: 16, color: '#B0B0B0', marginTop: 8, marginBottom: 32 },
  bullets: { gap: 14, marginBottom: 'auto' },
  bullet: { flexDirection: 'row', gap: 12 },
  bulletDot: { color: '#2DD4A8', fontSize: 18, lineHeight: 22 },
  bulletText: { color: '#E0E0E0', fontSize: 16, lineHeight: 22, flex: 1 },
  cta: {
    backgroundColor: '#2DD4A8',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  ctaText: { color: '#0B1426', fontSize: 17, fontWeight: '700' },
  note: { color: '#7F8A9C', fontSize: 12, marginTop: 16, textAlign: 'center' },
});
