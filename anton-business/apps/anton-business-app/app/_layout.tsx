/**
 * Root layout for the Expo Router stack.
 *
 * Placeholder for sprint 1. Will host: theme provider, query client,
 * auth gate (redirect to /onboarding if no wallet exists), session
 * timeout watcher.
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0B1426' },
          headerTintColor: '#E0E0E0',
          contentStyle: { backgroundColor: '#0F1B2D' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'ANTON Business' }} />
      </Stack>
    </>
  );
}
