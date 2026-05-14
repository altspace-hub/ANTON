import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { hasWallet } from '../src/services/wallet';

export default function Index() {
  const [state, setState] = useState<'loading' | 'gen' | 'home'>('loading');

  useEffect(() => {
    hasWallet().then((b) => setState(b ? 'home' : 'gen'));
  }, []);

  if (state === 'loading') {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#2DD4A8" size="large" />
      </View>
    );
  }
  if (state === 'gen') {
    return <Redirect href="/onboarding/welcome" />;
  }
  return <Redirect href="/home" />;
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F1B2D' },
});
