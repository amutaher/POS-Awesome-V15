#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Starting POS Awesome PWA build process...');

// Make sure the www directory exists
if (!fs.existsSync(path.join(__dirname))) {
  fs.mkdirSync(path.join(__dirname), { recursive: true });
}

try {
  // Run Vite build with PWA plugin
  console.log('Building PWA assets with Vite...');
  execSync('yarn vite build', { stdio: 'inherit' });
  
  console.log('PWA build completed successfully!');
  console.log('Service worker updated with automatic cache versioning.');
  
  // Create a success file for bench to check
  fs.writeFileSync(
    path.join(__dirname, 'pwa-build-success.txt'),
    `Build completed at ${new Date().toISOString()}\n`
  );
  
  console.log('PWA assets are ready for production use.');
} catch (error) {
  console.error('Error during PWA build:', error);
  process.exit(1);
} 