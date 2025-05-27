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
  } else if (offlineSupport || isInvoice) { // Allow offline mode for invoices
    if (isInvoice) {
      // Store invoice in IndexedDB
      const invoice = {
        method,
        args,
        createdAt: new Date().toISOString(),
        status: 'pending'
      };
      
      const id = await InvoicesDB.addInvoice(invoice);
      console.log('Invoice saved offline with ID:', id);
      
      return { 
        offline: true, 
        queued: true, 
        message: 'Transaction saved offline. Will sync when online.',
        invoice_id: id 
      };
    }
    return { offline: true, message: 'App is offline' };
  } else {
    throw new Error('App is offline and this operation requires connectivity');
  }
}

// Get customer info with offline support
export async function getCustomerInfo(customer) {
  try {
    // Check if we're online
    if (navigator.onLine) {
      // Try online first
      const response = await frappe.call({
        method: 'posawesome.posawesome.api.posapp.get_customer_info',
        args: { customer }
      });

      if (response.message) {
        // Cache the response in IndexedDB
        await CustomersDB.saveCustomerInfo(customer, response.message);
        return response.message;
      }
    }

    // If offline or online request failed, try to get from IndexedDB
    const offlineData = await CustomersDB.getCustomerInfo(customer);
    if (offlineData) {
      return offlineData;
    }

    // If no data found, return default structure
    return {
      loyalty_points: null,
      conversion_factor: null,
      email_id: null,
      mobile_no: null,
      image: null,
      loyalty_program: null,
      customer_price_list: null,
      customer_group: null,
      customer_type: null,
      territory: null,
      birthday: null,
      gender: null,
      tax_id: null,
      posa_discount: null,
      name: customer,
      customer_name: null,
      address_line1: null,
      city: null,
      country: null
    };

  } catch (error) {
    console.error('Error getting customer info:', error);
    throw error;
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
  if (!isOnline) {
    console.log('Still offline, cannot process queue');
    return;
  }
  
  console.log('Processing offline queue...');
  const pendingInvoices = await InvoicesDB.getPendingInvoices();
  
  for (const invoice of pendingInvoices) {
    try {
      console.log('Processing invoice:', invoice);
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
      console.error('Failed to sync invoice:', error);
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
    
    // Get customers using Frappe API
    const customers = await frappe.db.get_list('Customer', {
      fields: ['name', 'customer_name'],
      limit: 0
    });
    if (customers) {
      await CustomersDB.saveCustomers(customers);
    }
    
    // Get price lists using Frappe API
    const priceLists = await frappe.db.get_list('Price List', {
      fields: ['name', 'currency'],
      filters: [['enabled', '=', 1]],
      limit: 0
    });
    if (priceLists) {
      await PriceListsDB.savePriceLists(priceLists);
    }
    
    // Get tax rules using Frappe API
    const taxTemplates = await frappe.db.get_list('Sales Taxes and Charges Template', {
      fields: ['name', 'tax_category'],
      filters: [['disabled', '=', 0]],
      limit: 0
    });
    if (taxTemplates) {
      await TaxRulesDB.saveTaxRules(taxTemplates);
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