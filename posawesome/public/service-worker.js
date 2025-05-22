/**
 * POS Awesome Service Worker using Workbox
 * This service worker enables reliable offline functionality
 */

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

// Use the imported workbox APIs
const { precacheAndRoute, cleanupOutdatedCaches } = workbox.precaching;
const { registerRoute } = workbox.routing;
const { StaleWhileRevalidate, NetworkFirst, CacheFirst } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheable.response;
const { BackgroundSyncPlugin } = workbox.backgroundSync;

// Cache name with automatic versioning through precache manifest
const CACHE_NAME = 'pos-awesome-cache';
const API_CACHE_NAME = 'pos-awesome-api-cache';

// Configure background sync for invoices
const bgSyncPlugin = new BackgroundSyncPlugin('invoiceQueue', {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours (in minutes)
  onSync: async ({ queue }) => {
    // Custom handling of synced items
    try {
      const clients = await self.clients.matchAll();
      if (clients && clients.length) {
        // Notify clients that sync is starting
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_STARTED'
          });
        });
      }

      // Let the queue process everything
      await queue.replayRequests();

      // Notify clients that sync is complete
      if (clients && clients.length) {
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_COMPLETE_NOTIFICATION',
            message: 'All offline invoices have been synchronized'
          });
        });
      }
    } catch (error) {
      console.error('[Service Worker] Sync failed:', error);
    }
  }
});

// List of assets to cache for offline functionality
const ASSETS_TO_CACHE = [
  '/app/posapp',
  '/assets/posawesome/js/posapp/posapp.js',
  '/assets/posawesome/js/posawesome.bundle.js',
  '/assets/posawesome/js/posapp/Home.vue',
  '/assets/posawesome/js/posapp/format.js',
  '/assets/posawesome/js/posapp/bus.js',
  '/assets/posawesome/js/posapp/components/Navbar.vue',
  '/assets/posawesome/js/posapp/components/pos/Pos.vue',
  '/assets/posawesome/js/posapp/components/pos/Invoice.vue',
  '/assets/posawesome/js/posapp/components/pos/ItemsSelector.vue',
  '/assets/posawesome/js/posapp/components/pos/Payments.vue',
  '/assets/posawesome/js/posapp/components/pos/Customer.vue',
  '/assets/posawesome/js/posapp/components/pos/pos.png',
  '/assets/posawesome/js/posapp/components/pos/placeholder-image.png',
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

// Precache static assets and clean up outdated caches
precacheAndRoute(self.__WB_MANIFEST || ASSETS_TO_CACHE);
cleanupOutdatedCaches();

// Stale-while-revalidate for API endpoints
registerRoute(
  ({ url }) => {
    return API_ROUTES_TO_CACHE.some(route => url.pathname.includes(route));
  },
  new StaleWhileRevalidate({
    cacheName: API_CACHE_NAME,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ 
        maxEntries: 100, 
        maxAgeSeconds: 12 * 3600 // Cache for 12 hours
      })
    ]
  })
);

// Cache first for static assets with network fallback
registerRoute(
  ({ request }) => request.destination === 'style' || 
                    request.destination === 'script' || 
                    request.destination === 'font' || 
                    request.destination === 'image',
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
      })
    ]
  })
);

// Network first for document navigation (HTML)
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'documents',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10 })
    ]
  })
);

// Use Background Sync for invoice submission
registerRoute(
  ({ url }) => url.pathname.includes('/api/method/posawesome.posawesome.api.posapp.submit_invoice'),
  new NetworkOnly({
    plugins: [bgSyncPlugin]
  }),
  'POST'
);

// Listen for messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Listen for sync events (for browsers that support it)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-invoices') {
    event.waitUntil(syncPendingInvoices());
  }
});

// Function to sync pending invoices when online
async function syncPendingInvoices() {
  console.log('[Service Worker] Syncing pending invoices');
  
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