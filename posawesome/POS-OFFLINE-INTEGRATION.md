# POS Offline Integration Guide

This guide explains how to integrate the offline functionality into the existing POS components.

## 1. Import Offline Mixin

In your main `Pos.vue` file:

```javascript
// Add this import
import OfflineMixin from '../mixins/offline-mixin';

export default {
  // Add the mixin
  mixins: [OfflineMixin],
  
  // Your existing component code...
}
```

## 2. Add Offline UI Elements

Add these UI elements to your template:

```html
<!-- Add in your toolbar/header area -->
<v-chip
  v-if="!isOnline"
  color="error"
  small
  class="mr-2"
>
  <v-icon left small>mdi-wifi-off</v-icon>
  Offline Mode
</v-chip>

<v-chip
  v-if="pendingCount > 0"
  color="warning"
  small
  class="mr-2"
  @click="showPendingDialog = true"
>
  <v-icon left small>mdi-sync</v-icon>
  {{ pendingCount }} Pending
</v-chip>

<!-- Add this banner at the top of your main content area -->
<v-alert
  v-if="!isOnline"
  dense
  text
  type="warning"
  class="ma-2"
>
  You are working offline. Transactions will be synced when you reconnect.
</v-alert>

<!-- Add this dialog somewhere in your template -->
<v-dialog v-model="showPendingDialog" max-width="500">
  <v-card>
    <v-card-title>Pending Transactions</v-card-title>
    <v-card-text>
      <v-list dense>
        <v-list-item v-for="(invoice, index) in pendingInvoices" :key="index">
          <v-list-item-icon>
            <v-icon v-if="invoice.status === 'pending'">mdi-clock-outline</v-icon>
            <v-icon v-else-if="invoice.status === 'error'" color="error">mdi-alert-circle</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>{{ invoice.createdAt | formatDate }}</v-list-item-title>
            <v-list-item-subtitle v-if="invoice.error">Error: {{ invoice.error }}</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-card-text>
    <v-card-actions>
      <v-spacer></v-spacer>
      <v-btn
        color="primary"
        text
        @click="syncNow"
        :disabled="!isOnline"
      >
        Sync Now
      </v-btn>
      <v-btn
        text
        @click="showPendingDialog = false"
      >
        Close
      </v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>
```

## 3. Modify API Calls

Replace your existing API calls with offline-aware versions:

### Loading Items

```javascript
// Original method
async loadItems() {
  // Your existing code...
  const response = await frappe.call({
    method: 'posawesome.posawesome.api.posapp.get_items',
    args: {
      pos_profile: JSON.stringify(this.pos_profile),
      // other args...
    }
  });
  this.items = response.message.items;
},

// Modified method
async loadItems() {
  const items = await this.loadItemsOffline(async () => {
    const response = await this.callAPI('posawesome.posawesome.api.posapp.get_items', {
      pos_profile: JSON.stringify(this.pos_profile),
      // other args...
    }, { offlineSupport: true });
    
    return response.message.items;
  });
  
  this.items = items;
},
```

### Loading Customers

```javascript
// Original method
async loadCustomers() {
  // Your existing code...
  const response = await frappe.call({
    method: 'posawesome.posawesome.api.posapp.get_customer_names',
    args: {
      // args...
    }
  });
  this.customers = response.message;
},

// Modified method
async loadCustomers() {
  const customers = await this.loadCustomersOffline(async () => {
    const response = await this.callAPI('posawesome.posawesome.api.posapp.get_customer_names', {
      // args...
    }, { offlineSupport: true });
    
    return response.message;
  });
  
  this.customers = customers;
},
```

### Submitting Invoices

```javascript
// Original method
async submitOrder() {
  // Your validation code...
  
  const response = await frappe.call({
    method: 'posawesome.posawesome.api.posapp.submit_invoice',
    args: {
      invoice: this.pos_invoice,
      data: {
        // your data...
      }
    }
  });
  
  // Success handling...
},

// Modified method
async submitOrder() {
  // Your validation code...
  
  try {
    const response = await this.callAPI('posawesome.posawesome.api.posapp.submit_invoice', {
      invoice: this.pos_invoice,
      data: {
        // your data...
      }
    }, { isInvoice: true, offlineSupport: true });
    
    if (response.offline) {
      // Handle offline case
      frappe.show_alert({
        message: __('Invoice saved offline and will sync when online'),
        indicator: 'blue'
      });
      
      // Reset cart
      this.reset_cart();
    } else {
      // Handle online success case as usual
      // Your existing success handling code
    }
  } catch (error) {
    // Handle errors
    console.error('Error submitting order:', error);
    frappe.show_alert({
      message: __('Failed to submit order: ') + error.message,
      indicator: 'red'
    });
  }
},
```

## 4. Filters for Date Formatting

Add this to your component if not already present:

```javascript
filters: {
  formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return date.toLocaleString();
  }
},
```

## 5. Testing

After integrating the offline functionality:

1. Test in online mode to ensure everything works normally
2. Disable network (use browser DevTools or disconnect from WiFi)
3. Verify that the app shows offline indicators
4. Try to load items and customers (should load from cache)
5. Create a transaction while offline
6. Reconnect to network and verify that the transaction syncs
7. Check for any errors in the console

## Troubleshooting

If you encounter issues:

- Check browser console for errors
- Verify that the service worker is registered correctly
- Clear IndexedDB if there are data issues (use browser DevTools > Application > IndexedDB)
- Make sure all required files are properly loaded 