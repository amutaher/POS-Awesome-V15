# POS-Awesome PWA Setup Guide

## Overview
This guide will help you convert your POS-Awesome application into a Progressive Web App (PWA) that can work offline. Follow each step in sequence and check them off as you complete them.

## Prerequisites
- [ ] Frappe/ERPNext V15 installation
- [ ] POS-Awesome V15 installed
- [ ] Basic knowledge of JavaScript, Vue.js, and PWA concepts

## Installation Steps

### 1. Install Dependencies
- [ ] Run the following commands to install required dependencies:
```bash
cd /path/to/bench/apps/posawesome
yarn install
bench build --app posawesome
bench restart
```

### 2. Create Service Worker
- [ ] Create the service worker file at `posawesome/public/js/service-worker.js`:
```bash
mkdir -p posawesome/public/js
touch posawesome/public/js/service-worker.js
```

- [ ] Add the following code to the service worker:
```javascript
// Import Workbox modules
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

// Custom service worker logic
const CACHE_NAME = 'posawesome-cache-v1';

// Configure workbox
workbox.setConfig({
  debug: false
});

// Cache the app shell
workbox.precaching.precacheAndRoute([
  { url: '/assets/js/posawesome.bundle.js', revision: '1.0.0' },
  { url: '/assets/css/posawesome.css', revision: '1.0.0' },
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
```

### 3. Create Web App Manifest
- [ ] Create the web app manifest file at `posawesome/public/manifest.json`:
```bash
touch posawesome/public/manifest.json
```

- [ ] Add the following content to the manifest:
```json
{
  "name": "POS Awesome",
  "short_name": "POS",
  "start_url": "/desk#/pos-awesome",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#7575ff",
  "description": "Progressive Web App for POS Awesome",
  "icons": [
    {
      "src": "/assets/posawesome/images/pos-icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/assets/posawesome/images/pos-icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### 4. Create PWA Icons
- [ ] Create icons directory:
```bash
mkdir -p posawesome/public/images
```

- [ ] Add icon files:
  - [ ] Create 192x192 icon: `posawesome/public/images/pos-icon-192.png`
  - [ ] Create 512x512 icon: `posawesome/public/images/pos-icon-512.png`

### 5. Register Service Worker
- [ ] Create service worker registration file at `posawesome/public/js/pwa-register.js`:
```bash
touch posawesome/public/js/pwa-register.js
```

- [ ] Add the following code:
```javascript
// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/assets/posawesome/js/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registered with scope:', registration.scope);
      })
      .catch(error => {
        console.error('ServiceWorker registration failed:', error);
      });
  });
}
```

### 6. Update Hooks to Include PWA Files
- [ ] Update `posawesome/hooks.py` to include the PWA files:
```python
# Add in app_include_js
app_include_js = [
    "posawesome.bundle.js",
    "pwa-register.js",
]

# Add in web_include_js
web_include_js = [
    "manifest.json",
]
```

### 7. Implement IndexedDB Storage Service
- [ ] Create the DB service file at `posawesome/public/js/posapp/services/db.js`:
```bash
mkdir -p posawesome/public/js/posapp/services
touch posawesome/public/js/posapp/services/db.js
```

- [ ] Add the following code:
```javascript
import Dexie from 'dexie';

// Create Dexie database
const db = new Dexie('PosAwesomeDB');

// Define schema
db.version(1).stores({
  items: 'item_code, item_name, idx',
  customers: 'name, customer_name',
  invoices: '++id, name, createdAt, status',
  priceLists: 'name, currency',
  taxRules: 'name',
  pos_profile: 'name'
});

// Items operations
export const ItemsDB = {
  async saveItems(items) {
    return db.items.bulkPut(items);
  },
  async getItems() {
    return db.items.toArray();
  },
  async searchItems(query) {
    return db.items
      .filter(item => 
        item.item_name.toLowerCase().includes(query.toLowerCase()) || 
        item.item_code.toLowerCase().includes(query.toLowerCase())
      )
      .limit(20)
      .toArray();
  },
  async getItem(item_code) {
    return db.items.get(item_code);
  }
};

