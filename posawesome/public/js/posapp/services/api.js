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
      args.pos_profile = currentProfile.name;
    }
  }
  
  if (isOnline) {
    try {
      const response = await frappe.call({
        method,
        args
      });

      // If this is a data sync request, store in IndexedDB
      if (syncData) {
        await syncToIndexedDB(method, response.message);
      }

      return response;
    } catch (error) {
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
    // Sync items
    const items = await apiCall('posawesome.posawesome.api.posapp.get_items', {}, { syncData: true });
    
    // Sync customers
    const customers = await apiCall('posawesome.posawesome.api.posapp.get_customers', {}, { syncData: true });
    
    // Sync price lists
    const priceLists = await apiCall('posawesome.posawesome.api.posapp.get_price_lists', {}, { syncData: true });
    
    // Sync tax rules
    const taxRules = await apiCall('posawesome.posawesome.api.posapp.get_tax_rules', {}, { syncData: true });
    
    // Sync POS profile
    const posProfile = await apiCall('posawesome.posawesome.api.posapp.get_pos_profile', {}, { syncData: true });

    return {
      success: true,
      message: 'Initial sync completed'
    };
  } catch (error) {
    console.error('Initial sync failed:', error);
    return {
      success: false,
      message: 'Initial sync failed: ' + error.message
    };
  }
}

export default {
  apiCall,
  processQueue,
  initialSync,
  isOnline
}; 