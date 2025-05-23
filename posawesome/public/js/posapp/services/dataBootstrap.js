/**
 * Data Bootstrap Service
 * Handles downloading, validating and storing master data for offline use
 */

export default class DataBootstrap {
  constructor(offlineStorage) {
    this.offlineStorage = offlineStorage;
    this.progress = {
      customers: { total: 0, loaded: 0, status: 'pending' },
      items: { total: 0, loaded: 0, status: 'pending' },
      taxes: { total: 0, loaded: 0, status: 'pending' },
    };
    this.isBootstrapping = false;
    this.isComplete = false;
    this.error = null;
  }

  /**
   * Start the bootstrap process
   * @returns {Promise} Promise that resolves when bootstrap is complete
   */
  async startBootstrap() {
    if (this.isBootstrapping) {
      console.log('[DataBootstrap] Bootstrap process already in progress');
      return;
    }

    this.isBootstrapping = true;
    this.error = null;
    this.isComplete = false;
    
    try {
      // Reset progress
      this.progress = {
        customers: { total: 0, loaded: 0, status: 'pending' },
        items: { total: 0, loaded: 0, status: 'pending' },
        taxes: { total: 0, loaded: 0, status: 'pending' },
      };
      
      // Check if bootstrap is needed by verifying existing data
      const status = await this.checkBootstrapStatus();
      
      if (status.isComplete) {
        console.log('[DataBootstrap] Data already bootstrapped and valid');
        this.isComplete = true;
        this.isBootstrapping = false;
        return true;
      }
      
      // Start with customers as they're typically smaller
      await this.bootstrapCustomers();
      
      // Then taxes
      await this.bootstrapTaxes();
      
      // Finally items which can be larger
      await this.bootstrapItems();
      
      // Mark bootstrap as complete and store the timestamp
      await this.offlineStorage.saveData('settings', {
        key: 'bootstrapCompleted',
        value: true,
        timestamp: new Date().toISOString()
      });
      
      this.isComplete = true;
      console.log('[DataBootstrap] Bootstrap process completed successfully');
      
      return true;
    } catch (error) {
      console.error('[DataBootstrap] Error during bootstrap:', error);
      this.error = error.message || 'Unknown bootstrap error';
      throw error;
    } finally {
      this.isBootstrapping = false;
    }
  }
  
  /**
   * Check if bootstrap has already been completed and data is valid
   */
  async checkBootstrapStatus() {
    try {
      // Check if bootstrap has been completed before
      const bootstrapStatus = await this.offlineStorage.getData('settings', 'bootstrapCompleted');
      
      if (!bootstrapStatus || !bootstrapStatus.value) {
        return { isComplete: false, reason: 'Not bootstrapped yet' };
      }
      
      // Check data counts for validation
      const customersCount = await this.getCollectionCount('customers');
      const itemsCount = await this.getCollectionCount('items');
      const taxesCount = await this.getCollectionCount('taxes');
      
      // If any collection is empty, bootstrap is incomplete
      if (customersCount === 0 || itemsCount === 0 || taxesCount === 0) {
        return { isComplete: false, reason: 'Missing required data' };
      }
      
      return { isComplete: true };
    } catch (error) {
      console.error('[DataBootstrap] Error checking bootstrap status:', error);
      return { isComplete: false, reason: 'Error checking status' };
    }
  }
  
  /**
   * Get count of items in a collection
   * @param {string} storeName - IndexedDB store name
   */
  async getCollectionCount(storeName) {
    try {
      const allData = await this.offlineStorage.getAllData(storeName);
      return allData.length;
    } catch (error) {
      console.error(`[DataBootstrap] Error counting ${storeName}:`, error);
      return 0;
    }
  }
  
  /**
   * Bootstrap customers data
   */
  async bootstrapCustomers() {
    try {
      this.progress.customers.status = 'loading';
      
      // Get total count first to show progress
      const result = await frappe.call({
        method: 'frappe.client.get_count',
        args: {
          doctype: 'Customer',
          filters: {},
        },
      });
      
      this.progress.customers.total = result.message || 0;
      
      // Fetch customers in batches
      let start = 0;
      const pageSize = 250;
      let allCustomers = [];
      
      while (true) {
        const customers = await frappe.call({
          method: 'frappe.client.get_list',
          args: {
            doctype: 'Customer',
            fields: ['name', 'customer_name', 'customer_group', 'territory', 'tax_id', 'mobile_no', 'email_id', 'posa_discount'],
            limit_start: start,
            limit_page_length: pageSize,
          },
        });
        
        if (!customers.message || customers.message.length === 0) {
          break;
        }
        
        // Store this batch
        await this.offlineStorage.saveMultipleData('customers', customers.message);
        
        // Update progress
        this.progress.customers.loaded += customers.message.length;
        allCustomers = allCustomers.concat(customers.message);
        
        // Continue to next batch if we received a full page
        if (customers.message.length < pageSize) {
          break;
        }
        
        start += pageSize;
      }
      
      this.progress.customers.status = 'complete';
      console.log(`[DataBootstrap] ${allCustomers.length} customers bootstrapped`);
      
      return allCustomers;
    } catch (error) {
      this.progress.customers.status = 'error';
      console.error('[DataBootstrap] Error bootstrapping customers:', error);
      throw error;
    }
  }
  
