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
  { url: '/app/posapp/', revision: '1.0.0' },
  { url: '/app/posapp/manifest.json', revision: '1.0.0' },
  { url: '/assets/posawesome.bundle.js', revision: '1.0.0' },
  { url: '/assets/posawesome.css', revision: '1.0.0' },
  { url: '/assets/posawesome/js/posapp/components/pos/', revision: '1.0.0' }
]);

// Cache API responses
workbox.routing.registerRoute(
  new RegExp('/api/method/posawesome.posawesome.api.posapp.*'),
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

// Cache all POS app routes
workbox.routing.registerRoute(
  new RegExp('/app/posapp/.*'),
  new workbox.strategies.NetworkFirst({
    cacheName: 'pos-routes-cache',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60 // 24 hours
      })
    ]
  })
);

// Cache static assets
workbox.routing.registerRoute(
  new RegExp('/assets/.*'),
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

// Cache fonts
workbox.routing.registerRoute(
  new RegExp('https://fonts.(?:googleapis|gstatic).com/(.*)'),
  new workbox.strategies.CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 30,
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
    cacheName: 'default-cache',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 24 * 60 * 60 // 24 hours
      })
    ]
  })
);

// Skip waiting and clients claim
self.skipWaiting();
workbox.core.clientsClaim(); 