<template>
  <div fluid class="mt-2">
    <ClosingDialog></ClosingDialog>
    <Drafts></Drafts>
    <SalesOrders></SalesOrders>
    <Returns></Returns>
    <NewAddress></NewAddress>
    <MpesaPayments></MpesaPayments>
    <Variants></Variants>
    <OpeningDialog v-if="dialog" :dialog="dialog"></OpeningDialog>
    <v-row v-show="!dialog">
      <v-col v-show="!payment && !offers && !coupons" xl="5" lg="5" md="5" sm="5" cols="12" class="pos pr-0">
        <ItemsSelector></ItemsSelector>
      </v-col>
      <v-col v-show="offers" xl="5" lg="5" md="5" sm="5" cols="12" class="pos pr-0">
        <PosOffers></PosOffers>
      </v-col>
      <v-col v-show="coupons" xl="5" lg="5" md="5" sm="5" cols="12" class="pos pr-0">
        <PosCoupons></PosCoupons>
      </v-col>
      <v-col v-show="payment" xl="5" lg="5" md="5" sm="5" cols="12" class="pos pr-0">
        <Payments></Payments>
      </v-col>

      <v-col xl="7" lg="7" md="7" sm="7" cols="12" class="pos">
        <Invoice></Invoice>
      </v-col>
    </v-row>
  </div>
</template>

<script>
import api from '../../services/api';
import { ItemsDB, CustomersDB } from '../../services/db';
import { PosProfileDB } from '../../services/db';

import ItemsSelector from './ItemsSelector.vue';
import Invoice from './Invoice.vue';
import OpeningDialog from './OpeningDialog.vue';
import Payments from './Payments.vue';
import PosOffers from './PosOffers.vue';
import PosCoupons from './PosCoupons.vue';
import Drafts from './Drafts.vue';
import SalesOrders from "./SalesOrders.vue";
import ClosingDialog from './ClosingDialog.vue';
import NewAddress from './NewAddress.vue';
import Variants from './Variants.vue';
import Returns from './Returns.vue';
import MpesaPayments from './Mpesa-Payments.vue';

