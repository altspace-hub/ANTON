import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0B1426' },
        headerTintColor: '#E0E0E0',
        contentStyle: { backgroundColor: '#0F1B2D' },
      }}
    >
      <Stack.Screen name="welcome" options={{ title: 'Welcome' }} />
      <Stack.Screen name="generate" options={{ title: 'Create wallet' }} />
      <Stack.Screen name="register" options={{ title: 'Register' }} />
      <Stack.Screen name="done" options={{ title: 'Ready', headerBackVisible: false }} />
    </Stack>
  );
}
