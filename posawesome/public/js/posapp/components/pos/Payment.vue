<template>
  <v-row justify="center">
    <v-dialog v-model="dialog" persistent max-width="600px">
      <v-card>
        <v-card-title>
          <span class="text-h5">{{ __('Payment') }}</span>
        </v-card-title>
        <v-card-text>
          <v-container>
            <v-row>
              <v-col cols="12" sm="6" md="6">
                <v-text-field
                  v-model="grand_total"
                  :label="__('Amount')"
                  readonly
                  outlined
                  dense
                  :prefix="currency"
                ></v-text-field>
              </v-col>
              <v-col cols="12" sm="6" md="6">
                <v-select
                  v-model="selected_mode"
                  :items="payment_types"
                  :label="__('Payment Type')"
                  outlined
                  dense
                  :disabled="offline_mode"
                ></v-select>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="error" @click="close_dialog">
            {{ __('Close') }}
          </v-btn>
          <v-btn color="success" @click="submit_dialog">
            {{ __('Submit') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-row>
</template>

<script>
export default {
  data: () => ({
    dialog: false,
    offline_mode: false,
    invoice_doc: null,
    payments: [],
    grand_total: 0,
    currency: '',
    selected_mode: 'Cash',
    payment_types: ['Cash', 'Card', 'Multiple'],
  }),

  created: function () {
    this.eventBus.on('show_payment', async (data) => {
      try {
        this.dialog = true;
        
        if (typeof data === 'object' && data.offline) {
          // Handle offline mode
          this.offline_mode = true;
          this.invoice_doc = data.invoice_data;
          this.payments = data.invoice_data.payments || [];
          this.grand_total = data.invoice_data.grand_total || 0;
          this.currency = data.invoice_data.currency || 'PKR';
          this.selected_mode = 'Cash'; // Force cash payment in offline mode
        } else {
          // Handle online mode
          this.offline_mode = false;
          this.invoice_doc = typeof data === 'object' ? data.invoice_doc : null;
          
          // Only fetch additional data in online mode
          if (navigator.onLine && this.invoice_doc) {
            try {
              await this.get_addresses();
              await this.get_sales_person_names();
              // Set payment details from invoice doc
              this.grand_total = this.invoice_doc.grand_total || 0;
              this.currency = this.invoice_doc.currency || 'PKR';
            } catch (error) {
              console.error('Failed to fetch additional data:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error in payment dialog:', error);
        this.eventBus.emit('show_message', {
          title: __('Error loading payment dialog'),
          color: 'error'
        });
      }
    });
  },

  methods: {
    close_dialog() {
      this.dialog = false;
      this.reset_form();
    },

    reset_form() {
      this.offline_mode = false;
      this.invoice_doc = null;
      this.payments = [];
      this.grand_total = 0;
      this.currency = '';
      this.selected_mode = 'Cash';
    },

    async submit_dialog() {
      try {
        if (this.offline_mode) {
          // Handle offline submission
          this.eventBus.emit('payment_complete', {
            offline: true,
            payment: {
              mode_of_payment: 'Cash',
              amount: this.grand_total,
              currency: this.currency
            }
          });
          this.showInfo('Payment will be processed when online');
        } else {
          // Handle online submission
          if (!navigator.onLine) {
            this.showError('Cannot process payment while offline');
            return;
          }
          
          // Process normal payment
          await this.process_payment();
        }
        
        this.close_dialog();
      } catch (error) {
        console.error('Payment submission error:', error);
        this.showError('Failed to process payment');
      }
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
    }
  }
};
</script>

<style scoped>
.v-dialog {
  background-color: white;
}
</style> 