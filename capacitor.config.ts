import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 8 config for the ANTON Companion app.
 *
 * Builds the same web codebase under src/app/ for three surfaces:
 *   - PWA      (served from the ANTON instance at /app/)
 *   - Android  (Capacitor; minSdk 26, targetSdk 36)
 *   - iOS      (Capacitor; deployment target 16.0, Xcode 26 / iOS 26 SDK
 *               for the April 2026 App Store cutoff)
 */
const config: CapacitorConfig = {
  appId: 'com.futurechain.anton.companion',
  appName: 'ANTON Companion',
  webDir: 'dist/app',
  // The web origin under which Capacitor serves the bundled assets.
  // Custom scheme matches the spec's anton:// deep-link world.
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: ['*.local', '127.0.0.1', '192.168.*'],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#0B1426',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0B1426',
    },
    // Push notifications — APNs / FCM bridge. Token registration happens
    // explicitly via push.ts; the plugin needs no extra config here.
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // SecureStorage uses Keychain on iOS (with kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly)
    // and Keystore on Android. The native plugin reads its config from
    // entitlements / strings.xml — no Capacitor-side options needed.
  },
  android: {
    allowMixedContent: false,         // HTTPS only in production
    backgroundColor: '#0B1426',
    // Capacitor 8 default min/target SDKs are overridden in
    // android/variables.gradle (minSdk 26, targetSdk 36).
  },
  ios: {
    // Spec §6.1 — iOS 16+, Xcode 26 / iOS 26 SDK build target.
    // Bonjour services (NSBonjourServices) live in Info.plist.
    // Background modes for VoIP-equivalent push are NOT used; keep
    // Apple's "limited" badge.
    contentInset: 'automatic',
    backgroundColor: '#0B1426',
    scheme: 'ANTON Companion',
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
