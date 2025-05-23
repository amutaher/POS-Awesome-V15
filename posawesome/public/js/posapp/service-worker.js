/**
 * POS Awesome Service Worker
 * Provides offline capabilities and background sync
 * Version: 1.0.0
 */

// Cache Names
const CACHE_VERSION = 'v1';
const STATIC_CACHE_NAME = 'pos-awesome-static-' + CACHE_VERSION;
const DYNAMIC_CACHE_NAME = 'pos-awesome-dynamic-' + CACHE_VERSION;
const API_CACHE_NAME = 'pos-awesome-api-' + CACHE_VERSION;

// Resources to cache
const STATIC_RESOURCES = [
  '/',
  '/posawesome/public/js/posapp/index.html',
  '/posawesome/public/js/posapp/app.js',
  '/posawesome/public/js/posapp/styles.css',
  '/posawesome/public/js/posapp/manifest.json',
  '/posawesome/public/js/posapp/assets/icons/*',
  // Add other static resources
];

// Default offline page
const OFFLINE_PAGE = '/posawesome/public/js/posapp/offline.html';

// Maximum number of items to keep in dynamic cache
const DYNAMIC_CACHE_MAX_ITEMS = 100;

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/method/frappe.auth.get_logged_user',
  '/api/method/posawesome.posawesome.api.get_items',
  '/api/method/posawesome.posawesome.api.get_customers',
  // Add other API endpoints
];

// Network status tracking
let isOnline = true;
let lastOnlineTime = Date.now();
let networkStatusInterval;

/**
 * Service Worker Install Event
 * Cache static resources and offline page
 */
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  // Skip waiting to activate immediately
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching static resources');
        return cache.addAll(STATIC_RESOURCES).catch(error => {
          console.error('[Service Worker] Failed to cache some static resources:', error);
          // Continue anyway - partial caching is better than none
          return cache.addAll([OFFLINE_PAGE]);
        });
      })
  );
});

/**
 * Service Worker Activate Event
 * Clean up old caches and claim clients
 */
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
  // Delete old caches
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (
              cacheName !== STATIC_CACHE_NAME && 
              cacheName !== DYNAMIC_CACHE_NAME && 
              cacheName !== API_CACHE_NAME
            ) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Claiming clients');
        return self.clients.claim();
      })
      .then(() => {
        // Set up network status checking
        startNetworkStatusChecking();
        return self.skipWaiting();
      })
  );
});

/**
 * Service Worker Fetch Event
 * Handle network requests with appropriate caching strategies
 */
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }

  // Handle API requests (network-first with cache fallback)
  if (isApiRequest(request)) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Handle static resource requests (cache-first with network fallback)
  if (isStaticResourceRequest(request)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // For all other requests (dynamic content)
  event.respondWith(networkWithCacheFallbackStrategy(request));
});

/**
 * Service Worker Sync Event
 * Handle background sync requests
 */
self.addEventListener('sync', event => {
  console.log('[Service Worker] Background Sync event:', event.tag);
  
  if (event.tag === 'pos-awesome-sync' || event.tag === 'sync-pending-invoices') {
    event.waitUntil(syncPendingData());
  }
});

/**
 * Service Worker Periodic Sync Event (newer browsers)
 */
self.addEventListener('periodicsync', event => {
  console.log('[Service Worker] Periodic Sync event:', event.tag);
  
  if (event.tag === 'pos-awesome-periodic-sync') {
    event.waitUntil(syncPendingData());
  }
});

/**
 * Service Worker Message Event
 * Handle messages from the main thread
 */
self.addEventListener('message', event => {
  console.log('[Service Worker] Message received:', event.data);
  
  const message = event.data;
  
  if (!message || !message.type) {
    return;
  }
  
  switch (message.type) {
    case 'TRIGGER_SYNC':
      syncPendingData().then(() => {
        notifyClientsOfSync('manual-trigger');
      });
      break;
      
    case 'CHECK_NETWORK_STATUS':
      checkAndUpdateNetworkStatus();
      break;
      
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
  }
});

/**
 * Cache-first strategy with network fallback
 * Used for static resources that rarely change
 */
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(STATIC_CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Cache first strategy failed:', error);
    throw error;
  }
}

