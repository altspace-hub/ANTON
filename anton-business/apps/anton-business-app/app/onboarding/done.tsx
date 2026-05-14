import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function Done() {
  const { merchantId } = useLocalSearchParams<{ merchantId?: string }>();

  return (
    <View style={s.container}>
      <Text style={s.check}>✓</Text>
      <Text style={s.title}>You&apos;re registered</Text>
      {merchantId && (
        <View style={s.idBox}>
          <Text style={s.label}>Your merchant ID</Text>
          <Text style={s.idText} selectable>{merchantId}</Text>
        </View>
      )}
      <Text style={s.body}>
        Next steps (sprint 1 ships these):
      </Text>
      <Text style={s.body}>
        • Authorise auto-convert (sign a delegation){'\n'}
        • Take your first payment with Simple mode{'\n'}
        • View transactions and issue refunds
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
  idText: { color: '#2DD4A8', fontFamily: 'Courier', fontSize: 20, fontWeight: '700' },
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
