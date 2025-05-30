/// <reference types="node" />
import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  root: resolve(__dirname, 'posawesome', 'public', 'js', 'posapp'),
  base: '/assets/posawesome/',
  build: {
    outDir: resolve(__dirname, '..', '..', 'sites', 'assets', 'posawesome'),
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: 'index-[name].js',
        assetFileNames: ({name}) =>
          name?.endsWith('.css') ? 'index.css' : '[name]'
      }
    }
  },
  plugins: [
    vue(),
    VitePWA({
      injectRegister: 'auto',
      devOptions: { enabled: true },
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.png'],
      manifest: {
        name: 'POSAwesome',
        short_name: 'POS',
        start_url: '/app/pos',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1E88E5',
        description: 'POS Awesome - Point of Sale System',
        icons: [
          { 
            src: '/assets/posawesome/icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/assets/posawesome/icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          /* HTML and Assets Caching */
          {
            urlPattern: ({url}) => {
              return (
                url.pathname.startsWith('/assets/posawesome/') ||
                url.pathname.startsWith('/app/pos') ||
                url.pathname === '/' ||
                url.pathname.includes('.html') ||
                url.pathname.includes('ERR_INTERNET_DISCONNECTED')
              );
            },
            handler: 'CacheFirst',
            options: {
              cacheName: 'pos-html-assets',
              expiration: {
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          /* Frappe Core Assets */
          {
            urlPattern: ({url}) => {
              return (
                url.pathname.startsWith('/assets/frappe/') ||
                url.pathname.startsWith('/assets/js/') ||
                url.pathname.startsWith('/assets/css/')
              );
            },
            handler: 'CacheFirst',
            options: {
              cacheName: 'frappe-core-assets',
              expiration: {
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              }
            }
          },
          /* static assets */
          {
            urlPattern: ({request}) =>
              ['script', 'style', 'image', 'font'].includes(request.destination),
            handler: 'CacheFirst',
            options: { 
              cacheName: 'static-v1',
              expiration: {
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              }
            }
          },
          /* ERPNext GET APIs – current origin only */
          {
            urlPattern: ({url}) =>
              url.origin === self.location.origin &&
              url.pathname.startsWith('/api/resource/'),
            handler: 'NetworkFirst',
            options: { 
              cacheName: 'erp-api',
              networkTimeoutSeconds: 3,
              expiration: {
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              }
            }
          },
          /* POS Data Caching */
          {
            urlPattern: ({url}) =>
              url.origin === self.location.origin &&
              (url.pathname.includes('/api/method/posawesome.posawesome.api') ||
               url.pathname.includes('/api/method/posawesome.posawesome.api.get_items') ||
               url.pathname.includes('/api/method/posawesome.posawesome.api.get_customers')),
            handler: 'NetworkFirst',
            options: { 
              cacheName: 'pos-data',
              networkTimeoutSeconds: 3,
              expiration: {
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          /* Opening Shift Data Caching */
          {
            urlPattern: ({url}) =>
              url.origin === self.location.origin &&
              (url.pathname.includes('/api/method/posawesome.posawesome.api.check_opening_shift') ||
               url.pathname.includes('/api/method/posawesome.posawesome.api.create_opening_voucher')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'opening-shift-data',
              networkTimeoutSeconds: 3,
              expiration: {
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
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
        ],
        navigationPreload: true,
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ]
})
