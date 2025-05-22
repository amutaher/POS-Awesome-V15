/**
 * Enhanced IndexedDB wrapper for offline storage in POS Awesome
 */
export default class OfflineStorage {
  constructor(dbName = 'posAwesomeDB', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.isOnline = navigator.onLine;
    
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
          const store = db.createObjectStore('pendingInvoices', { keyPath: 'local_id', autoIncrement: true });
          store.createIndex('status', 'status', { unique: false });
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
  saveData(storeName, data) {
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
  saveMultipleData(storeName, items) {
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
  getData(storeName, id) {
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
  getAllData(storeName) {
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
  getDataByIndex(storeName, indexName, value) {
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
  deleteData(storeName, id) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data from the specified object store
   * @param {string} storeName The name of the object store
   * @returns {Promise} Promise that resolves when the store is cleared
   */
  clearStore(storeName) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Queue an invoice for submission when back online
   * @param {Object} invoice The invoice to queue
   * @returns {Promise} Promise that resolves when invoice is queued
   */
  queuePendingInvoice(invoice) {
    const now = new Date();
    
    // Make a safe copy of the invoice data by removing non-serializable objects
    // and ensuring arrays are properly converted
    const preprocessInvoice = (obj) => {
      // If null or primitive type, return as is
      if (obj === null || typeof obj !== 'object') {
        return obj;
      }
      
      // Handle arrays by making a serializable copy
      if (Array.isArray(obj)) {
        return obj.map(item => preprocessInvoice(item));
      }
      
      // For objects, create a clean copy
      const cleanObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          // Skip functions, DOM nodes and other non-serializable elements
          if (typeof obj[key] === 'function' || 
              obj[key] instanceof Node ||
              key === '__ob__' ||  // Skip Vue observers
              key === '_data') {   // Skip Vue internal data
            continue;
          }
          
          // Handle nested objects/arrays
          cleanObj[key] = preprocessInvoice(obj[key]);
        }
      }
      return cleanObj;
    };

    // Process the invoice to make it serializable
    let safeInvoice;
    try {
      if (invoice.invoice_data) {
        // If invoice_data already exists, we need to preprocess it
        safeInvoice = {
          ...invoice,
          invoice_data: preprocessInvoice(invoice.invoice_data)
        };
      } else {
        // If invoice is the direct data, preprocess it
        safeInvoice = {
          invoice_data: preprocessInvoice(invoice),
          local_id: invoice.local_id || ('local_' + now.getTime())
        };
      }
      
      // Add metadata
      const invoiceWithMeta = {
        ...safeInvoice,
        timestamp: now.toISOString(),
        status: 'pending',
        sync_attempts: 0
      };
      
      return this.saveData('pendingInvoices', invoiceWithMeta);
    } catch (error) {
      console.error('Error preprocessing invoice for offline storage:', error);
      throw new Error('Failed to prepare invoice for offline storage: ' + error.message);
    }
  }

  /**
   * Get all pending invoices
   * @returns {Promise} Promise that resolves with all pending invoices
   */
  getPendingInvoices() {
    return this.getDataByIndex('pendingInvoices', 'status', 'pending');
  }
  
  /**
   * Cache POS profile for offline use
   * @param {Object} profile POS profile data
   * @returns {Promise} Promise that resolves when profile is cached
   */
  cachePosProfile(profile) {
    return this.saveData('posProfile', profile);
  }
  
  /**
   * Cache items for offline use
   * @param {Array} items Array of items 
   * @returns {Promise} Promise that resolves when items are cached
   */
  cacheItems(items) {
    return this.saveMultipleData('items', items);
  }
  
  /**
   * Cache customers for offline use
   * @param {Array} customers Array of customers
   * @returns {Promise} Promise that resolves when customers are cached
   */
  cacheCustomers(customers) {
    return this.saveMultipleData('customers', customers);
  }
  
  /**
   * Save completed invoice
   * @param {Object} invoice Invoice data
   * @returns {Promise} Promise that resolves when invoice is saved
   */
  saveInvoice(invoice) {
    return this.saveData('invoices', invoice);
  }
  
  /**
   * Trigger sync of pending data
   */
  triggerSync() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(registration => {
        return registration.sync.register('sync-pending-invoices');
      }).catch(err => {
        console.error('Error registering sync:', err);
        // Fallback for browsers that don't support Background Sync
        this.processPendingInvoices();
      });
    } else {
      // Fallback if service worker is not available
      this.processPendingInvoices();
    }
  }
  
  /**
   * Process pending invoices and submit to server
   */
  async processPendingInvoices() {
    if (!this.isOnline) {
      console.log('Cannot process pending invoices while offline');
      return;
    }
    
    try {
      const pendingInvoices = await this.getPendingInvoices();
      
      if (!pendingInvoices || pendingInvoices.length === 0) {
        console.log('No pending invoices to sync');
        return;
      }
      
      console.log(`Processing ${pendingInvoices.length} pending invoices`);
      
      for (const invoice of pendingInvoices) {
        try {
          // Update sync attempt count
          invoice.sync_attempts += 1;
          await this.saveData('pendingInvoices', invoice);
          
          // Make sure invoice data is properly formatted 
          let invoiceData = invoice.invoice_data;
          
          // Ensure pos_profile is properly formatted as JSON
          if (invoiceData.pos_profile && typeof invoiceData.pos_profile === 'string') {
            try {
              // Try parsing it first to see if it's already JSON
              JSON.parse(invoiceData.pos_profile);
            } catch (e) {
              // If it fails to parse, it's a string that needs to be JSON
              const profileObj = { name: invoiceData.pos_profile };
              invoiceData.pos_profile = JSON.stringify(profileObj);
              console.log('Fixed pos_profile format for sync');
            }
          }
          
          // Submit invoice to server using frappe.call
          const result = await frappe.call({
            method: 'posawesome.posawesome.api.posapp.submit_invoice',
            args: { invoice: invoiceData },
            freeze: false
          });
          
          if (result.message && result.message.name) {
            console.log(`Invoice ${result.message.name} synced successfully`);
            
            // Save the submitted invoice to the invoices store
            await this.saveInvoice({
              ...invoice.invoice_data,
              name: result.message.name,
              sync_status: 'synced'
            });
            
            // Remove from pending queue
            await this.deleteData('pendingInvoices', invoice.local_id);
          } else {
            console.error('Error syncing invoice:', result);
            invoice.status = invoice.sync_attempts >= 3 ? 'failed' : 'pending';
            invoice.error = JSON.stringify(result);
            await this.saveData('pendingInvoices', invoice);
          }
        } catch (error) {
          console.error('Error processing invoice:', error);
          invoice.status = invoice.sync_attempts >= 3 ? 'failed' : 'pending';
          invoice.error = error.message || 'Unknown error';
          await this.saveData('pendingInvoices', invoice);
        }
      }
      
      // Notify app that syncing is complete
      window.dispatchEvent(new CustomEvent('pos-awesome-sync-complete'));
    } catch (error) {
      console.error('Error in processPendingInvoices:', error);
    }
  }
  
  /**
   * Check if data is available offline
   * @returns {Promise<Object>} Object with availability status
   */
  async checkOfflineDataAvailability() {
    try {
      const items = await this.getAllData('items');
      const customers = await this.getAllData('customers');
      const posProfile = await this.getAllData('posProfile');
      
      return {
        itemsAvailable: items && items.length > 0,
        customersAvailable: customers && customers.length > 0,
        posProfileAvailable: posProfile && posProfile.length > 0,
        isReady: items && items.length > 0 && 
                customers && customers.length > 0 && 
                posProfile && posProfile.length > 0
      };
    } catch (error) {
      console.error('Error checking offline data availability:', error);
      return {
        itemsAvailable: false,
        customersAvailable: false,
        posProfileAvailable: false,
        isReady: false,
        error: error.message
      };
    }
  }
  
  /**
   * Clean up resources and event listeners
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

  /**
   * Cache sales persons data for offline use
   * @param {Array} salesPersons Array of sales persons objects
   * @returns {Promise} Promise that resolves when caching is complete
   */
  cacheSalesPersons(salesPersons) {
    if (!Array.isArray(salesPersons) || salesPersons.length === 0) {
      return Promise.resolve(false);
    }
    
    return this.saveMultipleData('salesPersons', salesPersons)
      .then(() => {
        console.log(`[OfflineStorage] Cached ${salesPersons.length} sales persons for offline use`);
        return true;
      })
      .catch(error => {
        console.error('[OfflineStorage] Error caching sales persons:', error);
        throw error;
      });
  }
} 