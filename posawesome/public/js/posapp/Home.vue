<template>
  <v-app class="container1">
    <v-main>
      <Navbar @changePage="setPage($event)"></Navbar>
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
    }
  },
  mounted() {
    this.remove_frappe_nav();
    this.checkNetworkStatus();
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
  }
};
</script>

<style scoped>
.container1 {
  margin-top: 0px;
}
</style>
