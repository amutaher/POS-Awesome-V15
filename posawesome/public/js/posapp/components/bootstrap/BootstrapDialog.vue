<template>
  <v-dialog v-model="dialog" persistent max-width="600px">
    <v-card>
      <v-card-title class="headline primary white--text">
        <v-icon color="white" class="mr-2">mdi-database-sync</v-icon>
        Offline Data Bootstrap
      </v-card-title>
      
      <v-card-text class="pt-4">
        <v-alert v-if="error" type="error" class="mb-3">
          {{ error }}
        </v-alert>
        
        <v-alert v-if="isComplete" type="success" class="mb-3">
          Data bootstrap completed successfully! All required data is now available for offline use.
        </v-alert>
        
        <p v-if="!isComplete && !error" class="mb-3">
          Downloading and validating master data for offline use. Please wait until the process completes.
        </p>
        
        <v-list-item three-line>
          <v-list-item-content>
            <v-list-item-title>Customers</v-list-item-title>
            <v-list-item-subtitle>{{ progress.customers.loaded }} of {{ progress.customers.total || '?' }}</v-list-item-subtitle>
          </v-list-item-content>
          <v-list-item-action>
            <v-progress-circular
              v-if="progress.customers.status === 'loading'"
              indeterminate
              color="primary"
            ></v-progress-circular>
            <v-icon v-else-if="progress.customers.status === 'complete'" color="success">mdi-check-circle</v-icon>
            <v-icon v-else-if="progress.customers.status === 'error'" color="error">mdi-alert-circle</v-icon>
            <v-icon v-else color="grey">mdi-clock-outline</v-icon>
          </v-list-item-action>
        </v-list-item>
        
        <v-list-item three-line>
          <v-list-item-content>
            <v-list-item-title>Tax Templates</v-list-item-title>
            <v-list-item-subtitle>{{ progress.taxes.loaded }} of {{ progress.taxes.total || '?' }}</v-list-item-subtitle>
          </v-list-item-content>
          <v-list-item-action>
            <v-progress-circular
              v-if="progress.taxes.status === 'loading'"
              indeterminate
              color="primary"
            ></v-progress-circular>
            <v-icon v-else-if="progress.taxes.status === 'complete'" color="success">mdi-check-circle</v-icon>
            <v-icon v-else-if="progress.taxes.status === 'error'" color="error">mdi-alert-circle</v-icon>
            <v-icon v-else color="grey">mdi-clock-outline</v-icon>
          </v-list-item-action>
        </v-list-item>
        
        <v-list-item three-line>
          <v-list-item-content>
            <v-list-item-title>Items</v-list-item-title>
            <v-list-item-subtitle>{{ progress.items.loaded }} of {{ progress.items.total || '?' }}</v-list-item-subtitle>
          </v-list-item-content>
          <v-list-item-action>
            <v-progress-circular
              v-if="progress.items.status === 'loading'"
              indeterminate
              color="primary"
            ></v-progress-circular>
            <v-icon v-else-if="progress.items.status === 'complete'" color="success">mdi-check-circle</v-icon>
            <v-icon v-else-if="progress.items.status === 'error'" color="error">mdi-alert-circle</v-icon>
            <v-icon v-else color="grey">mdi-clock-outline</v-icon>
          </v-list-item-action>
        </v-list-item>
        
        <v-alert v-if="isBootstrapping" type="info" class="mt-3">
          This may take several minutes depending on the amount of data.
          Please do not close this window until the process completes.
        </v-alert>
      </v-card-text>
      
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          color="error"
          text
          :disabled="isBootstrapping && !error"
          @click="skipBootstrap"
        >
          Skip For Now
        </v-btn>
        <v-btn
          color="primary"
          :disabled="isBootstrapping && !error"
          :loading="isBootstrapping"
          @click="startOrContinue"
        >
          {{ isComplete ? 'Continue' : error ? 'Retry' : 'Start Bootstrap' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import DataBootstrap from '../../services/dataBootstrap';

export default {
  data() {
    return {
      dialog: false,
      dataBootstrap: null,
      progress: {
        customers: { total: 0, loaded: 0, status: 'pending' },
        items: { total: 0, loaded: 0, status: 'pending' },
        taxes: { total: 0, loaded: 0, status: 'pending' },
      },
      isBootstrapping: false,
      isComplete: false,
      error: null,
      refreshInterval: null
    };
  },
  
  watch: {
    dialog(newVal) {
      if (!newVal) {
        this.stopProgressRefresh();
      } else {
        this.startProgressRefresh();
      }
    }
  },
  
  methods: {
    open() {
      if (!this.dataBootstrap && window.offlineStorage) {
        this.dataBootstrap = new DataBootstrap(window.offlineStorage);
      }
      
      this.dialog = true;
      this.checkStatus();
    },
    
    close() {
      this.dialog = false;
      this.stopProgressRefresh();
    },
    
    startProgressRefresh() {
      // Refresh progress data every 500ms
      this.refreshInterval = setInterval(() => {
        this.updateProgress();
      }, 500);
    },
    
    stopProgressRefresh() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
    },
    
    updateProgress() {
      if (this.dataBootstrap) {
        const progress = this.dataBootstrap.getProgress();
        this.progress = {
          customers: progress.customers,
          items: progress.items,
          taxes: progress.taxes
        };
        this.isBootstrapping = progress.isBootstrapping;
        this.isComplete = progress.isComplete;
        this.error = progress.error;
      }
    },
    
    async checkStatus() {
      if (!this.dataBootstrap) return;
      
      try {
        const status = await this.dataBootstrap.checkBootstrapStatus();
        if (status.isComplete) {
          this.isComplete = true;
        }
        this.updateProgress();
      } catch (error) {
        console.error('Error checking bootstrap status:', error);
      }
    },
    
    async startOrContinue() {
      if (this.isComplete) {
        // Process complete - just close and continue
        this.eventBus.emit('bootstrap_completed');
        this.close();
        return;
      }
      
      if (!this.dataBootstrap) return;
      
      try {
        this.error = null;
        this.isBootstrapping = true;
        await this.dataBootstrap.startBootstrap();
        this.isComplete = true;
        this.eventBus.emit('bootstrap_completed');
      } catch (error) {
        console.error('Bootstrap error:', error);
        this.error = error.message || 'An error occurred during data bootstrap.';
      } finally {
        this.isBootstrapping = false;
        this.updateProgress();
      }
    },
    
    skipBootstrap() {
      if (this.isBootstrapping) {
        // Can't skip when actively bootstrapping
        return;
      }
      
      this.eventBus.emit('bootstrap_skipped');
      this.close();
    }
  },
  
  beforeUnmount() {
    this.stopProgressRefresh();
  }
};
</script>

<style scoped>
/* Add any component-specific styles here */
</style> 