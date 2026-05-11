import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 8 config for the ANTON Communication app.
 *
 * Separate from `capacitor.config.ts` (Companion App) so the two products
 * can ship as independent APKs / iOS apps with their own app IDs and
 * signing chains. Web bundle is in `dist/comm/` (built via
 * `pnpm build:comm:cap`), Android project is `android-comm/`.
 */
const config: CapacitorConfig = {
  appId: 'com.futurechain.anton.communication',
  appName: 'ANTON Communication',
  webDir: 'dist/comm',
  // Use a separate Android project so the existing Companion App build
  // chain is untouched. `npx cap add android --config capacitor.config.comm.ts`
  // will scaffold this directory; subsequent syncs honour it.
  android: {
    path: 'android-comm',
    // Allow cleartext (ws://) inside the WebView so we can reach the
    // local dev relay during development. Production builds should be
    // re-hardened to allowMixedContent: false before App Store / Play.
    allowMixedContent: true,
    backgroundColor: '#F5F3EF',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#F5F3EF',
    scheme: 'ANTON Communication',
    limitsNavigationsToAppBoundDomains: false,
    path: 'ios-comm',
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Allow connecting to the local dev relay during development; the LAN
    // ranges mirror the Companion App. In a release build, the WebSocket
    // URL is hard-coded via VITE_COMM_RELAY_URL and these allowlist
    // entries are not in the live attack surface.
    allowNavigation: [
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
      launchShowDuration: 800,
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
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
