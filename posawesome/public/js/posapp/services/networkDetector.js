/**
 * Network Status Detector Service
 * Provides real-time tracking of network status and notifies components about changes
 */
class NetworkDetector {
  constructor() {
    this.isOnline = navigator.onLine;
    this.listeners = [];
    
    // Register event listeners for online/offline events
    window.addEventListener('online', this.updateOnlineStatus.bind(this));
    window.addEventListener('offline', this.updateOnlineStatus.bind(this));
    
    // Create a custom event system for network status changes
    this.events = {
      statusChanged: []
    };
    
    console.log(`[NetworkDetector] Initialized. Online status: ${this.isOnline}`);
  }
  
  /**
   * Update online status and notify listeners
   */
  updateOnlineStatus() {
    const wasOnline = this.isOnline;
    this.isOnline = navigator.onLine;
    
    if (wasOnline !== this.isOnline) {
      console.log(`[NetworkDetector] Network status changed: ${this.isOnline ? 'Online' : 'Offline'}`);
      this.notifyStatusChange();
    }
  }
  
  /**
   * Check if device is currently online
   * @returns {boolean} Online status
   */
  checkOnlineStatus() {
    return this.isOnline;
  }
  
  /**
   * Register a callback for network status changes
   * @param {Function} callback Function to call when network status changes
   * @returns {Function} Unsubscribe function
   */
  onStatusChange(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    
    this.events.statusChanged.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.events.statusChanged.indexOf(callback);
      if (index !== -1) {
        this.events.statusChanged.splice(index, 1);
      }
    };
  }
  
  /**
   * Notify all listeners about status change
   */
  notifyStatusChange() {
    const status = {
      isOnline: this.isOnline,
      timestamp: new Date().toISOString()
    };
    
    this.events.statusChanged.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('[NetworkDetector] Error in status change callback:', error);
      }
    });
    
    // Dispatch a global event for components that aren't directly subscribed
    window.dispatchEvent(new CustomEvent('network-status-changed', { 
      detail: status 
    }));
  }
  
  /**
   * Test network connection with a ping to the server
   * @returns {Promise<boolean>} True if the server is reachable
   */
  async testConnection() {
    if (!navigator.onLine) {
      return false;
    }
    
    try {
      // Make a small request to the server to verify connectivity
      const response = await fetch('/api/method/ping', {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        // Very short timeout to quickly detect poor connections
        signal: AbortSignal.timeout(2000)
      });
      
      return response.ok;
    } catch (error) {
      console.log('[NetworkDetector] Connection test failed:', error.message);
      return false;
    }
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    window.removeEventListener('online', this.updateOnlineStatus);
    window.removeEventListener('offline', this.updateOnlineStatus);
    this.events.statusChanged = [];
  }
}

// Create a singleton instance
const networkDetector = new NetworkDetector();

export default networkDetector; 