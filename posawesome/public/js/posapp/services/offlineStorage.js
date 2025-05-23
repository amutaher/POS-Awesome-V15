/**
 * Enhanced IndexedDB wrapper for offline storage in POS Awesome
 * Includes robust migration system for schema updates
 */
// Remove external uuid dependency
// import { v4 as uuidv4 } from 'uuid';

// Enhanced UUID generator with timestamp and device fingerprint
function generateUUID() {
  // Get timestamp in milliseconds and convert to hex
  const timestamp = new Date().getTime().toString(16).padStart(12, '0');
  
  // Create device fingerprint based on available browser data
  let deviceData = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset()
  ].join('');
  
  // Generate a hash from the device data
  let deviceHash = 0;
  for (let i = 0; i < deviceData.length; i++) {
    deviceHash = ((deviceHash << 5) - deviceHash) + deviceData.charCodeAt(i);
    deviceHash = deviceHash & deviceHash; // Convert to 32bit integer
  }
  deviceHash = Math.abs(deviceHash).toString(16).slice(0, 8);
  
  // Random component (8 chars)
  const randomPart = Math.random().toString(16).slice(2, 10);
  
  // Combine all parts: timestamp-devicehash-random
  return `${timestamp}-${deviceHash}-${randomPart}`;
}

// Get a persisted device ID that stays consistent across sessions
async function getDeviceId() {
  const DB_NAME = 'posAwesomeDeviceId';
  const STORE_NAME = 'deviceId';
  const KEY = 'deviceIdKey';
  
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore(STORE_NAME);
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // Try to get existing ID
      const getRequest = store.get(KEY);
      
      getRequest.onsuccess = () => {
        if (getRequest.result) {
          // Return existing ID
          resolve(getRequest.result);
        } else {
          // Create new ID if none exists
          const newId = generateUUID();
          store.put(newId, KEY);
          resolve(newId);
        }
      };
      
      getRequest.onerror = () => {
        // Fallback to generating a new ID if there's an error
        resolve(generateUUID());
      };
    };
    
    request.onerror = () => {
      // Fallback to generating a new ID if DB access fails
      resolve(generateUUID());
    };
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
    this.networkEventListeners = [];
    this.lastOnlineCheckTime = 0;
    this.networkCheckInterval = null;
    this.migrationErrors = [];
    this.migrationWarnings = [];
    this.migrationInProgress = false;
    
    // Setup the ready promise that can be awaited by the app
    this.ready = this.init();
    
    // Setup all network status event listeners
    this.setupNetworkListeners();
    
    // Set up network status polling as fallback
    this.startNetworkStatusPolling();
    
    // Listen for sync messages from service worker
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));
    }
  }

  /**
   * Setup all network-related event listeners
   */
  setupNetworkListeners() {
    // Standard network events
    const onlineHandler = this.handleNetworkChange.bind(this, true);
    const offlineHandler = this.handleNetworkChange.bind(this, false);
    
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    
    // Store event listeners for cleanup
    this.networkEventListeners.push(
      { event: 'online', handler: onlineHandler },
      { event: 'offline', handler: offlineHandler }
    );
    
    // Additional events that might signal connection changes
    if (navigator.connection) {
      const connectionChangeHandler = this.handleConnectionChange.bind(this);
      navigator.connection.addEventListener('change', connectionChangeHandler);
      this.networkEventListeners.push(
        { event: 'change', target: navigator.connection, handler: connectionChangeHandler }
      );
    }
    
    // Handle visibility change which might affect connection state
    const visibilityChangeHandler = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', visibilityChangeHandler);
    this.networkEventListeners.push(
      { event: 'visibilitychange', target: document, handler: visibilityChangeHandler }
    );
  }
  
  /**
   * Start polling network status as a fallback mechanism
   */
  startNetworkStatusPolling() {
    // Clear any existing interval
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
    }
    
    // Check network status every 30 seconds
    this.networkCheckInterval = setInterval(() => {
      this.checkNetworkStatus();
    }, 30000); // 30 seconds
  }
  
  /**
   * Check current network status and dispatch events if needed
   */
  checkNetworkStatus() {
    const isCurrentlyOnline = navigator.onLine;
    const now = Date.now();
    
    // Only update if it's been more than 5 seconds since last check
    if (now - this.lastOnlineCheckTime > 5000) {
      this.lastOnlineCheckTime = now;
      
      // If online, try to actually check connectivity by making a tiny request
      if (isCurrentlyOnline) {
        this.testActualConnectivity()
          .then(isReallyConnected => {
            if (!isReallyConnected) {
              console.log('[OfflineStorage] Navigator reports online but no actual connectivity');
              // If we can't reach the server, treat as offline even if navigator says online
              this.handleNetworkChange(false);
            }
          })
          .catch(err => {
            console.warn('[OfflineStorage] Error checking connectivity:', err);
          });
      }
    }
  }
  
  /**
   * Test actual server connectivity beyond just navigator.onLine
   * Makes a minimal request to server to verify true connectivity
   * @returns {Promise<boolean>} True if server is reachable
   */
  async testActualConnectivity() {
    try {
      // Try to fetch a small resource from the server with cache busting
      const cacheBuster = Date.now();
      const response = await fetch(`/api/method/ping?_=${cacheBuster}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        // Short timeout to avoid waiting too long
        signal: AbortSignal.timeout(3000)
      });
      
      return response.ok;
    } catch (error) {
      console.warn('[OfflineStorage] Connectivity test failed:', error);
      return false;
    }
  }

  /**
   * Handle network status changes
   * @param {boolean} isOnline Whether the network is now online
   */
  handleNetworkChange(isOnline) {
    // Always double-check with navigator.onLine
    const actuallyOnline = isOnline && navigator.onLine;
    
    console.log(`[OfflineStorage] Network status change: ${actuallyOnline ? 'Online' : 'Offline'}`);
    this.lastOnlineCheckTime = Date.now();
    
    // Dispatch an event for other components to react to
    window.dispatchEvent(new CustomEvent('pos-awesome-network-change', { 
      detail: { 
        isOnline: actuallyOnline,
        timestamp: this.lastOnlineCheckTime
      } 
    }));
    
    // If we're online, attempt to sync
    if (actuallyOnline) {
      console.log('[OfflineStorage] Back online, attempting to sync data');
      this.triggerSync();
    } else {
      console.log('[OfflineStorage] Device is offline, data will be stored locally');
    }
  }
  
  /**
   * Handle network connection changes (if navigator.connection is available)
   */
  handleConnectionChange() {
    if (!navigator.connection) return;
    
    // Check if we have a connection and its properties have changed
    const connType = navigator.connection.type;
    const isConnected = connType !== 'none' && navigator.onLine;
    
    console.log(`[OfflineStorage] Connection change detected: ${connType}, Online: ${isConnected}`);
    
    // The effective type gives a better indication of connection quality
    const effectiveType = navigator.connection.effectiveType; // 2g, 3g, 4g
    console.log(`[OfflineStorage] Connection effective type: ${effectiveType}`);
    
    // Handle the change just like a regular online/offline event
    this.handleNetworkChange(isConnected);
  }
  
  /**
   * Handle visibility change events which might affect network status
   */
  handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      console.log('[OfflineStorage] Document became visible, checking network status');
      // Re-check network status when document becomes visible again
      this.checkNetworkStatus();
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
    
    // Ensure invoice has a tempId for tracking
    if (!invoice.tempId) {
      invoice.tempId = generateUUID();
    }
    
    // Check if the invoice already exists in the pending queue (based on temp ID or name)
    const isDuplicate = await this.checkDuplicateInvoice(invoice);
    if (isDuplicate) {
      console.warn('[OfflineStorage] Duplicate invoice submission detected and prevented');
      return isDuplicate; // Return the existing ID instead of creating a duplicate
    }
    
    // Get persistent device ID to include in the envelope
    const deviceId = await getDeviceId();
    
    // Create a composite ID that includes device information and timestamp
    // Format: deviceId-timestamp-hash(invoice data)
    const timestamp = new Date().getTime();
    
    // Create a hash from key invoice data for idempotency
    let invoiceDataHash = 0;
    const keyData = JSON.stringify({
      customer: invoice.customer || '',
      items: Array.isArray(invoice.items) ? invoice.items.map(i => `${i.item_code}-${i.qty}`) : [],
      total: invoice.grand_total || 0,
      date: invoice.posting_date || ''
    });
    
    for (let i = 0; i < keyData.length; i++) {
      invoiceDataHash = ((invoiceDataHash << 5) - invoiceDataHash) + keyData.charCodeAt(i);
      invoiceDataHash = invoiceDataHash & invoiceDataHash;
    }
    invoiceDataHash = Math.abs(invoiceDataHash).toString(16).slice(0, 8);
    
    // Create guaranteed unique ID combining device, time and invoice data
    const id = `${deviceId.split('-')[1]}-${timestamp.toString(16)}-${invoiceDataHash}`;
    
    // Store the full original tempId for reference
    if (invoice.tempId) {
      invoice.originalTempId = invoice.tempId;
    }
    
    const envelope = {
      id,
      data: invoice,
      status: 'pending',
      timestamp: new Date().toISOString(),
      attempts: 0,
      deviceId: deviceId,
      // Enhanced metadata for duplicate detection and debugging
      metadata: {
        customer: invoice.customer || 'unknown',
        total: invoice.grand_total || 0,
        tempId: invoice.tempId || null,
        items: Array.isArray(invoice.items) ? invoice.items.length : 0,
        hash: invoiceDataHash,
        createdAt: timestamp
      }
    };
    
    // Add sync lock to prevent concurrent processing of this invoice
    envelope.syncLock = null;
    
    // For debugging and auditing
    console.log(`[OfflineStorage] Queuing invoice with ID: ${id}, tempId: ${invoice.tempId}`);
    
    await this.saveData('pendingInvoices', envelope);
    return id;
  }

  /**
   * Check if an invoice already exists in the pending queue
   * @param {Object} invoice The invoice to check
   * @returns {Promise<string|null>} The ID of the duplicate invoice if found, null otherwise
   */
  async checkDuplicateInvoice(invoice) {
    try {
      // Get all pending invoices
      const pendingInvoices = await this.getAllData('pendingInvoices');
      if (!pendingInvoices || pendingInvoices.length === 0) {
        return null;
      }
      
      console.log(`[OfflineStorage] Checking for duplicates among ${pendingInvoices.length} pending invoices`);
      
      // If the invoice has a name (existing invoice), check for it first
      if (invoice.name) {
        const duplicate = pendingInvoices.find(
          (pending) => pending.data && pending.data.name === invoice.name
        );
        if (duplicate) {
          console.log(`[OfflineStorage] Found duplicate by name: ${invoice.name}`);
          return duplicate.id;
        }
      }
      
      // If the invoice has a tempId, check for that next
      if (invoice.tempId) {
        const duplicate = pendingInvoices.find(
          (pending) => 
            (pending.data && pending.data.tempId === invoice.tempId) ||
            (pending.data && pending.data.originalTempId === invoice.tempId)
        );
        if (duplicate) {
          console.log(`[OfflineStorage] Found duplicate by tempId: ${invoice.tempId}`);
          return duplicate.id;
        }
      }
      
      // If no exact match, generate a content fingerprint for this invoice
      let invoiceFingerprint = this.generateInvoiceFingerprint(invoice);
      
      // Look for fingerprint matches - this detects duplicates that may have different IDs
      // but represent the same actual invoice content
      const fingerprintMatch = pendingInvoices.find(pending => {
        // Generate fingerprint for the pending invoice
        const pendingFingerprint = this.generateInvoiceFingerprint(pending.data);
        return invoiceFingerprint === pendingFingerprint;
      });
      
      if (fingerprintMatch) {
        console.log(`[OfflineStorage] Found duplicate by content fingerprint`);
        return fingerprintMatch.id;
      }
      
      // If no fingerprint match, try to identify duplicates based on metadata
      // Only consider very recent submissions (within the last 60 seconds)
      const recentTimestamp = new Date(Date.now() - 60000).toISOString();
      
      const possibleDuplicates = pendingInvoices.filter(pending => {
        // Skip old pending invoices
        if (pending.timestamp < recentTimestamp) return false;
        
        // Must have same customer
        if (pending.data.customer !== invoice.customer) return false;
        
        // Must have same number of items
        if (!pending.data.items || !invoice.items) return false;
        if (pending.data.items.length !== invoice.items.length) return false;
        
        // Check if items are essentially the same
        const pendingItemCodes = new Set(pending.data.items.map(item => item.item_code));
        const newItemCodes = new Set(invoice.items.map(item => item.item_code));
        const itemDifference = [...pendingItemCodes].filter(x => !newItemCodes.has(x)).length +
                              [...newItemCodes].filter(x => !pendingItemCodes.has(x)).length;
        if (itemDifference > 0) return false;
        
        // Must have same grand total (within a small tolerance)
        const totalDiff = Math.abs(
          (pending.data.grand_total || 0) - (invoice.grand_total || 0)
        );
        if (totalDiff > 0.01) return false;
        
        return true;
      });
      
      if (possibleDuplicates.length > 0) {
        console.warn('[OfflineStorage] Possible duplicate invoice detected by metadata', {
          existing: possibleDuplicates[0].id,
          new: invoice.tempId || 'new invoice'
        });
        return possibleDuplicates[0].id;
      }
      
      // No duplicate found
      console.log('[OfflineStorage] No duplicate found, proceeding with new invoice');
      return null;
    } catch (error) {
      console.error('[OfflineStorage] Error checking for duplicate invoice:', error);
      return null; // In case of error, allow the invoice to be queued
    }
  }

  /**
   * Generate a unique fingerprint for an invoice based on its content
   * @param {Object} invoice The invoice to generate a fingerprint for
   * @returns {string} The fingerprint
   */
  generateInvoiceFingerprint(invoice) {
    if (!invoice) return '';
    
    // Extract key fields that define an invoice's "identity"
    const keyData = {
      customer: invoice.customer || '',
      posting_date: invoice.posting_date || '',
      total: invoice.grand_total || 0,
      items: Array.isArray(invoice.items) 
        ? invoice.items.map(item => ({
            item_code: item.item_code,
            qty: item.qty,
            rate: item.rate
          })).sort((a, b) => a.item_code.localeCompare(b.item_code))
        : []
    };
    
    // Create a deterministic JSON string (sort keys)
    const jsonString = JSON.stringify(keyData, Object.keys(keyData).sort());
    
    // Create a hash of the JSON string
    let hash = 0;
    for (let i = 0; i < jsonString.length; i++) {
      hash = ((hash << 5) - hash) + jsonString.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return hash.toString(16);
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
    
    // Always check if we're online before attempting to sync
    if (!navigator.onLine) {
      console.log('[OfflineStorage] Cannot sync - device is offline');
      return false;
    }
    
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      if ('sync' in navigator.serviceWorker.controller) {
        try {
          await navigator.serviceWorker.ready;
          await navigator.serviceWorker.controller.sync.register('sync-pending-invoices');
          return true;
        } catch (error) {
          console.error('[OfflineStorage] Failed to register sync:', error);
          // Try to sync directly if background sync fails
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
    
    // Always check current online status before attempting to sync
    if (!navigator.onLine) {
      console.log('[OfflineStorage] Cannot process invoices while offline');
      return false;
    }

    const pendingInvoices = await this.getPendingInvoices();
    
    if (!pendingInvoices || pendingInvoices.length === 0) {
      console.log('[OfflineStorage] No pending invoices to process');
      return true;
    }

    console.log(`[OfflineStorage] Processing ${pendingInvoices.length} pending invoices`);
    
    // Double-check connectivity before processing
    const isConnected = await this.testActualConnectivity()
      .catch(() => false);
    
    if (!isConnected) {
      console.log('[OfflineStorage] Cannot process invoices - no actual connectivity');
      return false;
    }

    // Check if auth error was encountered recently (within last 2 minutes)
    const lastAuthErrorTime = await this.getData('settings', 'lastAuthErrorTime');
    if (lastAuthErrorTime && lastAuthErrorTime.value) {
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
      if (new Date(lastAuthErrorTime.value).getTime() > twoMinutesAgo) {
        console.log('[OfflineStorage] Skipping sync due to recent auth error');
        // Emit event to notify UI that reauth is needed
        this.emitAuthErrorEvent('Processing paused - authentication required');
        return false;
      }
    }

    // First check and clear any stale sync locks (older than 5 minutes)
    await this.clearStaleSyncLocks(pendingInvoices);
    
    // Filter out invoices that are currently being processed 
    const availableInvoices = pendingInvoices.filter(
      envelope => !envelope.syncLock || 
                 new Date(envelope.syncLock) < new Date(Date.now() - 300000) // 5 minutes timeout
    );
    
    if (availableInvoices.length === 0) {
      console.log('[OfflineStorage] All pending invoices are currently being processed');
      return true;
    }
    
    console.log(`[OfflineStorage] Found ${availableInvoices.length} available invoices to process`);
    
    // Get device ID for additional idempotency control
    const deviceId = await getDeviceId();
    
    // Track if we encountered auth errors during this sync session
    let authErrorEncountered = false;
    
    // Process each invoice
    const results = await Promise.allSettled(
      availableInvoices.map(async (envelope) => {
        try {
          // Skip processing if auth error already encountered
          if (authErrorEncountered) {
            console.log(`[OfflineStorage] Skipping invoice ${envelope.id} due to auth error`);
            return { status: 'skipped_auth_error', id: envelope.id };
          }
          
          // Set sync lock to prevent concurrent processing
          const lockTime = new Date().toISOString();
          envelope.syncLock = lockTime;
          await this.saveData('pendingInvoices', envelope);
          
          // Update attempts counter
          envelope.attempts += 1;
          await this.saveData('pendingInvoices', envelope);
          
          // First, check if the invoice already exists on the server
          // This prevents duplicate submissions even if our idempotency fails
          if (envelope.data.name) {
            try {
              // Check if this invoice already exists on the server
              const checkResponse = await fetch('/api/method/posawesome.posawesome.api.posapp.check_invoice_exists', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  invoice_name: envelope.data.name
                })
              });
              
              // Check for auth errors early
              if (checkResponse.status === 401 || checkResponse.status === 403) {
                // Auth error detected
                authErrorEncountered = true;
                await this.handleAuthError(envelope, checkResponse.status, 'API access unauthorized');
                return { status: 'auth_error', id: envelope.id, code: checkResponse.status };
              }
              
              const checkResult = await checkResponse.json();
              
              // Check for CSRF errors in response
              if (checkResult.exc_type === 'CSRFTokenError' || 
                  (checkResult.exception && checkResult.exception.includes('CSRF')) ||
                  (checkResult.message && checkResult.message.includes('CSRF'))) {
                authErrorEncountered = true;
                await this.handleAuthError(envelope, 'CSRF', 'CSRF token expired');
                return { status: 'auth_error', id: envelope.id, code: 'CSRF' };
              }
              
              if (checkResult.message === true) {
                console.log(`[OfflineStorage] Invoice ${envelope.data.name} already exists on server`);
                // Invoice already exists - we can safely remove it from pending
                await this.deleteData('pendingInvoices', envelope.id);
                return { status: 'already_exists', id: envelope.id };
              }
            } catch (error) {
              console.warn(`[OfflineStorage] Error checking if invoice exists:`, error);
              // Continue with submission - we'll let the server handle potential duplicates
            }
          }
          
          // Create a robust idempotency key that combines:
          // 1. Device ID (consistent across sessions)
          // 2. Envelope ID (unique per invoice)
          // 3. Invoice content fingerprint
          const idempotencyKey = `${deviceId}-${envelope.id}-${this.generateInvoiceFingerprint(envelope.data)}`;
          
          // Submit the invoice with enhanced idempotency key
          const response = await fetch('/api/method/posawesome.posawesome.api.posapp.submit_invoice', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify({
              invoice: JSON.stringify(envelope.data),
              data: JSON.stringify({
                ...envelope.data,
                // Include metadata for server-side logging and debugging
                metadata: {
                  deviceId: deviceId,
                  envelopeId: envelope.id,
                  tempId: envelope.data.tempId || null,
                  originalTempId: envelope.data.originalTempId || null,
                  timestamp: envelope.timestamp,
                  attempt: envelope.attempts
                }
              })
            })
          });
          
          // Check for auth errors (401 Unauthorized, 403 Forbidden)
          if (response.status === 401 || response.status === 403) {
            authErrorEncountered = true;
            await this.handleAuthError(envelope, response.status, 'API access unauthorized');
            return { status: 'auth_error', id: envelope.id, code: response.status };
          }
          
          // Check if the invoice is still in the database with our lock
          const currentEnvelope = await this.getData('pendingInvoices', envelope.id);
          if (!currentEnvelope || currentEnvelope.syncLock !== lockTime) {
            console.log(`[OfflineStorage] Invoice ${envelope.id} was processed by another instance`);
            return { status: 'concurrent_processing', id: envelope.id };
          }
          
          // Handle HTML login page response (common when session expires)
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('text/html')) {
            const responseText = await response.text();
            // Check if it's a login page by looking for common login form elements
            if (responseText.includes('login') && 
                (responseText.includes('<form') || responseText.includes('password'))) {
              console.warn(`[OfflineStorage] Received login page for invoice ${envelope.id}`);
              authErrorEncountered = true;
              await this.handleAuthError(envelope, 'SESSION_EXPIRED', 'Session expired');
              return { status: 'auth_error', id: envelope.id, code: 'SESSION_EXPIRED' };
            }
            
            // Not a login page, but still not the expected JSON
            console.warn(`[OfflineStorage] Received HTML response for invoice ${envelope.id}`);
            envelope.syncLock = null;
            envelope.lastError = 'Unexpected HTML response';
            await this.saveData('pendingInvoices', envelope);
            return { status: 'retry', id: envelope.id, error: 'Unexpected HTML response' };
          }
          
          try {
          const result = await response.json();
            
            // Check for CSRF error in the response
            if (result.exc_type === 'CSRFTokenError' || 
                (result.exception && result.exception.includes('CSRF')) ||
                (result.message && result.message.includes('CSRF'))) {
              authErrorEncountered = true;
              await this.handleAuthError(envelope, 'CSRF', 'CSRF token expired');
              return { status: 'auth_error', id: envelope.id, code: 'CSRF' };
            }
            
            // Check for auth-related errors in frappe response format
            if (result.exc_type === 'AuthenticationError' || 
                result.exc_type === 'PermissionError' ||
                (result.message && (
                  result.message.includes('not authorized') || 
                  result.message.includes('session expired') ||
                  result.message.includes('permission')
                ))) {
              authErrorEncountered = true;
              await this.handleAuthError(envelope, result.exc_type, result.message || 'Permission denied');
              return { status: 'auth_error', id: envelope.id, code: result.exc_type };
            }
          
          if (response.status === 409) {
            // Conflict detected, move to conflicts store
            await this.saveData('conflicts', envelope);
            await this.deleteData('pendingInvoices', envelope.id);
            return { status: 'conflict', id: envelope.id };
            } else if (result.exc_type === 'PermissionError') {
              // Permission error - move to conflicts
              envelope.status = 'permission_denied';
              envelope.error = result.message;
              envelope.syncLock = null;
              await this.saveData('conflicts', envelope);
              await this.deleteData('pendingInvoices', envelope.id);
              return { status: 'permission_denied', id: envelope.id };
            } else if (result.exc_type === 'DuplicateEntryError') {
              // Duplicate detected by server - can safely remove
              console.log(`[OfflineStorage] Server detected duplicate entry for invoice ${envelope.id}`);
              await this.deleteData('pendingInvoices', envelope.id);
              return { status: 'duplicate', id: envelope.id };
            } else if (result.error || result.exc_type) {
            // Server error
              const errorMessage = result.error || result.exception || result.message || 'Unknown server error';
            if (envelope.attempts >= 3) {
              // Move to conflicts after 3 attempts
              envelope.status = 'failed';
                envelope.error = errorMessage;
              await this.saveData('conflicts', envelope);
              await this.deleteData('pendingInvoices', envelope.id);
                return { status: 'failed', id: envelope.id, error: errorMessage };
              }
              // Clear the sync lock so it can be retried
              envelope.syncLock = null;
              envelope.lastError = errorMessage;
              await this.saveData('pendingInvoices', envelope);
              return { status: 'retry', id: envelope.id, error: errorMessage };
          } else {
            // Success
            await this.deleteData('pendingInvoices', envelope.id);
              if (result.message && result.message.name) {
                // Save the server response invoice data
                try {
                  await this.saveInvoice(result.message);
                } catch (saveError) {
                  console.warn(`[OfflineStorage] Error saving processed invoice:`, saveError);
                }
              }
              return { status: 'success', id: envelope.id, serverName: result.message?.name };
            }
          } catch (jsonError) {
            console.error(`[OfflineStorage] Error parsing JSON response for invoice ${envelope.id}:`, jsonError);
            // Clear the sync lock so it can be retried
            envelope.syncLock = null;
            envelope.lastError = 'Invalid server response';
            await this.saveData('pendingInvoices', envelope);
            return { status: 'retry', id: envelope.id, error: 'Invalid server response' };
          }
        } catch (error) {
          console.error(`[OfflineStorage] Error processing invoice ${envelope.id}:`, error);
          
          // Check for fetch errors that might indicate auth problems
          if (error.message && (
              error.message.includes('Failed to fetch') || 
              error.message.includes('NetworkError') ||
              error.message.includes('load failed'))) {
            // These could be network errors or CORS errors due to auth
            // We'll only treat it as auth if we have other signs
            if (error.status === 401 || error.status === 403) {
              authErrorEncountered = true;
              await this.handleAuthError(envelope, error.status, error.message);
              return { status: 'auth_error', id: envelope.id, code: error.status };
            }
          }
          
          // Check if the invoice is still in the database
          const currentEnvelope = await this.getData('pendingInvoices', envelope.id);
          if (!currentEnvelope) {
            console.log(`[OfflineStorage] Invoice ${envelope.id} was already processed`);
            return { status: 'already_processed', id: envelope.id };
          }
          
          if (currentEnvelope.attempts >= 3) {
            // Move to conflicts after 3 attempts
            currentEnvelope.status = 'failed';
            currentEnvelope.error = error.message;
            currentEnvelope.syncLock = null; // Clear lock before moving to conflicts
            await this.saveData('conflicts', currentEnvelope);
            await this.deleteData('pendingInvoices', envelope.id);
            return { status: 'failed', id: envelope.id, error: error.message };
          }
          
          // Clear the sync lock so it can be retried
          currentEnvelope.syncLock = null;
          currentEnvelope.lastError = error.message;
          await this.saveData('pendingInvoices', currentEnvelope);
          return { status: 'retry', id: envelope.id, error: error.message };
        }
      })
    );

    // Analyze results
    const resultSummary = results.reduce((summary, result) => {
      if (result.status === 'fulfilled') {
        const status = result.value.status;
        summary[status] = (summary[status] || 0) + 1;
      } else {
        summary.error = (summary.error || 0) + 1;
      }
      return summary;
    }, {});
    
    console.log('[OfflineStorage] Processing results:', resultSummary);
    
    // If auth errors were encountered, pause further sync attempts
    if (authErrorEncountered || resultSummary.auth_error) {
      console.warn('[OfflineStorage] Authentication errors encountered during sync');
      this.emitAuthErrorEvent('Authentication required to continue syncing');
    }
    
    // Dispatch an event with the results
    window.dispatchEvent(new CustomEvent('pos-awesome-sync-complete', { 
      detail: { 
        results: resultSummary,
        timestamp: new Date().toISOString(),
        authErrorEncountered: authErrorEncountered
      } 
    }));
    
    return true;
  }
  
  /**
   * Handle authentication error by recording it and emitting auth error event
   * @param {Object} envelope The invoice envelope that triggered the auth error
   * @param {string|number} errorCode The error code or status
   * @param {string} errorMessage The error message
   */
  async handleAuthError(envelope, errorCode, errorMessage) {
    console.warn(`[OfflineStorage] Auth error (${errorCode}) encountered: ${errorMessage}`);
    
    // Clear the sync lock so it can be retried after re-auth
    envelope.syncLock = null;
    envelope.lastError = `Authentication error: ${errorMessage}`;
    envelope.lastAuthError = {
      code: errorCode,
      message: errorMessage,
      timestamp: new Date().toISOString()
    };
    await this.saveData('pendingInvoices', envelope);
    
    // Record the auth error time to prevent immediate retries
    await this.saveData('settings', {
      key: 'lastAuthErrorTime',
      value: new Date().toISOString()
    });
    
    // Emit an event that the UI can listen for to prompt login
    this.emitAuthErrorEvent(errorMessage);
  }
  
  /**
   * Emit auth error event for UI to display login prompt
   * @param {string} message The error message
   */
  emitAuthErrorEvent(message) {
    window.dispatchEvent(new CustomEvent('pos-awesome-auth-error', {
      detail: {
        message: message,
        timestamp: new Date().toISOString(),
        loginUrl: '/login'
      }
    }));
  }
  
  /**
   * Reset auth error status after successful login
   * @returns {Promise} Promise that resolves when status is reset
   */
  async resetAuthErrorStatus() {
    console.log('[OfflineStorage] Resetting auth error status');
    
    // Clear the last auth error time
    await this.saveData('settings', {
      key: 'lastAuthErrorTime',
      value: null
    });
    
    // Signal that authentication has been restored
    window.dispatchEvent(new CustomEvent('pos-awesome-auth-restored', {
      detail: {
        timestamp: new Date().toISOString()
      }
    }));
    
    return true;
  }

  /**
   * Clear stale sync locks from pending invoices
   * @param {Array} pendingInvoices List of pending invoices
   * @returns {Promise} Promise that resolves when locks are cleared
   */
  async clearStaleSyncLocks(pendingInvoices) {
    const staleTime = new Date(Date.now() - 300000).toISOString(); // 5 minutes ago
    
    const staleInvoices = pendingInvoices.filter(
      envelope => envelope.syncLock && envelope.syncLock < staleTime
    );
    
    if (staleInvoices.length > 0) {
      console.log(`[OfflineStorage] Clearing ${staleInvoices.length} stale sync locks`);
      
      await Promise.all(staleInvoices.map(async (envelope) => {
        envelope.syncLock = null;
        await this.saveData('pendingInvoices', envelope);
      }));
    }
  }

  /**
   * Get current network status
   * @returns {boolean} True if device is online
   */
  isOnline() {
    // Always get the latest network status
    return navigator.onLine;
  }

  /**
   * Destroy the database connection
   */
  destroy() {
    // Remove all network event listeners
    this.networkEventListeners.forEach(listener => {
      const target = listener.target || window;
      target.removeEventListener(listener.event, listener.handler);
    });
    
    // Clear network status polling interval
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }
    
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