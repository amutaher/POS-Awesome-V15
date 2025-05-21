<template>
  <v-app class="container1">
    <v-main>
      <Navbar @changePage="setPage($event)"></Navbar>
      
      <!-- PWA Installation prompt -->
      <v-snackbar
        v-model="pwaInstallPrompt"
        color="primary"
        :timeout="-1"
        fixed
        top
      >
        Install this app for better offline access
        <template v-slot:action="{ attrs }">
          <v-btn
            color="white"
            text
            v-bind="attrs"
            @click="installPWA"
          >
            Install
          </v-btn>
          <v-btn
            color="white"
            text
            v-bind="attrs"
            @click="pwaInstallPrompt = false"
          >
            Later
          </v-btn>
        </template>
      </v-snackbar>
      
      <v-snackbar
        v-model="offlineSnackbar"
        color="warning"
        :timeout="-1"
        fixed
        bottom
      >
        You are currently offline. Some features may be limited.
        <template v-slot:action="{ attrs }">
          <v-btn
            color="white"
            text
            v-bind="attrs"
            @click="offlineSnackbar = false"
          >
            Close
          </v-btn>
        </template>
      </v-snackbar>
      <component v-bind:is="page" class="mx-4 md-4"></component>
    </v-main>
  </v-app>
</template>

<script>
import Navbar from './components/Navbar.vue';
import POS from './components/pos/Pos.vue';
import Payments from './components/payments/Pay.vue';

export default {
  data: function () {
    return {
      page: 'POS',
      offlineSnackbar: false,
      pwaInstallPrompt: false,
      deferredPrompt: null
    };
  },
  components: {
    Navbar,
    POS,
    Payments,
  },
  methods: {
    setPage(page) {
      this.page = page;
    },
    remove_frappe_nav() {
      this.$nextTick(function () {
        $('.page-head').remove();
        $('.navbar.navbar-default.navbar-fixed-top').remove();
      });
    },
    checkNetworkStatus() {
      this.offlineSnackbar = !navigator.onLine;
      
      // Setup network status listeners
      window.addEventListener('online', () => {
        this.offlineSnackbar = false;
      });
      
      window.addEventListener('offline', () => {
        this.offlineSnackbar = true;
      });
    },
    
    setupPWAInstall() {
      // Listen for the beforeinstallprompt event
      window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later
        this.deferredPrompt = e;
        // Show the install prompt
        this.pwaInstallPrompt = true;
      });
      
      // Handle installed event
      window.addEventListener('appinstalled', () => {
        // Hide the app-provided install promotion
        this.pwaInstallPrompt = false;
        this.deferredPrompt = null;
        console.log('PWA was installed');
      });
    },
    
    installPWA() {
      // Hide the app provided install promotion
      this.pwaInstallPrompt = false;
      
      if (!this.deferredPrompt) {
        console.log('No installation prompt available');
        return;
      }
      
      // Show the install prompt
      this.deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        this.deferredPrompt = null;
      });
    }
  },
  mounted() {
    this.remove_frappe_nav();
    this.checkNetworkStatus();
    this.setupPWAInstall();
  },
  updated() { },
  created: function () {
    setTimeout(() => {
      this.remove_frappe_nav();
    }, 1000);
  },
  beforeUnmount() {
    // Clean up event listeners
    window.removeEventListener('online', () => {
      this.offlineSnackbar = false;
    });
    
    window.removeEventListener('offline', () => {
      this.offlineSnackbar = true;
    });
    
    window.removeEventListener('beforeinstallprompt', () => {});
    window.removeEventListener('appinstalled', () => {});
  }
};
</script>

<style scoped>
.container1 {
  margin-top: 0px;
}
</style>
