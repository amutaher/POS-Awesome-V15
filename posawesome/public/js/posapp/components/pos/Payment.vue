<template>
  <!-- No changes to template section -->
</template>

<script>
export default {
  created: function () {
    this.eventBus.on('show_payment', async (data) => {
      try {
        this.dialog = true;
        
        if (data.offline) {
          // Handle offline mode
          this.invoice_doc = data.invoice_data;
          this.payments = data.invoice_data.payments;
          this.grand_total = data.invoice_data.grand_total;
          this.currency = data.invoice_data.currency;
        } else {
          // Handle online mode
          this.invoice_doc = data.invoice_doc;
          
          // Only fetch additional data in online mode
          if (navigator.onLine) {
            await this.get_addresses();
            await this.get_sales_person_names();
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
    // No changes to methods section
  }
};
</script>

<style>
  /* No changes to style section */
</style> 