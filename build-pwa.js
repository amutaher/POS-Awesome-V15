#!/usr/bin/env node

/**
 * Custom build script for POS Awesome PWA
 * This script is designed to be called by bench build system
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('=== POS Awesome PWA Build Tool ===');

// Ensure public directory exists
const publicDir = path.resolve(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  console.log('Creating public directory');
  fs.mkdirSync(publicDir, { recursive: true });
}

// Create placeholder sw.js file if it doesn't exist
const swFile = path.join(publicDir, 'sw.js');
if (!fs.existsSync(swFile)) {
  console.log('Creating placeholder service worker file');
  fs.writeFileSync(swFile, `
// Placeholder service worker for build process
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => self.clients.claim());
  `);
}

try {
  // Run the build script
  console.log('Running PWA build...');
  
  // We need to use the node process directly with the correct script
  const buildScriptPath = path.resolve(__dirname, 'posawesome/www/pwa-build.js');
  
  if (!fs.existsSync(buildScriptPath)) {
    throw new Error(`Build script not found at: ${buildScriptPath}`);
  }
  
  // Execute the build script with Node.js
  execSync(`node "${buildScriptPath}"`, {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  console.log('PWA build completed successfully!');
  
} catch (error) {
  console.error('Error during build process:', error.message);
  process.exit(1);
}
