import { InvoicesDB, ItemsDB, CustomersDB, PriceListsDB, TaxRulesDB, PosProfileDB } from './db';

// Network status
let isOnline = navigator.onLine;

// Backend ping check with timeout
async function checkBackendConnectivity(timeout = 3000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await frappe.call({
      method: 'posawesome.posawesome.api.posapp.ping',
      args: {},
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response && response.message === 'pong';
  } catch (error) {
    console.log('Backend connectivity check failed:', error);
    return false;
  }
}

// Enhanced online status check
async function isReallyOnline() {
  return navigator.onLine && await checkBackendConnectivity();
}

// Show online/offline status with verification
async function verifyAndUpdateOnlineStatus() {
  const reallyOnline = await isReallyOnline();
  
  if (reallyOnline) {
    isOnline = true;
    frappe.show_alert({
      message: __('Connected to server'),
      indicator: 'green'
    });
    processQueue();
  } else {
    isOnline = false;
    frappe.show_alert({
      message: __('Cannot connect to server. Working offline.'),
      indicator: 'orange'
    });
  }
}

// Enhanced event listeners
window.addEventListener('online', () => {
  verifyAndUpdateOnlineStatus();
});

window.addEventListener('offline', () => {
  isOnline = false;
  frappe.show_alert({
    message: __('Network disconnected. Working offline.'),
    indicator: 'orange'
  });
});

// API wrapper
export async function apiCall(method, args = {}, options = {}) {
  const { isInvoice = false, offlineSupport = false, syncData = false } = options;
  
  // Add POS profile to args if not present
  if (!args.pos_profile && method.includes('get_items')) {
    const currentProfile = await PosProfileDB.getCurrentProfile();
    if (currentProfile) {
      args.pos_profile = JSON.stringify(currentProfile);
    } else {
      throw new Error('POS Profile not found. Please open POS from the desk.');
    }
  }
  
  // If pos_profile exists in args but isn't stringified, stringify it
  if (args.pos_profile && typeof args.pos_profile === 'object') {
    args.pos_profile = JSON.stringify(args.pos_profile);
  }
  
  const reallyOnline = await isReallyOnline();
  
  if (reallyOnline) {
    try {
      console.log('Making API call:', method, 'with args:', args);
      const response = await frappe.call({
        method,
        args
      });

      if (syncData && response.message) {
        await syncToIndexedDB(method, response.message);
      }

      return response;
    } catch (error) {
      console.error('API call failed:', error);
      if (isInvoice) {
        await InvoicesDB.addInvoice({
          method,
          args,
          error: error.message
        });
        return { offline: true, queued: true, message: 'Transaction saved offline' };
      }
      throw error;
    }
  } else if (offlineSupport || isInvoice) {
    if (isInvoice) {
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
    throw new Error('Cannot connect to server and this operation requires connectivity');
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

// Process POS Payment with offline support
export async function processPosPayment(payload) {
  try {
    if (navigator.onLine) {
      // Try online first
      const response = await frappe.call({
        method: "posawesome.posawesome.api.payment_entry.process_pos_payment",
        args: { payload },
        freeze: true,
        freeze_message: __("Processing Payment")
      });
      
      return response;
    } else {
      // Store payment in IndexedDB for later processing
      const payment = {
        method: "posawesome.posawesome.api.payment_entry.process_pos_payment",
        args: { payload },
        createdAt: new Date().toISOString(),
        status: 'pending',
        retryCount: 0
      };
      
      const id = await InvoicesDB.addInvoice(payment);
      
      return {
        offline: true,
        queued: true,
        message: __('Payment saved offline. Will process when online.'),
        payment_id: id
      };
    }
  } catch (error) {
    // If online request fails, store for retry
    if (navigator.onLine) {
      const payment = {
        method: "posawesome.posawesome.api.payment_entry.process_pos_payment",
        args: { payload },
        createdAt: new Date().toISOString(),
        status: 'failed',
        error: error.message,
        retryCount: 0
      };
      
      const id = await InvoicesDB.addInvoice(payment);
      
      return {
        offline: false,
        queued: true,
        message: __('Payment failed. Will retry automatically.'),
        payment_id: id,
        error: error.message
      };
    }
    throw error;
  }
}

// Process offline queue with enhanced error handling and deduplication
export async function processQueue() {
  const reallyOnline = await isReallyOnline();
  
  if (!reallyOnline) {
    console.log('Cannot process queue - no server connectivity');
    return;
  }

  const pendingInvoices = await InvoicesDB.getPendingInvoices();
  console.log('Processing queue:', pendingInvoices.length, 'pending items');

  for (const invoice of pendingInvoices) {
    try {
      // Check for duplicates before processing
      const duplicate = await InvoicesDB.getDuplicateInvoice(
        invoice.args?.payload?.selected_invoices?.[0]?.name
      );
      
      if (duplicate) {
        console.log('Skipping duplicate invoice:', invoice.id);
        await InvoicesDB.updateInvoiceStatus(invoice.id, 'synced', {
          message: 'Duplicate invoice already processed',
          reference: duplicate.id
        });
        continue;
      }

      // Make the API call
      const response = await frappe.call({
        method: invoice.method,
        args: invoice.args,
        freeze: false
      });

      if (response.message) {
        await InvoicesDB.updateInvoiceStatus(invoice.id, 'synced', response.message);
        
        // Show success notification
        frappe.show_alert({
          message: __('Payment synced successfully'),
          indicator: 'green'
        });
      }
    } catch (error) {
      console.error('Error processing invoice:', invoice.id, error);
      
      // Increment retry count
      const newRetryCount = (invoice.retry_count || 0) + 1;
      const status = newRetryCount >= 5 ? 'max_retries_reached' : 'failed';
      
      await InvoicesDB.updateInvoiceStatus(
        invoice.id,
        status,
        null,
        newRetryCount,
        error
      );

      // Show error notification
      frappe.show_alert({
        message: __('Error syncing payment. Will retry later.'),
        indicator: 'red'
      });
    }
  }

  // Get sync stats after processing
  const stats = await InvoicesDB.getSyncStats();
  console.log('Sync stats:', stats);

  // Clean up old synced invoices
  await InvoicesDB.clearSyncedInvoices();
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