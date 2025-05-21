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
    
    <!-- Offline mode indicator -->
    <v-snackbar v-model="offlineModeActive" color="warning" :timeout="-1" fixed bottom>
      <v-row align="center">
        <v-col cols="auto">
          <v-icon left>mdi-wifi-off</v-icon>
        </v-col>
        <v-col>
          {{ offlineStatusMessage }}
        </v-col>
        <v-col cols="auto">
          <v-btn text color="white" @click="offlineModeActive = false">
            Close
          </v-btn>
        </v-col>
      </v-row>
    </v-snackbar>
    
    <!-- Data sync status notification -->
    <v-snackbar v-model="syncStatusVisible" :color="syncStatus.color" :timeout="5000" fixed top>
      {{ syncStatus.message }}
      <template v-slot:action="{ attrs }">
        <v-btn text v-bind="attrs" @click="syncStatusVisible = false">
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script>

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
import OfflineStorage from '../../services/offlineStorage';

export default {
  data: function () {
    return {
      dialog: false,
      pos_profile: '',
      pos_opening_shift: '',
      payment: false,
      offers: false,
      coupons: false,
      
      // Offline mode data
      offlineStorage: null,
      isOnline: navigator.onLine,
      offlineModeActive: false,
      offlineStatusMessage: 'You are working in offline mode. Data will be synced when connection is restored.',
      offlineDataStatus: {
        itemsAvailable: false,
        customersAvailable: false,
        posProfileAvailable: false,
        isReady: false
      },
      
      // Sync status
      syncStatusVisible: false,
      syncStatus: {
        message: '',
        color: 'info'
      }
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
    async initOfflineStorage() {
      try {
        this.offlineStorage = new OfflineStorage('posAwesomeDB', 1);
        await this.offlineStorage.init();
        console.log('Offline storage initialized');
        
        // Check offline data availability
        this.offlineDataStatus = await this.offlineStorage.checkOfflineDataAvailability();
        console.log('Offline data status:', this.offlineDataStatus);
        
        // Handle online/offline status
        this.updateOnlineStatus();
        
        // Listen for sync completion events
        window.addEventListener('pos-awesome-sync-complete', this.handleSyncComplete);
        
        return true;
      } catch (error) {
        console.error('Failed to initialize offline storage:', error);
        return false;
      }
    },
    
    updateOnlineStatus() {
      this.isOnline = navigator.onLine;
      
      if (!this.isOnline) {
        this.offlineModeActive = true;
        if (this.offlineDataStatus.isReady) {
          this.offlineStatusMessage = 'You are working in offline mode. Data will be synced when connection is restored.';
        } else {
          this.offlineStatusMessage = 'You are offline and required data is not available offline. Some features may not work.';
        }
      } else {
        // If we're coming back online, trigger a sync
        if (this.offlineStorage) {
          this.showSyncStatus('Syncing data with server...', 'info');
          this.offlineStorage.triggerSync();
        }
      }
    },
    
    handleSyncComplete() {
      this.showSyncStatus('Data synchronized successfully!', 'success');
    },
    
    showSyncStatus(message, color) {
      this.syncStatus.message = message;
      this.syncStatus.color = color;
      this.syncStatusVisible = true;
    },
    
    // Cache API data for offline use
    async cacheItemsForOffline() {
      if (!this.offlineStorage || !this.isOnline) return;
      
      try {
        const response = await frappe.call('posawesome.posawesome.api.posapp.get_items', {
          pos_profile: this.pos_profile.name,
        });
        
        if (response.message && response.message.items) {
          await this.offlineStorage.cacheItems(response.message.items);
          console.log(`Cached ${response.message.items.length} items for offline use`);
          
          // Update offline data status
          this.offlineDataStatus = await this.offlineStorage.checkOfflineDataAvailability();
        }
      } catch (error) {
        console.error('Error caching items for offline:', error);
      }
    },
    
    async cacheCustomersForOffline() {
      if (!this.offlineStorage || !this.isOnline) return;
      
      try {
        const response = await frappe.call('posawesome.posawesome.api.posapp.get_customers');
        
        if (response.message && response.message.customers) {
          await this.offlineStorage.cacheCustomers(response.message.customers);
          console.log(`Cached ${response.message.customers.length} customers for offline use`);
          
          // Update offline data status
          this.offlineDataStatus = await this.offlineStorage.checkOfflineDataAvailability();
        }
      } catch (error) {
        console.error('Error caching customers for offline:', error);
      }
    },
    
    check_opening_entry() {
      if (!this.isOnline && this.offlineDataStatus.posProfileAvailable) {
        // Use offline data
        return this.offlineStorage.getAllData('posProfile')
          .then(profiles => {
            if (profiles && profiles.length > 0) {
              this.pos_profile = profiles[0];
              this.eventBus.emit('register_pos_profile', {
                pos_profile: profiles[0],
                pos_opening_shift: 'offline-shift'
              });
              this.eventBus.emit('set_company', profiles[0].company);
            } else {
              this.create_opening_voucher();
            }
          });
      }
      
      // Online mode - use normal API
      return frappe
        .call('posawesome.posawesome.api.posapp.check_opening_shift', {
          user: frappe.session.user,
        })
        .then((r) => {
          if (r.message) {
            this.pos_profile = r.message.pos_profile;
            this.pos_opening_shift = r.message.pos_opening_shift;
            this.get_offers(this.pos_profile.name);
            this.eventBus.emit('register_pos_profile', r.message);
            this.eventBus.emit('set_company', r.message.company);
            frappe.realtime.emit('pos_profile_registered');
            console.info('LoadPosProfile');
            
            // Cache POS profile for offline use
            if (this.offlineStorage) {
              this.offlineStorage.cachePosProfile(r.message.pos_profile);
              
              // Cache items and customers for offline use
              this.cacheItemsForOffline();
              this.cacheCustomersForOffline();
            }
          } else {
            this.create_opening_voucher();
          }
        });
    },
    
    create_opening_voucher() {
      if (!this.isOnline) {
        this.showSyncStatus('Cannot create opening voucher in offline mode', 'error');
        return;
      }
      this.dialog = true;
    },
    
    get_closing_data() {
      if (!this.isOnline) {
        this.showSyncStatus('Cannot close POS in offline mode', 'error');
        return Promise.resolve();
      }
      
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
      if (!this.isOnline) {
        this.showSyncStatus('Cannot submit closing shift in offline mode', 'error');
        return;
      }
      
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
      if (!this.isOnline) {
        return Promise.resolve();
      }
      
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
      if (!this.isOnline) {
        return;
      }
      
      frappe.db.get_doc('POS Settings', undefined).then((doc) => {
        this.eventBus.emit('set_pos_settings', doc);
      });
    },
  },

  mounted: async function () {
    // Initialize offline storage
    await this.initOfflineStorage();
    
    // Setup online/offline event listeners
    window.addEventListener('online', this.updateOnlineStatus);
    window.addEventListener('offline', this.updateOnlineStatus);
    
    this.$nextTick(function () {
      // Ensure event bus is properly initialized
      if (!this.eventBus) {
        console.error('Event bus not initialized in Pos.vue');
        return;
      }

      this.check_opening_entry();
      this.get_pos_setting();
      
      // Add error handling for event listeners
      const safeEmit = (event, data) => {
        try {
          if (this.eventBus && typeof this.eventBus.emit === 'function') {
            this.eventBus.emit(event, data);
          } else {
            console.error(`Event bus not properly initialized for event: ${event}`);
          }
        } catch (error) {
          console.error(`Error emitting event ${event}:`, error);
        }
      };

      this.eventBus.on('close_opening_dialog', () => {
        this.dialog = false;
      });
      
      this.eventBus.on('register_pos_data', (data) => {
        if (!data) {
          console.error('Invalid data received in register_pos_data event');
          return;
        }
        this.pos_profile = data.pos_profile;
        this.get_offers(this.pos_profile.name);
        this.pos_opening_shift = data.pos_opening_shift;
        safeEmit('register_pos_profile', data);
        console.info('LoadPosProfile');
        
        // Cache POS profile for offline use
        if (this.offlineStorage && this.isOnline) {
          this.offlineStorage.cachePosProfile(data.pos_profile);
          
          // Cache items and customers for offline use
          this.cacheItemsForOffline();
          this.cacheCustomersForOffline();
        }
      });
      
      this.eventBus.on('show_payment', (data) => {
        try {
          this.payment = data === 'true';
          this.offers = false;
          this.coupons = false;
        } catch (error) {
          console.error('Error handling show_payment event:', error);
        }
      });
      
      this.eventBus.on('show_offers', (data) => {
        this.offers = true ? data === 'true' : false;
        this.payment = false ? data === 'true' : false;
        this.coupons = false ? data === 'true' : false;
      });
      
      this.eventBus.on('show_coupons', (data) => {
        this.coupons = true ? data === 'true' : false;
        this.offers = false ? data === 'true' : false;
        this.payment = false ? data === 'true' : false;
      });
      
      this.eventBus.on('open_closing_dialog', () => {
        this.get_closing_data();
      });
      
      this.eventBus.on('submit_closing_pos', (data) => {
        this.submit_closing_pos(data);
      });
      
      // New event for offline invoice handling
      this.eventBus.on('queue_invoice_for_sync', (invoice) => {
        if (this.offlineStorage) {
          this.offlineStorage.queuePendingInvoice({
            invoice_data: invoice,
            created_at: new Date().toISOString()
          }).then(id => {
            this.showSyncStatus('Invoice saved for later sync', 'success');
            this.eventBus.emit('invoice_queued', id);
          }).catch(err => {
            console.error('Error queueing invoice:', err);
            this.showSyncStatus('Failed to save invoice for later sync', 'error');
          });
        }
      });
    });
  },
  
  beforeUnmount() {
    // Clean up event listeners
    window.removeEventListener('online', this.updateOnlineStatus);
    window.removeEventListener('offline', this.updateOnlineStatus);
    window.removeEventListener('pos-awesome-sync-complete', this.handleSyncComplete);
    
    this.eventBus.off('close_opening_dialog');
    this.eventBus.off('register_pos_data');
    this.eventBus.off('LoadPosProfile');
    this.eventBus.off('show_offers');
    this.eventBus.off('show_coupons');
    this.eventBus.off('open_closing_dialog');
    this.eventBus.off('submit_closing_pos');
    this.eventBus.off('queue_invoice_for_sync');
    
    // Cleanup offline storage
    if (this.offlineStorage) {
      this.offlineStorage.destroy();
      this.offlineStorage = null;
    }
  },
};
</script>

<style scoped></style>
