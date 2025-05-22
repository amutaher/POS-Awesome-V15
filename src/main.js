import { createApp } from 'vue';
import App from './App.vue';
import { registerSW } from 'virtual:pwa-register';
import OfflineStorage from '../posawesome/public/js/posapp/services/offlineStorage';
import networkDetector from '../posawesome/public/js/posapp/services/networkDetector';

// Register service worker with auto-update functionality
const updateSW = registerSW({
  onNeedRefresh() {
    // Show a prompt to the user asking if they want to refresh for new content
    if (confirm('New content available. Reload page?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('App is ready for offline use');
  }
});

// Initialize offline storage and make it available globally
const initApp = async () => {
  try {
    // Create and initialize offline storage
    const storage = new OfflineStorage();
    await storage.ready;
    window.offlineStorage = storage;

    // Make network detector available globally
    window.networkDetector = networkDetector;

    // Create and mount the app
    const app = createApp(App);
    app.mount('#app');

    // Listen for network status changes to show appropriate UI
    networkDetector.onStatusChange((status) => {
      console.log('Network status changed:', status.isOnline ? 'Online' : 'Offline');
      // This will be handled by the components through the global event
    });

    // Check if we need to process pending invoices
    if (networkDetector.checkOnlineStatus()) {
      await storage.triggerSync();
    }
  } catch (error) {
    console.error('Error initializing app:', error);
  }
};

// Initialize the application
initApp(); 