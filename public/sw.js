// This is a placeholder service worker file
// VitePWA expects this file to exist for initial build test
// The actual service worker will be generated from posawesome/public/service-worker.js

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  self.clients.claim();
}); 