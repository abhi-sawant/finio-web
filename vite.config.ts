import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png', 'pwa-64x64.png', 'pwa-96x96.png', 'pwa-192x192.png', 'pwa-512x512.png', 'maskable-icon-512x512.png'],
      manifest: {
        name: 'Finio - Finance Tracker',
        short_name: 'Finio',
        description: 'Personal finance tracker - track expenses, income, and budgets',
        theme_color: '#6C63FF',
        background_color: '#0f1117',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-96x96.png',
            sizes: '96x96',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Long-press the installed icon. Capped at four — Android surfaces 3–4 and silently
        // drops the rest. 96x96 is the conventional shortcut icon size.
        shortcuts: [
          {
            name: 'Add Expense',
            short_name: 'Expense',
            description: 'Record a new expense',
            url: '/add-transaction?type=expense',
            icons: [{ src: 'pwa-96x96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Add Income',
            short_name: 'Income',
            description: 'Record new income',
            url: '/add-transaction?type=income',
            icons: [{ src: 'pwa-96x96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Transactions',
            short_name: 'History',
            description: 'Browse your transactions',
            url: '/transactions',
            icons: [{ src: 'pwa-96x96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Budgets',
            short_name: 'Budgets',
            description: 'Check your budgets',
            url: '/budgets',
            icons: [{ src: 'pwa-96x96.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
        // GET, not POST, and that is forced rather than preferred: `public/.htaccess` rewrites
        // to a static index.html, which cannot receive a POST body, and a POST target also
        // needs the service worker to already be controlling — which it is not on a cold-start
        // share from a fresh install. The rewrite carries [QSA], so the query survives.
        share_target: {
          action: '/share-target',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/date-fns')) {
            return 'vendor-dates';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        },
      },
    },
  },
})
