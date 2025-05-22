<template>
  <div class="offline-banner" v-if="!isOnline">
    <v-alert
      density="compact"
      type="warning"
      variant="tonal"
      border="start"
      closable
      icon="mdi-wifi-off"
    >
      <div class="d-flex align-center">
        <span class="me-2">{{ $t('You are offline. Some features may be limited.') }}</span>
        <v-chip
          v-if="hasPendingInvoices"
          color="warning"
          size="small"
          class="ml-2"
        >
          {{ pendingInvoicesCount }} {{ pendingInvoicesCount === 1 ? $t('pending invoice') : $t('pending invoices') }}
        </v-chip>
      </div>
    </v-alert>
  </div>
</template>

<script>
import networkDetector from '../../services/networkDetector';

export default {
  name: 'OfflineBanner',
  
  data() {
    return {
      isOnline: true,
      unsubscribe: null,
      hasPendingInvoices: false,
      pendingInvoicesCount: 0,
      intervalId: null
    };
  },
  
  mounted() {
    // Initial status
    this.isOnline = networkDetector.checkOnlineStatus();
    
    // Subscribe to network status changes
    this.unsubscribe = networkDetector.onStatusChange(status => {
      this.isOnline = status.isOnline;
      
      if (status.isOnline) {
        // When coming back online, show reconnected message
        this.$emit('online');
      } else {
        // When going offline, show offline mode message
        this.$emit('offline');
      }
    });
    
    // Check for pending invoices periodically
    this.checkPendingInvoices();
    this.intervalId = setInterval(this.checkPendingInvoices, 30000); // Every 30 seconds
    
    // Listen for sync complete events
    window.addEventListener('pos-awesome-sync-complete', this.checkPendingInvoices);
  },
  
  beforeUnmount() {
    // Clean up
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    window.removeEventListener('pos-awesome-sync-complete', this.checkPendingInvoices);
  },
  
  methods: {
    async checkPendingInvoices() {
      try {
        // Only check if offline storage is initialized
        if (!window.offlineStorage || !window.offlineStorage.db) {
          console.log('[OfflineBanner] Offline storage not initialized');
          return;
        }
        
        const pendingInvoices = await window.offlineStorage.getPendingInvoices();
        this.hasPendingInvoices = pendingInvoices && pendingInvoices.length > 0;
        this.pendingInvoicesCount = pendingInvoices ? pendingInvoices.length : 0;
      } catch (error) {
        console.error('[OfflineBanner] Error checking pending invoices:', error);
      }
    }
  }
};
</script>

<style scoped>
.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
}
</style> 