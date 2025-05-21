<template>
  <div class="sync-status-container">
    <v-snackbar
      v-model="showSyncStarted"
      :timeout="3000"
      color="info"
    >
      <div class="d-flex align-center">
        <v-progress-circular
          indeterminate
          size="20"
          width="2"
          color="white"
          class="mr-2"
        ></v-progress-circular>
        <span>{{ $t('Synchronizing offline data...') }}</span>
      </div>
    </v-snackbar>

    <v-snackbar
      v-model="showSyncCompleted"
      :timeout="5000"
      color="success"
    >
      <div class="d-flex align-center">
        <v-icon class="mr-2">mdi-check-circle</v-icon>
        <span>{{ syncCompletedMessage }}</span>
      </div>
      <template v-slot:actions>
        <v-btn
          variant="text"
          @click="showSyncCompleted = false"
        >
          {{ $t('Close') }}
        </v-btn>
      </template>
    </v-snackbar>

    <v-dialog
      v-model="showFailedInvoicesDialog"
      max-width="500px"
    >
      <v-card>
        <v-card-title class="text-h6">
          {{ $t('Failed Invoices') }}
        </v-card-title>
        <v-card-text>
          <p>{{ $t('The following invoices could not be synchronized:') }}</p>
          <v-list>
            <v-list-item
              v-for="(invoice, index) in failedInvoices"
              :key="index"
            >
              <v-list-item-title>
                {{ $t('Invoice') }} #{{ index + 1 }}
                <v-chip
                  size="small"
                  color="error"
                  class="ml-2"
                >
                  {{ $t('Error') }}
                </v-chip>
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ invoice.error || $t('Unknown error') }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="primary"
            @click="showFailedInvoicesDialog = false"
          >
            {{ $t('Close') }}
          </v-btn>
          <v-btn
            color="warning"
            @click="retryFailedInvoices"
          >
            {{ $t('Retry All') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
export default {
  name: 'SyncStatus',
  
  data() {
    return {
      showSyncStarted: false,
      showSyncCompleted: false,
      showFailedInvoicesDialog: false,
      syncCompletedMessage: '',
      failedInvoices: []
    };
  },
  
  mounted() {
    // Listen for service worker messages
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage);
    }
    
    // Listen for sync complete event
    window.addEventListener('pos-awesome-sync-complete', this.handleSyncComplete);
  },
  
  beforeUnmount() {
    // Clean up
    if (navigator.serviceWorker) {
      navigator.serviceWorker.removeEventListener('message', this.handleServiceWorkerMessage);
    }
    
    window.removeEventListener('pos-awesome-sync-complete', this.handleSyncComplete);
  },
  
  methods: {
    handleServiceWorkerMessage(event) {
      if (event.data) {
        if (event.data.type === 'SYNC_STARTED') {
          this.showSyncStarted = true;
        } else if (event.data.type === 'SYNC_COMPLETE_NOTIFICATION') {
          this.syncCompletedMessage = event.data.message || this.$t('All offline data has been synchronized');
          this.showSyncStarted = false;
          this.showSyncCompleted = true;
          
          // Check for failed invoices
          this.checkFailedInvoices();
        }
      }
    },
    
    handleSyncComplete() {
      this.showSyncStarted = false;
      this.syncCompletedMessage = this.$t('All offline data has been synchronized');
      this.showSyncCompleted = true;
      
      // Check for failed invoices
      this.checkFailedInvoices();
    },
    
    async checkFailedInvoices() {
      if (!window.offlineStorage || !window.offlineStorage.db) {
        console.log('[SyncStatus] Offline storage not initialized');
        return;
      }
      
      try {
        // Get failed invoices
        const failedInvoices = await window.offlineStorage.getDataByIndex('pendingInvoices', 'status', 'failed');
        
        if (failedInvoices && failedInvoices.length > 0) {
          this.failedInvoices = failedInvoices;
          this.showFailedInvoicesDialog = true;
        }
      } catch (error) {
        console.error('[SyncStatus] Error checking failed invoices:', error);
      }
    },
    
    async retryFailedInvoices() {
      if (!window.offlineStorage || !window.offlineStorage.db) {
        console.log('[SyncStatus] Offline storage not initialized');
        return;
      }
      
      try {
        // Reset status to pending for all failed invoices
        for (const invoice of this.failedInvoices) {
          invoice.status = 'pending';
          invoice.sync_attempts = 0;
          await window.offlineStorage.saveData('pendingInvoices', invoice);
        }
        
        // Close dialog
        this.showFailedInvoicesDialog = false;
        
        // Trigger sync
        window.offlineStorage.triggerSync();
        
        // Show sync started
        this.showSyncStarted = true;
      } catch (error) {
        console.error('[SyncStatus] Error retrying failed invoices:', error);
      }
    }
  }
};
</script>

<style scoped>
.sync-status-container {
  /* Component styles here if needed */
}
</style> 