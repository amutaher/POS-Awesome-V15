# POS Awesome PWA Implementation

This document outlines the Progressive Web App (PWA) implementation for POS Awesome.

## Implemented Features

1. **Web App Manifest**: Configured in `manifest.json` to allow the app to be installed on devices
2. **Service Worker**: Implemented in `service-worker.js` to enable offline capabilities
3. **Offline Detection**: Added offline notification in Home.vue
4. **IndexedDB Storage**: Created offlineStorage.js service for local data persistence
5. **Offline Invoice Submission**: Ability to create and queue invoices while offline
6. **Background Sync**: Automatic synchronization of queued data when coming back online
7. **Install Prompt**: User-friendly prompt to install the PWA
8. **Automatic Cache Versioning**: Implemented Workbox precaching for automatic cache management

## How Offline Mode Works

The POS Awesome PWA allows users to continue working even when they lose internet connectivity:

1. **Data Caching**: When online, the app caches essential data like items, customers, and POS profile
2. **Offline Detection**: The app automatically detects when the device goes offline
3. **Local Operations**: While offline, users can:
   - Browse previously cached items
   - Add items to cart
   - Create invoices
   - Save invoices to a local queue
4. **Background Sync**: When connection is restored, the app automatically:
   - Detects online status
   - Processes the queue of pending invoices
   - Syncs them with the server
   - Notifies the user of sync completion

## Using Offline Functionality

### For End Users

1. **First-time Setup**: 
   - Make sure to use the app online first to cache necessary data
   - Consider installing the PWA for better offline experience

2. **While Offline**:
   - You'll see an offline indicator
   - Continue working as normal
   - When creating an invoice, it will be automatically queued
   - A notification will confirm the invoice was saved offline

3. **Coming Back Online**:
   - The app will automatically sync pending invoices
   - A notification will appear when sync is complete
   - Failed syncs will be marked for manual review

### For Developers

The offline functionality is implemented through several key components:

1. **Service Worker (`service-worker.js`)**:
   - Caches static assets and API responses
   - Intercepts network requests
   - Provides offline fallbacks
   - Manages background sync

2. **Workbox Integration**:
   - Automatic cache versioning using precacheAndRoute
   - Clean up of outdated caches with cleanupOutdatedCaches
   - Build-time asset versioning with __WB_MANIFEST
   - Configured with vite-plugin-pwa for production builds

3. **OfflineStorage Class (`offlineStorage.js`)**:
   - Wrapper around IndexedDB
   - Provides methods for CRUD operations
   - Handles data caching and retrieval
   - Manages pending invoice queue

4. **POS Component (`Pos.vue`)**:
   - Initializes offline storage
   - Detects online/offline status
   - Caches necessary data when online
   - Provides offline UI indicators

5. **Invoice Component (`Invoice.vue`)**:
   - Adapts submission process based on connectivity
   - Queues invoices for offline use
   - Shows appropriate status messages

## Code Examples

### Initializing Offline Storage

```javascript
// In your component
async initOfflineStorage() {
  this.offlineStorage = new OfflineStorage('posAwesomeDB', 1);
  await this.offlineStorage.init();
  this.offlineDataStatus = await this.offlineStorage.checkOfflineDataAvailability();
}
```

### Caching Data for Offline Use

```javascript
async cacheItemsForOffline() {
  const response = await frappe.call('posawesome.posawesome.api.posapp.get_items', {
    pos_profile: this.pos_profile.name,
  });
  
  if (response.message && response.message.items) {
    await this.offlineStorage.cacheItems(response.message.items);
  }
}
```

### Submitting Invoice While Offline

```javascript
async submit_invoice() {
  if (!navigator.onLine) {
    try {
      const invoiceDoc = this.get_invoice_doc();
      await this.offlineStorage.queuePendingInvoice({
        invoice_data: invoiceDoc,
        created_at: new Date().toISOString()
      });
      this.clear_invoice();
      // Show success message
    } catch (error) {
      // Handle error
    }
    return;
  }
  
  // Normal online submission logic
}
```

### Syncing Offline Data When Back Online

```javascript
async processPendingInvoices() {
  if (!this.isOnline) return;
  
  const pendingInvoices = await this.getPendingInvoices();
  
  for (const invoice of pendingInvoices) {
    try {
      // Submit invoice to server
      const result = await frappe.call({
        method: 'posawesome.posawesome.api.posapp.submit_invoice',
        args: { invoice: invoice.invoice_data }
      });
      
      if (result.message && result.message.name) {
        // Successfully synced
        await this.deleteData('pendingInvoices', invoice.local_id);
      }
    } catch (error) {
      // Handle error
    }
  }
}
```

## Automatic Cache Versioning

POS Awesome now uses Workbox for automatic cache versioning, eliminating the need for manual cache version changes:

1. **How It Works**:
   - During build time, the Workbox injects a manifest of all static assets with their hash values
   - The service worker uses this manifest to precache assets
   - When files change, their hashes change, automatically updating the cache
   - Old caches are automatically cleaned up

2. **Benefits**:
   - No more manual version bumps in the service worker
   - Clients always receive the latest assets
   - Only changed files are re-cached, improving performance
   - Cache management is handled automatically

3. **Implementation Details**:
   - Uses `workbox-precaching` for cache management
   - Implements `precacheAndRoute` to handle caching strategy
   - Uses `cleanupOutdatedCaches` to remove old cache versions
   - Configured through Vite plugin for seamless integration with the build process

4. **Example Code**:
```javascript
// In service-worker.js
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Precache all build assets (hashed at build time)
precacheAndRoute(self.__WB_MANIFEST);

// Clean up any outdated caches from previous versions
cleanupOutdatedCaches();
```

## Resources

- [MDN Web Docs: Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Google Web Fundamentals: Service Workers](https://developers.google.com/web/fundamentals/primers/service-workers)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Workbox Documentation](https://developer.chrome.com/docs/workbox/)
- [Workbox GitHub](https://github.com/GoogleChrome/workbox)