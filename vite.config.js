import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      strategies: 'injectManifest',
      injectManifest: {
        swSrc: './posawesome/public/service-worker.js',
        swDest: 'dist/service-worker.js',
        injectionPoint: 'self.__WB_MANIFEST'
      },
      manifest: {
        name: 'POS Awesome',
        short_name: 'POS App',
        description: 'POS Awesome for ERPNext',
        theme_color: '#ffffff',
        start_url: '/app/posapp',
        display: 'standalone',
        background_color: '#ffffff',
        icons: [
          {
            src: '/assets/posawesome/icons/icon-72x72.png',
            sizes: '72x72',
            type: 'image/png'
          },
          {
            src: '/assets/posawesome/icons/icon-144x144.png',
            sizes: '144x144',
            type: 'image/png'
          },
          {
            src: '/assets/posawesome/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/assets/posawesome/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
}); 