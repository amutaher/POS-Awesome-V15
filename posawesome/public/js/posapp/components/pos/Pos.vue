<template>
  <div fluid class="mt-2">
    <ClosingDialog></ClosingDialog>
    <Drafts></Drafts>
    <SalesOrders></SalesOrders>
    <Returns></Returns>
    <NewAddress></NewAddress>
    <MpesaPayments></MpesaPayments>
    <Variants></Variants>
    <OpeningDialog v-if="dialog" :dialog="dialog"></OpeningDialog>
    <v-row v-show="!dialog">
      <v-col v-show="!payment && !offers && !coupons" xl="5" lg="5" md="5" sm="5" cols="12" class="pos pr-0">
        <v-overlay
          v-if="!isBootstrapComplete && !isBootstrapSkipped"
          absolute
          :value="true"
          opacity="0.9"
          z-index="5"
        >
          <v-card class="pa-5">
            <v-card-title class="justify-center">
              <v-icon color="warning" class="mr-2">mdi-database-sync</v-icon>
              Offline Data Not Ready
            </v-card-title>
            <v-card-text class="text-center">
              <p>Sales operations are disabled until offline data bootstrap is complete.</p>
              <p>This ensures proper operation when you're offline.</p>
              <v-btn 
                color="primary" 
                class="mt-3" 
                @click="openBootstrapDialog">
                Complete Data Bootstrap
              </v-btn>
            </v-card-text>
          </v-card>
        </v-overlay>
        <ItemsSelector :disabled="!isBootstrapComplete && !isBootstrapSkipped"></ItemsSelector>
      </v-col>
      <v-col v-show="offers" xl="5" lg="5" md="5" sm="5" cols="12" class="pos pr-0">
        <PosOffers></PosOffers>
      </v-col>
      <v-col v-show="coupons" xl="5" lg="5" md="5" sm="5" cols="12" class="pos pr-0">
        <PosCoupons></PosCoupons>
      </v-col>
      <v-col v-show="payment" xl="5" lg="5" md="5" sm="5" cols="12" class="pos pr-0">
        <Payments></Payments>
      </v-col>

      <v-col xl="7" lg="7" md="7" sm="7" cols="12" class="pos">
        <Invoice :disabled="!isBootstrapComplete && !isBootstrapSkipped"></Invoice>
      </v-col>
    </v-row>
  </div>
</template>

<script>

import ItemsSelector from './ItemsSelector.vue';
import Invoice from './Invoice.vue';
import OpeningDialog from './OpeningDialog.vue';
import Payments from './Payments.vue';
import PosOffers from './PosOffers.vue';
import PosCoupons from './PosCoupons.vue';
import Drafts from './Drafts.vue';
import SalesOrders from "./SalesOrders.vue";
import ClosingDialog from './ClosingDialog.vue';
import NewAddress from './NewAddress.vue';
import Variants from './Variants.vue';
import Returns from './Returns.vue';
import MpesaPayments from './Mpesa-Payments.vue';

