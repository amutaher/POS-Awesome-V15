import Dexie from 'dexie';

// Create Dexie database
const db = new Dexie('PosAwesomeDB');

// Define schema
db.version(1).stores({
  items: 'item_code, item_name, idx',
  customers: 'name, customer_name',
  invoices: '++id, name, createdAt, status',
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
  }
};

// Invoices operations
export const InvoicesDB = {
  async addInvoice(invoice) {
    return db.invoices.add({
      ...invoice,
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
  },
  async getPendingInvoices() {
    return db.invoices.where('status').equals('pending').toArray();
  },
  async updateInvoiceStatus(id, status, serverResponse = null) {
    return db.invoices.update(id, { 
      status, 
      lastSyncAt: new Date().toISOString(),
      serverResponse 
    });
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