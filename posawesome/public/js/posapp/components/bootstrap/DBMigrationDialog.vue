<template>
  <v-dialog v-model="dialog" persistent max-width="600px">
    <v-card>
      <v-card-title class="headline" :class="errorClass">
        <v-icon color="white" class="mr-2">{{ errorIcon }}</v-icon>
        {{ dialogTitle }}
      </v-card-title>
      
      <v-card-text class="pt-4">
        <v-alert v-if="currentError" type="error" class="mb-3" variant="outlined">
          {{ currentError }}
        </v-alert>
        
        <v-alert v-if="currentWarning && !currentError" type="warning" class="mb-3" variant="outlined">
          {{ currentWarning }}
        </v-alert>
        
        <v-alert v-if="recoveryMode" type="info" class="mb-3">
          Your database needs to be upgraded to version {{ currentVersion }}.
          This process will safely migrate your data without losing information.
        </v-alert>
        
        <v-list v-if="errors.length > 0" class="error-list mb-4 pa-0" variant="plain">
          <v-subheader>Errors ({{ errors.length }})</v-subheader>
          <v-list-item v-for="(error, index) in errors" :key="`error-${index}`" density="compact">
            <template v-slot:prepend>
              <v-icon color="error">mdi-alert-circle</v-icon>
            </template>
            <v-list-item-title class="text-body-2">{{ error }}</v-list-item-title>
          </v-list-item>
        </v-list>
        
        <v-list v-if="warnings.length > 0" class="warning-list pa-0" variant="plain">
          <v-subheader>Warnings ({{ warnings.length }})</v-subheader>
          <v-list-item v-for="(warning, index) in warnings" :key="`warning-${index}`" density="compact">
            <template v-slot:prepend>
              <v-icon color="warning">mdi-alert</v-icon>
            </template>
            <v-list-item-title class="text-body-2">{{ warning }}</v-list-item-title>
          </v-list-item>
        </v-list>
        
        <div v-if="pendingInvoices > 0" class="mt-4 text-center">
          <v-chip color="warning" class="mb-2">
            <v-icon start>mdi-clock-alert</v-icon>
            {{ pendingInvoices }} unsynced invoice{{ pendingInvoices !== 1 ? 's' : '' }}
          </v-chip>
          <p>You have unsynchronized invoices that need to be processed before continuing.</p>
        </div>
        
        <v-btn-group v-if="pendingInvoices > 0" class="d-flex justify-center mb-3">
          <v-btn color="primary" prepend-icon="mdi-cloud-sync" @click="syncData" :loading="isSyncing">
            Sync Data Now
          </v-btn>
        </v-btn-group>
      </v-card-text>
      
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          v-if="canReset"
          color="error"
          text
          @click="confirmReset"
          :disabled="pendingInvoices > 0 || isProcessing"
        >
          Reset Database
        </v-btn>
        <v-btn
          v-if="recoveryMode"
          color="primary"
          @click="attemptRecovery" 
          :loading="isProcessing"
          :disabled="pendingInvoices > 0"
        >
          Upgrade Database
        </v-btn>
        <v-btn
          v-else
          color="primary"
          @click="closeDialog"
          :disabled="isProcessing || mustReload"
        >
          {{ mustReload ? 'Reload Required' : 'Close' }}
        </v-btn>
      </v-card-actions>
    </v-card>
    
    <!-- Reset Confirmation Dialog -->
    <v-dialog v-model="resetConfirmDialog" max-width="400px">
      <v-card>
        <v-card-title class="text-h5 bg-error text-white">
          <v-icon color="white" class="mr-2">mdi-database-remove</v-icon>
          Confirm Database Reset
        </v-card-title>
        <v-card-text class="pt-4">
          <p><strong>Warning:</strong> This will delete all local data and reset the database to its initial state.</p>
          <p>You will need to reload all data from the server. This action cannot be undone.</p>
          <p>Are you sure you want to continue?</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" text @click="resetConfirmDialog = false">Cancel</v-btn>
          <v-btn color="error" @click="resetDatabase" :loading="isProcessing">Reset Database</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-dialog>
</template>

