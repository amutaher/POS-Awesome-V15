import Dexie from 'dexie';

// Create Dexie database
const db = new Dexie('PosAwesomeDB');

// Define schema
db.version(1).stores({
  items: 'item_code, item_name, idx',
  customers: 'name, customer_name, email_id, mobile_no, tax_id, loyalty_program, customer_group, territory, customer_type, gender, posa_birthday, posa_discount, address_line1, city, country',
  invoices: '++id, name, createdAt, status, sync_status, last_sync_attempt, retry_count, error_log, reference_id',
  priceLists: 'name, currency',
  taxRules: 'name',
  pos_profile: 'name, pos_profile_name, company, warehouse'
});

// Items operations
export const ItemsDB = {
  async saveItems(items) {
    return db.items.bulkPut(items);
  },
  async getItems() {
    return db.items.toArray();
  },
  async searchItems(query) {
    return db.items
      .filter(item => 
        item.item_name.toLowerCase().includes(query.toLowerCase()) || 
        item.item_code.toLowerCase().includes(query.toLowerCase())
      )
      .limit(20)
      .toArray();
  },
  async getItem(item_code) {
    return db.items.get(item_code);
  }
};

// Customers operations
export const CustomersDB = {
  async saveCustomers(customers) {
    return db.customers.bulkPut(customers);
  },
  async getCustomers() {
    return db.customers.toArray();
  },
  async searchCustomers(query) {
    return db.customers
      .filter(customer => 
        customer.customer_name.toLowerCase().includes(query.toLowerCase())
      )
      .limit(20)
      .toArray();
  },
  async getCustomerInfo(customer) {
    try {
      const customerData = await db.customers.get(customer);
      if (customerData) {
        return {
          email_id: customerData.email_id,
          mobile_no: customerData.mobile_no,
          image: customerData.image,
          loyalty_program: customerData.loyalty_program,
          customer_price_list: customerData.default_price_list,
          customer_group: customerData.customer_group,
          customer_type: customerData.customer_type,
          territory: customerData.territory,
          birthday: customerData.posa_birthday,
          gender: customerData.gender,
          tax_id: customerData.tax_id,
          posa_discount: customerData.posa_discount,
          name: customerData.name,
          customer_name: customerData.customer_name,
          address_line1: customerData.address_line1,
          city: customerData.city,
          country: customerData.country,
          loyalty_points: customerData.loyalty_points || 0,
          conversion_factor: customerData.conversion_factor || 0
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting customer info from IndexedDB:', error);
      return null;
    }
  },
  async saveCustomerInfo(customer, info) {
    try {
      await db.customers.put({
        name: customer,
        ...info
      });
    } catch (error) {
      console.error('Error saving customer info to IndexedDB:', error);
    }
  }
};

// Invoices operations
export const InvoicesDB = {
  async addInvoice(invoice) {
    const now = new Date().toISOString();
    return db.invoices.add({
      ...invoice,
      createdAt: now,
      status: 'pending',
      sync_status: 'pending',
      last_sync_attempt: null,
      retry_count: 0,
      error_log: [],
      reference_id: invoice.args?.payload?.selected_invoices?.[0]?.name || null
    });
  },
  
  async getPendingInvoices() {
    return db.invoices
      .where('status')
      .anyOf(['pending', 'failed'])
      .and(item => item.retry_count < 5)
      .toArray();
  },
  
  async updateInvoiceStatus(id, status, response = null, retryCount = null, error = null) {
    const invoice = await db.invoices.get(id);
    if (!invoice) return;

    const now = new Date().toISOString();
    const update = {
      status,
      last_sync_attempt: now
    };

    // Update retry count if provided
    if (retryCount !== null) {
      update.retry_count = retryCount;
    }

    // Update sync status based on the status
    switch (status) {
      case 'synced':
        update.sync_status = 'success';
        break;
      case 'failed':
        update.sync_status = 'failed';
        // Add error to error log
        if (error) {
          const errorLog = invoice.error_log || [];
          errorLog.push({
            timestamp: now,
            error: error.message || error,
            retry_count: retryCount
          });
          update.error_log = errorLog;
        }
        break;
      case 'max_retries_reached':
        update.sync_status = 'max_retries';
        break;
    }

    // Add server response if available
    if (response) {
      update.server_response = response;
    }

    return db.invoices.update(id, update);
  },

  async getDuplicateInvoice(reference_id) {
    if (!reference_id) return null;
    
    return db.invoices
      .where('reference_id')
      .equals(reference_id)
      .and(item => item.sync_status === 'success')
      .first();
  },

  async getSyncStats() {
    const stats = {
      pending: 0,
      success: 0,
      failed: 0,
      max_retries: 0
    };

    const invoices = await db.invoices.toArray();
    invoices.forEach(invoice => {
      stats[invoice.sync_status] = (stats[invoice.sync_status] || 0) + 1;
    });

    return stats;
  },

  async clearSyncedInvoices(daysToKeep = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    return db.invoices
      .where('sync_status')
      .equals('success')
      .and(item => new Date(item.last_sync_attempt) < cutoffDate)
      .delete();
  }
};

// Price Lists operations
export const PriceListsDB = {
  async savePriceLists(priceLists) {
    return db.priceLists.bulkPut(priceLists);
  },
  async getPriceLists() {
    return db.priceLists.toArray();
  }
};

// Tax Rules operations
export const TaxRulesDB = {
  async saveTaxRules(taxRules) {
    return db.taxRules.bulkPut(taxRules);
  },
  async getTaxRules() {
    return db.taxRules.toArray();
  }
};

// POS Profile operations
export const PosProfileDB = {
  async savePosProfile(profile) {
    return db.pos_profile.put({
      name: profile.name,
      pos_profile_name: profile.pos_profile_name,
      company: profile.company,
      warehouse: profile.warehouse,
      ...profile
    });
  },
  async getPosProfile() {
    return db.pos_profile.toArray();
  },
  async getCurrentProfile() {
    const profiles = await db.pos_profile.toArray();
    return profiles.length > 0 ? profiles[0] : null;
  }
};

export default {
  ItemsDB,
  CustomersDB,
  InvoicesDB,
  PriceListsDB,
  TaxRulesDB,
  PosProfileDB
}; 