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
    // Cover all RFC1918 LAN ranges + .local mDNS so phones on any home
    // network can reach a paired ANTON instance.
    allowNavigation: ['*.local', '127.0.0.1', '192.168.*', '10.*', '172.16.*', '172.17.*', '172.18.*', '172.19.*', '172.20.*', '172.21.*', '172.22.*', '172.23.*', '172.24.*', '172.25.*', '172.26.*', '172.27.*', '172.28.*', '172.29.*', '172.30.*', '172.31.*'],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 800,
      backgroundColor: '#F5F3EF',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      // 'LIGHT' content = dark status-bar text (correct for warm-linen bg)
      style: 'LIGHT',
      backgroundColor: '#F5F3EF',
    },
    Keyboard: {
      resize: 'native',
      style: 'LIGHT',
      resizeOnFullScreen: true,
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
    // Phase 6 hardening — HTTPS-only. With the ANTON Mesh transport
    // (docs/ANTON_MESH_SPEC.md) every paired instance is reached over
    // wss:// through a relay; legacy public_https pairings should always
    // use https:// against a real cert. Cleartext from the WebView is
    // blocked at this layer AND at network_security_config.xml.
    allowMixedContent: false,
    backgroundColor: '#F5F3EF',
    // Capacitor 8 default min/target SDKs are overridden in
    // android/variables.gradle (minSdk 26, targetSdk 36).
  },
  ios: {
    // Spec §6.1 — iOS 16+, Xcode 26 / iOS 26 SDK build target.
    // Bonjour services (NSBonjourServices) live in Info.plist.
    // Background modes for VoIP-equivalent push are NOT used; keep
    // Apple's "limited" badge.
    contentInset: 'automatic',
    backgroundColor: '#F5F3EF',
    scheme: 'ANTON Companion',
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
