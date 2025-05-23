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
      
      <!-- Auth Error Dialog -->
      <AuthErrorDialog 
        ref="authErrorDialog"
        @auth-error="handleAuthError"
        @auth-restored="handleAuthRestored"
        @dismissed="handleAuthDialogDismissed"
      ></AuthErrorDialog>
      
      <!-- Schema Error Dialog -->
      <SchemaErrorDialog 
        v-if="schemaErrorActive"
        @dismissed="handleSchemaErrorDismissed"
        @retry="handleSchemaErrorRetry"
      ></SchemaErrorDialog>
      
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
import AuthErrorDialog from './components/pos/AuthErrorDialog.vue';
import SchemaErrorDialog from './components/pos/SchemaErrorDialog.vue';
import { 
  registerServiceWorker, 
  initServiceWorkerMessaging, 
  triggerServiceWorkerSync,
  isRunningAsPWA,
  isBackgroundSyncSupported
} from './registerServiceWorker';
import OfflineStorage from './services/offlineStorage';
import apiService from './services/apiService';

export default {
  name: "posawesome-home",
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
      networkCheckInterval: null,
      serviceWorkerRegistration: null,
      appInitialized: false,
      serviceWorkerInitialized: false,
      isPWA: false,
      hasBackgroundSync: false,
      authErrorActive: false,
      schemaErrorActive: false,
      apiInitialized: false
    };
  },
  components: {
    Navbar,
    POS,
    Payments,
    BootstrapDialog,
    DBMigrationDialog,
    AuthErrorDialog,
    SchemaErrorDialog
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
     * Initialize service worker
     */
    async initializeServiceWorker() {
      try {
        console.log('[Home] Initializing service worker...');
        this.serviceWorkerRegistration = await registerServiceWorker();
        
        if (this.serviceWorkerRegistration) {
          console.log('[Home] Service worker registered successfully');
          
          // Initialize service worker messaging
          initServiceWorkerMessaging();
          this.serviceWorkerInitialized = true;
          
          // Add service worker specific event listeners
          this.setupServiceWorkerEventListeners();
          
          // Check if we're running as PWA and have background sync support
          this.isPWA = isRunningAsPWA();
          this.hasBackgroundSync = await isBackgroundSyncSupported();
          
          if (this.isPWA) {
            console.log('[Home] Running as PWA');
          }
          
          if (!this.hasBackgroundSync) {
            console.log('[Home] Background sync not supported, enabling manual sync');
            this.enableManualSync();
          }
        } else {
          console.warn('[Home] Service worker registration failed');
        }
      } catch (error) {
        console.error('[Home] Error initializing service worker:', error);
      }
    },
    
    /**
     * Set up service worker event listeners
     */
    setupServiceWorkerEventListeners() {
      // Listen for sync needed events from the service worker
      window.addEventListener('pos-awesome-sync-needed', this.handleSyncNeeded);
      
      // Listen for service worker sync completed events
      window.addEventListener('pos-awesome-sync-complete', this.handleSyncCompleted);
      
      // Listen for service worker sync failed events
      window.addEventListener('pos-awesome-sync-failed', this.handleSyncFailed);
      
      // Listen for service worker network status events
      window.addEventListener('pos-awesome-sw-network-status', this.handleServiceWorkerNetworkStatus);
      
      // Listen for service worker registration failure
      window.addEventListener('pos-awesome-sw-registration-failed', this.handleServiceWorkerRegistrationFailed);
    },
    
    /**
     * Handle service worker registration failure
     */
    handleServiceWorkerRegistrationFailed(event) {
      console.warn('[Home] Service worker registration failed:', event.detail.error);
      // Even if service worker fails, enable manual sync as fallback
      this.enableManualSync();
    },
    
    /**
     * Handle sync needed event from service worker
     */
    handleSyncNeeded(event) {
      console.log('[Home] Sync needed:', event.detail);
      if (this.offlineStorage && navigator.onLine && !this.syncingInProgress) {
        this.attemptSync();
      }
    },
    
    /**
     * Handle sync failure event from service worker
     */
    handleSyncFailed(event) {
      console.warn('[Home] Sync failed:', event.detail);
      this.syncingInProgress = false;
      this.syncSnackbar = true;
      this.syncMessage = `Sync failed: ${event.detail.error || 'Unknown error'}`;
    },
    
    /**
     * Handle network status events from service worker
     */
    handleServiceWorkerNetworkStatus(event) {
      const { isOnline, timestamp } = event.detail;
      console.log(`[Home] Service worker network status: ${isOnline ? 'Online' : 'Offline'}`);
      
      // Only update if service worker status differs from our current status
      if (isOnline !== navigator.onLine) {
        this.checkNetworkStatus();
      }
    },
    
    /**
     * Set up PWA installation prompts
     */
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
        console.log('[Home] PWA was installed');
      });
    },
    
    /**
     * Trigger PWA installation
     */
    installPWA() {
      // Hide the app provided install promotion
      this.pwaInstallPrompt = false;
      
      if (!this.deferredPrompt) {
        console.log('[Home] No installation prompt available');
        return;
      }
      
      // Show the install prompt
      this.deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('[Home] User accepted the install prompt');
        } else {
          console.log('[Home] User dismissed the install prompt');
        }
        this.deferredPrompt = null;
      });
    },
    
    async setupOfflineSupport() {
      try {
        // Initialize offline storage first
        this.offlineStorage = new OfflineStorage();
        
        // Make it available globally for other components
        window.offlineStorage = this.offlineStorage;
        
        // Wait for the database to be ready
        await this.offlineStorage.ready;
        
        console.log('[Home] Offline storage initialized successfully');
        
        // Set up network checking
        this.setupNetworkChecking();
        
        // Set up auth error listeners
        this.setupAuthErrorListeners();
        
        // Initialize the service worker AFTER storage is ready
        await this.initializeServiceWorker();
        
        // Handle any HANDLE_SYNC messages from service worker
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'HANDLE_SYNC') {
              console.log('[Home] Received HANDLE_SYNC message from service worker');
              if (this.offlineStorage && !this.syncingInProgress) {
                // Process pending invoices and then notify the service worker when done
                this.offlineStorage.processPendingInvoices()
                  .then(results => {
                    if (navigator.serviceWorker.controller) {
                      navigator.serviceWorker.controller.postMessage({
                        type: 'SYNC_COMPLETED',
                        timestamp: Date.now(),
                        results: results
                      });
                    }
                  })
                  .catch(error => {
                    console.error('[Home] Error processing pending invoices:', error);
                    if (navigator.serviceWorker.controller) {
                      navigator.serviceWorker.controller.postMessage({
                        type: 'SYNC_FAILED',
                        timestamp: Date.now(),
                        error: error.message
                      });
                    }
                  });
              }
            }
          });
        }
        
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
        
        // App is now fully initialized
        this.appInitialized = true;
        
        // If we're online, attempt an initial sync
          if (navigator.onLine) {
          setTimeout(() => {
            this.attemptSync();
          }, 5000); // Wait 5 seconds after initialization
        }
      } catch (error) {
        console.error('[Home] Error setting up offline support:', error);
        // Enable manual sync as fallback
        this.enableManualSync();
      }
    },
    
    /**
     * Set up auth error listeners
     */
    setupAuthErrorListeners() {
      // Listen for auth error events
      window.addEventListener('pos-awesome-auth-error', this.handleGlobalAuthError);
      
      // Listen for auth restored events
      window.addEventListener('pos-awesome-auth-restored', this.handleGlobalAuthRestored);
    },
    
    /**
     * Handle global auth error event
     */
    handleGlobalAuthError(event) {
      console.warn('[Home] Global auth error event:', event.detail);
      this.authErrorActive = true;
    },
    
    /**
     * Handle global auth restored event
     */
    handleGlobalAuthRestored(event) {
      console.log('[Home] Global auth restored event:', event.detail);
      this.authErrorActive = false;
      
      // Try a sync after auth is restored
      setTimeout(() => {
        this.attemptSync();
      }, 1000);
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
    
    /**
     * Attempt to sync with server if online
     */
    attemptSync() {
      if (!this.offlineStorage || !navigator.onLine || this.syncingInProgress) {
        return;
      }
      
      // Don't try to sync if we have an active auth error
      if (this.authErrorActive) {
        console.log('[Home] Not syncing due to active auth error');
        return;
      }
      
      console.log('[Home] Attempting automatic sync');
      this.syncingInProgress = true;
      
      // First check if auth is valid before syncing
      this.checkAuthStatus()
        .then(authValid => {
          if (!authValid) {
            console.log('[Home] Not syncing due to invalid auth');
            this.syncingInProgress = false;
            return { success: false, reason: 'auth_invalid' };
          }
          
          // Auth is valid, proceed with sync
          // Try to use service worker sync if available
          if (this.serviceWorkerInitialized && this.serviceWorkerRegistration) {
            return triggerServiceWorkerSync()
              .then(triggered => {
                if (!triggered) {
                  // Fallback to direct sync
                  return this.offlineStorage.manualSync();
                }
                // Sync was triggered via service worker
                return { success: true, serviceWorker: true };
              });
          } else {
            // No service worker, use direct sync
            return this.offlineStorage.manualSync();
          }
        })
        .then(result => {
          console.log('[Home] Auto-sync initiated:', result);
          if (result.reason === 'auth_invalid') {
            // Already handled
            return;
          }
          
          if (!result.serviceWorker) {
            // If we did a direct sync without service worker, we can update UI immediately
            this.syncingInProgress = false;
            if (result.success) {
              this.syncSnackbar = true;
              this.syncMessage = 'Sync completed successfully';
            } else {
              this.syncSnackbar = true;
              this.syncMessage = `Sync failed: ${result.error || result.reason || 'Unknown error'}`;
            }
          }
          // If we used service worker, the sync is still in progress
          // and will be handled by service worker message events
        })
        .catch(error => {
          console.error('[Home] Auto-sync error:', error);
          this.syncingInProgress = false;
          this.syncSnackbar = true;
          this.syncMessage = `Sync failed: ${error.message || 'Unknown error'}`;
        });
    },
    
    /**
     * Check if current authentication is valid
     * @returns {Promise<boolean>} Promise that resolves with auth status
     */
    async checkAuthStatus() {
      try {
        // Make a lightweight API call to check if session is valid
        const response = await fetch('/api/method/frappe.auth.get_logged_user', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        
        if (response.status === 401 || response.status === 403) {
          // Auth error, show login prompt
          this.authErrorActive = true;
          this.$refs.authErrorDialog.handleAuthError({
            detail: {
              message: 'Session expired',
              code: response.status,
              timestamp: new Date().toISOString(),
              loginUrl: '/login'
            }
          });
          return false;
        }
        
        if (!response.ok) {
          console.warn('[Home] Auth check failed:', response.status);
          return false;
        }
        
        const result = await response.json();
        if (!result.message) {
          console.warn('[Home] Auth check: No user found');
          return false;
        }
        
        return true;
      } catch (error) {
        console.warn('[Home] Auth check error:', error);
        return false;
      }
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
    
    /**
     * Handle authentication error from OfflineStorage
     */
    handleAuthError(detail) {
      console.warn('Authentication error:', detail);
      // Optionally disable sync operations or show additional UI indicators
      this.authErrorActive = true;
    },
    
    /**
     * Handle authentication restored event
     */
    handleAuthRestored(detail) {
      console.log('Authentication restored:', detail);
      this.authErrorActive = false;
      // Optionally trigger a sync now that auth is restored
      this.syncAfterAuthRestored();
    },
    
    /**
     * Handle auth dialog dismissed without login
     */
    handleAuthDialogDismissed() {
      console.log('Auth dialog dismissed');
      // User chose to dismiss without logging in
    },
    
    /**
     * Trigger sync after authentication is restored
     */
    syncAfterAuthRestored() {
      // Wait a moment to ensure session is fully established
      setTimeout(() => {
        if (this.offlineStorage) {
          this.syncMessage = 'Syncing after authentication restored...';
          this.syncSnackbar = true;
          this.syncingInProgress = true;
          
          this.offlineStorage.manualSync()
            .then(result => {
              this.syncingInProgress = false;
              this.syncMessage = result.success 
                ? 'Sync completed successfully!' 
                : `Sync failed: ${result.reason || 'unknown error'}`;
              this.syncSnackbar = true;
            })
            .catch(error => {
              this.syncingInProgress = false;
              this.syncMessage = `Sync error: ${error.message || 'unknown error'}`;
              this.syncSnackbar = true;
            });
        }
      }, 1000);
    },

    // Initialize API service
    async initializeApiService() {
      try {
        await apiService.initialize();
        this.apiInitialized = true;
        frappe.show_alert({
          message: __('API service initialized successfully'),
          indicator: 'green'
        }, 3);
      } catch (error) {
        console.error('[Home] API service initialization failed:', error);
        frappe.show_alert({
          message: __('API initialization failed. Some features may not work correctly.'),
          indicator: 'red'
        }, 5);
      }
    },

    // Handle schema validation errors
    handleSchemaError(error) {
      this.schemaErrorActive = true;
      console.warn('[Home] Schema validation error:', error);
    },

    // Handle schema error dismissal
    handleSchemaErrorDismissed() {
      this.schemaErrorActive = false;
    },

    // Handle retrying after schema error
    handleSchemaErrorRetry() {
      this.schemaErrorActive = false;
      // Additional retry logic can be added here
    }
  },
  
  async mounted() {
    this.$nextTick(async function () {
      this.remove_frappe_nav();
      
      // Setup database event listeners before initializing offlineStorage
      this.setupDBEventListeners();
      
      this.setupPWAInstall();
      
      // Initialize offline storage and service worker
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
    
    // Remove service worker event listeners if they were set up
    if (this.serviceWorkerInitialized) {
      window.removeEventListener('pos-awesome-sync-needed', this.handleSyncNeeded);
      window.removeEventListener('pos-awesome-sync-failed', this.handleSyncFailed);
      window.removeEventListener('pos-awesome-sw-network-status', this.handleServiceWorkerNetworkStatus);
      window.removeEventListener('pos-awesome-sw-registration-failed', this.handleServiceWorkerRegistrationFailed);
    }
    
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
  },
  
  created() {
    // Register event listeners
    window.addEventListener('pos-awesome-db-error', this.handleDBError);
    window.addEventListener('pos-awesome-db-migration-needed', this.handleDBMigration);
    window.addEventListener('pos-awesome-schema-error', this.handleSchemaError);
    
    // Check browser capabilities
    this.checkPWACapabilities();
    
    // Initialize API service
    this.initializeApiService();
  }
};
</script>

<style>
.container1 {
  max-width: 100%;
  overflow: hidden;
}
</style>
