<template>
  <!-- Offline indicators -->
  <div>
    <!-- Offline status indicator -->
    <v-chip
      v-if="!isOnline"
      color="error"
      small
      class="mr-2"
    >
      <v-icon left small>mdi-wifi-off</v-icon>
      Offline Mode
    </v-chip>
    
    <!-- Pending transactions indicator -->
    <v-chip
      v-if="pendingCount > 0"
      color="warning"
      small
      class="mr-2"
      @click="showPendingDialog = true"
    >
      <v-icon left small>mdi-sync</v-icon>
      {{ pendingCount }} Pending
    </v-chip>

    <!-- Offline notice banner -->
    <v-alert
      v-if="!isOnline"
      dense
      text
      type="warning"
      class="ma-2"
    >
      You are working offline. Transactions will be synced when you reconnect.
    </v-alert>

    <!-- Pending transactions dialog -->
    <v-dialog v-model="showPendingDialog" max-width="500">
      <v-card>
        <v-card-title>Pending Transactions</v-card-title>
        <v-card-text>
          <v-list dense>
            <v-list-item v-for="(invoice, index) in pendingInvoices" :key="index">
              <v-list-item-icon>
                <v-icon v-if="invoice.status === 'pending'">mdi-clock-outline</v-icon>
                <v-icon v-else-if="invoice.status === 'error'" color="error">mdi-alert-circle</v-icon>
              </v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>{{ invoice.createdAt | formatDate }}</v-list-item-title>
                <v-list-item-subtitle v-if="invoice.error">Error: {{ invoice.error }}</v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="primary"
            text
            @click="syncNow"
            :disabled="!isOnline"
          >
            Sync Now
          </v-btn>
          <v-btn
            text
            @click="showPendingDialog = false"
          >
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
import { ItemsDB, CustomersDB, InvoicesDB } from '../../services/db';
import { processQueue } from '../../services/api';

export default {
  data() {
    return {
      isOnline: navigator.onLine,
      pendingCount: 0,
      pendingInvoices: [],
      showPendingDialog: false,
    };
  },
  
  filters: {
    formatDate(value) {
      if (!value) return '';
      const date = new Date(value);
      return date.toLocaleString();
    }
  },
  
  created() {
    // Network status listeners
    window.addEventListener('online', this.handleConnectionChange);
    window.addEventListener('offline', this.handleConnectionChange);
    
    // Check for pending transactions
    this.checkPendingTransactions();
    
    // Set interval to check pending count
    this.pendingCheckInterval = setInterval(this.checkPendingTransactions, 30000);
  },
  
  beforeDestroy() {
    window.removeEventListener('online', this.handleConnectionChange);
    window.removeEventListener('offline', this.handleConnectionChange);
    clearInterval(this.pendingCheckInterval);
  },
  
  methods: {
    // Network status handler
    handleConnectionChange() {
      this.isOnline = navigator.onLine;
      
      if (this.isOnline) {
        frappe.show_alert({
          message: __('Connected to network'),
          indicator: 'green'
        });
        
        // Try to sync pending transactions
        this.syncNow();
      } else {
        frappe.show_alert({
          message: __('Working offline. Limited functionality available.'),
          indicator: 'orange'
        });
      }
    },
    
    // Check for pending transactions
    async checkPendingTransactions() {
      const pendingInvoices = await InvoicesDB.getPendingInvoices();
      this.pendingCount = pendingInvoices.length;
      this.pendingInvoices = pendingInvoices;
    },
    
    // Manually trigger sync
    async syncNow() {
      if (!this.isOnline) {
        frappe.show_alert({
          message: __('Cannot sync while offline'),
          indicator: 'red'
        });
        return;
      }
      
      await processQueue();
      this.checkPendingTransactions();
    }
  }
};
</script>

<style scoped>
.offline-banner {
  position: sticky;
  top: 0;
  z-index: 1;
}
</style> 