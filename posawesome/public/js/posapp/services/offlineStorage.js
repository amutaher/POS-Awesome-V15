/**
 * Enhanced IndexedDB wrapper for offline storage in POS Awesome
 */
// Remove external uuid dependency
// import { v4 as uuidv4 } from 'uuid';

// Simple UUID generator function
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default class OfflineStorage {
  constructor(dbName = 'posAwesomeDB', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.isOnline = navigator.onLine;
    
    // Setup the ready promise that can be awaited by the app
    this.ready = this.init();
    
    // Listen for online/offline events
    window.addEventListener('online', this.handleOnlineStatusChange.bind(this));
    window.addEventListener('offline', this.handleOnlineStatusChange.bind(this));
    
    // Listen for sync messages from service worker
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));
    }
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
          db.createObjectStore('conflicts', { keyPath: 'id' });
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
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data from the specified object store
   * @param {string} storeName The name of the object store
   * @returns {Promise} Promise that resolves when store is cleared
   */
  async clearStore(storeName) {
    await this.ready;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Queue an invoice for processing when online
   * @param {Object} invoice The invoice data
   * @returns {Promise<string>} Promise that resolves with the ID of the queued invoice
   */
  async queuePendingInvoice(invoice) {
    await this.ready;
    
    // Create an envelope with a UUID for idempotency
    const id = generateUUID();
    const envelope = {
      id,
      data: invoice,
      status: 'pending',
      timestamp: new Date().toISOString(),
      attempts: 0
    };
    
    await this.saveData('pendingInvoices', envelope);
    return id;
  }

  /**
   * Get all pending invoices
   * @returns {Promise<Array>} Promise that resolves with all pending invoices
   */
  async getPendingInvoices() {
    await this.ready;
    return this.getAllData('pendingInvoices');
  }

  /**
   * Get all conflict invoices
   * @returns {Promise<Array>} Promise that resolves with all conflicts
   */
  async getConflicts() {
    await this.ready;
    return this.getAllData('conflicts');
  }

  /**
   * Cache the POS profile for offline use
   * @param {Object} profile The POS profile data
   * @returns {Promise} Promise that resolves when data is stored
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
   * Save an invoice
   * @param {Object} invoice The invoice data
   * @returns {Promise} Promise that resolves when invoice is saved
   */
  async saveInvoice(invoice) {
    await this.ready;
    return this.saveData('invoices', invoice);
  }

  /**
   * Trigger sync with server
   */
  async triggerSync() {
    await this.ready;
    
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      if ('sync' in navigator.serviceWorker.controller) {
        try {
          await navigator.serviceWorker.ready;
          await navigator.serviceWorker.controller.sync.register('sync-pending-invoices');
          return true;
        } catch (error) {
          console.error('Failed to register sync:', error);
          this.processPendingInvoices();
          return false;
        }
      } else {
        // Fallback for browsers without Background Sync
        this.processPendingInvoices();
        return false;
      }
    }
    return false;
  }

  /**
   * Process pending invoices
   * @returns {Promise} Promise that resolves when all invoices are processed
   */
  async processPendingInvoices() {
    await this.ready;
    
    if (!this.isOnline) {
      console.log('Cannot process invoices while offline');
      return false;
    }

    const pendingInvoices = await this.getPendingInvoices();
    
    if (!pendingInvoices || pendingInvoices.length === 0) {
      console.log('No pending invoices to process');
      return true;
    }

    console.log(`Processing ${pendingInvoices.length} pending invoices`);
    
    // Process each invoice
    const results = await Promise.allSettled(
      pendingInvoices.map(async (envelope) => {
        try {
          // Update attempts counter
          envelope.attempts += 1;
          await this.saveData('pendingInvoices', envelope);
          
          // Submit the invoice with idempotency key
          const response = await fetch('/api/method/posawesome.posawesome.api.posapp.submit_invoice', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': envelope.id
            },
            body: JSON.stringify(envelope.data)
          });
          
          const result = await response.json();
          
          if (response.status === 409) {
            // Conflict detected, move to conflicts store
            await this.saveData('conflicts', envelope);
            await this.deleteData('pendingInvoices', envelope.id);
            return { status: 'conflict', id: envelope.id };
          } else if (result.error) {
            // Server error
            if (envelope.attempts >= 3) {
              // Move to conflicts after 3 attempts
              envelope.status = 'failed';
              envelope.error = result.error;
              await this.saveData('conflicts', envelope);
              await this.deleteData('pendingInvoices', envelope.id);
              return { status: 'failed', id: envelope.id, error: result.error };
            }
            return { status: 'retry', id: envelope.id };
          } else {
            // Success
            await this.deleteData('pendingInvoices', envelope.id);
            if (result.invoice) {
              await this.saveInvoice(result.invoice);
            }
            return { status: 'success', id: envelope.id };
          }
        } catch (error) {
          console.error(`Error processing invoice ${envelope.id}:`, error);
          if (envelope.attempts >= 3) {
            // Move to conflicts after 3 attempts
            envelope.status = 'failed';
            envelope.error = error.message;
            await this.saveData('conflicts', envelope);
            await this.deleteData('pendingInvoices', envelope.id);
            return { status: 'failed', id: envelope.id, error: error.message };
          }
          return { status: 'retry', id: envelope.id };
        }
      })
    );

    return results;
  }

  /**
   * Resolve a conflict by either retrying or discarding
   * @param {string} id The ID of the conflict
   * @param {string} action Either 'retry' or 'discard'
   * @returns {Promise<Object>} Result of the resolution
   */
  async resolveConflict(id, action) {
    await this.ready;
    
    const conflict = await this.getData('conflicts', id);
    if (!conflict) {
      return { status: 'error', message: 'Conflict not found' };
    }
    
    if (action === 'retry') {
      // Move back to pending invoices
      conflict.attempts = 0;
      conflict.status = 'pending';
      await this.saveData('pendingInvoices', conflict);
      await this.deleteData('conflicts', id);
      await this.triggerSync();
      return { status: 'retrying', id };
    } else if (action === 'discard') {
      // Delete the conflict
      await this.deleteData('conflicts', id);
      return { status: 'discarded', id };
    }
    
    return { status: 'error', message: 'Invalid action' };
  }

  /**
   * Check if required offline data is available
   * @returns {Promise<Object>} Status of offline data availability
   */
  async checkOfflineDataAvailability() {
    await this.ready;
    
    const items = await this.getAllData('items');
    const customers = await this.getAllData('customers');
    const posProfile = await this.getAllData('posProfile');
    
    return {
      itemsAvailable: items && items.length > 0,
      customersAvailable: customers && customers.length > 0,
      posProfileAvailable: posProfile && posProfile.length > 0,
      offlineReady: 
        (items && items.length > 0) && 
        (customers && customers.length > 0) && 
        (posProfile && posProfile.length > 0)
    };
  }

  /**
   * Manual sync trigger for browsers without Background Sync
   * @returns {Promise} Promise that resolves when sync completes
   */
  async manualSync() {
    return this.processPendingInvoices();
  }

  /**
   * Destroy the database connection
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