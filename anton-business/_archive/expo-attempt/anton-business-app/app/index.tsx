import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { hasWallet } from '../src/services/wallet';
import { hasConfig } from '../src/services/merchant';

export default function Index() {
  const [state, setState] = useState<'loading' | 'gen' | 'setup' | 'home'>('loading');

  useEffect(() => {
    (async () => {
      if (!(await hasWallet())) {
        setState('gen');
      } else if (!(await hasConfig())) {
        setState('setup');
      } else {
        setState('home');
      }
    })();
  }, []);

  if (state === 'loading') {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#2DD4A8" size="large" />
      </View>
    );
  }
  if (state === 'gen') return <Redirect href="/onboarding/welcome" />;
  if (state === 'setup') return <Redirect href="/onboarding/register" />;
  return <Redirect href="/home" />;
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F1B2D' },
});
