import { InvoicesDB } from './db';

// Network status
let isOnline = navigator.onLine;
window.addEventListener('online', () => {
  isOnline = true;
  processQueue();
});
window.addEventListener('offline', () => {
  isOnline = false;
});

// API wrapper
export async function apiCall(method, args = {}, options = {}) {
  const { isInvoice = false, offlineSupport = false } = options;
  
  if (isOnline) {
    try {
      const response = await frappe.call({
        method,
        args
      });
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
      
      // Notify user
      frappe.show_alert({
        message: __('Offline invoice synced successfully'),
        indicator: 'green'
      });
    } catch (error) {
      await InvoicesDB.updateInvoiceStatus(invoice.id, 'error', error.message);
    }
  }
}

export default {
  apiCall,
  processQueue
}; 