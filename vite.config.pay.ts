import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Capacitor builds skip PWA — same reasoning as vite.config.business.ts.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
