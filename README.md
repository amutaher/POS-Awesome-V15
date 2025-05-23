<div align="center">
    <img src="https://frappecloud.com/files/pos.png" height="128">
    <h2>POS AWESOME</h2>
</div>

#### An open-source Point of Sale for [Erpnext](https://github.com/frappe/erpnext) using [Vue.js](https://github.com/vuejs/vue) and [Vuetify](https://github.com/vuetifyjs/vuetify) (VERSION 15 Support)

---

### Main Features

1. Supports Erpnext Version 15
2. Supports Multi-Currency Transactions.
    Customers can be invoiced in different currencies
    Exchange Rate is fetched automatically based on selected currency
    Invoices made with posawesome display Grand Total in both base and selected currency in erpnext.
    
3. User-friendly and provides a good user experience and speed of use
4. The cashier can either use list view or card view during sales transactions. Card view shows the images of the items
5. Supports enqueue invoice submission after printing the receipt for faster processing
6. Supports batch & serial numbering
7. Supports batch-based pricing
8. Supports UOM-specific barcode and pricing
9. Supports sales of scale (weighted) products
10. Ability to make returns from POS
11. Supports Making returns for either cash or customer credit
12. Supports using customer credit notes for payment
13. Supports credit sales
14. Allows the user to choose a due date for credit sales
15. Supports customer loyalty points
16. Shortcut keys
17. Supports Customer Discount
18. Supports POS Offers
19. Auto-apply batches for bundle items
20. Search and add items by Serial Number
21. Create Sales Orders from POS directly
22. Supports template items with variants
23. Supports multiple languages
24. Supports Mpesa mobile payment
25. POS Coupons
26. Supports Referral Code
27. Supports Customer and Customer Group price list
28. Supports Sales Person
29. Supports Delivery Charges
30. Search and add items by Batch Number
31. Accept new payments from customers against existing invoices
32. Payments Reconciliation
33. Automatic cache versioning for PWA using Workbox

### How to Install

#### Self Hosting:

1. `bench get-app https://github.com/defendicon/POS-Awesome-V15`
2. `bench setup requirements`
3. `bench build --app posawesome`
4. `bench restart`
5. `bench --site [your.site.name] install-app posawesome`
6. `bench --site [your.site.name] migrate`

---

### How To Use:

[POS Awesome Wiki](https://github.com/yrestom/POS-Awesome/wiki)

---

### Shortcuts:

- `CTRL or CMD + S` open payments
- `CTRL or CMD + X` submit payments
- `CTRL or CMD + D` remove the first item from the top
- `CTRL or CMD + A` expand the first item from the top
- `CTRL or CMD + E` focus on discount field

---

### Dependencies:

- [Frappe](https://github.com/frappe/frappe)
- [Erpnext](https://github.com/frappe/erpnext)
- [Vue.js](https://github.com/vuejs/vue)
- [Vuetify.js](https://github.com/vuetifyjs/vuetify)

---

### Contributing

1. [Issue Guidelines](https://github.com/frappe/erpnext/wiki/Issue-Guidelines)
2. [Pull Request Requirements](https://github.com/frappe/erpnext/wiki/Contribution-Guidelines)

---

### License

GNU/General Public License (see [license.txt](https://github.com/yrestom/POS-Awesome/blob/master/license.txt))

The POS Awesome code is licensed as GNU General Public License (v3)

## Deployment Notes

When deploying POS Awesome to production, if you encounter 404 errors for JavaScript or CSS files, follow these steps:

1. Ensure the app is correctly installed:
   ```
   bench --site your_site_name list-apps
   ```

2. Rebuild the frontend assets with non-hashed filenames:
   ```
   npm run build
   ```

3. Clear the cache and rebuild:
   ```
   bench --site your_site_name clear-cache
   bench --site your_site_name build
   ```

4. If issues persist, check that the JS/CSS files are correctly referenced in hooks.py and properly copied to your site's public directory.

5. You may need to manually copy the dist files:
   ```
   cp -r posawesome/public/dist/* /path/to/frappe/sites/your_site_name/public/posawesome/dist/
   ```

Remember that after updating your code, you need to rebuild the frontend and clear the cache.

# Backend Validation Drift Handling

## Overview
This update implements improved schema validation, API versioning, and detailed error handling for the POS Awesome application. It helps detect and communicate server-side schema changes to the client, provides meaningful error messages, and allows for graceful handling of validation failures.

## Key Features
1. **API Versioning** - Implemented API version tracking to detect client/server mismatches
2. **Schema Validation** - Added server-side schema validation with detailed error reporting
3. **Detailed Error Messages** - Improved error handling to show specific validation failures
4. **Idempotency Support** - Enhanced idempotency with better error caching
5. **UI Components** - Added a new SchemaErrorDialog component to display validation errors

## Implementation Details

### Backend (Python)
1. **API Version Constant** - Added `API_VERSION` constant to track API changes
2. **Schema Definitions** - Added JSON schema definitions for invoice and additional data
3. **Validate Schema Function** - Created a robust schema validation function
4. **Error Handling** - Enhanced submit_invoice and submit_in_background_job with better error handling
5. **Version Endpoint** - Added get_api_version endpoint to expose API details to clients

### Frontend (JavaScript/Vue)
1. **API Service** - Created a new apiService for centralized API communication
2. **Schema Error Dialog** - Added a new Vue component to display validation errors
3. **Home Component** - Updated to initialize API service and display schema errors
4. **Error Event Handling** - Added event listeners for schema validation errors

## How It Works
1. When a client makes a request, it includes its API version in the headers
2. The server validates this version against its own version
3. If there's a mismatch, it returns an error with version details
4. For valid versions, it validates the request data against the schema
5. Any validation errors are returned with detailed information about the issues
6. The client displays these errors in a user-friendly dialog

## Benefits
1. **Resilience** - Better handling of API changes and validation errors
2. **Transparency** - Clear error messages for debugging and user feedback
3. **Security** - Stronger validation of input data
4. **Compatibility** - Detection of client/server version mismatches
5. **Maintainability** - Centralized schema definitions for easier updates

## Future Improvements
1. Implement semantic versioning with compatibility checks
2. Add schema migration support for graceful handling of changes
3. Enhance client-side validation to match server schemas
4. Add automatic retry mechanisms for recoverable errors
5. Implement schema documentation generation
