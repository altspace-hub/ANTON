import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Capacitor builds skip PWA — same reasoning as vite.config.comm.ts.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
