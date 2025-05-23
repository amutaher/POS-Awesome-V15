/**
 * Service Worker Registration for POS Awesome
 * Handles PWA functionality and background sync
 */

// Configuration
const SW_CONFIG = {
  // Service worker registration options
  registerOptions: {
    scope: '/'
  },
  // Retry settings for failed registrations
  retryAttempts: 3,
  retryDelay: 2000, // 2 seconds
  // Periodic sync registration options (if supported)
  periodicSync: {
    minInterval: 60 * 60 * 1000, // 1 hour in milliseconds
    tag: 'pos-awesome-periodic-sync'
  }
};

/**
 * Register the service worker with reliability and error handling
 * @returns {Promise<ServiceWorkerRegistration|null>} The service worker registration if successful
 */
export async function registerServiceWorker() {
  // Check if service workers are supported
  if (!('serviceWorker' in navigator)) {
    console.warn('[POS Awesome] Service workers are not supported in this browser. Offline functionality will be limited.');
    return Promise.resolve(null);
  }

  // Check if we're in a secure context (required for service workers)
  if (!window.isSecureContext) {
    console.warn('[POS Awesome] Service worker registration failed: Not in a secure context. Offline functionality will be limited.');
    return Promise.resolve(null);
  }

  // Keep track of registration attempts
  let attemptCount = 0;

  // Define registration function with retries
  const attemptRegistration = async () => {
    try {
      attemptCount++;
      console.log(`[POS Awesome] Attempting service worker registration (attempt ${attemptCount}/${SW_CONFIG.retryAttempts})`);
      
      // Get the service worker URL (adjust path if needed)
      const swUrl = '/posawesome/public/js/posapp/service-worker.js';
      
      // Register the service worker
      const registration = await navigator.serviceWorker.register(swUrl, SW_CONFIG.registerOptions);
      
      console.log('[POS Awesome] Service worker registration successful:', registration.scope);
      
      // If registration is successful, try to set up periodic sync if available
      try {
        await setupBackgroundSync(registration);
      } catch (syncError) {
        console.warn('[POS Awesome] Background sync setup failed:', syncError);
      }
      
      // Monitor for controller changes (service worker activation)
      if (!navigator.serviceWorker.controller) {
        await waitForControllerChange();
        console.log('[POS Awesome] Service worker now controlling page');
      }
      
      return registration;
    } catch (error) {
      console.error('[POS Awesome] Service worker registration failed:', error);
      
      // Retry registration if we haven't exceeded retry attempts
      if (attemptCount < SW_CONFIG.retryAttempts) {
        console.log(`[POS Awesome] Retrying service worker registration in ${SW_CONFIG.retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, SW_CONFIG.retryDelay));
        return attemptRegistration();
      }
      
      throw error;
    }
  };

  return attemptRegistration().catch(error => {
    // Final fallback - notify user and resolve with null instead of rejecting
    console.error('[POS Awesome] Service worker registration ultimately failed:', error);
    window.dispatchEvent(new CustomEvent('pos-awesome-sw-registration-failed', { 
      detail: { error: error.message } 
    }));
    return null;
  });
}

/**
 * Wait for the service worker to take control of the page
 * @returns {Promise<void>} Promise that resolves when controller changes
 */
function waitForControllerChange() {
  return new Promise(resolve => {
    // If there's already a controller, resolve immediately
    if (navigator.serviceWorker.controller) {
      return resolve();
    }
    
    // Otherwise wait for the controllerchange event
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      resolve();
    }, { once: true });
    
    // Add a timeout to prevent hanging indefinitely
    setTimeout(resolve, 10000);
  });
}

/**
 * Setup background sync registration
 * @param {ServiceWorkerRegistration} registration The service worker registration
 * @returns {Promise<void>} Promise that resolves when setup is complete
 */
async function setupBackgroundSync(registration) {
  // First try to register persistent background sync if available
  if ('periodicSync' in registration) {
    try {
      // Check if we have permission for periodic background sync
      const status = await navigator.permissions.query({
        name: 'periodic-background-sync',
      });
      
      if (status.state === 'granted') {
        // Register periodic sync
        await registration.periodicSync.register(SW_CONFIG.periodicSync.tag, {
          minInterval: SW_CONFIG.periodicSync.minInterval
        });
        console.log('[POS Awesome] Periodic background sync registered');
      } else {
        console.log('[POS Awesome] Periodic background sync not permitted');
      }
    } catch (error) {
      console.warn('[POS Awesome] Periodic sync registration failed:', error);
    }
  }
  
  // Register one-time background sync (more widely supported)
  if ('sync' in registration) {
    try {
      await registration.sync.register('pos-awesome-sync');
      console.log('[POS Awesome] Background sync registered');
    } catch (error) {
      console.warn('[POS Awesome] Background sync registration failed:', error);
    }
  }
}

/**
 * Manually trigger a sync event via the service worker
 * @param {string} syncTag The tag to identify the sync operation
 * @returns {Promise<boolean>} Whether the sync was successfully triggered
 */
export async function triggerServiceWorkerSync(syncTag = 'pos-awesome-sync') {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
    console.warn('[POS Awesome] Cannot trigger sync: No active service worker');
    return false;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Try background sync API first
    if ('sync' in registration) {
      await registration.sync.register(syncTag);
      console.log(`[POS Awesome] Background sync '${syncTag}' triggered`);
      return true;
    }
    
    // Fallback: Send message to service worker
    navigator.serviceWorker.controller.postMessage({
      type: 'TRIGGER_SYNC',
      tag: syncTag,
      timestamp: Date.now()
    });
    console.log(`[POS Awesome] Sync message sent to service worker`);
    return true;
  } catch (error) {
    console.error('[POS Awesome] Failed to trigger service worker sync:', error);
    return false;
  }
}

/**
 * Check if the app is installed as PWA
 * @returns {boolean} True if the app is installed
 */
export function isRunningAsPWA() {
  // Check various indicators that we might be running as a PWA
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

/**
 * Check if background sync is supported in this browser
 * @returns {Promise<boolean>} True if background sync is supported
 */
export async function isBackgroundSyncSupported() {
  if (!('serviceWorker' in navigator)) {
    return false;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    return 'sync' in registration;
  } catch (error) {
    return false;
  }
}

/**
 * Initialize service worker message handling
 * Allows communicating with the service worker
 */
export function initServiceWorkerMessaging() {
  // Skip if service workers aren't supported
  if (!('serviceWorker' in navigator)) {
    return;
  }
  
  // Set up navigator.serviceWorker message event listener
  navigator.serviceWorker.addEventListener('message', event => {
    const message = event.data;
    
    if (!message || !message.type) {
      return;
    }
    
    console.log('[POS Awesome] Received message from service worker:', message.type);
    
    // Handle different message types
    switch (message.type) {
      case 'SYNC_NEEDED':
        window.dispatchEvent(new CustomEvent('pos-awesome-sync-needed', { 
          detail: { timestamp: message.timestamp, reason: message.reason } 
        }));
        break;
        
      case 'SYNC_COMPLETED':
        window.dispatchEvent(new CustomEvent('pos-awesome-sync-complete', { 
          detail: { timestamp: message.timestamp, results: message.results } 
        }));
        break;
        
      case 'SYNC_FAILED':
        window.dispatchEvent(new CustomEvent('pos-awesome-sync-failed', { 
          detail: { timestamp: message.timestamp, error: message.error } 
        }));
        break;
        
      case 'NETWORK_STATUS':
        window.dispatchEvent(new CustomEvent('pos-awesome-sw-network-status', { 
          detail: { isOnline: message.isOnline, timestamp: message.timestamp } 
        }));
        break;
    }
  });
} 