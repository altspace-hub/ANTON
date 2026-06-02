import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

// Capacitor builds skip PWA — same reasoning as vite.config.business.ts.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // The animated-QR fountain encoder (@ngraveio/bc-ur) is authored for
    // Node: it uses the bare global `Buffer`, `require('assert')`, and
    // `require('cbor-sync')`. None of those exist in a browser / Capacitor
    // WebView, so the encoder threw `ReferenceError: Buffer is not defined`
    // the instant AnimatedQrCode constructed it — the canvas stayed blank.
    // This plugin injects the `Buffer` + `process` globals and shims the
    // Node builtins (assert, etc.) so bc-ur loads unchanged in the bundle.
    // `cbor-sync` is a plain npm package already in the tree and resolves
    // normally. Only enable the globals we actually need to keep the
    // bundle lean.
    nodePolyfills({
      globals: { Buffer: true, process: true, global: true },
      include: ['assert', 'buffer'],
    }),
  ],
  root: 'src/pay',
  base: isCapacitorBuild ? './' : '/pay/',
  resolve: {
    alias: {
      '@pay': path.resolve(__dirname, 'src/pay'),
      // Workspace SDK — used by services/payment.ts to decode the
      // `futurechain:pay` reference the Business app encodes.
      '@futurechain/sdk': path.resolve(__dirname, 'anton-business/packages/futurechain-sdk/src'),
    },
  },
  build: {
    outDir: '../../dist/pay',
    emptyOutDir: true,
  },
  server: {
    port: 5187,
    host: true,
    headers: { 'Cache-Control': 'no-store' },
  },
});
