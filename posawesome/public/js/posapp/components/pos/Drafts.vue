<template>
  <v-row justify="center">
    <v-dialog v-model="draftsDialog" max-width="900px">
      <!-- <template v-slot:activator="{ on, attrs }">
        <v-btn color="primary" theme="dark" v-bind="attrs" v-on="on">Open Dialog</v-btn>
      </template>-->
      <v-card variant="flat" color="white">
        <v-card-title>
          <span class="text-h5 text-primary">{{
            __('Load Sales Invoice')
            }}</span>
        </v-card-title>
        <v-card-subtitle>
          <span class="text-primary">{{
            __('Load previously saved invoices')
            }}</span>
        </v-card-subtitle>
        <v-card-text class="pa-0">
          <v-container>
            <v-row no-gutters>
              <v-col cols="12" class="pa-1">
                <v-data-table :headers="headers" :items="dialog_data" item-value="name" class="elevation-1" show-select
                  v-model="selected" select-strategy="single" return-object>
                  <template v-slot:item.posting_time="{ item }">
                    {{ item.posting_time.split('.')[0] }}
                  </template>
                  <template v-slot:item.grand_total="{ item }">
                    {{ currencySymbol(item.currency) }}
                    {{ formatCurrency(item.grand_total) }}
                  </template>
                </v-data-table>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="error" theme="dark" @click="close_dialog">Close</v-btn>
          <v-btn color="success" theme="dark" @click="submit_dialog">Load Sale</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-row>
</template>

<script>

import format from '../../format';
export default {
  // props: ["draftsDialog"],
  mixins: [format],
  data: () => ({
    draftsDialog: false,
    singleSelect: true,
    selected: [],
    dialog_data: {},
    headers: [
      {
        title: __('Customer'),
        value: 'customer_name',
        align: 'start',
        sortable: true,
      },
      {
        title: __('Date'),
        align: 'start',
        sortable: true,
        value: 'posting_date',
      },
      {
        title: __('Time'),
        align: 'start',
        sortable: true,
        value: 'posting_time',
      },
      {
        title: __('Invoice'),
        value: 'name',
        align: 'start',
        sortable: true,
      },
      {
        title: __('Amount'),
        value: 'grand_total',
        align: 'end',
        sortable: false,
      },
    ],
  }),
  watch: {},
  methods: {
    close_dialog() {
      this.draftsDialog = false;
    },

    async get_sales_person_names() {
      try {
        // Skip in offline mode
        if (!navigator.onLine) {
          return [];
        }
        const result = await frappe.call({
          method: 'posawesome.posawesome.api.posapp.get_sales_person_names',
        });
        return result.message || [];
      } catch (error) {
        console.error('Error getting sales persons:', error);
        return [];
      }
    },

    async submit_invoice(invoice_data) {
      try {
        // Handle offline mode
        if (!navigator.onLine) {
          // Store draft for offline processing
          const offlineDraft = {
            ...invoice_data,
            created_at: new Date().toISOString(),
            status: 'pending'
          };
          
          // Store in localStorage
          const offlineDrafts = JSON.parse(localStorage.getItem('offline_drafts') || '[]');
          offlineDrafts.push(offlineDraft);
          localStorage.setItem('offline_drafts', JSON.stringify(offlineDrafts));
          
          return {
            success: true,
            offline: true,
            message: 'Draft saved for offline processing'
          };
        }

        // Online mode
        const result = await frappe.call({
          method: 'posawesome.posawesome.api.posapp.submit_invoice',
          args: { invoice: invoice_data },
        });
        return result;
      } catch (error) {
        console.error('Error submitting invoice:', error);
        if (!navigator.onLine) {
          return {
            success: true,
            offline: true,
            message: 'Draft saved for offline processing'
          };
        }
        throw error;
      }
    },

    async submit() {
      try {
        if (!this.invoice_doc) {
          this.showError('No invoice to submit');
          return;
        }

        // Handle offline mode
        if (!navigator.onLine) {
          const result = await this.submit_invoice(this.invoice_doc);
          if (result.offline) {
            this.showInfo(result.message);
            this.$emit('close');
            return;
          }
        }

        // Online mode
        const result = await this.submit_invoice(this.invoice_doc);
        if (result.success) {
          this.showSuccess('Invoice submitted successfully');
          this.$emit('close');
        } else {
          this.showError(result.message || 'Failed to submit invoice');
        }
      } catch (error) {
        console.error('Submit error:', error);
        this.showError('Failed to submit: ' + error.message);
      }
    },

    showSuccess(message) {
      this.eventBus.emit('show_message', {
        title: __(message),
        color: 'success'
      });
    },

    showError(message) {
      this.eventBus.emit('show_message', {
        title: __(message),
        color: 'error'
      });
    },

    showInfo(message) {
      this.eventBus.emit('show_message', {
        title: __(message),
        color: 'info'
      });
    },

    submit_dialog() {
      if (this.selected.length > 0) {
        // Validate selected invoice data
        const invoice = this.selected[0];
        if (!invoice) {
          this.showError('Invalid invoice data');
          return;
        }

        // Initialize required properties if not present
        if (!invoice.payments) {
          invoice.payments = [];
        }

        if (!invoice.items) {
          invoice.items = [];
        }

        // Ensure other required properties exist
        invoice.is_return = invoice.is_return || false;
        invoice.grand_total = invoice.grand_total || 0;
        invoice.rounded_total = invoice.rounded_total || invoice.grand_total;

        // Load the invoice
        this.eventBus.emit('load_invoice', invoice);
        this.draftsDialog = false;
      }
      else {
        this.eventBus.emit("show_message", {
          title: `Select an invoice to load`,
          color: "error",
        });
      }
    },
  },
  created: function () {
    this.eventBus.on('open_drafts', (data) => {
      this.draftsDialog = true;
      this.dialog_data = data;
    });
  },
  beforeUnmount() {
    this.eventBus.off('open_drafts');
  },
};
</script>
