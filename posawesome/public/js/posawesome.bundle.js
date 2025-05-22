(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // posawesome/public/js/posapp/posapp.js
  var import_vuetify = __require("vuetify");
  var import_vue = __require("vue");

  // node_modules/mitt/dist/mitt.mjs
  function mitt_default(n) {
    return { all: n = n || /* @__PURE__ */ new Map(), on: function(t, e) {
      var i = n.get(t);
      i ? i.push(e) : n.set(t, [e]);
    }, off: function(t, e) {
      var i = n.get(t);
      i && (e ? i.splice(i.indexOf(e) >>> 0, 1) : n.set(t, []));
    }, emit: function(t, e) {
      var i = n.get(t);
      i && i.slice().map(function(n2) {
        n2(e);
      }), (i = n.get("*")) && i.slice().map(function(n2) {
        n2(t, e);
      });
    } };
  }

  // posawesome/public/js/posapp/bus.js
  var bus_default = {
    install: (app, options) => {
      app.config.globalProperties.__ = window.__;
      app.config.globalProperties.frappe = window.frappe;
      app.config.globalProperties.eventBus = mitt_default();
    }
  };

  // posawesome/public/js/posapp/posapp.js
  var components = __toESM(__require("vuetify/components"));
  var directives = __toESM(__require("vuetify/directives"));

  // posawesome/public/js/posapp/services/offlineStorage.js
  var import_idb = __require("idb");
  function uuidv4() {
    if (typeof uuid !== "undefined" && typeof uuid.v4 === "function") {
      return uuid.v4();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }
  var OfflineStorage = class {
    constructor(dbName = "posAwesomeDB", version = 1) {
      this.dbName = dbName;
      this.version = version;
      this.db = null;
      this.isOnline = navigator.onLine;
      this.ready = this.init();
      window.addEventListener("online", this.handleOnlineStatusChange.bind(this));
      window.addEventListener("offline", this.handleOnlineStatusChange.bind(this));
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.addEventListener("message", this.handleServiceWorkerMessage.bind(this));
      }
    }
    /**
     * Handle online/offline status changes
     */
    handleOnlineStatusChange() {
      this.isOnline = navigator.onLine;
      if (this.isOnline) {
        console.log("[OfflineStorage] Back online, attempting to sync data");
        this.triggerSync();
      } else {
        console.log("[OfflineStorage] Device is offline, data will be stored locally");
      }
    }
    /**
     * Handle messages from service worker
     */
    handleServiceWorkerMessage(event) {
      if (event.data && event.data.type === "SYNC_PENDING_INVOICES") {
        this.processPendingInvoices().then(() => {
          if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: "SYNC_COMPLETED"
            });
          }
        });
      }
    }
    /**
     * Initialize the database with all required object stores
     * @returns {Promise} Promise that resolves when DB is ready
     */
    async init() {
      try {
        if (!("indexedDB" in window)) {
          console.error("Your browser doesn't support IndexedDB");
          throw new Error("IndexedDB not supported");
        }
        this.db = await (0, import_idb.openDB)(this.dbName, this.version, {
          upgrade(db, oldVersion, newVersion) {
            if (oldVersion < 1) {
              if (!db.objectStoreNames.contains("items")) {
                db.createObjectStore("items", { keyPath: "item_code" });
              }
              if (!db.objectStoreNames.contains("customers")) {
                db.createObjectStore("customers", { keyPath: "name" });
              }
              if (!db.objectStoreNames.contains("pendingInvoices")) {
                const store = db.createObjectStore("pendingInvoices", { keyPath: "id" });
                store.createIndex("status", "status", { unique: false });
                store.createIndex("timestamp", "timestamp", { unique: false });
              }
              if (!db.objectStoreNames.contains("conflicts")) {
                db.createObjectStore("conflicts", { keyPath: "id" });
              }
              if (!db.objectStoreNames.contains("invoices")) {
                const store = db.createObjectStore("invoices", { keyPath: "name" });
                store.createIndex("customer", "customer", { unique: false });
                store.createIndex("posting_date", "posting_date", { unique: false });
              }
              if (!db.objectStoreNames.contains("posProfile")) {
                db.createObjectStore("posProfile", { keyPath: "name" });
              }
              if (!db.objectStoreNames.contains("settings")) {
                db.createObjectStore("settings", { keyPath: "key" });
              }
            }
          }
        });
        console.log("IndexedDB initialized successfully");
        return this.db;
      } catch (error) {
        console.error("IndexedDB initialization failed:", error);
        throw error;
      }
    }
    /**
     * Store data in the specified object store
     * @param {string} storeName The name of the object store
     * @param {Object} data The data to store
     * @returns {Promise} Promise that resolves when data is stored
     */
    async saveData(storeName, data) {
      await this.ready;
      try {
        return await this.db.put(storeName, data);
      } catch (error) {
        console.error(`Error saving data to ${storeName}:`, error);
        throw error;
      }
    }
    /**
     * Store multiple items in the specified object store
     * @param {string} storeName The name of the object store
     * @param {Array} items Array of items to store
     * @returns {Promise} Promise that resolves when all items are stored
     */
    async saveMultipleData(storeName, items) {
      await this.ready;
      try {
        const tx = this.db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const promises = items.map((item) => store.put(item));
        await Promise.all(promises);
        await tx.done;
        return true;
      } catch (error) {
        console.error(`Error saving multiple items to ${storeName}:`, error);
        throw error;
      }
    }
    /**
     * Get data from the specified object store
     * @param {string} storeName The name of the object store
     * @param {string|number} id The ID of the data to retrieve
     * @returns {Promise} Promise that resolves with the retrieved data
     */
    async getData(storeName, id) {
      await this.ready;
      try {
        return await this.db.get(storeName, id);
      } catch (error) {
        console.error(`Error getting data from ${storeName}:`, error);
        throw error;
      }
    }
    /**
     * Get all data from the specified object store
     * @param {string} storeName The name of the object store
     * @returns {Promise} Promise that resolves with an array of all data
     */
    async getAllData(storeName) {
      await this.ready;
      try {
        return await this.db.getAll(storeName);
      } catch (error) {
        console.error(`Error getting all data from ${storeName}:`, error);
        throw error;
      }
    }
    /**
     * Get data by index from the specified object store
     * @param {string} storeName The name of the object store
     * @param {string} indexName The name of the index to query
     * @param {any} value The value to look up in the index
     * @returns {Promise} Promise that resolves with the matching data
     */
    async getDataByIndex(storeName, indexName, value) {
      await this.ready;
      try {
        return await this.db.getAllFromIndex(storeName, indexName, value);
      } catch (error) {
        console.error(`Error getting data by index from ${storeName}:`, error);
        throw error;
      }
    }
    /**
     * Delete data from the specified object store
     * @param {string} storeName The name of the object store
     * @param {string|number} id The ID of the data to delete
     * @returns {Promise} Promise that resolves when data is deleted
     */
    async deleteData(storeName, id) {
      await this.ready;
      try {
        return await this.db.delete(storeName, id);
      } catch (error) {
        console.error(`Error deleting data from ${storeName}:`, error);
        throw error;
      }
    }
    /**
     * Clear all data from the specified object store
     * @param {string} storeName The name of the object store
     * @returns {Promise} Promise that resolves when store is cleared
     */
    async clearStore(storeName) {
      await this.ready;
      try {
        return await this.db.clear(storeName);
      } catch (error) {
        console.error(`Error clearing store ${storeName}:`, error);
        throw error;
      }
    }
    /**
     * Queue a pending invoice with a unique ID for idempotent processing
     * @param {Object} invoice The invoice data to queue
     * @returns {Promise<string>} Promise that resolves with the unique ID of the queued invoice
     */
    async queuePendingInvoice(invoice) {
      await this.ready;
      const envelope = {
        id: uuidv4(),
        data: invoice.invoice_data || invoice,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        status: "pending",
        retryCount: 0
      };
      try {
        await this.saveData("pendingInvoices", envelope);
        console.log("[OfflineStorage] Invoice queued successfully with ID:", envelope.id);
        return envelope.id;
      } catch (error) {
        console.error("[OfflineStorage] Failed to queue invoice:", error);
        throw error;
      }
    }
    /**
     * Get all pending invoices that need to be synced
     * @returns {Promise<Array>} Promise that resolves with array of pending invoices
     */
    async getPendingInvoices() {
      await this.ready;
      try {
        return await this.getDataByIndex("pendingInvoices", "status", "pending");
      } catch (error) {
        console.error("[OfflineStorage] Failed to get pending invoices:", error);
        return [];
      }
    }
    /**
     * Cache POS profile for offline use
     * @param {Object} profile The POS profile to cache
     * @returns {Promise} Promise that resolves when profile is cached
     */
    async cachePosProfile(profile) {
      await this.ready;
      return this.saveData("posProfile", profile);
    }
    /**
     * Cache items for offline use
     * @param {Array} items Array of items to cache
     * @returns {Promise} Promise that resolves when items are cached
     */
    async cacheItems(items) {
      await this.ready;
      return this.saveMultipleData("items", items);
    }
    /**
     * Cache customers for offline use
     * @param {Array} customers Array of customers to cache
     * @returns {Promise} Promise that resolves when customers are cached
     */
    async cacheCustomers(customers) {
      await this.ready;
      return this.saveMultipleData("customers", customers);
    }
    /**
     * Save a completed invoice
     * @param {Object} invoice The invoice to save
     * @returns {Promise} Promise that resolves when invoice is saved
     */
    async saveInvoice(invoice) {
      await this.ready;
      return this.saveData("invoices", invoice);
    }
    /**
     * Trigger background sync if available, or use manual sync
     * @returns {Promise} Promise that resolves when sync is triggered
     */
    async triggerSync() {
      if (!this.isOnline) {
        console.log("[OfflineStorage] Cannot sync while offline");
        return false;
      }
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          await registration.sync.register("sync-pending-invoices");
          return true;
        } catch (error) {
          console.error("[OfflineStorage] Failed to register sync:", error);
          return this.processPendingInvoices();
        }
      } else {
        return this.processPendingInvoices();
      }
    }
    /**
     * Process all pending invoices
     * @returns {Promise} Promise that resolves when all invoices are processed
     */
    async processPendingInvoices() {
      await this.ready;
      if (!this.isOnline) {
        console.log("[OfflineStorage] Cannot process invoices while offline");
        return false;
      }
      const pendingInvoices = await this.getPendingInvoices();
      if (!pendingInvoices.length) {
        console.log("[OfflineStorage] No pending invoices to process");
        return true;
      }
      console.log(`[OfflineStorage] Processing ${pendingInvoices.length} pending invoices`);
      let successCount = 0;
      let failCount = 0;
      let conflictCount = 0;
      for (const invoice of pendingInvoices) {
        try {
          invoice.status = "processing";
          invoice.lastAttempt = (/* @__PURE__ */ new Date()).toISOString();
          await this.saveData("pendingInvoices", invoice);
          const result = await this.syncInvoice(invoice);
          if (result.success) {
            await this.deleteData("pendingInvoices", invoice.id);
            successCount++;
          } else if (result.conflict) {
            invoice.status = "conflict";
            await this.saveData("pendingInvoices", invoice);
            await this.saveData("conflicts", {
              id: invoice.id,
              data: invoice.data,
              timestamp: invoice.timestamp,
              conflictReason: result.message || "Server reported a conflict"
            });
            conflictCount++;
          } else {
            invoice.status = "pending";
            invoice.retryCount = (invoice.retryCount || 0) + 1;
            invoice.lastError = result.message || "Unknown error";
            await this.saveData("pendingInvoices", invoice);
            failCount++;
          }
        } catch (error) {
          console.error("[OfflineStorage] Error processing invoice:", error);
          invoice.status = "pending";
          invoice.retryCount = (invoice.retryCount || 0) + 1;
          invoice.lastError = error.message || "Unknown error";
          await this.saveData("pendingInvoices", invoice);
          failCount++;
        }
      }
      console.log(`[OfflineStorage] Sync complete: ${successCount} succeeded, ${failCount} failed, ${conflictCount} conflicts`);
      const event = new CustomEvent("offline-sync-complete", {
        detail: { success: successCount, failed: failCount, conflicts: conflictCount }
      });
      window.dispatchEvent(event);
      return failCount === 0 && conflictCount === 0;
    }
    /**
     * Sync a single invoice with the server using idempotency key
     * @param {Object} envelope The invoice envelope to sync
     * @returns {Promise<Object>} Promise with sync result
     */
    async syncInvoice(envelope) {
      try {
        const response = await fetch("/api/method/posawesome.posawesome.api.posapp.submit_invoice", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Frappe-CSRF-Token": frappe.csrf_token,
            "Idempotency-Key": envelope.id
          },
          body: JSON.stringify({ invoice: envelope.data })
        });
        const result = await response.json();
        if (response.status === 409) {
          return { success: false, conflict: true, message: result.message || "Conflict detected" };
        }
        if (response.ok && result.message && result.message.name) {
          return { success: true, name: result.message.name };
        }
        return {
          success: false,
          conflict: false,
          message: result.message && result.message.error || "Server error"
        };
      } catch (error) {
        return { success: false, conflict: false, message: error.message };
      }
    }
    /**
     * Check if required offline data is available
     * @returns {Promise<Object>} Promise that resolves with status of offline data
     */
    async checkOfflineDataAvailability() {
      await this.ready;
      try {
        const items = await this.db.count("items");
        const customers = await this.db.count("customers");
        const posProfile = await this.db.count("posProfile");
        return {
          hasItems: items > 0,
          hasCustomers: customers > 0,
          hasPosProfile: posProfile > 0,
          isReady: items > 0 && posProfile > 0
        };
      } catch (error) {
        console.error("[OfflineStorage] Error checking offline data:", error);
        return {
          hasItems: false,
          hasCustomers: false,
          hasPosProfile: false,
          isReady: false,
          error: error.message
        };
      }
    }
    /**
     * Process all pending operations (for browsers without background sync)
     * Run this on an interval or manual trigger
     */
    async processAll() {
      await this.ready;
      if (this.isOnline) {
        return this.processPendingInvoices();
      }
      return false;
    }
    /**
     * Get all conflicts that need user resolution
     * @returns {Promise<Array>} Promise that resolves with array of conflicts
     */
    async getConflicts() {
      await this.ready;
      return this.getAllData("conflicts");
    }
    /**
     * Resolve a conflict by marking it as resolved
     * @param {string} id The ID of the conflict to resolve
     * @returns {Promise} Promise that resolves when conflict is resolved
     */
    async resolveConflict(id) {
      await this.ready;
      return this.deleteData("conflicts", id);
    }
    /**
     * Clean up resources and remove event listeners
     */
    destroy() {
      window.removeEventListener("online", this.handleOnlineStatusChange);
      window.removeEventListener("offline", this.handleOnlineStatusChange);
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.removeEventListener("message", this.handleServiceWorkerMessage);
      }
      if (this.db) {
        this.db.close();
        this.db = null;
      }
    }
    /**
     * Cache sales persons for offline use
     * @param {Array} salesPersons Array of sales persons to cache
     * @returns {Promise} Promise that resolves when sales persons are cached
     */
    async cacheSalesPersons(salesPersons) {
      await this.ready;
      try {
        const tx = this.db.transaction("settings", "readwrite");
        await tx.objectStore("settings").put({
          key: "salesPersons",
          value: salesPersons,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        await tx.done;
        return true;
      } catch (error) {
        console.error("[OfflineStorage] Failed to cache sales persons:", error);
        throw error;
      }
    }
  };

  // posawesome/public/js/posapp/posapp.js
  frappe.provide("frappe.PosApp");
  frappe.PosApp.posapp = class {
    constructor({ parent }) {
      this.$parent = $(document);
      this.page = parent.page;
      this.make_body();
    }
    async make_body() {
      this.$el = this.$parent.find(".main-section");
      await this.init_offline_storage();
      await this.init_service_worker();
      const vuetify = (0, import_vuetify.createVuetify)(
        {
          components,
          directives,
          locale: {
            rtl: frappe.utils.is_rtl()
          },
          theme: {
            themes: {
              light: {
                background: "#FFFFFF",
                primary: "#0097A7",
                secondary: "#00BCD4",
                accent: "#9575CD",
                success: "#66BB6A",
                info: "#2196F3",
                warning: "#FF9800",
                error: "#E86674",
                orange: "#E65100",
                golden: "#A68C59",
                badge: "#F5528C",
                customPrimary: "#085294"
              }
            }
          }
        }
      );
      let HomeComponent;
      if (window.frappe && window.frappe.PosApp && window.frappe.PosApp.Home) {
        HomeComponent = window.frappe.PosApp.Home;
      } else {
        HomeComponent = {
          template: "<div>POS App loading...</div>",
          mounted() {
            console.log("POS App placeholder mounted");
          }
        };
      }
      const app = (0, import_vue.createApp)(HomeComponent);
      app.use(bus_default);
      app.use(vuetify);
      app.mount(this.$el[0]);
    }
    async init_offline_storage() {
      try {
        window.offlineStorage = new OfflineStorage("posAwesomeDB", 1);
        await window.offlineStorage.ready;
        console.log("Global OfflineStorage initialized successfully");
        const offlineDataStatus = await window.offlineStorage.checkOfflineDataAvailability();
        console.log("Offline data status:", offlineDataStatus);
        return window.offlineStorage;
      } catch (error) {
        console.error("Failed to initialize global OfflineStorage:", error);
        throw error;
      }
    }
    async init_service_worker() {
      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.register("/assets/posawesome/service-worker.js");
          console.log("Service Worker registered with scope:", registration.scope);
          registration.ready.then((reg) => {
            if ("sync" in reg) {
              console.log("Background Sync is supported");
              reg.sync.register("sync-pending-invoices").catch((err) => {
                console.error("Background Sync registration error:", err);
              });
            } else {
              console.log("Background Sync not supported, using polling fallback");
              this.setupSyncPolling();
            }
          });
          return registration;
        } catch (error) {
          console.error("Service Worker registration failed:", error);
        }
      } else {
        console.log("Service Workers not supported");
      }
    }
    setupSyncPolling() {
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
      }
      this.syncInterval = setInterval(() => {
        if (navigator.onLine && window.offlineStorage) {
          window.offlineStorage.processAll().then((result) => {
            if (result) {
              console.log("Polling sync successful");
            }
          }).catch((err) => {
            console.error("Polling sync error:", err);
          });
        }
      }, 6e4);
      window.addEventListener("online", () => {
        if (window.offlineStorage) {
          window.offlineStorage.processAll();
        }
      });
      window.addEventListener("beforeunload", () => {
        if (this.syncInterval) {
          clearInterval(this.syncInterval);
        }
      });
    }
    setup_header() {
    }
  };
})();
