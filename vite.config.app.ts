import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// In Capacitor, the WebView is served at https://localhost. The PWA
// service worker would intercept failed API calls (e.g. before pairing
// completes when there's no API origin yet) and serve the cached
// index.html, causing the app to JSON.parse HTML and crash with
// "unexpected token '<'". Skip PWA + SW entirely for native builds.
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
        name: 'ANTON Companion',
        short_name: 'ANTON',
        description: 'Connect to your organisation\'s AI assistant',
        theme_color: '#0B1426',
        background_color: '#0B1426',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/app/',
        scope: '/app/',
        icons: [
          { src: '/anton-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/anton-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/app\/languages$/,
            handler: 'CacheFirst',
            options: { cacheName: 'languages', expiration: { maxAgeSeconds: 86400 } },
          },
          {
            urlPattern: /\/api\/app\/org\/[^/]+\/profile$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'org-profiles', expiration: { maxEntries: 20, maxAgeSeconds: 3600 } },
          },
          {
            urlPattern: /\/api\/app\/connections$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'connections', expiration: { maxEntries: 1, maxAgeSeconds: 300 } },
          },
          {
            urlPattern: /\/api\/app\/org\/[^/]+\/sessions$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'sessions', expiration: { maxEntries: 20, maxAgeSeconds: 300 } },
          },
        ],
      },
    })]),
  ],
  root: 'src/app',
  // Desktop PWA is served at /app/, so the default base is /app/.
  // Capacitor serves bundled assets from the WebView root, so the
  // build:android* scripts set CAPACITOR_BUILD=1 to switch to relative
  // paths — otherwise index.html references /app/assets/... which 404
  // inside the WebView and the app shows a black screen.
  base: process.env.CAPACITOR_BUILD === '1' ? './' : '/app/',
  resolve: {
    alias: { '@app': path.resolve(__dirname, 'src/app') },
  },
  build: {
    outDir: '../../dist/app',
    emptyOutDir: true,
  },
  server: {
    port: 5184,
    host: true, // Expose to network (LAN) for phone testing
    proxy: {
      '/api': { target: 'http://localhost:3011', changeOrigin: true },
      '/school-ws': { target: 'http://localhost:3011', ws: true, changeOrigin: true },
    },
    headers: {
      'Cache-Control': 'no-store', // Prevent mobile browser caching stale JS in dev
    },
  },
});
