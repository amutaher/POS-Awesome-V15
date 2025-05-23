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
            :disabled="!canSync"
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
      
      <!-- Connection quality warning -->
      <v-snackbar
        v-model="poorConnectionSnackbar"
        color="info"
        :timeout="5000"
        fixed
        bottom
      >
        Slow network connection detected. Some operations may be delayed.
        <template v-slot:action="{ attrs }">
          <v-btn
            color="white"
            text
            v-bind="attrs"
            @click="poorConnectionSnackbar = false"
          >
            OK
          </v-btn>
        </template>
      </v-snackbar>
      
      <!-- Data Bootstrap Dialog -->
      <BootstrapDialog ref="bootstrapDialog"></BootstrapDialog>
      
      <!-- Database Migration Dialog -->
      <DBMigrationDialog ref="dbMigrationDialog"></DBMigrationDialog>
      
      <component v-bind:is="page" class="mx-4 md-4" v-if="!bootstrapRequired || bootstrapSkipped"></component>
      <v-card v-else class="mx-4 md-4 pa-5 text-center">
        <v-card-title class="justify-center">Offline Data Not Ready</v-card-title>
        <v-card-text>
          <p>To use the POS system, you need to bootstrap offline data first.</p>
          <v-btn 
            color="primary" 
            class="mt-3" 
            @click="openBootstrapDialog">
            Start Data Bootstrap
          </v-btn>
        </v-card-text>
      </v-card>
    </v-main>
  </v-app>
</template>

