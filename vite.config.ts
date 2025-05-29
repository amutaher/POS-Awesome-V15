// vite.config.ts
import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    root: resolve(__dirname, 'posawesome', 'public', 'js', 'posapp'),
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.png'],
      manifest: {
        name: 'POSAwesome',
        short_name: 'POS',
        start_url: '.',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1E88E5',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            // Static JS/CSS
            urlPattern: ({ request }) =>
              request.destination === 'script' || request.destination === 'style',
            handler: 'CacheFirst',
            options: { cacheName: 'static-v1' }
          },
          {
            // ERPNext GET APIs
            urlPattern: /^https:\/\/erp\.hamrooqcosmo\.com\/api\/resource\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'erp-api' }
          },
          {
            // Invoice POST queue
            urlPattern: /^https:\/\/erp\.hamrooqcosmo\.com\/api\/method\/posawesome/,
            method: 'POST',
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'invoice-queue',
                options: { maxRetentionTime: 24 * 60 } // minutes
              }
            }
          }
        ]
      }
    })
  ]
})