// Customers operations
export const CustomersDB = {
  async saveCustomers(customers) {
    return db.customers.bulkPut(customers);
  },
  async getCustomers() {
    return db.customers.toArray();
  }
};

// Invoices operations
export const InvoicesDB = {
  async addInvoice(invoice) {
    return db.invoices.add({
      ...invoice,
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
  },
  async getPendingInvoices() {
    return db.invoices.where('status').equals('pending').toArray();
  },
  async updateInvoiceStatus(id, status, serverResponse = null) {
    return db.invoices.update(id, { 
      status, 
      lastSyncAt: new Date().toISOString(),
      serverResponse 
    });
  }
};

export default {
  ItemsDB,
  CustomersDB,
  InvoicesDB
};
```

### 8. Create API Service with Offline Support
- [ ] Create the API service file at `posawesome/public/js/posapp/services/api.js`:
```bash
touch posawesome/public/js/posapp/services/api.js
```

- [ ] Add the following code:
```javascript
import { InvoicesDB } from './db';

// Network status
let isOnline = navigator.onLine;
window.addEventListener('online', () => {
  isOnline = true;
  processQueue();
});
window.addEventListener('offline', () => {
  isOnline = false;
});

// API wrapper
export async function apiCall(method, args = {}, options = {}) {
  const { isInvoice = false, offlineSupport = false } = options;
  
  if (isOnline) {
    try {
      const response = await frappe.call({
        method,
        args
      });
      return response;
    } catch (error) {
      if (isInvoice) {
        // If invoice creation fails, queue it
        await InvoicesDB.addInvoice({
          method,
          args,
          error: error.message
        });
        return { offline: true, queued: true, message: 'Transaction saved offline' };
      }
      throw error;
    }
  } else if (offlineSupport) {
    // If offline and operation supports offline mode
    if (isInvoice) {
      await InvoicesDB.addInvoice({
        method,
        args
      });
      return { offline: true, queued: true, message: 'Transaction saved offline' };
    }
    return { offline: true, message: 'App is offline' };
  } else {
    throw new Error('App is offline and this operation requires connectivity');
  }
}

// Process offline queue
export async function processQueue() {
  if (!isOnline) return;
  
  const pendingInvoices = await InvoicesDB.getPendingInvoices();
  
  for (const invoice of pendingInvoices) {
    try {
      const response = await frappe.call({
        method: invoice.method,
        args: invoice.args
      });
      
      await InvoicesDB.updateInvoiceStatus(invoice.id, 'synced', response);
      
      // Notify user
      frappe.show_alert({
        message: __('Offline invoice synced successfully'),
        indicator: 'green'
      });
    } catch (error) {
      await InvoicesDB.updateInvoiceStatus(invoice.id, 'error', error.message);
    }
  }
}

export default {
  apiCall,
  processQueue
};
```

### 9. Modify POS Component with Offline Support
- [ ] Modify the Pos.vue component to support offline operations
- [ ] Update API calls to use the new API service
- [ ] Add offline indicators to the UI

### 10. Build and Test
- [ ] Build the application:
```bash
bench build --app posawesome
bench restart
```

- [ ] Verify PWA installation:
  - [ ] Open Chrome DevTools > Application > Service Workers
  - [ ] Confirm service worker is registered
  - [ ] Check Manifest is loaded correctly
  - [ ] Verify offline mode works by disconnecting from network

## Verification Checklist
- [ ] Service worker registered successfully
- [ ] Web app manifest loaded correctly
- [ ] App shell loads when offline
- [ ] Items and customers available offline
- [ ] Can create transactions offline
- [ ] Transactions sync when back online
- [ ] PWA can be installed ("Add to Home Screen")

## Troubleshooting
- If service worker is not registering, check console for errors
- Clear browser cache and try again if updates don't appear
- Check IndexedDB in DevTools to ensure data is being stored
- Verify network requests in the Network tab when testing offline functionality

## Maintenance
- Update cache version in service worker when making significant changes
- Clear old caches as needed
- Monitor background sync performance and queue size 