export default {
  name: 'Pos',
  data: function () {
    return {
      dialog: false,
      pos_profile: '',
      pos_opening_shift: '',
      payment: false,
      offers: false,
      coupons: false,
      isOnline: navigator.onLine,
      offlineMode: false,
      syncStatus: 'synced',
      updateInterval: null
    };
  },

  components: {
    ItemsSelector,
    Invoice,
    OpeningDialog,
    Payments,
    Drafts,
    ClosingDialog,

    Returns,
    PosOffers,
    PosCoupons,
    NewAddress,
    Variants,
    MpesaPayments,
    SalesOrders,
  },

  methods: {
    async initializeApp() {
      try {
        // First check opening entry
        await this.check_opening_entry();
        
        // Then try to sync if we have a profile and we're online
        if (this.pos_profile && this.isOnline) {
          const syncResult = await api.initialSync();
          if (!syncResult.success) {
            this.showError(syncResult.message);
          }
        }
      } catch (error) {
        this.showError('Failed to initialize app: ' + error.message);
      }
    },

    setupNetworkListeners() {
      this.isOnline = navigator.onLine;
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.offlineMode = false;
        this.syncOfflineData();
        this.showSuccess('You are back online');
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.offlineMode = true;
        this.showInfo('You are offline. Some features may be limited');
        // Clear any existing update interval
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }
      });
    },

    async searchItems(query) {
      try {
        if (!this.pos_profile) {
          throw new Error('POS Profile not found. Please open POS from the desk.');
        }

        if (this.isOnline) {
          const result = await api.apiCall(
            'posawesome.posawesome.api.posapp.get_items',
            { 
              query,
              pos_profile: JSON.stringify(this.pos_profile)
            },
            { syncData: true }
          );
          return result.message;
        } else {
          return await ItemsDB.searchItems(query);
        }
      } catch (error) {
        this.showError('Failed to search items: ' + error.message);
        return [];
      }
    },
    async searchCustomers(query) {
      try {
        if (!this.pos_profile) {
          throw new Error('POS Profile not found. Please open POS from the desk.');
        }

        if (this.isOnline) {
          // Use Frappe API to search customers
          const result = await frappe.db.get_list('Customer', {
            fields: ['name', 'customer_name'],
            filters: [
              ['customer_name', 'like', '%' + query + '%']
            ],
            limit: 20
          });
          
          if (result) {
            // Save to IndexedDB for offline use
            await CustomersDB.saveCustomers(result);
            return result;
          }
          return [];
        } else {
          return await CustomersDB.searchCustomers(query);
        }
      } catch (error) {
        this.showError('Failed to search customers: ' + error.message);
        return [];
      }
    },
    async submitInvoice(invoice) {
      try {
        // Add offline check
        if (!this.isOnline) {
          console.log('Processing offline invoice:', invoice);
        }

        const result = await api.apiCall(
          'posawesome.posawesome.api.posapp.submit_invoice',
          { invoice },
          { isInvoice: true, offlineSupport: true }
        );

        if (result.offline) {
          this.showInfo(result.message);
          // Store invoice ID for later reference
          if (result.invoice_id) {
            localStorage.setItem('last_offline_invoice_id', result.invoice_id);
          }
          // Store invoice data for offline use
          localStorage.setItem('last_offline_invoice', JSON.stringify(invoice));
          // Emit event to update UI
          this.eventBus.emit('invoice_saved_offline', invoice);
          // Clear current invoice
          this.eventBus.emit('reset_current_invoice');
          return result;
        } else {
          this.showSuccess('Invoice submitted successfully');
          return result;
        }
      } catch (error) {
        console.error('Invoice submission error:', error);
        this.showError('Failed to submit invoice: ' + error.message);
        throw error;
      }
    },
    async processInvoice(invoice, payments) {
      try {
        console.log('Processing invoice with payments:', payments);
        
        // Add payments to invoice
        invoice.payments = payments;
        
        // Handle offline mode
        if (!this.isOnline) {
          console.log('Processing invoice in offline mode');
          // Save invoice locally without making API calls
          const offlineInvoice = {
            ...invoice,
            offline: true,
            created_at: new Date().toISOString(),
            status: 'pending'
          };
          
          // Store in localStorage
          const offlineInvoices = JSON.parse(localStorage.getItem('offline_invoices') || '[]');
          offlineInvoices.push(offlineInvoice);
          localStorage.setItem('offline_invoices', JSON.stringify(offlineInvoices));
          
          // Emit events
          this.eventBus.emit('invoice_saved_offline', offlineInvoice);
          this.eventBus.emit('reset_current_invoice');
          
          return {
            success: true,
            offline: true,
            message: 'Invoice saved offline. Will sync when online.'
          };
        }
        
        // Online mode processing
        const result = await this.submitInvoice(invoice);
        return {
          success: true,
          message: 'Invoice processed successfully'
        };
      } catch (error) {
        console.error('Process invoice error:', error);
        if (!this.isOnline) {
          // If offline, still try to save locally
          return this.processInvoice(invoice, payments);
        }
        return {
          success: false,
          message: error.message
        };
      }
    },
    async update_invoice(invoice_data) {
      try {
        // Skip API call in offline mode
        if (!this.isOnline) {
          return {
            success: true,
            offline: true,
            message: 'Invoice updated offline'
          };
        }

        // Online mode - make API call
        const result = await frappe.call({
          method: 'posawesome.posawesome.api.posapp.update_invoice',
          args: { data: JSON.stringify(invoice_data) }
        });
        return result;
      } catch (error) {
        console.error('Update invoice error:', error);
        if (!this.isOnline) {
          return {
            success: true,
            offline: true,
            message: 'Invoice updated offline'
          };
        }
        throw error;
      }
    },

    async process_invoice(invoice_data) {
      try {
        if (!this.isOnline) {
          // Handle offline mode
          return {
            success: true,
            offline: true,
            message: 'Invoice processed offline'
          };
        }

        // Online mode processing
        const result = await this.update_invoice(invoice_data);
        return result;
      } catch (error) {
        console.error('Process invoice error:', error);
        if (!this.isOnline) {
          return {
            success: true,
            offline: true,
            message: 'Invoice processed offline'
          };
        }
        throw error;
      }
    },

    async show_payment(invoice_data) {
      try {
        console.log('Starting show_payment process');
        console.log('Invoice state before payment:', invoice_data);

        // Basic validations
        if (!invoice_data || !invoice_data.items_count) {
          this.showError('No items in invoice');
          return;
        }

        console.log('Basic validations passed, proceeding to main validation');
        
        // Skip online validations in offline mode
        let isValid = true;
        if (this.isOnline) {
          isValid = await this.validate_invoice(invoice_data);
          console.log('Main validation result:', isValid);
        }
        
        if (!isValid) {
          return;
        }

        // Process based on invoice type
        if (invoice_data.is_return) {
          if (!this.isOnline) {
            this.showError('Return invoices cannot be processed offline');
            return;
          }
          console.log('Processing return invoice');
          // Handle return invoice
          const return_result = await this.process_return(invoice_data);
          if (!return_result.success) {
            this.showError(return_result.message);
            return;
          }
        } else {
          console.log('Processing regular invoice');
          // Generate payments without API calls in offline mode
          let payments;
          if (this.isOnline) {
            payments = await this.generate_payments(invoice_data);
          } else {
            payments = this.generate_offline_payments(invoice_data);
          }
          console.log('Generated payments:', payments);

          // Add payments to invoice data
          invoice_data.payments = payments;

          // Process invoice
          const process_result = await this.processInvoice(invoice_data, payments);
          if (!process_result.success && !process_result.offline) {
            console.log('Failed to process invoice');
            this.showError(process_result.message);
            return;
          }

          if (process_result.offline) {
            this.showInfo('Invoice saved for offline processing');
            // Clear current invoice data
            this.clear_current_invoice();
          } else {
            this.showSuccess('Invoice processed successfully');
          }
        }
      } catch (error) {
        console.error('Show payment error:', error);
        if (!this.isOnline) {
          // If offline, try to save as offline invoice
          const payments = this.generate_offline_payments(invoice_data);
          invoice_data.payments = payments;
          await this.processInvoice(invoice_data, payments);
          this.showInfo('Invoice saved for offline processing');
          this.clear_current_invoice();
        } else {
          this.showError('Failed to process payment: ' + error.message);
        }
      }
    },
    async syncOfflineData() {
      if (!this.isOnline) {
        this.showInfo('Cannot sync while offline');
        return;
      }

      this.syncStatus = 'syncing';
      try {
        await api.processQueue();
        this.syncStatus = 'synced';
        // Clear last offline invoice ID
        localStorage.removeItem('last_offline_invoice_id');
        this.showSuccess('All offline data synced successfully');
      } catch (error) {
        this.syncStatus = 'error';
        this.showError('Failed to sync offline data: ' + error.message);
      }
    },
    showSuccess(message) {
      frappe.show_alert({
        message: __(message),
        indicator: 'green'
      });
    },
    showError(message) {
      frappe.show_alert({
        message: __(message),
        indicator: 'red'
      });
    },
    showInfo(message) {
      frappe.show_alert({
        message: __(message),
        indicator: 'blue'
      });
    },
    async check_opening_entry() {
      try {
        // First try to get offline profile
        if (!this.isOnline) {
          const offlineProfile = await PosProfileDB.getCurrentProfile();
          if (offlineProfile) {
            this.pos_profile = offlineProfile;
            this.eventBus.emit('register_pos_profile', offlineProfile);
            return;
          }
        }

        const result = await frappe.call({
          method: 'posawesome.posawesome.api.posapp.check_opening_shift',
          args: {
            user: frappe.session.user
          }
        });

        if (result.message) {
          // First set the pos_profile and opening shift
          this.pos_profile = result.message.pos_profile;
          this.pos_opening_shift = result.message.pos_opening_shift;
          
          // Emit events only if we have valid data
          if (this.pos_profile) {
            // Clone the profile data before saving to IndexedDB
            const profileToSave = JSON.parse(JSON.stringify({
              name: this.pos_profile.name,
              pos_profile_name: this.pos_profile.name,
              company: this.pos_profile.company,
              currency: this.pos_profile.currency,
              payments: this.pos_profile.payments || []
            }));

            // Save simplified profile for offline use
            try {
              await PosProfileDB.savePosProfile(profileToSave);
            } catch (error) {
              console.warn('Failed to save profile to IndexedDB:', error);
              // Continue execution even if IndexedDB save fails
            }

            // Emit events only once
            this.eventBus.emit('register_pos_data', result.message);
            this.eventBus.emit('set_company', result.message.company);
            
            // Get offers if profile exists
            if (this.pos_profile.name) {
              await this.get_offers(this.pos_profile.name);
            }
          } else {
            this.dialog = true;
          }
        } else {
          this.dialog = true;
        }
      } catch (error) {
        console.error('Error checking opening entry:', error);
        frappe.msgprint({
          title: __('Error'),
          indicator: 'red',
          message: __('Failed to check opening entry: {0}', [error.message])
        });
        this.dialog = true;
      }
    },
    create_opening_voucher() {
      this.dialog = true;
    },
    get_closing_data() {
      return frappe
        .call(
          'posawesome.posawesome.doctype.pos_closing_shift.pos_closing_shift.make_closing_shift_from_opening',
          {
            opening_shift: this.pos_opening_shift,
          }
        )
        .then((r) => {
          if (r.message) {
            this.eventBus.emit('open_ClosingDialog', r.message);
          } else {
            // console.log(r);
          }
        });
    },
    submit_closing_pos(data) {
      frappe
        .call(
          'posawesome.posawesome.doctype.pos_closing_shift.pos_closing_shift.submit_closing_shift',
          {
            closing_shift: data,
          }
        )
        .then((r) => {
          if (r.message) {
            this.eventBus.emit('show_message', {
              title: `POS Shift Closed`,
              color: 'success',
            });
            this.check_opening_entry();
          } else {
            console.log(r);
          }
        });
    },
    get_offers(pos_profile) {
      return frappe
        .call('posawesome.posawesome.api.posapp.get_offers', {
          profile: pos_profile,
        })
        .then((r) => {
          if (r.message) {
            console.info('LoadOffers');
            this.eventBus.emit('set_offers', r.message);
          }
        });
    },
    get_pos_setting() {
      frappe.db.get_doc('POS Settings', undefined).then((doc) => {
        this.eventBus.emit('set_pos_settings', doc);
      });
    },
    // Helper method for offline payments
    generate_offline_payments(invoice_data) {
      return [{
        mode_of_payment: 'Cash',
        amount: invoice_data.grand_total,
        currency: invoice_data.currency || 'INR',
        offline: true
      }];
    },
    // Helper method to clear current invoice
    clear_current_invoice() {
      // Reset invoice related data
      this.eventBus.emit('reset_current_invoice');
      // Any other cleanup needed
    },
    // Override the update_items_details method to handle offline mode
    async update_items_details() {
      if (!this.isOnline) {
        console.log('Skipping items update in offline mode');
        return;
      }
      // Original update logic for online mode
      await this.update_cur_items_details();
    },
  },

  mounted: function () {
    this.$nextTick(function () {
      this.setupNetworkListeners();
      this.initializeApp();
      
      // Only set up interval if online
      if (this.isOnline) {
        this.updateInterval = setInterval(() => {
          if (this.isOnline) {
            this.update_items_details();
          }
        }, 60000); // Update every minute when online
      }
      
      this.check_opening_entry();
      this.get_pos_setting();
      this.eventBus.on('close_opening_dialog', () => {
        this.dialog = false;
      });
      this.eventBus.on('register_pos_data', (data) => {
        this.pos_profile = data.pos_profile;
        this.get_offers(this.pos_profile.name);
        this.pos_opening_shift = data.pos_opening_shift;
        this.eventBus.emit('register_pos_profile', data);
        console.info('LoadPosProfile');
      });
      this.eventBus.on('show_payment', (data) => {
        this.payment = data === 'true';
        this.offers = false;
        this.coupons = false;
      });
      this.eventBus.on('show_offers', (data) => {
        this.offers = data === 'true';
        this.payment = false;
        this.coupons = false;
      });
      this.eventBus.on('show_coupons', (data) => {
        this.coupons = data === 'true';
        this.offers = false;
        this.payment = false;
      });
      this.eventBus.on('open_closing_dialog', () => {
        this.get_closing_data();
      });
      this.eventBus.on('submit_closing_pos', (data) => {
        this.submit_closing_pos(data);
      });
    });
  },
  beforeUnmount() {
    this.eventBus.off('close_opening_dialog');
    this.eventBus.off('register_pos_data');
    this.eventBus.off('LoadPosProfile');
    this.eventBus.off('show_offers');
    this.eventBus.off('show_coupons');
    this.eventBus.off('open_closing_dialog');
    this.eventBus.off('submit_closing_pos');
    
    // Clear interval on unmount
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    // Remove network listeners
    window.removeEventListener('online', this.setupNetworkListeners);
    window.removeEventListener('offline', this.setupNetworkListeners);
  },
};
</script>

<style scoped></style>
