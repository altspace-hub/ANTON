import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

// Capacitor builds skip PWA — same reasoning as vite.config.comm.ts.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';

export default defineConfig({
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
