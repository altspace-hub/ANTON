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
      devOptions: {
        enabled: false, // Never register SW in dev — prevents stale cache breaking hot-reload
      },
      manifest: {
        name: 'ANTON by openEXPERT',
        short_name: 'openEXPERT',
        description: 'AI-powered expert assistant for compliance, legal, HR and more',
        theme_color: '#0B1426',
        background_color: '#0B1426',
        display: 'standalone',
        icons: [
          {
            src: '/anton-logo.svg',
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
          {
            // School locale files — stale-while-revalidate so offline still works
            urlPattern: /\/locales\/.*-school\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'school-locales',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // School dashboard and non-mutating API — NetworkFirst with offline fallback
            urlPattern: /\/api\/school\/dashboard/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'school-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 30 },
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
  optimizeDeps: {
    // Pre-bundle these at dev-server startup so the browser never stalls
    // waiting for on-demand bundling of heavy packages.
    include: [
      'react', 'react-dom', 'react-dom/client',
      'react-router-dom',
      'react-i18next', 'i18next', 'i18next-http-backend',
      'zustand',
      'lucide-react',
      'recharts',
      'react-markdown', 'remark-gfm', 'rehype-highlight',
    ],
  },
  server: {
    port: 5183,
    proxy: {
      '/api': {
        target: 'http://localhost:3011',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    target: 'es2015',   // COMPAT-01: target ES2015 for broader browser compatibility
    chunkSizeWarningLimit: 800,
    // Limit parallel file processing to reduce peak RAM usage on Windows
    // (Rollup 4.x WebAssembly can try to reserve huge contiguous blocks otherwise)
    rollupOptions: {
      maxParallelFileOps: 3,
      output: {
        manualChunks(id) {
          // School pages — isolated chunk for better caching
          if (id.includes('/pages/school/') || id.includes('\\pages\\school\\')) return 'school-pages';
          // React core — rarely changes
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) return 'vendor-react';
          // Heavy UI libs
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark-gfm') || id.includes('node_modules/rehype-highlight')) return 'vendor-markdown';
          // i18n (locale JSON now served from public/ — no longer bundled)
          if (id.includes('node_modules/react-i18next') || id.includes('node_modules/i18next')) return 'vendor-i18n';
          // Charts (recharts is large — isolate for long-term caching)
          if (id.includes('node_modules/recharts')) return 'vendor-charts';
          // Lucide icons — large tree of components
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          // Zustand stores
          if (id.includes('/stores/useSessionStore') || id.includes('/stores/useSettingsStore') || id.includes('/stores/useAuthStore')) return 'stores';
          // Constants (large — 145+ modules)
          if (id.includes('/lib/constants')) return 'constants';
        },
      },
    },
  },
});
