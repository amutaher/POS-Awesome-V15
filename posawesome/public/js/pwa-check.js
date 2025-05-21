/**
 * PWA Setup Verification Script
 * This script checks if your Progressive Web App (PWA) is configured correctly.
 * Include this in your app for development/testing only.
 */

(function() {
  // Create UI for the checker
  const createCheckerUI = () => {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.bottom = '10px';
    container.style.right = '10px';
    container.style.backgroundColor = '#fff';
    container.style.border = '1px solid #ccc';
    container.style.borderRadius = '5px';
    container.style.padding = '10px';
    container.style.zIndex = '9999';
    container.style.width = '300px';
    container.style.maxHeight = '400px';
    container.style.overflowY = 'auto';
    container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '14px';
    
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '10px';
    
    const title = document.createElement('h3');
    title.style.margin = '0';
    title.style.fontSize = '16px';
    title.style.fontWeight = 'bold';
    title.textContent = 'PWA Configuration Check';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '20px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.color = '#666';
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(container);
    });
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    const content = document.createElement('div');
    content.id = 'pwa-check-content';
    
    container.appendChild(header);
    container.appendChild(content);
    
    document.body.appendChild(container);
    
    return content;
  };
  
  // Format check result
  const formatCheckResult = (name, passed, message) => {
    return `
      <div style="margin-bottom: 8px; padding: 8px; background-color: ${passed ? '#e6ffe6' : '#ffe6e6'}; 
                  border-radius: 3px; border-left: 4px solid ${passed ? '#00cc00' : '#ff3333'};">
        <div style="font-weight: bold; margin-bottom: 3px;">
          ${passed ? '✓' : '✗'} ${name}
        </div>
        <div style="font-size: 12px; color: #666;">
          ${message}
        </div>
      </div>
    `;
  };
  
  // Run all checks
  const runChecks = async () => {
    const container = createCheckerUI();
    let html = '';
    
    // Check 1: Service Worker API
    const serviceWorkerSupported = 'serviceWorker' in navigator;
    html += formatCheckResult(
      'Service Worker API', 
      serviceWorkerSupported,
      serviceWorkerSupported 
        ? 'Service Worker API is supported by this browser.' 
        : 'Service Worker API is not supported. PWA functionality will be limited.'
    );
    
    // Check 2: Service Worker Registration
    let serviceWorkerRegistered = false;
    let swRegistration = null;
    if (serviceWorkerSupported) {
      try {
        swRegistration = await navigator.serviceWorker.getRegistration('/assets/posawesome/service-worker.js');
        serviceWorkerRegistered = !!swRegistration;
      } catch (e) {
        console.error('Error checking service worker registration:', e);
      }
    }
    html += formatCheckResult(
      'Service Worker Registration', 
      serviceWorkerRegistered,
      serviceWorkerRegistered 
        ? `Service Worker is registered with scope: ${swRegistration.scope}` 
        : 'Service Worker is not registered. Check if service-worker.js exists and is being registered correctly.'
    );
    
    // Check 3: Web Manifest
    const manifestLinks = document.querySelectorAll('link[rel="manifest"]');
    const hasManifest = manifestLinks.length > 0;
    html += formatCheckResult(
      'Web Manifest', 
      hasManifest,
      hasManifest 
        ? `Web Manifest found: ${manifestLinks[0].href}` 
        : 'No Web Manifest found. Add a <link rel="manifest"> tag in the head.'
    );
    
    // Check 4: Cache API
    const cacheSupported = 'caches' in window;
    html += formatCheckResult(
      'Cache API', 
      cacheSupported,
      cacheSupported 
        ? 'Cache API is supported by this browser.' 
        : 'Cache API is not supported. Offline functionality will be limited.'
    );
    
    // Check 5: IndexedDB
    const indexedDBSupported = 'indexedDB' in window;
    html += formatCheckResult(
      'IndexedDB', 
      indexedDBSupported,
      indexedDBSupported 
        ? 'IndexedDB is supported by this browser.' 
        : 'IndexedDB is not supported. Offline data storage will not work.'
    );
    
    // Check 6: HTTPS
    const isHttps = window.location.protocol === 'https:';
    html += formatCheckResult(
      'HTTPS', 
      isHttps,
      isHttps 
        ? 'Running on HTTPS which is required for PWA features.' 
        : 'Not running on HTTPS. Many PWA features require a secure context.'
    );
    
    // Check 7: Web App Installability
    let isInstallable = false;
    const checkInstallability = async () => {
      if (!hasManifest || !serviceWorkerRegistered) return false;
      
      // Try to check if the app is installable using BeforeInstallPromptEvent
      window.addEventListener('beforeinstallprompt', (e) => {
        isInstallable = true;
        e.preventDefault();
      });
      
      // Check if app is already installed
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                           window.navigator.standalone || 
                           document.referrer.includes('android-app://');
      
      return isInstallable || isStandalone;
    };
    
    try {
      isInstallable = await checkInstallability();
    } catch (e) {
      console.error('Error checking installability:', e);
    }
    
    html += formatCheckResult(
      'Installability', 
      isInstallable,
      isInstallable 
        ? 'App appears to be installable.' 
        : 'App may not be installable. Check manifest.json and ensure icons are available.'
    );
    
    // Display results
    container.innerHTML = html;
  };
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runChecks);
  } else {
    runChecks();
  }
})(); 