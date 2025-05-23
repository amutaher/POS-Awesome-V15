<template>
  <v-dialog
    v-model="dialog"
    max-width="500px"
    persistent
    content-class="auth-error-dialog"
  >
    <v-card>
      <v-card-title class="headline">
        <v-icon left large color="error">mdi-alert-circle-outline</v-icon>
        {{ __('Authentication Required') }}
      </v-card-title>
      <v-card-text>
        <v-alert
          v-if="error"
          type="error"
          dense
          outlined
          :value="true"
        >
          {{ error }}
        </v-alert>
        <p>{{ __('Your session has expired or your login credentials are no longer valid.') }}</p>
        <p>{{ __('Please login again to continue syncing your data.') }}</p>
        <p class="mt-2"><b>{{ __('Note:') }}</b> {{ __('Your offline data is safely stored and will be synchronized after login.') }}</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          color="grey darken-1"
          text
          @click="dismissDialog"
        >
          {{ __('Dismiss') }}
        </v-btn>
        <v-btn
          color="primary"
          @click="openLoginPage"
          :loading="loading"
        >
          {{ __('Login') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
export default {
  name: 'AuthErrorDialog',
  
  data() {
    return {
      dialog: false,
      error: '',
      errorCode: null,
      loginUrl: '/login',
      loading: false,
      timer: null
    };
  },
  
  mounted() {
    // Listen for auth error events from offlineStorage
    window.addEventListener('pos-awesome-auth-error', this.handleAuthError);
    
    // Listen for auth restored events
    window.addEventListener('pos-awesome-auth-restored', this.handleAuthRestored);
  },
  
  beforeDestroy() {
    // Clean up event listeners
    window.removeEventListener('pos-awesome-auth-error', this.handleAuthError);
    window.removeEventListener('pos-awesome-auth-restored', this.handleAuthRestored);
    this.clearTimer();
  },
  
  methods: {
    handleAuthError(event) {
      // Display the dialog with the error message
      this.error = event.detail.message;
      this.errorCode = event.detail.code;
      this.loginUrl = event.detail.loginUrl || '/login';
      this.dialog = true;
      
      // Emit event for parent components to react
      this.$emit('auth-error', event.detail);
    },
    
    handleAuthRestored(event) {
      // Close the dialog if open
      this.dialog = false;
      this.error = '';
      this.loading = false;
      
      // Emit event for parent components to react
      this.$emit('auth-restored', event.detail);
    },
    
    dismissDialog() {
      // Just hide the dialog but don't reset auth status
      this.dialog = false;
      this.$emit('dismissed');
    },
    
    openLoginPage() {
      // Open login page in a new tab
      this.loading = true;
      
      // Define return URL to come back to this page
      const returnUrl = encodeURIComponent(window.location.href);
      const loginUrlWithRedirect = `${this.loginUrl}?redirect-to=${returnUrl}`;
      
      // Open login page
      window.open(loginUrlWithRedirect, '_blank');
      
      // Start checking for successful login
      this.startLoginCheck();
    },
    
    startLoginCheck() {
      // Clear any existing timer
      this.clearTimer();
      
      // Check every 5 seconds if session is restored
      this.timer = setInterval(() => {
        this.checkSession();
      }, 5000);
    },
    
    clearTimer() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    },
    
    async checkSession() {
      try {
        // Make a lightweight API call to check if session is valid
        const response = await fetch('/api/method/frappe.auth.get_logged_user', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.message) {
            // User is logged in, reset auth error status
            this.clearTimer();
            this.loading = false;
            
            // If offlineStorage is available, reset auth error status
            if (window.offlineStorage && typeof window.offlineStorage.resetAuthErrorStatus === 'function') {
              await window.offlineStorage.resetAuthErrorStatus();
            } else {
              // Manually trigger auth restored event
              window.dispatchEvent(new CustomEvent('pos-awesome-auth-restored', {
                detail: {
                  timestamp: new Date().toISOString()
                }
              }));
            }
            
            // Close dialog
            this.dialog = false;
          }
        }
      } catch (error) {
        console.warn('Failed to check login status:', error);
        // Keep checking
      }
    }
  }
};
</script>

<style>
.auth-error-dialog .v-card {
  border-left: 4px solid var(--error);
}
</style> 