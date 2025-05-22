/**
 * Service Worker Registration for POS Awesome
 */
export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      // Check if we're running on production or development
      const isProduction = window.location.hostname !== 'localhost' && 
                          window.location.hostname !== '127.0.0.1';
      
      // Get the app base URL (needed to correctly reference the service worker)
      const baseUrl = window.frappe ? window.frappe.urllib.get_base_url() : '';
      
      // Define possible service worker paths to try
      const possiblePaths = [
        '/service-worker.js',
        '/posawesome/public/service-worker.js',
        '/assets/posawesome/public/service-worker.js',
        '/sw.js' // Original path as fallback
      ];
      
      // Only try to register service worker in production environment
      if (isProduction) {
        let serviceWorkerUrl = null;
        
        // Try to find the service worker file by testing each path
        for (const path of possiblePaths) {
          try {
            console.log(`Checking for service worker at: ${baseUrl}${path}`);
            const swResponse = await fetch(`${baseUrl}${path}`, {
              method: 'HEAD', // Use HEAD request to be efficient
              cache: 'no-cache' // Avoid cached responses
            });
            
            if (swResponse.ok) {
              console.log(`Found service worker at: ${baseUrl}${path}`);
              serviceWorkerUrl = `${baseUrl}${path}`;
              break;
            }
          } catch (err) {
            console.log(`Service worker not found at: ${baseUrl}${path}`);
            // Continue trying other paths
          }
        }
        
        // If no service worker found, log and return
        if (!serviceWorkerUrl) {
          console.warn('No service worker found at any of the expected locations. Skipping registration.');
          return null;
        }
        
        // If file exists, proceed with registration
        console.log(`Registering service worker from: ${serviceWorkerUrl}`);
        const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
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
      // Don't let service worker failures block the app from working
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