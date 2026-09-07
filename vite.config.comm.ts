import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

// Capacitor builds skip the PWA service worker — same reasoning as the
// Companion App's vite.config.app.ts.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';

// The user-facing version. Kept equal to android-comm's `versionName` on
// purpose: this is the number a person compares against the Play listing, and
// two different answers to "what version am I running" is worse than one that
// needs bumping in two places. services/enrollment.ts already reached for
// `__APP_VERSION__` behind a typeof guard — it never existed, so every
// enrollment silently reported no version at all.
const APP_VERSION = '1.0.0';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    react(),
    tailwindcss(),
    // #79 — the animated-QR fountain encoder (@ngraveio/bc-ur) is authored for
    // Node (bare `Buffer`, `require('assert')`). Inject the globals + shim the
    // builtins so it loads in the Capacitor WebView (mirrors vite.config.pay.ts).
    nodePolyfills({
      globals: { Buffer: true, process: true, global: true },
      include: ['assert', 'buffer'],
    }),
    ...(isCapacitorBuild ? [] : [VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['anton-icon.svg'],
      // C — the boot chunk is a genuine ~3.4 MB of eager vendor code (react +
      // @noble crypto + @scure + @futurechain/sdk + dexie + Falcon-512 + the
      // docx/export libs pulled by the tax/export paths). Workbox's 2 MiB default
      // aborted precache generation, so `build:comm` (the WEB PWA) failed. Raise
      // the ceiling so it precaches. Tradeoff is a larger first-install download
      // for the PWA — acceptable for this secondary deployment. This is web-PWA
      // ONLY: VitePWA is gated off for the Capacitor build above, so `build:comm:cap`
      // (the phones) is untouched. A proper vendor split / lazy-loading the export
      // libs is the higher-quality follow-up, but it's a bigger, riskier refactor.
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
      },
      manifest: {
        name: 'ANTON Communication',
        short_name: 'ANTON',
        description: 'Chat, events, portals — your social ANTON',
        theme_color: '#F5F3EF',
        background_color: '#F5F3EF',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/comm/',
        scope: '/comm/',
        icons: [
          { src: '/anton-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/anton-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    })]),
  ],
  root: 'src/comm',
  base: process.env.CAPACITOR_BUILD === '1' ? './' : '/comm/',
  resolve: {
    alias: { '@comm': path.resolve(__dirname, 'src/comm') },
  },
  build: {
    outDir: '../../dist/comm',
    emptyOutDir: true,
  },
  server: {
    port: 5185,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3011', changeOrigin: true },
    },
    headers: {
      'Cache-Control': 'no-store',
    },
  },
});
