/**
 * Enhanced IndexedDB wrapper for offline storage in POS Awesome
 * Includes robust migration system for schema updates
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

// Current database version - increment this when schema changes
const CURRENT_DB_VERSION = 2;

// Migration registry - defines schema changes between versions
const migrations = {
  1: {
    // Initial schema
    description: 'Initial schema',
    upgrade: (db) => {
      // Create object stores for version 1
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
    }
  },
  2: {
    // Version 2 adds taxes store and migration metadata store
    description: 'Add taxes store and migration metadata',
    upgrade: (db, transaction) => {
      // Add taxes store
      if (!db.objectStoreNames.contains('taxes')) {
        db.createObjectStore('taxes', { keyPath: 'name' });
      }
      
      // Add migration metadata store to track migration history
      if (!db.objectStoreNames.contains('migrationMeta')) {
        const metaStore = db.createObjectStore('migrationMeta', { keyPath: 'version' });
        // Store migration record
        const migrationRecord = {
          version: 2,
          timestamp: new Date().toISOString(),
          description: 'Added taxes store and migration metadata'
        };
        metaStore.add(migrationRecord);
      }
      
      // Update settings store (example of modifying existing data during migration)
      const settingsStore = transaction.objectStore('settings');
      settingsStore.put({
        key: 'dbMigrationHistory',
        value: [{
          version: 2,
          timestamp: new Date().toISOString(),
          description: 'Added taxes store and migration metadata'
        }]
      });
    }
  }
  // Add future migrations here as needed
  // 3: { description: '...', upgrade: (db, transaction) => { ... } }
};

export default class OfflineStorage {
  constructor(dbName = 'posAwesomeDB') {
    this.dbName = dbName;
    this.db = null;
    this.isOnline = navigator.onLine;
    this.migrationErrors = [];
    this.migrationWarnings = [];
    this.migrationInProgress = false;
    
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
        console.error("[OfflineStorage] Your browser doesn't support IndexedDB");
        this.showMigrationError("Your browser doesn't support IndexedDB. Offline features will not be available.");
        reject("IndexedDB not supported");
        return;
      }

      // Try to open the database with the current version
      const request = window.indexedDB.open(this.dbName, CURRENT_DB_VERSION);

      request.onerror = (event) => {
        console.error('[OfflineStorage] IndexedDB error:', event.target.error);
        
        // Check for version incompatibility error (common during version upgrades)
        if (event.target.error.name === 'VersionError') {
          this.handleVersionError()
            .then(resolve)
            .catch(reject);
        } else {
          // Handle other errors
          this.showMigrationError(`IndexedDB error: ${event.target.error.message}`);
          reject(event.target.error);
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        
        // Verify successful migration if it occurred
        if (this.migrationInProgress) {
          this.verifyMigration()
            .then(() => {
              console.log('[OfflineStorage] IndexedDB initialized successfully after migration');
              this.migrationInProgress = false;
              resolve(this.db);
            })
            .catch(error => {
              console.error('[OfflineStorage] Migration verification failed:', error);
              this.showMigrationError('Migration verification failed: ' + error.message);
              this.migrationInProgress = false;
              reject(error);
            });
        } else {
          console.log('[OfflineStorage] IndexedDB initialized successfully');
          resolve(this.db);
        }
        
        // Set up error handler for any future errors
        this.db.onerror = (event) => {
          console.error('[OfflineStorage] Database error:', event.target.error);
          this.showMigrationWarning(`Database operation failed: ${event.target.error.message}`);
        };
      };

      request.onupgradeneeded = (event) => {
        console.log(`[OfflineStorage] Database upgrade needed: ${event.oldVersion} to ${event.newVersion}`);
        this.migrationInProgress = true;
        
        const db = event.target.result;
        const transaction = event.target.transaction;
        
        try {
          // Apply all required migrations in sequence
          this.applyMigrations(db, transaction, event.oldVersion, event.newVersion);
          
          // Store migration metadata
          this.storeMigrationMetadata(db, transaction, event.oldVersion, event.newVersion);
          
          console.log('[OfflineStorage] Schema upgrade completed successfully');
        } catch (error) {
          console.error('[OfflineStorage] Error during schema upgrade:', error);
          this.migrationErrors.push(error.message || 'Unknown migration error');
          
          // We can't reject here because onupgradeneeded must complete
          // The error will be handled in onsuccess or onerror
        }
      };
      
      request.onblocked = (event) => {
        console.warn('[OfflineStorage] Database upgrade blocked. Please close other tabs using the application.');
        this.showMigrationWarning('Database upgrade blocked. Please close other tabs using this application and reload.');
      };
    });
  }
  
  /**
   * Apply migrations in sequence
   */
  applyMigrations(db, transaction, oldVersion, newVersion) {
    // Loop through all versions that need migration
    for (let version = oldVersion + 1; version <= newVersion; version++) {
      if (migrations[version]) {
        console.log(`[OfflineStorage] Applying migration to version ${version}: ${migrations[version].description}`);
        try {
          // Execute the migration upgrade function
          migrations[version].upgrade(db, transaction);
          
          // Log successful migration
          console.log(`[OfflineStorage] Migration to version ${version} applied successfully`);
        } catch (error) {
          console.error(`[OfflineStorage] Error applying migration to version ${version}:`, error);
          this.migrationErrors.push(`Migration to version ${version} failed: ${error.message}`);
          throw error; // Re-throw to abort the upgrade
        }
      } else {
        console.warn(`[OfflineStorage] No migration defined for version ${version}`);
        this.migrationWarnings.push(`No migration defined for version ${version}`);
      }
    }
  }
  
  /**
   * Store migration metadata for tracking
   */
  storeMigrationMetadata(db, transaction, oldVersion, newVersion) {
    try {
      // Get the migration metadata store if it exists
      if (db.objectStoreNames.contains('migrationMeta')) {
        const metaStore = transaction.objectStore('migrationMeta');
        
        // Add a record of this migration
        const migrationRecord = {
          version: newVersion,
          previousVersion: oldVersion,
          timestamp: new Date().toISOString(),
          warnings: this.migrationWarnings.length > 0 ? this.migrationWarnings : undefined
        };
        
        metaStore.add(migrationRecord);
      }
    } catch (error) {
      console.warn('[OfflineStorage] Failed to store migration metadata:', error);
      // This is non-critical, so we just log it
    }
  }
  
  /**
   * Handle version error by deleting and recreating the database
   * This is a last resort for irrecoverable version conflicts
   */
  async handleVersionError() {
    console.warn('[OfflineStorage] Version error detected. Attempting recovery...');
    this.showMigrationWarning('Database version conflict detected. Attempting recovery...');
    
    // Check if we have important pending data before proceeding
    const pendingData = await this.checkPendingData()
      .catch(error => {
        console.error('[OfflineStorage] Error checking pending data:', error);
        return { hasPendingInvoices: false };
      });
    
    if (pendingData.hasPendingInvoices) {
      // If there are pending invoices, we should NOT delete the database
      const error = new Error('Cannot upgrade database because there are unsynchronized invoices. Please sync your data first.');
      this.showMigrationError(error.message);
      throw error;
    }
    
    // If no critical data, attempt to delete and recreate the database
    return new Promise((resolve, reject) => {
      this.db = null;
      
      const deleteRequest = indexedDB.deleteDatabase(this.dbName);
      
      deleteRequest.onerror = (event) => {
        console.error('[OfflineStorage] Failed to delete database:', event.target.error);
        this.showMigrationError('Failed to recover from version conflict. Please clear your browser data and reload.');
        reject(event.target.error);
      };
      
      deleteRequest.onsuccess = (event) => {
        console.log('[OfflineStorage] Database deleted successfully. Recreating...');
        this.showMigrationWarning('Database reset due to version conflict. Your offline data will need to be reloaded.');
        
        // Recreate the database with the current version
        const reopenRequest = indexedDB.open(this.dbName, CURRENT_DB_VERSION);
        
        reopenRequest.onerror = (event) => {
          console.error('[OfflineStorage] Failed to recreate database:', event.target.error);
          this.showMigrationError('Failed to recreate database after reset. Please reload the application.');
          reject(event.target.error);
        };
        
        reopenRequest.onsuccess = (event) => {
          this.db = event.target.result;
          console.log('[OfflineStorage] Database recreated successfully');
          resolve(this.db);
        };
        
        reopenRequest.onupgradeneeded = (event) => {
          console.log('[OfflineStorage] Recreating database schema');
          const db = event.target.result;
          const transaction = event.target.transaction;
          
          // Apply the migrations from scratch
          this.applyMigrations(db, transaction, 0, CURRENT_DB_VERSION);
        };
      };
      
      deleteRequest.onblocked = (event) => {
        console.warn('[OfflineStorage] Database deletion blocked. Please close other tabs using the application.');
        this.showMigrationWarning('Database recovery blocked. Please close other tabs using this application and reload.');
      };
    });
  }
  
  /**
   * Check for pending data that shouldn't be lost during migration
   */
  async checkPendingData() {
    try {
      // Try to open the database in readonly mode to check data
      const request = indexedDB.open(this.dbName);
      
      return new Promise((resolve, reject) => {
        request.onerror = (event) => {
          console.error('[OfflineStorage] Error opening database to check pending data:', event.target.error);
          reject(event.target.error);
        };
        
        request.onsuccess = (event) => {
          const db = event.target.result;
          
          // Check if the stores we need to examine exist
          if (!db.objectStoreNames.contains('pendingInvoices')) {
            db.close();
            resolve({ hasPendingInvoices: false });
            return;
          }
          
          // Check for pending invoices
          const transaction = db.transaction(['pendingInvoices'], 'readonly');
          const store = transaction.objectStore('pendingInvoices');
          const countRequest = store.count();
          
          countRequest.onsuccess = () => {
            const hasPendingInvoices = countRequest.result > 0;
            db.close();
            resolve({ hasPendingInvoices });
          };
          
          countRequest.onerror = (event) => {
            console.error('[OfflineStorage] Error counting pending invoices:', event.target.error);
            db.close();
            reject(event.target.error);
          };
        };
      });
    } catch (error) {
      console.error('[OfflineStorage] Error checking pending data:', error);
      return { hasPendingInvoices: false }; // Assume no pending data in case of error
    }
  }
  
  /**
   * Verify migration was successful
   */
  async verifyMigration() {
    try {
      // Check for any migration errors
      if (this.migrationErrors.length > 0) {
        throw new Error(`Migration errors occurred: ${this.migrationErrors.join(', ')}`);
      }
      
      // Verify all required object stores exist
      const requiredStores = ['items', 'customers', 'pendingInvoices', 'conflicts', 'invoices', 'posProfile', 'settings', 'taxes', 'migrationMeta'];
      
      for (const storeName of requiredStores) {
        if (!this.db.objectStoreNames.contains(storeName)) {
          throw new Error(`Required object store '${storeName}' is missing after migration`);
        }
      }
      
      // Display any warnings
      if (this.migrationWarnings.length > 0) {
        this.showMigrationWarning(`Migration completed with warnings: ${this.migrationWarnings.join(', ')}`);
      }
      
      return true;
    } catch (error) {
      console.error('[OfflineStorage] Migration verification failed:', error);
      this.showMigrationError(`Migration verification failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Display migration error to user
   */
  showMigrationError(message) {
    // Store error in errors array
    this.migrationErrors.push(message);
    
    // Log error to console
    console.error('[OfflineStorage] Migration error:', message);
    
    // Dispatch event for UI to handle
    window.dispatchEvent(new CustomEvent('pos-awesome-db-error', { 
      detail: { message, type: 'error' }
    }));
    
    // If frappe is available, show a warning message
    if (window.frappe && frappe.show_alert) {
      frappe.show_alert({
        message: `Database error: ${message}`,
        indicator: 'red'
      }, 15);
    }
  }
  
  /**
   * Display migration warning to user
   */
  showMigrationWarning(message) {
    // Store warning in warnings array
    this.migrationWarnings.push(message);
    
    // Log warning to console
    console.warn('[OfflineStorage] Migration warning:', message);
    
    // Dispatch event for UI to handle
    window.dispatchEvent(new CustomEvent('pos-awesome-db-warning', { 
      detail: { message, type: 'warning' }
    }));
    
    // If frappe is available, show a warning message
    if (window.frappe && frappe.show_alert) {
      frappe.show_alert({
        message: `Database warning: ${message}`,
        indicator: 'yellow'
      }, 7);
    }
  }

  /**
   * Get migration status information
   * @returns {Object} Migration status
   */
  getMigrationStatus() {
    return {
      errors: this.migrationErrors,
      warnings: this.migrationWarnings,
      inProgress: this.migrationInProgress,
      currentVersion: CURRENT_DB_VERSION
    };
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
      try {
        if (!this.db) {
          throw new Error('Database not initialized');
        }
        
        if (!this.db.objectStoreNames.contains(storeName)) {
          throw new Error(`Object store '${storeName}' does not exist`);
        }
        
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        // Add metadata to track when this record was last modified
        if (typeof data === 'object' && data !== null) {
          data._lastModified = new Date().toISOString();
        }
        
        const request = store.put(data);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          console.error(`[OfflineStorage] Error saving data to '${storeName}':`, request.error);
          reject(request.error);
        };
        
        transaction.oncomplete = () => {
          // Dispatch event to notify of data change
          window.dispatchEvent(new CustomEvent('pos-awesome-data-changed', { 
            detail: { store: storeName, operation: 'save', data }
          }));
        };
      } catch (error) {
        console.error(`[OfflineStorage] Error in saveData for '${storeName}':`, error);
        reject(error);
      }
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
    
    if (!items || items.length === 0) {
      return Promise.resolve([]);
    }
    
    return new Promise((resolve, reject) => {
      try {
        if (!this.db) {
          throw new Error('Database not initialized');
        }
        
        if (!this.db.objectStoreNames.contains(storeName)) {
          throw new Error(`Object store '${storeName}' does not exist`);
        }
        
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        let completed = 0;
        let successful = 0;
        const errors = [];
        const results = [];
        const now = new Date().toISOString();

        items.forEach(item => {
          // Add metadata to track when this record was last modified
          if (typeof item === 'object' && item !== null) {
            item._lastModified = now;
          }
          
          const request = store.put(item);
          
          request.onsuccess = () => {
            completed++;
            successful++;
            results.push({ success: true, key: request.result });
            
            if (completed === items.length) {
              finishTransaction();
            }
          };
          
          request.onerror = (event) => {
            console.error(`[OfflineStorage] Error saving item in '${storeName}':`, request.error);
            completed++;
            errors.push({ 
              error: request.error,
              item
            });
            results.push({ success: false, error: request.error, item });
            
            // Prevent the error from aborting the transaction
            event.preventDefault();
            
            if (completed === items.length) {
              finishTransaction();
            }
          };
        });
        
        transaction.onerror = (event) => {
          console.error(`[OfflineStorage] Transaction error in saveMultipleData for '${storeName}':`, event.target.error);
        };
        
        const finishTransaction = () => {
          if (errors.length > 0) {
            // If some items failed but others succeeded
            if (successful > 0) {
              this.showMigrationWarning(`${successful} items saved successfully, but ${errors.length} items failed to save.`);
              resolve(results);
            } else {
              // If all items failed
              reject(errors);
            }
          } else {
            // All items succeeded
            resolve(results);
          }
          
          // Dispatch event to notify of data change
          window.dispatchEvent(new CustomEvent('pos-awesome-data-changed', { 
            detail: { store: storeName, operation: 'saveMultiple', count: successful }
          }));
        };
      } catch (error) {
        console.error(`[OfflineStorage] Error in saveMultipleData for '${storeName}':`, error);
        reject(error);
      }
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
  
  /**
   * Reset the database to its initial state
   * @returns {Promise} Promise that resolves when database is reset
   */
  async resetDatabase() {
    console.log('[OfflineStorage] Resetting database to initial state');
    
    // First check for pending data
    const pendingData = await this.checkPendingData()
      .catch(error => {
        console.error('[OfflineStorage] Error checking pending data:', error);
        return { hasPendingInvoices: false };
      });
    
    if (pendingData.hasPendingInvoices) {
      const error = new Error('Cannot reset database with unsynchronized invoices. Please sync your data first.');
      this.showMigrationError(error.message);
      throw error;
    }
    
    // Close the database connection first
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    
    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(this.dbName);
      
      deleteRequest.onerror = (event) => {
        const error = new Error(`Failed to delete database: ${event.target.error.message}`);
        this.showMigrationError(error.message);
        reject(error);
      };
      
      deleteRequest.onsuccess = (event) => {
        console.log('[OfflineStorage] Database deleted successfully');
        
        // Reinitialize the database with the current version
        this.ready = this.init();
        
        this.ready
          .then(() => {
            console.log('[OfflineStorage] Database reinitialized');
            localStorage.removeItem('posa_bootstrap_completed');
            this.showMigrationWarning('Database has been reset. You will need to reload all offline data.');
            resolve(true);
          })
          .catch(error => {
            this.showMigrationError(`Failed to reinitialize database: ${error.message}`);
            reject(error);
          });
      };
      
      deleteRequest.onblocked = (event) => {
        const error = new Error('Database deletion blocked. Please close other tabs and try again.');
        this.showMigrationWarning(error.message);
        reject(error);
      };
    });
  }
  
  /**
   * Handle a database upgrade request
   * @param {number} version The version to upgrade to
   * @returns {Promise} Promise that resolves when upgrade is complete
   */
  async handleUpgrade(version) {
    console.log(`[OfflineStorage] Handling upgrade request to version ${version}`);
    
    if (version <= CURRENT_DB_VERSION) {
      // This is unnecessary, we're already at this version or higher
      this.showMigrationWarning(`Database is already at version ${CURRENT_DB_VERSION}, no upgrade needed`);
      return true;
    }
    
    // Check for pending data that would be lost
    const pendingData = await this.checkPendingData()
      .catch(error => {
        console.error('[OfflineStorage] Error checking pending data:', error);
        return { hasPendingInvoices: false };
      });
    
    if (pendingData.hasPendingInvoices) {
      const error = new Error('Cannot upgrade database with unsynchronized invoices. Please sync your data first.');
      this.showMigrationError(error.message);
      throw error;
    }
    
    // We can't actually upgrade beyond CURRENT_DB_VERSION, so we should
    // create a backup and then reset and reinitialize
    
    // 1. Backup important data
    const backup = await this.backupData()
      .catch(error => {
        console.error('[OfflineStorage] Error backing up data:', error);
        this.showMigrationError(`Failed to backup data: ${error.message}`);
        throw error;
      });
    
    // 2. Reset the database
    await this.resetDatabase()
      .catch(error => {
        console.error('[OfflineStorage] Error resetting database:', error);
        this.showMigrationError(`Failed to reset database: ${error.message}`);
        throw error;
      });
    
    // 3. Restore the data that is compatible with the new schema
    await this.restoreData(backup)
      .catch(error => {
        console.error('[OfflineStorage] Error restoring data:', error);
        this.showMigrationWarning(`Some data could not be restored: ${error.message}`);
        // Continue anyway - we've done our best
      });
    
    return true;
  }
  
  /**
   * Back up important data that should be preserved during migration
   * @returns {Promise<Object>} Promise resolving to backup data
   */
  async backupData() {
    await this.ready;
    
    try {
      console.log('[OfflineStorage] Backing up data for migration');
      
      // Collect data that should be preserved
      const posProfiles = await this.getAllData('posProfile')
        .catch(error => {
          console.warn('[OfflineStorage] Error backing up posProfiles:', error);
          return [];
        });
      
      const settings = await this.getAllData('settings')
        .catch(error => {
          console.warn('[OfflineStorage] Error backing up settings:', error);
          return [];
        });
      
      const invoices = await this.getAllData('invoices')
        .catch(error => {
          console.warn('[OfflineStorage] Error backing up invoices:', error);
          return [];
        });
      
      // Return the backup object
      return {
        timestamp: new Date().toISOString(),
        posProfiles,
        settings,
        invoices
      };
    } catch (error) {
      console.error('[OfflineStorage] Error creating backup:', error);
      throw error;
    }
  }
  
  /**
   * Restore data from a backup
   * @param {Object} backup The backup data
   * @returns {Promise} Promise that resolves when data is restored
   */
  async restoreData(backup) {
    await this.ready;
    
    if (!backup) {
      console.warn('[OfflineStorage] No backup data provided for restore');
      return;
    }
    
    console.log('[OfflineStorage] Restoring data from backup');
    
    // Track restore results
    const results = {
      successful: [],
      failed: []
    };
    
    // Restore POS profiles
    if (backup.posProfiles && backup.posProfiles.length > 0) {
      try {
        await this.saveMultipleData('posProfile', backup.posProfiles);
        results.successful.push('posProfiles');
      } catch (error) {
        console.error('[OfflineStorage] Error restoring posProfiles:', error);
        results.failed.push('posProfiles');
      }
    }
    
    // Restore settings (excluding migration-specific settings)
    if (backup.settings && backup.settings.length > 0) {
      try {
        // Filter out migration-specific settings
        const filteredSettings = backup.settings.filter(
          setting => setting.key !== 'dbMigrationHistory' && 
                    setting.key !== 'bootstrapCompleted'
        );
        
        await this.saveMultipleData('settings', filteredSettings);
        results.successful.push('settings');
      } catch (error) {
        console.error('[OfflineStorage] Error restoring settings:', error);
        results.failed.push('settings');
      }
    }
    
    // Restore invoices
    if (backup.invoices && backup.invoices.length > 0) {
      try {
        await this.saveMultipleData('invoices', backup.invoices);
        results.successful.push('invoices');
      } catch (error) {
        console.error('[OfflineStorage] Error restoring invoices:', error);
        results.failed.push('invoices');
      }
    }
    
    // Log the restore results
    console.log('[OfflineStorage] Data restore results:', results);
    
    if (results.failed.length > 0) {
      this.showMigrationWarning(`Some data could not be restored: ${results.failed.join(', ')}`);
    }
    
    if (results.successful.length > 0) {
      this.showMigrationWarning(`Successfully restored: ${results.successful.join(', ')}`);
    }
    
    return results;
  }
} 