<template>
  <div class="sync-status">
    <div class="sync-status-content">
      <div class="sync-status-icon">
        <svg v-if="syncing" class="spinning" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 0 1-9 9"></path>
          <path d="M12 3a9 9 0 0 1 9 9"></path>
          <path d="M9 21a9 9 0 0 1-9-9"></path>
          <path d="M3 12a9 9 0 0 1 9-9"></path>
        </svg>
        <svg v-else-if="conflicts > 0" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </div>
      <div class="sync-status-message">
        <span v-if="syncing">Syncing {{ pendingCount }} invoice(s)...</span>
        <span v-else-if="conflicts > 0">{{ conflicts }} invoice(s) need attention</span>
        <span v-else>{{ pendingCount }} invoice(s) pending sync</span>
      </div>
      <div class="sync-status-actions">
        <button 
          v-if="!syncing" 
          class="sync-button" 
          @click="retrySync"
        >
          Sync Now
        </button>
        <button 
          class="dismiss-button"
          @click="dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SyncStatus',
  props: {
    pendingCount: {
      type: Number,
      default: 0
    },
    syncing: {
      type: Boolean,
      default: false
    },
    conflicts: {
      type: Number,
      default: 0
    }
  },
  methods: {
    retrySync() {
      this.$emit('retry-sync');
    },
    dismiss() {
      this.$emit('dismiss');
    }
  }
}
</script>

<style>
.sync-status {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background-color: #ffffff;
  border: 1px solid #e1e1e1;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10000;
  width: 300px;
  overflow: hidden;
}

.sync-status-content {
  display: flex;
  align-items: center;
  padding: 12px 16px;
}

.sync-status-icon {
  margin-right: 12px;
  display: flex;
  align-items: center;
  color: #4F46E5;
}

.sync-status-message {
  flex: 1;
  font-size: 14px;
  color: #333;
}

.sync-status-actions {
  display: flex;
  align-items: center;
  margin-left: 8px;
}

.sync-button {
  background-color: #4F46E5;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  margin-right: 8px;
}

.dismiss-button {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 16px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinning {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .sync-status {
    width: calc(100% - 40px);
    bottom: 10px;
    right: 20px;
  }
}
</style> 