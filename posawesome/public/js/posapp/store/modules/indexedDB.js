import { openDB } from 'idb';

const DB_NAME = 'posawesome-offline';
const DB_VERSION = 1;

async function initDB() {
  return await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create stores
      if (!db.objectStoreNames.contains('offline-invoices')) {
        db.createObjectStore('offline-invoices', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('items-cache')) {
        db.createObjectStore('items-cache', { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains('customers-cache')) {
        db.createObjectStore('customers-cache', { keyPath: 'name' });
      }
    },
  });
}

export const indexedDB = {
  namespaced: true,
  state: {
    db: null,
    isInitialized: false
  },
  mutations: {
    SET_DB(state, db) {
      state.db = db;
      state.isInitialized = true;
    }
  },
  actions: {
    async initialize({ commit }) {
      const db = await initDB();
      commit('SET_DB', db);
    },
    
    async saveOfflineInvoice({ state }, invoice) {
      if (!state.isInitialized) return;
      const tx = state.db.transaction('offline-invoices', 'readwrite');
      await tx.store.add(invoice);
    },

    async getOfflineInvoices({ state }) {
      if (!state.isInitialized) return [];
      const tx = state.db.transaction('offline-invoices', 'readonly');
      return await tx.store.getAll();
    },

    async cacheItems({ state }, items) {
      if (!state.isInitialized) return;
      const tx = state.db.transaction('items-cache', 'readwrite');
      for (const item of items) {
        await tx.store.put(item);
      }
    },

    async getCachedItems({ state }) {
      if (!state.isInitialized) return [];
      const tx = state.db.transaction('items-cache', 'readonly');
      return await tx.store.getAll();
    },

    async cacheCustomers({ state }, customers) {
      if (!state.isInitialized) return;
      const tx = state.db.transaction('customers-cache', 'readwrite');
      for (const customer of customers) {
        await tx.store.put(customer);
      }
    },

    async getCachedCustomers({ state }) {
      if (!state.isInitialized) return [];
      const tx = state.db.transaction('customers-cache', 'readonly');
      return await tx.store.getAll();
    }
  }
}; 