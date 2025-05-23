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
      offlineStorage: null,
      bootstrapRequired: false,
      bootstrapComplete: false,
      bootstrapSkipped: false
    };
  },
  components: {
    Navbar,
    POS,
    Payments,
    BootstrapDialog,
    DBMigrationDialog
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
      if (this.syncingInProgress) return;
      
      this.syncingInProgress = true;
      
      try {
        if (this.offlineStorage) {
          await this.offlineStorage.manualSync();
          this.syncSnackbar = true;
          this.syncMessage = 'Manual sync completed successfully';
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
      this.checkNetworkStatus();
      this.setupPWAInstall();
      
      // Setup database event listeners before initializing offlineStorage
      this.setupDBEventListeners();
      
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
    // Remove event listeners
    window.removeEventListener('pos-awesome-sync-started', this.handleSyncStarted);
    window.removeEventListener('pos-awesome-sync-complete', this.handleSyncCompleted);
    window.removeEventListener('pos-awesome-enable-manual-sync', this.enableManualSync);
    
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
