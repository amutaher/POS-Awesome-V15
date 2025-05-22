/**
 * POS Awesome Service Worker
 * Enhanced with Workbox for better caching and offline support
 */

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

// Import Workbox modules
const { precacheAndRoute, cleanupOutdatedCaches } = workbox.precaching;
const { registerRoute } = workbox.routing;
const { StaleWhileRevalidate, CacheFirst, NetworkFirst, NetworkOnly } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheable.response;
const { BackgroundSyncPlugin } = workbox.backgroundSync;

// Clean up any outdated caches from previous versions
cleanupOutdatedCaches();

// Precache all build assets (automatically generated at build time)
precacheAndRoute(self.__WB_MANIFEST || []);

// Add additional assets to precache for offline functionality
const additionalAssetsToPrecache = [
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

precacheAndRoute(
  additionalAssetsToPrecache.map(url => ({
    url,
    revision: null, // Let the browser handle the versioning
  }))
);

// Create background sync plugin for invoice queue with exponential backoff
const bgSyncPlugin = new BackgroundSyncPlugin('invoiceQueue', {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours (in minutes)
  onSync: async ({ queue }) => {
    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        const response = await fetch(entry.request.clone());
        
        if (!response.ok) {
          // If server returns an error, put the request back in the queue
          // but only if it's not a conflict (409) response
          if (response.status !== 409) {
            throw new Error('Server error: ' + response.status);
          } else {
            // Handle conflict by notifying the client
            self.clients.matchAll().then(clients => {
              clients.forEach(client => {
                client.postMessage({
                  type: 'SYNC_CONFLICT',
                  requestData: {
                    url: entry.request.url,
                    timestamp: new Date().toISOString(),
                    headers: Object.fromEntries(entry.request.headers.entries())
                  }
                });
              });
            });
          }
        }
      } catch (error) {
        await queue.unshiftRequest(entry);
        throw error; // Let workbox handle the retry
      }
    }
    
    // Notify clients that sync is complete
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_COMPLETE_NOTIFICATION',
          message: 'All offline invoices have been synchronized'
        });
      });
    });
  }
});

// Register route for API requests with stale-while-revalidate strategy
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new StaleWhileRevalidate({
    cacheName: 'api-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 12 * 3600 })
    ]
  })
);

// Special handling for invoice submission - use background sync
registerRoute(
  /\/api\/method\/posawesome\.posawesome\.api\.posapp\.submit_invoice/,
  new NetworkOnly({
    plugins: [bgSyncPlugin]
  }),
  'POST'
);

// Cache-first strategy for static assets
registerRoute(
  /\.(?:js|css|png|jpg|jpeg|svg|gif|woff2|woff|ttf)$/,
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// Network-first strategy for HTML documents
registerRoute(
  /\.(?:html)$/,
  new NetworkFirst({
    cacheName: 'html-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 24 * 60 * 60, // 1 day
      }),
    ],
  })
);

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
      caches.open('api-cache')
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