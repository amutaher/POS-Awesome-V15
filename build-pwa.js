#!/usr/bin/env node

/**
 * PWA build script for POS Awesome
 * This script will be called by bench build -app 
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Paths relative to the root of the app
const PWA_ROOT_DIR = path.resolve(__dirname);
const DIST_DIR = path.resolve(PWA_ROOT_DIR, 'posawesome/public/dist');

console.log('Building POS Awesome PWA...');

try {
  // Check if package.json exists
  if (!fs.existsSync(path.join(PWA_ROOT_DIR, 'package.json'))) {
    console.error('Error: package.json not found in root directory');
    process.exit(1);
  }
  
  // Install dependencies if node_modules doesn't exist or if uuid is missing
  if (!fs.existsSync(path.join(PWA_ROOT_DIR, 'node_modules')) || 
      !fs.existsSync(path.join(PWA_ROOT_DIR, 'node_modules/uuid'))) {
    console.log('Installing or updating dependencies...');
    
    try {
      // First try yarn
      execSync('yarn install', { stdio: 'inherit', cwd: PWA_ROOT_DIR });
    } catch (e) {
      // If yarn fails, try npm
      console.log('Yarn failed, trying npm install...');
      execSync('npm install', { stdio: 'inherit', cwd: PWA_ROOT_DIR });
    }
    
    // Verify uuid is installed
    if (!fs.existsSync(path.join(PWA_ROOT_DIR, 'node_modules/uuid'))) {
      console.log('Installing uuid package specifically...');
      try {
        execSync('npm install uuid', { stdio: 'inherit', cwd: PWA_ROOT_DIR });
      } catch (e) {
        console.error('Failed to install uuid package:', e);
        process.exit(1);
      }
    }
  }
  
  // Run build command
  console.log('Building frontend assets...');
  try {
    execSync('npm run build', { stdio: 'inherit', cwd: PWA_ROOT_DIR });
  } catch (e) {
    console.log('npm build failed, trying direct vite build...');
    execSync('npx vite build', { stdio: 'inherit', cwd: PWA_ROOT_DIR });
  }
  
  // Copy necessary files from dist to public
  if (fs.existsSync(DIST_DIR)) {
    console.log('Copying service worker and assets to public directory...');
    
    // Ensure sw.js exists in the dist directory
    if (fs.existsSync(path.join(DIST_DIR, 'sw.js'))) {
      fs.copyFileSync(
        path.join(DIST_DIR, 'sw.js'),
        path.join(PWA_ROOT_DIR, 'posawesome/public/sw.js')
      );
      console.log('Service worker copied successfully');
    } else {
      console.warn('Warning: sw.js not found in dist directory');
    }
    
    // Copy workbox files if they exist
    const workboxFiles = fs.readdirSync(DIST_DIR)
      .filter(file => file.startsWith('workbox-'));
    
    if (workboxFiles.length > 0) {
      workboxFiles.forEach(file => {
        fs.copyFileSync(
          path.join(DIST_DIR, file),
          path.join(PWA_ROOT_DIR, 'posawesome/public', file)
        );
      });
      console.log('Workbox files copied successfully');
    }
    
    console.log('PWA build completed successfully!');
  } else {
    console.error('Error: Dist directory not found after build');
    process.exit(1);
  }
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
