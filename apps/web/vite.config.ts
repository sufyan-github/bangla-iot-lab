import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { privateLessons } from './private-lessons';

export default defineConfig({
  plugins: [
    react(),
    privateLessons(fileURLToPath(new URL('../../private/lessons', import.meta.url))),
    tailwindcss(),
    VitePWA({
      // Students often work with no connection, so the whole app shell is
      // precached at install and new versions take over on the next visit.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'বাংলা IoT ল্যাব',
        short_name: 'IoT ল্যাব',
        description: 'বাংলায় ভার্চুয়াল ইলেকট্রনিক্স ল্যাব — সার্কিট বানাও, চালিয়ে দেখো।',
        lang: 'bn',
        start_url: '/',
        display: 'standalone',
        background_color: '#0e4439',
        theme_color: '#0e4439',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // The ESP32 chip emulator is several megabytes and only some students
        // use it: it is not fetched at install, but once fetched it is kept, so
        // it works without a connection afterwards.
        navigateFallbackDenylist: [/^\/esp32sim\//, /^\/licences\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/esp32sim/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'esp32sim', expiration: { maxEntries: 8 } },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
});
