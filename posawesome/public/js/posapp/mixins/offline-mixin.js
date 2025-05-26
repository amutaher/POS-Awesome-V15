import { ItemsDB, CustomersDB, InvoicesDB } from '../services/db';
import { apiCall, processQueue } from '../services/api';

export default {
  data() {
    return {
      isOnline: navigator.onLine,
      pendingCount: 0,
      pendingInvoices: [],
      showPendingDialog: false,
    };
  },
  
  created() {
    // Network status listeners
    window.addEventListener('online', this.handleConnectionChange);
    window.addEventListener('offline', this.handleConnectionChange);
    
    // Check for pending transactions
    this.checkPendingTransactions();
    
    // Set interval to check pending count
    this.pendingCheckInterval = setInterval(this.checkPendingTransactions, 30000);
  },
  
  beforeDestroy() {
    window.removeEventListener('online', this.handleConnectionChange);
    window.removeEventListener('offline', this.handleConnectionChange);
    clearInterval(this.pendingCheckInterval);
  },
  
  methods: {
    // Network status handler
    handleConnectionChange() {
      this.isOnline = navigator.onLine;
      
      if (this.isOnline) {
        frappe.show_alert({
          message: __('Connected to network'),
          indicator: 'green'
        });
        
        // Try to sync pending transactions
        this.syncNow();
      } else {
        frappe.show_alert({
          message: __('Working offline. Limited functionality available.'),
          indicator: 'orange'
        });
      }
    },
    
    // Check for pending transactions
    async checkPendingTransactions() {
      const pendingInvoices = await InvoicesDB.getPendingInvoices();
      this.pendingCount = pendingInvoices.length;
      this.pendingInvoices = pendingInvoices;
    },
    
    // Manually trigger sync
    async syncNow() {
      if (!this.isOnline) {
        frappe.show_alert({
          message: __('Cannot sync while offline'),
          indicator: 'red'
        });
        return;
      }
      
      await processQueue();
      this.checkPendingTransactions();
    },
    
    // Offline-aware API call
    async callAPI(method, args, options = {}) {
      return apiCall(method, args, options);
    },
    
    // Modified loadItems with offline support
    async loadItemsOffline(loadFunction) {
      try {
        if (!this.isOnline) {
          // Load from IndexedDB when offline
          const cachedItems = await ItemsDB.getItems();
          if (cachedItems && cachedItems.length > 0) {
            return cachedItems;
          }
        }
        
        // Call the provided load function and cache results
        const items = await loadFunction();
        if (items && items.length > 0) {
          await ItemsDB.saveItems(items);
        }
        return items;
      } catch (error) {
        console.error('Error loading items:', error);
        frappe.show_alert({
          message: __('Failed to load items'),
          indicator: 'red'
        });
        return [];
      }
    },
    
    // Modified loadCustomers with offline support
    async loadCustomersOffline(loadFunction) {
      try {
        if (!this.isOnline) {
          // Load from IndexedDB when offline
          const cachedCustomers = await CustomersDB.getCustomers();
          if (cachedCustomers && cachedCustomers.length > 0) {
            return cachedCustomers;
          }
        }
        
        // Call the provided load function and cache results
        const customers = await loadFunction();
        if (customers && customers.length > 0) {
          await CustomersDB.saveCustomers(customers);
        }
        return customers;
      } catch (error) {
        console.error('Error loading customers:', error);
        frappe.show_alert({
          message: __('Failed to load customers'),
          indicator: 'red'
        });
        return [];
      }
    }
  }
}; 