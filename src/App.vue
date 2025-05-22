<template>
  <div id="app">
    <OfflineBanner v-if="!isOnline" />
    <div class="main-content">
      <!-- This will render the actual POS content from Frappe -->
      <slot></slot>
    </div>
    <SyncStatus 
      v-if="showSyncStatus" 
      :pending-count="pendingCount"
      :syncing="isSyncing"
      :conflicts="conflictCount"
      @retry-sync="retrySync"
      @dismiss="showSyncStatus = false"
    />
  </div>
</template>

<script>
import OfflineBanner from '../posawesome/public/js/posapp/components/offline/OfflineBanner.vue';
import SyncStatus from '../posawesome/public/js/posapp/components/offline/SyncStatus.vue';

export default {
  name: 'App',
  components: {
    OfflineBanner,
    SyncStatus
  },
  data() {
    return {
      isOnline: true,
      isSyncing: false,
      pendingCount: 0,
      conflictCount: 0,
      showSyncStatus: false
    }
  },
  mounted() {
    // Check current online status
    this.isOnline = navigator.onLine;
    
    // Listen for online/offline events
    window.addEventListener('online', this.handleOnlineStatus);
    window.addEventListener('offline', this.handleOnlineStatus);
    
    // Listen for sync events
    window.addEventListener('sync-started', this.handleSyncStarted);
    window.addEventListener('sync-completed', this.handleSyncCompleted);
    window.addEventListener('invoice-queued', this.updatePendingCount);
    window.addEventListener('invoice-conflict-detected', this.updateConflictCount);
    
    // Initial counts
    this.updateCounts();
  },
  beforeUnmount() {
    // Clean up event listeners
    window.removeEventListener('online', this.handleOnlineStatus);
    window.removeEventListener('offline', this.handleOnlineStatus);
    window.removeEventListener('sync-started', this.handleSyncStarted);
    window.removeEventListener('sync-completed', this.handleSyncCompleted);
    window.removeEventListener('invoice-queued', this.updatePendingCount);
    window.removeEventListener('invoice-conflict-detected', this.updateConflictCount);
  },
  methods: {
    handleOnlineStatus() {
      this.isOnline = navigator.onLine;
      
      // When coming back online, check for pending invoices
      if (this.isOnline && window.offlineStorage) {
        this.updateCounts();
        if (this.pendingCount > 0) {
          this.showSyncStatus = true;
          window.offlineStorage.triggerSync();
        }
      }
    },
    async updateCounts() {
      if (window.offlineStorage) {
        const pendingInvoices = await window.offlineStorage.getPendingInvoices();
        this.pendingCount = pendingInvoices ? pendingInvoices.length : 0;
        
        const conflicts = await window.offlineStorage.getConflictInvoices();
        this.conflictCount = conflicts ? conflicts.length : 0;
        
        this.showSyncStatus = this.pendingCount > 0 || this.conflictCount > 0;
      }
    },
    handleSyncStarted(event) {
      this.isSyncing = true;
      this.showSyncStatus = true;
      if (event.detail && event.detail.count) {
        this.pendingCount = event.detail.count;
      }
    },
    handleSyncCompleted(event) {
      this.isSyncing = false;
      this.updateCounts();
      
      // Show status for a few seconds after completion
      setTimeout(() => {
        if (!this.pendingCount && !this.conflictCount) {
          this.showSyncStatus = false;
        }
      }, 5000);
    },
    updatePendingCount() {
      this.updateCounts();
    },
    updateConflictCount() {
      this.updateCounts();
    },
    async retrySync() {
      if (window.offlineStorage && this.isOnline) {
        await window.offlineStorage.triggerSync();
      }
    }
  }
}
</script>

<style>
#app {
  font-family: 'Roboto', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  position: relative;
  min-height: 100vh;
}

.main-content {
  padding-top: var(--banner-height, 0);
}
</style> 