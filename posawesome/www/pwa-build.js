#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Starting POS Awesome PWA build process...');

// Make sure directories exist
const publicDistDir = path.resolve(__dirname, '../../public/dist');
if (!fs.existsSync(publicDistDir)) {
  console.log(`Creating public dist directory: ${publicDistDir}`);
  fs.mkdirSync(publicDistDir, { recursive: true });
}

try {
  // Run Vite build with PWA plugin
  console.log('Building PWA assets with Vite...');
  
  // Set NODE_ENV to production to avoid development warnings
  process.env.NODE_ENV = 'production';
  
  // Run the build command with full path to ensure correct resolution
  const rootDir = path.resolve(__dirname, '../../..');
  
  execSync('yarn build:pwa', { 
    stdio: 'inherit',
    cwd: rootDir,
    env: { ...process.env, FORCE_COLOR: true }
  });
  
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
  
  // Create a failure file for diagnostics
  fs.writeFileSync(
    path.join(__dirname, 'pwa-build-error.txt'),
    `Build failed at ${new Date().toISOString()}\nError: ${error.message}\n`
  );
  
  process.exit(1);
} 