export default {
  data: function () {
    return {
      dialog: false,
      pos_profile: '',
      pos_opening_shift: '',
      payment: false,
      offers: false,
      coupons: false,
      isBootstrapComplete: false,
      isBootstrapSkipped: false,
    };
  },

  components: {
    ItemsSelector,
    Invoice,
    OpeningDialog,
    Payments,
    Drafts,
    ClosingDialog,
    Returns,
    PosOffers,
    PosCoupons,
    NewAddress,
    Variants,
    MpesaPayments,
    SalesOrders,
  },

  methods: {
    check_opening_entry() {
      return frappe
        .call('posawesome.posawesome.api.posapp.check_opening_shift', {
          user: frappe.session.user,
        })
        .then((r) => {
          if (r.message) {
            this.pos_profile = r.message.pos_profile;
            this.pos_opening_shift = r.message.pos_opening_shift;
            this.get_offers(this.pos_profile.name);
            this.eventBus.emit('register_pos_profile', r.message);
            this.eventBus.emit('set_company', r.message.company);
            frappe.realtime.emit('pos_profile_registered');
            console.info('LoadPosProfile');
          } else {
            this.create_opening_voucher();
          }
        });
    },
    create_opening_voucher() {
      this.dialog = true;
    },
    get_closing_data() {
      return frappe
        .call(
          'posawesome.posawesome.doctype.pos_closing_shift.pos_closing_shift.make_closing_shift_from_opening',
          {
            opening_shift: this.pos_opening_shift,
          }
        )
        .then((r) => {
          if (r.message) {
            this.eventBus.emit('open_ClosingDialog', r.message);
          } else {
            // console.log(r);
          }
        });
    },
    submit_closing_pos(data) {
      frappe
        .call(
          'posawesome.posawesome.doctype.pos_closing_shift.pos_closing_shift.submit_closing_shift',
          {
            closing_shift: data,
          }
        )
        .then((r) => {
          if (r.message) {
            this.eventBus.emit('show_message', {
              title: `POS Shift Closed`,
              color: 'success',
            });
            this.check_opening_entry();
          } else {
            console.log(r);
          }
        });
    },
    get_offers(pos_profile) {
      return frappe
        .call('posawesome.posawesome.api.posapp.get_offers', {
          profile: pos_profile,
        })
        .then((r) => {
          if (r.message) {
            console.info('LoadOffers');
            this.eventBus.emit('set_offers', r.message);
          }
        });
    },
    get_pos_setting() {
      frappe.db.get_doc('POS Settings', undefined).then((doc) => {
        this.eventBus.emit('set_pos_settings', doc);
      });
    },
    
    checkBootstrapStatus() {
      // Check if data bootstrap is completed using localStorage for performance
      const localBootstrapStatus = localStorage.getItem('posa_bootstrap_completed');
      this.isBootstrapComplete = localBootstrapStatus === 'true';
      
      // Also check if it was explicitly skipped
      this.isBootstrapSkipped = localStorage.getItem('posa_bootstrap_skipped') === 'true';
    },
    
    openBootstrapDialog() {
      this.eventBus.emit('open_bootstrap_dialog');
    }
  },

  mounted: function () {
    this.$nextTick(function () {
      // Check bootstrap status first
      this.checkBootstrapStatus();
      
      // Continue with normal initialization
      this.check_opening_entry();
      this.get_pos_setting();
      
      this.eventBus.on('close_opening_dialog', () => {
        this.dialog = false;
      });
      this.eventBus.on('register_pos_data', (data) => {
        this.pos_profile = data.pos_profile;
        this.get_offers(this.pos_profile.name);
        this.pos_opening_shift = data.pos_opening_shift;
        this.eventBus.emit('register_pos_profile', data);
        console.info('LoadPosProfile');
      });
      this.eventBus.on('show_payment', (data) => {
        this.payment = true ? data === 'true' : false;
        this.offers = false ? data === 'true' : false;
        this.coupons = false ? data === 'true' : false;
      });
      this.eventBus.on('show_offers', (data) => {
        this.offers = true ? data === 'true' : false;
        this.payment = false ? data === 'true' : false;
        this.coupons = false ? data === 'true' : false;
      });
      this.eventBus.on('show_coupons', (data) => {
        this.coupons = true ? data === 'true' : false;
        this.offers = false ? data === 'true' : false;
        this.payment = false ? data === 'true' : false;
      });
      this.eventBus.on('open_closing_dialog', () => {
        this.get_closing_data();
      });
      this.eventBus.on('submit_closing_pos', (data) => {
        this.submit_closing_pos(data);
      });
      
      // Listen for bootstrap events
      this.eventBus.on('bootstrap_completed', () => {
        this.isBootstrapComplete = true;
        localStorage.setItem('posa_bootstrap_completed', 'true');
      });
      
      this.eventBus.on('bootstrap_skipped', () => {
        this.isBootstrapSkipped = true;
        localStorage.setItem('posa_bootstrap_skipped', 'true');
      });
      
      // Listen for bootstrap dialog ready event
      this.eventBus.on('bootstrap_dialog_ready', () => {
        console.log('Bootstrap dialog is ready');
      });
    });
  },
  
  beforeUnmount() {
    this.eventBus.off('close_opening_dialog');
    this.eventBus.off('register_pos_data');
    this.eventBus.off('LoadPosProfile');
    this.eventBus.off('show_offers');
    this.eventBus.off('show_coupons');
    this.eventBus.off('open_closing_dialog');
    this.eventBus.off('submit_closing_pos');
    this.eventBus.off('bootstrap_completed');
    this.eventBus.off('bootstrap_skipped');
    this.eventBus.off('bootstrap_dialog_ready');
  },
};
</script>

<style scoped></style>
