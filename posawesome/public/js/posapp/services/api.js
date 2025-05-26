import { InvoicesDB, ItemsDB, CustomersDB, PriceListsDB, TaxRulesDB, PosProfileDB } from './db';

// Network status
let isOnline = navigator.onLine;
window.addEventListener('online', () => {
  isOnline = true;
  processQueue();
  showOnlineStatus();
});
window.addEventListener('offline', () => {
  isOnline = false;
  showOfflineStatus();
});

// Show online/offline status
function showOnlineStatus() {
  frappe.show_alert({
    message: __('You are back online'),
    indicator: 'green'
  });
}

function showOfflineStatus() {
  frappe.show_alert({
    message: __('You are offline. Some features may be limited'),
    indicator: 'orange'
  });
}

// API wrapper
export async function apiCall(method, args = {}, options = {}) {
  const { isInvoice = false, offlineSupport = false, syncData = false } = options;
  
  // Add POS profile to args if not present
  if (!args.pos_profile && method.includes('get_items')) {
    const currentProfile = await PosProfileDB.getCurrentProfile();
    if (currentProfile) {
      // Stringify the pos_profile object
      args.pos_profile = JSON.stringify(currentProfile);
    } else {
      throw new Error('POS Profile not found. Please open POS from the desk.');
    }
  }
  
  // If pos_profile exists in args but isn't stringified, stringify it
  if (args.pos_profile && typeof args.pos_profile === 'object') {
    args.pos_profile = JSON.stringify(args.pos_profile);
  }
  
  if (isOnline) {
    try {
      console.log('Making API call:', method, 'with args:', args); // Debug log
      const response = await frappe.call({
        method,
        args
      });

      // If this is a data sync request, store in IndexedDB
      if (syncData && response.message) {
        await syncToIndexedDB(method, response.message);
      }

      return response;
    } catch (error) {
      console.error('API call failed:', error); // Debug log
      if (isInvoice) {
        // If invoice creation fails, queue it
        await InvoicesDB.addInvoice({
          method,
          args,
          error: error.message
        });
        return { offline: true, queued: true, message: 'Transaction saved offline' };
      }
      throw error;
    }
  } else if (offlineSupport) {
    // If offline and operation supports offline mode
    if (isInvoice) {
      await InvoicesDB.addInvoice({
        method,
        args
      });
      return { offline: true, queued: true, message: 'Transaction saved offline' };
    }
    return { offline: true, message: 'App is offline' };
  } else {
    throw new Error('App is offline and this operation requires connectivity');
  }
}

// Sync data to IndexedDB
async function syncToIndexedDB(method, data) {
  switch (method) {
    case 'posawesome.posawesome.api.posapp.get_items':
      await ItemsDB.saveItems(data);
      break;
    case 'posawesome.posawesome.api.posapp.get_customers':
      await CustomersDB.saveCustomers(data);
      break;
    case 'posawesome.posawesome.api.posapp.get_price_lists':
      await PriceListsDB.savePriceLists(data);
      break;
    case 'posawesome.posawesome.api.posapp.get_tax_rules':
      await TaxRulesDB.saveTaxRules(data);
      break;
    case 'posawesome.posawesome.api.posapp.get_pos_profile':
      await PosProfileDB.savePosProfile(data);
      break;
  }
}

// Process offline queue
export async function processQueue() {
  if (!isOnline) return;
  
  const pendingInvoices = await InvoicesDB.getPendingInvoices();
  
  for (const invoice of pendingInvoices) {
    try {
      const response = await frappe.call({
        method: invoice.method,
        args: invoice.args
      });
      
      await InvoicesDB.updateInvoiceStatus(invoice.id, 'synced', response);
      
      frappe.show_alert({
        message: __('Offline invoice synced successfully'),
        indicator: 'green'
      });
    } catch (error) {
      await InvoicesDB.updateInvoiceStatus(invoice.id, 'error', error.message);
      
      frappe.show_alert({
        message: __('Failed to sync offline invoice: ') + error.message,
        indicator: 'red'
      });
    }
  }
}

// Initial data sync
export async function initialSync() {
  if (!isOnline) return;

  try {
    // Get current POS profile first
    const currentProfile = await PosProfileDB.getCurrentProfile();
    if (!currentProfile) {
      throw new Error('POS Profile not found. Please open POS from the desk.');
    }

    // Stringify the pos_profile
    const pos_profile = JSON.stringify(currentProfile);

    // Sync items with POS profile
    const items = await apiCall('posawesome.posawesome.api.posapp.get_items', 
      { pos_profile }, 
      { syncData: true }
    );
    
    // Note: get_customers API is not available, using Frappe API instead
    const customers = await frappe.db.get_list('Customer', {
      fields: ['name', 'customer_name'],
      limit: 0
    });
    if (customers) {
      await CustomersDB.saveCustomers(customers);
    }
    
    // Note: These APIs might not be available in current version
    try {
      // Try to sync price lists if API exists
      const priceLists = await apiCall('posawesome.posawesome.api.posapp.get_price_lists', 
        { pos_profile }, 
        { syncData: true }
      );
    } catch (e) {
      console.warn('Price lists sync failed:', e);
    }
    
    try {
      // Try to sync tax rules if API exists
      const taxRules = await apiCall('posawesome.posawesome.api.posapp.get_tax_rules', 
        { pos_profile }, 
        { syncData: true }
      );
    } catch (e) {
      console.warn('Tax rules sync failed:', e);
    }

    return {
      success: true,
      message: 'Initial sync completed'
    };
  } catch (error) {
    console.error('Initial sync failed:', error);
    return {
      success: false,
      message: error.message || 'Initial sync failed'
    };
  }
}

export default {
  apiCall,
  processQueue,
  initialSync,
  isOnline
}; 