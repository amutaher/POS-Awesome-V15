// Service Worker Registration Script

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/assets/posawesome/dist/service-worker.js', { scope: '/' })
      .then(registration => {
        console.log('POS Awesome Service Worker registered with scope:', registration.scope);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('New service worker installing:', newWorker);
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker is installed but waiting to activate
              console.log('New version available! Ready to update.');
              
              // You can show a notification to the user here
              if (frappe && frappe.show_alert) {
                frappe.show_alert({
                  message: __('A new version of POS Awesome is available. Refresh to update.'),
                  indicator: 'green'
                }, 10);
              }
            }
          });
        });
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error);
      });
    
    // Listen for controller change events (when a new service worker takes over)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('New service worker controller, page will reload');
    });
  });
} 