<script>
import Navbar from './components/Navbar.vue';
import POS from './components/pos/Pos.vue';
import Payments from './components/payments/Pay.vue';
import BootstrapDialog from './components/bootstrap/BootstrapDialog.vue';
import DBMigrationDialog from './components/bootstrap/DBMigrationDialog.vue';
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
      poorConnectionSnackbar: false,
      offlineStorage: null,
      bootstrapRequired: false,
      bootstrapComplete: false,
      bootstrapSkipped: false,
      lastNetworkEvent: null,
      networkCheckInterval: null
    };
  },
  components: {
    Navbar,
    POS,
    Payments,
    BootstrapDialog,
    DBMigrationDialog
  },
  computed: {
    /**
     * Check if sync operation can be performed
     */
    canSync() {
      return navigator.onLine && !this.syncingInProgress;
    }
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
    
    /**
     * Set up network status checking
     */
    setupNetworkChecking() {
      // Check initial network status
      this.checkNetworkStatus();
      
      // Set up event listeners for network status changes
      window.addEventListener('online', this.handleNavigatorOnline);
      window.addEventListener('offline', this.handleNavigatorOffline);
      
      // Listen for network status events from OfflineStorage
      window.addEventListener('pos-awesome-network-change', this.handleNetworkChange);
      
      // Listen for sync events
      window.addEventListener('pos-awesome-sync-started', this.handleSyncStarted);
      window.addEventListener('pos-awesome-sync-complete', this.handleSyncCompleted);
      window.addEventListener('pos-awesome-enable-manual-sync', this.enableManualSync);
      
      // Check connection quality if the API is available
      if (navigator.connection) {
        navigator.connection.addEventListener('change', this.handleConnectionChange);
      }
      
      // Also check network status when document visibility changes
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      
      // Set up a periodic check as a fallback
      this.networkCheckInterval = setInterval(() => {
        this.checkNetworkStatus();
      }, 60000); // Check every minute
    },
    
    /**
     * Check and update network status
     */
    checkNetworkStatus() {
      const isOnline = navigator.onLine;
      console.log(`[Home] Checking network status: ${isOnline ? 'Online' : 'Offline'}`);
      
      // Update UI based on current network status
      this.offlineSnackbar = !isOnline;
      
      // If we're online but recently came online, attempt a sync
      if (isOnline && this.lastNetworkEvent === 'offline') {
        console.log('[Home] Recently came online, attempting sync');
        this.attemptSync();
      }
      
      // Update last network event
      this.lastNetworkEvent = isOnline ? 'online' : 'offline';
      
      return isOnline;
    },
    
    /**
     * Handle navigator online event
     */
    handleNavigatorOnline() {
      console.log('[Home] Navigator reports online');
      this.checkNetworkStatus();
    },
    
    /**
     * Handle navigator offline event
     */
    handleNavigatorOffline() {
      console.log('[Home] Navigator reports offline');
      this.checkNetworkStatus();
    },
    
    /**
     * Handle network change event from OfflineStorage
     */
    handleNetworkChange(event) {
      const { isOnline, timestamp } = event.detail;
      console.log(`[Home] Network change event: ${isOnline ? 'Online' : 'Offline'}`);
      
      // Update UI based on network status
      this.offlineSnackbar = !isOnline;
      
      // Update last network event
      this.lastNetworkEvent = isOnline ? 'online' : 'offline';
      
      // If we came back online, attempt a sync
      if (isOnline && this.offlineStorage) {
        this.attemptSync();
      }
    },
    
    /**
     * Handle connection quality changes
     */
    handleConnectionChange() {
      if (!navigator.connection) return;
      
      const effectiveType = navigator.connection.effectiveType; // 2g, 3g, 4g
      const saveData = navigator.connection.saveData;
      
      console.log(`[Home] Connection quality change: ${effectiveType}`);
      
      // Show warning for poor connections
      if (effectiveType === '2g' || effectiveType === 'slow-2g') {
        this.poorConnectionSnackbar = true;
      }
    },
    
    /**
     * Handle document visibility change
     */
    handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        console.log('[Home] Document became visible, checking network status');
        this.checkNetworkStatus();
      }
    },
    
    /**
     * Attempt to sync with server if online
     */
    attemptSync() {
      if (!this.offlineStorage || !navigator.onLine || this.syncingInProgress) {
        return;
      }
      
      console.log('[Home] Attempting automatic sync');
      this.offlineStorage.triggerSync()
        .then(result => {
          console.log('[Home] Auto-sync initiated:', result);
        })
        .catch(error => {
          console.error('[Home] Auto-sync error:', error);
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
        
        // Set up network checking
        this.setupNetworkChecking();
        
        // Check if bootstrap is required
        await this.checkBootstrapRequired();
        
        if (this.bootstrapRequired && !this.bootstrapSkipped) {
          // Open the bootstrap dialog automatically if required
          this.$nextTick(() => {
            this.openBootstrapDialog();
          });
        }
        
        // Tell components bootstrap is available
        this.eventBus.emit('bootstrap_dialog_ready');
      } catch (error) {
        console.error('Error setting up offline support:', error);
      }
    },
    
    async checkBootstrapRequired() {
      try {
        // Check if data is already bootstrapped from localStorage first (fastest)
        const localBootstrapStatus = localStorage.getItem('posa_bootstrap_completed');
        
        if (localBootstrapStatus === 'true') {
          // Fast path - localStorage says we're bootstrapped
          this.bootstrapRequired = false;
          this.bootstrapComplete = true;
          return;
        }
        
        // Check from IndexedDB if data is available
        if (this.offlineStorage) {
          const status = await this.offlineStorage.getData('settings', 'bootstrapCompleted');
          
          if (status && status.value === true) {
            // Data is available in IndexedDB
            this.bootstrapRequired = false;
            this.bootstrapComplete = true;
            localStorage.setItem('posa_bootstrap_completed', 'true');
            return;
          }
        }
        
        // If we reach here, bootstrap is required
        this.bootstrapRequired = true;
        this.bootstrapComplete = false;
      } catch (error) {
        console.error('Error checking bootstrap status:', error);
        // Default to requiring bootstrap if we can't determine status
        this.bootstrapRequired = true;
      }
    },
    
    openBootstrapDialog() {
      if (this.$refs.bootstrapDialog) {
        this.$refs.bootstrapDialog.open();
      }
    },
    
    handleSyncStarted() {
      this.syncingInProgress = true;
    },
    
    handleSyncCompleted(event) {
      this.syncingInProgress = false;
      this.syncSnackbar = true;
      this.syncMessage = event.detail?.message || 'Sync completed successfully';
    },
    
    enableManualSync() {
      this.showManualSync = true;
    },
    
    async manualSync() {
      if (this.syncingInProgress || !navigator.onLine) return;
      
      this.syncingInProgress = true;
      
      try {
        if (this.offlineStorage) {
          const result = await this.offlineStorage.manualSync();
          
          if (result.success) {
            this.syncSnackbar = true;
            this.syncMessage = 'Manual sync completed successfully';
          } else {
            if (result.reason === 'offline') {
              this.syncSnackbar = true;
              this.syncMessage = 'Cannot sync while offline';
            } else if (result.reason === 'no-connectivity') {
              this.syncSnackbar = true;
              this.syncMessage = 'No connection to server available';
            } else {
              this.syncSnackbar = true;
              this.syncMessage = `Sync failed: ${result.error || 'Unknown error'}`;
            }
          }
        }
      } catch (error) {
        console.error('Manual sync error:', error);
        this.syncSnackbar = true;
        this.syncMessage = 'Sync failed: ' + (error.message || 'Unknown error');
      } finally {
        this.syncingInProgress = false;
      }
    },
    
    /**
     * Setup database event listeners
     */
    setupDBEventListeners() {
      // Listen for database errors/warnings
      window.addEventListener('pos-awesome-db-error', this.handleDatabaseError);
      window.addEventListener('pos-awesome-db-warning', this.handleDatabaseWarning);
      window.addEventListener('pos-awesome-db-reset-approved', this.handleDatabaseReset);
      window.addEventListener('pos-awesome-db-upgrade-approved', this.handleDatabaseUpgrade);
    },
    
    /**
     * Handle database error event
     */
    handleDatabaseError(event) {
      console.error('Database error:', event.detail.message);
      // The dialog component handles this event directly
    },
    
    /**
     * Handle database warning event
     */
    handleDatabaseWarning(event) {
      console.warn('Database warning:', event.detail.message);
      // The dialog component handles this event directly
    },
    
    /**
     * Handle database reset request
     */
    async handleDatabaseReset() {
      console.log('Database reset approved by user');
      
      try {
        // If we have offlineStorage instance, try to reset through it
        if (this.offlineStorage) {
          // Reset operation would be custom implemented in offlineStorage
          await this.offlineStorage.resetDatabase();
          
          // Signal completion
          window.dispatchEvent(new CustomEvent('pos-awesome-db-reset-complete'));
        } else {
          // Fallback: Try to delete the database directly
          const deleteRequest = indexedDB.deleteDatabase('posAwesomeDB');
          
          deleteRequest.onsuccess = () => {
            console.log('Database deleted successfully');
            window.dispatchEvent(new CustomEvent('pos-awesome-db-reset-complete'));
          };
          
          deleteRequest.onerror = (event) => {
            console.error('Failed to delete database:', event.target.error);
            window.dispatchEvent(new CustomEvent('pos-awesome-db-reset-failed', {
              detail: { error: event.target.error.message }
            }));
          };
        }
      } catch (error) {
        console.error('Error resetting database:', error);
        window.dispatchEvent(new CustomEvent('pos-awesome-db-reset-failed', {
          detail: { error: error.message }
        }));
      }
    },
    
    /**
     * Handle database upgrade request
     */
    async handleDatabaseUpgrade(event) {
      console.log('Database upgrade approved by user');
      
      try {
        // If we have offlineStorage instance, try to handle upgrade
        if (this.offlineStorage && this.offlineStorage.handleUpgrade) {
          await this.offlineStorage.handleUpgrade(event.detail.version);
          
          // Signal completion
          window.dispatchEvent(new CustomEvent('pos-awesome-db-upgrade-complete'));
        } else {
          // If no upgrade method, signal failure
          window.dispatchEvent(new CustomEvent('pos-awesome-db-upgrade-failed', {
            detail: { error: 'No upgrade handler available' }
          }));
        }
      } catch (error) {
        console.error('Error upgrading database:', error);
        window.dispatchEvent(new CustomEvent('pos-awesome-db-upgrade-failed', {
          detail: { error: error.message }
        }));
      }
    },
  },
  
  async mounted() {
    this.$nextTick(async function () {
      this.remove_frappe_nav();
      
      // Setup database event listeners before initializing offlineStorage
      this.setupDBEventListeners();
      
      this.setupPWAInstall();
      
      await this.setupOfflineSupport();
      
      // Setup event listeners for bootstrap dialog
      this.eventBus.on('bootstrap_completed', () => {
        this.bootstrapRequired = false;
        this.bootstrapComplete = true;
        localStorage.setItem('posa_bootstrap_completed', 'true');
      });
      
      this.eventBus.on('bootstrap_skipped', () => {
        this.bootstrapSkipped = true;
      });
      
      this.eventBus.on('open_bootstrap_dialog', () => {
        this.openBootstrapDialog();
      });
    });
  },
  
  beforeUnmount() {
    // Remove network event listeners
    window.removeEventListener('online', this.handleNavigatorOnline);
    window.removeEventListener('offline', this.handleNavigatorOffline);
    window.removeEventListener('pos-awesome-network-change', this.handleNetworkChange);
    window.removeEventListener('pos-awesome-sync-started', this.handleSyncStarted);
    window.removeEventListener('pos-awesome-sync-complete', this.handleSyncCompleted);
    window.removeEventListener('pos-awesome-enable-manual-sync', this.enableManualSync);
    
    // Remove connection quality listener if available
    if (navigator.connection) {
      navigator.connection.removeEventListener('change', this.handleConnectionChange);
    }
    
    // Remove visibility change listener
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    
    // Clear interval if set
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }
    
    // Remove database event listeners
    window.removeEventListener('pos-awesome-db-error', this.handleDatabaseError);
    window.removeEventListener('pos-awesome-db-warning', this.handleDatabaseWarning);
    window.removeEventListener('pos-awesome-db-reset-approved', this.handleDatabaseReset);
    window.removeEventListener('pos-awesome-db-upgrade-approved', this.handleDatabaseUpgrade);
    
    this.eventBus.off('bootstrap_completed');
    this.eventBus.off('bootstrap_skipped');
    this.eventBus.off('open_bootstrap_dialog');
  }
};
</script>

<style>
.container1 {
  max-width: 100%;
  overflow: hidden;
}
</style>
