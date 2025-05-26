// Import Workbox modules
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

// Custom service worker logic
const CACHE_NAME = 'posawesome-cache-v1';

// Configure workbox
workbox.setConfig({
  debug: true // Enable debug mode to see what's happening
});

// Cache the app shell
workbox.precaching.precacheAndRoute([
  { url: '/assets/posawesome/js/posawesome.bundle.js', revision: '1.0.0' },
  { url: '/assets/posawesome/css/posawesome.css', revision: '1.0.0' },
  { url: '/assets/posawesome/js/manifest.json', revision: '1.0.0' },
  // Add other important assets
]);

// Cache API responses
workbox.routing.registerRoute(
  new RegExp('/api/method/posawesome.posawesome.api.posapp.get_items'),
  new workbox.strategies.NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60 // 24 hours
      })
    ]
  })
);

// Cache customer data
workbox.routing.registerRoute(
  new RegExp('/api/method/posawesome.posawesome.api.posapp.get_customer_names'),
  new workbox.strategies.NetworkFirst({
    cacheName: 'customer-cache',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60 // 24 hours
      })
    ]
  })
);

// Cache for other static resources (images, etc.)
workbox.routing.registerRoute(
  new RegExp('/assets/'),
  new workbox.strategies.CacheFirst({
    cacheName: 'assets-cache',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
      })
    ]
  })
);

// Background sync for offline transactions
const bgSyncPlugin = new workbox.backgroundSync.BackgroundSyncPlugin('pos-queue', {
  maxRetentionTime: 24 * 60 // Retry for up to 24 hours (in minutes)
});

// Register route for offline invoice submission
workbox.routing.registerRoute(
  new RegExp('/api/method/posawesome.posawesome.api.posapp.submit_invoice'),
  new workbox.strategies.NetworkOnly({
    plugins: [bgSyncPlugin]
  }),
  'POST'
);

// Handle offline fallback
workbox.routing.setDefaultHandler(
  new workbox.strategies.NetworkFirst({
    cacheName: 'default-cache'
  })
);

// Skip waiting and clients claim
self.skipWaiting();
workbox.core.clientsClaim(); 