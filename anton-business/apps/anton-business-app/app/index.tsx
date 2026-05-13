/**
 * Landing screen. Sprint 1: gate on whether a wallet exists. If yes,
 * route to /simple. If no, route to /onboarding. For now: stub
 * that shows scaffold status so the build doesn't fail.
 */
import { StyleSheet, Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ANTON Business</Text>
      <Text style={styles.subtitle}>Scaffold ready.</Text>
      <Text style={styles.body}>
        First sprint: implement @futurechain/sdk + onboarding (PIN + seed) + Simple-mode keypad.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0F1B2D',
  },
  title: { fontSize: 32, fontWeight: '700', color: '#2DD4A8', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#E0E0E0', marginBottom: 24 },
  body: { fontSize: 14, color: '#B0B0B0', textAlign: 'center', lineHeight: 20 },
});
