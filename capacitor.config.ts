import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.futurechain.anton.companion',
  appName: 'ANTON Companion',
  webDir: 'dist/app',
  server: {
    // In development, load from the Vite dev server for hot reload
    // Comment this out for production builds
    // url: 'http://192.168.1.134:5184/app/',
    // cleartext: true,
    androidScheme: 'https',
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
  },
  android: {
    allowMixedContent: false, // HTTPS only in production
    backgroundColor: '#0B1426',
  },
};

export default config;
