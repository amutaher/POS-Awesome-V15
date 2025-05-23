/**
 * POS Awesome Service Worker
 * Provides offline capabilities and background sync
 * Version: 1.0.0
 */

// Cache names
const STATIC_CACHE_NAME = 'posawesome-static-v1';
const DYNAMIC_CACHE_NAME = 'pos-awesome-dynamic-v1';
const API_CACHE_NAME = 'pos-awesome-api-v1';

// Resources to cache immediately on install
const STATIC_RESOURCES = [
  '/assets/posawesome/js/posapp/',
  '/assets/posawesome/css/',
  '/assets/posawesome/icons/',
  '/assets/posawesome/manifest.json',
  '/assets/posawesome/node_modules/vuetify/dist/vuetify.min.css',
  'https://cdn.jsdelivr.net/npm/@mdi/font@6.x/css/materialdesignicons.min.css',
  'https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900'
];

// Default offline page
const OFFLINE_PAGE = '/posawesome/public/js/posapp/offline.html';

// Maximum number of items to keep in dynamic cache
const DYNAMIC_CACHE_MAX_ITEMS = 100;

// API endpoints to cache with network-first strategy
const API_ENDPOINTS = [
  '/api/method/posawesome.posawesome.api.posapp.get_items',
  '/api/method/posawesome.posawesome.api.posapp.get_customers',
  '/api/method/posawesome.posawesome.api.posapp.get_pos_profile'
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
      .then((cache) => {
        console.log('[Service Worker] Caching static resources');
        return Promise.allSettled(
          STATIC_RESOURCES.map(url => {
            return fetch(url, { credentials: 'same-origin' })
              .then(response => {
                if (!response.ok) {
                  throw new Error(`Failed to fetch ${url}: ${response.status}`);
                }
                return cache.put(url, response);
              })
              .catch(error => {
                console.warn(`[Service Worker] Failed to cache ${url}:`, error);
                // Continue with other resources even if one fails
                return Promise.resolve();
              });
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Static resources cached successfully');
      })
      .catch(error => {
        console.error('[Service Worker] Failed to cache static resources:', error);
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
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle static resources with cache-first strategy
  if (STATIC_RESOURCES.some(url => request.url.includes(url))) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // Handle API requests with network-first strategy
  if (request.url.includes('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Default to network-first for other requests
  event.respondWith(networkFirstStrategy(request));
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
 * Cache-first strategy for static resources
 * Used for static resources that rarely change
 */
async function cacheFirstStrategy(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (!networkResponse.ok) {
      throw new Error(`Network response was not ok: ${networkResponse.status}`);
    }

    const cache = await caches.open(STATIC_CACHE_NAME);
    await cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.warn(`[Service Worker] Cache-first strategy failed for ${request.url}:`, error);
    // Return a fallback response if available
    const fallbackResponse = await caches.match('/assets/posawesome/offline.html');
    return fallbackResponse || new Response('Offline content not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

/**
 * Network-first strategy with cache fallback
 * Used for API requests that should be fresh but can fall back to cache
 */
async function networkFirstStrategy(request) {
  try {
    // Try network first if online
    if (isOnline) {
      try {
        const networkResponse = await fetch(request.clone());
        
        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(API_CACHE_NAME);
          cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
      } catch (error) {
        console.log('[Service Worker] Network request failed, trying cache:', error);
      }
    }
    
    // Try cache if offline or network failed
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If not in cache and offline, return offline response
    return new Response(
      JSON.stringify({ 
        error: 'You are offline and this data is not cached',
        timestamp: Date.now()
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('[Service Worker] Network first strategy failed:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Service unavailable',
        timestamp: Date.now()
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Network with cache fallback strategy
 * Used for most dynamic content
 */
async function networkWithCacheFallbackStrategy(request) {
  try {
    // Try network first
    if (isOnline) {
      try {
        const networkResponse = await fetch(request.clone());
        
        // Cache successful responses that are not no-store
        if (
          networkResponse && 
          networkResponse.status === 200 && 
          !networkResponse.headers.get('Cache-Control')?.includes('no-store')
        ) {
          const cache = await caches.open(DYNAMIC_CACHE_NAME);
          cache.put(request, networkResponse.clone());
          
          // Limit the number of items in dynamic cache
          trimCache(DYNAMIC_CACHE_NAME, DYNAMIC_CACHE_MAX_ITEMS);
        }
        
        return networkResponse;
      } catch (error) {
        // Network request failed, try cache
        console.log('[Service Worker] Network request failed, falling back to cache');
      }
    }
    
    // Try cache if network failed or offline
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If main page request and not in cache, return offline page
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_PAGE);
    }
    
    // For other resources, try to fetch from network as a last resort
    try {
      return await fetch(request.clone());
    } catch (error) {
      console.error('[Service Worker] Both network and cache failed');
      
      // For API requests, return a JSON error
      if (request.headers.get('Accept')?.includes('application/json')) {
        return new Response(
          JSON.stringify({ error: 'You are offline and this data is not cached' }),
          { 
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      
      // For other resources, return a simple text response
      return new Response('Offline and not cached', { status: 503 });
    }
  } catch (error) {
    console.error('[Service Worker] Network with cache fallback strategy failed:', error);
    return caches.match(OFFLINE_PAGE);
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