import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
        swSrc: './posawesome/public/service-worker.js',
        swDest: './posawesome/public/service-worker.js',
        globDirectory: './posawesome/public/',
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,jpg,jpeg,json}'
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'POS Awesome',
        short_name: 'POS Awesome',
        description: 'POS Awesome is a Progressive Web App for ERPNext',
        theme_color: '#4051B5',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'posawesome/icons/icon-72x72.png',
            sizes: '72x72',
            type: 'image/png'
          },
          {
            src: 'posawesome/icons/icon-144x144.png',
            sizes: '144x144',
            type: 'image/png'
          },
          {
            src: 'posawesome/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'posawesome/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'posawesome/public/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './posawesome/public/js/posapp/posapp.js'
      },
      output: {
        entryFileNames: '[name].[hash].js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash].[ext]'
      }
    }
  }
}); 