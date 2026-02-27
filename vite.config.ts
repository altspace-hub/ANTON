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
    // Limit parallel file processing to reduce peak RAM usage on Windows
    // (Rollup 4.x WebAssembly can try to reserve huge contiguous blocks otherwise)
    rollupOptions: {
      maxParallelFileOps: 3,
      output: {
        manualChunks: {
          // React core — rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Heavy UI libs
          'vendor-markdown': ['react-markdown', 'remark-gfm', 'rehype-highlight'],
          // i18n (locale JSON now served from public/ — no longer bundled)
          'vendor-i18n': ['react-i18next', 'i18next', 'i18next-http-backend'],
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
          // Lucide icons — large tree of components
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
