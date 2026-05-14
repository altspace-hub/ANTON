import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { loadConfig, type MerchantConfig } from '../../src/services/merchant';

export default function Done() {
  const [config, setConfig] = useState<MerchantConfig | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  return (
    <View style={s.container}>
      <Text style={s.check}>✓</Text>
      <Text style={s.title}>You&apos;re set up</Text>
      {config && (
        <View style={s.idBox}>
          <Text style={s.label}>Business</Text>
          <Text style={s.idText}>{config.legalName}</Text>
          <Text style={s.org}>{config.orgNr}</Text>
        </View>
      )}
      <Text style={s.body}>
        Coming next (sprint 2):{'\n'}
        • Simple-mode keypad → QR{'\n'}
        • Extended-mode item catalogue{'\n'}
        • Receipt rendering + email{'\n'}
        • Refunds
      </Text>
      <Pressable style={s.cta} onPress={() => router.replace('/')}>
        <Text style={s.ctaText}>Go home</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0F1B2D', alignItems: 'center' },
  check: { fontSize: 80, color: '#2DD4A8', marginTop: 32, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: '#E0E0E0', marginBottom: 24 },
  idBox: {
    backgroundColor: '#152238',
    padding: 16,
    borderRadius: 10,
    width: '100%',
    marginBottom: 24,
  },
  label: { color: '#7F8A9C', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  idText: { color: '#E0E0E0', fontSize: 20, fontWeight: '600' },
  org: { color: '#B0B0B0', fontSize: 14, marginTop: 4, fontFamily: 'Courier' },
  body: { color: '#B0B0B0', fontSize: 15, lineHeight: 22, marginBottom: 14, alignSelf: 'flex-start' },
  cta: {
    backgroundColor: '#2DD4A8',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 'auto',
    alignSelf: 'stretch',
  },
  ctaText: { color: '#0B1426', fontSize: 17, fontWeight: '700' },
});
