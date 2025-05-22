# POS Awesome Deployment Guide

## Installation from Source Code

1. Build the app:
   ```
   npm run build
   ```

2. Copy the build files to your Frappe site:
   ```
   cp -r posawesome/public/dist/* /path/to/site/public/posawesome/dist/
   ```

3. Update the server:
   ```
   bench --site site_name clear-cache
   bench --site site_name build
   ```

## Troubleshooting 404 Errors

If you see 404 errors for JS or CSS files, ensure:

1. The build files exist at the proper location on server
2. The hooks.py file is referencing the correct file paths
3. Clearing cache and rebuilding after any changes

## Known Issues

- Hash-based filenames can cause 404 errors on server if the cache isn't properly updated
- Always check console for specific error messages 