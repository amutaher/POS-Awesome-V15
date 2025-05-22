// Import Workbox core modules from workbox-precaching package
// This will be replaced by the injectManifest plugin during build

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Use Workbox precaching to automatically handle cache versioning
// self.__WB_MANIFEST is injected by the Workbox build process
precacheAndRoute(self.__WB_MANIFEST || []);

// Clean up any outdated caches from previous versions
cleanupOutdatedCaches();

// List of additional assets to cache for offline functionality
const ASSETS_TO_CACHE = [
  '/app/posapp',
  '/assets/posawesome/js/posapp/posapp.js',
  '/assets/posawesome/js/posapp/Home.vue',
  '/assets/posawesome/js/posapp/components/Navbar.vue',
  '/assets/posawesome/js/posapp/components/pos/Pos.vue',
  '/assets/posawesome/js/posapp/components/pos/Invoice.vue',
  '/assets/posawesome/js/posapp/components/pos/ItemsSelector.vue',
  '/assets/posawesome/js/posapp/components/pos/Payments.vue',
  '/assets/posawesome/js/posapp/components/pos/Customer.vue',
  '/assets/posawesome/js/posapp/components/pos/CustomerSelector.vue',
  '/assets/posawesome/js/posapp/components/pos/pos.png',
  '/assets/posawesome/js/posapp/services/offlineStorage.js',
  '/assets/posawesome/js/posapp/services/networkDetector.js',
  '/assets/posawesome/icons/icon-72x72.png',
  '/assets/posawesome/icons/icon-144x144.png',
  '/assets/posawesome/icons/icon-192x192.png',
  '/assets/posawesome/icons/icon-512x512.png',
  '/assets/posawesome/node_modules/vuetify/dist/vuetify.min.css',
  'https://cdn.jsdelivr.net/npm/@mdi/font@6.x/css/materialdesignicons.min.css',
  'https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900',
  '/assets/posawesome/js/posapp/components/offline/OfflineBanner.vue',
  '/assets/posawesome/js/posapp/components/offline/SyncStatus.vue'
];

// Cache additional assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  
  event.waitUntil(
    caches.open('pos-awesome-assets-cache')
      .then((cache) => {
        console.log('[Service Worker] Caching additional assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// API endpoints to cache for offline use
const API_ROUTES_TO_CACHE = [
  '/api/method/posawesome.posawesome.api.posapp.get_items',
  '/api/method/posawesome.posawesome.api.posapp.get_customers',
  '/api/method/posawesome.posawesome.api.posapp.get_pos_profile',
  '/api/method/posawesome.posawesome.api.posapp.get_customer_details',
  '/api/method/posawesome.posawesome.api.posapp.get_offers',
  '/api/method/posawesome.posawesome.api.posapp.get_item_details',
  '/api/method/posawesome.posawesome.api.posapp.get_item_group_suggestion',
  '/api/method/posawesome.posawesome.api.posapp.get_items_details',
  '/api/method/posawesome.posawesome.api.posapp.get_items_groups',
  '/api/method/posawesome.posawesome.api.posapp.get_delivery_charges',
  '/api/method/posawesome.posawesome.api.posapp.get_customer_addresses',
  '/api/method/posawesome.posawesome.api.posapp.get_customer_info',
  '/api/method/posawesome.posawesome.api.posapp.get_items_from_barcode',
  '/api/method/posawesome.posawesome.api.posapp.get_customer_groups',
  '/api/method/posawesome.posawesome.api.posapp.get_customer_names',
  '/api/method/posawesome.posawesome.api.posapp.get_draft_invoices',
  '/api/method/posawesome.posawesome.api.posapp.get_available_credit',
  '/api/method/posawesome.posawesome.api.posapp.check_opening_shift'
];

// Activate event - claim clients immediately
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  event.waitUntil(self.clients.claim());
});

// Network-first strategy for API calls with fallback to cache
async function networkFirstWithCacheFallback(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request.clone());
    
    // If successful, clone and cache the response
    if (networkResponse && networkResponse.status === 200) {
      const responseToCache = networkResponse.clone();
      const cache = await caches.open('pos-awesome-api-cache');
      await cache.put(request, responseToCache);
    }
    
    return networkResponse;
  } catch (error) {
    // If network fails, try to get from cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[Service Worker] Serving from cache:', request.url);
      return cachedResponse;
    }
    
    // If nothing in cache for API requests, return a JSON error response
    if (request.url.includes('/api/')) {
      console.log('[Service Worker] No cached response for API call:', request.url);
      return new Response(JSON.stringify({ 
        error: true, 
        message: 'You are offline. This data is not available offline.',
        offline: true
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // For other resources, return a generic error
    return new Response('Network error happened', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Cache-first strategy for static assets
async function cacheFirstWithNetworkFallback(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // No match in cache, go to network
  try {
    const networkResponse = await fetch(request);
    
    // Check if we received a valid response
    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
      return networkResponse;
    }
    
    // Clone the response for the cache and to return
    const responseToCache = networkResponse.clone();
    
    // Don't cache socket.io connections
    if (!request.url.includes('socket.io')) {
      const cache = await caches.open('pos-awesome-assets-cache');
      await cache.put(request, responseToCache);
    }
    
    return networkResponse;
  } catch (error) {
    // If fetch fails (offline) and it's a navigation request, try to return the offline page
    if (request.mode === 'navigate') {
      return caches.match('/app/posapp');
    }
    
    throw error; // No fallback available
  }
}

// Fetch event - serves from cache if available, otherwise fetches from network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests except for CDN resources
  if (!event.request.url.startsWith(self.location.origin) && 
      !event.request.url.startsWith('https://cdn.jsdelivr.net') && 
      !event.request.url.startsWith('https://fonts.googleapis.com')) {
    return;
  }
  
  // Special handling for API routes we want to cache
  const isApiRouteToCache = API_ROUTES_TO_CACHE.some(route => 
    event.request.url.includes(route)
  );
  
  if (isApiRouteToCache) {
    event.respondWith(networkFirstWithCacheFallback(event.request));
    return;
  }
  
  // Cache-first strategy for static assets
  event.respondWith(cacheFirstWithNetworkFallback(event.request));
});

// Sync event for background syncing when connection is restored
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Sync event', event.tag);
  
  if (event.tag === 'sync-pending-invoices') {
    event.waitUntil(syncPendingInvoices());
  }
});

// Function to sync pending invoices when online
async function syncPendingInvoices() {
  console.log('[Service Worker] Syncing pending invoices');
  
  // Open the database and get pending invoices
  try {
    const clients = await self.clients.matchAll();
    if (clients && clients.length) {
      // Notify clients that sync is starting
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_STARTED'
        });
      });
      
      // Trigger the actual sync in the client
      clients[0].postMessage({
        type: 'SYNC_PENDING_INVOICES'
      });
      
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
    return false;
  }
}

// Listen for messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_COMPLETED') {
    console.log('[Service Worker] Sync completed successfully');
    // Notify all clients that sync is complete
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_COMPLETE_NOTIFICATION',
          message: 'All offline invoices have been synchronized'
        });
      });
    });
  }
  
  if (event.data && event.data.type === 'CACHE_DYNAMIC_URLS') {
    const urls = event.data.urls;
    if (urls && urls.length) {
      caches.open('pos-awesome-assets-cache')
        .then(cache => {
          console.log('[Service Worker] Caching dynamic URLs:', urls);
          return cache.addAll(urls);
        })
        .catch(error => {
          console.error('[Service Worker] Failed to cache dynamic URLs:', error);
        });
    }
  }
}); 