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
  pos_profile: 'name'
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

export default {
  ItemsDB,
  CustomersDB,
  InvoicesDB
}; 