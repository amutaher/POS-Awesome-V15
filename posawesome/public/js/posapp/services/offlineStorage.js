/**
 * Enhanced IndexedDB wrapper for offline storage in POS Awesome
 */
export default class OfflineStorage {
  constructor(dbName = 'posAwesomeDB', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.isOnline = navigator.onLine;
    this.ready = null; // Promise to track initialization
    
    // Listen for online/offline events
    window.addEventListener('online', this.handleOnlineStatusChange.bind(this));
    window.addEventListener('offline', this.handleOnlineStatusChange.bind(this));
    
    // Listen for sync messages from service worker
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));
    }

    // Initialize the database
    this.ready = this.init();
  }

  /**
   * Handle online/offline status changes
   */
  handleOnlineStatusChange() {
    this.isOnline = navigator.onLine;
    
    if (this.isOnline) {
      console.log('[OfflineStorage] Back online, attempting to sync data');
      this.triggerSync();
    } else {
      console.log('[OfflineStorage] Device is offline, data will be stored locally');
    }
  }
  
  /**
   * Handle messages from service worker
   */
  handleServiceWorkerMessage(event) {
    if (event.data && event.data.type === 'SYNC_PENDING_INVOICES') {
      this.processPendingInvoices()
        .then(() => {
          // Notify service worker that sync is complete
          if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'SYNC_COMPLETED'
            });
          }
        });
    }

    // Handle conflicts detected during sync
    if (event.data && event.data.type === 'SYNC_CONFLICT') {
      this.handleSyncConflict(event.data.requestData);
    }
  }

  /**
   * Handle sync conflict by storing the conflicting invoice in conflicts store
   * @param {Object} requestData The request data that caused a conflict
   */
  async handleSyncConflict(requestData) {
    try {
      // Extract the idempotency key from the headers
      const idempotencyKey = requestData.headers['Idempotency-Key'];
      
      if (!idempotencyKey) {
        console.error('[OfflineStorage] No idempotency key found in conflicting request');
        return;
      }
      
      // Get the original invoice data from pendingInvoices
      const pendingInvoice = await this.getData('pendingInvoices', idempotencyKey);
      
      if (!pendingInvoice) {
        console.error('[OfflineStorage] Could not find original invoice for conflict', idempotencyKey);
        return;
      }
      
      // Move the invoice to conflicts store
      await this.saveData('conflicts', {
        id: idempotencyKey,
        data: pendingInvoice.data,
        timestamp: requestData.timestamp,
        url: requestData.url
      });
      
      // Remove from pending invoices
      await this.deleteData('pendingInvoices', idempotencyKey);
      
      // Dispatch event for UI notification
      window.dispatchEvent(new CustomEvent('invoice-conflict-detected', {
        detail: { id: idempotencyKey }
      }));
      
      console.log('[OfflineStorage] Invoice conflict handled:', idempotencyKey);
    } catch (error) {
      console.error('[OfflineStorage] Error handling invoice conflict:', error);
    }
  }

  /**
   * Initialize the database with all required object stores
   * @returns {Promise} Promise that resolves when DB is ready
   */
  init() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.error("Your browser doesn't support IndexedDB");
        reject("IndexedDB not supported");
        return;
      }

      const request = window.indexedDB.open(this.dbName, this.version);

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('IndexedDB initialized successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('items')) {
          db.createObjectStore('items', { keyPath: 'item_code' });
        }
        
        if (!db.objectStoreNames.contains('customers')) {
          db.createObjectStore('customers', { keyPath: 'name' });
        }
        
        if (!db.objectStoreNames.contains('pendingInvoices')) {
          const store = db.createObjectStore('pendingInvoices', { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('conflicts')) {
          const store = db.createObjectStore('conflicts', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('invoices')) {
          const store = db.createObjectStore('invoices', { keyPath: 'name' });
          store.createIndex('customer', 'customer', { unique: false });
          store.createIndex('posting_date', 'posting_date', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('posProfile')) {
          db.createObjectStore('posProfile', { keyPath: 'name' });
        }
        
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Store data in the specified object store
   * @param {string} storeName The name of the object store
   * @param {Object} data The data to store
   * @returns {Promise} Promise that resolves when data is stored
   */
  async saveData(storeName, data) {
    await this.ready;
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Store multiple items in the specified object store
   * @param {string} storeName The name of the object store
   * @param {Array} items Array of items to store
   * @returns {Promise} Promise that resolves when all items are stored
   */
  async saveMultipleData(storeName, items) {
    await this.ready;
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      let completed = 0;
      let errors = [];

      items.forEach(item => {
        const request = store.put(item);
        
        request.onsuccess = () => {
          completed++;
          if (completed === items.length) {
            if (errors.length > 0) {
              reject(errors);
            } else {
              resolve(true);
            }
          }
        };
        
        request.onerror = (error) => {
          errors.push(error);
          completed++;
          if (completed === items.length) {
            reject(errors);
          }
        };
      });
    });
  }

  /**
   * Get data from the specified object store
   * @param {string} storeName The name of the object store
   * @param {string|number} id The ID of the data to retrieve
   * @returns {Promise} Promise that resolves with the retrieved data
   */
  async getData(storeName, id) {
    await this.ready;
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all data from the specified object store
   * @param {string} storeName The name of the object store
   * @returns {Promise} Promise that resolves with all data in the store
   */
  async getAllData(storeName) {
    await this.ready;
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get data by index
   * @param {string} storeName The name of the object store
   * @param {string} indexName The name of the index
   * @param {any} value The value to query
   * @returns {Promise} Promise that resolves with matching data
   */
  async getDataByIndex(storeName, indexName, value) {
    await this.ready;
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete data from the specified object store
   * @param {string} storeName The name of the object store
   * @param {string|number} id The ID of the data to delete
   * @returns {Promise} Promise that resolves when data is deleted
   */
  async deleteData(storeName, id) {
    await this.ready;
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data from the specified object store
   * @param {string} storeName The name of the object store to clear
   * @returns {Promise} Promise that resolves when store is cleared
   */
  async clearStore(storeName) {
    await this.ready;
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Queue a pending invoice for later submission
   * @param {Object} invoice Invoice data to queue
   * @returns {Promise} Promise that resolves with the ID of the queued invoice
   */
  async queuePendingInvoice(invoice) {
    await this.ready;
    
    // Generate a UUID for idempotency
    const id = this.generateUUID();
    
    // Pre-process the invoice for offline storage
    const preprocessedInvoice = this.preprocessInvoice(invoice.data);
    
    const pendingInvoice = {
      id: id,
      data: preprocessedInvoice,
      status: 'pending',
      timestamp: new Date().toISOString(),
      retryCount: 0
    };
    
    await this.saveData('pendingInvoices', pendingInvoice);
    
    // Dispatch event for UI notification
    window.dispatchEvent(new CustomEvent('invoice-queued', { 
      detail: { id: id }
    }));
    
    return id;
  }
  
  /**
   * Pre-process an invoice object for offline storage
   * Handles circular references and complex objects
   * @param {Object} obj The invoice object to process
   * @returns {Object} The processed invoice object
   */
  preprocessInvoice(obj) {
    // Make a deep copy to avoid modifying the original
    const copy = JSON.parse(JSON.stringify(obj));
    
    // Add any preprocessing logic here
    // For example, simplifying complex objects or removing unnecessary data
    
    return copy;
  }

  /**
   * Get all pending invoices
   * @returns {Promise} Promise that resolves with all pending invoices
   */
  async getPendingInvoices() {
    await this.ready;
    return this.getAllData('pendingInvoices');
  }
  
  /**
   * Get all conflict invoices
   * @returns {Promise} Promise that resolves with all conflict invoices
   */
  async getConflictInvoices() {
    await this.ready;
    return this.getAllData('conflicts');
  }

  /**
   * Cache POS profile for offline use
   * @param {Object} profile POS profile to cache
   * @returns {Promise} Promise that resolves when profile is cached
   */
  async cachePosProfile(profile) {
    await this.ready;
    return this.saveData('posProfile', profile);
  }

  /**
   * Cache items for offline use
   * @param {Array} items Array of items to cache
   * @returns {Promise} Promise that resolves when items are cached
   */
  async cacheItems(items) {
    await this.ready;
    return this.saveMultipleData('items', items);
  }

  /**
   * Cache customers for offline use
   * @param {Array} customers Array of customers to cache
   * @returns {Promise} Promise that resolves when customers are cached
   */
  async cacheCustomers(customers) {
    await this.ready;
    return this.saveMultipleData('customers', customers);
  }

  /**
   * Save a submitted invoice for reference
   * @param {Object} invoice Invoice to save
   * @returns {Promise} Promise that resolves when invoice is saved
   */
  async saveInvoice(invoice) {
    await this.ready;
    return this.saveData('invoices', invoice);
  }

  /**
   * Trigger sync of pending invoices
   * @returns {Promise} Promise that resolves when sync is triggered
   */
  async triggerSync() {
    if (!this.isOnline) {
      console.log('[OfflineStorage] Cannot sync while offline');
      return false;
    }
    
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      if ('sync' in navigator.serviceWorker.controller) {
        await navigator.serviceWorker.ready;
        try {
          await navigator.serviceWorker.ready.then(registration => {
            return registration.sync.register('sync-pending-invoices');
          });
          return true;
        } catch (error) {
          console.error('[OfflineStorage] Failed to register sync:', error);
          // Fall back to manual sync
          return this.processPendingInvoices();
        }
      } else {
        // If Background Sync API is not supported, process manually
        return this.processPendingInvoices();
      }
    }
    return false;
  }

  /**
   * Process all pending invoices
   * @returns {Promise} Promise that resolves when all invoices are processed
   */
  async processPendingInvoices() {
    await this.ready;
    
    if (!this.isOnline) {
      console.log('[OfflineStorage] Cannot process invoices while offline');
      return false;
    }
    
    const pendingInvoices = await this.getPendingInvoices();
    if (!pendingInvoices || pendingInvoices.length === 0) {
      console.log('[OfflineStorage] No pending invoices to process');
      return true;
    }
    
    console.log(`[OfflineStorage] Processing ${pendingInvoices.length} pending invoices`);
    
    // Dispatch event for UI notification
    window.dispatchEvent(new CustomEvent('sync-started', { 
      detail: { count: pendingInvoices.length }
    }));
    
    let successCount = 0;
    let failCount = 0;
    
    for (const invoice of pendingInvoices) {
      try {
        // Submit the invoice to the server with idempotency key
        const response = await fetch('/api/method/posawesome.posawesome.api.posapp.submit_invoice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': invoice.id
          },
          body: JSON.stringify({ invoice: invoice.data })
        });
        
        if (response.ok) {
          const result = await response.json();
          
          if (result && result.message && result.message.name) {
            // Successfully synced
            await this.deleteData('pendingInvoices', invoice.id);
            successCount++;
            
            // Save the server-created invoice for reference
            await this.saveInvoice({
              ...result.message,
              offline_id: invoice.id
            });
          } else {
            // Server accepted but returned unexpected response
            failCount++;
            console.error('[OfflineStorage] Unexpected server response:', result);
          }
        } else if (response.status === 409) {
          // Conflict - invoice already exists or conflicts with server state
          await this.handleSyncConflict({
            headers: { 'Idempotency-Key': invoice.id },
            timestamp: new Date().toISOString(),
            url: '/api/method/posawesome.posawesome.api.posapp.submit_invoice'
          });
          failCount++;
        } else {
          // Other server error
          failCount++;
          console.error('[OfflineStorage] Server error:', response.status);
          
          // Update retry count
          invoice.retryCount = (invoice.retryCount || 0) + 1;
          invoice.lastError = `HTTP ${response.status}`;
          invoice.lastErrorTime = new Date().toISOString();
          
          if (invoice.retryCount < 5) {
            // Keep in the queue for retrying later
            await this.saveData('pendingInvoices', invoice);
          } else {
            // Too many retries, move to conflicts
            await this.saveData('conflicts', {
              id: invoice.id,
              data: invoice.data,
              timestamp: new Date().toISOString(),
              error: `Failed after ${invoice.retryCount} attempts. Last error: ${invoice.lastError}`
            });
            await this.deleteData('pendingInvoices', invoice.id);
          }
        }
      } catch (error) {
        // Network or other error
        failCount++;
        console.error('[OfflineStorage] Error syncing invoice:', error);
        
        // Update retry count
        invoice.retryCount = (invoice.retryCount || 0) + 1;
        invoice.lastError = error.message;
        invoice.lastErrorTime = new Date().toISOString();
        
        if (invoice.retryCount < 5) {
          // Keep in the queue for retrying later
          await this.saveData('pendingInvoices', invoice);
        } else {
          // Too many retries, move to conflicts
          await this.saveData('conflicts', {
            id: invoice.id,
            data: invoice.data,
            timestamp: new Date().toISOString(),
            error: `Failed after ${invoice.retryCount} attempts. Last error: ${invoice.lastError}`
          });
          await this.deleteData('pendingInvoices', invoice.id);
        }
      }
    }
    
    // Dispatch event for UI notification
    window.dispatchEvent(new CustomEvent('sync-completed', { 
      detail: { 
        total: pendingInvoices.length,
        success: successCount,
        failed: failCount
      }
    }));
    
    return successCount > 0;
  }

  /**
   * Check if there is sufficient offline data available
   * @returns {Promise<Object>} Status of offline data availability
   */
  async checkOfflineDataAvailability() {
    await this.ready;
    
    const items = await this.getAllData('items');
    const customers = await this.getAllData('customers');
    const posProfile = await this.getAllData('posProfile');
    
    return {
      hasItems: items && items.length > 0,
      hasCustomers: customers && customers.length > 0,
      hasPosProfile: posProfile && posProfile.length > 0,
      isReady: items && items.length > 0 && posProfile && posProfile.length > 0
    };
  }
  
  /**
   * Generate a UUID v4 for idempotency keys
   * @returns {string} UUID v4 string
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Clean up resources
   */
  destroy() {
    window.removeEventListener('online', this.handleOnlineStatusChange);
    window.removeEventListener('offline', this.handleOnlineStatusChange);
    
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.removeEventListener('message', this.handleServiceWorkerMessage);
    }
    
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
} 