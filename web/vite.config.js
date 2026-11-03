import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      // Served as /manifest.json (the Sep 16 manifest fix) so app stores and PWABuilder find it.
      manifestFilename: 'manifest.json',
      includeAssets: ['icon.svg', 'favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        // Installed app name on phones/desktop = "Keeply".
        // Full/website name = "4thepeople Notes".
        name: '4thepeople Notes',
        short_name: 'Keeply',
        // Stable app identity for the Play Store / installed app — don't change this later.
        id: '/?app=keeply',
        description: 'Your notes and voice recordings, synced across every device. By 4thepeople.',
        categories: ['productivity', 'lifestyle'],
        theme_color: '#f5b400',
        background_color: '#fffceb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        // Never let the SW cache API calls — always hit the network for data. Uploaded
        // files (/storage) and the Android app download (/downloads) must reach the server
        // too, or opening one would show the app instead.
        navigateFallbackDenylist: [/^\/api/, /^\/storage\//, /^\/downloads\//],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // Forward API + storage to Laravel during dev so there's no CORS.
      '/api': 'http://localhost:8000',
      '/storage': 'http://localhost:8000',
    },
  },
})
