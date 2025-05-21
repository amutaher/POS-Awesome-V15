const CACHE_NAME = 'pos-awesome-cache-v1';

// List of assets to cache for offline functionality
const ASSETS_TO_CACHE = [
  '/app/posapp',
  '/assets/posawesome/js/posapp/posapp.js',
  '/assets/posawesome/js/posapp/Home.vue',
  '/assets/posawesome/js/posapp/components/Navbar.vue',
  '/assets/posawesome/js/posapp/components/pos/Pos.vue',
  '/assets/posawesome/js/posapp/components/pos/pos.png',
  '/assets/posawesome/icons/icon-144x144.png',
  '/assets/posawesome/icons/icon-192x192.png',
  '/assets/posawesome/icons/icon-512x512.png',
  '/assets/posawesome/node_modules/vuetify/dist/vuetify.min.css',
  'https://cdn.jsdelivr.net/npm/@mdi/font@6.x/css/materialdesignicons.min.css',
  'https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900'
];

// Install event - caches assets for offline use
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
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

// Fetch event - serves from cache if available, otherwise fetches from network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin) && 
      !event.request.url.startsWith('https://cdn.jsdelivr.net') && 
      !event.request.url.startsWith('https://fonts.googleapis.com')) {
    return;
  }
  
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
                // Don't cache API calls or dynamic content
                if (!event.request.url.includes('/api/') && 
                    !event.request.url.includes('socket.io')) {
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
  
  // Implementation would depend on your app's offline storage mechanism
  // This is just a placeholder
  try {
    // Get pending data from IndexedDB or localStorage
    // Send it to the server
    return true;
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
    return false;
  }
} 