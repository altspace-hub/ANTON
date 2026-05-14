/**
 * Root layout. Onboarding lives under /onboarding/* and is reached
 * from the index redirect when no wallet is on device.
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
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ title: 'ANTON Business' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
