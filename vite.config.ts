import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  root: resolve(__dirname, 'posawesome', 'public', 'js', 'posapp'),
  base: '/app/posapp/',
  build: {
    outDir: resolve(__dirname,
      '..', '..', 'sites', 'assets', 'posawesome')
  },
  plugins: [
    vue(),
    VitePWA({
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.png'],
      manifest: {
        name: 'POSAwesome',
        short_name: 'POS',
        start_url: '/app/posapp/',          // relative start
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
          /* static assets */
          {
            urlPattern: ({request}) =>
              ['script', 'style'].includes(request.destination),
            handler: 'CacheFirst',
            options: { cacheName: 'static-v1' }
          },
          /* ERPNext GET APIs – current origin only */
          {
            urlPattern: ({url}) =>
              url.origin === self.location.origin &&            // ⚡ dynamic
              url.pathname.startsWith('/api/resource/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'erp-api' }
          },
          /* Invoice POST queue – current origin only */
          {
            urlPattern: ({url, request}) =>
              url.origin === self.location.origin &&
              request.method === 'POST' &&
              url.pathname.startsWith('/api/method/posawesome'),
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'invoice-queue',
                options: { maxRetentionTime: 24 * 60 }
              }
            }
          }
        ]
      }
    })
  ]
})
