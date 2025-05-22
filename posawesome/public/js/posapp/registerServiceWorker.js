/**
 * Service Worker Registration for POS Awesome
 */
export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      // Check if we're running on production or development
      const isProduction = window.location.hostname !== 'localhost' && 
                          window.location.hostname !== '127.0.0.1';
      
      // Only try to register service worker in production environment
      if (isProduction) {
        // First check if the service worker file exists to avoid 404 errors
        try {
          const swResponse = await fetch('/sw.js');
          if (!swResponse.ok) {
            console.warn('Service worker file not found. Skipping registration.');
            return null;
          }
        } catch (error) {
          console.warn('Service worker file not accessible. Skipping registration:', error);
          return null;
        }
        
        // If file exists, proceed with registration
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });
        
        console.log('Service worker registered successfully:', registration.scope);
        
        // Set up manual sync button for browsers without Background Sync
        setupManualSync();
        
        // Listen for controlling service worker changes
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('Service Worker controller changed');
        });
        
        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          handleServiceWorkerMessage(event.data);
        });
        
        return registration;
      } else {
        console.log('Development environment detected. Skipping service worker registration.');
        return null;
      }
    } catch (error) {
      console.error('Service worker registration failed:', error);
      return null;
    }
  } else {
    console.warn('Service workers are not supported in this browser');
    return null;
  }
}

/**
 * Handle service worker messages
 * @param {Object} data Message data
 */
function handleServiceWorkerMessage(data) {
  if (!data) return;
  
  switch (data.type) {
    case 'SYNC_STARTED':
      console.log('Sync started by service worker');
      // Dispatch event for UI components to show sync status
      window.dispatchEvent(new CustomEvent('pos-awesome-sync-started'));
      break;
      
    case 'SYNC_COMPLETE_NOTIFICATION':
      console.log('Sync completed:', data.message);
      // Dispatch event for UI components to update sync status
      window.dispatchEvent(new CustomEvent('pos-awesome-sync-complete', { 
        detail: { message: data.message }
      }));
      break;
      
    default:
      console.log('Unknown message from service worker:', data);
  }
}

/**
 * Set up manual sync button for browsers without Background Sync
 */
function setupManualSync() {
  // Check if Background Sync is supported
  if (navigator.serviceWorker && 'SyncManager' in window) {
    console.log('Background Sync is supported');
    return;
  }
  
  console.log('Background Sync not supported, enabling manual sync fallback');
  
  // Dispatch event to notify UI components to show manual sync button
  window.dispatchEvent(new CustomEvent('pos-awesome-enable-manual-sync'));
  
  // Set up interval for periodic sync checking
  window.setInterval(() => {
    if (navigator.onLine && window.offlineStorage) {
      console.log('Attempting automatic sync via fallback mechanism');
      window.offlineStorage.processPendingInvoices();
    }
  }, 60000); // Check every minute
} 