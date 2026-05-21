import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 8 config for the ANTON Business app.
 *
 * Mirrors `capacitor.config.comm.ts` exactly — same build/install
 * pattern, separate app ID + android project so the Comm App and
 * Business app coexist on the same phone for the merchant-and-customer
 * end-to-end test.
 *
 * Web bundle: dist/business/ (built via `pnpm build:business:cap`)
 * Android project: android-business/
 */
const config: CapacitorConfig = {
  appId: 'com.futurechain.anton.business',
  appName: 'ANTON Business',
  webDir: 'dist/business',
  // Suppress Capacitor's VERBOSE plugin-call trace even in debug
  // builds (see capacitor.config.pay.ts for the rationale — the
  // FcSecureSigner.wrap migration leaks priv hex via methodData
  // unless this is set).
  loggingBehavior: 'production',
  android: {
    path: 'android-business',
    allowMixedContent: false,
    backgroundColor: '#F5F3EF',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#F5F3EF',
    scheme: 'ANTON Business',
    limitsNavigationsToAppBoundDomains: false,
    path: 'ios-business',
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: [
      // Whitelist for the merchant's own FutureChain RPC + Safello
      // touchpoints. v0 talks to RPC directly so http/https on these
      // is fine. The production allowlist tightens to the canonical
      // host once it's set.
      '*.local',
      'localhost',
      '127.0.0.1',
      '192.168.*',
      '10.*',
      '172.16.*', '172.17.*', '172.18.*', '172.19.*',
      '172.20.*', '172.21.*', '172.22.*', '172.23.*',
      '172.24.*', '172.25.*', '172.26.*', '172.27.*',
      '172.28.*', '172.29.*', '172.30.*', '172.31.*',
    ],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 600,
      backgroundColor: '#F5F3EF',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#F5F3EF',
    },
    Keyboard: {
      resize: 'native',
      style: 'LIGHT',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
