const CACHE_NAME = 'pos-awesome-cache-v2';

// List of assets to cache for offline functionality
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
  '/assets/posawesome/icons/icon-72x72.png',
  '/assets/posawesome/icons/icon-144x144.png',
  '/assets/posawesome/icons/icon-192x192.png',
  '/assets/posawesome/icons/icon-512x512.png',
  '/assets/posawesome/node_modules/vuetify/dist/vuetify.min.css',
  'https://cdn.jsdelivr.net/npm/@mdi/font@6.x/css/materialdesignicons.min.css',
  'https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900'
];

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
  '/api/method/posawesome.posawesome.api.posapp.get_customer_addresses'
];

// Install event - caches assets for offline use
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell and assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - cleans up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
    .then(() => self.clients.claim())
  );
});

// Network-first strategy for API calls with fallback to cache
async function networkFirstWithCacheFallback(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // If successful, clone and cache the response
    if (networkResponse && networkResponse.status === 200) {
      const responseToCache = networkResponse.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, responseToCache);
    }
    
    return networkResponse;
  } catch (error) {
    // If network fails, try to get from cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If nothing in cache for API requests, return a JSON error response
    if (request.url.includes('/api/')) {
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
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        
        // Clone the request for fetch and cache
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest)
          .then((response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response for the cache and to return
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                // Don't cache socket.io connections
                if (!event.request.url.includes('socket.io')) {
                  cache.put(event.request, responseToCache);
                }
              });
            
            return response;
          })
          .catch(() => {
            // If fetch fails (offline), try to return the offline page
            if (event.request.mode === 'navigate') {
              return caches.match('/app/posapp');
            }
          });
      })
  );
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
  }
}); 