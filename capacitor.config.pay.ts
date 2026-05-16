import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 8 config for the ANTON Pay app.
 *
 * Mirrors `capacitor.config.business.ts` exactly — same build/install
 * pattern, separate app ID + android project so the Business app and
 * Pay app coexist on one phone for the merchant-and-customer
 * end-to-end test (Business issues a QR, Pay scans + pays it).
 *
 * Web bundle: dist/pay/ (built via `pnpm build:pay:cap`)
 * Android project: android-pay/
 */
const config: CapacitorConfig = {
  appId: 'com.futurechain.anton.pay',
  appName: 'ANTON Pay',
  webDir: 'dist/pay',
  android: {
    path: 'android-pay',
    allowMixedContent: false,
    backgroundColor: '#F5F3EF',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#F5F3EF',
    scheme: 'ANTON Pay',
    limitsNavigationsToAppBoundDomains: false,
    path: 'ios-pay',
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: [
      // Whitelist for the customer's FutureChain RPC + Safello
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