/**
 * Network-first strategy with cache fallback
 * Used for API requests that should be fresh but can fall back to cache
 */
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await Promise.race([
      fetch(request),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 5000)
      )
    ]);
    
    // Cache successful response
    const cache = await caches.open(API_CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network request failed, falling back to cache');
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

/**
 * Network with cache fallback strategy
 * Used for most dynamic content
 */
async function networkWithCacheFallbackStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network request failed, falling back to cache');
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

/**
 * Start checking network status periodically
 */
function startNetworkStatusChecking() {
  // Initial check
  checkAndUpdateNetworkStatus();
  
  // Clear any existing interval
  if (networkStatusInterval) {
    clearInterval(networkStatusInterval);
  }
  
  // Set up periodic checking
  networkStatusInterval = setInterval(() => {
    checkAndUpdateNetworkStatus();
  }, 60000); // Check every minute
}

/**
 * Check and update the current network status
 */
async function checkAndUpdateNetworkStatus() {
  try {
    // Try to fetch a tiny resource to check connectivity
    const response = await fetch('/api/method/ping', {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'X-Requested-With': 'XMLHttpRequest'
      },
      mode: 'cors'
    });
    
    const newStatus = response.ok;
    
    // If status changed, update and notify clients
    if (newStatus !== isOnline) {
      isOnline = newStatus;
      lastOnlineTime = isOnline ? Date.now() : lastOnlineTime;
      
      notifyClientsOfNetworkChange();
      
      // If we're back online, try to sync
      if (isOnline) {
        syncPendingData();
      }
    }
  } catch (error) {
    // If fetch fails, we're offline
    if (isOnline) {
      isOnline = false;
      notifyClientsOfNetworkChange();
    }
  }
}

/**
 * Notify all clients of network status change
 */
function notifyClientsOfNetworkChange() {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'NETWORK_STATUS',
        isOnline: isOnline,
        timestamp: Date.now(),
        lastOnlineTime: lastOnlineTime
      });
    });
  });
}

/**
 * Notify all clients of sync
 */
function notifyClientsOfSync(reason, results) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETED',
        timestamp: Date.now(),
        reason: reason,
        results: results
      });
    });
  });
}

/**
 * Synchronize pending data with server
 */
async function syncPendingData() {
  // First check if we're actually online
  if (!isOnline) {
    console.log('[Service Worker] Cannot sync while offline');
    return false;
  }
  
  console.log('[Service Worker] Syncing pending data...');
  
  // Notify clients that sync has started
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_STARTED',
        timestamp: Date.now()
      });
    });
  });
  
  try {
    // Request the client to handle the sync if possible
    // This is better than trying to access IndexedDB directly from the service worker
    const activeClient = await getActiveClient();
    
    if (activeClient) {
      // Ask the client to handle the sync
      activeClient.postMessage({
        type: 'HANDLE_SYNC',
        timestamp: Date.now()
      });
      
      // The client will notify us when done via message
      return true;
    } else {
      // No client is active, we'll try again when a client becomes active
      console.log('[Service Worker] No active client to handle sync');
      return false;
    }
  } catch (error) {
    console.error('[Service Worker] Error syncing data:', error);
    
    // Notify clients of sync failure
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_FAILED',
          timestamp: Date.now(),
          error: error.message
        });
      });
    });
    
    return false;
  }
}

/**
 * Get an active client if available
 * @returns {Promise<Client|null>} A client or null if none available
 */
async function getActiveClient() {
  const clients = await self.clients.matchAll({ type: 'window' });
  
  // Find a visible client (user has the tab open)
  const visibleClient = clients.find(client => client.visibilityState === 'visible');
  if (visibleClient) {
    return visibleClient;
  }
  
  // Otherwise return any client
  return clients[0] || null;
}

/**
 * Trim a cache to a maximum number of items
 * @param {string} cacheName The name of the cache to trim
 * @param {number} maxItems Maximum number of items to keep
 */
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    
    if (keys.length > maxItems) {
      console.log(`[Service Worker] Trimming cache ${cacheName} (${keys.length} > ${maxItems})`);
      
      // Delete oldest items first (from the beginning of the array)
      const itemsToDelete = keys.length - maxItems;
      
      for (let i = 0; i < itemsToDelete; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch (error) {
    console.error('[Service Worker] Error trimming cache:', error);
  }
}

/**
 * Check if a request is for an API endpoint
 * @param {Request} request The request to check
 * @returns {boolean} True if this is an API request
 */
function isApiRequest(request) {
  return API_ENDPOINTS.some(endpoint => request.url.includes(endpoint));
}

/**
 * Check if a request is for a static resource
 * @param {Request} request The request to check
 * @returns {boolean} True if this is a static resource request
 */
function isStaticResourceRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Check if the path matches any static resource path
  return STATIC_RESOURCES.some(resource => {
    const resourcePath = new URL(resource, self.location.origin).pathname;
    return path === resourcePath || path.includes('.js') || 
           path.includes('.css') || path.includes('.svg') || 
           path.includes('.png') || path.includes('.jpg') || 
           path.includes('.json') || path.includes('.woff') || 
           path.includes('.ttf');
  });
} 