import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// Capacitor builds skip the PWA service worker — same reasoning as the
// Companion App's vite.config.app.ts.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(isCapacitorBuild ? [] : [VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['anton-icon.svg'],
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
