import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'sw-extra.js'],
      manifest: {
        name: 'Assistência Técnica',
        short_name: 'Assistência',
        description: 'Chamados, ordens de serviço e laudos técnicos',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3f6f8',
        theme_color: '#0e5a74',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        importScripts: ['/sw-extra.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Dependências opcionais do jsPDF que o app não usa.
        globIgnores: ['**/html2canvas-*.js', '**/purify.es-*.js', '**/index.es-*.js'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173, host: true },
  build: { chunkSizeWarningLimit: 1500 },
});
