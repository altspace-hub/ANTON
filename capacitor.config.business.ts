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
  android: {
    path: 'android-business',
    allowMixedContent: false,
    backgroundColor: '#0F1B2D',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0F1B2D',
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
      backgroundColor: '#0F1B2D',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0F1B2D',
    },
    Keyboard: {
      resize: 'native',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
