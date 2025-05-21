/**
 * Simple IndexedDB wrapper for offline storage
 */
export default class OfflineStorage {
  constructor(dbName = 'posAwesomeDB', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  /**
   * Initialize the database
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
          db.createObjectStore('items', { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains('customers')) {
          db.createObjectStore('customers', { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains('pendingInvoices')) {
          db.createObjectStore('pendingInvoices', { keyPath: 'id', autoIncrement: true });
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
   * Queue a pending invoice for later submission
   * @param {Object} invoice The invoice data to queue
   * @returns {Promise} Promise that resolves with the ID of the queued invoice
   */
  queuePendingInvoice(invoice) {
    const now = new Date();
    const invoiceWithMeta = {
      ...invoice,
      timestamp: now.toISOString(),
      status: 'pending'
    };
    
    return this.saveData('pendingInvoices', invoiceWithMeta);
  }

  /**
   * Get all pending invoices
   * @returns {Promise} Promise that resolves with all pending invoices
   */
  getPendingInvoices() {
    return this.getAllData('pendingInvoices');
  }
} 