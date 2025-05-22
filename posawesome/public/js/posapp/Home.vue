<template>
  <v-app class="container1">
    <v-main>
      <Navbar @changePage="setPage($event)"></Navbar>
      
      <!-- PWA Installation prompt -->
      <v-snackbar
        v-model="pwaInstallPrompt"
        color="primary"
        :timeout="-1"
        fixed
        top
      >
        Install this app for better offline access
        <template v-slot:action="{ attrs }">
          <v-btn
            color="white"
            text
            v-bind="attrs"
            @click="installPWA"
          >
            Install
          </v-btn>
          <v-btn
            color="white"
            text
            v-bind="attrs"
            @click="pwaInstallPrompt = false"
          >
            Later
          </v-btn>
        </template>
      </v-snackbar>
      
      <!-- Offline notification -->
      <v-snackbar
        v-model="offlineSnackbar"
        color="warning"
        :timeout="-1"
        fixed
        bottom
      >
        You are currently offline. Some features may be limited.
        <template v-slot:action="{ attrs }">
          <v-btn
            v-if="showManualSync"
            color="white"
            text
            v-bind="attrs"
            @click="manualSync"
            :loading="syncingInProgress"
          >
            Sync Now
          </v-btn>
          <v-btn
            color="white"
            text
            v-bind="attrs"
            @click="offlineSnackbar = false"
          >
            Close
          </v-btn>
        </template>
      </v-snackbar>
      
      <!-- Sync notification -->
      <v-snackbar
        v-model="syncSnackbar"
        color="success"
        :timeout="3000"
        fixed
        bottom
      >
        {{ syncMessage }}
      </v-snackbar>
      
      <component v-bind:is="page" class="mx-4 md-4"></component>
    </v-main>
  </v-app>
</template>

<script>
import Navbar from './components/Navbar.vue';
import POS from './components/pos/Pos.vue';
import Payments from './components/payments/Pay.vue';
import { registerServiceWorker } from './registerServiceWorker';
import OfflineStorage from './services/offlineStorage';

