import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

// Capacitor builds skip PWA — same reasoning as vite.config.comm.ts.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';

// The user-facing version. Kept equal to android-business's `versionName` on
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
    // Feature 2 — the animated-QR fountain encoder (@ngraveio/bc-ur) is
    // authored for Node: it uses the bare global `Buffer`, `require('assert')`,
    // and `require('cbor-sync')`. None exist in a Capacitor WebView, so the
    // encoder would throw `ReferenceError: Buffer is not defined` the instant
    // AnimatedQrDisplay constructs it (the exact bug Pay already fixed — see
    // vite.config.pay.ts). This injects the `Buffer` + `process` globals and
    // shims the Node builtins so bc-ur loads unchanged in the bundle.
    nodePolyfills({
      globals: { Buffer: true, process: true, global: true },
      include: ['assert', 'buffer'],
    }),
  ],
  root: 'src/business',
  base: isCapacitorBuild ? './' : '/business/',
  resolve: {
    alias: {
      '@business': path.resolve(__dirname, 'src/business'),
      // Workspace SDK — used by services/qr.ts for reference encoding.
      '@futurechain/sdk': path.resolve(__dirname, 'anton-business/packages/futurechain-sdk/src'),
    },
  },
  build: {
    outDir: '../../dist/business',
    emptyOutDir: true,
  },
  server: {
    port: 5186,
    host: true,
    headers: { 'Cache-Control': 'no-store' },
  },
});
