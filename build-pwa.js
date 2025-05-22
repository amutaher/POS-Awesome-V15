#!/usr/bin/env node

/**
 * Custom build script for POS Awesome PWA
 * This script is designed to be called by bench build system
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('=== POS Awesome PWA Build Tool ===');

// Ensure all required directories exist
const directories = [
  'public',
  'public/dist',
  'posawesome/public/dist',
  'posawesome/public/dist/public'
];

directories.forEach(dir => {
  const dirPath = path.resolve(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    console.log(`Creating directory: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Create placeholder sw.js file if it doesn't exist
const swFile = path.join(__dirname, 'public', 'sw.js');
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
  
  // Ensure service worker is in the right place
  const generatedSwJs = path.join(__dirname, 'posawesome/public/dist/public/sw.js');
  const finalSwJs = path.join(__dirname, 'posawesome/public/dist/service-worker.js');
  
  if (fs.existsSync(generatedSwJs) && !fs.existsSync(finalSwJs)) {
    console.log(`Copying service worker to final location: ${finalSwJs}`);
    fs.copyFileSync(generatedSwJs, finalSwJs);
  }
  
  console.log('PWA build completed successfully!');
  
} catch (error) {
  console.error('Error during build process:', error.message);
  
  // Create a failure file for diagnostics
  const errorLogPath = path.join(__dirname, 'pwa-build-error.log');
  fs.writeFileSync(
    errorLogPath,
    `Build failed at ${new Date().toISOString()}\nError: ${error.message}\n`
  );
  console.error(`Error log written to: ${errorLogPath}`);
  
  process.exit(1);
}
