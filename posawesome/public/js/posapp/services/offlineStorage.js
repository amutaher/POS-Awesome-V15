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

class OfflineStorage {
  constructor(dbName, version) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.isInitialized = false;
    this.networkListeners = new Set();
    this.isOnline = navigator.onLine;
    
    // Bind methods to this instance
    this.setupNetworkListeners = this.setupNetworkListeners.bind(this);
    this.checkNetworkStatus = this.checkNetworkStatus.bind(this);
    this.notifyNetworkStatusChange = this.notifyNetworkStatusChange.bind(this);
    this.handleNetworkChange = this.handleNetworkChange.bind(this);
  }

  async init() {
    try {
      // Initialize IndexedDB
      this.db = await this.openDatabase();
      this.isInitialized = true;
      
      // Setup network listeners
      this.setupNetworkListeners();
      
      // Initial network check
      await this.checkNetworkStatus();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize offline storage:', error);
      throw error;
    }
  }

  setupNetworkListeners() {
    // Listen for online/offline events
    window.addEventListener('online', this.handleNetworkChange);
    window.addEventListener('offline', this.handleNetworkChange);
    
    // Listen for service worker network status events
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NETWORK_STATUS') {
          this.handleNetworkChange(event.data);
        }
      });
    }
    
    // Listen for connection changes
    if ('connection' in navigator) {
      navigator.connection.addEventListener('change', this.handleNetworkChange);
    }
  }

  handleNetworkChange(event) {
    const isOnline = event.type ? navigator.onLine : event.isOnline;
    if (this.isOnline !== isOnline) {
      this.isOnline = isOnline;
      this.notifyNetworkStatusChange();
    }
  }

  async checkNetworkStatus() {
    try {
      const response = await fetch('/api/method/ping', {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      const isOnline = response.ok;
      if (this.isOnline !== isOnline) {
        this.isOnline = isOnline;
        this.notifyNetworkStatusChange();
      }
      
      return isOnline;
    } catch (error) {
      if (this.isOnline) {
        this.isOnline = false;
        this.notifyNetworkStatusChange();
      }
      return false;
    }
  }

  notifyNetworkStatusChange() {
    // Notify all registered listeners
    this.networkListeners.forEach(listener => {
      try {
        listener(this.isOnline);
      } catch (error) {
        console.error('Error in network status listener:', error);
      }
    });
    
    // Notify service worker if available
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'NETWORK_STATUS_CHANGE',
        isOnline: this.isOnline,
        timestamp: Date.now()
      });
    }
  }

  addNetworkListener(listener) {
    if (typeof listener === 'function') {
      this.networkListeners.add(listener);
      // Immediately notify the new listener of current status
      listener(this.isOnline);
    }
  }

  removeNetworkListener(listener) {
    this.networkListeners.delete(listener);
  }

  async openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = (event) => {
        reject(new Error('Failed to open database'));
      };
      
      request.onsuccess = (event) => {
        resolve(event.target.result);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('pendingInvoices')) {
          db.createObjectStore('pendingInvoices', { keyPath: 'id', autoIncrement: true });
        }
        
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }
}

export default OfflineStorage; 