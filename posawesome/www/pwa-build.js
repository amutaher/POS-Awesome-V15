#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Starting POS Awesome PWA build process...');

// Make sure all necessary directories exist
const appDir = path.resolve(__dirname, '../..');
const publicDir = path.resolve(appDir, 'public');
const publicDistDir = path.resolve(__dirname, '../../public/dist');
const posawesomePublicDir = path.resolve(__dirname, '../../posawesome/public');
const posawesomeDistDir = path.resolve(__dirname, '../../posawesome/public/dist');
const distPublicDir = path.resolve(posawesomeDistDir, 'public');

// Create all required directories
for (const dir of [publicDir, publicDistDir, posawesomePublicDir, posawesomeDistDir, distPublicDir]) {
  if (!fs.existsSync(dir)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Create placeholder sw.js file
const swFile = path.join(publicDir, 'sw.js');
if (!fs.existsSync(swFile)) {
  console.log('Creating placeholder sw.js');
  fs.writeFileSync(swFile, `
// Placeholder service worker for build process
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => self.clients.claim());
  `);
}

try {
  // Run Vite build with PWA plugin
  console.log('Building PWA assets with Vite...');
  
  // Set NODE_ENV to production to avoid development warnings
  process.env.NODE_ENV = 'production';
  
  // Get the app directory (where package.json is located)
  console.log(`Using app directory: ${appDir}`);
  
  // Check if package.json exists
  if (!fs.existsSync(path.join(appDir, 'package.json'))) {
    console.error(`ERROR: package.json not found in ${appDir}`);
    process.exit(1);
  }
  
  // Run build command directly with npx to avoid yarn path issues
  execSync('npx vite build', { 
    stdio: 'inherit',
    cwd: appDir,
    env: { ...process.env, FORCE_COLOR: true }
  });
  
  // After build completes, ensure service worker is correctly placed
  const generatedSwMjs = path.join(posawesomeDistDir, 'public', 'sw.mjs');
  const generatedSwJs = path.join(posawesomeDistDir, 'public', 'sw.js');
  const finalSwJs = path.join(posawesomeDistDir, 'service-worker.js');
  
  // If sw.mjs exists but sw.js doesn't, do the rename manually
  if (fs.existsSync(generatedSwMjs) && !fs.existsSync(generatedSwJs)) {
    console.log(`Manually renaming ${generatedSwMjs} to ${generatedSwJs}`);
    fs.copyFileSync(generatedSwMjs, generatedSwJs);
  }
  
  // Copy service worker to final location if needed
  if (fs.existsSync(generatedSwJs) && !fs.existsSync(finalSwJs)) {
    console.log(`Copying service worker to final location: ${finalSwJs}`);
    fs.copyFileSync(generatedSwJs, finalSwJs);
  }
  
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