  /**
   * Bootstrap taxes data
   */
  async bootstrapTaxes() {
    try {
      this.progress.taxes.status = 'loading';
      
      // Get all tax templates
      const taxTemplates = await frappe.call({
        method: 'frappe.client.get_list',
        args: {
          doctype: 'Sales Taxes and Charges Template',
          fields: ['name', 'tax_category', 'is_default'],
          limit_page_length: 500,
        },
      });
      
      this.progress.taxes.total = taxTemplates.message ? taxTemplates.message.length : 0;
      let allTaxes = [];
      
      // For each template, get the tax details
      for (const template of taxTemplates.message || []) {
        const taxDetails = await frappe.call({
          method: 'frappe.client.get',
          args: {
            doctype: 'Sales Taxes and Charges Template',
            name: template.name,
          },
        });
        
        if (taxDetails.message) {
          allTaxes.push(taxDetails.message);
          await this.offlineStorage.saveData('taxes', taxDetails.message);
          this.progress.taxes.loaded++;
        }
      }
      
      this.progress.taxes.status = 'complete';
      console.log(`[DataBootstrap] ${allTaxes.length} tax templates bootstrapped`);
      
      return allTaxes;
    } catch (error) {
      this.progress.taxes.status = 'error';
      console.error('[DataBootstrap] Error bootstrapping taxes:', error);
      throw error;
    }
  }
  
  /**
   * Bootstrap items data
   */
  async bootstrapItems() {
    try {
      this.progress.items.status = 'loading';
      
      // Get total count first to show progress
      const result = await frappe.call({
        method: 'frappe.client.get_count',
        args: {
          doctype: 'Item',
          filters: { disabled: 0 },
        },
      });
      
      this.progress.items.total = result.message || 0;
      
      // Fetch items in batches
      let start = 0;
      const pageSize = 100; // Smaller batch size for items as they have more data
      let allItems = [];
      
      while (true) {
        const items = await frappe.call({
          method: 'frappe.client.get_list',
          args: {
            doctype: 'Item',
            fields: ['name', 'item_code', 'item_name', 'item_group', 'description', 'stock_uom', 
                     'standard_rate', 'is_stock_item', 'has_variants', 'variant_of', 'tax_rate'],
            filters: { disabled: 0 },
            limit_start: start,
            limit_page_length: pageSize,
          },
        });
        
        if (!items.message || items.message.length === 0) {
          break;
        }
        
        // For each item, get additional data like prices and taxes
        for (const item of items.message) {
          // Get prices
          const prices = await frappe.call({
            method: 'frappe.client.get_list',
            args: {
              doctype: 'Item Price',
              fields: ['price_list', 'price_list_rate', 'currency'],
              filters: { item_code: item.item_code },
            },
          });
          
          if (prices.message) {
            item.prices = prices.message;
          }
          
          // Get tax template if available
          if (item.tax_rate) {
            const taxTemplate = await this.offlineStorage.getData('taxes', item.tax_rate);
            if (taxTemplate) {
              item.tax_template = taxTemplate;
            }
          }
        }
        
        // Store batch of items
        await this.offlineStorage.saveMultipleData('items', items.message);
        
        // Update progress
        this.progress.items.loaded += items.message.length;
        allItems = allItems.concat(items.message);
        
        // Continue to next batch if we received a full page
        if (items.message.length < pageSize) {
          break;
        }
        
        start += pageSize;
      }
      
      this.progress.items.status = 'complete';
      console.log(`[DataBootstrap] ${allItems.length} items bootstrapped`);
      
      return allItems;
    } catch (error) {
      this.progress.items.status = 'error';
      console.error('[DataBootstrap] Error bootstrapping items:', error);
      throw error;
    }
  }
  
  /**
   * Check if bootstrap process is complete
   */
  isBootstrapComplete() {
    return this.isComplete;
  }
  
  /**
   * Get current bootstrap progress
   */
  getProgress() {
    return {
      customers: this.progress.customers,
      items: this.progress.items,
      taxes: this.progress.taxes,
      isComplete: this.isComplete,
      isBootstrapping: this.isBootstrapping,
      error: this.error
    };
  }
  
  /**
   * Validate data integrity
   */
  async validateDataIntegrity() {
    try {
      const customersCount = await this.getCollectionCount('customers');
      const itemsCount = await this.getCollectionCount('items');
      const taxesCount = await this.getCollectionCount('taxes');
      
      return {
        isValid: customersCount > 0 && itemsCount > 0 && taxesCount > 0,
        counts: {
          customers: customersCount,
          items: itemsCount,
          taxes: taxesCount
        }
      };
    } catch (error) {
      console.error('[DataBootstrap] Error validating data integrity:', error);
      return { isValid: false, error: error.message };
    }
  }
} 