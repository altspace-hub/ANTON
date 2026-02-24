import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'openEXPERT by ANTON',
        short_name: 'openEXPERT',
        description: 'AI-powered expert assistant for compliance, legal, HR and more',
        theme_color: '#0B1426',
        background_color: '#0B1426',
        display: 'standalone',
        icons: [
          {
            src: '/advisense-logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Heavy UI libs
          'vendor-markdown': ['react-markdown', 'remark-gfm', 'rehype-highlight'],
          // i18n
          'vendor-i18n': ['react-i18next', 'i18next'],
          // Zustand stores
          'stores': [
            './src/stores/useSessionStore',
            './src/stores/useSettingsStore',
            './src/stores/useAuthStore',
          ],
          // Constants (large — 145+ modules)
          'constants': ['./src/lib/constants'],
          // Charts (recharts is large — isolate for long-term caching)
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
});
