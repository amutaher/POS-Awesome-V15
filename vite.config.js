import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'fs';

// Create a placeholder sw.js file if it doesn't exist
const swDir = path.resolve(__dirname, './public');
const swFile = path.resolve(swDir, 'sw.js');

if (!fs.existsSync(swDir)) {
  fs.mkdirSync(swDir, { recursive: true });
}

if (!fs.existsSync(swFile)) {
  const placeholderContent = `
// This is a placeholder service worker file
// VitePWA expects this file to exist for initial build test
// The actual service worker will be generated from posawesome/public/service-worker.js

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  self.clients.claim();
});
  `;
  fs.writeFileSync(swFile, placeholderContent);
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      mode: 'development',
      base: '/',
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'public/sw.js',
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
        swSrc: path.resolve(__dirname, './posawesome/public/service-worker.js'),
        swDest: path.resolve(__dirname, './posawesome/public/dist/service-worker.js'),
        maximumFileSizeToCacheInBytes: 5000000,
        dontCacheBustURLsMatching: /\.\w{8}\./,
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
        main: path.resolve(__dirname, './posawesome/public/js/posapp/posapp.js')
      },
      output: {
        entryFileNames: '[name].[hash].js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash].[ext]'
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './posawesome/public/js/posapp')
    }
  }
}); 