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
        <Stack.Screen name="simple" options={{ title: 'Take payment' }} />
        <Stack.Screen name="extended" options={{ title: 'Extended mode' }} />
        <Stack.Screen name="transactions" options={{ title: 'Transactions' }} />
        <Stack.Screen name="receipts/[number]" options={{ title: 'Kvitto' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
        <Stack.Screen name="settings/profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="settings/items" options={{ title: 'Items' }} />
        <Stack.Screen name="settings/pricing" options={{ title: 'Pricing' }} />
        <Stack.Screen name="settings/backup" options={{ title: 'Backup' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
