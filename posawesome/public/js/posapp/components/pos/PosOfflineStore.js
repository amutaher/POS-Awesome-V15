export class PosOfflineStore {
  constructor() {
    this.dbName = 'posawesome_offline';
    this.dbVersion = 1;
    this.db = null;
    this.initializeDB();
  }

  async initializeDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('Error opening IndexedDB:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Invoices store
        if (!db.objectStoreNames.contains('invoices')) {
          const invoiceStore = db.createObjectStore('invoices', { keyPath: 'name' });
          invoiceStore.createIndex('timestamp', 'timestamp', { unique: false });
          invoiceStore.createIndex('synced', 'synced', { unique: false });
        }

        // Customer store
        if (!db.objectStoreNames.contains('customers')) {
          const customerStore = db.createObjectStore('customers', { keyPath: 'name' });
          customerStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Items store  
        if (!db.objectStoreNames.contains('items')) {
          const itemStore = db.createObjectStore('items', { keyPath: 'name' });
          itemStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async saveInvoice(invoice) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['invoices'], 'readwrite');
      const store = transaction.objectStore('invoices');

      invoice.timestamp = new Date().getTime();
      invoice.synced = false;

      const request = store.put(invoice);

      request.onsuccess = () => resolve(invoice);
      request.onerror = () => reject(request.error);
    });
  }

  async getInvoice(name) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['invoices'], 'readonly');
      const store = transaction.objectStore('invoices');
      const request = store.get(name);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsynedInvoices() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['invoices'], 'readonly');
      const store = transaction.objectStore('invoices');
      const index = store.index('synced');
      const request = index.getAll(false);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markInvoiceAsSynced(name) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['invoices'], 'readwrite');
      const store = transaction.objectStore('invoices');
      
      const getRequest = store.get(name);
      getRequest.onsuccess = () => {
        const invoice = getRequest.result;
        if (invoice) {
          invoice.synced = true;
          const updateRequest = store.put(invoice);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error('Invoice not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async saveCustomer(customer) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['customers'], 'readwrite');
      const store = transaction.objectStore('customers');

      customer.timestamp = new Date().getTime();

      const request = store.put(customer);

      request.onsuccess = () => resolve(customer);
      request.onerror = () => reject(request.error);
    });
  }

  async getCustomer(name) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['customers'], 'readonly');
      const store = transaction.objectStore('customers');
      const request = store.get(name);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveItem(item) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['items'], 'readwrite');
      const store = transaction.objectStore('items');

      item.timestamp = new Date().getTime();

      const request = store.put(item);

      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(request.error);
    });
  }

  async getItem(name) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['items'], 'readonly');
      const store = transaction.objectStore('items');
      const request = store.get(name);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
} 