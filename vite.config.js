import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg}'],
        cleanupOutdatedCaches: true,
        sourcemap: true,
      },
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'POS Awesome',
        short_name: 'POS App',
        description: 'A Point of Sale system for ERPNext',
        theme_color: '#0097A7',
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
    outDir: 'posawesome/public/dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'posawesome/public/js/posawesome.bundle.js')
      },
      output: {
        entryFileNames: `assets/[name].[hash].js`,
        chunkFileNames: `assets/[name].[hash].js`,
        assetFileNames: `assets/[name].[hash].[ext]`
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src',
      'vue': resolve(__dirname, 'node_modules/vue')
    }
  }
}); 