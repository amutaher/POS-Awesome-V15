import './toConsole';
import './posapp/posapp';

// Load UUID library from CDN
document.addEventListener('DOMContentLoaded', function() {
  // Add UUID script
  var uuidScript = document.createElement('script');
  uuidScript.src = 'https://cdn.jsdelivr.net/npm/uuid@9.0.1/dist/index.min.js';
  uuidScript.onload = function() {
    console.log('UUID library loaded successfully');
  };
  document.head.appendChild(uuidScript);
  
  // Add IDB script
  var idbScript = document.createElement('script');
  idbScript.src = 'https://cdn.jsdelivr.net/npm/idb@7.1.1/build/index.min.js';
  idbScript.onload = function() {
    console.log('IDB library loaded successfully');
    
    // After dependencies are loaded, load the POS application
    loadPosApp();
  };
  document.head.appendChild(idbScript);
});

function loadPosApp() {
  // Initialize your POS app
  if (frappe.PosApp && frappe.PosApp.posapp) {
    frappe.provide('frappe.PosApp');
    frappe.PosApp.posapp = frappe.PosApp.posapp;
  } else {
    console.error('POS Awesome app not found');
  }
}
