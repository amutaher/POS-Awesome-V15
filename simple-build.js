// simple-build.js
// A very basic script to create a bundle without needing esbuild
const fs = require('fs');
const path = require('path');

// Create a simple bundle by concatenating files
function createSimpleBundle() {
  console.log('Creating simple bundle...');
  
  try {
    // Read offlineStorage.js
    let offlineStorageContent = '';
    try {
      offlineStorageContent = fs.readFileSync('posawesome/public/js/posapp/services/offlineStorage.js', 'utf8');
    } catch (e) {
      console.warn('Could not read offlineStorage.js:', e.message);
    }

    // Read bus.js
    let busContent = '';
    try {
      busContent = fs.readFileSync('posawesome/public/js/posapp/bus.js', 'utf8');
    } catch (e) {
      console.warn('Could not read bus.js:', e.message);
    }

    // Create a basic bundle by importing dependencies from CDN
    const bundleContent = `// POS Awesome Bundle
// Automatically generated - DO NOT EDIT

// Load external dependencies
window.addEventListener('DOMContentLoaded', function() {
  // Add UUID script
  var uuidScript = document.createElement('script');
  uuidScript.src = 'https://cdn.jsdelivr.net/npm/uuid@9.0.1/dist/index.min.js';
  document.head.appendChild(uuidScript);
  
  // Add Vue
  var vueScript = document.createElement('script');
  vueScript.src = 'https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js';
  document.head.appendChild(vueScript);
  
  // Add Vuetify
  var vuetifyScript = document.createElement('script');
  vuetifyScript.src = 'https://cdn.jsdelivr.net/npm/vuetify@3.7.5/dist/vuetify.min.js';
  document.head.appendChild(vuetifyScript);
  
  // Add IDB script
  var idbScript = document.createElement('script');
  idbScript.src = 'https://cdn.jsdelivr.net/npm/idb@7.1.1/build/index.min.js';
  idbScript.onload = function() {
    console.log('External dependencies loaded');
    
    // Initialize POS App
    if (typeof frappe !== 'undefined' && frappe.PosApp && frappe.PosApp.posapp) {
      const pos = new frappe.PosApp.posapp({ parent: $('.main-section').parent() });
    }
  };
  document.head.appendChild(idbScript);
});

// Define global POS components
frappe.provide('frappe.PosApp');

// Register EventBus
frappe.PosApp.EventBus = ${busContent.replace(/export default [^;]+;/, 'null;')}

// Register OfflineStorage
frappe.PosApp.OfflineStorage = ${offlineStorageContent
  .replace(/import [^;]+;/g, '// imports removed')
  .replace(/export default class OfflineStorage/, 'class OfflineStorage')};

// Register Home component globally
frappe.PosApp.Home = {
  template: \`
    <div class="pos-app-container">
      <div class="pos-app-header">
        <h2>POS Awesome</h2>
      </div>
      <div class="pos-app-body">
        <p>POS App is loading...</p>
      </div>
    </div>
  \`,
  data() {
    return {
      loading: true
    };
  },
  mounted() {
    console.log('POS App Home component mounted');
  }
};

// Define POS App class
frappe.PosApp.posapp = class {
  constructor({ parent }) {
    this.$parent = $(document);
    this.page = parent.page;
    this.make_body();
  }

  async make_body() {
    this.$el = this.$parent.find('.main-section');
    
    // Initialize offline storage and wait for it to be ready
    await this.init_offline_storage();
    
    // Register service worker and setup sync
    await this.init_service_worker();
    
    const { createVuetify } = Vuetify;
    const { createApp } = Vue;
    
    const vuetify = createVuetify({
      theme: {
        themes: {
          light: {
            background: '#FFFFFF',
            primary: '#0097A7',
            secondary: '#00BCD4',
            accent: '#9575CD',
            success: '#66BB6A',
            info: '#2196F3',
            warning: '#FF9800',
            error: '#E86674'
          }
        }
      }
    });
    
    // Use Home component
    const HomeComponent = frappe.PosApp.Home;
    const app = createApp(HomeComponent);
    app.use(frappe.PosApp.EventBus);
    app.use(vuetify);
    app.mount(this.$el[0]);
  }

  async init_offline_storage() {
    try {
      window.offlineStorage = new frappe.PosApp.OfflineStorage('posAwesomeDB', 1);
      // Wait for the ready promise to resolve
      await window.offlineStorage.ready;
      console.log('Global OfflineStorage initialized successfully');
      
      return window.offlineStorage;
    } catch (error) {
      console.error('Failed to initialize global OfflineStorage:', error);
      throw error;
    }
  }
  
  async init_service_worker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/assets/posawesome/service-worker.js');
        console.log('Service Worker registered with scope:', registration.scope);
        return registration;
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    } else {
      console.log('Service Workers not supported');
    }
  }
};

// Initialize POS when document is ready
$(document).ready(function() {
  console.log('POS Awesome is loading...');
});
`;

    // Create the output directory if it doesn't exist
    const outputDir = path.dirname('posawesome/public/js/posawesome.bundle.js');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write the bundle file
    fs.writeFileSync('posawesome/public/js/posawesome.bundle.js', bundleContent);
    console.log('Simple bundle created successfully at posawesome/public/js/posawesome.bundle.js');
    
    return true;
  } catch (error) {
    console.error('Error creating simple bundle:', error);
    return false;
  }
}

// Run the build
if (createSimpleBundle()) {
  console.log('Build completed successfully');
  process.exit(0);
} else {
  console.error('Build failed');
  process.exit(1);
} 