<script>
export default {
  data() {
    return {
      dialog: false,
      errors: [],
      warnings: [],
      currentError: null,
      currentWarning: null,
      recoveryMode: false,
      pendingInvoices: 0,
      currentVersion: 0,
      isProcessing: false,
      isSyncing: false,
      mustReload: false,
      canReset: false,
      resetConfirmDialog: false,
      networkCheckInterval: null
    };
  },
  
  computed: {
    dialogTitle() {
      if (this.recoveryMode) {
        return 'Database Upgrade Required';
      }
      if (this.currentError) {
        return 'Database Error';
      }
      if (this.currentWarning) {
        return 'Database Warning';
      }
      return 'Database Status';
    },
    
    errorClass() {
      if (this.recoveryMode) {
        return 'primary white--text';
      }
      if (this.currentError) {
        return 'error white--text';
      }
      if (this.currentWarning) {
        return 'warning white--text';
      }
      return 'primary white--text';
    },
    
    errorIcon() {
      if (this.recoveryMode) {
        return 'mdi-database-sync';
      }
      if (this.currentError) {
        return 'mdi-database-alert';
      }
      if (this.currentWarning) {
        return 'mdi-database';
      }
      return 'mdi-database';
    },
    
    /**
     * Check if sync is possible
     */
    canSync() {
      return navigator.onLine && !this.isSyncing;
    }
  },
  
  mounted() {
    // Listen for database errors and warnings
    window.addEventListener('pos-awesome-db-error', this.handleDatabaseError);
    window.addEventListener('pos-awesome-db-warning', this.handleDatabaseWarning);
    
    // Listen for version error events from indexedDB
    window.addEventListener('pos-awesome-db-version-error', this.handleVersionError);
    
    // Listen for network status changes
    window.addEventListener('online', this.handleNetworkChange);
    window.addEventListener('offline', this.handleNetworkChange);
    window.addEventListener('pos-awesome-network-change', this.handleNetworkStatusEvent);
    
    // Set up periodic network check
    this.networkCheckInterval = setInterval(() => {
      this.checkNetworkStatus();
    }, 30000);
  },
  
  beforeUnmount() {
    // Clean up event listeners
    window.removeEventListener('pos-awesome-db-error', this.handleDatabaseError);
    window.removeEventListener('pos-awesome-db-warning', this.handleDatabaseWarning);
    window.removeEventListener('pos-awesome-db-version-error', this.handleVersionError);
    
    // Clean up network listeners
    window.removeEventListener('online', this.handleNetworkChange);
    window.removeEventListener('offline', this.handleNetworkChange);
    window.removeEventListener('pos-awesome-network-change', this.handleNetworkStatusEvent);
    
    // Clear interval
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }
  },
  
  methods: {
    /**
     * Check current network status
     */
    checkNetworkStatus() {
      const isOnline = navigator.onLine;
      
      // If we're online and have pending sync operations
      if (isOnline && this.pendingInvoices > 0 && this.dialog && !this.isSyncing) {
        // Suggest syncing data
        this.currentWarning = 'Network connection restored. You can now sync your pending invoices.';
        this.currentError = null;
      }
      
      return isOnline;
    },
    
    /**
     * Handle direct network status changes
     */
    handleNetworkChange() {
      this.checkNetworkStatus();
    },
    
    /**
     * Handle network status change event from OfflineStorage
     */
    handleNetworkStatusEvent(event) {
      const { isOnline } = event.detail;
      
      // If we're offline and currently syncing
      if (!isOnline && this.isSyncing) {
        this.isSyncing = false;
        this.currentError = 'Network connection lost during sync. Please try again when online.';
      }
      
      this.checkNetworkStatus();
    },
    
    /**
     * Handle database error events
     */
    handleDatabaseError(event) {
      const { message, type } = event.detail;
      console.error('[DBMigrationDialog] Database error:', message);
      
      this.errors.push(message);
      this.currentError = message;
      this.dialog = true;
      
      // Show as notification if possible
      if (window.frappe && frappe.show_alert) {
        frappe.show_alert({
          message: `Database error: ${message}`,
          indicator: 'red'
        }, 10);
      }
    },
    
    /**
     * Handle database warning events
     */
    handleDatabaseWarning(event) {
      const { message, type } = event.detail;
      console.warn('[DBMigrationDialog] Database warning:', message);
      
      this.warnings.push(message);
      if (!this.currentError) {
        this.currentWarning = message;
        this.dialog = true;
      }
      
      // Show as notification if possible
      if (window.frappe && frappe.show_alert) {
        frappe.show_alert({
          message: `Database warning: ${message}`,
          indicator: 'yellow'
        }, 7);
      }
    },
    
    /**
     * Handle version error events (recovery mode)
     */
    handleVersionError(event) {
      const { version, pendingInvoices } = event.detail;
      console.warn('[DBMigrationDialog] Database version error, recovery needed');
      
      this.recoveryMode = true;
      this.currentVersion = version;
      this.pendingInvoices = pendingInvoices || 0;
      this.canReset = true;
      this.dialog = true;
      
      // Check if we need to show error about pending invoices
      if (this.pendingInvoices > 0) {
        this.currentError = `Cannot upgrade database because there are ${this.pendingInvoices} unsynchronized invoices. Please sync your data first.`;
      } else {
        this.currentWarning = `Your database needs to be upgraded to version ${version}. This process is safe and will preserve your data.`;
      }
    },
    
    /**
     * Close the dialog if not in recovery mode
     */
    closeDialog() {
      if (this.recoveryMode && !this.mustReload) {
        // Can't close if in recovery mode without reload
        return;
      }
      
      if (this.mustReload) {
        window.location.reload();
        return;
      }
      
      this.dialog = false;
    },
    
    /**
     * Attempt to recover/upgrade the database
     */
    async attemptRecovery() {
      if (this.pendingInvoices > 0) {
        this.currentError = 'Please sync pending invoices before upgrading';
        return;
      }
      
      this.isProcessing = true;
      
      try {
        // Signal to the OfflineStorage that we're ready to upgrade
        window.dispatchEvent(new CustomEvent('pos-awesome-db-upgrade-approved', { 
          detail: { version: this.currentVersion }
        }));
        
        // Wait for the result (this should be signaled by another event)
        this.currentWarning = 'Upgrading database...';
        this.currentError = null;
        
        // Add a listener for the upgrade result
        const upgradeComplete = () => {
          return new Promise((resolve) => {
            const handleComplete = (event) => {
              window.removeEventListener('pos-awesome-db-upgrade-complete', handleComplete);
              window.removeEventListener('pos-awesome-db-upgrade-failed', handleFailed);
              resolve({ success: true, ...event.detail });
            };
            
            const handleFailed = (event) => {
              window.removeEventListener('pos-awesome-db-upgrade-complete', handleComplete);
              window.removeEventListener('pos-awesome-db-upgrade-failed', handleFailed);
              resolve({ success: false, error: event.detail.error });
            };
            
            window.addEventListener('pos-awesome-db-upgrade-complete', handleComplete);
            window.addEventListener('pos-awesome-db-upgrade-failed', handleFailed);
            
            // Set a timeout in case the events don't fire
            setTimeout(() => {
              window.removeEventListener('pos-awesome-db-upgrade-complete', handleComplete);
              window.removeEventListener('pos-awesome-db-upgrade-failed', handleFailed);
              resolve({ success: false, error: 'Upgrade timed out' });
            }, 10000);
          });
        };
        
        const result = await upgradeComplete();
        
        if (result.success) {
          // Success
          this.currentWarning = 'Database upgraded successfully. Please reload the application.';
          this.currentError = null;
          this.mustReload = true;
          this.recoveryMode = false;
        } else {
          // Failed
          this.currentError = `Database upgrade failed: ${result.error}`;
          this.currentWarning = null;
        }
      } catch (error) {
        console.error('[DBMigrationDialog] Recovery attempt failed:', error);
        this.currentError = `Recovery failed: ${error.message}`;
      } finally {
        this.isProcessing = false;
      }
    },
    
    /**
     * Confirm database reset
     */
    confirmReset() {
      this.resetConfirmDialog = true;
    },
    
    /**
     * Reset database
     */
    async resetDatabase() {
      this.isProcessing = true;
      
      try {
        // Signal to the OfflineStorage that we want to reset the database
        window.dispatchEvent(new CustomEvent('pos-awesome-db-reset-approved'));
        
        // Wait for result
        const resetComplete = () => {
          return new Promise((resolve) => {
            const handleComplete = (event) => {
              window.removeEventListener('pos-awesome-db-reset-complete', handleComplete);
              window.removeEventListener('pos-awesome-db-reset-failed', handleFailed);
              resolve({ success: true });
            };
            
            const handleFailed = (event) => {
              window.removeEventListener('pos-awesome-db-reset-complete', handleComplete);
              window.removeEventListener('pos-awesome-db-reset-failed', handleFailed);
              resolve({ success: false, error: event.detail.error });
            };
            
            window.addEventListener('pos-awesome-db-reset-complete', handleComplete);
            window.addEventListener('pos-awesome-db-reset-failed', handleFailed);
            
            // Set a timeout in case the events don't fire
            setTimeout(() => {
              window.removeEventListener('pos-awesome-db-reset-complete', handleComplete);
              window.removeEventListener('pos-awesome-db-reset-failed', handleFailed);
              resolve({ success: false, error: 'Reset timed out' });
            }, 10000);
          });
        };
        
        const result = await resetComplete();
        
        this.resetConfirmDialog = false;
        
        if (result.success) {
          // Success
          this.currentWarning = 'Database reset successfully. The application needs to reload.';
          this.currentError = null;
          this.mustReload = true;
          this.recoveryMode = false;
        } else {
          // Failed
          this.currentError = `Database reset failed: ${result.error}`;
          this.currentWarning = null;
        }
      } catch (error) {
        console.error('[DBMigrationDialog] Reset attempt failed:', error);
        this.currentError = `Reset failed: ${error.message}`;
        this.resetConfirmDialog = false;
      } finally {
        this.isProcessing = false;
      }
    },
    
    /**
     * Sync pending data
     */
    async syncData() {
      // Check if we're online
      if (!navigator.onLine) {
        this.currentError = 'Cannot sync while offline. Please check your internet connection.';
        return;
      }
      
      if (!window.offlineStorage) {
        this.currentError = 'Offline storage not initialized';
        return;
      }
      
      this.isSyncing = true;
      
      try {
        // Verify actual connectivity first
        if (window.offlineStorage.testActualConnectivity) {
          const isConnected = await window.offlineStorage.testActualConnectivity();
          if (!isConnected) {
            throw new Error('No connection to server available');
          }
        }
        
        // Use manualSync for better error handling if available
        if (window.offlineStorage.manualSync) {
          const result = await window.offlineStorage.manualSync();
          
          if (!result.success) {
            throw new Error(result.error || result.reason || 'Unknown sync error');
          }
        } else {
          // Fall back to old method if manualSync not implemented
          const result = await window.offlineStorage.processPendingInvoices();
          console.log('[DBMigrationDialog] Sync result:', result);
        }
        
        // Refresh pending invoice count
        const pendingData = await window.offlineStorage.getPendingInvoices();
        this.pendingInvoices = pendingData ? pendingData.length : 0;
        
        if (this.pendingInvoices === 0) {
          this.currentWarning = 'All data synchronized successfully. You can now proceed with the database upgrade.';
          this.currentError = null;
        } else {
          this.currentWarning = `Sync completed with ${this.pendingInvoices} remaining unsynchronized invoices. Please try again.`;
        }
      } catch (error) {
        console.error('[DBMigrationDialog] Sync failed:', error);
        this.currentError = `Sync failed: ${error.message}`;
      } finally {
        this.isSyncing = false;
      }
    },
    
    /**
     * Open the dialog
     */
    open(options = {}) {
      // Reset state
      this.currentError = options.error || null;
      this.currentWarning = options.warning || null;
      this.recoveryMode = options.recoveryMode || false;
      this.pendingInvoices = options.pendingInvoices || 0;
      this.currentVersion = options.version || 0;
      this.canReset = options.canReset !== undefined ? options.canReset : true;
      
      this.dialog = true;
      
      // Check network status immediately
      this.checkNetworkStatus();
    }
  }
};
</script>

<style scoped>
.error-list, .warning-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid rgba(0,0,0,0.12);
  border-radius: 4px;
}
</style> 