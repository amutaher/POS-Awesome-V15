# POS Awesome Offline Functionality Guide

This guide explains how to use the offline features of POS Awesome to continue working even when you lose internet connectivity.

## Overview

POS Awesome implements a Progressive Web App (PWA) architecture which allows you to:

1. Continue working even without an internet connection
2. Create invoices while offline
3. Automatically sync data when connection is restored
4. Install the app on your device for better offline experience

## How to Prepare for Offline Use

To ensure you can work effectively offline, follow these steps:

### First-time Setup

1. **Use the app online first**: Before going offline, use the app online to cache necessary data
2. **Log in to your account**: Make sure you're properly logged in
3. **Browse key areas**: Visit the main screens (POS, Items, Customers) while online to cache data
4. **Open important items**: Browse through your frequently used items to ensure they're cached
5. **Install as PWA** (optional but recommended):
   - In Chrome/Edge: Click the install icon (➕) in the address bar
   - In Safari (iOS): Tap the share button and select "Add to Home Screen"

### What Data is Available Offline

When offline, you'll have access to:

- Items and prices that you've previously viewed
- Customer information you've accessed before
- POS profile configurations
- Recent draft invoices

### Creating Invoices Offline

1. When you lose connectivity, you'll see an offline indicator at the top of the screen
2. You can continue creating new invoices as usual
3. When you submit an invoice while offline:
   - It will be stored locally on your device
   - You'll see a confirmation that it was saved offline
   - A count of pending invoices will be displayed

### What Won't Work Offline

Some features require an internet connection:

- Creating new customers
- Searching for items not previously cached
- Accessing reports and analytics
- Some configurations and settings

## When You're Back Online

When your connection is restored:

1. The offline indicator will disappear
2. Pending invoices will automatically begin syncing to the server
3. You'll see a sync status notification
4. Once complete, you'll get a confirmation

### Handling Sync Failures

If some invoices fail to sync:

1. You'll see a notification showing failed invoices
2. You can review the errors for each failed invoice
3. Use the "Retry All" button to attempt syncing them again
4. If problems persist, you may need to manually adjust and resubmit them

## Best Practices for Offline Use

1. **Regular online use**: Connect regularly to sync data and update cached content
2. **Prepare before going offline**: If you know you'll be offline, browse relevant items first
3. **Install as PWA**: For the best offline experience, install the app on your device
4. **Check sync status**: After reconnecting, always verify all invoices synced successfully 
5. **Don't clear browser data**: Cached data is stored in your browser; clearing it will remove offline capabilities

## Troubleshooting

### The app isn't working offline
- Make sure you've used the app online first to cache data
- Verify your browser supports service workers (most modern browsers do)
- Try reinstalling the PWA

### Pending invoices aren't syncing
- Check your internet connection quality
- Try manually triggering a sync by clicking the sync button
- Restart the app or refresh the page

### App shows errors when offline
- Some functions require server connectivity and cannot work offline
- Try using alternative workflows that are supported offline
- Ensure you've cached the necessary data while online

## Data Security

Your offline data is securely stored in your browser's IndexedDB storage. It's only accessible by the POS Awesome application and is encrypted when in transmission once back online.

For additional questions or support, please contact your system administrator. 