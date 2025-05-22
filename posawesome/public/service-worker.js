import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

// Use injected manifest from Workbox
precacheAndRoute(self.__WB_MANIFEST);

// Clean up any outdated caches from previous versions
cleanupOutdatedCaches();

// Cache name for API responses
const API_CACHE_NAME = 'api-cache';

// Cache name for static assets
const STATIC_CACHE_NAME = 'static-cache';

// Background sync plugin for invoice queue
const bgSyncPlugin = new BackgroundSyncPlugin('invoiceQueue', {
  maxRetentionTime: 24 * 60  // retry for up to 24 hours
});

// Cache API responses with stale-while-revalidate strategy
registerRoute(
  ({ url }) => url.pathname.includes('/api/method/posawesome.posawesome.api.posapp'),
  new StaleWhileRevalidate({
    cacheName: API_CACHE_NAME,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 12 * 3600 })
    ]
  })
);

// Use NetworkFirst for critical API calls like creating invoices
registerRoute(
  ({ url }) => url.pathname.includes('/api/method/posawesome.posawesome.api.posapp.submit_invoice'),
  new NetworkFirst({
    cacheName: 'critical-api-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 2 * 3600 })
    ]
  })
);

// Register background sync for offline invoice submissions
registerRoute(
  /\/api\/method\/posawesome\.posawesome\.api\.posapp\.submit_invoice/,
  new NetworkOnly({
    plugins: [bgSyncPlugin]
  }),
  'POST'
);

// Cache static assets with stale-while-revalidate
registerRoute(
  ({ request }) => request.destination === 'script' ||
                  request.destination === 'style' ||
                  request.destination === 'font' ||
                  request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE_NAME,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }) // 30 days
    ]
  })
);

// Handle background sync event
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-invoices') {
    event.waitUntil(syncPendingInvoices());
  }
});

// Function to sync pending invoices when online
async function syncPendingInvoices() {
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
});

// Fallback for navigation requests to return app shell
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ]
  })
); 