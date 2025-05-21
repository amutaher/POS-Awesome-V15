<template>
  <div>
    <!-- Main Payment Card -->
    <v-card class="selection mx-auto bg-grey-lighten-5 pa-1" style="max-height: 76vh; height: 76vh">
      <v-progress-linear :active="loading" :indeterminate="loading" absolute location="top" color="info"></v-progress-linear>
      <div class="overflow-y-auto px-2 pt-2" style="max-height: 75vh">
        
        <!-- Payment Summary (Paid, To Be Paid, Change) -->
        <v-row v-if="invoice_doc" class="px-1 py-0">
          <v-col cols="7">
            <v-text-field
              variant="outlined"
              color="primary"
              :label="frappe._('Paid Amount')"
              bg-color="white"
              hide-details
              v-model="total_payments_display"
              readonly
              :prefix="currencySymbol(invoice_doc.currency)"
              density="compact"
              @click="showPaidAmount"
            ></v-text-field>
          </v-col>
          <v-col cols="5">
            <v-text-field
              variant="outlined"
              color="primary"
              label="To Be Paid"
              bg-color="white"
              hide-details
              v-model="diff_payment_display"
              :prefix="currencySymbol(invoice_doc.currency)"
              density="compact"
              @focus="showDiffPayment"
              persistent-placeholder
            ></v-text-field>
          </v-col>

          <!-- Paid Change (if applicable) -->
          <v-col cols="7" v-if="credit_change > 0 && !invoice_doc.is_return">
            <v-text-field
              variant="outlined"
              color="primary"
              :label="frappe._('Paid Change')"
              bg-color="white"
              v-model.number="paid_change"
              :prefix="currencySymbol(invoice_doc.currency)"
              :rules="paid_change_rules"
              density="compact"
              readonly
              type="number"
              @click="showPaidChange"
            ></v-text-field>
          </v-col>

          <!-- Credit Change (if applicable) -->
          <v-col cols="5" v-if="credit_change > 0 && !invoice_doc.is_return">
            <v-text-field
              variant="outlined"
              color="primary"
              :label="frappe._('Credit Change')"
              bg-color="white"
              v-model.number="credit_change"
              :prefix="currencySymbol(invoice_doc.currency)"
              density="compact"
              type="number"
              @input="updateCreditChange"
            ></v-text-field>
          </v-col>
        </v-row>

        <v-divider></v-divider>

        <!-- Payment Inputs (All Payment Methods) -->
        <div v-if="is_cashback">
          <v-row class="payments px-1 py-0" v-for="(payment, index) in invoice_doc.payments" :key="payment.name">
            <v-col cols="6" v-if="!is_mpesa_c2b_payment(payment)">
              <v-text-field
                density="compact"
                variant="outlined"
                color="primary"
                :label="frappe._(payment.mode_of_payment)"
                bg-color="white"
                hide-details
                v-model.number="payment.amount"
                :rules="[
                  isNumber,
                  v => !payment.mode_of_payment.toLowerCase().includes('cash') || 
                       this.is_credit_sale || 
                       v >= (this.invoice_doc.rounded_total || this.invoice_doc.grand_total) || 
                       'Cash payment cannot be less than invoice total when credit sale is off'
                ]"
                :prefix="currencySymbol(invoice_doc.currency)"
                @focus="set_rest_amount(payment.idx)"
                :readonly="invoice_doc.is_return"
              ></v-text-field>
            </v-col>
            <v-col cols="6" v-if="!is_mpesa_c2b_payment(payment)">
              <v-btn block color="primary" theme="dark" @click="set_full_amount(payment.idx)">
                {{ payment.mode_of_payment }}
              </v-btn>
            </v-col>

            <!-- M-Pesa Payment Button (if payment is M-Pesa) -->
            <v-col cols="12" v-if="is_mpesa_c2b_payment(payment)" class="pl-3">
              <v-btn block color="success" theme="dark" @click="mpesa_c2b_dialog(payment)">
                {{ __("Get Payments") }} {{ payment.mode_of_payment }}
              </v-btn>
            </v-col>

            <!-- Request Payment for Phone Type -->
            <v-col cols="3" v-if="payment.type === 'Phone' && payment.amount > 0 && request_payment_field" class="pl-1">
              <v-btn block color="success" theme="dark" :disabled="payment.amount === 0" @click="request_payment(payment)">
                {{ __("Request") }}
              </v-btn>
            </v-col>
          </v-row>
        </div>

        <!-- Loyalty Points Redemption -->
        <v-row class="payments px-1 py-0" v-if="invoice_doc && available_points_amount > 0 && !invoice_doc.is_return">
          <v-col cols="7">
            <v-text-field
              density="compact"
              variant="outlined"
              color="primary"
              :label="frappe._('Redeem Loyalty Points')"
              bg-color="white"
              hide-details
              v-model.number="loyalty_amount"
              type="number"
              :prefix="currencySymbol(invoice_doc.currency)"
            ></v-text-field>
          </v-col>
          <v-col cols="5">
            <v-text-field
              density="compact"
              variant="outlined"
              color="primary"
              :label="frappe._('You can redeem up to')"
              bg-color="white"
              hide-details
              :value="formatFloat(available_points_amount)"
              :prefix="currencySymbol(invoice_doc.currency)"
              readonly
            ></v-text-field>
          </v-col>
        </v-row>

        <!-- Customer Credit Redemption -->
        <v-row class="payments px-1 py-0" v-if="invoice_doc && available_customer_credit > 0 && !invoice_doc.is_return && redeem_customer_credit">
          <v-col cols="7">
            <v-text-field
              density="compact"
              variant="outlined"
              color="primary"
              :label="frappe._('Redeemed Customer Credit')"
              bg-color="white"
              hide-details
              v-model.number="redeemed_customer_credit"
              type="number"
              :prefix="currencySymbol(invoice_doc.currency)"
              readonly
            ></v-text-field>
          </v-col>
          <v-col cols="5">
            <v-text-field
              density="compact"
              variant="outlined"
              color="primary"
              :label="frappe._('You can redeem credit up to')"
              bg-color="white"
              hide-details
              :value="formatCurrency(available_customer_credit)"
              :prefix="currencySymbol(invoice_doc.currency)"
              readonly
            ></v-text-field>
          </v-col>
        </v-row>

        <v-divider></v-divider>

        <!-- Invoice Totals (Net, Tax, Total, Discount, Grand, Rounded) -->
        <v-row class="px-1 py-0">
          <v-col cols="6">
            <v-text-field
              density="compact"
              variant="outlined"
              color="primary"
              :label="frappe._('Net Total')"
              bg-color="white"
              :value="formatCurrency(invoice_doc.net_total, displayCurrency)"
              readonly
              :prefix="currencySymbol()"
              persistent-placeholder
            ></v-text-field>
          </v-col>
          <v-col cols="6">
            <v-text-field
              density="compact"
              variant="outlined"
              color="primary"
              :label="frappe._('Tax and Charges')"
              bg-color="white"
              hide-details
              :value="formatCurrency(invoice_doc.total_taxes_and_charges, displayCurrency)"
              readonly
              :prefix="currencySymbol()"
              persistent-placeholder
            ></v-text-field>
          </v-col>
          <v-col cols="6">
            <v-text-field
              density="compact"
              variant="outlined"
              color="primary"
              :label="frappe._('Total Amount')"
              bg-color="white"
              hide-details
              :value="formatCurrency(invoice_doc.total, displayCurrency)"
              readonly
              :prefix="currencySymbol()"
              persistent-placeholder
            ></v-text-field>
          </v-col>
          <v-col cols="6">
            <v-text-field
              density="compact"
              variant="outlined"
              color="primary"
              :label="diff_label"
              bg-color="white"
              hide-details
              :value="formatCurrency(diff_payment, displayCurrency)"
              readonly
              :prefix="currencySymbol()"
              persistent-placeholder
            ></v-text-field>
          </v-col>
          <v-col cols="6">
            <v-text-field
              density="compact"
              variant="outlined"
              color="primary"
              :label="frappe._('Discount Amount')"
              bg-color="white"
              hide-details
              :value="formatCurrency(invoice_doc.discount_amount)"
              readonly
              :prefix="currencySymbol(invoice_doc.currency)"
              persistent-placeholder
            ></v-text-field>
          </v-col>
          <v-col cols="6">
            <v-text-field
              density="compact"
              variant="outlined"
              color="primary"
              :label="frappe._('Grand Total')"
              bg-color="white"
              hide-details
              :value="formatCurrency(invoice_doc.grand_total)"
              readonly
              :prefix="currencySymbol(invoice_doc.currency)"
              persistent-placeholder
            ></v-text-field>
          </v-col>
          <v-col v-if="invoice_doc.rounded_total" cols="6">
            <v-text-field
              density="compact"
              variant="outlined"
              color="primary"
              :label="frappe._('Rounded Total')"
              bg-color="white"
              hide-details
              :value="formatCurrency(invoice_doc.rounded_total)"
              readonly
              :prefix="currencySymbol(invoice_doc.currency)"
              persistent-placeholder
            ></v-text-field>
          </v-col>

          <!-- Delivery Date and Address (if applicable) -->
          <v-col cols="6" v-if="pos_profile.posa_allow_sales_order && invoiceType === 'Order'">
            <v-menu ref="order_delivery_date" v-model="order_delivery_date" :close-on-content-click="false" transition="scale-transition" density="default">
              <template v-slot:activator="{ on, attrs }">
                <v-text-field
                  v-model="invoice_doc.posa_delivery_date"
                  :label="frappe._('Delivery Date')"
                  readonly
                  variant="outlined"
                  density="compact"
                  bg-color="white"
                  clearable
                  color="primary"
                  hide-details
                  v-bind="attrs"
                  v-on="on"
                ></v-text-field>
              </template>
              <v-date-picker
                v-model="new_delivery_date"
                no-title
                scrollable
                color="primary"
                :min="frappe.datetime.now_date()"
                @input="order_delivery_date = false; update_delivery_date()"
              ></v-date-picker>
            </v-menu>
          </v-col>
          <!-- Shipping Address Selection (if delivery date is set) -->
          <v-col cols="12" v-if="invoice_doc.posa_delivery_date">
            <v-autocomplete
              density="compact"
              clearable
              auto-select-first
              variant="outlined"
              color="primary"
              :label="frappe._('Address')"
              v-model="invoice_doc.shipping_address_name"
              :items="addresses"
              item-title="address_title"
              item-value="name"
              bg-color="white"
              no-data-text="Address not found"
              hide-details
              :customFilter="addressFilter"
              append-icon="mdi-plus"
              @click:append="new_address"
            >
              <template v-slot:item="{ item }">
                <v-list-item>
                  <v-list-item-content>
                    <v-list-item-title class="text-primary text-subtitle-1">
                      <div v-html="item.address_title"></div>
                    </v-list-item-title>
                    <v-list-item-subtitle>
                      <div v-html="item.address_line1"></div>
                    </v-list-item-subtitle>
                    <v-list-item-subtitle v-if="item.address_line2">
                      <div v-html="item.address_line2"></div>
                    </v-list-item-subtitle>
                    <v-list-item-subtitle v-if="item.city">
                      <div v-html="item.city"></div>
                    </v-list-item-subtitle>
                    <v-list-item-subtitle v-if="item.state">
                      <div v-html="item.state"></div>
                    </v-list-item-subtitle>
                    <v-list-item-subtitle v-if="item.country">
                      <div v-html="item.country"></div>
                    </v-list-item-subtitle>
                    <v-list-item-subtitle v-if="item.mobile_no">
                      <div v-html="item.mobile_no"></div>
                    </v-list-item-subtitle>
                    <v-list-item-subtitle v-if="item.address_type">
                      <div v-html="item.address_type"></div>
                    </v-list-item-subtitle>
                  </v-list-item-content>
                </v-list-item>
              </template>
            </v-autocomplete>
          </v-col>

          <!-- Additional Notes (if enabled in POS profile) -->
          <v-col cols="12" v-if="pos_profile.posa_display_additional_notes">
            <v-textarea
              class="pa-0"
              variant="outlined"
              density="compact"
              bg-color="white"
              clearable
              color="primary"
              auto-grow
              rows="2"
              :label="frappe._('Additional Notes')"
              v-model="invoice_doc.posa_notes"
            ></v-textarea>
          </v-col>
        </v-row>

        <!-- Customer Purchase Order (if enabled in POS profile) -->
        <div v-if="pos_profile.posa_allow_customer_purchase_order">
          <v-divider></v-divider>
          <v-row class="px-1 py-0" justify="center" align="start">
            <v-col cols="6">
              <v-text-field
                v-model="invoice_doc.po_no"
                :label="frappe._('Purchase Order')"
                variant="outlined"
                density="compact"
                bg-color="white"
                clearable
                color="primary"
                hide-details
              ></v-text-field>
            </v-col>
            <v-col cols="6">
              <v-menu ref="po_date_menu" v-model="po_date_menu" :close-on-content-click="false" transition="scale-transition">
                <template v-slot:activator="{ on, attrs }">
                  <v-text-field
                    v-model="invoice_doc.po_date"
                    :label="frappe._('Purchase Order Date')"
                    readonly
                    variant="outlined"
                    density="compact"
                    hide-details
                    v-bind="attrs"
                    v-on="on"
                    color="primary"
                  ></v-text-field>
                </template>
                <v-date-picker
                  v-model="new_po_date"
                  no-title
                  scrollable
                  color="primary"
                  @input="po_date_menu = false; update_po_date()"
                ></v-date-picker>
              </v-menu>
            </v-col>
          </v-row>
        </div>

        <v-divider></v-divider>

        <!-- Switches for Write Off and Credit Sale -->
        <v-row class="px-1 py-0" align="start" no-gutters>
          <v-col cols="6" v-if="pos_profile.posa_allow_write_off_change && credit_change > 0 && !invoice_doc.is_return">
            <v-switch
              v-model="is_write_off_change"
              flat
              :label="frappe._('Write Off Difference Amount')"
              class="my-0 py-0"
            ></v-switch>
          </v-col>
          <v-col cols="6" v-if="pos_profile.posa_allow_credit_sale && !invoice_doc.is_return">
            <v-switch
              v-model="is_credit_sale"
              :label="frappe._('Credit Sale?')"
            ></v-switch>
          </v-col>
          <v-col cols="6" v-if="invoice_doc.is_return && pos_profile.use_cashback">
            <v-switch
              v-model="is_cashback"
              flat
              :label="frappe._('Cashback?')"
              class="my-0 py-0"
            ></v-switch>
          </v-col>
          <v-col cols="6" v-if="is_credit_sale">
            <v-menu ref="date_menu" v-model="date_menu" :close-on-content-click="false" transition="scale-transition" min-width="auto">
              <template v-slot:activator="{ props }">
                <v-text-field
                  v-model="invoice_doc.due_date"
                  :label="frappe._('Due Date')"
                  readonly
                  variant="outlined"
                  density="compact"
                  hide-details
                  v-bind="props"
                  color="primary"
                  clearable
                  @click:clear="invoice_doc.due_date = ''"
                ></v-text-field>
              </template>
              <v-date-picker
                v-model="new_credit_due_date"
                no-title
                scrollable
                color="primary"
                :min="frappe.datetime.now_date()"
                @update:model-value="date_menu = false; update_credit_due_date()"
              ></v-date-picker>
            </v-menu>
          </v-col>
          <v-col cols="6" v-if="!invoice_doc.is_return && pos_profile.use_customer_credit">
            <v-switch
              v-model="redeem_customer_credit"
              flat
              :label="frappe._('Use Customer Credit')"
              class="my-0 py-0"
              @change="get_available_credit(redeem_customer_credit)"
            ></v-switch>
          </v-col>
        </v-row>

        <!-- Customer Credit Details -->
        <div v-if="invoice_doc && available_customer_credit > 0 && !invoice_doc.is_return && redeem_customer_credit">
          <v-row v-for="(row, idx) in customer_credit_dict" :key="idx">
            <v-col cols="4">
              <div class="pa-2 py-3">{{ row.credit_origin }}</div>
            </v-col>
            <v-col cols="4">
              <v-text-field
                density="compact"
                variant="outlined"
                color="primary"
                :label="frappe._('Available Credit')"
                bg-color="white"
                hide-details
                :value="formatCurrency(row.total_credit)"
                readonly
                :prefix="currencySymbol(invoice_doc.currency)"
              ></v-text-field>
            </v-col>
            <v-col cols="4">
              <v-text-field
                density="compact"
                variant="outlined"
                color="primary"
                :label="frappe._('Redeem Credit')"
                bg-color="white"
                hide-details
                type="number"
                v-model.number="row.credit_to_redeem"
                :prefix="currencySymbol(invoice_doc.currency)"
              ></v-text-field>
            </v-col>
          </v-row>
        </div>

        <v-divider></v-divider>

        <!-- Sales Person Selection -->
        <v-row class="pb-0 mb-2" align="start">
          <v-col cols="12">
            <p v-if="sales_persons && sales_persons.length > 0" class="mt-1 mb-1 text-subtitle-2">{{ sales_persons.length }} sales persons found</p>
            <p v-else class="mt-1 mb-1 text-subtitle-2 text-red">No sales persons found</p>
            <v-select
              density="compact"
              clearable
              variant="outlined"
              color="primary"
              :label="frappe._('Sales Person')"
              v-model="sales_person"
              :items="sales_persons"
              item-title="title"
              item-value="value"
              bg-color="white"
              :no-data-text="__('Sales Person not found')"
              hide-details
              :disabled="readonly"
            ></v-select>
          </v-col>
        </v-row>
      </div>
    </v-card>

    <!-- Action Buttons -->
    <v-card flat class="cards mb-0 mt-3 py-0">
      <v-row align="start" no-gutters>
        <v-col cols="6">
          <v-btn block size="large" color="primary" theme="dark" @click="submit" :disabled="vaildatPayment">
            {{ __("Submit") }}
          </v-btn>
        </v-col>
        <v-col cols="6" class="pl-1">
          <v-btn block size="large" color="success" theme="dark" @click="submit(undefined, false, true)" :disabled="vaildatPayment">
            {{ __("Submit & Print") }}
          </v-btn>
        </v-col>
        <v-col cols="12">
          <v-btn block class="mt-2 pa-1" size="large" color="error" theme="dark" @click="back_to_invoice">
            {{ __("Cancel Payment") }}
          </v-btn>
        </v-col>
      </v-row>
    </v-card>

    <!-- Phone Payment Dialog -->
    <v-dialog v-model="phone_dialog" max-width="400px">
      <v-card>
        <v-card-title>
          <span class="text-h5 text-primary">{{ __("Confirm Mobile Number") }}</span>
        </v-card-title>
        <v-card-text class="pa-0">
          <v-container>
            <v-text-field
              density="compact"
              variant="outlined"
              color="primary"
              :label="frappe._('Mobile Number')"
              bg-color="white"
              hide-details
              v-model="invoice_doc.contact_mobile"
              type="number"
            ></v-text-field>
          </v-container>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="error" theme="dark" @click="phone_dialog = false">
            {{ __("Close") }}
          </v-btn>
          <v-btn color="primary" theme="dark" @click="request_payment">
            {{ __("Request") }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
// Importing format mixin for currency and utility functions
import format from "../../format";
export default {
  // Using format mixin for shared formatting methods
  mixins: [format],
  data() {
    return {
      loading: false,
      pos_profile: "",
      pos_settings: "",
      invoice_doc: null,
      invoiceType: "Invoice",
      is_return: false,
      loyalty_amount: 0,
      redeemed_customer_credit: 0,
      credit_change: 0,
      paid_change: 0,
      is_credit_sale: false,
      is_write_off_change: false,
      is_cashback: true,
      redeem_customer_credit: false,
      customer_credit_dict: [],
      paid_change_rules: [],
      phone_dialog: false,
      order_delivery_date: false,
      new_delivery_date: null,
      po_date_menu: false,
      new_po_date: null,
      date_menu: false,
      new_credit_due_date: null,
      customer_info: "",
      mpesa_modes: [],
      sales_persons: [],
      sales_person: "",
      addresses: [],
      is_user_editing_paid_change: false,
      is_offline: false,
      displayCurrency: '',
      currency_precision: 2,
      available_points_amount: 0,
      available_customer_credit: 0,
      request_payment_field: false
    };
  },
  computed: {
    currencySymbol() {
      return (currency) => {
        return get_currency_symbol(currency || this.invoice_doc.currency);
      };
    },
    displayCurrency() {
      return this.invoice_doc ? this.invoice_doc.currency : '';
    },
    total_payments() {
      let total = 0;
      if (this.invoice_doc && this.invoice_doc.payments) {
        this.invoice_doc.payments.forEach((payment) => {
          total += parseFloat(payment.amount) || 0;
        });
      }
      
      if (this.loyalty_amount) {
        if (this.invoice_doc.currency !== this.pos_profile.currency) {
          total += this.flt(this.loyalty_amount / (this.invoice_doc.conversion_rate || 1), this.currency_precision);
        } else {
          total += parseFloat(this.loyalty_amount) || 0;
        }
      }
      
      if (this.redeemed_customer_credit) {
        if (this.invoice_doc.currency !== this.pos_profile.currency) {
          total += this.flt(this.redeemed_customer_credit / (this.invoice_doc.conversion_rate || 1), this.currency_precision);
        } else {
          total += parseFloat(this.redeemed_customer_credit) || 0;
        }
      }
      
      return this.flt(total, this.currency_precision);
    },
    
    diff_payment() {
      if (!this.invoice_doc) return 0;
      
      let invoice_total;
      if (this.pos_profile.posa_allow_multi_currency && 
          this.invoice_doc.currency !== this.pos_profile.currency) {
        invoice_total = this.flt(this.invoice_doc.grand_total, this.currency_precision);
      } else {
        invoice_total = this.flt(this.invoice_doc.rounded_total || this.invoice_doc.grand_total, this.currency_precision);
      }
      
      let diff = this.flt(invoice_total - this.total_payments, this.currency_precision);
      
      if (this.invoice_doc.is_return) {
        return diff >= 0 ? diff : 0;
      }
      
      return diff >= 0 ? diff : 0;
    },
    
    credit_change() {
      let invoice_total;
      if (this.pos_profile.posa_allow_multi_currency && 
          this.invoice_doc.currency !== this.pos_profile.currency) {
        invoice_total = this.flt(this.invoice_doc.grand_total, this.currency_precision);
      } else {
        invoice_total = this.flt(this.invoice_doc.rounded_total || this.invoice_doc.grand_total, this.currency_precision);
      }
      
      let change = this.flt(this.total_payments - invoice_total, this.currency_precision);
      
      return change > 0 ? change : 0;
    },
    
    diff_label() {
      return this.diff_payment > 0 ? `To Be Paid (${this.displayCurrency})` : `Change (${this.displayCurrency})`;
    },
    total_payments_display() {
      return this.formatCurrency(this.total_payments, this.displayCurrency);
    },
    diff_payment_display() {
      return this.formatCurrency(this.diff_payment, this.displayCurrency);
    },
    available_points_amount() {
      let amount = 0;
      if (this.customer_info.loyalty_points) {
        amount = this.customer_info.loyalty_points * this.customer_info.conversion_factor;
        
        if (this.invoice_doc.currency !== this.pos_profile.currency) {
          amount = this.flt(amount / (this.invoice_doc.conversion_rate || 1), this.currency_precision);
        }
      }
      return amount;
    },
    available_customer_credit() {
      return this.customer_credit_dict.reduce((total, row) => total + this.flt(row.total_credit), 0);
    },
    vaildatPayment() {
      if (this.pos_profile.posa_allow_sales_order) {
        if (this.invoiceType === "Order" && !this.invoice_doc.posa_delivery_date) {
          return true;
        }
      }
      return false;
    },
    request_payment_field() {
      return this.pos_settings?.invoice_fields?.some(
        (el) => el.fieldtype === "Button" && el.fieldname === "request_for_payment"
      ) || false;
    },
  },
  watch: {
    diff_payment(newVal) {
      if (!this.is_user_editing_paid_change) {
        this.paid_change = -newVal;
      }
    },
    paid_change(newVal) {
      const changeLimit = -this.diff_payment;
      if (newVal > changeLimit) {
        this.paid_change = changeLimit;
        this.credit_change = 0;
        this.paid_change_rules = ["Paid change can not be greater than total change!"];
      } else {
        this.paid_change_rules = [];
        this.credit_change = this.flt(newVal - changeLimit, this.currency_precision);
      }
    },
    loyalty_amount(value) {
      if (value > this.available_points_amount) {
        this.invoice_doc.loyalty_amount = 0;
        this.invoice_doc.redeem_loyalty_points = 0;
        this.invoice_doc.loyalty_points = 0;
        this.loyalty_amount = 0;
        this.eventBus.emit("show_message", {
          title: `Loyalty Amount can not be more than ${this.available_points_amount}`,
          color: "error",
        });
      } else {
        this.invoice_doc.loyalty_amount = this.flt(this.loyalty_amount);
        this.invoice_doc.redeem_loyalty_points = 1;
        this.invoice_doc.loyalty_points = this.flt(this.loyalty_amount) / this.customer_info.conversion_factor;
      }
    },
    redeemed_customer_credit(newVal) {
      if (newVal > this.available_customer_credit) {
        this.redeemed_customer_credit = this.available_customer_credit;
        this.eventBus.emit("show_message", {
          title: `You can redeem customer credit up to ${this.available_customer_credit}`,
          color: "error",
        });
      }
    },
    sales_person(newVal) {
      if (newVal) {
        this.invoice_doc.sales_team = [
          {
            sales_person: newVal,
            allocated_percentage: 100,
          },
        ];
        console.log('Updated sales_team with sales_person:', newVal);
      } else {
        this.invoice_doc.sales_team = [];
        console.log('Cleared sales_team');
      }
    },
    is_credit_sale(newVal) {
      if (newVal) {
        this.invoice_doc.payments.forEach((payment) => {
          if (payment.mode_of_payment.toLowerCase() === 'cash') {
            payment.amount = 0;
          }
        });
      } else {
        this.invoice_doc.payments.forEach((payment) => {
          if (payment.mode_of_payment.toLowerCase() === 'cash') {
            payment.amount = this.invoice_doc.rounded_total || this.invoice_doc.grand_total;
          }
        });
      }
    },
  },
  methods: {
    back_to_invoice() {
      this.eventBus.emit("show_payment", "false");
      this.eventBus.emit("set_customer_readonly", false);
    },
    reset_cash_payments() {
      this.invoice_doc.payments.forEach((payment) => {
        if (payment.mode_of_payment.toLowerCase() === 'cash') {
          payment.amount = 0;
        }
      });
    },
    ensureReturnPaymentsAreNegative() {
      if (!this.invoice_doc || !this.invoice_doc.is_return) {
        return;
      }
      let hasPaymentSet = false;
      this.invoice_doc.payments.forEach(payment => {
        if (Math.abs(payment.amount) > 0) {
          hasPaymentSet = true;
        }
      });
      if (!hasPaymentSet) {
        const default_payment = this.invoice_doc.payments.find(payment => payment.default === 1);
        if (default_payment) {
          const amount = this.invoice_doc.rounded_total || this.invoice_doc.grand_total;
          default_payment.amount = -Math.abs(amount);
          if (default_payment.base_amount !== undefined) {
            default_payment.base_amount = -Math.abs(amount);
          }
        }
      }
      this.invoice_doc.payments.forEach(payment => {
        if (payment.amount > 0) {
          payment.amount = -Math.abs(payment.amount);
        }
        if (payment.base_amount !== undefined && payment.base_amount > 0) {
          payment.base_amount = -Math.abs(payment.base_amount);
        }
      });
    },
    async submit(is_credit_sale = false, is_cashback = true) {
      try {
        this.loading = true;
        console.log('Submitting payment with:', {
          is_credit_sale,
          is_cashback,
          is_offline: this.is_offline,
          invoice_doc: this.invoice_doc
        });
        
        if (!this.validatePayment()) {
          return;
        }
        
        if (this.is_offline) {
          await this.processOfflinePayment();
        } else {
          await this.processOnlinePayment();
        }
        
        this.clearPaymentForm();
        
        frappe.show_alert({
          message: __("Payment processed successfully"),
          indicator: 'green'
        });
        
      } catch (error) {
        console.error('Error submitting payment:', error);
        frappe.show_alert({
          message: __("Error processing payment: ") + (error.message || "Unknown error"),
          indicator: 'red'
        });
      } finally {
        this.loading = false;
      }
    },
    validatePayment() {
      if (!this.invoice_doc || !this.invoice_doc.payments) {
        frappe.show_alert({
          message: __("No payment data available"),
          indicator: 'red'
        });
        return false;
      }
      
      const total_payment = this.total_payments;
      const invoice_total = this.invoice_doc.rounded_total || this.invoice_doc.grand_total;
      
      if (Math.abs(total_payment - invoice_total) > 0.01) {
        frappe.show_alert({
          message: __("Total payment amount does not match invoice total"),
          indicator: 'red'
        });
        return false;
      }
      
      return true;
    },
    async processOfflinePayment() {
      console.log('Processing offline payment');
      
      if (this.offlineStorage) {
        await this.offlineStorage.storePayment(this.invoice_doc);
      }
      
      this.eventBus.emit("clear_invoice");
    },
    async processOnlinePayment() {
      console.log('Processing online payment');
      
      const response = await frappe.call({
        method: 'posawesome.posawesome.api.posapp.submit_payment',
        args: {
          invoice_doc: this.invoice_doc
        }
      });
      
      if (!response.message) {
        throw new Error('Failed to process payment');
      }
      
      this.eventBus.emit("clear_invoice");
    },
    clearPaymentForm() {
      this.invoice_doc = null;
      this.paid_change = 0;
      this.credit_change = 0;
      this.loyalty_amount = 0;
      this.redeemed_customer_credit = 0;
    },
    set_full_amount(idx) {
      const isReturn = this.invoice_doc.is_return || this.invoiceType === "Return";
      let totalAmount = this.invoice_doc.rounded_total || this.invoice_doc.grand_total;
      
      console.log('Setting full amount for payment method idx:', idx);
      console.log('Current payments:', JSON.stringify(this.invoice_doc.payments));

      this.invoice_doc.payments.forEach(payment => {
        payment.amount = 0;
        if (payment.base_amount !== undefined) {
          payment.base_amount = 0;
        }
      });

      const clickedButton = event?.target?.textContent?.trim();
      console.log('Clicked button text:', clickedButton);

      const clickedPayment = this.invoice_doc.payments.find(payment => 
        payment.mode_of_payment === clickedButton
      );

      if (clickedPayment) {
        console.log('Found clicked payment:', clickedPayment.mode_of_payment);
        let amount = isReturn ? -Math.abs(totalAmount) : totalAmount;
        clickedPayment.amount = amount;
        if (clickedPayment.base_amount !== undefined) {
          clickedPayment.base_amount = isReturn ? -Math.abs(amount) : amount;
        }
        console.log('Set amount for payment:', clickedPayment.mode_of_payment, 'amount:', amount);
      } else {
        console.log('No payment found for button text:', clickedButton);
      }

      this.$forceUpdate();
    },
    set_rest_amount(idx) {
      const isReturn = this.invoice_doc.is_return || this.invoiceType === "Return";
      this.invoice_doc.payments.forEach((payment) => {
        if (payment.idx === idx && payment.amount === 0 && this.diff_payment > 0) {
          let amount = this.diff_payment;
          if (isReturn) {
            amount = -Math.abs(amount);
          }
          payment.amount = amount;
          if (payment.base_amount !== undefined) {
            payment.base_amount = isReturn ? -Math.abs(amount) : amount;
          }
        }
      });
    },
    clear_all_amounts() {
      this.invoice_doc.payments.forEach((payment) => {
        payment.amount = 0;
      });
    },
    load_print_page() {
      const print_format =
        this.pos_profile.print_format_for_online || this.pos_profile.print_format;
      const letter_head = this.pos_profile.letter_head || 0;
      const url =
        frappe.urllib.get_base_url() +
        "/printview?doctype=Sales%20Invoice&name=" +
        this.invoice_doc.name +
        "&trigger_print=1" +
        "&format=" +
        print_format +
        "&no_letterhead=" +
        letter_head;
      const printWindow = window.open(url, "Print");
      printWindow.addEventListener(
        "load",
        function () {
          printWindow.print();
        },
        true
      );
    },
    validate_due_date() {
      const today = frappe.datetime.now_date();
      const new_date = Date.parse(this.invoice_doc.due_date);
      const parse_today = Date.parse(today);
      if (new_date < parse_today) {
        this.invoice_doc.due_date = today;
      }
    },
    shortPay(e) {
      if (e.key.toLowerCase() === "x" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        if (this.invoice_doc && this.invoice_doc.payments) {
          this.submit_invoice();
        }
      }
    },
    get_available_credit(use_credit) {
      this.clear_all_amounts();
      if (use_credit) {
        frappe.call("posawesome.posawesome.api.posapp.get_available_credit", {
          customer: this.invoice_doc.customer,
          company: this.pos_profile.company,
        }).then((r) => {
          const data = r.message;
          if (data.length) {
            const amount = this.invoice_doc.rounded_total || this.invoice_doc.grand_total;
            let remainAmount = amount;
            data.forEach((row) => {
              if (remainAmount > 0) {
                if (remainAmount >= row.total_credit) {
                  row.credit_to_redeem = row.total_credit;
                  remainAmount -= row.total_credit;
                } else {
                  row.credit_to_redeem = remainAmount;
                  remainAmount = 0;
                }
              } else {
                row.credit_to_redeem = 0;
              }
            });
            this.customer_credit_dict = data;
          } else {
            this.customer_credit_dict = [];
          }
        });
      } else {
        this.customer_credit_dict = [];
      }
    },
    get_addresses() {
      const vm = this;
      if (!vm.invoice_doc || !vm.invoice_doc.customer) {
        vm.addresses = [];
        return;
      }
      frappe.call({
        method: "posawesome.posawesome.api.posapp.get_customer_addresses",
        args: { customer: vm.invoice_doc.customer },
        async: true,
        callback: function (r) {
          if (!r.exc) {
            vm.addresses = r.message;
          } else {
            vm.addresses = [];
          }
        },
      });
    },
    addressFilter(item, queryText, itemText) {
      const searchText = queryText.toLowerCase();
      return (
        (item.address_title && item.address_title.toLowerCase().includes(searchText)) ||
        (item.address_line1 && item.address_line1.toLowerCase().includes(searchText)) ||
        (item.address_line2 && item.address_line2.toLowerCase().includes(searchText)) ||
        (item.city && item.city.toLowerCase().includes(searchText)) ||
        (item.name && item.name.toLowerCase().includes(searchText))
      );
    },
    new_address() {
      if (!this.invoice_doc || !this.invoice_doc.customer) {
        this.eventBus.emit("show_message", {
          title: __("Please select a customer first"),
          color: "error",
        });
        return;
      }
      this.eventBus.emit("open_new_address", this.invoice_doc.customer);
    },
    get_sales_person_names() {
      const vm = this;
      if (vm.pos_profile.posa_local_storage && localStorage.sales_persons_storage) {
        try {
          vm.sales_persons = JSON.parse(localStorage.getItem("sales_persons_storage"));
        } catch(e) {}
      }
      frappe.call({
        method: "posawesome.posawesome.api.posapp.get_sales_person_names",
        callback: function (r) {
          if (r.message && r.message.length > 0) {
            vm.sales_persons = r.message.map(sp => ({
              value: sp.name,
              title: sp.sales_person_name,
              sales_person_name: sp.sales_person_name,
              name: sp.name
            }));
            if (vm.pos_profile.posa_local_storage) {
              localStorage.setItem("sales_persons_storage", JSON.stringify(vm.sales_persons));
            }
          } else {
            vm.sales_persons = [];
          }
        },
      });
    },
    request_payment(payment) {
      this.phone_dialog = false;
      const vm = this;
      if (!this.invoice_doc.contact_mobile) {
        this.eventBus.emit("show_message", {
          title: __("Please set the customer's mobile number"),
          color: "error",
        });
        this.eventBus.emit("open_edit_customer");
        this.back_to_invoice();
        return;
      }
      this.eventBus.emit("freeze", { title: __("Waiting for payment...") });
      this.invoice_doc.payments.forEach((payment) => {
        payment.amount = this.flt(payment.amount);
      });
      let formData = { ...this.invoice_doc };
      formData["total_change"] = !this.invoice_doc.is_return ? -this.diff_payment : 0;
      formData["paid_change"] = !this.invoice_doc.is_return ? this.paid_change : 0;
      formData["credit_change"] = -this.credit_change;
      formData["redeemed_customer_credit"] = this.redeemed_customer_credit;
      formData["customer_credit_dict"] = this.customer_credit_dict;
      formData["is_cashback"] = this.is_cashback;
      frappe.call({
        method: "posawesome.posawesome.api.posapp.update_invoice",
        args: { data: formData },
        async: false,
        callback: function (r) {
          if (r.message) {
            vm.invoice_doc = r.message;
          }
        },
      }).then(() => {
        frappe.call({
          method: "posawesome.posawesome.api.posapp.create_payment_request",
          args: { doc: vm.invoice_doc },
        })
        .fail(() => {
          vm.eventBus.emit("unfreeze");
          vm.eventBus.emit("show_message", {
            title: __("Payment request failed"),
            color: "error",
          });
        })
        .then(({ message }) => {
          const payment_request_name = message.name;
          setTimeout(() => {
            frappe.db.get_value("Payment Request", payment_request_name, ["status", "grand_total"]).then(({ message }) => {
              if (message.status !== "Paid") {
                vm.eventBus.emit("unfreeze");
                vm.eventBus.emit("show_message", {
                  title: __("Payment Request took too long to respond. Please try requesting for payment again"),
                  color: "error",
                });
              } else {
                vm.eventBus.emit("unfreeze");
                vm.eventBus.emit("show_message", {
                  title: __("Payment of {0} received successfully.", [
                    vm.formatCurrency(message.grand_total, vm.invoice_doc.currency, 0),
                  ]),
                  color: "success",
                });
                frappe.db.get_doc("Sales Invoice", vm.invoice_doc.name).then((doc) => {
                  vm.invoice_doc = doc;
                  vm.submit(null, true);
                });
              }
            });
          }, 30000);
        });
      });
    },
    get_mpesa_modes() {
      const vm = this;
      frappe.call({
        method: "posawesome.posawesome.api.m_pesa.get_mpesa_mode_of_payment",
        args: { company: vm.pos_profile.company },
        async: true,
        callback: function (r) {
          if (!r.exc) {
            vm.mpesa_modes = r.message;
          } else {
            vm.mpesa_modes = [];
          }
        },
      });
    },
    is_mpesa_c2b_payment(payment) {
      if (this.mpesa_modes.includes(payment.mode_of_payment) && payment.type === "Bank") {
        payment.amount = 0;
        return true;
      } else {
        return false;
      }
    },
    mpesa_c2b_dialog(payment) {
      const data = {
        company: this.pos_profile.company,
        mode_of_payment: payment.mode_of_payment,
        customer: this.invoice_doc.customer,
      };
      this.eventBus.emit("open_mpesa_payments", data);
    },
    set_mpesa_payment(payment) {
      this.pos_profile.use_customer_credit = true;
      this.redeem_customer_credit = true;
      const invoiceAmount = this.invoice_doc.rounded_total || this.invoice_doc.grand_total;
      let amount = payment.unallocated_amount > invoiceAmount ? invoiceAmount : payment.unallocated_amount;
      amount = amount > 0 ? amount : 0;
      const advance = {
        type: "Advance",
        credit_origin: payment.name,
        total_credit: this.flt(payment.unallocated_amount),
        credit_to_redeem: this.flt(amount),
      };
      this.clear_all_amounts();
      this.customer_credit_dict.push(advance);
    },
    update_delivery_date() {
      this.invoice_doc.posa_delivery_date = this.formatDate(this.new_delivery_date);
    },
    update_po_date() {
      this.invoice_doc.po_date = this.formatDate(this.new_po_date);
    },
    update_credit_due_date() {
      this.invoice_doc.due_date = this.formatDate(this.new_credit_due_date);
    },
    formatDate(date) {
      if (!date) return null;
      const d = new Date(date);
      const year = d.getFullYear();
      const month = (`0${d.getMonth() + 1}`).slice(-2);
      const day = (`0${d.getDate()}`).slice(-2);
      return `${year}-${month}-${day}`;
    },
    showPaidAmount() {
      this.eventBus.emit("show_message", {
        title: `Total Paid Amount: ${this.formatCurrency(this.total_payments)}`,
        color: "info",
      });
    },
    showDiffPayment() {
      if (!this.invoice_doc) return;
      this.eventBus.emit("show_message", {
        title: `To Be Paid: ${this.formatCurrency(this.diff_payment)}`,
        color: "info",
      });
    },
    showPaidChange() {
      this.eventBus.emit("show_message", {
        title: `Paid Change: ${this.formatCurrency(this.paid_change)}`,
        color: "info",
      });
    },
    showCreditChange(value) {
      if (value > 0) {
        this.credit_change = value;
        this.paid_change = -this.diff_payment;
      } else {
        this.credit_change = 0;
      }
    },
    formatCurrency(value) {
      if (!value) return "0.00";
      return this.flt(value, this.currency_precision).toFixed(this.currency_precision);
    },
    get_change_amount() {
      return Math.max(0, this.total_payments - this.invoice_doc.grand_total);
    },
    initializePaymentFields() {
      if (!this.invoice_doc || !this.invoice_doc.payments) return;
      
      this.invoice_doc.payments.forEach(payment => {
        if (payment.amount === undefined || payment.amount === null) {
          payment.amount = 0;
        }
      });
      
      this.paid_change = 0;
      this.credit_change = 0;
      
      this.loyalty_amount = 0;
      this.redeemed_customer_credit = 0;
    },
  },
  created() {
    document.addEventListener("keydown", this.shortPay.bind(this));
  },
  mounted() {
    this.$nextTick(() => {
      this.eventBus.on("send_invoice_doc_payment", (data) => {
        try {
          console.log('Payments component received invoice doc:', data);
          this.invoice_doc = data;
          this.is_offline = data.is_offline || false;
          this.displayCurrency = data.currency || this.pos_profile.currency;
          this.currency_precision = this.pos_profile.currency_precision || 2;
          
          this.initializePaymentFields();
          
          this.is_credit_sale = this.pos_profile.allow_credit_sale || false;
          
          this.redeem_customer_credit = this.pos_profile.posa_allow_customer_credit || false;
          
          this.request_payment_field = this.pos_profile.posa_show_request_payment || false;
          
          console.log('Payment component initialized with:', {
            is_offline: this.is_offline,
            currency: this.displayCurrency,
            is_credit_sale: this.is_credit_sale,
            redeem_customer_credit: this.redeem_customer_credit
          });
        } catch (error) {
          console.error('Error handling invoice doc in Payments component:', error);
        }
      });
      this.eventBus.on("register_pos_profile", (data) => {
        this.pos_profile = data.pos_profile;
        this.get_mpesa_modes();
      });
      this.eventBus.on("add_the_new_address", (data) => {
        this.addresses.push(data);
        this.$forceUpdate();
      });
      this.eventBus.on("update_invoice_type", (data) => {
        this.invoiceType = data;
        if (this.invoice_doc && data !== "Order") {
          this.invoice_doc.posa_delivery_date = null;
          this.invoice_doc.posa_notes = null;
          this.invoice_doc.shipping_address_name = null;
        }
        if (this.invoice_doc && data === "Return") {
          this.invoice_doc.is_return = 1;
          this.ensureReturnPaymentsAreNegative();
        }
      });
      this.eventBus.on("update_customer", (customer) => {
        if (this.customer !== customer) {
          this.customer_credit_dict = [];
          this.redeem_customer_credit = false;
          this.is_cashback = true;
        }
      });
      this.eventBus.on("set_pos_settings", (data) => {
        this.pos_settings = data;
      });
      this.eventBus.on("set_customer_info_to_edit", (data) => {
        this.customer_info = data;
      });
      this.eventBus.on("set_mpesa_payment", (data) => {
        this.set_mpesa_payment(data);
      });
    });
  },
  beforeUnmount() {
    this.eventBus.off("send_invoice_doc_payment");
    this.eventBus.off("register_pos_profile");
    this.eventBus.off("add_the_new_address");
    this.eventBus.off("update_invoice_type");
    this.eventBus.off("update_customer");
    this.eventBus.off("set_pos_settings");
    this.eventBus.off("set_customer_info_to_edit");
    this.eventBus.off("set_mpesa_payment");
  },
  unmounted() {
    document.removeEventListener("keydown", this.shortPay);
  },
};
</script>

<style scoped>
.v-text-field {
  cursor: text;
}

.v-text-field:hover {
  background-color: rgba(var(--v-theme-primary), 0.05);
}

.v-text-field--readonly {
  cursor: text;
}

.v-text-field--readonly:hover {
  background-color: transparent;
}
</style>
