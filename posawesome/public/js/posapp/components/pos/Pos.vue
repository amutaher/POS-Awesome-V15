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
        <ItemsSelector></ItemsSelector>
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
        <Invoice></Invoice>
      </v-col>
    </v-row>
  </div>
</template>

<script>
import api from '../../services/api';
import { ItemsDB, CustomersDB } from '../../services/db';

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
  name: 'Pos',
  data: function () {
    return {
      dialog: false,
      pos_profile: '',
      pos_opening_shift: '',
      payment: false,
      offers: false,
      coupons: false,
      isOnline: true,
      offlineMode: false,
      syncStatus: 'synced',
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
    async initializeApp() {
      try {
        const syncResult = await api.initialSync();
        if (!syncResult.success) {
          this.showError('Failed to sync data: ' + syncResult.message);
        }
      } catch (error) {
        this.showError('Failed to initialize app: ' + error.message);
      }
    },
    setupNetworkListeners() {
      this.isOnline = navigator.onLine;
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.syncOfflineData();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    },
    async searchItems(query) {
      try {
        if (this.isOnline) {
          const result = await api.apiCall(
            'posawesome.posawesome.api.posapp.get_items',
            { query },
            { syncData: true }
          );
          return result.message;
        } else {
          return await ItemsDB.searchItems(query);
        }
      } catch (error) {
        this.showError('Failed to search items: ' + error.message);
        return [];
      }
    },
    async searchCustomers(query) {
      try {
        if (this.isOnline) {
          const result = await api.apiCall(
            'posawesome.posawesome.api.posapp.get_customers',
            { query },
            { syncData: true }
          );
          return result.message;
        } else {
          return await CustomersDB.searchCustomers(query);
        }
      } catch (error) {
        this.showError('Failed to search customers: ' + error.message);
        return [];
      }
    },
    async submitInvoice(invoice) {
      try {
        const result = await api.apiCall(
          'posawesome.posawesome.api.posapp.submit_invoice',
          { invoice },
          { isInvoice: true, offlineSupport: true }
        );

        if (result.offline) {
          this.showInfo('Invoice saved offline. Will sync when online.');
        } else {
          this.showSuccess('Invoice submitted successfully');
        }

        return result;
      } catch (error) {
        this.showError('Failed to submit invoice: ' + error.message);
        throw error;
      }
    },
    async syncOfflineData() {
      if (!this.isOnline) return;

      this.syncStatus = 'syncing';
      try {
        await api.processQueue();
        this.syncStatus = 'synced';
        this.showSuccess('All offline data synced successfully');
      } catch (error) {
        this.syncStatus = 'error';
        this.showError('Failed to sync offline data: ' + error.message);
      }
    },
    showSuccess(message) {
      frappe.show_alert({
        message: __(message),
        indicator: 'green'
      });
    },
    showError(message) {
      frappe.show_alert({
        message: __(message),
        indicator: 'red'
      });
    },
    showInfo(message) {
      frappe.show_alert({
        message: __(message),
        indicator: 'blue'
      });
    },
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
  },

  mounted: function () {
    this.$nextTick(function () {
      this.initializeApp();
      this.setupNetworkListeners();
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
  },
};
</script>

<style scoped></style>