export default {
  data: function () {
    return {
      page: 'POS',
      offlineSnackbar: false,
      pwaInstallPrompt: false,
      deferredPrompt: null,
      showManualSync: false,
      syncingInProgress: false,
      syncSnackbar: false,
      syncMessage: '',
      offlineStorage: null
    };
  },
  components: {
    Navbar,
    POS,
    Payments,
  },
  methods: {
    setPage(page) {
      this.page = page;
    },
    remove_frappe_nav() {
      this.$nextTick(function () {
        $('.page-head').remove();
        $('.navbar.navbar-default.navbar-fixed-top').remove();
      });
    },
    checkNetworkStatus() {
      this.offlineSnackbar = !navigator.onLine;
      
      // Setup network status listeners
      window.addEventListener('online', () => {
        this.offlineSnackbar = false;
      });
      
      window.addEventListener('offline', () => {
        this.offlineSnackbar = true;
      });
    },
    
    setupPWAInstall() {
      // Listen for the beforeinstallprompt event
      window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later
        this.deferredPrompt = e;
        // Show the install prompt
        this.pwaInstallPrompt = true;
      });
      
      // Handle installed event
      window.addEventListener('appinstalled', () => {
        // Hide the app-provided install promotion
        this.pwaInstallPrompt = false;
        this.deferredPrompt = null;
        console.log('PWA was installed');
      });
    },
    
    installPWA() {
      // Hide the app provided install promotion
      this.pwaInstallPrompt = false;
      
      if (!this.deferredPrompt) {
        console.log('No installation prompt available');
        return;
      }
      
      // Show the install prompt
      this.deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        this.deferredPrompt = null;
      });
    },
    
    async setupOfflineSupport() {
      try {
        // Register service worker
        await registerServiceWorker();
        
        // Initialize offline storage
        this.offlineStorage = new OfflineStorage();
        
        // Make it available globally for other components
        window.offlineStorage = this.offlineStorage;
        
        // Wait for the database to be ready
        await this.offlineStorage.ready;
        
        console.log('Offline support initialized successfully');
        
        // Listen for sync events
        window.addEventListener('pos-awesome-sync-started', this.handleSyncStarted);
        window.addEventListener('pos-awesome-sync-complete', this.handleSyncCompleted);
        window.addEventListener('pos-awesome-enable-manual-sync', this.enableManualSync);
        
        // Check offline data availability
        const status = await this.offlineStorage.checkOfflineDataAvailability();
        console.log('Offline data status:', status);
        
        if (!status.offlineReady) {
          console.log('Offline data not fully available, attempting to cache essential data');
          // Preload data for offline use if online
          if (navigator.onLine) {
            this.preloadOfflineData();
          }
        }
      } catch (error) {
        console.error('Failed to initialize offline support:', error);
      }
    },
    
    async preloadOfflineData() {
      try {
        // Call your API methods to fetch data
        console.log('Preloading data for offline use');
        
        if (!this.offlineStorage) {
          console.error('Offline storage not initialized');
          return;
        }
        
        // Example API calls to cache data for offline use
        const fetchPosProfile = async () => {
          try {
            const result = await frappe.call({
              method: 'posawesome.posawesome.api.posapp.get_pos_profile',
              freeze: false
            });
            
            if (result.message) {
              await this.offlineStorage.cachePosProfile(result.message);
              console.log('POS profile cached for offline use');
            }
          } catch (error) {
            console.error('Failed to cache POS profile:', error);
          }
        };
        
        const fetchItems = async () => {
          try {
            const result = await frappe.call({
              method: 'posawesome.posawesome.api.posapp.get_items',
              freeze: false
            });
            
            if (result.message && result.message.items) {
              await this.offlineStorage.cacheItems(result.message.items);
              console.log('Items cached for offline use');
            }
          } catch (error) {
            console.error('Failed to cache items:', error);
          }
        };
        
        const fetchCustomers = async () => {
          try {
            const result = await frappe.call({
              method: 'posawesome.posawesome.api.posapp.get_customers',
              freeze: false
            });
            
            if (result.message && result.message.customers) {
              await this.offlineStorage.cacheCustomers(result.message.customers);
              console.log('Customers cached for offline use');
            }
          } catch (error) {
            console.error('Failed to cache customers:', error);
          }
        };
        
        // Execute all fetches in parallel
        await Promise.all([
          fetchPosProfile(),
          fetchItems(),
          fetchCustomers()
        ]);
        
        console.log('Data preloaded for offline use');
      } catch (error) {
        console.error('Failed to preload offline data:', error);
      }
    },
    
    handleSyncStarted() {
      console.log('Sync started');
      this.syncingInProgress = true;
    },
    
    handleSyncCompleted(event) {
      console.log('Sync completed');
      this.syncingInProgress = false;
      this.syncSnackbar = true;
      this.syncMessage = event.detail?.message || 'Sync completed successfully';
    },
    
    enableManualSync() {
      console.log('Manual sync enabled');
      this.showManualSync = true;
    },
    
    async manualSync() {
      if (!this.offlineStorage || this.syncingInProgress) {
        return;
      }
      
      try {
        this.syncingInProgress = true;
        const results = await this.offlineStorage.manualSync();
        console.log('Manual sync results:', results);
        
        this.syncingInProgress = false;
        this.syncSnackbar = true;
        this.syncMessage = 'Manual sync completed successfully';
      } catch (error) {
        console.error('Manual sync failed:', error);
        this.syncingInProgress = false;
        this.syncSnackbar = true;
        this.syncMessage = 'Failed to sync: ' + error.message;
      }
    }
  },
  async mounted() {
    const vm = this;
    
    // Fix for shortcut.js errors - capture global errors
    window.addEventListener('error', function(event) {
      // Check if error is from shortcut.js
      if (event.filename && event.filename.includes('shortcut.js')) {
        console.warn('Prevented shortcut.js error:', event.message);
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    }, true);
    
    this.remove_frappe_nav();
    this.checkNetworkStatus();
    this.setupPWAInstall();
    await this.setupOfflineSupport();
  },
  updated() { },
  created: function () {
    setTimeout(() => {
      this.remove_frappe_nav();
    }, 1000);
  },
  beforeUnmount() {
    // Clean up event listeners
    window.removeEventListener('online', () => {
      this.offlineSnackbar = false;
    });
    
    window.removeEventListener('offline', () => {
      this.offlineSnackbar = true;
    });
    
    window.removeEventListener('beforeinstallprompt', () => {});
    window.removeEventListener('appinstalled', () => {});
    
    // Clean up sync event listeners
    window.removeEventListener('pos-awesome-sync-started', this.handleSyncStarted);
    window.removeEventListener('pos-awesome-sync-complete', this.handleSyncCompleted);
    window.removeEventListener('pos-awesome-enable-manual-sync', this.enableManualSync);
    
    // Clean up offline storage
    if (this.offlineStorage) {
      this.offlineStorage.destroy();
    }
  }
};
</script>

<style scoped>
.container1 {
  margin-top: 0px;
}
</style>
